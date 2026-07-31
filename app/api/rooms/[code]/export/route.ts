import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/serverClient";
import { isRowNotFound } from "@/lib/supabase/errors";

/**
 * 방 상태를 통째로 내보낸다 (SPEC.md 9-3: 노트북이 꺼져도 복구).
 *
 * 여기서만 검열되지 않은 원본 상태가 나간다. 공개 전 개발선택과 팀 토큰이 들어 있으므로
 * 반드시 교사 기기 토큰을 확인한다.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const hostToken = new URL(req.url).searchParams.get("hostToken");

  const { data, error } = await supabaseServer
    .from("rooms")
    .select("state, host_token")
    .eq("code", roomCode)
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

  if (data.host_token && hostToken !== data.host_token) {
    return NextResponse.json({ error: "교사 기기에서만 내보낼 수 있습니다." }, { status: 403 });
  }

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    code: roomCode,
    // 다른 노트북에서 복구할 때 교사 권한까지 되찾을 수 있도록 함께 담는다.
    hostToken: data.host_token,
    state: data.state,
  });
}
