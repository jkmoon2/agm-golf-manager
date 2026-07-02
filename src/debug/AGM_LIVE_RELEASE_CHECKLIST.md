# /src/debug/AGM_LIVE_RELEASE_CHECKLIST.md

# AGM 라이브 배포 전 최종 운영 체크리스트

이 문서는 라이브 운영 전 최종 점검용입니다.  
앱 실행 코드에는 영향을 주지 않는 문서 파일입니다.

---

## 0. 적용 범위 확인

현재 1차/2차 안정화 작업 기준입니다.

- [x] [1/10] 대회 목록 로딩 단일화/재시도 안정화
- [x] [2/10] STEP3 eventInputs 저장 충돌/되살아남 방지 1차 보완
- [x] [3/10] participants/room 배정 기준 정리
- [x] [4/10] EventManager 저장 경로 정리
- [x] [5/10] Firestore rules 관리자 기준과 앱 관리자 기준 통일
- [x] [6/10] 라이브 회귀 테스트/진단 로그 강화
- [x] [7/10] Player STEP3 eventInputs 저장 구조 2차 정리
- [x] [8/10] 방배정/포볼 팀 배정 호환 필드 정리
- [x] [9/10] 중복/레거시 파일 정리
- [x] [10/10] 라이브 배포 전 최종 운영 체크리스트 정리

---

## 1. 로컬 빌드 확인

수정 코드 적용 후 반드시 로컬에서 먼저 확인합니다.

```bash
npm install
npm run build
```

성공 기준:

- [ ] build failed 없이 완료
- [ ] ESLint 경고는 있어도 배포 차단 오류 없음
- [ ] 기존 화면 레이아웃 깨짐 없음

---

## 2. develop 배포 전 Git 확인

```bash
git status
git diff --stat
```

확인 항목:

- [ ] 의도한 파일만 변경됨
- [ ] `src/screens/EventManager.jsx` 기존 레이아웃 유지
- [ ] `src/admin/EventManager.jsx`는 보존형 wrapper 상태
- [ ] `src/utils/adminAuth.js` 관리자 기준 유지
- [ ] `src/utils/assignmentCompat.js` 포함
- [ ] `src/utils/agmDiag.js` 포함

커밋 예시:

```bash
git add src
git commit -m "complete AGM live stability checklist"
git push origin develop
```

---

## 3. develop 1차 화면 확인

develop 주소에서 관리자/참가자 화면을 확인합니다.

### 관리자

- [ ] 운영자 로그인 가능
- [ ] STEP0 대회 목록 즉시 표시
- [ ] 대회 생성 가능
- [ ] 대회 수정 가능
- [ ] 대회 삭제 가능
- [ ] 이벤트 관리 화면이 기존 레이아웃으로 표시
- [ ] STEP4 참가자 업로드/수정 가능
- [ ] STEP5 스트로크 방배정 가능
- [ ] STEP6 스트로크 결과표 표시
- [ ] STEP7 포볼 방배정 가능
- [ ] STEP8 포볼 결과표 표시

### 참가자

- [ ] `/player/events` 접속 시 참가자 대회 목록 표시
- [ ] 인증코드 로그인 가능
- [ ] Player STEP1 진입 가능
- [ ] Player STEP2 방배정표 표시
- [ ] Player STEP3 이벤트 입력 가능
- [ ] Player STEP4 점수 입력 가능
- [ ] Player STEP5 결과표 표시
- [ ] Player STEP6 이벤트 결과 표시

---

## 4. 대회 목록 안정화 테스트

관리자와 참가자에서 각각 확인합니다.

- [ ] 로그인 직후 대회 목록이 바로 표시됨
- [ ] 새로고침 후에도 표시됨
- [ ] 브라우저 종료 후 재접속 시 표시됨
- [ ] 참가자 `/player/events` 직접 접속 시 표시됨
- [ ] 대회 삭제 후 삭제된 대회가 다시 나타나지 않음

문제 발생 시 콘솔에서 실행:

```js
localStorage.setItem('AGM_DEBUG', '1');
location.reload();
```

문제 재현 후:

```js
window.__AGM_DIAG.copy()
```

