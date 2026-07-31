/**
 * 방 상태에 대한 유일한 변경 지점. 서버(Route Handler)에서만 호출된다.
 * 클라이언트는 액션을 보낼 뿐 GP/기온을 스스로 계산하지 않는다 (SPEC.md 10절).
 */
import {
  Country,
  CountryId,
  DevChoice,
  applyForcedChoice,
  applyKoreaAbility,
  applySwedenAbility,
  applyTuvaluAbility,
  applyUnConference,
  applyUsaAbility,
  commitAbilityUse,
  decrementForcedChoices,
  getAbilityAvailability,
  getDevGp,
  getEarthState,
  getJapanForcedCountries,
  getDenmarkForcedCountries,
  getPhaseSequence,
  getQuizTempDelta,
  getTempDeltaFromGpSum,
  isGameOver,
  toDisplayTemp,
} from "@/lib/rules";
import {
  COUNTRY_SELECT_COUNTDOWN_MS,
  RoomState,
  createInitialRoomState,
  createTimerForPhase,
  timerRemainingSec,
} from "@/lib/roomState";
import { PHASE_LABEL } from "@/lib/labels";

export type RoomAction =
  | { type: "JOIN_ROOM"; teamToken: string }
  | { type: "RESET_CONNECTIONS" }
  | { type: "START_COUNTRY_SELECT" }
  | { type: "START_GAME" }
  | { type: "CLAIM_COUNTRY"; countryId: CountryId; teamToken: string }
  | { type: "SET_DEV_CHOICE"; countryId: CountryId; choice: DevChoice }
  | { type: "REVEAL" }
  | { type: "JUDGE_QUIZ"; correct: boolean }
  | { type: "REQUEST_ABILITY"; countryId: CountryId }
  | { type: "DISMISS_ABILITY_REQUEST"; countryId: CountryId }
  | { type: "KOREA_ABILITY"; countryId: CountryId; loserId: CountryId }
  | { type: "USA_ABILITY"; countryId: CountryId; won?: boolean } // won only used on turn 4
  | { type: "SWEDEN_ABILITY"; countryId: CountryId }
  | { type: "JAPAN_ABILITY"; countryId: CountryId }
  | { type: "TUVALU_ABILITY"; countryId: CountryId; donorId: CountryId | null }
  | { type: "DENMARK_ABILITY"; countryId: CountryId }
  | { type: "SET_UN_TARGET"; countryId: CountryId; targetId: CountryId }
  | { type: "APPLY_UN" }
  | { type: "GO_NEXT" }
  | { type: "TIMER_PAUSE" }
  | { type: "TIMER_RESUME" }
  | { type: "TIMER_RESET" }
  | { type: "RESET" }
  // --- 교사용 안전장치 (SPEC.md 9절). 교사 기기 토큰이 있어야 실행된다. ---
  | { type: "SET_GP"; countryId: CountryId; gp: number }
  | { type: "SET_TEMPERATURE"; tempDeci: number }
  | { type: "JUMP_PHASE"; turn: number; phaseIndex: number }
  | { type: "IMPORT_STATE"; state: RoomState }
  | { type: "UNDO" }; // 라우트에서 DB 스냅샷으로 처리한다

/** 교사 기기 토큰이 있어야 실행되는 액션. 판을 바꾸거나 비밀 제출을 열람하는 조작들. */
export const HOST_ONLY_ACTIONS: ReadonlySet<RoomAction["type"]> = new Set([
  "SET_GP",
  "SET_TEMPERATURE",
  "JUMP_PHASE",
  "IMPORT_STATE",
  "UNDO",
  "RESET",
  "START_COUNTRY_SELECT",
  "START_GAME",
  "RESET_CONNECTIONS",
]);

/** 되돌리기 스냅샷을 남길 액션. 태블릿에서 쏟아지는 잡음(선점·제출·요청)은 제외한다. */
export const UNDOABLE_ACTIONS: ReadonlySet<RoomAction["type"]> = new Set([
  "REVEAL",
  "JUDGE_QUIZ",
  "KOREA_ABILITY",
  "USA_ABILITY",
  "SWEDEN_ABILITY",
  "JAPAN_ABILITY",
  "TUVALU_ABILITY",
  "DENMARK_ABILITY",
  "APPLY_UN",
  "GO_NEXT",
  "SET_GP",
  "SET_TEMPERATURE",
  "JUMP_PHASE",
  "IMPORT_STATE",
  "RESET",
  "START_COUNTRY_SELECT",
  "START_GAME",
]);

