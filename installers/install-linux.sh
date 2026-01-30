#!/bin/bash

# Superduper Whisper - Linux Desktop Installer
# Creates a .desktop entry pointing to the source directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/superduper-whisper.desktop"

echo "Superduper Whisper - Linux Installer"
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

# Create desktop entry directory
mkdir -p "$DESKTOP_DIR"

# Detect how node/npm is available and build the Exec command
if [ -f "$HOME/.nvm/nvm.sh" ]; then
    EXEC_CMD="bash -c 'source ~/.nvm/nvm.sh && cd $SCRIPT_DIR && npx electron .'"
else
    NPX_PATH="$(which npx 2>/dev/null)"
    if [ -n "$NPX_PATH" ]; then
        EXEC_CMD="bash -c 'cd $SCRIPT_DIR && $NPX_PATH electron .'"
    else
        echo "Error: Could not find npx"
        exit 1
    fi
fi

# Create desktop entry
cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Name=Superduper Whisper
Comment=Hotkey-triggered voice transcription
Exec=$EXEC_CMD
Icon=$SCRIPT_DIR/assets/icons/tray-idle.png
Terminal=false
Type=Application
Categories=AudioVideo;Audio;
EOF

chmod +x "$DESKTOP_FILE"

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

echo ""
echo "Installation complete!"
echo "Desktop entry: $DESKTOP_FILE"
echo ""
echo "You can find 'Superduper Whisper' in your application menu."
