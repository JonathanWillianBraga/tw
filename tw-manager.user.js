// ==UserScript==
// @name         Tribal Wars Manager
// @namespace    tw-manager
// @version      9.23.0
// @description  Auto-ATK + Coleta + Saque + Recrutar + Fakes + Bárbaros do Mapa (multi-alvo/origem, chegada em horário marcado).
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

  const VERSION = '9.23.0';
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
  const defFarmMatrix = () => ({ greenEmpty: { a: 1, b: 0, c: false }, greenFull: { a: 0, b: 1, c: false }, yellowEmpty: { a: 0, b: 0, c: false }, yellowFull: { a: 0, b: 0, c: false }, blue: { a: 0, b: 1, c: false } });
  const defFarm = () => ({ running: false, nextAt: 0, interval: 600, minWood: 1000, minStone: 1000, minIron: 1000, maxDist: 13, maxWall: 20, delay: 500, mode: 'suave', group: null, cooldownMin: 10, minCL: 0, order: 'dist', dynTemplate: false, matrix: defFarmMatrix(), sentReports: {}, defended: {} });
  const defWall = () => ({ running: false, nextAt: 0, interval: 600, wallMin: 1, wallMax: 6, ramMode: 'auto', ramFixed: 20, ramWall6: 24, axeCount: 80, spyCount: 1, sentDemo: {} });
  const defRecruit = () => ({
    running: false, nextAt: 0, interval: 600, targetHours: 2, refillBelowMin: 30,
    groupAtk: null, groupDef: null, profiles: { atk: { targets: {} }, def: { targets: {} } }, overrides: {}, queueEst: {},
  });
  const defFakes = () => ({ running: false, offsetMs: 150, targetsRaw: '', arrLocal: '', mode: 'split', pct: 1, minPop: 0, siege: 'ram', filler: 'spy', origins: {}, gen: [] });
  const defMarket = () => ({ running: false, mode: 'cunhagem', nextAt: 0, interval: 600, destCoord: '', reserve: 0, sources: {}, thresholdPct: 50, maxDist: 15, inflight: {} });
  const defBuild = () => ({ running: false, nextAt: 0, interval: 600, maxQueue: 5, atkTpl: ATK_TPL, defTpl: DEF_TPL, demand: {} });
  const BB_TPL = 'main 20\nstorage 20\nfarm 22\nstable 15\nbarracks 15\nsmith 10\ngarage 5\nfarm 24\nstorage 25\nbarracks 20\nstable 20\ngarage 10\nwood 30\nstone 30\niron 30\nstorage 30\nfarm 27\nmarket 15';
  const defBB = () => ({ running: false, nextAt: 0, interval: 600, maxQueue: 5, group: null, tpl: BB_TPL, defCoords: '', feedReserve: 40, feedMaxDist: 15, gradMain: 20, gradStable: 15 });
  const defMap = () => ({
    running: false, nextAt: 0,
    maxDist: 20, minDaysSinceScout: 2,
    group: null,                          // grupo com aldeias de origem (vazio = todas)
    spyReserve: 30, spyCount: 1,          // guardar N spy por aldeia; enviar N spy por bárbaro
    minPoints: 26, maxPoints: 5000,
    maxPerVillage: 20, delay: 500,
    onlyBarbarians: true,
    sentAt: {},                           // vid do bárbaro -> timestamp do último scout nosso
    lastPreview: [],                      // lista mostrada na tabela
  });
  const def = () => ({ targets: [], reloadAfterSend: true, running: false, scav: defScav(), farm: defFarm(), recruit: defRecruit(), fakes: defFakes(), market: defMarket(), build: defBuild(), bb: defBB(), map: defMap() });
  function load() {
    let c = def();
    try {
      const r = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (r) {
        if (r.targets) c = Object.assign(c, r);
        else if (r.x || r.units) { c.targets = [{ id: genId(), x: r.x || '', y: r.y || '', enabled: true, units: r.units || {}, nextSendAt: 0 }]; c.running = false; }
      }
    } catch (e) {}
    c.running = false; // Auto-ATK (Alvos) descontinuado na v9.21 — backend dormente
    if (!c.scav) c.scav = defScav();
    if (!c.scav.units) c.scav.units = defScav().units;
    if (!c.farm) c.farm = defFarm();
    if (!c.farm.sentReports) c.farm.sentReports = {};
    if (c.farm.maxDist == null) c.farm.maxDist = 13;
    if (c.farm.maxWall == null) c.farm.maxWall = 20;
    if (c.farm.delay == null) c.farm.delay = 500;
    // limpa campos de aríete que ficaram no farm em versões antigas (migraram pro Quebra-muralha)
    delete c.farm.ramMode; delete c.farm.ramFixed; delete c.farm.ramWall6; delete c.farm.axeCount;
    const oldMin = c.farm.min != null ? c.farm.min : 1000;
    if (c.farm.minWood == null) c.farm.minWood = oldMin;
    if (c.farm.minStone == null) c.farm.minStone = oldMin;
    if (c.farm.minIron == null) c.farm.minIron = oldMin;
    if (!c.farm.mode) c.farm.mode = 'suave';
    if (c.farm.group === undefined) c.farm.group = null;
    if (c.farm.cooldownMin == null) c.farm.cooldownMin = 10;
    if (c.farm.minCL == null) c.farm.minCL = 0;
    if (!c.farm.order) c.farm.order = 'dist';
    if (c.farm.dynTemplate == null) c.farm.dynTemplate = false;
    if (!c.farm.matrix) c.farm.matrix = defFarmMatrix();
    if (!c.farm.defended) c.farm.defended = {};
    if (!c.wall) c.wall = defWall();
    if (!c.wall.sentDemo) c.wall.sentDemo = {};
    if (c.wall.wallMin == null) c.wall.wallMin = 1;
    if (c.wall.wallMax == null) c.wall.wallMax = 6;
    if (!c.wall.ramMode) c.wall.ramMode = 'auto';
    if (c.wall.ramFixed == null) c.wall.ramFixed = 20;
    if (c.wall.ramWall6 == null) c.wall.ramWall6 = 24;
    if (c.wall.axeCount == null) c.wall.axeCount = 80;
    if (c.wall.interval == null) c.wall.interval = 600;
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
    if (!c.bb) c.bb = defBB();
    if (!c.bb.tpl) c.bb.tpl = BB_TPL;
    if (c.bb.defCoords == null) c.bb.defCoords = '';
    if (c.bb.feedReserve == null) c.bb.feedReserve = 40;
    if (c.bb.feedMaxDist == null) c.bb.feedMaxDist = 15;
    if (c.bb.maxQueue == null) c.bb.maxQueue = 5;
    if (c.bb.interval == null) c.bb.interval = 600;
    if (c.bb.gradMain == null) c.bb.gradMain = 20;
    if (c.bb.gradStable == null) c.bb.gradStable = 15;
    if (!c.map) c.map = defMap();
    if (!c.map.sentAt) c.map.sentAt = {};
    if (!c.map.lastPreview) c.map.lastPreview = [];
    if (c.map.maxDist == null) c.map.maxDist = 20;
    if (c.map.minDaysSinceScout == null) c.map.minDaysSinceScout = (c.map.minDaysSinceAttack != null ? c.map.minDaysSinceAttack : 2);
    if (c.map.spyReserve == null) c.map.spyReserve = 30;
    if (c.map.spyCount == null) c.map.spyCount = 1;
    delete c.map.units; delete c.map.tplBId; delete c.map.interval; delete c.map.minDaysSinceAttack;
    if (c.map.minPoints == null) c.map.minPoints = 26;
    if (c.map.maxPoints == null) c.map.maxPoints = 5000;
    if (c.map.maxPerVillage == null) c.map.maxPerVillage = 20;
    if (c.map.delay == null) c.map.delay = 500;
    if (c.map.onlyBarbarians == null) c.map.onlyBarbarians = true;
    (c.targets || []).forEach((t) => { if (!t.origin) { t.origin = CUR_VID; t.originName = CUR_NAME; } });
    return c;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(config)); }

  let config = load();
  let sendTimer = null, scavTimer = null, farmTimer = null, wallTimer = null, recruitTimer = null, fakeTimer = null, marketTimer = null, buildTimer = null, bbTimer = null, mapTimer = null, uiTimer = null;
  function anyRunning() { return config.running || (config.scav && config.scav.running) || (config.farm && config.farm.running) || (config.wall && config.wall.running) || (config.recruit && config.recruit.running) || (config.fakes && config.fakes.running) || (config.market && config.market.running) || (config.build && config.build.running) || (config.bb && config.bb.running) || (config.map && config.map.running); }
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
      const iconOk = (el) => !!(el && !el.classList.contains('farm_icon_disabled') && !el.classList.contains('start_locked'));
      const aEnabled = iconOk(tr.querySelector('.farm_icon_a'));
      const bEnabled = iconOk(tr.querySelector('.farm_icon_b'));
      const dotImg = tr.querySelector('img[src*="/dots/"]');
      const dm2 = dotImg ? (dotImg.getAttribute('src') || '').match(/dots\/(\w+)\./) : null;
      const color = dm2 ? dm2[1] : '';                                  // green | yellow | red | blue
      const mlImg = tr.querySelector('img[src*="/max_loot/"]');
      const mm = mlImg ? (mlImg.getAttribute('src') || '').match(/max_loot\/(\d)/) : null;
      const full = mm ? (mm[1] === '1') : false;                        // true = cheio, false = vazio
      rows.push({ targetId: targetId, reportId: reportId, wood: nums[0] || 0, stone: nums[1] || 0, iron: nums[2] || 0, wall: wall, dist: dist, cEnabled: cEnabled, aEnabled: aEnabled, bEnabled: bEnabled, color: color, full: full, coord: coord });
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
  // Relatório: true se o defensor tem tropa (usado p/ pular azul com defesa)
  async function getReportDefenders(reportId) {
    try {
      const res = await fetch('/game.php?village=' + CUR_VID + '&screen=report&view=' + reportId, { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const tbl = doc.querySelector('#attack_info_def_units') || doc.querySelector('#attack_spy_away') || doc.querySelector('#attack_info_def');
      if (tbl) { const cells = tbl.querySelectorAll('td.unit-item, .unit-item'); for (const c of cells) { if ((parseInt((c.textContent || '').replace(/\D/g, ''), 10) || 0) > 0) return true; } return false; }
      const txt = (doc.querySelector('#content_value') || doc.body).textContent.replace(/\s+/g, ' ');
      if (/Defensor:\s*---/.test(txt)) return false;
    } catch (e) {}
    return false;
  }
  async function farmTick() {
    clearTimeout(farmTimer);
    if (!config.farm.running) return;
    if (lockOther()) { farmTimer = setTimeout(farmTick, 5000); return; }
    claimLock();
    const now = Date.now();
    if ((config.farm.nextAt || 0) > now) { scheduleFarm(); return; }
    const cfg = config.farm;
    let villages;
    try {
      if (cfg.group) { villages = (await getVillagesInGroup(cfg.group)).map((x) => ({ vid: x.vid, name: x.coord || x.vid })); try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
      else villages = await getAllScavengeState();
    } catch (e) { pushLog('Saque: erro ao listar aldeias: ' + (e.message || e), 'err'); cfg.nextAt = now + 120000; save(); scheduleFarm(); return; }
    const minW = cfg.minWood || 0, minS = cfg.minStone || 0, minI = cfg.minIron || 0;
    const maxDist = cfg.maxDist != null ? cfg.maxDist : 13;
    const maxWall = cfg.maxWall != null ? cfg.maxWall : 20;
    const delayBase = cfg.mode === 'agressivo' ? 200 : 500;
    const cooldownMs = Math.max(0, cfg.cooldownMin || 0) * 60000;
    const minCL = cfg.minCL || 0, dyn = !!cfg.dynTemplate, M = cfg.matrix || {};
    const sent = cfg.sentReports || {}, defended = cfg.defended || {};
    const cellFor = (t) => {
      if (t.color === 'red') return null;
      if (t.color === 'blue') return M.blue;
      if (t.color === 'green') return t.full ? M.greenFull : M.greenEmpty;
      if (t.color === 'yellow') return t.full ? M.yellowFull : M.yellowEmpty;
      return null;
    };
    let count = 0;
    for (const v of villages) {
      if (minCL > 0) { try { if (((await getVillageState(v.vid)).avail.light || 0) < minCL) { pushLog('  ' + v.name + ': < ' + minCL + ' CL — pulada.'); continue; } } catch (e) {} }
      let tpl = null;
      if (!dyn) { try { tpl = await getFarmTemplates(v.vid); } catch (e) { tpl = null; } }
      let targets;
      try { targets = await getFarmTargets(v.vid); }
      catch (e) { pushLog('Saque ' + v.name + ': erro ao ler alvos: ' + (e.message || e), 'err'); continue; }
      const skip = { norep: 0, off: 0, red: 0, azul: 0, def: 0, dist: 0, mur: 0, cd: 0 };
      const eligible = [];
      targets.forEach((t) => {
        if (!t.reportId) { skip.norep++; return; }
        if (t.color === 'red') { skip.red++; return; }
        if (t.dist != null && t.dist > maxDist) { skip.dist++; return; }
        if (t.wall != null && t.wall > maxWall) { skip.mur++; return; }
        if (sent[t.reportId] && (now - sent[t.reportId] < cooldownMs)) { skip.cd++; return; }
        const cell = cellFor(t);
        if (!cell || ((cell.a || 0) <= 0 && (cell.b || 0) <= 0 && !cell.c)) { skip.off++; return; }
        if (t.color === 'blue' && (t.wall == null || t.wall > 0)) { skip.azul++; return; }
        t._cell = cell; eligible.push(t);
      });
      if ((cfg.order || 'dist') === 'recurso') eligible.sort((a, b) => (b.wood + b.stone + b.iron) - (a.wood + a.stone + a.iron));
      else eligible.sort((a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist));
      let vSent = 0, exhausted = false;
      for (const t of eligible) {
        if (exhausted) break;
        if (t.color === 'blue') {
          if (defended[t.reportId]) { skip.def++; continue; }
          let hasDef = false; try { hasDef = await getReportDefenders(t.reportId); } catch (e) {}
          if (hasDef) { defended[t.reportId] = now; skip.def++; continue; }
        }
        const cell = t._cell, cm = (t.coord || '').match(/(\d+)\|(\d+)/), sum = (t.wood || 0) + (t.stone || 0) + (t.iron || 0);
        const hasAB = (cell.a || 0) > 0 || (cell.b || 0) > 0;
        let did = false, cSent = false;
        try {
          // C tem prioridade sobre A/B quando ambos marcados na mesma célula: só cai pro A/B se o C não estiver disponível pro alvo.
          if (cell.c && t.cEnabled && t.wood >= minW && t.stone >= minS && t.iron >= minI) {
            await sendFarmC(v.vid, t.reportId); did = true; cSent = true; count++; await sleep(delayBase + Math.floor(Math.random() * 250));
          }
          if (!cSent && hasAB) {
            if ((cell.a || 0) > 0 && (dyn || t.aEnabled)) {
              for (let k = 0; k < cell.a; k++) {
                if (dyn) { if (!cm) break; await sendAttack(v.vid, cm[1], cm[2], { light: Math.max(1, Math.ceil(sum / 80)), spy: 1 }); }
                else { if (!tpl || !tpl.a) break; await sendFarmB(v.vid, t.targetId, tpl.a); }
                did = true; count++; await sleep(delayBase + Math.floor(Math.random() * 250));
              }
            }
            if ((cell.b || 0) > 0 && (dyn || t.bEnabled)) {
              for (let k = 0; k < cell.b; k++) {
                if (dyn) { if (!cm) break; await sendAttack(v.vid, cm[1], cm[2], { light: Math.max(1, Math.ceil(sum * 1.2 / 80)), spy: 1 }); }
                else { if (!tpl || !tpl.b) break; await sendFarmB(v.vid, t.targetId, tpl.b); }
                did = true; count++; await sleep(delayBase + Math.floor(Math.random() * 250));
              }
            }
          }
        } catch (e) { exhausted = true; pushLog('Saque ' + v.name + ': envio falhou/esgotou → próxima aldeia.'); }
        if (did) { sent[t.reportId] = now; vSent++; pushLog('Saque · ' + v.name + ' → ' + t.coord + ' [' + t.color + (t.full ? ' cheio' : ' vazio') + ']' + (cSent ? ' C' : ' a' + (cell.a || 0) + ' b' + (cell.b || 0)), 'ok'); }
      }
      const parts = ['✓' + vSent];
      if (exhausted) parts.push('esgotou');
      if (skip.off) parts.push('cor-off ' + skip.off);
      if (skip.red) parts.push('vermelho ' + skip.red);
      if (skip.azul) parts.push('azul-muro ' + skip.azul);
      if (skip.def) parts.push('azul-def ' + skip.def);
      if (skip.dist) parts.push('dist> ' + skip.dist);
      if (skip.mur) parts.push('mur> ' + skip.mur);
      if (skip.cd) parts.push('cooldown ' + skip.cd);
      if (skip.norep) parts.push('s/relat ' + skip.norep);
      pushLog('  ' + v.name + ': ' + parts.join(' · '));
    }
    Object.keys(sent).forEach((r) => { if (now - sent[r] > 12 * 3600 * 1000) delete sent[r]; });
    Object.keys(defended).forEach((r) => { if (now - defended[r] > 12 * 3600 * 1000) delete defended[r]; });
    cfg.sentReports = sent; cfg.defended = defended;
    cfg.nextAt = now + Math.max(60, cfg.interval || 600) * 1000;
    save();
    pushLog('Saque: ciclo concluído · ' + count + ' envio(s). Próximo em ' + Math.round((cfg.interval || 600) / 60) + ' min.', 'ok');
    scheduleFarm();
  }
  function scheduleFarm() { clearTimeout(farmTimer); if (!config.farm.running) return; farmTimer = setTimeout(farmTick, Math.min(Math.max((config.farm.nextAt || 0) - Date.now(), 1000), 60000)); }
  async function wallTick() {
    clearTimeout(wallTimer);
    if (!config.wall.running) return;
    if (lockOther()) { wallTimer = setTimeout(wallTick, 5000); return; }
    claimLock();
    const now = Date.now();
    if ((config.wall.nextAt || 0) > now) { scheduleWall(); return; }
    let villages;
    try { villages = await getAllScavengeState(); }
    catch (e) { pushLog('Quebra-muralha: erro ao listar aldeias: ' + (e.message || e), 'err'); config.wall.nextAt = now + 120000; save(); scheduleWall(); return; }
    const wMin = config.wall.wallMin != null ? config.wall.wallMin : 1;
    const wMax = config.wall.wallMax != null ? config.wall.wallMax : 6;
    const axeN = Math.max(1, config.wall.axeCount || 80);
    const delay = Math.max(0, config.farm.delay != null ? config.farm.delay : 500);
    const demo = config.wall.sentDemo || {};
    const COOLDOWN = 6 * 3600 * 1000;   // não re-manda no mesmo report por 6h
    let count = 0;
    for (const v of villages) {
      let targets;
      try { targets = await getFarmTargets(v.vid); }
      catch (e) { pushLog('Quebra ' + v.name + ': erro ao ler alvos: ' + (e.message || e), 'err'); continue; }
      let avail; try { avail = (await getVillageState(v.vid)).avail; } catch (e) { avail = {}; }
      const eligible = []; const skip = { semmuro: 0, fora: 0, jaenv: 0 };
      targets.forEach((t) => {
        if (!t.reportId) return;
        if (t.wall == null) { skip.semmuro++; return; }                 // sem info de muralha -> deixa pro C ou próximo scan
        if (t.wall < wMin || t.wall > wMax) { skip.fora++; return; }      // fora da faixa de muro do quebra
        if (demo[t.reportId] && (now - demo[t.reportId] < COOLDOWN)) { skip.jaenv++; return; }
        eligible.push(t);
      });
      eligible.sort((a, b) => (b.wall || 0) - (a.wall || 0));             // muralhas maiores primeiro
      let vSent = 0, semRam = 0, semBB = false;
      for (let i = 0; i < eligible.length; i++) {
        const t = eligible[i];
        const cm = (t.coord || '').match(/(\d+)\|(\d+)/); if (!cm) continue;
        let rams;
        if (config.wall.ramMode === 'fixo') rams = Math.max(1, config.wall.ramFixed || 20);
        else rams = ramsForWall(t.wall, config.wall.ramWall6 || 24);
        if ((avail.axe || 0) < axeN) { semBB = true; break; }             // sem bárbaro nesta aldeia -> próxima
        if ((avail.ram || 0) < rams) { semRam++; continue; }              // sem aríete p/ esse muro -> tenta outro alvo
        const spies = Math.min(config.wall.spyCount || 1, avail.spy || 0);
        const amounts = { axe: axeN, ram: rams }; if (spies > 0) amounts.spy = spies;
        try {
          await sendAttack(v.vid, cm[1], cm[2], amounts);
          avail.axe -= axeN; avail.ram -= rams; avail.spy = (avail.spy || 0) - spies;
          demo[t.reportId] = now; count++; vSent++;
          pushLog('Quebra-muralha · ' + v.name + ' → ' + t.coord + ' [bb ' + axeN + ', ar ' + rams + (spies ? ', ex ' + spies : '') + ' · muro ' + t.wall + ']', 'ok');
          if (i < eligible.length - 1) await sleep(delay + Math.floor(Math.random() * 250));
        } catch (e) { pushLog('Quebra ' + v.name + ' → ' + t.coord + ': ' + (e.message || e), 'err'); }
      }
      const parts = ['✓' + vSent];
      if (semBB) parts.push('s/bárbaro');
      if (semRam) parts.push('s/aríete ' + semRam);
      if (skip.fora) parts.push('fora-faixa ' + skip.fora);
      if (skip.semmuro) parts.push('s/info-muro ' + skip.semmuro);
      if (skip.jaenv) parts.push('já enviado ' + skip.jaenv);
      pushLog('  ' + v.name + ': ' + parts.join(' · '));
    }
    Object.keys(demo).forEach((r) => { if (now - demo[r] > 12 * 3600 * 1000) delete demo[r]; });
    config.wall.sentDemo = demo;
    config.wall.nextAt = now + Math.max(60, config.wall.interval || 600) * 1000;
    save();
    pushLog('Quebra-muralha: ciclo concluído · ' + count + ' ataque(s). Próximo em ' + Math.round((config.wall.interval || 600) / 60) + ' min.', 'ok');
    scheduleWall();
  }
  function scheduleWall() { clearTimeout(wallTimer); if (!config.wall.running) return; wallTimer = setTimeout(wallTick, Math.min(Math.max((config.wall.nextAt || 0) - Date.now(), 1000), 60000)); }

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
    [['twmgr-r-gatk', config.recruit.groupAtk], ['twmgr-r-gdef', config.recruit.groupDef], ['twmgr-bb-group', config.bb.group], ['twmgr-bm-group', config.map && config.map.group], ['twmgr-farm-group', config.farm && config.farm.group]].forEach(([id, cur]) => {
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

  // ==================== MÓDULO BB (aldeias bárbaras conquistadas) ====================
  // Constrói a ladder BB, abastece JIT das aldeias grandes próximas, e ao graduar (EP+estábulo) recruta CL sozinho.
  async function feedBB(v, needCost, sources, srcState) {
    let ms; try { ms = await getMarketState(v.vid); } catch (e) { return false; }
    if (!ms.storage) return false;
    const free = { wood: Math.max(0, ms.storage - ms.wood), stone: Math.max(0, ms.storage - ms.stone), iron: Math.max(0, ms.storage - ms.iron) };
    const target = {
      wood: Math.max(0, Math.min((needCost.wood || 0) - ms.wood, free.wood)),
      stone: Math.max(0, Math.min((needCost.stone || 0) - ms.stone, free.stone)),
      iron: Math.max(0, Math.min((needCost.iron || 0) - ms.iron, free.iron)),
    };
    if (target.wood + target.stone + target.iron <= 0) return false;
    const cm = (v.coord || '').match(/(\d+)\|(\d+)/); if (!cm) return false;
    const vx = +cm[1], vy = +cm[2];
    const near = sources.map((s) => { const c = s.coord.match(/(\d+)\|(\d+)/); return c ? { s, d: Math.sqrt(Math.pow(+c[1] - vx, 2) + Math.pow(+c[2] - vy, 2)) } : null; })
      .filter((o) => o && o.d <= (config.bb.feedMaxDist || 15)).sort((a, b) => a.d - b.d);
    let sent = false;
    for (const o of near) {
      if (target.wood + target.stone + target.iron <= 0) break;
      const s = o.s;
      let ss = srcState[s.vid];
      if (!ss) { try { ss = srcState[s.vid] = await getMarketState(s.vid); } catch (e) { srcState[s.vid] = { capacity: 0 }; continue; } }
      if (!ss.capacity || !ss.storage) continue;
      const reserve = (config.bb.feedReserve || 40) / 100 * ss.storage;
      const avail = { wood: Math.max(0, ss.wood - reserve), stone: Math.max(0, ss.stone - reserve), iron: Math.max(0, ss.iron - reserve) };
      let amt = { wood: Math.min(target.wood, avail.wood), stone: Math.min(target.stone, avail.stone), iron: Math.min(target.iron, avail.iron) };
      let tot = amt.wood + amt.stone + amt.iron;
      if (tot <= 0) continue;
      if (tot > ss.capacity) { const f = ss.capacity / tot; amt = { wood: Math.floor(amt.wood * f), stone: Math.floor(amt.stone * f), iron: Math.floor(amt.iron * f) }; }
      if (amt.wood + amt.stone + amt.iron <= 0) continue;
      try {
        await sendMarketResources(s.vid, v.coord, amt);
        sent = true;
        pushLog('BB abastece · ' + s.coord + ' → ' + v.coord + ' [' + amt.wood + '/' + amt.stone + '/' + amt.iron + ']', 'ok');
        ss.wood -= amt.wood; ss.stone -= amt.stone; ss.iron -= amt.iron; ss.capacity -= (amt.wood + amt.stone + amt.iron);
        target.wood -= amt.wood; target.stone -= amt.stone; target.iron -= amt.iron;
      } catch (e) { /* alvo/erro -> tenta próxima fonte */ }
      await sleep(250);
    }
    return sent;
  }
  async function bbTick() {
    clearTimeout(bbTimer);
    if (!config.bb.running) return;
    if (lockOther()) { bbTimer = setTimeout(bbTick, 5000); return; }
    claimLock();
    const now = Date.now();
    if ((config.bb.nextAt || 0) > now) { scheduleBB(); return; }
    if (!config.bb.group) { pushLog('BB: selecione o grupo BB na aba.'); config.bb.nextAt = now + 300000; save(); scheduleBB(); return; }
    let vils;
    try { vils = await getVillagesInGroup(config.bb.group); }
    catch (e) { pushLog('BB: erro ao ler grupo: ' + (e.message || e), 'err'); config.bb.nextAt = now + 120000; save(); scheduleBB(); return; }
    try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {}
    if (!vils.length) { pushLog('BB: grupo vazio (adicione as aldeias conquistadas ao grupo BB).'); config.bb.nextAt = now + 300000; save(); scheduleBB(); return; }
    const tpl = parseTpl(config.bb.tpl);
    const defSet = {}; ((config.bb.defCoords || '').match(/\d{1,3}\|\d{1,3}/g) || []).forEach((c) => defSet[c] = 1);
    const bbSet = {}; vils.forEach((v) => bbSet[v.vid] = 1);
    let allV = []; try { allV = await getAllVillages(); } catch (e) {}
    const sources = allV.filter((v) => !bbSet[v.vid] && v.coord);
    const srcState = {};
    let built = 0, recruited = 0, fed = 0;
    for (const v of vils) {
      let st;
      try { st = await getBuildState(v.vid); }
      catch (e) { pushLog('BB ' + (v.coord || v.vid) + ': erro estado', 'err'); continue; }
      const r = computeBuild(st, tpl);
      if (r.build && st.queueLen < (config.bb.maxQueue || 5)) {
        try { await enqueueBuild(v.vid, r.build.b); built++; pushLog('BB obra · ' + (v.coord || v.vid) + ' → ' + r.build.b + ' [' + r.build.cost.wood + '/' + r.build.cost.stone + '/' + r.build.cost.iron + ']', 'ok'); }
        catch (e) { pushLog('BB obra ' + (v.coord || v.vid) + ': ' + (e.message || e), 'err'); }
      }
      const grad = (st.level.main || 0) >= (config.bb.gradMain || 20) && (st.level.stable || 0) >= (config.bb.gradStable || 15);
      if (grad) {
        const tag = defSet[v.coord] ? 'def' : 'atk';
        try {
          const rs = await getRecruitState(v.vid);
          const rc = computeRecruit(rs, config.recruit.profiles[tag].targets, config.recruit, rs.queuedSec);
          if (Object.keys(rc.amounts).length) {
            await sendRecruit(v.vid, rc.amounts); recruited++;
            pushLog('BB recruta · ' + (v.coord || v.vid) + ' [' + tag + '] ' + Object.entries(rc.amounts).map((e) => e[0] + ':' + e[1]).join(' '), 'ok');
          } else if (rs.units.light && !rs.units.light.reqMet) {
            pushLog('BB ' + (v.coord || v.vid) + ': cav.leve não pesquisada — pesquise no ferreiro.', 'err');
          }
        } catch (e) { pushLog('BB recruta ' + (v.coord || v.vid) + ': ' + (e.message || e), 'err'); }
      }
      if (r.demand) { try { if (await feedBB(v, r.demand.cost, sources, srcState)) fed++; } catch (e) {} }
      await sleep(300);
    }
    config.bb.nextAt = now + Math.max(60, config.bb.interval || 600) * 1000; save();
    pushLog('BB: ciclo ok · obra ' + built + ' · recruta ' + recruited + ' · abastec ' + fed + '. Próximo em ' + Math.round((config.bb.interval || 600) / 60) + ' min.', 'ok');
    scheduleBB();
  }
  function scheduleBB() { clearTimeout(bbTimer); if (!config.bb.running) return; bbTimer = setTimeout(bbTick, Math.min(Math.max((config.bb.nextAt || 0) - Date.now(), 1000), 60000)); }
  function readBBCfg() {
    const c = config.bb, g = (id) => document.getElementById(id);
    if (g('twmgr-bb-group')) c.group = g('twmgr-bb-group').value || null;
    if (g('twmgr-bb-tpl')) c.tpl = g('twmgr-bb-tpl').value;
    if (g('twmgr-bb-def')) c.defCoords = g('twmgr-bb-def').value;
    if (g('twmgr-bb-reserve')) c.feedReserve = Math.max(0, Math.min(90, parseInt(g('twmgr-bb-reserve').value, 10) || 40));
    if (g('twmgr-bb-dist')) c.feedMaxDist = Math.max(1, parseInt(g('twmgr-bb-dist').value, 10) || 15);
    if (g('twmgr-bb-max')) c.maxQueue = Math.max(1, parseInt(g('twmgr-bb-max').value, 10) || 5);
    if (g('twmgr-bb-int')) c.interval = Math.max(1, parseInt(g('twmgr-bb-int').value, 10) || 10) * 60;
    save();
  }
  function setBBStatus(on) { setBtnState('twmgr-bb-start', 'twmgr-bb-stop', on, '● BB ativo', '▶ Iniciar BB'); }
  function bbStart() {
    readBBCfg();
    if (!config.bb.group) { pushLog('BB: selecione o grupo BB primeiro.', 'err'); return; }
    if (!config.recruit.profiles.atk.targets || !Object.keys(config.recruit.profiles.atk.targets).length) pushLog('BB: dica — configure os alvos ATK/DEF na aba Recrutar (o BB usa eles ao graduar).');
    config.bb.running = true; config.bb.nextAt = 0; save();
    setBBStatus(true); pushLog('Módulo BB iniciado · grupo ' + config.bb.group, 'ok'); bbTick();
  }
  function bbStop() { readBBCfg(); config.bb.running = false; save(); clearTimeout(bbTimer); setBBStatus(false); pushLog('Módulo BB parado.'); }

  // ==================== ASSISTENTE DE SAQUE: TEMPLATE B ====================
  // Descobre o template_id do B (e as unidades) direto do am_farm; envia via o endpoint
  // oficial do assistente pra manter o alvo listado com relatório fresco.
  let _farmTplCache = null, _farmTplCacheAt = 0;
  async function getFarmTemplates(vid, force) {
    const now = Date.now();
    if (!force && _farmTplCache && (now - _farmTplCacheAt < 30 * 60 * 1000)) return _farmTplCache;
    const res = await fetch('/game.php?village=' + vid + '&screen=am_farm', { credentials: 'include' });
    const html = await res.text();
    if (/^\s*<!doctype|^\s*<html/i.test(html.slice(0, 60)) && html.length < 2000) {
      throw new Error('am_farm devolveu página curta (sessão expirada?)');
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = { a: null, b: null, unitsA: {}, unitsB: {}, debug: [] };

    // Estratégia 1: IDs dos ícones farm_icon_a / farm_icon_b (data-attr ou onclick)
    const iconId = (cls) => {
      for (const el of doc.querySelectorAll('.' + cls + ', a.' + cls)) {
        const d = el.getAttribute('data-template-id') || (el.dataset && el.dataset.templateId);
        if (d && /^\d+$/.test(d)) return { id: d, src: 'icon-data' };
        const oc = el.getAttribute('onclick') || '';
        const m = oc.match(/sendUnits\s*\(\s*(?:this|\d+|['\"][a-z]+['\"])\s*,\s*(\d+)/i);
        if (m) return { id: m[1], src: 'icon-onclick' };
      }
      return null;
    };
    const iconA = iconId('farm_icon_a');
    const iconB = iconId('farm_icon_b');
    if (iconA) { out.a = iconA.id; out.debug.push('A via ' + iconA.src); }
    if (iconB) { out.b = iconB.id; out.debug.push('B via ' + iconB.src); }

    // Estratégia 2: forms de configuração com input[name="template_id"] (ordem A, B)
    const orderedIds = [];
    doc.querySelectorAll('input[name="template_id"]').forEach((inp) => {
      const v = (inp.value || '').trim();
      if (/^\d+$/.test(v) && orderedIds.indexOf(v) === -1) orderedIds.push(v);
    });
    if (!out.a && orderedIds[0]) { out.a = orderedIds[0]; out.debug.push('A via forms'); }
    if (!out.b && orderedIds[1]) { out.b = orderedIds[1]; out.debug.push('B via forms'); }

    // Estratégia 3: inline JS Accountmanager.farm.templates = [...]
    if (!out.a || !out.b) {
      const m = html.match(/templates\s*[:=]\s*(\[[\s\S]{0,4000}?\])/);
      if (m) {
        try {
          const parsed = JSON.parse(m[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
          if (Array.isArray(parsed) && parsed.length) {
            if (!out.a && parsed[0] && parsed[0].id) { out.a = String(parsed[0].id); out.debug.push('A via inline JS'); }
            if (!out.b && parsed[1] && parsed[1].id) { out.b = String(parsed[1].id); out.debug.push('B via inline JS'); }
            if (parsed[0] && parsed[0].units) out.unitsA = Object.assign({}, out.unitsA, parsed[0].units);
            if (parsed[1] && parsed[1].units) out.unitsB = Object.assign({}, out.unitsB, parsed[1].units);
          }
        } catch (e) { /* JSON não parseável */ }
      }
    }

    // Extrai unidades dos forms de configuração de cada template
    doc.querySelectorAll('form').forEach((form) => {
      const tplInp = form.querySelector('input[name="template_id"]');
      if (!tplInp) return;
      const id = (tplInp.value || '').trim();
      if (!/^\d+$/.test(id)) return;
      const bucket = id === out.a ? out.unitsA : id === out.b ? out.unitsB : null;
      if (!bucket) return;
      UNITS.forEach((p) => {
        const inp = form.querySelector('input[name="' + p[0] + '"]');
        if (!inp) return;
        const n = parseInt(inp.value, 10);
        if (n > 0) bucket[p[0]] = n;
      });
    });

    _farmTplCache = out; _farmTplCacheAt = now;
    return out;
  }
  async function sendFarmB(srcVid, tgtVid, tplBId) {
    const b = new URLSearchParams();
    b.set('target', String(tgtVid));
    b.set('template_id', String(tplBId));
    b.set('source_village', String(srcVid));
    b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + srcVid + '&screen=am_farm&mode=farm&ajaxaction=farm&h=' + CSRF, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'TribalWars-Ajax': '1', 'X-Requested-With': 'XMLHttpRequest' },
      body: b.toString(),
    });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    const err = j && (j.error || (j.response && j.response.error));
    if (err) throw new Error(Array.isArray(err) ? err.join('; ') : String(err));
    if (!j) {
      // Servidor não retornou JSON — provável falha (HTML de login, alvo inválido, etc.)
      throw new Error('assistente: resposta não-JSON (' + (txt || '').slice(0, 60).replace(/\s+/g, ' ') + ')');
    }
    return true;
  }

  // ==================== BÁRBAROS DO MAPA (BM) ====================
  // Varre /map/village.txt, detecta bárbaros no range (padrão 20 campos), envia "ataque B"
  // (composição configurável) pra alvos NUNCA atacados ou há mais de N dias.
  let _mapVillagesCache = null, _mapVillagesCacheAt = 0;
  async function getMapVillages(forceRefresh) {
    const now = Date.now();
    if (!forceRefresh && _mapVillagesCache && (now - _mapVillagesCacheAt < 6 * 3600 * 1000)) return _mapVillagesCache;
    const res = await fetch('/map/village.txt', { credentials: 'include' });
    const txt = await res.text();
    if (/^\s*<!doctype|^\s*<html/i.test(txt.slice(0, 60))) throw new Error('village.txt retornou HTML (sessão expirada ou bloqueio)');
    const arr = [];
    txt.split('\n').forEach((line) => {
      const f = line.split(',');
      if (f.length < 5) return;   // toleramos linhas curtas de mundos antigos
      const vid = (f[0] || '').trim(), x = parseInt(f[2], 10), y = parseInt(f[3], 10);
      const pts = parseInt(f[5] || '0', 10);
      if (!vid || isNaN(x) || isNaN(y)) return;
      let name = ''; try { name = decodeURIComponent((f[1] || '').replace(/\+/g, ' ')); } catch (e) { name = f[1] || ''; }
      arr.push({ vid: vid, x: x, y: y, player: (f[4] || '0').trim(), points: isNaN(pts) ? 0 : pts, name: name });
    });
    _mapVillagesCache = arr; _mapVillagesCacheAt = now;
    return arr;
  }
  function fieldDist(x1, y1, x2, y2) { return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)); }
  function mapUnitsTotal(units) { let t = 0; UNITS.forEach((p) => { t += (units[p[0]] || 0); }); return t; }
  function mapUnitsDesc(units) { return UNITS.filter((p) => (units[p[0]] || 0) > 0).map((p) => p[0] + '=' + units[p[0]]).join(', ') || '(vazio)'; }

  async function mapPlanTargets() {
    const cfg = config.map;
    let allV;
    try { allV = await getMapVillages(); }
    catch (e) { pushLog('BM: erro ao ler village.txt: ' + (e.message || e), 'err'); return null; }
    const barb = allV.filter((v) => (!cfg.onlyBarbarians || v.player === '0') && v.points >= (cfg.minPoints || 0) && v.points <= (cfg.maxPoints || 99999));
    let mine;
    try {
      if (cfg.group) { const list = await getVillagesInGroup(cfg.group); mine = list.map((v) => ({ vid: v.vid, coord: v.coord, name: v.coord })); }
      else { const list = await getAllVillages(); mine = list.map((v) => ({ vid: v.vid, coord: v.coord, name: v.name })); }
    } catch (e) { pushLog('BM: erro ao ler minhas aldeias: ' + (e.message || e), 'err'); return null; }
    if (cfg.group) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
    const myV = [];
    mine.forEach((v) => { const cm = (v.coord || '').match(/(\d+)\|(\d+)/); if (cm) myV.push({ vid: v.vid, name: v.name || v.coord, coord: v.coord, x: +cm[1], y: +cm[2] }); });
    const now = Date.now();
    const staleMs = Math.max(0, (cfg.minDaysSinceScout || 0)) * 86400000;
    const sentAt = cfg.sentAt || {};
    // Claim: cada bárbaro é atribuído à aldeia MINHA mais próxima que ainda tem cota (maxPerVillage).
    // Assim evitamos que a mesma aldeia minha sature os N primeiros bárbaros e sobre 0 pras outras.
    const candByOrigin = {}; myV.forEach((s) => candByOrigin[s.vid] = []);
    const pairs = [];
    for (const b of barb) {
      const last = sentAt[b.vid] || 0;
      if (last && staleMs > 0 && (now - last) < staleMs) continue;
      let best = null;
      for (const s of myV) {
        const d = fieldDist(s.x, s.y, b.x, b.y);
        if (d > (cfg.maxDist || 20)) continue;
        if (!best || d < best.dist) best = { src: s, dist: d };
      }
      if (best) pairs.push({ src: best.src, dist: best.dist, target: { vid: b.vid, x: b.x, y: b.y, coord: b.x + '|' + b.y, points: b.points, name: b.name, lastAt: last } });
    }
    pairs.sort((a, b) => a.dist - b.dist);
    const limit = Math.max(1, cfg.maxPerVillage || 20);
    for (const p of pairs) {
      const arr = candByOrigin[p.src.vid];
      if (arr.length >= limit) continue;
      arr.push({ vid: p.target.vid, x: p.target.x, y: p.target.y, coord: p.target.coord, points: p.target.points, name: p.target.name, lastAt: p.target.lastAt, dist: p.dist });
    }
    const plan = myV.map((s) => ({ src: s, targets: candByOrigin[s.vid] || [] }));
    return { myV: myV, plan: plan, barbCount: barb.length, totalCandidates: pairs.length };
  }

  async function mapTick() {
    clearTimeout(mapTimer);
    if (!config.map.running) return;
    if (lockOther()) { mapTimer = setTimeout(mapTick, 5000); return; }
    claimLock();
    const now = Date.now();
    const cfg = config.map;
    const spyCount = Math.max(1, cfg.spyCount || 1);
    const reserve = Math.max(0, cfg.spyReserve || 0);
    const plan = await mapPlanTargets();
    if (!plan) { cfg.running = false; save(); setMapStatus(false); return; }
    cfg.lastPreview = plan.plan.flatMap((p) => p.targets.map((t) => ({ src: p.src.coord, srcName: p.src.name, coord: t.coord, dist: Math.round(t.dist * 10) / 10, pts: t.points, name: t.name, lastAt: t.lastAt }))).slice(0, 500);
    save(); renderMapPreview();
    const totalPlanned = plan.plan.reduce((a, p) => a + p.targets.length, 0);
    pushLog('Mapeamento: ' + plan.myV.length + ' aldeia(s) · ' + plan.barbCount + ' bárbaro(s) após filtro · ' + totalPlanned + ' planejado(s) · ' + spyCount + ' spy/alvo · reserva ' + reserve, 'ok');
    const delay = Math.max(0, cfg.delay != null ? cfg.delay : 500);
    let sentTotal = 0;
    for (const p of plan.plan) {
      if (!p.targets.length) continue;
      let state;
      try { state = await getVillageState(p.src.vid); }
      catch (e) { pushLog('Mapeamento: erro estado ' + p.src.name + ': ' + (e.message || e), 'err'); continue; }
      const avail = state.avail;
      const busy = {};
      (state.commands || []).forEach((c) => { if (c.coord && (c.kind === 'attack' || c.kind === 'return')) busy[c.coord] = 1; });
      let vSent = 0, semSpy = 0, ocup = 0;
      for (const t of p.targets) {
        if (busy[t.coord]) { ocup++; continue; }
        if ((avail.spy || 0) - reserve < spyCount) { semSpy++; continue; }
        try {
          await sendAttack(p.src.vid, String(t.x), String(t.y), { spy: spyCount });
          avail.spy = (avail.spy || 0) - spyCount;
          cfg.sentAt[t.vid] = Date.now();
          vSent++; sentTotal++;
          pushLog('Mapeamento · ' + p.src.name + ' → ' + t.coord + ' [' + spyCount + ' spy] · d ' + (Math.round(t.dist * 10) / 10) + (t.points ? (' · ' + t.points + 'pts') : ''), 'ok');
          if (delay) await sleep(delay + Math.floor(Math.random() * 200));
        } catch (e) { pushLog('Mapeamento ' + p.src.name + ' → ' + t.coord + ': ' + (e.message || e), 'err'); }
      }
      const parts = ['✓' + vSent];
      if (semSpy) parts.push('s/spy(reserva) ' + semSpy);
      if (ocup) parts.push('c/ataque ' + ocup);
      pushLog('  ' + p.src.name + ' (' + p.src.coord + '): ' + parts.join(' · '));
    }
    Object.keys(cfg.sentAt).forEach((k) => { if (now - cfg.sentAt[k] > 30 * 86400000) delete cfg.sentAt[k]; });
    cfg.running = false;   // ONE-SHOT: termina e PARA (rodar de novo = clicar Iniciar)
    save();
    setMapStatus(false);
    pushLog('Mapeamento: concluído · ' + sentTotal + ' exploração(ões) enviada(s). Clique Iniciar pra rodar de novo.', 'ok');
  }
  function scheduleMap() { clearTimeout(mapTimer); if (!config.map.running) return; mapTimer = setTimeout(mapTick, Math.min(Math.max((config.map.nextAt || 0) - Date.now(), 1000), 60000)); }

  async function mapPreview() {
    readMapCfg();
    showTab('log');
    pushLog('BM: === Diagnóstico + Prévia ===', 'ok');
    // 1. village.txt
    let all = null;
    try {
      all = await getMapVillages();
      const barbAll = all.filter((v) => v.player === '0');
      pushLog('  Mundo: ' + all.length + ' aldeias · ' + barbAll.length + ' bárbaras (arquivo /map/village.txt)');
      if (all.length < 200) pushLog('  ⚠ village.txt trouxe pouca coisa — servidor pode ter limitado ou sessão expirou.', 'err');
    } catch (e) { pushLog('  village.txt: ERRO ' + (e.message || e), 'err'); return; }
    // 2. plano
    const plan = await mapPlanTargets();
    if (!plan) return;
    config.map.lastPreview = plan.plan.flatMap((p) => p.targets.map((t) => ({ src: p.src.coord, srcName: p.src.name, coord: t.coord, dist: Math.round(t.dist * 10) / 10, pts: t.points, name: t.name, lastAt: t.lastAt }))).slice(0, 500);
    save(); renderMapPreview();
    const tot = plan.plan.reduce((a, p) => a + p.targets.length, 0);
    pushLog('  Filtro pts (' + config.map.minPoints + '–' + config.map.maxPoints + '): ' + plan.barbCount + ' bárbaros');
    pushLog('  Minhas aldeias: ' + plan.myV.length + (config.map.group ? (' (grupo ' + config.map.group + ')') : ' (todas)'));
    pushLog('  Candidatos no range ' + config.map.maxDist + ' campos · ≥' + config.map.minDaysSinceScout + 'd sem scout: ' + plan.totalCandidates);
    pushLog('  Planejados neste ciclo (cota ' + config.map.maxPerVillage + '/aldeia): ' + tot, tot > 0 ? 'ok' : 'err');
    if (tot === 0 && plan.myV.length > 0 && all) {
      const barbs = all.filter((b) => b.player === '0');
      let minD = Infinity;
      plan.myV.forEach((s) => { barbs.forEach((b) => { const d = fieldDist(s.x, s.y, b.x, b.y); if (d < minD) minD = d; }); });
      if (isFinite(minD)) pushLog('  Dica: o bárbaro mais próximo está a ' + (Math.round(minD * 10) / 10) + ' campos. Aumente "Distância máx." acima disso pra alcançar.');
    }
    showTab('map');
  }
  function renderMapPreview() {
    const box = document.getElementById('twmgr-bm-list'); if (!box) return;
    const list = config.map.lastPreview || [];
    const cnt = document.getElementById('twmgr-bm-count'); if (cnt) cnt.textContent = list.length;
    if (!list.length) { box.innerHTML = '<div style="color:#8f7d57;text-align:center;padding:8px;font-size:10px">— nenhum alvo detectado —</div>'; return; }
    const now = Date.now();
    box.innerHTML =
      '<div style="display:grid;grid-template-columns:60px 34px 44px 1fr 44px;gap:4px;padding:3px 4px;border-bottom:1px solid #4a3b28;font-size:9px;color:#e8d29a;font-weight:600"><span>alvo</span><span style="text-align:right">d</span><span style="text-align:right">pts</span><span>de</span><span style="text-align:right">últ.</span></div>' +
      list.slice(0, 200).map((t) => {
        const last = t.lastAt ? (Math.round((now - t.lastAt) / 86400000) + 'd') : 'novo';
        return '<div style="display:grid;grid-template-columns:60px 34px 44px 1fr 44px;gap:4px;padding:2px 4px;border-bottom:1px solid rgba(255,255,255,.04);font-size:10px;color:#cdbb92"><span style="color:#ffd76a">' + esc(t.coord) + '</span><span style="text-align:right">' + t.dist + '</span><span style="text-align:right">' + (t.pts || 0) + '</span><span style="color:#8f7d57;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="de ' + esc(t.srcName || '') + '">' + esc(t.src) + '</span><span style="text-align:right;color:' + (t.lastAt ? '#8f7d57' : '#8fe39a') + '">' + last + '</span></div>';
      }).join('');
  }
  function readMapCfg() {
    const c = config.map, g = (id) => document.getElementById(id);
    if (g('twmgr-bm-group')) c.group = g('twmgr-bm-group').value || null;
    if (g('twmgr-bm-dist')) c.maxDist = Math.max(1, parseFloat((g('twmgr-bm-dist').value || '').replace(',', '.')) || 20);
    if (g('twmgr-bm-days')) c.minDaysSinceScout = Math.max(0, parseFloat((g('twmgr-bm-days').value || '').replace(',', '.')) || 2);
    if (g('twmgr-bm-minpts')) c.minPoints = Math.max(0, parseInt(g('twmgr-bm-minpts').value, 10) || 0);
    if (g('twmgr-bm-maxpts')) c.maxPoints = Math.max(1, parseInt(g('twmgr-bm-maxpts').value, 10) || 5000);
    if (g('twmgr-bm-maxper')) c.maxPerVillage = Math.max(1, parseInt(g('twmgr-bm-maxper').value, 10) || 20);
    if (g('twmgr-bm-reserve')) c.spyReserve = Math.max(0, parseInt(g('twmgr-bm-reserve').value, 10) || 0);
    if (g('twmgr-bm-spy')) c.spyCount = Math.max(1, parseInt(g('twmgr-bm-spy').value, 10) || 1);
    if (g('twmgr-bm-delay')) { const v = parseInt(g('twmgr-bm-delay').value, 10); c.delay = (isNaN(v) || v < 0) ? 500 : v; }
    save();
  }
  function setMapStatus(on) { setBtnState('twmgr-bm-start', 'twmgr-bm-stop', on, '● Mapeando', '▶ Iniciar'); }
  function mapStart() {
    readMapCfg();
    config.map.running = true; config.map.nextAt = 0; save();
    setMapStatus(true);
    showTab('log');
    pushLog('Mapeamento iniciado · dist ≤' + config.map.maxDist + ' · ' + config.map.spyCount + ' spy/alvo · reserva ' + config.map.spyReserve + ' · ≥' + config.map.minDaysSinceScout + 'd sem scout', 'ok');
    mapTick();
  }
  function mapStop() { readMapCfg(); config.map.running = false; save(); clearTimeout(mapTimer); setMapStatus(false); pushLog('Mapeamento parado.'); }
  async function mapRefreshCache() { _mapVillagesCache = null; try { const v = await getMapVillages(true); pushLog('Mapeamento: mapa recarregado — ' + v.length + ' aldeias no mundo (' + v.filter((x) => x.player === '0').length + ' bárbaras).', 'ok'); } catch (e) { pushLog('Mapeamento: recarregar falhou: ' + (e.message || e), 'err'); } }

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
    const ws = document.getElementById('twmgr-wall-status'); if (ws) { if (!config.wall.running) { ws.textContent = ''; } else if (lockOther()) { ws.textContent = '⏸ outra aba está ativa'; ws.style.color = '#ff7568'; } else { ws.style.color = '#8fe39a'; ws.textContent = (config.wall.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.wall.nextAt - now) : '● quebrando…'; } }
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
    const bb = document.getElementById('twmgr-bb-status'); if (bb) {
      if (!config.bb.running) { bb.textContent = ''; }
      else if (lockOther()) { bb.textContent = '⏸ outra aba'; bb.style.color = '#ff7568'; }
      else { bb.style.color = '#8fe39a'; bb.textContent = (config.bb.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.bb.nextAt - now) : '● desenvolvendo…'; }
    }
    const bm = document.getElementById('twmgr-bm-status'); if (bm) {
      if (!config.map || !config.map.running) { bm.textContent = ''; }
      else if (lockOther()) { bm.textContent = '⏸ outra aba'; bm.style.color = '#ff7568'; }
      else { bm.style.color = '#8fe39a'; bm.textContent = (config.map.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.map.nextAt - now) : '● rastreando…'; }
    }
    const ring = (id, on) => { const b = document.getElementById(id); if (b) b.classList.toggle('twmgr-run', !!on && !lockOther()); };
    ring('twmgr-btab-bb', config.bb && config.bb.running);
    ring('twmgr-btab-map', config.map && config.map.running);
    ring('twmgr-btab-scav', config.scav.running);
    ring('twmgr-btab-farm', config.farm.running);
    ring('twmgr-btab-wall', config.wall && config.wall.running);
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
    const md = document.getElementById('twmgr-farm-mode'); if (md) config.farm.mode = md.value || 'suave';
    const gp = document.getElementById('twmgr-farm-group'); if (gp) config.farm.group = gp.value || null;
    const cd = document.getElementById('twmgr-farm-cooldown'); if (cd) { config.farm.cooldownMin = parseInt(cd.value, 10); if (isNaN(config.farm.cooldownMin) || config.farm.cooldownMin < 0) config.farm.cooldownMin = 10; }
    const mc = document.getElementById('twmgr-farm-mincl'); if (mc) config.farm.minCL = Math.max(0, parseInt(mc.value, 10) || 0);
    const od = document.getElementById('twmgr-farm-order'); if (od) config.farm.order = od.value || 'dist';
    const dy = document.getElementById('twmgr-farm-dyn'); if (dy) config.farm.dynTemplate = dy.checked;
    if (!config.farm.matrix) config.farm.matrix = defFarmMatrix();
    ['greenEmpty', 'greenFull', 'yellowEmpty', 'yellowFull', 'blue'].forEach((k) => {
      const a = document.getElementById('twmgr-fm-' + k + '-a'), b = document.getElementById('twmgr-fm-' + k + '-b'), c = document.getElementById('twmgr-fm-' + k + '-c');
      if (a && b && c) config.farm.matrix[k] = { a: Math.max(0, parseInt(a.value, 10) || 0), b: Math.max(0, parseInt(b.value, 10) || 0), c: c.checked };
    });
    save();
  }
  function farmStart() { readFarmCfg(); config.farm.running = true; config.farm.nextAt = 0; save(); setFarmStatus(true); pushLog('Saque iniciado (FarmGod A/B/C) · modo ' + config.farm.mode + ' · ordem ' + config.farm.order + (config.farm.dynTemplate ? ' · template dinâmico' : ''), 'ok'); farmTick(); }
  function farmStop() { readFarmCfg(); config.farm.running = false; save(); clearTimeout(farmTimer); setFarmStatus(false); pushLog('Saque parado.'); }
  function setFarmStatus(on) { setBtnState('twmgr-farm-start', 'twmgr-farm-stop', on, '● Saqueando', '▶ Saquear'); }
  function readWallCfg() {
    const wn = document.getElementById('twmgr-wall-min'); if (wn) { config.wall.wallMin = parseInt(wn.value, 10); if (isNaN(config.wall.wallMin)) config.wall.wallMin = 1; }
    const wx = document.getElementById('twmgr-wall-max'); if (wx) { config.wall.wallMax = parseInt(wx.value, 10); if (isNaN(config.wall.wallMax)) config.wall.wallMax = 6; }
    const wm = document.getElementById('twmgr-wall-mode'); if (wm) config.wall.ramMode = wm.value || 'auto';
    const wa = document.getElementById('twmgr-wall-axe'); if (wa) config.wall.axeCount = Math.max(1, parseInt(wa.value, 10) || 80);
    const w6 = document.getElementById('twmgr-wall-ramw6'); if (w6) config.wall.ramWall6 = Math.max(1, parseInt(w6.value, 10) || 24);
    const wf = document.getElementById('twmgr-wall-ramfix'); if (wf) config.wall.ramFixed = Math.max(1, parseInt(wf.value, 10) || 20);
    const wi = document.getElementById('twmgr-wall-int'); if (wi) config.wall.interval = Math.max(1, parseInt(wi.value, 10) || 10) * 60;
    save();
  }
  function wallStart() { readWallCfg(); config.wall.running = true; config.wall.nextAt = 0; save(); setWallStatus(true); pushLog('Quebra-muralha iniciado · muro ' + config.wall.wallMin + '–' + config.wall.wallMax + ' · bb ' + config.wall.axeCount + ' · aríete ' + config.wall.ramMode + (config.wall.ramMode === 'fixo' ? ' ' + config.wall.ramFixed : ' (m6=' + config.wall.ramWall6 + ')') + ' · a cada ' + Math.round(config.wall.interval / 60) + ' min', 'ok'); wallTick(); }
  function wallStop() { readWallCfg(); config.wall.running = false; save(); clearTimeout(wallTimer); setWallStatus(false); pushLog('Quebra-muralha parado.'); }
  function setWallStatus(on) { setBtnState('twmgr-wall-start', 'twmgr-wall-stop', on, '● Quebrando', '▶ Quebrar'); }
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
      "#twmgr-panel{position:fixed;top:12px;right:12px;z-index:99999;width:340px;max-height:calc(100vh - 24px);display:flex;flex-direction:column;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#e9dcc2;background:linear-gradient(160deg,#2a2016,#201810);border:1px solid #b8912e;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.6);overflow:hidden}",
      "#twmgr-panel *{box-sizing:border-box}",
      "#twmgr-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;cursor:move;background:linear-gradient(90deg,#6e5015,#9a721c 55%,#caa031);color:#fff;border-bottom:1px solid #8a6a20}",
      "#twmgr-head .twmgr-title{font-weight:700;font-size:12px;letter-spacing:.3px;display:flex;align-items:center;gap:6px}",
      "#twmgr-head .twmgr-ver{font-weight:400;font-size:8px;opacity:.75}",
      "#twmgr-head-actions{flex:0 0 auto;display:flex;align-items:center;gap:7px}",
      "#twmgr-min{cursor:pointer;font-size:17px;line-height:1;padding:0 2px;opacity:.85}#twmgr-min:hover{opacity:1}",
      "#twmgr-logbtn,#twmgr-upd-btn{cursor:pointer;font-size:13px;line-height:1;padding:2px 3px;border-radius:5px;opacity:.85;position:relative;transition:.15s}",
      "#twmgr-logbtn:hover,#twmgr-upd-btn:hover{opacity:1;background:rgba(255,255,255,.14)}",
      "#twmgr-upd-badge{position:absolute;top:-3px;right:-2px;color:#ff5a5a;font-size:9px}",
      ".twmgr-tabs{flex:0 0 auto;display:flex;flex-wrap:nowrap;overflow-x:auto;background:#1a140d;border-bottom:1px solid #3a2e1b;scrollbar-width:thin}",
      ".twmgr-tab{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:5px 1px;cursor:pointer;color:#a2926c;border-bottom:2px solid transparent;transition:.15s}",
      ".twmgr-tab:hover{color:#e8d29a;background:rgba(212,175,55,.06)}",
      ".twmgr-tab.active{color:#ffe08a;border-bottom-color:#d4af37;background:rgba(212,175,55,.10)}",
      ".twmgr-tab-ico{font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;border:2px solid transparent;transition:.2s}",
      ".twmgr-tab-lbl{font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}",
      ".twmgr-tab.twmgr-run .twmgr-tab-ico{border-color:#3fce54;background:rgba(63,206,84,.15);box-shadow:0 0 9px rgba(63,206,84,.6)}",
      ".twmgr-ui{width:18px;height:18px;vertical-align:middle}",
      ".twmgr-btn.on{box-shadow:0 0 12px rgba(76,200,90,.85),inset 0 0 0 1px rgba(255,255,255,.3)}",
      ".twmgr-btn.dim{opacity:.4 !important;filter:grayscale(.5);cursor:default}",
      "#twmgr-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:11px 12px 12px}",
      "#twmgr-body::-webkit-scrollbar{width:9px}#twmgr-body::-webkit-scrollbar-thumb{background:#4a3a22;border-radius:4px}#twmgr-body::-webkit-scrollbar-track{background:#1a140d}",
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
    ['scav', 'farm', 'wall', 'recruit', 'fakes', 'market', 'build', 'bb', 'map', 'log'].forEach((n) => {
      const c = document.getElementById('twmgr-tab-' + n); if (c) c.style.display = n === name ? 'block' : 'none';
      const b = document.getElementById('twmgr-btab-' + n); if (b) b.classList.toggle('active', n === name);
    });
  }

  function buildUI() {
    injectStyles();
    const p = document.createElement('div'); p.id = 'twmgr-panel';
    const tabBtn = (n, ico, label) => '<div id="twmgr-btab-' + n + '" class="twmgr-tab" data-tab="' + n + '"><span class="twmgr-tab-ico">' + ico + '</span><span class="twmgr-tab-lbl">' + label + '</span></div>';
    const fmRow = (k, label) => '<tr><td style="text-align:left;padding:1px 4px">' + label + '</td><td style="text-align:center"><input id="twmgr-fm-' + k + '-a" class="twmgr-inp" type="number" min="0" value="0" style="width:42px"></td><td style="text-align:center"><input id="twmgr-fm-' + k + '-b" class="twmgr-inp" type="number" min="0" value="0" style="width:42px"></td><td style="text-align:center"><input id="twmgr-fm-' + k + '-c" type="checkbox"></td></tr>';
    p.innerHTML =
      '<div id="twmgr-head"><span class="twmgr-title">🎯 TW Manager <span class="twmgr-ver">v' + VERSION + '</span></span><div id="twmgr-head-actions"><span id="twmgr-dot" class="twmgr-dot" title="algum módulo ativo"></span><span id="twmgr-logbtn" title="Log">📜</span><span id="twmgr-upd-btn" title="Verificar / instalar atualização">🔄<span id="twmgr-upd-badge" style="display:none">●</span></span><span id="twmgr-min" title="minimizar / restaurar">–</span></div></div>' +
      '<div class="twmgr-tabs">' + tabBtn('scav', '⛏️', 'Coletas') + tabBtn('farm', '🐎', 'Saque') + tabBtn('wall', '🐏', 'Muralha') + tabBtn('recruit', '🏹', 'Recrutar') + tabBtn('fakes', '🎭', 'Fakes') + tabBtn('market', '🏪', 'Mercado') + tabBtn('build', '🏗️', 'Edifícios') + tabBtn('bb', '🌱', 'Cultivo') + tabBtn('map', '🗺️', 'Mapa') + '</div>' +
      '<div id="twmgr-body">' +
      '<div id="twmgr-tab-scav" style="display:none"><div class="twmgr-hint">Coleta em <b>todas as suas aldeias</b>: distribui as tropas marcadas entre as opções livres e reenvia no retorno.</div><div class="twmgr-units">' + SCAV_UNITS.map(([u, n]) => '<label><input id="twmgr-su-' + u + '" type="checkbox"> ' + unitIcon(u, n) + ' ' + n + '</label>').join('') + '</div><div class="twmgr-actions"><button id="twmgr-scav-start" class="twmgr-btn twmgr-go">▶ Coletar</button><button id="twmgr-scav-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div><div id="twmgr-scav-status" class="twmgr-cstatus"></div></div>' +
      '<div id="twmgr-tab-farm" style="display:none"><div class="twmgr-hint">Saque estilo <b>FarmGod</b>: envia A/B/C por <b>cor</b> do relatório. A/B = nº de comandos por alvo (0 = ignora). C usa o relatório e respeita o recurso mínimo — se C e A/B estiverem marcados na mesma célula, <b>C tem prioridade</b> (só manda A/B se o C não estiver disponível pro alvo). Vermelho nunca; azul só se muralha 0 e sem defensor.</div><div class="twmgr-row"><span class="twmgr-lbl">Modo</span><select id="twmgr-farm-mode" class="twmgr-inp" style="width:120px"><option value="agressivo">Agressivo</option><option value="suave">Suave</option></select></div><div class="twmgr-row"><span class="twmgr-lbl">Grupo de aldeias</span><select id="twmgr-farm-group" class="twmgr-inp" style="width:150px"></select></div><table style="width:100%;border-collapse:collapse;margin:6px 0;font-size:11px"><tr><th style="text-align:left">Ataques por cor</th><th>A</th><th>B</th><th>C</th></tr>' + fmRow('greenEmpty', '🟢 verde vazio') + fmRow('greenFull', '🟢 verde cheio') + fmRow('yellowEmpty', '🟡 amarelo vazio') + fmRow('yellowFull', '🟡 amarelo cheio') + fmRow('blue', '🔵 azul (só muro 0)') + '</table><label class="twmgr-check"><input id="twmgr-farm-dyn" type="checkbox"> Template dinâmico (A=mín, B=+20% da carga)</label><div class="twmgr-lbl" style="margin:6px 0 3px">Recurso mínimo (só p/ o C)</div><div class="twmgr-res"><label><span class="icon header wood"></span><input id="twmgr-farm-wood" class="twmgr-inp" type="number" min="0" value="1000"></label><label><span class="icon header stone"></span><input id="twmgr-farm-stone" class="twmgr-inp" type="number" min="0" value="1000"></label><label><span class="icon header iron"></span><input id="twmgr-farm-iron" class="twmgr-inp" type="number" min="0" value="1000"></label></div><div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-farm-dist" class="twmgr-inp" type="number" min="0" step="0.1" value="13" style="width:66px"></div><div class="twmgr-row"><span class="twmgr-lbl">Muralha máx. (nível)</span><input id="twmgr-farm-wall" class="twmgr-inp" type="number" min="0" max="20" value="20" style="width:66px"></div><div class="twmgr-row"><span class="twmgr-lbl">Tempo entre farms (min)</span><input id="twmgr-farm-cooldown" class="twmgr-inp" type="number" min="0" value="10" style="width:66px"></div><div class="twmgr-row"><span class="twmgr-lbl">Mínimo CL p/ farmar</span><input id="twmgr-farm-mincl" class="twmgr-inp" type="number" min="0" value="0" style="width:66px"></div><div class="twmgr-row"><span class="twmgr-lbl">Ordem de farm</span><select id="twmgr-farm-order" class="twmgr-inp" style="width:130px"><option value="dist">Por distância</option><option value="recurso">Por recurso</option></select></div><div class="twmgr-row"><span class="twmgr-lbl">Intervalo (min)</span><input id="twmgr-farm-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div><div class="twmgr-actions"><button id="twmgr-farm-start" class="twmgr-btn twmgr-go">▶ Saquear</button><button id="twmgr-farm-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div><div id="twmgr-farm-status" class="twmgr-cstatus"></div></div>' +
      '<div id="twmgr-tab-wall" style="display:none"><div class="twmgr-hint">🐏 Manda bárbaro + aríete + 1 explorador nas aldeias <b>com muralha</b> (do assistente de saque) pra derrubar o muro. O explorador re-escaneia e mantém o relatório fresco. Roda em paralelo ao Saque, independente.</div><div class="twmgr-row"><span class="twmgr-lbl">Muralha de/até (nível)</span><span><input id="twmgr-wall-min" class="twmgr-inp" type="number" min="1" max="20" value="1" style="width:44px"> a <input id="twmgr-wall-max" class="twmgr-inp" type="number" min="1" max="20" value="6" style="width:44px"></span></div><div class="twmgr-row"><span class="twmgr-lbl">Bárbaro por ataque</span><input id="twmgr-wall-axe" class="twmgr-inp" type="number" min="1" value="80" style="width:66px"></div><div class="twmgr-row"><span class="twmgr-lbl">Aríete</span><select id="twmgr-wall-mode" class="twmgr-inp" style="width:130px"><option value="auto">auto (pela muralha)</option><option value="fixo">fixo</option></select></div><div id="twmgr-wall-auto"><div class="twmgr-row"><span class="twmgr-lbl">Aríetes p/ muralha 6</span><input id="twmgr-wall-ramw6" class="twmgr-inp" type="number" min="1" value="24" style="width:66px"></div><div style="font-size:9px;color:#8f7d57;margin-bottom:6px">calibra o resto: muro5≈18 · 4≈13 · 3≈9 · 2≈5 · 1≈3</div></div><div id="twmgr-wall-fixo" style="display:none"><div class="twmgr-row"><span class="twmgr-lbl">Aríetes por ataque (fixo)</span><input id="twmgr-wall-ramfix" class="twmgr-inp" type="number" min="1" value="20" style="width:66px"></div></div><div class="twmgr-row"><span class="twmgr-lbl">Intervalo (min)</span><input id="twmgr-wall-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div><div class="twmgr-actions"><button id="twmgr-wall-start" class="twmgr-btn twmgr-go">▶ Quebrar</button><button id="twmgr-wall-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div><div id="twmgr-wall-status" class="twmgr-cstatus"></div></div>' +
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
      '<div id="twmgr-tab-bb" style="display:none">' +
      '<div class="twmgr-hint">🐗 Desenvolve aldeias de <b>bárbaro conquistadas</b>: constrói a ladder, <b>abastece</b> das aldeias grandes próximas (JIT, sem sobra) e ao <b>graduar</b> (EP≥20 + estábulo≥15) começa a recrutar CL sozinho.</div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Grupo BB</span><select id="twmgr-bb-group" class="twmgr-inp" style="width:150px"></select></div>' +
      '<div style="text-align:right;margin-bottom:2px"><button id="twmgr-bb-reload" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">↻ grupos</button></div>' +
      '<div style="font-size:11px;color:#e8d29a;margin:2px 0">Ladder de obra (chave nível, em ordem)</div>' +
      '<textarea id="twmgr-bb-tpl" class="twmgr-inp" style="width:100%;height:96px;font-family:monospace;font-size:10px"></textarea>' +
      '<div style="font-size:11px;color:#e8d29a;margin:4px 0 2px">Aldeias DEF (coords, 1 por linha) — o resto vira ATK</div>' +
      '<textarea id="twmgr-bb-def" class="twmgr-inp" style="width:100%;height:44px;font-family:monospace;font-size:10px" placeholder="ex: 470|592"></textarea>' +
      '<div class="twmgr-row" style="margin-top:6px"><span class="twmgr-lbl">Reserva na fonte (%)</span><input id="twmgr-bb-reserve" class="twmgr-inp" type="number" min="0" max="90" value="40" style="width:56px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Dist. máx. fonte (campos)</span><input id="twmgr-bb-dist" class="twmgr-inp" type="number" min="1" value="15" style="width:56px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Máx na fila</span><input id="twmgr-bb-max" class="twmgr-inp" type="number" min="1" value="5" style="width:56px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo (min)</span><input id="twmgr-bb-int" class="twmgr-inp" type="number" min="1" value="10" style="width:56px"></div>' +
      '<div class="twmgr-actions"><button id="twmgr-bb-start" class="twmgr-btn twmgr-go">▶ Iniciar BB</button><button id="twmgr-bb-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
      '<div id="twmgr-bb-status" class="twmgr-cstatus"></div>' +
      '</div>' +
      '<div id="twmgr-tab-map" style="display:none">' +
      '<div class="twmgr-hint">🗺️ Envia <b>exploradores</b> pros <b>bárbaros</b> do mapa ainda não escaneados (ou há +N dias), saindo da aldeia mais próxima com spy acima da reserva. Roda <b>uma vez e para</b> — clique Iniciar de novo pra rodar outra vez.</div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Grupo origem (vazio = todas)</span><select id="twmgr-bm-group" class="twmgr-inp" style="width:130px"></select></div>' +
      '<div style="text-align:right;margin-bottom:2px"><button id="twmgr-bm-reload" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">↻ grupos</button> <button id="twmgr-bm-refmap" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="recarrega /map/village.txt">↻ mapa</button></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-bm-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="20" style="width:66px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Sem escanear há (dias)</span><input id="twmgr-bm-days" class="twmgr-inp" type="number" min="0" step="0.5" value="2" style="width:66px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Pontos de/até</span><span><input id="twmgr-bm-minpts" class="twmgr-inp" type="number" min="0" value="26" style="width:56px"> a <input id="twmgr-bm-maxpts" class="twmgr-inp" type="number" min="1" value="5000" style="width:56px"></span></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Máx alvos por aldeia/ciclo</span><input id="twmgr-bm-maxper" class="twmgr-inp" type="number" min="1" value="20" style="width:66px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Reserva de spy (guardar/aldeia)</span><input id="twmgr-bm-reserve" class="twmgr-inp" type="number" min="0" value="30" style="width:66px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Spy por alvo</span><input id="twmgr-bm-spy" class="twmgr-inp" type="number" min="1" value="1" style="width:66px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Delay entre envios (ms)</span><input id="twmgr-bm-delay" class="twmgr-inp" type="number" min="0" step="100" value="500" style="width:66px"></div>' +
      '<div class="twmgr-actions"><button id="twmgr-bm-preview" class="twmgr-btn twmgr-ghost">💡 Prévia</button><button id="twmgr-bm-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-bm-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
      '<div id="twmgr-bm-status" class="twmgr-cstatus"></div>' +
      '<div style="margin-top:8px;font-size:11px;color:#e8d29a">Alvos detectados: <b id="twmgr-bm-count">0</b></div>' +
      '<div id="twmgr-bm-list" style="max-height:220px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:8px;margin-top:4px"></div>' +
      '</div>' +
      '<div id="twmgr-tab-log" style="display:none"><div id="twmgr-log" class="twmgr-log"></div></div>' +
      '</div>';
    document.body.appendChild(p);

    document.getElementById('twmgr-logbtn').addEventListener('click', () => showTab('log'));

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
    document.getElementById('twmgr-farm-mode').value = config.farm.mode || 'suave';
    document.getElementById('twmgr-farm-cooldown').value = config.farm.cooldownMin != null ? config.farm.cooldownMin : 10;
    document.getElementById('twmgr-farm-mincl').value = config.farm.minCL != null ? config.farm.minCL : 0;
    document.getElementById('twmgr-farm-order').value = config.farm.order || 'dist';
    document.getElementById('twmgr-farm-dyn').checked = !!config.farm.dynTemplate;
    (function () { const M = config.farm.matrix || defFarmMatrix(); ['greenEmpty', 'greenFull', 'yellowEmpty', 'yellowFull', 'blue'].forEach((k) => { const c = M[k] || {}; const a = document.getElementById('twmgr-fm-' + k + '-a'), b = document.getElementById('twmgr-fm-' + k + '-b'), cc = document.getElementById('twmgr-fm-' + k + '-c'); if (a) a.value = c.a || 0; if (b) b.value = c.b || 0; if (cc) cc.checked = !!c.c; }); })();
    document.getElementById('twmgr-farm-start').addEventListener('click', farmStart);
    document.getElementById('twmgr-farm-stop').addEventListener('click', farmStop);
    ['twmgr-farm-wood', 'twmgr-farm-stone', 'twmgr-farm-iron', 'twmgr-farm-dist', 'twmgr-farm-wall', 'twmgr-farm-int', 'twmgr-farm-mode', 'twmgr-farm-group', 'twmgr-farm-cooldown', 'twmgr-farm-mincl', 'twmgr-farm-order', 'twmgr-farm-dyn'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readFarmCfg); });
    ['greenEmpty', 'greenFull', 'yellowEmpty', 'yellowFull', 'blue'].forEach((k) => { ['-a', '-b', '-c'].forEach((s) => { const el = document.getElementById('twmgr-fm-' + k + s); if (el) el.addEventListener('change', readFarmCfg); }); });
    setFarmStatus(config.farm.running);

    document.getElementById('twmgr-wall-min').value = config.wall.wallMin != null ? config.wall.wallMin : 1;
    document.getElementById('twmgr-wall-max').value = config.wall.wallMax != null ? config.wall.wallMax : 6;
    document.getElementById('twmgr-wall-axe').value = config.wall.axeCount != null ? config.wall.axeCount : 80;
    document.getElementById('twmgr-wall-mode').value = config.wall.ramMode || 'auto';
    document.getElementById('twmgr-wall-ramw6').value = config.wall.ramWall6 != null ? config.wall.ramWall6 : 24;
    document.getElementById('twmgr-wall-ramfix').value = config.wall.ramFixed != null ? config.wall.ramFixed : 20;
    document.getElementById('twmgr-wall-int').value = Math.round((config.wall.interval || 600) / 60);
    const applyWallMode = () => { const m = document.getElementById('twmgr-wall-mode').value; document.getElementById('twmgr-wall-auto').style.display = m === 'auto' ? 'block' : 'none'; document.getElementById('twmgr-wall-fixo').style.display = m === 'fixo' ? 'block' : 'none'; };
    document.getElementById('twmgr-wall-mode').addEventListener('change', () => { applyWallMode(); readWallCfg(); });
    applyWallMode();
    document.getElementById('twmgr-wall-start').addEventListener('click', wallStart);
    document.getElementById('twmgr-wall-stop').addEventListener('click', wallStop);
    ['twmgr-wall-min', 'twmgr-wall-max', 'twmgr-wall-axe', 'twmgr-wall-ramw6', 'twmgr-wall-ramfix', 'twmgr-wall-int'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readWallCfg); });
    setWallStatus(config.wall.running);

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

    document.getElementById('twmgr-bb-tpl').value = config.bb.tpl || BB_TPL;
    document.getElementById('twmgr-bb-def').value = config.bb.defCoords || '';
    document.getElementById('twmgr-bb-reserve').value = config.bb.feedReserve != null ? config.bb.feedReserve : 40;
    document.getElementById('twmgr-bb-dist').value = config.bb.feedMaxDist != null ? config.bb.feedMaxDist : 15;
    document.getElementById('twmgr-bb-max').value = config.bb.maxQueue || 5;
    document.getElementById('twmgr-bb-int').value = Math.round((config.bb.interval || 600) / 60);
    ['twmgr-bb-group', 'twmgr-bb-tpl', 'twmgr-bb-def', 'twmgr-bb-reserve', 'twmgr-bb-dist', 'twmgr-bb-max', 'twmgr-bb-int'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readBBCfg); });
    document.getElementById('twmgr-bb-reload').addEventListener('click', fillGroupSelects);
    document.getElementById('twmgr-bb-start').addEventListener('click', bbStart);
    document.getElementById('twmgr-bb-stop').addEventListener('click', bbStop);
    setBBStatus(config.bb.running);

    // Bárbaros do Mapa (BM)
    document.getElementById('twmgr-bm-dist').value = config.map.maxDist != null ? config.map.maxDist : 20;
    document.getElementById('twmgr-bm-days').value = config.map.minDaysSinceScout != null ? config.map.minDaysSinceScout : 2;
    document.getElementById('twmgr-bm-minpts').value = config.map.minPoints != null ? config.map.minPoints : 26;
    document.getElementById('twmgr-bm-maxpts').value = config.map.maxPoints != null ? config.map.maxPoints : 5000;
    document.getElementById('twmgr-bm-maxper').value = config.map.maxPerVillage != null ? config.map.maxPerVillage : 20;
    document.getElementById('twmgr-bm-reserve').value = config.map.spyReserve != null ? config.map.spyReserve : 30;
    document.getElementById('twmgr-bm-spy').value = config.map.spyCount != null ? config.map.spyCount : 1;
    document.getElementById('twmgr-bm-delay').value = config.map.delay != null ? config.map.delay : 500;
    ['twmgr-bm-group', 'twmgr-bm-dist', 'twmgr-bm-days', 'twmgr-bm-minpts', 'twmgr-bm-maxpts', 'twmgr-bm-maxper', 'twmgr-bm-reserve', 'twmgr-bm-spy', 'twmgr-bm-delay'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readMapCfg); });
    document.getElementById('twmgr-bm-reload').addEventListener('click', fillGroupSelects);
    document.getElementById('twmgr-bm-refmap').addEventListener('click', mapRefreshCache);
    document.getElementById('twmgr-bm-preview').addEventListener('click', mapPreview);
    document.getElementById('twmgr-bm-start').addEventListener('click', mapStart);
    document.getElementById('twmgr-bm-stop').addEventListener('click', mapStop);
    setMapStatus(config.map.running);
    renderMapPreview();

    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.getAttribute('data-tab'))));
    const applyCollapsed = () => { p.classList.toggle('twmgr-collapsed', !!config.uiMin); const mb = document.getElementById('twmgr-min'); if (mb) mb.textContent = config.uiMin ? '＋' : '–'; };
    document.getElementById('twmgr-min').addEventListener('click', (e) => { e.stopPropagation(); config.uiMin = !config.uiMin; save(); applyCollapsed(); });
    document.getElementById('twmgr-upd-btn').addEventListener('click', (e) => { e.stopPropagation(); if (updateInfo.hasUpdate) doUpdate(); else checkForUpdate(true); });
    const lastCheck = Number(localStorage.getItem(KEY + '_lastUpdCheck') || 0);
    if (Date.now() - lastCheck > 3600000) checkForUpdate(false);
    setInterval(() => checkForUpdate(false), 3600000);
    applyCollapsed();
    makeDraggable(p, document.getElementById('twmgr-head'));

    showTab('farm');
    renderLog();
    setStatus(config.running);
    uiTimer = setInterval(tickUI, 1000);

    if (anyRunning() && lockOther()) pushLog('Outra aba já está ativa; esta ficará em espera.', 'err');
    if (config.running) { if (!lockOther()) pushLog('Auto-ATK retomado.', 'ok'); processDue(); }
    if (config.scav.running) { if (!lockOther()) pushLog('Coleta retomada.', 'ok'); scheduleScav(); }
    if (config.farm.running) { if (!lockOther()) pushLog('Saque retomado.', 'ok'); scheduleFarm(); }
    if (config.wall.running) { if (!lockOther()) pushLog('Quebra-muralha retomado.', 'ok'); scheduleWall(); }
    if (config.recruit.running) { if (!lockOther()) pushLog('Recrutar retomado.', 'ok'); scheduleRecruit(); }
    if (config.fakes.running) { config.fakes.gen.forEach((f) => { if (f.state === 'scheduled') f.state = 'armed'; }); if (!lockOther()) pushLog('Fakes rearmados.', 'ok'); fakeTick(); }
    if (config.market.running) { if (!lockOther()) pushLog('Cunhagem retomada.', 'ok'); scheduleMarket(); }
    if (config.build.running) { if (!lockOther()) pushLog('Edifícios retomado.', 'ok'); scheduleBuild(); }
    if (config.bb && config.bb.running) { if (!lockOther()) pushLog('Módulo BB retomado.', 'ok'); scheduleBB(); }
    if (config.map && config.map.running) { if (!lockOther()) pushLog('Bárbaros Mapa retomado.', 'ok'); scheduleMap(); }
  }

  function makeDraggable(panel, handle) {
    let sx, sy, ox, oy, drag = false;
    handle.addEventListener('mousedown', (e) => { if (e.target.closest('#twmgr-min,#twmgr-logbtn,#twmgr-upd-btn')) return; drag = true; sx = e.clientX; sy = e.clientY; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; panel.style.right = 'auto'; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => { if (!drag) return; panel.style.left = (ox + e.clientX - sx) + 'px'; panel.style.top = (oy + e.clientY - sy) + 'px'; });
    document.addEventListener('mouseup', () => { drag = false; });
  }

  buildUI();
})();
