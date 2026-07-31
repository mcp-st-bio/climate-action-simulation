# 기후변화로부터 지구를 지켜라!

교실에서 6개 조가 8턴 동안 진행하는 기후 협상 보드게임의 진행·계산·타이머·집계를 자동화하는 실시간 웹앱.
규칙과 수치는 [SPEC.md](SPEC.md)를 따릅니다.

## 화면

| 화면 | 경로 | 기기 |
|---|---|---|
| 학생 접속 | `/` | 조별 태블릿 6대 |
| 교사 첫 화면 | `/teacher` | 교사 노트북 |
| 교사 콘솔 | `/host/[방코드]` | 교사 노트북 |
| 관전 화면 | `/board/[방코드]` | 프로젝터·전자칠판 |
| 팀 화면 | `/play/[방코드]` | 조별 태블릿 |

학생이 긴 주소를 입력해야 하므로 학생 접속 화면을 루트에 두었습니다.

## 수업 진행 순서

1. 교사가 `/teacher`에서 **새 방 만들기** → 6자리 방 코드 발급
2. 프로젝터에 **관전 화면**을 띄우면 방 코드가 크게 표시됨
3. 학생들이 태블릿에서 방 코드 입력 → 대기 화면
4. 6대가 모두 접속하면 관전 화면이 대시보드로 전환
5. 교사가 **국가 선택 시작** → 5초 카운트다운 후 선착순으로 국가 선택
6. 6개국이 정해지면 1턴 자동 시작

방을 만든 기기가 교사 기기로 등록됩니다. 수동 보정·되돌리기·상태 저장은 이 기기에서만 됩니다.

## 로컬 실행

```bash
npm install
npm run dev
```

`.env.local.example`을 `.env.local`로 복사하고 Supabase 값을 채웁니다.

```bash
npm test        # 규칙·상태 단위 테스트
npm run build   # 프로덕션 빌드
```

## Supabase 준비

1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에서 [supabase/schema.sql](supabase/schema.sql) 실행
3. Project Settings → API에서 세 값을 `.env.local`에 입력

`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 비밀 키입니다. `NEXT_PUBLIC_` 접두사를 붙이면
클라이언트로 노출되어 누구나 게임 상태를 조작할 수 있게 되니 절대 붙이지 마세요.

## Vercel 배포

1. 이 저장소를 GitHub에 푸시
2. [vercel.com](https://vercel.com)에서 **Add New → Project** → 저장소 선택
3. **Environment Variables**에 세 개를 등록 (빌드 전에 등록해야 합니다)

| 이름 | 값 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |

4. **Deploy**

배포하면 고정 주소가 생겨 교실에서 노트북 IP·방화벽·절전 문제 없이 쓸 수 있습니다.

## 수업 자료 교체

아래 두 파일은 실제 수업 자료 문구로 바꿔야 합니다.

- [data/quiz.json](data/quiz.json) — 기후변화 퀴즈 5문항 (1·2·3·5·6턴)
- [data/earthStates.json](data/earthStates.json) — 기온 구간별 환경 변화 설명문

## 구조

```
lib/rules.ts         게임 규칙 순수 함수 (기온 구간, 능력 조건, 배분 계산)
lib/roomReducer.ts   방 상태 변경의 유일한 지점 (서버에서만 실행)
lib/publicState.ts   클라이언트로 내보내기 전 검열 (비밀 제출 보장)
app/api/rooms/       방 생성·조회·액션·내보내기 라우트
```

상태 변경은 전부 서버에서 처리합니다. 클라이언트가 GP를 계산하면 태블릿에서 조작할 수 있기 때문입니다.
공개 전 개발선택은 서버에서 잘라내므로, 태블릿에서 응답을 열어봐도 다른 조의 선택을 볼 수 없습니다.