---

## 5. Player STEP3 eventInputs 저장 테스트

### 일반 숫자 입력

- [ ] 숫자 입력 후 저장
- [ ] 저장 후 저장 버튼 비활성화
- [ ] 숫자 수정 후 저장
- [ ] 수정값 유지
- [ ] 숫자 삭제 후 저장
- [ ] 삭제값이 다시 살아나지 않음

### 동시 저장

브라우저 2개 또는 PC/휴대폰 2대로 테스트합니다.

- [ ] 참가자 A 입력 저장
- [ ] 참가자 B 입력 저장
- [ ] 서로의 값이 덮이지 않음
- [ ] 운영자 이벤트 미리보기와 Player STEP6 결과 일치

### 운영자 초기화

- [ ] Player STEP3 값 입력
- [ ] 운영자 이벤트 입력 초기화
- [ ] Player STEP3 값 사라짐
- [ ] Player STEP6 결과 사라짐
- [ ] 시간이 지나도 값이 다시 살아나지 않음

---

## 6. 빙고 이벤트 테스트

### Mini / 4x4 / Big 공통

- [ ] 칸 선택 가능
- [ ] 저장 후 값 유지
- [ ] 삭제 후 값 미복구
- [ ] Player STEP6 카운팅 일치
- [ ] 운영자 미리보기 카운팅 일치

### Big빙고

- [ ] 리더 배치 저장
- [ ] 다른 참가자 화면 반영
- [ ] 배치 변경 후 깜박임/원복 없음
- [ ] Player STEP6 결과 일치

---

## 7. 히든 이벤트 테스트

### 개인 1대1

- [ ] 히든 이벤트 생성/수정
- [ ] 같은 조만 지목 제한 ON
- [ ] Player STEP3 상대 목록이 같은 조만 표시
- [ ] 같은 조만 지목 제한 OFF
- [ ] Player STEP3 상대 목록이 전체 기준으로 표시
- [ ] 상대 선택 저장
- [ ] 상대 해제 저장
- [ ] 마감 후 변경 차단
- [ ] 승/패/비김/맞지목 점수 계산 일치

### 히든 포볼

- [ ] 비공개 상태에서 파트너명 숨김
- [ ] 배정 상태에서 팀 구성 저장
- [ ] 공개 상태에서 파트너명 표시
- [ ] 마감 후 변경 차단
- [ ] Player STEP6 팀 결과 일치

---

## 8. 스트로크 방배정 테스트

### Admin STEP5

- [ ] 자동 배정
- [ ] 수동 배정
- [ ] 강제 이동
- [ ] 동일 조 중복 방지
- [ ] 꽉 찬 방 맞교체
- [ ] 배정 취소
- [ ] 초기화

### 반영 확인

- [ ] Admin STEP6 방배정표 일치
- [ ] Player STEP2 방배정표 일치
- [ ] Player STEP4 점수 입력 대상 일치
- [ ] Player STEP5 결과표 일치

---

## 9. 포볼 방배정 테스트

### Player STEP1

- [ ] 1조 참가자 방배정 가능
- [ ] 1차 방 알림 표시
- [ ] 2차 파트너 알림 표시
- [ ] 2조 참가자는 확인 흐름 정상

### Admin STEP7

- [ ] 자동 배정
- [ ] 수동 배정
- [ ] 강제 이동
- [ ] 맞교체
- [ ] 취소 시 1조/파트너 동시 해제
- [ ] 초기화

### 반영 확인

- [ ] Admin STEP8 방배정표 일치
- [ ] Admin STEP8 최종결과표 일치
- [ ] Admin STEP8 팀결과표 일치
- [ ] Player STEP2 방배정표 일치
- [ ] Player STEP4 점수 입력 대상 일치
- [ ] Player STEP5 결과표 일치
- [ ] Player STEP6 이벤트 팀 결과 일치

---

## 10. 결과표 / 정렬 / 공유 테스트

### Admin STEP6 / STEP8

