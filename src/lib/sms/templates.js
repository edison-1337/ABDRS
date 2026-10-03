/**
 * Message templates.
 *
 * Every SMS body in the system is composed here. Route handlers never build a
 * message string, and neither does the browser -- so a wording change is one edit
 * and no notification can silently ship with a blank or half-filled body.
 *
 * TextBee sends through a real handset, so bodies are plain text, kept short
 * enough to survive a long message being split, and written for someone reading
 * a phone outdoors in Philippine sunlight.
 */

/** @typedef {import('./providers/index.js').SmsEvent} SmsEvent */

/**
 * @typedef {object} TemplateContext
 * @property {string} controlNumber For the resident to quote.
 * @property {string} documentName
 * @property {string} [reason] Rejection reason.
 * @property {string} [pickupDate] Human-readable pickup date.
 * @property {string} [pickupWindow] Human-readable pickup window.
 * @property {string} [barangayName] Overrides the configured default.
 * @property {string} [trackUrl] Absolute URL for the tracking page.
 * @property {string} [officeHours]
 */

/** Default sender identity used when a template omits one. */
const DEFAULT_BARANGAY = 'Barangay Office';

/** Hard ceiling. TextBee splits long messages and bills each segment. */
const MAX_LENGTH = 320;

/**
 * The notification events that exist.
 *
 * `cancelled` is absent on purpose: a resident cancelling their own request does
 * not need to be told, they just did it. Every other status change reaches the
 * resident by SMS.
 */
export const SMS_EVENTS = /** @type {const} */ ([
  'submitted',
  'under_review',
  'approved',
  'released',
  'rejected',
]);

/**
 * @type {Readonly<Record<SmsEvent, (ctx: TemplateContext) => string>>}
 */
const TEMPLATES = {
  submitted: (ctx) =>
    [
      `${ctx.barangayName ?? DEFAULT_BARANGAY}: your request for ${ctx.documentName} was received.`,
      `Control no. ${ctx.controlNumber}. We will text you when it is ready.`,
    ].join(' '),

  under_review: (ctx) =>
    [
      `${ctx.barangayName ?? DEFAULT_BARANGAY}: your request ${ctx.controlNumber} (${ctx.documentName}) is now under review.`,
    ].join(' '),

  approved: (ctx) =>
    [
      `${ctx.barangayName ?? DEFAULT_BARANGAY}: your request ${ctx.controlNumber} (${ctx.documentName}) is APPROVED.`,
      'Please bring a valid ID when you claim it.',
    ].join(' '),

  released: (ctx) =>
    [
      `${ctx.barangayName ?? DEFAULT_BARANGAY}: your ${ctx.documentName} is ready under control no. ${ctx.controlNumber}.`,
      ctx.pickupDate ? `Claim it on ${ctx.pickupDate}${ctx.pickupWindow ? `, ${ctx.pickupWindow}` : ''}.` : '',
      ctx.trackUrl ? `Track: ${ctx.trackUrl}` : '',
    ]
      .filter(Boolean)
      .join(' '),

  rejected: (ctx) =>
    [
      `${ctx.barangayName ?? DEFAULT_BARANGAY}: your request ${ctx.controlNumber} (${ctx.documentName}) was declined.`,
      ctx.reason ? `Reason: ${ctx.reason}` : '',
      ctx.trackUrl ? `Details: ${ctx.trackUrl}` : '',
    ]
      .filter(Boolean)
      .join(' '),
};

/**
 * Renders the message for an event.
 *
 * @param {SmsEvent} event
 * @param {TemplateContext} context
 * @returns {string}
 * @throws {Error} When the event has no template, or a required placeholder is
 *   missing. Both are programming errors and must not reach a resident as a
 *   half-filled message.
 */
export function renderTemplate(event, context) {
  const template = TEMPLATES[event];
  if (typeof template !== 'function') {
    throw new Error(`No SMS template is defined for event "${event}".`);
  }

  if (!context?.controlNumber) {
    throw new Error(`Template "${event}" requires a control number.`);
  }
  if (!context?.documentName) {
    throw new Error(`Template "${event}" requires a document name.`);
  }

  const rendered = template(context).replace(/\s{2,}/g, ' ').trim();

  if (rendered.length === 0) {
    throw new Error(`Template "${event}" rendered an empty message.`);
  }
  if (rendered.includes('undefined') || rendered.includes('null')) {
    throw new Error(`Template "${event}" rendered an unresolved placeholder.`);
  }
  if (rendered.length > MAX_LENGTH) {
    throw new Error(`Template "${event}" rendered ${rendered.length} characters, over the ${MAX_LENGTH} limit.`);
  }

  return rendered;
}

/**
 * Every event, for the SMS log filter and for tests that assert coverage.
 *
 * @returns {SmsEvent[]}
 */
export function listSmsEvents() {
  return [...SMS_EVENTS];
}