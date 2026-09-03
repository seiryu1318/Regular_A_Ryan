import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const bundledPython = join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');

function run(script, extraEnv = {}) {
  const result = spawnSync(bundledPython, [join(root, 'scripts', script)], {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function readAudit(name) {
  return JSON.parse(readFileSync(join(root, 'audit', name), 'utf8'));
}

run('audit-result-consistency.py');
run('audit-official-results.py', { ADIGA_REFRESH: '1' });
run('apply-adiga-missing-reasons.py');
run('audit-official-methods.py');
run('audit-education-office-sources.py');
run('audit-all-tabs.py');

const consistency = readAudit('result-consistency-summary.json');
const results = readAudit('official-results-summary.json');
const methods = readAudit('official-methods-summary.json');
const education = readAudit('education-office-sources.json');
const allTabs = readAudit('all-tabs-summary.json');

const failures = [];
if (consistency.issues !== 0) failures.push(`입시결과 이상값 ${consistency.issues}건`);
if (results.official_pairs_failed !== 0 || results.download_failed_rows !== 0) failures.push('대학어디가 페이지 수집 실패');
if (results.mismatched_rows !== 0) failures.push(`대학어디가 수치 불일치 ${results.mismatched_rows}건`);
if (methods.needs_review !== 0) failures.push(`대학 공식 모집요강 재검토 ${methods.needs_review}건`);
if (education.sourceFailures.length !== 0) failures.push(`시도교육청 자료 확인 실패 ${education.sourceFailures.length}건`);
if (allTabs.issues !== 0) failures.push(`전체 탭 내용 검사 ${allTabs.issues}건`);

if (failures.length) {
  console.error(`출고 전 데이터 검증 실패: ${failures.join(', ')}`);
  process.exit(1);
}

console.log('출고 전 데이터 검증 통과');
