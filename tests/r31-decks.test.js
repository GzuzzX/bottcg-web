'use strict';
// R31 (Rulebook pp.1,5,14): casual default, tournament explicit, ลำเอียง
// tournament-only ban, normal 50+Only1, 50-copy exception via allowlist,
// name limit counting reprints.
// NOTE: validateDecks takes card ROWS (db objects, as stored in decks),
// not live instances — same shape game.html passes from resolveDeck.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

function row(over) {
  return H.mkDb(Object.assign({ type: 'Avatar', cost: 1, gem: 1, power: 1 }, over || {}));
}
// Legal normal Main: 1 Only #1 + 12x4 fillers + 1 extra = 50, all within limits.
function normalMain() {
  const main = [row({ name: 'Only One', print: 'ONLY-1', ex: 'Only #1' })];
  for (let i = 0; i < 12; i++) {
    for (let k = 0; k < 4; k++) main.push(row({ name: 'Filler' + i, print: 'F' + i + '-' + k }));
  }
  main.push(row({ name: 'Extra', print: 'EX-0' }));
  return main;
}
function life5() {
  const out = [];
  for (let i = 0; i < 5; i++) out.push(row({ name: 'Life' + i, print: 'L' + i, type: 'Life' }));
  return out;
}

test('R31: normal deck passes casual (default) and tournament', () => {
  const { E } = H.loadAll();
  assert.deepEqual(E.validateDecks(normalMain(), life5()), []);
  assert.deepEqual(E.validateDecks(normalMain(), life5(), { format: 'casual' }), []);
  assert.deepEqual(E.validateDecks(normalMain(), life5(), { format: 'tournament' }), []);
});

test('R31: missing or double Only #1 fails (both formats)', () => {
  const { E } = H.loadAll();
  const noOnly = normalMain().filter(c => !(c.ex && /only/i.test(c.ex)));
  // 49 cards now — pad with one more legal filler to isolate the Only rule.
  noOnly.push(row({ name: 'Extra2', print: 'EX-1' }));
  const e1 = E.validateDecks(noOnly, life5());
  assert.ok(e1.some(e => /Only/.test(e)), 'zero Only must fail: ' + e1.join(';'));
  const twoOnly = normalMain();
  twoOnly[1] = row({ name: 'Only Two', print: 'ONLY-2', ex: 'Only #1' });
  const e2 = E.validateDecks(twoOnly, life5(), { format: 'tournament' });
  assert.ok(e2.some(e => /Only/.test(e)), 'two Only must fail: ' + e2.join(';'));
});

test('R31: full-50 special deck passes with zero Only (both formats)', () => {
  const { E } = H.loadAll();
  const special = H.rowFor('ODY1-019'); // รัททาทุย, 50-copy grant in text
  assert.ok(E.SPECIAL_50_NAMES.indexOf(special.name) >= 0, 'candidate must be allowlisted');
  const main = [];
  for (let i = 0; i < 50; i++) main.push(special);
  assert.deepEqual(E.validateDecks(main, life5()), []);
  assert.deepEqual(E.validateDecks(main, life5(), { format: 'tournament' }), []);
});

test('R31: 49 special + 1 other (no Only) fails', () => {
  const { E } = H.loadAll();
  const special = H.rowFor('ODY1-019');
  const main = [];
  for (let i = 0; i < 49; i++) main.push(special);
  main.push(row({ name: 'Stranger', print: 'ST-0' }));
  const errs = E.validateDecks(main, life5());
  assert.ok(errs.some(e => /Only/.test(e)), 'mixed special deck must fail: ' + errs.join(';'));
});

test('R31: 50 special cards of two identities fail', () => {
  const { E } = H.loadAll();
  const a = H.rowFor('ODY1-019'); // รัททาทุย
  const b = H.rowFor('SD08-002'); // รัททาทุย พาหะ
  const main = [];
  for (let i = 0; i < 25; i++) main.push(a);
  for (let i = 0; i < 25; i++) main.push(b);
  const errs = E.validateDecks(main, life5());
  assert.ok(errs.length > 0, 'two-identity 50-deck must fail');
});

test('R31 conservative: same-name mixed prints do not get the exception yet', () => {
  const { E } = H.loadAll();
  // Both are รัททาทุย (allowlisted name) but different prints — cross-print
  // image identity is still unverified, so uniform print is required.
  const a = H.rowFor('ODY1-019');
  const b = H.rowFor('BT01-010');
  assert.equal(a.name, b.name);
  const main = [];
  for (let i = 0; i < 25; i++) main.push(a);
  for (let i = 0; i < 25; i++) main.push(b);
  const errs = E.validateDecks(main, life5());
  assert.ok(errs.length > 0, 'mixed-print 50-deck must fail until reprint identity is verified');
});

test('R31: non-allowlisted 50-of-a-kind still fails (no regex-only grant)', () => {
  const { E } = H.loadAll();
  const main = [];
  for (let i = 0; i < 50; i++) main.push(row({ name: 'Commoner', print: 'C-' + i }));
  const errs = E.validateDecks(main, life5());
  assert.ok(errs.some(e => /เกินลิมิต/.test(e)), '50 copies of a normal card must fail: ' + errs.join(';'));
});

test('R31: ลำเอียง passes casual, fails tournament', () => {
  const { E } = H.loadAll();
  const lam = H.rowFor('PRE0-001'); // ex: ลำเอียง
  const main = normalMain();
  main[1] = lam; // swap one filler, keep 50 + Only 1
  assert.deepEqual(E.validateDecks(main, life5()), []);
  assert.deepEqual(E.validateDecks(main, life5(), { format: 'casual' }), []);
  const errs = E.validateDecks(main, life5(), { format: 'tournament' });
  assert.ok(errs.some(e => /ลำเอียง/.test(e)), 'tournament must reject ลำเอียง: ' + errs.join(';'));
});

test('R31: reprint same-name copies count together toward limit 4', () => {
  const { E } = H.loadAll();
  const main = normalMain();
  // 5 copies of กุ่ย across two prints (2+3) — over limit even though per-print <=4.
  let n = 0;
  for (let i = 0; i < main.length && n < 5; i++) {
    if (!main[i].ex || !/only/i.test(main[i].ex)) {
      main[i] = row({ name: 'กุ่ย', print: n < 2 ? 'PR-A' : 'PR-B' });
      n++;
    }
  }
  const errs = E.validateDecks(main, life5());
  assert.ok(errs.some(e => /กุ่ย.*เกินลิมิต/.test(e)), 'reprints must count together: ' + errs.join(';'));
  // 4 copies across prints (2+2) is legal.
  const main2 = normalMain();
  let m = 0;
  for (let i = 0; i < main2.length && m < 4; i++) {
    if (!main2[i].ex || !/only/i.test(main2[i].ex)) {
      main2[i] = row({ name: 'กุ่ย', print: m < 2 ? 'PR-A' : 'PR-B' });
      m++;
    }
  }
  assert.deepEqual(E.validateDecks(main2, life5()), []);
});

test('R31: LIFE duplicate names fail in both formats; bad format rejected', () => {
  const { E } = H.loadAll();
  const life = life5();
  life[1] = row({ name: 'Life0', print: 'LX', type: 'Life' });
  assert.ok(E.validateDecks(normalMain(), life).some(e => /ชื่อห้ามซ้ำ/.test(e)));
  assert.ok(E.validateDecks(normalMain(), life, { format: 'tournament' }).some(e => /ชื่อห้ามซ้ำ/.test(e)));
  assert.ok(E.validateDecks(normalMain(), life5(), { format: 'vintage' }).some(e => /format/.test(e)));
});
