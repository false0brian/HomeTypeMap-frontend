# Repo Sync Policy (Frontend)

## 목적
- frontend 단독 저장소와 기존 모노레포 간 변경 충돌 최소화

## 원칙
- UI/UX, 프론트 상태 관리, 번들/배포 관련 변경은 frontend repo가 source of truth
- 백엔드 API 스펙 변경은 backend repo의 `docs/api-contract.md`를 기준으로 수용

## 운영 규칙
1. API 계약 변경 시
- backend PR 머지 후 frontend에서 타입/호출부 업데이트
- PR 설명에 backend commit hash 링크 첨부

2. 공통 문서 변경 시
- frontend는 `docs/repo-sync-policy.md`와 사용자 가이드만 유지
- API 계약 전문은 backend repo를 참조 링크로 유지

3. 릴리스 태그
- frontend 태그 예시: `frontend-v1.2.0`

## 예외
- 긴급 장애 대응은 frontend hotfix 우선, 이후 backend와 계약 일치 재검증
