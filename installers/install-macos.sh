#!/bin/bash

# Superduper Whisper - macOS Installer
# Creates a launcher app in ~/Applications pointing to the source directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Superduper Whisper"
APPLICATIONS_DIR="$HOME/Applications"
APP_BUNDLE="$APPLICATIONS_DIR/$APP_NAME.app"

echo "Superduper Whisper - macOS Installer"
echo "====================================="

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js first: https://nodejs.org/"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing npm dependencies..."
    cd "$SCRIPT_DIR"
    npm install
fi

# Build the app
echo "Building the app..."
cd "$SCRIPT_DIR"
npm run build

# Create Applications directory if needed
mkdir -p "$APPLICATIONS_DIR"

# Remove existing app bundle if it exists
if [ -d "$APP_BUNDLE" ]; then
    echo "Removing existing installation..."
    rm -rf "$APP_BUNDLE"
fi

# Create app bundle structure
echo "Creating app bundle..."
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Detect how node/npm is available and build the launch script
if [ -f "$HOME/.nvm/nvm.sh" ]; then
    LAUNCH_PREAMBLE='source "$HOME/.nvm/nvm.sh"'
elif command -v fnm &> /dev/null; then
    LAUNCH_PREAMBLE='eval "$(fnm env)"'
else
    LAUNCH_PREAMBLE=""
fi

# Create launcher script
cat > "$APP_BUNDLE/Contents/MacOS/launcher" << EOF
#!/bin/bash
$LAUNCH_PREAMBLE
cd "$SCRIPT_DIR"
npx electron .
EOF
chmod +x "$APP_BUNDLE/Contents/MacOS/launcher"

# Create Info.plist
cat > "$APP_BUNDLE/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>$APP_NAME</string>
    <key>CFBundleDisplayName</key>
    <string>$APP_NAME</string>
    <key>CFBundleIdentifier</key>
    <string>com.superduperwhisper.app</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSMicrophoneUsageDescription</key>
    <string>Superduper Whisper needs microphone access to record audio for transcription.</string>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
EOF

# Copy icon if it exists (icns format for macOS)
if [ -f "$SCRIPT_DIR/assets/icons/icon.icns" ]; then
    cp "$SCRIPT_DIR/assets/icons/icon.icns" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
elif [ -f "$SCRIPT_DIR/assets/icons/tray-idle.png" ]; then
    # Use tray icon as fallback (won't look as good but works)
    cp "$SCRIPT_DIR/assets/icons/tray-idle.png" "$APP_BUNDLE/Contents/Resources/AppIcon.png"
fi

# Touch the app bundle to update Finder
touch "$APP_BUNDLE"

echo ""
echo "Installation complete!"
echo "App bundle: $APP_BUNDLE"
echo ""
echo "You can find '$APP_NAME' in ~/Applications or search for it with Spotlight."
echo ""
echo "Note: On first launch, you may need to grant microphone permissions in"
echo "System Preferences > Security & Privacy > Privacy > Microphone"
