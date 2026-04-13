#!/usr/bin/env bash
# azure-functions/scripts/run-local.sh
# ─────────────────────────────────────────────────────────────────────────────
# Run Azure Functions locally using the Azure Functions Core Tools.
# Reads configuration from local.settings.json (not committed to git).
#
# USAGE:
#   cp local.settings.example.json local.settings.json
#   # Edit local.settings.json with real values
#   chmod +x scripts/run-local.sh
#   ./scripts/run-local.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "──────────────────────────────────────────────"
echo " HEQCIS Connector — Local Development"
echo "──────────────────────────────────────────────"

cd "$PROJECT_DIR"

# ─── Check for local.settings.json ───────────────────────────────────────────
if [[ ! -f "local.settings.json" ]]; then
  echo "[local] ✘ local.settings.json not found."
  echo "  Run: cp local.settings.example.json local.settings.json"
  echo "  Then edit local.settings.json with real values."
  exit 1
fi

# ─── Build TypeScript ─────────────────────────────────────────────────────────
echo "[local] Building TypeScript..."
npm run build

# ─── Start Functions host ─────────────────────────────────────────────────────
echo "[local] Starting Azure Functions host..."
echo "[local] Timer triggers will fire on their configured schedules."
echo "[local] Use Ctrl+C to stop."
echo ""
func start
