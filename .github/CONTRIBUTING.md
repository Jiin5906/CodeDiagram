# 기여 규칙

CodeDiagram 저장소에서 함께 작업할 때 지키는 규칙입니다. 파이프라인 구성과 명령어는 [PIPELINE_GUIDE.md](PIPELINE_GUIDE.md)를 참고하세요.

## 작업 흐름 (GitHub Flow)

1. 기본 브랜치(`master`)는 항상 배포 가능한 상태로 둡니다. `master`에 직접 커밋하지 않습니다.
2. 작업마다 최신 기본 브랜치에서 짧게 쓰는 브랜치를 만듭니다.
   ```bash
   git switch master
   git pull
   git switch -c fix/resolver-module-call
   ```
3. 작은 단위로 커밋하고 푸시합니다. 커밋할 때 pre-commit 훅이 포맷·린트·비밀값·단위 테스트를 검사합니다.
4. Pull Request를 엽니다. PR 템플릿의 체크리스트를 채웁니다.
5. CI가 모두 통과하고 리뷰를 받은 뒤 병합합니다. 병합한 브랜치는 지웁니다.
6. 배포는 `v*` 태그로 합니다 (`git tag v1.2.0` → `git push origin v1.2.0`).

> 파이프라인 구축 기간에는 통합 브랜치 `ci/pipeline`을 기본 브랜치 대신 대상으로 씁니다.

### 브랜치 이름

`<종류>/<짧은-설명>` 형식으로, 종류는 아래 커밋 타입과 같습니다.

| 예시 | 용도 |
|---|---|
| `feat/csharp-generics` | 새 기능 |
| `fix/cors-same-origin` | 버그 수정 |
| `test/resolver-cases` | 테스트 |
| `ci/release-workflow` | CI/CD 설정 |
| `chore/deps-update` | 빌드·도구·의존성 |
| `docs/pipeline-guide` | 문서 |
| `style/prettier-format` | 포맷 |

## 커밋 메시지 (Conventional Commits)

```
<타입>(<범위>): <요약>

<본문: 무엇을 왜 바꿨는지 (선택)>

<꼬리말: BREAKING CHANGE, Closes #번호 (선택)>
```

- **타입**: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `ci`, `chore`, `build`, `revert`
- **범위**(선택): 바뀐 영역. 예: `parser`, `resolver`, `graph`, `server`, `android`, `deps`
- **요약**: 한국어로, 마침표 없이 50자 안팎으로 씁니다.
- 기존 동작과 호환되지 않으면 타입 뒤에 `!`를 붙이거나 꼬리말에 `BREAKING CHANGE:`를 적습니다.

예시:

```
feat(parser): C# 제네릭 메서드 호출 추출
fix(resolver): 점 없는 호출은 같은 이름의 메서드보다 모듈 함수를 우선
ci: 태그 푸시 시 GHCR 이미지 릴리스
chore(deps): express 4.22.3으로 갱신
```

## 지켜야 할 것

- `git commit --no-verify`로 훅을 건너뛰지 않습니다. 실패하면 원인을 고칩니다.
- API 키 같은 비밀값은 `web/.env`(Git 제외)와 GitHub Secrets에만 둡니다.
- 새 GitHub 액션은 태그가 아니라 전체 커밋 SHA로 고정하고 `# vX.Y.Z` 주석을 답니다.
- 테스트는 날짜·랜덤·네트워크에 기대지 않게 씁니다. 실제 Anthropic API를 부르는 `npm run test:live`는 비용이 들기 때문에 필요할 때만 실행합니다.
- `docs/` 폴더(어느 위치든)는 개인 문서 공간이라 Git에서 제외됩니다. 팀이 함께 보는 문서는 `.github/`에 둡니다.
- 코드 주석과 사용자 대상 메시지는 한국어로, 주석은 `//한국어` 형식으로 씁니다.
