# AGM Diagnostic Checklist

## 1) 진단 모드 켜기
브라우저 콘솔에서 아래 실행 후 새로고침:

```js
localStorage.setItem('AGM_DEBUG', '1');
```

끄기:

```js
localStorage.removeItem('AGM_DEBUG');
```

## 2) 현재 진단 상태 확인
콘솔에서:

```js
window.__AGM_DIAG
```

주요 확인 항목:
- `eventContext`
- `playerContext`
- `playerEventInput`
- `adminEventManager`
- `timeline`

## 3) 점검 시나리오
### direct-entry
1. 참가자 홈에서 STEP2/3/4/5/6 직접 진입
2. `window.__AGM_DIAG.timeline`에서 `resolve`, `refresh`, `applyIncomingEventData` 흐름 확인

### 운영자 입력초기화
1. 참가자들이 STEP3 입력 후 저장
2. 운영자에서 입력초기화 실행
3. `clearInputs:start`, `clearInputs:success`, `resetTokens:changed` 확인

### STEP3 저장
1. STEP3 입력 후 저장
2. `saveDraft:start`, `saveDraft:success` 확인

## 4) 같이 캡처하면 좋은 항목
- 문제 화면 스크린샷
- `window.__AGM_DIAG` 전체
- `window.__AGM_DIAG.timeline.slice(-30)` 결과
- Firestore 문서 상태(`eventInputs`, `eventInputResets`)
