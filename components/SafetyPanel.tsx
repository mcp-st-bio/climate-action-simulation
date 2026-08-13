"use client";

import { useRef, useState } from "react";
import { PublicRoomState } from "@/lib/publicState";
import type { RoomAction } from "@/lib/roomReducer";
import { RoomState } from "@/lib/roomState";
import { PHASE_LABEL } from "@/lib/labels";
import { CountryId, getPhaseSequence, toDisplayTemp } from "@/lib/rules";

type Dispatch = (action: RoomAction) => void | Promise<void>;

/** 교사용 안전장치 (SPEC.md 9절). 수업 중 사고를 복구하는 마지막 수단. */
export default function SafetyPanel({
  code,
  state,
  dispatch,
  canUndo,
  hostToken,
  onHostTokenChange,
}: {
  code: string;
  state: PublicRoomState;
  dispatch: Dispatch;
  canUndo: boolean;
  hostToken: string | undefined;
  onHostTokenChange: (token: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportState() {
    setBusy("export");
    setNote(null);
    try {
      const res = await fetch(`/api/rooms/${code}/export?hostToken=${encodeURIComponent(hostToken ?? "")}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setNote(body?.error ?? "내보내기에 실패했습니다.");
        return;
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `climate-${code}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNote("저장했습니다. 이 파일이 있으면 노트북이 꺼져도 복구할 수 있습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function importState(file: File) {
    setBusy("import");
    setNote(null);
    try {
      const parsed = JSON.parse(await file.text());
      const imported: RoomState | undefined = parsed?.state;
      if (!imported || !Array.isArray(imported.countries) || imported.countries.length !== 6) {
        setNote("이 파일은 이 게임의 저장 파일이 아닙니다.");
        return;
      }
      // 다른 노트북에서 이어받는 경우, 파일에 담긴 교사 토큰으로 권한을 회복한다.
      if (parsed.hostToken && parsed.hostToken !== hostToken) {
        onHostTokenChange(parsed.hostToken);
      }
      if (!confirm("저장된 상태로 되돌립니다. 현재 진행 상황은 사라집니다. 계속할까요?")) return;
      await dispatch({ type: "IMPORT_STATE", state: imported });
      setNote("복원했습니다.");
    } catch {
      setNote("파일을 읽지 못했습니다.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-lg font-bold text-amber-200">교사용 안전장치</h2>
        <span className="text-sm text-amber-300/70">{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          {!hostToken && (
            <HostTokenPrompt onSubmit={onHostTokenChange} />
          )}

          <Row title="되돌리기" desc="직전 1개 작업만 취소합니다. 태블릿 제출·요청은 취소 대상이 아닙니다.">
            <button
              disabled={!canUndo}
              onClick={() => dispatch({ type: "UNDO" })}
              className="rounded bg-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-600 disabled:opacity-40"
            >
              직전 작업 취소
            </button>
            {!canUndo && <span className="text-xs text-slate-500">되돌릴 작업이 없습니다.</span>}
          </Row>

          <Row title="상태 저장 / 복원" desc="노트북이 꺼져도 이 파일로 복구할 수 있습니다. 교사 권한도 파일에 함께 담깁니다.">
            <button
              onClick={exportState}
              disabled={busy === "export"}
              className="rounded bg-emerald-800 px-4 py-2 text-sm font-bold hover:bg-emerald-700 disabled:opacity-40"
            >
              JSON으로 저장
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importState(f);
              }}
              className="text-sm text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:font-bold file:text-slate-100"
            />
          </Row>

          <Row title="수동 보정 — GP" desc="조가 실수로 잘못 제출했거나 계산을 손으로 고쳐야 할 때 씁니다.">
            <GpEditor state={state} dispatch={dispatch} />
          </Row>

          <Row title="수동 보정 — 기온" desc="0.1도 단위로 직접 지정합니다.">
            <TempEditor state={state} dispatch={dispatch} />
          </Row>

          <Row title="강제 페이즈 이동" desc="타이머와 순서를 무시하고 원하는 턴·페이즈로 건너뜁니다.">
            <PhaseJumper state={state} dispatch={dispatch} />
          </Row>

          {note && <p className="text-sm text-amber-200">{note}</p>}
        </div>
      )}
    </section>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-amber-900/40 pt-4">
      <h3 className="font-bold">{title}</h3>
      <p className="mb-2 text-xs text-slate-400">{desc}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function HostTokenPrompt({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="rounded-lg bg-red-950/60 p-3">
      <p className="text-sm font-bold text-red-200">이 기기는 교사 기기로 등록되어 있지 않습니다.</p>
      <p className="mt-1 text-xs text-red-300/80">
        수동 보정·되돌리기·저장은 방을 만든 기기에서만 됩니다. 다른 노트북에서 이어받으려면
        저장해 둔 JSON 파일 안의 hostToken 값을 넣으세요.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="hostToken"
          className="flex-1 rounded bg-slate-800 px-2 py-1 text-sm"
        />
        <button
          onClick={() => value.trim() && onSubmit(value.trim())}
          className="rounded bg-slate-700 px-3 py-1 text-sm font-bold hover:bg-slate-600"
        >
          등록
        </button>
      </div>
    </div>
  );
}

function GpEditor({ state, dispatch }: { state: PublicRoomState; dispatch: Dispatch }) {
  const [countryId, setCountryId] = useState<CountryId>(state.countries[0].id);
  const current = state.countries.find((c) => c.id === countryId)!;
  const [gp, setGp] = useState(String(current.gp));

  return (
    <>
      <select
        className="rounded bg-slate-800 px-2 py-2 text-sm"
        value={countryId}
        onChange={(e) => {
          const id = e.target.value as CountryId;
          setCountryId(id);
          setGp(String(state.countries.find((c) => c.id === id)!.gp));
        }}
      >
        {state.countries.map((c) => (
          <option key={c.id} value={c.id}>{c.name} (현재 {c.gp})</option>
        ))}
      </select>
      <input
        type="number"
        value={gp}
        onChange={(e) => setGp(e.target.value)}
        className="w-24 rounded bg-slate-800 px-2 py-2 text-sm"
      />
      <button
        onClick={() => dispatch({ type: "SET_GP", countryId, gp: Number(gp) })}
        className="rounded bg-amber-800 px-4 py-2 text-sm font-bold hover:bg-amber-700"
      >
        적용
      </button>
    </>
  );
}

function TempEditor({ state, dispatch }: { state: PublicRoomState; dispatch: Dispatch }) {
  const [temp, setTemp] = useState(toDisplayTemp(state.temperatureDeci).toFixed(1));
  return (
    <>
      <input
        type="number"
        step="0.1"
        value={temp}
        onChange={(e) => setTemp(e.target.value)}
        className="w-28 rounded bg-slate-800 px-2 py-2 text-sm"
      />
      <span className="text-sm text-slate-400">도 (현재 {toDisplayTemp(state.temperatureDeci).toFixed(1)})</span>
      <button
        onClick={() => dispatch({ type: "SET_TEMPERATURE", tempDeci: Math.round(Number(temp) * 10) })}
        className="rounded bg-amber-800 px-4 py-2 text-sm font-bold hover:bg-amber-700"
      >
        적용
      </button>
    </>
  );
}

function PhaseJumper({ state, dispatch }: { state: PublicRoomState; dispatch: Dispatch }) {
  const [turn, setTurn] = useState(state.turn);
  const [phaseIndex, setPhaseIndex] = useState(state.phaseIndex);
  const seq = getPhaseSequence(turn);
  const safeIndex = Math.min(phaseIndex, seq.length - 1);

  return (
    <>
      <select
        className="rounded bg-slate-800 px-2 py-2 text-sm"
        value={turn}
        onChange={(e) => {
          setTurn(Number(e.target.value));
          setPhaseIndex(0);
        }}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => (
          <option key={t} value={t}>{t}턴</option>
        ))}
      </select>
      <select
        className="rounded bg-slate-800 px-2 py-2 text-sm"
        value={safeIndex}
        onChange={(e) => setPhaseIndex(Number(e.target.value))}
      >
        {seq.map((p, i) => (
          <option key={p} value={i}>{PHASE_LABEL[p]}</option>
        ))}
      </select>
      <button
        onClick={() => dispatch({ type: "JUMP_PHASE", turn, phaseIndex: safeIndex })}
        className="rounded bg-amber-800 px-4 py-2 text-sm font-bold hover:bg-amber-700"
      >
        이동
      </button>
    </>
  );
}
