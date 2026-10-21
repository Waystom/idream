import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyEmailLink } from "../lib/auth-confirm";
import { authDestination, authErrorMessage } from "../lib/auth-messages";
import { resolveSupabaseConfig } from "../lib/supabase/config";
import { requestEmailCode, requestSignupCode, resendSignupCode, verifyEmailCode } from "../lib/auth-otp";

function authFixture(overrides = {}) {
  return {
    exchangeCodeForSession: async () => ({ error: null }),
    verifyOtp: async () => ({ error: null }),
    setSession: async () => ({ error: null }),
    getUser: async () => ({ data: { user: { email_confirmed_at: "2026-01-01" } }, error: null }),
    ...overrides
  } as unknown as SupabaseClient["auth"];
}

test("expired and rejected links never report confirmation success", async () => {
  await assert.rejects(verifyEmailLink(authFixture(), new URLSearchParams("error_description=expired")), /expired/);
  await assert.rejects(verifyEmailLink(authFixture({ exchangeCodeForSession: async () => ({ error: new Error("invalid code") }) }), new URLSearchParams("code=bad")), /invalid code/);
  await assert.rejects(verifyEmailLink(authFixture({ verifyOtp: async () => ({ error: new Error("expired token") }) }), new URLSearchParams("token_hash=bad&type=signup")), /expired token/);
});

test("confirmation requires a verified user session", async () => {
  await assert.rejects(verifyEmailLink(authFixture({ getUser: async () => ({ data: { user: null }, error: null }) }), new URLSearchParams()), /链接/);
  assert.equal(await verifyEmailLink(authFixture(), new URLSearchParams("code=valid")), "/");
});

test("recovery opens password reset and external redirect targets are ignored", async () => {
  assert.equal(await verifyEmailLink(authFixture(), new URLSearchParams("token_hash=valid&type=recovery")), "/auth/reset-password");
  assert.equal(authDestination("https://untrusted.example", "signup"), "/");
  assert.equal(authDestination("//untrusted.example", null), "/");
  await assert.rejects(verifyEmailLink(authFixture(), new URLSearchParams("type=unknown")), /类型/);
});

test("missing PKCE state gives actionable guidance without reporting success", async () => {
  const error = new Error("PKCE code verifier not found in storage.");
  await assert.rejects(verifyEmailLink(authFixture({ exchangeCodeForSession: async () => ({ error }) }), new URLSearchParams("code=used")), /PKCE/);
  assert.match(authErrorMessage(error), /同一个浏览器/);
});

test("blank and example Supabase values keep local mode available", () => {
  assert.equal(resolveSupabaseConfig("", ""), null);
  assert.equal(resolveSupabaseConfig("https://your-project.supabase.co", "your_supabase_anon_key"), null);
  assert.equal(resolveSupabaseConfig("not-a-url", "test-key"), null);
  assert.deepEqual(resolveSupabaseConfig("https://example.supabase.co/", "test-key"), { url: "https://example.supabase.co", key: "test-key" });
});

test("email code requests do not create accounts or require a redirect URL", async () => {
  let request: unknown;
  const auth = authFixture({ signInWithOtp: async (params: unknown) => { request = params; return { error: null }; } });
  await requestEmailCode(auth, " reader@example.com ");
  assert.deepEqual(request, { email: "reader@example.com", options: { shouldCreateUser: false } });
  await assert.rejects(requestEmailCode(authFixture({ signInWithOtp: async () => ({ error: new Error("rate limit") }) }), "reader@example.com"), /rate limit/);
});

test("signup sends a confirmation code with password and profile metadata, without requiring a redirect", async () => {
  let request: unknown;
  const auth = authFixture({
    signUp: async (params: unknown) => {
      request = params;
      return { data: { user: { id: "pending-user", identities: [{ id: "email" }] }, session: null }, error: null };
    }
  });
  const user = await requestSignupCode(auth, " new@example.com ", "test-password", { displayName: " Dreamer ", intention: " Reflect " });
  assert.equal(user, null);
  assert.deepEqual(request, {
    email: "new@example.com",
    password: "test-password",
    options: { data: { display_name: "Dreamer", intention: "Reflect" } }
  });
});

