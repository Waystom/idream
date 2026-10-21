export function authErrorMessage(error: unknown, context: "link" | "otp" = "link") {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(message)) return "邮箱或密码不正确，请检查后再试。";
  if (/email not confirmed/i.test(message)) return "邮箱还未确认，请在注册页获取验证码并完成验证。";
  if (/already registered|already been registered/i.test(message)) return "这个邮箱已注册，请直接登录或找回密码。";
  if (/rate limit|too many requests|security purposes/i.test(message)) return "邮件发送较频繁，请稍后再试，并检查垃圾邮件。";
  if (/pkce|code.verifier|flow.state.not.found/i.test(message)) return "请在发起登录的同一个浏览器中打开邮件链接。回到原浏览器重新发送邮件，并使用最新一封邮件中的链接。";
  if (/expired|invalid.*(token|code)|otp_expired/i.test(message)) return context === "otp" ? "验证码不正确或已过期，请检查最新一封邮件，或重新获取验证码。" : "这条邮件链接已失效，请重新申请一封邮件。";
  if (/signups? not allowed|signup_disabled|user not found/i.test(message)) return "请先注册账户，再使用邮箱验证码登录。";
  if (/fetch|network/i.test(message)) return "暂时无法连接账户服务，请检查网络后重试。";
  return message || "账户服务暂时不可用，请稍后重试。";
}

export function authDestination(next: string | null, type: string | null) {
  return next === "/auth/reset-password" || type === "recovery" ? "/auth/reset-password" : "/";
}
