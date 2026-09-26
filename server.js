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
// R02/R34: minimal authority — validate deck shape once, then relay actions with
// per-room sequence numbers so clients can detect loss/reorder (full state auth TBD).
function validDeck(d) {
  return d && Array.isArray(d.main) && Array.isArray(d.life) &&
    d.main.length === 50 && d.life.length === 5;
}
wss.on('connection', (ws) => {
  ws._room = null; ws._side = null;
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch(e) { return; }
    if (typeof msg !== 'object' || !msg) return;
    if (msg.type === 'create') {
      if (!validDeck(msg.deck)) { ws.send(JSON.stringify({ type: 'error', error: 'เด็คไม่ถูกกติกา (Main 50 / LIFE 5)' })); return; }
      const code = genCode();
      rooms.set(code, { p1: ws, p2: null, deck1: msg.deck, deck2: null, seq: 0 });
      ws._room = code; ws._side = 0;
      ws.send(JSON.stringify({ type: 'created', code }));
    } else if (msg.type === 'join') {
      const room = rooms.get(msg.code);
      if (!room) { ws.send(JSON.stringify({ type: 'error', error: 'ไม่พบห้อง' })); return; }
      if (room.p2) { ws.send(JSON.stringify({ type: 'error', error: 'ห้องเต็ม' })); return; }
      if (!validDeck(msg.deck)) { ws.send(JSON.stringify({ type: 'error', error: 'เด็คไม่ถูกกติกา (Main 50 / LIFE 5)' })); return; }
      room.p2 = ws; room.deck2 = msg.deck; ws._room = msg.code; ws._side = 1;
      const seed = Math.floor(Math.random() * 1000000) + 1; room.seed = seed;
      room.p1.send(JSON.stringify({ type: 'ready', side: 0, deck1: room.deck1, deck2: room.deck2, seed }));
      room.p2.send(JSON.stringify({ type: 'ready', side: 1, deck1: room.deck1, deck2: room.deck2, seed }));
    } else if (msg.type === 'action') {
      const room = rooms.get(ws._room); if (!room) return;
      if (ws._side !== 0 && ws._side !== 1) return;
      if (!msg.action || typeof msg.action.act !== 'string') return;
      if (JSON.stringify(msg.action).length > 20000) return;
      room.seq = (room.seq || 0) + 1;
      const other = ws._side === 0 ? room.p2 : room.p1;
      if (other && other.readyState === WebSocket.OPEN)
        other.send(JSON.stringify({ type: 'action', action: msg.action, from: ws._side, seq: room.seq }));
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
