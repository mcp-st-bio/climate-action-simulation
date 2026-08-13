/**
 * 방(room) 상태 타입과 초기값. lib/rules.ts의 순수 함수 위에 얹는 "게임 진행" 상태로,
 * 서버(Route Handler)에서만 변경되고 Supabase의 rooms.state JSONB 컬럼에 통째로 저장된다.
 */
import {
  Country,
  CountryId,
  DevChoice,
  createInitialCountries,
  getPhaseSequence,
  INITIAL_TEMPERATURE_DECI,
  PHASE_DURATION_SEC,
} from "@/lib/rules";

/**
 * 타이머. 서버 시각(epoch ms)만 저장하고 남은 시간은 각 클라이언트가 계산한다.
 * 이렇게 해야 교사·관전·팀 화면이 같은 값을 보게 된다.
 */
export interface TimerState {
  durationSec: number;
  /** 진행 중이면 시작(또는 재개) 시각, 일시정지 상태면 null */
  startedAt: number | null;
  /** 일시정지 상태에서의 잔여 초. 진행 중이면 null */
  pausedRemainingSec: number | null;
}

/**
 * 게임 시작 전 준비 단계.
 * lobby         — 태블릿이 방 코드로 접속해 대기. 관전 화면은 방 코드를 크게 띄운다.
 * country_select— 교사가 시작을 누른 뒤. countrySelectOpensAt 이후부터 선착순 선점 가능.
 * playing       — 6개국이 모두 정해져 실제 턴이 진행되는 상태.
 */
export type RoomStage = "lobby" | "country_select" | "playing";

/** 국가 선택이 열리기까지의 카운트다운 길이 (SPEC 외 요구사항: 선착순이라 5초를 준다). */
export const COUNTRY_SELECT_COUNTDOWN_MS = 5000;

export interface TeamApplication {
  teamToken: string;
  nickname: string;
  requestedAt: number;
}

export interface ApprovedTeam {
  teamToken: string;
  nickname: string;
  seatNumber: number;
}

export interface RoomState {
  stage: RoomStage;
  /** 로비에서 접속한 태블릿의 팀 토큰. 절대 밖으로 내보내지 않고 인원수만 공개한다. */
  connectedTeams: string[];
  teamApplications: TeamApplication[];
  approvedTeams: ApprovedTeam[];
  /** 이 시각(epoch ms)이 지나야 국가 선점이 허용된다. 서버가 최종 판정한다. */
  countrySelectOpensAt: number | null;
  turn: number;
  phaseIndex: number;
  countries: Country[];
  temperatureDeci: number;
  gameOver: boolean;
  tempHistory: number[];
  devChoices: Partial<Record<CountryId, DevChoice>>;
  previousTurnChoices: Partial<Record<CountryId, DevChoice>>;
  revealed: boolean;
  /** 교사가 선택한 학급 답변. 정답과 비교하기 전의 원본 답변이다. */
  quizAnswer: boolean | null;
  quizJudged: boolean | null;
  pendingUsa: boolean;
  pendingSweden: boolean;
  unTargets: Partial<Record<CountryId, CountryId>>;
  unApplied: boolean;
  log: string[];
  /** 국가 선점: countryId -> 팀 토큰. 같은 토큰이면 재접속으로 보고 같은 국가를 돌려준다. */
  claims: Partial<Record<CountryId, string>>;
  /** 팀이 올린 능력 사용 요청. 교사가 승인(=능력 실행)하면 제거된다. */
  abilityRequests: CountryId[];
  timer: TimerState;
}

export function createTimerForPhase(turn: number, phaseIndex: number): TimerState {
  const phase = getPhaseSequence(turn)[phaseIndex];
  return {
    durationSec: PHASE_DURATION_SEC[phase],
    startedAt: Date.now(),
    pausedRemainingSec: null,
  };
}

export function createInitialRoomState(): RoomState {
  return {
    stage: "lobby",
    connectedTeams: [],
    teamApplications: [],
    approvedTeams: [],
    countrySelectOpensAt: null,
    turn: 1,
    phaseIndex: 0,
    countries: createInitialCountries(),
    temperatureDeci: INITIAL_TEMPERATURE_DECI,
    gameOver: false,
    tempHistory: [INITIAL_TEMPERATURE_DECI],
    devChoices: {},
    previousTurnChoices: {},
    revealed: false,
    quizAnswer: null,
    quizJudged: null,
    pendingUsa: false,
    pendingSweden: false,
    unTargets: {},
    unApplied: false,
    log: ["방이 열렸습니다. 태블릿 접속을 기다리는 중입니다."],
    claims: {},
    abilityRequests: [],
    timer: createTimerForPhase(1, 0),
  };
}

/** 남은 시간(초). 서버 상태만으로 각 클라이언트가 동일하게 계산한다. */
export function timerRemainingSec(timer: TimerState, now: number = Date.now()): number {
  if (timer.startedAt === null) {
    return timer.pausedRemainingSec ?? timer.durationSec;
  }
  const elapsed = (now - timer.startedAt) / 1000;
  return Math.max(0, timer.durationSec - elapsed);
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0/O, 1/I 등 헷갈리는 문자 제외

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}
