/* Battle of Talingchan - Hand-written card scripts (idol deck first).
 * Format per print: { abilities:[...], auras:[...], equipBonus:[...], untarget:[...],
 *   ignoreMagicLimit:bool, usableAsReact:bool }
 * Ability: {id, kind:'activated'|'triggered'|'response', trigger, responseTo,
 *   oncePerTurn, phases, turn:'mine'|'foe', location:'hand', cost, ops, choose,
 *   bothWhen, needsHost, cond, match, name}
 * Op see effects.js runOps. picks keys: targetUid, hostUid, discardUids,
 *   sacrificeUid, exileUid, equipUid, scryChosen, scryDest, scryRest,
 *   summonUid, equipToUid, destUid, choice.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else {
    root.BoTCardScripts = root.BoTCardScripts || {};
    Object.assign(root.BoTCardScripts, factory());
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const OTA = { type: 'Avatar', nameContains: 'โอตะ' };
  const IDOL_MINE = { side: 'mine', zone: 'avatar', nameContains: 'ไอดอล' };
  function hasTat(st, me) {
    return st.players[me].avatar.some(a => (a.db.name || '').includes('ทัตดนัยซัง'));
  }
  function idolTarget(st, me, inst, ev) {
    if (!ev || !ev.target || ev.target.kind !== 'avatar') return false;
    const t = st.players[me].avatar.find(a => a.uid === ev.target.uid);
    return !!(t && (t.db.name || '').includes('ไอดอล'));
  }

  return {
    // ---------- SD01 paid-summon gating + legal sides (HAND wins over AUTO) ----------
    'SD01-001': { abilities: [
      { id: 'j', kind: 'triggered', trigger: 'juti', condData: { byCost: true },
        ops: [{ op: 'buff', v: -4, spec: { side: 'either', zone: 'avatar' }, until: 'endTurn' }] },
    ]},
    'SD01-002': { abilities: [
      { id: 'atk', kind: 'triggered', trigger: 'onAttack',
        ops: [{ op: 'buffSelf', v: 2 }] },
    ]},
    'SD01-003': { abilities: [
      { id: 'j', kind: 'triggered', trigger: 'juti', condData: { byCost: true },
        ops: [{ op: 'buff', v: 3, spec: { side: 'either', zone: 'avatar' }, until: 'endTurn' }] },
    ]},
    'SD01-005': { abilities: [
      { id: 'j', kind: 'triggered', trigger: 'juti', condData: { byCost: true },
        ops: [{ op: 'draw', n: 3, who: 'me' }] },
    ]},
    'SD01-018': { abilities: [
      { id: 'a', kind: 'triggered', trigger: 'onResolve',
        cost: { discard: 1, discardSymbol: 'เทพ', discardAvatarSymbol: 'เทพ' },
        ops: [{ op: 'draw', n: 2, who: 'me' }] },
    ]},
    'SD01-019': { abilities: [
      { id: 'a', kind: 'triggered', trigger: 'onResolve',
        ops: [{ op: 'buff', v: 2, spec: { side: 'either', zone: 'avatar', symbol: 'เทพ' }, until: 'endTurn' }] },
    ]},
    // ---------- BT01-038 ความเจริญ ----------
    'BT01-038': { abilities: [
      { id: 'r', kind: 'triggered', trigger: 'onResolve', ops: [{ op: 'draw', n: 2, who: 'me' }] },
    ]},
    // ---------- BT01-041 ชายจากอนาคต ----------
    'BT01-041': { abilities: [
      { id: 'neg', name: 'ยกเลิก Magic', kind: 'response', responseTo: 'magic', ops: [{ op: 'negateEvent' }] },
    ]},
    // ---------- BT02-009 / KD03-003 / PRMO-011 (จุติหาโอตะสวมใส่) ----------
    'BT02-009': { abilities: [
      { id: 'j', kind: 'triggered', trigger: 'juti', ops: [
        { op: 'search', where: 'deckMine', filter: OTA, n: 1, to: 'equipSelf', shuffleAfter: true },
      ]},
    ]},
    'KD03-003': { abilities: [
      { id: 'j', kind: 'triggered', trigger: 'juti', ops: [
        { op: 'search', where: 'deckMine', filter: OTA, n: 1, to: 'equipSelf', shuffleAfter: true },
      ]},
    ]},
    'PRMO-011': { abilities: [
      { id: 'j', kind: 'triggered', trigger: 'juti', ops: [
        { op: 'search', where: 'deckMine', filter: OTA, n: 1, to: 'equipSelf', shuffleAfter: true },
      ]},
    ]},
    // ---------- BT02-010 โอตะ รุ่นก่อตั้ง ----------
    'BT02-010': { abilities: [
      { id: 'eq', name: 'สวมใส่/อัญเชิญ', kind: 'activated', oncePerTurn: true, phases: ['main'], turn: 'mine',
        choose: [
          { ops: [{ op: 'equipSelfTo' }], default: true },
          { ops: [{ op: 'unsummonSelf' }] },
        ], needsHost: true },
      { id: 'save', name: 'รับทำลายแทนไอดอล', kind: 'response', responseTo: 'leaving',
        match: (st, me, inst, ev) => ev.inst.controller === me && (ev.inst.db.name || '').includes('ไอดอล') &&
          ev.inst.uid !== inst.uid && inst.equippedTo !== null && inst.equippedTo !== undefined,
        cost: { destroyEquipped: {} }, ops: [{ op: 'negateEvent' }] },
    ]},
    // ---------- BT03-014 โอตะปุส ----------
    'BT03-014': { abilities: [
      { id: 'eq', name: 'สวมใส่/อัญเชิญ', kind: 'activated', oncePerTurn: true, phases: ['main'], turn: 'mine',
        choose: [
          { ops: [{ op: 'equipSelfTo' }], default: true },
          { ops: [{ op: 'unsummonSelf' }] },
        ], needsHost: true },
      { id: 'cd', kind: 'triggered', trigger: 'commandDeath', ops: [{ op: 'draw', n: 1, who: 'me' }] },
    ]},
    // ---------- BT04-013 โอตะตัวกะปอม ----------
    'BT04-013': { abilities: [
      { id: 'pay', kind: 'triggered', trigger: 'onPaidAsCost', needsHost: true,
        cond: (st, me, inst, ctx) => (ctx && ctx.targetName || '').includes('ไอดอล'),
        ops: [{ op: 'equipSelfTo' }] },
    ]},
    // ---------- BT04-046 เลือกมันสำหรับพวก จน !!! ----------
    'BT04-046': { abilities: [
      { id: 'r', kind: 'triggered', trigger: 'onResolve',
        choose: [
          { ops: [{ op: 'search', where: 'hellMine', filter: { type: 'Avatar', costMax: 5, notOnly: true }, n: 1, to: 'hand' }], default: true },
          { ops: [{ op: 'search', where: 'deckMine', filter: { type: 'Avatar', costMax: 5, notOnly: true }, n: 1, to: 'hand', shuffleAfter: true }] },
        ],
        bothWhen: (st, me) => {
          const a = st.players[me].life.filter(l => l.open).length;
          const b = st.players[1 - me].life.filter(l => l.open).length;
          return a >= 4 && a > b;
        } },
    ]},
    // ---------- BT04-048 / KD03-015 งานจับมือ ----------
    'BT04-048': { abilities: [
      { id: 'nc', name: 'งานจับมือ+ยกเลิกโจมตี', kind: 'response', responseTo: 'attackTarget',
        match: idolTarget,
        ops: [{ op: 'negateAttack' },
          { op: 'search', where: 'hellMine', filter: OTA, n: 1, to: 'equipHost' }] },
    ]},
    'KD03-015': { abilities: [
      { id: 'nc', name: 'งานจับมือ+ยกเลิกโจมตี', kind: 'response', responseTo: 'attackTarget',
        match: idolTarget,
        ops: [{ op: 'negateAttack' },
          { op: 'search', where: 'hellMine', filter: OTA, n: 1, to: 'equipHost' }] },
    ]},
    // ---------- BT04-050 เชาว์ปัญญาลิง-ชิงปัญญาเรา ----------
    'BT04-050': { abilities: [
      { id: 'si', name: 'ใบ้ Avatar', kind: 'response', responseTo: 'ability', oncePerTurn: true,
        ops: [{ op: 'silence' }] },
    ]},
    // ---------- BT05-043 มยุราซัง ไอดอลยุค 80 ----------
    'BT05-043': { abilities: [
      { id: 'eq', name: 'ชุบโอตะสวมไอดอล', kind: 'activated', oncePerTurn: true, phases: ['main'], turn: 'mine',
        needsHost: true,
        choose: [
          { ops: [{ op: 'search', where: 'hellMine', filter: OTA, n: 1, to: 'equipHost' }], default: true },
          { ops: [{ op: 'search', where: 'deckMine', filter: OTA, n: 1, to: 'equipHost', shuffleAfter: true }],
            cond: true },
        ] },
    ]},
    // ---------- BT05-058 อย่าให้มีครั้งที่ 2 ----------
    'BT05-058': {
      ignoreMagicLimit: true,
      abilities: [
        { id: 'neg', name: 'ยกเลิก React', kind: 'response', responseTo: 'react', oncePerTurn: true, ops: [{ op: 'negateEvent' }] },
      ]},
    // ---------- BT09-057 ไต้ฝุ่น (ใช้เป็น React ได้) ----------
    'BT09-057': {
      usableAsReact: true,
      abilities: [
        { id: 'r', kind: 'triggered', trigger: 'onResolve',
          choose: [
            { ops: [{ op: 'destroy', spec: { side: 'foe', zone: 'magic' } }], default: true },
            { ops: [{ op: 'destroyLand' }] },
          ] },
      ]},
    // ---------- KD03-001 มีมมิจัง ไอดอล No.1 ----------
    'KD03-001': { abilities: [
      { id: 'from', name: 'อัญเชิญจากมือ (เนรเทศบีมมิ)', kind: 'activated', location: 'hand',
        cost: { exileBoard: { side: 'mine', zone: 'avatar', nameContains: 'บีมมิ' } },
        ops: [{ op: 'summonSelf', juti: true }, { op: 'moveMyEquip', nameContains: 'โอตะ' }] },
      { id: 'j', kind: 'triggered', trigger: 'juti', ops: [
        { op: 'summonFrom', where: 'deckMine', filter: { type: 'Avatar', nameContains: 'ไอดอล' }, juti: false, shuffleAfter: true,
          thenEquip: { where: 'deckMine', filter: OTA } },
      ]},
      { id: 'end', kind: 'triggered', trigger: 'endStart',
        cond: (st, me) => st.cur === me,
        ops: [{ op: 'returnSelfToDeck', thenDraw: 1 },
          { op: 'summonFrom', where: 'darkMine', filter: { nameContains: 'บีมมิ' } },
          { op: 'moveMyEquip', nameContains: 'โอตะ' }] },
    ]},
    // ---------- KD03-002 โอตะคูลา ----------
    'KD03-002': {
      equipBonus: [{ match: (host) => (host.db.name || '').includes('ไอดอล') || (host.db.name || '').includes('บีมมิ'),
        v: (host) => (host.db.name || '').includes('บีมมิ') ? 2 : 1 }],
      abilities: [
        { id: 'eq', name: 'สวมใส่/อัญเชิญ', kind: 'activated', oncePerTurn: true, phases: ['main'], turn: 'mine',
          choose: [
            { ops: [{ op: 'equipSelfTo' }], default: true },
            { ops: [{ op: 'unsummonSelf' }] },
          ], needsHost: true },
        { id: 'find', name: 'หา "บีมมิ" (เนรเทศตัวเอง+ทิ้ง 1)', kind: 'activated', phases: ['main'], turn: 'mine',
          cost: { exileSelf: true, discard: 1 },
          ops: [{ op: 'search', where: 'deckMine', filter: { nameContains: 'บีมมิ' }, n: 1, to: 'hand', shuffleAfter: true }] },
      ]},
    // ---------- KD03-019 ของขวัญจากโอตะ ----------
    'KD03-019': { abilities: [
      { id: 'eq', kind: 'triggered', trigger: 'onEquip', ops: [{ op: 'draw', n: 1, who: 'me' }] },
    ]},
    // ---------- KD03-020 เวทีแห่งความฝัน (Land) ----------
    'KD03-020': { abilities: [
      { id: 'st', name: 'สอดแนม/หาไอดอล', kind: 'activated', oncePerTurn: true, phases: ['main'], turn: 'mine',
        cost: { discard: 1 }, needsHost: true,
        choose: [
          { ops: [{ op: 'scry', side: 'mine', n: 5, pickFilter: OTA, pickMax: 2, defaultDest: 'equipHost', defaultRest: 'deckShuffle' }], default: true },
          { ops: [{ op: 'scry', side: 'mine', n: 7, pickFilter: { nameContains: 'ไอดอล' }, pickMax: 1, defaultDest: 'hand', defaultRest: 'deckShuffle' }] },
        ] },
    ]},
    // ---------- PRMO-003 / PRMO-119 อุบัติเหตุ ----------
    'PRMO-003': { abilities: [
      { id: 'boom', name: 'อุบัติเหตุทำลายตัวอัญเชิญ', kind: 'response', responseTo: 'summon', ops: [{ op: 'destroy', targetSummoned: true }] },
    ]},
    'PRMO-119': { abilities: [
      { id: 'boom', name: 'อุบัติเหตุทำลายตัวอัญเชิญ', kind: 'response', responseTo: 'summon', ops: [{ op: 'destroy', targetSummoned: true }] },
    ]},
    // ---------- PRMO-024 แบมบูจัง ไอดอลสองขั้ว ----------
    'PRMO-024': { abilities: [
      { id: 'pop', name: 'ทำลายโอตะสวมเพื่อทำลาย 1', kind: 'activated', oncePerTurn: true, phases: ['main'], turn: 'mine',
        cost: { destroyEquipped: { nameContains: 'โอตะ' } },
        ops: [{ op: 'destroy', spec: { side: 'either', zone: 'any' } }] },
    ]},
    // ---------- PRMO-037 โทมาโทจัง ไอดอลเด็กน้อย ----------
    'PRMO-037': {
      auras: [{ type: 'power', v: 2, match: (st, ctrl, inst, src) =>
        inst.uid !== src.uid && inst.controller === ctrl && (inst.db.name || '').includes('ไอดอล') &&
        (inst.equipped || []).some(e => (e.db.name || '').includes('โอตะ')) }],
      untarget: [{ match: (st, src, def) =>
        def.uid === src.uid &&
        (src.equipped || []).some(e => (e.db.name || '').includes('โอตะ')) &&
        st.players[src.controller].avatar.some(a => a.uid !== src.uid && (a.db.name || '').includes('ไอดอล') && a.db.name !== src.db.name) }],
      abilities: [],
    },
    // ---------- PRMO-044 ร้อนมากก็เปิดหน้าต่าง ----------
    'PRMO-044': { abilities: [
      { id: 'r', kind: 'triggered', trigger: 'onResolve',
        ops: [{ op: 'bounce', spec: { side: 'foe', zone: 'avatar' } }] },
    ]},
    // ---------- LIFE ----------
    'BT05-071': { abilities: [
      { id: 'd', kind: 'triggered', trigger: 'delayedLife',
        ops: [{ op: 'search', where: 'hellMine', filter: { type: 'Magic', subtype: 'Normal' }, n: 1, to: 'hand' }] },
    ]},
    'BT05-073': { abilities: [
      { id: 'd', kind: 'triggered', trigger: 'delayedLife',
        ops: [{ op: 'scry', side: 'mine', n: 5, pickFilter: { type: 'Avatar' }, pickMax: 1, defaultDest: 'hand', defaultRest: 'deckBottom' }] },
    ]},
    'BT05-075': { abilities: [
      { id: 'd', kind: 'triggered', trigger: 'delayedLife',
        ops: [{ op: 'search', where: 'hellMine', filter: { type: 'Avatar', gemMin: 3 }, n: 1, to: 'hand' }] },
    ]},
    'BT07-074': { abilities: [
      { id: 'd', kind: 'triggered', trigger: 'delayedLife',
        ops: [{ op: 'summonFrom', where: 'hellMine', filter: { type: 'Avatar', costMax: 2 } }] },
    ]},
    'SD03-023': { abilities: [
      { id: 'd', kind: 'triggered', trigger: 'delayedLife', ops: [{ op: 'draw', n: 1, who: 'me' }] },
    ]},
  };
});
