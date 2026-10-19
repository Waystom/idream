import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyEmailLink } from "../lib/auth-confirm";
import { authDestination, authErrorMessage } from "../lib/auth-messages";
import { resolveSupabaseConfig } from "../lib/supabase/config";

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
