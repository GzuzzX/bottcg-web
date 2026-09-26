/* Battle of Talingchan - Core Rules Engine v2 (RuleBook 3.2)
 * Zones/turns/costs/battles/LIFE per rulebook.
 * Card-text automation lives in effects.js + card-scripts.js via E.setFX().
 * Without FX, simple template fallback keeps every card manually playable.
 * Node + browser compatible.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BoTEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  let UID = 1;
  // Banlist: ใส่ print codes ของการ์ดที่ banned — อัปเดตตามประกาศทางการ
  const BANLIST = [
    // ตัวอย่าง: 'BT01-XXX', 'BT02-YYY'
    // เติม print code ที่ banned ที่นี่
  ];
  function isBanned(print) { return BANLIST.indexOf(print) >= 0; }
  let FXH = null; // effect handler from effects.js (optional)
  function setFX(h) { FXH = h; }
  function fx(name) {
    if (FXH && typeof FXH[name] === 'function') {
      const args = Array.prototype.slice.call(arguments, 1);
      return FXH[name].apply(FXH, args);
    }
    return undefined;
  }

  function inst(db, owner) {
    return {
      uid: UID++, db, owner, controller: owner,
      tapped: false, buffs: [], equipped: [],
      equippedTo: null, isToken: db.type === 'Token',
      battleBuff: 0, snapshot: null,
      silencedUntil: 0, fxUsed: {}, summonSick: false,
      grantedKw: [],
    };
  }
  // R04/R35: winner=0 (P1) is a valid game-over. Never use truthiness on st.winner.
  function isGameOver(st) { return st.winner !== null && st.winner !== undefined; }
  function checkDeckZero(st) {
    // R05: Main Deck 0 = lose immediately (either player). Called after any
    // removal from main (draw/search/scry/mill). Safe on empty test setups
    // because it only fires via explicit removal paths, not on blank state.
    if (isGameOver(st)) return;
    for (const p of st.players) {
      if (p.main.length === 0 && p._deckLive) {
        st.winner = 1 - p.idx; st.winReason = 'Deck หมด (0 ใบนับทันที)';
        slog(st, 'P' + (p.idx + 1) + ' Deck หมด — แพ้ทันที');
        break;
      }
    }
  }
  function hasKwEff(c, kw) {
    if (!c) return false;
    if ((c.db.mainEffect || '').includes(kw)) return true;
    if ((c.grantedKw || []).indexOf(kw) >= 0) return true;
    // keywords granted by equipped cards (SD02-017 style)
    if (FXH && typeof FXH.equipGrants === 'function') {
      const g = FXH.equipGrants(c);
      if (g && g.indexOf(kw) >= 0) return true;
    }
    return false;
  }

  // ---------- keyword / text helpers ----------
  function hasKw(c, kw) { return (c.db.mainEffect || '').includes(kw); }
  function parseDraw(text) {
    const m = /จั่วการ์ด?\s*(\d+)\s*ใบ/.exec(text || '');
    return m ? parseInt(m[1], 10) : 0;
  }
  function parsePowerMods(text) {
    const out = [];
    const re = /POWER\s*([+-])\s*(\d+)/g;
    let m; while ((m = re.exec(text || ''))) out.push({ sign: m[1], v: parseInt(m[2], 10) });
    return out;
  }
  function parseDestroyAvatar(text) {
    const m = /ทำลาย\s*Avatar[^\n]{0,40}?(\d+)\s*ใบ/.exec(text || '');
    return m ? parseInt(m[1], 10) : 0;
  }

  // ---------- power layers (0 base, L1 direct, L2 aura*, L3 snapshot, L4 battle) ----------
  // *v1: L2 auras from Land/Construct continuous are NOT auto-applied (logged);
  // Modification equip parsed +N applies as L1 on the equipped avatar.
  function equipBonus(c, st) {
    let b = 0;
    for (const e of c.equipped) {
      const ov = fx('equipBonusOverride', e, c, st || null);
      if (typeof ov === 'number') { b += ov; continue; }
      for (const m of parsePowerMods(e.db.mainEffect || '')) b += (m.sign === '+' ? m.v : -m.v);
    }
    const extra = fx('equipBonusExtra', c);
    if (typeof extra === 'number') b += extra;
    return b;
  }
  function buffSum(c) { return c.buffs.reduce((s, b) => s + b.v, 0); }
  function basePower(c) { return (c.db.power || 0) + (c.baseDelta || 0); }
  function effPower(c, battleExtra, st) {
    let aura = 0;
    if (st) {
      const a = fx('powerAura', c, st); if (typeof a === 'number') aura += a;
      const s = fx('powerSelf', c, st); if (typeof s === 'number') aura += s;
    }
    // R13: POWER floor 0 — never negative.
    const v = basePower(c) + equipBonus(c, st) + buffSum(c) + (battleExtra || 0) + (c.battleBuff || 0) + aura;
    return v < 0 ? 0 : v;
  }
  function silenced(c, st) {
    if (c.silencedUntil && st) {
      const k = st.turn * 2 + st.cur;
      if (k <= c.silencedUntil) return true;
    }
    return false;
  }

  // ---------- deck validation (p27 rulebook Deck Set) ----------
  function validateDecks(main, life) {
    const errs = [];
    if (main.length !== 50) errs.push('Main ต้อง 50 ใบพอดี (ตอนนี้ ' + main.length + ')');
    const onlys = main.filter(c => c.ex && /only/i.test(c.ex));
    if (onlys.length !== 1) errs.push('ต้องมี Only #1 1 ใบ (ตอนนี้ ' + onlys.length + ')');
    const banned = main.filter(c => isBanned(c.print));
    if (banned.length) errs.push('มีการ์ด Banned: ' + banned.map(c => c.name + ' (' + c.print + ')').join(', '));
    const bannedLife = life.filter(c => isBanned(c.print));
    if (bannedLife.length) errs.push('LIFE มีการ์ด Banned: ' + bannedLife.map(c => c.name + ' (' + c.print + ')').join(', '));
    if (main.some(c => /ลำเอียง/.test(c.hashtagText || '') || /ลำเอียง/.test(c.name || ''))) errs.push('มีการ์ดลำเอียง ห้ามแข่ง');
    const cnt = {};
    main.forEach(c => { cnt[c.name] = (cnt[c.name] || 0) + 1; });
    for (const n of Object.keys(cnt)) {
      const s = main.find(c => c.name === n);
      const lim = s.customLimit || 4;
      if (cnt[n] > lim) errs.push(n + ' เกินลิมิต (' + cnt[n] + '/' + lim + ')');
    }
    if (life.length !== 5) errs.push('LIFE ต้อง 5 ใบ');
    if (new Set(life.map(c => c.name)).size !== 5) errs.push('LIFE ชื่อห้ามซ้ำ');
    return errs;
  }

  // ---------- game setup ----------
  function newPlayer(mainDb, lifeDb, idx) {
    const live = (mainDb || []).length > 0;
    const pl = {
      idx, main: shuffle(mainDb.map(db => inst(db, idx))),
      hand: [], avatar: [], magic: [], construct: [],
      hell: [], dark: [], life: shuffle(lifeDb.map(db => ({ card: inst(db, idx), open: false }))),
      sahat: false, magicUsed: {},
    };
    // R05 guard: only real decks (non-empty at creation) can trigger deck-zero loss.
    // Test harnesses that build empty games set main=[] manually and stay exempt
    // until they put cards in (drawOne/search/mill set the flag on removal).
    pl._deckLive = live;
    return pl;
  }
  function newGame(mainDb1, lifeDb1, mainDb2, lifeDb2) {
    UID = 1;
    const st = {
      players: [newPlayer(mainDb1, lifeDb1, 0), newPlayer(mainDb2, lifeDb2, 1)],
      land: null, turn: 1, cur: 0, phase: 'rps',
      winner: null, winReason: '', log: [],
      stack: [], pendingOps: [], battleCount: 0,
      mulliganDone: [false, false],
      rps: [null, null]
    };
    slog(st, 'Setup: เป่ายิ้งฉุบหาคนเริ่มก่อน');
    return st;
  }
  function submitRPS(st, pIdx, choice) {
    if (st.phase !== 'rps') return { ok: false, error: 'ไม่ใช่ช่วงเป่ายิ้งฉุบ' };
    // R11: validate protocol input — bad side/choice must not corrupt state.
    if (pIdx !== 0 && pIdx !== 1) return { ok: false, error: 'ฝ่ายไม่ถูกต้อง' };
    if (choice !== 'rock' && choice !== 'paper' && choice !== 'scissors') return { ok: false, error: 'ท่าเป่ายิ้งฉุบไม่ถูกต้อง' };
    if (st.rps[pIdx]) return { ok: false, error: 'ส่งท่าไปแล้ว' };
    st.rps[pIdx] = choice;
    
    if (st.rps[0] && st.rps[1]) {
      const c0 = st.rps[0];
      const c1 = st.rps[1];
      if (c0 === c1) {
        st.rps = [null, null];
        slog(st, 'เป่ายิ้งฉุบ: เสมอ (' + c0 + ')');
        return { ok: true, result: 'tie' };
      }
      let winner;
      if (c0 === 'rock') winner = c1 === 'scissors' ? 0 : 1;
      else if (c0 === 'scissors') winner = c1 === 'paper' ? 0 : 1;
      else if (c0 === 'paper') winner = c1 === 'rock' ? 0 : 1;
      
      st.cur = winner;
      st._starter = winner;
      slog(st, 'เป่ายิ้งฉุบ: P' + (winner + 1) + ' ชนะได้เริ่มก่อน');
      
      for (const p of st.players) p.hand = p.main.splice(0, 5);
      
      st.phase = 'mulligan';
      slog(st, 'Setup: จั่วคนละ 5 ใบ (รอเปลี่ยนการ์ด)');
    }
    return { ok: true };
  }
  function mulligan(st, pIdx, returnUids) {
    if (st.phase !== 'mulligan') return { ok: false, error: 'ไม่ใช่ช่วงเปลี่ยนการ์ด' };
    // R06/R11: strict validation — side, shape, dup, ownership.
    if (pIdx !== 0 && pIdx !== 1) return { ok: false, error: 'ฝ่ายไม่ถูกต้อง' };
    if (!Array.isArray(returnUids)) return { ok: false, error: 'รูปแบบการคืนไพ่ไม่ถูกต้อง' };
    if (returnUids.length > 5) return { ok: false, error: 'คืนได้สูงสุด 5 ใบ' };
    if (new Set(returnUids).size !== returnUids.length) return { ok: false, error: 'เลือกการ์ดซ้ำ' };
    if (st.mulliganDone[pIdx]) return { ok: false, error: 'เปลี่ยนการ์ดไปแล้ว' };
    const p = st.players[pIdx];
    const returning = [];
    for (const uid of returnUids) {
      const i = p.hand.findIndex(c => c.uid === uid);
      if (i < 0) return { ok: false, error: 'การ์ดไม่อยู่บนมือ (stale)' };
      returning.push(p.hand.splice(i, 1)[0]);
    }
    // R06 order per PDF p.19: returned cards to BOTTOM first, draw replacements,
    // then SHUFFLE that player's deck immediately.
    p.main.push(...returning);
    for (let i = 0; i < returning.length; i++) {
      if (p.main.length === 0) { checkDeckZero(st); break; }
      p._deckLive = true;
      p.hand.push(p.main.shift());
    }
    shuffle(p.main);
    if (p.main.length === 0) checkDeckZero(st);
    st.mulliganDone[pIdx] = true;
    slog(st, 'P' + (pIdx + 1) + ' เปลี่ยนการ์ด ' + returning.length + ' ใบ');
    
    if (st.mulliganDone[0] && st.mulliganDone[1]) {
      st.phase = 'draw';
      doDrawPhase(st);
    }
    return { ok: true };
  }
  function slog(st, t) { st.log.push('T' + st.turn + ' P' + (st.cur + 1) + ' [' + st.phase + '] ' + t); }
  
  let _rngSeed = 0;
  function setSeed(s) { _rngSeed = s; }
  function rng() {
    if (_rngSeed) {
      _rngSeed = (_rngSeed * 9301 + 49297) % 233280;
      return _rngSeed / 233280;
    }
    return Math.random();
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function foe(st) { return st.players[1 - st.cur]; }
  function me(st) { return st.players[st.cur]; }

  function drawOne(st, p) {
    if (p.main.length === 0) { st.winner = 1 - p.idx; st.winReason = 'Deck หมด (0 ใบนับทันที)'; return null; }
    p._deckLive = true;
    const c = p.main.shift(); p.hand.push(c);
    // R05: deck hits 0 AFTER the draw = lose immediately, no waiting.
    if (p.main.length === 0) checkDeckZero(st);
    return c;
  }

  // ---------- Draw Phase ----------
  function doDrawPhase(st) {
    const p = me(st);
    p.avatar.forEach(a => { a.tapped = false; a.battleBuff = 0; a.snapshot = null; });
    let need;
    if (!st._firstDrawDone) {
      need = 2;
      st._firstDrawDone = true;
    } else {
      need = p.hand.length < 3 ? 3 - p.hand.length : 1;
    }
    for (let i = 0; i < need; i++) { if (!drawOne(st, p)) break; }
    slog(st, 'Draw: จั่ว ' + need + ' (มือ ' + p.hand.length + ')');
    fx('onDrawEnd', st, st.cur);
  }

  // GEM color restriction: card text (#) may limit which colors a card can pay for.
  // gemLimitFor(db) -> null (any) | {names:[...]} target-name substrings allowed.
  function gemLimitFor(db) {
    const r = fx('gemLimitFor', db);
    if (r !== undefined) return r;
    const t = (db.mainEffect || '') + ' ' + (db.hashtagText || '');
    const m = /ใช้เป็น Cost .*เฉพาะ Avatar "([^"]+)"/.exec(t);
    if (m) return { names: m[1].split(/หรือ|,/).map(s => s.trim().replace(/"/g, '')).filter(Boolean) };
    return null;
  }

  // ---------- response gating ----------
  function responsePending(st) {
    return !!((st.pendingResponses && st.pendingResponses.length) || (st._frames && st._frames.length) ||
      (st.pendingDiscards && st.pendingDiscards.length));
  }
  function blockIfPending(st) {
    if ((st.pendingDiscards && st.pendingDiscards.length)) return { ok: false, error: 'เลือกทิ้งมือให้เหลือ 7 ก่อน' };
    if (responsePending(st)) return { ok: false, error: 'รอการตัดสินใจสวนก่อน' };
    return null;
  }
  // R10: End Phase hand-max is a player CHOICE, never an auto-pop.
  function pendingDiscard(st, pIdx, count) {
    st.pendingDiscards = st.pendingDiscards || [];
    if (st.pendingDiscards.some(d => d.owner === pIdx)) return;
    st.pendingDiscards.push({ owner: pIdx, count });
    slog(st, 'P' + (pIdx + 1) + ' มือเกิน 7 — เลือกทิ้ง ' + count + ' ใบ');
  }
  function resolveDiscard(st, pIdx, uids) {
    st.pendingDiscards = st.pendingDiscards || [];
    const i = st.pendingDiscards.findIndex(d => d.owner === pIdx);
    if (i < 0) return { ok: false, error: 'ไม่มีคิวทิ้งมือ' };
    const q = st.pendingDiscards[i];
    uids = (uids || []).slice();
    if (new Set(uids).size !== uids.length) return { ok: false, error: 'เลือกการ์ดซ้ำ' };
    if (uids.length !== q.count) return { ok: false, error: 'ต้องเลือกทิ้ง ' + q.count + ' ใบ' };
    const p = st.players[pIdx];
    for (const u of uids) {
      if (p.hand.findIndex(c => c.uid === u) < 0) return { ok: false, error: 'การ์ดไม่อยู่บนมือ (stale)' };
    }
    uids.forEach(u => {
      const k = p.hand.findIndex(c => c.uid === u);
      const c = p.hand.splice(k, 1)[0];
      p.hell.push(c);
    });
    st.pendingDiscards.splice(i, 1);
    slog(st, 'P' + (pIdx + 1) + ' ทิ้งมือเหลือ 7');
    return { ok: true };
  }

  // ---------- Cost payment (Avatar/Construct) ----------
  // returns {ok, error, pay:[inst]} — caller removes pay from hand to hell
  // Atomic: mutation-free validation; checks ownership, duplicates, stale, self, color, limits, bans, quantities.
  function checkPay(st, p, needCost, needColor, payList, payTargetName, excludeUid, isMagic = false) {
    payList = payList || [];
    if (needCost === 0) {
      if (payList.length) return { ok: false, error: 'ไม่ต้องจ่ายแต่เลือกการ์ดมา' };
      return { ok: true, pay: [] };
    }
    if (!payList.length) return { ok: false, error: isMagic ? 'ไม่ได้เลือกการ์ดทิ้งจ่าย Cost (0/' + needCost + ')' : 'GEM ไม่พอ (0/' + needCost + ')' };
    const seen = {};
    for (const c of payList) {
      if (!c) return { ok: false, error: 'การ์ดที่เลือกไม่ถูกต้อง (stale)' };
      if (seen[c.uid]) return { ok: false, error: 'เลือกการ์ดซ้ำ' };
      seen[c.uid] = true;
      if (excludeUid && c.uid === excludeUid) return { ok: false, error: 'ใช้การ์ดตัวเองจ่ายไม่ได้' };
      if (p.hand.indexOf(c) < 0) return { ok: false, error: 'การ์ดไม่อยู่บนมือ (stale)' };
      if (!isMagic && (c.db.gem || 0) <= 0) return { ok: false, error: 'การ์ด GEM 0 ทิ้งจ่ายไม่ได้' };
    }
    const gems = payList.slice();
    for (const c of gems) {
      if (c.db.name === payTargetName) return { ok: false, error: 'ห้ามใช้การ์ดชื่อเดียวกันจ่าย Cost ให้กันและกัน' };
      const gc = c.db.gemColor || '';
      if (!isMagic && gc && needColor && gc !== needColor) return { ok: false, error: 'GEM สีไม่ตรง (' + gc + ' ต้องการ ' + needColor + ')' };
      const lim = gemLimitFor(c.db);
      if (!isMagic && lim && lim.names && payTargetName) {
        const okName = lim.names.some(n => (payTargetName || '').includes(n));
        if (!okName) return { ok: false, error: c.db.name + ' ใช้จ่ายได้เฉพาะ ' + lim.names.join('/') };
      }
      if (fx('costBanHit', st, c.db, p.idx)) return { ok: false, error: c.db.name + ' ถูกห้ามใช้เป็น Cost (เอฟเฟค)' };
    }
    if (isMagic) {
      if (gems.length !== needCost) return { ok: false, error: 'Cost เวทมนตร์ต้องทิ้งไพ่จำนวน ' + needCost + ' ใบ (เลือกมา ' + gems.length + ' ใบ)' };
    } else {
      const sum = gems.reduce((s, c) => s + c.db.gem, 0);
      if (sum < needCost) return { ok: false, error: 'GEM ไม่พอ (' + sum + '/' + needCost + ')' };
      const min = Math.min.apply(null, gems.map(c => c.db.gem));
      if (sum - min >= needCost) return { ok: false, error: 'จ่ายเกินโดยไม่จำเป็น (ห้ามจ่ายเพิ่มเมื่อพอแล้ว)' };
    }
    return { ok: true, pay: payList.slice() };
  }
  function payCost(st, p, needCost, needColor, payList, payTargetName, excludeUid, isMagic = false) {
    const chk = checkPay(st, p, needCost, needColor, payList, payTargetName, excludeUid, isMagic);
    if (!chk.ok) return chk;
    payList.forEach(c => {
      const i = p.hand.indexOf(c);
      if (i >= 0) p.hand.splice(i, 1);
      p.hell.push(c); // cards paying GEM go via Cost Step
    });
    fx('onPaidAsCost', st, p.idx, payList.slice(), payTargetName || '');
    return { ok: true };
  }
  // Preview helper for UI/AI (authoritative, mutation-free)
  function validateGem(st, pIdx, needCost, needColor, payUids, payTargetName, excludeUid) {
    const p = st.players[pIdx];
    const list = (payUids || []).map(u => p.hand.find(c => c.uid === u)).filter(Boolean);
    if (list.length !== (payUids || []).length) return { ok: false, error: 'GEM ที่เลือกไม่ถูกต้อง (stale)' };
    return checkPay(st, p, needCost, needColor, list, payTargetName, excludeUid);
  }

  function avatarLimitOk(p, incoming) {
    const total = p.avatar.length;
    const nonTok = p.avatar.filter(a => !a.isToken).length;
    const incTok = !!(incoming && incoming.isToken);
    if (total >= 6) return false;
    if (!incTok && nonTok >= 4) return false;
    return true;
  }
  function summonAvatar(st, pIdx, handUid, payUids) {
    const st2 = st, p = st.players[pIdx];
    if (isGameOver(st)) return { ok: false, error: 'เกมจบแล้ว' };
    if (st.phase !== 'main' || st.cur !== pIdx) return { ok: false, error: 'อัญเชิญได้เฉพาะ Main Phase ของคุณเท่านั้น' };
    const blk = blockIfPending(st);
    if (blk) return blk;
    const card = p.hand.find(c => c.uid === handUid);
    if (!card || card.db.type !== 'Avatar') return { ok: false, error: 'ไม่ใช่ Avatar บนมือ' };
    const sb = fx('summonBan', st, card);
    if (sb) return { ok: false, error: card.db.name + ' อัญเชิญไม่ได้ (' + sb + ')' };
    if (!avatarLimitOk(p, card)) return { ok: false, error: 'Avatar Zone เต็ม (รวม Token 6 / Avatar 4)' };
    const rawPay = (payUids || []).slice();
    if (rawPay.indexOf(handUid) >= 0) return { ok: false, error: 'ใช้การ์ดตัวเองจ่ายไม่ได้' };
    if (new Set(rawPay).size !== rawPay.length) return { ok: false, error: 'เลือก GEM ซ้ำ' };
    const pays = rawPay.map(u => p.hand.find(c => c.uid === u));
    if (pays.some(c => !c)) return { ok: false, error: 'GEM ที่เลือกไม่ถูกต้อง (stale)' };
    // mutation-free validation first
    const preChk = checkPay(st2, p, card.db.cost || 0, card.db.color || '', pays, card.db.name, handUid);
    if (!preChk.ok) return preChk;
    const paidSum = pays.reduce((s, c) => s + (c.db.gem || 0), 0);
    st._summoning = card;
    const pr = payCost(st2, p, card.db.cost || 0, card.db.color || '', pays, card.db.name, handUid);
    st._summoning = null;
    if (!pr.ok) return pr;
    p.hand.splice(p.hand.indexOf(card), 1);
    card.controller = pIdx; card.tapped = false;
    card._podi = (paidSum === (card.db.cost || 0));
    card._summonSeq = (st2._summonSeq = (st2._summonSeq || 0) + 1);
    p.avatar.push(card);
    slog(st2, 'P' + (pIdx + 1) + ' อัญเชิญ ' + card.db.name + ' (Cost ' + card.db.cost + ')');
    // response window: opponent React/abilities vs the summon (อุบัติเหตุ) resolves FIRST
    // assign event id for resumable frames (effects.js owns counter)
    const ev = { type: 'avatarSummoned', card, owner: pIdx, cancelled: false };
    const r = fx('onEvent', st2, ev);
    const hasPending = (st2.pendingResponses || []).some(q => q.evId === ev.id) || r === 'queued' || st2._pendingEv === ev;
    if (hasPending) {
      st2._frames = st2._frames || [];
      st2._frames.push({ evId: ev.id, kind: 'summonJuti', cardUid: card.uid, owner: pIdx });
      st2._pendingEv = ev;
      return { ok: true, card, pending: true, evId: ev.id };
    }
    // R25: destroy != negate — resolve triggered จุติ from the event snapshot
    // even if a React destroyed the summoned card synchronously.
    const handled = fx('onSummoned', st2, card, { byCost: true });
    if (handled === true) return { ok: true, card };
    // Fallback simple templates (no FX): จุติ -> parse simple ops, else pending manual
    const ops = [];
    if (hasKw(card, 'จุติ')) {
      const d = parseDraw(card.db.mainEffect);
      if (d) ops.push({ kind: 'draw', n: d, src: card, owner: pIdx });
      parsePowerMods(card.db.mainEffect).forEach(m => ops.push({ kind: 'selfBuff', v: m.sign === '+' ? m.v : -m.v, src: card }));
      const k = parseDestroyAvatar(card.db.mainEffect);
      if (k) ops.push({ kind: 'destroyFoeAvatar', n: k, src: card, owner: pIdx });
      if (!ops.length) st2.pendingOps.push({ kind: 'manual', text: 'จุติ ' + card.db.name + ' (เอฟเฟคซับซ้อน - ผู้เล่นบังคับเองตาม text)', src: card });
    }
    resolveOps(st2, ops);
    return { ok: true, card };
  }

  function resolveOps(st, ops) {
    for (const op of ops) {
      if (isGameOver(st)) break;
      const p = st.players[op.owner !== undefined ? op.owner : st.cur];
      if (op.kind === 'draw') { for (let i = 0; i < op.n; i++) { if (isGameOver(st)) break; drawOne(st, p); } slog(st, (op.src ? op.src.db.name : '') + ' จั่ว ' + op.n); }
      else if (op.kind === 'selfBuff' && op.src) { op.src.buffs.push({ v: op.v, until: 'endTurn' }); slog(st, op.src.db.name + ' POWER ' + (op.v >= 0 ? '+' : '') + op.v); }
      else if (op.kind === 'destroyFoeAvatar') {
        // R32: no raw splice — route through unified destruction (triggers/replacement).
        const f = st.players[1 - (op.owner !== undefined ? op.owner : st.cur)];
        for (let i = 0; i < op.n && f.avatar.length; i++) {
          f.avatar.sort((a, b) => effPower(b, 0, st) - effPower(a, 0, st));
          const d = f.avatar[0];
          if (!d) break;
          destroyInst(st, d, op.src ? op.src.db.name : 'เอฟเฟค');
          if (isGameOver(st)) break;
        }
      }
    }
  }

  // ---------- Construct ----------
  function buildConstruct(st, pIdx, handUid, payUids) {
    const p = st.players[pIdx];
    if (isGameOver(st)) return { ok: false, error: 'เกมจบแล้ว' };
    if (st.phase !== 'main' || st.cur !== pIdx) return { ok: false, error: 'ก่อสร้างได้เฉพาะ Main Phase ของคุณเท่านั้น' };
    const blk = blockIfPending(st);
    if (blk) return blk;
    const card = p.hand.find(c => c.uid === handUid);
    if (!card || card.db.type !== 'Construct') return { ok: false, error: 'ไม่ใช่ Construct' };
    if (p.construct.length >= 3) return { ok: false, error: 'Construct Zone เต็ม 3' };
    if (p.construct.some(c => c.db.name === card.db.name)) return { ok: false, error: 'ชื่อซ้ำใน Construct Zone ฝ่ายตัวเอง' };
    const rawPay = (payUids || []).slice();
    if (rawPay.indexOf(handUid) >= 0) return { ok: false, error: 'ใช้การ์ดตัวเองจ่ายไม่ได้' };
    if (new Set(rawPay).size !== rawPay.length) return { ok: false, error: 'เลือก GEM ซ้ำ' };
    const pays = rawPay.map(u => p.hand.find(c => c.uid === u));
    if (pays.some(c => !c)) return { ok: false, error: 'GEM ที่เลือกไม่ถูกต้อง (stale)' };
    const effCost = typeof card.cost === 'number' ? card.cost : (card.db.cost || 0);
    const preChk = checkPay(st, p, effCost, card.db.color || '', pays, card.db.name, handUid);
    if (!preChk.ok) return preChk;
    const pr = payCost(st, p, effCost, card.db.color || '', pays, card.db.name, handUid);
    if (!pr.ok) return pr;
    p.hand.splice(p.hand.indexOf(card), 1);
    card.controller = pIdx; p.construct.push(card);
    slog(st, 'P' + (pIdx + 1) + ' ก่อสร้าง ' + card.db.name);
    fx('onBuilt', st, pIdx, card);
    return { ok: true, card };
  }

  // ---------- shared zone ops (used by effects.js) ----------
  function detachEquipCentral(st, equipInst) {
    // remove equip from host + magic zone, no hell push (caller decides)
    if (equipInst.equippedTo !== null && equipInst.equippedTo !== undefined) {
      const host = findAvatar(st, equipInst.equippedTo);
      if (host) { const i = host.equipped.indexOf(equipInst); if (i >= 0) host.equipped.splice(i, 1); }
      equipInst.equippedTo = null;
    }
    const cp = st.players[equipInst.controller];
    const mi = cp.magic.indexOf(equipInst);
    if (mi >= 0) cp.magic.splice(mi, 1);
  }
  function removeFromZones(st, inst) {
    // Land zone central: clear st.land if this is the land card
    if (st.land && st.land.card === inst) st.land = null;
    // detach equips first (sent to hell of their controller, tagged with host)
    // centralized: also purge from magic zone to avoid dual-zone leak
    (inst.equipped || []).slice().forEach(e => {
      const i = inst.equipped.indexOf(e);
      if (i >= 0) inst.equipped.splice(i, 1);
      e.equippedTo = null;
      e._droppedWith = inst.uid;
      // purge from magic zone first (fallback destruction central)
      const ep = st.players[e.controller];
      const mi = ep.magic.indexOf(e);
      if (mi >= 0) ep.magic.splice(mi, 1);
      // also purge from any other zone the equip might linger in
      [['avatar', ep.avatar], ['construct', ep.construct], ['hand', ep.hand]].forEach(pair => {
        const j = pair[1].indexOf(e);
        if (j >= 0) pair[1].splice(j, 1);
      });
      const hi = ep.hell.indexOf(e);
      if (hi < 0) ep.hell.push(e);
      fx('onEquipHell', st, e);
    });
    inst.equipped = [];
    // if this card itself is equipped somewhere, detach
    if (inst.equippedTo !== null && inst.equippedTo !== undefined) {
      const host = findAvatar(st, inst.equippedTo);
      if (host) { const i = host.equipped.indexOf(inst); if (i >= 0) host.equipped.splice(i, 1); }
      inst.equippedTo = null;
    }
    const p = st.players[inst.controller];
    [['avatar', p.avatar], ['magic', p.magic], ['construct', p.construct]].forEach(pair => {
      const i = pair[1].indexOf(inst);
      if (i >= 0) pair[1].splice(i, 1);
    });
    let hi = p.hand.indexOf(inst);
    if (hi >= 0) p.hand.splice(hi, 1);
    // also purge from hell/dark/deck (effect moves from those zones)
    [['hell', p.hell], ['dark', p.dark], ['main', p.main]].forEach(pair => {
      const i = pair[1].indexOf(inst);
      if (i >= 0) pair[1].splice(i, 1);
    });
    delete inst._droppedWith;
  }
  function findAvatar(st, uid) {
    for (const p of st.players) {
      const a = p.avatar.find(x => x.uid === uid);
      if (a) return a;
    }
    return null;
  }
  function onField(st, inst) {
    for (const p of st.players) {
      if (p.avatar.indexOf(inst) >= 0 || p.magic.indexOf(inst) >= 0 || p.construct.indexOf(inst) >= 0) return true;
    }
    if (st.land && st.land.card === inst) return true;
    return false;
  }
  // unified destroy (battle + effects). Replacement window first (BT02-010 style),
  // then คำสั่งเสีย via FX (fallback: manual pending).
  let leavingDepth = 0;
  function destroyInst(st, inst, reason) {
    const owner = st.players[inst.owner];
    // capture zone before removal for conditional triggers (including Land)
    let fromZone = null;
    for (const p of st.players) {
      if (p.avatar.indexOf(inst) >= 0) fromZone = 'avatar';
      else if (p.magic.indexOf(inst) >= 0) fromZone = 'magic';
      else if (p.construct.indexOf(inst) >= 0) fromZone = 'construct';
    }
    if (!fromZone && st.land && st.land.card === inst) fromZone = 'land';
    if (leavingDepth === 0) {
      const ev = { type: 'avatarLeaving', inst, owner: inst.controller, cancelled: false, reason, fromZone };
      leavingDepth++;
      try { fx('onEvent', st, ev); } finally { leavingDepth--; }
      if (ev.cancelled) { slog(st, inst.db.name + ' รอดจากการออกสนาม (แทนที่)'); return false; }
    }
    if (!/ต่อสู้|เสมอ|ลูกฮึด/.test(reason || '') && fx('destroyProtected', st, inst)) {
      slog(st, inst.db.name + ' ไม่ถูกทำลาย (เอฟเฟคป้องกัน)');
      return false;
    }
    const wasEquipped = inst.equippedTo !== null && inst.equippedTo !== undefined;
    removeFromZones(st, inst);
    if (inst.isToken) {
      slog(st, inst.db.name + ' (Token) ถูกทำลาย — หายไปจากเกม' + (reason ? ' (' + reason + ')' : ''));
    } else {
      owner.hell.push(inst);
      slog(st, inst.db.name + ' ถูกทำลาย' + (reason ? ' (' + reason + ')' : ''));
    }
    if (wasEquipped) fx('onEquipHell', st, inst);
    const handled = fx('onDestroyed', st, inst, { fromZone });
    if (handled !== true && hasKw(inst, 'คำสั่งเสีย')) {
      st.pendingOps.push({ kind: 'manual', text: 'คำสั่งเสีย ' + inst.db.name + ' (บังคับเองตาม text)', src: inst });
    }
    return true;
  }
  function exileInst(st, inst, reason) {
    const owner = st.players[inst.owner];
    removeFromZones(st, inst);
    // R20: Token leaves the game — never rests in Dark/Deck/Hand/Hell.
    if (inst.isToken) {
      slog(st, inst.db.name + ' (Token) ถูกเนรเทศ — หายไปจากเกม' + (reason ? ' (' + reason + ')' : ''));
      return true;
    }
    owner.dark.push(inst);
    slog(st, inst.db.name + ' ถูกเนรเทศ' + (reason ? ' (' + reason + ')' : ''));
    return true;
  }
  function bounceInst(st, inst) {
    const owner = st.players[inst.owner];
    removeFromZones(st, inst);
    if (inst.isToken) {
      slog(st, inst.db.name + ' (Token) ออกจากสนาม — หายไปจากเกม');
    } else {
      owner.hand.push(inst);
      slog(st, inst.db.name + ' กลับขึ้นมือ');
    }
    return true;
  }
  function deckReturnInst(st, inst, toBottom, doShuffle) {
    const owner = st.players[inst.owner];
    removeFromZones(st, inst);
    // R20: Token leaves the game — never rests in Deck.
    if (inst.isToken) {
      slog(st, inst.db.name + ' (Token) กลับเข้า Deck — หายไปจากเกม');
      return true;
    }
    if (toBottom) owner.main.push(inst);
    else owner.main.unshift(inst);
    if (doShuffle) shuffle(owner.main);
    slog(st, inst.db.name + ' กลับเข้า Deck');
    return true;
  }
  // effect summon: move instance from its current zone (hand/hell/dark/magic-equipped) to avatar zone, no GEM cost
  function summonFromZone(st, pIdx, inst, opts) {
    opts = opts || {};
    const p = st.players[pIdx];
    if (isGameOver(st)) return { ok: false, error: 'เกมจบแล้ว' };
    if (!avatarLimitOk(p, inst)) return { ok: false, error: 'Avatar Zone เต็ม' };
    removeFromZones(st, inst);
    inst.controller = pIdx; inst.tapped = false; inst.battleBuff = 0; inst.snapshot = null;
    inst._summonSeq = (st._summonSeq = (st._summonSeq || 0) + 1);
    p.avatar.push(inst);
    slog(st, 'P' + (pIdx + 1) + ' อัญเชิญ ' + inst.db.name + ' (ด้วยเอฟเฟค)');
    const ev = { type: 'avatarSummoned', card: inst, owner: pIdx, cancelled: false };
    const r = fx('onEvent', st, ev);
    const hasPending = (st.pendingResponses || []).some(q => q.evId === ev.id) || r === 'queued' || st._pendingEv === ev;
    if (hasPending) {
      st._frames = st._frames || [];
      st._frames.push({ evId: ev.id, kind: 'summonJuti', cardUid: inst.uid, owner: pIdx, byCost: false, juti: !!opts.juti });
      st._pendingEv = ev;
      return { ok: true, card: inst, pending: true, evId: ev.id };
    }
    if (opts.juti && onField(st, inst)) {
      const handled = fx('onSummoned', st, inst, { byCost: false, juti: true });
      if (handled !== true) {
        const ops = [];
        if (hasKw(inst, 'จุติ')) {
          const d = parseDraw(inst.db.mainEffect);
          if (d) ops.push({ kind: 'draw', n: d, src: inst, owner: pIdx });
          if (!ops.length) st.pendingOps.push({ kind: 'manual', text: 'จุติ ' + inst.db.name, src: inst });
        }
        resolveOps(st, ops);
      }
    } else {
      fx('onSummoned', st, inst, { byCost: false });
    }
    return { ok: true, card: inst };
  }
  function attachEquip(st, equipInst, hostInst) {
    detachEquipCentral(st, equipInst);
    // purge equip from all other zones before attaching (centralized movement)
    const ep = st.players[equipInst.controller];
    [['avatar', ep.avatar], ['construct', ep.construct], ['hand', ep.hand], ['hell', ep.hell], ['dark', ep.dark], ['main', ep.main]].forEach(pair => {
      const i = pair[1].indexOf(equipInst);
      if (i >= 0) pair[1].splice(i, 1);
    });
    delete equipInst._droppedWith;
    hostInst.equipped.push(equipInst);
    equipInst.equippedTo = hostInst.uid;
    equipInst.controller = hostInst.controller;
    st.players[hostInst.controller].magic.push(equipInst);
    slog(st, equipInst.db.name + ' สวมใส่ -> ' + hostInst.db.name);
    fx('onEquipped', st, equipInst, hostInst);
    return true;
  }
  // move equipped card back to avatar zone as avatar (โอตะ unsummon)
  function equippedToAvatarZone(st, equipInst) {
    const p = st.players[equipInst.controller];
    if (!avatarLimitOk(p, equipInst)) return { ok: false, error: 'Avatar Zone เต็ม' };
    removeFromZones(st, equipInst);
    equipInst.controller = p.idx; equipInst.tapped = false;
    p.avatar.push(equipInst);
    slog(st, equipInst.db.name + ' อัญเชิญจากสภาพสวมใส่');
    return { ok: true, card: equipInst };
  }
  function gainControl(st, inst, newController) {
    // R19: change of control is NOT leaving the field. Equipment stays in its
    // owner's Magic Zone; only the Avatar moves between controllers' lists.
    // Enforce zone cap before committing.
    if (inst.controller === newController) return { ok: true };
    const p = st.players[newController];
    if (!avatarLimitOk(p, inst)) return { ok: false, error: 'Avatar Zone ฝั่งรับเต็ม' };
    const old = st.players[inst.controller];
    const i = old.avatar.indexOf(inst);
    if (i < 0) return { ok: false, error: 'การ์ดไม่อยู่บนสนาม' };
    old.avatar.splice(i, 1);
    // Land binding follows the card, not the player — keep st.land owner in sync.
    if (st.land && st.land.card === inst) st.land.owner = newController;
    inst.controller = newController;
    p.avatar.push(inst);
    slog(st, inst.db.name + ' เปลี่ยนการควบคุม -> P' + (newController + 1));
    return { ok: true };
  }
  // R21: LIFE ability only queues when opened by attack/damage, not by bare effects.
  function flipLifeAt(st, pIdx, count, faceUp, cause) {
    const p = st.players[pIdx];
    const allowQueue = (cause === 'attack' || cause === 'damage');
    let n = 0;
    for (const l of p.life) {
      if (n >= count) break;
      if (faceUp && !l.open) {
        l.open = true; n++;
        if (allowQueue) fx('onLifeFlipped', st, pIdx, l);
        else slog(st, 'หงาย LIFE ' + l.card.db.name + ' (เอฟเฟค — ไม่สั่ง ability)');
      }
      else if (!faceUp && l.open && !p.sahat) { l.open = false; n++; }
    }
    if (p.life.every(l => l.open)) { p.sahat = true; slog(st, 'P' + (pIdx + 1) + ' เข้าสู่สถานะสาหัส'); }
    return n;
  }
  function winGame(st, pIdx, reason) {
    st.winner = pIdx; st.winReason = reason || 'ชนะพิเศษ';
    slog(st, 'P' + (pIdx + 1) + ' WIN (' + st.winReason + ')');
  }
  // delayed queue: immediate (owner's next Main start) or countdown {waitPhase, waitOwner, count}
  function addDelayed(st, ownerIdx, desc, data) {
    st.delayed = st.delayed || [];
    st.delayed.push({ owner: ownerIdx, desc, data: data || {} });
    slog(st, 'ตั้งเวลาทำงาน: ' + desc);
  }
  function tickDelayed(st) {
    st.delayed = st.delayed || [];
    const still = [];
    st.delayed.forEach(d => {
      const w = d.data && d.data.wait;
      if (!w) { still.push(d); return; }
      const ownerMatch = w.owner === 'any' || (w.owner === 'foe' ? st.cur !== d.owner : st.cur === d.owner);
      if (st.phase === w.phase && ownerMatch) {
        w.count = (w.count === undefined ? 1 : w.count) - 1;
        if (w.count <= 0) { fx('onDelayed', st, d.owner, d); return; }
      }
      still.push(d);
    });
    st.delayed = still;
  }
  function runDelayed(st, ownerIdx) {
    st.delayed = st.delayed || [];
    // R22: only due immediates run at next Main. Scheduled countdowns
    // (data.wait) stay queued until tickDelayed fires them.
    let due = st.delayed.filter(d => d.owner === ownerIdx && !(d.data && d.data.wait));
    let lifeResolved = false;
    due = due.filter(d => {
      if (d.data && d.data.isLife) {
        if (lifeResolved) return false;
        lifeResolved = true;
      }
      return true;
    });
    st.delayed = st.delayed.filter(d => !due.includes(d));
    due.forEach(d => fx('onDelayed', st, ownerIdx, d));
    if (!due.length) return;
    if (st.delayed.length || due.some(d => d.unresolved)) {
      due.forEach(d => { if (d.unresolved) st.pendingOps.push({ kind: 'manual', text: d.desc, src: null }); });
    }
  }

  // ---------- Magic ----------
  function magicLimitOk(st, p, subtype) {
    return !(p.magicUsed[subtype] >= 1); // each type 1/turn (v1: per player turn)
  }
  function checkModTarget(card, target) {
      if (!target) return { ok: false, error: 'ต้องเลือก Avatar ฝ่ายเราสวมใส่' };
      const need = (card.db.mainEffect || '').match(/สวมใส่ได้เฉพาะ\s*([^\n]+)/);
      let needOk = true;
      if (need) {
        const raw = need[1].trim();
        const re = /"([^"]+)"/g;
        const quoted = [];
        let m;
        while ((m = re.exec(raw))) quoted.push(m[1].replace(/\s/g, ''));
        
        const targetName = (target.db.name || '').replace(/\s/g, '');
        
        if (quoted.length > 0) {
          needOk = quoted.some(n => n && targetName.includes(n));
        } else {
          const exactNeed = raw.replace(/\s/g, '');
          needOk = (targetName === exactNeed);
        }
      }
      if (need && !needOk) return { ok: false, error: 'สวมใส่ไม่ตรงเงื่อนไข' };
      return { ok: true };
    }
  function playMagic(st, pIdx, handUid, opts) {
    opts = opts || {};
    const p = st.players[pIdx];
    if (isGameOver(st)) return { ok: false, error: 'เกมจบแล้ว' };
    const blk = blockIfPending(st);
    if (blk) return blk;
    const card = p.hand.find(c => c.uid === handUid);
    if (!card || card.db.type !== 'Magic') return { ok: false, error: 'ไม่ใช่ Magic' };
    const sub = card.db.subtype || 'Normal';
    const asReact = sub !== 'React' && fx('usableAsReact', st, pIdx, card) === true;
    if ((st.phase !== 'main' || st.cur !== pIdx) && sub !== 'React' && !asReact && !opts.viaEffect) return { ok: false, error: sub + ' ใช้ได้เฉพาะ Main Phase ของตัวเอง (React ได้ทุกช่วง)' };
    const ignoreLimit = fx('ignoreMagicLimit', st, pIdx, card) === true;
    const countAs = asReact ? 'React' : sub;
    if (countAs === 'React' && st.noReactMagic && st.noReactMagic.owner === pIdx && (st.turn * 2 + st.cur) <= st.noReactMagic.until) {
      return { ok: false, error: 'ถูกห้ามใช้ React Magic อยู่' };
    }
    if (!ignoreLimit && !magicLimitOk(st, p, countAs)) return { ok: false, error: countAs + ' ใช้ไปแล้ว 1 ครั้งในเทิร์นนี้' };
    // ---- mutation-free validation phase ----
    // 1) Modification target + equipment restrictions first (preserve card/payment/allowance on fail)
    let modTarget = null;
    if (sub === 'Modification') {
      modTarget = (opts.targetUid !== undefined) ? p.avatar.find(a => a.uid === opts.targetUid) : null;
      const tc = checkModTarget(card, modTarget);
      if (!tc.ok) return tc;
      if (modTarget && fx('untargetable', st, pIdx, modTarget) === true) return { ok: false, error: 'เป้าหมายสวมใส่ไม่ได้' };
    }
    // 2) R01 (Rulebook p.4/p.13): Magic has NO summon Cost field. cards.json `cost`
    // on Magic rows is NOT a GEM payment — only the cost written before ':' in
    // the card text (exposed via magicExtraCost, e.g. SD01-018 discard 1) may be
    // charged. SD01-020 Land and friends play with no discard.
    // Any stray payUids sent by old UI/tests are rejected to avoid silent double-pay.
    const rawPay = (opts.payUids || []).slice();
    if (rawPay.length) return { ok: false, error: 'เวทมนตร์ใบนี้ไม่ต้องทิ้งจ่าย GEM (จ่ายเฉพาะ cost ในข้อความ)' };
    if (rawPay.indexOf(handUid) >= 0) return { ok: false, error: 'ใช้การ์ดตัวเองจ่ายไม่ได้' };
    // 3) Additional-cost picks validation (e.g. SD01-018 discard) before commitment
    let extraCost = null;
    try { extraCost = fx('magicExtraCost', st, pIdx, card); } catch (e) { extraCost = null; }
    if (extraCost && Object.keys(extraCost).length) {
      let v = null;
      try { v = fx('validateAbCost', st, pIdx, card, extraCost, opts); } catch (e) { v = null; }
      // fallback: if hook missing, try generic validation via onMagicResolve cost? fail open for legacy cards without hook
      if (v && !v.ok) return v;
      if (v && v.ok === false) return v;
    }
    // ---- commitment phase (consume each resource exactly once) ----
    p.magicUsed[countAs] = (p.magicUsed[countAs] || 0) + 1;
    // additional-cost commitment (mark as pre-paid so onMagicResolve does not charge twice)
    if (extraCost && Object.keys(extraCost).length) {
      let cmt = null;
      try { cmt = fx('commitAbCost', st, pIdx, card, extraCost, opts); } catch (e) { cmt = null; }
      if (cmt && !cmt.ok) {
        // atomic: extra-cost failed before any move — restore allowance.
        p.magicUsed[countAs] = Math.max(0, (p.magicUsed[countAs] || 1) - 1);
        return cmt;
      }
      card._extraPaid = true;
    }
    // remove card from hand only after successful payment
    const hi = p.hand.indexOf(card);
    if (hi < 0) {
      p.magicUsed[countAs] = Math.max(0, (p.magicUsed[countAs] || 1) - 1);
      return { ok: false, error: 'การ์ดไม่อยู่บนมือแล้ว (stale)' };
    }
    p.hand.splice(hi, 1);
    if (sub === 'Normal' || sub === 'React') {
      p.magic.push(card);
      card.controller = pIdx;
      const ev = { type: 'magicPlayed', source: card, owner: pIdx, cancelled: false, isReact: sub === 'React' || asReact };
      const r = fx('onEvent', st, ev);
      const hasPending = (st.pendingResponses || []).some(q => q.evId === ev.id) || r === 'queued' || st._pendingEv === ev;
      if (hasPending) {
        st._frames = st._frames || [];
        st._frames.push({ evId: ev.id, kind: 'magicResolve', cardUid: card.uid, owner: pIdx, sub });
        st._pendingEv = ev;
        slog(st, 'P' + (pIdx + 1) + ' ใช้ ' + sub + ' ' + card.db.name + ' (รอสวน)');
        return { ok: true, card, pending: true, evId: ev.id };
      }
      if (!ev.cancelled) {
        const handled = fx('onMagicResolve', st, pIdx, card);
        if (handled !== true) {
          // fallback simple templates (draw only — destroy goes through unified path)
          const d = parseDraw(card.db.mainEffect);
          if (d) for (let i = 0; i < d; i++) { if (isGameOver(st)) break; drawOne(st, p); }
          const k = parseDestroyAvatar(card.db.mainEffect);
          if (k) { const f = st.players[1 - pIdx]; for (let i = 0; i < k && f.avatar.length; i++) { f.avatar.sort((a, b) => effPower(b, 0, st) - effPower(a, 0, st)); const x = f.avatar[0]; if (!x) break; destroyInst(st, x, card.db.name); if (isGameOver(st)) break; } }
          if (!d && !k) st.pendingOps.push({ kind: 'manual', text: 'Magic ' + card.db.name + ' (บังคับเองตาม text)', src: card });
        }
      } else {
        slog(st, card.db.name + ' ถูกยกเลิกผล');
      }
      const mi = p.magic.indexOf(card);
      if (mi >= 0) p.magic.splice(mi, 1);
      p.hell.push(card);
      slog(st, 'P' + (pIdx + 1) + ' ใช้ ' + sub + ' ' + card.db.name);
    } else if (sub === 'Modification') {
      // already validated; attach (centralized movement)
      attachEquip(st, card, modTarget);
      slog(st, 'P' + (pIdx + 1) + ' สวมใส่ ' + card.db.name + ' -> ' + modTarget.db.name);
    } else if (sub === 'Land') {
      if (st.land) { const old = st.land; st.players[old.owner].hell.push(old.card); slog(st, 'Land เก่า ' + old.card.db.name + ' ถูกส่งลงนรก'); }
      st.land = { card, owner: pIdx };
      slog(st, 'P' + (pIdx + 1) + ' วาง Land ' + card.db.name);
    }
    return { ok: true, card };
  }
  // Complete a suspended Normal/React magic after responses resolve (called by effects.js)
  function completeMagicResolve(st, frame) {
    const p = st.players[frame.owner];
    const card = p.magic.find(c => c.uid === frame.cardUid) || p.hell.find(c => c.uid === frame.cardUid) || findInAll(st, frame.cardUid);
    const ev = findPendingEv(st, frame.evId) || st._pendingEv;
    // if card already left magic (should not), try to locate
    if (!card) return false;
    const cancelled = !!(ev && ev.cancelled);
    if (!cancelled) {
      const handled = fx('onMagicResolve', st, frame.owner, card);
      if (handled !== true) {
        const d = parseDraw(card.db.mainEffect);
        if (d) for (let i = 0; i < d; i++) { if (isGameOver(st)) break; drawOne(st, p); }
        const k = parseDestroyAvatar(card.db.mainEffect);
        if (k) { const f = st.players[1 - frame.owner]; for (let i = 0; i < k && f.avatar.length; i++) { f.avatar.sort((a, b) => effPower(b, 0, st) - effPower(a, 0, st)); const x = f.avatar[0]; if (!x) break; destroyInst(st, x, card.db.name); if (isGameOver(st)) break; } }
        if (!d && !k) st.pendingOps.push({ kind: 'manual', text: 'Magic ' + card.db.name + ' (บังคับเองตาม text)', src: card });
      }
    } else {
      slog(st, card.db.name + ' ถูกยกเลิกผล');
    }
    const mi = p.magic.indexOf(card);
    if (mi >= 0) p.magic.splice(mi, 1);
    if (p.hell.indexOf(card) < 0) p.hell.push(card);
    slog(st, 'P' + (frame.owner + 1) + ' ใช้ ' + (frame.sub || 'Normal') + ' ' + card.db.name);
    return true;
  }
  function findInAll(st, uid) {
    for (const pl of st.players) {
      const zones = [pl.avatar, pl.magic, pl.construct, pl.hand, pl.hell, pl.dark, pl.main];
      for (const z of zones) { const c = z.find(x => x.uid === uid); if (c) return c; }
    }
    if (st.land && st.land.card.uid === uid) return st.land.card;
    return null;
  }
  function findPendingEv(st, evId) {
    if (st._pendingEv && st._pendingEv.id === evId) return st._pendingEv;
    if (st._evStack) {
      const f = st._evStack.find(e => e.id === evId);
      if (f) return f;
    }
    return null;
  }
  function completeSummonJuti(st, frame) {
    const card = findInAll(st, frame.cardUid);
    if (!card) return false;
    // R25: destroy != negate. A summoned card destroyed by a React (อุบัติเหตุ)
    // does NOT cancel its already-triggered จุติ — resolve from the event snapshot.
    const handled = fx('onSummoned', st, card, frame.byCost === false ? { byCost: false, juti: !!frame.juti } : { byCost: true });
    if (handled === true) return true;
    if (frame.byCost === false && !frame.juti) return true;
    const ops = [];
    if (hasKw(card, 'จุติ')) {
      const d = parseDraw(card.db.mainEffect);
      if (d) ops.push({ kind: 'draw', n: d, src: card, owner: frame.owner });
      parsePowerMods(card.db.mainEffect).forEach(m => ops.push({ kind: 'selfBuff', v: m.sign === '+' ? m.v : -m.v, src: card }));
      const k = parseDestroyAvatar(card.db.mainEffect);
      if (k) ops.push({ kind: 'destroyFoeAvatar', n: k, src: card, owner: frame.owner });
      if (!ops.length) st.pendingOps.push({ kind: 'manual', text: 'จุติ ' + card.db.name + ' (เอฟเฟคซับซ้อน - ผู้เล่นบังคับเองตาม text)', src: card });
    }
    resolveOps(st, ops);
    return true;
  }

  // ---------- Battle ----------
  function canAttackLife(st, atk, foeP) {
    if (foeP.avatar.length === 0) return true;
    if (hasKwEff(atk, 'เตะไข่')) return true;
    return false;
  }
  function cantTarget(st, atkOwnerIdx, def) {
    const r = fx('untargetable', st, atkOwnerIdx, def);
    return r === true;
  }
  function declareAttack(st, pIdx, atkUid, supportUids, target) {
    // target: {kind:'avatar', uid} | {kind:'construct', uid} | {kind:'life'}
    // R12: attacks only in owner's Battle Phase, once-resolving via attack identity.
    if (isGameOver(st)) return { ok: false, error: 'เกมจบแล้ว' };
    if (st.phase !== 'battle') return { ok: false, error: 'โจมตีได้เฉพาะ Battle Phase' };
    if (st.cur !== pIdx) return { ok: false, error: 'ไม่ใช่เทิร์นของคุณ' };
    const blk = blockIfPending(st);
    if (blk) return blk;
    const p = st.players[pIdx], f = st.players[1 - pIdx];
    const atk = p.avatar.find(a => a.uid === atkUid);
    if (!atk || atk.tapped) return { ok: false, error: 'Avatar โจมตีไม่ได้ (tap แล้ว/ไม่อยู่)' };
    // R18: silence gates abilities, not the basic attack action itself.
    const ban = fx('attackBan', st, pIdx, atk, target);
    if (ban) return { ok: false, error: atk.db.name + ' โจมตีไม่ได้ (' + ban + ')' };
    if (!target || !target.kind) return { ok: false, error: 'ไม่มีเป้าหมาย' };
    if (target.kind === 'avatar') {
      const d = f.avatar.find(x => x.uid === target.uid);
      if (!d) return { ok: false, error: 'เป้าหาย -> การโจมตีสิ้นสุด' };
      if (cantTarget(st, pIdx, d)) return { ok: false, error: d.db.name + ' เลือกเป็นเป้าไม่ได้' };
    } else if (target.kind === 'construct') {
      if (!f.construct.find(x => x.uid === target.uid)) return { ok: false, error: 'เป้าหาย -> การโจมตีสิ้นสุด' };
    } else if (target.kind !== 'life') {
      return { ok: false, error: 'เป้าหมายไม่ถูกต้อง' };
    }
    atk.tapped = true;
    let extra = 0;
    let backstabKill = false;
    const seenSup = {};
    (supportUids || []).forEach(u => {
      if (seenSup[u]) return;
      seenSup[u] = true;
      if (u === atkUid) return;
      const s = p.avatar.find(a => a.uid === u);
      // R18: silenced supporters cannot lend power; attacker silence does NOT block.
      if (s && !s.tapped && !silenced(s, st)) {
        const isSamakkee = hasKwEff(s, 'สามัคคี');
        const isBackstab = hasKwEff(s, 'แทงหลัง');
        // R17: no blanket same-color rule on สามัคคี — per-card text only.
        if (isSamakkee || isBackstab) {
          s.tapped = true;
          extra += basePower(s) + equipBonus(s, st) + buffSum(s) + (fx('powerSelf', s, st) || 0) + (fx('powerAura', s, st) || 0) + (isBackstab ? 1 : 0);
          // R15: different-color แทงหลัง supporter kills the attacker after the attack.
          if (isBackstab && (s.db.color || '') !== (atk.db.color || '')) backstabKill = true;
        }
      }
    });
    // Snapshot (Layer 3): lock base+L1+L2+aura at declare; L4 (battleBuff + post-declare buffs) floats.
    const aura0 = (fx('powerAura', atk, st) || 0) + (fx('powerSelf', atk, st) || 0);
    atk.snapshot = basePower(atk) + equipBonus(atk, st) + buffSum(atk) + aura0;
    atk._buffAtDeclare = buffSum(atk);
    atk._auraAtDeclare = aura0;
    // เมื่อโจมตี buffs (L4) — only as fallback when no scripted onAttack exists (prevents double +2 for SD01-002)
    let l4 = 0;
    let hasScriptedAttack = false;
    try { hasScriptedAttack = fx('hasOnAttackScript', st, atk) === true; } catch (e) { hasScriptedAttack = false; }
    if (!hasScriptedAttack && /เมื่อ[^\n]*โจมตี/.test(atk.db.mainEffect || '')) {
      parsePowerMods(atk.db.mainEffect).forEach(m => { l4 += (m.sign === '+' ? m.v : -m.v); });
    }
    atk.battleBuff = extra + l4;
    atk._backstabKill = backstabKill;
    // R12 identity: each declare gets one id; resolve consumes it exactly once.
    st._attackSeq = (st._attackSeq || 0) + 1;
    atk._attackId = st._attackSeq;
    let pow = atk.snapshot + atk.battleBuff;
    if (pow < 0) pow = 0;
    slog(st, 'P' + (pIdx + 1) + ' ' + atk.db.name + ' โจมตี (snapshot ' + atk.snapshot + ' + buff ' + atk.battleBuff + ' = ' + pow + ')');
    st.battleCount++;
    // onAttack triggers (e.g. SD01-002 +2): scripted buffs applied after snapshot must still affect current attack
    const buffBefore = buffSum(atk);
    fx('onAttack', st, atk, { power: pow, target });
    const buffAfter = buffSum(atk);
    if (buffAfter !== buffBefore) {
      const delta = buffAfter - buffBefore;
      pow += delta;
      slog(st, atk.db.name + ' ทริกเกอร์โจมตี +' + delta + ' (power ' + pow + ')');
    }
    (atk.equipped || []).slice().forEach(e => fx('onWearerAttack', st, e, atk));
    if (target.kind === 'avatar') {
      const df = f.avatar.find(x => x.uid === target.uid);
      if (df) fx('onTargeted', st, df, { by: atk });
    }
    // response window: โล่มนุษย์ handled by UI/bot, other Reacts (งานจับมือ) via event
    const ev = { type: 'attackTargeted', atk, target, power: pow, owner: pIdx, negated: false };
    const r = fx('onEvent', st, ev);
    const hasPending = (st.pendingResponses || []).some(q => q.evId === ev.id) || r === 'queued' || st._pendingEv === ev;
    if (hasPending) {
      st._frames = st._frames || [];
      st._frames.push({ evId: ev.id, kind: 'attackResolve', atkUid: atk.uid, target, power: pow, owner: pIdx });
      st._pendingEv = ev;
      return { ok: true, atk, power: pow, target, pending: true, evId: ev.id };
    }
    if (ev.negated) return { ok: true, atk, power: pow, target, negated: true };
    return { ok: true, atk, power: pow, target };
  }
  // R16: โล่มนุษย์ (bodyguard redirect) is NOT คู่หู (pairing status, p.20).
  // redirectPartner only answers โล่มนุษย์; คู่หู pairing lives elsewhere.
  function redirectPartner(st, fIdx, newUid) {
    const f = st.players[fIdx];
    const r = f.avatar.find(a => a.uid === newUid);
    if (!r || r.tapped || !hasKwEff(r, 'โล่มนุษย์')) return { ok: false, error: 'โล่มนุษย์ใช้ไม่ได้' };
    r.tapped = true;
    return { ok: true, redirectTo: r };
  }
  function cleanupAttacker(atk) {
    if (!atk) return;
    atk.battleBuff = 0; atk.snapshot = null;
    delete atk._buffAtDeclare; delete atk._auraAtDeclare;
  }
  function resolveBattle(st, pIdx, atk, target, powerArg) {
    if (isGameOver(st)) return { ok: false, error: 'เกมจบแล้ว' };
    const blk = blockIfPending(st);
    if (blk) return blk;
    if (!atk) return { ok: false, error: 'ไม่มีผู้โจมตี' };
    // R12: one declare resolves exactly once — replayed/dup resolves rejected.
    if (atk._attackId === undefined || atk._attackId === null) return { ok: false, error: 'การโจมตีนี้ resolve ไปแล้วหรือไม่เคย declare' };
    const p = st.players[pIdx], f = st.players[1 - pIdx];
    if (atk.controller !== pIdx || p.avatar.indexOf(atk) < 0) { cleanupAttacker(atk); delete atk._attackId; return { ok: false, error: 'ผู้โจมตีไม่อยู่บนสนามแล้ว' }; }

    // R13: snapshot (L3) frozen at declare; only post-declare L4 deltas float.
    const curAura = (fx('powerAura', atk, st) || 0) + (fx('powerSelf', atk, st) || 0);
    const baseAtDeclare = (atk.snapshot !== null && atk.snapshot !== undefined) ? atk.snapshot : effPower(atk, 0, st);
    const buffDelta = buffSum(atk) - (atk._buffAtDeclare || 0);
    const auraDelta = curAura - (atk._auraAtDeclare || 0);
    let power = baseAtDeclare + (atk.battleBuff || 0) + buffDelta + auraDelta;
    if (power < 0) power = 0;
    
    // R15/R12: single-exit cleanup — battleBuff never leaks past LIFE/Construct/avatar,
    // and a different-color แทงหลัง supporter kills the attacker afterwards.
    try {
    if (target.kind === 'life') {
      if (!canAttackLife(st, atk, f) && !(target.forced)) return { ok: false, error: 'ตี LIFE ไม่ได้ (ยังมี Avatar)' };
      if (power <= 0) { slog(st, 'Power 0 ตี LIFE ได้แต่ไม่หงาย'); return { ok: true, flipped: false }; }
      const closed = f.life.find(l => !l.open);
      if (!closed) { // สาหัสแล้วโดนดาเมจสำเร็จ -> แพ้
        st.winner = pIdx; st.winReason = 'ทำดาเมจ LIFE สำเร็จขณะสาหัส';
        slog(st, 'P' + (pIdx + 1) + ' WIN (สาหัส)');
        return { ok: true, flipped: true, win: true };
      }
      // R21: attack-caused flips queue LIFE; effect flips do not.
      flipLifeAt(st, f.idx, 1, true, 'attack');
      return { ok: true, flipped: true, lifeCard: closed };
    }
    if (target.kind === 'construct') {
      const c = f.construct.find(x => x.uid === target.uid);
      if (!c) return { ok: false, error: 'เป้าหาย -> การโจมตีสิ้นสุด' };
      const cp = effPower(c, 0, st);
      // R26: construct destruction goes through the unified path (triggers/replacement).
      if (power > cp) { destroyInst(st, c, 'ต่อสู้ (Construct)'); slog(st, 'ทำลาย Construct ' + c.db.name); return { ok: true, destroyed: true }; }
      slog(st, 'ตี Construct ไม่เข้า (ไม่ตายทั้งคู่)');
      return { ok: true, destroyed: false };
    }
    // vs avatar = ต่อสู้
    const d = f.avatar.find(x => x.uid === target.uid);
    if (!d) return { ok: false, error: 'เป้าหาย -> การโจมตีสิ้นสุด' };
    if (cantTarget(st, pIdx, d)) return { ok: false, error: d.db.name + ' เลือกเป็นเป้าไม่ได้' };
    fx('onBattle', st, atk, d);
    const dp = effPower(d, 0, st);
    // เมื่อต่อสู้ buffs (L4 ฝั่งป้องกันแบบย่อ)
    let ap = power, dp2 = dp;
    if (/เมื่อ[^\n]*ต่อสู้/.test(atk.db.mainEffect || '')) { /* รวมใน battleBuff แล้วบางส่วน */ }
    if (ap === 0 && dp2 === 0) { slog(st, '0 vs 0 ไม่มีอะไรเกิดขึ้น'); return { ok: true }; }
    const atkLuk = hasKwEff(atk, 'ลูกฮึด'), defLuk = hasKwEff(d, 'ลูกฮึด');
    if (ap === dp2) {
      // R14: 4-way equal table — defender-only ลูกฮึด kills the attacker.
      if (atkLuk && !defLuk) { if (destroyInst(st, d, 'ต่อสู้เสมอ+ลูกฮึด')) fx('onKill', st, atk, d); slog(st, 'เสมอแต่ลูกฮึด ' + atk.db.name + ' ชนะ'); }
      else if (!atkLuk && defLuk) { if (destroyInst(st, atk, 'ต่อสู้เสมอ+ลูกฮึด (กัน)')) fx('onKill', st, d, atk); slog(st, 'เสมอแต่ลูกฮึด ' + d.db.name + ' (กัน) ชนะ'); }
      else if (atkLuk && defLuk) { destroyInst(st, atk, 'ต่อสู้เสมอ'); destroyInst(st, d, 'ต่อสู้เสมอ'); slog(st, 'เสมอ ลูกฮึดทั้งคู่ ตายคู่'); }
      else { destroyInst(st, atk, 'ต่อสู้เสมอ'); destroyInst(st, d, 'ต่อสู้เสมอ'); slog(st, 'เสมอ ตายคู่'); }
    } else if (ap > dp2) { if (destroyInst(st, d, 'ต่อสู้')) fx('onKill', st, atk, d); slog(st, atk.db.name + '(' + ap + ') ชนะ ' + d.db.name + '(' + dp2 + ')'); }
    else { destroyInst(st, atk, 'ต่อสู้'); slog(st, atk.db.name + '(' + ap + ') แพ้ ' + d.db.name + '(' + dp2 + ')'); }
    return { ok: true };
    } finally {
      const kill = !!atk._backstabKill;
      delete atk._attackId;
      cleanupAttacker(atk);
      if (kill && onField(st, atk)) {
        destroyInst(st, atk, 'แทงหลัง (สีต่าง)');
        slog(st, atk.db.name + ' ถูกแทงหลังทำลายหลังโจมตี (สี supporter ต่าง)');
      }
      delete atk._backstabKill;
    }
  }

  // ---------- phases ----------
  function enterMain(st) {
    runDelayed(st, st.cur);
    fx('onMainStart', st, st.cur);
  }
  // T1 first player: Main -> End directly (no Battle Phase)
  function skipBattle(st) {
    if (isGameOver(st)) return st.phase;
    const blk = blockIfPending(st);
    if (blk) return st.phase;
    fx('onEndStart', st, st.cur);
    st.phase = 'end';
    tickDelayed(st);
    return st.phase;
  }
  function nextPhase(st) {
    if (isGameOver(st)) return st.phase;
    // R08: no phase jumps while responses/frames/discards are pending.
    const blk = blockIfPending(st);
    if (blk) return st.phase;
    const order = ['draw', 'main', 'battle', 'end'];
    const i = order.indexOf(st.phase);
    if (st.phase === 'end') {
      // R10: hand max is a choice — queue it and stay in end until resolved.
      const p = me(st);
      if (p.hand.length > 7) {
        pendingDiscard(st, st.cur, p.hand.length - 7);
        return st.phase;
      }
      for (const pl of st.players) {
        for (const a of pl.avatar) a.buffs = (a.buffs || []).filter(b => b.until !== 'endTurn');
        for (const c of pl.construct) c.buffs = (c.buffs || []).filter(b => b.until !== 'endTurn');
      }
      p.magicUsed = {};
      // reset อีกฝ่ายด้วย เพราะ React ที่ใช้ในเทิร์นนี้ไม่ควรค้างไปเทิร์นหน้า
      foe(st).magicUsed = {};
      st.cur = 1 - st.cur;
      if (st.cur === st._starter) st.turn++;
      st.phase = 'draw';
      if (!(st.turn === 1 && st.cur === st._starter)) { /* draw happens on entering */ }
      doDrawPhase(st);
    } else {
      // R07: starter skips Battle on turn 1 — enforced here, not just in UI buttons.
      if (st.phase === 'main' && st.turn === 1 && st.cur === st._starter) {
        return skipBattle(st);
      }
      if (st.phase === 'battle') fx('onEndStart', st, st.cur);
      st.phase = order[i + 1];
      if (st.phase === 'draw') doDrawPhase(st);
      if (st.phase === 'main') enterMain(st);
      if (st.phase === 'battle') fx('onBattleStart', st, st.cur);
      tickDelayed(st);
    }
    return st.phase;
  }

  return {
    isGameOver, checkDeckZero,
    setSeed, rng, newGame, submitRPS, mulligan, validateDecks, isBanned, doDrawPhase, drawOne, nextPhase, enterMain, skipBattle,
    pendingDiscard, resolveDiscard,
    summonAvatar, buildConstruct, playMagic, checkPay, payCost, gemLimitFor, validateGem,
    declareAttack, redirectPartner, resolveBattle, canAttackLife, cantTarget,
    destroyInst, exileInst, bounceInst, deckReturnInst, summonFromZone,
    attachEquip, detachEquipCentral, equippedToAvatarZone, gainControl, flipLifeAt, winGame,
    addDelayed, tickDelayed, runDelayed, findAvatar, onField, silenced, responsePending, blockIfPending,
    completeMagicResolve, completeSummonJuti, avatarLimitOk, magicLimitOk, checkModTarget,
    effPower, equipBonus, hasKw, hasKwEff, parseDraw, parsePowerMods, me, foe, slog, shuffle,
    removeFromZones,
    setFX,
  };
});
