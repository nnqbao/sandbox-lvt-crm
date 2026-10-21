import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as server from '../convex/classOrder.ts';
import * as client from '../src/homeroom/classOrder.js';

const GRADE_SIZES = { 6: 12, 7: 11, 8: 13, 9: 14 };

function realClasses() {
  const rows = [];
  for (const [grade, size] of Object.entries(GRADE_SIZES)) {
    for (let n = 1; n <= size; n += 1) {
      rows.push({ _id: `id-${grade}-${n}`, gradeLevel: Number(grade), code: `2627-${grade}-${n}`, name: `Lớp ${grade}-${n}` });
    }
  }
  return rows;
}

function shuffled(rows, seed = 7) {
  const copy = rows.slice();
  let state = seed;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const expectedNames = realClasses().map((row) => row.name);

for (const [label, mod] of [['convex', server], ['client', client]]) {
  test(`${label}: 2026-2027 classes sort 6-1..6-12, 7-1..7-11, 8-1..8-13, 9-1..9-14`, () => {
    const alphabetical = realClasses().sort((a, b) => a.code.localeCompare(b.code, 'vi'));
    assert.notDeepEqual(alphabetical.map((row) => row.name), expectedNames, 'fixture must expose the old bug');
    assert.deepEqual(mod.sortClassesNatural(alphabetical).map((row) => row.name), expectedNames);
    assert.deepEqual(mod.sortClassesNatural(shuffled(realClasses())).map((row) => row.name), expectedNames);
  });

  test(`${label}: sortClassesNatural does not mutate and tolerates empty input`, () => {
    const input = [realClasses()[1], realClasses()[0]];
    const before = input.map((row) => row.code);
    mod.sortClassesNatural(input);
    assert.deepEqual(input.map((row) => row.code), before);
    assert.deepEqual(mod.sortClassesNatural([]), []);
    if (label === 'client') {
      assert.deepEqual(mod.sortClassesNatural(undefined), []);
      assert.deepEqual(mod.sortClassesNatural(null), []);
    }
  });

  test(`${label}: parseClassNumber handles common class code shapes`, () => {
    assert.equal(mod.parseClassNumber('2627-6-10', 6), 10);
    assert.equal(mod.parseClassNumber('Lớp 6-2', 6), 2);
    assert.equal(mod.parseClassNumber('6/12', 6), 12);
    assert.equal(mod.parseClassNumber('6A10', 6), 10);
    assert.equal(mod.parseClassNumber('Lớp QA 6A1', 6), 1);
    assert.equal(mod.parseClassNumber('610', 6), 10);
    assert.equal(mod.parseClassNumber('Lớp 6-1 (CLC)', 6), 1);
    assert.equal(mod.parseClassNumber('2626-6-3', 6), 3);
    assert.equal(mod.parseClassNumber('Lớp QA đã sửa', 6), null);
    assert.equal(mod.parseClassNumber('2627-6-1', 7), null, 'grade mismatch falls back');
    assert.equal(mod.parseClassNumber('', 6), null);
  });

  test(`${label}: grade first, numbered classes before unnumbered, numeric string fallback`, () => {
    const rows = [
      { _id: 'c', gradeLevel: 7, code: '7A2', name: '7A2' },
      { _id: 'd', gradeLevel: 6, code: 'Lớp QA đã sửa', name: 'Lớp QA đã sửa' },
      { _id: 'e', gradeLevel: 6, code: '6A10', name: '6A10' },
      { _id: 'f', gradeLevel: 6, code: '6A2', name: '6A2' },
      { _id: 'g', gradeLevel: null, code: 'X-10', name: 'X-10' },
      { _id: 'h', gradeLevel: null, code: 'X-9', name: 'X-9' },
    ];
    assert.deepEqual(mod.sortClassesNatural(rows).map((row) => row._id), ['f', 'e', 'd', 'c', 'h', 'g']);
  });

  test(`${label}: uses name when code has no class number, and works without gradeLevel`, () => {
    const byName = [
      { _id: 'a', gradeLevel: 6, code: 'K6-B', name: 'Lớp 6-10' },
      { _id: 'b', gradeLevel: 6, code: 'K6-A', name: 'Lớp 6-9' },
    ];
    assert.deepEqual(mod.sortClassesNatural(byName).map((row) => row._id), ['b', 'a']);
    const noGrade = [{ code: '2627-6-10' }, { code: '2627-6-2' }, { code: '2627-6-1' }];
    assert.deepEqual(mod.sortClassesNatural(noGrade).map((row) => row.code), ['2627-6-1', '2627-6-2', '2627-6-10']);
  });
}

test('convex and client comparators agree on every pair', () => {
  const rows = [
    ...realClasses(),
    { _id: 'x1', gradeLevel: 6, code: 'Lớp QA 6A1', name: 'Lớp QA 6A1' },
    { _id: 'x2', gradeLevel: 6, code: 'Lớp QA đã sửa', name: 'Lớp QA đã sửa' },
    { _id: 'x3', gradeLevel: '8', code: '8/3', name: '8/3' },
    { _id: 'x4', code: 'Không khối', name: 'Không khối' },
  ];
  for (const a of rows) {
    for (const b of rows) {
      assert.equal(Math.sign(server.compareClasses(a, b)), Math.sign(client.compareClasses(a, b)), `${a.code} vs ${b.code}`);
    }
  }
  assert.deepEqual(server.sortClassesNatural(shuffled(rows, 3)), client.sortClassesNatural(shuffled(rows, 3)));
});

test('class lists in convex queries and homeroom UI use the natural class order', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.match(read('convex/homeroomClasses.ts'), /const sortByGradeAndCode = sortClassesNatural;/);
  const reports = read('convex/homeroomReports.ts');
  assert.match(reports, /const sortClasses = sortClassesNatural;/);
  assert.match(reports, /compareClasses\(classA, classB\)/);
  assert.match(reports, /gradeLevel: klass\?\.gradeLevel \?\? null/);
  assert.match(read('convex/supervisorAttendance.ts'), /\.sort\(compareClasses\)/);
  for (const path of ['convex/homeroomClasses.ts', 'convex/homeroomReports.ts', 'convex/supervisorAttendance.ts']) {
    assert.doesNotMatch(read(path), /a\.code\.localeCompare\(b\.code/, `${path} must not sort classes alphabetically`);
  }
  assert.match(read('src/homeroom/HomeroomOverview.jsx'), /sortClassesNatural\(overview\?\.classes\)/);
  assert.match(read('src/homeroom/HomeroomClassCatalog.jsx'), /sortClassesNatural\(classes\)/);
  assert.match(read('src/homeroom/HomeroomRoster.jsx'), /sortClassesNatural\(classes\)/);
});
