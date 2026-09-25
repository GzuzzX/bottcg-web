# Brief สำหรับปรับ Duel UI: หน้าจอเดียว + มือคู่ต่อสู้คว่ำหน้า + ใช้มือถือได้

## เป้าหมาย

ปรับหน้า Duel ใน `game.html` ให้เล่นได้เต็มหนึ่งหน้าจอทั้งคอมพิวเตอร์และโทรศัพท์ โดยไม่ต้องเลื่อนหน้าเว็บขึ้น-ลงระหว่าง Duel และยังต้องเห็นสิ่งสำคัญพร้อมเล่นเสมอ:

- มือคู่ต่อสู้เป็นการ์ดคว่ำหน้า พร้อมจำนวนการ์ด
- สนามคู่ต่อสู้, สนามเรา, phase/action และมือเรา
- บนโทรศัพท์ใช้นิ้วแตะ/ปัดได้จริง ไม่ต้องพึ่ง hover

งานนี้เป็นงาน UI เท่านั้น ห้ามเปลี่ยนกติกาเกม, state ใน `engine.js`, การจั่ว, การจ่าย GEM, AI, hotseat หรือ online protocol

---

## ขอบเขตและข้อห้าม

- แก้หลักที่ `game.html` เท่านั้น
- ห้ามเปลี่ยนหรือลบ ID เดิม เพราะ JavaScript เดิมผูกอยู่กับ ID เหล่านี้:
  `meAvatar`, `foeAvatar`, `meCons`, `foeCons`, `meLife`, `foeLife`, `hand`, `handN`, `pend`, `landInfo`, `phase`, `btnPhase`, `actHint`, `sidebar`, `board`, `game-container`
- เพิ่ม element และ class ใหม่ได้ โดยแนะนำ `foeHandArea`, `foeHand`, `foeHandN`, `card-back` และ `card-inspector-toggle`
- ห้ามใช้ library หรือ dependency ใหม่
- ห้ามแก้ UI setup ให้เกิดผลเสีย: หน้าตั้งค่าเริ่มเกมยังเลื่อนได้ตามปกติเมื่อเนื้อหาสูงกว่าจอ
- Modal, log, drawer หรือ bottom sheet เลื่อนได้ภายในตัวเองได้ แต่หน้าหลักของ Duel ห้ามมี vertical scroll
- อย่าคัด CSS จาก `UX-UI-REWORK.md` ตรง ๆ เพราะเวอร์ชันนั้นยังตั้งให้ board/มือถือเลื่อนแนวตั้ง ซึ่งขัดกับ brief นี้

---

## ปัญหาของโค้ดปัจจุบันที่ต้องแก้

1. `#board` ยังมี `overflow-y: auto` จึงต้องเลื่อนบน desktop
2. `#game-container` ใช้ `height: calc(100vh - 50px)` แต่ header สูงไม่คงที่และอาจ wrap ทำให้ UI ถูกตัด
3. ที่ breakpoint เดิมสำหรับมือถือ sidebar ถูกวางเหนือ board สูง 250px และ `#game-container` เลื่อนแนวตั้ง จึงใช้บนมือถือไม่ดี
4. ยังไม่มี DOM สำหรับมือคู่ต่อสู้ แม้ `render()` มี `showFoe.hand.length` อยู่แล้ว
5. `.field-foe` ถูกหมุน 180 องศา ทำให้เพิ่มแถวมือ/label ใหม่ยุ่งและอ่านยากบนมือถือ
6. sidebar preview ใช้ `onmouseover` อย่างเดียว ซึ่งมือถือไม่มี hover

---

## ผลลัพธ์ที่ต้องการ

### 1) App shell ที่พอดี viewport

ระหว่าง Duel ให้ใช้โครงแบบ grid ที่คำนวณสูงจาก viewport จริง ไม่ hard-code ความสูง header:

```text
body (duel active, สูง 100dvh, ไม่ scroll)
├─ header (auto height, toolbar กระชับ)
└─ #game-container (min-height: 0, กินพื้นที่ที่เหลือ)
   ├─ #sidebar / inspector (desktop)
   └─ #board (min-height: 0, overflow: hidden)
      ├─ opponent area: status + facedown hand + field
      ├─ center area: land + pending action + phase controls
      ├─ player field
      └─ player hand dock
```

