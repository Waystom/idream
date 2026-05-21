import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="dream-shell flex min-h-screen items-center justify-center px-5 py-8">
      <section className="dream-panel w-full max-w-md p-8 text-center">
        <p className="text-xs uppercase tracking-[0.24em] dream-muted">404</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold dream-text">这间房间不存在</h1>
        <p className="mt-4 text-sm leading-7 dream-muted">也许这只是一个没有被记录下来的梦。回到 Idream，继续从入口进入。</p>
        <Link href="/" className="quiet-button mt-7 justify-center">
          <ArrowLeft size={15} />
          <span>回到中庭</span>
        </Link>
      </section>
    </main>
  );
}
