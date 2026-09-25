'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

function magicDb(sub, cost, extra) {
  return H.mkDb({ name: 'M-' + sub, print: 'TEST-M-' + sub + '-' + cost, type: 'Magic', subtype: sub, cost, mainEffect: extra || 'จั่วการ์ด 1 ใบ' });
}

test('Magic insufficient GEM fails without mutation', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const m = H.mkInst(magicDb('Normal', 2), 0);
  H.giveHand(st, 0, [m]);
  const before = H.snapshot(st);
  const r = E.playMagic(st, 0, m.uid, { payUids: [] });
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
  assert.equal(st.players[0].magicUsed.Normal, undefined);
});

test('Magic wrong-color fails without mutation', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const m = H.mkInst(H.mkDb({ name: 'M', print: 'TM2', type: 'Magic', subtype: 'Normal', cost: 1, color: 'แดง', mainEffect: 'จั่ว 1' }), 0);
  const g = H.mkInst(H.mkDb({ name: 'G', print: 'G', type: 'Avatar', gem: 1, gemColor: 'ฟ้า' }), 0);
  H.giveHand(st, 0, [m, g]);
  const before = H.snapshot(st);
  const r = E.playMagic(st, 0, m.uid, { payUids: [g.uid] });
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
});

test('Magic duplicate GEM fails without mutation', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const m = H.mkInst(magicDb('Normal', 1), 0);
  const g = H.mkInst(H.gemCard('G', 1), 0);
  H.giveHand(st, 0, [m, g]);
  const before = H.snapshot(st);
  const r = E.playMagic(st, 0, m.uid, { payUids: [g.uid, g.uid] });
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
});

test('Magic self-payment and stale fail without mutation', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const m = H.mkInst(magicDb('Normal', 1), 0);
  const g = H.mkInst(H.gemCard('G', 2), 0);
  H.giveHand(st, 0, [m, g]);
  const before = H.snapshot(st);
  let r = E.playMagic(st, 0, m.uid, { payUids: [m.uid] });
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
  r = E.playMagic(st, 0, m.uid, { payUids: [999999] });
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
});

test('Modification invalid target preserves card/payment/allowance', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const mod = H.mkInst(H.mkDb({ name: 'Mod', print: 'TMOD', type: 'Magic', subtype: 'Modification', cost: 1, mainEffect: 'Avatar ที่สวมใส่การ์ดใบนี้ POWER +1' }), 0);
  const g = H.mkInst(H.gemCard('G', 1), 0);
  H.giveHand(st, 0, [mod, g]);
  // no avatar target
  const before = H.snapshot(st);
  const r = E.playMagic(st, 0, mod.uid, { payUids: [g.uid] });
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
  assert.equal(st.players[0].magicUsed.Modification, undefined);
});

test('Valid Magic pays once (GEM consumed, limit set, card to hell)', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.players[0].main = [H.mkInst(H.mkDb({ name: 'D' }), 0), H.mkInst(H.mkDb({ name: 'D2' }), 0)];
  const m = H.mkInst(H.mkDb({ name: 'DrawM', print: 'TMV', type: 'Magic', subtype: 'Normal', cost: 1, mainEffect: '' }), 0);
  const g = H.mkInst(H.gemCard('G', 1), 0);
  H.giveHand(st, 0, [m, g]);
  // no script -> legacy fallback manual? give draw effect via script to avoid pendingOps
  global.BoTCardScripts['TMV'] = { abilities: [{ id: 'a', kind: 'triggered', trigger: 'onResolve', ops: [{ op: 'draw', n: 1, who: 'me' }] }] };
  const r = E.playMagic(st, 0, m.uid, { payUids: [g.uid] });
  assert.equal(r.ok, true);
  assert.equal(st.players[0].magicUsed.Normal, 1);
  assert.ok(st.players[0].hell.find(c => c.uid === g.uid));
  assert.ok(st.players[0].hell.find(c => c.uid === m.uid));
  delete global.BoTCardScripts['TMV'];
});

test('Land GEM enforced', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const land = H.mkInst(H.mkDb({ name: 'L', print: 'TL', type: 'Magic', subtype: 'Land', cost: 2, mainEffect: '' }), 0);
  H.giveHand(st, 0, [land]);
  const r = E.playMagic(st, 0, land.uid, { payUids: [] });
  assert.equal(r.ok, false);
  assert.equal(st.land, null);
});
