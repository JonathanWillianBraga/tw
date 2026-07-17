// ==UserScript==
// @name         Tribal Wars Manager
// @namespace    tw-manager
// @version      9.45.0
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

  // Stats canônicos do Tribal Wars — usado pra calcular força off/def e pop ocupada por tropa.
  const UNIT_STATS = {
    spear:    { att: 10,  def: 15,  defCav: 45,  defArch: 20,  pop: 1 },
    sword:    { att: 25,  def: 50,  defCav: 15,  defArch: 40,  pop: 1 },
    axe:      { att: 40,  def: 10,  defCav: 5,   defArch: 10,  pop: 1 },
    archer:   { att: 15,  def: 50,  defCav: 40,  defArch: 5,   pop: 1 },
    spy:      { att: 0,   def: 2,   defCav: 1,   defArch: 2,   pop: 2 },
    light:    { att: 130, def: 30,  defCav: 40,  defArch: 30,  pop: 4 },
    marcher:  { att: 120, def: 40,  defCav: 30,  defArch: 50,  pop: 5 },
    heavy:    { att: 150, def: 200, defCav: 80,  defArch: 180, pop: 6 },
    ram:      { att: 2,   def: 20,  defCav: 50,  defArch: 20,  pop: 5 },
    catapult: { att: 30,  def: 100, defCav: 50,  defArch: 100, pop: 8 },
    knight:   { att: 150, def: 250, defCav: 400, defArch: 150, pop: 10 },
    snob:     { att: 30,  def: 100, defCav: 50,  defArch: 100, pop: 100 },
  };

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
  const BUILD_META = {
    main:       { name: 'Ed. principal', ico: '🏛️', max: 30 },
    barracks:   { name: 'Quartel',       ico: '⚔️', max: 25 },
    stable:     { name: 'Estábulo',      ico: '🐴', max: 20 },
    garage:     { name: 'Oficina',       ico: '⚙️', max: 15 },
    watchtower: { name: 'Torre de vigia',ico: '🔭', max: 20 },
    snob:       { name: 'Academia',      ico: '👑', max: 3  },
    smith:      { name: 'Ferreiro',      ico: '⚒️', max: 20 },
    place:      { name: 'Praça reunião', ico: '🚩', max: 1  },
    statue:     { name: 'Estátua',       ico: '🗿', max: 1  },
    market:     { name: 'Mercado',       ico: '🏪', max: 25 },
    wood:       { name: 'Bosque',        ico: '🌲', max: 30 },
    stone:      { name: 'Poço argila',   ico: '🪨', max: 30 },
    iron:       { name: 'Mina ferro',    ico: '⛏️', max: 30 },
    farm:       { name: 'Fazenda',       ico: '🌾', max: 30 },
    storage:    { name: 'Armazém',       ico: '📦', max: 30 },
    hide:       { name: 'Esconderijo',   ico: '🕳️', max: 10 },
    wall:       { name: 'Muralha',       ico: '🧱', max: 20 },
  };
  const tplToPlan = (text) => (text || '').split('\n').map((l) => l.trim().match(/^([a-z_]+)\s+(\d+)$/i)).filter(Boolean).filter((m) => BUILD_META[m[1].toLowerCase()]).map((m) => ({ b: m[1].toLowerCase(), lvl: Math.max(1, Math.min(BUILD_META[m[1].toLowerCase()].max, +m[2])), en: true }));
  const planToTpl = (plan) => (plan || []).map((it) => it.b + ' ' + it.lvl).join('\n');
  const ATK_TPL = 'main 15\nfarm 20\nstorage 20\nwood 15\nstone 15\niron 15\nsmith 10\nbarracks 10\nmarket 5\ngarage 5\nwood 20\nstone 20\niron 20\nfarm 24\nstorage 24\nmain 20\nstable 15\nbarracks 15\nmarket 10\ngarage 10\nwood 25\nstone 25\niron 25\nfarm 27\nstorage 27\nstable 20\nbarracks 20\nmarket 15\nwood 30\nstone 30\niron 30\nfarm 30\nstorage 30\nbarracks 25\nmarket 20';
  const DEF_TPL = 'main 15\nfarm 20\nstorage 20\nwood 15\nstone 15\niron 15\nsmith 5\nbarracks 10\nmarket 5\nstable 10\nwall 10\nwood 20\nstone 20\niron 20\nfarm 24\nstorage 24\nmain 20\nbarracks 15\nwall 15\nmarket 10\nwood 25\nstone 25\niron 25\nfarm 27\nstorage 27\nbarracks 20\nwall 20\nmarket 15\nwood 30\nstone 30\niron 30\nfarm 30\nstorage 30\nbarracks 25\nmarket 20';

  const VERSION = '9.45.0';
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
  function buildingIcon(key, fallback) { return IMG_BASE ? '<img class="twmgr-ui" src="' + IMG_BASE + 'graphic/buildings/' + key + '.png" title="' + (fallback || key) + '" alt="' + (fallback || key) + '">' : (fallback || ''); }

  let TAB_ID = sessionStorage.getItem('twmgr_tabid');
  if (!TAB_ID) { TAB_ID = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); sessionStorage.setItem('twmgr_tabid', TAB_ID); }

  let _idc = 0;
  function genId() { return 'g' + Date.now().toString(36) + (_idc++).toString(36) + Math.random().toString(36).slice(2, 5); }

  const defScav = () => ({ running: false, nextAt: 0, units: { spear: true, sword: true, axe: true, light: true, heavy: true, knight: false } });
  // Por cor: um modo único ('none'|'a'|'b'|'c') + qtd (só p/ a/b; C manda 1x).
  const defFarmMatrix = () => ({ greenEmpty: { mode: 'a', qty: 1 }, greenFull: { mode: 'b', qty: 1 }, yellowEmpty: { mode: 'none', qty: 1 }, yellowFull: { mode: 'none', qty: 1 }, blue: { mode: 'b', qty: 1 } });
  const FARM_COLORS = ['greenEmpty', 'greenFull', 'yellowEmpty', 'yellowFull', 'blue'];
  const defFarm = () => ({ running: false, nextAt: 0, interval: 600, minWood: 1000, minStone: 1000, minIron: 1000, maxDist: 13, maxWall: 20, blueMaxWall: 0, blueDeleteMinDef: 10, delay: 500, mode: 'suave', group: null, repeat: false, repeatMin: 10, minCL: 0, order: 'dist', dynTemplate: false, matrix: defFarmMatrix(), sentReports: {}, defended: {} });
  const defWall = () => ({ running: false, nextAt: 0, interval: 600, wallMin: 1, wallMax: 6, ramMode: 'auto', ramFixed: 20, ramWall6: 24, axeCount: 80, spyCount: 1, sentDemo: {} });
  const defRecruit = () => ({
    running: false, nextAt: 0, interval: 600, targetHours: 2, refillBelowMin: 30,
    groupAtk: null, groupDef: null, profiles: { atk: { targets: {} }, def: { targets: {} } }, overrides: {}, queueEst: {},
  });
  const defFakes = () => ({ running: false, offsetMs: 150, targetsRaw: '', arrLocal: '', mode: 'split', pct: 1, minPop: 0, siege: 'ram', filler: 'spy', origins: {}, gen: [] });
  const defMarket = () => ({ running: false, mode: 'cunhagem', nextAt: 0, interval: 600, destCoord: '', reserve: 0, sources: {}, thresholdPct: 50, maxDist: 15, inflight: {} });
  const defBuild = () => ({ running: false, nextAt: 0, interval: 600, maxQueue: 5, plans: { atk: tplToPlan(ATK_TPL), def: tplToPlan(DEF_TPL) }, demand: {} });
  const BB_TPL = 'main 20\nstorage 20\nfarm 22\nstable 15\nbarracks 15\nsmith 10\ngarage 5\nfarm 24\nstorage 25\nbarracks 20\nstable 20\ngarage 10\nwood 30\nstone 30\niron 30\nstorage 30\nfarm 27\nmarket 15';
  const defBB = () => ({ running: false, nextAt: 0, interval: 600, maxQueue: 5, group: null, tpl: BB_TPL, defCoords: '', feedReserve: 40, feedMaxDist: 15, gradMain: 20, gradStable: 15, inflight: {} });
  const defCaptcha = () => ({ enabled: true, browserNotif: true, ntfyTopic: '', cooldownSec: 300, lastNotifiedAt: 0, pollSec: 120 });
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
  const defPlannerAttack = (name) => ({
    id: genId(), name: name || 'Ataque',
    running: false, offsetMs: 150,
    targetX: '', targetY: '',
    arriveLocal: '',                       // datetime-local base (usuário digita)
    selected: {},                          // { [vid]: true } — aldeias participantes
    perVillage: {},                        // { [vid]: { kind, offsetMs, amounts:{unit:qty} } }
    homeAvail: {},                         // { [vid]: { unit:N, loadedAt: ms } } — cache do "Carregar tropas"
    rows: [],                              // gerado no plannerStart a partir de perVillage
  });
  const defPlanner = () => ({
    attacks: [defPlannerAttack('Ataque 1')], // vários ataques independentes, cada um pode ser armado por conta própria
    activeId: null,                        // id do ataque mostrado na UI (setado no load())
    templates: [],                         // templates salvos { id, name, targetX, targetY, arriveLocal, selected, perVillage }
  });
  const defUnits = () => ({
    // history[YYYY-MM-DD] = {
    //   at: msEpoch,
    //   totals: { [unit]: N },
    //   byVillage: { [vid]: { name, coord, totals: {u:N}, force: {...} } },
    //   force: { total, att, def, defCav, defArch, pop, nobles },
    // }
    history: {},
    historyDays: 90,
  });
  const def = () => ({ targets: [], reloadAfterSend: true, running: false, scav: defScav(), farm: defFarm(), recruit: defRecruit(), fakes: defFakes(), market: defMarket(), build: defBuild(), bb: defBB(), map: defMap(), captcha: defCaptcha(), planner: defPlanner(), units: defUnits(), reservations: {} });
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
    if (c.farm.blueMaxWall == null) c.farm.blueMaxWall = 0;
    if (c.farm.blueDeleteMinDef == null) c.farm.blueDeleteMinDef = 10;
    if (c.farm.delay == null) c.farm.delay = 500;
    // limpa campos de aríete que ficaram no farm em versões antigas (migraram pro Quebra-muralha)
    delete c.farm.ramMode; delete c.farm.ramFixed; delete c.farm.ramWall6; delete c.farm.axeCount;
    const oldMin = c.farm.min != null ? c.farm.min : 1000;
    if (c.farm.minWood == null) c.farm.minWood = oldMin;
    if (c.farm.minStone == null) c.farm.minStone = oldMin;
    if (c.farm.minIron == null) c.farm.minIron = oldMin;
    if (!c.farm.mode) c.farm.mode = 'suave';
    if (c.farm.group === undefined) c.farm.group = null;
    // "Repetir farm": migra do antigo cooldownMin se existir
    if (c.farm.repeat == null) c.farm.repeat = false;
    if (c.farm.repeatMin == null) c.farm.repeatMin = (c.farm.cooldownMin != null ? c.farm.cooldownMin : 10);
    delete c.farm.cooldownMin;
    if (c.farm.minCL == null) c.farm.minCL = 0;
    if (!c.farm.order) c.farm.order = 'dist';
    if (c.farm.dynTemplate == null) c.farm.dynTemplate = false;
    if (!c.farm.matrix) c.farm.matrix = defFarmMatrix();
    // Migração matriz {a,b,c} antiga -> {mode,qty} (escolha única por cor)
    FARM_COLORS.forEach((k) => {
      const cell = c.farm.matrix[k] || {};
      if (cell.mode === undefined) {
        let mode = 'none', qty = 1;
        if (cell.c === true) mode = 'c';
        else if ((cell.b || 0) > 0) { mode = 'b'; qty = cell.b; }
        else if ((cell.a || 0) > 0) { mode = 'a'; qty = cell.a; }
        c.farm.matrix[k] = { mode: mode, qty: Math.max(1, qty) };
      }
    });
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
    if (c.build.maxQueue == null) c.build.maxQueue = 5;
    if (c.build.interval == null) c.build.interval = 600;
    if (!c.build.demand) c.build.demand = {};
    // Migração de textareas (atkTpl/defTpl) pra estrutura plans
    if (!c.build.plans) c.build.plans = { atk: null, def: null };
    if (!Array.isArray(c.build.plans.atk) || !c.build.plans.atk.length) c.build.plans.atk = tplToPlan(c.build.atkTpl || ATK_TPL);
    if (!Array.isArray(c.build.plans.def) || !c.build.plans.def.length) c.build.plans.def = tplToPlan(c.build.defTpl || DEF_TPL);
    // Sanitiza: mantém só chaves válidas, clampa nível, preserva 'en'
    ['atk', 'def'].forEach((k) => {
      c.build.plans[k] = (c.build.plans[k] || []).filter((it) => it && BUILD_META[it.b]).map((it) => ({ b: it.b, lvl: Math.max(1, Math.min(BUILD_META[it.b].max, parseInt(it.lvl, 10) || 1)), en: it.en !== false }));
    });
    delete c.build.atkTpl; delete c.build.defTpl;
    if (!c.bb) c.bb = defBB();
    if (!c.bb.tpl) c.bb.tpl = BB_TPL;
    if (c.bb.defCoords == null) c.bb.defCoords = '';
    if (c.bb.feedReserve == null) c.bb.feedReserve = 40;
    if (c.bb.feedMaxDist == null) c.bb.feedMaxDist = 15;
    if (c.bb.maxQueue == null) c.bb.maxQueue = 5;
    if (c.bb.interval == null) c.bb.interval = 600;
    if (c.bb.gradMain == null) c.bb.gradMain = 20;
    if (c.bb.gradStable == null) c.bb.gradStable = 15;
    if (!c.bb.inflight) c.bb.inflight = {};
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
    if (!c.captcha) c.captcha = defCaptcha();
    if (c.captcha.enabled == null) c.captcha.enabled = true;
    if (c.captcha.browserNotif == null) c.captcha.browserNotif = true;
    if (c.captcha.ntfyTopic == null) c.captcha.ntfyTopic = '';
    if (c.captcha.cooldownSec == null) c.captcha.cooldownSec = 300;
    if (c.captcha.pollSec == null) c.captcha.pollSec = 120;
    if (c.captcha.lastNotifiedAt == null) c.captcha.lastNotifiedAt = 0;
    if (!c.planner) c.planner = defPlanner();
    if (!Array.isArray(c.planner.attacks) || !c.planner.attacks.length) {
      // Migração do formato antigo (1 único ataque direto em config.planner) pro novo (lista de ataques independentes).
      const legacy = c.planner;
      const atk = defPlannerAttack('Ataque 1');
      atk.running = !!legacy.running;
      atk.offsetMs = legacy.offsetMs != null ? legacy.offsetMs : 150;
      atk.targetX = legacy.targetX || ''; atk.targetY = legacy.targetY || '';
      atk.arriveLocal = legacy.arriveLocal || '';
      atk.selected = (legacy.selected && typeof legacy.selected === 'object') ? legacy.selected : {};
      atk.perVillage = (legacy.perVillage && typeof legacy.perVillage === 'object') ? legacy.perVillage : {};
      atk.homeAvail = (legacy.homeAvail && typeof legacy.homeAvail === 'object') ? legacy.homeAvail : {};
      atk.rows = Array.isArray(legacy.rows) ? legacy.rows : [];
      c.planner = { attacks: [atk], activeId: atk.id, templates: Array.isArray(legacy.plans) ? legacy.plans : [] };
    }
    if (!Array.isArray(c.planner.templates)) c.planner.templates = [];
    c.planner.attacks.forEach((atk) => {
      if (!atk.id) atk.id = genId();
      if (!atk.name) atk.name = 'Ataque';
      if (atk.offsetMs == null) atk.offsetMs = 150;
      if (!atk.selected || typeof atk.selected !== 'object') atk.selected = {};
      if (!atk.perVillage || typeof atk.perVillage !== 'object') atk.perVillage = {};
      if (!atk.homeAvail || typeof atk.homeAvail !== 'object') atk.homeAvail = {};
      if (!Array.isArray(atk.rows)) atk.rows = [];
      if (atk.targetX == null) atk.targetX = '';
      if (atk.targetY == null) atk.targetY = '';
      if (atk.arriveLocal == null) atk.arriveLocal = '';
      // Migração: perVillage[vid] era 1 onda só (objeto); agora é uma lista de ondas (array).
      Object.keys(atk.perVillage).forEach((vid) => {
        if (!Array.isArray(atk.perVillage[vid])) atk.perVillage[vid] = atk.perVillage[vid] ? [atk.perVillage[vid]] : [];
        atk.perVillage[vid].forEach((w) => { if (!w.amounts || typeof w.amounts !== 'object') w.amounts = {}; if (!w.kind) w.kind = 'attack'; if (w.offsetMs == null) w.offsetMs = 0; });
      });
    });
    if (!c.planner.activeId || !c.planner.attacks.some((a) => a.id === c.planner.activeId)) c.planner.activeId = c.planner.attacks[0].id;
    if (!c.reservations || typeof c.reservations !== 'object') c.reservations = {};
    if (!c.units) c.units = defUnits();
    if (!c.units.history || typeof c.units.history !== 'object') c.units.history = {};
    if (c.units.historyDays == null) c.units.historyDays = 90;
    (c.targets || []).forEach((t) => { if (!t.origin) { t.origin = CUR_VID; t.originName = CUR_NAME; } });
    return c;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(config)); }

  let config = load();
  let sendTimer = null, scavTimer = null, farmTimer = null, wallTimer = null, recruitTimer = null, fakeTimer = null, marketTimer = null, buildTimer = null, bbTimer = null, mapTimer = null, plannerTimer = null, uiTimer = null;
  function anyRunning() { return config.running || (config.scav && config.scav.running) || (config.farm && config.farm.running) || (config.wall && config.wall.running) || (config.recruit && config.recruit.running) || (config.fakes && config.fakes.running) || (config.market && config.market.running) || (config.build && config.build.running) || (config.bb && config.bb.running) || (config.map && config.map.running) || (config.planner && config.planner.attacks && config.planner.attacks.some((a) => a.running)); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function readLock() { try { return JSON.parse(localStorage.getItem(LOCKKEY) || 'null'); } catch (e) { return null; } }
  function lockOther() { const l = readLock(); return !!(l && l.id !== TAB_ID && (Date.now() - l.ts) < 12000); }
  function claimLock() { localStorage.setItem(LOCKKEY, JSON.stringify({ id: TAB_ID, ts: Date.now() })); }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pushLog(msg, kind, mod) {
    let arr = []; try { arr = JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch (e) {}
    arr.unshift({ t: new Date().toLocaleTimeString(), m: msg, k: kind || '', mod: mod || '' });
    localStorage.setItem(LOGKEY, JSON.stringify(arr.slice(0, 200)));
    renderLog();
    if (mod) renderModLog(mod);
  }
  function logLineHTML(l) {
    const c = l.k === 'err' ? '#ff7568' : l.k === 'ok' ? '#8fe39a' : '#cbb98f';
    return '<div style="color:' + c + ';border-bottom:1px solid rgba(255,255,255,.05);padding:2px 0">[' + esc(l.t) + '] ' + esc(l.m) + '</div>';
  }
  function readLogArr() { try { return JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch (e) { return []; } }
  // Aba Log = só mensagens gerais (sem módulo)
  function renderLog() {
    const box = document.getElementById('twmgr-log'); if (!box) return;
    box.innerHTML = readLogArr().filter((l) => !l.mod).map(logLineHTML).join('');
  }
  // Log recolhível no fim de cada aba de módulo (só as mensagens daquele módulo)
  function renderModLog(mod) {
    const body = document.getElementById('twmgr-modlog-body-' + mod);
    const cnt = document.getElementById('twmgr-modlog-count-' + mod);
    const rows = readLogArr().filter((l) => l.mod === mod);
    if (cnt) cnt.textContent = rows.length;
    if (body) body.innerHTML = rows.length ? rows.map(logLineHTML).join('') : '<div style="color:#8f7d57;padding:6px;font-size:10px">— sem mensagens ainda —</div>';
  }

  // ===== Cards de status por módulo =====
  function fmtN(n) { return (n == null) ? '—' : Number(n).toLocaleString('pt-BR'); }
  function renderCards(mod, arr) {
    const box = document.getElementById('twmgr-cards-' + mod); if (!box) return;
    box.innerHTML = arr.map((c) =>
      (c.br ? '<div class="twmgr-card-break"></div>' : '') +
      '<div class="twmgr-card-mini' + (c.wide ? ' twmgr-card-wide' : '') + '"><div class="twmgr-card-v"' + (c.hl ? ' style="color:#5fd3e8"' : '') + '>' + (c.v == null ? '—' : c.v) + '</div><div class="twmgr-card-l">' + c.l + '</div></div>'
    ).join('');
  }
  // Monta e desenha os cards de um módulo a partir de config[...].stats (populado nos ticks).
  function refreshCards(mod) {
    const box = document.getElementById('twmgr-cards-' + mod); if (!box) return;
    let arr = [];
    if (mod === 'farm') {
      const s = (config.farm.stats || {}), lt = s.loot || {};
      arr = [
        { v: fmtN(s.active), l: 'aldeias' },
        { v: fmtN(s.activeTotal), l: 'saques ativos', hl: true },
        { v: fmtN(s.a), l: 'A' }, { v: fmtN(s.b), l: 'B' }, { v: fmtN(s.c), l: 'C' },
        { v: fmtN(lt.today), l: 'saqueado hoje', br: true },
        { v: fmtN(lt.estimate), l: 'estimativa fim do dia' },
        { v: (s.coverage == null ? '—' : s.coverage + '%'), l: 'eficiência (cobertura)', hl: true },
      ];
    } else if (mod === 'wall') {
      const s = (config.wall.stats || {});
      arr = [
        { v: fmtN(s.pending), l: 'muros p/ derrubar', hl: true },
        { v: fmtN(s.total), l: 'quebras (total)' },
        { v: fmtN(s.last), l: 'último ciclo' },
      ];
    } else if (mod === 'scav') {
      const s = (config.scav.stats || {}), ct = s.coleta || {};
      arr = [
        { v: fmtN(s.active), l: 'aldeias' },
        { v: fmtN(ct.today), l: 'coletado hoje', hl: true },
        { v: fmtN(ct.estimate), l: 'estimativa fim do dia', wide: true },
      ];
    } else if (mod === 'recruit') {
      const s = (config.recruit.stats || {});
      arr = [{ v: fmtN(s.villages), l: 'aldeias recrutando', wide: true, hl: true }];
    } else if (mod === 'fakes') {
      const g = config.fakes.gen || [];
      const armed = g.filter((f) => f.state === 'armed' || f.state === 'scheduled').length;
      const pend = g.filter((f) => f.state === 'armed').length;
      const sent = g.filter((f) => f.state === 'sent').length;
      const err = g.filter((f) => f.state === 'error').length;
      arr = [
        { v: fmtN(armed), l: 'armados', hl: true }, { v: fmtN(pend), l: 'pendentes' },
        { v: fmtN(sent), l: 'enviados' }, { v: fmtN(err), l: 'erros' },
      ];
    } else if (mod === 'market') {
      const s = (config.market.stats || {});
      arr = [
        { v: fmtN(s.sending), l: 'enviando', hl: true },
        { v: fmtN(s.receiving), l: 'recebendo' },
        { v: fmtN(s.wood), l: 'madeira' }, { v: fmtN(s.stone), l: 'argila' }, { v: fmtN(s.iron), l: 'ferro' },
      ];
    } else if (mod === 'build') {
      const s = (config.build.stats || {});
      arr = [{ v: fmtN(s.villages), l: 'aldeias construindo', wide: true, hl: true }];
    } else if (mod === 'bb') {
      const s = (config.bb.stats || {});
      arr = [
        { v: fmtN(s.total), l: 'no grupo', hl: true },
        { v: fmtN(s.f1), l: 'fase 1' },
        { v: fmtN(s.f2), l: 'fase 2' },
        { v: fmtN(s.f3), l: 'fase 3' },
      ];
    } else if (mod === 'map') {
      const s = (config.map.stats || {});
      arr = [
        { v: fmtN(s.mapped), l: 'no alcance', hl: true },
        { v: fmtN(s.sent), l: 'explorados' },
        { v: fmtN(s.left), l: 'de fora' },
      ];
    } else if (mod === 'planner') {
      const attacks = (config.planner && config.planner.attacks) || [];
      const rows = attacks.reduce((acc, a) => acc.concat(a.rows || []), []);
      const armed = rows.filter((r) => r.state === 'armed' || r.state === 'scheduled').length;
      const sent = rows.filter((r) => r.state === 'sent').length;
      const err = rows.filter((r) => r.state === 'error').length;
      const running = attacks.filter((a) => a.running).length;
      arr = [
        { v: fmtN(running), l: 'ataques armados', hl: true },
        { v: fmtN(armed), l: 'ondas pendentes' },
        { v: fmtN(sent), l: 'enviadas' },
        { v: fmtN(err), l: 'erros' },
      ];
    }
    renderCards(mod, arr);
  }
  // Atualiza o card de recurso diário (async) e re-desenha.
  async function refreshDaily(mod, cfg, key, type) {
    try { const d = await getDailyLootStats(type); cfg.stats = cfg.stats || {}; cfg.stats[key] = d; save(); refreshCards(mod); } catch (e) {}
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

  // Converte a data do relatório do assistente ("hoje às 12:03:39", "ontem às ...", "13/07/26 às ...") em timestamp (ms). null se não der.
  function parseReportDate(txt) {
    txt = (txt || '').trim().toLowerCase();
    if (!txt) return null;
    const tm = txt.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const hh = tm ? +tm[1] : 0, mm = tm ? +tm[2] : 0, ss = (tm && tm[3]) ? +tm[3] : 0;
    const d = new Date();
    if (txt.indexOf('hoje') >= 0) { d.setHours(hh, mm, ss, 0); return d.getTime(); }
    if (txt.indexOf('ontem') >= 0) { d.setDate(d.getDate() - 1); d.setHours(hh, mm, ss, 0); return d.getTime(); }
    const dm = txt.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
    if (dm) { let y = +dm[3]; if (y < 100) y += 2000; return new Date(y, (+dm[2]) - 1, +dm[1], hh, mm, ss).getTime(); }
    const dm2 = txt.match(/(\d{1,2})[\/.](\d{1,2})/);
    if (dm2) { return new Date((new Date()).getFullYear(), (+dm2[2]) - 1, +dm2[1], hh, mm, ss).getTime(); }
    return null;
  }

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

  // Retorna o avail com as reservas do Planner descontadas (não negativo).
  function applyReservationsToAvail(vid, avail) {
    const r = (config.reservations || {})[vid] || {};
    const out = {};
    UNITS.forEach(([u]) => { out[u] = Math.max(0, (avail[u] || 0) - (r[u] || 0)); });
    return out;
  }
  async function getVillageStateReserved(vid) {
    const st = await getVillageState(vid);
    return { avail: applyReservationsToAvail(vid, st.avail), availRaw: st.avail, reserved: (config.reservations || {})[vid] || {}, commands: st.commands };
  }

  async function sendAttack(vid, x, y, amounts, kind) {
    const p1 = new URLSearchParams();
    Object.entries(amounts).forEach(([u, a]) => p1.set(u, String(a)));
    p1.set('x', String(x)); p1.set('y', String(y)); p1.set('input', x + '|' + y);
    if (kind === 'support') p1.set('support', 'l'); else p1.set('attack', 'l');
    p1.set('h', CSRF);
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
    // Só considera enviado se NÃO veio caixa de erro nem mensagem de recusa (senão o log logava falso "enviado").
    try { const d2 = new DOMParser().parseFromString(t2, 'text/html'); const eb = d2.querySelector('.error_box'); if (eb && (eb.textContent || '').trim()) throw new Error('recusado: ' + eb.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)); } catch (e) { if (/^recusado:/.test(e.message)) throw e; }
    if (/n[aã]o (tem|h[aá]) (tropas|unidades)|insuficient|not enough/i.test(t2)) throw new Error('Servidor recusou: tropas insuficientes.');
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
      try { state = await getVillageStateReserved(origin); }
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
      const availRaw = {}; SCAV_UNITS.forEach(([u]) => { availRaw[u] = parseInt(home[u], 10) || 0; });
      const reserved = (config.reservations || {})[String(v.village_id)] || {};
      const avail = {}; SCAV_UNITS.forEach(([u]) => { avail[u] = Math.max(0, availRaw[u] - (reserved[u] || 0)); });
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
    catch (e) { pushLog('Coleta: erro ao ler o estado das aldeias (' + (e.message || e) + ').', 'err', 'scav'); config.scav.nextAt = now + 60000; save(); scheduleScav(); return; }
    const selUnits = SCAV_UNITS.map(([u]) => u).filter((u) => config.scav.units[u]);
    const reqs = [], runningEnds = [], activeSet = {};
    for (const v of villages) {
      if (v.options.some((o) => o.state === 'running')) activeSet[v.vid] = 1;
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
        reqs.forEach((r) => { activeSet[r.vid] = 1; pushLog('Coleta: ' + r.name + ' → nível ' + r.optionId + ' (' + Object.entries(r.units).map(([u, c]) => c + ' ' + u).join(', ') + ')', 'ok', 'scav'); });
        pushLog('Coleta: ' + reqs.length + ' esquadrão(ões) enviado(s).', 'ok', 'scav'); sent = true;
      } catch (e) { pushLog('Coleta: envio em massa falhou (' + (e.message || e) + ').', 'err', 'scav'); }
    }
    config.scav.stats = config.scav.stats || {};
    config.scav.stats.active = Object.keys(activeSet).length;
    let next;
    if (sent) next = now + 15000; else if (runningEnds.length) next = Math.min.apply(null, runningEnds) + 8000; else next = now + 300000;
    config.scav.nextAt = next; save();
    refreshCards('scav'); refreshDaily('scav', config.scav, 'coleta', 'scavenge');
    scheduleScav();
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
      if (rl) { const m = rl.getAttribute('href').match(/view=(\d+)/); if (m) reportId = m[1]; const cmm = (rl.textContent || '').match(/(\d+)\|(\d+)/); if (cmm) coord = cmm[1] + '|' + cmm[2]; }   // normaliza p/ "x|y" (o texto vem "(x|y) Kxx")
      const vals = tr.querySelectorAll('span.res, span.warn');
      const nums = Array.prototype.slice.call(vals, 0, 3).map((s) => parseInt((s.textContent || '').replace(/\D/g, ''), 10) || 0);
      const resTd = tr.querySelector('td[colspan="3"]');
      const dateTd = resTd ? resTd.previousElementSibling : null;   // coluna "Tempo" (último relatório)
      const reportAt = dateTd ? parseReportDate(dateTd.textContent) : null;
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
      rows.push({ targetId: targetId, reportId: reportId, reportAt: reportAt, wood: nums[0] || 0, stone: nums[1] || 0, iron: nums[2] || 0, wall: wall, dist: dist, cEnabled: cEnabled, aEnabled: aEnabled, bEnabled: bEnabled, color: color, full: full, coord: coord });
    });
    return rows;
  }

  // Lê a tela de comandos (só ataques): coords com ataque nosso em rota (p/ não empilhar) + nº de ATAQUES DE SAQUE em rota (ícone de farm) p/ o card.
  async function getPendingAttack() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=commands&type=attack&page=-1', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const coords = new Set(); let saques = 0; const farmCoords = new Set();
    doc.querySelectorAll('#commands_table tr').forEach((tr) => {
      const label = tr.querySelector('.quickedit-label'); if (!label) return;
      const m = (label.textContent || '').match(/\((\d+)\|(\d+)\)/); const coord = m ? m[1] + '|' + m[2] : null;
      if (coord) coords.add(coord);
      if (tr.querySelector('img[src*="command/farm"]')) { saques++; if (coord) farmCoords.add(coord); }   // ícone farm.webp = ataque de saque
    });
    return { coords: coords, saques: saques, farmCoords: farmCoords };
  }

  // "Minha pontuação hoje" do ranking Em um dia (type: loot_res = saqueado, scavenge = coletado). Cache por type.
  // Cache das estatísticas diárias PERSISTIDO no localStorage: o TTL de 5 min precisa sobreviver a
  // reloads de página (senão o init refazia 2 fetches de ranking por carregamento -> acende o botschutz).
  const _dailyCache = {};
  const DAILYKEY = KEY + '_daily';
  function _dailyRead(type) {
    if (_dailyCache[type]) return _dailyCache[type];
    try { const all = JSON.parse(localStorage.getItem(DAILYKEY) || '{}'); if (all[type]) { _dailyCache[type] = all[type]; return all[type]; } } catch (e) {}
    return null;
  }
  function _dailyWrite(type, entry) {
    _dailyCache[type] = entry;
    try { const all = JSON.parse(localStorage.getItem(DAILYKEY) || '{}'); all[type] = entry; localStorage.setItem(DAILYKEY, JSON.stringify(all)); } catch (e) {}
  }
  async function getDailyLootStats(type) {
    const c = _dailyRead(type);
    if (c && (Date.now() - c.at) < 300000) return c.data;
    let today = null;
    try {
      const res = await fetch('/game.php?village=' + CUR_VID + '&screen=ranking&mode=in_a_day&type=' + type, { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const txt = ((doc.querySelector('#content_value') || doc.body).textContent || '').replace(/\s+/g, ' ');   // texto puro (sem tags/atributos com dígitos)
      const m = txt.match(/pontua[çc][ãa]o\s+hoje[^0-9]*?([\d.]+)/i);
      if (m) today = parseInt(m[1].replace(/\./g, ''), 10) || 0;
    } catch (e) {}
    // estimativa fim do dia: extrapola linear pelo tempo decorrido desde a meia-noite do servidor
    let estimate = null;
    if (today != null) {
      const et = document.querySelector('#serverTime');
      const tm = et ? (et.textContent || '').match(/(\d{2}):(\d{2}):(\d{2})/) : null;
      const segDia = tm ? ((+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3])) : 0;
      if (segDia >= 600) estimate = Math.round(today / (segDia / 86400));
    }
    const data = { today: today, estimate: estimate };
    _dailyWrite(type, { at: Date.now(), data: data });
    return data;
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
  // Relatório: soma o total de tropas do defensor (0 se não achar nada / aldeia vazia).
  async function getReportDefenseTotal(reportId) {
    try {
      const res = await fetch('/game.php?village=' + CUR_VID + '&screen=report&view=' + reportId, { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const tbl = doc.querySelector('#attack_info_def_units') || doc.querySelector('#attack_spy_away') || doc.querySelector('#attack_info_def');
      if (tbl) {
        const cells = tbl.querySelectorAll('td.unit-item, .unit-item');
        let total = 0; cells.forEach((c) => { total += parseInt((c.textContent || '').replace(/\D/g, ''), 10) || 0; });
        return total;
      }
    } catch (e) {}
    return 0;
  }
  // Apaga um relatório — endpoint real confirmado pelo usuário via DevTools (GET simples, redireciona pra lista).
  async function deleteReport(reportId) {
    const url = '/game.php?village=' + CUR_VID + '&screen=report&mode=all&action=del_one&id=' + reportId + '&h=' + CSRF;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return true;
  }
  async function farmTick() {
    clearTimeout(farmTimer);
    if (!config.farm.running) return;
    if (lockOther()) { farmTimer = setTimeout(farmTick, 5000); return; }
    claimLock();
    const now = Date.now();
    if ((config.farm.nextAt || 0) > now) { scheduleFarm(); return; }
    const cfg = config.farm;
    // Origens = minhas aldeias com coordenada (pra escolher a mais próxima por alvo).
    let mine;
    try {
      if (cfg.group) { mine = (await getVillagesInGroup(cfg.group)).map((x) => ({ vid: x.vid, coord: x.coord, name: x.coord })); try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
      else mine = await getAllVillages();
    } catch (e) { pushLog('Saque: erro ao listar aldeias: ' + (e.message || e), 'err', 'farm'); cfg.nextAt = now + 120000; save(); scheduleFarm(); return; }
    const myV = [], semCoord = [];
    mine.forEach((v) => {
      const m = (v.coord || '').match(/(\d+)\|(\d+)/);
      if (m) myV.push({ vid: v.vid, name: v.name || v.coord, coord: v.coord, x: +m[1], y: +m[2] });
      else semCoord.push(v.vid);
    });
    // Diagnóstico: se a contagem mudou vs o último ciclo, avisa (ajuda a pegar cache stale do overview_villages).
    const grpTxt = cfg.group ? (' (grupo ' + cfg.group + ')') : ' (todas)';
    const lastCount = (cfg.stats && cfg.stats.mineCountRaw) || 0;
    if (lastCount && lastCount !== mine.length) pushLog('Saque: ⚠ nº de aldeias' + grpTxt + ' mudou de ' + lastCount + ' → ' + mine.length + '.', '', 'farm');
    if (semCoord.length) pushLog('Saque: ' + semCoord.length + ' aldeia(s) sem coord ignoradas — vids: ' + semCoord.slice(0, 5).join(','), 'err', 'farm');
    cfg.stats = cfg.stats || {}; cfg.stats.mineCount = myV.length; cfg.stats.mineCountRaw = mine.length;
    let pendingCoords = new Set(), saquesAtivos = null, farmCoords = new Set();
    try { const pa = await getPendingAttack(); pendingCoords = pa.coords; saquesAtivos = pa.saques; farmCoords = pa.farmCoords || new Set(); } catch (e) {}
    const minW = cfg.minWood || 0, minS = cfg.minStone || 0, minI = cfg.minIron || 0;
    const maxDist = cfg.maxDist != null ? cfg.maxDist : 13;
    const maxWall = cfg.maxWall != null ? cfg.maxWall : 20;
    const blueMaxWall = cfg.blueMaxWall != null ? cfg.blueMaxWall : 0;
    const blueDeleteMinDef = cfg.blueDeleteMinDef != null ? cfg.blueDeleteMinDef : 10;
    const delayBase = cfg.mode === 'agressivo' ? 200 : 500;
    const repeatOn = !!cfg.repeat;
    const repeatMs = Math.max(0, cfg.repeatMin || 0) * 60000;
    const minCL = cfg.minCL || 0, dyn = !!cfg.dynTemplate, M = cfg.matrix || {};
    const sent = cfg.sentReports || {}, defended = cfg.defended || {};
    // "Saques ativos agora": poda os que já pousaram (destino sumiu da lista de comandos) + os muito antigos.
    cfg.activeSends = (cfg.activeSends || []).filter((s) => pendingCoords.has(s.coord) && (now - (s.at || 0) < 12 * 3600 * 1000));
    const cellFor = (t) => {
      if (t.color === 'red') return null;
      if (t.color === 'blue') return M.blue;
      if (t.color === 'green') return t.full ? M.greenFull : M.greenEmpty;
      if (t.color === 'yellow') return t.full ? M.yellowFull : M.yellowEmpty;
      return null;
    };
    const colorTxt = (t) => ({ green: 'verde', yellow: 'amarelo', blue: 'azul', red: 'vermelho' }[t.color] || t.color) + (t.full ? ' cheio' : ' vazio');
    // Lê os alvos (assistente = conta inteira) e os templates uma vez só.
    let targets;
    try { targets = await getFarmTargets(CUR_VID); }
    catch (e) { pushLog('Saque: erro ao ler os alvos do assistente (' + (e.message || e) + ').', 'err', 'farm'); cfg.nextAt = now + 120000; save(); scheduleFarm(); return; }
    let tpl = null;
    if (!dyn) { try { tpl = await getFarmTemplates(CUR_VID); } catch (e) { tpl = null; } }
    const availCache = {};
    const getAvail = async (vid) => { if (!availCache[vid]) { try { availCache[vid] = (await getVillageStateReserved(vid)).avail || {}; } catch (e) { availCache[vid] = {}; } } return availCache[vid]; };
    const skip = { norep: 0, off: 0, red: 0, azul: 0, def: 0, del: 0, mur: 0, pend: 0, semorig: 0 };
    const eligible = [];
    targets.forEach((t) => {
      if (!t.reportId) { skip.norep++; return; }
      if (t.color === 'red') { skip.red++; return; }
      if (t.wall != null && t.wall > maxWall) { skip.mur++; return; }
      const cell = cellFor(t);
      if (!cell || !cell.mode || cell.mode === 'none') { skip.off++; return; }
      if (t.color === 'blue' && (t.wall == null || t.wall > blueMaxWall)) { skip.azul++; return; }
      t._cell = cell; eligible.push(t);
    });
    if ((cfg.order || 'dist') === 'recurso') eligible.sort((a, b) => (b.wood + b.stone + b.iron) - (a.wood + a.stone + a.iron));
    else eligible.sort((a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist));
    let count = 0;
    for (const t of eligible) {
      const cm = (t.coord || '').match(/(\d+)\|(\d+)/); if (!cm) continue;
      const tx = +cm[1], ty = +cm[2];
      if (t.color === 'blue') {
        if (defended[t.reportId]) { skip.def++; continue; }
        let defTotal = 0; try { defTotal = await getReportDefenseTotal(t.reportId); } catch (e) {}
        if (defTotal >= blueDeleteMinDef) {
          try { await deleteReport(t.reportId); pushLog('Saque: relatório azul de ' + t.coord + ' apagado (' + defTotal + ' tropas de defesa) — evitando atacar aldeia populada.', 'ok', 'farm'); skip.del++; }
          catch (e) { pushLog('Saque: falha ao apagar relatório azul de ' + t.coord + ' (' + defTotal + ' tropas): ' + (e.message || e), 'err', 'farm'); defended[t.reportId] = now; skip.def++; }
          continue;
        }
        if (defTotal > 0) { defended[t.reportId] = now; skip.def++; continue; }
      }
      const cell = t._cell, mode = cell.mode, qty = Math.max(1, cell.qty || 1);
      const sum = (t.wood || 0) + (t.stone || 0) + (t.iron || 0);
      // "Repetir farm" ligado: reataca por tempo (empilha ondas). Desligado: só se não tiver ataque a caminho.
      const inFlight = pendingCoords.has(t.coord);
      if (repeatOn) { if (sent[t.coord] && now - sent[t.coord] < repeatMs) { skip.pend++; continue; } }
      else { if (inFlight) { skip.pend++; continue; } if (sent[t.coord] && now - sent[t.coord] < 120000) { skip.pend++; continue; } }
      // C NÃO depende mais do ícone do assistente: ele reflete a aldeia ATUAL (CUR_VID), e com envio
      // pela origem mais próxima isso zerava o farm quando você abria numa aldeia DEF (sem CL). O envio
      // é feito por farm_from_report da origem escolhida; se ela não tiver tropa, o try/catch pula.
      if (mode === 'c' && !(t.wood >= minW && t.stone >= minS && t.iron >= minI)) { skip.off++; continue; }   // C: só exige relatório (já garantido) + recurso ≥ mínimo
      // Escolhe a aldeia MAIS PRÓXIMA (dentro do alcance) com CL suficiente.
      const cands = myV.map((s) => ({ s: s, d: fieldDist(s.x, s.y, tx, ty) })).filter((o) => o.d <= maxDist).sort((a, b) => a.d - b.d);
      if (!cands.length) { skip.dist++; continue; }
      const estCL = Math.max(1, Math.ceil((mode === 'b' ? sum * 1.2 : sum) / 80));   // CL estimada do envio (p/ descontar da origem)
      let did = false, usedName = '', usedDist = 0;
      for (const c of cands) {
        const avail = await getAvail(c.s.vid);
        if (minCL > 0 && (avail.light || 0) < minCL) continue;   // origem drenada -> tenta a próxima mais próxima
        // Modo dinâmico A/B manda {light: estCL, spy: 1}. Se a origem não tem isso (ex.: aldeia recém-noblada
        // sem CL), o servidor recusa e o log mentia "enviado". Pula pra próxima origem em vez de falso-positivo.
        if (dyn && mode !== 'c') { if ((avail.light || 0) < estCL) continue; if ((avail.spy || 0) < 1) continue; }
        try {
          if (mode === 'c') { await sendFarmC(c.s.vid, t.reportId); did = true; }
          else if (mode === 'a') { for (let k = 0; k < qty; k++) { if (dyn) { await sendAttack(c.s.vid, tx, ty, { light: Math.max(1, Math.ceil(sum / 80)), spy: 1 }); } else { if (!tpl || !tpl.a) break; await sendFarmB(c.s.vid, t.targetId, tpl.a); } did = true; if (k < qty - 1) await sleep(delayBase + Math.floor(Math.random() * 250)); } }
          else if (mode === 'b') { for (let k = 0; k < qty; k++) { if (dyn) { await sendAttack(c.s.vid, tx, ty, { light: Math.max(1, Math.ceil(sum * 1.2 / 80)), spy: 1 }); } else { if (!tpl || !tpl.b) break; await sendFarmB(c.s.vid, t.targetId, tpl.b); } did = true; if (k < qty - 1) await sleep(delayBase + Math.floor(Math.random() * 250)); } }
        } catch (e) { did = false; continue; }   // origem sem tropa / fora de alcance -> tenta a próxima
        if (did) { avail.light = Math.max(0, (avail.light || 0) - estCL); usedName = c.s.name; usedDist = c.d; count++; cfg.activeSends.push({ coord: t.coord, mode: mode, vid: c.s.vid, at: now }); await sleep(delayBase + Math.floor(Math.random() * 250)); break; }
      }
      if (did) { sent[t.coord] = now; pendingCoords.add(t.coord); pushLog('Saque: ' + usedName + ' → ' + t.coord + ' (' + colorTxt(t) + ') pelo ' + mode.toUpperCase() + (mode !== 'c' ? ' ×' + qty : '') + ' · ' + (Math.round(usedDist * 10) / 10) + ' campos', 'ok', 'farm'); }
      else skip.semorig++;
    }
    const parts = ['enviou ' + count];
    if (skip.semorig) parts.push(skip.semorig + ' sem origem c/ CL');
    if (skip.off) parts.push(skip.off + ' cor sem modo / C indisp.');
    if (skip.azul) parts.push(skip.azul + ' azul c/ muralha');
    if (skip.def) parts.push(skip.def + ' azul c/ defesa');
    if (skip.del) parts.push(skip.del + ' relatório azul apagado');
    if (skip.dist) parts.push(skip.dist + ' fora do alcance');
    if (skip.mur) parts.push(skip.mur + ' muralha alta');
    if (skip.pend) parts.push(skip.pend + ' já c/ ataque a caminho');
    if (skip.norep) parts.push(skip.norep + ' sem relatório');
    pushLog('Saque: ' + parts.join(' · '), '', 'farm');
    Object.keys(sent).forEach((r) => { if (now - sent[r] > 12 * 3600 * 1000) delete sent[r]; });
    Object.keys(defended).forEach((r) => { if (now - defended[r] > 12 * 3600 * 1000) delete defended[r]; });
    cfg.sentReports = sent; cfg.defended = defended;
    // stats dos cards
    const as = cfg.activeSends, vids = {}; as.forEach((s) => { if (s.vid) vids[s.vid] = 1; });
    cfg.stats = cfg.stats || {};
    cfg.stats.active = Object.keys(vids).length;
    // total = nº real de ataques de saque em rota (lido da tela de comandos); A/B/C = quebra estimada pelos nossos envios
    cfg.stats.activeTotal = (saquesAtivos != null) ? saquesAtivos : as.length;
    cfg.stats.a = as.filter((s) => s.mode === 'a').length;
    cfg.stats.b = as.filter((s) => s.mode === 'b').length;
    cfg.stats.c = as.filter((s) => s.mode === 'c').length;
    // eficiência (cobertura) = barbs com ataque de saque em rota ÷ farmáveis (assistente + em ataque; o filtro esconde os em ataque, por isso somamos)
    const assistCount = targets.filter((t) => t.reportId).length;
    const farmavel = assistCount + farmCoords.size;
    cfg.stats.farmavel = farmavel;
    cfg.stats.coverage = farmavel > 0 ? Math.min(100, Math.round(farmCoords.size / farmavel * 100)) : null;
    cfg.nextAt = now + Math.max(60, cfg.interval || 600) * 1000;
    save();
    refreshCards('farm'); refreshDaily('farm', cfg, 'loot', 'loot_res');
    pushLog('Saque: ciclo concluído — ' + count + ' comando(s) enviado(s). Próximo em ' + Math.round((cfg.interval || 600) / 60) + ' min.', 'ok', 'farm');
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
    let mine;
    try { mine = await getAllVillages(); }
    catch (e) { pushLog('Muralha: erro ao listar as aldeias (' + (e.message || e) + ').', 'err', 'wall'); config.wall.nextAt = now + 120000; save(); scheduleWall(); return; }
    const myV = [];
    mine.forEach((v) => { const m = (v.coord || '').match(/(\d+)\|(\d+)/); if (m) myV.push({ vid: v.vid, name: v.name || v.coord, coord: v.coord, x: +m[1], y: +m[2] }); });
    const wMin = config.wall.wallMin != null ? config.wall.wallMin : 1;
    const wMax = config.wall.wallMax != null ? config.wall.wallMax : 6;
    const axeN = Math.max(1, config.wall.axeCount || 80);
    const delay = Math.max(0, config.farm.delay != null ? config.farm.delay : 500);
    const demo = config.wall.sentDemo || {};
    const COOLDOWN = 6 * 3600 * 1000;   // não re-manda no mesmo report por 6h
    // Alvos com muralha na faixa (assistente = conta inteira), MAIORES primeiro.
    let eligible = [];
    try { eligible = (await getFarmTargets(CUR_VID)).filter((t) => t.reportId && t.coord && t.wall != null && t.wall >= wMin && t.wall <= wMax && !(demo[t.reportId] && (now - demo[t.reportId] < COOLDOWN))); }
    catch (e) { pushLog('Muralha: erro ao ler os alvos do assistente (' + (e.message || e) + ').', 'err', 'wall'); config.wall.nextAt = now + 120000; save(); scheduleWall(); return; }
    eligible.sort((a, b) => (b.wall || 0) - (a.wall || 0));
    const pendingWalls = eligible.length;
    // Tropa por aldeia (sob demanda, com cache) — descontada conforme vai assinando alvos.
    const availCache = {};
    const getAvail = async (vid) => { if (!availCache[vid]) { try { availCache[vid] = (await getVillageStateReserved(vid)).avail || {}; } catch (e) { availCache[vid] = {}; } } return availCache[vid]; };
    let count = 0, semTropa = 0;
    for (const t of eligible) {
      const cm = (t.coord || '').match(/(\d+)\|(\d+)/); if (!cm) continue;
      const tx = +cm[1], ty = +cm[2];
      const rams = config.wall.ramMode === 'fixo' ? Math.max(1, config.wall.ramFixed || 20) : ramsForWall(t.wall, config.wall.ramWall6 || 24);
      // aldeias candidatas, da MAIS PRÓXIMA pra mais longe; usa a 1ª que tiver bárbaro + aríete.
      const cands = myV.map((s) => ({ s: s, d: fieldDist(s.x, s.y, tx, ty) })).sort((a, b) => a.d - b.d);
      let done = false;
      for (const c of cands) {
        const avail = await getAvail(c.s.vid);
        if ((avail.axe || 0) < axeN || (avail.ram || 0) < rams) continue;   // sem tropa nessa origem -> próxima mais próxima
        const spies = Math.min(config.wall.spyCount || 1, avail.spy || 0);
        const amounts = { axe: axeN, ram: rams }; if (spies > 0) amounts.spy = spies;
        try {
          await sendAttack(c.s.vid, tx, ty, amounts);
          avail.axe -= axeN; avail.ram -= rams; avail.spy = (avail.spy || 0) - spies;
          demo[t.reportId] = now; count++; done = true;
          pushLog('Muralha: ' + c.s.name + ' → ' + t.coord + ' (muro ' + t.wall + ', ' + (Math.round(c.d * 10) / 10) + ' campos) com ' + axeN + ' bárbaro + ' + rams + ' aríete' + (spies ? ' + ' + spies + ' explorador' : ''), 'ok', 'wall');
          await sleep(delay + Math.floor(Math.random() * 250));
          break;
        } catch (e) { pushLog('Muralha em ' + c.s.name + ' → ' + t.coord + ': ' + (e.message || e), 'err', 'wall'); }   // falhou nessa origem -> tenta a próxima
      }
      if (!done) semTropa++;
    }
    if (semTropa) pushLog('Muralha: ' + semTropa + ' alvo(s) sem nenhuma aldeia próxima com bárbaro+aríete.', '', 'wall');
    Object.keys(demo).forEach((r) => { if (now - demo[r] > 12 * 3600 * 1000) delete demo[r]; });
    config.wall.sentDemo = demo;
    config.wall.stats = config.wall.stats || {};
    config.wall.stats.pending = pendingWalls;
    config.wall.stats.total = (config.wall.stats.total || 0) + count;
    config.wall.stats.last = count;
    config.wall.nextAt = now + Math.max(60, config.wall.interval || 600) * 1000;
    save();
    refreshCards('wall');
    pushLog('Muralha: ciclo concluído — ' + count + ' ataque(s) de quebra. Próximo em ' + Math.round((config.wall.interval || 600) / 60) + ' min.', 'ok', 'wall');
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
    // Cache-bust (&_=timestamp) + Cache-Control: no-cache — o TW cacheia overview_villages por sessão às vezes.
    // Sem isso, mexer no grupo (add/remove aldeia) pode não refletir aqui até fechar/abrir a aba.
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=' + gid + '&page=-1&_=' + Date.now(), { credentials: 'include', cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
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
    // group=0 força "todas as aldeias": a tela overview_villages é stateful por grupo no servidor,
    // e sem isso o fetch volta só as aldeias do último grupo selecionado (contagem oscilava 13→8→3).
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0&page=-1&_=' + Date.now(), { credentials: 'include', cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
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
  // ==================== TROPAS (helpers de força/pop) ====================
  // Injetados direto na tela do jogo (screen=overview_villages&mode=units).
  // Sem UI no TW Manager, sem requests — só parse do DOM local.
  function unitsForce(totals) {
    let att = 0, def = 0, defCav = 0, defArch = 0, pop = 0, nobles = 0, total = 0;
    UNITS.forEach(([u]) => {
      const n = totals[u] || 0, s = UNIT_STATS[u]; if (!s) return;
      att += n * s.att; def += n * s.def; defCav += n * s.defCav; defArch += n * s.defArch;
      pop += n * s.pop; total += n; if (u === 'snob') nobles = n;
    });
    return { total: total, att: att, def: def, defCav: defCav, defArch: defArch, pop: pop, nobles: nobles };
  }

  // Chave de bucket de 6h (00, 06, 12, 18). Ex.: 2026-07-15T12.
  function unitsBucketKey(ms) {
    const d = new Date(ms || Date.now());
    const bucketH = Math.floor(d.getHours() / 6) * 6;
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(bucketH);
  }

  // Snapshot no bucket atual (sobrescreve o mesmo bucket). Rotaciona por historyDays * 4.
  function unitsSaveSnapshot(byVillage, totals, force) {
    const key = unitsBucketKey();
    const h = config.units.history;
    h[key] = { at: Date.now(), totals: totals, byVillage: byVillage, force: force };
    const maxEntries = (config.units.historyDays || 90) * 4;
    const keys = Object.keys(h).sort();
    while (keys.length > maxEntries) delete h[keys.shift()];
    save();
  }

  // Parse compartilhado entre enhanceUnitsPage (DOM local) e unitsFetchAndSnapshot (fetch).
  // Retorna { totals, byVillage, force, ok }. Se a tabela não existir/mudou, ok=false.
  function unitsParseTable(root) {
    const table = (root || document).getElementById ? (root || document).getElementById('units_table') : root.querySelector('#units_table');
    if (!table) return { ok: false };
    const headImgs = table.querySelectorAll('thead th img[src*="/unit_"]');
    if (!headImgs.length) return { ok: false };
    const colUnits = [];
    headImgs.forEach((img) => {
      const m = (img.getAttribute('src') || '').match(/\/unit_([a-z]+)\.[a-z]+/i);
      colUnits.push(m ? m[1] : null);
    });
    const totals = {}; UNITS.forEach(([u]) => { totals[u] = 0; });
    const byVillage = {};
    const bodies = table.querySelectorAll('tbody.row_marker');
    bodies.forEach((tb) => {
      const totalRow = tb.querySelector('tr[style*="font-weight: bold"]') || tb.querySelector('tr[style*="font-weight:bold"]');
      if (!totalRow) return;
      const nameEl = tb.querySelector('.quickedit-vn[data-id]');
      const vid = nameEl ? String(nameEl.getAttribute('data-id')) : null;
      const labelEl = tb.querySelector('.quickedit-label');
      const rawName = labelEl ? (labelEl.textContent || '').replace(/\s+/g, ' ').trim() : (vid || '?');
      const coordM = rawName.match(/(\d{1,3})\|(\d{1,3})/);
      const coord = coordM ? (coordM[1] + '|' + coordM[2]) : null;
      const cells = totalRow.querySelectorAll('td.unit-item');
      const vTotals = {};
      cells.forEach((td, i) => {
        const unit = colUnits[i]; if (!unit || !UNIT_STATS[unit]) return;
        const n = parseInt((td.textContent || '').replace(/\D/g, ''), 10) || 0;
        vTotals[unit] = n;
        totals[unit] = (totals[unit] || 0) + n;
      });
      if (vid) byVillage[vid] = { name: rawName, coord: coord, totals: vTotals, force: unitsForce(vTotals) };
    });
    return { ok: true, table: table, colUnits: colUnits, totals: totals, byVillage: byVillage, force: unitsForce(totals) };
  }

  // Fetch em background da tela units — usado pelo scheduler quando entra em novo bucket.
  async function unitsFetchAndSnapshot() {
    try {
      const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=units', { credentials: 'include' });
      if (!res.ok) return;
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const p = unitsParseTable(doc);
      if (!p.ok) return;
      unitsSaveSnapshot(p.byVillage, p.totals, p.force);
    } catch (e) { /* silencioso: proximo tick tenta de novo */ }
  }

  // Checa a cada 15min se entramos em bucket novo (00/06/12/18). Se sim, dispara fetch.
  let unitsAutoTimer = null;
  function unitsScheduleAuto() {
    if (unitsAutoTimer) clearInterval(unitsAutoTimer);
    const check = () => {
      const keys = Object.keys(config.units.history || {});
      const last = keys.length ? keys.sort().pop() : null;
      const now = unitsBucketKey();
      if (last !== now) unitsFetchAndSnapshot();
    };
    check(); // ao boot, garante o snapshot do bucket corrente se estiver faltando
    unitsAutoTimer = setInterval(check, 15 * 60 * 1000);
  }

  // Retorna a data (YYYY-MM-DD) mais recente com snapshot cujo daysAgo >= n.
  function unitsFindSnapshotDaysAgo(n) {
    const targetMs = Date.now() - n * 86400000;
    const keys = Object.keys(config.units.history || {}).sort().reverse();
    for (const k of keys) {
      const at = config.units.history[k].at || new Date(k).getTime();
      if (at <= targetMs) return config.units.history[k];
    }
    return null;
  }

  // Desenha um sparkline SVG simples a partir de série [{at, v}].
  function unitsSparkline(series, w, h, color) {
    if (!series.length) return '<svg width="' + w + '" height="' + h + '"></svg>';
    if (series.length === 1) return '<svg width="' + w + '" height="' + h + '"><circle cx="' + (w / 2) + '" cy="' + (h / 2) + '" r="2" fill="' + color + '"/></svg>';
    const vals = series.map((p) => p.v), min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    const range = max - min || 1;
    const pad = 2;
    const pts = series.map((p, i) => {
      const x = pad + (i * (w - pad * 2)) / (series.length - 1);
      const y = (h - pad) - ((p.v - min) / range) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg width="' + w + '" height="' + h + '" style="vertical-align:middle">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.5" points="' + pts + '"/>' +
      '</svg>';
  }

  function unitsDownloadCsv() {
    const rows = [];
    rows.push(['data', 'total_tropas', 'forca_off', 'def_geral', 'def_cav', 'def_arq', 'pop_ocupada', 'nobres']
      .concat(UNITS.map((u) => u[0])).join(','));
    const keys = Object.keys(config.units.history || {}).sort();
    keys.forEach((k) => {
      const s = config.units.history[k];
      const f = s.force || {};
      const row = [k, f.total || 0, f.att || 0, f.def || 0, f.defCav || 0, f.defArch || 0, f.pop || 0, f.nobles || 0];
      UNITS.forEach(([u]) => row.push((s.totals && s.totals[u]) || 0));
      rows.push(row.join(','));
    });
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'tw-tropas-' + WORLD + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Detecta se estamos na tela Visualizações > Tropas, parseia a tabela, salva snapshot
  // e injeta: resumo, deltas, sparklines, botão CSV e linha "TOTAL GERAL" na tabela.
  function enhanceUnitsPage() {
    const gd = window.game_data;
    if (!gd || gd.screen !== 'overview_villages' || gd.mode !== 'units') return;
    if (document.getElementById('twmgr-units-summary')) return;

    const p = unitsParseTable(document);
    if (!p.ok) return;
    const table = p.table, colUnits = p.colUnits, totals = p.totals, byVillage = p.byVillage, f = p.force;
    const fmt = (n) => Number(n).toLocaleString('pt-BR');
    const fmtSigned = (n) => (n >= 0 ? '+' : '') + fmt(n);
    const colorFor = (delta) => delta > 0 ? '#2f7a2f' : (delta < 0 ? '#a52020' : '#6b4a1e');
    const arrowFor = (delta) => delta > 0 ? '↑' : (delta < 0 ? '↓' : '·');

    // 3) Salva snapshot ANTES de calcular deltas (pra ter o de hoje já disponível).
    unitsSaveSnapshot(byVillage, totals, f);

    // 4) Deltas vs snapshots antigos.
    const snapYest = unitsFindSnapshotDaysAgo(1);
    const snap7 = unitsFindSnapshotDaysAgo(7);
    const snap30 = unitsFindSnapshotDaysAgo(30);
    const deltaBlock = (label, snap) => {
      if (!snap || !snap.force) return '<div style="min-width:110px;color:#8f7d57;font-size:10px">' + label + ': —</div>';
      const dTotal = f.total - (snap.force.total || 0);
      const dAtt = f.att - (snap.force.att || 0);
      const dDef = f.def - (snap.force.def || 0);
      return '<div style="min-width:110px;font-size:10px;line-height:1.4">' +
        '<div style="color:#5a3c0f;font-weight:bold">' + label + '</div>' +
        '<div style="color:' + colorFor(dTotal) + '">' + arrowFor(dTotal) + ' tropas ' + fmtSigned(dTotal) + '</div>' +
        '<div style="color:' + colorFor(dAtt) + '">' + arrowFor(dAtt) + ' off ' + fmtSigned(dAtt) + '</div>' +
        '<div style="color:' + colorFor(dDef) + '">' + arrowFor(dDef) + ' def ' + fmtSigned(dDef) + '</div>' +
      '</div>';
    };

    // 5) Séries pra sparklines. Longo (últimos ~30 dias) e "hoje" (últimas 24h).
    const histKeys = Object.keys(config.units.history).sort();
    // Longo prazo: 1 ponto por dia (média dos buckets do dia)
    const byDay = {};
    histKeys.forEach((k) => {
      const day = k.slice(0, 10);
      if (!byDay[day]) byDay[day] = { total: 0, att: 0, def: 0, n: 0, at: 0 };
      const s = config.units.history[k].force || {};
      byDay[day].total += s.total || 0; byDay[day].att += s.att || 0; byDay[day].def += s.def || 0;
      byDay[day].n++; byDay[day].at = Math.max(byDay[day].at, config.units.history[k].at || 0);
    });
    const dayKeys = Object.keys(byDay).sort().slice(-30);
    const seriesTotal = dayKeys.map((d) => ({ at: byDay[d].at, v: Math.round(byDay[d].total / byDay[d].n) }));
    const seriesAtt = dayKeys.map((d) => ({ at: byDay[d].at, v: Math.round(byDay[d].att / byDay[d].n) }));
    const seriesDef = dayKeys.map((d) => ({ at: byDay[d].at, v: Math.round(byDay[d].def / byDay[d].n) }));
    // Curto prazo: últimos 24h de buckets (até 4 pontos)
    const cutoff24h = Date.now() - 24 * 3600 * 1000;
    const todayKeys = histKeys.filter((k) => (config.units.history[k].at || 0) >= cutoff24h);
    const seriesToday = todayKeys.map((k) => ({ at: config.units.history[k].at, v: (config.units.history[k].force || {}).total || 0 }));

    // 6) Bloco de resumo + deltas + sparklines + botão CSV.
    const summary = document.createElement('div');
    summary.id = 'twmgr-units-summary';
    summary.style.cssText = 'margin:6px 0 8px;padding:8px 10px;border:1px solid #7d510a;border-radius:6px;background:linear-gradient(180deg,#f4e4bc,#e8d29a);font-size:12px;color:#3b2914;box-shadow:0 1px 2px rgba(0,0,0,.1)';
    const item = (label, val, big) => '<div style="display:flex;flex-direction:column;align-items:center;min-width:80px"><div style="font-size:' + (big ? '16px' : '13px') + ';font-weight:bold;font-variant-numeric:tabular-nums">' + fmt(val) + '</div><div style="font-size:10px;color:#6b4a1e">' + label + '</div></div>';
    const sparkBlock = (label, series, color) => '<div style="display:flex;flex-direction:column;align-items:center;min-width:110px">' +
      '<div style="font-size:10px;color:#5a3c0f;font-weight:bold">' + label + ' (' + series.length + 'd)</div>' +
      unitsSparkline(series, 110, 28, color) +
      '</div>';
    summary.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px">' +
        '<div style="font-weight:bold;font-size:11px;color:#5a3c0f">🏰 Resumo (TW Manager) · <span style="font-weight:normal;font-size:10px">' + histKeys.length + ' snapshot' + (histKeys.length === 1 ? '' : 's') + ' no histórico</span></div>' +
        '<button id="twmgr-units-csv" style="padding:2px 8px;font-size:10px;border:1px solid #7d510a;border-radius:4px;background:#e8d29a;cursor:pointer;color:#3b2914">📥 baixar histórico CSV</button>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding-bottom:6px;border-bottom:1px dashed #b89a5a">' +
        item('total tropas', f.total, true) +
        item('força ⚔️', f.att) +
        item('def 🛡️', f.def) +
        item('def cav 🐎', f.defCav) +
        item('def arq 🏹', f.defArch) +
        item('pop 🌾', f.pop) +
        item('nobres 👑', f.nobles) +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:16px;padding:6px 0;border-bottom:1px dashed #b89a5a">' +
        deltaBlock('vs ontem', snapYest) +
        deltaBlock('vs 7 dias', snap7) +
        deltaBlock('vs 30 dias', snap30) +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;padding-top:6px;align-items:center">' +
        '<div style="display:flex;flex-direction:column;align-items:center;min-width:110px">' +
          '<div style="font-size:10px;color:#5a3c0f;font-weight:bold">total (hoje ' + seriesToday.length + 'pt)</div>' +
          unitsSparkline(seriesToday, 110, 28, '#7d510a') +
        '</div>' +
        sparkBlock('total (30d)', seriesTotal, '#5a3c0f') +
        sparkBlock('força ⚔️ (30d)', seriesAtt, '#a52020') +
        sparkBlock('def 🛡️ (30d)', seriesDef, '#2f6b2f') +
      '</div>';
    table.parentNode.insertBefore(summary, table);
    const csvBtn = document.getElementById('twmgr-units-csv');
    if (csvBtn) csvBtn.addEventListener('click', unitsDownloadCsv);

    // 7) Nova tbody "TOTAL GERAL" no final da tabela.
    const nCols = table.querySelectorAll('thead th').length;
    const totalBody = document.createElement('tbody');
    totalBody.id = 'twmgr-units-grandtotal';
    let cellsHtml = '<td style="padding:4px 6px;color:#5a3c0f">TOTAL GERAL</td><td></td>';
    colUnits.forEach((unit) => {
      const n = (unit && totals[unit]) || 0;
      cellsHtml += '<td class="unit-item" style="text-align:center">' + (n > 0 ? fmt(n) : '0') + '</td>';
    });
    const emittedCols = 2 + colUnits.length;
    for (let i = emittedCols; i < nCols; i++) cellsHtml += '<td></td>';
    totalBody.innerHTML = '<tr style="background:linear-gradient(180deg,#f4e4bc,#e8d29a);font-weight:bold;font-size:13px;color:#3b2914;border-top:2px solid #7d510a">' + cellsHtml + '</tr>';
    table.appendChild(totalBody);
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
    // Vai DIRETO no input de cada unidade e sobe pro <tr> dela (closest) — evita casar com uma <tr>
    // ancestral que embrulha a página (bug: lia o menu inteiro e total virava lixo, excluindo a unidade).
    const units = {};
    RUNITS.forEach(([u]) => {
      let inp = doc.querySelector('input[name="' + u + '"]');
      let row = inp ? inp.closest('tr') : null;
      if (!row) { const img = doc.querySelector('img[src*="unit_' + u + '."], img[src*="unit_' + u + '_"]'); if (img) row = img.closest('tr'); }
      if (!row) return;
      const txt = (row.textContent || '').replace(/\s+/g, ' ').trim();
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
      // TEMPO IGUAL por unidade do edifício (fila 2h, 2 unid = 1h cada; 3 unid = 1/3 cada).
      // Quem atinge o ALVO (teto) sai e LIBERA o tempo dela, redistribuído entre as que ainda faltam (water-filling).
      const rem = list.map((x) => x.capped ? Math.max(0, x.t - x.su.total) : Infinity);   // teto restante por unidade (Infinity = contínua)
      const want = list.map(() => 0);
      let pool = needSec, act = list.map((x, i) => i).filter((i) => rem[i] > 0);
      while (act.length) {
        const share = pool / act.length;
        const maxed = act.filter((i) => rem[i] !== Infinity && rem[i] * list[i].su.buildTime <= share);
        if (maxed.length) { maxed.forEach((i) => { want[i] = rem[i]; pool -= rem[i] * list[i].su.buildTime; }); act = act.filter((i) => maxed.indexOf(i) < 0); }
        else { act.forEach((i) => { want[i] = Math.floor(share / list[i].su.buildTime); }); break; }
      }
      // custo total desejado (vira demanda pro Equilíbrio abastecer)
      let cw = 0, cs = 0, ci = 0, cp = 0;
      list.forEach((x, i) => { cw += want[i] * x.su.wood; cs += want[i] * x.su.stone; ci += want[i] * x.su.iron; cp += want[i] * x.su.pop; });
      wantCost.wood += cw; wantCost.stone += cs; wantCost.iron += ci;
      // 2) UM fator de escala pra tudo caber no recurso/pop disponível, mantendo a PROPORÇÃO (crescem juntas)
      let f = 1;
      if (cw > 0) f = Math.min(f, res.wood / cw);
      if (cs > 0) f = Math.min(f, res.stone / cs);
      if (ci > 0) f = Math.min(f, res.iron / ci);
      if (cp > 0) f = Math.min(f, popFree / cp);
      if (!(f > 0)) f = 0;
      let added = 0;
      list.forEach((x, i) => {
        const n = Math.floor(want[i] * f);
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
    catch (e) { pushLog('Recrutar: erro ao resolver os alvos (' + (e.message || e) + ').', 'err', 'recruit'); config.recruit.nextAt = now + 120000; save(); scheduleRecruit(); return; }
    const vids = Object.keys(map);
    if (!vids.length) { pushLog('Recrutar: nenhum grupo mapeado com aldeias.', '', 'recruit'); config.recruit.nextAt = now + 300000; save(); scheduleRecruit(); return; }
    let totalSent = 0;
    for (const vid of vids) {
      const targets = map[vid].targets || {};
      if (!Object.keys(targets).length) continue;
      let state;
      try { state = await getRecruitState(vid); }
      catch (e) { pushLog('Recrutar em ' + (map[vid].name || vid) + ': erro ao ler o estado (' + (e.message || e) + ').', 'err', 'recruit'); continue; }
      const queuedSec = state.queuedSec || { barracks: 0, stable: 0, garage: 0 };  // FILA REAL lida da tela
      const { amounts, reason, wantCost } = computeRecruit(state, targets, config.recruit, queuedSec);
      config.recruit.demand = config.recruit.demand || {};
      config.recruit.demand[vid] = wantCost || { wood: 0, stone: 0, iron: 0 };  // demanda de recrutar p/ Equilíbrio
      const fmtm = (s) => Math.floor(s / 3600) + 'h' + String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const qStr = 'fila quartel ' + fmtm(queuedSec.barracks) + ', estábulo ' + fmtm(queuedSec.stable) + ', oficina ' + fmtm(queuedSec.garage);
      const nm = map[vid].name || vid;
      if (Object.keys(amounts).length) {
        try {
          await sendRecruit(vid, amounts);
          pushLog('Recrutar: ' + nm + ' → ' + Object.entries(amounts).map(([u, n]) => n + ' ' + u).join(', ') + ' (' + qStr + ')', 'ok', 'recruit');
          totalSent++;
        } catch (e) { pushLog('Recrutar em ' + nm + ': ' + (e.message || e), 'err', 'recruit'); }
      } else {
        pushLog(nm + ': nada a recrutar — ' + reason + ' (' + qStr + ')', '', 'recruit');
      }
      await sleep(300);
    }
    config.recruit.stats = config.recruit.stats || {};
    config.recruit.stats.villages = vids.length;
    config.recruit.nextAt = now + Math.max(60, config.recruit.interval || 600) * 1000;
    save();
    refreshCards('recruit');
    pushLog('Recrutar: ciclo concluído — repôs em ' + totalSent + ' aldeia(s). Próximo em ' + Math.round((config.recruit.interval || 600) / 60) + ' min.', 'ok', 'recruit');
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
  function recruitStart() { readRecruitCfg(); if (!config.recruit.groupAtk && !config.recruit.groupDef) { pushLog('Recrutar: mapeie ao menos 1 grupo (ATK ou DEF).', 'err', 'recruit'); return; } config.recruit.running = true; config.recruit.nextAt = 0; save(); setRecruitStatus(true); pushLog('Recrutar iniciado.', 'ok', 'recruit'); recruitTick(); }
  function recruitStop() { readRecruitCfg(); config.recruit.running = false; save(); clearTimeout(recruitTimer); setRecruitStatus(false); pushLog('Recrutar parado.', '', 'recruit'); }
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
  async function fakePrepare(vid, x, y, amounts, kind) {
    const p1 = new URLSearchParams();
    Object.entries(amounts).forEach(([u, a]) => p1.set(u, String(a)));
    p1.set('x', String(x)); p1.set('y', String(y)); p1.set('input', x + '|' + y);
    if (kind === 'support') p1.set('support', 'l'); else p1.set('attack', 'l');
    p1.set('h', CSRF);
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
  const attackPrepare = fakePrepare, attackFire = fakeFire;
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
    return { avail: applyReservationsToAvail(vid, avail), popMax: popMax };
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
    if (!targets.length) { pushLog('Fakes: nenhum alvo válido colado.', 'err', 'fakes'); return null; }
    if (!origins.length) { pushLog('Fakes: selecione ao menos 1 origem.', 'err', 'fakes'); return null; }
    if (!cfg.arrLocal) { pushLog('Fakes: defina o horário de chegada.', 'err', 'fakes'); return null; }
    const arriveAt = arrivalToServerMs(cfg.arrLocal);
    let points = {}; try { points = await getVillagePoints(); } catch (e) { pushLog('Fakes: não li os pontos (village.txt), usando a fazenda como base.', 'err', 'fakes'); }
    const pairs = [];
    if (cfg.mode === 'all') { origins.forEach((o) => targets.forEach((t) => pairs.push({ origin: o, x: t.x, y: t.y }))); }
    else { targets.forEach((t, i) => { pairs.push({ origin: origins[i % origins.length], x: t.x, y: t.y }); }); }
    const byO = {}; pairs.forEach((p) => { (byO[p.origin] = byO[p.origin] || []).push(p); });
    const gen = [];
    for (const o of Object.keys(byO)) {
      let st; try { st = await getFakeVillage(o); } catch (e) { pushLog('Fakes: erro ao ler a aldeia ' + o + ' (' + (e.message || e) + ').', 'err', 'fakes'); continue; }
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
      pushLog(o + ': ' + made + ' fake(s)' + (failed ? ', ' + failed + ' sem tropa' : '') + ' · teto ' + cap.total + ' (' + cap.withSiege + ' c/ isca) · ' + cdesc + ' · pop mín ' + T + (points[o] ? ' (1% de ' + points[o] + ' pts)' : ''), '', 'fakes');
    }
    pushLog('Fakes ' + (preview ? '(prévia)' : 'gerados') + ': ' + gen.length + ' no total, chega ' + (cfg.arrLocal || '').replace('T', ' ') + '.', 'ok', 'fakes');
    return gen;
  }
  function scheduleFakeFire(f) {
    const lead = 12000;
    const delayPrep = Math.max(0, (f.sendAt - lead) - serverNow());
    setTimeout(async () => {
      if (!config.fakes.running || f.state !== 'scheduled' || lockOther()) return;
      let prep;
      try { prep = await fakePrepare(f.origin, f.x, f.y, f.amounts); }
      catch (e) { f.state = 'error'; f.error = (e.message || e); save(); pushLog('Fake ' + f.x + '|' + f.y + ': preparo falhou (' + f.error + ').', 'err', 'fakes'); return; }
      const fireDelay = Math.max(0, (f.sendAt - config.fakes.offsetMs) - serverNow());
      setTimeout(async () => {
        if (!config.fakes.running || f.state !== 'scheduled' || lockOther()) return;
        try { await fakeFire(prep); f.state = 'sent'; f.sentAt = serverNow(); pushLog('🎭 Fake enviado → ' + f.x + '|' + f.y + ' (de ' + f.origin + ')', 'ok', 'fakes'); }
        catch (e) { f.state = 'error'; f.error = (e.message || e); pushLog('Fake ' + f.x + '|' + f.y + ': envio falhou (' + f.error + ').', 'err', 'fakes'); }
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
        catch (e) { f.state = 'error'; f.error = (e.message || e); pushLog('Fake ' + f.x + '|' + f.y + ': ' + f.error, 'err', 'fakes'); continue; }
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
  async function fakePreview() { await fakeGenerate(true); }
  function setFakeStatus(on) { setBtnState('twmgr-fk-start', 'twmgr-fk-stop', on, '● Armado', '▶ Armar'); }
  async function fakeStart() {
    const gen = await fakeGenerate(false);
    if (!gen || !gen.length) return;
    config.fakes.gen = gen; config.fakes.running = true; save();
    setFakeStatus(true); pushLog('Fakes armados — ' + gen.length + ' no total.', 'ok', 'fakes'); fakeTick();
  }
  function fakeStop() { readFakesCfg(); config.fakes.running = false; save(); clearTimeout(fakeTimer); setFakeStatus(false); pushLog('Fakes desarmados.', '', 'fakes'); }

  // ==================== PLANNER (Ataque Coordenado) ====================
  // Lê o "home available" — tropas em casa (aproximação: usa o max do input do jogo se disponível,
  // senão cai no data-all-count do link geral). O Fase 3 (UI) confirma o parser no jogo real.
  async function getVillageHomeAvail(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=place', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const home = {};
    UNITS.forEach(([u]) => {
      let n = 0;
      const inp = doc.querySelector('#unit_input_' + u);
      if (inp) {
        // placeholder típico: "0/N" onde N é o total em casa
        const ph = inp.getAttribute('placeholder') || '';
        const mm = ph.match(/(\d+)\s*\/\s*(\d+)/);
        if (mm) n = parseInt(mm[2], 10) || 0;
        if (!n) { const mx = inp.getAttribute('data-max') || inp.getAttribute('max') || inp.getAttribute('data-all-count-home'); if (mx) n = parseInt(mx, 10) || 0; }
      }
      if (!n) {
        const alt = doc.querySelector('a.units-entry-all[data-unit="' + u + '"]');
        if (alt) { const dc = alt.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (alt.textContent || '').replace(/\D/g, ''), 10) || 0; }
      }
      home[u] = isNaN(n) ? 0 : n;
    });
    return home;
  }

  const OFF_UNITS = ['spear', 'sword', 'axe', 'archer', 'light', 'marcher', 'heavy', 'ram', 'catapult'];
  const DEF_UNITS = ['spear', 'sword', 'archer', 'heavy', 'knight'];
  const NOBLE_ESCORT_PCT = 0.6;
  const FAKE_MIN_POP = 5;

  // Dado um preset e o avail (home) de uma aldeia, retorna { amounts, warn: [...] }.
  function computePreset(kind, avail) {
    const amounts = {}; const warn = [];
    const av = (u) => avail[u] || 0;
    if (kind === 'zero') return { amounts: {}, warn: [] };
    if (kind === 'attack') {
      OFF_UNITS.forEach((u) => { if (av(u) > 0) amounts[u] = av(u); });
      if (Object.keys(amounts).length === 0) warn.push('sem tropas de ataque');
      return { amounts: amounts, warn: warn };
    }
    if (kind === 'noble') {
      if (av('snob') < 1) { warn.push('sem nobre'); return { amounts: amounts, warn: warn }; }
      amounts.snob = 1;
      OFF_UNITS.forEach((u) => { const q = Math.floor(av(u) * NOBLE_ESCORT_PCT); if (q > 0) amounts[u] = q; });
      return { amounts: amounts, warn: warn };
    }
    if (kind === 'fake') {
      let siege = null;
      if (av('ram') >= 1) siege = 'ram';
      else if (av('catapult') >= 1) siege = 'catapult';
      let pop = 0;
      if (siege) { amounts[siege] = 1; pop += FAKE_POP[siege] || 5; }
      else warn.push('sem ram/catapult, fake sem siege');
      const need = Math.max(0, FAKE_MIN_POP - pop);
      if (need > 0) {
        const spies = Math.min(av('spy'), Math.ceil(need / (FAKE_POP.spy || 2)));
        if (spies > 0) amounts.spy = spies;
        else warn.push('sem spy pra completar 5 pop');
      }
      return { amounts: amounts, warn: warn };
    }
    if (kind === 'support') {
      DEF_UNITS.forEach((u) => { if (av(u) > 0) amounts[u] = av(u); });
      if (Object.keys(amounts).length === 0) warn.push('sem tropas de defesa');
      return { amounts: amounts, warn: warn };
    }
    return { amounts: amounts, warn: ['kind desconhecido: ' + kind] };
  }

  // Retorna o ataque atualmente exibido na aba Coordenado (ou o primeiro, se o ativo sumiu).
  function plActive() {
    const p = config.planner;
    return p.attacks.find((a) => a.id === p.activeId) || p.attacks[0];
  }

  // Soma reservas de TODOS os ataques (armados usam rows; em edição usam perVillage) — uma aldeia
  // pode participar de vários ataques ao mesmo tempo, então as reservas se acumulam.
  function plannerRecomputeReservations() {
    const res = {};
    const attacks = (config.planner && config.planner.attacks) || [];
    attacks.forEach((atk) => {
      if (atk.running && Array.isArray(atk.rows)) {
        atk.rows.forEach((r) => {
          if (r.state !== 'armed' && r.state !== 'scheduled') return;
          const vid = String(r.origin); res[vid] = res[vid] || {};
          Object.entries(r.amounts || {}).forEach(([u, q]) => { res[vid][u] = (res[vid][u] || 0) + (parseInt(q, 10) || 0); });
        });
      } else {
        Object.keys(atk.selected || {}).forEach((vid) => {
          if (!atk.selected[vid]) return;
          const waves = (atk.perVillage || {})[vid]; if (!waves) return;
          res[vid] = res[vid] || {};
          waves.forEach((pv) => {
            Object.entries(pv.amounts || {}).forEach(([u, q]) => { const n = parseInt(q, 10) || 0; if (n > 0) res[vid][u] = (res[vid][u] || 0) + n; });
          });
        });
      }
    });
    config.reservations = res;
    save();
  }

  // Converte perVillage (agora uma LISTA de ondas por aldeia) de UM ataque em rows[] — 1 linha por onda,
  // cada onda com seu próprio horário (base + offset).
  function plannerBuildRows(atk) {
    const baseMs = arrivalToServerMs(atk.arriveLocal); if (!baseMs) throw new Error('chegada base inválida');
    const rows = [];
    Object.keys(atk.selected || {}).forEach((vid) => {
      if (!atk.selected[vid]) return;
      const waves = (atk.perVillage || {})[vid]; if (!waves || !waves.length) return;
      waves.forEach((pv) => {
        const amounts = {}; let any = false;
        Object.entries(pv.amounts || {}).forEach(([u, q]) => { const n = parseInt(q, 10) || 0; if (n > 0) { amounts[u] = n; any = true; } });
        if (!any) return;
        rows.push({
          id: genId(), origin: String(vid), x: String(atk.targetX), y: String(atk.targetY),
          kind: pv.kind || 'attack', amounts: amounts,
          arriveAt: baseMs + (pv.offsetMs || 0), offsetMs: pv.offsetMs || 0,
          durSec: null, sendAt: 0, state: 'armed', error: null, sentAt: null,
        });
      });
    });
    atk.rows = rows;
    return rows;
  }

  const PL_ICON = { attack: '🧹', noble: '👑', fake: '🎭', support: '🛡️' };

  function schedulePlannerFire(atk, r) {
    const lead = 12000;
    const delayPrep = Math.max(0, (r.sendAt - lead) - serverNow());
    setTimeout(async () => {
      if (!atk.running || r.state !== 'scheduled' || lockOther()) return;
      let prep;
      try { prep = await attackPrepare(r.origin, r.x, r.y, r.amounts, r.kind); }
      catch (e) { r.state = 'error'; r.error = (e.message || e); save(); plannerRecomputeReservations(); pushLog((PL_ICON[r.kind] || '') + ' [' + atk.name + '] ' + r.kind + ' ' + r.x + '|' + r.y + ': preparo falhou (' + r.error + ').', 'err', 'planner'); return; }
      const fireDelay = Math.max(0, (r.sendAt - (atk.offsetMs || 0)) - serverNow());
      setTimeout(async () => {
        if (!atk.running || r.state !== 'scheduled' || lockOther()) return;
        try { await attackFire(prep); r.state = 'sent'; r.sentAt = serverNow(); pushLog((PL_ICON[r.kind] || '') + ' [' + atk.name + '] ' + r.kind + ' enviado → ' + r.x + '|' + r.y + ' (de ' + r.origin + ')', 'ok', 'planner'); }
        catch (e) { r.state = 'error'; r.error = (e.message || e); pushLog((PL_ICON[r.kind] || '') + ' [' + atk.name + '] ' + r.kind + ' ' + r.x + '|' + r.y + ': envio falhou (' + r.error + ').', 'err', 'planner'); }
        save(); plannerRecomputeReservations();
      }, fireDelay);
    }, delayPrep);
  }

  // Tick único e global: percorre TODOS os ataques armados (cada um pode estar mirando alvo/horário diferentes).
  async function plannerTick() {
    clearTimeout(plannerTimer);
    const attacks = (config.planner && config.planner.attacks) || [];
    if (!attacks.some((a) => a.running)) return;
    if (lockOther()) { plannerTimer = setTimeout(plannerTick, 5000); return; }
    claimLock();
    const nowS = serverNow();
    for (const atk of attacks) {
      if (!atk.running) continue;
      for (const r of atk.rows) {
        if (r.state === 'sent' || r.state === 'error' || r.state === 'scheduled') continue;
        if (!r.arriveAt) { r.state = 'error'; r.error = 'sem horário'; continue; }
        if (r.durSec == null) {
          try { const p = await attackPrepare(r.origin, r.x, r.y, r.amounts, r.kind); r.durSec = p.dur; }
          catch (e) { r.state = 'error'; r.error = (e.message || e); pushLog((PL_ICON[r.kind] || '') + ' [' + atk.name + '] ' + r.kind + ' ' + r.x + '|' + r.y + ': ' + r.error, 'err', 'planner'); continue; }
          if (!r.durSec) { r.state = 'error'; r.error = 'sem duração'; continue; }
        }
        r.sendAt = r.arriveAt - r.durSec * 1000;
        if (r.sendAt - nowS < -2000) { r.state = 'error'; r.error = 'envio no passado'; continue; }
        r.state = 'scheduled'; schedulePlannerFire(atk, r);
      }
    }
    save();
    plannerTimer = setTimeout(plannerTick, 30000);
  }

  function plannerStart(atk) {
    if (!atk.targetX || !atk.targetY) { pushLog('[' + atk.name + ']: informe o alvo (x|y).', 'err', 'planner'); return; }
    if (!atk.arriveLocal) { pushLog('[' + atk.name + ']: informe a chegada base.', 'err', 'planner'); return; }
    let rows;
    try { rows = plannerBuildRows(atk); } catch (e) { pushLog('[' + atk.name + ']: ' + (e.message || e), 'err', 'planner'); return; }
    if (!rows.length) { pushLog('[' + atk.name + ']: nenhuma aldeia com tropas configuradas.', 'err', 'planner'); return; }
    atk.running = true;
    save();
    plannerRecomputeReservations();
    pushLog('🎯 [' + atk.name + '] armado — ' + rows.length + ' ataque(s) contra ' + atk.targetX + '|' + atk.targetY + '.', 'ok', 'planner');
    plannerTick();
  }

  function plannerStop(atk) {
    atk.running = false;
    atk.rows = [];
    save();
    plannerRecomputeReservations();
    pushLog('🎯 [' + atk.name + '] desarmado.', '', 'planner');
    if (!config.planner.attacks.some((a) => a.running)) clearTimeout(plannerTimer);
  }

  // Cache de aldeias (nome/coord) para render dos cards saber o nome.
  let _plVilCache = null;

  async function renderPlannerVillages(atk) {
    const cont = document.getElementById('twmgr-pl-villages'); if (!cont) return;
    let vils = []; try { vils = await getAllVillages(); } catch (e) { vils = [{ vid: CUR_VID, name: CUR_NAME }]; }
    _plVilCache = vils;
    const tgtCoord = (atk.targetX && atk.targetY) ? (atk.targetX + '|' + atk.targetY) : '';
    vils.forEach((v) => { v.dist = (v.coord && tgtCoord) ? coordDist(v.coord, tgtCoord) : null; });
    vils.sort((a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist));
    cont.innerHTML = vils.map((v) => {
      const distTxt = v.dist != null ? (' · dist ' + v.dist.toFixed(1)) : '';
      return '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#d3c299;margin:1px 0"><input type="checkbox" class="twmgr-pl-vil" data-vid="' + v.vid + '"' + (atk.selected[v.vid] ? ' checked' : '') + '>' + esc(v.name) + '<span style="color:#8f7d57">' + distTxt + '</span></label>';
    }).join('');
    cont.querySelectorAll('.twmgr-pl-vil').forEach((cb) => cb.addEventListener('change', () => {
      const vid = cb.getAttribute('data-vid');
      if (cb.checked) { atk.selected[vid] = true; if (!atk.perVillage[vid] || !atk.perVillage[vid].length) atk.perVillage[vid] = [{ kind: 'attack', offsetMs: 0, amounts: {} }]; }
      else { delete atk.selected[vid]; delete atk.perVillage[vid]; delete atk.homeAvail[vid]; }
      save(); plannerRecomputeReservations(); renderPlannerCards(atk);
    }));
  }

  // Retorna "HH:MM:SS.mmm" (local) para um arriveAt em ms de servidor.
  function fmtArriveLocal(arriveMsServer) {
    if (!arriveMsServer) return '';
    const d = new Date(arriveMsServer - wallToServerOffset());
    const pad = (n, w) => String(n).padStart(w, '0');
    return pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2) + '.' + pad(d.getMilliseconds(), 3);
  }

  // Cada aldeia pode ter várias ONDAS (waves) — cada onda é um ataque/nobre/fake/apoio próprio, com seu
  // próprio horário de chegada, dentro do mesmo ataque coordenado.
  function renderPlannerCards(atk) {
    const cont = document.getElementById('twmgr-pl-cards'); if (!cont) return;
    const sel = Object.keys(atk.selected || {}).filter((v) => atk.selected[v]);
    if (!sel.length) {
      cont.innerHTML = '<div style="font-size:10px;color:#8f7d57;padding:6px;text-align:center">— marque aldeias acima e clique em <b>🔄 carregar tropas</b> —</div>';
      return;
    }
    const vilBy = {}; (_plVilCache || []).forEach((v) => { vilBy[v.vid] = v; });
    const baseMs = arrivalToServerMs(atk.arriveLocal);
    const kindOpt = [['attack', '🧹 attack'], ['noble', '👑 noble'], ['fake', '🎭 fake'], ['support', '🛡️ support']];
    cont.innerHTML = sel.map((vid) => {
      const waves = atk.perVillage[vid] || [];
      const home = atk.homeAvail[vid] || {};
      const loaded = home.loadedAt || 0;
      const v = vilBy[vid] || { name: 'ID ' + vid };
      const warnTxt = loaded ? '' : '<span style="color:#ff9560;font-size:9px">⚠ tropas não carregadas</span>';
      const wavesHTML = waves.map((pv, widx) => {
        const kindSel = kindOpt.map(([k, l]) => '<option value="' + k + '"' + (pv.kind === k ? ' selected' : '') + '>' + l + '</option>').join('');
        const arrTxt = baseMs ? fmtArriveLocal(baseMs + (pv.offsetMs || 0)) : '—';
        const grid = UNITS.map(([u, lbl]) => {
          const max = home[u] || 0, cur = (pv.amounts && pv.amounts[u]) || 0;
          return '<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#d3c299"><span style="width:56px">' + unitIcon(u, lbl) + '</span><input class="twmgr-pl-amt" data-vid="' + vid + '" data-widx="' + widx + '" data-u="' + u + '" type="number" min="0" max="' + max + '" value="' + cur + '" style="width:56px" /><span style="color:#8f7d57">/' + max + '</span></label>';
        }).join('');
        return '<div style="border-top:1px dashed #3a2c1a;padding-top:6px;margin-top:6px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px">' +
            '<div style="font-size:10px;color:#8f7d57">Onda ' + (widx + 1) + '</div>' +
            '<div style="display:flex;gap:4px;align-items:center;font-size:10px">' +
              '<select class="twmgr-pl-kind" data-vid="' + vid + '" data-widx="' + widx + '" style="font-size:10px">' + kindSel + '</select>' +
              '<span>off</span><input class="twmgr-pl-off" data-vid="' + vid + '" data-widx="' + widx + '" type="number" value="' + (pv.offsetMs || 0) + '" step="100" style="width:64px;font-size:10px"><span>ms</span>' +
              '<span class="twmgr-pl-wave-del" data-vid="' + vid + '" data-widx="' + widx + '" title="remover onda" style="cursor:pointer;opacity:.7">✕</span>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:10px;color:#8f7d57;margin-bottom:4px">→ chega às <b style="color:#d3c299">' + arrTxt + '</b></div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px">' + grid + '</div>' +
          '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">' +
            '<button class="twmgr-pl-preset twmgr-btn twmgr-ghost" data-vid="' + vid + '" data-widx="' + widx + '" data-preset="attack" style="padding:3px 6px;font-size:10px">🧹 all off</button>' +
            '<button class="twmgr-pl-preset twmgr-btn twmgr-ghost" data-vid="' + vid + '" data-widx="' + widx + '" data-preset="noble" style="padding:3px 6px;font-size:10px">👑 nobre</button>' +
            '<button class="twmgr-pl-preset twmgr-btn twmgr-ghost" data-vid="' + vid + '" data-widx="' + widx + '" data-preset="fake" style="padding:3px 6px;font-size:10px">🎭 fake</button>' +
            '<button class="twmgr-pl-preset twmgr-btn twmgr-ghost" data-vid="' + vid + '" data-widx="' + widx + '" data-preset="support" style="padding:3px 6px;font-size:10px">🛡️ all def</button>' +
            '<button class="twmgr-pl-preset twmgr-btn twmgr-ghost" data-vid="' + vid + '" data-widx="' + widx + '" data-preset="zero" style="padding:3px 6px;font-size:10px">Zerar</button>' +
          '</div>' +
        '</div>';
      }).join('');
      return '<div style="border:1px solid #3a2c1a;border-radius:6px;padding:6px;margin:6px 0">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px">' +
          '<div style="font-size:11px;color:#e6cf7d"><b>' + esc(v.name) + '</b> ' + warnTxt + '</div>' +
          '<span class="twmgr-pl-wave-add" data-vid="' + vid + '" title="adicionar onda" style="cursor:pointer;font-size:10px;color:#e6cf7d;border:1px dashed #5c4a29;border-radius:4px;padding:2px 6px">+ onda</span>' +
        '</div>' +
        wavesHTML +
      '</div>';
    }).join('');
    // Wire eventos dos cards
    cont.querySelectorAll('.twmgr-pl-kind').forEach((el) => el.addEventListener('change', readPlannerCfg));
    cont.querySelectorAll('.twmgr-pl-off').forEach((el) => el.addEventListener('change', readPlannerCfg));
    cont.querySelectorAll('.twmgr-pl-amt').forEach((el) => el.addEventListener('change', readPlannerCfg));
    cont.querySelectorAll('.twmgr-pl-wave-add').forEach((el) => el.addEventListener('click', () => {
      const vid = el.getAttribute('data-vid');
      atk.perVillage[vid] = atk.perVillage[vid] || [];
      // Nova onda herda offset = max(existentes) + 200ms, pra chegar sempre depois da anterior sem colidir.
      const maxOff = atk.perVillage[vid].reduce((m, w) => Math.max(m, w.offsetMs || 0), 0);
      const nextOff = atk.perVillage[vid].length ? maxOff + 200 : 0;
      atk.perVillage[vid].push({ kind: 'attack', offsetMs: nextOff, amounts: {} });
      save(); renderPlannerCards(atk);
    }));
    cont.querySelectorAll('.twmgr-pl-wave-del').forEach((el) => el.addEventListener('click', () => {
      const vid = el.getAttribute('data-vid'), widx = parseInt(el.getAttribute('data-widx'), 10);
      if (atk.perVillage[vid]) atk.perVillage[vid].splice(widx, 1);
      save(); plannerRecomputeReservations(); renderPlannerCards(atk);
    }));
    cont.querySelectorAll('.twmgr-pl-preset').forEach((btn) => btn.addEventListener('click', () => {
      const vid = btn.getAttribute('data-vid'), widx = parseInt(btn.getAttribute('data-widx'), 10), preset = btn.getAttribute('data-preset');
      const avail = atk.homeAvail[vid] || {};
      const r = computePreset(preset, avail);
      atk.perVillage[vid] = atk.perVillage[vid] || [];
      atk.perVillage[vid][widx] = atk.perVillage[vid][widx] || { kind: 'attack', offsetMs: 0, amounts: {} };
      atk.perVillage[vid][widx].amounts = r.amounts;
      if (r.warn.length) pushLog('Preset ' + preset + ' em ' + vid + ': ' + r.warn.join(', '), 'err', 'planner');
      save(); plannerRecomputeReservations(); renderPlannerCards(atk);
    }));
  }

  async function plannerLoadHomeAvail(atk) {
    const sel = Object.keys(atk.selected || {}).filter((v) => atk.selected[v]);
    if (!sel.length) { pushLog('Marque pelo menos 1 aldeia antes de carregar tropas.', 'err', 'planner'); return; }
    pushLog('[' + atk.name + ']: carregando tropas de ' + sel.length + ' aldeia(s)…', '', 'planner');
    const results = await Promise.allSettled(sel.map((vid) => getVillageHomeAvail(vid).then((h) => ({ vid, h }))));
    let ok = 0, fail = 0;
    results.forEach((r) => {
      if (r.status === 'fulfilled') { const h = r.value.h; h.loadedAt = Date.now(); atk.homeAvail[r.value.vid] = h; ok++; }
      else fail++;
    });
    save();
    pushLog('[' + atk.name + ']: tropas carregadas em ' + ok + '/' + sel.length + (fail ? ' (' + fail + ' falharam)' : '') + '.', ok ? 'ok' : 'err', 'planner');
    renderPlannerCards(atk);
  }

  // Lê os campos da UI (que sempre refletem o ataque ATIVO) de volta pro objeto do ataque ativo.
  function readPlannerCfg() {
    const atk = plActive(), g = (id) => document.getElementById(id);
    if (g('twmgr-pl-target-x')) atk.targetX = (g('twmgr-pl-target-x').value || '').replace(/\D/g, '');
    if (g('twmgr-pl-target-y')) atk.targetY = (g('twmgr-pl-target-y').value || '').replace(/\D/g, '');
    if (g('twmgr-pl-arr')) atk.arriveLocal = g('twmgr-pl-arr').value;
    if (g('twmgr-pl-offset')) atk.offsetMs = Math.max(0, parseInt(g('twmgr-pl-offset').value, 10) || 150);
    document.querySelectorAll('.twmgr-pl-kind').forEach((s) => { const vid = s.getAttribute('data-vid'), widx = parseInt(s.getAttribute('data-widx'), 10); const w = atk.perVillage[vid] && atk.perVillage[vid][widx]; if (w) w.kind = s.value; });
    document.querySelectorAll('.twmgr-pl-off').forEach((s) => { const vid = s.getAttribute('data-vid'), widx = parseInt(s.getAttribute('data-widx'), 10); const w = atk.perVillage[vid] && atk.perVillage[vid][widx]; if (w) w.offsetMs = parseInt(s.value, 10) || 0; });
    document.querySelectorAll('.twmgr-pl-amt').forEach((s) => {
      const vid = s.getAttribute('data-vid'), widx = parseInt(s.getAttribute('data-widx'), 10), u = s.getAttribute('data-u');
      const w = atk.perVillage[vid] && atk.perVillage[vid][widx];
      if (w) { const n = Math.max(0, parseInt(s.value, 10) || 0); if (n > 0) w.amounts[u] = n; else delete w.amounts[u]; }
    });
    save(); plannerRecomputeReservations();
  }

  function setPlannerStatus(on) { setBtnState('twmgr-pl-start', 'twmgr-pl-stop', on, '● Armado', '▶ Armar este ataque'); }

  // ---- Lista de ataques independentes (adicionar/trocar/renomear/remover) ----
  function plannerAddAttack() {
    const n = (config.planner.attacks || []).length + 1;
    const atk = defPlannerAttack('Ataque ' + n);
    config.planner.attacks.push(atk);
    config.planner.activeId = atk.id;
    save();
    renderPlannerTabs();
    renderPlannerActive();
    pushLog('Novo ataque criado: [' + atk.name + '].', '', 'planner');
  }

  function plannerRemoveAttack(id) {
    const atk = config.planner.attacks.find((a) => a.id === id); if (!atk) return;
    if (config.planner.attacks.length <= 1) { pushLog('Precisa manter pelo menos 1 ataque.', 'err', 'planner'); return; }
    if (!confirm('Remover [' + atk.name + ']?' + (atk.running ? ' Ele está armado — será desarmado.' : ''))) return;
    if (atk.running) plannerStop(atk);
    config.planner.attacks = config.planner.attacks.filter((a) => a.id !== id);
    if (config.planner.activeId === id) config.planner.activeId = config.planner.attacks[0].id;
    save(); plannerRecomputeReservations();
    renderPlannerTabs();
    renderPlannerActive();
  }

  function plannerRenameAttack(id) {
    const atk = config.planner.attacks.find((a) => a.id === id); if (!atk) return;
    const name = prompt('Nome do ataque:', atk.name);
    if (!name || !name.trim()) return;
    atk.name = name.trim();
    save(); renderPlannerTabs();
  }

  function plannerSwitchAttack(id) {
    if (!config.planner.attacks.some((a) => a.id === id)) return;
    config.planner.activeId = id;
    save();
    renderPlannerTabs();
    renderPlannerActive();
  }

  function renderPlannerTabs() {
    const cont = document.getElementById('twmgr-pl-attacks'); if (!cont) return;
    const p = config.planner;
    cont.innerHTML = p.attacks.map((atk) => {
      const active = atk.id === p.activeId;
      return '<div class="twmgr-pl-tab' + (active ? ' active' : '') + '" data-id="' + atk.id + '" style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;cursor:pointer;font-size:10px;border:1px solid ' + (active ? '#d4af37' : '#3a2c1a') + ';background:' + (active ? 'rgba(212,175,55,.15)' : 'transparent') + ';color:#d3c299">' +
        '<span class="twmgr-pl-tab-dot" style="color:#8fe39a;display:' + (atk.running ? 'inline' : 'none') + '">●</span>' +
        '<span class="twmgr-pl-tab-name">' + esc(atk.name) + '</span>' +
        '<span class="twmgr-pl-tab-ren" data-id="' + atk.id + '" title="renomear" style="opacity:.6">✎</span>' +
        '<span class="twmgr-pl-tab-del" data-id="' + atk.id + '" title="remover" style="opacity:.6">✕</span>' +
      '</div>';
    }).join('') + '<div id="twmgr-pl-tab-add" title="adicionar ataque" style="padding:3px 8px;border-radius:6px;cursor:pointer;font-size:12px;border:1px dashed #5c4a29;color:#e6cf7d">+ ataque</div>';
    cont.querySelectorAll('.twmgr-pl-tab').forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.classList.contains('twmgr-pl-tab-ren') || e.target.classList.contains('twmgr-pl-tab-del')) return;
      plannerSwitchAttack(el.getAttribute('data-id'));
    }));
    cont.querySelectorAll('.twmgr-pl-tab-ren').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); plannerRenameAttack(el.getAttribute('data-id')); }));
    cont.querySelectorAll('.twmgr-pl-tab-del').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); plannerRemoveAttack(el.getAttribute('data-id')); }));
    const addBtn = document.getElementById('twmgr-pl-tab-add'); if (addBtn) addBtn.addEventListener('click', plannerAddAttack);
  }

  // Repopula os campos (alvo/chegada/aldeias/composição/status) com os dados do ataque ATIVO.
  function renderPlannerActive() {
    const atk = plActive(), g = (id) => document.getElementById(id);
    if (g('twmgr-pl-target-x')) g('twmgr-pl-target-x').value = atk.targetX || '';
    if (g('twmgr-pl-target-y')) g('twmgr-pl-target-y').value = atk.targetY || '';
    if (g('twmgr-pl-arr')) g('twmgr-pl-arr').value = atk.arriveLocal || '';
    if (g('twmgr-pl-offset')) g('twmgr-pl-offset').value = atk.offsetMs != null ? atk.offsetMs : 150;
    setPlannerStatus(atk.running);
    renderPlannerVillages(atk).then(() => renderPlannerCards(atk));
    renderPlannerQueue(atk);
  }

  const PL_STATE_META = {
    armed:     { label: 'armado',   color: '#8f7d57' },
    scheduled: { label: 'agendado', color: '#e6cf7d' },
    sent:      { label: 'enviado',  color: '#8fe39a' },
    error:     { label: 'erro',     color: '#ff7568' },
  };

  // Tabela linha-a-linha da fila do ataque ATIVO. Ordenada por sendAt (fallback arriveAt).
  function renderPlannerQueue(atk) {
    const cont = document.getElementById('twmgr-pl-queue'); if (!cont) return;
    const rows = ((atk && atk.rows) || []).slice().sort((a, b) => (a.sendAt || a.arriveAt || 0) - (b.sendAt || b.arriveAt || 0));
    if (!rows.length) {
      cont.innerHTML = '<div style="font-size:10px;color:#8f7d57;padding:6px;text-align:center">— fila vazia. Arme o ataque pra ver as linhas aqui. —</div>';
      return;
    }
    const vilBy = {}; (_plVilCache || []).forEach((v) => { vilBy[v.vid] = v; });
    const th = 'text-align:left;padding:2px 4px;font-size:9px;color:#8f7d57;font-weight:normal;border-bottom:1px solid #3a2c1a';
    const td = 'padding:2px 4px;font-size:10px;color:#d3c299;vertical-align:middle';
    cont.innerHTML =
      '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr>' +
          '<th style="' + th + '">#</th>' +
          '<th style="' + th + '">origem</th>' +
          '<th style="' + th + '">kind</th>' +
          '<th style="' + th + '">chega</th>' +
          '<th style="' + th + '">sai</th>' +
          '<th style="' + th + '">estado</th>' +
          '<th style="' + th + ';text-align:right">ação</th>' +
        '</tr></thead>' +
        '<tbody>' + rows.map((r, i) => {
          const v = vilBy[r.origin] || { name: 'ID ' + r.origin };
          const meta = PL_STATE_META[r.state] || { label: r.state, color: '#8f7d57' };
          const errTitle = r.state === 'error' && r.error ? (' title="' + esc(String(r.error)) + '"') : '';
          const arrTxt = r.arriveAt ? fmtArriveLocal(r.arriveAt) : '—';
          const sendTxt = r.sendAt ? fmtArriveLocal(r.sendAt) : '—';
          const canCancel = r.state === 'armed' || r.state === 'scheduled';
          const canRemove = r.state === 'sent' || r.state === 'error';
          const actions = canCancel
            ? '<span class="twmgr-pl-queue-cancel" data-id="' + r.id + '" title="cancelar" style="cursor:pointer;color:#ff9560">✕</span>'
            : (canRemove ? '<span class="twmgr-pl-queue-del" data-id="' + r.id + '" title="remover do histórico" style="cursor:pointer;color:#8f7d57">🗑</span>' : '');
          return '<tr style="border-bottom:1px solid #2a2010">' +
            '<td style="' + td + ';color:#8f7d57">' + (i + 1) + '</td>' +
            '<td style="' + td + '">' + esc(v.name) + '</td>' +
            '<td style="' + td + '">' + (PL_ICON[r.kind] || '') + '</td>' +
            '<td style="' + td + ';font-family:monospace;font-size:9px">' + arrTxt + '</td>' +
            '<td style="' + td + ';font-family:monospace;font-size:9px">' + sendTxt + '</td>' +
            '<td style="' + td + ';color:' + meta.color + '"' + errTitle + '>' + meta.label + '</td>' +
            '<td style="' + td + ';text-align:right">' + actions + '</td>' +
          '</tr>';
        }).join('') + '</tbody>' +
      '</table>';
    cont.querySelectorAll('.twmgr-pl-queue-cancel').forEach((el) => el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const r = atk.rows.find((x) => x.id === id); if (!r) return;
      r.state = 'error'; r.error = 'cancelado pelo usuário';
      save(); plannerRecomputeReservations(); renderPlannerQueue(atk);
      pushLog('[' + atk.name + '] linha cancelada (' + r.origin + ' → ' + r.x + '|' + r.y + ').', '', 'planner');
    }));
    cont.querySelectorAll('.twmgr-pl-queue-del').forEach((el) => el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      atk.rows = atk.rows.filter((x) => x.id !== id);
      save(); renderPlannerQueue(atk);
    }));
  }

  function plannerClearHistory() {
    const atk = plActive(); if (!atk) return;
    const before = (atk.rows || []).length;
    atk.rows = (atk.rows || []).filter((r) => r.state === 'armed' || r.state === 'scheduled');
    const removed = before - atk.rows.length;
    save(); renderPlannerQueue(atk);
    pushLog('[' + atk.name + '] histórico limpo (' + removed + ' linha' + (removed === 1 ? '' : 's') + ').', '', 'planner');
  }

  function plannerRefreshTemplatesList() {
    const sel = document.getElementById('twmgr-pl-tpl-load'); if (!sel) return;
    const tpls = config.planner.templates || [];
    sel.innerHTML = '<option value="">(nenhum)</option>' + tpls.map((pl) => '<option value="' + pl.id + '">' + esc(pl.name) + '</option>').join('');
  }

  function plannerSaveTemplate() {
    const input = document.getElementById('twmgr-pl-tpl-name'); if (!input) return;
    const name = (input.value || '').trim();
    if (!name) { pushLog('Dê um nome pro template antes de salvar.', 'err', 'planner'); return; }
    const atk = plActive();
    const tpl = {
      id: genId(), name: name,
      targetX: atk.targetX, targetY: atk.targetY, arriveLocal: atk.arriveLocal, offsetMs: atk.offsetMs,
      selected: JSON.parse(JSON.stringify(atk.selected)),
      perVillage: JSON.parse(JSON.stringify(atk.perVillage)),
    };
    config.planner.templates = config.planner.templates || []; config.planner.templates.push(tpl); save();
    plannerRefreshTemplatesList();
    input.value = '';
    pushLog('Template "' + name + '" salvo.', 'ok', 'planner');
  }

  function plannerApplyTemplate() {
    const sel = document.getElementById('twmgr-pl-tpl-load'); if (!sel) return;
    const id = sel.value; if (!id) return;
    const tpl = (config.planner.templates || []).find((t) => t.id === id); if (!tpl) return;
    const atk = plActive();
    atk.targetX = tpl.targetX || ''; atk.targetY = tpl.targetY || '';
    atk.arriveLocal = tpl.arriveLocal || ''; atk.offsetMs = tpl.offsetMs != null ? tpl.offsetMs : 150;
    atk.selected = JSON.parse(JSON.stringify(tpl.selected || {}));
    atk.perVillage = JSON.parse(JSON.stringify(tpl.perVillage || {}));
    atk.homeAvail = {}; // será recarregado
    save(); plannerRecomputeReservations();
    renderPlannerActive();
    pushLog('Template "' + tpl.name + '" aplicado em [' + atk.name + ']. Clique em 🔄 para carregar tropas.', 'ok', 'planner');
  }

  function plannerDeleteTemplate() {
    const sel = document.getElementById('twmgr-pl-tpl-load'); if (!sel) return;
    const id = sel.value; if (!id) return;
    const tpl = (config.planner.templates || []).find((t) => t.id === id); if (!tpl) return;
    if (!confirm('Apagar template "' + tpl.name + '"?')) return;
    config.planner.templates = (config.planner.templates || []).filter((t) => t.id !== id);
    save(); plannerRefreshTemplatesList();
    pushLog('Template "' + tpl.name + '" apagado.', '', 'planner');
  }

  function plannerClearAll(atk) {
    if (!confirm('Limpar seleção e composição de [' + atk.name + ']? (templates salvos ficam)')) return;
    atk.selected = {}; atk.perVillage = {}; atk.homeAvail = {}; atk.rows = [];
    save(); plannerRecomputeReservations();
    renderPlannerVillages(atk).then(() => renderPlannerCards(atk));
    pushLog('[' + atk.name + '] limpo.', '', 'planner');
  }

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
    } catch (e) { pushLog('Mercado: erro no ciclo (' + (e.message || e) + ').', 'err', 'market'); }
    config.market.nextAt = now + Math.max(60, config.market.interval || 600) * 1000;
    save();
    refreshCards('market');
    pushLog('Mercado: próximo ciclo em ' + Math.round((config.market.interval || 600) / 60) + ' min.', '', 'market');
    scheduleMarket();
  }
  function scheduleMarket() { clearTimeout(marketTimer); if (!config.market.running) return; marketTimer = setTimeout(marketTick, Math.min(Math.max((config.market.nextAt || 0) - Date.now(), 1000), 60000)); }

  async function cunhagemPass() {
    const coord = config.market.destCoord || '';
    const reserve = Math.max(0, config.market.reserve || 0);
    let vils = [];
    try { vils = await getAllVillages(); } catch (e) { pushLog('Cunhagem: erro ao listar aldeias (' + (e.message || e) + ').', 'err', 'market'); return; }
    const sel = config.market.sources || {};
    let count = 0; const tot = { wood: 0, stone: 0, iron: 0 };
    for (const v of vils) {
      if (!sel[v.vid]) continue;
      if (v.coord && v.coord === coord) continue;   // pula destino pela coordenada
      let state;
      try { state = await getMarketState(v.vid); } catch (e) { pushLog('Cunhagem em ' + v.name + ': erro ao ler o mercado (' + (e.message || e) + ').', 'err', 'market'); continue; }
      if (!state.capacity) continue;
      const amounts = balancedSplit(state.capacity, state, reserve);
      if ((amounts.wood + amounts.stone + amounts.iron) <= 0) continue;
      try {
        await sendMarketResources(v.vid, coord, amounts);
        count++; tot.wood += amounts.wood; tot.stone += amounts.stone; tot.iron += amounts.iron;
        pushLog('Cunhagem: ' + v.name + ' → ' + coord + ' (' + amounts.wood + ' mad, ' + amounts.stone + ' arg, ' + amounts.iron + ' fer)', 'ok', 'market');
        await sleep(400 + Math.floor(Math.random() * 400));
      } catch (e) { pushLog('Cunhagem em ' + v.name + ': ' + (e.message || e), 'err', 'market'); }
    }
    config.market.stats = { sending: count, receiving: coord ? 1 : 0, wood: tot.wood, stone: tot.stone, iron: tot.iron };
    pushLog('Cunhagem: ciclo concluído — ' + count + ' aldeia(s) enviaram recurso.', 'ok', 'market');
  }

  function coordDist(a, b) { const pa = a.split('|').map(Number), pb = b.split('|').map(Number); return Math.sqrt((pa[0] - pb[0]) * (pa[0] - pb[0]) + (pa[1] - pb[1]) * (pa[1] - pb[1])); }
  async function equilibrioPass() {
    let vils = [];
    try { vils = await getAllVillages(); } catch (e) { pushLog('Equilíbrio: erro ao listar aldeias (' + (e.message || e) + ').', 'err', 'market'); return; }
    vils = vils.filter((v) => v.coord);
    const donorSet = {}, recvSet = {}, totRes = { wood: 0, stone: 0, iron: 0 };
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
            sent++; donorSet[don.s.vid] = 1; recvSet[rec.s.vid] = 1; totRes[r] += amount;
            don.s.cur[r] -= amount; don.s.cap -= amount; rec.def -= amount; don.exc -= amount;
            config.market.inflight[rec.s.vid] = config.market.inflight[rec.s.vid] || [];
            config.market.inflight[rec.s.vid].push({ r: r, amt: amount, arriveAt: now + ((dur && dur > 0 ? dur : 3600) * 1000) });
            pushLog('Equilíbrio: ' + don.s.name + ' → ' + rec.s.coord + ' (' + amount + ' ' + ({ wood: 'madeira', stone: 'argila', iron: 'ferro' }[r]) + ')', 'ok', 'market');
            await sleep(400 + Math.floor(Math.random() * 300));
          } catch (e) { pushLog('Equilíbrio em ' + don.s.name + ': ' + (e.message || e), 'err', 'market'); }
        }
      }
    }
    config.market.stats = { sending: Object.keys(donorSet).length, receiving: Object.keys(recvSet).length, wood: totRes.wood, stone: totRes.stone, iron: totRes.iron };
    save();
    pushLog('Equilíbrio: ciclo concluído — ' + sent + ' transferência(s), limiar ' + Math.round(pct * 100) + '%.', 'ok', 'market');
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
      if (!/^\d+\s*\|\s*\d+$/.test(config.market.destCoord || '')) { pushLog('Cunhagem: coordenada de destino inválida (ex.: 464|604).', 'err', 'market'); return; }
      if (!Object.values(config.market.sources).some(Boolean)) { pushLog('Cunhagem: selecione ao menos 1 aldeia de origem.', 'err', 'market'); return; }
    }
    config.market.running = true; config.market.nextAt = 0; save();
    setMarketStatus(true);
    pushLog(config.market.mode === 'equilibrio'
      ? 'Equilíbrio iniciado — limiar ' + config.market.thresholdPct + '% do armazém, distância ≤ ' + config.market.maxDist + '.'
      : 'Cunhagem iniciada — destino ' + config.market.destCoord + ', deixa ' + config.market.reserve + ' de cada recurso.', 'ok', 'market');
    marketTick();
  }
  function marketStop() { readMarketCfg(); config.market.running = false; save(); clearTimeout(marketTimer); setMarketStatus(false); pushLog('Mercado parado.', '', 'market'); }

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
  function computeBuild(state, plan) {
    // ordem estrita: para no 1º item ativo/não atingido que dá pra upar; se não tem recurso, ESPERA (vira demanda)
    for (const it of plan) {
      if (it.en === false) continue;                                     // desabilitado pelo usuário
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
    catch (e) { pushLog('Edifícios: erro ao ler os grupos (' + (e.message || e) + ').', 'err', 'build'); config.build.nextAt = now + 120000; save(); scheduleBuild(); return; }
    const vids = Object.keys(pmap);
    if (!vids.length) { pushLog('Edifícios: mapeie os grupos ATK/DEF na aba Recrutar.', '', 'build'); config.build.nextAt = now + 300000; save(); scheduleBuild(); return; }
    const atkPlan = (config.build.plans && config.build.plans.atk) || [];
    const defPlan = (config.build.plans && config.build.plans.def) || [];
    config.build.demand = {};
    let built = 0;
    for (const vid of vids) {
      const prof = pmap[vid].profile;
      const plan = prof === 'atk' ? atkPlan : defPlan;
      let st;
      try { st = await getBuildState(vid); }
      catch (e) { pushLog('Edifícios em ' + (pmap[vid].coord || vid) + ': erro ao ler o estado (' + (e.message || e) + ').', 'err', 'build'); continue; }
      const r = computeBuild(st, plan);
      if (r.demand) config.build.demand[vid] = { b: r.demand.b, cost: r.demand.cost, coord: pmap[vid].coord };
      if (r.build && st.queueLen < (config.build.maxQueue || 5)) {
        try {
          await enqueueBuild(vid, r.build.b);
          built++;
          const bn = (BUILD_META[r.build.b] && BUILD_META[r.build.b].name) || r.build.b;
          pushLog('Edifícios: ' + (pmap[vid].coord || vid) + ' → ' + bn + ' na fila (custo ' + r.build.cost.wood + '/' + r.build.cost.stone + '/' + r.build.cost.iron + ')', 'ok', 'build');
        } catch (e) { pushLog('Edifícios em ' + (pmap[vid].coord || vid) + ': ' + (e.message || e), 'err', 'build'); }
      } else if (r.demand) {
        const bn = (BUILD_META[r.demand.b] && BUILD_META[r.demand.b].name) || r.demand.b;
        pushLog((pmap[vid].coord || vid) + ': aguardando recurso p/ ' + bn + ' (' + r.demand.cost.wood + '/' + r.demand.cost.stone + '/' + r.demand.cost.iron + ')', '', 'build');
      }
      await sleep(300);
    }
    config.build.stats = config.build.stats || {};
    config.build.stats.villages = vids.length;
    config.build.nextAt = now + Math.max(60, config.build.interval || 600) * 1000;
    save();
    refreshCards('build');
    pushLog('Edifícios: ciclo concluído — ' + built + ' obra(s) enfileirada(s). Próximo em ' + Math.round((config.build.interval || 600) / 60) + ' min.', 'ok', 'build');
    scheduleBuild();
  }
  function scheduleBuild() { clearTimeout(buildTimer); if (!config.build.running) return; buildTimer = setTimeout(buildTick, Math.min(Math.max((config.build.nextAt || 0) - Date.now(), 1000), 60000)); }
  function readBuildCfg() {
    const c = config.build, g = (id) => document.getElementById(id);
    if (g('twmgr-bld-max')) c.maxQueue = Math.max(1, parseInt(g('twmgr-bld-max').value, 10) || 5);
    if (g('twmgr-bld-int')) c.interval = Math.max(1, parseInt(g('twmgr-bld-int').value, 10) || 10) * 60;
    save();
  }
  let _bldActiveProf = 'atk';
  function renderBuildPlan() {
    const box = document.getElementById('twmgr-bld-plan'); if (!box) return;
    const plan = (config.build.plans && config.build.plans[_bldActiveProf]) || [];
    if (!plan.length) { box.innerHTML = '<div style="color:#8f7d57;text-align:center;padding:10px;font-size:10px">— lista vazia (use o + abaixo pra adicionar) —</div>'; return; }
    box.innerHTML = plan.map((it, i) => {
      const meta = BUILD_META[it.b] || { name: it.b, ico: '?', max: 30 };
      const disabled = it.en === false ? ' twmgr-bld-off' : '';
      return '<div class="twmgr-bld-item' + disabled + '" data-i="' + i + '">' +
        '<span class="twmgr-bld-ord">' + (i + 1) + '.</span>' +
        '<input type="checkbox" class="twmgr-bld-en" data-i="' + i + '"' + (it.en === false ? '' : ' checked') + ' title="ativar/desativar este item">' +
        '<span class="twmgr-bld-ico">' + buildingIcon(it.b, meta.ico) + '</span>' +
        '<span class="twmgr-bld-name" title="' + esc(meta.name) + ' (máx ' + meta.max + ')">' + esc(meta.name) + '</span>' +
        '<input type="number" class="twmgr-bld-lvl twmgr-inp" data-i="' + i + '" min="1" max="' + meta.max + '" value="' + it.lvl + '" title="nível alvo">' +
        '<span class="twmgr-bld-up" data-i="' + i + '" title="subir prioridade">▲</span>' +
        '<span class="twmgr-bld-down" data-i="' + i + '" title="descer prioridade">▼</span>' +
        '<span class="twmgr-bld-rm" data-i="' + i + '" title="remover">✕</span>' +
        '</div>';
    }).join('');
  }
  function bindBuildPlanHandlers() {
    const box = document.getElementById('twmgr-bld-plan'); if (!box) return;
    box.addEventListener('change', (e) => {
      const el = e.target; const i = parseInt(el.getAttribute('data-i'), 10);
      const plan = config.build.plans[_bldActiveProf]; if (!plan || isNaN(i) || !plan[i]) return;
      if (el.classList.contains('twmgr-bld-en')) plan[i].en = !!el.checked;
      else if (el.classList.contains('twmgr-bld-lvl')) {
        const meta = BUILD_META[plan[i].b]; const max = meta ? meta.max : 30;
        plan[i].lvl = Math.max(1, Math.min(max, parseInt(el.value, 10) || 1));
        el.value = plan[i].lvl;
      }
      save(); renderBuildPlan();
    });
    box.addEventListener('click', (e) => {
      const el = e.target; const i = parseInt(el.getAttribute('data-i'), 10);
      const plan = config.build.plans[_bldActiveProf]; if (!plan || isNaN(i) || !plan[i]) return;
      if (el.classList.contains('twmgr-bld-up') && i > 0) { const tmp = plan[i - 1]; plan[i - 1] = plan[i]; plan[i] = tmp; save(); renderBuildPlan(); }
      else if (el.classList.contains('twmgr-bld-down') && i < plan.length - 1) { const tmp = plan[i + 1]; plan[i + 1] = plan[i]; plan[i] = tmp; save(); renderBuildPlan(); }
      else if (el.classList.contains('twmgr-bld-rm')) { plan.splice(i, 1); save(); renderBuildPlan(); }
    });
  }
  function bldAddItem() {
    const b = document.getElementById('twmgr-bld-add-b').value;
    const lvlInp = document.getElementById('twmgr-bld-add-lvl');
    const meta = BUILD_META[b]; if (!meta) return;
    const lvl = Math.max(1, Math.min(meta.max, parseInt(lvlInp.value, 10) || meta.max));
    const plan = config.build.plans[_bldActiveProf] = config.build.plans[_bldActiveProf] || [];
    plan.push({ b: b, lvl: lvl, en: true });
    lvlInp.value = '';
    save(); renderBuildPlan();
  }
  function bldSwitchProf(prof) {
    _bldActiveProf = prof;
    document.querySelectorAll('.twmgr-bld-sub').forEach((el) => el.classList.toggle('on', el.getAttribute('data-prof') === prof));
    renderBuildPlan();
  }
  function bldResetDefault() {
    if (!confirm('Reset do plano ' + _bldActiveProf.toUpperCase() + ' pro padrão?')) return;
    config.build.plans[_bldActiveProf] = tplToPlan(_bldActiveProf === 'atk' ? ATK_TPL : DEF_TPL);
    save(); renderBuildPlan();
  }
  function bldClearAll() {
    if (!confirm('Limpar TODOS os itens do plano ' + _bldActiveProf.toUpperCase() + '?')) return;
    config.build.plans[_bldActiveProf] = [];
    save(); renderBuildPlan();
  }
  function setBuildStatus(on) { setBtnState('twmgr-bld-start', 'twmgr-bld-stop', on, '● Construindo', '▶ Construir'); }
  function buildStart() {
    readBuildCfg();
    if (!config.recruit.groupAtk && !config.recruit.groupDef) { pushLog('Edifícios: mapeie ATK/DEF na aba Recrutar primeiro.', 'err', 'build'); return; }
    const atkN = (config.build.plans.atk || []).filter((x) => x.en !== false).length;
    const defN = (config.build.plans.def || []).filter((x) => x.en !== false).length;
    config.build.running = true; config.build.nextAt = 0; save();
    setBuildStatus(true); pushLog('Edifícios iniciado — plano ATK com ' + atkN + ' item(ns), DEF com ' + defN + '.', 'ok', 'build'); buildTick();
  }
  function buildStop() { readBuildCfg(); config.build.running = false; save(); clearTimeout(buildTimer); setBuildStatus(false); pushLog('Edifícios parado.', '', 'build'); }

  // ==================== MÓDULO BB (aldeias bárbaras conquistadas) ====================
  // Constrói a ladder BB, abastece JIT das aldeias grandes próximas, e ao graduar (EP+estábulo) recruta CL sozinho.
  // Recursos que EU já mandei pra este destino e ainda não chegaram (evita reenviar e transbordar).
  function bbInflightSum(vid) {
    const now = Date.now();
    const arr = (config.bb.inflight && config.bb.inflight[vid]) || [];
    const out = { wood: 0, stone: 0, iron: 0 };
    arr.forEach((e) => { if (e.arriveAt > now && out[e.r] != null) out[e.r] += e.amt; });
    return out;
  }
  function bbInflightAdd(vid, amt, dur) {
    config.bb.inflight = config.bb.inflight || {};
    const arr = config.bb.inflight[vid] = config.bb.inflight[vid] || [];
    const at = Date.now() + ((dur && dur > 0 ? dur : 3600) * 1000);   // sem duração lida -> assume 1h
    ['wood', 'stone', 'iron'].forEach((r) => { if ((amt[r] || 0) > 0) arr.push({ r: r, amt: amt[r], arriveAt: at }); });
  }
  async function feedBB(v, needCost, sources, srcState) {
    let ms; try { ms = await getMarketState(v.vid); } catch (e) { return false; }
    if (!ms.storage) return false;
    // "efetivo" = recurso atual + o que já está a caminho. Sem isso, cada ciclo relê o atual (baixo,
    // porque o transporte ainda não chegou) e manda de novo -> quando tudo chega junto, transborda.
    const inf = bbInflightSum(v.vid);
    const eff = { wood: ms.wood + inf.wood, stone: ms.stone + inf.stone, iron: ms.iron + inf.iron };
    const free = { wood: Math.max(0, ms.storage - eff.wood), stone: Math.max(0, ms.storage - eff.stone), iron: Math.max(0, ms.storage - eff.iron) };
    const target = {
      wood: Math.max(0, Math.min((needCost.wood || 0) - eff.wood, free.wood)),
      stone: Math.max(0, Math.min((needCost.stone || 0) - eff.stone, free.stone)),
      iron: Math.max(0, Math.min((needCost.iron || 0) - eff.iron, free.iron)),
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
        const dur = await sendMarketResources(s.vid, v.coord, amt);
        sent = true;
        pushLog('Cultivo (abastece): ' + s.coord + ' → ' + v.coord + ' (' + amt.wood + '/' + amt.stone + '/' + amt.iron + ')', 'ok', 'bb');
        ss.wood -= amt.wood; ss.stone -= amt.stone; ss.iron -= amt.iron; ss.capacity -= (amt.wood + amt.stone + amt.iron);
        target.wood -= amt.wood; target.stone -= amt.stone; target.iron -= amt.iron;
        bbInflightAdd(v.vid, amt, dur);   // marca o que está a caminho deste destino
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
    // poda transportes que já chegaram
    config.bb.inflight = config.bb.inflight || {};
    Object.keys(config.bb.inflight).forEach((vid) => {
      config.bb.inflight[vid] = (config.bb.inflight[vid] || []).filter((e) => e.arriveAt > now);
      if (!config.bb.inflight[vid].length) delete config.bb.inflight[vid];
    });
    if (!config.bb.group) { pushLog('Cultivo: selecione o grupo na aba.', '', 'bb'); config.bb.nextAt = now + 300000; save(); scheduleBB(); return; }
    let vils;
    try { vils = await getVillagesInGroup(config.bb.group); }
    catch (e) { pushLog('Cultivo: erro ao ler o grupo (' + (e.message || e) + ').', 'err', 'bb'); config.bb.nextAt = now + 120000; save(); scheduleBB(); return; }
    try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {}
    if (!vils.length) { pushLog('Cultivo: grupo vazio — adicione as aldeias conquistadas ao grupo.', '', 'bb'); config.bb.nextAt = now + 300000; save(); scheduleBB(); return; }
    const tpl = parseTpl(config.bb.tpl);
    const defSet = {}; ((config.bb.defCoords || '').match(/\d{1,3}\|\d{1,3}/g) || []).forEach((c) => defSet[c] = 1);
    const bbSet = {}; vils.forEach((v) => bbSet[v.vid] = 1);
    let allV = []; try { allV = await getAllVillages(); } catch (e) {}
    const sources = allV.filter((v) => !bbSet[v.vid] && v.coord);
    const srcState = {};
    let built = 0, recruited = 0, fed = 0, f1 = 0, f2 = 0, f3 = 0;
    const gMain = config.bb.gradMain || 20, gStable = config.bb.gradStable || 15;
    for (const v of vils) {
      let st;
      try { st = await getBuildState(v.vid); }
      catch (e) { pushLog('Cultivo em ' + (v.coord || v.vid) + ': erro ao ler o estado.', 'err', 'bb'); continue; }
      const grad = (st.level.main || 0) >= gMain && (st.level.stable || 0) >= gStable;
      if (grad) f3++; else if ((st.level.main || 0) >= gMain) f2++; else f1++;
      const r = computeBuild(st, tpl);
      if (r.build && st.queueLen < (config.bb.maxQueue || 5)) {
        const bn = (BUILD_META[r.build.b] && BUILD_META[r.build.b].name) || r.build.b;
        try { await enqueueBuild(v.vid, r.build.b); built++; pushLog('Cultivo: ' + (v.coord || v.vid) + ' → ' + bn + ' na fila (' + r.build.cost.wood + '/' + r.build.cost.stone + '/' + r.build.cost.iron + ')', 'ok', 'bb'); }
        catch (e) { pushLog('Cultivo em ' + (v.coord || v.vid) + ': ' + (e.message || e), 'err', 'bb'); }
      }
      if (grad) {
        const tag = defSet[v.coord] ? 'def' : 'atk';
        try {
          const rs = await getRecruitState(v.vid);
          const rc = computeRecruit(rs, config.recruit.profiles[tag].targets, config.recruit, rs.queuedSec);
          if (Object.keys(rc.amounts).length) {
            await sendRecruit(v.vid, rc.amounts); recruited++;
            pushLog('Cultivo: ' + (v.coord || v.vid) + ' [' + tag + '] recrutou ' + Object.entries(rc.amounts).map((e) => e[1] + ' ' + e[0]).join(', '), 'ok', 'bb');
          } else if (rs.units.light && !rs.units.light.reqMet) {
            pushLog('Cultivo em ' + (v.coord || v.vid) + ': cavalaria leve não pesquisada — pesquise no ferreiro.', 'err', 'bb');
          }
        } catch (e) { pushLog('Cultivo (recruta) em ' + (v.coord || v.vid) + ': ' + (e.message || e), 'err', 'bb'); }
      }
      if (r.demand) { try { if (await feedBB(v, r.demand.cost, sources, srcState)) fed++; } catch (e) {} }
      await sleep(300);
    }
    config.bb.stats = { total: vils.length, f1: f1, f2: f2, f3: f3 };
    config.bb.nextAt = now + Math.max(60, config.bb.interval || 600) * 1000; save();
    refreshCards('bb');
    pushLog('Cultivo: ciclo concluído — ' + built + ' obra(s), ' + recruited + ' recruta(s), ' + fed + ' abastecida(s). Próximo em ' + Math.round((config.bb.interval || 600) / 60) + ' min.', 'ok', 'bb');
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
    if (!config.bb.group) { pushLog('Cultivo: selecione o grupo primeiro.', 'err', 'bb'); return; }
    if (!config.recruit.profiles.atk.targets || !Object.keys(config.recruit.profiles.atk.targets).length) pushLog('Cultivo: dica — configure os alvos ATK/DEF na aba Recrutar (o Cultivo usa eles ao graduar).', '', 'bb');
    config.bb.running = true; config.bb.nextAt = 0; save();
    setBBStatus(true); pushLog('Cultivo iniciado.', 'ok', 'bb'); bbTick();
  }
  function bbStop() { readBBCfg(); config.bb.running = false; save(); clearTimeout(bbTimer); setBBStatus(false); pushLog('Cultivo parado.', '', 'bb'); }

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
        // onclick = "...sendUnits(this, <villageId>, <templateId>)" — o template_id é o ÚLTIMO número.
        const inside = oc.match(/sendUnits\s*\(([^)]*)\)/i);
        if (inside) { const nums = inside[1].match(/\d+/g); if (nums && nums.length >= 2) return { id: nums[nums.length - 1], src: 'icon-onclick' }; }
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
    // "Já explorado": lê o assistente (conta-inteira) uma vez -> coord -> data do último relatório.
    const explored = {};
    try { (await getFarmTargets(CUR_VID)).forEach((t) => { if (t.reportId && t.coord) explored[t.coord] = t.reportAt || 0; }); }
    catch (e) { pushLog('Mapa: não consegui ler os relatórios do assistente (vou considerar todos como não-explorados): ' + (e.message || e), 'err', 'map'); }
    // O filtro do assistente pode esconder aldeias que você já está atacando; a lista de comandos cobre esse buraco.
    let attacking = new Set();
    try { attacking = (await getPendingAttack()).coords; } catch (e) {}
    // Claim: cada bárbaro é atribuído à aldeia MINHA mais próxima que ainda tem cota (maxPerVillage).
    // Assim evitamos que a mesma aldeia minha sature os N primeiros bárbaros e sobre 0 pras outras.
    const candByOrigin = {}; myV.forEach((s) => candByOrigin[s.vid] = []);
    const pairs = [];
    for (const b of barb) {
      const coord = b.x + '|' + b.y;
      const last = sentAt[b.vid] || 0;
      // já tem ataque nosso em rota pra lá (o filtro do assistente costuma esconder essas): não explora
      if (attacking.has(coord)) continue;
      // trava curta: já mandei explorador há pouco (relatório ainda não chegou/apareceu)
      if (last && staleMs > 0 && (now - last) < staleMs) continue;
      // já explorado: pula se JÁ tem relatório FRESCO; relatório velho (> N dias) pode re-explorar
      if (coord in explored) {
        const rAt = explored[coord];
        if (rAt) { if ((now - rAt) < staleMs) continue; }   // com data: pula se fresco
        else if (staleMs > 0) continue;                      // sem data legível: pula (a não ser que dias=0)
      }
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
    pushLog('Mapa: ' + plan.myV.length + ' aldeia(s) de origem, ' + plan.barbCount + ' bárbaro(s) no critério, ' + totalPlanned + ' planejado(s).', 'ok', 'map');
    const delay = Math.max(0, cfg.delay != null ? cfg.delay : 500);
    let sentTotal = 0, leftTotal = 0;
    for (const p of plan.plan) {
      if (!p.targets.length) continue;
      let state;
      try { state = await getVillageStateReserved(p.src.vid); }
      catch (e) { pushLog('Mapa: erro ao ler o estado de ' + p.src.name + ' (' + (e.message || e) + ').', 'err', 'map'); continue; }
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
          pushLog('Mapa: ' + p.src.name + ' → ' + t.coord + ' (' + spyCount + ' explorador, ' + (Math.round(t.dist * 10) / 10) + ' campos' + (t.points ? ', ' + t.points + ' pts' : '') + ')', 'ok', 'map');
          if (delay) await sleep(delay + Math.floor(Math.random() * 200));
        } catch (e) { pushLog('Mapa: ' + p.src.name + ' → ' + t.coord + ': ' + (e.message || e), 'err', 'map'); }
      }
      leftTotal += semSpy + ocup;
      const parts = ['enviou ' + vSent];
      if (semSpy) parts.push(semSpy + ' sem explorador (reserva)');
      if (ocup) parts.push(ocup + ' já com ataque a caminho');
      pushLog(p.src.name + ' (' + p.src.coord + '): ' + parts.join(' · '), '', 'map');
    }
    Object.keys(cfg.sentAt).forEach((k) => { if (now - cfg.sentAt[k] > 30 * 86400000) delete cfg.sentAt[k]; });
    cfg.stats = { mapped: plan.barbCount, sent: sentTotal, left: leftTotal };
    cfg.running = false;   // ONE-SHOT: termina e PARA (rodar de novo = clicar Iniciar)
    save();
    setMapStatus(false);
    refreshCards('map');
    pushLog('Mapa: concluído — ' + sentTotal + ' explorador(es) enviado(s). Clique Iniciar pra rodar de novo.', 'ok', 'map');
  }
  function scheduleMap() { clearTimeout(mapTimer); if (!config.map.running) return; mapTimer = setTimeout(mapTick, Math.min(Math.max((config.map.nextAt || 0) - Date.now(), 1000), 60000)); }

  async function mapPreview() {
    readMapCfg();
    pushLog('Mapa: === prévia ===', 'ok', 'map');
    let all = null;
    try {
      all = await getMapVillages();
      const barbAll = all.filter((v) => v.player === '0');
      pushLog('Mundo: ' + all.length + ' aldeias, ' + barbAll.length + ' bárbaras (village.txt).', '', 'map');
      if (all.length < 200) pushLog('Atenção: village.txt trouxe pouca coisa — servidor limitou ou sessão expirou.', 'err', 'map');
    } catch (e) { pushLog('village.txt: erro ' + (e.message || e), 'err', 'map'); return; }
    const plan = await mapPlanTargets();
    if (!plan) return;
    config.map.lastPreview = plan.plan.flatMap((p) => p.targets.map((t) => ({ src: p.src.coord, srcName: p.src.name, coord: t.coord, dist: Math.round(t.dist * 10) / 10, pts: t.points, name: t.name, lastAt: t.lastAt }))).slice(0, 500);
    save(); renderMapPreview();
    const tot = plan.plan.reduce((a, p) => a + p.targets.length, 0);
    config.map.stats = { mapped: plan.barbCount, sent: (config.map.stats && config.map.stats.sent) || 0, left: 0 };
    refreshCards('map');
    pushLog('Filtro de pontos (' + config.map.minPoints + '–' + config.map.maxPoints + '): ' + plan.barbCount + ' bárbaros.', '', 'map');
    pushLog('Minhas aldeias: ' + plan.myV.length + (config.map.group ? ' (grupo ' + config.map.group + ')' : ' (todas)') + '.', '', 'map');
    pushLog('Candidatos a ≤ ' + config.map.maxDist + ' campos e ≥ ' + config.map.minDaysSinceScout + 'd sem scout: ' + plan.totalCandidates + '.', '', 'map');
    pushLog('Planejados neste ciclo (cota ' + config.map.maxPerVillage + '/aldeia): ' + tot + '.', tot > 0 ? 'ok' : 'err', 'map');
    if (tot === 0 && plan.myV.length > 0 && all) {
      const barbs = all.filter((b) => b.player === '0');
      let minD = Infinity;
      plan.myV.forEach((s) => { barbs.forEach((b) => { const d = fieldDist(s.x, s.y, b.x, b.y); if (d < minD) minD = d; }); });
      if (isFinite(minD)) pushLog('Dica: o bárbaro mais próximo está a ' + (Math.round(minD * 10) / 10) + ' campos. Aumente a distância máxima acima disso.', '', 'map');
    }
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
    pushLog('Mapa iniciado — distância ≤ ' + config.map.maxDist + ', ' + config.map.spyCount + ' explorador/alvo, reserva ' + config.map.spyReserve + '.', 'ok', 'map');
    mapTick();
  }
  function mapStop() { readMapCfg(); config.map.running = false; save(); clearTimeout(mapTimer); setMapStatus(false); pushLog('Mapa parado.', '', 'map'); }
  async function mapRefreshCache() { _mapVillagesCache = null; try { const v = await getMapVillages(true); pushLog('Mapa recarregado — ' + v.length + ' aldeias no mundo (' + v.filter((x) => x.player === '0').length + ' bárbaras).', 'ok', 'map'); } catch (e) { pushLog('Mapa: recarregar falhou (' + (e.message || e) + ').', 'err', 'map'); } }

  // ==================== DETECTOR DE CAPTCHA ====================
  // Detecta popups de bot-check do TW e captchas hCaptcha/reCAPTCHA, dispara notificação
  // do navegador + POST em ntfy.sh/{topico}. Cooldown pra não spammar.
  const CAPTCHA_SELECTORS = [
    '#popup_box_bot_protection',
    '#bot_check',
    '#botprotection_quest',
    '#hcaptcha_container',
    '.h-captcha',
    'iframe[src*="hcaptcha.com"]',
    'iframe[src*="recaptcha"]',
    '.captcha_image',
  ];
  function isCaptchaVisible() {
    for (const s of CAPTCHA_SELECTORS) {
      const el = document.querySelector(s);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') return s;
    }
    return null;
  }
  async function ensureNotifyPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try { const p = await Notification.requestPermission(); return p === 'granted'; } catch (e) { return false; }
  }
  async function fireCaptchaNotification(reasonSel, manual) {
    const cfg = config.captcha;
    const now = Date.now();
    const cd = (cfg.cooldownSec || 300) * 1000;
    if (!manual && (now - (cfg.lastNotifiedAt || 0)) < cd) return;
    cfg.lastNotifiedAt = now; save();
    const world = window.game_data && window.game_data.world || WORLD;
    const msg = (manual ? '[TESTE] ' : '') + 'CAPTCHA detectado no TW · mundo ' + world + ' · aldeia ' + (CUR_NAME || CUR_VID) + (reasonSel ? (' [' + reasonSel + ']') : '');
    pushLog('⚠ ' + msg, 'err');
    // 1) Notificação do navegador
    if (cfg.browserNotif) {
      try {
        const ok = await ensureNotifyPermission();
        if (ok) {
          const n = new Notification('TW Manager · CAPTCHA', { body: msg, tag: 'twmgr-captcha', requireInteraction: true, icon: (IMG_BASE || '') + 'graphic/dots/red.png' });
          n.onclick = () => { try { window.focus(); n.close(); } catch (e) {} };
        } else if (Notification.permission === 'denied') {
          pushLog('Notif. do navegador está bloqueada — libere no cadeado do endereço.', 'err');
        }
      } catch (e) { pushLog('Notif. navegador falhou: ' + (e.message || e), 'err'); }
    }
    // 2) ntfy.sh
    if (cfg.ntfyTopic) {
      try {
        await fetch('https://ntfy.sh/' + encodeURIComponent(cfg.ntfyTopic.trim()), {
          method: 'POST',
          headers: {
            'Title': 'TW Manager · CAPTCHA',
            'Priority': 'urgent',
            'Tags': 'warning,robot,tribalwars',
            'Click': location.href,
          },
          body: msg,
        });
        pushLog('  ntfy.sh enviado → tópico "' + cfg.ntfyTopic.trim() + '"', 'ok');
      } catch (e) { pushLog('ntfy.sh falhou: ' + (e.message || e), 'err'); }
    }
  }
  let _captchaCheckLast = 0;
  function checkCaptchaOnce() {
    if (!config.captcha || !config.captcha.enabled) return;
    const now = Date.now();
    if (now - _captchaCheckLast < 1000) return;   // debounce
    _captchaCheckLast = now;
    const hit = isCaptchaVisible();
    if (hit) fireCaptchaNotification(hit, false);
  }
  function startCaptchaWatcher() {
    // Poll leve
    setInterval(checkCaptchaOnce, 5000);
    // Reação imediata a mudanças no DOM
    try {
      if (window.MutationObserver && document.body) {
        const obs = new MutationObserver(() => checkCaptchaOnce());
        obs.observe(document.body, { childList: true, subtree: true });
      }
    } catch (e) {}
    // Check inicial 1s após load (deixa TW montar overlays)
    setTimeout(checkCaptchaOnce, 1200);
  }
  function testCaptchaNotif() { fireCaptchaNotification('teste-manual', true); }

  // ---- Detecção do bot-check pela REDE (sem depender do F5) ----
  // O overlay do TW só entra no DOM quando o jogo o renderiza (às vezes só no F5). Mas as respostas
  // das requisições (nossas e do próprio jogo) já trazem o bot-check antes disso — grampeamos fetch+XHR
  // só pra ESPIAR as respostas (repasse intacto) e disparar o alerta na hora.
  function scanForBotCheck(text, url) {
    const hay = ((url || '') + ' ' + (text || '')).toLowerCase();
    const toks = ['bot_check', 'bot_protection', 'botprotection', 'botprotection_quest', 'bot_protection_row', 'data-bot-challenge', '/human.php', 'action=bot_protection', 'h-captcha', 'hcaptcha.com', 'g-recaptcha', 'sitekey', 'botschutz'];
    for (const t of toks) { if (hay.indexOf(t) >= 0) return t; }
    // texto visível da própria página de bot-check (br143 mostra "Proteção contra Bots" / "iniciar a
    // verificação da proteção do bot"). "bots" != "robôs" — por isso o regex antigo não casava.
    if (/prote..o (contra|do) (rob|bot)|iniciar a verifica..o|verifica..o d[ae] prote..o|bot protection/.test(hay)) return 'bot-page';
    return null;
  }
  function scanAndFire(text, url) {
    try {
      if (!config.captcha || !config.captcha.enabled) return;
      const m = scanForBotCheck(text, url);
      if (m) fireCaptchaNotification('rede:' + m + (url ? (' · ' + String(url).slice(0, 80)) : ''), false);
    } catch (e) {}
  }
  function looksTW(url) {
    try {
      if (!url) return false;
      const u = String(url).toLowerCase();
      if (u.indexOf('ntfy.sh') >= 0 || u.indexOf('githubusercontent') >= 0) return false;   // nossas próprias chamadas
      if (u.indexOf('/game.php') >= 0 || u.indexOf('/human.php') >= 0) return true;
      if (u.indexOf('bot_check') >= 0 || u.indexOf('bot_protection') >= 0 || u.indexOf('botprotection') >= 0) return true;
      return false;
    } catch (e) { return false; }
  }
  function installBotHooks() {
    if (window.__twBotHooked) return;
    window.__twBotHooked = true;
    try {
      const _origFetch = window.fetch;
      if (typeof _origFetch === 'function') {
        window.fetch = function () {
          const p = _origFetch.apply(this, arguments);
          try { p.then((res) => { try { if (res && looksTW(res.url)) res.clone().text().then((t) => scanAndFire(t, res.url)).catch(() => {}); } catch (e) {} }).catch(() => {}); } catch (e) {}
          return p;   // promise original, intacto
        };
      }
    } catch (e) {}
    try {
      const _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) { try { this.__twUrl = url; } catch (e) {} return _open.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function () {
        try {
          this.addEventListener('load', function () {
            try {
              const u = this.__twUrl || this.responseURL || '';
              if (!looksTW(u)) return;
              let t = ''; const rt = this.responseType;
              if (rt === '' || rt === 'text') { try { t = this.responseText || ''; } catch (e) { t = ''; } }
              scanAndFire(t, u);
            } catch (e) {}
          });
        } catch (e) {}
        return _send.apply(this, arguments);
      };
    } catch (e) {}
    // validação ponta-a-ponta sem esperar um bot-check real
    try { window.__twSimBotCheck = function () { scanAndFire('<div id="bot_check"></div>', location.href); return 'disparado'; }; } catch (e) {}
  }
  // Sonda: uma requisição leve periódica (mini-F5 automático). Sem ela, o bot-check só é detectado
  // quando "cai" a próxima requisição de um módulo — pode demorar minutos. Com ela, o grampo de rede
  // recebe o desafio em ~pollSec e dispara sem você precisar dar F5. Custo: ~1 GET leve/pollSec.
  let _canaryTimer = null;
  async function botCanary() {
    try {
      if (!config.captcha || !config.captcha.enabled) return;
      if (lockOther()) return;   // outra aba ativa cuida disso
      await fetch('/game.php?village=' + CUR_VID + '&screen=overview&_=' + Date.now(), { credentials: 'include', cache: 'no-store' });
      // o grampo de fetch já escaneia a resposta e dispara fireCaptchaNotification se for bot-check
    } catch (e) {}
  }
  function startBotCanary() {
    clearInterval(_canaryTimer);
    const sec = (config.captcha && config.captcha.pollSec) || 0;
    if (!sec || sec < 30) return;   // 0 (ou < 30s) = desligada
    _canaryTimer = setInterval(botCanary, sec * 1000);
  }

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
    if (document.getElementById('twmgr-cards-fakes')) refreshCards('fakes');
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
    const plClk = document.getElementById('twmgr-pl-srvclock'); if (plClk) { try { plClk.textContent = new Date(serverNow() - wallToServerOffset()).toLocaleTimeString(); } catch (e) {} }
    const pls = document.getElementById('twmgr-pl-status');
    if (pls) {
      const plAtk = config.planner && plActive();
      if (!plAtk || !plAtk.running) { pls.textContent = ''; }
      else if (lockOther()) { pls.textContent = '⏸ outra aba'; pls.style.color = '#ff7568'; }
      else {
        const rr = (plAtk.rows || []);
        const pend = rr.filter((r) => r.state === 'armed' || r.state === 'scheduled').length;
        const sent = rr.filter((r) => r.state === 'sent').length;
        const err = rr.filter((r) => r.state === 'error').length;
        const nx = rr.filter((r) => r.sendAt && (r.state === 'scheduled' || r.state === 'armed')).sort((a, b) => a.sendAt - b.sendAt)[0];
        pls.style.color = '#8fe39a';
        pls.textContent = '● ' + sent + ' env · ' + pend + ' pend' + (err ? (' · ' + err + ' erro') : '') + (nx ? (' · próx ' + fmt(nx.sendAt - serverNow())) : '');
      }
    }
    if (document.getElementById('twmgr-cards-planner')) refreshCards('planner');
    if (document.getElementById('twmgr-pl-queue')) { try { renderPlannerQueue(plActive()); } catch (e) {} }
    // Atualiza só o indicador (●) de cada aba de ataque, sem reconstruir a lista (evita "roubar" cliques).
    document.querySelectorAll('.twmgr-pl-tab').forEach((el) => {
      const atk = (config.planner.attacks || []).find((a) => a.id === el.getAttribute('data-id'));
      const dot = el.querySelector('.twmgr-pl-tab-dot');
      if (dot) dot.style.display = (atk && atk.running) ? 'inline' : 'none';
    });
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
    ring('twmgr-btab-planner', config.planner && config.planner.attacks && config.planner.attacks.some((a) => a.running));
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
  function scavStart() { readScavUnits(); if (!SCAV_UNITS.some(([u]) => config.scav.units[u])) { pushLog('Coleta: marque ao menos 1 unidade.', 'err', 'scav'); return; } config.scav.running = true; config.scav.nextAt = 0; save(); setScavStatus(true); pushLog('Coleta iniciada em todas as aldeias.', 'ok', 'scav'); scavTick(); }
  function scavStop() { readScavUnits(); config.scav.running = false; save(); clearTimeout(scavTimer); setScavStatus(false); pushLog('Coleta parada.', '', 'scav'); }
  function setScavStatus(on) { setBtnState('twmgr-scav-start', 'twmgr-scav-stop', on, '● Coletando', '▶ Coletar'); }
  function readFarmCfg() {
    const pw = document.getElementById('twmgr-farm-wood'); if (pw) config.farm.minWood = parseInt(pw.value, 10) || 0;
    const ps = document.getElementById('twmgr-farm-stone'); if (ps) config.farm.minStone = parseInt(ps.value, 10) || 0;
    const pi = document.getElementById('twmgr-farm-iron'); if (pi) config.farm.minIron = parseInt(pi.value, 10) || 0;
    const it = document.getElementById('twmgr-farm-int'); if (it) config.farm.interval = Math.max(1, parseInt(it.value, 10) || 10) * 60;
    const dt = document.getElementById('twmgr-farm-dist'); if (dt) config.farm.maxDist = parseFloat((dt.value || '').replace(',', '.')) || 13;
    const wl = document.getElementById('twmgr-farm-wall'); if (wl) { config.farm.maxWall = parseInt(wl.value, 10); if (isNaN(config.farm.maxWall)) config.farm.maxWall = 20; }
    const bw = document.getElementById('twmgr-farm-bluewall'); if (bw) { config.farm.blueMaxWall = parseInt(bw.value, 10); if (isNaN(config.farm.blueMaxWall) || config.farm.blueMaxWall < 0) config.farm.blueMaxWall = 0; }
    const bdd = document.getElementById('twmgr-farm-bluedelmindef'); if (bdd) { config.farm.blueDeleteMinDef = parseInt(bdd.value, 10); if (isNaN(config.farm.blueDeleteMinDef) || config.farm.blueDeleteMinDef < 1) config.farm.blueDeleteMinDef = 10; }
    const md = document.getElementById('twmgr-farm-mode'); if (md) config.farm.mode = md.value || 'suave';
    const gp = document.getElementById('twmgr-farm-group'); if (gp) config.farm.group = gp.value || null;
    const rp = document.getElementById('twmgr-farm-repeat'); if (rp) config.farm.repeat = rp.checked;
    const rm = document.getElementById('twmgr-farm-repeatmin'); if (rm) { config.farm.repeatMin = parseInt(rm.value, 10); if (isNaN(config.farm.repeatMin) || config.farm.repeatMin < 1) config.farm.repeatMin = 10; }
    const mc = document.getElementById('twmgr-farm-mincl'); if (mc) config.farm.minCL = Math.max(0, parseInt(mc.value, 10) || 0);
    const od = document.getElementById('twmgr-farm-order'); if (od) config.farm.order = od.value || 'dist';
    const dy = document.getElementById('twmgr-farm-dyn'); if (dy) config.farm.dynTemplate = dy.checked;
    if (!config.farm.matrix) config.farm.matrix = defFarmMatrix();
    FARM_COLORS.forEach((k) => {
      const a = (document.getElementById('twmgr-fm-' + k + '-a') || {}).checked;
      const b = (document.getElementById('twmgr-fm-' + k + '-b') || {}).checked;
      const cc = (document.getElementById('twmgr-fm-' + k + '-c') || {}).checked;
      let mode = 'none';
      if (a) mode = 'a'; else if (b) mode = 'b'; else if (cc) mode = 'c';
      config.farm.matrix[k] = { mode: mode, qty: 1 };
    });
    save();
  }
  function farmStart() { readFarmCfg(); config.farm.running = true; config.farm.nextAt = 0; save(); setFarmStatus(true); pushLog('Saque iniciado — modo ' + config.farm.mode + ', ordem por ' + config.farm.order + (config.farm.dynTemplate ? ', template dinâmico' : '') + '.', 'ok', 'farm'); farmTick(); }
  function farmStop() { readFarmCfg(); config.farm.running = false; save(); clearTimeout(farmTimer); setFarmStatus(false); pushLog('Saque parado.', '', 'farm'); }
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
  function wallStart() { readWallCfg(); config.wall.running = true; config.wall.nextAt = 0; save(); setWallStatus(true); pushLog('Muralha iniciada — muros ' + config.wall.wallMin + ' a ' + config.wall.wallMax + ', ' + config.wall.axeCount + ' bárbaro/ataque, aríete ' + config.wall.ramMode + '.', 'ok', 'wall'); wallTick(); }
  function wallStop() { readWallCfg(); config.wall.running = false; save(); clearTimeout(wallTimer); setWallStatus(false); pushLog('Muralha parada.', '', 'wall'); }
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
      "#twmgr-panel{position:fixed;top:12px;right:12px;z-index:99999;width:480px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);display:flex;flex-direction:column;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#e9dcc2;background:linear-gradient(160deg,#2a2016,#201810);border:1px solid #b8912e;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.6);overflow:hidden}",
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
      ".twmgr-fmtable{width:100%;border-collapse:collapse;font-size:11px}",
      ".twmgr-fmtable th{font-size:10px;color:#ffd76a !important;font-weight:700;padding:4px 2px;border-bottom:1px solid #6a5320;text-transform:uppercase;vertical-align:middle;background:#160f06 !important;background-image:none !important}",
      ".twmgr-fmtable td{vertical-align:middle}",
      ".twmgr-fmtable th:first-child,.twmgr-fmrow td:first-child{text-align:left}",
      ".twmgr-fmtable th:not(:first-child),.twmgr-fmrow td:not(:first-child){width:44px;text-align:center}",
      ".twmgr-fmrow{border-bottom:1px solid rgba(255,255,255,.04)}",
      ".twmgr-fmrow:hover{background:rgba(212,175,55,.06)}",
      ".twmgr-fmck{width:15px;height:15px;cursor:pointer;vertical-align:middle;margin:0}",
      ".twmgr-card-break{flex-basis:100%;height:0}",
      ".twmgr-cards{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}",
      ".twmgr-card-mini{flex:1 1 0;min-width:58px;background:linear-gradient(165deg,#241a0e,#181008);border:1px solid #45351d;border-radius:9px;padding:7px 6px 6px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}",
      ".twmgr-card-wide{flex-basis:100%}",
      ".twmgr-card-v{font-size:19px;font-weight:800;color:#ffd76a;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".twmgr-card-l{font-size:8px;color:#9a8a63;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".twmgr-section{border:1px solid #3a2e1b;border-radius:9px;padding:8px 9px;margin-bottom:9px;background:rgba(0,0,0,.14)}",
      ".twmgr-sec-h{font-size:9px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#c9a24a;margin:-2px 0 6px}",
      ".twmgr-modlog{margin-top:10px;border-top:1px solid #3a2e1b;padding-top:6px}",
      ".twmgr-modlog-head{cursor:pointer;font-size:10px;color:#c9b88f;user-select:none;display:flex;align-items:center;gap:5px}",
      ".twmgr-modlog-head:hover{color:#ffe08a}",
      ".twmgr-modlog-body{max-height:180px;overflow-y:auto;margin-top:5px;font-size:10px}",
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
      ".twmgr-bld-plan{max-height:260px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:8px;padding:3px}",
      ".twmgr-bld-plan::-webkit-scrollbar{width:8px}.twmgr-bld-plan::-webkit-scrollbar-thumb{background:#4a3a22;border-radius:4px}",
      ".twmgr-bld-item{display:grid;grid-template-columns:22px 16px 18px 1fr 44px 18px 18px 18px;align-items:center;gap:4px;padding:3px 5px;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;color:#e9dcc2}",
      ".twmgr-bld-item:last-child{border-bottom:none}",
      ".twmgr-bld-item.twmgr-bld-off{opacity:.42;filter:grayscale(.6)}",
      ".twmgr-bld-ord{color:#8f7d57;font-size:9px;text-align:right}",
      ".twmgr-bld-ico{font-size:14px;text-align:center}",
      ".twmgr-bld-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".twmgr-bld-lvl{width:100% !important;text-align:center;padding:2px 4px !important;font-size:11px !important}",
      ".twmgr-bld-up,.twmgr-bld-down,.twmgr-bld-rm{cursor:pointer;text-align:center;font-size:11px;color:#c9b88f;border-radius:4px;user-select:none;padding:1px 0}",
      ".twmgr-bld-up:hover,.twmgr-bld-down:hover{background:rgba(212,175,55,.18);color:#ffe08a}",
      ".twmgr-bld-rm{color:#e6a89d}.twmgr-bld-rm:hover{background:rgba(231,76,60,.22);color:#ff6f5e}",
      ".twmgr-bld-sub{background:rgba(212,175,55,.08) !important;border:1px solid #5c4a29 !important;color:#c9b88f !important}",
      ".twmgr-bld-sub.on{background:linear-gradient(180deg,#7a5a20,#5a4218) !important;color:#ffe08a !important;border-color:#d4af37 !important}",
    ].join('');
    document.head.appendChild(s);
  }

  function showTab(name) {
    ['scav', 'farm', 'wall', 'recruit', 'fakes', 'market', 'build', 'bb', 'map', 'planner', 'log'].forEach((n) => {
      const c = document.getElementById('twmgr-tab-' + n); if (c) c.style.display = n === name ? 'block' : 'none';
      const b = document.getElementById('twmgr-btab-' + n); if (b) b.classList.toggle('active', n === name);
    });
  }

  function buildUI() {
    injectStyles();
    const p = document.createElement('div'); p.id = 'twmgr-panel';
    const tabBtn = (n, ico, label) => '<div id="twmgr-btab-' + n + '" class="twmgr-tab" data-tab="' + n + '"><span class="twmgr-tab-ico">' + ico + '</span><span class="twmgr-tab-lbl">' + label + '</span></div>';
    // Saque: matriz estilo FarmGod — A/B/C são checkboxes; regra "1 por linha" garantida no JS (marcar um desmarca os outros).
    const fmRow = (k, label) => '<tr class="twmgr-fmrow">' +
      '<td style="text-align:left;padding:3px 6px">' + label + '</td>' +
      '<td style="text-align:center"><input id="twmgr-fm-' + k + '-a" class="twmgr-fmck" type="checkbox"></td>' +
      '<td style="text-align:center"><input id="twmgr-fm-' + k + '-b" class="twmgr-fmck" type="checkbox"></td>' +
      '<td style="text-align:center"><input id="twmgr-fm-' + k + '-c" class="twmgr-fmck" type="checkbox"></td></tr>';
    // Helpers de layout: cards no topo, hint curto, seção com título, log recolhível por módulo.
    const cardsDiv = (mod) => '<div id="twmgr-cards-' + mod + '" class="twmgr-cards"></div>';
    const hint = (txt) => '<div class="twmgr-hint">' + txt + '</div>';
    const sec = (title, inner) => '<div class="twmgr-section">' + (title ? '<div class="twmgr-sec-h">' + title + '</div>' : '') + inner + '</div>';
    const modLog = (mod) => '<div class="twmgr-modlog"><div class="twmgr-modlog-head" data-modlog="' + mod + '">▸ Log do módulo (<span id="twmgr-modlog-count-' + mod + '">0</span>)</div><div id="twmgr-modlog-body-' + mod + '" class="twmgr-modlog-body" style="display:none"></div></div>';
    p.innerHTML =
      '<div id="twmgr-head"><span class="twmgr-title">🎯 TW Manager <span class="twmgr-ver">v' + VERSION + '</span></span><div id="twmgr-head-actions"><span id="twmgr-dot" class="twmgr-dot" title="algum módulo ativo"></span><span id="twmgr-logbtn" title="Log">📜</span><span id="twmgr-upd-btn" title="Verificar / instalar atualização">🔄<span id="twmgr-upd-badge" style="display:none">●</span></span><span id="twmgr-min" title="minimizar / restaurar">–</span></div></div>' +
      '<div class="twmgr-tabs">' + tabBtn('scav', '⛏️', 'Coletas') + tabBtn('farm', '🐎', 'Saque') + tabBtn('wall', '🐏', 'Muralha') + tabBtn('recruit', '🏹', 'Recrutar') + tabBtn('fakes', '🎭', 'Fakes') + tabBtn('market', '🏪', 'Mercado') + tabBtn('build', '🏗️', 'Edifícios') + tabBtn('bb', '🌱', 'Cultivo') + tabBtn('map', '🗺️', 'Mapa') + tabBtn('planner', '🎯', 'Coord.') + '</div>' +
      '<div id="twmgr-body">' +
      '<div id="twmgr-tab-scav" style="display:none">' +
        hint('Coleta em <b>todas as aldeias</b>: reparte as tropas marcadas nas opções livres e reenvia no retorno.') +
        cardsDiv('scav') +
        sec('Tropas na coleta', '<div class="twmgr-units">' + SCAV_UNITS.map(([u, n]) => '<label><input id="twmgr-su-' + u + '" type="checkbox"> ' + unitIcon(u, n) + ' ' + n + '</label>').join('') + '</div>') +
        '<div class="twmgr-actions"><button id="twmgr-scav-start" class="twmgr-btn twmgr-go">▶ Coletar</button><button id="twmgr-scav-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-scav-status" class="twmgr-cstatus"></div>' +
        modLog('scav') +
      '</div>' +
      '<div id="twmgr-tab-farm" style="display:none">' +
        hint('FarmGod: por <b>cor</b>, escolha <b>um</b> modo (A, B ou C). Vermelho nunca; azul até a <b>muralha máx. do azul</b> e sem defesa. Nunca empilha no mesmo alvo.') +
        cardsDiv('farm') +
        sec('Ataque por cor (marque 1 por linha)',
          '<table class="twmgr-fmtable"><tr><th style="text-align:left">cor</th><th>A</th><th>B</th><th>C</th></tr>' +
          fmRow('greenEmpty', '🟢 verde vazio') + fmRow('greenFull', '🟢 verde cheio') + fmRow('yellowEmpty', '🟡 amarelo vazio') + fmRow('yellowFull', '🟡 amarelo cheio') + fmRow('blue', '🔵 azul') + '</table>' +
          '<label class="twmgr-check" style="margin-top:6px"><input id="twmgr-farm-dyn" type="checkbox"> Template dinâmico (A=mín, B=+20% da carga)</label>') +
        sec('Recurso mínimo (só p/ o C)',
          '<div class="twmgr-res"><label><span class="icon header wood"></span><input id="twmgr-farm-wood" class="twmgr-inp" type="number" min="0" value="1000"></label><label><span class="icon header stone"></span><input id="twmgr-farm-stone" class="twmgr-inp" type="number" min="0" value="1000"></label><label><span class="icon header iron"></span><input id="twmgr-farm-iron" class="twmgr-inp" type="number" min="0" value="1000"></label></div>') +
        sec('Alcance',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo de aldeias</span><select id="twmgr-farm-group" class="twmgr-inp" style="width:170px"></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-farm-dist" class="twmgr-inp" type="number" min="0" step="0.1" value="13" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Muralha máx. (nível)</span><input id="twmgr-farm-wall" class="twmgr-inp" type="number" min="0" max="20" value="20" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Muralha máx. do azul</span><input id="twmgr-farm-bluewall" class="twmgr-inp" type="number" min="0" max="20" value="0" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Se o relatório azul mostrar esse tanto de tropa (ou mais) na defesa, o relatório é apagado — a aldeia some do assistente e nunca mais é atacada por engano.">Apagar relatório azul c/ defesa ≥</span><input id="twmgr-farm-bluedelmindef" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Mínimo CL p/ farmar</span><input id="twmgr-farm-mincl" class="twmgr-inp" type="number" min="0" value="0" style="width:66px"></div>') +
        sec('Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Modo</span><select id="twmgr-farm-mode" class="twmgr-inp" style="width:120px"><option value="agressivo">Agressivo</option><option value="suave">Suave</option></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Ordem de farm</span><select id="twmgr-farm-order" class="twmgr-inp" style="width:130px"><option value="dist">Por distância</option><option value="recurso">Por recurso</option></select></div>' +
          '<label class="twmgr-check"><input id="twmgr-farm-repeat" type="checkbox"> Repetir farm (empilha ondas no mesmo alvo)</label>' +
          '<div class="twmgr-row" id="twmgr-farm-repeatrow"><span class="twmgr-lbl">Repetir a cada (min)</span><input id="twmgr-farm-repeatmin" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-farm-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-farm-start" class="twmgr-btn twmgr-go">▶ Saquear</button><button id="twmgr-farm-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-farm-status" class="twmgr-cstatus"></div>' +
        modLog('farm') +
      '</div>' +
      '<div id="twmgr-tab-wall" style="display:none">' +
        hint('🐏 Manda bárbaro + aríete + explorador pra derrubar muralhas dos alvos do assistente. Roda em paralelo ao Saque.') +
        cardsDiv('wall') +
        sec('Faixa de muralha',
          '<div class="twmgr-row"><span class="twmgr-lbl">Derrubar muros do nível</span><span><input id="twmgr-wall-min" class="twmgr-inp" type="number" min="1" max="20" value="1" style="width:44px"> até <input id="twmgr-wall-max" class="twmgr-inp" type="number" min="1" max="20" value="6" style="width:44px"></span></div>') +
        sec('Tropa por ataque',
          '<div class="twmgr-row"><span class="twmgr-lbl">Bárbaro por ataque</span><input id="twmgr-wall-axe" class="twmgr-inp" type="number" min="1" value="80" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Aríete</span><select id="twmgr-wall-mode" class="twmgr-inp" style="width:150px"><option value="auto">auto (pela muralha)</option><option value="fixo">fixo</option></select></div>' +
          '<div id="twmgr-wall-auto"><div class="twmgr-row"><span class="twmgr-lbl">Aríetes p/ muralha 6</span><input id="twmgr-wall-ramw6" class="twmgr-inp" type="number" min="1" value="24" style="width:66px"></div><div style="font-size:9px;color:#8f7d57">calibra o resto: muro5≈18 · 4≈13 · 3≈9 · 2≈5 · 1≈3</div></div>' +
          '<div id="twmgr-wall-fixo" style="display:none"><div class="twmgr-row"><span class="twmgr-lbl">Aríetes por ataque (fixo)</span><input id="twmgr-wall-ramfix" class="twmgr-inp" type="number" min="1" value="20" style="width:66px"></div></div>') +
        sec('Ritmo', '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-wall-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-wall-start" class="twmgr-btn twmgr-go">▶ Quebrar</button><button id="twmgr-wall-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-wall-status" class="twmgr-cstatus"></div>' +
        modLog('wall') +
      '</div>' +
      '<div id="twmgr-tab-recruit" style="display:none">' +
        hint('Recruta por <b>grupo</b> (ATK/DEF): mantém a fila alvo por edifício e para no alvo de tropas. Vazio = contínuo.') +
        cardsDiv('recruit') +
        sec('Grupos',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo ATK</span><select id="twmgr-r-gatk" class="twmgr-inp" style="width:170px"></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo DEF</span><select id="twmgr-r-gdef" class="twmgr-inp" style="width:170px"></select></div>' +
          '<div style="text-align:right;margin-top:2px"><button id="twmgr-r-reload" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">↻ grupos</button></div>') +
        sec('Tropas por perfil', recruitProfileHTML('atk', '⚔️ Perfil ATK') + recruitProfileHTML('def', '🛡️ Perfil DEF')) +
        sec('Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Fila alvo (h)</span><input id="twmgr-r-hours" class="twmgr-inp" type="number" min="0.5" step="0.5" value="2" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Repor quando faltar (min)</span><input id="twmgr-r-refill" class="twmgr-inp" type="number" min="1" value="30" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-r-start" class="twmgr-btn twmgr-go">▶ Recrutar</button><button id="twmgr-r-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<button id="twmgr-r-diag" class="twmgr-btn twmgr-ghost" style="width:100%;margin-bottom:6px">🔍 Diagnóstico (Recrutar)</button>' +
        '<div id="twmgr-recruit-status" class="twmgr-cstatus"></div>' +
        modLog('recruit') +
      '</div>' +
      '<div id="twmgr-tab-fakes" style="display:none">' +
        hint('Fakes com <b>chegada</b> em horário marcado. 1 isca + explorador (neutro, não revela off/def).') +
        cardsDiv('fakes') +
        sec('Alvos e chegada',
          '<div class="twmgr-row"><span class="twmgr-lbl">Relógio do servidor</span><b id="twmgr-srvclock" style="color:#ffd76a">--:--:--</b></div>' +
          '<label class="twmgr-lbl">Alvos (cole vários)</label><textarea id="twmgr-fk-targets" class="twmgr-inp" style="width:100%;height:52px;margin:2px 0 6px" placeholder="430|522 428|524 430|520 …"></textarea>' +
          '<label class="twmgr-lbl">Chegada</label><input id="twmgr-fk-arr" class="twmgr-inp" type="datetime-local" step="1" style="width:100%;margin:2px 0 0">') +
        sec('Origens',
          '<div class="twmgr-row"><span class="twmgr-lbl">Origens que enviam</span><span style="font-size:9px"><a id="twmgr-fk-all" style="cursor:pointer;color:#e6cf7d">todas</a> · <a id="twmgr-fk-none" style="cursor:pointer;color:#e6cf7d">nenhuma</a></span></div>' +
          '<div id="twmgr-fk-origins" style="max-height:96px;overflow-y:auto;border:1px solid #3a2c1a;border-radius:6px;padding:4px"></div>' +
          '<div class="twmgr-row" style="margin-top:6px"><span class="twmgr-lbl">Distribuição</span><span style="font-size:10px"><label><input type="radio" name="twmgr-fk-mode" value="split"> dividir</label> <label><input type="radio" name="twmgr-fk-mode" value="all"> todas→todos</label></span></div>') +
        sec('Estratégia do fake',
          '<div class="twmgr-row"><span class="twmgr-lbl">Isca (1x)</span><select id="twmgr-fk-siege" class="twmgr-inp" style="width:110px"><option value="ram">Aríete</option><option value="catapult">Catapulta</option><option value="none">nenhum</option></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Preencher com</span><select id="twmgr-fk-filler" class="twmgr-inp" style="width:110px">' + UNITS.map(([u, n]) => '<option value="' + u + '">' + n + '</option>').join('') + '</select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Pop mín (% dos pontos)</span><input id="twmgr-fk-pct" class="twmgr-inp" type="number" min="0" step="0.5" value="1" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Pop mín fixa (0=auto)</span><input id="twmgr-fk-minpop" class="twmgr-inp" type="number" min="0" value="0" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Offset envio (ms)</span><input id="twmgr-fk-offset" class="twmgr-inp" type="number" min="0" value="150" style="width:56px"></div>') +
        '<button id="twmgr-fk-preview" class="twmgr-btn twmgr-ghost" style="width:100%;margin-bottom:6px">💡 Prever fakes</button>' +
        '<div class="twmgr-actions"><button id="twmgr-fk-start" class="twmgr-btn twmgr-go">▶ Armar</button><button id="twmgr-fk-stop" class="twmgr-btn twmgr-stop">■ Desarmar</button></div>' +
        '<div id="twmgr-fk-status" class="twmgr-cstatus"></div>' +
        modLog('fakes') +
      '</div>' +
      '<div id="twmgr-tab-market" style="display:none">' +
        hint('Mercado: <b>Cunhagem</b> junta recurso num destino; <b>Equilíbrio</b> nivela as aldeias por % do armazém.') +
        cardsDiv('market') +
        sec('Modo', '<div class="twmgr-row"><span class="twmgr-lbl">Modo</span><span style="font-size:11px"><label><input type="radio" name="twmgr-mk-mode" value="cunhagem"> 💰 Cunhagem</label> <label><input type="radio" name="twmgr-mk-mode" value="equilibrio"> ⚖️ Equilíbrio</label></span></div>') +
        '<div id="twmgr-mk-cunhagem">' +
          sec('Cunhagem',
            '<div class="twmgr-row"><span class="twmgr-lbl">Coordenada destino</span><input id="twmgr-mk-coord" class="twmgr-inp" type="text" placeholder="464|604" style="width:90px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Deixar mínimo (cada rec.)</span><input id="twmgr-mk-reserve" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:72px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Aldeias de origem</span><span style="font-size:9px"><a id="twmgr-mk-all" style="cursor:pointer;color:#e6cf7d">todas</a> · <a id="twmgr-mk-none" style="cursor:pointer;color:#e6cf7d">nenhuma</a></span></div>' +
            '<div id="twmgr-mk-sources" style="max-height:120px;overflow-y:auto;border:1px solid #3a2c1a;border-radius:6px;padding:4px"></div>') +
        '</div>' +
        '<div id="twmgr-mk-equilibrio" style="display:none">' +
          sec('Equilíbrio',
            '<div style="font-size:10px;color:#8f7d57;margin-bottom:4px">Aldeia acima do limiar doa o excedente pras abaixo, por recurso. Da mais perto primeiro.</div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Encher armazém até (%)</span><input id="twmgr-mk-thr" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-mk-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="15" style="width:56px"></div>') +
        '</div>' +
        sec('Ritmo', '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-mk-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-mk-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-mk-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-mk-status" class="twmgr-cstatus"></div>' +
        modLog('market') +
      '</div>' +
      '<div id="twmgr-tab-build" style="display:none">' +
        hint('🏗️ Plano de obras por perfil <b>ATK/DEF</b>. Ordem da lista = prioridade; item caro vira demanda pro Equilíbrio.') +
        cardsDiv('build') +
        sec('Plano de obras',
          '<div class="twmgr-bld-subtabs" style="display:flex;gap:4px;margin-bottom:6px">' +
            '<button class="twmgr-btn twmgr-bld-sub twmgr-bld-sub-atk on" data-prof="atk" style="flex:1;padding:4px 6px;font-size:11px">⚔️ ATK</button>' +
            '<button class="twmgr-btn twmgr-bld-sub twmgr-bld-sub-def" data-prof="def" style="flex:1;padding:4px 6px;font-size:11px">🛡️ DEF</button>' +
          '</div>' +
          '<div id="twmgr-bld-plan" class="twmgr-bld-plan"></div>' +
          '<div class="twmgr-row" style="gap:4px;margin-top:6px">' +
            '<select id="twmgr-bld-add-b" class="twmgr-inp" style="flex:1">' +
              Object.keys(BUILD_META).map((k) => '<option value="' + k + '">' + BUILD_META[k].ico + ' ' + BUILD_META[k].name + ' (máx ' + BUILD_META[k].max + ')</option>').join('') +
            '</select>' +
            '<input id="twmgr-bld-add-lvl" class="twmgr-inp" type="number" min="1" placeholder="nv" style="width:52px">' +
            '<button id="twmgr-bld-add" class="twmgr-btn twmgr-ghost" style="padding:5px 10px">+</button>' +
          '</div>' +
          '<div style="display:flex;gap:6px;margin-top:4px">' +
            '<button id="twmgr-bld-reset" class="twmgr-btn twmgr-ghost" style="flex:1;font-size:10px">↺ reset padrão</button>' +
            '<button id="twmgr-bld-clear" class="twmgr-btn twmgr-ghost" style="flex:1;font-size:10px">🗑 limpar tudo</button>' +
          '</div>') +
        sec('Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Máx na fila</span><input id="twmgr-bld-max" class="twmgr-inp" type="number" min="1" value="5" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-bld-int" class="twmgr-inp" type="number" min="1" value="10" style="width:56px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-bld-start" class="twmgr-btn twmgr-go">▶ Construir</button><button id="twmgr-bld-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-bld-status" class="twmgr-cstatus"></div>' +
        modLog('build') +
      '</div>' +
      '<div id="twmgr-tab-bb" style="display:none">' +
        hint('🌱 Desenvolve aldeias <b>bárbaras conquistadas</b>: constrói a ladder, abastece das grandes próximas e ao graduar recruta CL sozinho.') +
        cardsDiv('bb') +
        sec('Grupo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo Cultivo</span><select id="twmgr-bb-group" class="twmgr-inp" style="width:170px"></select></div>' +
          '<div style="text-align:right;margin-top:2px"><button id="twmgr-bb-reload" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">↻ grupos</button></div>') +
        sec('Ladder de obra (chave nível, em ordem)',
          '<textarea id="twmgr-bb-tpl" class="twmgr-inp" style="width:100%;height:96px;font-family:monospace;font-size:10px"></textarea>' +
          '<div style="font-size:10px;color:#8f7d57;margin:4px 0 2px">Aldeias DEF (coords, 1 por linha) — o resto vira ATK</div>' +
          '<textarea id="twmgr-bb-def" class="twmgr-inp" style="width:100%;height:44px;font-family:monospace;font-size:10px" placeholder="ex: 470|592"></textarea>') +
        sec('Abastecimento',
          '<div class="twmgr-row"><span class="twmgr-lbl">Reserva na fonte (%)</span><input id="twmgr-bb-reserve" class="twmgr-inp" type="number" min="0" max="90" value="40" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Dist. máx. fonte (campos)</span><input id="twmgr-bb-dist" class="twmgr-inp" type="number" min="1" value="15" style="width:56px"></div>') +
        sec('Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Máx na fila</span><input id="twmgr-bb-max" class="twmgr-inp" type="number" min="1" value="5" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-bb-int" class="twmgr-inp" type="number" min="1" value="10" style="width:56px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-bb-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-bb-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-bb-status" class="twmgr-cstatus"></div>' +
        modLog('bb') +
      '</div>' +
      '<div id="twmgr-tab-map" style="display:none">' +
        hint('🗺️ Manda <b>exploradores</b> pros bárbaros ainda não escaneados (ou há +N dias). Roda uma vez e para.') +
        cardsDiv('map') +
        sec('Origem',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo origem (vazio = todas)</span><select id="twmgr-bm-group" class="twmgr-inp" style="width:150px"></select></div>' +
          '<div style="text-align:right;margin-top:2px"><button id="twmgr-bm-reload" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">↻ grupos</button> <button id="twmgr-bm-refmap" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="recarrega /map/village.txt">↻ mapa</button></div>') +
        sec('Filtros de alvo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-bm-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="20" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Sem escanear há (dias)</span><input id="twmgr-bm-days" class="twmgr-inp" type="number" min="0" step="0.5" value="2" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Pontos de/até</span><span><input id="twmgr-bm-minpts" class="twmgr-inp" type="number" min="0" value="26" style="width:56px"> a <input id="twmgr-bm-maxpts" class="twmgr-inp" type="number" min="1" value="5000" style="width:56px"></span></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Máx alvos por aldeia/ciclo</span><input id="twmgr-bm-maxper" class="twmgr-inp" type="number" min="1" value="20" style="width:66px"></div>') +
        sec('Exploradores',
          '<div class="twmgr-row"><span class="twmgr-lbl">Reserva de spy (guardar/aldeia)</span><input id="twmgr-bm-reserve" class="twmgr-inp" type="number" min="0" value="30" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Spy por alvo</span><input id="twmgr-bm-spy" class="twmgr-inp" type="number" min="1" value="1" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Delay entre envios (ms)</span><input id="twmgr-bm-delay" class="twmgr-inp" type="number" min="0" step="100" value="500" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-bm-preview" class="twmgr-btn twmgr-ghost">💡 Prévia</button><button id="twmgr-bm-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-bm-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-bm-status" class="twmgr-cstatus"></div>' +
        '<div style="margin-top:8px;font-size:11px;color:#e8d29a">Alvos detectados: <b id="twmgr-bm-count">0</b></div>' +
        '<div id="twmgr-bm-list" style="max-height:220px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:8px;margin-top:4px"></div>' +
        modLog('map') +
      '</div>' +
      '<div id="twmgr-tab-planner" style="display:none">' +
        hint('🎯 Coordenado: monte vários ataques independentes — cada um com seu próprio alvo, aldeias e tropas — e arme cada um separadamente (o botão libera um novo ataque em branco assim que você arma). Cada aldeia pode mandar <b>várias ondas</b> (+ onda) dentro do mesmo ataque. Tropas ficam <b>reservadas</b> — Saque/Fakes/Muralha não gastam elas.') +
        cardsDiv('planner') +
        sec('Ataques', '<div id="twmgr-pl-attacks" style="display:flex;flex-wrap:wrap;gap:6px"></div>') +
        sec('1. Alvo (do ataque selecionado acima)',
          '<div class="twmgr-row"><span class="twmgr-lbl">Relógio do servidor</span><b id="twmgr-pl-srvclock" style="color:#ffd76a">--:--:--</b></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Coord alvo</span><span><input id="twmgr-pl-target-x" class="twmgr-inp" type="number" min="1" placeholder="x" style="width:56px"> | <input id="twmgr-pl-target-y" class="twmgr-inp" type="number" min="1" placeholder="y" style="width:56px"></span></div>' +
          '<label class="twmgr-lbl">Chegada base (horário do servidor)</label><input id="twmgr-pl-arr" class="twmgr-inp" type="datetime-local" step="1" style="width:100%;margin:2px 0 0">' +
          '<div class="twmgr-row" style="margin-top:6px"><span class="twmgr-lbl">Offset envio (ms)</span><input id="twmgr-pl-offset" class="twmgr-inp" type="number" min="0" value="150" style="width:56px"></div>') +
        sec('2. Aldeias participantes',
          '<div class="twmgr-row"><span class="twmgr-lbl">Selecione</span><span style="font-size:9px"><a id="twmgr-pl-all" style="cursor:pointer;color:#e6cf7d">todas</a> · <a id="twmgr-pl-none" style="cursor:pointer;color:#e6cf7d">nenhuma</a> · <a id="twmgr-pl-load" style="cursor:pointer;color:#e6cf7d">🔄 carregar tropas</a></span></div>' +
          '<div id="twmgr-pl-villages" style="max-height:110px;overflow-y:auto;border:1px solid #3a2c1a;border-radius:6px;padding:4px"></div>') +
        sec('3. Composição por aldeia (+ onda pra mandar mais de um ataque da mesma aldeia)',
          '<div id="twmgr-pl-cards"><div style="font-size:10px;color:#8f7d57;padding:6px;text-align:center">— marque aldeias acima e clique em <b>🔄 carregar tropas</b> —</div></div>') +
        sec('4. Armar este ataque',
          '<div class="twmgr-actions"><button id="twmgr-pl-start" class="twmgr-btn twmgr-go">▶ Armar este ataque</button><button id="twmgr-pl-stop" class="twmgr-btn twmgr-stop">■ Desarmar</button><button id="twmgr-pl-clear" class="twmgr-btn twmgr-ghost" style="flex:0 0 auto">🗑</button></div>' +
          '<div id="twmgr-pl-status" class="twmgr-cstatus"></div>') +
        sec('5. Fila deste ataque',
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:10px;color:#8f7d57">ordenada por horário de envio</span><button id="twmgr-pl-queue-clear" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="remover enviados e erros do histórico">🗑 limpar histórico</button></div>' +
          '<div id="twmgr-pl-queue" style="max-height:220px;overflow-y:auto"></div>') +
        sec('Templates',
          '<div class="twmgr-row"><span class="twmgr-lbl">Salvar plano atual</span><span><input id="twmgr-pl-tpl-name" class="twmgr-inp" type="text" placeholder="ex: guerra XYZ" style="width:120px"> <button id="twmgr-pl-tpl-save" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">💾</button></span></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Carregar</span><span><select id="twmgr-pl-tpl-load" class="twmgr-inp" style="width:120px"></select> <button id="twmgr-pl-tpl-apply" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">📂</button> <button id="twmgr-pl-tpl-del" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="apagar">🗑</button></span></div>') +
        modLog('planner') +
      '</div>' +
      '<div id="twmgr-tab-log" style="display:none">' +
      '<div class="twmgr-hint">🤖 Notificação de CAPTCHA: alerta quando o jogo pedir verificação.</div>' +
      '<label class="twmgr-check"><input id="twmgr-cap-en" type="checkbox"> Detectar CAPTCHA</label>' +
      '<label class="twmgr-check"><input id="twmgr-cap-brw" type="checkbox"> Notificação do navegador</label>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Tópico ntfy.sh (opcional)</span><input id="twmgr-cap-ntfy" class="twmgr-inp" type="text" placeholder="meu-topico" style="width:120px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Sonda anti-F5 (seg, 0=off)</span><input id="twmgr-cap-poll" class="twmgr-inp" type="number" min="0" step="10" value="120" style="width:66px"></div>' +
      '<button id="twmgr-cap-test" class="twmgr-btn twmgr-ghost" style="width:100%;margin:4px 0 8px">🔔 Testar notificação</button>' +
      '<div id="twmgr-log" class="twmgr-log"></div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(p);

    document.getElementById('twmgr-logbtn').addEventListener('click', () => showTab('log'));

    // Notificação de CAPTCHA
    document.getElementById('twmgr-cap-en').checked = !!config.captcha.enabled;
    document.getElementById('twmgr-cap-brw').checked = !!config.captcha.browserNotif;
    document.getElementById('twmgr-cap-ntfy').value = config.captcha.ntfyTopic || '';
    document.getElementById('twmgr-cap-poll').value = config.captcha.pollSec != null ? config.captcha.pollSec : 120;
    const readCapCfg = () => {
      config.captcha.enabled = document.getElementById('twmgr-cap-en').checked;
      config.captcha.browserNotif = document.getElementById('twmgr-cap-brw').checked;
      config.captcha.ntfyTopic = document.getElementById('twmgr-cap-ntfy').value.trim();
      const ps = parseInt(document.getElementById('twmgr-cap-poll').value, 10);
      config.captcha.pollSec = (isNaN(ps) || ps < 0) ? 120 : ps;
      save();
      startBotCanary();   // aplica o novo intervalo (ou desliga se 0)
    };
    ['twmgr-cap-en', 'twmgr-cap-brw', 'twmgr-cap-ntfy', 'twmgr-cap-poll'].forEach((id) => document.getElementById(id).addEventListener('change', readCapCfg));
    document.getElementById('twmgr-cap-brw').addEventListener('change', async () => { if (document.getElementById('twmgr-cap-brw').checked) await ensureNotifyPermission(); });
    document.getElementById('twmgr-cap-test').addEventListener('click', testCaptchaNotif);

    SCAV_UNITS.forEach(([u]) => { const el = document.getElementById('twmgr-su-' + u); if (el) el.checked = !!(config.scav.units && config.scav.units[u]); });
    document.getElementById('twmgr-scav-start').addEventListener('click', scavStart);
    document.getElementById('twmgr-scav-stop').addEventListener('click', scavStop);
    setScavStatus(config.scav.running);

    document.getElementById('twmgr-farm-wood').value = config.farm.minWood != null ? config.farm.minWood : 1000;
    document.getElementById('twmgr-farm-stone').value = config.farm.minStone != null ? config.farm.minStone : 1000;
    document.getElementById('twmgr-farm-iron').value = config.farm.minIron != null ? config.farm.minIron : 1000;
    document.getElementById('twmgr-farm-dist').value = config.farm.maxDist != null ? config.farm.maxDist : 13;
    document.getElementById('twmgr-farm-wall').value = config.farm.maxWall != null ? config.farm.maxWall : 20;
    document.getElementById('twmgr-farm-bluewall').value = config.farm.blueMaxWall != null ? config.farm.blueMaxWall : 0;
    document.getElementById('twmgr-farm-bluedelmindef').value = config.farm.blueDeleteMinDef != null ? config.farm.blueDeleteMinDef : 10;
    document.getElementById('twmgr-farm-int').value = Math.round((config.farm.interval || 600) / 60);
    document.getElementById('twmgr-farm-mode').value = config.farm.mode || 'suave';
    document.getElementById('twmgr-farm-repeat').checked = !!config.farm.repeat;
    document.getElementById('twmgr-farm-repeatmin').value = config.farm.repeatMin != null ? config.farm.repeatMin : 10;
    document.getElementById('twmgr-farm-repeatrow').style.display = config.farm.repeat ? 'flex' : 'none';
    document.getElementById('twmgr-farm-mincl').value = config.farm.minCL != null ? config.farm.minCL : 0;
    document.getElementById('twmgr-farm-order').value = config.farm.order || 'dist';
    document.getElementById('twmgr-farm-dyn').checked = !!config.farm.dynTemplate;
    (function () {
      const M = config.farm.matrix || defFarmMatrix();
      FARM_COLORS.forEach((k) => {
        const c = M[k] || {}, mode = c.mode || 'none';
        const a = document.getElementById('twmgr-fm-' + k + '-a'), b = document.getElementById('twmgr-fm-' + k + '-b'), cc = document.getElementById('twmgr-fm-' + k + '-c');
        if (a) a.checked = mode === 'a'; if (b) b.checked = mode === 'b'; if (cc) cc.checked = mode === 'c';
      });
    })();
    document.getElementById('twmgr-farm-start').addEventListener('click', farmStart);
    document.getElementById('twmgr-farm-stop').addEventListener('click', farmStop);
    ['twmgr-farm-wood', 'twmgr-farm-stone', 'twmgr-farm-iron', 'twmgr-farm-dist', 'twmgr-farm-wall', 'twmgr-farm-bluewall', 'twmgr-farm-bluedelmindef', 'twmgr-farm-int', 'twmgr-farm-mode', 'twmgr-farm-group', 'twmgr-farm-repeatmin', 'twmgr-farm-mincl', 'twmgr-farm-order', 'twmgr-farm-dyn'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readFarmCfg); });
    document.getElementById('twmgr-farm-repeat').addEventListener('change', (e) => { document.getElementById('twmgr-farm-repeatrow').style.display = e.target.checked ? 'flex' : 'none'; readFarmCfg(); });
    FARM_COLORS.forEach((k) => {
      const boxes = ['-a', '-b', '-c'].map((s) => document.getElementById('twmgr-fm-' + k + s));
      boxes.forEach((box) => { if (box) box.addEventListener('change', () => { if (box.checked) boxes.forEach((o) => { if (o && o !== box) o.checked = false; }); readFarmCfg(); }); });
    });
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

    // ---- Planner (Coordenado) ----
    renderPlannerTabs();
    renderPlannerActive();
    ['twmgr-pl-target-x', 'twmgr-pl-target-y', 'twmgr-pl-arr', 'twmgr-pl-offset'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => { readPlannerCfg(); const atk = plActive(); renderPlannerVillages(atk).then(() => renderPlannerCards(atk)); }); });
    document.getElementById('twmgr-pl-all').addEventListener('click', () => {
      const atk = plActive();
      document.querySelectorAll('.twmgr-pl-vil').forEach((cb) => { cb.checked = true; const vid = cb.getAttribute('data-vid'); atk.selected[vid] = true; if (!atk.perVillage[vid] || !atk.perVillage[vid].length) atk.perVillage[vid] = [{ kind: 'attack', offsetMs: 0, amounts: {} }]; });
      save(); plannerRecomputeReservations(); renderPlannerCards(atk);
    });
    document.getElementById('twmgr-pl-none').addEventListener('click', () => {
      const atk = plActive();
      document.querySelectorAll('.twmgr-pl-vil').forEach((cb) => { cb.checked = false; });
      atk.selected = {}; atk.perVillage = {}; atk.homeAvail = {};
      save(); plannerRecomputeReservations(); renderPlannerCards(atk);
    });
    document.getElementById('twmgr-pl-load').addEventListener('click', () => plannerLoadHomeAvail(plActive()));
    document.getElementById('twmgr-pl-start').addEventListener('click', () => {
      readPlannerCfg();
      const atk = plActive();
      const wasRunning = atk.running;
      plannerStart(atk);
      if (atk.running && !wasRunning) {
        // Armou agora: libera um ataque novo em branco já selecionado, pra continuar configurando e armando sem travar o botão.
        plannerAddAttack();
      } else {
        setPlannerStatus(atk.running);
        renderPlannerTabs();
      }
    });
    document.getElementById('twmgr-pl-stop').addEventListener('click', () => { const atk = plActive(); plannerStop(atk); setPlannerStatus(false); renderPlannerTabs(); });
    document.getElementById('twmgr-pl-clear').addEventListener('click', () => plannerClearAll(plActive()));
    document.getElementById('twmgr-pl-queue-clear').addEventListener('click', plannerClearHistory);
    document.getElementById('twmgr-pl-tpl-save').addEventListener('click', plannerSaveTemplate);
    document.getElementById('twmgr-pl-tpl-apply').addEventListener('click', plannerApplyTemplate);
    document.getElementById('twmgr-pl-tpl-del').addEventListener('click', plannerDeleteTemplate);
    plannerRefreshTemplatesList();

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

    document.getElementById('twmgr-bld-max').value = config.build.maxQueue || 5;
    document.getElementById('twmgr-bld-int').value = Math.round((config.build.interval || 600) / 60);
    ['twmgr-bld-max', 'twmgr-bld-int'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readBuildCfg); });
    document.querySelectorAll('.twmgr-bld-sub').forEach((el) => el.addEventListener('click', () => bldSwitchProf(el.getAttribute('data-prof'))));
    document.getElementById('twmgr-bld-add').addEventListener('click', bldAddItem);
    document.getElementById('twmgr-bld-reset').addEventListener('click', bldResetDefault);
    document.getElementById('twmgr-bld-clear').addEventListener('click', bldClearAll);
    bindBuildPlanHandlers();
    renderBuildPlan();
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
    // Toggle expandir/recolher o log por módulo
    document.querySelectorAll('.twmgr-modlog-head').forEach((h) => h.addEventListener('click', () => {
      const mod = h.getAttribute('data-modlog'); const body = document.getElementById('twmgr-modlog-body-' + mod); if (!body) return;
      const open = body.style.display !== 'none'; body.style.display = open ? 'none' : 'block';
      h.textContent = ''; h.insertAdjacentHTML('beforeend', (open ? '▸' : '▾') + ' Log do módulo (<span id="twmgr-modlog-count-' + mod + '">0</span>)');
      renderModLog(mod);
    }));
    // Cards + logs por módulo no estado inicial (dados salvos do último ciclo)
    ['scav', 'farm', 'wall', 'recruit', 'fakes', 'market', 'build', 'bb', 'map', 'planner'].forEach((m) => { refreshCards(m); renderModLog(m); });
    // busca o recurso do dia (saque/coleta) ao abrir, pra não mostrar valor velho salvo até o 1º ciclo
    refreshDaily('farm', config.farm, 'loot', 'loot_res'); refreshDaily('scav', config.scav, 'coleta', 'scavenge');
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

    // Freio anti-spam: quando a página recarrega em rajada (você navegando no jogo), não repete
    // as mensagens de "retomado". Só loga se passaram >30s desde o último log de retomada.
    const _lrl = Number(localStorage.getItem(KEY + '_lastResumeLog') || 0);
    const resumeQuiet = (Date.now() - _lrl) < 30000;
    if (!resumeQuiet) localStorage.setItem(KEY + '_lastResumeLog', String(Date.now()));
    const rlog = (m, mod) => { if (!resumeQuiet && !lockOther()) pushLog(m, 'ok', mod); };

    if (!resumeQuiet && anyRunning() && lockOther()) pushLog('Outra aba já está ativa; esta ficará em espera.', 'err');
    if (config.running) { rlog('Auto-ATK retomado.'); processDue(); }
    if (config.scav.running) { rlog('Coleta retomada.', 'scav'); scheduleScav(); }
    if (config.farm.running) { rlog('Saque retomado.', 'farm'); scheduleFarm(); }
    if (config.wall.running) { rlog('Muralha retomada.', 'wall'); scheduleWall(); }
    if (config.recruit.running) { rlog('Recrutar retomado.', 'recruit'); scheduleRecruit(); }
    if (config.fakes.running) { config.fakes.gen.forEach((f) => { if (f.state === 'scheduled') f.state = 'armed'; }); rlog('Fakes rearmados.', 'fakes'); fakeTick(); }
    if (config.market.running) { rlog('Mercado retomado.', 'market'); scheduleMarket(); }
    if (config.build.running) { rlog('Edifícios retomado.', 'build'); scheduleBuild(); }
    if (config.bb && config.bb.running) { rlog('Cultivo retomado.', 'bb'); scheduleBB(); }
    if (config.map && config.map.running) { rlog('Mapa retomado.', 'map'); scheduleMap(); }
    if (config.planner && config.planner.attacks && config.planner.attacks.some((a) => a.running)) {
      config.planner.attacks.forEach((atk) => { if (!atk.running) return; (atk.rows || []).forEach((r) => { if (r.state === 'scheduled') r.state = 'armed'; }); });
      rlog('🎯 Coordenado retomado.', 'planner');
      plannerTick();
    }
    installBotHooks();
    startCaptchaWatcher();
    startBotCanary();
  }

  function makeDraggable(panel, handle) {
    let sx, sy, ox, oy, drag = false;
    handle.addEventListener('mousedown', (e) => { if (e.target.closest('#twmgr-min,#twmgr-logbtn,#twmgr-upd-btn')) return; drag = true; sx = e.clientX; sy = e.clientY; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; panel.style.right = 'auto'; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => { if (!drag) return; panel.style.left = (ox + e.clientX - sx) + 'px'; panel.style.top = (oy + e.clientY - sy) + 'px'; });
    document.addEventListener('mouseup', () => { drag = false; });
  }

  buildUI();
  try { enhanceUnitsPage(); } catch (e) { /* silencioso: injeção só falha se o layout mudou */ }
  try { unitsScheduleAuto(); } catch (e) { /* silencioso: scheduler é opcional */ }
})();
