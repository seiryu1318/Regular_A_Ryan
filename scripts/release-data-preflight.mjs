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

run('sync-regular-2027-reference.py');
run('audit-regular-2027-reference.py');
run('audit-adiga-2027-methods.py', { ADIGA_2027_REFRESH: '1' });
run('audit-official-results.py', { ADIGA_REFRESH: '1' });
run('apply-adiga-result-values.py');
run('audit-official-results.py');
run('apply-verified-conversion-maxima.py');
run('apply-adiga-missing-reasons.py');
run('audit-result-consistency.py');
run('audit-education-office-sources.py');
run('audit-all-tabs.py');

const consistency = readAudit('result-consistency-summary.json');
const results = readAudit('official-results-summary.json');
const reference2027 = readAudit('regular-2027-reference-summary.json');
const methods2027 = readAudit('adiga-2027-methods-summary.json');
const education = readAudit('education-office-sources.json');
const allTabs = readAudit('all-tabs-summary.json');

const failures = [];
if (consistency.issues !== 0) failures.push(`입시결과 이상값 ${consistency.issues}건`);
if (results.official_pairs_failed !== 0 || results.download_failed_rows !== 0) failures.push('대학어디가 페이지 수집 실패');
if (results.mismatched_rows !== 0) failures.push(`대학어디가 수치 불일치 ${results.mismatched_rows}건`);
if (reference2027.issues !== 0) failures.push(`2027 정시 기준 시트 불일치 ${reference2027.issues}건`);
if (methods2027.download_failures !== 0 || methods2027.needs_review !== 0) failures.push('대학어디가 2027 수능위주전형 확인 실패');
if (education.sourceFailures.length !== 0) failures.push(`시도교육청 자료 확인 실패 ${education.sourceFailures.length}건`);
if (allTabs.issues !== 0) failures.push(`전체 탭 내용 검사 ${allTabs.issues}건`);

if (failures.length) {
  console.error(`출고 전 데이터 검증 실패: ${failures.join(', ')}`);
  process.exit(1);
}

console.log('출고 전 데이터 검증 통과');
