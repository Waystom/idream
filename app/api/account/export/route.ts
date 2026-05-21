import { NextResponse } from "next/server";
import { getSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
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

    const [profile, dreams, snapshots, bottles, receipts] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("dream_records").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("profile_snapshots").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("drift_bottles").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("bottle_receipts").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
    ]);

    for (const result of [profile, dreams, snapshots, bottles, receipts]) {
      if (result.error) {
        throw result.error;
      }
    }

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email
      },
      profile: profile.data,
      dreams: dreams.data || [],
      profileSnapshots: snapshots.data || [],
      driftBottles: bottles.data || [],
      bottleReceipts: receipts.data || []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导出失败。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
