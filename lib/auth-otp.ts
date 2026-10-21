import type { SupabaseClient } from "@supabase/supabase-js";

function normalizeEmail(email: string) {
  const value = email.trim();
  if (!/^[^\s@]+@[^\s@]+$/.test(value)) throw new Error("请填写有效的邮箱地址。");
  return value;
}

export async function requestEmailCode(auth: SupabaseClient["auth"], email: string) {
  const { error } = await auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: false }
  });
  if (error) throw error;
}

export async function requestSignupCode(
  auth: SupabaseClient["auth"],
  email: string,
  password: string,
  profile: { displayName: string; intention: string }
) {
  const normalizedEmail = normalizeEmail(email);
  if (password.length < 8) throw new Error("请设置至少 8 位密码。");
  const { data, error } = await auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { display_name: profile.displayName.trim() || "来访者", intention: profile.intention.trim() }
    }
  });
  if (error) throw error;
  if (data.user?.identities?.length === 0) throw new Error("这个邮箱已注册，请直接登录或找回密码。");
  return data.session?.user || null;
}

export async function resendSignupCode(auth: SupabaseClient["auth"], email: string) {
  const { error } = await auth.resend({ type: "signup", email: normalizeEmail(email) });
  if (error) throw error;
}

export async function verifyEmailCode(auth: SupabaseClient["auth"], email: string, token: string) {
  const normalizedEmail = normalizeEmail(email);
  const code = token.trim();
  if (!/^\d{6,10}$/.test(code)) throw new Error("请填写邮件中的完整数字验证码。");

  // Email OTP establishes a session directly, without a browser's PKCE verifier.
  const { data, error } = await auth.verifyOtp({ email: normalizedEmail, token: code, type: "email" });
  if (error) throw error;
  if (!data.session?.user || !data.user || data.user.id !== data.session.user.id) {
    throw new Error("未能确认登录状态，请重新获取验证码。");
  }
  return data.user;
}
