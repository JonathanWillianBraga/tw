// ==UserScript==
// @name         Tribal Wars Manager
// @namespace    tw-manager
// @version      9.35.1
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

  const VERSION = '9.35.1';
  const UPDATE_URL = 'https://raw.githubusercontent.com/JonathanWillianBraga/tw/main/tw-manager.user.js';
  let updateInfo = { checked: false, hasUpdate: false, remoteVersion: '' };
  const WORLD = window.game_data.world || 'w';
  const KEY = 'twMgr_' + WORLD;
  const LOGKEY = KEY + '_log';
  const LOCKKEY = KEY + '_lock';
  const FREEZEKEY = KEY + '_freeze';   // modo silêncio, compartilhado entre abas
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
  const defFarm = () => ({ running: false, nextAt: 0, interval: 600, minWood: 1000, minStone: 1000, minIron: 1000, maxDist: 13, maxWall: 20, delay: 500, mode: 'suave', group: null, cooldownMin: 10, minCL: 0, order: 'dist', dynTemplate: false, matrix: defFarmMatrix(), sentReports: {}, defended: {} });
  const defWall = () => ({ running: false, nextAt: 0, interval: 600, wallMin: 1, wallMax: 6, ramMode: 'auto', ramFixed: 20, ramWall6: 24, axeCount: 80, spyCount: 1, sentDemo: {} });
  const defRecruit = () => ({
    running: false, nextAt: 0, interval: 600, targetHours: 2, refillBelowMin: 30,
    groupAtk: null, groupDef: null, profiles: { atk: { targets: {} }, def: { targets: {} } }, overrides: {}, queueEst: {},
  });
  const defFakes = () => ({ running: false, offsetMs: 150, targetsRaw: '', arrLocal: '', mode: 'split', pct: 1, minPop: 0, siege: 'ram', filler: 'spy', origins: {}, gen: [] });
  const defMarket = () => ({ running: false, mode: 'cunhagem', nextAt: 0, interval: 600, destCoord: '', reserve: 0, sources: {}, thresholdPct: 50, maxDist: 15, inflight: {} });
  const defBuild = () => ({ running: false, nextAt: 0, interval: 600, maxQueue: 5, plans: { atk: tplToPlan(ATK_TPL), def: tplToPlan(DEF_TPL) }, demand: {} });
  const BB_TPL = 'main 20\nstorage 20\nfarm 22\nstable 15\nbarracks 15\nsmith 10\ngarage 5\nfarm 24\nstorage 25\nbarracks 20\nstable 20\ngarage 10\nwood 30\nstone 30\niron 30\nstorage 30\nfarm 27\nmarket 15';
  const defBB = () => ({ running: false, nextAt: 0, interval: 600, maxQueue: 5, group: null, tpl: BB_TPL, defCoords: '', feedReserve: 40, feedMaxDist: 15, gradMain: 20, gradStable: 15 });
  const defCaptcha = () => ({ enabled: true, browserNotif: true, ntfyTopic: '', cooldownSec: 300, lastNotifiedAt: 0 });
  // Centro de Comando (praça de reunião): envios coordenados com precisão de milésimos.
  const defCmd = () => ({
    enabled: true,          // interruptor de emergência do módulo inteiro
    fila: [],               // comandos armados (sobrevivem ao F5)
    prepLeadSec: 60,        // quanto antes do disparo rodar o "confirmar"
    silenceLeadSec: 10,     // quanto antes ligar o modo silêncio
    silenceTailSec: 10,     // quanto tempo sem comando antes de religar os módulos
    ajusteMs: 0,            // ajuste fino manual por cima da latência medida
    trainGapMs: 150,        // intervalo alvo entre nobres do trem
    avancado: false,        // modo fácil x avançado na UI
    suporteParam: 'support',// parâmetro do apoio — confirmado pelo teste da UI
    suporteOkAt: 0,         // quando o autoteste de apoio passou (0 = nunca)
    hist: [],               // últimos envios com o desvio medido
    calib: { biasMs: 0, n: 0 },   // laço fechado: erro medido -> correção do lead
    mundo: { speed: null, unitSpeed: null, unidades: null, at: 0, confiavel: false },
    origens: {},            // vid -> true (origens marcadas)
    fonteTropa: 'casa',     // 'casa' = só o que está na aldeia | 'total' = casa + o que volta
    fakeAlvos: '',          // lista de alvos colada (modo fake)
    fakeDist: 'rodizio',    // 'rodizio' = 1 por aldeia alternando | 'todos' = cada aldeia p/ cada alvo
    tipo: 'attack',         // aba ativa: attack | support | nobre | fake
    // Ondas do NT: cada uma com origem, composição e defasagem próprias. É o que permite
    // "nuke na frente, nobres atrás" e "dividir a tropa de uma aldeia em N ataques".
    ondas: [],              // [{id, origem, amounts, max, offsetMs, rot}]
    filaOrdem: 'chegada',   // como listar a fila: 'chegada' | 'saida'
    passoMs: 50,            // passo dos botões de ajuste fino na fila
    modelos: null,          // modelos de tropa do usuário (null = ainda não semeado)
    fechados: {},           // seções recolhidas do painel (ele fica alto demais com tudo aberto)
  });
  // Semente: os antigos atalhos fixos viram modelos editáveis, pra ninguém perder o atalho.
  const MODELOS_PADRAO = () => ([
    { id: genId(), nome: 'Tudo', amounts: {}, max: UNITS.map((u) => u[0]).filter((u) => u !== 'snob').reduce((o, u) => (o[u] = true, o), {}) },
    { id: genId(), nome: 'Nobre', amounts: { snob: 1 }, max: {} },
    { id: genId(), nome: 'Fake', amounts: { ram: 1, spy: 1 }, max: {} },
  ]);
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
  const def = () => ({ targets: [], reloadAfterSend: true, running: false, scav: defScav(), farm: defFarm(), wall: defWall(), recruit: defRecruit(), fakes: defFakes(), market: defMarket(), build: defBuild(), bb: defBB(), map: defMap(), captcha: defCaptcha(), cmd: defCmd() });
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
    if (c.captcha.lastNotifiedAt == null) c.captcha.lastNotifiedAt = 0;
    if (!c.cmd) c.cmd = defCmd();
    if (c.cmd.enabled == null) c.cmd.enabled = true;
    if (!Array.isArray(c.cmd.fila)) c.cmd.fila = [];
    if (!Array.isArray(c.cmd.hist)) c.cmd.hist = [];
    if (c.cmd.prepLeadSec == null) c.cmd.prepLeadSec = 60;
    if (c.cmd.silenceLeadSec == null) c.cmd.silenceLeadSec = 10;
    if (c.cmd.silenceTailSec == null) c.cmd.silenceTailSec = 10;
    if (c.cmd.ajusteMs == null) c.cmd.ajusteMs = 0;
    if (c.cmd.trainGapMs == null) c.cmd.trainGapMs = 150;
    if (c.cmd.avancado == null) c.cmd.avancado = false;
    if (!c.cmd.suporteParam) c.cmd.suporteParam = 'support';
    if (c.cmd.suporteOkAt == null) c.cmd.suporteOkAt = 0;
    if (!c.cmd.calib) c.cmd.calib = { biasMs: 0, n: 0 };
    if (!c.cmd.mundo) c.cmd.mundo = { speed: null, unitSpeed: null, unidades: null, at: 0, confiavel: false };
    if (!c.cmd.origens) c.cmd.origens = {};
    if (!c.cmd.fonteTropa) c.cmd.fonteTropa = 'casa';
    if (c.cmd.fakeAlvos == null) c.cmd.fakeAlvos = '';
    if (!c.cmd.fakeDist) c.cmd.fakeDist = 'rodizio';
    if (!c.cmd.tipo) c.cmd.tipo = 'attack';
    if (!Array.isArray(c.cmd.ondas)) c.cmd.ondas = [];
    if (!c.cmd.filaOrdem) c.cmd.filaOrdem = 'chegada';
    if (c.cmd.passoMs == null) c.cmd.passoMs = 50;
    if (!Array.isArray(c.cmd.modelos)) c.cmd.modelos = MODELOS_PADRAO();
    if (!c.cmd.fechados) c.cmd.fechados = {};
    (c.targets || []).forEach((t) => { if (!t.origin) { t.origin = CUR_VID; t.originName = CUR_NAME; } });
    return c;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(config)); }

  let config = load();
  let sendTimer = null, scavTimer = null, farmTimer = null, wallTimer = null, recruitTimer = null, fakeTimer = null, marketTimer = null, buildTimer = null, bbTimer = null, mapTimer = null, uiTimer = null;
  function anyRunning() { return config.running || (config.scav && config.scav.running) || (config.farm && config.farm.running) || (config.wall && config.wall.running) || (config.recruit && config.recruit.running) || (config.fakes && config.fakes.running) || (config.market && config.market.running) || (config.build && config.build.running) || (config.bb && config.bb.running) || (config.map && config.map.running); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function readLock() { try { return JSON.parse(localStorage.getItem(LOCKKEY) || 'null'); } catch (e) { return null; } }
  // Congelamento entre abas: todo módulo já consulta lockOther() antes de agir, então basta
  // esta linha pra que o modo silêncio de UMA aba cale as outras também.
  function congeladoAgora() {
    try { const f = JSON.parse(localStorage.getItem(FREEZEKEY) || 'null');
          return !!(f && f.by !== TAB_ID && Date.now() < f.until); } catch (e) { return false; }
  }
  function lockOther() {
    if (congeladoAgora()) return true;
    const l = readLock(); return !!(l && l.id !== TAB_ID && (Date.now() - l.ts) < 12000);
  }
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
        { v: fmtN(lt.today), l: 'saqueado hoje' },
        { v: fmtN(lt.estimate), l: 'estimativa fim do dia', wide: true },
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

  function serverNow() { try { return window.Timing.getCurrentServerTime(); } catch (e) { return Date.now(); } }
  // Arredonda pro minuto de propósito. O jogo mostra #serverTime truncado no segundo, então
  // "serverNow() - wallLocal" carregava um resto aleatório de 0-999ms, diferente a cada leitura —
  // o que inviabiliza precisão de milésimos. A diferença real entre o fuso do servidor e o do
  // navegador é sempre um número inteiro de minutos, então arredondar mata o resto por construção.
  function roundToMinute(ms) { return Math.round(ms / 60000) * 60000; }
  function wallToServerOffset() {
    const ed = document.querySelector('#serverDate'), et = document.querySelector('#serverTime');
    if (!ed || !et) return roundToMinute(serverNow() - Date.now());
    const dm = (ed.textContent || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const tm = (et.textContent || '').match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!dm || !tm) return roundToMinute(serverNow() - Date.now());
    const wallLocal = new Date(+dm[3], +dm[2] - 1, +dm[1], +tm[1], +tm[2], +tm[3]).getTime();
    return roundToMinute(serverNow() - wallLocal);
  }
  function arrivalToServerMs(dtLocal) {
    if (!dtLocal) return 0;
    const localMs = new Date(dtLocal).getTime();   // preserva os milésimos do datetime-local
    if (isNaN(localMs)) return 0;
    return localMs + wallToServerOffset();
  }
  // Hora do servidor como relógio de parede, com milésimos: "14:30:07.123"
  function srvClockMs(ms) {
    const d = new Date((ms == null ? serverNow() : ms) - wallToServerOffset());
    const p = (n, w) => String(n).padStart(w || 2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
  }
  // Mede a latência até o servidor. Usa o MENOR RTT das amostras: é o caminho mais limpo,
  // sem enfileiramento, e é o que melhor estima o tempo de ida real de um request isolado.
  let NETLAT = { rttMin: 0, rttMed: 0, jitter: 0, at: 0 };
  async function netProbe(n) {
    const s = [];
    // Alvo minúsculo de propósito: medir /game.php baixaria ~150KB de página renderizada e
    // o RTT viria inflado, fazendo o comando sair CEDO demais.
    const alvo = (IMG_BASE ? IMG_BASE + 'graphic/dots/green.png' : '/favicon.ico');
    for (let i = 0; i < (n || 7); i++) {
      const t0 = performance.now();
      try { await fetch(alvo + '?_p=' + Date.now() + '_' + i, { cache: 'no-store', credentials: 'omit' }); } catch (e) {}
      s.push(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 60));   // espaça pra não medir a própria fila
    }
    s.sort((a, b) => a - b);
    NETLAT = {
      rttMin: s[0] || 0,
      rttMed: s[Math.floor(s.length / 2)] || 0,
      jitter: (s[Math.floor(s.length * 0.9)] || 0) - (s[0] || 0),   // p90, não o pior caso solto
      at: Date.now(),
    };
    return NETLAT;
  }

  // ==================== MOTOR DE PRECISÃO ====================
  // Meta: o comando chegar ao servidor no milésimo exato. Cada camada aqui mata uma fonte
  // de erro diferente — sozinha nenhuma delas resolve.

  // (1) Antichoke. Em aba de segundo plano o navegador estrangula setTimeout pra ~1 Hz, o que
  // sozinho já estoura a meta em mais de 1s. Um oscilador mudo mantém a aba classificada como
  // "tocando áudio", e aí o estrangulamento não se aplica.
  let _wakeCtx = null, _wakeOsc = null;
  function keepAwake(on) {
    try {
      if (on) {
        if (!_wakeCtx) _wakeCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (_wakeCtx.state === 'suspended') _wakeCtx.resume();
        if (!_wakeOsc) {
          const g = _wakeCtx.createGain(); g.gain.value = 0;   // ganho zero: inaudível
          const o = _wakeCtx.createOscillator();
          o.connect(g); g.connect(_wakeCtx.destination); o.start();
          _wakeOsc = o;
        }
      } else if (_wakeOsc) {
        try { _wakeOsc.stop(); } catch (e) {}
        _wakeOsc = null;
      }
    } catch (e) { /* sem áudio disponível: segue com o worker + spin */ }
  }
  // O AudioContext nasce 'suspended' e só sai disso dentro de um gesto do usuário. Chamado de um
  // timer ele fica inerte — por isso keepAwake(true) tem que rodar no clique, e por isso a UI
  // precisa saber se ele realmente pegou.
  function awakeAtivo() { return !!(_wakeCtx && _wakeCtx.state === 'running' && _wakeOsc); }

  // (2) Timer grosso num Web Worker (Blob URL, compatível com @grant none). Worker sofre bem
  // menos estrangulamento que a thread principal.
  const TICKER_SRC = 'let t=null;onmessage=function(e){if(e.data&&e.data.cmd==="start"){clearInterval(t);t=setInterval(function(){postMessage(0);},e.data.ms||25);}else{clearInterval(t);t=null;}};';
  function makeTicker(ms, cb) {
    try {
      const w = new Worker(URL.createObjectURL(new Blob([TICKER_SRC], { type: 'text/javascript' })));
      w.onmessage = cb;
      w.postMessage({ cmd: 'start', ms: ms });
      return { stop: function () { try { w.postMessage({ cmd: 'stop' }); w.terminate(); } catch (e) {} } };
    } catch (e) {
      const id = setInterval(cb, ms);            // degrada pro timer normal
      return { stop: function () { clearInterval(id); } };
    }
  }

  // (3) Espera fina. MessageChannel cede o controle sem passar pela fila de timers
  // (que tem piso de ~4ms e é estrangulada); os últimos 2ms são laço puro.
  const _mchan = (typeof MessageChannel !== 'undefined') ? new MessageChannel() : null;
  function yieldNow() {
    if (!_mchan) return new Promise((r) => setTimeout(r, 0));
    return new Promise((r) => { _mchan.port1.onmessage = () => r(); _mchan.port2.postMessage(0); });
  }
  // Âncora monotônica. serverNow() é Date.now()+offset: o NTP do sistema pode dar um salto no
  // meio do spin, e ainda por cima entraríamos no código do jogo milhares de vezes por disparo.
  // performance.now() nunca anda pra trás. Lemos serverNow() só nas âncoras.
  const CLK = { perf: 0, srv: 0, driftMs: 0, at: 0 };
  function ancorar() {
    const p = performance.now(), s = serverNow();
    if (CLK.at) CLK.driftMs = (CLK.srv + (p - CLK.perf)) - s;   // quanto o modelo errou desde a última âncora
    CLK.perf = p; CLK.srv = s; CLK.at = Date.now();
    return CLK.driftMs;
  }
  function srvNowP() { return CLK.at ? (CLK.srv + (performance.now() - CLK.perf)) : serverNow(); }
  async function spinUntil(alvoSrvMs) {
    const falta = alvoSrvMs - srvNowP();
    if (falta > 250) await new Promise((r) => setTimeout(r, falta - 250));   // fase grossa
    while (srvNowP() < alvoSrvMs - 2) await yieldNow();                      // fase fina
    while (srvNowP() < alvoSrvMs) { /* laço puro, últimos ~2ms */ }
    return srvNowP();
  }

  // (4) Compensação de latência: o request precisa CHEGAR ao servidor em sendAt, então sai antes.
  // rttMin/2 estima o tempo de ida. Substitui o antigo "offset" fixo de 150ms, que era chute.
  function fireAtFor(sendAtSrvMs, ajusteManualMs) {
    const ida = (NETLAT.rttMin || 300) / 2;
    // biasMs vem do laço fechado (ccMedir): é o erro real medido nos envios anteriores.
    // Modelar o relógio sozinho dá ~±50ms; corrigir pelo resultado medido é o que leva a ±10ms.
    const bias = (config.cmd && config.cmd.calib && config.cmd.calib.biasMs) || 0;
    const lead = ida + bias + (ajusteManualMs || 0);
    return sendAtSrvMs - Math.max(0, Math.min(lead, 3000));   // teto de 3s por segurança
  }

  // (5) Orçamento de erro honesto, calculado ANTES de armar. O usuário decidiu: se estourar,
  // avisa em vermelho mas dispara assim mesmo.
  function erroEstimadoMs() {
    const jitterRede = (NETLAT.jitter || 0) / 2;
    // Aba escondida é de longe a maior fonte de erro. Com o oscilador ativo cai muito; sem ele,
    // o navegador estrangula os timers e o erro vai pra centenas de ms.
    const jitterTimer = document.hidden ? (awakeAtivo() ? 25 : 300) : 4;
    const relogio = Math.max(Math.abs(CLK.driftMs || 0), window.Timing ? 5 : 60);
    // Somados em quadratura: são fontes independentes, somar linearmente exageraria.
    return Math.round(Math.sqrt(jitterRede * jitterRede + jitterTimer * jitterTimer + relogio * relogio));
  }
  function erroCor(ms) { return ms < 50 ? '#8fe39a' : (ms < 150 ? '#ffd76a' : '#ff7568'); }

  // ==================== MODO SILÊNCIO ====================
  // Reserva a linha em volta de um disparo coordenado: congela os outros módulos pra que nenhum
  // request nem trabalho de CPU concorra com o milésimo exato. Autorizado explicitamente.
  const SILENCE = { on: false, era: null, desde: 0, guarda: null };
  let _captchaPausado = false;   // declarado aqui (e não junto do detector) pra não cair em TDZ
  function silenceOn(motivo) {
    if (SILENCE.on) return;
    SILENCE.on = true;
    SILENCE.desde = Date.now();
    SILENCE.era = {
      scav: !!(config.scav && config.scav.running), farm: !!(config.farm && config.farm.running),
      wall: !!(config.wall && config.wall.running), recruit: !!(config.recruit && config.recruit.running),
      market: !!(config.market && config.market.running), build: !!(config.build && config.build.running),
      bb: !!(config.bb && config.bb.running), map: !!(config.map && config.map.running),
      alvos: !!config.running,
    };
    clearTimeout(scavTimer); clearTimeout(farmTimer); clearTimeout(wallTimer); clearTimeout(recruitTimer);
    clearTimeout(marketTimer); clearTimeout(buildTimer); clearTimeout(bbTimer); clearTimeout(mapTimer);
    clearTimeout(sendTimer);
    if (uiTimer) { clearInterval(uiTimer); uiTimer = null; }   // o tick de 1s vira jitter durante o spin
    _captchaPausado = true;   // o MutationObserver dele varre o body inteiro a cada mutação
    // Avisa as outras abas. Elas respeitam via lockOther(), sem precisar de código por módulo.
    try { localStorage.setItem(FREEZEKEY, JSON.stringify({ by: TAB_ID, until: Date.now() + 60000 })); } catch (e) {}
    ancorar();   // reancora o relógio monotônico logo antes do disparo
    // Rede de segurança: se algo der errado no disparo, ninguém fica morto pra sempre.
    clearTimeout(SILENCE.guarda);
    SILENCE.guarda = setTimeout(() => { if (SILENCE.on) { pushLog('Modo silêncio passou de 2 min — religando por segurança.', 'err', 'cmd'); silenceOff(); } }, 120000);
    pushLog('Modo silêncio ligado' + (motivo ? ' (' + motivo + ')' : '') + ' — linha reservada.', '', 'cmd');
  }
  function silenceOff() {
    if (!SILENCE.on) return;
    const era = SILENCE.era || {};
    SILENCE.on = false; SILENCE.era = null;
    clearTimeout(SILENCE.guarda); SILENCE.guarda = null;
    _captchaPausado = false;
    try { localStorage.removeItem(FREEZEKEY); } catch (e) {}
    try { if (era.scav) scheduleScav(); } catch (e) {}
    try { if (era.farm) scheduleFarm(); } catch (e) {}
    try { if (era.wall) scheduleWall(); } catch (e) {}
    try { if (era.recruit) scheduleRecruit(); } catch (e) {}
    try { if (era.market) scheduleMarket(); } catch (e) {}
    try { if (era.build) scheduleBuild(); } catch (e) {}
    try { if (era.bb) scheduleBB(); } catch (e) {}
    try { if (era.map) scheduleMap(); } catch (e) {}
    try { if (era.alvos) scheduleWake(); } catch (e) {}
    if (!uiTimer) uiTimer = setInterval(tickUI, 1000);
    pushLog('Modo silêncio desligado — módulos religados.', 'ok', 'cmd');
  }

  // ==================== COMANDOS COORDENADOS ====================
  // Passo 1 (confirmar): valida tropa/alvo no servidor e devolve a duração real da viagem
  // + o formulário já montado. Genérico: 'attack' ou 'support'.
  async function cmdPrepare(vid, x, y, amounts, tipo) {
    const p1 = new URLSearchParams();
    Object.entries(amounts).forEach(([u, a]) => { if (a > 0) p1.set(u, String(a)); });
    p1.set('x', String(x)); p1.set('y', String(y)); p1.set('input', x + '|' + y);
    // A praça tem dois botões de submit: "attack" e "support". Só o nome muda.
    if (tipo === 'support') p1.set(config.cmd.suporteParam || 'support', 'l');
    else p1.set('attack', 'l');
    p1.set('h', CSRF);
    const r1 = await fetch('/game.php?village=' + vid + '&screen=place&try=confirm', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p1.toString(),
    });
    let t1 = await r1.text();
    try { const j = JSON.parse(t1); t1 = (j.response && j.response.dialog) || j.dialog || t1; } catch (e) {}
    const doc = new DOMParser().parseFromString(t1, 'text/html');
    const form = doc.querySelector('#command-data-form') || doc.querySelector('form[action*="action=command"]');
    if (!form) {
      const errEl = doc.querySelector('.error, .autoHideBox, #command_confirmation_error');
      throw new Error(errEl ? errEl.textContent.trim().slice(0, 90) : 'confirmação falhou (tropa/alvo)');
    }
    let dur = null;
    const dd = doc.querySelector('[data-duration]');
    if (dd) dur = parseInt(dd.getAttribute('data-duration'), 10);
    if (!dur) { const txt = doc.body ? doc.body.textContent : t1; const m = txt.match(/dura[çc][aã]o[^0-9]{0,12}(\d{1,2}):([0-5]\d):([0-5]\d)/i); if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); }
    // Colher o form como o navegador colheria. O laço ingênuo (todo input com name) mandava
    // checkbox DESMARCADO e, pior, os DOIS botões de submit — o que pode virar apoio em ataque.
    const params = {};
    const nomeTipo = (tipo === 'support') ? (config.cmd.suporteParam || 'support') : 'attack';
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.name) return;
      const t = (el.type || '').toLowerCase();
      if ((t === 'checkbox' || t === 'radio') && !el.checked) return;
      if (t === 'submit' || t === 'button' || t === 'image') {
        if ((el.name === 'attack' || el.name === 'support') && el.name !== nomeTipo) return;
      }
      params[el.name] = el.value;
    });
    if (!params.h) params.h = CSRF;
    params[nomeTipo] = params[nomeTipo] || 'l';   // garante o tipo no corpo do passo 2
    const action = form.getAttribute('action') || ('/game.php?village=' + vid + '&screen=place&action=command&h=' + CSRF);
    return {
      action: absUrl(action), params: params, dur: dur,
      body: new URLSearchParams(params).toString(),   // pré-serializado: nada de string na hora do disparo
      tipoDetectado: detectaTipo(form, params),
    };
  }
  // Estrutural, não textual: procurar "apoio|ataque" no texto casava sempre os dois e devolvia '?'.
  function detectaTipo(form, params) {
    if (params.support != null) return 'support';
    if (params.attack != null) return 'attack';
    if (form.querySelector('#target_support, input[name="support"]')) return 'support';
    if (form.querySelector('#target_attack, input[name="attack"]')) return 'attack';
    return '?';
  }
  // Passo 2 (executar): só re-POSTa o que já veio montado. Nada é calculado aqui —
  // é o que sai no milésimo exato.
  async function cmdFire(prep) {
    const r2 = await fetch(prep.action, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: prep.body || new URLSearchParams(prep.params).toString(),
    });
    const t2 = await r2.text();
    if (/n[aã]o tem tropas suficientes|not enough/i.test(t2)) throw new Error('recusado: tropas insuficientes');
    return true;
  }

  // ---- Despachante ----
  let cmdTimer = null, cmdTicker = null, cmdEmVoo = false;
  function cmdFila() { return (config.cmd && config.cmd.fila) || []; }
  function cmdPendentes() { return cmdFila().filter((c) => c.state !== 'enviado' && c.state !== 'erro' && c.state !== 'abortado'); }
  function cmdRecalc(c) {
    if (!c.arriveAt || c.durMs == null) return;
    c.sendAt = c.arriveAt - c.durMs;
    c.fireAt = fireAtFor(c.sendAt, config.cmd.ajusteMs);
  }
  function cmdFalha(c, msg) {
    c.state = 'erro'; c.erro = String(msg).slice(0, 120); save();
    pushLog('Comando ' + c.x + '|' + c.y + ': ' + c.erro, 'err', 'cmd');
  }

  // Roda o "confirmar" e guarda o formulário pronto. Quanto mais cedo melhor —
  // mas não tão cedo que a tropa mude no meio do caminho.
  async function cmdPreparar(c) {
    try {
      const ehApoio = (c.tipo === 'support' || c.tipo === 'snipe');
      const p = await cmdPrepare(c.origin, c.x, c.y, c.amounts, ehApoio ? 'support' : 'attack');
      if (!p.dur) throw new Error('servidor não devolveu a duração');
      ancorar();                                    // reancora o relógio junto do preparo
      // O servidor é a verdade. Se a estimativa local divergir, corrige o fator do mundo —
      // assim a UI para de mentir mesmo que /interface.php tenha falhado.
      const est = ccEstimaDeComando(c);
      if (est && p.dur) {
        const razao = est / (p.dur * 1000);
        if (razao > 1.02 || razao < 0.98) {
          const m = config.cmd.mundo;
          m.fatorAjuste = (m.fatorAjuste || 1) * razao;
          m.confiavel = false;
          pushLog('Tempo local divergia ' + Math.round((razao - 1) * 100) + '% do servidor — fator do mundo corrigido.', 'err', 'cmd');
        } else if (!config.cmd.mundo.confiavel) {
          config.cmd.mundo.confiavel = true;
        }
      }
      c.durMs = p.dur * 1000;
      c.prep = { action: p.action, params: p.params, body: p.body };   // body pré-serializado
      c.tipoConfirmado = p.tipoDetectado;
      cmdRecalc(c);
      if (c.fireAt - srvNowP() < -1500) { cmdFalha(c, 'horário já passou'); return false; }
      c.state = 'preparado'; c.erro = null; save();
      return true;
    } catch (e) { cmdFalha(c, e.message || e); return false; }
  }

  // O disparo: ticker grosso até 40ms do alvo, spin fino até o milésimo, fetch.
  async function cmdDisparar(c) {
    if (c.state === 'armado') return;   // já entregue ao disparo; não duplica
    c.state = 'armado'; save();
    await new Promise((resolve) => {
      if (srvNowP() >= c.fireAt - 350) return resolve();
      const t = makeTicker(20, () => { if (srvNowP() >= c.fireAt - 350) { t.stop(); resolve(); } });
      cmdTicker = t;
    });
    cmdTicker = null;
    await spinUntil(c.fireAt);
    // Dispara e NÃO espera a resposta. Num trem de 150ms, aguardar o HTTP (300ms+) faria a
    // onda seguinte perder o próprio horário. A linha é liberada assim que o POST parte.
    const saiuEm = srvNowP();
    const voo = cmdFire(c.prep);
    c.state = 'enviado'; c.sentAt = saiuEm;
    c.desvioMs = Math.round(saiuEm - c.fireAt);
    const rot = c.ondas ? (' [onda ' + c.onda + '/' + c.ondas + ']') : '';
    pushLog('⚔ ' + (c.tipo === 'support' ? 'Apoio' : c.tipo === 'nobre' ? 'Nobre' : 'Ataque') + ' → ' + c.x + '|' + c.y + rot +
            ' · saiu ' + srvClockMs(saiuEm) + ' (desvio ' + (c.desvioMs >= 0 ? '+' : '') + c.desvioMs + 'ms)', 'ok', 'cmd');
    config.cmd.hist.unshift({ t: srvClockMs(saiuEm), alvo: c.x + '|' + c.y, tipo: c.tipo, desvio: c.desvioMs });
    config.cmd.hist = config.cmd.hist.slice(0, 50);
    save();
    // A resposta é tratada depois, sem segurar a próxima onda.
    voo.then(() => { setTimeout(() => ccMedir(c), 20000); })
       .catch((e) => { cmdFalha(c, e.message || e); });
  }

  // Mede o erro REAL: lê a chegada que o jogo registrou e compara com a que pedimos.
  // O servidor carimba o comando quando PROCESSA o POST, então erroMs é exatamente o atraso
  // entre o nosso disparo e o processamento — sinal limpo, sem modelagem.
  async function ccMedir(c) {
    try {
      const res = await fetch('/game.php?village=' + c.origin + '&screen=place', { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      let href = null;
      doc.querySelectorAll('tr.command-row').forEach((tr) => {
        const lbl = tr.querySelector('.quickedit-label');
        const mc = lbl ? (lbl.textContent || '').match(/(\d{1,3})\|(\d{1,3})/) : null;
        if (!mc || mc[1] !== String(c.x) || mc[2] !== String(c.y)) return;
        const a = tr.querySelector('a[href*="screen=info_command"]');
        if (a) href = a.href;
      });
      if (!href) return;
      const d2 = new DOMParser().parseFromString(await (await fetch(href, { credentials: 'include' })).text(), 'text/html');
      const m = (d2.body.textContent || '').match(/(\d{2})\/(\d{2})\/(\d{4})[^\d]{0,6}(\d{2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/);
      if (!m) return;
      const parede = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6], +(m[7] || 0)).getTime();
      const chegouEm = parede + wallToServerOffset();
      const erroMs = chegouEm - c.arriveAt;              // positivo = chegou atrasado
      const temMs = (m[7] != null);
      c.medido = { chegouEm: chegouEm, erroMs: erroMs, temMs: temMs };
      // Só amostra com milésimos entra na correção — sem isso o sinal é quantizado em 1s.
      if (temMs) {
        const k = config.cmd.calib;
        const alpha = (k.n < 3) ? 0.6 : 0.25;           // aprende rápido no começo, estável depois
        k.biasMs = Math.max(-1500, Math.min(1500, (k.biasMs || 0) + erroMs * alpha));
        k.n = (k.n || 0) + 1;
      }
      pushLog('📏 ' + c.x + '|' + c.y + ' chegou com desvio de ' + (erroMs > 0 ? '+' : '') + erroMs + 'ms' +
              (temMs ? '' : ' (sem milésimos — ative nas configurações do jogo)'),
              Math.abs(erroMs) <= 50 ? 'ok' : 'err', 'cmd');
      save(); ccRender();
    } catch (e) { /* medir é diagnóstico: nunca derruba o envio */ }
  }

  // Driver de 1s: decide o que preparar, quando silenciar e quando entregar ao disparo fino.
  async function cmdTick() {
    clearTimeout(cmdTimer);
    if (!config.cmd || !config.cmd.enabled) return;
    const pend = cmdPendentes();
    if (!pend.length) {
      if (SILENCE.on) silenceOff();
      keepAwake(false);
      cmdTimer = setTimeout(cmdTick, 1000);
      return;
    }
    const prepLead = (config.cmd.prepLeadSec || 60) * 1000;
    const silLead = (config.cmd.silenceLeadSec || 10) * 1000;

    // Preparo: um por vez, pra não sair request em rajada.
    for (const c of pend) {
      if (c.state !== 'novo' || !c.arriveAt) continue;
      const estimado = (c.durMs != null) ? (c.arriveAt - c.durMs) : c.arriveAt;
      if (estimado - srvNowP() <= prepLead) { await cmdPreparar(c); break; }
    }

    // Silêncio, guiado pelo disparo mais próximo.
    const prox = pend.filter((c) => c.fireAt).sort((a, b) => a.fireAt - b.fireAt)[0];
    if (prox && prox.fireAt - srvNowP() <= silLead) {
      if (!SILENCE.on) { silenceOn('comando ' + prox.x + '|' + prox.y); netProbe(3); }
    } else if (SILENCE.on) {
      const tail = (config.cmd.silenceTailSec || 10) * 1000;
      if (!prox || prox.fireAt - srvNowP() > silLead + tail) silenceOff();
    }

    // Entrega ao disparo fino tudo que está a menos de 2s.
    // UM de cada vez, sempre o mais próximo. Dois spins simultâneos brigariam pela mesma thread
    // e ainda dependeriam da ordem em que o servidor processa POSTs concorrentes — o que
    // embaralharia o trem de nobres.
    if (!cmdEmVoo) {
      const pronto = pend.filter((c) => c.state === 'preparado' && c.fireAt)
                         .sort((a, b) => a.fireAt - b.fireAt)[0];
      if (pronto && pronto.fireAt - srvNowP() <= 2000) {
        cmdEmVoo = true;
        // Libera a linha e re-avalia NA HORA: num trem de 150ms, esperar o próximo tick de 1s
        // faria a onda seguinte sair quase um segundo atrasada.
        cmdDisparar(pronto).catch(() => {}).then(() => { cmdEmVoo = false; cmdTick(); });
      }
    }
    cmdTimer = setTimeout(cmdTick, 1000);
  }

  // Ao carregar: setTimeout não sobrevive ao F5. Quem estava armado volta pra preparado; quem
  // perdeu a janela de preparo é re-preparado na hora, em vez de ser descartado.
  function cmdBoot() {
    if (!config.cmd || !config.cmd.enabled) return;
    ancorar();   // primeira âncora do relógio monotônico
    cmdFila().forEach((c) => { if (c.state === 'armado') c.state = c.prep ? 'preparado' : 'novo'; });
    save();
    cmdTick();
  }

  // ==================== TEMPO DE VIAGEM (cálculo local) ====================
  // Sem isso, saber o horário de saída exigiria um "confirmar" por origem/composição.
  // Com isso a UI mostra o tempo de todas as origens na hora; o servidor continua sendo a
  // verdade final no preparo, e se divergir a gente avisa.
  const SPEED_BASE = {   // minutos por campo em mundo velocidade 1 — reserva se /interface.php falhar
    spear: 18, sword: 22, axe: 18, archer: 18, spy: 9, light: 10,
    marcher: 10, heavy: 11, ram: 30, catapult: 30, knight: 10, snob: 35,
  };
  async function ccMundo(forcar) {
    const m = config.cmd.mundo || (config.cmd.mundo = {});
    if (!forcar && m.at && (Date.now() - m.at) < 7 * 864e5 && m.unidades) return m;
    const px = (t) => new DOMParser().parseFromString(t, 'text/xml');
    try {
      const cfg = px(await (await fetch('/interface.php?func=get_config', { credentials: 'include' })).text());
      const num = (q) => { const e = cfg.querySelector(q); return e ? parseFloat(e.textContent) : null; };
      m.speed = num('config > speed') || num('speed') || 1;
      m.unitSpeed = num('config > unit_speed') || num('unit_speed') || 1;
      const ui = px(await (await fetch('/interface.php?func=get_unit_info', { credentials: 'include' })).text());
      const un = {};
      UNITS.forEach(([u]) => { const e = ui.querySelector(u + ' > speed'); un[u] = e ? parseFloat(e.textContent) : SPEED_BASE[u]; });
      m.unidades = un; m.at = Date.now(); m.confiavel = true;
    } catch (e) {
      m.speed = m.speed || 1; m.unitSpeed = m.unitSpeed || 1;
      m.unidades = m.unidades || Object.assign({}, SPEED_BASE);
      m.at = Date.now(); m.confiavel = false;
      pushLog('Não li /interface.php — usando a tabela de velocidades embutida.', 'err', 'cmd');
    }
    save();
    return m;
  }
  // O comando anda na velocidade da unidade MAIS LENTA que vai junto.
  function ccUnidadeLenta(amounts) {
    const un = (config.cmd.mundo && config.cmd.mundo.unidades) || SPEED_BASE;
    let lenta = null, v = -1;
    Object.entries(amounts || {}).forEach(([u, n]) => { if (n > 0 && (un[u] || 0) > v) { v = un[u]; lenta = u; } });
    return lenta;
  }
  function ccTempoViagemMs(ox, oy, tx, ty, amounts) {
    const m = config.cmd.mundo || {}, un = m.unidades || SPEED_BASE;
    const lenta = ccUnidadeLenta(amounts);
    if (!lenta) return null;
    const d = fieldDist(+ox, +oy, +tx, +ty);
    if (!d) return null;
    // fatorAjuste sai da comparação com o servidor no preparo: conserta a estimativa
    // mesmo quando /interface.php falhou e a tabela de reserva está errada.
    const fator = (m.speed || 1) * (m.unitSpeed || 1) * (m.fatorAjuste || 1);
    const minPorCampo = un[lenta] / fator;
    return Math.round(d * minPorCampo * 60) * 1000;
  }
  // Estimativa local para um comando já montado (usa a origem real dele).
  function ccEstimaDeComando(c) {
    const v = CCVILAS.find((z) => String(z.vid) === String(c.origin));
    if (!v || v.x == null) return null;
    return ccTempoViagemMs(v.x, v.y, c.x, c.y, c.amounts);
  }

  // A visão geral de tropas traz, POR ALDEIA, 5 linhas rotuladas — e todas de uma vez, numa
  // requisição só. Buscar duas abas e somar (como eu fazia) contava a mesma tropa duas vezes.
  //   "suas próprias" = tudo que é seu, esteja onde estiver
  //   "Na Aldeia"     = o que dá pra mandar agora
  //   "fora"          = seu, apoiando outra aldeia
  //   "em trânsito"   = seu, voltando/indo
  //   "total"         = inclui apoio de terceiros (que você NÃO pode reenviar)
  // Conferido contra a página real: "total" = próprias + fora + trânsito em 20 de 21 aldeias.
  // A exceção tinha apoio de OUTRO jogador — que aparece em "Na Aldeia" e em "total", mas não
  // em "suas próprias". Por isso as duas nunca servem: tropa de terceiro não é sua pra reenviar.
  const CC_LINHAS = [
    { chave: 'proprias', re: /suas\s*pr[óo]prias|own\s*troops/i },   // suas, aqui  -> mandar agora
    { chave: 'naAldeia', re: /^na\s*aldeia|in\s*village/i },         // inclui apoio de terceiros
    { chave: 'fora',     re: /^fora$|^away$/i },                     // suas, apoiando fora
    { chave: 'transito', re: /tr[âa]nsito|moving/i },                // suas, voltando
    { chave: 'total',    re: /^total$/i },                           // inclui apoio de terceiros
  ];
  async function ccLerTropas() {
    // type=complete é obrigatório: own_home devolve UMA linha por aldeia (só o que está em casa),
    // sem "fora" nem "em trânsito". Era por isso que as duas fontes davam o mesmo número.
    // Conferido no jogo: own_home = 11 células por aldeia; complete = 55 (5 linhas × 11 unidades).
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=units&type=complete&page=-1', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const tabela = doc.querySelector('#units_table') || doc.querySelector('table.overview_table');
    if (!tabela) throw new Error('não achei #units_table');

    // Ordem das colunas: só os <th> com ícone de unidade, DESTA tabela. Varia por mundo —
    // aqui, por exemplo, não há arqueiro nem arqueiro a cavalo, mas há milícia.
    const ordem = [];
    (tabela.querySelector('thead tr') || tabela.querySelector('tr')).querySelectorAll('th').forEach((th) => {
      const img = th.querySelector('img[src*="unit_"]');
      if (!img) return;
      const m = (img.getAttribute('src') || '').match(/unit_(\w+)\./);
      if (m) ordem.push(m[1]);
    });
    if (!ordem.length) throw new Error('não li as colunas de unidade');

    const out = {};
    tabela.querySelectorAll('tbody').forEach((tb) => {
      const q = tb.querySelector('.quickedit-vn[data-id]');
      if (!q) return;
      const vid = q.getAttribute('data-id'); if (!vid) return;
      // A coordenada está no TEXTO ("Draco (445|592) K54"); o data-text tem só o nome.
      const lbl = tb.querySelector('.quickedit-label');
      const txt = lbl ? (lbl.textContent || '') : '';
      const cm = txt.match(/(\d{1,3})\|(\d{1,3})/);
      const nome = (lbl && lbl.getAttribute('data-text')) || txt.replace(/\s*\(\d{1,3}\|\d{1,3}\).*$/, '').trim();

      const linhas = {};
      tb.querySelectorAll('tr').forEach((tr) => {
        const cels = Array.from(tr.querySelectorAll('td.unit-item'));
        if (cels.length !== ordem.length) return;      // linha que não é de tropa
        // O rótulo é o <td> imediatamente antes da primeira célula de unidade.
        let rot = '';
        const primeira = cels[0];
        for (let p = primeira.previousElementSibling; p; p = p.previousElementSibling) {
          const t = (p.textContent || '').trim();
          if (t) { rot = t; break; }
        }
        const achou = CC_LINHAS.find((L) => L.re.test(rot));
        if (!achou) return;
        const nums = {};
        cels.forEach((td, i) => { nums[ordem[i]] = parseInt((td.textContent || '').replace(/\D/g, ''), 10) || 0; });
        linhas[achou.chave] = nums;
      });
      if (!Object.keys(linhas).length) return;
      const pr = linhas.proprias || {}, fo = linhas.fora || {}, tr = linhas.transito || {};
      // "minhas em qualquer lugar" é somado à mão, e não lido da linha "total", justamente
      // porque a linha "total" carrega apoio de terceiros junto.
      const minhas = {};
      ordem.forEach((u) => { minhas[u] = (pr[u] || 0) + (fo[u] || 0) + (tr[u] || 0); });
      out[vid] = {
        vid: vid, nome: nome,
        x: cm ? +cm[1] : null, y: cm ? +cm[2] : null, coord: cm ? (cm[1] + '|' + cm[2]) : null,
        casa: pr, minhas: minhas, fora: fo, transito: tr,
      };
    });
    if (!Object.keys(out).length) throw new Error('nenhuma aldeia lida da tabela');
    // Se só veio um tipo de linha, a página não é a completa e "fora/trânsito" seriam sempre
    // zero — exatamente a falha silenciosa que fazia as duas fontes darem o mesmo número.
    const alguma = out[Object.keys(out)[0]];
    const temDetalhe = Object.keys(alguma.fora).length > 0 || Object.keys(alguma.transito).length > 0;
    if (!temDetalhe) pushLog('Tropas: página sem as linhas "fora"/"em trânsito" — a fonte "suas próprias" vai igualar a de casa.', 'err', 'cmd');
    return { aldeias: out, unidades: ordem };
  }

  // (legado — mantido só pro diagnóstico __cc.dumpTropas)
  async function ccLerAbaTropas(type) {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=units&type=' + type + '&page=-1', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    // A ordem das colunas TEM que sair do cabeçalho DESTA tabela. Procurar 'th' no documento
    // inteiro pegava imagens de unidade de outras tabelas/menus e desalinhava tudo — era isso
    // que fazia bárbaro ler a coluna errada e cavalaria cair numa coluna vazia.
    let tabela = null, maisCelulas = 0;
    doc.querySelectorAll('table').forEach((tb) => {
      const n = tb.querySelectorAll('td.unit-item').length;
      if (n > maisCelulas) { maisCelulas = n; tabela = tb; }
    });
    if (!tabela) throw new Error('não achei a tabela de tropas');

    const ordem = [];
    const cab = tabela.querySelector('thead tr') || tabela.querySelector('tr');
    if (cab) {
      cab.querySelectorAll('th').forEach((th) => {
        const img = th.querySelector('img[src*="unit_"]');
        const cls = th.querySelector('[class*="unit-item-"]');
        let u = null;
        if (img) { const m = (img.getAttribute('src') || '').match(/unit_(\w+)\./); u = m ? m[1] : null; }
        if (!u && cls) { const m = (cls.className || '').match(/unit-item-(\w+)/); u = m ? m[1] : null; }
        if (u) ordem.push(u);
      });
    }

    const out = {};
    let avisou = false;
    tabela.querySelectorAll('tr').forEach((tr) => {
      const q = tr.querySelector('span.quickedit-vn[data-id], .quickedit-out[data-id]');
      if (!q) return;
      const vid = q.getAttribute('data-id'); if (!vid) return;
      if (out[vid]) return;                       // uma linha por aldeia; ignora repetição
      const lbl = tr.querySelector('.quickedit-label');
      const cm = lbl ? (lbl.textContent || '').match(/(\d{1,3})\|(\d{1,3})/) : null;
      const nome = lbl ? (lbl.textContent || '').replace(/\s*\(\d{1,3}\|\d{1,3}\)\s*K?\d*\s*$/, '').replace(/\s+/g, ' ').trim() : '';
      const cels = Array.from(tr.querySelectorAll('td.unit-item'));
      if (!cels.length) return;
      // Se cabeçalho e linha discordam no número de colunas, o mapeamento seria chute.
      // Melhor gritar do que mostrar número errado em silêncio.
      if (ordem.length && cels.length !== ordem.length && !avisou) {
        avisou = true;
        pushLog('Leitura de tropas: ' + ordem.length + ' colunas no cabeçalho mas ' + cels.length +
                ' na linha. Números podem sair trocados — rode __cc.dumpTropas().', 'err', 'cmd');
      }
      const nums = cels.map((td) => {
        // Só o texto direto da célula: tooltips/filhos escondidos colariam dígitos.
        const txt = (td.childNodes.length ? Array.from(td.childNodes)
          .filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('') : td.textContent) || td.textContent || '';
        return parseInt(txt.replace(/\D/g, ''), 10) || 0;
      });
      const t = {};
      const chaves = (ordem.length === cels.length && ordem.length) ? ordem : UNITS.map((u) => u[0]);
      chaves.forEach((u, i) => { if (nums[i] != null) t[u] = nums[i]; });
      out[vid] = { vid: vid, nome: nome, x: cm ? +cm[1] : null, y: cm ? +cm[2] : null,
                   coord: cm ? (cm[1] + '|' + cm[2]) : null, tropas: t };
    });
    return out;
  }
  // Uma requisição só traz tudo. "avail" aponta pra linha escolhida:
  //   casa   = suas tropas nesta aldeia -> dá pra mandar AGORA
  //   minhas = suas em qualquer lugar (aqui + fora + voltando) -> pra agendar pra daqui a horas
  let _tropasCache = null, _tropasCacheAt = 0;
  let CC_UNIDADES_MUNDO = null;   // unidades que este mundo realmente tem
  async function ccTropasTodasAldeias(forcar) {
    if (!forcar && _tropasCache && Date.now() - _tropasCacheAt < 60000) {
      return ccAplicarFonte(_tropasCache);
    }
    const r = await ccLerTropas();
    CC_UNIDADES_MUNDO = r.unidades;
    _tropasCache = r.aldeias; _tropasCacheAt = Date.now();
    return ccAplicarFonte(_tropasCache);
  }
  function ccAplicarFonte(mapa) {
    const modo = (config.cmd.fonteTropa || 'casa');
    const out = {};
    Object.values(mapa).forEach((v) => {
      out[v.vid] = Object.assign({}, v, { avail: (modo === 'total' ? v.minhas : v.casa) || {} });
    });
    return out;
  }

  // ==================== CENTRO DE COMANDO (praça de reunião) ====================
  const CC_TIPOS = [
    { id: 'attack',  ico: '⚔', rot: 'Ataque',  hint: 'Um ataque por origem marcada, todos chegando no mesmo instante.' },
    { id: 'support', ico: '🛡', rot: 'Apoio',   hint: 'Apoio de várias aldeias pousando junto no mesmo alvo.' },
    { id: 'nobre',   ico: '👑', rot: 'NT/Ondas', hint: 'Ondas com composição e origem próprias: nuke na frente, nobres atrás, ou uma tropa dividida em várias levas.' },
    { id: 'fake',    ico: '🎭', rot: 'Fake',    hint: 'Vários alvos de uma vez; o alvo único acima é ignorado.' },
  ];
  function ccTipo() { return (config.cmd && config.cmd.tipo) || 'attack'; }
  function telaAtual() {
    try { return new URLSearchParams(location.search).get('screen') || (window.game_data && window.game_data.screen) || ''; } catch (e) { return ''; }
  }
  // Composição digitada no PRÓPRIO centro de comando (não nas caixas do jogo).
  // { amounts: {unidade:n}, max: {unidade:true} } — "max" = mandar tudo o que a origem tiver.
  function ccComposicao() {
    const amounts = {}, max = {};
    ccUnidadesUI().forEach(([u]) => {
      const inp = document.getElementById('cc-u-' + u);
      const chk = document.getElementById('cc-max-' + u);
      if (chk && chk.checked) { max[u] = true; return; }
      const n = inp ? (parseInt(inp.value, 10) || 0) : 0;
      if (n > 0) amounts[u] = n;
    });
    return { amounts: amounts, max: max };
  }
  // Resolve a composição para UMA origem: o "max" vira o estoque real daquela aldeia.
  function ccResolverPara(comp, avail) {
    const a = {};
    Object.entries(comp.amounts).forEach(([u, n]) => { a[u] = n; });
    Object.keys(comp.max).forEach((u) => { const t = (avail && avail[u]) || 0; if (t > 0) a[u] = t; });
    return a;
  }
  // A velocidade tem que sair do que AQUELA aldeia vai realmente mandar, não da composição
  // global escolhida. Com "tudo" marcado em aríete, uma aldeia sem aríete manda só cavalaria
  // e chega muito antes — usar a composição global daria 30 min/campo em vez de 10.
  function ccCompParaVelocidade(comp, avail) {
    const a = {};
    Object.entries(comp.amounts).forEach(([u, n]) => {
      if (!avail) { a[u] = n; return; }
      if ((avail[u] || 0) >= n) a[u] = n;          // sem estoque, essa unidade não vai — não pesa
    });
    Object.keys(comp.max).forEach((u) => {
      const t = avail ? (avail[u] || 0) : 1;
      if (t > 0) a[u] = t;
    });
    return a;
  }
  function cmdAdicionar(tipo, x, y, amounts, arriveAt, origem) {
    const c = { id: genId(), tipo: tipo, origin: origem || CUR_VID, x: String(x), y: String(y),
                amounts: amounts, arriveAt: arriveAt, durMs: null, sendAt: 0, fireAt: 0,
                prep: null, state: 'novo', erro: null, sentAt: null, desvioMs: null };
    config.cmd.fila.push(c); save();
    cmdTick(); ccRender();
    return c;
  }
  // cmdTrem foi removido: o editor de ondas cobre o caso (e mais), com composição,
  // origem e defasagem por onda em vez de uma composição repetida N vezes.
  function cmdAbortar(id) {
    const c = cmdFila().find((z) => z.id === id); if (!c) return;
    c.state = 'abortado'; save(); ccRender();
    pushLog('Comando ' + c.x + '|' + c.y + ' abortado.', '', 'cmd');
  }
  function cmdLimpar() {
    config.cmd.fila = cmdFila().filter((c) => c.state === 'novo' || c.state === 'preparado' || c.state === 'armado');
    save(); ccRender();
  }

  // Teste do parâmetro de apoio: faz só o "confirmar" (não envia) e mostra o que o servidor
  // entendeu. É o portão da Fase 3 — sem isso, apoio é suposição.
  // Autoteste do apoio. Só faz o "confirmar" — não envia tropa. É o portão do apoio/snipe:
  // sem ele passar, mandar apoio é suposição.
  async function ccTestarApoio(silencioso) {
    const out = document.getElementById('cc-teste-out');
    const diz = (h) => { if (out) out.innerHTML = silencioso ? '' : h; };
    const linhas = [];
    diz('verificando apoio…');
    try {
      // 1) O que a praça REALMENTE tem no DOM. Se o nome do parâmetro for outro, corrige sozinho.
      const bA = document.querySelector('#target_attack, input[name="attack"]');
      const bS = document.querySelector('#target_support, input[name="support"]');
      linhas.push('botões na praça → ataque: <b>' + (bA ? esc(bA.name || bA.id) : 'ausente') +
                  '</b> · apoio: <b>' + (bS ? esc(bS.name || bS.id) : 'ausente') + '</b>');
      if (bS && bS.name && bS.name !== config.cmd.suporteParam) {
        config.cmd.suporteParam = bS.name; save();
        linhas.push('<span style="color:#ffd76a">parâmetro do apoio ajustado para "' + esc(bS.name) + '"</span>');
      }
      // 2) Confirma 1 lanceiro para OUTRA aldeia sua (não dá pra atacar aldeia própria).
      const minhas = await getAllVillages();
      const destino = minhas.filter((v) => String(v.vid) !== String(CUR_VID) && v.coord)[0];
      if (!destino) { linhas.push('<span style="color:#ff7568">preciso de ao menos 2 aldeias suas pra testar</span>'); return diz(linhas.join('<br>')); }
      const [dx, dy] = destino.coord.split('|');
      const p = await cmdPrepare(CUR_VID, dx, dy, { spear: 1 }, 'support');
      const ok = (p.tipoDetectado === 'support');
      linhas.push('confirm em ' + esc(destino.coord) + ' → tipo <b style="color:' + (ok ? '#8fe39a' : '#ff7568') + '">' +
                  esc(p.tipoDetectado) + '</b> · duração ' + (p.dur ? fmt(p.dur * 1000) : '?'));
      linhas.push('<span style="font-size:9px;color:#8f7d57">campos: ' + esc(Object.keys(p.params).join(', ').slice(0, 200)) + '</span>');
      if (ok) {
        config.cmd.suporteOkAt = Date.now(); save();
        linhas.push('<span style="color:#8fe39a">✔ apoio liberado (nada foi enviado)</span>');
      } else {
        linhas.push('<span style="color:#ff7568">✖ apoio NÃO liberado — o servidor não confirmou como apoio</span>');
      }
      pushLog('Verificação de apoio: tipo "' + p.tipoDetectado + '".', ok ? 'ok' : 'err', 'cmd');
      // Falhando, o aviso aparece mesmo no modo silencioso — senão o Apoio trava sem explicação.
      if (!ok && out) out.innerHTML = linhas.join('<br>');
      return ok;
    } catch (e) {
      linhas.push('<span style="color:#ff7568">verificação de apoio falhou: ' + esc(e.message || e) + '</span>');
      if (out) out.innerHTML = linhas.join('<br>');
      return false;
    }
    diz(linhas.join('<br>'));
  }

  // Quantos fakes cada combinação origem×alvo geraria, sem armar nada.
  function ccParesFake() {
    const alvos = parseCoords((document.getElementById('cc-fake-alvos') || {}).value || '');
    const origens = CCVILAS.filter((v) => config.cmd.origens[v.vid] && v.x != null);
    const dist = (document.querySelector('input[name="cc-fakedist"]:checked') || {}).value || 'rodizio';
    const pares = [];
    if (!alvos.length || !origens.length) return { pares: pares, alvos: alvos, origens: origens, dist: dist };
    if (dist === 'todos') {
      // Cada origem manda 1 fake pra CADA alvo.
      origens.forEach((o) => alvos.forEach((t) => pares.push({ o: o, t: t })));
    } else {
      // Rodízio: 1 fake por alvo, alternando qual aldeia manda — espalha o custo.
      alvos.forEach((t, i) => pares.push({ o: origens[i % origens.length], t: t }));
    }
    return { pares: pares, alvos: alvos, origens: origens, dist: dist };
  }
  // Relatório do estado interno, copiado pra área de transferência com um clique.
  // Existe porque o console do Chrome bloqueia colar comando até o usuário digitar
  // "allow pasting", o que trava o diagnóstico justamente quando ele é necessário.
  async function ccDiagnostico() {
    const msg = document.getElementById('cc-msg');
    const L = [];
    L.push('TW Manager v' + VERSION + ' · mundo ' + WORLD + ' · ' + new Date().toISOString());
    L.push('fonteTropa=' + (config.cmd.fonteTropa || '?') + '  suporteOkAt=' + (config.cmd.suporteOkAt || 0));
    L.push('mundo: speed=' + (config.cmd.mundo.speed) + ' unitSpeed=' + (config.cmd.mundo.unitSpeed) +
           ' confiavel=' + config.cmd.mundo.confiavel + ' fatorAjuste=' + (config.cmd.mundo.fatorAjuste || 1));
    L.push('unidades do mundo: ' + (CC_UNIDADES_MUNDO ? CC_UNIDADES_MUNDO.join(',') : '(não lido)'));
    L.push('latencia rttMin=' + Math.round(NETLAT.rttMin) + ' jitter=' + Math.round(NETLAT.jitter) +
           ' erroEstimado=' + erroEstimadoMs() + 'ms  drift=' + Math.round(CLK.driftMs || 0));
    L.push('CCVILAS=' + CCVILAS.length + ' aldeias · fila=' + cmdFila().length + ' · silencio=' + SILENCE.on);
    L.push('');
    L.push('--- ORIGENS (avail = fonte em uso) ---');
    CCVILAS.slice(0, 30).forEach((v) => {
      const fmtT = (o) => Object.entries(o || {}).filter(([, n]) => n > 0).map(([u, n]) => u + '=' + n).join(' ') || '(vazio)';
      L.push((v.coord || v.vid) + ' "' + (v.nome || '') + '"');
      L.push('   avail   : ' + fmtT(v.avail));
      L.push('   casa    : ' + fmtT(v.casa));
      L.push('   minhas  : ' + fmtT(v.minhas));
      L.push('   fora    : ' + fmtT(v.fora) + '  | transito: ' + fmtT(v.transito));
    });
    L.push('');
    L.push('--- FILA ---');
    cmdFila().slice(0, 20).forEach((c) => {
      L.push([c.tipo, c.origin + '->' + c.x + '|' + c.y, c.state,
              'chega=' + (c.arriveAt ? srvClockMs(c.arriveAt) : '-'),
              'sai=' + (c.sendAt ? srvClockMs(c.sendAt) : '-'),
              'dur=' + (c.durMs != null ? Math.round(c.durMs / 1000) + 's' : '-'),
              'desvio=' + (c.desvioMs != null ? c.desvioMs + 'ms' : '-'),
              c.erro ? ('ERRO: ' + c.erro) : ''].join(' | '));
    });
    L.push('');
    L.push('--- LOG (cmd) ---');
    readLogArr().filter((x) => x.mod === 'cmd').slice(0, 25).forEach((x) => L.push('[' + x.t + '] ' + x.m));
    const txt = L.join('\n');
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {}
    if (!ok) {   // clipboard bloqueado: cai pro textarea + execCommand, que quase sempre passa
      try {
        const ta = document.createElement('textarea');
        ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) {}
    }
    console.log(txt);
    if (msg) {
      msg.style.color = ok ? '#8fe39a' : '#ffd76a';
      msg.textContent = ok ? 'Diagnóstico copiado — é só colar aqui no chat.'
                           : 'Não consegui copiar; o relatório saiu no console (F12).';
    }
  }

  // ---- Comandos do jogo (chegando / saindo) ----
  // Estrutura conferida no jogo real:
  //   #incomings_table: tipo | destino | origem | jogador | dist | "hoje às HH:MM:SS:mmm" | chega em
  //   #commands_table : "Ataque a X (coord)" | "Origem (coord)" | "hoje às HH:MM:SS:mmm" | tropas…
  // Neste mundo os milésimos vêm no texto, o que é o que torna snipe e calibração viáveis.
  function ccAgoraParede() { return new Date(serverNow() - wallToServerOffset()); }
  function ccParseChegada(txt) {
    const t = (txt || '').replace(/\s+/g, ' ').trim();
    const hm = t.match(/(\d{1,2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/);
    if (!hm) return 0;
    const base = ccAgoraParede();
    let ano = base.getFullYear(), mes = base.getMonth(), dia = base.getDate();
    if (/amanh/i.test(t)) dia += 1;
    else {
      // "em 28.07. às ..." — exige o "às" logo depois pra não casar com a própria hora.
      const dm = t.match(/(\d{1,2})[.\/](\d{1,2})\.?\s*(?:às|as)\s/i);
      if (dm) { dia = +dm[1]; mes = +dm[2] - 1; }
    }
    const local = new Date(ano, mes, dia, +hm[1], +hm[2], +hm[3], +(hm[4] || 0)).getTime();
    if (isNaN(local)) return 0;
    return local + wallToServerOffset();
  }
  const CMDS = { incoming: { at: 0, lista: [] }, outgoing: { at: 0, lista: [] } };
  async function ccLerComandos(qual, forcar) {
    const c = CMDS[qual];
    if (!forcar && c.at && Date.now() - c.at < 30000) return c.lista;
    const url = (qual === 'incoming')
      ? '/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=incomings&subtype=attacks&page=-1'
      : '/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=commands&type=attack&page=-1';
    const doc = new DOMParser().parseFromString(await (await fetch(url, { credentials: 'include' })).text(), 'text/html');
    const tb = doc.querySelector(qual === 'incoming' ? '#incomings_table' : '#commands_table');
    if (!tb) throw new Error('não achei a tabela de comandos');
    const co = (s) => { const m = (s || '').match(/(\d{1,3})\|(\d{1,3})/); return m ? (m[1] + '|' + m[2]) : null; };
    const out = [];
    tb.querySelectorAll('tr').forEach((tr) => {
      if (!tr.querySelector('a[href*="screen=info_command"]')) return;
      const td = [...tr.querySelectorAll('td')].map((x) => (x.textContent || '').replace(/\s+/g, ' ').trim());
      if (td.length < 3) return;
      const chega = ccParseChegada(qual === 'incoming' ? td[5] : td[2]);
      if (!chega) return;
      out.push(qual === 'incoming'
        ? { tipo: td[0], destino: co(td[1]), origem: co(td[2]), jogador: td[3], dist: td[4], chega: chega, temMs: /:\d{3}\s*$/.test(td[5]) }
        : { tipo: td[0], destino: co(td[0]), origem: co(td[1]), jogador: '', dist: '', chega: chega, temMs: /:\d{3}\s*$/.test(td[2]) });
    });
    out.sort((a, b) => a.chega - b.chega);
    c.at = Date.now(); c.lista = out;
    return out;
  }
  // Janela de snipe: entre a chegada escolhida e a PRÓXIMA no MESMO destino.
  function ccJanelaSnipe(lista, i, folgaMs) {
    const alvo = lista[i], folga = folgaMs == null ? 50 : folgaMs;
    const prox = lista.slice(i + 1).find((k) => k.destino === alvo.destino);
    const de = alvo.chega + (alvo.temMs ? 0 : 1000) + folga;   // sem milésimos, assume o pior caso
    const ate = prox ? (prox.chega - folga) : null;
    return { de: de, ate: ate, largura: ate == null ? null : (ate - de), prox: prox, exato: !!alvo.temMs };
  }

  // Seções recolhíveis: com tudo aberto o painel empurrava a praça de reunião pra fora da
  // tela e deixava controles (como o snipe) longe demais.
  function ccAplicarFechados() {
    const F = config.cmd.fechados || {};
    document.querySelectorAll('[data-secbody]').forEach((b) => {
      b.style.display = F[b.getAttribute('data-secbody')] ? 'none' : '';
    });
    document.querySelectorAll('[data-sec]').forEach((h) => {
      const k = h.getAttribute('data-sec');
      h.innerHTML = (F[k] ? '▸' : '▾') + h.innerHTML.replace(/^[▾▸]\s*/, ' ');
    });
  }
  function ccToggleSecao(k) {
    const F = (config.cmd.fechados = config.cmd.fechados || {});
    F[k] = !F[k]; save(); ccAplicarFechados();
  }

  // Escreve um instante do servidor no campo de chegada (datetime-local, com milésimos).
  function ccSetChegada(srvMs) {
    const el = document.getElementById('cc-chegada'); if (!el) return;
    const d = new Date(srvMs - wallToServerOffset()), p = (n, w) => String(n).padStart(w || 2, '0');
    el.value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' +
               p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
    ccRenderOrigens();
  }
  let _ccCmdsQual = 'incoming', _ccAttTipo = null;
  async function ccCmdsRender(qual, forcar) {
    _ccCmdsQual = qual || _ccCmdsQual;
    const box = document.getElementById('cc-cmds-lista'); if (!box) return;
    box.innerHTML = '<div style="color:#8f7d57;padding:6px;font-size:10px">lendo…</div>';
    let L = [];
    try { L = await ccLerComandos(_ccCmdsQual, !!forcar); }
    catch (e) { box.innerHTML = '<div style="color:#ff7568;padding:6px;font-size:10px">' + esc(e.message || e) + '</div>'; return; }
    if (!L.length) { box.innerHTML = '<div style="color:#8f7d57;padding:6px;font-size:10px">— nenhum —</div>'; return; }
    const agora = srvNowP(), ehIn = (_ccCmdsQual === 'incoming');
    box.innerHTML = L.slice(0, 60).map((c, i) => {
      const jan = ehIn ? ccJanelaSnipe(L, i, 50) : null;
      return '<div style="display:grid;grid-template-columns:1fr 78px 62px 96px;gap:4px;align-items:center;' +
             'padding:2px 5px;border-bottom:1px solid rgba(255,255,255,.05);font-size:10px">' +
        '<span style="color:#cbb98f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(c.tipo) + '">' +
          esc((c.origem || '?') + ' → ' + (c.destino || '?')) + (c.jogador ? ' <span style="color:#8f7d57">' + esc(c.jogador) + '</span>' : '') + '</span>' +
        '<span style="color:' + (c.temMs ? '#e6cf7d' : '#ffd76a') + '" title="' + (c.temMs ? 'com milésimos' : 'sem milésimos — margem de 1s') + '">' +
          srvClockMs(c.chega) + '</span>' +
        '<span style="color:#8f7d57">' + (c.chega > agora ? fmt(c.chega - agora) : '—') + '</span>' +
        '<span style="text-align:right;white-space:nowrap">' +
          '<a data-usar="' + i + '" style="cursor:pointer;color:#8fe39a" title="usar este horário">📋 usar</a>' +
          (ehIn ? ' <a data-snipe="' + i + '" style="cursor:pointer;color:' +
                  ((jan.largura == null || jan.largura > 0) ? '#7fc8ff' : '#ff7568') + '" title="' +
                  (jan.largura == null ? 'sem próximo ataque neste alvo — janela aberta'
                   : (jan.largura > 0 ? 'janela de ' + jan.largura + 'ms' : 'ondas coladas demais pra snipar')) +
                  '">🎯 snipe</a>' : '') +
        '</span>' +
      '</div>';
    }).join('');
    const off = () => parseInt((document.getElementById('cc-cmds-off') || {}).value, 10) || 0;
    box.querySelectorAll('[data-usar]').forEach((el) => el.onclick = () => {
      const c = L[+el.getAttribute('data-usar')];
      ccSetChegada(c.chega + off());
      const m = document.getElementById('cc-msg');
      if (m) { m.style.color = '#8fe39a'; m.textContent = 'Chegada copiada: ' + srvClockMs(c.chega + off()) + (off() ? ' (com ' + off() + 'ms de deslocamento)' : ''); }
    });
    box.querySelectorAll('[data-snipe]').forEach((el) => el.onclick = () => {
      const i = +el.getAttribute('data-snipe'), c = L[i], jan = ccJanelaSnipe(L, i, 50);
      const m = document.getElementById('cc-msg');
      if (jan.largura != null && jan.largura <= 0) {
        if (m) { m.style.color = '#ff7568'; m.textContent = 'Não dá pra snipar: a próxima onda chega antes da janela abrir.'; }
        return;
      }
      // Snipe é apoio no MEU alvo, pousando logo depois do ataque escolhido.
      config.cmd.tipo = 'support'; save();
      const al = document.getElementById('cc-alvo');
      if (al && c.destino) al.value = c.destino;
      ccSetChegada(jan.de + off());
      if (typeof _ccAttTipo === 'function') _ccAttTipo();
      if (m) {
        m.style.color = jan.exato ? '#8fe39a' : '#ffd76a';
        m.textContent = 'Snipe armado em ' + (c.destino || '?') + ' para ' + srvClockMs(jan.de + off()) +
          (jan.largura != null ? ' · janela de ' + jan.largura + 'ms até a próxima onda' : ' · sem próxima onda conhecida') +
          (jan.exato ? '' : ' · ATENÇÃO: essa chegada veio sem milésimos, considerei 1s de margem');
      }
    });
  }

  // ---- Grade de tropas ----
  // Uma "carta" por unidade: ícone em cima (clicar = mandar tudo), número embaixo.
  // O checkbox separado dobrava a altura da grade e poluía a leitura.
  function ccUnidadesUI() {
    const doMundo = CC_UNIDADES_MUNDO && CC_UNIDADES_MUNDO.length ? CC_UNIDADES_MUNDO : UNITS.map((u) => u[0]);
    const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
    return doMundo.filter((u) => u !== 'militia').map((u) => [u, rot[u] || u]);   // milícia não sai da aldeia
  }
  function ccRenderTropas() {
    const grade = document.getElementById('cc-tropas-grade'); if (!grade) return;
    const antes = ccComposicao();   // preserva o que já estava digitado ao reconstruir
    grade.innerHTML = ccUnidadesUI().map(([u, n]) =>
      '<div data-un="' + u + '" style="flex:1 1 62px;min-width:56px;text-align:center;background:#1a130c;' +
      'border:1px solid #3a2e1b;border-radius:6px;padding:3px 2px">' +
        '<div data-maxbtn="' + u + '" title="' + esc(n) + ' — clique para mandar TUDO" ' +
             'style="cursor:pointer;height:18px;line-height:18px;border-radius:4px">' + unitIcon(u, n) + '</div>' +
        '<input id="cc-u-' + u + '" class="twmgr-inp cc-un" type="number" min="0" ' +
               'style="width:100%;padding:1px;text-align:center;font-size:11px" placeholder="0">' +
        '<input id="cc-max-' + u + '" class="cc-mx" type="checkbox" style="display:none">' +
      '</div>').join('');
    // Restaura os valores e religa os eventos
    ccUnidadesUI().forEach(([u]) => {
      const inp = document.getElementById('cc-u-' + u), chk = document.getElementById('cc-max-' + u);
      if (chk) chk.checked = !!antes.max[u];
      if (inp) { inp.value = antes.amounts[u] || ''; inp.disabled = !!antes.max[u]; }
    });
    grade.querySelectorAll('[data-maxbtn]').forEach((el) => el.onclick = () => {
      const u = el.getAttribute('data-maxbtn');
      const chk = document.getElementById('cc-max-' + u);
      chk.checked = !chk.checked;
      const inp = document.getElementById('cc-u-' + u);
      if (inp) { inp.disabled = chk.checked; if (chk.checked) inp.value = ''; }
      ccPintarTropas(); ccRenderOrigens();
      if (ccTipo() === 'fake') ccPreviaFake();
    });
    grade.querySelectorAll('.cc-un').forEach((el) => el.addEventListener('input', () => {
      ccPintarTropas(); ccRenderOrigens();
      if (ccTipo() === 'fake') ccPreviaFake();
    }));
    ccPintarTropas();
  }
  // Realce visual: unidade com "tudo" fica dourada; com número, acesa.
  function ccPintarTropas() {
    const grade = document.getElementById('cc-tropas-grade'); if (!grade) return;
    ccUnidadesUI().forEach(([u]) => {
      const cel = grade.querySelector('[data-un="' + u + '"]');
      const btn = grade.querySelector('[data-maxbtn="' + u + '"]');
      const chk = document.getElementById('cc-max-' + u);
      const inp = document.getElementById('cc-u-' + u);
      if (!cel || !btn) return;
      const max = chk && chk.checked, tem = inp && (parseInt(inp.value, 10) > 0);
      cel.style.borderColor = max ? '#d4af37' : (tem ? '#7a6438' : '#3a2e1b');
      cel.style.background = max ? '#2a2016' : '#1a130c';
      btn.style.background = max ? 'rgba(212,175,55,.22)' : 'transparent';
      if (inp) inp.placeholder = max ? 'tudo' : '0';
    });
  }

  // ---- Modelos de tropa ----
  function ccModelos() { return (config.cmd.modelos = config.cmd.modelos || MODELOS_PADRAO()); }
  function ccModeloAplicar(m) {
    UNITS.forEach(([u]) => {
      const inp = document.getElementById('cc-u-' + u), chk = document.getElementById('cc-max-' + u);
      if (chk) chk.checked = !!m.max[u];
      if (inp) { inp.value = m.amounts[u] || ''; inp.disabled = !!m.max[u]; }
    });
    ccRenderOrigens();
    if (ccTipo() === 'fake') ccPreviaFake();
  }
  function ccModeloTxt(m) {
    const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
    const p = Object.entries(m.amounts).filter(([, n]) => n > 0).map(([u, n]) => (rot[u] || u) + ' ' + fmtN(n));
    Object.keys(m.max).forEach((u) => p.push((rot[u] || u) + ' tudo'));
    return p.join(', ') || '(vazio)';
  }
  function ccModelosRender() {
    const box = document.getElementById('cc-modelos'); if (!box) return;
    const M = ccModelos();
    box.innerHTML = M.length ? M.map((m) =>
      '<span data-mod="' + m.id + '" title="' + esc(ccModeloTxt(m)) + '" ' +
      'style="display:inline-flex;align-items:center;gap:3px;background:#1a130c;border:1px solid #4a3b28;' +
      'border-radius:10px;padding:2px 4px 2px 8px;font-size:10px;color:#e6cf7d;cursor:pointer">' +
        esc(m.nome) +
        '<a data-mod-rn="' + m.id + '" title="renomear" style="color:#8f7d57;padding:0 1px">✎</a>' +
        '<a data-mod-rm="' + m.id + '" title="apagar" style="color:#ff7568;padding:0 2px">✕</a>' +
      '</span>').join('')
      : '<span style="font-size:10px;color:#8f7d57">sem modelos — monte a composição e clique em "salvar como modelo"</span>';
    box.querySelectorAll('[data-mod]').forEach((el) => el.onclick = (ev) => {
      if (ev.target.hasAttribute('data-mod-rm') || ev.target.hasAttribute('data-mod-rn')) return;
      const m = ccModelos().find((z) => z.id === el.getAttribute('data-mod'));
      if (m) ccModeloAplicar(m);
    });
    box.querySelectorAll('[data-mod-rm]').forEach((el) => el.onclick = (ev) => {
      ev.stopPropagation();
      config.cmd.modelos = ccModelos().filter((z) => z.id !== el.getAttribute('data-mod-rm'));
      save(); ccModelosRender();
    });
    box.querySelectorAll('[data-mod-rn]').forEach((el) => el.onclick = (ev) => {
      ev.stopPropagation();
      const m = ccModelos().find((z) => z.id === el.getAttribute('data-mod-rn')); if (!m) return;
      let nome = null;
      try { nome = window.prompt('Novo nome do modelo:', m.nome); } catch (e) {}
      if (nome && nome.trim()) { m.nome = nome.trim().slice(0, 24); save(); ccModelosRender(); }
    });
  }
  function ccModeloSalvar() {
    const comp = ccComposicao();
    const msg = document.getElementById('cc-msg');
    if (!Object.keys(comp.amounts).length && !Object.keys(comp.max).length) {
      if (msg) { msg.style.color = '#ff7568'; msg.textContent = 'Preencha as tropas antes de salvar o modelo.'; }
      return;
    }
    let nome = null;
    try { nome = window.prompt('Nome do modelo:', ''); } catch (e) {}
    if (!nome || !nome.trim()) return;
    nome = nome.trim().slice(0, 24);
    const M = ccModelos();
    const existe = M.find((z) => z.nome.toLowerCase() === nome.toLowerCase());
    if (existe) { existe.amounts = comp.amounts; existe.max = comp.max; }   // mesmo nome = atualiza
    else M.push({ id: genId(), nome: nome, amounts: comp.amounts, max: comp.max });
    save(); ccModelosRender();
    if (msg) { msg.style.color = '#8fe39a'; msg.textContent = 'Modelo "' + nome + '" ' + (existe ? 'atualizado' : 'salvo') + '.'; }
  }

  // ---- Editor de ondas (NT / divisão) ----
  function ccOndas() { return (config.cmd.ondas = config.cmd.ondas || []); }
  function ccGap() { return Math.max(50, parseInt((document.getElementById('cc-trem-gap') || {}).value, 10) || 150); }
  function ccOndaNova(amounts, max, origem) {
    return { id: genId(), origem: origem || null, amounts: amounts || {}, max: max || {}, offsetMs: null };
  }
  // Defasagem efetiva: se a onda não tem uma própria, usa a posição × intervalo.
  function ccOndaOffset(o, i) { return (o.offsetMs != null) ? o.offsetMs : i * ccGap(); }
  function ccOndaTxt(o) {
    const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
    const p = Object.entries(o.amounts).filter(([, n]) => n > 0).map(([u, n]) => (rot[u] || u) + ' ' + fmtN(n));
    Object.keys(o.max).forEach((u) => p.push((rot[u] || u) + ' tudo'));
    return p.join(', ') || '(vazia)';
  }
  function ccOndasRender() {
    const box = document.getElementById('cc-ondas'); if (!box) return;
    const O = ccOndas();
    if (!O.length) {
      box.innerHTML = '<div style="color:#8f7d57;padding:6px;font-size:10px">— nenhuma onda. Use um atalho acima ou monte a composição e clique em "+ onda". —</div>';
      ccOndasAviso(); return;
    }
    const opts = CCVILAS.map((v) => '<option value="' + v.vid + '">' + esc(v.coord || v.vid) + (v.nome ? ' · ' + esc(v.nome) : '') + '</option>').join('');
    box.innerHTML = O.map((o, i) =>
      '<div style="display:grid;grid-template-columns:24px 92px 1fr 62px 64px;gap:4px;align-items:center;padding:3px 4px;border-bottom:1px solid rgba(255,255,255,.05);font-size:10px">' +
        '<span style="color:#ffd76a">' + (i + 1) + '</span>' +
        '<select data-onda-org="' + o.id + '" class="twmgr-inp" style="width:100%;font-size:9px;padding:1px">' +
          '<option value="">(1ª marcada)</option>' + opts + '</select>' +
        '<span style="color:#cbb98f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(ccOndaTxt(o)) + '">' + esc(ccOndaTxt(o)) + '</span>' +
        '<input data-onda-off="' + o.id + '" class="twmgr-inp" type="number" step="10" style="width:100%;font-size:9px;padding:1px" value="' + ccOndaOffset(o, i) + '">' +
        '<span style="text-align:right;white-space:nowrap">' +
          '<a data-onda-up="' + o.id + '" style="cursor:pointer;color:#e6cf7d" title="subir">▲</a> ' +
          '<a data-onda-dn="' + o.id + '" style="cursor:pointer;color:#e6cf7d" title="descer">▼</a> ' +
          '<a data-onda-ed="' + o.id + '" style="cursor:pointer;color:#8fe39a" title="carregar nas caixas de tropa">✎</a> ' +
          '<a data-onda-rm="' + o.id + '" style="cursor:pointer;color:#ff7568" title="remover">✕</a>' +
        '</span>' +
      '</div>').join('');
    O.forEach((o) => {
      const sel = box.querySelector('[data-onda-org="' + o.id + '"]');
      if (sel) { sel.value = o.origem || ''; sel.onchange = () => { o.origem = sel.value || null; save(); ccOndasAviso(); }; }
      const off = box.querySelector('[data-onda-off="' + o.id + '"]');
      if (off) off.onchange = () => { o.offsetMs = parseInt(off.value, 10) || 0; save(); ccOndasAviso(); };
    });
    const mover = (id, d) => {
      const A = ccOndas(), i = A.findIndex((z) => z.id === id), j = i + d;
      if (i < 0 || j < 0 || j >= A.length) return;
      A.splice(j, 0, A.splice(i, 1)[0]);
      A.forEach((z) => { z.offsetMs = null; });   // reordenou: volta pra defasagem automática
      save(); ccOndasRender();
    };
    box.querySelectorAll('[data-onda-up]').forEach((e) => e.onclick = () => mover(e.getAttribute('data-onda-up'), -1));
    box.querySelectorAll('[data-onda-dn]').forEach((e) => e.onclick = () => mover(e.getAttribute('data-onda-dn'), 1));
    box.querySelectorAll('[data-onda-rm]').forEach((e) => e.onclick = () => {
      config.cmd.ondas = ccOndas().filter((z) => z.id !== e.getAttribute('data-onda-rm'));
      save(); ccOndasRender();
    });
    box.querySelectorAll('[data-onda-ed]').forEach((e) => e.onclick = () => {
      const o = ccOndas().find((z) => z.id === e.getAttribute('data-onda-ed')); if (!o) return;
      UNITS.forEach(([u]) => {
        const inp = document.getElementById('cc-u-' + u), chk = document.getElementById('cc-max-' + u);
        if (chk) chk.checked = !!o.max[u];
        if (inp) { inp.value = o.amounts[u] || ''; inp.disabled = !!o.max[u]; }
      });
      const m = document.getElementById('cc-msg');
      if (m) { m.style.color = '#8fe39a'; m.textContent = 'Onda carregada nas caixas. Edite e clique em "+ onda" pra criar uma nova, ou ✕ pra remover esta.'; }
    });
    ccOndasAviso();
  }
  function ccOndasAviso() {
    const av = document.getElementById('cc-trem-aviso'); if (!av) return;
    const O = ccOndas();
    if (!O.length) { av.textContent = ''; return; }
    const partes = [];
    const e = erroEstimadoMs(), gap = ccGap();
    if (gap < e * 2) partes.push('⚠ intervalo de ' + gap + 'ms está perto do erro estimado (±' + e + 'ms) — as ondas podem trocar de ordem');
    const semOrigem = O.filter((o) => !o.origem).length;
    if (semOrigem) partes.push(semOrigem + ' onda(s) sem origem definida usarão a 1ª aldeia marcada');
    const ch = ccChegadaMs();
    if (ch) partes.push('chegadas: ' + O.map((o, i) => srvClockMs(ch + ccOndaOffset(o, i))).join(' · '));
    av.innerHTML = partes.map(esc).join('<br>');
  }
  // Atalhos que preenchem o editor
  function ccNtMontar() {
    const comp = ccComposicao();
    const n = Math.max(1, Math.min(8, parseInt((document.getElementById('cc-trem-n') || {}).value, 10) || 4));
    if (!Object.keys(comp.amounts).length && !Object.keys(comp.max).length) {
      const m = document.getElementById('cc-msg');
      if (m) { m.style.color = '#ff7568'; m.textContent = 'Monte primeiro a composição do NUKE nas caixas de tropa.'; }
      return;
    }
    // Onda 1 = o nuke que está nas caixas (sem nobre); depois, 1 nobre por onda.
    const nuke = { amounts: Object.assign({}, comp.amounts), max: Object.assign({}, comp.max) };
    delete nuke.amounts.snob; delete nuke.max.snob;
    const O = [ccOndaNova(nuke.amounts, nuke.max)];
    for (let i = 0; i < n; i++) O.push(ccOndaNova({ snob: 1 }, {}));
    config.cmd.ondas = O; save(); ccOndasRender();
  }
  function ccNtDividir() {
    const comp = ccComposicao();
    const n = Math.max(2, Math.min(8, parseInt((document.getElementById('cc-trem-n') || {}).value, 10) || 4));
    const m = document.getElementById('cc-msg');
    if (Object.keys(comp.max).length) {
      if (m) { m.style.color = '#ff7568'; m.textContent = 'Pra dividir, use quantidades exatas — "tudo" não dá pra repartir sem saber o estoque da origem.'; }
      return;
    }
    if (!Object.keys(comp.amounts).length) {
      if (m) { m.style.color = '#ff7568'; m.textContent = 'Preencha as tropas que serão divididas.'; }
      return;
    }
    // Divide igual e joga o resto nas primeiras ondas (4000/3 -> 1334,1333,1333).
    const O = [];
    for (let i = 0; i < n; i++) {
      const a = {};
      Object.entries(comp.amounts).forEach(([u, tot]) => {
        const base = Math.floor(tot / n), resto = tot % n;
        const q = base + (i < resto ? 1 : 0);
        if (q > 0) a[u] = q;
      });
      if (Object.keys(a).length) O.push(ccOndaNova(a, {}));
    }
    config.cmd.ondas = O; save(); ccOndasRender();
  }
  function ccNtNobres() {
    const n = Math.max(1, Math.min(8, parseInt((document.getElementById('cc-trem-n') || {}).value, 10) || 4));
    const O = [];
    for (let i = 0; i < n; i++) O.push(ccOndaNova({ snob: 1 }, {}));
    config.cmd.ondas = O; save(); ccOndasRender();
  }

  function ccPreviaFake() {
    const el = document.getElementById('cc-fake-previa'); if (!el) return;
    const P = ccParesFake();
    if (!P.alvos.length) { el.textContent = 'cole os alvos acima'; return; }
    if (!P.origens.length) { el.textContent = 'marque as origens abaixo'; return; }
    el.textContent = P.pares.length + ' fake(s) = ' + P.origens.length + ' origem(ns) × ' +
      P.alvos.length + ' alvo(s) no modo ' + (P.dist === 'todos' ? 'todas × todos' : 'rodízio');
  }
  function ccArmarFakes(dizer, arriveAt) {
    if (!arriveAt) return dizer('Defina o horário de chegada.');
    if (arriveAt <= srvNowP()) return dizer('Esse horário já passou.');
    const comp = ccComposicao();
    if (!Object.keys(comp.amounts).length && !Object.keys(comp.max).length) return dizer('Escolha as tropas do fake.');
    const P = ccParesFake();
    if (!P.alvos.length) return dizer('Cole ao menos um alvo na lista de fakes.');
    if (!P.origens.length) return dizer('Marque ao menos uma origem.');

    let armados = 0; const pulados = [];
    P.pares.forEach((p) => {
      const v = p.o, nome = (v.coord || v.vid) + '→' + p.t.x + '|' + p.t.y;
      const amounts = ccResolverPara(comp, v.avail);
      if (!Object.keys(amounts).length) { pulados.push(nome); return; }
      const t = ccTempoViagemMs(v.x, v.y, p.t.x, p.t.y, amounts);
      if (t != null && (arriveAt - t) <= srvNowP()) { pulados.push(nome + ' (longe)'); return; }
      cmdAdicionar('fake', p.t.x, p.t.y, amounts, arriveAt, v.vid);
      armados++;
    });
    if (!armados) return dizer('Nenhum fake armado.' + (pulados.length ? ' Pulados: ' + pulados.length : ''));
    dizer(armados + ' fake(s) armado(s) em ' + P.alvos.length + ' alvo(s), chegando ' + srvClockMs(arriveAt) +
          (pulados.length ? ' · ' + pulados.length + ' pulado(s)' : ''), '#8fe39a');
  }

  // Arma um comando POR ORIGEM marcada, todos com a MESMA chegada — é isso que faz
  // apoio/ataque de várias aldeias pousar junto.
  function ccArmar() {
    const msg = document.getElementById('cc-msg');
    const dizer = (t, cor) => { if (msg) { msg.textContent = t; msg.style.color = cor || '#ff7568'; } };
    const tipo = ccTipo();

    const arriveAt0 = ccChegadaMs();
    // Fake tem caminho próprio: vários alvos de uma vez, com distribuição escolhida.
    if (tipo === 'fake') return ccArmarFakes(dizer, arriveAt0);

    const alvo = ccAlvo();
    if (!alvo) return dizer('Alvo inválido. Use 478|586.');
    const arriveAt = arriveAt0;
    if (!arriveAt) return dizer('Defina o horário de chegada.');
    if (arriveAt <= srvNowP()) return dizer('Esse horário já passou.');
    if (tipo === 'support' && !config.cmd.suporteOkAt) {
      return dizer('Rode o teste de apoio antes — o parâmetro ainda não foi confirmado neste mundo.');
    }
    const comp = ccComposicao();
    if (!Object.keys(comp.amounts).length && !Object.keys(comp.max).length) {
      return dizer('Escolha as tropas aqui em cima.');
    }
    const marcadas = CCVILAS.filter((v) => config.cmd.origens[v.vid]);
    if (!marcadas.length) return dizer('Marque ao menos uma origem.');

    // NT/Ondas: cada onda tem composição, origem e defasagem próprias.
    if (tipo === 'nobre') {
      const O = ccOndas();
      if (!O.length) return dizer('Monte as ondas primeiro (use "montar NT" ou "dividir em N ondas").');
      let armados = 0; const pulados = [];
      O.forEach((o, i) => {
        // Origem da onda: a dela, ou a primeira marcada como padrão.
        const v = CCVILAS.find((z) => String(z.vid) === String(o.origem)) || marcadas[0];
        if (!v) { pulados.push('onda ' + (i + 1) + ' (sem origem)'); return; }
        const amounts = ccResolverPara({ amounts: o.amounts, max: o.max }, v.avail);
        if (!Object.keys(amounts).length) { pulados.push('onda ' + (i + 1) + ' (vazia)'); return; }
        const chega = arriveAt + ccOndaOffset(o, i);
        const t = (v.x != null) ? ccTempoViagemMs(v.x, v.y, alvo.x, alvo.y, amounts) : null;
        if (t != null && (chega - t) <= srvNowP()) { pulados.push('onda ' + (i + 1) + ' (longe demais)'); return; }
        const c = cmdAdicionar('nobre', alvo.x, alvo.y, amounts, chega, v.vid);
        c.onda = i + 1; c.ondas = O.length;
        armados++;
      });
      save();
      if (!armados) return dizer('Nenhuma onda armada. ' + (pulados.length ? pulados.join(', ') : ''));
      return dizer(armados + ' onda(s) armada(s), a 1ª chegando ' + srvClockMs(arriveAt) +
                   (pulados.length ? ' · pulada(s): ' + pulados.join(', ') : ''),
                   pulados.length ? '#ffd76a' : '#8fe39a');
    }

    let armados = 0, pulados = [];
    let semTropaAgora = 0;
    marcadas.forEach((v) => {
      const nome = v.coord || v.vid;
      const amounts = ccResolverPara(comp, v.avail);
      if (!Object.keys(amounts).length) { pulados.push(nome + ' (nada a enviar)'); return; }
      // Tropa faltando NÃO impede agendar: você pode estar marcando um ataque full pra daqui
      // a horas, com a tropa saqueando agora. O preparo (60s antes) é que confere de verdade.
      if (!ccTemTropa(v, comp)) semTropaAgora++;
      // Tempo pela composição REAL desta aldeia — não pela global.
      const t = (v.x != null) ? ccTempoViagemMs(v.x, v.y, alvo.x, alvo.y, amounts) : null;
      if (t != null && (arriveAt - t) <= srvNowP()) { pulados.push(nome + ' (longe demais)'); return; }
      cmdAdicionar(tipo, alvo.x, alvo.y, amounts, arriveAt, v.vid);
      armados++;
    });
    if (!armados) return dizer('Nenhum comando armado. ' + (pulados.length ? 'Pulados: ' + pulados.join(', ') : ''));
    dizer(armados + ' comando(s) armado(s) chegando ' + srvClockMs(arriveAt) +
          (semTropaAgora ? ' · ' + semTropaAgora + ' sem a tropa completa agora (confere no preparo)' : '') +
          (pulados.length ? ' · pulados: ' + pulados.join(', ') : ''),
          semTropaAgora ? '#ffd76a' : '#8fe39a');
  }

  // Alvo: aceita "478|586", "478 586", "478|586:1" etc.
  function ccAlvo() {
    const raw = ((document.getElementById('cc-alvo') || {}).value || '').trim();
    const m = raw.match(/(\d{1,3})\s*[|\s.,;:-]\s*(\d{1,3})/);
    return m ? { x: m[1], y: m[2], coord: m[1] + '|' + m[2] } : null;
  }

  // Nome da aldeia alvo, do village.txt (que já é cacheado 6h por outro módulo).
  // Carrega em segundo plano: se ainda não tem, mostra só a coordenada.
  let _mapaNomes = null, _mapaNomesCarregando = false;
  function ccNomeAlvo(coord) {
    if (!_mapaNomes) {
      if (!_mapaNomesCarregando) {
        _mapaNomesCarregando = true;
        getMapVillages(false).then((arr) => {
          const m = {};
          arr.forEach((v) => { m[v.x + '|' + v.y] = v.name; });
          _mapaNomes = m; ccRender();
        }).catch(() => { _mapaNomes = {}; });
      }
      return '';
    }
    return _mapaNomes[coord] || '';
  }

  // Uma origem "tem tropa" se atende TODAS as quantidades pedidas e, para as unidades
  // marcadas como "tudo", tem pelo menos 1. Critério único, usado pela lista e pelo botão.
  function ccTemTropa(v, comp) {
    const av = v.avail || {};
    for (const u in comp.amounts) { if ((av[u] || 0) < comp.amounts[u]) return false; }
    for (const u in comp.max) { if (!(av[u] > 0)) return false; }
    return true;
  }

  // Lista de origens: cada aldeia sua com distância, tempo de viagem pela unidade mais lenta
  // e se tem tropa suficiente. É o que permite escolher de onde sai o quê.
  let CCVILAS = [];
  async function ccCarregarOrigens(forcar) {
    const cont = document.getElementById('cc-origens');
    if (cont && !CCVILAS.length) cont.innerHTML = '<div style="color:#8f7d57;padding:6px;font-size:10px">carregando aldeias…</div>';
    try {
      await ccMundo(false);
      const tropas = await ccTropasTodasAldeias(forcar);
      CCVILAS = Object.values(tropas).filter((v) => v.coord);
      if (!CCVILAS.length) {   // conta de 1 aldeia ou parser não pegou: cai pro básico
        const st = await getVillageState(CUR_VID);
        CCVILAS = [{ vid: CUR_VID, coord: null, x: null, y: null, avail: st.avail }];
      }
    } catch (e) {
      pushLog('Centro de Comando: não li as tropas das aldeias (' + (e.message || e) + ').', 'err', 'cmd');
    }
    // Só aqui sabemos quais unidades este mundo tem — reconstrói a grade preservando o digitado.
    if (CC_UNIDADES_MUNDO && _ccUnidadesDesenhadas !== CC_UNIDADES_MUNDO.join(',')) {
      _ccUnidadesDesenhadas = CC_UNIDADES_MUNDO.join(',');
      ccRenderTropas();
    }
    ccRenderOrigens();
  }
  let _ccUnidadesDesenhadas = '';
  function ccRenderOrigens() {
    const cont = document.getElementById('cc-origens'); if (!cont) return;
    const alvo = ccAlvo();
    const comp = ccComposicao();
    const temComp = (Object.keys(comp.amounts).length + Object.keys(comp.max).length) > 0;
    const sel = config.cmd.origens || {};
    const ch = ccChegadaMs();

    const linhas = CCVILAS.map((v) => {
      const d = (alvo && v.x != null) ? fieldDist(v.x, v.y, +alvo.x, +alvo.y) : null;
      // Composição REAL desta aldeia — é dela que sai a unidade mais lenta e, portanto, o tempo.
      const compV = temComp ? ccCompParaVelocidade(comp, v.avail) : {};
      const lentaV = ccUnidadeLenta(compV);
      const t = (alvo && lentaV && v.x != null) ? ccTempoViagemMs(v.x, v.y, alvo.x, alvo.y, compV) : null;
      const temTropa = temComp ? ccTemTropa(v, comp) : true;
      const daTempo = (t == null || !ch) ? null : ((ch - t) > srvNowP());
      return { v: v, d: d, t: t, temTropa: temTropa, daTempo: daTempo, lenta: lentaV };
    });
    linhas.sort((a, b) => (a.d == null ? 1e9 : a.d) - (b.d == null ? 1e9 : b.d));

    const rotUn = {}; UNITS.forEach(([u, n]) => { rotUn[u] = n; });
    cont.innerHTML = linhas.map((L) => {
      const v = L.v, on = !!sel[v.vid];
      let sit, cor;
      if (!L.temTropa) { sit = '⚠ sem tropa'; cor = '#ff7568'; }
      else if (L.daTempo === false) { sit = '⚠ longe demais'; cor = '#ff7568'; }
      else if (L.t != null && ch) { sit = 'sai ' + srvClockMs(ch - L.t); cor = '#8fe39a'; }
      else { sit = ''; cor = '#8f7d57'; }
      // Estoque por unidade. Mostra o número em uso e, entre parênteses, o que está fora/voltando —
      // assim dá pra ver a diferença sem precisar alternar a fonte.
      const listaU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      const tropas = listaU.map((u) => {
        const q = (v.avail && v.avail[u]) || 0;
        const foraT = ((v.fora && v.fora[u]) || 0) + ((v.transito && v.transito[u]) || 0);
        if (!q && !foraT) return '';
        const rot = rotUn[u] || u;
        const pedida = (comp.amounts[u] != null) || comp.max[u];
        const falta = comp.amounts[u] != null && q < comp.amounts[u];
        const extra = (foraT && (config.cmd.fonteTropa || 'casa') === 'casa')
          ? '<span style="color:#7fc8ff">+' + fmtN(foraT) + '</span>' : '';
        return '<span title="' + esc(rot) + (foraT ? ' · ' + fmtN(foraT) + ' fora/voltando' : '') +
               '" style="color:' + (falta ? '#ff7568' : pedida ? '#ffd76a' : '#6b5c3f') + '">' +
               unitIcon(u, rot) + fmtN(q) + extra + '</span>';
      }).filter(Boolean).join(' ');
      return '<label style="display:block;padding:3px 5px;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer">' +
        '<span style="display:grid;grid-template-columns:18px 74px 52px 78px 52px 1fr;gap:6px;align-items:center;font-size:10px">' +
          '<input type="checkbox" data-cc-org="' + v.vid + '"' + (on ? ' checked' : '') + '>' +
          '<span style="color:#e6cf7d" title="' + esc(v.nome || '') + '">' + esc(v.coord || v.vid) + '</span>' +
          '<span style="color:#8f7d57">' + (L.d == null ? '—' : L.d.toFixed(1) + ' c') + '</span>' +
          '<span style="color:#cbb98f">' + (L.t == null ? '—' : fmt(L.t)) + '</span>' +
          '<span style="color:#8f7d57" title="unidade mais lenta que sai desta aldeia">' + (L.lenta ? esc(rotUn[L.lenta] || L.lenta) : '—') + '</span>' +
          '<span style="color:' + cor + '">' + sit + '</span>' +
        '</span>' +
        (tropas ? '<span style="display:block;font-size:9px;margin:1px 0 0 24px;line-height:1.5">' + tropas + '</span>' : '') +
      '</label>';
    }).join('') || '<div style="color:#8f7d57;padding:6px;font-size:10px">— nenhuma aldeia —</div>';

    cont.querySelectorAll('[data-cc-org]').forEach((el) => {
      el.onchange = () => {
        config.cmd.origens[el.getAttribute('data-cc-org')] = el.checked;
        if (!el.checked) delete config.cmd.origens[el.getAttribute('data-cc-org')];
        save(); ccResumo();
      };
    });
    // Aviso quando a velocidade vier da tabela de reserva em vez do servidor.
    const av = document.getElementById('cc-vel-aviso');
    if (av) {
      const m = config.cmd.mundo || {};
      // A unidade mais lenta varia por aldeia quando tem "tudo" marcado, então o cabeçalho
      // só afirma uma quando ela é a mesma em todas.
      const lentas = Array.from(new Set(linhas.map((L) => L.lenta).filter(Boolean)));
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      const txtLenta = lentas.length === 1 ? ('<b>' + esc(rot[lentas[0]] || lentas[0]) + '</b>')
                     : lentas.length ? '<b>varia por aldeia</b>' : '<b>—</b>';
      av.innerHTML = !temComp ? '<span style="color:#8f7d57">digite as tropas pra ver os tempos</span>'
        : ('unidade mais lenta: ' + txtLenta + ' · mundo ' + (m.speed || 1) + '×/' + (m.unitSpeed || 1) + '×' +
           (m.confiavel ? '' : ' · <span style="color:#ffd76a">velocidades de reserva (o servidor confirma no preparo)</span>'));
    }
    ccResumo();
  }
  function ccChegadaMs() {
    const el = document.getElementById('cc-chegada');
    return arrivalToServerMs((el && el.value) || '') || 0;
  }
  function ccResumo() {
    const el = document.getElementById('cc-resumo'); if (!el) return;
    const n = Object.keys(config.cmd.origens || {}).filter((k) => config.cmd.origens[k]).length;
    const alvo = ccAlvo();
    const ch = ccChegadaMs();
    const base = n + ' origem(ns) marcada(s)' + (alvo ? ' → ' + alvo.coord : '') +
                 (ch ? ' · chegando ' + srvClockMs(ch) : '');
    // O trem sai todo da mesma aldeia; avisar aqui evita a surpresa só na hora de armar.
    if (ccTipo() === 'nobre' && n !== 1) {
      el.innerHTML = esc(base) + ' · <b style="color:#ffd76a">o trem exige exatamente 1 origem</b>';
      return;
    }
    el.textContent = base;
  }

  // Só dá pra mexer no tempo antes do disparo fino assumir. Depois de 'armado' o spin
  // já está rodando com o horário capturado, e mudar ali sairia pela culatra.
  function ccEditavel(c) { return c.state === 'novo' || c.state === 'preparado'; }
  // Desloca a chegada e recalcula saída/disparo a partir da duração que o servidor deu.
  function ccAjustar(id, deltaMs) {
    const c = cmdFila().find((z) => z.id === id);
    if (!c || !ccEditavel(c)) return;
    c.arriveAt += deltaMs;
    if (c.durMs != null) cmdRecalc(c);
    save(); ccRender(); cmdTick();
  }
  // Troca a chegada com o vizinho na ordem exibida — é assim que "reordenar" faz sentido:
  // a ordem de um trem é definida pela hora de chegada, não pela posição na lista.
  function ccTrocar(id, dir) {
    const lista = ccFilaOrdenada();
    const i = lista.findIndex((z) => z.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= lista.length) return;
    const a = lista[i], b = lista[j];
    if (!ccEditavel(a) || !ccEditavel(b)) return;
    const t = a.arriveAt; a.arriveAt = b.arriveAt; b.arriveAt = t;
    if (a.durMs != null) cmdRecalc(a);
    if (b.durMs != null) cmdRecalc(b);
    save(); ccRender(); cmdTick();
  }
  function ccFilaOrdenada() {
    const porSaida = (config.cmd.filaOrdem === 'saida');
    return cmdFila().slice().sort((a, b) => {
      // Antes do preparo não há saída conhecida; cai pra chegada pra não embaralhar.
      const va = porSaida ? (a.sendAt || a.arriveAt || 0) : (a.arriveAt || 0);
      const vb = porSaida ? (b.sendAt || b.arriveAt || 0) : (b.arriveAt || 0);
      return va - vb;
    });
  }

  function ccRender() {
    const box = document.getElementById('cc-fila'); if (!box) return;
    const f = cmdFila();
    const ord = document.getElementById('cc-fila-ordem');
    if (ord && ord.value !== config.cmd.filaOrdem) ord.value = config.cmd.filaOrdem;
    // Contador no cabeçalho, pra saber que há comandos mesmo com a seção recolhida.
    const cn = document.getElementById('cc-fila-n');
    if (cn) {
      const pend = f.filter((c) => c.state === 'novo' || c.state === 'preparado' || c.state === 'armado').length;
      cn.textContent = f.length ? ('(' + pend + ' pendente(s) de ' + f.length + ')') : '';
    }
    if (!f.length) { box.innerHTML = '<div style="color:#8f7d57;padding:6px;font-size:10px">— nenhum comando armado —</div>'; return; }
    const agora = serverNow();
    const passo = Math.max(1, config.cmd.passoMs || 50);
    const corDe = { novo: '#cbb98f', preparado: '#ffd76a', armado: '#8fe39a', enviado: '#8fe39a', erro: '#ff7568', abortado: '#8f7d57' };
    box.innerHTML = ccFilaOrdenada().map((c) => {
      const falta = c.fireAt ? (c.fireAt - agora) : (c.arriveAt - agora);
      const dev = (c.desvioMs == null) ? '' : ((c.desvioMs >= 0 ? '+' : '') + c.desvioMs + 'ms');
      const vo = CCVILAS.find((z) => String(z.vid) === String(c.origin));
      const org = vo ? (vo.coord || vo.vid) : c.origin;
      const orgNome = vo && vo.nome ? vo.nome : '';
      const alvoNome = ccNomeAlvo(c.x + '|' + c.y);
      const rot = { support: 'apoio', fake: 'fake', nobre: 'nobre' }[c.tipo] || 'ataque';
      // Horário de saída: já confirmado pelo servidor (c.sendAt) ou, antes do preparo,
      // a estimativa local. A estimativa aparece com "~" pra não passar por certeza.
      let saiTxt = '—', saiCor = '#8f7d57';
      if (c.sendAt) { saiTxt = srvClockMs(c.sendAt); saiCor = '#8fe39a'; }
      else {
        const est = ccEstimaDeComando(c);
        if (est != null && c.arriveAt) { saiTxt = '~' + srvClockMs(c.arriveAt - est); saiCor = '#cbb98f'; }
      }
      return '<div style="display:grid;grid-template-columns:42px 108px 108px 1fr 78px 78px 56px 18px;gap:4px;align-items:center;padding:3px 5px;border-bottom:1px solid rgba(255,255,255,.05);font-size:10px">' +
        '<span style="color:' + (c.tipo === 'support' ? '#7fc8ff' : '#ffb08a') + '">' + rot + (c.ondas ? ' ' + c.onda + '/' + c.ondas : '') + '</span>' +
        '<span style="color:#8f7d57;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(orgNome || String(org)) + '">' +
          esc(String(org)) + (orgNome ? '<br><span style="color:#6b5c3f">' + esc(orgNome) + '</span>' : '') + '</span>' +
        '<span style="color:#e6cf7d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(alvoNome || (c.x + '|' + c.y)) + '">' +
          esc(c.x + '|' + c.y) + (alvoNome ? '<br><span style="color:#8f7d57">' + esc(alvoNome) + '</span>' : '') + '</span>' +
        '<span style="color:' + (corDe[c.state] || '#cbb98f') + '">' + esc(c.state) + (c.erro ? ' · ' + esc(c.erro.slice(0, 40)) : '') + '</span>' +
        '<span style="color:' + saiCor + '" title="horário de saída">' + saiTxt + '</span>' +
        '<span style="color:#cbb98f">' + (c.arriveAt ? srvClockMs(c.arriveAt) : '—') + '</span>' +
        '<span style="text-align:right;color:' + (dev ? erroCor(Math.abs(c.desvioMs)) : '#8f7d57') + '">' + (dev || (falta > 0 ? fmt(falta) : '—')) + '</span>' +
        (c.state === 'novo' || c.state === 'preparado' || c.state === 'armado'
          ? '<span data-cc-ab="' + c.id + '" style="cursor:pointer;color:#ff7568" title="abortar">✕</span>' : '<span></span>') +
        // Ajuste fino: mexe na CHEGADA e o horário de saída se recalcula sozinho.
        // Some depois que o comando entra no disparo, quando mudar já não é seguro.
        (ccEditavel(c)
          ? '<span style="grid-column:1/-1;text-align:right;font-size:9px;color:#8f7d57;padding-top:1px">' +
              '<a data-aj="' + c.id + '" data-d="' + (-passo * 10) + '" style="cursor:pointer;color:#e6cf7d" title="−' + (passo * 10) + 'ms">≪</a> ' +
              '<a data-aj="' + c.id + '" data-d="' + (-passo) + '" style="cursor:pointer;color:#e6cf7d" title="−' + passo + 'ms">‹</a> ' +
              '<span style="color:#6b5c3f">ajuste</span> ' +
              '<a data-aj="' + c.id + '" data-d="' + passo + '" style="cursor:pointer;color:#e6cf7d" title="+' + passo + 'ms">›</a> ' +
              '<a data-aj="' + c.id + '" data-d="' + (passo * 10) + '" style="cursor:pointer;color:#e6cf7d" title="+' + (passo * 10) + 'ms">≫</a>' +
              ' &nbsp;<a data-sw="' + c.id + '" data-dir="-1" style="cursor:pointer;color:#8fe39a" title="trocar de lugar com o de cima">▲</a>' +
              ' <a data-sw="' + c.id + '" data-dir="1" style="cursor:pointer;color:#8fe39a" title="trocar de lugar com o de baixo">▼</a>' +
            '</span>'
          : '') +
        '</div>';
    }).join('');
    box.querySelectorAll('[data-aj]').forEach((e) => e.onclick = () =>
      ccAjustar(e.getAttribute('data-aj'), parseInt(e.getAttribute('data-d'), 10)));
    box.querySelectorAll('[data-sw]').forEach((e) => e.onclick = () =>
      ccTrocar(e.getAttribute('data-sw'), parseInt(e.getAttribute('data-dir'), 10)));
    box.querySelectorAll('[data-cc-ab]').forEach((el) => el.onclick = () => cmdAbortar(el.getAttribute('data-cc-ab')));
  }

  // Relógio a 100ms; a fila só 1x por segundo. Redesenhar a lista 10x/s atrapalharia o clique
  // no botão de abortar e ainda somaria trabalho de CPU bem na hora do spin.
  let _ccLastRender = 0;
  function ccTick() {
    const clk = document.getElementById('cc-clock');
    if (clk) clk.textContent = srvClockMs();
    const sil = document.getElementById('cc-silencio');
    if (sil) sil.textContent = SILENCE.on ? '🔇 modo silêncio — outros módulos congelados' : '';
    if (SILENCE.on) return;                    // durante o silêncio, nem DOM a gente toca
    const st = document.getElementById('cc-saude');
    if (st) {
      const e = erroEstimadoMs();
      const partes = [
        'latência <b>' + Math.round(NETLAT.rttMin || 0) + 'ms</b>',
        'erro estimado <b style="color:' + erroCor(e) + '">±' + e + 'ms</b>',
        'aba <b>' + (document.hidden ? 'em 2º plano' : 'visível') + '</b>',
      ];
      // Sem o oscilador ativo, uma aba escondida perde centenas de ms. O usuário precisa ver isso.
      if (document.hidden && !awakeAtivo()) partes.push('<b style="color:#ff7568">antichoke inativo — clique em Armar</b>');
      if (Math.abs(CLK.driftMs || 0) > 50) partes.push('<b style="color:#ffd76a">relógio oscilando ' + Math.round(CLK.driftMs) + 'ms</b>');
      if (!window.Timing) partes.push('<b style="color:#ff7568">sem relógio do jogo!</b>');
      st.innerHTML = partes.join(' · ');
    }
    const agora = Date.now();
    if (agora - _ccLastRender >= 1000) { _ccLastRender = agora; ccRender(); }
  }

  function mountCmdCenter() {
    if (!config.cmd || !config.cmd.enabled) return;
    if (document.getElementById('cc-painel')) return;
    const host = document.querySelector('#content_value') || document.querySelector('#contentContainer') || document.body;
    const d = document.createElement('div');
    d.id = 'cc-painel';
    d.style.cssText = 'background:linear-gradient(180deg,#2a2016,#201810);border:1px solid #4a3b28;border-radius:10px;padding:10px;margin:0 0 12px;color:#e8d29a;font-size:11px';
    const row = (l, inner) => '<div class="twmgr-row" style="display:flex;align-items:center;gap:6px;margin:3px 0"><span style="min-width:120px;color:#cbb98f">' + l + '</span>' + inner + '</div>';
    d.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        '<b style="color:#d4af37;font-size:13px">🚀 Centro de Comando <span style="color:#8f7d57;font-size:10px;font-weight:400">v' + VERSION + '</span></b>' +
        '<b id="cc-clock" style="color:#ffd76a;font-size:16px;font-variant-numeric:tabular-nums">--:--:--.---</b>' +
      '</div>' +
      '<div id="cc-saude" style="font-size:10px;color:#cbb98f;margin-bottom:4px"></div>' +
      '<div id="cc-silencio" style="font-size:10px;color:#ffd76a;margin-bottom:8px;min-height:12px"></div>' +
      row('Alvo',
        '<input id="cc-alvo" class="twmgr-inp" style="width:130px;font-variant-numeric:tabular-nums" placeholder="478|586">' +
        '<span id="cc-alvo-ok" style="font-size:10px;color:#8f7d57"></span>') +
      row('Chegada (servidor)',
        '<input id="cc-chegada" class="twmgr-inp" type="datetime-local" step="0.001" style="width:230px">' +
        '<button id="cc-ch-agora" class="twmgr-btn twmgr-ghost" style="padding:2px 6px;font-size:10px" title="preenche com a hora do servidor + 10 min">+10min</button>' +
        '<button id="cc-ch-cmd" class="twmgr-btn twmgr-ghost" style="padding:2px 6px;font-size:10px" title="copiar o horário de um comando do jogo">📋 de um comando</button>') +
      // Comandos do jogo: copiar horário pra coordenar em cima, ou escolher um pra snipar.
      '<div id="cc-cmds-box" style="display:none;border:1px solid #4a3b28;border-radius:6px;padding:6px;margin:4px 0">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<span style="font-size:10px">' +
            '<a id="cc-cmds-in" style="cursor:pointer;color:#e6cf7d">🛡 chegando em mim</a> · ' +
            '<a id="cc-cmds-out" style="cursor:pointer;color:#e6cf7d">⚔ meus em rota</a>' +
          '</span>' +
          '<span style="font-size:10px;color:#8f7d57">deslocar ' +
            '<input id="cc-cmds-off" class="twmgr-inp" type="number" step="10" value="0" style="width:60px;font-size:10px;padding:1px">ms' +
            ' <a id="cc-cmds-fechar" style="cursor:pointer;color:#ff7568;margin-left:6px">✕</a></span>' +
        '</div>' +
        '<div id="cc-cmds-lista" style="max-height:200px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:6px"></div>' +
      '</div>' +
      // Abas em vez de rádios: cada tipo tem configuração própria, e a aba deixa claro
      // qual conjunto de campos está valendo.
      '<div id="cc-abas" style="display:flex;gap:2px;margin:8px 0 0">' +
        CC_TIPOS.map((t) =>
          '<div class="cc-aba" data-tipo="' + t.id + '" style="flex:1;text-align:center;padding:6px 4px;cursor:pointer;' +
          'border:1px solid #4a3b28;border-bottom:none;border-radius:6px 6px 0 0;font-size:11px;user-select:none">' +
          t.ico + ' ' + t.rot + '</div>').join('') +
      '</div>' +
      '<div id="cc-aba-corpo" style="border:1px solid #4a3b28;border-radius:0 6px 6px 6px;padding:8px;margin-bottom:8px">' +
        '<div id="cc-aba-hint" style="font-size:10px;color:#8f7d57;margin-bottom:6px"></div>' +
      // Fake: dezenas de alvos de uma vez, com duas distribuições possíveis.
      '<div id="cc-fake-cfg" style="display:none">' +
        '<div style="font-size:10px;color:#cbb98f;margin:4px 0 2px">Alvos do fake (cole vários)</div>' +
        '<textarea id="cc-fake-alvos" class="twmgr-inp" style="width:100%;height:54px;font-size:10px" ' +
          'placeholder="478|586 479|587 480|588 …"></textarea>' +
        '<div style="font-size:10px;margin:3px 0">' +
          '<label style="margin-right:10px;cursor:pointer"><input type="radio" name="cc-fakedist" value="rodizio"> rodízio — 1 fake por alvo, alternando as origens</label><br>' +
          '<label style="cursor:pointer"><input type="radio" name="cc-fakedist" value="todos"> todas × todos — cada origem manda 1 fake pra cada alvo</label>' +
        '</div>' +
        '<div id="cc-fake-previa" style="font-size:10px;color:#ffd76a;margin-bottom:4px"></div>' +
      '</div>' +
      '<div id="cc-trem-cfg" style="display:none">' +
        row('Intervalo entre ondas',
          '<input id="cc-trem-gap" class="twmgr-inp" type="number" min="50" max="5000" step="10" value="150" style="width:70px">' +
          '<span style="color:#8f7d57">ms</span>' +
          '<span style="color:#8f7d57;margin-left:10px">nobres</span>' +
          '<input id="cc-trem-n" class="twmgr-inp" type="number" min="1" max="8" value="4" style="width:48px">') +
        '<div style="font-size:10px;margin:4px 0 6px">' +
          '<a id="cc-nt-preset" style="cursor:pointer;color:#8fe39a">⚡ montar NT (nuke + nobres)</a> · ' +
          '<a id="cc-nt-dividir" style="cursor:pointer;color:#e6cf7d">✂ dividir em N ondas</a> · ' +
          '<a id="cc-nt-nobres" style="cursor:pointer;color:#e6cf7d">👑 só nobres</a> · ' +
          '<a id="cc-nt-add" style="cursor:pointer;color:#e6cf7d">+ onda com a composição atual</a> · ' +
          '<a id="cc-nt-limpar" style="cursor:pointer;color:#ff7568">limpar</a>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:24px 92px 1fr 62px 64px;gap:4px;font-size:9px;color:#8f7d57;padding:0 4px 2px">' +
          '<span>#</span><span>origem</span><span>tropas</span><span>defasagem</span><span></span></div>' +
        '<div id="cc-ondas" style="max-height:170px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:6px"></div>' +
        '<div id="cc-trem-aviso" style="font-size:10px;color:#ffd76a;margin:4px 0 0"></div>' +
      '</div>' +
      '</div>' +   // fim de #cc-aba-corpo
      // Tropas digitadas AQUI, não nas caixas do jogo. "tudo" = manda o estoque inteiro daquela origem.
      '<div style="margin:8px 0 4px;border-top:1px solid #3a2e1b;padding-top:6px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<span data-sec="tropas" style="font-size:10px;color:#e8d29a;font-weight:600;cursor:pointer" title="recolher/expandir">▾ Tropas por origem</span>' +
          '<span style="font-size:10px">' +
            '<a id="cc-tpl-salvar" style="cursor:pointer;color:#8fe39a">+ salvar como modelo</a> · ' +
            '<a id="cc-tpl-limpar" style="cursor:pointer;color:#e6cf7d">limpar</a> · ' +
            '<a id="cc-tpl-restaurar" style="cursor:pointer;color:#8f7d57" title="repõe Tudo/Nobre/Fake">padrão</a>' +
          '</span>' +
        '</div>' +
        '<div data-secbody="tropas">' +
        '<div id="cc-modelos" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px"></div>' +
        // Montada em ccRenderTropas() a partir das unidades que ESTE mundo tem — a lista fixa
        // de 12 mostrava arqueiro e arqueiro a cavalo em mundos que não os têm.
        '<div id="cc-tropas-grade" style="display:flex;flex-wrap:wrap;gap:4px"></div>' +
        '</div>' +
      '</div>' +
      // Origens: cada aldeia com distância e tempo já calculados pela unidade mais lenta.
      '<div style="margin:8px 0 4px;border-top:1px solid #3a2e1b;padding-top:6px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">' +
          '<span data-sec="origens" style="font-size:10px;color:#e8d29a;font-weight:600;cursor:pointer" title="recolher/expandir">▾ Origens</span>' +
          '<span style="font-size:10px">' +
            '<a id="cc-org-todas" style="cursor:pointer;color:#e6cf7d">todas</a> · ' +
            '<a id="cc-org-nenhuma" style="cursor:pointer;color:#e6cf7d">nenhuma</a> · ' +
            '<a id="cc-org-viaveis" style="cursor:pointer;color:#8fe39a" title="marca só as aldeias que têm a tropa pedida E ainda dão tempo de chegar">✓ só as viáveis</a> · ' +
            '<a id="cc-org-recarregar" style="cursor:pointer;color:#e6cf7d">↻</a>' +
          '</span>' +
        '</div>' +
        // "total" conta a tropa que está fora e volta — necessário pra agendar um full
        // pra daqui a horas com a tropa saqueando agora.
        '<div data-secbody="origens">' +
        '<div style="font-size:10px;margin-bottom:3px">' +
          '<label style="margin-right:10px;cursor:pointer" title="linha &quot;Na Aldeia&quot; do jogo"><input type="radio" name="cc-fonte" value="casa"> na aldeia agora</label>' +
          '<label style="cursor:pointer" title="linha &quot;suas próprias&quot; do jogo: inclui o que está fora e em trânsito"><input type="radio" name="cc-fonte" value="total"> suas próprias (inclui fora/trânsito)</label>' +
        '</div>' +
        '<div id="cc-vel-aviso" style="font-size:10px;color:#8f7d57;margin-bottom:3px"></div>' +
        '<div style="display:grid;grid-template-columns:18px 74px 52px 78px 52px 1fr;gap:6px;font-size:9px;color:#8f7d57;padding:0 5px 2px">' +
          '<span></span><span>aldeia</span><span>dist.</span><span>viagem</span><span>mais lenta</span><span>saída</span></div>' +
        '<div id="cc-origens" style="max-height:170px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:6px"></div>' +
        '<div id="cc-resumo" style="font-size:10px;color:#cbb98f;margin-top:3px"></div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
        '<button id="cc-armar" class="twmgr-btn twmgr-go" style="flex:1">▶ Armar comando</button>' +
        '<button id="cc-limpar" class="twmgr-btn twmgr-ghost" title="remove enviados/erros da lista">🧹</button>' +
        '<button id="cc-diag" class="twmgr-btn twmgr-ghost" title="copia um relatório do estado interno pra área de transferência">🐛</button>' +
      '</div>' +
      '<div id="cc-msg" style="font-size:10px;margin-top:5px;min-height:12px"></div>' +
      '<div id="cc-teste-out" style="font-size:10px;margin-top:3px"></div>' +
      '<div style="margin-top:8px;border-top:1px solid #3a2e1b;padding-top:6px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">' +
          '<span data-sec="fila" style="font-size:10px;color:#e8d29a;font-weight:600;cursor:pointer" title="recolher/expandir">▾ Fila <span id="cc-fila-n" style="color:#8f7d57;font-weight:400"></span></span>' +
          '<span style="font-size:10px;color:#8f7d57">ordenar por ' +
            '<select id="cc-fila-ordem" class="twmgr-inp" style="width:auto;font-size:10px;padding:1px">' +
              '<option value="chegada">chegada</option><option value="saida">saída</option></select>' +
            ' · passo <input id="cc-passo" class="twmgr-inp" type="number" min="1" step="10" style="width:52px;font-size:10px;padding:1px">ms' +
          '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:42px 108px 108px 1fr 78px 78px 56px 18px;gap:4px;font-size:9px;color:#8f7d57;padding:0 5px 2px">' +
          '<span>tipo</span><span>de</span><span>para</span><span>estado</span><span>sai</span><span>chegada</span><span>falta</span><span></span></div>' +
        '<div data-secbody="fila"><div id="cc-fila" style="max-height:180px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:6px"></div></div>' +
      '</div>';
    host.insertBefore(d, host.firstChild);
    // keepAwake PRECISA ser chamado sincronamente dentro do gesto, antes de qualquer await,
    // senão o AudioContext fica 'suspended' e o antichoke não vale nada.
    document.getElementById('cc-armar').addEventListener('click', () => { keepAwake(true); ccArmar(); });
    document.getElementById('cc-limpar').addEventListener('click', cmdLimpar);
    document.getElementById('cc-diag').addEventListener('click', ccDiagnostico);
    // Atalhos do editor de ondas
    document.getElementById('cc-nt-preset').onclick = ccNtMontar;
    document.getElementById('cc-nt-dividir').onclick = ccNtDividir;
    document.getElementById('cc-nt-nobres').onclick = ccNtNobres;
    document.getElementById('cc-nt-add').onclick = () => {
      const comp = ccComposicao();
      if (!Object.keys(comp.amounts).length && !Object.keys(comp.max).length) return;
      ccOndas().push(ccOndaNova(comp.amounts, comp.max)); save(); ccOndasRender();
    };
    document.getElementById('cc-nt-limpar').onclick = () => { config.cmd.ondas = []; save(); ccOndasRender(); };
    const ordEl = document.getElementById('cc-fila-ordem');
    ordEl.value = config.cmd.filaOrdem || 'chegada';
    ordEl.addEventListener('change', () => { config.cmd.filaOrdem = ordEl.value; save(); ccRender(); });
    const passoEl = document.getElementById('cc-passo');
    passoEl.value = config.cmd.passoMs || 50;
    passoEl.addEventListener('change', () => {
      config.cmd.passoMs = Math.max(1, parseInt(passoEl.value, 10) || 50); save(); ccRender();
    });
    const gapEl2 = document.getElementById('cc-trem-gap');
    if (gapEl2) gapEl2.addEventListener('input', () => { ccOndasRender(); });
    // Mostra os campos do trem só quando o tipo é trem, e avisa quando o intervalo pedido
    // fica abaixo do jitter medido — aí a ORDEM das ondas vira sorteio.
    const attTrem = () => {
      const tipo = ccTipo();
      const def = CC_TIPOS.find((t) => t.id === tipo) || CC_TIPOS[0];
      // Aba ativa: só ela fica acesa e emendada no corpo.
      document.querySelectorAll('.cc-aba').forEach((el) => {
        const on = el.getAttribute('data-tipo') === tipo;
        el.style.background = on ? 'linear-gradient(180deg,#3a2c1a,#2a2016)' : '#1a130c';
        el.style.color = on ? '#ffd76a' : '#8f7d57';
        el.style.borderBottom = on ? '1px solid #2a2016' : '1px solid #4a3b28';
        el.style.marginBottom = on ? '-1px' : '0';
        el.style.fontWeight = on ? '600' : '400';
      });
      const hint = document.getElementById('cc-aba-hint');
      if (hint) hint.textContent = def.hint;
      const cfg = document.getElementById('cc-trem-cfg');
      if (cfg) cfg.style.display = (tipo === 'nobre') ? 'block' : 'none';
      const fk = document.getElementById('cc-fake-cfg');
      if (fk) fk.style.display = (tipo === 'fake') ? 'block' : 'none';
      // O campo de alvo único não serve pro fake (que usa a lista) — deixa claro.
      const al = document.getElementById('cc-alvo');
      if (al) { al.disabled = (tipo === 'fake'); al.style.opacity = (tipo === 'fake') ? '.4' : '1'; }
      const btn = document.getElementById('cc-armar');
      if (btn) btn.textContent = '▶ Armar ' + def.rot.toLowerCase();
      if (tipo === 'fake') ccPreviaFake();
      if (tipo === 'nobre') ccOndasRender();   // ele já cuida do aviso de intervalo/origens
      ccRenderOrigens();
    };
    _ccAttTipo = attTrem;   // o snipe troca a aba pra Apoio e precisa redesenhar
    document.querySelectorAll('.cc-aba').forEach((el) => {
      el.addEventListener('click', () => { config.cmd.tipo = el.getAttribute('data-tipo'); save(); attTrem(); });
      el.addEventListener('mouseenter', () => { if (el.getAttribute('data-tipo') !== ccTipo()) el.style.color = '#cbb98f'; });
      el.addEventListener('mouseleave', attTrem);
    });
    attTrem();

    // Qualquer mudança em alvo/tropa/chegada recalcula os tempos das origens.
    const recalc = () => { ccRenderOrigens(); };
    const alvoEl = document.getElementById('cc-alvo');
    alvoEl.addEventListener('input', () => {
      const a = ccAlvo();
      const ok = document.getElementById('cc-alvo-ok');
      if (ok) { ok.textContent = a ? '✓ ' + a.coord : (alvoEl.value ? '✗ formato' : ''); ok.style.color = a ? '#8fe39a' : '#ff7568'; }
      recalc();
    });
    document.getElementById('cc-chegada').addEventListener('input', recalc);
    // Os eventos das caixas de tropa são religados dentro de ccRenderTropas(), porque a grade
    // é reconstruída quando descobrimos as unidades reais do mundo.

    // Atalho: chegada = agora + 10 min, já no formato que o campo aceita.
    document.getElementById('cc-ch-agora').addEventListener('click', () => {
      const alvoMs = serverNow() + 600000 - wallToServerOffset();
      const d = new Date(alvoMs), p = (n, w) => String(n).padStart(w || 2, '0');
      document.getElementById('cc-chegada').value =
        d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' +
        p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
      recalc();
    });
    // Comandos do jogo: abrir/fechar, trocar entre chegando e saindo.
    const cmdsBox = document.getElementById('cc-cmds-box');
    document.getElementById('cc-ch-cmd').addEventListener('click', () => {
      const abrir = (cmdsBox.style.display === 'none');
      cmdsBox.style.display = abrir ? 'block' : 'none';
      if (abrir) ccCmdsRender(_ccCmdsQual, true);
    });
    document.getElementById('cc-cmds-fechar').onclick = () => { cmdsBox.style.display = 'none'; };
    document.getElementById('cc-cmds-in').onclick = () => ccCmdsRender('incoming', true);
    document.getElementById('cc-cmds-out').onclick = () => ccCmdsRender('outgoing', true);

    // Modelos de tropa
    const limpar = () => {
      ccUnidadesUI().forEach(([u]) => {
        const i = document.getElementById('cc-u-' + u), m = document.getElementById('cc-max-' + u);
        if (i) { i.value = ''; i.disabled = false; }
        if (m) m.checked = false;
      });
      ccPintarTropas();
    };
    document.getElementById('cc-tpl-limpar').onclick = () => { limpar(); recalc(); };
    document.getElementById('cc-tpl-salvar').onclick = ccModeloSalvar;
    document.getElementById('cc-tpl-restaurar').onclick = () => {
      config.cmd.modelos = MODELOS_PADRAO(); save(); ccModelosRender();
    };
    ccRenderTropas();
    ccModelosRender();
    document.querySelectorAll('[data-sec]').forEach((h) =>
      h.addEventListener('click', () => ccToggleSecao(h.getAttribute('data-sec'))));
    ccAplicarFechados();

    // Seleção de origens
    // Fake: prévia ao vivo de quantos comandos a combinação atual geraria.
    const fkAlvos = document.getElementById('cc-fake-alvos');
    fkAlvos.value = config.cmd.fakeAlvos || '';
    fkAlvos.addEventListener('input', () => { config.cmd.fakeAlvos = fkAlvos.value; save(); ccPreviaFake(); });
    document.querySelectorAll('input[name="cc-fakedist"]').forEach((r) => {
      r.checked = (r.value === (config.cmd.fakeDist || 'rodizio'));
      r.addEventListener('change', () => { if (r.checked) { config.cmd.fakeDist = r.value; save(); ccPreviaFake(); } });
    });

    document.getElementById('cc-org-todas').onclick = () => { CCVILAS.forEach((v) => config.cmd.origens[v.vid] = true); save(); ccRenderOrigens(); };
    document.getElementById('cc-org-nenhuma').onclick = () => { config.cmd.origens = {}; save(); ccRenderOrigens(); };
    document.getElementById('cc-org-recarregar').onclick = () => ccCarregarOrigens(true);
    document.querySelectorAll('input[name="cc-fonte"]').forEach((r) => {
      r.checked = (r.value === (config.cmd.fonteTropa || 'casa'));
      r.addEventListener('change', () => {
        if (!r.checked) return;
        config.cmd.fonteTropa = r.value; save();
        // Não precisa rebuscar: a leitura já traz as duas linhas, só troca qual delas usar.
        // Recarrega CCVILAS (é ele que carrega o 'avail' da fonte escolhida) e redesenha.
        ccCarregarOrigens(false).then(ccRenderOrigens);
      });
    });
    // Marca só as origens que atendem os DOIS critérios: têm a tropa pedida E ainda dá tempo.
    document.getElementById('cc-org-viaveis').onclick = () => {
      const alvo = ccAlvo(), ch = ccChegadaMs(), comp = ccComposicao();
      const msg = document.getElementById('cc-msg');
      if (!alvo || !ch) {
        if (msg) { msg.style.color = '#ff7568'; msg.textContent = 'Preencha o alvo e a chegada primeiro.'; }
        return;
      }
      let ok = 0, semTropa = 0, semTempo = 0;
      config.cmd.origens = {};
      CCVILAS.forEach((v) => {
        if (v.x == null) return;
        if (!ccTemTropa(v, comp)) { semTropa++; return; }
        const compV = ccCompParaVelocidade(comp, v.avail);   // por aldeia, não global
        const t = ccTempoViagemMs(v.x, v.y, alvo.x, alvo.y, compV);
        if (t == null || (ch - t) <= srvNowP()) { semTempo++; return; }
        config.cmd.origens[v.vid] = true; ok++;
      });
      save(); ccRenderOrigens();
      if (msg) {
        msg.style.color = ok ? '#8fe39a' : '#ff7568';
        msg.textContent = ok + ' origem(ns) marcada(s)' +
          (semTropa ? ' · ' + semTropa + ' sem tropa' : '') +
          (semTempo ? ' · ' + semTempo + ' longe demais' : '');
      }
    };

    ccCarregarOrigens(false);
    // Verifica o apoio uma vez por mundo, sozinho. Só faz o "confirmar" — não envia tropa.
    // Sem isso o tipo Apoio ficaria travado sem o usuário saber como destravar.
    if (!config.cmd.suporteOkAt) setTimeout(() => ccTestarApoio(true), 2500);
    setInterval(ccTick, 100);        // relógio com milésimos precisa de tick rápido
    ccTick();
    netProbe(5);
    // Punho de diagnóstico. Mede o motor de tempo SEM rede, que é o jeito de separar
    // jitter de timer de jitter de conexão.
    window.__cc = {
      // __cc.testSpin(3000) -> quanto o spin errou o alvo, em ms (rode também com a aba escondida)
      testSpin: async (emMs) => {
        keepAwake(true); ancorar();
        const alvo = srvNowP() + (emMs || 3000);
        await spinUntil(alvo);
        const err = srvNowP() - alvo;
        console.log('[cc] erro do spin: ' + err.toFixed(2) + 'ms · aba ' +
                    (document.hidden ? 'escondida' : 'visível') + ' · antichoke ' + (awakeAtivo() ? 'on' : 'OFF'));
        return err;
      },
      probe: () => netProbe(7).then((r) => (console.log('[cc] rtt min/med/jitter:', r), r)),
      relogio: () => ({ offset: wallToServerOffset(), drift: ancorar(), agora: srvClockMs() }),
      silencio: (ms) => { silenceOn('teste'); setTimeout(silenceOff, ms || 5000); },
      testarApoio: () => ccTestarApoio(false),
      fakes: () => ccParesFake(),
      // Diagnóstico da leitura de tropas: mostra a estrutura real da tabela do jogo
      // pra comparar com o que o parser extraiu.
      dumpTropas: async (type) => {
        const t = type || 'own_home';
        const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=units&type=' + t + '&page=-1', { credentials: 'include' });
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const tabelas = Array.from(doc.querySelectorAll('table')).map((tb, i) => ({
          i: i, id: tb.id || '', classe: tb.className || '',
          linhas: tb.querySelectorAll('tr').length,
          unitItems: tb.querySelectorAll('td.unit-item').length,
        })).filter((x) => x.unitItems > 0);
        const ths = Array.from(doc.querySelectorAll('th')).map((th) => {
          const img = th.querySelector('img[src*="unit_"]');
          return img ? (img.getAttribute('src').match(/unit_(\w+)\./) || [])[1] : (th.textContent || '').trim().slice(0, 14);
        });
        const linha = doc.querySelector('tr:has(span.quickedit-vn[data-id])') ||
                      Array.from(doc.querySelectorAll('tr')).find((tr) => tr.querySelector('span.quickedit-vn[data-id], .quickedit-out[data-id]'));
        const amostra = linha ? {
          html: linha.outerHTML.slice(0, 1200),
          celulas: Array.from(linha.querySelectorAll('td')).map((td) => ({
            classe: td.className || '', txt: (td.textContent || '').trim().slice(0, 20),
          })),
        } : null;
        const parsed = await ccLerAbaTropas(t);
        const chaves = Object.keys(parsed).slice(0, 3);
        console.log('=== ' + t + ' ===');
        console.log('tabelas com unit-item:', tabelas);
        console.log('cabeçalhos (th):', ths);
        console.log('amostra de linha:', amostra);
        console.log('parser extraiu (3 primeiras):', chaves.map((k) => parsed[k]));
        return { tabelas, ths, amostra, exemplo: chaves.map((k) => parsed[k]) };
      },
      estado: () => ({ fila: cmdFila(), calib: config.cmd.calib, lat: NETLAT, silencio: SILENCE.on }),
    };
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

  // Lê a tela de comandos (só ataques): coords com ataque nosso em rota (p/ não empilhar) + nº de ATAQUES DE SAQUE em rota (ícone de farm) p/ o card.
  async function getPendingAttack() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=commands&type=attack', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const coords = new Set(); let saques = 0;
    doc.querySelectorAll('#commands_table tr').forEach((tr) => {
      const label = tr.querySelector('.quickedit-label'); if (!label) return;
      const m = (label.textContent || '').match(/\((\d+)\|(\d+)\)/); if (m) coords.add(m[1] + '|' + m[2]);
      if (tr.querySelector('img[src*="command/farm"]')) saques++;   // ícone farm.webp = ataque de saque do assistente
    });
    return { coords: coords, saques: saques };
  }

  // "Minha pontuação hoje" do ranking Em um dia (type: loot_res = saqueado, scavenge = coletado). Cache por type.
  const _dailyCache = {};
  async function getDailyLootStats(type) {
    const c = _dailyCache[type];
    if (c && (Date.now() - c.at) < 300000) return c.data;
    let today = null;
    try {
      const res = await fetch('/game.php?village=' + CUR_VID + '&screen=ranking&mode=in_a_day&type=' + type, { credentials: 'include' });
      const txt = await res.text();
      const m = txt.match(/pontua[çc][ãa]o\s+hoje[^0-9]*([\d.]+)/i);
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
    _dailyCache[type] = { at: Date.now(), data: data };
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
    } catch (e) { pushLog('Saque: erro ao listar aldeias: ' + (e.message || e), 'err', 'farm'); cfg.nextAt = now + 120000; save(); scheduleFarm(); return; }
    let pendingCoords = new Set(), saquesAtivos = null;
    try { const pa = await getPendingAttack(); pendingCoords = pa.coords; saquesAtivos = pa.saques; } catch (e) {}
    const minW = cfg.minWood || 0, minS = cfg.minStone || 0, minI = cfg.minIron || 0;
    const maxDist = cfg.maxDist != null ? cfg.maxDist : 13;
    const maxWall = cfg.maxWall != null ? cfg.maxWall : 20;
    const delayBase = cfg.mode === 'agressivo' ? 200 : 500;
    const cooldownMs = Math.max(0, cfg.cooldownMin || 0) * 60000;
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
    let count = 0;
    for (const v of villages) {
      if (minCL > 0) { try { if (((await getVillageState(v.vid)).avail.light || 0) < minCL) { pushLog(v.name + ': pulada — menos de ' + minCL + ' cavalaria leve.', '', 'farm'); continue; } } catch (e) {} }
      let tpl = null;
      if (!dyn) { try { tpl = await getFarmTemplates(v.vid); } catch (e) { tpl = null; } }
      let targets;
      try { targets = await getFarmTargets(v.vid); }
      catch (e) { pushLog('Saque em ' + v.name + ': erro ao ler os alvos (' + (e.message || e) + ').', 'err', 'farm'); continue; }
      const skip = { norep: 0, off: 0, red: 0, azul: 0, def: 0, dist: 0, mur: 0, pend: 0 };
      const eligible = [];
      targets.forEach((t) => {
        if (!t.reportId) { skip.norep++; return; }
        if (t.color === 'red') { skip.red++; return; }
        if (t.dist != null && t.dist > maxDist) { skip.dist++; return; }
        if (t.wall != null && t.wall > maxWall) { skip.mur++; return; }
        const cell = cellFor(t);
        if (!cell || !cell.mode || cell.mode === 'none') { skip.off++; return; }
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
        const cell = t._cell, mode = cell.mode, qty = Math.max(1, cell.qty || 1);
        const cm = (t.coord || '').match(/(\d+)\|(\d+)/), sum = (t.wood || 0) + (t.stone || 0) + (t.iron || 0);
        // "Em rota" = ataque de VERDADE ainda a caminho (lista viva de comandos) — não a nossa memória de último envio.
        // Nunca empilha: C não manda se já tem algo a caminho; A/B só re-manda em cima de ataque NOSSO com mais tempo que o "tempo entre farms".
        const inFlight = pendingCoords.has(t.coord);
        if (mode === 'c') {
          if (inFlight) { skip.pend++; continue; }
        } else {
          if (inFlight && (!sent[t.coord] || now - sent[t.coord] < cooldownMs)) { skip.pend++; continue; }
        }
        let did = false;
        try {
          if (mode === 'c') {
            if (t.cEnabled && t.wood >= minW && t.stone >= minS && t.iron >= minI) {
              await sendFarmC(v.vid, t.reportId); did = true; count++; cfg.activeSends.push({ coord: t.coord, mode: 'c', vid: v.vid, at: now }); await sleep(delayBase + Math.floor(Math.random() * 250));
            }
          } else if (mode === 'a' && (dyn || t.aEnabled)) {
            for (let k = 0; k < qty; k++) {
              if (dyn) { if (!cm) break; await sendAttack(v.vid, cm[1], cm[2], { light: Math.max(1, Math.ceil(sum / 80)), spy: 1 }); }
              else { if (!tpl || !tpl.a) break; await sendFarmB(v.vid, t.targetId, tpl.a); }
              did = true; count++; cfg.activeSends.push({ coord: t.coord, mode: 'a', vid: v.vid, at: now }); await sleep(delayBase + Math.floor(Math.random() * 250));
            }
          } else if (mode === 'b' && (dyn || t.bEnabled)) {
            for (let k = 0; k < qty; k++) {
              if (dyn) { if (!cm) break; await sendAttack(v.vid, cm[1], cm[2], { light: Math.max(1, Math.ceil(sum * 1.2 / 80)), spy: 1 }); }
              else { if (!tpl || !tpl.b) break; await sendFarmB(v.vid, t.targetId, tpl.b); }
              did = true; count++; cfg.activeSends.push({ coord: t.coord, mode: 'b', vid: v.vid, at: now }); await sleep(delayBase + Math.floor(Math.random() * 250));
            }
          }
        } catch (e) { exhausted = true; pushLog('Saque em ' + v.name + ': envio falhou (tropa insuficiente?) — pulando pra próxima aldeia.', 'err', 'farm'); }
        if (did) { sent[t.coord] = now; vSent++; pushLog('Saque: ' + v.name + ' → ' + t.coord + ' (' + colorTxt(t) + ') pelo ' + mode.toUpperCase() + (mode !== 'c' ? ' ×' + qty : ''), 'ok', 'farm'); }
      }
      const parts = ['enviou ' + vSent];
      if (exhausted) parts.push('interrompida (sem tropa)');
      if (skip.off) parts.push(skip.off + ' cor sem modo');
      if (skip.azul) parts.push(skip.azul + ' azul c/ muralha');
      if (skip.def) parts.push(skip.def + ' azul c/ defesa');
      if (skip.dist) parts.push(skip.dist + ' fora do alcance');
      if (skip.mur) parts.push(skip.mur + ' muralha alta');
      if (skip.pend) parts.push(skip.pend + ' já c/ ataque a caminho');
      if (skip.norep) parts.push(skip.norep + ' sem relatório');
      pushLog(v.name + ': ' + parts.join(' · '), '', 'farm');
    }
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
    let villages;
    try { villages = await getAllScavengeState(); }
    catch (e) { pushLog('Muralha: erro ao listar as aldeias (' + (e.message || e) + ').', 'err', 'wall'); config.wall.nextAt = now + 120000; save(); scheduleWall(); return; }
    const wMin = config.wall.wallMin != null ? config.wall.wallMin : 1;
    const wMax = config.wall.wallMax != null ? config.wall.wallMax : 6;
    const axeN = Math.max(1, config.wall.axeCount || 80);
    const delay = Math.max(0, config.farm.delay != null ? config.farm.delay : 500);
    const demo = config.wall.sentDemo || {};
    const COOLDOWN = 6 * 3600 * 1000;   // não re-manda no mesmo report por 6h
    let count = 0, pendingWalls = 0;
    for (const v of villages) {
      let targets;
      try { targets = await getFarmTargets(v.vid); }
      catch (e) { pushLog('Muralha em ' + v.name + ': erro ao ler os alvos (' + (e.message || e) + ').', 'err', 'wall'); continue; }
      let avail; try { avail = (await getVillageState(v.vid)).avail; } catch (e) { avail = {}; }
      const eligible = []; const skip = { semmuro: 0, fora: 0, jaenv: 0 };
      targets.forEach((t) => {
        if (!t.reportId) return;
        if (t.wall == null) { skip.semmuro++; return; }                 // sem info de muralha -> deixa pro C ou próximo scan
        if (t.wall < wMin || t.wall > wMax) { skip.fora++; return; }      // fora da faixa de muro do quebra
        if (demo[t.reportId] && (now - demo[t.reportId] < COOLDOWN)) { skip.jaenv++; return; }
        eligible.push(t);
      });
      pendingWalls += eligible.length;
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
          pushLog('Muralha: ' + v.name + ' → ' + t.coord + ' (muro ' + t.wall + ') com ' + axeN + ' bárbaro + ' + rams + ' aríete' + (spies ? ' + ' + spies + ' explorador' : ''), 'ok', 'wall');
          if (i < eligible.length - 1) await sleep(delay + Math.floor(Math.random() * 250));
        } catch (e) { pushLog('Muralha em ' + v.name + ' → ' + t.coord + ': ' + (e.message || e), 'err', 'wall'); }
      }
      const parts = ['enviou ' + vSent];
      if (semBB) parts.push('sem bárbaro suficiente');
      if (semRam) parts.push(semRam + ' alvo(s) sem aríete');
      if (skip.fora) parts.push(skip.fora + ' fora da faixa de muro');
      if (skip.semmuro) parts.push(skip.semmuro + ' sem info de muro');
      if (skip.jaenv) parts.push(skip.jaenv + ' já atacado (6h)');
      pushLog(v.name + ': ' + parts.join(' · '), '', 'wall');
    }
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
        pushLog('Cultivo (abastece): ' + s.coord + ' → ' + v.coord + ' (' + amt.wood + '/' + amt.stone + '/' + amt.iron + ')', 'ok', 'bb');
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
    pushLog('Mapa: ' + plan.myV.length + ' aldeia(s) de origem, ' + plan.barbCount + ' bárbaro(s) no critério, ' + totalPlanned + ' planejado(s).', 'ok', 'map');
    const delay = Math.max(0, cfg.delay != null ? cfg.delay : 500);
    let sentTotal = 0, leftTotal = 0;
    for (const p of plan.plan) {
      if (!p.targets.length) continue;
      let state;
      try { state = await getVillageState(p.src.vid); }
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
    if (_captchaPausado) return;   // durante o modo silêncio: a varredura do DOM viraria jitter
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
    const clk = document.getElementById('twmgr-srvclock'); if (clk) { try { clk.textContent = srvClockMs(); } catch (e) {} }
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
    const md = document.getElementById('twmgr-farm-mode'); if (md) config.farm.mode = md.value || 'suave';
    const gp = document.getElementById('twmgr-farm-group'); if (gp) config.farm.group = gp.value || null;
    const cd = document.getElementById('twmgr-farm-cooldown'); if (cd) { config.farm.cooldownMin = parseInt(cd.value, 10); if (isNaN(config.farm.cooldownMin) || config.farm.cooldownMin < 0) config.farm.cooldownMin = 10; }
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
      ".twmgr-fmtable th{font-size:10px;color:#c9a24a;font-weight:700;padding:3px 4px;border-bottom:1px solid #4a3b28;text-transform:uppercase}",
      ".twmgr-fmrow{border-bottom:1px solid rgba(255,255,255,.04)}",
      ".twmgr-fmrow:hover{background:rgba(212,175,55,.06)}",
      ".twmgr-fmck{width:16px;height:16px;cursor:pointer}",
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
    ['scav', 'farm', 'wall', 'recruit', 'fakes', 'market', 'build', 'bb', 'map', 'log'].forEach((n) => {
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
      '<div class="twmgr-tabs">' + tabBtn('scav', '⛏️', 'Coletas') + tabBtn('farm', '🐎', 'Saque') + tabBtn('wall', '🐏', 'Muralha') + tabBtn('recruit', '🏹', 'Recrutar') + tabBtn('fakes', '🎭', 'Fakes') + tabBtn('market', '🏪', 'Mercado') + tabBtn('build', '🏗️', 'Edifícios') + tabBtn('bb', '🌱', 'Cultivo') + tabBtn('map', '🗺️', 'Mapa') + '</div>' +
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
        hint('FarmGod: por <b>cor</b>, escolha <b>um</b> modo (A, B ou C). Vermelho nunca; azul só muro 0 sem defesa. Nunca empilha no mesmo alvo.') +
        cardsDiv('farm') +
        sec('Ataque por cor (marque 1 por linha)',
          '<table class="twmgr-fmtable"><tr><th style="text-align:left">cor</th><th>A</th><th>B</th><th>C</th></tr>' +
          fmRow('greenEmpty', '🟢 verde vazio') + fmRow('greenFull', '🟢 verde cheio') + fmRow('yellowEmpty', '🟡 amarelo vazio') + fmRow('yellowFull', '🟡 amarelo cheio') + fmRow('blue', '🔵 azul (muro 0)') + '</table>' +
          '<label class="twmgr-check" style="margin-top:6px"><input id="twmgr-farm-dyn" type="checkbox"> Template dinâmico (A=mín, B=+20% da carga)</label>') +
        sec('Recurso mínimo (só p/ o C)',
          '<div class="twmgr-res"><label><span class="icon header wood"></span><input id="twmgr-farm-wood" class="twmgr-inp" type="number" min="0" value="1000"></label><label><span class="icon header stone"></span><input id="twmgr-farm-stone" class="twmgr-inp" type="number" min="0" value="1000"></label><label><span class="icon header iron"></span><input id="twmgr-farm-iron" class="twmgr-inp" type="number" min="0" value="1000"></label></div>') +
        sec('Alcance',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo de aldeias</span><select id="twmgr-farm-group" class="twmgr-inp" style="width:170px"></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-farm-dist" class="twmgr-inp" type="number" min="0" step="0.1" value="13" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Muralha máx. (nível)</span><input id="twmgr-farm-wall" class="twmgr-inp" type="number" min="0" max="20" value="20" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Mínimo CL p/ farmar</span><input id="twmgr-farm-mincl" class="twmgr-inp" type="number" min="0" value="0" style="width:66px"></div>') +
        sec('Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Modo</span><select id="twmgr-farm-mode" class="twmgr-inp" style="width:120px"><option value="agressivo">Agressivo</option><option value="suave">Suave</option></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Ordem de farm</span><select id="twmgr-farm-order" class="twmgr-inp" style="width:130px"><option value="dist">Por distância</option><option value="recurso">Por recurso</option></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Tempo entre farms (min)</span><input id="twmgr-farm-cooldown" class="twmgr-inp" type="number" min="0" value="10" style="width:66px"></div>' +
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
          '<label class="twmgr-lbl">Chegada</label><input id="twmgr-fk-arr" class="twmgr-inp" type="datetime-local" step="0.001" style="width:100%;margin:2px 0 0">') +
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
      '<div id="twmgr-tab-log" style="display:none">' +
      '<div class="twmgr-hint">🤖 Notificação de CAPTCHA: alerta quando o jogo pedir verificação.</div>' +
      '<label class="twmgr-check"><input id="twmgr-cap-en" type="checkbox"> Detectar CAPTCHA</label>' +
      '<label class="twmgr-check"><input id="twmgr-cap-brw" type="checkbox"> Notificação do navegador</label>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Tópico ntfy.sh (opcional)</span><input id="twmgr-cap-ntfy" class="twmgr-inp" type="text" placeholder="meu-topico" style="width:120px"></div>' +
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
    const readCapCfg = () => {
      config.captcha.enabled = document.getElementById('twmgr-cap-en').checked;
      config.captcha.browserNotif = document.getElementById('twmgr-cap-brw').checked;
      config.captcha.ntfyTopic = document.getElementById('twmgr-cap-ntfy').value.trim();
      save();
    };
    ['twmgr-cap-en', 'twmgr-cap-brw', 'twmgr-cap-ntfy'].forEach((id) => document.getElementById(id).addEventListener('change', readCapCfg));
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
    document.getElementById('twmgr-farm-int').value = Math.round((config.farm.interval || 600) / 60);
    document.getElementById('twmgr-farm-mode').value = config.farm.mode || 'suave';
    document.getElementById('twmgr-farm-cooldown').value = config.farm.cooldownMin != null ? config.farm.cooldownMin : 10;
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
    ['twmgr-farm-wood', 'twmgr-farm-stone', 'twmgr-farm-iron', 'twmgr-farm-dist', 'twmgr-farm-wall', 'twmgr-farm-int', 'twmgr-farm-mode', 'twmgr-farm-group', 'twmgr-farm-cooldown', 'twmgr-farm-mincl', 'twmgr-farm-order', 'twmgr-farm-dyn'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readFarmCfg); });
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
    ['scav', 'farm', 'wall', 'recruit', 'fakes', 'market', 'build', 'bb', 'map'].forEach((m) => { refreshCards(m); renderModLog(m); });
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
    if (config.scav.running) { if (!lockOther()) pushLog('Coleta retomada.', 'ok', 'scav'); scheduleScav(); }
    if (config.farm.running) { if (!lockOther()) pushLog('Saque retomado.', 'ok', 'farm'); scheduleFarm(); }
    if (config.wall.running) { if (!lockOther()) pushLog('Muralha retomada.', 'ok', 'wall'); scheduleWall(); }
    if (config.recruit.running) { if (!lockOther()) pushLog('Recrutar retomado.', 'ok', 'recruit'); scheduleRecruit(); }
    if (config.fakes.running) { config.fakes.gen.forEach((f) => { if (f.state === 'scheduled') f.state = 'armed'; }); if (!lockOther()) pushLog('Fakes rearmados.', 'ok', 'fakes'); fakeTick(); }
    if (config.market.running) { if (!lockOther()) pushLog('Mercado retomado.', 'ok', 'market'); scheduleMarket(); }
    if (config.build.running) { if (!lockOther()) pushLog('Edifícios retomado.', 'ok', 'build'); scheduleBuild(); }
    if (config.bb && config.bb.running) { if (!lockOther()) pushLog('Cultivo retomado.', 'ok', 'bb'); scheduleBB(); }
    if (config.map && config.map.running) { if (!lockOther()) pushLog('Mapa retomado.', 'ok', 'map'); scheduleMap(); }
    startCaptchaWatcher();
    // Centro de Comando: só monta na praça de reunião, dentro do conteúdo do jogo.
    if (telaAtual() === 'place') { try { mountCmdCenter(); } catch (e) { pushLog('Centro de Comando não montou: ' + (e.message || e), 'err', 'cmd'); } }
    cmdBoot();   // comandos armados sobrevivem ao F5 e são re-armados aqui
  }

  function makeDraggable(panel, handle) {
    let sx, sy, ox, oy, drag = false;
    handle.addEventListener('mousedown', (e) => { if (e.target.closest('#twmgr-min,#twmgr-logbtn,#twmgr-upd-btn')) return; drag = true; sx = e.clientX; sy = e.clientY; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; panel.style.right = 'auto'; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => { if (!drag) return; panel.style.left = (ox + e.clientX - sx) + 'px'; panel.style.top = (oy + e.clientY - sy) + 'px'; });
    document.addEventListener('mouseup', () => { drag = false; });
  }

  buildUI();
})();
