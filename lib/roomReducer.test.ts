import { describe, expect, it } from "vitest";
import { applyRoomAction } from "./roomReducer";
import { createInitialRoomState, RoomState } from "./roomState";
import { getPhaseSequence, isGameOver } from "./rules";

/** 로비를 건너뛰고 바로 게임이 도는 상태로 만든다. */
function playing(state = createInitialRoomState()): RoomState {
  return applyRoomAction(state, { type: "START_GAME" });
}

function setAllDevChoices(state: RoomState, choice: "economy" | "balanced" | "environment") {
  let s = state;
  for (const c of s.countries) {
    s = applyRoomAction(s, { type: "SET_DEV_CHOICE", countryId: c.id, choice });
  }
  return s;
}

function currentPhase(state: RoomState) {
  return getPhaseSequence(state.turn)[state.phaseIndex];
}

/** GO_NEXT until the room reaches the given phase within the current turn. */
function advanceToPhase(state: RoomState, phase: string): RoomState {
  let s = state;
  const turnNumber = s.turn;
  while (s.turn === turnNumber && currentPhase(s) !== phase) {
    s = applyRoomAction(s, { type: "GO_NEXT" });
  }
  return s;
}

/**
 * Plays exactly one full turn: submits the same dev choice for all 6 countries,
 * reveals, judges the quiz if this turn has one, then crosses into the next turn.
 * Phase-index-agnostic on purpose, so tests don't have to hand-count GO_NEXT calls.
 */
function playTurn(
  state: RoomState,
  choice: "economy" | "balanced" | "environment",
  quizCorrect = true
): RoomState {
  const turnNumber = state.turn;
  let s = advanceToPhase(state, "dev_select");
  s = setAllDevChoices(s, choice);
  s = applyRoomAction(s, { type: "REVEAL" });
  if (s.gameOver) return s;
  if (getPhaseSequence(turnNumber).includes("quiz")) {
    s = advanceToPhase(s, "quiz");
    s = applyRoomAction(s, { type: "JUDGE_QUIZ", correct: quizCorrect });
    if (s.gameOver) return s;
  }
  while (s.turn === turnNumber && !s.gameOver) {
    s = applyRoomAction(s, { type: "GO_NEXT" });
  }
  return s;
}

