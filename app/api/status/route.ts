import { NextResponse } from "next/server";
import { hasSupabaseServerEnv } from "@/lib/supabase/server";
import { hasServiceKey } from "@/lib/service-errors";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    configured: {
      accounts: hasSupabaseServerEnv(),
      accountAdministration: hasServiceKey(process.env.SUPABASE_SERVICE_ROLE_KEY),
      analysis: hasServiceKey(process.env.DEEPSEEK_API_KEY),
      images: hasServiceKey(process.env.GEMINI_IMAGE_API_KEY)
    }
  }, { headers: { "Cache-Control": "no-store" } });
}
