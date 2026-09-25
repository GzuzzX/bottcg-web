# Battle of Talingchan — คู่มือทำทุกอย่างที่ขาด (ละเอียดยิบ)

> คู่มือนี้ออกแบบให้ AI ตัวอื่นอ่านแล้วทำตามได้ทันที ทุก task แยกอิสระจากกัน ทำทีละ task ได้

## สารบัญ

1. [TASK-01: แก้ Bug Magic Limit Reset](#task-01)
2. [TASK-02: แก้ Bug Token ไม่หายจากเกม](#task-02)
3. [TASK-03: AI ใช้ Normal Magic](#task-03)
4. [TASK-04: AI วาง Land](#task-04)
5. [TASK-05: AI ยกเลิก summon cap + เล่นฉลาดขึ้น](#task-05)
6. [TASK-06: Mobile Responsive](#task-06)
7. [TASK-07: สร้างไฟล์ sounds.js — เสียงเกม](#task-07)
8. [TASK-08: ใส่เสียงใน game.html](#task-08)
9. [TASK-09: CSS Animations](#task-09)
10. [TASK-10: โล่มนุษย์เลือกตัวได้](#task-10)
11. [TASK-11: Hotseat Transition Screen](#task-11)
12. [TASK-12: Deck Export](#task-12)
13. [TASK-13: Deck Statistics](#task-13)
14. [TASK-14: Card Pool Pagination (index.html + decks.html)](#task-14)
15. [TASK-15: Banlist Enforcement](#task-15)
16. [TASK-16: เพิ่ม Starter Decks](#task-16)
17. [TASK-17: Confirm ก่อนทำ Action](#task-17)
18. [TASK-18: Online Multiplayer](#task-18)

---

<a id="task-01"></a>
## TASK-01: แก้ Bug Magic Limit Reset

### ปัญหา
ไฟล์ `engine.js` บรรทัด 682: เมื่อจบเทิร์น ระบบ reset `magicUsed = {}` แค่ของผู้เล่นที่จบเทิร์น แต่ไม่ reset ของอีกฝ่าย ทำให้ถ้าฝ่ายนั้นใช้ React Magic ในเทิร์นของคู่ต่อสู้ พอถึงเทิร์นตัวเองจะใช้ React ไม่ได้ (เพราะ `magicUsed.React = 1` ค้างอยู่)

### ไฟล์ที่แก้
`engine.js`

### วิธีแก้
ที่บรรทัด 679-682 เดิมคือ:
```js
    if (st.phase === 'end') {
      const p = me(st);
      while (p.hand.length > 7) { const d = p.hand.pop(); p.hell.push(d); }
      p.magicUsed = {};
```

เปลี่ยนเป็น:
```js
    if (st.phase === 'end') {
      const p = me(st);
      while (p.hand.length > 7) { const d = p.hand.pop(); p.hell.push(d); }
      p.magicUsed = {};
      // reset อีกฝ่ายด้วย เพราะ React ที่ใช้ในเทิร์นนี้ไม่ควรค้างไปเทิร์นหน้า
      foe(st).magicUsed = {};
```

### ทดสอบ
เปิดเกม > ใช้ React Magic ในเทิร์นของคู่ต่อสู้ > พอถึงเทิร์นตัวเอง ต้องใช้ React Magic ได้อีก

---

<a id="task-02"></a>
## TASK-02: แก้ Bug Token ไม่หายจากเกม

### ปัญหา
ไฟล์ `engine.js` บรรทัด 347: เมื่อ Token ถูกทำลาย มันจะถูก push เข้า `owner.hell` เหมือนการ์ดปกติ แต่ตามกฎ Token ต้องหายไปจากเกมเลย

### ไฟล์ที่แก้
`engine.js`

### วิธีแก้
ที่บรรทัด 345-348 เดิมคือ:
```js
    const wasEquipped = inst.equippedTo !== null && inst.equippedTo !== undefined;
    removeFromZones(st, inst);
    owner.hell.push(inst);
    slog(st, inst.db.name + ' ถูกทำลาย' + (reason ? ' (' + reason + ')' : ''));
```

เปลี่ยนเป็น:
```js
    const wasEquipped = inst.equippedTo !== null && inst.equippedTo !== undefined;
    removeFromZones(st, inst);
    if (inst.isToken) {
      slog(st, inst.db.name + ' (Token) ถูกทำลาย — หายไปจากเกม' + (reason ? ' (' + reason + ')' : ''));
    } else {
      owner.hell.push(inst);
      slog(st, inst.db.name + ' ถูกทำลาย' + (reason ? ' (' + reason + ')' : ''));
    }
```

ต้องแก้ฟังก์ชัน `bounceInst` ด้วย (บรรทัด 363-368) — Token ที่ bounce กลับมือก็ต้องหายไป:

เดิม:
```js
  function bounceInst(st, inst) {
    const owner = st.players[inst.owner];
    removeFromZones(st, inst);
    owner.hand.push(inst);
    slog(st, inst.db.name + ' กลับขึ้นมือ');
    return true;
  }
```

เปลี่ยนเป็น:
```js
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
```

### ทดสอบ
เล่นเกมที่มีการ summon Token (ค้นใน cards.json หา type === "Token") > ทำลาย Token > เช็คว่า Token ไม่อยู่ใน Hell zone

---

<a id="task-03"></a>
## TASK-03: AI ใช้ Normal Magic

### ปัญหา
`ai.js` ฟังก์ชัน `botMain()` (บรรทัด 36-67) ไม่มี logic ใช้ Normal Magic เลย

### ไฟล์ที่แก้
`ai.js`

### วิธีแก้
เพิ่มฟังก์ชัน `botMagic` หลังฟังก์ชัน `botDiscard` (หลังบรรทัด 109):
```js
  function botMagic(E, st, pIdx) {
    const acts = [];
    const p = st.players[pIdx];
    // 1) เล่นการ์ดจั่ว (Normal Magic ที่มีข้อความ "จั่ว")
    const drawCards = p.hand.filter(c => c.db.type === 'Magic' && (c.db.subtype === 'Normal' || !c.db.subtype) &&
      /จั่ว/.test(c.db.mainEffect || ''));
    for (const c of drawCards) {
      if ((p.magicUsed['Normal'] || 0) >= 1) break;
      const r = E.playMagic(st, pIdx, c.uid, {});
      if (r.ok) { acts.push('magic-draw ' + c.db.name); break; }
    }
    // 2) เล่นการ์ดทำลาย Avatar ฝั่งตรงข้าม
    const f = st.players[1 - pIdx];
    if (f.avatar.length > 0) {
      const killCards = p.hand.filter(c => c.db.type === 'Magic' && (c.db.subtype === 'Normal' || !c.db.subtype) &&
        /ทำลาย/.test(c.db.mainEffect || '') && !/จั่ว/.test(c.db.mainEffect || ''));
      for (const c of killCards) {
        if ((p.magicUsed['Normal'] || 0) >= 1) break;
        const r = E.playMagic(st, pIdx, c.uid, {});
        if (r.ok) { acts.push('magic-kill ' + c.db.name); break; }
      }
    }
    // 3) เล่นการ์ด buff (Normal Magic ที่มี POWER +)
    if (p.avatar.length > 0) {
      const buffCards = p.hand.filter(c => c.db.type === 'Magic' && (c.db.subtype === 'Normal' || !c.db.subtype) &&
        /POWER\s*\+/.test(c.db.mainEffect || '') && !/จั่ว|ทำลาย/.test(c.db.mainEffect || ''));
      for (const c of buffCards) {
        if ((p.magicUsed['Normal'] || 0) >= 1) break;
        const r = E.playMagic(st, pIdx, c.uid, {});
        if (r.ok) { acts.push('magic-buff ' + c.db.name); break; }
      }
    }
    return acts;
  }
```

แล้วแก้ `botMain` — หลังลูป summon (หลังบรรทัด 51 ที่ `acts.push('summon '...)`) เพิ่ม:
```js
    // play Normal Magic
    const magicActs = botMagic(E, st, pIdx);
    magicActs.forEach(a => acts.push(a));
```

แก้ return ที่บรรทัด 137:
```js
  return { choosePay, botMain, botBattle, botDiscard, botAbilities, botMagic };
```

### ทดสอบ
เล่น vs AI > สังเกตว่า bot ใช้ Normal Magic (ดูที่ Log box ว่ามีข้อความ "ใช้ Normal")

---

<a id="task-04"></a>
## TASK-04: AI วาง Land

### ไฟล์ที่แก้
`ai.js`

### วิธีแก้
เพิ่มฟังก์ชัน `botLand` หลัง `botMagic` ที่เพิ่มใน TASK-03:
```js
  function botLand(E, st, pIdx) {
    const p = st.players[pIdx];
    const lands = p.hand.filter(c => c.db.type === 'Magic' && c.db.subtype === 'Land');
    if (!lands.length) return [];
    if ((p.magicUsed['Land'] || 0) >= 1) return [];
    const c = lands[0];
    const r = E.playMagic(st, pIdx, c.uid, {});
    if (r.ok) return ['land ' + c.db.name];
    return [];
  }
```

เรียกใน `botMain` หลังเรียก `botMagic`:
```js
    // play Land
    const landActs = botLand(E, st, pIdx);
    landActs.forEach(a => acts.push(a));
```

เพิ่มใน return: `botLand`

### ทดสอบ
ให้แน่ใจว่าในเด็คบอทมี Land card > เล่น > ดู Log ว่า bot วาง Land

---

<a id="task-05"></a>
## TASK-05: AI ยกเลิก summon cap + เล่นฉลาดขึ้น

### ไฟล์ที่แก้
`ai.js`

### วิธีแก้

**5a) ยกเลิก summon limit 2 ต่อเทิร์น**

บรรทัด 40 เดิม:
```js
    for (let k = 0; k < 2; k++) {
```
เปลี่ยนเป็น:
```js
    for (let k = 0; k < 6; k++) {
```
(ใช้ 6 เป็น soft cap เพราะ Avatar zone max 6 — ลูปจะหยุดเองเมื่อ zone เต็มหรือ GEM หมด)

**5b) AI เก็บ support unit ไว้ป้องกัน**

บรรทัด 74-76 ในฟังก์ชัน `botBattle` เดิม:
```js
      const supps = p.avatar.filter(s => s.uid !== a.uid && !s.tapped && (E.hasKw(s, 'สามัคคี') || E.hasKw(s, 'แทงหลัง')));
      const supIds = supps.map(s => s.uid);
```
เปลี่ยนเป็น:
```js
      // เก็บไว้อย่างน้อย 1 ตัวไม่ tap ถ้าฝ่ายตรงข้ามยังมี avatar
      const supps = p.avatar.filter(s => s.uid !== a.uid && !s.tapped && (E.hasKw(s, 'สามัคคี') || E.hasKw(s, 'แทงหลัง')));
      const keepDefenders = f.avatar.length > 0 ? 1 : 0;
      const usable = supps.length > keepDefenders ? supps.slice(0, supps.length - keepDefenders) : [];
      const supIds = usable.map(s => s.uid);
```

### ทดสอบ
เล่น vs AI > สังเกตว่า bot summon มากกว่า 2 ตัวถ้ามี GEM พอ และไม่ tap ทุกตัวเวลาโจมตี

---

<a id="task-06"></a>
## TASK-06: Mobile Responsive

### ไฟล์ที่แก้
`game.html`, `index.html`, `decks.html`

### วิธีแก้
เพิ่ม CSS media query ต่อท้ายก่อน `</style>` ในแต่ละไฟล์:

**game.html** — เพิ่มก่อนบรรทัด 36 (`</style>`):
```css
@media(max-width:768px){
  header{flex-direction:column;align-items:stretch;gap:6px}
  header h1{font-size:14px}
  #board{padding:6px}
  .zone{padding:6px;margin:4px 0}
  .zone h3{font-size:11px}
  .row{gap:4px;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;padding-bottom:4px}
  .mini{width:80px;min-width:80px;font-size:10px}
  .mini .t{padding:3px;min-height:36px}
  #hand .mini{width:90px;min-width:90px}
  .life{width:60px;height:85px;font-size:9px;min-width:60px}
  #log{height:140px;font-size:11px}
  #modal .box{max-width:95vw;padding:10px}
  button{padding:8px 10px;font-size:13px}
  #phase{padding:4px 8px;font-size:13px}
}
@media(max-width:480px){
  .mini{width:68px;min-width:68px}
  #hand .mini{width:76px;min-width:76px}
  .life{width:50px;height:70px;font-size:8px;min-width:50px}
  header h1{font-size:12px}
}
```

**index.html** — เพิ่มก่อนบรรทัด 34 (`</style>`):
```css
@media(max-width:768px){
  #grid{grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px}
  .card .nm{font-size:11px;padding:4px}
  section{padding:8px}
  header{flex-direction:column;gap:6px}
}
```

**decks.html** — เพิ่มก่อนบรรทัด 33 (`</style>`):
```css
@media(max-width:600px){
  main{grid-template-columns:1fr!important}
  aside{position:static!important}
  #pool{max-height:50vh}
}
```

### ทดสอบ
เปิด Chrome DevTools > Toggle device toolbar > เลือก iPhone SE หรือ 375px > ดูว่า layout ไม่แตก + สามารถ scroll การ์ดได้

---

<a id="task-07"></a>
## TASK-07: สร้างไฟล์ sounds.js — เสียงเกม

### ไฟล์ที่สร้างใหม่
`sounds.js` ในโฟลเดอร์โปรเจกต์ (`e:\L\bottcg-game\sounds.js`)

### โค้ดทั้งไฟล์
```js
/* Battle of Talingchan - Sound FX via Web Audio API (no external files needed) */
(function(root) {
  'use strict';
  let ctx = null;
  let muted = false;
  function getCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { return null; }
    }
    return ctx;
  }
  function tone(freq, duration, type, vol) {
    const c = getCtx(); if (!c || muted) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.15, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(c.currentTime); osc.stop(c.currentTime + duration);
  }
  function noise(duration, vol) {
    const c = getCtx(); if (!c || muted) return;
    const bufSize = c.sampleRate * duration;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(vol || 0.08, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(gain); gain.connect(c.destination);
    src.start(c.currentTime);
  }

  const SFX = {
    draw: function() { tone(800, 0.08, 'sine', 0.1); setTimeout(()=> tone(1000, 0.06, 'sine', 0.08), 50); },
    summon: function() { tone(400, 0.15, 'triangle', 0.12); setTimeout(()=> tone(600, 0.2, 'triangle', 0.1), 100); setTimeout(()=> tone(800, 0.25, 'triangle', 0.08), 200); },
    attack: function() { noise(0.15, 0.15); tone(200, 0.1, 'sawtooth', 0.1); },
    destroy: function() { noise(0.25, 0.12); tone(150, 0.3, 'sawtooth', 0.08); setTimeout(()=> tone(100, 0.2, 'sawtooth', 0.06), 100); },
    magic: function() { tone(600, 0.1, 'sine', 0.1); setTimeout(()=> tone(900, 0.15, 'sine', 0.08), 80); setTimeout(()=> tone(1200, 0.1, 'sine', 0.06), 160); },
    lifeFlip: function() { tone(300, 0.2, 'triangle', 0.15); setTimeout(()=> tone(500, 0.3, 'triangle', 0.12), 150); },
    win: function() { [523,659,784,1047].forEach((f,i) => setTimeout(()=> tone(f, 0.3, 'triangle', 0.12), i*150)); },
    lose: function() { [400,350,300,200].forEach((f,i) => setTimeout(()=> tone(f, 0.4, 'sawtooth', 0.08), i*200)); },
    click: function() { tone(1000, 0.04, 'square', 0.06); },
    phase: function() { tone(500, 0.1, 'sine', 0.08); setTimeout(()=> tone(700, 0.08, 'sine', 0.06), 60); },
    equip: function() { tone(700, 0.1, 'triangle', 0.1); setTimeout(()=> tone(900, 0.15, 'triangle', 0.08), 80); },
    construct: function() { tone(300, 0.15, 'square', 0.08); setTimeout(()=> tone(450, 0.12, 'square', 0.06), 100); },
    mute: function() { muted = true; },
    unmute: function() { muted = false; },
    toggleMute: function() { muted = !muted; return muted; },
    isMuted: function() { return muted; },
  };
  root.BoTSFX = SFX;
})(typeof self !== 'undefined' ? self : this);
```

### ทดสอบ
เปิด browser console > `BoTSFX.summon()` > ต้องได้ยินเสียง chime 3 โน้ตขึ้น

---

<a id="task-08"></a>
## TASK-08: ใส่เสียงใน game.html

### ไฟล์ที่แก้
`game.html`

### วิธีแก้

**8a) โหลด sounds.js** — เพิ่มบรรทัดใหม่หลังบรรทัด 91 (`<script src="card-scripts-auto.js"></script>`):
```html
<script src="sounds.js"></script>
```

**8b) เพิ่มปุ่ม Mute ใน header** — เพิ่มก่อนบรรทัด 46 (`</header>`):
```html
<button id="btnMute" title="เปิด/ปิดเสียง">🔊</button>
```

**8c) Logic ปุ่ม Mute + ตัวแปร SFX** — เพิ่มหลังบรรทัด 94 (`FX.install(E);`):
```js
const SFX = window.BoTSFX || {};
document.getElementById('btnMute').onclick = () => {
  const m = SFX.toggleMute ? SFX.toggleMute() : false;
  document.getElementById('btnMute').textContent = m ? '🔇' : '🔊';
};
```

**8d) เรียกเสียงในจุดสำคัญ** — แก้ไขเหล่านี้:

1. ในฟังก์ชัน `openPay` — ตรง `pOk.onclick` (บรรทัด ~287-294) หลังทำ summon/build สำเร็จ เพิ่ม:
```js
    if(r.ok && SFX.summon) SFX.summon();
```

2. ใน `onHand` — ตรง Magic Normal/React (บรรทัด ~259) หลัง `afterAction()` เพิ่ม:
```js
    if(r.ok && SFX.magic) SFX.magic();
```

3. ใน `finishAttackVsAvatar` — ตรง `doResolve` (บรรทัด ~511-516) หลัง `E.resolveBattle(...)` เพิ่ม:
```js
    if(SFX.attack) SFX.attack();
```

4. ใน `onTargetLife` (บรรทัด ~548) หลัง `alert('หงาย LIFE...')` เพิ่ม:
```js
    if(SFX.lifeFlip) SFX.lifeFlip();
```

5. ใน `render` — เพิ่มเช็คตอน winner (เพิ่มต้นฟังก์ชัน `render` หลัง `if(!st) return;`):
```js
  if(st.winner !== null && st.winner !== undefined && !st._sfxPlayed) {
    st._sfxPlayed = true;
    if(st.winner === viewSide && SFX.win) SFX.win();
    else if(SFX.lose) SFX.lose();
  }
```

6. ในปุ่ม `btnPhase` (บรรทัด ~160-168) หลัง `E.nextPhase(st)` เพิ่ม:
```js
    if(SFX.phase) SFX.phase();
```

### ทดสอบ
เล่นเกม > ต้องได้ยินเสียงทุกครั้งที่ summon, attack, magic, life flip, phase change, win/lose. กดปุ่ม 🔊 ต้อง toggle เป็น 🔇 แล้วเสียงหยุด

---

<a id="task-09"></a>
## TASK-09: CSS Animations

### ไฟล์ที่แก้
`game.html`

### วิธีแก้
เพิ่ม CSS ต่อท้ายก่อน `</style>` (ก่อนบรรทัด 36):
```css
@keyframes cardIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
@keyframes cardOut{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.7)}}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
@keyframes flipIn{from{transform:rotateY(90deg);opacity:0}to{transform:rotateY(0);opacity:1}}
@keyframes phaseSlide{from{transform:translateY(-10px);opacity:0}to{transform:translateY(0);opacity:1}}
.anim-in{animation:cardIn .3s ease-out}
.anim-out{animation:cardOut .3s ease-in forwards}
.anim-shake{animation:shake .4s ease}
.anim-flip{animation:flipIn .4s ease-out}
#phase{animation:phaseSlide .3s ease-out}
```

ใน JavaScript `cardMini` ฟังก์ชัน (บรรทัด 180-184) เปลี่ยน:
```js
function cardMini(c,extra){
  const d=document.createElement('div'); d.className='mini anim-in'+(extra||'');
```
(เพิ่ม `anim-in` ใน className)

### ทดสอบ
เล่นเกม > การ์ดที่ render ใหม่ต้องมี animation fade+scale เข้ามา

---

<a id="task-10"></a>
## TASK-10: โล่มนุษย์เลือกตัวได้

### ไฟล์ที่แก้
`game.html`

### วิธีแก้
แก้ฟังก์ชัน `finishAttackVsAvatar` (บรรทัด 507-528) — แทนที่ `confirm()` ด้วย modal

เปลี่ยนส่วนบรรทัด 524-527 จาก:
```js
  if(confirm('ฝ่ายกันมีโล่มนุษย์ '+lomus.map(x=>x.db.name).join(',')+' — รับแทน? (OK=รับด้วยตัวแรก)')){
    const rr=E.redirectLomu(st,f.idx,lomus[0].uid); if(!rr.ok){ alert(rr.error); doResolve(d); return; }
    doResolve(rr.redirectTo);
  } else doResolve(d);
```

เปลี่ยนเป็น:
```js
  // modal ให้เลือกตัวโล่มนุษย์
  let h = '<h3>โล่มนุษย์ — เลือกตัวรับแทน</h3>';
  lomus.forEach(x => {
    h += '<button style="width:100%;margin:4px 0" class="lomu-pick" data-uid="' + x.uid + '">' + x.db.name + ' (POW ' + E.effPower(x,0,st) + ')</button>';
  });
  h += '<button id="lomuPass" style="width:100%;margin:4px 0;border-color:#f87171">ไม่รับแทน</button>';
  mbox(h);
  document.getElementById('lomuPass').onclick = function() { mclose(); doResolve(d); };
  document.querySelectorAll('.lomu-pick').forEach(function(b) {
    b.onclick = function() {
      var rr = E.redirectLomu(st, f.idx, +b.dataset.uid);
      mclose();
      if (!rr.ok) { alert(rr.error); doResolve(d); return; }
      doResolve(rr.redirectTo);
    };
  });
```

### ทดสอบ
ในเกม Hotseat > โจมตี Avatar ฝ่ายตรงข้ามที่มีตัวโล่มนุษย์ > ต้องขึ้น modal ให้เลือกตัว หรือกด "ไม่รับแทน"

---

<a id="task-11"></a>
## TASK-11: Hotseat Transition Screen

### ไฟล์ที่แก้
`game.html`

### วิธีแก้

**11a) เพิ่ม HTML overlay** — เพิ่มหลังบรรทัด 83 (หลัง `<div id="modal">...</div>`):
```html
<div id="turnOverlay" style="position:fixed;inset:0;background:#0b0b0f;display:none;align-items:center;justify-content:center;z-index:50;flex-direction:column;gap:20px">
  <h2 id="turnMsg" style="font-size:24px;text-align:center">ส่งเครื่องให้ผู้เล่น X</h2>
  <button id="turnReady" class="primary" style="font-size:18px;padding:16px 32px">พร้อมแล้ว</button>
</div>
```

**11b) แก้ `btnPhase.onclick`** — บรรทัด 166 เดิม:
```js
  if(mode==='hot') viewSide=st.cur;
  render();
```

เปลี่ยนเป็น:
```js
  if(mode==='hot') {
    viewSide=st.cur;
    showTurnOverlay();
    return;
  }
  render();
```

**11c) เพิ่มฟังก์ชัน** — หลังฟังก์ชัน `botTurn` (หลังบรรทัด 178):
```js
function showTurnOverlay() {
  var ov = document.getElementById('turnOverlay');
  ov.style.display = 'flex';
  document.getElementById('turnMsg').textContent = 'ส่งเครื่องให้ผู้เล่น ' + (viewSide + 1);
  document.getElementById('turnReady').onclick = function() {
    ov.style.display = 'none';
    render();
  };
}
```

### ทดสอบ
เลือก Hotseat mode > เล่น > เมื่อเปลี่ยนเทิร์น ต้องขึ้นจอทึบ "ส่งเครื่องให้ผู้เล่น X" > กด "พร้อมแล้ว" ถึงเห็นมือ

---

<a id="task-12"></a>
## TASK-12: Deck Export

### ไฟล์ที่แก้
`decks.html`

### วิธีแก้

**12a) เพิ่มปุ่ม** — หลังบรรทัด 58 (`<button id="btnClear">ล้าง</button>`) เพิ่ม:
```html
<button id="btnExport">📋 Export</button>
```

**12b) เพิ่ม logic** — หลังบรรทัด 157 (`btnClear.onclick`):
```js
document.getElementById('btnExport').onclick = function() {
  if (!main.length && !life.length) { alert('ยังไม่มีการ์ดในเด็ค'); return; }
  var cnt = {};
  main.forEach(function(c) { cnt[c.print] = (cnt[c.print] || 0) + 1; });
  var text = '# Main Deck (' + main.length + '/50)\n';
  Object.keys(cnt).sort().forEach(function(p) {
    var c = main.find(function(x) { return x.print === p; });
    text += cnt[p] + 'x ' + p + '-' + c.rare + '  // ' + c.name + '\n';
  });
  text += '\n# Life Cards (' + life.length + '/5)\n';
  life.forEach(function(c) { text += '1x ' + c.print + '-' + c.rare + '  // ' + c.name + '\n'; });
  navigator.clipboard.writeText(text).then(function() {
    alert('คัดลอกเด็คลิสต์ไปยัง clipboard แล้ว!');
  }).catch(function() {
    var m = document.getElementById('modal'); m.style.display = 'flex';
    document.getElementById('mbox').innerHTML = '<h3>คัดลอกเด็คลิสต์</h3><textarea style="width:100%;height:300px;background:#222;color:#eee;border:1px solid #444;border-radius:6px;padding:8px;font-size:12px" readonly>' +
      text.replace(/</g,'&lt;') + '</textarea><br><button id="mX">ปิด</button>';
    document.getElementById('mX').onclick = function() { m.style.display = 'none'; };
  });
};
```

### ทดสอบ
จัดเด็ค > กด "📋 Export" > ต้อง copy text ไป clipboard หรือแสดง textarea

---

<a id="task-13"></a>
## TASK-13: Deck Statistics

### ไฟล์ที่แก้
`decks.html`

### วิธีแก้

**13a) เพิ่ม HTML** — หลังบรรทัด 54 (`<div class="row" id="vAll">-</div>`) เพิ่ม:
```html
<div id="deckStats" style="font-size:12px;margin-top:8px;padding:8px;background:#0b0b0f;border-radius:6px"></div>
```

**13b) เพิ่ม logic ท้ายฟังก์ชัน `update()`** — เพิ่มก่อนปิด `}` ของ function update (ก่อนบรรทัด 144):
```js
  // Deck Statistics
  var stats = document.getElementById('deckStats');
  if (!main.length) { stats.innerHTML = ''; return; }
  var byType = {}, byColor = {}, byCost = {};
  main.forEach(function(c) {
    byType[c.type] = (byType[c.type] || 0) + 1;
    byColor[c.color || 'ไม่มีสี'] = (byColor[c.color || 'ไม่มีสี'] || 0) + 1;
    var cost = c.cost === undefined ? '-' : c.cost;
    byCost[cost] = (byCost[cost] || 0) + 1;
  });
  var gemTotal = main.reduce(function(s, c) { return s + (c.gem || 0); }, 0);
  var avgGem = (gemTotal / main.length).toFixed(1);
  var h = '<b>📊 สถิติเด็ค</b><br>';
  h += '<b>Type:</b> ' + Object.entries(byType).map(function(e) { return e[0] + ' ' + e[1]; }).join(' · ') + '<br>';
  h += '<b>สี:</b> ' + Object.entries(byColor).map(function(e) { return e[0] + ' ' + e[1]; }).join(' · ') + '<br>';
  h += '<b>Cost curve:</b> ' + Object.keys(byCost).sort(function(a,b){return a-b;}).map(function(k) { return 'C' + k + ':' + byCost[k]; }).join(' ') + '<br>';
  h += '<b>GEM เฉลี่ย:</b> ' + avgGem + ' (รวม ' + gemTotal + ')';
  stats.innerHTML = h;
```

### ทดสอบ
ใส่การ์ดเข้าเด็ค > ต้องเห็นสถิติ Type / สี / Cost curve / GEM อัปเดตทันที

---

<a id="task-14"></a>
## TASK-14: Card Pool Pagination

### ไฟล์ที่แก้
`index.html` และ `decks.html`

### วิธีแก้ (ทั้ง 2 ไฟล์ ใช้ pattern เดียวกัน)

**index.html** — แก้ฟังก์ชัน `filtered()` (บรรทัด 87-97): ลบ `.slice(0,300)` ออก

เดิม:
```js
  }).slice(0,300);
```
เปลี่ยนเป็น:
```js
  });
```

แก้ `renderGrid` เป็น lazy load — แทนที่ฟังก์ชันทั้งหมด (บรรทัด 98-120):
```js
var PAGE_SIZE = 200;
function renderGrid(){
  var g = document.getElementById('grid'); g.innerHTML='';
  var all = filtered();
  document.getElementById('cardN').textContent = all.length;
  showCards(g, all, 0);
}
function showCards(g, all, from) {
  var end = Math.min(from + PAGE_SIZE, all.length);
  for (var i = from; i < end; i++) {
    var c = all[i];
    var d = document.createElement('div'); d.className='card';
    d.innerHTML = '<img loading="lazy" src="' + S.imgUrl(c) + '" onerror="this.style.display=\'none\'"><div class="nm">' + c.name + '<br><small>' + c.print + ' [' + c.rare + ']</small></div><div class="mt">' + c.type + (c.subtype?' / '+c.subtype:'') + (c.cost!==undefined?' | C'+c.cost:'') + (c.power!==undefined?' | P'+c.power:'') + '</div>';
    (function(card) {
      d.onclick = function() {
        var m = document.getElementById('modal'); m.style.display='flex';
        document.getElementById('mbox').innerHTML =
          '<img src="' + S.imgUrl(card) + '" onerror="this.style.display=\'none\'">' +
          '<h3 style="margin-top:0">' + card.name + '</h3>' +
          '<p><b>' + card.print + '</b> [' + card.rare + '] | ' + card.type + (card.subtype?' / '+card.subtype:'') + ' | สี:' + (card.color||'-') + ' | Symbol:' + (card.symbol||'-') + '</p>' +
          '<p>Cost:' + (card.cost===undefined?'-':card.cost) + ' GEM:' + (card.gem===undefined?'-':card.gem) + (card.gemColor?'('+card.gemColor+')':'') + ' Power:' + (card.power===undefined?'-':card.power) + '</p>' +
          '<p style="white-space:pre-wrap">' + (card.mainEffect||'') + '</p>' +
          (card.hashtagText?'<p style="color:#fbbf24"># ' + card.hashtagText + '</p>':'') +
          (card.ex?'<p style="color:#f87171">ex: ' + card.ex + '</p>':'') +
          '<div style="clear:both"><button id="mX">ปิด</button></div>';
        document.getElementById('mX').onclick = function() { m.style.display='none'; };
        m.onclick = function(e) { if(e.target===m) m.style.display='none'; };
      };
    })(c);
    g.appendChild(d);
  }
  var old = document.getElementById('loadMoreBtn');
  if (old) old.remove();
  if (end < all.length) {
    var btn = document.createElement('button');
    btn.id = 'loadMoreBtn';
    btn.textContent = 'โหลดเพิ่ม (' + (all.length - end) + ' ใบ)';
    btn.style.cssText = 'width:100%;padding:12px;margin:10px 0;border-radius:8px;background:#333;color:#eee;border:1px solid #555;cursor:pointer;font-size:14px';
    btn.onclick = function() { showCards(g, all, end); };
    g.parentElement.appendChild(btn);
  }
}
```

**decks.html** — แก้เหมือนกัน: ลบ `.slice(0,300)` ออกจากฟังก์ชัน `pool()` (บรรทัด 89) แล้วใส่ "โหลดเพิ่ม" pattern เดียวกัน

### ทดสอบ
เปิด index.html > ต้องเห็นการ์ด 200 ใบแรก + ปุ่ม "โหลดเพิ่ม" > กดแล้วเห็นเพิ่ม

---

<a id="task-15"></a>
## TASK-15: Banlist Enforcement

### ไฟล์ที่แก้
`engine.js` และ `decks.html`

### วิธีแก้

**15a) เพิ่ม banlist ใน engine.js** — เพิ่มหลังบรรทัด 11 (`let UID = 1;`):
```js
  // Banlist: ใส่ print codes ของการ์ดที่ banned — อัปเดตตามประกาศทางการ
  const BANLIST = [
    // ตัวอย่าง: 'BT01-XXX', 'BT02-YYY'
    // เติม print code ที่ banned ที่นี่
  ];
  function isBanned(print) { return BANLIST.indexOf(print) >= 0; }
```

**15b) เพิ่มเช็คใน validateDecks** — ในฟังก์ชัน `validateDecks` (บรรทัด 95-111) เพิ่มหลังบรรทัด 100:
```js
    const banned = main.filter(c => isBanned(c.print));
    if (banned.length) errs.push('มีการ์ด Banned: ' + banned.map(c => c.name + ' (' + c.print + ')').join(', '));
    const bannedLife = life.filter(c => isBanned(c.print));
    if (bannedLife.length) errs.push('LIFE มีการ์ด Banned: ' + bannedLife.map(c => c.name + ' (' + c.print + ')').join(', '));
```

**15c) Export isBanned** — เพิ่ม `isBanned` ใน return object (บรรทัด 700):
```js
    newGame, validateDecks, isBanned, doDrawPhase, ...
```

**15d) แสดง badge BANNED ใน decks.html** — ใน `renderPool` (ฟังก์ชันที่ render card pool) แก้ innerHTML ของ card เพิ่ม badge:
```js
    var ban = typeof E.isBanned === 'function' && E.isBanned(c.print);
    d.innerHTML = '<img loading="lazy" src="' + S.imgUrl(c) + '" onerror="this.style.display=\'none\'"><div class="t">' + c.name + (ban?'<br><b style="color:#f87171">BANNED</b>':'') + '<br><small>' + c.print + '</small></div>';
```

### ทดสอบ
ใส่ print code ลงใน BANLIST array > เปิด decks.html > การ์ดนั้นต้องมีป้าย BANNED > ใส่เข้าเด็ค > validation ต้องแจ้ง error

---

<a id="task-16"></a>
## TASK-16: เพิ่ม Starter Decks

### ไฟล์ที่แก้
`starter-decks.js`

### วิธีแก้
เพิ่ม 4 เด็คใหม่ต่อท้ายไฟล์ แต่ละเด็คต้อง:
- main: 50 print codes (มี Only#1 1 ใบ, ไม่เกิน 4 ใบต่อชื่อ, type ต้องเป็น Avatar/Magic/Construct เท่านั้น)
- life: 5 print codes (type ต้องเป็น Life, ชื่อห้ามซ้ำ)

**คำแนะนำ**: อ่าน cards.json > filter ตาม print prefix (SD01, SD03, SD05, SD07) > สร้างเด็คตาม pattern นี้:
```js
window.BoTStarterDecks.push({
  "starterId": "starter-sd01",
  "name": "ชื่อเด็ค",
  "main": [ /* 50 print codes */ ],
  "life": [ /* 5 print codes */ ]
});
```

ต้องตรวจสอบด้วย `E.validateDecks()` ว่าผ่าน

### ทดสอบ
เปิด index.html > ต้องเห็นเด็คเพิ่ม > กด "เล่น" แต่ละเด็คต้องเริ่มเกมได้

---

<a id="task-17"></a>
## TASK-17: Confirm ก่อนทำ Action

### ไฟล์ที่แก้
`game.html`

### วิธีแก้

**17a) เพิ่ม toggle** — หลังบรรทัด 98 (`let selPay=...`):
```js
let confirmActions = true;
```

**17b) เพิ่ม checkbox ใน setup** — หลังบรรทัด 52 (Hotseat radio):
```html
<br><label><input type="checkbox" id="chkConfirm" checked> ยืนยันก่อนทำ action</label>
```

