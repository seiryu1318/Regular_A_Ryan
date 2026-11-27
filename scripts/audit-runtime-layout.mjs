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
const admissionsData = JSON.parse(
  readFileSync(join(root, 'public', 'admissions-data.json'), 'utf8'),
);
const edge =
  process.env.EDGE_PATH ??
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const output = join(root, 'audit', 'runtime-layout-summary.json');
const temp = mkdtempSync(join(tmpdir(), 'regular-ryan-runtime-'));
const screenshots = {
  pcChanges: join(tmpdir(), 'regular-ryan-runtime-pc-changes.png'),
  mobileChanges: join(tmpdir(), 'regular-ryan-runtime-mobile-changes.png'),
  pc: join(tmpdir(), 'regular-ryan-runtime-pc.png'),
  mobile: join(tmpdir(), 'regular-ryan-runtime-mobile.png'),
  pcMethods: join(tmpdir(), 'regular-ryan-runtime-pc-methods.png'),
  mobileMethods: join(tmpdir(), 'regular-ryan-runtime-mobile-methods.png'),
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

async function methodSearchSnapshot(cdp, query) {
  await setSearch(cdp, '대학, 전형, 계열, 모집단위 검색', query);
  return cdp.evaluate(`(() => ({
    query: ${JSON.stringify(query)},
    rows: document.querySelectorAll('.method-row').length,
    primary: [...document.querySelectorAll('.method-row')]
      .map((node) => node.innerText.trim()),
    summary: [...document.querySelectorAll('.method-summary-row')]
      .map((node) => node.innerText.trim()),
  }))()`);
}

async function auditChangeCategories(cdp, initial, screenshot) {
  const categories = ['모집인원 변동', '모집군(모집시기) 변동', '기타 변동'];
  const sections = ['quota', 'timing', 'other'];
  const nationalChanges = admissionsData.nationalChanges;
  const expected = nationalChanges
    ? sections.map((section) =>
        nationalChanges.filter((row) => row.section === section),
      )
    : [
        [2, 20, 42, 68],
        [3, 6, 7, 22, 23, 28, 47, 75, 80],
        [10, 13, 17, 18, 19, 21, 32, 45, 46, 54, 55, 66, 78],
      ].map((ids) => ids.map((id) => ({ id })));
  const expectedCounts = expected.map((rows) => rows.length);
  const placeholder = '대학, 전형, 모집단위 검색';
  const choose = async (label) => {
    const clicked = await cdp.evaluate(`(() => {
      const tabs = [...document.querySelectorAll('.change-category-tabs [role=tab]')];
      const tab = tabs.find((node) => node.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!tab) return false;
      tab.click();
      return true;
    })()`);
    if (!clicked) throw new Error('Missing category tab: ' + label);
    await wait(150);
  };
  const snapshot = () =>
    cdp.evaluate(`(() => {
      const nav = document.querySelector('.change-category-tabs');
      const active = nav?.querySelector('[aria-selected=true]');
      const panel = active && document.getElementById(active.getAttribute('aria-controls'));
      const cards = [...(panel?.querySelectorAll('[data-change-id]') ?? [])];
      const filters = document.querySelector('.changes-filter-panel');
      const labels = [...(filters?.querySelectorAll('.filter-field > span') ?? [])];
      const controls = [...(filters?.querySelectorAll('input, select') ?? [])];
      const filterCentered = labels.length === 2 && controls.length === 3 &&
        labels.every((label) => getComputedStyle(label).textAlign === 'center') &&
        controls.every((control) => {
          const style = getComputedStyle(control);
          return style.textAlign === 'center' &&
            style.paddingInlineStart === style.paddingInlineEnd &&
            (control.tagName !== 'SELECT' || style.textAlignLast === 'center');
        });
      return {
        active: active?.getAttribute('aria-label') ?? '',
        panelVisible: Boolean(panel && !panel.hidden),
        totals: [...(nav?.querySelectorAll('.change-tab-count') ?? [])].map((node) => Number(node.textContent)),
        ids: cards.map((node) => Number(node.dataset.changeId)),
        years: cards.every((card) => [...card.querySelectorAll('h4')].map((year) => year.textContent).join('/') === '2026/2027'),
        evidence: cards.map((card) => ({
          unit: card.querySelector('.change-card-unit')?.textContent.trim(),
          sources: [...card.querySelectorAll('h4 a')].map((link) => link.getAttribute('href')),
        })),
        text: panel?.innerText ?? '',
        width: innerWidth,
        scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
        navFits: Boolean(nav && nav.scrollWidth <= nav.clientWidth + 1),
        filterCentered,
      };
    })()`);
  const start = await snapshot();
  const all = [];
  const toggle = async (label) => {
    const clicked = await cdp.evaluate(`(() => {
      const panel = document.querySelector('.change-section-panel:not([hidden])');
      const button = [...(panel?.querySelectorAll('button') ?? [])].find((node) => node.textContent.trim() === ${JSON.stringify(label)});
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (clicked) await wait(100);
    return clicked;
  };
  for (const [i, label] of categories.entries()) {
    await choose(label);
    const first = await snapshot();
    const expanded = await toggle('펼치기');
    const second = expanded ? await snapshot() : first;
    const collapsed = expanded && (await toggle('접기'));
    const restored = collapsed ? await snapshot() : first;
    const byId = new Map(expected[i].map((row) => [row.id, row]));
    const secondMatches = second.ids.every((id, index) => {
      const row = byId.get(id);
      if (!row || !nationalChanges) return Boolean(row);
      const evidence = second.evidence[index];
      return (
        evidence.unit === [row.exam, row.department].join(' · ') &&
        evidence.sources.join('\n') ===
          [row.sources?.previous, row.sources?.current].join('\n')
      );
    });
    all.push({
      first,
      second,
      passes:
        first.active === label &&
        first.ids.length === Math.min(expectedCounts[i], initial) &&
        expanded === expectedCounts[i] > initial &&
        collapsed === expanded &&
        second.ids.length === Math.min(expectedCounts[i], initial * 2) &&
        new Set(second.ids).size === second.ids.length &&
        secondMatches &&
        first.ids.join() === restored.ids.join() &&
        [first, second].every(
          (entry) =>
            entry.years &&
            entry.panelVisible &&
            entry.navFits &&
            entry.filterCentered &&
            entry.scrollWidth <= entry.width + 1,
        ),
    });
  }
  const sampleIndex = all[1].first.ids.length
    ? 1
    : all.findIndex(({ first }) => first.ids.length);
  let searchPasses = false;
  if (sampleIndex !== -1) {
    const sampleId = all[sampleIndex].first.ids[0];
    const sample = expected[sampleIndex].find((row) => row.id === sampleId);
    if (sample) {
      const query = nationalChanges
        ? [sample.u, sample.exam, sample.department].join(' ')
        : '경희대 국제학과';
      await choose(categories[(sampleIndex + 1) % categories.length]);
      await setSearch(cdp, placeholder, query);
      const beforeSwitch = await snapshot();
      await choose(categories[sampleIndex]);
      const afterSwitch = await snapshot();
      searchPasses =
        beforeSwitch.totals.join() === afterSwitch.totals.join() &&
        afterSwitch.ids.includes(nationalChanges ? sampleId : 7);
      await setSearch(cdp, placeholder, '');
    }
  }
  await capture(cdp, screenshot);
  await choose(categories[0]);
  return {
    initial: start.ids.length,
    totals: start.totals,
    filterCentered: start.filterCentered,
    groups: all.map(({ first, second }) => ({
      active: first.active,
      initial: first.ids.length,
      expanded: second.ids.length,
    })),
    passes:
      start.active === categories[0] &&
      start.totals.join() === expectedCounts.join() &&
      (!nationalChanges ||
        (await cdp.evaluate(
          "document.querySelector('.change-workspace')?.textContent.includes('공식 모집요강과 대조해 확인한 항목') ?? false",
        ))) &&
      all.every(({ passes }) => passes) &&
      searchPasses,
  };
}

async function expandedMethodSnapshot(cdp, query) {
  const snapshot = await methodSearchSnapshot(cdp, query);
  await cdp.evaluate(`(() => {
    document.querySelector('.method-row .expand-method-button')?.click();
  })()`);
  await wait(250);
  return {
    ...snapshot,
    detail: await cdp.evaluate(
      `document.querySelector('.method-detail-row')?.innerText.trim() ?? ''`,
    ),
  };
}

async function limitedMetricSnapshot(cdp, query) {
  await setSearch(cdp, '대학, 전형, 계열, 모집단위 검색', query);
  return cdp.evaluate(`(() => {
    const row = document.querySelector('.method-row');
    const summary = document.querySelector('.method-summary-row');
    return {
      rows: document.querySelectorAll('.method-row').length,
      rowMarked: row?.classList.contains('method-non-score-row') ?? false,
      summaryMarked: summary?.classList.contains('method-non-score-row') ?? false,
      rowBackground: row ? getComputedStyle(row.firstElementChild).backgroundColor : '',
      summaryBackground: summary ? getComputedStyle(summary.firstElementChild).backgroundColor : '',
    };
  })()`);
}

async function auditBrandHomeNavigation(cdp, clickValue, enterValue) {
  const placeholder = '대학, 모집단위, 전형명 검색';
  const originalValue = await cdp.evaluate(`(() => {
    const input = [...document.querySelectorAll('input')]
      .find((node) => node.placeholder === ${JSON.stringify('대학, 모집단위, 전형명 검색')});
    return input?.value ?? '';
  })()`);
  const control = await cdp.evaluate(`(() => {
    const node = document.querySelector('[data-home-control]');
    return {
      tag: node?.tagName ?? '',
      href: node?.href ?? '',
      label: node?.getAttribute('aria-label') ?? '',
      hasLogo: Boolean(node?.querySelector('.brand-logo')),
      hasTitle: node?.textContent?.includes('라이언의 2027 정시모집') ?? false,
    };
  })()`);

  await setSearch(cdp, placeholder, clickValue);
  const clickBefore = await cdp.evaluate(`(() => {
    window.__brandHomeAuditMarker = 'click-state-preserved';
    return { url: location.href, marker: window.__brandHomeAuditMarker };
  })()`);
  const clicked = await cdp.evaluate(`(() => {
    const node = document.querySelector('[data-home-control]');
    if (!node) return false;
    node.click();
    return true;
  })()`);
  await wait(250);
  const clickHome = await cdp.evaluate(`(() => ({
    tab: document.querySelector('.workspace > .tabs-list [role=tab][aria-selected=true]')?.textContent?.trim() ?? '',
    url: location.href,
    marker: window.__brandHomeAuditMarker ?? '',
  }))()`);
  await clickText(cdp, '3개년 입시결과');
  const clickValueAfter = await cdp.evaluate(`(() => {
    const input = [...document.querySelectorAll('input')]
      .find((node) => node.placeholder === ${JSON.stringify('대학, 모집단위, 전형명 검색')});
    return input?.value ?? '';
  })()`);

  await setSearch(cdp, placeholder, enterValue);
  const enterBefore = await cdp.evaluate(`(() => {
    const node = document.querySelector('[data-home-control]');
    if (!node) return { focused: false, url: location.href, marker: '' };
    window.__brandHomeAuditMarker = 'enter-state-preserved';
    node.focus();
    return {
      focused: document.activeElement === node,
      url: location.href,
      marker: window.__brandHomeAuditMarker,
    };
  })()`);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await wait(250);
  const enterHome = await cdp.evaluate(`(() => ({
    tab: document.querySelector('.workspace > .tabs-list [role=tab][aria-selected=true]')?.textContent?.trim() ?? '',
    url: location.href,
    marker: window.__brandHomeAuditMarker ?? '',
  }))()`);
  await clickText(cdp, '3개년 입시결과');
  const enterValueAfter = await cdp.evaluate(`(() => {
    const input = [...document.querySelectorAll('input')]
      .find((node) => node.placeholder === ${JSON.stringify('대학, 모집단위, 전형명 검색')});
    return input?.value ?? '';
  })()`);
  await setSearch(cdp, placeholder, originalValue);
  const restoredValue = await cdp.evaluate(`(() => {
    const input = [...document.querySelectorAll('input')]
      .find((node) => node.placeholder === ${JSON.stringify('대학, 모집단위, 전형명 검색')});
    return input?.value ?? '';
  })()`);

  return {
    control,
    clicked,
    clickHomeTab: clickHome.tab,
    clickStatePreserved: clickValueAfter === clickValue,
    clickUrlUnchanged: clickHome.url === clickBefore.url,
    clickMarkerPreserved: clickHome.marker === clickBefore.marker,
    enterFocused: enterBefore.focused,
    enterHomeTab: enterHome.tab,
    enterStatePreserved: enterValueAfter === enterValue,
    enterUrlUnchanged: enterHome.url === enterBefore.url,
    enterMarkerPreserved: enterHome.marker === enterBefore.marker,
    originalValueRestored: restoredValue === originalValue,
  };
}

function brandHomePassed(result, hrefFragment) {
  return (
    result.control.tag === 'A' &&
    result.control.href.includes(hrefFragment) &&
    result.control.label === '라이언의 2027 정시모집 홈으로 이동' &&
    result.control.hasLogo &&
    result.control.hasTitle &&
    result.clicked &&
    result.clickHomeTab === '2027 변동사항' &&
    result.clickStatePreserved &&
    result.clickUrlUnchanged &&
    result.clickMarkerPreserved &&
    result.enterFocused &&
    result.enterHomeTab === '2027 변동사항' &&
    result.enterStatePreserved &&
    result.enterUrlUnchanged &&
    result.enterMarkerPreserved &&
    result.originalValueRestored
  );
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
    nav: [...document.querySelectorAll('.workspace > .tabs-list [role=tab]')].map((node) => node.textContent.trim()),
    mobileLink: [...document.querySelectorAll('a')].find((node) => node.textContent.includes('모바일 버전'))?.href ?? '',
    portalLink: [...document.querySelectorAll('a')].find((node) => node.textContent.includes('라이언의 대입포털로 돌아가기'))?.href ?? '',
    headerAligns: [...document.querySelectorAll('thead th')].map((node) => getComputedStyle(node).textAlign),
    changeSummaryClosed: !document.querySelector('.change-summary-disclosure')?.open,
  }))()`);
  const pcChanges = await auditChangeCategories(cdp, 10, screenshots.pcChanges);
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
  const pcSplitRows = {};
  for (const query of [
    '경희대 한의예과',
    '성신여대 간호학과',
    '가천대 금융빅데이터학부',
    '가천대 의예과',
    '가천대 한의예과',
    '대구한의대 한의예과',
    '동국대(WISE) 한의예과',
    '동의대 한의예과',
    '상지대 한의예과',
    '동신대 한의예과',
    '원광대 한의예과',
    '호원대 간호학과',
    '호원대 경영학과',
    '삼육대 환경디자인원예학과',
  ])
    pcSplitRows[query] = await methodSearchSnapshot(cdp, query);
  await setSearch(cdp, '대학, 전형, 계열, 모집단위 검색', '');
  const pcAnalysisText = await cdp.evaluate(
    `document.querySelector('.analysis-disclosure')?.textContent ?? ''`,
  );
  const pcUpdatedReferences = {
    silla: await methodSearchSnapshot(cdp, '신라대'),
    dankookMedical: await expandedMethodSnapshot(cdp, '단국대(천안) 의예과'),
    gradeOnly: await limitedMetricSnapshot(cdp, '대전신학대'),
    blankIndicator: await limitedMetricSnapshot(cdp, 'POSTECH'),
  };
  await capture(cdp, screenshots.pcMethods);
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
  const pcBrandHome = await auditBrandHomeNavigation(cdp, '가천대', '간호학');
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
  const mobileChanges = await auditChangeCategories(
    cdp,
    5,
    screenshots.mobileChanges,
  );
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 760,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await wait(100);
  const narrowChangeFilters = await cdp.evaluate(`(() => {
    const [search, university, sort] = [...document.querySelectorAll('.changes-filter-panel input, .changes-filter-panel select')];
    const boxes = [search, university, sort].filter(Boolean).map((control) => control.getBoundingClientRect());
    return boxes.length === 3 && boxes.every((box) => box.left >= 0 && box.right <= innerWidth + 1) &&
      boxes[0].bottom <= boxes[1].top && boxes[1].bottom <= boxes[2].top &&
      document.documentElement.scrollWidth <= innerWidth + 1;
  })()`);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  mobileChanges.narrowFiltersPass = narrowChangeFilters;
  mobileChanges.passes &&= narrowChangeFilters;
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
  const mobileSplitRows = {};
  for (const query of [
    '성신여대 간호학과',
    '가천대 한의예과',
    '호원대 간호학과',
  ])
    mobileSplitRows[query] = await methodSearchSnapshot(cdp, query);
  const mobileLimitedMetric = await limitedMetricSnapshot(cdp, '대전신학대');
  await capture(cdp, screenshots.mobileMethods);
  const mobileUpdatedReferences = {
    silla: await methodSearchSnapshot(cdp, '신라대'),
    dankookMedical: await expandedMethodSnapshot(cdp, '단국대(천안) 의예과'),
  };
  await setSearch(cdp, '대학, 전형, 계열, 모집단위 검색', '간호학');
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
  const mobileBrandHome = await auditBrandHomeNavigation(
    cdp,
    '가천대',
    '간호학',
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
  const splitExpectations = [
    ['경희대 한의예과', 2, ['한의예과(인문)', '한의예과(자연)', '35%', '40%']],
    [
      '성신여대 간호학과',
      2,
      ['간호학과(인문)', '간호학과(자연)', '20%', '30%'],
    ],
    ['가천대 금융빅데이터학부', 2, ['일반전형1', '일반전형2', '(40% / 30%)']],
    ['가천대 의예과', 1, ['의예과', '25%', '30%']],
    ['가천대 한의예과', 1, ['한의예과', '25%', '30%']],
    ['대구한의대 한의예과', 2, ['한의예과(인문)', '한의예과(자연)']],
    ['동국대(WISE) 한의예과', 2, ['한의예과(유형1)', '한의예과(유형2)']],
    ['동의대 한의예과', 2, ['한의예과(미적분/기하)', '한의예과(확률과통계)']],
    ['상지대 한의예과', 2, ['한의예과(A형)', '한의예과(B형)']],
    ['동신대 한의예과', 1, ['한의예과', '25%']],
    [
      '원광대 한의예과',
      2,
      ['한의예과(인문)', '한의예과(자연)', '32.43%', '27.03%'],
    ],
    ['호원대 간호학과', 1, ['간호학과', '(50%)']],
    ['호원대 경영학과', 1, ['경영학과', '(50%)']],
    ['삼육대 환경디자인원예학과', 1, ['자연', '(35% / 25% / 25% / 15%)']],
  ];
  for (const [query, expectedRows, requiredText] of splitExpectations) {
    const snapshot = pcSplitRows[query];
    const text = [
      ...(snapshot?.primary ?? []),
      ...(snapshot?.summary ?? []),
    ].join(' ');
    if (!snapshot || snapshot.rows !== expectedRows)
      issues.push(`PC split search mismatch: ${String(query)}`);
    else if (!requiredText.every((token) => text.includes(token)))
      issues.push(`PC split search detail mismatch: ${String(query)}`);
  }
  for (const query of [
    '성신여대 간호학과',
    '가천대 한의예과',
    '호원대 간호학과',
  ]) {
    if (mobileSplitRows[query]?.rows !== pcSplitRows[query]?.rows)
      issues.push(`Mobile split search mismatch: ${query}`);
  }
  if (!pcAnalysisText.replaceAll(/\s/g, '').includes('반영유형438'))
    issues.push(`2027 reference row count mismatch: ${pcAnalysisText}`);
  if (pcUpdatedReferences.blankIndicator.rows !== 1)
    issues.push('POSTECH reference should appear once');
  for (const [device, { silla, dankookMedical }] of Object.entries({
    PC: pcUpdatedReferences,
    Mobile: mobileUpdatedReferences,
  })) {
    const sillaTokens = ['국어25%', '수학25%', '영어25%', '탐구2—', '탐구125%'];
    if (
      !silla.rows ||
      !silla.summary.every((summary) =>
        sillaTokens.every((token) =>
          summary.replaceAll(/\s/g, '').includes(token),
        ),
      )
    )
      issues.push(`${device} Silla 2027 ratio or inquiry-count mismatch`);
    const dankookText = [...dankookMedical.summary, dankookMedical.detail]
      .join(' ')
      .replaceAll(/\s/g, '');
    if (
      dankookMedical.rows !== 1 ||
      ![
        '국어25%',
        '수학35%',
        '영어15%',
        '탐구225%',
        '과탐Ⅱ5%',
        '미적/기하',
        '활용지표백분위,표준점수',
      ].every((token) => dankookText.includes(token))
    )
      issues.push(`${device} Dankook Cheonan medical 2027 method mismatch`);
  }
  for (const [label, snapshot] of Object.entries({
    gradeOnly: pcUpdatedReferences.gradeOnly,
    blankIndicator: pcUpdatedReferences.blankIndicator,
  })) {
    if (
      !snapshot.rows ||
      !snapshot.rowMarked ||
      !snapshot.summaryMarked ||
      snapshot.rowBackground !== 'rgb(244, 239, 251)' ||
      snapshot.summaryBackground !== 'rgb(244, 239, 251)'
    )
      issues.push(`Limited-metric row styling mismatch: ${label}`);
  }
  if (
    !mobileLimitedMetric.rows ||
    !mobileLimitedMetric.rowMarked ||
    !mobileLimitedMetric.summaryMarked ||
    mobileLimitedMetric.rowBackground !== 'rgb(244, 239, 251)' ||
    mobileLimitedMetric.summaryBackground !== 'rgb(244, 239, 251)'
  )
    issues.push('Mobile limited-metric row styling mismatch');
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
  if (!brandHomePassed(pcBrandHome, 'Regular_A_Ryan/'))
    issues.push('PC brand home navigation mismatch');
  if (!brandHomePassed(mobileBrandHome, 'Regular_A_RyanM/'))
    issues.push('Mobile brand home navigation mismatch');
  if (!pc.changeSummaryClosed || !mobile.changeSummaryClosed)
    issues.push('Change summary is open by default');
  if (!pcChanges.passes || !mobileChanges.passes)
    issues.push('Change tabs category, layout or search mismatch');

  report = {
    pc,
    responsivePc,
    pcChanges,
    mobileChanges,
    mobile,
    initialPcRows,
    initialMobileRows,
    initialPcScoreRows,
    initialMobileScoreRows,
    nursing,
    mobileNursingRows,
    pcSplitRows,
    mobileSplitRows,
    mobileLimitedMetric,
    mobileUpdatedReferences,
    pcAnalysisText,
    pcUpdatedReferences,
    centralMedicine,
    flexibleTracks,
    pcResults,
    mobileResults,
    pcBrandHome,
    mobileBrandHome,
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
  server.closeAllConnections?.();
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