describe("입장 준비 단계 (로비 → 국가 선택 → 진행)", () => {
  it("JOIN_ROOM은 태블릿을 등록하고, 새로고침해도 중복 집계하지 않는다", () => {
    let state = createInitialRoomState();
    expect(state.stage).toBe("lobby");

    state = applyRoomAction(state, { type: "JOIN_ROOM", teamToken: "pad-1" });
    state = applyRoomAction(state, { type: "JOIN_ROOM", teamToken: "pad-2" });
    expect(state.connectedTeams).toEqual(["pad-1", "pad-2"]);

    // 같은 태블릿이 새로고침한 경우
    state = applyRoomAction(state, { type: "JOIN_ROOM", teamToken: "pad-1" });
    expect(state.connectedTeams).toEqual(["pad-1", "pad-2"]);
  });

  it("로비에서는 국가를 선점할 수 없다", () => {
    let state = createInitialRoomState();
    state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: "kor", teamToken: "pad-1" });
    expect(state.claims.kor).toBeUndefined();
  });

  it("START_COUNTRY_SELECT는 5초 뒤 열리도록 예약한다", () => {
    const before = Date.now();
    let state = createInitialRoomState();
    state = applyRoomAction(state, { type: "START_COUNTRY_SELECT" });
    expect(state.stage).toBe("country_select");
    expect(state.countrySelectOpensAt).toBeGreaterThanOrEqual(before + 5000);
  });

  it("카운트다운이 끝나기 전의 선점 요청은 서버가 거부한다", () => {
    let state = createInitialRoomState();
    state = applyRoomAction(state, { type: "START_COUNTRY_SELECT" });

    // 태블릿 시계가 빨라 먼저 눌러도 서버 시각 기준으로 막힌다
    state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: "kor", teamToken: "pad-1" });
    expect(state.claims.kor).toBeUndefined();

    // 시간이 지난 뒤에는 허용된다
    state = { ...state, countrySelectOpensAt: Date.now() - 1 };
    state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: "kor", teamToken: "pad-1" });
    expect(state.claims.kor).toBe("pad-1");
  });

  it("6개국이 모두 정해지면 자동으로 1턴이 시작된다", () => {
    let state = createInitialRoomState();
    state = applyRoomAction(state, { type: "START_COUNTRY_SELECT" });
    state = { ...state, countrySelectOpensAt: Date.now() - 1 };

    const ids = state.countries.map((c) => c.id);
    ids.forEach((id, i) => {
      state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: id, teamToken: `pad-${i}` });
      // 마지막 한 나라가 정해지기 전까지는 아직 시작되지 않아야 한다
      if (i < ids.length - 1) expect(state.stage).toBe("country_select");
    });

    expect(state.stage).toBe("playing");
  });

  it("로비 중에는 턴 진행 액션이 들어와도 무시된다", () => {
    const state = createInitialRoomState();
    expect(applyRoomAction(state, { type: "GO_NEXT" })).toBe(state);
    expect(applyRoomAction(state, { type: "REVEAL" })).toBe(state);
    expect(applyRoomAction(state, { type: "JUDGE_QUIZ", correct: true })).toBe(state);
    expect(
      applyRoomAction(state, { type: "SET_DEV_CHOICE", countryId: "kor", choice: "economy" })
    ).toBe(state);
  });

  it("RESET_CONNECTIONS는 여분 기기가 섞였을 때 접속 집계를 비운다", () => {
    let state = createInitialRoomState();
    for (const t of ["pad-1", "pad-2", "교사폰", "학생휴대폰"]) {
      state = applyRoomAction(state, { type: "JOIN_ROOM", teamToken: t });
    }
    expect(state.connectedTeams).toHaveLength(4);

    state = applyRoomAction(state, { type: "RESET_CONNECTIONS" });
    expect(state.connectedTeams).toEqual([]);

    // 살아 있는 태블릿은 스스로 다시 등록한다
    state = applyRoomAction(state, { type: "JOIN_ROOM", teamToken: "pad-1" });
    expect(state.connectedTeams).toEqual(["pad-1"]);
  });

  it("START_GAME은 태블릿이 모자랄 때 교사가 강제로 시작하는 통로다", () => {
    let state = createInitialRoomState();
    state = applyRoomAction(state, { type: "JOIN_ROOM", teamToken: "pad-1" });
    state = applyRoomAction(state, { type: "START_GAME" });
    expect(state.stage).toBe("playing");
    expect(state.timer.startedAt).not.toBeNull();
  });
});

