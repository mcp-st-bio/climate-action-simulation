import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/serverClient";
import { createInitialRoomState, generateRoomCode } from "@/lib/roomState";
import { toPublicState } from "@/lib/publicState";

/** 새 방을 만든다. 코드 충돌 시 몇 번 재시도한다 (6자리 코드 공간이 넓어 거의 발생하지 않는다). */
export async function POST() {
  const state = createInitialRoomState();
  // 방 코드는 학생에게 공개되므로, 교사 전용 조작을 가르는 별도의 비밀값을 함께 발급한다.
  const hostToken = crypto.randomUUID();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const { error } = await supabaseServer
      .from("rooms")
      .insert({ code, state, host_token: hostToken });

    if (!error) {
      // hostToken은 이 응답에서만 나간다. 교사 기기가 받아 보관한다.
      return NextResponse.json({ code, hostToken, state: toPublicState(state) });
    }
    // unique_violation(23505)이 아니면 재시도해도 소용없는 오류이므로 바로 중단한다.
    if (error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "방 코드 생성에 반복 실패했습니다." }, { status: 500 });
}
