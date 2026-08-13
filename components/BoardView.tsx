"use client";

import { useEffect, useRef, useState } from "react";
import { useRoom } from "@/lib/useRoom";
import { useCountdown, formatTime } from "@/lib/useCountdown";
import { getEarthBackground, getEarthCopy } from "@/lib/earthTheme";
import { CHOICE_LABEL, PHASE_LABEL } from "@/lib/labels";
import QuizResult from "@/components/QuizResult";
import {
  computeFinalDistribution,
  getEarthState,
  getPhaseSequence,
  toDisplayTemp,
} from "@/lib/rules";

/** 관전 화면 (프로젝터/전자칠판). 읽기 전용. */
export default function BoardView({ code }: { code: string }) {
  const { state, notFound } = useRoom(code);
  const remaining = useCountdown(state?.timer);
  const [flash, setFlash] = useState<string | null>(null);
  const lastStateNameRef = useRef<string | null>(null);

  const earthState = state ? getEarthState(state.temperatureDeci) : null;

  // 기온이 구간을 넘을 때마다 경고 연출을 띄운다 (SPEC.md 5절: 이 수업의 교육 효과 핵심).
  useEffect(() => {
    if (!earthState) return;
    if (lastStateNameRef.current === null) {
      lastStateNameRef.current = earthState.name;
      return;
    }
    if (earthState.name !== lastStateNameRef.current) {
      lastStateNameRef.current = earthState.name;
      setFlash(earthState.name);
      const id = setTimeout(() => setFlash(null), 6000);
      return () => clearTimeout(id);
    }
  }, [earthState]);

  if (notFound) {
    return <CenteredMessage>방 코드 {code} 를 찾을 수 없습니다.</CenteredMessage>;
  }
  if (!state || !earthState) {
    return <CenteredMessage>연결 중...</CenteredMessage>;
  }

  // 로비: 방 코드를 크게 띄우고 태블릿 접속을 기다린다.
  // 전원 접속하면 대시보드로 넘어가고, 태블릿이 모자라 교사가 그냥 진행한 경우에도 넘어간다.
  if (state.stage === "lobby" && state.connectedCount < state.expectedTeams) {
    return <BoardLobby code={code} connected={state.connectedCount} expected={state.expectedTeams} />;
  }

  const phase = getPhaseSequence(state.turn)[state.phaseIndex];
  const copy = getEarthCopy(state.temperatureDeci);
  const ranked = [...state.countries].sort((a, b) => b.gp - a.gp);
  const showFinal = state.gameOver || phase === "resource_distribution";
  const distribution = showFinal
    ? computeFinalDistribution(state.countries, state.temperatureDeci)
    : null;

  return (
    <main
      className="min-h-screen p-8 text-white transition-colors duration-1000"
      style={{ backgroundColor: getEarthBackground(state.temperatureDeci) }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-bold opacity-80">
            {state.turn}턴 / 8턴 · {PHASE_LABEL[phase]}
          </div>
          <div className="mt-1 text-lg opacity-60">방 코드 {code}</div>
        </div>
        {!showFinal && (
          <div className="text-right">
            <div className="text-[10vh] font-black leading-none tabular-nums">
              {formatTime(remaining)}
            </div>
            {state.timer.startedAt === null && (
              <div className="text-2xl font-bold opacity-70">일시정지</div>
            )}
          </div>
        )}
      </div>

      {/* 기온: 화면 높이의 1/4 이상 (SPEC.md 11절) */}
      <div className="mt-6 text-center">
        <div className={`${phase === "quiz" ? "text-[16vh]" : "text-[30vh]"} font-black leading-none tabular-nums`}>
          {toDisplayTemp(state.temperatureDeci).toFixed(1)}°
        </div>
        <div className="text-[5vh] font-bold">{earthState.name}</div>
        {earthState.resource && (
          <div className="text-[3vh] opacity-80">획득 자원: {earthState.resource}</div>
        )}
      </div>

      {phase === "quiz" && state.quiz ? (
        <section className="mx-auto mt-6 max-w-5xl space-y-5 rounded-2xl bg-black/25 p-6 text-center">
          <div className="text-[4vh] font-bold leading-snug">{state.quiz.question}</div>
          {state.quiz.isCorrect === null ? <p className="text-[2.5vh] opacity-70">학급 답변을 기다리고 있습니다.</p> : <QuizResult quiz={state.quiz} large />}
        </section>
      ) : showFinal ? (
        <section className="mx-auto mt-8 max-w-4xl">
          <h2 className="mb-4 text-center text-[4vh] font-black">
            {state.gameOver ? "지구의 멸망 — 게임 종료" : "최종 자원 배분"}
          </h2>
          <table className="w-full text-[2.5vh]">
            <thead className="opacity-70">
              <tr className="border-b border-white/30">
                <th className="py-2 text-left">국가</th>
                <th className="py-2 text-right">최종 GP</th>
                <th className="py-2 text-right">비율</th>
                <th className="py-2 text-right">과자</th>
              </tr>
            </thead>
            <tbody>
              {distribution?.map((r) => (
                <tr key={r.id} className="border-b border-white/15">
                  <td className="py-2 font-bold">
                    {state.countries.find((c) => c.id === r.id)?.name}
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.gp}</td>
                  <td className="py-2 text-right tabular-nums">{(r.ratio * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right font-black tabular-nums">{r.snacks}개</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="mt-8">
          <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
            {ranked.map((c, i) => (
              <div key={c.id} className="rounded-xl bg-black/25 p-4 text-center">
                <div className="text-[2vh] opacity-70">{i + 1}위</div>
                <div className="text-[3vh] font-bold">{c.name}</div>
                <div className="text-[5vh] font-black leading-tight tabular-nums">{c.gp}</div>
                {state.revealed && state.devChoices[c.id] && (
                  <div className="text-[1.8vh] opacity-90">
                    {CHOICE_LABEL[state.devChoices[c.id]!]}
                  </div>
                )}
                {c.forcedChoice && (
                  <div className="mt-1 rounded bg-amber-400/25 px-1 text-[1.6vh]">
                    환경 우선 강제 ({c.forcedChoice.turnsRemaining}턴)
                  </div>
                )}
              </div>
            ))}
          </div>

          {phase === "dev_select" && !state.revealed && (
            <div className="mt-8 text-center text-[5vh] font-black">
              {state.submittedCountryIds.length} / 6 제출 완료
            </div>
          )}
        </section>
      )}

      {flash && (
        <div className="fixed inset-0 z-50 flex animate-pulse flex-col items-center justify-center bg-black/80 p-8 text-center">
          <button
            onClick={() => setFlash(null)}
            className="absolute right-6 top-6 rounded-lg border border-white/30 bg-black/40 px-5 py-3 text-[2vh] font-bold hover:bg-black/70"
          >
            닫기
          </button>
          <div className="text-[3vh] font-bold text-amber-300">지구의 상태가 변했습니다</div>
          <div className="mt-4 text-[8vh] font-black">{flash}</div>
          <div className="mt-4 text-[4vh] font-bold text-amber-200">{copy.headline}</div>
          <p className="mt-6 max-w-4xl text-[2.6vh] leading-relaxed opacity-90">
            {copy.description}
          </p>
        </div>
      )}
    </main>
  );
}

function BoardLobby({
  code,
  connected,
  expected,
}: {
  code: string;
  connected: number;
  expected: number;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-teal-950 p-8 text-white">
      <p className="text-[4vh] font-bold opacity-80">태블릿에서 아래 코드를 입력하세요</p>

      <div className="my-[4vh] rounded-3xl bg-black/30 px-[6vw] py-[4vh]">
        <div className="text-[22vh] font-black leading-none tracking-[0.12em] tabular-nums">
          {code}
        </div>
      </div>

      <p className="text-[6vh] font-black tabular-nums">
        {connected} / {expected} 접속
      </p>

      <div className="mt-[3vh] flex gap-3">
        {Array.from({ length: expected }, (_, i) => (
          <div
            key={i}
            className={`h-[3vh] w-[3vh] rounded-full ${i < connected ? "bg-emerald-400" : "bg-white/20"}`}
          />
        ))}
      </div>

      <p className="mt-[5vh] text-[2.5vh] opacity-60">
        모든 조가 접속하면 자동으로 다음 화면으로 넘어갑니다.
      </p>
    </main>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <p className="text-3xl font-bold text-slate-400">{children}</p>
    </main>
  );
}
