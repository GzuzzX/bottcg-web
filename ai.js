/* Simple legal-move bot for Battle of Talingchan v1 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BoTBot = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function gemSum(hand) { return hand.reduce((s, c) => s + (c.db.gem || 0), 0); }
  // choose GEM payment: greedy biggest first, then validate (drop extras)
  function choosePay(E, p, cost, color, targetName) {
    if (cost <= 0) return [];
    const limOk = c => {
      if (!targetName) return true;
      const t = (c.db.mainEffect || '') + ' ' + (c.db.hashtagText || '');
      const m = /ใช้เป็น Cost .*เฉพาะ Avatar "([^"]+)"/.exec(t);
      if (!m) return true;
      return m[1].split(/หรือ|,/).some(n => (targetName || '').includes(n.trim().replace(/"/g, '')));
    };
    const cands = p.hand.filter(c => (c.db.gem || 0) > 0 && (!(c.db.gemColor) || !color || c.db.gemColor === color) && limOk(c))
      .sort((a, b) => (b.db.gem || 0) - (a.db.gem || 0));
    const pay = []; let sum = 0;
    for (const c of cands) { if (sum >= cost) break; pay.push(c); sum += c.db.gem; }
    if (sum < cost) return null;
    // trim excess: remove smallest while still sufficient AND check rule ok
    for (;;) {
      let removed = false;
      for (let i = pay.length - 1; i >= 0; i--) {
        const rest = pay.slice(0, i).concat(pay.slice(i + 1));
        const s = rest.reduce((x, c) => x + c.db.gem, 0);
        if (s >= cost) { pay.splice(i, 1); removed = true; break; }
      }
      if (!removed) break;
    }
    const chk = E.checkPay({ players: [] }, p, cost, color, pay, targetName || '');
    return chk.ok ? pay.map(c => c.uid) : null;
  }
  function magicExtraPicks(E, FX, st, pIdx, card) {
    // additional-cost picks for Magic onResolve (e.g. SD01-018 discard เทพ Avatar)
    const picks = {};
    try {
      const cost = FX && FX.magicExtraCost ? null : null;
    } catch (e) {}
    // authoritative: inspect script cost via FX if available, else fallback to text sniff
    let cost = null;
    try {
      if (FX && typeof FX.magicExtraCost === 'function') {
        // magicExtraCost is FX hook via engine? use direct script lookup through FX if exposed
        cost = null;
      }
    } catch (e) {}
    // Fallback text-based: ทิ้ง Avatar เทพ 1 ใบ
    const p = st.players[pIdx];
    if (/ทิ้ง\s*Avatar[^\n]*เทพ[^\n]*1\s*ใบ/.test(card.db.mainEffect || '')) {
      const c = p.hand.find(x => x.uid !== card.uid && x.db.type === 'Avatar' && x.db.symbol === 'เทพ');
      if (!c) return null; // cannot pay
      picks.discardUids = [c.uid];
    }
    // generic discard N (non-symbol) if script requires but text not matched above
    if (!picks.discardUids && FX && FX.autoPicksFor) {
      try {
        // try to get cost via engine hook if present
        const extra = E && E._lastMagicExtra ? null : null;
      } catch (e) {}
    }
    return picks;
  }
  function playMagicWithPay(E, FX, st, pIdx, card, extraOpts) {
    const p = st.players[pIdx];
    const pay = choosePay(E, p, card.db.cost || 0, card.db.color || '', card.db.name);
    if (pay === null) return null;
    const opts = Object.assign({}, extraOpts || {});
    opts.payUids = pay;
    // additional costs (authoritative preview via engine validation will reject if wrong)
    if (/ทิ้ง\s*Avatar[^\n]*เทพ/.test(card.db.mainEffect || '')) {
      const c = p.hand.find(x => pay.indexOf(x.uid) < 0 && x.uid !== card.uid && x.db.type === 'Avatar' && x.db.symbol === 'เทพ');
      if (!c) return null;
      opts.discardUids = [c.uid];
    } else if (/ทิ้งการ์ดบนมือ\s*(\d+)\s*ใบ/.test(card.db.mainEffect || '')) {
      const m = /ทิ้งการ์ดบนมือ\s*(\d+)\s*ใบ/.exec(card.db.mainEffect || '');
      const n = m ? +m[1] : 1;
      const cands = p.hand.filter(x => x.uid !== card.uid && pay.indexOf(x.uid) < 0).slice(0, n);
      if (cands.length < n) return null;
      opts.discardUids = cands.map(x => x.uid);
    }
    // target-name restrictions preview: Modification equip handled by caller
    const r = E.playMagic(st, pIdx, card.uid, opts);
    return r;
  }
  function botMain(E, st, pIdx, FX) {
    // stop for human decisions (AI turns pause while responses pending)
    if (st.pendingResponses && st.pendingResponses.length) return ['wait-human'];
    if (st._frames && st._frames.length) return ['wait-human'];
    const acts = [];
    const p = st.players[pIdx];
    // 1) summon best affordable avatar (max 6 per main — Avatar zone max 6)
    for (let k = 0; k < 6; k++) {
      const cands = p.hand.filter(c => c.db.type === 'Avatar' &&
        (p.avatar.length < 6) && (c.db.cost || 0) <= gemSum(p.hand));
      if (!cands.length) break;
      cands.sort((a, b) => ((b.db.power || 0) / Math.max(1, b.db.cost || 0)) - ((a.db.power || 0) / Math.max(1, a.db.cost || 0)));
      const c = cands[0];
      const pay = choosePay(E, p, c.db.cost || 0, c.db.color || '', c.db.name);
      if (!pay) break;
      const r = E.summonAvatar(st, pIdx, c.uid, pay);
      if (!r.ok) break;
      acts.push('summon ' + c.db.name);
    }
    // play Normal Magic
    const magicActs = botMagic(E, st, pIdx, FX);
    magicActs.forEach(a => acts.push(a));
    if (st.pendingResponses && st.pendingResponses.length) return acts.concat(['wait-human']);
    // play Land
    const landActs = botLand(E, st, pIdx, FX);
    landActs.forEach(a => acts.push(a));
    if (st.pendingResponses && st.pendingResponses.length) return acts.concat(['wait-human']);
    // 2) equip modification if has +power (with GEM payment)
    const mods = p.hand.filter(c => c.db.type === 'Magic' && c.db.subtype === 'Modification' && /POWER\s*\+\s*[1-9]/.test(c.db.mainEffect || ''));
    if (mods.length && p.avatar.length) {
      const tgt = p.avatar.slice().sort((a, b) => (b.db.power || 0) - (a.db.power || 0))[0];
      const r = playMagicWithPay(E, FX, st, pIdx, mods[0], { targetUid: tgt.uid });
      if (r && r.ok) acts.push('equip ' + mods[0].db.name);
    }
    // 3) build construct if affordable & slot free
    const cons = p.hand.filter(c => c.db.type === 'Construct' && p.construct.length < 3 && (c.db.cost || 0) <= gemSum(p.hand));
    if (cons.length) {
      const c = cons.sort((a, b) => (b.db.power || 0) - (a.db.power || 0))[0];
      const pay = choosePay(E, p, c.db.cost || 0, c.db.color || '', c.db.name);
      if (pay) { const r = E.buildConstruct(st, pIdx, c.uid, pay); if (r.ok) acts.push('build ' + c.db.name); }
    }
    return acts;
  }
  function botBattle(E, st, pIdx) {
    if (st.pendingResponses && st.pendingResponses.length) return ['wait-human'];
    const acts = [];
    const p = st.players[pIdx], f = st.players[1 - pIdx];
    const order = p.avatar.filter(a => !a.tapped).sort((a, b) => E.effPower(b,0,st) - E.effPower(a,0,st));
    for (const a of order) {
      const ap = E.effPower(a,0,st);
      // supporters: สามัคคี/แทงหลัง untapped others (keep 1 defender if foe has attackers? keep simple: use all weaker)
      // เก็บไว้อย่างน้อย 1 ตัวไม่ tap ถ้าฝ่ายตรงข้ามยังมี avatar
      const supps = p.avatar.filter(s => s.uid !== a.uid && !s.tapped && (E.hasKw(s, 'สามัคคี') || E.hasKw(s, 'แทงหลัง')));
      const keepDefenders = f.avatar.length > 0 ? 1 : 0;
      const usable = supps.length > keepDefenders ? supps.slice(0, supps.length - keepDefenders) : [];
      const supIds = usable.map(s => s.uid);
      let target = null;
      if (E.canAttackLife(st, a, f)) target = { kind: 'life' };
      else if (f.avatar.length) {
        const beatable = f.avatar.filter(d => ap > E.effPower(d,0,st)).sort((x, y) => E.effPower(y,0,st) - E.effPower(x,0,st));
        const victim = beatable[0] || f.avatar.slice().sort((x, y) => E.effPower(x,0,st) - E.effPower(y,0,st))[0];
        // don't suicide biggest into bigger unless no choice & losing badly? simple: skip if ap < min foe power and life not pressured
        const minFoe = Math.min.apply(null, f.avatar.map(d => E.effPower(d,0,st)));
        if (ap < minFoe && !E.canAttackLife(st, a, f)) {
          // only attack if we have lethal-ish or nothing else; skip to keep board
          continue;
        }
        target = { kind: 'avatar', uid: victim.uid };
      } else if (f.construct.length) {
        const killable = f.construct.filter(c => ap > (c.db.power || 0));
        target = killable.length ? { kind: 'construct', uid: killable[0].uid } : { kind: 'life' };
      } else target = { kind: 'life' };
      const dec = E.declareAttack(st, pIdx, a.uid, supIds, target);
      if (!dec.ok) continue;
      if (dec.negated) { acts.push('attack ' + a.db.name + '->negated'); continue; }
      // defender lomu? bot as attacker can't control; resolve directly (UI handles human lomu)
      const res = E.resolveBattle(st, pIdx, a, target, dec.power);
      acts.push('attack ' + a.db.name + '->' + target.kind);
      if (st.winner) break;
    }
    return acts;
  }
  function botDiscard(E, st, pIdx) {
    const p = st.players[pIdx];
    while (p.hand.length > 7) {
      p.hand.sort((a, b) => ((a.db.gem || 0) + (a.db.power || 0)) - ((b.db.gem || 0) + (b.db.power || 0)));
      const d = p.hand.shift(); p.hell.push(d);
    }
  }
  function botMagic(E, st, pIdx, FX) {
    const acts = [];
    const p = st.players[pIdx];
    // authoritative validation preview: only attempt if GEM + additional costs payable
    // 1) เล่นการ์ดจั่ว (Normal Magic ที่มีข้อความ "จั่ว")
    const drawCards = p.hand.filter(c => c.db.type === 'Magic' && (c.db.subtype === 'Normal' || !c.db.subtype) &&
      /จั่ว/.test(c.db.mainEffect || ''));
    for (const c of drawCards) {
      if ((p.magicUsed['Normal'] || 0) >= 1) break;
      if (st.pendingResponses && st.pendingResponses.length) break;
      const r = playMagicWithPay(E, FX, st, pIdx, c, {});
      if (r && r.ok) { acts.push('magic-draw ' + c.db.name); break; }
    }
    // 2) เล่นการ์ดทำลาย Avatar ฝั่งตรงข้าม
    const f = st.players[1 - pIdx];
    if (f.avatar.length > 0) {
      const killCards = p.hand.filter(c => c.db.type === 'Magic' && (c.db.subtype === 'Normal' || !c.db.subtype) &&
        /ทำลาย/.test(c.db.mainEffect || '') && !/จั่ว/.test(c.db.mainEffect || ''));
      for (const c of killCards) {
        if ((p.magicUsed['Normal'] || 0) >= 1) break;
        if (st.pendingResponses && st.pendingResponses.length) break;
        const r = playMagicWithPay(E, FX, st, pIdx, c, {});
        if (r && r.ok) { acts.push('magic-kill ' + c.db.name); break; }
      }
    }
    // 3) เล่นการ์ด buff (Normal Magic ที่มี POWER +)
    if (p.avatar.length > 0) {
      const buffCards = p.hand.filter(c => c.db.type === 'Magic' && (c.db.subtype === 'Normal' || !c.db.subtype) &&
        /POWER\s*\+/.test(c.db.mainEffect || '') && !/จั่ว|ทำลาย/.test(c.db.mainEffect || ''));
      for (const c of buffCards) {
        if ((p.magicUsed['Normal'] || 0) >= 1) break;
        if (st.pendingResponses && st.pendingResponses.length) break;
        const r = playMagicWithPay(E, FX, st, pIdx, c, {});
        if (r && r.ok) { acts.push('magic-buff ' + c.db.name); break; }
      }
    }
    return acts;
  }
  function botLand(E, st, pIdx, FX) {
    const p = st.players[pIdx];
    const lands = p.hand.filter(c => c.db.type === 'Magic' && c.db.subtype === 'Land');
    if (!lands.length) return [];
    if ((p.magicUsed['Land'] || 0) >= 1) return [];
    const c = lands[0];
    const r = playMagicWithPay(E, FX, st, pIdx, c, {});
    if (r && r.ok) return ['land ' + c.db.name];
    return [];
  }
  // use safe activated abilities (draw / search-to-hand / self buff / scry)
  function botAbilities(E, FX, st, pIdx) {
    if (!FX) return [];
    const acts = [];
    const p = st.players[pIdx];
    const insts = p.avatar.concat(p.hand);
    for (const inst of insts) {
      if (st.winner) break;
      let abs = [];
      try { abs = FX.listActivated(st, pIdx, inst); } catch (e) { continue; }
      for (const ab of abs) {
        const ops = ab.choose ? ((ab.choose.find(c => c.default) || ab.choose[0]).ops || []) : (ab.ops || []);
        const safeOps = ['draw', 'search', 'buffSelf', 'buffPermSelf', 'scry'];
        if (!ops.length || !ops.every(o => safeOps.indexOf(o.op) >= 0)) continue;
        if (ops.some(o => o.op === 'search' && o.to !== 'hand')) continue;
        const cost = ab.cost || {};
        if (cost.sacrificeMyAvatar || cost.destroyEquipped || cost.exileSelf || cost.exileBoard || cost.tapSelf) continue;
        if (cost.discard && p.hand.length <= cost.discard + 2) continue;
        try {
          const picks = FX.autoPicksFor(st, pIdx, ab);
          const r = FX.execActivated(st, pIdx, inst.uid, ab.id, picks);
          if (r.ok) acts.push('ability ' + inst.db.name);
        } catch (e) { /* skip */ }
      }
    }
    return acts;
  }
  return { choosePay, botMain, botBattle, botDiscard, botAbilities, botMagic, botLand, playMagicWithPay, magicExtraPicks };
});
