# AI에게 코멘트 맡기기

*[English](agent-skill.md)*

## Sideband Comments가 무엇인가

Sideband Comments는 리뷰 코멘트를 문서 **안**이 아니라 **옆**에 둡니다. 파일에는 아무것도 쓰지 않습니다.
코멘트는 `<프로젝트 루트>/.comments` 아래에 append-only JSONL로 쌓이고, 커밋하는 문서는 당신이 쓴 그대로 남습니다.

같은 저장소를 두 에디터가 읽습니다 — VS Code 확장과 Obsidian 플러그인. 한쪽에서 단 코멘트가 다른 쪽에 보이고, 저장소가 리포지토리 안의 평문이라 코멘트도 `git`을 타고 함께 움직입니다.

코멘트는 줄 번호가 아니라 **문서 텍스트의 인용문** — 그 문장 자체와 앞뒤 약간 — 에 붙습니다. 줄 번호는 위에 문단 하나만 끼워 넣어도 밀리지만 인용문은 그렇지 않습니다. 이 한 가지 설계가 코멘트를 편집에서 살아남게 하고, 동시에 AI에게 코멘트를 맡기기 전에 반드시 알아야 할 단 하나이기도 합니다.

## 스킬이 더하는 것

파일을 읽을 수 있는 AI라고 해서 코멘트 저장소를 안전하게 쓸 수 있는 건 아닙니다. 이벤트에는 id, 스레드별 revision, 저장소 잠금, 그리고 앞서 말한 인용 앵커가 들어갑니다. 손으로 쓴 JSONL은 스레드를 망가뜨리고, 에디터는 그걸 읽기를 거부합니다.

그래서 스킬은 AI에게 도구를 쥐여 줍니다. "이 파일 코멘트 확인하고 고쳐줘"라고 말하면, 고쳐진 문서와 당신이 남긴 스레드에 달린 답글이 돌아옵니다.

<img src="assets/step-2-read.svg" alt="쪽지를 읽는 AI" width="520">

## 코멘트는 왜 떨어지는가

<img src="assets/step-1-anchored.svg" alt="한 문장에 묶인 쪽지" width="520">

스레드는 자기가 붙어 있는 문장을 복사해서 들고 있습니다. 에디터는 코멘트를 제자리에 그리려고 문서에서 그 텍스트를 찾습니다.

<img src="assets/step-3-edit.svg" alt="연필이 인용된 문장을 고쳐 쓴다" width="520">

그리고 AI는 시킨 대로 바로 그 문장을 고쳐 씁니다.

<img src="assets/step-4-orphaned.svg" alt="인용한 글자가 사라지면 쪽지가 떨어진다" width="520">

이제 찾을 게 없습니다. 스레드는 **orphaned** 상태가 됩니다 — 저장소에도 있고 코멘트도 그대로지만, 더는 아무것도 가리키지 않습니다. 이건 예외 상황이 아닙니다. AI가 시킨 일을 제대로 했을 때 나오는 **정상적인 결과**입니다. 코멘트가 달린 문장이 바로 고쳐야 할 문장이니까요.

그래서 스킬이 할 일은 "코멘트 읽고 파일 고치기"가 아닙니다. "파일을 고치고 **그 자리를 대신한 텍스트에 코멘트를 다시 붙이기**"입니다.

## 흐름

<img src="assets/flow.svg" alt="list, edit, list, reanchor, list, reply — resolve 명령은 없음" width="1080">

| 단계 | 하는 일 |
|---|---|
| 1 · 읽기 | `list` 가 파일의 모든 스레드와 각각의 앵커 상태를 보여줍니다 |
| 2 · 고치기 | AI가 문서를 수정합니다 |
| 3 · 확인 | `list` 를 다시 — 인용문이 바뀐 스레드는 `orphaned` 로 나옵니다 |
| 4 · 다시 붙이기 | `reanchor` 로 그 자리를 대신한 텍스트를 가리키게 합니다 |
| 5 · 재확인 | `list` 한 번 더, 모든 스레드가 `resolved` 여야 합니다 |
| 6 · 답하기 | `reply` 로 스레드에 답글을 답니다 |

3~5번이 코멘트를 붙어 있게 하는 고리입니다. `reply` 는 orphaned 상태의 스레드에서 **실행을 거부하고** 먼저 칠 `reanchor` 명령을 알려줍니다. re-anchor를 잊으면 작업이 멈추지, 코멘트가 조용히 떨어지지는 않습니다.

