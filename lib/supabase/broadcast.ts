import { PublicRoomState } from "@/lib/publicState";

export function roomChannelName(code: string): string {
  return `room-${code}`;
}

/**
 * 상태 변경 후 같은 방을 구독 중인 모든 클라이언트에게 새 상태를 밀어준다.
 *
 * 서버에서는 웹소켓 채널을 열지 않고 Realtime의 HTTP broadcast 엔드포인트를 쓴다.
 * 채널을 열면 동시 요청마다 같은 토픽의 채널이 중복 생성되면서 두 번째부터
 * SUBSCRIBED 콜백이 오지 않아 요청이 그대로 멈춘다 (6대가 동시에 제출하는 상황).
 *
 * 한 채널을 교사·관전·팀이 함께 듣기 때문에 반드시 검열된 상태만 내보낸다.
 */
export async function broadcastRoomState(code: string, state: PublicRoomState): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // 브로드캐스트는 최선 노력(best-effort)이다. 상태는 이미 DB에 저장됐고,
  // 클라이언트는 재연결·탭 복귀 시 전체를 다시 읽으므로 여기서 실패해도 복구된다.
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic: roomChannelName(code), event: "state", payload: state }],
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.error(`[broadcast] ${code} 실패: HTTP ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error(`[broadcast] ${code} 실패:`, err);
  }
}
