// ==UserScript==
// @name         Tribal Wars Manager
// @namespace    tw-manager
// @version      9.16
// @description  Auto-ATK + Coleta + Saque + Recrutar + Fakes (multi-alvo/origem, chegada em horário marcado).
// @match        https://*.tribalwars.com.br/game.php*
// @match        https://*.tribalwars.net/game.php*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/JonathanWillianBraga/tw/main/tw-manager.user.js
// @downloadURL  https://raw.githubusercontent.com/JonathanWillianBraga/tw/main/tw-manager.user.js
// @run-at       document-idle
// ==/UserScript==

/*
  FONTE DA VERDADE deste script: C:\Users\jonat\OneDrive\Documentos\Dev\Claude\tw-manager.user.js
  O Claude edita este arquivo diretamente. Sincronize com o Tampermonkey (ver instruções na conversa).
*/

(function () {
  'use strict';
  if (typeof window.game_data === 'undefined' || !window.game_data.village) return;

  const UNITS = [
    ['spear', 'Lanc.'], ['sword', 'Espad.'], ['axe', 'Bárb.'], ['archer', 'Arq.'],
    ['spy', 'Expl.'], ['light', 'C.leve'], ['marcher', 'A.cav.'], ['heavy', 'C.pes.'],
    ['ram', 'Aríete'], ['catapult', 'Catap.'], ['knight', 'Palad.'], ['snob', 'Nobre'],
  ];

  const SCAV_UNITS = [['spear', 'Lanc.'], ['sword', 'Espad.'], ['axe', 'Bárb.'], ['light', 'C.leve'], ['heavy', 'C.pes.'], ['knight', 'Palad.']];
  const CARRY = { spear: 25, sword: 15, axe: 10, light: 80, heavy: 50, knight: 100 };
  const POP = { spear: 1, sword: 1, axe: 1, light: 4, heavy: 6, knight: 10 };
  const LOOT_FACTOR = { 1: 0.1, 2: 0.25, 3: 0.5, 4: 0.75 };
  const MIN_POP = 10;

  const RUNITS = [['spear', 'Lanc.'], ['sword', 'Espad.'], ['axe', 'Bárb.'], ['spy', 'Expl.'],
                  ['light', 'C.leve'], ['heavy', 'C.pes.'], ['ram', 'Aríete'], ['catapult', 'Catap.']];
  const BUILDING_OF = { spear: 'barracks', sword: 'barracks', axe: 'barracks',
                        spy: 'stable', light: 'stable', heavy: 'stable', ram: 'garage', catapult: 'garage' };
  const BUILD_KEYS = ['main', 'barracks', 'stable', 'garage', 'watchtower', 'snob', 'smith', 'place', 'statue', 'market', 'wood', 'stone', 'iron', 'farm', 'storage', 'hide', 'wall'];
  const ATK_TPL = 'main 15\nfarm 20\nstorage 20\nwood 15\nstone 15\niron 15\nsmith 10\nbarracks 10\nmarket 5\ngarage 5\nwood 20\nstone 20\niron 20\nfarm 24\nstorage 24\nmain 20\nstable 15\nbarracks 15\nmarket 10\ngarage 10\nwood 25\nstone 25\niron 25\nfarm 27\nstorage 27\nstable 20\nbarracks 20\nmarket 15\nwood 30\nstone 30\niron 30\nfarm 30\nstorage 30\nbarracks 25\nmarket 20';
  const DEF_TPL = 'main 15\nfarm 20\nstorage 20\nwood 15\nstone 15\niron 15\nsmith 5\nbarracks 10\nmarket 5\nstable 10\nwall 10\nwood 20\nstone 20\niron 20\nfarm 24\nstorage 24\nmain 20\nbarracks 15\nwall 15\nmarket 10\nwood 25\nstone 25\niron 25\nfarm 27\nstorage 27\nbarracks 20\nwall 20\nmarket 15\nwood 30\nstone 30\niron 30\nfarm 30\nstorage 30\nbarracks 25\nmarket 20';

  const VERSION = '9.16';
  const UPDATE_URL = 'https://raw.githubusercontent.com/JonathanWillianBraga/tw/main/tw-manager.user.js';
  let updateInfo = { checked: false, hasUpdate: false, remoteVersion: '' };
  const WORLD = window.game_data.world || 'w';
  const KEY = 'twMgr_' + WORLD;
  const LOGKEY = KEY + '_log';
  const LOCKKEY = KEY + '_lock';
  const CSRF = window.game_data.csrf;
  const CUR_VID = String(window.game_data.village.id);
  const CUR_NAME = window.game_data.village.name || ('ID ' + CUR_VID);

  let IMG_BASE = '';
  try { const im = document.querySelector('img[src*="/asset/"]'); if (im) { const mm = im.src.match(/^(https?:\/\/[^/]+\/asset\/[^/]+\/)/); if (mm) IMG_BASE = mm[1]; } } catch (e) {}
  function unitIcon(u, label) { return IMG_BASE ? '<img class="twmgr-ui" src="' + IMG_BASE + 'graphic/unit/unit_' + u + '.png" title="' + label + '" alt="' + label + '">' : label; }

  let TAB_ID = sessionStorage.getItem('twmgr_tabid');
  if (!TAB_ID) { TAB_ID = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); sessionStorage.setItem('twmgr_tabid', TAB_ID); }

  let _idc = 0;
  function genId() { return 'g' + Date.now().toString(36) + (_idc++).toString(36) + Math.random().toString(36).slice(2, 5); }

  const defScav = () => ({ running: false, nextAt: 0, units: { spear: true, sword: true, axe: true, light: true, heavy: true, knight: false } });
  const defFarm = () => ({ running: false, nextAt: 0, interval: 600, minWood: 1000, minStone: 1000, minIron: 1000, maxDist: 13, maxWall: 20, delay: 500, sentReports: {}, ramMode: 'off', ramFixed: 20, ramWall6: 24, axeCount: 80 });
  const defRecruit = () => ({
    running: false, nextAt: 0, interval: 600, targetHours: 2, refillBelowMin: 30,
    groupAtk: null, groupDef: null, profiles: { atk: { targets: {} }, def: { targets: {} } }, overrides: {}, queueEst: {},
  });
  const defFakes = () => ({ running: false, offsetMs: 150, targetsRaw: '', arrLocal: '', mode: 'split', pct: 1, minPop: 0, siege: 'ram', filler: 'spy', origins: {}, gen: [] });
  const defMarket = () => ({ running: false, mode: 'cunhagem', nextAt: 0, interval: 600, destCoord: '', reserve: 0, sources: {}, thresholdPct: 50, maxDist: 15, inflight: {} });
  const defBuild = () => ({ running: false, nextAt: 0, interval: 600, maxQueue: 5, atkTpl: ATK_TPL, defTpl: DEF_TPL, demand: {} });
  const def = () => ({ targets: [], reloadAfterSend: true, running: false, scav: defScav(), farm: defFarm(), recruit: defRecruit(), fakes: defFakes(), market: defMarket(), build: defBuild() });
  function load() {
    let c = def();
    try {
      const r = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (r) {
        if (r.targets) c = Object.assign(c, r);
        else if (r.x || r.units) { c.targets = [{ id: genId(), x: r.x || '', y: r.y || '', enabled: true, units: r.units || {}, nextSendAt: 0 }]; c.running = false; }
      }
    } catch (e) {}
    if (!c.scav) c.scav = defScav();
    if (!c.scav.units) c.scav.units = defScav().units;
    if (!c.farm) c.farm = defFarm();
    if (!c.farm.sentReports) c.farm.sentReports = {};
    if (c.farm.maxDist == null) c.farm.maxDist = 13;
    if (c.farm.maxWall == null) c.farm.maxWall = 20;
    if (c.farm.delay == null) c.farm.delay = 500;
    if (!c.farm.ramMode) c.farm.ramMode = 'off';
    if (c.farm.ramFixed == null) c.farm.ramFixed = 20;
    if (c.farm.ramWall6 == null) c.farm.ramWall6 = 24;
    if (c.farm.axeCount == null) c.farm.axeCount = 80;
    const oldMin = c.farm.min != null ? c.farm.min : 1000;
    if (c.farm.minWood == null) c.farm.minWood = oldMin;
    if (c.farm.minStone == null) c.farm.minStone = oldMin;
    if (c.farm.minIron == null) c.farm.minIron = oldMin;
    if (!c.recruit) c.recruit = defRecruit();
    if (!c.recruit.profiles) c.recruit.profiles = { atk: { targets: {} }, def: { targets: {} } };
    if (!c.recruit.profiles.atk) c.recruit.profiles.atk = { targets: {} };
    if (!c.recruit.profiles.def) c.recruit.profiles.def = { targets: {} };
    if (!c.recruit.overrides) c.recruit.overrides = {};
    if (!c.recruit.queueEst) c.recruit.queueEst = {};
    if (c.recruit.targetHours == null) c.recruit.targetHours = 2;
    if (c.recruit.refillBelowMin == null) c.recruit.refillBelowMin = 30;
    if (c.recruit.interval == null) c.recruit.interval = 600;
    if (!c.fakes) c.fakes = defFakes();
    if (c.fakes.offsetMs == null) c.fakes.offsetMs = 150;
    if (c.fakes.pct == null) c.fakes.pct = 1;
    if (c.fakes.minPop == null) c.fakes.minPop = 0;
    if (!c.fakes.mode) c.fakes.mode = 'split';
    if (!c.fakes.siege) c.fakes.siege = 'ram';
    if (!c.fakes.filler) c.fakes.filler = 'spy';
    if (!c.fakes.origins) c.fakes.origins = {};
    if (!c.fakes.gen) c.fakes.gen = [];
    if (c.fakes.targetsRaw == null) c.fakes.targetsRaw = '';
    if (c.fakes.arrLocal == null) c.fakes.arrLocal = '';
    if (!c.market) c.market = defMarket();
    if (!c.market.mode) c.market.mode = 'cunhagem';
    if (c.market.interval == null) c.market.interval = 600;
    if (c.market.reserve == null) c.market.reserve = 0;
    if (!c.market.sources) c.market.sources = {};
    if (c.market.destCoord == null) c.market.destCoord = '';
    if (c.market.thresholdPct == null) c.market.thresholdPct = 50;
    if (c.market.maxDist == null) c.market.maxDist = 15;
    if (!c.market.inflight) c.market.inflight = {};
    if (!c.recruit.demand) c.recruit.demand = {};
    if (!c.build) c.build = defBuild();
    if (!c.build.atkTpl) c.build.atkTpl = ATK_TPL;
    if (!c.build.defTpl) c.build.defTpl = DEF_TPL;
    if (c.build.maxQueue == null) c.build.maxQueue = 5;
    if (c.build.interval == null) c.build.interval = 600;
    if (!c.build.demand) c.build.demand = {};
    (c.targets || []).forEach((t) => { if (!t.origin) { t.origin = CUR_VID; t.originName = CUR_NAME; } });
    return c;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(config)); }

  let config = load();
  let sendTimer = null, scavTimer = null, farmTimer = null, recruitTimer = null, fakeTimer = null, marketTimer = null, buildTimer = null, uiTimer = null;
  function anyRunning() { return config.running || (config.scav && config.scav.running) || (config.farm && config.farm.running) || (config.recruit && config.recruit.running) || (config.fakes && config.fakes.running) || (config.market && config.market.running) || (config.build && config.build.running); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function readLock() { try { return JSON.parse(localStorage.getItem(LOCKKEY) || 'null'); } catch (e) { return null; } }
  function lockOther() { const l = readLock(); return !!(l && l.id !== TAB_ID && (Date.now() - l.ts) < 12000); }
  function claimLock() { localStorage.setItem(LOCKKEY, JSON.stringify({ id: TAB_ID, ts: Date.now() })); }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pushLog(msg, kind) {
    let arr = []; try { arr = JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch (e) {}
    arr.unshift({ t: new Date().toLocaleTimeString(), m: msg, k: kind || '' });
    localStorage.setItem(LOGKEY, JSON.stringify(arr.slice(0, 60)));
    renderLog();
  }
  function renderLog() {
    const box = document.getElementById('twmgr-log'); if (!box) return;
    let arr = []; try { arr = JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch (e) {}
    box.innerHTML = arr.map((l) => {
      const c = l.k === 'err' ? '#ff7568' : l.k === 'ok' ? '#8fe39a' : '#cbb98f';
      return '<div style="color:' + c + ';border-bottom:1px solid rgba(255,255,255,.05);padding:2px 0">[' + esc(l.t) + '] ' + esc(l.m) + '</div>';
    }).join('');
  }

  function renderUpdateBadge() {
    const b = document.getElementById('twmgr-upd-badge');
    const btn = document.getElementById('twmgr-upd-btn');
    if (b) b.style.display = updateInfo.hasUpdate ? 'inline-block' : 'none';
    if (btn) btn.title = updateInfo.hasUpdate ? ('Nova versão v' + updateInfo.remoteVersion + ' disponível — clique para atualizar') : 'Verificar / instalar atualização';
  }

  async function checkForUpdate(manual) {
    try {
      const res = await fetch(UPDATE_URL + (UPDATE_URL.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const m = text.match(/@version\s+([\w.\-]+)/);
      const remote = m ? m[1] : null;
      updateInfo.checked = true;
      updateInfo.remoteVersion = remote || '?';
      updateInfo.hasUpdate = !!remote && remote !== VERSION;
      localStorage.setItem(KEY + '_lastUpdCheck', String(Date.now()));
      if (manual) {
        pushLog(updateInfo.hasUpdate ? ('Nova versão disponível: v' + remote + ' (atual v' + VERSION + '). Clique em 🔄 para instalar.') : ('Você já está na versão mais recente (v' + VERSION + ').'), updateInfo.hasUpdate ? 'ok' : '');
      } else if (updateInfo.hasUpdate) {
        pushLog('Nova versão disponível: v' + remote + '. Clique no botão 🔄 no topo do painel para instalar.', 'ok');
      }
      renderUpdateBadge();
    } catch (e) {
      if (manual) pushLog('Falha ao verificar atualização: ' + (e.message || e), 'err');
    }
  }

  function doUpdate() {
    pushLog('Abrindo instalador do Tampermonkey em nova aba (confirme a atualização por lá)...', 'ok');
    window.open(UPDATE_URL + (UPDATE_URL.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now(), '_blank');
  }

  function fmt(ms) {
    if (ms < 0) ms = 0; let s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (h ? h + ':' : '') + p(m) + ':' + p(s);
  }
  function absUrl(raw) { try { return new URL(raw, location.href).href; } catch (e) { return raw; } }

  function serverNow() { try { return window.Timing.getCurrentServerTime(); } catch (e) { return Date.now(); } }
  function wallToServerOffset() {
    const ed = document.querySelector('#serverDate'), et = document.querySelector('#serverTime');
    if (!ed || !et) return serverNow() - Date.now();
    const dm = (ed.textContent || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const tm = (et.textContent || '').match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!dm || !tm) return serverNow() - Date.now();
    const wallLocal = new Date(+dm[3], +dm[2] - 1, +dm[1], +tm[1], +tm[2], +tm[3]).getTime();
    return serverNow() - wallLocal;
  }
  function arrivalToServerMs(dtLocal) {
    if (!dtLocal) return 0;
    const localMs = new Date(dtLocal).getTime();
    if (isNaN(localMs)) return 0;
    return localMs + wallToServerOffset();
  }

  function parseCommands(doc) {
    const cmds = [];
    doc.querySelectorAll('tr.command-row').forEach((tr) => {
      const typeEl = tr.querySelector('.command_hover_details[data-command-type]');
      const kind = typeEl ? (typeEl.getAttribute('data-command-type') || 'other') : 'other';
      const label = tr.querySelector('.quickedit-label');
      const mc = label ? (label.textContent || '').match(/(\d{1,3})\|(\d{1,3})/) : null;
      const coord = mc ? (mc[1] + '|' + mc[2]) : null;
      const timer = tr.querySelector('td span[data-endtime]');
      let endMs = 0;
      if (timer) {
        const mt = (timer.textContent || '').match(/(\d+):([0-5]?\d):([0-5]\d)/);
        if (mt) endMs = Date.now() + ((+mt[1]) * 3600 + (+mt[2]) * 60 + (+mt[3])) * 1000;
        else { const et = parseInt(timer.getAttribute('data-endtime'), 10); if (et) endMs = et * 1000; }
      }
      const idEl = tr.querySelector('.quickedit-out[data-id]');
      cmds.push({ kind: kind, coord: coord, endMs: endMs, id: idEl ? idEl.getAttribute('data-id') : null });
    });
    return cmds;
  }

  async function getVillageState(vid) {
    vid = vid || CUR_VID;
    const res = await fetch('/game.php?village=' + vid + '&screen=place', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const avail = {};
    UNITS.forEach(([u]) => {
      let n = 0;
      const inp = doc.querySelector('#unit_input_' + u + ', input[name="' + u + '"]');
      if (inp) {
        const scope = inp.closest('td') || inp.closest('tr') || inp.parentElement;
        const link = scope ? scope.querySelector('.units-entry-all') : null;
        if (link) { const dc = link.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (link.textContent || '').replace(/\D/g, ''), 10); }
      }
      if (!n) { const alt = doc.querySelector('a.units-entry-all[data-unit="' + u + '"]'); if (alt) { const dc = alt.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (alt.textContent || '').replace(/\D/g, ''), 10); } }
      avail[u] = isNaN(n) ? 0 : n;
    });
    return { avail: avail, commands: parseCommands(doc) };
  }

  async function sendAttack(vid, x, y, amounts) {
    const p1 = new URLSearchParams();
    Object.entries(amounts).forEach(([u, a]) => p1.set(u, String(a)));
    p1.set('x', String(x)); p1.set('y', String(y)); p1.set('input', x + '|' + y);
    p1.set('attack', 'l'); p1.set('h', CSRF);
    const r1 = await fetch('/game.php?village=' + vid + '&screen=place&try=confirm', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p1.toString() });
    let t1 = await r1.text();
    try { const j = JSON.parse(t1); t1 = (j.response && j.response.dialog) || j.dialog || t1; } catch (e) {}
    const doc = new DOMParser().parseFromString(t1, 'text/html');
    const form = doc.querySelector('#command-data-form') || doc.querySelector('form[action*="action=command"]');
    if (!form) { const errEl = doc.querySelector('.error, .autoHideBox, #command_confirmation_error'); throw new Error('Confirmação falhou: ' + (errEl ? errEl.textContent.trim().slice(0, 100) : 'tropas insuficientes/alvo inválido')); }
    let dur = null;
    const dd = doc.querySelector('[data-duration]');
    if (dd) dur = parseInt(dd.getAttribute('data-duration'), 10);
    if (!dur) { const txt = doc.body ? doc.body.textContent : t1; const m = txt.match(/dura[çc][aã]o[^0-9]{0,12}(\d{1,2}):([0-5]\d):([0-5]\d)/i); if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); }
    const p2 = new URLSearchParams();
    form.querySelectorAll('input, select').forEach((el) => { if (el.name) p2.set(el.name, el.value); });
    if (!p2.has('h')) p2.set('h', CSRF);
    const action = form.getAttribute('action') || ('/game.php?village=' + vid + '&screen=place&action=command&h=' + CSRF);
    const r2 = await fetch(absUrl(action), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p2.toString() });
    const t2 = await r2.text();
    if (/n[aã]o tem tropas suficientes|not enough/i.test(t2)) throw new Error('Servidor recusou: tropas insuficientes.');
    return dur && dur > 0 ? dur : null;
  }

  function computeAmounts(units, avail) {
    const amounts = {}; let ready = true, total = 0;
    UNITS.forEach(([u]) => {
      const c = units[u]; if (!c) return;
      if (c.max) { if (avail[u] > 0) { amounts[u] = avail[u]; total += avail[u]; } }
      else if (c.qty > 0) { if (avail[u] >= c.qty) { amounts[u] = c.qty; total += c.qty; } else ready = false; }
    });
    return { amounts, ready, total };
  }
  function hasUnits(t) { return UNITS.some(([u]) => t.units[u] && (t.units[u].max || t.units[u].qty > 0)); }

  async function processDue() {
    clearTimeout(sendTimer);
    if (!config.running) return;
    if (lockOther()) { sendTimer = setTimeout(processDue, 5000); return; }
    claimLock();
    const now = Date.now();
    const due = config.targets.filter((t) => t.enabled && hasUnits(t) && (t.nextSendAt || 0) <= now && t.x && t.y);
    if (due.length === 0) { scheduleWake(); return; }
    const byOrigin = {};
    due.forEach((t) => { const o = t.origin || CUR_VID; (byOrigin[o] = byOrigin[o] || []).push(t); });
    let sentAny = false;
    for (const origin of Object.keys(byOrigin)) {
      let state;
      try { state = await getVillageState(origin); }
      catch (e) { pushLog('Erro ao ler estado (' + origin + '): ' + (e.message || e), 'err'); byOrigin[origin].forEach((t) => { t.nextSendAt = now + 30000; }); continue; }
      const avail = state.avail;
      for (const t of byOrigin[origin]) {
        const coord = t.x + '|' + t.y;
        const blk = state.commands.filter((c) => c.coord === coord && (c.kind === 'attack' || c.kind === 'return'));
        if (blk.length) { t.nextSendAt = Math.min.apply(null, blk.map((c) => c.endMs || (now + 30000))) + 8000; t.phase = 'inflight'; continue; }
        const { amounts, ready, total } = computeAmounts(t.units, avail);
        if (!ready || total === 0) { t.nextSendAt = now + 30000; continue; }
        try {
          const desc = Object.entries(amounts).map(([u, a]) => u + '=' + a).join(', ');
          await sendAttack(origin, t.x, t.y, amounts);
          Object.entries(amounts).forEach(([u, a]) => { avail[u] = Math.max(0, (avail[u] || 0) - a); });
          t.lastSentAt = now; t.phase = 'sent'; t.nextSendAt = now + 12000; sentAny = true;
          pushLog('Enviado → ' + coord + ' [' + desc + '] · de ' + (t.originName || origin), 'ok');
        } catch (e) { t.nextSendAt = now + 30000; pushLog('Falha em ' + coord + ' (de ' + (t.originName || origin) + '): ' + (e.message || e), 'err'); }
      }
    }
    save();
    if (config.reloadAfterSend && sentAny) { setTimeout(() => location.reload(), 900); } else { scheduleWake(); }
  }

  function scheduleWake() {
    clearTimeout(sendTimer);
    if (!config.running) return;
    const now = Date.now();
    const times = config.targets.filter((t) => t.enabled && hasUnits(t) && t.x && t.y).map((t) => t.nextSendAt || 0);
    const next = times.length ? Math.min.apply(null, times) : now + 60000;
    sendTimer = setTimeout(processDue, Math.min(Math.max(Math.max(0, next - now), 1000), 60000));
  }

  async function getAllScavengeState() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=place&mode=scavenge_mass', { credentials: 'include' });
    const html = await res.text();
    const m = html.match(/\[\{"village_id":[\s\S]*?\}\]/);
    if (!m) throw new Error('dados de coleta em massa não encontrados');
    let arr; try { arr = JSON.parse(m[0]); } catch (e) { throw new Error('falha ao ler dados de coleta'); }
    return arr.map((v) => {
      const carryFactor = parseFloat(v.unit_carry_factor) || 1;
      const home = v.unit_counts_home || {};
      const avail = {}; SCAV_UNITS.forEach(([u]) => { avail[u] = parseInt(home[u], 10) || 0; });
      const options = [];
      for (let id = 1; id <= 4; id++) {
        const o = v.options && v.options[id];
        let state = 'locked', endMs = 0;
        if (o) { if (o.is_locked) state = 'locked'; else if (o.scavenging_squad) { state = 'running'; endMs = (o.scavenging_squad.return_time || 0) * 1000; } else state = 'free'; }
        options.push({ id: id, state: state, endMs: endMs });
      }
      return { vid: String(v.village_id), name: v.village_name || ('ID ' + v.village_id), carryFactor: carryFactor, avail: avail, options: options };
    });
  }

  function distribute(count, weights) {
    const W = weights.reduce((a, b) => a + b, 0) || 1;
    const raw = weights.map((w) => count * w / W);
    const base = raw.map(Math.floor);
    let rem = count - base.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => [i, r - Math.floor(r)]).sort((a, b) => b[1] - a[1]);
    for (let k = 0; k < rem; k++) base[order[k % order.length][0]]++;
    return base;
  }

  async function sendMassScavenge(reqs) {
    const b = new URLSearchParams();
    reqs.forEach((r, k) => {
      const p = 'squad_requests[' + k + ']';
      b.set(p + '[village_id]', r.vid);
      Object.entries(r.units).forEach(([u, n]) => { if (n > 0) b.set(p + '[candidate_squad][unit_counts][' + u + ']', String(n)); });
      b.set(p + '[candidate_squad][carry_max]', String(r.carry));
      b.set(p + '[option_id]', String(r.optionId));
      b.set(p + '[use_premium]', 'false');
    });
    b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=scavenge_api&ajaxaction=send_squads', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'TribalWars-Ajax': '1', 'X-Requested-With': 'XMLHttpRequest' }, body: b.toString() });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (j && j.error) throw new Error(Array.isArray(j.error) ? j.error.join('; ') : String(j.error));
    return true;
  }

  async function scavTick() {
    clearTimeout(scavTimer);
    if (!config.scav.running) return;
    if (lockOther()) { scavTimer = setTimeout(scavTick, 5000); return; }
    claimLock();
    const now = Date.now();
    if ((config.scav.nextAt || 0) > now) { scheduleScav(); return; }
    let villages;
    try { villages = await getAllScavengeState(); }
    catch (e) { pushLog('Coleta: erro ao ler estado: ' + (e.message || e), 'err'); config.scav.nextAt = now + 60000; save(); scheduleScav(); return; }
    const selUnits = SCAV_UNITS.map(([u]) => u).filter((u) => config.scav.units[u]);
    const reqs = [], runningEnds = [];
    for (const v of villages) {
      v.options.filter((o) => o.state === 'running' && o.endMs).forEach((o) => runningEnds.push(o.endMs));
      const freeOpts = v.options.filter((o) => o.state === 'free');
      const avail = {}; let totalUnits = 0;
      selUnits.forEach((u) => { const n = v.avail[u] || 0; if (n > 0) { avail[u] = n; totalUnits += n; } });
      if (!freeOpts.length || totalUnits === 0) continue;
      const weights = freeOpts.map((o) => 1 / (LOOT_FACTOR[o.id] || 0.1));
      const alloc = freeOpts.map(() => ({}));
      Object.entries(avail).forEach(([u, n]) => { distribute(n, weights).forEach((c, i) => { if (c > 0) alloc[i][u] = c; }); });
      for (let i = 0; i < freeOpts.length; i++) {
        const a = alloc[i];
        const pop = Object.entries(a).reduce((s, [u, c]) => s + c * (POP[u] || 1), 0);
        const carry = Math.floor(Object.entries(a).reduce((s, [u, c]) => s + c * (CARRY[u] || 0), 0) * (v.carryFactor || 1));
        if (pop < MIN_POP || carry <= 0) continue;
        reqs.push({ vid: v.vid, name: v.name, optionId: freeOpts[i].id, units: a, carry: carry });
      }
    }
    let sent = false;
    if (reqs.length) {
      try {
        await sendMassScavenge(reqs);
        reqs.forEach((r) => pushLog('Coleta · ' + r.name + ' · opção ' + r.optionId + ' [' + Object.entries(r.units).map(([u, c]) => u + '=' + c).join(',') + ']', 'ok'));
        pushLog('Coleta em massa enviada: ' + reqs.length + ' esquadrão(ões).', 'ok'); sent = true;
      } catch (e) { pushLog('Coleta em massa falhou: ' + (e.message || e), 'err'); }
    }
    let next;
    if (sent) next = now + 15000; else if (runningEnds.length) next = Math.min.apply(null, runningEnds) + 8000; else next = now + 300000;
    config.scav.nextAt = next; save(); scheduleScav();
  }
  function scheduleScav() { clearTimeout(scavTimer); if (!config.scav.running) return; scavTimer = setTimeout(scavTick, Math.min(Math.max((config.scav.nextAt || 0) - Date.now(), 1000), 60000)); }

  async function getFarmTargets(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=am_farm', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const rows = [];
    doc.querySelectorAll('#plunder_list tr[id^="village_"]').forEach((tr) => {
      const targetId = tr.id.replace('village_', '');
      const rl = tr.querySelector('a[href*="view="]');
      let reportId = null, coord = '';
      if (rl) { const m = rl.getAttribute('href').match(/view=(\d+)/); if (m) reportId = m[1]; coord = (rl.textContent || '').trim(); }
      const vals = tr.querySelectorAll('span.res, span.warn');
      const nums = Array.prototype.slice.call(vals, 0, 3).map((s) => parseInt((s.textContent || '').replace(/\D/g, ''), 10) || 0);
      const resTd = tr.querySelector('td[colspan="3"]');
      const wallTd = resTd ? resTd.nextElementSibling : null;
      const distTd = wallTd ? wallTd.nextElementSibling : null;
      const wall = wallTd ? (parseInt((wallTd.textContent || '').replace(/\D/g, ''), 10) || 0) : null;
      let dist = null;
      if (distTd) { const dm = (distTd.textContent || '').replace(',', '.').match(/[\d.]+/); if (dm) dist = parseFloat(dm[0]); }
      const cA = tr.querySelector('.farm_icon_c');
      const cEnabled = !!(cA && !cA.classList.contains('farm_icon_disabled') && !cA.classList.contains('start_locked') && cA.getAttribute('data-units-forecast'));
      rows.push({ targetId: targetId, reportId: reportId, wood: nums[0] || 0, stone: nums[1] || 0, iron: nums[2] || 0, wall: wall, dist: dist, cEnabled: cEnabled, coord: coord });
    });
    return rows;
  }

  async function sendFarmC(vid, reportId) {
    const b = new URLSearchParams(); b.set('report_id', String(reportId)); b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + vid + '&screen=am_farm&mode=farm&ajaxaction=farm_from_report&json=1', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'TribalWars-Ajax': '1', 'X-Requested-With': 'XMLHttpRequest' }, body: b.toString() });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (j && j.error) throw new Error(Array.isArray(j.error) ? j.error.join('; ') : String(j.error));
    return true;
  }

  function ramsForWall(w, ramWall6) {
    if (w <= 0) return 0;
    const base = (x) => Math.pow(1.09, x) * (4 * x - 2) + 0.5;   // fórmula oficial (nº de níveis)
    return Math.ceil(base(w) * ((ramWall6 || 24) / base(6)));    // calibrado no dado do usuário (muro 6)
  }
  async function farmTick() {
    clearTimeout(farmTimer);
    if (!config.farm.running) return;
    if (lockOther()) { farmTimer = setTimeout(farmTick, 5000); return; }
    claimLock();
    const now = Date.now();
    if ((config.farm.nextAt || 0) > now) { scheduleFarm(); return; }
    let villages;
    try { villages = await getAllScavengeState(); }
    catch (e) { pushLog('Saque: erro ao listar aldeias: ' + (e.message || e), 'err'); config.farm.nextAt = now + 120000; save(); scheduleFarm(); return; }
    const minW = config.farm.minWood || 0, minS = config.farm.minStone || 0, minI = config.farm.minIron || 0;
    const maxDist = config.farm.maxDist != null ? config.farm.maxDist : 13;
    const maxWall = config.farm.maxWall != null ? config.farm.maxWall : 20;
    const delay = Math.max(0, config.farm.delay != null ? config.farm.delay : 500);
    const sent = config.farm.sentReports || {};
    const useRam = config.farm.ramMode && config.farm.ramMode !== 'off';
    const axeN = Math.max(1, config.farm.axeCount || 80);
    let count = 0;
    for (const v of villages) {
      let targets;
      try { targets = await getFarmTargets(v.vid); }
      catch (e) { pushLog('Saque ' + v.name + ': erro ao ler alvos: ' + (e.message || e), 'err'); continue; }
      let avail = null;
      if (useRam) { try { avail = (await getVillageState(v.vid)).avail; } catch (e) { avail = {}; } }
      const eligible = []; const skip = { cbloq: 0, rec: 0, dist: 0, mur: 0, jasaq: 0 };
      targets.forEach((t) => {
        if (!t.reportId) { skip.cbloq++; return; }
        if (!useRam && !t.cEnabled) { skip.cbloq++; return; }
        if (t.wood < minW || t.stone < minS || t.iron < minI) { skip.rec++; return; }
        if (t.dist != null && t.dist > maxDist) { skip.dist++; return; }
        if (t.wall != null && t.wall > maxWall) { skip.mur++; return; }
        if (sent[t.reportId]) { skip.jasaq++; return; }
        eligible.push(t);
      });
      let vSent = 0, exhausted = false;
      for (let i = 0; i < eligible.length; i++) {
        const t = eligible[i];
        try {
          if (useRam) {
            const cm = (t.coord || '').match(/(\d+)\|(\d+)/);
            if (!cm) continue;
            let rams;
            if (config.farm.ramMode === 'fixo') rams = Math.max(0, config.farm.ramFixed || 0);
            else { if (t.wall == null) continue; rams = ramsForWall(t.wall, config.farm.ramWall6 || 24); }
            if ((avail.axe || 0) < axeN || (avail.ram || 0) < rams) { exhausted = true; pushLog('Saque ' + v.name + ': tropa insuficiente (bárbaro/aríete) → próxima aldeia.'); break; }
            const amounts = { axe: axeN }; if (rams > 0) amounts.ram = rams;
            await sendAttack(v.vid, cm[1], cm[2], amounts);
            avail.axe -= axeN; avail.ram = (avail.ram || 0) - rams;
            sent[t.reportId] = now; count++; vSent++;
            pushLog('Farm+aríete · ' + v.name + ' → ' + t.coord + ' [bb ' + axeN + (rams ? ', ar ' + rams : '') + ' · muro ' + (t.wall != null ? t.wall : '?') + ']', 'ok');
          } else {
            await sendFarmC(v.vid, t.reportId);
            sent[t.reportId] = now; count++; vSent++;
            pushLog('Saque C · ' + v.name + ' → ' + t.coord + ' [' + t.wood + '/' + t.stone + '/' + t.iron + ']' + (t.dist != null ? ' · ' + t.dist : '') + (t.wall != null ? ' · m' + t.wall : ''), 'ok');
          }
          if (i < eligible.length - 1) await sleep(delay + Math.floor(Math.random() * 250));
        } catch (e) { exhausted = true; pushLog('Saque ' + v.name + ': envio falhou/esgotou (' + (eligible.length - i) + ' restante(s)) → próxima aldeia.'); break; }
      }
      const parts = ['✓' + vSent];
      if (exhausted) parts.push('esgotou');
      if (skip.rec) parts.push('rec<min ' + skip.rec);
      if (skip.dist) parts.push('dist> ' + skip.dist);
      if (skip.mur) parts.push('mur> ' + skip.mur);
      if (skip.cbloq) parts.push('C-bloq ' + skip.cbloq);
      if (skip.jasaq) parts.push('já saq ' + skip.jasaq);
      pushLog('  ' + v.name + ': ' + parts.join(' · '));
    }
    Object.keys(sent).forEach((r) => { if (now - sent[r] > 6 * 3600 * 1000) delete sent[r]; });
    config.farm.sentReports = sent;
    config.farm.nextAt = now + Math.max(60, config.farm.interval || 600) * 1000;
    save();
    pushLog('Saque: ciclo concluído · ' + count + ' envio(s). Próximo em ' + Math.round((config.farm.interval || 600) / 60) + ' min.', 'ok');
    scheduleFarm();
  }
  function scheduleFarm() { clearTimeout(farmTimer); if (!config.farm.running) return; farmTimer = setTimeout(farmTick, Math.min(Math.max((config.farm.nextAt || 0) - Date.now(), 1000), 60000)); }

  // ==================== RECRUTAR ====================
  async function getGroups() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&page=-1', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const seen = {}, groups = [];
    doc.querySelectorAll('a[href*="group_id="], [data-group-id]').forEach((el) => {
      let id = el.getAttribute('data-group-id');
      if (!id) { const m = (el.getAttribute('href') || '').match(/group_id=(\d+)/); id = m ? m[1] : null; }
      if (!id || id === '0' || seen[id]) return;
      seen[id] = 1; groups.push({ id: String(id), name: (el.textContent || '').trim() || ('grupo ' + id) });
    });
    return groups;
  }
  async function getVillagesInGroup(gid) {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=' + gid + '&page=-1', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const seen = {}, vils = [];
    doc.querySelectorAll('span.quickedit-vn[data-id], span.quickedit[data-id], .quickedit-out[data-id]').forEach((el) => {
      const vid = el.getAttribute('data-id'); if (!vid || seen[vid]) return;
      const cont = el.closest('td, tr, span.quickedit') || el;
      const lbl = cont.querySelector('.quickedit-label');
      const cm = lbl ? (lbl.textContent || '').match(/(\d{1,3})\|(\d{1,3})/) : null;
      seen[vid] = 1; vils.push({ vid: String(vid), coord: cm ? (cm[1] + '|' + cm[2]) : null });
    });
    return vils;
  }
  async function getAllVillages() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&page=-1', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const seen = {}, vils = [];
    doc.querySelectorAll('span.quickedit-vn[data-id], span.quickedit[data-id], .quickedit-out[data-id]').forEach((el) => {
      const vid = el.getAttribute('data-id'); if (!vid || seen[vid]) return;
      const cont = el.closest('td, tr, span.quickedit') || el;
      const lbl = cont.querySelector('.quickedit-label');
      const name = lbl ? (lbl.textContent || '').replace(/\s+/g, ' ').trim() : vid;
      const cm2 = name.match(/(\d{1,3})\|(\d{1,3})/);
      seen[vid] = 1; vils.push({ vid: String(vid), name: name, coord: cm2 ? (cm2[1] + '|' + cm2[2]) : null });
    });
    if (!vils.length) vils.push({ vid: CUR_VID, name: CUR_NAME });
    return vils;
  }
  async function resolveTargets() {
    const r = config.recruit, map = {};
    const add = (list, prof) => (list || []).forEach((v) => { if (map[v.vid]) return; map[v.vid] = { name: v.coord || v.vid, targets: r.profiles[prof].targets }; });
    let atkV = [], defV = [];
    if (r.groupAtk) { try { atkV = await getVillagesInGroup(r.groupAtk); } catch (e) { pushLog('Recrutar: erro grupo ATK: ' + (e.message || e), 'err'); } }
    if (r.groupDef) { try { defV = await getVillagesInGroup(r.groupDef); } catch (e) { pushLog('Recrutar: erro grupo DEF: ' + (e.message || e), 'err'); } }
    add(atkV, 'atk'); add(defV, 'def');
    if (r.groupAtk || r.groupDef) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} } // reseta grupo p/ "todos"
    Object.entries(r.overrides || {}).forEach(([vid, o]) => { map[vid] = { name: o.name || vid, targets: o.targets }; });
    return map;
  }
  async function getRecruitState(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=train', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const units = {}, rmap = {}; RUNITS.forEach(([u]) => rmap[u] = true);
    doc.querySelectorAll('tr').forEach((tr) => {
      let u = null;
      const inp = tr.querySelector('input[name]');
      if (inp && rmap[inp.getAttribute('name')]) u = inp.getAttribute('name');
      if (!u) { const img = tr.querySelector('img[src*="/unit_"]'); if (img) { const m = img.src.match(/unit_([a-z]+)\.png/); if (m && rmap[m[1]]) u = m[1]; } }
      if (!u || units[u]) return;
      const txt = (tr.textContent || '').replace(/\s+/g, ' ').trim();
      const cm = txt.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+):(\d{2}):(\d{2})/);
      if (!cm) return;
      const tot = txt.match(/(\d+)\s*\/\s*(\d+)/), mx = txt.match(/\((\d+)\)/);
      units[u] = { wood: +cm[1], stone: +cm[2], iron: +cm[3], pop: +cm[4], buildTime: (+cm[5]) * 3600 + (+cm[6]) * 60 + (+cm[7]), total: tot ? +tot[2] : 0, maxRec: mx ? +mx[1] : 0, reqMet: !!inp };
    });
    const tx = (s) => { const e = doc.querySelector(s); return e ? (parseInt((e.textContent || '').replace(/\D/g, ''), 10) || 0) : 0; };
    // ---- fila real de recrutamento (soma o tempo das ordens por edifício) ----
    const UKEYS = {}; UNITS.forEach(([u]) => UKEYS[u] = true);
    const queuedSec = { barracks: 0, stable: 0, garage: 0 };
    doc.querySelectorAll('.unit_sprite').forEach((sp) => {
      const row = sp.closest('tr, li'); if (!row) return;   // NÃO incluir 'div' (o próprio sprite é div)
      const rtxt = row.textContent || '';
      if (!/Cancel/i.test(rtxt)) return;              // só linhas da fila (têm "Cancelar")
      let uu = null; (sp.className || '').split(/\s+/).forEach((cl) => { if (UKEYS[cl]) uu = cl; });
      if (!uu || !BUILDING_OF[uu]) return;
      const tmt = rtxt.match(/(\d{1,2}):(\d{2}):(\d{2})/); // 1º tempo da linha = duração/restante da leva
      if (!tmt) return;
      queuedSec[BUILDING_OF[uu]] += (+tmt[1]) * 3600 + (+tmt[2]) * 60 + (+tmt[3]);
    });
    return { units, res: { wood: tx('#wood'), stone: tx('#stone'), iron: tx('#iron') }, popFree: Math.max(0, tx('#pop_max_label') - tx('#pop_current_label')), queuedSec: queuedSec };
  }
  function computeRecruit(state, targets, cfg, queuedSec) {
    const amounts = {}, addedSec = {}, res = Object.assign({}, state.res);
    let popFree = state.popFree, reason = 'alvo atingido';
    const wantCost = { wood: 0, stone: 0, iron: 0 };
    const groups = { barracks: [], stable: [], garage: [] };
    RUNITS.forEach(([u]) => {
      const t = targets[u]; if (t === undefined) return;
      const su = state.units[u]; if (!su || !su.reqMet) return;
      const capped = (t !== null);
      if (capped && su.total >= t) return;
      groups[BUILDING_OF[u]].push({ u, t, capped, su });
    });
    Object.keys(groups).forEach((b) => {
      const list = groups[b]; if (!list.length) return;
      const qs = queuedSec[b] || 0;
      if (qs >= cfg.refillBelowMin * 60) { if (reason === 'alvo atingido') reason = 'fila cheia'; return; }
      const needSec = cfg.targetHours * 3600 - qs; if (needSec <= 0) return;
      const w = list.map((x) => x.capped ? Math.max(1, x.t) : 0);
      const pos = w.filter((v) => v > 0); const avg = pos.length ? pos.reduce((a, v) => a + v, 0) / pos.length : 1;
      list.forEach((x, i) => { if (!x.capped) w[i] = avg; });
      const wsum = w.reduce((a, v) => a + v, 0) || 1;
      let added = 0;
      list.forEach((x, i) => {
        let nWant = Math.floor((needSec * w[i] / wsum) / x.su.buildTime);
        if (x.capped) nWant = Math.min(nWant, x.t - x.su.total);
        if (nWant > 0) { wantCost.wood += nWant * x.su.wood; wantCost.stone += nWant * x.su.stone; wantCost.iron += nWant * x.su.iron; }
        let n = Math.min(nWant, Math.floor(res.wood / x.su.wood), Math.floor(res.stone / x.su.stone), Math.floor(res.iron / x.su.iron));
        if (x.su.pop > 0) n = Math.min(n, Math.floor(popFree / x.su.pop));
        if (n > 0) { amounts[x.u] = (amounts[x.u] || 0) + n; res.wood -= n * x.su.wood; res.stone -= n * x.su.stone; res.iron -= n * x.su.iron; popFree -= n * x.su.pop; added += n * x.su.buildTime; reason = 'reposto'; }
      });
      if (added > 0) addedSec[b] = added; else if (reason !== 'reposto') reason = 'sem recurso/pop';
    });
    return { amounts, addedSec, reason, wantCost };
  }
  async function sendRecruit(vid, amounts) {
    const b = new URLSearchParams();
    Object.entries(amounts).forEach(([u, n]) => { if (n > 0) b.set('units[' + u + ']', String(n)); });
    b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + vid + '&screen=train&ajaxaction=train&mode=train&h=' + CSRF, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'TribalWars-Ajax': '1', 'X-Requested-With': 'XMLHttpRequest' }, body: b.toString() });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (j && j.error) throw new Error(Array.isArray(j.error) ? j.error.join('; ') : String(j.error));
    return true;
  }
  async function recruitTick() {
    clearTimeout(recruitTimer);
    if (!config.recruit.running) return;
    if (lockOther()) { recruitTimer = setTimeout(recruitTick, 5000); return; }
    claimLock();
    const now = Date.now();
    if ((config.recruit.nextAt || 0) > now) { scheduleRecruit(); return; }
    let map;
    try { map = await resolveTargets(); }
    catch (e) { pushLog('Recrutar: erro ao resolver alvos: ' + (e.message || e), 'err'); config.recruit.nextAt = now + 120000; save(); scheduleRecruit(); return; }
    const vids = Object.keys(map);
    if (!vids.length) { pushLog('Recrutar: nenhum grupo mapeado com aldeias.'); config.recruit.nextAt = now + 300000; save(); scheduleRecruit(); return; }
    let totalSent = 0;
    for (const vid of vids) {
      const targets = map[vid].targets || {};
      if (!Object.keys(targets).length) continue;
      let state;
      try { state = await getRecruitState(vid); }
      catch (e) { pushLog('Recrutar ' + (map[vid].name || vid) + ': erro estado: ' + (e.message || e), 'err'); continue; }
      const queuedSec = state.queuedSec || { barracks: 0, stable: 0, garage: 0 };  // FILA REAL lida da tela
      const { amounts, reason, wantCost } = computeRecruit(state, targets, config.recruit, queuedSec);
      config.recruit.demand = config.recruit.demand || {};
      config.recruit.demand[vid] = wantCost || { wood: 0, stone: 0, iron: 0 };  // demanda de recrutar p/ Equilíbrio
      const fmtm = (s) => Math.floor(s / 3600) + 'h' + String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const qStr = 'fila Q' + fmtm(queuedSec.barracks) + ' E' + fmtm(queuedSec.stable) + ' O' + fmtm(queuedSec.garage);
      const nm = map[vid].name || vid;
      if (Object.keys(amounts).length) {
        try {
          await sendRecruit(vid, amounts);
          pushLog('Recrutado · ' + nm + ' [' + Object.entries(amounts).map(([u, n]) => u + '=' + n).join(', ') + '] · ' + qStr, 'ok');
          totalSent++;
        } catch (e) { pushLog('Recrutar ' + nm + ': ' + (e.message || e), 'err'); }
      } else {
        pushLog('  ' + nm + ' · ' + qStr + ' → ' + reason);
      }
      await sleep(300);
    }
    config.recruit.nextAt = now + Math.max(60, config.recruit.interval || 600) * 1000;
    save();
    pushLog('Recrutar: ciclo ok · ' + totalSent + ' aldeia(s). Próximo em ' + Math.round((config.recruit.interval || 600) / 60) + ' min.', 'ok');
    scheduleRecruit();
  }
  function scheduleRecruit() { clearTimeout(recruitTimer); if (!config.recruit.running) return; recruitTimer = setTimeout(recruitTick, Math.min(Math.max((config.recruit.nextAt || 0) - Date.now(), 1000), 60000)); }
  function recruitProfileHTML(prof, label) {
    const t = (config.recruit.profiles[prof] || {}).targets || {};
    const rows = RUNITS.map(([u, n]) =>
      '<div style="display:flex;align-items:center;gap:5px;margin:1px 0">' +
      '<input type="checkbox" class="twmgr-ron" data-prof="' + prof + '" data-unit="' + u + '"' + (t[u] !== undefined ? ' checked' : '') + '>' +
      unitIcon(u, n) + '<span style="flex:1;font-size:10px">' + n + '</span>' +
      '<input class="twmgr-rt" data-prof="' + prof + '" data-unit="' + u + '" type="number" min="0" placeholder="∞" value="' + (t[u] != null ? t[u] : '') + '" style="width:60px" title="alvo (vazio = contínuo)">' +
      '</div>').join('');
    return '<div style="font-size:11px;color:#e8d29a;margin:6px 0 2px">' + label + '</div>' + rows;
  }
  async function fillGroupSelects() {
    let groups = [];
    try { groups = await getGroups(); } catch (e) { pushLog('Recrutar: erro ao listar grupos: ' + (e.message || e), 'err'); return; }
    [['twmgr-r-gatk', config.recruit.groupAtk], ['twmgr-r-gdef', config.recruit.groupDef]].forEach(([id, cur]) => {
      const sel = document.getElementById(id); if (!sel) return;
      sel.innerHTML = '<option value="">— nenhum —</option>' + groups.map((g) => '<option value="' + g.id + '"' + (String(cur) === String(g.id) ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('');
    });
  }
  function readRecruitCfg() {
    const r = config.recruit;
    ['atk', 'def'].forEach((prof) => {
      const tg = {};
      document.querySelectorAll('.twmgr-ron[data-prof="' + prof + '"]').forEach((cb) => {
        const u = cb.getAttribute('data-unit');
        const inp = document.querySelector('.twmgr-rt[data-prof="' + prof + '"][data-unit="' + u + '"]');
        const hasNum = inp && inp.value.trim() !== '';
        if (!cb.checked && !hasNum) { return; }
        const v = hasNum ? parseInt(inp.value, 10) : null;
        tg[u] = (v != null && !Number.isNaN(v)) ? v : null;
        if (hasNum) { cb.checked = true; }
      });
      r.profiles[prof].targets = tg;
    });
    const g1 = document.getElementById('twmgr-r-gatk'); if (g1) r.groupAtk = g1.value || null;
    const g2 = document.getElementById('twmgr-r-gdef'); if (g2) r.groupDef = g2.value || null;
    const h = document.getElementById('twmgr-r-hours'); if (h) r.targetHours = Math.max(0.5, parseFloat((h.value || '').replace(',', '.')) || 2);
    const rf = document.getElementById('twmgr-r-refill'); if (rf) r.refillBelowMin = Math.max(1, parseInt(rf.value, 10) || 30);
    save();
  }
  function setRecruitStatus(on) { setBtnState('twmgr-r-start', 'twmgr-r-stop', on, '● Recrutando', '▶ Recrutar'); }
  function recruitStart() { readRecruitCfg(); if (!config.recruit.groupAtk && !config.recruit.groupDef) { pushLog('Recrutar: mapeie ao menos 1 grupo (ATK ou DEF).', 'err'); return; } config.recruit.running = true; config.recruit.nextAt = 0; save(); setRecruitStatus(true); pushLog('Recrutar iniciado.', 'ok'); recruitTick(); }
  function recruitStop() { readRecruitCfg(); config.recruit.running = false; save(); clearTimeout(recruitTimer); setRecruitStatus(false); pushLog('Recrutar parado.'); }
  async function runRecruitDiag() {
    pushLog('Diag Recrutar: lendo grupos e tela train…');
    try {
      const groups = await getGroups();
      pushLog('Grupos: ' + groups.map((g) => g.name + '#' + g.id).join(' · '));
      if (config.recruit.groupAtk) { const v = await getVillagesInGroup(config.recruit.groupAtk); pushLog('ATK(' + config.recruit.groupAtk + '): ' + v.length + ' aldeias'); }
      if (config.recruit.groupDef) { const v = await getVillagesInGroup(config.recruit.groupDef); pushLog('DEF(' + config.recruit.groupDef + '): ' + v.length + ' aldeias'); }
      if (config.recruit.groupAtk || config.recruit.groupDef) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
      const st = await getRecruitState(CUR_VID);
      RUNITS.forEach(([u, n]) => { const s = st.units[u]; if (s) pushLog(n + ': tot ' + s.total + ' · max ' + s.maxRec + ' · ' + s.wood + '/' + s.stone + '/' + s.iron + ' · ' + Math.round(s.buildTime) + 's · req ' + s.reqMet); });
      pushLog('Recursos ' + st.res.wood + '/' + st.res.stone + '/' + st.res.iron + ' · pop livre ' + st.popFree, 'ok');
      showTab('log');
    } catch (e) { pushLog('Diag Recrutar falhou: ' + (e.message || e), 'err'); }
  }

  // ==================== FAKES (multi-alvo, multi-origem, fake eficiente) ====================
  async function fakePrepare(vid, x, y, amounts) {
    const p1 = new URLSearchParams();
    Object.entries(amounts).forEach(([u, a]) => p1.set(u, String(a)));
    p1.set('x', String(x)); p1.set('y', String(y)); p1.set('input', x + '|' + y);
    p1.set('attack', 'l'); p1.set('h', CSRF);
    const r1 = await fetch('/game.php?village=' + vid + '&screen=place&try=confirm', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p1.toString() });
    let t1 = await r1.text();
    try { const j = JSON.parse(t1); t1 = (j.response && j.response.dialog) || j.dialog || t1; } catch (e) {}
    const doc = new DOMParser().parseFromString(t1, 'text/html');
    const form = doc.querySelector('#command-data-form') || doc.querySelector('form[action*="action=command"]');
    if (!form) { const errEl = doc.querySelector('.error, .autoHideBox, #command_confirmation_error'); throw new Error(errEl ? errEl.textContent.trim().slice(0, 80) : 'confirmação falhou (tropa/alvo)'); }
    let dur = null;
    const dd = doc.querySelector('[data-duration]');
    if (dd) dur = parseInt(dd.getAttribute('data-duration'), 10);
    if (!dur) { const txt = doc.body ? doc.body.textContent : t1; const m = txt.match(/dura[çc][aã]o[^0-9]{0,12}(\d{1,2}):([0-5]\d):([0-5]\d)/i); if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); }
    const params = {};
    form.querySelectorAll('input, select').forEach((el) => { if (el.name) params[el.name] = el.value; });
    if (!params.h) params.h = CSRF;
    const action = form.getAttribute('action') || ('/game.php?village=' + vid + '&screen=place&action=command&h=' + CSRF);
    return { action: absUrl(action), params: params, dur: dur };
  }
  async function fakeFire(prep) {
    const r2 = await fetch(prep.action, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(prep.params).toString() });
    const t2 = await r2.text();
    if (/n[aã]o tem tropas suficientes|not enough/i.test(t2)) throw new Error('recusado: tropas insuficientes');
    return true;
  }
  const FAKE_POP = { spear: 1, sword: 1, axe: 1, archer: 1, spy: 2, light: 4, marcher: 5, heavy: 6, ram: 5, catapult: 8, knight: 10, snob: 100 };
  function parseCoords(raw) {
    const out = [], seen = {};
    (raw || '').split(/[\s,;]+/).forEach((tok) => { const m = tok.match(/^(\d{1,3})\|(\d{1,3})$/); if (m) { const c = m[1] + '|' + m[2]; if (!seen[c]) { seen[c] = 1; out.push({ x: m[1], y: m[2] }); } } });
    return out;
  }
  async function getFakeVillage(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=place', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const avail = {};
    UNITS.forEach(([u]) => { let n = 0; const alt = doc.querySelector('a.units-entry-all[data-unit="' + u + '"]'); if (alt) { const dc = alt.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (alt.textContent || '').replace(/\D/g, ''), 10); } avail[u] = isNaN(n) ? 0 : n; });
    const pm = doc.querySelector('#pop_max_label');
    const popMax = pm ? (parseInt((pm.textContent || '').replace(/\D/g, ''), 10) || 0) : 0;
    return { avail: avail, popMax: popMax };
  }
  function computeFakeComp(T, avail, siege, filler) {
    const amounts = {}; let pop = 0;
    if (siege && siege !== 'none' && (avail[siege] || 0) >= 1) { amounts[siege] = 1; pop += FAKE_POP[siege] || 1; }
    const fp = FAKE_POP[filler] || 1;
    const need = Math.max(0, T - pop);
    let q = Math.ceil(need / fp);
    let ok = true;
    if (q > 0) { if ((avail[filler] || 0) >= q) { amounts[filler] = (amounts[filler] || 0) + q; pop += q * fp; } else { ok = false; const have = avail[filler] || 0; if (have > 0) { amounts[filler] = (amounts[filler] || 0) + have; pop += have * fp; } } }
    return { amounts: amounts, pop: pop, ok: ok && pop >= T && Object.keys(amounts).length > 0 };
  }
  let _pointsCache = null;
  async function getVillagePoints() {
    if (_pointsCache) return _pointsCache;
    const res = await fetch('/map/village.txt', { credentials: 'include' });
    const txt = await res.text();
    const map = {};
    txt.split('\n').forEach((line) => { const f = line.split(','); if (f.length >= 6) { const id = f[0], pts = parseInt(f[5], 10); if (id && !isNaN(pts)) map[id] = pts; } });
    _pointsCache = map;
    return map;
  }
  function fakeCapacity(T, availIn, siege, filler) {
    const avail = Object.assign({}, availIn);
    let total = 0, withSiege = 0;
    while (total < 5000) {
      const c = computeFakeComp(T, avail, siege, filler);
      if (!c.ok) break;
      if (c.amounts[siege]) withSiege++;
      Object.entries(c.amounts).forEach(([u, n]) => { avail[u] = Math.max(0, (avail[u] || 0) - n); });
      total++;
    }
    return { total: total, withSiege: withSiege };
  }
  async function fakeGenerate(preview) {
    readFakesCfg();
    const cfg = config.fakes;
    const targets = parseCoords(cfg.targetsRaw);
    const origins = Object.keys(cfg.origins).filter((v) => cfg.origins[v]);
    if (!targets.length) { pushLog('Fakes: nenhum alvo válido colado.', 'err'); return null; }
    if (!origins.length) { pushLog('Fakes: selecione ao menos 1 origem.', 'err'); return null; }
    if (!cfg.arrLocal) { pushLog('Fakes: defina o horário de chegada.', 'err'); return null; }
    const arriveAt = arrivalToServerMs(cfg.arrLocal);
    let points = {}; try { points = await getVillagePoints(); } catch (e) { pushLog('Fakes: não li os pontos (village.txt), usando fazenda como base.', 'err'); }
    const pairs = [];
    if (cfg.mode === 'all') { origins.forEach((o) => targets.forEach((t) => pairs.push({ origin: o, x: t.x, y: t.y }))); }
    else { targets.forEach((t, i) => { pairs.push({ origin: origins[i % origins.length], x: t.x, y: t.y }); }); }
    const byO = {}; pairs.forEach((p) => { (byO[p.origin] = byO[p.origin] || []).push(p); });
    const gen = [];
    for (const o of Object.keys(byO)) {
      let st; try { st = await getFakeVillage(o); } catch (e) { pushLog('Fake: erro lendo aldeia ' + o + ': ' + (e.message || e), 'err'); continue; }
      const base = points[o] || st.popMax;
      const T = cfg.minPop > 0 ? cfg.minPop : Math.max(1, Math.ceil((cfg.pct / 100) * base));
      const cap = fakeCapacity(T, st.avail, cfg.siege, cfg.filler);
      const avail = Object.assign({}, st.avail);
      let made = 0, failed = 0, comp0 = null;
      for (const p of byO[o]) {
        const c = computeFakeComp(T, avail, cfg.siege, cfg.filler);
        if (!c.ok) { failed++; continue; }
        Object.entries(c.amounts).forEach(([u, n]) => { avail[u] = Math.max(0, (avail[u] || 0) - n); });
        if (!comp0) comp0 = c;
        made++;
        gen.push({ id: genId(), origin: o, x: p.x, y: p.y, amounts: c.amounts, arriveAt: arriveAt, durSec: null, sendAt: 0, state: 'armed', error: null });
      }
      const cdesc = comp0 ? Object.entries(comp0.amounts).map(([u, n]) => u + '=' + n).join('+') + ' (pop ' + comp0.pop + ')' : '—';
      pushLog('  ' + o + ': feito ' + made + (failed ? (' · ' + failed + ' sem tropa') : '') + ' · TETO ' + cap.total + ' fakes (' + cap.withSiege + ' c/isca) · ' + cdesc + ' · min pop ' + T + (points[o] ? (' = 1% de ' + points[o] + ' pts') : ''));
    }
    pushLog('Fakes ' + (preview ? 'PREVIEW' : 'gerados') + ': ' + gen.length + ' total (chega ' + (cfg.arrLocal || '').replace('T', ' ') + ')', 'ok');
    return gen;
  }
  function scheduleFakeFire(f) {
    const lead = 12000;
    const delayPrep = Math.max(0, (f.sendAt - lead) - serverNow());
    setTimeout(async () => {
      if (!config.fakes.running || f.state !== 'scheduled' || lockOther()) return;
      let prep;
      try { prep = await fakePrepare(f.origin, f.x, f.y, f.amounts); }
      catch (e) { f.state = 'error'; f.error = (e.message || e); save(); pushLog('Fake ' + f.x + '|' + f.y + ' prep falhou: ' + f.error, 'err'); return; }
      const fireDelay = Math.max(0, (f.sendAt - config.fakes.offsetMs) - serverNow());
      setTimeout(async () => {
        if (!config.fakes.running || f.state !== 'scheduled' || lockOther()) return;
        try { await fakeFire(prep); f.state = 'sent'; f.sentAt = serverNow(); pushLog('🎭 Fake ENVIADO → ' + f.x + '|' + f.y + ' (de ' + f.origin + ')', 'ok'); }
        catch (e) { f.state = 'error'; f.error = (e.message || e); pushLog('Fake ' + f.x + '|' + f.y + ' envio falhou: ' + f.error, 'err'); }
        save();
      }, fireDelay);
    }, delayPrep);
  }
  async function fakeTick() {
    clearTimeout(fakeTimer);
    if (!config.fakes.running) return;
    if (lockOther()) { fakeTimer = setTimeout(fakeTick, 5000); return; }
    claimLock();
    const nowS = serverNow();
    for (const f of config.fakes.gen) {
      if (f.state === 'sent' || f.state === 'error' || f.state === 'scheduled') continue;
      if (!f.arriveAt) { f.state = 'error'; f.error = 'sem horário'; continue; }
      if (f.durSec == null) {
        try { const p = await fakePrepare(f.origin, f.x, f.y, f.amounts); f.durSec = p.dur; }
        catch (e) { f.state = 'error'; f.error = (e.message || e); pushLog('Fake ' + f.x + '|' + f.y + ': ' + f.error, 'err'); continue; }
        if (!f.durSec) { f.state = 'error'; f.error = 'sem duração'; continue; }
      }
      f.sendAt = f.arriveAt - f.durSec * 1000;
      if (f.sendAt - nowS < -2000) { f.state = 'error'; f.error = 'envio no passado'; continue; }
      f.state = 'scheduled'; scheduleFakeFire(f);
    }
    save();
    fakeTimer = setTimeout(fakeTick, 30000);
  }
  async function renderFakeOrigins() {
    const cont = document.getElementById('twmgr-fk-origins'); if (!cont) return;
    let vils = []; try { vils = await getAllVillages(); } catch (e) { vils = [{ vid: CUR_VID, name: CUR_NAME }]; }
    const sel = config.fakes.origins || {};
    cont.innerHTML = vils.map((v) => '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#d3c299;margin:1px 0"><input type="checkbox" class="twmgr-fk-origin" data-vid="' + v.vid + '"' + (sel[v.vid] ? ' checked' : '') + '>' + esc(v.name) + '</label>').join('');
    cont.querySelectorAll('.twmgr-fk-origin').forEach((cb) => cb.addEventListener('change', readFakesCfg));
  }
  function readFakesCfg() {
    const c = config.fakes, g = (id) => document.getElementById(id);
    if (g('twmgr-fk-targets')) c.targetsRaw = g('twmgr-fk-targets').value;
    if (g('twmgr-fk-arr')) c.arrLocal = g('twmgr-fk-arr').value;
    if (g('twmgr-fk-offset')) c.offsetMs = Math.max(0, parseInt(g('twmgr-fk-offset').value, 10) || 150);
    if (g('twmgr-fk-pct')) c.pct = Math.max(0, parseFloat((g('twmgr-fk-pct').value || '').replace(',', '.')) || 1);
    if (g('twmgr-fk-minpop')) c.minPop = Math.max(0, parseInt(g('twmgr-fk-minpop').value, 10) || 0);
    if (g('twmgr-fk-siege')) c.siege = g('twmgr-fk-siege').value;
    if (g('twmgr-fk-filler')) c.filler = g('twmgr-fk-filler').value;
    const mode = document.querySelector('input[name="twmgr-fk-mode"]:checked'); if (mode) c.mode = mode.value;
    const origins = {}; document.querySelectorAll('.twmgr-fk-origin').forEach((cb) => { if (cb.checked) origins[cb.getAttribute('data-vid')] = true; }); c.origins = origins;
    save();
  }
  async function fakePreview() { await fakeGenerate(true); showTab('log'); }
  function setFakeStatus(on) { setBtnState('twmgr-fk-start', 'twmgr-fk-stop', on, '● Armado', '▶ Armar'); }
  async function fakeStart() {
    const gen = await fakeGenerate(false);
    if (!gen || !gen.length) return;
    config.fakes.gen = gen; config.fakes.running = true; save();
    setFakeStatus(true); pushLog('Fakes armados · ' + gen.length, 'ok'); fakeTick();
  }
  function fakeStop() { readFakesCfg(); config.fakes.running = false; save(); clearTimeout(fakeTimer); setFakeStatus(false); pushLog('Fakes desarmados.'); }

  // ==================== MERCADO (Cunhagem) ====================
  async function getMarketState(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=market&mode=send', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const numOf = (id) => { const el = doc.getElementById(id); return el ? (parseInt((el.textContent || '').replace(/\D/g, ''), 10) || 0) : 0; };
    return { wood: numOf('wood'), stone: numOf('stone'), iron: numOf('iron'), storage: numOf('storage'), capacity: numOf('market_merchant_max_transport') };
  }
  function balancedSplit(totalCapacity, avail, reserve) {
    const keys = ['wood', 'stone', 'iron'];
    const cap = {}; keys.forEach((k) => { cap[k] = Math.max(0, (avail[k] || 0) - reserve); });
    const alloc = { wood: 0, stone: 0, iron: 0 };
    let remaining = totalCapacity;
    let active = keys.filter((k) => cap[k] > 0);
    while (remaining > 0 && active.length) {
      const share = Math.max(1, Math.floor(remaining / active.length));
      let progressed = false;
      active = active.filter((k) => {
        const give = Math.min(share, cap[k] - alloc[k], remaining);
        if (give > 0) { alloc[k] += give; remaining -= give; progressed = true; }
        return cap[k] - alloc[k] > 0 && remaining > 0;
      });
      if (!progressed) break;
    }
    return alloc;
  }
  async function sendMarketResources(vid, coord, amounts) {
    const [x, y] = coord.split('|').map((s) => s.trim());
    const p1 = new URLSearchParams();
    p1.set('wood', String(amounts.wood || 0)); p1.set('stone', String(amounts.stone || 0)); p1.set('iron', String(amounts.iron || 0));
    p1.set('x', x); p1.set('y', y); p1.set('input', x + '|' + y);
    p1.set('target_type', 'coord'); p1.set('h', CSRF);
    const r1 = await fetch('/game.php?village=' + vid + '&screen=market&mode=send&try=confirm_send', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p1.toString() });
    const t1 = await r1.text();
    const doc = new DOMParser().parseFromString(t1, 'text/html');
    const errBox = doc.querySelector('.error_box .content');
    if (errBox) throw new Error(errBox.textContent.trim().replace(/\s+/g, ' '));
    const form = doc.querySelector('form');
    if (!form) throw new Error('confirmação não encontrada');
    let dur = null;
    const dd = doc.querySelector('[data-duration]'); if (dd) dur = parseInt(dd.getAttribute('data-duration'), 10);
    if (!dur) { const m = t1.match(/dura[çc][aã]o[^0-9]{0,12}(\d{1,2}):([0-5]\d):([0-5]\d)/i); if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); }
    const p2 = new URLSearchParams();
    form.querySelectorAll('input, select').forEach((el) => { if (el.name) p2.set(el.name, el.value); });
    if (!p2.has('h')) p2.set('h', CSRF);
    const action = form.getAttribute('action') || ('/game.php?village=' + vid + '&screen=market&mode=send&h=' + CSRF);
    const r2 = await fetch(absUrl(action), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p2.toString() });
    const t2 = await r2.text();
    if (/alvo v[aá]lido/i.test(t2)) throw new Error('alvo inválido (confira a coordenada)');
    return dur && dur > 0 ? dur : null;
  }
  async function marketTick() {
    clearTimeout(marketTimer);
    if (!config.market.running) return;
    if (lockOther()) { marketTimer = setTimeout(marketTick, 5000); return; }
    claimLock();
    const now = Date.now();
    if ((config.market.nextAt || 0) > now) { scheduleMarket(); return; }
    try {
      if (config.market.mode === 'equilibrio') await equilibrioPass();
      else await cunhagemPass();
    } catch (e) { pushLog('Mercado: erro no ciclo: ' + (e.message || e), 'err'); }
    config.market.nextAt = now + Math.max(60, config.market.interval || 600) * 1000;
    save();
    pushLog('Mercado: próximo ciclo em ' + Math.round((config.market.interval || 600) / 60) + ' min.', '');
    scheduleMarket();
  }
  function scheduleMarket() { clearTimeout(marketTimer); if (!config.market.running) return; marketTimer = setTimeout(marketTick, Math.min(Math.max((config.market.nextAt || 0) - Date.now(), 1000), 60000)); }

  async function cunhagemPass() {
    const coord = config.market.destCoord || '';
    const reserve = Math.max(0, config.market.reserve || 0);
    let vils = [];
    try { vils = await getAllVillages(); } catch (e) { pushLog('Cunhagem: erro ao listar aldeias: ' + (e.message || e), 'err'); return; }
    const sel = config.market.sources || {};
    let count = 0;
    for (const v of vils) {
      if (!sel[v.vid]) continue;
      if (v.coord && v.coord === coord) continue;   // pula destino pela coordenada
      let state;
      try { state = await getMarketState(v.vid); } catch (e) { pushLog('Cunhagem ' + v.name + ': erro mercado: ' + (e.message || e), 'err'); continue; }
      if (!state.capacity) continue;
      const amounts = balancedSplit(state.capacity, state, reserve);
      if ((amounts.wood + amounts.stone + amounts.iron) <= 0) continue;
      try {
        await sendMarketResources(v.vid, coord, amounts);
        count++;
        pushLog('Cunhagem · ' + v.name + ' → ' + coord + ' [' + amounts.wood + '/' + amounts.stone + '/' + amounts.iron + ']', 'ok');
        await sleep(400 + Math.floor(Math.random() * 400));
      } catch (e) { pushLog('Cunhagem ' + v.name + ': ' + (e.message || e), 'err'); }
    }
    pushLog('Cunhagem: ciclo ok · ' + count + ' envio(s).', 'ok');
  }

  function coordDist(a, b) { const pa = a.split('|').map(Number), pb = b.split('|').map(Number); return Math.sqrt((pa[0] - pb[0]) * (pa[0] - pb[0]) + (pa[1] - pb[1]) * (pa[1] - pb[1])); }
  async function equilibrioPass() {
    let vils = [];
    try { vils = await getAllVillages(); } catch (e) { pushLog('Equilíbrio: erro ao listar aldeias: ' + (e.message || e), 'err'); return; }
    vils = vils.filter((v) => v.coord);
    const pct = (config.market.thresholdPct != null ? config.market.thresholdPct : 50) / 100;
    const maxDist = config.market.maxDist != null ? config.market.maxDist : 15;
    const now = Date.now();
    // recursos em trânsito (que eu já mandei e ainda não chegaram)
    config.market.inflight = config.market.inflight || {};
    Object.keys(config.market.inflight).forEach((vid) => {
      config.market.inflight[vid] = (config.market.inflight[vid] || []).filter((e) => e.arriveAt > now);
      if (!config.market.inflight[vid].length) delete config.market.inflight[vid];
    });
    const inSum = (vid, r) => (config.market.inflight[vid] || []).reduce((s, e) => s + (e.r === r ? e.amt : 0), 0);
    const st = [];
    for (const v of vils) {
      let m; try { m = await getMarketState(v.vid); } catch (e) { continue; }
      if (!m.storage) continue;                 // sem armazém lido -> pula
      st.push({ vid: v.vid, coord: v.coord, name: v.name, cur: { wood: m.wood, stone: m.stone, iron: m.iron }, cap: m.capacity, thr: m.storage * pct });
      await sleep(120);
    }
    let sent = 0;
    for (const r of ['wood', 'stone', 'iron']) {
      // carente = (atual + o que já vem chegando) abaixo do limiar
      const receivers = st.map((s) => ({ s: s, eff: s.cur[r] + inSum(s.vid, r) }))
        .filter((x) => x.eff < x.s.thr).map((x) => ({ s: x.s, def: x.s.thr - x.eff })).sort((a, b) => b.def - a.def);
      for (const rec of receivers) {
        if (rec.def <= 0) continue;
        const donors = st.filter((s) => s.vid !== rec.s.vid && s.cap > 0 && s.cur[r] > s.thr)
          .map((s) => ({ s: s, exc: s.cur[r] - s.thr, d: coordDist(s.coord, rec.s.coord) }))
          .filter((x) => x.d <= maxDist)
          .sort((a, b) => a.d - b.d);
        for (const don of donors) {
          if (rec.def <= 0) break;
          const amount = Math.floor(Math.min(don.exc, rec.def, don.s.cap));
          if (amount < 500) continue;            // ignora transferência trivial
          try {
            const pkg = { wood: 0, stone: 0, iron: 0 }; pkg[r] = amount;
            const dur = await sendMarketResources(don.s.vid, rec.s.coord, pkg);
            sent++;
            don.s.cur[r] -= amount; don.s.cap -= amount; rec.def -= amount; don.exc -= amount;
            config.market.inflight[rec.s.vid] = config.market.inflight[rec.s.vid] || [];
            config.market.inflight[rec.s.vid].push({ r: r, amt: amount, arriveAt: now + ((dur && dur > 0 ? dur : 3600) * 1000) });
            pushLog('Equilíbrio · ' + don.s.name + ' → ' + rec.s.coord + ' [' + r + ' ' + amount + ']', 'ok');
            await sleep(400 + Math.floor(Math.random() * 300));
          } catch (e) { pushLog('Equilíbrio ' + don.s.name + ': ' + (e.message || e), 'err'); }
        }
      }
    }
    save();
    pushLog('Equilíbrio: ciclo ok · ' + sent + ' transferência(s) (limiar ' + Math.round(pct * 100) + '%; desconta o que já vem chegando).', 'ok');
  }
  async function renderMarketSources() {
    const cont = document.getElementById('twmgr-mk-sources'); if (!cont) return;
    let vils = []; try { vils = await getAllVillages(); } catch (e) { vils = [{ vid: CUR_VID, name: CUR_NAME }]; }
    const sel = config.market.sources || {};
    cont.innerHTML = vils.map((v) => '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#d3c299;margin:1px 0"><input type="checkbox" class="twmgr-mk-src" data-vid="' + v.vid + '"' + (sel[v.vid] ? ' checked' : '') + '>' + esc(v.name) + '</label>').join('');
    cont.querySelectorAll('.twmgr-mk-src').forEach((cb) => cb.addEventListener('change', readMarketCfg));
  }
  function readMarketCfg() {
    const c = config.market, g = (id) => document.getElementById(id);
    const mode = document.querySelector('input[name="twmgr-mk-mode"]:checked'); if (mode) c.mode = mode.value;
    if (g('twmgr-mk-coord')) c.destCoord = g('twmgr-mk-coord').value.trim();
    if (g('twmgr-mk-reserve')) c.reserve = Math.max(0, parseInt(g('twmgr-mk-reserve').value, 10) || 0);
    if (g('twmgr-mk-int')) c.interval = Math.max(1, parseInt(g('twmgr-mk-int').value, 10) || 10) * 60;
    if (g('twmgr-mk-thr')) c.thresholdPct = Math.max(1, Math.min(99, parseInt(g('twmgr-mk-thr').value, 10) || 50));
    if (g('twmgr-mk-dist')) c.maxDist = Math.max(1, parseFloat((g('twmgr-mk-dist').value || '').replace(',', '.')) || 15);
    const src = {}; document.querySelectorAll('.twmgr-mk-src').forEach((cb) => { if (cb.checked) src[cb.getAttribute('data-vid')] = true; }); c.sources = src;
    save();
  }
  function setMarketStatus(on) { setBtnState('twmgr-mk-start', 'twmgr-mk-stop', on, '● Enviando', '▶ Enviar'); }
  function marketStart() {
    readMarketCfg();
    if (config.market.mode === 'cunhagem') {
      if (!/^\d+\s*\|\s*\d+$/.test(config.market.destCoord || '')) { pushLog('Cunhagem: coordenada de destino inválida (464|604).', 'err'); return; }
      if (!Object.values(config.market.sources).some(Boolean)) { pushLog('Cunhagem: selecione ao menos 1 aldeia de origem.', 'err'); return; }
    }
    config.market.running = true; config.market.nextAt = 0; save();
    setMarketStatus(true);
    pushLog(config.market.mode === 'equilibrio'
      ? 'Equilíbrio iniciado · limiar ' + config.market.thresholdPct + '% do armazém · dist ≤' + config.market.maxDist
      : 'Cunhagem iniciada · destino ' + config.market.destCoord + ' · deixa ' + config.market.reserve + '/rec', 'ok');
    marketTick();
  }
  function marketStop() { readMarketCfg(); config.market.running = false; save(); clearTimeout(marketTimer); setMarketStatus(false); pushLog('Cunhagem parada.'); }

  // ==================== EDIFÍCIOS (fila planejada por template ATK/DEF) ====================
  function parseTpl(text) {
    const out = [];
    (text || '').split('\n').forEach((line) => {
      const m = line.trim().match(/^([a-z_]+)\s+(\d+)$/i);
      if (m && BUILD_KEYS.indexOf(m[1].toLowerCase()) >= 0) out.push({ b: m[1].toLowerCase(), lvl: +m[2] });
    });
    return out;
  }
  async function getGroupProfileMap() {
    const r = config.recruit, map = {};
    let atkV = [], defV = [];
    if (r.groupAtk) { try { atkV = await getVillagesInGroup(r.groupAtk); } catch (e) {} }
    if (r.groupDef) { try { defV = await getVillagesInGroup(r.groupDef); } catch (e) {} }
    atkV.forEach((v) => { if (!map[v.vid]) map[v.vid] = { profile: 'atk', coord: v.coord }; });
    defV.forEach((v) => { if (!map[v.vid]) map[v.vid] = { profile: 'def', coord: v.coord }; });
    if (r.groupAtk || r.groupDef) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
    return map;
  }
  async function getBuildState(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=main', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const level = {}, cost = {}, buildable = {}, hasBtn = {};
    doc.querySelectorAll('[id^="main_buildrow_"]').forEach((tr) => {
      const b = tr.id.replace('main_buildrow_', '');
      const lm = (tr.textContent || '').match(/N[ií]vel\s*(\d+)/i); level[b] = lm ? +lm[1] : 0;
      const gc = (sel) => { const e = tr.querySelector(sel); return e ? (parseInt(e.getAttribute('data-cost'), 10) || 0) : 0; };
      cost[b] = { wood: gc('.cost_wood'), stone: gc('.cost_stone'), iron: gc('.cost_iron') };
      const btn = tr.querySelector('a[href*="action=upgrade_building"], a.btn-bcr');
      hasBtn[b] = !!(btn && btn.getAttribute('href'));
      buildable[b] = !!(btn && btn.getAttribute('href') && !/disabled/.test(btn.className || ''));
    });
    const queueLen = doc.querySelectorAll('#buildqueue tr.sortable_row, #buildqueue tr.lit').length;
    return { level: level, cost: cost, buildable: buildable, hasBtn: hasBtn, queueLen: queueLen };
  }
  function computeBuild(state, tpl) {
    // ordem estrita: para no 1º item não atingido que dá pra upar; se não tem recurso, ESPERA (vira demanda)
    for (const it of tpl) {
      if ((state.level[it.b] || 0) >= it.lvl) continue;
      if (!state.hasBtn[it.b]) continue;                                  // maxado / sem pré-requisito -> pula
      if (state.buildable[it.b]) return { build: { b: it.b, cost: state.cost[it.b] }, demand: null };
      return { build: null, demand: { b: it.b, cost: state.cost[it.b] } }; // prioritário sem recurso -> espera + demanda
    }
    return { build: null, demand: null };
  }
  async function enqueueBuild(vid, b) {
    const res = await fetch('/game.php?village=' + vid + '&screen=main&action=upgrade_building&id=' + b + '&type=main&h=' + CSRF, { credentials: 'include' });
    await res.text();
    return true;
  }
  async function buildTick() {
    clearTimeout(buildTimer);
    if (!config.build.running) return;
    if (lockOther()) { buildTimer = setTimeout(buildTick, 5000); return; }
    claimLock();
    const now = Date.now();
    if ((config.build.nextAt || 0) > now) { scheduleBuild(); return; }
    let pmap;
    try { pmap = await getGroupProfileMap(); }
    catch (e) { pushLog('Edifícios: erro ao ler grupos: ' + (e.message || e), 'err'); config.build.nextAt = now + 120000; save(); scheduleBuild(); return; }
    const vids = Object.keys(pmap);
    if (!vids.length) { pushLog('Edifícios: mapeie os grupos ATK/DEF na aba Recrutar.'); config.build.nextAt = now + 300000; save(); scheduleBuild(); return; }
    const atkTpl = parseTpl(config.build.atkTpl), defTpl = parseTpl(config.build.defTpl);
    config.build.demand = {};
    let built = 0;
    for (const vid of vids) {
      const prof = pmap[vid].profile;
      const tpl = prof === 'atk' ? atkTpl : defTpl;
      let st;
      try { st = await getBuildState(vid); }
      catch (e) { pushLog('Edifícios ' + (pmap[vid].coord || vid) + ': erro estado: ' + (e.message || e), 'err'); continue; }
      const r = computeBuild(st, tpl);
      if (r.demand) config.build.demand[vid] = { b: r.demand.b, cost: r.demand.cost, coord: pmap[vid].coord };
      if (r.build && st.queueLen < (config.build.maxQueue || 5)) {
        try {
          await enqueueBuild(vid, r.build.b);
          built++;
          pushLog('Obra · ' + (pmap[vid].coord || vid) + ' → ' + r.build.b + ' [' + r.build.cost.wood + '/' + r.build.cost.stone + '/' + r.build.cost.iron + '] · fila ' + (st.queueLen + 1), 'ok');
        } catch (e) { pushLog('Obra ' + (pmap[vid].coord || vid) + ': ' + (e.message || e), 'err'); }
      } else if (r.demand) {
        pushLog('  ' + (pmap[vid].coord || vid) + ' · aguarda ' + r.demand.b + ' [' + r.demand.cost.wood + '/' + r.demand.cost.stone + '/' + r.demand.cost.iron + '] (sem recurso)');
      }
      await sleep(300);
    }
    config.build.nextAt = now + Math.max(60, config.build.interval || 600) * 1000;
    save();
    pushLog('Edifícios: ciclo ok · ' + built + ' enfileirado(s). Próximo em ' + Math.round((config.build.interval || 600) / 60) + ' min.', 'ok');
    scheduleBuild();
  }
  function scheduleBuild() { clearTimeout(buildTimer); if (!config.build.running) return; buildTimer = setTimeout(buildTick, Math.min(Math.max((config.build.nextAt || 0) - Date.now(), 1000), 60000)); }
  function readBuildCfg() {
    const c = config.build, g = (id) => document.getElementById(id);
    if (g('twmgr-bld-atk')) c.atkTpl = g('twmgr-bld-atk').value;
    if (g('twmgr-bld-def')) c.defTpl = g('twmgr-bld-def').value;
    if (g('twmgr-bld-max')) c.maxQueue = Math.max(1, parseInt(g('twmgr-bld-max').value, 10) || 5);
    if (g('twmgr-bld-int')) c.interval = Math.max(1, parseInt(g('twmgr-bld-int').value, 10) || 10) * 60;
    save();
  }
  function setBuildStatus(on) { setBtnState('twmgr-bld-start', 'twmgr-bld-stop', on, '● Construindo', '▶ Construir'); }
  function buildStart() {
    readBuildCfg();
    if (!config.recruit.groupAtk && !config.recruit.groupDef) { pushLog('Edifícios: mapeie ATK/DEF na aba Recrutar primeiro.', 'err'); return; }
    config.build.running = true; config.build.nextAt = 0; save();
    setBuildStatus(true); pushLog('Edifícios iniciado (templates ATK/DEF).', 'ok'); buildTick();
  }
  function buildStop() { readBuildCfg(); config.build.running = false; save(); clearTimeout(buildTimer); setBuildStatus(false); pushLog('Edifícios parado.'); }

  function tickUI() {
    if (anyRunning() && !lockOther()) claimLock();
    const now = Date.now();
    document.querySelectorAll('.twmgr-card').forEach((card) => {
      const t = config.targets.find((x) => x.id === card.getAttribute('data-id'));
      const c = card.querySelector('.twmgr-cnt'); if (!t || !c) return;
      if (!config.running || !t.enabled) { c.textContent = ''; }
      else if (config.running && lockOther()) { c.textContent = '⏸ outra aba'; }
      else if ((t.nextSendAt || 0) > now) c.textContent = fmt(t.nextSendAt - now);
      else c.textContent = '•••';
    });
    const g = document.getElementById('twmgr-global'); if (g) { g.textContent = !config.running ? '' : (lockOther() ? '⏸ inativa (outra aba está enviando)' : '● rodando'); g.style.color = lockOther() ? '#ff7568' : '#8fe39a'; }
    const sc = document.getElementById('twmgr-scav-status'); if (sc) { if (!config.scav.running) { sc.textContent = ''; } else if (lockOther()) { sc.textContent = '⏸ outra aba está ativa'; sc.style.color = '#ff7568'; } else { sc.style.color = '#8fe39a'; sc.textContent = (config.scav.nextAt || 0) > now ? '● próx. verificação: ' + fmt(config.scav.nextAt - now) : '● verificando…'; } }
    const fs = document.getElementById('twmgr-farm-status'); if (fs) { if (!config.farm.running) { fs.textContent = ''; } else if (lockOther()) { fs.textContent = '⏸ outra aba está ativa'; fs.style.color = '#ff7568'; } else { fs.style.color = '#8fe39a'; fs.textContent = (config.farm.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.farm.nextAt - now) : '● saqueando…'; } }
    const rs = document.getElementById('twmgr-recruit-status'); if (rs) { if (!config.recruit.running) { rs.textContent = ''; } else if (lockOther()) { rs.textContent = '⏸ outra aba está ativa'; rs.style.color = '#ff7568'; } else { rs.style.color = '#8fe39a'; rs.textContent = (config.recruit.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.recruit.nextAt - now) : '● recrutando…'; } }
    const clk = document.getElementById('twmgr-srvclock'); if (clk) { try { clk.textContent = new Date(serverNow() - wallToServerOffset()).toLocaleTimeString(); } catch (e) {} }
    const fks = document.getElementById('twmgr-fk-status');
    if (fks) {
      if (!config.fakes.running) { fks.textContent = ''; }
      else if (lockOther()) { fks.textContent = '⏸ outra aba'; fks.style.color = '#ff7568'; }
      else {
        const gg = config.fakes.gen || [];
        const pend = gg.filter((f) => f.state === 'armed' || f.state === 'scheduled').length;
        const sent = gg.filter((f) => f.state === 'sent').length;
        const err = gg.filter((f) => f.state === 'error').length;
        const nx = gg.filter((f) => f.sendAt && (f.state === 'scheduled' || f.state === 'armed')).sort((a, b) => a.sendAt - b.sendAt)[0];
        fks.style.color = '#8fe39a';
        fks.textContent = '● ' + sent + ' env · ' + pend + ' pend' + (err ? (' · ' + err + ' erro') : '') + (nx ? (' · próx ' + fmt(nx.sendAt - serverNow())) : '');
      }
    }
    const mk = document.getElementById('twmgr-mk-status'); if (mk) {
      if (!config.market.running) { mk.textContent = ''; }
      else if (lockOther()) { mk.textContent = '⏸ outra aba'; mk.style.color = '#ff7568'; }
      else { mk.style.color = '#8fe39a'; mk.textContent = (config.market.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.market.nextAt - now) : '● enviando…'; }
    }
    const bl = document.getElementById('twmgr-bld-status'); if (bl) {
      if (!config.build.running) { bl.textContent = ''; }
      else if (lockOther()) { bl.textContent = '⏸ outra aba'; bl.style.color = '#ff7568'; }
      else { bl.style.color = '#8fe39a'; bl.textContent = (config.build.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.build.nextAt - now) : '● construindo…'; }
    }
    const ring = (id, on) => { const b = document.getElementById(id); if (b) b.classList.toggle('twmgr-run', !!on && !lockOther()); };
    ring('twmgr-btab-alvos', config.running);
    ring('twmgr-btab-scav', config.scav.running);
    ring('twmgr-btab-farm', config.farm.running);
    ring('twmgr-btab-recruit', config.recruit.running);
    ring('twmgr-btab-fakes', config.fakes.running);
    ring('twmgr-btab-market', config.market.running);
    ring('twmgr-btab-build', config.build.running);
    const dot = document.getElementById('twmgr-dot'); if (dot) dot.classList.toggle('on', anyRunning() && !lockOther());
  }

  function readTargets() {
    const old = {}; config.targets.forEach((t) => { old[t.id] = t; });
    const arr = [];
    document.querySelectorAll('.twmgr-card').forEach((card) => {
      const id = card.getAttribute('data-id');
      const m = card.querySelector('.twmgr-xy').value.trim().match(/(\d+)\s*[|.\-\s]\s*(\d+)/);
      const units = {};
      card.querySelectorAll('.twmgr-q').forEach((q) => { const u = q.getAttribute('data-unit'); units[u] = units[u] || {}; units[u].qty = parseInt(q.value, 10) || 0; });
      card.querySelectorAll('.twmgr-m').forEach((mx) => { const u = mx.getAttribute('data-unit'); units[u] = units[u] || {}; units[u].max = mx.checked; });
      const o = old[id] || {};
      arr.push({ id, x: m ? m[1] : '', y: m ? m[2] : '', enabled: card.querySelector('.twmgr-en').checked, units, nextSendAt: o.nextSendAt || 0, phase: o.phase, lastSentAt: o.lastSentAt, origin: o.origin || CUR_VID, originName: o.originName || CUR_NAME });
    });
    config.targets = arr; save();
  }
  function cardHTML(t) {
    let trs = '';
    for (let i = 0; i < UNITS.length; i += 2) {
      trs += '<tr>' + [UNITS[i], UNITS[i + 1]].map((pair) => {
        if (!pair) return '<td></td><td></td><td></td>';
        const [u, n] = pair; const c = t.units[u] || {};
        return '<td title="' + n + '">' + unitIcon(u, n) + '</td>' + '<td><input class="twmgr-q twmgr-inp twmgr-qi" data-unit="' + u + '" type="number" min="0" value="' + (c.qty || 0) + '"></td>' + '<td style="text-align:center"><input class="twmgr-m" data-unit="' + u + '" type="checkbox"' + (c.max ? ' checked' : '') + '></td>';
      }).join('') + '</tr>';
    }
    return '<div class="twmgr-card" data-id="' + t.id + '"><div class="twmgr-card-head"><input class="twmgr-en" type="checkbox"' + (t.enabled ? ' checked' : '') + ' title="ativar este alvo"><input class="twmgr-xy twmgr-inp" placeholder="500|500" value="' + (t.x && t.y ? t.x + '|' + t.y : '') + '"><span class="twmgr-cnt"></span><span class="twmgr-exp" title="tropas">▾</span><span class="twmgr-del" title="remover">✕</span></div><div class="twmgr-from">de: ' + (t.originName || CUR_NAME) + '</div><div class="twmgr-troops"><table>' + trs + '</table></div></div>';
  }
  function renderTargets() {
    const cont = document.getElementById('twmgr-targets'); if (!cont) return;
    if (!config.targets.length) config.targets.push({ id: genId(), x: '', y: '', enabled: true, units: {}, nextSendAt: 0, origin: CUR_VID, originName: CUR_NAME });
    cont.innerHTML = config.targets.map(cardHTML).join('');
    cont.querySelectorAll('.twmgr-card').forEach((card) => {
      card.querySelector('.twmgr-exp').addEventListener('click', () => { const tr = card.querySelector('.twmgr-troops'); tr.style.display = tr.style.display === 'none' ? 'block' : 'none'; });
      card.querySelector('.twmgr-del').addEventListener('click', () => { readTargets(); config.targets = config.targets.filter((t) => t.id !== card.getAttribute('data-id')); save(); renderTargets(); });
    });
  }

  function start() {
    readTargets();
    const valid = config.targets.filter((t) => t.enabled && hasUnits(t) && t.x && t.y);
    if (!valid.length) { pushLog('Nenhum alvo válido (defina coord + tropas e ative).', 'err'); return; }
    config.targets.forEach((t) => { t.nextSendAt = 0; });
    config.running = true; save();
    setStatus(true); pushLog('Iniciado · ' + valid.length + ' alvo(s) · origem ' + CUR_NAME, 'ok'); processDue();
  }
  function stop() { readTargets(); config.running = false; save(); clearTimeout(sendTimer); setStatus(false); pushLog('Parado.'); }
  function setBtnState(startId, stopId, on, labelOn, labelOff) {
    const st = document.getElementById(startId), sp = document.getElementById(stopId);
    if (st) { st.textContent = on ? labelOn : labelOff; st.classList.toggle('on', on); }
    if (sp) sp.classList.toggle('dim', !on);
  }
  function setStatus(on) { setBtnState('twmgr-start', 'twmgr-stop', on, '● Ativo', '▶ Iniciar'); }
  function readScavUnits() { config.scav.units = config.scav.units || {}; SCAV_UNITS.forEach(([u]) => { const el = document.getElementById('twmgr-su-' + u); if (el) config.scav.units[u] = el.checked; }); save(); }
  function scavStart() { readScavUnits(); if (!SCAV_UNITS.some(([u]) => config.scav.units[u])) { pushLog('Coleta: marque ao menos 1 unidade.', 'err'); return; } config.scav.running = true; config.scav.nextAt = 0; save(); setScavStatus(true); pushLog('Coleta iniciada · todas as aldeias', 'ok'); scavTick(); }
  function scavStop() { readScavUnits(); config.scav.running = false; save(); clearTimeout(scavTimer); setScavStatus(false); pushLog('Coleta parada.'); }
  function setScavStatus(on) { setBtnState('twmgr-scav-start', 'twmgr-scav-stop', on, '● Coletando', '▶ Coletar'); }
  function readFarmCfg() {
    const pw = document.getElementById('twmgr-farm-wood'); if (pw) config.farm.minWood = parseInt(pw.value, 10) || 0;
    const ps = document.getElementById('twmgr-farm-stone'); if (ps) config.farm.minStone = parseInt(ps.value, 10) || 0;
    const pi = document.getElementById('twmgr-farm-iron'); if (pi) config.farm.minIron = parseInt(pi.value, 10) || 0;
    const it = document.getElementById('twmgr-farm-int'); if (it) config.farm.interval = Math.max(1, parseInt(it.value, 10) || 10) * 60;
    const dt = document.getElementById('twmgr-farm-dist'); if (dt) config.farm.maxDist = parseFloat((dt.value || '').replace(',', '.')) || 13;
    const wl = document.getElementById('twmgr-farm-wall'); if (wl) { config.farm.maxWall = parseInt(wl.value, 10); if (isNaN(config.farm.maxWall)) config.farm.maxWall = 20; }
    const dl = document.getElementById('twmgr-farm-delay'); if (dl) { config.farm.delay = parseInt(dl.value, 10); if (isNaN(config.farm.delay) || config.farm.delay < 0) config.farm.delay = 500; }
    const rm = document.getElementById('twmgr-farm-rammode'); if (rm) config.farm.ramMode = rm.value || 'off';
    const ax = document.getElementById('twmgr-farm-axe'); if (ax) config.farm.axeCount = Math.max(1, parseInt(ax.value, 10) || 80);
    const rw = document.getElementById('twmgr-farm-ramw6'); if (rw) config.farm.ramWall6 = Math.max(1, parseInt(rw.value, 10) || 24);
    const rf = document.getElementById('twmgr-farm-ramfix'); if (rf) config.farm.ramFixed = Math.max(0, parseInt(rf.value, 10) || 0);
    save();
  }
  function farmStart() { readFarmCfg(); config.farm.running = true; config.farm.nextAt = 0; save(); setFarmStatus(true); pushLog('Saque iniciado · C · mín ' + config.farm.minWood + '/' + config.farm.minStone + '/' + config.farm.minIron + ' · ≤' + config.farm.maxDist + ' campos · muralha ≤' + config.farm.maxWall + ' · delay ' + config.farm.delay + 'ms', 'ok'); farmTick(); }
  function farmStop() { readFarmCfg(); config.farm.running = false; save(); clearTimeout(farmTimer); setFarmStatus(false); pushLog('Saque parado.'); }
  function setFarmStatus(on) { setBtnState('twmgr-farm-start', 'twmgr-farm-stop', on, '● Saqueando', '▶ Saquear'); }
  async function runDiagnostics() {
    pushLog('Diagnóstico: lendo estado da aldeia…');
    try {
      const st = await getVillageState();
      const av = UNITS.filter(([u]) => st.avail[u] > 0).map(([u, n]) => n + ':' + st.avail[u]).join('  ') || '(nenhuma disponível)';
      pushLog('Tropas → ' + av);
      if (!st.commands.length) pushLog('Comandos → nenhum movimento detectado.');
      else st.commands.forEach((c) => pushLog('cmd · ' + c.kind + ' · ' + (c.coord || '?') + ' · volta em ' + (c.endMs ? fmt(c.endMs - Date.now()) : '?')));
      showTab('log');
    } catch (e) { pushLog('Diagnóstico falhou: ' + (e.message || e), 'err'); }
  }

  function injectStyles() {
    if (document.getElementById('twmgr-css')) return;
    const s = document.createElement('style'); s.id = 'twmgr-css';
    s.textContent = [
      "#twmgr-panel{position:fixed;top:60px;right:12px;z-index:99999;width:300px;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#e9dcc2;background:linear-gradient(160deg,#2a2016,#201810);border:1px solid #b8912e;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.6);overflow:hidden}",
      "#twmgr-panel *{box-sizing:border-box}",
      "#twmgr-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;cursor:move;background:linear-gradient(90deg,#6e5015,#9a721c 55%,#caa031);color:#fff;border-bottom:1px solid #8a6a20}",
      "#twmgr-head .twmgr-title{font-weight:700;font-size:12px;letter-spacing:.3px;display:flex;align-items:center;gap:6px}",
      "#twmgr-head .twmgr-ver{font-weight:400;font-size:8px;opacity:.75}",
      "#twmgr-min{cursor:pointer;font-size:17px;line-height:1;padding:0 4px;opacity:.85}#twmgr-min:hover{opacity:1}",
      "#twmgr-upd-btn{cursor:pointer;font-size:13px;line-height:1;padding:0 4px;opacity:.85;position:relative}#twmgr-upd-btn:hover{opacity:1}",
      "#twmgr-upd-badge{position:absolute;top:-3px;right:-2px;color:#ff5a5a;font-size:9px}",
      ".twmgr-tabs{display:flex;flex-wrap:wrap;background:#1a140d;border-bottom:1px solid #3a2e1b}",
      ".twmgr-tab{flex:1;min-width:44px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 2px;cursor:pointer;color:#a2926c;border-bottom:2px solid transparent;transition:.15s}",
      ".twmgr-tab:hover{color:#e8d29a;background:rgba(212,175,55,.06)}",
      ".twmgr-tab.active{color:#ffe08a;border-bottom-color:#d4af37;background:rgba(212,175,55,.10)}",
      ".twmgr-tab-ico{font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;border:2px solid transparent;transition:.2s}",
      ".twmgr-tab-lbl{font-size:9px}",
      ".twmgr-tab.twmgr-run .twmgr-tab-ico{border-color:#3fce54;background:rgba(63,206,84,.15);box-shadow:0 0 9px rgba(63,206,84,.6)}",
      ".twmgr-ui{width:18px;height:18px;vertical-align:middle}",
      ".twmgr-btn.on{box-shadow:0 0 12px rgba(76,200,90,.85),inset 0 0 0 1px rgba(255,255,255,.3)}",
      ".twmgr-btn.dim{opacity:.4 !important;filter:grayscale(.5);cursor:default}",
      "#twmgr-body{padding:11px 12px 12px}",
      ".twmgr-hint{font-size:10px;color:#b0a079;line-height:1.4;margin-bottom:9px}.twmgr-hint b{color:#e8d29a}",
      ".twmgr-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}",
      ".twmgr-lbl{font-size:10px;color:#c9b88f}",
      ".twmgr-inp{background:#161009 !important;border:1px solid #5c4a29 !important;color:#f2e8cf !important;border-radius:7px !important;padding:5px 7px !important;font-size:11px !important;outline:none !important;transition:.15s}",
      ".twmgr-inp:focus{border-color:#d4af37 !important;box-shadow:0 0 0 2px rgba(212,175,55,.25) !important}",
      "#twmgr-panel input[type=checkbox]{accent-color:#d4af37;width:15px;height:15px;cursor:pointer;vertical-align:middle}",
      ".twmgr-btn{border:none;border-radius:8px;padding:7px 10px;font-size:11px;font-weight:600;cursor:pointer;transition:.15s;color:#fff}",
      ".twmgr-btn:hover{filter:brightness(1.12)}.twmgr-btn:active{transform:translateY(1px)}",
      ".twmgr-go{background:linear-gradient(180deg,#3bb14a,#2e7d32) !important;color:#fff !important}",
      ".twmgr-stop{background:linear-gradient(180deg,#e6584a,#b3271a) !important;color:#fff !important}",
      ".twmgr-ghost{background:rgba(212,175,55,.10) !important;border:1px solid #8a6d2a !important;color:#ecd9a3 !important}.twmgr-ghost:hover{background:rgba(212,175,55,.2) !important}",
      ".twmgr-add{width:100%;background:transparent !important;border:1px dashed #8a6d2a !important;color:#e6cf7d !important;border-radius:8px;padding:6px;font-size:11px;font-weight:600;cursor:pointer;margin-bottom:8px}.twmgr-add:hover{background:rgba(212,175,55,.10) !important}",
      ".twmgr-actions{display:flex;gap:8px;margin-bottom:7px}.twmgr-actions .twmgr-btn{flex:1}",
      ".twmgr-cstatus{text-align:center;font-size:10px;font-weight:600;min-height:13px;color:#c9b88f}",
      ".twmgr-card{background:linear-gradient(180deg,#261d13,#1d1510);border:1px solid #473721;border-radius:9px;margin-bottom:7px;overflow:hidden}",
      ".twmgr-card-head{display:flex;align-items:center;gap:7px;padding:7px 9px}",
      ".twmgr-xy{flex:0 0 76px;width:76px;text-align:center}",
      ".twmgr-cnt{flex:1;text-align:center;font-size:11px;font-weight:700;color:#ffd76a;font-variant-numeric:tabular-nums}",
      ".twmgr-exp,.twmgr-del{cursor:pointer;font-size:12px;width:20px;height:20px;line-height:20px;text-align:center;border-radius:5px;color:#c9b88f}",
      ".twmgr-exp:hover{background:rgba(212,175,55,.15);color:#ffe08a}",
      ".twmgr-del{color:#e6a89d}.twmgr-del:hover{background:rgba(231,76,60,.18);color:#ff6f5e}",
      ".twmgr-from{font-size:9px;color:#8f7d57;padding:0 9px 6px}",
      ".twmgr-troops{display:none;padding:6px 9px 8px;border-top:1px solid #3a2c1a}.twmgr-troops table{width:100%;border-collapse:collapse}",
      ".twmgr-troops td{padding:2px 3px;font-size:10px;color:#cdbb92}.twmgr-qi{width:46px;text-align:center}",
      ".twmgr-units{display:grid;grid-template-columns:1fr 1fr;gap:6px 8px;margin-bottom:9px}",
      ".twmgr-units label{display:flex;align-items:center;gap:7px;font-size:11px;color:#d3c299;cursor:pointer}",
      ".twmgr-res{display:flex;gap:6px;margin:5px 0 9px}.twmgr-res label{flex:1;display:flex;align-items:center;gap:4px;font-size:13px}.twmgr-res .twmgr-inp{width:100%;font-size:11px !important}",
      ".twmgr-check{display:flex;align-items:center;gap:8px;font-size:11px;color:#d3c299;margin-bottom:10px;cursor:pointer}",
      ".twmgr-log{height:150px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:8px;padding:7px 8px;font-family:Consolas,'Courier New',monospace;font-size:10px;line-height:1.45}",
      ".twmgr-log::-webkit-scrollbar{width:8px}.twmgr-log::-webkit-scrollbar-thumb{background:#4a3a22;border-radius:4px}",
      "#twmgr-panel.twmgr-collapsed{width:auto}",
      "#twmgr-panel.twmgr-collapsed .twmgr-tabs,#twmgr-panel.twmgr-collapsed #twmgr-body{display:none}",
      "#twmgr-panel.twmgr-collapsed #twmgr-head{border-bottom:none}",
      ".twmgr-dot{width:9px;height:9px;border-radius:50%;background:#5a4a2e;transition:.2s;flex:0 0 auto}",
      ".twmgr-dot.on{background:#3fce54;box-shadow:0 0 8px #3fce54}",
    ].join('');
    document.head.appendChild(s);
  }

  function showTab(name) {
    ['alvos', 'scav', 'farm', 'recruit', 'fakes', 'market', 'build', 'config', 'log'].forEach((n) => {
      const c = document.getElementById('twmgr-tab-' + n); if (c) c.style.display = n === name ? 'block' : 'none';
      const b = document.getElementById('twmgr-btab-' + n); if (b) b.classList.toggle('active', n === name);
    });
  }

  function buildUI() {
    injectStyles();
    const p = document.createElement('div'); p.id = 'twmgr-panel';
    const tabBtn = (n, ico, label) => '<div id="twmgr-btab-' + n + '" class="twmgr-tab" data-tab="' + n + '"><span class="twmgr-tab-ico">' + ico + '</span><span class="twmgr-tab-lbl">' + label + '</span></div>';
    p.innerHTML =
      '<div id="twmgr-head"><span class="twmgr-title">🎯 TW Manager <span class="twmgr-ver">v' + VERSION + '</span></span><span id="twmgr-dot" class="twmgr-dot" title="algum módulo ativo"></span><span id="twmgr-upd-btn" title="Verificar / instalar atualização">🔄<span id="twmgr-upd-badge" style="display:none">●</span></span><span id="twmgr-min" title="minimizar / restaurar">–</span></div>' +
      '<div class="twmgr-tabs">' + tabBtn('alvos', '⚔️', 'Alvos') + tabBtn('scav', '⛏️', 'Coletas') + tabBtn('farm', '🐎', 'Saque') + tabBtn('recruit', '🏹', 'Recrutar') + tabBtn('fakes', '🎭', 'Fakes') + tabBtn('market', '🏪', 'Mercado') + tabBtn('build', '🏗️', 'Edifícios') + tabBtn('config', '⚙️', 'Config') + tabBtn('log', '📜', 'Log') + '</div>' +
      '<div id="twmgr-body">' +
      '<div id="twmgr-tab-alvos"><div class="twmgr-hint">Cada alvo é enviado da aldeia onde foi criado (veja "de:"). Aldeia atual: <b>' + CUR_NAME + '</b></div><div id="twmgr-targets"></div><button id="twmgr-add" class="twmgr-add">+ Adicionar alvo</button><div class="twmgr-actions"><button id="twmgr-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div><div id="twmgr-global" class="twmgr-cstatus"></div></div>' +
      '<div id="twmgr-tab-scav" style="display:none"><div class="twmgr-hint">Coleta em <b>todas as suas aldeias</b>: distribui as tropas marcadas entre as opções livres e reenvia no retorno.</div><div class="twmgr-units">' + SCAV_UNITS.map(([u, n]) => '<label><input id="twmgr-su-' + u + '" type="checkbox"> ' + unitIcon(u, n) + ' ' + n + '</label>').join('') + '</div><div class="twmgr-actions"><button id="twmgr-scav-start" class="twmgr-btn twmgr-go">▶ Coletar</button><button id="twmgr-scav-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div><div id="twmgr-scav-status" class="twmgr-cstatus"></div></div>' +
      '<div id="twmgr-tab-farm" style="display:none"><div class="twmgr-hint">Assistente de Saque (<b>C</b>) em <b>todas as aldeias</b>. Só ataca com o C liberado e recursos acima do mínimo.</div><div class="twmgr-lbl" style="margin-bottom:3px">Mínimo por recurso</div><div class="twmgr-res"><label><span class="icon header wood"></span><input id="twmgr-farm-wood" class="twmgr-inp" type="number" min="0" value="1000"></label><label><span class="icon header stone"></span><input id="twmgr-farm-stone" class="twmgr-inp" type="number" min="0" value="1000"></label><label><span class="icon header iron"></span><input id="twmgr-farm-iron" class="twmgr-inp" type="number" min="0" value="1000"></label></div><div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-farm-dist" class="twmgr-inp" type="number" min="0" step="0.1" value="13" style="width:66px"></div><div class="twmgr-row"><span class="twmgr-lbl">Muralha máx. (nível)</span><input id="twmgr-farm-wall" class="twmgr-inp" type="number" min="0" max="20" value="20" style="width:66px"></div><div class="twmgr-row"><span class="twmgr-lbl">Intervalo (min)</span><input id="twmgr-farm-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div><div class="twmgr-row"><span class="twmgr-lbl">Delay entre envios (ms)</span><input id="twmgr-farm-delay" class="twmgr-inp" type="number" min="0" step="100" value="500" style="width:66px"></div><div style="font-size:11px;color:#e8d29a;margin:6px 0 2px">🐏 Aríete (quebra-muralha)</div><div class="twmgr-row"><span class="twmgr-lbl">Modo aríete</span><select id="twmgr-farm-rammode" class="twmgr-inp" style="width:130px"><option value="off">desligado (só C)</option><option value="auto">auto (pela muralha)</option><option value="fixo">fixo</option></select></div><div class="twmgr-row"><span class="twmgr-lbl">Bárbaro por farm</span><input id="twmgr-farm-axe" class="twmgr-inp" type="number" min="1" value="80" style="width:66px"></div><div id="twmgr-farm-ram-auto"><div class="twmgr-row"><span class="twmgr-lbl">Aríetes p/ muralha 6</span><input id="twmgr-farm-ramw6" class="twmgr-inp" type="number" min="1" value="24" style="width:66px"></div><div style="font-size:9px;color:#8f7d57;margin-bottom:6px">calibra o resto: muro5≈18 · 4≈13 · 3≈9 · 2≈5 · 1≈3</div></div><div id="twmgr-farm-ram-fixo" style="display:none"><div class="twmgr-row"><span class="twmgr-lbl">Aríetes por farm (fixo)</span><input id="twmgr-farm-ramfix" class="twmgr-inp" type="number" min="0" value="20" style="width:66px"></div></div><div class="twmgr-actions"><button id="twmgr-farm-start" class="twmgr-btn twmgr-go">▶ Saquear</button><button id="twmgr-farm-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div><div id="twmgr-farm-status" class="twmgr-cstatus"></div></div>' +
      '<div id="twmgr-tab-recruit" style="display:none"><div class="twmgr-hint">Recruta por <b>grupo</b> (ATK/DEF): mantém ~<b>fila alvo</b> por edifício e para no <b>alvo</b> de tropas. Vazio = contínuo.</div><div class="twmgr-row"><span class="twmgr-lbl">Grupo ATK</span><select id="twmgr-r-gatk" class="twmgr-inp" style="width:150px"></select></div><div class="twmgr-row"><span class="twmgr-lbl">Grupo DEF</span><select id="twmgr-r-gdef" class="twmgr-inp" style="width:150px"></select></div><div style="text-align:right;margin-bottom:2px"><button id="twmgr-r-reload" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">↻ grupos</button></div>' + recruitProfileHTML('atk', '⚔️ Perfil ATK') + recruitProfileHTML('def', '🛡️ Perfil DEF') + '<div class="twmgr-row" style="margin-top:8px"><span class="twmgr-lbl">Fila alvo (h)</span><input id="twmgr-r-hours" class="twmgr-inp" type="number" min="0.5" step="0.5" value="2" style="width:66px"></div><div class="twmgr-row"><span class="twmgr-lbl">Repor quando faltar (min)</span><input id="twmgr-r-refill" class="twmgr-inp" type="number" min="1" value="30" style="width:66px"></div><div class="twmgr-actions"><button id="twmgr-r-start" class="twmgr-btn twmgr-go">▶ Recrutar</button><button id="twmgr-r-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div><button id="twmgr-r-diag" class="twmgr-btn twmgr-ghost" style="width:100%;margin-bottom:6px">🔍 Diagnóstico (Recrutar)</button><div id="twmgr-recruit-status" class="twmgr-cstatus"></div></div>' +
      '<div id="twmgr-tab-fakes" style="display:none">' +
      '<div class="twmgr-hint">Fakes com <b>chegada</b> em horário marcado. Cole vários alvos, escolha as origens e a estratégia (1 isca + explorador — neutro, não revela off/def).</div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Relógio servidor</span><b id="twmgr-srvclock" style="color:#ffd76a">--:--:--</b></div>' +
      '<label class="twmgr-lbl">Alvos (cole vários)</label><textarea id="twmgr-fk-targets" class="twmgr-inp" style="width:100%;height:52px;margin:2px 0 6px" placeholder="430|522 428|524 430|520 …"></textarea>' +
      '<label class="twmgr-lbl">Chegada</label><input id="twmgr-fk-arr" class="twmgr-inp" type="datetime-local" step="1" style="width:100%;margin:2px 0 6px">' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Origens que enviam</span><span style="font-size:9px"><a id="twmgr-fk-all" style="cursor:pointer;color:#e6cf7d">todas</a> · <a id="twmgr-fk-none" style="cursor:pointer;color:#e6cf7d">nenhuma</a></span></div>' +
      '<div id="twmgr-fk-origins" style="max-height:96px;overflow-y:auto;border:1px solid #3a2c1a;border-radius:6px;padding:4px;margin-bottom:6px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Distribuição</span><span style="font-size:10px"><label><input type="radio" name="twmgr-fk-mode" value="split"> dividir</label> <label><input type="radio" name="twmgr-fk-mode" value="all"> todas→todos</label></span></div>' +
      '<div style="font-size:11px;color:#e8d29a;margin:4px 0 2px">Estratégia do fake</div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Isca (1x)</span><select id="twmgr-fk-siege" class="twmgr-inp" style="width:110px"><option value="ram">Aríete</option><option value="catapult">Catapulta</option><option value="none">nenhum</option></select></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Preencher com</span><select id="twmgr-fk-filler" class="twmgr-inp" style="width:110px">' + UNITS.map(([u, n]) => '<option value="' + u + '">' + n + '</option>').join('') + '</select></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Pop mín (% dos pontos)</span><input id="twmgr-fk-pct" class="twmgr-inp" type="number" min="0" step="0.5" value="1" style="width:56px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Pop mín fixa (0=auto)</span><input id="twmgr-fk-minpop" class="twmgr-inp" type="number" min="0" value="0" style="width:56px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Offset envio (ms)</span><input id="twmgr-fk-offset" class="twmgr-inp" type="number" min="0" value="150" style="width:56px"></div>' +
      '<button id="twmgr-fk-preview" class="twmgr-btn twmgr-ghost" style="width:100%;margin-bottom:6px">💡 Prever fakes</button>' +
      '<div class="twmgr-actions"><button id="twmgr-fk-start" class="twmgr-btn twmgr-go">▶ Armar</button><button id="twmgr-fk-stop" class="twmgr-btn twmgr-stop">■ Desarmar</button></div>' +
      '<div id="twmgr-fk-status" class="twmgr-cstatus"></div>' +
      '</div>' +
      '<div id="twmgr-tab-market" style="display:none">' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Modo</span><span style="font-size:11px"><label><input type="radio" name="twmgr-mk-mode" value="cunhagem"> 💰 Cunhagem</label> <label><input type="radio" name="twmgr-mk-mode" value="equilibrio"> ⚖️ Equilíbrio</label></span></div>' +
      '<div id="twmgr-mk-cunhagem">' +
      '<div class="twmgr-hint">Manda recurso balanceado das aldeias selecionadas pra uma aldeia destino, deixando um mínimo. Pula o destino pela coordenada.</div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Coordenada destino</span><input id="twmgr-mk-coord" class="twmgr-inp" type="text" placeholder="464|604" style="width:90px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Deixar mínimo (cada rec.)</span><input id="twmgr-mk-reserve" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:72px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Aldeias de origem</span><span style="font-size:9px"><a id="twmgr-mk-all" style="cursor:pointer;color:#e6cf7d">todas</a> · <a id="twmgr-mk-none" style="cursor:pointer;color:#e6cf7d">nenhuma</a></span></div>' +
      '<div id="twmgr-mk-sources" style="max-height:120px;overflow-y:auto;border:1px solid #3a2c1a;border-radius:6px;padding:4px;margin-bottom:6px"></div>' +
      '</div>' +
      '<div id="twmgr-mk-equilibrio" style="display:none">' +
      '<div class="twmgr-hint">⚖️ Equilíbrio pelo <b>% do armazém</b>, por recurso (madeira/argila/ferro separados): aldeia <b>acima</b> do limiar doa o excedente pras que estão <b>abaixo</b> — todas convergem pro limiar. Da aldeia mais perto primeiro.</div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Encher armazém até (%)</span><input id="twmgr-mk-thr" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-mk-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="15" style="width:56px"></div>' +
      '</div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo (min)</span><input id="twmgr-mk-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>' +
      '<div class="twmgr-actions"><button id="twmgr-mk-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-mk-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
      '<div id="twmgr-mk-status" class="twmgr-cstatus"></div>' +
      '</div>' +
      '<div id="twmgr-tab-build" style="display:none">' +
      '<div class="twmgr-hint">🏗️ Fila planejada por template <b>ATK/DEF</b> (usa os grupos do Recrutar). 1 linha = <code>chave nível</code>, em ordem de prioridade. Constrói o 1º item afordável; o item caro vira demanda pro Equilíbrio.</div>' +
      '<div style="font-size:9px;color:#8f7d57;margin-bottom:4px">chaves: main wood stone iron farm storage barracks stable garage smith market wall snob watchtower place statue hide</div>' +
      '<div style="font-size:11px;color:#e8d29a;margin:2px 0">⚔️ Template ATK</div>' +
      '<textarea id="twmgr-bld-atk" class="twmgr-inp" style="width:100%;height:88px;font-family:monospace;font-size:10px"></textarea>' +
      '<div style="font-size:11px;color:#e8d29a;margin:4px 0 2px">🛡️ Template DEF</div>' +
      '<textarea id="twmgr-bld-def" class="twmgr-inp" style="width:100%;height:88px;font-family:monospace;font-size:10px"></textarea>' +
      '<div class="twmgr-row" style="margin-top:6px"><span class="twmgr-lbl">Máx na fila</span><input id="twmgr-bld-max" class="twmgr-inp" type="number" min="1" value="5" style="width:56px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo (min)</span><input id="twmgr-bld-int" class="twmgr-inp" type="number" min="1" value="10" style="width:56px"></div>' +
      '<div class="twmgr-actions"><button id="twmgr-bld-start" class="twmgr-btn twmgr-go">▶ Construir</button><button id="twmgr-bld-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
      '<div id="twmgr-bld-status" class="twmgr-cstatus"></div>' +
      '</div>' +
      '<div id="twmgr-tab-config" style="display:none"><label class="twmgr-check"><input id="twmgr-reload" type="checkbox"> Recarregar (F5) após enviar ataque</label><button id="twmgr-diag" class="twmgr-btn twmgr-ghost" style="width:100%;margin-bottom:9px">🔍 Diagnóstico (Auto-ATK)</button><div class="twmgr-hint">O reenvio do Auto-ATK usa o <b>retorno real</b> das tropas. O F5 só acontece no momento do reenvio.</div></div>' +
      '<div id="twmgr-tab-log" style="display:none"><div id="twmgr-log" class="twmgr-log"></div></div>' +
      '</div>';
    document.body.appendChild(p);

    renderTargets();
    document.getElementById('twmgr-reload').checked = !!config.reloadAfterSend;
    document.getElementById('twmgr-add').addEventListener('click', () => { readTargets(); config.targets.push({ id: genId(), x: '', y: '', enabled: true, units: {}, nextSendAt: 0, origin: CUR_VID, originName: CUR_NAME }); save(); renderTargets(); });
    document.getElementById('twmgr-start').addEventListener('click', start);
    document.getElementById('twmgr-stop').addEventListener('click', stop);
    document.getElementById('twmgr-diag').addEventListener('click', runDiagnostics);
    document.getElementById('twmgr-reload').addEventListener('change', () => { config.reloadAfterSend = document.getElementById('twmgr-reload').checked; save(); });

    SCAV_UNITS.forEach(([u]) => { const el = document.getElementById('twmgr-su-' + u); if (el) el.checked = !!(config.scav.units && config.scav.units[u]); });
    document.getElementById('twmgr-scav-start').addEventListener('click', scavStart);
    document.getElementById('twmgr-scav-stop').addEventListener('click', scavStop);
    setScavStatus(config.scav.running);

    document.getElementById('twmgr-farm-wood').value = config.farm.minWood != null ? config.farm.minWood : 1000;
    document.getElementById('twmgr-farm-stone').value = config.farm.minStone != null ? config.farm.minStone : 1000;
    document.getElementById('twmgr-farm-iron').value = config.farm.minIron != null ? config.farm.minIron : 1000;
    document.getElementById('twmgr-farm-dist').value = config.farm.maxDist != null ? config.farm.maxDist : 13;
    document.getElementById('twmgr-farm-wall').value = config.farm.maxWall != null ? config.farm.maxWall : 20;
    document.getElementById('twmgr-farm-int').value = Math.round((config.farm.interval || 600) / 60);
    document.getElementById('twmgr-farm-delay').value = config.farm.delay != null ? config.farm.delay : 500;
    document.getElementById('twmgr-farm-rammode').value = config.farm.ramMode || 'off';
    document.getElementById('twmgr-farm-axe').value = config.farm.axeCount != null ? config.farm.axeCount : 80;
    document.getElementById('twmgr-farm-ramw6').value = config.farm.ramWall6 != null ? config.farm.ramWall6 : 24;
    document.getElementById('twmgr-farm-ramfix').value = config.farm.ramFixed != null ? config.farm.ramFixed : 20;
    const applyRamMode = () => { const m = document.getElementById('twmgr-farm-rammode').value; document.getElementById('twmgr-farm-ram-auto').style.display = m === 'auto' ? 'block' : 'none'; document.getElementById('twmgr-farm-ram-fixo').style.display = m === 'fixo' ? 'block' : 'none'; };
    ['twmgr-farm-rammode', 'twmgr-farm-axe', 'twmgr-farm-ramw6', 'twmgr-farm-ramfix'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readFarmCfg); });
    document.getElementById('twmgr-farm-rammode').addEventListener('change', applyRamMode);
    applyRamMode();
    document.getElementById('twmgr-farm-start').addEventListener('click', farmStart);
    document.getElementById('twmgr-farm-stop').addEventListener('click', farmStop);
    ['twmgr-farm-wood', 'twmgr-farm-stone', 'twmgr-farm-iron', 'twmgr-farm-dist', 'twmgr-farm-wall', 'twmgr-farm-int', 'twmgr-farm-delay'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readFarmCfg); });
    setFarmStatus(config.farm.running);

    document.getElementById('twmgr-r-hours').value = config.recruit.targetHours != null ? config.recruit.targetHours : 2;
    document.getElementById('twmgr-r-refill').value = config.recruit.refillBelowMin != null ? config.recruit.refillBelowMin : 30;
    fillGroupSelects();
    document.getElementById('twmgr-r-reload').addEventListener('click', fillGroupSelects);
    document.getElementById('twmgr-r-start').addEventListener('click', recruitStart);
    document.getElementById('twmgr-r-stop').addEventListener('click', recruitStop);
    document.getElementById('twmgr-r-diag').addEventListener('click', runRecruitDiag);
    ['twmgr-r-gatk', 'twmgr-r-gdef', 'twmgr-r-hours', 'twmgr-r-refill'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readRecruitCfg); });
    document.querySelectorAll('.twmgr-ron, .twmgr-rt').forEach((el) => el.addEventListener('change', readRecruitCfg));
    setRecruitStatus(config.recruit.running);

    document.getElementById('twmgr-fk-targets').value = config.fakes.targetsRaw || '';
    document.getElementById('twmgr-fk-arr').value = config.fakes.arrLocal || '';
    document.getElementById('twmgr-fk-offset').value = config.fakes.offsetMs != null ? config.fakes.offsetMs : 150;
    document.getElementById('twmgr-fk-pct').value = config.fakes.pct != null ? config.fakes.pct : 1;
    document.getElementById('twmgr-fk-minpop').value = config.fakes.minPop || 0;
    document.getElementById('twmgr-fk-siege').value = config.fakes.siege || 'ram';
    document.getElementById('twmgr-fk-filler').value = config.fakes.filler || 'spy';
    const fkMode = document.querySelector('input[name="twmgr-fk-mode"][value="' + (config.fakes.mode || 'split') + '"]'); if (fkMode) fkMode.checked = true;
    renderFakeOrigins();
    document.getElementById('twmgr-fk-all').addEventListener('click', () => { document.querySelectorAll('.twmgr-fk-origin').forEach((cb) => cb.checked = true); readFakesCfg(); });
    document.getElementById('twmgr-fk-none').addEventListener('click', () => { document.querySelectorAll('.twmgr-fk-origin').forEach((cb) => cb.checked = false); readFakesCfg(); });
    ['twmgr-fk-targets', 'twmgr-fk-arr', 'twmgr-fk-offset', 'twmgr-fk-pct', 'twmgr-fk-minpop', 'twmgr-fk-siege', 'twmgr-fk-filler'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readFakesCfg); });
    document.querySelectorAll('input[name="twmgr-fk-mode"]').forEach((r) => r.addEventListener('change', readFakesCfg));
    document.getElementById('twmgr-fk-preview').addEventListener('click', fakePreview);
    document.getElementById('twmgr-fk-start').addEventListener('click', fakeStart);
    document.getElementById('twmgr-fk-stop').addEventListener('click', fakeStop);
    setFakeStatus(config.fakes.running);

    document.getElementById('twmgr-mk-coord').value = config.market.destCoord || '';
    document.getElementById('twmgr-mk-reserve').value = config.market.reserve || 0;
    document.getElementById('twmgr-mk-int').value = Math.round((config.market.interval || 600) / 60);
    document.getElementById('twmgr-mk-thr').value = config.market.thresholdPct != null ? config.market.thresholdPct : 50;
    document.getElementById('twmgr-mk-dist').value = config.market.maxDist != null ? config.market.maxDist : 15;
    const mkModeR = document.querySelector('input[name="twmgr-mk-mode"][value="' + (config.market.mode || 'cunhagem') + '"]'); if (mkModeR) mkModeR.checked = true;
    const applyMkMode = () => {
      const m = (document.querySelector('input[name="twmgr-mk-mode"]:checked') || {}).value || 'cunhagem';
      document.getElementById('twmgr-mk-cunhagem').style.display = m === 'cunhagem' ? 'block' : 'none';
      document.getElementById('twmgr-mk-equilibrio').style.display = m === 'equilibrio' ? 'block' : 'none';
    };
    renderMarketSources();
    document.getElementById('twmgr-mk-all').addEventListener('click', () => { document.querySelectorAll('.twmgr-mk-src').forEach((cb) => cb.checked = true); readMarketCfg(); });
    document.getElementById('twmgr-mk-none').addEventListener('click', () => { document.querySelectorAll('.twmgr-mk-src').forEach((cb) => cb.checked = false); readMarketCfg(); });
    ['twmgr-mk-coord', 'twmgr-mk-reserve', 'twmgr-mk-int', 'twmgr-mk-thr', 'twmgr-mk-dist'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readMarketCfg); });
    document.querySelectorAll('input[name="twmgr-mk-mode"]').forEach((r) => r.addEventListener('change', () => { readMarketCfg(); applyMkMode(); }));
    applyMkMode();
    document.getElementById('twmgr-mk-start').addEventListener('click', marketStart);
    document.getElementById('twmgr-mk-stop').addEventListener('click', marketStop);
    setMarketStatus(config.market.running);

    document.getElementById('twmgr-bld-atk').value = config.build.atkTpl || ATK_TPL;
    document.getElementById('twmgr-bld-def').value = config.build.defTpl || DEF_TPL;
    document.getElementById('twmgr-bld-max').value = config.build.maxQueue || 5;
    document.getElementById('twmgr-bld-int').value = Math.round((config.build.interval || 600) / 60);
    ['twmgr-bld-atk', 'twmgr-bld-def', 'twmgr-bld-max', 'twmgr-bld-int'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readBuildCfg); });
    document.getElementById('twmgr-bld-start').addEventListener('click', buildStart);
    document.getElementById('twmgr-bld-stop').addEventListener('click', buildStop);
    setBuildStatus(config.build.running);

    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.getAttribute('data-tab'))));
    const applyCollapsed = () => { p.classList.toggle('twmgr-collapsed', !!config.uiMin); const mb = document.getElementById('twmgr-min'); if (mb) mb.textContent = config.uiMin ? '＋' : '–'; };
    document.getElementById('twmgr-min').addEventListener('click', (e) => { e.stopPropagation(); config.uiMin = !config.uiMin; save(); applyCollapsed(); });
    document.getElementById('twmgr-upd-btn').addEventListener('click', (e) => { e.stopPropagation(); if (updateInfo.hasUpdate) doUpdate(); else checkForUpdate(true); });
    const lastCheck = Number(localStorage.getItem(KEY + '_lastUpdCheck') || 0);
    if (Date.now() - lastCheck > 3600000) checkForUpdate(false);
    setInterval(() => checkForUpdate(false), 3600000);
    applyCollapsed();
    makeDraggable(p, document.getElementById('twmgr-head'));

    showTab('alvos');
    renderLog();
    setStatus(config.running);
    uiTimer = setInterval(tickUI, 1000);

    if (anyRunning() && lockOther()) pushLog('Outra aba já está ativa; esta ficará em espera.', 'err');
    if (config.running) { if (!lockOther()) pushLog('Auto-ATK retomado.', 'ok'); processDue(); }
    if (config.scav.running) { if (!lockOther()) pushLog('Coleta retomada.', 'ok'); scheduleScav(); }
    if (config.farm.running) { if (!lockOther()) pushLog('Saque retomado.', 'ok'); scheduleFarm(); }
    if (config.recruit.running) { if (!lockOther()) pushLog('Recrutar retomado.', 'ok'); scheduleRecruit(); }
    if (config.fakes.running) { config.fakes.gen.forEach((f) => { if (f.state === 'scheduled') f.state = 'armed'; }); if (!lockOther()) pushLog('Fakes rearmados.', 'ok'); fakeTick(); }
    if (config.market.running) { if (!lockOther()) pushLog('Cunhagem retomada.', 'ok'); scheduleMarket(); }
    if (config.build.running) { if (!lockOther()) pushLog('Edifícios retomado.', 'ok'); scheduleBuild(); }
  }

  function makeDraggable(panel, handle) {
    let sx, sy, ox, oy, drag = false;
    handle.addEventListener('mousedown', (e) => { if (e.target.id === 'twmgr-min') return; drag = true; sx = e.clientX; sy = e.clientY; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; panel.style.right = 'auto'; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => { if (!drag) return; panel.style.left = (ox + e.clientX - sx) + 'px'; panel.style.top = (oy + e.clientY - sy) + 'px'; });
    document.addEventListener('mouseup', () => { drag = false; });
  }

  buildUI();
})();
