"use client";

import { useEffect, useState } from "react";
import { PHASE_LABEL } from "@/lib/labels";
import { getPhaseSequence, type CountryId, type Phase } from "@/lib/rules";
import type { RoomStage } from "@/lib/roomState";

const COUNTRY_GUIDE: Array<{
  id: CountryId;
  name: string;
  gp: number;
  ability: string;
  effect: string;
  condition: string;
}> = [
  { id: "kor", name: "대한민국", gp: 15, ability: "녹색성장", effect: "지명한 두 나라가 가위바위보를 하고, 진 나라의 GP가 5 감소하며 기온이 0.3℃ 내려갑니다.", condition: "추가 조건 없음" },
  { id: "usa", name: "미국", gp: 18, ability: "CCS 기술", effect: "해당 턴 퀴즈를 맞히면 기온이 0.5℃ 내려갑니다. 4턴에는 교사와의 가위바위보에서 이겨야 합니다.", condition: "추가 조건 없음" },
  { id: "swe", name: "스웨덴", gp: 20, ability: "인간 환경 선언", effect: "해당 턴에 모든 국가가 환경 우선 개발을 선택하면 기온이 추가로 0.4℃ 내려갑니다.", condition: "추가 조건 없음" },
  { id: "jpn", name: "일본", gp: 18, ability: "교토의정서", effect: "직전 턴에 경제 우선 개발을 선택한 국가가 이번 턴에 환경 우선 개발만 선택하도록 합니다.", condition: "기온 17.0℃ 이상" },
  { id: "tuv", name: "투발루", gp: 8, ability: "가라앉는 섬", effect: "다른 국가가 투발루에 GP 10을 주면 기온이 0.4℃ 내려갑니다. 모두 거부하면 효과가 없습니다.", condition: "기온 18.0℃ 이상" },
  { id: "dnk", name: "덴마크", gp: 20, ability: "코펜하겐 기후협약", effect: "GP 상위 3개국이 이번 턴부터 2턴 동안 환경 우선 개발만 선택하도록 합니다. 공동 3위도 포함합니다.", condition: "기온 17.0℃ 이상" },
];

export default function StudentGuide({
  turn,
  phaseIndex,
  stage,
  myCountryId,
}: {
  turn: number;
  phaseIndex: number;
  stage: RoomStage;
  myCountryId: CountryId | null;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"order" | "countries">("order");

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 rounded-full border border-sky-400/50 bg-sky-700 px-5 py-3 font-bold text-white shadow-xl hover:bg-sky-600"
      >
        게임 안내
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section role="dialog" aria-modal="true" aria-label="게임 안내" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-800 p-4">
              <div>
                <h1 className="text-2xl font-black">게임 안내</h1>
                <p className="text-sm text-slate-400">전체 순서와 국가별 능력을 확인할 수 있습니다.</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg bg-slate-800 px-4 py-2 font-bold hover:bg-slate-700">닫기</button>
            </header>
            <div className="grid grid-cols-2 border-b border-slate-800">
              <button onClick={() => setTab("order")} className={`min-h-[52px] font-bold ${tab === "order" ? "bg-sky-700 text-white" : "bg-slate-900 text-slate-400"}`}>전체 게임 순서</button>
              <button onClick={() => setTab("countries")} className={`min-h-[52px] font-bold ${tab === "countries" ? "bg-sky-700 text-white" : "bg-slate-900 text-slate-400"}`}>국가 정보</button>
            </div>
            <div className="overflow-y-auto p-4 sm:p-6">
              {tab === "order" ? <GameOrder turn={turn} phaseIndex={phaseIndex} stage={stage} /> : <CountryGuide myCountryId={myCountryId} />}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function GameOrder({ turn, phaseIndex, stage }: { turn: number; phaseIndex: number; stage: RoomStage }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">{[1, 2, 3, 4].map((item) => <TurnBlock key={item} item={item} turn={turn} phaseIndex={phaseIndex} stage={stage} />)}</div>
        <div className="space-y-3">{[5, 6, 7, 8].map((item) => <TurnBlock key={item} item={item} turn={turn} phaseIndex={phaseIndex} stage={stage} />)}</div>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-slate-900 p-4"><b>개발 선택 GP</b><p className="mt-2 text-slate-300">경제 우선 +10 · 균형 개발 +8 · 환경 우선 +5</p></div>
        <div className="rounded-xl bg-slate-900 p-4"><b>특수 능력</b><p className="mt-2 text-slate-300">대표 회의에서만 사용 · GP 5 비용 · 국가당 1회</p></div>
        <div className="rounded-xl bg-slate-900 p-4"><b>퀴즈</b><p className="mt-2 text-slate-300">정답이면 기온 유지 · 오답이면 기온 +0.1℃</p></div>
        <div className="rounded-xl bg-slate-900 p-4"><b>게임 종료와 자원 배분</b><p className="mt-2 text-slate-300">20.0℃에 도달하면 즉시 종료 · 생존 시 최종 GP 비율로 과자 32개 배분</p></div>
      </div>
    </div>
  );
}

function TurnBlock({ item, turn, phaseIndex, stage }: { item: number; turn: number; phaseIndex: number; stage: RoomStage }) {
  const phases = getPhaseSequence(item);
  return (
    <div className="grid grid-cols-[72px_1fr] overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
      <div className={`flex items-center justify-center text-xl font-black ${item === turn && stage === "playing" ? "bg-sky-900" : item < turn ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>{item}턴</div>
      <div className="divide-y divide-slate-700">
        {phases.map((phase, index) => <PhaseRow key={phase} phase={phase} status={stage !== "playing" || item > turn || (item === turn && index > phaseIndex) ? "future" : item < turn || (item === turn && index < phaseIndex) ? "done" : "current"} />)}
      </div>
    </div>
  );
}

function PhaseRow({ phase, status }: { phase: Phase; status: "done" | "current" | "future" }) {
  const special = phase === "quiz" ? "bg-yellow-300 text-slate-950" : phase === "un_conference" || phase === "resource_distribution" ? "bg-orange-400 text-slate-950" : "";
  return <div className={`relative px-4 py-2 text-center font-bold ${special} ${status === "done" ? "opacity-55" : status === "future" ? "text-slate-400" : "z-10 animate-pulse ring-4 ring-inset ring-red-500"}`}><span>{PHASE_LABEL[phase]}</span>{status === "done" && <span className="ml-2 text-xs">✓</span>}</div>;
}

function CountryGuide({ myCountryId }: { myCountryId: CountryId | null }) {
  return (
    <div>
      <p className="mb-4 rounded-lg bg-slate-900 p-3 text-sm text-slate-300">공통 규칙: 대표 회의에서만 사용하며, GP 5를 지불하고 국가당 한 번만 사용할 수 있습니다.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {COUNTRY_GUIDE.map((country) => (
          <article key={country.id} className={`rounded-xl border p-4 ${country.id === myCountryId ? "border-sky-400 bg-sky-950/50 ring-2 ring-sky-500/30" : "border-slate-700 bg-slate-900"}`}>
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{country.name}</h2><p className="text-sm text-sky-300">{country.ability}</p></div><div className="rounded-lg bg-slate-800 px-3 py-2 text-center"><div className="text-xs text-slate-400">시작 GP</div><div className="text-xl font-black">{country.gp}</div></div></div>
            {country.id === myCountryId && <p className="mt-2 text-xs font-bold text-sky-300">현재 우리 조의 국가</p>}
            <p className="mt-3 text-sm leading-relaxed text-slate-200">{country.effect}</p>
            <p className="mt-3 text-xs text-amber-300">사용 조건: {country.condition}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
