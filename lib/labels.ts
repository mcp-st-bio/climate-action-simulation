import { Country, CountryId, DevChoice, Phase } from "@/lib/rules";

export const PHASE_LABEL: Record<Phase, string> = {
  nation_consult: "국가별 협의",
  representative_meeting: "대표회의",
  dev_select: "개발선택",
  quiz: "기후변화 퀴즈",
  un_conference: "UN 환경보전회의",
  resource_distribution: "자원 배분",
};

export const CHOICE_LABEL: Record<DevChoice, string> = {
  economy: "경제 우선 개발",
  balanced: "균형 개발",
  environment: "환경 우선 개발",
};

export const CHOICE_GP_LABEL: Record<DevChoice, string> = {
  economy: "경제 우선 개발 (GP +10)",
  balanced: "균형 개발 (GP +8)",
  environment: "환경 우선 개발 (GP +5)",
};

export function nameOf(countries: Country[], id: CountryId | undefined | null): string {
  if (!id) return "-";
  return countries.find((c) => c.id === id)?.name ?? id;
}
