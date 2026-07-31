/**
 * 순수 함수 게임 규칙 모듈.
 * SPEC.md 2~8절의 수치·규칙을 그대로 구현한다. 여기 있는 숫자는 SPEC.md와 반드시 일치해야 한다.
 * 이 파일은 부수효과(네트워크, DOM 등)를 갖지 않는다. 모든 함수는 입력을 받아 새 값을 반환한다.
 */

// ---------------------------------------------------------------------------
// 기본 타입
// ---------------------------------------------------------------------------

export type CountryId = "kor" | "usa" | "swe" | "dnk" | "jpn" | "tuv";

export type AbilityId = CountryId;

export type DevChoice = "economy" | "balanced" | "environment";

export interface Country {
  id: CountryId;
  name: string;
  gp: number;
  ability: string;
  /** 능력을 이미 사용했는가 (국가당 1회) */
  abilityUsed: boolean;
  /**
   * 강제 개발 선택 잠금. 교토의정서(1턴)·코펜하겐기후협약(2턴)에 의해 설정된다.
   * turnsRemaining이 0이 되면 해제된다.
   */
  forcedChoice: { choice: DevChoice; turnsRemaining: number } | null;
}

export type Phase =
  | "nation_consult" // 국가별 협의
  | "representative_meeting" // 대표회의
  | "dev_select" // 개발선택
  | "quiz" // 기후변화 퀴즈
  | "un_conference" // UN 환경보전회의 (4턴 종료 후)
  | "resource_distribution"; // 자원 배분 (8턴)

// ---------------------------------------------------------------------------
// 초기값 (SPEC.md 2절)
// ---------------------------------------------------------------------------

export const INITIAL_TEMPERATURE_DECI = 150; // 15.0도 => 내부 정수 150
export const TOTAL_TURNS = 8;
export const TOTAL_SNACKS = 32;
export const ABILITY_GP_COST = 5;

export function createInitialCountries(): Country[] {
  const base: Array<Pick<Country, "id" | "name" | "gp" | "ability">> = [
    { id: "kor", name: "대한민국", gp: 15, ability: "녹색성장" },
    { id: "usa", name: "미국", gp: 18, ability: "CCS기술" },
    { id: "swe", name: "스웨덴", gp: 20, ability: "인간환경선언" },
    { id: "dnk", name: "덴마크", gp: 20, ability: "코펜하겐기후협약" },
    { id: "jpn", name: "일본", gp: 18, ability: "교토의정서" },
    { id: "tuv", name: "투발루", gp: 8, ability: "가라앉는섬" },
  ];
  return base.map((c) => ({ ...c, abilityUsed: false, forcedChoice: null }));
}

// ---------------------------------------------------------------------------
// 기온: 내부적으로 0.1도 단위 정수(150 = 15.0도)로 저장 (SPEC.md 4.4)
// ---------------------------------------------------------------------------

/** 내부 정수(deci-degree) -> 표시용 소수 (예: 150 -> 15.0) */
export function toDisplayTemp(tempDeci: number): number {
  return Math.round(tempDeci) / 10;
}

/** 표시용 소수 -> 내부 정수 (예: 15.0 -> 150) */
export function toInternalTemp(displayTemp: number): number {
  return Math.round(displayTemp * 10);
}

// ---------------------------------------------------------------------------
// 턴 진행 순서 (SPEC.md 3절)
// ---------------------------------------------------------------------------

/** 각 턴의 페이즈 순서. 1턴은 국가별 협의/대표회의가 없다. 7·8턴은 대표회의가 없다. */
export function getPhaseSequence(turn: number): Phase[] {
  if (turn === 1) return ["dev_select", "quiz"];
  if (turn === 4)
    return [
      "nation_consult",
      "representative_meeting",
      "dev_select",
      "un_conference",
    ];
  if (turn === 7) return ["nation_consult", "dev_select"];
  if (turn === 8) return ["nation_consult", "dev_select", "resource_distribution"];
  // 2, 3, 5, 6턴
  return ["nation_consult", "representative_meeting", "dev_select", "quiz"];
}

/** 초 단위 기본 타이머 길이 (SPEC.md 3절 표기 시간) */
export const PHASE_DURATION_SEC: Record<Phase, number> = {
  nation_consult: 30,
  representative_meeting: 180,
  dev_select: 30,
  quiz: 60,
  un_conference: 60,
  resource_distribution: 60,
};

