"use client";

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  CalendarDays,
  BookOpen,
  CircleAlert,
  Check,
  ChevronDown,
  Compass,
  House,
  Hourglass,
  LibraryBig,
  LockKeyhole,
  Mail,
  Moon,
  Search,
  Download,
  Eye,
  EyeOff,
  PenLine,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  UsersRound,
  Waves
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase/browser";
import type { AdminStats, BottleStatus, DreamRecordRow, DriftBottleRow, ProfileRow, ProfileSnapshotRow, UserRole } from "@/lib/database";
import type { AnalystKey, DreamAnalysis, FollowupQuestions, GeneratedImage, QuestionAnswer } from "@/lib/types";
import { authErrorMessage } from "@/lib/auth-messages";
import { dreamAsMarkdown } from "@/lib/dream-export";
import { MusicControls, RoomAudioMenu, useRoomAudio, type RoomAudioState } from "@/components/room-audio";

type SessionUser = {
  id?: string;
  email?: string;
  name: string;
  intention: string;
  role?: UserRole;
};

type DreamDraft = {
  dreamAt: string;
  dreamText: string;
  wakingLife: string;
  mood: string;
};

type Stage = "home" | "choose" | "consult" | "analysis" | "inner" | "archive" | "profile" | "settings" | "letter" | "sea" | "admin";
type ThemeMode = "dark" | "light";
type AuthMode = "signin" | "signup" | "magiclink" | "reset" | "resend";
type AnalysisFeedback = "hit" | "miss" | "unsure";

type NavItem = {
  stage: Stage;
  label: string;
  icon: LucideIcon;
  count?: string;
  adminOnly?: boolean;
};

type DreamRecord = {
  id: string;
  createdAt: string;
  analystKey: AnalystKey;
  analystName: string;
  dream: DreamDraft;
  followupAnswers: Array<{
    question: string;
    answer: string;
  }>;
  analysis: DreamAnalysis;
  image?: GeneratedImage | null;
  feedback?: AnalysisFeedback | null;
  feedbackNote?: string | null;
  qa: Array<{
    question: string;
    answer: string;
    reflection: string;
  }>;
};

type ProfileSnapshot = {
  id: string;
  createdAt: string;
  dreamRecordId: string | null;
  profile: string;
  changeSummary: string;
  motifs: string[];
  feedback: AnalysisFeedback | null;
};

type StoredState = {
  user: SessionUser | null;
  selectedAnalyst: AnalystKey | null;
  stage: Stage;
  consultStep?: number;
  profile: string;
  dream: DreamDraft;
  followups: FollowupQuestions | null;
  followupAnswers: string[];
  analysis: DreamAnalysis | null;
  dreamContext: string;
  qa: Array<{
    question: string;
    answer: string;
    reflection: string;
  }>;
  records: DreamRecord[];
  profileSnapshots?: ProfileSnapshot[];
  activeRecordId: string | null;
};

type ConsultStep =
  | {
      kind: keyof DreamDraft;
      label: string;
      prompt: string;
      placeholder: string;
      multiline?: boolean;
    }
  | {
      kind: "followup";
      label: string;
      prompt: string;
      placeholder: string;
      index: number;
    };

const analysts: Array<{
  key: AnalystKey;
  name: string;
  english: string;
  title: string;
  note: string;
  portrait: string;
}> = [
  {
    key: "freud",
    name: "弗洛伊德",
    english: "Sigmund Freud",
    title: "欲望、压抑、早期经验",
    note: "当梦触及家庭、亲密、羞耻、禁忌或旧记忆，他会从被遮蔽的愿望开始。",
    portrait: "/portraits/freud.jpg"
  },
  {
    key: "jung",
    name: "荣格",
    english: "Carl Jung",
    title: "原型、阴影、自性化",
    note: "当梦里有陌生人物、神话感、黑暗空间或强烈象征，他会倾听梦如何召唤完整的你。",
    portrait: "/portraits/jung.jpg"
  },
  {
    key: "adler",
    name: "阿德勒",
    english: "Alfred Adler",
    title: "自卑、补偿、生活目标",
    note: "当梦关乎失败、竞争、位置、勇气和方向，他会看见你如何走向自己的目标。",
    portrait: "/portraits/adler.jpg"
  }
];

const initialDream: DreamDraft = {
  dreamAt: "",
  dreamText: "",
  wakingLife: "",
  mood: ""
};

const intakeSteps: ConsultStep[] = [
  {
    kind: "dreamAt",
    label: "时间",
    prompt: "这个梦发生在什么时候？不需要精确，但请给它一个时间位置。",
    placeholder: "例如：昨晚凌晨三点左右，或最近一周反复出现。"
  },
  {
    kind: "dreamText",
    label: "事件",
    prompt: "请讲述梦里发生的事。场景、人物、动作、光线和你醒来后还记得的细节都可以。",
    placeholder: "像讲述一段刚刚退潮的电影。越具体越好。",
    multiline: true
  },
  {
    kind: "wakingLife",
    label: "现实",
    prompt: "在这个梦前后，现实里有什么正在牵动你？工作、关系、家庭、身体或某个选择都可以。",
    placeholder: "写下你觉得可能有关的现实线索。",
    multiline: true
  },
  {
    kind: "mood",
    label: "余温",
    prompt: "醒来后，身体或情绪留下些什么？",
    placeholder: "例如：胸口紧、平静、羞耻、被看见、像失去了什么。"
  }
];

const storageKey = "idream.mvp.state.v3";
const signupCooldownKey = "idream.auth.signup.cooldownUntil";
const signupCooldownMs = 60 * 1000;


const stageLabels: Record<Stage, { label: string; eyebrow: string }> = {
  home: { label: "中庭", eyebrow: "Court" },
  choose: { label: "选择分析者", eyebrow: "Analyst" },
  consult: { label: "咨询室", eyebrow: "Consultation" },
  analysis: { label: "梦境解析", eyebrow: "Reading" },
  inner: { label: "内心三问", eyebrow: "Inner Questions" },
  archive: { label: "梦境档案", eyebrow: "Archive" },
  profile: { label: "内在画像", eyebrow: "Profile" },
  settings: { label: "设置", eyebrow: "Settings" },
  letter: { label: "梦后信件", eyebrow: "Letter" },
  sea: { label: "夜海", eyebrow: "Night Sea" },
  admin: { label: "管理后台", eyebrow: "Admin" }
};

function getAnalyst(key: AnalystKey | null) {
  return analysts.find((analyst) => analyst.key === key) || null;
}

