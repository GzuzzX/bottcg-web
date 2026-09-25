// Compiler v3: clause-based, whole-card-must-compile. Output: card-scripts-auto.js
// Hand scripts (card-scripts.js) always win (loader only fills absent keys).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DB = require(path.join(ROOT, 'cards.json'));
const HAND = require(path.join(ROOT, 'card-scripts.js'));
const byPrint = new Map();
DB.forEach(c => { if (!byPrint.has(c.print)) byPrint.set(c.print, c); });
const NATIVE_KW = ['สามัคคี', 'แทงหลัง', 'โล่มนุษย์', 'เตะไข่', 'ลูกฮึด'];

function norm(T) {
  return (T || '').split(/\n/).filter(ln => !/^\s*#/.test(ln)).join('\n').trim();
}
function quotedNames(s) {
  const out = []; const rq = /"([^"]+)"/g; let q;
  while ((q = rq.exec(s))) out.push(q[1]);
  return out;
}
function sideOf(t) {
  const mine = /ฝ่ายเรา|ของเรา/.test(t), foe = /ฝ่ายตรงข้าม|อีกฝ่าย/.test(t);
  if (mine && !foe) return 'mine';
  if (foe && !mine) return 'foe';
  return null;
}
// ---------------- op parsers: clause -> op|null ----------------
function pDraw(cl) {
  const m = /จั่วการ์ด?\s*(\d+)\s*ใบ/.exec(cl);
  if (!m || /ฝ่ายตรงข้าม|อีกฝ่าย/.test(cl)) return null;
  return { op: 'draw', n: +m[1], who: 'me' };
}
function pDestroyAv(cl) {
  let m = /ทำลาย\s*Avatar\s*([^\n]{0,50}?)(\d+)\s*ใบ/.exec(cl);
  if (m) {
    const side = sideOf(cl) || sideOf(m[1]) || 'foe';
    return { op: 'destroy', spec: { side, zone: 'avatar' } };
  }
  m = /ทำลาย\s*Avatar[^\n]*?ทุกใบ/.exec(cl);
  if (m) return { op: 'destroy', spec: { side: sideOf(cl) || 'foe', zone: 'avatar' }, n: 99 };
  return null;
}
function pDestroyAny(cl) {
  let m = /ทำลาย\s*การ์ดบนสนาม\s*(\d+)\s*ใบ/.exec(cl);
  if (m) return { op: 'destroy', spec: { side: 'either', zone: 'any' } };
  m = /ทำลาย\s*การ์ด\s*(\d+)\s*ใบ[^\n]*บน Magic Zone[^\n]*(ฝ่ายตรงข้าม|ฝ่ายเรา|อีกฝ่าย)?/.exec(cl);
  if (m) return { op: 'destroy', spec: { side: (m[2] ? sideOf(m[2]) : 'foe') || 'foe', zone: 'magic' } };
  if (/ทำลาย[^\n]*Land Magic Zone/.test(cl)) return { op: 'destroyLand' };
  m = /ทำลาย\s*Construct[^\n]*?(\d+)\s*ใบ/.exec(cl);
  if (m) return { op: 'destroy', spec: { side: sideOf(cl) || 'foe', zone: 'construct' } };
  return null;
}
function pBounce(cl) {
  let m = /^(เลือก\s*)?นำ\s*(Avatar\s*)?([^\n]{0,40}?)(ฝ่ายตรงข้าม|อีกฝ่าย)[^\n]*ขึ้นมือ/.exec(cl);
  if (m) return { op: 'bounce', spec: { side: 'foe', zone: 'avatar' } };
  m = /นำ\s*Avatar\s*ใบนี้[^\n]*ขึ้นมือ/.exec(cl);
  if (m) return { op: 'bounceSelf' };
  m = /^(เลือก\s*)?นำ\s*Avatar\s*([^\n]{0,60}?)(\d*)\s*ใบ?\s*บน\s*(สนาม|Avatar Zone)([^\n]*)ขึ้นมือ/.exec(cl);
  if (m) {
    const side = /ฝ่ายตรงข้าม|อีกฝ่าย/.test(m[5]) ? 'foe' : (/ฝ่ายเรา|ของเรา|Zone เรา/.test(m[5] + m[2]) ? 'mine' : 'either');
    const spec = { side, zone: 'avatar' };
    const q = /"([^"]+)"/.exec(m[2]);
    if (q) spec.nameContains = q[1];
    const ex = /ที่ไม่ได้ชื่อ\s*([^,\n]+?)\s*(บน|$)/.exec(m[2] + ' ' + m[5]);
    if (ex) spec.excludeName = ex[1].trim();
    return { op: 'bounce', spec };
  }
  return null;
}
function pSearch(cl) {
  let m = /นำ\s*(Avatar|Construct)\s*(ชื่อ\s*)?((?:"[^"]+"\s*(,|หรือ|และ)?\s*)+)\s*(?:ได้สูงสุด\s*)?(\d*)\s*ใบ\s*จาก\s*(Deck|นรก)(เรา|ฝ่ายเรา|ฝ่ายตรงข้าม)?[^\n]*ขึ้นมือ/.exec(cl);
  if (m) {
    if (m[7] === 'ฝ่ายตรงข้าม') return null;
    const names = quotedNames(m[3]);
    if (!names.length) return null;
    const where = m[6] === 'Deck' ? 'deckMine' : 'hellMine';
    const filter = names.length > 1 ? { type: m[1], nameIn: names } : { type: m[1], nameContains: names[0] };
    let nn = +(m[5] || 0);
    if (!nn) { const sm = /สูงสุด\s*(\d+)\s*ใบ/.exec(cl); if (sm) nn = +sm[1]; }
    return { op: 'search', where, filter, n: Math.max(1, nn), to: 'hand', shuffleAfter: /สับ/.test(cl) };
  }
  m = /นำ\s*(Avatar\s*)?"([^"]+)"\s*(\d*)\s*ใบ?\s*จาก\s*(Deck|นรก)(เรา|ฝ่ายเรา|ฝ่ายตรงข้าม)?[^\n]*ขึ้นมือ/.exec(cl);
  if (m) {
    if (m[5] === 'ฝ่ายตรงข้าม') return null;
    return { op: 'search', where: m[4] === 'Deck' ? 'deckMine' : 'hellMine', filter: { type: 'Avatar', nameContains: m[2] }, n: +(m[3] || 1), to: 'hand', shuffleAfter: /สับ/.test(cl) };
  }
  m = /นำ\s*(Avatar|Construct)\s*(\d+)\s*ใบ\s*จาก\s*นรก(เรา|ฝ่ายเรา)([^\n]*?)ขึ้นมือ/.exec(cl);
  if (m) {
    const f = { type: m[1] };
    const g = /GEM\s*(\d+)\s*หรือมากกว่า/.exec(m[3]);
    if (g) f.gemMin = +g[1];
    const cm = /Cost\s*(\d+)\s*หรือต่ำกว่า/.exec(m[3]);
    if (cm) f.costMax = +cm[1];
    if (/Cost\s*(\d+)\s*[^ห]|GEM\s*(\d+)\s*[^ห]|POWER\s*(\d+)/.test(m[3]) && !g && !cm) return null;
    return { op: 'search', where: 'hellMine', filter: f, n: +m[2], to: 'hand' };
  }
  m = /นำ\s*Magic[^\n]*?"([^"]+)"[^\n]*จาก\s*(Deck|นรก)[^\n]*ขึ้นมือ/.exec(cl);
  if (m) return { op: 'search', where: m[2] === 'Deck' ? 'deckMine' : 'hellMine', filter: { type: 'Magic', nameContains: m[1] }, n: 1, to: 'hand', shuffleAfter: /สับ/.test(cl) };
  m = /เลือก\s*Modification Magic[^\n]*?(\d+)\s*ใบ/.exec(cl);
  if (m && /ขึ้นมือ/.test(cl)) {
    const where = /นรก/.test(cl) ? 'hellMine' : 'deckMine';
    return { op: 'search', where, filter: { type: 'Magic', subtype: 'Modification' }, n: +m[1], to: 'hand', shuffleAfter: /สับ/.test(cl) };
  }
  m = /นำ\s*Modification Magic\s*([^\n]{0,60}?)(\d+)\s*ใบ/.exec(cl);
  if (m) {
    const where = /นรก/.test(cl) ? 'hellMine' : 'deckMine';
    const op = { op: 'search', where, filter: { type: 'Magic', subtype: 'Modification' }, n: +m[2] || 1, to: 'hand', shuffleAfter: /สับ/.test(cl) };
    if (/สวม(ให้|ใส่).*Avatar ใบนี้/.test(cl)) { op.to = 'equipSelf'; }
    return op;
  }
  m = /นำ\s*\{mod\}\s*[^\n]*?(\d+)\s*ใบ[^\n]*ขึ้นมือ/.exec(cl);
  if (m) {
    const where = /นรก/.test(cl) ? 'hellMine' : (/Deck/.test(cl) ? 'deckMine' : null);
    if (!where || /ฝ่ายตรงข้าม/.test(cl)) return null;
    return { op: 'search', where, filter: { type: 'Magic', subtype: 'Modification' }, n: +m[1], to: 'hand', shuffleAfter: /สับ/.test(cl) };
  }
  return null;
}
function statFilter(s) {
  const f = {};
  let m = /Cost\s*(\d+)\s*(หรือต่ำกว่า|ไม่เกิน|หรือน้อยกว่า)?/.exec(s);
  if (m) { if (m[2]) f.costMax = +m[1]; else f.cost = +m[1]; }
  m = /GEM\s*(\d+)\s*(หรือมากกว่า)?/.exec(s);
  if (m) { if (m[2]) f.gemMin = +m[1]; else f.gem = +m[1]; }
  m = /POWER\s*(\d+)\s*(หรือมากกว่า)?/.exec(s);
  if (m) { if (m[2]) f.powerMin = +m[1]; else f.power = +m[1]; }
  m = /Symbol\s*\[?([^\]\s"“”]+)\]?/.exec(s) || /\{symbol\s*([^}]+)\}/.exec(s);
  if (m) f.symbol = m[1];
  m = /สี(แดง|ฟ้า|เขียว|ม่วง)/.exec(s);
  if (m) f.color = m[1];
  return f;
}
function pSummon(cl, full) {
  function sleepUnlessOf(s) {
    const m = /ถ้าบนสนามมี\s*Land Magic\s*"([^"]+)"/.exec(s || '');
    return m ? { landName: m[1] } : undefined;
  }
  let m = /อัญเชิญ\s*(จุติ\s*)?Avatar\s*(ชื่อ\s*)?((?:"[^"]+"\s*(,|หรือ|และ)?\s*)+)\s*(\d*)\s*ใบ?\s*(จาก\s*)?(Deck|ใน Deck|นรก|ในนรก|เนรเทศ|มือ)(เรา|ฝ่ายเรา)?/.exec(cl);
  if (m) {
    const names = quotedNames(m[3]);
    if (!names.length) return null;
    const zw = m[6].replace(/^ใน\s*/, '');
    const where = { Deck: 'deckMine', 'นรก': 'hellMine', 'เนรเทศ': 'darkMine', 'มือ': 'handMine' }[zw];
    if (!where) return null;
    const filter = Object.assign(names.length > 1 ? { type: 'Avatar', nameIn: names } : { type: 'Avatar', nameContains: names[0] }, statFilter(cl));
    const exn = /ไม่ได้ชื่อ\s*([^\s,]+(?:\s+[^\s,]+)*?)\s*(\d+\s*ใบ|ในนรก|ลงบน|$)/.exec(cl);
    if (exn) filter.excludeName = exn[1].trim();
    const op = { op: 'summonFrom', where, filter, juti: !!m[1], shuffleAfter: /สับ/.test(cl) };
    const su = sleepUnlessOf(full || cl);
    if (su) { op.sleep = true; op.sleepUnless = su; }
    const out = [op];
    // both-sides summon ("และ อีกฝ่ายอัญเชิญ ... จาก Deck อีกฝ่าย ... 1 ตัว")
    const m2 = /อีกฝ่ายอัญเชิญ\s*Avatar\s*([^\n]{0,60}?)\s*จาก\s*Deck\s*อีกฝ่าย[^\n]*?(\d+)\s*ตัว/.exec(full || cl);
    if (m2) {
      out.push({ op: 'summonFrom', where: 'deckFoe', side: 'foe', filter: Object.assign({ type: 'Avatar' }, statFilter(m2[1])), shuffleAfter: true });
    }
    return out.length > 1 ? out : out[0];
  }
  m = /อัญเชิญ\s*(จุติ\s*)?Avatar\s*([^\n]{0,60}?)(\d+)\s*ใบ\s*(จาก\s*)?(Deck|ใน Deck|นรก|ในนรก|เนรเทศ|มือ)(เรา|ฝ่ายเรา)?/.exec(cl);
  if (m) {
    const zw = m[4].replace(/^ใน\s*/, '');
    const where = { Deck: 'deckMine', 'นรก': 'hellMine', 'เนรเทศ': 'darkMine', 'มือ': 'handMine' }[zw];
    if (!where) return null;
    const filter = Object.assign({ type: 'Avatar' }, statFilter(m[2]));
    const nm = /"([^"]+)"/.exec(m[2]);
    if (nm) filter.nameContains = nm[1];
    const exn = /ไม่ได้ชื่อ\s*([^\s,]+(?:\s+[^\s,]+)*?)\s*(\d+\s*ใบ|ในนรก|ลงบน|$)/.exec(m[2]);
    if (exn) filter.excludeName = exn[1].trim();
    const sym = /\{symbol\s*([^}]+)\}/.exec(m[2]);
    if (sym) filter.symbol = sym[1];
    if (/Token/.test(m[2])) return null;
    const op = { op: 'summonFrom', where, filter, juti: !!m[1], shuffleAfter: /สับ/.test(cl) };
    const su = sleepUnlessOf(full || cl);
    if (su) { op.sleep = true; op.sleepUnless = su; }
    return op;
  }
  return null;
}
function pMill(cl) {
  const m = /ธรณีสูบ\s*(\d+)\s*ใบ/.exec(cl);
  if (!m) return null;
  return { op: 'millHell', n: +m[1], side: /ฝ่ายตรงข้าม|อีกฝ่าย/.test(cl) ? 'foe' : 'mine' };
}
function pScry(cl, full) {
  const m = /สอดแนม\s*(\d+)\s*ใบ/.exec(cl);
  if (!m) return null;
  const n = +m[1];
  let pickFilter = null, pickMax = 9;
  const q = /เลือก[^\n]*?"([^"]+)"[^\n]*?(\d+)\s*ใบ/.exec(full);
  if (q) { pickFilter = { nameContains: q[1] }; pickMax = +q[2]; }
  else {
    const t2 = /เลือก\s*(Avatar\s*)?"([^"]+)"/.exec(full);
    if (t2) { pickFilter = { nameContains: t2[2] }; pickMax = 1; }
  }
  const dest = /สวมใส่/.test(full) ? 'equipHost' : (/ลง\s*Avatar Zone/.test(full) ? 'field' : 'hand');
  const rest = /ใต้\s*Deck/.test(full) ? 'deckBottom' : 'deckShuffle';
  const op = { op: 'scry', side: 'mine', n, pickFilter, pickMax, defaultDest: dest, defaultRest: rest };
  if (dest === 'equipHost') {
    const h = /ไปสวม(ให้|ใส่).*Avatar\s*"([^"]+)"/.exec(full);
    if (h) op.hostSpec = { nameContains: h[2] };
  }
  return op;
}
function pExile(cl) {
  const m = /เนรเทศ\s*(Avatar\s*)?([^\n]{0,40}?)(\d+)\s*ใบ/.exec(cl);
  if (!m || /การ์ดใบนี้/.test(cl)) return null;
  const side = sideOf(cl);
  if (!side) return null;
  return { op: 'exile', spec: { side, zone: 'avatar' } };
}
function pFlipLife(cl) {
  const m = /หงาย\s*LIFE[^\n]*?(\d+)\s*ใบ/.exec(cl);
  if (m) return { op: 'flipLife', n: +m[1], up: true, side: /ฝ่ายตรงข้าม|อีกฝ่าย/.test(cl) ? 'foe' : 'mine' };
  return null;
}
function pEquipSelf(cl, full) {
  if (!/นำ\s*(การ์ด|Avatar)\s*ใบนี้[^\n]*สวม(ให้|ใส่)/.test(cl)) return null;
  const op = { op: 'equipSelfTo' };
  const h = /สวม(ให้|ใส่).*Avatar\s*"([^"]+)"/.exec(full || cl);
  if (h) op._hostSpec = { nameContains: h[2] };
  return op;
}
function pUnsummon(cl) {
  if (/อัญเชิญการ์ดใบนี้[^\n]*สภาพสวมใส่[^\n]*Avatar Zone/.test(cl)) return { op: 'unsummonSelf' };
  return null;
}
function pSummonSelfClause(cl) {
  if (/อัญเชิญ\s*(การ์ดใบนี้|Avatar ใบนี้)/.test(cl)) return { op: 'summonSelf' };
  return null;
}
function pUntap(cl) {
  if (/เปลี่ยนสภาพ[^\n]*เป็นสภาพตื่น|กลับมาสภาพตื่น/.test(cl)) return { op: 'untap' };
  return null;
}
function pDelayEnd(cl) {
  if (/จะถูกทำลายในตอน End Phase/.test(cl)) return { op: 'delaySelfEnd' };
  if (/ทำลาย\s*Avatar\s*ใบนี้\s*ในช่วง End Phase/.test(cl)) return { op: 'delaySelfEnd' };
  return null;
}
function pReactLock(cl) {
  if (/ไม่สามารถ(สั่ง)?ใช้งาน\s*React Magic/.test(cl)) return { op: 'reactLockFoe' };
  return null;
}
function pSelfReactLock(cl) {
  if (/ในเทิร์นนี้เราไม่สามารถใช้\s*React Magic/.test(cl)) return { op: 'selfReactLock' };
  return null;
}
function pNegate(cl) {
  if (/ไม่\w*\s*(ถูก\s*)?ยกเลิก|ยกเลิกไม่ได้|ห้ามยกเลิก/.test(cl)) return null;
  if (/ยกเลิก(ผล|ความสามารถ)?(ของการ์ดนั้น|การ์ดใบนั้น|การ์ดใบนนั้น)?/.test(cl) && !/โจมตี/.test(cl)) return { op: 'negateEvent' };
  return null;
}
function pGrantOneShot(cl) {
  const m = /ได้รับ\s*ความสามารถ\s*([^\s(（\n]+)/.exec(cl);
  if (!m) return null;
  const kw = m[1].replace(/[.,]/g, '');
  if (!/เตะไข่|โล่มนุษย์|สามัคคี|แทงหลัง|ลูกฮึด/.test(kw)) return null;
  return { op: 'grantKw', kw };
}
function pGainControl(cl) {
  if (/เปลี่ยนการควบคุม[^\n]*Avatar Zone ฝ่ายเรา/.test(cl)) return { op: 'gainControl', spec: { side: 'foe', zone: 'avatar' } };
  return null;
}
function pMoveMagic(cl) {
  const m = /นำ\s*Avatar\s*([^\n]{0,40}?)ไป(ที่\s*)?Magic Zone/.exec(cl);
  if (!m) return null;
  const spec = { side: sideOf(cl) || 'mine', zone: 'avatar' };
  const q = /"([^"]+)"/.exec(m[1]);
  if (q) spec.nameContains = q[1];
  return { op: 'moveToMagic', spec };
}
function pFlipLifeRandom(cl) {
  if (/สุ่มคว่ำ\s*LIFE/.test(cl)) return { op: 'flipLifeRandom', side: /ฝ่ายตรงข้าม|อีกฝ่าย/.test(cl) ? 'foe' : 'mine', up: false };
  return null;
}
function pBuffPer(cl) {
  const m = /POWER\s*(ลดลง|เพิ่มขึ้น)ตามจำนวน([^\n]+?)ใบละ\s*(\d+)/.exec(cl);
  if (!m) return null;
  const v = (m[1] === 'ลดลง' ? -1 : 1) * (+m[3]);
  const desc = m[2];
  let per = null;
  if (/บนสนามและบนมือ/.test(desc)) per = { boardHandMine: true };
  else if (/สภาพนอน/.test(desc)) per = 'tappedBoth';
  else if (/LIFE[^\n]*หงาย/.test(desc)) per = 'lifeOpenMine';
  else {
    const h = /ในนรก.*"([^"]+)"/.exec(desc);
    if (h) per = { hellName: h[1] };
  }
  if (!per) return null;
  return { op: 'buffPer', v, per, until: 'endTurn' };
}
function pDeckTop(cl) {
  const m = /นำ\s*(Avatar|Construct)\s*([^\n]{0,60}?)(\d+)\s*ใบ[^\n]*วางไว้บนสุดของ Deck/.exec(cl);
  if (!m) return null;
  const filter = { type: m[1] };
  const q = /"([^"]+)"/.exec(m[2]);
  if (q) filter.nameContains = q[1];
  const cm = /Cost\s*(\d+)\s*หรือต่ำกว่า/.exec(m[2]);
  if (cm) filter.costMax = +cm[1];
  if (/ฝ่ายตรงข้าม/.test(cl)) return null;
  const both = /ผู้เล่นทุกคน/.test(cl);
  return { op: 'deckTop', filter, n: +m[3], side: both ? 'both' : 'mine' };
}
function pSummonToken(cl) {
  const m = /อัญเชิญ\s*Token\s*([^\n]+?)(\d+)\s*ใบ/.exec(cl);
  if (!m) return null;
  // resolve token print from DB at compile time via name/symbol match is done at runtime; store descriptor
  const desc = m[1];
  const nm = /"([^"]+)"/.exec(desc);
  const sym = /\{Symbol\s*([^}]+)\}/.exec(desc) || /Symbol\s*\[?([^\]\s"“”]+)\]?/.exec(desc);
  const op = { op: 'summonToken', tokenMatch: { name: nm ? nm[1] : null, symbol: sym ? sym[1] : null }, n: +m[2] };
  const rq = /ถ้าในนรกเรามี\s*Avatar\s*"([^"]+)"\s*(\d+)\s*ใบหรือมากกว่า/.exec(cl);
  if (rq) op.requireHell = { name: rq[1], min: +rq[2] };
  else if (/ถ้า/.test(cl)) return null;
  return op;
}
function pRebuild(cl) {
  if (!/ก่อสร้าง Construct/.test(cl)) return null;
  const mc = /สูงสุดไม่เกิน\s*(\d+)\s*ใบ/.exec(cl);
  const tc = /Cost รวมกันไม่เกิน\s*(\d+)/.exec(cl);
  if (!mc || !tc) return null;
  const filter = {};
  if (/ที่ไม่ใช่\s*\{only\}/.test(cl)) filter.notOnly = true;
  return { op: 'rebuildConstruct', maxCount: +mc[1], totalCostMax: +tc[1], filter };
}
function pBuff(cl, full) {
  let m = /Avatar\s*ใบนั้น\s*POWER\s*([+-])\s*(\d+)/.exec(cl);
  if (m && /ต่อสู้/.test(cl)) return { op: 'buff', v: (m[1] === '+' ? +m[2] : -+m[2]), until: 'endTurn' };
  m = /^POWER\s*([+-])\s*(\d+)\s*$/.exec(cl);
  if (m) return { op: 'buffPermSelf', v: (m[1] === '+' ? +m[2] : -+m[2]) };
  // bare "POWER +N จนจบเทิร์น" (e.g. SD01-002 onAttack): self buff until end of turn, not permanent
  m = /^POWER\s*([+-])\s*(\d+)[^\n]*จนจบ(เทิร์น|การต่อสู้)/.exec(cl);
  if (m && !/Avatar|เลือก/.test(cl)) {
    // only when trigger context is self (onAttack/onBattle) — caller passes full text; treat as self
    return { op: 'buffSelf', v: (m[1] === '+' ? +m[2] : -+m[2]) };
  }
  if (/ให้กับ\s*Avatar\s*ที่อัญเชิญ/.test(cl)) {
    const m = /POWER\s*([+-])\s*(\d+)/.exec(cl);
    if (!m) return null;
    return { op: 'buff', v: (m[1] === '+' ? +m[2] : -+m[2]), targetSummoned: true, until: 'endTurn' };
  }
  m = /Avatar\s*ใบนี้\s*POWER\s*([+-])\s*(\d+)/.exec(cl);
  if (m) return { op: /จนจบเทิร์น/.test(cl) ? 'buffSelf' : 'buffPermSelf', v: (m[1] === '+' ? +m[2] : -+m[2]) };
  m = /เลือก\s*Avatar\s*([^\n]{0,40}?)POWER\s*([+-])\s*(\d+)[^\n]*จนจบ(เทิร์น|การต่อสู้)/.exec(cl);
  if (!m) return null;
  let side = sideOf(cl);
  if (!side) side = m[2] === '-' ? 'foe' : 'mine';
  const spec = { side, zone: 'avatar' };
  const q = /"([^"]+)"/.exec(m[1]);
  if (q) spec.nameContains = q[1];
  const sym = /\{symbol\s*([^}]+)\}/.exec(m[1]) || /Symbol\s*\[?([^\]\s"“”]+)\]?/.exec(m[1]);
  if (sym) spec.symbol = sym[1];
  return { op: 'buff', v: (m[2] === '+' ? +m[3] : -+m[3]), spec, until: 'endTurn' };
}
function pSelfBottom(cl) {
  if (/นำ\s*Avatar\s*ใบนี้[^\n]*ใต้\s*Deck/.test(cl)) return { op: 'returnSelfToBottom' };
  return null;
}
function pSilenceClause(cl) {
  // returns silence op with duration
  if (/สูญเสียความสามารถ/.test(cl)) {
    const op = { op: 'silence' };
    if (/จนจบเทิร์นถัดไปของ\s*ฝ่ายตรงข้าม/.test(cl)) op.silenceFoeNext = true;
    return op;
  }
  return null;
}
function pCostBan(cl) {
  const m = /Avatar\s*((?:"[^"]+"\s*(,|และ|หรือ)?\s*)+)[^\n]*ไม่สามารถใช้เป็น Cost/.exec(cl);
  if (!m) return null;
  const names = quotedNames(m[1]);
  if (!names.length) return null;
  return { op: 'costBan', names };
}
const OP_PARSERS = [pDraw, pDestroyAv, pDestroyAny, pBounce, pSearch, pSummon, pSummonSelfClause, pMill, pScry, pExile, pFlipLife, pEquipSelf, pUnsummon, pGainControl, pBuff, pSelfBottom, pCostBan, pMoveMagic, pUntap, pGrantOneShot, pFlipLifeRandom, pBuffPer, pDeckTop, pSummonToken, pRebuild, pDelayEnd, pReactLock, pSelfReactLock, pSilenceClause, pNegate];
function parseOpsBlock(block, full) {
  const clauses = block.split(/\n+/).map(s => s.trim()).filter(s => s && !/^#/.test(s));
  const ops = [];
  ops.failed = [];
  if (!clauses.length) return ops;
  for (const cl of clauses) {
    if (/สับ\s*Deck\s*$/.test(cl) && ops.length) continue;
    if (/^(ถ้า|หาก|ยกเว้น|โดยที่|ในกรณีที่)/.test(cl)) { ops.failed.push(cl.slice(0, 120)); continue; }
    let done = false;
    for (const p of OP_PARSERS) {
      const o = (p === pScry || p === pEquipSelf || p === pSummon || p === pBuff) ? p(cl, full) : p(cl);
      if (o) { (Array.isArray(o) ? o : [o]).forEach(x => ops.push(x)); done = true; break; }
    }
    if (!done) ops.failed.push(cl.slice(0, 120));
  }
  return ops;
}
// ---------------- costs ----------------
function parseCostHead(s) {
  const cost = {};
  let m = /ทิ้งการ์ดบนมือ\s*(\d+)\s*ใบ/.exec(s);
  if (m) cost.discard = +m[1];
  // ทิ้ง Avatar {symbol X} [จากบนมือ] N ใบ  (e.g. SD01-018) — symbol-constrained Avatar discard
  m = /ทิ้ง\s*Avatar\s*\{[Ss]ymbol\s*([^}]+)\}[^\n]*?(\d+)\s*ใบ/.exec(s);
  if (m) {
    cost.discard = +m[2];
    // keep both generic symbol check and Avatar-type check for engine validation
    cost.discardSymbol = m[1].trim();
    cost.discardAvatarSymbol = m[1].trim();
  } else {
    m = /ทิ้ง\s*Avatar\s*\{[Ss]ymbol\s*([^}]+)\}\s*(\d+)?\s*ใบ?/.exec(s);
    if (m) { cost.discard = +(m[2] || 1); cost.discardSymbol = m[1].trim(); cost.discardAvatarSymbol = m[1].trim(); }
  }
  m = /เซ่นไหว้\s*Avatar\s*(Symbol\s*(\S+))?[^:]*?(\d+)\s*ใบ/.exec(s);
  if (m) { cost.sacrificeMyAvatar = {}; if (m[2]) cost.sacrificeMyAvatar.symbol = m[2]; }
  else if (/เซ่นไหว้\s*Avatar\s*ใบนี้/.test(s)) cost.sacrificeSelf = true;
  else if (/เซ่นไหว้/.test(s)) return null;
  if (/ทำลาย[^\n]*ที่สวมใส่/.test(s)) {
    const q = /ทำลาย[^\n]*"(.*?)"/.exec(s);
    cost.destroyEquipped = q ? { nameContains: q[1] } : {};
  }
  if (/เนรเทศ\s*การ์ดใบนี้/.test(s)) cost.exileSelf = true;
  else if (/เนรเทศ/.test(s)) return null;
  if (/ทำลาย\s*การ์ดใบนี้/.test(s)) cost.destroySelf = true;
  let gm = /นำการ์ด\s*(\d+)\s*ใบ\s*บนมือเราให้อีกฝ่าย/.exec(s);
  if (gm) cost.giveHandToFoe = +gm[1];
  const sm = /ส่ง\s*Avatar\s*(ชื่อ\s*)?((?:"[^"]+"\s*(,|และ|หรือ)?\s*)+)[^\n]*ลงนรก/.exec(s);
  if (sm) {
    const names = quotedNames(sm[2]);
    if (!names.length) return null;
    cost.sendNamedToHell = { names };
  } else if (/ส่ง\s*Avatar\s*\{[Ss]ymbol\s*([^}]+)\}\s*(\d+)?\s*ใบ?[^\n]*ลงนรก/.test(s)) {
    const ym = /ส่ง\s*Avatar\s*\{[Ss]ymbol\s*([^}]+)\}\s*(\d+)?\s*ใบ?[^\n]*ลงนรก/.exec(s);
    cost.sendSymbolToHell = { symbol: ym[1].trim(), n: +(ym[2] || 1) };
  } else if (/ส่ง\s*Avatar[^\n]*ลงนรก/.test(s)) return null;
  if (/สภาพนอน/.test(s) && /เปลี่ยน/.test(s)) return null;
  return cost;
}
// ---------------- triggers ----------------
function splitTrigger(T) {
  let m = /^จุติ\s*(\([^)]*\))?\s*:?\s*([\s\S]*)$/.exec(T);
  if (m && (m[2] || '').trim()) {
    // exact-payment gating: "(เมื่อ ... แบบจ่าย Cost)" / "จ่ายCost" / "พอดี" => podi only
    const head = (m[1] || '') + ' ' + T.slice(0, 80);
    const podi = /จ่าย\s*Cost|แบบจ่าย|จ่ายCost|พอดี/.test(head);
    return { trigger: 'juti', body: m[2], condData: podi ? { podi: true } : undefined };
  }
  m = /^คำสั่งเสีย\s*:?\s*([\s\S]*)$/.exec(T);
  if (m && m[1].trim()) {
    const fz = /ถ้าถูกทำลายจาก\s*(Avatar Zone|Magic Zone|Construct Zone)/.exec(m[1]);
    return { trigger: 'commandDeath', body: m[1], condData: fz ? { fromZone: fz[1] === 'Avatar Zone' ? 'avatar' : fz[1] === 'Magic Zone' ? 'magic' : 'construct' } : undefined };
  }
  m = /^(พอดี\s+)?เทิร์นละครั้ง\s+สั่งใช้\s*(.*?):\s*([\s\S]*)$/.exec(T);
  if (m) return { trigger: 'activated', once: true, costHead: m[2], body: m[3], condData: m[1] ? { podi: true } : undefined };
  m = /^เทิร์นละครั้ง\s+(?!สั่งใช้)(.*?):\s*([\s\S]*)$/.exec(T);
  if (m && m[2].trim()) {
    if (m[1].trim() === 'เลือกปฏิบัติ') return { trigger: 'activated', once: true, costHead: '', body: T };
    if (/^(1\)|2\)|3\))/.test(m[2].trim()) || /เลือกปฏิบัติ/.test(m[1])) return null;
    return { trigger: 'activated', once: true, costHead: m[1], body: m[2] };
  }
  m = /^อัตโนมัติ\s+เมื่อ\s*Avatar\s*ใบนี้\s*(เทิร์นละครั้ง\s*)?(ประกาศ)?โจมตี\s*:?\s*([\s\S]*)$/.exec(T);
  if (m && m[3].trim()) return { trigger: 'onAttack', once: !!m[2], body: m[3] };
  m = /^อัตโนมัติ\s+เมื่อ\s*Avatar\s*ใบนี้\s*ต่อสู้\s*:?\s*([\s\S]*)$/.exec(T);
  if (m && m[1].trim()) return { trigger: 'onBattle', body: m[1] };
  m = /^อัตโนมัติ\s+เมื่อ\s*Avatar\s*ใบนี้เป็นเป้าหมาย[^\n]*:\s*([\s\S]*)$/.exec(T);
  if (m && m[1].trim()) return { trigger: 'onTargeted', twin: /หรือสั่งโจมตี/.test(T) ? 'onAttack' : undefined, body: m[1] };
  m = /^อัตโนมัติ\s+เมื่อ\s*Avatar\s*ใบนี้ถูกอัญเชิญ[^\n]*:\s*([\s\S]*)$/.exec(T);
  if (m && m[1].trim()) return { trigger: 'juti', condData: { byEffect: true }, body: m[1] };
  m = /^อัตโนมัติ\s+เมื่อ\s*(Avatar\s*ใบนี้|การ์ดใบนี้|Avatar\s*ที่สวมใส่การ์ดใบนี้)\s*(โจมตีและ)?ทำลาย\s*Avatar[^\n]*:\s*([\s\S]*)$/.exec(T);
  if (m) return { trigger: 'onKill', body: m[3] };
  m = /^ถ้าการ์ดใบนี้ถูก\s*ธรณีสูบ([^\n:]*):?\s*([\s\S]*)$/.exec(T);
  if (m && m[2].trim()) {
    const cond = m[1] || '';
    const alts = [];
    const parts = cond.split(/หรือ/g);
    parts.forEach(p => {
      const o = {};
      const sy = /[Ss]ymbol\s*\[?\{?([^\]\s"“”}]+)\}?\]?/.exec(p);
      if (sy) o.symbol = sy[1];
      const co = /สี(แดง|ฟ้า|เขียว|ม่วง)/.exec(p);
      if (co) o.color = co[1];
      if (/Magic/.test(p)) o.type = 'Magic';
      if (/Avatar/.test(p) && !o.symbol && !o.color && !o.type) o.type = 'Avatar';
      if (Object.keys(o).length) alts.push(o);
    });
    return { trigger: 'onMill', body: m[2], condData: alts.length ? { millByAny: alts } : undefined };
  }
  m = /^อัตโนมัติ\s+เมื่อ\s*(Avatar\s*ใบนี้|การ์ดใบนี้)\s*สั่งโจมตี\s*:?\s*([\s\S]*)$/.exec(T);
  if (m && m[2].trim()) return { trigger: 'onAttack', body: m[2] };
  m = /^เมื่อ\s*Avatar\s*ที่สวมใส่การ์ดใบนี้\s*สั่งโจมตี\s*:?\s*([\s\S]*)$/.exec(T);
  if (m && m[1].trim()) return { trigger: 'wearerAttacks', body: m[1] };
  m = /^สั่งใช้\s*(.*?):\s*([\s\S]*)$/.exec(T);
  if (m && m[2].trim()) {
    const parts = m[1].split(/\s*:\s*/);
    if (parts.length >= 2 && /อยู่ในนรก/.test(parts[0])) {
      const condRest = parts.slice(0, -1).join(' : ');
      if (/ควบคุม|ถ้า|เมื่อ|จำนวน/.test(condRest.replace(/อยู่ในนรก/, ''))) return null;
      return { trigger: 'activated', location: 'hell', costHead: parts[parts.length - 1], body: m[2] };
    }
    return { trigger: 'activated', once: false, costHead: m[1], body: m[2] };
  }
  m = /^อัตโนมัติ\s+ในช่วง\s*(End|Draw|Main|Battle)\s*Phase[^\n]*:\s*([\s\S]*)$/.exec(T);
  if (m) return { trigger: m[1] === 'End' ? 'endStart' : 'mainStart', body: m[2] };
  m = /^เมื่อถูก(ใช้เป็น|ทิ้งเป็น)(ค่า\s*)?Cost[^\n]*:\s*([\s\S]*)$/.exec(T);
  if (m) {
    const ft = /เพื่ออัญเชิญ\s*Avatar\s*"([^"]+)"/.exec(T);
    return { trigger: 'onPaidAsCost', body: m[3], condData: ft ? { forTarget: ft[1] } : undefined };
  }
  m = /^เมื่อการ์ดใบนี้(ถูก)?สวมใส่\s*:?\s*([\s\S]*)$/.exec(T);
  if (m && m[2].trim()) return { trigger: 'onEquip', body: m[2] };
  m = /^เมื่อการ์ดใบนี้ตกลงสู่นรก\s*:?\s*([\s\S]*)$/.exec(T);
  if (m && m[1].trim()) return { trigger: 'onEquipHell', body: m[1] };
  m = /^(ส่ง\s*Avatar[^\n]+?ลงนรก)\s*:\s*([\s\S]*)$/.exec(T);
  if (m && m[2].trim()) return { trigger: 'onResolve', costHead: m[1], body: m[2] };
  // Magic additional cost: "ทิ้ง ... : ..." (e.g. SD01-018 ทิ้ง Avatar เทพ 1 : จั่ว 2)
  m = /^(ทิ้ง[^\n]+?)\s*:\s*([\s\S]*)$/.exec(T);
  if (m && m[2].trim()) {
    const cost = parseCostHead(m[1]);
    if (cost && Object.keys(cost).length) return { trigger: 'onResolve', costHead: m[1], body: m[2] };
  }
  return null;
}
function tryLifeDelayed(T) {
  if (!/หงายจากการโจมตี/.test(T) && !/^ใน\s*[Mm]ain\s*[Pp]hase\s*ถัดไป/.test(T.trim())) return null;
  const m = /ใน\s*[Mm]ain\s*[Pp]hase\s*ถัดไป\s*([\s\S]*)$/.exec(T);
  if (!m || !m[1].trim()) return null;
  const ops = parseOpsBlock(m[1], T);
  if (!ops.length) return null;
  return { abilities: [{ id: 'd', kind: 'triggered', trigger: 'delayedLife', ops }] };
}
function tryResponse(T) {
  if (/เมื่อมี\s*Avatar\s*อัญเชิญ/.test(T) && /ทำลาย\s*Avatar/.test(T)) {
    // event-bound: destroy the summoned Avatar (targetSummoned), either side
    return { abilities: [{ id: 'r', kind: 'response', responseTo: 'summon', ops: [{ op: 'destroy', spec: { side: 'either', zone: 'avatar' }, targetSummoned: true }] }] };
  }
  if (/เมื่อมีการใช้\s*Magic/.test(T) && /ยกเลิก/.test(T)) {
    return { abilities: [{ id: 'r', kind: 'response', responseTo: 'magic', ops: [{ op: 'negateEvent' }] }] };
  }
  if (/เมื่อ.*ใช้\s*\{react\}/.test(T) && /ยกเลิก/.test(T)) {
    const ign = /ถือว่าเป็นการใช้/.test(T) || /แม้ว่า/.test(T);
    return { ignoreMagicLimit: ign || undefined, abilities: [{ id: 'r', kind: 'response', responseTo: 'react', oncePerTurn: /1\s*ใบ\s*ต่อเทิร์น|เทิร์นละครั้ง/.test(T), ops: [{ op: 'negateEvent' }] }] };
  }
  if (/เป็นเป้าหมายการโจมตี/.test(T) && /ยกเลิกการโจมตี/.test(T)) {
    const ops = [{ op: 'negateAttack' }];
    if (/สวมใส่/.test(T)) ops.push({ op: 'search', where: 'hellMine', filter: { type: 'Avatar', nameContains: 'โอตะ' }, n: 1, to: 'equipHost' });
    return { abilities: [{ id: 'r', kind: 'response', responseTo: 'attackTarget', ops }] };
  }
  if (/ใช้ความสามารถของ\s*Avatar/.test(T) && /สูญเสียความสามารถ/.test(T)) {
    const cost = /เซ่นไหว้/.test(T) ? { sacrificeMyAvatar: {} } : undefined;
    const sym = /Symbol\s*(\S+)/.exec(T);
    if (sym && cost) cost.sacrificeMyAvatar.symbol = sym[1];
    if (/เซ่นไหว้/.test(T) && !cost) return null;
    return { abilities: [{ id: 'r', kind: 'response', responseTo: 'ability', oncePerTurn: true, cost, ops: [{ op: 'silence' }] }] };
  }
  // React: auto on specific magic-name use ("เมื่อมีการใช้ "คาถา" ... จั่ว)
  const mq = /เมื่อมีการใช้\s*"([^"]+)"/.exec(T);
  if (mq) {
    const tail = T.split('\n').slice(1).join('\n');
    const opsM = parseOpsBlock(tail || T, T);
    if (opsM.length) return { abilities: [{ id: 'r', kind: 'response', responseTo: 'magic', matchMagicName: mq[1], oncePerTurn: /เทิร์นละครั้ง/.test(T), ops: opsM }] };
  }
  // Response: own avatar destroyed by battle ("เมื่อ Avatar ... ถูกทำลายจากการต่อสู้ ... ใช้...")
  if (/ถูกทำลายจากการต่อสู้/.test(T) && /สามารถใช้/.test(T)) {
    const tail = T.split('\n').slice(1).join('\n');
    const opsB = parseOpsBlock(tail || T, T);
    if (opsB.length) return { abilities: [{ id: 'r', kind: 'response', responseTo: 'battleDestroyed', oncePerTurn: /เทิร์นละครั้ง/.test(T), ops: opsB }] };
  }
  // Response: own avatar battles ("เมื่อ Avatar ฝ่ายเราต่อสู้ ...")
  if (/เมื่อ\s*Avatar\s*ฝ่ายเรา\s*ต่อสู้/.test(T)) {
    const tail = T.split('\n').slice(1).join('\n');
    // effect may be cost:effect form ("เลือก X : ...")
    let body = tail || T;
    let cost;
    const cm = /^(เลือก\s*Modification Magic[^\n:]+?(\d+)\s*ใบ)\s*:\s*([\s\S]*)$/.exec(body.trim());
    if (cm) {
      const opsC = parseOpsBlock(cm[3], T);
      if (opsC.length) {
        // fold the select-then-use search into ops
        const allOps = [{ op: 'search', where: /นรก/.test(cm[1]) ? 'hellMine' : 'deckMine', filter: { type: 'Magic', subtype: 'Modification' }, n: 1, to: 'hand' }].concat(opsC);
        return { abilities: [{ id: 'r', kind: 'response', responseTo: 'battle', mineOnly: true, ops: allOps }] };
      }
    }
    const opsB2 = parseOpsBlock(body, T);
    if (opsB2.length) return { abilities: [{ id: 'r', kind: 'response', responseTo: 'battle', mineOnly: true, ops: opsB2 }] };
  }
  // Response: manual-trigger on own kill ("สั่งใช้ เมื่อ ... ทำลาย Avatar ...")
  if (/สั่งใช้\s*เมื่อ\s*(Avatar\s*ใบนี้|การ์ดใบนี้)\s*ทำลาย\s*Avatar/.test(T)) {
    const tail = T.split('\n').slice(1).join('\n');
    const opsK = parseOpsBlock(tail || T, T);
    if (opsK.length) return { abilities: [{ id: 'r', kind: 'response', responseTo: 'kill', oncePerTurn: /เทิร์นละครั้ง/.test(T), ops: opsK }] };
  }
  // Response: self-destruction replacement ("เมื่อ Avatar ใบนี้จะถูกทำลาย ... แทนการถูกทำลาย")
  if (/เมื่อ\s*Avatar\s*ใบนี้จะถูกทำลาย/.test(T)) {
    const tail = T.split('\n').slice(1).join('\n');
    if (/POWER\s*ตั้งต้น[^\n]*ลดลงครึ่งหนึ่ง/.test(tail + '\n' + T)) {
      return { abilities: [{ id: 'r', kind: 'response', responseTo: 'leaving', selfOnly: true, perSummon: true, ops: [{ op: 'halveBase' }, { op: 'negateEvent' }] }] };
    }
  }
  // Response: foe uses avatar ability -> compiled effect (incl. cost:effect form)
  if (/เมื่อ(อีกฝ่าย|ฝ่ายตรงข้าม)ใช้ความสามารถ(การ์ด|ของ\s*Avatar)?/.test(T)) {
    const tail = T.split('\n').slice(1).join('\n');
    const cm = /^(.+?)\s*:\s*([\s\S]+)$/.exec((tail || T).trim());
    if (cm) {
      const cost = parseCostHead(cm[1]);
      const opsC2 = parseOpsBlock(cm[2], T);
      if (cost && opsC2.length) {
        const ab = { id: 'r', kind: 'response', responseTo: 'ability', oncePerTurn: /เทิร์นละครั้ง/.test(T), ops: opsC2 };
        if (Object.keys(cost).length) ab.cost = cost;
        return { abilities: [ab] };
      }
    }
    const opsA = parseOpsBlock(tail || T, T);
    if (opsA.length) return { abilities: [{ id: 'r', kind: 'response', responseTo: 'ability', oncePerTurn: /เทิร์นละครั้ง/.test(T), ops: opsA }] };
  }
  return null;
}
function tryAuraSimple(T) {
  const auras = [];
  const re = /POWER\s*([+-])\s*(\d+)\s*ให้([^\n]+)/g;
  let m;
  while ((m = re.exec(T))) {
    const au = { type: 'power', v: (m[1] === '+' ? +m[2] : -+m[2]), desc: m[3] };
    const cp = /ตราบเท่าที่[^\n]*มี\s*"([^"]+)"/.exec(T);
    if (cp) au.cond = { presentName: cp[1] };
    else {
      const cs = /ตราบเท่าที่[^\n]*Symbol\s*\[?([^\]\s"“”]+)\]?/.exec(T) || /ตราบเท่าที่[^\n]*\{symbol\s*([^}]+)\}/.exec(T);
      if (cs) au.cond = { presentSymbol: cs[1] };
    }
    auras.push(au);
  }
  let rest = T.replace(/POWER\s*[+-]\s*\d+\s*ให้[^\n]+/g, '');
  rest = rest.replace(/ต่อเนื่อง[^\n]*\n?/g, '');
  rest = rest.replace(/\{[^}]*\}/g, '');
  rest = rest.replace(/Symbol\s*\[?[^\]\s"“”]*\]?/g, '');
  NATIVE_KW.forEach(k => { rest = rest.split(k).join(''); });
  rest = rest.replace(/[()\s:+\-\d\n"“”\[\]]/g, '');
  rest = rest.replace(/Avatar|ใบ|ทุก|ฝ่ายเรา|ฝ่ายตรงข้าม|บน|Zone|สนาม|ตราบเท่า|ที่|อยู่|และ|หรือ|ให้|มี|ใน|ของ|สัญลักษณ์|Symbol|เทพ|คน|ผี|สัตว์|มหัศจรรย์|จรรย์|อีกฝ่าย|ตัว|ลง|ไม่/g, '');
  if (rest.trim().length > 0) return { partial: true };
  return { abilities: [], auras };
}
function pLeaving(T) {
  const m = /เมื่อ\s*Avatar\s*"([^"]+)"[^\n]*จะถูกทำลาย/.exec(T);
  if (!m) return null;
  if (!/ทำลายการ์ดใบนี้[^\n]*แทน/.test(T)) return null;
  return { leaveName: m[1] };
}
function phaseOf(head) {
  // returns {phases, turn} or null=null
  let phases = ['main'], turn = 'mine';
  const m = /ในช่วง\s*(End|Battle|Draw|Main)\s*Phase/.exec(head || '');
  if (m) phases = [m[1].toLowerCase() === 'end' ? 'end' : m[1].toLowerCase() === 'battle' ? 'battle' : m[1].toLowerCase() === 'draw' ? 'draw' : 'main'];
  if (/ในเทิร์นใครก็ได้|เทิร์นใครก็ได้|ผู้เล่นใดก็ได้/.test(head || '')) turn = undefined;
  else if (/ในเทิร์นฝ่ายตรงข้าม|เทิร์นฝ่ายตรงข้าม/.test(head || '')) turn = 'foe';
  return { phases, turn };
}
function locOf(head, body) {
  const h = (head || '') + ' ' + (body || '').split('\n')[0];
  if (/อยู่ในนรก/.test(h)) return 'hell';
  if (/จากบนมือ/.test(h)) return 'hand';
  return undefined;
}
function parseChoose(body) {
  const parts = body.split(/(?=\d+\)\s)/).map(s => s.trim()).filter(Boolean);
  // drop preamble before first numbered branch ("เทิร์นละครั้ง เลือกปฏิบัติ :")
  while (parts.length && !/^\d+\)/.test(parts[0])) parts.shift();
  if (parts.length < 2 || !/^\d+\)/.test(parts[0])) return null;
  const branches = [];
  for (const p of parts) {
    const m = /^\d+\)\s*([\s\S]*)$/.exec(p);
    if (!m) return null;
    const ops = parseOpsBlock(m[1], body);
    if (!ops.length) return null;
    branches.push({ ops, notes: ops.failed });
  }
  let bothWhen = null;
  const bm = /ถ้า\s*Life Card[^\n]*หงายตั้งแต่\s*(\d+)\s*ใบขึ้นไป/.exec(body);
  if (bm) bothWhen = 'FN_LIFE_GE_' + (+bm[1]);
  return { branches, bothWhen };
}
function pGrantKw(T) {
  const m = /สวมใส่[^\n]*ได้รับ(?:ความสามารถ)?\s*([^\s(（\n]+)/.exec(T);
  if (!m) return null;
  const kw = m[1].replace(/[.,]/g, '');
  if (!/เตะไข่|โล่มนุษย์|สามัคคี|แทงหลัง|ลูกฮึด/.test(kw)) return null;
  return kw;
}
// ---------------- block + card ----------------
const BATTLE_KW = /^(สามัคคี|แทงหลัง|โล่มนุษย์|เตะไข่|ลูกฮึด|พอดี)/;
function isNativeText(t) {
  if (!t.trim()) return true;
  t = t.replace(/POWER\s*[+-]\s*\d+/g, '');
  t = t.replace(/อัตโนมัติ\s*เมื่อ\s*Avatar\s*ใบนี้โจมตี[^\n]*จนจบเทิร์น/g, '');
  NATIVE_KW.forEach(k => { t = t.split(k).join(''); });
  t = t.replace(/[()\s:+\-\d\n]/g, '');
  t = t.replace(/Avatar|ใบ|นี้|ที่|ใน|บน|และ|หรือ|จนจบ|การต่อสู้|โจมตี/g, '');
  return t.trim().length === 0;
}
function compileBlock(T, c) {
  const life = tryLifeDelayed(T);
  if (life) return { kind: 'auto', script: life };
  if ((c.type === 'Magic' && c.subtype === 'React') || /^เมื่อ/.test(T)) {
    const r = tryResponse(T, c);
    if (r) return { kind: 'auto', script: r };
  }
  const lv = pLeaving(T);
  if (lv && T.split(/\n+/).filter(s => s.trim()).length === 1) {
    return { kind: 'auto', script: { abilities: [{ id: 'sv', name: 'ตายแทน', kind: 'response', responseTo: 'leaving',
      matchName: lv.leaveName, equippedOnly: /สวมใส่/.test(T), cost: { destroySelf: true }, ops: [{ op: 'negateEvent' }] }] } };
  }
  // self attack-ban (ต่อเนื่อง ... โจมตีไม่ได้)
  if (/^ต่อเนื่อง[^\n]*การ์ดใบนี้[^\n]*ไม่?สามารถโจมตี/.test(T)) {
    const ban = /LIFE/.test(T) ? 'life' : 'all';
    const rest = T.replace(/^[^\n]*\n?/, '');
    if (!rest.trim() || isNativeText(rest)) {
      return { kind: 'auto', script: { attackBanSelf: [ban], abilities: [] } };
    }
  }
  // indestructible vs abilities ("จะไม่ถูกทำลายจากความสามารถการ์ด")
  if (/จะไม่ถูกทำลายจากความสามารถการ์ด/.test(T)) {
    const rest = T.replace(/^[^\n]*จะไม่ถูกทำลายจากความสามารถการ์ด[^\n]*\n?/, '');
    if (rest === T) return { kind: 'partial' };
    const sub = compileBlock(rest, c);
    if (sub && sub.kind === 'auto') {
      sub.script.destructible = { ability: false };
      return sub;
    }
    if (!rest.trim() || isNativeText(rest)) {
      return { kind: 'auto', script: { destructible: { ability: false }, abilities: [] } };
    }
  }
  // ability-untargetable ("จะไม่ถูกเล็งเป้าด้วยความสามารถการ์ดฝ่ายตรงข้าม")
  if (/จะไม่ถูกเล็งเป้าด้วยความสามารถการ์ดฝ่ายตรงข้าม/.test(T)) {
    const rule = {};
    const scope = /Avatar\s*"([^"]+)"[^]*?จะไม่ถูกเล็งเป้า|จะไม่ถูกเล็งเป้า[^]*?Avatar\s*"([^"]+)"/.exec(T);
    const nm = /Avatar\s*"([^"]+)"[^]*?จะไม่ถูกเล็งเป้า/.exec(T) || /จะไม่ถูกเล็งเป้า[^]*?Avatar\s*"([^"]+)"/.exec(T);
    if (nm) rule.nameContains = nm[1];
    const sym = /Symbol\s*\[?([^\]\s"“”]+)\]?[^]*?จะไม่ถูกเล็งเป้า/.exec(T) || /จะไม่ถูกเล็งเป้า[^]*?Symbol\s*\[?([^\]\s"“”]+)\]?/.exec(T);
    if (sym) rule.symbol = sym[1];
    const rest = T.replace(/^[^\n]*จะไม่ถูกเล็งเป้าด้วยความสามารถการ์ดฝ่ายตรงข้าม[^\n]*\n?/, '');
    if (rest === T) return { kind: 'partial' };
    const sub = rest.trim() ? compileBlock(rest, c) : { kind: 'auto', script: { abilities: [] } };
    if (sub && sub.kind === 'auto') {
      (sub.script.abilityUntarget = sub.script.abilityUntarget || []).push(rule);
      return sub;
    }
  }
  if (/^ต่อเนื่อง/.test(T) || ((c.type === 'Construct' || (c.type === 'Magic' && c.subtype === 'Land')) && /POWER\s*[+-]\s*\d+\s*ให้/.test(T))) {
    const a = tryAuraSimple(T);
    if (a && !a.partial) return { kind: 'auto', script: a };
    if (a && a.partial) return { kind: 'partial' };
  }
  // (selfPer + summonBan handled at compileCard level so they merge with other blocks)
  const sp = splitTrigger(T);
  if (sp) {
    if (/เลือกปฏิบัติ/.test(sp.body)) {
      const ch = parseChoose(sp.body);
      if (!ch) return { kind: 'partial' };
      const ab = { id: 'a', choose: ch.branches };
      if (sp.trigger === 'activated') {
        ab.kind = 'activated'; ab.oncePerTurn = !!sp.once;
        const ph = phaseOf(sp.costHead || '');
        ab.phases = ph.phases; if (ph.turn) ab.turn = ph.turn;
        const lc = locOf(sp.costHead || '', T);
        if (lc) ab.location = lc;
        if (sp.location) ab.location = sp.location;
        const cost = parseCostHead(sp.costHead || '');
        if (!cost) return { kind: 'partial' };
        if (Object.keys(cost).length) ab.cost = cost;
      } else {
        ab.kind = 'triggered'; ab.trigger = sp.trigger;
        if (sp.costHead !== undefined) {
          const cost = parseCostHead(sp.costHead || '');
          if (!cost) return { kind: 'partial' };
          if (Object.keys(cost).length) ab.cost = cost;
        }
      }
      if (ch.bothWhen && ch.bothWhen.startsWith('FN_LIFE_GE_')) ab.bothWhen = ch.bothWhen;
      if (sp.condData) ab.condData = sp.condData;
      if (/นับเป็นการใช้ React Magic/.test(T)) ab.countsAsReact = true;
      return { kind: 'auto', script: { abilities: [ab] } };
    }
    const ops = parseOpsBlock(sp.body, T);
    if (!ops.length) return { kind: 'partial' };
    const ab = { id: 'a', ops };
    if (sp.trigger === 'activated') {
      ab.kind = 'activated'; ab.oncePerTurn = !!sp.once;
      const ph = phaseOf(sp.costHead || '');
      ab.phases = ph.phases; if (ph.turn) ab.turn = ph.turn;
      const lc = locOf(sp.costHead || '', T);
      if (lc) ab.location = lc;
      if (sp.location) ab.location = sp.location;
      const cost = parseCostHead(sp.costHead || '');
      if (!cost) return { kind: 'partial' };
      if (Object.keys(cost).length) ab.cost = cost;
    } else if (sp.costHead !== undefined) {
      ab.kind = 'triggered'; ab.trigger = sp.trigger;
      const cost = parseCostHead(sp.costHead || '');
      if (!cost) return { kind: 'partial' };
      if (Object.keys(cost).length) ab.cost = cost;
    } else if (sp.trigger === 'onPaidAsCost') {
      ab.kind = 'triggered'; ab.trigger = 'onPaidAsCost'; ab.needsHost = true;
    } else if (sp.trigger === 'onEquip') {
      ab.kind = 'triggered'; ab.trigger = 'onEquip';
    } else {
      ab.kind = 'triggered'; ab.trigger = sp.trigger;
    }
    if (sp.once) ab.oncePerTurn = true;
    if (sp.condData) ab.condData = sp.condData;
    if (/นับเป็นการใช้ React Magic/.test(T)) ab.countsAsReact = true;
    const abs = [{ ...ab, id: 'a' }];
    if (sp.twin) abs.push({ ...ab, id: 'a2', trigger: sp.twin });
    return { kind: 'auto', script: { abilities: abs } };
  }
  if (c.type === 'Magic' && (c.subtype === 'Normal' || c.subtype === 'Modification' || c.subtype === 'Land')) {
    if (c.subtype === 'Modification') {
      const g = pGrantKw(T);
      const rest = T.replace(/สวมใส่[^\n]*ได้รับ(?:ความสามารถ)?\s*[^\s(（\n]+[^\n]*/, '');
      if (g && !/จั่ว|ทำลาย|สอดแนม|สั่งใช้|เลือก|POWER/.test(rest)) {
        return { kind: 'auto', script: { equipGrants: [g], abilities: [] } };
      }
      // conditional equip power: "X ที่สวมใบนี้ POWER ±N" (+ optional control condition)
      const rules = [];
      const re2 = /([^\n]*?)ที่สวม(ใบนี้|การ์ดใบนี้)\s*POWER\s*([+-])\s*(\d+)/g;
      let m2, badPow = false;
      const tmp = T;
      while ((m2 = re2.exec(tmp))) {
        const rule = { v: (m2[3] === '+' ? +m2[4] : -+m2[4]) };
        const q = /"([^"]+)"/.exec(m2[1]);
        if (q) rule.hostName = q[1];
        const cc = /ตราบเท่าที่เราควบคุม\s*"([^"]+)"/.exec(T);
        if (cc) rule.requireControl = cc[1];
        else if (/ตราบเท่า/.test(T)) badPow = true;
        rules.push(rule);
      }
      const rest2 = T.replace(/[^\n]*ที่สวม(?:ใบนี้|การ์ดใบนี้)\s*POWER\s*[+-]\s*\d+[^\n]*/g, '').replace(/ตราบเท่าที่เราควบคุม\s*"[^"]+"[^\n]*/g, '');
      if (rules.length && !badPow && !/จั่ว|ทำลาย|สอดแนม|สั่งใช้|เลือก|ต่อเนื่อง|อัตโนมัติ|เมื่อ/.test(rest2)) {
        return { kind: 'auto', script: { equipBonus: rules, abilities: [] } };
      }
      if (/POWER\s*\+\s*\d+/.test(T) && !/จั่ว|ทำลาย|สอดแนม|สั่งใช้|เลือก/.test(T)) {
        return { kind: 'auto', script: { abilities: [] } };
      }
      return { kind: 'partial' };
    }
    const ops = parseOpsBlock(T, T);
    if (ops.length) return { kind: 'auto', script: { abilities: [{ id: 'a', kind: 'triggered', trigger: 'onResolve', ops }] } };
  }
  if (isNativeText(T)) return { kind: 'auto', script: { abilities: [] } };
  const SUB = [/จั่วการ์ด?\s*\d+\s*ใบ/, /ทำลาย\s*Avatar/, /POWER\s*[+-]\s*\d+/, /สอดแนม\s*\d+/, /ธรณีสูบ\s*\d+/, /เนรเทศ/, /ขึ้นมือ/, /สวมใส่/, /สั่งใช้/, /จุติ/, /คำสั่งเสีย/, /ต่อเนื่อง/, /อัตโนมัติ/, /สับ\s*Deck/];
  if (SUB.some(re => re.test(T))) return { kind: 'partial' };
  return { kind: 'manual' };
}
const HEADS = /^(จุติ|คำสั่งเสีย|เทิร์นละครั้ง|สั่งใช้|อัตโนมัติ|ต่อเนื่อง|เมื่อ|เลือกปฏิบัติ|สามัคคี|แทงหลัง|โล่มนุษย์|เตะไข่|ลูกฮึด|พอดี)/;
function compileCard(c) {
  let T = norm(c.mainEffect);
  if (!T) return { kind: 'vanilla' };
  // card-level attributes stripped before block compile, merged at the end
  const extra = {};
  if (/ไม่สามารถลงสนามจากบนมือ/.test(T)) {
    extra.summonBanFrom = ['hand'];
    T = T.replace(/[^\n]*ไม่สามารถลงสนามจากบนมือ[^\n]*\n?/g, '').trim();
    if (!T) return { kind: 'auto', script: Object.assign({ abilities: [] }, extra) };
  }
  {
    const m = /POWER\s*ของการ์ดใบนี้จะเพิ่มขึ้นตาม\s*([^\n]+?)\s*ใบละ\s*(\d+)/.exec(T);
    if (m) {
      let per = null;
      if (/สภาพนอน/.test(m[1])) per = 'tappedBoth';
      else if (/LIFE[^\n]*หงาย/.test(m[1])) per = 'lifeOpenMine';
      else {
        const h = /ในนรก.*"([^"]+)"/.exec(m[1]);
        if (h) per = { hellName: h[1] };
      }
      if (per) {
        extra.selfPer = [{ v: +m[2], per }];
        T = T.replace(/POWER\s*ของการ์ดใบนี้จะเพิ่มขึ้นตาม[^\n]+\n?/g, '').trim();
        if (!T || isNativeText(T)) {
          const sc = Object.assign({ abilities: [] }, extra);
          return { kind: 'auto', script: sc };
        }
      }
    }
  }
  // conditional equip power on any card ("X ที่สวมใบนี้ POWER ±N" + optional control cond)
  {
    const rules = [];
    const re2 = /([^\n]*?)ที่สวม(ใบนี้|การ์ดใบนี้)\s*POWER\s*([+-])\s*(\d+)/g;
    let m2, badPow = false;
    const tmp = T;
    while ((m2 = re2.exec(tmp))) {
      const rule = { v: (m2[3] === '+' ? +m2[4] : -+m2[4]) };
      const q = /"([^"]+)"/.exec(m2[1]);
      if (q) rule.hostName = q[1];
      const cc = /ตราบเท่าที่เราควบคุม\s*"([^"]+)"/.exec(T);
      if (cc) rule.requireControl = cc[1];
      else if (/ตราบเท่า/.test(T)) { badPow = true; break; }
      rules.push(rule);
    }
    if (rules.length && !badPow) {
      extra.equipBonus = (extra.equipBonus || []).concat(rules);
      T = T.replace(/[^\n]*ที่สวม(?:ใบนี้|การ์ดใบนี้)\s*POWER\s*[+-]\s*\d+[^\n]*\n?/g, '').replace(/ตราบเท่าที่เราควบคุม\s*"[^"]+"[^\n]*\n?/g, '').trim();
      if (!T || isNativeText(T)) {
        const sc = Object.assign({ abilities: [] }, extra);
        return { kind: 'auto', script: sc };
      }
    }
  }
  const lines = T.split(/\n/);
  const blocks = [];
  let cur = '';
  lines.forEach(ln => {
    let t = ln.trim();
    if (!t) return;
    if (/^-\s+/.test(t)) t = t.slice(1).trim();
    if (HEADS.test(t) && cur) { blocks.push(cur); cur = t; }
    else cur = cur ? cur + '\n' + t : t;
  });
  if (cur) blocks.push(cur);
  function withExtra(r) {
    if (r && r.kind === 'auto') {
      if (extra.summonBanFrom) r.script.summonBanFrom = extra.summonBanFrom;
      (extra.selfPer || []).forEach(s => { (r.script.selfPer = r.script.selfPer || []).push(s); });
      (extra.equipBonus || []).forEach(s => { (r.script.equipBonus = r.script.equipBonus || []).push(s); });
    }
    return r;
  }
  if (blocks.length <= 1) return withExtra(compileBlock(T, c));
  const merged = { abilities: [] };
  const notes = [];
  let aid = 0, okAny = false;
  for (const b of blocks) {
    if (isNativeText(b)) continue;
    if (BATTLE_KW.test(b)) continue;
    const r = compileBlock(b, c);
    if (!r || r.kind !== 'auto') { notes.push(b.slice(0, 160)); continue; }
    okAny = true;
    (r.script.abilities || []).forEach(a => { a.id = 'b' + (aid++) + '_' + a.id; merged.abilities.push(a); });
    (r.script.auras || []).forEach(a => { (merged.auras = merged.auras || []).push(a); });
    (r.script.equipGrants || []).forEach(g => { (merged.equipGrants = merged.equipGrants || []).push(g); });
    if (r.script.ignoreMagicLimit) merged.ignoreMagicLimit = true;
    if (r.script.usableAsReact) merged.usableAsReact = true;
    (r.script.attackBanSelf || []).forEach(x => { (merged.attackBanSelf = merged.attackBanSelf || []).push(x); });
    if (r.script.destructible) merged.destructible = r.script.destructible;
    (r.script.abilityUntarget || []).forEach(x => { (merged.abilityUntarget = merged.abilityUntarget || []).push(x); });
  }
  if (!okAny) return { kind: 'partial' };
  if (notes.length) merged.manualNotes = notes;
  if (extra.summonBanFrom) merged.summonBanFrom = extra.summonBanFrom;
  (extra.selfPer || []).forEach(s => { (merged.selfPer = merged.selfPer || []).push(s); });
  (extra.equipBonus || []).forEach(s => { (merged.equipBonus = merged.equipBonus || []).push(s); });
  return { kind: 'auto', script: merged };
}
// ---------------- run ----------------
const auto = {};
const cov = { HAND: 0, AUTO: 0, VANILLA: 0, NATIVE: 0, PARTIAL: 0, MANUAL: 0 };
const partialList = [], manualList = [];
byPrint.forEach((c, pr) => {
  if (HAND[pr]) { cov.HAND++; return; }
  if (!norm(c.mainEffect)) { cov.VANILLA++; return; }
  const r = compileCard(c);
  if (r.kind === 'auto') {
    // finalize: equipSelfTo needs host picks; untap is per-battle; collect unparsed clauses as notes
    const noteSet = [];
    (r.script.abilities || []).forEach(ab => {
      const ops = ab.ops || [];
      (ab.choose || []).forEach(ch => {
        (ch.ops || []).forEach(o => ops.push(o));
        (ch.ops && ch.ops.failed || []).forEach(t => noteSet.push(t));
      });
      if (ops.some(o => o.op === 'equipSelfTo') && !ab.needsHost) {
        ab.needsHost = true;
        const hs = ops.map(o => o._hostSpec).find(x => x);
        if (hs) ab.hostSpec = hs;
      }
      if (ops.some(o => o.op === 'untap')) ab.perBattle = true;
      ops.forEach(o => { delete o._hostSpec; });
      (ops.failed || []).forEach(t => noteSet.push(t));
    });
    if (noteSet.length) {
      r.script.manualNotes = (r.script.manualNotes || []).concat([...new Set(noteSet)]);
    }
    auto[pr] = r.script; cov.AUTO++;
  }
  else if (r.kind === 'vanilla') cov.VANILLA++;
  else if (r.kind === 'native') cov.NATIVE++;
  else if (r.kind === 'partial') { cov.PARTIAL++; partialList.push(pr); }
  else { cov.MANUAL++; manualList.push(pr); }
});
let js = '/* AUTO-GENERATED by tools/compile.js - do not hand-edit. Hand scripts in card-scripts.js win. */\n';
js += '(function (root, factory) {\n  if (typeof module !== \'undefined\' && module.exports) module.exports = factory();\n';
js += '  else { root.BoTCardScripts = root.BoTCardScripts || {}; var a = factory(); Object.keys(a).forEach(function(k){ if (!root.BoTCardScripts[k]) root.BoTCardScripts[k] = a[k]; }); }\n';
js += '})(typeof self !== \'undefined\' ? self : this, function () {\n';
js += '  function lifeGE(n){ return function(st, me){ var a = st.players[me].life.filter(function(l){return l.open;}).length; var b = st.players[1-me].life.filter(function(l){return l.open;}).length; return a >= n && a > b; }; }\n';
js += '  function auraMatch(desc, cond) {\n';
js += '    var sym = /[Ss]ymbol\\s*\\[?\\{?([^\\]\\s"“”}]+)\\}?\\]?/.exec(desc || \'\');\n';
js += '    var nm = /"([^"]+)"/.exec(desc || \'\');\n';
js += '    var hasMine = /ฝ่ายเรา|ของเรา/.test(desc || \'\');\n';
js += '    var hasFoe = /ฝ่ายตรงข้าม|อีกฝ่าย/.test(desc || \'\');\n';
js += '    var side = hasMine && !hasFoe ? \'mine\' : (!hasMine && hasFoe ? \'foe\' : ((/สนามทุกใบ|ทุกใบ.*สนาม|บนสนาม/.test(desc || \'\') && !hasMine && !hasFoe) ? \'either\' : \'mine\'));\n';
js += '    return function(st, ctrl, inst, src){ if (inst.uid === src.uid) return false; if (side !== \'either\' && inst.controller !== (side === \'mine\' ? ctrl : 1 - ctrl)) return false; if (inst.db.type !== \'Avatar\') return false; if (sym && inst.db.symbol !== sym[1] && inst.resymbolTo !== sym[1]) return false; if (nm && (inst.db.name || \'\').indexOf(nm[1]) < 0 && (inst.renamedTo || \'\').indexOf(nm[1]) < 0) return false; if (cond) { var p = st.players[ctrl]; var ok = p.avatar.concat(p.construct).some(function(c){ if (cond.presentName && (c.db.name || \'\').indexOf(cond.presentName) < 0) return false; if (cond.presentSymbol && c.db.symbol !== cond.presentSymbol) return false; return true; }); if (!ok) return false; } return true; };\n  }\n';
js += '  var S = ' + JSON.stringify(auto, null, 1).replace(/"FN_LIFE_GE_(\d+)"/g, 'lifeGE($1)') + ';\n';
js += '  Object.keys(S).forEach(function(k){ (S[k].auras || []).forEach(function(a){ if (a.desc) a.match = auraMatch(a.desc, a.cond); }); });\n';
js += '  return S;\n});\n';
fs.writeFileSync(path.join(ROOT, 'card-scripts-auto.js'), js);
const total = byPrint.size;
console.log('COVERAGE (unique prints=' + total + '):');
['HAND', 'AUTO', 'VANILLA', 'NATIVE', 'PARTIAL', 'MANUAL'].forEach(k => console.log(' ' + k + ': ' + cov[k]));
const ap = cov.HAND + cov.AUTO + cov.VANILLA;
console.log('AUTO-PLAYABLE: ' + ap + ' (' + Math.round(ap / total * 100) + '%)');
fs.writeFileSync(path.join(__dirname, 'coverage.json'), JSON.stringify({ cov, total, partialList, manualList }, null, 1));
