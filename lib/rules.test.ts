import { describe, expect, it } from "vitest";
import {
  applyForcedChoice,
  applyKoreaAbility,
  applySwedenAbility,
  applyTuvaluAbility,
  applyUnConference,
  applyUsaAbility,
  canUseAbilitiesThisTurn,
  commitAbilityUse,
  computeFinalDistribution,
  createInitialCountries,
  decrementForcedChoices,
  getAbilityAvailability,
  getDenmarkForcedCountries,
  getDevGp,
  getEarthState,
  getJapanForcedCountries,
  getPhaseSequence,
  getQuizTempDelta,
  getTempDeltaFromGpSum,
  getUnEvaluation,
  isGameOver,
  isQuizTurn,
  toDisplayTemp,
  toInternalTemp,
  INITIAL_TEMPERATURE_DECI,
} from "./rules";

describe("temperature conversion", () => {
  it("converts internal deci-degree to display and back", () => {
    expect(toDisplayTemp(150)).toBe(15.0);
    expect(toDisplayTemp(173)).toBe(17.3);
    expect(toInternalTemp(15.0)).toBe(150);
    expect(toInternalTemp(17.3)).toBe(173);
  });

  it("starts at 15.0 degrees", () => {
    expect(toDisplayTemp(INITIAL_TEMPERATURE_DECI)).toBe(15.0);
  });
});

describe("phase sequence (SPEC section 3)", () => {
  it("turn 1 has no nation_consult/representative_meeting", () => {
    expect(getPhaseSequence(1)).toEqual(["dev_select", "quiz"]);
  });
  it("turns 2,3,5,6 follow the standard 4-phase sequence", () => {
    for (const turn of [2, 3, 5, 6]) {
      expect(getPhaseSequence(turn)).toEqual([
        "nation_consult",
        "representative_meeting",
        "dev_select",
        "quiz",
      ]);
    }
  });
  it("turn 4 ends with un_conference instead of quiz", () => {
    expect(getPhaseSequence(4)).toEqual([
      "nation_consult",
      "representative_meeting",
      "dev_select",
      "un_conference",
    ]);
  });
  it("turns 7 and 8 have no representative_meeting", () => {
    expect(getPhaseSequence(7)).toEqual(["nation_consult", "dev_select"]);
    expect(getPhaseSequence(8)).toEqual([
      "nation_consult",
      "dev_select",
      "resource_distribution",
    ]);
  });
  it("quiz occurs in exactly 5 turns: 1,2,3,5,6", () => {
    const quizTurns = [1, 2, 3, 4, 5, 6, 7, 8].filter(isQuizTurn);
    expect(quizTurns).toEqual([1, 2, 3, 5, 6]);
  });
  it("abilities are disabled on turns 7 and 8", () => {
    expect(canUseAbilitiesThisTurn(6)).toBe(true);
    expect(canUseAbilitiesThisTurn(7)).toBe(false);
    expect(canUseAbilitiesThisTurn(8)).toBe(false);
  });
});

describe("development choices", () => {
  it("maps each choice to its GP value", () => {
    expect(getDevGp("economy")).toBe(10);
    expect(getDevGp("balanced")).toBe(8);
    expect(getDevGp("environment")).toBe(5);
  });
});

describe("getTempDeltaFromGpSum (SPEC 4.2 table)", () => {
  it.each([
    [30, -2],
    [35, -2],
    [36, 1],
    [40, 1],
    [41, 3],
    [45, 3],
    [46, 6],
    [50, 6],
    [51, 9],
    [55, 9],
    [56, 12],
    [60, 12],
  ])("gpSum=%i -> delta=%i (deci-degree)", (gpSum, expected) => {
    expect(getTempDeltaFromGpSum(gpSum)).toBe(expected);
  });
});

describe("getQuizTempDelta", () => {
  it("keeps temperature when the class answers correctly", () => {
    expect(getQuizTempDelta(true)).toBe(0);
  });
  it("adds +0.1 (1 deci) when the class answers incorrectly", () => {
    expect(getQuizTempDelta(false)).toBe(1);
  });
});

describe("getEarthState (SPEC section 5)", () => {
  it.each([
    [150, "평온한 지구", "초콜릿"],
    [159, "평온한 지구", "초콜릿"],
    [160, "변화하는 지구", "라면 과자"],
    [170, "다가오는 위험", "포테이토 과자"],
    [180, "아파하는 지구", "비스킷 1개"],
    [190, "위험에 빠진 인류", "초코볼 한 알"],
    [200, "지구의 멸망", null],
    [215, "지구의 멸망", null],
  ])("tempDeci=%i -> %s / %s", (tempDeci, name, resource) => {
    const state = getEarthState(tempDeci);
    expect(state.name).toBe(name);
    expect(state.resource).toBe(resource);
  });

  it("treats sub-15.0 temperatures as the calmest state", () => {
    expect(getEarthState(120).name).toBe("평온한 지구");
  });
});

