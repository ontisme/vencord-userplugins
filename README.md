# vencord-userplugins

**English** | [繁體中文](README.zh-TW.md)

A collection of [Vencord](https://github.com/Vendicated/Vencord) userplugins, distributed as a prepackaged Vencord build for [Vesktop](https://github.com/Vencord/Vesktop).

The plugins are developed and tested against a pinned Vencord version (see [Building](#building)), and every push to `main` automatically produces an installable build via GitHub Actions.

## Plugins

| Plugin | Description |
|--------|-------------|
| FavoriteChannels | Right-click any channel to favorite it; favorites are pinned at the top of the server's channel list. |
| FavoriteServers | A standalone favorite-server rail on the far left of the window, with drag-and-drop ordering and folder grouping. |
| ChannelTabs | A per-server tab bar below the title bar (icon + name). Clicking a tab returns to the last visited channel of that server. Tabs compress and scroll horizontally when crowded; layout is restored across restarts. |
| MessageBoard | A "message wall" tab on the Friends page showing cards from unmuted channels, with virtualized rendering, quick reply, jump-to-message, and per-channel/per-server mute and hide management. |
| VoiceSpeakerPopout | A draggable, resizable in-app overlay showing voice channel members with live speaking indicators, mute/deafen status, self mute/deafen controls, and the native member context menu (including the per-user volume slider). |

## Installation

Run in PowerShell:

```powershell
iwr -useb https://raw.githubusercontent.com/ontisme/vencord-userplugins/main/install.ps1 | iex
```

The script installs Vesktop if needed, downloads the latest release build, extracts it to `%LOCALAPPDATA%\CustomVencord\dist`, and points Vesktop at it. Fully restart Vesktop afterwards, then enable the plugins under Settings -> Plugins.

Manual install: download `vencord-custom-dist.zip` from the latest release, extract it anywhere, and set Vesktop Settings -> Vesktop -> Developer Options -> Vencord Location to the extracted folder.

## Building

Requirements: Node >= 22, pnpm 11.9.0, git.

A clean one-shot build (same as CI):

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\build-dist.ps1
```

```bash
# Other platforms
bash scripts/build-dist.sh
```

This clones the pinned Vencord version, injects the plugins, and produces `dist/` ready to be mounted by Vesktop. The Vencord version is pinned via `VENCORD_COMMIT` in `scripts/build-dist.sh` (currently `0a5dfaa`, v1.14.16). When bumping it, re-test all patches.

## Development

For a fast iteration loop, link `plugins\` into a local Vencord clone and run the watcher:

```
git clone https://github.com/ontisme/vencord-userplugins
cd vencord-userplugins
git clone https://github.com/Vendicated/Vencord
cmd /c mklink /J "Vencord\src\userplugins" "%CD%\plugins"
cd Vencord && pnpm install && pnpm watch
```

Point Vesktop's Vencord Location at `Vencord\dist`, then reload Discord with Ctrl+R after each change.

Note on the junction: esbuild path aliases (`@webpack` etc.) only resolve inside the Vencord source tree, so the junction must point from `Vencord\src\userplugins` to `plugins\` (real files stay in `plugins\`). `git checkout` / `git merge` can occasionally replace the junction with a real directory; if that happens, move the files back and recreate the junction.

## When a Discord update breaks a patch

Discord ships frequently and webpack module anchors can drift. If a plugin stops working:

1. Search the console for `Patch by` warnings to identify the failing patch, or `Didn't find module` errors for failing webpack finds.
2. Use Vencord's built-in Patch Helper (Settings -> Patch Helper) to re-test find/match/replace.
3. Or re-locate anchors in DevTools with `Vencord.Webpack.search("<string>")` and `Vencord.Webpack.findModuleFactory("<string>").toString()`.
4. Update the anchor strings in the plugin, rebuild, and restart.

Known anchors and conventions are documented in the plugin sources themselves.

## Project layout

```
plugins\                  Plugin sources (tracked)
scripts\build-dist.sh     Clean build: clone pinned Vencord, inject plugins, emit dist/ (shared by CI and local)
scripts\build-dist.ps1    PowerShell equivalent of build-dist.sh
install.ps1               One-shot user install script
.github\workflows\        CI: build and update the latest release on every push to main
docs\                     Design specs and implementation notes
Vencord\                  Local Vencord clone for development (ignored)
```

## Notes

- The plugins use Discord's current CSS variables (`--background-base-low`, `--background-surface-higher`, `--text-default`, `--background-mod-subtle`, ...). Legacy variables (`--background-secondary`, `--interactive-normal`, `--header-primary`, ...) resolve to nothing in current Discord and must not be used.
- All plugins are verified on Vesktop against the pinned Vencord version before being merged to `main`.

## License

GPL-3.0-or-later, matching Vencord.
