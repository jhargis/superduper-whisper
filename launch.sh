#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse args
ELECTRON_ARGS=""
DEBUG_MODE=false

for arg in "$@"; do
    case "$arg" in
        --debug) DEBUG_MODE=true ;;
        --no-gpu) ELECTRON_ARGS="$ELECTRON_ARGS --no-gpu" ;;
    esac
done

if [ "$DEBUG_MODE" = true ]; then
    exec "$SCRIPT_DIR/node_modules/.bin/electron" . $ELECTRON_ARGS
else
    exec "$SCRIPT_DIR/node_modules/.bin/electron" . $ELECTRON_ARGS > /dev/null 2>&1
fi
