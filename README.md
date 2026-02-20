# HomeTypeMap Frontend

HomeTypeMap 사용자/관리자 웹 프론트엔드 저장소입니다.
React + Vite + TypeScript + Leaflet 기반입니다.

## Run
```bash
cp .env.example .env
npm install
npm run dev
```

기본 주소:
- 사용자: `http://127.0.0.1:5173`
- 관리자: `http://127.0.0.1:5173/admin`

## Env
- `VITE_API_BASE` (기본: `/api/v1`)
- `VITE_ADMIN_API_KEY` (선택)

## Build
```bash
npm run build
```

## Key Files
- `src/App.tsx`: 사용자 앱
- `src/AdminApp.tsx`: 관리자 콘솔
- `src/api.ts`: API 클라이언트
- `src/types.ts`: DTO 타입
- `src/styles.css`: 디자인 시스템/컴포넌트 스타일

## Sync Policy
- 모노레포/백엔드 저장소와 동기화 규칙은 `docs/repo-sync-policy.md` 참고