แนว CSS ที่ต้องใช้:

- ใช้ `height: 100dvh` พร้อม fallback ที่เหมาะสม แทน `calc(100vh - 50px)`
- ใช้ `grid-template-rows: auto minmax(0, 1fr)` กับ shell
- ทุก grid/flex child ที่อาจหดได้ต้องมี `min-width: 0` และ/หรือ `min-height: 0`
- ระหว่าง Duel ให้ `body`, `#game-container`, `#board` ไม่มี vertical scroll (`overflow: hidden`)
- ห้ามใช้ fixed `min-height: 110px` ของ zone แบบเดิมจนบังคับให้สูงเกินจอ ให้ใช้ `clamp()` / CSS variable / `minmax(0, ...)`
- Header desktop ต้องไม่ wrap เป็นสองบรรทัด; ถ้าพื้นที่แคบให้ชื่อเกม ellipsis และซ่อนข้อความรอง เช่น deck info ก่อน ไม่ใช่เพิ่มความสูง header
- Modal ต้องใช้ `max-height: 100dvh` หรือ `92dvh` และ scroll เฉพาะใน modal เพื่อไม่ให้ action ถูกตัด

### 2) Desktop layout (กว้างตั้งแต่ 1024px)

- Sidebar inspector กว้างประมาณ `260–300px` และ board กินพื้นที่ที่เหลือ
- Board เป็น CSS grid 4 ส่วน: opponent / center controls / own field / own hand
- ใช้พื้นที่แนวตั้งแบบสัดส่วน ไม่ใช่ content ดันสูง เช่น `minmax(0, 1fr) auto minmax(0, 1fr) auto`
- ลดขนาดการ์ดด้วย `clamp()` ตามความสูงหน้าจอ; ที่หน้าจอเตี้ยให้ซ่อน `.mini .t` ใน zone สนามได้ แต่ห้ามซ่อนข้อมูลจาก inspector/modal
- แถว Avatar/Construct/Life ที่เต็มตามกติกาต้องยังอยู่ใน viewport; หากแถบใดแคบ ให้เลื่อนแนวนอนภายในแถบนั้นได้ แต่ห้ามทำให้หน้า Duel เลื่อนแนวตั้ง
- เอา `overflow-y: auto` ออกจาก `#board`
- เอา `transform: rotate(180deg)` ออกจาก `.field-foe` และเอา transform กลับด้านจากข้อความคู่ต่อสู้ออก เพื่อให้ทุก label และ card back อ่านตรงทั้งทุกอุปกรณ์

### 3) มือคู่ต่อสู้คว่ำหน้า

เพิ่ม strip มือคู่ต่อสู้ไว้ใต้ข้อมูลคู่ต่อสู้และก่อนแถวสนามคู่ต่อสู้ ตัวอย่างโครงสร้างขั้นต่ำ:

```html
<div id="foeHandArea" class="opponent-hand-area" aria-label="มือคู่ต่อสู้">
  <span class="opponent-hand-label">มือคู่ต่อสู้ <b id="foeHandN">0</b></span>
  <div id="foeHand" class="opponent-hand-cards" aria-live="polite"></div>
</div>
```

เพิ่มฟังก์ชัน renderer เฉพาะ เช่น `renderOpponentHand(count)` และเรียกใน `render()` หลังหา `showFoe` แล้ว โดยรับ **ตัวเลข** `showFoe.hand.length` เท่านั้น

กติกาความลับของข้อมูล:

