'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

test('React limit exceeded consumes nothing', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = H.newEmptyGame(E);
  // attacker summons to trigger foe React
  const reactDb = H.mkDb({ name: 'ReactKill', print: 'TEST-REACT-LIM', type: 'Magic', subtype: 'React', cost: 0, mainEffect: 'เมื่อมี Avatar อัญเชิญ: ทำลาย' });
  global.BoTCardScripts['TEST-REACT-LIM'] = {
    abilities: [{ id: 'r', kind: 'response', responseTo: 'summon', ops: [{ op: 'destroy', spec: { side: 'either', zone: 'avatar' }, targetSummoned: true }] }],
  };
  const r1 = H.mkInst(reactDb, 1);
  const r2 = H.mkInst(reactDb, 1);
  H.giveHand(st, 1, [r1, r2]);
  st.players[1].magicUsed.React = 1; // already used
  // summon by P0 should trigger foe response but limit blocks -> nothing consumed
  const av = H.mkInst(H.mkDb({ name: 'A', type: 'Avatar', cost: 0, power: 1 }), 0);
  H.giveHand(st, 0, [av]);
  const beforeHell = st.players[1].hell.length;
  const res = E.summonAvatar(st, 0, av.uid, []);
  assert.equal(res.ok, true);
  // Reacts should remain in hand, hell unchanged, still on field
  assert.equal(st.players[1].hand.length, 2);
  assert.equal(st.players[1].hell.length, beforeHell);
  assert.ok(st.players[0].avatar.find(c => c.uid === av.uid));
  delete global.BoTCardScripts['TEST-REACT-LIM'];
});

test('Successful React charges once and updates counters once', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = H.newEmptyGame(E);
  const reactDb = H.mkDb({ name: 'Neg', print: 'TEST-REACT-OK', type: 'Magic', subtype: 'React', cost: 0, mainEffect: 'ยกเลิก' });
  global.BoTCardScripts['TEST-REACT-OK'] = {
    abilities: [{ id: 'r', kind: 'response', responseTo: 'magic', ops: [{ op: 'negateEvent' }] }],
  };
  const neg = H.mkInst(reactDb, 1);
  H.giveHand(st, 1, [neg]);
  const m = H.mkInst(H.mkDb({ name: 'M', print: 'TMX', type: 'Magic', subtype: 'Normal', cost: 0, mainEffect: '' }), 0);
  H.giveHand(st, 0, [m]);
  global.BoTCardScripts['TMX'] = { abilities: [{ id: 'a', kind: 'triggered', trigger: 'onResolve', ops: [{ op: 'draw', n: 1, who: 'me' }] }] };
  st.players[0].main = [H.mkInst(H.mkDb({ name: 'D' }), 0)];
  const handBefore = st.players[0].hand.length;
  const r = E.playMagic(st, 0, m.uid, { payUids: [] });
  assert.equal(r.ok, true);
  // negated: no draw, React consumed once
  assert.equal(st.players[1].magicUsed.React, 1);
  assert.equal(st.players[1].hell.length, 1);
  assert.equal(st.players[0].main.length, 1); // not drawn
  delete global.BoTCardScripts['TEST-REACT-OK'];
  delete global.BoTCardScripts['TMX'];
});
