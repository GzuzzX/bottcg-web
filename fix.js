const fs = require('fs');
let code = fs.readFileSync('E:/L/bottcg-game/engine.js', 'utf8');
code = code.replace(/function checkModTarget\(card, target\) \{[\s\S]*?return \{ ok: true \};\s*\}/, `function checkModTarget(card, target) {
      if (!target) return { ok: false, error: 'ต้องเลือก Avatar ฝ่ายเราสวมใส่' };
      const need = (card.db.mainEffect || '').match(/สวมใส่ได้เฉพาะ\\s*([^\\n]+)/);
      let needOk = true;
      if (need) {
        const raw = need[1].trim();
        const re = /"([^"]+)"/g;
        const quoted = [];
        let m;
        while ((m = re.exec(raw))) quoted.push(m[1].replace(/\\s/g, ''));
        
        const targetName = (target.db.name || '').replace(/\\s/g, '');
        
        if (quoted.length > 0) {
          needOk = quoted.some(n => n && targetName.includes(n));
        } else {
          const exactNeed = raw.replace(/\\s/g, '');
          needOk = (targetName === exactNeed);
        }
      }
      if (need && !needOk) return { ok: false, error: 'สวมใส่ไม่ตรงเงื่อนไข' };
      return { ok: true };
    }`);
fs.writeFileSync('E:/L/bottcg-game/engine.js', code);
console.log('checkModTarget fixed');