**17c) อ่านค่า** — ในฟังก์ชัน `btnStart.onclick` (บรรทัด 138) เพิ่มหลัง `mode=...`:
```js
  confirmActions = document.getElementById('chkConfirm').checked;
```

**17d) Confirm ก่อน summon** — ใน `openPay` ตรง `pOk.onclick` เพิ่มต้น:
```js
    if (confirmActions && !confirm((kind==='summon'?'อัญเชิญ':'ก่อสร้าง') + ' ' + c.db.name + '?')) return;
```

**17e) Confirm ก่อน attack** — ใน `onMeAvatar` ตรงที่เลือก attacker (บรรทัด ~308) ก่อน `atkUid=a.uid`:
```js
  if (confirmActions && !confirm('เลือก ' + a.db.name + ' โจมตี?')) return;
```

### ทดสอบ
checkbox ติ๊ก > summon ต้องมี confirm > ปิด checkbox > ไม่ต้อง confirm

---

<a id="task-18"></a>
## TASK-18: Online Multiplayer

### ไฟล์ที่สร้างใหม่

**`package.json`**:
```json
{
  "name": "bottcg-web",
  "version": "1.0.0",
  "scripts": { "start": "node server.js" },
  "dependencies": { "ws": "^8.16.0" }
}
```

**`server.js`**:
```js
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3000;
const MIME = {'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png'};
const server = http.createServer((req, res) => {
  let file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const fp = path.join(__dirname, file);
  const ext = path.extname(fp);
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
  fs.createReadStream(fp).pipe(res);
});
const wss = new WebSocket.Server({ server });
const rooms = new Map();
function genCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }
wss.on('connection', (ws) => {
  ws._room = null; ws._side = null;
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch(e) { return; }
    if (msg.type === 'create') {
      const code = genCode();
      rooms.set(code, { p1: ws, p2: null, deck1: msg.deck, deck2: null });
      ws._room = code; ws._side = 0;
      ws.send(JSON.stringify({ type: 'created', code }));
    } else if (msg.type === 'join') {
      const room = rooms.get(msg.code);
      if (!room) { ws.send(JSON.stringify({ type: 'error', error: 'ไม่พบห้อง' })); return; }
      if (room.p2) { ws.send(JSON.stringify({ type: 'error', error: 'ห้องเต็ม' })); return; }
      room.p2 = ws; room.deck2 = msg.deck; ws._room = msg.code; ws._side = 1;
      room.p1.send(JSON.stringify({ type: 'ready', side: 0 }));
      room.p2.send(JSON.stringify({ type: 'ready', side: 1 }));
    } else if (msg.type === 'action') {
      const room = rooms.get(ws._room); if (!room) return;
      const other = ws._side === 0 ? room.p2 : room.p1;
      if (other && other.readyState === WebSocket.OPEN)
        other.send(JSON.stringify({ type: 'action', action: msg.action, from: ws._side }));
      ws.send(JSON.stringify({ type: 'action', action: msg.action, from: ws._side }));
    } else if (msg.type === 'state') {
      const room = rooms.get(ws._room); if (!room) return;
      const other = ws._side === 0 ? room.p2 : room.p1;
      if (other && other.readyState === WebSocket.OPEN)
        other.send(JSON.stringify({ type: 'state', state: msg.state }));
    }
  });
  ws.on('close', () => {
    if (ws._room) {
      const room = rooms.get(ws._room);
      if (room) {
        const other = ws._side === 0 ? room.p2 : room.p1;
        if (other && other.readyState === WebSocket.OPEN)
          other.send(JSON.stringify({ type: 'disconnected', side: ws._side }));
        rooms.delete(ws._room);
      }
    }
  });
});
server.listen(PORT, () => console.log('BoTTCG server at http://localhost:' + PORT));
```

