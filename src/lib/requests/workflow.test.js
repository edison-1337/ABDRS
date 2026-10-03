import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUEST_STATUSES,
  ALLOWED_TRANSITIONS,
  isLegalTransition,
  isTerminalStatus,
  assertLegalTransition,
  assertNotTerminal,
  assertRoleMayTransition,
  assertRejectionReason,
  assertCancellationReason,
  mainlineIndex,
  STATUS_LABELS,
  WorkflowError,
} from './workflow.js';

describe('the transition table', () => {
  test('released, rejected, and cancelled have no outgoing transitions', () => {
    for (const terminal of ['released', 'rejected', 'cancelled']) {
      assert.deepEqual(ALLOWED_TRANSITIONS[terminal], [], `${terminal} must be terminal`);
    }
  });

  test('only approved may become released', () => {
    for (const from of REQUEST_STATUSES) {
      const expected = from === 'approved';
      assert.equal(
        ALLOWED_TRANSITIONS[from].includes('released'),
        expected,
        `${from} -> released should be ${expected}`,
      );
    }
  });

  test('no status may become submitted', () => {
    for (const from of REQUEST_STATUSES) {
      assert.equal(ALLOWED_TRANSITIONS[from].includes('submitted'), false);
    }
  });

  test('no transition targets the same status', () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      assert.equal(targets.includes(/** @type {string} */ (from)), false);
    }
  });

  test('every target is a declared status', () => {
    for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
      for (const to of targets) {
        assert.ok(REQUEST_STATUSES.includes(/** @type {never} */ (to)), `${to} must be a declared status`);
      }
    }
  });
});

describe('isLegalTransition', () => {
  test('allows the documented mainline path', () => {
    assert.equal(isLegalTransition('submitted', 'under_review'), true);
    assert.equal(isLegalTransition('under_review', 'approved'), true);
    assert.equal(isLegalTransition('approved', 'released'), true);
  });

  test('refuses skipping review and approval', () => {
    assert.equal(isLegalTransition('submitted', 'released'), false);
    assert.equal(isLegalTransition('submitted', 'approved'), true);
  });

  test('refuses reviving a terminal request', () => {
    for (const from of ['released', 'rejected', 'cancelled']) {
      for (const to of REQUEST_STATUSES) {
        assert.equal(isLegalTransition(/** @type {any} */ (from), to), false, `${from} -> ${to}`);
      }
    }
  });

  test('refuses undeclared statuses', () => {
    assert.equal(isLegalTransition('submitted', 'archived'), false);
    assert.equal(isLegalTransition('archived', 'submitted'), false);
    assert.equal(isLegalTransition(null, 'approved'), false);
  });
});

describe('assertLegalTransition', () => {
  test('returns quietly on a legal transition', () => {
    assert.doesNotThrow(() => assertLegalTransition('submitted', 'under_review'));
  });

  test('throws a terminal_status error once released', () => {
    assert.throws(() => assertLegalTransition('released', 'approved'), (error) => {
      assert.ok(error instanceof WorkflowError);
      assert.equal(error.code, 'terminal_status');
      return true;
    });
  });

  test('throws an illegal_transition error for a skipped stage', () => {
    assert.throws(() => assertLegalTransition('submitted', 'released'), (error) => {
      assert.ok(error instanceof WorkflowError);
      assert.equal(error.code, 'illegal_transition');
      return true;
    });
  });

  test('reports what was allowed, so the caller can suggest it', () => {
    assert.throws(() => assertLegalTransition('under_review', 'released'), (error) => {
      assert.ok(error instanceof WorkflowError);
      assert.ok(Array.isArray(error.details.allowed));
      assert.ok(error.details.allowed.includes('approved'));
      return true;
    });
  });
});

describe('isTerminalStatus', () => {
  test('identifies the three terminal statuses', () => {
    assert.equal(isTerminalStatus('released'), true);
    assert.equal(isTerminalStatus('rejected'), true);
    assert.equal(isTerminalStatus('cancelled'), true);
  });

  test('identifies the live statuses', () => {
    assert.equal(isTerminalStatus('submitted'), false);
    assert.equal(isTerminalStatus('under_review'), false);
    assert.equal(isTerminalStatus('approved'), false);
  });
});

