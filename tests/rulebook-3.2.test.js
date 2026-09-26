'use strict';
// Rulebook 3.2 regression probes (audit R01–R35). Each test locks one fixed rule.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

function battleGame(E) {
  const st = H.newEmptyGame(E);
  st.phase = 'battle';
  return st;
}

// R04: winner=0 (P1) ends the game like winner=1.
test('R04: P1 win (winner=0) blocks all actions', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.winner = 0; st.winReason = 'test';
  const av = H.mkInst(H.mkDb({ name: 'A', type: 'Avatar', cost: 0 }), 0);
  H.giveHand(st, 0, [av]);
  assert.equal(E.summonAvatar(st, 0, av.uid, []).ok, false);
  assert.equal(E.nextPhase(st), st.phase);
});

// R05: drawing the last card loses immediately.
test('R05: deck 1->0 by draw loses at once', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.players[0].main = [H.mkInst(H.mkDb({ name: 'Last' }), 0)];
  st.players[0]._deckLive = true;
  st.players[1].main = [H.mkInst(H.mkDb({ name: 'X' }), 1)];
  st.players[1]._deckLive = true;
  E.drawOne(st, st.players[0]);
  assert.equal(st.winner, 1);
});

// R06: mulligan returns to bottom, draws, then shuffles; bad input rejected.
test('R06: mulligan validates and shuffles', () => {
  const { E } = H.loadAll();
  const st = E.newGame([], [], [], []);
  st.players.forEach(p => { p.main = []; p.hand = []; });
  st.phase = 'mulligan'; st.mulliganDone = [false, false];
  const mk = (n) => H.mkInst(H.mkDb({ name: n }), 0);
  const h = [mk('H1'), mk('H2'), mk('H3'), mk('H4'), mk('H5')];
  h.forEach(c => { c.owner = 0; c.controller = 0; st.players[0].hand.push(c); });
  for (let i = 0; i < 10; i++) { const c = mk('D' + i); c.owner = 0; c.controller = 0; st.players[0].main.push(c); }
  assert.equal(E.mulligan(st, 0, [h[0].uid, h[0].uid]).ok, false); // dup
  assert.equal(E.mulligan(st, 2, []).ok, false); // bad side
  assert.equal(E.mulligan(st, 0, [h[0].uid]).ok, true);
  assert.equal(st.players[0].hand.length, 5);
  assert.equal(st.mulliganDone[0], true);
});

// R11: RPS rejects bad choice/side.
test('R11: RPS validates input', () => {
  const { E } = H.loadAll();
  const st = E.newGame([], [], [], []);
  assert.equal(E.submitRPS(st, 0, 'lizard').ok, false);
  assert.equal(E.submitRPS(st, 5, 'rock').ok, false);
  assert.equal(E.submitRPS(st, 0, 'rock').ok, true);
});

// R07+R08: starter cannot enter battle T1 via engine; pending responses block phase.
test('R07/R08: starter skip enforced; pending blocks nextPhase', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = H.newEmptyGame(E);
  st.turn = 1; st._starter = 0; st.cur = 0; st.phase = 'main';
  E.nextPhase(st);
  assert.equal(st.phase, 'end');
  const st2 = H.newEmptyGame(E);
  st2.phase = 'main';
  st2.pendingResponses = [{ key: 'x', evId: 1 }];
  const before = st2.phase;
  E.nextPhase(st2);
  assert.equal(st2.phase, before);
});

// R10: end-phase hand max queues a choice instead of auto-pop.
test('R10: 8 cards queue a discard choice', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.phase = 'end'; st.cur = 0; st._starter = 1; st.turn = 2;
  for (let i = 0; i < 8; i++) H.giveHand(st, 0, [H.mkInst(H.mkDb({ name: 'H' + i }), 0)]);
  E.nextPhase(st);
  assert.equal(st.phase, 'end');
  assert.equal((st.pendingDiscards || []).length, 1);
  const q = st.pendingDiscards[0];
  const r = E.resolveDiscard(st, 0, st.players[0].hand.slice(0, q.count).map(c => c.uid));
  assert.equal(r.ok, true);
  assert.equal(st.players[0].hand.length, 7);
});

