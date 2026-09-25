# แผนการอัปเกรด UX/UI Battle of Talingchan สไตล์ Master Duel

> คู่มือนี้ออกแบบมาเพื่อให้ AI เขียนโค้ดตามได้ทันที โดยเป้าหมายคือการเปลี่ยน Layout แบบเรียงบรรทัดเดิม ให้กลายเป็นแบบ Playmat ที่มี Sidebar (แบบ Master Duel) 
> **สำคัญ:** ห้ามเปลี่ยน ID (`id="meAvatar"`, `id="hand"` ฯลฯ) เพราะ JavaScript เดิมผูกไว้กับ ID เหล่านี้

---

## TASK-01: เพิ่ม CSS โครงสร้าง Grid และ Sidebar
**ไฟล์ที่แก้:** `game.html`
**ตำแหน่ง:** ก่อน `</style>`

**รายละเอียด:**
เพิ่ม CSS สำหรับ Layout หลัก ให้หน้าจอแบ่งเป็น 2 ส่วน (Sidebar ด้านซ้าย 300px และ Playmat ด้านขวา) และจัดเรียงโซนบน Playmat แบบสะท้อนบน-ล่าง

```css
/* --- UI OVERHAUL (Master Duel Style) --- */
body { overflow: hidden; background: #08080a; }
header { background: #111; border-bottom: 1px solid #333; z-index: 100; position: relative; }

/* Main Container */
#game-container {
  display: flex;
  height: calc(100vh - 50px);
  width: 100vw;
  overflow: hidden;
}

/* Sidebar (Left) */
#sidebar {
  width: 320px;
  background: #111218;
  border-right: 1px solid #2a2a35;
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-shadow: 2px 0 10px rgba(0,0,0,0.5);
  z-index: 10;
}
#card-preview-img { width: 100%; aspect-ratio: 249/339; background: #000; border-radius: 8px; object-fit: contain; margin-bottom: 10px; }
#card-preview-text { flex: 1; overflow-y: auto; font-size: 13px; color: #ddd; background: #0a0a0c; padding: 10px; border-radius: 6px; border: 1px solid #222; }
#card-preview-text h3 { margin: 0 0 8px; color: #fff; font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 4px; }

/* Playmat (Right) */
#board {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px;
  background: radial-gradient(circle at center, #1a1a24 0%, #050508 100%);
  overflow-y: auto;
  position: relative;
}

/* Playmat Zones */
.field-half { display: flex; flex-direction: column; gap: 8px; flex: 1; justify-content: center; }
.field-foe { transform: rotate(180deg); } /* หมุนฝั่งศัตรู 180 องศาให้หันเข้าหากัน */
.field-row { display: flex; justify-content: center; gap: 10px; align-items: center; }

/* Zone Styling */
.zone-box { 
  border: 2px dashed #334; 
  border-radius: 8px; 
  min-width: 80px; 
  min-height: 110px;
  display: flex; 
  align-items: center; 
  justify-content: center;
  background: rgba(255,255,255,0.02);
}
.row { gap: 6px; justify-content: center; width: 100%; min-height: 110px; align-items: center; }

/* Center Area */
.center-field { display: flex; justify-content: space-between; align-items: center; margin: 15px 0; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 10px; border: 1px solid #222; }
#pend { display: flex; gap: 5px; flex: 1; overflow-x: auto; margin-left: 20px; }

/* Master Duel Phase Bar */
.phase-bar { display: flex; gap: 4px; font-size: 11px; font-weight: bold; background: #000; padding: 4px; border-radius: 20px; border: 1px solid #444; }
.phase-step { padding: 4px 12px; border-radius: 16px; color: #666; transition: 0.3s; }
.phase-step.active { background: #3b82f6; color: #fff; box-shadow: 0 0 8px #3b82f6; }

/* Hand Area */
.hand-area { background: rgba(0,0,0,0.6); padding: 10px; border-radius: 10px 10px 0 0; border-top: 2px solid #333; margin-top: auto; display: flex; flex-direction: column; align-items: center; }
#hand { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 5px; justify-content: flex-start; max-width: 100%; }
#hand .mini { transition: transform 0.2s, box-shadow 0.2s; margin-left: -10px; }
#hand .mini:hover { transform: translateY(-15px) scale(1.1); box-shadow: 0 10px 20px rgba(0,0,0,0.8); z-index: 5; }

/* Card Styling Update */
.mini { width: 80px; box-shadow: 2px 2px 5px rgba(0,0,0,0.5); }
.mini .t { font-size: 10px; background: rgba(0,0,0,0.8); }
.life { width: 70px; height: 100px; font-size: 10px; }

/* Responsive Desktop/Mobile */
@media(max-width: 900px) {
  #game-container { flex-direction: column; overflow-y: auto; }
  #sidebar { width: 100%; height: 250px; flex-direction: row; border-right: none; border-bottom: 1px solid #333; }
  #card-preview-img { width: auto; height: 100%; margin-bottom: 0; margin-right: 10px; }
  .field-foe { transform: none; } /* เลิกหมุนบนมือถือ */
  .mini { width: 65px; }
  .zone-box { min-width: 65px; min-height: 90px; }
}
```

