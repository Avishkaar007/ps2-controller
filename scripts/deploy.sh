#!/usr/bin/env bash
# Local one-command deploy for PS2 Remote.
#
# What it does (everything beforehand, then pushes to GitHub):
#   1. npm ci
#   2. pkg-build the macOS disks (Apple Silicon + Intel) and the Windows .exe on THIS Mac
#   3. bump the version (patch | minor | major, default patch) and tag it
#   4. push the commit + tag
#   5. create a GitHub Release (under that tag) with the .dmg and .exe assets
#
# Authentication: it reuses the credential your `git push` already uses
# (e.g. macOS keychain / gh), so there is normally nothing to set up.
# If that fails, set GITHUB_TOKEN or `brew install gh && gh auth login`.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="Avishkaar007/ps2-controller"
NO_PUSH=0
BUMP="patch"
# Parse args: --no-push builds executables locally WITHOUT commit/push/release.
# First non-flag arg is the version bump (patch | minor | major; default patch).
for a in "$@"; do
  case "$a" in
    --no-push) NO_PUSH=1 ;;
    patch|minor|major) BUMP="$a" ;;
  esac
done

echo "==> Installing dependencies"
npm ci

echo "==> Building binaries (mac disks + win exe)"
npm run build
npm run make-dmg

# Friendly, unambiguous names so users never guess x64 vs arm64.
# Raw executables (for users who don't want a .dmg):
cp "dist/ps2-remote-macos-arm64" "dist/PS2Remote-macOS-Apple-Silicon"
cp "dist/ps2-remote-macos-x64"   "dist/PS2Remote-macOS-Intel"
# Friendly Windows asset name.
cp "dist/ps2-remote-win-x64.exe" "dist/PS2Remote-Windows.exe"

ASSETS=(
  "dist/PS2Remote-Apple-Silicon.dmg"
  "dist/PS2Remote-Intel.dmg"
  "dist/PS2Remote-macOS-Apple-Silicon"
  "dist/PS2Remote-macOS-Intel"
  "dist/PS2Remote-Windows.exe"
)
for a in "${ASSETS[@]}"; do
  [ -f "$a" ] || { echo "error: missing asset $a"; exit 1; }
done

# Commit any pending source changes so `npm version` can tag on a clean tree.
if [ "$NO_PUSH" -eq 1 ]; then
  echo "==> --no-push: executables built in dist/; skipping commit/bump/push/release."
  echo "    Assets ready:"
  for a in "${ASSETS[@]}"; do echo "      $a"; done
  exit 0
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "==> Committing... (prepare release)"
  git add -A
  git commit -m "chore: prepare release"
fi

echo "==> Bumping version ($BUMP)"
NEW_TAG="$(npm version "$BUMP" -m "Release %s")"
echo "    new tag: $NEW_TAG"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "==> Pushing branch and tag"
git push origin "$BRANCH" --follow-tags

# Resolve a token: GITHUB_TOKEN, else the git credential helper already used for push.
get_token() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then echo "$GITHUB_TOKEN"; return; fi
  printf 'protocol=https\nhost=github.com\n' | git credential fill 2>/dev/null \
    | awk -F= '/^password=/{print $2}'
}

NOTES=$'Automated release built on macOS.\n\n## macOS\n- PS2Remote-Apple-Silicon.dmg (or PS2Remote-macOS-Apple-Silicon) — M1 / M2 / M3 / M4 Macs\n- PS2Remote-Intel.dmg (or PS2Remote-macOS-Intel) — older Intel Macs\n\nUnsure which Mac you have? Click the Apple menu → "About This Mac":\n  - Chip: "Apple M1/M2/M3/M4" → Apple Silicon\n  - Processor: "Intel Core ..." → Intel\n\n## Windows\n- PS2Remote-Windows.exe\n\nNote: key injection is macOS-only for now; the Windows build runs the server/UI but needs a Windows injector to send keys.'

echo "==> Creating GitHub release with assets"
if command -v gh >/dev/null 2>&1; then
  gh release create "$NEW_TAG" \
    --repo "$REPO" \
    --title "PS2 Remote $NEW_TAG" \
    --notes "$NOTES" \
    "${ASSETS[@]}"
else
  TOKEN="$(get_token)"
  if [ -z "$TOKEN" ]; then
    echo "!! Could not find credentials for GitHub."
    echo "   Set a token:  export GITHUB_TOKEN=ghp_xxx   (or: brew install gh && gh auth login)"
    echo "   Then re-run:  npm run deploy -- $BUMP"
    echo "The tag $NEW_TAG is already pushed; create the release whenever you're ready."
    exit 0
  fi
  TMP="$(mktemp)"
  printf '%s' "$NOTES" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' > "$TMP"
  curl -sS -X POST \
    -H "Authorization: token $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"tag_name\":\"$NEW_TAG\",\"name\":\"PS2 Remote $NEW_TAG\",\"body\":$(cat "$TMP")}" \
    "https://api.github.com/repos/$REPO/releases" > /tmp/rel.json
  REL_ID="$(python3 -c 'import json;print(json.load(open("/tmp/rel.json")).get("id","-1"))')"
  rm -f "$TMP"
  for f in "${ASSETS[@]}"; do
    curl -sS -X POST \
      -H "Authorization: token $TOKEN" \
      -H "Content-Type: application/octet-stream" \
      --data-binary "@$f" \
      "https://uploads.github.com/repos/$REPO/releases/$REL_ID/assets?name=$(basename "$f")" >/dev/null
  done
  echo "==> release created via GitHub API"
fi

echo "==> Done: https://github.com/$REPO/releases/tag/$NEW_TAG"
