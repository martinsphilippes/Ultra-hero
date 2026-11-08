// Ata de reunião (0138): tipos compartilhados pela ficha do casting (servidor e cliente).

import type { ActionInterest, Formats, IdeaStatus } from "@/lib/creator-guide/format";
import type { Checks, MeetingAction, MeetingMode, MeetingStatus, Notes, YesNo } from "./format";

export type MeetingSummary = {
  id: string;
  heldAt: string;
  mode: MeetingMode;
  status: MeetingStatus;
  representative: string | null;
  followUpOn: string | null;
  summary: string;
  checks: Checks;
  formatsAnswered: number;
  hasQuestions: boolean;
  actionsTotal: number;
  actionsPending: number;
  actionsReady: number;
  finalizedAt: string | null;
};

export type MeetingDoc = {
  id: string;
  talentId: string;
  talentName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  heldAt: string;
  mode: MeetingMode;
  representativeId: string | null;
  representative: string | null;
  participants: string;
  fullName: string;
  contactConfirmed: YesNo | null;
  contactFix: string;
  notes: Notes;
  formats: Formats;
  actionKey: string | null;
  actionInterest: ActionInterest | null;
  registerIdea: boolean;
  idea: { id: string; title: string; status: IdeaStatus } | null;
  checks: Checks;
  senderId: string | null;
  sender: string | null;
  sentOn: string | null;
  followUpOn: string | null;
  status: MeetingStatus;
  finalizedAt: string | null;
  finalizedBy: string | null;
  calendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
  actions: MeetingAction[];
  availableActions: { key: string; title: string; endsOn: string }[];
  canManage: boolean;
  canDelete: boolean;
};

export type OpenMeetingAction = {
  id: string;
  title: string;
  ownerKind: "team" | "talent";
  ownerId: string | null;
  owner: string | null;
  dueOn: string | null;
  meetingId: string;
  heldAt: string;
  talentId: string;
  talentName: string;
  photoUrl: string | null;
};
