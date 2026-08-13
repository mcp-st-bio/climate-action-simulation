import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/serverClient";
import { toPublicState } from "@/lib/publicState";
import { isRowNotFound } from "@/lib/supabase/errors";

/**
 * 방 상태 조회. 항상 검열된 상태를 돌려준다 (lib/publicState.ts 참고).
 * 팀 화면은 ?token=... 으로 자기 국가와 자기 선택을 되돌려받아 새로고침 후에도 복구된다.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? undefined;
  const hostToken = new URL(req.url).searchParams.get("hostToken") ?? undefined;

  const { data, error } = await supabaseServer
    .from("rooms")
    .select("state, previous_state, host_token")
    .eq("code", code.toUpperCase())
    .single();

  if (error || !data) {
    if (isRowNotFound(error)) {
      return NextResponse.json({ error: "방을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json(
      { error: `방 상태를 읽지 못했습니다: ${error?.message ?? "알 수 없는 오류"}` },
      { status: 500 }
    );
  }

  const publicState = toPublicState(data.state, { teamToken: token });
  // 본인 국가를 알아낸 뒤 자기 선택까지 포함해 다시 검열한다.
  const withOwnChoice = toPublicState(data.state, {
    teamToken: token,
    countryId: publicState.myCountryId ?? undefined,
  });

  // 새로고침 후에도 되돌리기가 살아 있어야 하므로 스냅샷 유무를 함께 알린다.
  // serverNow는 태블릿 시계가 틀어져 있어도 카운트다운이 맞도록 보정하는 데 쓴다.
  return NextResponse.json({
    state: withOwnChoice,
    canUndo: data.previous_state !== null,
    isHost: typeof data.host_token === "string" && hostToken === data.host_token,
    serverNow: Date.now(),
  });
}
