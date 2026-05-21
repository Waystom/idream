import { NextResponse } from "next/server";
import { getSupabaseAdminClient, getSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
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

    const admin = getSupabaseAdminClient();
    const bucket = process.env.SUPABASE_IMAGE_BUCKET || "dream-images";

    await admin.from("bottle_receipts").delete().eq("user_id", user.id);
    await admin.from("drift_bottles").delete().eq("user_id", user.id);
    await admin.from("profile_snapshots").delete().eq("user_id", user.id);
    await admin.from("dream_records").delete().eq("user_id", user.id);

    const { data: imageFiles } = await admin.storage.from(bucket).list(user.id, {
      limit: 1000
    });

    if (imageFiles?.length) {
      await admin.storage.from(bucket).remove(imageFiles.map((file) => `${user.id}/${file.name}`));
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        psychological_profile: null,
        intention: null
      })
      .eq("id", user.id);

    if (profileError) {
      throw profileError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除失败。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
