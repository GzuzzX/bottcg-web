'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const H = require('./helpers');
const BOT = require('../ai.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
const botStart = html.indexOf('let botTurnTimer = null;');
const botEnd = html.indexOf('// ---------- rendering ----------', botStart);
const afterAction = html.match(/function afterAction\(\)\{[^\n]+\}/);
assert.ok(botStart >= 0 && botEnd > botStart && afterAction, 'bot UI functions must exist');

test('duel inline script remains valid JavaScript', () => {
  const script = html.slice(html.indexOf('<script>', html.indexOf('<script src=')) + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new vm.Script(script));
});

function uiGame(st, E, bot = BOT) {
  const timers = [];
  let renders = 0;
  let drains = 0;
  const context = vm.createContext({
    st, E, BOT: bot, FX: {}, mode: 'ai', console,
    render() { renders++; },
    drainQueues() { drains++; },
    offerHumanShield() { return false; },
    setTimeout(fn) { timers.push(fn); return timers.length; },
  });
  vm.runInContext(html.slice(botStart, botEnd) + '\n' + afterAction[0], context);
  return {
    timers, context,
    get renders() { return renders; },
    get drains() { return drains; },
    schedule() { vm.runInContext('scheduleBotTurn()', context); },
    afterAction() { vm.runInContext('afterAction()', context); },
    runTimer() { assert.ok(timers.length, 'bot tick scheduled'); timers.shift()(); },
  };
}

function seededDeck(st, side, count = 10) {
  st.players[side].main = Array.from({ length: count }, (_, i) =>
    H.mkInst(H.mkDb({ name: `Deck${side}-${i}` }), side));
  st.players[side]._deckLive = true;
}

test('bot starter advances Main -> End -> other player Draw without a human click', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.cur = 1; st._starter = 1; st.turn = 1; st.phase = 'main';
  seededDeck(st, 0);
  let battles = 0;
  const bot = { botMain() {}, botAbilities() {}, botBattle() { battles++; }, botDiscard() {} };
  const ui = uiGame(st, E, bot);
  ui.schedule();
  ui.runTimer();
  assert.equal(st.phase, 'end');
  assert.equal(ui.timers.length, 1, 'End Phase must receive its own bot tick');
  ui.runTimer();
  assert.equal(st.cur, 0);
  assert.equal(st.phase, 'draw');
  assert.equal(battles, 0, 'starter has no Battle Phase on first turn');
  assert.equal(ui.timers.length, 0);
});

test('bot nonstarter advances Main -> Battle -> End -> other player Draw', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.cur = 1; st._starter = 0; st.turn = 1; st.phase = 'main';
  seededDeck(st, 0);
  let battles = 0;
  const bot = { botMain() {}, botAbilities() {}, botBattle() { battles++; }, botDiscard() {} };
  const ui = uiGame(st, E, bot);
  ui.schedule();
  ui.runTimer();
  assert.equal(st.phase, 'battle');
  ui.runTimer();
  assert.equal(st.phase, 'end');
  ui.runTimer();
  assert.equal(st.cur, 0);
  assert.equal(st.phase, 'draw');
  assert.equal(battles, 1);
  assert.equal(ui.timers.length, 0);
});

test('bot resolves hand-over-seven through engine choice before passing turn', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.cur = 1; st._starter = 0; st.turn = 2; st.phase = 'end';
  seededDeck(st, 0);
  for (let i = 0; i < 8; i++) H.giveHand(st, 1, [H.mkInst(H.mkDb({ name: `Hand${i}`, gem: i + 1 }), 1)]);
  const before = st.players[1].hand.map(c => c.uid);
  assert.deepEqual(BOT.botDiscard(E, st, 1), ['wait-discard-choice']);
  assert.deepEqual(st.players[1].hand.map(c => c.uid), before, 'bot cannot discard before choice exists');
  const ui = uiGame(st, E);
  ui.schedule();
  ui.runTimer();
  assert.equal(st.cur, 0);
  assert.equal(st.players[1].hand.length, 7);
  assert.equal(st.players[1].hell.length, 1);
  assert.equal((st.pendingDiscards || []).length, 0);
  assert.ok(st.log.some(line => line.includes('เลือกทิ้ง')));
});

test('after a human response, the paused bot turn is scheduled again', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.cur = 1; st.phase = 'main'; st._starter = 0;
  st.pendingResponses = [{ key: 'human-choice', me: 0 }];
  const ui = uiGame(st, E, { botMain() {}, botAbilities() {}, botBattle() {}, botDiscard() {} });
  ui.schedule();
  assert.equal(ui.timers.length, 0, 'do not play through an unresolved response');
  st.pendingResponses = [];
  ui.afterAction();
  assert.equal(ui.timers.length, 1);
});

test('bot does not end Battle while a human defense modal is open', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.cur = 1; st.phase = 'battle'; st._starter = 0;
  const ui = uiGame(st, E, {
    botMain() {}, botAbilities() {}, botBattle() { return ['wait-defender']; }, botDiscard() {},
  });
  ui.schedule();
  ui.runTimer();
  assert.equal(st.phase, 'battle');
  assert.equal(ui.timers.length, 0);
  ui.afterAction();
  assert.equal(ui.timers.length, 1, 'defender choice wakes the bot');
});

test('bot does not resolve an attack while its response window is open', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.cur = 1; st.phase = 'battle';
  const attacker = H.mkInst(H.mkDb({ name: 'Bot attacker', power: 3 }), 1);
  H.giveAvatar(st, 1, [attacker]);
  let resolved = false;
  const attackEngine = Object.assign({}, E, {
    declareAttack() { st.pendingResponses = [{ key: 'react', me: 0 }]; return { ok: true, pending: true }; },
    resolveBattle() { resolved = true; return { ok: true }; },
  });
  const actions = BOT.botBattle(attackEngine, st, 1);
  assert.equal(resolved, false);
  assert.ok(actions.some(a => a.includes('wait-human')));
});

