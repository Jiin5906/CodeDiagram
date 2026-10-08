## 변경 내용

<!-- 무엇을 왜 바꿨는지 짧게 적어 주세요. 관련 이슈가 있으면 링크합니다. (예: Closes #12) -->

## 변경 종류

- [ ] feat: 새 기능
- [ ] fix: 버그 수정
- [ ] refactor: 동작 변화 없는 구조 개선
- [ ] test: 테스트 추가·수정
- [ ] docs: 문서
- [ ] style: 포맷 (동작 변화 없음)
- [ ] ci / chore: 빌드·CI·설정·의존성

## 확인한 것

- [ ] PR 제목이 Conventional Commits 형식이다 (예: `fix(resolver): 모듈 함수 호출을 메서드보다 우선`)
- [ ] `web/`에서 `npm run check`가 통과한다 (린트 · 포맷 · 타입 · audit · 테스트 + 커버리지)
- [ ] 동작이 바뀌는 코드에는 테스트를 추가하거나 고쳤다
- [ ] 파서 출력을 바꿨다면 `web/schemas/parser-output-schema.json`도 갱신했다
- [ ] 비밀값(API 키, `.env` 내용)이 코드·로그·스크린샷에 없다
- [ ] 새 GitHub 액션은 전체 커밋 SHA로 고정하고 `# vX.Y.Z` 주석을 달았다
- [ ] (Android를 바꿨다면) `./gradlew testDebugUnitTest lintDebug assembleDebug`가 통과한다

## 화면 / 참고

<!-- UI가 바뀌었다면 전후 스크린샷, 리뷰어가 알아야 할 점 -->