function getReadingLetter(analysis: DreamAnalysis, name?: string) {
  if (analysis.letter) {
    return analysis.letter;
  }

  return [
    `${name || "来访者"}，我想把这次梦先轻轻放在这里。`,
    analysis.opening,
    analysis.hiddenNeed || analysis.presentTension,
    analysis.ritual ? `今晚可以只做一件很小的事：${analysis.ritual}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toDreamRecord(row: DreamRecordRow): DreamRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    analystKey: row.analyst_key,
    analystName: row.analyst_name,
    dream: {
      dreamAt: row.dream_at || "",
      dreamText: row.dream_text,
      wakingLife: row.waking_life || "",
      mood: row.mood || ""
    },
    followupAnswers: row.followup_answers || [],
    analysis: row.analysis,
    image: row.image_url
      ? {
          imageUrl: row.image_url,
          mimeType: row.image_mime_type || "image/png"
        }
      : null,
    feedback: row.feedback || null,
    feedbackNote: row.feedback_note || null,
    qa: row.inner_questions || []
  };
}

function toProfileSnapshot(row: ProfileSnapshotRow): ProfileSnapshot {
  return {
    id: row.id,
    createdAt: row.created_at,
    dreamRecordId: row.dream_record_id,
    profile: row.profile,
    changeSummary: row.change_summary || "",
    motifs: row.motifs || [],
    feedback: row.feedback || null
  };
}

function summarizeProfileChange(analysis: DreamAnalysis) {
  return [analysis.coreConflict, analysis.hiddenNeed, analysis.relationshipPattern]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 900);
}

function isMissingDatabaseShape(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message || "";

  return (
    maybeError.code === "42P01" ||
    maybeError.code === "42703" ||
    maybeError.code === "PGRST204" ||
    message.includes("schema cache") ||
    message.includes("profile_snapshots") ||
    message.includes("image_url") ||
    message.includes("feedback") ||
    message.includes("psychological_profile")
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybeError = error as { message?: string; details?: string; hint?: string; code?: string };
    return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code].filter(Boolean).join(" / ") || "未知错误";
  }

  return String(error || "未知错误");
}

function buildSessionUser(profile: ProfileRow | null, authUser?: SupabaseUser | null): SessionUser {
  return {
    id: profile?.id || authUser?.id,
    email: profile?.email || authUser?.email || "",
    name: profile?.display_name || authUser?.user_metadata?.display_name || authUser?.email?.split("@")[0] || "来访者",
    intention: profile?.intention || authUser?.user_metadata?.intention || "",
    role: profile?.role || "user"
  };
}

function getSignupCooldownUntil() {
  if (typeof window === "undefined") {
    return 0;
  }

  const raw = window.localStorage.getItem(signupCooldownKey);
  const value = raw ? Number(raw) : 0;

  return Number.isFinite(value) ? value : 0;
}


export default function Home() {
  const supabaseEnabled = hasSupabaseBrowserEnv();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loginName, setLoginName] = useState("");
  const [loginIntention, setLoginIntention] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authReady, setAuthReady] = useState(!supabaseEnabled);
  const [stage, setStage] = useState<Stage>("home");
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [selectedAnalyst, setSelectedAnalyst] = useState<AnalystKey | null>(null);
  const [consultStep, setConsultStep] = useState(0);
  const [dream, setDream] = useState<DreamDraft>(initialDream);
  const [followups, setFollowups] = useState<FollowupQuestions | null>(null);
  const [followupAnswers, setFollowupAnswers] = useState<string[]>(Array(5).fill(""));
  const [analysis, setAnalysis] = useState<DreamAnalysis | null>(null);
  const [profile, setProfile] = useState("");
  const [dreamContext, setDreamContext] = useState("");
  const [qa, setQa] = useState<StoredState["qa"]>([]);
  const [records, setRecords] = useState<DreamRecord[]>([]);
  const [profileSnapshots, setProfileSnapshots] = useState<ProfileSnapshot[]>([]);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const audio = useRoomAudio();
  const [isGeneratingFollowups, setIsGeneratingFollowups] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminBottles, setAdminBottles] = useState<DriftBottleRow[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [bottleText, setBottleText] = useState("");
  const [receivedBottle, setReceivedBottle] = useState<DriftBottleRow | null>(null);
  const [isBottleLoading, setIsBottleLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [signupCooldownUntil, setSignupCooldownUntil] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [error, setError] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [stage, user?.id, user?.name]);

  useEffect(() => {
    const storedCooldownUntil = getSignupCooldownUntil();

    if (storedCooldownUntil > Date.now()) {
      setSignupCooldownUntil(storedCooldownUntil);
    }

    const raw = window.localStorage.getItem(storageKey);
    const storedTheme = window.localStorage.getItem("idream.theme");
    const nextTheme = storedTheme === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.body.dataset.theme = nextTheme;

    if (!raw) {
      return;
    }

    try {
      const stored = JSON.parse(raw) as StoredState;
      setUser(stored.user);
      setLoginName(stored.user?.name || "");
      setLoginIntention(stored.user?.intention || "");
      setSelectedAnalyst(stored.selectedAnalyst || null);
      setStage(stored.stage || "home");
      setProfile(stored.profile || "");
      setDream(stored.dream || initialDream);
      setFollowups(stored.followups || null);
      setFollowupAnswers(stored.followupAnswers || Array(5).fill(""));
      setAnalysis(stored.analysis || null);
      setDreamContext(stored.dreamContext || "");
      setQa(stored.qa || []);
      setRecords(stored.records || []);
      setProfileSnapshots(stored.profileSnapshots || []);
      setActiveRecordId(stored.activeRecordId || null);
      setSelectedArchiveId(stored.activeRecordId || stored.records?.[0]?.id || null);
      setConsultStep(Number.isInteger(stored.consultStep) ? Math.max(0, Math.min(stored.consultStep!, 8)) : stored.followups ? Math.min(4 + stored.followups.questions.length, 8) : 0);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    if (signupCooldownUntil <= nowMs) {
      if (signupCooldownUntil > 0 && typeof window !== "undefined") {
        window.localStorage.removeItem(signupCooldownKey);
        setSignupCooldownUntil(0);
      }
      return;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [nowMs, signupCooldownUntil]);

  useEffect(() => {
    window.localStorage.setItem("idream.theme", theme);
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const localRecords = records.map((record) => ({
      ...record,
      image: record.image?.imageUrl.startsWith("data:") ? null : record.image
    }));
    const state: StoredState = {
      user,
      selectedAnalyst,
      stage,
      consultStep,
      profile,
      dream,
      followups,
      followupAnswers,
      analysis,
      dreamContext,
      qa,
      records: localRecords,
      profileSnapshots,
      activeRecordId
    };

    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [activeRecordId, analysis, consultStep, dream, dreamContext, followupAnswers, followups, profile, profileSnapshots, qa, records, selectedAnalyst, stage, user]);

  const analyst = getAnalyst(selectedAnalyst);
  const consultSteps = useMemo<ConsultStep[]>(() => {
    if (!followups || followups.questions.length === 0) {
      return intakeSteps;
    }

    return [
      ...intakeSteps,
      ...followups.questions.map((prompt, index) => ({
        kind: "followup" as const,
        label: `追问 ${index + 1}`,
        prompt,
        placeholder: "请按你的真实感受回答，可以很短，也可以保留不确定。",
        index
      }))
    ];
  }, [followups]);
  const currentStep = consultSteps[Math.min(consultStep, consultSteps.length - 1)] || intakeSteps[0];
  const currentAnswer = getStepValue(currentStep);
  const questionSlots = 3 - qa.length;
  const motifs = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((record) => {
      record.analysis.motifs?.forEach((motif) => counts.set(motif, (counts.get(motif) || 0) + 1));
    });

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [records]);
  const selectedArchive = records.find((record) => record.id === selectedArchiveId) || records[0] || null;
  const totalQaCount = records.reduce((sum, record) => sum + record.qa.length, 0);
  const stageLabel = stageLabels[stage];
  const signupCooldownRemainingSeconds = Math.max(0, Math.ceil((signupCooldownUntil - nowMs) / 1000));

  function getStepValue(step: ConsultStep) {
    if (step.kind === "followup") {
      return followupAnswers[step.index] || "";
    }

    return dream[step.kind] || "";
  }

  function setStepValue(step: ConsultStep, value: string) {
    if (step.kind === "followup") {
      setFollowupAnswers((current) => {
        const next = [...current];
        next[step.index] = value;
        return next;
      });
      return;
    }

    setDream((current) => ({ ...current, [step.kind]: value }));
  }

  const hydrateCloudUser = useCallback(async (authUser: SupabaseUser) => {
    if (!supabaseEnabled) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    setIsCloudSyncing(true);
    setError("");

    try {
      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle<ProfileRow>();

      if (profileError) {
        throw profileError;
      }

      const resolvedUser = buildSessionUser(profileRow, authUser);
      setUser(resolvedUser);
      setLoginName(resolvedUser.name);
      setLoginEmail(resolvedUser.email || "");
      setLoginIntention(resolvedUser.intention);
      setProfile(profileRow?.psychological_profile || "");

      const { data: dreamRows, error: dreamsError } = await supabase
        .from("dream_records")
        .select(
          "id,user_id,analyst_key,analyst_name,dream_at,dream_text,waking_life,mood,followup_answers,analysis,inner_questions,created_at,updated_at,image_url,image_prompt,image_mime_type,feedback,feedback_note"
        )
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .returns<DreamRecordRow[]>();

      if (dreamsError) {
        if (!isMissingDatabaseShape(dreamsError)) {
          throw dreamsError;
        }

        const { data: fallbackDreamRows, error: fallbackDreamsError } = await supabase
          .from("dream_records")
          .select("id,user_id,analyst_key,analyst_name,dream_at,dream_text,waking_life,mood,followup_answers,analysis,inner_questions,created_at,updated_at")
          .eq("user_id", authUser.id)
          .order("created_at", { ascending: false })
          .returns<DreamRecordRow[]>();

        if (fallbackDreamsError) {
          throw fallbackDreamsError;
        }

        const nextRecords = (fallbackDreamRows || []).map(toDreamRecord);
        setRecords(nextRecords);
        setActiveRecordId(nextRecords[0]?.id || null);
        setSelectedArchiveId(nextRecords[0]?.id || null);
      } else {
        const nextRecords = (dreamRows || []).map(toDreamRecord);
        setRecords(nextRecords);
        setActiveRecordId(nextRecords[0]?.id || null);
        setSelectedArchiveId(nextRecords[0]?.id || null);
      }

      const { data: snapshotRows, error: snapshotsError } = await supabase
        .from("profile_snapshots")
        .select("*")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(30)
        .returns<ProfileSnapshotRow[]>();

      if (snapshotsError) {
        if (!isMissingDatabaseShape(snapshotsError)) {
          throw snapshotsError;
        }

        setProfileSnapshots([]);
      } else {
        setProfileSnapshots((snapshotRows || []).map(toProfileSnapshot));
      }
      setStage((current) => (current === "admin" && resolvedUser.role !== "admin" ? "home" : current));
      setAuthNotice("已经进入你的梦境咨询室。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取云端数据失败。");
    } finally {
      setIsCloudSyncing(false);
    }
  }, [supabaseEnabled]);

  useEffect(() => {
    if (!supabaseEnabled) {
      setAuthReady(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    async function loadSession() {
      setAuthReady(false);
      try {
        const { data: { user: authUser }, error: sessionError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (sessionError && sessionError.name !== "AuthSessionMissingError") throw sessionError;
        if (authUser) await hydrateCloudUser(authUser);
        else setUser(null);
      } catch (caught) {
        if (!cancelled) {
          setUser(null);
          setError(authErrorMessage(caught));
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }

    void loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      if (event === "PASSWORD_RECOVERY") {
        window.location.assign("/auth/reset-password");
        return;
      }
      if (!session?.user) {
        setUser(null);
        setRecords([]);
        setProfile("");
        setAuthReady(true);
        return;
      }

      // Run database calls after Supabase releases its auth callback lock.
      window.setTimeout(() => { if (!cancelled) void hydrateCloudUser(session.user); }, 0);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [hydrateCloudUser, supabaseEnabled]);

  async function enterRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (supabaseEnabled) {
      setIsAuthenticating(true);
      setError("");
      setAuthNotice("");

      try {
        const supabase = getSupabaseBrowserClient();
        const email = loginEmail.trim();
        const password = loginPassword;

        if (!email) throw new Error("请填写邮箱地址。");

        if (authMode !== "signin" && signupCooldownRemainingSeconds > 0) {
          throw new Error(`邮件已发送，请 ${signupCooldownRemainingSeconds} 秒后再试。`);
        }

        const redirectTo = `${window.location.origin}/auth/confirm`;
        if (authMode === "magiclink" || authMode === "reset" || authMode === "resend") {
          const result = authMode === "reset"
            ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${redirectTo}?next=/auth/reset-password` })
            : authMode === "resend"
              ? await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } })
              : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
          if (result.error) throw result.error;
          const cooldownUntil = Date.now() + signupCooldownMs;
          setNowMs(Date.now());
          setSignupCooldownUntil(cooldownUntil);
          window.localStorage.setItem(signupCooldownKey, String(cooldownUntil));
          setAuthNotice(authMode === "reset" ? "如果这个邮箱已注册，你会收到重置密码的邮件。" : "邮件已发送，请检查收件箱和垃圾邮件，并在当前浏览器打开链接。");
          return;
        }

        if (password.length < (authMode === "signup" ? 8 : 6)) throw new Error(authMode === "signup" ? "请设置至少 8 位密码。" : "请填写密码（至少 6 位）。");

        const result =
          authMode === "signup"
            ? await supabase.auth.signUp({
                email,
                password,
                options: {
                  emailRedirectTo: redirectTo,
                  data: {
                    display_name: loginName.trim() || "来访者",
                    intention: loginIntention.trim()
                  }
                }
              })
            : await supabase.auth.signInWithPassword({ email, password });

        if (result.error) {
          throw result.error;
        }

        if (authMode === "signup") {
          const nextCooldownUntil = Date.now() + signupCooldownMs;
          setNowMs(Date.now());
          setSignupCooldownUntil(nextCooldownUntil);
          window.localStorage.setItem(signupCooldownKey, String(nextCooldownUntil));
        }

        const authUser = result.data.session?.user || (authMode === "signin" ? result.data.user : null);

        if (!authUser) {
          setAuthNotice("注册请求已发送。请打开邮箱确认链接；确认成功后会回到登录页。短时间内只支持提交一次注册。");
          setAuthMode("signin");
          setLoginPassword("");
          return;
        }

        await hydrateCloudUser(authUser);
        if (authMode === "signup") {
          await syncProfile({
            displayName: loginName.trim() || "来访者",
            intention: loginIntention.trim(),
            psychologicalProfile: profile
          });
        }
        setAuthNotice(authMode === "signup" ? "注册成功，正在进入中庭。" : "登录成功，正在进入中庭。");
        setStage("home");
      } catch (caught) {
        setError(authErrorMessage(caught));
      } finally {
        setIsAuthenticating(false);
      }

      return;
    }

    setUser({
      name: loginName.trim() || "来访者",
      intention: loginIntention.trim()
    });
    setAuthNotice("已进入本地体验模式。");
    setStage("home");
  }

  async function signOut() {
    audio.stop();
    if (supabaseEnabled) {
      await getSupabaseBrowserClient().auth.signOut();
    }

    setUser(null);
    setRecords([]);
    setProfileSnapshots([]);
    setProfile("");
    setAnalysis(null);
    setGeneratedImage(null);
    setQa([]);
    setStage("home");
  }

  async function exportArchive() {
    setError("");

    try {
      if (!supabaseEnabled) {
        const payload = {
          exportedAt: new Date().toISOString(),
          mode: "local",
          user,
          profile,
          records,
          profileSnapshots
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `idream-local-export-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      const response = await fetch("/api/account/export");
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "导出失败。");
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `idream-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setAuthNotice("档案已导出为 JSON 文件。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导出失败。");
    }
  }

  async function deleteCloudMemory() {
    setError("");

    if (!window.confirm("确认删除云端梦境、画像快照和漂流瓶记录吗？这个操作不能撤销。")) {
      return;
    }

    try {
      if (supabaseEnabled) {
        const response = await fetch("/api/account/delete", {
          method: "POST"
        });
        const data = (await response.json()) as { ok?: true; error?: string };

        if (!response.ok || data.error) {
          throw new Error(data.error || "删除失败。");
        }
      }

      clearMemory();
      setRecords([]);
      setProfileSnapshots([]);
      setAuthNotice(supabaseEnabled ? "云端记忆已清空，账户仍保留。" : "本地记忆已清空。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败。");
    }
  }

  async function syncProfile({
    displayName,
    intention,
    psychologicalProfile
  }: {
    displayName?: string;
    intention?: string;
    psychologicalProfile?: string;
  }) {
    if (!supabaseEnabled || !user?.id) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        display_name: displayName ?? user.name,
        intention: intention ?? user.intention,
        psychological_profile: psychologicalProfile ?? profile
      })
      .eq("id", user.id);

    if (updateError) {
      if (isMissingDatabaseShape(updateError)) {
        return;
      }

      throw updateError;
    }
  }

  async function saveDreamRecordToCloud(record: DreamRecord) {
    if (!supabaseEnabled || !user?.id) {
      return record.id;
    }

    const response = await fetch("/api/dreams", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        analystKey: record.analystKey,
        analystName: record.analystName,
        dream: record.dream,
        followupAnswers: record.followupAnswers,
        analysis: record.analysis,
        image: record.image || null,
        feedback: record.feedback || null,
        feedbackNote: record.feedbackNote || null,
        qa: record.qa
      })
    });

    const data = (await response.json().catch(() => ({ error: "服务器返回了无法解析的保存响应。" }))) as { record?: DreamRecordRow; error?: string };

    if (!response.ok || data.error || !data.record?.id) {
      throw new Error(data.error || `保存失败（${response.status}）。`);
    }

    return data.record.id;
  }

  async function saveProfileSnapshotToCloud({
    recordId,
    nextProfile,
    nextAnalysis,
    feedback
  }: {
    recordId: string;
    nextProfile: string;
    nextAnalysis: DreamAnalysis;
    feedback?: AnalysisFeedback | null;
  }) {
    const localSnapshot: ProfileSnapshot = {
      id: `${Date.now()}-profile`,
      createdAt: new Date().toISOString(),
      dreamRecordId: recordId,
      profile: nextProfile,
      changeSummary: summarizeProfileChange(nextAnalysis),
      motifs: nextAnalysis.motifs || [],
      feedback: feedback || null
    };

    setProfileSnapshots((current) => [localSnapshot, ...current].slice(0, 30));

    if (!supabaseEnabled || !user?.id) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data, error: insertError } = await supabase
      .from("profile_snapshots")
      .insert({
        user_id: user.id,
        dream_record_id: recordId,
        profile: nextProfile,
        change_summary: localSnapshot.changeSummary,
        motifs: localSnapshot.motifs,
        feedback: feedback || null
      })
      .select("*")
      .single<ProfileSnapshotRow>();

    if (insertError) {
      if (isMissingDatabaseShape(insertError)) {
        return;
      }

      throw insertError;
    }

    setProfileSnapshots((current) => current.map((item) => (item.id === localSnapshot.id ? toProfileSnapshot(data) : item)));
  }

  async function updateCloudRecordQa(recordId: string, nextQa: DreamRecord["qa"], nextProfile: string) {
    if (!supabaseEnabled || !user?.id) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { error: recordError } = await supabase.from("dream_records").update({ inner_questions: nextQa }).eq("id", recordId);

    if (recordError) {
      throw recordError;
    }

    await syncProfile({ psychologicalProfile: nextProfile });
  }

  async function updateRecordExtras(recordId: string, updates: Partial<Pick<DreamRecord, "image" | "feedback" | "feedbackNote">>) {
    setRecords((current) =>
      current.map((record) =>
        record.id === recordId
          ? {
              ...record,
              ...updates
            }
          : record
      )
    );

    if (!supabaseEnabled || !user?.id) {
      return;
    }

    const payload: Record<string, string | null> = {};

    if ("image" in updates) {
      const persistedImage = updates.image?.imageUrl.startsWith("data:") ? null : updates.image;
      payload.image_url = persistedImage?.imageUrl || null;
      payload.image_mime_type = persistedImage?.mimeType || null;
      payload.image_prompt = persistedImage ? analysis?.imagePrompt || null : null;
    }

    if ("feedback" in updates) {
      payload.feedback = updates.feedback || null;
    }

    if ("feedbackNote" in updates) {
      payload.feedback_note = updates.feedbackNote || null;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { error: updateError } = await supabase
      .from("dream_records")
      .update(payload)
      .eq("id", recordId);

    if (updateError) {
      if (isMissingDatabaseShape(updateError)) {
        return;
      }

      throw updateError;
    }
  }

  async function updateLatestProfileSnapshotFeedback(recordId: string, value: AnalysisFeedback) {
    setProfileSnapshots((current) => current.map((item) => (item.dreamRecordId === recordId ? { ...item, feedback: value } : item)));

    if (!supabaseEnabled || !user?.id) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data: snapshot, error: selectError } = await supabase
      .from("profile_snapshots")
      .select("id")
      .eq("user_id", user.id)
      .eq("dream_record_id", recordId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (selectError) {
      if (isMissingDatabaseShape(selectError)) {
        return;
      }

      throw selectError;
    }

    if (!snapshot?.id) {
      return;
    }

    const { error: updateError } = await supabase
      .from("profile_snapshots")
      .update({
        feedback: value
      })
      .eq("id", snapshot.id);

    if (updateError) {
      if (isMissingDatabaseShape(updateError)) {
        return;
      }

      throw updateError;
    }
  }

  async function submitAnalysisFeedback(value: AnalysisFeedback) {
    if (!activeRecordId || !analysis) {
      return;
    }

    try {
      await updateRecordExtras(activeRecordId, {
        feedback: value,
        feedbackNote: value === "hit" ? "用户觉得这次分析说中了。" : value === "miss" ? "用户觉得这次分析没有说中。" : "用户暂时不确定这次分析。"
      });
      await updateLatestProfileSnapshotFeedback(activeRecordId, value);
      setAuthNotice(value === "hit" ? "已记录：这次分析说中了。" : value === "miss" ? "已记录：这次分析没有说中。" : "已记录：你暂时不确定。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "记录反馈失败。");
    }
  }

  async function loadAdminDashboard() {
    if (!supabaseEnabled || user?.role !== "admin") {
      return;
    }

    setIsAdminLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/overview");
      const data = (await response.json()) as { stats: AdminStats; bottles: DriftBottleRow[] } | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "读取管理后台失败。");
      }

      setAdminStats(data.stats);
      setAdminBottles(data.bottles);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取管理后台失败。");
    } finally {
      setIsAdminLoading(false);
    }
  }

  async function moderateBottle(id: string, status: BottleStatus, note?: string) {
    setIsAdminLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/bottles", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id, status, note })
      });
      const data = (await response.json()) as { ok: true } | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "审核失败。");
      }

      await loadAdminDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "审核失败。");
    } finally {
      setIsAdminLoading(false);
    }
  }

  async function submitBottle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabaseEnabled) {
      setError("配置 Supabase 后才能投递漂流瓶。");
      return;
    }

    setIsBottleLoading(true);
    setError("");

    try {
      const response = await fetch("/api/bottles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ body: bottleText })
      });
      const data = (await response.json()) as { bottle: DriftBottleRow } | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "投递失败。");
      }

      setBottleText("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "投递失败。");
    } finally {
      setIsBottleLoading(false);
    }
  }

  async function receiveBottle() {
    if (!supabaseEnabled) {
      setError("配置 Supabase 后才能捞起漂流瓶。");
      return;
    }

    setIsBottleLoading(true);
    setError("");

    try {
      const response = await fetch("/api/bottles");
      const data = (await response.json()) as { bottle: DriftBottleRow | null } | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "捞取失败。");
      }

      setReceivedBottle(data.bottle);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "捞取失败。");
    } finally {
      setIsBottleLoading(false);
    }
  }

  async function generateAnalysisImage() {
    if (!analysis?.imagePrompt) {
      setError("当前解析还没有可用于生图的提示词。");
      return;
    }

    if (!window.confirm("生成梦境意象可能需要几十秒，并会消耗一次生图额度。确定现在生成吗？")) {
      return;
    }

    setIsGeneratingImage(true);
    setImageError("");

    try {
      const response = await fetch("/api/image", {
        method: "POST",
        signal: AbortSignal.timeout(55000),
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: analysis.imagePrompt,
          title: analysis.title
        })
      });
      const data = (await response.json().catch(() => ({ error: "生图服务未及时回应，请稍后重试。" }))) as GeneratedImage | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "生成图片失败。");
      }

      setGeneratedImage(data);
    } catch (caught) {
      setImageError(caught instanceof Error && /timeout|abort/i.test(caught.name) ? "生成等待超时，请稍后重试。" : caught instanceof Error ? caught.message : "生成图片失败。");
    } finally {
      setIsGeneratingImage(false);
    }
  }

  function chooseAnalyst(key: AnalystKey) {
    setSelectedAnalyst(key);
    setStage("consult");
    setConsultStep(0);
    setDream(initialDream);
    setFollowups(null);
    setFollowupAnswers(Array(5).fill(""));
    setAnalysis(null);
    setGeneratedImage(null);
    setQa([]);
    setDreamContext("");
    setError("");
  }

  function resetDream() {
    if (!analysis && dream.dreamText.trim() && !window.confirm("还有一个未完成的梦。开始新梦会替换当前草稿，继续吗？")) return;
    setStage("choose");
    setConsultStep(0);
    setDream(initialDream);
    setFollowups(null);
    setFollowupAnswers(Array(5).fill(""));
    setAnalysis(null);
    setGeneratedImage(null);
    setQa([]);
    setDreamContext("");
    setError("");
  }

  function openArchivedRecord(record: DreamRecord) {
    setSelectedAnalyst(record.analystKey);
    setDream(record.dream);
    setAnalysis(record.analysis);
    setQa(record.qa);
    setActiveRecordId(record.id);
    setSelectedArchiveId(record.id);
    setGeneratedImage(record.image || null);
    setImageError("");
    setDreamContext(JSON.stringify({ dream: record.dream, analysis: record.analysis }));
    setError("");
    setStage("analysis");
  }

  function clearMemory() {
    window.localStorage.removeItem(storageKey);
    if (!supabaseEnabled) {
      setSelectedAnalyst(null);
    }
    setProfile("");
    setAnalysis(null);
    setGeneratedImage(null);
    setDreamContext("");
    setFollowups(null);
    setFollowupAnswers(Array(5).fill(""));
    setQa([]);
    setDream(initialDream);
    if (!supabaseEnabled) {
      setRecords([]);
    }
    setActiveRecordId(null);
    setSelectedArchiveId(null);
    setConsultStep(0);
    setStage("home");
  }

  async function advanceConsult() {
    if (!selectedAnalyst) {
      setStage("choose");
      return;
    }

    setError("");

    if (currentStep.kind === "dreamText" && dream.dreamText.trim().length < 12) {
      setError("请至少写下十几个字的梦境内容。");
      return;
    }

    if (!followups && consultStep === intakeSteps.length - 1) {
      await requestNextFollowup([]);
      return;
    }

    if (followups && currentStep.kind === "followup") {
      if (currentStep.index < followups.questions.length - 1) {
        setConsultStep((current) => current + 1);
        return;
      }

      const answered = followups.questions.map((item, index) => ({
        question: item,
        answer: followupAnswers[index] || ""
      }));

      if (currentStep.index >= 4) {
        await requestAnalysis();
        return;
      }

      await requestNextFollowup(answered);
      return;
    }

    if (followups && consultStep >= consultSteps.length - 1) {
      await requestAnalysis();
      return;
    }

    setConsultStep((current) => current + 1);
  }

  async function requestNextFollowup(
    previousAnswers = followups
      ? followups.questions.map((item, index) => ({
          question: item,
          answer: followupAnswers[index] || ""
        }))
      : []
  ) {
    if (!selectedAnalyst) {
      return;
    }

    setIsGeneratingFollowups(true);

    try {
      const response = await fetch("/api/followup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...dream,
          selectedAnalyst,
          previousProfile: profile,
          previousAnswers,
          questionIndex: previousAnswers.length
        })
      });

      const data = (await response.json()) as { analystKey: AnalystKey; analystName: string; question: string } | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "生成追问失败。");
      }

      const nextQuestion = data.question;
      const nextIndex = previousAnswers.length;
      setFollowups((current) => ({
        analystKey: selectedAnalyst,
        analystName: analyst?.name || data.analystName,
        introduction: current?.introduction || "我会先顺着你刚才说的内容，一次只问一个问题。这样我们不是在填表，而是在慢慢靠近这个梦。",
        questions: [...(current?.questions || []), nextQuestion].slice(0, 5)
      }));
      setFollowupAnswers((current) => {
        const next = [...current];
        if (next.length < 5) {
          next.length = 5;
        }
        return next;
      });
      setConsultStep(intakeSteps.length + nextIndex);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成追问失败。");
    } finally {
      setIsGeneratingFollowups(false);
    }
  }

  async function requestAnalysis() {
    if (!selectedAnalyst || !followups) {
      return;
    }

    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...dream,
          selectedAnalyst,
          previousProfile: profile,
          followupAnswers: followups.questions.map((item, index) => ({
            question: item,
            answer: followupAnswers[index] || ""
          }))
        })
      });

      const data = (await response.json().catch(() => ({ error: "服务器返回了无法解析的响应。" }))) as DreamAnalysis | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? `分析失败（${response.status}）：${data.error}` : `分析失败（${response.status}）。`);
      }

      const followupPayload = followups.questions.map((item, index) => ({
        question: item,
        answer: followupAnswers[index] || ""
      }));
      const localRecord: DreamRecord = {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        analystKey: selectedAnalyst,
        analystName: analyst?.name || data.readings[0]?.name || "未选择",
        dream,
        followupAnswers: followupPayload,
        analysis: data,
        qa: []
      };

      setAnalysis(data);
      setProfile(data.updatedProfile);
      setQa([]);
      setActiveRecordId(localRecord.id);
      setSelectedArchiveId(localRecord.id);
      setRecords((current) => [localRecord, ...current]);
      setDreamContext(
        [
          `咨询师：${analyst?.name || data.readings[0]?.name || "未选择"}`,
          `梦名：${data.title}`,
          `梦境：${dream.dreamText}`,
          `现实处境：${dream.wakingLife || "未填写"}`,
          `五个追问：${followupPayload.map((item) => `${item.question} ${item.answer || "未填写"}`).join(" / ")}`,
          `当前张力：${data.presentTension}`,
          `境况猜测：${data.lifeGuess}`
        ].join("\n")
      );
      setStage("analysis");

      void (async () => {
        let recordId: string;

        try {
          recordId = await saveDreamRecordToCloud(localRecord);
          const savedRecord = { ...localRecord, id: recordId };

          setActiveRecordId(recordId);
          setSelectedArchiveId(recordId);
          setRecords((current) => current.map((record) => (record.id === localRecord.id ? savedRecord : record)));
          setAuthNotice(supabaseEnabled ? "解析已保存到云端。" : "解析已保存到本地档案。");
        } catch (recordSaveError) {
          console.error("[analysis-save] dream record failed:", recordSaveError);
          setAuthNotice(`解析已显示，但梦境档案暂时没有保存到云端：${getErrorMessage(recordSaveError)}`);
          return;
        }

        try {
          if (supabaseEnabled) {
            await syncProfile({ psychologicalProfile: data.updatedProfile });
          }

          await saveProfileSnapshotToCloud({
            recordId,
            nextProfile: data.updatedProfile,
            nextAnalysis: data
          });
        } catch (extrasSaveError) {
          console.error("[analysis-save] extras failed:", extrasSaveError);
          setAuthNotice(`解析档案已保存，但内在画像同步暂时失败：${getErrorMessage(extrasSaveError)}`);
        }
      })();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "分析失败。");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (qa.length >= 3) {
      return;
    }

    setError("");
    setIsAsking(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question,
          previousProfile: profile,
          dreamContext,
          history: qa.map((item) => ({
            question: item.question,
            answer: item.answer
          }))
        })
      });

      const data = (await response.json()) as QuestionAnswer | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "回答失败。");
      }

      setProfile(data.updatedProfile);
      const nextQuestion = question;
      const nextQa = [
        ...qa,
        {
          question: nextQuestion,
          answer: data.answer,
          reflection: data.reflection
        }
      ];
      setQa(nextQa);
      setRecords((current) => {
        if (!analysis) {
          return current;
        }

        return current.map((record) => (record.id === activeRecordId ? { ...record, qa: nextQa } : record));
      });
      if (activeRecordId) {
        await updateCloudRecordQa(activeRecordId, nextQa, data.updatedProfile);
      }
      setQuestion("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "回答失败。");
    } finally {
      setIsAsking(false);
    }
  }

  if (!authReady) {
    return (
      <main className="dream-shell flex min-h-screen items-center justify-center px-5">
        <section className="dream-panel max-w-md p-8 text-center">
          <Hourglass className="mx-auto animate-spin dream-muted" size={22} />
          <h1 className="mt-5 font-serif text-3xl font-semibold">正在打开房间</h1>
          <p className="mt-3 text-sm leading-7 dream-muted">正在确认你的登录状态。</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        supabaseEnabled={supabaseEnabled}
        theme={theme}
        authMode={authMode}
        loginEmail={loginEmail}
        loginPassword={loginPassword}
        loginName={loginName}
        loginIntention={loginIntention}
        isAuthenticating={isAuthenticating}
        signupCooldownSeconds={signupCooldownRemainingSeconds}
        error={error}
        notice={authNotice}
        setTheme={setTheme}
        setAuthMode={(mode) => { setAuthMode(mode); setError(""); setAuthNotice(""); setLoginPassword(""); }}
        setLoginEmail={setLoginEmail}
        setLoginPassword={setLoginPassword}
        setLoginName={setLoginName}
        setLoginIntention={setLoginIntention}
        enterRoom={enterRoom}
      />
    );
  }

  return (
    <main className="dream-shell workspace-shell" data-view={stage}>
      {stage === "home" ? <DreamScene /> : null}
      <div className="workspace-layout">
        <AppNavigation
          user={user}
          stage={stage}
          analyst={analyst}
          recordsCount={records.length}
          audio={audio}
          cloudMode={supabaseEnabled}
          isSyncing={isCloudSyncing}
          onSignOut={signOut}
          onStage={(nextStage) => {
            if (nextStage === "admin") {
              void loadAdminDashboard();
            }
            setStage(nextStage);
          }}
          onNewDream={resetDream}
        />

        <section className="workspace-content">
          <header className={clsx("workspace-header dream-fade", stage === "home" && "home-workspace-header")}>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] dream-muted">{stageLabel.eyebrow}</p>
              <h1 className="mt-2 font-serif text-2xl font-medium leading-tight dream-text sm:text-3xl">{stageLabel.label}</h1>
            </div>
            <div className="flex max-w-[68%] flex-wrap items-center justify-end gap-2 text-sm dream-muted">
              {stage === "consult" ? (
                <span>
                  第 {consultStep + 1} / {intakeSteps.length + 5} 步
                </span>
              ) : null}
              {analysis && (stage === "analysis" || stage === "inner" || stage === "letter") ? (
                <button type="button" onClick={() => setStage("archive")} className="quiet-button">
                  <Archive size={15} />
                  <span>归档</span>
                </button>
              ) : null}
            </div>
          </header>

          {error ? (
            <div role="alert" className="notice-error mb-5 flex items-start gap-3">
              <CircleAlert className="mt-0.5 shrink-0" size={18} />
              <span>{error}</span>
            </div>
          ) : null}

          {!error && authNotice ? (
            <div role="status" className="notice-success mb-5 flex items-start gap-3">
              <LockKeyhole className="mt-0.5 shrink-0 text-[color:var(--dream-glow)]" size={18} />
              <span>{authNotice}</span>
            </div>
          ) : null}

          {stage === "home" ? (
            <HomeView
              user={user}
              analyst={analyst}
              records={records}
              motifs={motifs}
              totalQaCount={totalQaCount}
              hasDraft={Boolean(selectedAnalyst && dream.dreamText.trim() && !analysis)}
              onStart={() => setStage(selectedAnalyst && dream.dreamText.trim() && !analysis ? "consult" : "choose")}
              onArchive={() => {
                setStage("archive");
              }}
              onProfile={() => setStage("profile")}
              onSea={() => setStage("sea")}
              onSettings={() => setStage("settings")}
              onChoose={() => setStage("choose")}
              onOpen={openArchivedRecord}
            />
          ) : null}

          {stage === "choose" ? (
            <ChooseAnalyst selectedAnalyst={selectedAnalyst} onChoose={chooseAnalyst} />
          ) : null}

          {stage === "consult" && analyst ? (
            <ConsultRoom
              analyst={analyst}
              step={currentStep}
              stepIndex={consultStep}
              totalSteps={intakeSteps.length + 5}
              answer={currentAnswer}
              isLoading={isGeneratingFollowups || isAnalyzing}
              isAnalyzing={isAnalyzing}
              onAnswer={(value) => setStepValue(currentStep, value)}
              onNext={advanceConsult}
              onBack={() => setConsultStep((current) => Math.max(0, current - 1))}
            />
          ) : null}

          {stage === "analysis" && analysis && analyst ? (
            <AnalysisView
              analysis={analysis}
              analyst={analyst}
              profile={profile}
              generatedImage={generatedImage}
              isGeneratingImage={isGeneratingImage}
              imageError={imageError}
              activeFeedback={records.find((record) => record.id === activeRecordId)?.feedback || null}
              onInner={() => setStage("inner")}
              onLetter={() => setStage("letter")}
              onGenerateImage={generateAnalysisImage}
              onFeedback={submitAnalysisFeedback}
            />
          ) : null}

          {stage === "letter" && analysis && analyst ? (
            <LetterView analysis={analysis} analyst={analyst} user={user} onBack={() => setStage("analysis")} />
          ) : null}

          {stage === "inner" && analysis && analyst ? (
            <InnerQuestionView
              analyst={analyst}
              profile={profile}
              qa={qa}
              question={question}
              questionSlots={questionSlots}
              isAsking={isAsking}
              setQuestion={setQuestion}
              submitQuestion={submitQuestion}
              onBack={() => setStage("analysis")}
            />
          ) : null}

          {stage === "archive" ? (
            <ArchiveView
              records={records}
              motifs={motifs}
              selectedRecord={selectedArchive}
              onOpen={openArchivedRecord}
              onStart={resetDream}
              onSelect={(recordId) => {
                setSelectedArchiveId(recordId);
                setActiveRecordId(recordId);
              }}
            />
          ) : null}

          {stage === "profile" ? (
            <ProfileView profile={profile} records={records} motifs={motifs} snapshots={profileSnapshots} />
          ) : null}

          {stage === "settings" ? (
            <SettingsView
              user={user}
              theme={theme}
              audio={audio}
              recordsCount={records.length}
              cloudMode={supabaseEnabled}
              setTheme={setTheme}
              exportArchive={exportArchive}
              clearMemory={clearMemory}
              deleteCloudMemory={deleteCloudMemory}
              onSignOut={signOut}
            />
          ) : null}

          {stage === "sea" ? (
            <NightSeaView
              cloudMode={supabaseEnabled}
              bottleText={bottleText}
              receivedBottle={receivedBottle}
              isLoading={isBottleLoading}
              setBottleText={setBottleText}
              submitBottle={submitBottle}
              receiveBottle={receiveBottle}
            />
          ) : null}

          {stage === "admin" ? (
            <AdminView
              user={user}
              stats={adminStats}
              bottles={adminBottles}
              isLoading={isAdminLoading}
              onRefresh={loadAdminDashboard}
              onModerate={moderateBottle}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function AuthScreen({
  supabaseEnabled,
  theme,
  authMode,
  loginEmail,
  loginPassword,
  loginName,
  loginIntention,
  isAuthenticating,
  signupCooldownSeconds,
  error,
  notice,
  setTheme,
  setAuthMode,
  setLoginEmail,
  setLoginPassword,
  setLoginName,
  setLoginIntention,
  enterRoom
}: {
  supabaseEnabled: boolean;
  theme: ThemeMode;
  authMode: AuthMode;
  loginEmail: string;
  loginPassword: string;
  loginName: string;
  loginIntention: string;
  isAuthenticating: boolean;
  signupCooldownSeconds: number;
  error: string;
  notice: string;
  setTheme: (value: ThemeMode) => void;
  setAuthMode: (value: AuthMode) => void;
  setLoginEmail: (value: string) => void;
  setLoginPassword: (value: string) => void;
  setLoginName: (value: string) => void;
  setLoginIntention: (value: string) => void;
  enterRoom: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSignup = authMode === "signup";
  const emailOnly = authMode === "magiclink" || authMode === "reset" || authMode === "resend";
  const signupCoolingDown = authMode !== "signin" && signupCooldownSeconds > 0;
  const [showPassword, setShowPassword] = useState(false);
  const titles: Record<AuthMode, string> = { signin: "回到你的房间", signup: "留一间房给自己", magiclink: "用邮件轻轻敲门", reset: "找回你的密码", resend: "重新确认邮箱" };

  return (
    <main className="dream-shell auth-shell">
      <DreamScene />
      <div className="auth-inner">
        <header className="auth-header">
          <div>
            <p className="font-serif text-2xl font-semibold tracking-wide">Idream</p>
            <p className="mt-1 text-xs uppercase tracking-[0.28em] dream-muted">private dream room</p>
          </div>
          <div className="flex items-center gap-3 text-xs dream-muted">
            <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="icon-button" aria-label={theme === "dark" ? "切换浅色模式" : "切换深色模式"} title={theme === "dark" ? "切换浅色模式" : "切换深色模式"}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="hidden items-center gap-2 sm:inline-flex">
              <LockKeyhole size={14} />
              私密梦境档案
            </span>
          </div>
        </header>

        <section className="auth-layout">
          <div className="auth-intro">
            <p className="scene-eyebrow">BETWEEN DREAM & DAWN</p>
            <h1>Idream</h1>
            <p>在梦与醒之间，遇见自己。</p>
          </div>

          <form onSubmit={enterRoom} className="auth-form" aria-busy={isAuthenticating}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl font-medium">{supabaseEnabled ? titles[authMode] : "回到你的房间"}</h2>
              </div>
              <LockKeyhole className="dream-muted" size={18} />
            </div>

            <p className="mt-4 text-sm leading-7 dream-muted sm:mt-5">
              {supabaseEnabled
                ? isSignup
                  ? signupCoolingDown
                    ? "注册邮件已经发出。请先去邮箱确认，短时间内只支持提交一次注册。"
                    : "注册后，梦境档案会保存到你的私密账户。"
                  : authMode === "magiclink" ? "我们会寄给你一封登录邮件，无需输入密码。"
                    : authMode === "reset" ? "输入注册邮箱，接收重置密码的邮件。"
                      : authMode === "resend" ? "重新接收注册时的邮箱确认链接。"
                        : "你的梦与思绪，都在这里等你。"
                : "给自己取一个称呼，从今晚的梦开始。"}
            </p>

            {error ? (
              <div role="alert" className="notice-error mt-5 flex items-start gap-3">
                <CircleAlert className="mt-0.5 shrink-0" size={16} />
                <span>{error}</span>
              </div>
            ) : null}

            {!error && notice ? (
              <div role="status" className="notice-success mt-5 flex items-start gap-3">
                <LockKeyhole className="mt-0.5 shrink-0 text-[color:var(--dream-glow)]" size={16} />
                <span>{notice}</span>
              </div>
            ) : null}

            {supabaseEnabled && !emailOnly ? (
              <div className="segmented-control mt-6 grid grid-cols-2 gap-1" role="group" aria-label="账户方式">
                <button
                  type="button"
                  onClick={() => setAuthMode("signin")}
                  aria-pressed={!isSignup}
                  className={clsx("min-h-10 px-3 text-sm transition", !isSignup ? "bg-[color:var(--dream-glow)] text-[#0A1128]" : "dream-muted hover:text-[color:var(--dream-text)]")}
                >
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  aria-pressed={isSignup}
                  className={clsx("min-h-10 px-3 text-sm transition", isSignup ? "bg-[color:var(--dream-glow)] text-[#0A1128]" : "dream-muted hover:text-[color:var(--dream-text)]")}
                >
                  注册
                </button>
              </div>
            ) : null}

            {supabaseEnabled ? (
              <div className="mt-6 space-y-4 sm:mt-7 sm:space-y-5">
                <QuietField label="邮箱" htmlFor="email">
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    autoCapitalize="none"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    className="dream-input mt-2"
                    placeholder="you@example.com"
                  />
                </QuietField>

                {!emailOnly ? <QuietField label="密码" htmlFor="password">
                  <div className="relative mt-2"><input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={isSignup ? 8 : 6}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    className="dream-input pr-12"
                    placeholder={isSignup ? "至少 8 位" : "输入你的密码"}
                  /><button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} title={showPassword ? "隐藏密码" : "显示密码"} className="icon-button absolute right-1 top-1" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
                </QuietField> : null}
              </div>
            ) : null}

            {(!supabaseEnabled || isSignup) ? (
              <div className="mt-6 space-y-4 sm:mt-7 sm:space-y-5">
                <QuietField label="你的称呼" htmlFor="name">
                  <input
                    id="name"
                    autoComplete="nickname"
                    maxLength={40}
                    value={loginName}
                    onChange={(event) => setLoginName(event.target.value)}
                    className="dream-input mt-2"
                    placeholder="来访者"
                  />
                </QuietField>

                <QuietField label="此刻的心愿（选填）" htmlFor="intention">
                  <textarea
                    id="intention"
                    value={loginIntention}
                    onChange={(event) => setLoginIntention(event.target.value)}
                    maxLength={300}
                    className="dream-input mt-2 min-h-24 resize-y"
                    placeholder="你想从梦里靠近什么？"
                  />
                </QuietField>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isAuthenticating || signupCoolingDown}
              className="primary-button mt-6 w-full"
            >
              {isAuthenticating ? <Hourglass className="animate-spin" size={16} /> : <ArrowRight size={16} />}
              <span>
                {isAuthenticating
                  ? "请稍候"
                  : signupCoolingDown
                    ? `${signupCooldownSeconds} 秒后可重新发送`
                    : emailOnly ? "发送邮件"
                    : supabaseEnabled
                      ? isSignup
                        ? "建立账户"
                        : "进入中庭"
                      : "进入中庭"}
              </span>
            </button>

            {supabaseEnabled ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              {emailOnly ? <button type="button" onClick={() => setAuthMode("signin")} className="text-link inline-flex items-center gap-1"><ArrowLeft size={14} />返回密码登录</button> : <>
                <button type="button" onClick={() => setAuthMode("magiclink")} className="text-link inline-flex items-center gap-1"><Mail size={14} />邮件链接登录</button>
                <button type="button" onClick={() => setAuthMode(isSignup ? "resend" : "reset")} className="text-link">{isSignup ? "重发确认邮件" : "忘记密码？"}</button>
              </>}
            </div> : null}

            <p className="mt-7 border-t border-[color:var(--dream-line)] pt-5 text-xs leading-6 dream-muted">
              内容用于自我探索，不替代心理治疗、医学诊断或危机干预。
            </p>
          </form>
        </section>
        <p className="auth-scene-note"><span>THE THRESHOLD</span>门外，是另一片海。</p>
      </div>
    </main>
  );
}

function QuietField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="text-xs uppercase tracking-[0.18em] dream-muted">{label}</span>
      {children}
    </label>
  );
}

function AppNavigation({
  user,
  stage,
  analyst,
  recordsCount,
  audio,
  cloudMode,
  isSyncing,
  onSignOut,
  onStage,
  onNewDream
}: {
  user: SessionUser;
  stage: Stage;
  analyst: ReturnType<typeof getAnalyst>;
  recordsCount: number;
  audio: RoomAudioState;
  cloudMode: boolean;
  isSyncing: boolean;
  onSignOut: () => void;
  onStage: (stage: Stage) => void;
  onNewDream: () => void;
}) {
  const accountMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (accountMenu.current) accountMenu.current.open = false;
  }, [stage]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (accountMenu.current && !accountMenu.current.contains(event.target as Node)) accountMenu.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const navItems: NavItem[] = ([
    { stage: "home", label: "中庭", icon: House },
    { stage: "choose", label: "分析者", icon: Compass },
    { stage: "archive", label: "档案", icon: LibraryBig, count: recordsCount ? recordsCount.toString() : undefined },
    { stage: "profile", label: "画像", icon: UserRound },
    { stage: "sea", label: "夜海", icon: Waves },
    { stage: "settings", label: "设置", icon: Settings },
    { stage: "admin", label: "管理", icon: UsersRound, adminOnly: true }
  ] satisfies NavItem[]).filter((item) => !item.adminOnly || user.role === "admin");

  return (
    <header className="app-navigation">
      <button type="button" onClick={() => onStage("home")} className="wordmark" aria-label="Idream 中庭">Idream<span>梦的私人来信</span></button>
      <nav className="main-navigation" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = stage === item.stage || (item.stage === "choose" && ["consult", "analysis", "inner", "letter"].includes(stage));

          return (
            <button
              key={item.stage}
              type="button"
              onClick={() => onStage(item.stage)}
              aria-current={active ? "page" : undefined}
              className="navigation-item"
            >
              <span>
                <Icon size={17} strokeWidth={1.5} />
                {item.label}
              </span>
              {item.count ? <small>{item.count}</small> : null}
            </button>
          );
        })}
      </nav>

      <div className="navigation-tools">
        <RoomAudioMenu audio={audio} />
        <button type="button" onClick={onNewDream} className="nav-write" title="记录新梦" aria-label="记录新梦"><PenLine size={18} /></button>
        <details ref={accountMenu} className="account-menu" onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary aria-label="账户菜单" title="账户菜单"><span className="account-avatar">{user.name.slice(0,1)}</span><ChevronDown size={12} /></summary>
          <div className="account-popover"><p>{user.name}</p><span>{cloudMode ? isSyncing ? "正在保存" : "私密账户" : "本地体验"}</span>{analyst ? <span className="account-analyst">当前分析者 · {analyst.name}</span> : null}<button type="button" onClick={() => onStage("settings")}><Settings size={15} />房间设置</button><button type="button" onClick={onSignOut}><LockKeyhole size={15} />退出账户</button></div>
        </details>
      </div>
    </header>
  );
}

