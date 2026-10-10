---
name: setup
description: Use right after the sideband-comments plugin is installed, or when the user asks to set up Sideband Comments ("set up sideband comments", "사이드밴드 코멘트 설정해줘", "install the VS Code extension for comments", "옵시디언 플러그인도 깔아줘"). Checks Python, the VS Code extension, the Obsidian plugin and the project's .comments directory, and installs or opens each one only with the user's consent.
---

# Set up Sideband Comments

The `sideband-comments` skill reads and writes review threads in `<project root>/.comments`. People
write those threads in the VS Code extension and the Obsidian plugin. This skill checks those parts
and helps the user add the missing ones.

**Never install, open or create anything the user has not agreed to.** Ask once per item, and act
only on the items the user agrees to. If the user declines, leave that item as it is and say how to
do it later.

## 1. Ask and find the project root

Ask first: "Which editors do you write comments in: VS Code, Obsidian, or both?"
Check, report and install only the editors the user chose.

Find the project root. Start in the current directory and walk up; the root is the
first directory that contains `.comments` or `.git`. The agent tool and the VS Code extension use
the same rule, so all three read the same store. If no directory has either, offer the current
directory. Show the root to the user and ask them to confirm it. Every path below is under this
root.

## 2. Check

Run the checks, change nothing yet.

| Part | Check | Result |
|---|---|---|
| Python | `python3 --version` | Ready when it prints 3.9 or later |
| VS Code extension (if chosen) | `code --list-extensions` | Installed when the output has the line `insung.sideband-comments-vscode` |
| Obsidian plugin (if chosen) | See below | enabled, installed but disabled, missing, or no vault |
| Comment store | `<project root>/.comments/` exists | Ready when the directory exists |

If `python3` is missing or older than 3.9, report that the `sideband-comments` skill cannot run on
this computer. Do not install Python; the user decides how to install it.

If `code` is not on `PATH`, report the VS Code extension as "unknown — `code` command not found".
Do not search for VS Code another way.

**Obsidian.** Obsidian reads `.comments` only at the vault root. Find the vault root: start at the
project root and walk up to the nearest directory that contains `.obsidian/`. If there is none,
report "no vault". Then read the plugin state in that vault:

| State | `.obsidian/plugins/sideband-comments/manifest.json` | `"sideband-comments"` in `.obsidian/community-plugins.json` |
|---|---|---|
| enabled | exists | listed |
| installed but disabled | exists | not listed |
| missing | does not exist | — |

If the vault root is not the project root, warn the user: Obsidian would read a different
`.comments` than VS Code and the agent, so they would not share comments. Tell the user to open the
project root as its own vault.

## 3. Report

Show one line per part: its result from step 2. Then ask which of the missing parts the user wants
to set up. Ask in the language the user writes in.

## 4. Act — only after the user agrees

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
was open last, so ask the user to open the project root as a vault first. If the plugin is installed
but disabled, tell the user to enable it in Settings → Community plugins instead. If the page does
not open, give the Community Plugins link: https://community.obsidian.md/plugins/sideband-comments

**Comment store.** The agent tool does not start a store, so `.comments/` must exist before the
first comment. Create it only after the user agrees:

```bash
mkdir "<project root>/.comments"
```

Recommend tracking `.comments/` in Git: the comment history then reaches other computers, and the
VS Code extension and the Obsidian plugin share it through the repository. Git does not track an
empty directory, so if the user agrees, create a placeholder and let the user commit it:

```bash
touch "<project root>/.comments/.gitkeep"
```

If the user declines, say that another way to sync `.comments/` is needed to share comments between
computers.

## 5. Check again

Run the checks in step 2 again and show the result. For the Obsidian plugin, the check passes only
when the state is "enabled"; otherwise say what the user must do in Obsidian. Tell the user to
reload VS Code (`Developer: Reload Window`) if the extension was just installed.

Then say that the `sideband-comments` skill is ready: ask the agent to "check the comments" on a
file to read its threads.