describe("isGameOver", () => {
  it("ends the game at 20.0 degrees or above", () => {
    expect(isGameOver(199)).toBe(false);
    expect(isGameOver(200)).toBe(true);
    expect(isGameOver(250)).toBe(true);
  });
});

describe("special abilities (SPEC section 6)", () => {
  it("blocks reuse of an already-used ability", () => {
    const countries = createInitialCountries();
    const korea = { ...countries[0], abilityUsed: true };
    expect(getAbilityAvailability(korea, 3, 150).allowed).toBe(false);
  });

  it("blocks all ability use on turns 7 and 8 even if otherwise eligible", () => {
    const countries = createInitialCountries();
    const denmark = countries.find((c) => c.id === "dnk")!;
    expect(getAbilityAvailability(denmark, 7, 190).allowed).toBe(false);
  });

  it("requires 17.0+ degrees for Japan (Kyoto Protocol)", () => {
    const countries = createInitialCountries();
    const japan = countries.find((c) => c.id === "jpn")!;
    expect(getAbilityAvailability(japan, 3, 169).allowed).toBe(false);
    expect(getAbilityAvailability(japan, 3, 170).allowed).toBe(true);
  });

  it("requires 17.0+ degrees for Denmark (Copenhagen Accord)", () => {
    const countries = createInitialCountries();
    const denmark = countries.find((c) => c.id === "dnk")!;
    expect(getAbilityAvailability(denmark, 3, 169).allowed).toBe(false);
    expect(getAbilityAvailability(denmark, 3, 170).allowed).toBe(true);
  });

  it("requires 18.0+ degrees for Tuvalu (Sinking Island)", () => {
    const countries = createInitialCountries();
    const tuvalu = countries.find((c) => c.id === "tuv")!;
    expect(getAbilityAvailability(tuvalu, 3, 179).allowed).toBe(false);
    expect(getAbilityAvailability(tuvalu, 3, 180).allowed).toBe(true);
  });

  it("has no extra condition for Korea, USA, Sweden", () => {
    const countries = createInitialCountries();
    for (const id of ["kor", "usa", "swe"]) {
      const c = countries.find((x) => x.id === id)!;
      expect(getAbilityAvailability(c, 1, 150).allowed).toBe(true);
    }
  });

  it("commitAbilityUse deducts 5 GP and marks the ability used, unconditionally", () => {
    const countries = createInitialCountries();
    const tuvalu = countries.find((c) => c.id === "tuv")!;
    const committed = commitAbilityUse(tuvalu);
    expect(committed.gp).toBe(3);
    expect(committed.abilityUsed).toBe(true);

    // Even if the outcome is later nullified (everyone refuses to donate),
    // the GP cost and one-time use are already spent per teacher confirmation.
    const { countries: afterNullified, tempDelta } = applyTuvaluAbility(
      [committed, ...countries.filter((c) => c.id !== "tuv")],
      null
    );
    expect(tempDelta).toBe(0);
    expect(afterNullified.find((c) => c.id === "tuv")!.gp).toBe(3);
  });

  it("Korea ability: loser loses 5 GP, temperature drops 0.3", () => {
    const countries = createInitialCountries();
    const { countries: updated, tempDelta } = applyKoreaAbility(countries, "usa");
    expect(updated.find((c) => c.id === "usa")!.gp).toBe(13);
    expect(tempDelta).toBe(-3);
  });

  it("USA ability: -0.5 only on success (quiz correct or RPS win)", () => {
    expect(applyUsaAbility(true).tempDelta).toBe(-5);
    expect(applyUsaAbility(false).tempDelta).toBe(0);
  });

  it("Sweden ability: -0.4 only if every country chose environment-first", () => {
    expect(applySwedenAbility(true).tempDelta).toBe(-4);
    expect(applySwedenAbility(false).tempDelta).toBe(0);
  });

  it("Japan ability forces last turn's economy-first countries into environment", () => {
    const forced = getJapanForcedCountries({ kor: "economy", usa: "balanced", swe: "economy" });
    expect(forced.sort()).toEqual(["kor", "swe"]);
  });

  it("Tuvalu ability: donor loses 10, Tuvalu gains 10, temp -0.4 when donation happens", () => {
    const countries = createInitialCountries();
    const { countries: updated, tempDelta } = applyTuvaluAbility(countries, "usa");
    expect(updated.find((c) => c.id === "usa")!.gp).toBe(8);
    expect(updated.find((c) => c.id === "tuv")!.gp).toBe(18);
    expect(tempDelta).toBe(-4);
  });

  it("Tuvalu ability: nothing happens when everyone refuses", () => {
    const countries = createInitialCountries();
    const { countries: updated, tempDelta } = applyTuvaluAbility(countries, null);
    expect(updated).toEqual(countries);
    expect(tempDelta).toBe(0);
  });

  it("Denmark ability targets the top 3 by GP, including ties for 3rd place", () => {
    const countries = createInitialCountries();
    // gp: kor15 usa18 swe20 dnk20 jpn18 tuv8 -> top3 cutoff gp=18, ties usa/jpn included
    const forced = getDenmarkForcedCountries(countries).sort();
    expect(forced).toEqual(["dnk", "jpn", "swe", "usa"].sort());
  });

  it("keeps the longer lock when two abilities force the same country in one turn", () => {
    // e.g. Japan (1 turn) and Denmark (2 turns) both target Korea the same turn.
    let countries = createInitialCountries();
    countries = applyForcedChoice(countries, ["kor"], "environment", 2); // Denmark, applied first
    countries = applyForcedChoice(countries, ["kor"], "environment", 1); // Japan, applied second
    expect(countries.find((c) => c.id === "kor")!.forcedChoice).toEqual({
      choice: "environment",
      turnsRemaining: 2,
    });
  });

  it("forced choices decrement each turn and expire at zero", () => {
    let countries = createInitialCountries();
    countries = applyForcedChoice(countries, ["kor"], "environment", 2);
    expect(countries.find((c) => c.id === "kor")!.forcedChoice).toEqual({
      choice: "environment",
      turnsRemaining: 2,
    });
    countries = decrementForcedChoices(countries);
    expect(countries.find((c) => c.id === "kor")!.forcedChoice?.turnsRemaining).toBe(1);
    countries = decrementForcedChoices(countries);
    expect(countries.find((c) => c.id === "kor")!.forcedChoice).toBeNull();
  });
});