/** 퀴즈가 있는 턴: 1·2·3·5·6턴 (총 5회) */
export function isQuizTurn(turn: number): boolean {
  return getPhaseSequence(turn).includes("quiz");
}

/** 7·8턴은 대표회의와 특수능력 사용이 없다 (SPEC.md 3절) */
export function canUseAbilitiesThisTurn(turn: number): boolean {
  return turn <= 6;
}

// ---------------------------------------------------------------------------
// 개발 선택과 기온 계산 (SPEC.md 4절)
// ---------------------------------------------------------------------------

export const DEV_CHOICE_GP: Record<DevChoice, number> = {
  economy: 10,
  balanced: 8,
  environment: 5,
};

export function getDevGp(choice: DevChoice): number {
  return DEV_CHOICE_GP[choice];
}

/**
 * 이번 턴 6개국이 획득한 개발 GP 합계(30~60)를 구간표에 대입해 기온 변화(deci-degree)를 구한다.
 * SPEC.md 4.2 표: 35이하 -0.2 / 36-40 +0.1 / 41-45 +0.3 / 46-50 +0.6 / 51-55 +0.9 / 56-60 +1.2
 * 합계는 항상 30~60 범위이지만, 방어적으로 범위를 벗어나면 가장 가까운 구간값을 사용한다.
 */
export function getTempDeltaFromGpSum(gpSum: number): number {
  if (gpSum <= 35) return -2;
  if (gpSum <= 40) return 1;
  if (gpSum <= 45) return 3;
  if (gpSum <= 50) return 6;
  if (gpSum <= 55) return 9;
  return 12;
}

/** 퀴즈 판정에 따른 기온 변화(deci-degree). 전체 정답이면 0, 오답이면 +0.1 (SPEC.md 4.3) */
export function getQuizTempDelta(allCorrect: boolean): number {
  return allCorrect ? 0 : 1;
}

// ---------------------------------------------------------------------------
// 지구 상태 / 획득 자원 (SPEC.md 5절)
// ---------------------------------------------------------------------------

export interface EarthStateInfo {
  name: string;
  resource: string | null;
  /** 이 구간의 하한(deci-degree, 포함) */
  minDeci: number;
}

export const EARTH_STATES: EarthStateInfo[] = [
  { name: "평온한 지구", resource: "초콜릿", minDeci: 150 },
  { name: "변화하는 지구", resource: "라면 과자", minDeci: 160 },
  { name: "다가오는 위험", resource: "포테이토 과자", minDeci: 170 },
  { name: "아파하는 지구", resource: "비스킷 1개", minDeci: 180 },
  { name: "위험에 빠진 인류", resource: "초코볼 한 알", minDeci: 190 },
  { name: "지구의 멸망", resource: null, minDeci: 200 },
];

/** 기온(내부 정수)에 해당하는 지구 상태를 반환한다. 15.0 미만은 '평온한 지구'로 취급한다. */
export function getEarthState(tempDeci: number): EarthStateInfo {
  let result = EARTH_STATES[0];
  for (const state of EARTH_STATES) {
    if (tempDeci >= state.minDeci) result = state;
  }
  return result;
}

/** 20.0도 이상이면 게임 즉시 종료 (SPEC.md 5절) */
export function isGameOver(tempDeci: number): boolean {
  return tempDeci >= 200;
}

// ---------------------------------------------------------------------------
// 국가별 특수 능력 (SPEC.md 6절)
// ---------------------------------------------------------------------------

export interface AbilityAvailability {
  allowed: boolean;
  reason?: string;
}

/**
 * 능력 사용 가능 여부와 조건 미충족 사유.
 * 공통 조건: 국가당 1회, 7·8턴 사용 불가.
 * 국가별 조건: 일본/덴마크 기온 17도 이상, 투발루 기온 18도 이상, 한국/미국/스웨덴은 조건 없음.
 */
export function getAbilityAvailability(
  country: Country,
  turn: number,
  tempDeci: number
): AbilityAvailability {
  if (country.abilityUsed) {
    return { allowed: false, reason: "이미 사용한 능력입니다." };
  }
  if (!canUseAbilitiesThisTurn(turn)) {
    return { allowed: false, reason: "7·8턴에는 특수 능력을 사용할 수 없습니다." };
  }
  if (country.id === "jpn" && tempDeci < 170) {
    return { allowed: false, reason: "기온이 17.0도 이상이어야 사용할 수 있습니다." };
  }
  if (country.id === "dnk" && tempDeci < 170) {
    return { allowed: false, reason: "기온이 17.0도 이상이어야 사용할 수 있습니다." };
  }
  if (country.id === "tuv" && tempDeci < 180) {
    return { allowed: false, reason: "기온이 18.0도 이상이어야 사용할 수 있습니다." };
  }
  return { allowed: true };
}