---

## TASK-02: เปลี่ยนโครงสร้าง HTML ของ Board
**ไฟล์ที่แก้:** `game.html`
**ตำแหน่ง:** หา `<div id="board">...ถึง...</div>` เดิม แล้ว **แทนที่ทั้งหมด** ด้วยโค้ดนี้

**รายละเอียด:**
เราจะสร้าง `#game-container` ครอบ `#sidebar` และ `#board` 

```html
<div id="game-container">
  <!-- Sidebar Preview (Master Duel Left Panel) -->
  <div id="sidebar">
    <img id="card-preview-img" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="Card">
    <div id="card-preview-text">
      <h3 id="preview-name">Battle of Talingchan</h3>
      <p id="preview-desc" style="white-space:pre-wrap; color:#aaa;">เอาเมาส์ชี้ที่การ์ดเพื่อดูรายละเอียด</p>
      <div id="log" style="height:100px; margin-top:10px; border-top:1px solid #333; padding-top:10px; font-size:11px; background:transparent;"></div>
    </div>
  </div>

  <!-- Playmat (Right Panel) -->
  <div id="board" style="display:none;">
    
    <!-- Foe Field -->
    <div class="field-half field-foe">
      <div style="text-align:center; font-size:12px; color:#888; transform: rotate(180deg);">คู่ต่อสู้: <span id="foeInfo"></span></div>
      <!-- แถวหลัง: Life & Construct -->
      <div class="field-row">
        <div class="zone-box" style="flex:0.5;"><div class="row" id="foeLife"></div></div>
        <div class="zone-box" style="flex:2;"><div class="row" id="foeCons"></div></div>
      </div>
      <!-- แถวหน้า: Avatar -->
      <div class="field-row">
        <div class="zone-box" style="flex:1;"><div class="row" id="foeAvatar"></div></div>
      </div>
    </div>

    <!-- Center Field (Land & Phases) -->
    <div class="center-field">
      <div class="zone-box" style="width:100px; border-color:#d97706;">
        <div style="position:absolute; font-size:10px; color:#d97706; margin-top:-90px;">LAND: <span id="landInfo">ว่าง</span></div>
      </div>
      
      <div id="pend"></div>

      <!-- Phase Bar -->
      <div class="phase-bar" style="margin-left:auto;">
        <div class="phase-step" id="ph-draw">DRAW</div>
        <div class="phase-step" id="ph-main">MAIN</div>
        <div class="phase-step" id="ph-battle">BATTLE</div>
        <div class="phase-step" id="ph-end">END</div>
      </div>
    </div>

    <!-- Me Field -->
    <div class="field-half">
      <!-- แถวหน้า: Avatar -->
      <div class="field-row">
        <div class="zone-box" style="flex:1;"><div class="row" id="meAvatar"></div></div>
      </div>
      <!-- แถวหลัง: Life & Construct -->
      <div class="field-row">
        <div class="zone-box" style="flex:0.5;"><div class="row" id="meLife"></div></div>
        <div class="zone-box" style="flex:2;"><div class="row" id="meCons"></div></div>
      </div>
      <div style="text-align:center; font-size:12px; color:#888; margin-top:4px;">เรา: <span id="meInfo"></span></div>
    </div>

    <!-- Hand Area -->
    <div class="hand-area">
      <div style="width:100%; display:flex; justify-content:space-between; margin-bottom:5px;">
        <span style="font-size:12px; font-weight:bold;">มือ (<span id="handN"></span>)</span>
        <span class="hint" id="actHint">เลือกการ์ดบนมือเพื่อเล่น</span>
      </div>
      <div class="row" id="hand"></div>
    </div>

  </div> <!-- end board -->
</div> <!-- end game-container -->
```

