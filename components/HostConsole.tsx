"use client";

import { useEffect, useMemo, useState } from "react";
import quizData from "@/data/quiz.json";
import { useHostToken, useRoom } from "@/lib/useRoom";
import SafetyPanel from "@/components/SafetyPanel";
import { useCountdown, formatTime } from "@/lib/useCountdown";
import { CHOICE_GP_LABEL, CHOICE_LABEL, PHASE_LABEL, nameOf } from "@/lib/labels";
import { PublicRoomState } from "@/lib/publicState";
import { RoomAction } from "@/lib/roomReducer";
import {
  Country,
  CountryId,
  DevChoice,
  canUseAbilitiesThisTurn,
  computeFinalDistribution,
  getAbilityAvailability,
  getDenmarkForcedCountries,
  getEarthState,
  getJapanForcedCountries,
  getPhaseSequence,
  getUnEvaluation,
  toDisplayTemp,
} from "@/lib/rules";

interface QuizItem {
  turn: number;
  question: string;
  answer: boolean;
}
const QUIZ: QuizItem[] = quizData;

type Dispatch = (action: RoomAction) => void | Promise<void>;

export default function HostConsole({ code }: { code: string }) {
  const { hostToken, setHostToken, loaded: hostTokenLoaded } = useHostToken(code);
  const { state, error, notFound, canUndo, dispatch } = useRoom(code, undefined, hostToken);
  const remaining = useCountdown(state?.timer);

  // 공개 전에는 서버가 선택 내용을 잘라내므로(비밀 제출), 교사가 대신 입력한 값만
  // 이 화면에서 기억해 보여준다. 다른 조가 낸 값은 교사도 공개 시점에 함께 본다.
  const [enteredByHost, setEnteredByHost] = useState<Partial<Record<CountryId, DevChoice>>>({});
  useEffect(() => {
    if (state?.revealed === false) return;
    setEnteredByHost({});
  }, [state?.turn, state?.revealed]);

  const finalDistribution = useMemo(() => {
    if (!state) return null;
    const phase = getPhaseSequence(state.turn)[state.phaseIndex];
    if (phase !== "resource_distribution" && !state.gameOver) return null;
    return computeFinalDistribution(state.countries, state.temperatureDeci);
  }, [state]);

  if (notFound) return <Centered>방 코드 {code} 를 찾을 수 없습니다.</Centered>;
  if (!state) return <Centered>연결 중...</Centered>;

  const phase = getPhaseSequence(state.turn)[state.phaseIndex];
  const earthState = getEarthState(state.temperatureDeci);
  const quizItem = QUIZ.find((q) => q.turn === state.turn);
  const showFinal = state.gameOver || phase === "resource_distribution";

  function canGoNext(): boolean {
    if (!state || state.gameOver) return false;
    if (phase === "dev_select") return state.revealed;
    if (phase === "quiz") return state.quizJudged !== null;
    if (phase === "un_conference") return state.unApplied;
    if (phase === "resource_distribution") return false;
    return true;
  }

  const allSubmitted = state.countries.every(
    (c) => c.forcedChoice || state.submittedCountryIds.includes(c.id)
  );

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div>
          <h1 className="text-lg font-bold">교사 콘솔</h1>
          <p className="text-sm text-slate-400">
            {state.stage === "playing"
              ? `${state.turn}턴 / 8턴 · ${PHASE_LABEL[phase]}`
              : state.stage === "lobby"
                ? "입장 준비 — 태블릿 접속 대기 중"
                : "입장 준비 — 국가 선택 중"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            방 코드 <span className="text-base font-black tracking-widest text-slate-200">{code}</span>
            {" · "}
            <a className="underline hover:text-slate-300" href={`/board/${code}`} target="_blank">관전 화면</a>
            {" · "}
            <a className="underline hover:text-slate-300" href={`/play/${code}`} target="_blank">팀 화면</a>
          </p>
        </div>

        {/* 아직 시작 전이면 타이머는 의미가 없으므로 감춘다. */}
        {state.stage === "playing" && (
          <div className="text-center">
            <div className="text-4xl font-black tabular-nums">{formatTime(remaining)}</div>
            <div className="mt-1 flex gap-2">
              {state.timer.startedAt === null ? (
                <button onClick={() => dispatch({ type: "TIMER_RESUME" })} className="rounded bg-emerald-700 px-3 py-1 text-xs font-bold hover:bg-emerald-600">재개</button>
              ) : (
                <button onClick={() => dispatch({ type: "TIMER_PAUSE" })} className="rounded bg-amber-700 px-3 py-1 text-xs font-bold hover:bg-amber-600">일시정지</button>
              )}
              <button onClick={() => dispatch({ type: "TIMER_RESET" })} className="rounded bg-slate-700 px-3 py-1 text-xs font-bold hover:bg-slate-600">초기화</button>
            </div>
          </div>
        )}

        {state.stage === "playing" && (
          <div className="text-right">
            <div className="text-4xl font-black tabular-nums">
              {toDisplayTemp(state.temperatureDeci).toFixed(1)}°
            </div>
            <div className="text-sm text-slate-400">
              {earthState.name}
              {earthState.resource ? ` · ${earthState.resource}` : ""}
            </div>
          </div>
        )}
      </header>

      {error && <p className="rounded-lg bg-red-950 p-3 text-red-300">{error}</p>}

      {state.stage !== "playing" ? (
        <LobbyPanel state={state} dispatch={dispatch} code={code} />
      ) : showFinal ? (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-lg font-bold">
            {state.gameOver ? "게임 종료 — 지구의 멸망" : "최종 자원 배분"}
          </h2>
          <table className="w-full text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-800">
                <th className="py-1 text-left">국가</th>
                <th className="py-1 text-right">최종 GP</th>
                <th className="py-1 text-right">비율</th>
                <th className="py-1 text-right">과자 수</th>
              </tr>
            </thead>
            <tbody>
              {finalDistribution?.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/50">
                  <td className="py-1">{nameOf(state.countries, r.id)}</td>
                  <td className="py-1 text-right tabular-nums">{r.gp}</td>
                  <td className="py-1 text-right tabular-nums">{(r.ratio * 100).toFixed(1)}%</td>
                  <td className="py-1 text-right font-bold tabular-nums">{r.snacks}개</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {state.countries.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <div className="font-bold">{c.name}</div>
                <div className="text-2xl font-black tabular-nums">{c.gp}</div>
                <div className="text-xs text-slate-400">{c.ability}</div>
                <div className={`text-xs ${c.abilityUsed ? "text-slate-600" : "text-emerald-400"}`}>
                  {c.abilityUsed ? "능력 사용됨" : "능력 미사용"}
                </div>
                <div className={`text-xs ${state.claimedCountryIds.includes(c.id) ? "text-sky-400" : "text-slate-600"}`}>
                  {state.claimedCountryIds.includes(c.id) ? "태블릿 연결됨" : "미접속"}
                </div>
                {c.forcedChoice && (
                  <div className="mt-1 rounded bg-amber-900/50 px-1 py-0.5 text-xs text-amber-300">
                    강제: {CHOICE_LABEL[c.forcedChoice.choice]} ({c.forcedChoice.turnsRemaining}턴)
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-lg font-bold">{PHASE_LABEL[phase]}</h2>

            {(phase === "nation_consult" || phase === "representative_meeting") && (
              <p className="text-sm text-slate-400">
                타이머 진행 중 (교실에서 진행). 준비되면 다음으로 이동하세요.
              </p>
            )}

            {phase === "dev_select" && (
              <DevSelectPanel
                state={state}
                dispatch={dispatch}
                enteredByHost={enteredByHost}
                setEnteredByHost={setEnteredByHost}
                allSubmitted={allSubmitted}
              />
            )}

            {phase === "quiz" && quizItem && (
              <div className="space-y-3">
                <p className="text-lg">{quizItem.question}</p>
                {state.quizJudged === null ? (
                  <div className="flex gap-3">
                    <button onClick={() => dispatch({ type: "JUDGE_QUIZ", correct: true })} className="rounded-lg bg-emerald-700 px-6 py-3 text-lg font-bold hover:bg-emerald-600">O (학급 정답)</button>
                    <button onClick={() => dispatch({ type: "JUDGE_QUIZ", correct: false })} className="rounded-lg bg-red-700 px-6 py-3 text-lg font-bold hover:bg-red-600">X (학급 오답)</button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    판정 완료: {state.quizJudged ? "정답" : "오답"} (정답은 {quizItem.answer ? "O" : "X"})
                  </p>
                )}
              </div>
            )}

            {phase === "un_conference" && <UnPanel state={state} dispatch={dispatch} />}

            <div className="mt-4 flex gap-3">
              <button
                disabled={!canGoNext()}
                onClick={() => dispatch({ type: "GO_NEXT" })}
                className="rounded-lg bg-slate-100 px-4 py-2 font-bold text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음 →
              </button>
              <button
                onClick={() => {
                  if (confirm("정말 처음부터 다시 시작할까요? 모든 진행이 사라집니다.")) {
                    dispatch({ type: "RESET" });
                  }
                }}
                className="rounded-lg bg-red-900 px-3 py-2 text-sm font-medium hover:bg-red-800"
              >
                처음부터 다시
              </button>
            </div>
          </section>

          {/*
            능력은 페이즈가 아니라 턴 단위로 열린다 (SPEC.md 6절은 "7·8턴 불가"만 제한).
            1턴처럼 대표회의가 없는 턴에도 요청을 승인할 수 있어야 하므로 별도 영역으로 뺐다.
          */}
          <AbilityPanel state={state} dispatch={dispatch} />
        </>
      )}

      {hostTokenLoaded && (
        <SafetyPanel
          code={code}
          state={state}
          dispatch={dispatch}
          canUndo={canUndo}
          hostToken={hostToken}
          onHostTokenChange={setHostToken}
        />
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-400">진행 로그</h2>
        <ul className="max-h-56 space-y-1 overflow-y-auto text-xs text-slate-400">
          {state.log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------

/** 게임 시작 전 준비 단계. 태블릿 접속 현황을 보고 국가 선택을 열어준다. */
function LobbyPanel({
  state,
  dispatch,
  code,
}: {
  state: PublicRoomState;
  dispatch: Dispatch;
  code: string;
}) {
  const allConnected = state.connectedCount >= state.expectedTeams;
  const claimed = state.claimedCountryIds.length;

  return (
    <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div>
        <h2 className="text-lg font-bold">입장 준비</h2>
        <p className="mt-1 text-sm text-slate-400">
          학생들에게 방 코드 <b className="text-slate-200">{code}</b> 를 알려주세요.
          관전 화면에도 크게 떠 있습니다.
        </p>
      </div>

      <div className="rounded-lg bg-slate-800/60 p-4">
        <div className="flex items-center justify-between">
          <span className="font-bold">태블릿 접속</span>
          <span className="text-2xl font-black tabular-nums">
            {state.connectedCount} / {state.expectedTeams}
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          {Array.from({ length: state.expectedTeams }, (_, i) => (
            <div
              key={i}
              className={`h-3 flex-1 rounded-full ${
                i < state.connectedCount ? "bg-emerald-500" : "bg-slate-700"
              }`}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          {state.connectedCount > state.expectedTeams ? (
            <p className="text-xs text-amber-300">
              조 수보다 많은 기기가 접속했습니다. 선생님이 팀 화면을 열어봤거나 학생 휴대폰이
              섞였을 수 있습니다.
            </p>
          ) : (
            <span />
          )}
          <button
            onClick={() => dispatch({ type: "RESET_CONNECTIONS" })}
            className="shrink-0 rounded bg-slate-700 px-3 py-1 text-xs font-bold hover:bg-slate-600"
          >
            접속 현황 초기화
          </button>
        </div>
      </div>

      {state.stage === "lobby" ? (
        <div className="space-y-2">
          <button
            onClick={() => dispatch({ type: "START_COUNTRY_SELECT" })}
            className="min-h-[60px] w-full rounded-lg bg-sky-700 text-lg font-bold hover:bg-sky-600"
          >
            국가 선택 시작 (5초 후 열림)
          </button>
          {!allConnected && (
            <p className="text-center text-sm text-amber-300">
              아직 {state.expectedTeams - state.connectedCount}개 조가 접속하지 않았습니다.
              그래도 진행할 수 있습니다.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="rounded-lg bg-sky-950/60 p-3 text-sm text-sky-200">
            국가 선택이 열렸습니다. 선착순으로 진행됩니다.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {state.countries.map((c) => {
              const taken = state.claimedCountryIds.includes(c.id);
              return (
                <div
                  key={c.id}
                  className={`rounded border p-2 text-sm ${
                    taken ? "border-emerald-700 bg-emerald-950/40" : "border-slate-700"
                  }`}
                >
                  <div className="font-bold">{c.name}</div>
                  <div className={taken ? "text-emerald-400" : "text-slate-500"}>
                    {taken ? "선택됨" : "대기 중"}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-center text-sm text-slate-400">{claimed} / 6 국가 결정</p>
          <button
            onClick={() => dispatch({ type: "START_GAME" })}
            className="min-h-[60px] w-full rounded-lg bg-emerald-700 text-lg font-bold hover:bg-emerald-600"
          >
            바로 1턴 시작하기
          </button>
          <p className="text-center text-xs text-slate-500">
            6개국이 다 정해지면 자동으로 시작합니다. 태블릿이 모자랄 때만 이 버튼을 쓰세요.
          </p>
        </div>
      )}
    </section>
  );
}

function DevSelectPanel({
  state,
  dispatch,
  enteredByHost,
  setEnteredByHost,
  allSubmitted,
}: {
  state: PublicRoomState;
  dispatch: Dispatch;
  enteredByHost: Partial<Record<CountryId, DevChoice>>;
  setEnteredByHost: (fn: (prev: Partial<Record<CountryId, DevChoice>>) => Partial<Record<CountryId, DevChoice>>) => void;
  allSubmitted: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        조별 태블릿에서 비밀 제출합니다. 공개 전까지 내용은 교사 화면에도 표시되지 않습니다.
        미제출 조는 아래에서 대신 입력할 수 있습니다.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {state.countries.map((c) => {
          const submitted = state.submittedCountryIds.includes(c.id) || !!c.forcedChoice;
          const revealedChoice = state.revealed ? state.devChoices[c.id] : undefined;
          const hostChoice = enteredByHost[c.id];
          return (
            <div key={c.id} className="rounded border border-slate-800 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{c.name}</span>
                <span className={`text-xs ${submitted ? "text-emerald-400" : "text-slate-500"}`}>
                  {submitted ? "제출 완료" : "미제출"}
                </span>
              </div>

              {revealedChoice ? (
                <div className="rounded bg-slate-800 px-2 py-2 text-sm font-bold">
                  {CHOICE_LABEL[revealedChoice]}
                </div>
              ) : c.forcedChoice ? (
                <div className="rounded bg-amber-900/40 px-2 py-2 text-xs text-amber-200">
                  강제 선택 적용 중
                </div>
              ) : (
                <select
                  className="w-full rounded bg-slate-800 px-2 py-2 text-sm"
                  value={hostChoice ?? ""}
                  onChange={(e) => {
                    const choice = e.target.value as DevChoice;
                    setEnteredByHost((prev) => ({ ...prev, [c.id]: choice }));
                    dispatch({ type: "SET_DEV_CHOICE", countryId: c.id, choice });
                  }}
                >
                  <option value="" disabled>
                    {submitted ? "제출됨 (대신 입력하면 덮어씀)" : "대신 입력"}
                  </option>
                  {(Object.keys(CHOICE_GP_LABEL) as DevChoice[]).map((choice) => (
                    <option key={choice} value={choice}>{CHOICE_GP_LABEL[choice]}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <button
          disabled={state.revealed || !allSubmitted}
          onClick={() => dispatch({ type: "REVEAL" })}
          className="rounded-lg bg-sky-700 px-6 py-3 text-lg font-bold hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          공개
        </button>
        <span className="text-sm text-slate-400">
          {state.submittedCountryIds.length} / 6 제출 완료
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AbilityPanel({ state, dispatch }: { state: PublicRoomState; dispatch: Dispatch }) {
  const pending = state.abilityRequests.length;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 text-lg font-bold">
        특수 능력 요청/승인
        {pending > 0 && (
          <span className="ml-2 rounded-full bg-sky-600 px-2 py-0.5 text-sm">{pending}건 대기</span>
        )}
      </h2>

      {!canUseAbilitiesThisTurn(state.turn) ? (
        <p className="rounded bg-slate-800 p-3 text-sm text-slate-400">
          7·8턴에는 대표회의와 특수 능력 사용이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {state.countries.map((c) => {
            const avail = getAbilityAvailability(c, state.turn, state.temperatureDeci);
            const requested = state.abilityRequests.includes(c.id);
            return (
              <div
                key={c.id}
                className={`rounded border p-2 ${requested ? "border-sky-500 bg-sky-950/40" : "border-slate-800"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {c.name} — {c.ability}
                    {requested && <span className="ml-2 rounded bg-sky-600 px-2 py-0.5 text-xs">요청됨</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    {!avail.allowed && <span className="text-xs text-slate-500">{avail.reason}</span>}
                    {requested && (
                      <button
                        onClick={() => dispatch({ type: "DISMISS_ABILITY_REQUEST", countryId: c.id })}
                        className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
                      >
                        요청 취소
                      </button>
                    )}
                  </div>
                </div>
                {avail.allowed && (
                  <div className="mt-2">
                    <AbilityForm country={c} state={state} dispatch={dispatch} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AbilityForm({
  country,
  state,
  dispatch,
}: {
  country: Country;
  state: PublicRoomState;
  dispatch: Dispatch;
}) {
  switch (country.id) {
    case "kor": return <KoreaForm country={country} state={state} dispatch={dispatch} />;
    case "usa": return <UsaForm country={country} state={state} dispatch={dispatch} />;
    case "swe":
      return (
        <button onClick={() => dispatch({ type: "SWEDEN_ABILITY", countryId: country.id })} className="rounded bg-emerald-700 px-3 py-1 text-sm font-medium hover:bg-emerald-600">
          사용 승인 (공개 시 판정)
        </button>
      );
    case "jpn": return <JapanForm country={country} state={state} dispatch={dispatch} />;
    case "tuv": return <TuvaluForm country={country} state={state} dispatch={dispatch} />;
    case "dnk": return <DenmarkForm country={country} state={state} dispatch={dispatch} />;
  }
}

function KoreaForm({ country, state, dispatch }: { country: Country; state: PublicRoomState; dispatch: Dispatch }) {
  const others = state.countries;
  const [a, setA] = useState<CountryId>(others[0].id);
  const [b, setB] = useState<CountryId>(others[1].id);
  const [loser, setLoser] = useState<CountryId>(others[1].id);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select className="rounded bg-slate-800 px-2 py-1" value={a} onChange={(e) => setA(e.target.value as CountryId)}>
        {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <span>vs</span>
      <select className="rounded bg-slate-800 px-2 py-1" value={b} onChange={(e) => setB(e.target.value as CountryId)}>
        {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <span>패배:</span>
      <select className="rounded bg-slate-800 px-2 py-1" value={loser} onChange={(e) => setLoser(e.target.value as CountryId)}>
        {[a, b].map((id) => <option key={id} value={id}>{nameOf(others, id)}</option>)}
      </select>
      <button onClick={() => dispatch({ type: "KOREA_ABILITY", countryId: country.id, loserId: loser })} className="rounded bg-emerald-700 px-3 py-1 font-medium hover:bg-emerald-600">
        적용
      </button>
    </div>
  );
}

function UsaForm({ country, state, dispatch }: { country: Country; state: PublicRoomState; dispatch: Dispatch }) {
  if (state.turn === 4) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span>교사와 가위바위보 승리?</span>
        <button onClick={() => dispatch({ type: "USA_ABILITY", countryId: country.id, won: true })} className="rounded bg-emerald-700 px-3 py-1 font-medium hover:bg-emerald-600">승리 (-0.5)</button>
        <button onClick={() => dispatch({ type: "USA_ABILITY", countryId: country.id, won: false })} className="rounded bg-slate-700 px-3 py-1 font-medium hover:bg-slate-600">패배 (효과 없음)</button>
      </div>
    );
  }
  return (
    <button onClick={() => dispatch({ type: "USA_ABILITY", countryId: country.id })} className="rounded bg-emerald-700 px-3 py-1 text-sm font-medium hover:bg-emerald-600">
      사용 승인 (퀴즈 결과 대기)
    </button>
  );
}

function JapanForm({ country, state, dispatch }: { country: Country; state: PublicRoomState; dispatch: Dispatch }) {
  const forced = getJapanForcedCountries(state.previousTurnChoices);
  const names = forced.map((id) => nameOf(state.countries, id)).join(", ") || "없음 (직전 턴에 경제 우선 개발을 한 나라 없음)";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>강제 대상: {names}</span>
      <button onClick={() => dispatch({ type: "JAPAN_ABILITY", countryId: country.id })} className="rounded bg-emerald-700 px-3 py-1 font-medium hover:bg-emerald-600">
        적용
      </button>
    </div>
  );
}

function TuvaluForm({ country, state, dispatch }: { country: Country; state: PublicRoomState; dispatch: Dispatch }) {
  const others = state.countries.filter((c) => c.id !== "tuv");
  const [donor, setDonor] = useState<CountryId | "none">("none");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>기부국:</span>
      <select className="rounded bg-slate-800 px-2 py-1" value={donor} onChange={(e) => setDonor(e.target.value as CountryId | "none")}>
        <option value="none">없음 (전원 거부)</option>
        {others.map((c) => <option key={c.id} value={c.id}>{c.name} (GP {c.gp})</option>)}
      </select>
      <button
        onClick={() => dispatch({ type: "TUVALU_ABILITY", countryId: country.id, donorId: donor === "none" ? null : donor })}
        className="rounded bg-emerald-700 px-3 py-1 font-medium hover:bg-emerald-600"
      >
        적용
      </button>
    </div>
  );
}

function DenmarkForm({ country, state, dispatch }: { country: Country; state: PublicRoomState; dispatch: Dispatch }) {
  const names = getDenmarkForcedCountries(state.countries).map((id) => nameOf(state.countries, id)).join(", ");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>대상(GP 상위 3, 공동순위 포함): {names}</span>
      <button onClick={() => dispatch({ type: "DENMARK_ABILITY", countryId: country.id })} className="rounded bg-emerald-700 px-3 py-1 font-medium hover:bg-emerald-600">
        적용
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function UnPanel({ state, dispatch }: { state: PublicRoomState; dispatch: Dispatch }) {
  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead className="text-slate-400">
          <tr className="border-b border-slate-800">
            <th className="py-1 text-left">국가</th>
            <th className="py-1 text-right">누적 GP</th>
            <th className="py-1 text-left">평가</th>
            <th className="py-1 text-left">대상국(지속가능만)</th>
          </tr>
        </thead>
        <tbody>
          {state.countries.map((c) => {
            const evaluation = getUnEvaluation(c.gp);
            const label =
              evaluation === "sustainable" ? "지속가능 개발" : evaluation === "green" ? "녹색개발" : "환경파괴";
            return (
              <tr key={c.id} className="border-b border-slate-800/50">
                <td className="py-1">{c.name}</td>
                <td className="py-1 text-right tabular-nums">{c.gp}</td>
                <td className="py-1">{label}</td>
                <td className="py-1">
                  {evaluation === "sustainable" && !state.unApplied ? (
                    <select
                      className="rounded bg-slate-800 px-2 py-1"
                      value={state.unTargets[c.id] ?? ""}
                      onChange={(e) => dispatch({ type: "SET_UN_TARGET", countryId: c.id, targetId: e.target.value as CountryId })}
                    >
                      <option value="" disabled>선택</option>
                      {state.countries.filter((o) => o.id !== c.id).map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  ) : evaluation === "sustainable" ? (
                    nameOf(state.countries, state.unTargets[c.id])
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        disabled={state.unApplied || state.countries.some((c) => getUnEvaluation(c.gp) === "sustainable" && !state.unTargets[c.id])}
        onClick={() => dispatch({ type: "APPLY_UN" })}
        className="rounded-lg bg-sky-700 px-4 py-2 font-bold hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        확정
      </button>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-xl font-bold text-slate-400">{children}</p>
    </main>
  );
}