### แก้ game.html

**18a) เพิ่มโหมด Online** — บรรทัด 51-52 เพิ่ม radio:
```html
<label><input type="radio" name="mode" value="online"> 🌐 Online (WebSocket)</label>
```

**18b) เพิ่ม Online UI** — หลังบรรทัด 60:
```html
<div id="onlineSetup" style="display:none;margin-top:8px">
  <input type="text" id="roomCode" placeholder="รหัสห้อง (ว่าง=สร้างใหม่)" style="width:100%;padding:8px;border-radius:6px;background:#222;color:#eee;border:1px solid #444">
  <input type="text" id="wsUrl" value="ws://localhost:3000" placeholder="WebSocket URL" style="width:100%;padding:8px;border-radius:6px;background:#222;color:#eee;border:1px solid #444;margin-top:4px">
  <p id="onlineMsg" style="color:#fbbf24;font-size:12px"></p>
</div>
```

**18c) Show/Hide** — เพิ่มใน `<script>`:
```js
document.querySelectorAll('input[name=mode]').forEach(function(r) {
  r.onchange = function() {
    document.getElementById('onlineSetup').style.display =
      document.querySelector('input[name=mode]:checked').value === 'online' ? 'block' : 'none';
  };
});
```

**18d) WebSocket client** — เพิ่มใน `<script>`:
```js
let ws = null, mySide = null;
function connectOnline(deckData, roomCode) {
  var url = document.getElementById('wsUrl').value || 'ws://localhost:3000';
  var msg = document.getElementById('onlineMsg');
  msg.textContent = 'กำลังเชื่อมต่อ...';
  ws = new WebSocket(url);
  ws.onopen = function() {
    if (roomCode) {
      ws.send(JSON.stringify({ type: 'join', code: roomCode, deck: deckData }));
      msg.textContent = 'กำลังเข้าห้อง ' + roomCode + '...';
    } else {
      ws.send(JSON.stringify({ type: 'create', deck: deckData }));
    }
  };
  ws.onmessage = function(e) {
    var data = JSON.parse(e.data);
    if (data.type === 'created') {
      msg.textContent = 'รหัสห้อง: ' + data.code + ' — รอผู้เล่นอีกคน...';
      document.getElementById('roomCode').value = data.code;
      mySide = 0;
    }
    if (data.type === 'ready') {
      mySide = data.side;
      msg.textContent = 'คุณเป็น P' + (mySide + 1) + ' — เริ่มเกม!';
      document.getElementById('btnStart').click();
    }
    if (data.type === 'action') { replayAction(data.action, data.from); }
    if (data.type === 'disconnected') { alert('อีกฝ่ายตัดการเชื่อมต่อ'); }
    if (data.type === 'error') { msg.textContent = data.error; }
  };
  ws.onerror = function() { msg.textContent = 'เชื่อมต่อไม่ได้'; };
  ws.onclose = function() { msg.textContent = 'ตัดการเชื่อมต่อ'; ws = null; };
}
function sendAction(action) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'action', action: action }));
}
function replayAction(action, from) {
  if (!st) return;
  try {
    if (action.act === 'summon') E.summonAvatar(st, from, action.uid, action.payUids);
    else if (action.act === 'build') E.buildConstruct(st, from, action.uid, action.payUids);
    else if (action.act === 'magic') E.playMagic(st, from, action.uid, action.opts || {});
    else if (action.act === 'attack') {
      var dec = E.declareAttack(st, from, action.atkUid, action.supUids, action.target);
      if (dec.ok && !dec.negated) {
        var atk = st.players[from].avatar.find(function(a){return a.uid===action.atkUid;});
        E.resolveBattle(st, from, atk, action.target, dec.power);
      }
    }
    else if (action.act === 'nextPhase') E.nextPhase(st);
    else if (action.act === 'skipBattle') E.skipBattle(st);
  } catch(e) { console.error('replay error', e); }
  render();
}
```

