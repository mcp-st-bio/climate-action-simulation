"use client";

import { useEffect, useState } from "react";
import { useRoom, useTeamToken } from "@/lib/useRoom";
import { useCountdown, formatTime } from "@/lib/useCountdown";
import { CHOICE_GP_LABEL, CHOICE_LABEL, PHASE_LABEL } from "@/lib/labels";
import {
  CountryId,
  DevChoice,
  getAbilityAvailability,
  getEarthState,
  getPhaseSequence,
  toDisplayTemp,
} from "@/lib/rules";

/** 팀 화면 (조별 태블릿). 터치 타깃 최소 60px (SPEC.md 11절). */
export default function TeamView({ code }: { code: string }) {
  const token = useTeamToken(code);
  const { state, error, notFound, clockOffset, dispatch } = useRoom(code, token);
  const remaining = useCountdown(state?.timer);

  // 방에 들어오면 로비에 등록한다. 이미 등록돼 있으면 서버가 무시한다.
  const joined = state?.meConnected;
  useEffect(() => {
    if (token && state && !joined) {
      dispatch({ type: "JOIN_ROOM", teamToken: token });
    }
  }, [token, state, joined, dispatch]);

  // 카운트다운이 흐르도록 국가 선택 단계에서만 주기적으로 다시 그린다.
  useTick(state?.stage === "country_select" ? 200 : null);

  if (notFound) {
    return <Centered>방 코드 {code} 를 찾을 수 없습니다.</Centered>;
  }
  if (!state || !token) {
    return <Centered>연결 중...</Centered>;
  }

  // --- 대기 화면: 교사가 국가 선택을 열어줄 때까지 ---
  if (state.stage === "lobby") {
    return (
      <WaitingRoom
        code={code}
        connected={state.connectedCount}
        expected={state.expectedTeams}
      />
    );
  }

  // --- 5초 카운트다운: 선착순이므로 모두 같은 순간에 열린다 ---
  // 서버 시각 기준으로 계산하므로 태블릿 시계가 틀어져 있어도 동시에 열린다.
  if (state.stage === "country_select" && state.countrySelectOpensAt !== null) {
    const msLeft = state.countrySelectOpensAt - (Date.now() + clockOffset);
    if (msLeft > 0) return <SelectCountdown msLeft={msLeft} />;
  }

  const myCountry = state.myCountryId
    ? state.countries.find((c) => c.id === state.myCountryId) ?? null
    : null;

  // --- 국가 선택 (선점 방식) ---
  if (!myCountry) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <header>
          <h1 className="text-2xl font-black">우리 조의 나라를 고르세요</h1>
          <p className="mt-1 text-sm text-slate-400">방 코드 {code} · 이미 선택된 나라는 고를 수 없습니다.</p>
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {state.countries.map((c) => {
            const taken = state.claimedCountryIds.includes(c.id);
            return (
              <button
                key={c.id}
                disabled={taken}
                onClick={() => dispatch({ type: "CLAIM_COUNTRY", countryId: c.id, teamToken: token })}
                className="min-h-[80px] rounded-xl border border-slate-700 bg-slate-900 p-4 text-left disabled:opacity-40"
              >
                <div className="text-xl font-bold">{c.name}</div>
                <div className="text-sm text-slate-400">
                  {taken ? "이미 선택됨" : `${c.ability} · GP ${c.gp}`}
                </div>
              </button>
            );
          })}
        </div>
        {error && <p className="text-red-400">{error}</p>}
      </main>
    );
  }

  const phase = getPhaseSequence(state.turn)[state.phaseIndex];
  const earthState = getEarthState(state.temperatureDeci);
  const myChoice: DevChoice | undefined = myCountry.forcedChoice
    ? myCountry.forcedChoice.choice
    : state.devChoices[myCountry.id];
  const submitted = state.submittedCountryIds.includes(myCountry.id);
  const availability = getAbilityAvailability(myCountry, state.turn, state.temperatureDeci);
  const requested = state.abilityRequests.includes(myCountry.id);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-black">{myCountry.name}</div>
            <div className="text-sm text-slate-400">
              {state.turn}턴 / 8턴 · {PHASE_LABEL[phase]}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black tabular-nums">{myCountry.gp}</div>
            <div className="text-xs text-slate-400">우리 GP</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-sm">
          <span className="text-slate-400">
            지구 {toDisplayTemp(state.temperatureDeci).toFixed(1)}° · {earthState.name}
          </span>
          <span className="font-bold tabular-nums">{formatTime(remaining)}</span>
        </div>
      </header>

      {phase === "dev_select" ? (
        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-lg font-bold">개발 방식을 고르세요</h2>

          {myCountry.forcedChoice && (
            <p className="rounded-lg bg-amber-900/40 p-3 text-sm text-amber-200">
              다른 나라의 특수 능력으로 이번 턴에는 <b>{CHOICE_LABEL[myCountry.forcedChoice.choice]}</b>만
              선택할 수 있습니다. (남은 턴 {myCountry.forcedChoice.turnsRemaining})
            </p>
          )}

          <div className="space-y-3">
            {(Object.keys(CHOICE_GP_LABEL) as DevChoice[]).map((choice) => {
              const locked = !!myCountry.forcedChoice && myCountry.forcedChoice.choice !== choice;
              const selected = myChoice === choice;
              return (
                <button
                  key={choice}
                  disabled={locked || state.revealed}
                  onClick={() =>
                    dispatch({ type: "SET_DEV_CHOICE", countryId: myCountry.id, choice })
                  }
                  className={`min-h-[70px] w-full rounded-xl border-2 px-4 text-lg font-bold disabled:opacity-30 ${
                    selected
                      ? "border-emerald-400 bg-emerald-900/50"
                      : "border-slate-700 bg-slate-800"
                  }`}
                >
                  {CHOICE_GP_LABEL[choice]}
                  {selected && <span className="ml-2 text-emerald-300">✓</span>}
                </button>
              );
            })}
          </div>

          <p className="text-center text-sm text-slate-400">
            {state.revealed
              ? "공개되었습니다."
              : submitted
                ? "제출 완료. 공개 전까지 바꿀 수 있습니다."
                : "아직 제출하지 않았습니다."}
          </p>
          <p className="text-center text-sm text-slate-500">
            전체 제출 현황 {state.submittedCountryIds.length} / 6
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-lg font-bold">{PHASE_LABEL[phase]}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {phase === "nation_consult" && "조원끼리 이번 턴 전략을 상의하세요."}
            {phase === "representative_meeting" && "대표가 나와서 다른 나라와 협상하세요."}
            {phase === "quiz" && "선생님이 내는 문제를 다 함께 맞혀보세요."}
            {phase === "un_conference" && "UN 환경보전회의가 진행 중입니다."}
            {phase === "resource_distribution" && "최종 자원을 배분하고 있습니다."}
          </p>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-lg font-bold">특수 능력 · {myCountry.ability}</h2>
        {myCountry.abilityUsed ? (
          <p className="mt-2 text-sm text-slate-500">이미 사용했습니다.</p>
        ) : requested ? (
          <p className="mt-2 rounded-lg bg-sky-900/50 p-3 text-sm text-sky-200">
            선생님께 사용 요청을 보냈습니다. 승인을 기다리세요.
          </p>
        ) : (
          <>
            <button
              disabled={!availability.allowed}
              onClick={() => dispatch({ type: "REQUEST_ABILITY", countryId: myCountry.id })}
              className="mt-3 min-h-[70px] w-full rounded-xl bg-sky-700 text-lg font-bold disabled:opacity-30"
            >
              능력 사용 요청
            </button>
            {!availability.allowed && (
              <p className="mt-2 text-center text-sm text-amber-300">{availability.reason}</p>
            )}
          </>
        )}
      </section>

      {error && <p className="text-red-400">{error}</p>}
    </main>
  );
}

