/**
 * The required-document checklist that gates approval.
 *
 * Rule 7: every required document must be on file before approval. This module
 * decides whether that is true. It never uploads, never fetches, and never
 * touches the filesystem -- the repository supplies what is on file and this
 * module judges it.
 *
 * Requirement records live on the document type, so the checklist is derived
 * fresh on every validation rather than being trusted from an earlier snapshot.
 */

/**
 * @typedef {object} Requirement
 * @property {number|string} id Stable identifier. Submitted documents reference this.
 * @property {string} label What the resident must provide.
 * @property {string} [description] Extra guidance shown beside the input.
 * @property {boolean} [required] Defaults to true. Optional items never block.
 * @property {number} [position] Display order.
 *
 * @typedef {object} SubmittedDocument
 * @property {number|string} requirementId The `id` of the requirement it satisfies.
 * @property {string} status One of `pending`, `uploaded`, `verified`, `rejected`.
 */

/** Document statuses that count as satisfied. */
const SATISFIED_STATUSES = /** @type {readonly string[]} */ (['uploaded', 'verified']);

/**
 * Merges a document type's requirements with what has been submitted.
 *
 * @param {Requirement[]} requirements Declared on the document type.
 * @param {SubmittedDocument[]} submitted What the resident has provided.
 * @returns {Array<Requirement & {status: string, satisfied: boolean}>}
 */
export function checkRequirements(requirements, submitted = []) {
  const byRequirementId = new Map();
  for (const doc of submitted) {
    // Last write wins, so a re-upload supersedes an earlier rejection.
    byRequirementId.set(String(doc.requirementId), doc);
  }

  return [...requirements]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((requirement, index) => {
      const record = byRequirementId.get(String(requirement.id));
      const status = record?.status ?? 'pending';
      return {
        ...requirement,
        required: requirement.required !== false,
        position: requirement.position ?? index,
        status,
        satisfied: SATISFIED_STATUSES.includes(status),
      };
    });
}

/**
 * Required items that are not yet satisfied.
 *
 * Optional items are excluded: an optional document can never block approval.
 *
 * @param {Array<Requirement & {required: boolean, satisfied: boolean}>} checklist
 * @returns {string[]} Labels of the required items still outstanding.
 */
export function missingRequirements(checklist) {
  return checklist.filter((item) => item.required && !item.satisfied).map((item) => item.label);
}

/**
 * @param {Array<Requirement & {required: boolean, satisfied: boolean}>} checklist
 * @returns {boolean} True when nothing required is outstanding.
 */
export function requirementsSatisfied(checklist) {
  return missingRequirements(checklist).length === 0;
}

/**
 * Builds the `critical` findings for an incomplete checklist.
 *
 * Returned as findings rather than a thrown error so the validator can present
 * everything wrong with a request at once, and so the caller keeps the choice of
 * whether to block.
 *
 * @param {Array<Requirement & {required: boolean, satisfied: boolean}>} checklist
 * @param {(code: string, message: string, details?: Record<string, unknown>) => import('./validation.js').Finding} createFinding
 * @returns {import('./validation.js').Finding[]}
 */
export function requirementFindings(checklist, createFinding) {
  const missing = missingRequirements(checklist);
  if (missing.length === 0) return [];

  return [
    createFinding(
      'critical',
      'requirements_incomplete',
      missing.length === 1
        ? 'One required document is still missing.'
        : `${missing.length} required documents are still missing.`,
      { missing },
    ),
  ];
}