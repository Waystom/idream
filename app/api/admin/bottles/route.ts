import { NextResponse } from "next/server";
import { getSupabaseAdminClient, getSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";
import type { BottleStatus, ProfileRow } from "@/lib/database";

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

export async function PATCH(request: Request) {
  try {
    const adminId = await requireAdmin();
    const body = (await request.json()) as {
      id?: string;
      status?: BottleStatus;
      note?: string;
    };

    if (!body.id || !body.status || !["approved", "rejected"].includes(body.status)) {
      return NextResponse.json({ error: "审核参数不正确。" }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { error } = await admin
      .from("drift_bottles")
      .update({
        status: body.status,
        moderation_note: body.note || null,
        moderator_id: adminId,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", body.id);

    if (error) {
      throw error;
    }

    await admin.from("admin_audit_logs").insert({
      admin_id: adminId,
      action: `drift_bottle.${body.status}`,
      target_table: "drift_bottles",
      target_id: body.id,
      metadata: {
        note: body.note || null
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "审核失败。";

    return NextResponse.json({ error: message }, { status: 403 });
  }
}