/**
 * 능력 사용을 확정한다: 교사가 요청을 승인하는 즉시 GP -5와 1회 사용권이 소모된다.
 * 이후 결과(가위바위보 승자, 기부 여부 등)가 무산되어도 이 소모는 되돌리지 않는다.
 */
export function commitAbilityUse(country: Country): Country {
  return { ...country, gp: country.gp - ABILITY_GP_COST, abilityUsed: true };
}

/** 한국 - 녹색성장: 지명한 두 나라가 가위바위보 → 진 쪽 GP -5, 기온 -0.3 */
export function applyKoreaAbility(
  countries: Country[],
  loserId: CountryId
): { countries: Country[]; tempDelta: number } {
  return {
    countries: countries.map((c) =>
      c.id === loserId ? { ...c, gp: c.gp - 5 } : c
    ),
    tempDelta: -3,
  };
}

/**
 * 미국 - CCS기술: 퀴즈를 맞히면 기온 -0.5 (4턴은 교사와 가위바위보 승리 시 -0.5)
 * @param won 퀴즈 정답(일반 턴) 또는 가위바위보 승리(4턴) 여부
 */
export function applyUsaAbility(won: boolean): { tempDelta: number } {
  return { tempDelta: won ? -5 : 0 };
}

/** 스웨덴 - 인간환경선언: 해당 턴 전 국가가 '환경 우선 개발' 선택 시 기온 추가 -0.4 */
export function applySwedenAbility(allChoseEnvironment: boolean): {
  tempDelta: number;
} {
  return { tempDelta: allChoseEnvironment ? -4 : 0 };
}

/**
 * 일본 - 교토의정서: 직전 턴 '경제 우선 개발'을 한 국가는 이번 턴 '환경 우선 개발' 강제.
 * 기온 변화는 없다 - 대상 국가의 개발 선택 UI를 잠그는 데 쓰인다.
 */
export function getJapanForcedCountries(
  previousTurnChoices: Partial<Record<CountryId, DevChoice>>
): CountryId[] {
  return (Object.keys(previousTurnChoices) as CountryId[]).filter(
    (id) => previousTurnChoices[id] === "economy"
  );
}

/** 투발루 - 가라앉는 섬: 어떤 국가가 투발루에 GP 10을 주면 기온 -0.4 (전원 거부 시 무산) */
export function applyTuvaluAbility(
  countries: Country[],
  donorId: CountryId | null
): { countries: Country[]; tempDelta: number } {
  if (!donorId) return { countries, tempDelta: 0 };
  return {
    countries: countries.map((c) => {
      if (c.id === donorId) return { ...c, gp: c.gp - 10 };
      if (c.id === "tuv") return { ...c, gp: c.gp + 10 };
      return c;
    }),
    tempDelta: -4,
  };
}

/**
 * 덴마크 - 코펜하겐기후협약: GP 상위 3개국은 이번 턴부터 2턴간 '환경 우선 개발' 강제
 * (공동 3위 모두 포함). 기온 변화는 없다.
 */
export function getDenmarkForcedCountries(countries: Country[]): CountryId[] {
  const sorted = [...countries].sort((a, b) => b.gp - a.gp);
  if (sorted.length < 3) return sorted.map((c) => c.id);
  const thirdGp = sorted[2].gp;
  return sorted.filter((c) => c.gp >= thirdGp).map((c) => c.id);
}

/** 강제 개발 선택 잠금을 국가들에 설정한다 (턴 수는 호출부에서 결정: 일본=1, 덴마크=2). */
export function applyForcedChoice(
  countries: Country[],
  targetIds: CountryId[],
  choice: DevChoice,
  turns: number
): Country[] {
  return countries.map((c) => {
    if (!targetIds.includes(c.id)) return c;
    // 같은 턴에 두 능력(예: 일본 1턴 + 덴마크 2턴)이 겹치면 더 긴 잠금이 우선한다.
    const turnsRemaining = c.forcedChoice ? Math.max(c.forcedChoice.turnsRemaining, turns) : turns;
    return { ...c, forcedChoice: { choice, turnsRemaining } };
  });
}

