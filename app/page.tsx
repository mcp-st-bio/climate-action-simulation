"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** 학생 태블릿 접속 페이지. 태블릿이 긴 IP를 치므로 경로 없이 루트에 둔다. */
export default function StudentEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("방 코드는 6자리입니다.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${trimmed}`, { cache: "no-store" });
      if (res.status === 404) {
        setError("그런 방이 없습니다. 코드를 다시 확인하세요.");
        return;
      }
      if (!res.ok) {
        setError("서버와 연결하지 못했습니다.");
        return;
      }
      router.push(`/play/${trimmed}`);
    } catch {
      setError("서버와 연결하지 못했습니다.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-black">기후변화로부터 지구를 지켜라!</h1>
        <p className="mt-3 text-lg text-slate-400">선생님이 알려준 방 코드를 입력하세요.</p>
      </header>

      <form onSubmit={join} className="space-y-4">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="＿ ＿ ＿ ＿ ＿ ＿"
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          className="min-h-[90px] w-full rounded-2xl bg-slate-800 px-4 text-center text-4xl font-black tracking-[0.25em] placeholder:text-2xl placeholder:tracking-[0.15em] placeholder:text-slate-600"
        />
        <button
          type="submit"
          disabled={checking}
          className="min-h-[80px] w-full rounded-2xl bg-emerald-700 text-2xl font-black hover:bg-emerald-600 disabled:opacity-50"
        >
          {checking ? "확인 중..." : "입장하기"}
        </button>
      </form>

      {error && <p className="text-center text-lg text-red-400">{error}</p>}

      <footer className="pt-8 text-center">
        <Link href="/teacher" className="text-sm text-slate-500 underline hover:text-slate-300">
          선생님이신가요? 교사 화면으로
        </Link>
      </footer>
    </main>
  );
}
