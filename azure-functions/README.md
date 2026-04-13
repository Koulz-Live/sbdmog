# HEQCIS Azure Functions Connector

> **Architecture role:** Narrowly-scoped, no-Docker, connector-only layer.
> Azure is **not** the main application. The main stack is React/Vite on Vercel + Supabase.
> This connector runs scheduled SQL/backup/ETL health checks and pushes signed webhook payloads into the Vercel API.

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│          HEQCIS Main Stack (Vercel)      │
│  React/Vite → api/index.ts → Supabase   │
│  Receives:                               │
│    POST /webhooks/sql-check-results      │
│    POST /webhooks/backup-results         │
│    POST /webhooks/etl-results            │
└───────────────┬─────────────────────────┘
                │ HMAC-signed HTTPS POST
                │
┌───────────────▼─────────────────────────┐
│     Azure Functions Connector Layer      │
│     (Consumption Plan — no Docker)       │
│                                          │
│  ┌───────────┐ ┌────────────┐ ┌───────┐ │
│  │ sqlCheck  │ │backupCheck │ │etlChk │ │
│  │ */30 min  │ │  */4 hrs   │ │*/15mn │ │
│  └─────┬─────┘ └─────┬──────┘ └───┬───┘ │
│        └─────────────┴────────────┘      │
│                  │                       │
│         ┌────────▼────────┐              │
│         │   SQL Server    │              │
│         │ (Heqcis_web DB) │              │
│         │  msdb (jobs/    │              │
│         │   backups)      │              │
│         └─────────────────┘              │
└─────────────────────────────────────────┘
```

---

## Functions

| Function      | Trigger        | Schedule         | Webhook endpoint                 |
|---------------|----------------|------------------|----------------------------------|
| `sqlCheck`    | Timer Trigger  | Every 30 minutes | `/webhooks/sql-check-results`    |
| `backupCheck` | Timer Trigger  | Every 4 hours    | `/webhooks/backup-results`       |
| `etlCheck`    | Timer Trigger  | Every 15 minutes | `/webhooks/etl-results`          |

All schedules are configurable via app settings (`SQL_CHECK_SCHEDULE`, `BACKUP_CHECK_SCHEDULE`, `ETL_CHECK_SCHEDULE`).

---

## Prerequisites

### Tools

```bash
# Node.js 20+
node --version  # v20.x

# Azure CLI
brew install azure-cli          # macOS
# or: https://aka.ms/install-azure-cli

# Azure Functions Core Tools v4
npm install -g azure-functions-core-tools@4 --unsafe-perm true
func --version  # 4.x
```

### Azure Subscription
- Active Azure subscription
- Contributor rights on the target resource group

---

## Local Development

### 1. Install dependencies

```bash
cd azure-functions
npm install
```

### 2. Configure local settings

```bash
cp local.settings.example.json local.settings.json
# Edit local.settings.json — add real SQL connection details and webhook secret
```

**Required values in `local.settings.json`:**

| Key | Example | Notes |
|-----|---------|-------|
| `WEBHOOK_BASE_URL` | `https://your-app.vercel.app` | Your Vercel deployment URL |
| `WEBHOOK_SECRET` | `your-secret-min-32-chars` | Must match `WEBHOOK_SECRET` in Vercel env |
| `SQL_SERVER` | `your-server.database.windows.net` | SQL Server hostname |
| `SQL_DATABASE` | `Heqcis_web` | Database name |
| `SQL_USER` | `heqcis_readonly` | Read-only SQL login |
| `SQL_PASSWORD` | `...` | SQL login password |

### 3. Build and run

```bash
# Option A: use the run script
chmod +x scripts/run-local.sh
./scripts/run-local.sh

# Option B: manual
npm run build
func start
```

### 4. Trigger a function manually (local)

```bash
# Invoke sqlCheck immediately (bypasses timer schedule)
curl -X POST "http://localhost:7071/admin/functions/sqlCheck" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Azure Setup

### 1. Login and select subscription

```bash
az login
az account list --output table
az account set --subscription "<SUBSCRIPTION_ID>"
```

### 2. Provision Azure resources

```bash
export RESOURCE_GROUP=rg-heqcis-connector
export LOCATION=southafricanorth        # Closest Azure region to CHE
export STORAGE_ACCOUNT=stheqcisconn    # 3-24 chars, lowercase, no hyphens
export FUNCTION_APP_NAME=func-heqcis-connector
export KEY_VAULT_NAME=kv-heqcis-conn

