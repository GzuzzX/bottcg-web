'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

test('SD01-018 invalid draws nothing and consumes nothing', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = H.newEmptyGame(E);
  st.players[0].main = [H.mkInst(H.mkDb({ name: 'D' }), 0)];
  const row = H.rowFor('SD01-018');
  const m = H.mkInst(row, 0);
  // R01: no GEM — only the text cost (discard เทพ Avatar). Non-tep fails.
  const nonTep = H.mkInst(H.mkDb({ name: 'X', type: 'Avatar', symbol: 'ยักษ์' }), 0);
  H.giveHand(st, 0, [m, nonTep]);
  const before = H.snapshot(st);
  const r = E.playMagic(st, 0, m.uid, { discardUids: [nonTep.uid] });
  assert.equal(r.ok, false);
  assert.equal(H.snapshot(st), before);
  // also missing discard fails
  const r2 = E.playMagic(st, 0, m.uid, {});
  assert.equal(r2.ok, false);
  assert.equal(H.snapshot(st), before);
});

test('SD01-018 valid pays once and draws 2', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = H.newEmptyGame(E);
  st.players[0].main = [H.mkInst(H.mkDb({ name: 'D1' }), 0), H.mkInst(H.mkDb({ name: 'D2' }), 0), H.mkInst(H.mkDb({ name: 'D3' }), 0)];
  const row = H.rowFor('SD01-018');
  const m = H.mkInst(row, 0);
  const tep = H.mkInst(H.mkDb({ name: 'Tep', type: 'Avatar', symbol: 'เทพ' }), 0);
  H.giveHand(st, 0, [m, tep]);
  const r = E.playMagic(st, 0, m.uid, { discardUids: [tep.uid] });
  assert.equal(r.ok, true);
  // hand 2 (m,tep) -> after tep->hell, m->hell, draw 2 -> hand 2
  assert.equal(st.players[0].hand.length, 2);
  assert.ok(st.players[0].hell.find(c => c.uid === tep.uid));
});

test('SD01-002 gains exactly +2 per qualifying attack until turn end', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = H.newEmptyGame(E);
  st.phase = 'battle'; // R12: attacks only in Battle Phase
  const row = H.rowFor('SD01-002');
  const atk = H.mkInst(row, 0);
  H.giveAvatar(st, 0, [atk]);
  const foe = H.mkInst(H.mkDb({ name: 'F', type: 'Avatar', power: 0 }), 1);
  H.giveAvatar(st, 1, [foe]);
  const beforePow = E.effPower(atk, 0, st);
  const dec = E.declareAttack(st, 0, atk.uid, [], { kind: 'avatar', uid: foe.uid });
  assert.equal(dec.ok, true);
  // power should be snapshot+2 (no double)
  assert.equal(dec.power, beforePow + 2);
  // buff persists until endTurn
  assert.ok(atk.buffs.some(b => b.v === 2));
  // second attack stacks another +2
  atk.tapped = false;
  const dec2 = E.declareAttack(st, 0, atk.uid, [], { kind: 'avatar', uid: foe.uid });
  // snapshot now includes first +2, plus new +2 = before+4
  assert.equal(dec2.power, beforePow + 4);
});

test('SD01-020 affects both sides and stops when removed', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = H.newEmptyGame(E);
  const row = H.rowFor('SD01-020');
  const land = H.mkInst(row, 0);
  // R01: Land costs no GEM — plays free.
  H.giveHand(st, 0, [land]);
  const mine = H.mkInst(H.mkDb({ name: 'M', type: 'Avatar', power: 1, symbol: 'เทพ' }), 0);
  const foe = H.mkInst(H.mkDb({ name: 'F', type: 'Avatar', power: 1, symbol: 'เทพ' }), 1);
  const foeNon = H.mkInst(H.mkDb({ name: 'FN', type: 'Avatar', power: 1, symbol: 'ยักษ์' }), 1);
  H.giveAvatar(st, 0, [mine]);
  H.giveAvatar(st, 1, [foe, foeNon]);
  const r = E.playMagic(st, 0, land.uid, {});
  assert.equal(r.ok, true);
  assert.equal(E.effPower(mine, 0, st), 2);
  assert.equal(E.effPower(foe, 0, st), 2);
  assert.equal(E.effPower(foeNon, 0, st), 1);
  // remove land -> aura stops
  E.destroyInst(st, land, 'test');
  // land goes to hell? Land destroy? removeFromZones + hell? exile? destroyInst pushes to owner hell
  assert.equal(E.effPower(mine, 0, st), 1);
  assert.equal(E.effPower(foe, 0, st), 1);
});

test('SD01-001/003/005 podi gating and sides', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  // 001 free summon (by effect) should NOT trigger
  const st = H.newEmptyGame(E);
  const row1 = H.rowFor('SD01-001');
  const c1 = H.mkInst(row1, 0);
  st.players[0].hell.push(c1); c1.controller = 0;
  const foeAv = H.mkInst(H.mkDb({ name: 'F', type: 'Avatar', power: 5 }), 1);
  H.giveAvatar(st, 1, [foeAv]);
  const foePowBefore = E.effPower(foeAv, 0, st);
  E.summonFromZone(st, 0, c1, { juti: true });
  // podi false (byCost false) -> no buff
  assert.equal(E.effPower(foeAv, 0, st), foePowBefore);
  // paid summon should trigger (need exact pay)
  const st2 = H.newEmptyGame(E);
  const c2 = H.mkInst(row1, 0);
  const foe2 = H.mkInst(H.mkDb({ name: 'F2', type: 'Avatar', power: 5 }), 1);
  H.giveAvatar(st2, 1, [foe2]);
  // cost 6: give GEMs summing to 6 exactly
  const pa = H.mkInst(H.gemCard('A', 2), 0);
  const pb = H.mkInst(H.gemCard('B', 2), 0);
  const pc = H.mkInst(H.gemCard('C', 2), 0);
  H.giveHand(st2, 0, [c2, pa, pb, pc]);
  const r = E.summonAvatar(st2, 0, c2.uid, [pa.uid, pb.uid, pc.uid]);
  assert.equal(r.ok, true);
  // foe debuffed -4 (either side targeting auto picks foe strongest)
  assert.equal(E.effPower(foe2, 0, st2), 1);
});

test('SD01-017 targets summoned Avatar', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = H.newEmptyGame(E);
  const strong = H.mkInst(H.mkDb({ name: 'Strong', type: 'Avatar', power: 10 }), 1);
  H.giveAvatar(st, 1, [strong]);
  const weak = H.mkInst(H.mkDb({ name: 'Weak', type: 'Avatar', cost: 0, power: 1 }), 0);
  H.giveHand(st, 0, [weak]);
  const row17 = H.rowFor('SD01-017');
  const react = H.mkInst(row17, 1);
  // R01: React costs no GEM.
  H.giveHand(st, 1, [react]);
  // P0 summons weak; P1 auto-responds with 017 (bot) should destroy weak, not strong
  // ensure P1 has GEM auto? doResponse auto-selects GEM via autoGemUids
  const r = E.summonAvatar(st, 0, weak.uid, []);
  assert.equal(r.ok, true);
  // weak should be gone (destroyed by response), strong remains
  assert.equal(st.players[0].avatar.find(c => c.uid === weak.uid), undefined);
  assert.ok(st.players[1].avatar.find(c => c.uid === strong.uid));
});
