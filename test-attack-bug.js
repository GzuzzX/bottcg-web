const E = require('./engine.js');
const FX = require('./effects.js');
E.setFX(FX);
const DB = [
  { print: 'A01', type: 'Avatar', name: 'Atk', power: 4 },
  { print: 'D01', type: 'Avatar', name: 'Def', power: 3 },
  { print: 'M01', type: 'Magic', subtype: 'React', name: 'ReactCard', cost: 0,
    mainEffect: 'เมื่อ Avatar ฝ่ายเราถูกโจมตี POWER +2',
    color: 'Red' }
];
FX.setCardDB(DB);

// fake scripts
global.window = { BoTCardScripts: {
  'M01': {
    abilities: [{
      id: 'r1', kind: 'response', responseTo: 'attackTargeted',
      match: (st, me, ev) => ev.target.uid && st.players[me].avatar.some(a=>a.uid===ev.target.uid),
      ops: [{ op: 'buff', spec: {side:'mine',zone:'avatar'}, v: 2 }]
    }]
  }
} };

const st = E.newGame([DB[0]], [DB[0],DB[0],DB[0],DB[0],DB[0]], [DB[1]], [DB[1],DB[1],DB[1],DB[1],DB[1]]);
st.players[0].avatar.push(st.players[0].main.pop());
st.players[1].avatar.push(st.players[1].main.pop());
st.players[1].hand.push(st.players[1].main.pop());
st.players[1].hand[0].db = DB[2]; // hack to make it Magic
FX.setHumanSides([0, 1]); // both human

st.phase = 'battle';
st.cur = 0;
const atk = st.players[0].avatar[0];
const def = st.players[1].avatar[0];

console.log('Declaring attack...');
const res = E.declareAttack(st, 0, atk.uid, [], { kind: 'avatar', uid: def.uid });
console.log('declareAttack returns:', res);

console.log('Pending responses:', st.pendingResponses);
if (st.pendingResponses && st.pendingResponses.length > 0) {
  const q = st.pendingResponses[0];
  console.log('Player 2 uses ReactCard...');
  const rr = FX.resolveQueued(st, q.key, true, {});
  console.log('resolveQueued returns:', rr);
}

console.log('Are there frames left?', st._frames);
console.log('Did battle resolve? Def dead?', st.players[1].hell.length > 0);
