/**
 * Which document types a resident is allowed to request.
 *
 * Rule 6: only `active` document types are requestable. Archiving a document
 * type must stop new requests immediately without touching the requests that
 * already exist -- a resident holding a pending clearance is unaffected by the
 * type being retired from the menu.
 */

/**
 * @typedef {object} DocumentType
 * @property {number|string} id
 * @property {string} name
 * @property {boolean} isActive
 * @property {number} [priority] Display order.
 * @property {string} [validForDays] How long the issued document stays valid.
 * @property {number} [processingDays] Informational turnaround estimate.
 *
 * @typedef {object} EligibilityResult
 * @property {boolean} eligible
 * @property {string} [reason] Why not, when not eligible.
 * @property {string} [code] Stable identifier for the reason.
 */

/** @type {Readonly<Record<string, string>>} */
const REASON = {
  missing: 'That document type could not be found.',
  inactive: 'That document is no longer available to request.',
};

/**
 * @param {DocumentType|null|undefined} documentType
 * @returns {EligibilityResult}
 */
export function canRequestDocumentType(documentType) {
  if (!documentType) {
    return { eligible: false, code: 'document_type_missing', reason: REASON.missing };
  }
  if (documentType.isActive !== true) {
    return { eligible: false, code: 'document_type_inactive', reason: REASON.inactive };
  }
  return { eligible: true };
}

/**
 * Convenience predicate for the single-case check at the call site.
 *
 * @param {DocumentType|null|undefined} documentType
 * @returns {boolean}
 */
export function isDocumentTypeRequestable(documentType) {
  return canRequestDocumentType(documentType).eligible;
}

/**
 * Document types a resident should see, ordered for the picker.
 *
 * @param {DocumentType[]} documentTypes
 * @returns {DocumentType[]}
 */
export function listRequestableDocumentTypes(documentTypes) {
  return documentTypes
    .filter((type) => isDocumentTypeRequestable(type))
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.name.localeCompare(b.name));
}