/** 실제 턴이 돌아가는 중(stage === "playing")에만 의미가 있는 액션. */
const PLAYING_ONLY_ACTIONS: ReadonlySet<RoomAction["type"]> = new Set([
  "SET_DEV_CHOICE",
  "REVEAL",
  "JUDGE_QUIZ",
  "REQUEST_ABILITY",
  "KOREA_ABILITY",
  "USA_ABILITY",
  "SWEDEN_ABILITY",
  "JAPAN_ABILITY",
  "TUVALU_ABILITY",
  "DENMARK_ABILITY",
  "APPLY_UN",
  "GO_NEXT",
]);

/** 게임 종료 후에도 허용되는 액션. 실수로 멸망시킨 판을 되살릴 수 있어야 한다. */
const ALLOWED_WHEN_GAME_OVER: ReadonlySet<RoomAction["type"]> = new Set([
  "RESET",
  "SET_GP",
  "SET_TEMPERATURE",
  "JUMP_PHASE",
  "IMPORT_STATE",
  "UNDO",
]);

function nameOf(countries: Country[], id: CountryId | null | undefined): string {
  if (!id) return "-";
  return countries.find((c) => c.id === id)?.name ?? id;
}

function pushLog(state: RoomState, msg: string): RoomState {
  return { ...state, log: [msg, ...state.log].slice(0, 40) };
}

function changeTemperature(state: RoomState, deltaDeci: number, reason: string): RoomState {
  const newTemp = state.temperatureDeci + deltaDeci;
  const before = getEarthState(state.temperatureDeci);
  const after = getEarthState(newTemp);
  const log = [
    `${reason}: ${deltaDeci > 0 ? "+" : ""}${(deltaDeci / 10).toFixed(1)}도 (${toDisplayTemp(state.temperatureDeci)} -> ${toDisplayTemp(newTemp)})`,
    ...state.log,
  ];
  if (before.name !== after.name) {
    log.unshift(`⚠ 지구 상태 변화: ${before.name} -> ${after.name}`);
  }
  const over = isGameOver(newTemp);
  if (over) log.unshift("☠ 기온 20.0도 도달 - 지구의 멸망. 게임 즉시 종료.");
  return {
    ...state,
    temperatureDeci: newTemp,
    tempHistory: [...state.tempHistory, newTemp],
    gameOver: over,
    log: log.slice(0, 40),
  };
}

function effectiveChoice(
  state: { devChoices: Partial<Record<CountryId, DevChoice>> },
  country: Country
): DevChoice | undefined {
  if (country.forcedChoice) return country.forcedChoice.choice;
  return state.devChoices[country.id];
}

function commit(state: RoomState, countryId: CountryId): RoomState {
  return {
    ...state,
    countries: state.countries.map((c) => (c.id === countryId ? commitAbilityUse(c) : c)),
  };
}

/** 능력이 실제로 실행되면 해당 국가의 대기 중인 요청을 지운다. */
function clearRequest(state: RoomState, countryId: CountryId): RoomState {
  return { ...state, abilityRequests: state.abilityRequests.filter((id) => id !== countryId) };
}

