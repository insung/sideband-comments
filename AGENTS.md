# AGENTS.md

이 저장소에서 작업하는 에이전트를 위한 운영 규칙이다. 제품 설명과 버전 정책의 배경은 [README.md](README.md)에 있다.

## 저장소 구조

| 경로 | 역할 |
| --- | --- |
| `packages/core` | 이벤트 모델, 앵커, `CommentService` |
| `packages/jsonl-store` | `.comments/` JSONL 저장소 |
| `packages/migrate` | Anchored Comments v2 → Sideband 이관 |
| `apps/vscode` | VS Code 확장 |
| `apps/obsidian` | Obsidian 플러그인 |

두 앱은 `packages/*`를 공유한다. 저장소 계층을 고치면 **양쪽 앱이 모두 영향을 받는다.**

## 배포 전 불변 규칙

**배포한 코드는 반드시 커밋되어 있어야 한다.**

1.0.5는 커밋되지 않은 작업 트리에서 빌드해 마켓플레이스에 올렸다. 그 결과 태그 `1.0.5`가 1.0.4 커밋을 가리켰고, 프리뷰 댓글 기능과 문서 단위 저장 구조의 소스가 저장소 어디에도 남지 않아 설치된 번들에서 역이식해야 했다.

배포 직전 아래를 확인한다.

```bash
git status --porcelain
```

출력이 비어 있지 않으면 배포하지 않는다. 태그는 배포한 그 커밋에만 붙인다.

## 고치는 동안 지켜야 할 두 가지

에이전트가 반복 수정하며 가장 쉽게 어기는 규칙이고, 실제로 어겨서 사고가 났다.

### 버전은 publish 할 때만 올린다

로컬에서 재현·검증하려고 `.vsix`를 만들 때 **버전을 올리지 않는다.** 같은 버전으로 다시 패키징하고 `--force`로 덮어쓴다.

버전 번호는 마켓플레이스에 올라간 것의 다음 번호이지, 로컬 빌드 횟수가 아니다. 프리뷰 결함을 고치는 동안 검증 빌드마다 1.0.6 → 1.0.7 → 1.0.8로 올려놨는데 마켓플레이스는 계속 1.0.5였고, 결국 1.0.6으로 되돌려야 했다. 버전을 올리는 시점은 **publish 직전 한 번**뿐이다.

로컬 재설치 시 주의: 더 높은 버전의 확장 디렉터리가 `~/.vscode/extensions/`에 남아 있으면 VS Code는 그쪽을 로드한다. 낮은 버전을 `--force`로 설치해도 소용없다.

```bash
code --uninstall-extension insung.sideband-comments-vscode
code --install-extension apps/vscode/dist/sideband-comments-vscode-<version>.vsix --force
```

### 커밋은 사용자가 확인한 뒤에 한다

수정이 **실제 환경에서 동작하는 것을 사용자가 확인하기 전에는 커밋하지 않는다.** 중간 상태는 워킹 트리에 둔다.

증상을 보고 원인을 짚었다고 생각해 바로 커밋했는데, 진짜 원인이 다른 곳이어서 검증되지 않은 커밋이 쌓인 적이 있다. 테스트가 통과하는 것과 사용자 환경에서 동작하는 것은 다르다 — 특히 VS Code 기여점(`contributes`)과 webview 동작은 단위 테스트로 잡히지 않는다.

사용자가 "커밋해줘"라고 말할 때 커밋한다.

## VS Code 배포

VS Code 확장은 **Visual Studio Marketplace에 publish 하는 것이 배포다.** 로컬 `.vsix` 설치는 배포가 아니라 배포 전 검증 수단이다.

### 1. 검증

```bash
npm run typecheck && npm test && npm run build
```

### 2. 로컬 확인

현재 버전 그대로 패키징한다. **여기서 버전을 올리지 않는다.**

```bash
npm run package --workspace apps/vscode
code --uninstall-extension insung.sideband-comments-vscode
code --install-extension apps/vscode/dist/sideband-comments-vscode-<version>.vsix --force
```

설치 후 VS Code를 재시작하거나 `Developer: Reload Window`를 실행해야 새 번들이 뜬다. 사용자가 동작을 확인하면 커밋하고 다음 단계로 간다.

