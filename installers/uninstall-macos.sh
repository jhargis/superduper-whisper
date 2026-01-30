#!/bin/bash

# Superduper Whisper - macOS Uninstaller
# Removes the app bundle created by install-macos.sh

set -e

APP_NAME="Superduper Whisper"
APP_BUNDLE="$HOME/Applications/$APP_NAME.app"
CONFIG_DIR="$HOME/Library/Application Support/superduper-whisper"

echo "Superduper Whisper - macOS Uninstaller"
echo "======================================="

# Remove app bundle
if [ -d "$APP_BUNDLE" ]; then
    rm -rf "$APP_BUNDLE"
    echo "Removed: $APP_BUNDLE"
else
    echo "No app bundle found at $APP_BUNDLE"
fi

echo ""
echo "Uninstallation complete!"

# Note about config files
if [ -d "$CONFIG_DIR" ]; then
    echo ""
    echo "User settings preserved at: $CONFIG_DIR"
    echo "To remove settings: rm -rf \"$CONFIG_DIR\""
fi
