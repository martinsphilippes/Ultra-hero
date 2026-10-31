// Motivos de denúncia (0071): lista fixa, igual à checagem do banco (content_reports.reason).
export const REPORT_REASONS = ["offensive", "harassment", "misleading", "rights", "spam", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_DETAILS_MAX = 1000;
