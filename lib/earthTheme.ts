/**
 * 관전 화면 배경색 (SPEC.md 11절: 평온=청록 → 멸망=적색으로 단계적 변화).
 * 교실 뒤에서도 읽혀야 하므로 흰 글씨가 또렷하게 보이는 어두운 색으로 잡았다.
 */
import { EARTH_STATES } from "@/lib/rules";
import earthStateData from "@/data/earthStates.json";

interface EarthStateCopy {
  name: string;
  headline: string;
  description: string;
}

const COPY: EarthStateCopy[] = earthStateData;

/** EARTH_STATES와 같은 순서 (평온 → 멸망) */
const BACKGROUNDS = [
  "#134e4a", // 평온한 지구 - 청록
  "#3f6212", // 변화하는 지구 - 올리브
  "#854d0e", // 다가오는 위험 - 황갈
  "#9a3412", // 아파하는 지구 - 주황
  "#991b1b", // 위험에 빠진 인류 - 적색
  "#450a0a", // 지구의 멸망 - 암적색
];

function stateIndex(tempDeci: number): number {
  let index = 0;
  EARTH_STATES.forEach((state, i) => {
    if (tempDeci >= state.minDeci) index = i;
  });
  return index;
}

export function getEarthBackground(tempDeci: number): string {
  return BACKGROUNDS[stateIndex(tempDeci)];
}

export function getEarthCopy(tempDeci: number): EarthStateCopy {
  return COPY[stateIndex(tempDeci)];
}
