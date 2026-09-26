'use strict';
// R01 (Rulebook p.4/p.13): Magic has NO summon Cost field. cards.json `cost` on
// Magic rows is NOT a GEM payment — only text costs (before ':') apply.
// These tests lock the corrected semantics: SD01-020 Land plays free,
// SD01-018 pays exactly its text cost (discard 1 เทพ Avatar), never db.cost GEM.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

function magicDb(sub, cost, extra) {
  return H.mkDb({ name: 'M-' + sub, print: 'TEST-M-' + sub + '-' + cost, type: 'Magic', subtype: sub, cost, mainEffect: extra || 'จั่วการ์ด 1 ใบ' });
}

test('R01: Magic with db.cost plays free when text has no cost (no GEM)', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.players[0].main = [H.mkInst(H.mkDb({ name: 'D' }), 0)];
  const m = H.mkInst(magicDb('Normal', 2), 0);
  H.giveHand(st, 0, [m]);
  global.BoTCardScripts['TEST-M-Normal-2'] = { abilities: [{ id: 'a', kind: 'triggered', trigger: 'onResolve', ops: [{ op: 'draw', n: 1, who: 'me' }] }] };
  const r = E.playMagic(st, 0, m.uid, {});
  assert.equal(r.ok, true);
  assert.equal(st.players[0].magicUsed.Normal, 1);
  delete global.BoTCardScripts['TEST-M-Normal-2'];
});

test('R01: stray GEM payUids on Magic are rejected (no double-pay)', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const m = H.mkInst(magicDb('Normal', 1), 0);
  const g = H.mkInst(H.mkDb({ name: 'G', print: 'G', type: 'Avatar', gem: 1, gemColor: 'ฟ้า' }), 0);
  H.giveHand(st, 0, [m, g]);
  const before = H.snapshot(st);
  const r = E.playMagic(st, 0, m.uid, { payUids: [g.uid] });
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
  assert.equal(st.players[0].magicUsed.Normal, undefined);
});

test('R01: SD01-020 Land plays with no discard (text is an aura)', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const row = H.rowFor('SD01-020');
  const land = H.mkInst(row, 0);
  H.giveHand(st, 0, [land]);
  const r = E.playMagic(st, 0, land.uid, {});
  assert.equal(r.ok, true);
  assert.ok(st.land && st.land.card.uid === land.uid);
});

test('R01: SD01-018 pays exactly its text cost (1 เทพ Avatar), never db.cost GEM', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = H.newEmptyGame(E);
  st.players[0].main = [H.mkInst(H.mkDb({ name: 'D1' }), 0), H.mkInst(H.mkDb({ name: 'D2' }), 0)];
  const row = H.rowFor('SD01-018');
  const m = H.mkInst(row, 0);
  const tep = H.mkInst(H.mkDb({ name: 'Tep', type: 'Avatar', symbol: 'เทพ' }), 0);
  H.giveHand(st, 0, [m, tep]);
  const r = E.playMagic(st, 0, m.uid, { discardUids: [tep.uid] });
  assert.equal(r.ok, true);
  assert.equal(st.players[0].hand.length, 2); // m+tep gone, drew 2
  assert.ok(st.players[0].hell.find(c => c.uid === tep.uid));
  assert.ok(st.players[0].hell.find(c => c.uid === m.uid));
});

test('Magic duplicate GEM fails without mutation', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  // Avatar summon still enforces GEM rules — duplicate selection rejected.
  const av = H.mkInst(H.mkDb({ name: 'AV', print: 'TAV', type: 'Avatar', cost: 1 }), 0);
  const g = H.mkInst(H.gemCard('G', 1), 0);
  H.giveHand(st, 0, [av, g]);
  const before = H.snapshot(st);
  const r = E.summonAvatar(st, 0, av.uid, [g.uid, g.uid]);
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
});

test('Magic self-payment and stale fail without mutation', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const av = H.mkInst(H.mkDb({ name: 'AV2', print: 'TAV2', type: 'Avatar', cost: 1 }), 0);
  const g = H.mkInst(H.gemCard('G', 2), 0);
  H.giveHand(st, 0, [av, g]);
  const before = H.snapshot(st);
  let r = E.summonAvatar(st, 0, av.uid, [av.uid]);
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
  r = E.summonAvatar(st, 0, av.uid, [999999]);
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
});

test('Modification invalid target preserves card/payment/allowance', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const mod = H.mkInst(H.mkDb({ name: 'Mod', print: 'TMOD', type: 'Magic', subtype: 'Modification', cost: 1, mainEffect: 'Avatar ที่สวมใส่การ์ดใบนี้ POWER +1' }), 0);
  H.giveHand(st, 0, [mod]);
  // no avatar target
  const before = H.snapshot(st);
  const r = E.playMagic(st, 0, mod.uid, {});
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
  assert.equal(st.players[0].magicUsed.Modification, undefined);
});

test('Valid Magic sets limit and moves card to hell', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.players[0].main = [H.mkInst(H.mkDb({ name: 'D' }), 0), H.mkInst(H.mkDb({ name: 'D2' }), 0)];
  const m = H.mkInst(H.mkDb({ name: 'DrawM', print: 'TMV', type: 'Magic', subtype: 'Normal', cost: 1, mainEffect: '' }), 0);
  H.giveHand(st, 0, [m]);
  // no script -> legacy fallback manual? give draw effect via script to avoid pendingOps
  global.BoTCardScripts['TMV'] = { abilities: [{ id: 'a', kind: 'triggered', trigger: 'onResolve', ops: [{ op: 'draw', n: 1, who: 'me' }] }] };
  const r = E.playMagic(st, 0, m.uid, {});
  assert.equal(r.ok, true);
  assert.equal(st.players[0].magicUsed.Normal, 1);
  assert.ok(st.players[0].hell.find(c => c.uid === m.uid));
  delete global.BoTCardScripts['TMV'];
});

test('Land plays free (no GEM)', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const land = H.mkInst(H.mkDb({ name: 'L', print: 'TL', type: 'Magic', subtype: 'Land', cost: 2, mainEffect: '' }), 0);
  H.giveHand(st, 0, [land]);
  const r = E.playMagic(st, 0, land.uid, {});
  assert.equal(r.ok, true);
  assert.notEqual(st.land, null);
});
