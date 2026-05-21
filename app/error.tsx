"use client";

import { CircleAlert } from "lucide-react";

export default function ErrorPage({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="dream-shell flex min-h-screen items-center justify-center px-5 py-8">
      <section className="dream-panel w-full max-w-md p-8 text-center">
        <CircleAlert className="mx-auto text-red-200" size={24} />
        <p className="mt-5 text-xs uppercase tracking-[0.24em] dream-muted">Something Broke</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold dream-text">房间暂时失去回声</h1>
        <p className="mt-4 text-sm leading-7 dream-muted">刚才的操作没有正常完成。你可以重新尝试，已保存的云端档案不会因此被删除。</p>
        <button type="button" onClick={reset} className="quiet-button mt-7 justify-center">
          再试一次
        </button>
      </section>
    </main>
  );
}