describe("roomReducer orchestration", () => {
  it("RESET returns a fresh initial state regardless of current state", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "SET_DEV_CHOICE", countryId: "kor", choice: "economy" });
    state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: "kor", teamToken: "t1" });
    const reset = applyRoomAction(state, { type: "RESET" });

    // timer.startedAt은 호출 시각이라 매번 달라진다. 나머지를 비교한다.
    const { timer, ...resetRest } = reset;
    const { timer: freshTimer, ...freshRest } = createInitialRoomState();
    expect(resetRest).toEqual(freshRest);
    expect(timer.durationSec).toBe(freshTimer.durationSec);
    expect(timer.startedAt).not.toBeNull();
  });

  it("CLAIM_COUNTRY refuses to hand a country to a second team", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: "kor", teamToken: "team-a" });
    state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: "kor", teamToken: "team-b" });
    expect(state.claims.kor).toBe("team-a");
  });

  it("CLAIM_COUNTRY lets the same token reclaim (reconnect) and releases its old country", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: "kor", teamToken: "team-a" });
    // 재접속: 같은 토큰이므로 그대로 유지된다
    state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: "kor", teamToken: "team-a" });
    expect(state.claims.kor).toBe("team-a");

    // 다른 나라로 옮기면 이전 나라는 풀려서 다른 조가 쓸 수 있어야 한다
    state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: "tuv", teamToken: "team-a" });
    expect(state.claims.tuv).toBe("team-a");
    expect(state.claims.kor).toBeUndefined();
  });

  it("SET_DEV_CHOICE is rejected for a country under a forced choice", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "DENMARK_ABILITY", countryId: "dnk" });
    const forced = state.countries.find((c) => c.forcedChoice)!;
    const before = state.devChoices[forced.id];
    state = applyRoomAction(state, { type: "SET_DEV_CHOICE", countryId: forced.id, choice: "economy" });
    expect(state.devChoices[forced.id]).toBe(before);
  });

  it("SET_DEV_CHOICE is rejected after the reveal", () => {
    let state = setAllDevChoices(playing(), "balanced");
    state = applyRoomAction(state, { type: "REVEAL" });
    state = applyRoomAction(state, { type: "SET_DEV_CHOICE", countryId: "kor", choice: "economy" });
    expect(state.devChoices.kor).toBe("balanced");
  });

  it("REQUEST_ABILITY is ignored when the ability's condition is not met", () => {
    let state = playing(); // 15.0도 -> 투발루는 18.0도 필요
    state = applyRoomAction(state, { type: "REQUEST_ABILITY", countryId: "tuv" });
    expect(state.abilityRequests).toEqual([]);
  });

  it("REQUEST_ABILITY queues the request and applying the ability clears it", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "REQUEST_ABILITY", countryId: "kor" });
    expect(state.abilityRequests).toEqual(["kor"]);
    state = applyRoomAction(state, { type: "KOREA_ABILITY", countryId: "kor", loserId: "usa" });
    expect(state.abilityRequests).toEqual([]);
  });

  it("GO_NEXT into a new turn clears pending ability requests", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "REQUEST_ABILITY", countryId: "swe" });
    expect(state.abilityRequests).toEqual(["swe"]);
    state = playTurn(state, "balanced");
    expect(state.turn).toBe(2);
    expect(state.abilityRequests).toEqual([]);
  });

  it("REVEAL is a no-op until all 6 countries have a choice", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "SET_DEV_CHOICE", countryId: "kor", choice: "economy" });
    const revealed = applyRoomAction(state, { type: "REVEAL" });
    expect(revealed.revealed).toBe(false);
    expect(revealed.temperatureDeci).toBe(state.temperatureDeci);
  });

  it("REVEAL applies GP gains and the temperature-bracket delta, then locks further reveals", () => {
    let state = setAllDevChoices(playing(), "economy"); // sum=60 -> +1.2
    state = applyRoomAction(state, { type: "REVEAL" });
    expect(state.revealed).toBe(true);
    expect(state.temperatureDeci).toBe(150 + 12);
    expect(state.countries.find((c) => c.id === "kor")!.gp).toBe(15 + 10);

    // Revealing again must not double-apply.
    const again = applyRoomAction(state, { type: "REVEAL" });
    expect(again).toBe(state);
  });

  it("JUDGE_QUIZ is a no-op once already judged this turn", () => {
    let state = setAllDevChoices(playing(), "balanced");
    state = applyRoomAction(state, { type: "REVEAL" });
    state = applyRoomAction(state, { type: "GO_NEXT" }); // -> quiz phase
    state = applyRoomAction(state, { type: "JUDGE_QUIZ", correct: false });
    const tempAfterFirst = state.temperatureDeci;
    const again = applyRoomAction(state, { type: "JUDGE_QUIZ", correct: true });
    expect(again.temperatureDeci).toBe(tempAfterFirst);
    expect(again.quizJudged).toBe(false);
  });

  it("KOREA_ABILITY commits GP-5 to Korea and -5 to the loser plus -0.3 temperature", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "KOREA_ABILITY", countryId: "kor", loserId: "usa" });
    expect(state.countries.find((c) => c.id === "kor")!.gp).toBe(15 - 5);
    expect(state.countries.find((c) => c.id === "kor")!.abilityUsed).toBe(true);
    expect(state.countries.find((c) => c.id === "usa")!.gp).toBe(18 - 5);
    expect(state.temperatureDeci).toBe(150 - 3);
  });

  it("USA_ABILITY on non-turn-4 turns defers to pendingUsa, resolved at JUDGE_QUIZ", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "USA_ABILITY", countryId: "usa" });
    expect(state.pendingUsa).toBe(true);
    expect(state.temperatureDeci).toBe(150); // no immediate effect

    state = setAllDevChoices(state, "balanced");
    state = applyRoomAction(state, { type: "REVEAL" });
    state = applyRoomAction(state, { type: "GO_NEXT" });
    const tempBeforeQuiz = state.temperatureDeci;
    state = applyRoomAction(state, { type: "JUDGE_QUIZ", correct: true });
    expect(state.pendingUsa).toBe(false);
    expect(state.temperatureDeci).toBe(tempBeforeQuiz - 5); // quiz(0) + ability(-0.5)
  });

  it("USA_ABILITY on turn 4 resolves immediately via the won flag", () => {
    let state = playing();
    // fast-forward through turns 1-3 (one full playthrough each) without touching USA's ability
    state = playTurn(state, "balanced");
    state = playTurn(state, "balanced");
    state = playTurn(state, "balanced");
    expect(state.turn).toBe(4);
    state = advanceToPhase(state, "representative_meeting");

    const before = state.temperatureDeci;
    state = applyRoomAction(state, { type: "USA_ABILITY", countryId: "usa", won: true });
    expect(state.pendingUsa).toBe(false);
    expect(state.temperatureDeci).toBe(before - 5);
  });

  it("SWEDEN_ABILITY resolves at REVEAL based on whether all 6 chose environment", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "SWEDEN_ABILITY", countryId: "swe" });
    expect(state.pendingSweden).toBe(true);

    state = setAllDevChoices(state, "environment"); // sum=30 -> -0.2
    state = applyRoomAction(state, { type: "REVEAL" });
    expect(state.pendingSweden).toBe(false);
    expect(state.temperatureDeci).toBe(150 - 2 - 4); // -0.2 base + -0.4 sweden bonus
  });

  it("JAPAN_ABILITY forces last turn's economy-first countries into environment this turn", () => {
    let state = setAllDevChoices(playing(), "economy");
    state = applyRoomAction(state, { type: "REVEAL" });
    state = applyRoomAction(state, { type: "GO_NEXT" }); // quiz
    state = applyRoomAction(state, { type: "JUDGE_QUIZ", correct: true });
    state = applyRoomAction(state, { type: "GO_NEXT" }); // turn2 nation_consult
    state = applyRoomAction(state, { type: "GO_NEXT" }); // turn2 representative_meeting

    state = applyRoomAction(state, { type: "JAPAN_ABILITY", countryId: "jpn" });
    for (const c of state.countries) {
      expect(c.forcedChoice).toEqual({ choice: "environment", turnsRemaining: 1 });
    }
  });

  it("TUVALU_ABILITY moves GP from the donor and drops temperature only when a donor is given", () => {
    let state = playing();
    const nullified = applyRoomAction(state, { type: "TUVALU_ABILITY", countryId: "tuv", donorId: null });
    expect(nullified.temperatureDeci).toBe(150);
    expect(nullified.countries.find((c) => c.id === "tuv")!.gp).toBe(8 - 5); // ability cost still charged

    const donated = applyRoomAction(state, { type: "TUVALU_ABILITY", countryId: "tuv", donorId: "usa" });
    expect(donated.temperatureDeci).toBe(150 - 4);
    expect(donated.countries.find((c) => c.id === "usa")!.gp).toBe(18 - 10);
    expect(donated.countries.find((c) => c.id === "tuv")!.gp).toBe(8 - 5 + 10);
  });

  it("DENMARK_ABILITY forces the top-3-by-GP countries (with ties) for 2 turns", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "DENMARK_ABILITY", countryId: "dnk" });
    // gp: kor15 usa18 swe20 dnk20 jpn18 tuv8 -> top3 cutoff 18, ties usa/jpn included
    const forcedIds = state.countries.filter((c) => c.forcedChoice).map((c) => c.id).sort();
    expect(forcedIds).toEqual(["dnk", "jpn", "swe", "usa"].sort());
  });

  it("APPLY_UN is a no-op once already applied", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "SET_UN_TARGET", countryId: "tuv", targetId: "usa" });
    state = applyRoomAction(state, { type: "APPLY_UN" });
    const tuvGpAfterFirst = state.countries.find((c) => c.id === "tuv")!.gp;
    const again = applyRoomAction(state, { type: "APPLY_UN" });
    expect(again.countries.find((c) => c.id === "tuv")!.gp).toBe(tuvGpAfterFirst);
  });

  it("GO_NEXT walks the phase sequence and resets per-turn ephemeral state on turn change", () => {
    let state = playing();
    expect(getPhaseSequence(state.turn)[state.phaseIndex]).toBe("dev_select");
    state = setAllDevChoices(state, "balanced");
    state = applyRoomAction(state, { type: "REVEAL" });
    state = applyRoomAction(state, { type: "GO_NEXT" }); // -> quiz
    expect(getPhaseSequence(state.turn)[state.phaseIndex]).toBe("quiz");
    state = applyRoomAction(state, { type: "JUDGE_QUIZ", correct: true });
    state = applyRoomAction(state, { type: "GO_NEXT" }); // -> turn 2
    expect(state.turn).toBe(2);
    expect(state.revealed).toBe(false);
    expect(state.devChoices).toEqual({});
  });

  it("SET_GP overwrites a country's GP and records it as a manual correction", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "SET_GP", countryId: "tuv", gp: 42 });
    expect(state.countries.find((c) => c.id === "tuv")!.gp).toBe(42);
    expect(state.log[0]).toContain("[수동 보정]");
  });

  it("SET_GP ignores non-finite input rather than corrupting the board", () => {
    let state = playing();
    const before = state.countries.find((c) => c.id === "kor")!.gp;
    state = applyRoomAction(state, { type: "SET_GP", countryId: "kor", gp: Number.NaN });
    expect(state.countries.find((c) => c.id === "kor")!.gp).toBe(before);
  });

  it("SET_TEMPERATURE sets the temperature and recomputes game over", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "SET_TEMPERATURE", tempDeci: 205 });
    expect(state.temperatureDeci).toBe(205);
    expect(state.gameOver).toBe(true);
  });

  it("SET_TEMPERATURE can rescue a board that was accidentally ended", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "SET_TEMPERATURE", tempDeci: 205 });
    expect(state.gameOver).toBe(true);
    // 멸망 상태에서도 보정이 통해야 실수를 되돌릴 수 있다
    state = applyRoomAction(state, { type: "SET_TEMPERATURE", tempDeci: 180 });
    expect(state.gameOver).toBe(false);
    expect(state.temperatureDeci).toBe(180);
  });

  it("ordinary actions stay blocked once the game is over", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "SET_TEMPERATURE", tempDeci: 200 });
    const frozen = applyRoomAction(state, { type: "GO_NEXT" });
    expect(frozen).toBe(state);
  });

  it("JUMP_PHASE clamps turn and phase to what actually exists", () => {
    let state = playing();
    // 7턴은 [nation_consult, dev_select] 2개뿐이므로 index 5는 잘려야 한다
    state = applyRoomAction(state, { type: "JUMP_PHASE", turn: 7, phaseIndex: 5 });
    expect(state.turn).toBe(7);
    expect(state.phaseIndex).toBe(getPhaseSequence(7).length - 1);

    state = applyRoomAction(state, { type: "JUMP_PHASE", turn: 99, phaseIndex: -3 });
    expect(state.turn).toBe(8);
    expect(state.phaseIndex).toBe(0);
  });

  it("JUMP_PHASE restarts the timer for the destination phase", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "TIMER_PAUSE" });
    expect(state.timer.startedAt).toBeNull();
    state = applyRoomAction(state, { type: "JUMP_PHASE", turn: 2, phaseIndex: 1 });
    expect(state.timer.startedAt).not.toBeNull();
    expect(state.timer.durationSec).toBe(180); // 대표회의 3분
  });

  it("IMPORT_STATE replaces the board but rejects a malformed file", () => {
    let state = playing();
    const snapshot = applyRoomAction(state, { type: "SET_GP", countryId: "kor", gp: 77 });

    state = applyRoomAction(state, { type: "IMPORT_STATE", state: snapshot });
    expect(state.countries.find((c) => c.id === "kor")!.gp).toBe(77);

    const bad = { ...snapshot, countries: snapshot.countries.slice(0, 3) };
    const unchanged = applyRoomAction(state, { type: "IMPORT_STATE", state: bad });
    expect(unchanged).toBe(state);
  });

  it("GO_NEXT does nothing once the game is over", () => {
    let state = playing();
    // economy every turn is +1.2 (deci 12) per turn; 150 -> 200 needs at most 5 turns.
    let iterations = 0;
    while (!state.gameOver && iterations < 8) {
      state = playTurn(state, "economy", true);
      iterations++;
    }
    expect(state.gameOver).toBe(true);
    expect(isGameOver(state.temperatureDeci)).toBe(true);
    const frozen = applyRoomAction(state, { type: "GO_NEXT" });
    expect(frozen).toBe(state);
  });
});
