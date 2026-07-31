"use client";

import { useEffect, useState } from "react";
import { TimerState, timerRemainingSec } from "@/lib/roomState";

/** 서버가 준 타이머 상태로부터 남은 초를 1초마다 다시 계산한다. */
export function useCountdown(timer: TimerState | undefined): number {
  const [remaining, setRemaining] = useState(() => (timer ? timerRemainingSec(timer) : 0));

  useEffect(() => {
    if (!timer) return;
    setRemaining(timerRemainingSec(timer));
    if (timer.startedAt === null) return; // 일시정지 중이면 갱신할 필요가 없다
    const id = setInterval(() => setRemaining(timerRemainingSec(timer)), 250);
    return () => clearInterval(id);
  }, [timer]);

  return remaining;
}

export function formatTime(sec: number): string {
  const total = Math.ceil(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
