#!/usr/bin/env bash
set -euo pipefail

COMPILE_SCRIPT="/app/compile_project.sh"
RUN_SCRIPT="/app/run_project.sh"

chmod +x "$COMPILE_SCRIPT" "$RUN_SCRIPT" || true

echo "[entrypoint] building layout service..."
"$COMPILE_SCRIPT"

echo "[entrypoint] running..."
exec "$RUN_SCRIPT"
