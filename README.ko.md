# Sideband Comments

<p align="center">
  <img src="apps/vscode/resources/sideband-comments-icon.png" width="144" alt="Sideband Comments 아이콘">
</p>

<p align="center"><strong>문서가 있는 자리에서 AI와 함께 일하세요.</strong></p>

<p align="center"><a href="README.md">English</a> · <strong>한국어</strong></p>

![Sideband Comments 는 Obsidian 과 VS Code 에서 하나의 코멘트 기록을 공유합니다](media/release/sideband-comments-1.0.0-hero.png)

AI와의 대화는 빠르게 흘러가지만, 어떤 변경을 왜 했는지는 대화 기록 속으로 사라지곤 합니다. Sideband Comments 는 질문과 답변, 결정을 검토 대상 텍스트에 그대로 묶어 두면서도 문서 자체는 깨끗하게 유지합니다.

같은 검토 기록을 Obsidian 에서도 VS Code 에서도 엽니다. 작가, 지식 노동자, 개발자, 그리고 파일을 읽을 수 있는 AI 도구가 한 문서를 놓고 논의하고, 그 결과로 바뀐 내용을 확인하고, 검증이 끝난 뒤에야 스레드를 해결 처리할 수 있습니다.

## 왜 필요한가

- **정확히 그 텍스트에 붙는 맥락** — 논의를 해당 구절·문단·코드 범위 옆에 그대로 둡니다.
- **두 에디터가 공유하는 하나의 검토 기록** — Obsidian 과 VS Code 에서 같은 대화를 이어갑니다.
- **검증을 위해 보존되는 원문** — 검토했던 내용과 지금 문서의 내용을 비교할 수 있습니다.
- **로컬 우선, append-only 저장** — 검토 데이터를 문서에 심지 않고도 전체 논의 기록을 남깁니다.

## 코드와 글 모두를 위해

Sideband Comments 는 개발자의 코드 리뷰에만 쓰이지 않습니다. 개발자가 VS Code 에서 AI가 작성한 코드를 검토하는 동안, 작가나 연구자, 지식 노동자는 Obsidian 에서 AI가 작성한 글을 검토할 수 있습니다. 두 작업 모두 같은 모델을 씁니다 — 정확한 구절에 코멘트를 달고, 바뀐 내용을 확인하고, 검증한 뒤에 해결 처리합니다.

![같은 Sideband Comments 작업 흐름을 쓰는 개발자와 작가](media/release/sideband-comments-audiences.png)

파일을 읽을 수 있는 AI 도구가 작업 공간에 접근할 수 있다면, 지시와 답변이 별도 채팅을 통해 반복해서 오가는 대신 원본 옆에 남아 있을 수 있습니다. Sideband Comments 는 AI 서비스를 호출하지 않고 MCP 서버도 요구하지 않습니다. 함께 제공하는 에이전트 스킬도 선택 사항입니다. 이 프로젝트가 제공하는 것은 사람과 도구가 공유할 수 있는, 오래 남는 로컬 검토 계층입니다.

## 동작 방식

1. 논의가 필요한 텍스트나 코드를 정확히 선택합니다.
2. Sideband 코멘트를 만들고, 사람 또는 작업 공간을 아는 AI 도구와 스레드를 이어갑니다.
3. 작성 시점의 원문, 현재 문서, 전체 답글 기록을 함께 놓고 검토합니다.
4. 결과 문서를 검증한 뒤에만 스레드를 해결 처리합니다.

코멘트를 만들거나 답글을 달거나 수정·삭제·해결·재고정(re-anchor)해도 Markdown 과 소스 파일은 바뀌지 않습니다. 두 에디터 확장은 하나의 append-only 저장소를 공유합니다.

```text
.comments/
├── documents/
│   └── <bundle-id>.jsonl    문서 하나의 스레드들을 담는 파일
└── threads/
    └── <thread-id>.jsonl    이전 구조, 읽기는 계속 지원
```

## 설치

### VS Code

[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=insung.sideband-comments-vscode) 에서 설치하거나, 확장 보기에서 **Sideband Comments** 를 검색하세요.

Comments Explorer 는 코멘트가 달린 파일을 작업 공간과 디렉터리별로 묶어 보여줍니다. Comment Details 에서 코멘트 본문을 더블클릭하면 저장/취소 편집이 열립니다(포커스 후 Enter 도 같습니다). Delete 는 VS Code 확인 대화상자를 띄우며, 확인하면 코멘트가 숨겨지고 JSONL 기록은 보존됩니다.

### Obsidian

