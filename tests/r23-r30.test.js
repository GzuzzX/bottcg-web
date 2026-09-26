'use strict';
// R23 (LIFE batch top->bottom, all due before React) + R30 (no same-name GEM ban).
// Rulebook 3.2 pp.5-7, 14, 17, 22.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

function lifeEntry(print, name, open) {
  return { card: H.mkInst(H.mkDb({ name, print, type: 'Life' }), 0), open: !!open };
}
function lifeScript(print, marker) {
  global.BoTCardScripts[print] = {
    abilities: [{ id: 'd', kind: 'triggered', trigger: 'delayedLife', ops: [{ op: 'log', text: marker }] }],
  };
}
function unlife(...prints) { prints.forEach(p => { delete global.BoTCardScripts[p]; }); }
function mainGame(E) {
  const st = H.newEmptyGame(E);
  st.phase = 'main'; st.cur = 0;
  return st;
}

// ---------- R23 ----------

test('R23: simultaneous flips (pos 2+4) share a batch, resolve top-first, all in one Main', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = mainGame(E);
  lifeScript('TEST-LIFE-TOP', 'RESOLVE-TOP');
  lifeScript('TEST-LIFE-BOT', 'RESOLVE-BOT');
  st.players[0].life = [
    lifeEntry('F0', 'F0', true),
    lifeEntry('TEST-LIFE-TOP', 'Top', false),
    lifeEntry('F2', 'F2', true),
    lifeEntry('TEST-LIFE-BOT', 'Bot', false),
    lifeEntry('F4', 'F4', true),
  ];
  assert.equal(E.flipLifeAt(st, 0, 5, true, 'attack'), 2);
  assert.equal(st.delayed.length, 2);
  assert.equal(st.delayed[0].data.batchId, st.delayed[1].data.batchId);
  assert.deepEqual(st.delayed.map(d => d.data.lifeIndex).sort(), [1, 3]);
  E.enterMain(st);
  assert.equal(st.delayed.length, 0);
  const log = st.log.join('\n');
  const iTop = log.indexOf('RESOLVE-TOP'), iBot = log.indexOf('RESOLVE-BOT');
  assert.ok(iTop >= 0 && iBot >= 0 && iTop < iBot, 'top LIFE must resolve before bottom LIFE');
  unlife('TEST-LIFE-TOP', 'TEST-LIFE-BOT');
});

test('R23: three simultaneous flips all resolve in one Main, top-to-bottom', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = mainGame(E);
  lifeScript('TEST-L0', 'RESOLVE-L0');
  lifeScript('TEST-L1', 'RESOLVE-L1');
  lifeScript('TEST-L2', 'RESOLVE-L2');
  st.players[0].life = [
    lifeEntry('TEST-L0', 'L0', false),
    lifeEntry('TEST-L1', 'L1', false),
    lifeEntry('TEST-L2', 'L2', false),
    lifeEntry('F3', 'F3', true),
    lifeEntry('F4', 'F4', true),
  ];
  assert.equal(E.flipLifeAt(st, 0, 3, true, 'attack'), 3);
  E.enterMain(st);
  assert.equal(st.delayed.length, 0);
  const log = st.log.join('\n');
  const i0 = log.indexOf('RESOLVE-L0'), i1 = log.indexOf('RESOLVE-L1'), i2 = log.indexOf('RESOLVE-L2');
  assert.ok(i0 >= 0 && i1 > i0 && i2 > i1, 'order must be 0,1,2');
  unlife('TEST-L0', 'TEST-L1', 'TEST-L2');
});

