const fs = require('fs');
let code = fs.readFileSync('E:/L/bottcg-game/engine.js', 'utf8');

code = code.replace(/const hasPending = \(st\.pendingResponses \|\| \[\]\)\.some\(q => q\.evId === ev\.id\) \|\| r === 'queued' \|\| st\._pendingEv === ev;\s*if \(hasPending\) \{\s*st\._frames = st\._frames \|\| \[\];\s*st\._frames\.push\(\{ evId: ev\.id, kind: 'attackResolve', atkUid: atk\.uid, target, power: pow, owner: pIdx \}\);\s*st\._pendingEv = ev;\s*return \{ ok: true, atk, power: pow, target, pending: true, evId: ev\.id \};\s*\}\s*return \{ ok: true, power: pow, target, pending: hasPending, negated: !!ev\.negated \};/,
`const hasPending = (st.pendingResponses || []).some(q => q.evId === ev.id) || r === 'queued' || st._pendingEv === ev;
      if (!hasPending && ev.negated) {
        atk.battleBuff = 0;
      }
      if (hasPending) {
        st._frames = st._frames || [];
        st._frames.push({ evId: ev.id, kind: 'attackResolve', atkUid: atk.uid, target, power: pow, owner: pIdx });
        st._pendingEv = ev;
        return { ok: true, atk, power: pow, target, pending: true, evId: ev.id };
      }
      return { ok: true, power: pow, target, pending: hasPending, negated: !!ev.negated };`);

fs.writeFileSync('E:/L/bottcg-game/engine.js', code);
console.log('declareAttack fixed');
