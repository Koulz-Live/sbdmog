// packages/core/src/domain/incident.ts
// Reference generation for incident records.

const PAD = 4;

/**
 * Generates a reference in the format INC-YYYY-NNNN.
 * @param sequence - 1-based integer, padded to 4 digits
 */
export function generateIncidentReference(sequence: number): string {
  const year = new Date().getFullYear();
  const seq  = String(sequence).padStart(PAD, '0');
  return `INC-${year}-${seq}`;
}
