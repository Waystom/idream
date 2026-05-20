import { NextResponse } from "next/server";
import { getSupabaseAdminClient, getSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";
import type { AdminStats, DriftBottleRow, ProfileRow } from "@/lib/database";

export const runtime = "nodejs";

async function requireAdmin() {
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

  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).single<ProfileRow>();

  if (error || profile.role !== "admin") {
    throw new Error("没有管理员权限。");
  }

  return user.id;
}

async function countRows(table: string, filter?: { column: string; value: string }) {
  const admin = getSupabaseAdminClient();
  let query = admin.from(table).select("id", { count: "exact", head: true });

  if (filter) {
    query = query.eq(filter.column, filter.value);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count || 0;
}

export async function GET() {
  try {
    await requireAdmin();
    const admin = getSupabaseAdminClient();

    const [users, dreams, bottlesPending, bottlesApproved] = await Promise.all([
      countRows("profiles"),
      countRows("dream_records"),
      countRows("drift_bottles", { column: "status", value: "pending" }),
      countRows("drift_bottles", { column: "status", value: "approved" })
    ]);

    const { data: bottles, error: bottleError } = await admin
      .from("drift_bottles")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(40)
      .returns<DriftBottleRow[]>();

    if (bottleError) {
      throw bottleError;
    }

    const stats: AdminStats = {
      users,
      dreams,
      bottlesPending,
      bottlesApproved
    };

    return NextResponse.json({ stats, bottles: bottles || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取管理后台失败。";

    return NextResponse.json({ error: message }, { status: 403 });
  }
}