export function applyRoomAction(state: RoomState, action: RoomAction): RoomState {
  if (state.gameOver && !ALLOWED_WHEN_GAME_OVER.has(action.type)) return state;
  // 로비/국가 선택 중에는 턴 진행 액션이 들어와도 무시한다.
  if (state.stage !== "playing" && PLAYING_ONLY_ACTIONS.has(action.type)) return state;

  switch (action.type) {
    case "RESET":
      return createInitialRoomState();

    // --- 교사용 안전장치 (SPEC.md 9절) ---

    case "SET_GP": {
      const country = state.countries.find((c) => c.id === action.countryId);
      if (!country || !Number.isFinite(action.gp)) return state;
      const gp = Math.round(action.gp);
      return pushLog(
        {
          ...state,
          countries: state.countries.map((c) => (c.id === action.countryId ? { ...c, gp } : c)),
        },
        `[수동 보정] ${country.name} GP ${country.gp} → ${gp}`
      );
    }

    case "SET_TEMPERATURE": {
      if (!Number.isFinite(action.tempDeci)) return state;
      const tempDeci = Math.round(action.tempDeci);
      const before = getEarthState(state.temperatureDeci);
      const after = getEarthState(tempDeci);
      const log = [
        `[수동 보정] 기온 ${toDisplayTemp(state.temperatureDeci)} → ${toDisplayTemp(tempDeci)}`,
        ...state.log,
      ];
      if (before.name !== after.name) log.unshift(`⚠ 지구 상태 변화: ${before.name} → ${after.name}`);
      return {
        ...state,
        temperatureDeci: tempDeci,
        tempHistory: [...state.tempHistory, tempDeci],
        gameOver: isGameOver(tempDeci),
        log: log.slice(0, 40),
      };
    }

    case "JUMP_PHASE": {
      const turn = Math.min(8, Math.max(1, Math.round(action.turn)));
      const seq = getPhaseSequence(turn);
      const phaseIndex = Math.min(seq.length - 1, Math.max(0, Math.round(action.phaseIndex)));
      return pushLog(
        { ...state, turn, phaseIndex, timer: createTimerForPhase(turn, phaseIndex) },
        `[강제 이동] ${turn}턴 · ${PHASE_LABEL[seq[phaseIndex]]}`
      );
    }

    case "IMPORT_STATE": {
      const imported = action.state;
      if (!imported || !Array.isArray(imported.countries) || imported.countries.length !== 6) {
        return state;
      }
      return pushLog(imported, "[복원] 저장된 상태를 불러왔습니다.");
    }

    case "UNDO":
      // 라우트가 DB 스냅샷으로 처리한다. 여기까지 오면 스냅샷이 없다는 뜻.
      return state;

    case "JOIN_ROOM": {
      // 태블릿이 방 코드로 들어와 로비에 등록한다. 새로고침해도 중복 집계되지 않는다.
      if (state.connectedTeams.includes(action.teamToken)) return state;
      const connectedTeams = [...state.connectedTeams, action.teamToken];
      return pushLog(
        { ...state, connectedTeams },
        `태블릿 접속 ${connectedTeams.length}/${state.countries.length}`
      );
    }

    case "RESET_CONNECTIONS":
      // 교사가 확인차 팀 화면을 열었거나 학생 휴대폰이 섞여 들어와 숫자가 부풀었을 때 쓴다.
      // 각 태블릿은 화면이 살아 있으면 스스로 다시 등록하므로 곧 정확한 수로 회복된다.
      return pushLog({ ...state, connectedTeams: [] }, "접속 현황을 초기화했습니다.");

    case "START_COUNTRY_SELECT": {
      if (state.stage !== "lobby") return state;
      return pushLog(
        {
          ...state,
          stage: "country_select",
          countrySelectOpensAt: Date.now() + COUNTRY_SELECT_COUNTDOWN_MS,
        },
        "국가 선택을 시작합니다. 5초 후 선착순으로 열립니다."
      );
    }

    case "START_GAME": {
      if (state.stage === "playing") return state;
      return pushLog(
        { ...state, stage: "playing", timer: createTimerForPhase(state.turn, state.phaseIndex) },
        "--- 1턴 시작 ---"
      );
    }

    case "CLAIM_COUNTRY": {
      // 아직 선택이 열리지 않았으면 거부한다. 태블릿 시계가 빨라도 서버가 최종 판정한다.
      if (state.stage === "lobby") return state;
      if (state.countrySelectOpensAt !== null && Date.now() < state.countrySelectOpensAt) {
        return state;
      }

      const owner = state.claims[action.countryId];
      // 이미 다른 팀이 선점한 국가는 넘겨주지 않는다 (중복 불가).
      if (owner && owner !== action.teamToken) return state;

      // 같은 토큰이 다른 국가를 잡고 있었다면 놓아준다 (한 팀 = 한 국가).
      const claims = { ...state.claims };
      for (const id of Object.keys(claims) as CountryId[]) {
        if (claims[id] === action.teamToken) delete claims[id];
      }
      claims[action.countryId] = action.teamToken;

      // 6개국이 모두 정해지면 곧바로 1턴을 시작한다. 교사가 버튼을 한 번 더 누를 필요는 없다.
      const allClaimed = state.countries.every((c) => claims[c.id]);
      if (allClaimed && state.stage !== "playing") {
        return pushLog(
          {
            ...state,
            claims,
            stage: "playing",
            timer: createTimerForPhase(state.turn, state.phaseIndex),
          },
          "6개국이 모두 정해졌습니다. --- 1턴 시작 ---"
        );
      }
      return { ...state, claims };
    }

    case "SET_DEV_CHOICE": {
      const country = state.countries.find((c) => c.id === action.countryId);
      // 강제 선택(교토·코펜하겐) 중이거나 이미 공개된 뒤에는 바꿀 수 없다.
      if (!country || country.forcedChoice || state.revealed) return state;
      return {
        ...state,
        devChoices: { ...state.devChoices, [action.countryId]: action.choice },
      };
    }

    case "REQUEST_ABILITY": {
      const country = state.countries.find((c) => c.id === action.countryId);
      if (!country) return state;
      const avail = getAbilityAvailability(country, state.turn, state.temperatureDeci);
      if (!avail.allowed) return state;
      if (state.abilityRequests.includes(action.countryId)) return state;
      return pushLog(
        { ...state, abilityRequests: [...state.abilityRequests, action.countryId] },
        `${country.name}이(가) 능력(${country.ability}) 사용을 요청했습니다.`
      );
    }

    case "DISMISS_ABILITY_REQUEST":
      return clearRequest(state, action.countryId);

    case "REVEAL": {
      const choices: Partial<Record<CountryId, DevChoice>> = {};
      for (const c of state.countries) {
        const ch = c.forcedChoice ? c.forcedChoice.choice : state.devChoices[c.id];
        if (ch) choices[c.id] = ch;
      }
      if (Object.keys(choices).length < 6 || state.revealed) return state;

      const gpSum = state.countries.reduce((sum, c) => sum + getDevGp(choices[c.id]!), 0);
      const countriesAfterGp = state.countries.map((c) => ({
        ...c,
        gp: c.gp + getDevGp(choices[c.id]!),
      }));

      let tempDelta = getTempDeltaFromGpSum(gpSum);
      let log = [
        `개발선택 공개: GP 합계 ${gpSum} -> 기온 ${tempDelta > 0 ? "+" : ""}${(tempDelta / 10).toFixed(1)}도`,
        ...state.log,
      ];

      if (state.pendingSweden) {
        const allEnv = state.countries.every((c) => choices[c.id] === "environment");
        const { tempDelta: swedenDelta } = applySwedenAbility(allEnv);
        tempDelta += swedenDelta;
        const note = allEnv
          ? " + 스웨덴 능력 -0.4 (전원 환경 우선 개발)"
          : " (스웨덴 능력 조건 미충족: 전원 환경 우선 아님)";
        log = [`인간환경선언 판정${note}`, ...log];
      }

      const decremented = decrementForcedChoices(countriesAfterGp);

      const base: RoomState = {
        ...state,
        countries: decremented,
        devChoices: choices,
        previousTurnChoices: choices,
        revealed: true,
        pendingSweden: false,
        log,
      };
      return changeTemperature(base, tempDelta, "개발선택+능력 반영 기온 변화");
    }

    case "JUDGE_QUIZ": {
      if (state.quizJudged !== null) return state;
      const { correct } = action;
      let tempDelta = getQuizTempDelta(correct);
      let log = [`퀴즈 판정: ${correct ? "정답 (기온 유지)" : "오답 (+0.1)"}`, ...state.log];
      if (state.pendingUsa) {
        const { tempDelta: usaDelta } = applyUsaAbility(correct);
        tempDelta += usaDelta;
        log = [`CCS기술 판정: ${correct ? "-0.5 적용" : "효과 없음 (오답)"}`, ...log];
      }
      const base: RoomState = { ...state, quizJudged: correct, pendingUsa: false, log };
      return changeTemperature(base, tempDelta, "퀴즈 반영 기온 변화");
    }

    case "KOREA_ABILITY": {
      const committed = commit(state, action.countryId).countries;
      const { countries, tempDelta } = applyKoreaAbility(committed, action.loserId);
      const country = state.countries.find((c) => c.id === action.countryId)!;
      return changeTemperature(
        clearRequest({ ...state, countries }, action.countryId),
        tempDelta,
        `${country.name} 능력: ${nameOf(state.countries, action.loserId)} 패배`
      );
    }

    case "USA_ABILITY": {
      const country = state.countries.find((c) => c.id === action.countryId)!;
      const committedState = clearRequest(commit(state, action.countryId), action.countryId);
      if (state.turn === 4) {
        const won = !!action.won;
        const { tempDelta } = applyUsaAbility(won);
        if (!won) {
          return pushLog(committedState, `${country.name} 능력 사용 승인 (가위바위보 패배, 효과 없음)`);
        }
        return changeTemperature(committedState, tempDelta, `${country.name} 능력: 가위바위보 승리`);
      }
      return pushLog(
        { ...committedState, pendingUsa: true },
        `${country.name} 능력 사용 승인: 이번 턴 퀴즈 정답 시 기온 -0.5 (퀴즈 판정 시 적용)`
      );
    }

    case "SWEDEN_ABILITY": {
      const country = state.countries.find((c) => c.id === action.countryId)!;
      const committedState = clearRequest(commit(state, action.countryId), action.countryId);
      return pushLog(
        { ...committedState, pendingSweden: true },
        `${country.name} 능력 사용 승인: 전원 환경 우선 개발 시 기온 추가 -0.4 (공개 시 판정)`
      );
    }

    case "JAPAN_ABILITY": {
      const country = state.countries.find((c) => c.id === action.countryId)!;
      const committed = commit(state, action.countryId).countries;
      const targets = getJapanForcedCountries(state.previousTurnChoices);
      const locked = applyForcedChoice(committed, targets, "environment", 1);
      const names = targets.map((id) => nameOf(state.countries, id)).join(", ") || "대상 없음";
      return pushLog(
        clearRequest({ ...state, countries: locked }, action.countryId),
        `${country.name} 능력 사용 승인: ${names} 환경 우선 개발 강제`
      );
    }

    case "TUVALU_ABILITY": {
      const country = state.countries.find((c) => c.id === action.countryId)!;
      const committed = commit(state, action.countryId).countries;
      const { countries, tempDelta } = applyTuvaluAbility(committed, action.donorId);
      const reason = action.donorId
        ? `${country.name} 능력: ${nameOf(state.countries, action.donorId)} GP10 기부`
        : `${country.name} 능력: 기부자 없음, 무산`;
      return changeTemperature(
        clearRequest({ ...state, countries }, action.countryId),
        tempDelta,
        reason
      );
    }

    case "DENMARK_ABILITY": {
      const country = state.countries.find((c) => c.id === action.countryId)!;
      const committed = commit(state, action.countryId).countries;
      const targets = getDenmarkForcedCountries(state.countries);
      const locked = applyForcedChoice(committed, targets, "environment", 2);
      const names = targets.map((id) => nameOf(state.countries, id)).join(", ");
      return pushLog(
        clearRequest({ ...state, countries: locked }, action.countryId),
        `${country.name} 능력 사용 승인: ${names} 2턴간 환경 우선 개발 강제`
      );
    }

    case "SET_UN_TARGET":
      return { ...state, unTargets: { ...state.unTargets, [action.countryId]: action.targetId } };

    case "APPLY_UN": {
      if (state.unApplied) return state;
      const countries = applyUnConference(state.countries, state.unTargets);
      return pushLog({ ...state, countries, unApplied: true }, "UN 환경보전회의 결과 적용 완료");
    }

    case "GO_NEXT": {
      const seq = getPhaseSequence(state.turn);
      if (state.phaseIndex < seq.length - 1) {
        const phaseIndex = state.phaseIndex + 1;
        return { ...state, phaseIndex, timer: createTimerForPhase(state.turn, phaseIndex) };
      }
      if (state.turn >= 8) return state;
      const turn = state.turn + 1;
      return {
        ...state,
        turn,
        phaseIndex: 0,
        devChoices: {},
        revealed: false,
        quizJudged: null,
        pendingUsa: false,
        pendingSweden: false,
        unTargets: {},
        unApplied: false,
        abilityRequests: [],
        timer: createTimerForPhase(turn, 0),
        log: [`--- ${turn}턴 시작 ---`, ...state.log],
      };
    }

    case "TIMER_PAUSE": {
      if (state.timer.startedAt === null) return state;
      return {
        ...state,
        timer: {
          ...state.timer,
          startedAt: null,
          pausedRemainingSec: timerRemainingSec(state.timer),
        },
      };
    }

    case "TIMER_RESUME": {
      if (state.timer.startedAt !== null) return state;
      const remaining = state.timer.pausedRemainingSec ?? state.timer.durationSec;
      return {
        ...state,
        // 남은 시간만큼만 다시 흐르게 하려고 durationSec을 잔여 시간으로 바꾼다.
        timer: { durationSec: remaining, startedAt: Date.now(), pausedRemainingSec: null },
      };
    }

    case "TIMER_RESET":
      return { ...state, timer: createTimerForPhase(state.turn, state.phaseIndex) };

    default:
      return state;
  }
}

export { effectiveChoice };
