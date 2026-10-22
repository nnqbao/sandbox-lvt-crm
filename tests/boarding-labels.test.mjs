import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { boardingPeriodLabel } from '../src/boarding/boardingLabels.js';

test('Bán trú: một cách gọi kỳ cho quản lý, báo cáo và đánh giá nhân sự', () => {
  assert.equal(boardingPeriodLabel({ semester: 2, schoolYear: '2026-2027' }), 'Học kỳ 2 · Năm học 2026-2027');
  assert.equal(boardingPeriodLabel({ semester: 1, schoolYear: '2026-2027' }, { short: true }), 'Học kỳ 1');
  assert.equal(boardingPeriodLabel(null), '');
  for (const file of ['src/boarding/BoardingManagement.jsx', 'src/boarding/BoardingReportsView.jsx', 'src/peopleReview/PeopleReviewView.jsx']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /boardingPeriodLabel\(/, file);
    assert.doesNotMatch(source, /`HK ?\$\{|>HK \{|`Kỳ \$\{period\.semester\}/, file);
  }
  const server = readFileSync(new URL('../convex/peopleReview.ts', import.meta.url), 'utf8');
  assert.match(server, /label: `Học kỳ \$\{period\.semester\} · Năm học \$\{period\.schoolYear\}`/);
});
