# /src/debug/AGM_LEGACY_IMPORT_MAP.md

AGM 중복/레거시 파일 점검표입니다.  
기존 파일을 삭제하지 않고, 실제 라우트에서 사용하는 파일과 보존용 파일을 구분하기 위한 문서입니다.

## 현재 앱 진입 기준

- 실제 엔트리: `/src/index.js`
- 실제 라우터: `/src/AppRouter.jsx`
- 운영자 앱: `/src/AdminApp.jsx`
- 참가자 앱: `/src/player/PlayerApp.jsx`

## 이벤트 관리 화면

| 구분 | 파일 | 상태 |
|---|---|---|
| 실제 사용 | `/src/screens/EventManager.jsx` | 현재 운영자 이벤트 관리 기존 레이아웃 |
| 보존/안전망 | `/src/admin/EventManager.jsx` | 예전 JSON 편집형 화면 보존, 기본 export는 실제 사용 파일로 연결 |

`/src/admin/EventManager.jsx`는 기존 코드를 삭제하지 않고 `LegacyAdminEventManager`로 보존했습니다.  
기본 import로 불러와도 예전 JSON 화면이 나오지 않도록 `/src/screens/EventManager.jsx`를 반환합니다.

## 참가자 앱

| 구분 | 파일 | 상태 |
|---|---|---|
| 실제 사용 | `/src/player/PlayerApp.jsx` | `/src/AppRouter.jsx`에서 import하는 현재 참가자 앱 |
| 레거시 가능성 | `/src/PlayerApp.jsx` | 현재 `/src/AppRouter.jsx`에서는 사용하지 않음 |

## StepFlow

| 구분 | 파일 | 상태 |
|---|---|---|
| 운영자 STEP | `/src/flows/StepFlow.jsx` | Admin STEP0~8 흐름에서 사용 |
| 참가자 STEP Context | `/src/player/flows/StepFlow.jsx` | 참가자 결과/게이트 관련 context 보존 |

## 수정 시 주의

1. 운영자 이벤트 관리 UI 수정은 `/src/screens/EventManager.jsx` 기준으로 작업합니다.
2. 참가자 화면 수정은 `/src/player/screens/*`와 `/src/player/PlayerApp.jsx` 기준으로 작업합니다.
3. 운영자 STEP 수정은 `/src/screens/Step*.jsx`와 `/src/flows/StepFlow.jsx` 기준으로 작업합니다.
4. 레거시 파일은 삭제하지 말고, 실제 라우트에서 사용되는 파일을 먼저 확인합니다.
