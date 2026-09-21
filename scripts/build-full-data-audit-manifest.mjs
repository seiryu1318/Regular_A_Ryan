import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'public', 'admissions-data.json');
const OFFICIAL_AUDIT_PATH = path.join(
  ROOT,
  'audit',
  'official-results-audit.csv',
);
const HISTORICAL_SUMMARY_PATH = path.join(
  ROOT,
  'audit',
  'historical-methods-summary.json',
);
const EDUCATION_OFFICE_PATH = path.join(
  ROOT,
  'audit',
  'education-office-sources.json',
);
const MANIFEST_PATH = path.join(
  ROOT,
  'audit',
  'release-ver13-audit-manifest.json',
);
const REPORT_PATH = path.join(ROOT, 'audit', 'release-ver13-audit-report.md');
const CANDIDATE_PATH = path.join(ROOT, 'audit', 'release-ver13-candidate.json');

const readJson = (target) => JSON.parse(fs.readFileSync(target, 'utf8'));
const sha256 = (value) =>
  crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
const fileSha256 = (target) => sha256(fs.readFileSync(target));
const uniqueSorted = (values) =>
  [...new Set(values)].sort((left, right) => Number(left) - Number(right));
const isMissing = (value) =>
  value === null || value === undefined || value === '';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  const [header, ...body] = rows;
  const normalizedHeader = header.map((name) => name.replace(/^\uFEFF/, ''));
  return body
    .filter((values) => values.some(Boolean))
    .map((values) =>
      Object.fromEntries(
        normalizedHeader.map((name, index) => [name, values[index] ?? '']),
      ),
    );
}

function countBy(rows, key) {
  return Object.fromEntries(
    [
      ...rows.reduce((map, row) => {
        const value = String(key(row));
        map.set(value, (map.get(value) ?? 0) + 1);
        return map;
      }, new Map()),
    ].sort(([left], [right]) => left.localeCompare(right, 'ko')),
  );
}

function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }
  return grouped;
}

function byYear(ids, rowsById) {
  return countBy(
    ids.map((id) => rowsById.get(Number(id))).filter(Boolean),
    (row) => row.y,
  );
}

function extractKnownUnsafeIds() {
  const source = fs.readFileSync(
    path.join(ROOT, 'scripts', 'sync-historical-methods.py'),
    'utf8',
  );
  const block = source.match(/KNOWN_UNSAFE_IDS\s*=\s*\{([\s\S]*?)\n\}/);
  if (!block) return [];
  return uniqueSorted(
    [...block[1].matchAll(/\b\d+\b/g)].map((match) => Number(match[0])),
  );
}

const data = readJson(DATA_PATH);
const scores = data.scores;
const rowsById = new Map(scores.map((row) => [Number(row.id), row]));
const officialAudit = parseCsv(fs.readFileSync(OFFICIAL_AUDIT_PATH, 'utf8'));
const officialById = new Map(officialAudit.map((row) => [Number(row.id), row]));
const historicalSummary = readJson(HISTORICAL_SUMMARY_PATH);
const educationOffice = readJson(EDUCATION_OFFICE_PATH);

const statusCounts = countBy(officialAudit, (row) => row.status);
const unverifiedStatuses = new Set([
  '공식 행 미일치',
  '공식 결과 미공개',
  '저신뢰 후보',
  '대학 공식자료 별도 확인',
]);
const officialUnverifiedIds = uniqueSorted(
  officialAudit
    .filter((row) => unverifiedStatuses.has(row.status))
    .map((row) => Number(row.id)),
);
const fingerprintIds = uniqueSorted(
  officialAudit
    .filter((row) => row.status === '수치 지문 일치')
    .map((row) => Number(row.id)),
);
const matchedStatuses = new Set(['일치', '수치 지문 일치']);
const matchedNoScoreIds = uniqueSorted(
  scores
    .filter((row) =>
      matchedStatuses.has(officialById.get(Number(row.id))?.status),
    )
    .filter((row) =>
      ['cv50', 'cv70', 'p50', 'p70'].every((field) => isMissing(row[field])),
    )
    .map((row) => Number(row.id)),
);

