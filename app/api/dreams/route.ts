import { NextResponse } from "next/server";
import { getSupabaseAdminClient, getSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";
import type { AnalystKey, DreamAnalysis } from "@/lib/types";
import type { DreamRecordRow } from "@/lib/database";

export const runtime = "nodejs";

type SaveDreamBody = {
  analystKey: AnalystKey;
  analystName: string;
  dream: {
    dreamAt?: string;
    dreamText?: string;
    wakingLife?: string;
    mood?: string;
  };
  followupAnswers: Array<{
    question: string;
    answer: string;
  }>;
  analysis: DreamAnalysis;
  image?: {
    imageUrl: string;
    mimeType: string;
  } | null;
  feedback?: "hit" | "miss" | "unsure" | null;
  feedbackNote?: string | null;
  qa: Array<{
    question: string;
    answer: string;
    reflection: string;
  }>;
};

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

function trimText(value: string | undefined, maxLength: number) {
  return (value || "").trim().slice(0, maxLength);
}

function isSchemaCacheOrColumnError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message || "";

  return maybeError.code === "42703" || maybeError.code === "PGRST204" || message.includes("schema cache") || message.includes("Could not find the") || message.includes("column");
}

function minimalRecordPayload(userId: string, body: SaveDreamBody) {
  return {
    user_id: userId,
    analyst_key: body.analystKey,
    analyst_name: trimText(body.analystName, 80) || "未选择",
    dream_at: trimText(body.dream?.dreamAt, 120),
    dream_text: trimText(body.dream?.dreamText, 6000),
    waking_life: trimText(body.dream?.wakingLife, 2000),
    mood: trimText(body.dream?.mood, 1000),
    followup_answers: (body.followupAnswers || []).slice(0, 5),
    analysis: body.analysis,
    inner_questions: (body.qa || []).slice(0, 3)
  };
}

export async function POST(request: Request) {
  try {
    if (!hasSupabaseServerEnv()) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const body = (await request.json()) as SaveDreamBody;

    if (!body.analysis?.title || !body.dream?.dreamText || body.dream.dreamText.trim().length < 12) {
      return NextResponse.json({ error: "梦境或解析内容不完整，暂时无法保存。" }, { status: 400 });
    }

    const persistedImage = body.image?.imageUrl.startsWith("data:") ? null : body.image;
    const payload = {
      ...minimalRecordPayload(user.id, body),
      image_url: persistedImage?.imageUrl || null,
      image_prompt: body.analysis.imagePrompt || null,
      image_mime_type: persistedImage?.mimeType || null,
      feedback: body.feedback || null,
      feedback_note: body.feedbackNote || null
    };

    const admin = getSupabaseAdminClient();
    let insert = await admin.from("dream_records").insert(payload).select("*").single<DreamRecordRow>();

    if (insert.error && isSchemaCacheOrColumnError(insert.error)) {
      insert = await admin.from("dream_records").insert(minimalRecordPayload(user.id, body)).select("*").single<DreamRecordRow>();
    }

    if (insert.error) {
      throw insert.error;
    }

    return NextResponse.json({ record: insert.data });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
