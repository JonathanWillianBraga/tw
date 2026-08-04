// ==UserScript==
// @name         Tribal Wars Manager
// @namespace    tw-manager

// @version      11.23.1
// @description  Auto-ATK + Coleta + Saque + Recrutar + Fakes + Bárbaros do Mapa (multi-alvo/origem, chegada em horário marcado).
// @match        https://*.tribalwars.com.br/game.php*
// @match        https://*.tribalwars.net/game.php*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/JonathanWillianBraga/tw/main/tw-manager.user.js
// @downloadURL  https://raw.githubusercontent.com/JonathanWillianBraga/tw/main/tw-manager.user.js
// @run-at       document-idle
// ==/UserScript==

/*
  NAO EDITE tw-manager.user.js DIRETO — ele e GERADO.
  Fonte da verdade: os modulos em src/*.js. Edite o modulo certo e rode:
      python tools/build.py     # concatena src/*.js -> tw-manager.user.js
      python tools/check.py     # valida antes de publicar (o pre-commit ja roda)
  O Tampermonkey continua baixando o tw-manager.user.js gerado pelo mesmo RAW/@updateURL.
*/

(function () {
  'use strict';
  if (typeof window.game_data === 'undefined' || !window.game_data.village) return;

  // TRAVA DE INICIALIZACAO DUPLA — nao existia, e a ausencia e invisivel ate doer.
  //
  // Se o script roda duas vezes na mesma pagina (script instalado duas vezes no gestor,
  // iframe de mesma origem que tambem casa com game.php, ou reinjecao), voce fica com
  // DOIS paineis sobrepostos parecendo um, DOIS ouvintes em cada botao — um clique dispara
  // duas vezes — e DOIS conjuntos de temporizadores. Todas as requisicoes dobram, em
  // silencio. Foi assim que apareceu "ciclo iniciado" duas vezes com 1s de diferenca no log
  // do usuario, e 86 leituras de screen=place pra 43 aldeias.
  //
  // Roda so no documento de topo: dentro de iframe nao ha nada util a fazer.
  if (window.top !== window.self) return;
  if (window.__twMgrAtivo) { console.warn('[TWMgr] ja havia uma instancia nesta pagina — esta foi ignorada.'); return; }
  window.__twMgrAtivo = true;

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
  const FARM_DEF_ZERO_TTL_MS = 6 * 3600 * 1000;   // 'sem defesa' vale por 6h; 'tem defesa' nao expira
  const CARRY = { spear: 25, sword: 15, axe: 10, archer: 10, spy: 0, light: 80, marcher: 50, heavy: 50, ram: 0, catapult: 0, knight: 100, snob: 0 };
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
  // Nomes completos (não abreviados) como aparecem na tabela "Ainda não disponível" de screen=main —
  // diferente de BUILD_META.name, que é abreviado pra UI (ex.: "Ed. principal" vs "Edifício principal").
  const LOCKED_REQ_NAME_TO_KEY = {
    'Edifício principal': 'main', 'Quartel': 'barracks', 'Estábulo': 'stable', 'Oficina': 'garage',
    'Torre de vigia': 'watchtower', 'Academia': 'snob', 'Ferreiro': 'smith', 'Praça de reunião': 'place',
    'Estátua': 'statue', 'Mercado': 'market', 'Bosque': 'wood', 'Poço de argila': 'stone', 'Mina de ferro': 'iron',
    'Fazenda': 'farm', 'Armazém': 'storage', 'Esconderijo': 'hide', 'Muralha': 'wall',
  };
  const planToTpl = (plan) => (plan || []).map((it) => it.b + ' ' + it.lvl).join('\n');
  const ATK_TPL = 'main 15\nfarm 20\nstorage 20\nwood 15\nstone 15\niron 15\nsmith 10\nbarracks 10\nmarket 5\ngarage 5\nwood 20\nstone 20\niron 20\nfarm 24\nstorage 24\nmain 20\nstable 15\nbarracks 15\nmarket 10\ngarage 10\nwood 25\nstone 25\niron 25\nfarm 27\nstorage 27\nstable 20\nbarracks 20\nmarket 15\nwood 30\nstone 30\niron 30\nfarm 30\nstorage 30\nbarracks 25\nmarket 20';
  const DEF_TPL = 'main 15\nfarm 20\nstorage 20\nwood 15\nstone 15\niron 15\nsmith 5\nbarracks 10\nmarket 5\nstable 10\nwall 10\nwood 20\nstone 20\niron 20\nfarm 24\nstorage 24\nmain 20\nbarracks 15\nwall 15\nmarket 10\nwood 25\nstone 25\niron 25\nfarm 27\nstorage 27\nbarracks 20\nwall 20\nmarket 15\nwood 30\nstone 30\niron 30\nfarm 30\nstorage 30\nbarracks 25\nmarket 20';

  // ==================== OBRA — templates dos 5 perfis (Fazenda e Armazém NÃO entram aqui na
  // maioria dos perfis: são condicionais, decididos em tempo real por obraSpecialPriority(). O
  // Fast Nobre é exceção — quebra essa regra e sobe Armazém de forma proativa, por isso tem
  // "storage" embutido no template mesmo. Níveis finais e prioridades vieram direto da dicção do
  // usuário, guardada em memória (tw_village_building_plans.md). ====================
  // Regra do usuário (calibrada 2x): gap mais suave que a versão anterior. Perfis com Quartel como
  // prioridade: quando minas batem 15, Quartel já está em 18. Perfis com Estábulo como prioridade
  // (Farm ATK, Fast Nobre): quando minas batem 15, Estábulo está em 12 (bem mais discreto). Minas
  // sempre em trio sincronizado wood/stone/iron.
  const OBRA_TPL_FULL_ATK = 'main 3\nbarracks 1\nstatue 1\nsmith 5\nwood 3\nstone 3\niron 3\nbarracks 5\nwood 5\nstone 5\niron 5\nbarracks 10\nmain 6\nwood 8\nstone 8\niron 8\nstable 1\ngarage 1\nmarket 5\nwood 12\nstone 12\niron 12\nmain 10\nbarracks 18\nwood 15\nstone 15\niron 15\nstable 5\nmarket 10\nbarracks 20\nmain 12\nwood 20\nstone 20\niron 20\nmain 15\nstable 10\ngarage 2\nmarket 15\nbarracks 23\nmain 17\nwood 25\nstone 25\niron 25\nmain 20\nstable 15\nbarracks 25\nmarket 20\nwood 30\nstone 30\niron 30\nstable 20';
  const OBRA_TPL_FULL_DEF = 'main 3\nbarracks 1\nstatue 1\nsmith 5\nwood 3\nstone 3\niron 3\nbarracks 5\nwood 5\nstone 5\niron 5\nbarracks 10\nstable 1\nmain 6\nwood 8\nstone 8\niron 8\nmarket 5\nwood 12\nstone 12\niron 12\nmain 10\nbarracks 18\nwood 15\nstone 15\niron 15\nstable 5\nmarket 10\nbarracks 20\nwall 10\nmain 12\nwood 20\nstone 20\niron 20\nmain 15\nstable 10\nmarket 15\nbarracks 23\nmain 17\nwood 25\nstone 25\niron 25\nmain 20\nbarracks 25\nmarket 20\nwood 30\nstone 30\niron 30\nwall 15\nwall 20';
  const OBRA_TPL_FARM_ATK = 'main 3\nstable 1\nstatue 1\nsmith 5\nwood 3\nstone 3\niron 3\nstable 5\nwood 5\nstone 5\niron 5\nbarracks 1\nmain 6\nwood 8\nstone 8\niron 8\ngarage 1\nmarket 5\nwood 12\nstone 12\niron 12\nmain 10\nstable 12\nbarracks 10\nwood 15\nstone 15\niron 15\nmarket 10\nstable 15\nbarracks 15\nmain 12\nwood 20\nstone 20\niron 20\nmain 15\ngarage 2\nmarket 15\nstable 18\nbarracks 20\nmain 17\nwood 25\nstone 25\niron 25\nmain 20\nstable 20\nbarracks 23\nmarket 20\nwood 30\nstone 30\niron 30\nbarracks 25';
  const OBRA_TPL_FAST_DEF = 'main 3\nbarracks 1\nstatue 1\nsmith 5\nwood 3\nstone 3\niron 3\nbarracks 5\nwood 5\nstone 5\niron 5\nbarracks 10\nstable 1\nsmith 10\nmain 6\nwood 8\nstone 8\niron 8\nmarket 5\nwood 12\nstone 12\niron 12\nmain 10\nbarracks 18\nwood 15\nstone 15\niron 15\nstable 5\nmarket 10\nbarracks 20\nsmith 15\nwall 10\nmain 12\nwood 20\nstone 20\niron 20\nmain 15\nstable 10\nmarket 15\nbarracks 23\nmain 17\nwood 25\nstone 25\niron 25\nmain 20\nstable 15\nbarracks 25\nmarket 20\nwood 30\nstone 30\niron 30\nwall 15\nwall 20';
  const OBRA_TPL_FAST_NOBRE = 'main 3\nstable 1\nstatue 1\nsmith 5\nstorage 5\nwood 3\nstone 3\niron 3\nstable 5\nsmith 10\nwood 5\nstone 5\niron 5\nbarracks 1\nmain 6\nstorage 10\nsmith 15\nwood 8\nstone 8\niron 8\nmarket 5\nstorage 15\ngarage 1\nwood 12\nstone 12\niron 12\nstable 12\nbarracks 10\nsmith 20\nmain 10\nstorage 20\nwood 15\nstone 15\niron 15\nmarket 10\nstable 15\nbarracks 15\nmain 12\nwood 20\nstone 20\niron 20\nmain 15\nstorage 24\ngarage 2\nstable 18\nmain 17\nwood 25\nstone 25\niron 25\nmain 20\nsnob 1\nbarracks 20\nstorage 27\nstable 20\nwood 30\nstone 30\niron 30\nbarracks 25\nstorage 30';
  const OBRA_PROFILES = ['fullAtk', 'fullDef', 'farmAtk', 'fastDef', 'fastNobre'];
  const OBRA_PROFILE_META = {
    fullAtk:   { name: 'Full ATK',   tpl: OBRA_TPL_FULL_ATK,   storageProativo: false, priorityBuilding: 'barracks' },
    fullDef:   { name: 'Full DEF',   tpl: OBRA_TPL_FULL_DEF,   storageProativo: false, priorityBuilding: 'barracks' },
    farmAtk:   { name: 'Farm ATK',   tpl: OBRA_TPL_FARM_ATK,   storageProativo: false, priorityBuilding: 'stable' },
    fastDef:   { name: 'Fast DEF',   tpl: OBRA_TPL_FAST_DEF,   storageProativo: false, priorityBuilding: 'barracks' },
    fastNobre: { name: 'Fast Nobre', tpl: OBRA_TPL_FAST_NOBRE, storageProativo: true,  priorityBuilding: 'stable' },
  };

  const VERSION = '11.23.1';
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

  const defScav = () => ({
    running: false, nextAt: 0,
    units: { spear: true, sword: true, axe: true, light: true, heavy: true, knight: false },
    maxHours: 0,           // (johan) nenhum nivel de coleta com duracao acima disto e enviado. 0 = sem limite
    // Desbloqueio automático das coletas. Roda junto do ciclo de coleta, que já lê o
    // estado de todas as aldeias numa requisição só — então descobrir o que dá pra
    // desbloquear não custa requisição nenhuma a mais.
    autoUnlock: false,
    unlockAte: 4,          // desbloqueia até esta opção (1 Pequena … 4 Extrema)
    unlockPuxar: true,     // faltando recurso, puxa de outras aldeias imediatamente
    unlockReserva: 5000,   // a doadora nunca fica abaixo disto em cada recurso
    unlockMaxOrigens: 5,   // quantas aldeias no máximo contribuem por desbloqueio
    faltouRecurso: {},     // vid -> { nome, opcao, falta:{wood,stone,iron}, at } — o que travou
  });
  // Por cor: um modo único ('none'|'a'|'b'|'c') + qtd (só p/ a/b; C manda 1x).
  const defFarmMatrix = () => ({ greenEmpty: { mode: 'a', qty: 1 }, greenFull: { mode: 'b', qty: 1 }, yellowEmpty: { mode: 'none', qty: 1 }, yellowFull: { mode: 'none', qty: 1 }, blue: { mode: 'b', qty: 1 } });
  const FARM_COLORS = ['greenEmpty', 'greenFull', 'yellowEmpty', 'yellowFull', 'blue'];
  const defFarm = () => ({ running: false, nextAt: 0, interval: 600, minWood: 1000, minStone: 1000, minIron: 1000, maxDist: 13, maxWall: 20, blueMaxWall: 0, delay: 500, mode: 'suave', group: null, repeat: false, repeatMin: 10, minCL: 0, order: 'dist', dynTemplate: false, matrix: defFarmMatrix(), sentReports: {}, defended: {} });
  const defWall = () => ({ running: false, nextAt: 0, interval: 600, wallMin: 1, wallMax: 6, ramMode: 'auto', ramFixed: 20, ramWall6: 24, axeCount: 80, spyCount: 1, sentDemo: {} });
  const defRecruit = () => ({
    running: false, nextAt: 0, interval: 600, targetHours: 2, refillBelowMin: 30,
    groupAtk: null, groupDef: null, profiles: { atk: { targets: {} }, def: { targets: {} } }, overrides: {}, queueEst: {},
    groups: [],   // perfis adicionais livres: [{id, name, groupId, targets}] — além do ATK/DEF fixo
  });
  // Limite de fake do mundo: o ataque precisa de pop >= pontos_da_origem * FAKE_LIMIT_PCT%. Era o
  // ajuste "pct" do módulo Fakes; virou constante quando ele saiu (v11.16.0). Quem usa é o SAQUE,
  // pra não montar template que o jogo recusa. 1% é o valor deste mundo.
  const FAKE_LIMIT_PCT = 1;
  // Cada modo roda de forma INDEPENDENTE (pode ligar Equilíbrio e Solidário ao mesmo tempo, por
  // exemplo) — por isso running/nextAt/stats vivem por modo, dentro de "modes". Os campos de
  // configuração (destCoord, reserve, thresholdPct, solidario* etc.) continuam compartilhados no
  // nível de cima, porque são parâmetros de CADA modo específico, não estado de execução.
  const MARKET_MODES = ['cunhagem', 'equilibrio', 'solidario'];
  const MARKET_MODE_LABEL = { cunhagem: 'Cunhagem', equilibrio: 'Equilíbrio', solidario: 'Solidário' };
  const defMarketModeState = () => ({ running: false, nextAt: 0, stats: {}, stopAt: 0 });
  const defMarket = () => ({
    modes: { cunhagem: defMarketModeState(), equilibrio: defMarketModeState(), solidario: defMarketModeState() },
    interval: 600, destCoords: [], reserveWood: 0, reserveStone: 0, reserveIron: 0,
    cunhagemSourceGroups: [], cunhagemStopEnabled: false, cunhagemStopHours: 2, autoMint: false,
    thresholdPct: 50, maxDist: 15,
    groupSolidario: '', solidarioThresholdPct: 50, solidarioMaxDist: 20, solidarioDonorPct: 50, solidarioDonorMinPct: 50, solidarioGargaloKeepPct: 90, inflight: {},
  });
  // Construções = gerenciador no molde do "Gerente de conta → Construção" do jogo: N modelos nomeados
  // (templates) + atribuição POR ALDEIA (villages: vid -> {tpl, paused, coord, name, done, total}).
  // `plans` (atk/def) ficou só como semente da migração — quem manda agora é `templates`.
  const defBuild = () => ({ running: false, nextAt: 0, interval: 600, maxQueue: 5, plans: { atk: tplToPlan(ATK_TPL), def: tplToPlan(DEF_TPL) }, templates: {}, villages: {}, filterGroup: '', demand: {} });
  // Ordem sugerida de pesquisa pra quem nunca montou um modelo: explorador cedo (revela alvo pro
  // Saque), depois o pacote de ataque, depois defesa. É só um ponto de partida — o usuário reordena.
  const PESQ_ORDEM_PADRAO = ['spy', 'axe', 'light', 'ram', 'spear', 'sword', 'heavy', 'catapult'];
  // Pesquisa — modelos de PRIORIDADE (ordem de tropas) aplicados por aldeia, no molde do
  // "Gerente de conta → Pesquisa". Quando falta recurso, puxa da aldeia mais próxima que tenha
  // excedente (acima de feedReserve% do armazém dela), respeitando feedMaxDist campos.
  const defResearch = () => ({
    running: false, nextAt: 0, interval: 900,
    templates: {}, villages: {}, filterGroup: '',
    feedOn: true, feedReserve: 40, feedMaxDist: 20, feedFillPct: 60,
    blocked: {}, blockTtlH: 6,   // pesquisa recusada por requisito: nao insiste por N horas
    stats: {},
  });
  const defCaptcha = () => ({ enabled: true, browserNotif: true, ntfyTopic: '', cooldownSec: 300, lastNotifiedAt: 0, reloadMin: 0 });
  const defMap = () => ({
    running: false, nextAt: 0,
    cicloMin: 30,                         // intervalo entre ciclos (deixa de ser one-shot)
    maxDist: 20, minDaysSinceScout: 0,    // 0 = nunca reexplora quem já tem relatório com dados
    group: null,                          // grupo com aldeias de origem (vazio = todas)
    spyReserve: 30, spyCount: 5,          // guardar N spy por aldeia; enviar N spy por bárbaro
    minPoints: 26, maxPoints: 5000,
    maxPerVillage: 20, delay: 500,
    onlyBarbarians: true,
    sentAt: {},                           // vid do bárbaro -> timestamp do último scout nosso
    lastPreview: [],                      // lista mostrada na tabela
    // ── Conhecimento acumulado ──────────────────────────────────────────────────
    barbConhecidos: {},                   // vid -> quando vi pela primeira vez (detecta bárbaro NOVO)
    ultimoMapaAt: 0,                      // quando recarreguei village.txt pela última vez
    // ── Blacklists ──────────────────────────────────────────────────────────────
    // Perda: o assistente pinta de VERMELHO o último saque em que se perdeu tropa. Sai
    // sozinha quando aparecer relatório verde, amarelo ou azul.
    blacklistPerda: {},                   // coord -> { at, vid, pts }
    // Defesa: o relatório de exploração mostrou tropa defensiva. Não sai sozinha.
    blacklistDefesa: {},                  // coord -> { at, vid, pts, defTotal, removido }
    relatoriosLidos: {},                  // reportId -> 1 (pra não reler o mesmo relatório)
    // COBERTURA DE EXPLORAÇÃO, guardada de forma compacta pra caber no localStorage:
    // coord -> código. É o que responde "até onde eu já enxerguei" quando desenhado no mapa.
    // Sem isto o conhecimento morria no fim de cada ciclo e a tela nunca via.
    intel: {},                            // "500|600" -> 1..6 (ver MAP_INTEL)
    intelAt: 0,                           // quando foi atualizado pela última vez
    defesaMin: 1,                         // a partir de quantas unidades de defesa entra na lista
    removerDoAssistente: false,           // apagar os relatórios no jogo (irreversível) — ver nota
  });
  const defLock = () => ({
    running: false, nextAt: 0,
    maxDist: 10, minPoints: 500, interval: 1800,   // raio em campos (X), pontos mín. (Y), reciclo em segundos (30min padrão)
    reserved: {},                          // vid do bárbaro -> timestamp de quando O SCRIPT travou (nunca destrava sozinho)
    stats: {},
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
  const defBlindagem = () => ({
    threadUrl: '',        // URL do tópico do fórum da tribo com a tabela de pedidos
    rows: [],             // [{ id, num, name, coord, x, y, ped:{LANC,ESP,SPY,CP}, originVid, send:{LANC,ESP,SPY,CP}, checked }]
    lastFetch: 0,         // ms do último fetch bem-sucedido
  });
  const defPlanner = () => ({
    attacks: [defPlannerAttack('Ataque 1')], // vários ataques independentes, cada um pode ser armado por conta própria
    activeId: null,                        // id do ataque mostrado na UI (setado no load())
    templates: [],                         // templates salvos { id, name, targetX, targetY, arriveLocal, selected, perVillage }
    blindagem: defBlindagem(),             // sub-módulo: pedidos de blindagem da tribo
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
  const defDesviar = () => ({
    keepSpy: true,        // deixar exploradores em casa (pra farmar/monitorar)
    keepKnight: false,    // deixar paladino
    sendBeforeMs: 30000,  // sair de casa N ms ANTES do primeiro ataque marcado
    cancelOffsetMs: 5000, // cancelar N ms APÓS o ÚLTIMO ataque marcado
    // Ataques marcados pra desviar. Marcar NÃO envia: o envio é agendado.
    // [{ id, coord, vid, arriveAt }]
    marks: [],
    pending: [],          // [{ id, vid, coordOrigem, supportVid, supportCoord, cmdId, sendAt, cancelAt, ultimoAtaque, state, err }]
  });
  const defMapUi = () => ({
    // Filtros visuais persistidos entre visitas ao screen=map
    collapsed: false,          // painel colapsado?
    show: {
      mine: true,              // aldeias próprias
      tribe: true,             // aliadas da minha tribo
      enemy: true,             // outros jogadores (fora da tribo)
      barb: true,              // bárbaros
    },
    pointsMin: 0,              // filtro min de pontos (0 = sem mínimo)
    pointsMax: 0,              // filtro max (0 = sem máximo)
    showBadge: true,           // exibir badge de pontos em cada aldeia
    showIntel: true,           // exibir ⚠ (defesa conhecida) e ⛰N (muralha) baseado em farm.defended
    showReservations: true,    // exibir ⌛Xh nas aldeias reservadas pela tribo
    showCobertura: true,       // moldura colorida por estado de exploração (base do módulo Mapa)
    showRange: false,          // área alcançada pelo raio do módulo Mapa, em volta das suas aldeias
    dimMode: 'off',            // 'off' (sem escurecer) | 'dim' (bloco preto sobre filtradas)
    dimOpacity: 0.15,          // opacidade das aldeias filtradas (só usado quando dimMode = 'dim')
    reservations: {},          // { [coord]: { at, expiresAt, playerName } } — sync manual
    reservationsAt: 0,         // ms do último sync manual
    dataCachedAt: 0,           // ms do último load do village.txt
  });
  const defPaladin = () => ({
    running: false,
    villages: {},          // { [vid]: true } — 1ª entrada: quais aldeias ficam no ciclo de treino
    checkIntervalMin: 240, // 2ª entrada: intervalo do check periódico (padrão 4h em minutos)
    sendDelayMs: 500,      // 3ª entrada: delay entre envios sucessivos (não manda todos de uma vez)
    state: {},             // { [vid]: { knightId, name, level, status, finishAt } } — cache p/ UI
  });
  // Central de Comando — núcleo de precisão. O bloco de código dela fica no FIM do
  // arquivo; só o default mora aqui, porque def() roda no carregamento.
  const defCC = () => ({
    fila: [],               // comandos agendados (sobrevivem a F5)
    biasMs: 0,              // latência aprendida (modo adaptativo)
    rttMs: 0,               // última mediana de ida-e-volta medida (só exibição)
    manterAcordado: true,   // oscilador silencioso: impede o Chrome de estrangular a aba
    afericoes: [],          // histórico de erro medido (últimas 50)
    // Os quatro abaixo são o painel de precisão do Nexus, e existem porque não há
    // resposta universal: cada conexão pede um ajuste. Antes eu tinha isto tudo como
    // constante fixa no código, sem escape nenhum se o estimador errasse.
    modo: 'adaptativo',     // 'fixo' (você digita a latência) | 'adaptativo' (ele mede)
    offsetFixoMs: 0,        // usado no modo fixo
    estilo: 'estavel',      // 'responsivo' (reage rápido) | 'estavel' (ignora variação curta)
    maxCorrecaoMs: 1000,    // acima disto o erro é tratado como defeito e ignorado
    ondaGapMs: 50,          // espaçamento padrão entre comandos de uma onda
  });
  // Etiqueta (johan) — usa o botao nativo "Etiqueta" da tela de ataques recebidos, que
  // faz o SERVIDOR adivinhar a unidade mais lenta pelo tempo de viagem restante. Quanto
  // mais cedo depois do envio, mais precisa a adivinhacao — dai o ciclo curto.
  const defEtiqueta = () => ({
    running: false,
    intervalMin: 2,
    lastCount: 0,
    jaEnviados: {},   // id do comando -> 1. Sem isto ele reenviava TODOS a cada ciclo.
    recuoAte: 0,      // 429: nao tenta antes disto
    recuoMs: 0,       // recuo atual, dobra a cada 429
  });
  const defObra = () => ({
    running: false,
    groups: { fullAtk: null, fullDef: null, farmAtk: null, fastDef: null, fastNobre: null },   // grupo nativo do TW -> perfil
    interval: 600,          // seg. entre ciclos (padrão 10 min)
    maxQueue: 5,            // fila de construção máx. por aldeia
    reserveMin: 0,          // reserva mín. de cada recurso antes de construir — 0 = desliga; usar pra sobrar recurso pro Recrutar
    farmFreePopMin: 800,    // gatilho Fazenda: só upa quando população livre (max-atual) cai abaixo disso
    storageFillPct: 60,     // gatilho Armazém: só upa quando algum recurso atinge X% da capacidade (Fast Nobre ignora, é proativo)
    autoResearch: true,     // pesquisa automática no Ferreiro, seguindo a ordem de OBRA_RESEARCH_ORDER por perfil
    plans: {
      fullAtk: tplToPlan(OBRA_TPL_FULL_ATK), fullDef: tplToPlan(OBRA_TPL_FULL_DEF), farmAtk: tplToPlan(OBRA_TPL_FARM_ATK),
      fastDef: tplToPlan(OBRA_TPL_FAST_DEF), fastNobre: tplToPlan(OBRA_TPL_FAST_NOBRE),
    },
    nextAt: 0,
    demand: {},              // { [vid]: { b, cost, coord, profile } }
  });
  const def = () => ({ targets: [], reloadAfterSend: true, running: false, scav: defScav(), farm: defFarm(), recruit: defRecruit(), market: defMarket(), build: defBuild(), research: defResearch(), map: defMap(), captcha: defCaptcha(), planner: defPlanner(), units: defUnits(), desviar: defDesviar(), mapUi: defMapUi(), paladin: defPaladin(), cc: defCC(), obra: defObra(), etiqueta: defEtiqueta(), reservations: {} });
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
    if (typeof c.scav.autoUnlock !== 'boolean') c.scav.autoUnlock = false;
    if (typeof c.scav.unlockAte !== 'number' || c.scav.unlockAte < 1 || c.scav.unlockAte > 4) c.scav.unlockAte = 4;
    if (typeof c.scav.unlockPuxar !== 'boolean') c.scav.unlockPuxar = true;
    if (typeof c.scav.unlockReserva !== 'number' || c.scav.unlockReserva < 0) c.scav.unlockReserva = 5000;
    if (typeof c.scav.unlockMaxOrigens !== 'number' || c.scav.unlockMaxOrigens < 1) c.scav.unlockMaxOrigens = 5;
    if (!c.scav.faltouRecurso) c.scav.faltouRecurso = {};
    if (!c.scav.units) c.scav.units = defScav().units;
    if (c.scav.maxHours == null) c.scav.maxHours = 0;
    if (!c.farm) c.farm = defFarm();
    if (!c.farm.sentReports) c.farm.sentReports = {};
    if (c.farm.maxDist == null) c.farm.maxDist = 13;
    if (c.farm.maxWall == null) c.farm.maxWall = 20;
    if (c.farm.blueMaxWall == null) c.farm.blueMaxWall = 0;
    if (c.farm.delay == null) c.farm.delay = 500;
    // limpa campos de aríete que ficaram no farm em versões antigas (migraram pro Quebra-muralha)
    delete c.farm.ramMode; delete c.farm.ramFixed; delete c.farm.ramWall6; delete c.farm.axeCount;
    // v9.55.0: removido - script nunca mais apaga relatorio automaticamente
    delete c.farm.blueDeleteMinDef;
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
    if (!Array.isArray(c.recruit.groups)) c.recruit.groups = [];
    if (c.recruit.targetHours == null) c.recruit.targetHours = 2;
    if (c.recruit.refillBelowMin == null) c.recruit.refillBelowMin = 30;
    if (c.recruit.interval == null) c.recruit.interval = 600;
    if (!c.market) c.market = defMarket();
    // Migração: cada modo era mutuamente exclusivo (1 running/nextAt/mode pro Mercado inteiro).
    // Agora cada modo tem seu próprio estado — se o usuário tinha um modo ligado, esse modo
    // específico continua ligado depois da migração; os outros nascem desligados.
    if (!c.market.modes) {
      const wasRunning = !!c.market.running, activeMode = c.market.mode || 'cunhagem';
      c.market.modes = {};
      MARKET_MODES.forEach((k) => { c.market.modes[k] = defMarketModeState(); });
      if (wasRunning && c.market.modes[activeMode]) { c.market.modes[activeMode].running = true; c.market.modes[activeMode].nextAt = c.market.nextAt || 0; }
      if (c.market.stats) c.market.modes[activeMode].stats = c.market.stats;
      delete c.market.running; delete c.market.mode; delete c.market.nextAt; delete c.market.stats;
    }
    MARKET_MODES.forEach((k) => { if (!c.market.modes[k]) c.market.modes[k] = defMarketModeState(); });
    if (c.market.modes.cunhar) delete c.market.modes.cunhar;
    // Migração: Cunhagem trocou coordenada única + checkbox + reserva única por grupos do
    // TW + múltiplos destinos + reserva por recurso, e absorveu o antigo modo "Cunhar" (agora
    // é o toggle "cunhagem automática"). Não dá pra converter checkbox -> grupo automaticamente,
    // então as seleções antigas de origem somem e o usuário precisa escolher os grupos de novo.
    if (!Array.isArray(c.market.destCoords)) {
      c.market.destCoords = c.market.destCoord ? [c.market.destCoord] : [];
      const oldReserve = c.market.reserve || 0;
      c.market.reserveWood = oldReserve; c.market.reserveStone = oldReserve; c.market.reserveIron = oldReserve;
      c.market.cunhagemSourceGroups = [];
      c.market.cunhagemStopEnabled = false; c.market.cunhagemStopHours = 2; c.market.autoMint = false;
      if (c.market.sources || c.market.mintSources) pushLog('Cunhagem foi reformulada (grupos + múltiplos destinos) — configure as origens de novo na aba Mercado.', '', 'market');
      delete c.market.destCoord; delete c.market.reserve; delete c.market.sources; delete c.market.mintSources;
    }
    if (c.market.cunhagemExcludeGroups) delete c.market.cunhagemExcludeGroups;   // feature removida: grupos excluídos
    if (c.market.interval == null) c.market.interval = 600;
    if (c.market.reserveWood == null) c.market.reserveWood = 0;
    if (c.market.reserveStone == null) c.market.reserveStone = 0;
    if (c.market.reserveIron == null) c.market.reserveIron = 0;
    if (!Array.isArray(c.market.cunhagemSourceGroups)) c.market.cunhagemSourceGroups = [];
    if (c.market.cunhagemStopEnabled == null) c.market.cunhagemStopEnabled = false;
    if (c.market.cunhagemStopHours == null) c.market.cunhagemStopHours = 2;
    if (c.market.autoMint == null) c.market.autoMint = false;
    if (c.market.thresholdPct == null) c.market.thresholdPct = 50;
    if (c.market.maxDist == null) c.market.maxDist = 15;
    if (c.market.groupSolidario == null) c.market.groupSolidario = '';
    if (c.market.solidarioThresholdPct == null) c.market.solidarioThresholdPct = 50;
    if (c.market.solidarioMaxDist == null) c.market.solidarioMaxDist = 20;
    if (c.market.solidarioDonorPct == null) c.market.solidarioDonorPct = 50;
    if (c.market.solidarioDonorMinPct == null) c.market.solidarioDonorMinPct = 50;
    if (c.market.solidarioGargaloKeepPct == null) c.market.solidarioGargaloKeepPct = 90;
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
    // Migração v11.14 — modelos nomeados + atribuição por aldeia. Os planos ATK/DEF viram os dois
    // primeiros modelos ("Ofensiva"/"Defensiva"), então quem atualiza não perde a lista que montou.
    const sanPlan = (p) => (p || []).filter((it) => it && BUILD_META[it.b]).map((it) => ({ b: it.b, lvl: Math.max(1, Math.min(BUILD_META[it.b].max, parseInt(it.lvl, 10) || 1)), en: it.en !== false }));
    if (!c.build.templates || typeof c.build.templates !== 'object') c.build.templates = {};
    if (!Object.keys(c.build.templates).length) {
      c.build.templates = { atk: { name: 'Ofensiva', plan: c.build.plans.atk.slice() }, def: { name: 'Defensiva', plan: c.build.plans.def.slice() } };
    }
    Object.keys(c.build.templates).forEach((id) => {
      const t = c.build.templates[id];
      if (!t || typeof t !== 'object') { delete c.build.templates[id]; return; }
      t.name = String(t.name || id).slice(0, 40);
      t.plan = sanPlan(t.plan);
    });
    // Atribuições órfãs (modelo apagado) somem sozinhas — evita aldeia presa num modelo inexistente.
    if (!c.build.villages || typeof c.build.villages !== 'object') c.build.villages = {};
    Object.keys(c.build.villages).forEach((vid) => {
      const a = c.build.villages[vid];
      if (!a || typeof a !== 'object' || !c.build.templates[a.tpl]) { delete c.build.villages[vid]; return; }
      a.paused = !!a.paused;
    });
    if (c.build.filterGroup == null) c.build.filterGroup = '';
    delete c.build.atkTpl; delete c.build.defTpl;
    if (!c.research) c.research = defResearch();
    if (!c.research.templates || typeof c.research.templates !== 'object') c.research.templates = {};
    if (!Object.keys(c.research.templates).length) c.research.templates = { padrao: { name: 'Padrão', order: PESQ_ORDEM_PADRAO.slice() } };
    Object.keys(c.research.templates).forEach((id) => {
      const t = c.research.templates[id];
      if (!t || typeof t !== 'object') { delete c.research.templates[id]; return; }
      t.name = String(t.name || id).slice(0, 40);
      // só tropa que existe neste mundo, sem repetida (a ordem é uma lista de prioridade, não um multiset)
      const vistas = {};
      t.order = (Array.isArray(t.order) ? t.order : []).filter((u) => UNITS.some((x) => x[0] === u) && !vistas[u] && (vistas[u] = 1));
    });
    if (!c.research.villages || typeof c.research.villages !== 'object') c.research.villages = {};
    Object.keys(c.research.villages).forEach((vid) => {
      const a = c.research.villages[vid];
      if (!a || typeof a !== 'object' || !c.research.templates[a.tpl]) { delete c.research.villages[vid]; return; }
      a.paused = !!a.paused;
    });
    if (c.research.filterGroup == null) c.research.filterGroup = '';
    if (c.research.interval == null) c.research.interval = 900;
    if (c.research.feedOn == null) c.research.feedOn = true;
    if (c.research.feedReserve == null) c.research.feedReserve = 40;
    if (c.research.feedMaxDist == null) c.research.feedMaxDist = 20;
    if (c.research.feedFillPct == null) c.research.feedFillPct = 60;
    if (!c.research.blocked || typeof c.research.blocked !== 'object') c.research.blocked = {};
    if (c.research.blockTtlH == null) c.research.blockTtlH = 6;
    // Bloqueio de aldeia que saiu da gestão não serve pra nada e cresceria pra sempre.
    Object.keys(c.research.blocked).forEach((vid) => { if (!c.research.villages[vid]) delete c.research.blocked[vid]; });
    if (!c.map) c.map = defMap();
    // Reformulação do Mapa: de one-shot pra ciclo contínuo, com base de conhecimento e
    // blacklists. Campos novos entram sem apagar o que já existe.
    if (typeof c.map.cicloMin !== 'number' || c.map.cicloMin < 5) c.map.cicloMin = 30;
    if (!c.map.barbConhecidos) c.map.barbConhecidos = {};
    if (!c.map.blacklistPerda) c.map.blacklistPerda = {};
    if (!c.map.blacklistDefesa) c.map.blacklistDefesa = {};
    if (!c.map.relatoriosLidos) c.map.relatoriosLidos = {};
    if (typeof c.map.defesaMin !== 'number' || c.map.defesaMin < 1) c.map.defesaMin = 1;
    if (typeof c.map.removerDoAssistente !== 'boolean') c.map.removerDoAssistente = false;
    if (typeof c.map.ultimoMapaAt !== 'number') c.map.ultimoMapaAt = 0;
    // A regra passou a ser "tenho ou não tenho informação". A idade do relatório vira
    // reexploração OPCIONAL, desligada por padrão — quem tinha 2 dias configurado mantém.
    if (typeof c.map.minDaysSinceScout !== 'number') c.map.minDaysSinceScout = 0;
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
    if (!c.etiqueta) c.etiqueta = defEtiqueta();
    if (c.etiqueta.intervalMin == null) c.etiqueta.intervalMin = 2;
    if (c.etiqueta.lastCount == null) c.etiqueta.lastCount = 0;
    if (!c.etiqueta.jaEnviados) c.etiqueta.jaEnviados = {};
    // O registro de "ja enviados" foi envenenado ate a v11.2.6: a validacao aprovava
    // qualquer resposta, entao comandos NAO etiquetados eram marcados como feitos e nunca
    // mais seriam tentados. Zera uma vez.
    if (c.etiqueta.limpezaVer !== 2) { c.etiqueta.limpezaVer = 2; c.etiqueta.jaEnviados = {}; }
    if (c.etiqueta.recuoAte == null) c.etiqueta.recuoAte = 0;
    if (c.etiqueta.recuoMs == null) c.etiqueta.recuoMs = 0;
    if (c.etiqueta.intervalMin < 2) c.etiqueta.intervalMin = 2;
    if (!c.lock) c.lock = defLock();
    if (c.lock.maxDist == null) c.lock.maxDist = 10;
    if (c.lock.minPoints == null) c.lock.minPoints = 500;
    if (c.lock.interval == null) c.lock.interval = 1800;
    if (!c.lock.reserved) c.lock.reserved = {};
    if (!c.captcha) c.captcha = defCaptcha();
    if (c.captcha.enabled == null) c.captcha.enabled = true;
    if (c.captcha.browserNotif == null) c.captcha.browserNotif = true;
    if (c.captcha.ntfyTopic == null) c.captcha.ntfyTopic = '';
    if (c.captcha.cooldownSec == null) c.captcha.cooldownSec = 300;
    if (c.captcha.reloadMin == null) c.captcha.reloadMin = 0;
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
    if (!c.cc) c.cc = defCC();
    if (!Array.isArray(c.cc.fila)) c.cc.fila = [];
    if (!Array.isArray(c.cc.afericoes)) c.cc.afericoes = [];
    if (typeof c.cc.biasMs !== 'number' || !isFinite(c.cc.biasMs)) c.cc.biasMs = 0;
    if (typeof c.cc.rttMs !== 'number' || !isFinite(c.cc.rttMs)) c.cc.rttMs = 0;
    if (typeof c.cc.manterAcordado !== 'boolean') c.cc.manterAcordado = true;
    if (c.cc.modo !== 'fixo' && c.cc.modo !== 'adaptativo') c.cc.modo = 'adaptativo';
    if (c.cc.estilo !== 'responsivo' && c.cc.estilo !== 'estavel') c.cc.estilo = 'estavel';
    if (typeof c.cc.offsetFixoMs !== 'number' || !isFinite(c.cc.offsetFixoMs)) c.cc.offsetFixoMs = 0;
    if (typeof c.cc.maxCorrecaoMs !== 'number' || c.cc.maxCorrecaoMs < 100) c.cc.maxCorrecaoMs = 1000;
    if (typeof c.cc.ondaGapMs !== 'number' || c.cc.ondaGapMs < 100) c.cc.ondaGapMs = 100;
    // Até a 10.22.0 a conferência casava vários comandos com a MESMA linha de chegada e
    // produzia erros inventados — que foram direto pro estimador. O viés aprendido antes
    // desta versão não vale nada; zera uma vez e recomeça com dado limpo.
    if (c.cc.calibVer !== 2) {
      c.cc.calibVer = 2; c.cc.biasMs = 0; c.cc.nReal = 0; c.cc.afericoes = [];
      (c.cc.fila || []).forEach((x) => { x.erroRealMs = null; x.chegadaReal = null; x.tentativasConf = 0; });
    }
    if (!c.planner.blindagem) c.planner.blindagem = defBlindagem();
    if (typeof c.planner.blindagem.threadUrl !== 'string') c.planner.blindagem.threadUrl = '';
    if (!Array.isArray(c.planner.blindagem.rows)) c.planner.blindagem.rows = [];
    if (c.planner.blindagem.lastFetch == null) c.planner.blindagem.lastFetch = 0;
    if (!c.reservations || typeof c.reservations !== 'object') c.reservations = {};
    if (!c.units) c.units = defUnits();
    if (!c.units.history || typeof c.units.history !== 'object') c.units.history = {};
    if (c.units.historyDays == null) c.units.historyDays = 90;
    if (!c.desviar) c.desviar = defDesviar();
    if (c.desviar.keepSpy == null) c.desviar.keepSpy = true;
    if (c.desviar.keepKnight == null) c.desviar.keepKnight = false;
    if (c.desviar.cancelOffsetMs == null) c.desviar.cancelOffsetMs = 5000;
    if (!Array.isArray(c.desviar.pending)) c.desviar.pending = [];
    if (!c.mapUi) c.mapUi = defMapUi();
    if (typeof c.mapUi.collapsed !== 'boolean') c.mapUi.collapsed = false;
    if (!c.mapUi.show || typeof c.mapUi.show !== 'object') c.mapUi.show = defMapUi().show;
    ['mine','tribe','enemy','barb'].forEach((k) => { if (typeof c.mapUi.show[k] !== 'boolean') c.mapUi.show[k] = true; });
    if (c.mapUi.pointsMin == null) c.mapUi.pointsMin = 0;
    if (c.mapUi.pointsMax == null) c.mapUi.pointsMax = 0;
    if (typeof c.mapUi.showBadge !== 'boolean') c.mapUi.showBadge = true;
    if (typeof c.mapUi.showIntel !== 'boolean') c.mapUi.showIntel = true;
    if (typeof c.mapUi.showReservations !== 'boolean') c.mapUi.showReservations = true;
    if (typeof c.mapUi.showCobertura !== 'boolean') c.mapUi.showCobertura = true;
    if (typeof c.mapUi.showRange !== 'boolean') c.mapUi.showRange = false;
    if (c.mapUi.dimMode !== 'off' && c.mapUi.dimMode !== 'dim') c.mapUi.dimMode = 'off';
    if (c.mapUi.dimOpacity == null) c.mapUi.dimOpacity = 0.15;
    if (!c.mapUi.reservations || typeof c.mapUi.reservations !== 'object') c.mapUi.reservations = {};
    if (c.mapUi.reservationsAt == null) c.mapUi.reservationsAt = 0;
    if (c.mapUi.dataCachedAt == null) c.mapUi.dataCachedAt = 0;
    if (!c.paladin) c.paladin = defPaladin();
    if (!c.paladin.villages || typeof c.paladin.villages !== 'object') c.paladin.villages = {};
    if (c.paladin.checkIntervalMin == null) c.paladin.checkIntervalMin = 240;
    if (c.paladin.sendDelayMs == null) c.paladin.sendDelayMs = 500;
    if (!c.paladin.state || typeof c.paladin.state !== 'object') c.paladin.state = {};
    if (!c.obra) c.obra = defObra();
    if (!c.obra.groups || typeof c.obra.groups !== 'object') c.obra.groups = defObra().groups;
    OBRA_PROFILES.forEach((p) => { if (c.obra.groups[p] === undefined) c.obra.groups[p] = null; });
    if (c.obra.interval == null) c.obra.interval = 600;
    if (c.obra.maxQueue == null) c.obra.maxQueue = 5;
    if (c.obra.reserveMin == null) c.obra.reserveMin = 0;
    if (c.obra.farmFreePopMin == null) c.obra.farmFreePopMin = 800;
    if (c.obra.storageFillPct == null) c.obra.storageFillPct = 60;
    if (c.obra.autoResearch == null) c.obra.autoResearch = true;
    if (!c.obra.plans) c.obra.plans = {};
    OBRA_PROFILES.forEach((p) => { if (!Array.isArray(c.obra.plans[p]) || !c.obra.plans[p].length) c.obra.plans[p] = tplToPlan(OBRA_PROFILE_META[p].tpl); });
    if (!c.obra.demand || typeof c.obra.demand !== 'object') c.obra.demand = {};
    (c.targets || []).forEach((t) => { if (!t.origin) { t.origin = CUR_VID; t.originName = CUR_NAME; } });
    return c;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(config)); }

  let config = load();
  let sendTimer = null, scavTimer = null, farmTimer = null, wallTimer = null, recruitTimer = null, buildTimer = null, researchTimer = null, mapTimer = null, plannerTimer = null, paladinTimer = null, obraTimer = null, uiTimer = null, lockTimer = null, etiquetaTimer = null;
  const marketTimers = { cunhagem: null, equilibrio: null, solidario: null, cunhar: null };   // 1 timer por modo — rodam de forma independente
  let _farmZeroStreak = 0, _farmEverSent = false;   // Saque parou de enviar (detecção de bloqueio/bot-check p/ alerta AFK)
  const paladinPreciseTimers = {};   // vid -> { id: setTimeout, finishAt } — timer de precisão (duração+30s) por aldeia
  function anyMarketRunning() { return !!(config.market && config.market.modes && MARKET_MODES.some((k) => config.market.modes[k] && config.market.modes[k].running)); }
  function anyRunning() { return config.running || (config.scav && config.scav.running) || (config.farm && config.farm.running) || (config.wall && config.wall.running) || (config.recruit && config.recruit.running) || anyMarketRunning() || (config.build && config.build.running) || (config.research && config.research.running) || (config.map && config.map.running) || (config.planner && config.planner.attacks && config.planner.attacks.some((a) => a.running)) || (config.paladin && config.paladin.running) || ((config.cc && config.cc.fila) || []).some((c) => c.state === 'armado' || c.state === 'preparado' || c.state === 'disparando') || (config.obra && config.obra.running) || (config.lock && config.lock.running) || (config.etiqueta && config.etiqueta.running) || _ocupadoAvulso > 0; }
  // Desviar e Blindagem rodam por clique e não têm flag `running` — ficavam fora do anyRunning(),
  // então a trava de aba (12s) expirava no meio deles e outra aba assumia enquanto o apoio estava
  // sendo montado. Quem faz trabalho avulso marca aqui.
  let _ocupadoAvulso = 0;
  async function ocupado(fn) { _ocupadoAvulso++; try { return await fn(); } finally { _ocupadoAvulso--; } }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function readLock() { try { return JSON.parse(localStorage.getItem(LOCKKEY) || 'null'); } catch (e) { return null; } }
  function lockOther() { const l = readLock(); return !!(l && l.id !== TAB_ID && (Date.now() - l.ts) < 12000); }
  function claimLock() { localStorage.setItem(LOCKKEY, JSON.stringify({ id: TAB_ID, ts: Date.now() })); }
  // Guarda para DENTRO dos laços longos. Os ciclos duram de 1 a 10 minutos e até aqui nada era
  // reconferido depois da entrada do tick — com três consequências:
  //   1. o botão Parar não parava: apagava a flag, mas o laço não a lia e seguia enviando;
  //   2. a trava de aba (12s) expirava no meio e a outra aba passava a enviar junto, porque a
  //      renovação depende do tickUI de 1s, que o Chrome estrangula em aba de fundo;
  //   3. o bot-check só era visto na entrada; aparecendo no minuto 2 de um ciclo de 8, o laço
  //      continuava martelando o servidor.
  // Chamar no topo de cada iteração: `if (devoParar('farm')) break;`
  // Renova a trava de brinde — quem está trabalhando é quem deve segurá-la.
  function devoParar(mod) {
    if (mod) {
      const c = config[mod];
      if (mod === 'planner') { if (!(config.planner.attacks || []).some((a) => a.running)) return 'parado pelo usuário'; }
      else if (c && c.running === false) return 'parado pelo usuário';
    }
    if (lockOther()) return 'outra aba assumiu';
    if (captchaBlocked()) return 'bot-check na tela';
    // A Central tem prioridade: um disparo de precisão não pode disputar a rede nem a
    // trava com um ciclo de saque. Os laços longos param e retomam no tick seguinte.
    if (mod !== 'cc' && ccJanelaCritica()) return 'Central disparando';
    claimLock();
    return null;
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pushLog(msg, kind, mod) {
    let arr = []; try { arr = JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch (e) {}
    arr.unshift({ t: new Date().toLocaleTimeString(), m: msg, k: kind || '', mod: mod || '' });
    localStorage.setItem(LOGKEY, JSON.stringify(arr.slice(0, 200)));
    renderLog();
    if (mod) renderModLog(mod);
  }
  // Limpa "linhas vivas" gravadas por versões anteriores: até a 9.99.0 a barra de progresso morava no
  // log e podia ficar congelada se a página recarregasse no meio do ciclo. Agora a barra vive na aba
  // do módulo; isto fica só pra faxina de quem está atualizando.
  function closeStaleLiveLogs() {
    let arr = []; try { arr = JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch (e) { return; }
    const mods = {};
    let n = 0;
    arr.forEach((l) => {
      if (!l.live) return;
      l.live = false; l.k = 'err'; n++;
      l.m = 'Ciclo interrompido antes de terminar (página recarregada?).';
      if (l.mod) mods[l.mod] = 1;
    });
    if (!n) return;
    localStorage.setItem(LOGKEY, JSON.stringify(arr));
    renderLog();
    Object.keys(mods).forEach(renderModLog);
  }
  function logLineHTML(l) {
    const c = l.k === 'err' ? '#c0483a' : l.k === 'ok' ? '#2e7d3a' : '#6f6153';
    return '<div style="color:' + c + ';border-bottom:1px solid rgba(0,0,0,.07);padding:2px 0">[' + esc(l.t) + '] ' + esc(l.m) + '</div>';
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
    if (body) body.innerHTML = rows.length ? rows.map(logLineHTML).join('') : '<div style="color:#8a7d6d;padding:6px;font-size:10px">— sem mensagens ainda —</div>';
  }

  // ===== Cards de status por módulo =====
  function fmtN(n) { return (n == null) ? '—' : Number(n).toLocaleString('pt-BR'); }
  function renderCards(mod, arr) {
    const box = document.getElementById('twmgr-cards-' + mod); if (!box) return;
    box.innerHTML = arr.map((c) =>
      (c.br ? '<div class="twmgr-card-break"></div>' : '') +
      '<div class="twmgr-card-mini' + (c.wide ? ' twmgr-card-wide' : '') + (c.hl ? ' twmgr-card-hl' : '') + '"><div class="twmgr-card-v">' + (c.v == null ? '—' : c.v) + '</div><div class="twmgr-card-l">' + c.l + '</div></div>'
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
        // A/B/C num card só: são três números pequenos e secundários: em cards separados ocupavam uma
        // linha inteira de 3 cards grandes e roubavam o destaque do "saques ativos".
        { v: fmtN(s.a) + ' / ' + fmtN(s.b) + ' / ' + fmtN(s.c), l: 'A / B / C' },
        { v: fmtN(lt.today), l: 'saqueado hoje', br: true },
        { v: fmtN(lt.estimate), l: 'estimativa fim do dia' },
      ];
    } else if (mod === 'wall') {
      const s = (config.wall.stats || {});
      arr = [
        { v: fmtN(s.pending), l: 'aldeias p/ quebrar muralha', hl: true },
        { v: fmtN(s.active), l: 'quebras a caminho' },
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
      arr = [{ v: fmtN(s.villages), l: 'aldeias recrutando', hl: true }, { v: fmtN(s.metas), l: 'atingiram a meta' }];
    } else if (mod === 'build') {
      const s = (config.build.stats || {}), as = config.build.villages || {};
      const pausadas = Object.keys(as).filter((v) => as[v].paused).length;
      arr = [{ v: fmtN(s.villages), l: 'aldeias construindo', hl: true }, { v: fmtN(pausadas), l: 'pausadas' }];
    } else if (mod === 'research') {
      const s = (config.research && config.research.stats) || {};
      arr = [
        { v: fmtN(s.villages), l: 'aldeias pesquisando', hl: true },
        { v: fmtN(s.completas), l: 'modelo completo' },
        { v: fmtN(s.andando), l: 'pesquisa em curso' },
        { v: fmtN(s.abastecidas), l: 'abastecidas (últ. ciclo)' },
      ];
    } else if (mod === 'map') {
      const s = (config.map.stats || {});
      // O card "no alcance" mostrava s.mapped, que é barbCount: os bárbaros do MUNDO INTEIRO que
      // passam no filtro de PONTOS, sem filtro de distância nenhum. Dava 118.254 num print — e um
      // círculo de 20 campos tem ~1.257 posições, então nem 43 aldeias sem sobreposição chegariam
      // a 54 mil. O número estava certo, o rótulo é que mentia. Agora "no alcance" é o que sobra
      // depois de distância + já explorado + já com ataque a caminho, e o total do mundo aparece
      // separado, que é uma informação diferente e também útil.
      arr = [
        { v: fmtN(s.reach), l: 'no alcance', hl: true },
        { v: fmtN(s.novos), l: 'bárbaros novos' },
        { v: fmtN(s.sent), l: 'explorados' },
        { v: fmtN(s.left), l: 'de fora' },
        { v: fmtN(s.blPerda), l: 'bl: perdi tropa', br: true },
        { v: fmtN(s.blDefesa), l: 'bl: tem defesa' },
        { v: fmtN(s.mapped), l: 'bárbaros no mundo' },
      ];
    } else if (mod === 'lock') {
      const s = (config.lock.stats || {});
      arr = [
        { v: fmtN(s.inRange), l: 'no raio', hl: true },
        { v: fmtN(s.lockedNow), l: 'travadas agora' },
        { v: fmtN(s.total), l: 'travadas ao todo' },
        { v: fmtN(s.redSkipped), l: 'puladas (relatório vermelho)', wide: true },
      ];
    } else if (mod === 'etiqueta') {
      const e = config.etiqueta || {};
      arr = [
        { v: fmtN(e.lastCount || 0), l: 'na lista', hl: true },
        { v: fmtN(Object.keys(e.jaEnviados || {}).length), l: 'já etiquetados' },
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
    } else if (mod === 'paladin') {
      const st = (config.paladin && config.paladin.state) || {};
      const villages = Object.keys((config.paladin && config.paladin.villages) || {}).filter((v) => config.paladin.villages[v]);
      const vals = villages.map((v) => st[v] || {});
      const training = vals.filter((s) => s.status === 'training').length;
      const home = vals.filter((s) => s.status === 'home').length;
      const other = vals.length - training - home;
      arr = [
        { v: fmtN(villages.length), l: 'aldeias no ciclo', hl: true },
        { v: fmtN(training), l: 'treinando' },
        { v: fmtN(home), l: 'livres (aguard.)' },
        { v: fmtN(other), l: 'outros/sem palad.' },
      ];
    } else if (mod === 'obra') {
      const s = (config.obra && config.obra.stats) || {};
      arr = [
        { v: fmtN(s.villages), l: 'aldeias mapeadas', hl: true },
        { v: fmtN(s.built), l: 'obras na fila (últ. ciclo)' },
        { v: fmtN(s.researched), l: 'pesquisas (últ. ciclo)' },
        { v: fmtN(Object.keys(config.obra.demand || {}).length), l: 'aguard. recurso' },
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
  // Diferença entre o relógio de parede do NAVEGADOR e o do MUNDO (fuso), em ms.
  //
  // A versão anterior calculava isto a cada chamada, e o resultado era uma dente-de-serra
  // de 1000ms: serverNow() corre em milissegundo, enquanto o wallLocal vem do TEXTO de
  // #serverTime, que só muda uma vez por segundo. Cada chamada pegava um ponto diferente
  // da serra.
  //
  // Isso destruía qualquer agendamento em ms. Medido num teste real de 8 comandos: o
  // usuário pediu espaçamentos de 0/100/200/300/350/400/425ms e o plano guardou
  // 0/318/333/382/604/677/700/727 — cada comando pegou um deslocamento aleatório, e três
  // deles caíram do outro lado da virada de segundo, indo parar 1s adiante. A precisão
  // morria no AGENDAMENTO, antes de qualquer questão de disparo.
  //
  // Correção: fuso é sempre um número inteiro de MINUTOS, e o ruído da medição é de no
  // máximo 1s. Arredondar pro minuto mais próximo elimina a serra inteira e devolve o
  // valor exato — funcione ele zero, meia hora ou três horas. Calculado uma vez só.
  let _fusoMs = null;
  function wallToServerOffset() {
    if (_fusoMs != null) return _fusoMs;
    const ed = document.querySelector('#serverDate'), et = document.querySelector('#serverTime');
    let bruto;
    if (!ed || !et) bruto = serverNow() - Date.now();
    else {
      const dm = (ed.textContent || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
      const tm = (et.textContent || '').match(/(\d{2}):(\d{2}):(\d{2})/);
      if (!dm || !tm) bruto = serverNow() - Date.now();
      else bruto = serverNow() - new Date(+dm[3], +dm[2] - 1, +dm[1], +tm[1], +tm[2], +tm[3]).getTime();
    }
    _fusoMs = Math.round(bruto / 60000) * 60000;
    return _fusoMs;
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
    form.querySelectorAll('input, select').forEach((el) => {
      if (!el.name) return;
      // Checkbox/radio não marcados o navegador não envia — copiá-los distorcia o formulário.
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      const v = el.value == null ? '' : String(el.value);
      // Campo VAZIO não pode apagar um valor já lido com o mesmo name: o alvo costuma aparecer duas
      // vezes (um hidden preenchido e a caixinha de texto vazia) e a vazia vinha por último.
      if (v === '' && p2.has(el.name) && p2.get(el.name) !== '') return;
      p2.set(el.name, v);
    });
    if (!p2.has('h')) p2.set('h', CSRF);
    // Reafirma o alvo: se ele se perde no repasse, o servidor responde "Por favor, selecione uma
    // aldeia alvo" e o envio é recusado.
    if (!p2.get('input')) p2.set('input', x + '|' + y);
    if (!p2.get('x')) p2.set('x', String(x));
    if (!p2.get('y')) p2.set('y', String(y));
    const action = form.getAttribute('action') || ('/game.php?village=' + vid + '&screen=place&action=command&h=' + CSRF);
    const r2 = await fetch(absUrl(action), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p2.toString() });
    const t2 = await r2.text();
    // Só considera enviado se NÃO veio caixa de erro nem mensagem de recusa (senão o log logava falso "enviado").
    // "Selecione uma aldeia alvo" também é o texto PADRÃO da praça sem alvo escolhido — que é o estado
    // da tela logo após um envio dar certo. Então essa mensagem é AMBÍGUA: pode ser recusa ou sucesso.
    // Marcada à parte pra quem chama não reenviar por outra origem e acabar mandando ataque dobrado.
    try {
      const d2 = new DOMParser().parseFromString(t2, 'text/html');
      const eb = d2.querySelector('.error_box');
      const et = eb ? (eb.textContent || '').trim().replace(/\s+/g, ' ') : '';
      if (et) throw new Error((/selecione uma aldeia alvo/i.test(et) ? 'ambiguo: ' : 'recusado: ') + et.slice(0, 80));
    } catch (e) { if (/^(recusado|ambiguo):/.test(e.message)) throw e; }
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
    if (captchaBlocked()) { sendTimer = setTimeout(processDue, 30000); return; }   // era o único tick sem esta guarda
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
        } catch (e) {
          const em = String(e.message || e);
          // Ambíguo = pode ter enviado. Reagendar em 30s manda de novo no mesmo alvo. Trata como
          // enviado e deixa o intervalo normal correr; se não saiu, o próximo ciclo cobre.
          if (/^ambiguo:/.test(em)) {
            t.lastSentAt = now; t.phase = 'sent'; t.nextSendAt = now + 12000; sentAny = true;
            pushLog('Resposta ambígua em ' + coord + ' — pode ter enviado, não vou repetir agora.', '');
          } else {
            t.nextSendAt = now + 30000;
            pushLog('Falha em ' + coord + ' (de ' + (t.originName || origin) + '): ' + em, 'err');
          }
        }
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

  // Extrai o objeto de definições das coletas (custo, duração, pré-requisito) do HTML.
  //
  // A primeira versão usava expressão regular e falhou contra a página real: um `.*?` até
  // `}}` para no PRIMEIRO fechamento duplo, e o objeto tem chaves aninhadas (cada opção
  // carrega um premium_boost dentro). O sintoma foi "não achei os custos de desbloqueio".
  // Agora varre balanceando chaves e ignorando o que está dentro de string — não depende
  // de o JSON estar formatado de um jeito específico.
  function scavExtrairDefs(html) {
    let i = -1;
    const anc = html.indexOf('ScavengeMassScreen(');
    if (anc >= 0) i = html.indexOf('{', anc);
    if (i < 0) {
      // Plano B: acha qualquer custo de desbloqueio e volta até o começo do objeto raiz.
      const u = html.indexOf('"unlock_cost"');
      if (u < 0) return null;
      i = html.lastIndexOf('{"1":', u);
      if (i < 0) return null;
    }
    let nivel = 0, emStr = false, escapado = false;
    for (let j = i; j < html.length; j++) {
      const c = html[j];
      if (emStr) {
        if (escapado) escapado = false;
        else if (c === '\\') escapado = true;
        else if (c === '"') emStr = false;
        continue;
      }
      if (c === '"') { emStr = true; continue; }
      if (c === '{') nivel++;
      else if (c === '}') {
        nivel--;
        if (nivel === 0) {
          try {
            const o = JSON.parse(html.slice(i, j + 1));
            return (o && o['1'] && o['1'].unlock_cost) ? o : null;
          } catch (e) { return null; }
        }
      }
    }
    return null;
  }

  async function getAllScavengeState() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=place&mode=scavenge_mass', { credentials: 'include' });
    const html = await res.text();
    const m = html.match(/\[\{"village_id":[\s\S]*?\}\]/);
    if (!m) throw new Error('dados de coleta em massa não encontrados');
    let arr; try { arr = JSON.parse(m[0]); } catch (e) { throw new Error('falha ao ler dados de coleta'); }
    const out = arr.map((v) => {
      const carryFactor = parseFloat(v.unit_carry_factor) || 1;
      const home = v.unit_counts_home || {};
      const availRaw = {}; SCAV_UNITS.forEach(([u]) => { availRaw[u] = parseInt(home[u], 10) || 0; });
      const reserved = (config.reservations || {})[String(v.village_id)] || {};
      const avail = {}; SCAV_UNITS.forEach(([u]) => { avail[u] = Math.max(0, availRaw[u] - (reserved[u] || 0)); });
      const options = [];
      for (let id = 1; id <= 4; id++) {
        const o = v.options && v.options[id];
        let state = 'locked', endMs = 0;
        let desbloqueando = 0;
        if (o) {
          if (o.is_locked) { state = 'locked'; desbloqueando = (o.unlock_time || 0) * 1000; }
          else if (o.scavenging_squad) { state = 'running'; endMs = (o.scavenging_squad.return_time || 0) * 1000; }
          else state = 'free';
        }
        options.push({ id: id, state: state, endMs: endMs, desbloqueandoAte: desbloqueando });
      }
      // res e storage_max vêm na MESMA resposta e eram descartados. O desbloqueio
      // automático precisa deles pra saber se a aldeia banca o custo — de graça.
      const res = v.res || {};
      return {
        vid: String(v.village_id), name: v.village_name || ('ID ' + v.village_id),
        carryFactor: carryFactor, avail: avail, options: options,
        res: { wood: parseInt(res.wood, 10) || 0, stone: parseInt(res.stone, 10) || 0, iron: parseInt(res.iron, 10) || 0 },
        storageMax: parseInt(v.storage_max, 10) || 0,
      };
    });
    // Custo e pré-requisito de cada opção vêm num JSON separado, no construtor da tela.
    // Pendurado no próprio array: quem já usava esta função continua funcionando igual.
    out.defs = scavExtrairDefs(html);
    return out;
  }

  // ── DESBLOQUEIO AUTOMÁTICO DAS COLETAS ──────────────────────────────────────────
  // Endpoint capturado da requisição real (interceptada e bloqueada, pra não desbloquear
  // nada durante a descoberta):
  //     POST screen=scavenge_api&ajaxaction=start_unlock
  //     body: village_id=<vid>&option_id=<1..4>&h=<csrf>
  async function scavStartUnlock(vid, optionId) {
    const r = await fetch('/game.php?village=' + vid + '&screen=scavenge_api&ajaxaction=start_unlock', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: 'village_id=' + encodeURIComponent(vid) + '&option_id=' + encodeURIComponent(optionId) + '&h=' + CSRF,
    });
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status);
    try { const j = JSON.parse(t); if (j && j.error) throw new Error(String(j.error).slice(0, 90)); } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
    return true;
  }

  const RES3 = ['wood', 'stone', 'iron'];

  // Qual a PRÓXIMA opção que esta aldeia pode desbloquear. Respeita o pré-requisito (a 3
  // exige a 2, e assim por diante) e o teto que o usuário definiu. Devolve null se não há
  // nada a fazer — inclusive quando já existe um desbloqueio em andamento, porque o jogo
  // só permite um por aldeia de cada vez.
  function scavProximaOpcao(v, defs, ate) {
    if (v.options.some((o) => o.desbloqueandoAte)) return null;
    for (let id = 1; id <= Math.min(4, ate || 4); id++) {
      const o = v.options.find((x) => x.id === id);
      if (!o || o.state !== 'locked') continue;
      const d = defs && defs[String(id)];
      if (!d) return null;
      const prereq = d.prerequisite_option_ids || [];
      const faltaPre = prereq.some((p) => { const po = v.options.find((x) => x.id === p); return !po || po.state === 'locked'; });
      if (faltaPre) continue;   // ainda não dá; talvez a próxima do laço sirva
      return { id: id, nome: d.name || ('Coleta ' + id), custo: d.unlock_cost || {} };
    }
    return null;
  }

  // Puxa o que falta de UMA OU MAIS aldeias, imediatamente.
  // Escolhe as doadoras mais PERTO primeiro (transporte leva tempo) entre as que têm sobra
  // acima da reserva. Cada doadora precisa de mercador livre, e isso só dá pra saber
  // lendo a aldeia — por isso a leitura de mercado acontece só nas candidatas, não em todas.
  async function scavPuxarRecursos(destino, falta, estados, coords) {
    const cfg = config.scav;
    const reserva = Math.max(0, cfg.unlockReserva || 0);
    const dCoord = coords[destino.vid];
    if (!dCoord) throw new Error('sem coordenada da aldeia de destino');
    const restante = {}; RES3.forEach((k) => { restante[k] = Math.max(0, falta[k] || 0); });
    const candidatas = estados
      .filter((v) => v.vid !== destino.vid && coords[v.vid] && RES3.some((k) => restante[k] && (v.res[k] - reserva) > 0))
      .map((v) => {
        const a = coords[v.vid].split('|'), b = dCoord.split('|');
        return { v: v, dist: fieldDist(+a[0], +a[1], +b[0], +b[1]) };
      })
      .sort((x, y) => x.dist - y.dist)
      .slice(0, Math.max(1, cfg.unlockMaxOrigens || 5));
    let usadas = 0;
    for (const c of candidatas) {
      if (!RES3.some((k) => restante[k] > 0)) break;
      if (devoParar('scav')) break;
      let mercado;
      try { mercado = await getMarketState(c.v.vid); } catch (e) { continue; }
      let cap = Math.max(0, mercado.capacity || 0);   // capacidade dos mercadores livres
      if (cap <= 0) continue;
      const envio = { wood: 0, stone: 0, iron: 0 };
      RES3.forEach((k) => {
        if (cap <= 0 || restante[k] <= 0) return;
        const sobra = Math.max(0, (c.v.res[k] || 0) - reserva);
        const n = Math.min(restante[k], sobra, cap);
        if (n > 0) { envio[k] = n; cap -= n; }
      });
      const total = RES3.reduce((s, k) => s + envio[k], 0);
      if (total <= 0) continue;
      try {
        await sendMarketResources(c.v.vid, dCoord, envio);
        RES3.forEach((k) => { restante[k] = Math.max(0, restante[k] - envio[k]); c.v.res[k] -= envio[k]; });
        usadas++;
        pushLog('🚚 ' + c.v.name + ' → ' + destino.name + ': ' + RES3.filter((k) => envio[k]).map((k) => envio[k] + ' ' + k).join(', ') +
          ' (' + Math.round(c.dist * 10) / 10 + ' campos)', 'ok', 'scav');
      } catch (e) { pushLog('🚚 ' + c.v.name + ' → ' + destino.name + ': envio falhou (' + (e.message || e) + ').', 'err', 'scav'); }
      await sleep(400);
    }
    const aindaFalta = RES3.reduce((s, k) => s + restante[k], 0);
    return { usadas: usadas, aindaFalta: aindaFalta, restante: restante };
  }

  async function scavAutoUnlock(estados) {
    const cfg = config.scav;
    if (!cfg.autoUnlock) return;
    const defs = estados.defs;
    if (!defs) { pushLog('⛏️ Não achei os custos de desbloqueio nesta tela — desbloqueio automático pulado neste ciclo.', '', 'scav'); return; }
    let coords = {};
    try { (await getAllVillagesCached()).forEach((v) => { if (v.coord) coords[v.vid] = v.coord; }); } catch (e) {}
    cfg.faltouRecurso = {};
    let abertos = 0, puxadas = 0, semRecurso = 0;
    for (const v of estados) {
      if (devoParar('scav')) break;
      const alvo = scavProximaOpcao(v, defs, cfg.unlockAte);
      if (!alvo) continue;
      const falta = {}; let precisa = 0;
      RES3.forEach((k) => { const f = Math.max(0, (alvo.custo[k] || 0) - (v.res[k] || 0)); falta[k] = f; precisa += f; });
      if (!precisa) {
        try {
          await scavStartUnlock(v.vid, alvo.id);
          abertos++;
          pushLog('⛏️ ' + v.name + ': desbloqueando ' + alvo.nome + '.', 'ok', 'scav');
        } catch (e) { pushLog('⛏️ ' + v.name + ': não consegui desbloquear ' + alvo.nome + ' (' + (e.message || e) + ').', 'err', 'scav'); }
        await sleep(400);
        continue;
      }
      // Falta recurso. Puxa de uma ou mais aldeias AGORA — o transporte leva tempo, então
      // quanto antes sair, antes chega. O desbloqueio em si fica pro próximo ciclo, quando
      // o recurso tiver pousado; tentar agora só daria erro do servidor.
      cfg.faltouRecurso[v.vid] = { nome: v.name, opcao: alvo.nome, falta: falta, at: Date.now() };
      semRecurso++;
      if (!cfg.unlockPuxar) continue;
      try {
        const r = await scavPuxarRecursos(v, falta, estados, coords);
        if (r.usadas) {
          puxadas++;
          pushLog('⛏️ ' + v.name + ': faltava recurso pra ' + alvo.nome + ' — puxei de ' + r.usadas + ' aldeia(s)' +
            (r.aindaFalta ? ', ainda faltam ' + RES3.filter((k) => r.restante[k]).map((k) => r.restante[k] + ' ' + k).join(', ') : ', completo') +
            '. Desbloqueio no próximo ciclo, quando chegar.', '', 'scav');
        }
      } catch (e) { pushLog('⛏️ ' + v.name + ': não consegui puxar recurso (' + (e.message || e) + ').', 'err', 'scav'); }
    }
    save();
    renderScavFalta();
    if (abertos || puxadas || semRecurso) {
      pushLog('⛏️ Desbloqueio: ' + abertos + ' aberto(s)' + (semRecurso ? ' · ' + semRecurso + ' sem recurso' : '') + (puxadas ? ' · ' + puxadas + ' com transporte a caminho' : '') + '.', 'ok', 'scav');
    }
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

  // Duração REAL de cada nível de coleta antes de enviar, lida direto da tela de coleta da aldeia
  // (screen=place&mode=scavenge) — só chamada quando o "tempo máximo" está ativo, já que é 1 fetch
  // extra por aldeia. O jogo não entrega essa duração pronta pelo endpoint em massa (scavenge_mass),
  // só depois que o esquadrão já está a caminho — então tem que ler o valor que o próprio jogo mostra
  // antes do envio (span.duration), em vez de tentar reproduzir a fórmula.
  async function getScavDurations(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=place&mode=scavenge', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const spans = doc.querySelectorAll('span.duration');
    if (spans.length !== 4) return {};   // não deu pra mapear nível->duração com segurança (ex.: nível travado sem card)
    const out = {};
    spans.forEach((sp, i) => {
      const m = (sp.textContent || '').trim().match(/^(\d+):([0-5]\d):([0-5]\d)$/);
      if (m) out[i + 1] = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    });
    return out;
  }
  async function scavTick() {
    clearTimeout(scavTimer);
    if (!config.scav.running) return;
    if (lockOther()) { scavTimer = setTimeout(scavTick, 5000); return; }
    if (captchaBlocked()) { scavTimer = setTimeout(scavTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.scav.nextAt || 0) > now) { scheduleScav(); return; }
    let villages;
    try { villages = await getAllScavengeState(); }
    catch (e) { pushLog('Coleta: erro ao ler o estado das aldeias (' + (e.message || e) + ').', 'err', 'scav'); config.scav.nextAt = now + 60000; save(); scheduleScav(); return; }
    // Desbloqueio antes de despachar: a mesma leitura já traz opções, recursos e custos,
    // então descobrir o que dá pra abrir não custa requisição nenhuma a mais.
    try { await scavAutoUnlock(villages); } catch (e) { pushLog('⛏️ Desbloqueio automático falhou (' + (e.message || e) + ') — a coleta segue normal.', 'err', 'scav'); }
    const selUnits = SCAV_UNITS.map(([u]) => u).filter((u) => config.scav.units[u]);
    const maxSec = Math.max(0, config.scav.maxHours || 0) * 3600;
    const reqs = [], runningEnds = [], activeSet = {};
    for (const v of villages) {
      if (v.options.some((o) => o.state === 'running')) activeSet[v.vid] = 1;
      v.options.filter((o) => o.state === 'running' && o.endMs).forEach((o) => runningEnds.push(o.endMs));
      let freeOpts = v.options.filter((o) => o.state === 'free');
      if (!freeOpts.length) continue;
      // Tempo máximo (modo guerra): só manda pros níveis cuja duração REAL (lida da tela) cabe no teto.
      // Se não der pra confirmar a duração de um nível (erro de rede ou HTML inesperado), NÃO manda pra
      // ele — por segurança, prefere não coletar a arriscar tropa fora de casa por tempo desconhecido.
      if (maxSec > 0) {
        let durs = {};
        try { durs = await getScavDurations(v.vid); }
        catch (e) { pushLog('Coleta em ' + v.name + ': erro ao checar duração (' + (e.message || e) + ') — pulando por segurança.', 'err', 'scav'); }
        const before = freeOpts.length;
        freeOpts = freeOpts.filter((o) => durs[o.id] != null && durs[o.id] <= maxSec);
        if (!freeOpts.length && before) { pushLog('Coleta em ' + v.name + ': nenhum nível dentro do tempo máximo (' + config.scav.maxHours + 'h) — pulando.', '', 'scav'); continue; }
      }
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

  let _farmPagesInfo = null;   // diagnóstico: quantas páginas do assistente foram lidas no último ciclo
  // Memoria curta do assistente, COMPARTILHADA entre os modulos.
  //
  // Saque, Muralha e Mapa liam a lista inteira cada um por conta — e ela e paginada, entao
  // cada leitura sao varias requisicoes. Medido na conta do usuario: 22 leituras de am_farm
  // por MINUTO, ~1.320/h. Como os tres rodam em ciclos que se cruzam, quase sempre estao
  // olhando o mesmo estado com segundos de diferenca.
  // 90s e curto o bastante pra nao perder relatorio recem-chegado e longo o bastante pra
  // fundir as leituras dos tres num ciclo. Quem precisa do dado fresco passa forcar=true.
  const FARM_ALVOS_TTL_MS = 90000;
  let _farmAlvosCache = null, _farmAlvosAt = 0, _farmAlvosVoo = null;

  async function getFarmTargetsCached(vid, forcar) {
    const agora = Date.now();
    if (!forcar && _farmAlvosCache && (agora - _farmAlvosAt) < FARM_ALVOS_TTL_MS) return _farmAlvosCache;
    // Se ja ha uma leitura em voo, espera ELA em vez de abrir outra: sem isto, dois modulos
    // que acordam juntos disparam duas leituras completas antes de qualquer cache existir.
    if (_farmAlvosVoo) return _farmAlvosVoo;
    _farmAlvosVoo = getFarmTargets(vid).then((r) => {
      _farmAlvosCache = r; _farmAlvosAt = Date.now(); _farmAlvosVoo = null; return r;
    }, (e) => { _farmAlvosVoo = null; throw e; });
    return _farmAlvosVoo;
  }

  async function getFarmTargets(vid) {
    const rows = [], seen = {};
    // Ordenação fixa por distância em todas as páginas — é o que os próprios links de paginação
    // do jogo usam. Não corrige um bug medido: testado ao vivo, ler página 0 e 1 com 600ms de
    // intervalo dá zero sobreposição com ou sem o parâmetro. É garantia de que a lista não
    // reordene entre as requisições se uma delas demorar (relatório chegando, ataque pousando),
    // caso em que um alvo escorregaria pra página já lida e sumiria em silêncio.
    // Efeito colateral bem-vindo: os alvos vêm do mais perto pro mais longe.
    const fetchPage = async (n) => {
      const url = '/game.php?village=' + vid + '&screen=am_farm&order=distance&dir=asc'
        + (n > 0 ? ('&Farm_page=' + n) : '');
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('assistente página ' + n + ': HTTP ' + res.status);
      return new DOMParser().parseFromString(await res.text(), 'text/html');
    };
    const parseDoc = (doc) => {
    doc.querySelectorAll('#plunder_list tr[id^="village_"]').forEach((tr) => {
      const targetId = tr.id.replace('village_', '');
      if (seen[targetId]) return;   // mesma aldeia repetida entre páginas
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
      seen[targetId] = 1;
      rows.push({ targetId: targetId, reportId: reportId, reportAt: reportAt, wood: nums[0] || 0, stone: nums[1] || 0, iron: nums[2] || 0, wall: wall, dist: dist, cEnabled: cEnabled, aEnabled: aEnabled, bEnabled: bEnabled, color: color, full: full, coord: coord });
    });
    };
    // O assistente PAGINA (teto de 100 linhas por página). Lendo só a primeira, os alvos das páginas
    // seguintes ficavam invisíveis e a tropa sobrava parada. Segue a paginação até o fim.
    const doc0 = await fetchPage(0);
    parseDoc(doc0);
    const pages = new Set();
    doc0.querySelectorAll('a[href*="Farm_page="]').forEach((a) => {
      const m = (a.getAttribute('href') || '').match(/Farm_page=(\d+)/);
      if (m) { const p = parseInt(m[1], 10); if (p > 0) pages.add(p); }
    });
    const extras = Array.from(pages).sort((a, b) => a - b).slice(0, 14);   // teto de segurança
    let lidas = 1;
    for (const p of extras) {
      try { parseDoc(await fetchPage(p)); lidas++; await sleep(200); } catch (e) { break; }
    }
    _farmPagesInfo = { pages: lidas, achadas: extras.length + 1, alvos: rows.length };
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
  // Segundos desde a meia-noite DO SERVIDOR. Usado pra zerar o acumulador diário exatamente quando o
  // jogo zera o "saqueado hoje" — quando o relógio anda pra trás, virou o dia.
  function serverSecOfDay() {
    const et = document.querySelector('#serverTime');
    const tm = et ? (et.textContent || '').match(/(\d{2}):(\d{2}):(\d{2})/) : null;
    return tm ? ((+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3])) : null;
  }
  // Soma a capacidade de carga enviada hoje, pra comparar com o saque obtido (eficiência real).
  function addDailyCap(cfg, cap, atks) {
    const sec = serverSecOfDay();
    const d = cfg.dailyCap || { sec: sec, startSec: sec, cap: 0, atks: 0 };
    // virou o dia no servidor -> zera e marca que agora a contagem cobre o dia desde o começo
    if (sec != null && d.sec != null && sec < d.sec) { d.cap = 0; d.atks = 0; d.startSec = sec; }
    d.sec = (sec != null ? sec : d.sec);
    if (d.startSec == null) d.startSec = sec;
    d.cap = (d.cap || 0) + (cap || 0);
    d.atks = (d.atks || 0) + (atks || 0);
    cfg.dailyCap = d;
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
  // Relatório: soma o total de tropas do defensor. 0 = aldeia comprovadamente vazia.
  // LANÇA se não conseguir ler — antes devolvia 0 em QUALQUER exceção (rede oscilando, seletor
  // mudado, sessão caída), e "não consegui ler" virava "aldeia vazia": o saque ia contra um azul
  // defendido e perdia tropa. Quem chama tem que pular o alvo quando não dá pra saber.
  async function getReportDefenseTotal(reportId) {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=report&view=' + reportId, { credentials: 'include' });
    if (!res.ok) throw new Error('relatório ' + reportId + ': HTTP ' + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tbl = doc.querySelector('#attack_info_def_units') || doc.querySelector('#attack_spy_away') || doc.querySelector('#attack_info_def');
    if (!tbl) {
      // Sem NENHUMA das três tabelas: ou a página não é um relatório (sessão/bloqueio), ou o
      // formato mudou. Nos dois casos, não dá pra afirmar que a aldeia está vazia.
      if (!/id="attack_info|class="report/.test(html)) throw new Error('relatório ' + reportId + ': resposta não parece um relatório');
      throw new Error('relatório ' + reportId + ': não achei a tabela de defesa');
    }
    const cells = tbl.querySelectorAll('td.unit-item, .unit-item');
    let total = 0; cells.forEach((c) => { total += parseInt((c.textContent || '').replace(/\D/g, ''), 10) || 0; });
    return total;
  }
  async function farmTick() {
    clearTimeout(farmTimer);
    if (!config.farm.running) return;
    if (lockOther()) { farmTimer = setTimeout(farmTick, 5000); return; }
    if (captchaBlocked()) { farmTimer = setTimeout(farmTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.farm.nextAt || 0) > now) { scheduleFarm(); return; }
    const cfg = config.farm;
    // Origens = minhas aldeias com coordenada (pra escolher a mais próxima por alvo).
    let mine;
    try {
      if (cfg.group) { mine = (await getVillagesInGroup(cfg.group)).map((x) => ({ vid: x.vid, coord: x.coord, name: x.coord })); try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
      else mine = await getAllVillagesCached();
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
    // DIAGNÓSTICO: mais comandos de saque em rota do que alvos distintos = tem ataque duplicado no
    // mesmo alvo. Com "Repetir farm" desligado isso NÃO deveria acontecer, e indica que um envio deu
    // certo mas foi lido como recusa (aí o ciclo tenta outra origem e manda de novo no mesmo lugar).
    if (!cfg.repeat && saquesAtivos != null && farmCoords.size && saquesAtivos > farmCoords.size) {
      pushLog('Saque: ⚠ ' + saquesAtivos + ' comando(s) de saque em rota para apenas ' + farmCoords.size + ' alvo(s) distinto(s) — há ' + (saquesAtivos - farmCoords.size) + ' ataque(s) DUPLICADO(S).', 'err', 'farm');
    }
    const minW = cfg.minWood || 0, minS = cfg.minStone || 0, minI = cfg.minIron || 0;
    const maxDist = cfg.maxDist != null ? cfg.maxDist : 13;
    const maxWall = cfg.maxWall != null ? cfg.maxWall : 20;
    const blueMaxWall = cfg.blueMaxWall != null ? cfg.blueMaxWall : 0;
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
    try { targets = await getFarmTargetsCached(CUR_VID, true); }
    catch (e) { pushLog('Saque: erro ao ler os alvos do assistente (' + (e.message || e) + ').', 'err', 'farm'); cfg.nextAt = now + 120000; save(); scheduleFarm(); return; }
    if (_farmPagesInfo && _farmPagesInfo.pages > 1) pushLog('Saque: assistente tem ' + _farmPagesInfo.pages + ' página(s) — ' + _farmPagesInfo.alvos + ' alvo(s) no total.', '', 'farm');
    let tpl = null;
    if (!dyn) { try { tpl = await getFarmTemplates(CUR_VID); } catch (e) { tpl = null; } }
    // Sem as unidades dos templates não dá pra saber se a origem tem tropa, e o ciclo cai no
    // "tenta e deixa o servidor recusar" — o que enche o log de recusa e gasta requisição à toa.
    if (!dyn) {
      const nA = (tpl && tpl.unitsA) ? Object.keys(tpl.unitsA).length : 0;
      const nB = (tpl && tpl.unitsB) ? Object.keys(tpl.unitsB).length : 0;
      if (!nA && !nB) pushLog('Saque: ⚠ não li as unidades dos templates A/B do assistente — sem pré-checagem de tropa. Espere muitas recusas de "unidades insuficientes". [ids: A=' + ((tpl && tpl.a) || '?') + ' B=' + ((tpl && tpl.b) || '?') + ' · como achei: ' + (((tpl && tpl.debug) || []).join(', ') || 'nada') + ']', 'err', 'farm');
      else if (!nA || !nB) pushLog('Saque: ⚠ li as unidades de só um template (A=' + nA + ' unid., B=' + nB + ' unid.) — o outro fica sem pré-checagem.', 'err', 'farm');
    }
    // População de cada template + pontos das aldeias = dá pra saber ANTES quais origens são grandes
    // demais pro template (limite de fake do mundo). 0 = desconhecido -> checagem proativa desligada,
    // e sobra só o freio reativo (que aprende com o primeiro erro).
    const tplPop = { a: 0, b: 0 };
    // Ataque SÓ de explorador é isento do limite de fake (regra do jogo: olheiro sozinho sempre pode
    // sair, não importa o tamanho da origem). Sem isso o script "consertava" um template de
    // reconhecimento somando cavalaria que o jogo nem exigia.
    const tplOnlySpy = { a: false, b: false };
    let vPoints = null;
    const fakePct = FAKE_LIMIT_PCT;
    if (!dyn && tpl) {
      const popOf = (u) => Object.keys(u || {}).reduce((s, k) => s + (parseInt(u[k], 10) || 0) * (FAKE_POP[k] || 1), 0);
      const soSpy = (u) => { const ks = Object.keys(u || {}).filter((k) => (parseInt(u[k], 10) || 0) > 0); return ks.length > 0 && ks.every((k) => k === 'spy'); };
      tplPop.a = popOf(tpl.unitsA); tplPop.b = popOf(tpl.unitsB);
      tplOnlySpy.a = soSpy(tpl.unitsA); tplOnlySpy.b = soSpy(tpl.unitsB);
      if (tplPop.a || tplPop.b) {
        try { vPoints = await getVillagePoints(); } catch (e) { vPoints = null; }
        pushLog('Saque: limite de fake ativo — template A=' + tplPop.a + ' pop' + (tplOnlySpy.a ? ' (só explorador: isento)' : '') + ', B=' + tplPop.b + ' pop' + (tplOnlySpy.b ? ' (só explorador: isento)' : '') + '; origem precisa de ' + fakePct + '% dos pontos dela.', '', 'farm');
      }
    }
    const availCache = {};
    const getAvail = async (vid) => { if (!availCache[vid]) { try { availCache[vid] = (await getVillageStateReserved(vid)).avail || {}; } catch (e) { availCache[vid] = {}; } } return availCache[vid]; };
    const skip = { norep: 0, off: 0, red: 0, azul: 0, def: 0, mur: 0, pend: 0, semorig: 0, dist: 0 };
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
    let count = 0, errs = 0;   // errs = envios recusados APÓS a origem passar na pré-checagem de tropa
    let _farmSaveAt = 0;       // throttle da gravação imediata do carimbo de envio
    let incertos = 0, calcCount = 0;   // envios de resultado ambíguo · envios subidos ao mínimo do mundo
    let lastCalcTxt = '';              // último envio no mínimo (mostrado no painel como amostra)
    let capCycle = 0;                  // capacidade de carga total despachada neste ciclo
    // Limite de fake do mundo: o ataque precisa ter no mínimo (pontos da ORIGEM × pct)% de população.
    // Quem estoura isso é a origem grande, não o alvo — então o bloqueio é por origem+modo e vale pro
    // ciclo todo. Assim uma aldeia grande demais pro template B é descartada após UM erro, não a cada alvo.
    const fakeBlock = {};
    const errReasons = {};     // motivo -> quantas vezes (pra saber POR QUE recusou, não só quantas)
    // Barra de progresso do ciclo: UMA linha de log que se atualiza conforme percorre os alvos e, no
    // fim, vira o extrato. Throttle de 400ms pra não redesenhar o log a cada aldeia.
    let _barAt = 0;
    if (eligible.length) setFarmProg(farmProgHTML(0, eligible.length, 'mapeados ' + eligible.length + ' alvo(s)'));
    const tickBar = (done, force) => {
      if (!eligible.length) return;
      const ts = Date.now();
      if (!force && ts - _barAt < 400) return;
      _barAt = ts;
      setFarmProg(farmProgHTML(done, eligible.length, '✔ ' + count + ' enviado(s)' + (errs ? (' · ✖ ' + errs + ' recusa(s)') : '')));
    };
    for (const [idx, t] of eligible.entries()) {
      const pare = devoParar('farm');
      if (pare) { pushLog('Saque: ciclo interrompido — ' + pare + ' (' + idx + '/' + eligible.length + ' alvos percorridos).', '', 'farm'); break; }
      tickBar(idx);   // idx = quantos JÁ terminaram
      const cm = (t.coord || '').match(/(\d+)\|(\d+)/); if (!cm) continue;
      const tx = +cm[1], ty = +cm[2];
      // Blacklist do módulo Mapa. É o que dá efeito prático à lista: sem isto, marcar uma
      // aldeia como "tem defesa" só impediria o explorador de ir, e o Saque continuaria
      // mandando tropa pro mesmo lugar onde ela morre.
      if ((config.map.blacklistDefesa || {})[t.coord] || (config.map.blacklistPerda || {})[t.coord]) { skip.def++; continue; }
      if (t.color === 'blue') {
        // CACHE POR COORDENADA, e o ZERO tambem entra.
        //
        // Antes a chave era o reportId e so gravava quando havia defesa. Duas falhas que se
        // multiplicavam: aldeia vazia (a maioria) era relida TODO ciclo pra sempre, e o
        // reportId muda a cada saque — o proprio ato de farmar invalidava o cache que existe
        // pra evitar reler. Medido na conta do usuario: 92 leituras de relatorio por MINUTO,
        // ~5.520/h, e foi o que derrubou tudo em 429.
        // A pergunta certa e "esta ALDEIA tem defesa", nao "este RELATORIO tem defesa".
        // Defesa encontrada nao expira (tropa nao some porque o tempo passou); o zero vale
        // por algumas horas, tempo em que uma aldeia vazia dificilmente virou fortaleza.
        const dc = defended[t.coord];
        if (dc && (dc.defTotal > 0 || (now - (dc.at || 0)) < FARM_DEF_ZERO_TTL_MS)) {
          if (dc.defTotal > 0) { skip.def++; continue; }
        } else {
        // Não deu pra ler o relatório? PULA. Azul é o único que pode ter defesa; mandar sem saber
        // é o erro mais caro do módulo. Errar pra menos custa um saque; errar pra mais custa tropa.
        let defTotal = 0;
        try { defTotal = await getReportDefenseTotal(t.reportId); }
        catch (e) {
          skip.def++;
          errReasons['azul sem leitura de defesa: ' + String(e.message || e).slice(0, 60)] = (errReasons['azul sem leitura de defesa: ' + String(e.message || e).slice(0, 60)] || 0) + 1;
          continue;
        }
        defended[t.coord] = { at: now, coord: t.coord, x: tx, y: ty, defTotal: defTotal, wall: t.wall };
        if (defTotal > 0) {
          pushLog('⚠ ALERTA: ' + t.coord + ' tem ' + defTotal + ' tropa(s) de defesa (relatório azul) — registrado no intel', 'err', 'farm');
          skip.def++; continue;
        }
        }
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
      let did = false, usedName = '', usedDist = 0, incerto = false, usedCalc = false, usedCalcInfo = '';
      for (const c of cands) {
        // Origem reprovada no limite de fake: em vez de pular, manda quantidade CALCULADA que cumpre
        // o mínimo do mundo (fallback). Só pula de vez se não der pra calcular (sem pontos da aldeia).
        let useCalc = false;
        const ptsC = vPoints ? (parseInt(vPoints[String(c.s.vid)], 10) || 0) : 0;
        const minPopC = ptsC > 0 ? Math.ceil((fakePct / 100) * ptsC) : 0;
        if (mode !== 'c' && !tplOnlySpy[mode] && (fakeBlock[c.s.vid + '|' + mode] || (!dyn && tplPop[mode] > 0 && minPopC > 0 && tplPop[mode] < minPopC))) {
          if (!minPopC) continue;   // sem os pontos da origem não dá pra calcular o piso -> pula
          useCalc = true;
        }
        const avail = await getAvail(c.s.vid);
        if (minCL > 0 && (avail.light || 0) < minCL) continue;   // origem drenada -> tenta a próxima mais próxima
        // Modo dinâmico A/B manda {light: estCL, spy: 1}. Se a origem não tem isso (ex.: aldeia recém-noblada
        // sem CL), o servidor recusa e o log mentia "enviado". Pula pra próxima origem em vez de falso-positivo.
        if (dyn && mode !== 'c') { if ((avail.light || 0) < estCL) continue; if ((avail.spy || 0) < 1) continue; }
        // Sem template dinâmico o A/B manda a composição fixa do assistente. Antes a gente disparava
        // e deixava o servidor recusar — 1 requisição jogada fora por origem sem tropa. Agora confere
        // antes, usando as unidades lidas do próprio template. Se não deu pra ler (mapa vazio), passa
        // direto e o comportamento fica igual ao de antes.
        if (!dyn && !useCalc && mode !== 'c') {
          const need = (mode === 'a' ? (tpl && tpl.unitsA) : (tpl && tpl.unitsB)) || {};
          let falta = false;
          for (const u in need) { if ((avail[u] || 0) < need[u]) { falta = true; break; } }
          if (falta) continue;
        }
        // Envio calculado = O TEMPLATE DO USUÁRIO subido até o mínimo do mundo. Mantém as unidades que
        // ele escolheu no assistente e só multiplica a quantidade o suficiente pra passar. O saque do
        // alvo NÃO entra aqui: quem decide a composição é o template, não o script.
        let calcAmounts = null;
        if (useCalc) {
          // COMPLETA o template, não substitui: manda tudo que o usuário configurou e soma só a
          // cavalaria que falta pra bater o mínimo do mundo. O script não presume pra que serve cada
          // template (o A daqui é 5 exploradores; noutra conta pode ser 25 cavalarias) — quem decide
          // a composição é o usuário, e o piso de fake é uma exigência do mundo, não uma opinião.
          const base = (mode === 'a' ? (tpl && tpl.unitsA) : (tpl && tpl.unitsB)) || {};
          calcAmounts = {};
          for (const u in base) { const n = parseInt(base[u], 10) || 0; if (n > 0) calcAmounts[u] = n; }
          const falta = Math.max(0, minPopC - (tplPop[mode] || 0));
          if (falta > 0) calcAmounts.light = (calcAmounts.light || 0) + Math.ceil(falta / (FAKE_POP.light || 4));
          if (!Object.keys(calcAmounts).length) continue;
          let semTropa = false;
          for (const u in calcAmounts) { if ((avail[u] || 0) < calcAmounts[u]) { semTropa = true; break; } }
          if (semTropa) continue;   // origem não tem o template + o complemento -> tenta a próxima
        }
        try {
          if (mode === 'c') { await sendFarmC(c.s.vid, t.reportId); did = true; }
          else if (useCalc) { await sendAttack(c.s.vid, tx, ty, calcAmounts); did = true; }
          else if (mode === 'a') { for (let k = 0; k < qty; k++) { if (dyn) { await sendAttack(c.s.vid, tx, ty, { light: Math.max(1, Math.ceil(sum / 80)), spy: 1 }); } else { if (!tpl || !tpl.a) break; await sendFarmB(c.s.vid, t.targetId, tpl.a); } did = true; if (k < qty - 1) await sleep(delayBase + Math.floor(Math.random() * 250)); } }
          else if (mode === 'b') { for (let k = 0; k < qty; k++) { if (dyn) { await sendAttack(c.s.vid, tx, ty, { light: Math.max(1, Math.ceil(sum * 1.2 / 80)), spy: 1 }); } else { if (!tpl || !tpl.b) break; await sendFarmB(c.s.vid, t.targetId, tpl.b); } did = true; if (k < qty - 1) await sleep(delayBase + Math.floor(Math.random() * 250)); } }
        } catch (e) {   // envio recusado -> guarda o MOTIVO (antes era engolido e a gente ficava no escuro)
          did = false;
          const em = String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 90);
          // Resposta ambígua: pode ter enviado. Assume que SIM e para de tentar este alvo — errar pra
          // menos (deixar de mandar) é muito mais barato que errar pra mais (ataque dobrado).
          if (/^ambiguo:/.test(em)) { incerto = true; break; }
          errs++;
          errReasons[em] = (errReasons[em] || 0) + 1;
          // Limite de fake: o template é pequeno demais PRA ESSA ORIGEM (vale pra qualquer alvo).
          // Marca e não tenta de novo no ciclo — antes gastava uma requisição por alvo.
          const fl = em.match(/m[ií]nimo de (\d+) habitantes/i);
          if (fl) {
            fakeBlock[c.s.vid + '|' + mode] = true;
            pushLog('Saque: ' + c.s.name + ' não pode mandar ' + mode.toUpperCase() + ' — o mundo exige ' + fl[1] + ' de população (1% dos pontos dela) e o template é menor. Origem pulada neste ciclo.', 'err', 'farm');
          }
          continue;
        }
        if (did) {
          // Desconta o que saiu, senão a pré-checagem do próximo alvo usa saldo velho e volta a
          // tentar origem já drenada. Dinâmico/C = estimativa de CL; A/B fixo = unidades do template.
          // Dinâmico manda {light: estCL, spy: 1} — o explorador TAMBÉM tem que ser abatido, senão a
          // origem parece ter spy pra sempre, passa na pré-checagem e o servidor recusa. Era a causa
          // das recusas que sobravam: aldeia reusada 3x no ciclo com 2 exploradores.
          if (useCalc) { for (const u in calcAmounts) avail[u] = Math.max(0, (avail[u] || 0) - calcAmounts[u]); }
          else if (dyn && mode !== 'c') { avail.light = Math.max(0, (avail.light || 0) - estCL); avail.spy = Math.max(0, (avail.spy || 0) - 1); }
          else if (mode === 'c') { avail.light = Math.max(0, (avail.light || 0) - estCL); }
          else { const used = (mode === 'a' ? (tpl && tpl.unitsA) : (tpl && tpl.unitsB)) || {}; for (const u in used) avail[u] = Math.max(0, (avail[u] || 0) - used[u]); }
          usedName = c.s.name; usedDist = c.d; usedCalc = useCalc; count++;
          if (useCalc) { calcCount++; usedCalcInfo = Object.keys(calcAmounts).map((u) => calcAmounts[u] + ' ' + u).join(' + '); }
          // Capacidade de carga despachada. No C quem monta a tropa é o jogo (dimensiona pelo saque
          // do relatório), então usa o próprio saque estimado como capacidade — é aproximação.
          capCycle += useCalc ? carryOf(calcAmounts)
            : mode === 'c' ? sum
            : dyn ? estCL * (CARRY.light || 80)
            : carryOf(mode === 'a' ? (tpl && tpl.unitsA) : (tpl && tpl.unitsB));
          cfg.activeSends.push({ coord: t.coord, mode: mode, vid: c.s.vid, at: now }); await sleep(delayBase + Math.floor(Math.random() * 250)); break;
        }
      }
      if (did) {
        sent[t.coord] = Date.now(); cfg.sentReports = sent; pendingCoords.add(t.coord);
        // GRAVA JÁ. O save() do fim do ciclo não basta: a página recarrega no meio (visto no log) e
        // todos os carimbos "mandei nesse alvo" iam junto — aí o alvo era reatacado muito antes do
        // "Repetir a cada". Throttle de 2s pra não escrever no disco a cada envio.
        const _ts = Date.now();
        if (_ts - _farmSaveAt > 2000) { _farmSaveAt = _ts; save(); }
        // Envio individual NÃO vai mais pro log (enchia 50 linhas por ciclo). O andamento fica na
        // barra da aba e o resultado no resumo do fim do ciclo.
        if (usedCalc) lastCalcTxt = usedName + ' → ' + t.coord + ' (' + usedCalcInfo + ')';
      }
      else if (incerto) {
        // Não sabemos se saiu. Carimba como enviado pra NÃO reenviar; o próximo ciclo lê a lista de
        // comandos do jogo e corrige sozinho se não tiver saído.
        sent[t.coord] = Date.now(); cfg.sentReports = sent; pendingCoords.add(t.coord); incertos++;
      }
      else skip.semorig++;
    }
    // "Sem origem c/ tropa" NÃO é falha: é teto de tropa, situação normal quando há mais alvo do que
    // cavalaria. Falha de verdade é envio recusado pelo servidor (errs) ou de resultado incerto.
    const naoEnviados = Math.max(0, eligible.length - count - incertos);
    const topErr = Object.keys(errReasons).map((m) => [m, errReasons[m]]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    // PAINEL fica com o detalhe (tem espaço e é status, não histórico).
    const parts = [];
    if (skip.pend) parts.push(skip.pend + ' já em rota');
    if (skip.semorig) parts.push(skip.semorig + ' sem origem c/ tropa');
    if (skip.off) parts.push(skip.off + ' cor sem modo / C indisp.');
    if (skip.azul) parts.push(skip.azul + ' azul c/ muralha');
    if (skip.def) parts.push(skip.def + ' azul c/ defesa');
    if (skip.dist) parts.push(skip.dist + ' fora do alcance');
    if (skip.mur) parts.push(skip.mur + ' muralha alta');
    if (skip.norep) parts.push(skip.norep + ' sem relatório');
    if (eligible.length) {
      setFarmProg(farmProgHTML(eligible.length, eligible.length,
        '✔ <b>' + count + '</b> enviado(s)' + (calcCount ? (' · ' + calcCount + ' completado(s) ao mínimo') : '') +
        (incertos ? (' · ? ' + incertos + ' incerto(s)') : '') +
        (naoEnviados ? (' · ⏭ ' + naoEnviados + ' não enviado(s)') : '') +
        (parts.length ? ('<br><span style="opacity:.7">' + parts.join(' · ') + '</span>') : '') +
        (lastCalcTxt ? ('<br><span style="opacity:.7">completado: ' + lastCalcTxt + '</span>') : '')));
    } else setFarmProg('Nenhum alvo elegível neste ciclo.');
    // LOG enxuto: o resumo sai mais abaixo ("ciclo concluído"). Aqui, só problema DE VERDADE —
    // recusa do servidor ou envio incerto. Falta de tropa não entra: é teto, não defeito.
    if (errs || incertos || topErr.length) {
      pushLog('Saque: ' + (errs ? errs + ' recusa(s)' : '') + (incertos ? ((errs ? ' · ' : '') + incertos + ' incerto(s)') : '') +
        (topErr.length ? (' — ' + topErr.map((p) => p[1] + '× "' + p[0] + '"').join(' · ')) : ''), 'err', 'farm');
    }
    // Tropa esgotada é informação útil (dá pra decidir intervalo/ordem), mas em tom neutro.
    if (skip.semorig) pushLog('Saque: ' + skip.semorig + ' alvo(s) sem origem com tropa — acabou a cavalaria antes dos alvos.', '', 'farm');
    // Detecção de BLOQUEIO por efeito (pega bot-check enquanto você está AFK). Só conta como suspeito o
    // que é sintoma REAL de bloqueio: servidor RECUSOU envios (errs) OU o assistente voltou VAZIO
    // (0 alvos, degradado). "0 enviados por falta de CL / fora de alcance / cooldown" é NORMAL e ZERA o
    // contador (não é bloqueio). Se vinha enviando e fica 3 ciclos suspeitos, alerta pra você voltar ao PC.
    const bloqueioSuspeito = (errs > 0) || (targets.length === 0);
    if (count > 0) { _farmZeroStreak = 0; _farmEverSent = true; }
    else if (_farmEverSent && bloqueioSuspeito) {
      _farmZeroStreak++;
      if (_farmZeroStreak >= 3) {
        pushLog('Saque: 3 ciclos sem enviar' + (errs ? (' (' + errs + ' recusados)') : ' (assistente vazio)') + ' — possível verificação/bloqueio. Volte ao PC.', 'err', 'farm');
        if (config.captcha && config.captcha.enabled) fireCaptchaNotification('saque-parado' + (errs ? ('/' + errs + 'rec') : ''), false);
        _farmZeroStreak = 0;   // zera p/ re-alertar se continuar parado
      }
    } else { _farmZeroStreak = 0; }   // 0 por falta de CL/alcance/cooldown = normal, não é bloqueio
    Object.keys(sent).forEach((r) => { if (now - sent[r] > 12 * 3600 * 1000) delete sent[r]; });
    // Retenção 30 dias — dados de defesa são intel útil pra guerra (relatório azul não muda tão rápido).
    // Tolera formato antigo (number) e novo (object com .at).
    Object.keys(defended).forEach((r) => {
      const d = defended[r];
      const at = (typeof d === 'number') ? d : (d && d.at) || 0;
      if (now - at > 30 * 24 * 3600 * 1000) delete defended[r];
    });
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
    // Eficiência REAL: saque obtido hoje ÷ capacidade de carga despachada hoje. Diz se a tropa está
    // voltando cheia (intervalo bem calibrado) ou meio vazia (batendo cedo demais no mesmo alvo).
    addDailyCap(cfg, capCycle, count);
    cfg.stats.dailyCap = cfg.dailyCap;
    // Intel de aldeias defendidas (com tropas conhecidas) — usado pelo mapa
    cfg.stats.defendedCount = Object.values(defended).filter((d) => typeof d === 'object' && d.coord).length;
    cfg.nextAt = now + Math.max(60, cfg.interval || 600) * 1000;
    save();
    refreshCards('farm'); refreshDaily('farm', cfg, 'loot', 'loot_res');
    pushLog('Saque: ciclo concluído — ' + count + ' saque(s) enviado(s)' + (calcCount ? (', ' + calcCount + ' completado(s) ao mínimo') : '') + '. Próximo em ' + Math.round((cfg.interval || 600) / 60) + ' min.', 'ok', 'farm');
    scheduleFarm();
  }
  function scheduleFarm() { clearTimeout(farmTimer); if (!config.farm.running) return; farmTimer = setTimeout(farmTick, Math.min(Math.max((config.farm.nextAt || 0) - Date.now(), 1000), 60000)); }
  async function wallTick() {
    clearTimeout(wallTimer);
    if (!config.wall.running) return;
    if (lockOther()) { wallTimer = setTimeout(wallTick, 5000); return; }
    if (captchaBlocked()) { wallTimer = setTimeout(wallTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.wall.nextAt || 0) > now) { scheduleWall(); return; }
    let mine;
    try { mine = await getAllVillagesCached(); }
    catch (e) { pushLog('Muralha: erro ao listar as aldeias (' + (e.message || e) + ').', 'err', 'wall'); config.wall.nextAt = now + 120000; save(); scheduleWall(); return; }
    const myV = [];
    mine.forEach((v) => { const m = (v.coord || '').match(/(\d+)\|(\d+)/); if (m) myV.push({ vid: v.vid, name: v.name || v.coord, coord: v.coord, x: +m[1], y: +m[2] }); });
    const wMin = config.wall.wallMin != null ? config.wall.wallMin : 1;
    const wMax = config.wall.wallMax != null ? config.wall.wallMax : 6;
    const axeN = Math.max(1, config.wall.axeCount || 80);
    const delay = Math.max(0, config.farm.delay != null ? config.farm.delay : 500);
    const demo = config.wall.sentDemo || {};
    // Quebras A CAMINHO: as coords pra onde eu mandei e que ainda aparecem nos meus comandos de
    // ataque. Filtro o ícone de saque fora, senão um saque pra mesma aldeia contaria como quebra.
    // Sem isso o card mediria "quebras que eu disparei algum dia", que não diz nada do agora.
    config.wall.ativos = config.wall.ativos || {};
    let quebrasNoAr = 0;
    try {
      const pa = await getPendingAttack();
      Object.keys(config.wall.ativos).forEach((c) => {
        if (pa.coords.has(c) && !pa.farmCoords.has(c)) quebrasNoAr++; else delete config.wall.ativos[c];
      });
    } catch (e) { quebrasNoAr = Object.keys(config.wall.ativos).length; }
    const COOLDOWN = 6 * 3600 * 1000;   // não re-manda no mesmo report por 6h
    // Alvos com muralha na faixa (assistente = conta inteira), MAIORES primeiro.
    let eligible = [];
    try { eligible = (await getFarmTargetsCached(CUR_VID)).filter((t) => t.reportId && t.coord && t.wall != null && t.wall >= wMin && t.wall <= wMax && !(demo[t.reportId] && (now - demo[t.reportId] < COOLDOWN))); }
    catch (e) { pushLog('Muralha: erro ao ler os alvos do assistente (' + (e.message || e) + ').', 'err', 'wall'); config.wall.nextAt = now + 120000; save(); scheduleWall(); return; }
    eligible.sort((a, b) => (b.wall || 0) - (a.wall || 0));
    const pendingWalls = eligible.length;
    // Tropa por aldeia (sob demanda, com cache) — descontada conforme vai assinando alvos.
    const availCache = {};
    const getAvail = async (vid) => { if (!availCache[vid]) { try { availCache[vid] = (await getVillageStateReserved(vid)).avail || {}; } catch (e) { availCache[vid] = {}; } } return availCache[vid]; };
    let count = 0, semTropa = 0, foraAlcance = 0, incertos = 0;
    for (const t of eligible) {
      const pare = devoParar('wall');
      if (pare) { pushLog('Muralha: ciclo interrompido — ' + pare + '.', '', 'wall'); break; }
      const cm = (t.coord || '').match(/(\d+)\|(\d+)/); if (!cm) continue;
      const tx = +cm[1], ty = +cm[2];
      const rams = config.wall.ramMode === 'fixo' ? Math.max(1, config.wall.ramFixed || 20) : ramsForWall(t.wall, config.wall.ramWall6 || 24);
      // aldeias candidatas, da MAIS PRÓXIMA pra mais longe; usa a 1ª que tiver bárbaro + aríete.
      // FILTRO DE DISTÂNCIA: sem ele, quando nenhuma aldeia perto tinha tropa, saíam 80 bárbaros +
      // ~24 aríetes de dezenas de campos de distância — dias de viagem e tropa fácil de interceptar.
      // Usa o alcance do Saque como padrão (mesma frota, mesma lógica de vizinhança).
      const wallMaxDist = config.wall.maxDist != null ? config.wall.maxDist : (config.farm.maxDist != null ? config.farm.maxDist : 13);
      const cands = myV.map((s) => ({ s: s, d: fieldDist(s.x, s.y, tx, ty) })).filter((o) => o.d <= wallMaxDist).sort((a, b) => a.d - b.d);
      if (!cands.length) { foraAlcance++; continue; }
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
          config.wall.ativos[t.coord] = now;   // p/ o card contar quantas quebras estão no ar
          pushLog('Muralha: ' + c.s.name + ' → ' + t.coord + ' (muro ' + t.wall + ', ' + (Math.round(c.d * 10) / 10) + ' campos) com ' + axeN + ' bárbaro + ' + rams + ' aríete' + (spies ? ' + ' + spies + ' explorador' : ''), 'ok', 'wall');
          await sleep(delay + Math.floor(Math.random() * 250));
          break;
        } catch (e) {
          const em = String(e.message || e);
          // Resposta ambígua = PODE ter saído. Tentar outra origem aqui manda 160 bárbaros e 48
          // aríetes num muro que precisava de metade. Assume enviado e para neste alvo.
          if (/^ambiguo:/.test(em)) {
            demo[t.reportId] = now; incertos++; done = true;
            pushLog('Muralha: ' + t.coord + ' — resposta ambígua, pode ter saído. Não repito por outra origem.', '', 'wall');
            break;
          }
          pushLog('Muralha em ' + c.s.name + ' → ' + t.coord + ': ' + em, 'err', 'wall');
        }   // falhou nessa origem -> tenta a próxima
      }
      if (!done) semTropa++;
    }
    if (semTropa) pushLog('Muralha: ' + semTropa + ' alvo(s) sem nenhuma aldeia no alcance com bárbaro+aríete.', '', 'wall');
    if (foraAlcance) pushLog('Muralha: ' + foraAlcance + ' alvo(s) fora do alcance de ' + (config.wall.maxDist != null ? config.wall.maxDist : (config.farm.maxDist != null ? config.farm.maxDist : 13)) + ' campos.', '', 'wall');
    Object.keys(demo).forEach((r) => { if (now - demo[r] > 12 * 3600 * 1000) delete demo[r]; });
    config.wall.sentDemo = demo;
    config.wall.stats = config.wall.stats || {};
    config.wall.stats.pending = pendingWalls;
    config.wall.stats.total = (config.wall.stats.total || 0) + count;
    config.wall.stats.last = count;
    config.wall.stats.active = quebrasNoAr + count;   // as deste ciclo também estão no ar
    config.wall.nextAt = now + Math.max(60, config.wall.interval || 600) * 1000;
    save();
    refreshCards('wall');
    pushLog('Muralha: ciclo concluído — ' + count + ' ataque(s) de quebra' + (incertos ? (' · ' + incertos + ' incerto(s)') : '') + '. Próximo em ' + Math.round((config.wall.interval || 600) / 60) + ' min.', 'ok', 'wall');
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
  // Memoria curta de getAllVillages, COMPARTILHADA. Ela e chamada por varios modulos e
  // leva quebra-cache no fim da URL (_=timestamp), entao NUNCA reaproveitava nada — nem o
  // cache do navegador. Ficou como a ultima fonte de 429 no console do usuario.
  // A lista de aldeias de uma conta muda em escala de dias; 5 min e conservador.
  const VILAS_TTL_MS = 5 * 60000;
  let _vilasCache = null, _vilasAt = 0, _vilasVoo = null;

  async function getAllVillagesCached(forcar) {
    const agora = Date.now();
    if (!forcar && _vilasCache && (agora - _vilasAt) < VILAS_TTL_MS) return _vilasCache;
    if (_vilasVoo) return _vilasVoo;   // ja ha uma leitura em voo: espera ELA
    _vilasVoo = getAllVillages().then((r) => {
      if (!r.incompleto) { _vilasCache = r; _vilasAt = Date.now(); }   // nao guarda resultado degradado
      _vilasVoo = null; return r;
    }, (e) => { _vilasVoo = null; throw e; });
    return _vilasVoo;
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
    if (!vils.length) {
      // Rede de segurança pra não quebrar quem chama — mas SILENCIOSA ela é pior que o erro.
      // getAllVillages alimenta quase todo módulo; se o parse do overview falhar, todos passam a
      // operar numa aldeia só e o painel segue mostrando números plausíveis. Ninguém desconfia:
      // parece que o módulo "achou pouca coisa", não que ele ficou cego pras outras 42 aldeias.
      vils.push({ vid: CUR_VID, name: CUR_NAME });
      vils.incompleto = true;
      pushLog('⚠️ Não consegui ler a lista de aldeias (overview_villages) — vou trabalhar SÓ com a aldeia atual. Se algum módulo parecer que ignorou suas outras aldeias, é isto. Recarregue a página.', 'err');
    }
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
  //
  // RECUO APOS FALHA. Antes, erro era engolido em silencio e o instantaneo nao era salvo —
  // entao `last !== now` seguia verdadeiro e a proxima checagem tentava de novo. Sob 429
  // isso virava: TODA pagina aberta dispara a requisicao, e ela sempre falha.
  // Foi a que apareceu no console do usuario como 429 em overview_villages&mode=units.
  let _unitsProxTentativa = 0;
  async function unitsFetchAndSnapshot() {
    if (Date.now() < _unitsProxTentativa) return;
    try {
      const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=units', { credentials: 'include' });
      if (res.status === 429) { _unitsProxTentativa = Date.now() + 30 * 60000; console.warn('[TWMgr] instantaneo de tropas: 429, tentando de novo em 30 min'); return; }
      if (!res.ok) { _unitsProxTentativa = Date.now() + 10 * 60000; return; }
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
    // NAO no boot imediato. Esta funcao roda em toda pagina, independente de qualquer
    // modulo estar ligado, e disparava junto com o carregamento — competindo com as ~128
    // requisicoes que o proprio jogo faz pra montar a tela. Entra depois da fila de
    // retomada dos modulos, que se estende por ~60s.
    setTimeout(check, 75000);
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
    const colorFor = (delta) => delta > 0 ? '#2f7a2f' : (delta < 0 ? '#a52020' : '#584526');
    const arrowFor = (delta) => delta > 0 ? '↑' : (delta < 0 ? '↓' : '·');

    // 3) Salva snapshot ANTES de calcular deltas (pra ter o de hoje já disponível).
    unitsSaveSnapshot(byVillage, totals, f);

    // 4) Deltas vs snapshots antigos.
    const snapYest = unitsFindSnapshotDaysAgo(1);
    const snap7 = unitsFindSnapshotDaysAgo(7);
    const snap30 = unitsFindSnapshotDaysAgo(30);
    const deltaBlock = (label, snap) => {
      if (!snap || !snap.force) return '<div style="min-width:110px;color:#8a7d6d;font-size:10px">' + label + ': —</div>';
      const dTotal = f.total - (snap.force.total || 0);
      const dAtt = f.att - (snap.force.att || 0);
      const dDef = f.def - (snap.force.def || 0);
      return '<div style="min-width:110px;font-size:10px;line-height:1.4">' +
        '<div style="color:#ddd2c0;font-weight:bold">' + label + '</div>' +
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
    summary.style.cssText = 'margin:6px 0 8px;padding:8px 10px;border:1px solid #a2643a;border-radius:6px;background:linear-gradient(180deg,#f4e4bc,#8b5426);font-size:12px;color:#3b2914;box-shadow:0 1px 2px rgba(0,0,0,.1)';
    const item = (label, val, big) => '<div style="display:flex;flex-direction:column;align-items:center;min-width:80px"><div style="font-size:' + (big ? '16px' : '13px') + ';font-weight:bold;font-variant-numeric:tabular-nums">' + fmt(val) + '</div><div style="font-size:10px;color:#584526">' + label + '</div></div>';
    const sparkBlock = (label, series, color) => '<div style="display:flex;flex-direction:column;align-items:center;min-width:110px">' +
      '<div style="font-size:10px;color:#ddd2c0;font-weight:bold">' + label + ' (' + series.length + 'd)</div>' +
      unitsSparkline(series, 110, 28, color) +
      '</div>';
    summary.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px">' +
        '<div style="font-weight:bold;font-size:11px;color:#ddd2c0">🏰 Resumo (TW Manager) · <span style="font-weight:normal;font-size:10px">' + histKeys.length + ' snapshot' + (histKeys.length === 1 ? '' : 's') + ' no histórico</span></div>' +
        '<button id="twmgr-units-csv" style="padding:2px 8px;font-size:10px;border:1px solid #a2643a;border-radius:4px;background:#8b5426;cursor:pointer;color:#3b2914">📥 baixar histórico CSV</button>' +
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
          '<div style="font-size:10px;color:#ddd2c0;font-weight:bold">total (hoje ' + seriesToday.length + 'pt)</div>' +
          unitsSparkline(seriesToday, 110, 28, '#a2643a') +
        '</div>' +
        sparkBlock('total (30d)', seriesTotal, '#ddd2c0') +
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
    let cellsHtml = '<td style="padding:4px 6px;color:#ddd2c0">TOTAL GERAL</td><td></td>';
    colUnits.forEach((unit) => {
      const n = (unit && totals[unit]) || 0;
      cellsHtml += '<td class="unit-item" style="text-align:center">' + (n > 0 ? fmt(n) : '0') + '</td>';
    });
    const emittedCols = 2 + colUnits.length;
    for (let i = emittedCols; i < nCols; i++) cellsHtml += '<td></td>';
    totalBody.innerHTML = '<tr style="background:linear-gradient(180deg,#f4e4bc,#8b5426);font-weight:bold;font-size:13px;color:#3b2914;border-top:2px solid #a2643a">' + cellsHtml + '</tr>';
    table.appendChild(totalBody);
  }

  async function resolveTargets() {
    const r = config.recruit, map = {};
    const add = (list, targets) => (list || []).forEach((v) => { if (map[v.vid]) return; map[v.vid] = { name: v.coord || v.vid, targets: targets }; });
    let atkV = [], defV = [];
    if (r.groupAtk) { try { atkV = await getVillagesInGroup(r.groupAtk); } catch (e) { pushLog('Recrutar: erro grupo ATK: ' + (e.message || e), 'err'); } }
    if (r.groupDef) { try { defV = await getVillagesInGroup(r.groupDef); } catch (e) { pushLog('Recrutar: erro grupo DEF: ' + (e.message || e), 'err'); } }
    add(atkV, r.profiles.atk.targets); add(defV, r.profiles.def.targets);
    // Grupos adicionais livres (quantos o usuário quiser, cada um ligado a 1 grupo do TW) — resolvidos DEPOIS
    // do ATK/DEF fixo, então uma aldeia que já está no ATK/DEF antigo mantém o comportamento de sempre.
    for (const g of (r.groups || [])) {
      if (!g.groupId) continue;
      let vs = [];
      try { vs = await getVillagesInGroup(g.groupId); } catch (e) { pushLog('Recrutar: erro no grupo "' + (g.name || g.id) + '": ' + (e.message || e), 'err'); continue; }
      add(vs, g.targets || {});
    }
    const anyGroup = r.groupAtk || r.groupDef || (r.groups || []).some((g) => g.groupId);
    if (anyGroup) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} } // reseta grupo p/ "todos"
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
    if (captchaBlocked()) { recruitTimer = setTimeout(recruitTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.recruit.nextAt || 0) > now) { scheduleRecruit(); return; }
    let map;
    try { map = await resolveTargets(); }
    catch (e) { pushLog('Recrutar: erro ao resolver os alvos (' + (e.message || e) + ').', 'err', 'recruit'); config.recruit.nextAt = now + 120000; save(); scheduleRecruit(); return; }
    const vids = Object.keys(map);
    if (!vids.length) { pushLog('Recrutar: nenhum grupo mapeado com aldeias.', '', 'recruit'); config.recruit.nextAt = now + 300000; save(); scheduleRecruit(); return; }
    let totalSent = 0, metas = 0;
    for (const vid of vids) {
      { const pare = devoParar('recruit'); if (pare) { pushLog('Recrutar: ciclo interrompido — ' + pare + '.', '', 'recruit'); break; } }
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
        // "Atingiu a meta" é diferente de "não deu pra recrutar": se faltou recurso, o computeRecruit
        // devolve wantCost > 0 (é a demanda que vai pro Equilíbrio). Sem nada querido, o alvo está cumprido.
        const querendo = wantCost && ((wantCost.wood || 0) + (wantCost.stone || 0) + (wantCost.iron || 0)) > 0;
        if (!querendo) metas++;
        pushLog(nm + ': nada a recrutar — ' + reason + ' (' + qStr + ')', '', 'recruit');
      }
      await sleep(300);
    }
    config.recruit.stats = config.recruit.stats || {};
    config.recruit.stats.villages = vids.length;
    config.recruit.stats.metas = metas;
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
    return '<div style="font-size:11px;color:#8b5426;margin:6px 0 2px">' + label + '</div>' + rows;
  }
  let _twGroupsCache = [];
  async function fillGroupSelects() {
    let groups = [];
    try { groups = await getGroups(); } catch (e) { pushLog('Recrutar: erro ao listar grupos: ' + (e.message || e), 'err'); return; }
    _twGroupsCache = groups;
    [['twmgr-r-gatk', config.recruit.groupAtk], ['twmgr-r-gdef', config.recruit.groupDef], ['twmgr-bm-group', config.map && config.map.group], ['twmgr-farm-group', config.farm && config.farm.group], ['twmgr-bld-group', config.build && config.build.filterGroup], ['twmgr-pq-group', config.research && config.research.filterGroup]].forEach(([id, cur]) => {
      const sel = document.getElementById(id); if (!sel) return;
      sel.innerHTML = '<option value="">— nenhum —</option>' + groups.map((g) => '<option value="' + g.id + '"' + (String(cur) === String(g.id) ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('');
    });
    renderRecruitGroups();
  }
  // ---- Grupos adicionais livres do Recrutar (quantos o usuário quiser, cada um ligado a 1 grupo do TW) ----
  function recruitGroupCardHTML(g) {
    const opts = '<option value="">— nenhum —</option>' + _twGroupsCache.map((gr) => '<option value="' + gr.id + '"' + (String(g.groupId || '') === String(gr.id) ? ' selected' : '') + '>' + esc(gr.name) + '</option>').join('');
    const t = g.targets || {};
    const rows = RUNITS.map(([u, n]) =>
      '<div style="display:flex;align-items:center;gap:5px;margin:1px 0">' +
      '<input type="checkbox" class="twmgr-rg-on" data-gid="' + g.id + '" data-unit="' + u + '"' + (t[u] !== undefined ? ' checked' : '') + '>' +
      unitIcon(u, n) + '<span style="flex:1;font-size:10px">' + n + '</span>' +
      '<input class="twmgr-rg-t twmgr-inp" data-gid="' + g.id + '" data-unit="' + u + '" type="number" min="0" placeholder="∞" value="' + (t[u] != null ? t[u] : '') + '" style="width:60px" title="alvo (vazio = contínuo)">' +
      '</div>').join('');
    return '<div class="twmgr-rg-card" data-gid="' + g.id + '" style="border:1px solid #ece4d8;border-radius:6px;padding:6px;margin-bottom:6px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
      '<input class="twmgr-rg-name twmgr-inp" data-gid="' + g.id + '" type="text" placeholder="nome do perfil" value="' + esc(g.name || '') + '" style="flex:1;font-size:11px">' +
      '<select class="twmgr-rg-grp twmgr-inp" data-gid="' + g.id + '" style="width:130px">' + opts + '</select>' +
      '<span class="twmgr-rg-rm" data-gid="' + g.id + '" title="remover grupo" style="cursor:pointer;color:#c0483a;padding:0 4px;font-weight:bold">✕</span>' +
      '</div>' + rows + '</div>';
  }
  function renderRecruitGroups() {
    const box = document.getElementById('twmgr-rg-list'); if (!box) return;
    const groups = config.recruit.groups || [];
    box.innerHTML = groups.length ? groups.map(recruitGroupCardHTML).join('') : '<div style="color:#8a7d6d;text-align:center;padding:8px;font-size:10px">— nenhum grupo adicional (use o botão abaixo) —</div>';
  }
  function bindRecruitGroupsHandlers() {
    const box = document.getElementById('twmgr-rg-list'); if (!box) return;
    box.addEventListener('change', (e) => {
      const el = e.target, gid = el.getAttribute('data-gid'); if (!gid) return;
      const g = (config.recruit.groups || []).find((x) => x.id === gid); if (!g) return;
      if (el.classList.contains('twmgr-rg-name')) g.name = el.value;
      else if (el.classList.contains('twmgr-rg-grp')) g.groupId = el.value || null;
      else if (el.classList.contains('twmgr-rg-on') || el.classList.contains('twmgr-rg-t')) {
        const u = el.getAttribute('data-unit');
        const cb = box.querySelector('.twmgr-rg-on[data-gid="' + gid + '"][data-unit="' + u + '"]');
        const inp = box.querySelector('.twmgr-rg-t[data-gid="' + gid + '"][data-unit="' + u + '"]');
        const hasNum = inp && inp.value.trim() !== '';
        g.targets = g.targets || {};
        if (!cb.checked && !hasNum) { delete g.targets[u]; }
        else {
          const v = hasNum ? parseInt(inp.value, 10) : null;
          g.targets[u] = (v != null && !Number.isNaN(v)) ? v : null;
          if (hasNum) cb.checked = true;
        }
      }
      save();
    });
    box.addEventListener('click', (e) => {
      const el = e.target, gid = el.getAttribute('data-gid'); if (!gid) return;
      if (el.classList.contains('twmgr-rg-rm')) {
        if (!confirm('Remover este grupo?')) return;
        config.recruit.groups = (config.recruit.groups || []).filter((x) => x.id !== gid);
        save(); renderRecruitGroups();
      }
    });
  }
  function recruitAddGroup() {
    config.recruit.groups = config.recruit.groups || [];
    const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    config.recruit.groups.push({ id: id, name: 'Grupo ' + (config.recruit.groups.length + 1), groupId: null, targets: {} });
    save(); renderRecruitGroups();
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
  function recruitStart() {
    readRecruitCfg();
    const hasCustom = (config.recruit.groups || []).some((g) => g.groupId);
    if (!config.recruit.groupAtk && !config.recruit.groupDef && !hasCustom) { pushLog('Recrutar: mapeie ao menos 1 grupo (ATK, DEF ou um grupo adicional).', 'err', 'recruit'); return; }
    config.recruit.running = true; config.recruit.nextAt = 0; save(); setRecruitStatus(true); pushLog('Recrutar iniciado.', 'ok', 'recruit'); recruitTick();
  }
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

  // ==================== ENVIO (primitivas de ataque/apoio compartilhadas) ====================
  // Sobrou do módulo Fakes, aposentado na v11.16.0. Nada aqui é específico de fake: é o preparo de
  // comando em 2 etapas do jogo (`try=confirm` -> `action=command`) mais helpers de aldeia/pontos.
  // Quem consome: a Central de Comando (fakePrepare, getFakeVillage), o Coordenado (attackPrepare/
  // attackFire) e o Saque (FAKE_POP, carryOf, getVillagePoints). Os nomes com "fake" ficaram por
  // histórico — renomear obrigaria a mexer em 175/180/060 sem ganho real.
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
  // Capacidade de carga de um conjunto de unidades (usa o CARRY declarado lá no topo).
  const carryOf = (units) => Object.keys(units || {}).reduce((s, u) => s + (parseInt(units[u], 10) || 0) * (CARRY[u] || 0), 0);
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
    if (captchaBlocked()) { plannerTimer = setTimeout(plannerTick, 30000); return; }
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
    let vils = []; try { vils = await getAllVillagesCached(); } catch (e) { vils = [{ vid: CUR_VID, name: CUR_NAME }]; }
    _plVilCache = vils;
    const tgtCoord = (atk.targetX && atk.targetY) ? (atk.targetX + '|' + atk.targetY) : '';
    vils.forEach((v) => { v.dist = (v.coord && tgtCoord) ? coordDist(v.coord, tgtCoord) : null; });
    vils.sort((a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist));
    cont.innerHTML = vils.map((v) => {
      const distTxt = v.dist != null ? (' · dist ' + v.dist.toFixed(1)) : '';
      return '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#6f6153;margin:1px 0"><input type="checkbox" class="twmgr-pl-vil" data-vid="' + v.vid + '"' + (atk.selected[v.vid] ? ' checked' : '') + '>' + esc(v.name) + '<span style="color:#8a7d6d">' + distTxt + '</span></label>';
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
      cont.innerHTML = '<div style="font-size:10px;color:#8a7d6d;padding:6px;text-align:center">— marque aldeias acima e clique em <b>🔄 carregar tropas</b> —</div>';
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
      const warnTxt = loaded ? '' : '<span style="color:#c2592c;font-size:9px">⚠ tropas não carregadas</span>';
      const wavesHTML = waves.map((pv, widx) => {
        const kindSel = kindOpt.map(([k, l]) => '<option value="' + k + '"' + (pv.kind === k ? ' selected' : '') + '>' + l + '</option>').join('');
        const arrTxt = baseMs ? fmtArriveLocal(baseMs + (pv.offsetMs || 0)) : '—';
        const grid = UNITS.map(([u, lbl]) => {
          const max = home[u] || 0, cur = (pv.amounts && pv.amounts[u]) || 0;
          return '<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#6f6153"><span style="width:56px">' + unitIcon(u, lbl) + '</span><input class="twmgr-pl-amt" data-vid="' + vid + '" data-widx="' + widx + '" data-u="' + u + '" type="number" min="0" max="' + max + '" value="' + cur + '" style="width:56px" /><span style="color:#8a7d6d">/' + max + '</span></label>';
        }).join('');
        return '<div style="border-top:1px dashed #ece4d8;padding-top:6px;margin-top:6px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px">' +
            '<div style="font-size:10px;color:#8a7d6d">Onda ' + (widx + 1) + '</div>' +
            '<div style="display:flex;gap:4px;align-items:center;font-size:10px">' +
              '<select class="twmgr-pl-kind" data-vid="' + vid + '" data-widx="' + widx + '" style="font-size:10px">' + kindSel + '</select>' +
              '<span>off</span><input class="twmgr-pl-off" data-vid="' + vid + '" data-widx="' + widx + '" type="number" value="' + (pv.offsetMs || 0) + '" step="100" style="width:64px;font-size:10px"><span>ms</span>' +
              '<span class="twmgr-pl-wave-del" data-vid="' + vid + '" data-widx="' + widx + '" title="remover onda" style="cursor:pointer;opacity:.7">✕</span>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:10px;color:#8a7d6d;margin-bottom:4px">→ chega às <b style="color:#6f6153">' + arrTxt + '</b></div>' +
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
      return '<div style="border:1px solid #ece4d8;border-radius:6px;padding:6px;margin:6px 0">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px">' +
          '<div style="font-size:11px;color:#a2643a"><b>' + esc(v.name) + '</b> ' + warnTxt + '</div>' +
          '<span class="twmgr-pl-wave-add" data-vid="' + vid + '" title="adicionar onda" style="cursor:pointer;font-size:10px;color:#a2643a;border:1px dashed #ddd2c0;border-radius:4px;padding:2px 6px">+ onda</span>' +
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
      return '<div class="twmgr-pl-tab' + (active ? ' active' : '') + '" data-id="' + atk.id + '" style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;cursor:pointer;font-size:10px;border:1px solid ' + (active ? '#a2643a' : '#ece4d8') + ';background:' + (active ? 'rgba(162,100,58,.15)' : 'transparent') + ';color:#6f6153">' +
        '<span class="twmgr-pl-tab-dot" style="color:#2e7d3a;display:' + (atk.running ? 'inline' : 'none') + '">●</span>' +
        '<span class="twmgr-pl-tab-name">' + esc(atk.name) + '</span>' +
        '<span class="twmgr-pl-tab-ren" data-id="' + atk.id + '" title="renomear" style="opacity:.6">✎</span>' +
        '<span class="twmgr-pl-tab-del" data-id="' + atk.id + '" title="remover" style="opacity:.6">✕</span>' +
      '</div>';
    }).join('') + '<div id="twmgr-pl-tab-add" title="adicionar ataque" style="padding:3px 8px;border-radius:6px;cursor:pointer;font-size:12px;border:1px dashed #ddd2c0;color:#a2643a">+ ataque</div>';
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
    armed:     { label: 'armado',   color: '#8a7d6d' },
    scheduled: { label: 'agendado', color: '#a2643a' },
    sent:      { label: 'enviado',  color: '#2e7d3a' },
    error:     { label: 'erro',     color: '#c0483a' },
  };

  // Tabela linha-a-linha da fila do ataque ATIVO. Ordenada por sendAt (fallback arriveAt).
  function renderPlannerQueue(atk) {
    const cont = document.getElementById('twmgr-pl-queue'); if (!cont) return;
    const rows = ((atk && atk.rows) || []).slice().sort((a, b) => (a.sendAt || a.arriveAt || 0) - (b.sendAt || b.arriveAt || 0));
    if (!rows.length) {
      cont.innerHTML = '<div style="font-size:10px;color:#8a7d6d;padding:6px;text-align:center">— fila vazia. Arme o ataque pra ver as linhas aqui. —</div>';
      return;
    }
    const vilBy = {}; (_plVilCache || []).forEach((v) => { vilBy[v.vid] = v; });
    const th = 'text-align:left;padding:2px 4px;font-size:9px;color:#8a7d6d;font-weight:normal;border-bottom:1px solid #ece4d8';
    const td = 'padding:2px 4px;font-size:10px;color:#6f6153;vertical-align:middle';
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
          const meta = PL_STATE_META[r.state] || { label: r.state, color: '#8a7d6d' };
          const errTitle = r.state === 'error' && r.error ? (' title="' + esc(String(r.error)) + '"') : '';
          const arrTxt = r.arriveAt ? fmtArriveLocal(r.arriveAt) : '—';
          const sendTxt = r.sendAt ? fmtArriveLocal(r.sendAt) : '—';
          const canCancel = r.state === 'armed' || r.state === 'scheduled';
          const canRemove = r.state === 'sent' || r.state === 'error';
          const actions = canCancel
            ? '<span class="twmgr-pl-queue-cancel" data-id="' + r.id + '" title="cancelar" style="cursor:pointer;color:#c2592c">✕</span>'
            : (canRemove ? '<span class="twmgr-pl-queue-del" data-id="' + r.id + '" title="remover do histórico" style="cursor:pointer;color:#8a7d6d">🗑</span>' : '');
          return '<tr style="border-bottom:1px solid #fdfaf5">' +
            '<td style="' + td + ';color:#8a7d6d">' + (i + 1) + '</td>' +
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

  // ==================== BLINDAGEM (pedidos da tribo do fórum) ====================
  // Puxa a tabela de pedidos do tópico do fórum e monta lista editável de apoios.
  // Regras da tribo: N°/LANC/ESP/SPY/CP separado por barra, mínimo 250/250, zero pra tropas não enviadas.

  async function blindagemFetch(threadUrl) {
    if (!threadUrl) throw new Error('URL do tópico vazia');
    const res = await fetch(threadUrl, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    // Procura em TODAS as tabelas — pega as linhas cujo texto tem coord (x|y) e N inicial.
    const rows = [];
    doc.querySelectorAll('table tr').forEach((tr) => {
      const tds = Array.from(tr.querySelectorAll('td'));
      if (tds.length < 3) return;
      const numText = (tds[0].textContent || '').trim();
      if (!/^\d+$/.test(numText)) return;
      const num = parseInt(numText, 10);
      // Aldeia + coord: procura em qualquer td, tipicamente o 2º
      let name = '', coord = null, x = 0, y = 0, ci = -1;
      for (let i = 1; i < tds.length; i++) {
        const t = (tds[i].textContent || '').replace(/\s+/g, ' ').trim();
        const m = t.match(/^(.*?)\((\d{1,3})\|(\d{1,3})\)/);
        if (m) { name = m[1].trim(); coord = m[2] + '|' + m[3]; x = +m[2]; y = +m[3]; ci = i; break; }
      }
      if (!coord) return;
      // Quantidades: as colunas LOGO DEPOIS da aldeia, na ordem LANC/ESP/SPY/CP.
      // Antes varria todos os tds, removia os zeros e destruturava por posição — dois defeitos
      // somados: (a) o zero sumia, então "250/0/0/100" virava LANC=250 e ESP=100; (b) a célula
      // da aldeia "Nome (500|600)" virava o número 500600 e entrava na lista, deslocando tudo.
      // Resultado: o painel mostrava um pedido que a tribo não fez, e era ele que ia pro envio.
      const val = (i) => {
        const td = tds[i]; if (!td) return 0;
        const t = (td.textContent || '').replace(/\D/g, '');
        return t ? parseInt(t, 10) : 0;
      };
      const ped = { LANC: val(ci + 1), ESP: val(ci + 2), SPY: val(ci + 3), CP: val(ci + 4) };
      rows.push({
        id: 'blz' + num + '-' + coord,
        num: num, name: name, coord: coord, x: x, y: y,
        ped: ped,
        originVid: '',
        send: { LANC: ped.LANC, ESP: ped.ESP, SPY: 0, CP: 0 },
        checked: false,
      });
    });
    // PRESERVA o que era seu. Antes isto sobrescrevia tudo, apagando sem aviso a origem escolhida,
    // as quantidades ajustadas à mão e a marca de já-enviado — e o que já tinha saído voltava a
    // aparecer como pendente. Agora o fórum manda no pedido; o resto é seu e sobrevive.
    const antigas = {};
    (config.planner.blindagem.rows || []).forEach((r) => { antigas[r.id] = r; });
    rows.forEach((r) => {
      const a = antigas[r.id];
      if (!a) return;
      r.originVid = a.originVid || '';
      r.enviadoEm = a.enviadoEm || 0;
      r.checked = r.enviadoEm ? false : !!a.checked;
      // só reaproveita o envio ajustado se o pedido do fórum não mudou
      const mesmoPedido = a.ped && a.ped.LANC === r.ped.LANC && a.ped.ESP === r.ped.ESP
        && a.ped.SPY === r.ped.SPY && a.ped.CP === r.ped.CP;
      if (mesmoPedido && a.send) r.send = a.send;
    });
    config.planner.blindagem.rows = rows;
    config.planner.blindagem.lastFetch = Date.now();
    save();
    return rows;
  }

  async function blindagemSend() { return ocupado(_blindagemSend); }
  async function _blindagemSend() {
    const list = (config.planner.blindagem.rows || []).filter((r) => r.checked && r.originVid);
    if (!list.length) { pushLog('Blindagem: nenhuma linha marcada com origem definida.', 'err'); return; }
    const results = [];
    for (const r of list) {
      const s = r.send || {};
      const amounts = {};
      if (s.LANC > 0) amounts.spear = s.LANC;
      if (s.ESP > 0) amounts.sword = s.ESP;
      if (s.SPY > 0) amounts.spy = s.SPY;
      if (s.CP > 0) amounts.heavy = s.CP;
      const total = (s.LANC || 0) + (s.ESP || 0) + (s.SPY || 0) + (s.CP || 0);
      if (total === 0) { pushLog('Blindagem #' + r.num + ' (' + r.coord + '): sem tropa a enviar — pulado.', '', 'planner'); continue; }
      if ((s.LANC || 0) + (s.ESP || 0) < 250) {
        pushLog('Blindagem #' + r.num + ' (' + r.coord + '): LANC+ESP < 250 (mínimo da tribo) — pulado.', 'err', 'planner');
        continue;
      }
      try {
        await sendAttack(r.originVid, r.x, r.y, amounts, 'support');
        // DESMARCA E GRAVA JÁ. Sem isto, um segundo clique em "Enviar" reenviava tudo que já
        // tinha saído — as aldeias de defesa esvaziavam duas vezes. Grava a cada linha porque
        // a página recarrega, e o que já saiu não pode voltar a aparecer como pendente.
        r.checked = false; r.enviadoEm = Date.now(); save();
        results.push(r);
        pushLog('🛡️ Blindagem #' + r.num + ' → ' + r.coord + ' enviada (' + (s.LANC || 0) + '/' + (s.ESP || 0) + '/' + (s.SPY || 0) + '/' + (s.CP || 0) + ')', 'ok', 'planner');
        await sleep(400);
      } catch (e) {
        const em = String(e.message || e);
        // Ambíguo = pode ter saído. Desmarca também: reenviar apoio dobra a defesa fora de casa.
        if (/^ambiguo:/.test(em)) {
          r.checked = false; r.enviadoEm = Date.now(); save();
          pushLog('🛡️ Blindagem #' + r.num + ' (' + r.coord + '): resposta ambígua, pode ter saído. Desmarquei — confira na tela de comandos antes de reenviar.', '', 'planner');
        } else {
          pushLog('🛡️ Blindagem #' + r.num + ' FALHOU: ' + em, 'err', 'planner');
        }
      }
    }
    // Gera texto do fórum a partir das enviadas
    const text = results.map((r) => {
      const s = r.send;
      return r.num + '/' + (s.LANC || 0) + '/' + (s.ESP || 0) + '/' + (s.SPY || 0) + '/' + (s.CP || 0);
    }).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      pushLog('🛡️ Blindagem: ' + results.length + '/' + list.length + ' apoios enviados. Texto copiado pro clipboard.', 'ok', 'planner');
    } catch (e) {
      pushLog('🛡️ Blindagem: ' + results.length + '/' + list.length + ' apoios enviados. Texto abaixo (copie manualmente):\n' + text, '', 'planner');
    }
    return { sent: results.length, total: list.length, text: text };
  }

  async function renderBlindagemList() {
    const box = document.getElementById('twmgr-blz-list'); if (!box) return;
    const rows = config.planner.blindagem.rows || [];
    if (!rows.length) { box.innerHTML = '<div style="font-size:10px;color:#8a7d6d;padding:6px;text-align:center">— sem pedidos. Cole a URL e clique Buscar. —</div>'; return; }
    let vils = []; try { vils = await getAllVillagesCached(); } catch (e) {}
    const opts = '<option value="">— origem —</option>' + vils.map((v) => '<option value="' + v.vid + '">' + esc(v.name) + '</option>').join('');
    box.innerHTML = rows.map((r) => {
      const s = r.send || { LANC: 0, ESP: 0, SPY: 0, CP: 0 };
      const p = r.ped;
      const originSel = opts.replace('value="' + r.originVid + '"', 'value="' + r.originVid + '" selected');
      return '<div data-blz-id="' + r.id + '" style="border-bottom:1px dashed #ece4d8;padding:4px 2px;font-size:10px;color:#6f6153">' +
        '<div style="display:flex;align-items:center;gap:4px">' +
          '<input type="checkbox" class="blz-chk"' + (r.checked ? ' checked' : '') + '>' +
          '<b>#' + r.num + '</b> · ' + esc(r.name) + ' <span style="color:#a2643a">(' + r.coord + ')</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:4px;margin-top:2px">' +
          '<span style="color:#8a7d6d">origem:</span>' +
          '<select class="blz-origin" style="flex:1;font-size:10px">' + originSel + '</select>' +
        '</div>' +
        '<div style="color:#8a7d6d;margin-top:2px">ped: ' + p.LANC + ' LANC / ' + p.ESP + ' ESP / ' + p.SPY + ' SPY / ' + p.CP + ' CP</div>' +
        '<div style="display:flex;gap:3px;margin-top:2px;flex-wrap:wrap">' +
          '<label style="display:flex;align-items:center;gap:2px">L <input type="number" min="0" class="blz-send" data-u="LANC" value="' + (s.LANC || 0) + '" style="width:52px;font-size:10px"></label>' +
          '<label style="display:flex;align-items:center;gap:2px">E <input type="number" min="0" class="blz-send" data-u="ESP" value="' + (s.ESP || 0) + '" style="width:52px;font-size:10px"></label>' +
          '<label style="display:flex;align-items:center;gap:2px">S <input type="number" min="0" class="blz-send" data-u="SPY" value="' + (s.SPY || 0) + '" style="width:40px;font-size:10px"></label>' +
          '<label style="display:flex;align-items:center;gap:2px">CP <input type="number" min="0" class="blz-send" data-u="CP" value="' + (s.CP || 0) + '" style="width:52px;font-size:10px"></label>' +
        '</div>' +
      '</div>';
    }).join('');
    // Wire eventos
    box.querySelectorAll('[data-blz-id]').forEach((el) => {
      const id = el.getAttribute('data-blz-id');
      const row = rows.find((r) => r.id === id); if (!row) return;
      el.querySelector('.blz-chk').addEventListener('change', (e) => { row.checked = e.target.checked; save(); });
      el.querySelector('.blz-origin').addEventListener('change', (e) => { row.originVid = e.target.value; save(); });
      el.querySelectorAll('.blz-send').forEach((inp) => inp.addEventListener('change', (e) => {
        const u = inp.getAttribute('data-u');
        row.send = row.send || { LANC: 0, ESP: 0, SPY: 0, CP: 0 };
        row.send[u] = Math.max(0, parseInt(inp.value, 10) || 0);
        save();
      }));
    });
  }

  // ==================== PALADINO (treino por XP) ====================
  // O regime de treino escolhido é sempre o de 4h — melhor taxa de XP/hora entre os disponíveis.
  // IMPORTANTE: o id do regime NÃO é fixo — varia por paladino/conta (confirmado: um paladino tinha
  // 4h=id 41, outro tinha 4h=id 36). Por isso nunca hardcodar o id: cada knight traz `usable_regimens`
  // (lista de {id, duration, xp_payout, res_cost}) e escolhemos ali o item com duration === 14400s (4h).
  const PALADIN_REGIMEN_DURATION_S = 14400;
  function paladinPick4hRegimen(k) {
    const opts = (k && k.usable_regimens) || [];
    return opts.find((r) => r.duration === PALADIN_REGIMEN_DURATION_S) || null;
  }

  // Extrai um bloco JSON balanceado (objeto ou array) começando em text[startIdx]. Necessário porque
  // o payload de BuildingStatue.receiveKnightsData tem chaves aninhadas (skills, home_village, etc.) —
  // uma regex com profundidade fixa quebraria com paladinos de árvore de habilidade mais cheia.
  function extractBalancedJSON(text, startIdx) {
    const open = text[startIdx]; if (open !== '{' && open !== '[') return null;
    const close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, strChar = '', esc = false;
    for (let i = startIdx; i < text.length; i++) {
      const c = text[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === strChar) inStr = false; continue; }
      if (c === '"' || c === "'") { inStr = true; strChar = c; continue; }
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) return text.slice(startIdx, i + 1); }
    }
    return null;
  }

  // Uma única página screen=statue (de QUALQUER aldeia) já embute, via
  // BuildingStatue.receiveKnightsData(pendentes, porId, ativoId), o status de TODOS os paladinos da
  // conta — id, aldeia dona, nível/XP, e activity{type,finish_time}. 1 fetch cobre a conta inteira.
  async function getKnightsData(vid) {
    const res = await fetch('/game.php?village=' + (vid || CUR_VID) + '&screen=statue', { credentials: 'include' });
    const html = await res.text();
    const marker = 'BuildingStatue.receiveKnightsData(';
    const idx = html.indexOf(marker);
    if (idx < 0) throw new Error('receiveKnightsData não encontrado (Estátua ainda não construída?)');
    let i = idx + marker.length;
    while (/\s/.test(html[i])) i++;
    const arg1 = extractBalancedJSON(html, i);
    if (!arg1) throw new Error('parse do 1º argumento falhou');
    i += arg1.length;
    while (html[i] === ',' || /\s/.test(html[i])) i++;
    const arg2 = extractBalancedJSON(html, i);
    if (!arg2) throw new Error('parse do 2º argumento falhou');
    let knights;
    try { knights = JSON.parse(arg2); } catch (e) { throw new Error('JSON inválido: ' + (e.message || e)); }
    return knights;   // { "<knightId>": { id, name, level, xp, home_village:{id,...}, activity:{type,finish_time}, ... } }
  }

  // getKnightsData depende da aldeia consultada ter Estátua construída — mas CUR_VID é "onde o
  // usuário está navegando agora" no jogo, não necessariamente uma aldeia com paladino. Tenta
  // CUR_VID primeiro e, se falhar, cai pras aldeias marcadas no ciclo (que por definição têm
  // paladino, logo têm Estátua), evitando que o ciclo pare só porque o usuário trocou de aldeia.
  async function getKnightsDataResilient() {
    const tried = {};
    const candidates = [CUR_VID].concat(Object.keys(config.paladin.villages || {})).filter((v) => v && !tried[v] && (tried[v] = 1));
    let lastErr;
    for (const vid of candidates) {
      try { return await getKnightsData(vid); } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('nenhuma aldeia disponível para leitura');
  }

  // Manda o paladino `knightId` (da aldeia vid) pro regime de treino. Retorna o knight ATUALIZADO
  // (já com o novo activity.finish_time), direto da resposta — sem precisar reconsultar depois.
  async function paladinSendRegimen(vid, knightId, regimenId) {
    const b = new URLSearchParams();
    b.set('knight', String(knightId));
    b.set('regimen', String(regimenId));
    b.set('cheap', '0');
    b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + vid + '&screen=statue&ajaxaction=regimen', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'TribalWars-Ajax': '1', 'X-Requested-With': 'XMLHttpRequest' },
      body: b.toString(),
    });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!j || !j.response || !j.response.knight) throw new Error('resposta inesperada (' + (txt || '').slice(0, 100).replace(/\s+/g, ' ') + ')');
    return j.response.knight;
  }

  // Timer de PRECISÃO: agenda um recheck exatamente duração+30s depois do fim do treino atual dessa
  // aldeia — independente de onde o check periódico (2ª entrada) está no próprio ciclo. É o 2º dos
  // "2 checks" pedidos: garante reenvio quase imediato ao terminar, sem depender só do polling genérico.
  const PALADIN_PISO_MS = 15000;      // piso do recheck; o antigo era 1s e criava laço
  const PALADIN_MIN_ENTRE_MS = 30000; // intervalo mínimo entre dois rechecks da mesma aldeia
  const paladinUltimoPreciso = {};    // vid -> quando o recheck de precisão rodou pela última vez

  function paladinSchedulePrecise(vid, finishAtMs) {
    if (!finishAtMs) return;
    const agora = Date.now();
    const fireAt = finishAtMs + 30000;   // +30s de buffer (cobre o delay entre envios da 3ª entrada)

    // LAÇO DE 1 SEGUNDO — foi isto que derrubou a conta em HTTP 429.
    //
    // Quando o jogo devolvia um finish_time JÁ VENCIDO (paladino que terminou, ou estado
    // preso), o `Math.max(1000, ...)` fazia o recheck cair no piso de 1s. O temporizador
    // APAGAVA A SI MESMO antes de chamar o recheck, então a guarda de duplicidade logo
    // abaixo não encontrava nada e deixava reagendar — 1s de novo, para sempre, com um
    // screen=statue por volta.
    // Medido na conta do usuário: 7 requisições por minuto com só este módulo ligado,
    // 420/h, e o servidor passou a recusar TUDO com 429, inclusive dos outros módulos.
    //
    // Duas travas, porque uma só já falhou: não agenda pra hora vencida (o check periódico
    // cobre), e não deixa a mesma aldeia repetir antes do intervalo mínimo.
    if (fireAt <= agora) return;
    const ultimo = paladinUltimoPreciso[vid] || 0;
    if (agora - ultimo < PALADIN_MIN_ENTRE_MS) return;

    const cur = paladinPreciseTimers[vid];
    if (cur && cur.finishAt === finishAtMs) return;   // já agendado pra esse horário exato
    if (cur) clearTimeout(cur.id);
    const delay = Math.max(PALADIN_PISO_MS, fireAt - agora);
    const id = setTimeout(() => {
      delete paladinPreciseTimers[vid];
      paladinUltimoPreciso[vid] = Date.now();
      paladinCheckAndSend(vid);
    }, delay);
    paladinPreciseTimers[vid] = { id: id, finishAt: finishAtMs };
  }

  // Rotina central: lê o status de todos os paladinos (1 fetch) e, pra cada aldeia SELECIONADA, ou
  // manda treinar (se livre) ou agenda o timer de precisão (se já treinando). Aceita `onlyVid` pra
  // rodar só numa aldeia específica (chamado pelo próprio timer de precisão).
  async function paladinCheckAndSend(onlyVid) {
    if (!config.paladin.running) return 0;
    if (lockOther() || captchaBlocked()) return 0;
    const villages = onlyVid ? [String(onlyVid)] : Object.keys(config.paladin.villages || {}).filter((v) => config.paladin.villages[v]);
    if (!villages.length) return 0;
    let knights;
    try { knights = await getKnightsDataResilient(); }
    catch (e) { pushLog('Paladino: erro ao ler status (' + (e.message || e) + ').', 'err', 'paladin'); return 0; }
    const byVid = {};
    Object.values(knights).forEach((k) => { if (k && k.home_village) byVid[String(k.home_village.id)] = k; });
    config.paladin.state = config.paladin.state || {};
    let sent = 0;
    for (let idx = 0; idx < villages.length; idx++) {
      const vid = villages[idx];
      const k = byVid[vid];
      const st = config.paladin.state[vid] = config.paladin.state[vid] || {};
      if (!k) { st.status = 'sem-paladino'; st.finishAt = null; continue; }
      st.knightId = k.id; st.name = k.name; st.level = k.level;
      const activity = k.activity || {};
      st.status = activity.type || 'home';
      if (activity.type === 'training') {
        st.finishAt = activity.finish_time ? (+activity.finish_time) * 1000 : null;
        if (st.finishAt) paladinSchedulePrecise(vid, st.finishAt);
        continue;
      }
      if (activity.type && activity.type !== 'home') {
        // ocupado (atacando/apoiando/viajando/recrutando etc.) -> pula pro próximo, mas se o jogo
        // informar finish_time, mostra a contagem regressiva e agenda o recheck de precisão pra
        // retomar o treino assim que o paladino ficar livre de novo (ida+volta do ataque, etc.).
        st.finishAt = activity.finish_time ? (+activity.finish_time) * 1000 : null;
        if (st.finishAt) paladinSchedulePrecise(vid, st.finishAt);
        continue;
      }
      // livre em casa -> manda pro regime de 4h (id varia por paladino, resolvido via usable_regimens)
      const regimen4h = paladinPick4hRegimen(k);
      if (!regimen4h) { st.status = 'sem-regime-4h'; pushLog('Paladino: ' + (k.name || vid) + ' (' + vid + ') não tem regime de 4h disponível agora.', 'err', 'paladin'); continue; }
      try {
        const upd = await paladinSendRegimen(vid, k.id, regimen4h.id);
        st.status = (upd.activity && upd.activity.type) || 'training';
        st.finishAt = (upd.activity && upd.activity.finish_time) ? (+upd.activity.finish_time) * 1000 : null;
        pushLog('Paladino: ' + (k.name || vid) + ' (' + vid + ') → treino 4h' + (st.finishAt ? (', chega ' + new Date(st.finishAt).toLocaleTimeString()) : '') + '.', 'ok', 'paladin');
        if (st.finishAt) paladinSchedulePrecise(vid, st.finishAt);
        sent++;
      } catch (e) { pushLog('Paladino em ' + (k.name || vid) + ': ' + (e.message || e), 'err', 'paladin'); }
      if (idx < villages.length - 1) await sleep(Math.max(0, config.paladin.sendDelayMs || 500));
    }
    save();
    refreshCards('paladin'); renderPaladinStatus();
    return sent;
  }

  // Check periódico genérico (2ª entrada) — rede de segurança ampla, independente do timer de precisão.
  async function paladinTick() {
    clearTimeout(paladinTimer);
    if (!config.paladin.running) return;
    if (lockOther()) { paladinTimer = setTimeout(paladinTick, 5000); return; }
    if (captchaBlocked()) { paladinTimer = setTimeout(paladinTick, 30000); return; }
    claimLock();
    let sent = 0;
    try { sent = await paladinCheckAndSend(); } catch (e) { pushLog('Paladino: erro no ciclo (' + (e.message || e) + ').', 'err', 'paladin'); }
    const intervalMs = Math.max(1, config.paladin.checkIntervalMin || 240) * 60000;
    pushLog('Paladino: ciclo concluído — ' + sent + ' envio(s). Próximo check em ' + Math.round(intervalMs / 60000) + ' min.', 'ok', 'paladin');
    paladinTimer = setTimeout(paladinTick, intervalMs);
  }
  function readPaladinCfg() {
    const c = config.paladin, g = (id) => document.getElementById(id);
    if (g('twmgr-pd-interval')) c.checkIntervalMin = Math.max(1, parseInt(g('twmgr-pd-interval').value, 10) || 240);
    if (g('twmgr-pd-delay')) { const v = parseInt(g('twmgr-pd-delay').value, 10); c.sendDelayMs = (isNaN(v) || v < 0) ? 500 : v; }
    const vs = {}; document.querySelectorAll('.twmgr-pd-vil').forEach((cb) => { if (cb.checked) vs[cb.getAttribute('data-vid')] = true; });
    c.villages = vs;
    save();
  }
  function setPaladinStatus(on) { setBtnState('twmgr-pd-start', 'twmgr-pd-stop', on, '● Ativo', '▶ Iniciar ciclo'); }
  function paladinStart() {
    readPaladinCfg();
    if (!Object.keys(config.paladin.villages).length) { pushLog('Paladino: marque ao menos 1 aldeia.', 'err', 'paladin'); return; }
    config.paladin.running = true; save();
    setPaladinStatus(true);
    pushLog('Paladino: ciclo iniciado — ' + Object.keys(config.paladin.villages).length + ' aldeia(s), check a cada ' + config.paladin.checkIntervalMin + ' min, delay ' + config.paladin.sendDelayMs + 'ms.', 'ok', 'paladin');
    paladinTick();
  }
  function paladinStop() {
    readPaladinCfg();
    config.paladin.running = false; save();
    clearTimeout(paladinTimer);
    Object.keys(paladinPreciseTimers).forEach((vid) => { clearTimeout(paladinPreciseTimers[vid].id); delete paladinPreciseTimers[vid]; });
    setPaladinStatus(false);
    pushLog('Paladino: ciclo parado.', '', 'paladin');
  }
  async function renderPaladinVillages() {
    const cont = document.getElementById('twmgr-pd-villages'); if (!cont) return;
    cont.innerHTML = '<div style="font-size:10px;color:#8a7d6d;padding:6px;text-align:center">carregando…</div>';
    let vils = []; try { vils = await getAllVillagesCached(); } catch (e) { vils = [{ vid: CUR_VID, name: CUR_NAME }]; }
    let knights = null, lastErr = null;
    const order = [CUR_VID].concat(vils.map((v) => v.vid)).filter((v, i, arr) => v && arr.indexOf(v) === i);
    for (const vid of order) { try { knights = await getKnightsData(vid); break; } catch (e) { lastErr = e; } }
    if (!knights) { cont.innerHTML = '<div style="font-size:10px;color:#c0483a;padding:6px;text-align:center">Erro ao ler paladinos (' + esc((lastErr && lastErr.message) || String(lastErr)) + ')</div>'; return; }
    const withKnight = {};
    Object.values(knights).forEach((k) => { if (k && k.home_village) withKnight[String(k.home_village.id)] = true; });
    vils = vils.filter((v) => withKnight[v.vid]);   // só aldeias com paladino entram na lista de seleção
    if (!vils.length) { cont.innerHTML = '<div style="font-size:10px;color:#8a7d6d;padding:6px;text-align:center">— nenhuma aldeia com paladino —</div>'; return; }
    const sel = config.paladin.villages || {};
    cont.innerHTML = vils.map((v) => '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#6f6153;margin:1px 0"><input type="checkbox" class="twmgr-pd-vil" data-vid="' + v.vid + '"' + (sel[v.vid] ? ' checked' : '') + '>' + esc(v.name) + '</label>').join('');
    cont.querySelectorAll('.twmgr-pd-vil').forEach((cb) => cb.addEventListener('change', readPaladinCfg));
  }
  const PALADIN_STATUS_LABEL = { home: '🟢 livre', training: '⏳ treinando', travel: '🚶 viajando', recruiting: '🐣 recrutando', attack: '⚔️ atacando', attacking: '⚔️ atacando', support: '🛡️ apoiando', 'sem-paladino': '— sem paladino', 'sem-regime-4h': '⚠️ sem regime 4h' };
  function renderPaladinStatus() {
    const cont = document.getElementById('twmgr-pd-status-list'); if (!cont) return;
    const villages = Object.keys(config.paladin.villages || {}).filter((v) => config.paladin.villages[v]);
    if (!villages.length) { cont.innerHTML = '<div style="font-size:10px;color:#8a7d6d;padding:6px;text-align:center">— marque aldeias acima —</div>'; return; }
    const now = Date.now();
    cont.innerHTML = villages.map((vid) => {
      const st = (config.paladin.state && config.paladin.state[vid]) || {};
      // status desconhecido (tipo de activity que ainda não vimos) -> mostra genérico "ocupado" em
      // vez de esconder, já que o código já garante que ele será pulado até ficar livre de novo.
      const label = PALADIN_STATUS_LABEL[st.status] || (st.status ? ('⚔️ ocupado (' + st.status + ')') : '—');
      const rest = st.finishAt && st.finishAt > now ? fmt(st.finishAt - now) : '';
      return '<div style="display:flex;justify-content:space-between;gap:6px;font-size:10px;color:#6f6153;padding:2px 0;border-bottom:1px solid rgba(0,0,0,.07)">' +
        '<span>' + esc(st.name || ('ID ' + vid)) + (st.level != null ? (' (nv.' + st.level + ')') : '') + '</span>' +
        '<span>' + label + (rest ? ' · ' + rest : '') + '</span>' +
      '</div>';
    }).join('');
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
    const cap = {}; keys.forEach((k) => { cap[k] = Math.max(0, (avail[k] || 0) - (reserve[k] || 0)); });
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
  const MARKET_PASS = { cunhagem: () => cunhagemPass(), equilibrio: () => equilibrioPass(), solidario: () => solidarioPass() };
  async function marketTick(modeKey) {
    clearTimeout(marketTimers[modeKey]);
    const st = config.market.modes[modeKey];
    if (!st.running) return;
    if (lockOther()) { marketTimers[modeKey] = setTimeout(() => marketTick(modeKey), 5000); return; }
    if (captchaBlocked()) { marketTimers[modeKey] = setTimeout(() => marketTick(modeKey), 30000); return; }
    claimLock();
    const now = Date.now();
    if (st.stopAt && now >= st.stopAt) {
      st.running = false; st.stopAt = 0; save();
      clearTimeout(marketTimers[modeKey]);
      setMarketStatus(modeKey, false);
      pushLog('Mercado (' + MARKET_MODE_LABEL[modeKey] + '): parada programada atingida — desligado automaticamente.', 'ok', 'market');
      return;
    }
    if ((st.nextAt || 0) > now) { scheduleMarket(modeKey); return; }
    try { await MARKET_PASS[modeKey](); }
    catch (e) { pushLog('Mercado (' + MARKET_MODE_LABEL[modeKey] + '): erro no ciclo (' + (e.message || e) + ').', 'err', 'market'); }
    st.nextAt = now + Math.max(60, config.market.interval || 600) * 1000;
    save();
    refreshCards('market');
    pushLog('Mercado (' + MARKET_MODE_LABEL[modeKey] + '): próximo ciclo em ' + Math.round((config.market.interval || 600) / 60) + ' min.', '', 'market');
    scheduleMarket(modeKey);
  }
  function scheduleMarket(modeKey) { clearTimeout(marketTimers[modeKey]); const st = config.market.modes[modeKey]; if (!st.running) return; marketTimers[modeKey] = setTimeout(() => marketTick(modeKey), Math.min(Math.max((st.nextAt || 0) - Date.now(), 1000), 60000)); }

  async function cunhagemPass() {
    const destCoords = (config.market.destCoords || []).filter(Boolean);
    if (!destCoords.length) { pushLog('Cunhagem: nenhum destino configurado.', 'err', 'market'); return; }
    const reserve = {
      wood: Math.max(0, config.market.reserveWood || 0),
      stone: Math.max(0, config.market.reserveStone || 0),
      iron: Math.max(0, config.market.reserveIron || 0),
    };
    let vils = [];
    try { vils = await getAllVillagesCached(); } catch (e) { pushLog('Cunhagem: erro ao listar aldeias (' + (e.message || e) + ').', 'err', 'market'); return; }

    // doadoras elegíveis = união dos grupos de origem (vazio = todas as aldeias, menos as de destino)
    const srcGroups = config.market.cunhagemSourceGroups || [];
    const srcSet = {};
    if (srcGroups.length) {
      for (const gid of srcGroups) {
        try { (await getVillagesInGroup(gid)).forEach((v) => { srcSet[v.vid] = true; }); }
        catch (e) { pushLog('Cunhagem: erro ao listar grupo ' + gid + ' (' + (e.message || e) + ').', 'err', 'market'); }
      }
    } else {
      vils.forEach((v) => { srcSet[v.vid] = true; });   // "nenhum" grupo de origem selecionado = todas as aldeias
    }
    const destSet = {}; vils.forEach((v) => { if (v.coord && destCoords.includes(v.coord)) destSet[v.vid] = true; });

    let count = 0; const tot = { wood: 0, stone: 0, iron: 0 };
    for (const v of vils) {
      { const pare = devoParar('market'); if (pare) { pushLog('Cunhagem: interrompida — ' + pare + '.', '', 'market'); break; } }
      if (!srcSet[v.vid]) continue;
      if (destSet[v.vid]) continue;   // nunca doa pra si mesma se também for destino
      if (!v.coord) continue;
      const coord = destCoords.map((c) => ({ c: c, d: coordDist(v.coord, c) })).sort((a, b) => a.d - b.d)[0].c;   // destino mais perto
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

    let coins = 0, mintCount = 0;
    if (config.market.autoMint) {
      const destVils = vils.filter((v) => destSet[v.vid]);
      for (const v of destVils) {
        { const pare = devoParar('market'); if (pare) { pushLog('Cunhagem: cunhagem automática interrompida — ' + pare + '.', '', 'market'); break; } }
        try {
          const r = await mintCoins(v.vid);
          if (r.minted > 0) { mintCount++; coins += r.minted; pushLog('Cunhagem: ' + v.name + ' cunhou ' + r.minted + ' moeda(s).', 'ok', 'market'); }
        } catch (e) { pushLog('Cunhagem automática em ' + v.name + ': ' + (e.message || e), 'err', 'market'); }
        await sleep(400 + Math.floor(Math.random() * 400));
      }
    }

    config.market.modes.cunhagem.stats = { sending: count, receiving: destCoords.length, wood: tot.wood, stone: tot.stone, iron: tot.iron, coins: coins };
    pushLog('Cunhagem: ciclo concluído — ' + count + ' aldeia(s) enviaram recurso' + (config.market.autoMint ? ', ' + coins + ' moeda(s) cunhada(s) em ' + mintCount + ' aldeia(s)' : '') + '.', 'ok', 'market');
  }

  // ---- Cunhar moedas de ouro (Academia / screen=snob) ----
  // Lê a tela da Academia e parseia o PRÓPRIO formulário de cunhagem (sem hardcode de endpoint),
  // igual o Mercado faz no confirm de envio. Retorna o form (action+campos), o nome do campo de
  // quantidade e o máximo cunhável agora (o "(N)" que o jogo já calcula, com custo escalado).
  async function getSnobState(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=snob', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const numOf = (id) => { const el = doc.getElementById(id); return el ? (parseInt((el.textContent || '').replace(/\D/g, ''), 10) || 0) : 0; };
    const resNow = { wood: numOf('wood'), stone: numOf('stone'), iron: numOf('iron') };
    // form de cunhagem: o único cujo action contém action=coin (o de nobre é action diferente)
    const form = doc.querySelector('form[action*="action=coin"]');
    let action = null, fields = {}, countName = 'count', maxMint = 0;
    if (form) {
      action = form.getAttribute('action');
      form.querySelectorAll('input, select').forEach((el) => { if (el.name && el.type !== 'submit' && el.type !== 'button') fields[el.name] = el.value; });
      const ci = form.querySelector('input[type="text"], input[type="number"], input:not([type])');
      if (ci && ci.name) countName = ci.name;
      // "(N)" = máximo cunhável agora (o jogo já considera o custo por moeda, que escala com nobres)
      const mm = (form.textContent || '').match(/\((\d+)\)/);
      if (mm) maxMint = parseInt(mm[1], 10) || 0;
    }
    return { resNow: resNow, hasForm: !!form, action: action, fields: fields, countName: countName, maxMint: maxMint };
  }
  async function mintCoins(vid) {
    const st = await getSnobState(vid);
    if (!st.hasForm) throw new Error('sem formulário de cunhagem (a aldeia tem Academia?)');
    const n = st.maxMint;
    if (n < 1) return { minted: 0, res: st.resNow };
    const body = new URLSearchParams();
    Object.entries(st.fields).forEach(([k, v]) => body.set(k, v));
    body.set(st.countName, String(n));
    if (!body.has('h')) body.set('h', CSRF);
    const r = await fetch(absUrl(st.action), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    const t = await r.text();
    try { const d = new DOMParser().parseFromString(t, 'text/html'); const eb = d.querySelector('.error_box'); if (eb && (eb.textContent || '').trim()) throw new Error('recusado: ' + eb.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)); } catch (e) { if (/^recusado:/.test(e.message)) throw e; }
    return { minted: n, res: st.resNow };
  }
  function coordDist(a, b) { const pa = a.split('|').map(Number), pb = b.split('|').map(Number); return Math.sqrt((pa[0] - pb[0]) * (pa[0] - pb[0]) + (pa[1] - pb[1]) * (pa[1] - pb[1])); }
  async function equilibrioPass() {
    let vils = [];
    try { vils = await getAllVillagesCached(); } catch (e) { pushLog('Equilíbrio: erro ao listar aldeias (' + (e.message || e) + ').', 'err', 'market'); return; }
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
        { const pare = devoParar('market'); if (pare) { pushLog('Equilíbrio: interrompido — ' + pare + '.', '', 'market'); return; } }
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
    config.market.modes.equilibrio.stats = { sending: Object.keys(donorSet).length, receiving: Object.keys(recvSet).length, wood: totRes.wood, stone: totRes.stone, iron: totRes.iron };
    save();
    pushLog('Equilíbrio: ciclo concluído — ' + sent + ' transferência(s), limiar ' + Math.round(pct * 100) + '%.', 'ok', 'market');
  }

  // ---- Solidário: as aldeias do grupo escolhido SÓ RECEBEM (nunca doam). Doadoras são TODAS as outras
  // aldeias (qualquer uma fora do grupo), testadas da mais próxima pra mais longe — se a mais próxima não
  // tiver mercador livre/recurso suficiente, tenta a próxima mais próxima, e assim por diante. Proteções:
  // 1) piso normal = % (editável) do recurso mais baixo que a doadora TEM agora, com piso mínimo absoluto de segurança.
  // 2) gargalo (ninguém passa no piso normal): a mais próxima cede só a fatia acima de X% (editável, padrão 90%)
  //    do que ela já tem — ou seja, fica sempre com pelo menos X% do que possui, nunca esvazia.
  const SOLID_MIN_SEND = 100;
  const SOLID_ABS_MIN = { wood: 500, stone: 500, iron: 200 };   // piso mínimo absoluto do doador, só de segurança (não editável)
  async function solidarioPass() {
    const gid = config.market.groupSolidario;
    if (!gid) { pushLog('Solidário: nenhum grupo selecionado.', 'err', 'market'); return; }
    let recvMembers = [];
    try { recvMembers = (await getVillagesInGroup(gid)).map((x) => ({ vid: x.vid, coord: x.coord, name: x.coord })); }
    catch (e) { pushLog('Solidário: erro ao listar grupo (' + (e.message || e) + ').', 'err', 'market'); return; }
    recvMembers = recvMembers.filter((v) => v.coord);
    if (!recvMembers.length) { pushLog('Solidário: grupo sem aldeias, nada a fazer.', '', 'market'); return; }
    const recvSetIds = {}; recvMembers.forEach((v) => { recvSetIds[v.vid] = true; });
    let allV = [];
    try { allV = await getAllVillagesCached(); } catch (e) { pushLog('Solidário: erro ao listar todas as aldeias (' + (e.message || e) + ').', 'err', 'market'); return; }
    const donorPool = allV.filter((v) => v.coord && !recvSetIds[v.vid]);
    if (!donorPool.length) { pushLog('Solidário: nenhuma aldeia fora do grupo pra doar.', 'err', 'market'); return; }
    const donorSet = {}, recvSet = {}, totRes = { wood: 0, stone: 0, iron: 0 };
    const pct = (config.market.solidarioThresholdPct != null ? config.market.solidarioThresholdPct : 50) / 100;
    const donorPct = (config.market.solidarioDonorPct != null ? config.market.solidarioDonorPct : 50) / 100;
    const donorMinPct = (config.market.solidarioDonorMinPct != null ? config.market.solidarioDonorMinPct : 50) / 100;
    const keepPct = (config.market.solidarioGargaloKeepPct != null ? config.market.solidarioGargaloKeepPct : 90) / 100;
    const maxDist = config.market.solidarioMaxDist != null ? config.market.solidarioMaxDist : 20;
    const now = Date.now();
    config.market.inflight = config.market.inflight || {};
    Object.keys(config.market.inflight).forEach((vid) => {
      config.market.inflight[vid] = (config.market.inflight[vid] || []).filter((e) => e.arriveAt > now);
      if (!config.market.inflight[vid].length) delete config.market.inflight[vid];
    });
    const inSum = (vid, r) => (config.market.inflight[vid] || []).reduce((s, e) => s + (e.r === r ? e.amt : 0), 0);
    // piso normal do doador pro recurso r: % do recurso mais baixo que ELE tem agora (protege mais quem já tá capenga
    // em algum recurso, mesmo doando um recurso abundante), com piso mínimo absoluto por baixo.
    const donorFloor = (s, r) => Math.max((Math.min(s.cur.wood, s.cur.stone, s.cur.iron)) * donorPct, SOLID_ABS_MIN[r] || 0);
    // piso INDEPENDENTE do limiar de carência (thr): "quão cheia preciso estar desse recurso pra não ser
    // considerada carente demais pra doar ele". Separado de thr de propósito — se o limiar de carência for
    // configurado agressivo (ex.: 85%, "deixa todo mundo quase cheio"), isso NÃO pode travar todo mundo de
    // doar, senão nenhuma aldeia nunca fica "cheia o bastante" e o Solidário para de mandar qualquer coisa.
    const donorMinFor = (s) => s.storage * donorMinPct;
    const st = [];
    for (const v of recvMembers.concat(donorPool)) {
      let m; try { m = await getMarketState(v.vid); } catch (e) { continue; }
      if (!m.storage) continue;
      st.push({ vid: v.vid, coord: v.coord, name: v.name, isRecv: !!recvSetIds[v.vid], cur: { wood: m.wood, stone: m.stone, iron: m.iron }, cap: m.capacity, storage: m.storage, thr: m.storage * pct });
      await sleep(120);
    }
    let sent = 0;
    for (const r of ['wood', 'stone', 'iron']) {
      const receivers = st.filter((s) => s.isRecv).map((s) => ({ s: s, eff: s.cur[r] + inSum(s.vid, r) }))
        .filter((x) => x.eff < x.s.thr).map((x) => ({ s: x.s, def: x.s.thr - x.eff })).sort((a, b) => b.def - a.def);
      for (const rec of receivers) {
        if (rec.def <= 0) continue;
        let covered = false;
        // passo normal: só doa quem tem excedente acima do próprio piso (recurso mais baixo × %), mais perto primeiro.
        // "s.cur[r] >= donorMinFor(s)" é essencial: sem isso, uma aldeia carente NESSE MESMO recurso podia ainda
        // passar no piso do doador (que usa o recurso mais baixo dela como base, uma conta separada) e acabar
        // doando o próprio recurso que está faltando nela. Usa donorMinPct (independente do limiar de carência).
        // "!s.isRecv" garante que só aldeias FORA do grupo Solidário entram como doadoras.
        const donors = st.filter((s) => !s.isRecv && s.vid !== rec.s.vid && s.cap > 0 && s.cur[r] >= donorMinFor(s) && s.cur[r] > donorFloor(s, r))
          .map((s) => ({ s: s, exc: s.cur[r] - donorFloor(s, r), d: coordDist(s.coord, rec.s.coord) }))
          .filter((x) => x.d <= maxDist)
          .sort((a, b) => a.d - b.d);
        for (const don of donors) {
          if (rec.def <= 0) { covered = true; break; }
          const amount = Math.floor(Math.min(don.exc, rec.def, don.s.cap));
          if (amount < SOLID_MIN_SEND) continue;   // essa doadora não ajuda o bastante -> tenta a próxima mais perto
          try {
            const pkg = { wood: 0, stone: 0, iron: 0 }; pkg[r] = amount;
            const dur = await sendMarketResources(don.s.vid, rec.s.coord, pkg);
            sent++; donorSet[don.s.vid] = 1; recvSet[rec.s.vid] = 1; totRes[r] += amount; covered = true;
            don.s.cur[r] -= amount; don.s.cap -= amount; rec.def -= amount; don.exc -= amount;
            config.market.inflight[rec.s.vid] = config.market.inflight[rec.s.vid] || [];
            config.market.inflight[rec.s.vid].push({ r: r, amt: amount, arriveAt: now + ((dur && dur > 0 ? dur : 3600) * 1000) });
            pushLog('Solidário: ' + don.s.name + ' → ' + rec.s.coord + ' (' + amount + ' ' + ({ wood: 'madeira', stone: 'argila', iron: 'ferro' }[r]) + ')', 'ok', 'market');
            await sleep(400 + Math.floor(Math.random() * 300));
          } catch (e) { pushLog('Solidário em ' + don.s.name + ': ' + (e.message || e), 'err', 'market'); }
        }
        // gargalo geral: ninguém passou no piso normal desse recurso -> a mais próxima cede só a fatia
        // acima de keepPct (padrão 90%) do que ela TEM agora, ficando sempre com pelo menos keepPct do que possui.
        if (!covered && rec.def > 0) {
          // mesma proteção do passo normal: mesmo no gargalo, nunca puxa de quem já está carente NESSE recurso,
          // e nunca de quem é do próprio grupo Solidário (só recebe, nunca doa).
          const fallback = st.filter((s) => !s.isRecv && s.vid !== rec.s.vid && s.cap > 0 && s.cur[r] >= donorMinFor(s) && s.cur[r] > 0)
            .map((s) => ({ s: s, d: coordDist(s.coord, rec.s.coord) }))
            .filter((x) => x.d <= maxDist)
            .sort((a, b) => a.d - b.d);
          for (const don of fallback) {
            if (rec.def <= 0) break;
            const amount = Math.floor(Math.min(don.s.cur[r] * (1 - keepPct), rec.def, don.s.cap));
            if (amount < SOLID_MIN_SEND) continue;
            try {
              const pkg = { wood: 0, stone: 0, iron: 0 }; pkg[r] = amount;
              const dur = await sendMarketResources(don.s.vid, rec.s.coord, pkg);
              sent++; donorSet[don.s.vid] = 1; recvSet[rec.s.vid] = 1; totRes[r] += amount;
              don.s.cur[r] -= amount; don.s.cap -= amount; rec.def -= amount;
              config.market.inflight[rec.s.vid] = config.market.inflight[rec.s.vid] || [];
              config.market.inflight[rec.s.vid].push({ r: r, amt: amount, arriveAt: now + ((dur && dur > 0 ? dur : 3600) * 1000) });
              pushLog('Solidário (gargalo, mantendo ' + Math.round(keepPct * 100) + '% da doadora): ' + don.s.name + ' → ' + rec.s.coord + ' (' + amount + ' ' + ({ wood: 'madeira', stone: 'argila', iron: 'ferro' }[r]) + ')', 'ok', 'market');
              await sleep(400 + Math.floor(Math.random() * 300));
            } catch (e) { pushLog('Solidário em ' + don.s.name + ': ' + (e.message || e), 'err', 'market'); }
            break;   // só a mais próxima, uma vez, dose reduzida -> não drena várias aldeias já apertadas
          }
        }
      }
    }
    config.market.modes.solidario.stats = { sending: Object.keys(donorSet).length, receiving: Object.keys(recvSet).length, wood: totRes.wood, stone: totRes.stone, iron: totRes.iron };
    save();
    pushLog('Solidário: ciclo concluído — ' + sent + ' transferência(s), limiar ' + Math.round(pct * 100) + '%.', 'ok', 'market');
  }
  async function fillMarketSolidarioGroupSelect() {
    const sel = document.getElementById('twmgr-mk-g-solid'); if (!sel) return;
    let groups = [];
    try { groups = await getGroups(); } catch (e) { pushLog('Solidário: erro ao listar grupos: ' + (e.message || e), 'err', 'market'); return; }
    const cur = config.market.groupSolidario;
    sel.innerHTML = '<option value="">— nenhum —</option>' + groups.map((gr) => '<option value="' + gr.id + '"' + (String(cur) === String(gr.id) ? ' selected' : '') + '>' + esc(gr.name) + '</option>').join('');
  }
  async function renderMarketCunhagemGroups() {
    const cont = document.getElementById('twmgr-mk-srcgroups'); if (!cont) return;
    let groups = [];
    try { groups = await getGroups(); } catch (e) { pushLog('Cunhagem: erro ao listar grupos: ' + (e.message || e), 'err', 'market'); return; }
    const cur = config.market.cunhagemSourceGroups || [];
    const rowHtml = (gid, name, checked) => '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#6f6153;margin:1px 0"><input type="checkbox" class="twmgr-mk-srcgrp" data-gid="' + gid + '"' + (checked ? ' checked' : '') + '>' + esc(name) + '</label>';
    cont.innerHTML = rowHtml('', 'nenhum (= todas as aldeias, menos as de destino)', !cur.length) +
      groups.map((gr) => rowHtml(gr.id, gr.name, cur.includes(gr.id))).join('');
    // "nenhum" e os grupos específicos são mutuamente exclusivos: marcar "nenhum" desmarca o resto
    // (= todas as aldeias), e marcar qualquer grupo específico desmarca "nenhum".
    cont.querySelectorAll('.twmgr-mk-srcgrp').forEach((cb) => cb.addEventListener('change', () => {
      if (cb.getAttribute('data-gid') === '') { if (cb.checked) cont.querySelectorAll('.twmgr-mk-srcgrp').forEach((o) => { if (o !== cb) o.checked = false; }); }
      else if (cb.checked) { const none = cont.querySelector('.twmgr-mk-srcgrp[data-gid=""]'); if (none) none.checked = false; }
      readMarketCfg();
    }));
  }
  function readMarketCfg() {
    const c = config.market, g = (id) => document.getElementById(id);
    if (g('twmgr-mk-destcoords')) c.destCoords = g('twmgr-mk-destcoords').value.split(/\s+/).map((s) => s.trim()).filter((s) => /^\d+\|\d+$/.test(s));
    if (g('twmgr-mk-rwood')) c.reserveWood = Math.max(0, parseInt(g('twmgr-mk-rwood').value, 10) || 0);
    if (g('twmgr-mk-rstone')) c.reserveStone = Math.max(0, parseInt(g('twmgr-mk-rstone').value, 10) || 0);
    if (g('twmgr-mk-riron')) c.reserveIron = Math.max(0, parseInt(g('twmgr-mk-riron').value, 10) || 0);
    if (g('twmgr-mk-stopon')) c.cunhagemStopEnabled = g('twmgr-mk-stopon').checked;
    if (g('twmgr-mk-stophours')) c.cunhagemStopHours = Math.max(0.1, parseFloat((g('twmgr-mk-stophours').value || '').replace(',', '.')) || 2);
    if (g('twmgr-mk-automint')) c.autoMint = g('twmgr-mk-automint').checked;
    if (g('twmgr-mk-srcgroups')) c.cunhagemSourceGroups = Array.from(document.querySelectorAll('.twmgr-mk-srcgrp:checked')).map((cb) => cb.getAttribute('data-gid')).filter(Boolean);
    if (g('twmgr-mk-int')) c.interval = Math.max(1, parseInt(g('twmgr-mk-int').value, 10) || 10) * 60;
    if (g('twmgr-mk-thr')) c.thresholdPct = Math.max(1, Math.min(99, parseInt(g('twmgr-mk-thr').value, 10) || 50));
    if (g('twmgr-mk-dist')) c.maxDist = Math.max(1, parseFloat((g('twmgr-mk-dist').value || '').replace(',', '.')) || 15);
    if (g('twmgr-mk-sthr')) c.solidarioThresholdPct = Math.max(1, Math.min(99, parseInt(g('twmgr-mk-sthr').value, 10) || 50));
    if (g('twmgr-mk-sdonormin')) c.solidarioDonorMinPct = Math.max(1, Math.min(99, parseInt(g('twmgr-mk-sdonormin').value, 10) || 50));
    if (g('twmgr-mk-sdonor')) c.solidarioDonorPct = Math.max(1, Math.min(99, parseInt(g('twmgr-mk-sdonor').value, 10) || 50));
    if (g('twmgr-mk-sgargalo')) c.solidarioGargaloKeepPct = Math.max(1, Math.min(99, parseInt(g('twmgr-mk-sgargalo').value, 10) || 90));
    if (g('twmgr-mk-sdist')) c.solidarioMaxDist = Math.max(1, parseFloat((g('twmgr-mk-sdist').value || '').replace(',', '.')) || 20);
    if (g('twmgr-mk-g-solid')) c.groupSolidario = g('twmgr-mk-g-solid').value;
    save();
  }
  function setMarketStatus(modeKey, on) { setBtnState('twmgr-mk-' + modeKey + '-start', 'twmgr-mk-' + modeKey + '-stop', on, '● Enviando', '▶ Enviar'); }
  const MARKET_START_MSG = {
    equilibrio: () => 'Equilíbrio iniciado — limiar ' + config.market.thresholdPct + '% do armazém, distância ≤ ' + config.market.maxDist + '.',
    solidario: () => 'Solidário iniciado — grupo ' + config.market.groupSolidario + ', limiar ' + config.market.solidarioThresholdPct + '% do armazém, distância ≤ ' + config.market.solidarioMaxDist + '.',
    cunhagem: () => 'Cunhagem iniciada — ' + config.market.destCoords.length + ' destino(s), reserva ' + config.market.reserveWood + '/' + config.market.reserveStone + '/' + config.market.reserveIron + ' (mad/arg/fer)' + (config.market.autoMint ? ', cunhagem automática ligada' : '') + (config.market.cunhagemStopEnabled ? ', parada em ' + config.market.cunhagemStopHours + 'h' : '') + '.',
  };
  function marketStart(modeKey) {
    readMarketCfg();
    if (modeKey === 'cunhagem') {
      if (!config.market.destCoords.length) { pushLog('Cunhagem: configure ao menos 1 destino válido (ex.: 464|604).', 'err', 'market'); return; }
    }
    if (modeKey === 'solidario' && !config.market.groupSolidario) { pushLog('Solidário: selecione um grupo.', 'err', 'market'); return; }
    config.market.modes[modeKey].running = true; config.market.modes[modeKey].nextAt = 0;
    config.market.modes[modeKey].stopAt = (modeKey === 'cunhagem' && config.market.cunhagemStopEnabled) ? Date.now() + config.market.cunhagemStopHours * 3600000 : 0;
    save();
    setMarketStatus(modeKey, true);
    pushLog(MARKET_START_MSG[modeKey](), 'ok', 'market');
    marketTick(modeKey);
  }
  function marketStop(modeKey) { readMarketCfg(); config.market.modes[modeKey].running = false; save(); clearTimeout(marketTimers[modeKey]); setMarketStatus(modeKey, false); pushLog('Mercado (' + MARKET_MODE_LABEL[modeKey] + ') parado.', '', 'market'); }

  // ==================== CONSTRUÇÕES (modelos nomeados aplicados por aldeia) ===============
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
    const filaTrs = doc.querySelectorAll('#buildqueue tr.sortable_row, #buildqueue tr.lit');
    const queueLen = filaTrs.length;
    // O "Nível N" do buildrow é o nível JÁ CONSTRUÍDO — obra na fila não aparece nele. Sem ler a
    // fila, o motor reenfileira o mesmo prédio todo ciclo achando que ainda não subiu (main 20 com
    // alvo 21 virava 21, 22, 23... e o resto do modelo nunca era avaliado). `queued[b]` = maior
    // nível daquele prédio já pago na fila; `levelEff` = o que o modelo deve considerar atingido.
    const queued = {};
    const NOMES_FILA = Object.keys(LOCKED_REQ_NAME_TO_KEY).sort((a, b) => b.length - a.length);
    filaTrs.forEach((tr) => {
      const txt = (tr.textContent || '').replace(/\s+/g, ' ');
      const lm = txt.match(/N[ií]vel\s*(\d+)/i); if (!lm) return;
      let key = null;
      const img = tr.querySelector('img[src*="/buildings/"]');
      if (img) {
        const m = (img.getAttribute('src') || '').match(/\/buildings\/(?:mid\/|big_buildings\/)?([a-z_]+?)\d*\.(?:png|webp|gif|jpg)/i);
        if (m && BUILD_META[m[1].toLowerCase()]) key = m[1].toLowerCase();
      }
      if (!key) { for (const nome of NOMES_FILA) { if (txt.indexOf(nome) >= 0) { key = LOCKED_REQ_NAME_TO_KEY[nome]; break; } } }
      if (!key) return;
      queued[key] = Math.max(queued[key] || 0, +lm[1]);
    });
    const levelEff = {};
    Object.keys(level).forEach((b) => { levelEff[b] = Math.max(level[b] || 0, queued[b] || 0); });
    Object.keys(queued).forEach((b) => { if (levelEff[b] == null) levelEff[b] = queued[b]; });
    // Recurso/população — já vêm de graça na mesma página (header do jogo), sem fetch extra. Usado pelo Obra
    // pros gatilhos condicionais de Fazenda (pop livre) e Armazém (% de recurso cheio).
    const num = (id) => { const el = doc.getElementById(id); return el ? (parseInt((el.textContent || '').replace(/\D/g, ''), 10) || 0) : 0; };
    const resInfo = { wood: num('wood'), stone: num('stone'), iron: num('iron'), storageMax: num('storage'), pop: num('pop_current_label'), popMax: num('pop_max_label') };
    // Tabela "Ainda não disponível" (mesma página): pra cada prédio travado, lista os pré-requisitos AINDA
    // não cumpridos (span.inactive). Usado pelo Obra pra priorizar o requisito que falta (ex.: Ed.Principal
    // pra liberar Ferreiro) em vez de cair no próximo item do template por eliminação.
    const locked = {};
    doc.querySelectorAll('tr').forEach((tr) => {
      const reqDiv = tr.querySelector('td div.unmet_req'); if (!reqDiv) return;
      const link = tr.querySelector('td a[href*="screen="]'); if (!link) return;
      const sm = (link.getAttribute('href') || '').match(/screen=([a-z_]+)/i);
      let key = sm ? sm[1].toLowerCase() : null;
      if (!key || !BUILD_META[key]) {
        const nmEl = tr.querySelector('img[data-title]');
        const nm = (link.textContent || (nmEl && nmEl.getAttribute('data-title')) || '').trim();
        key = LOCKED_REQ_NAME_TO_KEY[nm] || null;
      }
      if (!key) return;
      const reqs = [];
      reqDiv.querySelectorAll('span.inactive').forEach((sp) => {
        const m = (sp.textContent || '').trim().match(/^(.+?)\s*\((\d+)\)$/);
        if (!m) return;
        const reqKey = LOCKED_REQ_NAME_TO_KEY[m[1].trim()];
        if (reqKey) reqs.push({ b: reqKey, lvl: +m[2] });
      });
      if (reqs.length) locked[key] = reqs;
    });
    return { level: level, levelEff: levelEff, queued: queued, cost: cost, buildable: buildable, hasBtn: hasBtn, queueLen: queueLen, res: resInfo, locked: locked };
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
    if (captchaBlocked()) { buildTimer = setTimeout(buildTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.build.nextAt || 0) > now) { scheduleBuild(); return; }
    const assign = config.build.villages || {};
    const ativas = Object.keys(assign).filter((v) => !assign[v].paused && config.build.templates[assign[v].tpl]);
    if (!ativas.length) { pushLog('Construções: nenhuma aldeia ativa — adicione aldeias e aplique um modelo na tabela.', '', 'build'); config.build.nextAt = now + 300000; save(); scheduleBuild(); return; }
    // Guarda anticolisão: o Obra (módulo do Johann) também enfileira obra. Se os dois pegarem a
    // mesma aldeia, brigam pela fila e gastam recurso fora de ordem. O Construções cede, porque é
    // o genérico e o Obra trabalha por grupo nativo do jogo.
    const donoOutro = {};
    if (config.obra && config.obra.running) {
      try { Object.keys(await getGroupProfileMapObra()).forEach((v) => { donoOutro[v] = 'Obra'; }); }
      catch (e) { pushLog('Construções: não consegui checar as aldeias do Obra (' + (e.message || e) + ') — sigo sem a guarda.', '', 'build'); }
    }
    const vids = ativas.filter((v) => !donoOutro[v]);
    if (ativas.length !== vids.length) {
      const porDono = {};
      ativas.filter((v) => donoOutro[v]).forEach((v) => { porDono[donoOutro[v]] = (porDono[donoOutro[v]] || 0) + 1; });
      pushLog('Construções: pulei ' + Object.keys(porDono).map((d) => porDono[d] + ' aldeia(s) do ' + d).join(' e ') + ' — já estão construindo por lá.', '', 'build');
    }
    config.build.demand = {};
    let built = 0;
    for (const vid of vids) {
      { const pare = devoParar('build'); if (pare) { pushLog('Construções: ciclo interrompido — ' + pare + '.', '', 'build'); break; } }
      const alvo = assign[vid];
      const tplObj = config.build.templates[alvo.tpl] || {};
      const plan = tplObj.plan || [];
      const rotulo = alvo.name || alvo.coord || vid;
      let st;
      try { st = await getBuildState(vid); }
      catch (e) { pushLog('Construções em ' + rotulo + ': erro ao ler o estado (' + (e.message || e) + ').', 'err', 'build'); continue; }
      // "Ordens" da tabela = quantos itens ATIVOS do modelo já foram atingidos / total (espelha o X/50 do jogo).
      // Usa o nível REAL (não o da fila) — o número tem que dizer o que está de pé na aldeia.
      const ativos = plan.filter((it) => it.en !== false);
      alvo.total = ativos.length;
      alvo.done = ativos.filter((it) => (st.level[it.b] || 0) >= it.lvl).length;
      // ENCHE A FILA no mesmo ciclo, até o "Máx na fila" escolhido pelo usuário. Reler o estado a
      // cada obra é necessário e não é desperdício: enfileirar já debita o recurso, então só o
      // servidor sabe se ainda dá pra pagar a próxima. Na prática o recurso acaba antes dos slots
      // e o laço morre em 1-2 voltas.
      const postos = [];
      let slots = Math.max(0, (config.build.maxQueue || 5) - st.queueLen);
      while (slots > 0) {
        // O que já está NA FILA conta como atingido — senão o motor reenfileira o mesmo prédio
        // todo ciclo e nunca avança pro próximo item do modelo.
        const stEff = Object.assign({}, st, { level: st.levelEff || st.level });
        // Fazenda/armazém condicionais furam a ordem do modelo quando o gatilho dispara
        const urgente = bldPrioridadeCondicional(stEff, tplObj);
        let r;
        if (urgente) r = stEff.buildable[urgente] ? { build: { b: urgente, cost: stEff.cost[urgente] }, demand: null } : { build: null, demand: { b: urgente, cost: stEff.cost[urgente] } };
        else r = computeBuild(stEff, plan);
        if (!r.build) {
          if (r.demand) {
            config.build.demand[vid] = { b: r.demand.b, cost: r.demand.cost, coord: alvo.coord };
            // Só reclama de falta de recurso se não conseguiu enfileirar NADA — depois de encher
            // uns slots, parar por falta de recurso é o comportamento esperado, não um aviso.
            if (!postos.length) {
              const bn = (BUILD_META[r.demand.b] && BUILD_META[r.demand.b].name) || r.demand.b;
              pushLog(rotulo + ': aguardando recurso p/ ' + bn + ' (' + r.demand.cost.wood + '/' + r.demand.cost.stone + '/' + r.demand.cost.iron + ')', '', 'build');
            }
          }
          break;
        }
        try { await enqueueBuild(vid, r.build.b); }
        catch (e) { pushLog('Construções em ' + rotulo + ': ' + (e.message || e), 'err', 'build'); break; }
        postos.push((BUILD_META[r.build.b] && BUILD_META[r.build.b].name) || r.build.b);
        built++; slots--;
        if (slots <= 0) break;
        await sleep(300);
        let novo;
        try { novo = await getBuildState(vid); }
        catch (e) { break; }
        // Trava de segurança: se a fila não cresceu, o enfileiramento não pegou (recurso, pré-req,
        // limite do jogo). Insistir aqui viraria laço infinito batendo no servidor.
        if (novo.queueLen <= st.queueLen) { st = novo; break; }
        st = novo;
      }
      if (postos.length) pushLog('Construções: ' + rotulo + ' → ' + postos.join(', ') + ' na fila (' + postos.length + ' obra' + (postos.length > 1 ? 's' : '') + ').', 'ok', 'build');
      await sleep(300);
    }
    renderBuildVillages();
    config.build.stats = config.build.stats || {};
    config.build.stats.villages = vids.length;
    config.build.nextAt = now + Math.max(60, config.build.interval || 600) * 1000;
    save();
    refreshCards('build');
    pushLog('Construções: ciclo concluído — ' + built + ' obra(s) enfileirada(s). Próximo em ' + Math.round((config.build.interval || 600) / 60) + ' min.', 'ok', 'build');
    scheduleBuild();
  }
  function scheduleBuild() { clearTimeout(buildTimer); if (!config.build.running) return; buildTimer = setTimeout(buildTick, Math.min(Math.max((config.build.nextAt || 0) - Date.now(), 1000), 60000)); }
  function readBuildCfg() {
    const c = config.build, g = (id) => document.getElementById(id);
    if (g('twmgr-bld-max')) c.maxQueue = Math.max(1, parseInt(g('twmgr-bld-max').value, 10) || 5);
    if (g('twmgr-bld-int')) c.interval = Math.max(1, parseInt(g('twmgr-bld-int').value, 10) || 10) * 60;
    save();
  }
  let _bldActiveProf = 'atk';   // agora guarda o ID do MODELO ativo no editor (não mais o perfil atk/def)
  function bldTplIds() { return Object.keys(config.build.templates || {}); }
  function bldTpl(id) { return (config.build.templates || {})[id || _bldActiveProf] || null; }
  function bldPlanAtual() {
    const t = bldTpl(); if (t) return (t.plan = t.plan || []);
    const ids = bldTplIds(); if (!ids.length) return [];
    _bldActiveProf = ids[0]; return (config.build.templates[ids[0]].plan = config.build.templates[ids[0]].plan || []);
  }
  function renderBuildPlan() {
    const box = document.getElementById('twmgr-bld-plan'); if (!box) return;
    const plan = bldPlanAtual();
    if (!plan.length) { box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:10px;font-size:10px">— lista vazia (use o + abaixo pra adicionar) —</div>'; renderBuildSummary(); return; }
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
    renderBuildSummary();
  }
  function bindBuildPlanHandlers() {
    const box = document.getElementById('twmgr-bld-plan'); if (!box) return;
    box.addEventListener('change', (e) => {
      const el = e.target; const i = parseInt(el.getAttribute('data-i'), 10);
      const plan = bldPlanAtual(); if (!plan || isNaN(i) || !plan[i]) return;
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
      const plan = bldPlanAtual(); if (!plan || isNaN(i) || !plan[i]) return;
      if (el.classList.contains('twmgr-bld-up') && i > 0) { const tmp = plan[i - 1]; plan[i - 1] = plan[i]; plan[i] = tmp; save(); renderBuildPlan(); }
      else if (el.classList.contains('twmgr-bld-down') && i < plan.length - 1) { const tmp = plan[i + 1]; plan[i + 1] = plan[i]; plan[i] = tmp; save(); renderBuildPlan(); }
      else if (el.classList.contains('twmgr-bld-rm')) { plan.splice(i, 1); save(); renderBuildPlan(); }
    });
  }
  // Sumário do modelo — a gradezinha do topo do "Editar modelo" do jogo: prédio -> nível final que
  // o modelo alcança. Só mostra o que o modelo toca (senão viram 17 colunas de uma vez).
  function renderBuildSummary() {
    const box = document.getElementById('twmgr-bld-sum'); if (!box) return;
    const plan = bldPlanAtual().filter((it) => it.en !== false);
    if (!plan.length) { box.innerHTML = '<span style="color:#8a7d6d;font-size:10px">— modelo vazio —</span>'; return; }
    const fim = {};
    plan.forEach((it) => { fim[it.b] = Math.max(fim[it.b] || 0, it.lvl); });
    box.innerHTML = BUILD_KEYS.filter((b) => fim[b]).map((b) => {
      const meta = BUILD_META[b];
      return '<span class="twmgr-bld-sumcell" title="' + esc(meta.name) + '">' + buildingIcon(b, meta.ico) + '<b>' + fim[b] + '</b></span>';
    }).join('');
  }
  // Gatilhos condicionais do modelo — espelham o "Priorize a construção da fazenda em: menos de X%
  // da população disponível" do Gerente de conta, mais o mesmo para o armazém. Ambos furam a ordem
  // do modelo quando disparam, porque fazenda cheia trava recrutamento e armazém cheio joga recurso
  // fora — nenhum dos dois pode esperar a fila chegar neles. 0 = desligado.
  // Atenção à leitura: é % DISPONÍVEL (livre), não % usada. 10 = "sobrou menos de 10% de espaço".
  function bldPrioridadeCondicional(st, tpl) {
    const res = st.res || {};
    const fPct = parseInt(tpl.farmPct, 10) || 0;
    if (fPct > 0 && (st.level.farm || 0) < BUILD_META.farm.max && st.hasBtn.farm) {
      const popMax = res.popMax || 0;
      if (popMax && ((popMax - (res.pop || 0)) / popMax) * 100 < fPct) return 'farm';
    }
    const sPct = parseInt(tpl.storagePct, 10) || 0;
    if (sPct > 0 && (st.level.storage || 0) < BUILD_META.storage.max && st.hasBtn.storage) {
      const cap = res.storageMax || 0;
      const cheio = Math.max(res.wood || 0, res.stone || 0, res.iron || 0);   // o recurso mais perto de estourar manda
      if (cap && ((cap - cheio) / cap) * 100 < sPct) return 'storage';
    }
    return null;
  }
  function bldAddItem() {
    const b = document.getElementById('twmgr-bld-add-b').value;
    const lvlInp = document.getElementById('twmgr-bld-add-lvl');
    const meta = BUILD_META[b]; if (!meta) return;
    const lvl = Math.max(1, Math.min(meta.max, parseInt(lvlInp.value, 10) || meta.max));
    const plan = bldPlanAtual();
    plan.push({ b: b, lvl: lvl, en: true });
    lvlInp.value = '';
    save(); renderBuildPlan();
  }
  function bldSwitchProf(id) {
    if (!bldTpl(id)) return;
    _bldActiveProf = id;
    const sel = document.getElementById('twmgr-bld-tpl'); if (sel) sel.value = id;
    const fp = document.getElementById('twmgr-bld-farmpct');
    if (fp) fp.value = bldTpl().farmPct != null ? bldTpl().farmPct : 0;
    renderBuildPlan();
  }
  function bldResetDefault() {
    const t = bldTpl(); if (!t) return;
    if (!confirm('Reset do modelo "' + t.name + '" pro padrão ' + (_bldActiveProf === 'def' ? 'Defensiva' : 'Ofensiva') + '?')) return;
    t.plan = tplToPlan(_bldActiveProf === 'def' ? DEF_TPL : ATK_TPL);
    save(); renderBuildPlan();
  }
  function bldClearAll() {
    const t = bldTpl(); if (!t) return;
    if (!confirm('Limpar TODOS os itens do modelo "' + t.name + '"?')) return;
    t.plan = [];
    save(); renderBuildPlan();
  }

  // ===== Gerenciar modelos (equivalente ao "Gerenciar modelos" do Gerente de conta) =====
  function bldRenderTplSelect() {
    const sel = document.getElementById('twmgr-bld-tpl'); if (!sel) return;
    const ids = bldTplIds();
    sel.innerHTML = ids.map((id) => '<option value="' + esc(id) + '">' + esc(config.build.templates[id].name) + ' (' + (config.build.templates[id].plan || []).length + ')</option>').join('');
    if (ids.indexOf(_bldActiveProf) < 0 && ids.length) _bldActiveProf = ids[0];
    sel.value = _bldActiveProf;
    // O seletor de modelo da barra de ação em massa espelha a mesma lista
    const mass = document.getElementById('twmgr-bld-mass-tpl');
    if (mass) { const antes = mass.value; mass.innerHTML = sel.innerHTML; if (ids.indexOf(antes) >= 0) mass.value = antes; }
  }
  function bldNovoModelo() {
    const nome = (prompt('Nome do novo modelo:', '') || '').trim();
    if (!nome) return;
    const base = confirm('Copiar os itens do modelo "' + (bldTpl() ? bldTpl().name : '') + '"?\n\nOK = copiar   ·   Cancelar = modelo vazio');
    const id = 'tpl' + Date.now().toString(36);
    config.build.templates[id] = { name: nome.slice(0, 40), plan: base && bldTpl() ? bldPlanAtual().map((it) => ({ b: it.b, lvl: it.lvl, en: it.en })) : [] };
    _bldActiveProf = id;
    save(); bldRenderTplSelect(); renderBuildPlan(); renderBuildVillages();
    pushLog('Modelo "' + nome + '" criado.', 'ok', 'build');
  }
  function bldRenomearModelo() {
    const t = bldTpl(); if (!t) return;
    const nome = (prompt('Novo nome do modelo:', t.name) || '').trim();
    if (!nome) return;
    t.name = nome.slice(0, 40);
    save(); bldRenderTplSelect(); renderBuildVillages();
  }
  function bldApagarModelo() {
    const t = bldTpl(); if (!t) return;
    if (bldTplIds().length < 2) { alert('Precisa sobrar pelo menos um modelo.'); return; }
    const usando = Object.keys(config.build.villages).filter((v) => config.build.villages[v].tpl === _bldActiveProf);
    const aviso = usando.length ? '\n\n' + usando.length + ' aldeia(s) usam esse modelo e vão SAIR da tabela.' : '';
    if (!confirm('Apagar o modelo "' + t.name + '"?' + aviso)) return;
    usando.forEach((v) => { delete config.build.villages[v]; });
    delete config.build.templates[_bldActiveProf];
    _bldActiveProf = bldTplIds()[0];
    save(); bldRenderTplSelect(); renderBuildPlan(); renderBuildVillages();
  }

  // ===== Exportar / importar modelo (equivalente ao "Importar Modelo" do Gerente de conta) =====
  // Formato antes do base64: TWM1|<nome>|<farmPct>|<storagePct>|main15,farm20,-wall10
  // O "-" na frente marca item desativado. Versionado no prefixo (TWM1) pra um formato futuro poder
  // ser recusado com mensagem clara em vez de importar lixo silenciosamente.
  function bldCodificar(txt) {
    const bytes = new TextEncoder().encode(txt);
    let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function bldDecodificar(b64) {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  }
  function bldExportarModelo() {
    const t = bldTpl(); if (!t) return;
    const itens = (t.plan || []).map((it) => (it.en === false ? '-' : '') + it.b + it.lvl).join(',');
    const cru = ['TWM1', String(t.name).replace(/\|/g, '/'), parseInt(t.farmPct, 10) || 0, parseInt(t.storagePct, 10) || 0, itens].join('|');
    const codigo = bldCodificar(cru);
    const avisar = (comoFoi) => {
      pushLog('Modelo "' + t.name + '" exportado (' + (t.plan || []).length + ' itens) — ' + comoFoi + '.', 'ok', 'build');
    };
    // Clipboard é o caminho bom, mas só funciona em contexto seguro e com a aba em foco; o prompt
    // é a rede de segurança — o código fica selecionável do mesmo jeito.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codigo).then(
        () => { avisar('copiado pra área de transferência'); alert('Código copiado!\n\nManda pro seu amigo colar no 📥 da aba Construções.'); },
        () => { prompt('Copie o código do modelo (Ctrl+C):', codigo); avisar('mostrado pra copiar'); }
      );
    } else { prompt('Copie o código do modelo (Ctrl+C):', codigo); avisar('mostrado pra copiar'); }
  }
  function bldImportarModelo() {
    const codigo = (prompt('Cole o código do modelo:', '') || '').trim();
    if (!codigo) return;
    let cru;
    try { cru = bldDecodificar(codigo); }
    catch (e) { alert('Código inválido — não consegui decodificar.'); return; }
    const partes = cru.split('|');
    if (partes[0] !== 'TWM1') { alert('Código não reconhecido.\n\nSe veio de uma versão mais nova do script, atualize o seu antes de importar.'); return; }
    const nome = (partes[1] || 'Importado').slice(0, 40);
    const plan = [], ignorados = [];
    (partes[4] || '').split(',').filter(Boolean).forEach((tk) => {
      const m = tk.trim().match(/^(-?)([a-z_]+)(\d+)$/i);
      if (!m || !BUILD_META[m[2].toLowerCase()]) { ignorados.push(tk); return; }
      const b = m[2].toLowerCase();
      plan.push({ b: b, lvl: Math.max(1, Math.min(BUILD_META[b].max, parseInt(m[3], 10) || 1)), en: m[1] !== '-' });
    });
    if (!plan.length) { alert('O código não tem nenhum item válido.'); return; }
    const clamp = (v) => Math.max(0, Math.min(99, parseInt(v, 10) || 0));
    const id = 'tpl' + Date.now().toString(36);
    config.build.templates[id] = { name: nome, plan: plan, farmPct: clamp(partes[2]), storagePct: clamp(partes[3]) };
    _bldActiveProf = id;
    save(); bldRenderTplSelect(); bldSwitchProf(id); renderBuildVillages();
    pushLog('Modelo "' + nome + '" importado com ' + plan.length + ' item(ns)' + (ignorados.length ? ' — ' + ignorados.length + ' ignorado(s): ' + ignorados.join(', ') : '') + '.', 'ok', 'build');
    alert('Modelo "' + nome + '" importado com ' + plan.length + ' item(ns).' + (ignorados.length ? '\n\n' + ignorados.length + ' item(ns) foram ignorados por não existirem neste mundo:\n' + ignorados.join(', ') : ''));
  }

  // ===== Tabela de aldeias (equivalente ao "Gerenciar construções da aldeia") =====
  let _bldPool = [];   // aldeias da conta (ou do grupo filtrado) disponíveis pra adicionar
  async function bldCarregarAldeias() {
    const btn = document.getElementById('twmgr-bld-vil-reload');
    if (btn) btn.textContent = '…';
    try {
      const gid = config.build.filterGroup || '';
      const vs = gid ? await getVillagesInGroup(gid) : await getAllVillagesCached();   // ambos devolvem ARRAY
      _bldPool = (vs || []).map((v) => ({ vid: String(v.vid), coord: v.coord || null, name: v.name || v.coord || String(v.vid) }));
      pushLog('Construções: ' + _bldPool.length + ' aldeia(s) carregadas' + (gid ? ' do grupo selecionado' : '') + '.', '', 'build');
    } catch (e) {
      pushLog('Construções: erro ao carregar as aldeias (' + (e.message || e) + ').', 'err', 'build');
    }
    if (btn) btn.textContent = '↻';
    renderBuildVillages();
  }
  function renderBuildVillages() {
    const box = document.getElementById('twmgr-bld-vils'); if (!box) return;
    const assign = config.build.villages || {}, tpls = config.build.templates || {};
    // Une o que já está atribuído com o pool carregado, pra dar pra marcar aldeia nova na mesma lista
    const mapa = {};
    Object.keys(assign).forEach((vid) => { mapa[vid] = { vid: vid, coord: assign[vid].coord, name: assign[vid].name || assign[vid].coord || vid }; });
    _bldPool.forEach((v) => { if (!mapa[v.vid]) mapa[v.vid] = v; });
    const linhas = Object.keys(mapa).sort((a, b) => String(mapa[a].name).localeCompare(String(mapa[b].name), 'pt-BR', { numeric: true }));
    if (!linhas.length) { box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:10px;font-size:10px">— clique em ↻ pra carregar suas aldeias —</div>'; return; }
    box.innerHTML = '<table class="twmgr-bld-tab"><thead><tr>' +
      '<th class="twmgr-tab-ck"><input type="checkbox" id="twmgr-bld-all"></th><th>Aldeia</th><th>Modelo</th><th>Ordens</th><th>Estado</th><th></th>' +
      '</tr></thead><tbody>' +
      linhas.map((vid, i) => {
        const v = mapa[vid], a = assign[vid];
        const tplNome = a && tpls[a.tpl] ? esc(tpls[a.tpl].name) : '<span style="color:#8a7340">—</span>';
        const ordens = a ? ((a.done != null ? a.done : '—') + ' / ' + (a.total != null ? a.total : (tpls[a.tpl] ? (tpls[a.tpl].plan || []).filter((x) => x.en !== false).length : '—'))) : '';
        const estado = !a ? '<span style="color:#8a7340">não gerenciada</span>'
          : a.paused ? 'Pausado ( <a class="twmgr-bld-tog" data-vid="' + vid + '">Retomar</a> )'
          : 'Ativo ( <a class="twmgr-bld-tog" data-vid="' + vid + '">Pausar</a> )';
        const rm = a ? '<a class="twmgr-bld-vrm" data-vid="' + vid + '" title="tirar da gestão">Remover</a>' : '';
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + (a ? '' : ' twmgr-bld-off') + '">' +
          '<td class="twmgr-tab-ck"><input type="checkbox" class="twmgr-bld-vsel" data-vid="' + vid + '"></td>' +
          '<td title="' + esc(v.name) + '">' + esc(v.name) + '</td>' +
          '<td>' + tplNome + '</td><td>' + ordens + '</td><td>' + estado + '</td><td>' + rm + '</td></tr>';
      }).join('') + '</tbody></table>';
    const cnt = Object.keys(assign).length, pausadas = Object.keys(assign).filter((v) => assign[v].paused).length;
    const rod = document.getElementById('twmgr-bld-vils-info');
    if (rod) rod.textContent = cnt + ' gerenciada(s)' + (pausadas ? ' · ' + pausadas + ' pausada(s)' : '') + ' · ' + linhas.length + ' na lista';
  }
  function bldSelecionadas() {
    return Array.prototype.slice.call(document.querySelectorAll('.twmgr-bld-vsel:checked')).map((el) => el.getAttribute('data-vid'));
  }
  function bldAcaoEmMassa() {
    const acao = document.getElementById('twmgr-bld-mass-acao').value;
    const tplId = document.getElementById('twmgr-bld-mass-tpl').value;
    const vids = bldSelecionadas();
    if (!vids.length) { alert('Marque pelo menos uma aldeia.'); return; }
    const assign = config.build.villages;
    const mapaPool = {}; _bldPool.forEach((v) => { mapaPool[v.vid] = v; });
    let n = 0;
    vids.forEach((vid) => {
      if (acao === 'apply') {
        if (!config.build.templates[tplId]) return;
        const base = assign[vid] || mapaPool[vid] || {};
        assign[vid] = { tpl: tplId, paused: false, coord: base.coord || null, name: base.name || base.coord || vid, done: null, total: null };
        n++;
      } else if (!assign[vid]) { return; }
      else if (acao === 'pause') { assign[vid].paused = true; n++; }
      else if (acao === 'resume') { assign[vid].paused = false; n++; }
      else if (acao === 'remove') { delete assign[vid]; n++; }
    });
    config.build.stats = config.build.stats || {};
    config.build.stats.villages = Object.keys(assign).filter((v) => !assign[v].paused).length;
    save(); renderBuildVillages(); refreshCards('build');
    const rotulo = { apply: 'modelo aplicado em', pause: 'pausada(s):', resume: 'retomada(s):', remove: 'removida(s) da gestão:' }[acao];
    pushLog('Construções: ' + rotulo + ' ' + n + ' aldeia(s).', 'ok', 'build');
  }
  function bindBuildVillageHandlers() {
    const box = document.getElementById('twmgr-bld-vils'); if (!box) return;
    box.addEventListener('click', (e) => {
      const el = e.target, vid = el.getAttribute && el.getAttribute('data-vid');
      if (el.id === 'twmgr-bld-all') return;
      if (!vid) return;
      if (el.classList.contains('twmgr-bld-tog')) {
        const a = config.build.villages[vid]; if (!a) return;
        a.paused = !a.paused; save(); renderBuildVillages();
      } else if (el.classList.contains('twmgr-bld-vrm')) {
        delete config.build.villages[vid]; save(); renderBuildVillages(); refreshCards('build');
      }
    });
    box.addEventListener('change', (e) => {
      if (e.target.id !== 'twmgr-bld-all') return;
      const on = e.target.checked;
      document.querySelectorAll('.twmgr-bld-vsel').forEach((el) => { el.checked = on; });
    });
  }
  function setBuildStatus(on) { setBtnState('twmgr-bld-start', 'twmgr-bld-stop', on, '● Construindo', '▶ Construir'); }
  function buildStart() {
    readBuildCfg();
    const assign = config.build.villages || {};
    const ativas = Object.keys(assign).filter((v) => !assign[v].paused && config.build.templates[assign[v].tpl]);
    if (!ativas.length) { pushLog('Construções: nenhuma aldeia ativa — carregue a lista (↻), marque as aldeias e aplique um modelo.', 'err', 'build'); return; }
    config.build.running = true; config.build.nextAt = 0; save();
    setBuildStatus(true);
    pushLog('Construções iniciado — ' + ativas.length + ' aldeia(s) ativa(s) em ' + bldTplIds().length + ' modelo(s).', 'ok', 'build');
    buildTick();
  }
  function buildStop() { readBuildCfg(); config.build.running = false; save(); clearTimeout(buildTimer); setBuildStatus(false); pushLog('Construções parado.', '', 'build'); }

  // ==================== PESQUISA (modelos de prioridade aplicados por aldeia) ====================
  // Espelha o "Gerente de conta -> Pesquisa" do jogo (screen=am_research) e funciona SEM Premium:
  // N modelos nomeados, cada um com uma ORDEM de tropas, atribuidos por aldeia. A cada ciclo, para
  // cada aldeia gerenciada, anda a ordem do modelo e pesquisa a primeira tropa que ainda falta.
  //
  // Reusa o que ja estava provado, em vez de reimplementar:
  //   getSmithTechs/smithResearch  (085-obra) -- endpoint do Ferreiro confirmado ao vivo via DevTools
  //   getMarketState/sendMarketResources (075-mercado) -- transferencia em 2 etapas
  //   fieldDist (100-barbaros-mapa), getVillagesInGroup/getAllVillagesCached (030/040)
  // Sao funcoes hoisted no mesmo escopo (ver CLAUDE.md), entao a ordem dos arquivos nao importa.

  // PESQ_ORDEM_PADRAO vive no 010-core: o normalizador do config (`let config = load()`) roda na
  // avaliação do 010, antes deste arquivo — const declarada aqui cairia em TDZ e derrubaria tudo.

  // CONFIRMADO no console (br141): BuildingSmith.techs.available[unidade] tem SO estes campos --
  //   id, name, level, level_after, level_highest, downgrades, error_level, image_state, image
  // Ou seja: NAO existe can_research, NAO existe error_buildings, e NAO existe custo nem
  // error_resources. Entao nao da pra saber de antemao se a pesquisa vai passar: a unica fonte de
  // verdade e TENTAR e ler a resposta do servidor. Este classificador traduz a resposta em algo
  // acionavel; o texto cru vai pro log quando nao reconheco, pra dar pra ajustar sem chutar.
  // Predio que cada pesquisa exige (canonico do Tribal Wars). Serve pra transformar
  // "falta predio" num recado acionavel: o usuario precisa saber QUAL predio subir.
  const PESQ_PREDIO = {
    spear: 'Quartel', sword: 'Quartel', axe: 'Quartel', archer: 'Quartel',
    spy: 'Estabulo', light: 'Estabulo', marcher: 'Estabulo', heavy: 'Estabulo',
    ram: 'Oficina', catapult: 'Oficina',
  };

  function pesqClassificarErro(msg) {
    // Regex de proposito SEM ACENTO: comparo contra a mensagem em minusculas com os acentos
    // removidos. Classe de caractere com acento dentro de fonte gerada por script e um convite a
    // escape mal escrito -- ja aconteceu aqui (saiu [u00edi] em vez de [ii]) e o classificador
    // silenciosamente parou de reconhecer as mensagens acentuadas do jogo.
    const m = String(msg || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Texto real do br141: "Requerimentos necessarios nao atingidos" (Ariete sem Oficina).
    if (/requerimento|requisito|edificio|ferreiro|estabulo|oficina|building/.test(m)) return 'predio';
    if (/recurso|materia|insufficient|suficiente/.test(m)) return 'recurso';
    if (/andamento|em curso|already|ja esta/.test(m)) return 'andando';
    return 'desconhecido';
  }

  // Candidatas a pesquisar, NA ORDEM do modelo. Dois campos bastam e ambos existem de verdade:
  // `level` (nivel atual) e `level_highest` (teto). `error_level` e o jeito do jogo dizer "nao ha
  // nivel a subir aqui".
  //
  // Devolve LISTA, nao a primeira: um item travado por requisito (Ariete sem Oficina, p.ex.) nao
  // pode parar a ordem inteira -- prioridade significa "se essa nao da, tenta a proxima". Sem isso
  // a aldeia ficava presa no Ariete pra sempre e nunca pesquisava Lanc./Espad./C.pes.
  function pesqCandidatos(techs, ordem, bloqueios, agora) {
    const ttl = Math.max(1, config.research.blockTtlH || 6) * 3600 * 1000;
    const out = [];
    for (const tech of ordem) {
      const t = techs[tech];
      if (!t) continue;                                   // tropa que nao existe neste mundo
      const nivel = parseInt(t.level, 10) || 0;
      const teto = parseInt(t.level_highest, 10) || parseInt(t.max_level, 10) || 1;
      if (nivel >= teto) continue;                        // ja no maximo
      if (t.error_level) continue;                        // o jogo diz que nao ha nivel a subir
      // Recusada por requisito faz pouco tempo? Nao insiste -- predio nao nasce em 15 min. O TTL
      // existe pra ela voltar a ser tentada depois que o Construcoes tiver subido a Oficina.
      if (bloqueios[tech] && (agora - bloqueios[tech]) < ttl) continue;
      out.push(tech);
    }
    return out;
  }

  // Puxa recurso da aldeia mais PROXIMA que tem excedente. "Excedente" = acima de
  // config.research.feedReserve% do armazem dela -- a mesma ideia do Solidario do Mercado, mas aqui
  // o gatilho e uma pesquisa que o servidor recusou por falta de recurso, nao um limiar periodico.
  async function pesqAbastecer(alvo, fontes, cacheFonte) {
    const cm = (alvo.coord || '').match(/(\d+)\|(\d+)/);
    if (!cm) return { enviou: false, motivo: 'aldeia sem coordenada' };
    const ax = +cm[1], ay = +cm[2];

    let ms; try { ms = await getMarketState(alvo.vid); } catch (e) { return { enviou: false, motivo: 'nao li o mercado do destino' }; }
    if (!ms.storage) return { enviou: false, motivo: 'armazem do destino ilegivel' };

    // A tela do Ferreiro nao informa o custo da pesquisa (conferido ao vivo), entao nao da pra
    // pedir o valor exato: enche os tres recursos ate feedFillPct% do armazem e deixa o proximo
    // ciclo tentar de novo. Pedir demais nao machuca -- o teto abaixo impede transbordo.
    const teto = ms.storage * ((config.research.feedFillPct != null ? config.research.feedFillPct : 60) / 100);
    const falta = {
      wood: Math.max(0, teto - ms.wood),
      stone: Math.max(0, teto - ms.stone),
      iron: Math.max(0, teto - ms.iron),
    };
    // Nunca pede mais do que cabe no armazem (senao transborda e o recurso vira lixo).
    ['wood', 'stone', 'iron'].forEach((r) => { falta[r] = Math.floor(Math.min(falta[r], Math.max(0, ms.storage - ms[r]))); });
    if (falta.wood + falta.stone + falta.iron <= 0) return { enviou: false, motivo: 'nada faltando' };

    const maxDist = config.research.feedMaxDist != null ? config.research.feedMaxDist : 20;
    const perto = fontes
      .map((f) => { const c = (f.coord || '').match(/(\d+)\|(\d+)/); return c ? { f: f, d: fieldDist(+c[1], +c[2], ax, ay) } : null; })
      .filter((o) => o && o.f.vid !== alvo.vid && o.d <= maxDist)
      .sort((a, b) => a.d - b.d);
    if (!perto.length) return { enviou: false, motivo: 'nenhuma aldeia dentro de ' + maxDist + ' campos' };

    const reservaPct = (config.research.feedReserve != null ? config.research.feedReserve : 40) / 100;
    let enviou = false, mandado = 0;
    for (const o of perto) {
      if (falta.wood + falta.stone + falta.iron <= 0) break;
      const fv = o.f;
      let fs = cacheFonte[fv.vid];
      if (!fs) {
        try { fs = cacheFonte[fv.vid] = await getMarketState(fv.vid); }
        catch (e) { cacheFonte[fv.vid] = { capacity: 0, storage: 0 }; continue; }
      }
      if (!fs.capacity || !fs.storage) continue;
      const piso = fs.storage * reservaPct;   // o excedente e o que passa da reserva
      const pode = {
        wood: Math.max(0, fs.wood - piso), stone: Math.max(0, fs.stone - piso), iron: Math.max(0, fs.iron - piso),
      };
      let amt = {
        wood: Math.floor(Math.min(falta.wood, pode.wood)),
        stone: Math.floor(Math.min(falta.stone, pode.stone)),
        iron: Math.floor(Math.min(falta.iron, pode.iron)),
      };
      let tot = amt.wood + amt.stone + amt.iron;
      if (tot <= 0) continue;
      // Cabe nos mercadores? Se nao, manda proporcional -- o resto sai da proxima fonte/ciclo.
      if (tot > fs.capacity) {
        const f = fs.capacity / tot;
        amt = { wood: Math.floor(amt.wood * f), stone: Math.floor(amt.stone * f), iron: Math.floor(amt.iron * f) };
        tot = amt.wood + amt.stone + amt.iron;
      }
      if (tot <= 0) continue;
      try {
        await sendMarketResources(fv.vid, alvo.coord, amt);
        enviou = true; mandado += tot;
        pushLog('Pesquisa (abastece): ' + (fv.name || fv.coord) + ' -> ' + (alvo.name || alvo.coord) +
                ' (' + amt.wood + '/' + amt.stone + '/' + amt.iron + ', ' + (Math.round(o.d * 10) / 10) + ' campos)', 'ok', 'research');
        // Desconta na memoria pra nao prometer o mesmo recurso duas vezes no mesmo ciclo.
        fs.wood -= amt.wood; fs.stone -= amt.stone; fs.iron -= amt.iron;
        fs.capacity -= tot;
        falta.wood -= amt.wood; falta.stone -= amt.stone; falta.iron -= amt.iron;
      } catch (e) { /* alvo/erro -> tenta a proxima fonte */ }
      await sleep(250);
    }
    return { enviou: enviou, total: mandado, motivo: enviou ? null : 'nenhuma fonte com excedente no alcance' };
  }

  // Trava de reentrancia: `researchStart` chama o tick direto, e o agendamento tambem. Clicar
  // Iniciar com um ciclo em voo fazia DOIS lacos concorrentes na mesma conta -- no log real deu
  // linha duplicada pra mesma aldeia no mesmo segundo, e o mesmo POST tentado duas vezes.
  let _pesqEmVoo = false;
  async function researchTick() {
    clearTimeout(researchTimer);
    if (!config.research.running) return;
    if (_pesqEmVoo) { researchTimer = setTimeout(researchTick, 5000); return; }
    if (lockOther()) { researchTimer = setTimeout(researchTick, 5000); return; }
    if (captchaBlocked()) { researchTimer = setTimeout(researchTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.research.nextAt || 0) > now) { scheduleResearch(); return; }

    const assign = config.research.villages || {};
    const ativas = Object.keys(assign).filter((v) => !assign[v].paused && config.research.templates[assign[v].tpl]);
    if (!ativas.length) {
      pushLog('Pesquisa: nenhuma aldeia ativa - carregue a lista, marque as aldeias e aplique um modelo.', '', 'research');
      config.research.nextAt = now + 300000; save(); scheduleResearch(); return;
    }

    // Fontes de recurso pro abastecimento = todas as aldeias da conta. Uma aldeia gerenciada tambem
    // pode doar (se estiver acima da reserva), porque pesquisa de uma nao concorre com a da outra.
    let todas = [];
    if (config.research.feedOn) { try { todas = await getAllVillagesCached(); } catch (e) {} }
    const cacheFonte = {};

    _pesqEmVoo = true;
    // Agregado do ciclo: tropa travada -> quantas aldeias. Vira UMA linha no fim, em vez de uma
    // por aldeia (44 aldeias davam ~60 linhas de log por ciclo).
    const travadasPorTropa = {};
    let pesquisadas = 0, abastecidas = 0, completas = 0, semPredio = 0, andando = 0;
    for (const vid of ativas) {
      { const pare = devoParar('research'); if (pare) { pushLog('Pesquisa: ciclo interrompido - ' + pare + '.', '', 'research'); break; } }
      const alvo = assign[vid];
      const modelo = config.research.templates[alvo.tpl] || {};
      const ordem = (modelo.order || []).filter((u) => u);
      const rotulo = alvo.name || alvo.coord || vid;
      if (!ordem.length) { pushLog('Pesquisa: o modelo "' + (modelo.name || alvo.tpl) + '" esta vazio.', '', 'research'); continue; }

      let techs;
      try { techs = await getSmithTechs(vid); }
      catch (e) {
        // Ferreiro nivel 0 nao tem BuildingSmith.techs -- e situacao normal, nao erro do script.
        pushLog('Pesquisa em ' + rotulo + ': ' + (e.message || e), '', 'research');
        continue;
      }

      const nomeTropa = (t) => { const u = UNITS.find((x) => x[0] === t); return u ? u[1] : t; };
      config.research.blocked = config.research.blocked || {};
      const bloqueios = config.research.blocked[vid] = config.research.blocked[vid] || {};
      const candidatas = pesqCandidatos(techs, ordem, bloqueios, now);
      if (!candidatas.length) { completas++; continue; }   // tudo pesquisado, ou o resto esta travado

      // Nao existe campo dizendo se da pra pesquisar agora: tenta e le a resposta do servidor.
      // Anda a lista ate uma passar; requisito nao atendido apenas pula pra proxima da ordem.
      let feito = false, faltouRecurso = null, travadas = 0;
      for (const tech of candidatas) {
        let erro = null;
        try {
          await smithResearch(vid, tech);
          pesquisadas++; feito = true;
          delete bloqueios[tech];
          pushLog('Pesquisa: ' + rotulo + ' -> ' + nomeTropa(tech) + ' iniciada.', 'ok', 'research');
          break;
        } catch (e) { erro = e.message || String(e); }

        const tipo = pesqClassificarErro(erro);
        if (tipo === 'predio') {
          // Lembra o bloqueio: sem isso sao N POSTs recusados por ciclo, pra sempre.
          bloqueios[tech] = now; travadas++;
          travadasPorTropa[tech] = (travadasPorTropa[tech] || 0) + 1;
          await sleep(250);
          continue;
        }
        if (tipo === 'andando') { andando++; feito = true; break; }   // ja tem pesquisa em curso nesta aldeia
        if (tipo === 'recurso') { faltouRecurso = tech; break; }      // recurso e por aldeia, nao por tropa
        // Nao invento significado: mostro a resposta crua pra dar pra ajustar o classificador.
        pushLog('Pesquisa em ' + rotulo + ' (' + nomeTropa(tech) + '): resposta nao reconhecida - ' + erro, 'err', 'research');
        break;
      }
      if (travadas) semPredio++;
      if (feito || !faltouRecurso) { await sleep(300); continue; }

      if (!config.research.feedOn) {
        pushLog(rotulo + ': sem recurso p/ ' + nomeTropa(faltouRecurso) + ' (abastecimento desligado).', '', 'research');
        await sleep(300); continue;
      }
      const r = await pesqAbastecer({ vid: vid, coord: alvo.coord, name: alvo.name }, todas, cacheFonte);
      if (r.enviou) abastecidas++;
      else pushLog(rotulo + ': sem recurso p/ ' + nomeTropa(faltouRecurso) + ' e nao consegui abastecer (' + r.motivo + ').', '', 'research');
      await sleep(300);
    }

    config.research.stats = {
      villages: ativas.length, pesquisadas: pesquisadas, abastecidas: abastecidas,
      completas: completas, andando: andando, semPredio: semPredio,
    };
    config.research.nextAt = now + Math.max(60, config.research.interval || 900) * 1000;
    _pesqEmVoo = false;
    save();
    renderResearchVillages();
    refreshCards('research');
    // Uma linha por tropa travada, com o predio que resolve. Ex.: "Ariete travada em 14 aldeia(s)
    // - falta Oficina". Nao repete nos ciclos seguintes: o bloqueio segura por blockTtlH horas.
    Object.keys(travadasPorTropa).forEach((tech) => {
      const nome = (UNITS.find((x) => x[0] === tech) || [])[1] || tech;
      const predio = PESQ_PREDIO[tech];
      pushLog('Pesquisa: ' + nome + ' travada em ' + travadasPorTropa[tech] + ' aldeia(s)' +
              (predio ? ' - falta ' + predio + ' (suba em Construcoes)' : ' - falta predio') +
              '. Nao insisto nas proximas ' + (config.research.blockTtlH || 6) + 'h.', '', 'research');
    });
    pushLog('Pesquisa: ciclo concluido - ' + pesquisadas + ' iniciada(s), ' + abastecidas + ' abastecida(s), ' +
            completas + ' sem nada a fazer' + (semPredio ? ', ' + semPredio + ' com item travado por requisito' : '') +
            '. Proximo em ' + Math.round((config.research.interval || 900) / 60) + ' min.', 'ok', 'research');
    scheduleResearch();
  }
  function scheduleResearch() {
    clearTimeout(researchTimer);
    if (!config.research.running) return;
    researchTimer = setTimeout(researchTick, Math.min(Math.max((config.research.nextAt || 0) - Date.now(), 1000), 60000));
  }

  // ===== Modelos =====
  let _pesqTplAtivo = 'padrao';
  function pesqTplIds() { return Object.keys(config.research.templates || {}); }
  function pesqTpl(id) { return (config.research.templates || {})[id || _pesqTplAtivo] || null; }
  function pesqOrdemAtual() {
    const t = pesqTpl(); if (t) return (t.order = t.order || []);
    const ids = pesqTplIds(); if (!ids.length) return [];
    _pesqTplAtivo = ids[0]; return (config.research.templates[ids[0]].order = config.research.templates[ids[0]].order || []);
  }
  function pesqRenderTplSelect() {
    const sel = document.getElementById('twmgr-pq-tpl'); if (!sel) return;
    const ids = pesqTplIds();
    sel.innerHTML = ids.map((id) => '<option value="' + esc(id) + '">' + esc(config.research.templates[id].name) + ' (' + (config.research.templates[id].order || []).length + ')</option>').join('');
    if (ids.indexOf(_pesqTplAtivo) < 0 && ids.length) _pesqTplAtivo = ids[0];
    sel.value = _pesqTplAtivo;
    const mass = document.getElementById('twmgr-pq-mass-tpl');
    if (mass) { const antes = mass.value; mass.innerHTML = sel.innerHTML; if (ids.indexOf(antes) >= 0) mass.value = antes; }
  }
  function renderResearchOrder() {
    const box = document.getElementById('twmgr-pq-order'); if (!box) return;
    const ordem = pesqOrdemAtual();
    if (!ordem.length) { box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:10px;font-size:10px">- ordem vazia (use o + abaixo) -</div>'; return; }
    box.innerHTML = ordem.map((u, i) => {
      const par = UNITS.find((x) => x[0] === u);
      const nome = par ? par[1] : u;
      return '<div class="twmgr-pq-item" data-i="' + i + '">' +
        '<span class="twmgr-pq-ord">' + (i + 1) + '.</span>' +
        '<span class="twmgr-pq-ico">' + unitIcon(u, nome) + '</span>' +
        '<span class="twmgr-pq-name">' + esc(nome) + '</span>' +
        '<span class="twmgr-pq-up" data-i="' + i + '" title="subir prioridade">&#9650;</span>' +
        '<span class="twmgr-pq-down" data-i="' + i + '" title="descer prioridade">&#9660;</span>' +
        '<span class="twmgr-pq-rm" data-i="' + i + '" title="remover">&#10005;</span>' +
        '</div>';
    }).join('');
  }
  function bindResearchOrderHandlers() {
    const box = document.getElementById('twmgr-pq-order'); if (!box) return;
    box.addEventListener('click', (e) => {
      const el = e.target; const i = parseInt(el.getAttribute('data-i'), 10);
      const ordem = pesqOrdemAtual(); if (isNaN(i) || !ordem.length) return;
      if (el.classList.contains('twmgr-pq-up') && i > 0) { const t = ordem[i - 1]; ordem[i - 1] = ordem[i]; ordem[i] = t; }
      else if (el.classList.contains('twmgr-pq-down') && i < ordem.length - 1) { const t = ordem[i + 1]; ordem[i + 1] = ordem[i]; ordem[i] = t; }
      else if (el.classList.contains('twmgr-pq-rm')) { ordem.splice(i, 1); }
      else return;
      save(); renderResearchOrder(); pesqRenderTplSelect();
    });
  }
  function pesqAddUnidade() {
    const sel = document.getElementById('twmgr-pq-add'); if (!sel) return;
    const u = sel.value; const ordem = pesqOrdemAtual();
    if (ordem.indexOf(u) >= 0) { alert('Essa tropa ja esta na ordem.'); return; }
    ordem.push(u); save(); renderResearchOrder(); pesqRenderTplSelect();
  }
  function pesqNovoModelo() {
    const nome = (prompt('Nome do novo modelo de pesquisa:', '') || '').trim();
    if (!nome) return;
    const copiar = confirm('Copiar a ordem do modelo "' + (pesqTpl() ? pesqTpl().name : '') + '"?\n\nOK = copiar   -   Cancelar = vazio');
    const id = 'pq' + Date.now().toString(36);
    config.research.templates[id] = { name: nome.slice(0, 40), order: copiar && pesqTpl() ? pesqOrdemAtual().slice() : [] };
    _pesqTplAtivo = id;
    save(); pesqRenderTplSelect(); renderResearchOrder(); renderResearchVillages();
    pushLog('Modelo de pesquisa "' + nome + '" criado.', 'ok', 'research');
  }
  function pesqRenomearModelo() {
    const t = pesqTpl(); if (!t) return;
    const nome = (prompt('Novo nome:', t.name) || '').trim(); if (!nome) return;
    t.name = nome.slice(0, 40); save(); pesqRenderTplSelect(); renderResearchVillages();
  }
  function pesqApagarModelo() {
    const t = pesqTpl(); if (!t) return;
    if (pesqTplIds().length < 2) { alert('Precisa sobrar pelo menos um modelo.'); return; }
    const usando = Object.keys(config.research.villages).filter((v) => config.research.villages[v].tpl === _pesqTplAtivo);
    if (!confirm('Apagar o modelo "' + t.name + '"?' + (usando.length ? '\n\n' + usando.length + ' aldeia(s) usam ele e vao sair da tabela.' : ''))) return;
    usando.forEach((v) => { delete config.research.villages[v]; });
    delete config.research.templates[_pesqTplAtivo];
    _pesqTplAtivo = pesqTplIds()[0];
    save(); pesqRenderTplSelect(); renderResearchOrder(); renderResearchVillages();
  }
  function pesqSwitchTpl(id) {
    if (!pesqTpl(id)) return;
    _pesqTplAtivo = id;
    const sel = document.getElementById('twmgr-pq-tpl'); if (sel) sel.value = id;
    renderResearchOrder();
  }
  function pesqResetOrdem() {
    const t = pesqTpl(); if (!t) return;
    if (!confirm('Resetar a ordem do modelo "' + t.name + '" pro padrao do script?')) return;
    t.order = PESQ_ORDEM_PADRAO.filter((u) => UNITS.some((x) => x[0] === u));
    save(); renderResearchOrder(); pesqRenderTplSelect();
  }

  // ===== Tabela de aldeias =====
  let _pesqPool = [];
  async function pesqCarregarAldeias() {
    const btn = document.getElementById('twmgr-pq-vil-reload');
    if (btn) btn.textContent = '...';
    try {
      const gid = config.research.filterGroup || '';
      const vs = gid ? await getVillagesInGroup(gid) : await getAllVillagesCached();
      _pesqPool = (vs || []).map((v) => ({ vid: String(v.vid), coord: v.coord || null, name: v.name || v.coord || String(v.vid) }));
      pushLog('Pesquisa: ' + _pesqPool.length + ' aldeia(s) carregadas' + (gid ? ' do grupo selecionado' : '') + '.', '', 'research');
    } catch (e) {
      pushLog('Pesquisa: erro ao carregar as aldeias (' + (e.message || e) + ').', 'err', 'research');
    }
    if (btn) btn.textContent = '↻';
    renderResearchVillages();
  }
  function renderResearchVillages() {
    const box = document.getElementById('twmgr-pq-vils'); if (!box) return;
    const assign = config.research.villages || {}, tpls = config.research.templates || {};
    const mapa = {};
    Object.keys(assign).forEach((vid) => { mapa[vid] = { vid: vid, coord: assign[vid].coord, name: assign[vid].name || assign[vid].coord || vid }; });
    _pesqPool.forEach((v) => { if (!mapa[v.vid]) mapa[v.vid] = v; });
    const linhas = Object.keys(mapa).sort((a, b) => String(mapa[a].name).localeCompare(String(mapa[b].name), 'pt-BR', { numeric: true }));
    if (!linhas.length) { box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:10px;font-size:10px">- clique em &#8635; pra carregar suas aldeias -</div>'; return; }
    box.innerHTML = '<table class="twmgr-bld-tab"><thead><tr>' +
      '<th class="twmgr-tab-ck"><input type="checkbox" id="twmgr-pq-all"></th><th>Aldeia</th><th>Modelo</th><th>Estado</th><th></th>' +
      '</tr></thead><tbody>' +
      linhas.map((vid, i) => {
        const v = mapa[vid], a = assign[vid];
        const tplNome = a && tpls[a.tpl] ? esc(tpls[a.tpl].name) : '<span style="color:#8a7340">-</span>';
        const estado = !a ? '<span style="color:#8a7340">sem gerencia</span>'
          : a.paused ? 'Pausado ( <a class="twmgr-pq-tog" data-vid="' + vid + '">Retomar</a> )'
          : 'Ativo ( <a class="twmgr-pq-tog" data-vid="' + vid + '">Pausar</a> )';
        const rm = a ? '<a class="twmgr-pq-vrm" data-vid="' + vid + '" title="tirar da gestao">Remover</a>' : '';
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + (a ? '' : ' twmgr-bld-off') + '">' +
          '<td class="twmgr-tab-ck"><input type="checkbox" class="twmgr-pq-vsel" data-vid="' + vid + '"></td>' +
          '<td title="' + esc(v.name) + '">' + esc(v.name) + '</td>' +
          '<td>' + tplNome + '</td><td>' + estado + '</td><td>' + rm + '</td></tr>';
      }).join('') + '</tbody></table>';
    const cnt = Object.keys(assign).length, pausadas = Object.keys(assign).filter((v) => assign[v].paused).length;
    const rod = document.getElementById('twmgr-pq-vils-info');
    if (rod) rod.textContent = cnt + ' gerenciada(s)' + (pausadas ? ' - ' + pausadas + ' pausada(s)' : '') + ' - ' + linhas.length + ' na lista';
  }
  function pesqAcaoEmMassa() {
    const acao = document.getElementById('twmgr-pq-mass-acao').value;
    const tplId = document.getElementById('twmgr-pq-mass-tpl').value;
    const vids = Array.prototype.slice.call(document.querySelectorAll('.twmgr-pq-vsel:checked')).map((el) => el.getAttribute('data-vid'));
    if (!vids.length) { alert('Marque pelo menos uma aldeia.'); return; }
    const assign = config.research.villages;
    const pool = {}; _pesqPool.forEach((v) => { pool[v.vid] = v; });
    let n = 0;
    vids.forEach((vid) => {
      if (acao === 'apply') {
        if (!config.research.templates[tplId]) return;
        const base = assign[vid] || pool[vid] || {};
        assign[vid] = { tpl: tplId, paused: false, coord: base.coord || null, name: base.name || base.coord || vid };
        n++;
      } else if (!assign[vid]) { return; }
      else if (acao === 'pause') { assign[vid].paused = true; n++; }
      else if (acao === 'resume') { assign[vid].paused = false; n++; }
      else if (acao === 'remove') { delete assign[vid]; n++; }
    });
    config.research.stats = config.research.stats || {};
    config.research.stats.villages = Object.keys(assign).filter((v) => !assign[v].paused).length;
    save(); renderResearchVillages(); refreshCards('research');
    const rot = { apply: 'modelo aplicado em', pause: 'pausada(s):', resume: 'retomada(s):', remove: 'removida(s) da gestao:' }[acao];
    pushLog('Pesquisa: ' + rot + ' ' + n + ' aldeia(s).', 'ok', 'research');
  }
  function bindResearchVillageHandlers() {
    const box = document.getElementById('twmgr-pq-vils'); if (!box) return;
    box.addEventListener('click', (e) => {
      const el = e.target, vid = el.getAttribute && el.getAttribute('data-vid');
      if (el.id === 'twmgr-pq-all' || !vid) return;
      if (el.classList.contains('twmgr-pq-tog')) {
        const a = config.research.villages[vid]; if (!a) return;
        a.paused = !a.paused; save(); renderResearchVillages(); refreshCards('research');
      } else if (el.classList.contains('twmgr-pq-vrm')) {
        delete config.research.villages[vid]; save(); renderResearchVillages(); refreshCards('research');
      }
    });
    box.addEventListener('change', (e) => {
      if (e.target.id !== 'twmgr-pq-all') return;
      const on = e.target.checked;
      document.querySelectorAll('.twmgr-pq-vsel').forEach((el) => { el.checked = on; });
    });
  }

  function readResearchCfg() {
    const c = config.research, g = (id) => document.getElementById(id);
    if (g('twmgr-pq-int')) c.interval = Math.max(1, parseInt(g('twmgr-pq-int').value, 10) || 15) * 60;
    if (g('twmgr-pq-feed')) c.feedOn = g('twmgr-pq-feed').checked;
    if (g('twmgr-pq-reserve')) c.feedReserve = Math.max(0, Math.min(90, parseInt(g('twmgr-pq-reserve').value, 10) || 40));
    if (g('twmgr-pq-dist')) c.feedMaxDist = Math.max(1, parseInt(g('twmgr-pq-dist').value, 10) || 20);
    if (g('twmgr-pq-fill')) c.feedFillPct = Math.max(10, Math.min(100, parseInt(g('twmgr-pq-fill').value, 10) || 60));
    save();
  }
  function setResearchStatus(on) { setBtnState('twmgr-pq-start', 'twmgr-pq-stop', on, '● Pesquisando', '▶ Pesquisar'); }
  function researchStart() {
    readResearchCfg();
    const assign = config.research.villages || {};
    const ativas = Object.keys(assign).filter((v) => !assign[v].paused && config.research.templates[assign[v].tpl]);
    if (!ativas.length) { pushLog('Pesquisa: nenhuma aldeia ativa - carregue a lista, marque e aplique um modelo.', 'err', 'research'); return; }
    config.research.running = true; config.research.nextAt = 0; save();
    setResearchStatus(true);
    pushLog('Pesquisa iniciada - ' + ativas.length + ' aldeia(s) em ' + pesqTplIds().length + ' modelo(s).', 'ok', 'research');
    researchTick();
  }
  function researchStop() {
    readResearchCfg(); config.research.running = false; save();
    clearTimeout(researchTimer); setResearchStatus(false);
    pushLog('Pesquisa parada.', '', 'research');
  }
  // ==================== OBRA (construção por perfil, via grupos nativos do TW) ====================
  // Diferente do Construções (que é por aldeia, cadastrada à mão), aqui cada aldeia entra no fluxo
  // automaticamente ao ser colocada num dos 5 grupos do jogo — nenhum cadastro manual extra.
  // Fazenda e Armazém são condicionais (não seguem a ordem estática do template) na maioria dos
  // perfis: só entram quando o gatilho ao vivo dispara. Fast Nobre quebra essa regra do Armazém
  // (fica embutido no próprio template, proativo). Pesquisa do Ferreiro (escolher a unidade) NÃO é
  // automatizada aqui — o endpoint de pesquisa nunca foi investigado/confirmado nesta sessão, só o
  // NÍVEL do prédio Ferreiro é controlado; escolher a tropa a pesquisar ainda é manual no jogo.
  async function getGroupProfileMapObra() {
    const g = config.obra.groups || {}, map = {};
    for (const p of OBRA_PROFILES) {
      if (!g[p]) continue;
      let vs = [];
      try { vs = await getVillagesInGroup(g[p]); } catch (e) {}
      vs.forEach((v) => { if (!map[v.vid]) map[v.vid] = { profile: p, coord: v.coord }; });
    }
    if (OBRA_PROFILES.some((p) => g[p])) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
    return map;
  }
  // Gatilhos condicionais de Fazenda (pop. livre baixa) e Armazém (recurso acima de X% da capacidade)
  // — usam res.pop/popMax/wood/stone/iron/storageMax, que getBuildState já extrai de graça da mesma
  // página (sem fetch extra). Retorna o nome do prédio a priorizar, ou null se nada disparou.
  function obraSpecialPriority(state, profile) {
    const cfg = config.obra, res = state.res || {};
    const freePop = (res.popMax || 0) - (res.pop || 0);
    if ((state.level.farm || 0) < 30 && state.hasBtn.farm && freePop < (cfg.farmFreePopMin || 800)) return 'farm';
    if (!OBRA_PROFILE_META[profile].storageProativo) {
      const cap = res.storageMax || 1;
      const fillPct = Math.max(res.wood || 0, res.stone || 0, res.iron || 0) / cap * 100;
      if ((state.level.storage || 0) < 30 && state.hasBtn.storage && fillPct >= (cfg.storageFillPct || 60)) return 'storage';
    }
    return null;
  }
  const OBRA_MINE_GATE_LEVEL = 10;   // uma mina só é upada além disso se o prédio prioritário também já estiver aqui
  function computeObra(state, plan, profile) {
    const cfg = config.obra, reserve = cfg.reserveMin || 0, res = state.res || {};
    const meta = OBRA_PROFILE_META[profile] || {};
    const prioLevel = meta.priorityBuilding ? (state.level[meta.priorityBuilding] || 0) : Infinity;
    const canAfford = (b) => {
      if (!state.buildable[b]) return false;
      if (!reserve) return true;
      const c = state.cost[b] || { wood: 0, stone: 0, iron: 0 };   // reserva mín. de recurso — prioriza o Recrutar quando configurado
      return (res.wood - c.wood >= reserve) && (res.stone - c.stone >= reserve) && (res.iron - c.iron >= reserve);
    };
    const special = obraSpecialPriority(state, profile);
    if (special && state.hasBtn[special]) {
      if (canAfford(special)) return { build: { b: special, cost: state.cost[special] }, demand: null };
      return { build: null, demand: { b: special, cost: state.cost[special] } };
    }
    for (const it of plan) {
      if (it.en === false) continue;
      if ((state.level[it.b] || 0) >= it.lvl) continue;
      if (!state.hasBtn[it.b]) {
        // travado por pré-requisito (ex.: Ferreiro exige Ed.Principal 5) -> prioriza o requisito que falta
        // em vez de cair no próximo item do template por eliminação (senão o motor nunca "volta" pro travado)
        const reqs = (state.locked && state.locked[it.b]) || [];
        for (const req of reqs) {
          if ((state.level[req.b] || 0) >= req.lvl) continue;
          if (!state.hasBtn[req.b]) continue;   // o próprio requisito também travado -> não dá pra resolver agora
          if (canAfford(req.b)) return { build: { b: req.b, cost: state.cost[req.b] }, demand: null };
          return { build: null, demand: { b: req.b, cost: state.cost[req.b] } };
        }
        continue;
      }
      // Aldeias "de segunda mão" (conquistadas/compradas) podem já ter mina bem upada com o prédio
      // prioritário travado (falta Ed.Principal p/ liberar Quartel/Estábulo) — sem isso, o motor cai
      // pra mina por eliminação. Regra: uma mina que JÁ está em nível 10+ só continua subindo se o
      // prédio prioritário também já estiver em 10+; minas ainda baixas (bootstrap de aldeia nova)
      // seguem normal, pois a economia inicial ainda depende delas.
      if ((it.b === 'wood' || it.b === 'stone' || it.b === 'iron') && (state.level[it.b] || 0) >= OBRA_MINE_GATE_LEVEL && prioLevel < OBRA_MINE_GATE_LEVEL) continue;
      if (canAfford(it.b)) return { build: { b: it.b, cost: state.cost[it.b] }, demand: null };
      return { build: null, demand: { b: it.b, cost: state.cost[it.b] } };
    }
    return { build: null, demand: null };
  }
  // ==================== OBRA — pesquisa automática do Ferreiro ====================
  // Confirmado via DevTools (capturado ao vivo, não chutado): POST /game.php?village=X&screen=smith
  // &ajaxaction=research, body "tech_id=<unit>&source=<vid>&h=<csrf>". A tela GET screen=smith embute
  // BuildingSmith.techs = {...} com o estado de cada tropa pesquisável — mesmo truque de parse
  // (extractBalancedJSON) usado no módulo Paladino pro receiveKnightsData.
  const OBRA_RESEARCH_ORDER = {
    fullAtk:   ['axe', 'spy', 'light', 'ram'],
    fullDef:   ['spear', 'sword', 'spy'],
    farmAtk:   ['axe', 'spy', 'light', 'ram'],
    fastDef:   ['spear', 'sword', 'spy', 'light', 'heavy'],
    fastNobre: ['axe', 'spy', 'light', 'ram'],
  };
  async function getSmithTechs(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=smith', { credentials: 'include' });
    const html = await res.text();
    const marker = 'BuildingSmith.techs = ';
    const idx = html.indexOf(marker);
    if (idx < 0) throw new Error('BuildingSmith.techs não encontrado (Ferreiro nv.0?)');
    const json = extractBalancedJSON(html, idx + marker.length);
    if (!json) throw new Error('parse de BuildingSmith.techs falhou');
    const data = JSON.parse(json);
    return (data && data.available) || {};
  }
  async function smithResearch(vid, techId) {
    const b = new URLSearchParams();
    b.set('tech_id', techId);
    b.set('source', String(vid));
    b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + vid + '&screen=smith&ajaxaction=research', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: b.toString(),
    });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!j || !j.response) throw new Error('resposta inesperada (' + (txt || '').slice(0, 100).replace(/\s+/g, ' ') + ')');
    return j.response;
  }
  // Anda pela ordem de pesquisa do perfil; devolve o techId pesquisado agora, ou null se não fez nada
  // (já tudo pesquisado / falta prédio / já tem pesquisa em andamento nessa aldeia).
  async function obraResearchStep(vid, profile) {
    const order = OBRA_RESEARCH_ORDER[profile] || [];
    if (!order.length) return null;
    const techs = await getSmithTechs(vid);
    for (const techId of order) {
      const t = techs[techId];
      if (!t) continue;
      if ((+t.level || 0) >= 1) continue;        // já pesquisado -> próximo da ordem
      if (t.error_buildings) return null;        // falta prédio (Estábulo/Oficina/Ferreiro) -> Obra resolve subindo o prédio, espera
      if (t.can_research) { await smithResearch(vid, techId); return techId; }
      return null;                                // nem pronto nem livre -> já em andamento, espera
    }
    return null;
  }
  async function obraTick() {
    clearTimeout(obraTimer);
    if (!config.obra.running) return;
    if (lockOther()) { obraTimer = setTimeout(obraTick, 5000); return; }
    if (captchaBlocked()) { obraTimer = setTimeout(obraTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.obra.nextAt || 0) > now) { scheduleObra(); return; }
    let pmap;
    try { pmap = await getGroupProfileMapObra(); }
    catch (e) { pushLog('Obra: erro ao ler os grupos (' + (e.message || e) + ').', 'err', 'obra'); config.obra.nextAt = now + 120000; save(); scheduleObra(); return; }
    const vids = Object.keys(pmap);
    if (!vids.length) { pushLog('Obra: mapeie ao menos 1 grupo de perfil na aba Obra.', '', 'obra'); config.obra.nextAt = now + 300000; save(); scheduleObra(); return; }
    config.obra.demand = {};
    let built = 0, researched = 0;
    for (const vid of vids) {
      const profile = pmap[vid].profile;
      const plan = (config.obra.plans && config.obra.plans[profile]) || [];
      let st;
      try { st = await getBuildState(vid); }
      catch (e) { pushLog('Obra em ' + (pmap[vid].coord || vid) + ': erro ao ler o estado (' + (e.message || e) + ').', 'err', 'obra'); continue; }
      const r = computeObra(st, plan, profile);
      if (r.demand) config.obra.demand[vid] = { b: r.demand.b, cost: r.demand.cost, coord: pmap[vid].coord, profile: profile };
      if (r.build && st.queueLen < (config.obra.maxQueue || 5)) {
        try {
          await enqueueBuild(vid, r.build.b);
          built++;
          const bn = (BUILD_META[r.build.b] && BUILD_META[r.build.b].name) || r.build.b;
          pushLog('Obra: ' + (pmap[vid].coord || vid) + ' [' + OBRA_PROFILE_META[profile].name + '] → ' + bn + ' na fila (custo ' + r.build.cost.wood + '/' + r.build.cost.stone + '/' + r.build.cost.iron + ')', 'ok', 'obra');
        } catch (e) { pushLog('Obra em ' + (pmap[vid].coord || vid) + ': ' + (e.message || e), 'err', 'obra'); }
      } else if (r.demand) {
        const bn = (BUILD_META[r.demand.b] && BUILD_META[r.demand.b].name) || r.demand.b;
        pushLog((pmap[vid].coord || vid) + ' [' + OBRA_PROFILE_META[profile].name + ']: aguardando recurso p/ ' + bn + ' (' + r.demand.cost.wood + '/' + r.demand.cost.stone + '/' + r.demand.cost.iron + ')', '', 'obra');
      }
      if (config.obra.autoResearch) {
        try {
          const techId = await obraResearchStep(vid, profile);
          if (techId) { researched++; pushLog('Obra: ' + (pmap[vid].coord || vid) + ' [' + OBRA_PROFILE_META[profile].name + '] → pesquisando ' + techId, 'ok', 'obra'); }
        } catch (e) { pushLog('Obra (pesquisa) em ' + (pmap[vid].coord || vid) + ': ' + (e.message || e), 'err', 'obra'); }
      }
      await sleep(300);
    }
    config.obra.stats = config.obra.stats || {};
    config.obra.stats.villages = vids.length;
    config.obra.stats.built = built;
    config.obra.stats.researched = researched;
    config.obra.nextAt = now + Math.max(60, config.obra.interval || 600) * 1000;
    save();
    refreshCards('obra'); renderObraDemand();
    pushLog('Obra: ciclo concluído — ' + built + ' obra(s) enfileirada(s). Próximo em ' + Math.round((config.obra.interval || 600) / 60) + ' min.', 'ok', 'obra');
    scheduleObra();
  }
  function scheduleObra() { clearTimeout(obraTimer); if (!config.obra.running) return; obraTimer = setTimeout(obraTick, Math.min(Math.max((config.obra.nextAt || 0) - Date.now(), 1000), 60000)); }
  function readObraCfg() {
    const c = config.obra, g = (id) => document.getElementById(id);
    if (g('twmgr-ob-max')) c.maxQueue = Math.max(1, parseInt(g('twmgr-ob-max').value, 10) || 5);
    if (g('twmgr-ob-int')) c.interval = Math.max(1, parseInt(g('twmgr-ob-int').value, 10) || 10) * 60;
    if (g('twmgr-ob-reserve')) c.reserveMin = Math.max(0, parseInt(g('twmgr-ob-reserve').value, 10) || 0);
    if (g('twmgr-ob-farmpop')) c.farmFreePopMin = Math.max(0, parseInt(g('twmgr-ob-farmpop').value, 10) || 800);
    if (g('twmgr-ob-storagepct')) c.storageFillPct = Math.max(1, Math.min(100, parseInt(g('twmgr-ob-storagepct').value, 10) || 60));
    if (g('twmgr-ob-research')) c.autoResearch = !!g('twmgr-ob-research').checked;
    OBRA_PROFILES.forEach((p) => { const el = g('twmgr-ob-g-' + p); if (el) c.groups[p] = el.value || null; });
    save();
  }
  function setObraStatus(on) { setBtnState('twmgr-ob-start', 'twmgr-ob-stop', on, '● Construindo', '▶ Iniciar'); }
  function obraStart() {
    readObraCfg();
    if (!OBRA_PROFILES.some((p) => config.obra.groups[p])) { pushLog('Obra: mapeie ao menos 1 grupo de perfil.', 'err', 'obra'); return; }
    config.obra.running = true; config.obra.nextAt = 0; save();
    setObraStatus(true);
    pushLog('Obra iniciada.', 'ok', 'obra');
    obraTick();
  }
  function obraStop() { readObraCfg(); config.obra.running = false; save(); clearTimeout(obraTimer); setObraStatus(false); pushLog('Obra parada.', '', 'obra'); }
  async function fillObraGroupSelects() {
    let groups = [];
    try { groups = await getGroups(); } catch (e) { pushLog('Obra: erro ao listar grupos: ' + (e.message || e), 'err', 'obra'); return; }
    OBRA_PROFILES.forEach((p) => {
      const sel = document.getElementById('twmgr-ob-g-' + p); if (!sel) return;
      const cur = config.obra.groups[p];
      sel.innerHTML = '<option value="">— nenhum —</option>' + groups.map((gr) => '<option value="' + gr.id + '"' + (String(cur) === String(gr.id) ? ' selected' : '') + '>' + esc(gr.name) + '</option>').join('');
    });
  }
  function renderObraDemand() {
    const cont = document.getElementById('twmgr-ob-demand'); if (!cont) return;
    const demand = config.obra.demand || {};
    const keys = Object.keys(demand);
    if (!keys.length) { cont.innerHTML = '<div style="font-size:10px;color:#8a7d6d;padding:6px;text-align:center">— nada aguardando recurso —</div>'; return; }
    cont.innerHTML = keys.map((vid) => {
      const d = demand[vid];
      const bn = (BUILD_META[d.b] && BUILD_META[d.b].name) || d.b;
      return '<div style="font-size:10px;color:#6f6153;padding:2px 0;border-bottom:1px solid rgba(0,0,0,.07)">' +
        esc(d.coord || vid) + ' [' + esc((OBRA_PROFILE_META[d.profile] || {}).name || d.profile) + '] → ' + esc(bn) + ' (' + d.cost.wood + '/' + d.cost.stone + '/' + d.cost.iron + ')</div>';
    }).join('');
  }

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
    // Roda também quando os IDs já foram achados: é a ÚNICA fonte das UNIDADES de cada template, e
    // antes ficava de fora sempre que as estratégias 1/2 davam certo (ids ok, unidades vazias).
    if (!out.a || !out.b || !Object.keys(out.unitsA).length || !Object.keys(out.unitsB).length) {
      // Aceita templates:[…] · "templates":[…] · templates = {…}. E em vez de regex não-gulosa (que
      // parava no primeiro ] e quebrava com aninhamento), varre contando colchetes/chaves.
      const anchor = html.search(new RegExp('[\'"]?templates[\'"]?\\s*[:=]\\s*[[{]'));
      let raw = null;
      if (anchor >= 0) {
        let i = anchor; while (i < html.length && html[i] !== '[' && html[i] !== '{') i++;
        const open = html[i], close = open === '[' ? ']' : '}';
        let depth = 0, j = i, q = null;
        for (; j < html.length && j - i < 20000; j++) {
          const ch = html[j];
          if (q) { if (ch === '\\') j++; else if (ch === q) q = null; continue; }
          if (ch === '"' || ch === "'") { q = ch; continue; }
          if (ch === open) depth++;
          else if (ch === close) { depth--; if (!depth) { raw = html.slice(i, j + 1); break; } }
        }
      }
      const m = raw ? [null, raw] : null;
      if (!m) out.debug.push('inline JS: bloco templates não encontrado');
      if (m) {
        try {
          let parsed = JSON.parse(m[1].replace(new RegExp('([{,]\\s*)(\\w+)\\s*:', 'g'), '$1"$2":').replace(/'/g, '"'));
          if (parsed && !Array.isArray(parsed)) parsed = Object.keys(parsed).map((k) => Object.assign({ id: k }, parsed[k]));
          if (Array.isArray(parsed) && parsed.length) {
            // Casa pelo ID quando ele já é conhecido; só cai na ordem [0]=A,[1]=B se não achar.
            const byId = (id) => (id ? parsed.find((t) => t && String(t.id) === String(id)) : null);
            const pa = byId(out.a) || parsed[0], pb = byId(out.b) || parsed[1];
            if (!out.a && pa && pa.id) { out.a = String(pa.id); out.debug.push('A via inline JS'); }
            if (!out.b && pb && pb.id) { out.b = String(pb.id); out.debug.push('B via inline JS'); }
            if (pa && pa.units) { out.unitsA = Object.assign({}, out.unitsA, pa.units); out.debug.push('unidades A via inline JS'); }
            if (pb && pb.units) { out.unitsB = Object.assign({}, out.unitsB, pb.units); out.debug.push('unidades B via inline JS'); }
          }
        } catch (e) { out.debug.push('inline JS: JSON não parseável'); }
      }
    }
    // Estratégia 4 (a que funciona no br143): os campos são nomeados unidade[templateId] — light[965],
    // spear[2770]… O id vive DENTRO do name, e não num input template_id separado. Por isso as
    // estratégias que procuravam template_id não achavam nada.
    const readByTplId = (id, bucket, tag) => {
      if (!id) return;
      let achou = 0;
      UNITS.forEach((p) => {
        const inp = doc.querySelector('input[name="' + p[0] + '[' + id + ']"]');
        if (!inp) return;
        const n = parseInt(inp.value, 10);
        if (n > 0) { bucket[p[0]] = n; achou++; }
      });
      if (achou) out.debug.push('unidades ' + tag + ' via name[id]');
    };
    if (!Object.keys(out.unitsA).length) readByTplId(out.a, out.unitsA, 'A');
    if (!Object.keys(out.unitsB).length) readByTplId(out.b, out.unitsB, 'B');

    // Se AINDA não temos as unidades, registra a "cara" da página pra saber onde elas moram de fato,
    // em vez de tentar seletor no escuro. Sai uma vez, junto do aviso do ciclo.
    if (!Object.keys(out.unitsA).length && !Object.keys(out.unitsB).length) {
      const pat = {};
      doc.querySelectorAll('input[name]').forEach((i) => {
        const n = i.getAttribute('name') || '';
        if (UNITS.some((p) => n.indexOf(p[0]) !== -1)) pat[n.replace(/\d+/g, '#')] = 1;
      });
      out.debug.push('página: ' + doc.querySelectorAll('form').length + ' form(s), ' +
        doc.querySelectorAll('input[name="template_id"]').length + ' template_id, campos de unidade: ' +
        (Object.keys(pat).slice(0, 6).join(' ') || 'nenhum') +
        (/Accountmanager|AccountManager/.test(html) ? ' · tem Accountmanager' : ' · sem Accountmanager'));
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

  // Estados de conhecimento por aldeia. Guardados como número — com milhares de aldeias
  // no raio, a diferença entre gravar um código e gravar um objeto é centenas de KB no
  // localStorage, que tem limite de ~5MB.
  const MAP_INTEL = {
    OK: 1,        // tenho relatório com dados: sei o que tem lá
    VAZIO: 2,     // tenho relatório, mas veio sem informação (o explorador morreu)
    NADA: 3,      // nem aparece no assistente: não sei nada
    ROTA: 4,      // explorador a caminho agora
    BL_PERDA: 5,  // blacklist: perdi tropa
    BL_DEFESA: 6, // blacklist: tem defesa
  };
  const MAP_INTEL_COR = {
    1: '#3f8f52',   // verde   — explorado, sei o que tem
    2: '#8b5426',   // âmbar   — explorei e não vi nada
    3: '#9e8046',   // cinza   — buraco no meu conhecimento
    4: '#2f6f9e',   // azul    — explorador voando
    5: '#c9722a',   // laranja — perdi tropa
    6: '#c0483a',   // vermelho— tem defesa
  };
  const MAP_INTEL_NOME = {
    1: 'explorado', 2: 'explorei, sem info', 3: 'nunca explorado',
    4: 'explorador a caminho', 5: 'perdi tropa', 6: 'tem defesa',
  };

  // Quanto tempo esperar por um relatório antes de reexplorar o mesmo alvo. Explorador
  // voa, chega, e o relatório aparece: em 20 campos isso é questão de minutos. Sem esta
  // trava o ciclo seguinte reenviaria antes de a informação chegar, queimando tropa.
  const MAP_ESPERA_RELATORIO_MS = 45 * 60 * 1000;

  // Mantém as duas blacklists a partir do que o assistente mostra.
  //
  // PERDA: a cor do último saque. Vermelho = perdi tropa lá. Sai da lista sozinha quando
  // aparecer relatório verde, amarelo ou azul — que é o sinal de que o saque voltou bem.
  // DEFESA: entra por leitura de relatório (mapProcessarRelatorios), e NÃO sai sozinha —
  // tropa defensiva não some porque o próximo saque deu certo.
  function mapAtualizarBlacklists(sabido) {
    const cfg = config.map;
    let entrou = 0, saiu = 0;
    Object.keys(sabido).forEach((coord) => {
      const s = sabido[coord];
      if (s.color === 'red') {
        if (!cfg.blacklistPerda[coord]) { cfg.blacklistPerda[coord] = { at: Date.now(), vid: s.targetId }; entrou++; }
      } else if (s.color === 'green' || s.color === 'yellow' || s.color === 'blue') {
        if (cfg.blacklistPerda[coord]) { delete cfg.blacklistPerda[coord]; saiu++; }
      }
    });
    if (entrou) pushLog('🗺️ ' + entrou + ' aldeia(s) entraram na blacklist de tropa perdida (último saque veio vermelho).', '', 'map');
    if (saiu) pushLog('🗺️ ' + saiu + ' aldeia(s) saíram da blacklist de tropa perdida (saque voltou bem).', 'ok', 'map');
    if (entrou || saiu) save();
  }

  // Lê os relatórios de exploração novos e põe na blacklist quem tem defesa.
  // Uma requisição por relatório ainda não lido — por isso o registro do que já foi lido.
  async function mapProcessarRelatorios(sabido, limite) {
    const cfg = config.map;
    const pend = Object.keys(sabido).filter((coord) =>
      sabido[coord].reportId && !cfg.relatoriosLidos[sabido[coord].reportId] &&
      !cfg.blacklistDefesa[coord] && sabido[coord].temDados);
    if (!pend.length) return 0;
    let achou = 0, lidos = 0;
    for (const coord of pend.slice(0, limite || 20)) {
      if (devoParar('map')) break;
      const s = sabido[coord];
      let def;
      try { def = await getReportDefenseTotal(s.reportId); }
      catch (e) { continue; }   // não deu pra ler: NÃO marca como lido, tenta de novo depois
      cfg.relatoriosLidos[s.reportId] = 1; lidos++;
      if (def >= (cfg.defesaMin || 1)) {
        cfg.blacklistDefesa[coord] = { at: Date.now(), vid: s.targetId, defTotal: def, removido: false };
        achou++;
        pushLog('🛡️ ' + coord + ' tem defesa (' + def + ' unidades) — entrou na blacklist e sai da rota de exploração e de saque.', '', 'map');
        if (cfg.removerDoAssistente && s.targetId) {
          try { await mapApagarDoAssistente(s.targetId, coord); cfg.blacklistDefesa[coord].removido = true; }
          catch (e) { pushLog('🗑️ ' + coord + ': não consegui apagar do assistente (' + (e.message || e) + '). A blacklist continua valendo.', 'err', 'map'); }
          await sleep(400);
        }
      }
      await sleep(250);
    }
    if (lidos) save();
    return achou;
  }

  // Apaga os relatórios de uma aldeia no jogo, o que a tira da listagem do assistente.
  //
  // A assinatura foi capturada da requisição real (interceptada e bloqueada, pra não
  // apagar nada durante a descoberta), porque eu não tinha como deduzi-la do fixture:
  //     POST screen=report&ajaxaction=delete_one&json=1&h=<csrf>
  //     body: id=<id da ALDEIA ALVO>   (não do relatório — o fixture confirma: o argumento
  //                                     de deleteReport(49269) casa com a linha village_49269)
  // "delete_one" é o nome deles; o efeito é apagar TODOS os relatórios daquela aldeia.
  //
  // NÃO TEM DESFAZER. Só roda com o interruptor ligado, e cada remoção vai pro log com a
  // coordenada — se um dia der errado, fica o registro do que foi tirado.
  async function mapApagarDoAssistente(targetId, coord) {
    const r = await fetch('/game.php?village=' + CUR_VID + '&screen=report&ajaxaction=delete_one&json=1&h=' + CSRF, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: 'id=' + encodeURIComponent(targetId),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    // Resposta é JSON. Se vier erro explícito, não considera apagado.
    try { const j = JSON.parse(txt); if (j && j.error) throw new Error(String(j.error).slice(0, 80)); } catch (e) { if (e instanceof SyntaxError) { /* não-JSON: segue */ } else throw e; }
    pushLog('🗑️ ' + coord + ' — relatórios apagados no jogo; saiu da listagem do assistente de saque.', '', 'map');
    return true;
  }

  // Bárbaro NOVO = vid que não estava no conjunto conhecido. Pega tanto aldeia que virou
  // bárbara quanto conta deletada. É o que faz o ciclo contínuo ter utilidade.
  function mapDetectarNovos(barbs) {
    const cfg = config.map;
    const agora = Date.now();
    const primeiraVez = !Object.keys(cfg.barbConhecidos).length;
    const novos = [];
    barbs.forEach((b) => {
      if (!cfg.barbConhecidos[b.vid]) { cfg.barbConhecidos[b.vid] = agora; if (!primeiraVez) novos.push(b); }
    });
    if (primeiraVez) pushLog('🗺️ Primeira leitura do mapa: ' + barbs.length + ' bárbaros registrados. A partir do próximo ciclo eu aviso o que for novo.', '', 'map');
    else if (novos.length) pushLog('🗺️ ' + novos.length + ' bárbaro(s) NOVO(S) desde a última leitura.', 'ok', 'map');
    save();
    return novos;
  }

  // Exploradores em casa de TODAS as aldeias, numa requisição só.
  //
  // A tela de coleta em massa devolve unit_counts_home de cada aldeia — a tropa em casa
  // inteira, não só as unidades de coleta. Ler de lá custa 1 requisição; ler aldeia por
  // aldeia custaria 43. É a leitura em massa que estava pendente da auditoria de terça.
  async function mapEspioesEmCasa() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=place&mode=scavenge_mass', { credentials: 'include' });
    const html = await res.text();
    const m = html.match(/\[\{"village_id":[\s\S]*?\}\]/);
    if (!m) throw new Error('não achei os dados de coleta em massa');
    const arr = JSON.parse(m[0]);
    const out = {};
    arr.forEach((v) => {
      const bruto = parseInt((v.unit_counts_home || {}).spy, 10) || 0;
      const reservado = ((config.reservations || {})[String(v.village_id)] || {}).spy || 0;
      out[String(v.village_id)] = Math.max(0, bruto - reservado);
    });
    return out;
  }

  // Grava o estado de conhecimento de cada bárbaro DENTRO DO RAIO. Fora do raio não entra:
  // não é buraco no conhecimento, é lugar onde eu nem pretendo olhar — e guardar o mundo
  // inteiro estouraria o localStorage sem informar nada.
  function mapGravarIntel(barb, myV, sabido, attacking) {
    const cfg = config.map;
    const maxDist = cfg.maxDist || 20;
    const intel = {};
    let dentro = 0, conhecidas = 0;
    barb.forEach((b) => {
      const coord = b.x + '|' + b.y;
      let perto = false;
      for (const s of myV) { if (fieldDist(s.x, s.y, b.x, b.y) <= maxDist) { perto = true; break; } }
      if (!perto) return;
      dentro++;
      let cod;
      if (cfg.blacklistDefesa[coord]) cod = MAP_INTEL.BL_DEFESA;
      else if (cfg.blacklistPerda[coord]) cod = MAP_INTEL.BL_PERDA;
      else if (attacking.has(coord)) cod = MAP_INTEL.ROTA;
      else {
        const s = sabido[coord];
        cod = !s ? MAP_INTEL.NADA : (s.temDados ? MAP_INTEL.OK : MAP_INTEL.VAZIO);
      }
      if (cod === MAP_INTEL.OK || cod === MAP_INTEL.BL_DEFESA) conhecidas++;
      intel[coord] = cod;
    });
    cfg.intel = intel;
    cfg.intelAt = Date.now();
    save();
    return { dentro: dentro, conhecidas: conhecidas, pct: dentro ? Math.round(conhecidas * 100 / dentro) : 0 };
  }

  async function mapPlanTargets() {
    const cfg = config.map;
    let allV;
    try { allV = await getMapVillages(); }
    catch (e) { pushLog('BM: erro ao ler village.txt: ' + (e.message || e), 'err'); return null; }
    const barb = allV.filter((v) => (!cfg.onlyBarbarians || v.player === '0') && v.points >= (cfg.minPoints || 0) && v.points <= (cfg.maxPoints || 99999));
    const novos = mapDetectarNovos(barb);
    const idNovo = {}; novos.forEach((b) => { idNovo[b.vid] = 1; });
    let mine;
    try {
      if (cfg.group) { const list = await getVillagesInGroup(cfg.group); mine = list.map((v) => ({ vid: v.vid, coord: v.coord, name: v.coord })); }
      else { const list = await getAllVillagesCached(); mine = list.map((v) => ({ vid: v.vid, coord: v.coord, name: v.name })); }
    } catch (e) { pushLog('BM: erro ao ler minhas aldeias: ' + (e.message || e), 'err'); return null; }
    if (cfg.group) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
    const myV = [];
    mine.forEach((v) => { const cm = (v.coord || '').match(/(\d+)\|(\d+)/); if (cm) myV.push({ vid: v.vid, name: v.name || v.coord, coord: v.coord, x: +cm[1], y: +cm[2] }); });
    const now = Date.now();
    const staleMs = Math.max(0, (cfg.minDaysSinceScout || 0)) * 86400000;
    const sentAt = cfg.sentAt || {};
    // O QUE EU JÁ SEI, lido do assistente uma vez (conta inteira).
    //
    // A regra deixou de ser "faz quantos dias que escaneei" e passou a ser "tenho ou não
    // tenho informação". Três estados, e só o primeiro dispensa explorador:
    //   temDados  -> tem relatório E ele trouxe a muralha: eu sei o que tem lá
    //   semDados  -> tem relatório mas a muralha veio em branco: o explorador morreu
    //   ausente   -> nem aparece no assistente: não sei nada
    // De quebra a cor do último saque entra aqui: VERMELHO é tropa perdida.
    const sabido = {};   // coord -> { temDados, reportId, wall, color, targetId }
    try {
      (await getFarmTargetsCached(CUR_VID)).forEach((t) => {
        if (!t.coord) return;
        sabido[t.coord] = { temDados: !!(t.reportId && t.wall != null), reportId: t.reportId, wall: t.wall, color: t.color, targetId: t.targetId, reportAt: t.reportAt || 0 };
      });
      mapAtualizarBlacklists(sabido);
    } catch (e) { pushLog('Mapa: não consegui ler o assistente (vou considerar tudo como não-explorado): ' + (e.message || e), 'err', 'map'); }
    // O filtro do assistente pode esconder aldeias que você já está atacando; a lista de comandos cobre esse buraco.
    let attacking = new Set();
    try { attacking = (await getPendingAttack()).coords; } catch (e) {}
    // Cada bárbaro vai pra aldeia minha mais próxima QUE AINDA TENHA COTA (maxPerVillage).
    //
    // A versão anterior prometia isso no comentário e fazia outra coisa: escolhia a aldeia mais
    // próxima na hora de montar o par e, se ela estivesse cheia na hora de distribuir, DESCARTAVA
    // o bárbaro em vez de passar pra próxima. Num bloco de aldeias juntas — que é o formato normal
    // de conta — as centrais saturavam e o resto do cerco ia pro lixo. Simulado com 43 aldeias e
    // 900 bárbaros: 45% dos alvos elegíveis descartados e 29 das 43 aldeias abaixo da cota.
    //
    // Agora: monta TODOS os pares dentro do alcance, ordena por distância e distribui — cada
    // bárbaro entra uma vez só, na origem mais próxima que ainda couber. O alcance limita o
    // tamanho da lista (maxDist é no máximo umas dezenas de campos).
    const candByOrigin = {}; myV.forEach((s) => candByOrigin[s.vid] = []);
    const elegiveis = [];
    for (const b of barb) {
      const coord = b.x + '|' + b.y;
      const last = sentAt[b.vid] || 0;
      // blacklist: perdi tropa aí, ou o relatório mostrou defesa. Não gasta explorador.
      if (cfg.blacklistPerda[coord] || cfg.blacklistDefesa[coord]) continue;
      // já tem ataque nosso em rota pra lá — inclusive explorador já a caminho: não reenvia
      if (attacking.has(coord)) continue;
      // trava curta: mandei explorador há pouco e o relatório ainda não voltou. Sem isto o
      // ciclo seguinte reenviaria pro mesmo alvo antes de a informação chegar.
      if (last && (now - last) < MAP_ESPERA_RELATORIO_MS) continue;
      // Eu já sei o que tem lá? Só isso dispensa explorador.
      const s = sabido[coord];
      if (s && s.temDados) {
        // Reexploração por idade é OPCIONAL (0 = nunca). A regra principal é ter ou não ter
        // informação; a idade só existe pra quem quiser atualizar intel velho.
        if (!staleMs || (now - (s.reportAt || 0)) < staleMs) continue;
      }
      elegiveis.push({ vid: b.vid, x: b.x, y: b.y, coord: coord, points: b.points, name: b.name, lastAt: last, novo: !!idNovo[b.vid] });
    }
    const maxDist = cfg.maxDist || 20;
    const pairs = [];
    for (const t of elegiveis) {
      for (const s of myV) {
        const d = fieldDist(s.x, s.y, t.x, t.y);
        if (d <= maxDist) pairs.push({ src: s, dist: d, target: t });
      }
    }
    // Bárbaro NOVO passa na frente: é o alvo que ninguém explorou ainda e que pode sumir
    // (outro jogador nobla) se a gente demorar. Empate resolve por distância, como antes.
    pairs.sort((a, b) => (b.target.novo ? 1 : 0) - (a.target.novo ? 1 : 0) || a.dist - b.dist);

    // COTA POR ORIGEM LIMITADA PELO EXPLORADOR QUE A ALDEIA TEM.
    //
    // Sem isto, a atribuição acontecia só por distância e cota, e a checagem de tropa só
    // vinha depois, na hora de enviar: alvo atribuído a uma aldeia sem explorador era
    // simplesmente descartado, mesmo com outra aldeia perto cheia de explorador sobrando.
    // Era o mesmo defeito da cota que corrigi na v10.14.0 — atribuir sem olhar capacidade.
    // Com a cota real, a aldeia sem tropa recebe cota 0 e o alvo escorre pra próxima.
    //
    // Custa 1 requisição pra todas as aldeias (tela de coleta em massa). Se ela falhar,
    // volta ao comportamento antigo em vez de travar o ciclo.
    const baseLimit = Math.max(1, cfg.maxPerVillage || 20);
    const spyPorAlvo = Math.max(1, cfg.spyCount || 1);
    const reservaSpy = Math.max(0, cfg.spyReserve || 0);
    let espioes = null;
    try { espioes = await mapEspioesEmCasa(); }
    catch (e) { pushLog('🗺️ Não consegui ler os exploradores de todas as aldeias (' + (e.message || e) + ') — vou planejar sem olhar capacidade, como antes.', '', 'map'); }
    const limitePorOrigem = {};
    let semNenhum = 0;
    myV.forEach((s) => {
      if (!espioes) { limitePorOrigem[s.vid] = baseLimit; return; }
      const cabe = Math.floor(Math.max(0, (espioes[s.vid] || 0) - reservaSpy) / spyPorAlvo);
      limitePorOrigem[s.vid] = Math.min(baseLimit, cabe);
      if (!cabe) semNenhum++;
    });
    if (espioes && semNenhum) pushLog('🗺️ ' + semNenhum + ' de ' + myV.length + ' aldeia(s) sem explorador suficiente neste ciclo — os alvos delas foram para as vizinhas que têm.', '', 'map');
    const jaAtribuido = {};
    for (const p of pairs) {
      if (jaAtribuido[p.target.vid]) continue;              // um bárbaro, uma origem
      const arr = candByOrigin[p.src.vid];
      // Cota da origem: o menor entre o teto que você configurou e o que a tropa dela
      // aguenta. Origem sem explorador tem cota 0 e o alvo escorre pra próxima do par.
      if (arr.length >= (limitePorOrigem[p.src.vid] != null ? limitePorOrigem[p.src.vid] : baseLimit)) continue;
      jaAtribuido[p.target.vid] = 1;
      arr.push({ vid: p.target.vid, x: p.target.x, y: p.target.y, coord: p.target.coord, points: p.target.points, name: p.target.name, lastAt: p.target.lastAt, dist: p.dist });
    }
    const alcancaveis = Object.keys(pairs.reduce((m, p) => { m[p.target.vid] = 1; return m; }, {})).length;
    const plan = myV.map((s) => ({ src: s, targets: candByOrigin[s.vid] || [] }));
    const cobertura = mapGravarIntel(barb, myV, sabido, attacking);
    return { myV: myV, plan: plan, barbCount: barb.length, totalCandidates: alcancaveis, sabido: sabido, novos: novos.length, cobertura: cobertura };
  }

  async function mapTick() {
    clearTimeout(mapTimer);
    if (!config.map.running) return;
    // Ainda não é hora do próximo ciclo. O agendamento é feito em fatias de no máximo 60s
    // (ver scheduleMap) porque um setTimeout de 30 minutos escorrega e morre se a aba
    // suspender; quem decide se chegou a hora é este teste, não o timer.
    if (config.map.nextAt && Date.now() < config.map.nextAt) { scheduleMap(); return; }
    if (lockOther()) { mapTimer = setTimeout(mapTick, 5000); return; }
    if (captchaBlocked()) { mapTimer = setTimeout(mapTick, 30000); return; }
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
        // O Mapa põe running=false só no fim; aqui a guarda usa lock e bot-check, que é o que
        // importa num laço de aldeias × até 20 alvos cada (chega a 7 minutos).
        {
          const pare = devoParar('map');
          if (pare) {
            // Com ciclo contínuo, ser interrompido pela trava ou pelo bot-check NÃO é o
            // mesmo que você mandar parar: naquele caso o módulo segue ligado e tenta de
            // novo. Só o botão Parar desliga (e aí running já está false).
            save(); refreshCards('map');
            if (cfg.running) {
              const espera = 5 * 60000;
              cfg.nextAt = Date.now() + espera; save();
              pushLog('🗺️ Ciclo interrompido — ' + pare + '. ' + sentTotal + ' explorador(es) enviado(s); tento de novo em 5 min.', '', 'map');
              mapTimer = setTimeout(mapTick, espera);
            } else {
              setMapStatus(false);
              pushLog('🗺️ Mapa parado. ' + sentTotal + ' explorador(es) enviado(s) neste ciclo.', '', 'map');
            }
            return;
          }
        }
        if (busy[t.coord]) { ocup++; continue; }
        if ((avail.spy || 0) - reserve < spyCount) { semSpy++; continue; }
        try {
          await sendAttack(p.src.vid, String(t.x), String(t.y), { spy: spyCount });
          avail.spy = (avail.spy || 0) - spyCount;
          cfg.sentAt[t.vid] = Date.now();
          vSent++; sentTotal++;
          pushLog('Mapa: ' + p.src.name + ' → ' + t.coord + ' (' + spyCount + ' explorador, ' + (Math.round(t.dist * 10) / 10) + ' campos' + (t.points ? ', ' + t.points + ' pts' : '') + ')', 'ok', 'map');
          if (delay) await sleep(delay + Math.floor(Math.random() * 200));
        } catch (e) {
          const em = String(e.message || e);
          // Ambíguo = o explorador pode ter saído. Carimba mesmo assim: sem isso o próximo run
          // re-explora o alvo e queima explorador de novo.
          if (/^ambiguo:/.test(em)) {
            avail.spy = (avail.spy || 0) - spyCount;
            cfg.sentAt[t.vid] = Date.now(); vSent++; sentTotal++;
            pushLog('Mapa: ' + t.coord + ' — resposta ambígua, pode ter saído. Marquei como explorado.', '', 'map');
          } else {
            pushLog('Mapa: ' + p.src.name + ' → ' + t.coord + ': ' + em, 'err', 'map');
          }
        }
      }
      leftTotal += semSpy + ocup;
      const parts = ['enviou ' + vSent];
      if (semSpy) parts.push(semSpy + ' sem explorador (reserva)');
      if (ocup) parts.push(ocup + ' já com ataque a caminho');
      pushLog(p.src.name + ' (' + p.src.coord + '): ' + parts.join(' · '), '', 'map');
    }
    Object.keys(cfg.sentAt).forEach((k) => { if (now - cfg.sentAt[k] > 30 * 86400000) delete cfg.sentAt[k]; });

    // Lê os relatórios novos e alimenta a blacklist de defesa. Depois do envio, de
    // propósito: o que interessa é o relatório que já existe, e enquanto isso os
    // exploradores que acabaram de sair estão voando.
    let comDefesa = 0;
    if (plan.sabido) { try { comDefesa = await mapProcessarRelatorios(plan.sabido, 20); } catch (e) {} }

    cfg.stats = {
      mapped: plan.barbCount, reach: plan.totalCandidates, sent: sentTotal, left: leftTotal,
      novos: plan.novos || 0,
      blPerda: Object.keys(cfg.blacklistPerda || {}).length,
      blDefesa: Object.keys(cfg.blacklistDefesa || {}).length,
    };

    // CICLO CONTÍNUO. Antes era one-shot — terminava e desligava, e você tinha que clicar
    // Iniciar de novo. Agora fica ligado: a cada ciclo relê o mapa, detecta bárbaro novo e
    // manda explorador no que ainda não tem informação.
    const intervalo = Math.max(5, cfg.cicloMin || 30) * 60000;
    cfg.nextAt = Date.now() + intervalo;
    save();
    refreshCards('map');
    pushLog('🗺️ Ciclo concluído — ' + sentTotal + ' explorador(es) enviado(s)' +
      (plan.novos ? ', ' + plan.novos + ' bárbaro(s) novo(s)' : '') +
      (comDefesa ? ', ' + comDefesa + ' com defesa detectada' : '') +
      '. Próximo em ' + Math.round(intervalo / 60000) + ' min.', 'ok', 'map');
    mapTimer = setTimeout(mapTick, intervalo);
  }
  // Fatia a espera em no máximo 60s e reagenda. Quem decide se chegou a hora é o teste no
  // topo do mapTick — assim um ciclo de 30 min sobrevive a aba estrangulada e a F5.
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
    config.map.stats = { mapped: plan.barbCount, reach: plan.totalCandidates, sent: (config.map.stats && config.map.stats.sent) || 0, left: 0 };
    refreshCards('map');
    pushLog('Filtro de pontos (' + config.map.minPoints + '–' + config.map.maxPoints + '): ' + plan.barbCount + ' bárbaros.', '', 'map');
    pushLog('Minhas aldeias: ' + plan.myV.length + (config.map.group ? ' (grupo ' + config.map.group + ')' : ' (todas)') + '.', '', 'map');
    pushLog('Candidatos a ≤ ' + config.map.maxDist + ' campos e ≥ ' + config.map.minDaysSinceScout + 'd sem scout: ' + plan.totalCandidates + '.', '', 'map');
    pushLog('Planejados neste ciclo (cota ' + config.map.maxPerVillage + '/aldeia): ' + tot + '.', tot > 0 ? 'ok' : 'err', 'map');
    // Quantas origens receberam alvo, e quais bateram no teto. Sem isto, "todos os alvos vêm da
    // mesma aldeia" fica sem explicação: pode ser geografia (só ela tem bárbaro virgem por perto)
    // ou pode ser a cota cortando. A linha abaixo separa os dois casos na hora.
    const comAlvo = plan.plan.filter((p) => p.targets.length);
    const noTeto = comAlvo.filter((p) => p.targets.length >= (config.map.maxPerVillage || 20));
    pushLog('Origens com alvo: ' + comAlvo.length + '/' + plan.myV.length +
      (noTeto.length ? ' · ' + noTeto.length + ' bateu(ram) o teto de ' + config.map.maxPerVillage + ' (havia mais alvo por perto — aumente "Máx alvos por aldeia")' : '') +
      (comAlvo.length === 1 && plan.myV.length > 1 ? ' · só uma origem: as outras não têm bárbaro dentro de ' + config.map.maxDist + ' campos que ainda não tenha sido escaneado ou já esteja com ataque a caminho' : ''),
      '', 'map');
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
    if (!list.length) { box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:8px;font-size:10px">— nenhum alvo detectado —</div>'; return; }
    const now = Date.now();
    box.innerHTML =
      '<div style="display:grid;grid-template-columns:60px 34px 44px 1fr 44px;gap:4px;padding:3px 4px;border-bottom:1px solid #e0d6c6;font-size:9px;color:#8b5426;font-weight:600"><span>alvo</span><span style="text-align:right">d</span><span style="text-align:right">pts</span><span>de</span><span style="text-align:right">últ.</span></div>' +
      list.slice(0, 200).map((t) => {
        const last = t.lastAt ? (Math.round((now - t.lastAt) / 86400000) + 'd') : 'novo';
        return '<div style="display:grid;grid-template-columns:60px 34px 44px 1fr 44px;gap:4px;padding:2px 4px;border-bottom:1px solid rgba(255,255,255,.04);font-size:10px;color:#6f6153"><span style="color:#a2643a">' + esc(t.coord) + '</span><span style="text-align:right">' + t.dist + '</span><span style="text-align:right">' + (t.pts || 0) + '</span><span style="color:#8a7d6d;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="de ' + esc(t.srcName || '') + '">' + esc(t.src) + '</span><span style="text-align:right;color:' + (t.lastAt ? '#8a7d6d' : '#2e7d3a') + '">' + last + '</span></div>';
      }).join('');
  }
  // Qual das três listas está visível. Fica em memória — é preferência de tela, não estado.
  let _mapSub = 'alvos';
  function mapMostrarSub(qual) {
    _mapSub = qual;
    const lista = document.getElementById('twmgr-bm-list'), bl = document.getElementById('twmgr-bm-bl');
    if (!lista || !bl) return;
    lista.style.display = qual === 'alvos' ? '' : 'none';
    bl.style.display = qual === 'alvos' ? 'none' : '';
    document.querySelectorAll('.twmgr-bm-sub').forEach((b) => b.classList.toggle('on', b.getAttribute('data-sub') === qual));
    if (qual !== 'alvos') renderMapBlacklist(qual);
  }

  function renderMapBlacklist(qual) {
    const box = document.getElementById('twmgr-bm-bl'); if (!box) return;
    const cfg = config.map;
    const mapa = qual === 'perda' ? (cfg.blacklistPerda || {}) : (cfg.blacklistDefesa || {});
    const chaves = Object.keys(mapa).sort((a, b) => (mapa[b].at || 0) - (mapa[a].at || 0));
    if (!chaves.length) {
      box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:14px;font-size:10px">— lista vazia —<br><br>' +
        (qual === 'perda'
          ? 'Entra aqui quem devolveu o saque em <b>vermelho</b> (você perdeu tropa). Sai sozinho quando um saque voltar verde, amarelo ou azul.'
          : 'Entra aqui quem o relatório de exploração mostrou com <b>tropa defensiva</b>. Não sai sozinho — tire na mão quando achar que mudou.') + '</div>';
      return;
    }
    const agora = Date.now();
    box.innerHTML =
      '<div style="display:grid;grid-template-columns:64px 1fr 52px 22px;gap:4px;padding:3px 5px;border-bottom:1px solid #e0d6c6;font-size:9px;color:#8b5426;font-weight:600">' +
        '<span>alvo</span><span>' + (qual === 'defesa' ? 'defesa vista' : 'motivo') + '</span><span style="text-align:right">há</span><span></span></div>' +
      chaves.map((coord) => {
        const r = mapa[coord];
        const dias = r.at ? Math.round((agora - r.at) / 86400000) : null;
        const quando = dias == null ? '—' : (dias === 0 ? 'hoje' : dias + 'd');
        const meio = qual === 'defesa'
          ? '<span style="color:#c0483a">' + (r.defTotal || '?') + ' unidades</span>' + (r.removido ? ' <span style="color:#8a7d6d">· apagado do assistente</span>' : '')
          : '<span style="color:#8a7d6d">saque voltou vermelho</span>';
        return '<div style="display:grid;grid-template-columns:64px 1fr 52px 22px;gap:4px;padding:3px 5px;border-bottom:1px solid rgba(255,255,255,.04);font-size:10px;color:#6f6153;align-items:center">' +
          '<span style="color:#a2643a">' + esc(coord) + '</span>' + meio +
          '<span style="text-align:right;color:#8a7d6d">' + quando + '</span>' +
          '<span class="twmgr-del twmgr-bm-unbl" data-coord="' + esc(coord) + '" data-lista="' + qual + '" title="tirar da blacklist">✕</span></div>';
      }).join('');
    box.querySelectorAll('.twmgr-bm-unbl').forEach((el) => el.addEventListener('click', () => {
      const c = el.getAttribute('data-coord'), l = el.getAttribute('data-lista');
      delete (l === 'perda' ? config.map.blacklistPerda : config.map.blacklistDefesa)[c];
      save(); renderMapBlacklist(l); renderMapCounts();
      pushLog('🗺️ ' + c + ' saiu da blacklist (' + (l === 'perda' ? 'tropa perdida' : 'defesa') + ') — volta a ser alvo de exploração e de saque.', '', 'map');
    }));
  }

  function renderMapCounts() {
    const cfg = config.map;
    const p = document.getElementById('twmgr-bm-nperda'); if (p) p.textContent = Object.keys(cfg.blacklistPerda || {}).length;
    const d = document.getElementById('twmgr-bm-ndefesa'); if (d) d.textContent = Object.keys(cfg.blacklistDefesa || {}).length;
    const n = document.getElementById('twmgr-bm-next');
    if (n) n.textContent = (cfg.running && cfg.nextAt > Date.now())
      ? 'próximo ciclo em ' + Math.max(0, Math.round((cfg.nextAt - Date.now()) / 60000)) + ' min'
      : (cfg.running ? 'rodando…' : 'parado');
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
    if (g('twmgr-bm-ciclo')) c.cicloMin = Math.max(5, parseInt(g('twmgr-bm-ciclo').value, 10) || 30);
    if (g('twmgr-bm-defmin')) c.defesaMin = Math.max(1, parseInt(g('twmgr-bm-defmin').value, 10) || 1);
    if (g('twmgr-bm-rmassist')) c.removerDoAssistente = !!g('twmgr-bm-rmassist').checked;
    save();
  }
  function setMapStatus(on) { setBtnState('twmgr-bm-start', 'twmgr-bm-stop', on, '● Mapeando', '▶ Iniciar'); }
  function mapStart() {
    readMapCfg();
    config.map.running = true; config.map.nextAt = 0; save();
    setMapStatus(true);
    pushLog('🗺️ Mapa ligado — ciclo a cada ' + config.map.cicloMin + ' min, raio ≤ ' + config.map.maxDist +
      ' campos por aldeia, ' + config.map.spyCount + ' explorador/alvo, reserva ' + config.map.spyReserve + '.', 'ok', 'map');
    mapTick();
  }
  function mapStop() { readMapCfg(); config.map.running = false; save(); clearTimeout(mapTimer); setMapStatus(false); renderMapCounts(); pushLog('🗺️ Mapa desligado.', '', 'map'); }
  async function mapRefreshCache() { _mapVillagesCache = null; try { const v = await getMapVillages(true); pushLog('Mapa recarregado — ' + v.length + ' aldeias no mundo (' + v.filter((x) => x.player === '0').length + ' bárbaras).', 'ok', 'map'); } catch (e) { pushLog('Mapa: recarregar falhou (' + (e.message || e) + ').', 'err', 'map'); } }

  // ==================== CADEADO (reserva automática de aldeia bárbara p/ tribo) ====================
  // Endpoint confirmado via DevTools (não chutado): GET /game.php?village=X&screen=info_village&id=Y
  // &ajaxaction=toggle_reserve_village&json=1&h=CSRF — é um TOGGLE (chamar de novo tira o cadeado).
  // Por isso o script guarda em config.lock.reserved quem ELE JÁ travou e nunca chama de novo em cima
  // — sem essa memória, rodar 2x seguidas destravaria tudo que já tinha travado.
  async function toggleReserveVillage(targetVid) {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=info_village&id=' + targetVid + '&ajaxaction=toggle_reserve_village&json=1&h=' + CSRF, { credentials: 'include' });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!j || !j.response || !j.response.code) throw new Error('resposta inesperada (' + (txt || '').slice(0, 100).replace(/\s+/g, ' ') + ')');
    return j.response;   // { code, village, type: 'add'|'remove', id }
  }
  // Cor do ÚLTIMO relatório contra essa aldeia (green/yellow/blue/red), lida do popup real de info da
  // aldeia — endpoint confirmado via DevTools (não chutado): GET .../screen=map&ajax=map_info&source=
  // <minha>&target=<alvo>. Preferido ao assistente de farm (getFarmTargets) porque o assistente NÃO
  // lista aldeias abandonadas/de baixo recurso — um caso real escapou o filtro por causa disso.
  async function getLastAttackColor(targetVid) {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=map&ajax=map_info&source=' + CUR_VID + '&target=' + targetVid, { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const cell = doc.getElementById('info_last_attack');
    if (!cell) return null;   // nunca atacamos essa aldeia -> sem relatório
    const img = cell.querySelector('img[src*="/dots/"]');
    const m = img ? (img.getAttribute('src') || '').match(/dots\/(\w+)\./) : null;
    return m ? m[1] : null;
  }
  async function lockTick() {
    clearTimeout(lockTimer);
    if (!config.lock.running) return;
    if (lockOther()) { lockTimer = setTimeout(lockTick, 5000); return; }
    if (captchaBlocked()) { lockTimer = setTimeout(lockTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.lock.nextAt || 0) > now) { scheduleLock(); return; }
    let allV, mine;
    try { allV = await getMapVillages(); }
    catch (e) { pushLog('Cadeado: erro ao ler village.txt (' + (e.message || e) + ').', 'err', 'lock'); config.lock.nextAt = now + 60000; save(); scheduleLock(); return; }
    try { mine = await getAllVillagesCached(); }
    catch (e) { pushLog('Cadeado: erro ao listar minhas aldeias (' + (e.message || e) + ').', 'err', 'lock'); config.lock.nextAt = now + 60000; save(); scheduleLock(); return; }
    const myV = [];
    mine.forEach((v) => { const cm = (v.coord || '').match(/(\d+)\|(\d+)/); if (cm) myV.push({ x: +cm[1], y: +cm[2] }); });
    if (!myV.length) { pushLog('Cadeado: nenhuma aldeia própria encontrada.', 'err', 'lock'); config.lock.nextAt = now + 300000; save(); scheduleLock(); return; }
    const maxDist = config.lock.maxDist || 10, minPts = config.lock.minPoints || 0;
    // "no raio de TODAS as suas aldeias" = distância até a MAIS PERTO das suas aldeias, não de uma só.
    const inRange = allV.filter((b) => b.player === '0' && b.points >= minPts && myV.some((s) => fieldDist(s.x, s.y, b.x, b.y) <= maxDist))
      .sort((a, b) => b.points - a.points);   // mais pontos primeiro
    config.lock.reserved = config.lock.reserved || {};
    let lockedNow = 0, restored = 0, redSkipped = 0;
    for (const b of inRange) {
      const pare = devoParar('lock');
      if (pare) { pushLog('Cadeado: interrompido — ' + pare + '. ' + lockedNow + ' travada(s) nesse ciclo até agora.', 'err', 'lock'); config.lock.nextAt = now + 30000; save(); scheduleLock(); return; }
      if (config.lock.reserved[b.vid]) continue;   // já travamos essa antes, não mexe (evita destravar)
      // Só checa relatório de quem AINDA não travamos — mantém o custo de rede proporcional só às
      // candidatas novas do ciclo, não ao raio inteiro de novo toda vez.
      let color = null;
      try { color = await getLastAttackColor(b.vid); }
      catch (e) { pushLog('Cadeado: erro ao checar relatório de ' + b.name + ' (' + (e.message || e) + ') — pulando por segurança.', 'err', 'lock'); continue; }
      if (color === 'red') { redSkipped++; await sleep(150); continue; }
      try {
        const r = await toggleReserveVillage(b.vid);
        if (r.type !== 'add') {
          // já estava travada por fora do nosso controle (manual, ou outra sessão) — desfizemos sem
          // querer; desfaz o desfazer e só então passa a rastrear.
          await sleep(300);
          await toggleReserveVillage(b.vid);
          restored++;
          pushLog('Cadeado: ' + b.name + ' (' + b.x + '|' + b.y + ') já estava travada — restaurada.', '', 'lock');
        } else {
          lockedNow++;
          pushLog('Cadeado: 🔒 ' + b.name + ' (' + b.x + '|' + b.y + ', ' + fmtN(b.points) + ' pts).', 'ok', 'lock');
        }
        config.lock.reserved[b.vid] = now;
        await sleep(400 + Math.floor(Math.random() * 300));
      } catch (e) { pushLog('Cadeado em ' + b.name + ' (' + b.x + '|' + b.y + '): ' + (e.message || e), 'err', 'lock'); }
    }
    config.lock.stats = { inRange: inRange.length, total: Object.keys(config.lock.reserved).length, lockedNow: lockedNow, redSkipped: redSkipped };
    config.lock.nextAt = now + Math.max(60, config.lock.interval || 1800) * 1000;
    save();
    refreshCards('lock');
    pushLog('Cadeado: ciclo concluído — ' + lockedNow + ' nova(s) travada(s)' + (restored ? ', ' + restored + ' restaurada(s)' : '') + ' (' + inRange.length + ' no raio, ' + Object.keys(config.lock.reserved).length + ' travadas ao todo, ' + redSkipped + ' pulada(s) por relatório vermelho). Próximo em ' + Math.round((config.lock.interval || 1800) / 60) + ' min.', 'ok', 'lock');
    scheduleLock();
  }
  function scheduleLock() { clearTimeout(lockTimer); if (!config.lock.running) return; lockTimer = setTimeout(lockTick, Math.min(Math.max((config.lock.nextAt || 0) - Date.now(), 1000), 60000)); }
  function readLockCfg() {
    const c = config.lock, g = (id) => document.getElementById(id);
    if (g('twmgr-lk-dist')) c.maxDist = Math.max(1, parseFloat((g('twmgr-lk-dist').value || '').replace(',', '.')) || 10);
    if (g('twmgr-lk-pts')) c.minPoints = Math.max(0, parseInt(g('twmgr-lk-pts').value, 10) || 0);
    if (g('twmgr-lk-int')) c.interval = Math.max(1, parseInt(g('twmgr-lk-int').value, 10) || 30) * 60;
    save();
  }
  function setLockStatus(on) { setBtnState('twmgr-lk-start', 'twmgr-lk-stop', on, '● Rastreando', '▶ Iniciar'); }
  function lockStart() {
    readLockCfg();
    config.lock.running = true; config.lock.nextAt = 0; save();
    setLockStatus(true);
    pushLog('Cadeado iniciado — raio ≤ ' + config.lock.maxDist + ' campos, ' + config.lock.minPoints + '+ pts, reciclo a cada ' + Math.round((config.lock.interval || 1800) / 60) + ' min.', 'ok', 'lock');
    lockTick();
  }
  function lockStop() { readLockCfg(); config.lock.running = false; save(); clearTimeout(lockTimer); setLockStatus(false); pushLog('Cadeado parado.', '', 'lock'); }

  // ==================== ETIQUETA (auto-rotular ataques recebidos) ====================
  // Modulo do johan. O TW ja tem o recurso: na tela de ataques recebidos, selecionar os
  // comandos e clicar "Etiqueta" faz o SERVIDOR adivinhar a unidade mais lenta pelo tempo
  // de viagem restante, assumindo que o comando acabou de sair. Quanto mais cedo depois do
  // envio, mais precisa a adivinhacao — dai o ciclo curto (padrao 2 min).
  //
  // Duas mudancas minhas sobre a versao dele, e as duas por medicao do formulario real
  // (capturado na tela, nao deduzido):
  //   subtype=attacks em vez de all — 'all' traz apoio junto, e etiquetar apoio recebido
  //   nao faz sentido. E o campo id_<id>=on que ele mandava nao existe no formulario.
  const ETIQUETA_MAX_IDS = 400;   // teto de seguranca pro corpo do POST

  // Le a lista e devolve, por id de comando, o ROTULO — o texto de .quickedit-label, que e
  // exatamente o que a etiqueta muda ("Ataque" vira "Explorador", "Nobre", "Ariete"...).
  //
  // A versao anterior comparava o texto da LINHA INTEIRA, e a linha tem a coluna "Chega
  // em" com uma contagem regressiva que muda a cada segundo. Antes !== depois era SEMPRE
  // verdadeiro, entao a validacao "por efeito" que eu escrevi pra nao me deixar errar
  // aprovava qualquer coisa — inclusive um POST que nao etiquetou nada.
  function etiquetaLerLista(doc) {
    const out = {};
    const table = doc.getElementById('incomings_table');
    if (!table) return null;
    table.querySelectorAll('input[type="hidden"][name^="command_ids["]').forEach((inp) => {
      const m = (inp.getAttribute('name') || '').match(/command_ids\[(\d+)\]/);
      if (!m) return;
      const td = inp.closest('td');
      const lbl = td ? td.querySelector('.quickedit-label') : null;
      out[m[1]] = lbl ? (lbl.textContent || '').replace(/\s+/g, ' ').trim() : '';
    });
    return out;
  }

  async function etiquetaCheckAndLabel() {
    const vid = CUR_VID;
    const base = '/game.php?village=' + vid + '&screen=overview_villages&mode=incomings&type=unignored&subtype=attacks';
    const res = await fetch(base + '&page=-1', { credentials: 'include', cache: 'no-store' });
    if (res.status === 429) throw new Error('429');
    if (!res.ok) throw new Error('lista de recebidos: HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const antes = etiquetaLerLista(doc);
    if (!antes) return { total: 0, novos: 0 };
    const ids = Object.keys(antes);
    config.etiqueta.lastCount = ids.length;
    // SO OS QUE AINDA NAO FORAM. A versao original reenviava a lista inteira a cada ciclo:
    // com 50 ataques a caminho, eram 30 POSTs grandes por hora sem efeito nenhum, e
    // justamente quando voce esta sob ataque — a pior hora pra gastar requisicao.
    const ja = config.etiqueta.jaEnviados || (config.etiqueta.jaEnviados = {});
    const novos = ids.filter((id) => !ja[id]).slice(0, ETIQUETA_MAX_IDS);
    // Faxina: comando que saiu da lista (chegou ou foi cancelado) nao precisa ser lembrado.
    const vivos = {}; ids.forEach((id) => { vivos[id] = 1; });
    Object.keys(ja).forEach((id) => { if (!vivos[id]) delete ja[id]; });
    if (!novos.length) { save(); return { total: ids.length, novos: 0 }; }
    // DOIS CAMPOS POR COMANDO, com papeis diferentes — confirmado varrendo o formulario
    // real sem filtro de nome:
    //     <input name="command_ids[421095069]" type="hidden"   value="true">
    //     <input name="id_421095069"           type="checkbox" value="on">
    // O oculto DECLARA que o comando esta na lista; a caixinha e o que o marca como
    // SELECIONADO. Eu tinha removido a caixinha achando que ela nao existia — minha
    // consulta so procurava por command_ids — e o servidor passou a receber "estes
    // comandos existem" com nenhum escolhido. Aceitava sem reclamar e nao etiquetava nada.
    const body = new URLSearchParams();
    body.set('h', CSRF);
    novos.forEach((id) => {
      body.append('command_ids[' + id + ']', 'true');
      body.append('id_' + id, 'on');
    });
    body.set('label', 'Etiqueta');
    const r2 = await fetch(base.replace('&type=', '&action=process&type='), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString(),
    });
    // CONFERE A RESPOSTA. Na versao original o resultado era descartado: se o formulario
    // do jogo mudasse, ele rodaria pra sempre sem etiquetar e o log diria que deu certo.
    if (r2.status === 429) throw new Error('429');
    if (!r2.ok) throw new Error('etiquetar: HTTP ' + r2.status);
    const t2 = await r2.text();
    const d2 = new DOMParser().parseFromString(t2, 'text/html');
    const eb = d2.querySelector('.error_box');
    if (eb) throw new Error('o jogo recusou: ' + (eb.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80));

    // VALIDACAO POR EFEITO, nao por aparencia.
    //
    // A versao anterior conferia se a resposta ainda tinha a tabela de recebidos. Isso
    // passa mesmo quando o servidor recebe o POST e NAO FAZ NADA — foi exatamente o que
    // aconteceu: o log dizia "1 comando etiquetado" e nada tinha sido etiquetado.
    // Agora compara o TEXTO das linhas antes e depois. Etiqueta aplicada muda o nome do
    // comando; se nenhum dos que eu mandei mudou, eu nao etiquetei — e digo isso.
    const depois = etiquetaLerLista(d2) || {};
    const mudaram = novos.filter((id) => depois[id] !== undefined && depois[id] !== antes[id]);
    const sumiram = novos.filter((id) => depois[id] === undefined);
    if (!mudaram.length && !sumiram.length) {
      throw new Error('o servidor aceitou mas nada mudou — nenhum dos ' + novos.length +
                      ' comando(s) foi etiquetado. O formulario do jogo pode ter mudado.');
    }
    novos.forEach((id) => { ja[id] = 1; });
    save();
    return { total: ids.length, novos: mudaram.length + sumiram.length };
  }

  async function etiquetaTick() {
    clearTimeout(etiquetaTimer);
    if (!config.etiqueta.running) return;
    if (lockOther() || captchaBlocked()) { etiquetaTimer = setTimeout(etiquetaTick, 15000); return; }
    claimLock();
    const cfg = config.etiqueta;
    // 429 = o servidor pediu pra desacelerar. Insistir no mesmo intervalo e o pior que se
    // pode fazer: piora o limite e nao etiqueta nada. Espera o recuo passar.
    if (cfg.recuoAte && Date.now() < cfg.recuoAte) {
      etiquetaTimer = setTimeout(etiquetaTick, Math.min(cfg.recuoAte - Date.now() + 500, 60000));
      return;
    }
    let espera = Math.max(2, cfg.intervalMin || 2) * 60000;
    try {
      const r = await etiquetaCheckAndLabel();
      if (cfg.recuoMs) { cfg.recuoMs = 0; cfg.recuoAte = 0; save(); }   // voltou a passar
      refreshCards('etiqueta');
      if (r.novos) pushLog('🏷️ Etiqueta: ' + r.novos + ' comando(s) novo(s) etiquetado(s) (' + r.total + ' na lista).', 'ok', 'etiqueta');
    } catch (e) {
      if (String(e.message || e) === '429') {
        // Dobra o recuo a cada recusa, ate 30 min. Volta ao normal no primeiro sucesso.
        cfg.recuoMs = Math.min(Math.max(cfg.recuoMs * 2, 5 * 60000), 30 * 60000);
        cfg.recuoAte = Date.now() + cfg.recuoMs;
        espera = cfg.recuoMs;
        save();
        pushLog('🏷️ Etiqueta: o servidor pediu pra desacelerar (429). Recuando ' + Math.round(cfg.recuoMs / 60000) +
                ' min. Se isso repetir, o gargalo pode nao ser este modulo — Mapa e Saque tambem leem overview_villages com page=-1.', '', 'etiqueta');
      } else {
        pushLog('🏷️ Etiqueta: ' + (e.message || e), 'err', 'etiqueta');
      }
    }
    etiquetaTimer = setTimeout(etiquetaTick, espera);
  }

  function readEtiquetaCfg() {
    const el = document.getElementById('twmgr-et-interval');
    if (el) config.etiqueta.intervalMin = Math.max(2, parseInt(el.value, 10) || 3);
    save();
  }
  function setEtiquetaStatus(on) { setBtnState('twmgr-et-start', 'twmgr-et-stop', on, '● Ativo', '▶ Iniciar ciclo'); }
  function etiquetaStart() {
    readEtiquetaCfg();
    config.etiqueta.running = true; save();
    setEtiquetaStatus(true);
    pushLog('🏷️ Etiqueta: ciclo iniciado — check a cada ' + config.etiqueta.intervalMin + ' min.', 'ok', 'etiqueta');
    etiquetaTick();
  }
  function etiquetaStop() {
    readEtiquetaCfg();
    config.etiqueta.running = false; save();
    clearTimeout(etiquetaTimer);
    setEtiquetaStatus(false);
    pushLog('🏷️ Etiqueta: ciclo parado.', '', 'etiqueta');
  }

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
  // Elemento realmente na tela? (tamanho > 0 e não escondido por CSS)
  function _elVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    const st = window.getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden';
  }
  // Título "Proteção contra Bots" — regex tolerante a acento/caixa/espaço (mesma ideia do scanForBotCheck).
  function _hasBotTitle(root) {
    if (!root) return false;
    for (const h of root.querySelectorAll('h2, h3')) {
      if (/prote..o contra bots?/i.test((h.textContent || '').trim())) return true;
    }
    return false;
  }
  // Detecção ESTRUTURAL do bot-check: 3 formatos que o TW usa, cada um exigindo o conjunto completo
  // (container + elemento interno + título visíveis). Bem mais difícil de dar falso-positivo do que
  // casar um seletor solto — a lib do hcaptcha vem pré-carregada em página normal.
  function isBotCheckBlock() {
    // Formato 1: #bot_protection com #botCheckFunc e #fader
    const bp = document.querySelector('#bot_protection');
    if (bp && _elVisible(bp) && _elVisible(bp.querySelector('#botCheckFunc'))
        && _elVisible(document.querySelector('#fader')) && _hasBotTitle(bp)) return 'bot_protection';
    // Formato 2: .bot-protection-row + .bot-protection-blur
    const row = document.querySelector('.bot-protection-row');
    const blur = document.querySelector('.bot-protection-blur');
    if (_elVisible(row) && _elVisible(blur) && _hasBotTitle(row)) return 'bot-protection-row';
    // Formato 3: popup com iframe do hcaptcha dentro
    for (const pop of document.querySelectorAll('.popup_box_content')) {
      if (_elVisible(pop) && _hasBotTitle(pop) && pop.querySelector('.captcha iframe[src*="hcaptcha.com"], iframe[src*="hcaptcha.com"]')) return 'bot-popup';
    }
    return null;
  }
  function isCaptchaVisible() {
    const structural = isBotCheckBlock();
    if (structural) return structural;
    for (const s of CAPTCHA_SELECTORS) {
      const el = document.querySelector(s);
      if (!el) continue;
      if (_elVisible(el)) return s;
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
  // ---- ALARME GERAL ----
  // Quem detectar o bloqueio liga a flag; TODOS os módulos consultam captchaBlocked() antes de rodar
  // o ciclo. Assim o Manager para inteiro em vez de cada aba/módulo bater na parede e acumular erro.
  let _captchaBlocked = false;
  function captchaBlocked() { return _captchaBlocked; }
  function detectCaptcha() {
    let hit = isCaptchaVisible();
    // "Proteção contra Bots" é uma PÁGINA de texto (sem elementos hcaptcha). Escaneia o texto VISÍVEL
    // (innerText — NÃO textContent, que inclui <script> e dava falso-positivo com a lib hcaptcha).
    if (!hit) { try { const m = scanForBotCheck((document.body && document.body.innerText) || ''); if (m) hit = 'dom:' + m; } catch (e) {} }
    if (hit && !_captchaBlocked) { _captchaBlocked = true; pushLog('⛔ Bot-check na tela [' + hit + '] — módulos pausados até resolver.', 'err'); }
    else if (!hit && _captchaBlocked) { _captchaBlocked = false; pushLog('✔ Bot-check resolvido — módulos liberados.', 'ok'); }
    return hit;
  }
  let _captchaCheckLast = 0;
  function checkCaptchaOnce() {
    const now = Date.now();
    if (now - _captchaCheckLast < 1000) return;   // debounce
    _captchaCheckLast = now;
    const hit = detectCaptcha();   // sempre roda: a pausa não depende do alerta estar ligado
    if (!config.captcha || !config.captcha.enabled) return;
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

  // ---- Detecção do bot-check (só pelo DOM da página renderizada) ----
  function scanForBotCheck(text) {
    const hay = (text || '').toLowerCase();
    // APENAS frases VISÍVEIS da tela de verificação. NÃO usar identificadores como "hcaptcha"/"bot_check"/
    // "sitekey" — eles aparecem em scripts/HTML de páginas NORMAIS (a lib hcaptcha vem pré-carregada) e
    // davam falso-positivo. Chamar sempre com innerText (texto renderizado, sem <script>).
    if (/prote..o contra bots?|iniciar a verifica..o da prote..o|verifica..o da prote..o do bot|bot protection required/.test(hay)) return 'bot-page';
    return null;
  }
  function installBotHooks() {
    // Detecção do bot-check é 100% pelo watcher de DOM (texto visível + widget hcaptcha visível). NÃO
    // grampeamos fetch/XHR: o bot-check do br143 não é servido a requisições, e ler HTML cru dava
    // falso-positivo com a lib hcaptcha pré-carregada. Aqui fica só o helper de teste manual.
    try { window.__twSimBotCheck = function () { fireCaptchaNotification('teste-sim', true); return 'disparado'; }; } catch (e) {}
  }
  // Auto-F5 quando AFK: o bot-check do br143 só se revela num carregamento de página (F5). Então, se
  // você ficou sem mexer no mouse/teclado por X min, o script recarrega a página — aí a tela "Proteção
  // contra Bots" aparece e o watcher de DOM dispara o ntfy. NÃO recarrega se você está ativo, se outra
  // aba está no comando, ou se o bot-check já está na tela (deixa você resolver).
  let _reloadTimer = null, _lastActivity = Date.now();
  function _markActivity() { _lastActivity = Date.now(); }
  function maybeAutoReload() {
    try {
      const min = (config.captcha && config.captcha.reloadMin) || 0;
      if (!min || min < 1 || lockOther()) return;
      if (isCaptchaVisible() || scanForBotCheck((document.body && document.body.innerText) || '')) { checkCaptchaOnce(); return; }   // já tem bot-check: não recarrega
      if (Date.now() - _lastActivity < min * 60000) return;   // você está ativo -> não atrapalha
      // Não recarrega em cima de um desvio prestes a sair: o reload mata o timer e a retomada
      // levaria segundos que a tropa não tem. Adia pro próximo ciclo. (Ideia do Nexus, que usa uma
      // janela de segurança de 60s antes de qualquer auto-reload.)
      if (desviarSaidaProxima(60000)) { pushLog('Auto-F5 adiado: tem desvio saindo em menos de 1 min.', '', 'desv'); return; }
      // Mesma razão pra Central: recarregar no meio da escada de espera mata o timer, e
      // a retomada custa segundos que um trem de nobre não tem.
      if (ccJanelaCritica(60000)) { pushLog('Auto-F5 adiado: a Central tem disparo em menos de 1 min.', '', 'planner'); return; }
      location.reload();
    } catch (e) {}
  }
  function startAutoReload() {
    clearInterval(_reloadTimer);
    const min = (config.captcha && config.captcha.reloadMin) || 0;
    if (!min || min < 1) return;
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach((ev) => { try { window.addEventListener(ev, _markActivity, { passive: true }); } catch (e) {} });
    _reloadTimer = setInterval(maybeAutoReload, Math.max(60, min * 60) * 1000);
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
    const g = document.getElementById('twmgr-global'); if (g) { g.textContent = !config.running ? '' : (lockOther() ? '⏸ inativa (outra aba está enviando)' : '● rodando'); g.style.color = lockOther() ? '#c0483a' : '#2e7d3a'; }
    const sc = document.getElementById('twmgr-scav-status'); if (sc) { if (!config.scav.running) { sc.textContent = ''; } else if (lockOther()) { sc.textContent = '⏸ outra aba está ativa'; sc.style.color = '#c0483a'; } else { sc.style.color = '#2e7d3a'; sc.textContent = (config.scav.nextAt || 0) > now ? '● próx. verificação: ' + fmt(config.scav.nextAt - now) : '● verificando…'; } }
    const fs = document.getElementById('twmgr-farm-status'); if (fs) { if (!config.farm.running) { fs.textContent = ''; } else if (lockOther()) { fs.textContent = '⏸ outra aba está ativa'; fs.style.color = '#c0483a'; } else { fs.style.color = '#2e7d3a'; fs.textContent = (config.farm.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.farm.nextAt - now) : '● saqueando…'; } }
    const ws = document.getElementById('twmgr-wall-status'); if (ws) { if (!config.wall.running) { ws.textContent = ''; } else if (lockOther()) { ws.textContent = '⏸ outra aba está ativa'; ws.style.color = '#c0483a'; } else { ws.style.color = '#2e7d3a'; ws.textContent = (config.wall.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.wall.nextAt - now) : '● quebrando…'; } }
    const rs = document.getElementById('twmgr-recruit-status'); if (rs) { if (!config.recruit.running) { rs.textContent = ''; } else if (lockOther()) { rs.textContent = '⏸ outra aba está ativa'; rs.style.color = '#c0483a'; } else { rs.style.color = '#2e7d3a'; rs.textContent = (config.recruit.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.recruit.nextAt - now) : '● recrutando…'; } }
    const clk = document.getElementById('twmgr-srvclock'); if (clk) { try { clk.textContent = new Date(serverNow() - wallToServerOffset()).toLocaleTimeString(); } catch (e) {} }
    MARKET_MODES.forEach((mkKey) => {
      const mk = document.getElementById('twmgr-mk-' + mkKey + '-status'); if (!mk) return;
      const st = config.market.modes[mkKey];
      if (!st.running) { mk.textContent = ''; }
      else if (lockOther()) { mk.textContent = '⏸ outra aba'; mk.style.color = '#c0483a'; }
      else { mk.style.color = '#2e7d3a'; mk.textContent = (st.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(st.nextAt - now) : '● enviando…'; }
    });
    const bl = document.getElementById('twmgr-bld-status'); if (bl) {
      if (!config.build.running) { bl.textContent = ''; }
      else if (lockOther()) { bl.textContent = '⏸ outra aba'; bl.style.color = '#c0483a'; }
      else { bl.style.color = '#2e7d3a'; bl.textContent = (config.build.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.build.nextAt - now) : '● construindo…'; }
    }
    const pq = document.getElementById('twmgr-pq-status'); if (pq) {
      if (!config.research || !config.research.running) { pq.textContent = ''; }
      else if (lockOther()) { pq.textContent = '⏸ outra aba'; pq.style.color = '#c0483a'; }
      else { pq.style.color = '#2e7d3a'; pq.textContent = (config.research.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.research.nextAt - now) : '● pesquisando…'; }
    }
    if (document.getElementById('twmgr-cards-research')) refreshCards('research');
    const bm = document.getElementById('twmgr-bm-status'); if (bm) {
      if (!config.map || !config.map.running) { bm.textContent = ''; }
      else if (lockOther()) { bm.textContent = '⏸ outra aba'; bm.style.color = '#c0483a'; }
      else { bm.style.color = '#2e7d3a'; bm.textContent = (config.map.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.map.nextAt - now) : '● rastreando…'; }
    }
    const plClk = document.getElementById('twmgr-pl-srvclock'); if (plClk) { try { plClk.textContent = new Date(serverNow() - wallToServerOffset()).toLocaleTimeString(); } catch (e) {} }
    const pls = document.getElementById('twmgr-pl-status');
    if (pls) {
      const plAtk = config.planner && plActive();
      if (!plAtk || !plAtk.running) { pls.textContent = ''; }
      else if (lockOther()) { pls.textContent = '⏸ outra aba'; pls.style.color = '#c0483a'; }
      else {
        const rr = (plAtk.rows || []);
        const pend = rr.filter((r) => r.state === 'armed' || r.state === 'scheduled').length;
        const sent = rr.filter((r) => r.state === 'sent').length;
        const err = rr.filter((r) => r.state === 'error').length;
        const nx = rr.filter((r) => r.sendAt && (r.state === 'scheduled' || r.state === 'armed')).sort((a, b) => a.sendAt - b.sendAt)[0];
        pls.style.color = '#2e7d3a';
        pls.textContent = '● ' + sent + ' env · ' + pend + ' pend' + (err ? (' · ' + err + ' erro') : '') + (nx ? (' · próx ' + fmt(nx.sendAt - serverNow())) : '');
      }
    }
    if (document.getElementById('twmgr-cards-planner')) refreshCards('planner');
    if (document.getElementById('twmgr-pl-queue')) { try { renderPlannerQueue(plActive()); } catch (e) {} }
    const pds = document.getElementById('twmgr-pd-status');
    if (pds) {
      if (!config.paladin.running) { pds.textContent = ''; }
      else if (lockOther()) { pds.textContent = '⏸ outra aba'; pds.style.color = '#c0483a'; }
      else { pds.style.color = '#2e7d3a'; pds.textContent = '● ' + Object.keys(config.paladin.villages || {}).filter((v) => config.paladin.villages[v]).length + ' aldeia(s) no ciclo'; }
    }
    if (document.getElementById('twmgr-pd-status-list')) renderPaladinStatus();
    // Atualiza só o indicador (●) de cada aba de ataque, sem reconstruir a lista (evita "roubar" cliques).
    document.querySelectorAll('.twmgr-pl-tab').forEach((el) => {
      const atk = (config.planner.attacks || []).find((a) => a.id === el.getAttribute('data-id'));
      const dot = el.querySelector('.twmgr-pl-tab-dot');
      if (dot) dot.style.display = (atk && atk.running) ? 'inline' : 'none';
    });
    const ring = (id, on) => { const b = document.getElementById(id); if (b) b.classList.toggle('twmgr-run', !!on && !lockOther()); };
    // Muralha e Mapa viraram sub-abas do Saque (v11.16.0): o indicador de atividade vai pro botão da
    // SUB-aba, e a aba Saque acende se qualquer um dos três estiver rodando — senão dá pra ter
    // Muralha ativa com a barra principal apagada e ninguém percebe.
    const mapaAtivo = !!((config.map && config.map.running) || (config.lock && config.lock.running));
    const muroAtivo = !!(config.wall && config.wall.running);
    ring('twmgr-sbtab-farm', config.farm.running);
    ring('twmgr-sbtab-wall', muroAtivo);
    ring('twmgr-sbtab-map', mapaAtivo);
    ring('twmgr-btab-scav', config.scav.running);
    ring('twmgr-btab-farm', config.farm.running || muroAtivo || mapaAtivo);
    ring('twmgr-btab-recruit', config.recruit.running);
    ring('twmgr-btab-market', anyMarketRunning());
    ring('twmgr-btab-build', config.build.running);
    ring('twmgr-btab-research', config.research && config.research.running);
    ring('twmgr-btab-planner', config.planner && config.planner.attacks && config.planner.attacks.some((a) => a.running));
    ring('twmgr-btab-paladin', config.paladin && config.paladin.running);
    ring('twmgr-btab-obra', config.obra && config.obra.running);
    ring('twmgr-btab-etiqueta', config.etiqueta && config.etiqueta.running);
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
  function readScavUnlockCfg() {
    const c = config.scav, g = (id) => document.getElementById(id);
    if (g('twmgr-scav-unlock')) c.autoUnlock = !!g('twmgr-scav-unlock').checked;
    if (g('twmgr-scav-unlock-ate')) c.unlockAte = Math.max(1, Math.min(4, parseInt(g('twmgr-scav-unlock-ate').value, 10) || 4));
    if (g('twmgr-scav-unlock-puxar')) c.unlockPuxar = !!g('twmgr-scav-unlock-puxar').checked;
    if (g('twmgr-scav-unlock-res')) c.unlockReserva = Math.max(0, parseInt(g('twmgr-scav-unlock-res').value, 10) || 0);
    if (g('twmgr-scav-unlock-org')) c.unlockMaxOrigens = Math.max(1, Math.min(20, parseInt(g('twmgr-scav-unlock-org').value, 10) || 5));
    save();
  }

  // Quem está travado por falta de recurso, e quanto falta. Sem isto o usuário não teria
  // como saber por que uma aldeia não abriu a coleta — ficaria parecendo que não funciona.
  function renderScavFalta() {
    const box = document.getElementById('twmgr-scav-falta'); if (!box) return;
    const f = config.scav.faltouRecurso || {};
    const ks = Object.keys(f);
    if (!ks.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="twmgr-sec-h" style="margin:0 0 4px">Travadas por falta de recurso (' + ks.length + ')</div>' +
      ks.slice(0, 12).map((vid) => {
        const r = f[vid];
        const falta = RES3.filter((k) => r.falta[k]).map((k) => fmtN(r.falta[k]) + ' ' + ({ wood: 'mad', stone: 'arg', iron: 'fer' })[k]).join(' · ');
        return '<div style="font-size:10px;color:#6f6153;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04)">' +
          '<span style="color:#a2643a">' + esc(r.nome) + '</span> <span style="color:#8a7d6d">' + esc(r.opcao) + '</span> — <span style="color:#a8564a">' + falta + '</span></div>';
      }).join('') + (ks.length > 12 ? '<div style="font-size:9px;color:#8a7d6d;padding:2px 0">…e mais ' + (ks.length - 12) + '</div>' : '');
  }

  function readScavUnits() {
    config.scav.units = config.scav.units || {};
    SCAV_UNITS.forEach(([u]) => { const el = document.getElementById('twmgr-su-' + u); if (el) config.scav.units[u] = el.checked; });
    const mh = document.getElementById('twmgr-scav-maxh');
    if (mh) config.scav.maxHours = Math.max(0, parseFloat((mh.value || '').replace(',', '.')) || 0);
    save();
  }
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
  function farmStart() { readFarmCfg(); config.farm.running = true; config.farm.nextAt = 0; save(); setFarmStatus(true); setFarmProg('Lendo o assistente…'); pushLog('Saque iniciado — modo ' + config.farm.mode + ', ordem por ' + config.farm.order + (config.farm.dynTemplate ? ', template dinâmico' : '') + '.', 'ok', 'farm'); farmTick(); }
  function farmStop() { readFarmCfg(); config.farm.running = false; save(); clearTimeout(farmTimer); setFarmStatus(false); setFarmProg('Saque parado.'); pushLog('Saque parado.', '', 'farm'); }
  function setFarmStatus(on) { setBtnState('twmgr-farm-start', 'twmgr-farm-stop', on, '● Saqueando', '▶ Saquear'); }
  // Barra de progresso do ciclo DENTRO da aba Saque (substituiu a linha viva no log, que empurrava
  // as outras mensagens e só cabia em texto). Aqui dá pra desenhar barra de verdade.
  function setFarmProg(html) { const el = document.getElementById('twmgr-farm-prog'); if (el) el.innerHTML = html; }
  function farmProgHTML(done, total, right) {
    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round(done / total * 100))) : 0;
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<div style="flex:1;height:9px;background:rgba(255,255,255,.09);border-radius:5px;overflow:hidden">' +
        '<div style="width:' + pct + '%;height:100%;background:#2e7d3a;transition:width .25s"></div></div>' +
      '<span style="white-space:nowrap;font-variant-numeric:tabular-nums">' + done + '/' + total + '</span></div>' +
      (right ? ('<div style="margin-top:3px;opacity:.85">' + right + '</div>') : '');
  }
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
      "#twmgr-panel{position:fixed;top:12px;right:12px;z-index:99999;width:640px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);display:flex;flex-direction:column;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#463b30;background:linear-gradient(160deg,#fdfaf5,#fffdfa);border:1px solid #e6d9c2;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.6);overflow:hidden}",
      "#twmgr-panel *{box-sizing:border-box}",
      "#twmgr-grip{position:absolute;left:0;top:0;bottom:0;width:7px;cursor:ew-resize;z-index:6}",
      "#twmgr-grip:hover{background:linear-gradient(90deg,rgba(122,87,16,.45),transparent)}",
      "#twmgr-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;cursor:move;background:#fbf6ee;color:#7a5a32;border-bottom:1px solid #e8d9bf}",
      "#twmgr-head .twmgr-title{font-weight:700;font-size:12px;letter-spacing:.3px;display:flex;align-items:center;gap:6px}",
      "#twmgr-head .twmgr-ver{font-weight:400;font-size:8px;opacity:.75}",
      "#twmgr-head-actions{flex:0 0 auto;display:flex;align-items:center;gap:7px}",
      "#twmgr-min{cursor:pointer;font-size:17px;line-height:1;padding:0 2px;opacity:.85}#twmgr-min:hover{opacity:1}",
      "#twmgr-logbtn,#twmgr-upd-btn{cursor:pointer;font-size:13px;line-height:1;padding:2px 3px;border-radius:5px;opacity:.85;position:relative;transition:.15s}",
      "#twmgr-logbtn:hover,#twmgr-upd-btn:hover{opacity:1;background:rgba(255,255,255,.14)}",
      "#twmgr-upd-badge{position:absolute;top:-3px;right:-2px;color:#c0483a;font-size:9px}",
      ".twmgr-tabs{flex:0 0 auto;display:flex;flex-wrap:nowrap;overflow-x:auto;background:#f6f1e8;border-bottom:1px solid #ece4d8;scrollbar-width:thin}",
      ".twmgr-tab{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:5px 1px;cursor:pointer;color:#8a7d6d;border-bottom:2px solid transparent;transition:.15s}",
      ".twmgr-tab:hover{color:#8b5426;background:rgba(162,100,58,.06)}",
      ".twmgr-tab.active{color:#8b5426;border-bottom-color:#a2643a;background:#ffffff}",
      ".twmgr-tab-ico{font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;border:2px solid transparent;transition:.2s}",
      ".twmgr-tab-lbl{font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}",
      ".twmgr-tab.twmgr-run .twmgr-tab-ico{border-color:#3f8f52;background:rgba(63,206,84,.15);box-shadow:0 0 9px rgba(63,206,84,.6)}",
      ".twmgr-ui{width:18px;height:18px;vertical-align:middle}",
      ".twmgr-fmtable{width:100%;border-collapse:collapse;font-size:11px}",
      ".twmgr-fmtable th{font-size:10px;color:#a2643a !important;font-weight:700;padding:4px 2px;border-bottom:1px solid #e0d6c6;text-transform:uppercase;vertical-align:middle;background:#f6f1e8 !important;background-image:none !important}",
      ".twmgr-fmtable td{vertical-align:middle}",
      ".twmgr-fmtable th:first-child,.twmgr-fmrow td:first-child{text-align:left}",
      ".twmgr-fmtable th:not(:first-child),.twmgr-fmrow td:not(:first-child){width:44px;text-align:center}",
      ".twmgr-fmrow{border-bottom:1px solid rgba(255,255,255,.04)}",
      ".twmgr-fmrow:hover{background:rgba(162,100,58,.06)}",
      ".twmgr-fmck{width:15px;height:15px;cursor:pointer;vertical-align:middle;margin:0}",
      // Tela de edicao sobreposta ao painel. `inset:0` cobre tudo, inclusive a barra de abas.
      ".twmgr-tela{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;background:linear-gradient(160deg,#fdfaf5,#fffdfa);border-radius:12px;overflow:hidden}",
      ".twmgr-tela-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;background:#fbf6ee;color:#7a5a32;font-weight:700;font-size:12px;border-bottom:1px solid #e8d9bf}",
      ".twmgr-tela-x{cursor:pointer;color:#a2643a;font-size:15px;line-height:1;opacity:.85;padding:0 2px}",
      ".twmgr-tela-x:hover{opacity:1}",
      ".twmgr-tela-body{flex:1 1 auto;overflow-y:auto;padding:10px 12px}",
      ".twmgr-tela-body::-webkit-scrollbar{width:9px}.twmgr-tela-body::-webkit-scrollbar-thumb{background:#e0d6c6;border-radius:4px}",
      ".twmgr-link-tela{cursor:pointer;color:#a2643a;font-size:10px;font-weight:600;text-decoration:none}",
      ".twmgr-link-tela:hover{text-decoration:underline}",
      ".twmgr-subtabs{display:flex;gap:5px;margin-bottom:9px}",
      ".twmgr-subtab{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 4px;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;border:1px solid #ece4d8;border-radius:8px;background:rgba(0,0,0,.05);color:#8a7d6d;transition:.15s;position:relative}",
      ".twmgr-subtab:hover{background:rgba(0,0,0,.10);color:#463b30}",
      ".twmgr-subtab.active{background:#fff;border-color:#a2643a;color:#8b5426;box-shadow:inset 0 -2px 0 #a2643a}",
      ".twmgr-subtab.twmgr-run::after{content:'';position:absolute;top:3px;right:4px;width:6px;height:6px;border-radius:50%;background:#3f8f52;box-shadow:0 0 0 2px rgba(46,139,63,.25)}",
      ".twmgr-card-break{flex-basis:100%;height:0}",
      ".twmgr-cards{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}",
      ".twmgr-card-mini{flex:1 1 0;min-width:66px;background:linear-gradient(165deg,#f6f1e8,#fffdfa);border:1px solid #e0d6c6;border-radius:9px;padding:7px 6px 6px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.35)}",
      // O card de destaque de cada módulo: antes era um ciano inline (#a2643a) que não é da paleta
      // pergaminho e brigava com o resto. Agora é o mesmo dourado, só mais escuro e com a moldura
      // marcada — destaca pela hierarquia, não por trocar de cor.
      ".twmgr-card-hl{background:linear-gradient(165deg,#fdf3e6,#fffaf3);border-color:#a2643a;box-shadow:inset 0 0 0 1px rgba(154,111,14,.18)}",
      ".twmgr-card-hl .twmgr-card-v{color:#a2643a;font-size:21px}",
      ".twmgr-card-hl .twmgr-card-l{color:#6f6153}",      // flex-basis:100% sozinho NÃO forçava linha inteira: o .twmgr-card-mini tem flex:1 1 0, e o
      // shrink:1 deixava o card encolher pra caber ao lado dos outros em vez de quebrar a linha.
      // Com shrink:0 ele ocupa a linha de verdade. Estava silenciosamente sem efeito em Coletas e Cadeado.
      ".twmgr-card-wide{flex-basis:100%;flex-shrink:0}",
      ".twmgr-card-v{font-size:19px;font-weight:800;color:#a2643a;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".twmgr-card-l{font-size:8px;color:#8a7d6d;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".twmgr-section{border:1px solid #ece4d8;border-radius:9px;padding:8px 9px;margin-bottom:9px;background:rgba(0,0,0,.14)}",
      ".twmgr-sec-h{font-size:9px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#8b5426;margin:-2px 0 6px}",
      ".twmgr-modlog{margin-top:10px;border-top:1px solid #ece4d8;padding-top:6px}",
      ".twmgr-modlog-head{cursor:pointer;font-size:10px;color:#6f6153;user-select:none;display:flex;align-items:center;gap:5px}",
      ".twmgr-modlog-head:hover{color:#8b5426}",
      ".twmgr-modlog-body{max-height:180px;overflow-y:auto;margin-top:5px;font-size:10px}",
      ".twmgr-btn.on{box-shadow:0 0 12px rgba(76,200,90,.85),inset 0 0 0 1px rgba(255,255,255,.3)}",
      ".twmgr-btn.dim{opacity:.4 !important;filter:grayscale(.5);cursor:default}",
      "#twmgr-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:11px 12px 12px}",
      "#twmgr-body::-webkit-scrollbar{width:9px}#twmgr-body::-webkit-scrollbar-thumb{background:#e0d6c6;border-radius:4px}#twmgr-body::-webkit-scrollbar-track{background:#f6f1e8}",
      ".twmgr-hint{font-size:10px;color:#6f6153;line-height:1.4;margin-bottom:9px}.twmgr-hint b{color:#8b5426}",
      ".twmgr-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}",
      ".twmgr-lbl{font-size:10px;color:#6f6153}",
      ".twmgr-inp{background:#ffffff !important;border:1px solid #ddd2c0 !important;color:#463b30 !important;border-radius:7px !important;padding:5px 7px !important;font-size:11px !important;outline:none !important;transition:.15s}",
      ".twmgr-inp:focus{border-color:#a2643a !important;box-shadow:0 0 0 2px rgba(162,100,58,.25) !important}",
      "#twmgr-panel input[type=checkbox]{accent-color:#a2643a;width:15px;height:15px;cursor:pointer;vertical-align:middle}",
      ".twmgr-btn{border:none;border-radius:8px;padding:7px 10px;font-size:11px;font-weight:600;cursor:pointer;transition:.15s;color:#fff}",
      ".twmgr-btn:hover{filter:brightness(1.12)}.twmgr-btn:active{transform:translateY(1px)}",
      ".twmgr-go{background:linear-gradient(180deg,#6aa877,#4c8f5e) !important;color:#fff !important}",
      ".twmgr-stop{background:linear-gradient(180deg,#bd6a5e,#a8564a) !important;color:#fff !important}",
      ".twmgr-ghost{background:#ffffff !important;border:1px solid #ddd2c0 !important;color:#6f6153 !important}.twmgr-ghost:hover{background:#fdf6ec !important}",
      ".twmgr-add{width:100%;background:transparent !important;border:1px dashed #ddd2c0 !important;color:#a2643a !important;border-radius:8px;padding:6px;font-size:11px;font-weight:600;cursor:pointer;margin-bottom:8px}.twmgr-add:hover{background:#ffffff !important}",
      ".twmgr-actions{display:flex;gap:8px;margin-bottom:7px}.twmgr-actions .twmgr-btn{flex:1}",
      ".twmgr-cstatus{text-align:center;font-size:10px;font-weight:600;min-height:13px;color:#6f6153}",
      ".twmgr-card{background:linear-gradient(180deg,#f6f1e8,#ffffff);border:1px solid #ece4d8;border-radius:9px;margin-bottom:7px;overflow:hidden}",
      ".twmgr-card-head{display:flex;align-items:center;gap:7px;padding:7px 9px}",
      ".twmgr-xy{flex:0 0 76px;width:76px;text-align:center}",
      ".twmgr-cnt{flex:1;text-align:center;font-size:11px;font-weight:700;color:#a2643a;font-variant-numeric:tabular-nums}",
      ".twmgr-exp,.twmgr-del{cursor:pointer;font-size:12px;width:20px;height:20px;line-height:20px;text-align:center;border-radius:5px;color:#6f6153}",
      ".twmgr-exp:hover{background:rgba(162,100,58,.15);color:#8b5426}",
      ".twmgr-del{color:#a8564a}.twmgr-del:hover{background:rgba(231,76,60,.18);color:#c0483a}",
      ".twmgr-from{font-size:9px;color:#8a7d6d;padding:0 9px 6px}",
      ".twmgr-troops{display:none;padding:6px 9px 8px;border-top:1px solid #ece4d8}.twmgr-troops table{width:100%;border-collapse:collapse}",
      ".twmgr-troops td{padding:2px 3px;font-size:10px;color:#6f6153}.twmgr-qi{width:46px;text-align:center}",
      ".twmgr-units{display:grid;grid-template-columns:1fr 1fr;gap:6px 8px;margin-bottom:9px}",
      ".twmgr-units label{display:flex;align-items:center;gap:7px;font-size:11px;color:#6f6153;cursor:pointer}",
      ".twmgr-res{display:flex;gap:6px;margin:5px 0 9px}.twmgr-res label{flex:1;display:flex;align-items:center;gap:4px;font-size:13px}.twmgr-res .twmgr-inp{width:100%;font-size:11px !important}",
      ".twmgr-check{display:flex;align-items:center;gap:8px;font-size:11px;color:#6f6153;margin-bottom:10px;cursor:pointer}",
      ".twmgr-log{height:150px;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:8px;padding:7px 8px;font-family:Consolas,'Courier New',monospace;font-size:10px;line-height:1.45}",
      ".twmgr-log::-webkit-scrollbar{width:8px}.twmgr-log::-webkit-scrollbar-thumb{background:#e0d6c6;border-radius:4px}",
      "#twmgr-panel.twmgr-collapsed{width:auto}",
      "#twmgr-panel.twmgr-collapsed .twmgr-tabs,#twmgr-panel.twmgr-collapsed #twmgr-body{display:none}",
      "#twmgr-panel.twmgr-collapsed #twmgr-head{border-bottom:none}",
      ".twmgr-dot{width:9px;height:9px;border-radius:50%;background:#ddd2c0;transition:.2s;flex:0 0 auto}",
      ".twmgr-dot.on{background:#3f8f52;box-shadow:0 0 8px #3f8f52}",
      ".twmgr-bld-sum{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px}",
      ".twmgr-bld-sumcell{display:inline-flex;align-items:center;gap:2px;background:#ffffff;border:1px solid #ece4d8;border-radius:5px;padding:1px 4px;font-size:9px;color:#8b5426}",
      ".twmgr-bld-sumcell img{width:12px;height:12px;vertical-align:middle}",
      // Tabela de aldeias: rola sozinha e nunca alarga o painel — a coluna Aldeia e a que cede.
      ".twmgr-bld-vils{max-height:230px;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:8px}",
      ".twmgr-bld-vils::-webkit-scrollbar{width:8px}.twmgr-bld-vils::-webkit-scrollbar-thumb{background:#e0d6c6;border-radius:4px}",
      ".twmgr-bld-tab{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed}",
      ".twmgr-bld-tab th{position:sticky;top:0;background:#f6f1e8;color:#6f6153;font-weight:600;text-align:left;padding:3px 4px;border-bottom:1px solid #ece4d8;z-index:1}",
      ".twmgr-bld-tab td{padding:2px 4px;border-bottom:1px solid #f0e9dd;color:#463b30;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      // Coluna do checkbox: 16px era menos que o proprio checkbox (15px) + o padding da celula,
      // entao ele saia apertado contra o nome da aldeia. Largura propria e sem padding lateral.
      ".twmgr-bld-tab th.twmgr-tab-ck,.twmgr-bld-tab td.twmgr-tab-ck{width:26px;padding-left:2px;padding-right:2px;text-align:center}",
      ".twmgr-bld-tab tr.row_b td{background:rgba(0,0,0,.05)}",
      ".twmgr-bld-tab tr.twmgr-bld-off td{opacity:.55}",
      ".twmgr-bld-tab a{color:#a2643a;cursor:pointer;text-decoration:none}.twmgr-bld-tab a:hover{text-decoration:underline}",
      ".twmgr-bld-plan{max-height:260px;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:8px;padding:3px}",
      ".twmgr-bld-plan::-webkit-scrollbar{width:8px}.twmgr-bld-plan::-webkit-scrollbar-thumb{background:#e0d6c6;border-radius:4px}",
      ".twmgr-pq-item{display:grid;grid-template-columns:22px 18px 1fr 18px 18px 18px;align-items:center;gap:5px;padding:4px 5px;border-bottom:1px solid rgba(0,0,0,.06);font-size:11px;color:#463b30}",
      ".twmgr-pq-item:last-child{border-bottom:none}",
      ".twmgr-pq-ord{color:#8a7d6d;font-size:9px;text-align:right}",
      ".twmgr-pq-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".twmgr-pq-up,.twmgr-pq-down,.twmgr-pq-rm{cursor:pointer;text-align:center;font-size:11px;color:#a2643a;opacity:.75}",
      ".twmgr-pq-up:hover,.twmgr-pq-down:hover{opacity:1}",
      ".twmgr-pq-rm{color:#c0483a}.twmgr-pq-rm:hover{opacity:1}",
      ".twmgr-bld-item{display:grid;grid-template-columns:22px 16px 18px 1fr 44px 18px 18px 18px;align-items:center;gap:4px;padding:3px 5px;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;color:#463b30}",
      ".twmgr-bld-item:last-child{border-bottom:none}",
      ".twmgr-bld-item.twmgr-bld-off{opacity:.42;filter:grayscale(.6)}",
      ".twmgr-bld-ord{color:#8a7d6d;font-size:9px;text-align:right}",
      ".twmgr-bld-ico{font-size:14px;text-align:center}",
      ".twmgr-bld-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".twmgr-bld-lvl{width:100% !important;text-align:center;padding:2px 4px !important;font-size:11px !important}",
      ".twmgr-bld-up,.twmgr-bld-down,.twmgr-bld-rm{cursor:pointer;text-align:center;font-size:11px;color:#6f6153;border-radius:4px;user-select:none;padding:1px 0}",
      ".twmgr-bld-up:hover,.twmgr-bld-down:hover{background:rgba(162,100,58,.18);color:#8b5426}",
      ".twmgr-bld-rm{color:#a8564a}.twmgr-bld-rm:hover{background:rgba(231,76,60,.22);color:#c0483a}",
    ].join('');
    document.head.appendChild(s);
  }

  function showTab(name) {
    ['scav', 'farm', 'recruit', 'market', 'build', 'research', 'planner', 'paladin', 'etiqueta', 'obra', 'log'].forEach((n) => {
      const c = document.getElementById('twmgr-tab-' + n); if (c) c.style.display = n === name ? 'block' : 'none';
      const b = document.getElementById('twmgr-btab-' + n); if (b) b.classList.toggle('active', n === name);
    });
  }

  // Sub-aba do Saque. Guarda a escolha no localStorage (preferência de tela, igual à largura do
  // painel) pra quem vive na Muralha não cair no Saque a cada recarregamento de página.
  const FARM_SUB_KEY = 'twMgr_farmSub';
  function showFarmSub(name) {
    ['farm', 'wall', 'map'].forEach((n) => {
      const c = document.getElementById('twmgr-sub-' + n); if (c) c.style.display = n === name ? 'block' : 'none';
      const b = document.getElementById('twmgr-sbtab-' + n); if (b) b.classList.toggle('active', n === name);
    });
    try { localStorage.setItem(FARM_SUB_KEY, name); } catch (e) {}
  }

  function buildUI() {
    injectStyles();
    // Segunda linha de defesa: mesmo com a trava lá em cima, nunca cria um painel se já
    // houver um. Dois elementos com o mesmo id fazem getElementById devolver o primeiro, e
    // aí metade da fiação vai parar no painel errado — sintoma dificílimo de diagnosticar.
    if (document.getElementById('twmgr-panel')) { console.warn('[TWMgr] painel ja existe — buildUI ignorado.'); return; }
    const p = document.createElement('div'); p.id = 'twmgr-panel';
    const tabBtn = (n, ico, label) => '<div id="twmgr-btab-' + n + '" class="twmgr-tab" data-tab="' + n + '"><span class="twmgr-tab-ico">' + ico + '</span><span class="twmgr-tab-lbl">' + label + '</span></div>';
    // Sub-abas dentro de um módulo (hoje só o Saque: Saque / Muralha / Mapa). O ponto é tirar peso da
    // barra principal sem esconder módulo: Muralha e Mapa só fazem sentido perto do Saque — um derruba
    // muralha dos alvos do assistente, o outro descobre bárbaro novo pra saquear.
    const subBtn = (n, ico, label) => '<div id="twmgr-sbtab-' + n + '" class="twmgr-subtab" data-sub-farm="' + n + '"><span>' + ico + '</span> ' + label + '</div>';
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
      '<div id="twmgr-grip" title="arraste pra alargar/estreitar o painel"></div>' +
      '<div id="twmgr-head"><span class="twmgr-title">🎯 TW Manager <span class="twmgr-ver">v' + VERSION + '</span></span><div id="twmgr-head-actions"><span id="twmgr-dot" class="twmgr-dot" title="algum módulo ativo"></span><span id="twmgr-logbtn" title="Log">📜</span><span id="twmgr-upd-btn" title="Verificar / instalar atualização">🔄<span id="twmgr-upd-badge" style="display:none">●</span></span><span id="twmgr-min" title="minimizar / restaurar">–</span></div></div>' +
      '<div class="twmgr-tabs">' + tabBtn('scav', '⛏️', 'Coletas') + tabBtn('farm', '🐎', 'Saque') + tabBtn('recruit', '🏹', 'Recrutar') + tabBtn('market', '🏪', 'Mercado') + tabBtn('build', '🏗️', 'Construções') + tabBtn('research', '⚗️', 'Pesquisa') + tabBtn('planner', '🎯', 'Coord.') + tabBtn('paladin', '🐴', 'Paladino') + tabBtn('etiqueta', '🏷️', 'Etiquetas') + tabBtn('obra', '🏛️', 'Obra') + '</div>' +
      // Telas de modelo: overlay DENTRO do painel, nao aba nova. Ficam fora do #twmgr-body pra
      // cobrir o painel inteiro (inclusive a barra de abas) enquanto abertas -- e uma tela cheia
      // de edicao, entao trocar de aba no meio nao faz sentido.
      '<div id="twmgr-tela-tpl-build" class="twmgr-tela" style="display:none">' +
        '<div class="twmgr-tela-head"><span>🏗️ Modelos de construção</span>' +
          '<a id="twmgr-bld-fechar-tpl" class="twmgr-tela-x" title="voltar">✕</a></div>' +
        '<div class="twmgr-tela-body">' +
        sec('Gerenciar modelos',
          '<div class="twmgr-row" style="gap:4px">' +
            '<select id="twmgr-bld-tpl" class="twmgr-inp" style="flex:1"></select>' +
            '<button id="twmgr-bld-tpl-new" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="criar modelo">✚</button>' +
            '<button id="twmgr-bld-tpl-ren" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="renomear">✎</button>' +
            '<button id="twmgr-bld-tpl-del" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="apagar modelo">🗑</button>' +
            '<button id="twmgr-bld-tpl-exp" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="exportar: gera um código pra mandar pra um amigo">📤</button>' +
            '<button id="twmgr-bld-tpl-imp" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="importar: cola o código que um amigo te mandou">📥</button>' +
          '</div>' +
          '<div id="twmgr-bld-sum" class="twmgr-bld-sum"></div>' +
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
          '</div>' +
          '<div style="font-size:9px;color:#8a7d6d;margin:7px 0 3px">Prioridades deste modelo (0 = desligado) — furam a ordem da lista quando disparam:</div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">🌾 Fazenda se sobrar menos de</span><input id="twmgr-bld-farmpct" class="twmgr-inp" type="number" min="0" max="99" value="0" style="width:52px" title="% de população ainda disponível"><span style="font-size:10px;color:#8a7d6d">% da pop.</span></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">📦 Armazém se sobrar menos de</span><input id="twmgr-bld-storagepct" class="twmgr-inp" type="number" min="0" max="99" value="0" style="width:52px" title="% de capacidade de armazenamento ainda livre"><span style="font-size:10px;color:#8a7d6d">% da cap.</span></div>') +
        '</div>' +
      '</div>' +
      '<div id="twmgr-tela-tpl-pq" class="twmgr-tela" style="display:none">' +
        '<div class="twmgr-tela-head"><span>⚗️ Modelos de pesquisa</span>' +
          '<a id="twmgr-pq-fechar-tpl" class="twmgr-tela-x" title="voltar">✕</a></div>' +
        '<div class="twmgr-tela-body">' +
        sec('Gerenciar modelos',
          '<div class="twmgr-row" style="gap:4px">' +
            '<select id="twmgr-pq-tpl" class="twmgr-inp" style="flex:1"></select>' +
            '<button id="twmgr-pq-tpl-new" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="criar modelo">✚</button>' +
            '<button id="twmgr-pq-tpl-ren" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="renomear">✎</button>' +
            '<button id="twmgr-pq-tpl-del" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="apagar modelo">🗑</button>' +
          '</div>' +
          '<div style="font-size:9px;color:#8a7d6d;margin:6px 0 3px">Ordem = prioridade. A primeira tropa que ainda falta é a que entra na pesquisa.</div>' +
          '<div id="twmgr-pq-order" class="twmgr-bld-plan"></div>' +
          '<div class="twmgr-row" style="gap:4px;margin-top:6px">' +
            '<select id="twmgr-pq-add" class="twmgr-inp" style="flex:1">' +
              UNITS.filter((par) => par[0] !== 'knight' && par[0] !== 'snob').map((par) => '<option value="' + par[0] + '">' + par[1] + '</option>').join('') +
            '</select>' +
            '<button id="twmgr-pq-add-btn" class="twmgr-btn twmgr-ghost" style="padding:5px 10px">+</button>' +
          '</div>' +
          '<div style="margin-top:4px"><button id="twmgr-pq-reset" class="twmgr-btn twmgr-ghost" style="width:100%;font-size:10px">↺ ordem padrão</button></div>') +
        '</div>' +
      '</div>' +
      '<div id="twmgr-body">' +
      '<div id="twmgr-tab-scav" style="display:none">' +
        hint('Coleta em <b>todas as aldeias</b>: reparte as tropas marcadas nas opções livres e reenvia no retorno.') +
        cardsDiv('scav') +
        sec('Tropas na coleta', '<div class="twmgr-units">' + SCAV_UNITS.map(([u, n]) => '<label><input id="twmgr-su-' + u + '" type="checkbox"> ' + unitIcon(u, n) + ' ' + n + '</label>').join('') + '</div>') +
        sec('Desbloqueio automático',
          '<label class="twmgr-check" title="A cada ciclo, abre a próxima coleta de cada aldeia que já puder ser aberta."><input id="twmgr-scav-unlock" type="checkbox"> Desbloquear coletas automaticamente</label>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Desbloquear até</span><select id="twmgr-scav-unlock-ate" class="twmgr-inp" style="width:150px">' +
            '<option value="1">1 · Pequena</option><option value="2">2 · Média</option><option value="3">3 · Grande</option><option value="4">4 · Extrema</option></select></div>' +
          '<label class="twmgr-check" title="Faltando recurso, manda o que falta de outras aldeias suas na mesma hora. O desbloqueio acontece no ciclo seguinte, quando o transporte chegar."><input id="twmgr-scav-unlock-puxar" type="checkbox"> Puxar recurso de outras aldeias quando faltar</label>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="A aldeia que doa nunca fica abaixo disto em cada recurso.">Reserva da doadora (cada recurso)</span><input id="twmgr-scav-unlock-res" class="twmgr-inp" type="number" min="0" step="500" value="5000" style="width:80px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Quantas aldeias no máximo contribuem para um mesmo desbloqueio. As mais próximas primeiro.">Máx. de aldeias doadoras</span><input id="twmgr-scav-unlock-org" class="twmgr-inp" type="number" min="1" max="20" value="5" style="width:66px"></div>' +
          '<div class="twmgr-hint" style="margin:0">Custo: <b>1</b> 25/30/25 · <b>2</b> 250/300/250 · <b>3</b> 1k/1,2k/1k · <b>4</b> 10k/12k/10k. Cada aldeia abre uma de cada vez, e a de cima exige a de baixo.</div>' +
          '<div id="twmgr-scav-falta" style="margin-top:6px"></div>') +
        sec('Segurança',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Nenhum nível de coleta com duração acima disso é enviado — mesmo com tropa livre. 0 = sem limite. Útil em guerra, pra tropa nunca ficar fora de casa por muito tempo.">Tempo máximo por coleta (h, 0=sem limite)</span><input id="twmgr-scav-maxh" class="twmgr-inp" type="number" min="0" step="0.5" value="0" style="width:70px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-scav-start" class="twmgr-btn twmgr-go">▶ Coletar</button><button id="twmgr-scav-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-scav-status" class="twmgr-cstatus"></div>' +
        modLog('scav') +
      '</div>' +
      '<div id="twmgr-tab-farm" style="display:none">' +
        '<div class="twmgr-subtabs">' +
          subBtn('farm', '🐎', 'Saque') +
          subBtn('wall', '🐏', 'Muralha') +
          subBtn('map', '🗺️', 'Mapa') +
        '</div>' +
        '<div id="twmgr-sub-farm">' +
        '<div id="twmgr-farm-prog" class="twmgr-hint">Saque parado.</div>' +
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
        '<div id="twmgr-sub-wall" style="display:none">' +
        hint('🐏 Manda bárbaro + aríete + explorador pra derrubar muralhas dos alvos do assistente. Roda em paralelo ao Saque.') +
        cardsDiv('wall') +
        sec('Faixa de muralha',
          '<div class="twmgr-row"><span class="twmgr-lbl">Derrubar muros do nível</span><span><input id="twmgr-wall-min" class="twmgr-inp" type="number" min="1" max="20" value="1" style="width:44px"> até <input id="twmgr-wall-max" class="twmgr-inp" type="number" min="1" max="20" value="6" style="width:44px"></span></div>') +
        sec('Tropa por ataque',
          '<div class="twmgr-row"><span class="twmgr-lbl">Bárbaro por ataque</span><input id="twmgr-wall-axe" class="twmgr-inp" type="number" min="1" value="80" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Aríete</span><select id="twmgr-wall-mode" class="twmgr-inp" style="width:150px"><option value="auto">auto (pela muralha)</option><option value="fixo">fixo</option></select></div>' +
          '<div id="twmgr-wall-auto"><div class="twmgr-row"><span class="twmgr-lbl">Aríetes p/ muralha 6</span><input id="twmgr-wall-ramw6" class="twmgr-inp" type="number" min="1" value="24" style="width:66px"></div><div style="font-size:9px;color:#8a7d6d">calibra o resto: muro5≈18 · 4≈13 · 3≈9 · 2≈5 · 1≈3</div></div>' +
          '<div id="twmgr-wall-fixo" style="display:none"><div class="twmgr-row"><span class="twmgr-lbl">Aríetes por ataque (fixo)</span><input id="twmgr-wall-ramfix" class="twmgr-inp" type="number" min="1" value="20" style="width:66px"></div></div>') +
        sec('Ritmo', '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-wall-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-wall-start" class="twmgr-btn twmgr-go">▶ Quebrar</button><button id="twmgr-wall-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-wall-status" class="twmgr-cstatus"></div>' +
        modLog('wall') +
        '</div>' +
        '<div id="twmgr-sub-map" style="display:none">' +
        hint('🗺️ Fica <b>ligado por ciclos</b>. A cada ciclo relê o mapa, acha bárbaro novo no seu raio e manda explorador em quem <b>você ainda não conhece</b> — quem não está no assistente de saque, ou está mas o relatório não trouxe nada. Quem já tem explorador a caminho é pulado.') +
        cardsDiv('map') +
        sec('Origem',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo origem (vazio = todas)</span><select id="twmgr-bm-group" class="twmgr-inp" style="width:150px"></select></div>' +
          '<div style="text-align:right;margin-top:2px"><button id="twmgr-bm-reload" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">↻ grupos</button> <button id="twmgr-bm-refmap" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="recarrega /map/village.txt">↻ mapa</button></div>') +
        sec('Filtros de alvo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-bm-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="20" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="0 = nunca reexplora quem já tem relatório com dados. Acima de 0, reexplora intel mais velho que isso.">Reexplorar intel com + de (dias)</span><input id="twmgr-bm-days" class="twmgr-inp" type="number" min="0" step="0.5" value="0" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Pontos de/até</span><span><input id="twmgr-bm-minpts" class="twmgr-inp" type="number" min="0" value="26" style="width:56px"> a <input id="twmgr-bm-maxpts" class="twmgr-inp" type="number" min="1" value="5000" style="width:56px"></span></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Máx alvos por aldeia/ciclo</span><input id="twmgr-bm-maxper" class="twmgr-inp" type="number" min="1" value="20" style="width:66px"></div>') +
        sec('Exploradores',
          '<div class="twmgr-row"><span class="twmgr-lbl">Reserva de spy (guardar/aldeia)</span><input id="twmgr-bm-reserve" class="twmgr-inp" type="number" min="0" value="30" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Spy por alvo</span><input id="twmgr-bm-spy" class="twmgr-inp" type="number" min="1" value="1" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Delay entre envios (ms)</span><input id="twmgr-bm-delay" class="twmgr-inp" type="number" min="0" step="100" value="500" style="width:66px"></div>') +
        sec('Ciclo',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="De quanto em quanto tempo ele relê o mapa e procura bárbaro novo.">Intervalo do ciclo (min)</span><input id="twmgr-bm-ciclo" class="twmgr-inp" type="number" min="5" step="5" value="30" style="width:66px"></div>' +
          '<div id="twmgr-bm-next" style="font-size:10px;color:#8a7d6d;text-align:right"></div>') +
        sec('Blacklist',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="A partir de quantas unidades de defesa no relatório a aldeia entra na blacklist.">Defesa mínima p/ blacklist</span><input id="twmgr-bm-defmin" class="twmgr-inp" type="number" min="1" value="1" style="width:66px"></div>' +
          '<label class="twmgr-check" title="Quando uma aldeia entrar na blacklist por DEFESA, apaga os relatórios dela no jogo — o que a tira da listagem do assistente. Não afeta a blacklist de tropa perdida. NÃO TEM DESFAZER: pra voltar, a aldeia teria que reaparecer sozinha na busca do assistente."><input id="twmgr-bm-rmassist" type="checkbox"> Apagar do assistente quem tem defesa <b style="color:#a8564a">(irreversível)</b></label>' +
          '<div class="twmgr-hint" style="margin:0">O Saque já pula quem está em qualquer uma das duas listas, mesmo com essa opção desligada.</div>') +
        '<div class="twmgr-actions"><button id="twmgr-bm-preview" class="twmgr-btn twmgr-ghost">💡 Prévia</button><button id="twmgr-bm-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-bm-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-bm-status" class="twmgr-cstatus"></div>' +
        // Três listas na mesma área, alternadas — alvos do próximo ciclo e as duas blacklists.
        '<div id="twmgr-bm-subtabs" style="display:flex;gap:4px;margin:9px 0 0">' +
          '<button class="twmgr-btn twmgr-ghost twmgr-bm-sub" data-sub="alvos" style="flex:1;padding:4px;font-size:10px">🎯 Alvos (<span id="twmgr-bm-count">0</span>)</button>' +
          '<button class="twmgr-btn twmgr-ghost twmgr-bm-sub" data-sub="perda" style="flex:1;padding:4px;font-size:10px">💀 Perdi tropa (<span id="twmgr-bm-nperda">0</span>)</button>' +
          '<button class="twmgr-btn twmgr-ghost twmgr-bm-sub" data-sub="defesa" style="flex:1;padding:4px;font-size:10px">🛡️ Tem defesa (<span id="twmgr-bm-ndefesa">0</span>)</button>' +
        '</div>' +
        '<div id="twmgr-bm-list" style="max-height:220px;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:8px;margin-top:4px"></div>' +
        '<div id="twmgr-bm-bl" style="max-height:220px;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:8px;margin-top:4px;display:none"></div>' +
        modLog('map') +
        sec('🔒 Cadeado automático',
          '<div style="font-size:10px;color:#8a7d6d;margin-bottom:4px">Rastreia bárbaras no raio de TODAS as suas aldeias (a mais perto conta) e tranca (reserva pra tribo) as com pontuação mínima, das mais fortes pras mais fracas. Pula quem tem relatório vermelho no último ataque (checado aldeia por aldeia, cobre até abandonadas). Nunca destrava o que já travou — só soma.</div>' +
          cardsDiv('lock') +
          '<div class="twmgr-row"><span class="twmgr-lbl">Raio (campos, X)</span><input id="twmgr-lk-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="10" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Pontos mín. (Y)</span><input id="twmgr-lk-pts" class="twmgr-inp" type="number" min="0" value="500" style="width:80px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Repetir rastreamento (min)</span><input id="twmgr-lk-int" class="twmgr-inp" type="number" min="1" value="30" style="width:66px"></div>' +
          '<div class="twmgr-actions"><button id="twmgr-lk-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-lk-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
          '<div id="twmgr-lk-status" class="twmgr-cstatus"></div>' +
          modLog('lock')) +
        '</div>' +
      '</div>' +
      '<div id="twmgr-tab-recruit" style="display:none">' +
        hint('Recruta por <b>grupo</b> do TW: mantém a fila alvo por edifício e para no alvo de tropas. Vazio = contínuo.') +
        cardsDiv('recruit') +
        sec('Grupos (fixo ATK/DEF)',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo ATK</span><select id="twmgr-r-gatk" class="twmgr-inp" style="width:170px"></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo DEF</span><select id="twmgr-r-gdef" class="twmgr-inp" style="width:170px"></select></div>' +
          '<div style="text-align:right;margin-top:2px"><button id="twmgr-r-reload" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">↻ grupos</button></div>') +
        sec('Tropas por perfil', recruitProfileHTML('atk', '⚔️ Perfil ATK') + recruitProfileHTML('def', '🛡️ Perfil DEF')) +
        sec('Grupos adicionais',
          '<div style="font-size:10px;color:#8a7d6d;margin-bottom:4px">Crie quantos perfis quiser, cada um ligado a um grupo do TW — igual o ATK/DEF acima, mas sem limite de quantidade.</div>' +
          '<div id="twmgr-rg-list"></div>' +
          '<button id="twmgr-rg-add" class="twmgr-btn twmgr-ghost" style="width:100%;margin-top:2px">+ Adicionar grupo</button>') +
        sec('Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Fila alvo (h)</span><input id="twmgr-r-hours" class="twmgr-inp" type="number" min="0.5" step="0.5" value="2" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Repor quando faltar (min)</span><input id="twmgr-r-refill" class="twmgr-inp" type="number" min="1" value="30" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-r-start" class="twmgr-btn twmgr-go">▶ Recrutar</button><button id="twmgr-r-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<button id="twmgr-r-diag" class="twmgr-btn twmgr-ghost" style="width:100%;margin-bottom:6px">🔍 Diagnóstico (Recrutar)</button>' +
        '<div id="twmgr-recruit-status" class="twmgr-cstatus"></div>' +
        modLog('recruit') +
      '</div>' +
      '<div id="twmgr-tab-market" style="display:none">' +
        hint('Mercado: cada modo roda de forma <b>independente</b> — pode ligar quantos quiser ao mesmo tempo (ex.: Equilíbrio + Solidário juntos). <b>Cunhagem</b> junta recurso de grupos de origem em uma ou mais aldeias destino (e pode cunhar moedas de ouro automaticamente nelas); <b>Equilíbrio</b> nivela as aldeias por %; <b>Solidário</b> abastece só o grupo escolhido (que só recebe) com qualquer outra aldeia sua doando.') +
        sec('💰 Cunhagem',
            '<div class="twmgr-row"><span class="twmgr-lbl">Grupos de origem</span></div>' +
            '<div id="twmgr-mk-srcgroups" style="max-height:100px;overflow-y:auto;border:1px solid #ece4d8;border-radius:6px;padding:4px;margin-bottom:6px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Aldeias destino (1 coord. por linha)</span></div>' +
            '<textarea id="twmgr-mk-destcoords" class="twmgr-inp" style="width:100%;height:52px;margin:2px 0 6px" placeholder="464|604&#10;465|605"></textarea>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Reserva madeira/argila/ferro</span>' +
              '<input id="twmgr-mk-rwood" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:64px">' +
              '<input id="twmgr-mk-rstone" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:64px">' +
              '<input id="twmgr-mk-riron" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:64px"></div>' +
            '<div class="twmgr-row"><label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#6f6153"><input id="twmgr-mk-automint" type="checkbox">Cunhagem automática (moedas de ouro nas aldeias destino)</label></div>' +
            '<div class="twmgr-row"><label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#6f6153"><input id="twmgr-mk-stopon" type="checkbox">Parada programada, após</label><input id="twmgr-mk-stophours" class="twmgr-inp" type="number" min="0.1" step="0.5" value="2" style="width:56px"><span class="twmgr-lbl">h</span></div>' +
            '<div class="twmgr-actions"><button id="twmgr-mk-cunhagem-start" class="twmgr-btn twmgr-go">▶ Enviar</button><button id="twmgr-mk-cunhagem-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
            '<div id="twmgr-mk-cunhagem-status" class="twmgr-cstatus"></div>') +
        sec('⚖️ Equilíbrio',
            '<div style="font-size:10px;color:#8a7d6d;margin-bottom:4px">Aldeia acima do limiar doa o excedente pras abaixo, por recurso. Da mais perto primeiro.</div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Encher armazém até (%)</span><input id="twmgr-mk-thr" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-mk-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="15" style="width:56px"></div>' +
            '<div class="twmgr-actions"><button id="twmgr-mk-equilibrio-start" class="twmgr-btn twmgr-go">▶ Enviar</button><button id="twmgr-mk-equilibrio-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
            '<div id="twmgr-mk-equilibrio-status" class="twmgr-cstatus"></div>') +
        sec('🤝 Solidário',
            '<div style="font-size:10px;color:#8a7d6d;margin-bottom:4px">Aldeias do grupo escolhido SÓ RECEBEM (nunca doam). Doadora é qualquer OUTRA aldeia sua — testa da mais perto pra mais longe, e pula pra próxima se a mais perto não tiver mercador/recurso suficiente. Doadora só cede acima de "% do recurso mais baixo dela" (protege quem já tá capenga). Se ninguém qualificar, a mais próxima cede só a fatia acima de "% que fica na doadora" mesmo assim (nunca esvazia), pra nunca travar construção/pesquisa numa aldeia nova ou bárbara conquistada.</div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Grupo Solidário</span><select id="twmgr-mk-g-solid" class="twmgr-inp" style="width:140px"></select></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Carente: encher armazém até (%)</span><input id="twmgr-mk-sthr" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl" title="Independente do limiar acima — se o limiar de carente for alto (ex.: 85%), esse aqui evita que ninguém nunca qualifique como doador.">Doadora: mín. % de armazém p/ poder doar</span><input id="twmgr-mk-sdonormin" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Doadora: piso = % do recurso mais baixo dela</span><input id="twmgr-mk-sdonor" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Gargalo: % que fica na doadora</span><input id="twmgr-mk-sgargalo" class="twmgr-inp" type="number" min="1" max="99" value="90" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-mk-sdist" class="twmgr-inp" type="number" min="1" step="0.5" value="20" style="width:56px"></div>' +
            '<div class="twmgr-actions"><button id="twmgr-mk-solidario-start" class="twmgr-btn twmgr-go">▶ Enviar</button><button id="twmgr-mk-solidario-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
            '<div id="twmgr-mk-solidario-status" class="twmgr-cstatus"></div>') +
        sec('Ritmo (compartilhado pelos modos ligados)', '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-mk-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>') +
        modLog('market') +
      '</div>' +
      '<div id="twmgr-tab-build" style="display:none">' +
        hint('🏗️ Modelos de construção aplicados <b>por aldeia</b>, no molde do Gerente de conta. Ordem da lista = prioridade; item caro vira demanda pro Equilíbrio.') +
        cardsDiv('build') +
        sec('Gerenciar construções da aldeia',
          '<div class="twmgr-row" style="gap:4px">' +
            '<span class="twmgr-lbl" style="flex:0 0 auto">Grupo</span>' +
            '<select id="twmgr-bld-group" class="twmgr-inp" style="flex:1"></select>' +
            '<button id="twmgr-bld-vil-reload" class="twmgr-btn twmgr-ghost" style="padding:5px 9px" title="carregar aldeias">↻</button>' +
          '</div>' +
          '<div id="twmgr-bld-vils" class="twmgr-bld-vils"></div>' +
          '<div id="twmgr-bld-vils-info" style="font-size:9px;color:#8a7d6d;text-align:right;margin-top:2px"></div>' +
          '<div class="twmgr-row" style="gap:4px;margin-top:5px">' +
            '<select id="twmgr-bld-mass-acao" class="twmgr-inp" style="flex:1">' +
              '<option value="apply">Utilizar modelo</option>' +
              '<option value="pause">Pausar</option>' +
              '<option value="resume">Retomar</option>' +
              '<option value="remove">Remover</option>' +
            '</select>' +
            '<select id="twmgr-bld-mass-tpl" class="twmgr-inp" style="flex:1"></select>' +
            '<button id="twmgr-bld-mass-go" class="twmgr-btn twmgr-ghost" style="padding:5px 10px">✓</button>' +
          '</div>') +
        '<div style="text-align:right;margin:-4px 0 8px"><a id="twmgr-bld-abrir-tpl" class="twmgr-link-tela">&raquo; Gerenciar modelos</a></div>' +
        sec('Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Máx na fila</span><input id="twmgr-bld-max" class="twmgr-inp" type="number" min="1" value="5" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-bld-int" class="twmgr-inp" type="number" min="1" value="10" style="width:56px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-bld-start" class="twmgr-btn twmgr-go">▶ Construir</button><button id="twmgr-bld-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-bld-status" class="twmgr-cstatus"></div>' +
        modLog('build') +
      '</div>' +
      '<div id="twmgr-tab-research" style="display:none">' +
        hint('⚗️ Modelo de <b>prioridade de pesquisa</b> aplicado por aldeia. Se faltar recurso, puxa da aldeia mais próxima que tenha excedente.') +
        cardsDiv('research') +
        sec('Gerenciar pesquisas da aldeia',
          '<div class="twmgr-row" style="gap:4px">' +
            '<span class="twmgr-lbl" style="flex:0 0 auto">Grupo</span>' +
            '<select id="twmgr-pq-group" class="twmgr-inp" style="flex:1"></select>' +
            '<button id="twmgr-pq-vil-reload" class="twmgr-btn twmgr-ghost" style="padding:5px 9px" title="carregar aldeias">↻</button>' +
          '</div>' +
          '<div id="twmgr-pq-vils" class="twmgr-bld-vils"></div>' +
          '<div id="twmgr-pq-vils-info" style="font-size:9px;color:#8a7d6d;text-align:right;margin-top:2px"></div>' +
          '<div class="twmgr-row" style="gap:4px;margin-top:5px">' +
            '<select id="twmgr-pq-mass-acao" class="twmgr-inp" style="flex:1">' +
              '<option value="apply">Utilizar modelo</option>' +
              '<option value="pause">Pausar</option>' +
              '<option value="resume">Retomar</option>' +
              '<option value="remove">Remover</option>' +
            '</select>' +
            '<select id="twmgr-pq-mass-tpl" class="twmgr-inp" style="flex:1"></select>' +
            '<button id="twmgr-pq-mass-go" class="twmgr-btn twmgr-ghost" style="padding:5px 10px">✓</button>' +
          '</div>') +
        '<div style="text-align:right;margin:-4px 0 8px"><a id="twmgr-pq-abrir-tpl" class="twmgr-link-tela">&raquo; Gerenciar modelos</a></div>' +
        sec('Abastecimento quando falta recurso',
          '<label class="twmgr-check" title="Puxa da aldeia mais próxima que tenha excedente"><input id="twmgr-pq-feed" type="checkbox"> Pedir recurso pra pesquisar</label>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Reserva na fonte (%)</span><input id="twmgr-pq-reserve" class="twmgr-inp" type="number" min="0" max="90" value="40" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Dist. máx. da fonte (campos)</span><input id="twmgr-pq-dist" class="twmgr-inp" type="number" min="1" value="20" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="A tela do Ferreiro não informa o custo da pesquisa, então enche os três recursos até esse % do armazém">Encher a aldeia até (%)</span><input id="twmgr-pq-fill" class="twmgr-inp" type="number" min="10" max="100" value="60" style="width:56px"></div>') +
        sec('Ritmo', '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-pq-int" class="twmgr-inp" type="number" min="1" value="15" style="width:56px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-pq-start" class="twmgr-btn twmgr-go">▶ Pesquisar</button><button id="twmgr-pq-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-pq-status" class="twmgr-cstatus"></div>' +
        modLog('research') +
      '</div>' +
      '<div id="twmgr-tab-planner" style="display:none">' +
        hint('🎯 Coordenado: monte vários ataques independentes — cada um com seu próprio alvo, aldeias e tropas — e arme cada um separadamente (o botão libera um novo ataque em branco assim que você arma). Cada aldeia pode mandar <b>várias ondas</b> (+ onda) dentro do mesmo ataque. Tropas ficam <b>reservadas</b> — Saque/Fakes/Muralha não gastam elas.') +
        cardsDiv('planner') +
        sec('Ataques', '<div id="twmgr-pl-attacks" style="display:flex;flex-wrap:wrap;gap:6px"></div>') +
        sec('1. Alvo (do ataque selecionado acima)',
          '<div class="twmgr-row"><span class="twmgr-lbl">Relógio do servidor</span><b id="twmgr-pl-srvclock" style="color:#a2643a">--:--:--</b></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Coord alvo</span><span><input id="twmgr-pl-target-x" class="twmgr-inp" type="number" min="1" placeholder="x" style="width:56px"> | <input id="twmgr-pl-target-y" class="twmgr-inp" type="number" min="1" placeholder="y" style="width:56px"></span></div>' +
          '<label class="twmgr-lbl">Chegada base (horário do servidor)</label><input id="twmgr-pl-arr" class="twmgr-inp" type="datetime-local" step="1" style="width:100%;margin:2px 0 0">' +
          '<div class="twmgr-row" style="margin-top:6px"><span class="twmgr-lbl">Offset envio (ms)</span><input id="twmgr-pl-offset" class="twmgr-inp" type="number" min="0" value="150" style="width:56px"></div>') +
        sec('2. Aldeias participantes',
          '<div class="twmgr-row"><span class="twmgr-lbl">Selecione</span><span style="font-size:9px"><a id="twmgr-pl-all" style="cursor:pointer;color:#a2643a">todas</a> · <a id="twmgr-pl-none" style="cursor:pointer;color:#a2643a">nenhuma</a> · <a id="twmgr-pl-load" style="cursor:pointer;color:#a2643a">🔄 carregar tropas</a></span></div>' +
          '<div id="twmgr-pl-villages" style="max-height:110px;overflow-y:auto;border:1px solid #ece4d8;border-radius:6px;padding:4px"></div>') +
        sec('3. Composição por aldeia (+ onda pra mandar mais de um ataque da mesma aldeia)',
          '<div id="twmgr-pl-cards"><div style="font-size:10px;color:#8a7d6d;padding:6px;text-align:center">— marque aldeias acima e clique em <b>🔄 carregar tropas</b> —</div></div>') +
        sec('4. Armar este ataque',
          '<div class="twmgr-actions"><button id="twmgr-pl-start" class="twmgr-btn twmgr-go">▶ Armar este ataque</button><button id="twmgr-pl-stop" class="twmgr-btn twmgr-stop">■ Desarmar</button><button id="twmgr-pl-clear" class="twmgr-btn twmgr-ghost" style="flex:0 0 auto">🗑</button></div>' +
          '<div id="twmgr-pl-status" class="twmgr-cstatus"></div>') +
        sec('5. Fila deste ataque',
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:10px;color:#8a7d6d">ordenada por horário de envio</span><button id="twmgr-pl-queue-clear" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="remover enviados e erros do histórico">🗑 limpar histórico</button></div>' +
          '<div id="twmgr-pl-queue" style="max-height:220px;overflow-y:auto"></div>') +
        sec('Templates',
          '<div class="twmgr-row"><span class="twmgr-lbl">Salvar plano atual</span><span><input id="twmgr-pl-tpl-name" class="twmgr-inp" type="text" placeholder="ex: guerra XYZ" style="width:120px"> <button id="twmgr-pl-tpl-save" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">💾</button></span></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Carregar</span><span><select id="twmgr-pl-tpl-load" class="twmgr-inp" style="width:120px"></select> <button id="twmgr-pl-tpl-apply" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">📂</button> <button id="twmgr-pl-tpl-del" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="apagar">🗑</button></span></div>') +
        sec('🛡️ Blindagem da tribo',
          '<div style="font-size:10px;color:#8a7d6d;margin-bottom:4px">Puxa a tabela do tópico, escolhe origem por linha, envia apoios e copia o texto no formato do fórum.</div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">URL do tópico</span><input id="twmgr-blz-url" class="twmgr-inp" type="text" placeholder="https://.../screen=forum&mode=view&thread_id=..." style="flex:1;min-width:180px"></div>' +
          '<div class="twmgr-actions"><button id="twmgr-blz-fetch" class="twmgr-btn twmgr-ghost">🛡️ Buscar pedidos</button><span id="twmgr-blz-status" style="flex:1;font-size:10px;color:#8a7d6d;padding-top:4px">—</span></div>' +
          '<div id="twmgr-blz-list" style="max-height:280px;overflow-y:auto;border:1px solid #ece4d8;border-radius:6px;padding:4px;margin-top:4px"></div>' +
          '<div class="twmgr-actions" style="margin-top:6px"><button id="twmgr-blz-send" class="twmgr-btn twmgr-go">✉️ Enviar marcados</button></div>') +
        modLog('planner') +
      '</div>' +
      '<div id="twmgr-tab-paladin" style="display:none">' +
        hint('🐴 Treina o(s) Paladino(s) por XP em ciclo — sempre no regime de <b>4h</b> (melhor XP/hora dos 5 disponíveis). Além do check periódico, cada envio arma um timer de precisão pra 4h+30s depois, garantindo reenvio quase imediato.') +
        cardsDiv('paladin') +
        sec('1. Aldeias no ciclo',
          '<div id="twmgr-pd-villages" style="max-height:130px;overflow-y:auto;border:1px solid #ece4d8;border-radius:6px;padding:4px"></div>') +
        sec('2. Verificação periódica',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Rede de segurança ampla — roda independente do timer de precisão de cada envio.">Nova verificação (min)</span><input id="twmgr-pd-interval" class="twmgr-inp" type="number" min="1" value="240" style="width:66px"></div>') +
        sec('3. Ritmo de envio',
          '<div class="twmgr-row"><span class="twmgr-lbl">Delay entre envios (ms)</span><input id="twmgr-pd-delay" class="twmgr-inp" type="number" min="0" step="100" value="500" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-pd-start" class="twmgr-btn twmgr-go">▶ Iniciar ciclo</button><button id="twmgr-pd-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-pd-status" class="twmgr-cstatus"></div>' +
        sec('Status por aldeia', '<div id="twmgr-pd-status-list"></div>') +
        modLog('paladin') +
      '</div>' +
      '<div id="twmgr-tab-etiqueta" style="display:none">' +
        hint('🏷️ Usa o recurso <b>nativo</b> do TW (o botão "Etiqueta" da tela de ataques recebidos) pra rotular sozinho a unidade mais lenta provável de cada ataque que vem vindo. Quanto mais cedo depois do envio o check roda, mais precisa fica — o próprio jogo assume que o comando "acabou de sair". Cada comando é etiquetado <b>uma vez só</b>.') +
        cardsDiv('etiqueta') +
        sec('Verificação periódica',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="1 a 3 min pega os ataques recém-enviados com boa precisão. Mais que isso, a adivinhação do jogo piora.">Intervalo (min)</span><input id="twmgr-et-interval" class="twmgr-inp" type="number" min="2" value="3" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-et-start" class="twmgr-btn twmgr-go">▶ Iniciar ciclo</button><button id="twmgr-et-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        modLog('etiqueta') +
      '</div>' +
      '<div id="twmgr-tab-obra" style="display:none">' +
        hint('🏛️ Constrói cada aldeia automaticamente de acordo com o perfil do grupo do TW em que ela estiver. Basta adicionar a aldeia num dos 5 grupos no próprio jogo — o resto é sozinho. <b>Pesquisa do Ferreiro (escolher a tropa) ainda é manual</b>, só o nível do prédio é controlado por aqui.') +
        cardsDiv('obra') +
        sec('1. Grupos por perfil', OBRA_PROFILES.map((p) =>
          '<div class="twmgr-row"><span class="twmgr-lbl">' + esc(OBRA_PROFILE_META[p].name) + '</span><select id="twmgr-ob-g-' + p + '" class="twmgr-inp" style="width:170px"></select></div>'
        ).join('')) +
        sec('2. Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Verificação (min)</span><input id="twmgr-ob-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Fila máx. por aldeia</span><input id="twmgr-ob-max" class="twmgr-inp" type="number" min="1" value="5" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Só constrói se sobrar essa quantidade de CADA recurso depois do gasto — deixa reserva pro Recrutar. 0 = desliga.">Reserva de recurso (0=off)</span><input id="twmgr-ob-reserve" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:80px"></div>') +
        sec('3. Gatilhos (Fazenda/Armazém condicionais)',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Upa Fazenda quando a população livre (máx-atual) cair abaixo disso.">Fazenda: pop. livre mín.</span><input id="twmgr-ob-farmpop" class="twmgr-inp" type="number" min="0" step="50" value="800" style="width:80px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Upa Armazém quando algum recurso atingir esse % da capacidade. Fast Nobre ignora (sobe proativo).">Armazém: % cheio p/ upar</span><input id="twmgr-ob-storagepct" class="twmgr-inp" type="number" min="1" max="100" value="60" style="width:66px"></div>') +
        sec('4. Pesquisa do Ferreiro',
          '<label class="twmgr-check"><input id="twmgr-ob-research" type="checkbox" checked> Pesquisar automaticamente (segue a ordem de cada perfil, pula se faltar prédio ou já tiver pesquisa em andamento)</label>') +
        '<div class="twmgr-actions"><button id="twmgr-ob-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-ob-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        sec('Aguardando recurso', '<div id="twmgr-ob-demand"></div>') +
        modLog('obra') +
      '</div>' +
      '<div id="twmgr-tab-log" style="display:none">' +
      '<div class="twmgr-hint">🤖 Alerta de CAPTCHA: avisa (navegador + ntfy) quando a tela de verificação aparece. O bot-check só surge num F5 — por isso o <b>Auto-F5 AFK</b>: se você ficar X min sem mexer, recarrega a página pra forçar a verificação a aparecer e te chamar.</div>' +
      '<label class="twmgr-check"><input id="twmgr-cap-en" type="checkbox"> Detectar CAPTCHA</label>' +
      '<label class="twmgr-check"><input id="twmgr-cap-brw" type="checkbox"> Notificação do navegador</label>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Tópico ntfy.sh (opcional)</span><input id="twmgr-cap-ntfy" class="twmgr-inp" type="text" placeholder="meu-topico" style="width:120px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl" title="Recarrega a página a cada X min quando você está AFK, pra forçar o bot-check a aparecer e te avisar. 0 = desligado.">Auto-F5 AFK (min, 0=off)</span><input id="twmgr-cap-reload" class="twmgr-inp" type="number" min="0" step="1" value="0" style="width:66px"></div>' +
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
    document.getElementById('twmgr-cap-reload').value = config.captcha.reloadMin != null ? config.captcha.reloadMin : 0;
    const readCapCfg = () => {
      config.captcha.enabled = document.getElementById('twmgr-cap-en').checked;
      config.captcha.browserNotif = document.getElementById('twmgr-cap-brw').checked;
      config.captcha.ntfyTopic = document.getElementById('twmgr-cap-ntfy').value.trim();
      const rm = parseInt(document.getElementById('twmgr-cap-reload').value, 10);
      config.captcha.reloadMin = (isNaN(rm) || rm < 0) ? 0 : rm;
      save();
      startAutoReload();   // aplica o novo intervalo (ou desliga se 0)
    };
    ['twmgr-cap-en', 'twmgr-cap-brw', 'twmgr-cap-ntfy', 'twmgr-cap-reload'].forEach((id) => document.getElementById(id).addEventListener('change', readCapCfg));
    document.getElementById('twmgr-cap-brw').addEventListener('change', async () => { if (document.getElementById('twmgr-cap-brw').checked) await ensureNotifyPermission(); });
    document.getElementById('twmgr-cap-test').addEventListener('click', testCaptchaNotif);

    SCAV_UNITS.forEach(([u]) => { const el = document.getElementById('twmgr-su-' + u); if (el) el.checked = !!(config.scav.units && config.scav.units[u]); });
    document.getElementById('twmgr-scav-unlock').checked = !!config.scav.autoUnlock;
    document.getElementById('twmgr-scav-unlock-ate').value = String(config.scav.unlockAte || 4);
    document.getElementById('twmgr-scav-unlock-puxar').checked = config.scav.unlockPuxar !== false;
    document.getElementById('twmgr-scav-unlock-res').value = config.scav.unlockReserva != null ? config.scav.unlockReserva : 5000;
    document.getElementById('twmgr-scav-unlock-org').value = config.scav.unlockMaxOrigens || 5;
    ['twmgr-scav-unlock', 'twmgr-scav-unlock-ate', 'twmgr-scav-unlock-puxar', 'twmgr-scav-unlock-res', 'twmgr-scav-unlock-org']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readScavUnlockCfg); });
    renderScavFalta();
    document.getElementById('twmgr-scav-maxh').value = config.scav.maxHours || 0;
    document.getElementById('twmgr-scav-maxh').addEventListener('change', readScavUnits);
    document.getElementById('twmgr-scav-start').addEventListener('click', scavStart);
    document.getElementById('twmgr-scav-stop').addEventListener('click', scavStop);
    setScavStatus(config.scav.running);

    document.getElementById('twmgr-farm-wood').value = config.farm.minWood != null ? config.farm.minWood : 1000;
    document.getElementById('twmgr-farm-stone').value = config.farm.minStone != null ? config.farm.minStone : 1000;
    document.getElementById('twmgr-farm-iron').value = config.farm.minIron != null ? config.farm.minIron : 1000;
    document.getElementById('twmgr-farm-dist').value = config.farm.maxDist != null ? config.farm.maxDist : 13;
    document.getElementById('twmgr-farm-wall').value = config.farm.maxWall != null ? config.farm.maxWall : 20;
    document.getElementById('twmgr-farm-bluewall').value = config.farm.blueMaxWall != null ? config.farm.blueMaxWall : 0;
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
    ['twmgr-farm-wood', 'twmgr-farm-stone', 'twmgr-farm-iron', 'twmgr-farm-dist', 'twmgr-farm-wall', 'twmgr-farm-bluewall', 'twmgr-farm-int', 'twmgr-farm-mode', 'twmgr-farm-group', 'twmgr-farm-repeatmin', 'twmgr-farm-mincl', 'twmgr-farm-order', 'twmgr-farm-dyn'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readFarmCfg); });
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
    renderRecruitGroups();
    bindRecruitGroupsHandlers();
    document.getElementById('twmgr-rg-add').addEventListener('click', recruitAddGroup);
    fillGroupSelects();
    document.getElementById('twmgr-r-reload').addEventListener('click', fillGroupSelects);
    document.getElementById('twmgr-r-start').addEventListener('click', recruitStart);
    document.getElementById('twmgr-r-stop').addEventListener('click', recruitStop);
    document.getElementById('twmgr-r-diag').addEventListener('click', runRecruitDiag);
    ['twmgr-r-gatk', 'twmgr-r-gdef', 'twmgr-r-hours', 'twmgr-r-refill'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readRecruitCfg); });
    document.querySelectorAll('.twmgr-ron, .twmgr-rt').forEach((el) => el.addEventListener('change', readRecruitCfg));
    setRecruitStatus(config.recruit.running);

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

    // Blindagem
    const blzUrlEl = document.getElementById('twmgr-blz-url');
    if (blzUrlEl) blzUrlEl.value = config.planner.blindagem.threadUrl || '';
    if (blzUrlEl) blzUrlEl.addEventListener('change', () => { config.planner.blindagem.threadUrl = blzUrlEl.value.trim(); save(); });
    const blzFetchBtn = document.getElementById('twmgr-blz-fetch');
    if (blzFetchBtn) blzFetchBtn.addEventListener('click', async () => {
      const url = (document.getElementById('twmgr-blz-url').value || '').trim();
      if (!url) { pushLog('Blindagem: cole a URL do tópico primeiro.', 'err'); return; }
      config.planner.blindagem.threadUrl = url; save();
      const status = document.getElementById('twmgr-blz-status');
      blzFetchBtn.disabled = true; if (status) status.textContent = '⏳ buscando…';
      try {
        const rows = await blindagemFetch(url);
        if (status) status.textContent = rows.length + ' pedido(s) · atualizado ' + new Date().toLocaleTimeString();
        pushLog('🛡️ Blindagem: ' + rows.length + ' pedido(s) carregado(s).', rows.length ? 'ok' : 'err', 'planner');
      } catch (e) {
        if (status) status.textContent = '⚠ ' + (e.message || e);
        pushLog('🛡️ Blindagem: erro ao buscar (' + (e.message || e) + ').', 'err', 'planner');
      }
      blzFetchBtn.disabled = false;
      renderBlindagemList();
    });
    const blzSendBtn = document.getElementById('twmgr-blz-send');
    if (blzSendBtn) blzSendBtn.addEventListener('click', async () => {
      blzSendBtn.disabled = true;
      try { await blindagemSend(); } catch (e) { pushLog('🛡️ Blindagem erro: ' + (e.message || e), 'err'); }
      blzSendBtn.disabled = false;
      renderBlindagemList();
    });
    renderBlindagemList();

    // ---- Paladino (treino por XP) ----
    document.getElementById('twmgr-pd-interval').value = config.paladin.checkIntervalMin != null ? config.paladin.checkIntervalMin : 240;
    document.getElementById('twmgr-pd-delay').value = config.paladin.sendDelayMs != null ? config.paladin.sendDelayMs : 500;
    renderPaladinVillages();
    renderPaladinStatus();
    ['twmgr-pd-interval', 'twmgr-pd-delay'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readPaladinCfg); });
    document.getElementById('twmgr-pd-start').addEventListener('click', paladinStart);
    document.getElementById('twmgr-pd-stop').addEventListener('click', paladinStop);
    setPaladinStatus(config.paladin.running);

    // ---- Obra (construção por perfil via grupos) ----
    document.getElementById('twmgr-ob-int').value = Math.round((config.obra.interval || 600) / 60);
    document.getElementById('twmgr-ob-max').value = config.obra.maxQueue != null ? config.obra.maxQueue : 5;
    document.getElementById('twmgr-ob-reserve').value = config.obra.reserveMin != null ? config.obra.reserveMin : 0;
    document.getElementById('twmgr-ob-farmpop').value = config.obra.farmFreePopMin != null ? config.obra.farmFreePopMin : 800;
    document.getElementById('twmgr-ob-storagepct').value = config.obra.storageFillPct != null ? config.obra.storageFillPct : 60;
    document.getElementById('twmgr-ob-research').checked = config.obra.autoResearch !== false;
    fillObraGroupSelects();
    renderObraDemand();
    ['twmgr-ob-int', 'twmgr-ob-max', 'twmgr-ob-reserve', 'twmgr-ob-farmpop', 'twmgr-ob-storagepct', 'twmgr-ob-research'].concat(OBRA_PROFILES.map((p) => 'twmgr-ob-g-' + p))
      .forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readObraCfg); });
    document.getElementById('twmgr-ob-start').addEventListener('click', obraStart);
    document.getElementById('twmgr-ob-stop').addEventListener('click', obraStop);
    setObraStatus(config.obra.running);

    document.getElementById('twmgr-mk-destcoords').value = (config.market.destCoords || []).join('\n');
    document.getElementById('twmgr-mk-rwood').value = config.market.reserveWood || 0;
    document.getElementById('twmgr-mk-rstone').value = config.market.reserveStone || 0;
    document.getElementById('twmgr-mk-riron').value = config.market.reserveIron || 0;
    document.getElementById('twmgr-mk-automint').checked = !!config.market.autoMint;
    document.getElementById('twmgr-mk-stopon').checked = !!config.market.cunhagemStopEnabled;
    document.getElementById('twmgr-mk-stophours').value = config.market.cunhagemStopHours != null ? config.market.cunhagemStopHours : 2;
    document.getElementById('twmgr-mk-int').value = Math.round((config.market.interval || 600) / 60);
    document.getElementById('twmgr-mk-thr').value = config.market.thresholdPct != null ? config.market.thresholdPct : 50;
    document.getElementById('twmgr-mk-dist').value = config.market.maxDist != null ? config.market.maxDist : 15;
    document.getElementById('twmgr-mk-sthr').value = config.market.solidarioThresholdPct != null ? config.market.solidarioThresholdPct : 50;
    document.getElementById('twmgr-mk-sdonormin').value = config.market.solidarioDonorMinPct != null ? config.market.solidarioDonorMinPct : 50;
    document.getElementById('twmgr-mk-sdonor').value = config.market.solidarioDonorPct != null ? config.market.solidarioDonorPct : 50;
    document.getElementById('twmgr-mk-sgargalo').value = config.market.solidarioGargaloKeepPct != null ? config.market.solidarioGargaloKeepPct : 90;
    document.getElementById('twmgr-mk-sdist').value = config.market.solidarioMaxDist != null ? config.market.solidarioMaxDist : 20;
    renderMarketCunhagemGroups();
    fillMarketSolidarioGroupSelect();
    ['twmgr-mk-destcoords', 'twmgr-mk-rwood', 'twmgr-mk-rstone', 'twmgr-mk-riron', 'twmgr-mk-automint', 'twmgr-mk-stopon', 'twmgr-mk-stophours', 'twmgr-mk-int', 'twmgr-mk-thr', 'twmgr-mk-dist', 'twmgr-mk-sthr', 'twmgr-mk-sdonormin', 'twmgr-mk-sdonor', 'twmgr-mk-sgargalo', 'twmgr-mk-sdist', 'twmgr-mk-g-solid'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readMarketCfg); });
    // Cada modo tem seu próprio par Iniciar/Parar — rodam independentes, pode ligar vários ao mesmo tempo.
    MARKET_MODES.forEach((mkKey) => {
      document.getElementById('twmgr-mk-' + mkKey + '-start').addEventListener('click', () => marketStart(mkKey));
      document.getElementById('twmgr-mk-' + mkKey + '-stop').addEventListener('click', () => marketStop(mkKey));
      setMarketStatus(mkKey, config.market.modes[mkKey].running);
    });

    document.getElementById('twmgr-bld-max').value = config.build.maxQueue || 5;
    document.getElementById('twmgr-bld-int').value = Math.round((config.build.interval || 600) / 60);
    ['twmgr-bld-max', 'twmgr-bld-int'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readBuildCfg); });
    document.getElementById('twmgr-bld-tpl').addEventListener('change', (e) => bldSwitchProf(e.target.value));
    document.getElementById('twmgr-bld-tpl-new').addEventListener('click', bldNovoModelo);
    document.getElementById('twmgr-bld-tpl-ren').addEventListener('click', bldRenomearModelo);
    document.getElementById('twmgr-bld-tpl-del').addEventListener('click', bldApagarModelo);
    document.getElementById('twmgr-bld-tpl-exp').addEventListener('click', bldExportarModelo);
    document.getElementById('twmgr-bld-tpl-imp').addEventListener('click', bldImportarModelo);
    document.getElementById('twmgr-bld-add').addEventListener('click', bldAddItem);
    document.getElementById('twmgr-bld-reset').addEventListener('click', bldResetDefault);
    document.getElementById('twmgr-bld-clear').addEventListener('click', bldClearAll);
    ['twmgr-bld-farmpct', 'twmgr-bld-storagepct'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => {
        const t = bldTpl(); if (!t) return;
        const v = (x) => Math.max(0, Math.min(99, parseInt(document.getElementById(x).value, 10) || 0));
        t.farmPct = v('twmgr-bld-farmpct'); t.storagePct = v('twmgr-bld-storagepct');
        document.getElementById('twmgr-bld-farmpct').value = t.farmPct;
        document.getElementById('twmgr-bld-storagepct').value = t.storagePct;
        save();
      });
    });
    document.getElementById('twmgr-bld-group').addEventListener('change', (e) => { config.build.filterGroup = e.target.value; save(); bldCarregarAldeias(); });
    document.getElementById('twmgr-bld-vil-reload').addEventListener('click', bldCarregarAldeias);
    document.getElementById('twmgr-bld-mass-go').addEventListener('click', bldAcaoEmMassa);
    bindBuildPlanHandlers();
    bindBuildVillageHandlers();
    bldRenderTplSelect();
    bldSwitchProf(_bldActiveProf);
    renderBuildVillages();
    // ---- Pesquisa ----
    document.getElementById('twmgr-pq-tpl').addEventListener('change', (e) => pesqSwitchTpl(e.target.value));
    document.getElementById('twmgr-pq-tpl-new').addEventListener('click', pesqNovoModelo);
    document.getElementById('twmgr-pq-tpl-ren').addEventListener('click', pesqRenomearModelo);
    document.getElementById('twmgr-pq-tpl-del').addEventListener('click', pesqApagarModelo);
    document.getElementById('twmgr-pq-add-btn').addEventListener('click', pesqAddUnidade);
    document.getElementById('twmgr-pq-reset').addEventListener('click', pesqResetOrdem);
    document.getElementById('twmgr-pq-group').addEventListener('change', (e) => { config.research.filterGroup = e.target.value; save(); pesqCarregarAldeias(); });
    document.getElementById('twmgr-pq-vil-reload').addEventListener('click', pesqCarregarAldeias);
    document.getElementById('twmgr-pq-mass-go').addEventListener('click', pesqAcaoEmMassa);
    document.getElementById('twmgr-pq-feed').checked = config.research.feedOn !== false;
    document.getElementById('twmgr-pq-reserve').value = config.research.feedReserve != null ? config.research.feedReserve : 40;
    document.getElementById('twmgr-pq-dist').value = config.research.feedMaxDist != null ? config.research.feedMaxDist : 20;
    document.getElementById('twmgr-pq-fill').value = config.research.feedFillPct != null ? config.research.feedFillPct : 60;
    document.getElementById('twmgr-pq-int').value = Math.round((config.research.interval || 900) / 60);
    ['twmgr-pq-feed', 'twmgr-pq-reserve', 'twmgr-pq-dist', 'twmgr-pq-fill', 'twmgr-pq-int'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readResearchCfg); });
    bindResearchOrderHandlers();
    bindResearchVillageHandlers();
    pesqRenderTplSelect();
    pesqSwitchTpl(_pesqTplAtivo);
    renderResearchVillages();
    document.getElementById('twmgr-pq-start').addEventListener('click', researchStart);
    document.getElementById('twmgr-pq-stop').addEventListener('click', researchStop);
    setResearchStatus(config.research.running);

    document.getElementById('twmgr-bld-start').addEventListener('click', buildStart);
    document.getElementById('twmgr-bld-stop').addEventListener('click', buildStop);
    setBuildStatus(config.build.running);

    // Bárbaros do Mapa (BM)
    document.getElementById('twmgr-bm-dist').value = config.map.maxDist != null ? config.map.maxDist : 20;
    document.getElementById('twmgr-bm-days').value = config.map.minDaysSinceScout != null ? config.map.minDaysSinceScout : 0;
    document.getElementById('twmgr-bm-ciclo').value = config.map.cicloMin != null ? config.map.cicloMin : 30;
    document.getElementById('twmgr-bm-defmin').value = config.map.defesaMin != null ? config.map.defesaMin : 1;
    document.getElementById('twmgr-bm-rmassist').checked = !!config.map.removerDoAssistente;
    document.getElementById('twmgr-bm-minpts').value = config.map.minPoints != null ? config.map.minPoints : 26;
    document.getElementById('twmgr-bm-maxpts').value = config.map.maxPoints != null ? config.map.maxPoints : 5000;
    document.getElementById('twmgr-bm-maxper').value = config.map.maxPerVillage != null ? config.map.maxPerVillage : 20;
    document.getElementById('twmgr-bm-reserve').value = config.map.spyReserve != null ? config.map.spyReserve : 30;
    document.getElementById('twmgr-bm-spy').value = config.map.spyCount != null ? config.map.spyCount : 1;
    document.getElementById('twmgr-bm-delay').value = config.map.delay != null ? config.map.delay : 500;
    ['twmgr-bm-group', 'twmgr-bm-dist', 'twmgr-bm-days', 'twmgr-bm-minpts', 'twmgr-bm-maxpts', 'twmgr-bm-maxper', 'twmgr-bm-reserve', 'twmgr-bm-spy', 'twmgr-bm-delay', 'twmgr-bm-ciclo', 'twmgr-bm-defmin', 'twmgr-bm-rmassist'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readMapCfg); });
    document.querySelectorAll('.twmgr-bm-sub').forEach((b) => b.addEventListener('click', () => mapMostrarSub(b.getAttribute('data-sub'))));
    document.getElementById('twmgr-bm-reload').addEventListener('click', fillGroupSelects);
    document.getElementById('twmgr-bm-refmap').addEventListener('click', mapRefreshCache);
    document.getElementById('twmgr-bm-preview').addEventListener('click', mapPreview);
    document.getElementById('twmgr-bm-start').addEventListener('click', mapStart);
    document.getElementById('twmgr-bm-stop').addEventListener('click', mapStop);
    document.getElementById('twmgr-et-interval').value = config.etiqueta.intervalMin != null ? config.etiqueta.intervalMin : 2;
    document.getElementById('twmgr-et-interval').addEventListener('change', readEtiquetaCfg);
    document.getElementById('twmgr-et-start').addEventListener('click', etiquetaStart);
    document.getElementById('twmgr-et-stop').addEventListener('click', etiquetaStop);
    setEtiquetaStatus(config.etiqueta.running);
    setMapStatus(config.map.running);
    renderMapPreview();
    renderMapCounts();
    mapMostrarSub('alvos');

    // Cadeado automático
    document.getElementById('twmgr-lk-dist').value = config.lock.maxDist != null ? config.lock.maxDist : 10;
    document.getElementById('twmgr-lk-pts').value = config.lock.minPoints != null ? config.lock.minPoints : 500;
    document.getElementById('twmgr-lk-int').value = Math.round((config.lock.interval || 1800) / 60);
    ['twmgr-lk-dist', 'twmgr-lk-pts', 'twmgr-lk-int'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readLockCfg); });
    document.getElementById('twmgr-lk-start').addEventListener('click', lockStart);
    document.getElementById('twmgr-lk-stop').addEventListener('click', lockStop);
    setLockStatus(config.lock.running);

    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.getAttribute('data-tab'))));
    // Abrir/fechar as telas de modelo. Fechar sempre re-renderiza a tabela de aldeias, porque
    // criar/apagar modelo muda o que a coluna Modelo mostra.
    const abreTela = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'flex'; };
    const fechaTela = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
    document.getElementById('twmgr-bld-abrir-tpl').addEventListener('click', () => abreTela('twmgr-tela-tpl-build'));
    document.getElementById('twmgr-bld-fechar-tpl').addEventListener('click', () => { fechaTela('twmgr-tela-tpl-build'); renderBuildVillages(); });
    document.getElementById('twmgr-pq-abrir-tpl').addEventListener('click', () => abreTela('twmgr-tela-tpl-pq'));
    document.getElementById('twmgr-pq-fechar-tpl').addEventListener('click', () => { fechaTela('twmgr-tela-tpl-pq'); renderResearchVillages(); });
    document.querySelectorAll('[data-sub-farm]').forEach((b) => b.addEventListener('click', () => showFarmSub(b.getAttribute('data-sub-farm'))));
    // Toggle expandir/recolher o log por módulo
    document.querySelectorAll('.twmgr-modlog-head').forEach((h) => h.addEventListener('click', () => {
      const mod = h.getAttribute('data-modlog'); const body = document.getElementById('twmgr-modlog-body-' + mod); if (!body) return;
      const open = body.style.display !== 'none'; body.style.display = open ? 'none' : 'block';
      h.textContent = ''; h.insertAdjacentHTML('beforeend', (open ? '▸' : '▾') + ' Log do módulo (<span id="twmgr-modlog-count-' + mod + '">0</span>)');
      renderModLog(mod);
    }));
    // Cards + logs por módulo no estado inicial (dados salvos do último ciclo)
    ['scav', 'farm', 'wall', 'recruit', 'market', 'build', 'research', 'lock', 'planner', 'paladin', 'etiqueta', 'obra'].forEach((m) => { refreshCards(m); renderModLog(m); });
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
    initPanelResize(p);

    let subIni = 'farm';
    try { const sv = localStorage.getItem(FARM_SUB_KEY); if (['farm', 'wall', 'map'].indexOf(sv) >= 0) subIni = sv; } catch (e) {}
    showFarmSub(subIni);
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

    // RETOMADA ESCALONADA. Antes, todo módulo ligado retomava em t=0 — e cinco deles
    // chamam o próprio ciclo direto, disparando na hora. O painel de rede do usuário
    // mostrou três requisições nossas tomando 429 no carregamento da página, junto com as
    // 128 que o próprio jogo já faz pra montar a tela. A rajada era garantida.
    //
    // Agora cada módulo entra com alguns segundos de diferença. O primeiro espera um
    // pouco de propósito: a página ainda está carregando os recursos dela, e é o pior
    // momento possível pra competir por banda e por limite de requisição.
    const RETOMA_INICIAL_MS = 6000, RETOMA_ESPACO_MS = 4000;
    let _retomaN = 0;
    const retomar = (fn) => {
      const atraso = RETOMA_INICIAL_MS + (_retomaN++) * RETOMA_ESPACO_MS;
      setTimeout(() => { try { fn(); } catch (e) { console.warn('[TWMgr] retomada falhou:', e); } }, atraso);
    };

    if (config.running) { rlog('Auto-ATK retomado.'); retomar(processDue); }
    if (config.scav.running) { rlog('Coleta retomada.', 'scav'); retomar(scheduleScav); }
    if (config.farm.running) { rlog('Saque retomado.', 'farm'); retomar(scheduleFarm); }
    if (config.wall.running) { rlog('Muralha retomada.', 'wall'); retomar(scheduleWall); }
    if (config.recruit.running) { rlog('Recrutar retomado.', 'recruit'); retomar(scheduleRecruit); }
    MARKET_MODES.forEach((mkKey) => { if (config.market.modes[mkKey].running) { rlog('Mercado (' + MARKET_MODE_LABEL[mkKey] + ') retomado.', 'market'); retomar(() => scheduleMarket(mkKey)); } });
    if (config.build.running) { rlog('Construções retomado.', 'build'); retomar(scheduleBuild); }
    if (config.research && config.research.running) { rlog('Pesquisa retomada.', 'research'); retomar(scheduleResearch); }
    if (config.map && config.map.running) { rlog('Mapa retomado.', 'map'); retomar(scheduleMap); }
    if (config.etiqueta && config.etiqueta.running) { rlog('🏷️ Etiqueta retomada.', 'etiqueta'); retomar(etiquetaTick); }
    if (config.lock && config.lock.running) { rlog('🔒 Cadeado retomado.', 'lock'); retomar(scheduleLock); }
    if (config.planner && config.planner.attacks && config.planner.attacks.some((a) => a.running)) {
      config.planner.attacks.forEach((atk) => { if (!atk.running) return; (atk.rows || []).forEach((r) => { if (r.state === 'scheduled') r.state = 'armed'; }); });
      rlog('🎯 Coordenado retomado.', 'planner');
      retomar(plannerTick);
    }
    if (config.paladin && config.paladin.running) { rlog('Paladino retomado.', 'paladin'); retomar(paladinTick); }
    if (config.obra && config.obra.running) { rlog('🏛️ Obra retomada.', 'obra'); retomar(obraTick); }
    closeStaleLiveLogs();   // barra de progresso de ciclo que morreu no reload desta página
    installBotHooks();
    startCaptchaWatcher();
    startAutoReload();
  }

  // Largura do painel — 640px de padrão, mas as tabelas (aldeias, planos) pedem mais em tela grande
  // e menos em notebook. Arrastar a borda ESQUERDA redimensiona; a largura fica salva por navegador,
  // fora do config do jogo (é preferência de tela, não de conta — não faz sentido sincronizar).
  const PANEL_W_KEY = 'twMgr_panelW', PANEL_W_MIN = 380;
  function initPanelResize(panel) {
    try {
      const salvo = parseInt(localStorage.getItem(PANEL_W_KEY), 10);
      if (salvo >= PANEL_W_MIN) panel.style.width = Math.min(salvo, window.innerWidth - 24) + 'px';
    } catch (e) {}
    const grip = document.getElementById('twmgr-grip'); if (!grip) return;
    let arrasta = false, x0 = 0, w0 = 0, dir0 = 0;
    grip.addEventListener('mousedown', (e) => {
      const r = panel.getBoundingClientRect();
      arrasta = true; x0 = e.clientX; w0 = r.width; dir0 = r.right;
      document.body.style.userSelect = 'none';
      e.preventDefault(); e.stopPropagation();   // senão o makeDraggable do cabeçalho também morde
    });
    document.addEventListener('mousemove', (e) => {
      if (!arrasta) return;
      const w = Math.max(PANEL_W_MIN, Math.min(window.innerWidth - 24, w0 + (x0 - e.clientX)));
      panel.style.width = w + 'px';
      // Se o painel foi arrastado, ele está ancorado pela ESQUERDA — sem reposicionar, mexer na
      // borda esquerda cresceria pro lado errado. Fixa a borda direita e deixa a esquerda andar.
      if (panel.style.right === 'auto') panel.style.left = (dir0 - w) + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!arrasta) return;
      arrasta = false; document.body.style.userSelect = '';
      try { localStorage.setItem(PANEL_W_KEY, String(Math.round(panel.getBoundingClientRect().width))); } catch (e) {}
    });
  }

  function makeDraggable(panel, handle) {
    let sx, sy, ox, oy, drag = false;
    // Exceção pela ÁREA, não pela lista de ids: a lista antiga não tinha o botão da
    // Central, então clicar nele iniciava um arrasto e o `right:auto` jogava o painel pra
    // esquerda — parecia que o botão só funcionava depois de o painel se mexer. Excluir o
    // bloco de ações inteiro resolve pra qualquer botão que venha depois.
    handle.addEventListener('mousedown', (e) => { if (e.target.closest('#twmgr-head-actions')) return; drag = true; sx = e.clientX; sy = e.clientY; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; panel.style.right = 'auto'; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => { if (!drag) return; panel.style.left = (ox + e.clientX - sx) + 'px'; panel.style.top = (oy + e.clientY - sy) + 'px'; });
    document.addEventListener('mouseup', () => { drag = false; });
  }

  // ==================== DESVIAR (esvaziar aldeia com apoio-fantasma) ====================
  // Botão em cada linha de incoming: envia todas as tropas (menos exploradores) como APOIO pra
  // aldeia mais próxima e agenda o CANCELAMENTO desse apoio pra logo após o ataque bater.
  // Tropas em rota de retorno estão seguras — o inimigo saqueia aldeia vazia.

  // Helpers -----------------------------------------------------------------
  const desviarCoordDist = (a, b) => { const [ax, ay] = a.split('|').map(Number); const [bx, by] = b.split('|').map(Number); return Math.hypot(ax - bx, ay - by); };

  // Candidatas a destino do apoio, da mais PERTO pra mais longe.
  // A escolha final depende da janela de tempo: o apoio não pode POUSAR antes da hora de voltar,
  // senão não há o que cancelar. Quem chama testa a duração real que o jogo devolve na confirmação.
  async function desviarCandidatos(originVid) {
    const vils = await getAllVillagesCached();
    const origin = vils.find((v) => String(v.vid) === String(originVid));
    if (!origin || !origin.coord) throw new Error('aldeia origem sem coord (' + originVid + ')');
    return vils
      .filter((v) => String(v.vid) !== String(originVid) && v.coord)
      .map((v) => ({ v: v, d: desviarCoordDist(origin.coord, v.coord) }))
      .sort((a, b) => a.d - b.d)
      .map((o) => o.v);
  }
  async function pickNearestOwnVillage(originVid) {
    const cands = await desviarCandidatos(originVid);
    if (!cands.length) throw new Error('nenhuma outra aldeia sua encontrada');
    return cands[0];   // { vid, name, coord }
  }

  // Depois de enviar o apoio, procura o cmd_id do apoio recém-saído da aldeia originVid.
  // Estratégia: lê /screen=place&mode=units da origem e pega comando "out" mais recente cujo
  // destino bate com o coord esperado. Se o servidor não expõe cmd_id lá, cai pro overview.
  async function findLatestSupportCommand(originVid, targetCoord) {
    try {
      // Tentativa 1: overview_villages&mode=commands na origem (mais confiável)
      const res = await fetch('/game.php?village=' + originVid + '&screen=overview_villages&mode=commands&page=-1&_=' + Date.now(),
        { credentials: 'include', cache: 'no-store' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      // Cada comando tem link tipo /game.php?...&screen=info_command&id=NNN
      let bestId = null, bestTs = -Infinity;
      doc.querySelectorAll('a[href*="screen=info_command"]').forEach((a) => {
        const href = a.getAttribute('href') || '';
        const idm = href.match(/[?&]id=(\d+)/); if (!idm) return;
        const id = idm[1];
        const row = a.closest('tr'); if (!row) return;
        // Confirma que destino é o targetCoord
        const txt = row.textContent || '';
        if (targetCoord && txt.indexOf(targetCoord) < 0) return;
        // Ignora comandos que já são "return" (retorno) — só queremos o support outgoing
        if (row.querySelector('img[src*="return"]')) return;
        // pega ts do timer se possível — senão usa maior id como proxy (id cresce com o tempo)
        const idNum = parseInt(id, 10);
        if (idNum > bestTs) { bestTs = idNum; bestId = id; }
      });
      return bestId;
    } catch (e) { return null; }
  }

  // O comando ainda existe na lista de saídas da aldeia? É a ÚNICA prova de cancelamento que vale.
  async function comandoAindaExiste(vid, cmdId) {
    const r = await fetch('/game.php?village=' + vid + '&screen=overview_villages&mode=commands&page=-1&_=' + Date.now(),
      { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ao reler os comandos');
    const html = await r.text();
    if (!/screen=info_command|commands_table/.test(html)) throw new Error('resposta não parece a tela de comandos');
    return new RegExp('[?&]id=' + cmdId + '\\b').test(html);
  }

  // Cancela e CONFIRMA. Antes isto era `if (r.ok) return true` — mas o TW responde HTTP 200 com
  // página de erro quando o id/token não serve ou o comando já pousou. O log dizia "Desvio OK" e
  // o exército continuava fora de casa. Agora só devolve sucesso se o comando sumiu da lista.
  async function cancelCommand(vid, cmdId) {
    const tentativas = [
      () => fetch('/game.php?village=' + vid + '&screen=info_command&id=' + cmdId + '&action=cancel&h=' + window.game_data.csrf,
        { credentials: 'include', cache: 'no-store', redirect: 'follow' }),
      () => { const p = new URLSearchParams(); p.set('h', window.game_data.csrf);
        return fetch('/game.php?village=' + vid + '&screen=info_command&id=' + cmdId + '&action=cancel',
          { method: 'POST', credentials: 'include', body: p.toString() }); },
    ];
    let ultimoErro = '';
    for (const tentar of tentativas) {
      try { await tentar(); } catch (e) { ultimoErro = String(e.message || e); continue; }
      await sleep(700);   // o servidor precisa registrar antes da releitura
      try {
        if (!(await comandoAindaExiste(vid, cmdId))) return true;   // sumiu = cancelado de verdade
        ultimoErro = 'o comando continua na lista';
      } catch (e) { ultimoErro = String(e.message || e); }
    }
    throw new Error('não consegui confirmar o cancelamento (' + (ultimoErro || 'motivo desconhecido') + ')');
  }

  // ---- Agendamento robusto (padrão observado no Nexus) --------------------------------------
  // setTimeout longo não é confiável: o navegador estrangula o timer quando a aba vai pro fundo e
  // o disparo escorrega — pode ser em minutos. Corta em blocos de 30s e reagenda; o último bloco é
  // sempre curto, então o erro fica limitado ao último trecho.
  const _desvTimers = {};
  function desvAgendar(id, ms, fn) {
    clearTimeout(_desvTimers[id]);
    const BLOCO = 30000;
    if (ms <= BLOCO) { _desvTimers[id] = setTimeout(fn, Math.max(0, ms)); return; }
    _desvTimers[id] = setTimeout(() => desvAgendar(id, ms - BLOCO, fn), BLOCO);
  }
  function desvCancelarAgendamento(id) { clearTimeout(_desvTimers[id]); delete _desvTimers[id]; }
  // Aba oculta tem timer estrangulado: acorda mais cedo pra ter folga. Mesma ideia do
  // FINAL_COUNTDOWN_BUFFER (5s) x BACKGROUND (30s) do Nexus.
  function desvFolga() { return (typeof document !== 'undefined' && document.hidden) ? 30000 : 5000; }
  // Há algum desvio pra sair nos próximos N ms? O Auto-F5 consulta isto pra não recarregar a
  // página em cima de um envio agendado.
  function desviarSaidaProxima(janelaMs) {
    const lim = serverNow() + (janelaMs || 60000);
    return (config.desviar.pending || []).some((p) => p.state === 'waiting' && p.sendAt && p.sendAt <= lim);
  }

  function scheduleDesviarCancel(item) {
    const delay = Math.max(0, item.cancelAt - serverNow());
    desvAgendar(item.id + ':cancel', delay, async () => {
      const cur = (config.desviar.pending || []).find((x) => x.id === item.id);
      if (!cur || cur.state !== 'scheduled') return;
      try {
        await cancelCommand(cur.vid, cur.cmdId);   // lança se não conseguir CONFIRMAR
        cur.state = 'canceled'; cur.err = '';
      } catch (e) { cur.state = 'failed'; cur.err = e.message || String(e); }
      save();
      if (cur.state === 'canceled') {
        pushLog('🚨 Desvio OK — tropa voltando (aldeia ' + cur.vid + ', comando ' + cur.cmdId + ').', 'ok', 'desv');
      } else {
        // Falha aqui = tropa FORA DE CASA. Tem que gritar, não virar uma linha discreta.
        pushLog('🚨 DESVIO FALHOU — a tropa da aldeia ' + cur.vid + ' NÃO voltou: ' + cur.err
          + '. Cancele o comando ' + cur.cmdId + ' na mão, agora.', 'err', 'desv');
        if (config.captcha && config.captcha.enabled) { try { fireCaptchaNotification('desvio-falhou/' + cur.vid, true); } catch (e2) {} }
      }
      desviarRefreshRowStates();
    });
  }

  // Motor principal
  // ---- Marcação e plano por aldeia -----------------------------------------------------------
  // Marcar NÃO envia. O envio é agendado pra sair `sendBeforeMs` antes do PRIMEIRO ataque marcado
  // daquela aldeia, e o retorno pra depois do ÚLTIMO. Assim a tropa fica fora o mínimo necessário
  // — antes o clique enviava na hora e ela passava horas fora, com o apoio pousando no vizinho.
  function desviarMarcas(coord) {
    return (config.desviar.marks || []).filter((m) => m.coord === coord).sort((a, b) => a.arriveAt - b.arriveAt);
  }
  function desviarPlanoDe(coord) {
    const ms = desviarMarcas(coord);
    if (!ms.length) return null;
    return {
      coord: coord,
      vid: ms[0].vid,
      primeiro: ms[0].arriveAt,
      ultimo: ms[ms.length - 1].arriveAt,
      qtd: ms.length,
      sendAt: ms[0].arriveAt - (config.desviar.sendBeforeMs || 30000),
      cancelAt: ms[ms.length - 1].arriveAt + (config.desviar.cancelOffsetMs || 5000),
    };
  }
  function desviarPendenteDe(coord) {
    return (config.desviar.pending || []).find((p) => p.coordOrigem === coord && (p.state === 'waiting' || p.state === 'scheduled'));
  }
  // (Re)agenda a saída da aldeia conforme as marcas atuais. Chamado ao marcar, ao desmarcar e no boot.
  function desviarReplanejar(coord) {
    const plano = desviarPlanoDe(coord);
    let pend = desviarPendenteDe(coord);
    if (!plano) {
      if (pend && pend.state === 'waiting') {
        desvCancelarAgendamento(pend.id);
        config.desviar.pending = config.desviar.pending.filter((p) => p.id !== pend.id);
        save();
      }
      return;
    }
    if (pend && pend.state === 'scheduled') return;   // já saiu de casa; o retorno manda agora
    if (!pend) {
      pend = { id: 'd' + Date.now() + Math.random().toString(36).slice(2, 6),
               vid: String(plano.vid), coordOrigem: coord, supportVid: '', supportCoord: '',
               cmdId: '', sendAt: plano.sendAt, cancelAt: plano.cancelAt,
               ultimoAtaque: plano.ultimo, state: 'waiting', err: '' };
      config.desviar.pending.push(pend);
    } else {
      pend.sendAt = plano.sendAt; pend.cancelAt = plano.cancelAt; pend.ultimoAtaque = plano.ultimo;
    }
    save();
    const falta = pend.sendAt - serverNow();
    if (falta < -60000) {
      pend.state = 'failed'; pend.err = 'a hora de sair já passou (aba fechada?)';
      save();
      pushLog('🚨 Desvio ' + coord + ': a hora de sair (' + new Date(pend.sendAt).toLocaleTimeString() + ') já passou — NÃO enviei. Desvie na mão se ainda der.', 'err', 'desv');
      return;
    }
    desvAgendar(pend.id, Math.max(0, falta), () => { desviarExecutarSaida(pend.id); });
    pushLog('🚨 Desvio ' + coord + ' armado: ' + plano.qtd + ' ataque(s) marcado(s) · sai às '
      + new Date(pend.sendAt).toLocaleTimeString() + ' · volta às ' + new Date(pend.cancelAt).toLocaleTimeString(), 'ok', 'desv');
    desviarRefreshRowStates();
  }
  async function desviarExecutarSaida(pendId) {
    const pend = (config.desviar.pending || []).find((p) => p.id === pendId);
    if (!pend || pend.state !== 'waiting') return;
    return ocupado(() => _desviarSair(pend));
  }

  // A saída de casa, na hora agendada.
  async function _desviarSair(pend) {
    try {
      const destino = await pickNearestOwnVillage(pend.vid);
      if (!destino || !destino.coord) throw new Error('destino sem coord');
      const [dx, dy] = destino.coord.split('|');

      // getVillageStateReserved, não getVillageState: era o único módulo que lia a tropa CRUA e
      // levava junto o que o Coordenado tinha reservado pra um ataque armado.
      const state = await getVillageStateReserved(pend.vid);
      const amounts = {};
      UNITS.forEach(([u]) => {
        if (u === 'spy' && config.desviar.keepSpy) return;
        if (u === 'knight' && config.desviar.keepKnight) return;
        if (u === 'snob') return;
        const n = (state.avail && state.avail[u]) || 0;
        if (n > 0) amounts[u] = n;
      });
      if (!Object.keys(amounts).length) throw new Error('sem tropas em casa pra desviar');

      const durSeg = await sendAttack(pend.vid, dx, dy, amounts, 'support');
      await sleep(700);   // dá tempo do server registrar o cmd
      const cmdId = await findLatestSupportCommand(pend.vid, destino.coord);
      if (!cmdId) throw new Error('o apoio saiu mas não achei o comando — cancele na mão');

      pend.supportVid = String(destino.vid); pend.supportCoord = destino.coord;
      pend.cmdId = cmdId; pend.state = 'scheduled';

      // O apoio não pode POUSAR antes da hora de voltar — comando que chegou não se cancela.
      // Com a saída 30s antes do ataque, a janela é de segundos e qualquer vizinha está a minutos,
      // então isto praticamente nunca dispara. Fica como rede.
      const pousoEm = durSeg ? (serverNow() + durSeg * 1000) : null;
      if (pousoEm && pend.cancelAt > pousoEm - 20000) {
        pend.cancelAt = pousoEm - 20000;
        pushLog('🚨 Desvio ' + pend.coordOrigem + ': o apoio pousaria antes da volta; antecipei o cancelamento pra '
          + new Date(pend.cancelAt).toLocaleTimeString() + '.', '', 'desv');
      }
      save();
      pushLog('🚨 Desvio ' + pend.coordOrigem + ': tropa FORA (' + Object.entries(amounts).map(([u, n]) => n + ' ' + u).join(', ')
        + ' → ' + destino.coord + ') · volta às ' + new Date(pend.cancelAt).toLocaleTimeString(), 'ok', 'desv');
      scheduleDesviarCancel(pend);
      desviarRefreshRowStates();
      return pend;
    } catch (e) {
      pend.state = 'failed'; pend.err = e.message || String(e); save();
      // Falhar AQUI significa que a tropa continua em casa e o ataque vai bater nela.
      pushLog('🚨 DESVIO NÃO SAIU — ' + pend.coordOrigem + ': ' + pend.err + '. A tropa está em casa e o ataque vem aí.', 'err', 'desv');
      if (config.captcha && config.captcha.enabled) { try { fireCaptchaNotification('desvio-nao-saiu/' + pend.coordOrigem, true); } catch (e2) {} }
      desviarRefreshRowStates();
      throw e;
    }
  }

  // UI ---- injeção na tela de incomings ----
  const DESV_ROW_COLORS = {
    marked:    'rgba(120,180,255,.28)',   // azul: marcado, ainda não saiu
    waiting:   'rgba(120,180,255,.28)',   // azul: saída agendada
    scheduled: 'rgba(140,220,140,.35)',   // verde: tropa fora de casa
    canceling: 'rgba(255,225,120,.35)',   // amarelo
    canceled:  'rgba(180,180,180,.25)',   // cinza: voltou
    failed:    'rgba(255,120,120,.30)',   // vermelho suave
  };

  function desviarMarcado(coord, arriveMs) {
    return (config.desviar.marks || []).some((m) => m.coord === coord && Math.abs(m.arriveAt - arriveMs) < 2000);
  }

  function desviarRefreshRowStates() {
    const hm = (t) => new Date(t).toLocaleTimeString();
    document.querySelectorAll('tr[data-twmgr-desv-coord]').forEach((tr) => {
      const coord = tr.getAttribute('data-twmgr-desv-coord');
      const arriveMs = parseInt(tr.getAttribute('data-twmgr-desv-arr'), 10);
      const btn = tr.querySelector('.twmgr-desviar-btn'); if (!btn) return;
      const marcado = desviarMarcado(coord, arriveMs);
      const pend = desviarPendenteDe(coord)
        || (config.desviar.pending || []).find((p) => p.coordOrigem === coord && (p.state === 'canceled' || p.state === 'failed'));
      if (!marcado && !pend) { tr.style.background = ''; btn.textContent = '🔄 Desviar'; btn.disabled = false; return; }
      const st = pend ? pend.state : 'marked';
      tr.style.background = DESV_ROW_COLORS[st] || '';
      // O rótulo mostra o PLANO da aldeia inteira: várias linhas marcadas compartilham uma só saída.
      btn.textContent = {
        marked:    '✓ marcado',
        waiting:   pend ? ('⏱ sai ' + hm(pend.sendAt)) : '⏱ agendado',
        scheduled: pend ? ('🚀 fora · volta ' + hm(pend.cancelAt)) : '🚀 fora',
        canceled:  '✓ voltou',
        failed:    '✗ falhou',
      }[st] || st;
      // Marcado ou esperando ainda dá pra desmarcar; depois que a tropa saiu, não.
      btn.disabled = (st === 'scheduled' || st === 'canceled');
    });
  }

  // Parseia horário de chegada da coluna "Chegada" da tabela do TW.
  // Formatos: "hoje às 14:06:31:584" ou "amanhã às 02:05:31:197" ou "20/07/2026 às 15:30:00".
  function desviarParseArriveAt(text) {
    if (!text) return 0;
    const clean = text.replace(/\s+/g, ' ').trim();
    // extrai HH:MM:SS(:mmm)?
    const m = clean.match(/(\d{1,2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/);
    if (!m) return 0;
    const [_, hh, mm, ss, ms] = m;
    // A tabela mostra o relógio DO SERVIDOR. Antes isto montava um Date local e o resultado era
    // comparado com serverNow() — erro do tamanho do fuso do navegador, ou seja, horas.
    // Agora usa a data do servidor (#serverDate) como base e converte com arrivalToServerMs(),
    // o mesmo caminho que o resto do script já usa pra horário de chegada.
    const ed = document.querySelector('#serverDate');
    const base = ed ? (ed.textContent || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/) : null;
    const hoje = new Date();
    let Y = base ? +base[3] : hoje.getFullYear();
    let M = base ? +base[2] - 1 : hoje.getMonth();
    let D = base ? +base[1] : hoje.getDate();
    const dExp = clean.match(/(\d{1,2})[/](\d{1,2})[/](\d{4})/);
    if (dExp) { D = +dExp[1]; M = +dExp[2] - 1; Y = +dExp[3]; }
    else if (/amanh[aã]/i.test(clean)) D += 1;
    const montar = (dia) => arrivalToServerMs(new Date(Y, M, dia, +hh, +mm, +ss, ms ? +ms : 0));
    let alvo = montar(D);
    // "hoje" com horário que já passou = a lista virou a meia-noite entre a leitura e agora
    if (!dExp && /hoje/i.test(clean) && alvo < serverNow() - 3600000) alvo = montar(D + 1);
    return alvo;   // na escala de serverNow(), que é a usada em cancelAt
  }

  function enhanceIncomingsPage() {
    const gd = window.game_data;
    if (!gd || gd.screen !== 'overview_villages' || gd.mode !== 'incomings') return;
    const table = document.getElementById('incomings_table'); if (!table) return;
    if (table.hasAttribute('data-twmgr-desv-enhanced')) return;
    table.setAttribute('data-twmgr-desv-enhanced', '1');

    // Adiciona header
    const thead = table.querySelector('tr:first-child'); if (!thead) return;
    // Índice da coluna DESTINO pelo texto do cabeçalho. Antes a aldeia atacada era pega com
    // `tr.querySelector('.quickedit[data-id]')` — mas neste mundo o único quickedit da linha está
    // na célula "Ataque" e o data-id dela é o ID DO COMANDO (ex.: 547545962), não da aldeia.
    // O botão sempre falhava com "aldeia origem sem coord". Ancorar no cabeçalho também sobrevive
    // a reordenação de coluna, que a leitura por posição fixa não sobreviveria.
    let colDestino = -1;
    Array.from(thead.querySelectorAll('th, td')).forEach((c, i) => {
      if (colDestino < 0 && /destino/i.test((c.textContent || ''))) colDestino = i;
    });
    const th = document.createElement('th'); th.textContent = 'Desviar'; th.style.whiteSpace = 'nowrap';
    thead.appendChild(th);
    if (colDestino < 0) { pushLog('Desviar: não achei a coluna "Destino" no cabeçalho — botões desativados.', 'err', 'desv'); return; }

    // Adiciona célula em cada linha de incoming
    table.querySelectorAll('tr').forEach((tr) => {
      if (tr === thead) return;
      // Ignora linhas de rodapé (têm colspan)
      if (tr.querySelector('th[colspan], td[colspan]')) { const td = document.createElement('td'); tr.appendChild(td); return; }
      // Destino = a MINHA aldeia que está sendo atacada. Vem da coluna Destino, pela coordenada
      // (o vid é resolvido depois, na hora do clique, contra a lista de aldeias).
      const tdsAll = tr.querySelectorAll('td');
      const cel = tdsAll[colDestino];
      const cm = cel ? (cel.textContent || '').match(/(\d{1,3})\|(\d{1,3})/) : null;
      if (!cm) { const td = document.createElement('td'); tr.appendChild(td); return; }
      const coordDestino = cm[1] + '|' + cm[2];
      // Chegada: procurar a última td com texto tipo "hoje às HH:MM:SS"
      let arriveMs = 0;
      const tds = tr.querySelectorAll('td');
      for (const td of tds) {
        const t = td.textContent || '';
        if (/(hoje|amanh[aã]|\d{1,2}[/]\d{1,2}[/]\d{4}) [aàáç]s /i.test(t) && /:\d{2}/.test(t)) { arriveMs = desviarParseArriveAt(t); break; }
      }
      tr.setAttribute('data-twmgr-desv-coord', coordDestino);
      tr.setAttribute('data-twmgr-desv-arr', String(arriveMs));

      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.className = 'btn twmgr-desviar-btn';
      btn.textContent = '🔄 Desviar';
      btn.style.whiteSpace = 'nowrap';
      // Clicar MARCA (ou desmarca). O envio é agendado pra sair pouco antes do primeiro ataque
      // marcado da aldeia — clicar não tira tropa de casa na hora.
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        try {
          if (desviarMarcado(coordDestino, arriveMs)) {
            config.desviar.marks = (config.desviar.marks || [])
              .filter((m) => !(m.coord === coordDestino && Math.abs(m.arriveAt - arriveMs) < 2000));
            save();
            desviarReplanejar(coordDestino);
            if (!desviarMarcas(coordDestino).length) pushLog('🚨 Desvio ' + coordDestino + ': desmarcado.', '', 'desv');
            desviarRefreshRowStates();
            return;
          }
          if (!arriveMs) throw new Error('não consegui ler o horário de chegada desta linha');
          btn.textContent = '⏳…';
          const vils = await getAllVillagesCached();
          const minha = vils.find((v) => v.coord === coordDestino);
          if (!minha) throw new Error('a aldeia ' + coordDestino + ' não está na sua lista de aldeias');
          config.desviar.marks = config.desviar.marks || [];
          config.desviar.marks.push({ id: 'm' + Date.now() + Math.random().toString(36).slice(2, 5),
                                      coord: coordDestino, vid: String(minha.vid), arriveAt: arriveMs });
          save();
          desviarReplanejar(coordDestino);
          desviarRefreshRowStates();
        } catch (e) {
          btn.textContent = '🔄 Desviar';
          alert('Desvio falhou: ' + (e.message || e));
        }
      });
      td.appendChild(btn);
      tr.appendChild(td);
    });

    // Aplica cores conforme estado persistido
    desviarRefreshRowStates();
    // Refresh periódico das cores (o estado muda quando o cancel dispara)
    setInterval(desviarRefreshRowStates, 2000);
  }

  // Retomada pós reload. É a parte que sustenta o modelo: como o envio agora é AGENDADO (e não
  // imediato), a página recarregar entre a marcação e a saída não pode perder o compromisso.
  function desviarResumeAll() {
    const agora = serverNow();
    // 1) tropa já fora: só reagenda a volta
    (config.desviar.pending || []).forEach((item) => {
      if (item.state === 'scheduled') scheduleDesviarCancel(item);
    });
    // 2) saída ainda por vir: reagenda a partir das marcas (que sobrevivem no localStorage)
    const coords = {};
    (config.desviar.marks || []).forEach((m) => { coords[m.coord] = 1; });
    Object.keys(coords).forEach((coord) => {
      const pend = desviarPendenteDe(coord);
      if (pend && pend.state === 'scheduled') return;
      desviarReplanejar(coord);
    });
    // 3) faxina: marcas de ataques que já bateram há mais de 1h não servem mais pra nada
    const antes = (config.desviar.marks || []).length;
    config.desviar.marks = (config.desviar.marks || []).filter((m) => m.arriveAt > agora - 3600000);
    config.desviar.pending = (config.desviar.pending || []).filter((p) => (p.cancelAt || p.sendAt || 0) > agora - 6 * 3600000);
    if (antes !== config.desviar.marks.length) save();
  }

  // ==================== MAPA — filtros e badges na tela do jogo ====================
  // Enriquece screen=map com painel de controle (só bárbaros / só minhas / só tribo / filtro por
  // pontos), atenua aldeias fora do filtro (opacity, sem quebrar clique) e badge de pontos.

  let _mapVilCache = null;        // Map: vid -> { x, y, playerId, points }
  let _mapPlayerCache = null;     // Map: playerId -> { name, tribeId }
  const MY_PLAYER_ID = (window.game_data && window.game_data.player && String(window.game_data.player.id)) || '';
  const MY_TRIBE_ID = (window.game_data && window.game_data.player && String(window.game_data.player.ally)) || '0';

  // Falha do player.txt some da tela se ninguém contar: sem ele não dá pra distinguir tribo de
  // inimigo e mapCategoryOf devolve 'enemy' pra todo mundo — com o filtro de inimigo desligado, a
  // tribo inteira desaparece do mapa sem explicação. Fica registrado pra o painel avisar.
  let _mapPlayerFalhou = false;
  let _mapProxTentativa = 0;   // recuo apos 429 nos arquivos de mapa

  async function loadMapData(force) {
    // O guard antigo era `_mapVilCache && age < 6h`, e _mapVilCache é variável de módulo: sempre
    // null depois de um F5. Ou seja, o TTL de 6h persistido em dataCachedAt nunca teve efeito e
    // TODA visita ao mapa rebaixava village.txt + player.txt inteiros — com cache:'no-store', que
    // proíbe até revalidação. Guardar megabytes no localStorage não cabe (limite de ~5MB), então
    // quem faz o cache é o navegador: sem no-store ele revalida e responde 304 na maioria das vezes.
    if (!force && _mapVilCache) return;
    // Cada fetch independente — village.txt é essencial, player.txt é opcional (só distingue tribo/inimigo).
    // TW às vezes rate-limita player.txt (429) — não pode bloquear a feature.
    // RECUO APOS 429. village.txt e player.txt sao os maiores downloads do script — podem
    // ter megabytes. Sem recuo, TODA pagina aberta tentava de novo os dois e falhava de
    // novo, alimentando o proprio rate limit que causava a falha.
    if (!force && Date.now() < _mapProxTentativa) return;
    let bateu429 = false;
    const fetchTxt = async (url) => {
      try {
        const r = await fetch(url, { credentials: 'include', cache: force ? 'reload' : 'default' });
        if (r.status === 429) { bateu429 = true; return null; }
        if (!r.ok) return null;
        return await r.text();
      } catch (e) { return null; }
    };
    const [rV, rP] = await Promise.all([fetchTxt('/map/village.txt'), fetchTxt('/map/player.txt')]);
    if (rV) {
      const vils = new Map();
      rV.split('\n').forEach((line) => {
        if (!line.trim()) return;
        // Formato: id,name,x,y,player_id,points,rank
        const p = line.split(',');
        if (p.length < 6) return;
        vils.set(p[0], { x: +p[2], y: +p[3], playerId: p[4], points: parseInt(p[5], 10) || 0 });
      });
      _mapVilCache = vils;
      config.mapUi.dataCachedAt = Date.now();
      save();
    }
    if (rP) {
      const players = new Map();
      rP.split('\n').forEach((line) => {
        if (!line.trim()) return;
        // Formato: id,name,tribe_id,villages,points,rank
        const p = line.split(',');
        if (p.length < 4) return;
        players.set(p[0], { name: decodeURIComponent(p[1] || '').replace(/\+/g, ' '), tribeId: p[2] });
      });
      _mapPlayerCache = players;
    }
    // Avisar no console não serve: ninguém abre o console. Isto tem consequência VISÍVEL no mapa,
    // então vai pro log do módulo, que é onde o usuário olha.
    if (bateu429) {
      _mapProxTentativa = Date.now() + 30 * 60000;
      pushLog('🗺️ Mapa: o servidor recusou os arquivos de mapa (429, requisições demais). Tento de novo em 30 min — os filtros e a cobertura ficam sem dado até lá.', 'err', 'map');
      return;
    }
    if (!rV) {
      console.warn('[TWMgr Mapa] village.txt falhou');
      pushLog('🗺️ Mapa: não consegui baixar village.txt — os filtros não vão funcionar até recarregar a página.', 'err', 'map');
    }
    _mapPlayerFalhou = !rP;
    if (!rP) {
      console.warn('[TWMgr Mapa] player.txt falhou (rate limit?)');
      pushLog('🗺️ Mapa: player.txt não veio (o TW costuma limitar) — sem ele não dá pra separar tribo de inimigo, e TODA aldeia de jogador aparece como 🔴 Inimigo, inclusive a da sua tribo. Se o filtro de inimigo estiver desligado, sua tribo some do mapa. Use 🔄 recarregar pra tentar de novo.', 'err', 'map');
    }
  }

  // Sync manual do planner interno da tribo (screen=ally&mode=reservations).
  // Retorna { count, ok } — count = quantas reservas parseadas, ok = fetch teve sucesso.
  // Parse é defensivo: procura por (X|Y) em cada linha da tabela + timer HH:MM:SS ou data DD/MM/YYYY.
  async function loadReservations() {
    try {
      const url = '/game.php?village=' + CUR_VID + '&screen=ally&mode=reservations&page=-1&_=' + Date.now();
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const reservations = {};
      const now = Date.now();
      doc.querySelectorAll('table tr').forEach((tr) => {
        const text = (tr.textContent || '').replace(/\s+/g, ' ');
        const coordM = text.match(/(\d{1,3})\|(\d{1,3})/);
        if (!coordM) return;
        const coord = coordM[1] + '|' + coordM[2];
        let expiresAt = 0;
        // Timer relativo tipo "1d 3:45:12" ou "3:45:12"
        const dTimer = text.match(/(\d+)\s*d\s*(\d{1,2}):(\d{1,2}):(\d{2})/i);
        if (dTimer) {
          expiresAt = now + ((+dTimer[1] * 86400) + (+dTimer[2] * 3600) + (+dTimer[3] * 60) + (+dTimer[4])) * 1000;
        } else {
          const hTimer = text.match(/(\d{1,3}):(\d{1,2}):(\d{2})(?!\d)/);
          if (hTimer) expiresAt = now + ((+hTimer[1] * 3600) + (+hTimer[2] * 60) + (+hTimer[3])) * 1000;
        }
        // Data absoluta tipo "20/07/2026 15:30"
        if (!expiresAt) {
          const dateM = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[^\d]+(\d{1,2}):(\d{2})/);
          if (dateM) {
            const d = new Date(+dateM[3], +dateM[2] - 1, +dateM[1], +dateM[4], +dateM[5]);
            expiresAt = d.getTime();
          }
        }
        const playerLink = tr.querySelector('a[href*="screen=info_player"]');
        const playerName = playerLink ? (playerLink.textContent || '').trim().slice(0, 30) : '';
        reservations[coord] = { at: now, expiresAt: expiresAt, playerName: playerName };
      });
      config.mapUi.reservations = reservations;
      config.mapUi.reservationsAt = now;
      save();
      return { count: Object.keys(reservations).length, ok: true };
    } catch (e) {
      console.warn('[TWMgr Mapa] loadReservations falhou:', e && e.message);
      return { count: 0, ok: false, error: e && e.message };
    }
  }

  // Categoria da aldeia baseado no dono
  function mapCategoryOf(vil) {
    if (!vil) return 'unknown';
    if (vil.playerId === '0' || !vil.playerId) return 'barb';
    if (vil.playerId === MY_PLAYER_ID) return 'mine';
    const player = _mapPlayerCache && _mapPlayerCache.get(vil.playerId);
    if (player && player.tribeId && player.tribeId !== '0' && player.tribeId === MY_TRIBE_ID) return 'tribe';
    return 'enemy';
  }

  const MAP_CAT_LABELS = { mine: '🟢 Minha', tribe: '🔵 Tribo', enemy: '🔴 Inimigo', barb: '⚪ Bárbaro' };

  // ---- Overlay canvas sobre o mapa do TW (mundo br143 usa canvas puro) ----
  // Cria um <canvas> transparente por cima do mapa e desenha:
  // - Retângulo escuro sobre aldeias filtradas (efeito atenuar)
  // - Badge de pontos sobre aldeias visíveis
  // Usa TWMap.map.pixelByCoord(x,y) pra converter coord de aldeia em pixel na tela.
  let _mapOverlay = null;
  let _mapRedrawTimer = null;
  let _mapLoggedOnce = false;

  function mapEnsureOverlay() {
    try {
      if (_mapOverlay && document.body.contains(_mapOverlay)) return _mapOverlay;
      const T = window.TWMap;
      // Prefere #map (wrapper visível, ancora estável) — #map_container é o "mundo" gigante que translada.
      // Fallback pra TWMap.map.el se #map não existir por algum motivo.
      let parent = document.getElementById('map');
      if (!(parent instanceof Element)) parent = document.getElementById('map_container');
      if (!(parent instanceof Element)) parent = T && T.map && T.map.el instanceof Element ? T.map.el : null;
      if (!(parent instanceof Element)) { console.warn('[TWMgr Mapa] nenhum container Element encontrado pro overlay'); return null; }
      const c = document.createElement('canvas');
      c.id = 'twmgr-map-overlay';
      // Fica ancorado no canto do #map (posição visível do mapa). Sem left/top variável no redraw.
      c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:9998';
      try { if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; } catch (e) {}
      const size = (T && T.map && T.map.size) || [parent.clientWidth || 800, parent.clientHeight || 600];
      c.width = size[0]; c.height = size[1];
      c.style.width = size[0] + 'px'; c.style.height = size[1] + 'px';
      parent.appendChild(c);
      _mapOverlay = c;
      console.log('[TWMgr Mapa] overlay criado dentro de #' + parent.id + ' (' + parent.tagName + '), rect:', c.getBoundingClientRect());
      return c;
    } catch (e) { console.warn('[TWMgr Mapa] mapEnsureOverlay falhou:', e && e.message); return null; }
  }

  // Descobre tileSize (tamanho de cada aldeia em pixels). TW usa 53x47 tradicionalmente.
  function mapTileSize() {
    const T = window.TWMap;
    if (T && T.tileSize && T.tileSize.length >= 2) return T.tileSize;
    if (T && T.tileDimensions && T.tileDimensions.length >= 2) return T.tileDimensions;
    return [53, 47];   // default histórico
  }

  // Legenda da cobertura, com a contagem de cada estado e o percentual explorado.
  // O percentual é o que responde a pergunta direta: "quanto do meu raio eu já enxerguei?"
  function mapRenderLegendaCobertura() {
    const el = document.getElementById('twmgr-map-cob-leg'); if (!el) return;
    if (!config.mapUi.showCobertura) { el.innerHTML = ''; return; }
    const intel = (config.map && config.map.intel) || {};
    const chaves = Object.keys(intel);
    if (!chaves.length) {
      el.innerHTML = '<span style="color:#8a7d6d">Sem dados ainda — rode um ciclo do módulo Mapa (ou a Prévia) pra preencher.</span>';
      return;
    }
    const cont = {};
    chaves.forEach((k) => { cont[intel[k]] = (cont[intel[k]] || 0) + 1; });
    const conhecidas = (cont[MAP_INTEL.OK] || 0) + (cont[MAP_INTEL.BL_DEFESA] || 0);
    const pct = Math.round(conhecidas * 100 / chaves.length);
    el.innerHTML =
      '<div style="color:#a2643a;font-weight:700;margin-bottom:2px">' + pct + '% do seu raio explorado <span style="color:#8a7d6d;font-weight:400">(' + conhecidas + ' de ' + chaves.length + ')</span></div>' +
      [1, 2, 3, 4, 5, 6].filter((c) => cont[c]).map((c) =>
        '<div><span style="display:inline-block;width:9px;height:9px;border:2px solid ' + MAP_INTEL_COR[c] + ';margin-right:5px;vertical-align:middle"></span>' +
        '<span style="color:#6f6153">' + MAP_INTEL_NOME[c] + '</span> <b style="color:#8b5426">' + cont[c] + '</b></div>').join('');
  }

  function mapCanvasRedraw() {
    if (!_mapVilCache) return;
    const T = window.TWMap;
    if (!T || !T.map || typeof T.map.pixelByCoord !== 'function') return;
    const overlay = mapEnsureOverlay();
    if (!overlay) return;

    // Sincroniza tamanho se o mapa foi redimensionado
    const size = T.map.size || [overlay.width, overlay.height];
    if (overlay.width !== size[0] || overlay.height !== size[1]) {
      overlay.width = size[0]; overlay.height = size[1];
      overlay.style.width = size[0] + 'px'; overlay.style.height = size[1] + 'px';
    }
    // Overlay é filho de #map (wrapper visível), então left/top: 0 já ancora corretamente.

    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const cfg = config.mapUi;
    const dim = cfg.dimOpacity != null ? cfg.dimOpacity : 0.15;
    const pMin = cfg.pointsMin || 0;
    const pMax = cfg.pointsMax || 0;
    const [tw, th] = mapTileSize();

    // pixelByCoord retorna pixels no espaço MUNDO. TWMap.map.pos é o offset do canvas nesse espaço.
    // pixel_canvas = pixelByCoord(x,y) - TWMap.map.pos
    const mapOffset = T.map.pos || [0, 0];

    // Usa getViewport pra saber quais tiles estão visíveis (mais confiável que range manual)
    let xMin, xMax, yMin, yMax;
    try {
      const vp = T.map.getViewport();
      xMin = vp.top_left_tile.coord_x - 2;
      xMax = vp.bottom_right_tile.coord_x + 2;
      yMin = vp.top_left_tile.coord_y - 2;
      yMax = vp.bottom_right_tile.coord_y + 2;
    } catch (e) {
      // Fallback: usa TWMap.pos + range aproximado
      const pos = T.pos || [500, 500];
      const rangeX = Math.ceil((overlay.width / tw) / 2) + 3;
      const rangeY = Math.ceil((overlay.height / th) / 2) + 3;
      xMin = pos[0] - rangeX; xMax = pos[0] + rangeX;
      yMin = pos[1] - rangeY; yMax = pos[1] + rangeY;
    }

    const counts = { mine: 0, tribe: 0, enemy: 0, barb: 0, visible: 0 };
    let drawn = 0;

    // Intel: coord "x|y" -> { defTotal, wall, at } vindo do config.farm.defended (v9.55.1).
    // Só monta uma vez por redraw pra não iterar 30+ chaves 500x.
    const intelByCoord = {};
    if (cfg.showIntel && config.farm && config.farm.defended) {
      Object.values(config.farm.defended).forEach((d) => {
        if (d && typeof d === 'object' && d.coord) intelByCoord[d.coord] = d;
      });
    }
    // Reservas da tribo (sync manual): coord -> { expiresAt, playerName }
    const reservations = (cfg.showReservations && cfg.reservations) || {};
    // Cobertura de exploração, gravada pelo módulo Mapa a cada ciclo.
    const coberturaIntel = (cfg.showCobertura && config.map && config.map.intel) || null;
    const dimEnabled = cfg.dimMode === 'dim';

    // ALCANCE DO MÓDULO MAPA: a área que o raio configurado cobre, em volta de cada aldeia
    // sua. Desenhado ANTES das aldeias pra ficar por baixo, e como UM caminho só com um
    // fill: 43 elipses preenchidas separadamente empilhariam transparência e virariam uma
    // mancha sólida; num caminho único o preenchimento sai uniforme e o que se vê é a
    // UNIÃO — que é justamente a pergunta "até onde eu alcanço".
    // Elipse e não círculo porque o tile do TW não é quadrado (53x47).
    if (cfg.showRange) {
      const raio = (config.map && config.map.maxDist) || 20;
      const r2 = raio * raio;
      const minhas = [];
      _mapVilCache.forEach((v) => {
        if (v.playerId !== MY_PLAYER_ID) return;
        if (v.x < xMin - raio || v.x > xMax + raio || v.y < yMin - raio || v.y > yMax + raio) return;
        minhas.push(v);
      });
      if (minhas.length) {
        // PREENCHE TILE A TILE, não desenha círculos.
        //
        // A versão anterior desenhava uma elipse por aldeia. Mesmo unindo o preenchimento
        // num caminho só, os CONTORNOS de cada círculo continuavam aparecendo e com 43
        // aldeias viravam um emaranhado — o usuário descreveu como "muito poluído".
        // Pintando os tiles que estão no alcance de ALGUMA aldeia, as bordas internas
        // simplesmente não existem: o que sobra é uma mancha única, como a da relíquia.
        //
        // Uma chamada de pixelByCoord só, e o resto por aritmética: a grade é regular, e
        // 600 chamadas por redraw a 4 quadros por segundo seriam desperdício.
        let p0; try { p0 = T.map.pixelByCoord(xMin, yMin); } catch (e) { p0 = null; }
        if (p0) {
          const bx = (Array.isArray(p0) ? p0[0] : p0.x) - mapOffset[0];
          const by = (Array.isArray(p0) ? p0[1] : p0.y) - mapOffset[1];
          ctx.fillStyle = 'rgba(90,169,230,.20)';
          for (let ty = yMin; ty <= yMax; ty++) {
            // Pinta em FAIXAS horizontais contínuas em vez de um retângulo por tile:
            // menos chamadas e, principalmente, sem costura visível entre tiles vizinhos.
            let inicio = -1;
            for (let tx = xMin; tx <= xMax + 1; tx++) {
              let dentro = false;
              if (tx <= xMax) {
                for (let k = 0; k < minhas.length; k++) {
                  const dx = minhas[k].x - tx, dy = minhas[k].y - ty;
                  if (dx * dx + dy * dy <= r2) { dentro = true; break; }
                }
              }
              if (dentro && inicio < 0) inicio = tx;
              else if (!dentro && inicio >= 0) {
                ctx.fillRect(bx + (inicio - xMin) * tw, by + (ty - yMin) * th, (tx - inicio) * tw, th);
                inicio = -1;
              }
            }
          }
        }
      }
    }

    _mapVilCache.forEach((vil, vid) => {
      if (vil.x < xMin || vil.x > xMax || vil.y < yMin || vil.y > yMax) return;
      let wx, wy;
      try {
        const p = T.map.pixelByCoord(vil.x, vil.y);
        if (Array.isArray(p)) { wx = p[0]; wy = p[1]; }
        else if (p && typeof p === 'object') { wx = p.x; wy = p.y; }
        else return;
      } catch (e) { return; }
      const px = wx - mapOffset[0];
      const py = wy - mapOffset[1];
      if (px < -tw || px > overlay.width + tw || py < -th || py > overlay.height + th) return;

      const cat = mapCategoryOf(vil);
      const showCat = cfg.show[cat] !== false;
      const points = vil.points || 0;
      const passesPoints = (!pMin || points >= pMin) && (!pMax || points <= pMax);
      const visible = showCat && passesPoints;
      drawn++;
      if (visible) { counts.visible++; counts[cat] = (counts[cat] || 0) + 1; }

      if (!visible) {
        // Filtrada: só escurece se o usuário optou por 'dim'. Padrão 'off' não desenha nada.
        if (dimEnabled) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - dim) + ')'; ctx.fillRect(px, py, tw, th); }
        return;
      }

      // COBERTURA DE EXPLORAÇÃO: moldura colorida pelo que eu sei daquela aldeia.
      // Desenhada como borda em vez de preenchimento pra não esconder o gráfico do jogo —
      // o padrão das cores no conjunto é que responde "até onde eu já enxerguei".
      if (cfg.showCobertura && coberturaIntel) {
        const cod = coberturaIntel[vil.x + '|' + vil.y];
        if (cod) {
          ctx.strokeStyle = MAP_INTEL_COR[cod] || '#888';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, tw - 2, th - 2);
        }
      }

      // Badge de pontos (canto inferior direito)
      if (cfg.showBadge) {
        const label = points >= 1000 ? (Math.round(points / 100) / 10).toFixed(1) + 'k' : String(points);
        ctx.font = 'bold 9px Verdana';
        const lw = ctx.measureText(label).width;
        const bx = px + tw - lw - 4, by = py + th - 12;
        ctx.fillStyle = 'rgba(0,0,0,.75)';
        ctx.fillRect(bx, by, lw + 4, 11);
        ctx.fillStyle = '#a2643a';
        ctx.textBaseline = 'top';
        ctx.fillText(label, bx + 2, by + 1);
      }

      // Intel (canto superior esquerdo): ⚠ tropa defensora + ⛰N muralha
      const coordKey = vil.x + '|' + vil.y;
      const intel = intelByCoord[coordKey];
      if (intel) {
        const parts = [];
        if (intel.defTotal > 0) parts.push('⚠' + intel.defTotal);
        if (intel.wall != null) parts.push('⛰' + intel.wall);
        if (parts.length) {
          const txt = parts.join(' ');
          ctx.font = 'bold 9px Verdana';
          const w2 = ctx.measureText(txt).width;
          ctx.fillStyle = 'rgba(120,0,0,.85)';
          ctx.fillRect(px, py, w2 + 4, 11);
          ctx.fillStyle = '#fff';
          ctx.textBaseline = 'top';
          ctx.fillText(txt, px + 2, py + 1);
        }
      }

      // Reserva da tribo (canto inferior esquerdo): ⌛Xh (horas até expirar)
      const rsv = reservations[coordKey];
      if (rsv) {
        let label = '⌛?';
        if (rsv.expiresAt) {
          const restMs = rsv.expiresAt - Date.now();
          if (restMs > 0) {
            const h = Math.floor(restMs / 3600000);
            const m = Math.floor((restMs % 3600000) / 60000);
            label = '⌛' + (h > 0 ? h + 'h' : m + 'm');
          } else {
            label = '⌛venceu';
          }
        }
        // Cor: azul se muito tempo (>24h), amarelo (<24h), vermelho (<6h)
        const restH = rsv.expiresAt ? (rsv.expiresAt - Date.now()) / 3600000 : 999;
        const bg = restH < 6 ? 'rgba(180,20,20,.85)' : restH < 24 ? 'rgba(180,140,20,.85)' : 'rgba(40,80,180,.85)';
        ctx.font = 'bold 9px Verdana';
        const lw2 = ctx.measureText(label).width;
        ctx.fillStyle = bg;
        ctx.fillRect(px, py + th - 22, lw2 + 4, 11);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'top';
        ctx.fillText(label, px + 2, py + th - 21);
      }
    });

    if (!_mapLoggedOnce) {
      _mapLoggedOnce = true;
      // eslint-disable-next-line no-console
      console.log('[TWMgr Mapa] overlay canvas ativo · mapOffset:', mapOffset, '· viewport:', [xMin, yMin, xMax, yMax], '· tileSize:', [tw, th], '· desenhadas:', drawn, '· cache:', _mapVilCache.size);
    }

    const cnt = document.getElementById('twmgr-map-counts');
    if (cnt) {
      if (drawn === 0) cnt.innerHTML = '<span style="color:#a52020">⚠ 0 aldeias no viewport (ver console)</span>';
      else cnt.textContent = counts.visible + '/' + drawn + ' visíveis · 🟢' + (counts.mine||0) + ' 🔵' + (counts.tribe||0) + ' 🔴' + (counts.enemy||0) + ' ⚪' + (counts.barb||0);
    }
  }

  function mapApplyFilters() { try { mapCanvasRedraw(); } catch (e) { console.warn('[TWMgr Mapa] redraw falhou:', e.message || e); } }

  function mapBuildPanel() {
    if (document.getElementById('twmgr-map-panel')) return;
    const cfg = config.mapUi;
    // Ancora inline abaixo da tabela "Alterar o tamanho do mapa" (contém #map_chooser_select).
    // Se não achar (mundo diferente / layout mudou), cai pro fixed antigo no canto.
    const sizeSel = document.getElementById('map_chooser_select');
    const sizeTable = sizeSel ? sizeSel.closest('table') : null;
    const inline = !!sizeTable;
    const panel = document.createElement(inline ? 'table' : 'div');
    panel.id = 'twmgr-map-panel';
    if (inline) {
      panel.className = 'vis';
      panel.setAttribute('width', '100%');
      panel.style.cssText = 'margin-top:6px;font-size:11px;color:#3b2914;font-family:Verdana,sans-serif';
    } else {
      panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:10000;background:linear-gradient(180deg,#f4e4bc,#8b5426);border:1px solid #a2643a;border-radius:8px;padding:8px 10px;font-size:11px;color:#3b2914;box-shadow:0 2px 6px rgba(0,0,0,.35);min-width:220px;font-family:Verdana,sans-serif';
    }
    const check = (id, label, checked) => '<label style="display:flex;align-items:center;gap:6px;margin:2px 0;cursor:pointer"><input id="' + id + '" type="checkbox"' + (checked ? ' checked' : '') + '> ' + label + '</label>';
    const bodyHTML =
      '<div id="twmgr-map-body" style="' + (cfg.collapsed ? 'display:none' : '') + '">' +
        check('twmgr-map-show-mine', '🟢 Minhas aldeias', cfg.show.mine) +
        check('twmgr-map-show-tribe', '🔵 Tribo', cfg.show.tribe) +
        check('twmgr-map-show-enemy', '🔴 Inimigos', cfg.show.enemy) +
        check('twmgr-map-show-barb', '⚪ Bárbaros', cfg.show.barb) +
        '<div style="margin:6px 0;border-top:1px dashed #b89a5a;padding-top:6px">Pontos entre:</div>' +
        '<div style="display:flex;gap:4px;align-items:center">' +
          '<input id="twmgr-map-pmin" type="number" min="0" placeholder="mín" value="' + (cfg.pointsMin || '') + '" style="width:60px;padding:2px 4px;font-size:11px">' +
          '<span>–</span>' +
          '<input id="twmgr-map-pmax" type="number" min="0" placeholder="máx" value="' + (cfg.pointsMax || '') + '" style="width:60px;padding:2px 4px;font-size:11px">' +
        '</div>' +
        check('twmgr-map-badge', 'Mostrar pontos na aldeia', cfg.showBadge) +
        check('twmgr-map-intel', 'Mostrar intel (⚠ tropas · ⛰ muralha)', cfg.showIntel) +
        check('twmgr-map-rsv', 'Mostrar reservas da tribo (⌛)', cfg.showReservations) +
        check('twmgr-map-cob', 'Mostrar cobertura de exploração', cfg.showCobertura) +
        check('twmgr-map-range', 'Mostrar meu alcance (raio do módulo Mapa)', cfg.showRange) +
        '<div id="twmgr-map-cob-leg" style="font-size:9px;line-height:1.7;margin:2px 0 6px 4px"></div>' +
        check('twmgr-map-dim', 'Escurecer aldeias filtradas (bloco preto)', cfg.dimMode === 'dim') +
        '<div style="margin-top:6px;border-top:1px dashed #b89a5a;padding-top:6px;font-size:10px;color:#ddd2c0">' +
          '<div id="twmgr-map-counts">—</div>' +
          '<div style="margin-top:4px;display:flex;justify-content:space-between;align-items:center;gap:4px;flex-wrap:wrap">' +
            '<button id="twmgr-map-reset" style="padding:2px 6px;font-size:10px;border:1px solid #a2643a;border-radius:3px;background:#8b5426;cursor:pointer;color:#3b2914" title="Mostra tudo, sem overlay: liga todos os toggles, zera pontos, desliga escurecer">🚫 Desativar tudo</button>' +
            '<button id="twmgr-map-reload" style="padding:2px 6px;font-size:10px;border:1px solid #a2643a;border-radius:3px;background:#8b5426;cursor:pointer;color:#3b2914">🔄 mapa</button>' +
            '<button id="twmgr-map-rsv-sync" style="padding:2px 6px;font-size:10px;border:1px solid #a2643a;border-radius:3px;background:#8b5426;cursor:pointer;color:#3b2914" title="Baixa o planner interno da tribo (screen=ally&mode=reservations) e mostra ⌛Xh nas aldeias reservadas">⌛ sync reservas</button>' +
          '</div>' +
          '<div style="margin-top:2px;color:#ddd2c0;font-size:9px">cache mapa: ' + (cfg.dataCachedAt ? new Date(cfg.dataCachedAt).toLocaleTimeString() : '—') + ' · reservas: ' + (cfg.reservationsAt ? (new Date(cfg.reservationsAt).toLocaleTimeString() + ' (' + Object.keys(cfg.reservations || {}).length + ')') : '—') + '</div>' +
        '</div>' +
      '</div>';
    if (inline) {
      // Estrutura tipo tabela vis nativa: <th> header + <td> corpo (padrão do TW pra sidebar do mapa)
      panel.innerHTML =
        '<tr><th colspan="2" style="cursor:pointer" id="twmgr-map-header">🗺️ TW Manager · Mapa <span id="twmgr-map-collapse">' + (cfg.collapsed ? '▲' : '▼') + '</span></th></tr>' +
        '<tr><td colspan="2" style="padding:6px 8px">' + bodyHTML + '</td></tr>';
      sizeTable.parentNode.insertBefore(panel, sizeTable.nextSibling);
    } else {
      panel.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<b style="color:#ddd2c0">🗺️ TW Manager · Mapa</b>' +
          '<span id="twmgr-map-collapse" style="cursor:pointer;padding:0 6px;color:#ddd2c0">' + (cfg.collapsed ? '▲' : '▼') + '</span>' +
        '</div>' + bodyHTML;
      document.body.appendChild(panel);
    }

    // Wire eventos
    const save_ = () => { save(); mapApplyFilters(); };
    // Colapsar: no modo inline o click é no header todo; no modo fixed, só no span
    const toggler = document.getElementById('twmgr-map-header') || document.getElementById('twmgr-map-collapse');
    if (toggler) toggler.addEventListener('click', () => {
      cfg.collapsed = !cfg.collapsed;
      const body = document.getElementById('twmgr-map-body'); if (body) body.style.display = cfg.collapsed ? 'none' : '';
      const chevron = document.getElementById('twmgr-map-collapse'); if (chevron) chevron.textContent = cfg.collapsed ? '▲' : '▼';
      save();
    });
    ['mine','tribe','enemy','barb'].forEach((k) => {
      document.getElementById('twmgr-map-show-' + k).addEventListener('change', (e) => {
        cfg.show[k] = e.target.checked; save_();
      });
    });
    document.getElementById('twmgr-map-pmin').addEventListener('change', (e) => { cfg.pointsMin = parseInt(e.target.value, 10) || 0; save_(); });
    document.getElementById('twmgr-map-pmax').addEventListener('change', (e) => { cfg.pointsMax = parseInt(e.target.value, 10) || 0; save_(); });
    document.getElementById('twmgr-map-badge').addEventListener('change', (e) => { cfg.showBadge = e.target.checked; save_(); });
    document.getElementById('twmgr-map-intel').addEventListener('change', (e) => { cfg.showIntel = e.target.checked; save_(); });
    document.getElementById('twmgr-map-rsv').addEventListener('change', (e) => { cfg.showReservations = e.target.checked; save_(); });
    document.getElementById('twmgr-map-cob').addEventListener('change', (e) => { cfg.showCobertura = e.target.checked; save_(); mapRenderLegendaCobertura(); });
    document.getElementById('twmgr-map-range').addEventListener('change', (e) => { cfg.showRange = e.target.checked; save_(); });
    mapRenderLegendaCobertura();
    document.getElementById('twmgr-map-dim').addEventListener('change', (e) => { cfg.dimMode = e.target.checked ? 'dim' : 'off'; save_(); });
    document.getElementById('twmgr-map-rsv-sync').addEventListener('click', async () => {
      const btn = document.getElementById('twmgr-map-rsv-sync');
      btn.disabled = true; btn.textContent = '⏳ sincronizando…';
      const r = await loadReservations();
      btn.disabled = false; btn.textContent = '⌛ sync reservas';
      if (r.ok) pushLog('Mapa: ' + r.count + ' reserva(s) sincronizada(s).', 'ok');
      else pushLog('Mapa: falha ao sincronizar reservas — ' + (r.error || 'erro desconhecido'), 'err');
      // Re-monta o painel pra atualizar o timestamp na barra de status
      const p = document.getElementById('twmgr-map-panel'); if (p) p.remove();
      mapBuildPanel();
      mapApplyFilters();
    });
    document.getElementById('twmgr-map-reset').addEventListener('click', () => {
      cfg.show = { mine: true, tribe: true, enemy: true, barb: true };
      cfg.pointsMin = 0; cfg.pointsMax = 0;
      cfg.dimMode = 'off';
      save_();
      // Re-render dos checkboxes/inputs pra refletir o reset visualmente
      ['mine','tribe','enemy','barb'].forEach((k) => { const el = document.getElementById('twmgr-map-show-' + k); if (el) el.checked = true; });
      const pmin = document.getElementById('twmgr-map-pmin'); if (pmin) pmin.value = '';
      const pmax = document.getElementById('twmgr-map-pmax'); if (pmax) pmax.value = '';
      const dim = document.getElementById('twmgr-map-dim'); if (dim) dim.checked = false;
    });
    document.getElementById('twmgr-map-reload').addEventListener('click', async () => {
      const btn = document.getElementById('twmgr-map-reload');
      btn.disabled = true; btn.textContent = '⏳ carregando…';
      await loadMapData(true);
      btn.disabled = false; btn.textContent = '🔄 recarregar';
      mapApplyFilters();
    });
  }

  async function enhanceMapPage() {
    const gd = window.game_data;
    if (!gd || gd.screen !== 'map') return;
    await loadMapData(false);
    mapBuildPanel();
    // Espera o TWMap estar pronto (as vezes carrega assincrono)
    const waitTWMap = () => new Promise((resolve) => {
      const t0 = Date.now();
      const check = () => {
        if (window.TWMap && window.TWMap.map && typeof window.TWMap.map.pixelByCoord === 'function') return resolve(true);
        if (Date.now() - t0 > 8000) return resolve(false);
        setTimeout(check, 100);
      };
      check();
    });
    const ok = await waitTWMap();
    if (!ok) { console.warn('[TWMgr Mapa] TWMap.map.pixelByCoord não disponível — filtros não funcionarão'); return; }
    mapApplyFilters();
    // Redraw periódico (250ms) — cobre scroll/zoom. O comentário aqui dizia "só itera aldeias no
    // viewport", o que é falso: mapCanvasRedraw percorre o cache inteiro e descarta por dentro.
    // Medido antes de "consertar": 0,62ms por passada com 60 mil aldeias, ou 2,5ms de CPU por
    // segundo. Não é gargalo, e indexar por coluna seria complexidade sem ganho. Fica como está —
    // o comentário é que estava mentindo.
    clearInterval(_mapRedrawTimer);
    _mapRedrawTimer = setInterval(mapApplyFilters, 250);
    // Hook opcional: se o TWMap dispara evento de setPos, redesenha imediato
    try {
      const origSetPos = window.TWMap.map.setPos;
      if (typeof origSetPos === 'function' && !window.TWMap.map.__twmgr_hooked) {
        window.TWMap.map.__twmgr_hooked = true;
        window.TWMap.map.setPos = function () { const r = origSetPos.apply(this, arguments); try { mapCanvasRedraw(); } catch (e) {} return r; };
      }
    } catch (e) {}
  }

  // ==================== CENTRO DE COMANDO (rico — port da v9.39.0, ilha isolada) ====================
  // Portado da branch centro-de-comando. Embrulhado na propria IIFE pra os ~465 nomes internos
  // (cc*/cmd*, motor de precisao, silencio, tempo de viagem) NAO colidirem com o Centro de
  // Comando novo (cc*) do v11. Fecha sobre os helpers do v11 (serverNow, save, pushLog, esc,
  // getAllVillages, fakePrepare, fieldDist, getMapVillages, UNITS, config, IMG_BASE...).
  // Traz copia so do que o v11 nao tem: FREEZEKEY, NETLAT, defCmd, MODELOS_PADRAO, srvClockMs,
  // netProbe. Estado proprio em config.cmd (coexiste com config.cc do v11).
  (function () {
    'use strict';
    const FREEZEKEY = KEY + '_freeze';   // modo silêncio, compartilhado entre abas
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
      snipeFolgaMs: 150,      // quanto DEPOIS do ataque o apoio pousa (margem de segurança)
    });
    const MODELOS_PADRAO = () => ([
      { id: genId(), nome: 'Tudo', amounts: {}, max: UNITS.map((u) => u[0]).filter((u) => u !== 'snob').reduce((o, u) => (o[u] = true, o), {}) },
      { id: genId(), nome: 'Nobre', amounts: { snob: 1 }, max: {} },
      { id: genId(), nome: 'Fake', amounts: { ram: 1, spy: 1 }, max: {} },
    ]);
    function srvClockMs(ms) {
      const d = new Date((ms == null ? serverNow() : ms) - wallToServerOffset());
      const p = (n, w) => String(n).padStart(w || 2, '0');
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
    }
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
    { // inicializa config.cmd com os defaults da v9.39
      const c = config;
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
        if (c.cmd.snipeFolgaMs == null) c.cmd.snipeFolgaMs = 150;
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
    function erroCor(ms) { return ms < 50 ? '#2e7d3a' : (ms < 150 ? '#a2643a' : '#c0483a'); }

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
        marketModes: MARKET_MODES.filter((k) => config.market && config.market.modes && config.market.modes[k] && config.market.modes[k].running),
        build: !!(config.build && config.build.running),
        map: !!(config.map && config.map.running),
        alvos: !!config.running,
      };
      clearTimeout(scavTimer); clearTimeout(farmTimer); clearTimeout(wallTimer); clearTimeout(recruitTimer);
      MARKET_MODES.forEach((k) => clearTimeout(marketTimers[k]));
      clearTimeout(buildTimer); clearTimeout(mapTimer);
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
      try { (era.marketModes || []).forEach((k) => scheduleMarket(k)); } catch (e) {}
      try { if (era.build) scheduleBuild(); } catch (e) {}
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
        // BUG do v9.39: sem durMs (comando 'novo'), usava arriveAt como gatilho — aí só
        // preparava 60s antes da CHEGADA, quando a SAÍDA já tinha passado horas antes, e o
        // comando morria em "horário já passou". Agora estima a saída pela viagem local
        // (arriveAt − tempo de viagem); o preparo depois troca pela duração exata do servidor.
        const est = ccEstimaDeComando(c);
        const estimado = (c.durMs != null) ? (c.arriveAt - c.durMs)
                       : (est != null) ? (c.arriveAt - est) : c.arriveAt;
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
      { id: 'op',      ico: '🎯', rot: 'Operação', hint: 'Um alvo por vez: escolha as aldeias, crie ondas (cada nova entra 100ms depois da anterior), ordene e calibre os horários. Depois passe pro próximo alvo.' },
      { id: 'fake',    ico: '🎭', rot: 'Fake',    hint: 'Vários alvos de uma vez; o alvo único acima é ignorado.' },
      { id: 'massa',   ico: '🚚', rot: 'Apoio massa', hint: 'Apoio das origens marcadas pro(s) alvo(s), disparado AGORA (não agenda). Em cada unidade: número, 50% ou tudo.' },
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
          linhas.push('<span style="color:#a2643a">parâmetro do apoio ajustado para "' + esc(bS.name) + '"</span>');
        }
        // 2) Confirma 1 lanceiro para OUTRA aldeia sua (não dá pra atacar aldeia própria).
        const minhas = await getAllVillages();
        const destino = minhas.filter((v) => String(v.vid) !== String(CUR_VID) && v.coord)[0];
        if (!destino) { linhas.push('<span style="color:#c0483a">preciso de ao menos 2 aldeias suas pra testar</span>'); return diz(linhas.join('<br>')); }
        const [dx, dy] = destino.coord.split('|');
        const p = await cmdPrepare(CUR_VID, dx, dy, { spear: 1 }, 'support');
        const ok = (p.tipoDetectado === 'support');
        linhas.push('confirm em ' + esc(destino.coord) + ' → tipo <b style="color:' + (ok ? '#2e7d3a' : '#c0483a') + '">' +
                    esc(p.tipoDetectado) + '</b> · duração ' + (p.dur ? fmt(p.dur * 1000) : '?'));
        linhas.push('<span style="font-size:9px;color:#8a7d6d">campos: ' + esc(Object.keys(p.params).join(', ').slice(0, 200)) + '</span>');
        if (ok) {
          config.cmd.suporteOkAt = Date.now(); save();
          linhas.push('<span style="color:#2e7d3a">✔ apoio liberado (nada foi enviado)</span>');
        } else {
          linhas.push('<span style="color:#c0483a">✖ apoio NÃO liberado — o servidor não confirmou como apoio</span>');
        }
        pushLog('Verificação de apoio: tipo "' + p.tipoDetectado + '".', ok ? 'ok' : 'err', 'cmd');
        // Falhando, o aviso aparece mesmo no modo silencioso — senão o Apoio trava sem explicação.
        if (!ok && out) out.innerHTML = linhas.join('<br>');
        return ok;
      } catch (e) {
        linhas.push('<span style="color:#c0483a">verificação de apoio falhou: ' + esc(e.message || e) + '</span>');
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
        msg.style.color = ok ? '#2e7d3a' : '#a2643a';
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
    // Margem entre a chegada do ataque e a do apoio. Fixá-la em 50ms era perigoso: se o erro
    // de disparo for maior que a margem, o apoio pousa ANTES do ataque e morre nele.
    function ccFolgaSnipe() { return Math.max(0, (config.cmd && config.cmd.snipeFolgaMs != null) ? config.cmd.snipeFolgaMs : 150); }
    // O apoio tem que estar NA ALDEIA quando o ataque escolhido pousa — ou seja, chegar ANTES
    // dele. E depois do ataque anterior no mesmo alvo, senão morre naquele.
    // Janela útil: (chegada do anterior, chegada do escolhido). Miramos no fim dela, o mais
    // colado possível ao ataque, pra reduzir a exposição a ondas que não estamos vendo.
    function ccJanelaSnipe(lista, i, folgaMs) {
      const alvo = lista[i], folga = folgaMs == null ? ccFolgaSnipe() : folgaMs;
      // Anterior no MESMO destino (o nuke que limpa, tipicamente).
      let ant = null;
      for (let k = i - 1; k >= 0; k--) { if (lista[k].destino === alvo.destino) { ant = lista[k]; break; } }
      // Sem milésimos a chegada pode ser até 1s depois do que o texto diz; ao mirar ANTES dela,
      // o seguro é assumir o instante mais cedo possível.
      const base = alvo.chega;
      const de = ant ? (ant.chega + (ant.temMs ? 0 : 1000) + folga) : null;   // depois do anterior
      const ate = base - folga;                                              // antes do escolhido
      return { base: base, de: de, ate: ate, alvoChega: base,
               largura: de == null ? null : (ate - de), ant: ant, exato: !!alvo.temMs };
    }

    // Viável se ainda dá pra pousar antes do ataque E depois do anterior no mesmo alvo.
    function ccSnipeViavel(jan) {
      if (jan.ate <= srvNowP()) return false;                 // o ataque já passou (ou passa agora)
      if (jan.de != null && jan.ate <= jan.de) return false;   // nuke e nobre colados demais
      return true;
    }
    function ccSnipeTitulo(jan) {
      if (jan.ate <= srvNowP()) return 'tarde demais — esse ataque pousa antes de qualquer apoio chegar';
      if (jan.de == null) return 'sem ataque anterior neste alvo — janela aberta até a chegada';
      if (jan.ate <= jan.de) return 'ondas coladas demais: não cabe apoio entre elas';
      return 'janela de ' + jan.largura + 'ms entre o ataque anterior e este';
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
      box.innerHTML = '<div style="color:#8a7d6d;padding:6px;font-size:10px">lendo…</div>';
      let L = [];
      try { L = await ccLerComandos(_ccCmdsQual, !!forcar); }
      catch (e) { box.innerHTML = '<div style="color:#c0483a;padding:6px;font-size:10px">' + esc(e.message || e) + '</div>'; return; }
      if (!L.length) { box.innerHTML = '<div style="color:#8a7d6d;padding:6px;font-size:10px">— nenhum —</div>'; return; }
      const agora = srvNowP(), ehIn = (_ccCmdsQual === 'incoming');
      box.innerHTML = L.slice(0, 60).map((c, i) => {
        const jan = ehIn ? ccJanelaSnipe(L, i) : null;
        return '<div style="display:grid;grid-template-columns:1fr 78px 62px 96px;gap:4px;align-items:center;' +
               'padding:2px 5px;border-bottom:1px solid rgba(0,0,0,.07);font-size:10px">' +
          '<span style="color:#6f6153;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(c.tipo) + '">' +
            esc((c.origem || '?') + ' → ' + (c.destino || '?')) + (c.jogador ? ' <span style="color:#8a7d6d">' + esc(c.jogador) + '</span>' : '') + '</span>' +
          '<span style="color:' + (c.temMs ? '#a2643a' : '#a2643a') + '" title="' + (c.temMs ? 'com milésimos' : 'sem milésimos — margem de 1s') + '">' +
            srvClockMs(c.chega) + '</span>' +
          '<span style="color:#8a7d6d">' + (c.chega > agora ? fmt(c.chega - agora) : '—') + '</span>' +
          '<span style="text-align:right;white-space:nowrap">' +
            '<a data-usar="' + i + '" style="cursor:pointer;color:#2e7d3a" title="usar este horário">📋 usar</a>' +
            (ehIn ? ' <a data-snipe="' + i + '" style="cursor:pointer;color:' +
                    (ccSnipeViavel(jan) ? '#1f6fb2' : '#c0483a') + '" title="' +
                    ccSnipeTitulo(jan) +
                    '">🎯 snipe</a>' : '') +
          '</span>' +
        '</div>';
      }).join('');
      const off = () => parseInt((document.getElementById('cc-cmds-off') || {}).value, 10) || 0;
      box.querySelectorAll('[data-usar]').forEach((el) => el.onclick = () => {
        const c = L[+el.getAttribute('data-usar')];
        ccSetChegada(c.chega + off());
        const m = document.getElementById('cc-msg');
        if (m) { m.style.color = '#2e7d3a'; m.textContent = 'Chegada copiada: ' + srvClockMs(c.chega + off()) + (off() ? ' (com ' + off() + 'ms de deslocamento)' : ''); }
      });
      box.querySelectorAll('[data-snipe]').forEach((el) => el.onclick = () => {
        const i = +el.getAttribute('data-snipe'), c = L[i], jan = ccJanelaSnipe(L, i);
        const m = document.getElementById('cc-msg');
        if (!ccSnipeViavel(jan)) {
          if (m) { m.style.color = '#c0483a'; m.textContent = ccSnipeTitulo(jan); }
          return;
        }
        // Mira no FIM da janela: colado ao ataque, mas antes dele.
        ccSnipeModal({ destino: c.destino, chegaEm: jan.ate + off(), base: jan.base + off(),
                       de: jan.de, largura: jan.largura, exato: jan.exato });
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
        '<div data-un="' + u + '" style="text-align:center;background:#ffffff;' +
        'border:1px solid #ece4d8;border-radius:6px;padding:3px 2px;min-width:0">' +
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
        cel.style.borderColor = max ? '#a2643a' : (tem ? '#7a6438' : '#ece4d8');
        cel.style.background = max ? '#fdfaf5' : '#ffffff';
        btn.style.background = max ? 'rgba(162,100,58,.22)' : 'transparent';
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
        'style="display:inline-flex;align-items:center;gap:3px;background:#ffffff;border:1px solid #e0d6c6;' +
        'border-radius:10px;padding:2px 4px 2px 8px;font-size:10px;color:#a2643a;cursor:pointer">' +
          esc(m.nome) +
          '<a data-mod-rn="' + m.id + '" title="renomear" style="color:#8a7d6d;padding:0 1px">✎</a>' +
          '<a data-mod-rm="' + m.id + '" title="apagar" style="color:#c0483a;padding:0 2px">✕</a>' +
        '</span>').join('')
        : '<span style="font-size:10px;color:#8a7d6d">sem modelos — monte a composição e clique em "salvar como modelo"</span>';
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
        if (msg) { msg.style.color = '#c0483a'; msg.textContent = 'Preencha as tropas antes de salvar o modelo.'; }
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
      if (msg) { msg.style.color = '#2e7d3a'; msg.textContent = 'Modelo "' + nome + '" ' + (existe ? 'atualizado' : 'salvo') + '.'; }
    }

    // Parser de coordenada: aceita 478|586, 478 586, 478-586...
    function ccCoordParse(raw) {
      const m = String(raw || '').match(/(\d{1,3})\s*[|\s.,;:-]\s*(\d{1,3})/);
      return m ? { x: m[1], y: m[2], coord: m[1] + '|' + m[2] } : null;
    }

    // ==================== OPERAÇÃO ====================
    // O ALVO é o container: cada um tem coordenada, horário de chegada da 1ª onda e uma
    // LISTA ORDENADA de ondas. Cada onda é uma aldeia + tropas digitadas à mão.
    //
    // Defasagem: só ondas DA MESMA ALDEIA precisam de espaçamento entre si (é o mesmo
    // jogo/conta enviando mais de um comando — nuke e trem de nobre, por exemplo). Ondas de
    // aldeias diferentes têm a viagem calculada cada uma pela sua origem, então todas miram
    // o horário de chegada normal (o mesmo, ou o calibrado à mão), sem gap artificial entre
    // elas. "Dividir" quebra uma onda em N da MESMA aldeia — essas sim saem espaçadas.
    function ccOpCfg() {
      const c = (config.cmd.op = config.cmd.op || { gapMs: 100, ativo: null, grupo: '', alvos: [] });
      if (c.gapMs == null) c.gapMs = 100;
      if (!Array.isArray(c.alvos)) c.alvos = [];
      return c;
    }
    function ccOpAtivo() {
      const c = ccOpCfg();
      return c.alvos.find((a) => a.id === c.ativo) || c.alvos[0] || null;
    }
    function ccOpAlvoNovo() {
      const c = ccOpCfg();
      const a = { id: genId(), coord: '', chegadaLocal: '', vids: {}, ondas: [] };
      c.alvos.push(a); c.ativo = a.id; save(); ccOpRender();
    }
    function ccOpAlvoDel() {
      const c = ccOpCfg(), a = ccOpAtivo(); if (!a) return;
      c.alvos = c.alvos.filter((z) => z.id !== a.id);
      c.ativo = c.alvos.length ? c.alvos[0].id : null;
      save(); ccOpRender();
    }
    function ccOpChegadaBase(a) { return a ? arrivalToServerMs(a.chegadaLocal || '') || 0 : 0; }
    function ccOpOndaAdd(vid) {
      const a = ccOpAtivo(); if (!a) return;
      a.ondas.push({ id: genId(), vid: String(vid), tipo: 'attack', amounts: {}, offsetMs: null });
      save(); ccOpRender();
    }
    function ccOpOndaMover(id, d) {
      const a = ccOpAtivo(); if (!a) return;
      const i = a.ondas.findIndex((z) => z.id === id), j = i + d;
      if (i < 0 || j < 0 || j >= a.ondas.length) return;
      a.ondas.splice(j, 0, a.ondas.splice(i, 1)[0]);
      // Reordenou: os horários calibrados à mão perdem o sentido — tudo volta pro automático.
      a.ondas.forEach((z) => { z.offsetMs = null; });
      save(); ccOpRender();
    }
    // Quebra uma onda em N ondas da MESMA aldeia. Por padrão divide a tropa igualmente (resto
    // pras primeiras); cada uma fica com seus próprios campos, editáveis livremente depois —
    // "dividir" é só o ponto de partida, não uma amarra.
    function ccOpOndaDividir(id, n) {
      const a = ccOpAtivo(); if (!a) return;
      const i = a.ondas.findIndex((z) => z.id === id); if (i < 0) return;
      const o = a.ondas[i];
      n = Math.max(2, Math.min(20, parseInt(n, 10) || 2));
      const partes = [];
      for (let k = 0; k < n; k++) {
        const amounts = {};
        Object.keys(o.amounts || {}).forEach((u) => {
          const tot = o.amounts[u], base = Math.floor(tot / n), resto = tot % n;
          const q = base + (k < resto ? 1 : 0);
          if (q > 0) amounts[u] = q;
        });
        partes.push({ id: genId(), vid: o.vid, tipo: o.tipo, amounts: amounts, offsetMs: null });
      }
      a.ondas.splice(i, 1, ...partes);
      save(); ccOpRender();
    }
    // Offset efetivo de CADA onda: automático = posição entre as ondas DA MESMA aldeia (gap
    // ms entre a 1ª, 2ª, 3ª... dela); calibrado à mão sobrescreve. Ondas de aldeias diferentes
    // começam todas em offset 0 (o horário de chegada normal do alvo).
    function ccOpCalcularOffsets(a) {
      const gap = ccOpCfg().gapMs, cont = {}, map = {};
      (a.ondas || []).forEach((o) => {
        const n = cont[o.vid] || 0; cont[o.vid] = n + 1;
        map[o.id] = (o.offsetMs != null) ? o.offsetMs : n * gap;
      });
      return map;
    }

    // ---- Filtro de grupo na lista de aldeias da Operação (independente do filtro do Ataque/Apoio) ----
    let _ccOpGrupoVidsSet = null;
    async function ccOpAplicarFiltroGrupo() {
      const gid = ccOpCfg().grupo || '';
      if (!gid) { _ccOpGrupoVidsSet = null; ccOpRender(); return; }
      try {
        const vs = await getVillagesInGroup(gid);
        _ccOpGrupoVidsSet = new Set(vs.map((x) => String(x.vid)));
      } catch (e) {
        _ccOpGrupoVidsSet = null;
        pushLog('Operação: não consegui filtrar pelo grupo (' + (e.message || e) + ').', 'err', 'cmd');
      }
      ccOpRender();
    }
    async function ccOpCarregarGrupos() {
      const sel = document.getElementById('cc-op-grupo'); if (!sel) return;
      let grupos = []; try { grupos = await getGroups(); } catch (e) { /* sem grupos: fica só "Todas" */ }
      const cur = ccOpCfg().grupo || '';
      sel.innerHTML = '<option value="">Todas as aldeias</option>' +
        grupos.map((g) => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('');
      sel.value = cur;
      if (cur) ccOpAplicarFiltroGrupo();
    }

    // Tropa disponível de uma aldeia PRA OPERAÇÃO: total (casa+fora+trânsito — inclui o que
    // está saqueando/farmando, que volta sozinho) MENOS o que está apoiando outra aldeia
    // agora (fora) MENOS o que o Coordenado já reservou (config.reservations, escrito só por
    // ele) MENOS o que a própria Operação já comprometeu em QUALQUER onda, de QUALQUER alvo
    // (senão dava pra "gastar" a mesma tropa duas vezes só trocando de aba/alvo).
    function ccOpComprometidoTudo(vid) {
      const acc = {};
      ccOpCfg().alvos.forEach((al) => (al.ondas || []).forEach((o) => {
        if (String(o.vid) !== String(vid)) return;
        Object.keys(o.amounts || {}).forEach((u) => { acc[u] = (acc[u] || 0) + (o.amounts[u] || 0); });
      }));
      return acc;
    }
    function ccOpDisponivel(vid) {
      const v = CCVILAS.find((z) => String(z.vid) === String(vid));
      if (!v) return {};
      const minhas = v.minhas || v.avail || {};
      const fora = v.fora || {};
      const resPlanner = (config.reservations || {})[String(vid)] || {};
      const resOp = ccOpComprometidoTudo(vid);
      const out = {};
      (CC_UNIDADES_MUNDO || UNITS.map((u) => u[0])).forEach((u) => {
        out[u] = Math.max(0, (minhas[u] || 0) - (fora[u] || 0) - (resPlanner[u] || 0) - (resOp[u] || 0));
      });
      return out;
    }
    // Resumo por aldeia: soma o que ela manda em TODAS as ondas DESTE alvo e compara com o
    // que ainda sobrava pra ela na Operação inteira (incluindo o que ESTA onda já usa, senão
    // toda aldeia com onda pareceria estourada consigo mesma).
    function ccOpResumo(a) {
      const porVid = {};
      (a.ondas || []).forEach((o) => {
        const acc = (porVid[o.vid] = porVid[o.vid] || {});
        Object.keys(o.amounts || {}).forEach((u) => { acc[u] = (acc[u] || 0) + (o.amounts[u] || 0); });
      });
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      const linhas = [];
      Object.keys(porVid).forEach((vid) => {
        const v = CCVILAS.find((z) => String(z.vid) === String(vid));
        const nome = v ? ((v.nome ? v.nome + ' ' : '') + (v.coord || vid)) : vid;
        const minhas = (v && v.minhas) || {};
        const fora = (v && v.fora) || {};
        const resPlanner = (config.reservations || {})[String(vid)] || {};
        // "sobra" = total menos apoio-fora menos Coordenado menos TODAS as ondas da Operação
        // que NÃO são de nenhum alvo (ou seja, o compromisso já soma este alvo também).
        const compTudo = ccOpComprometidoTudo(vid);
        const falta = Object.keys(porVid[vid]).filter((u) => {
          const tetoTotal = Math.max(0, (minhas[u] || 0) - (fora[u] || 0) - (resPlanner[u] || 0));
          return compTudo[u] > tetoTotal;
        });
        const tot = Object.keys(porVid[vid]).reduce((s, u) => s + porVid[vid][u], 0);
        linhas.push('<span style="color:' + (falta.length ? '#c0483a' : '#6f6153') + '" title="' +
          esc(falta.length ? 'falta: ' + falta.map((u) => rot[u] || u).join(', ') : 'cabe no estoque') + '">' +
          esc(nome) + ' ' + fmtN(tot) + (falta.length ? ' ⚠' : '') + '</span>');
      });
      return linhas.join(' · ');
    }
    function ccOpRender() {
      const cfg = ccOpCfg();
      const sel = document.getElementById('cc-op-sel'); if (!sel) return;
      const a = ccOpAtivo();
      if (a) cfg.ativo = a.id;
      sel.innerHTML = cfg.alvos.length
        ? cfg.alvos.map((z, i) => '<option value="' + z.id + '">' + esc(z.coord || ('alvo ' + (i + 1) + ' (sem coord)')) + ' · ' + (z.ondas || []).length + ' onda(s)</option>').join('')
        : '<option value="">— nenhum alvo —</option>';
      if (a) sel.value = a.id;
      const gapEl = document.getElementById('cc-op-gap'); if (gapEl) gapEl.value = cfg.gapMs;
      const coordEl = document.getElementById('cc-op-coord'); if (coordEl) coordEl.value = a ? (a.coord || '') : '';
      const chEl = document.getElementById('cc-op-chegada'); if (chEl) chEl.value = a ? (a.chegadaLocal || '') : '';

      const boxV = document.getElementById('cc-op-vilas');
      const boxO = document.getElementById('cc-op-ondas');
      const boxR = document.getElementById('cc-op-resumo');
      if (!a) {
        if (boxV) boxV.innerHTML = '<div style="color:#8a7d6d;padding:6px;font-size:10px">— crie um alvo pra começar —</div>';
        if (boxO) boxO.innerHTML = '';
        if (boxR) boxR.innerHTML = '';
        return;
      }
      // ---- aldeias participantes ----
      const alvoP = ccCoordParse(a.coord);
      const rotUn = {}; UNITS.forEach(([u, n]) => { rotUn[u] = n; });
      const listaU0 = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      let vilas = CCVILAS.slice();
      if (_ccOpGrupoVidsSet) vilas = vilas.filter((v) => _ccOpGrupoVidsSet.has(String(v.vid)));
      vilas.sort((x, y) => {
        const dx = (alvoP && x.x != null) ? fieldDist(x.x, x.y, +alvoP.x, +alvoP.y) : 1e9;
        const dy = (alvoP && y.x != null) ? fieldDist(y.x, y.y, +alvoP.x, +alvoP.y) : 1e9;
        return dx - dy;
      });
      boxV.innerHTML = vilas.map((v) => {
        const on = !!a.vids[v.vid];
        const d = (alvoP && v.x != null) ? fieldDist(v.x, v.y, +alvoP.x, +alvoP.y) : null;
        const n = (a.ondas || []).filter((o) => String(o.vid) === String(v.vid)).length;
        const disp = ccOpDisponivel(v.vid);
        const tropas = listaU0.filter((u) => disp[u] > 0)
          .map((u) => '<span title="' + esc(rotUn[u] || u) + ' — sobra pra novos compromissos">' + unitIcon(u, rotUn[u] || u) + fmtN(disp[u]) + '</span>').join(' ');
        return '<div style="padding:2px 5px;border-bottom:1px solid rgba(0,0,0,.05);font-size:10px">' +
          '<div style="display:grid;grid-template-columns:18px 1fr 52px 62px;gap:6px;align-items:center">' +
            '<input type="checkbox" class="cc-op-v" data-vid="' + v.vid + '"' + (on ? ' checked' : '') + '>' +
            '<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' +
              (v.nome ? '<b style="color:#584526">' + esc(v.nome) + '</b> ' : '') +
              '<span style="color:#a2643a">' + esc(v.coord || v.vid) + '</span>' +
              (n ? '<span style="color:#8a7d6d"> · ' + n + ' onda(s)</span>' : '') + '</span>' +
            '<span style="color:#8a7d6d">' + (d == null ? '—' : d.toFixed(1) + ' c') + '</span>' +
            (on ? '<a class="cc-op-add-onda" data-vid="' + v.vid + '" href="#" style="color:#2e7d3a;font-size:9px">+ onda</a>' : '<span></span>') +
          '</div>' +
          (tropas ? '<div style="margin:1px 0 0 24px;line-height:1.5">' + tropas + '</div>' : '') +
        '</div>';
      }).join('') || '<div style="color:#8a7d6d;padding:6px;font-size:10px">— nenhuma aldeia —</div>';
      boxV.querySelectorAll('.cc-op-v').forEach((el) => el.onchange = () => {
        const vid = el.getAttribute('data-vid');
        if (el.checked) { a.vids[vid] = true; if (!(a.ondas || []).some((o) => String(o.vid) === String(vid))) ccOpOndaAdd(vid); }
        else { delete a.vids[vid]; a.ondas = a.ondas.filter((o) => String(o.vid) !== String(vid)); }
        save(); ccOpRender();
      });
      boxV.querySelectorAll('.cc-op-add-onda').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault(); ccOpOndaAdd(el.getAttribute('data-vid'));
      });

      // ---- ondas (a lista ordenada) ----
      const base = ccOpChegadaBase(a);
      const offsets = ccOpCalcularOffsets(a);
      const listaU = ccUnidadesUI();
      boxO.innerHTML = (a.ondas || []).length ? a.ondas.map((o, i) => {
        const v = CCVILAS.find((z) => String(z.vid) === String(o.vid));
        const nome = v ? ((v.nome ? v.nome + ' ' : '') + (v.coord || o.vid)) : o.vid;
        const chega = base ? base + offsets[o.id] : 0;
        const manual = (o.offsetMs != null);
        // Saída: pela unidade mais lenta DESTA onda, na distância real origem→alvo.
        const tViagem = (v && v.x != null && alvoP) ? ccTempoViagemMs(v.x, v.y, alvoP.x, alvoP.y, o.amounts) : null;
        const sai = (chega && tViagem != null) ? chega - tViagem : null;
        // Disponível pra ESTA caixa = sobra geral + o que esta própria onda já usa dessa unidade
        // (senão a onda pareceria não poder nem manter o que ela mesma já tem).
        const dispBase = ccOpDisponivel(o.vid);
        const campos = listaU.map(([u, rot]) => {
          const meu = (o.amounts && o.amounts[u]) || 0;
          const disp = (dispBase[u] || 0) + meu;
          return '<label style="display:flex;flex-direction:column;align-items:center;gap:1px" title="' + esc(rot) + ' — sobra ' + fmtN(disp) + ' pra esta onda">' +
            unitIcon(u, rot) +
            '<input class="cc-op-amt" data-id="' + o.id + '" data-u="' + u + '" type="number" min="0" placeholder="0" ' +
              'value="' + (meu || '') + '" style="width:40px;padding:1px;text-align:center;font-size:10px">' +
            '<span style="font-size:8px;color:#8a7d6d">' + fmtN(disp) + '</span>' +
          '</label>';
        }).join('');
        return '<div style="border-bottom:1px solid rgba(0,0,0,.07);padding:4px 5px">' +
          '<div style="display:grid;grid-template-columns:18px 1fr 70px 84px 46px;gap:5px;align-items:center;font-size:10px">' +
            '<span style="color:#a2643a">' + (i + 1) + '</span>' +
            '<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(nome) + '</span>' +
            '<select class="cc-op-tipo twmgr-inp" data-id="' + o.id + '" style="font-size:9px;padding:1px">' +
              '<option value="attack"' + (o.tipo !== 'support' ? ' selected' : '') + '>⚔ ataque</option>' +
              '<option value="support"' + (o.tipo === 'support' ? ' selected' : '') + '>🛡 apoio</option></select>' +
            '<input class="cc-op-chega" data-id="' + o.id + '" value="' + (chega ? srvClockMs(chega) : '') + '" placeholder="—" ' +
              'title="horário de chegada desta onda; edite pra calibrar" ' +
              'style="width:100%;padding:1px;text-align:center;font-size:10px;color:' + (manual ? '#8b5426' : '#2e7d3a') + ';font-weight:' + (manual ? '700' : '400') + '">' +
            '<span style="text-align:right;white-space:nowrap">' +
              '<a class="cc-op-up" data-id="' + o.id + '" href="#" style="color:#a2643a" title="subir">▲</a> ' +
              '<a class="cc-op-dn" data-id="' + o.id + '" href="#" style="color:#a2643a" title="descer">▼</a> ' +
              '<a class="cc-op-rm" data-id="' + o.id + '" href="#" style="color:#c0483a" title="remover">✕</a></span>' +
          '</div>' +
          '<div style="margin:2px 0 0 23px;font-size:9px;color:#8a7d6d">' +
            'sai <b style="color:#6f6153">' + (sai ? srvClockMs(sai) : '—') + '</b>' +
            (tViagem == null ? ' <span style="color:#a2643a">(digite tropa pra calcular)</span>' : '') +
            ' <span style="margin-left:8px">dividir em</span> ' +
            '<input class="cc-op-divn" data-id="' + o.id + '" type="number" min="2" max="20" value="2" style="width:32px;padding:0 2px;font-size:9px">' +
            ' <a class="cc-op-div" data-id="' + o.id + '" href="#" style="color:#2e7d3a">✂ dividir</a>' +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px;margin:3px 0 0 23px">' + campos + '</div>' +
        '</div>';
      }).join('') : '<div style="color:#8a7d6d;padding:6px;font-size:10px">— marque uma aldeia acima pra criar a 1ª onda —</div>';

      boxO.querySelectorAll('.cc-op-amt').forEach((el) => el.onchange = () => {
        const o = a.ondas.find((z) => z.id === el.getAttribute('data-id')); if (!o) return;
        const n = parseInt(el.value, 10) || 0;
        o.amounts = o.amounts || {};
        if (n > 0) o.amounts[el.getAttribute('data-u')] = n; else delete o.amounts[el.getAttribute('data-u')];
        save(); ccOpRender();   // reflete no "sai" (unidade mais lenta pode mudar) e nos totais
      });
      boxO.querySelectorAll('.cc-op-tipo').forEach((el) => el.onchange = () => {
        const o = a.ondas.find((z) => z.id === el.getAttribute('data-id')); if (!o) return;
        o.tipo = el.value; save();
      });
      // Calibrar: digitar HH:MM:SS.mmm fixa o offset desta onda (deixa de seguir o gap).
      boxO.querySelectorAll('.cc-op-chega').forEach((el) => el.onchange = () => {
        const o = a.ondas.find((z) => z.id === el.getAttribute('data-id')); if (!o || !base) return;
        const m = (el.value || '').match(/(\d{1,2}):(\d{2}):(\d{2})(?:[.,:](\d{1,3}))?/);
        if (!m) { ccOpRender(); return; }
        const d = new Date(base - wallToServerOffset());
        d.setHours(+m[1], +m[2], +m[3], m[4] ? +(m[4] + '00').slice(0, 3) : 0);
        o.offsetMs = Math.round((d.getTime() + wallToServerOffset()) - base);
        save(); ccOpRender();
      });
      boxO.querySelectorAll('.cc-op-up').forEach((el) => el.onclick = (ev) => { ev.preventDefault(); ccOpOndaMover(el.getAttribute('data-id'), -1); });
      boxO.querySelectorAll('.cc-op-dn').forEach((el) => el.onclick = (ev) => { ev.preventDefault(); ccOpOndaMover(el.getAttribute('data-id'), 1); });
      boxO.querySelectorAll('.cc-op-rm').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault();
        a.ondas = a.ondas.filter((z) => z.id !== el.getAttribute('data-id'));
        save(); ccOpRender();
      });
      boxO.querySelectorAll('.cc-op-div').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault();
        const id = el.getAttribute('data-id');
        const nEl = boxO.querySelector('.cc-op-divn[data-id="' + id + '"]');
        ccOpOndaDividir(id, nEl ? nEl.value : 2);
      });
      if (boxR) boxR.innerHTML = ccOpResumo(a);
    }
    // Arma TODAS as ondas do alvo ativo, cada uma com o seu horário. O disparo em si é o
    // mesmo motor de precisão dos comandos avulsos — cmdAdicionar entrega pro cmdTick.
    function ccOpArmarAtivo(dizer) {
      const a = ccOpAtivo();
      if (!a) return dizer('Crie um alvo primeiro.');
      const alvoP = ccCoordParse(a.coord);
      if (!alvoP) return dizer('Alvo inválido. Use 478|586.');
      const base = ccOpChegadaBase(a);
      if (!base) return dizer('Defina o horário de chegada da 1ª onda.');
      if (!(a.ondas || []).length) return dizer('Nenhuma onda neste alvo.');
      const apoio = a.ondas.some((o) => o.tipo === 'support');
      if (apoio && !config.cmd.suporteOkAt) {
        return dizer('Tem onda de apoio, mas o parâmetro de apoio ainda não foi confirmado neste mundo.');
      }
      const offsets = ccOpCalcularOffsets(a);
      let armados = 0; const pulados = [];
      a.ondas.forEach((o, i) => {
        const rotO = 'onda ' + (i + 1);
        const v = CCVILAS.find((z) => String(z.vid) === String(o.vid));
        if (!v) { pulados.push(rotO + ' (aldeia sumiu)'); return; }
        const amounts = {};
        Object.keys(o.amounts || {}).forEach((u) => { if (o.amounts[u] > 0) amounts[u] = o.amounts[u]; });
        if (!Object.keys(amounts).length) { pulados.push(rotO + ' (sem tropa)'); return; }
        const chega = base + offsets[o.id];
        const t = (v.x != null) ? ccTempoViagemMs(v.x, v.y, alvoP.x, alvoP.y, amounts) : null;
        if (t != null && (chega - t) <= srvNowP()) { pulados.push(rotO + ' (longe demais)'); return; }
        cmdAdicionar(o.tipo === 'support' ? 'support' : 'attack', alvoP.x, alvoP.y, amounts, chega, v.vid);
        armados++;
      });
      ccHistAdd(alvoP.coord); ccHistRender();
      save();
      if (!armados) return dizer('Nada armado. ' + (pulados.length ? pulados.join(', ') : ''));
      dizer(armados + ' onda(s) armada(s) → ' + alvoP.coord + ', a 1ª chegando ' + srvClockMs(base) +
            (pulados.length ? ' · pulada(s): ' + pulados.join(', ') : ''),
            pulados.length ? '#a2643a' : '#2e7d3a');
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
            (pulados.length ? ' · ' + pulados.length + ' pulado(s)' : ''), '#2e7d3a');
    }

    // Arma um comando POR ORIGEM marcada, todos com a MESMA chegada — é isso que faz
    // apoio/ataque de várias aldeias pousar junto.
    function ccArmar() {
      const msg = document.getElementById('cc-msg');
      const dizer = (t, cor) => { if (msg) { msg.textContent = t; msg.style.color = cor || '#c0483a'; } };
      const tipo = ccTipo();

      const arriveAt0 = ccChegadaMs();
      // Fake tem caminho próprio: vários alvos de uma vez, com distribuição escolhida.
      if (tipo === 'fake') return ccArmarFakes(dizer, arriveAt0);

      // Operação tem caminho próprio: alvos e ondas com horário calibrado por leva.
      if (tipo === 'op') return ccOpArmarAtivo(dizer);

      const alvo = ccAlvo();
      if (!alvo) return dizer('Alvo inválido. Use 478|586.');
      const arriveAt = arriveAt0;
      if (!arriveAt) return dizer('Defina o horário de chegada.');
      if (arriveAt <= srvNowP()) return dizer('Esse horário já passou.');
      ccHistAdd(alvo.coord); ccHistRender();
      if (tipo === 'support' && !config.cmd.suporteOkAt) {
        return dizer('Rode o teste de apoio antes — o parâmetro ainda não foi confirmado neste mundo.');
      }
      const comp = ccComposicao();
      if (!Object.keys(comp.amounts).length && !Object.keys(comp.max).length) {
        return dizer('Escolha as tropas aqui em cima.');
      }
      const marcadas = CCVILAS.filter((v) => config.cmd.origens[v.vid]);
      if (!marcadas.length) return dizer('Marque ao menos uma origem.');

      let armados = 0, pulados = [];
      let semTropaAgora = 0;
      marcadas.forEach((v) => {
        const nome = v.coord || v.vid;
        // Tropa manual desta aldeia (⚙ na lista de Origens) tem prioridade sobre o modelo global.
        const ov = ccOrigOverrideGet(v.vid);
        const compOrigem = ov || comp;
        const amounts = ccResolverPara(compOrigem, v.avail);
        if (!Object.keys(amounts).length) { pulados.push(nome + ' (nada a enviar)'); return; }
        // Tropa faltando NÃO impede agendar: você pode estar marcando um ataque full pra daqui
        // a horas, com a tropa saqueando agora. O preparo (60s antes) é que confere de verdade.
        if (!ccTemTropa(v, compOrigem)) semTropaAgora++;
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
            semTropaAgora ? '#a2643a' : '#2e7d3a');
    }

    // ---- Apoio em massa ----
    // Grade de unidades: um campo por unidade do mundo. Aceita número, "50%" ou "tudo".
    function ccMassaUnidades() {
      const cont = document.getElementById('cc-massa-unidades'); if (!cont) return;
      const listaU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]).filter((u) => u !== 'snob');
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      const antes = {};
      cont.querySelectorAll('.cc-massa-u').forEach((el) => { antes[el.getAttribute('data-u')] = el.value; });
      cont.innerHTML = listaU.map((u) =>
        '<label style="display:flex;align-items:center;gap:3px;font-size:10px" title="' + esc(rot[u] || u) + '">' +
          unitIcon(u, rot[u] || u) +
          '<input class="cc-massa-u twmgr-inp" data-u="' + u + '" value="' + esc(antes[u] || '') + '" style="width:50px;font-size:10px;padding:1px" placeholder="0">' +
        '</label>').join('');
    }
    // Lê a especificação digitada: {unidade: {mode:'all'|'pct'|'qty', val}}
    function ccMassaSpec() {
      const spec = {};
      document.querySelectorAll('.cc-massa-u').forEach((el) => {
        const u = el.getAttribute('data-u');
        const raw = (el.value || '').trim().toLowerCase();
        if (!raw) return;
        if (/^(tudo|todas|todos|all|max|\*)$/.test(raw)) spec[u] = { mode: 'all' };
        else if (/%$/.test(raw)) { const p = parseFloat(raw.replace(',', '.')); if (p > 0) spec[u] = { mode: 'pct', val: p }; }
        else { const q = parseInt(raw.replace(/\D/g, ''), 10); if (q > 0) spec[u] = { mode: 'qty', val: q }; }
      });
      return spec;
    }
    // Resolve a spec contra o disponível de UMA aldeia -> {unidade: contagem}
    function ccMassaResolver(spec, avail) {
      const a = {};
      Object.keys(spec).forEach((u) => {
        const have = (avail && avail[u]) || 0;
        if (!have) return;
        const s = spec[u];
        let n = s.mode === 'all' ? have : s.mode === 'pct' ? Math.floor(have * s.val / 100) : Math.min(s.val, have);
        if (n > 0) a[u] = n;
      });
      return a;
    }
    // Divide um conjunto de tropas em N partes (resto vai pras primeiras).
    function ccMassaDividir(amounts, n) {
      const partes = Array.from({ length: n }, () => ({}));
      Object.keys(amounts).forEach((u) => {
        const base = Math.floor(amounts[u] / n);
        let resto = amounts[u] - base * n;
        for (let i = 0; i < n; i++) {
          const q = base + (resto > 0 ? 1 : 0); if (resto > 0) resto--;
          if (q > 0) partes[i][u] = q;
        }
      });
      return partes;
    }
    async function ccMassaEnviar() {
      const msg = document.getElementById('cc-massa-msg');
      const rel = document.getElementById('cc-massa-rel');
      const diz = (t, cor) => { if (msg) { msg.textContent = t; msg.style.color = cor || '#c0483a'; } };
      if (!config.cmd.suporteOkAt) return diz('O apoio ainda não foi verificado neste mundo — deixe a praça aberta alguns segundos e tente de novo.');
      const alvos = ((document.getElementById('cc-massa-alvos') || {}).value || '').split(/\n/)
        .map((s) => { const m = s.match(/(\d{1,3})\s*\|\s*(\d{1,3})/); return m ? { x: m[1], y: m[2] } : null; })
        .filter(Boolean);
      if (!alvos.length) return diz('Informe ao menos um alvo (ex: 500|600).');
      alvos.forEach((a) => ccHistAdd(a.x + '|' + a.y)); ccHistRender();
      const spec = ccMassaSpec();
      if (!Object.keys(spec).length) return diz('Escolha as tropas (número, "50%" ou "tudo").');
      const marcadas = CCVILAS.filter((v) => config.cmd.origens[v.vid]);
      if (!marcadas.length) return diz('Marque as origens na lista acima.');
      const dividir = (document.getElementById('cc-massa-dividir') || {}).checked && alvos.length > 1;

      const rotU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]).filter((u) => u !== 'snob');
      const rotNome = {}; UNITS.forEach(([u, n]) => { rotNome[u] = n; });
      diz('Enviando… (não feche a praça)', '#6f6153'); if (rel) rel.textContent = '';
      const linhas = []; const totais = {}; let enviados = 0, falhas = 0;
      for (const v of marcadas) {
        const resolvido = ccMassaResolver(spec, v.avail);
        if (!Object.keys(resolvido).length) { linhas.push((v.coord || v.vid) + ' — sem tropa disponível'); continue; }
        const partes = dividir ? ccMassaDividir(resolvido, alvos.length) : alvos.map(() => Object.assign({}, resolvido));
        for (let i = 0; i < alvos.length; i++) {
          const amounts = partes[i];
          if (!amounts || !Object.keys(amounts).length) continue;
          const slots = rotU.map((u) => amounts[u] || 0).join('/');
          try {
            const prep = await cmdPrepare(v.vid, alvos[i].x, alvos[i].y, amounts, 'support');
            await cmdFire(prep);
            enviados++;
            Object.keys(amounts).forEach((u) => { totais[u] = (totais[u] || 0) + amounts[u]; });
            linhas.push((v.coord || v.vid) + (v.nome ? ' ' + v.nome : '') + ' → ' + alvos[i].x + '|' + alvos[i].y + ': ' + slots);
          } catch (e) {
            falhas++;
            linhas.push((v.coord || v.vid) + ' → ' + alvos[i].x + '|' + alvos[i].y + ': ✕ ' + (e.message || e).toString().slice(0, 40));
          }
          await sleep(150);   // pequeno gap entre envios pra não atropelar o servidor
        }
      }
      const header = 'ordem: ' + rotU.map((u) => rotNome[u] || u).join('/');
      const total = 'TOTAL: ' + rotU.map((u) => totais[u] || 0).join('/');
      if (rel) rel.textContent = header + '\n' + linhas.join('\n') + '\n────────\n' + total;
      diz(enviados + ' apoio(s) enviado(s)' + (falhas ? ' · ' + falhas + ' falha(s)' : '') + '.', falhas ? '#a2643a' : '#2e7d3a');
      pushLog('🚚 Apoio em massa: ' + enviados + ' envio(s)' + (falhas ? ', ' + falhas + ' falha(s)' : '') + '.', falhas ? 'err' : 'ok', 'cmd');
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
            const m = {}, p = {};
            arr.forEach((v) => { const k = v.x + '|' + v.y; m[k] = v.name; p[k] = v.player; });
            _mapaNomes = m; _mapaPlayers = p; ccRender(); ccHistRender();
          }).catch(() => { _mapaNomes = {}; });
        }
        return '';
      }
      return _mapaNomes[coord] || '';
    }
    // Dono da aldeia alvo: village.txt dá o id do jogador; player.txt (lazy) dá o nome.
    let _mapaPlayers = null, _mapaDonos = null, _donosCarregando = false;
    function ccDonoAlvo(coord) {
      const pid = _mapaPlayers && _mapaPlayers[coord];
      if (pid == null) return '';
      if (pid === '0' || pid === 0) return 'bárbaro';
      if (!_mapaDonos) {
        if (!_donosCarregando) {
          _donosCarregando = true;
          fetch('/map/player.txt', { credentials: 'include' }).then((r) => r.text()).then((txt) => {
            const d = {};
            txt.split('\n').forEach((ln) => {
              const f = ln.split(','); if (f.length >= 2) { try { d[f[0]] = decodeURIComponent(f[1].replace(/\+/g, ' ')); } catch (e) { d[f[0]] = f[1]; } }
            });
            _mapaDonos = d; ccHistRender(); ccRender();
          }).catch(() => { _mapaDonos = {}; });
        }
        return '';
      }
      return _mapaDonos[pid] || '';
    }
    // ---- Histórico de alvos ----
    function ccHistAdd(coord) {
      if (!coord) return;
      const h = (config.cmd.histAlvos = config.cmd.histAlvos || []);
      const i = h.findIndex((x) => x.coord === coord);
      if (i >= 0) h.splice(i, 1);
      h.unshift({ coord: coord, at: Date.now() });
      config.cmd.histAlvos = h.slice(0, 12);
      save();
    }
    function ccHistRender() {
      const cont = document.getElementById('cc-alvo-hist'); if (!cont) return;
      const h = config.cmd.histAlvos || [];
      if (!h.length) { cont.innerHTML = ''; return; }
      cont.innerHTML = '<span style="color:#584526">recentes:</span> ' + h.map((x) => {
        const nome = ccNomeAlvo(x.coord), dono = ccDonoAlvo(x.coord);
        const rot = x.coord + (nome ? ' ' + nome : '') + (dono ? ' (' + dono + ')' : '');
        return '<a class="cc-hist-a" data-coord="' + x.coord + '" style="cursor:pointer;color:#a2643a;margin-right:2px" title="' + esc(rot) + '"><b>' + esc(x.coord) + '</b>' +
          (nome ? ' <span style="color:#8a7d6d">' + esc(nome) + '</span>' : '') + '</a>';
      }).join(' · ');
      cont.querySelectorAll('.cc-hist-a').forEach((el) => el.onclick = () => {
        const al = document.getElementById('cc-alvo'); if (al) { al.value = el.getAttribute('data-coord'); al.dispatchEvent(new Event('input')); }
      });
    }

    // Uma origem "tem tropa" se atende TODAS as quantidades pedidas e, para as unidades
    // marcadas como "tudo", tem pelo menos 1. Critério único, usado pela lista e pelo botão.
    function ccTemTropa(v, comp) {
      const av = v.avail || {};
      for (const u in comp.amounts) { if ((av[u] || 0) < comp.amounts[u]) return false; }
      for (const u in comp.max) { if (!(av[u] > 0)) return false; }
      return true;
    }

    // ---- Tropa manual por aldeia (sobrepõe o modelo global de "Tropas por origem") ----
    // Mesmo formato de ccComposicao() ({amounts,max}), então ccResolverPara() atende os dois.
    // Guardado em config.cmd.origOverride[vid]. _ccOrigAbertos é só estado de UI (não persiste).
    let _ccOrigAbertos = {};
    function ccOrigOverrideGet(vid) { return (config.cmd.origOverride && config.cmd.origOverride[vid]) || null; }
    function ccOrigOverrideSet(vid, amounts) {
      config.cmd.origOverride = config.cmd.origOverride || {};
      if (Object.keys(amounts).some((u) => amounts[u] > 0)) config.cmd.origOverride[vid] = { amounts: amounts, max: {} };
      else delete config.cmd.origOverride[vid];
      save();
    }
    function ccOrigOverrideHTML(v) {
      const ov = ccOrigOverrideGet(v.vid);
      const listaU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      return '<div class="cc-ov-edit" style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:5px;align-items:center;' +
        'margin:4px 0 1px 24px;padding:5px 6px;background:#fbf7ee;border:1px solid #ece4d8;border-radius:5px">' +
        '<span style="font-size:9px;color:#6f6153;width:100%">tropa manual desta aldeia (ignora o modelo acima):</span>' +
        listaU.map((u) => '<label style="display:flex;flex-direction:column;align-items:center;font-size:8px;color:#6f6153;gap:1px">' +
          unitIcon(u, rot[u] || u) +
          '<input class="cc-ov-inp" data-vid="' + v.vid + '" data-u="' + u + '" type="number" min="0" ' +
            'value="' + ((ov && ov.amounts[u]) || '') + '" placeholder="0" style="width:38px;padding:1px;text-align:center;font-size:10px">' +
        '</label>').join('') +
        (ov ? '<a class="cc-ov-clear" data-vid="' + v.vid + '" href="#" style="font-size:9px;color:#c0483a;cursor:pointer;margin-left:4px">✕ usar modelo</a>' : '') +
      '</div>';
    }

    // ---- Filtro de grupo nas Origens (mesma ideia do filtro do módulo Fakes) ----
    let _ccGrupoVidsSet = null;
    async function ccAplicarFiltroGrupo() {
      const gid = config.cmd.origGrupo || '';
      if (!gid) { _ccGrupoVidsSet = null; ccRenderOrigens(); return; }
      try {
        const vs = await getVillagesInGroup(gid);
        _ccGrupoVidsSet = new Set(vs.map((x) => String(x.vid)));
      } catch (e) {
        _ccGrupoVidsSet = null;
        pushLog('Centro de Comando: não consegui filtrar pelo grupo (' + (e.message || e) + ').', 'err', 'cmd');
      }
      ccRenderOrigens();
    }
    async function ccCarregarGrupos() {
      const sel = document.getElementById('cc-org-grupo'); if (!sel) return;
      let grupos = []; try { grupos = await getGroups(); } catch (e) { /* sem grupos: fica só "Todas" */ }
      const cur = config.cmd.origGrupo || '';
      sel.innerHTML = '<option value="">Todas as aldeias</option>' +
        grupos.map((g) => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('');
      sel.value = cur;
      if (cur) ccAplicarFiltroGrupo();   // grupo já estava salvo de uma sessão anterior: reaplica
    }

    // Lista de origens: cada aldeia sua com distância, tempo de viagem pela unidade mais lenta
    // e se tem tropa suficiente. É o que permite escolher de onde sai o quê.
    let CCVILAS = [];
    async function ccCarregarOrigens(forcar) {
      const cont = document.getElementById('cc-origens');
      if (cont && !CCVILAS.length) cont.innerHTML = '<div style="color:#8a7d6d;padding:6px;font-size:10px">carregando aldeias…</div>';
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
        ccMassaUnidades();   // grade do apoio em massa também segue as unidades do mundo
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

      // Filtro de grupo: restringe as aldeias exibidas (não mexe na leitura de tropas nem em
      // seleções já feitas fora do grupo visível — só o que aparece na lista).
      const vilas = _ccGrupoVidsSet ? CCVILAS.filter((v) => _ccGrupoVidsSet.has(String(v.vid))) : CCVILAS;
      const linhas = vilas.map((v) => {
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
        const ov = ccOrigOverrideGet(v.vid);
        const aberto = !!_ccOrigAbertos[v.vid];
        let sit, cor;
        if (!L.temTropa) { sit = '⚠ sem tropa'; cor = '#c0483a'; }
        else if (L.daTempo === false) { sit = '⚠ longe demais'; cor = '#c0483a'; }
        else if (L.t != null && ch) { sit = 'sai ' + srvClockMs(ch - L.t); cor = '#2e7d3a'; }
        else { sit = ''; cor = '#8a7d6d'; }
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
            ? '<span style="color:#1f6fb2">+' + fmtN(foraT) + '</span>' : '';
          return '<span title="' + esc(rot) + (foraT ? ' · ' + fmtN(foraT) + ' fora/voltando' : '') +
                 '" style="color:' + (falta ? '#c0483a' : pedida ? '#a2643a' : '#584526') + '">' +
                 unitIcon(u, rot) + fmtN(q) + extra + '</span>';
        }).filter(Boolean).join(' ');
        return '<label style="display:block;padding:3px 5px;border-bottom:1px solid rgba(0,0,0,.07);cursor:pointer">' +
          '<span style="display:grid;grid-template-columns:18px 128px 40px 58px 40px 1fr;gap:6px;align-items:center;font-size:10px">' +
            '<input type="checkbox" data-cc-org="' + v.vid + '"' + (on ? ' checked' : '') + '>' +
            '<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis" title="' + esc((v.nome || '') + ' ' + (v.coord || '')) + '">' +
              (v.nome ? '<b style="color:#584526">' + esc(v.nome) + '</b> ' : '') +
              '<span style="color:#a2643a">' + esc(v.coord || v.vid) + '</span>' +
            '</span>' +
            '<span style="color:#8a7d6d">' + (L.d == null ? '—' : L.d.toFixed(1) + ' c') + '</span>' +
            '<span style="color:#6f6153">' + (L.t == null ? '—' : fmt(L.t)) + '</span>' +
            '<span style="color:#8a7d6d" title="unidade mais lenta que sai desta aldeia">' + (L.lenta ? esc(rotUn[L.lenta] || L.lenta) : '—') + '</span>' +
            '<span style="display:flex;align-items:center;justify-content:space-between;gap:4px">' +
              '<span style="color:' + cor + '">' + sit + '</span>' +
              '<a class="cc-ov-tog" data-vid="' + v.vid + '" href="#" title="' + (ov ? 'tropa manual definida pra esta aldeia — clique pra editar' : 'definir tropa manual só pra esta aldeia (ignora o modelo acima)') + '" style="cursor:pointer;text-decoration:none;color:' + (ov ? '#a2643a' : '#c4b9a8') + ';font-weight:' + (ov ? '700' : '400') + '">⚙</a>' +
            '</span>' +
          '</span>' +
          (tropas ? '<span style="display:block;font-size:9px;margin:1px 0 0 24px;line-height:1.5">' + tropas + '</span>' : '') +
          (aberto ? ccOrigOverrideHTML(v) : '') +
        '</label>';
      }).join('') || '<div style="color:#8a7d6d;padding:6px;font-size:10px">— nenhuma aldeia —</div>';

      cont.querySelectorAll('[data-cc-org]').forEach((el) => {
        el.onchange = () => {
          config.cmd.origens[el.getAttribute('data-cc-org')] = el.checked;
          if (!el.checked) delete config.cmd.origens[el.getAttribute('data-cc-org')];
          save(); ccResumo();
        };
      });
      // Tropa manual por aldeia: abre/fecha o editor, edita os números, ou volta pro modelo global.
      cont.querySelectorAll('.cc-ov-tog').forEach((el) => el.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const vid = el.getAttribute('data-vid');
        _ccOrigAbertos[vid] = !_ccOrigAbertos[vid];
        ccRenderOrigens();
      }));
      cont.querySelectorAll('.cc-ov-edit').forEach((el) => { el.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); }); });
      cont.querySelectorAll('.cc-ov-inp').forEach((el) => el.addEventListener('change', () => {
        const vid = el.getAttribute('data-vid');
        const amounts = {};
        cont.querySelectorAll('.cc-ov-inp[data-vid="' + vid + '"]').forEach((e2) => {
          const n = parseInt(e2.value, 10) || 0; if (n > 0) amounts[e2.getAttribute('data-u')] = n;
        });
        ccOrigOverrideSet(vid, amounts);
        ccResumo();
      }));
      cont.querySelectorAll('.cc-ov-clear').forEach((el) => el.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const vid = el.getAttribute('data-vid');
        if (config.cmd.origOverride) delete config.cmd.origOverride[vid];
        save(); ccRenderOrigens();
      }));
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
        av.innerHTML = !temComp ? '<span style="color:#8a7d6d">digite as tropas pra ver os tempos</span>'
          : ('unidade mais lenta: ' + txtLenta + ' · mundo ' + (m.speed || 1) + '×/' + (m.unitSpeed || 1) + '×' +
             (m.confiavel ? '' : ' · <span style="color:#a2643a">velocidades de reserva (o servidor confirma no preparo)</span>'));
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
      const base = n + ' de ' + CCVILAS.length + ' aldeia(s) marcada(s)' + (alvo ? ' → ' + alvo.coord : '') +
                   (ch ? ' · chegando ' + srvClockMs(ch) : '');
      // A Operação tem lista de aldeias e resumo próprios (por alvo), então este resumo
      // global — que fala das origens marcadas — não se aplica a ela.
      el.textContent = (ccTipo() === 'op') ? '' : base;
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

    // Abas da fila: "a enviar" x "enviados". Controla só a visibilidade; ccRender preenche as duas.
    function ccFilaTab(qual) {
      if (qual) { config.cmd.filaTab = qual; save(); }
      const q = config.cmd.filaTab || 'envio';
      const be = document.getElementById('cc-fila-envio');
      const bd = document.getElementById('cc-fila-enviados');
      if (be) be.style.display = (q === 'envio') ? 'block' : 'none';
      if (bd) bd.style.display = (q === 'enviados') ? 'block' : 'none';
      document.querySelectorAll('.cc-ftab').forEach((el) => {
        const on = el.getAttribute('data-ftab') === q;
        el.style.background = on ? '#ffffff' : '#ffffff';
        el.style.color = on ? '#a2643a' : '#8a7d6d';
        el.style.fontWeight = on ? '600' : '400';
        el.style.borderBottom = on ? '1px solid #ffffff' : '1px solid #ece4d8';
      });
    }
    // Resumo das tropas em TEXTO puro (pra title/tooltip): "50 Expl., 1000 Lanc."
    function ccTropaTxt(amounts) {
      if (!amounts) return 'sem tropa';
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      const listaU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      return listaU.filter((u) => (amounts[u] || 0) > 0).map((u) => fmtN(amounts[u]) + ' ' + (rot[u] || u)).join(', ') || 'sem tropa';
    }
    // Resumo visual das tropas de um comando: ícone + número, só as unidades > 0.
    function ccTropaResumo(amounts) {
      if (!amounts) return '';
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      const listaU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      return listaU.filter((u) => (amounts[u] || 0) > 0)
        .map((u) => '<span style="white-space:nowrap" title="' + esc(rot[u] || u) + '">' + unitIcon(u, rot[u] || u) + fmtN(amounts[u]) + '</span>')
        .join(' ');
    }
    function ccRender() {
      // Fila dividida: "a enviar" (novo/preparado/armado) e "enviados/concluídos" (o resto).
      const bEnvio = document.getElementById('cc-fila-envio');
      const bEnv = document.getElementById('cc-fila-enviados');
      if (!bEnvio || !bEnv) return;
      const f = cmdFila();
      const ord = document.getElementById('cc-fila-ordem');
      if (ord && ord.value !== config.cmd.filaOrdem) ord.value = config.cmd.filaOrdem;
      // Contador no cabeçalho, pra saber que há comandos mesmo com a seção recolhida.
      const cn = document.getElementById('cc-fila-n');
      if (cn) {
        const pend = f.filter((c) => c.state === 'novo' || c.state === 'preparado' || c.state === 'armado').length;
        cn.textContent = f.length ? ('(' + pend + ' pendente(s) de ' + f.length + ')') : '';
      }
      const agora = serverNow();
      const passo = Math.max(1, config.cmd.passoMs || 50);
      const corDe = { novo: '#6f6153', preparado: '#a2643a', armado: '#2e7d3a', enviado: '#2e7d3a', erro: '#c0483a', abortado: '#8a7d6d' };
      const linha = (c) => {
        // "falta" = quanto falta pra SAIR (não pra chegar). Preparado, sendAt é a saída exata;
        // antes disso estima pela viagem local (arriveAt − tempo de viagem).
        const estFalta = ccEstimaDeComando(c);
        const saiEm = c.sendAt ? c.sendAt : (estFalta != null ? c.arriveAt - estFalta : c.arriveAt);
        const falta = saiEm - agora;
        const dev = (c.desvioMs == null) ? '' : ((c.desvioMs >= 0 ? '+' : '') + c.desvioMs + 'ms');
        const vo = CCVILAS.find((z) => String(z.vid) === String(c.origin));
        const org = vo ? (vo.coord || vo.vid) : c.origin;
        const orgNome = vo && vo.nome ? vo.nome : '';
        const alvoNome = ccNomeAlvo(c.x + '|' + c.y);
        const rot = { support: 'apoio', fake: 'fake', nobre: 'nobre' }[c.tipo] || 'ataque';
        // Horário de saída: já confirmado pelo servidor (c.sendAt) ou, antes do preparo,
        // a estimativa local. A estimativa aparece com "~" pra não passar por certeza.
        let saiTxt = '—', saiCor = '#8a7d6d';
        if (c.sendAt) { saiTxt = srvClockMs(c.sendAt); saiCor = '#2e7d3a'; }
        else {
          const est = ccEstimaDeComando(c);
          if (est != null && c.arriveAt) { saiTxt = '~' + srvClockMs(c.arriveAt - est); saiCor = '#6f6153'; }
        }
        return '<div style="display:grid;grid-template-columns:42px 108px 108px 1fr 78px 78px 56px 18px;gap:4px;align-items:center;padding:3px 5px;border-bottom:1px solid rgba(0,0,0,.07);font-size:10px">' +
          '<span style="color:' + (c.tipo === 'support' ? '#1f6fb2' : '#b5602f') + '">' + rot + (c.ondas ? ' ' + c.onda + '/' + c.ondas : '') + '</span>' +
          '<span style="color:#8a7d6d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(orgNome || String(org)) + '">' +
            esc(String(org)) + (orgNome ? '<br><span style="color:#584526">' + esc(orgNome) + '</span>' : '') + '</span>' +
          '<span style="color:#a2643a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(alvoNome || (c.x + '|' + c.y)) + '">' +
            esc(c.x + '|' + c.y) + (alvoNome ? '<br><span style="color:#8a7d6d">' + esc(alvoNome) + '</span>' : '') + '</span>' +
          '<span style="color:' + (corDe[c.state] || '#6f6153') + '">' + esc(c.state) + (c.erro ? ' · ' + esc(c.erro.slice(0, 40)) : '') + '</span>' +
          '<span style="color:' + saiCor + '" title="horário de saída">' + saiTxt + '</span>' +
          '<span style="color:#6f6153">' + (c.arriveAt ? srvClockMs(c.arriveAt) : '—') + '</span>' +
          '<span style="text-align:right;color:' + (dev ? erroCor(Math.abs(c.desvioMs)) : '#8a7d6d') + '">' + (dev || (falta > 0 ? fmt(falta) : '—')) + '</span>' +
          (c.state === 'novo' || c.state === 'preparado' || c.state === 'armado'
            ? '<span data-cc-ab="' + c.id + '" style="cursor:pointer;color:#c0483a" title="abortar">✕</span>' : '<span></span>') +
          // Tropas que saem neste comando — largura total, pra não espremer a grade.
          '<span style="grid-column:1/-1;font-size:9px;color:#8a7d6d;margin:1px 0 0 46px;line-height:1.6">' +
            (ccTropaResumo(c.amounts) || '<span style="color:#584526">— sem tropa —</span>') + '</span>' +
          // Ajuste fino: mexe na CHEGADA e o horário de saída se recalcula sozinho.
          // Some depois que o comando entra no disparo, quando mudar já não é seguro.
          (ccEditavel(c)
            ? '<span style="grid-column:1/-1;text-align:right;font-size:9px;color:#8a7d6d;padding-top:1px">' +
                '<a data-aj="' + c.id + '" data-d="' + (-passo * 10) + '" style="cursor:pointer;color:#a2643a" title="−' + (passo * 10) + 'ms">≪</a> ' +
                '<a data-aj="' + c.id + '" data-d="' + (-passo) + '" style="cursor:pointer;color:#a2643a" title="−' + passo + 'ms">‹</a> ' +
                '<span style="color:#584526">ajuste</span> ' +
                '<a data-aj="' + c.id + '" data-d="' + passo + '" style="cursor:pointer;color:#a2643a" title="+' + passo + 'ms">›</a> ' +
                '<a data-aj="' + c.id + '" data-d="' + (passo * 10) + '" style="cursor:pointer;color:#a2643a" title="+' + (passo * 10) + 'ms">≫</a>' +
                ' &nbsp;<a data-sw="' + c.id + '" data-dir="-1" style="cursor:pointer;color:#2e7d3a" title="trocar de lugar com o de cima">▲</a>' +
                ' <a data-sw="' + c.id + '" data-dir="1" style="cursor:pointer;color:#2e7d3a" title="trocar de lugar com o de baixo">▼</a>' +
              '</span>'
            : '') +
          '</div>';
      };
      const ehEnvio = (c) => c.state === 'novo' || c.state === 'preparado' || c.state === 'armado';
      const ordenada = ccFilaOrdenada();
      const envio = ordenada.filter(ehEnvio);
      const feitos = ordenada.filter((c) => !ehEnvio(c));
      const vazio = (t) => '<div style="color:#8a7d6d;padding:6px;font-size:10px">' + t + '</div>';
      bEnvio.innerHTML = envio.length ? envio.map(linha).join('') : vazio('— nada a enviar —');
      bEnv.innerHTML = feitos.length ? feitos.map(linha).join('') : vazio('— nada enviado ainda —');
      const ne = document.getElementById('cc-ftab-n-envio'); if (ne) ne.textContent = '(' + envio.length + ')';
      const nd = document.getElementById('cc-ftab-n-enviados'); if (nd) nd.textContent = '(' + feitos.length + ')';
      [bEnvio, bEnv].forEach((box) => {
        box.querySelectorAll('[data-aj]').forEach((e) => e.onclick = () =>
          ccAjustar(e.getAttribute('data-aj'), parseInt(e.getAttribute('data-d'), 10)));
        box.querySelectorAll('[data-sw]').forEach((e) => e.onclick = () =>
          ccTrocar(e.getAttribute('data-sw'), parseInt(e.getAttribute('data-dir'), 10)));
        box.querySelectorAll('[data-cc-ab]').forEach((el) => el.onclick = () => cmdAbortar(el.getAttribute('data-cc-ab')));
      });
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
        if (document.hidden && !awakeAtivo()) partes.push('<b style="color:#c0483a">antichoke inativo — clique em Armar</b>');
        if (Math.abs(CLK.driftMs || 0) > 50) partes.push('<b style="color:#a2643a">relógio oscilando ' + Math.round(CLK.driftMs) + 'ms</b>');
        if (!window.Timing) partes.push('<b style="color:#c0483a">sem relógio do jogo!</b>');
        st.innerHTML = partes.join(' · ');
      }
      // Viés medido pelo laço fechado (ccMedir). Se ficar em "—" depois de vários envios, a
      // auto-calibração não está medindo a chegada — aí o ajuste manual é o caminho.
      const vi = document.getElementById('cc-vies');
      if (vi) {
        const k = (config.cmd && config.cmd.calib) || {};
        vi.innerHTML = 'viés <b style="color:' + (k.n ? '#2e7d3a' : '#8a7d6d') + '">' +
          (k.n ? (k.biasMs > 0 ? '+' : '') + Math.round(k.biasMs || 0) + 'ms' : '—') + '</b>' +
          (k.n ? ' (' + k.n + ' amostra' + (k.n > 1 ? 's' : '') + ')' : ' <span style="color:#584526">(não calibrou)</span>');
      }
      const agora = Date.now();
      if (agora - _ccLastRender >= 1000) { _ccLastRender = agora; ccRender(); }
    }

    // Botão de snipe direto na tela de ataques a caminho. O Centro de Comando só monta na praça,
    // mas é AQUI que se vê o ataque e se decide snipar — obrigar a trocar de tela e reencontrar
    // a linha era pedir demais.
    function mountSnipeIncomings() {
      if (!config.cmd || !config.cmd.enabled) return;
      const tb = document.querySelector('#incomings_table');
      if (!tb || tb.getAttribute('data-cc-snipe')) return;
      tb.setAttribute('data-cc-snipe', '1');

      const linhas = [...tb.querySelectorAll('tr')].filter((t) => t.querySelector('a[href*="screen=info_command"]'));
      if (!linhas.length) return;
      const co = (s) => { const m = (s || '').match(/(\d{1,3})\|(\d{1,3})/); return m ? (m[1] + '|' + m[2]) : null; };
      const dados = linhas.map((tr) => {
        const td = [...tr.querySelectorAll('td')].map((x) => (x.textContent || '').replace(/\s+/g, ' ').trim());
        return { tr: tr, destino: co(td[1]), origem: co(td[2]), chega: ccParseChegada(td[5]), temMs: /:\d{3}\s*$/.test(td[5] || '') };
      }).filter((d) => d.chega);
      dados.sort((a, b) => a.chega - b.chega);

      // Cabeçalho da coluna nova
      const thRow = tb.querySelector('tr');
      if (thRow && thRow.querySelector('th')) {
        const th = document.createElement('th');
        th.textContent = 'Snipe';
        th.style.cssText = 'text-align:center';
        thRow.appendChild(th);
      }
      dados.forEach((d, i) => {
        const jan = ccJanelaSnipe(dados, i);
        const td = document.createElement('td');
        td.style.cssText = 'text-align:center;white-space:nowrap';
        const viavel = ccSnipeViavel(jan);
        const titulo = ccSnipeTitulo(jan);
        td.innerHTML = '<a href="#" style="font-weight:bold;color:' + (viavel ? '#2e6b2e' : '#a11') + '" title="' + esc(titulo) + '">🎯 snipe</a>';
        td.querySelector('a').addEventListener('click', (ev) => {
          ev.preventDefault();
          if (!viavel) { alert(ccSnipeTitulo(jan)); return; }
          // Guarda o pedido e manda pra praça, onde o Centro de Comando o consome.
          localStorage.setItem(KEY + '_snipe', JSON.stringify({
            destino: d.destino, chegaEm: jan.ate, base: jan.base, de: jan.de,
            largura: jan.largura, exato: jan.exato, at: Date.now(),
          }));
          location.href = '/game.php?screen=place&cc_snipe=1';
        });
        d.tr.appendChild(td);
      });
      pushLog('Snipe disponível em ' + dados.length + ' ataque(s) a caminho.', '', 'cmd');
    }

    // ---- Comandos agendados na lista "Próprios comandos" da aldeia ----
    // Injeta os comandos AINDA NÃO ENVIADOS desta aldeia na tabela de comandos do jogo,
    // ordenados pela chegada, pra você conferir que encaixam no timing dos comandos reais.
    let _ccOvTimer = null;
    function ccOverviewTabela() {
      // "Próprios comandos" mora numa <table> dentro de #commands_outgoings.
      const cont = document.querySelector('#commands_outgoings');
      if (cont) { const t = cont.querySelector('table'); if (t) return t; }
      let tb = document.querySelector('#commands_table');
      if (tb) return tb;
      // Fallback: pela heading "Próprios comandos" ou por uma tabela com linhas de comando saindo.
      const heads = Array.prototype.slice.call(document.querySelectorAll('h4,th,caption,td,.vis'))
        .filter((e) => /pr[óo]prios comandos|own commands/i.test(e.textContent || ''));
      for (const h of heads) {
        const t = h.closest('table') || (h.parentElement && h.parentElement.querySelector('table'));
        if (t && t.querySelector('a[href*="screen=info_command"]')) return t;
      }
      const tabs = Array.prototype.slice.call(document.querySelectorAll('table'))
        .filter((t) => t.querySelector('a[href*="screen=info_command"]'));
      return tabs.find((t) => /ataque a|apoio a|retorno de/i.test(t.textContent || '')) || null;
    }
    function mountCmdOverview() {
      if (!config.cmd || !config.cmd.enabled) return;
      const tb = ccOverviewTabela();
      if (!tb) return;
      const body = tb.querySelector('tbody') || tb;
      body.querySelectorAll('tr[data-cc-ag]').forEach((el) => el.remove());
      const pend = (config.cmd.fila || []).filter((c) => String(c.origin) === String(CUR_VID) &&
        (c.state === 'novo' || c.state === 'preparado' || c.state === 'armado'));
      if (!pend.length) { if (_ccOvTimer) { clearInterval(_ccOvTimer); _ccOvTimer = null; } return; }
      const reais = Array.prototype.slice.call(body.querySelectorAll('tr'))
        .filter((t) => !t.hasAttribute('data-cc-ag') && t.querySelector('a[href*="screen=info_command"]'));
      const ncol = (reais[0] || body.querySelector('tr'));
      const nc = ncol ? Math.max(2, ncol.querySelectorAll('td').length) : 3;
      const arrOf = (tr) => {
        // O jogo carrega a chegada em data-endtime (epoch em segundos) — mais confiável que o texto.
        const t = tr.querySelector('.widget-command-timer[data-endtime]');
        if (t) return (+t.getAttribute('data-endtime')) * 1000;
        for (const td of tr.querySelectorAll('td')) { const ms = ccParseChegada(td.textContent || ''); if (ms) return ms; }
        return null;
      };
      pend.sort((a, b) => a.arriveAt - b.arriveAt).forEach((c) => {
        const nome = ccNomeAlvo(c.x + '|' + c.y);
        const rot = { support: 'Apoio', fake: 'Fake', nobre: 'Nobre' }[c.tipo] || 'Ataque';
        const est = ccEstimaDeComando(c);
        const saiEm = c.sendAt ? c.sendAt : (est != null ? c.arriveAt - est : null);
        const tr = document.createElement('tr');
        tr.className = 'command-row';
        tr.setAttribute('data-cc-ag', '1');
        tr.style.background = 'rgba(154,111,14,.12)';
        // Tropas só no hover (title da linha), pra manter one-liner.
        tr.title = 'Agendado na Central · ' + ccTropaTxt(c.amounts) + (saiEm ? ' · sai ' + srvClockMs(saiEm) : '');
        let html = '';
        for (let i = 0; i < nc; i++) html += '<td style="padding:4px 6px;white-space:nowrap;color:#a2643a">' +
          (i === 0
            ? '🕒 <b>' + esc(rot) + ' agendado</b> → ' + esc(c.x + '|' + c.y) + (nome ? ' ' + esc(nome) : '') +
              (saiEm ? ' <span style="color:#a98a4a">· sai ' + srvClockMs(saiEm) + '</span>' : '')
            : i === nc - 2 ? srvClockMs(c.arriveAt)
            : i === nc - 1 ? '<span class="cc-ov-falta" data-arr="' + c.arriveAt + '"></span>' +
                '<a href="#" class="cc-ov-x" data-id="' + c.id + '" title="cancelar comando agendado" style="color:#c0483a;font-weight:bold;margin-left:8px;text-decoration:none">✕</a>'
            : '') + '</td>';
        tr.innerHTML = html;
        let ref = null;
        for (const r of reais) { const a = arrOf(r); if (a && a > c.arriveAt) { ref = r; break; } }
        if (ref) body.insertBefore(tr, ref);
        else if (reais.length && reais[reais.length - 1].nextSibling) body.insertBefore(tr, reais[reais.length - 1].nextSibling);
        else body.appendChild(tr);
      });
      body.querySelectorAll('.cc-ov-x').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault();
        const c = (config.cmd.fila || []).find((z) => z.id === el.getAttribute('data-id'));
        cmdAbortar(el.getAttribute('data-id'));
        if (c) pushLog('🕒 Central: ' + (c.tipo === 'support' ? 'apoio' : 'ataque') + ' agendado → ' + c.x + '|' + c.y + ' cancelado.', '', 'cmd');
        mountCmdOverview();
      });
      const tick = () => {
        const now = serverNow();
        document.querySelectorAll('.cc-ov-falta').forEach((el) => { const a = +el.getAttribute('data-arr'); el.textContent = a ? fmt(a - now) : ''; });
        // Se o jogo re-renderizou a tabela e apagou as nossas linhas, re-injeta.
        if (!document.querySelector('tr[data-cc-ag]')) { clearInterval(_ccOvTimer); _ccOvTimer = null; mountCmdOverview(); }
      };
      tick();
      if (_ccOvTimer) clearInterval(_ccOvTimer);
      _ccOvTimer = setInterval(tick, 1000);
    }

    // Unidades que defendem. Usadas pra sugerir de onde mandar o snipe.
    const CC_DEF = ['spear', 'sword', 'heavy', 'archer'];
    // Valores de defesa do TW por unidade (geral/cavalaria/arqueiro). Serve pra ordenar os
    // candidatos por quanto realmente seguram, e não por número bruto de tropa.
    const CC_DEF_VAL = { spear: 15, sword: 25, heavy: 200, archer: 50 };
    function ccPoderDef(avail) {
      let p = 0;
      CC_DEF.forEach((u) => { p += (avail[u] || 0) * (CC_DEF_VAL[u] || 0); });
      return p;
    }
    // Quem consegue pousar DENTRO da janela, com a tropa que tem.
    function ccSnipeCandidatos(destino, chegaEm, ate) {
      const m = destino.match(/(\d+)\|(\d+)/); if (!m) return [];
      const tx = +m[1], ty = +m[2], agora = srvNowP();
      return CCVILAS.map((v) => {
        const comp = {};
        CC_DEF.forEach((u) => { if ((v.avail[u] || 0) > 0) comp[u] = v.avail[u]; });
        if (!Object.keys(comp).length) return null;
        const t = (v.x != null) ? ccTempoViagemMs(v.x, v.y, tx, ty, comp) : null;
        if (t == null) return null;
        const sai = chegaEm - t;
        // Precisa dar tempo de sair E a chegada tem que caber na janela.
        const viavel = (sai > agora + 5000) && (ate == null || chegaEm <= ate);
        return { v: v, comp: comp, t: t, sai: sai, viavel: viavel, poder: ccPoderDef(v.avail), folga: sai - agora };
      }).filter(Boolean).sort((a, b) => (b.viavel - a.viavel) || (b.poder - a.poder));
    }
    function ccSnipeModal(p) {
      const velho = document.getElementById('cc-snipe-modal'); if (velho) velho.remove();
      const cands = ccSnipeCandidatos(p.destino, p.chegaEm, p.ate);
      const viaveis = cands.filter((c) => c.viavel);
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });

      const ov = document.createElement('div');
      ov.id = 'cc-snipe-modal';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99999;display:flex;' +
                         'align-items:center;justify-content:center';
      ov.innerHTML =
        '<div style="background:linear-gradient(180deg,#fdfaf5,#fffdfa);border:1px solid #e0d6c6;border-radius:10px;' +
             'padding:12px;width:min(680px,94vw);max-height:86vh;overflow:auto;color:#8b5426;font-size:11px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<b style="color:#a2643a;font-size:13px">🎯 Snipe em ' + esc(p.destino || '?') + '</b>' +
            '<a id="cc-sn-x" style="cursor:pointer;color:#c0483a;font-size:14px">✕</a>' +
          '</div>' +
          '<div style="font-size:10px;color:#6f6153;margin-bottom:4px">' +
            'O ataque pousa às <b style="color:#c2593a">' + srvClockMs(p.base) + '</b> · ' +
            'o apoio chega às <b style="color:#2e7d3a">' + srvClockMs(p.chegaEm) + '</b>' +
            ' (<b>' + ccFolgaSnipe() + 'ms antes</b>)' +
            (p.largura != null ? ' · janela de <b>' + p.largura + 'ms</b> desde a onda anterior' : ' · sem onda anterior conhecida') +
            (p.exato ? '' : ' · <b style="color:#a2643a">chegada sem milésimos: 1s de incerteza</b>') +
          '</div>' +
          // A margem precisa ser maior que o erro de disparo: se o apoio atrasar mais que ela,
          // pousa DEPOIS do ataque e não serve pra nada.
          '<div style="font-size:10px;margin-bottom:8px">' +
            'chegar <input id="cc-sn-folga" class="twmgr-inp" type="number" min="0" step="50" ' +
              'value="' + ccFolgaSnipe() + '" style="width:66px;font-size:10px;padding:1px">ms antes do ataque ' +
            '<span id="cc-sn-folga-av"></span>' +
          '</div>' +
          (viaveis.length
            ? '<div style="display:grid;grid-template-columns:20px 96px 1fr 74px 70px;gap:6px;font-size:9px;color:#8a7d6d;padding:0 4px 3px">' +
                '<span></span><span>aldeia</span><span>tropas de defesa</span><span>sai às</span><span>folga</span></div>'
            : '') +
          '<div id="cc-sn-lista"></div>' +
          '<div id="cc-sn-msg" style="font-size:10px;margin:6px 0;min-height:12px"></div>' +
          '<div style="display:flex;gap:6px">' +
            '<button id="cc-sn-armar" class="twmgr-btn twmgr-go" style="flex:1">▶ Armar apoio das marcadas</button>' +
            '<button id="cc-sn-praca" class="twmgr-btn twmgr-ghost">só preencher no painel</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);

      const lista = ov.querySelector('#cc-sn-lista');
      lista.innerHTML = cands.length ? cands.slice(0, 25).map((c, i) =>
        '<label style="display:grid;grid-template-columns:20px 96px 1fr 74px 70px;gap:6px;align-items:center;' +
        'padding:3px 4px;border-bottom:1px solid rgba(0,0,0,.07);' + (c.viavel ? '' : 'opacity:.45;') + '">' +
          '<input type="checkbox" data-sn="' + i + '"' + (c.viavel && i === 0 ? ' checked' : '') + (c.viavel ? '' : ' disabled') + '>' +
          '<span style="color:#a2643a">' + esc(c.v.coord) + '</span>' +
          '<span style="color:#6f6153;font-size:10px">' +
            CC_DEF.filter((u) => c.comp[u]).map((u) => esc(rot[u] || u) + ' ' + fmtN(c.comp[u])).join(' · ') + '</span>' +
          '<span style="color:' + (c.viavel ? '#2e7d3a' : '#c0483a') + '">' + srvClockMs(c.sai) + '</span>' +
          '<span style="color:#8a7d6d">' + (c.folga > 0 ? fmt(c.folga) : 'tarde') + '</span>' +
        '</label>').join('')
        : '<div style="color:#c0483a;padding:8px;font-size:10px">Nenhuma aldeia sua tem tropa de defesa para este alvo.</div>';

      const msg = ov.querySelector('#cc-sn-msg');
      if (!viaveis.length && cands.length) {
        msg.style.color = '#c0483a';
        msg.textContent = 'Nenhuma aldeia chega a tempo: a mais rápida sairia ' + fmt(Math.abs(cands[0].folga)) + ' atrás.';
      }
      // Aviso vivo: margem menor que o erro de disparo é o cenário em que o snipe morre no ataque.
      const folgaEl = ov.querySelector('#cc-sn-folga'), folgaAv = ov.querySelector('#cc-sn-folga-av');
      const attFolga = () => {
        const e = erroEstimadoMs(), f = parseInt(folgaEl.value, 10) || 0;
        if (f < e) {
          folgaAv.innerHTML = '<b style="color:#c0483a">⚠ menor que o erro medido (±' + e + 'ms) — o apoio pode chegar DEPOIS do ataque e não segurar nada</b>';
        } else if (p.largura != null && f > p.largura) {
          folgaAv.innerHTML = '<b style="color:#c0483a">⚠ maior que a janela (' + p.largura + 'ms) — cairia antes da onda anterior e morreria nela</b>';
        } else {
          folgaAv.innerHTML = '<span style="color:#2e7d3a">✓ acima do erro medido (±' + e + 'ms)</span>';
        }
      };
      folgaEl.addEventListener('change', () => {
        config.cmd.snipeFolgaMs = Math.max(0, parseInt(folgaEl.value, 10) || 0); save();
        // A margem desloca a chegada — redesenha o popup inteiro pra os candidatos e os
        // horários refletirem o novo valor, em vez de mostrar número desatualizado.
        if (p.base != null) { ov.remove(); ccSnipeModal(Object.assign({}, p, { chegaEm: p.base - ccFolgaSnipe() })); }
      });
      folgaEl.addEventListener('input', attFolga);
      attFolga();
      ov.querySelector('#cc-sn-x').onclick = () => ov.remove();
      ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
      ov.querySelector('#cc-sn-praca').onclick = () => { ccPreencherSnipe(p); ov.remove(); };
      ov.querySelector('#cc-sn-armar').onclick = () => {
        const marcadas = [...lista.querySelectorAll('[data-sn]')].filter((e) => e.checked).map((e) => cands[+e.getAttribute('data-sn')]);
        if (!marcadas.length) { msg.style.color = '#c0483a'; msg.textContent = 'Marque ao menos uma aldeia.'; return; }
        if (!config.cmd.suporteOkAt) { msg.style.color = '#c0483a'; msg.textContent = 'O apoio ainda não foi verificado neste mundo — abra a praça de reunião uma vez.'; return; }
        const al = p.destino.split('|');
        let n = 0;
        marcadas.forEach((c) => { cmdAdicionar('support', al[0], al[1], c.comp, p.chegaEm, c.v.vid); n++; });
        save(); ccRender();
        msg.style.color = '#2e7d3a';
        msg.textContent = n + ' apoio(s) armado(s) chegando ' + srvClockMs(p.chegaEm) + '.';
        setTimeout(() => ov.remove(), 1800);
      };
    }
    function ccPreencherSnipe(p) {
      config.cmd.tipo = 'support'; save();
      const al = document.getElementById('cc-alvo');
      if (al && p.destino) al.value = p.destino;
      ccSetChegada(p.chegaEm);
      if (typeof _ccAttTipo === 'function') _ccAttTipo();
    }

    // Consome o pedido deixado pela tela de ataques.
    function ccConsumirSnipe() {
      let p = null;
      try { p = JSON.parse(localStorage.getItem(KEY + '_snipe') || 'null'); } catch (e) {}
      if (!p || (Date.now() - (p.at || 0)) > 120000) return;   // pedido velho: ignora
      localStorage.removeItem(KEY + '_snipe');
      ccPreencherSnipe(p);
      // O modal precisa das aldeias carregadas pra sugerir de onde mandar.
      const abrir = () => { if (CCVILAS.length) ccSnipeModal(p); else setTimeout(abrir, 500); };
      setTimeout(abrir, 300);
    }

    function mountCmdCenter() {
      if (!config.cmd || !config.cmd.enabled) return;
      if (document.getElementById('cc-painel')) return;
      const host = document.querySelector('#content_value') || document.querySelector('#contentContainer') || document.body;
      const d = document.createElement('div');
      d.id = 'cc-painel';
      d.style.cssText = 'background:linear-gradient(180deg,#fdfaf5,#fffdfa);border:1px solid #e0d6c6;border-radius:10px;padding:10px;margin:0 0 12px;color:#8b5426;font-size:11px';
      const row = (l, inner) => '<div class="twmgr-row" style="display:flex;align-items:center;gap:6px;margin:3px 0"><span style="min-width:120px;color:#6f6153">' + l + '</span>' + inner + '</div>';
      d.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<b style="color:#a2643a;font-size:13px">🚀 Centro de Comando <span style="color:#8a7d6d;font-size:10px;font-weight:400">v' + VERSION + '</span></b>' +
          '<b id="cc-clock" style="color:#a2643a;font-size:16px;font-variant-numeric:tabular-nums">--:--:--.---</b>' +
        '</div>' +
        '<div id="cc-saude" style="font-size:10px;color:#6f6153;margin-bottom:4px"></div>' +
        '<div id="cc-silencio" style="font-size:10px;color:#a2643a;margin-bottom:4px;min-height:12px"></div>' +
        // Ajuste de precisão: o viés adaptativo (ccMedir) deveria corrigir sozinho, mas dá pra
        // forçar aqui. "Atrasar chegada" positivo = chega mais tarde (corrige quando sai adiantado).
        '<div style="font-size:10px;color:#8a7d6d;margin-bottom:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<span title="Se os comandos chegam ADIANTADOS, aumente. Se atrasados, use negativo. Some ao viés que o sistema mede sozinho.">Atrasar chegada <input id="cc-atraso" class="twmgr-inp" type="number" step="10" style="width:60px;font-size:10px;padding:1px">ms</span>' +
          '<span style="color:#584526">(+ = mais tarde)</span>' +
          '<span id="cc-vies" style="margin-left:auto"></span>' +
        '</div>' +
        row('Alvo',
          '<input id="cc-alvo" class="twmgr-inp" style="width:130px;font-variant-numeric:tabular-nums" placeholder="478|586">' +
          '<span id="cc-alvo-ok" style="font-size:10px;color:#8a7d6d"></span>') +
        row('Chegada (servidor)',
          '<input id="cc-chegada" class="twmgr-inp" type="datetime-local" step="0.001" style="width:230px">' +
          '<button id="cc-ch-agora" class="twmgr-btn twmgr-ghost" style="padding:2px 6px;font-size:10px" title="preenche com a hora do servidor + 10 min">+10min</button>' +
          '<button id="cc-ch-cmd" class="twmgr-btn twmgr-ghost" style="padding:2px 6px;font-size:10px" title="copiar o horário de um comando do jogo">📋 de um comando</button>') +
        '<div id="cc-alvo-hist" style="font-size:10px;margin:2px 0 6px;line-height:1.8"></div>' +
        // Comandos do jogo: copiar horário pra coordenar em cima, ou escolher um pra snipar.
        '<div id="cc-cmds-box" style="display:none;border:1px solid #e0d6c6;border-radius:6px;padding:6px;margin:4px 0">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
            '<span style="font-size:10px">' +
              '<a id="cc-cmds-in" style="cursor:pointer;color:#a2643a">🛡 chegando em mim</a> · ' +
              '<a id="cc-cmds-out" style="cursor:pointer;color:#a2643a">⚔ meus em rota</a>' +
            '</span>' +
            '<span style="font-size:10px;color:#8a7d6d">deslocar ' +
              '<input id="cc-cmds-off" class="twmgr-inp" type="number" step="10" value="0" style="width:60px;font-size:10px;padding:1px">ms' +
              ' <a id="cc-cmds-fechar" style="cursor:pointer;color:#c0483a;margin-left:6px">✕</a></span>' +
          '</div>' +
          '<div id="cc-cmds-lista" style="height:220px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:6px"></div>' +
        '</div>' +
        // Abas em vez de rádios: cada tipo tem configuração própria, e a aba deixa claro
        // qual conjunto de campos está valendo.
        '<div id="cc-abas" style="display:flex;gap:2px;margin:8px 0 0">' +
          CC_TIPOS.map((t) =>
            '<div class="cc-aba" data-tipo="' + t.id + '" style="flex:1;text-align:center;padding:6px 4px;cursor:pointer;' +
            'border:1px solid #e0d6c6;border-bottom:none;border-radius:6px 6px 0 0;font-size:11px;user-select:none">' +
            t.ico + ' ' + t.rot + '</div>').join('') +
        '</div>' +
        '<div id="cc-aba-corpo" style="border:1px solid #e0d6c6;border-radius:0 6px 6px 6px;padding:8px;margin-bottom:8px">' +
          '<div id="cc-aba-hint" style="font-size:10px;color:#8a7d6d;margin-bottom:6px"></div>' +
        // Fake: dezenas de alvos de uma vez, com duas distribuições possíveis.
        '<div id="cc-fake-cfg" style="display:none">' +
          '<div style="font-size:10px;color:#6f6153;margin:4px 0 2px">Alvos do fake (cole vários)</div>' +
          '<textarea id="cc-fake-alvos" class="twmgr-inp" style="width:100%;height:54px;font-size:10px" ' +
            'placeholder="478|586 479|587 480|588 …"></textarea>' +
          '<div style="font-size:10px;margin:3px 0">' +
            '<label style="margin-right:10px;cursor:pointer"><input type="radio" name="cc-fakedist" value="rodizio"> rodízio — 1 fake por alvo, alternando as origens</label><br>' +
            '<label style="cursor:pointer"><input type="radio" name="cc-fakedist" value="todos"> todas × todos — cada origem manda 1 fake pra cada alvo</label>' +
          '</div>' +
          '<div id="cc-fake-previa" style="font-size:10px;color:#a2643a;margin-bottom:4px"></div>' +
        '</div>' +
        // OPERAÇÃO: um alvo por vez (o alvo é o container). Dentro dele, as aldeias
        // participantes e uma LISTA ORDENADA de ondas com horário calibrável.
        '<div id="cc-op-cfg" style="display:none">' +
          '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:5px">' +
            '<span style="font-size:10px;color:#6f6153">Alvo</span>' +
            '<select id="cc-op-sel" class="twmgr-inp" style="width:170px;font-size:10px;padding:1px"></select>' +
            '<button id="cc-op-novo" class="twmgr-btn twmgr-ghost" style="padding:2px 8px;font-size:10px">+ novo alvo</button>' +
            '<button id="cc-op-del" class="twmgr-btn twmgr-ghost" style="padding:2px 8px;font-size:10px" title="remove este alvo e as ondas dele">✕</button>' +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:6px">' +
            '<input id="cc-op-coord" class="twmgr-inp" placeholder="478|586" style="width:96px;font-size:10px;padding:2px">' +
            '<span style="font-size:10px;color:#6f6153">chega a 1ª onda</span>' +
            '<input id="cc-op-chegada" class="twmgr-inp" type="datetime-local" step="0.001" style="width:200px;font-size:10px;padding:1px">' +
            '<span style="font-size:10px;color:#6f6153">gap</span>' +
            '<input id="cc-op-gap" class="twmgr-inp" type="number" min="50" step="10" style="width:60px;font-size:10px;padding:1px">' +
            '<span style="font-size:10px;color:#8a7d6d">ms</span>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
            '<span style="font-size:9px;color:#6f6153">Aldeias deste alvo <span style="color:#8a7d6d">— marque e use <b>+ onda</b></span></span>' +
            '<span style="font-size:9px;color:#6f6153">grupo ' +
              '<select id="cc-op-grupo" class="twmgr-inp" style="width:110px;font-size:9px;padding:1px"><option value="">todas</option></select></span>' +
          '</div>' +
          '<div id="cc-op-vilas" style="height:220px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:6px;margin-bottom:6px"></div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
            '<span style="font-size:9px;color:#6f6153">Ondas <span style="color:#8a7d6d">(ordem de chegada)</span></span>' +
            '<a id="cc-op-limpar" style="cursor:pointer;color:#c0483a;font-size:9px">limpar ondas</a>' +
          '</div>' +
          '<div id="cc-op-ondas" style="height:380px;min-height:100px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:6px"></div>' +
          '<div id="cc-op-resumo" style="font-size:10px;color:#6f6153;margin-top:4px"></div>' +
        '</div>' +
          // Apoio em massa: aparece só quando a aba 🚚 está ativa. Usa as origens marcadas abaixo.
          '<div id="cc-massa-cfg" style="display:none">' +
            '<label style="font-size:10px;display:block">Alvo(s) <span style="color:#584526">(um por linha)</span></label>' +
            '<textarea id="cc-massa-alvos" class="twmgr-inp" style="width:100%;height:36px;font-size:10px" placeholder="500|600"></textarea>' +
            '<label style="font-size:10px;display:block;margin-top:3px;cursor:pointer"><input type="checkbox" id="cc-massa-dividir"> dividir as tropas entre os alvos (senão manda o cheio pra cada)</label>' +
            '<div style="font-size:9px;color:#8a7d6d;margin:4px 0 2px">Tropas por aldeia — número, <b>50%</b> ou <b>tudo</b>:</div>' +
            '<div id="cc-massa-unidades" style="display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 6px"></div>' +
            '<button id="cc-massa-enviar" class="twmgr-btn twmgr-go" style="width:100%">🚚 Enviar apoio agora</button>' +
            '<div id="cc-massa-msg" style="font-size:10px;margin-top:5px;min-height:12px"></div>' +
            '<div id="cc-massa-rel" style="font-size:10px;margin-top:4px;color:#6f6153;font-family:Consolas,monospace;white-space:pre-wrap;height:200px;min-height:60px;resize:vertical;overflow-y:auto"></div>' +
          '</div>' +
        '</div>' +   // fim de #cc-aba-corpo
        // Tropas digitadas AQUI, não nas caixas do jogo. "tudo" = manda o estoque inteiro daquela origem.
        '<div id="cc-tropas-sec" style="margin:8px 0 4px;border-top:1px solid #ece4d8;padding-top:6px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
            '<span data-sec="tropas" style="font-size:10px;color:#8b5426;font-weight:600;cursor:pointer" title="recolher/expandir">▾ Tropas por origem</span>' +
            '<span style="font-size:10px">' +
              '<a id="cc-tpl-salvar" style="cursor:pointer;color:#2e7d3a">+ salvar como modelo</a> · ' +
              '<a id="cc-tpl-limpar" style="cursor:pointer;color:#a2643a">limpar</a> · ' +
              '<a id="cc-tpl-restaurar" style="cursor:pointer;color:#8a7d6d" title="repõe Tudo/Nobre/Fake">padrão</a>' +
            '</span>' +
          '</div>' +
          '<div data-secbody="tropas">' +
          '<div id="cc-modelos" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px"></div>' +
          // Montada em ccRenderTropas() a partir das unidades que ESTE mundo tem — a lista fixa
          // de 12 mostrava arqueiro e arqueiro a cavalo em mundos que não os têm.
          '<div id="cc-tropas-grade" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:6px"></div>' +
          '</div>' +
        '</div>' +
        // Origens: cada aldeia com distância e tempo já calculados pela unidade mais lenta.
        '<div id="cc-origens-sec" style="margin:8px 0 4px;border-top:1px solid #ece4d8;padding-top:6px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">' +
            '<span data-sec="origens" style="font-size:10px;color:#8b5426;font-weight:600;cursor:pointer" title="recolher/expandir">▾ Origens</span>' +
            '<span style="font-size:10px">' +
              '<a id="cc-org-todas" style="cursor:pointer;color:#a2643a">todas</a> · ' +
              '<a id="cc-org-nenhuma" style="cursor:pointer;color:#a2643a">nenhuma</a> · ' +
              '<a id="cc-org-viaveis" style="cursor:pointer;color:#2e7d3a" title="marca só as aldeias que têm a tropa pedida E ainda dão tempo de chegar">✓ só as viáveis</a> · ' +
              '<a id="cc-org-recarregar" style="cursor:pointer;color:#a2643a">↻</a>' +
            '</span>' +
          '</div>' +
          // "total" conta a tropa que está fora e volta — necessário pra agendar um full
          // pra daqui a horas com a tropa saqueando agora.
          '<div data-secbody="origens">' +
          '<div style="font-size:10px;margin-bottom:3px">' +
            '<label style="margin-right:10px;cursor:pointer" title="linha &quot;Na Aldeia&quot; do jogo"><input type="radio" name="cc-fonte" value="casa"> na aldeia agora</label>' +
            '<label style="cursor:pointer" title="linha &quot;suas próprias&quot; do jogo: inclui o que está fora e em trânsito"><input type="radio" name="cc-fonte" value="total"> suas próprias (inclui fora/trânsito)</label>' +
          '</div>' +
          '<div style="font-size:10px;margin-bottom:5px;display:flex;align-items:center;gap:6px">' +
            '<span style="color:#6f6153">Grupo</span>' +
            '<select id="cc-org-grupo" class="twmgr-inp" style="width:170px;font-size:10px;padding:1px 4px"><option value="">Todas as aldeias</option></select>' +
          '</div>' +
          '<div id="cc-vel-aviso" style="font-size:10px;color:#8a7d6d;margin-bottom:3px"></div>' +
          '<div style="display:grid;grid-template-columns:18px 128px 40px 58px 40px 1fr;gap:6px;font-size:9px;color:#8a7d6d;padding:0 5px 2px">' +
            '<span></span><span>aldeia</span><span>dist.</span><span>viagem</span><span>mais lenta</span><span>saída</span></div>' +
          '<div id="cc-origens" style="height:240px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:6px"></div>' +
          '<div id="cc-resumo" style="font-size:10px;color:#6f6153;margin-top:3px"></div>' +
          '</div>' +
        '</div>' +
        '<div id="cc-armar-row" style="display:flex;gap:6px;align-items:center">' +
          '<button id="cc-armar" class="twmgr-btn twmgr-go" style="flex:1">▶ Armar comando</button>' +
          '<button id="cc-limpar" class="twmgr-btn twmgr-ghost" title="remove enviados/erros da lista">🧹</button>' +
          '<button id="cc-diag" class="twmgr-btn twmgr-ghost" title="copia um relatório do estado interno pra área de transferência">🐛</button>' +
        '</div>' +
        '<div id="cc-msg" style="font-size:10px;margin-top:5px;min-height:12px"></div>' +
        '<div id="cc-teste-out" style="font-size:10px;margin-top:3px"></div>' +
        '<div style="margin-top:8px;border-top:1px solid #ece4d8;padding-top:6px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">' +
            '<span data-sec="fila" style="font-size:10px;color:#8b5426;font-weight:600;cursor:pointer" title="recolher/expandir">▾ Fila <span id="cc-fila-n" style="color:#8a7d6d;font-weight:400"></span></span>' +
            '<span style="font-size:10px;color:#8a7d6d">ordenar por ' +
              '<select id="cc-fila-ordem" class="twmgr-inp" style="width:auto;font-size:10px;padding:1px">' +
                '<option value="chegada">chegada</option><option value="saida">saída</option></select>' +
              ' · passo <input id="cc-passo" class="twmgr-inp" type="number" min="1" step="10" style="width:52px;font-size:10px;padding:1px">ms' +
            '</span>' +
          '</div>' +
          '<div data-secbody="fila">' +
            '<div style="display:flex;gap:2px;margin-bottom:0">' +
              '<span class="cc-ftab" data-ftab="envio" style="flex:1;text-align:center;padding:4px;cursor:pointer;font-size:10px;border:1px solid #e0d6c6;border-bottom:none;border-radius:4px 4px 0 0">▸ A enviar <span id="cc-ftab-n-envio" style="color:#8a7d6d"></span></span>' +
              '<span class="cc-ftab" data-ftab="enviados" style="flex:1;text-align:center;padding:4px;cursor:pointer;font-size:10px;border:1px solid #e0d6c6;border-bottom:none;border-radius:4px 4px 0 0">✓ Enviados <span id="cc-ftab-n-enviados" style="color:#8a7d6d"></span></span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:42px 108px 108px 1fr 78px 78px 56px 18px;gap:4px;font-size:9px;color:#8a7d6d;padding:3px 5px 2px;border:1px solid #ece4d8;border-bottom:none">' +
              '<span>tipo</span><span>de</span><span>para</span><span>estado</span><span>sai</span><span>chegada</span><span>falta</span><span></span></div>' +
            '<div id="cc-fila-envio" style="height:260px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:0 0 6px 6px"></div>' +
            '<div id="cc-fila-enviados" style="display:none;height:260px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:0 0 6px 6px"></div>' +
          '</div>' +
        '</div>';
      host.insertBefore(d, host.firstChild);
      // keepAwake PRECISA ser chamado sincronamente dentro do gesto, antes de qualquer await,
      // senão o AudioContext fica 'suspended' e o antichoke não vale nada.
      document.getElementById('cc-armar').addEventListener('click', () => { keepAwake(true); ccArmar(); });
      document.getElementById('cc-limpar').addEventListener('click', cmdLimpar);
      document.getElementById('cc-diag').addEventListener('click', ccDiagnostico);
      // Apoio em massa
      document.getElementById('cc-massa-enviar').addEventListener('click', () => { keepAwake(true); ccMassaEnviar(); });
      ccMassaUnidades();
      // ---- Operação ----
      document.getElementById('cc-op-sel').addEventListener('change', (e) => {
        ccOpCfg().ativo = e.target.value; save(); ccOpRender();
      });
      document.getElementById('cc-op-novo').onclick = ccOpAlvoNovo;
      document.getElementById('cc-op-del').onclick = ccOpAlvoDel;
      document.getElementById('cc-op-grupo').addEventListener('change', (e) => {
        ccOpCfg().grupo = e.target.value; save(); ccOpAplicarFiltroGrupo();
      });
      ccOpCarregarGrupos();
      document.getElementById('cc-op-coord').addEventListener('change', (e) => {
        const a = ccOpAtivo(); if (!a) return;
        const p = ccCoordParse(e.target.value);
        a.coord = p ? p.coord : ''; save(); ccOpRender();
      });
      document.getElementById('cc-op-chegada').addEventListener('change', (e) => {
        const a = ccOpAtivo(); if (!a) return;
        a.chegadaLocal = e.target.value; save(); ccOpRender();
      });
      document.getElementById('cc-op-gap').addEventListener('change', (e) => {
        ccOpCfg().gapMs = Math.max(50, parseInt(e.target.value, 10) || 100); save(); ccOpRender();
      });
      document.getElementById('cc-op-limpar').onclick = () => {
        const a = ccOpAtivo(); if (!a) return;
        a.ondas = []; save(); ccOpRender();
      };
      const ordEl = document.getElementById('cc-fila-ordem');
      ordEl.value = config.cmd.filaOrdem || 'chegada';
      ordEl.addEventListener('change', () => { config.cmd.filaOrdem = ordEl.value; save(); ccRender(); });
      document.querySelectorAll('.cc-ftab').forEach((el) => el.addEventListener('click', () => ccFilaTab(el.getAttribute('data-ftab'))));
      ccFilaTab();
      const passoEl = document.getElementById('cc-passo');
      passoEl.value = config.cmd.passoMs || 50;
      passoEl.addEventListener('change', () => {
        config.cmd.passoMs = Math.max(1, parseInt(passoEl.value, 10) || 50); save(); ccRender();
      });
      // Ajuste manual de saída. O campo é "atrasar chegada" (intuitivo): positivo = chega mais
      // tarde, então guardo o NEGATIVO em ajusteMs (que soma ao lead = adianta a saída).
      const atrasoEl = document.getElementById('cc-atraso');
      atrasoEl.value = -(config.cmd.ajusteMs || 0);
      atrasoEl.addEventListener('change', () => {
        config.cmd.ajusteMs = -(parseInt(atrasoEl.value, 10) || 0);
        cmdFila().forEach((c) => { if (c.durMs != null && ccEditavel(c)) cmdRecalc(c); });
        save(); ccRender();
      });
      // Mostra os campos do trem só quando o tipo é trem, e avisa quando o intervalo pedido
      // fica abaixo do jitter medido — aí a ORDEM das ondas vira sorteio.
      const attTrem = () => {
        const tipo = ccTipo();
        const def = CC_TIPOS.find((t) => t.id === tipo) || CC_TIPOS[0];
        // Aba ativa: só ela fica acesa e emendada no corpo.
        document.querySelectorAll('.cc-aba').forEach((el) => {
          const on = el.getAttribute('data-tipo') === tipo;
          el.style.background = on ? 'linear-gradient(180deg,#ece4d8,#fdfaf5)' : '#ffffff';
          el.style.color = on ? '#a2643a' : '#8a7d6d';
          el.style.borderBottom = on ? '1px solid #fdfaf5' : '1px solid #e0d6c6';
          el.style.marginBottom = on ? '-1px' : '0';
          el.style.fontWeight = on ? '600' : '400';
        });
        const hint = document.getElementById('cc-aba-hint');
        if (hint) hint.textContent = def.hint;
        const fk = document.getElementById('cc-fake-cfg');
        if (fk) fk.style.display = (tipo === 'fake') ? 'block' : 'none';
        // Operação e Apoio em massa têm UI própria: ambas escondem a grade de tropas global.
        // A Operação esconde também a lista de Origens (ela tem a sua, por alvo).
        const massa = (tipo === 'massa'), op = (tipo === 'op');
        const mcfg = document.getElementById('cc-massa-cfg'); if (mcfg) mcfg.style.display = massa ? 'block' : 'none';
        const ocfg = document.getElementById('cc-op-cfg'); if (ocfg) ocfg.style.display = op ? 'block' : 'none';
        const tsec = document.getElementById('cc-tropas-sec'); if (tsec) tsec.style.display = (massa || op) ? 'none' : 'block';
        const osec = document.getElementById('cc-origens-sec'); if (osec) osec.style.display = op ? 'none' : 'block';
        const arow = document.getElementById('cc-armar-row'); if (arow) arow.style.display = massa ? 'none' : 'flex';
        // O campo de alvo único não serve pro fake (lista própria) nem pra Operação (alvo por bloco).
        const semAlvoGlobal = (tipo === 'fake' || op);
        const al = document.getElementById('cc-alvo');
        if (al) { al.disabled = semAlvoGlobal; al.style.opacity = semAlvoGlobal ? '.4' : '1'; }
        const ch = document.getElementById('cc-chegada');
        if (ch) { ch.disabled = op; ch.style.opacity = op ? '.4' : '1'; }
        const btn = document.getElementById('cc-armar');
        if (btn) btn.textContent = op ? '▶ Armar este alvo' : ('▶ Armar ' + def.rot.toLowerCase());
        if (tipo === 'fake') ccPreviaFake();
        if (op) ccOpRender();
        ccRenderOrigens();
      };
      _ccAttTipo = attTrem;   // o snipe troca a aba pra Apoio e precisa redesenhar
      document.querySelectorAll('.cc-aba').forEach((el) => {
        el.addEventListener('click', () => { config.cmd.tipo = el.getAttribute('data-tipo'); save(); attTrem(); });
        el.addEventListener('mouseenter', () => { if (el.getAttribute('data-tipo') !== ccTipo()) el.style.color = '#6f6153'; });
        el.addEventListener('mouseleave', attTrem);
      });
      attTrem();

      // Qualquer mudança em alvo/tropa/chegada recalcula os tempos das origens.
      const recalc = () => { ccRenderOrigens(); };
      const alvoEl = document.getElementById('cc-alvo');
      alvoEl.addEventListener('input', () => {
        const a = ccAlvo();
        const ok = document.getElementById('cc-alvo-ok');
        if (ok) {
          if (a) {
            const nome = ccNomeAlvo(a.coord), dono = ccDonoAlvo(a.coord);
            ok.textContent = '✓ ' + a.coord + (nome ? ' · ' + nome : '') + (dono ? ' (' + dono + ')' : '');
            ok.style.color = '#2e7d3a';
          } else { ok.textContent = alvoEl.value ? '✗ formato' : ''; ok.style.color = '#c0483a'; }
        }
        if (a) { config.cmd.ultimoAlvo = a.coord; save(); }
        recalc();
      });
      document.getElementById('cc-chegada').addEventListener('input', () => {
        config.cmd.ultimaChegada = document.getElementById('cc-chegada').value || ''; save(); recalc();
      });
      // Restaura o último alvo/data e desenha o histórico.
      if (config.cmd.ultimoAlvo && !alvoEl.value) { alvoEl.value = config.cmd.ultimoAlvo; alvoEl.dispatchEvent(new Event('input')); }
      if (config.cmd.ultimaChegada) { const ce = document.getElementById('cc-chegada'); if (ce && !ce.value) ce.value = config.cmd.ultimaChegada; }
      ccHistRender();
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

      // "todas"/"nenhuma" agem só sobre o que está VISÍVEL (respeita o filtro de grupo).
      document.getElementById('cc-org-todas').onclick = () => {
        document.querySelectorAll('#cc-origens [data-cc-org]').forEach((el) => { config.cmd.origens[el.getAttribute('data-cc-org')] = true; });
        save(); ccRenderOrigens();
      };
      document.getElementById('cc-org-nenhuma').onclick = () => {
        document.querySelectorAll('#cc-origens [data-cc-org]').forEach((el) => { delete config.cmd.origens[el.getAttribute('data-cc-org')]; });
        save(); ccRenderOrigens();
      };
      document.getElementById('cc-org-recarregar').onclick = () => ccCarregarOrigens(true);
      const grupoSel = document.getElementById('cc-org-grupo');
      if (grupoSel) {
        ccCarregarGrupos();
        grupoSel.addEventListener('change', () => { config.cmd.origGrupo = grupoSel.value; save(); ccAplicarFiltroGrupo(); });
      }
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
          if (msg) { msg.style.color = '#c0483a'; msg.textContent = 'Preencha o alvo e a chegada primeiro.'; }
          return;
        }
        let ok = 0, semTropa = 0, semTempo = 0;
        config.cmd.origens = {};
        const vilasV = _ccGrupoVidsSet ? CCVILAS.filter((v) => _ccGrupoVidsSet.has(String(v.vid))) : CCVILAS;
        vilasV.forEach((v) => {
          if (v.x == null) return;
          if (!ccTemTropa(v, comp)) { semTropa++; return; }
          const compV = ccCompParaVelocidade(comp, v.avail);   // por aldeia, não global
          const t = ccTempoViagemMs(v.x, v.y, alvo.x, alvo.y, compV);
          if (t == null || (ch - t) <= srvNowP()) { semTempo++; return; }
          config.cmd.origens[v.vid] = true; ok++;
        });
        save(); ccRenderOrigens();
        if (msg) {
          msg.style.color = ok ? '#2e7d3a' : '#c0483a';
          msg.textContent = ok + ' origem(ns) marcada(s)' +
            (semTropa ? ' · ' + semTropa + ' sem tropa' : '') +
            (semTempo ? ' · ' + semTempo + ' longe demais' : '');
        }
      };

      ccCarregarOrigens(false);
      ccConsumirSnipe();   // veio da tela de ataques com um snipe escolhido?
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

    // ---- boot da ilha (replica o que o boot antigo fazia pra CC) ----
    try { if (telaAtual() === 'place') mountCmdCenter(); } catch (e) { pushLog('Central rica nao montou: ' + (e.message || e), 'err', 'cmd'); }
    try { mountSnipeIncomings(); } catch (e) { pushLog('Snipe rico falhou: ' + (e.message || e), 'err', 'cmd'); }
    try { mountCmdOverview(); } catch (e) { /* silencioso: injeção na lista de comandos é opcional */ }
    try { cmdBoot(); } catch (e) { pushLog('cmdBoot falhou: ' + (e.message || e), 'err', 'cmd'); }
  })();
  // ════════════════════════════════════════════════════════════════════════════════
  // CENTRAL DE COMANDO — núcleo de precisão (sem interface ainda)
  //
  // Substitui o miolo de tempo do Coordenado. Hoje schedulePlannerFire() prepara 12s
  // antes e dispara com um setTimeout cru. Três limites conhecidos:
  //   1. setTimeout longo escorrega — em aba de fundo o Chrome o estrangula pra 1/min;
  //   2. o preparo mora numa CLOSURE: um F5 entre preparar e disparar perde o comando;
  //   3. não compensa nada — nem a latência da rede, nem o próprio atraso do timer.
  // O resultado prático é erro de centenas de ms a vários segundos. Serve pra apoio,
  // não serve pra trem de nobre nem snipe.
  //
  // Aqui o compromisso vive no localStorage e o disparo desce uma escada de quatro
  // fases, com a rede compensada e o erro do disparo anterior realimentado.
  //
  // O QUE ESTA CENTRAL NÃO CONSEGUE FAZER, e é honesto dizer: o relógio de referência
  // é o Timing do próprio jogo, que o TW calibra na resposta do carregamento de página.
  // O erro dele contra o relógio real do servidor é da ordem de meio RTT de page load
  // (uns 20-60ms) e NÃO dá pra medir isso do cliente com confiança. ccSincronizar()
  // estima esse desvio pelo cabeçalho Date, mas fica como DIAGNÓSTICO — não é aplicado
  // sozinho, porque o Date pode vir de um proxy e piorar em vez de melhorar.
  // O que a central corrige é o que ela consegue medir: o atraso do próprio agendador
  // e o tempo de rede. Contra o relógio do jogo, o alvo de 10ms é real.
  //
  // MEDIDO ANTES DE ESCREVER (navegador, escada isolada, 12-20 rodadas por cenário):
  //     thread livre ............ mediana 0ms   · pior  0ms
  //     thread ocupada .......... mediana 9,4ms · pior 21ms · DISPERSÃO 20ms
  // A dispersão é o número que manda. Viés de laço fechado corrige erro CONSTANTE; não
  // corrige espalhamento. Ou seja: sob thread ocupada não existem 10ms, com escada
  // nenhuma. Por isso devoParar() devolve 'Central disparando' na janela crítica e os
  // laços longos saem da frente — silenciar os outros módulos não é conforto, é o que
  // compra a precisão. O viés cuida só do resto, que é o atraso fixo.
  // ════════════════════════════════════════════════════════════════════════════════

  const CC = {
    BLOCO_MS: 30000,        // espera longa fatiada; timer curto reagendado não acumula deriva
    // Onde o setTimeout entrega pra fase de cessão. Medido com a thread ocupada, 20 e
    // 250 empatam com 60 (mediana 9,4ms nos três) — a contenção domina e a folga não
    // muda nada. 60ms fica por ser folga suficiente pra absorver um setTimeout que
    // chegue atrasado, sem esticar a cessão a ponto de gerar lixo.
    FOLGA_ACORDADO: 60,
    FOLGA_ESTRANGULADO: 30000, // aba de fundo SEM keep-awake: acorda muito antes e paga cedendo
    CEDER_ATE: 3,           // últimos 3ms: espera ocupada
    TETO_OCUPADO: 5000,     // trava de segurança da espera ocupada
    AQUECER_ANTES: 2000,    // abre/renova a conexão pra o POST não pagar handshake
    PREPARAR_ANTES: 15000,  // refaz o try=confirm com payload fresco
    ACORDAR_ANTES: 300000,  // liga o keep-awake 5 min antes do disparo
    JANELA_CRITICA: 60000,  // nesta janela os outros módulos e o Auto-F5 recuam
    SONDAS: 5,              // requisições HEAD por medição de rede
    // O viés corrige atraso SISTEMÁTICO, da ordem de dezenas de ms. Os primeiros valores
    // que escolhi — teto 400ms, ganho 0,4 — não vieram de lugar nenhum, e no primeiro
    // teste real o viés saturou em exatamente +400ms. Teto largo demais deixou uma
    // excursão de ruído virar correção permanente, e o ganho alto levava um erro de
    // 600ms a virar +240 de viés num passo só. Ver a nota em ccRealimentar: a causa raiz
    // era a realimentação estar no sinal errado, mas estes números pioraram o estrago.
    // O viés carrega a correção INTEIRA (era dividida com o meioRtt, que saiu da conta).
    // Latência de ida real medida: ~184ms, e pode ser bem pior numa hora ruim.
    //
    // Os números abaixo vieram de LER O NEXUS, não de chute meu — os anteriores eu tinha
    // inventado e os dois primeiros testes reais mostraram no que dá. Lá:
    //     _EWMA_ALPHA 0.3 · _EWMA_SPIKE_DAMPED_ALPHA 0.05 · _EWMA_DAMP_BAND_MS 2000
    //     _DRIFT_GUARD_THRESHOLD_MS 50 · _OFFSET_COMPENSATION_CAP_MS 5000
    //     _EWMA_TARGET_BIAS_MS 2
    BIAS_TETO: 5000,         // limite duro do valor aprendido (o do usuário é menor)
    EWMA_ALFA_RESPONSIVO: 0.3,   // reage rápido a mudança de latência
    EWMA_ALFA_ESTAVEL: 0.1,      // ignora variação curta; melhor em conexão instável
    EWMA_ALFA_PICO: 0.05,        // amostra fora da banda: entra, mas quase não move
    EWMA_BANDA_MS: 2000,         // acima disto a amostra é considerada pico
    GUARDA_DERIVA_MS: 50,        // escada atrasou mais que isto -> a amostra não ensina nada
    BANDA_CONSISTENCIA_MS: 200,  // numa onda, atraso acima disto sobre o menor é engasgada do servidor
    // Piso entre dois comandos de uma onda. O Nexus usa 50ms; MEDIDO no br143, 50 não se
    // sustenta. Teste de 5 apoios: eu disparei em 0/50/100/150/200ms — exato, com erro de
    // escada ZERO nos cinco — e o jogo registrou as chegadas com 100/100/137/100ms de
    // intervalo. O servidor processa comandos da mesma conta em fila, ~100ms cada.
    // Não é o cliente que limita: disparar mais rápido só acumula atraso na entrega.
    ONDA_GAP_MIN_MS: 100,
    ATRASO_TOLERADO: 1500,  // passou disso do horário, não dispara — marca como perdido
  };

  // defCC() fica lá em cima, junto dos outros def*: def() é chamado no carregamento e
  // `const` não sofre hoisting — declarar aqui daria ReferenceError antes do painel abrir.

  // ── Relógio ancorado ────────────────────────────────────────────────────────────
  // serverNow() deriva de Date.now(), que dá saltos (NTP, suspensão da máquina).
  // performance.now() é monotônico. Ancora um par das duas e conta a partir dele.
  const _ccAnc = { perf: 0, srv: 0, ok: false };
  function ccAncorar() {
    _ccAnc.perf = performance.now();
    _ccAnc.srv = serverNow();
    _ccAnc.ok = true;
    return _ccAnc;
  }
  function ccNow() {
    if (!_ccAnc.ok) ccAncorar();
    return _ccAnc.srv + (performance.now() - _ccAnc.perf);
  }
  // Quanto o modelo se afastou do relógio bruto do jogo. Grande = a âncora envelheceu
  // ou o relógio da máquina pulou. NUNCA re-ancorar perto de um disparo: um salto de
  // âncora no meio da escada de espera é exatamente o erro que queremos evitar.
  function ccDeriva() { return _ccAnc.ok ? Math.round(serverNow() - ccNow()) : 0; }
  function ccReancorarSeSeguro() {
    if (ccJanelaCritica(CC.ACORDAR_ANTES)) return false;
    ccAncorar();
    return true;
  }

  const ccDormir = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  // Cede o laço de eventos sem dormir. setTimeout(0) aninhado é preso em 4ms pelo
  // navegador; MessageChannel não é — dá umas dezenas de microssegundos por volta.
  //
  // O canal é ÚNICO e reaproveitado, e isso não é elegância: a primeira versão criava
  // um MessageChannel por volta. Medido no navegador, 20 rodadas de cada:
  //     canal novo por volta ... mediana 0ms, p90 6,9ms, PIOR 20ms
  //     canal reaproveitado .... mediana 0ms, p90   0ms, pior 8,4ms
  // Eu estava fabricando milhares de objetos por disparo e colhendo a coleta de lixo
  // exatamente no instante que precisava ser limpo. A fila de resolvedores existe
  // porque dois comandos podem estar cedendo ao mesmo tempo.
  const _ccMC = (function () { try { return new MessageChannel(); } catch (e) { return null; } })();
  const _ccCederFila = [];
  if (_ccMC) _ccMC.port1.onmessage = () => { const f = _ccCederFila.shift(); if (f) f(); };
  function ccCeder() {
    if (!_ccMC) return new Promise((r) => setTimeout(r, 0));
    return new Promise((r) => { _ccCederFila.push(r); _ccMC.port2.postMessage(0); });
  }

  // ── Manter a aba acordada ───────────────────────────────────────────────────────
  // Aba de fundo tem setTimeout estrangulado pra 1 disparo por minuto depois de 5 min.
  // Um oscilador de áudio inaudível marca a aba como "tocando mídia" e ela deixa de ser
  // estrangulada. Depende de gesto do usuário pra sair do estado suspenso — o clique em
  // "armar" serve; por isso ccManterAcordado(true) deve ser chamado a partir de um clique.
  let _ccAudio = null;
  function ccManterAcordado(ligar) {
    try {
      if (ligar) {
        if (_ccAudio) { try { _ccAudio.ctx.resume(); } catch (e) {} return _ccAudio.ctx.state === 'running'; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        const ctx = new AC();
        const osc = ctx.createOscillator(), g = ctx.createGain();
        g.gain.value = 0.0001;   // inaudível, mas não zero: em zero o Chrome descarta o grafo
        osc.frequency.value = 40;
        osc.connect(g); g.connect(ctx.destination); osc.start();
        try { ctx.resume(); } catch (e) {}
        _ccAudio = { ctx: ctx, osc: osc, g: g };
        return ctx.state === 'running';
      }
      if (_ccAudio) { try { _ccAudio.osc.stop(); _ccAudio.ctx.close(); } catch (e) {} _ccAudio = null; }
      return true;
    } catch (e) { return false; }
  }
  function ccAcordadoOk() { return !!(_ccAudio && _ccAudio.ctx && _ccAudio.ctx.state === 'running'); }

  // ── Rede ────────────────────────────────────────────────────────────────────────
  // Alvo estático e minúsculo no MESMO host do jogo: mede o ida-e-volta real da conexão
  // que o POST vai usar (HTTP/2 multiplexa tudo numa conexão só) sem fazer o servidor
  // renderizar nada. HEAD num game.php custaria uma página inteira de processamento.
  const CC_PING = '/graphic/dots/green.png';
  async function ccSondar(n) {
    const rtts = [];
    for (let i = 0; i < (n || CC.SONDAS); i++) {
      const t0 = performance.now();
      try { await fetch(CC_PING + '?_=' + i + '_' + Math.random(), { method: 'HEAD', cache: 'no-store', credentials: 'omit' }); }
      catch (e) { break; }
      rtts.push(performance.now() - t0);
      await ccDormir(40);
    }
    if (!rtts.length) return null;
    const ord = rtts.slice().sort((a, b) => a - b);
    const med = ord[Math.floor(ord.length / 2)];
    config.cc.rttMs = Math.round(med);
    save();
    return { min: Math.round(ord[0]), mediana: Math.round(med), max: Math.round(ord[ord.length - 1]), jitter: Math.round(ord[ord.length - 1] - ord[0]), n: rtts.length };
  }
  // Só reabre/renova a conexão. Descarta o resultado de propósito.
  async function ccAquecer() {
    try { await fetch(CC_PING + '?w=' + Math.random(), { method: 'HEAD', cache: 'no-store', credentials: 'omit' }); } catch (e) {}
  }
  // Metade do ida-e-volta da sonda. NÃO entra mais no cálculo do disparo — ficou provado
  // que não tem relação com o custo real de um POST na praça (85ms estimados contra ~184ms
  // reais), e somá-lo ao viés aprendido fazia as duas correções brigarem até saturarem
  // juntas. Sobrevive só como número exibido no painel.
  function ccMeioRtt() {
    return Math.min(600, Math.max(0, Math.round((config.cc.rttMs || 0) / 2)));
  }

  // ── Escada de espera ────────────────────────────────────────────────────────────
  // A espera longa em blocos de 30s vive agora dentro do ccMotor, que é quem decide
  // qual comando é o próximo — não existe mais timer por comando. Era justamente esse
  // timer por comando que o ccTick re-agendava, criando o disparo duplicado.
  //
  // Fases fina, cedendo e ocupada. Devolve o instante real em que soltou.
  async function ccEsperarPreciso(alvoMs) {
    for (;;) {
      const falta = alvoMs - ccNow();
      // Sem keep-awake numa aba de fundo o setTimeout é estrangulado: acorda muito
      // antes e paga o resto cedendo, que o Chrome não estrangula do mesmo jeito.
      const folga = (document.hidden && !ccAcordadoOk()) ? CC.FOLGA_ESTRANGULADO : CC.FOLGA_ACORDADO;
      if (falta <= folga) break;
      await ccDormir(Math.min(falta - folga, CC.BLOCO_MS));
    }
    while (alvoMs - ccNow() > CC.CEDER_ATE) await ccCeder();
    // Espera ocupada nos últimos milissegundos: é o único jeito de acertar abaixo do
    // grão do agendador do navegador. Custa CPU por ~3ms. O teto é trava de segurança.
    const limite = performance.now() + CC.TETO_OCUPADO;
    while (ccNow() < alvoMs && performance.now() < limite) { /* ocupado de propósito */ }
    return ccNow();
  }

  // ── Janela crítica ──────────────────────────────────────────────────────────────
  // Tem disparo chegando nos próximos N ms? O Auto-F5 e os laços longos consultam isto
  // pra sair da frente. Um reload ou uma trava roubada no meio da escada custa o comando.
  function ccJanelaCritica(janelaMs) {
    const lim = ccNow() + (janelaMs || CC.JANELA_CRITICA);
    return ((config.cc && config.cc.fila) || []).some((c) =>
      (c.state === 'armado' || c.state === 'preparado') && c.sendAt && c.sendAt <= lim && c.sendAt > ccNow() - CC.ATRASO_TOLERADO);
  }

  // ── Preparo e disparo ───────────────────────────────────────────────────────────
  // Duas etapas, como o resto do script — mas com o payload PERSISTIDO, não numa
  // closure. O token CSRF muda a cada carregamento de página, então o payload é
  // carimbado: na retomada, payload de outra sessão é descartado e refeito.
  async function ccPreparar(cmd) {
    const p = await fakePrepare(cmd.origin, cmd.x, cmd.y, cmd.amounts, cmd.kind);
    cmd.payload = { action: p.action, params: p.params, h: CSRF };
    if (p.dur) cmd.durSec = p.dur;
    return p;
  }
  function ccPayloadValido(cmd) { return !!(cmd.payload && cmd.payload.h === CSRF && cmd.payload.action); }

  // Escrita adiantada: grava a INTENÇÃO antes de agir. Se a aba morrer entre o POST e a
  // resposta, a retomada encontra 'disparando' e trata como INCERTO — nunca reenvia.
  // Mandar um nobre duas vezes é pior do que não mandar.
  // DISPARA E SEGUE. Não espera a resposta — e isso é requisito, não otimização.
  //
  // A versão anterior fazia `await fetch(...); await r.text()` antes de devolver, e o
  // round-trip real de um POST na praça foi medido entre 183 e 787ms. Numa onda de 8
  // comandos espaçados de 100ms, esperar a resposta do primeiro já atropela os cinco
  // seguintes. Agora emite o POST, carimba o instante e volta em ~1ms; a resposta é
  // tratada quando chegar.
  //
  // A escrita adiantada continua valendo: 'disparando' vai pro disco ANTES do fetch, e
  // uma aba que morra no meio deixa o comando INCERTO, nunca reenviado.
  function ccDispararAgora(cmd) {
    cmd.state = 'disparando';
    cmd.fireAt = ccNow();
    save();
    // Modo de teste: NÃO emite o POST final. Registra o instante do disparo e conclui.
    // O motor, a escada de espera e o preparo (ccPreparar) rodaram normalmente — só a
    // saída da tropa é suprimida. É o que separa "o motor não dispara" de "o envio falha".
    // Não realimenta o viés: amostra simulada envenenaria o aprendizado adaptativo.
    if (_ccSim) {
      cmd.state = 'enviado'; cmd.sentAt = cmd.fireAt; cmd.erro = null; cmd.rttEnvioMs = 0; cmd.simulado = true;
      save(); ccRenderPagina();
      pushLog('🧪 SIMULADO: ' + ccRotulo(cmd) + ' — disparo em ' + ccFmtHora(cmd.fireAt), 'ok', 'planner');
      return;
    }
    const t0 = performance.now();
    fetch(cmd.payload.action, {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(cmd.payload.params).toString(),
    }).then((r) => r.text()).then((t2) => {
      cmd.rttEnvioMs = Math.round(performance.now() - t0);
      if (/n[aã]o tem tropas suficientes|not enough|insuficient/i.test(t2)) {
        cmd.state = 'falhou'; cmd.erro = 'tropas insuficientes';
      } else if (/selecione uma aldeia alvo/i.test(t2)) {
        // Ambíguo: é também o estado normal da praça DEPOIS de um envio que deu certo.
        cmd.state = 'incerto'; cmd.erro = 'resposta ambígua — confira na tela de comandos';
      } else {
        cmd.state = 'enviado'; cmd.sentAt = ccNow(); cmd.erro = null;
      }
      // Diagnóstico: o quanto ANTES da hora pedida o POST saiu. Não é o erro — o erro
      // depende da viagem até o servidor, que só a chegada publicada pelo jogo revela.
      // (Era aqui que eu somava meioRtt e chamava de "erro líquido"; o número concordava
      // comigo mesmo e escondia 100ms de atraso real.)
      ccRealimentar(cmd, cmd.fireAt - cmd.sendAt, false);
      // Confere daqui a pouco. Se este timer morrer (F5, aba estrangulada), o ccTick
      // varre a fila e conclui — a conferência não depende mais de nada em memória.
      if (cmd.state === 'enviado') {
        clearTimeout(_ccConferirTimer);
        _ccConferirTimer = setTimeout(() => { ccConferirPendentes().catch(() => {}); }, 8000);
      }
      pushLog('🎯 Central: ' + ccRotulo(cmd) + ' — ' + cmd.state + ', estimei ' + cmd.erroMs + 'ms (ida-e-volta ' + cmd.rttEnvioMs + 'ms). Conferindo com o jogo…', cmd.state === 'enviado' ? 'ok' : 'err', 'planner');
      save(); ccRenderPagina();
    }).catch((e) => {
      // Rede caiu: NÃO dá pra saber se o servidor recebeu. Incerto, nunca falha.
      cmd.state = 'incerto'; cmd.erro = 'rede caiu durante o envio (' + (e.message || e) + ')';
      save(); ccRenderPagina();
      pushLog('🎯 Central: ' + ccRotulo(cmd) + ' — INCERTO (' + cmd.erro + ')', 'err', 'planner');
    });
  }

  // ── Verdade de campo: a chegada que o JOGO publica ──────────────────────────────
  //
  // Eu tinha dito que o jogo só mostrava segundos e que por isso não dava pra verificar
  // precisão de ms. Errado: a lista "Próprios comandos" da praça mostra
  // `hoje às 18:49:00:300` — o `:300` num elemento separado e menor, mas textContent
  // concatena os filhos, então uma regex na célula inteira pega tudo.
  //
  // Isso muda o laço fechado de lugar. No primeiro teste real de um comando só:
  //     pedido ............ 18:40:00.200
  //     jogo registrou .... 18:40:00.300   (chegada 18:49:00:300 menos 9min de viagem)
  //     erro verdadeiro ... +100ms
  //     meu painel disse .. +1ms
  // A escada acertou o alvo (+1ms). O buraco inteiro estava na estimativa de rede: eu
  // estimava meia-viagem com um HEAD num arquivo estático (~85ms), e a ida real de um
  // POST na praça é ~184ms. Realimentar a minha própria estimativa nunca acharia isso —
  // ela concorda consigo mesma. Contra a chegada publicada pelo jogo, acha.
  let _ccConferirTimer = null;

  function ccParseChegadaMs(txt) {
    // "hoje às 18:49:00:300" — o quarto grupo é opcional porque nem toda linha traz ms.
    const m = (txt || '').match(/(\d{1,2}):(\d{2}):(\d{2})(?:[:.](\d{1,3}))?/);
    if (!m) return null;
    const base = new Date(Date.now() + wallToServerOffset());
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(),
      +m[1], +m[2], +m[3], m[4] ? +(m[4] + '00').slice(0, 3) : 0);
    let ms = d.getTime() + wallToServerOffset();
    // Passou da meia-noite entre a saída e a chegada: a linha diz "amanhã".
    if (/amanh/i.test(txt)) ms += 86400000;
    return ms;
  }

  // Uma requisição para a onda inteira, não uma por comando.
  //
  // Deriva da FILA, que é persistida — não de uma lista em memória com timer, que era a
  // versão anterior e falhou em todos os cinco comandos do primeiro teste de onda. Um F5
  // entre o envio e os 8 segundos do timer perdia a conferência pra sempre, e o painel
  // ficava exibindo a estimativa provisória achando que era o número final.
  // Assim, qualquer aba que abrir depois conclui o serviço.
  function ccPendentesDeConferencia() {
    const agora = ccNow();
    return ((config.cc && config.cc.fila) || []).filter((c) =>
      c.state === 'enviado' && c.erroRealMs == null && (c.tentativasConf || 0) < 5 &&
      c.sentAt && (agora - c.sentAt) > 5000 && (agora - c.sentAt) < 2 * 3600 * 1000);
  }

  async function ccConferirPendentes() {
    const lote = ccPendentesDeConferencia();
    if (!lote.length) return;
    lote.forEach((c) => { c.tentativasConf = (c.tentativasConf || 0) + 1; });
    const origens = Array.from(new Set(lote.map((c) => c.origin)));
    for (const vid of origens) {
      let doc;
      try {
        const r = await fetch('/game.php?village=' + vid + '&screen=place', { credentials: 'include', cache: 'no-store' });
        doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      } catch (e) { continue; }
      // Toda linha da tabela de comandos que tenha coordenada e horário.
      const linhas = [];
      doc.querySelectorAll('tr').forEach((tr) => {
        const t = (tr.textContent || '').replace(/\s+/g, ' ');
        const mc = t.match(/\((\d{1,3})\|(\d{1,3})\)/);
        if (!mc) return;
        const chegada = ccParseChegadaMs(t);
        if (chegada) linhas.push({ coord: mc[1] + '|' + mc[2], chegada: chegada });
      });
      // CASAMENTO POR ORDEM, e recusa quando é ambíguo.
      //
      // Duas tentativas anteriores falharam, e as duas de um jeito instrutivo:
      //
      // 1. "a chegada mais próxima" — sem exclusividade, cinco comandos de uma onda
      //    casaram com a MESMA linha e geraram erros de +161, +61, -39, -139 e -239ms.
      //    Todos aritmética da mesma chegada. Números inventados, alimentando o estimador.
      //
      // 2. exclusividade + janela apertada em volta do desvio mediano — parecia resolver,
      //    mas simulado com 500ms de desvio sistemático estimou 312 e casou tudo errado.
      //    É aliasing: com comandos a 100ms de distância e erro de 500ms, o casamento por
      //    TEMPO é matematicamente ambíguo. Não dá pra saber qual chegada é de qual.
      //
      // O que resolve é a ORDEM: o servidor processa os comandos da conta em fila, então
      // o i-ésimo enviado é o i-ésimo a chegar. E quando nem a ordem basta — quantidade de
      // chegadas diferente da de comandos — a medição é RECUSADA. Medida errada é pior
      // que medida nenhuma, porque vira correção permanente no viés.
      const JANELA_CONF_MS = 5000;
      const porCoord = {};
      lote.filter((c) => c.origin === vid).forEach((cmd) => {
        const esperada = cmd.modo === 'chegada' ? cmd.alvoMs : (cmd.durSec ? cmd.sendAt + cmd.durSec * 1000 : null);
        if (!esperada) return;
        const k = cmd.x + '|' + cmd.y;
        (porCoord[k] = porCoord[k] || []).push({ cmd: cmd, esperada: esperada });
      });
      Object.keys(porCoord).forEach((coord) => {
        const grupo = porCoord[coord].sort((a, b) => a.esperada - b.esperada);
        const cand = linhas.filter((l) => l.coord === coord &&
          grupo.some((g) => Math.abs(l.chegada - g.esperada) <= JANELA_CONF_MS))
          .map((l) => l.chegada).sort((a, b) => a - b);
        let casados = null;
        if (grupo.length === 1) {
          casados = cand.length ? [cand.reduce((m, c) => (Math.abs(c - grupo[0].esperada) < Math.abs(m - grupo[0].esperada) ? c : m))] : null;
        } else if (cand.length === grupo.length) {
          casados = cand;   // i-ésimo comando -> i-ésima chegada
        }
        if (!casados) {
          grupo.forEach((g) => { if ((g.cmd.tentativasConf || 0) >= 5) g.cmd.confAmbigua = true; });
          if (grupo[0] && (grupo[0].cmd.tentativasConf || 0) === 5) {
            pushLog('🎯 Central: não consegui medir o erro de ' + grupo.length + ' comando(s) → ' + coord +
              ' — achei ' + cand.length + ' chegada(s) na lista, e com número diferente o casamento fica ambíguo. Prefiro não medir a medir errado.', '', 'planner');
          }
          return;
        }
        grupo.forEach((g, i) => {
          g.cmd.chegadaReal = casados[i];
          g.cmd.erroRealMs = Math.round(casados[i] - g.esperada);
        });
        // BANDA DE CONSISTÊNCIA. Dentro de uma mesma onda, os comandos deveriam errar
        // parecido — é a mesma conexão, no mesmo segundo. Quem destoa muito da mediana
        // não está medindo latência: está medindo uma engasgada do servidor.
        //
        // Medido numa onda de 4: erros +41, +59, +927, +927. Os dois primeiros são a
        // latência real; os dois últimos vieram de uma pausa de ~900ms do servidor no
        // meio da onda. E 927 passa por baixo do teto de 1000ms, então seria aprendido
        // como latência permanente. A guarda de deriva não pega isso — ela só olha se a
        // MINHA espera atrasou, e não atrasou.
        // (No Nexus: _RECENT_CONSISTENCY_BAND_MS 200.)
        // A referência é o MAIOR AGRUPAMENTO, com desempate pelo menor valor.
        //
        // Mediana não serve: com [41, 59, 927, 927] — a onda real medida — ela cai em 927
        // e o filtro rejeita justamente os dois bons, porque metade das amostras eram o
        // defeito e mediana não resiste a 50% de contaminação.
        // Mínimo também não: com [40, 800, 810, 795] ele aceita só o 40 e rejeita três.
        // Se 800 for a latência verdadeira e o 40 foi sorte, eu aprenderia o caso melhor
        // e todo comando cairia atrasado.
        // O maior agrupamento acerta os dois. O desempate pelo menor vem da física:
        // latência e engasgada só ATRASAM, nunca adiantam — na dúvida, fique com o grupo
        // mais rápido, que é o que mais se aproxima do custo real da conexão.
        const vals = grupo.map((g) => g.cmd.erroRealMs).sort((a, b) => a - b);
        let referencia = vals[0], melhorN = -1;
        vals.forEach((v) => {
          const n = vals.filter((x) => Math.abs(x - v) <= CC.BANDA_CONSISTENCIA_MS).length;
          if (n > melhorN) { melhorN = n; referencia = v; }
        });
        grupo.forEach((g, i) => {
          const fora = grupo.length > 2 && Math.abs(g.cmd.erroRealMs - referencia) > CC.BANDA_CONSISTENCIA_MS;
          if (fora) {
            g.cmd.foraDaBanda = true;
            pushLog('🎯 Central: ' + ccRotulo(g.cmd) + ' — chegada ' + ccFmtHora(casados[i]) + ', erro REAL ' +
              (g.cmd.erroRealMs > 0 ? '+' : '') + g.cmd.erroRealMs + 'ms. FORA da banda da onda (referência ' + referencia +
              'ms) — engasgada do servidor, não latência. Não vai pro aprendizado.', '', 'planner');
            return;
          }
          // ESTE é o sinal que alimenta o viés. O erro estimado vira só diagnóstico.
          ccRealimentar(g.cmd, g.cmd.erroRealMs, true);
          pushLog('🎯 Central: ' + ccRotulo(g.cmd) + ' — o jogo registrou chegada ' + ccFmtHora(casados[i]) +
            ', erro REAL ' + (g.cmd.erroRealMs > 0 ? '+' : '') + g.cmd.erroRealMs + 'ms (eu estimei ' + g.cmd.erroMs + 'ms).', 'ok', 'planner');
        });
      });
    }
    save(); ccRenderPagina();
  }

  // ── Laço fechado ────────────────────────────────────────────────────────────────
  // Recebe o ERRO LÍQUIDO: quando estimamos que o servidor recebeu, contra a hora pedida.
  //
  // A primeira versão realimentava outra coisa — o atraso da escada, `real - alvoChamada`.
  // Parece razoável e é um erro de controle: como `alvoChamada = sendAt - meioRtt - viés`,
  // esse valor é o atraso da escada PURO, que não diminui quando o viés cresce. Ou seja,
  // um integrador sobre uma entrada que ele não afeta: sem ponto de equilíbrio, cresce até
  // bater na trava. No primeiro teste real o viés saturou em exatamente +400ms, o teto que
  // eu tinha posto — e aí os comandos passaram a sair 485ms ADIANTADOS enquanto o painel
  // exibia "0ms de erro", porque o erro exibido também era o da escada.
  //
  // Com o líquido: liquido = atrasoDaEscada - viés, então `viés += g*liquido` converge pra
  // viés = atrasoDaEscada, que é exatamente a correção desejada. Ganho < 1 pra não oscilar.
  //
  // O que isto continua NÃO medindo: o relógio do servidor. Ver o cabeçalho do bloco.
  // `verdadeiro` = veio da chegada publicada pelo jogo. Só esse move o viés.
  // A estimativa própria fica registrada pra comparação, mas não realimenta: ela concorda
  // consigo mesma por construção, e foi assim que o viés ficou 100ms fora sem perceber.
  function ccRealimentar(cmd, erroMs, verdadeiro) {
    if (verdadeiro) cmd.erroRealMs = Math.round(erroMs); else cmd.erroMs = Math.round(erroMs);
    if (!verdadeiro) { save(); return; }
    const cc = config.cc;

    // GUARDA DE DERIVA. Se a MINHA escada atrasou mais que o limite, o erro medido não
    // fala da rede — fala de mim. Aprender com ele envenena o estimador. A amostra é
    // registrada e descartada. (No Nexus: _DRIFT_GUARD_THRESHOLD_MS 50.)
    const deriva = Math.abs(cmd.atrasoEscadaMs || 0);
    if (deriva > CC.GUARDA_DERIVA_MS) {
      cc.afericoes = (cc.afericoes || []).concat([{ t: ccNow(), erro: cmd.erroRealMs, descartada: true, deriva: deriva, bias: cc.biasMs }]).slice(-50);
      pushLog('🎯 Central: amostra descartada do aprendizado — minha escada atrasou ' + deriva + 'ms, o erro não mede a rede.', '', 'planner');
      save(); return;
    }

    // TETO DE PLAUSIBILIDADE. Acima disto não é latência, é defeito — e aprender com
    // defeito estraga o estimador por muitas amostras. O Nexus chama de "Máximo de
    // correção" e diz na própria tela: "atrasos acima do selecionado são considerados
    // bugs e ignorados". O padrão deles é 1000ms; o meu era 5000, permissivo demais.
    const teto = Math.max(100, Math.min(CC.BIAS_TETO, cc.maxCorrecaoMs || 1000));
    if (Math.abs(erroMs) > teto) {
      cc.afericoes = (cc.afericoes || []).concat([{ t: ccNow(), erro: cmd.erroRealMs, descartada: true, motivo: 'acima do máximo de correção', bias: cc.biasMs }]).slice(-50);
      pushLog('🎯 Central: erro de ' + Math.round(erroMs) + 'ms ignorado — acima do máximo de correção (' + teto + 'ms). Isso é defeito, não latência.', '', 'planner');
      save(); return;
    }

    // No modo fixo o usuário manda; o estimador nem roda.
    if (cc.modo === 'fixo') {
      cc.afericoes = (cc.afericoes || []).concat([{ t: ccNow(), erro: cmd.erroRealMs, modo: 'fixo', bias: cc.offsetFixoMs }]).slice(-50);
      save(); return;
    }

    // EWMA com amortecimento de pico, no lugar da média corrida 1/n que eu tinha.
    // Dois defeitos do 1/n que só vi lendo o Nexus: o ganho tende a ZERO, então depois
    // de umas 20 amostras ele para de aprender e não acompanha mudança de rede; e na
    // PRIMEIRA amostra o ganho é 1, então um único envio ruim define o viés inteiro.
    // Com α fixo aprende pra sempre; com α reduzido fora da banda, um outlier contribui
    // pouco em vez de dominar — amortecer é mais robusto que rejeitar.
    //
    // O α não é um número só: o Nexus deixa o usuário escolher entre reagir rápido e
    // ignorar variação curta, porque a resposta certa depende de quão instável é a
    // conexão dele. Não existe valor universal, e fingir que existe foi meu erro.
    const anterior = (typeof cc.biasMs === 'number') ? cc.biasMs : 0;
    const pico = Math.abs(erroMs - anterior) > CC.EWMA_BANDA_MS;
    const alfa = pico ? CC.EWMA_ALFA_PICO
      : (cc.estilo === 'responsivo' ? CC.EWMA_ALFA_RESPONSIVO : CC.EWMA_ALFA_ESTAVEL);
    cc.biasMs = Math.max(-teto, Math.min(teto, Math.round(anterior + erroMs * alfa)));
    cc.nReal = (cc.nReal || 0) + 1;
    cc.afericoes = (cc.afericoes || []).concat([{ t: cmd.sentAt || ccNow(), erro: cmd.erroRealMs, estimado: cmd.erroMs, bias: cc.biasMs, oculta: document.hidden, acordado: ccAcordadoOk() }]).slice(-50);
    save();
  }

  // ── Ciclo de vida de um comando ─────────────────────────────────────────────────
  // rascunho → armado → preparado → disparando → enviado
  //                              ↘ falhou / incerto / perdido
  function ccCalcularSaida(cmd) {
    if (cmd.modo === 'saida') { cmd.sendAt = cmd.alvoMs; return true; }
    if (!cmd.durSec) return false;               // chegada precisa da duração exata
    cmd.sendAt = cmd.alvoMs - cmd.durSec * 1000;
    return true;
  }

  // ── MOTOR: um disparo de cada vez ───────────────────────────────────────────────
  //
  // A versão anterior dava a cada comando o seu próprio timer e a sua própria escada de
  // espera, todas correndo juntas. Não funciona, e o teste real mostrou por quê: oito
  // comandos planejados até 604ms separados dispararam dentro de 38ms uns dos outros —
  // colapso total do espaçamento. Duas razões:
  //   - cada escada termina numa espera OCUPADA, e espera ocupada não divide thread:
  //     enquanto uma gira, as outras não conseguem nem checar o próprio relógio;
  //   - o disparo aguardava a resposta do POST (183 a 787ms medidos), segurando tudo.
  //
  // Agora existe UM motor. Ele pega sempre o comando de menor sendAt, espera a hora
  // dele, emite o POST sem aguardar resposta, e vai pro próximo. Uma onda sai em
  // sequência, na ordem, com o espaçamento que foi pedido.
  //
  // Consequência que o usuário precisa saber: dois comandos no MESMO milissegundo são
  // fisicamente impossíveis — o segundo sai alguns ms depois. ccEspacamentoMinimoMs()
  // é o piso medido.
  let _ccMotorAtivo = false;

  function ccProximo() {
    const fila = (config.cc && config.cc.fila) || [];
    let melhor = null;
    fila.forEach((c) => {
      if (c.state !== 'armado' && c.state !== 'preparado') return;
      if (!c.sendAt) return;
      if (!melhor || c.sendAt < melhor.sendAt) melhor = c;
    });
    return melhor;
  }

  async function ccMotor() {
    if (_ccMotorAtivo) return;
    _ccMotorAtivo = true;
    try {
      for (;;) {
        const cmd = ccProximo();
        if (!cmd) break;
        if (captchaBlocked()) { await ccDormir(30000); continue; }
        const falta = cmd.sendAt - ccNow();

        // Longe: dorme em bloco e reavalia. Reavaliar importa — um comando novo pode ter
        // entrado na frente enquanto este dormia.
        if (falta > CC.PREPARAR_ANTES) { await ccDormir(Math.min(falta - CC.PREPARAR_ANTES, CC.BLOCO_MS)); continue; }

        // Passou da hora: não dispara atrasado. Explorador atrasado é tropa fora de casa
        // sem motivo; nobre atrasado é pior.
        if (ccNow() > cmd.sendAt + CC.ATRASO_TOLERADO) {
          cmd.state = 'perdido';
          cmd.erro = 'a hora de sair passou (aba fechada, ou a fila estava ocupada com outro comando)';
          save(); ccRenderPagina();
          pushLog('⏱️ Central: ' + ccRotulo(cmd) + ' PERDIDO — ' + cmd.erro, 'err', 'planner');
          continue;
        }

        // Payload pronto ANTES da janela de disparo. Preparar custa um round-trip e não
        // pode acontecer entre dois disparos de uma onda.
        if (!ccPayloadValido(cmd)) {
          try {
            await ocupado(() => ccPreparar(cmd));
            if (cmd.modo === 'chegada') ccCalcularSaida(cmd);
            cmd.state = 'preparado'; save(); ccRenderPagina();
          } catch (e) {
            cmd.state = 'falhou'; cmd.erro = 'preparo falhou: ' + (e.message || e);
            save(); ccRenderPagina();
            pushLog('🎯 Central: ' + ccRotulo(cmd) + ' — ' + cmd.erro, 'err', 'planner');
            continue;
          }
          continue;   // reavalia: o preparo pode ter mudado sendAt (duração exata do servidor)
        }

        if (config.cc.manterAcordado) ccManterAcordado(true);
        if (cmd.sendAt - ccNow() > CC.AQUECER_ANTES) await ccAquecer();

        // UM termo só, e isso é a lição mais cara desta noite.
        //
        // Antes era `sendAt - meioRtt - viés`: duas correções somadas, uma CHUTADA (meia
        // sonda HEAD num arquivo estático) e outra APRENDIDA. O aprendido tinha que brigar
        // contra o chute, e os dois saturaram juntos — meioRtt travado em 600, viés em 150.
        // Resultado medido contra o jogo: comando 748ms ADIANTADO. 600+150=750.
        //
        // A sonda HEAD já tinha se mostrado sem relação com o custo real de um POST na
        // praça (85ms estimados contra ~184ms reais). Ela não pertence a esta conta. O viés
        // aprende a latência inteira a partir da chegada que o jogo publica, que é a única
        // medida honesta disponível. ccSondar continua existindo, mas só pra exibição.
        const correcao = (config.cc.modo === 'fixo') ? (config.cc.offsetFixoMs || 0) : (config.cc.biasMs || 0);
        const alvoChamada = cmd.sendAt - correcao;
        const real = await ccEsperarPreciso(alvoChamada);
        cmd.atrasoEscadaMs = Math.round(real - alvoChamada);
        ccDispararAgora(cmd);       // sem await: o próximo da onda não pode esperar a resposta
        ccRenderPagina();
      }
    } finally {
      _ccMotorAtivo = false;
      if (!ccJanelaCritica(CC.ACORDAR_ANTES)) ccManterAcordado(false);
    }
  }

  function ccRotulo(cmd) { return (cmd.kind || 'attack') + ' ' + cmd.origin + ' → ' + cmd.x + '|' + cmd.y; }

  // Tick de manutenção: resolve durações pendentes, descarta o que passou, reagenda.
  let ccTimer = null;
  async function ccTick() {
    clearTimeout(ccTimer);
    const fila = (config.cc && config.cc.fila) || [];
    const vivos = fila.filter((c) => c.state === 'armado' || c.state === 'preparado');
    // A varredura de conferência vem ANTES da saída antecipada: com a fila vazia de
    // comandos vivos, ainda pode haver envio recente esperando ser conferido contra o
    // jogo. Era esse o buraco — o tick desligava e o erro real nunca era medido.
    const porConferir = ccPendentesDeConferencia().length;
    if (porConferir) ccConferirPendentes().catch(() => {});
    if (!vivos.length) {
      ccManterAcordado(false);
      if (porConferir) ccTimer = setTimeout(ccTick, 30000);
      return;
    }
    if (captchaBlocked()) { ccTimer = setTimeout(ccTick, 30000); return; }
    for (const cmd of vivos) {
      if (!ccCalcularSaida(cmd)) {
        // Modo chegada sem duração: uma confirmação só pra descobrir o tempo de viagem.
        // O servidor devolve a duração EXATA — melhor que qualquer tabela de velocidade.
        try { await ccPreparar(cmd); ccCalcularSaida(cmd); }
        catch (e) { cmd.state = 'falhou'; cmd.erro = 'não consegui a duração: ' + (e.message || e); save(); continue; }
      }
    }
    if (config.cc.manterAcordado && ccJanelaCritica(CC.ACORDAR_ANTES)) ccManterAcordado(true);
    if (!ccJanelaCritica(CC.ACORDAR_ANTES)) ccReancorarSeSeguro();
    save();
    // O tick só faz manutenção. Quem espera e dispara é o motor, e ele é um só —
    // chamá-lo de novo enquanto roda é no-op, por isso não há mais corrida de re-agendar.
    ccMotor();
    ccTimer = setTimeout(ccTick, 30000);
  }

  // Retomada depois de F5. Payload de outra sessão é descartado (token velho).
  // Comando que ficou em 'disparando' vira INCERTO e nunca é reenviado sozinho.
  function ccRetomar() {
    if (!config.cc) config.cc = defCC();
    const fila = config.cc.fila || [];
    let incertos = 0;
    fila.forEach((c) => {
      if (c.state === 'disparando') { c.state = 'incerto'; c.erro = 'a aba caiu durante o envio — confira na tela de comandos'; incertos++; }
      if (c.payload && c.payload.h !== CSRF) { c.payload = null; if (c.state === 'preparado') c.state = 'armado'; }
    });
    // Faxina: enviados/falhados com mais de 12h saem da fila (ela crescia sem limite).
    const corte = ccNow() - 12 * 3600 * 1000;
    config.cc.fila = fila.filter((c) => (c.state === 'armado' || c.state === 'preparado') || (c.sentAt || c.alvoMs || 0) > corte);
    save();
    if (incertos) pushLog('🎯 Central: ' + incertos + ' comando(s) ficaram INCERTOS (a aba caiu no envio). Não vou reenviar — confira na tela de comandos.', 'err', 'planner');
    ccTick();
  }

  // ── API da fila (a interface vem depois; por ora dá pra usar pelo console) ───────
  // ccAdicionar({ origin, x, y, kind, amounts, modo:'chegada'|'saida', quandoLocal:'2026-07-28T21:00:00' })
  function ccAdicionar(o) {
    if (!config.cc) config.cc = defCC();
    const alvoMs = o.alvoMs || arrivalToServerMs(o.quandoLocal);
    if (!alvoMs) throw new Error('horário inválido');
    if (!o.origin || !o.x || !o.y) throw new Error('informe origem e alvo');
    if (!o.amounts || !Object.keys(o.amounts).length) throw new Error('informe as tropas');
    const cmd = {
      id: genId(), origin: String(o.origin), x: String(o.x), y: String(o.y),
      kind: o.kind || 'attack', amounts: o.amounts,
      modo: o.modo === 'saida' ? 'saida' : 'chegada',
      alvoMs: alvoMs, durSec: null, sendAt: 0, payload: null,
      state: 'armado', erro: null, sentAt: null, erroMs: null, rttEnvioMs: null,
    };
    config.cc.fila.push(cmd); save();
    ccManterAcordado(true);   // chamado a partir de um clique: aproveita o gesto do usuário
    ccTick();
    return cmd;
  }
  function ccRemover(id) {
    if (!config.cc) return false;
    const c = config.cc.fila.find((x) => x.id === id);
    if (!c) return false;
    config.cc.fila = config.cc.fila.filter((x) => x.id !== id);
    save();
    return true;
  }

  // ── Aferição ────────────────────────────────────────────────────────────────────
  // Mede a precisão da escada de espera SEM ENVIAR NADA. É o jeito de saber se os 10ms
  // são reais nesta máquina/rede antes de confiar um trem de nobre à central.
  // Rode no console: await ccAferir(8)
  async function ccAferir(n) {
    const rodadas = n || 8;
    ccAncorar();
    const rede = await ccSondar(8);
    const erros = [];
    for (let i = 0; i < rodadas; i++) {
      const alvo = ccNow() + 3000 + (i % 3) * 250;   // varia a fase pra não cair sempre no mesmo grão
      await ccAquecer();
      const real = await ccEsperarPreciso(alvo);
      erros.push(Math.round((real - alvo) * 1000) / 1000);
    }
    const ord = erros.slice().sort((a, b) => a - b);
    const r = {
      erroMs: erros,
      mediana: ord[Math.floor(ord.length / 2)],
      pior: ord[ord.length - 1],
      rede: rede,
      meioRtt: ccMeioRtt(),
      biasAtual: config.cc.biasMs,
      derivaDaAncora: ccDeriva(),
      abaOculta: document.hidden,
      keepAwake: ccAcordadoOk(),
    };
    pushLog('🎯 Aferição: erro mediano ' + r.mediana + 'ms (pior ' + r.pior + 'ms) · rede ' + (rede ? rede.mediana + 'ms ±' + rede.jitter : 'n/d') + ' · keep-awake ' + (r.keepAwake ? 'on' : 'off'), 'ok', 'planner');
    return r;
  }

  // Diagnóstico do relógio: compara o Timing do jogo com o cabeçalho Date do servidor.
  // NÃO aplica correção — o Date pode vir de proxy/CDN e tem grão de 1 segundo. Serve
  // pra saber se vale a pena buscar precisão abaixo disso. Rode: await ccSincronizar()
  async function ccSincronizar(maxSondas) {
    const N = maxSondas || 25;
    let anterior = null;
    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      let hdr = null;
      try {
        const r = await fetch(CC_PING + '?s=' + i + '_' + Math.random(), { method: 'HEAD', cache: 'no-store', credentials: 'omit' });
        hdr = r.headers.get('date');
      } catch (e) { break; }
      const t1 = performance.now();
      if (!hdr) return { ok: false, motivo: 'servidor não devolve cabeçalho Date' };
      const seg = Date.parse(hdr);
      if (isNaN(seg)) return { ok: false, motivo: 'cabeçalho Date ilegível: ' + hdr };
      if (anterior != null && seg > anterior) {
        // A virada de segundo caiu entre o fim da resposta anterior e esta. O melhor
        // palpite do instante da virada é o meio da ida desta requisição.
        const instante = _ccAnc.srv + ((t0 + (t1 - t0) / 2) - _ccAnc.perf);
        return {
          ok: true,
          desvioMs: Math.round(seg - instante),
          incertezaMs: Math.round((t1 - t0) / 2),
          sondas: i + 1,
          nota: 'positivo = o relógio do jogo está ATRASADO em relação ao Date do servidor. Diagnóstico apenas; não foi aplicado.',
        };
      }
      anterior = seg;
      await ccDormir(45);
    }
    return { ok: false, motivo: 'não peguei a virada de segundo em ' + N + ' sondas' };
  }

  // ════════════════════════════════════════════════════════════════════════════════
  // CENTRAL — INTERFACE
  //
  // Dividida como o Nexus divide, que é como o usuário descreveu antes de ver a tela
  // deles: o AGENDADOR RÁPIDO mora na tela da aldeia (screen=place), na linguagem
  // visual do próprio TW; a PÁGINA PRÓPRIA é a fila com contagem regressiva e a
  // aferição de precisão.
  //
  // A tela do Nexus só CRIA comando — não mostra a fila. Aqui é o contrário do que
  // importa: a fila com contagem regressiva é onde se percebe que algo está errado
  // ANTES de custar exército. E depois de medir 20ms de dispersão só de thread
  // ocupada, mostrar o erro real não é vaidade: é como saber se dá pra confiar um
  // trem de nobres à central.
  // ════════════════════════════════════════════════════════════════════════════════

  let _ccEstiloOk = false;
  function ccInjetarEstilo() {
    if (_ccEstiloOk) return; _ccEstiloOk = true;
    const s = document.createElement('style');
    s.textContent = [
      "#twmgr-ccpg{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.62)}",
      "#twmgr-ccpg.on{display:flex}",
      "#twmgr-ccbox{width:min(1080px,94vw);max-height:88vh;display:flex;flex-direction:column;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#463b30;background:linear-gradient(160deg,#fdfaf5,#fffdfa);border:1px solid #e6d9c2;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.7);overflow:hidden}",
      "#twmgr-ccbox *{box-sizing:border-box}",
      "#twmgr-cchead{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:linear-gradient(90deg,#fbf6ee,#fdfaf5 55%,#fbf6ee);color:#fff;border-bottom:1px solid #e8d9bf}",
      "#twmgr-cchead .t{font-weight:700;font-size:13px;letter-spacing:.3px}",
      "#twmgr-ccx{cursor:pointer;font-size:19px;line-height:1;padding:0 4px;opacity:.85}#twmgr-ccx:hover{opacity:1}",
      "#twmgr-ccbody{flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 14px 14px}",
      "#twmgr-ccbody::-webkit-scrollbar{width:9px}#twmgr-ccbody::-webkit-scrollbar-thumb{background:#e0d6c6;border-radius:4px}",
      ".twmgr-cct{width:100%;border-collapse:collapse;font-size:11px}",
      ".twmgr-cct th{font-size:9px;color:#a2643a;font-weight:700;padding:5px 6px;border-bottom:1px solid #e0d6c6;text-transform:uppercase;text-align:left;letter-spacing:.4px}",
      ".twmgr-cct td{padding:5px 6px;border-bottom:1px solid rgba(0,0,0,.07);vertical-align:middle}",
      ".twmgr-cct tr:hover td{background:rgba(162,100,58,.05)}",
      ".twmgr-ccst{font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}",
      ".twmgr-ccst.armado{background:rgba(90,140,220,.18);color:#3f6091;border:1px solid #3f6091}",
      // As cores seguem duas familias, e isso nao e enfeite: azul/verde = no rumo,
      // ambar/vermelho = precisa de voce. 'preparado' e 'incerto' sairam quase iguais
      // na primeira versao (mesma borda, texto a 23 pontos de distancia) e significam
      // coisas opostas — um esta saudavel, o outro quer dizer "pode ter enviado, va
      // conferir". Confundir os dois custa exercito. 'incerto' tambem e tracejado.
      ".twmgr-ccst.preparado{background:rgba(70,190,190,.15);color:#1f8f8f;border:1px solid #2f7d7d}",
      // Bem mais claro que 'incerto', que e ambar: 'disparando' e o instante em que o
      // POST esta no ar, e brilho maior le como "acontecendo agora".
      ".twmgr-ccst.disparando{background:rgba(255,170,70,.26);color:#6f6153;border:1px solid #d68a2a}",
      ".twmgr-ccst.enviado{background:rgba(63,206,84,.15);color:#2e7d3a;border:1px solid #2f7d3a}",
      ".twmgr-ccst.incerto{background:rgba(230,150,40,.16);color:#8b5426;border:1px dashed #c98a22}",
      ".twmgr-ccst.falhou,.twmgr-ccst.perdido{background:rgba(231,76,60,.16);color:#c0483a;border:1px solid #9c3a2c}",
      ".twmgr-cccd{font-variant-numeric:tabular-nums;font-weight:700;color:#a2643a;font-family:Consolas,'Courier New',monospace}",
      ".twmgr-cccd.perto{color:#c2592c}",
      ".twmgr-ccmet{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:11px}",
      ".twmgr-ccm{flex:1 1 0;min-width:96px;background:linear-gradient(165deg,#f6f1e8,#fffdfa);border:1px solid #e0d6c6;border-radius:9px;padding:8px 7px;text-align:center}",
      ".twmgr-ccm .v{font-size:18px;font-weight:800;color:#a2643a;line-height:1;font-variant-numeric:tabular-nums}",
      ".twmgr-ccm .l{font-size:8px;color:#8a7d6d;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}",
      ".twmgr-ccm.ruim .v{color:#c0483a}", ".twmgr-ccm.bom .v{color:#2e7d3a}",
      ".twmgr-ccvazio{text-align:center;color:#8a7d6d;font-size:11px;padding:22px 0}",
      "#twmgr-ccpg-btn{cursor:pointer;font-size:13px;line-height:1;padding:2px 3px;border-radius:5px;opacity:.85;transition:.15s}",
      "#twmgr-ccpg-btn:hover{opacity:1;background:rgba(255,255,255,.14)}",
    ].join('');
    document.head.appendChild(s);
  }

  // COM os milissegundos. A tabela mostrava só até o segundo, e numa ferramenta que existe
  // pra acertar milissegundo isso é cegueira: num teste de 8 comandos espaçados de 100ms,
  // as oito linhas apareciam idênticas e não dava pra ver que o espaçamento tinha colapsado.
  function ccFmtHora(ms) {
    if (!ms) return '—';
    const d = new Date(ms - wallToServerOffset());
    // Texto puro de propósito: esta função também vai pro log e pra mensagens do agendador
    // da praça, que são inseridos como TEXTO — devolver HTML aqui apareceria como tag crua.
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) +
      '.' + ('00' + d.getMilliseconds()).slice(-3);
  }
  function ccFmtFalta(ms) {
    if (ms == null) return '—';
    const neg = ms < 0; let s = Math.floor(Math.abs(ms) / 1000);
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    return (neg ? '-' : '') + (h ? h + ':' : '') + ('0' + m).slice(-2) + ':' + ('0' + s).slice(-2);
  }
  function ccResumoTropa(a) {
    return UNITS.filter(([u]) => a[u]).map(([u, n]) => n + ' ' + a[u]).join(' · ') || '—';
  }

  let _ccPgTimer = null;
  function ccAbrirPagina() {
    ccInjetarEstilo();
    let pg = document.getElementById('twmgr-ccpg');
    if (!pg) {
      pg = document.createElement('div'); pg.id = 'twmgr-ccpg';
      pg.innerHTML =
        '<div id="twmgr-ccbox">' +
          '<div id="twmgr-cchead"><span class="t">🎯 Central de Comando</span>' +
            '<span><button id="twmgr-cc-teste" class="twmgr-btn twmgr-ghost" style="margin-right:8px" title="Monta e roda uma onda de teste. Auto-acha origens (aldeias suas com exploradores) e alvo (bárbara mais próxima). Simula por padrão.">🧪 Testar</button>' +
            '<button id="twmgr-cc-aferir" class="twmgr-btn twmgr-ghost" style="margin-right:8px" title="Mede a precisão real desta máquina. NÃO envia nada.">📏 Aferir</button>' +
            '<span id="twmgr-ccx" title="fechar (Esc)">×</span></span></div>' +
          '<div id="twmgr-ccbody">' +
            '<div id="twmgr-ccmet" class="twmgr-ccmet"></div>' +
            // Painel de ajuste. Existe porque NÃO HÁ resposta universal: a latência é da
            // sua conexão, não do código. Eu tinha tudo isto como constante fixa, sem
            // escape nenhum se o estimador errasse — e ele errou duas vezes nos testes.
            '<details id="twmgr-ccconf" class="twmgr-section" style="margin-bottom:11px">' +
              '<summary style="cursor:pointer;font-size:10px;color:#8b5426;font-weight:700;letter-spacing:.5px;text-transform:uppercase">⚙ Ajuste de precisão</summary>' +
              '<div style="margin-top:9px">' +
                '<div class="twmgr-row"><span class="twmgr-lbl" title="Adaptativo mede o atraso dos últimos comandos e ajusta sozinho. Fixo usa o valor que você digitar — use se o adaptativo não convergir.">Modo</span>' +
                  '<select id="twmgr-cc-modo" class="twmgr-inp" style="width:190px"><option value="adaptativo">Adaptativo (ele mede)</option><option value="fixo">Fixo (você define)</option></select></div>' +
                '<div class="twmgr-row" id="twmgr-cc-row-fixo"><span class="twmgr-lbl" title="Quantos ms antes da hora o comando deve sair, pra compensar a viagem até o servidor.">Offset fixo (ms)</span>' +
                  '<input id="twmgr-cc-offset" class="twmgr-inp" type="number" step="10" style="width:90px"></div>' +
                '<div class="twmgr-row" id="twmgr-cc-row-estilo"><span class="twmgr-lbl" title="Responsivo acompanha mudança de latência rápido. Estável ignora variação curta — melhor em conexão instável.">Estilo do ajuste</span>' +
                  '<select id="twmgr-cc-estilo" class="twmgr-inp" style="width:190px"><option value="estavel">Estável (ignora variação curta)</option><option value="responsivo">Responsivo (reage rápido)</option></select></div>' +
                '<div class="twmgr-row"><span class="twmgr-lbl" title="Erro acima disto é tratado como defeito e ignorado no aprendizado, em vez de virar correção permanente.">Máximo de correção (ms)</span>' +
                  '<input id="twmgr-cc-maxcorr" class="twmgr-inp" type="number" min="100" step="100" style="width:90px"></div>' +
                '<div class="twmgr-hint" style="margin:6px 0 0">O modo adaptativo só aprende com envios em que a <b>própria espera</b> acertou (erro de escada abaixo de ' + CC.GUARDA_DERIVA_MS + 'ms). Amostra ruim é descartada em vez de envenenar a média — o log avisa quando isso acontece.</div>' +
              '</div>' +
            '</details>' +
            '<div id="twmgr-cctest" class="twmgr-section" style="display:none;margin-bottom:11px;border:1px solid #a2643a;border-radius:6px;padding:9px 11px;background:#f6f1e8">' +
              '<div style="font-size:10px;color:#8b5426;font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px">🧪 Teste de disparo</div>' +
              '<div class="twmgr-row"><span class="twmgr-lbl" title="quantas aldeias suas disparam nesta onda, cada uma mira a mesma bárbara">Nº de aldeias</span><input id="twmgr-ct-n" class="twmgr-inp" type="number" min="1" max="8" value="3" style="width:80px"></div>' +
              '<div class="twmgr-row"><span class="twmgr-lbl" title="espaçamento pedido entre disparos consecutivos">Gap (ms)</span><input id="twmgr-ct-gap" class="twmgr-inp" type="number" min="100" step="10" value="150" style="width:80px"></div>' +
              '<div class="twmgr-row"><span class="twmgr-lbl" title="daqui a quantos segundos a onda começa a sair">Sair daqui a (s)</span><input id="twmgr-ct-s" class="twmgr-inp" type="number" min="8" value="20" style="width:80px"></div>' +
              '<div class="twmgr-row"><span class="twmgr-lbl" title="MARCADO: envia 5 exploradores de verdade a uma bárbara (eles espionam e voltam sozinhos). DESMARCADO: só simula — o motor roda mas nada sai.">Envio real (5 explor.)</span><input id="twmgr-ct-real" type="checkbox"></div>' +
              '<div style="display:flex;gap:9px;align-items:center;margin-top:9px">' +
                '<button id="twmgr-ct-run" class="twmgr-btn" style="padding:4px 14px">Rodar teste</button>' +
                '<span id="twmgr-ct-msg" style="font-size:10px;color:#8a7d6d"></span></div>' +
            '</div>' +
            '<div id="twmgr-ccfila"></div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(pg);
      pg.addEventListener('click', (e) => { if (e.target === pg) ccFecharPagina(); });
      document.getElementById('twmgr-ccx').addEventListener('click', ccFecharPagina);
      document.getElementById('twmgr-cc-aferir').addEventListener('click', async (ev) => {
        const b = ev.currentTarget; b.disabled = true; b.textContent = '📏 medindo…';
        try { const r = await ccAferir(8); b.textContent = '📏 ' + r.mediana + 'ms'; }
        catch (e) { b.textContent = '📏 erro'; }
        setTimeout(() => { b.disabled = false; b.textContent = '📏 Aferir'; }, 4000);
        ccRenderPagina();
      });
      document.getElementById('twmgr-cc-teste').addEventListener('click', () => {
        const p = document.getElementById('twmgr-cctest');
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
      });
      document.getElementById('twmgr-ct-run').addEventListener('click', async (ev) => {
        const b = ev.currentTarget, msg = document.getElementById('twmgr-ct-msg');
        const real = document.getElementById('twmgr-ct-real').checked;
        b.disabled = true; b.textContent = 'montando…'; msg.style.color = '#8a7d6d'; msg.textContent = 'lendo aldeias e mapa…';
        try {
          const plano = await ccTeste({
            nOrigens: parseInt(document.getElementById('twmgr-ct-n').value, 10) || 3,
            gap: parseInt(document.getElementById('twmgr-ct-gap').value, 10) || 150,
            emSegundos: parseInt(document.getElementById('twmgr-ct-s').value, 10) || 20,
            real: real,
          });
          msg.style.color = '#2d6a2f';
          msg.textContent = (real ? 'REAL' : 'simulação') + ': ' + plano.origens.length + ' aldeia(s) → bárbara ' +
            plano.alvo.x + '|' + plano.alvo.y + ' (dist ' + plano.dist + '). Acompanhe na fila; o resumo cai no log.';
        } catch (e) { msg.style.color = '#a8564a'; msg.textContent = String(e.message || e); }
        b.disabled = false; b.textContent = 'Rodar teste';
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ccFecharPagina(); });
      // Ajuste de precisão: lê do config, salva na hora, e mostra só os campos do modo ativo.
      const cf = () => (config.cc = config.cc || defCC());
      const liga = (id, prop, num) => {
        const el = document.getElementById(id); if (!el) return;
        el.value = cf()[prop];
        el.addEventListener('change', () => {
          const v = num ? (parseInt(el.value, 10) || 0) : el.value;
          cf()[prop] = num ? Math.max(num === 'pos' ? 100 : -99999, v) : v;
          el.value = cf()[prop];
          save(); ccConfVisibilidade(); ccRenderPagina();
        });
      };
      liga('twmgr-cc-modo', 'modo'); liga('twmgr-cc-estilo', 'estilo');
      liga('twmgr-cc-offset', 'offsetFixoMs', true); liga('twmgr-cc-maxcorr', 'maxCorrecaoMs', 'pos');
      ccConfVisibilidade();
    }
    pg.classList.add('on');
    ccManterAcordado(true);   // aproveita o gesto do clique pra destravar o áudio
    ccRenderPagina();
    clearInterval(_ccPgTimer);
    _ccPgTimer = setInterval(ccRenderPagina, 500);
  }
  // Offset fixo só faz sentido no modo fixo; estilo do ajuste só no adaptativo.
  function ccConfVisibilidade() {
    const cc = config.cc || defCC();
    const rf = document.getElementById('twmgr-cc-row-fixo');
    const re = document.getElementById('twmgr-cc-row-estilo');
    if (rf) rf.style.display = cc.modo === 'fixo' ? '' : 'none';
    if (re) re.style.display = cc.modo === 'fixo' ? 'none' : '';
  }

  function ccFecharPagina() {
    const pg = document.getElementById('twmgr-ccpg'); if (pg) pg.classList.remove('on');
    clearInterval(_ccPgTimer); _ccPgTimer = null;
  }

  function ccRenderPagina() {
    const pg = document.getElementById('twmgr-ccpg');
    if (!pg || !pg.classList.contains('on')) { clearInterval(_ccPgTimer); _ccPgTimer = null; return; }
    const cc = config.cc || defCC();
    const fila = cc.fila || [];
    const vivos = fila.filter((c) => c.state === 'armado' || c.state === 'preparado' || c.state === 'disparando');
    const ult = (cc.afericoes || []).slice(-1)[0];

    // Painel de precisão. O erro medido é o que diz se dá pra confiar um nobre a ela.
    const erroClasse = !ult ? '' : (Math.abs(ult.erro) <= 10 ? 'bom' : (Math.abs(ult.erro) > 30 ? 'ruim' : ''));
    const met = document.getElementById('twmgr-ccmet');
    met.innerHTML =
      '<div class="twmgr-ccm"><div class="v">' + vivos.length + '</div><div class="l">na fila</div></div>' +
      '<div class="twmgr-ccm ' + erroClasse + '"><div class="v">' + (ult ? (ult.erro > 0 ? '+' : '') + ult.erro + 'ms' : '—') + '</div><div class="l">último erro</div></div>' +
      (cc.modo === 'fixo'
        ? '<div class="twmgr-ccm"><div class="v">' + (cc.offsetFixoMs > 0 ? '+' : '') + cc.offsetFixoMs + 'ms</div><div class="l">offset fixo</div></div>'
        : '<div class="twmgr-ccm"><div class="v">' + (cc.biasMs > 0 ? '+' : '') + cc.biasMs + 'ms</div><div class="l">viés aprendido (' + (cc.nReal || 0) + ')</div></div>') +
      '<div class="twmgr-ccm"><div class="v">' + (cc.rttMs || '—') + 'ms</div><div class="l">ida-e-volta</div></div>' +
      '<div class="twmgr-ccm ' + (ccAcordadoOk() ? 'bom' : '') + '"><div class="v">' + (ccAcordadoOk() ? 'on' : 'off') + '</div><div class="l">anti-estrangul.</div></div>';

    const alvo = document.getElementById('twmgr-ccfila');
    if (!fila.length) {
      alvo.innerHTML = '<div class="twmgr-ccvazio">Nada agendado.<br><br>Abra a praça de reunião de uma aldeia e use o <b>Agendador rápido</b> pra marcar um comando.</div>';
      return;
    }
    const ordem = fila.slice().sort((a, b) => (a.sendAt || a.alvoMs || 0) - (b.sendAt || b.alvoMs || 0));
    const agora = ccNow();
    alvo.innerHTML =
      '<table class="twmgr-cct"><thead><tr>' +
        '<th style="width:88px">Estado</th><th style="width:74px">Sai em</th><th>Comando</th>' +
        '<th style="width:96px">Sai</th><th style="width:96px">Chega</th><th style="width:64px">Erro</th><th style="width:26px"></th>' +
      '</tr></thead><tbody>' +
      ordem.map((c) => {
        const falta = c.sendAt ? c.sendAt - agora : null;
        const vivo = (c.state === 'armado' || c.state === 'preparado');
        const chega = c.modo === 'chegada' ? c.alvoMs : (c.durSec ? c.sendAt + c.durSec * 1000 : null);
        return '<tr>' +
          '<td><span class="twmgr-ccst ' + c.state + '">' + c.state + '</span></td>' +
          '<td class="twmgr-cccd' + (vivo && falta != null && falta < 60000 ? ' perto' : '') + '">' + (vivo ? ccFmtFalta(falta) : '—') + '</td>' +
          '<td>' + (c.kind === 'support' ? '🛡️' : '⚔️') + ' <b>' + c.origin + '</b> → ' + c.x + '|' + c.y +
            '<div style="font-size:9px;color:#8a7d6d">' + ccResumoTropa(c.amounts) + (c.erro ? ' · <span style="color:#a8564a">' + c.erro + '</span>' : '') + '</div></td>' +
          '<td>' + ccFmtHora(c.sendAt) + '</td>' +
          '<td>' + ccFmtHora(chega) + '</td>' +
          // Mostra o erro REAL (chegada publicada pelo jogo) quando já conferido; enquanto
          // não conferiu, a estimativa entre parênteses, pra ficar claro que é provisória.
          '<td class="twmgr-cccd">' + (c.erroRealMs != null
            ? (c.erroRealMs > 0 ? '+' : '') + c.erroRealMs + 'ms'
            : (c.erroMs == null ? '—' : '<span style="opacity:.55">(' + (c.erroMs > 0 ? '+' : '') + c.erroMs + ')</span>')) + '</td>' +
          '<td>' + (vivo ? '<span class="twmgr-del twmgr-cc-rm" data-id="' + c.id + '" title="cancelar">✕</span>' : '') + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
    alvo.querySelectorAll('.twmgr-cc-rm').forEach((el) => el.addEventListener('click', () => {
      const c = (config.cc.fila || []).find((x) => x.id === el.getAttribute('data-id'));
      ccRemover(el.getAttribute('data-id'));
      if (c) pushLog('🎯 Central: ' + ccRotulo(c) + ' cancelado antes de sair.', '', 'planner');
      ccRenderPagina();
    }));
  }

  // ── Agendador rápido, injetado na praça de reunião ──────────────────────────────
  // Matriz Mínimo / Enviar / Tudo / Disponível, copiada do Nexus porque resolve num
  // controle só o que o Coordenado não expressa: "manda tudo MENOS X". Sem mínimo por
  // unidade, "tudo" esvazia a aldeia e sobra preencher número na mão.
  //
  // Diferença: o Nexus tem um botão "buscar tropas". Aqui não precisa — na tela da
  // praça os disponíveis já estão no DOM. Zero requisição pra montar a tela.
  // As unidades QUE ESTE MUNDO TEM, não a lista fixa de 12. O br143 roda com 10 — sem
  // arqueiro nem arqueiro a cavalo — e a matriz desenhava duas colunas sempre zeradas,
  // que eram justamente as que empurravam a tabela pros 978px que precisaram rolar.
  function ccUnidades() {
    try {
      const w = window.game_data && window.game_data.units;
      if (Array.isArray(w) && w.length) {
        const tem = UNITS.filter(([u]) => w.indexOf(u) >= 0);
        if (tem.length) return tem;
      }
    } catch (e) {}
    return UNITS;
  }

  function ccLerDisponivelDaTela() {
    const av = {};
    UNITS.forEach(([u]) => {
      let n = 0;
      const el = document.querySelector('a.units-entry-all[data-unit="' + u + '"]');
      if (el) { const dc = el.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (el.textContent || '').replace(/\D/g, ''), 10); }
      av[u] = isNaN(n) ? 0 : n;
    });
    return av;
  }

  function ccInjetarPraca() {
    if (document.getElementById('twmgr-ccq')) return;
    const url = new URLSearchParams(location.search);
    const tela = url.get('screen'), modo = url.get('mode');
    // A praça tem oito abas (Comandos, Tropas, Coletando, Coleta em Massa, Simulador,
    // Aldeias próximas, Apoio em massa, Modelos) e todas são screen=place. Sem olhar o
    // mode, o agendador aparecia em todas — inclusive na de coleta, onde não faz sentido.
    // Só a de Comandos (sem mode, ou mode=command) e a tela de informações da aldeia.
    if (!(tela === 'place' && (!modo || modo === 'command'))) return;
    const form = document.querySelector('#command-data-form') || document.querySelector('form[action*="try=confirm"]') || document.querySelector('#content_value');
    if (!form) return;
    ccInjetarEstilo();
    const disp = ccLerDisponivelDaTela();
    const cel = (u) => '<td style="text-align:center;padding:2px 3px">';
    const box = document.createElement('div');
    box.id = 'twmgr-ccq';
    box.style.cssText = 'margin:10px 0;border:1px solid #a2643a;border-radius:6px;background:#f4e4bc;color:#3b2914;font-size:11px;overflow:hidden';
    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;background:linear-gradient(180deg,#e3c88b,#d3b26a);border-bottom:1px solid #a2643a;font-weight:700">' +
        '<span>🎯 Agendador rápido — Central de Comando</span>' +
        '<span><a href="javascript:void(0)" id="twmgr-ccq-fila" style="font-weight:400;margin-right:10px">ver fila</a><span id="twmgr-ccq-tog" style="cursor:pointer">▾</span></span></div>' +
      '<div id="twmgr-ccq-body" style="padding:8px 10px">' +
        // 12 colunas de unidade x 4 linhas pedem 978px (medido). A coluna de conteudo do
        // jogo nem sempre e tao larga, e apertar as colunas deixaria os campos ilegiveis.
        // Rola dentro do proprio contentor em vez de arrebentar o layout do jogo.
        '<div style="overflow-x:auto;margin-bottom:8px">' +
        '<table style="border-collapse:collapse;min-width:900px;width:100%"><tbody>' +
          '<tr><td style="font-size:10px;color:#5c4321;padding:2px 4px"></td>' + ccUnidades().map(([u, n]) => '<td style="text-align:center;padding:2px 3px">' + unitIcon(u, n) + '</td>').join('') + '</tr>' +
          '<tr><td style="font-size:10px;color:#5c4321;padding:2px 4px" title="quantas ficam em casa">Mínimo</td>' +
            ccUnidades().map(([u]) => cel(u) + '<input class="twmgr-ccq-min" data-u="' + u + '" type="number" min="0" value="0" style="width:42px;text-align:center;font-size:11px"></td>').join('') + '</tr>' +
          '<tr><td style="font-size:10px;color:#5c4321;padding:2px 4px">Enviar</td>' +
            ccUnidades().map(([u]) => cel(u) + '<input class="twmgr-ccq-qtd" data-u="' + u + '" type="number" min="0" value="0" style="width:42px;text-align:center;font-size:11px"></td>').join('') + '</tr>' +
          '<tr><td style="font-size:10px;color:#5c4321;padding:2px 4px" title="manda tudo que houver, menos o mínimo">Tudo</td>' +
            ccUnidades().map(([u]) => cel(u) + '<input class="twmgr-ccq-all" data-u="' + u + '" type="checkbox"></td>').join('') + '</tr>' +
          '<tr style="border-top:1px solid #ddd2c0"><td style="font-size:10px;color:#5c4321;padding:2px 4px">Disponível</td>' +
            ccUnidades().map(([u]) => cel(u) + '<span class="twmgr-ccq-av" data-u="' + u + '" style="font-size:10px;color:#584526">' + (disp[u] || 0) + '</span></td>').join('') + '</tr>' +
        '</tbody></table></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">' +
          '<label>Alvo<br><input id="twmgr-ccq-alvo" type="text" placeholder="500|600" style="width:88px"></label>' +
          '<label>Tipo<br><select id="twmgr-ccq-tipo" style="width:80px"><option value="attack">⚔️ Ataque</option><option value="support">🛡️ Apoio</option></select></label>' +
          '<label>Marcar por<br><select id="twmgr-ccq-modo" style="width:96px"><option value="chegada">Chegada</option><option value="saida">Saída</option></select></label>' +
          // step=0.001 faz o próprio campo aceitar milissegundos (30/07/2026 12:50:35,478).
          // Antes era step=1 mais uma caixinha "± ms" separada — gambiarra minha, e o Nexus
          // mostra que não precisa: um campo só, e o valor que o usuário digita é o valor.
          '<label id="twmgr-ccq-lblh">Horário (com ms)<br><input id="twmgr-ccq-hora" type="datetime-local" step="0.001" style="width:210px"></label>' +
          '<label title="deslocamento adicional, somado ao horário acima. Deixe 0 se já digitou os ms no campo ao lado.">± ms extra<br><input id="twmgr-ccq-ms" type="number" value="0" step="1" style="width:80px"></label>' +
          // Onda montada aqui, em vez de o usuário agendar N vezes na mão — que foi o que
          // ele fez no primeiro teste, e o resultado ficou impossível de ler porque os N
          // comandos apareciam idênticos. O piso de 50ms é o padrão do Nexus ("Gap de
          // Reordenação"); abaixo disso dois disparos se atropelam no motor.
          '<label title="quantos comandos nesta onda. Cada um sai depois do anterior, espaçado pelo gap.">Qtd<br><input id="twmgr-ccq-qtd-onda" type="number" min="1" max="20" value="1" style="width:56px"></label>' +
          '<label title="espaçamento entre comandos consecutivos da onda. Mínimo 100ms: medido no br143, o servidor processa comandos da mesma conta em fila e não entrega mais rápido que isso, por mais cedo que eu dispare.">Gap (ms)<br><input id="twmgr-ccq-gap" type="number" min="100" step="10" value="100" style="width:70px"></label>' +
          '<button id="twmgr-ccq-add" class="btn" style="padding:4px 12px">🎯 Agendar</button>' +
        '</div>' +
        '<div id="twmgr-ccq-msg" style="margin-top:7px;font-size:10px;min-height:13px;color:#584526"></div>' +
      '</div>';
    (form.parentNode === document.body ? form : form).insertAdjacentElement('beforebegin', box);

    const q = (s) => box.querySelector(s);
    const todos = (s) => Array.prototype.slice.call(box.querySelectorAll(s));
    // "Tudo" marcado cinza o campo Enviar — o número passa a ser calculado.
    function sincronizarLinha() {
      todos('.twmgr-ccq-all').forEach((ck) => {
        const u = ck.getAttribute('data-u');
        const inp = box.querySelector('.twmgr-ccq-qtd[data-u="' + u + '"]');
        inp.disabled = ck.checked;
        inp.style.background = ck.checked ? '#6f6153' : '';
        if (ck.checked) {
          const min = parseInt(box.querySelector('.twmgr-ccq-min[data-u="' + u + '"]').value, 10) || 0;
          inp.value = Math.max(0, (disp[u] || 0) - min);
        }
      });
    }
    todos('.twmgr-ccq-all').forEach((el) => el.addEventListener('change', sincronizarLinha));
    todos('.twmgr-ccq-min').forEach((el) => el.addEventListener('input', sincronizarLinha));
    q('#twmgr-ccq-tog').addEventListener('click', () => {
      const b = q('#twmgr-ccq-body');
      const fechado = b.style.display === 'none';
      b.style.display = fechado ? 'block' : 'none';
      q('#twmgr-ccq-tog').textContent = fechado ? '▾' : '▸';
    });
    q('#twmgr-ccq-fila').addEventListener('click', ccAbrirPagina);
    // Puxa o alvo que já estiver digitado no formulário do jogo.
    try {
      const ai = document.querySelector('input[name="input"]');
      if (ai && ai.value) q('#twmgr-ccq-alvo').value = ai.value.trim();
      else {
        const xi = document.querySelector('input[name="x"]'), yi = document.querySelector('input[name="y"]');
        if (xi && yi && xi.value && yi.value) q('#twmgr-ccq-alvo').value = xi.value + '|' + yi.value;
      }
    } catch (e) {}

    q('#twmgr-ccq-add').addEventListener('click', () => {
      const msg = q('#twmgr-ccq-msg');
      const dizer = (t, erro) => { msg.textContent = t; msg.style.color = erro ? '#a52a1a' : '#2d6a2f'; };
      try {
        const mc = (q('#twmgr-ccq-alvo').value || '').match(/(\d{1,3})\s*\|\s*(\d{1,3})/);
        if (!mc) return dizer('Informe o alvo no formato 500|600.', true);
        const hora = q('#twmgr-ccq-hora').value;
        if (!hora) return dizer('Informe o horário.', true);
        const amounts = {};
        let total = 0, estouro = [];
        // ccUnidades(), não UNITS: com 10 colunas desenhadas, procurar o campo do arqueiro
        // devolveria null e o clique em Agendar estouraria.
        ccUnidades().forEach(([u, nome]) => {
          const min = parseInt(box.querySelector('.twmgr-ccq-min[data-u="' + u + '"]').value, 10) || 0;
          const ck = box.querySelector('.twmgr-ccq-all[data-u="' + u + '"]').checked;
          const teto = Math.max(0, (disp[u] || 0) - min);
          let n = ck ? teto : (parseInt(box.querySelector('.twmgr-ccq-qtd[data-u="' + u + '"]').value, 10) || 0);
          if (n > teto) { estouro.push(nome); n = teto; }
          if (n > 0) { amounts[u] = n; total += n; }
        });
        if (!total) return dizer('Nenhuma tropa selecionada.', true);
        const base = arrivalToServerMs(hora) + (parseInt(q('#twmgr-ccq-ms').value, 10) || 0);
        const qtdOnda = Math.max(1, Math.min(20, parseInt(q('#twmgr-ccq-qtd-onda').value, 10) || 1));
        const gap = Math.max(CC.ONDA_GAP_MIN_MS, parseInt(q('#twmgr-ccq-gap').value, 10) || CC.ONDA_GAP_MIN_MS);
        const modo = q('#twmgr-ccq-modo').value;
        // A tropa de cada comando é a MESMA quantidade: uma onda de 4 leva 4x o total.
        // Confere antes de agendar, senão o 2º ao 4º falham na hora do disparo por falta
        // de tropa — e falhar no disparo é bem pior que recusar agora.
        const faltando = [];
        Object.keys(amounts).forEach((u) => { if (amounts[u] * qtdOnda > (disp[u] || 0)) faltando.push(u); });
        if (faltando.length) return dizer('Tropa insuficiente pra ' + qtdOnda + ' comandos: ' + faltando.join(', ') + '. Cada comando da onda leva a quantidade cheia.', true);
        const criados = [];
        for (let i = 0; i < qtdOnda; i++) {
          criados.push(ccAdicionar({
            origin: CUR_VID, x: mc[1], y: mc[2],
            kind: q('#twmgr-ccq-tipo').value,
            amounts: amounts, modo: modo,
            alvoMs: base + i * gap,
          }));
        }
        const aviso = estouro.length ? ' (limitei ' + estouro.join(', ') + ' ao disponível)' : '';
        dizer(qtdOnda === 1
          ? 'Agendado: ' + ccResumoTropa(amounts) + ' → ' + mc[1] + '|' + mc[2] + aviso + '. Veja a fila pra acompanhar.'
          : 'Onda de ' + qtdOnda + ' agendada → ' + mc[1] + '|' + mc[2] + ', espaçada de ' + gap + 'ms' + aviso + '. Veja a fila pra acompanhar.');
        pushLog('🎯 Central: ' + (qtdOnda === 1 ? '' : 'onda de ' + qtdOnda + ' × ') + ccRotulo(criados[0]) +
          ' agendado (' + modo + ' ' + ccFmtHora(base) + (qtdOnda > 1 ? ', gap ' + gap + 'ms' : '') + ').', 'ok', 'planner');
      } catch (e) { dizer(String(e.message || e), true); }
    });
    sincronizarLinha();
  }

  // ── Modo de teste ───────────────────────────────────────────────────────────────
  // Monta e roda uma onda de VERDADE pelo pipeline real (ccAdicionar → motor →
  // ccDispararAgora), auto-selecionando origem e alvo pra acabar com o "paranauê" de
  // achar aldeia na mão. Dois modos: simular (nada sai, _ccSim liga o curto no disparo)
  // e real (envia 5 exploradores a uma bárbara — eles espionam e voltam sozinhos).
  let _ccSim = false;
  let _ccTesteTimer = null;

  async function ccTesteMontar(opts) {
    opts = opts || {};
    const nOrig = Math.max(1, Math.min(8, opts.nOrigens || 3));
    const gap = Math.max(CC.ONDA_GAP_MIN_MS, opts.gap || 150);
    const nUnid = Math.max(5, opts.nUnid || 5);   // 5 exploradores é o piso pedido
    // 1. minhas aldeias com coordenada
    const minhas = (await getAllVillagesCached()).filter((v) => v.coord);
    if (!minhas.length) throw new Error('não consegui ler suas aldeias (overview)');
    // 2. origens que TENHAM >= nUnid exploradores livres — lê sob demanda até juntar nOrig
    const origens = [];
    for (const v of minhas) {
      if (origens.length >= nOrig) break;
      let st; try { st = await getFakeVillage(v.vid); } catch (e) { continue; }
      const cm = (v.coord || '').match(/(\d+)\|(\d+)/);
      if (cm && (st.avail.spy || 0) >= nUnid) origens.push({ vid: v.vid, name: v.name, x: +cm[1], y: +cm[2], spy: st.avail.spy });
    }
    if (!origens.length) throw new Error('nenhuma aldeia sua tem ' + nUnid + ' exploradores livres pra testar');
    // 3. alvo: bárbara mais próxima da 1ª origem. Todas miram a MESMA — é o que testa a
    //    ordem de uma onda chegando junto num alvo só (o caso do snipe/trem).
    const barbs = (await getMapVillages()).filter((v) => v.player === '0');
    if (!barbs.length) throw new Error('nenhuma bárbara no village.txt pra mirar');
    const o0 = origens[0];
    let alvo = null, melhor = Infinity;
    barbs.forEach((b) => { const d = fieldDist(o0.x, o0.y, +b.x, +b.y); if (d < melhor) { melhor = d; alvo = b; } });
    return { origens: origens, alvo: { x: +alvo.x, y: +alvo.y }, dist: Math.round(melhor * 10) / 10, gap: gap, nUnid: nUnid, emS: Math.max(8, opts.emSegundos || 20) };
  }

  async function ccTeste(opts) {
    opts = opts || {};
    const plano = await ccTesteMontar(opts);
    _ccSim = !opts.real;
    const t0 = ccNow() + plano.emS * 1000;
    plano.origens.forEach((o, i) => {
      const cmd = ccAdicionar({
        origin: o.vid, x: String(plano.alvo.x), y: String(plano.alvo.y),
        kind: 'attack', amounts: { spy: plano.nUnid }, modo: 'saida',
        alvoMs: t0 + i * plano.gap,
      });
      cmd._teste = true;
    });
    save();
    pushLog('🧪 Teste ' + (opts.real ? 'REAL' : 'SIMULADO') + ': onda de ' + plano.origens.length +
      ' aldeia(s) → bárbara ' + plano.alvo.x + '|' + plano.alvo.y + ' (dist ' + plano.dist + '), ' +
      plano.nUnid + ' explorador(es) cada, gap ' + plano.gap + 'ms, saindo em ' + plano.emS + 's. Acompanhe na fila.',
      'ok', 'planner');
    ccTesteAcompanhar();
    return plano;
  }

  function ccTesteAcompanhar() {
    clearInterval(_ccTesteTimer);
    const terminais = { enviado: 1, falhou: 1, incerto: 1, perdido: 1 };
    _ccTesteTimer = setInterval(() => {
      const meus = ((config.cc && config.cc.fila) || []).filter((c) => c._teste);
      if (!meus.length) { clearInterval(_ccTesteTimer); return; }
      if (meus.every((c) => terminais[c.state])) { clearInterval(_ccTesteTimer); ccTesteResumo(meus); }
    }, 400);
  }

  function ccTesteResumo(meus) {
    const disp = meus.filter((c) => c.fireAt).sort((a, b) => a.fireAt - b.fireAt);
    const pedido = meus.slice().sort((a, b) => (a.sendAt || 0) - (b.sendAt || 0));
    const ordemOk = disp.length === pedido.length && disp.every((c, i) => c.id === pedido[i].id);
    const enviados = meus.filter((c) => c.state === 'enviado').length;
    const gaps = [];
    for (let i = 1; i < disp.length; i++) gaps.push(Math.round(disp[i].fireAt - disp[i - 1].fireAt));
    const erros = meus.filter((c) => c.fireAt && c.sendAt).map((c) => c.fireAt - c.sendAt);
    const media = erros.length ? Math.round(erros.reduce((s, x) => s + x, 0) / erros.length) : null;
    const falhas = meus.filter((c) => c.state !== 'enviado').map((c) => c.origin + ':' + c.state).join(', ');
    pushLog('🧪 Teste concluído: ' + enviados + '/' + meus.length + ' dispararam · ordem ' +
      (ordemOk ? 'CORRETA ✅' : 'ERRADA ❌') + ' · espaçamento ' + (gaps.length ? gaps.join('/') + 'ms' : '—') +
      ' · erro médio de escada ' + (media == null ? '—' : (media > 0 ? '+' : '') + media + 'ms') +
      (falhas ? ' · NÃO enviados: ' + falhas : ''),
      ordemOk && enviados === meus.length ? 'ok' : 'err', 'planner');
    // Os simulados são fantasmas — limpa da fila depois de alguns segundos pra não poluir.
    if (meus.some((c) => c.simulado)) {
      setTimeout(() => { meus.forEach((c) => { if (c.simulado) ccRemover(c.id); }); ccRenderPagina(); }, 8000);
    }
  }

  // Botão no cabeçalho do painel. Injetado depois do buildUI em vez de editado dentro
  // da string do cabeçalho: mantém a Central inteira num bloco só, no fim do arquivo.
  function ccBotaoPainel() {
    const acoes = document.getElementById('twmgr-head-actions');
    if (!acoes || document.getElementById('twmgr-ccpg-btn')) return;
    const b = document.createElement('span');
    b.id = 'twmgr-ccpg-btn';
    b.title = 'Central de Comando — fila e precisão';
    b.textContent = '🗓️';
    b.addEventListener('click', ccAbrirPagina);
    acoes.insertBefore(b, acoes.firstChild);
  }

  // Enquanto não há interface, a central se opera pelo console. Este é o único ponto
  // em que o script escreve em window — de propósito, pra poder aferir sem armar nada.
  //   await TWMgrCC.aferir(8)        → mede a precisão real desta máquina, sem enviar
  //   await TWMgrCC.sincronizar()    → diagnóstico do relógio contra o Date do servidor
  //   TWMgrCC.fila()                 → estado dos comandos
  try {
    window.TWMgrCC = {
      aferir: ccAferir, sincronizar: ccSincronizar, sondar: ccSondar,
      adicionar: ccAdicionar, remover: ccRemover, abrir: ccAbrirPagina, testar: ccTeste,
      fila: () => (config.cc && config.cc.fila) || [],
      agora: ccNow, deriva: ccDeriva, acordar: ccManterAcordado, acordadoOk: ccAcordadoOk,
    };
  } catch (e) {}

  buildUI();
  try { enhanceUnitsPage(); } catch (e) { /* silencioso: injeção só falha se o layout mudou */ }
  try { unitsScheduleAuto(); } catch (e) { /* silencioso: scheduler é opcional */ }
  try { enhanceIncomingsPage(); } catch (e) { /* silencioso */ }
  try { desviarResumeAll(); } catch (e) { /* silencioso */ }
  try { ccRetomar(); } catch (e) { console.warn('[TWMgr Central] retomada falhou:', e); }
  // Agendador rapido (curto e grosso) e o botao 🗓️ DESATIVADOS: a Central de Comando rica
  // (175-cc-rico.js) assumiu a praca. O motor cc* segue vivo (ccRetomar) so pra nao perder
  // comandos em config.cc de sessoes antigas; nao injeta mais UI concorrente.
  // try { ccBotaoPainel(); } catch (e) { /* silencioso */ }
  // try { ccInjetarPraca(); } catch (e) { /* silencioso: injeção só falha se o layout mudou */ }
  // Fora do t=0: loadMapData puxa village.txt e player.txt, os dois maiores downloads do
  // script, e disparar isso junto com as ~128 requisicoes do carregamento da pagina era
  // pedir 429. Entra depois da fila de retomada dos modulos.
  setTimeout(() => { try { enhanceMapPage(); } catch (e) { /* silencioso */ } }, 70000);
})();
