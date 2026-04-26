// azure-functions/src/index.ts
// Azure Functions v4 entry point.
// Importing each function module registers it with the Azure Functions runtime.
// The order of imports does not affect scheduling.

import './functions/sqlCheck.js';
import './functions/backupCheck.js';
import './functions/etlCheck.js';
import './functions/performanceCheck.js';
import './functions/integrityCheck.js';
import './functions/indexCheck.js';
