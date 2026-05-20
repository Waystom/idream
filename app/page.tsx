"use client";

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  BookOpen,
  CircleAlert,
  Compass,
  Feather,
  House,
  Hourglass,
  LibraryBig,
  LockKeyhole,
  Mail,
  Moon,
  PenLine,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  UsersRound,
  Volume2,
  VolumeX,
  Waves
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase/browser";
import type { AdminStats, BottleStatus, DreamRecordRow, DriftBottleRow, ProfileRow, UserRole } from "@/lib/database";
import type { AnalystKey, DreamAnalysis, FollowupQuestions, GeneratedImage, QuestionAnswer } from "@/lib/types";

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
type Soundscape = "rain" | "fire" | "space" | "typewriter";
type AuthMode = "signin" | "signup";

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
  qa: Array<{
    question: string;
    answer: string;
    reflection: string;
  }>;
};

type StoredState = {
  user: SessionUser | null;
  selectedAnalyst: AnalystKey | null;
  stage: Stage;
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

const soundscapeLabels: Record<Soundscape, string> = {
  rain: "雨声",
  fire: "壁炉",
  space: "深空",
  typewriter: "打字机"
};

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
    qa: row.inner_questions || []
  };
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

function playDrawerSound(volume: number) {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextClass = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const duration = 0.42;
  const now = context.currentTime;
  const noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
  const data = noiseBuffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    const fade = 1 - index / data.length;
    data[index] = (Math.random() * 2 - 1) * fade * 0.18;
  }

  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(540, now);
  filter.frequency.exponentialRampToValueAtTime(160, now + duration);
  filter.Q.value = 1.4;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.16), now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  noise.start(now);
  noise.stop(now + duration);

  window.setTimeout(() => void context.close(), (duration + 0.1) * 1000);
}

function AmbientSound({
  enabled,
  soundscape,
  volume
}: {
  enabled: boolean;
  soundscape: Soundscape;
  volume: number;
}) {
  const contextRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<Array<{ stop?: () => void; disconnect?: () => void }>>([]);

  useEffect(() => {
    nodesRef.current.forEach((node) => {
      try {
        node.stop?.();
        node.disconnect?.();
      } catch {
        // Audio nodes can already be stopped during rapid soundscape switches.
      }
    });
    nodesRef.current = [];

    if (!enabled) {
      void contextRef.current?.close();
      contextRef.current = null;
      return;
    }

    const AudioContextClass = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
    contextRef.current = context;

    if (soundscape === "rain" || soundscape === "space") {
      const source = createNoiseSource(context, soundscape === "rain" ? "highpass" : "lowpass");
      source.output.connect(master);
      source.source.start();
      nodesRef.current.push(source.source, source.output);
    }

    if (soundscape === "fire") {
      const low = createNoiseSource(context, "lowpass");
      const high = createNoiseSource(context, "bandpass");
      low.output.connect(master);
      high.output.connect(master);
      low.source.start();
      high.source.start();
      nodesRef.current.push(low.source, low.output, high.source, high.output);
    }

    if (soundscape === "typewriter") {
      const interval = window.setInterval(() => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = 120 + Math.random() * 90;
        gain.gain.setValueAtTime(volume * 0.045, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.035);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.04);
      }, 520 + Math.random() * 500);

      nodesRef.current.push({
        stop: () => window.clearInterval(interval)
      });
    }

    return () => {
      nodesRef.current.forEach((node) => {
        try {
          node.stop?.();
          node.disconnect?.();
        } catch {
          // Ignore already-stopped nodes.
        }
      });
      nodesRef.current = [];
      void context.close();
      contextRef.current = null;
    };
  }, [enabled, soundscape, volume]);

  return null;
}

function createNoiseSource(context: AudioContext, filterType: BiquadFilterType) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterType === "highpass" ? 900 : filterType === "lowpass" ? 280 : 520;
  filter.Q.value = 0.8;

  source.connect(filter);

  return {
    source,
    output: filter
  };
}

