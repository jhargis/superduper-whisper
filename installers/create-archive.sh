#!/bin/bash

# Superduper Whisper - Create Distribution Archive
# Creates a clean zip of tracked files (excludes node_modules, dist, etc.)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Generate filename with date
FILENAME="superduper-whisper-$(date +%Y%m%d).zip"

# Create archive from git tracked files
git archive --format=zip HEAD -o "$FILENAME"

echo "Created: $SCRIPT_DIR/$FILENAME"
ls -lh "$FILENAME"
