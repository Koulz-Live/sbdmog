#!/usr/bin/env bash
# azure-functions/scripts/setup-azure.sh
# ─────────────────────────────────────────────────────────────────────────────
# One-time Azure resource provisioning for the HEQCIS Azure Functions connector.
# Runs on Consumption Plan — no containers, no Docker, no Kubernetes.
#
# USAGE:
#   chmod +x scripts/setup-azure.sh
#   ./scripts/setup-azure.sh
#
# PREREQUISITES:
#   - Azure CLI installed: https://aka.ms/install-azure-cli
#   - Azure subscription available
#   - Run `az login` first
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
# Edit these values before running. Use lowercase for resource names where required.

AZURE_SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-}"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-heqcis-connector}"
LOCATION="${LOCATION:-southafricanorth}"             # Closest Azure region to CHE (South Africa)
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-stheqcisconn}"  # 3-24 chars, lowercase, no hyphens
FUNCTION_APP_NAME="${FUNCTION_APP_NAME:-func-heqcis-connector}"
APP_INSIGHTS_NAME="${APP_INSIGHTS_NAME:-appi-heqcis-connector}"
KEY_VAULT_NAME="${KEY_VAULT_NAME:-kv-heqcis-conn}"  # Optional — set USE_KEY_VAULT=true to enable
RUNTIME="node"
RUNTIME_VERSION="20"   # Node 24 is not yet stable on Linux Consumption in all regions (e.g. South Africa North)

# ─── Login / subscription ─────────────────────────────────────────────────────

echo "──────────────────────────────────────────────"
echo " HEQCIS Azure Functions Connector — Setup"
echo "──────────────────────────────────────────────"

if ! az account show &>/dev/null; then
  echo "[setup] Not logged in — running az login..."
  az login
fi

if [[ -n "$AZURE_SUBSCRIPTION_ID" ]]; then
  echo "[setup] Setting subscription to $AZURE_SUBSCRIPTION_ID"
  az account set --subscription "$AZURE_SUBSCRIPTION_ID"
fi

ACTIVE_SUB=$(az account show --query id -o tsv)
echo "[setup] Active subscription: $ACTIVE_SUB"

# ─── Resource group ───────────────────────────────────────────────────────────

echo "[setup] Creating resource group: $RESOURCE_GROUP in $LOCATION"
az group create \
  --name     "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --tags     project=heqcis-connector environment=production

# ─── Storage account ─────────────────────────────────────────────────────────
# Required by Azure Functions runtime for state, triggers, and logs.

echo "[setup] Creating storage account: $STORAGE_ACCOUNT"
az storage account create \
  --name                "$STORAGE_ACCOUNT" \
  --resource-group      "$RESOURCE_GROUP" \
  --location            "$LOCATION" \
  --sku                 Standard_LRS \
  --kind                StorageV2 \
  --min-tls-version     TLS1_2 \
  --allow-blob-public-access false \
  --tags                project=heqcis-connector

# ─── Application Insights ────────────────────────────────────────────────────
# Lightweight telemetry for timer execution tracking and failure alerting.

echo "[setup] Creating Application Insights: $APP_INSIGHTS_NAME"
az extension add --name application-insights --only-show-errors 2>/dev/null || true

az monitor app-insights component create \
  --app             "$APP_INSIGHTS_NAME" \
  --location        "$LOCATION" \
  --resource-group  "$RESOURCE_GROUP" \
  --kind            other \
  --application-type other \
  --tags            project=heqcis-connector

APP_INSIGHTS_KEY=$(az monitor app-insights component show \
  --app "$APP_INSIGHTS_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query instrumentationKey \
  -o tsv)

echo "[setup] App Insights instrumentation key: $APP_INSIGHTS_KEY"

# ─── Function App (Consumption Plan) ─────────────────────────────────────────
# Consumption Plan = pay-per-execution, scales to zero, no Docker.

echo "[setup] Creating Function App: $FUNCTION_APP_NAME (Consumption Plan)"
az functionapp create \
  --name                    "$FUNCTION_APP_NAME" \
  --resource-group          "$RESOURCE_GROUP" \
  --storage-account         "$STORAGE_ACCOUNT" \
  --consumption-plan-location "$LOCATION" \
  --runtime                 "$RUNTIME" \
  --runtime-version         "$RUNTIME_VERSION" \
  --os-type                 Linux \
  --functions-version       4 \
  --app-insights            "$APP_INSIGHTS_NAME" \
  --tags                    project=heqcis-connector

# ─── System-assigned Managed Identity ────────────────────────────────────────
# Enables the Function App to authenticate to Key Vault without secrets in code.

echo "[setup] Enabling System-assigned Managed Identity on Function App"
az functionapp identity assign \
  --name           "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP"

PRINCIPAL_ID=$(az functionapp identity show \
  --name           "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query principalId \
  -o tsv)

echo "[setup] Managed Identity Principal ID: $PRINCIPAL_ID"

# ─── Key Vault (optional but recommended for production) ─────────────────────
# Stores WEBHOOK_SECRET, SQL_PASSWORD without them appearing in app settings.

echo "[setup] Creating Key Vault: $KEY_VAULT_NAME"
az keyvault create \
  --name             "$KEY_VAULT_NAME" \
  --resource-group   "$RESOURCE_GROUP" \
  --location         "$LOCATION" \
  --sku              standard \
  --enable-rbac-authorization true \
  --tags             project=heqcis-connector

# Grant the Function App's managed identity GET access to secrets
az role assignment create \
  --assignee       "$PRINCIPAL_ID" \
  --role           "Key Vault Secrets User" \
  --scope          "$(az keyvault show --name $KEY_VAULT_NAME --resource-group $RESOURCE_GROUP --query id -o tsv)"

echo "[setup] ✔ Key Vault created and identity granted 'Key Vault Secrets User' role"

# ─── Store secrets in Key Vault ───────────────────────────────────────────────
# Run interactively or pipe values from your secrets manager.

echo ""
echo "──────────────────────────────────────────────"
echo " Next step: populate Key Vault secrets"
echo " Run: ./scripts/set-app-settings.sh"
echo "──────────────────────────────────────────────"
echo ""
echo "[setup] Resource summary:"
echo "  Resource Group:    $RESOURCE_GROUP"
echo "  Storage Account:   $STORAGE_ACCOUNT"
echo "  Function App:      $FUNCTION_APP_NAME"
echo "  App Insights:      $APP_INSIGHTS_NAME (key=$APP_INSIGHTS_KEY)"
echo "  Key Vault:         $KEY_VAULT_NAME"
echo "  Managed Identity:  $PRINCIPAL_ID"
echo ""
echo "[setup] ✔ Azure infrastructure provisioned."
