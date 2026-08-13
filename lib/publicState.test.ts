import { describe, expect, it } from "vitest";
import { toPublicState } from "./publicState";
import { createInitialRoomState } from "./roomState";
import { applyRoomAction } from "./roomReducer";
import { RoomState } from "./roomState";

/** 로비를 건너뛰고 바로 게임이 도는 상태로 만든다. */
function playing(): RoomState {
  return applyRoomAction(createInitialRoomState(), { type: "START_GAME" });
}

function withAllChoices(): RoomState {
  let state = playing();
  for (const c of state.countries) {
    state = applyRoomAction(state, { type: "SET_DEV_CHOICE", countryId: c.id, choice: "economy" });
  }
  return state;
}

describe("toPublicState — 비밀 제출 경계 (SPEC.md 4.1)", () => {
  it("퀴즈 정답과 해설은 학급 답변 제출 뒤에만 공개한다", () => {
    let state = withAllChoices();
    state = applyRoomAction(state, { type: "REVEAL" });
    state = applyRoomAction(state, { type: "GO_NEXT" });

    const before = toPublicState(state);
    expect(before.quiz?.question).toBeTruthy();
    expect(before.quiz?.correctAnswer).toBeNull();
    expect(before.quiz?.explanation).toBeNull();

    state = applyRoomAction(state, { type: "SUBMIT_QUIZ_ANSWER", answer: false });
    const after = toPublicState(state);
    expect(after.quiz?.classAnswer).toBe(false);
    expect(after.quiz?.correctAnswer).toBe(false);
    expect(after.quiz?.isCorrect).toBe(true);
    expect(after.quiz?.explanation).toBeTruthy();
    expect(after.quiz?.sources?.length).toBeGreaterThan(0);
    expect((after as unknown as Record<string, unknown>).quizAnswer).toBeUndefined();
  });
  it("공개 전에는 어떤 조의 선택도 내보내지 않는다", () => {
    const state = withAllChoices();
    const pub = toPublicState(state);
    expect(pub.revealed).toBe(false);
    expect(pub.devChoices).toEqual({});
  });

  it("공개 전에도 '누가 냈는지'는 알려준다 (제출 현황 표시용)", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "SET_DEV_CHOICE", countryId: "kor", choice: "economy" });
    state = applyRoomAction(state, { type: "SET_DEV_CHOICE", countryId: "usa", choice: "balanced" });
    const pub = toPublicState(state);
    expect(pub.submittedCountryIds.sort()).toEqual(["kor", "usa"]);
    expect(pub.devChoices).toEqual({});
  });

  it("본인 국가의 선택만 본인에게 되돌려준다 (새로고침 복구용)", () => {
    const state = withAllChoices();
    const pub = toPublicState(state, { countryId: "kor" });
    expect(pub.devChoices).toEqual({ kor: "economy" });
    expect(pub.devChoices.usa).toBeUndefined();
  });

  it("공개 후에는 6개국 선택이 모두 열린다", () => {
    let state = withAllChoices();
    state = applyRoomAction(state, { type: "REVEAL" });
    const pub = toPublicState(state);
    expect(pub.revealed).toBe(true);
    expect(Object.keys(pub.devChoices).sort()).toEqual(
      ["dnk", "jpn", "kor", "swe", "tuv", "usa"].sort()
    );
  });

  it("팀 토큰은 어떤 경우에도 밖으로 나가지 않는다", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: "kor", teamToken: "secret-token" });
    const pub = toPublicState(state, { teamToken: "secret-token" });

    expect(JSON.stringify(pub)).not.toContain("secret-token");
    expect((pub as unknown as Record<string, unknown>).claims).toBeUndefined();
    // 선점 여부만 노출된다
    expect(pub.claimedCountryIds).toEqual(["kor"]);
  });

  it("본인 토큰으로 자기 국가를 식별해준다", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "CLAIM_COUNTRY", countryId: "tuv", teamToken: "team-a" });
    expect(toPublicState(state, { teamToken: "team-a" }).myCountryId).toBe("tuv");
    expect(toPublicState(state, { teamToken: "team-b" }).myCountryId).toBeNull();
    expect(toPublicState(state).myCountryId).toBeNull();
  });

  it("강제 선택은 공개 전에도 보인다 (다른 조도 알아야 하는 공개 정보)", () => {
    let state = playing();
    state = applyRoomAction(state, { type: "DENMARK_ABILITY", countryId: "dnk" });
    const pub = toPublicState(state);
    const forced = pub.countries.filter((c) => c.forcedChoice);
    expect(forced.length).toBeGreaterThan(0);
    expect(forced[0].forcedChoice?.choice).toBe("environment");
  });
});