test('R23: separate reveal events are not merged (event order kept)', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = mainGame(E);
  lifeScript('TEST-LIFE-A', 'RESOLVE-A');
  lifeScript('TEST-LIFE-B', 'RESOLVE-B');
  st.players[0].life = [
    lifeEntry('TEST-LIFE-A', 'A', false),
    lifeEntry('F1', 'F1', true),
    lifeEntry('TEST-LIFE-B', 'B', false),
    lifeEntry('F3', 'F3', true),
    lifeEntry('F4', 'F4', true),
  ];
  assert.equal(E.flipLifeAt(st, 0, 1, true, 'attack'), 1); // idx 0
  assert.equal(E.flipLifeAt(st, 0, 1, true, 'attack'), 1); // idx 2
  assert.equal(st.delayed.length, 2);
  assert.notEqual(st.delayed[0].data.batchId, st.delayed[1].data.batchId);
  E.enterMain(st);
  assert.equal(st.delayed.length, 0);
  const log = st.log.join('\n');
  const iA = log.indexOf('RESOLVE-A'), iB = log.indexOf('RESOLVE-B');
  assert.ok(iA >= 0 && iB > iA, 'earlier event resolves first');
  unlife('TEST-LIFE-A', 'TEST-LIFE-B');
});

test('R23: close then re-open re-triggers LIFE ability', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = mainGame(E);
  lifeScript('TEST-LIFE-R', 'RESOLVE-R');
  st.players[0].life = [
    lifeEntry('TEST-LIFE-R', 'R', false),
    lifeEntry('F1', 'F1', false),
    lifeEntry('F2', 'F2', false),
    lifeEntry('F3', 'F3', false),
    lifeEntry('F4', 'F4', false),
  ];
  E.flipLifeAt(st, 0, 1, true, 'attack');
  E.enterMain(st);
  assert.equal(st.log.join('\n').split('RESOLVE-R').length - 1, 1);
  assert.equal(E.flipLifeAt(st, 0, 1, false), 1); // close again
  E.flipLifeAt(st, 0, 1, true, 'attack'); // re-open
  assert.equal(st.delayed.length, 1);
  E.enterMain(st);
  assert.equal(st.log.join('\n').split('RESOLVE-R').length - 1, 2);
  unlife('TEST-LIFE-R');
});

test('R23: multi-flip by plain effect queues nothing', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = mainGame(E);
  st.players[0].life = [
    lifeEntry('E0', 'E0', false),
    lifeEntry('E1', 'E1', false),
    lifeEntry('E2', 'E2', false),
    lifeEntry('E3', 'E3', true),
    lifeEntry('E4', 'E4', true),
  ];
  assert.equal(E.flipLifeAt(st, 0, 2, true, 'effect'), 2);
  assert.equal((st.delayed || []).length, 0);
});

test('R23: voluntary React/ability rejected while LIFE batch resolving, allowed after', () => {
  const { E, FX } = H.loadAll();
  FX.setHumanSides([]);
  const st = mainGame(E);
  const m = H.mkInst(H.mkDb({ name: 'R', print: 'TEST-R23-REACT', type: 'Magic', subtype: 'React', cost: 0, mainEffect: 'ยกเลิก' }), 0);
  H.giveHand(st, 0, [m]);
  global.BoTCardScripts['TEST-R23-REACT'] = {
    abilities: [{ id: 'r', kind: 'response', responseTo: 'magic', ops: [{ op: 'negateEvent' }] }],
  };
  const src = H.mkInst(H.mkDb({ name: 'S', print: 'TEST-R23-ACT', type: 'Avatar' }), 0);
  H.giveAvatar(st, 0, [src]);
  global.BoTCardScripts['TEST-R23-ACT'] = {
    abilities: [{ id: 'a', kind: 'activated', ops: [{ op: 'log', text: 'voluntary' }] }],
  };
  st._lifeResolving = true;
  const r1 = E.playMagic(st, 0, m.uid, {});
  assert.equal(r1.ok, false);
  assert.match(r1.error, /LIFE/);
  const r2 = FX.execActivated(st, 0, src.uid, 'a', {});
  assert.equal(r2.ok, false);
  assert.match(r2.error, /LIFE/);
  delete st._lifeResolving;
  assert.equal(E.playMagic(st, 0, m.uid, {}).ok, true);
  assert.equal(FX.execActivated(st, 0, src.uid, 'a', {}).ok, true);
  unlife('TEST-R23-REACT', 'TEST-R23-ACT');
});

// ---------- R30 ----------

