'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

test('Effects cannot happen before decision (suspended magic)', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([1]); // P1 human will respond
  const st = H.newEmptyGame(E);
  st.players[0].main = [H.mkInst(H.mkDb({ name: 'D' }), 0)];
  const m = H.mkInst(H.mkDb({ name: 'M', print: 'TSUSP', type: 'Magic', subtype: 'Normal', cost: 0, mainEffect: '' }), 0);
  H.giveHand(st, 0, [m]);
  global.BoTCardScripts['TSUSP'] = { abilities: [{ id: 'a', kind: 'triggered', trigger: 'onResolve', ops: [{ op: 'draw', n: 1, who: 'me' }] }] };
  const negDb = H.mkDb({ name: 'Neg', print: 'TEST-NEG-SUSP', type: 'Magic', subtype: 'React', cost: 0, mainEffect: '' });
  global.BoTCardScripts['TEST-NEG-SUSP'] = { abilities: [{ id: 'r', kind: 'response', responseTo: 'magic', ops: [{ op: 'negateEvent' }] }] };
  const neg = H.mkInst(negDb, 1);
  H.giveHand(st, 1, [neg]);
  const mainBefore = st.players[0].main.length;
  const r = E.playMagic(st, 0, m.uid, { payUids: [] });
  assert.equal(r.ok, true);
  assert.equal(r.pending, true);
  // effect not yet applied
  assert.equal(st.players[0].main.length, mainBefore);
  assert.equal(st.pendingResponses.length, 1);
  assert.equal(st._frames.length, 1);
  // unrelated actions blocked while pending
  const av = H.mkInst(H.mkDb({ name: 'A', type: 'Avatar', cost: 0 }), 0);
  H.giveHand(st, 0, [av]);
  const blk = E.summonAvatar(st, 0, av.uid, []);
  assert.equal(blk.ok, false);
  delete global.BoTCardScripts['TSUSP'];
  delete global.BoTCardScripts['TEST-NEG-SUSP'];
  FX.setHumanSides([]);
});

test('Negation prevents pending effect; passing resumes exactly once', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([1]);
  const st = H.newEmptyGame(E);
  st.players[0].main = [H.mkInst(H.mkDb({ name: 'D' }), 0)];
  const m = H.mkInst(H.mkDb({ name: 'M', print: 'TSUSP2', type: 'Magic', subtype: 'Normal', cost: 0, mainEffect: '' }), 0);
  H.giveHand(st, 0, [m]);
  global.BoTCardScripts['TSUSP2'] = { abilities: [{ id: 'a', kind: 'triggered', trigger: 'onResolve', ops: [{ op: 'draw', n: 1, who: 'me' }] }] };
  global.BoTCardScripts['TEST-NEG2'] = { abilities: [{ id: 'r', kind: 'response', responseTo: 'magic', ops: [{ op: 'negateEvent' }] }] };
  const neg = H.mkInst(H.mkDb({ name: 'Neg', print: 'TEST-NEG2', type: 'Magic', subtype: 'React', cost: 0 }), 1);
  H.giveHand(st, 1, [neg]);
  const r = E.playMagic(st, 0, m.uid, { payUids: [] });
  assert.equal(r.pending, true);
  const q = st.pendingResponses[0];
  // use negation
  const ru = FX.resolveQueued(st, q.key, true, {});
  assert.equal(ru.ok, true);
  // negated: still no draw, card to hell, no duplicate frames
  assert.equal(st.players[0].main.length, 1);
  assert.equal(st._frames.length, 0);
  assert.equal(st.pendingResponses.length, 0);
  // second scenario: pass resumes exactly once
  FX.setHumanSides([1]);
  const st2 = H.newEmptyGame(E);
  st2.players[0].main = [H.mkInst(H.mkDb({ name: 'D' }), 0)];
  const m2 = H.mkInst(H.mkDb({ name: 'M', print: 'TSUSP2', type: 'Magic', subtype: 'Normal', cost: 0 }), 0);
  H.giveHand(st2, 0, [m2]);
  const neg2 = H.mkInst(H.mkDb({ name: 'Neg', print: 'TEST-NEG2', type: 'Magic', subtype: 'React', cost: 0 }), 1);
  H.giveHand(st2, 1, [neg2]);
  const r2 = E.playMagic(st2, 0, m2.uid, { payUids: [] });
  assert.equal(r2.pending, true);
  const q2 = st2.pendingResponses[0];
  const rp = FX.resolveQueued(st2, q2.key, false, {});
  assert.equal(rp.ok, true);
  assert.equal(rp.passed, true);
  // resumed exactly once: drew 1
  assert.equal(st2.players[0].hand.length, 1);
  assert.equal(st2.players[0].main.length, 0);
  assert.equal(st2._frames.length, 0);
  // repeated resolve of same key fails (no duplicate)
  const again = FX.resolveQueued(st2, q2.key, false, {});
  assert.equal(again.ok, false);
  delete global.BoTCardScripts['TSUSP2'];
  delete global.BoTCardScripts['TEST-NEG2'];
  FX.setHumanSides([]);
});

test('Nested responses and subsequent windows neither duplicate nor lose', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([1]);
  const st = H.newEmptyGame(E);
  const av = H.mkInst(H.mkDb({ name: 'A', type: 'Avatar', cost: 0, power: 1 }), 0);
  H.giveHand(st, 0, [av]);
  global.BoTCardScripts['TEST-NEST'] = { abilities: [{ id: 'r', kind: 'response', responseTo: 'summon', ops: [{ op: 'destroy', spec: { side: 'either', zone: 'avatar' }, targetSummoned: true }] }] };
  const react = H.mkInst(H.mkDb({ name: 'R', print: 'TEST-NEST', type: 'Magic', subtype: 'React', cost: 0 }), 1);
  H.giveHand(st, 1, [react]);
  const r = E.summonAvatar(st, 0, av.uid, []);
  assert.equal(r.pending, true);
  // pass first window: summon should complete juti (no juti text -> just field)
  const q = st.pendingResponses[0];
  const rp = FX.resolveQueued(st, q.key, false, {});
  assert.equal(rp.ok, true);
  assert.ok(st.players[0].avatar.find(c => c.uid === av.uid));
  // subsequent summon should create new window (not blocked by old pass scoping)
  const av2 = H.mkInst(H.mkDb({ name: 'A2', type: 'Avatar', cost: 0, power: 1 }), 0);
  H.giveHand(st, 0, [av2]);
  const react2 = H.mkInst(H.mkDb({ name: 'R2', print: 'TEST-NEST', type: 'Magic', subtype: 'React', cost: 0 }), 1);
  H.giveHand(st, 1, [react2]);
  FX.setHumanSides([1]);
  const r3 = E.summonAvatar(st, 0, av2.uid, []);
  assert.equal(r3.pending, true); // new event still queues (pass scoped to previous evId)
  delete global.BoTCardScripts['TEST-NEST'];
  FX.setHumanSides([]);
});
