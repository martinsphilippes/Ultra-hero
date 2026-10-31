// Listas fechadas do núcleo comercial (iguais aos checks da 0066).
export const DELIVERABLE_KINDS = ["post", "reels", "stories", "video", "short", "live", "event", "ugc", "other"] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

export const OBJECTIVES = ["awareness", "engagement", "conversion", "launch", "content", "event", "other"] as const;
export type Objective = (typeof OBJECTIVES)[number];

export const FORMATS = ["remote", "in_person", "hybrid"] as const;
export type CampaignFormat = (typeof FORMATS)[number];

export const REQUEST_STATUSES = ["draft", "submitted", "converted", "declined", "cancelled"] as const;

export const DEAL_TALENT_STATUSES = ["suggested", "consulted", "interested", "talk_requested", "declined", "proposed", "contracted", "removed"] as const;
export type DealTalentStatus = (typeof DEAL_TALENT_STATUSES)[number];

export const TALENT_RESPONSES = ["interested", "declined", "talk_requested"] as const;
export type TalentResponse = (typeof TALENT_RESPONSES)[number];

export const DELIVERABLE_STATUSES = ["planned", "in_production", "submitted", "changes_requested", "approved", "published", "proof_submitted", "done", "cancelled"] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const ACTIVITY_KINDS = ["call", "meeting", "message", "email", "note"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const AVAILABILITY_KINDS = ["available", "blocked"] as const;

/** Prazos oferecidos para a resposta do creator (dias). */
export const CONSULT_DAYS = [3, 7, 14] as const;

/** Critérios de uma sugestão de creator (reasons do deal_talents, mesma lista do check da 0066). */
export const REASON_CODES = ["segment", "region", "audience_age", "network", "availability", "brand_choice"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];
export type Reason = { code: ReasonCode; met: boolean; detail: string[] };
