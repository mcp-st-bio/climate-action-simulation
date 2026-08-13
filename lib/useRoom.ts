"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { PublicRoomState } from "@/lib/publicState";
import type { RoomAction } from "@/lib/roomReducer";

/**
 * 방 상태 구독 훅. 세 화면(host/board/play)이 공유한다.
 *
 * SPEC.md 1절: 서버 상태가 진실의 원천이고 클라이언트는 항상 서버 상태를 다시 그린다.
 * 그래서 broadcast 수신뿐 아니라 재연결·탭 복귀·온라인 복구 시에도 전체 상태를 다시 읽는다.
 */
export function useRoom(code: string, teamToken?: string, hostToken?: string) {
  const [state, setState] = useState<PublicRoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [isHost, setIsHost] = useState<boolean | null>(null);
  // 태블릿 시계가 서버와 어긋나 있어도 카운트다운이 맞도록 보정값을 둔다.
  const [clockOffset, setClockOffset] = useState(0);
  const tokenRef = useRef(teamToken);
  tokenRef.current = teamToken;
  const hostRef = useRef(hostToken);
  hostRef.current = hostToken;

  const refetch = useCallback(async () => {
    const params = new URLSearchParams();
    if (tokenRef.current) params.set("token", tokenRef.current);
    if (hostRef.current) params.set("hostToken", hostRef.current);
    const qs = params.size > 0 ? `?${params.toString()}` : "";
    try {
      const res = await fetch(`/api/rooms/${code}${qs}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const { state: next, canUndo: undoable, isHost: verifiedHost, serverNow } = await res.json();
      setState(next);
      setCanUndo(!!undoable);
      setIsHost(!!verifiedHost);
      if (typeof serverNow === "number") setClockOffset(serverNow - Date.now());
      setError(null);
    } catch {
      setError("서버와 연결하지 못했습니다. 다시 시도 중...");
    }
  }, [code]);

  const dispatch = useCallback(
    async (action: RoomAction) => {
      try {
        const res = await fetch(`/api/rooms/${code}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...action,
            // 승인/거절 액션의 teamToken은 대상 태블릿이다. 교사 화면에는
            // 본인 팀 토큰이 없으므로 undefined로 덮어쓰지 않는다.
            teamToken: "teamToken" in action ? action.teamToken : tokenRef.current,
            hostToken: hostRef.current,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "요청이 처리되지 않았습니다. 다시 시도해주세요.");
          await refetch();
          return;
        }
        const { state: next, canUndo: undoable, serverNow } = await res.json();
        setState(next);
        setCanUndo(!!undoable);
        if (typeof serverNow === "number") setClockOffset(serverNow - Date.now());
        setError(null);
      } catch {
        setError("서버와 연결하지 못했습니다.");
      }
    },
    [code, refetch]
  );

  useEffect(() => {
    refetch();
  }, [refetch, hostToken]);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`room-${code}`)
      .on("broadcast", { event: "state" }, ({ payload }) => {
        if (tokenRef.current || hostRef.current) {
          void refetch();
          return;
        }
        setState((prev) => {
          const next = payload as PublicRoomState;
          // broadcast는 검열된 공용 상태라 내 선택이 비어 있다.
          // 공개 전이라면 로컬에 있던 내 선택을 유지한다.
          if (!next.revealed && prev?.myCountryId) {
            const mine = prev.devChoices[prev.myCountryId];
            if (mine && next.devChoices[prev.myCountryId] === undefined) {
              return {
                ...next,
                myCountryId: prev.myCountryId,
                devChoices: { ...next.devChoices, [prev.myCountryId]: mine },
              };
            }
          }
          return { ...next, myCountryId: prev?.myCountryId ?? next.myCountryId };
        });
      })
      .subscribe((status) => {
        // 끊겼다 다시 붙으면 그동안 놓친 변경이 있으므로 전체를 다시 읽는다.
        if (status === "SUBSCRIBED") refetch();
      });

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [code, refetch]);

  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("online", refetch);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("online", refetch);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [refetch]);

  return { state, error, notFound, canUndo, isHost, clockOffset, dispatch, refetch, setError };
}

/**
 * 교사 기기 토큰. 방을 만든 브라우저에만 저장되며, 다른 노트북에서 이어받으려면
 * 내보낸 JSON에 들어 있는 값을 직접 입력한다 (SPEC.md 9-3).
 */
export function useHostToken(code: string): {
  hostToken: string | undefined;
  setHostToken: (token: string) => void;
  loaded: boolean;
} {
  const [hostToken, setToken] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem(`climate-host-${code}`) ?? undefined);
    setLoaded(true);
  }, [code]);

  const setHostToken = useCallback(
    (token: string) => {
      localStorage.setItem(`climate-host-${code}`, token);
      setToken(token);
    },
    [code]
  );

  return { hostToken, setHostToken, loaded };
}

/** 팀 토큰을 방별로 localStorage에 보관한다. 태블릿이 끊겨도 같은 국가로 재입장한다 (SPEC.md 9-5). */
export function useTeamToken(code: string): string | undefined {
  const [token, setToken] = useState<string>();

  useEffect(() => {
    const key = `climate-team-${code}`;
    let existing = localStorage.getItem(key);
    if (!existing) {
      existing =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, existing);
    }
    setToken(existing);
  }, [code]);

  return token;
}