test("signup validates input and surfaces duplicate accounts and provider errors", async () => {
  const profile = { displayName: "", intention: "" };
  const noRequest = authFixture({ signUp: async () => { assert.fail("invalid input must not be sent"); } });
  await assert.rejects(requestSignupCode(noRequest, "invalid", "test-password", profile), /邮箱/);
  await assert.rejects(requestSignupCode(noRequest, "new@example.com", "short", profile), /至少 8 位/);
  await assert.rejects(requestSignupCode(authFixture({ signUp: async () => ({ data: { user: { identities: [] }, session: null }, error: null }) }), "existing@example.com", "test-password", profile), /已注册/);
  await assert.rejects(requestSignupCode(authFixture({ signUp: async () => ({ error: new Error("rate limit") }) }), "new@example.com", "test-password", profile), /rate limit/);
});

test("resending signup codes confirms an existing pending account without repeating signup", async () => {
  let request: unknown;
  const auth = authFixture({
    signUp: async () => { assert.fail("resending must not create an account"); },
    resend: async (params: unknown) => { request = params; return { error: null }; }
  });
  await resendSignupCode(auth, " new@example.com ");
  assert.deepEqual(request, { type: "signup", email: "new@example.com" });
  await assert.rejects(resendSignupCode(auth, "invalid"), /邮箱/);
  await assert.rejects(resendSignupCode(authFixture({ resend: async () => ({ error: new Error("rate limit") }) }), "new@example.com"), /rate limit/);
  assert.match(authErrorMessage(new Error("Email not confirmed")), /注册页获取验证码/);
});

test("email codes establish a session without an original browser's PKCE state", async () => {
  const user = { id: "email-code-user", email: "reader@example.com" };
  const requests: unknown[] = [];
  const auth = authFixture({
    exchangeCodeForSession: async () => { throw new Error("PKCE state must not be needed"); },
    verifyOtp: async (params: unknown) => {
      requests.push(params);
      return { data: { user, session: { user, access_token: "test-session" } }, error: null };
    }
  });
  assert.equal(await verifyEmailCode(auth, " reader@example.com ", " 012345 "), user);
  assert.equal(await verifyEmailCode(auth, "reader@example.com", "01234567"), user);
  assert.deepEqual(requests, [
    { email: "reader@example.com", token: "012345", type: "email" },
    { email: "reader@example.com", token: "01234567", type: "email" }
  ]);
});

test("invalid email and incomplete codes do not reach the auth service", async () => {
  const auth = authFixture({
    signInWithOtp: async () => { assert.fail("invalid email must not be sent"); },
    verifyOtp: async () => { assert.fail("invalid code must not be sent"); }
  });
  await assert.rejects(requestEmailCode(auth, "not-an-email"), /邮箱/);
  for (const code of ["", "12345", "12345678901", "12345a"]) {
    await assert.rejects(verifyEmailCode(auth, "reader@example.com", code), /验证码/);
  }
});

test("expired codes and missing sessions never report a successful login", async () => {
  const email = "reader@example.com";
  const expired = new Error("Token has expired or is invalid");
  await assert.rejects(verifyEmailCode(authFixture({ verifyOtp: async () => ({ error: expired }) }), email, "012345"), /expired/);
  assert.match(authErrorMessage(expired, "otp"), /验证码不正确或已过期/);
  assert.doesNotMatch(authErrorMessage(expired, "otp"), /链接/);
  for (const data of [
    { user: { id: "user" }, session: null },
    { user: null, session: { user: { id: "user" } } },
    { user: { id: "other" }, session: { user: { id: "user" } } }
  ]) {
    await assert.rejects(verifyEmailCode(authFixture({ verifyOtp: async () => ({ data, error: null }) }), email, "012345"), /登录状态/);
  }
});