### 3. 버전 올리기 — publish 직전에 한 번

마켓플레이스의 현재 버전을 먼저 확인하고, 그 다음 번호로 올린다. `apps/vscode/package.json`의 `version`과 `scripts.package`의 `.vsix` 파일명을 **함께** 올린다. 둘이 다르면 `check-app-version-line.mjs`가 막는다.

VS Code와 Obsidian은 `major.minor`를 공유해야 한다. 패치 번호는 각자 올려도 된다.

```bash
npm run check:app-versions
npm run package --workspace apps/vscode
```

### 4. 릴리즈 노트

`apps/vscode/CHANGELOG.md` 맨 위에 새 버전 항목을 추가하고, 같은 내용을 GitHub Release 본문에 붙인다. Marketplace 는 이 파일을 Changelog 탭으로 보여준다.

형식:

- **영어로 쓴다.**
- 섹션은 `### Added` → `### Changed` → `### Fixed` → `### Verification` 순서로, 해당하는 것만 쓴다. 배포 방식이 달라졌으면 `### Distribution` 을 쓴다.
- 한 항목은 한 문장이고 동사로 시작한다 (`Comment on…`, `Show…`, `Write…`).
- **사용자가 겪는 변화**를 쓴다. 내부 구현이나 파일 경로는 그 변화를 설명하는 데 필요할 때만 넣는다. 커밋 메시지를 그대로 옮기지 않는다.
- `Fixed` 에는 무엇이 잘못됐었는지가 드러나야 한다. "Fix preview bug" 가 아니라 무엇이 안 되다가 되는지 쓴다.
- `### Verification` 에는 **실제로 통과한 것만** 적는다. 사용자가 확인하지 않은 동작을 확인했다고 쓰지 않는다.

릴리즈 노트는 버전을 올리는 시점, 즉 publish 직전에 쓴다. `apps/vscode/test/release-notes.test.ts` 가 `package.json` 의 버전에 해당하는 항목이 있는지, 섹션 이름과 문장 형식이 맞는지 검사한다.

### 5. publish

```bash
npx vsce publish --no-dependencies
```

`publisher`는 `insung`이다. Azure DevOps PAT이 필요하며 `vsce login insung` 또는 `VSCE_PAT` 환경변수로 넘긴다.

**publish는 되돌릴 수 없다.** 한 번 올린 버전 번호는 재사용할 수 없고 unpublish는 확장 전체를 내리는 것이다. 에이전트는 사용자의 명시적 승인 없이 publish 하지 않는다.

### 6. 태그

```bash
git tag vscode-<version> && git push origin vscode-<version>
```

**VS Code 릴리즈로 GitHub Release를 만들지 않는다.** 태그만 남긴다. 이유는 아래 "릴리즈 공간 공유" 참고.

## 릴리즈 공간 공유 — 가장 중요한 제약

Obsidian은 플러그인을 **`https://github.com/insung/sideband-comments/releases/latest/download/{manifest.json,main.js,styles.css}`** 에서 받는다. 즉 **저장소의 latest 릴리즈가 반드시 Obsidian 릴리즈여야 한다.**

두 앱이 한 저장소를 쓰므로 여기서 사고가 난다. 실제로 VS Code 1.0.5를 배포하며 GitHub Release `1.0.5`를 만들었더니:

1. `obsidian-release.yml`이 그 릴리즈에도 반응해 버전 게이트에서 실패했고,
2. 자산이 0개인 `1.0.5`가 latest가 되어
3. 위 세 URL이 전부 404가 됐다. Obsidian 사용자는 설치도 업데이트도 못 했다.

규칙:

- **Obsidian 릴리즈만 GitHub Release로 만든다.** 태그는 `apps/obsidian/manifest.json`의 버전과 정확히 같은 bare 버전(`1.0.4`, `v` 접두사 없음)이어야 한다 — Obsidian의 요구사항이다.
- **VS Code 릴리즈는 git 태그(`vscode-<version>`)만 남기고 GitHub Release를 만들지 않는다.** 배포처는 Marketplace다.
- 부득이하게 VS Code용 GitHub Release가 필요하면 **반드시 pre-release로 표시**해 latest를 빼앗지 않게 한다.

