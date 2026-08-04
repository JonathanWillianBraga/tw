  function injectStyles() {
    if (document.getElementById('twmgr-css')) return;
    const s = document.createElement('style'); s.id = 'twmgr-css';
    s.textContent = [
      "#twmgr-panel{position:fixed;top:12px;right:12px;z-index:99999;width:640px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);display:flex;flex-direction:column;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#4a3418;background:linear-gradient(160deg,#e2cd97,#ecdcb2);border:1px solid #b8912e;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.6);overflow:hidden}",
      "#twmgr-panel *{box-sizing:border-box}",
      "#twmgr-grip{position:absolute;left:0;top:0;bottom:0;width:7px;cursor:ew-resize;z-index:6}",
      "#twmgr-grip:hover{background:linear-gradient(90deg,rgba(122,87,16,.45),transparent)}",
      "#twmgr-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;cursor:move;background:linear-gradient(90deg,#6e5015,#9a721c 55%,#caa031);color:#fff;border-bottom:1px solid #8a6a20}",
      "#twmgr-head .twmgr-title{font-weight:700;font-size:12px;letter-spacing:.3px;display:flex;align-items:center;gap:6px}",
      "#twmgr-head .twmgr-ver{font-weight:400;font-size:8px;opacity:.75}",
      "#twmgr-head-actions{flex:0 0 auto;display:flex;align-items:center;gap:7px}",
      "#twmgr-min{cursor:pointer;font-size:17px;line-height:1;padding:0 2px;opacity:.85}#twmgr-min:hover{opacity:1}",
      "#twmgr-logbtn,#twmgr-upd-btn{cursor:pointer;font-size:13px;line-height:1;padding:2px 3px;border-radius:5px;opacity:.85;position:relative;transition:.15s}",
      "#twmgr-logbtn:hover,#twmgr-upd-btn:hover{opacity:1;background:rgba(255,255,255,.14)}",
      "#twmgr-upd-badge{position:absolute;top:-3px;right:-2px;color:#c22a2a;font-size:9px}",
      ".twmgr-tabs{flex:0 0 auto;display:flex;flex-wrap:nowrap;overflow-x:auto;background:#e6d4a4;border-bottom:1px solid #c4a35f;scrollbar-width:thin}",
      ".twmgr-tab{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:5px 1px;cursor:pointer;color:#6e5a2f;border-bottom:2px solid transparent;transition:.15s}",
      ".twmgr-tab:hover{color:#6a4e18;background:rgba(212,175,55,.06)}",
      ".twmgr-tab.active{color:#a9781a;border-bottom-color:#7d510a;background:rgba(212,175,55,.10)}",
      ".twmgr-tab-ico{font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;border:2px solid transparent;transition:.2s}",
      ".twmgr-tab-lbl{font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}",
      ".twmgr-tab.twmgr-run .twmgr-tab-ico{border-color:#2e8b3f;background:rgba(63,206,84,.15);box-shadow:0 0 9px rgba(63,206,84,.6)}",
      ".twmgr-ui{width:18px;height:18px;vertical-align:middle}",
      ".twmgr-fmtable{width:100%;border-collapse:collapse;font-size:11px}",
      ".twmgr-fmtable th{font-size:10px;color:#9a6f0e !important;font-weight:700;padding:4px 2px;border-bottom:1px solid #b18f4d;text-transform:uppercase;vertical-align:middle;background:#e6d4a4 !important;background-image:none !important}",
      ".twmgr-fmtable td{vertical-align:middle}",
      ".twmgr-fmtable th:first-child,.twmgr-fmrow td:first-child{text-align:left}",
      ".twmgr-fmtable th:not(:first-child),.twmgr-fmrow td:not(:first-child){width:44px;text-align:center}",
      ".twmgr-fmrow{border-bottom:1px solid rgba(255,255,255,.04)}",
      ".twmgr-fmrow:hover{background:rgba(212,175,55,.06)}",
      ".twmgr-fmck{width:15px;height:15px;cursor:pointer;vertical-align:middle;margin:0}",
      ".twmgr-subtabs{display:flex;gap:5px;margin-bottom:9px}",
      ".twmgr-subtab{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 4px;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;border:1px solid #c4a35f;border-radius:8px;background:rgba(0,0,0,.05);color:#6e5a2a;transition:.15s;position:relative}",
      ".twmgr-subtab:hover{background:rgba(0,0,0,.10);color:#4a3418}",
      ".twmgr-subtab.active{background:linear-gradient(180deg,#c9a33f,#b18f4d);border-color:#7d510a;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.35)}",
      ".twmgr-subtab.twmgr-run::after{content:'';position:absolute;top:3px;right:4px;width:6px;height:6px;border-radius:50%;background:#2e8b3f;box-shadow:0 0 0 2px rgba(46,139,63,.25)}",
      ".twmgr-card-break{flex-basis:100%;height:0}",
      ".twmgr-cards{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}",
      ".twmgr-card-mini{flex:1 1 0;min-width:66px;background:linear-gradient(165deg,#e6d4a4,#ecdcb2);border:1px solid #b18f4d;border-radius:9px;padding:7px 6px 6px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.35)}",
      // O card de destaque de cada módulo: antes era um ciano inline (#1f8fa0) que não é da paleta
      // pergaminho e brigava com o resto. Agora é o mesmo dourado, só mais escuro e com a moldura
      // marcada — destaca pela hierarquia, não por trocar de cor.
      ".twmgr-card-hl{background:linear-gradient(165deg,#efd9a0,#f6e6bd);border-color:#9a6f0e;box-shadow:inset 0 0 0 1px rgba(154,111,14,.18)}",
      ".twmgr-card-hl .twmgr-card-v{color:#7d510a;font-size:21px}",
      ".twmgr-card-hl .twmgr-card-l{color:#5c4527}",      // flex-basis:100% sozinho NÃO forçava linha inteira: o .twmgr-card-mini tem flex:1 1 0, e o
      // shrink:1 deixava o card encolher pra caber ao lado dos outros em vez de quebrar a linha.
      // Com shrink:0 ele ocupa a linha de verdade. Estava silenciosamente sem efeito em Coletas e Cadeado.
      ".twmgr-card-wide{flex-basis:100%;flex-shrink:0}",
      ".twmgr-card-v{font-size:19px;font-weight:800;color:#9a6f0e;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".twmgr-card-l{font-size:8px;color:#6e5a2f;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".twmgr-section{border:1px solid #c4a35f;border-radius:9px;padding:8px 9px;margin-bottom:9px;background:rgba(0,0,0,.14)}",
      ".twmgr-sec-h{font-size:9px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#8a6410;margin:-2px 0 6px}",
      ".twmgr-modlog{margin-top:10px;border-top:1px solid #c4a35f;padding-top:6px}",
      ".twmgr-modlog-head{cursor:pointer;font-size:10px;color:#5c4527;user-select:none;display:flex;align-items:center;gap:5px}",
      ".twmgr-modlog-head:hover{color:#a9781a}",
      ".twmgr-modlog-body{max-height:180px;overflow-y:auto;margin-top:5px;font-size:10px}",
      ".twmgr-btn.on{box-shadow:0 0 12px rgba(76,200,90,.85),inset 0 0 0 1px rgba(255,255,255,.3)}",
      ".twmgr-btn.dim{opacity:.4 !important;filter:grayscale(.5);cursor:default}",
      "#twmgr-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:11px 12px 12px}",
      "#twmgr-body::-webkit-scrollbar{width:9px}#twmgr-body::-webkit-scrollbar-thumb{background:#b18f4d;border-radius:4px}#twmgr-body::-webkit-scrollbar-track{background:#e6d4a4}",
      ".twmgr-hint{font-size:10px;color:#5c4527;line-height:1.4;margin-bottom:9px}.twmgr-hint b{color:#6a4e18}",
      ".twmgr-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}",
      ".twmgr-lbl{font-size:10px;color:#5c4527}",
      ".twmgr-inp{background:#fbf3dc !important;border:1px solid #a9843f !important;color:#4a3418 !important;border-radius:7px !important;padding:5px 7px !important;font-size:11px !important;outline:none !important;transition:.15s}",
      ".twmgr-inp:focus{border-color:#7d510a !important;box-shadow:0 0 0 2px rgba(212,175,55,.25) !important}",
      "#twmgr-panel input[type=checkbox]{accent-color:#7d510a;width:15px;height:15px;cursor:pointer;vertical-align:middle}",
      ".twmgr-btn{border:none;border-radius:8px;padding:7px 10px;font-size:11px;font-weight:600;cursor:pointer;transition:.15s;color:#fff}",
      ".twmgr-btn:hover{filter:brightness(1.12)}.twmgr-btn:active{transform:translateY(1px)}",
      ".twmgr-go{background:linear-gradient(180deg,#3bb14a,#2e7d32) !important;color:#fff !important}",
      ".twmgr-stop{background:linear-gradient(180deg,#c23a2c,#b3271a) !important;color:#fff !important}",
      ".twmgr-ghost{background:rgba(212,175,55,.10) !important;border:1px solid #a9843f !important;color:#6b4e1e !important}.twmgr-ghost:hover{background:rgba(212,175,55,.2) !important}",
      ".twmgr-add{width:100%;background:transparent !important;border:1px dashed #a9843f !important;color:#7a5710 !important;border-radius:8px;padding:6px;font-size:11px;font-weight:600;cursor:pointer;margin-bottom:8px}.twmgr-add:hover{background:rgba(212,175,55,.10) !important}",
      ".twmgr-actions{display:flex;gap:8px;margin-bottom:7px}.twmgr-actions .twmgr-btn{flex:1}",
      ".twmgr-cstatus{text-align:center;font-size:10px;font-weight:600;min-height:13px;color:#5c4527}",
      ".twmgr-card{background:linear-gradient(180deg,#e6d4a4,#eeddb6);border:1px solid #cbb083;border-radius:9px;margin-bottom:7px;overflow:hidden}",
      ".twmgr-card-head{display:flex;align-items:center;gap:7px;padding:7px 9px}",
      ".twmgr-xy{flex:0 0 76px;width:76px;text-align:center}",
      ".twmgr-cnt{flex:1;text-align:center;font-size:11px;font-weight:700;color:#9a6f0e;font-variant-numeric:tabular-nums}",
      ".twmgr-exp,.twmgr-del{cursor:pointer;font-size:12px;width:20px;height:20px;line-height:20px;text-align:center;border-radius:5px;color:#5c4527}",
      ".twmgr-exp:hover{background:rgba(212,175,55,.15);color:#a9781a}",
      ".twmgr-del{color:#a5544a}.twmgr-del:hover{background:rgba(231,76,60,.18);color:#c23a2c}",
      ".twmgr-from{font-size:9px;color:#6e5a2a;padding:0 9px 6px}",
      ".twmgr-troops{display:none;padding:6px 9px 8px;border-top:1px solid #dcc78f}.twmgr-troops table{width:100%;border-collapse:collapse}",
      ".twmgr-troops td{padding:2px 3px;font-size:10px;color:#5c4527}.twmgr-qi{width:46px;text-align:center}",
      ".twmgr-units{display:grid;grid-template-columns:1fr 1fr;gap:6px 8px;margin-bottom:9px}",
      ".twmgr-units label{display:flex;align-items:center;gap:7px;font-size:11px;color:#5c4527;cursor:pointer}",
      ".twmgr-res{display:flex;gap:6px;margin:5px 0 9px}.twmgr-res label{flex:1;display:flex;align-items:center;gap:4px;font-size:13px}.twmgr-res .twmgr-inp{width:100%;font-size:11px !important}",
      ".twmgr-check{display:flex;align-items:center;gap:8px;font-size:11px;color:#5c4527;margin-bottom:10px;cursor:pointer}",
      ".twmgr-log{height:150px;overflow-y:auto;background:#e9d8ac;border:1px solid #c4a35f;border-radius:8px;padding:7px 8px;font-family:Consolas,'Courier New',monospace;font-size:10px;line-height:1.45}",
      ".twmgr-log::-webkit-scrollbar{width:8px}.twmgr-log::-webkit-scrollbar-thumb{background:#b18f4d;border-radius:4px}",
      "#twmgr-panel.twmgr-collapsed{width:auto}",
      "#twmgr-panel.twmgr-collapsed .twmgr-tabs,#twmgr-panel.twmgr-collapsed #twmgr-body{display:none}",
      "#twmgr-panel.twmgr-collapsed #twmgr-head{border-bottom:none}",
      ".twmgr-dot{width:9px;height:9px;border-radius:50%;background:#a9843f;transition:.2s;flex:0 0 auto}",
      ".twmgr-dot.on{background:#2e8b3f;box-shadow:0 0 8px #2e8b3f}",
      ".twmgr-bld-sum{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px}",
      ".twmgr-bld-sumcell{display:inline-flex;align-items:center;gap:2px;background:#e9d8ac;border:1px solid #c4a35f;border-radius:5px;padding:1px 4px;font-size:9px;color:#6a4e18}",
      ".twmgr-bld-sumcell img{width:12px;height:12px;vertical-align:middle}",
      // Tabela de aldeias: rola sozinha e nunca alarga o painel — a coluna Aldeia e a que cede.
      ".twmgr-bld-vils{max-height:230px;overflow-y:auto;background:#e9d8ac;border:1px solid #c4a35f;border-radius:8px}",
      ".twmgr-bld-vils::-webkit-scrollbar{width:8px}.twmgr-bld-vils::-webkit-scrollbar-thumb{background:#b18f4d;border-radius:4px}",
      ".twmgr-bld-tab{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed}",
      ".twmgr-bld-tab th{position:sticky;top:0;background:#e6d4a4;color:#5c4527;font-weight:600;text-align:left;padding:3px 4px;border-bottom:1px solid #c4a35f;z-index:1}",
      ".twmgr-bld-tab td{padding:2px 4px;border-bottom:1px solid #d3b678;color:#4a3418;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".twmgr-bld-tab tr.row_b td{background:rgba(0,0,0,.05)}",
      ".twmgr-bld-tab tr.twmgr-bld-off td{opacity:.55}",
      ".twmgr-bld-tab a{color:#7d510a;cursor:pointer;text-decoration:none}.twmgr-bld-tab a:hover{text-decoration:underline}",
      ".twmgr-bld-plan{max-height:260px;overflow-y:auto;background:#e9d8ac;border:1px solid #c4a35f;border-radius:8px;padding:3px}",
      ".twmgr-bld-plan::-webkit-scrollbar{width:8px}.twmgr-bld-plan::-webkit-scrollbar-thumb{background:#b18f4d;border-radius:4px}",
      ".twmgr-pq-item{display:grid;grid-template-columns:22px 18px 1fr 18px 18px 18px;align-items:center;gap:5px;padding:4px 5px;border-bottom:1px solid rgba(0,0,0,.06);font-size:11px;color:#4a3418}",
      ".twmgr-pq-item:last-child{border-bottom:none}",
      ".twmgr-pq-ord{color:#6e5a2a;font-size:9px;text-align:right}",
      ".twmgr-pq-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".twmgr-pq-up,.twmgr-pq-down,.twmgr-pq-rm{cursor:pointer;text-align:center;font-size:11px;color:#7d510a;opacity:.75}",
      ".twmgr-pq-up:hover,.twmgr-pq-down:hover{opacity:1}",
      ".twmgr-pq-rm{color:#c23a2c}.twmgr-pq-rm:hover{opacity:1}",
      ".twmgr-bld-item{display:grid;grid-template-columns:22px 16px 18px 1fr 44px 18px 18px 18px;align-items:center;gap:4px;padding:3px 5px;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;color:#4a3418}",
      ".twmgr-bld-item:last-child{border-bottom:none}",
      ".twmgr-bld-item.twmgr-bld-off{opacity:.42;filter:grayscale(.6)}",
      ".twmgr-bld-ord{color:#6e5a2a;font-size:9px;text-align:right}",
      ".twmgr-bld-ico{font-size:14px;text-align:center}",
      ".twmgr-bld-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".twmgr-bld-lvl{width:100% !important;text-align:center;padding:2px 4px !important;font-size:11px !important}",
      ".twmgr-bld-up,.twmgr-bld-down,.twmgr-bld-rm{cursor:pointer;text-align:center;font-size:11px;color:#5c4527;border-radius:4px;user-select:none;padding:1px 0}",
      ".twmgr-bld-up:hover,.twmgr-bld-down:hover{background:rgba(212,175,55,.18);color:#a9781a}",
      ".twmgr-bld-rm{color:#a5544a}.twmgr-bld-rm:hover{background:rgba(231,76,60,.22);color:#c23a2c}",
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
          '<div id="twmgr-wall-auto"><div class="twmgr-row"><span class="twmgr-lbl">Aríetes p/ muralha 6</span><input id="twmgr-wall-ramw6" class="twmgr-inp" type="number" min="1" value="24" style="width:66px"></div><div style="font-size:9px;color:#6e5a2a">calibra o resto: muro5≈18 · 4≈13 · 3≈9 · 2≈5 · 1≈3</div></div>' +
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
          '<div id="twmgr-bm-next" style="font-size:10px;color:#6e5a2a;text-align:right"></div>') +
        sec('Blacklist',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="A partir de quantas unidades de defesa no relatório a aldeia entra na blacklist.">Defesa mínima p/ blacklist</span><input id="twmgr-bm-defmin" class="twmgr-inp" type="number" min="1" value="1" style="width:66px"></div>' +
          '<label class="twmgr-check" title="Quando uma aldeia entrar na blacklist por DEFESA, apaga os relatórios dela no jogo — o que a tira da listagem do assistente. Não afeta a blacklist de tropa perdida. NÃO TEM DESFAZER: pra voltar, a aldeia teria que reaparecer sozinha na busca do assistente."><input id="twmgr-bm-rmassist" type="checkbox"> Apagar do assistente quem tem defesa <b style="color:#a5544a">(irreversível)</b></label>' +
          '<div class="twmgr-hint" style="margin:0">O Saque já pula quem está em qualquer uma das duas listas, mesmo com essa opção desligada.</div>') +
        '<div class="twmgr-actions"><button id="twmgr-bm-preview" class="twmgr-btn twmgr-ghost">💡 Prévia</button><button id="twmgr-bm-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-bm-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-bm-status" class="twmgr-cstatus"></div>' +
        // Três listas na mesma área, alternadas — alvos do próximo ciclo e as duas blacklists.
        '<div id="twmgr-bm-subtabs" style="display:flex;gap:4px;margin:9px 0 0">' +
          '<button class="twmgr-btn twmgr-ghost twmgr-bm-sub" data-sub="alvos" style="flex:1;padding:4px;font-size:10px">🎯 Alvos (<span id="twmgr-bm-count">0</span>)</button>' +
          '<button class="twmgr-btn twmgr-ghost twmgr-bm-sub" data-sub="perda" style="flex:1;padding:4px;font-size:10px">💀 Perdi tropa (<span id="twmgr-bm-nperda">0</span>)</button>' +
          '<button class="twmgr-btn twmgr-ghost twmgr-bm-sub" data-sub="defesa" style="flex:1;padding:4px;font-size:10px">🛡️ Tem defesa (<span id="twmgr-bm-ndefesa">0</span>)</button>' +
        '</div>' +
        '<div id="twmgr-bm-list" style="max-height:220px;overflow-y:auto;background:#e9d8ac;border:1px solid #c4a35f;border-radius:8px;margin-top:4px"></div>' +
        '<div id="twmgr-bm-bl" style="max-height:220px;overflow-y:auto;background:#e9d8ac;border:1px solid #c4a35f;border-radius:8px;margin-top:4px;display:none"></div>' +
        modLog('map') +
        sec('🔒 Cadeado automático',
          '<div style="font-size:10px;color:#6e5a2a;margin-bottom:4px">Rastreia bárbaras no raio de TODAS as suas aldeias (a mais perto conta) e tranca (reserva pra tribo) as com pontuação mínima, das mais fortes pras mais fracas. Pula quem tem relatório vermelho no último ataque (checado aldeia por aldeia, cobre até abandonadas). Nunca destrava o que já travou — só soma.</div>' +
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
          '<div style="font-size:10px;color:#6e5a2a;margin-bottom:4px">Crie quantos perfis quiser, cada um ligado a um grupo do TW — igual o ATK/DEF acima, mas sem limite de quantidade.</div>' +
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
            '<div id="twmgr-mk-srcgroups" style="max-height:100px;overflow-y:auto;border:1px solid #dcc78f;border-radius:6px;padding:4px;margin-bottom:6px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Aldeias destino (1 coord. por linha)</span></div>' +
            '<textarea id="twmgr-mk-destcoords" class="twmgr-inp" style="width:100%;height:52px;margin:2px 0 6px" placeholder="464|604&#10;465|605"></textarea>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Reserva madeira/argila/ferro</span>' +
              '<input id="twmgr-mk-rwood" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:64px">' +
              '<input id="twmgr-mk-rstone" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:64px">' +
              '<input id="twmgr-mk-riron" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:64px"></div>' +
            '<div class="twmgr-row"><label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#5c4527"><input id="twmgr-mk-automint" type="checkbox">Cunhagem automática (moedas de ouro nas aldeias destino)</label></div>' +
            '<div class="twmgr-row"><label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#5c4527"><input id="twmgr-mk-stopon" type="checkbox">Parada programada, após</label><input id="twmgr-mk-stophours" class="twmgr-inp" type="number" min="0.1" step="0.5" value="2" style="width:56px"><span class="twmgr-lbl">h</span></div>' +
            '<div class="twmgr-actions"><button id="twmgr-mk-cunhagem-start" class="twmgr-btn twmgr-go">▶ Enviar</button><button id="twmgr-mk-cunhagem-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
            '<div id="twmgr-mk-cunhagem-status" class="twmgr-cstatus"></div>') +
        sec('⚖️ Equilíbrio',
            '<div style="font-size:10px;color:#6e5a2a;margin-bottom:4px">Aldeia acima do limiar doa o excedente pras abaixo, por recurso. Da mais perto primeiro.</div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Encher armazém até (%)</span><input id="twmgr-mk-thr" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-mk-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="15" style="width:56px"></div>' +
            '<div class="twmgr-actions"><button id="twmgr-mk-equilibrio-start" class="twmgr-btn twmgr-go">▶ Enviar</button><button id="twmgr-mk-equilibrio-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
            '<div id="twmgr-mk-equilibrio-status" class="twmgr-cstatus"></div>') +
        sec('🤝 Solidário',
            '<div style="font-size:10px;color:#6e5a2a;margin-bottom:4px">Aldeias do grupo escolhido SÓ RECEBEM (nunca doam). Doadora é qualquer OUTRA aldeia sua — testa da mais perto pra mais longe, e pula pra próxima se a mais perto não tiver mercador/recurso suficiente. Doadora só cede acima de "% do recurso mais baixo dela" (protege quem já tá capenga). Se ninguém qualificar, a mais próxima cede só a fatia acima de "% que fica na doadora" mesmo assim (nunca esvazia), pra nunca travar construção/pesquisa numa aldeia nova ou bárbara conquistada.</div>' +
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
          '<div id="twmgr-bld-vils-info" style="font-size:9px;color:#6e5a2a;text-align:right;margin-top:2px"></div>' +
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
          '<div style="font-size:9px;color:#6e5a2a;margin:7px 0 3px">Prioridades deste modelo (0 = desligado) — furam a ordem da lista quando disparam:</div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">🌾 Fazenda se sobrar menos de</span><input id="twmgr-bld-farmpct" class="twmgr-inp" type="number" min="0" max="99" value="0" style="width:52px" title="% de população ainda disponível"><span style="font-size:10px;color:#6e5a2a">% da pop.</span></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">📦 Armazém se sobrar menos de</span><input id="twmgr-bld-storagepct" class="twmgr-inp" type="number" min="0" max="99" value="0" style="width:52px" title="% de capacidade de armazenamento ainda livre"><span style="font-size:10px;color:#6e5a2a">% da cap.</span></div>') +
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
          '<div id="twmgr-pq-vils-info" style="font-size:9px;color:#6e5a2a;text-align:right;margin-top:2px"></div>' +
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
        sec('Gerenciar modelos',
          '<div class="twmgr-row" style="gap:4px">' +
            '<select id="twmgr-pq-tpl" class="twmgr-inp" style="flex:1"></select>' +
            '<button id="twmgr-pq-tpl-new" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="criar modelo">✚</button>' +
            '<button id="twmgr-pq-tpl-ren" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="renomear">✎</button>' +
            '<button id="twmgr-pq-tpl-del" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="apagar modelo">🗑</button>' +
          '</div>' +
          '<div style="font-size:9px;color:#6e5a2a;margin:6px 0 3px">Ordem = prioridade. A primeira tropa que ainda falta é a que entra na pesquisa.</div>' +
          '<div id="twmgr-pq-order" class="twmgr-bld-plan"></div>' +
          '<div class="twmgr-row" style="gap:4px;margin-top:6px">' +
            '<select id="twmgr-pq-add" class="twmgr-inp" style="flex:1">' +
              UNITS.filter((par) => par[0] !== 'knight' && par[0] !== 'snob').map((par) => '<option value="' + par[0] + '">' + par[1] + '</option>').join('') +
            '</select>' +
            '<button id="twmgr-pq-add-btn" class="twmgr-btn twmgr-ghost" style="padding:5px 10px">+</button>' +
          '</div>' +
          '<div style="margin-top:4px"><button id="twmgr-pq-reset" class="twmgr-btn twmgr-ghost" style="width:100%;font-size:10px">↺ ordem padrão</button></div>') +
        sec('Abastecimento quando falta recurso',
          '<label class="twmgr-check" title="Puxa da aldeia mais próxima que tenha excedente"><input id="twmgr-pq-feed" type="checkbox"> Pedir recurso pra pesquisar</label>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Reserva na fonte (%)</span><input id="twmgr-pq-reserve" class="twmgr-inp" type="number" min="0" max="90" value="40" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Dist. máx. da fonte (campos)</span><input id="twmgr-pq-dist" class="twmgr-inp" type="number" min="1" value="20" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Usado só quando a tela não informa o custo da pesquisa">Sem custo na tela: encher até (%)</span><input id="twmgr-pq-fill" class="twmgr-inp" type="number" min="10" max="100" value="60" style="width:56px"></div>') +
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
          '<div class="twmgr-row"><span class="twmgr-lbl">Relógio do servidor</span><b id="twmgr-pl-srvclock" style="color:#9a6f0e">--:--:--</b></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Coord alvo</span><span><input id="twmgr-pl-target-x" class="twmgr-inp" type="number" min="1" placeholder="x" style="width:56px"> | <input id="twmgr-pl-target-y" class="twmgr-inp" type="number" min="1" placeholder="y" style="width:56px"></span></div>' +
          '<label class="twmgr-lbl">Chegada base (horário do servidor)</label><input id="twmgr-pl-arr" class="twmgr-inp" type="datetime-local" step="1" style="width:100%;margin:2px 0 0">' +
          '<div class="twmgr-row" style="margin-top:6px"><span class="twmgr-lbl">Offset envio (ms)</span><input id="twmgr-pl-offset" class="twmgr-inp" type="number" min="0" value="150" style="width:56px"></div>') +
        sec('2. Aldeias participantes',
          '<div class="twmgr-row"><span class="twmgr-lbl">Selecione</span><span style="font-size:9px"><a id="twmgr-pl-all" style="cursor:pointer;color:#7a5710">todas</a> · <a id="twmgr-pl-none" style="cursor:pointer;color:#7a5710">nenhuma</a> · <a id="twmgr-pl-load" style="cursor:pointer;color:#7a5710">🔄 carregar tropas</a></span></div>' +
          '<div id="twmgr-pl-villages" style="max-height:110px;overflow-y:auto;border:1px solid #dcc78f;border-radius:6px;padding:4px"></div>') +
        sec('3. Composição por aldeia (+ onda pra mandar mais de um ataque da mesma aldeia)',
          '<div id="twmgr-pl-cards"><div style="font-size:10px;color:#6e5a2a;padding:6px;text-align:center">— marque aldeias acima e clique em <b>🔄 carregar tropas</b> —</div></div>') +
        sec('4. Armar este ataque',
          '<div class="twmgr-actions"><button id="twmgr-pl-start" class="twmgr-btn twmgr-go">▶ Armar este ataque</button><button id="twmgr-pl-stop" class="twmgr-btn twmgr-stop">■ Desarmar</button><button id="twmgr-pl-clear" class="twmgr-btn twmgr-ghost" style="flex:0 0 auto">🗑</button></div>' +
          '<div id="twmgr-pl-status" class="twmgr-cstatus"></div>') +
        sec('5. Fila deste ataque',
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:10px;color:#6e5a2a">ordenada por horário de envio</span><button id="twmgr-pl-queue-clear" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="remover enviados e erros do histórico">🗑 limpar histórico</button></div>' +
          '<div id="twmgr-pl-queue" style="max-height:220px;overflow-y:auto"></div>') +
        sec('Templates',
          '<div class="twmgr-row"><span class="twmgr-lbl">Salvar plano atual</span><span><input id="twmgr-pl-tpl-name" class="twmgr-inp" type="text" placeholder="ex: guerra XYZ" style="width:120px"> <button id="twmgr-pl-tpl-save" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">💾</button></span></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Carregar</span><span><select id="twmgr-pl-tpl-load" class="twmgr-inp" style="width:120px"></select> <button id="twmgr-pl-tpl-apply" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">📂</button> <button id="twmgr-pl-tpl-del" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="apagar">🗑</button></span></div>') +
        sec('🛡️ Blindagem da tribo',
          '<div style="font-size:10px;color:#6e5a2a;margin-bottom:4px">Puxa a tabela do tópico, escolhe origem por linha, envia apoios e copia o texto no formato do fórum.</div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">URL do tópico</span><input id="twmgr-blz-url" class="twmgr-inp" type="text" placeholder="https://.../screen=forum&mode=view&thread_id=..." style="flex:1;min-width:180px"></div>' +
          '<div class="twmgr-actions"><button id="twmgr-blz-fetch" class="twmgr-btn twmgr-ghost">🛡️ Buscar pedidos</button><span id="twmgr-blz-status" style="flex:1;font-size:10px;color:#6e5a2a;padding-top:4px">—</span></div>' +
          '<div id="twmgr-blz-list" style="max-height:280px;overflow-y:auto;border:1px solid #dcc78f;border-radius:6px;padding:4px;margin-top:4px"></div>' +
          '<div class="twmgr-actions" style="margin-top:6px"><button id="twmgr-blz-send" class="twmgr-btn twmgr-go">✉️ Enviar marcados</button></div>') +
        modLog('planner') +
      '</div>' +
      '<div id="twmgr-tab-paladin" style="display:none">' +
        hint('🐴 Treina o(s) Paladino(s) por XP em ciclo — sempre no regime de <b>4h</b> (melhor XP/hora dos 5 disponíveis). Além do check periódico, cada envio arma um timer de precisão pra 4h+30s depois, garantindo reenvio quase imediato.') +
        cardsDiv('paladin') +
        sec('1. Aldeias no ciclo',
          '<div id="twmgr-pd-villages" style="max-height:130px;overflow-y:auto;border:1px solid #dcc78f;border-radius:6px;padding:4px"></div>') +
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