---

## TASK-03: ปรับ JavaScript เพื่อแสดงรูปใน Sidebar (Hover Effect)
**ไฟล์ที่แก้:** `game.html`

**รายละเอียด:**
ให้ AI หาฟังก์ชัน `function cardMini(c,extra){...}` (แถวๆ บรรทัด 310) และเพิ่ม Event Listener `onmouseover` ให้แสดงรายละเอียดบน Sidebar ทุกครั้งที่เมาส์ชี้

**วิธีแก้ (ส่วนของ cardMini):**
หาโค้ดส่วนนี้ (ด้านในฟังก์ชัน cardMini):
```js
  d.innerHTML=`<img loading="lazy" src="${S.imgUrl(c)}" onerror="this.style.display='none'">
<div class="t"><b>${c.db.name}</b><br>POW ${pow} ${c.isToken?'[T]':''}</div>`;
```

ให้ **เพิ่ม** โค้ดนี้ต่อท้ายเข้าไปก่อนที่จะ `return d;`:
```js
  // อัปเดต Sidebar เมื่อเอาเมาส์ชี้
  d.onmouseover = function() {
    document.getElementById('card-preview-img').src = S.imgUrl(c);
    
    let info = `<p><b>${c.db.print}</b> [${c.db.rare}] | ${c.db.type} ${c.db.subtype?'/ '+c.db.subtype:''}</p>`;
    info += `<p>Cost: ${c.db.cost!==undefined?c.db.cost:'-'} | GEM: ${c.db.gem||0} ${c.db.gemColor?`(${c.db.gemColor})`:''} | Power: ${c.db.power!==undefined?c.db.power:'-'}</p>`;
    if (c.db.mainEffect) info += `<p style="color:#4ade80">${c.db.mainEffect}</p>`;
    if (c.db.hashtagText) info += `<p style="color:#fbbf24"># ${c.db.hashtagText}</p>`;
    
    document.getElementById('preview-name').textContent = c.db.name;
    document.getElementById('preview-desc').innerHTML = info;
  };
```

---

## TASK-04: ปรับ JavaScript ของ Phase Bar 
**ไฟล์ที่แก้:** `game.html`

**รายละเอียด:**
ให้ AI หาฟังก์ชัน `function render()` (น่าจะแถวๆ บรรทัด 200-230)
หาบรรทัดที่เขียนว่า:
```js
  document.getElementById('phase').textContent=st.phase.toUpperCase();
```

ให้ **เพิ่ม** โค้ดนี้ต่อท้ายเข้าไป เพื่อทำให้ Master Duel Phase Bar ไฮไลท์ตาม Phase ปัจจุบัน:
```js
  // Update Phase Bar UI
  document.querySelectorAll('.phase-step').forEach(el => el.classList.remove('active'));
  if(st.phase === 'draw') document.getElementById('ph-draw').classList.add('active');
  if(st.phase === 'main') document.getElementById('ph-main').classList.add('active');
  if(st.phase === 'battle') document.getElementById('ph-battle').classList.add('active');
  if(st.phase === 'end') document.getElementById('ph-end').classList.add('active');
```
*(ถ้าฟังก์ชัน render ไม่แสดงผล `#phase` แล้ว สามารถลบ Element `<span id="phase">` ออกจาก `<header>` ของเก่าได้เลย)*

---

### สรุปให้ AI ตัวรันโค้ด:
1. เอา CSS ใน Task 01 ไปแปะก่อน `</style>`
2. ทับโครงสร้าง `<div id="board">...</div>` ด้วยโครงสร้างใน Task 02
3. แทรกโค้ด Hover ในฟังก์ชัน `cardMini` (Task 03)
4. แทรกโค้ดเปลี่ยนสี Phase Bar ในฟังก์ชัน `render` (Task 04)
