// packages/core/src/domain/changeRequest.ts
// Reference generation for change request records.

const PAD = 4;

/**
 * Generates a reference in the format CHG-YYYY-NNNN.
 * @param sequence - 1-based integer, padded to 4 digits
 */
export function generateChangeRequestReference(sequence: number): string {
  const year = new Date().getFullYear();
  const seq  = String(sequence).padStart(PAD, '0');
  return `CHG-${year}-${seq}`;
}
