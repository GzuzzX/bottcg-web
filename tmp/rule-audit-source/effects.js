/* Battle of Talingchan - Effect Executor v1
 * Runs card-scripts.js abilities: triggers, costs, ops, responses.
 * Sync design: caller supplies picks {targetUid(s), scry, hostUid, ...}.
 * autoPick() provides bot-default choices. UI gathers picks via modals first.
 * Node + browser compatible.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BoTEffects = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  let E = null;
  let humanSides = []; // player idx controlled by human (UI sets); their responses queue instead of auto
  function setHumanSides(arr) { humanSides = arr || []; }
  function install(Eng) {
    E = Eng;
    Eng.setFX({
      onSummoned, onDestroyed, onEquipped, onEquipHell, onPaidAsCost, onBuilt,
      onMagicResolve, onEvent, onMainStart, onEndStart, onDrawEnd, onDelayed, onLifeFlipped,
      onAttack, onKill, onBattle, onTargeted, onWearerAttack, onBattleStart, ignoreMagicLimit, usableAsReact,
      powerAura, powerSelf, equipBonusExtra, equipBonusOverride, untargetable, gemLimitFor,
      equipGrants, costBanHit, attackBan, summonBan, setCardDB, destroyProtected,
      magicExtraCost, validateAbCost, commitAbCost, hasOnAttackScript,
      validateReact, commitReactGem,
    });
  }
  function hasOnAttackScript(st, atk) {
    const sc = scriptOf(atk);
    return !!((sc && sc.abilities || []).some(a => (a.kind === 'triggered' && a.trigger === 'onAttack') || (a.kind === 'response' && a.responseTo === 'battle')));
  }
  function magicExtraCost(st, pIdx, card) {
    const sc = scriptOf(card);
    if (!sc) return null;
    const ab = (sc.abilities || []).find(a => a.kind === 'triggered' && a.trigger === 'onResolve');
    return (ab && ab.cost) || null;
  }
  function validateAbCost(st, meIdx, src, cost, picks) {
    return validateCostAb(st, meIdx, src, cost, picks);
  }
  function commitAbCost(st, meIdx, src, cost, picks) {
    const v = validateCostAb(st, meIdx, src, cost, picks);
    if (!v.ok) return v;
    return commitCostAb(st, meIdx, src, cost, picks, v);
  }
  function onDrawEnd(st, cur) {
    eachBoard(st, (oi, c) => runTriggered(st, oi, c, 'drawEnd', {}));
    return true;
  }
  function attackBan(st, pIdx, atk, target) {
    const sc = scriptOf(atk);
    const bans = (sc && sc.attackBanSelf) || [];
    for (const b of bans) {
      if (b === 'all') return 'เอฟเฟคห้ามโจมตี';
      if (b === 'life' && target.kind === 'life') return 'เอฟเฟคห้ามตี LIFE';
    }
    return null;
  }
  function costBanHit(st, db, ownerIdx) {
    const bans = (st && st.costBan) || [];
    return bans.some(b => b.owner === ownerIdx && (b.names || []).some(n => (db.name || '').includes(n)));
  }
  function SCRIPTS() {
    if (typeof window !== 'undefined' && window.BoTCardScripts) return window.BoTCardScripts;
    if (typeof global !== 'undefined' && global.BoTCardScripts) return global.BoTCardScripts;
    return {};
  }
  function scriptOf(inst) { return SCRIPTS()[inst.db.print] || null; }
  function turnKey(st) { return st.turn * 2 + st.cur; }

  // ---------- target filtering ----------
  // spec: {side:'mine'|'foe'|'either', zone:'avatar'|'construct'|'magic'|'any'|'equipped',
  //  type, nameContains, costMax, costMin, gemMin, symbol, notOnly, equippedWith, excludeUid:[], onlyUid}
  function listTargets(st, meIdx, spec) {
    spec = spec || {};
    const out = [];
    const sides = spec.side === 'mine' ? [meIdx] : spec.side === 'foe' ? [1 - meIdx] : [meIdx, 1 - meIdx];
    sides.forEach(si => {
      const p = st.players[si];
      const zones = [];
      if (!spec.zone || spec.zone === 'avatar' || spec.zone === 'any') zones.push(['avatar', p.avatar]);
      if (spec.zone === 'construct' || spec.zone === 'any') zones.push(['construct', p.construct]);
      if (spec.zone === 'magic' || spec.zone === 'any') zones.push(['magic', p.magic]);
      zones.forEach(z => z[1].forEach(c => {
        if (spec.onlyUid && c.uid !== spec.onlyUid) return;
        if ((spec.excludeUid || []).indexOf(c.uid) >= 0) return;
        if (spec.type && c.db.type !== spec.type) return;
        if (spec.nameContains && !((c.db.name || '').includes(spec.nameContains) || (c.renamedTo || '').includes(spec.nameContains))) return;
        if (spec.excludeName && ((c.db.name || '').includes(spec.excludeName) || (c.renamedTo || '').includes(spec.excludeName))) return;
        if (spec.costMax !== undefined && (c.db.cost || 0) > spec.costMax) return;
        if (spec.costMin !== undefined && (c.db.cost || 0) < spec.costMin) return;
        if (spec.gemMin !== undefined && (c.db.gem || 0) < spec.gemMin) return;
        if (spec.symbol && c.db.symbol !== spec.symbol && c.resymbolTo !== spec.symbol) return;
        if (spec.notOnly && c.db.ex && /only/i.test(c.db.ex)) return;
        if (spec.equippedWith && !(c.equipped || []).some(e => (e.db.name || '').includes(spec.equippedWith))) return;
        out.push(c);
      }));
    });
    return out;
  }
  function zoneSearch(st, meIdx, where, filter, n) {
    // where: 'deckMine'|'hellMine'|'hellFoe'|'darkMine'|'deckFoe'
    let pile;
    if (where === 'deckMine') pile = st.players[meIdx].main;
    else if (where === 'hellMine') pile = st.players[meIdx].hell;
    else if (where === 'hellFoe') pile = st.players[1 - meIdx].hell;
    else if (where === 'darkMine') pile = st.players[meIdx].dark;
    else if (where === 'deckFoe') pile = st.players[1 - meIdx].main;
    else if (where === 'handMine') pile = st.players[meIdx].hand;
    else return [];
    filter = filter || {};
    const found = pile.filter(c => {
      if (filter.type && c.db.type !== filter.type) return false;
      if (filter.subtype && c.db.subtype !== filter.subtype) return false;
      if (filter.nameContains && !((c.db.name || '').includes(filter.nameContains) || (c.renamedTo || '').includes(filter.nameContains))) return false;
      if (filter.nameIn && !filter.nameIn.some(n => (c.db.name || '').includes(n) || (c.renamedTo || '').includes(n))) return false;
      if (filter.excludeName && (c.db.name || '').includes(filter.excludeName)) return false;
      if (filter.symbol && c.db.symbol !== filter.symbol && c.resymbolTo !== filter.symbol) return false;
      if (filter.color && c.db.color !== filter.color) return false;
      if (filter.costMax !== undefined && (c.db.cost || 0) > filter.costMax) return false;
      if (filter.costMin !== undefined && (c.db.cost || 0) < filter.costMin) return false;
      if (filter.cost !== undefined && (c.db.cost || 0) !== filter.cost) return false;
      if (filter.gemMin !== undefined && (c.db.gem || 0) < filter.gemMin) return false;
      if (filter.gem !== undefined && (c.db.gem || 0) !== filter.gem) return false;
      if (filter.power !== undefined && (c.db.power || 0) !== filter.power) return false;
      if (filter.powerMin !== undefined && (c.db.power || 0) < filter.powerMin) return false;
      if (filter.powerMax !== undefined && (c.db.power || 0) > filter.powerMax) return false;
      if (filter.notOnly && c.db.ex && /only/i.test(c.db.ex)) return false;
      return true;
    });
    return found.slice(0, n || 1);
  }
  // target resolution: explicit pick, else auto (foe picks from foe's view when op.foePicks)
  function pickTarget(st, meIdx, op, picks, purpose) {
    const u = picks[op.pick || 'targetUid'] ||
      (op.foePicks ? autoPick(st, 1 - meIdx, op.spec, purpose) : autoPick(st, meIdx, op.spec, purpose));
    const t = u ? findInst(st, u) : null;
    if (t && abilityUntargetable(st, meIdx, t)) {
      E.slog(st, t.db.name + ' ไม่ตกเป็นเป้า (เอฟเฟคป้องกัน)');
      return null;
    }
    return t;
  }
  // bot-default pick: destroy strongest foe, sacrifice weakest mine, buff own strongest
  function autoPick(st, meIdx, spec, purpose) {
    const list = listTargets(st, meIdx, spec);
    if (!list.length) return null;
    if (purpose === 'destroy' || purpose === 'bounce' || purpose === 'exile' || purpose === 'silence') {
      list.sort((a, b) => (E.effPower(b, 0, st) + (b.db.cost || 0)) - (E.effPower(a, 0, st) + (a.db.cost || 0)));
      // prefer foe targets
      const foe = list.filter(c => c.controller !== meIdx);
      return (foe[0] || list[0]).uid;
    }
    if (purpose === 'sacrifice' || purpose === 'exileCost') {
      const mine = list.filter(c => c.controller === meIdx);
      mine.sort((a, b) => (E.effPower(a, 0, st)) - (E.effPower(b, 0, st)));
      return (mine[0] || list[0]).uid;
    }
    if (purpose === 'buff' || purpose === 'equip' || purpose === 'host') {
      const mine = list.filter(c => c.controller === meIdx);
      mine.sort((a, b) => E.effPower(b, 0, st) - E.effPower(a, 0, st));
      return (mine[0] || list[0]).uid;
    }
    return list[0].uid;
  }
  function findInst(st, uid) {
    for (const p of st.players) {
      const zones = [p.avatar, p.magic, p.construct, p.hand, p.hell, p.dark, p.main];
      for (const z of zones) { const c = z.find(x => x.uid === uid); if (c) return c; }
    }
    return null;
  }

  // ---------- costs (atomic: validate then commit) ----------
  // cost: {discard:1, discardSymbol, giveHandToFoe, exileSelf, exileBoard:{}, sacrificeMyAvatar:{}, sacrificeSelf,
  //   tapSelf, destroyEquipped:{}, destroySelf, sendNamedToHell:{names}, sendSymbolToHell:{symbol,n}}
  function collectCostUids(cost, picks) {
    const out = [];
    cost = cost || {};
    picks = picks || {};
    if (cost.discard || cost.giveHandToFoe) (picks.discardUids || []).forEach(u => out.push(u));
    if (cost.exileBoard && picks.exileUid) out.push(picks.exileUid);
    if (cost.sacrificeMyAvatar && picks.sacrificeUid) out.push(picks.sacrificeUid);
    if (cost.destroyEquipped && picks.equipUid) out.push(picks.equipUid);
    if (cost.sendSymbolToHell && picks.sendUids) picks.sendUids.forEach(u => out.push(u));
    return out;
  }
  function validateCostAb(st, meIdx, src, cost, picks) {
    cost = cost || {};
    picks = picks || {};
    const p = st.players[meIdx];
    if (!Object.keys(cost).length) return { ok: true, plan: {} };
    // tapSelf pre-check
    if (cost.tapSelf && src.tapped) return { ok: false, error: 'ต้องนอน (tap) แต่ tap แล้ว' };
    // duplicate selections within and across components + self/stale/ownership
    const allUids = collectCostUids(cost, picks);
    if (new Set(allUids).size !== allUids.length) return { ok: false, error: 'เลือก cost ซ้ำ' };
    // src itself must not be reused as another cost unless explicitly sacrificeSelf/exileSelf/destroySelf
    if (allUids.indexOf(src.uid) >= 0) {
      // allow only if cost is exactly the self-destruction itself? No: discard/send using src is self-payment -> reject
      return { ok: false, error: 'ใช้การ์ดตัวเองจ่าย cost ซ้ำไม่ได้' };
    }
    const plan = {};
    if (cost.discard || cost.giveHandToFoe) {
      const n = cost.discard || cost.giveHandToFoe;
      const ds = picks.discardUids || [];
      if (ds.length < n) return { ok: false, error: 'ต้องทิ้งมือ ' + n };
      const chosen = ds.slice(0, n);
      for (const u of chosen) {
        const c = p.hand.find(x => x.uid === u);
        if (!c) return { ok: false, error: 'ไม่มีการ์ดทิ้ง (stale)' };
        if (c.uid === src.uid) return { ok: false, error: 'ใช้การ์ดตัวเองจ่ายไม่ได้' };
        if (cost.discardSymbol && c.db.symbol !== cost.discardSymbol) return { ok: false, error: 'ต้องทิ้ง Symbol ' + cost.discardSymbol };
        // Avatar-symbol discard (e.g. SD01-018 เทพ): require Avatar type + symbol
        if (cost.discardAvatarSymbol && (c.db.type !== 'Avatar' || c.db.symbol !== cost.discardAvatarSymbol)) {
          return { ok: false, error: 'ต้องทิ้ง Avatar Symbol ' + cost.discardAvatarSymbol };
        }
      }
      plan.discard = chosen.map(u => p.hand.find(x => x.uid === u));
    }
    if (cost.exileBoard) {
      const u = picks.exileUid;
      const c = u ? listTargets(st, meIdx, cost.exileBoard).find(x => x.uid === u) : null;
      if (!c) return { ok: false, error: 'ไม่มีเป้าเนรเทศจ่าย cost' };
      plan.exile = c;
    }
    if (cost.sacrificeMyAvatar) {
      const u = picks.sacrificeUid;
      const spec = Object.assign({ side: 'mine', zone: 'avatar' }, cost.sacrificeMyAvatar === true ? {} : cost.sacrificeMyAvatar);
      const c = u ? listTargets(st, meIdx, spec).find(x => x.uid === u) : null;
      if (!c) return { ok: false, error: 'ต้องเซ่นไหว้ Avatar ตามเงื่อนไข' };
      if (c.uid === src.uid && !cost.sacrificeSelf) {
        // sacrificing src via generic slot without flag -> still allow? treat as self-payment check: require explicit
        // allow if spec matches src, but ensure not double-counted with other costs (already checked)
      }
      plan.sacrifice = c;
    }
    if (cost.destroyEquipped) {
      const u = picks.equipUid;
      let target = null;
      p.avatar.forEach(a => a.equipped.forEach(e => {
        if (e.uid === u && (!cost.destroyEquipped.nameContains || (e.db.name || '').includes(cost.destroyEquipped.nameContains))) target = e;
      }));
      if (!target) return { ok: false, error: 'ไม่มีการ์ดสวมใส่ให้ทำลาย' };
      plan.equip = target;
    }
    if (cost.sendNamedToHell && cost.sendNamedToHell.names) {
      const used = new Set(allUids.filter(u => {
        // exclude those already accounted? track separately: sendNamed may auto-pick without picks; need distinct
        return false;
      }));
      const resolved = [];
      const tempUsed = new Set();
      // if picks.sendUids provided, use them; else auto-resolve distinct cards
      let pickList = (picks.sendUids && picks.sendUids.length) ? picks.sendUids.slice() : null;
      for (const nm of cost.sendNamedToHell.names) {
        let c = null;
        if (pickList) {
          const u = pickList.shift();
          c = u ? (p.hand.find(x => x.uid === u) || p.avatar.find(x => x.uid === u)) : null;
          if (!c || !(c.db.name || '').includes(nm)) return { ok: false, error: 'ไม่มี ' + nm + ' ส่งลงนรก' };
          if (tempUsed.has(c.uid)) return { ok: false, error: 'ใช้การ์ดซ้ำจ่าย cost' };
        } else {
          c = p.hand.find(x => (x.db.name || '').includes(nm) && !tempUsed.has(x.uid));
          if (!c) c = p.avatar.find(x => (x.db.name || '').includes(nm) && !tempUsed.has(x.uid));
          if (!c) return { ok: false, error: 'ไม่มี ' + nm + ' ส่งลงนรก' };
        }
        tempUsed.add(c.uid);
        resolved.push(c);
      }
      // overlapping check: resolved must not overlap other explicit picks
      for (const c of resolved) {
        if (allUids.indexOf(c.uid) >= 0) return { ok: false, error: 'ใช้การ์ดซ้ำจ่าย cost (overlapping)' };
      }
      plan.sendNamed = resolved;
    }
    if (cost.sendSymbolToHell) {
      const sym = cost.sendSymbolToHell.symbol, n = cost.sendSymbolToHell.n || 1;
      let pool = [];
      if (picks.sendUids && picks.sendUids.length) {
        pool = picks.sendUids.map(u => p.avatar.concat(p.hand).find(x => x.uid === u)).filter(Boolean);
        if (pool.length < n) return { ok: false, error: 'ไม่มี Symbol ' + sym + ' ครบ ' + n };
        const seenS = new Set();
        for (const c of pool.slice(0, n)) {
          if (!c) return { ok: false, error: 'ไม่มี Symbol ' + sym + ' ครบ ' + n };
          if (seenS.has(c.uid)) return { ok: false, error: 'เลือก cost ซ้ำ' };
          seenS.add(c.uid);
          if (c.db.symbol !== sym) return { ok: false, error: 'ต้องเป็น Symbol ' + sym };
          if (allUids.indexOf(c.uid) >= 0 && picks.sendUids.indexOf(c.uid) < 0) return { ok: false, error: 'ใช้การ์ดซ้ำจ่าย cost' };
        }
        pool = pool.slice(0, n);
      } else {
        pool = p.avatar.filter(x => x.db.symbol === sym).concat(p.hand.filter(x => x.db.symbol === sym)).slice(0, n);
        if (pool.length < n || !pool.every(x => x.db.symbol === sym)) return { ok: false, error: 'ไม่มี Symbol ' + sym + ' ครบ ' + n };
        // overlapping with other picks
        for (const c of pool) if (allUids.indexOf(c.uid) >= 0) return { ok: false, error: 'ใช้การ์ดซ้ำจ่าย cost (overlapping)' };
      }
      // distinct within pool already checked; also check duplicates vs discard etc (allUids includes sendUids)
      plan.sendSymbol = pool.slice(0, n);
    }
    // self-destruction targets must be on field (unless already validated)
    if ((cost.exileSelf || cost.destroySelf || cost.sacrificeSelf) && !E.onField(st, src)) {
      // allow exileSelf from hand? KD03-002 exiles self from field? require field
      // For hand-activated exileSelf (search cost), src is in hand — allow
      const inHand = p.hand.indexOf(src) >= 0;
      if (!inHand && !E.onField(st, src)) return { ok: false, error: 'การ์ดไม่อยู่ในสนามแล้ว' };
    }
    return { ok: true, plan };
  }
  function commitCostAb(st, meIdx, src, cost, picks, prePlan) {
    cost = cost || {};
    const p = st.players[meIdx];
    const plan = (prePlan && prePlan.plan) || validateCostAb(st, meIdx, src, cost, picks).plan || {};
    // commit in deterministic order; triggers dispatched only after all moves (collect then fire)
    const triggerQueue = [];
    if (plan.discard) {
      const n = cost.discard || cost.giveHandToFoe;
      plan.discard.slice(0, n).forEach(c => {
        const i = p.hand.indexOf(c);
        if (i >= 0) p.hand.splice(i, 1);
        if (cost.giveHandToFoe) st.players[1 - meIdx].hand.push(c);
        else p.hell.push(c);
      });
    }
    if (plan.exile) {
      E.exileInst(st, plan.exile, 'cost');
      if (picks) picks.fromUid = plan.exile.uid;
    }
    if (plan.sacrifice) {
      E.destroyInst(st, plan.sacrifice, 'เซ่นไหว้');
    }
    if (cost.sacrificeSelf) {
      E.destroyInst(st, src, 'เซ่นไหว้ตัวเอง');
    }
    if (plan.equip) {
      const target = plan.equip;
      const host = E.findAvatar(st, target.equippedTo);
      if (host) { const i = host.equipped.indexOf(target); if (i >= 0) host.equipped.splice(i, 1); }
      target.equippedTo = null;
      // centralized: purge from magic before hell
      const mi = p.magic.indexOf(target); if (mi >= 0) p.magic.splice(mi, 1);
      if (p.hell.indexOf(target) < 0) p.hell.push(target);
      E.slog(st, target.db.name + ' ถูกทำลาย (cost)');
      triggerQueue.push(() => { onEquipHell(st, target); runTriggered(st, meIdx, target, 'commandDeath', {}); });
    }
    if (cost.exileSelf) E.exileInst(st, src, 'cost');
    if (cost.destroySelf) E.destroyInst(st, src, 'cost');
    if (plan.sendNamed) {
      plan.sendNamed.forEach(c => {
        const hi = p.hand.indexOf(c);
        if (hi >= 0) { p.hand.splice(hi, 1); p.hell.push(c); }
        else E.destroyInst(st, c, 'cost');
      });
    }
    if (plan.sendSymbol) {
      plan.sendSymbol.forEach(c => {
        const hi = p.hand.indexOf(c);
        if (hi >= 0) { p.hand.splice(hi, 1); p.hell.push(c); }
        else E.destroyInst(st, c, 'cost');
      });
    }
    if (cost.tapSelf && !cost.exileSelf) src.tapped = true;
    triggerQueue.forEach(fn => { try { fn(); } catch (e) {} });
    return { ok: true };
  }
  function payCostAb(st, meIdx, src, cost, picks) {
    const v = validateCostAb(st, meIdx, src, cost, picks);
    if (!v.ok) return v;
    return commitCostAb(st, meIdx, src, cost, picks, v);
  }

  // ---------- ops ----------
  function runOps(st, meIdx, src, ops, picks) {
    picks = picks || {};
    for (const op of ops) {
      if (st.winner) break;
      if (op.when && !op.when(st, meIdx, src, picks)) continue;
      if (op.requireHell) {
        const n = st.players[meIdx].hell.filter(c => (c.db.name || '').includes(op.requireHell.name)).length;
        if (n < (op.requireHell.min || 1)) continue;
      }
      switch (op.op) {
        case 'draw': {
          const p = st.players[op.who === 'foe' ? 1 - meIdx : meIdx];
          for (let i = 0; i < op.n; i++) E.drawOne(st, p);
          E.slog(st, (src ? src.db.name + ': ' : '') + 'จั่ว ' + op.n);
          break;
        }
        case 'buffSelf': src.buffs.push({ v: op.v, until: 'endTurn' }); E.slog(st, src.db.name + ' POWER ' + (op.v >= 0 ? '+' : '') + op.v); break;
        case 'buffPermSelf': src.buffs.push({ v: op.v, until: 'never' }); E.slog(st, src.db.name + ' POWER ' + (op.v >= 0 ? '+' : '') + op.v + ' (ถาวร)'); break;
        case 'returnSelfToBottom': {
          const owner = st.players[src.owner];
          // detach first
          (src.equipped || []).slice().forEach(e => {
            const i = src.equipped.indexOf(e);
            if (i >= 0) src.equipped.splice(i, 1);
            e.equippedTo = null; st.players[e.controller].hell.push(e);
          });
          src.equipped = [];
          [['avatar', owner.avatar], ['magic', owner.magic], ['construct', owner.construct]].forEach(pair => {
            const i = pair[1].indexOf(src); if (i >= 0) pair[1].splice(i, 1);
          });
          owner.main.push(src);
          E.slog(st, src.db.name + ' กลับใต้ Deck');
          break;
        }
        case 'buff': {
          const t = pickTarget(st, meIdx, op, picks, op.v < 0 ? 'destroy' : 'buff');
          if (t) { t.buffs.push({ v: op.v, until: op.until || 'endTurn' }); E.slog(st, src.db.name + ' -> ' + t.db.name + ' POWER ' + op.v); }
          break;
        }
        case 'destroy': {
          // event-bound targeting (SD01-017/PRMO-003): summoned card first when flagged or when picks carry ev
          if ((op.targetSummoned || (!op.spec && picks && picks.ev && picks.ev.card)) && picks && picks.ev && picks.ev.card) {
            const t0 = findInst(st, picks.ev.card.uid);
            if (t0 && E.onField(st, t0)) {
              // validate spec if present (side/zone) but prefer event target
              E.destroyInst(st, t0, src.db.name);
              break;
            }
          }
          const all = op.n && op.n > 1 ? listTargets(st, meIdx, op.spec) : null;
          const n = op.n || 1;
          for (let i = 0; i < n; i++) {
            let t = null;
            if (all) t = all[i];
            else t = pickTarget(st, meIdx, op, picks, 'destroy');
            if (t && E.onField(st, t)) E.destroyInst(st, t, src.db.name);
            else break;
          }
          break;
        }
        case 'bounce': {
          const t = pickTarget(st, meIdx, op, picks, 'bounce');
          if (t && E.onField(st, t)) E.bounceInst(st, t);
          break;
        }
        case 'bounceSelf': {
          if (E.onField(st, src)) E.bounceInst(st, src);
          else {
            // self may be in hell (mill trigger) — move to hand
            const p = st.players[meIdx];
            const i = p.hell.indexOf(src);
            if (i >= 0) { p.hell.splice(i, 1); p.hand.push(src); E.slog(st, src.db.name + ' กลับขึ้นมือ'); }
          }
          break;
        }
        case 'exile': {
          const t = pickTarget(st, meIdx, op, picks, 'exile');
          if (t) E.exileInst(st, t, src.db.name);
          break;
        }
        case 'silence': {
          const t = pickTarget(st, meIdx, op, picks, 'silence');
          if (t) {
            const base = st.turn * 2 + st.cur;
            t.silencedUntil = base + (op.silenceFoeNext ? (st.cur === meIdx ? 1 : 2) : (op.untilHalfTurns || 2));
            E.slog(st, t.db.name + ' สูญเสียความสามารถจนจบเทิร์น');
          }
          break;
        }
        case 'copyStats': {
          const u = picks[op.pick || 'targetUid'] || autoPick(st, meIdx, op.spec, 'destroy');
          const t = u ? findInst(st, u) : null;
          if (t && E.onField(st, t)) {
            const tp = E.effPower(t, 0, st);
            const sp = E.effPower(src, 0, st);
            src.buffs.push({ v: tp - sp, until: op.until || 'endTurn' });
            src.renamedTo = t.db.name;
            if (t.db.symbol) src.resymbolTo = t.db.symbol;
            E.slog(st, src.db.name + ' ก็อปปี้ ' + t.db.name);
          }
          break;
        }
        case 'search': {
          // {where, filter, n, to:'hand'|'equipHost'|'fieldJuti', pickUids:[], shuffleAfter:true}
          const found = zoneSearch(st, meIdx, op.where, op.filter, op.n);
          const chosen = ((picks && picks[op.pick || 'searchUids']) || found.map(c => c.uid)).slice(0, op.n);
          chosen.forEach(u => {
            const c = found.find(x => x.uid === u); if (!c) return;
            if (op.to === 'hand') {
              const pile = op.where === 'deckMine' ? st.players[meIdx].main : op.where === 'hellMine' ? st.players[meIdx].hell : op.where === 'darkMine' ? st.players[meIdx].dark : st.players[1 - meIdx].hell;
              pile.splice(pile.indexOf(c), 1); st.players[meIdx].hand.push(c);
              E.slog(st, src.db.name + ' นำ ' + c.db.name + ' ขึ้นมือ');
            } else if (op.to === 'equipHost' || op.to === 'equipSelf') {
              let host = null;
              if (op.to === 'equipSelf') host = src;
              else {
                host = picks.hostUid ? findInst(st, picks.hostUid) : null;
                if (!host && op.hostSpec) {
                  const u = autoPick(st, meIdx, Object.assign({ side: 'mine', zone: 'avatar' }, op.hostSpec), 'host');
                  host = u ? findInst(st, u) : null;
                }
                if (!host) {
                  // default: an ไอดอล of ours, else any own avatar, else self if avatar
                  const u = autoPick(st, meIdx, { side: 'mine', zone: 'avatar', nameContains: 'ไอดอล' }, 'host') ||
                    autoPick(st, meIdx, { side: 'mine', zone: 'avatar' }, 'host');
                  host = u ? findInst(st, u) : null;
                }
                if (!host) host = src && E.onField(st, src) && src.db.type === 'Avatar' ? src : null;
              }
              if (host) E.attachEquip(st, c, host);
            } else if (op.to === 'fieldJuti') {
              E.summonFromZone(st, meIdx, c, { juti: true });
            }
          });
          if (op.shuffleAfter && op.where === 'deckMine') E.shuffle(st.players[meIdx].main);
          break;
        }
        case 'scry': {
          // picks: {scryChosen:[uids], scryDest:'hand'|'equipHost', scryRest:'deckShuffle'|'deckBottom', hostUid}
          // auto: op.pickFilter {nameContains} + op.pickMax
          const p = st.players[op.side === 'foe' ? 1 - meIdx : meIdx];
          const shown = p.main.slice(0, op.n);
          let chosen = (picks && picks.scryChosen) || [];
          if (!chosen.length && op.pickFilter) {
            chosen = shown.filter(c => !op.pickFilter.nameContains || (c.db.name || '').includes(op.pickFilter.nameContains))
              .slice(0, op.pickMax || 9).map(c => c.uid);
          }
          const dest = (picks && picks.scryDest) || op.defaultDest || 'hand';
          const rest = (picks && picks.scryRest) || op.defaultRest || 'deckShuffle';
          const chosenInst = chosen.map(u => shown.find(x => x.uid === u)).filter(Boolean);
          chosenInst.forEach(c => {
            p.main.splice(p.main.indexOf(c), 1);
            if (dest === 'hand') p.hand.push(c);
            else if (dest === 'equipHost') { const host = findInst(st, picks.hostUid); if (host) E.attachEquip(st, c, host); }
            else if (dest === 'field') E.summonFromZone(st, meIdx, c, { juti: false });
            E.slog(st, src.db.name + ' สอดแนมได้ ' + c.db.name);
          });
          const left = shown.filter(c => chosenInst.indexOf(c) < 0);
          left.forEach(c => p.main.splice(p.main.indexOf(c), 1));
          if (rest === 'deckBottom') left.forEach(c => p.main.push(c));
          else if (rest === 'deckTop') left.reverse().forEach(c => p.main.unshift(c));
          else left.forEach(c => p.main.unshift(c));
          if (rest === 'deckShuffle') E.shuffle(p.main);
          break;
        }
        case 'millHell': {
          const p = st.players[op.side === 'foe' ? 1 - meIdx : meIdx];
          const milled = [];
          for (let i = 0; i < op.n && p.main.length; i++) milled.push(p.main.shift());
          milled.forEach(c => p.hell.push(c));
          E.slog(st, src.db.name + ' ธรณีสูบ ' + op.n);
          milled.forEach(c => {
            if (c.db.type === 'Avatar') runTriggered(st, p.idx, c, 'onMill', { by: src });
          });
          break;
        }
        case 'destroySelf': {
          E.destroyInst(st, src, 'เอฟเฟค');
          break;
        }
        case 'delaySelfEnd': {
          E.addDelayed(st, meIdx, src.db.name + ' (ทำลายตอน End)', { wait: { phase: 'end', owner: 'self', count: 1 }, ops: [{ op: 'destroySelf' }] });
          break;
        }
        case 'reactLockFoe': {
          st.reactLock = { n: st.battleCount || 0, foe: 1 - meIdx };
          E.slog(st, 'ล็อก React จนจบการต่อสู้');
          break;
        }
        case 'untap': {
          const u = picks[op.pick || 'targetUid'];
          const t = u ? findInst(st, u) : src;
          if (t && E.onField(st, t)) { t.tapped = false; E.slog(st, t.db.name + ' กลับสภาพตื่น'); }
          break;
        }
        case 'summonSelf': {
          // summon THIS from hand via effect (bypass GEM cost), optional juti trigger
          E.summonFromZone(st, meIdx, src, { juti: !!op.juti });
          picks._last = src.uid;
          break;
        }
        case 'summonFrom': {
          const found = zoneSearch(st, meIdx, op.where, op.filter, 1);
          const u = (picks && picks[op.pick || 'summonUid']) || (found[0] && found[0].uid);
          const c = u ? found.find(x => x.uid === u) : null;
          if (c) {
            const toSide = op.side === 'foe' ? 1 - meIdx : meIdx;
            E.summonFromZone(st, toSide, c, { juti: !!op.juti });
            if (op.sleep) c.tapped = true;
            if (op.sleepUnless) {
              const land = st.land;
              const okLand = land && land.owner === toSide && (land.card.db.name || '').includes(op.sleepUnless.landName || '');
              c.tapped = !okLand;
            }
            picks._last = c.uid;
            if (op.thenEquip && (picks.equipToUid || picks._last)) {
              const host = findInst(st, picks.equipToUid || picks._last);
              const eqs = zoneSearch(st, meIdx, op.thenEquip.where, op.thenEquip.filter, 1);
              const eq = eqs[0];
              if (host && eq) E.attachEquip(st, eq, host);
            }
            if (op.thenEquipHost && op.thenEquipHost.nameContains) {
              const h = st.players[meIdx].avatar.find(a => (a.db.name || '').includes(op.thenEquipHost.nameContains));
              const eqs = zoneSearch(st, meIdx, op.thenEquipHost.where || 'deckMine', op.thenEquipHost.filter || {}, 1);
              if (h && eqs[0]) E.attachEquip(st, eqs[0], h);
            }
          }
          if (op.shuffleAfter) {
            const dp = op.where === 'deckFoe' ? st.players[1 - meIdx].main : st.players[meIdx].main;
            E.shuffle(dp);
          }
          break;
        }
        case 'equipSelfTo': {
          const host = findInst(st, picks.hostUid);
          if (host) E.attachEquip(st, src, host);
          break;
        }
        case 'unsummonSelf': {
          E.equippedToAvatarZone(st, src);
          break;
        }
        case 'moveMyEquip': {
          // take equips dropped with the exiled card (nameContains) from own hell -> dest
          const dest = findInst(st, picks.destUid) || (picks._last ? findInst(st, picks._last) : null) || src;
          const hell = st.players[meIdx].hell;
          let eqs = hell.filter(e => !op.nameContains || (e.db.name || '').includes(op.nameContains));
          if (picks.fromUid) {
            const tagged = eqs.filter(e => e._droppedWith === picks.fromUid);
            if (tagged.length) eqs = tagged;
          }
          eqs.slice(0, op.n || 9).forEach(e => { if (dest && E.onField(st, dest)) E.attachEquip(st, e, dest); });
          break;
        }
        case 'returnSelfToDeck': {
          E.deckReturnInst(st, src, false, true);
          if (op.thenDraw) for (let i = 0; i < op.thenDraw; i++) E.drawOne(st, st.players[meIdx]);
          break;
        }
        case 'negateEvent': {
          if (picks.ev) picks.ev.cancelled = true;
          E.slog(st, src.db.name + ' ยกเลิกผล');
          break;
        }
        case 'selfReactLock': {
          st.noReactMagic = { owner: meIdx, until: st.turn * 2 + st.cur + 1 };
          E.slog(st, 'ล็อก React Magic ของตัวเองถึงจบเทิร์น');
          break;
        }
        case 'suppressLife': {
          st.lifeSuppress = { owner: meIdx, until: st.turn * 2 + st.cur + 1 };
          E.slog(st, 'LIFE ที่หงายจากการโจมตีจะไม่ทำงานจนจบเทิร์น');
          break;
        }
        case 'rename': {
          const u = picks[op.pick || 'targetUid'] || (op.self ? src.uid : null);
          const t = u ? findInst(st, u) : null;
          if (t) {
            t.renamedTo = op.name;
            if (op.symbol) t.resymbolTo = op.symbol;
            E.slog(st, t.db.name + ' ถูกเปลี่ยนเป็น "' + op.name + '"' + (op.symbol ? ' Symbol ' + op.symbol : ''));
          }
          break;
        }
        case 'halveBase': {
          const base = src.db.power || 0;
          src.baseDelta = (src.baseDelta || 0) - Math.floor(base / 2);
          E.slog(st, src.db.name + ' POWER ตั้งต้นลดลงครึ่งหนึ่ง');
          break;
        }
        case 'negateAttack': {
          if (picks.ev) picks.ev.negated = true;
          E.slog(st, src.db.name + ' ยกเลิกการโจมตี');
          break;
        }
        case 'destroyLand': {
          if (st.land) { const old = st.land; st.players[old.owner].hell.push(old.card); st.land = null; E.slog(st, 'Land ' + old.card.db.name + ' ถูกทำลาย'); }
          break;
        }
        case 'flipLife': {
          E.flipLifeAt(st, op.side === 'foe' ? 1 - meIdx : meIdx, op.n || 1, op.up !== false);
          break;
        }
        case 'flipLifeRandom': {
          const p = st.players[op.side === 'foe' ? 1 - meIdx : meIdx];
          const open = p.life.filter(l => l.open);
          if (open.length && op.up === false) {
            const t = open[Math.floor(Math.random() * open.length)];
            if (!p.sahat) { t.open = false; E.slog(st, 'สุ่มคว่ำ LIFE ' + t.card.db.name); }
          }
          break;
        }
        case 'buffPer': {
          const t = pickTarget(st, meIdx, op, picks, 'destroy') || (op.self ? src : null);
          if (t) {
            const v = op.v * countPer(st, meIdx, op.per);
            t.buffs.push({ v, until: op.until || 'endTurn' });
            E.slog(st, src.db.name + ' -> ' + t.db.name + ' POWER ' + v);
          }
          break;
        }
        case 'deckTop': {
          // move n cards from hell to top of deck (mine, or both sides)
          const sides = op.side === 'both' ? [meIdx, 1 - meIdx] : [op.side === 'foe' ? 1 - meIdx : meIdx];
          sides.forEach(si => {
            const found = zoneSearch(st, si, si === meIdx ? 'hellMine' : 'hellFoe', op.filter, op.n);
            const chosen = ((picks && picks[op.pick || 'deckTopUids']) || found.map(c => c.uid)).slice(0, op.n);
            chosen.forEach(u => {
              const c = found.find(x => x.uid === u); if (!c) return;
              const pile = st.players[si].hell;
              pile.splice(pile.indexOf(c), 1);
              st.players[si].main.unshift(c);
              E.slog(st, src.db.name + ' นำ ' + c.db.name + ' ไว้บนสุด Deck');
            });
          });
          break;
        }
        case 'summonToken': {
          let row = op.print ? cardDB.find(c => c.print === op.print) : null;
          if (!row && op.tokenMatch) {
            row = cardDB.find(c => c.type === 'Token' &&
              (!op.tokenMatch.name || (c.name || '').includes(op.tokenMatch.name)) &&
              (!op.tokenMatch.symbol || c.symbol === op.tokenMatch.symbol));
          }
          if (!row) { E.slog(st, 'ไม่พบข้อมูล Token'); break; }
          if (op.requireHell) {
            const n = st.players[meIdx].hell.filter(c => (c.db.name || '').includes(op.requireHell.name)).length;
            if (n < (op.requireHell.min || 1)) { E.slog(st, 'เงื่อนไข Token ไม่ครบ'); break; }
          }
          for (let i = 0; i < (op.n || 1); i++) {
            const inst = { uid: Date.now() % 100000000 + Math.floor(Math.random() * 999) + i, db: row, owner: meIdx, controller: meIdx, tapped: false, buffs: [], equipped: [], equippedTo: null, isToken: true, battleBuff: 0, snapshot: null, silencedUntil: 0, fxUsed: {}, grantedKw: [] };
            E.summonFromZone(st, meIdx, inst, { juti: false });
          }
          break;
        }
        case 'rebuildConstruct': {
          // build constructs from hell within total cost
          const mine = op.side !== 'foe';
          const mi = mine ? meIdx : 1 - meIdx;
          const p = st.players[mi];
          const cands = zoneSearch(st, mi, mine ? 'hellMine' : 'hellFoe', Object.assign({ type: 'Construct' }, op.filter), 9);
          const chosen = ((picks && picks[op.pick || 'rebuildUids']) || cands.map(c => c.uid));
          let total = 0;
          let count = 0;
          for (const u of chosen) {
            if (count >= (op.maxCount || 9)) break;
            const c = cands.find(x => x.uid === u);
            if (!c || p.construct.length >= 3) continue;
            if (p.construct.some(x => x.db.name === c.db.name)) continue;
            if (total + (c.db.cost || 0) > (op.totalCostMax || 99)) continue;
            total += (c.db.cost || 0); count++;
            p.hell.splice(p.hell.indexOf(c), 1);
            c.controller = mi;
            p.construct.push(c);
            E.slog(st, 'ก่อสร้าง ' + c.db.name + ' (ด้วยเอฟเฟค)');
          }
          break;
        }
        case 'costBan': {
          st.costBan = st.costBan || [];
          st.costBan.push({ owner: meIdx, names: op.names || [] });
          E.slog(st, 'ห้ามใช้ ' + (op.names || []).join('/') + ' เป็น Cost (จนจบเกม)');
          break;
        }
        case 'winGame': E.winGame(st, meIdx, op.reason || src.db.name); break;
        case 'grantKw': {
          const u = picks[op.pick || 'targetUid'];
          const t = u ? findInst(st, u) : null;
          const list = t ? [t] : [src];
          (op.hosts === 'equipped' && src.equippedTo ? [E.findAvatar(st, src.equippedTo)] : []).forEach(h => { if (h) list.push(h); });
          list.forEach(x => {
            x.grantedKw = x.grantedKw || [];
            if (x.grantedKw.indexOf(op.kw) < 0) x.grantedKw.push(op.kw);
            E.slog(st, x.db.name + ' ได้รับ ' + op.kw);
          });
          break;
        }
        case 'gainControl': {
          const t = pickTarget(st, meIdx, op, picks, 'destroy');
          if (t && E.onField(st, t)) E.gainControl(st, t, meIdx);
          break;
        }
        case 'moveToMagic': {
          const t = pickTarget(st, meIdx, op, picks, 'destroy');
          if (t && E.onField(st, t)) {
            const p = st.players[t.controller];
            (t.equipped || []).slice().forEach(e => {
              const i = t.equipped.indexOf(e);
              if (i >= 0) t.equipped.splice(i, 1);
              e.equippedTo = null;
              st.players[e.controller].hell.push(e);
            });
            t.equipped = [];
            [['avatar', p.avatar], ['construct', p.construct]].forEach(pair => {
              const i = pair[1].indexOf(t); if (i >= 0) pair[1].splice(i, 1);
            });
            t.tapped = false;
            p.magic.push(t);
            E.slog(st, t.db.name + ' ถูกย้ายไป Magic Zone');
          }
          break;
        }
        case 'log': E.slog(st, op.text); break;
      }
    }
  }

  // ---------- ability gating ----------
  function usedKey(st, ab, inst) {
    let k = turnKey(st);
    if (ab.perBattle) k += ':' + (st.battleCount || 0);
    if (ab.perSummon && inst) k += ':s' + (inst._summonSeq || 0);
    return k;
  }
  function canUse(st, meIdx, inst, ab) {
    if (st.winner) return false;
    if (ab.location === 'hand' && st.players[meIdx].hand.indexOf(inst) < 0) return false;
    if (ab.location === 'hell' && st.players[meIdx].hell.indexOf(inst) < 0) return false;
    if (!ab.location && !E.onField(st, inst)) return false;
    if (E.silenced && E.silenced(inst, st) && !ab.ruleText) return false;
    if ((ab.oncePerTurn || ab.perBattle) && inst.fxUsed[ab.id] === usedKey(st, ab)) return false;
    if (ab.phases && ab.phases.indexOf(st.phase) < 0) return false;
    if (ab.turn && ((ab.turn === 'mine' && st.cur !== meIdx) || (ab.turn === 'foe' && st.cur === meIdx))) return false;
    return true;
  }
  function markUsed(st, inst, ab) {
    if (ab.oncePerTurn || ab.perBattle || ab.perSummon) inst.fxUsed[ab.id] = usedKey(st, ab, inst);
  }
  // activated abilities available for UI listing
  function listActivated(st, meIdx, inst) {
    const sc = scriptOf(inst);
    if (!sc) return [];
    return (sc.abilities || []).filter(ab => ab.kind === 'activated' && canUse(st, meIdx, inst, ab));
  }
  function execActivated(st, meIdx, instUid, abId, picks) {
    picks = picks || {};
    if (E.responsePending && E.responsePending(st)) return { ok: false, error: 'รอการตัดสินใจสวนก่อน' };
    const inst = findInst(st, instUid);
    if (!inst) return { ok: false, error: 'ไม่เจอการ์ด' };
    const sc = scriptOf(inst);
    const ab = sc && (sc.abilities || []).find(a => a.id === abId && a.kind === 'activated');
    if (!ab) return { ok: false, error: 'ไม่มีความสามารถนี้' };
    if (!canUse(st, meIdx, inst, ab)) return { ok: false, error: 'ใช้ไม่ได้ตอนนี้' };
    if (ab.condData && ab.condData.podi && !inst._podi) return { ok: false, error: 'ต้องอัญเชิญแบบพอดีก่อน' };
    // choices: เลือกปฏิบัติ sub-ability (default: first unless bothWhen)
    let ops = ab.ops || [];
    if (ab.choose) {
      if (picks && picks.choice !== undefined && ab.choose[picks.choice]) ops = ab.choose[picks.choice].ops;
      else if (ab.bothWhen && ab.bothWhen(st, meIdx, inst)) ops = ab.choose.reduce((a, c) => a.concat(c.ops || []), []);
      else {
        const def = ab.choose.find(c => c.default) || ab.choose[0];
        ops = (def && def.ops) || [];
      }
    }
    // atomic validation first (failed attempts do not mark/count)
    const v = validateCostAb(st, meIdx, inst, ab.cost || {}, picks);
    if (!v.ok) return v;
    markUsed(st, inst, ab);
    const cc = commitCostAb(st, meIdx, inst, ab.cost || {}, picks, v);
    if (!cc.ok) return cc;
    if (ab.countsAsReact) st.players[meIdx].magicUsed.React = 1;
    E.slog(st, inst.db.name + ' สั่งใช้' + (ab.name ? ' (' + ab.name + ')' : ''));
    // emit abilityUsed for responses (BT04-050) BEFORE resolving — suspend if human pending
    const evu = { type: 'abilityUsed', source: inst, owner: meIdx, cancelled: false, ability: ab };
    const r = onEvent(st, evu);
    const hasPending = (st.pendingResponses || []).some(q => q.evId === evu.id) || r === 'queued' || st._pendingEv === evu;
    if (hasPending) {
      st._frames = st._frames || [];
      st._frames.push({ evId: evu.id, kind: 'abilityOps', me: meIdx, instUid: inst.uid, abId: ab.id, ops, picks });
      st._pendingEv = evu;
      return { ok: true, pending: true, evId: evu.id };
    }
    if (evu.cancelled) { E.slog(st, inst.db.name + ' ถูกยกเลิก'); return { ok: true, cancelled: true }; }
    runOps(st, meIdx, inst, ops, picks);
    return { ok: true };
  }

  // ---------- trigger dispatch (engine hooks) ----------
  function abilByTrigger(inst, trig) {
    const sc = scriptOf(inst);
    if (!sc) return [];
    return (sc.abilities || []).filter(ab => ab.kind === 'triggered' && ab.trigger === trig);
  }
  function runTriggered(st, meIdx, inst, trig, ctx) {
    const abs = abilByTrigger(inst, trig);
    const skipCostAll = !!(ctx && ctx.skipCost);
    abs.forEach(ab => {
      if (!canUse(st, meIdx, inst, ab)) return;
      if (ab.cond && !ab.cond(st, meIdx, inst, ctx)) return;
      if (ab.condData) {
        const cd = ab.condData;
        if (cd.podi && !inst._podi) return;
        if (cd.byEffect && !(ctx && ctx.byCost === false)) return;
        if (cd.fromZone && !(ctx && ctx.fromZone === cd.fromZone)) return;
        if (cd.forTarget && !(ctx && ctx.targetName && ctx.targetName.includes(cd.forTarget))) return;
        if (cd.millByAny && ctx && ctx.by) {
          const b = (ctx.by.db) || {};
          const ok = cd.millByAny.some(o =>
            (!o.symbol || b.symbol === o.symbol) &&
            (!o.color || b.color === o.color) &&
            (!o.type || b.type === o.type));
          if (!ok) return;
        }
      }
      let ops = ab.ops || [];
      const picks = Object.assign(autoPicksFor(st, meIdx, ab), (ctx && ctx.picks) || {});
      if (ctx && ctx.summonTargetUid && !picks.targetUid) picks.targetUid = ctx.summonTargetUid;
      if (ctx && ctx.victimUid && !picks.targetUid) picks.targetUid = ctx.victimUid;
      if (ab.choose) {
        const ch = (ctx && ctx.choice !== undefined && ab.choose[ctx.choice]) ||
          (ab.bothWhen && ab.bothWhen(st, meIdx, inst) ? null : (ab.choose.find(c => c.default) || ab.choose[0]));
        if (ab.bothWhen && ab.bothWhen(st, meIdx, inst) && !(ctx && ctx.choice !== undefined)) {
          ops = ab.choose.reduce((a, c) => a.concat(c.ops || []), []);
        } else ops = (ch && ch.ops) || [];
      }
      if (!skipCostAll) {
        const v = validateCostAb(st, meIdx, inst, ab.cost || {}, picks);
        if (!v.ok) { E.slog(st, inst.db.name + ' จ่าย cost ไม่ได้: ' + v.error); return; }
        markUsed(st, inst, ab);
        commitCostAb(st, meIdx, inst, ab.cost || {}, picks, v);
      } else {
        markUsed(st, inst, ab);
      }
      const evu = { type: 'abilityUsed', source: inst, owner: meIdx, cancelled: false, ability: ab };
      const r = onEvent(st, evu);
      const hasPending = (st.pendingResponses || []).some(q => q.evId === evu.id) || r === 'queued' || st._pendingEv === evu;
      if (hasPending) {
        st._frames = st._frames || [];
        st._frames.push({ evId: evu.id, kind: 'abilityOps', me: meIdx, instUid: inst.uid, abId: ab.id, ops, picks });
        st._pendingEv = evu;
        return;
      }
      if (!evu.cancelled) runOps(st, meIdx, inst, ops, picks);
    });
  }
  function eachBoard(st, fn) {
    st.players.forEach(p => {
      p.avatar.concat(p.magic, p.construct).forEach(c => fn(p.idx, c));
      p.hand.forEach(c => fn(p.idx, c, true));
    });
  }
  // legacy template fallback (same as old engine behavior) when no script exists
  function legacyJuti(st, card, pIdx) {
    const ops = [];
    const d = E.parseDraw(card.db.mainEffect);
    if (d) ops.push({ kind: 'draw', n: d, src: card, owner: pIdx });
    E.parsePowerMods(card.db.mainEffect).forEach(m => ops.push({ kind: 'selfBuff', v: m.sign === '+' ? m.v : -m.v, src: card }));
    const k = (function () { const m = /ทำลาย\s*Avatar[^\n]{0,40}?(\d+)\s*ใบ/.exec(card.db.mainEffect || ''); return m ? parseInt(m[1], 10) : 0; })();
    if (k) ops.push({ kind: 'destroyFoeAvatar', n: k, src: card, owner: pIdx });
    if (!ops.length) st.pendingOps.push({ kind: 'manual', text: 'จุติ ' + card.db.name + ' (บังคับเองตาม text)', src: card });
    legacyResolve(st, ops);
  }
  function legacyResolve(st, ops) {
    for (const op of ops) {
      const p = st.players[op.owner !== undefined ? op.owner : st.cur];
      if (op.kind === 'draw') { for (let i = 0; i < op.n; i++) E.drawOne(st, p); E.slog(st, (op.src ? op.src.db.name : '') + ' จั่ว ' + op.n); }
      else if (op.kind === 'selfBuff' && op.src) { op.src.buffs.push({ v: op.v, until: 'endTurn' }); E.slog(st, op.src.db.name + ' POWER ' + (op.v >= 0 ? '+' : '') + op.v); }
      else if (op.kind === 'destroyFoeAvatar') {
        const f = st.players[1 - (op.owner !== undefined ? op.owner : st.cur)];
        for (let i = 0; i < op.n && f.avatar.length; i++) {
          f.avatar.sort((a, b) => b.db.power - a.db.power);
          const d = f.avatar.shift(); f.hell.push(d); E.slog(st, op.src.db.name + ' ทำลาย ' + d.db.name);
        }
      }
    }
  }
  function legacyMagic(st, pIdx, card) {
    const p = st.players[pIdx];
    const d = E.parseDraw(card.db.mainEffect);
    if (d) for (let i = 0; i < d; i++) E.drawOne(st, p);
    const k = (function () { const m = /ทำลาย\s*Avatar[^\n]{0,40}?(\d+)\s*ใบ/.exec(card.db.mainEffect || ''); return m ? parseInt(m[1], 10) : 0; })();
    if (k) { const f = st.players[1 - pIdx]; for (let i = 0; i < k && f.avatar.length; i++) { f.avatar.sort((a, b) => b.db.power - a.db.power); const x = f.avatar.shift(); f.hell.push(x); } }
    if (!d && !k) st.pendingOps.push({ kind: 'manual', text: 'Magic ' + card.db.name + ' (บังคับเองตาม text)', src: card });
  }
  // engine hook impls
  function onSummoned(st, card, info) {
    if (!E.onField(st, card)) return false;
    const sc = scriptOf(card);
    if (!sc || !(sc.abilities || []).some(a => a.kind === 'triggered' && a.trigger === 'juti')) {
      if ((card.db.mainEffect || '').includes('จุติ')) legacyJuti(st, card, card.controller);
      return true;
    }
    runTriggered(st, card.controller, card, 'juti', info);
    return true; // handled (script or empty)
  }
  function onDestroyed(st, inst, info) {
    const sc = scriptOf(inst);
    if (!sc || !(sc.abilities || []).some(a => a.kind === 'triggered' && a.trigger === 'commandDeath')) {
      if ((inst.db.mainEffect || '').includes('คำสั่งเสีย')) {
        st.pendingOps.push({ kind: 'manual', text: 'คำสั่งเสีย ' + inst.db.name + ' (บังคับเองตาม text)', src: inst });
      }
      return true;
    }
    runTriggered(st, inst.owner, inst, 'commandDeath', info || {});
    return true;
  }
  function onAttack(st, atk, info) {
    if (!E.onField(st, atk)) return true;
    runTriggered(st, atk.controller, atk, 'onAttack', info || {});
    return true;
  }
  function onWearerAttack(st, equipInst, atk) {
    runTriggered(st, equipInst.controller, equipInst, 'wearerAttacks', { atkUid: atk.uid });
    return true;
  }
  function onBattle(st, atk, def) {
    if (E.onField(st, atk)) runTriggered(st, atk.controller, atk, 'onBattle', {});
    if (def && E.onField(st, def)) runTriggered(st, def.controller, def, 'onBattle', {});
    onEvent(st, { type: 'battleStarted', atk, def, owner: atk.controller, cancelled: false });
    return true;
  }
  function onTargeted(st, def, info) {
    if (!E.onField(st, def)) return true;
    runTriggered(st, def.controller, def, 'onTargeted', info || {});
    return true;
  }
  function onKill(st, atk, victim) {
    if (!E.onField(st, atk)) return true;
    runTriggered(st, atk.controller, atk, 'onKill', { victimUid: victim && victim.uid });
    onEvent(st, { type: 'killDone', source: atk, victim, owner: atk.controller, cancelled: false });
    return true;
  }
  function onEquipped(st, equip, host) {
    runTriggered(st, equip.controller, equip, 'onEquip', { host });
    return true;
  }
  function onEquipHell(st, equip) {
    runTriggered(st, equip.controller, equip, 'onEquipHell', {});
    return true;
  }
  function onPaidAsCost(st, pIdx, paidList, targetName) {
    const summonTarget = st._summoning || null;
    paidList.forEach(c => {
      const abs = abilByTrigger(c, 'onPaidAsCost');
      abs.forEach(ab => {
        // human-controlled sides queue for manual pick; bot auto-runs
        if (humanSides.indexOf(pIdx) >= 0) {
          st.pendingChoices = st.pendingChoices || [];
          st.pendingChoices.push({ type: 'paidAsCost', owner: pIdx, uid: c.uid, abId: ab.id, targetName });
          E.slog(st, c.db.name + ' มีเอฟเฟคเมื่อถูกทิ้งจ่าย (รอเลือก)');
          return;
        }
        const ctx = { targetName, picks: autoPicksFor(st, pIdx, ab) };
        if (summonTarget) ctx.summonTargetUid = summonTarget.uid;
        runTriggered(st, pIdx, c, 'onPaidAsCost', ctx);
      });
    });
    return true;
  }
  function autoPicksFor(st, meIdx, ab) {
    // default picks for sim: resolve spec-based picks automatically
    const picks = {};
    (ab.picks || []).forEach(pk => {
      if (pk.kind === 'target') picks[pk.key || 'targetUid'] = autoPick(st, meIdx, pk.spec, pk.purpose);
      if (pk.kind === 'host') picks.hostUid = autoPick(st, meIdx, pk.spec, 'host');
    });
    if (ab.needsHost && !picks.hostUid) {
      const spec = ab.hostSpec || { side: 'mine', zone: 'avatar', nameContains: 'ไอดอล' };
      picks.hostUid = autoPick(st, meIdx, spec, 'host') ||
        autoPick(st, meIdx, { side: 'mine', zone: 'avatar' }, 'host');
    }
    if ((ab.cost && (ab.cost.discard || ab.cost.giveHandToFoe)) && !picks.discardUids) {
      const n = ab.cost.discard || ab.cost.giveHandToFoe;
      const sym = ab.cost.discardSymbol || ab.cost.discardAvatarSymbol;
      const needAvatar = !!ab.cost.discardAvatarSymbol;
      picks.discardUids = st.players[meIdx].hand.filter(c => (!sym || c.db.symbol === sym) && (!needAvatar || c.db.type === 'Avatar')).slice(0, n).map(c => c.uid);
    }
    if ((ab.cost && ab.cost.sendSymbolToHell) && !picks.sendUids) {
      const sym = ab.cost.sendSymbolToHell.symbol, n = ab.cost.sendSymbolToHell.n || 1;
      picks.sendUids = st.players[meIdx].avatar.filter(c => c.db.symbol === sym).concat(st.players[meIdx].hand.filter(c => c.db.symbol === sym)).slice(0, n).map(c => c.uid);
    }
    return picks;
  }
  function onMagicResolve(st, pIdx, card) {
    const sc = scriptOf(card);
    if (!sc || !(sc.abilities || []).some(a => a.kind === 'triggered' && a.trigger === 'onResolve')) {
      legacyMagic(st, pIdx, card);
      return true;
    }
    // extra cost already pre-paid by engine.playMagic (atomic GEM+discard before moving) — do not charge twice
    const prePaid = !!card._extraPaid;
    if (prePaid) delete card._extraPaid;
    runTriggered(st, pIdx, card, 'onResolve', { skipCost: prePaid });
    return true;
  }
  function ignoreMagicLimit(st, pIdx, card) {
    const sc = scriptOf(card);
    return sc && sc.ignoreMagicLimit === true;
  }
  function usableAsReact(st, pIdx, card) {
    const sc = scriptOf(card);
    return sc && sc.usableAsReact === true;
  }
  function onMainStart(st, cur) {
    eachBoard(st, (oi, c) => runTriggered(st, oi, c, 'mainStart', {}));
    return true;
  }
  function onBattleStart(st, cur) {
    eachBoard(st, (oi, c) => runTriggered(st, oi, c, 'battleStart', {}));
    return true;
  }
  function onEndStart(st, cur) {
    eachBoard(st, (oi, c) => runTriggered(st, oi, c, 'endStart', {}));
    return true;
  }
  function onBuilt(st, pIdx, card) {
    runTriggered(st, pIdx, card, 'onBuild', {});
    return true;
  }
  function onDelayed(st, ownerIdx, d) {
    // generic scheduled ops
    if (d.data && d.data.ops) {
      const src = { db: { name: d.data.name || 'delayed', print: d.data.print || '' }, buffs: [], equipped: [] };
      runOps(st, ownerIdx, src, d.data.ops, {});
      return true;
    }
    // LIFE delayed effects keyed by print
    const sc = (SCRIPTS()[d.data.print]) || null;
    const abs = sc ? (sc.abilities || []).filter(a => a.kind === 'triggered' && a.trigger === 'delayedLife') : [];
    if (!abs.length) { d.unresolved = true; return true; }
    abs.forEach(ab => {
      const p = st.players[ownerIdx];
      runOps(st, ownerIdx, { db: { name: d.data.name || 'LIFE', print: d.data.print }, buffs: [], equipped: [] }, ab.ops, autoPicksFor(st, ownerIdx, ab));
    });
    return true;
  }
  function onLifeFlipped(st, pIdx, lifeEntry) {
    const sup = st.lifeSuppress;
    if (sup && sup.owner !== pIdx && (st.turn * 2 + st.cur) <= sup.until) {
      E.slog(st, 'LIFE ' + lifeEntry.card.db.name + ' ถูกหงายแต่ความสามารถไม่ทำงาน');
      return true;
    }
    E.addDelayed(st, pIdx, 'LIFE ' + lifeEntry.card.db.name + ' (ออกผล Main ถัดไป)', { print: lifeEntry.card.db.print, name: lifeEntry.card.db.name });
    return true;
  }
  // continuous (Land included; both-side auras via match)
  function powerAura(inst, st) {
    let b = 0;
    const sources = [];
    st.players.forEach(p => {
      p.avatar.concat(p.magic, p.construct).forEach(src => sources.push(src));
    });
    if (st.land && st.land.card) sources.push(st.land.card);
    sources.forEach(src => {
      if (E.silenced && E.silenced(src, st)) return;
      const sc = scriptOf(src);
      (sc && sc.auras || []).forEach(a => {
        if (a.type === 'power' && a.match(st, src.controller, inst, src)) b += a.v;
      });
    });
    return b;
  }
  function powerSelf(inst, st) {
    const sc = scriptOf(inst);
    let b = 0;
    (sc && sc.selfPer || []).forEach(rule => {
      b += rule.v * countPer(st, inst.controller, rule.per);
    });
    return b;
  }
  function countPer(st, me, per) {
    if (per === 'tappedBoth') {
      let n = 0;
      st.players.forEach(p => p.avatar.forEach(a => { if (a.tapped) n++; }));
      return n;
    }
    if (per === 'lifeOpenMine') return st.players[me].life.filter(l => l.open).length;
    if (per && per.hellName) return st.players[me].hell.filter(c => (c.db.name || '').includes(per.hellName)).length;
    if (per && per.boardHandMine) {
      const p = st.players[me];
      return p.avatar.length + p.construct.length + p.hand.length;
    }
    if (per && per.modBoard) {
      let n = 0;
      st.players.forEach(p => {
        p.avatar.forEach(a => (a.equipped || []).forEach(e => { if (e.db.type === 'Magic' && e.db.subtype === 'Modification') n++; }));
      });
      return n;
    }
    return 0;
  }
  function summonBan(st, card) {
    const sc = scriptOf(card);
    if (sc && (sc.summonBanFrom || []).indexOf('hand') >= 0) return 'ห้ามลงสนามจากบนมือ';
    return null;
  }
  let cardDB = [];
  function setCardDB(rows) { cardDB = rows || []; }
  function controlsName(st, ctrl, name) {
    if (!st) return false;
    const p = st.players[ctrl];
    if (p.avatar.concat(p.construct).some(c => (c.db.name || '').includes(name))) return true;
    return !!(st.land && st.land.owner === ctrl && (st.land.card.db.name || '').includes(name));
  }
  function evalEquipRules(equipInst, host, st) {
    const sc = scriptOf(equipInst);
    let b = 0, any = false;
    (sc && sc.equipBonus || []).forEach(rule => {
      if (rule.hostName && !(host.db.name || '').includes(rule.hostName)) return;
      if (rule.requireControl && !controlsName(st, host.controller, rule.requireControl)) return;
      if (typeof rule.match === 'function' && !rule.match(host)) return;
      any = true;
      b += (typeof rule.v === 'function' ? rule.v(host) : rule.v);
    });
    return { any, b };
  }
  function equipBonusExtra(c) {
    // legacy st-free path; skips scripted equips (override covers them) to avoid double count
    let b = 0;
    (c.equipped || []).forEach(e => {
      const sc = scriptOf(e);
      if (sc && sc.equipBonus) return;
      (sc && sc.equipBonus || []).forEach(rule => {
        if (rule.requireControl) return;
        if (rule.hostName && !(c.db.name || '').includes(rule.hostName)) return;
        if (typeof rule.match === 'function' && !rule.match(c)) return;
        b += (typeof rule.v === 'function' ? rule.v(c) : rule.v);
      });
    });
    return b;
  }
  // per-equip override (replaces generic parse; supports conditional power)
  function equipBonusOverride(equipInst, host, st) {
    const sc = scriptOf(equipInst);
    if (!sc || !sc.equipBonus) return undefined;
    return evalEquipRules(equipInst, host, st).b;
  }
  function untargetable(st, atkOwnerIdx, def) {
    let no = false;
    st.players.forEach(p => {
      p.avatar.concat(p.magic, p.construct).forEach(src => {
        const sc = scriptOf(src);
        (sc && sc.untarget || []).forEach(rule => {
          if (rule.match(st, src, def)) no = true;
        });
      });
    });
    return no;
  }
  function gemLimitFor() { return undefined; } // engine hashtag fallback handles it
  function destroyProtected(st, inst) {
    const sc = scriptOf(inst);
    return !!(sc && sc.destructible && sc.destructible.ability === false);
  }
  function abilityUntargetable(st, meIdx, target) {
    // true if target is protected vs meIdx's card abilities (protector covers its own side)
    if (!target || target.controller === meIdx) return false;
    const sources = [];
    st.players.forEach(p => {
      p.avatar.concat(p.magic, p.construct).forEach(src => sources.push(src));
    });
    if (st.land) sources.push(st.land.card);
    for (const src of sources) {
      if (E.silenced && E.silenced(src, st)) continue;
      const sc = scriptOf(src);
      for (const rule of (sc && sc.abilityUntarget) || []) {
        if (rule.match && !rule.match(st, src, target, meIdx)) continue;
        if (rule.nameContains && !(target.db.name || '').includes(rule.nameContains)) continue;
        if (rule.symbol && target.db.symbol !== rule.symbol) continue;
        if (target.controller !== src.controller) continue;
        return true;
      }
    }
    return false;
  }
  function equipGrants(c) {
    const out = [];
    (c.equipped || []).forEach(e => {
      const sc = scriptOf(e);
      (sc && sc.equipGrants || []).forEach(k => { if (out.indexOf(k) < 0) out.push(k); });
    });
    return out;
  }

  // ---------- response windows (resumable, unified legality/payment/limits) ----------
  // ev types: magicPlayed, avatarSummoned, attackTargeted, abilityUsed, reactPlayed
  // Responders: hand Reacts + board triggered with responseTo. Order: foe of ev owner first.
  let _evSeq = 1;
  function ensureEvId(ev) {
    if (!ev.id) ev.id = _evSeq++;
    return ev.id;
  }
  function onEvent(st, ev) {
    ensureEvId(ev);
    st._evStack = st._evStack || [];
    if (st._evStack.indexOf(ev) < 0) st._evStack.push(ev);
    for (let depth = 0; depth < 6; depth++) {
      const r = findResponse(st, ev);
      if (!r) break;
      if (r === 'queued') { st._pendingEv = ev; return 'queued'; }
      const dr = doResponse(st, ev, r);
      if (dr && dr.queued) { st._pendingEv = ev; return 'queued'; }
      if (ev.cancelled || ev.negated) break;
      // allow chaining: responses to the response (counter-responses before parent effects)
      const nEv = { type: r.ab && r.ab.responseTo === 'react' ? 'reactPlayed' : 'abilityUsed', source: r.inst, owner: r.me, cancelled: false, prevEv: ev };
      ensureEvId(nEv);
      st._evStack.push(nEv);
      const nr = findResponse(st, nEv);
      if (!nr) {
        // no counter, continue outer loop for more responses to original ev
        st._evStack.pop();
        continue;
      }
      if (nr === 'queued') { st._pendingEv = nEv; st._counterFor = ev.id; return 'queued'; }
      doResponse(st, nEv, nr);
      st._evStack.pop();
      if (nEv.cancelled || nEv.negated) break;
    }
    return true;
  }
  // UI: peek top N of a deck (for scry pickers)
  function peekTop(st, meIdx, n) {
    return st.players[meIdx].main.slice(0, n).map(c => ({ uid: c.uid, name: c.db.name, print: c.db.print }));
  }
  function findResponse(st, ev) {
    ensureEvId(ev);
    const order = ev.owner !== undefined ? [1 - ev.owner, ev.owner] : [1 - st.cur, st.cur];
    for (const me of order) {
      const p = st.players[me];
      // hand reacts
      for (const c of p.hand.slice()) {
        const sc = scriptOf(c);
        const ab = (sc && sc.abilities || []).find(a => a.kind === 'response' && a.responseTo && matchResponse(a, ev, st, me, c) && canUseResponse(st, me, c, a, ev));
        if (ab) {
          if (humanSides.indexOf(me) >= 0 && !ev._force) {
            const key = ev.id + ':' + me + ':' + c.uid + ':' + ab.id;
            st._passedResponses = st._passedResponses || {};
            if (st._passedResponses[ev.id] && st._passedResponses[ev.id].indexOf(key) >= 0) continue;
            if ((st.pendingResponses || []).some(r => r.key === key)) continue;
            queueHumanResponse(st, ev, me, c, ab, true);
            // queue may have been skipped due to pass; only return queued if actually queued
            if ((st.pendingResponses || []).some(r => r.key === key)) return 'queued';
            continue;
          }
          return { me, inst: c, ab, fromHand: true };
        }
      }
      // board responses
      const zones = p.avatar.concat(p.magic, p.construct);
      for (const c of zones.slice()) {
        const sc = scriptOf(c);
        const ab = (sc && sc.abilities || []).find(a => a.kind === 'response' && a.responseTo && matchResponse(a, ev, st, me, c) && canUseResponse(st, me, c, a, ev));
        if (ab) {
          if (humanSides.indexOf(me) >= 0 && !ev._force) {
            const key = ev.id + ':' + me + ':' + c.uid + ':' + ab.id;
            st._passedResponses = st._passedResponses || {};
            if (st._passedResponses[ev.id] && st._passedResponses[ev.id].indexOf(key) >= 0) continue;
            if ((st.pendingResponses || []).some(r => r.key === key)) continue;
            queueHumanResponse(st, ev, me, c, ab, false);
            if ((st.pendingResponses || []).some(r => r.key === key)) return 'queued';
            continue;
          }
          return { me, inst: c, ab, fromHand: false };
        }
      }
    }
    return null;
  }
  function queueHumanResponse(st, ev, me, inst, ab, fromHand) {
    ensureEvId(ev);
    st.pendingResponses = st.pendingResponses || [];
    const key = ev.id + ':' + me + ':' + inst.uid + ':' + ab.id;
    if (st.pendingResponses.some(r => r.key === key)) return;
    st._passedResponses = st._passedResponses || {};
    if (st._passedResponses[ev.id] && st._passedResponses[ev.id].indexOf(key) >= 0) return;
    st.pendingResponses.push({ key, me, uid: inst.uid, abId: ab.id, fromHand, evType: ev.type, evId: ev.id });
    E.slog(st, inst.db.name + ' มีจังหวะสวน (รอผู้เล่นเลือก)');
  }
  function effectiveReactSub(st, me, inst) {
    const sub = inst.db.subtype || 'React';
    if (sub === 'React') return 'React';
    if (usableAsReact(st, me, inst) === true) return 'React';
    return sub;
  }
  function autoGemUids(st, me, inst) {
    const need = inst.db.cost || 0;
    if (!need) return [];
    const p = st.players[me];
    const cands = p.hand.filter(c => c.uid !== inst.uid && (c.db.gem || 0) > 0 &&
      (!(c.db.gemColor) || !inst.db.color || c.db.gemColor === inst.db.color));
    cands.sort((a, b) => (b.db.gem || 0) - (a.db.gem || 0));
    const pay = []; let sum = 0;
    for (const c of cands) { if (sum >= need) break; pay.push(c); sum += c.db.gem; }
    if (sum < need) return null;
    for (;;) {
      let removed = false;
      for (let i = pay.length - 1; i >= 0; i--) {
        const rest = pay.slice(0, i).concat(pay.slice(i + 1));
        const s = rest.reduce((x, c) => x + c.db.gem, 0);
        if (s >= need) { pay.splice(i, 1); removed = true; break; }
      }
      if (!removed) break;
    }
    const chk = E.checkPay(st, p, need, inst.db.color || '', pay, inst.db.name, inst.uid);
    return chk.ok ? pay.map(c => c.uid) : null;
  }
  // Shared validation for React legality+payment+limits (mutation-free). Used by doResponse + resolveQueued + direct plays.
  function validateReact(st, me, inst, ab, ev, picks, payUids) {
    picks = picks || {};
    if (st.winner) return { ok: false, error: 'เกมจบแล้ว' };
    if (!canUseResponse(st, me, inst, ab, ev)) return { ok: false, error: 'สวนไม่ได้ตอนนี้' };
    // React locks
    if (inst.db.type === 'Magic') {
      if (st.noReactMagic && st.noReactMagic.owner === me && (st.turn * 2 + st.cur) <= st.noReactMagic.until) {
        return { ok: false, error: 'ถูกห้ามใช้ React Magic อยู่' };
      }
      if (st.reactLock && st.reactLock.foe === me && (st.battleCount || 0) === st.reactLock.n) {
        return { ok: false, error: 'ถูกล็อก React' };
      }
      const ign = ignoreMagicLimit(st, me, inst) === true;
      const eff = effectiveReactSub(st, me, inst);
      if (!ign && (st.players[me].magicUsed[eff] || 0) >= 1) return { ok: false, error: 'ใช้ ' + eff + ' ไปแล้ว' };
      // GEM costs (Normal/React/Modification/Land as React)
      const need = inst.db.cost || 0;
      let pu = payUids;
      if (pu === undefined) pu = picks.payUids;
      if (pu === undefined && need > 0) {
        // bot auto-select
        pu = autoGemUids(st, me, inst);
        if (pu === null) return { ok: false, error: 'GEM ไม่พอ' };
        picks.payUids = pu;
      }
      pu = pu || [];
      if (pu.indexOf(inst.uid) >= 0) return { ok: false, error: 'ใช้การ์ดตัวเองจ่ายไม่ได้' };
      if (new Set(pu).size !== pu.length) return { ok: false, error: 'เลือก GEM ซ้ำ' };
      const plist = pu.map(u => st.players[me].hand.find(c => c.uid === u));
      if (plist.some(c => !c)) return { ok: false, error: 'GEM stale' };
      const chk = E.checkPay(st, st.players[me], need, inst.db.color || '', plist, inst.db.name, inst.uid);
      if (!chk.ok) return chk;
    }
    if (ab.cost && Object.keys(ab.cost).length) {
      // auto-fill destroyEquipped for bot if missing
      if (ab.cost.destroyEquipped && !picks.equipUid) {
        const nc = ab.cost.destroyEquipped.nameContains;
        outer: for (const a of st.players[me].avatar) for (const e of a.equipped) {
          if (!nc || (e.db.name || '').includes(nc)) { picks.equipUid = e.uid; break outer; }
        }
      }
      const v = validateCostAb(st, me, inst, ab.cost, picks);
      if (!v.ok) return v;
    }
    return { ok: true };
  }
  function commitReactGem(st, me, inst, payUids) {
    const need = inst.db.cost || 0;
    if (!need && !(payUids && payUids.length)) return { ok: true };
    const p = st.players[me];
    const plist = (payUids || []).map(u => p.hand.find(c => c.uid === u)).filter(Boolean);
    return E.payCost(st, p, need, inst.db.color || '', plist, inst.db.name, inst.uid);
  }
  // UI: run a triggered ability manually (e.g. queued paidAsCost choices)
  function execTriggered(st, meIdx, instUid, abId, picks) {
    const blk = E.responsePending ? (E.responsePending(st) ? { ok: false, error: 'รอการตัดสินใจสวนก่อน' } : null) : null;
    if (blk) return blk;
    const inst = findInst(st, instUid);
    if (!inst) return { ok: false, error: 'ไม่เจอการ์ด' };
    const sc = scriptOf(inst);
    const ab = sc && (sc.abilities || []).find(a => a.id === abId && a.kind === 'triggered');
    if (!ab) return { ok: false, error: 'ไม่มีความสามารถนี้' };
    const v = validateCostAb(st, meIdx, inst, ab.cost || {}, picks || {});
    if (!v.ok) return v;
    markUsed(st, inst, ab);
    commitCostAb(st, meIdx, inst, ab.cost || {}, picks || {}, v);
    runOps(st, meIdx, inst, ab.ops || [], picks || {});
    return { ok: true };
  }
  function evForQueue(st, q) {
    if (!q) return null;
    if (st._evStack) {
      const f = st._evStack.find(e => e.id === q.evId);
      if (f) return f;
    }
    if (st._pendingEv && st._pendingEv.id === q.evId) return st._pendingEv;
    return st._pendingEv || null;
  }
  function resumeIfDone(st, evId) {
    st.pendingResponses = st.pendingResponses || [];
    const still = st.pendingResponses.some(r => r.evId === evId);
    if (still) return { resumed: false, pending: true };
    // no more responses for this event: find next response via onEvent before resuming frame?
    // check for additional responses that became available (e.g. after a use, new responders)
    const ev = (st._evStack || []).find(e => e.id === evId) || st._pendingEv;
    if (ev && !ev.cancelled && !ev.negated) {
      // try to find next human/bot response for same ev (e.g. second player)
      // Temporarily clear _pendingEv to avoid self-loop? findResponse will queue if human.
      const before = (st.pendingResponses || []).length;
      const r2 = findResponse(st, ev);
      if (r2 === 'queued') return { resumed: false, pending: true };
      if (r2) {
        doResponse(st, ev, r2);
        if ((st.pendingResponses || []).some(x => x.evId === evId || x.evId === (st._pendingEv && st._pendingEv.id))) {
          return { resumed: false, pending: true };
        }
        // bot response done, loop to check more
        return resumeIfDone(st, evId);
      }
    }
    // resume suspended frame(s) for this ev exactly once
    st._frames = st._frames || [];
    const idx = st._frames.findIndex(f => f.evId === evId);
    if (idx < 0) {
      // cleanup passed + pendingEv if no frame
      if (st._pendingEv && st._pendingEv.id === evId) {
        st._evStack = (st._evStack || []).filter(e => e.id !== evId);
        if (st._counterFor === evId) delete st._counterFor;
        else st._pendingEv = st._evStack.length ? st._evStack[st._evStack.length - 1] : null;
      }
      return { resumed: false, pending: false };
    }
    const frame = st._frames.splice(idx, 1)[0];
    // cleanup passed for this ev after resume (keep for dedupe within same ev? already done)
    let ok = false;
    try {
      if (frame.kind === 'magicResolve') ok = E.completeMagicResolve(st, frame);
      else if (frame.kind === 'summonJuti') ok = E.completeSummonJuti(st, frame);
      else if (frame.kind === 'attackResolve') {
        ok = true;
        if (typeof window !== 'undefined' && window.resumeAttackFrame) {
          window.resumeAttackFrame(st, frame);
        }
      } else if (frame.kind === 'abilityOps') {
        const inst = findInst(st, frame.instUid);
        if (inst) runOps(st, frame.me, inst, frame.ops, frame.picks || {});
        ok = true;
      } else if (frame.kind === 'attackSteps') {
        ok = true;
      }
    } catch (e) { ok = false; }
    // pop ev stack
    st._evStack = (st._evStack || []).filter(e => e.id !== evId);
    if (st._passedResponses && st._passedResponses[evId]) delete st._passedResponses[evId];
    if (st._pendingEv && st._pendingEv.id === evId) {
      st._pendingEv = st._evStack.length ? st._evStack[st._evStack.length - 1] : null;
    }
    // after resuming, the completed effect may have emitted new events with their own pending; leave them
    return { resumed: true, pending: !!((st.pendingResponses || []).length) };
  }
  // UI calls after resolving/passing a queued response (preserves queue on validation failure)
  function resolveQueued(st, key, use, picks) {
    picks = picks || {};
    st.pendingResponses = st.pendingResponses || [];
    const i = st.pendingResponses.findIndex(r => r.key === key);
    if (i < 0) return { ok: false, error: 'ไม่พบคิวสวน' };
    const q = st.pendingResponses[i];
    const ev = evForQueue(st, q);
    if (!use) {
      // pass scoped to individual event
      st.pendingResponses.splice(i, 1);
      st._passedResponses = st._passedResponses || {};
      st._passedResponses[q.evId] = st._passedResponses[q.evId] || [];
      st._passedResponses[q.evId].push(key);
      E.slog(st, 'ผ่านสวน (' + q.evType + ')');
      const res = resumeIfDone(st, q.evId);
      return { ok: true, passed: true, resumed: res.resumed, pending: res.pending };
    }
    const inst = findInst(st, q.uid);
    const sc = inst && scriptOf(inst);
    const ab = sc && (sc.abilities || []).find(a => a.id === q.abId);
    if (!inst || !ab) return { ok: false, error: 'การ์ดไม่อยู่แล้ว' };
    // unified validation BEFORE commitment (limits, locks, GEM, additional costs). Queue preserved on failure.
    const payUids = picks.payUids || [];
    const v = validateReact(st, q.me, inst, ab, ev, picks, payUids);
    if (!v.ok) return v;
    // commitment: consume exactly once
    st.pendingResponses.splice(i, 1);
    const p = st.players[q.me];
    let effSub = null, ign = false;
    if (inst.db.type === 'Magic' && q.fromHand) {
      effSub = effectiveReactSub(st, q.me, inst);
      ign = ignoreMagicLimit(st, q.me, inst) === true;
      if (!ign) p.magicUsed[effSub] = (p.magicUsed[effSub] || 0) + 1;
      // GEM
      const cg = commitReactGem(st, q.me, inst, payUids);
      if (!cg.ok) {
        if (!ign) p.magicUsed[effSub] = Math.max(0, (p.magicUsed[effSub] || 1) - 1);
        // re-queue on unexpected commit failure
        st.pendingResponses.splice(i, 0, q);
        return cg;
      }
      const hi = p.hand.indexOf(inst);
      if (hi < 0) {
        if (!ign) p.magicUsed[effSub] = Math.max(0, (p.magicUsed[effSub] || 1) - 1);
        st.pendingResponses.splice(i, 0, q);
        return { ok: false, error: 'การ์ดไม่อยู่แล้ว (stale)' };
      }
      p.hand.splice(hi, 1);
      p.magic.push(inst);
      inst.controller = q.me;
    }
    // ability usage (failed attempts do not mark: we already validated)
    markUsed(st, inst, ab);
    if (ab.cost && Object.keys(ab.cost).length) {
      const cc = commitCostAb(st, q.me, inst, ab.cost, picks, validateCostAb(st, q.me, inst, ab.cost, picks));
      if (!cc.ok) {
        // rollback magic move? put back
        if (q.fromHand && inst.db.type === 'Magic') {
          const mi = p.magic.indexOf(inst);
          if (mi >= 0) p.magic.splice(mi, 1);
          p.hand.push(inst);
          if (!ign) p.magicUsed[effSub] = Math.max(0, (p.magicUsed[effSub] || 1) - 1);
        }
        st.pendingResponses.splice(i, 0, q);
        return cc;
      }
    } else if (ab.cost) {
      // empty cost ok
    }
    const pk = Object.assign({}, picks, { ev });
    if (!pk.targetUid && ev) {
      if (ev.source) pk.targetUid = ev.source.uid;
      else if (ev.card) pk.targetUid = ev.card.uid;
      else if (ev.atk) pk.targetUid = ev.atk.uid;
      else if (ev.target && ev.target.kind === 'avatar') pk.targetUid = ev.target.uid;
    }
    if (!pk.hostUid && ev && ev.target && ev.target.kind === 'avatar') pk.hostUid = ev.target.uid;
    if (!pk.targetUid && ev && ev.type === 'battleStarted' && ab.responseTo === 'battle') {
      const b = (ev.atk && ev.atk.controller === q.me) ? ev.atk : ev.def;
      if (b) pk.targetUid = b.uid;
    }
    // event-bound targeting for summon responses (SD01-017): prefer summoned card when no explicit pick
    if (!picks.targetUid && ev && ev.type === 'avatarSummoned' && ev.card) {
      pk.targetUid = ev.card.uid;
    }
    E.slog(st, inst.db.name + ' สวน (' + (ab.name || ab.responseTo) + ')');
    // counter-response window for this response BEFORE parent effects (nested ops suspend if human)
    const counterEv = { type: ab.responseTo === 'react' ? 'reactPlayed' : 'abilityUsed', source: inst, owner: q.me, cancelled: false, prevEv: ev };
    ensureEvId(counterEv);
    st._evStack = st._evStack || [];
    st._evStack.push(counterEv);
    const cr = findResponse(st, counterEv);
    if (cr === 'queued') {
      // suspend current response ops until counter resolved; store continuation
      st._frames = st._frames || [];
      st._frames.push({ evId: counterEv.id, kind: 'abilityOps', me: q.me, instUid: inst.uid, abId: ab.id, ops: ab.ops || [], picks: pk, parentEvId: ev ? ev.id : null, fromHand: q.fromHand });
      st._pendingEv = counterEv;
      // also keep parent ev pending? parent still has frame; counter must resolve first
      // run remaining parent resume after counter done (handled via parentEvId chaining in resume)
      // For now, run ops after counter? No: suspend ops.
      // Mark that parent resume waits for counter: link frames
      return { ok: true, pending: true, counterEvId: counterEv.id };
    }
    if (cr) {
      doResponse(st, counterEv, cr);
      st._evStack.pop();
    } else {
      st._evStack.pop();
    }
    runOps(st, q.me, inst, ab.ops || [], pk);
    if (q.fromHand && inst.db.type === 'Magic') {
      const mi = p.magic.indexOf(inst);
      if (mi >= 0) p.magic.splice(mi, 1);
      if (p.hell.indexOf(inst) < 0) p.hell.push(inst);
    }
    // check for more responses to parent ev, else resume parent frame exactly once
    const res = resumeIfDone(st, q.evId);
    return { ok: true, resumed: res.resumed, pending: res.pending };
  }
  function matchResponse(ab, ev, st, me, inst) {
    if (ab.responseTo === 'magic' && ev.type === 'magicPlayed' && ev.owner !== me) {
      if (ab.match && !ab.match(st, me, inst, ev)) return false;
      if (ab.matchSubtype && (!ev.source || ev.source.db.subtype !== ab.matchSubtype)) return false;
      if (ab.matchMagicName && (!ev.source || !(ev.source.db.name || '').includes(ab.matchMagicName))) return false;
      return true;
    }
    if (ab.responseTo === 'summon' && ev.type === 'avatarSummoned' && ev.owner !== me) {
      if (ab.match && !ab.match(st, me, inst, ev)) return false;
      return true;
    }
    if (ab.responseTo === 'attackTarget' && ev.type === 'attackTargeted' && ev.owner !== me) {
      if (ab.match && !ab.match(st, me, inst, ev)) return false;
      if (ab.matchTargetIdolMine) {
        if (!ev.target || ev.target.kind !== 'avatar') return false;
        const t = st.players[me].avatar.find(a => a.uid === ev.target.uid);
        if (!t || !(t.db.name || '').includes('ไอดอล')) return false;
      }
      return true;
    }
    if (ab.responseTo === 'ability' && ev.type === 'abilityUsed' && ev.owner !== me) return true;
    if (ab.responseTo === 'kill' && ev.type === 'killDone' && ev.owner === me) {
      if (inst.controller !== ev.owner) return false;
      if (ab.match && !ab.match(st, me, inst, ev)) return false;
      return true;
    }
    if (ab.responseTo === 'battle' && ev.type === 'battleStarted') {
      if (ab.match && !ab.match(st, me, inst, ev)) return false;
      if (ab.mineOnly && ev.owner !== me) return false;
      return true;
    }
    if (ab.responseTo === 'react' && (ev.type === 'reactPlayed' || (ev.type === 'magicPlayed' && ev.isReact)) && ev.owner !== me) return true;
    if (ab.responseTo === 'leaving' && ev.type === 'avatarLeaving' && !ev.cancelled) {
      if (ab.match && !ab.match(st, me, inst, ev)) return false;
      if (ab.selfOnly && ev.inst.uid !== inst.uid) return false;
      if (ab.matchName && (!(ev.inst.db.name || '').includes(ab.matchName) || ev.inst.controller !== me || ev.inst.uid === inst.uid)) return false;
      if (ab.equippedOnly && (inst.equippedTo === null || inst.equippedTo === undefined)) return false;
      return true;
    }
    if (ab.responseTo === 'battleDestroyed' && ev.type === 'avatarLeaving' && !ev.cancelled) {
      if (ev.owner !== me) return false;
      if (!/ต่อสู้|โจมตี/.test(ev.reason || '')) return false;
      if (ab.match && !ab.match(st, me, inst, ev)) return false;
      return true;
    }
    return false;
  }
  function canUseResponse(st, me, inst, ab, ev) {
    if (st.winner) return false;
    if (st.noReactMagic && st.noReactMagic.owner === me && (st.turn * 2 + st.cur) <= st.noReactMagic.until) {
      if (inst.db.type === 'Magic') return false;
    }
    if (st.reactLock && st.reactLock.foe === me && (st.battleCount || 0) === st.reactLock.n) {
      // locked: cannot play React Magic responses
      if (inst.db.type === 'Magic') return false;
    }
    if ((ab.oncePerTurn || ab.perBattle || ab.perSummon) && inst.fxUsed[ab.id] === usedKey(st, ab, inst)) return false;
    if (E.silenced && E.silenced(inst, st) && !ab.fromHandOK) {
      // hand cards aren't silenced; board cards are
      if (!ab.fromHand && st.players[me].hand.indexOf(inst) < 0) return false;
    }
    if (ab.fromHand && st.players[me].hand.indexOf(inst) < 0) return false;
    return true;
  }
  function doResponse(st, prevEv, r) {
    // Unified path: same validation/commitment/limits as human (resolveQueued). Bot auto-selects GEM + picks.
    const p = st.players[r.me];
    const picks = Object.assign(autoPicksFor(st, r.me, r.ab), { ev: prevEv });
    // auto GEM for bot
    let payUids = null;
    if (r.fromHand && r.inst.db.type === 'Magic' && (r.inst.db.cost || 0) > 0) {
      payUids = autoGemUids(st, r.me, r.inst);
      if (payUids === null) { E.slog(st, r.inst.db.name + ' GEM ไม่พอ สวนไม่ได้'); return { ok: false }; }
      picks.payUids = payUids;
    }
    const v = validateReact(st, r.me, r.inst, r.ab, prevEv, picks, payUids === null ? [] : payUids);
    if (!v.ok) { E.slog(st, r.inst.db.name + ' สวนไม่ได้: ' + v.error); return { ok: false, error: v.error }; }
    // commitment (limits first, then GEM, then ability cost) — exceeded limits consume nothing (validated above)
    let effSub = null, ign = false;
    if (r.fromHand && r.inst.db.type === 'Magic') {
      effSub = effectiveReactSub(st, r.me, r.inst);
      ign = ignoreMagicLimit(st, r.me, r.inst) === true;
      if (!ign) p.magicUsed[effSub] = (p.magicUsed[effSub] || 0) + 1;
      if (payUids && payUids.length) {
        const cg = commitReactGem(st, r.me, r.inst, payUids);
        if (!cg.ok) {
          if (!ign) p.magicUsed[effSub] = Math.max(0, (p.magicUsed[effSub] || 1) - 1);
          return { ok: false, error: cg.error };
        }
      } else if ((r.inst.db.cost || 0) > 0) {
        // zero-length but cost>0 should have been caught; be safe
        const cg = commitReactGem(st, r.me, r.inst, []);
        if (!cg.ok) {
          if (!ign) p.magicUsed[effSub] = Math.max(0, (p.magicUsed[effSub] || 1) - 1);
          return { ok: false, error: cg.error };
        }
      }
      const hi = p.hand.indexOf(r.inst);
      if (hi < 0) {
        if (!ign) p.magicUsed[effSub] = Math.max(0, (p.magicUsed[effSub] || 1) - 1);
        return { ok: false };
      }
      p.hand.splice(hi, 1);
      p.magic.push(r.inst);
      r.inst.controller = r.me;
      E.slog(st, r.inst.db.name + ' สวน (' + (r.ab.name || r.ab.responseTo) + ')');
    } else {
      E.slog(st, r.inst.db.name + ' สวน (' + (r.ab.name || r.ab.responseTo) + ')');
    }
    markUsed(st, r.inst, r.ab);
    if (r.ab.cost && Object.keys(r.ab.cost).length) {
      const cc = commitCostAb(st, r.me, r.inst, r.ab.cost, picks, validateCostAb(st, r.me, r.inst, r.ab.cost, picks));
      if (!cc.ok) {
        // rollback hand move + limit on failure (should not happen after validation)
        if (r.fromHand && r.inst.db.type === 'Magic') {
          const mi = p.magic.indexOf(r.inst);
          if (mi >= 0) p.magic.splice(mi, 1);
          p.hand.push(r.inst);
          if (!ign) p.magicUsed[effSub] = Math.max(0, (p.magicUsed[effSub] || 1) - 1);
        }
        return { ok: false, error: cc.error };
      }
    }
    if (!picks.targetUid && picks.ev) {
      if (picks.ev.source) picks.targetUid = picks.ev.source.uid;
      else if (picks.ev.card) picks.targetUid = picks.ev.card.uid;
      else if (picks.ev.atk) picks.targetUid = picks.ev.atk.uid;
      else if (picks.ev.target && picks.ev.target.kind === 'avatar') picks.targetUid = picks.ev.target.uid;
    }
    // event-bound targeting for summon (SD01-017): summoned card
    if (!picks.targetUid && picks.ev && picks.ev.type === 'avatarSummoned' && picks.ev.card) {
      picks.targetUid = picks.ev.card.uid;
    }
    if (!picks.hostUid && picks.ev && picks.ev.target && picks.ev.target.kind === 'avatar') picks.hostUid = picks.ev.target.uid;
    if (!picks.targetUid && picks.ev && picks.ev.type === 'battleStarted' && r.ab.responseTo === 'battle') {
      const b = (picks.ev.atk && picks.ev.atk.controller === r.me) ? picks.ev.atk : picks.ev.def;
      if (b) picks.targetUid = b.uid;
    }
    // abilityUsed event for the response itself (chain) is handled by onEvent loop via returned ev
    runOps(st, r.me, r.inst, r.ab.ops || [], picks);
    if (r.fromHand && r.inst.db.type === 'Magic') {
      const i = p.magic.indexOf(r.inst);
      if (i >= 0) p.magic.splice(i, 1);
      if (p.hell.indexOf(r.inst) < 0) p.hell.push(r.inst);
    }
    return { ok: true };
  }

  return {
    install, setHumanSides, listActivated, execActivated, execTriggered, runOps, autoPick, listTargets, findInst, autoPicksFor,
    peekTop, resolveQueued, validateReact, commitReactGem, validateCostAb, commitCostAb, payCostAb,
    resumeIfDone, evForQueue, autoGemUids, effectiveReactSub,
    onSummoned, onDestroyed, onEquipped, onEquipHell, onPaidAsCost, onBuilt, onAttack, onKill, onBattle, onTargeted, onWearerAttack,
    onMagicResolve, onEvent,
    onMainStart, onEndStart, onDrawEnd, onBattleStart, onDelayed, onLifeFlipped, ignoreMagicLimit, usableAsReact,
      powerAura, powerSelf, equipBonusExtra, equipBonusOverride, untargetable, gemLimitFor, equipGrants, costBanHit, attackBan,
      summonBan, setCardDB, destroyProtected, magicExtraCost, validateAbCost, commitAbCost, hasOnAttackScript,
  };
});
