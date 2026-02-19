# HomeTypeMap React Frontend

FastAPI 백엔드와 연동되는 React(Vite+TypeScript) 프론트입니다.
지도는 Leaflet + OpenStreetMap 타일을 사용하며 API 키가 필요 없습니다.

## 실행 (로컬)
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

환경 변수:
- `VITE_API_BASE` (기본: `/api/v1`)
- `VITE_ADMIN_API_KEY` (선택: 관리자 콘솔 기본 키)

기본값은 Vite proxy로 백엔드 `http://127.0.0.1:8000`에 연결됩니다.

## 실행 (Docker)
루트에서:
```bash
docker compose up --build
```

접속:
- 프론트: `http://127.0.0.1:5173`
- 백엔드 Swagger: `http://127.0.0.1:8000/docs`

## 사용성 개선 반영
- `window.prompt` 제거: 상단 `user_key` 입력 필드로 통일
- 필터 즉시 반영 제거: `필터 적용` 버튼으로 쿼리 트리거
- `필터 초기화` 버튼 제공
- 상태 문구(`status`)를 상단 바에 고정 노출

## 파일
- `src/App.tsx`: 지도/시트 UI, 상태관리, 액션
- `src/AdminApp.tsx`: 관리자 콘솔(`/admin`) UI
- `src/api.ts`: API 클라이언트
- `src/types.ts`: DTO 타입
- `src/styles.css`: UI 스타일

## 관리자 콘솔
- URL: `http://127.0.0.1:5173/admin`
- 요청 헤더: `X-Admin-Key`
