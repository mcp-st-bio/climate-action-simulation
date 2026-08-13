-- 기존 Supabase 프로젝트에 1회 실행한다.
-- rooms 원본에는 host_token, claims, previous_state가 포함되므로 공개 읽기를 차단한다.
drop policy if exists "rooms are publicly readable" on public.rooms;
revoke select on table public.rooms from anon, authenticated;