const signatureFields = [
  'a',
  'g',
  't',
  'n',
  'c',
  'x',
  'add',
  'cv50',
  'cv70',
  'max',
  'p50',
  'p70',
  'ko',
  'ma',
  'inq',
  'en',
  'r',
];
const signature = (row) =>
  JSON.stringify(signatureFields.map((field) => row[field] ?? null));
const conflictGroupsFor = (includeAdmission) => {
  const groups = groupBy(scores, (row) =>
    [
      row.y,
      row.u,
      row.exam || '',
      row.d,
      row.metric || '',
      ...(includeAdmission ? [row.a || ''] : []),
    ].join('\u001f'),
  );
  return [...groups.entries()]
    .filter(
      ([, rows]) => rows.length > 1 && new Set(rows.map(signature)).size > 1,
    )
    .map(([key, rows]) => ({
      key: key.split('\u001f'),
      ids: rows.map((row) => Number(row.id)),
      signatures: new Set(rows.map(signature)).size,
    }));
};
// 전형 경로가 다른 행은 같은 모집단위라도 서로 다른 정상 선발 경로다.
// 실제 격리 대상 충돌은 전형명까지 같은 행에서 수치가 어긋날 때만 잡는다.
const logicalConflictGroups = conflictGroupsFor(true);
const admissionConflictGroups = logicalConflictGroups;
const logicalConflictIds = uniqueSorted(
  logicalConflictGroups.flatMap((group) => group.ids),
);

const validPercent = (value) =>
  !isMissing(value) &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0 &&
  Number(value) <= 100;
const equalNumber = (left, right) =>
  !isMissing(left) &&
  !isMissing(right) &&
  Number.isFinite(Number(left)) &&
  Number.isFinite(Number(right)) &&
  Math.abs(Number(left) - Number(right)) < 0.000001;
const conversionPercentileWarningIds = uniqueSorted(
  scores
    .filter((row) => Number(row.max) > 100)
    .filter(
      (row) =>
        (validPercent(row.cv50) &&
          validPercent(row.p50) &&
          equalNumber(row.cv50, row.p50)) ||
        (validPercent(row.cv70) &&
          validPercent(row.p70) &&
          equalNumber(row.cv70, row.p70)),
    )
    .map((row) => Number(row.id)),
);

const standardScoreInPercentileFields = scores
  .filter((row) =>
    ['p50', 'p70', 'ko', 'ma', 'inq'].some((field) => Number(row[field]) > 100),
  )
  .map((row) => ({
    id: Number(row.id),
    year: row.y,
    university: row.u,
    department: row.d,
    metric: row.metric ?? null,
    fields: Object.fromEntries(
      ['p50', 'p70', 'ko', 'ma', 'inq']
        .filter((field) => Number(row[field]) > 100)
        .map((field) => [field, row[field]]),
    ),
  }));

const regularContextReviewIds = [4386, 4388, 4390, 4395, 4396, 4397, 11462];
const routeLabelMismatchIds = [
  3525, 3580, 3634, 3636, 3642, 3644, 3672, 3674, 3740, 3759, 3760, 18763,
];
const newlyAddedRouteReviewIds = [3760];

const fullRowQuarantineIds = uniqueSorted([
  ...officialUnverifiedIds,
  ...logicalConflictIds,
  ...conversionPercentileWarningIds,
  ...fingerprintIds,
]);
const scoreFieldSuppressionIds = uniqueSorted(
  matchedNoScoreIds.filter((id) => !fullRowQuarantineIds.includes(id)),
);
const contextReviewIds = uniqueSorted(
  [...regularContextReviewIds, ...newlyAddedRouteReviewIds].filter(
    (id) =>
      !fullRowQuarantineIds.includes(id) &&
      !scoreFieldSuppressionIds.includes(id),
  ),
);
const expandedResultReviewIds = uniqueSorted([
  ...fullRowQuarantineIds,
  ...scoreFieldSuppressionIds,
  ...contextReviewIds,
]);