function SoundscapeControl({
  soundOn,
  soundscape,
  volume,
  setSoundOn,
  setSoundscape,
  setVolume
}: {
  soundOn: boolean;
  soundscape: Soundscape;
  volume: number;
  setSoundOn: (value: boolean) => void;
  setSoundscape: (value: Soundscape) => void;
  setVolume: (value: number) => void;
}) {
  return (
    <section className="dream-panel mb-6 flex flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setSoundOn(!soundOn)} className="quiet-button">
          {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
          <span>{soundOn ? "关闭音景" : "唤醒音景"}</span>
        </button>
        <p className="text-xs leading-5 dream-muted">默认静音，只在你手动开启后播放。</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(soundscapeLabels) as Soundscape[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setSoundscape(item);
              if (!soundOn) {
                setSoundOn(true);
              }
            }}
            className={clsx(
              "px-3 py-2 text-xs transition",
              soundscape === item && soundOn
                ? "bg-[color:var(--dream-glow)] text-[#0A1128]"
                : "bg-white/5 dream-muted hover:bg-white/10 hover:text-[color:var(--dream-text)]"
            )}
          >
            {soundscapeLabels[item]}
          </button>
        ))}
        <label className="ml-1 flex items-center gap-2 text-xs dream-muted">
          <span>音量</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="h-1 w-24 accent-[color:var(--dream-glow)]"
          />
        </label>
      </div>
    </section>
  );
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
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [soundOn, setSoundOn] = useState(false);
  const [soundscape, setSoundscape] = useState<Soundscape>("rain");
  const [volume, setVolume] = useState(0.28);
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
  const [authNotice, setAuthNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
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
      setActiveRecordId(stored.activeRecordId || null);
      setSelectedArchiveId(stored.activeRecordId || stored.records?.[0]?.id || null);
      setConsultStep(stored.followups ? Math.min(4 + stored.followups.questions.length, 8) : 0);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("idream.theme", theme);
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const state: StoredState = {
      user,
      selectedAnalyst,
      stage,
      profile,
      dream,
      followups,
      followupAnswers,
      analysis,
      dreamContext,
      qa,
      records,
      activeRecordId
    };

    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [activeRecordId, analysis, dream, dreamContext, followupAnswers, followups, profile, qa, records, selectedAnalyst, stage, user]);

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
        .select("*")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .returns<DreamRecordRow[]>();

      if (dreamsError) {
        throw dreamsError;
      }

      const nextRecords = (dreamRows || []).map(toDreamRecord);
      setRecords(nextRecords);
      setActiveRecordId(nextRecords[0]?.id || null);
      setSelectedArchiveId(nextRecords[0]?.id || null);
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
      const {
        data: { user: authUser }
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (!authUser) {
        setUser(null);
        setAuthReady(true);
        return;
      }

      await hydrateCloudUser(authUser);
      setAuthReady(true);
    }

    void loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
        setRecords([]);
        setProfile("");
        setAuthReady(true);
        return;
      }

      void hydrateCloudUser(session.user);
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

        if (!email || password.length < 6) {
          throw new Error("请填写邮箱，并使用至少 6 位密码。");
        }

        const result =
          authMode === "signup"
            ? await supabase.auth.signUp({
                email,
                password,
                options: {
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

        const authUser = result.data.session?.user || (authMode === "signin" ? result.data.user : null);

        if (!authUser) {
          setAuthNotice("注册成功。请打开邮箱确认链接，确认后再回到这里登录。");
          setAuthMode("signin");
          setLoginPassword("");
          return;
        }

        await hydrateCloudUser(authUser);
        await syncProfile({
          displayName: loginName.trim() || "来访者",
          intention: loginIntention.trim(),
          psychologicalProfile: profile
        });
        setAuthNotice(authMode === "signup" ? "注册成功，正在进入中庭。" : "登录成功，正在进入中庭。");
        setStage("home");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : authMode === "signup" ? "注册失败。" : "登录失败。");
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
    if (supabaseEnabled) {
      await getSupabaseBrowserClient().auth.signOut();
    }

    setUser(null);
    setRecords([]);
    setProfile("");
    setAnalysis(null);
    setGeneratedImage(null);
    setQa([]);
    setStage("home");
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
      throw updateError;
    }
  }

  async function saveDreamRecordToCloud(record: DreamRecord) {
    if (!supabaseEnabled || !user?.id) {
      return record.id;
    }

    const supabase = getSupabaseBrowserClient();
    const { data, error: insertError } = await supabase
      .from("dream_records")
      .insert({
        user_id: user.id,
        analyst_key: record.analystKey,
        analyst_name: record.analystName,
        dream_at: record.dream.dreamAt,
        dream_text: record.dream.dreamText,
        waking_life: record.dream.wakingLife,
        mood: record.dream.mood,
        followup_answers: record.followupAnswers,
        analysis: record.analysis,
        inner_questions: record.qa
      })
      .select("*")
      .single<DreamRecordRow>();

    if (insertError) {
      throw insertError;
    }

    return data.id;
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

    setIsGeneratingImage(true);
    setError("");

    try {
      const response = await fetch("/api/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: analysis.imagePrompt,
          title: analysis.title
        })
      });
      const data = (await response.json()) as GeneratedImage | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "生成图片失败。");
      }

      setGeneratedImage(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成图片失败。");
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

      const data = (await response.json()) as DreamAnalysis | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "分析失败。");
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
      const recordId = await saveDreamRecordToCloud(localRecord);
      const savedRecord = { ...localRecord, id: recordId };

      setAnalysis(data);
      setProfile(data.updatedProfile);
      setQa([]);
      setActiveRecordId(recordId);
      setSelectedArchiveId(recordId);
      setRecords((current) => [savedRecord, ...current]);
      if (supabaseEnabled) {
        await syncProfile({ psychologicalProfile: data.updatedProfile });
      }
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
      playDrawerSound(volume);
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
        error={error}
        notice={authNotice}
        setTheme={setTheme}
        setAuthMode={setAuthMode}
        setLoginEmail={setLoginEmail}
        setLoginPassword={setLoginPassword}
        setLoginName={setLoginName}
        setLoginIntention={setLoginIntention}
        enterRoom={enterRoom}
      />
    );
  }

  return (
    <main className="dream-shell px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto grid min-h-[calc(100vh-24px)] w-full max-w-[1500px] gap-5 lg:grid-cols-[244px_1fr]">
        <AppSidebar
          user={user}
          stage={stage}
          analyst={analyst}
          recordsCount={records.length}
          soundOn={soundOn}
          soundscape={soundscape}
          cloudMode={supabaseEnabled}
          isSyncing={isCloudSyncing}
          onSignOut={signOut}
          onStage={(nextStage) => {
            if (nextStage === "archive") {
              playDrawerSound(volume);
            }
            if (nextStage === "admin") {
              void loadAdminDashboard();
            }
            setStage(nextStage);
          }}
          onNewDream={resetDream}
        />

        <section className="min-w-0 px-1 pb-5 sm:px-0">
          <header className="dream-fade mb-5 flex flex-col gap-3 border-b border-[color:var(--dream-line)] pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] dream-muted">{stageLabel.eyebrow}</p>
              <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight dream-text sm:text-4xl">{stageLabel.label}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm dream-muted">
              {stage === "consult" ? (
                <span>
                  第 {Math.min(consultStep + 1, consultSteps.length)} / {consultSteps.length} 步
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
            <div className="dream-panel mb-5 flex items-start gap-3 px-4 py-3 text-sm leading-6 text-red-200">
              <CircleAlert className="mt-0.5 shrink-0" size={18} />
              <span>{error}</span>
            </div>
          ) : null}

          {stage === "home" ? (
            <HomeView
              user={user}
              analyst={analyst}
              records={records}
              motifs={motifs}
              totalQaCount={totalQaCount}
              onStart={() => setStage("choose")}
              onArchive={() => {
                playDrawerSound(volume);
                setStage("archive");
              }}
              onProfile={() => setStage("profile")}
              onSea={() => setStage("sea")}
              onSettings={() => setStage("settings")}
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
              totalSteps={consultSteps.length}
              answer={currentAnswer}
              isLoading={isGeneratingFollowups || isAnalyzing}
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
              onInner={() => setStage("inner")}
              onLetter={() => setStage("letter")}
              onGenerateImage={generateAnalysisImage}
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
              onSelect={(recordId) => {
                setSelectedArchiveId(recordId);
                setActiveRecordId(recordId);
                playDrawerSound(volume);
              }}
            />
          ) : null}

          {stage === "profile" ? (
            <ProfileView profile={profile} records={records} motifs={motifs} />
          ) : null}

          {stage === "settings" ? (
            <SettingsView
              user={user}
              theme={theme}
              soundOn={soundOn}
              soundscape={soundscape}
              volume={volume}
              recordsCount={records.length}
              cloudMode={supabaseEnabled}
              setTheme={setTheme}
              setSoundOn={setSoundOn}
              setSoundscape={setSoundscape}
              setVolume={setVolume}
              clearMemory={clearMemory}
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
      <AmbientSound enabled={soundOn} soundscape={soundscape} volume={volume} />
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

  return (
    <main className="dream-shell px-5 py-5 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-7xl flex-col">
        <header className="flex items-center justify-between border-b border-[color:var(--dream-line)] pb-5">
          <div>
            <p className="font-serif text-2xl font-semibold tracking-wide">Idream</p>
            <p className="mt-1 text-xs uppercase tracking-[0.28em] dream-muted">private dream room</p>
          </div>
          <div className="flex items-center gap-3 text-xs dream-muted">
            <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="quiet-button">
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              {theme === "dark" ? "白色模式" : "黑色模式"}
            </button>
            <span className="hidden items-center gap-2 sm:inline-flex">
              <LockKeyhole size={14} />
              {supabaseEnabled ? "cloud memory" : "local memory"}
            </span>
          </div>
        </header>

        <section className="grid flex-1 gap-10 py-10 lg:grid-cols-[1fr_430px] lg:items-center">
          <div className="max-w-4xl">
            <p className="mb-6 inline-flex items-center gap-2 text-sm dream-muted">
              <Moon size={16} />
              请把梦带进来
            </p>
            <h1 className="max-w-4xl font-serif text-5xl font-semibold leading-[1.04] dream-text sm:text-7xl lg:text-8xl">
              进入一间只属于你的梦境咨询室。
            </h1>
            <p className="mt-8 max-w-2xl font-serif text-xl leading-9 dream-muted sm:text-2xl">
              选择一位分析者，他会先提问，再解释。你的梦境、追问、画像和信件会在安静的档案里慢慢形成线索。
            </p>

            <div className="mt-12 grid max-w-3xl gap-4 sm:grid-cols-3">
              <AuthPrinciple icon={Shield} title="私密" text={supabaseEnabled ? "账号数据由权限规则隔离。" : "当前只保存在本机浏览器。"} />
              <AuthPrinciple icon={Feather} title="缓慢" text="先被追问，再得到解析。" />
              <AuthPrinciple icon={LibraryBig} title="持续" text="每次梦都会修正画像。" />
            </div>
          </div>

          <form onSubmit={enterRoom} className="dream-panel p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] dream-muted">{supabaseEnabled ? "Account" : "Local Entry"}</p>
                <h2 className="mt-3 font-serif text-4xl font-semibold">{supabaseEnabled ? (isSignup ? "建立账户" : "回到房间") : "进入"}</h2>
              </div>
              <LockKeyhole className="dream-muted" size={18} />
            </div>

            <p className="mt-5 text-sm leading-7 dream-muted">
              {supabaseEnabled
                ? isSignup
                  ? "注册后，梦境档案会保存到你的私密账户。"
                  : "登录后继续查看你的梦境档案和内在画像。"
                : "当前未配置 Supabase，会以本地体验模式进入。"}
            </p>

            {error ? (
              <div className="mt-5 flex items-start gap-3 border border-red-300/20 bg-red-950/20 px-4 py-3 text-sm leading-6 text-red-100">
                <CircleAlert className="mt-0.5 shrink-0" size={16} />
                <span>{error}</span>
              </div>
            ) : null}

            {!error && notice ? (
              <div className="mt-5 flex items-start gap-3 border border-[color:rgba(243,194,107,0.28)] bg-[color:rgba(243,194,107,0.08)] px-4 py-3 text-sm leading-6 dream-text">
                <LockKeyhole className="mt-0.5 shrink-0 text-[color:var(--dream-glow)]" size={16} />
                <span>{notice}</span>
              </div>
            ) : null}

            {supabaseEnabled ? (
              <div className="mt-7 grid grid-cols-2 gap-1 border border-[color:var(--dream-line)] bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => setAuthMode("signin")}
                  className={clsx("min-h-10 px-3 text-sm transition", !isSignup ? "bg-[color:var(--dream-glow)] text-[#0A1128]" : "dream-muted hover:text-[color:var(--dream-text)]")}
                >
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className={clsx("min-h-10 px-3 text-sm transition", isSignup ? "bg-[color:var(--dream-glow)] text-[#0A1128]" : "dream-muted hover:text-[color:var(--dream-text)]")}
                >
                  注册
                </button>
              </div>
            ) : null}

            {supabaseEnabled ? (
              <div className="mt-7 space-y-5">
                <QuietField label="Email" htmlFor="email">
                  <input
                    id="email"
                    type="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    className="mt-3 w-full bg-white/8 px-4 py-3 text-base dream-text placeholder:text-white/30"
                    placeholder="you@example.com"
                  />
                </QuietField>

                <QuietField label="Password" htmlFor="password">
                  <input
                    id="password"
                    type="password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    className="mt-3 w-full bg-white/8 px-4 py-3 text-base dream-text placeholder:text-white/30"
                    placeholder="至少 6 位"
                  />
                </QuietField>
              </div>
            ) : null}

            {(!supabaseEnabled || isSignup) ? (
              <div className="mt-7 space-y-5">
                <QuietField label="Name" htmlFor="name">
                  <input
                    id="name"
                    value={loginName}
                    onChange={(event) => setLoginName(event.target.value)}
                    className="mt-3 w-full bg-white/8 px-4 py-3 text-base dream-text placeholder:text-white/30"
                    placeholder="来访者"
                  />
                </QuietField>

                <QuietField label="Intention" htmlFor="intention">
                  <textarea
                    id="intention"
                    value={loginIntention}
                    onChange={(event) => setLoginIntention(event.target.value)}
                    className="mt-3 min-h-28 w-full resize-none bg-white/8 px-4 py-3 text-base leading-7 dream-text placeholder:text-white/30"
                    placeholder="你想从梦里靠近什么？"
                  />
                </QuietField>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isAuthenticating}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 bg-[color:var(--dream-glow)] px-5 py-3 text-sm font-medium text-[#0A1128] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-neutral-600 disabled:text-neutral-300"
            >
              {isAuthenticating ? <Hourglass className="animate-spin" size={16} /> : <ArrowRight size={16} />}
              <span>{isAuthenticating ? "请稍候" : supabaseEnabled ? (isSignup ? "建立账户" : "进入中庭") : "进入中庭"}</span>
            </button>

            <p className="mt-5 text-xs leading-6 dream-muted">
              内容用于自我探索，不替代心理治疗、医学诊断或危机干预。
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}

function AuthPrinciple({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="border-t border-[color:var(--dream-line)] pt-5">
      <Icon size={17} className="dream-muted" />
      <h3 className="mt-4 font-serif text-2xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 dream-muted">{text}</p>
    </div>
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

function AppSidebar({
  user,
  stage,
  analyst,
  recordsCount,
  soundOn,
  soundscape,
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
  soundOn: boolean;
  soundscape: Soundscape;
  cloudMode: boolean;
  isSyncing: boolean;
  onSignOut: () => void;
  onStage: (stage: Stage) => void;
  onNewDream: () => void;
}) {
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
    <aside className="dream-panel dream-fade flex flex-col gap-5 p-4 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)]">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onStage("home")} className="text-left">
          <p className="font-serif text-2xl font-semibold leading-none">Idream</p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.28em] dream-muted">private room</p>
        </button>
        <LockKeyhole className="mt-1 dream-muted" size={16} />
      </div>

      <div className="border-y border-[color:var(--dream-line)] py-4">
        <p className="text-xs dream-muted">{user.name}</p>
        <p className="mt-2 line-clamp-2 text-sm leading-6 dream-text">
          {user.intention || "今晚先安静地听一听梦。"}
        </p>
      </div>

      <nav className="grid gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = stage === item.stage;

          return (
            <button
              key={item.stage}
              type="button"
              onClick={() => onStage(item.stage)}
              className={clsx(
                "group flex min-h-11 items-center justify-between px-3 text-left text-sm transition",
                active
                  ? "bg-[color:rgba(243,194,107,0.14)] text-[color:var(--dream-text)]"
                  : "text-[color:var(--dream-muted)] hover:bg-white/[0.06] hover:text-[color:var(--dream-text)]"
              )}
            >
              <span className="flex items-center gap-3">
                <Icon size={16} className={clsx(active && "text-[color:var(--dream-glow)]")} />
                {item.label}
              </span>
              {item.count ? <span className="text-xs dream-muted">{item.count}</span> : null}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onNewDream}
        className="mt-1 flex min-h-12 items-center justify-between bg-[color:var(--dream-glow)] px-4 text-left text-sm font-medium text-[#0A1128] transition hover:brightness-110"
      >
        <span className="flex items-center gap-2">
          <PenLine size={16} />
          记录新梦
        </span>
        <ArrowRight size={16} />
      </button>

      <div className="mt-auto border-t border-[color:var(--dream-line)] pt-4">
        <p className="text-xs uppercase tracking-[0.22em] dream-muted">Current</p>
        <div className="mt-3 flex items-center gap-3">
          {analyst ? (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
              <Image src={analyst.portrait} alt={analyst.english} fill sizes="48px" className="object-cover grayscale" />
            </div>
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/8">
              <Moon size={17} className="dream-muted" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm dream-text">{analyst?.name || "尚未选择"}</p>
            <p className="mt-1 truncate text-xs dream-muted">
              {soundOn ? `${soundscapeLabels[soundscape]}已开启` : "音景关闭"}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs dream-muted">
            {cloudMode ? (isSyncing ? "云端同步中" : "云端账户") : "本地体验"}
          </p>
          <button type="button" onClick={onSignOut} className="text-xs dream-muted transition hover:text-[color:var(--dream-text)]">
            退出
          </button>
        </div>
      </div>
    </aside>
  );
}

function HomeView({
  user,
  analyst,
  records,
  motifs,
  totalQaCount,
  onStart,
  onArchive,
  onProfile,
  onSea,
  onSettings
}: {
  user: SessionUser;
  analyst: ReturnType<typeof getAnalyst>;
  records: DreamRecord[];
  motifs: Array<[string, number]>;
  totalQaCount: number;
  onStart: () => void;
  onArchive: () => void;
  onProfile: () => void;
  onSea: () => void;
  onSettings: () => void;
}) {
  const latest = records[0];

  return (
    <section className="dream-fade grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="min-h-[420px] border-b border-[color:var(--dream-line)] pb-8">
          <p className="inline-flex items-center gap-2 text-sm dream-muted">
            <Moon size={16} />
            晚上好，{user.name}
          </p>
          <h2 className="mt-8 max-w-4xl font-serif text-5xl font-semibold leading-[1.08] dream-text sm:text-6xl">
            把梦带到一间更安静的房间。
          </h2>
          <p className="mt-7 max-w-2xl font-serif text-xl leading-9 dream-muted">
            从一位分析者开始，先被提问，再被理解。你的梦境、追问和画像会留在本地档案里，慢慢形成一条内在线索。
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <button type="button" onClick={onStart} className="inline-flex items-center gap-2 bg-[color:var(--dream-glow)] px-5 py-3 text-sm font-medium text-[#0A1128] transition hover:brightness-110">
              <Feather size={16} />
              开始一次咨询
            </button>
            <button type="button" onClick={onArchive} className="quiet-button">
              <Archive size={15} />
              打开档案
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <HomeAction
            icon={BookOpen}
            title="最近一梦"
            text={latest ? `${latest.analysis.title} / ${latest.analystName}` : "完成一次解析后，这里会出现最近的梦。"}
            onClick={onArchive}
          />
          <HomeAction
            icon={UserRound}
            title="内在画像"
            text={motifs.length ? `反复母题：${motifs.slice(0, 3).map(([motif]) => motif).join("、")}` : "画像会随着每次输入继续变细。"}
            onClick={onProfile}
          />
          <HomeAction
            icon={Waves}
            title="夜海"
            text="漂流瓶与温柔互访先安放在这里，等待审核机制。"
            onClick={onSea}
          />
        </section>
      </div>

      <aside className="space-y-5">
        <section className="dream-panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Quiet Status</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Stat label="梦" value={records.length.toString()} />
            <Stat label="问" value={totalQaCount.toString()} />
            <Stat label="母题" value={motifs.length.toString()} />
          </div>
        </section>

        <section className="dream-panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Analyst</p>
          <h3 className="mt-3 font-serif text-2xl font-semibold">{analyst?.name || "尚未选择"}</h3>
          <p className="mt-4 text-sm leading-7 dream-muted">
            {analyst?.note || "你可以先进入选择室，从弗洛伊德、荣格、阿德勒中选一位陪你进入这次梦。"}
          </p>
        </section>

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
    <button type="button" onClick={onClick} className="group min-h-44 border-t border-[color:var(--dream-line)] py-5 text-left transition hover:border-[color:rgba(243,194,107,0.48)]">
      <Icon size={18} className="dream-muted transition group-hover:text-[color:var(--dream-glow)]" />
      <h3 className="mt-5 font-serif text-2xl font-semibold">{title}</h3>
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
    <section className="dream-fade py-8">
      <div className="mb-10 max-w-3xl">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] dream-muted">Choose The Analyst</p>
        <h1 className="font-serif text-4xl font-semibold leading-tight dream-text sm:text-5xl">
          选择一位与你一起进入梦的人
        </h1>
        <p className="mt-4 font-serif text-lg leading-8 dream-muted">
          本轮梦境只由一位心理学家分析。鼠标停留在画像上，房间会亮起一点。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {analysts.map((analyst) => (
          <button
            key={analyst.key}
            type="button"
            onClick={() => onChoose(analyst.key)}
            className={clsx(
              "group relative min-h-[560px] overflow-hidden text-left transition duration-500 hover:-translate-y-1",
              "dream-panel",
              selectedAnalyst === analyst.key && "shadow-[0_35px_100px_rgba(0,0,0,0.2)]"
            )}
          >
            <div className="absolute left-1/2 top-12 z-10 h-[68%] w-[56%] -translate-x-1/2 rounded-[48%_48%_38%_38%] bg-white/0 blur-2xl transition duration-700 group-hover:bg-white/24" />
            <Image
              src={analyst.portrait}
              alt={analyst.english}
              fill
              sizes="(min-width: 1024px) 33vw, 100vw"
              className="absolute inset-0 h-full w-full object-cover object-top grayscale transition duration-700 group-hover:scale-105 group-hover:grayscale-[35%]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/42 to-neutral-200/10 transition duration-500 group-hover:from-neutral-950 group-hover:via-neutral-950/25" />
            <div className="absolute inset-x-[18%] top-[10%] h-[64%] rounded-[50%] ring-0 ring-white/0 transition duration-700 group-hover:ring-[1px] group-hover:ring-white/45" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white">
              <p className="text-xs uppercase tracking-[0.24em] text-white/54">{analyst.english}</p>
              <h2 className="mt-3 font-serif text-4xl font-semibold">{analyst.name}</h2>
              <p className="mt-2 text-sm text-white/72">{analyst.title}</p>
              <p className="mt-6 max-w-sm text-sm leading-7 text-white/72 opacity-80 transition group-hover:opacity-100">
                {analyst.note}
              </p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-white">
                进入他的咨询室
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
  onAnswer: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const isLong = step.kind === "followup" || step.multiline;
  const buttonText =
    step.kind !== "followup" && stepIndex === intakeSteps.length - 1
      ? "让他继续追问"
      : step.kind === "followup" && stepIndex === totalSteps - 1
        ? "进入解析"
        : "继续";

  return (
    <section className="dream-panel-strong dream-fade min-h-[calc(100vh-120px)]">
      <div className="relative grid min-h-[calc(100vh-120px)] overflow-hidden lg:grid-cols-[42%_1fr]">
        <div className="relative min-h-[420px] bg-[#0A1128]/60">
          <div className="absolute left-1/2 top-12 z-10 h-[70%] w-[56%] -translate-x-1/2 rounded-[48%_48%_38%_38%] bg-white/18 blur-2xl" />
          <Image
            src={analyst.portrait}
            alt={analyst.english}
            fill
            sizes="(min-width: 1024px) 42vw, 100vw"
            className="absolute inset-0 h-full w-full object-cover object-top grayscale opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A1128]/35 via-[#0A1128]/20 to-[color:var(--dream-bg)]" />
          <div className="absolute bottom-8 left-8 right-8">
            <p className="text-xs uppercase tracking-[0.28em] dream-muted">{analyst.english}</p>
            <h1 className="mt-3 font-serif text-5xl font-semibold">{analyst.name}</h1>
            <p className="mt-3 text-sm dream-muted">{analyst.title}</p>
          </div>
        </div>

        <div className="flex min-h-[520px] flex-col justify-between p-6 sm:p-8 lg:p-10">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-neutral-500">
            <span>Consultation</span>
            <span>
              {String(stepIndex + 1).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
            </span>
          </div>

          <div className="my-8 max-w-3xl">
            <p className="text-sm dream-muted">{step.label}</p>
            <p className="mt-5 font-serif text-3xl leading-[1.45] dream-text sm:text-4xl">{step.prompt}</p>
          </div>

          <div className="dream-panel p-5 sm:p-6">
            {isLong ? (
              <textarea
                value={answer}
                onChange={(event) => onAnswer(event.target.value)}
                className="soft-scrollbar min-h-36 w-full resize-y bg-transparent text-base leading-7 dream-text placeholder:text-white/30"
                placeholder={step.placeholder}
              />
            ) : (
              <input
                value={answer}
                onChange={(event) => onAnswer(event.target.value)}
                className="min-h-12 w-full bg-transparent text-base dream-text placeholder:text-white/30"
                placeholder={step.placeholder}
              />
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onBack}
                disabled={stepIndex === 0 || isLoading}
                className="inline-flex items-center gap-2 px-1 py-2 text-sm text-neutral-400 transition hover:text-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-700"
              >
                <ArrowLeft size={16} />
                返回
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={isLoading}
                className="inline-flex min-w-36 items-center justify-center gap-2 bg-[color:var(--dream-glow)] px-5 py-3 text-sm font-medium text-[#0A1128] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-neutral-600 disabled:text-neutral-300"
              >
                {isLoading ? <Hourglass className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                {isLoading ? "请稍候" : buttonText}
              </button>
            </div>
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
  onInner,
  onLetter,
  onGenerateImage
}: {
  analysis: DreamAnalysis;
  analyst: NonNullable<ReturnType<typeof getAnalyst>>;
  profile: string;
  generatedImage: GeneratedImage | null;
  isGeneratingImage: boolean;
  onInner: () => void;
  onLetter: () => void;
  onGenerateImage: () => void;
}) {
  const structuredSections = [
    { label: "我听见了什么", text: analysis.heard || analysis.opening },
    { label: "可能的核心冲突", text: analysis.coreConflict || analysis.presentTension },
    { label: "被保护的需要", text: analysis.hiddenNeed || analysis.lifeGuess },
    { label: "关系与行动模式", text: analysis.relationshipPattern || analysis.updatedProfile }
  ];

  return (
    <section className="dream-fade grid gap-6 lg:grid-cols-[1fr_340px]">
      <article className="dream-panel px-6 py-7 sm:px-10 sm:py-10">
        <p className="text-xs uppercase tracking-[0.28em] dream-muted">Dream Analysis / {analyst.name}</p>
        <h1 className="mt-4 font-serif text-5xl font-semibold leading-tight dream-text">{analysis.title}</h1>
        <p className="mt-6 font-serif text-xl leading-10 dream-muted">{analysis.opening}</p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {structuredSections.map((section) => (
            <section key={section.label} className="border-t border-[color:var(--dream-line)] pt-5">
              <p className="text-xs uppercase tracking-[0.2em] dream-muted">{section.label}</p>
              <p className="mt-3 text-sm leading-7 dream-muted">{section.text}</p>
            </section>
          ))}
        </div>

        <div className="mt-10 space-y-9">
          {analysis.readings.map((reading) => (
            <section key={reading.key}>
              <p className="text-xs uppercase tracking-[0.22em] dream-muted">{reading.title}</p>
              <h2 className="mt-3 font-serif text-3xl font-semibold">{reading.name}</h2>
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

          <section className="dream-panel p-5">
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">After Dream Ritual</p>
            <p className="mt-3 text-sm leading-7 dream-muted">{analysis.ritual}</p>
          </section>

          <section className="dream-panel p-5">
            <p className="text-xs uppercase tracking-[0.22em] dream-muted">Image Prompt</p>
            <p className="mt-3 text-sm leading-7 dream-muted">{analysis.imagePrompt}</p>
          </section>

          <section className="dream-panel p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] dream-muted">AI Portrait</p>
                <h2 className="mt-2 font-serif text-2xl font-semibold">心理画像照片</h2>
              </div>
              <button
                type="button"
                onClick={onGenerateImage}
                disabled={isGeneratingImage}
                className="quiet-button justify-center disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingImage ? <Hourglass className="animate-spin" size={15} /> : <Sparkles size={15} />}
                {isGeneratingImage ? "正在生成" : generatedImage ? "重新生成" : "生成照片"}
              </button>
            </div>
            {generatedImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={generatedImage.imageUrl}
                alt={`${analysis.title} 的心理画像`}
                className="mt-5 aspect-[4/5] w-full max-w-xl object-cover grayscale-[15%] shadow-[0_28px_90px_rgba(0,0,0,0.22)]"
              />
            ) : (
              <p className="mt-4 text-sm leading-7 dream-muted">使用当前解析里的 imagePrompt，通过 Gemini 生图中转站生成。</p>
            )}
          </section>
        </div>

        <p className="mt-8 text-xs leading-6 dream-muted">{analysis.disclaimer}</p>
      </article>

      <aside className="space-y-5">
        <section className="dream-panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Profile</p>
          <h2 className="mt-3 font-serif text-2xl font-semibold">持续画像</h2>
          <p className="mt-5 text-sm leading-7 dream-muted">{profile}</p>
        </section>

        <button
          type="button"
          onClick={onInner}
          className="dream-panel group flex w-full items-center justify-between p-6 text-left transition hover:border-[color:rgba(243,194,107,0.36)]"
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
          className="dream-panel group flex w-full items-center justify-between p-6 text-left transition hover:border-[color:rgba(197,185,224,0.42)]"
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

      <article className="dream-panel px-6 py-8 sm:px-12 sm:py-12">
        <div className="border-b border-[color:var(--dream-line)] pb-8">
          <p className="text-xs uppercase tracking-[0.28em] dream-muted">A Private Letter / {analyst.name}</p>
          <h1 className="mt-4 font-serif text-5xl font-semibold leading-tight">{analysis.title}</h1>
          <p className="mt-4 text-sm dream-muted">{new Date().toLocaleDateString("zh-CN")}</p>
        </div>

        <div className="mt-10 whitespace-pre-line font-serif text-2xl leading-[1.75] dream-text">
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
    <section className="dream-fade grid gap-6 lg:grid-cols-[360px_1fr]">
      <aside className="dream-panel p-6">
        <button type="button" onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white">
          <ArrowLeft size={16} />
          返回解析
        </button>
        <div className="relative h-80 w-full">
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

      <div className="dream-panel p-6 sm:p-8">
        <div className="space-y-6">
          {qa.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center text-center">
              <p className="max-w-lg font-serif text-2xl leading-10 text-neutral-500">
                这里不是聊天窗口，而是一间更深的房间。问一个你真正想知道的问题。
              </p>
            </div>
          ) : null}

          {qa.map((item, index) => (
            <article key={`${item.question}-${index}`} className="dream-panel p-5">
              <p className="text-xs uppercase tracking-[0.2em] dream-muted">Question {index + 1}</p>
              <h2 className="mt-3 font-serif text-2xl font-semibold">{item.question}</h2>
              <p className="mt-4 text-sm leading-7 dream-muted">{item.answer}</p>
              <p className="mt-3 text-xs dream-glow-text">{item.reflection}</p>
            </article>
          ))}
        </div>

        <form onSubmit={submitQuestion} className="dream-panel mt-8 p-5">
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
              className="inline-flex min-w-32 items-center justify-center gap-2 bg-[color:var(--dream-glow)] px-5 py-3 text-sm font-medium text-[#0A1128] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
            >
              {isAsking ? <Hourglass className="animate-spin" size={16} /> : <Sparkles size={16} />}
              {isAsking ? "正在回应" : "发问"}
            </button>
          </div>
        </form>

        <section className="dream-panel mt-6 p-5">
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
  onSelect
}: {
  records: DreamRecord[];
  motifs: Array<[string, number]>;
  selectedRecord: DreamRecord | null;
  onSelect: (recordId: string) => void;
}) {
  return (
    <section className="dream-fade grid gap-6 xl:grid-cols-[360px_1fr]">
      <aside className="dream-panel p-5">
        <p className="text-xs uppercase tracking-[0.24em] dream-muted">Archive</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold">梦境档案馆</h1>
        <p className="mt-4 text-sm leading-7 dream-muted">
          每次完整咨询都会留下记录。这里会慢慢看见反复出现的地点、人物、情绪和象征。
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <Stat label="梦境" value={records.length.toString()} />
          <Stat label="母题" value={motifs.length.toString()} />
        </div>

        <div className="soft-scrollbar mt-6 max-h-[54vh] space-y-2 overflow-y-auto pr-1">
          {records.map((record) => (
            <button
              key={record.id}
              type="button"
              onClick={() => onSelect(record.id)}
              className={clsx(
                "w-full border-l px-4 py-3 text-left transition",
                selectedRecord?.id === record.id
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

      {selectedRecord ? (
        <ArchiveDetail record={selectedRecord} motifs={motifs} />
      ) : (
        <EmptyPanel title="还没有档案" text="完成一次梦境解析后，第一条记录会出现在这里。" />
      )}
    </section>
  );
}

function ArchiveDetail({ record, motifs }: { record: DreamRecord; motifs: Array<[string, number]> }) {
  return (
    <article className="dream-panel px-6 py-7 sm:px-9 sm:py-9">
      <div className="flex flex-col gap-3 border-b border-[color:var(--dream-line)] pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">{record.analystName}</p>
          <h2 className="mt-3 font-serif text-5xl font-semibold leading-tight">{record.analysis.title}</h2>
          <p className="mt-4 max-w-3xl font-serif text-xl leading-9 dream-muted">{record.analysis.opening}</p>
        </div>
        <p className="shrink-0 text-xs dream-muted">{formatDateTime(record.createdAt)}</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
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
  motifs
}: {
  profile: string;
  records: DreamRecord[];
  motifs: Array<[string, number]>;
}) {
  const latest = records[0];

  return (
    <section className="dream-fade grid gap-6 xl:grid-cols-[1fr_360px]">
      <article className="dream-panel p-7 sm:p-10">
        <p className="text-xs uppercase tracking-[0.24em] dream-muted">Inner Profile</p>
        <h1 className="mt-3 font-serif text-5xl font-semibold">我的内在画像</h1>
        <p className="mt-7 whitespace-pre-line text-base leading-8 dream-muted">
          {profile || "完成一次完整解析后，这里会出现持续更新的内在画像。"}
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <ProfileModule title="最近张力" text={latest?.analysis.presentTension || "还需要一次完整解析来生成。"} />
          <ProfileModule title="可能的隐藏需要" text={latest?.analysis.hiddenNeed || latest?.analysis.lifeGuess || "画像会从梦境与追问里慢慢形成。"} />
          <ProfileModule title="关系与行动模式" text={latest?.analysis.relationshipPattern || "多次梦境之后，这里会更清楚地呈现反复模式。"} />
          <ProfileModule title="不过度解读提醒" text={latest?.analysis.avoidOverInterpreting || "这里的内容只作为自我探索，不把梦固定成命运或诊断。"} />
        </div>
      </article>

      <aside className="space-y-5">
        <section className="dream-panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Overview</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="梦境" value={records.length.toString()} />
            <Stat label="问答" value={records.reduce((sum, record) => sum + record.qa.length, 0).toString()} />
          </div>
        </section>

        <section className="dream-panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Recurring Motifs</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {motifs.length ? motifs.map(([motif, count]) => (
              <span key={motif} className="bg-white/8 px-3 py-2 text-sm dream-muted">
                {motif} · {count}
              </span>
            )) : <span className="text-sm dream-muted">暂无反复母题</span>}
          </div>
        </section>

        <section className="dream-panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Next Questions</p>
          <div className="mt-4 space-y-3">
            {(latest?.analysis.nextQuestions || ["我最近总在回避什么？", "我真正需要谁的理解？", "我下一步可以轻一点吗？"]).slice(0, 3).map((item) => (
              <p key={item} className="border-l border-[color:var(--dream-line)] pl-3 text-sm leading-7 dream-muted">{item}</p>
            ))}
          </div>
        </section>

        <section className="dream-panel p-6">
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
  soundOn,
  soundscape,
  volume,
  recordsCount,
  cloudMode,
  setTheme,
  setSoundOn,
  setSoundscape,
  setVolume,
  clearMemory,
  onSignOut
}: {
  user: SessionUser;
  theme: ThemeMode;
  soundOn: boolean;
  soundscape: Soundscape;
  volume: number;
  recordsCount: number;
  cloudMode: boolean;
  setTheme: (value: ThemeMode) => void;
  setSoundOn: (value: boolean) => void;
  setSoundscape: (value: Soundscape) => void;
  setVolume: (value: number) => void;
  clearMemory: () => void;
  onSignOut: () => void;
}) {
  return (
    <section className="dream-fade grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="dream-panel p-7 sm:p-9">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Room Tone</p>
          <h2 className="mt-3 font-serif text-4xl font-semibold">房间的光线</h2>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={clsx("quiet-button", theme === "dark" && "border-[color:var(--dream-glow)] text-[color:var(--dream-text)]")}
            >
              <Moon size={15} />
              黑色模式
            </button>
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={clsx("quiet-button", theme === "light" && "border-[color:var(--dream-glow)] text-[color:var(--dream-text)]")}
            >
              <Sun size={15} />
              白色模式
            </button>
          </div>
        </section>

        <SoundscapeControl
          soundOn={soundOn}
          soundscape={soundscape}
          volume={volume}
          setSoundOn={setSoundOn}
          setSoundscape={setSoundscape}
          setVolume={setVolume}
        />

        <section className="dream-panel p-7 sm:p-9">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Privacy</p>
          <h2 className="mt-3 font-serif text-4xl font-semibold">{cloudMode ? "账户与云端记忆" : "本地记忆"}</h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 dream-muted">
            {cloudMode
              ? `当前账户：${user.email || user.name}。梦境档案会写入 Supabase，并由 RLS 权限隔离。`
              : "当前未配置 Supabase，来访者信息、梦境档案和持续画像只保存在这个浏览器的 localStorage 中。"}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" className="quiet-button opacity-70" disabled>
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
          </div>
        </section>
      </div>

      <aside className="space-y-5">
        <section className="dream-panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Memory</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="档案" value={recordsCount.toString()} />
            <Stat label="模式" value={theme === "dark" ? "暗" : "白"} />
          </div>
        </section>

        <section className="dream-panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] dream-muted">Low Frequency</p>
          <p className="mt-4 text-sm leading-7 dream-muted">
            清空、导出、音景和主题都被放在设置里，主流程只保留咨询和回看，减少打扰。
          </p>
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
    <section className="dream-fade grid gap-6 xl:grid-cols-[1fr_340px]">
      <article className="dream-panel min-h-[520px] p-7 sm:p-10">
        <p className="text-xs uppercase tracking-[0.24em] dream-muted">Night Sea</p>
        <h2 className="mt-3 font-serif text-5xl font-semibold leading-tight">夜海</h2>
        <p className="mt-7 max-w-2xl font-serif text-xl leading-9 dream-muted">
          投递一段温柔但不越界的话，或捞起别人的一句话。每天最多三次，所有投递都会先进入审核。
        </p>

        <form onSubmit={submitBottle} className="dream-panel mt-10 p-5">
          <p className="text-xs uppercase tracking-[0.22em] dream-muted">Send</p>
          <textarea
            value={bottleText}
            onChange={(event) => setBottleText(event.target.value)}
            disabled={!cloudMode || isLoading}
            className="mt-4 min-h-32 w-full resize-y bg-transparent text-base leading-7 dream-text placeholder:text-white/30 disabled:cursor-not-allowed"
            placeholder={cloudMode ? "写一句你愿意放进夜海的话。" : "配置 Supabase 后可以投递。"}
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs dream-muted">{bottleText.length}/280</p>
            <button
              type="submit"
              disabled={!cloudMode || isLoading}
              className="inline-flex min-w-32 items-center justify-center gap-2 bg-[color:var(--dream-glow)] px-5 py-3 text-sm font-medium text-[#0A1128] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
            >
              {isLoading ? <Hourglass className="animate-spin" size={16} /> : <Mail size={16} />}
              投递审核
            </button>
          </div>
        </form>

        <section className="mt-8 border-t border-[color:var(--dream-line)] pt-7">
          <button type="button" onClick={receiveBottle} disabled={!cloudMode || isLoading} className="quiet-button">
            {isLoading ? <Hourglass className="animate-spin" size={15} /> : <Waves size={15} />}
            捞起一只漂流瓶
          </button>
          {receivedBottle ? (
            <p className="mt-5 max-w-2xl font-serif text-2xl leading-10 dream-text">{receivedBottle.body}</p>
          ) : (
            <p className="mt-5 text-sm leading-7 dream-muted">捞起的内容会出现在这里。不会显示对方身份。</p>
          )}
        </section>
      </article>

      <aside className="dream-panel p-6">
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
    <section className="dream-fade grid gap-6 xl:grid-cols-[1fr_340px]">
      <article className="dream-panel p-7 sm:p-10">
        <div className="flex flex-col gap-4 border-b border-[color:var(--dream-line)] pb-7 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] dream-muted">Admin Console</p>
            <h2 className="mt-3 font-serif text-5xl font-semibold leading-tight">审核与管理</h2>
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
              <article key={bottle.id} className="dream-panel p-5">
                <p className="font-serif text-xl leading-9 dream-text">{bottle.body}</p>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs dream-muted">{formatDateTime(bottle.created_at)}</p>
                  <div className="flex gap-2">
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

      <aside className="dream-panel p-6">
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
    <div className="border border-[color:var(--dream-line)] bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.2em] dream-muted">{label}</p>
      <p className="mt-2 font-serif text-3xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <section className="dream-panel flex min-h-80 flex-col items-center justify-center p-8 text-center">
      <h2 className="font-serif text-3xl font-semibold">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-7 dream-muted">{text}</p>
    </section>
  );
}