test('bot waits for the human โล่มนุษย์ choice before resolving battle', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.cur = 1; st.phase = 'battle';
  const attacker = H.mkInst(H.mkDb({ name: 'Bot attacker', power: 3 }), 1);
  const defender = H.mkInst(H.mkDb({ name: 'Human target', power: 1 }), 0);
  const shield = H.mkInst(H.mkDb({ name: 'Human shield', power: 2, mainEffect: 'โล่มนุษย์' }), 0);
  H.giveAvatar(st, 1, [attacker]);
  H.giveAvatar(st, 0, [defender, shield]);
  let resolved = false;
  let offered = false;
  const attackEngine = Object.assign({}, E, {
    resolveBattle() { resolved = true; return { ok: true }; },
  });
  const actions = BOT.botBattle(attackEngine, st, 1, (_atk, target) => {
    offered = target.kind === 'avatar';
    return offered;
  });
  assert.equal(offered, true);
  assert.equal(resolved, false);
  assert.ok(actions.includes('wait-defender'));
});

test('resumed bot attack against an avatar restores attacker context', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.cur = 1; st.phase = 'battle';
  const attacker = H.mkInst(H.mkDb({ name: 'Bot attacker' }), 1);
  const defender = H.mkInst(H.mkDb({ name: 'Human defender' }), 0);
  H.giveAvatar(st, 1, [attacker]);
  H.giveAvatar(st, 0, [defender]);
  let observed = null;
  const context = vm.createContext({
    window: {}, E, SFX: {}, mode: 'ai', atkUid: null, supSet: new Set(),
    setTimeout(fn) { fn(); },
    afterAction() {},
    finishAttackVsAvatar(_p, atk, def) { observed = [atk.uid, def.uid]; },
  });
  const start = html.indexOf('window.resumeAttackFrame = function');
  const end = html.indexOf('let _draining', start);
  vm.runInContext(html.slice(start, end), context);
  context.window.resumeAttackFrame(st, {
    owner: 1, atkUid: attacker.uid, evId: 1,
    target: { kind: 'avatar', uid: defender.uid }, supUids: [55], power: 3,
  });
  assert.deepEqual(observed, [attacker.uid, defender.uid]);
  assert.equal(context.atkUid, attacker.uid);
  assert.deepEqual([...context.supSet], [55]);
});

test('resumed bot attack wakes the bot when negated or target has left', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.cur = 1; st.phase = 'battle';
  const attacker = H.mkInst(H.mkDb({ name: 'Bot attacker' }), 1);
  H.giveAvatar(st, 1, [attacker]);
  let wakes = 0;
  const context = vm.createContext({
    window: {}, E, SFX: {}, mode: 'ai', atkUid: null, supSet: new Set(),
    setTimeout(fn) { fn(); },
    afterAction() { wakes++; },
    finishAttackVsAvatar() { throw new Error('target should be gone'); },
  });
  const start = html.indexOf('window.resumeAttackFrame = function');
  const end = html.indexOf('let _draining', start);
  vm.runInContext(html.slice(start, end), context);
  const frame = { owner: 1, atkUid: attacker.uid, evId: 1, target: { kind: 'avatar', uid: 99999 }, power: 3 };
  st._evStack = [{ id: 1, negated: true }];
  context.window.resumeAttackFrame(st, frame);
  st._evStack = [];
  context.window.resumeAttackFrame(st, frame);
  assert.equal(wakes, 2);
});

test('human โล่มนุษย์ can redirect a bot เตะไข่ attack away from LIFE', () => {
  const { E } = H.loadAll();
  const st = H.newEmptyGame(E);
  st.cur = 1; st.phase = 'battle';
  const attacker = H.mkInst(H.mkDb({ name: 'Bot kicker', power: 1, mainEffect: 'เตะไข่' }), 1);
  const shield = H.mkInst(H.mkDb({ name: 'Human shield', power: 3, mainEffect: 'โล่มนุษย์' }), 0);
  H.giveAvatar(st, 1, [attacker]);
  H.giveAvatar(st, 0, [shield]);
  const life = H.mkInst(H.mkDb({ name: 'Life', type: 'Life' }), 0);
  st.players[0].life = [{ card: life, open: false }];
  const dec = E.declareAttack(st, 1, attacker.uid, [], { kind: 'life' });
  assert.equal(dec.ok, true);
  let wakes = 0;
  const shieldButton = { dataset: { uid: String(shield.uid) }, onclick: null };
  const passButton = { onclick: null };
  const context = vm.createContext({
    st, E, mode: 'ai', SFX: {}, atkUid: null, supSet: new Set(),
    mbox() {}, mclose() {}, alert(message) { throw new Error(message); },
    afterAction() { wakes++; },
    document: {
      getElementById() { return passButton; },
      querySelectorAll() { return [shieldButton]; },
    },
  });
  const start = html.indexOf('function offerHumanShield');
  const end = html.indexOf('function finishAttackVsAvatar', start);
  vm.runInContext(html.slice(start, end), context);
  assert.equal(vm.runInContext(`offerHumanShield(st.players[1].avatar[0],{kind:'life'},{power:${dec.power}},[])`, context), true);
  assert.equal(st.players[0].life[0].open, false, 'attack must wait for the defender choice');
  shieldButton.onclick();
  assert.equal(shield.tapped, true);
  assert.equal(st.players[0].life[0].open, false);
  assert.equal(wakes, 1);
});
