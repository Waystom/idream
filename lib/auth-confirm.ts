import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import { authDestination } from "./auth-messages";

export async function verifyEmailLink(auth: SupabaseClient["auth"], params: URLSearchParams) {
  const urlError = params.get("error_description") || params.get("error");
  if (urlError) throw new Error(urlError);

  const type = params.get("type") || "signup";
  if (!["signup", "invite", "magiclink", "recovery", "email_change", "email"].includes(type)) throw new Error("邮件链接类型无效，请重新申请邮件。");
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  const result = code
    ? await auth.exchangeCodeForSession(code)
    : tokenHash
      ? await auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
      : accessToken && refreshToken
        ? await auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        : null;

  if (result?.error) throw result.error;
  const { data: { user }, error } = await auth.getUser();
  if (error || !user?.email_confirmed_at) throw error || new Error("确认链接不完整或已失效，请回到首页重新申请邮件。");
  return authDestination(params.get("next"), type);
}
