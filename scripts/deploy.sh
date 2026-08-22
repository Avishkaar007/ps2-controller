#!/usr/bin/env bash
# Local one-command build + push for PS2 Remote.
#
# IMPORTANT: this does NOT create a GitHub Release. Binaries (.dmg / .exe) are
# git-ignored and stay local in dist/ — they are NOT uploaded anywhere. This
# script only builds them and pushes the SOURCE to GitHub.
#
# What it does:
#   1. npm ci
#   2. pkg-build the macOS disks (Apple Silicon + Intel) and the Windows .exe
#   3. (optionally) commit + push the source to GitHub
#
# Pass --no-push to build everything locally WITHOUT committing or pushing.
set -euo pipefail
cd "$(dirname "$0")/.."

NO_PUSH=0
for a in "$@"; do
  case "$a" in
    --no-push) NO_PUSH=1 ;;
  esac
done

echo "==> Installing dependencies"
npm ci

echo "==> Building binaries (mac disks + win exe)"
npm run build
npm run make-dmg

if [ "$NO_PUSH" -eq 1 ]; then
  echo "==> --no-push: executables built in dist/; skipping commit/push."
  echo "    Local artifacts:"
  ls -1 dist/
  exit 0
fi

echo "==> Committing + pushing source"
git add -A
git commit -m "chore: update source" || echo "(nothing to commit)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git push origin "$BRANCH"

echo "==> Done. No GitHub release created; binaries remain local in dist/."