## Obsidian 배포

`.github/workflows/obsidian-release.yml`이 GitHub Release 발행 시 자산을 빌드해 올린다.

- 태그가 Obsidian 버전과 다르면 **실패가 아니라 스킵**한다 (`workflow_dispatch`로 직접 지정했을 때만 실패).
- 업로드 후 `releases/latest`가 이 릴리즈인지, 세 자산 URL이 200인지 검증한다. 여기서 실패하면 latest를 빼앗은 릴리즈를 pre-release로 내리거나 지워야 한다.

`manifest.json`은 저장소 루트와 `apps/obsidian/` 두 곳에 있고 **완전히 동일해야** 한다. `versions.json`은 해당 버전을 `minAppVersion`에 매핑해야 한다.

## 저장소 형식

`.comments/`는 append-only JSONL이다.

- `documents/*.jsonl` — 현재 쓰기 대상. 한 문서의 모든 스레드가 한 번들에 모인다.
- `threads/<threadId>.jsonl` — 레거시. 읽기만 지원한다.
- `store.lock` — 저장소 단위 락.

읽기는 항상 두 디렉터리를 모두 훑는다. `migrateLegacy()`(`Sideband Comments: Consolidate Comment Storage` 명령)는 명시적 호출일 때만 레거시 파일을 번들로 합친다. **이벤트를 덮어쓰거나 지우는 코드를 추가하지 않는다.**

## VS Code 확장에서 주의할 점

- 마크다운 프리뷰는 에디터 영역 웹뷰다. 프리뷰에 포커스가 가면 `window.activeTextEditor`가 `undefined`가 된다. 선택 영역이 필요한 기능은 `activeTextEditor`만 믿지 말고 `src/selection-source.ts`의 `pickCommentSelection`을 쓴다.
- 프리뷰 안의 선택을 확장으로 전달하는 경로는 `resources/preview.js`가 `data-vscode-context`에 실어 보내고 `webview/context` 메뉴가 받는 것뿐이다. 내장 프리뷰가 `acquireVsCodeApi()`를 이미 소비했고, 프리뷰 호스트는 `cacheImageSizes`·`revealLine`·`didClick`·`openLink`·`showPreviewSecuritySelector`·`previewStyleLoadError` 여섯 종류만 처리하며 외부 확장으로 중계하지 않는다. **선택이 바뀔 때 사이드바가 자동으로 알아차리게 만들 수는 없다.** 우클릭 한 번이 최소 동작이고, 그 뒤 앵커를 사이드바 작성 폼에 고정(`pinPreviewAnchor`)해서 본문을 거기서 쓰게 한다.
- 새 기여점(`contributes`)을 추가하면 `apps/vscode/test/manifest.test.ts`에 검증을 같이 추가한다.

## 에이전트 스킬

`.agents/sideband-comments/` 에 스킬(`SKILL.md`)과 그 도구(`scripts/sideband_comments.py`)가 있다. 사용자 스코프에 링크해서 쓴다.

```bash
ln -s "$PWD/.agents/sideband-comments" ~/.claude/skills/sideband-comments
```

사용법과 설계 배경은 [docs/agent-skill.ko.md](docs/agent-skill.ko.md) 에 있다. `scripts/` 의 테스트가 이 도구와 `packages/jsonl-store` 가 같은 저장소를 같게 읽고 쓰는지 검증한다 — 이벤트 스키마를 바꾸면 양쪽을 함께 고쳐야 한다.

## 작업 방식

- 동작을 바꾸기 전에 실패하는 테스트를 먼저 쓴다.
- 순수 로직은 VS Code API에 의존하지 않는 모듈로 분리해 테스트한다 (`selection-source.ts`, `preview-anchor.ts`, `tree-model.ts`가 그 예다).
- 커밋 메시지는 한국어로 `type(scope): 요약` 형식을 쓴다.
- 증상이 여러 개면 하나로 묶어 설명하지 말고 각각 원인을 확인한다. 워크스페이스 판정 실패, 프리뷰 `webviewId` 불일치, 활성 에디터 부재는 서로 다른 원인이었는데 한동안 한 문제로 다뤘다.
