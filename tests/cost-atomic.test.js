'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

test('ability cost atomic: failed discard leaves hand/hell/usage unchanged', () => {
  const { E, FX } = H.loadAll();
  const st = H.newEmptyGame(E);
  // Avatar with activated ability requiring discard 2
  const db = H.mkDb({ name: 'Coster', print: 'TEST-COSTER', type: 'Avatar', mainEffect: 'สั่งใช้: จั่ว' });
  const inst = H.mkInst(db, 0);
  H.giveAvatar(st, 0, [inst]);
  const gem1 = H.mkInst(H.gemCard('G1', 1), 0);
  H.giveHand(st, 0, [gem1]);
  // inject script
  global.BoTCardScripts['TEST-COSTER'] = {
    abilities: [{ id: 'a', kind: 'activated', ops: [{ op: 'draw', n: 1, who: 'me' }], cost: { discard: 2 } }],
  };
  const before = H.snapshot(st);
  const beforeUsed = JSON.stringify(inst.fxUsed);
  const r = FX.execActivated(st, 0, inst.uid, 'a', { discardUids: [gem1.uid] });
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
  assert.equal(JSON.stringify(inst.fxUsed), beforeUsed);
  delete global.BoTCardScripts['TEST-COSTER'];
});

test('ability cost atomic: duplicate selections fail without mutation', () => {
  const { E, FX } = H.loadAll();
  const st = H.newEmptyGame(E);
  const db = H.mkDb({ name: 'Coster2', print: 'TEST-COSTER2', type: 'Avatar', mainEffect: '' });
  const inst = H.mkInst(db, 0);
  H.giveAvatar(st, 0, [inst]);
  const g1 = H.mkInst(H.gemCard('G1', 1), 0);
  const g2 = H.mkInst(H.gemCard('G2', 1), 0);
  H.giveHand(st, 0, [g1, g2]);
  global.BoTCardScripts['TEST-COSTER2'] = {
    abilities: [{ id: 'a', kind: 'activated', ops: [{ op: 'draw', n: 1, who: 'me' }], cost: { discard: 2 } }],
  };
  const before = H.snapshot(st);
  const r = FX.execActivated(st, 0, inst.uid, 'a', { discardUids: [g1.uid, g1.uid] });
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
  delete global.BoTCardScripts['TEST-COSTER2'];
});

test('ability cost atomic: successful combined costs consume each once', () => {
  const { E, FX } = H.loadAll();
  const st = H.newEmptyGame(E);
  const db = H.mkDb({ name: 'Coster3', print: 'TEST-COSTER3', type: 'Avatar', mainEffect: '' });
  const inst = H.mkInst(db, 0);
  H.giveAvatar(st, 0, [inst]);
  const g1 = H.mkInst(H.gemCard('G1', 1), 0);
  const g2 = H.mkInst(H.gemCard('G2', 1), 0);
  H.giveHand(st, 0, [g1, g2]);
  st.players[0].main = [H.mkInst(H.mkDb({ name: 'D' }), 0)];
  global.BoTCardScripts['TEST-COSTER3'] = {
    abilities: [{ id: 'a', kind: 'activated', ops: [{ op: 'draw', n: 1, who: 'me' }], cost: { discard: 2 } }],
  };
  const r = FX.execActivated(st, 0, inst.uid, 'a', { discardUids: [g1.uid, g2.uid] });
  assert.equal(r.ok, true);
  assert.equal(st.players[0].hand.length, 1); // drew 1, discarded 2 from 2? start 2 hand, discard 2 -> 0, draw 1 -> 1
  assert.equal(st.players[0].hell.length, 2);
  delete global.BoTCardScripts['TEST-COSTER3'];
});

test('overlapping resources rejected', () => {
  const { E, FX } = H.loadAll();
  const st = H.newEmptyGame(E);
  const db = H.mkDb({ name: 'Overlap', print: 'TEST-OVER', type: 'Avatar', mainEffect: '' });
  const inst = H.mkInst(db, 0);
  H.giveAvatar(st, 0, [inst]);
  const g1 = H.mkInst(H.mkDb({ name: 'G', type: 'Avatar', symbol: 'เทพ', gem: 1 }), 0);
  H.giveHand(st, 0, [g1]);
  global.BoTCardScripts['TEST-OVER'] = {
    abilities: [{ id: 'a', kind: 'activated', ops: [{ op: 'draw', n: 1, who: 'me' }],
      cost: { discard: 1, sendSymbolToHell: { symbol: 'เทพ', n: 1 } } }],
  };
  const before = H.snapshot(st);
  const r = FX.execActivated(st, 0, inst.uid, 'a', { discardUids: [g1.uid], sendUids: [g1.uid] });
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
  delete global.BoTCardScripts['TEST-OVER'];
});
