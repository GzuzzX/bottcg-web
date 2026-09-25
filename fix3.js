const fs = require('fs');
let code = fs.readFileSync('E:/L/bottcg-game/engine.js', 'utf8');

const targetStr = `      const gems = payList.slice();
      for (const c of gems) {`;
const replaceStr = `      const gems = payList.slice();
      for (const c of gems) {
        if (c.db.name === payTargetName) return { ok: false, error: 'ห้ามใช้การ์ดชื่อเดียวกันจ่าย Cost ให้กันและกัน' };`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('E:/L/bottcg-game/engine.js', code);
  console.log('Same-name rule enforced in checkPay');
} else {
  console.log('Target string not found');
}