[Obsidian 커뮤니티 플러그인](https://community.obsidian.md/plugins/sideband-comments) 에서 설치하거나, 설정 → 커뮤니티 플러그인 → 탐색에서 **Sideband Comments** 를 검색하세요.

Obsidian 어댑터는 데스크톱 전용입니다. Live Preview 하이라이트와 두 부분으로 나뉜 사이드바를 제공합니다 — 위쪽은 디렉터리 트리 코멘트 탐색기, 아래쪽은 선택한 노트의 인라인 코멘트와 답글·수정·삭제·해결·재고정·해결 항목 표시 여부 조작입니다. 새 코멘트 작성 폼은 현재 에디터 선택을 미리 보여주고, 기존 코멘트 본문은 더블클릭으로 인라인 편집이 열립니다. Reading View 범위 매핑은 아직 포함되지 않았습니다.

### 소스에서 빌드하기

아직 릴리즈되지 않은 변경을 써 보려면 직접 패키징해서 설치합니다.

```bash
npm run package --workspace sideband-comments-vscode
code --install-extension apps/vscode/dist/sideband-comments-vscode-<version>.vsix --force
```

```bash
npm run package --workspace sideband-comments-obsidian
```

Obsidian 은 `apps/obsidian/dist/` 의 `main.js`, `manifest.json`, `styles.css` 를 `<vault>/.obsidian/plugins/sideband-comments/` 로 복사하면 됩니다.

### AI 에이전트

`.agents/sideband-comments/` 에 에이전트 스킬이 있습니다. Claude Code 같은 에이전트에게 파일의 코멘트를 읽고, 요청받은 내용을 고치고, 스레드에 답글을 남기게 할 수 있습니다. 사용자 스코프에 링크하세요.

```bash
ln -s "$PWD/.agents/sideband-comments" ~/.claude/skills/sideband-comments
```

Codex, Copilot CLI, Gemini CLI 는 `~/.agents/skills/` 를 읽습니다. Python 3.9 이상이 필요하며, `.comments` 디렉터리가 있는 프로젝트라면 어디서든 동작합니다.

코멘트는 문서 텍스트의 인용문에 고정되므로 그 텍스트를 고치면 스레드가 떨어집니다(orphaned). 스킬은 답글을 달기 전에 다시 고정하고, 사용자를 대신해 스레드를 해결 처리하지 않습니다. [가이드 보기](docs/agent-skill.ko.md).

## Tandem Comments 이관

[Tandem Comments](https://community.obsidian.md/plugins/tandem-comments) 는 검토 스레드를 노트 안의 펜스 블록에 저장하는 Obsidian 플러그인입니다. 이 이관은 그 스레드를 `.comments` 저장소로 꺼내어 Markdown 을 깨끗하게 되돌립니다.

`--write` 를 명시하지 않으면 실제로 쓰지 않고 예행 연습만 합니다.

```bash
npm run build --workspace @sideband-comments/migrate
node packages/migrate/dist/sideband-migrate.js /path/to/vault
node packages/migrate/dist/sideband-migrate.js /path/to/vault --write
```

쓰기 경로는 각 Markdown 파일을 원자적으로 교체하기 전에 JSONL 이벤트를 먼저 기록합니다. 이미 있는 스레드 ID 가 다른 이벤트를 갖고 있으면 덮어쓰지 않고 이관을 중단합니다.

## 구조

```text
packages/core/          에디터에 종속되지 않는 도메인과 유스케이스
packages/jsonl-store/   .comments 저장 어댑터
packages/migrate/       Tandem 펜스 블록 이관
apps/vscode/            VS Code CommentController 어댑터
apps/obsidian/          Obsidian 사이드바와 Live Preview 어댑터
.agents/                에이전트 스킬과 그 도구
```

코어가 스레드 이벤트, 결정적 폴딩, 인용 앵커, 수정·삭제 기록, 해결·재개, 재고정, 파일 이동을 담당합니다. 에디터 패키지는 호스트 API 이벤트를 코어 유스케이스로 옮기는 일만 합니다. VS Code 와 Obsidian 모두 작업 공간 전체 파일 탐색기를 위에, 선택한 파일의 상세 편집기를 아래에 두며 재고정과 해결 항목 표시 조작을 함께 제공합니다.

## 개발

요구 사항: Node.js 20 이상과 npm.

```bash
npm install
npm test
npm run typecheck
npm run build
```

## 앱 버전 정책

VS Code 와 Obsidian 릴리즈는 패치 번호를 각자 올릴 수 있지만 `major.minor` 는 같아야 합니다. 예를 들어 VS Code `1.0.3` 과 Obsidian `1.0.7` 은 괜찮지만 `1.1.x` 와 `1.0.x` 는 안 됩니다. Obsidian 의 package 와 manifest 버전은 정확히 일치해야 합니다.

`npm test`, 루트 빌드, 각 앱의 package 명령, 그리고 `App version policy` GitHub Actions 검사가 모두 같은 검증을 돌립니다.

```bash
npm run check:app-versions
```

기본 브랜치 보호 규칙에서 `app-version-policy` 상태 검사를 필수로 두면 버전 라인이 어긋난 채로 병합되는 것을 막을 수 있습니다.

## Git 동기화

`.comments/` 를 Git 으로 추적하면 코멘트 기록을 다른 컴퓨터에서도 볼 수 있고 VS Code 와 Obsidian 확장이 함께 쓸 수 있습니다. 이렇게 하면 검토만을 위한 변경이 Markdown 과 코드 파일에서 사라지지만, 코멘트 활동은 여전히 `.comments/` 아래에 변경을 만듭니다. `.comments/` 를 무시하면 Git 변경은 생기지 않지만 다른 동기화 수단이 필요해집니다.

## 영감과 라이선스

Sideband Comments 는 [Tandem Comments](https://community.obsidian.md/plugins/tandem-comments) 와 Anchored Comments 에서 영감을 받았습니다. 이 저장소는 사이드카 프로토콜과 에디터 어댑터를 MIT 라이선스로 새로 구현한 것입니다. MCP 서버는 포함하지 않으며, 에이전트 스킬은 선택 사항입니다.