- [ ] 정렬 버튼 표시
- [ ] 방 정렬
- [ ] 오름 정렬
- [ ] 내림 정렬
- [ ] 대회 이동 후 정렬 상태 유지
- [ ] 새로고침 후 정렬 상태 유지
- [ ] Player STEP5 공유 상태 반영

### JPG/PDF

- [ ] 방배정표 JPG 저장
- [ ] 최종결과표 JPG 저장
- [ ] 팀결과표 JPG 저장
- [ ] PDF 저장
- [ ] 모바일에서 버튼 위치 정상
- [ ] 표 내부는 좌우 스크롤, 전체 페이지는 세로 스크롤

---

## 11. 홈화면 PWA 테스트

### develop

- [ ] `/player/events`로 접속
- [ ] 홈화면 추가
- [ ] 홈화면 앱 실행
- [ ] 운영자 로그인으로 가지 않고 Player 화면 유지

### live

- [ ] `/player/events`로 접속
- [ ] 홈화면 추가
- [ ] 홈화면 앱 실행
- [ ] 운영자 로그인으로 가지 않고 Player 화면 유지

문제가 계속되면 기존 홈화면 앱 삭제 후 다시 추가합니다.

---

## 12. Firestore rules 확인

현재 앱 관리자 기준은 Firestore rules 기준과 동일해야 합니다.

관리자 기준:

```txt
a@a.com
```

확인 항목:

- [ ] `a@a.com` 관리자 로그인 가능
- [ ] 대회 생성/수정/삭제 가능
- [ ] preMembers 저장 가능
- [ ] STEP4 개인정보 저장 가능
- [ ] 다른 이메일 계정은 관리자 기능 차단
- [ ] 참가자 인증코드/익명 로그인은 Player 기능만 가능

---

## 13. live 배포 전 최종 절차

### develop 통과 후

```bash
git checkout main
git pull origin main
git merge develop
npm run build
git push origin main
```

또는 사용 중인 브랜치 전략에 맞춰 Netlify live 배포 브랜치로 merge합니다.

확인 항목:

- [ ] main/live 브랜치에 의도한 커밋 포함
- [ ] Netlify build 성공
- [ ] live 주소 접속 정상
- [ ] live Firestore 프로젝트가 운영 DB인지 확인

---

## 14. 라이브 운영 중 문제 발생 시 수집 정보

문제 발생 시 아래 4가지를 기록합니다.

```txt
1. 주소: develop 또는 live
2. 화면: Admin STEP0 / Player STEP3 / Player STEP1 등
3. 대회명: 예) 안골모 671차_1부
4. 증상: 예) 숫자 삭제 후 다시 살아남
```

그리고 콘솔에서 실행:

```js
window.__AGM_DIAG.copy()
```

복사된 내용을 그대로 보관하거나 개발자에게 전달합니다.

---

## 15. 긴급 복구 순서

라이브 운영 중 문제가 발생하면 아래 순서로 대응합니다.

1. 새로고침 전 현재 화면 캡처
2. `window.__AGM_DIAG.copy()` 실행
3. 관리자 화면에서 해당 대회 데이터 확인
4. 동일 참가자로 다른 브라우저에서 재현 확인
5. develop에서도 같은 문제인지 확인
6. 문제가 live 배포만이면 이전 커밋으로 rollback
7. 데이터가 꼬인 경우 Firestore에서 해당 eventInputs/participants만 백업 후 수정

---

## 16. 최종 통과 기준

아래 항목을 통과하면 라이브 운영 가능 상태로 봅니다.

- [ ] 대회 목록이 운영자/참가자 모두 즉시 표시
- [ ] Player STEP3 입력/수정/삭제값이 안정적으로 유지
- [ ] 운영자 입력 초기화 후 값이 다시 살아나지 않음
- [ ] 스트로크 방배정과 결과표가 일치
- [ ] 포볼 방배정/파트너/팀결과가 일치
- [ ] 히든 이벤트 공개/배정/마감 흐름 정상
- [ ] 빙고 카운팅이 운영자/참가자 결과와 일치
- [ ] 정렬/공유/JPG/PDF 기능 정상
- [ ] 홈화면 앱 실행 시 Player 경로 유지
- [ ] 문제 발생 시 진단 로그 수집 가능
