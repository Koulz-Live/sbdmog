#!/usr/bin/env bash
# azure-functions/scripts/deploy-functionapp.sh
# ─────────────────────────────────────────────────────────────────────────────
# Build TypeScript and publish to the Azure Function App.
# Does NOT use Docker. Uses Azure Functions Core Tools `func azure functionapp publish`.
#
# PREREQUISITES:
#   npm install -g azure-functions-core-tools@4 --unsafe-perm true
#
# USAGE:
#   export FUNCTION_APP_NAME=func-heqcis-connector
#   chmod +x scripts/deploy-functionapp.sh
#   ./scripts/deploy-functionapp.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

FUNCTION_APP_NAME="${FUNCTION_APP_NAME:?'Set FUNCTION_APP_NAME env var'}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "──────────────────────────────────────────────"
echo " HEQCIS Connector — Deploy to Azure"
echo " App: $FUNCTION_APP_NAME"
echo "──────────────────────────────────────────────"

# ─── 1. Install dependencies ──────────────────────────────────────────────────
echo "[deploy] Installing npm dependencies..."
cd "$PROJECT_DIR"
npm ci --omit=dev

# ─── 2. TypeScript build ──────────────────────────────────────────────────────
echo "[deploy] Building TypeScript..."
npm run build

# ─── 3. Verify build output ───────────────────────────────────────────────────
if [[ ! -f "dist/src/index.js" ]]; then
  echo "[deploy] ✘ Build failed — dist/src/index.js not found"
  exit 1
fi
echo "[deploy] ✔ Build output verified"

# ─── 4. Publish to Azure ─────────────────────────────────────────────────────
echo "[deploy] Publishing to Azure Function App: $FUNCTION_APP_NAME"
func azure functionapp publish "$FUNCTION_APP_NAME" --typescript

echo ""
echo "[deploy] ✔ Deployment complete."
echo "[deploy] Verify with:"
echo "  func azure functionapp list-functions $FUNCTION_APP_NAME"
echo "  az monitor app-insights query ..."
