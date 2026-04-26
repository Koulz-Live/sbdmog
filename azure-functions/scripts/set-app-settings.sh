#!/usr/bin/env bash
# azure-functions/scripts/set-app-settings.sh
# ─────────────────────────────────────────────────────────────────────────────
# Configure all required Azure Function App application settings.
# Run this after setup-azure.sh and after populating Key Vault secrets.
#
# USAGE:
#   export FUNCTION_APP_NAME=func-heqcis-connector
#   export RESOURCE_GROUP=rg-heqcis-connector
#   export KEY_VAULT_NAME=kv-heqcis-conn
#   export WEBHOOK_BASE_URL=https://your-app.vercel.app
#   export HEQCIS_ENVIRONMENT=production
#   chmod +x scripts/set-app-settings.sh
#   ./scripts/set-app-settings.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

FUNCTION_APP_NAME="${FUNCTION_APP_NAME:?'Set FUNCTION_APP_NAME'}"
RESOURCE_GROUP="${RESOURCE_GROUP:?'Set RESOURCE_GROUP'}"
KEY_VAULT_NAME="${KEY_VAULT_NAME:?'Set KEY_VAULT_NAME'}"
WEBHOOK_BASE_URL="${WEBHOOK_BASE_URL:?'Set WEBHOOK_BASE_URL'}"
HEQCIS_ENVIRONMENT="${HEQCIS_ENVIRONMENT:-production}"

echo "[settings] Storing secrets in Key Vault: $KEY_VAULT_NAME"

# ─── Store secrets in Key Vault ───────────────────────────────────────────────
# These are prompted interactively. In CI/CD, pipe them from your vault.

read -rsp "  WEBHOOK_SECRET (HMAC secret, min 32 chars): " WEBHOOK_SECRET
echo ""
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "webhook-secret" --value "$WEBHOOK_SECRET" -o none
echo "[settings] ✔ webhook-secret stored"

read -rsp "  SQL_PASSWORD (read-only SQL user password): " SQL_PASSWORD
echo ""
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "sql-password" --value "$SQL_PASSWORD" -o none
echo "[settings] ✔ sql-password stored"

# ─── Build Key Vault secret references ───────────────────────────────────────
KV_URI=$(az keyvault show --name "$KEY_VAULT_NAME" --resource-group "$RESOURCE_GROUP" --query properties.vaultUri -o tsv)
KV_WEBHOOK_SECRET_REF="@Microsoft.KeyVault(VaultName=${KEY_VAULT_NAME};SecretName=webhook-secret)"
KV_SQL_PASSWORD_REF="@Microsoft.KeyVault(VaultName=${KEY_VAULT_NAME};SecretName=sql-password)"

echo "[settings] Applying Function App settings..."

# ─── Non-secret settings (set directly) ──────────────────────────────────────
az functionapp config appsettings set \
  --name           "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    "HEQCIS_ENVIRONMENT=${HEQCIS_ENVIRONMENT}" \
    "WEBHOOK_BASE_URL=${WEBHOOK_BASE_URL}" \
    "WEBHOOK_TIMEOUT_MS=10000" \
    "WEBHOOK_MAX_RETRIES=3" \
    "WEBHOOK_RETRY_DELAY_MS=2000" \
    "SQL_SERVER=${SQL_SERVER:?'Set SQL_SERVER'}" \
    "SQL_DATABASE=${SQL_DATABASE:-Heqcis_web}" \
    "SQL_USER=${SQL_USER:-heqcis_readonly}" \
    "SQL_PORT=1433" \
    "SQL_ENCRYPT=true" \
    "SQL_TRUST_SERVER_CERT=false" \
    "SQL_CONNECT_TIMEOUT_MS=15000" \
    "SQL_REQUEST_TIMEOUT_MS=30000" \
    "ETL_JOB_NAME=HEQCISWEB_Job" \
    "SQL_CHECK_SCHEDULE=0 */30 * * * *" \
    "BACKUP_CHECK_SCHEDULE=0 0 */4 * * *" \
    "ETL_CHECK_SCHEDULE=0 */15 * * * *" \
    "PERF_CHECK_SCHEDULE=0 0 6 * * *" \
    "INTEGRITY_CHECK_SCHEDULE=0 0 2 * * *" \
    "INDEX_CHECK_SCHEDULE=0 0 3 * * *" \
    "INTERNAL_API_URL=${WEBHOOK_BASE_URL}" \
    "USE_KEY_VAULT=true" \
    "KEY_VAULT_URI=${KV_URI}" \
  -o none

echo "[settings] ✔ Non-secret settings applied"

# ─── Key Vault–referenced secret settings ────────────────────────────────────
az functionapp config appsettings set \
  --name           "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    "WEBHOOK_SECRET=${KV_WEBHOOK_SECRET_REF}" \
    "SQL_PASSWORD=${KV_SQL_PASSWORD_REF}" \
  -o none

echo "[settings] ✔ Key Vault secret references applied"
echo "[settings] ✔ All app settings configured."