// R12: attack outside battle / wrong turn rejected; double resolve rejected.
test('R12: attack gates + single resolution', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E); // main phase
  const atk = H.mkInst(H.mkDb({ name: 'A', power: 3 }), 0);
  H.giveAvatar(st, 0, [atk]);
  const foe = H.mkInst(H.mkDb({ name: 'F', power: 1 }), 1);
  H.giveAvatar(st, 1, [foe]);
  assert.equal(E.declareAttack(st, 0, atk.uid, [], { kind: 'avatar', uid: foe.uid }).ok, false);
  st.phase = 'battle';
  const dec = E.declareAttack(st, 0, atk.uid, [], { kind: 'avatar', uid: foe.uid });
  assert.equal(dec.ok, true);
  const r1 = E.resolveBattle(st, 0, atk, { kind: 'avatar', uid: foe.uid }, 0);
  assert.equal(r1.ok, true);
  assert.equal(E.resolveBattle(st, 0, atk, { kind: 'avatar', uid: foe.uid }, 0).ok, false);
});

// R13: POWER never negative.
test('R13: effPower floors at 0', () => {
  const { E } = H.loadAll();
  const c = H.mkInst(H.mkDb({ name: 'W', power: 1 }), 0);
  c.buffs.push({ v: -5, until: 'endTurn' });
  assert.equal(E.effPower(c, 0, null), 0);
});

// R14: defender-only ลูกฮึด wins the tie.
test('R14: defender lukhud wins equal', () => {
  const { E } = H.loadAll();
  const st = battleGame(E);
  const atk = H.mkInst(H.mkDb({ name: 'A', power: 2 }), 0);
  const def = H.mkInst(H.mkDb({ name: 'D', power: 2, mainEffect: 'ลูกฮึด' }), 1);
  H.giveAvatar(st, 0, [atk]);
  H.giveAvatar(st, 1, [def]);
  E.declareAttack(st, 0, atk.uid, [], { kind: 'avatar', uid: def.uid });
  E.resolveBattle(st, 0, atk, { kind: 'avatar', uid: def.uid }, 0);
  assert.equal(st.players[0].avatar.find(c => c.uid === atk.uid), undefined);
  assert.ok(st.players[1].avatar.find(c => c.uid === def.uid));
});

// R15: different-color แทงหลัง kills attacker after; buff never leaks on LIFE.
test('R15: backstab kill + buff cleanup on LIFE', () => {
  const { E } = H.loadAll();
  const st = battleGame(E);
  const atk = H.mkInst(H.mkDb({ name: 'A', power: 3, color: 'แดง' }), 0);
  const sup = H.mkInst(H.mkDb({ name: 'S', power: 2, color: 'ฟ้า', mainEffect: 'แทงหลัง' }), 0);
  H.giveAvatar(st, 0, [atk, sup]);
  const dec = E.declareAttack(st, 0, atk.uid, [sup.uid], { kind: 'life' });
  assert.equal(dec.ok, true);
  E.resolveBattle(st, 0, atk, { kind: 'life' }, 0);
  assert.equal(atk.battleBuff, 0);
  assert.equal(st.players[0].avatar.find(c => c.uid === atk.uid), undefined);
});

// R17: สามัคคี works cross-color.
test('R17: samakkee cross-color supported', () => {
  const { E } = H.loadAll();
  const st = battleGame(E);
  const atk = H.mkInst(H.mkDb({ name: 'A', power: 1, color: 'แดง' }), 0);
  const sup = H.mkInst(H.mkDb({ name: 'S', power: 2, color: 'ฟ้า', mainEffect: 'สามัคคี' }), 0);
  H.giveAvatar(st, 0, [atk, sup]);
  const foe = H.mkInst(H.mkDb({ name: 'F', power: 1 }), 1);
  H.giveAvatar(st, 1, [foe]);
  const dec = E.declareAttack(st, 0, atk.uid, [sup.uid], { kind: 'avatar', uid: foe.uid });
  assert.equal(dec.ok, true);
  assert.ok(dec.power >= 1 + 2);
});

// R18: silenced avatar can still declare its basic attack.
test('R18: silence does not block basic attack', () => {
  const { E } = H.loadAll();
  const st = battleGame(E);
  const atk = H.mkInst(H.mkDb({ name: 'A', power: 2 }), 0);
  atk.silencedUntil = 999999;
  H.giveAvatar(st, 0, [atk]);
  const foe = H.mkInst(H.mkDb({ name: 'F', power: 1 }), 1);
  H.giveAvatar(st, 1, [foe]);
  assert.equal(E.declareAttack(st, 0, atk.uid, [], { kind: 'avatar', uid: foe.uid }).ok, true);
});

// R19: control change keeps equipment and respects cap.
test('R19: gainControl keeps equip', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const av = H.mkInst(H.mkDb({ name: 'A' }), 0);
  const eq = H.mkInst(H.mkDb({ name: 'EQ', type: 'Magic', subtype: 'Modification' }), 0);
  H.giveAvatar(st, 0, [av]);
  E.attachEquip(st, eq, av);
  const r = E.gainControl(st, av, 1);
  assert.equal(r.ok, true);
  assert.equal(av.equipped.length, 1);
  assert.ok(st.players[0].magic.find(c => c.uid === eq.uid));
});

