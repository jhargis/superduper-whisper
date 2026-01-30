#!/bin/bash

# Superduper Whisper - Linux Uninstaller
# Removes the desktop entry created by install-linux.sh

set -e

DESKTOP_FILE="$HOME/.local/share/applications/superduper-whisper.desktop"
CONFIG_DIR="$HOME/.config/superduper-whisper"

echo "Superduper Whisper - Linux Uninstaller"
echo "======================================="

# Remove desktop entry
if [ -f "$DESKTOP_FILE" ]; then
    rm -f "$DESKTOP_FILE"
    echo "Removed: $DESKTOP_FILE"
else
    echo "No desktop entry found."
fi

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi

echo ""
echo "Uninstallation complete!"

# Note about config files
if [ -d "$CONFIG_DIR" ]; then
    echo ""
    echo "User settings preserved at: $CONFIG_DIR"
    echo "To remove settings: rm -rf $CONFIG_DIR"
fi
