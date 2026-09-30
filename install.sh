#!/usr/bin/env bash
# Re-run after moving the clone, since the launcher symlink uses an absolute path.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${HOME}/.local/bin"
WITH_BUN_INSTALL=0

for arg in "$@"; do
  case "$arg" in
    --with-bun-install|-B) WITH_BUN_INSTALL=1 ;;
    -h|--help)
      echo "Usage: install.sh [target_bin_dir] [--with-bun-install|-B]"
      echo "Symlinks video-gen into ~/.local/bin by default."
      exit 0
      ;;
    -*)
      echo "install: unknown option: $arg (try --help)" >&2
      exit 1
      ;;
    *) TARGET_DIR="$arg" ;;
  esac
done

if [[ "$WITH_BUN_INSTALL" -eq 1 ]]; then
  if ! command -v bun >/dev/null 2>&1; then
    echo "install: --with-bun-install requires Bun (https://bun.sh)" >&2
    exit 1
  fi
  (cd "$REPO_DIR" && bun install --frozen-lockfile)
fi

mkdir -p "$TARGET_DIR"
chmod +x "$REPO_DIR/video-gen"
ln -sf "$REPO_DIR/video-gen" "$TARGET_DIR/video-gen"
echo "Installed $TARGET_DIR/video-gen -> $REPO_DIR/video-gen"

case ":$PATH:" in
  *":$TARGET_DIR:"*) ;;
  *) echo "Add $TARGET_DIR to PATH, for example: export PATH=\"$TARGET_DIR:\$PATH\"" ;;
esac
echo "Set OPENROUTER_API_KEY in $REPO_DIR/.env, then run: video-gen <folder_path>"
