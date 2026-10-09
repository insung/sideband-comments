---
name: setup
description: Use right after the sideband-comments plugin is installed, or when the user asks to set up Sideband Comments ("set up sideband comments", "사이드밴드 코멘트 설정해줘", "install the VS Code extension for comments", "옵시디언 플러그인도 깔아줘"). Checks the VS Code extension, the Obsidian plugin and the project's .comments directory, and installs or opens each one only with the user's consent.
---

# Set up Sideband Comments

The `sideband-comments` skill reads and writes review threads in `<project root>/.comments`. People
write those threads in the VS Code extension and the Obsidian plugin. This skill checks the three
parts and helps the user add the missing ones.

**Never install, open or create anything the user has not agreed to.** Ask once per item, and act
only on the items the user agrees to. If the user declines, leave that item as it is and say how to
do it later.

## 1. Check

Run the checks first, change nothing yet.

| Part | Check | Installed when |
|---|---|---|
| VS Code extension | `code --list-extensions` | The output has the line `insung.sideband-comments-vscode` |
| Obsidian plugin | The project is a vault (it has `.obsidian/`) and `.obsidian/plugins/sideband-comments/manifest.json` exists | Both are true. If the project is not a vault, report "not a vault" |
| Comment store | `.comments/` exists in the project root | The directory exists |

If `code` is not on `PATH`, report the VS Code extension as "unknown — `code` command not found".
Do not search for VS Code another way.

## 2. Report

Show one line per part: installed, missing, or unknown. Then ask which of the missing parts the user
wants to set up. Ask in the language the user writes in.

## 3. Act — only after the user agrees

**VS Code extension.** Run this only after the user agrees:

```bash
code --install-extension insung.sideband-comments-vscode
```

If `code` is not on `PATH`, do not install. Give the user the Marketplace page instead:
https://marketplace.visualstudio.com/items?itemName=insung.sideband-comments-vscode

**Obsidian plugin.** Do not download or copy plugin files. Open the plugin page in Obsidian and let
the user install it there:

| OS | Command |
|---|---|
| macOS | `open "obsidian://show-plugin?id=sideband-comments"` |
| Linux | `xdg-open "obsidian://show-plugin?id=sideband-comments"` |
| Windows | `start "" "obsidian://show-plugin?id=sideband-comments"` |

Then tell the user: select **Install**, then **Enable**. Obsidian opens the page in the vault that
was open last, so ask the user to open this project's folder as a vault first. If the page does not
open, give the Community Plugins link instead: https://community.obsidian.md/plugins/sideband-comments

**Comment store.** The agent tool does not start a store, so `.comments/` must exist before the
first comment. Create it only after the user agrees, in the project root:

```bash
mkdir .comments
```

## 4. Check again

Run the checks in step 1 again and show the result. For the Obsidian plugin, the check passes only
after the user has installed and enabled it; if it still fails, say what the user must do in
Obsidian. Tell the user to reload VS Code (`Developer: Reload Window`) if the extension was just
installed.

Then say that the `sideband-comments` skill is ready: ask the agent to "check the comments" on a
file to read its threads.