test('R30: Avatar summon may use same-named GEM payer', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const target = H.mkInst(H.mkDb({ name: 'กุ่ย', print: 'T-SAME', type: 'Avatar', cost: 2, color: 'แดง' }), 0);
  const payer = H.mkInst(H.mkDb({ name: 'กุ่ย', print: 'T-SAME-PAY', type: 'Avatar', gem: 2, color: 'แดง' }), 0);
  H.giveHand(st, 0, [target, payer]);
  const r = E.summonAvatar(st, 0, target.uid, [payer.uid]);
  assert.equal(r.ok, true);
  assert.ok(st.players[0].avatar.find(c => c.uid === target.uid));
});

test('R30: Construct build may use same-named GEM payer', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const target = H.mkInst(H.mkDb({ name: 'ป้อม', print: 'T-CONS', type: 'Construct', cost: 2, color: 'แดง' }), 0);
  const payer = H.mkInst(H.mkDb({ name: 'ป้อม', print: 'T-CONS-PAY', type: 'Avatar', gem: 2, color: 'แดง' }), 0);
  H.giveHand(st, 0, [target, payer]);
  const r = E.buildConstruct(st, 0, target.uid, [payer.uid]);
  assert.equal(r.ok, true);
});

test('R30 kept: same name does not excuse color mismatch', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const target = H.mkInst(H.mkDb({ name: 'กุ่ย', print: 'T-COL', type: 'Avatar', cost: 2, color: 'แดง' }), 0);
  const payer = H.mkInst(H.mkDb({ name: 'กุ่ย', print: 'T-COL-PAY', type: 'Avatar', gem: 2, gemColor: 'ฟ้า' }), 0);
  H.giveHand(st, 0, [target, payer]);
  const before = H.snapshot(st);
  const r = E.summonAvatar(st, 0, target.uid, [payer.uid]);
  assert.equal(r.ok, false);
  assert.match(r.error, /สี/);
  assert.equal(H.snapshot(st), before);
});

test('R30 kept: same name does not excuse GEM 0 payer', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const target = H.mkInst(H.mkDb({ name: 'กุ่ย', print: 'T-G0', type: 'Avatar', cost: 1, color: 'แดง' }), 0);
  const payer = H.mkInst(H.mkDb({ name: 'กุ่ย', print: 'T-G0-PAY', type: 'Avatar', gem: 0 }), 0);
  H.giveHand(st, 0, [target, payer]);
  const r = E.summonAvatar(st, 0, target.uid, [payer.uid]);
  assert.equal(r.ok, false);
  assert.match(r.error, /GEM 0/);
});

test('R30 kept: same name does not excuse needless overpay', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const target = H.mkInst(H.mkDb({ name: 'กุ่ย', print: 'T-OV', type: 'Avatar', cost: 2, color: 'แดง' }), 0);
  const p1 = H.mkInst(H.mkDb({ name: 'กุ่ย', print: 'T-OV-P1', type: 'Avatar', gem: 2 }), 0);
  const p2 = H.mkInst(H.mkDb({ name: 'กุ่ย', print: 'T-OV-P2', type: 'Avatar', gem: 2 }), 0);
  H.giveHand(st, 0, [target, p1, p2]);
  const before = H.snapshot(st);
  const r = E.summonAvatar(st, 0, target.uid, [p1.uid, p2.uid]);
  assert.equal(r.ok, false);
  assert.match(r.error, /จ่ายเกิน/);
  assert.equal(H.snapshot(st), before);
});

test('R30 kept: per-card text GEM limit still enforced', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  const target = H.mkInst(H.mkDb({ name: 'กุ่ย', print: 'T-LIM', type: 'Avatar', cost: 1, color: 'แดง' }), 0);
  // payer text: usable as Cost only for ไอดอล — paying for กุ่ย must fail.
  const payer = H.mkInst(H.mkDb({
    name: 'โอตะคูลา', print: 'T-LIM-PAY', type: 'Avatar', gem: 1,
    hashtagText: '#การ์ดใบนี้ใช้เป็น Cost การอัญเชิญได้เฉพาะ Avatar "ไอดอล" เท่านั้น',
  }), 0);
  H.giveHand(st, 0, [target, payer]);
  const r = E.summonAvatar(st, 0, target.uid, [payer.uid]);
  assert.equal(r.ok, false);
  assert.match(r.error, /เฉพาะ/);
});
