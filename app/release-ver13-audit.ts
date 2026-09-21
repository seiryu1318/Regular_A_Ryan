import releaseAuditManifest from '@/audit/release-ver13-audit-manifest.json';

const dispositions = releaseAuditManifest.resultsAudit.dispositions;

export const FULL_ROW_QUARANTINE_IDS = new Set<number>(
  dispositions.fullRowQuarantine.ids,
);
export const SCORE_FIELDS_ONLY_SUPPRESSION_IDS = new Set<number>(
  dispositions.scoreFieldsOnlySuppression.ids,
);
export const METHOD_DISPLAY_SUPPRESSION_IDS = new Set<number>([
  ...releaseAuditManifest.historicalMethodAudit.methodDisplaySuppression.ids,
  ...dispositions.contextReview.ids,
]);
