/* Shared storage + card DB for Battle of Talingchan web (no packs: all cards usable) */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BoTStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CDN_DB = 'https://cdn.bottcg.com/data/cards.3c0b9b1b.json';
  const IMG_BASE = 'https://cdn.bottcg.com/cards';
  const LS_DECKS = 'botg_decks_v1';
  const LS_ACTIVE = 'botg_active_v1';
  let DB = [];

  async function loadDB() {
    if (DB.length) return DB;
    try {
      const r = await fetch('cards.json');
      if (r.ok) { DB = await r.json(); return DB; }
    } catch (e) { /* file:// CORS -> fallback CDN */ }
    const r2 = await fetch(CDN_DB);
    DB = await r2.json();
    return DB;
  }
  function imgUrl(c) {
    let b = IMG_BASE;
    const set = (c.print || '').split('-')[0];
    if (set === 'SD09') b += '/123v1k1';
    const foil = ['SCR', 'PR', 'CBR'].indexOf(c.rare) >= 0 ? '-' + c.rare : '';
    return b + '/' + c.print + foil + '.png';
  }
  // unique gameplay prints (same print+name plays identically across foils)
  function byPrint() {
    const m = new Map();
    DB.forEach(c => { if (!m.has(c.print)) m.set(c.print, c); });
    return Array.from(m.values());
  }
  function findPrint(print) { return DB.find(c => c.print === print) || null; }
  function seriesList() {
    return Array.from(new Set(DB.map(c => (c.print || '').split('-')[0]))).sort();
  }
  // ---- saved decks: {id,name,main:[print],life:[print],updated} ----
  function listDecks() {
    try { return JSON.parse(localStorage.getItem(LS_DECKS) || '[]'); }
    catch (e) { return []; }
  }
  function saveDeck(d) {
    const all = listDecks();
    d.updated = Date.now();
    if (!d.id) d.id = 'd' + Date.now().toString(36);
    const i = all.findIndex(x => x.id === d.id);
    if (i >= 0) all[i] = d; else all.push(d);
    localStorage.setItem(LS_DECKS, JSON.stringify(all));
    return d;
  }
  function deleteDeck(id) {
    localStorage.setItem(LS_DECKS, JSON.stringify(listDecks().filter(x => x.id !== id)));
    if (getActive() === id) localStorage.removeItem(LS_ACTIVE);
  }
  function getDeck(id) { return listDecks().find(x => x.id === id) || null; }
  function setActive(id) { localStorage.setItem(LS_ACTIVE, id); }
  function getActive() { return localStorage.getItem(LS_ACTIVE) || null; }
  // resolve saved deck prints -> DB rows (skips missing)
  function resolveDeck(d) {
    const main = (d.main || []).map(findPrint).filter(Boolean);
    const life = (d.life || []).map(findPrint).filter(Boolean);
    return { main, life };
  }
  // seed bundled starter decks (e.g. imports from bottcg.com) once
  function seedStarters() {
    try {
      const starters = (typeof window !== 'undefined' && window.BoTStarterDecks) || [];
      if (!starters.length) return 0;
      const all = listDecks();
      let added = 0;
      starters.forEach(s => {
        if (all.some(x => x.starterId === s.starterId)) return;
        all.push({ id: 's' + Date.now().toString(36) + added, starterId: s.starterId, name: s.name, main: s.main.slice(), life: s.life.slice(), updated: Date.now() });
        added++;
      });
      if (added) localStorage.setItem(LS_DECKS, JSON.stringify(all));
      return added;
    } catch (e) { return 0; }
  }
  // import public deck from bottcg.com by URL or ID (uses official public API)
  async function importFromBottcg(urlOrId) {
    const m = /decks\/([A-Za-z0-9]+)/.exec(urlOrId || '') || /^([A-Za-z0-9]+)$/.exec((urlOrId || '').trim());
    if (!m) throw new Error('ใส่ลิงก์หรือรหัสเด็ค เช่น https://bottcg.com/decks/LBhllivkr1');
    const id = m[1];
    const r = await fetch('https://bottcg.com/api/decks/' + id + '?view=1');
    if (!r.ok) throw new Error('ดึงเด็คไม่ได้ (HTTP ' + r.status + ') — เช็คเน็ต/ลิงก์');
    const j = await r.json();
    if (!j.success || !j.deck) throw new Error('ไม่พบเด็คนี้');
    const dk = j.deck;
    const main = [];
    (dk.cards || []).forEach(e => { for (let i = 0; i < (e.quantity || 1); i++) main.push(e.print); });
    const life = (dk.lifeCards || []).map(c => c.print);
    const missing = main.concat(life).filter(p => !findPrint(p));
    const saved = saveDeck({ name: dk.name + ' (bottcg)', main, life });
    return { deck: saved, missing, author: (dk.user && dk.user.name) || '' };
  }
  // parse pasted deck-list text: "2x BT01-038-SR" lines, "# Life Cards" switches section
  function parseDeckList(text) {
    let sec = 'main';
    const main = [], life = [], bad = [];
    (text || '').split(/\r?\n/).forEach(ln => {
      ln = ln.trim();
      if (/^#\s*life/i.test(ln)) { sec = 'life'; return; }
      if (!ln || ln.charAt(0) === '#') return;
      const m = /^(\d+)x\s+([A-Za-z0-9]+-\d+)(?:-([A-Za-z]+))?/.exec(ln);
      if (!m) { bad.push(ln); return; }
      const q = parseInt(m[1], 10), pr = m[2].toUpperCase();
      for (let i = 0; i < q; i++) (sec === 'life' ? life : main).push(pr);
      if (!findPrint(pr)) bad.push('ไม่มีใน DB: ' + pr);
    });
    return { main, life, bad };
  }
  function randomDeck() {
    const pool = byPrint().filter(c => ['Avatar', 'Magic', 'Construct'].indexOf(c.type) >= 0);
    const only = pool.filter(c => c.ex && /only/i.test(c.ex));
    const first = only[Math.floor(Math.random() * only.length)];
    const main = [first]; const cnt = {}; cnt[first.name] = 1;
    let guard = 0;
    while (main.length < 50 && guard++ < 5000) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      if (c.ex && /only/i.test(c.ex)) continue;
      const lim = c.customLimit || 4;
      if ((cnt[c.name] || 0) >= lim) continue;
      cnt[c.name] = (cnt[c.name] || 0) + 1; main.push(c);
    }
    const ls = byPrint().filter(c => c.type === 'Life');
    const seen = {}; const life = []; guard = 0;
    while (life.length < 5 && guard++ < 500) {
      const c = ls[Math.floor(Math.random() * ls.length)];
      if (seen[c.name]) continue; seen[c.name] = 1; life.push(c);
    }
    return { main, life };
  }

  return {
    CDN_DB, IMG_BASE, loadDB, imgUrl, byPrint, findPrint, seriesList,
    listDecks, saveDeck, deleteDeck, getDeck, setActive, getActive,
    resolveDeck, randomDeck, seedStarters, importFromBottcg, parseDeckList,
    get DB() { return DB; },
  };
});