/** 턴 종료 시 강제 선택 잔여 턴수를 1씩 줄이고, 0이 되면 해제한다. */
export function decrementForcedChoices(countries: Country[]): Country[] {
  return countries.map((c) => {
    if (!c.forcedChoice) return c;
    const turnsRemaining = c.forcedChoice.turnsRemaining - 1;
    return { ...c, forcedChoice: turnsRemaining > 0 ? { ...c.forcedChoice, turnsRemaining } : null };
  });
}

// ---------------------------------------------------------------------------
// UN 환경보전회의 (SPEC.md 7절, 4턴 종료 후 1회)
// ---------------------------------------------------------------------------

export type UnEvaluation = "sustainable" | "green" | "destructive";

/** 누적 보유 GP로 평가를 판정한다: 45이하=지속가능 / 46~54=녹색개발 / 55이상=환경파괴 */
export function getUnEvaluation(gp: number): UnEvaluation {
  if (gp <= 45) return "sustainable";
  if (gp <= 54) return "green";
  return "destructive";
}

/**
 * UN 환경보전회의 결과를 일괄 적용한다.
 * - 지속가능(45 이하): 지정한 대상국에서 GP 5를 빼앗아 온다 (본인 +5, 대상 -5)
 * - 녹색개발(46~54): 변화 없음
 * - 환경파괴(55 이상): 다른 모든 국가에게 GP를 1씩 나누어 준다 (본인 -(N-1), 나머지 각 +1)
 * @param sustainableTargets 지속가능으로 평가된 국가가 지정한 대상국 id
 */
export function applyUnConference(
  countries: Country[],
  sustainableTargets: Partial<Record<CountryId, CountryId>>
): Country[] {
  const deltas: Record<CountryId, number> = Object.fromEntries(
    countries.map((c) => [c.id, 0])
  ) as Record<CountryId, number>;

  for (const c of countries) {
    const evaluation = getUnEvaluation(c.gp);
    if (evaluation === "sustainable") {
      const targetId = sustainableTargets[c.id];
      if (targetId && targetId !== c.id) {
        deltas[c.id] += 5;
        deltas[targetId] -= 5;
      }
    } else if (evaluation === "destructive") {
      const others = countries.filter((o) => o.id !== c.id);
      deltas[c.id] -= others.length;
      for (const o of others) deltas[o.id] += 1;
    }
  }

  return countries.map((c) => ({ ...c, gp: c.gp + deltas[c.id] }));
}

// ---------------------------------------------------------------------------
// 최종 자원 배분 (SPEC.md 8절)
// ---------------------------------------------------------------------------

export interface FinalDistributionEntry {
  id: CountryId;
  gp: number;
  ratio: number; // 0~1
  snacks: number;
}

/**
 * 각국 배분 과자 수 = round(최종 GP / 전체 GP 합계 x 32).
 * 반올림 오차로 합계가 totalSnacks와 어긋나면, 소수점 나머지가 큰 순서로 1개씩 조정한다.
 * 기온이 20도 이상이면 전원 0개.
 */
export function computeFinalDistribution(
  countries: Country[],
  tempDeci: number,
  totalSnacks: number = TOTAL_SNACKS
): FinalDistributionEntry[] {
  if (isGameOver(tempDeci)) {
    const totalGp = countries.reduce((sum, c) => sum + c.gp, 0);
    return countries.map((c) => ({
      id: c.id,
      gp: c.gp,
      ratio: totalGp > 0 ? c.gp / totalGp : 0,
      snacks: 0,
    }));
  }

  const totalGp = countries.reduce((sum, c) => sum + c.gp, 0);
  const shares = countries.map((c) => (totalGp > 0 ? (c.gp / totalGp) * totalSnacks : 0));
  const base = shares.map((s) => Math.floor(s));
  const remainders = shares.map((s, i) => s - base[i]);

  let remaining = totalSnacks - base.reduce((a, b) => a + b, 0);

  const order = countries
    .map((_, i) => i)
    .sort((a, b) => remainders[b] - remainders[a]);

  const snacks = [...base];
  for (let k = 0; k < order.length && remaining > 0; k++) {
    snacks[order[k]] += 1;
    remaining--;
  }

  return countries.map((c, i) => ({
    id: c.id,
    gp: c.gp,
    ratio: totalGp > 0 ? c.gp / totalGp : 0,
    snacks: snacks[i],
  }));
}