describe('assertNotTerminal', () => {
  test('throws for a released request', () => {
    assert.throws(() => assertNotTerminal('released'), WorkflowError);
  });

  test('passes for a live request', () => {
    assert.doesNotThrow(() => assertNotTerminal('approved'));
  });
});

describe('assertRoleMayTransition', () => {
  test('lets a clerk submit and review', () => {
    assert.doesNotThrow(() => assertRoleMayTransition('submitted', 'under_review', 'clerk'));
  });

  test('refuses a clerk approving, which is a captain decision', () => {
    assert.throws(() => assertRoleMayTransition('approved', 'released', 'clerk'), (error) => {
      assert.ok(error instanceof WorkflowError);
      assert.equal(error.code, 'role_not_permitted');
      return true;
    });
  });

  test('lets a captain approve and release', () => {
    assert.doesNotThrow(() => assertRoleMayTransition('approved', 'released', 'captain'));
    assert.doesNotThrow(() => assertRoleMayTransition('under_review', 'approved', 'captain'));
  });

  test('lets an admin do either', () => {
    assert.doesNotThrow(() => assertRoleMayTransition('approved', 'released', 'admin'));
  });

  test('refuses an unknown role', () => {
    assert.throws(() => assertRoleMayTransition('submitted', 'under_review', 'intern'), WorkflowError);
  });
});

describe('assertRejectionReason', () => {
  test('accepts and trims a real reason', () => {
    assert.equal(assertRejectionReason('  Missing proof of residency  '), 'Missing proof of residency');
  });

  test('refuses an empty or whitespace-only reason', () => {
    assert.throws(() => assertRejectionReason(''), (error) => {
      assert.ok(error instanceof WorkflowError);
      assert.equal(error.code, 'reason_required');
      return true;
    });
    assert.throws(() => assertRejectionReason('   '), WorkflowError);
    assert.throws(() => assertRejectionReason(null), WorkflowError);
  });

  test('refuses an unreasonably long reason', () => {
    assert.throws(() => assertRejectionReason('x'.repeat(501)), WorkflowError);
  });
});

describe('assertCancellationReason', () => {
  test('accepts a declared reason while submitted', () => {
    assert.equal(assertCancellationReason('submitted', 'no_longer_needed'), 'no_longer_needed');
  });

  test('refuses an undeclared reason', () => {
    assert.throws(() => assertCancellationReason('submitted', 'because'), (error) => {
      assert.ok(error instanceof WorkflowError);
      assert.equal(error.code, 'invalid_cancellation_reason');
      return true;
    });
  });

  test('refuses cancellation once approved', () => {
    assert.throws(() => assertCancellationReason('approved', 'no_longer_needed'), WorkflowError);
    assert.throws(() => assertCancellationReason('approved', 'no_longer_needed'), (error) => {
      assert.ok(error instanceof WorkflowError);
      assert.equal(error.code, 'cancellation_not_available');
      return true;
    });
  });
});

describe('mainlineIndex', () => {
  test('orders the mainline from submitted to released', () => {
    assert.equal(mainlineIndex('submitted'), 0);
    assert.equal(mainlineIndex('under_review'), 1);
    assert.equal(mainlineIndex('approved'), 2);
    assert.equal(mainlineIndex('released'), 3);
  });

  test('reports -1 for a branch off the mainline', () => {
    assert.equal(mainlineIndex('rejected'), -1);
    assert.equal(mainlineIndex('cancelled'), -1);
  });
});

describe('STATUS_LABELS', () => {
  test('covers every declared status', () => {
    for (const status of REQUEST_STATUSES) {
      assert.equal(typeof STATUS_LABELS[status], 'string');
      assert.ok(STATUS_LABELS[status].length > 0);
    }
  });
});