<img src="assets/step-5-reanchor.svg" alt="새 문장에 다시 붙은 쪽지" width="520">

## AI가 써 주는 답글

<img src="assets/step-6-reply.svg" alt="쪽지 아래 짧은 답글" width="520">

답글은 두세 문장입니다. **뭘 바꿨는지**, 그리고 **확실하지 않은 게 뭔지.** diff는 이미 당신에게 있고 코멘트도 당신이 썼으니, 둘 다 되풀이하지 않습니다.

승인 절차·온콜 담당자·담당자 이름처럼 **프로젝트 안에서 확인할 방법이 없는 것**을 코멘트가 요구하면, AI는 코멘트가 정당화하는 최소한만 고치고 확인 못 한 부분은 답글에 적습니다. 그럴듯한 내용을 지어내 문서에 사실처럼 넣지 않습니다.

## AI가 하지 않는 것

**스레드를 해결(resolve) 처리하지 않습니다.** 코멘트가 답변됐다고 정하는 건 그 코멘트를 쓴 사람의 몫이라, 도구에 **`resolve` 명령 자체를 만들지 않았습니다.** 모델이 읽고 넘길 수 있는 문장이 아니라 도구의 표면으로 막았습니다. 해결 처리는 VS Code나 Obsidian에서 직접 하세요.

같은 이유로 새 스레드 생성, 코멘트 삭제, 해결된 스레드 되돌리기도 하지 않습니다.

## 설치

스킬 디렉터리를 사용자 스코프에 링크합니다.

```bash
ln -s "$PWD/.agents/sideband-comments" ~/.claude/skills/sideband-comments
```

Codex, Copilot CLI, Gemini CLI는 `~/.agents/skills/` 를 읽습니다.

```bash
ln -s "$PWD/.agents/sideband-comments" ~/.agents/skills/sideband-comments
```

Python 3.9 이상이 필요한데, macOS와 대부분의 리눅스에는 이미 있습니다. `.comments` 디렉터리가 있는 프로젝트라면 이 리포지토리가 아니어도 동작합니다.

## 쓰는 법

파일이나 디렉터리를 가리키며 평소 말투로 요청하면 됩니다.

> "docs/guide.md 에 코멘트 남겼어. 확인하고 고쳐줘."

같은 도구를 직접 쓸 수도 있습니다.

```bash
python3 .agents/sideband-comments/scripts/sideband_comments.py list docs/
python3 .agents/sideband-comments/scripts/sideband_comments.py list --orphaned-only docs/
```

`list` 는 각 스레드의 앵커 상태를 보여줍니다.

| 상태 | 뜻 |
|---|---|
| `resolved` | 인용문이 문서에 있고, 코멘트가 그곳을 가리킵니다 |
| `ambiguous` | 인용문이 여러 번 나오는데 앞뒤 문맥으로도 구분되지 않습니다 |
| `orphaned` | 인용문이 사라졌습니다 — 편집이 지웠거나 고쳐 썼습니다 |

나머지는 `--help` 로 볼 수 있습니다.

## 두 구현이 어긋나지 않게 하는 장치

이 도구는 설치 없이 어디서나 돌아가도록 Python으로 썼습니다. 그 말은 `packages/core` 와 `packages/jsonl-store` 가 TypeScript로 정의한 이벤트 형식을 **다시 구현했다**는 뜻입니다. 한 형식에 대한 두 구현은 붙잡아 두지 않으면 반드시 갈라집니다.

붙잡아 두는 게 `.agents/sideband-comments/scripts/sideband-comments-tool.test.ts` 입니다. 에디터가 쓰는 `CommentService` 로 스레드를 만들고, 그 위에서 Python 도구를 돌린 뒤, `JsonlThreadRepository` 로 되읽어 **TypeScript 저장소가 Python이 쓴 이벤트를 같은 스레드, 같은 번들로 접는지** 확인합니다. 에디터의 실제 코드를 import 해야만 그 일치를 증명할 수 있어서, 이 테스트만 TypeScript입니다.

**이벤트 스키마를 바꾸면 양쪽을 함께 고쳐야 합니다.** 안 고쳤을 때 알려주는 게 저 테스트입니다.