// R20: tokens vanish instead of resting in dark/deck.
test('R20: token exile/deck-return leave no zone residue', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const t1 = H.mkInst(H.mkDb({ name: 'T', type: 'Token' }), 0);
  t1.isToken = true;
  const t2 = H.mkInst(H.mkDb({ name: 'T', type: 'Token' }), 0);
  t2.isToken = true;
  H.giveAvatar(st, 0, [t1, t2]);
  E.exileInst(st, t1, 'test');
  E.deckReturnInst(st, t2, false, false);
  assert.equal(st.players[0].dark.length, 0);
  assert.equal(st.players[0].main.length, 0);
});

// R21: effect flips do not queue LIFE.
test('R21: effect LIFE flip queues nothing', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const lc = H.mkInst(H.mkDb({ name: 'L', type: 'Life' }), 0);
  st.players[0].life = [{ card: lc, open: false }];
  E.flipLifeAt(st, 0, 1, true, 'effect');
  assert.equal((st.delayed || []).length, 0);
  E.flipLifeAt(st, 0, 0, true, 'attack'); // no-op count
});

// R22: scheduled waits survive next Main.
test('R22: wait countdown not eaten by Main', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.phase = 'main'; st.cur = 0;
  E.addDelayed(st, 0, 'waiter', { wait: { phase: 'end', owner: 'self', count: 3 } });
  E.runDelayed(st, 0);
  assert.equal(st.delayed.length, 1);
});

// R27+R28: cross-side target rejected; impossible effect pays nothing.
test('R27/R28: wrong-side target + preflight protect cost', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = H.newEmptyGame(E);
  global.BoTCardScripts['TEST-R2728'] = {
    abilities: [{ id: 'a', kind: 'activated', phases: ['main'], turn: 'mine', cost: { discard: 1 }, ops: [{ op: 'destroy', spec: { side: 'foe', zone: 'avatar' } }] }],
  };
  const src = H.mkInst(H.mkDb({ name: 'S', print: 'TEST-R2728', type: 'Avatar' }), 0);
  const mine = H.mkInst(H.mkDb({ name: 'M' }), 0);
  const pay = H.mkInst(H.mkDb({ name: 'P' }), 0);
  H.giveAvatar(st, 0, [src, mine]);
  H.giveHand(st, 0, [pay]);
  // foe has no avatar -> preflight fails before discard
  const r = FX.execActivated(st, 0, src.uid, 'a', { targetUid: mine.uid, discardUids: [pay.uid] });
  assert.equal(r.ok, false);
  assert.ok(st.players[0].hand.find(c => c.uid === pay.uid));
  delete global.BoTCardScripts['TEST-R2728'];
});

// R29: unscoped abilities default to own Main.
test('R29: default timing is own-main only', () => {
  const { E, FX } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.phase = 'battle'; st.cur = 1;
  global.BoTCardScripts['TEST-R29'] = { abilities: [{ id: 'a', kind: 'activated', ops: [{ op: 'draw', n: 1 }] }] };
  const src = H.mkInst(H.mkDb({ name: 'S', print: 'TEST-R29', type: 'Avatar' }), 0);
  H.giveAvatar(st, 0, [src]);
  assert.equal(FX.execActivated(st, 0, src.uid, 'a', {}).ok, false);
  delete global.BoTCardScripts['TEST-R29'];
});

// R03: no placeholder runs remain in playable scripts.
test('R03: card-scripts contain no ???? runs', () => {
  const fs = require('fs');
  const path = require('path');
  const s = fs.readFileSync(path.join(__dirname, '..', 'card-scripts.js'), 'utf8');
  assert.equal((s.match(/\?{2,}/g) || []).length, 0);
});

// R16: redirect answers โล่มนุษย์, not คู่หู.
test('R16: redirectPartner is โล่มนุษย์-only', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const body = H.mkInst(H.mkDb({ name: 'B', mainEffect: 'โล่มนุษย์' }), 1);
  const pair = H.mkInst(H.mkDb({ name: 'P', mainEffect: 'คู่หู' }), 1);
  H.giveAvatar(st, 1, [body, pair]);
  assert.equal(E.redirectPartner(st, 1, body.uid).ok, true);
  const st2 = H.newEmptyGame(E);
  const pair2 = H.mkInst(H.mkDb({ name: 'P', mainEffect: 'คู่หู' }), 1);
  H.giveAvatar(st2, 1, [pair2]);
  assert.equal(E.redirectPartner(st2, 1, pair2.uid).ok, false);
});