chmod +x scripts/setup-azure.sh
./scripts/setup-azure.sh
```

**Resources created (Consumption Plan only — no VMs, no Docker):**
- Resource group
- Storage account (LRS — cheapest tier)
- Function App (Consumption Plan — pay per execution, scales to zero)
- Application Insights (lightweight telemetry)
- Key Vault (secret storage — optional but recommended)
- System-assigned Managed Identity (Key Vault access — no secrets in code)

### 3. Configure app settings

```bash
export FUNCTION_APP_NAME=func-heqcis-connector
export RESOURCE_GROUP=rg-heqcis-connector
export KEY_VAULT_NAME=kv-heqcis-conn
export WEBHOOK_BASE_URL=https://your-app.vercel.app
export SQL_SERVER=your-server.database.windows.net

chmod +x scripts/set-app-settings.sh
./scripts/set-app-settings.sh
```

---

## Deployment

```bash
export FUNCTION_APP_NAME=func-heqcis-connector
chmod +x scripts/deploy-functionapp.sh
./scripts/deploy-functionapp.sh
```

Or manually:

```bash
cd azure-functions
npm run build
func azure functionapp publish func-heqcis-connector --typescript
```

### Verify deployment

```bash
# List all registered functions
func azure functionapp list-functions func-heqcis-connector

# View recent execution logs
az monitor app-insights query \
  --apps appi-heqcis-connector \
  --resource-group rg-heqcis-connector \
  --analytics-query "traces | where timestamp > ago(1h) | order by timestamp desc | take 50" \
  --output table

# Stream live logs
func azure functionapp logstream func-heqcis-connector
```

---

## Operations

### Update a single app setting

```bash
az functionapp config appsettings set \
  --name func-heqcis-connector \
  --resource-group rg-heqcis-connector \
  --settings "SQL_CHECK_SCHEDULE=0 */10 * * * *"
```

### Rotate the webhook secret

```bash
# 1. Generate a new secret
NEW_SECRET=$(openssl rand -hex 32)

# 2. Update in Key Vault
az keyvault secret set \
  --vault-name kv-heqcis-conn \
  --name webhook-secret \
  --value "$NEW_SECRET"

# 3. Update in Vercel environment variables
# (Vercel Dashboard → Project → Settings → Environment Variables → WEBHOOK_SECRET)

# 4. Restart the Function App to pick up the new Key Vault value
az functionapp restart \
  --name func-heqcis-connector \
  --resource-group rg-heqcis-connector
```

### Change a timer schedule

```bash
# ETL check every 10 minutes instead of 15
az functionapp config appsettings set \
  --name func-heqcis-connector \
  --resource-group rg-heqcis-connector \
  --settings "ETL_CHECK_SCHEDULE=0 */10 * * * *"
```

### Tear down all Azure resources

```bash
# ⚠ Destructive — removes all Azure connector resources
az group delete \
  --name rg-heqcis-connector \
  --yes \
  --no-wait
```

---

## Webhook Integration (Vercel side)

The Vercel API receives signed payloads at three endpoints:

```
POST /webhooks/sql-check-results
POST /webhooks/backup-results
POST /webhooks/etl-results
```

### Headers sent by the connector

| Header | Example | Purpose |
|--------|---------|---------|
| `x-heqcis-signature` | `sha256=abc123…` | HMAC-SHA256 of `timestamp.body` |
| `x-heqcis-timestamp` | `2026-04-13T10:00:00.000Z` | ISO timestamp — check freshness |
| `x-heqcis-source` | `azure-sql-connector` | Connector identity |

### Verifying signatures in Vercel

```typescript
// In api/webhooks/sqlCheckResults.ts (already implemented)
import { createHmac, timingSafeEqual } from 'crypto';

