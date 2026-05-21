"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, Hourglass, LockKeyhole } from "lucide-react";
import { getSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase/browser";
import type { EmailOtpType } from "@supabase/supabase-js";

type ConfirmState = "checking" | "success" | "error";

function takeHashParams() {
  const params = new URLSearchParams(window.location.search);

  if (window.location.hash.length > 1) {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    hashParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });
  }

  return params;
}

export default function AuthConfirmPage() {
  const supabaseEnabled = hasSupabaseBrowserEnv();
  const [state, setState] = useState<ConfirmState>("checking");
  const [message, setMessage] = useState("正在确认你的邮箱，请稍候。");

  const icon = useMemo(() => {
    if (state === "checking") {
      return <Hourglass className="mx-auto animate-spin dream-muted" size={24} />;
    }

    if (state === "error") {
      return <CircleAlert className="mx-auto text-red-200" size={24} />;
    }

    return <LockKeyhole className="mx-auto text-[color:var(--dream-glow)]" size={24} />;
  }, [state]);

  useEffect(() => {
    async function confirmEmail() {
      if (!supabaseEnabled) {
        setState("error");
        setMessage("当前站点还没有配置 Supabase，暂时无法确认邮箱。");
        return;
      }

      try {
        const supabase = getSupabaseBrowserClient();
        const params = takeHashParams();
        const code = params.get("code");
        const tokenHash = params.get("token_hash");
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = (params.get("type") || "signup") as EmailOtpType;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            throw error;
          }
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type
          });

          if (error) {
            throw error;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (error) {
            throw error;
          }
        } else {
          throw new Error("确认链接缺少必要信息，请从最新一封注册邮件重新打开。");
        }

        setState("success");
        setMessage("邮箱确认成功。现在可以回到梦境咨询室继续使用。");
        window.history.replaceState(null, "", "/auth/confirm");
      } catch (error) {
        setState("error");
        setMessage(error instanceof Error ? `邮箱确认失败：${error.message}` : "邮箱确认失败。");
      }
    }

    void confirmEmail();
  }, [supabaseEnabled]);

  return (
    <main className="dream-shell flex min-h-screen items-center justify-center px-5 py-8">
      <section className="dream-panel w-full max-w-md p-8 text-center">
        {icon}
        <p className="mt-5 text-xs uppercase tracking-[0.24em] dream-muted">Email Confirmation</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold dream-text">{state === "success" ? "邮箱已确认" : state === "error" ? "确认遇到问题" : "正在确认"}</h1>
        <p className="mt-4 text-sm leading-7 dream-muted">{message}</p>
        <Link href="/" className="quiet-button mt-7 justify-center">
          <ArrowRight size={15} />
          <span>回到 Idream</span>
        </Link>
      </section>
    </main>
  );
}