- ห้ามส่ง card object เข้า renderer นี้
- ห้ามเรียก `cardMini()` เพื่อวาดมือคู่ต่อสู้ เพราะมันใส่รูปหน้าไพ่, ชื่อ, type, POWER และ hover preview
- แต่ละใบต้องเป็น generic `.card-back` ที่สร้างด้วย CSS เท่านั้น ไม่มี `uid`, `db`, image ของไพ่จริง, ชื่อ, POWER, onclick, hover preview หรือ dataset ที่เปิดเผยตัวตนไพ่
- ตั้ง `pointer-events: none` ให้การ์ดหลัง และให้ wrapper มี label บอกจำนวนอย่างเข้าถึงได้
- ถ้ามือมีไม่เกิน 12 ใบ ให้แสดง card back หนึ่งใบต่อหนึ่งการ์ด; เรียงซ้อน/fan เพื่อประหยัดความกว้าง
- ถ้ามากกว่า 12 ใบ ให้แสดง 12 ใบและ badge `+N`; `#foeHandN` ต้องแสดงจำนวนจริงเสมอ
- การ์ดหลังควรมีสัดส่วนใกล้การ์ดจริง, ขอบชัด, ลาย CSS เช่น gradient/pattern, และไม่ใช้ external asset

หมายเหตุ: วิธีนี้ปิดข้อมูลใน UI เท่านั้น หาก online mode ส่ง state มือคู่ต่อสู้เต็มมาที่ client อยู่แล้ว จะไม่ใช่การปกปิดเชิง security; ไม่ต้องขยายงานไปแก้ protocol ใน task นี้

### 4) Tablet (768–1023px)

- ไม่วาง sidebar สูง 250px เหนือ board
- ซ่อน sidebar ปกติ แล้วเปิดรายละเอียดการ์ดผ่าน inspector drawer/button แทน
- Board ยังต้องเต็ม viewport เดียว, ไม่มี page vertical scroll
- การ์ดสนามประมาณ 52–64px ตามพื้นที่จริง; ลด text ในการ์ดสนามได้
- phase button, phase ปัจจุบัน และ action hint ต้องมองเห็นโดยไม่ต้อง scroll

### 5) โทรศัพท์ (กว้างไม่เกิน 767px)

ทำเป็น compact playmat ไม่ใช่หน้าเว็บที่เรียง sidebar แล้วค่อย board:

- ใช้ `100dvh` และ padding ที่คำนึงถึง `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`
- Header สูงประมาณ 44–48px; เก็บปุ่ม `ไป Phase ถัดไป` ไว้ตลอดและมี touch target อย่างน้อย 44×44px
- แสดง opponent hand แบบ card-back fan + จำนวนไว้ด้านบน
- แสดงสนามคู่ต่อสู้, center action/phase bar, สนามเรา และมือเราในจอเดียว
- มือเราเป็น dock ด้านล่างที่ปัดแนวนอนได้ (`overflow-x: auto`, `touch-action: pan-x`, `-webkit-overflow-scrolling: touch`); ห้ามทำให้ทั้งหน้าเลื่อนขึ้นลง
- โซนที่มีหลายการ์ดเลื่อนเฉพาะแนวนอนได้หากจำเป็น; การ tap การ์ดและเลือกเป้าหมายต้องยังทำงานกับ event เดิม
- ซ่อนข้อความยาวบนหน้าสนาม, ใช้รูป/สถานะสั้น/สีแทน และเปิดรายละเอียดใน inspector/bottom sheet
- ห้ามพึ่ง `:hover` อย่างเดียว: การแตะหรือ focus การ์ดต้องเปิด inspector แบบไม่ทำให้ action เล่นไพ่โดยไม่ตั้งใจ
- Log, card preview, pending operation ที่ยาว ให้เปิดผ่าน drawer/bottom sheet/modal แทน sidebar ถาวร
- ระวัง keyboard/focus ของมือถือ: modal ต้องไม่ล้น viewport และปุ่มปิดต้องเข้าถึงง่าย

ใน mobile landscape ให้ใช้รูปแบบที่หนาแน่นกว่า portrait (การ์ดมือประมาณ 48–56px) แต่ยังเห็นทั้งสองสนามและ phase control โดยไม่ scroll แนวตั้ง

---

## รายละเอียด interaction ที่ต้องรักษา