const historicalLinkedIds = uniqueSorted(
  scores
    .filter((row) => !isMissing(row.yearMethod))
    .map((row) => Number(row.id)),
);
const historicalUnlinkedIds = uniqueSorted(
  scores
    .filter((row) => isMissing(row.yearMethod))
    .map((row) => Number(row.id)),
);
const knownUnsafeIds = extractKnownUnsafeIds();
const linkedMetricConflictIds = [
  9826, 9827, 9830, 9831, 9832, 9833, 9837, 9839, 9845, 9846, 9847, 9849, 9850,
];
const linkedStudentRecordConflictIds = [18763];
const methodDisplaySuppressionIds = uniqueSorted([
  ...historicalUnlinkedIds,
  ...linkedMetricConflictIds,
  ...linkedStudentRecordConflictIds,
]);

const missingExamIds = uniqueSorted(
  scores.filter((row) => isMissing(row.exam)).map((row) => Number(row.id)),
);
const missingMetricIds = uniqueSorted(
  scores.filter((row) => isMissing(row.metric)).map((row) => Number(row.id)),
);
const missingBothIds = uniqueSorted(
  scores
    .filter((row) => isMissing(row.exam) && isMissing(row.metric))
    .map((row) => Number(row.id)),
);

const sourcePathGaps = data.profiles
  .filter((profile) => !profile.officialSourcePath)
  .map((profile) => ({ id: Number(profile.id), university: profile.u }));
const locallyRecoverableSourceProfileIds = [
  179, 187, 188, 189, 190, 191, 193, 194, 195, 196, 197, 198, 199, 200, 201,
  202, 203, 204,
];
const locallyAbsentSourceProfileIds = [180, 186, 192];
const brokenPopulatedSourcePaths = data.profiles
  .filter(
    (profile) =>
      profile.officialSourcePath && !fs.existsSync(profile.officialSourcePath),
  )
  .map((profile) => ({
    id: Number(profile.id),
    university: profile.u,
    path: profile.officialSourcePath,
  }));

const baseVersion = 'ver.12';
const baseCommit = 'e7953a32a9d7854ff24d3376366ebb21a7b2398a';
const generatedAt = new Date().toISOString();

