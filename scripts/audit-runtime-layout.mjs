import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const root = process.cwd();
const edge =
  process.env.EDGE_PATH ??
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const output = join(root, 'audit', 'runtime-layout-summary.json');
const temp = mkdtempSync(join(tmpdir(), 'regular-ryan-runtime-'));
const screenshots = {
  pc: join(tmpdir(), 'regular-ryan-runtime-pc.png'),
  mobile: join(tmpdir(), 'regular-ryan-runtime-mobile.png'),
};
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen(server.address().port));
  });
}

function close(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function waitForJson(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await wait(100);
  }
  throw new Error(`DevTools endpoint unavailable: ${url}`);
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.ready = new Promise((resolveReady, reject) => {
      this.socket.addEventListener('open', resolveReady, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = (this.sequence += 1);
    const result = new Promise((resolveResult, reject) => {
      this.pending.set(id, { resolve: resolveResult, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.text ?? 'Runtime evaluation failed',
      );
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitForApp(cdp, text) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await cdp.evaluate(
      `document.readyState === 'complete' && document.body.innerText.includes(${JSON.stringify(text)})`,
    );
    if (ready) return;
    await wait(100);
  }
  throw new Error(`App text unavailable: ${text}`);
}

async function clickText(cdp, label) {
  const clicked = await cdp.evaluate(`(() => {
    const element = [...document.querySelectorAll('button,a')]
      .find((node) => node.textContent.trim() === ${JSON.stringify(label)});
    if (!element) return false;
    element.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Control not found: ${label}`);
  await wait(250);
}

async function setSearch(cdp, placeholder, value) {
  const changed = await cdp.evaluate(`(() => {
    const input = [...document.querySelectorAll('input')]
      .find((node) => node.placeholder === ${JSON.stringify(placeholder)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!changed) throw new Error(`Search field not found: ${placeholder}`);
  await wait(350);
}

async function capture(cdp, path) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  writeFileSync(path, Buffer.from(result.data, 'base64'));
}

const server = createServer((request, response) => {
  try {
    const requested = decodeURIComponent(
      new URL(request.url, 'http://127.0.0.1').pathname,
    );
    const relative = requested === '/' ? '/index.html' : requested;
    const candidate = resolve(root, `.${relative}`);
    if (!candidate.startsWith(resolve(root))) throw new Error('Invalid path');
    const path = statSync(candidate).isDirectory()
      ? join(candidate, 'index.html')
      : candidate;
    response.writeHead(200, {
      'Content-Type':
        mime[extname(path).toLowerCase()] ?? 'application/octet-stream',
    });
    response.end(readFileSync(path));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

let browser;
let cdp;
let report;
try {
  const webPort = await listen(server);
  const probe = createServer();
  const debugPort = await listen(probe);
  await close(probe);
  const pcUrl = `http://127.0.0.1:${webPort}/index.html`;
  browser = spawn(
    edge,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${debugPort}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${temp}`,
      '--window-size=1440,1000',
      pcUrl,
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('Page target unavailable');
  cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await waitForApp(cdp, '라이언의 2027 정시모집');

  const pc = await cdp.evaluate(`(() => ({
    title: document.title,
    width: innerWidth,
    scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
    nav: [...document.querySelectorAll('[role=tab]')].map((node) => node.textContent.trim()),
    mobileLink: [...document.querySelectorAll('a')].find((node) => node.textContent.includes('모바일 버전'))?.href ?? '',
    portalLink: [...document.querySelectorAll('a')].find((node) => node.textContent.includes('라이언의 대입포털로 돌아가기'))?.href ?? '',
    headerAligns: [...document.querySelectorAll('thead th')].map((node) => getComputedStyle(node).textAlign),
    changeSummaryClosed: !document.querySelector('.change-summary-disclosure')?.open,
  }))()`);
  await clickText(cdp, '2027 반영방법');
  const initialPcRows = await cdp.evaluate(
    `document.querySelectorAll('.method-row').length`,
  );
  const simplifiedPc = await cdp.evaluate(`(() => ({
    advancedFiltersClosed: !document.querySelector('.filter-more')?.open,
    analysisClosed: !document.querySelector('.analysis-disclosure')?.open,
    toolsClosed: !document.querySelector('.header-tools-menu')?.open,
    detailRows: document.querySelectorAll('.method-detail-row').length,
    maxSummaryCells: Math.max(0, ...[...document.querySelectorAll('.method-summary-grid')]
      .map((node) => node.children.length)),
  }))()`);
  await setSearch(cdp, '대학, 전형, 계열, 모집단위 검색', '간호학');
  const nursing = await cdp.evaluate(`(() => ({
    rows: document.querySelectorAll('.method-row').length,
    departments: [...document.querySelectorAll('.method-department-cell > span')]
      .map((node) => node.textContent.trim()),
  }))()`);
  await setSearch(cdp, '대학, 전형, 계열, 모집단위 검색', '중앙대 의학부');
  const centralMedicine = await cdp.evaluate(`(() => ({
    rows: document.querySelectorAll('.method-row').length,
    text: [...document.querySelectorAll('.method-row,.method-summary-row')]
      .slice(0, 2).map((node) => node.innerText.trim()),
  }))()`);
  await setSearch(cdp, '대학, 전형, 계열, 모집단위 검색', '자유전공학부');
  const flexibleTracks = await cdp.evaluate(
    `[...document.querySelectorAll('.method-row .track-cell')].map((node) => node.textContent.trim())`,
  );
  const pcForecastTermsInMethods = await cdp.evaluate(
    `document.body.innerText.includes('2027 예상 백분위컷') || document.body.innerText.includes('2027 예상컷')`,
  );
  await clickText(cdp, '3개년 입시결과');
  const initialPcScoreRows = await cdp.evaluate(
    `document.querySelectorAll('.result-primary').length`,
  );
  const pcResults = await cdp.evaluate(`(() => ({
    labels: [...document.querySelectorAll('.result-summary-grid')]
      .flatMap((node) => [...node.children].map((child) => child.firstElementChild?.textContent?.trim() ?? '')),
    detailRows: document.querySelectorAll('.result-detail-row').length,
    filterClosed: !document.querySelector('.results-filter-panel .filter-more')?.open,
    filterText: document.querySelector('.results-filter-panel .filter-more')?.textContent ?? '',
  }))()`);
  const pcForecastTermsInResults = await cdp.evaluate(
    `document.body.innerText.includes('2027 예상 백분위컷') || document.body.innerText.includes('2027 예상컷')`,
  );
  await capture(cdp, screenshots.pc);

  const responsivePc = [];
  for (const width of [1200, 1024, 960, 768]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await wait(100);
    responsivePc.push(
      await cdp.evaluate(`(() => ({
        width: innerWidth,
        scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      }))()`),
    );
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const mobileUrl = `http://127.0.0.1:${webPort}/mobile/index.html`;
  await cdp.send('Page.navigate', { url: mobileUrl });
  await waitForApp(cdp, '라이언의 2027 정시모집');
  const mobile = await cdp.evaluate(`(() => ({
    title: document.title,
    width: innerWidth,
    scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
    pcLink: [...document.querySelectorAll('a')].find((node) => node.textContent.trim() === 'PC 버전')?.href ?? '',
    portalLink: [...document.querySelectorAll('a')].find((node) => node.textContent.includes('라이언의 대입포털로 돌아가기'))?.href ?? '',
    searchFontSizes: [...document.querySelectorAll('input[type=search],input[placeholder]')]
      .map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
    changeSummaryClosed: !document.querySelector('.change-summary-disclosure')?.open,
  }))()`);
  await clickText(cdp, '2027 반영방법');
  const initialMobileRows = await cdp.evaluate(
    `document.querySelectorAll('.method-row').length`,
  );
  await setSearch(cdp, '대학, 전형, 계열, 모집단위 검색', '간호학');
  const mobileNursingRows = await cdp.evaluate(
    `document.querySelectorAll('.method-row').length`,
  );
  const simplifiedMobile = await cdp.evaluate(`(() => ({
    advancedFiltersClosed: !document.querySelector('.filter-more')?.open,
    analysisClosed: !document.querySelector('.analysis-disclosure')?.open,
    toolsClosed: !document.querySelector('.header-tools-menu')?.open,
    detailRows: document.querySelectorAll('.method-detail-row').length,
    maxSummaryCells: Math.max(0, ...[...document.querySelectorAll('.method-summary-grid')]
      .map((node) => node.children.length)),
  }))()`);
  const mobileForecastTermsInMethods = await cdp.evaluate(
    `document.body.innerText.includes('2027 예상 백분위컷') || document.body.innerText.includes('2027 예상컷')`,
  );
  await clickText(cdp, '3개년 입시결과');
  const initialMobileScoreRows = await cdp.evaluate(
    `document.querySelectorAll('.result-primary').length`,
  );
  const mobileResults = await cdp.evaluate(`(() => ({
    labels: [...document.querySelectorAll('.result-summary-grid')]
      .flatMap((node) => [...node.children].map((child) => child.firstElementChild?.textContent?.trim() ?? '')),
    detailRows: document.querySelectorAll('.result-detail-row').length,
    filterClosed: !document.querySelector('.results-filter-panel .filter-more')?.open,
    filterText: document.querySelector('.results-filter-panel .filter-more')?.textContent ?? '',
  }))()`);
  const mobileForecastTermsInResults = await cdp.evaluate(
    `document.body.innerText.includes('2027 예상 백분위컷') || document.body.innerText.includes('2027 예상컷')`,
  );
  await capture(cdp, screenshots.mobile);

  const issues = [];
  if (pc.scrollWidth > pc.width + 1) issues.push('PC horizontal overflow');
  if (responsivePc.some((view) => view.scrollWidth > view.width + 1))
    issues.push('Responsive PC horizontal overflow');
  if (mobile.scrollWidth > mobile.width + 1)
    issues.push('Mobile horizontal overflow');
  if (initialPcRows < 1 || initialPcRows > 10)
    issues.push(`PC initial rows ${initialPcRows}`);
  if (initialMobileRows < 1 || initialMobileRows > 5)
    issues.push(`Mobile initial rows ${initialMobileRows}`);
  if (initialPcScoreRows < 1 || initialPcScoreRows > 10)
    issues.push(`PC initial result rows ${initialPcScoreRows}`);
  if (initialMobileScoreRows < 1 || initialMobileScoreRows > 5)
    issues.push(`Mobile initial result rows ${initialMobileScoreRows}`);
  if (
    !nursing.rows ||
    nursing.departments.some((name) => !name.includes('간호'))
  )
    issues.push('Nursing search includes unrelated department');
  if (!mobileNursingRows) issues.push('Mobile nursing search empty');
  if (
    !simplifiedPc.advancedFiltersClosed ||
    !simplifiedPc.analysisClosed ||
    !simplifiedPc.toolsClosed
  )
    issues.push('PC secondary controls are open by default');
  if (
    !simplifiedMobile.advancedFiltersClosed ||
    !simplifiedMobile.analysisClosed ||
    !simplifiedMobile.toolsClosed
  )
    issues.push('Mobile secondary controls are open by default');
  if (simplifiedPc.detailRows || pcResults.detailRows)
    issues.push('PC row details are open by default');
  if (simplifiedMobile.detailRows || mobileResults.detailRows)
    issues.push('Mobile row details are open by default');
  if (simplifiedPc.maxSummaryCells > 6 || simplifiedMobile.maxSummaryCells > 6)
    issues.push('Method summary exposes more than 6 values');
  const requiredResultLabels = [
    '백분위 50%',
    '백분위 70%',
    '환산 50%',
    '환산 70%',
  ];
  if (!requiredResultLabels.every((label) => pcResults.labels.includes(label)))
    issues.push('PC historical result labels missing');
  if (
    !requiredResultLabels.every((label) => mobileResults.labels.includes(label))
  )
    issues.push('Mobile historical result labels missing');
  const requiredResultFilters = [
    '모집군',
    '백분위 범위',
    '표준점수 범위',
    '환산점수 범위',
  ];
  if (
    !pcResults.filterClosed ||
    !requiredResultFilters.every((label) =>
      pcResults.filterText.includes(label),
    )
  )
    issues.push('PC historical result filters mismatch');
  if (
    !mobileResults.filterClosed ||
    !requiredResultFilters.every((label) =>
      mobileResults.filterText.includes(label),
    )
  )
    issues.push('Mobile historical result filters mismatch');
  if (pcForecastTermsInMethods || pcForecastTermsInResults)
    issues.push('PC forecast cutoff text remains');
  if (mobileForecastTermsInMethods || mobileForecastTermsInResults)
    issues.push('Mobile forecast cutoff text remains');
  if (
    centralMedicine.rows &&
    !centralMedicine.text.join(' ').includes('의약학')
  )
    issues.push('Central medicine track mismatch');
  if (mobile.searchFontSizes.some((size) => size < 16))
    issues.push('Mobile search font below 16px');
  if (!pc.nav.includes('일정') || !pc.nav.includes('2027 변동사항'))
    issues.push('Navigation labels missing');
  if (!pc.mobileLink.includes('Regular_A_RyanM'))
    issues.push('PC mobile link mismatch');
  if (!mobile.pcLink.includes('Regular_A_Ryan'))
    issues.push('Mobile PC link mismatch');
  if (!pc.portalLink || !mobile.portalLink) issues.push('Portal link missing');
  if (!pc.changeSummaryClosed || !mobile.changeSummaryClosed)
    issues.push('Change summary is open by default');

  report = {
    pc,
    responsivePc,
    mobile,
    initialPcRows,
    initialMobileRows,
    initialPcScoreRows,
    initialMobileScoreRows,
    nursing,
    mobileNursingRows,
    centralMedicine,
    flexibleTracks,
    pcResults,
    mobileResults,
    simplifiedPc,
    simplifiedMobile,
    screenshots,
    issues,
  };
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (issues.length) process.exitCode = 1;
} finally {
  cdp?.close();
  browser?.kill();
  await close(server);
  await wait(250);
  try {
    rmSync(temp, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  } catch {}
}