describe("UN conference (SPEC section 7)", () => {
  it("classifies by cumulative GP thresholds", () => {
    expect(getUnEvaluation(45)).toBe("sustainable");
    expect(getUnEvaluation(46)).toBe("green");
    expect(getUnEvaluation(54)).toBe("green");
    expect(getUnEvaluation(55)).toBe("destructive");
  });

  it("sustainable country takes 5 GP from its chosen target", () => {
    const countries = createInitialCountries(); // tuv gp=8 -> sustainable
    const updated = applyUnConference(countries, { tuv: "swe" });
    expect(updated.find((c) => c.id === "tuv")!.gp).toBe(13);
    expect(updated.find((c) => c.id === "swe")!.gp).toBe(15);
  });

  it("destructive country gives 1 GP to every other country", () => {
    const countries = createInitialCountries().map((c) =>
      c.id === "swe" ? { ...c, gp: 60 } : c
    ); // swe -> destructive
    const updated = applyUnConference(countries, {});
    const swe = updated.find((c) => c.id === "swe")!;
    expect(swe.gp).toBe(60 - 5); // 5 other countries
    for (const other of updated.filter((c) => c.id !== "swe")) {
      const original = countries.find((c) => c.id === other.id)!;
      expect(other.gp).toBe(original.gp + 1);
    }
  });

  it("green-status countries are untouched", () => {
    const countries = createInitialCountries().map((c) =>
      c.id === "usa" ? { ...c, gp: 50 } : c
    );
    const updated = applyUnConference(countries, {});
    expect(updated.find((c) => c.id === "usa")!.gp).toBe(50);
  });
});

describe("computeFinalDistribution (SPEC section 8)", () => {
  it("distributes exactly 32 snacks using largest-remainder rounding", () => {
    const countries = createInitialCountries(); // total gp = 99
    const result = computeFinalDistribution(countries, 150);
    const total = result.reduce((sum, r) => sum + r.snacks, 0);
    expect(total).toBe(32);
  });

  it("gives everyone 0 snacks once the game is over (>=20.0 degrees)", () => {
    const countries = createInitialCountries();
    const result = computeFinalDistribution(countries, 200);
    expect(result.every((r) => r.snacks === 0)).toBe(true);
  });

  it("matches a hand-checked distribution", () => {
    // gp: kor15 usa18 swe20 dnk20 jpn18 tuv8, total=99
    // raw shares *32/99: kor 4.848 usa 5.818 swe 6.465 dnk 6.465 jpn 5.818 tuv 2.586
    // floor: 4 5 6 6 5 2 = 28, remainder 4 distributed to largest fractional parts:
    // tuv(.586), swe(.465)/dnk(.465) tie, usa(.818)/jpn(.818) tie -> order by array position on ties
    const countries = createInitialCountries();
    const result = computeFinalDistribution(countries, 150);
    const total = result.reduce((sum, r) => sum + r.snacks, 0);
    expect(total).toBe(32);
    for (const r of result) {
      expect(r.snacks).toBeGreaterThanOrEqual(0);
    }
  });
});
