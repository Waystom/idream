import { NextResponse } from "next/server";
import { getSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";
import type { DriftBottleRow } from "@/lib/database";

export const runtime = "nodejs";

async function getCurrentUserId() {
  if (!hasSupabaseServerEnv()) {
    throw new Error("Supabase is not configured.");
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("请先登录。");
  }

  return { supabase, userId: user.id };
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const body = (await request.json()) as { body?: string };
    const content = body.body?.trim() || "";

    if (content.length < 4 || content.length > 280) {
      return NextResponse.json({ error: "漂流瓶内容需要在 4 到 280 个字之间。" }, { status: 400 });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { count, error: countError } = await supabase
      .from("drift_bottles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startOfDay.toISOString());

    if (countError) {
      throw countError;
    }

    if ((count || 0) >= 3) {
      return NextResponse.json({ error: "今天已经投递过 3 次了。" }, { status: 429 });
    }

    const { data, error } = await supabase
      .from("drift_bottles")
      .insert({
        user_id: userId,
        body: content,
        status: "pending"
      })
      .select("*")
      .single<DriftBottleRow>();

    if (error) {
      throw error;
    }

    return NextResponse.json({ bottle: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "投递失败。";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  try {
    const { supabase, userId } = await getCurrentUserId();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { count, error: countError } = await supabase
      .from("bottle_receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startOfDay.toISOString());

    if (countError) {
      throw countError;
    }

    if ((count || 0) >= 3) {
      return NextResponse.json({ error: "今天已经捞起过 3 次了。" }, { status: 429 });
    }

    const { data: candidates, error: bottleError } = await supabase
      .from("drift_bottles")
      .select("*")
      .eq("status", "approved")
      .neq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<DriftBottleRow[]>();

    if (bottleError) {
      throw bottleError;
    }

    const bottle = (candidates || [])[Math.floor(Math.random() * (candidates?.length || 0))];

    if (!bottle) {
      return NextResponse.json({ bottle: null });
    }

    await supabase.from("bottle_receipts").insert({
      user_id: userId,
      bottle_id: bottle.id
    });

    return NextResponse.json({ bottle });
  } catch (error) {
    const message = error instanceof Error ? error.message : "捞取失败。";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
