'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

test('4 normals can receive 2 tokens; 5th normal or 7th total rejected', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  for (let i = 0; i < 4; i++) {
    const a = H.mkInst(H.mkDb({ name: 'N' + i, type: 'Avatar' }), 0);
    a.isToken = false;
    H.giveAvatar(st, 0, [a]);
  }
  // 2 tokens ok
  for (let i = 0; i < 2; i++) {
    const t = H.mkInst(H.mkDb({ name: 'T' + i, type: 'Token', isToken: true }), 0);
    t.isToken = true;
    const r = E.summonFromZone(st, 0, t, {});
    assert.equal(r.ok, true);
  }
  assert.equal(st.players[0].avatar.length, 6);
  // 7th total rejected
  const extra = H.mkInst(H.mkDb({ name: 'Extra', type: 'Token', isToken: true }), 0);
  extra.isToken = true;
  const r7 = E.summonFromZone(st, 0, extra, {});
  assert.equal(r7.ok, false);
  // 5th normal rejected even with space? Currently 4 normals +2 tokens =6 total, so also total full. Test fresh: 4 normals, try 5th normal
  const st2 = H.newEmptyGame(E);
  for (let i = 0; i < 4; i++) {
    const a = H.mkInst(H.mkDb({ name: 'N' + i, type: 'Avatar' }), 0);
    a.isToken = false;
    H.giveAvatar(st2, 0, [a]);
  }
  const fifth = H.mkInst(H.mkDb({ name: 'Fifth', type: 'Avatar' }), 0);
  fifth.isToken = false;
  const r5 = E.summonFromZone(st2, 0, fifth, {});
  assert.equal(r5.ok, false);
});

test('Departing hosts leave no equip in both field and graveyard', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const host = H.mkInst(H.mkDb({ name: 'Host', type: 'Avatar' }), 0);
  const equip = H.mkInst(H.mkDb({ name: 'Equip', type: 'Magic', subtype: 'Modification' }), 0);
  H.giveAvatar(st, 0, [host]);
  E.attachEquip(st, equip, host);
  assert.ok(st.players[0].magic.find(c => c.uid === equip.uid));
  E.destroyInst(st, host, 'test');
  // equip should be in hell exactly once, not in magic, no stale refs
  assert.equal(st.players[0].magic.filter(c => c.uid === equip.uid).length, 0);
  assert.equal(st.players[0].hell.filter(c => c.uid === equip.uid).length, 1);
  assert.equal(host.equipped.length, 0);
  assert.equal(equip.equippedTo, null);
  // no duplicate triggers: onEquipHell should have fired once (check log count?)
  const hellCount = st.players[0].hell.filter(c => c.uid === equip.uid).length;
  assert.equal(hellCount, 1);
});
