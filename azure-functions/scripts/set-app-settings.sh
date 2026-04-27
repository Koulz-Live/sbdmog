#!/usr/bin/env bash
# azure-functions/scripts/set-app-settings.sh
# ─────────────────────────────────────────────────────────────────────────────
# Configure all Azure Function App application settings directly.
# Secrets (WEBHOOK_SECRET, SQL_PASSWORD) are stored as encrypted Azure app
# settings — no Key Vault required.
#
# USAGE:
#   export FUNCTION_APP_NAME=func-heqcis-connectors
#   export RESOURCE_GROUP=rg-heqcis-connectors
#   export WEBHOOK_BASE_URL=https://sbdmog.vercel.app
#   export SQL_SERVER=heqcis.database.windows.net
#   export SQL_DATABASE=Heqcis_web
#   export SQL_USER=heqcis
#   chmod +x scripts/set-app-settings.sh
#   ./scripts/set-app-settings.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Required env vars ────────────────────────────────────────────────────────
FUNCTION_APP_NAME="${FUNCTION_APP_NAME:?'ERROR: Set FUNCTION_APP_NAME (e.g. func-heqcis-connectors)'}"
RESOURCE_GROUP="${RESOURCE_GROUP:?'ERROR: Set RESOURCE_GROUP (e.g. rg-heqcis-connectors)'}"
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-stheqcisconnect001}"
WEBHOOK_BASE_URL="${WEBHOOK_BASE_URL:?'ERROR: Set WEBHOOK_BASE_URL (e.g. https://sbdmog.vercel.app)'}"
SQL_SERVER="${SQL_SERVER:?'ERROR: Set SQL_SERVER (e.g. heqcis.database.windows.net)'}"
SQL_DATABASE="${SQL_DATABASE:-Heqcis_web}"
SQL_USER="${SQL_USER:-heqcis}"
HEQCIS_ENVIRONMENT="${HEQCIS_ENVIRONMENT:-production}"

echo ""
echo "──────────────────────────────────────────────────"
echo " HEQCIS Connector — Apply Azure Function App Settings"
echo " App:   $FUNCTION_APP_NAME"
echo " RG:    $RESOURCE_GROUP"
echo " URL:   $WEBHOOK_BASE_URL"
echo "──────────────────────────────────────────────────"
echo ""

# ─── Prompt for secrets interactively ────────────────────────────────────────
# These are stored as encrypted Azure App Settings (AES-256 at rest).
# They are never written to disk or logged.

read -rsp "  WEBHOOK_SECRET (HMAC signing secret — must match server WEBHOOK_SECRET): " WEBHOOK_SECRET
echo ""
if [[ ${#WEBHOOK_SECRET} -lt 32 ]]; then
  echo "ERROR: WEBHOOK_SECRET must be at least 32 characters."
  exit 1
fi

read -rsp "  SQL_PASSWORD (password for SQL user '$SQL_USER'): " SQL_PASSWORD
echo ""
if [[ -z "$SQL_PASSWORD" ]]; then
  echo "ERROR: SQL_PASSWORD cannot be empty."
  exit 1
fi

echo ""
echo "[settings] Applying all settings to Function App..."

# ─── Apply all settings in one az call ───────────────────────────────────────
# Secrets (WEBHOOK_SECRET, SQL_PASSWORD) are encrypted by Azure at rest.
# They appear as "hidden" in the Portal (click the eye icon to reveal).

az functionapp config appsettings set \
  --name           "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    "HEQCIS_ENVIRONMENT=${HEQCIS_ENVIRONMENT}" \
    "WEBHOOK_BASE_URL=${WEBHOOK_BASE_URL}" \
    "WEBHOOK_SECRET=${WEBHOOK_SECRET}" \
    "WEBHOOK_TIMEOUT_MS=10000" \
    "WEBHOOK_MAX_RETRIES=3" \
    "WEBHOOK_RETRY_DELAY_MS=2000" \
    "SQL_SERVER=${SQL_SERVER}" \
    "SQL_DATABASE=${SQL_DATABASE}" \
    "SQL_USER=${SQL_USER}" \
    "SQL_PASSWORD=${SQL_PASSWORD}" \
    "SQL_PORT=1433" \
    "SQL_ENCRYPT=true" \
    "SQL_TRUST_SERVER_CERT=false" \
    "SQL_CONNECT_TIMEOUT_MS=15000" \
    "SQL_REQUEST_TIMEOUT_MS=30000" \
    "SQL_CHECK_SCHEDULE=0 */30 * * * *" \
    "BACKUP_CHECK_SCHEDULE=0 0 */4 * * *" \
    "ETL_CHECK_SCHEDULE=0 */15 * * * *" \
    "ETL_JOB_NAME=HEQCISWEB_Job" \
    "PERF_CHECK_SCHEDULE=0 0 6 * * *" \
    "INTEGRITY_CHECK_SCHEDULE=0 0 2 * * *" \
    "INDEX_CHECK_SCHEDULE=0 0 3 * * *" \
    "INTERNAL_API_URL=${WEBHOOK_BASE_URL}" \
    "USE_KEY_VAULT=false" \
    "WEBSITE_NODE_DEFAULT_VERSION=~20" \
    "WEBSITE_CONTENTAZUREFILECONNECTIONSTRING=$(az storage account show-connection-string --name "${STORAGE_ACCOUNT:-stheqcisconnect001}" --resource-group "$RESOURCE_GROUP" --query connectionString -o tsv 2>/dev/null)" \
    "WEBSITE_CONTENTSHARE=${FUNCTION_APP_NAME}" \
  -o none

echo "[settings] ✔ All settings applied."
echo ""

# ─── Restart the Function App so new settings take effect ────────────────────
echo "[settings] Restarting Function App to load new settings..."
az functionapp restart \
  --name           "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP"

echo "[settings] ✔ Function App restarted."
echo ""

# ─── Summary ─────────────────────────────────────────────────────────────────
echo "──────────────────────────────────────────────────"
echo " Done. Verify with:"
echo ""
echo "   az functionapp config appsettings list \\"
echo "     --name $FUNCTION_APP_NAME \\"
echo "     --resource-group $RESOURCE_GROUP \\"
echo "     --query \"[].{name:name}\" -o table"
echo ""
echo " Then deploy the code (Step 3):"
echo "   export FUNCTION_APP_NAME=$FUNCTION_APP_NAME"
echo "   ./scripts/deploy-functionapp.sh"
echo "──────────────────────────────────────────────────"
