'use strict';
// Deterministic regression harness: same script precedence as browser (HAND wins).
const path = require('path');
const ROOT = path.join(__dirname, '..');

function loadAll() {
  delete require.cache[require.resolve(path.join(ROOT, 'engine.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'effects.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'card-scripts.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'card-scripts-auto.js'))];
  const E = require(path.join(ROOT, 'engine.js'));
  const FX = require(path.join(ROOT, 'effects.js'));
  const HAND = require(path.join(ROOT, 'card-scripts.js'));
  const AUTO = require(path.join(ROOT, 'card-scripts-auto.js'));
  const merged = Object.assign({}, AUTO, HAND); // HAND wins
  global.BoTCardScripts = merged;
  if (typeof window !== 'undefined') window.BoTCardScripts = merged;
  FX.install(E);
  try { FX.setCardDB(require(path.join(ROOT, 'cards.json'))); } catch (e) {}
  FX.setHumanSides([]);
  return { E, FX, HAND, AUTO };
}

let _uid = 100000;
function mkDb(over) {
  return Object.assign({
    name: 'Test', print: 'TEST-000', type: 'Avatar',
    cost: 0, gem: 0, power: 1, symbol: 'เทพ', color: 'แดง',
    mainEffect: '', hashtagText: '',
  }, over || {});
}
function mkInst(db, owner) {
  _uid += 1;
  return {
    uid: _uid, db, owner, controller: owner,
    tapped: false, buffs: [], equipped: [],
    equippedTo: null, isToken: !!db.isToken || db.type === 'Token',
    battleBuff: 0, snapshot: null,
    silencedUntil: 0, fxUsed: {}, summonSick: false,
    grantedKw: [],
  };
}
function rowFor(print) {
  const db = require(path.join(ROOT, 'cards.json'));
  const found = db.find(c => c.print === print);
  if (!found) throw new Error('no card row ' + print);
  return found;
}
function newEmptyGame(E) {
  // bypass shuffle/draw: empty decks, controlled zones
  const st = E.newGame([], [], [], []);
  st.players.forEach(p => { p.main = []; p.hand = []; p.avatar = []; p.magic = []; p.construct = []; p.hell = []; p.dark = []; p.life = []; p.magicUsed = {}; });
  st.turn = 2; st.cur = 0; st.phase = 'main';
  st.log = [];
  return st;
}
function giveHand(st, pIdx, insts) {
  const p = st.players[pIdx];
  insts.forEach(c => { c.owner = pIdx; c.controller = pIdx; p.hand.push(c); });
}
function giveAvatar(st, pIdx, insts) {
  const p = st.players[pIdx];
  insts.forEach(c => { c.owner = c.owner !== undefined ? c.owner : pIdx; c.controller = pIdx; p.avatar.push(c); });
}
function snapshot(st) {
  const s = { zones: {}, counters: {}, usage: {}, pending: 0, frames: 0 };
  st.players.forEach((p, i) => {
    s.zones['p' + i + '_hand'] = p.hand.map(c => c.uid).sort((a, b) => a - b);
    s.zones['p' + i + '_avatar'] = p.avatar.map(c => c.uid).sort((a, b) => a - b);
    s.zones['p' + i + '_hell'] = p.hell.map(c => c.uid).sort((a, b) => a - b);
    s.zones['p' + i + '_magic'] = p.magic.map(c => c.uid).sort((a, b) => a - b);
    s.zones['p' + i + '_construct'] = p.construct.map(c => c.uid).sort((a, b) => a - b);
    s.counters['p' + i + '_magicUsed'] = Object.assign({}, p.magicUsed);
    s.zones['p' + i + '_handCount'] = p.hand.length;
  });
  s.pending = (st.pendingResponses || []).length;
  s.frames = (st._frames || []).length;
  s.pendingOps = (st.pendingOps || []).length;
  return JSON.stringify(s);
}
function gemCard(name, gem, color, symbol) {
  return mkDb({ name: name || 'Gem', print: 'GEM-' + name, type: 'Avatar', cost: 0, gem: gem || 1, power: 0, symbol: symbol || 'เทพ', color: color || 'แดง', mainEffect: '' });
}

module.exports = { loadAll, mkDb, mkInst, rowFor, newEmptyGame, giveHand, giveAvatar, snapshot, gemCard };