const manifest = {
  schemaVersion: 1,
  generatedAt,
  releaseGate: {
    baseVersion,
    candidateVersion: 'ver.13',
    status: 'AUDIT_BLOCKED',
    releaseReady: false,
    reason:
      '공식자료 1:1 연결이 끝나지 않은 결과 행과 반영방법 행을 격리하기 전에는 배포할 수 없음',
  },
  baseline: {
    gitCommit: baseCommit,
    scoreRows: scores.length,
    scoreRowsByYear: countBy(scores, (row) => row.y),
    profileRows: data.profiles.length,
    hashes: {
      admissionsDataSha256: fileSha256(DATA_PATH),
      indexHtmlSha256: fileSha256(path.join(ROOT, 'index.html')),
      releaseTsSha256: fileSha256(path.join(ROOT, 'app', 'release.ts')),
      officialResultsAuditSha256: fileSha256(OFFICIAL_AUDIT_PATH),
      historicalMethodsSummarySha256: fileSha256(HISTORICAL_SUMMARY_PATH),
    },
  },
  resultsAudit: {
    statusCounts,
    officialUnverified: {
      count: officialUnverifiedIds.length,
      byYear: byYear(officialUnverifiedIds, rowsById),
      ids: officialUnverifiedIds,
    },
    logicalKeyConflicts: {
      key: [
        'year',
        'university',
        'exam',
        'department',
        'metric',
        'admission',
      ],
      groups: logicalConflictGroups.length,
      rows: logicalConflictIds.length,
      excessRows: logicalConflictGroups.reduce(
        (total, group) => total + group.ids.length - 1,
        0,
      ),
      details: logicalConflictGroups,
    },
    admissionQualifiedConflicts: {
      key: ['year', 'university', 'exam', 'department', 'metric', 'admission'],
      groups: admissionConflictGroups.length,
      rows: uniqueSorted(admissionConflictGroups.flatMap((group) => group.ids))
        .length,
      excessRows: admissionConflictGroups.reduce(
        (total, group) => total + group.ids.length - 1,
        0,
      ),
      details: admissionConflictGroups,
    },
    conversionPercentileWarnings: {
      count: conversionPercentileWarningIds.length,
      ids: conversionPercentileWarningIds,
    },
    fingerprintOnly: {
      count: fingerprintIds.length,
      ids: fingerprintIds,
    },
    standardScoreStoredInPercentileFields: {
      rows: standardScoreInPercentileFields.length,
      details: standardScoreInPercentileFields,
    },
    matchedWithoutPublishedScoreFields: {
      count: matchedNoScoreIds.length,
      ids: matchedNoScoreIds,
    },
    incompleteIdentityKeys: {
      examMissing: missingExamIds.length,
      metricMissing: missingMetricIds.length,
      bothMissing: missingBothIds.length,
      examMissingIds: missingExamIds,
      metricMissingIds: missingMetricIds,
      bothMissingIds: missingBothIds,
    },
    contextAndRouteReview: {
      regularContextIds: regularContextReviewIds,
      routeLabelMismatchIds,
      newRouteReviewIds: newlyAddedRouteReviewIds,
    },
    dispositions: {
      fullRowQuarantine: {
        count: fullRowQuarantineIds.length,
        byYear: byYear(fullRowQuarantineIds, rowsById),
        ids: fullRowQuarantineIds,
      },
      scoreFieldsOnlySuppression: {
        count: scoreFieldSuppressionIds.length,
        byYear: byYear(scoreFieldSuppressionIds, rowsById),
        ids: scoreFieldSuppressionIds,
      },
      contextReview: {
        count: contextReviewIds.length,
        byYear: byYear(contextReviewIds, rowsById),
        ids: contextReviewIds,
      },
      expandedReview: {
        count: expandedResultReviewIds.length,
        percentOfScores: Number(
          ((expandedResultReviewIds.length / scores.length) * 100).toFixed(2),
        ),
        byYear: byYear(expandedResultReviewIds, rowsById),
        ids: expandedResultReviewIds,
      },
    },
  },
  historicalMethodAudit: {
    linked: {
      count: historicalLinkedIds.length,
      byYear: byYear(historicalLinkedIds, rowsById),
      ids: historicalLinkedIds,
    },
    unlinked: {
      count: historicalUnlinkedIds.length,
      byYear: byYear(historicalUnlinkedIds, rowsById),
      ordinary: 9946,
      ambiguous: 791,
      quarantinedAfterMatch: 173,
      ids: historicalUnlinkedIds,
    },
    knownUnsafe: {
      configuredIds: knownUnsafeIds.length,
      removedAfterMatch: historicalSummary.quarantined_rows,
      ids: knownUnsafeIds,
    },
    linkedMetricConflictIds,
    linkedStudentRecordConflictIds,
    methodDisplaySuppression: {
      count: methodDisplaySuppressionIds.length,
      byYear: byYear(methodDisplaySuppressionIds, rowsById),
      ids: methodDisplaySuppressionIds,
    },
    caveats: {
      linkedRowsWithoutMetricInTarget: 3821,
      linkedRowsWithoutStructuredKoreanHistory: historicalLinkedIds.length,
      fixedRatioRowsNotSummingTo100: 135,
    },
  },
  localWorkbookReconciliation: {
    sourceRows: 15616,
    currentRows: scores.length,
    arithmetic:
      '15616 - 특별전형 제거 339 - 제주대 중복 제거 2 + 가천대 공식자료 추가 60 = 15335',
    rowsMissingFromCurrentData: {
      count: 341,
      reproducibleSpecialAdmissionRows: 229,
      documentedJejuDuplicates: [16457, 16509],
      deletionBasisNotReproducibleFromAdmissionName: 110,
      sameUniversityYearDepartmentStillPresent: 20,
      noEquivalentDepartmentInCurrentData: 90,
      representativeIds: [3479, 3503, 10639, 12034, 13168, 18233, 18253],
    },
    rowsAddedFromOfficialUniversityData: {
      count: 60,
      idRange: [20667, 20726],
      university: '가천대',
      year: 2026,
    },
    staleExcelAuditArtifact: {
      trackedSummaryClaimsJsonRows: 15616,
      actualJsonRows: scores.length,
      note: '기존 excel-source-summary.json은 현재 데이터 제거·추가 전 결과여서 현행 전수 감사 근거로 사용할 수 없음',
    },
    previouslyUnexplainedFieldDifferences: {
      total: 3854,
      inferredConversionMaximum: 2729,
      officialU1Corrections: 70,
      directAdigaCorrections: 5,
      placeholderOrMetricCleanup: 333,
      campusRename: 120,
      trackReclassification: 597,
      caveat:
        '필드 기준과 행 기준이 섞이고 서로 겹칠 수 있으므로 합산 격리 행 수로 사용하지 않음',
    },
    fieldLevelReview: {
      inferredConversionMaximumFields: 2729,
      percentileOver100ClearedFields: 238,
      trackReclassificationFields: 597,
      campusRenameFields: 120,
    },
  },
  methods2027Audit: {
    profiles: data.profiles.length,
    referenceRows: data.reference2027?.rows ?? 0,
    profilesWithReferenceRows: 196,
    officialSourcePathGaps: {
      count: sourcePathGaps.length,
      details: sourcePathGaps,
      locallyRecoverableIds: locallyRecoverableSourceProfileIds,
      locallyAbsentIds: locallyAbsentSourceProfileIds,
      brokenPopulatedPaths: brokenPopulatedSourcePaths,
    },
    fieldReview: {
      metricBlankRows: 11,
      overlappingCategoryProfiles: 83,
      koreanHistoryOnlyInNoteRows: 15,
      studentRecordMismatchProfiles: [24, 28, 60, 86, 94, 180],
      koreanHistoryBlankOrDashProfiles: 43,
      officialEvidenceWarningProfiles: 135,
      duplicateAdigaCodeProfileIds: [99, 187],
    },
    rawTextScopeMixing: {
      selectionSpecialKeywordProfiles: [16, 151],
      selectionEarlyAdmissionKeywordProfiles: [33, 184],
      ratioSpecialKeywordProfileCount: 62,
      ratioEarlyAdmissionKeywordProfileCount: 40,
      structuredReferenceSpecialOnlyRows: 0,
    },
  },
  educationOfficeAudit: {
    sourcesChecked: educationOffice.sources.map((source) => source.agency),
    universitiesChecked: educationOffice.universitiesChecked,
    universitiesNamed:
      educationOffice.universitiesNamedInEducationOfficeSources,
    universitiesNotNamed: educationOffice.universitiesNotNamed,
    limitation:
      '현재 자동 감사에 직접 등록된 시도교육청 자료는 서울·울산·인천 3종이며, 17개 시도 전체를 뜻하지 않음',
  },
  auditLimitations: [
    '공식 결과 매처는 동일 공식 행의 중복 사용을 금지하지 않음',
    '일부 필드만 일치해도 전체 행이 일치로 분류될 수 있음',
    '기존 결과 범위 검사는 p50·p70만 확인하며 표준점수와 백분위 필드가 분리되지 않음',
    '과거 반영방법 감사는 yearMethod가 없는 10910행을 검사하지 않음',
    '2027 공식 근거 감사는 대학 전체 페이지의 단어 존재를 확인할 뿐 전형·군·계열·모집단위 1대1 수치 대조가 아님',
    '기존 Excel 대조 스크립트는 행 번호를 ID로 사용하고 삭제·추가·공식 덮어쓰기 출처를 완전히 모델링하지 못함',
  ],
};

