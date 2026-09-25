'use strict';
// Read-only diagnostic probes against a frozen source snapshot. Does not patch game code.
const H = require('./tests/helpers.js');
const dbs = require('./cards.json');
const results = [];
function scenario(id, description, fn) {
  try { results.push({id, description, observed: fn()}); }
  catch (e) { results.push({id, description, error: e.message}); }
}
function world() {
  const {E, FX} = H.loadAll(); const st = H.newEmptyGame(E);
  for (let side=0; side<2; side++) {
    st.players[side].main = Array.from({length:20},(_,i)=>H.mkInst(H.mkDb({name:'Deck '+i,print:'V'+i}),side));
    st.players[side].life = Array.from({length:5},(_,i)=>({card:H.mkInst(H.mkDb({type:'Life',print:'L'+i}),side),open:false}));
  }
  return {E,FX,st};
}
function av(st, side, opts={}) { const c=H.mkInst(H.mkDb(opts),side); H.giveAvatar(st,side,[c]); return c; }
scenario('P01','Setup5 then first draw2',()=>{
  const {E}=H.loadAll(); const deck=Array.from({length:50},(_,i)=>H.mkDb({name:'D'+i}));
  const st=E.newGame(deck,[],deck,[]);const before=st.players.map(p=>p.hand.length);E.doDrawPhase(st);
  return {before,after:st.players.map(p=>p.hand.length)};
});
scenario('P02','Drawing last deck card',()=>{const {E,st}=world();st.players[0].main.length=1;E.drawOne(st,st.players[0]);return {deck:st.players[0].main.length,winner:st.winner};});
scenario('P03','Actions after P1 (index0) wins',()=>{const {E,st}=world();st.winner=0;const c=H.mkInst(H.mkDb(),0);H.giveHand(st,0,[c]);return E.summonAvatar(st,0,c.uid,[]).ok;});
scenario('P04','Summon on opponents turn in Battle',()=>{const {E,st}=world();st.phase='battle';const c=H.mkInst(H.mkDb(),1);H.giveHand(st,1,[c]);return E.summonAvatar(st,1,c.uid,[]).ok;});
scenario('P05','Attack during Main',()=>{const {E,st}=world();const c=av(st,0);return E.declareAttack(st,0,c.uid,[],{kind:'life'}).ok;});
scenario('P06','Starter first Main -> engine nextPhase',()=>{const {E,st}=world();st.turn=1;st.cur=0;return E.nextPhase(st);});
scenario('P07','nextPhase while response pending',()=>{const {E,st}=world();st.pendingResponses=[{key:'waiting'}];return E.nextPhase(st);});
scenario('P08','endTurn buff persists',()=>{const {E,st}=world();const a=av(st,0);a.buffs=[{v:4,until:'endTurn'}];st.phase='end';E.nextPhase(st);return {buffs:a.buffs,power:E.effPower(a,0,st)};});
scenario('P09','Only defender has ลูกฮึด at equal power',()=>{const {E,st}=world();st.phase='battle';const a=av(st,0,{power:3});const d=av(st,1,{power:3,mainEffect:'ลูกฮึด'});const r=E.declareAttack(st,0,a.uid,[],{kind:'avatar',uid:d.uid});E.resolveBattle(st,0,a,{kind:'avatar',uid:d.uid},r.power);return st.players.map(p=>p.avatar.length);});
scenario('P10','แทงหลัง different color should kill attacker',()=>{const {E,st}=world();st.phase='battle';const a=av(st,0,{power:2,color:'แดง'});const s=av(st,0,{power:2,color:'ฟ้า',mainEffect:'แทงหลัง'});const r=E.declareAttack(st,0,a.uid,[s.uid],{kind:'life'});E.resolveBattle(st,0,a,{kind:'life'},r.power);return {alive:st.players[0].avatar.includes(a),power:r.power,battleBuff:a.battleBuff};});
scenario('P11','Negative effective POWER',()=>{const {E,st}=world();const a=av(st,0,{power:1});a.buffs=[{v:-5,until:'endTurn'}];return E.effPower(a,0,st);});
scenario('P12','Explicit own target despite foe-only spec',()=>{const {E,FX,st}=world();const a=av(st,0,{print:'PROBE-A'});const victim=av(st,0,{name:'Own avatar, invalid side'});global.BoTCardScripts['PROBE-A']={abilities:[{id:'x',kind:'activated',ops:[{op:'destroy',spec:{side:'foe',zone:'avatar'}}]}]};const r=FX.execActivated(st,0,a.uid,'x',{targetUid:victim.uid});return {ok:r.ok,alive:st.players[0].avatar.includes(victim),hell:st.players[0].hell.includes(victim)};});
scenario('P13','Plain LIFE flip queues its effect',()=>{const {E,st}=world();E.flipLifeAt(st,1,1,true);return {delayed:st.delayed?.length,open:st.players[1].life[0].open};});
scenario('P14','Control change removes equipment',()=>{const {E,st}=world();const a=av(st,0);const equip=H.mkInst(H.mkDb({type:'Magic',subtype:'Modification'}),0);E.attachEquip(st,equip,a);E.gainControl(st,a,1);return {equipped:a.equipped.length,originalMagic:st.players[0].magic.length,inHell:st.players[0].hell.includes(equip)};});
scenario('P15','Control gain over zone cap',()=>{const {E,st}=world();for(let i=0;i<4;i++)av(st,0);const a=av(st,1);E.gainControl(st,a,0);return st.players[0].avatar.length;});
scenario('P16','Token exile remains in Dark',()=>{const {E,st}=world();const a=av(st,0,{type:'Token'});E.exileInst(st,a,'test');return st.players[0].dark.includes(a);});
scenario('P17','Token deck return remains in Deck',()=>{const {E,st}=world();const a=av(st,0,{type:'Token'});E.deckReturnInst(st,a,true,false);return st.players[0].main.includes(a);});
scenario('P18','Unspecified default activated ability on foe Battle',()=>{const {FX,st}=world();st.phase='battle';const a=av(st,1,{print:'PROBE-A'});global.BoTCardScripts['PROBE-A']={abilities:[{id:'x',kind:'activated',ops:[{op:'draw',n:1}]}]};return FX.execActivated(st,1,a.uid,'x',{}).ok;});
scenario('P19','Command death trigger after destruction',()=>{const {E,st}=world();const a=av(st,0,{print:'PROBE-DEATH',mainEffect:'คำสั่งเสีย จั่วการ์ด 1 ใบ'});global.BoTCardScripts['PROBE-DEATH']={abilities:[{id:'d',kind:'triggered',trigger:'commandDeath',ops:[{op:'draw',n:1}]}]};E.destroyInst(st,a,'test');return {hand:st.players[0].hand.length,hell:st.players[0].hell.includes(a)};});
scenario('P20','Resolve same attack twice',()=>{const {E,st}=world();st.phase='battle';const a=av(st,0);const dec=E.declareAttack(st,0,a.uid,[],{kind:'life'});E.resolveBattle(st,0,a,{kind:'life'},dec.power);E.resolveBattle(st,0,a,{kind:'life'},dec.power);return st.players[1].life.filter(x=>x.open).length;});
scenario('P21','End start sees battle phase',()=>{const {E,st}=world();st.phase='battle';let phase;E.setFX({onEndStart:s=>{phase=s.phase;}});E.nextPhase(st);return {seen:phase,after:st.phase};});
scenario('P22','Delayed wait consumed at wrong Main',()=>{const {E,st}=world();E.addDelayed(st,0,'later',{wait:{phase:'end',owner:'mine',count:3},ops:[{op:'draw',n:1}]});E.enterMain(st);return {hand:st.players[0].hand.length,delayed:st.delayed.length};});
scenario('P23','Juti after summon destroyed by React',()=>{const {E,st}=world();const c=H.mkInst(H.mkDb({print:'PROBE-J',name:'J',cost:0,mainEffect:'จุติ : จั่วการ์ด 1 ใบ'}),0);H.giveHand(st,0,[c]);global.BoTCardScripts['PROBE-J']={abilities:[{id:'j',kind:'triggered',trigger:'juti',ops:[{op:'draw',n:1}]}]};const r=H.mkInst(H.mkDb({print:'PROBE-R',type:'Magic',subtype:'React'}),1);H.giveHand(st,1,[r]);global.BoTCardScripts['PROBE-R']={abilities:[{id:'r',kind:'response',responseTo:'summon',ops:[{op:'destroy',targetSummoned:true}]}]};const result=E.summonAvatar(st,0,c.uid,[]);return {ok:result.ok,dead:st.players[0].hell.includes(c),hand:st.players[0].hand.length};});
scenario('P24','Invalid effect still consumes cost',()=>{const {FX,st}=world();const a=av(st,0,{print:'PROBE-C'});const g=H.mkInst(H.mkDb(),0);H.giveHand(st,0,[g]);global.BoTCardScripts['PROBE-C']={abilities:[{id:'x',kind:'activated',cost:{discard:1},ops:[{op:'destroy',spec:{side:'foe',zone:'avatar'}}]}]};const r=FX.execActivated(st,0,a.uid,'x',{discardUids:[g.uid]});return {ok:r.ok,paid:st.players[0].hell.includes(g),targets:st.players[1].avatar.length};});
scenario('P25','Silenced avatar cannot attack',()=>{const {E,st}=world();st.phase='battle';const a=av(st,0);a.silencedUntil=999;return E.declareAttack(st,0,a.uid,[],{kind:'life'});});
scenario('P26','Actual Magic schema',()=>{const unique=[...new Map(dbs.map(c=>[c.print,c])).values()];const m=unique.filter(c=>c.type==='Magic');return {magic:m.length,costPositive:m.filter(c=>c.cost>0).length,costDefined:m.filter(c=>c.cost!==undefined).length,example:m.find(c=>c.print==='SD01-018')};});
scenario('P27','Actual SD01-020 without an extra GEM payment',()=>{const {E,st}=world();const m=H.mkInst(H.rowFor('SD01-020'),0);H.giveHand(st,0,[m]);const g1 = H.mkInst(H.mkDb({gem: 0}), 0); const g2 = H.mkInst(H.mkDb({gem: 0}), 0); H.giveHand(st, 0, [g1, g2]); return E.playMagic(st, 0, m.uid, { payUids: [g1.uid, g2.uid] });});
scenario('P28','Actual SD01-001 Juti legal non-exact payment',()=>{const {E,st}=world();const m=H.mkInst(H.rowFor('SD01-001'),0);const g1=H.mkInst(H.mkDb({gem:4}),0),g2=H.mkInst(H.mkDb({gem:3}),0);H.giveHand(st,0,[m,g1,g2]);const target=av(st,1,{power:10});const result=E.summonAvatar(st,0,m.uid,[g1.uid,g2.uid]);return {ok:result.ok,podi:m._podi,targetPower:E.effPower(target,0,st),hand:st.players[0].hand.length};});
scenario('P29','Human battle response pause',()=>{const {E,FX,st}=world();st.phase='battle';FX.setHumanSides([1]);const a=av(st,0,{power:5});const d=av(st,1,{power:1});const react=H.mkInst(H.mkDb({type:'Magic',subtype:'React',print:'PROBE-BATTLE'}),1);H.giveHand(st,1,[react]);global.BoTCardScripts['PROBE-BATTLE']={abilities:[{id:'r',kind:'response',responseTo:'battle',ops:[{op:'buff',v:10,spec:{side:'mine',zone:'avatar'}}]}]};const dec=E.declareAttack(st,0,a.uid,[],{kind:'avatar',uid:d.uid});E.resolveBattle(st,0,a,{kind:'avatar',uid:d.uid},dec.power);return {pending:st.pendingResponses?.length,defenderAlive:st.players[1].avatar.includes(d)};});
scenario('P30','Supporter aura counted in transfer',()=>{const {E,st}=world();st.phase='battle';const a=av(st,0,{name:'Attacker',power:1});const s=av(st,0,{name:'Support',power:1,mainEffect:'สามัคคี'});E.setFX({powerAura:c=>c===s?3:0});const supportPower=E.effPower(s,0,st);const r=E.declareAttack(st,0,a.uid,[s.uid],{kind:'life'});return {supportPower,attackPower:r.power,expected:1+supportPower};});
scenario('P31','End discard chooses last card automatically',()=>{const {E,st}=world();H.giveHand(st,0,Array.from({length:8},(_,i)=>H.mkInst(H.mkDb({name:'Hand'+i}),0)));st.phase='end';E.nextPhase(st);return {discarded:st.players[0].hell.map(c=>c.db.name),choice:st.pendingChoices?.length||0};});
scenario('P32','SD01-002 attack gain counted twice at resolve',()=>{const {E,st}=world();st.phase='battle';const a=av(st,0,H.rowFor('SD01-002'));const d=av(st,1,{power:7});const dec=E.declareAttack(st,0,a.uid,[],{kind:'avatar',uid:d.uid});const displayed=E.effPower(a,0,st);E.resolveBattle(st,0,a,{kind:'avatar',uid:d.uid},dec.power);return {declared:dec.power,displayed,attackerAlive:st.players[0].avatar.includes(a),defenderAlive:st.players[1].avatar.includes(d)};});
process.stdout.write(JSON.stringify(results,null,2)+'\n');
