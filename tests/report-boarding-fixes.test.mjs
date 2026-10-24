import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('work report detail: an unfinished task reads "Chưa hoàn thành", only a document is "Chờ duyệt"', () => {
  const source = read('src/reports/WorkReportsView.jsx');
  assert.match(source, /if \(event\.status === 'pending' && event\.kind !== 'document'\) return 'Chưa hoàn thành';/);
  assert.match(source, /<span className=\{`report-detail-status status-\$\{event\.status\}`\}>\{eventStatusLabel\(event\)\}<\/span>/);
  // Backend: documents are the only events of kind "document"; tasks use pending for "not finished".
  assert.match(read('convex/reports.ts'), /kind: "document",\n\s+kindLabel: "Công văn"/);
});

test('boarding teacher picker: select/clear act on the filtered people while searching', () => {
  const source = read('src/boarding/BoardingManagement.jsx');
  assert.match(source, /setDraftIds\(\[\.\.\.new Set\(\[\.\.\.draftIds, \.\.\.filteredUsers\.map\(\(user\) => user\._id\)\]\)\]\)/);
  assert.match(source, /search\.trim\(\) \? `Chọn \$\{filteredUsers\.length\} người đang hiện` : 'Chọn tất cả'/);
  assert.doesNotMatch(source, /setDraftIds\(users\.map/, 'never selects people hidden by the search');
});
