"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, LockKeyhole } from "lucide-react";
import { getSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase/browser";
import { authErrorMessage } from "@/lib/auth-messages";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      try {
        if (!hasSupabaseBrowserEnv()) throw new Error("账户服务暂时不可用，请稍后重试。");
        const { data: { user }, error: sessionError } = await getSupabaseBrowserClient().auth.getUser();
        if (sessionError || !user) throw new Error("请先打开邮件中的重置链接，再设置新密码。");
        if (!cancelled) setReady(true);
      } catch (caught) {
        if (!cancelled) setError(authErrorMessage(caught));
      }
    }
    void checkSession();
    return () => { cancelled = true; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) { setError("请使用至少 8 位的新密码。"); return; }
    if (password !== confirmation) { setError("两次输入的密码不一致。"); return; }
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmation("");
      setDone(true);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dream-shell flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-sm">
        <Link href="/" className="mb-10 inline-flex items-center gap-2 text-sm dream-muted"><ArrowLeft size={16} />回到 Idream</Link>
        {done ? <Check className="dream-glow-text" size={24} /> : <LockKeyhole className="dream-glow-text" size={24} />}
        <h1 className="mt-5 font-serif text-3xl font-medium">{done ? "密码已更新" : "设置新的密码"}</h1>
        <p className="mt-3 text-sm leading-7 dream-muted">{done ? "现在可以带着你的梦，回到房间。" : "为你的私密档案设置一个新的密码。"}</p>
        {error ? <p role="alert" className="notice-error mt-5">{error}</p> : null}
        {done ? <Link href="/" className="primary-button mt-7 w-full">进入中庭<ArrowRight size={16} /></Link> : ready ? (
          <form onSubmit={submit} className="mt-7 space-y-5">
            <label className="field-label">新密码<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="dream-input mt-2" placeholder="至少 8 位" /></label>
            <label className="field-label">确认新密码<input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="dream-input mt-2" placeholder="再次输入新密码" /></label>
            <button disabled={busy} className="primary-button w-full" type="submit">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}{busy ? "正在更新" : "保存新密码"}</button>
          </form>
        ) : !error ? <LoaderCircle className="mt-7 animate-spin dream-muted" size={20} /> : null}
      </section>
    </main>
  );
}
