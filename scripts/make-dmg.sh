#!/usr/bin/env bash
# Build macOS .dmg files (one per architecture) with clear, user-facing names.
# Run after `npm run build` (creates dist/ps2-remote-macos-<arch>).
#
# Output:
#   dist/PS2Remote-Apple-Silicon.dmg   (M1 / M2 / M3 Macs)
#   dist/PS2Remote-Intel.dmg           (older Intel Macs)
set -euo pipefail
cd "$(dirname "$0")/.."

make_app() {
  local arch="$1" label="$2"
  local bin="dist/ps2-remote-macos-${arch}"
  [ -f "$bin" ] || { echo "skip $label: $bin not found"; return; }
  local app="dist/.build/PS2Remote-${label}.app"
  rm -rf "$app"
  mkdir -p "$app/Contents/MacOS"
  cp "$bin" "$app/Contents/MacOS/ps2remote"
  chmod +x "$app/Contents/MacOS/ps2remote"
  cat > "$app/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key> <string>PS2 Remote</string>
  <key>CFBundleDisplayName</key> <string>PS2 Remote</string>
  <key>CFBundleExecutable</key> <string>ps2remote</string>
  <key>CFBundleIdentifier</key> <string>com.avishkaar.ps2remote</string>
  <key>CFBundleVersion</key> <string>1.0.0</string>
  <key>CFBundleShortVersionString</key> <string>1.0.0</string>
  <key>CFBundlePackageType</key> <string>APPL</string>
  <key>LSMinimumSystemVersion</key> <string>10.13</string>
  <key>NSHighResolutionCapable</key> <true/>
</dict>
</plist>
EOF
  local dmg="dist/PS2Remote-${label}.dmg"
  rm -f "$dmg"
  hdiutil create -volname "PS2 Remote" -srcfolder "$app" -ov -format UDZO "$dmg"
  echo "==> created $dmg"
}

make_app arm64 "Apple-Silicon"
make_app x64 "Intel"
