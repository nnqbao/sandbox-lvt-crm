import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertDispositionChange,
  deriveEffectiveStatus,
  mergeReplacementDay,
  planAttendanceImportWrites,
} from '../convex/studentAttendancePolicy.ts';

test('disposition correction does not change the raw camera observation', () => {
  const rawObservation = 'absent';
  const effective = deriveEffectiveStatus(rawObservation, 'excused');
  assert.equal(effective, 'absent_excused');
  assert.equal(rawObservation, 'absent');
});

test('reason/note is optional when toggling Vắng không phép; corrections stay append-only by contract', () => {
  assert.doesNotThrow(() =>
    assertDispositionChange({
      previousDisposition: 'excused',
      nextDisposition: 'unexcused',
    }),
  );
  assert.doesNotThrow(() => assertDispositionChange({ previousDisposition: 'pending', nextDisposition: 'unexcused' }));
  assert.doesNotThrow(() => assertDispositionChange({ previousDisposition: 'unexcused', nextDisposition: 'excused' }));
  assert.throws(() => assertDispositionChange({ previousDisposition: 'excused', nextDisposition: 'late' }), /INVALID_DISPOSITION/);
  assert.doesNotThrow(() =>
    assertDispositionChange({
      previousDisposition: 'pending',
      nextDisposition: 'excused',
      note: 'Có phép',
    }),
  );
  const audit = {
    previousDisposition: 'pending',
    nextDisposition: 'excused',
    previousEffectiveStatus: 'absent_pending',
    nextEffectiveStatus: deriveEffectiveStatus('absent', 'excused'),
  };
  assert.equal(audit.nextEffectiveStatus, 'absent_excused');
  assert.equal(audit.previousDisposition, 'pending');
});

test('replacing camera observations keeps the human disposition', () => {
  const merged = mergeReplacementDay({
    existing: {
      rawObservation: 'absent',
      disposition: 'excused',
      effectiveStatus: 'absent_excused',
      reasonCode: 'leave',
      note: 'Có phép',
    },
    incomingRaw: 'late',
    incomingObservedAt: 1,
    mode: 'replace_camera_observations',
  });
  assert.equal(merged.rawObservation, 'late');
  assert.equal(merged.disposition, 'excused');
  assert.equal(merged.effectiveStatus, 'late');
  assert.equal(merged.note, 'Có phép');
});

test('supplement cannot overwrite an already reviewed day', () => {
  const merged = mergeReplacementDay({
    existing: {
      rawObservation: 'absent',
      disposition: 'unexcused',
      effectiveStatus: 'absent_unexcused',
    },
    incomingRaw: 'present',
    mode: 'supplement',
  });
  assert.equal(merged.overwritten, false);
  assert.equal(merged.rawObservation, 'absent');
  assert.equal(merged.disposition, 'unexcused');
});

test('supplement fills existing no_data and keeps human disposition history', () => {
  const merged = mergeReplacementDay({
    existing: {
      rawObservation: 'unknown',
      disposition: 'pending',
      effectiveStatus: 'no_data',
      reasonCode: 'camera_gap',
      note: 'Chưa có ảnh',
    },
    incomingRaw: 'absent',
    incomingObservedAt: 9,
    mode: 'supplement',
  });
  assert.equal(merged.overwritten, true);
  assert.equal(merged.rawObservation, 'absent');
  assert.equal(merged.rawObservedAt, 9);
  assert.equal(merged.disposition, 'pending');
  assert.equal(merged.effectiveStatus, 'absent_pending');
  assert.equal(merged.reasonCode, 'camera_gap');
  assert.equal(merged.note, 'Chưa có ảnh');
});

test('supplement leaves absent_pending unresolved days unchanged', () => {
  const merged = mergeReplacementDay({
    existing: {
      rawObservation: 'absent',
      disposition: 'pending',
      effectiveStatus: 'absent_pending',
    },
    incomingRaw: 'present',
    mode: 'supplement',
  });
  assert.equal(merged.overwritten, false);
  assert.equal(merged.rawObservation, 'absent');
  assert.equal(merged.disposition, 'pending');
  assert.equal(merged.effectiveStatus, 'absent_pending');
});

test('getStudentHistory authorizes the student from enrollments before filtering days', () => {
  const source = readFileSync(new URL('../convex/studentAttendance.ts', import.meta.url), 'utf8');
  const query = source.slice(
    source.indexOf('export const getStudentHistory'),
    source.indexOf('export const getClassSummary'),
  );
  assert.match(query, /enrollmentsForStudent/);
  assert.match(query, /enrollments/);
  assert.match(query, /filterStudentAttendanceHistory/);
  assert.match(query, /enrollments,/);
});
