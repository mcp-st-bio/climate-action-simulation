import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/serverClient";
import { broadcastRoomState } from "@/lib/supabase/broadcast";
import {
  applyRoomAction,
  HOST_ONLY_ACTIONS,
  UNDOABLE_ACTIONS,
  RoomAction,
} from "@/lib/roomReducer";
import { toPublicState } from "@/lib/publicState";
import { RoomState } from "@/lib/roomState";
import { isRowNotFound } from "@/lib/supabase/errors";

const MAX_RETRIES = 5;

/**
 * 방 상태를 바꾸는 유일한 진입점. 클라이언트는 액션만 보내고,
 * 실제 GP/기온 계산은 전부 서버(lib/roomReducer.ts)에서 처리한다 (SPEC.md 10절).
 *
 * 6대의 태블릿이 동시에 제출하면 read-modify-write 경합으로 선택이 유실되므로,
 * version 컬럼으로 낙관적 잠금을 걸고 충돌 시 최신 상태로 다시 계산해 재시도한다.
 */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const action = (await req.json()) as RoomAction & { teamToken?: string; hostToken?: string };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data, error: fetchError } = await supabaseServer
      .from("rooms")
      .select("state, version, previous_state, host_token")
      .eq("code", roomCode)
      .single();

    if (fetchError || !data) {
      if (isRowNotFound(fetchError)) {
        return NextResponse.json({ error: "방을 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json(
        { error: `방 상태를 읽지 못했습니다: ${fetchError?.message ?? "알 수 없는 오류"}` },
        { status: 500 }
      );
    }

    // 판을 바꾸는 조작은 교사 기기만. host_token이 없는 방은 이 기능 도입 이전에
    // 만들어진 방이므로 그대로 허용한다.
    const currentState = data.state as RoomState;
    const hasHostAuthority =
      typeof data.host_token === "string" &&
      data.host_token.length > 0 &&
      action.hostToken === data.host_token;

    // 방 코드와 교사용 주소는 공개될 수 있으므로, 판을 진행하는 조작은 비밀 토큰으로 검증한다.
    if (HOST_ONLY_ACTIONS.has(action.type) && !hasHostAuthority) {
      return NextResponse.json(
        { error: "교사 기기에서만 할 수 있는 조작입니다." },
        { status: 403 }
      );
    }

    if (action.type === "JOIN_ROOM") {
      return NextResponse.json(
        { error: "조 이름을 입력하고 교사 승인을 요청해 주세요." },
        { status: 410 }
      );
    }

    if (
      action.type === "CLAIM_COUNTRY" &&
      !currentState.connectedTeams.includes(action.teamToken)
    ) {
      return NextResponse.json(
        { error: "교사 승인을 받은 태블릿만 국가를 선택할 수 있습니다." },
        { status: 403 }
      );
    }

    // 학생은 자신의 팀 토큰으로 점유한 국가만 선택하거나 능력을 요청할 수 있다.
    if (
      (action.type === "SET_DEV_CHOICE" || action.type === "REQUEST_ABILITY") &&
      !hasHostAuthority
    ) {
      const teamToken = action.teamToken;
      if (!teamToken || currentState.claims[action.countryId] !== teamToken) {
        return NextResponse.json(
          { error: "자신이 선택한 국가만 조작할 수 있습니다." },
          { status: 403 }
        );
      }
    }

    let nextState: RoomState;
    let nextPrevious: RoomState | null;

    if (action.type === "UNDO") {
      if (!data.previous_state) {
        return NextResponse.json({ error: "되돌릴 작업이 없습니다." }, { status: 400 });
      }
      const snapshot = data.previous_state as RoomState;
      // 국가 선점은 게임 규칙이 아니라 좌석 배치에 가깝다. 되돌리기 때문에 6개 조가
      // 나라를 다시 고르는 일이 없도록, 현재 선점 상태는 그대로 이어받는다.
      nextState = { ...snapshot, claims: currentState.claims };
      nextPrevious = null; // 되돌리기는 1단계만 (SPEC.md 9-2)
    } else {
      nextState = applyRoomAction(currentState, action);
      // 상태가 실제로 바뀐 경우에만 스냅샷을 남긴다.
      nextPrevious =
        UNDOABLE_ACTIONS.has(action.type) && nextState !== currentState
          ? currentState
          : (data.previous_state as RoomState | null);
    }

    // 조건부 갱신: 읽은 이후 다른 요청이 먼저 반영됐다면 0행이 갱신된다.
    const { data: updated, error: updateError } = await supabaseServer
      .from("rooms")
      .update({ state: nextState, previous_state: nextPrevious, version: data.version + 1 })
      .eq("code", roomCode)
      .eq("version", data.version)
      .select("version");

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (updated && updated.length > 0) {
      const publicState = toPublicState(nextState, { teamToken: action.teamToken, isHost: hasHostAuthority });
      await broadcastRoomState(roomCode, toPublicState(nextState));
      return NextResponse.json({
        state: toPublicState(nextState, {
          teamToken: action.teamToken,
          countryId: publicState.myCountryId ?? undefined,
          isHost: hasHostAuthority,
        }),
        canUndo: nextPrevious !== null,
        serverNow: Date.now(),
      });
    }
    // 충돌 → 루프를 돌며 최신 상태로 다시 계산한다.
  }

  return NextResponse.json(
    { error: "동시 요청이 몰려 처리하지 못했습니다. 다시 시도해주세요." },
    { status: 409 }
  );
}