**18e) ส่ง action** — เพิ่มในทุกจุดที่ผู้เล่นทำ action:

summon/build สำเร็จ:
```js
if (mode === 'online') sendAction({ act: kind, uid: c.uid, payUids: [...selPay] });
```

attack:
```js
if (mode === 'online') sendAction({ act: 'attack', atkUid: atkUid, supUids: [...supSet], target: {kind:'avatar', uid:d.uid} });
```

nextPhase:
```js
if (mode === 'online') sendAction({ act: 'nextPhase' });
```

### วิธี Run
```bash
cd e:\L\bottcg-game
npm install
npm start
```
เปิด `http://localhost:3000/game.html` ใน 2 tabs

### ทดสอบ
Tab 1: Online > สร้างห้อง > ได้รหัส | Tab 2: Online > ใส่รหัส > join | ทั้ง 2 เข้าเกม > ทำ action แล้วอีกฝั่งเห็น

---

## สรุปไฟล์ทั้งหมด

| ไฟล์ | Action | Tasks |
|------|--------|-------|
| `engine.js` | MODIFY | 01, 02, 15 |
| `ai.js` | MODIFY | 03, 04, 05 |
| `game.html` | MODIFY | 06, 08, 09, 10, 11, 17, 18 |
| `index.html` | MODIFY | 06, 14 |
| `decks.html` | MODIFY | 06, 12, 13, 14, 15 |
| `starter-decks.js` | MODIFY | 16 |
| `sounds.js` | **NEW** | 07 |
| `server.js` | **NEW** | 18 |
| `package.json` | **NEW** | 18 |

## ลำดับแนะนำ
```
TASK-01 → 02 → 03 → 04 → 05 → 07 → 08 → 09 → 06 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18
```
