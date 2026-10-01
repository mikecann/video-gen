# Agent guidance for video-gen

## Repo purpose

A Bun, TypeScript and React desktop app using Electrobun to generate videos
through OpenRouter. This clone contains the app, launchers, installers and tests.

## Working rules

- Use test-first development for non-trivial changes. Write or update the
  automated test first. If there is no clean test seam, extract one first.
- When behaviour, UI copy, layout, persistence, startup or a tested contract
  changes, update the affected tests and rerun them after implementation.
- Before committing, run `bun test`, `bun run typecheck` and `bun run build:dev`.
  Parse every `.ps1` with PowerShell. Smoke-test the real launcher on the
  relevant platform when available, and report what you could not verify.
- Keep automated tests free of paid video jobs. Mock OpenRouter to avoid
  network calls, API keys and model downloads.
- Keep source files in this clone. `C:\dev\tools`, if used, holds only generated
  stubs and large binaries. Never commit `.exe` or `.dll` files.
- Windows GUI entry points must use `video-gen.vbs` via `wscript.exe` with
  window style 0. Do not add shortcuts that flash a console. The first build
  can show progress, while normal launches stay hidden.
- Write generated `.bat` files with ASCII encoding if adding any.
- Keep `deps.ps1` idempotent and self-contained. Check tools with `Get-Command`
  and show clear `Write-Host` output. It must work as `./deps.ps1`; the installer
  runs it unless `-SkipDeps` is supplied.
- Rerun the appropriate installer when moving the clone or changing install
  registration. Editing source does not require reinstalling, but the
  Electrobun app does need rebuilding.
- Keep the shared Mike's Tools parent and other tools' registry verbs intact.
  Only video-gen's `VideoGen` entries belong to this installer/uninstaller.
- Keep README copy plain and friendly. Use no em dashes or en dashes. Avoid
  eyebrows or kickers in UI designs.

## video-gen specifics

- `src/bun/index.ts` owns the native window, RPC, local video server, saving and
  logging. `src/bun/events.ts` creates that server and its SSE stream.
  `src/bun/generation.ts` talks to OpenRouter's async video endpoints.
- `src/shared/modelOptions.ts` describes model capabilities and settings.
  `src/ui/App.tsx` is the chat interface.
- `.env` belongs in this repo root. `.env.example` lists the required key.
  Never commit keys, generated videos or logs.
- `FOLDER_PATH` is the output folder. The POSIX launcher also sets `TOOL_DIR`.
- `video-gen.vbs` is the Windows launcher. `video-gen` is the macOS launcher
  and resolves its symlink before reading `.env` and changing directory.
- Windows: `install.ps1` converts the icon and registers folder and folder
  background Explorer verbs. `uninstall.ps1` removes only those entries and icon.
- macOS: `bash install.sh --with-bun-install` installs dependencies and symlinks
  the launcher into `~/.local/bin`, or a supplied destination.
- Launchers build on first run only. After code changes, run
  `bun run build:dev`, then launch again from the desired output folder.
- `tests/generation.test.ts` mocks OpenRouter. `tests/launcher.test.ts` uses
  a fake Bun command to check standalone paths without opening a window.
