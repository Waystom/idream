import type { AnalystKey, DreamAnalysis } from "./types";

export type UserRole = "user" | "admin";
export type BottleStatus = "pending" | "approved" | "rejected";

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  intention: string | null;
  role: UserRole;
  psychological_profile: string | null;
  created_at: string;
  updated_at: string;
};

export type DreamRecordRow = {
  id: string;
  user_id: string;
  analyst_key: AnalystKey;
  analyst_name: string;
  dream_at: string | null;
  dream_text: string;
  waking_life: string | null;
  mood: string | null;
  followup_answers: Array<{
    question: string;
    answer: string;
  }>;
  analysis: DreamAnalysis;
  image_url: string | null;
  image_prompt: string | null;
  image_mime_type: string | null;
  feedback: "hit" | "miss" | "unsure" | null;
  feedback_note: string | null;
  inner_questions: Array<{
    question: string;
    answer: string;
    reflection: string;
  }>;
  created_at: string;
  updated_at: string;
};

export type ProfileSnapshotRow = {
  id: string;
  user_id: string;
  dream_record_id: string | null;
  profile: string;
  change_summary: string | null;
  motifs: string[];
  feedback: "hit" | "miss" | "unsure" | null;
  created_at: string;
};

export type DriftBottleRow = {
  id: string;
  user_id: string;
  body: string;
  status: BottleStatus;
  moderator_id: string | null;
  moderation_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type AdminStats = {
  users: number;
  dreams: number;
  bottlesPending: number;
  bottlesApproved: number;
};
