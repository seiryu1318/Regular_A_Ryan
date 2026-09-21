import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'audit', 'release-ver13-audit-manifest.json'),
    'utf8',
  ),
);
const data = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'public', 'admissions-data.json'), 'utf8'),
);
const pageSource = fs.readFileSync(path.join(ROOT, 'app', 'page.tsx'), 'utf8');
const auditSource = fs.readFileSync(
  path.join(ROOT, 'app', 'release-ver13-audit.ts'),
  'utf8',
);
const releaseSource = fs.readFileSync(
  path.join(ROOT, 'app', 'release.ts'),
  'utf8',
);

const dispositions = manifest.resultsAudit.dispositions;
const fullRowIds = new Set(dispositions.fullRowQuarantine.ids);
const scoreOnlyIds = new Set(dispositions.scoreFieldsOnlySuppression.ids);
const contextIds = new Set(dispositions.contextReview.ids);
const methodIds = new Set([
  ...manifest.historicalMethodAudit.methodDisplaySuppression.ids,
  ...contextIds,
]);
const byId = new Map(data.scores.map((row) => [row.id, row]));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  /RELEASE_VERSION\s*=\s*['"]ver\.13['"]/.test(releaseSource),
  'release version is not ver.13',
);
assert(
  data.scores.length === 15335,
  `expected 15335 source rows, received ${data.scores.length}`,
);
assert(
  fullRowIds.size === 2326,
  `expected 2326 full-row quarantines, received ${fullRowIds.size}`,
);
assert(
  scoreOnlyIds.size === 164,
  `expected 164 score-only suppressions, received ${scoreOnlyIds.size}`,
);
assert(
  contextIds.size === 8,
  `expected 8 context-review rows, received ${contextIds.size}`,
);
assert(
  methodIds.size === 10930,
  `expected 10930 method suppressions including context review, received ${methodIds.size}`,
);
assert(
  [...fullRowIds].every((id) => byId.has(id)),
  'full-row quarantine contains an unknown score id',
);
assert(
  [...scoreOnlyIds].every((id) => byId.has(id)),
  'score-only suppression contains an unknown score id',
);
assert(
  [...methodIds].every((id) => byId.has(id)),
  'method suppression contains an unknown score id',
);
assert(
  [...fullRowIds].every((id) => !scoreOnlyIds.has(id)),
  'full-row and score-only dispositions overlap',
);
assert(
  manifest.resultsAudit.logicalKeyConflicts.key.at(-1) === 'admission',
  'logical conflict key must include the admission path',
);
for (const id of [2927, 2928, 3008, 3009, 13467, 13468]) {
  assert(
    !fullRowIds.has(id),
    `legitimate admission or track variant was quarantined: ${id}`,
  );
}

const requiredPageFragments = [
  'releaseSafeScoreRows((data?.scores ?? []).filter(isGeneralScoreRow))',
  '.filter((row) => !FULL_ROW_QUARANTINE_IDS.has(row.id))',
  'SCORE_FIELDS_ONLY_SUPPRESSION_IDS.has(row.id)',
  'METHOD_DISPLAY_SUPPRESSION_IDS.has(row.id)',
  'suppressMethod ? { yearMethod: undefined }',
  "maximumLabel('환산만점', row)",
  "maximumLabel('환산점수 만점', selectedScore)",
  "'2026 환산만점(추론)'",
];
for (const fragment of requiredPageFragments) {
  assert(
    pageSource.includes(fragment),
    `missing release-safe page integration: ${fragment}`,
  );
}
assert(
  /suppressScoreFields\s*\?\s*\{[\s\S]*?cv50:\s*null[\s\S]*?en:\s*null/.test(
    pageSource,
  ),
  'score-only suppression mapping is missing',
);
assert(
  auditSource.includes('...dispositions.contextReview.ids'),
  'context-review rows are not included in method suppression',
);

const retainedRows = data.scores.filter((row) => !fullRowIds.has(row.id));
assert(
  retainedRows.length === data.scores.length - fullRowIds.size,
  'full-row quarantine count mismatch',
);

const scoreFields = [
  'cv50',
  'cv70',
  'p50',
  'p70',
  'ko',
  'ma',
  'inq',
  'en',
];
const preservedFields = ['n', 'c', 'x', 'add', 'max', 'maxSource'];
for (const id of scoreOnlyIds) {
  const source = byId.get(id);
  const transformed = {
    ...source,
    ...Object.fromEntries(scoreFields.map((field) => [field, null])),
  };
  assert(
    scoreFields.every((field) => transformed[field] === null),
    `score field remained for id ${id}`,
  );
  assert(
    preservedFields.every((field) => transformed[field] === source[field]),
    `enrollment or competition field changed for id ${id}`,
  );
}

const inferredMaximumRows = data.scores.filter(
  (row) => row.maxSource && row.max !== null,
);
assert(
  inferredMaximumRows.length === 2729,
  `expected 2729 inferred maxima, received ${inferredMaximumRows.length}`,
);

console.log(
  JSON.stringify(
    {
      status: 'QUARANTINE_VERIFIED',
      sourceRows: data.scores.length,
      retainedBeforeSpecialAdmissionFilter: retainedRows.length,
      fullRowQuarantine: fullRowIds.size,
      scoreFieldsOnlySuppression: scoreOnlyIds.size,
      methodDisplaySuppressionIncludingContext: methodIds.size,
      inferredMaximumLabels: inferredMaximumRows.length,
    },
    null,
    2,
  ),
);
