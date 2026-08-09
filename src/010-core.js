// ==UserScript==
// @name         Tribal Wars Manager
// @namespace    tw-manager
// @version      11.127.0
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

  // As unidades que ESTE mundo tem, na ordem do UNITS. O br143 não tem arqueiro nem arqueiro a
  // cavalo, e o `game_data.units` do próprio jogo é quem sabe disso — a lista fixa acima é o
  // universo possível, não o do mundo. Sem isso uma tela de escolha ofereceria unidade inexistente.
  // Cai pro UNITS inteiro se o jogo não expuser nada, porque oferecer demais é menos ruim que
  // oferecer nada.
  function unitsDoMundo() {
    const g = (window.game_data && window.game_data.units) || null;
    if (!g || !g.length) return UNITS.slice();
    return UNITS.filter((u) => g.indexOf(u[0]) >= 0);
  }

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
  // População que cada edifício OCUPA. [base, fator] por prédio; a acumulada até o nível N é
  //     popAcumEdificio(b, N) = round(base * fator^(N-1))
  // e o custo do nível N é a diferença pro N-1. Conferido contra a tela do Edifício principal
  // em 14/14 casos válidos (ed. principal nv23 = 23, quartel nv11 = 5, estábulo nv17 = 15,
  // torre de vigia nv1 = 500). Praça, fazenda e armazém não custam população.
  //
  // Isto é só o FALLBACK: os valores variam por mundo e o jogo os serve em
  // /interface.php?func=get_building_info — quem lê de lá e cacheia é o módulo de edifícios,
  // no mesmo padrão que o Centro de Comando já usa pras velocidades de unidade.
  const BUILD_POP_FALLBACK = {
    main: [5, 1.17], barracks: [7, 1.17], stable: [8, 1.17], garage: [8, 1.17],
    watchtower: [500, 1.18], snob: [80, 1.17], smith: [20, 1.17], place: [0, 1.17],
    statue: [10, 1.17], market: [20, 1.17], wood: [5, 1.155], stone: [10, 1.14],
    iron: [10, 1.17], farm: [0, 1], storage: [0, 1.15], hide: [2, 1.17], wall: [5, 1.17],
  };
  function buildPopTabela() {
    const c = (config.build && config.build.popTabela) || null;
    return (c && Object.keys(c).length) ? c : BUILD_POP_FALLBACK;
  }
  function popAcumEdificio(b, n) {
    if (!(n > 0)) return 0;
    const t = buildPopTabela()[b]; if (!t) return 0;
    return Math.round(t[0] * Math.pow(t[1], n - 1));
  }
  // Quanta população os níveis que AINDA FALTAM de um plano vão consumir. `niveis` = nível
  // efetivo atual por prédio; `plano` = itens {b, lvl, en} do modelo de construção.
  // Como é a diferença de duas acumuladas, plano já cumprido dá 0 sozinho.
  function popDoPlano(niveis, plano) {
    let total = 0;
    (plano || []).forEach((it) => {
      if (!it || it.en === false) return;
      const atual = (niveis && niveis[it.b]) || 0;
      const alvo = it.lvl || 0;
      if (alvo > atual) total += popAcumEdificio(it.b, alvo) - popAcumEdificio(it.b, atual);
    });
    return total;
  }
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

  const UPDATE_URL = 'https://raw.githubusercontent.com/JonathanWillianBraga/tw/main/tw-manager.user.js';
  let updateInfo = { checked: false, hasUpdate: false, remoteVersion: '' };
  const WORLD = window.game_data.world || 'w';
  const VERSION = '11.127.0';
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
    emVoo: {},             // { [vid]: [{r, amt, chega}] } — o que já foi puxado e não pousou
    unlockReserva: 5000,   // a doadora nunca fica abaixo disto em cada recurso
    unlockMaxOrigens: 5,   // quantas aldeias no máximo contribuem por desbloqueio
    faltouRecurso: {},     // vid -> { nome, opcao, falta:{wood,stone,iron}, at } — o que travou
  });
  // Por cor: um modo único ('none'|'a'|'b'|'c') + qtd (só p/ a/b; C manda 1x).
  const defFarmMatrix = () => ({ greenEmpty: { mode: 'a', qty: 1 }, greenFull: { mode: 'b', qty: 1 }, yellowEmpty: { mode: 'none', qty: 1 }, yellowFull: { mode: 'none', qty: 1 }, blue: { mode: 'b', qty: 1 } });
  const FARM_COLORS = ['greenEmpty', 'greenFull', 'yellowEmpty', 'yellowFull', 'blue'];
  const defFarm = () => ({ running: false, nextAt: 0, interval: 600, minWood: 1000, minStone: 1000, minIron: 1000, maxDist: 13, maxWall: 20, blueMaxWall: 0, delay: 500, mode: 'suave', group: null, repeat: false, repeatMin: 10, minCL: 0, clReserve: 0, spyReserve: 0, order: 'dist', dynTemplate: false, matrix: defFarmMatrix(), sentReports: {}, defended: {} });
  const defWall = () => ({ running: false, nextAt: 0, interval: 600, wallMin: 1, wallMax: 6, ramMode: 'auto', ramFixed: 20, ramWall6: 24, axeCount: 80, spyCount: 1, sentDemo: {} });
  // Recrutar no molde do "Gerente de conta → Tropas": MODELOS nomeados aplicados a aldeias.
  //
  // `templates[id] = { name, targets, grupo }` — o `grupo` é opcional e cobre o desenho antigo
  // (um perfil servindo um grupo inteiro). `villages[vid] = { tpl, paused }` é a atribuição
  // individual, que VENCE o grupo. Os dois juntos são um superconjunto do que existia.
  //
  // `targets` continua sendo quantidade-ALVO (manutenção), não pedido único: a tela do jogo é
  // one-shot porque é manual; aqui o ciclo repete, então manter nível é o que faz sentido.
  // `modo` 'fixo' = o desenho de sempre (targets em números absolutos). 'receita' = os alvos
  // são calculados POR ALDEIA a partir da fazenda dela: `receita` guarda o peso de cada
  // unidade e `encherPct` até onde encher. Modelo antigo não tem `modo` e cai em 'fixo', então
  // nada muda pra quem já usa.
  const defRecruitTpl = (name) => ({ name: name, targets: {}, grupo: '', modo: 'fixo', receita: {}, encherPct: 95 });
  const defRecruit = () => ({
    running: false, nextAt: 0, interval: 600, targetHours: 2, refillBelowMin: 30,
    templates: {}, villages: {}, filterGroup: '', seguirGrupo: false, grupoTpl: '',
    overrides: {}, queueEst: {},
    // Campos do desenho antigo. NÃO são mais lidos — ficam só pra um revert achar os dados.
    groupAtk: null, groupDef: null, profiles: { atk: { targets: {} }, def: { targets: {} } }, groups: [],
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
  const defMarketModeState = () => ({ running: false, nextAt: 0, stats: {}, stopAt: 0, totalCoins: 0 });
  const defMarket = () => ({
    modes: { cunhagem: defMarketModeState(), equilibrio: defMarketModeState(), solidario: defMarketModeState() },
    interval: 600, destCoords: [], reserveWood: 0, reserveStone: 0, reserveIron: 0,
    // Peso pra dividir o que cada aldeia manda na Cunhagem — pensado pro custo de formar o
    // nobre (não muda entre mundos com bandeira de desconto, que corta os 3 igual).
    cunhagemPesoWood: 28000, cunhagemPesoStone: 30000, cunhagemPesoIron: 25000,
    cunhagemSourceGroups: [], cunhagemStopEnabled: false, cunhagemStopHours: 2, autoMint: false,
    thresholdPct: 50, maxDist: 15,
    // Alvo automático: em vez do limiar fixo, cada recurso mira a fatia que ELE ocupa da sua
    // capacidade total. Desligado por padrão — muda o comportamento de quem já usa o fixo.
    alvoAuto: false,
    groupSolidario: '', solidarioThresholdPct: 50, solidarioMaxDist: 20, solidarioDonorPct: 50, solidarioDonorMinPct: 50, solidarioGargaloKeepPct: 90, inflight: {},
  });
  // Construções = gerenciador no molde do "Gerente de conta → Construção" do jogo: N modelos nomeados
  // (templates) + atribuição POR ALDEIA (villages: vid -> {tpl, paused, coord, name, done, total}).
  // `plans` (atk/def) ficou só como semente da migração — quem manda agora é `templates`.
  // `seguirGrupo`: aldeia que entra no grupo filtrado entra sozinha na gestão, com o modelo
  // `grupoTpl`. Sem isso o filtro de grupo só mudava o que APARECE na tabela, e aldeia nova
  // ficava de fora até alguém reparar.
  const defBuild = () => ({ running: false, nextAt: 0, interval: 600, maxQueue: 5, plans: { atk: tplToPlan(ATK_TPL), def: tplToPlan(DEF_TPL) }, templates: {}, villages: {}, filterGroup: '', seguirGrupo: false, grupoTpl: '', demand: {} });

  // Ordem sugerida de pesquisa pra quem nunca montou um modelo: explorador cedo (revela alvo pro
  // Saque), depois o pacote de ataque, depois defesa. É só um ponto de partida — o usuário reordena.
  const PESQ_ORDEM_PADRAO = ['spy', 'axe', 'light', 'ram', 'spear', 'sword', 'heavy', 'catapult'];
  // Pesquisa — modelos de PRIORIDADE (ordem de tropas) aplicados por aldeia, no molde do
  // "Gerente de conta → Pesquisa". Quando falta recurso, puxa da aldeia mais próxima que tenha
  // excedente (acima de feedReserve% do armazém dela), respeitando feedMaxDist campos.
  const defResearch = () => ({
    running: false, nextAt: 0, interval: 900,
    templates: {}, villages: {}, filterGroup: '', seguirGrupo: false, grupoTpl: '',
    feedOn: true, feedReserve: 40, feedMaxDist: 20, feedFillPct: 60,
    blocked: {}, blockTtlH: 6,   // pesquisa recusada por requisito: nao insiste por N horas
    stats: {},
  });
  // Noblar — alvos colados pelo usuário + o plano montado no último ciclo. `plano` é cache de
  // exibição: o disparo reprepara o comando na hora, porque o CSRF morre a cada recarregamento.
  // Modelo de envio: o quanto se manda num alvo. `escolta` vai NO MESMO comando dos nobres
  // (confirmado pelo usuário) — nobre viaja na velocidade da unidade mais lenta do comando,
  // então separar escolta em outro ataque só serviria pra ela chegar antes e morrer sozinha.
  const defNobleTpl = (name) => ({
    name: name, nobres: 4, escolta: {}, maxHoras: 6, soNT: false,
  });
  const defNoble = () => ({
    running: false, nextAt: 0, interval: 900,
    alvos: [], plano: [], planoAt: 0,
    maxHoras: 6, soNT: false,
    produzir: true,   // formar nobre quando faltar (NUNCA cunhar — decisão do usuário)
    templates: { padrao: defNobleTpl('Padrão') },
    ordem: ['padrao'],   // prioridade dos modelos; alvo com tpl:'' segue esta ordem
    lerRelatorios: true,
    // Disparo automatico. O usuario pediu explicitamente (ago/2026), revertendo o
    // "arma e espera meu OK" original. `autoMax` e o teto de comandos por ciclo: um bug
    // de plano nao pode esvaziar a conta de nobre de uma vez.
    autoEnviar: true, autoMax: 8,
    // Quanto um nobre derruba de lealdade (no jogo varia 20-35) e quanto ela regenera por
    // hora. Os dois viram "quantos nobres ainda faltam" — ver noblePrecisaDe.
    // 25 e nao 28: 28 é a média, e com sorte ruim (20, 21) a conta manda de MENOS e o alvo
    // sobrevive de raspão. 25 erra pro lado de mandar um nobre a mais, que é o erro barato.
    lealdadePorAtk: 25, lealdadeRegen: 1,
    // Cunhar DESLIGADO por padrão: gasta recurso sem volta. Quando ligado tem alvo claro —
    // cunha até alguma aldeia perto conseguir fechar um NT de `cunharAte` nobres.
    cunhar: false, cunharAte: 4, cunharMaxAldeias: 3,
    // Fila paralela: todo alvo é planejado no ciclo, em vez de a fila travar no primeiro que
    // ainda não tem a lealdade garantida. O pool de nobres já impede uso duplo, e a ordem da
    // fila segue dando a primeira escolha — muda só que alvo de outra região deixa de esperar
    // por quem não disputa nobre com ele.
    paralelo: false,
    // Envia o nobre que estiver pronto AGORA em vez de esperar fechar a leva. Seguro contra
    // excesso: `precisa` é recalculado todo ciclo a partir da lealdade PREVISTA, que já desconta
    // cada nobre voando — então mandar aos poucos nunca passa do necessário, o teto só encolhe.
    // A troca real é outra: com muito tempo entre um nobre e outro, a lealdade regenera no meio
    // e o primeiro rende menos. Por isso é opção, não padrão.
    parcialSempre: false,
    // Pós-conquista: joga a aldeia tomada num grupo estático.
    posGrupo: false, posGrupoId: '', posFeitos: {},
    posBandeira: false, posBandeiraTipo: '', posBandeiraNivel: 1,

    emVoo: {},        // { [coord]: [{at, chega, n}] } — comandos meus que ainda não pousaram


    relatorios: {},   // { [coord]: { lealdade, de, at, reportId, dono, tropa } } — último lido
    vistos: {},       // { [reportId]: 1 } — já baixado, não rebaixa
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
  const def = () => ({ targets: [], reloadAfterSend: true, running: false, scav: defScav(), farm: defFarm(), recruit: defRecruit(), market: defMarket(), build: defBuild(), research: defResearch(), noble: defNoble(), map: defMap(), captcha: defCaptcha(), desviar: defDesviar(), mapUi: defMapUi(), paladin: defPaladin(), cc: defCC(), obra: defObra(), etiqueta: defEtiqueta(), reservations: {} });
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
    if (!c.scav.emVoo || typeof c.scav.emVoo !== 'object') c.scav.emVoo = {};
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
    if (c.farm.clReserve == null) c.farm.clReserve = 0;
    if (c.farm.spyReserve == null) c.farm.spyReserve = 0;
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
    if (c.market.modes.cunhagem && c.market.modes.cunhagem.totalCoins == null) c.market.modes.cunhagem.totalCoins = 0;
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
    if (c.market.cunhagemPesoWood == null) c.market.cunhagemPesoWood = 28000;
    if (c.market.cunhagemPesoStone == null) c.market.cunhagemPesoStone = 30000;
    if (c.market.cunhagemPesoIron == null) c.market.cunhagemPesoIron = 25000;
    if (!Array.isArray(c.market.cunhagemSourceGroups)) c.market.cunhagemSourceGroups = [];
    if (c.market.cunhagemStopEnabled == null) c.market.cunhagemStopEnabled = false;
    if (c.market.cunhagemStopHours == null) c.market.cunhagemStopHours = 2;
    if (c.market.autoMint == null) c.market.autoMint = false;
    if (c.market.thresholdPct == null) c.market.thresholdPct = 50;
    if (c.market.alvoAuto == null) c.market.alvoAuto = false;
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
    if (c.build.seguirGrupo == null) c.build.seguirGrupo = false;
    // Modelo amarrado a grupo, igual ao Recrutar: vale pra todas as aldeias dele, sem
    // precisar marcar uma a uma.
    Object.keys(c.build.templates || {}).forEach((id) => {
      if (c.build.templates[id] && c.build.templates[id].grupo == null) c.build.templates[id].grupo = '';
    });
    if (!c.build.status || typeof c.build.status !== 'object') c.build.status = {};
    // Demolição DESLIGADA por padrão, e explicitamente. Não devolve recurso e não tem desfazer:
    // tem que ser escolha consciente, nunca herdada de um `undefined` que por acaso é falso.
    if (c.build.demolir == null) c.build.demolir = false;
    // O `dem` por item do modelo foi aposentado: o interruptor "Demolir excedente" sozinho
    // autoriza agora, e nenhum item precisa ser marcado. Limpa o campo pra ele não ficar
    // guardado dando a impressão de que ainda decide alguma coisa.
    Object.keys(c.build.templates || {}).forEach((id) => {
      ((c.build.templates[id] || {}).plan || []).forEach((it) => { if (it.dem != null) delete it.dem; });
    });

    if (c.build.grupoTpl == null) c.build.grupoTpl = '';

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
    if (c.research.seguirGrupo == null) c.research.seguirGrupo = false;
    if (c.research.grupoTpl == null) c.research.grupoTpl = '';
    // Bloqueio de aldeia que saiu da gestão não serve pra nada e cresceria pra sempre.
    Object.keys(c.research.blocked).forEach((vid) => { if (!c.research.villages[vid]) delete c.research.blocked[vid]; });
    if (!c.noble) c.noble = defNoble();
    if (!Array.isArray(c.noble.alvos)) c.noble.alvos = [];
    // só alvo com coordenada válida sobrevive ao load, sem repetido
    const vistoNb = {};
    c.noble.alvos = c.noble.alvos.filter((a) => {
      if (!a || !a.coord || vistoNb[a.coord]) return false;
      const m = String(a.coord).match(/^(\d{2,3})\|(\d{2,3})$/);
      if (!m) return false;
      vistoNb[a.coord] = 1; a.x = +m[1]; a.y = +m[2];
      return true;
    });
    if (!Array.isArray(c.noble.plano)) c.noble.plano = [];
    // Modelos: quem já usava o Noblar antes da v11.31.0 vira o modelo 'padrao' com a config
    // que ele tinha — nada de resetar pra 6h/não-NT em cima de quem já tinha escolhido.
    if (!c.noble.templates || typeof c.noble.templates !== 'object') c.noble.templates = {};
    if (!Object.keys(c.noble.templates).length) {
      c.noble.templates.padrao = defNobleTpl('Padrão');
      if (c.noble.maxHoras != null) c.noble.templates.padrao.maxHoras = c.noble.maxHoras;
      if (c.noble.soNT != null) c.noble.templates.padrao.soNT = !!c.noble.soNT;
    }
    Object.keys(c.noble.templates).forEach((id) => {
      const t = c.noble.templates[id];
      if (!t || typeof t !== 'object') { delete c.noble.templates[id]; return; }
      if (!t.name) t.name = id;
      t.nobres = Math.max(1, Math.min(8, parseInt(t.nobres, 10) || 4));
      t.maxHoras = Math.max(1, parseInt(t.maxHoras, 10) || 6);
      t.soNT = !!t.soNT;
      if (!t.escolta || typeof t.escolta !== 'object') t.escolta = {};
      Object.keys(t.escolta).forEach((u) => {
        const q = parseInt(t.escolta[u], 10) || 0;
        if (q > 0) t.escolta[u] = q; else delete t.escolta[u];
      });
    });
    // Alvo apontando pra modelo que não existe mais volta pro primeiro — senão o plano ficaria
    // sem regra nenhuma e o alvo sumiria da tela em silêncio.
    // A ordem tem que espelhar EXATAMENTE os modelos existentes: modelo novo entra no fim,
    // modelo apagado sai. Se ela dessincronizar, um alvo em modo prioridade tentaria um
    // modelo que nao existe mais e ficaria sem plano em silencio.
    if (!Array.isArray(c.noble.ordem)) c.noble.ordem = [];
    c.noble.ordem = c.noble.ordem.filter((id, i) => c.noble.templates[id] && c.noble.ordem.indexOf(id) === i);
    Object.keys(c.noble.templates).forEach((id) => { if (c.noble.ordem.indexOf(id) < 0) c.noble.ordem.push(id); });
    const tplsNb = Object.keys(c.noble.templates);

    // tpl '' NAO e erro: significa "segue a ordem de prioridade", que e o padrao. So um
    // tpl que aponta pra modelo inexistente e corrigido -- pra '' , nao pro primeiro modelo,
    // senao apagar um modelo fixaria todos os alvos dele num outro sem o usuario pedir.
    c.noble.alvos.forEach((a) => { if (a.tpl && !c.noble.templates[a.tpl]) a.tpl = ''; });
    void tplsNb;

    if (c.noble.lerRelatorios == null) c.noble.lerRelatorios = true;
    if (c.noble.autoEnviar == null) c.noble.autoEnviar = true;
    // O padrão virou 25 (era 28). Só trocar o default não bastava: quem já usava o módulo tem
    // 28 GRAVADO no config, e o valor salvo ganha do default — ficaria com o número antigo sem
    // perceber. A migração roda uma vez e só mexe em quem estava exatamente no default velho.
    if (!c.noble.migLpa25) {
      if (parseInt(c.noble.lealdadePorAtk, 10) === 28) c.noble.lealdadePorAtk = 25;
      c.noble.migLpa25 = 1;
    }
    c.noble.lealdadePorAtk = Math.max(1, Math.min(100, parseInt(c.noble.lealdadePorAtk, 10) || 25));
    if (c.noble.lealdadeRegen == null) c.noble.lealdadeRegen = 1;
    c.noble.lealdadeRegen = Math.max(0, Math.min(10, parseFloat(c.noble.lealdadeRegen) || 0));
    if (!c.noble.emVoo || typeof c.noble.emVoo !== 'object') c.noble.emVoo = {};
    if (c.noble.cunhar == null) c.noble.cunhar = false;
    c.noble.cunharAte = Math.max(1, Math.min(8, parseInt(c.noble.cunharAte, 10) || 4));
    c.noble.cunharMaxAldeias = Math.max(1, Math.min(12, parseInt(c.noble.cunharMaxAldeias, 10) || 3));
    if (c.noble.posGrupo == null) c.noble.posGrupo = false;
    if (c.noble.posGrupoId == null) c.noble.posGrupoId = '';
    if (!c.noble.posFeitos || typeof c.noble.posFeitos !== 'object') c.noble.posFeitos = {};
    if (c.noble.posBandeira == null) c.noble.posBandeira = false;
    if (c.noble.posBandeiraTipo == null) c.noble.posBandeiraTipo = '';
    c.noble.posBandeiraNivel = Math.max(1, Math.min(10, parseInt(c.noble.posBandeiraNivel, 10) || 1));


    // Registro de alvo que saiu da lista não serve pra nada e cresceria pra sempre.
    Object.keys(c.noble.emVoo).forEach((k) => {
      if (!c.noble.alvos.some((a) => a.coord === k)) delete c.noble.emVoo[k];
    });

    c.noble.autoMax = Math.max(1, Math.min(40, parseInt(c.noble.autoMax, 10) || 8));

    if (!c.noble.relatorios || typeof c.noble.relatorios !== 'object') c.noble.relatorios = {};
    // `lealdadeAt` (quando a lealdade foi MEDIDA) nasceu depois. Relatório antigo que já tem
    // leitura herda o `at` dele — era o que a conta usava antes, então nada muda pra eles.
    Object.keys(c.noble.relatorios).forEach((k) => {
      const r = c.noble.relatorios[k] || {};
      if (r.lealdade != null && r.lealdadeAt == null) r.lealdadeAt = r.at;
    });
    if (!c.noble.vistos || typeof c.noble.vistos !== 'object') c.noble.vistos = {};
    // Relatório de alvo que saiu da lista não serve pra nada e cresceria pra sempre.
    Object.keys(c.noble.relatorios).forEach((k) => {
      if (!c.noble.alvos.some((a) => a.coord === k)) delete c.noble.relatorios[k];
    });

    if (c.noble.maxHoras == null) c.noble.maxHoras = 6;
    if (c.noble.soNT == null) c.noble.soNT = false;
    if (c.noble.produzir == null) c.noble.produzir = true;
    // maxAldeiasProd era "cunhar em até N aldeias". A cunhagem automática saiu na v11.32.0,
    // então o campo não é mais lido; apagar aqui evita que ele volte a assombrar um dia.
    delete c.noble.maxAldeiasProd;
    if (c.noble.interval == null) c.noble.interval = 900;
    if (!c.recruit.templates || typeof c.recruit.templates !== 'object') c.recruit.templates = {};
    if (!c.recruit.villages || typeof c.recruit.villages !== 'object') c.recruit.villages = {};
    if (c.recruit.filterGroup == null) c.recruit.filterGroup = '';
    if (c.recruit.seguirGrupo == null) c.recruit.seguirGrupo = false;
    if (c.recruit.grupoTpl == null) c.recruit.grupoTpl = '';
    // MIGRAÇÃO do desenho antigo (perfil→grupo) pro novo (modelo com grupo opcional). Roda uma
    // vez: depois de criada, a lista de modelos existe e o bloco não entra mais.
    //
    // É SINCRONA de propósito — só remapeia estrutura, sem consultar o jogo. O normalizador roda
    // dentro do load(), onde não dá pra fazer fetch; uma migração que dependesse de rede deixaria
    // o usuário sem config no primeiro carregamento com a conexão ruim.
    if (!Object.keys(c.recruit.templates).length) {
      const temAlgo = (t) => t && Object.keys(t).some((u) => (t[u] || 0) > 0);
      const velho = c.recruit.profiles || {};
      if (temAlgo((velho.atk || {}).targets) || c.recruit.groupAtk) {
        c.recruit.templates.atk = { name: 'ATK', targets: (velho.atk || {}).targets || {}, grupo: c.recruit.groupAtk || '' };
      }
      if (temAlgo((velho.def || {}).targets) || c.recruit.groupDef) {
        c.recruit.templates.def = { name: 'DEF', targets: (velho.def || {}).targets || {}, grupo: c.recruit.groupDef || '' };
      }
      (c.recruit.groups || []).forEach((g, i) => {
        if (!g) return;
        const id = 'g' + (g.id || i);
        c.recruit.templates[id] = { name: g.name || ('Grupo ' + (i + 1)), targets: g.targets || {}, grupo: g.groupId || '' };
      });
    }
    Object.keys(c.recruit.templates).forEach((id) => {
      const t = c.recruit.templates[id];
      if (!t || typeof t !== 'object') { delete c.recruit.templates[id]; return; }
      if (!t.name) t.name = id;
      if (!t.targets || typeof t.targets !== 'object') t.targets = {};
      if (t.grupo == null) t.grupo = '';
      // Modelo sem `modo` é de antes da receita: continua no comportamento de sempre.
      if (t.modo !== 'receita') t.modo = 'fixo';
      if (!t.receita || typeof t.receita !== 'object') t.receita = {};
      if (t.encherPct == null) t.encherPct = 95;
    });
    // Aldeia apontando pra modelo que sumiu perderia o recrutamento em silêncio.
    Object.keys(c.recruit.villages).forEach((vid) => {
      if (!c.recruit.templates[c.recruit.villages[vid].tpl]) delete c.recruit.villages[vid];
    });
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
    // Coordenado e Blindagem saíram na v11.28.0. O config antigo (c.planner, com a blindagem
    // dentro) deixa de ser lido, mas NÃO é apagado: se alguém der revert, os dados ainda estão lá.
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
  let sendTimer = null, scavTimer = null, farmTimer = null, wallTimer = null, recruitTimer = null, buildTimer = null, researchTimer = null, nobleTimer = null, mapTimer = null, paladinTimer = null, obraTimer = null, uiTimer = null, lockTimer = null, etiquetaTimer = null;
  const marketTimers = { cunhagem: null, equilibrio: null, solidario: null, cunhar: null };   // 1 timer por modo — rodam de forma independente
  let _farmZeroStreak = 0, _farmEverSent = false;   // Saque parou de enviar (detecção de bloqueio/bot-check p/ alerta AFK)
  const paladinPreciseTimers = {};   // vid -> { id: setTimeout, finishAt } — timer de precisão (duração+30s) por aldeia
  function anyMarketRunning() { return !!(config.market && config.market.modes && MARKET_MODES.some((k) => config.market.modes[k] && config.market.modes[k].running)); }
  function anyRunning() { return config.running || (config.scav && config.scav.running) || (config.farm && config.farm.running) || (config.wall && config.wall.running) || (config.recruit && config.recruit.running) || anyMarketRunning() || (config.build && config.build.running) || (config.research && config.research.running) || (config.noble && config.noble.running) || (config.map && config.map.running) || (config.paladin && config.paladin.running) || ((config.cc && config.cc.fila) || []).some((c) => c.state === 'armado' || c.state === 'preparado' || c.state === 'disparando') || (config.obra && config.obra.running) || (config.lock && config.lock.running) || (config.etiqueta && config.etiqueta.running) || _ocupadoAvulso > 0; }
  // Desviar e Blindagem rodam por clique e não têm flag `running` — ficavam fora do anyRunning(),
  // então a trava de aba (12s) expirava no meio deles e outra aba assumia enquanto o apoio estava
  // sendo montado. Quem faz trabalho avulso marca aqui.
  let _ocupadoAvulso = 0;
  async function ocupado(fn) { _ocupadoAvulso++; try { return await fn(); } finally { _ocupadoAvulso--; } }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function readLock() { try { return JSON.parse(localStorage.getItem(LOCKKEY) || 'null'); } catch (e) { return null; } }
  function lockOther() { const l = readLock(); return !!(l && l.id !== TAB_ID && (Date.now() - l.ts) < 12000); }
  // Modo silêncio do motor `cmd` da Central. Vale pra TODAS as abas, inclusive a que gravou:
  // quem tem um disparo de precisão em curso é justamente quem mais precisa que o resto pare.
  // A validade é a que o próprio silenceOn carimba; se ele morrer sem limpar, a chave expira.
  const CC_FREEZE_KEY = KEY + '_freeze';
  function centralSilenciando() {
    try {
      const f = JSON.parse(localStorage.getItem(CC_FREEZE_KEY) || 'null');
      return !!(f && f.until && Date.now() < f.until);
    } catch (e) { return false; }
  }
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
      if (c && c.running === false) return 'parado pelo usuário';
    }
    if (lockOther()) return 'outra aba assumiu';
    if (captchaBlocked()) return 'bot-check na tela';
    // A Central tem prioridade: um disparo de precisão não pode disputar a rede nem a
    // trava com um ciclo de saque. Os laços longos param e retomam no tick seguinte.
    //
    // São DUAS Centrais e cada uma avisa de um jeito: o motor `cc` pela janela crítica, e o
    // motor `cmd` (175-cc-rico.js) gravando a chave de silêncio. A segunda estava sendo escrita
    // e NUNCA lida — o comentário lá dizia que as abas respeitariam "via lockOther()", mas
    // lockOther() lê outra chave. Efeito medido ao vivo: o Saque atravessou a janela de disparo
    // mandando 36 ataques e o comando saiu 556ms depois da hora. Meio segundo de contenção de
    // thread, que viés nenhum corrige — ele corrige atraso constante, não pico.
    //
    // O `silenceOn` cancela o PRÓXIMO timer de cada módulo, o que não faz nada contra um ciclo
    // já rodando (o do Saque dura de 3 a 10 min). Quem para laço em andamento é este devoParar.
    if (mod !== 'cc' && mod !== 'cmd' && (ccJanelaCritica() || centralSilenciando())) return 'Central disparando';
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