function DreamScene() {
  // Native picture sources preserve a separate composition for narrow screens.
  // eslint-disable-next-line @next/next/no-img-element
  return <div className="dream-scene" aria-hidden="true"><picture><source media="(max-width: 639px)" srcSet="/scenes/dream-threshold-mobile.webp" /><img src="/scenes/dream-threshold.webp" alt="" fetchPriority="high" /></picture></div>;
}

function HomeView({
  user,
  analyst,
  records,
  motifs,
  totalQaCount,
  hasDraft,
  onStart,
  onArchive,
  onProfile,
  onSea,
  onSettings,
  onChoose,
  onOpen
}: {
  user: SessionUser;
  analyst: ReturnType<typeof getAnalyst>;
  records: DreamRecord[];
  motifs: Array<[string, number]>;
  totalQaCount: number;
  hasDraft: boolean;
  onStart: () => void;
  onArchive: () => void;
  onProfile: () => void;
  onSea: () => void;
  onSettings: () => void;
  onChoose: () => void;
  onOpen: (record: DreamRecord) => void;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早安" : hour < 18 ? "午后好" : "晚上好";
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + index);
    const count = records.filter((record) => new Date(record.createdAt).toDateString() === date.toDateString()).length;
    return { date, count };
  });

  return (
    <section className="dream-fade home-layout">
      <div className="min-w-0">
        <section className="home-intro">
          <div className="home-hero-copy">
            <p className="scene-eyebrow">{greeting}，{user.name}</p>
            <h1>Idream</h1>
            <p className="scene-heading">梦醒之后，仍有回声。</p>
            <p className="scene-description">{hasDraft ? "那个还没说完的梦，仍然在这里等你。" : "把昨夜的片段，留给此刻的自己。"}</p>
            <button type="button" onClick={onStart} className="scene-primary"><PenLine size={17} />{hasDraft ? "继续上次的梦" : "写下一个梦"}<ArrowRight size={17} /></button>
          </div>
          <div className="scene-caption"><span>THE THRESHOLD</span><span>门外，是另一片海。</span></div>
          <div className="home-hero-bottom"><span><Moon size={15} strokeWidth={1.5} />今晚，让梦慢慢说。</span><button type="button" onClick={onChoose}>遇见你的分析者<ArrowRight size={15} /></button></div>
        </section>

        <section className="recent-dreams">
          <div className="section-heading"><div><p className="section-eyebrow">DREAM JOURNAL</p><h2>梦的余页</h2></div><button type="button" className="text-link inline-flex items-center gap-2 text-xs" onClick={onArchive}>翻阅全部<ArrowRight size={14} /></button></div>
          {records.length ? <div className="recent-dream-list">{records.slice(0, 3).map((record, index) => <button key={record.id} type="button" className="recent-dream-row" onClick={() => onOpen(record)}>
            <span className="recent-dream-thumbnail">{record.image ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={record.image.imageUrl} alt="" />
            </> : <Image src="/scenes/dream-threshold.webp" alt="" fill sizes="(max-width: 639px) 100vw, 400px" className="object-cover" />}</span>
            <span className="recent-dream-copy"><span className="recent-dream-date">{formatDateTime(record.createdAt)}<span>·</span>{record.analystName}</span><span className="recent-dream-title">{record.analysis.title}</span><span className="recent-dream-excerpt">{record.dream.dreamText}</span><span className="recent-dream-number">{String(records.length - index).padStart(2, "0")}</span></span>
            <ArrowRight size={16} className="shrink-0 dream-muted" />
          </button>)}</div> : <div className="journal-empty"><BookOpen size={26} strokeWidth={1.2} /><p className="font-serif text-xl">第一场梦，还没落笔</p><p className="text-sm leading-7 dream-muted">一段画面、一点余温，都可以成为开始。</p></div>}
        </section>

        <section className="grid gap-6 sm:grid-cols-2">
          <HomeAction
            icon={UserRound}
            title="内在画像"
            text={motifs.length ? `反复母题：${motifs.slice(0, 3).map(([motif]) => motif).join("、")}` : "你的内在线索，正在等待被听见。"}
            onClick={onProfile}
          />
          <HomeAction
            icon={Waves}
            title="夜海"
            text="寄一封匿名的信，或拾起远方的回声。"
            onClick={onSea}
          />
        </section>
      </div>

      <aside className="home-aside">
        <section className="home-side-section">
          <div className="flex items-center justify-between gap-2"><p className="section-eyebrow">写梦的日子</p><CalendarDays size={15} className="dream-muted" /></div>
          <p className="mt-4 text-sm dream-muted">已留住 {records.length} 场梦，进行 {totalQaCount} 次内心对话。</p>
          <div className="dream-week" aria-label="最近七天的梦境记录">{days.map(({date,count}) => <div key={date.toDateString()} title={`${date.toLocaleDateString("zh-CN")}：${count} 个梦`}><span>{["日","一","二","三","四","五","六"][date.getDay()]}</span><span className={clsx("dream-week-day", count > 0 && "has-dream", date.toDateString() === new Date().toDateString() && "is-today")}>{date.getDate()}</span></div>)}</div>
        </section>

        <section className="home-side-section">
          <p className="section-eyebrow">陪你听梦的人</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full">
              <Image src={(analyst || analysts[0]).portrait} alt={(analyst || analysts[0]).name} fill sizes="56px" className="object-cover object-top grayscale" />
            </div>
            <div><h3 className="font-serif text-xl font-medium">{analyst?.name || "选择一位分析者"}</h3><p className="mt-1 text-xs dream-muted">{analyst?.english || "Freud · Jung · Adler"}</p></div>
          </div>
          <button type="button" onClick={onChoose} className="mt-4 text-link inline-flex items-center gap-2 text-xs">{analyst ? "换一个视角" : "选择分析者"}<ArrowRight size={14} /></button>
        </section>

        {motifs.length ? <section className="home-side-section"><p className="section-eyebrow">RECURRING MOTIFS</p><h3 className="mt-3 font-serif text-lg">反复出现的线索</h3><div className="mt-4 space-y-3">{motifs.slice(0,4).map(([motif,count]) => <div key={motif} className="flex items-center justify-between gap-3 text-sm dream-muted"><span>{motif}</span><span className="tabular-nums">{count}<span className="ml-1 text-xs">次</span></span></div>)}</div></section> : null}

        <button type="button" onClick={onSettings} className="quiet-button w-full justify-between">
          <span className="inline-flex items-center gap-2">
            <Settings size={15} />
            调整房间
          </span>
          <ArrowRight size={15} />
        </button>
      </aside>
    </section>
  );
}