/** intervalMs가 null이 아니면 그 주기로 컴포넌트를 다시 그리게 한다. */
function useTick(intervalMs: number | null) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (intervalMs === null) return;
    const id = setInterval(() => setN((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function WaitingRoom({
  code,
  connected,
  expected,
}: {
  code: string;
  connected: number;
  expected: number;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 text-center">
      <div>
        <p className="text-lg text-slate-400">방 코드</p>
        <p className="text-5xl font-black tracking-[0.2em]">{code}</p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 px-8 py-10">
        <p className="text-2xl font-black">접속했습니다!</p>
        <p className="mt-3 text-lg text-slate-400">
          선생님이 시작할 때까지
          <br />
          잠시 기다려 주세요.
        </p>
      </div>

      <div>
        <p className="text-3xl font-black tabular-nums">
          {connected} / {expected}
        </p>
        <p className="mt-1 text-sm text-slate-500">조가 접속했습니다</p>
      </div>

      <div className="flex gap-2">
        {Array.from({ length: expected }, (_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full ${i < connected ? "bg-emerald-400" : "bg-slate-700"}`}
          />
        ))}
      </div>
    </main>
  );
}

function SelectCountdown({ msLeft }: { msLeft: number }) {
  const seconds = Math.ceil(msLeft / 1000);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="text-2xl font-bold text-slate-300">잠시 후 나라를 고릅니다</p>
      <div className="text-[40vh] font-black leading-none tabular-nums text-emerald-400">
        {seconds}
      </div>
      <p className="text-xl text-amber-300">먼저 고른 조가 가져갑니다. 준비하세요!</p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-xl font-bold text-slate-400">{children}</p>
    </main>
  );
}
