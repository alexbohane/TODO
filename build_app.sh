#!/usr/bin/env bash
set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────
APP_NAME="TodoApp"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${PROJECT_DIR}/${APP_NAME}.app"
VENV_PYTHON="${PROJECT_DIR}/.venv/bin/python"

# ── Clean previous build ──────────────────────────────────────────────────
rm -rf "${APP_DIR}"

# ── Create .app structure ─────────────────────────────────────────────────
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# ── Info.plist ────────────────────────────────────────────────────────────
cat > "${APP_DIR}/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>TodoApp</string>
  <key>CFBundleDisplayName</key>
  <string>Todo App</string>
  <key>CFBundleIdentifier</key>
  <string>com.local.todoapp</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleExecutable</key>
  <string>TodoApp</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
</dict>
</plist>
PLIST

# ── Launcher script ──────────────────────────────────────────────────────
cat > "${APP_DIR}/Contents/MacOS/${APP_NAME}" << LAUNCHER
#!/usr/bin/env bash
cd "${PROJECT_DIR}"
exec "${VENV_PYTHON}" launcher.py
LAUNCHER

chmod +x "${APP_DIR}/Contents/MacOS/${APP_NAME}"

# ── Copy icon ─────────────────────────────────────────────────────────────
cp "${PROJECT_DIR}/AppIcon.icns" "${APP_DIR}/Contents/Resources/AppIcon.icns"

echo ""
echo "Built ${APP_NAME}.app at:"
echo "  ${APP_DIR}"
echo ""
echo "To install, run:"
echo "  ln -sf \"${APP_DIR}\" /Applications/${APP_NAME}.app"
echo ""
echo "Then search '${APP_NAME}' in Spotlight or open from /Applications."