function HomeAction({
  icon: Icon,
  title,
  text,
  onClick
}: {
  icon: typeof BookOpen;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="group border-t border-[color:var(--dream-line)] py-4 text-left transition hover:border-[color:var(--dream-glow)] sm:min-h-40 sm:py-5">
      <Icon size={18} className="dream-muted transition group-hover:text-[color:var(--dream-glow)]" />
      <h3 className="mt-4 font-serif text-xl font-medium sm:mt-5">{title}</h3>
      <p className="mt-3 text-sm leading-7 dream-muted">{text}</p>
    </button>
  );
}

function ChooseAnalyst({
  selectedAnalyst,
  onChoose
}: {
  selectedAnalyst: AnalystKey | null;
  onChoose: (key: AnalystKey) => void;
}) {
  return (
    <section className="dream-fade analyst-selection">
      <div className="mb-7 max-w-3xl sm:mb-9">
        <p className="text-sm leading-7 dream-muted">三种视角，没有标准答案。此刻，你更想与谁聊聊？</p>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {analysts.map((analyst) => (
          <button
            key={analyst.key}
            type="button"
            onClick={() => onChoose(analyst.key)}
            className={clsx(
              "analyst-choice group",
              selectedAnalyst === analyst.key && "is-selected"
            )}
            aria-pressed={selectedAnalyst === analyst.key}
          >
            <div className="analyst-choice-portrait">
            <Image
              src={analyst.portrait}
              alt={analyst.english}
              fill
              sizes="(min-width: 1024px) 33vw, 100vw"
              className="object-cover object-top grayscale transition duration-700 group-hover:scale-[1.025]"
            />
            {selectedAnalyst === analyst.key ? <span className="analyst-selected"><Check size={14} />当前分析者</span> : null}
            </div>
            <div className="analyst-choice-body">
              <p className="text-[10px] dream-muted">{analyst.english}</p>
              <h2 className="mt-2 font-serif text-2xl font-medium">{analyst.name}</h2>
              <p className="mt-3 text-xs dream-glow-text">{analyst.title}</p>
              <p className="mt-4 text-sm leading-7 dream-muted">
                {analyst.note}
              </p>
              <span className="analyst-choice-link">
                进入咨询室
                <ArrowRight size={16} className="transition group-hover:translate-x-1" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function ConsultRoom({
  analyst,
  step,
  stepIndex,
  totalSteps,
  answer,
  isLoading,
  isAnalyzing,
  onAnswer,
  onNext,
  onBack
}: {
  analyst: NonNullable<ReturnType<typeof getAnalyst>>;
  step: ConsultStep;
  stepIndex: number;
  totalSteps: number;
  answer: string;
  isLoading: boolean;
  isAnalyzing: boolean;
  onAnswer: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const isLong = step.kind === "followup" || step.multiline;
  const buttonText =
    step.kind !== "followup" && stepIndex === intakeSteps.length - 1
      ? "让他继续追问"
      : step.kind === "followup" && step.index === 4
        ? "进入解析"
        : "继续";

  return (
    <section className="consultation-surface dream-fade">
      <div className="relative grid overflow-hidden lg:min-h-[calc(100vh-120px)] lg:grid-cols-[42%_1fr]">
        <div className="relative min-h-[260px] bg-[#0A1128]/60 sm:min-h-[340px] lg:min-h-[420px]">
          <Image
            src={analyst.portrait}
            alt={analyst.english}
            fill
            sizes="(min-width: 1024px) 42vw, 100vw"
            className="absolute inset-0 h-full w-full object-cover object-top grayscale opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A1128]/90 via-[#0A1128]/28 to-transparent lg:bg-gradient-to-r lg:from-[#0A1128]/35 lg:via-[#0A1128]/20 lg:to-[color:var(--dream-bg)]" />
          <div className="absolute bottom-5 left-5 right-5 sm:bottom-8 sm:left-8 sm:right-8">
            <p className="text-xs uppercase tracking-[0.28em] dream-muted">{analyst.english}</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">{analyst.name}</h1>
            <p className="mt-3 text-sm dream-muted">{analyst.title}</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col justify-between p-4 sm:p-8 lg:min-h-[520px] lg:p-10">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-neutral-500">
            <span>Consultation</span>
            <span>
              {String(stepIndex + 1).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
            </span>
          </div>

          <div className="my-6 max-w-3xl sm:my-8">
            <p className="text-sm dream-muted">{step.label}</p>
            <p className="mt-5 font-serif text-2xl leading-[1.65] dream-text sm:text-3xl">{step.prompt}</p>
            {isAnalyzing ? (
              <p className="mt-5 text-sm leading-7 dream-muted">
                正在整理五个追问和梦境材料，深度解析可能需要几十秒。页面保持打开就好。
              </p>
            ) : null}
          </div>

          <div className="consult-answer">
            {step.kind === "mood" ? <div className="mood-options" role="group" aria-label="醒后情绪">{["平静", "愉悦", "困惑", "不安", "失落", "释然"].map((mood) => <button key={mood} type="button" aria-pressed={answer.split("、").includes(mood)} disabled={isLoading} onClick={() => { const values = answer.split("、").filter(Boolean); onAnswer((values.includes(mood) ? values.filter((value) => value !== mood) : [...values, mood]).join("、")); }}>{mood}</button>)}</div> : null}
            {isLong ? (
              <textarea
                value={answer}
                onChange={(event) => onAnswer(event.target.value)}
                className="soft-scrollbar min-h-32 w-full resize-y bg-transparent text-base leading-7 dream-text placeholder:text-white/30 sm:min-h-36"
                aria-label={step.label}
                disabled={isLoading}
                placeholder={step.placeholder}
              />
            ) : (
              <input
                value={answer}
                onChange={(event) => onAnswer(event.target.value)}
                className="min-h-12 w-full bg-transparent text-base dream-text placeholder:text-white/30"
                placeholder={step.placeholder}
                aria-label={step.label}
                disabled={isLoading}
              />
            )}

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onBack}
                disabled={stepIndex === 0 || isLoading}
                className="inline-flex items-center justify-center gap-2 px-1 py-2 text-sm text-neutral-400 transition hover:text-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-700 sm:justify-start"
              >
                <ArrowLeft size={16} />
                返回
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={isLoading}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[color:var(--dream-glow)] px-5 py-3 text-sm font-medium text-[#0A1128] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-neutral-600 disabled:text-neutral-300 sm:w-auto sm:min-w-36"
              >
                {isLoading ? <Hourglass className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                {isAnalyzing ? "正在解析" : isLoading ? "请稍候" : buttonText}
              </button>
            </div>
            <div className="consult-progress" role="progressbar" aria-label="咨询进度" aria-valuenow={stepIndex + 1} aria-valuemin={0} aria-valuemax={totalSteps}>{Array.from({length: totalSteps}, (_, index) => <span key={index} data-complete={index <= stepIndex} />)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnalysisView({
  analysis,
  analyst,
  profile,
  generatedImage,
  isGeneratingImage,
  imageError,
  activeFeedback,
  onInner,
  onLetter,
  onGenerateImage,
  onFeedback
}: {
  analysis: DreamAnalysis;
  analyst: NonNullable<ReturnType<typeof getAnalyst>>;
  profile: string;
  generatedImage: GeneratedImage | null;
  isGeneratingImage: boolean;
  imageError: string;
  activeFeedback: AnalysisFeedback | null;
  onInner: () => void;
  onLetter: () => void;
  onGenerateImage: () => void;
  onFeedback: (value: AnalysisFeedback) => void;
}) {
  const structuredSections = [
    { label: "我听见了什么", text: analysis.heard || analysis.opening },
    { label: "可能的核心冲突", text: analysis.coreConflict || analysis.presentTension },
    { label: "被保护的需要", text: analysis.hiddenNeed || analysis.lifeGuess },
    { label: "关系与行动模式", text: analysis.relationshipPattern || analysis.updatedProfile }
  ];

  return (
    <section className="dream-fade grid gap-6 lg:grid-cols-[1fr_340px]">
      <article className="reading-article">
        <p className="text-xs uppercase tracking-[0.28em] dream-muted">Dream Analysis / {analyst.name}</p>
        <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight dream-text sm:text-5xl">{analysis.title}</h1>
        <p className="mt-5 font-serif text-lg leading-8 dream-muted sm:mt-6 sm:text-xl sm:leading-10">{analysis.opening}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 sm:mt-10">
          {structuredSections.map((section) => (
            <section key={section.label} className="border-t border-[color:var(--dream-line)] pt-5">
              <p className="text-xs uppercase tracking-[0.2em] dream-muted">{section.label}</p>
              <p className="mt-3 text-sm leading-7 dream-muted">{section.text}</p>
            </section>
          ))}
        </div>

        <div className="mt-8 space-y-8 sm:mt-10 sm:space-y-9">
          {analysis.readings.map((reading) => (
            <section key={reading.key}>
              <p className="text-xs uppercase tracking-[0.22em] dream-muted">{reading.title}</p>
              <h2 className="mt-3 font-serif text-2xl font-semibold sm:text-3xl">{reading.name}</h2>
              <p className="mt-4 text-base leading-8 dream-muted">{reading.reading}</p>
            </section>
          ))}

          <section>
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Past And Present</p>
            <p className="mt-4 text-base leading-8 dream-muted">{analysis.lifeGuess}</p>
          </section>

          <section>
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Tension</p>
            <p className="mt-4 text-base leading-8 dream-muted">{analysis.presentTension}</p>
          </section>

          <section className="border-l border-[color:var(--dream-line)] pl-5">
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Do Not Overread</p>
            <p className="mt-3 text-sm leading-7 dream-muted">
              {analysis.avoidOverInterpreting || "这只是一种解释角度，不需要把每一个细节都固定成结论。"}
            </p>
          </section>

          <section>
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Motifs</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(analysis.motifs || []).map((motif) => (
                <span key={motif} className="bg-white/8 px-3 py-2 text-sm dream-muted">
                  {motif}
                </span>
              ))}
            </div>
          </section>

          <section className="dream-panel p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">After Dream Ritual</p>
            <p className="mt-3 text-sm leading-7 dream-muted">{analysis.ritual}</p>
          </section>

          <section className="dream-panel p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Reality Check</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold">这次分析贴近你吗？</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {([
                ["hit", "说中了"],
                ["unsure", "不确定"],
                ["miss", "没说中"]
              ] as Array<[AnalysisFeedback, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onFeedback(value)}
                  aria-pressed={activeFeedback === value}
                  className={clsx(
                    "quiet-button justify-center",
                    activeFeedback === value && "border-[color:var(--dream-glow)] text-[color:var(--dream-text)]"
                  )}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center">{activeFeedback === value ? <Check size={14} /> : null}</span>
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-6 dream-muted">你的反馈会影响之后怎么看待这条画像，不会被当成绝对结论。</p>
          </section>

          <section className="dream-panel p-4 sm:p-5" aria-label="梦境意象照片" aria-busy={isGeneratingImage}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] dream-muted">Optional Image</p>
                <h2 className="mt-2 font-serif text-2xl font-semibold">梦境意象照片</h2>
              </div>
              <div className="flex shrink-0 gap-2">{generatedImage ? <a href={generatedImage.imageUrl} download={`idream-${analysis.title}.png`} className="icon-button" aria-label="下载梦境图片" title="下载梦境图片"><Download size={18} /></a> : null}<button
                type="button"
                onClick={onGenerateImage}
                disabled={isGeneratingImage}
                className="quiet-button w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isGeneratingImage ? <Hourglass className="animate-spin" size={15} /> : <Sparkles size={15} />}
                {isGeneratingImage ? "正在生成" : generatedImage ? "重新生成" : "生成意象"}
              </button>
              </div>
            </div>
            {imageError ? <p role="alert" className="notice-error mt-4">{imageError}</p> : null}
            {generatedImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={generatedImage.imageUrl}
                alt={`${analysis.title} 的梦境意象`}
                className="mt-5 aspect-square w-full max-w-xl rounded-md bg-black/10 object-contain"
              />
            ) : isGeneratingImage ? (
              <div role="status" className="mt-5 flex aspect-square w-full max-w-xl flex-col items-center justify-center gap-4 rounded-md border border-[color:var(--dream-line)] bg-[color:var(--dream-input)]"><Hourglass size={24} className="animate-spin dream-glow-text" /><p className="text-sm dream-muted">梦里的画面，正在慢慢浮现</p></div>
            ) : (
              <p className="mt-4 text-sm leading-7 dream-muted">把梦留成一张画面。生成的图片仅在当前页面保留，可下载收藏。</p>
            )}
          </section>
        </div>

        <p className="mt-8 text-xs leading-6 dream-muted">{analysis.disclaimer}</p>
      </article>

      <aside className="space-y-5">
        <section className="dream-panel p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Profile</p>
          <h2 className="mt-3 font-serif text-2xl font-semibold">持续画像</h2>
          <p className="mt-5 text-sm leading-7 dream-muted">{profile}</p>
        </section>

        <button
          type="button"
          onClick={onInner}
          className="dream-panel group flex w-full items-center justify-between gap-4 p-5 text-left transition hover:border-[color:rgba(243,194,107,0.36)] sm:p-6"
        >
          <span>
            <span className="block font-serif text-2xl font-semibold">对我的内心发问</span>
            <span className="mt-2 block text-sm text-neutral-500 transition group-hover:text-neutral-300">进入三问页面</span>
          </span>
          <ArrowRight size={20} />
        </button>

        <button
          type="button"
          onClick={onLetter}
          className="dream-panel group flex w-full items-center justify-between gap-4 p-5 text-left transition hover:border-[color:rgba(197,185,224,0.42)] sm:p-6"
        >
          <span>
            <span className="block font-serif text-2xl font-semibold">保存为信件</span>
            <span className="mt-2 block text-sm text-neutral-500 transition group-hover:text-neutral-300">把这次解析收成一封梦后信</span>
          </span>
          <Mail size={20} />
        </button>
      </aside>
    </section>
  );
}

function LetterView({
  analysis,
  analyst,
  user,
  onBack
}: {
  analysis: DreamAnalysis;
  analyst: NonNullable<ReturnType<typeof getAnalyst>>;
  user: SessionUser;
  onBack: () => void;
}) {
  return (
    <section className="dream-fade mx-auto max-w-4xl">
      <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm dream-muted transition hover:text-[color:var(--dream-text)]">
        <ArrowLeft size={16} />
        返回解析
      </button>

      <article className="reading-article letter-paper">
        <div className="border-b border-[color:var(--dream-line)] pb-8">
          <div className="flex items-center justify-between gap-3"><p className="text-xs uppercase tracking-[0.28em] dream-muted">A Private Letter / {analyst.name}</p><button type="button" className="icon-button" title="下载这封信" aria-label="下载这封信" onClick={() => downloadText(`${analysis.title}\n\n${getReadingLetter(analysis, user.name)}\n\n${analyst.name}\n\n${analysis.ritual}`, `idream-letter-${new Date().toISOString().slice(0,10)}.txt`)}><Download size={17} /></button></div>
          <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight sm:text-5xl">{analysis.title}</h1>
          <p className="mt-4 text-sm dream-muted">{new Date().toLocaleDateString("zh-CN")}</p>
        </div>

        <div className="mt-8 whitespace-pre-line font-serif text-xl leading-[1.75] dream-text sm:mt-10 sm:text-2xl">
          {getReadingLetter(analysis, user.name)}
        </div>

        <div className="mt-12 border-t border-[color:var(--dream-line)] pt-7">
          <p className="text-xs uppercase tracking-[0.22em] dream-muted">Small Ritual</p>
          <p className="mt-3 text-sm leading-7 dream-muted">{analysis.ritual}</p>
        </div>
      </article>
    </section>
  );
}

function InnerQuestionView({
  analyst,
  profile,
  qa,
  question,
  questionSlots,
  isAsking,
  setQuestion,
  submitQuestion,
  onBack
}: {
  analyst: NonNullable<ReturnType<typeof getAnalyst>>;
  profile: string;
  qa: StoredState["qa"];
  question: string;
  questionSlots: number;
  isAsking: boolean;
  setQuestion: (value: string) => void;
  submitQuestion: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}) {
  return (
    <section className="dream-fade grid gap-5 lg:grid-cols-[360px_1fr] lg:gap-6">
      <aside className="dream-panel p-5 sm:p-6">
        <button type="button" onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white">
          <ArrowLeft size={16} />
          返回解析
        </button>
        <div className="relative h-56 w-full sm:h-80">
          <Image
            src={analyst.portrait}
            alt={analyst.english}
            fill
            sizes="(min-width: 1024px) 360px, 100vw"
            className="object-cover grayscale opacity-75"
          />
        </div>
        <p className="mt-6 text-xs uppercase tracking-[0.24em] text-neutral-500">Inner Questions</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold">对我的内心发问</h1>
        <p className="mt-4 text-sm leading-7 text-neutral-300">剩余 {questionSlots} 次。每个问题都会继续修正你的画像。</p>
      </aside>

      <div className="dream-panel p-4 sm:p-8">
        <div className="space-y-6">
          {qa.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center text-center sm:min-h-64">
              <p className="max-w-lg font-serif text-xl leading-9 text-neutral-500 sm:text-2xl sm:leading-10">
                这里不是聊天窗口，而是一间更深的房间。问一个你真正想知道的问题。
              </p>
            </div>
          ) : null}

          {qa.map((item, index) => (
            <article key={`${item.question}-${index}`} className="dream-panel p-5">
              <p className="text-xs uppercase tracking-[0.2em] dream-muted">Question {index + 1}</p>
              <h2 className="mt-3 font-serif text-xl font-semibold sm:text-2xl">{item.question}</h2>
              <p className="mt-4 text-sm leading-7 dream-muted">{item.answer}</p>
              <p className="mt-3 text-xs dream-glow-text">{item.reflection}</p>
            </article>
          ))}
        </div>

        <form onSubmit={submitQuestion} className="dream-panel mt-6 p-4 sm:mt-8 sm:p-5">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={qa.length >= 3 || isAsking}
            className="min-h-28 w-full resize-y bg-transparent text-base leading-7 dream-text placeholder:text-white/30 disabled:cursor-not-allowed"
            placeholder={qa.length >= 3 ? "这一轮三问已经完成。" : "写下你的问题。"}
          />
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={qa.length >= 3 || isAsking}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[color:var(--dream-glow)] px-5 py-3 text-sm font-medium text-[#0A1128] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 sm:w-auto sm:min-w-32"
            >
              {isAsking ? <Hourglass className="animate-spin" size={16} /> : <Sparkles size={16} />}
              {isAsking ? "正在回应" : "发问"}
            </button>
          </div>
        </form>

        <section className="dream-panel mt-5 p-4 sm:mt-6 sm:p-5">
          <p className="text-xs uppercase tracking-[0.22em] dream-muted">Current Profile</p>
          <p className="mt-3 text-sm leading-7 dream-muted">{profile}</p>
        </section>
      </div>
    </section>
  );
}

function ArchiveView({
  records,
  motifs,
  selectedRecord,
  onSelect,
  onOpen,
  onStart
}: {
  records: DreamRecord[];
  motifs: Array<[string, number]>;
  selectedRecord: DreamRecord | null;
  onSelect: (recordId: string) => void;
  onOpen: (record: DreamRecord) => void;
  onStart: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const filtered = records.filter((record) => (!filter || record.analystKey === filter) && `${record.analysis.title} ${record.dream.dreamText} ${record.dream.mood} ${record.analysis.motifs?.join(" ")}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => sort === "oldest" ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const visibleRecord = filtered.find((record) => record.id === selectedRecord?.id) || filtered[0] || null;
  return (
    <section className="dream-fade grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-b border-[color:var(--dream-line)] pb-6 xl:border-b-0 xl:border-r xl:pr-6">
        <p className="text-xs uppercase tracking-[0.24em] dream-muted">Archive</p>
        <h2 className="mt-3 font-serif text-2xl font-medium">梦境档案馆</h2>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <Stat label="梦境" value={records.length.toString()} />
          <Stat label="母题" value={motifs.length.toString()} />
        </div>

        <div className="relative mt-6"><Search size={16} className="pointer-events-none absolute left-3 top-4 dream-muted" /><input type="search" aria-label="搜索梦境档案" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索梦名、片段或母题" className="dream-input pl-10 text-sm" /></div>
        <select aria-label="按分析者筛选" value={filter} onChange={(event) => setFilter(event.target.value)} className="dream-input mt-3 text-sm"><option value="">全部分析者</option>{analysts.map((person) => <option key={person.key} value={person.key}>{person.name}</option>)}</select>
        <div className="archive-sort"><span>{filtered.length} 个梦</span><select aria-label="档案排序" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">最新在前</option><option value="oldest">最早在前</option></select></div>

        <div className="soft-scrollbar mt-6 max-h-72 space-y-2 overflow-y-auto pr-1 sm:max-h-[54vh]">
          {filtered.map((record) => (
            <button
              key={record.id}
              type="button"
              onClick={() => onSelect(record.id)}
              aria-pressed={visibleRecord?.id === record.id}
              className={clsx(
                "w-full border-l px-4 py-3 text-left transition",
                visibleRecord?.id === record.id
                  ? "border-[color:var(--dream-glow)] bg-white/8"
                  : "border-[color:var(--dream-line)] hover:border-[color:rgba(243,194,107,0.42)] hover:bg-white/5"
              )}
            >
              <p className="text-xs dream-muted">{formatDateTime(record.createdAt)}</p>
              <h2 className="mt-2 line-clamp-1 font-serif text-xl font-semibold">{record.analysis.title}</h2>
              <p className="mt-1 text-xs dream-muted">{record.analystName}</p>
            </button>
          ))}
        </div>
      </aside>

      {visibleRecord ? (
        <ArchiveDetail record={visibleRecord} motifs={motifs} onOpen={() => onOpen(visibleRecord)} />
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center gap-5 py-10 text-center">
          <Archive size={30} className="dream-muted" />
          <h2 className="font-serif text-2xl">{records.length ? "没有找到这个梦" : "第一场梦，还没落笔"}</h2>
          <p className="max-w-xs text-sm leading-7 dream-muted">{records.length ? "换一个词，或试试其他分析者。" : "醒来时记得的一小段，也值得留下。"}</p>
          {records.length ? <button className="quiet-button" type="button" onClick={() => { setSearch(""); setFilter(""); }}>清除筛选</button> : <button className="primary-button" type="button" onClick={onStart}><PenLine size={16} />记录一个梦</button>}
        </div>
      )}
    </section>
  );
}

function ArchiveDetail({ record, motifs, onOpen }: { record: DreamRecord; motifs: Array<[string, number]>; onOpen: () => void }) {
  function downloadRecord() {
    downloadText(dreamAsMarkdown(record), `idream-${record.createdAt.slice(0, 10)}.md`);
  }
  return (
    <article className="reading-article">
      <div className="flex flex-col gap-3 border-b border-[color:var(--dream-line)] pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">{record.analystName}</p>
          <h2 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-5xl">{record.analysis.title}</h2>
          <p className="mt-4 max-w-3xl font-serif text-lg leading-8 dream-muted sm:text-xl sm:leading-9">{record.analysis.opening}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:items-end"><p className="text-xs dream-muted">{formatDateTime(record.createdAt)}</p><div className="flex items-center gap-2"><button type="button" onClick={downloadRecord} className="icon-button" title="导出这个梦" aria-label="导出这个梦"><Download size={17} /></button><button type="button" onClick={onOpen} className="quiet-button">重新打开<ArrowRight size={14} /></button></div></div>
      </div>

      <div className="mt-7 grid gap-6 lg:mt-8 lg:grid-cols-[1fr_280px]">
        <div className="space-y-8">
          <section>
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Dream</p>
            <p className="mt-3 text-sm leading-8 dream-muted">{record.dream.dreamText}</p>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <MiniField label="时间" text={record.dream.dreamAt || "未填写"} />
            <MiniField label="醒后余温" text={record.dream.mood || "未填写"} />
          </section>

          <section>
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Reality</p>
            <p className="mt-3 text-sm leading-8 dream-muted">{record.dream.wakingLife || "未填写"}</p>
          </section>

          <section>
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Five Questions</p>
            <div className="mt-4 space-y-3">
              {record.followupAnswers.map((item, index) => (
                <div key={`${item.question}-${index}`} className="border-l border-[color:var(--dream-line)] pl-4">
                  <p className="text-sm dream-text">{item.question}</p>
                  <p className="mt-2 text-sm leading-7 dream-muted">{item.answer || "未回答"}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Reading</p>
            <p className="mt-3 text-sm leading-8 dream-muted">{record.analysis.readings[0]?.reading || record.analysis.lifeGuess}</p>
          </section>

          {record.qa.length ? (
            <section>
              <p className="text-xs uppercase tracking-[0.22em] dream-muted">Inner Questions</p>
              <div className="mt-4 space-y-3">
                {record.qa.map((item, index) => (
                  <div key={`${item.question}-${index}`} className="dream-panel p-4">
                    <p className="text-sm dream-text">{item.question}</p>
                    <p className="mt-2 text-sm leading-7 dream-muted">{item.answer}</p>
                    <p className="mt-2 text-xs dream-glow-text">{item.reflection}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          {record.image ? (
            <section className="dream-panel p-5">
              <p className="text-xs uppercase tracking-[0.22em] dream-muted">Portrait</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={record.image.imageUrl}
                alt={`${record.analysis.title} 的心理画像`}
                className="mt-4 aspect-[4/5] w-full object-cover grayscale-[15%]"
              />
            </section>
          ) : null}

          {record.feedback ? (
            <section className="dream-panel p-5">
              <p className="text-xs uppercase tracking-[0.22em] dream-muted">Reality Check</p>
              <p className="mt-3 text-sm leading-7 dream-muted">
                {record.feedback === "hit" ? "你标记了：这次分析说中了。" : record.feedback === "miss" ? "你标记了：这次分析没有说中。" : "你标记了：暂时不确定。"}
              </p>
            </section>
          ) : null}

          <section className="dream-panel p-5">
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Motifs</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(record.analysis.motifs || []).map((motif) => (
                <span key={motif} className="bg-white/8 px-3 py-2 text-xs dream-muted">{motif}</span>
              ))}
            </div>
          </section>

          <section className="dream-panel p-5">
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Current Tension</p>
            <p className="mt-3 text-sm leading-7 dream-muted">{record.analysis.presentTension}</p>
          </section>

          <section className="dream-panel p-5">
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Letter</p>
            <p className="mt-3 line-clamp-6 font-serif text-lg leading-8 dream-muted">{getReadingLetter(record.analysis)}</p>
          </section>

          <section className="dream-panel p-5">
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Recurring</p>
            <div className="mt-4 space-y-2">
              {motifs.slice(0, 5).map(([motif, count]) => (
                <p key={motif} className="flex items-center justify-between text-sm dream-muted">
                  <span>{motif}</span>
                  <span>{count}</span>
                </p>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </article>
  );
}

function MiniField({ label, text }: { label: string; text: string }) {
  return (
    <div className="border-t border-[color:var(--dream-line)] pt-4">
      <p className="text-xs uppercase tracking-[0.2em] dream-muted">{label}</p>
      <p className="mt-2 text-sm leading-7 dream-muted">{text}</p>
    </div>
  );
}

function ProfileView({
  profile,
  records,
  motifs,
  snapshots
}: {
  profile: string;
  records: DreamRecord[];
  motifs: Array<[string, number]>;
  snapshots: ProfileSnapshot[];
}) {
  const latest = records[0];

  return (
    <section className="dream-fade grid gap-5 xl:grid-cols-[1fr_360px] xl:gap-6">
      <article className="reading-article">
        <p className="text-xs uppercase tracking-[0.24em] dream-muted">Inner Profile</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">我的内在画像</h1>
        <p className="mt-5 whitespace-pre-line text-base leading-8 dream-muted sm:mt-7">
          {profile || "完成一次完整解析后，这里会出现持续更新的内在画像。"}
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-2 sm:mt-10">
          <ProfileModule title="最近张力" text={latest?.analysis.presentTension || "还需要一次完整解析来生成。"} />
          <ProfileModule title="可能的隐藏需要" text={latest?.analysis.hiddenNeed || latest?.analysis.lifeGuess || "画像会从梦境与追问里慢慢形成。"} />
          <ProfileModule title="关系与行动模式" text={latest?.analysis.relationshipPattern || "多次梦境之后，这里会更清楚地呈现反复模式。"} />
          <ProfileModule title="不过度解读提醒" text={latest?.analysis.avoidOverInterpreting || "这里的内容只作为自我探索，不把梦固定成命运或诊断。"} />
        </div>

        <section className="mt-10 border-t border-[color:var(--dream-line)] pt-7 sm:mt-12">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Profile Timeline</p>
          <h2 className="mt-3 font-serif text-3xl font-semibold">画像怎样变化</h2>
          <div className="mt-6 space-y-4">
            {snapshots.length ? snapshots.slice(0, 8).map((snapshot) => (
              <article key={snapshot.id} className="border-l border-[color:var(--dream-line)] pl-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs dream-muted">{formatDateTime(snapshot.createdAt)}</p>
                  {snapshot.feedback ? (
                    <span className="bg-white/8 px-2 py-1 text-xs dream-muted">
                      {snapshot.feedback === "hit" ? "说中了" : snapshot.feedback === "miss" ? "没说中" : "不确定"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-7 dream-muted">{snapshot.changeSummary || snapshot.profile}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {snapshot.motifs.slice(0, 4).map((motif) => (
                    <span key={motif} className="bg-white/8 px-2 py-1 text-xs dream-muted">{motif}</span>
                  ))}
                </div>
              </article>
            )) : (
              <p className="text-sm leading-7 dream-muted">完成一次完整解析后，这里会保存每次画像的变化。</p>
            )}
          </div>
        </section>
      </article>

      <aside className="space-y-5">
        <section className="dream-panel p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Overview</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="梦境" value={records.length.toString()} />
            <Stat label="问答" value={records.reduce((sum, record) => sum + record.qa.length, 0).toString()} />
          </div>
        </section>

        <section className="dream-panel p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Recurring Motifs</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {motifs.length ? motifs.map(([motif, count]) => (
              <span key={motif} className="bg-white/8 px-3 py-2 text-sm dream-muted">
                {motif} · {count}
              </span>
            )) : <span className="text-sm dream-muted">暂无反复母题</span>}
          </div>
        </section>

        <section className="dream-panel p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Next Questions</p>
          <div className="mt-4 space-y-3">
            {(latest?.analysis.nextQuestions || ["我最近总在回避什么？", "我真正需要谁的理解？", "我下一步可以轻一点吗？"]).slice(0, 3).map((item) => (
              <p key={item} className="border-l border-[color:var(--dream-line)] pl-3 text-sm leading-7 dream-muted">{item}</p>
            ))}
          </div>
        </section>

        <section className="dream-panel p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Latest Ritual</p>
          <p className="mt-4 text-sm leading-7 dream-muted">{latest?.analysis.ritual || "完成一次解析后，这里会出现梦后仪式。"}</p>
        </section>
      </aside>
    </section>
  );
}

function ProfileModule({ title, text }: { title: string; text: string }) {
  return (
    <section className="border-t border-[color:var(--dream-line)] pt-5">
      <p className="text-xs uppercase tracking-[0.2em] dream-muted">{title}</p>
      <p className="mt-3 text-sm leading-7 dream-muted">{text}</p>
    </section>
  );
}

function SettingsView({
  user,
  theme,
  audio,
  recordsCount,
  cloudMode,
  setTheme,
  exportArchive,
  clearMemory,
  deleteCloudMemory,
  onSignOut
}: {
  user: SessionUser;
  theme: ThemeMode;
  audio: RoomAudioState;
  recordsCount: number;
  cloudMode: boolean;
  setTheme: (value: ThemeMode) => void;
  exportArchive: () => void;
  clearMemory: () => void;
  deleteCloudMemory: () => void;
  onSignOut: () => void;
}) {
  return (
    <section className="dream-fade grid gap-5 xl:grid-cols-[1fr_360px] xl:gap-6">
      <div className="space-y-6">
        <section className="settings-section">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Room Tone</p>
          <h2 className="mt-3 font-serif text-2xl font-medium">房间的光线</h2>
          <div className="theme-options mt-7" role="group" aria-label="外观模式">
            <button
              type="button"
              onClick={() => setTheme("dark")}
              aria-pressed={theme === "dark"}
            >
              <Moon size={15} />
              黑色模式
            </button>
            <button
              type="button"
              onClick={() => setTheme("light")}
              aria-pressed={theme === "light"}
            >
              <Sun size={15} />
              白色模式
            </button>
          </div>
        </section>

        <section className="settings-section"><p className="section-eyebrow">ROOM MUSIC</p><h2 className="mt-3 font-serif text-2xl">房间里的旋律</h2><div className="mt-6 max-w-md"><MusicControls audio={audio} /></div></section>

        <section className="settings-section">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Privacy</p>
          <h2 className="mt-3 font-serif text-2xl font-medium">{cloudMode ? "账户与云端记忆" : "本地记忆"}</h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 dream-muted">
            {cloudMode
              ? `当前账户：${user.email || user.name}。你的梦境档案和内在画像保存在私密账户中。`
              : "你的梦境档案和内在画像保存在当前浏览器中。"}
          </p>
          <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
            <button type="button" onClick={exportArchive} className="quiet-button">
              <Shield size={15} />
              导出档案
            </button>
            <button type="button" onClick={onSignOut} className="quiet-button">
              <LockKeyhole size={15} />
              退出账户
            </button>
            <button type="button" onClick={clearMemory} className="quiet-button text-red-200 hover:text-red-100">
              <Trash2 size={15} />
              {cloudMode ? "清空本机缓存" : "清空本地记忆"}
            </button>
            {cloudMode ? (
              <button type="button" onClick={deleteCloudMemory} className="quiet-button text-red-200 hover:text-red-100">
                <CircleAlert size={15} />
                删除云端记忆
              </button>
            ) : null}
          </div>
        </section>

        <section className="settings-section">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Data Boundary</p>
          <h2 className="mt-3 font-serif text-2xl font-medium">隐私与心理边界</h2>
          <div className="mt-5 grid gap-4 text-sm leading-7 dream-muted md:grid-cols-2">
            <p>梦境和追问会被发送给 AI 服务生成回应；账户中的档案仅供你本人访问，本地体验的记录只保存在当前浏览器。</p>
            <p>Idream 用于自我探索，不提供医学诊断、治疗建议或危机干预。若你正处于伤害自己或他人的风险中，请联系身边可信赖的人或当地紧急服务。</p>
          </div>
        </section>
      </div>

      <aside className="space-y-5">
        <section className="settings-section">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Memory</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="档案" value={recordsCount.toString()} />
            <Stat label="模式" value={theme === "dark" ? "暗" : "白"} />
          </div>
        </section>

      </aside>
    </section>
  );
}

function NightSeaView({
  cloudMode,
  bottleText,
  receivedBottle,
  isLoading,
  setBottleText,
  submitBottle,
  receiveBottle
}: {
  cloudMode: boolean;
  bottleText: string;
  receivedBottle: DriftBottleRow | null;
  isLoading: boolean;
  setBottleText: (value: string) => void;
  submitBottle: (event: FormEvent<HTMLFormElement>) => void;
  receiveBottle: () => void;
}) {
  return (
    <section className="dream-fade grid gap-5 xl:grid-cols-[1fr_340px] xl:gap-6">
      <article className="dream-panel p-4 sm:min-h-[520px] sm:p-10">
        <p className="text-xs uppercase tracking-[0.24em] dream-muted">Night Sea</p>
        <h2 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-5xl">夜海</h2>
        <p className="mt-5 max-w-2xl font-serif text-lg leading-8 dream-muted sm:mt-7 sm:text-xl sm:leading-9">
          投递一段温柔但不越界的话，或捞起别人的一句话。每天最多三次，所有投递都会先进入审核。
        </p>

        <form onSubmit={submitBottle} className="dream-panel mt-8 p-4 sm:mt-10 sm:p-5">
          <p className="text-xs uppercase tracking-[0.22em] dream-muted">Send</p>
          <textarea
            value={bottleText}
            onChange={(event) => setBottleText(event.target.value)}
            disabled={!cloudMode || isLoading}
            className="mt-4 min-h-32 w-full resize-y bg-transparent text-base leading-7 dream-text placeholder:text-white/30 disabled:cursor-not-allowed"
            placeholder={cloudMode ? "写一句你愿意放进夜海的话。" : "配置 Supabase 后可以投递。"}
          />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs dream-muted">{bottleText.length}/280</p>
            <button
              type="submit"
              disabled={!cloudMode || isLoading}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[color:var(--dream-glow)] px-5 py-3 text-sm font-medium text-[#0A1128] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 sm:w-auto sm:min-w-32"
            >
              {isLoading ? <Hourglass className="animate-spin" size={16} /> : <Mail size={16} />}
              投递审核
            </button>
          </div>
        </form>

        <section className="mt-8 border-t border-[color:var(--dream-line)] pt-7">
          <button type="button" onClick={receiveBottle} disabled={!cloudMode || isLoading} className="quiet-button w-full justify-center sm:w-auto">
            {isLoading ? <Hourglass className="animate-spin" size={15} /> : <Waves size={15} />}
            捞起一只漂流瓶
          </button>
          {receivedBottle ? (
            <p className="mt-5 max-w-2xl font-serif text-xl leading-9 dream-text sm:text-2xl sm:leading-10">{receivedBottle.body}</p>
          ) : (
            <p className="mt-5 text-sm leading-7 dream-muted">捞起的内容会出现在这里。不会显示对方身份。</p>
          )}
        </section>
      </article>

      <aside className="dream-panel p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.24em] dream-muted">Future Module</p>
        <h3 className="mt-3 font-serif text-3xl font-semibold">温情，但不喧哗</h3>
        <p className="mt-5 text-sm leading-7 dream-muted">
          它适合做成一个很轻的互助层，而不是动态广场。用户之间只交换经过审核的短句，不互相关注，也不追逐热度。
        </p>
      </aside>
    </section>
  );
}

function AdminView({
  user,
  stats,
  bottles,
  isLoading,
  onRefresh,
  onModerate
}: {
  user: SessionUser;
  stats: AdminStats | null;
  bottles: DriftBottleRow[];
  isLoading: boolean;
  onRefresh: () => void;
  onModerate: (id: string, status: BottleStatus, note?: string) => void;
}) {
  if (user.role !== "admin") {
    return <EmptyPanel title="没有权限" text="只有管理员可以进入这里。" />;
  }

  return (
    <section className="dream-fade grid gap-5 xl:grid-cols-[1fr_340px] xl:gap-6">
      <article className="dream-panel p-4 sm:p-10">
        <div className="flex flex-col gap-4 border-b border-[color:var(--dream-line)] pb-7 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] dream-muted">Admin Console</p>
            <h2 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-5xl">审核与管理</h2>
          </div>
          <button type="button" onClick={onRefresh} className="quiet-button">
            {isLoading ? <Hourglass className="animate-spin" size={15} /> : <Archive size={15} />}
            刷新
          </button>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-4">
          <Stat label="用户" value={(stats?.users || 0).toString()} />
          <Stat label="梦境" value={(stats?.dreams || 0).toString()} />
          <Stat label="待审" value={(stats?.bottlesPending || 0).toString()} />
          <Stat label="通过" value={(stats?.bottlesApproved || 0).toString()} />
        </div>

        <section className="mt-10">
          <p className="text-xs uppercase tracking-[0.22em] dream-muted">Pending Bottles</p>
          <div className="mt-5 space-y-4">
            {bottles.length ? bottles.map((bottle) => (
              <article key={bottle.id} className="dream-panel p-4 sm:p-5">
                <p className="font-serif text-lg leading-8 dream-text sm:text-xl sm:leading-9">{bottle.body}</p>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs dream-muted">{formatDateTime(bottle.created_at)}</p>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <button type="button" onClick={() => onModerate(bottle.id, "rejected")} className="quiet-button text-red-200 hover:text-red-100">
                      拒绝
                    </button>
                    <button type="button" onClick={() => onModerate(bottle.id, "approved")} className="quiet-button">
                      通过
                    </button>
                  </div>
                </div>
              </article>
            )) : <p className="text-sm dream-muted">当前没有待审核内容。</p>}
          </div>
        </section>
      </article>

      <aside className="dream-panel p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.24em] dream-muted">Moderation Rule</p>
        <h3 className="mt-3 font-serif text-3xl font-semibold">轻，但要守边界</h3>
        <p className="mt-5 text-sm leading-7 dream-muted">
          拒绝攻击、广告、联系方式、隐私泄露、自伤诱导和伪装专业建议。通过的内容才会进入夜海，被其他用户随机捞起。
        </p>
      </aside>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="journal-stat">
      <p className="text-xs uppercase tracking-[0.2em] dream-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold sm:text-3xl">{value}</p>
    </div>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <section className="dream-panel flex min-h-64 flex-col items-center justify-center p-6 text-center sm:min-h-80 sm:p-8">
      <h2 className="font-serif text-3xl font-semibold">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-7 dream-muted">{text}</p>
    </section>
  );
}
