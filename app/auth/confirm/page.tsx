"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const hasCheckedRef = useRef(false);
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
      if (hasCheckedRef.current) {
        return;
      }

      hasCheckedRef.current = true;

      function finishAsConfirmed(nextMessage: string) {
        setState("success");
        setMessage(nextMessage);
        window.history.replaceState(null, "", "/auth/confirm");
      }

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
        const urlError = params.get("error_description") || params.get("error");

        if (urlError) {
          finishAsConfirmed("这条确认链接已经被处理过，或自动登录会话已经失效。如果你已经可以登录，说明邮箱确认已经完成；请回到首页用邮箱和密码登录。");
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            finishAsConfirmed("邮箱确认已经完成。只是当前浏览器没有建立自动登录会话，请回到首页用邮箱和密码登录。");
            return;
          }
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type
          });

          if (error) {
            finishAsConfirmed("确认链接已经被处理过，或已经失效。如果你已经可以登录，说明邮箱确认已经完成；请回到首页用邮箱和密码登录。");
            return;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (error) {
            finishAsConfirmed("邮箱确认已经完成。只是当前浏览器没有建立自动登录会话，请回到首页用邮箱和密码登录。");
            return;
          }
        } else {
          finishAsConfirmed("确认链接没有携带新的登录信息，可能是已经确认后刷新了页面。请回到首页用邮箱和密码登录。");
          return;
        }

        finishAsConfirmed("邮箱确认成功。现在可以回到梦境咨询室继续使用。");
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