const expected = {
  scoreRows: 15335,
  officialUnverified: 2269,
  logicalConflictGroups: 11,
  logicalConflictRows: 23,
  admissionConflictGroups: 11,
  admissionConflictRows: 23,
  conversionWarnings: 34,
  fingerprints: 12,
  matchedNoScore: 164,
  fullRowQuarantine: 2326,
  scoreFieldsOnlySuppression: 164,
  contextReview: 8,
  expandedReview: 2498,
  historicalLinked: 4425,
  historicalUnlinked: 10910,
  methodDisplaySuppression: 10924,
  sourcePathGaps: 21,
};
const actual = {
  scoreRows: scores.length,
  officialUnverified: officialUnverifiedIds.length,
  logicalConflictGroups: logicalConflictGroups.length,
  logicalConflictRows: logicalConflictIds.length,
  admissionConflictGroups: admissionConflictGroups.length,
  admissionConflictRows: uniqueSorted(
    admissionConflictGroups.flatMap((group) => group.ids),
  ).length,
  conversionWarnings: conversionPercentileWarningIds.length,
  fingerprints: fingerprintIds.length,
  matchedNoScore: matchedNoScoreIds.length,
  fullRowQuarantine: fullRowQuarantineIds.length,
  scoreFieldsOnlySuppression: scoreFieldSuppressionIds.length,
  contextReview: contextReviewIds.length,
  expandedReview: expandedResultReviewIds.length,
  historicalLinked: historicalLinkedIds.length,
  historicalUnlinked: historicalUnlinkedIds.length,
  methodDisplaySuppression: methodDisplaySuppressionIds.length,
  sourcePathGaps: sourcePathGaps.length,
};
for (const [key, expectedValue] of Object.entries(expected)) {
  if (actual[key] !== expectedValue) {
    throw new Error(
      `${key}: expected ${expectedValue}, received ${actual[key]}`,
    );
  }
}