- ห้ามเปลี่ยน handler ปัจจุบันสำหรับ `#foeAvatar`, `#foeCons`, `#foeLife`, `#meAvatar`, `#meCons`, `#meLife`, `#hand` และ `#btnPhase`
- มือเราแตะการ์ดเพื่อใช้ flow เดิมได้
- การแตะ Avatar/Construct/Life ฝั่งตรงข้ามเพื่อเลือกเป้าหมายยังต้องทำงาน
- Hotseat ต้องสลับมุมมองและมือที่แสดงได้เหมือนเดิม; `#foeHand` ต้องตาม `showFoe` เสมอ
- AI และ online mode ต้องยัง render ได้โดยไม่มี error
- ห้ามเอาข้อมูลไพ่ฝ่ายตรงข้ามเข้า sidebar preview จากการแตะ/hover card back

---

## ลำดับทำงานที่แนะนำ

1. อ่าน `game.html` และระบุ CSS เก่าที่ override กันอยู่ ก่อนแก้ให้รวม responsive rule เป็นชุดที่อ่านง่าย โดย rule ใหม่ต้องชนะ rule เก่า
2. เพิ่ม DOM ของ `#foeHandArea`, `#foeHand`, `#foeHandN` โดยไม่กระทบ ID เดิม
3. เพิ่ม `renderOpponentHand(count)` และเรียกจาก `render()`
4. ปรับ shell/board เป็น viewport grid และเอา vertical scroll ของ Duel ออก
5. ปรับ breakpoint desktop, tablet, portrait mobile และ landscape mobile
6. เพิ่ม inspector ที่ใช้ tap/focus ได้ พร้อมรักษา hover desktop เป็น optional enhancement
7. ทดสอบทุก mode และ viewport ตามรายการด้านล่าง

---

## Acceptance criteria (ต้องผ่านทั้งหมด)

### Desktop

- ที่ 1920×1080, 1366×768, 1280×720 และ 1024×768 (browser zoom 100%) ไม่มี vertical scrollbar ของ page, `#game-container` หรือ `#board`
- เห็น opponent hand, สนามคู่ต่อสู้, center phase/action, สนามเรา และมือเราในหน้าจอเดียว
- Header ไม่ทำให้พื้นที่ board ถูกตัดเมื่อข้อความยาว
- สนามเต็มตัวอย่าง 6 Avatar, 3 Construct, 5 Life และมือเรา 7 ใบยังไม่ทำให้หน้าเลื่อนขึ้นลง

### มือคู่ต่อสู้

- ทดสอบมือ 0, 1, 5, 7 และมากกว่า 12 ใบ
- การ์ดที่เห็นเป็นหลังไพ่ทุกใบ ไม่มีชื่อ, รูป, type, print, POWER หรือ card UID รั่วใน DOM ที่ render สำหรับ strip นี้
- จำนวนที่แสดงตรงกับ `showFoe.hand.length`

### โทรศัพท์ / tablet

- ทดสอบอย่างน้อย 768×1024, 430×932, 390×844, 375×667 และ 667×375
- ไม่มี sidebar 250px อยู่เหนือ board และไม่มี page-level vertical scroll ระหว่าง Duel
- ปุ่ม Phase, action hint, opponent hand count, การเลือกเป้าหมาย และมือเราใช้งานด้วยนิ้วได้
- touch target ของปุ่มสำคัญอย่างน้อย 44×44px
- modal/inspector ไม่ล้นจอและปิดได้

### Regression

- เริ่มเกม AI ได้, เล่น phase ได้, เลือก/โจมตีเป้าหมายได้
- hotseat สลับผู้เล่นแล้วยังไม่เห็นหน้าไพ่ของอีกฝ่าย
- online UI ไม่ error ตอน render
- setup screen และ modal ยังคงเลื่อนได้เมื่อเนื้อหาเกินจอ

---

## สิ่งที่ต้องส่งกลับหลังทำ

1. สรุปไฟล์ที่แก้และเหตุผลสั้น ๆ
2. ระบุว่าแก้ CSS/DOM/render ส่วนไหน
3. รายการ viewport และ flow ที่ทดสอบจริง
4. ถ้ามีข้อจำกัดของหน้าจอที่เล็กมาก ให้ระบุ fallback ที่ใช้ (เช่น horizontal swipe เฉพาะ hand/zone) แต่ห้ามกลับไปใช้ vertical scroll ของหน้า Duel
