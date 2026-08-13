/**
 * 클라이언트로 내보내기 전 상태를 검열한다.
 *
 * SPEC.md 4.1의 "비밀 제출"은 서버에서 잘라내야만 성립한다. 화면에서 숨기는 것만으로는
 * 태블릿에서 개발자 도구로 응답을 열어보면 그대로 뚫린다. 로그인이 없어 방 코드만 알면
 * 누구나 /host 에도 들어올 수 있으므로, 교사 화면에도 똑같이 검열된 상태를 내려보낸다.
 * 교사는 "누가 제출했는지"만 알면 되고(미제출 조 대신 입력), 내용은 공개 시점에 함께 본다.
 */
import { CountryId, DevChoice, getPhaseSequence } from "@/lib/rules";
import { getQuizForTurn, QuizSource } from "@/lib/quiz";
import { RoomState } from "@/lib/roomState";

export interface PublicQuizState {
  question: string;
  classAnswer: boolean | null;
  correctAnswer: boolean | null;
  isCorrect: boolean | null;
  explanation: string | null;
  sources: QuizSource[] | null;
}

export interface PublicTeamApplication {
  teamToken: string;
  nickname: string;
  requestedAt: number;
}

export interface PublicApprovedTeam {
  teamToken: string;
  nickname: string;
  seatNumber: number;
}

export interface PublicRoomState
  extends Omit<RoomState, "devChoices" | "claims" | "connectedTeams" | "teamApplications" | "approvedTeams" | "quizAnswer"> {
  /** 공개 전에는 비어 있고(본인 국가 제외), 공개 후에는 6개국 전부 담긴다. */
  devChoices: Partial<Record<CountryId, DevChoice>>;
  /** 내용은 감추고 "누가 냈는지"만 노출한다 ("3/6 제출 완료" 표시용). */
  submittedCountryIds: CountryId[];
  /** 토큰은 절대 내보내지 않는다. 어떤 국가가 선점됐는지만 알린다. */
  claimedCountryIds: CountryId[];
  /** 요청한 본인에게만 자기 토큰이 맞는지 알려주기 위한 필드. */
  myCountryId: CountryId | null;
  /** 로비에 접속한 태블릿 수. 토큰 목록은 내보내지 않는다. */
  connectedCount: number;
  /** 기대하는 태블릿 수 (= 국가 수). */
  expectedTeams: number;
  /** 이 조회를 보낸 태블릿이 로비에 등록되어 있는지. */
  meConnected: boolean;
  /** 교사에게만 제공하는 승인 대기 목록. */
  teamApprovalRequests: PublicTeamApplication[];
  /** 교사에게만 제공하는 승인 좌석 목록. */
  approvedTeamSeats: PublicApprovedTeam[];
  /** 학생 본인의 승인 상태. */
  myTeamApproval: { status: "pending" | "approved" | "none"; nickname: string | null; seatNumber: number | null };
  /** 정답과 해설은 교사가 답을 제출한 뒤에만 공개한다. */
  quiz: PublicQuizState | null;
}

export function toPublicState(
  state: RoomState,
  viewer?: { countryId?: CountryId; teamToken?: string; isHost?: boolean }
): PublicRoomState {
  const submittedCountryIds = (Object.keys(state.devChoices) as CountryId[]).filter(
    (id) => state.devChoices[id] !== undefined
  );

  let devChoices: Partial<Record<CountryId, DevChoice>> = {};
  if (state.revealed) {
    devChoices = { ...state.devChoices };
  } else if (viewer?.countryId && state.devChoices[viewer.countryId] !== undefined) {
    // 본인이 낸 선택만 되돌려준다 (새로고침 후에도 자기 선택이 보이도록).
    devChoices = { [viewer.countryId]: state.devChoices[viewer.countryId] };
  }

  // 토큰이 실제로 그 국가를 선점했는지 서버가 확인해준다.
  let myCountryId: CountryId | null = null;
  if (viewer?.teamToken) {
    const owned = (Object.keys(state.claims) as CountryId[]).find(
      (id) => state.claims[id] === viewer.teamToken
    );
    myCountryId = owned ?? null;
  }

  const {
    claims: _claims,
    devChoices: _raw,
    connectedTeams,
    teamApplications: _teamApplications,
    approvedTeams: _approvedTeams,
    quizAnswer: _quizAnswer,
    ...rest
  } = state;

  const phase = getPhaseSequence(state.turn)[state.phaseIndex];
  const quizItem = phase === "quiz" ? getQuizForTurn(state.turn) : undefined;
  const answered = state.quizJudged !== null;
  const quiz: PublicQuizState | null = quizItem
    ? {
        question: quizItem.question,
        classAnswer: answered ? (state.quizAnswer ?? null) : null,
        correctAnswer: answered ? quizItem.answer : null,
        isCorrect: answered ? state.quizJudged : null,
        explanation: answered ? quizItem.explanation : null,
        sources: answered ? quizItem.sources : null,
      }
    : null;
  const applications = state.teamApplications ?? [];
  const approvedTeams = state.approvedTeams ?? [];
  const pendingMine = viewer?.teamToken
    ? applications.find((team) => team.teamToken === viewer.teamToken)
    : undefined;
  const approvedMine = viewer?.teamToken
    ? approvedTeams.find((team) => team.teamToken === viewer.teamToken)
    : undefined;

  return {
    ...rest,
    devChoices,
    submittedCountryIds,
    claimedCountryIds: (Object.keys(state.claims) as CountryId[]).filter(
      (id) => state.claims[id] !== undefined
    ),
    myCountryId,
    connectedCount: connectedTeams.length,
    expectedTeams: state.countries.length,
    meConnected: viewer?.teamToken ? connectedTeams.includes(viewer.teamToken) : false,
    teamApprovalRequests: viewer?.isHost ? applications : [],
    approvedTeamSeats: viewer?.isHost ? approvedTeams : [],
    myTeamApproval: approvedMine
      ? { status: "approved", nickname: approvedMine.nickname, seatNumber: approvedMine.seatNumber }
      : pendingMine
        ? { status: "pending", nickname: pendingMine.nickname, seatNumber: null }
        : { status: "none", nickname: null, seatNumber: null },
    quiz,
  };
}
