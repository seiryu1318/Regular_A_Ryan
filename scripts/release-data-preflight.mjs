import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const bundledPython = join(
  homedir(),
  '.cache',
  'codex-runtimes',
  'codex-primary-runtime',
  'dependencies',
  'python',
  'python.exe',
);

function run(script, extraEnv = {}, args = []) {
  const result = spawnSync(
    bundledPython,
    [join(root, 'scripts', script), ...args],
    {
      cwd: root,
      env: { ...process.env, ...extraEnv },
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function readAudit(name) {
  return JSON.parse(readFileSync(join(root, 'audit', name), 'utf8'));
}

function readAdmissionsData() {
  return JSON.parse(
    readFileSync(join(root, 'public', 'admissions-data.json'), 'utf8'),
  );
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

run('sync-regular-2027-reference.py');
run('audit-regular-2027-reference.py');
run('audit-adiga-2027-methods.py', { ADIGA_2027_REFRESH: '1' });
run('audit-official-results.py', { ADIGA_REFRESH: '1' });
run('apply-adiga-result-values.py');
run('apply-placeholder-cleanup.py');
run('deduplicate-score-rows.py');
run('audit-official-results.py');
run('apply-verified-conversion-maxima.py');
run('apply-adiga-missing-reasons.py');
run('apply-track-corrections.py');
run('sync-historical-methods.py', { ADIGA_HISTORICAL_REFRESH: '1' });
run('audit-historical-methods.py');
run('audit-result-consistency.py');
run('audit-education-office-sources.py');
run('sync-gyeonggi-2027-sources.py', {}, ['--skip-official-text']);
run('audit-gyeonggi-2027-sources.py');
const cutoffSyncBefore = readAdmissionsData();
const cutoffScoresHashBefore = hashJson(cutoffSyncBefore.scores);
const cutoffUnitsHashBefore = hashJson(cutoffSyncBefore.units2027);
run('sync-ipsihogu-2027-cutoffs.py');
const cutoffSyncAfter = readAdmissionsData();
const cutoffScoresUnchanged =
  cutoffScoresHashBefore === hashJson(cutoffSyncAfter.scores);
const cutoffUnitsUnchanged =
  cutoffUnitsHashBefore === hashJson(cutoffSyncAfter.units2027);
run('audit-all-tabs.py');

const consistency = readAudit('result-consistency-summary.json');
const results = readAudit('official-results-summary.json');
const reference2027 = readAudit('regular-2027-reference-summary.json');
const methods2027 = readAudit('adiga-2027-methods-summary.json');
const education = readAudit('education-office-sources.json');
const allTabs = readAudit('all-tabs-summary.json');
const historicalMethods = readAudit('historical-methods-audit.json');
const gyeonggi2027 = readAudit('gyeonggi-2027-integration-summary.json');
const ipsihogu2027 = readAudit('ipsihogu-2027-cutoffs-summary.json');

const IPSIHOGU_EXPECTED_ROWS = 5339;
const IPSIHOGU_EXPECTED_UNIVERSITIES = 167;
const IPSIHOGU_EXPECTED_SHA256 =
  '7232fbedf71512706f6edf26cc9a950c14c4bf9a8f8554deac31bb7ad681f244';

const failures = [];
if (!cutoffScoresUnchanged)
  failures.push('입시호구 동기화 전후 공식 3개년 입결 배열 변경');
if (!cutoffUnitsUnchanged)
  failures.push('입시호구 동기화 전후 2027 공식 모집단위 배열 변경');
if (consistency.issues !== 0)
  failures.push(`입시결과 이상값 ${consistency.issues}건`);
if (results.official_pairs_failed !== 0 || results.download_failed_rows !== 0)
  failures.push('대학어디가 페이지 수집 실패');
if (results.mismatched_rows !== 0)
  failures.push(`대학어디가 수치 불일치 ${results.mismatched_rows}건`);
if (reference2027.issues !== 0)
  failures.push(`2027 정시 기준 시트 불일치 ${reference2027.issues}건`);
if (methods2027.download_failures !== 0 || methods2027.needs_review !== 0)
  failures.push('대학어디가 2027 수능위주전형 확인 실패');
if (education.sourceFailures.length !== 0)
  failures.push(
    `시도교육청 자료 확인 실패 ${education.sourceFailures.length}건`,
  );
if (allTabs.issues !== 0)
  failures.push(`전체 탭 내용 검사 ${allTabs.issues}건`);
if (allTabs.forecastCutoffCoverage2027?.invalidEligibleRows !== 0) {
  failures.push(
    `2027 예상컷 공개 불가 행 ${allTabs.forecastCutoffCoverage2027?.invalidEligibleRows ?? '없음'}건`,
  );
}
if (historicalMethods.issues !== 0)
  failures.push(`해당 학년도 반영비율 검사 ${historicalMethods.issues}건`);
if (gyeonggi2027.issues !== 0)
  failures.push(`2027 모집단위 보완자료 검사 ${gyeonggi2027.issues}건`);
if (ipsihogu2027.status !== 'PASS')
  failures.push('입시호구 2027 예상컷 수집 상태 이상');
if (ipsihogu2027.source?.rawRows !== IPSIHOGU_EXPECTED_ROWS) {
  failures.push(
    `입시호구 원문 행수 ${ipsihogu2027.source?.rawRows ?? '없음'}건`,
  );
}
if (
  ipsihogu2027.source?.sourceUniversities !== IPSIHOGU_EXPECTED_UNIVERSITIES
) {
  failures.push(
    `입시호구 대학수 ${ipsihogu2027.source?.sourceUniversities ?? '없음'}개`,
  );
}
if (ipsihogu2027.source?.rawSha256 !== IPSIHOGU_EXPECTED_SHA256) {
  failures.push('입시호구 원문 SHA-256 변경');
}
if (
  ipsihogu2027.source?.matchedRows + ipsihogu2027.source?.quarantinedRows !==
  IPSIHOGU_EXPECTED_ROWS
) {
  failures.push('입시호구 적격·격리 행수 합계 불일치');
}
if (ipsihogu2027.source?.publishedRows !== ipsihogu2027.source?.matchedRows) {
  failures.push('입시호구 공개 행수와 적격 행수 불일치');
}
if (
  ipsihogu2027.scope?.allSourceRowsExplored !== true ||
  ipsihogu2027.scope?.allSourceUniversitiesExplored !== true
) {
  failures.push('입시호구 원문 전수 탐색 미완료');
}
if (
  ipsihogu2027.scope?.detailPagesExpected !== IPSIHOGU_EXPECTED_UNIVERSITIES ||
  ipsihogu2027.scope?.detailPagesVerified !== IPSIHOGU_EXPECTED_UNIVERSITIES ||
  ipsihogu2027.scope?.detailRows !== IPSIHOGU_EXPECTED_ROWS
) {
  failures.push('입시호구 대학별 상세 페이지 전수 확인 미완료');
}
if (
  ipsihogu2027.validations?.networkFetch !== 'pass' ||
  ipsihogu2027.validations?.jsonArray !== 'pass' ||
  ipsihogu2027.validations?.rowCount !== 'pass' ||
  ipsihogu2027.validations?.universityCount !== 'pass' ||
  ipsihogu2027.validations?.missingEssentialFields !== 0 ||
  ipsihogu2027.validations?.rangeViolations !== 0 ||
  ipsihogu2027.validations?.duplicateSourceRecordIds !== 0
) {
  failures.push('입시호구 원문 필수값·범위·중복 검사 실패');
}
if (
  ipsihogu2027.validations?.detailPagesVerified !==
    IPSIHOGU_EXPECTED_UNIVERSITIES ||
  ipsihogu2027.validations?.detailRows !== IPSIHOGU_EXPECTED_ROWS ||
  ipsihogu2027.validations?.centralJsonMatches !== true ||
  Object.keys(ipsihogu2027.validations?.failures ?? {}).length !== 0
) {
  failures.push('입시호구 상세 페이지와 중앙 JSON 불일치');
}
if (
  ipsihogu2027.safety?.historicalScoresTouched !== false ||
  ipsihogu2027.safety?.officialP50P70Touched !== false ||
  ipsihogu2027.safety?.existingUnits2027Touched !== false ||
  ipsihogu2027.safety?.forecastValuesStoredSeparately !== true
) {
  failures.push('입시호구 예상컷이 공식 입결·2027 모집단위와 분리되지 않음');
}

if (failures.length) {
  console.error(`출고 전 데이터 검증 실패: ${failures.join(', ')}`);
  process.exit(1);
}

console.log('출고 전 데이터 검증 통과');