function verify(secret: string, timestamp: string, rawBody: string, signature: string): boolean {
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  const sig = signature.replace(/^sha256=/, '');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
```

---

## Example Payloads

### SQL Check

```json
{
  "source": "azure-sql-connector",
  "job_name": "sqlCheck",
  "environment": "production",
  "timestamp": "2026-04-13T10:00:00.000Z",
  "payload_version": "1.0",
  "data": {
    "status": "healthy",
    "duration_ms": 142,
    "checked_at": "2026-04-13T10:00:00.000Z",
    "details": [
      { "check_name": "connectivity",         "value": "reachable",  "unit": null,          "is_healthy": true,  "message": null },
      { "check_name": "active_connections",   "value": 12,           "unit": "connections", "is_healthy": true,  "message": null },
      { "check_name": "database_size_mb",     "value": 2048,         "unit": "MB",          "is_healthy": true,  "message": null },
      { "check_name": "long_running_queries", "value": 0,            "unit": "queries_over_5min", "is_healthy": true, "message": null }
    ],
    "error_message": null
  }
}
```

### Backup Check

```json
{
  "source": "azure-backup-connector",
  "job_name": "backupCheck",
  "environment": "production",
  "timestamp": "2026-04-13T04:00:00.000Z",
  "payload_version": "1.0",
  "data": {
    "status": "warning",
    "database_name": "Heqcis_web",
    "last_backup_at": "2026-04-12T23:00:00.000Z",
    "last_failure_at": null,
    "last_backup_type": "full",
    "last_backup_size_bytes": 4294967296,
    "last_backup_duration_seconds": 312,
    "noinit_risk_detected": true,
    "disk_free_bytes": null,
    "error_message": null,
    "remediation_note": "NOINIT risk detected. Update the backup script to use INIT to prevent chain corruption.",
    "checked_at": "2026-04-13T04:00:00.000Z"
  }
}
```

### ETL Check

```json
{
  "source": "azure-etl-connector",
  "job_name": "etlCheck",
  "environment": "production",
  "timestamp": "2026-04-13T10:15:00.000Z",
  "payload_version": "1.0",
  "data": {
    "status": "stale",
    "job_name": "HEQCISWEB_Job",
    "last_success_at": "2026-04-12T06:00:00.000Z",
    "last_failure_at": null,
    "restart_required": true,
    "backlog_rows": null,
    "rows_processed": null,
    "rows_failed": null,
    "failure_reason": null,
    "notes": "Job is enabled. Job requires manual restart.",
    "checked_at": "2026-04-13T10:15:00.000Z"
  }
}
```

---

## Security

| Control | Implementation |
|---------|---------------|
| Secrets | Stored in Azure Key Vault, referenced via Managed Identity — never in code |
| SQL access | Read-only login (`heqcis_readonly`) — no INSERT/UPDATE/DELETE/EXECUTE |
| Webhook auth | HMAC-SHA256 signed payloads, verified by Vercel receiver |
| Timestamp check | Vercel receivers should reject payloads with `x-heqcis-timestamp` > 5 min old |
| TLS | All SQL connections use `encrypt=true`, all webhook POSTs use HTTPS |
| No data mutation | Connector never writes to HEQCIS or Supabase directly |
| Environment separation | `HEQCIS_ENVIRONMENT` tag in every payload for filtering |

---

## Cost Estimate (Consumption Plan)

| Resource | Tier | Estimated Cost |
|----------|------|----------------|
| Function App | Consumption | ~$0/month (first 1M executions free) |
| Storage Account | Standard LRS | ~$0.50/month |
| Application Insights | Pay-as-you-go | ~$0–2/month for low volumes |
| Key Vault | Standard | ~$0.03/month + $0.03/10K operations |
| **Total** | | **< $5/month** |

---

## Least-Privilege SQL Setup

```sql
-- Run on SQL Server as sysadmin
-- Creates the read-only connector login

CREATE LOGIN heqcis_readonly WITH PASSWORD = '<strong-password>';

-- Heqcis_web database
USE Heqcis_web;
CREATE USER heqcis_readonly FOR LOGIN heqcis_readonly;
GRANT SELECT ON SCHEMA::dbo TO heqcis_readonly;
DENY INSERT, UPDATE, DELETE, EXECUTE ON SCHEMA::dbo TO heqcis_readonly;

-- msdb for backup and ETL job history
USE msdb;
CREATE USER heqcis_readonly FOR LOGIN heqcis_readonly;
GRANT SELECT ON dbo.backupset           TO heqcis_readonly;
GRANT SELECT ON dbo.sysjobs             TO heqcis_readonly;
GRANT SELECT ON dbo.sysjobhistory       TO heqcis_readonly;
GRANT SELECT ON dbo.sysjobsteps         TO heqcis_readonly;
```
