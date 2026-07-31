-- SPEC.md 10절: 방 상태는 단일 rooms 레코드의 JSONB 컬럼에 통째로 저장한다.
-- Supabase SQL Editor에서 그대로 실행하세요.

create table if not exists rooms (
  code text primary key,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 낙관적 잠금용. 6대의 태블릿이 동시에 제출할 때 read-modify-write 경합으로
-- 선택이 유실되는 것을 막는다. 액션 라우트가 version 일치를 조건으로 갱신한다.
alter table rooms add column if not exists version integer not null default 0;

-- 되돌리기(SPEC.md 9-2)용 직전 상태 스냅샷. 1단계만 보관한다.
alter table rooms add column if not exists previous_state jsonb;

-- 교사 기기 토큰. 방 코드는 학생에게 공개되므로, 수동 보정·되돌리기·상태 내보내기처럼
-- 판을 바꾸거나 비밀 제출을 열람하는 조작은 이 토큰을 가진 기기만 할 수 있다.
alter table rooms add column if not exists host_token text;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists rooms_set_updated_at on rooms;
create trigger rooms_set_updated_at
  before update on rooms
  for each row
  execute function set_updated_at();

alter table rooms enable row level security;

-- 로그인 없이 방 코드만으로 입장하는 구조이므로, 읽기는 누구나(anon) 허용한다.
-- 쓰기는 정책을 두지 않아 anon 키로는 불가능하며, 서버(Route Handler)의
-- service_role 키만 RLS를 우회해 상태를 변경할 수 있다.
drop policy if exists "rooms are publicly readable" on rooms;
create policy "rooms are publicly readable"
  on rooms for select
  using (true);
