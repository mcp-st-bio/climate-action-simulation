"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** 교사 첫 화면. 방 만들기와 관전 화면 열기. */
export default function TeacherEntry() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [boardCode, setBoardCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) throw new Error();
      const { code, hostToken } = await res.json();
      // 교사 전용 조작(수동 보정·되돌리기·내보내기)에 필요한 토큰. 이 응답에서만 받을 수 있다.
      localStorage.setItem(`climate-host-${code}`, hostToken);
      router.push(`/host/${code}`);
    } catch {
      setError("방을 만들지 못했습니다. Supabase 연결을 확인하세요.");
      setCreating(false);
    }
  }

  function openBoard(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = boardCode.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("방 코드는 6자리입니다.");
      return;
    }
    router.push(`/board/${trimmed}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-6">
      <header>
        <h1 className="text-3xl font-black">기후변화로부터 지구를 지켜라!</h1>
        <p className="mt-2 text-slate-400">교사 화면</p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-bold">1. 방 만들기</h2>
        <p className="mt-1 text-sm text-slate-400">
          방을 만들면 6자리 코드가 나옵니다. 이 기기가 교사 기기로 등록되어 안전장치를 쓸 수 있습니다.
        </p>
        <button
          onClick={createRoom}
          disabled={creating}
          className="mt-4 min-h-[60px] w-full rounded-lg bg-sky-700 px-6 text-lg font-bold hover:bg-sky-600 disabled:opacity-50"
        >
          {creating ? "만드는 중..." : "새 방 만들기"}
        </button>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-bold">2. 관전 화면 열기</h2>
        <p className="mt-1 text-sm text-slate-400">
          프로젝터·전자칠판에 띄우는 화면입니다. 학생 모두에게 공개됩니다.
        </p>
        <form onSubmit={openBoard} className="mt-4 flex gap-3">
          <input
            value={boardCode}
            onChange={(e) => setBoardCode(e.target.value.toUpperCase())}
            placeholder="방 코드"
            maxLength={6}
            autoCapitalize="characters"
            className="min-h-[60px] flex-1 rounded-lg bg-slate-800 px-4 text-center text-xl font-bold tracking-[0.2em] placeholder:text-base placeholder:tracking-normal placeholder:text-slate-500"
          />
          <button
            type="submit"
            className="min-h-[60px] rounded-lg bg-emerald-700 px-6 text-lg font-bold hover:bg-emerald-600"
          >
            열기
          </button>
        </form>
      </section>

      {error && <p className="text-red-400">{error}</p>}

      <footer className="text-center">
        <Link href="/" className="text-sm text-slate-500 underline hover:text-slate-300">
          학생 접속 화면 보기
        </Link>
      </footer>
    </main>
  );
}