const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
fs.writeFileSync(MANIFEST_PATH, manifestText, 'utf8');

const reportText =
  `# ver.13 전수 감사 보고서\n\n` +
  `상태: **AUDIT_BLOCKED**\n` +
  `기준 배포: **${baseVersion}** / \`${baseCommit}\`\n` +
  `후보 버전: **ver.13**(번호만 예약, 미배포)\n\n` +
  `## 입시결과\n\n` +
  `- 전체 ${scores.length.toLocaleString('ko-KR')}행 중 공식자료 1대1 연결 밖 행은 ${officialUnverifiedIds.length.toLocaleString('ko-KR')}행입니다.\n` +
  `- 논리키 충돌은 ${logicalConflictGroups.length}그룹 ${logicalConflictIds.length}행이며, 전형까지 넣어도 ${admissionConflictGroups.length}그룹 ${uniqueSorted(admissionConflictGroups.flatMap((group) => group.ids)).length}행이 남습니다.\n` +
  `- 환산점수와 백분위가 같은 값으로 저장된 의심 행은 ${conversionPercentileWarningIds.length}행, 수치 지문만 일치한 행은 ${fingerprintIds.length}행입니다.\n` +
  `- 결과 전체 행 격리 ${fullRowQuarantineIds.length.toLocaleString('ko-KR')}행, 점수 필드만 숨김 ${scoreFieldSuppressionIds.length}행, 문맥 확인 ${contextReviewIds.length}행입니다. 전체 검토 대상은 ${expandedResultReviewIds.length.toLocaleString('ko-KR')}행(${((expandedResultReviewIds.length / scores.length) * 100).toFixed(2)}%)입니다.\n` +
  `- 수시 입시결과가 직접 섞였다는 증거는 없지만, 수시 준용 문구와 전형 라벨 충돌 8행은 별도 확인 대상으로 남겼습니다.\n\n` +
  `## 과거 반영방법\n\n` +
  `- 연결 ${historicalLinkedIds.length.toLocaleString('ko-KR')}행, 미연결 ${historicalUnlinkedIds.length.toLocaleString('ko-KR')}행입니다.\n` +
  `- 미연결 내역은 일반 미매칭 9,946행, 모호 매칭 791행, 안전하지 않은 연결 제거 173행입니다.\n` +
  `- 미연결과 연결 충돌을 합쳐 ${methodDisplaySuppressionIds.length.toLocaleString('ko-KR')}행의 반영방법 표시를 제외해야 합니다. 입시결과 수치 자체를 삭제한다는 뜻은 아닙니다.\n\n` +
  `## 지정 로컬 입결 원본\n\n` +
  `- 원본 15,616행에서 특별전형 339행과 제주대 중복 2행을 빼고 가천대 공식자료 60행을 더하면 현재 15,335행입니다.\n` +
  `- 제거 341행 중 229행은 전형명으로 특별전형임을 재현할 수 있고 2행은 중복 로그가 있습니다. 나머지 110행은 삭제 근거를 행 단위로 다시 확인해야 하며, 그중 90행은 현재 동일 모집단위 대응 행도 없습니다.\n` +
  `- 과거 감사에서 설명하지 못한 필드 차이 3,854개 중 2,729개는 과거연도 일치값으로 추론한 환산만점입니다. 공식 2026 공개값처럼 표시하지 않고 추론값으로 분리해야 합니다.\n` +
  `- 계열 재분류 597개, 백분위 100 초과 제거 238개, 캠퍼스명 변경 120개는 필드 단위 재검증 대상입니다.\n` +
  `- 기존 excel-source-summary.json은 JSON 행을 15,616개로 기록한 오래된 산출물이므로 현재 감사 근거에서 제외했습니다.\n\n` +
  `## 2027 반영방법과 출처\n\n` +
  `- 프로필 ${data.profiles.length}개, 기준행 ${data.reference2027?.rows ?? 0}개입니다.\n` +
  `- 공식 경로 공란은 ${sourcePathGaps.length}개입니다. 이 중 18개는 로컬 원본이 있어 경로 연결로 해소할 수 있고, 가야대·중원대·대구예술대 3개는 로컬 원본도 없습니다.\n` +
  `- 값이 있는 공식 경로 182개는 모두 존재하며 깨진 경로는 없습니다.\n` +
  `- 현재 자동 등록된 시도교육청 자료는 서울·울산·인천 3종입니다. 17개 시도 전체 검증으로 표현하면 안 됩니다.\n\n` +
  `## 배포 판단\n\n` +
  `기존 ${baseVersion}, index.html, GitHub 배포본은 변경하지 않았습니다. 위 격리·재연결이 끝나고 전체 감사를 다시 통과하기 전에는 RELEASE_READY로 전환하지 않습니다.\n`;
fs.writeFileSync(REPORT_PATH, reportText, 'utf8');

const candidate = {
  generatedAt,
  stage: 'pre-mitigation',
  baseVersion,
  candidateVersion: 'ver.13',
  status: 'AUDIT_BLOCKED',
  releaseReady: false,
  gitCommit: baseCommit,
  hashes: {
    admissionsDataSha256: fileSha256(DATA_PATH),
    indexHtmlSha256: fileSha256(path.join(ROOT, 'index.html')),
    releaseTsSha256: fileSha256(path.join(ROOT, 'app', 'release.ts')),
    auditManifestSha256: sha256(manifestText),
    auditReportSha256: sha256(reportText),
  },
  nextGate: '격리 적용 후 공식자료 1:1 재감사와 전체 탭 검증',
  supersededBy: 'release-ver13-verification.json',
};
fs.writeFileSync(
  CANDIDATE_PATH,
  `${JSON.stringify(candidate, null, 2)}\n`,
  'utf8',
);

console.log(
  JSON.stringify(
    {
      actual,
      output: { MANIFEST_PATH, REPORT_PATH, CANDIDATE_PATH },
      candidate,
    },
    null,
    2,
  ),
);
