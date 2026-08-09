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
      // ---- Célula de tropa (grade de unidades da Operação, na Central) ----
      // Os campos de quantidade eram <input> cru: ficavam com a borda "inset" 3D e canto reto do
      // navegador, destoando de todo o resto do painel (que é arredondado). Isto é o .twmgr-inp
      // encolhido pra caber 12 unidades lado a lado.
      ".twmgr-ucell{display:flex;flex-direction:column;align-items:center;gap:2px;padding:3px 1px;border-radius:8px;transition:.15s}",
      ".twmgr-ucell:hover{background:#fbf7ee}",
      // Sem tropa sobrando: apaga a célula em vez de escondê-la — some do caminho do olho, mas
      // a posição de cada unidade continua a mesma em todas as ondas.
      ".twmgr-ucell.vazia{opacity:.35}",
      ".twmgr-ucell .twmgr-uqt{font-size:8px;color:#8a7d6d;line-height:1}",
      ".twmgr-uinp{width:46px;background:#fff !important;border:1px solid #ddd2c0 !important;color:#463b30 !important;border-radius:6px !important;padding:3px 2px !important;font-size:10px !important;text-align:center;outline:none !important;transition:.15s}",
      ".twmgr-uinp:focus{border-color:#a2643a !important;box-shadow:0 0 0 2px rgba(162,100,58,.22) !important}",
      // Preenchido salta aos olhos: numa grade de 12 caixas quase todas vazias, o que importa
      // é enxergar de relance quais têm tropa.
      ".twmgr-uinp:not(:placeholder-shown){border-color:#c9a35a !important;background:#fffaf0 !important;font-weight:700}",
      // Setinhas do type=number roubam ~15px de uma caixa de 46px e não servem pra nada aqui.
      ".twmgr-uinp::-webkit-outer-spin-button,.twmgr-uinp::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}",
      // ---- Blocos reaproveitáveis (estreados no Noblar) ----
      // Cards lado a lado. auto-fit em vez de "1fr 1fr" porque o painel muda de largura: abaixo de
      // ~2 colunas ele empilha sozinho, sem media query.
      ".twmgr-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:8px;margin-bottom:9px}",
      ".twmgr-card2{background:#fdfaf4;border:1px solid #e8dfcc;border-radius:9px;padding:10px 12px}",
      ".twmgr-card2 h4{margin:0 0 9px;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#a07a42;font-weight:700}",
      // Linha rótulo → controle. O controle encosta à direita em todos os cards, alinhado.
      ".twmgr-fld{display:flex;align-items:center;gap:8px;margin-bottom:8px}",
      ".twmgr-fld:last-child{margin-bottom:0}",
      ".twmgr-fld>span{flex:1;font-size:11px;color:#6f6153;line-height:1.25}",
      ".twmgr-fld .twmgr-inp{width:74px;text-align:center;flex:0 0 74px}",
      // Interruptor. Só CSS — o <input> continua um checkbox comum, então .checked segue valendo.
      ".twmgr-sw{position:relative;display:inline-block;width:32px;height:17px;flex:0 0 32px;cursor:pointer}",
      ".twmgr-sw input{position:absolute;opacity:0;width:0;height:0}",
      ".twmgr-sw i{position:absolute;inset:0;background:#ded3bf;border-radius:9px;transition:background .15s}",
      ".twmgr-sw i:after{content:'';position:absolute;width:13px;height:13px;left:2px;top:2px;background:#fff;border-radius:50%;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.25)}",
      ".twmgr-sw input:checked+i{background:#b5651d}",
      ".twmgr-sw input:checked+i:after{transform:translateX(15px)}",
      // Chips dos modelos: a ordem da esquerda pra direita É a prioridade.
      ".twmgr-chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}",
      ".twmgr-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid #e2d7c1;background:#fbf7ef;border-radius:14px;padding:3px 10px 3px 5px;font-size:10px;color:#6f6153;cursor:pointer;white-space:nowrap}",
      ".twmgr-chip:hover{border-color:#c9a56a}",
      ".twmgr-chip.on{background:#f5e6cd;border-color:#c08a3e;color:#7a5320;font-weight:700}",
      ".twmgr-chip b{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#b5651d;color:#fff;font-size:9px;font-weight:700;flex:0 0 15px}",
      ".twmgr-chip-add{border-style:dashed;border-color:#a9c9a9;background:#f5faf5;color:#3f8f52;padding:3px 11px;font-weight:700}",
      // Grade de tropas no formato do jogo: ícone em cima, campo embaixo, uma coluna por unidade.
      ".twmgr-ug{display:grid;grid-template-columns:repeat(auto-fit,minmax(42px,1fr));gap:3px;margin-top:5px}",
      // min-width:0 é obrigatório: sem ele o item da grade nunca encolhe abaixo do próprio conteúdo,
      // e o rótulo ("C.leve") empurrava a coluna pra 68px dentro de um espaço de 48 — estourando a
      // largura do painel inteiro em cascata.
      ".twmgr-ug>div{min-width:0}",
      ".twmgr-ug .h{background:#efe4cd;border:1px solid #e2d7c1;border-bottom:0;border-radius:5px 5px 0 0;padding:2px 1px 1px;text-align:center;line-height:1;overflow:hidden}",
      // A abreviação embaixo do ícone é rede de segurança: se o sprite do jogo não carregar, a
      // coluna continua identificável em vez de virar um quadrado vazio.
      ".twmgr-ug .h em{display:block;font-style:normal;font-size:8px;color:#8a7340;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".twmgr-ug input{width:100%;min-width:0;text-align:center;border-radius:0 0 5px 5px;padding:3px 0;font-size:10px}",
      ".twmgr-ug .lock input{background:#f0ebe0;color:#a09480}",
      // Tabela de alvos: célula de duas linhas (o valor e o seu contexto embaixo, menor).
      ".twmgr-nb-tab td{vertical-align:top;padding:4px 4px}",
      // ---- Status do Recrutar ----
      // Os sprites do jogo têm tamanhos naturais bem diferentes (a lança é estreita, o cavalo é
      // largo), o que deixava o cabeçalho desalinhado. Cada ícone vai dentro de uma caixa FIXA,
      // centrado, com o que passar cortado igualmente dos dois lados — as colunas ficam uniformes
      // independente do sprite.
      ".twmgr-uicon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;font-style:normal;vertical-align:middle}",
      // O sprite é ESCALADO por JS pra caber (ver rcAjustarIcones): só encaixotar igualava a
      // coluna mas cortava os grandes. A origem central mantém o ícone alinhado com o número.
      ".twmgr-uicon .unit_sprite{flex:0 0 auto;transform-origin:center}",

      ".twmgr-uicon .unit_sprite{flex:0 0 auto}",
      ".twmgr-rc-st{table-layout:fixed;width:100%}",
      // `thead th`/`tbody td` (nao so `th`/`td`): a regra base .twmgr-bld-tab th tem a MESMA
      // especificidade e vem depois no arquivo, entao ganhava por ordem e o alinhamento central
      // simplesmente nao aplicava -- media 9px de desvio entre o icone e a coluna de numeros.
      ".twmgr-rc-st thead th{padding:3px 1px;text-align:center;vertical-align:middle;border:1px solid #d8c9ac;border-top:0}",
      // Grade: com 9 colunas de número, o olho perde a linha sem as divisórias. Vertical mais
      // marcada que a horizontal — a comparação que importa é dentro da coluna (uma unidade entre
      // aldeias), então é a coluna que precisa ficar delimitada.
      ".twmgr-rc-st{border-collapse:collapse}",
      // O container ja rolava na vertical; sem o horizontal a tabela larga vazaria do painel.
      ".twmgr-bld-vils{overflow-x:auto}",
      ".twmgr-rc-st tbody td{border-right:1px solid #e6dbc6;border-bottom:1px solid #efe7d8}",
      ".twmgr-rc-st tbody td:last-child{border-right:0}",
      ".twmgr-rc-st tbody tr:last-child td{border-bottom:0}",
      ".twmgr-rc-st tbody td{padding:4px 1px;text-align:center;vertical-align:middle;white-space:nowrap;font-size:9px}",
      ".twmgr-rc-st tbody td:first-child,.twmgr-rc-st thead th:first-child{text-align:left;padding-left:5px;white-space:normal}",
      ".twmgr-rc-st .sub{font-size:8px;color:#a08c6a;line-height:1.1}",
      ".twmgr-rc-st td b{font-size:10px;font-variant-numeric:tabular-nums}",
      // O alvo entre parênteses, menor e apagado: é referência, o número que importa é o atual.
      // Alvo no MESMO tamanho do atual (pedido do usuário) — só a cor separa um do outro.
      ".twmgr-rc-st .alvo{font-size:10px;color:#a89madeira;margin-left:3px;font-variant-numeric:tabular-nums}",
      ".twmgr-bld-dem{display:inline-flex;align-items:center;gap:2px;cursor:pointer;font-size:10px;color:#b03030}",
      ".twmgr-bld-dem input{margin:0}",
      ".twmgr-rc-st .ordena{cursor:pointer;user-select:none}",
      ".twmgr-rc-st .ordena:hover{background:rgba(0,0,0,.05)}",
      // A seta sai do FLUXO: em linha, ela empurrava o ícone pro lado e o cabeçalho deixava de
      // ficar centrado sobre a coluna de números (9px de desvio medido).
      ".twmgr-rc-st th{position:relative}",
      ".twmgr-rc-st .ord{position:absolute;top:1px;right:2px;font-size:7px;color:#8b5426;line-height:1}",
      ".twmgr-rc-st .pctcel b{font-size:11px}",

      ".twmgr-rc-st .vazio{color:#d3c9b6}",
      // Faixas: <50% vermelho, 50-80% amarelo, >80% verde, cumprido com fundo pra saltar aos olhos.
      ".twmgr-rc-st .f-ruim b{color:#b03030}",
      ".twmgr-rc-st .f-meio b{color:#b5651d}",
      ".twmgr-rc-st .f-bom b{color:#3f8f52}",
      ".twmgr-rc-st .f-ok{background:#e6f3e6}.twmgr-rc-st .f-ok b{color:#2e7d3a}",
      ".twmgr-rc-st .f-inf b{color:#6f6153}",
      // Aldeia com TODAS as unidades no alvo: linha inteira destacada, não só as células.
      ".twmgr-rc-st tr.twmgr-rc-full td{background:#dff0df}",
      ".twmgr-rc-st tr.twmgr-rc-full td:first-child{box-shadow:inset 3px 0 0 #3f8f52}",
      ".twmgr-rc-chk{color:#2e7d3a;font-weight:700;font-size:11px}",
      ".twmgr-nb-tab .sub{font-size:8px;color:#8a7340;margin-top:1px;line-height:1.2;word-break:break-word}",
      ".twmgr-nb-tab select{width:100%;min-width:0;font-size:9px;padding:1px 2px;text-overflow:ellipsis}",
      // Ícone de bandeira: o arquivo do jogo já vem no tamanho certo, só precisa caber na célula.
      ".twmgr-flag{display:inline-block;width:30px;height:30px;background-size:contain;background-repeat:no-repeat;background-position:center;vertical-align:middle}",
      ".twmgr-flaggrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:4px}",
      ".twmgr-flaggrid a{display:block;text-align:center;padding:3px 1px;border:1px solid transparent;border-radius:6px;cursor:pointer}",
      ".twmgr-flaggrid a:hover{border-color:#c9a56a;background:#f5e6cd}",
      ".twmgr-flaggrid em{display:block;font-style:normal;font-size:8px;color:#8a7340}",
      // Botão da bandeira: um traço cinza não parecia clicável. Tracejado = vazio, sólido = tem.
      ".twmgr-nb-pband{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:46px;min-height:38px;padding:2px 5px;border:1px dashed #c9a56a;border-radius:6px;background:#fbf7ef;color:#a07a42;cursor:pointer;line-height:1.1}",
      ".twmgr-nb-pband:hover{background:#f5e6cd;border-style:solid}",
      ".twmgr-nb-pband.tem{border-style:solid;border-color:#c08a3e;background:#fff}",
      ".twmgr-nb-pband em{font-style:normal;font-size:8px;color:#8a7340}",
      // Cabeçalho de cada tipo na grade — sem ele são 54 ícones soltos.
      ".twmgr-flaggrp{font-size:9px;color:#a07a42;font-weight:700;margin:7px 0 3px;border-bottom:1px solid #eee3cf;padding-bottom:2px}",
      ".twmgr-flaggrp:first-child{margin-top:0}",

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
      ".twmgr-ap-topo{display:flex;align-items:center;gap:10px;background:#fdfaf4;border:1px solid #e8dfcc;border-radius:9px;padding:8px 11px;margin-bottom:8px}",
      ".twmgr-ap-big{font-size:17px;font-weight:700;color:#8b5426;line-height:1}",
      ".twmgr-ap-lbl{font-size:9px;letter-spacing:.5px;text-transform:uppercase;color:#8a7d6d}",
      ".twmgr-ap-cartao{background:#ffffff;border:1px solid #ece4d8;border-radius:8px;margin-bottom:5px;overflow:hidden}",
      ".twmgr-ap-cartao.on{border-color:#ddd2c0;box-shadow:0 1px 4px rgba(125,81,15,.09)}",
      ".twmgr-ap-dest{display:grid;grid-template-columns:12px minmax(0,1fr) minmax(0,auto);align-items:center;gap:9px;padding:7px 10px;cursor:pointer;position:relative}",
      ".twmgr-ap-dest:hover{background:#f6f1e8}",
      ".twmgr-ap-barra{position:absolute;left:0;top:0;bottom:0;width:3px;background:#a2643a;opacity:.75}",
      ".twmgr-ap-seta{color:#a2643a;font-size:9px;justify-self:center}",
      ".twmgr-ap-nome{font-size:11px;color:#463b30;min-width:0}",
      ".twmgr-ap-nome b{font-size:12px}",
      ".twmgr-ap-coord{color:#8a7d6d;font-size:10px;margin-left:4px}",
      ".twmgr-ap-dono{font-size:9px;color:#a2643a;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".twmgr-ap-tropas{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}",
      ".twmgr-ap-t{display:inline-flex;align-items:center;gap:3px;background:#fbf7ef;border:1px solid #ece4d8;border-radius:11px;padding:1px 7px 1px 4px;font-size:10px;color:#463b30;white-space:nowrap}",
      ".twmgr-ap-t b{font-weight:700}",
      ".twmgr-ap-t .twmgr-ui{width:14px;height:14px}",
      ".twmgr-ap-orig{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto);align-items:center;gap:9px;padding:5px 10px 5px 24px;background:#faf7f0;border-top:1px dashed #e8dfcc;font-size:10px;color:#6f6153;position:relative}",
      ".twmgr-ap-orig:before{content:\"\";position:absolute;left:13px;top:0;bottom:0;width:1px;background:#e8dfcc}",
      ".twmgr-ap-dist{font-size:9px;color:#8a7d6d;margin-left:5px}",
      ".twmgr-ap-cb{vertical-align:-1px;margin-right:3px}",
      ".twmgr-ap-acoes{display:flex;align-items:center;gap:4px;padding:6px 10px;background:#f4eee2;border-top:1px solid #e8dfcc}",
      ".twmgr-ap-u{display:inline-flex;padding:2px;border:1px solid transparent;border-radius:4px;cursor:pointer;opacity:.32;filter:grayscale(1)}",
      ".twmgr-ap-u.on{opacity:1;filter:none;border-color:#d8c9ae;background:#fffdf8}",
      ".twmgr-ap-acoes button{font-size:10px;padding:2px 8px;border:1px solid #d8c9ae;border-radius:5px;background:#fffdf8;color:#8b5426;cursor:pointer}",
      ".twmgr-ap-acoes button:hover:not(:disabled){background:#f6ecdd}",
      ".twmgr-ap-acoes button:disabled{opacity:.45;cursor:default}",
      ".twmgr-ap-go{font-weight:700}",
      ".twmgr-ap-q{width:46px;font-size:10px;font-weight:700;text-align:right;border:1px solid #ddd2c0;border-radius:3px;background:#fff;color:#463b30;padding:0 2px}",
      ".twmgr-ap-t.zero{opacity:.45}",
      ".twmgr-ap-t.zero .twmgr-ap-q{color:#8a7d6d}",
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
    ['scav', 'farm', 'recruit', 'market', 'build', 'research', 'noble', 'paladin', 'etiqueta', 'obra', 'apoios', 'log'].forEach((n) => {
      const c = document.getElementById('twmgr-tab-' + n); if (c) c.style.display = n === name ? 'block' : 'none';
      const b = document.getElementById('twmgr-btab-' + n); if (b) b.classList.toggle('active', n === name);
    });
    // Elemento em display:none mede ZERO. Quem depende de medida real (a escala dos ícones do
    // Status) precisa refazer a conta quando a aba aparece — senão o ajuste só acontecia por
    // acidente, na primeira vez que o usuário reordenava a tabela.
    if (name === 'recruit') aoAparecer();
  }
  // Rotinas que só funcionam com o elemento visível. Chamado por showTab e showSub.
  function aoAparecer() {
    const st = document.getElementById('twmgr-rc-status');
    if (st && st.offsetParent !== null && typeof rcAjustarIcones === 'function') rcAjustarIcones(st);
  }

  // Sub-aba do Saque. Guarda a escolha no localStorage (preferência de tela, igual à largura do
  // painel) pra quem vive na Muralha não cair no Saque a cada recarregamento de página.
  const FARM_SUB_KEY = 'twMgr_farmSub';
  // Sub-abas por módulo. Era só do Saque; virou genérico quando o Noblar também passou a ter —
  // duplicar a função daria duas cópias pra manter em sincronia.
  const SUBS = { farm: ['farm', 'wall', 'map'], noble: ['alvos', 'cunhar', 'pos'],
                 recruit: ['rcmodelos', 'rcstatus'], build: ['bldmodelos', 'bldstatus'],
                 market: ['cunhagem', 'equilibrio', 'solidario'] };
  function showSub(mod, name) {
    (SUBS[mod] || []).forEach((n) => {
      const c = document.getElementById('twmgr-sub-' + n); if (c) c.style.display = n === name ? 'block' : 'none';
      const b = document.getElementById('twmgr-sbtab-' + n); if (b) b.classList.toggle('active', n === name);
    });
    try { localStorage.setItem(FARM_SUB_KEY + '_' + mod, name); } catch (e) {}
    aoAparecer();   // a sub-aba que acabou de abrir agora tem medida real
  }
  // O Saque salvava a sub-aba numa chave sem sufixo; mantida pra não resetar quem já usa.
  function showFarmSub(name) {
    showSub('farm', name);
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
    const subBtn = (n, ico, label, mod) => '<div id="twmgr-sbtab-' + n + '" class="twmgr-subtab" data-sub="' + (mod || 'farm') + ':' + n + '"><span>' + ico + '</span> ' + label + '</div>';
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
      '<div class="twmgr-tabs">' + tabBtn('scav', '⛏️', 'Coletas') + tabBtn('farm', '🐎', 'Saque') + tabBtn('recruit', '🏹', 'Recrutar') + tabBtn('market', '🏪', 'Mercado') + tabBtn('build', '🏗️', 'Construções') + tabBtn('research', '⚗️', 'Pesquisa') + tabBtn('noble', '👑', 'Noblar') + tabBtn('paladin', '🐴', 'Paladino') + tabBtn('etiqueta', '🏷️', 'Etiquetas') + tabBtn('obra', '🏛️', 'Obra') + tabBtn('apoios', '🛡️', 'Apoios') + '</div>' +
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
        // Relatório do último ciclo: todo alvo elegível, o que está acontecendo com ele e por
        // quê. Bloqueados/fora primeiro (é o que dá pra agir); quebrando por último.
        sec('Relatório do último ciclo',
          '<div style="font-size:9px;color:#8a7d6d;margin-bottom:3px" id="twmgr-wall-rel-at"></div>' +
          '<div style="display:grid;grid-template-columns:64px 74px 1fr 1fr;gap:4px;font-size:9px;color:#8a7d6d;padding:0 4px 2px">' +
            '<span>alvo</span><span>status</span><span>origem</span><span>chega / motivo</span></div>' +
          '<div id="twmgr-wall-relatorio" style="height:200px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:6px"></div>') +
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
        hint('⚔️ Modelos de recrutamento no molde do <b>Gerente de conta</b>: monte o modelo, aplique nas aldeias. O modelo pode ser amarrado a um <b>grupo</b> — aí toda aldeia dele segue sem você marcar uma a uma. O alvo é pra <b>manter</b>, não pedido único.') +
        cardsDiv('recruit') +
        '<div class="twmgr-subtabs">' +
          subBtn('rcmodelos', '⚔️', 'Modelos', 'recruit') +
          subBtn('rcstatus', '📊', 'Status', 'recruit') +
        '</div>' +
        '<div id="twmgr-sub-rcmodelos">' +
        sec('Modelo',
          '<div class="twmgr-row" style="gap:4px">' +
            '<select id="twmgr-rc-tpl" class="twmgr-inp" style="flex:1"></select>' +
            '<button id="twmgr-rc-tpl-new" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="criar modelo">✚</button>' +
            '<button id="twmgr-rc-tpl-ren" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="renomear">✎</button>' +
            '<button id="twmgr-rc-tpl-del" class="twmgr-btn twmgr-ghost" style="padding:5px 8px" title="apagar modelo">🗑</button>' +
          '</div>' +
          '<div id="twmgr-rc-editor" style="margin-top:7px"></div>') +
        '</div>' +
        '<div id="twmgr-sub-rcstatus" style="display:none">' +
          sec('Status por aldeia',
            '<div class="twmgr-row" style="gap:4px">' +
              '<span class="twmgr-lbl" style="flex:0 0 auto">Grupo</span>' +
              '<select id="twmgr-rc-stgroup" class="twmgr-inp" style="flex:1"></select>' +
              '<button id="twmgr-rc-status-reload" class="twmgr-btn twmgr-ghost" style="padding:5px 9px" title="reler agora (não recruta)">↻</button>' +
            '</div>' +
            '<div id="twmgr-rc-status" class="twmgr-bld-vils" style="margin-top:5px"></div>' +
            '<div id="twmgr-rc-status-info" style="font-size:9px;color:#8a7d6d;text-align:right;margin-top:2px"></div>' +
            '') +
        '</div>' +
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
        '<div class="twmgr-subtabs">' +
          subBtn('cunhagem', '💰', 'Cunhagem', 'market') +
          subBtn('equilibrio', '⚖️', 'Equilíbrio', 'market') +
          subBtn('solidario', '🤝', 'Solidário', 'market') +
        '</div>' +
        '<div id="twmgr-sub-cunhagem">' +
        sec('💰 Cunhagem',
            '<div class="twmgr-row"><span class="twmgr-lbl">Grupos de origem</span></div>' +
            '<div id="twmgr-mk-srcgroups" style="max-height:100px;overflow-y:auto;border:1px solid #ece4d8;border-radius:6px;padding:4px;margin-bottom:6px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Aldeias destino (1 coord. por linha)</span></div>' +
            '<textarea id="twmgr-mk-destcoords" class="twmgr-inp" style="width:100%;height:52px;margin:2px 0 6px" placeholder="464|604&#10;465|605"></textarea>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Reserva madeira/argila/ferro</span>' +
              '<input id="twmgr-mk-rwood" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:64px">' +
              '<input id="twmgr-mk-rstone" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:64px">' +
              '<input id="twmgr-mk-riron" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:64px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl" title="Proporção pra dividir o que cada aldeia manda — pensado pro custo de formar o nobre, pra não sobrar recurso parado no destino. Zerar os 3 volta pra divisão igual entre os três.">Peso mad/arg/fer (custo do nobre)</span>' +
              '<input id="twmgr-mk-pwood" class="twmgr-inp" type="number" min="0" step="1000" value="28000" style="width:64px">' +
              '<input id="twmgr-mk-pstone" class="twmgr-inp" type="number" min="0" step="1000" value="30000" style="width:64px">' +
              '<input id="twmgr-mk-piron" class="twmgr-inp" type="number" min="0" step="1000" value="25000" style="width:64px"></div>' +
            '<div class="twmgr-row"><label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#6f6153"><input id="twmgr-mk-automint" type="checkbox">Cunhagem automática (moedas de ouro nas aldeias destino)</label></div>' +
            '<div class="twmgr-row"><label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#6f6153"><input id="twmgr-mk-stopon" type="checkbox">Parada programada, após</label><input id="twmgr-mk-stophours" class="twmgr-inp" type="number" min="0.1" step="0.5" value="2" style="width:56px"><span class="twmgr-lbl">h</span></div>' +
            '<div class="twmgr-actions"><button id="twmgr-mk-cunhagem-start" class="twmgr-btn twmgr-go">▶ Enviar</button><button id="twmgr-mk-cunhagem-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
            '<div id="twmgr-mk-cunhagem-status" class="twmgr-cstatus"></div>' +
            '<div id="twmgr-mk-cunhagem-coins" style="font-size:10px;color:#8a7d6d;margin-top:2px"></div>') +
        '</div>' +
        '<div id="twmgr-sub-equilibrio" style="display:none">' +
        sec('⚖️ Equilíbrio',
            '<div style="font-size:10px;color:#8a7d6d;margin-bottom:4px">Aldeia acima do limiar doa o excedente pras abaixo, por recurso. Da mais perto primeiro.</div>' +
            '<label class="twmgr-check" style="margin-bottom:5px" title="Em vez de um limiar que você escolhe, cada recurso mira a fatia que ELE ocupa da sua capacidade total de armazenamento. Resolve o caso em que um recurso (tipicamente madeira) passa do limiar em TODAS as aldeias: aí não sobra receptora, nada se move e a mais cheia estoura. Com o alvo proporcional sempre há alguém acima e alguém abaixo da média.">' +
              '<input id="twmgr-mk-alvoauto" type="checkbox"> Alvo automático <span style="color:#8a7d6d">(proporcional ao que você tem)</span></label>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Encher armazém até (%)</span><input id="twmgr-mk-thr" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-mk-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="15" style="width:56px"></div>' +
            '<div class="twmgr-actions"><button id="twmgr-mk-equilibrio-start" class="twmgr-btn twmgr-go">▶ Enviar</button><button id="twmgr-mk-equilibrio-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
            '<div id="twmgr-mk-equilibrio-status" class="twmgr-cstatus"></div>' +
            // Saúde: funciona mesmo com o Equilíbrio desligado (só lê, não manda nada).
            '<div style="margin-top:8px;border-top:1px solid #ece4d8;padding-top:6px">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">' +
                '<span style="font-size:10px;color:#8b5426;font-weight:600">Saúde dos recursos</span>' +
                '<a id="twmgr-mk-eq-diag" style="cursor:pointer;color:#a2643a;font-size:9px">🔄 diagnóstico</a>' +
              '</div>' +
              '<div id="twmgr-mk-eq-resumo" style="font-size:10px;color:#6f6153;margin-bottom:2px">— rode o diagnóstico ou ligue o Equilíbrio —</div>' +
              '<div id="twmgr-mk-eq-eta" style="font-size:9px;color:#8a7d6d;margin-bottom:4px"></div>' +
              '<div id="twmgr-mk-eq-sugestao" style="font-size:9px;color:#8b5426;margin-bottom:4px"></div>' +
              '<div style="display:grid;grid-template-columns:66px 1fr 1fr;gap:4px;font-size:9px;color:#8a7d6d;padding:0 4px 2px">' +
                '<span>aldeia</span><span>déficit (abaixo do limiar)</span><span>risco</span></div>' +
              '<div id="twmgr-mk-eq-problemas" style="height:160px;min-height:70px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:6px"></div>' +
            '</div>') +
        '</div>' +
        '<div id="twmgr-sub-solidario" style="display:none">' +
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
        '</div>' +
        sec('Ritmo (compartilhado pelos modos ligados)', '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-mk-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>') +
        modLog('market') +
      '</div>' +
      '<div id="twmgr-tab-build" style="display:none">' +
        hint('🏗️ Modelos de construção <b>amarrados a um grupo</b>: toda aldeia do grupo segue o modelo. Ordem da lista = prioridade; item caro vira demanda pro Equilíbrio.') +
        cardsDiv('build') +
        '<div class="twmgr-subtabs">' +
          subBtn('bldmodelos', '🏗️', 'Modelos', 'build') +
          subBtn('bldstatus', '📊', 'Status', 'build') +
        '</div>' +
        '<div id="twmgr-sub-bldmodelos">' +
          sec('Modelo',
            '<div class="twmgr-row" style="gap:4px">' +
              '<select id="twmgr-bld-tplsel" class="twmgr-inp" style="flex:1"></select>' +
              '<a id="twmgr-bld-abrir-tpl" class="twmgr-btn twmgr-ghost" style="padding:5px 10px;white-space:nowrap">Gerenciar modelos</a>' +
            '</div>' +
            '<div class="twmgr-fld" style="margin-top:7px"><span title="Todas as aldeias deste grupo seguem este modelo">Aplicar ao grupo</span>' +
              '<select id="twmgr-bld-tplgrp" class="twmgr-inp" style="flex:0 0 150px;width:150px"></select></div>' +
            '<div id="twmgr-bld-plano-resumo" style="font-size:9px;color:#8a7d6d;margin-top:5px"></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:5px">Aldeia que entra no grupo no jogo entra na gestão <b>sozinha</b>, no ciclo seguinte — não precisa marcar nada aqui.</div>' +
            '<div class="twmgr-fld" style="margin-top:9px"><span title="Derruba nível acima do alvo">Demolir excedente</span>' +
              '<label class="twmgr-sw"><input id="twmgr-bld-demolir" type="checkbox"><i></i></label></div>' +
            '<div style="font-size:9px;color:#b03030;margin-top:4px">⚠ Demolir <b>não devolve recurso</b> e reconstruir custa o preço cheio. Não há desfazer.</div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Ligado, vale pra <b>todo</b> prédio do modelo — não precisa marcar nada. Só começa depois que a aldeia <b>bate o alvo em todos os prédios</b> (a linha com ✓ no Status), derruba <b>um nível por aldeia por ciclo</b> e só com a fila de demolição vazia — dá tempo de ver acontecendo e desligar.</div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:3px"><b>Um nível por aldeia por ciclo</b>, e só com a fila de demolição vazia — dá tempo de ver acontecendo e desligar.</div>') +
        '</div>' +
        '<div id="twmgr-sub-bldstatus" style="display:none">' +
          sec('Status por aldeia',
            '<div class="twmgr-row" style="gap:4px">' +
              '<span class="twmgr-lbl" style="flex:0 0 auto">Grupo</span>' +
              '<select id="twmgr-bld-stgroup" class="twmgr-inp" style="flex:1"></select>' +
              '<button id="twmgr-bld-st-reload" class="twmgr-btn twmgr-ghost" style="padding:5px 9px" title="reler agora (não constrói)">↻</button>' +
            '</div>' +
            '<div id="twmgr-bld-sttab" class="twmgr-bld-vils" style="margin-top:5px"></div>' +
            '<div id="twmgr-bld-sttab-info" style="font-size:9px;color:#8a7d6d;text-align:right;margin-top:2px"></div>') +
        '</div>' +
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
          '<div class="twmgr-fld" style="margin-top:6px"><span title="Aldeia adicionada ao grupo no jogo entra sozinha na gestão">Seguir o grupo <span style="color:#8a7d6d">(entrar sozinha)</span></span>' +
            '<label class="twmgr-sw"><input id="twmgr-pq-seguir" type="checkbox"><i></i></label></div>' +
          '<div class="twmgr-fld"><span>Modelo pra aldeia nova</span><select id="twmgr-pq-grptpl" class="twmgr-inp" style="flex:0 0 150px;width:150px"></select></div>' +
          '<div style="font-size:9px;color:#8a7d6d;margin:2px 0 7px">Ele só <b>adiciona</b>. Aldeia que sai do grupo <b>continua</b> na gestão — tirar sozinho pararia a pesquisa dela em silêncio.</div>' +
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
      '<div id="twmgr-tab-noble" style="display:none">' +
        hint('👑 Cola as coordenadas e ele nobla <b>uma aldeia por vez</b>, na ordem da fila (FIFO — use ▲▼ pra mudar). A da vez tem <b>prioridade absoluta</b> sobre nobre parado, recrutamento e cunhagem; a próxima só entra quando a <b>lealdade prevista</b> da primeira chega a zero, ou seja, quando o que já está no ar garante a queda. Ela só <b>sai</b> da fila na conquista efetiva. Premissa: os alvos estão <b>vazios</b>.') +
        cardsDiv('noble') +
        '<div class="twmgr-subtabs">' +
          subBtn('alvos', '👑', 'Alvos', 'noble') +
          subBtn('cunhar', '🪙', 'Cunhar', 'noble') +
          subBtn('pos', '🏴', 'Pós-conquista', 'noble') +
        '</div>' +
        '<div id="twmgr-sub-alvos">' +
        sec('Alvos',
          '<textarea id="twmgr-nb-coords" class="twmgr-inp" style="width:100%;height:56px;font-family:monospace;font-size:11px" placeholder="555|444 555|445 555446 texto solto no meio"></textarea>' +
          '<div class="twmgr-row" style="margin-top:5px">' +
            '<span id="twmgr-nb-count" class="twmgr-lbl">0 coordenadas</span>' +
            '<span style="flex:1"></span>' +
            '<button id="twmgr-nb-add" class="twmgr-btn twmgr-ghost" style="padding:5px 12px">+ Adicionar</button>' +
          '</div>' +
          '<div id="twmgr-nb-lista" class="twmgr-bld-vils" style="margin-top:6px"></div>' +
          '<div id="twmgr-nb-info" style="font-size:9px;color:#8a7d6d;text-align:right;margin-top:2px"></div>') +
        sec('Modelos de envio',
          '<div id="twmgr-nb-chips" class="twmgr-chips"></div>' +
          '<div class="twmgr-card2">' +
            '<div class="twmgr-row" style="gap:4px;margin-bottom:9px">' +
              '<span id="twmgr-nb-tpl-nome" style="flex:1;font-size:11px;font-weight:700;color:#7a5320"></span>' +
              '<button id="twmgr-nb-tpl-up" class="twmgr-btn twmgr-ghost" style="padding:4px 7px" title="subir na prioridade">◀</button>' +
              '<button id="twmgr-nb-tpl-dn" class="twmgr-btn twmgr-ghost" style="padding:4px 7px" title="descer na prioridade">▶</button>' +
              '<button id="twmgr-nb-tpl-ren" class="twmgr-btn twmgr-ghost" style="padding:4px 7px" title="renomear">✎</button>' +
              '<button id="twmgr-nb-tpl-del" class="twmgr-btn twmgr-ghost" style="padding:4px 7px" title="apagar modelo">🗑</button>' +
            '</div>' +
            '<div class="twmgr-cols" style="margin-bottom:0">' +
              '<div class="twmgr-fld"><span title="Cada comando leva exatamente 1 nobre — a lealdade cai uma vez por ataque">Comandos por alvo <span style="color:#8a7d6d">(1 nobre cada)</span></span><input id="twmgr-nb-nob" class="twmgr-inp" type="number" min="1" max="8" value="4"></div>' +
              '<div class="twmgr-fld"><span>Viagem máx. (h)</span><input id="twmgr-nb-horas" class="twmgr-inp" type="number" min="1" max="72" value="6"></div>' +
            '</div>' +
            '<div class="twmgr-fld" style="margin-top:8px"><span title="NT = todos os nobres saindo da MESMA aldeia">Só enviar NT <span style="color:#8a7d6d">(todos da mesma aldeia)</span></span>' +
              '<label class="twmgr-sw"><input id="twmgr-nb-nt" type="checkbox"><i></i></label></div>' +
            '<div style="font-size:10px;color:#6f6153;margin-top:9px">Escolta — vai no <b>mesmo comando</b>, em <b>cada</b> um deles</div>' +
            '<div id="twmgr-nb-esc" class="twmgr-ug"></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:6px;text-align:center;font-style:italic">O número do chip é a ordem de prioridade (◀▶ pra mudar) · Nobre é sempre 1 por comando</div>' +
          '</div>' +
          '<div style="font-size:9px;color:#8a7d6d;margin-top:6px"><b>Cada comando leva 1 nobre.</b> A lealdade cai uma vez por <b>ataque</b>, então 4 nobres num comando só desperdiçaria 3 — é por isso que NT são 4 comandos seguidos. Uma aldeia que manda 3 nobres precisa de <b>3× a escolta</b>.</div>' +
          '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Alvo em <b>⇅ seguir ordem</b> fica com o modelo que armar <b>mais comandos completos</b> — vale mais um que rende 4 do que um que rende 1. Empate fica com quem vem antes.</div>' +
          '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Só tropa de campo na escolta: explorador não briga, e aríete e catapulta servem pra muralha, não pra proteger nobre. Como o nobre é a unidade <b>mais lenta do jogo</b>, a escolta não atrasa a chegada.</div>') +
        '<div class="twmgr-cols">' +
          '<div class="twmgr-card2"><h4>⚖ Lealdade</h4>' +
            '<div class="twmgr-fld"><span title="Quanto um nobre derruba. No jogo varia de 20 a 35 — um valor MAIOR arrisca mandar de menos; menor manda de sobra">Queda por ataque</span><input id="twmgr-nb-lpa" class="twmgr-inp" type="number" min="1" max="100" value="25"></div>' +
            '<div class="twmgr-fld"><span title="Quanto a lealdade sobe por hora sozinha">Regenera por hora</span><input id="twmgr-nb-regen" class="twmgr-inp" type="number" min="0" max="10" step="0.5" value="1"></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:7px">O padrão é <b>25</b>, não a média 28: no jogo a queda varia de 20 a 35, e com sorte ruim o 28 manda <b>de menos</b> — o alvo sobrevive de raspão. Errar pro lado de um nobre a mais é o erro barato.</div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">A <b>lealdade prevista</b> é a que o alvo terá <b>na hora em que o próximo nobre chegar</b>: parte do último relatório, soma a regeneração e desconta os ataques que já estão no ar — cada um no seu horário de chegada, porque a lealdade <b>sobe entre uma leva e outra</b>. Somar tudo de uma vez daria um número otimista.</div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Sem relatório de nobre não há lealdade (<b>?</b>) — é o único lugar do jogo onde ela aparece. Aí ele usa o número do modelo.</div>' +
          '</div>' +
          '<div class="twmgr-card2"><h4>⏱ Ciclo</h4>' +
            '<div class="twmgr-fld"><span>Refazer o plano a cada (min)</span><input id="twmgr-nb-int" class="twmgr-inp" type="number" min="1" value="15"></div>' +
            '<div class="twmgr-fld"><span title="Dispara sem pedir confirmação">Enviar automaticamente</span>' +
              '<label class="twmgr-sw"><input id="twmgr-nb-auto" type="checkbox"><i></i></label></div>' +
            '<div class="twmgr-fld"><span title="Trava de segurança: um plano errado não esvazia a conta de nobre de uma vez">Teto de comandos por ciclo</span><input id="twmgr-nb-automax" class="twmgr-inp" type="number" min="1" max="40" value="8"></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:7px">Envio <b>parcial</b> só sai sozinho quando <b>não há nobre em produção</b>. Se tem nobre vindo, ele segura — a lealdade regenera ~1/h e um nobre derruba ~28, então mandar sozinho queima o nobre à toa. O botão <b>Enviar</b> continua lá se você quiser forçar.</div>' +
            '<div class="twmgr-fld" style="margin-top:9px"><span title="Lê os relatórios de ataque pra saber a lealdade que sobrou">Ler relatórios <span style="color:#8a7d6d">(lealdade, dono, tropa)</span></span>' +

              '<label class="twmgr-sw"><input id="twmgr-nb-rel" type="checkbox"><i></i></label></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:7px">Lealdade só aparece em relatório de <b>ataque com nobre</b> — exploração não mostra. Por isso a coluna fica <b>?</b> até o primeiro nobre bater.</div>' +
          '</div>' +
          '<div class="twmgr-card2"><h4>⚒ Produção</h4>' +
            '<div class="twmgr-fld"><span title="Forma o nobre onde JÁ existe moeda guardada">Formar nobre quando faltar</span>' +
              '<label class="twmgr-sw"><input id="twmgr-nb-prod" type="checkbox"><i></i></label></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:7px"><b>Nunca cunha.</b> Cunhar converte recurso em moeda sem volta, num alvo que pode nem sair — isso fica com você, no modo <b>Cunhar</b> do Mercado.</div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Vai da aldeia mais perto pra mais longe, <b>parando no limite de viagem do modelo</b> — aldeia que não alcança o alvo nem é considerada, porque o nobre formado lá nunca seria usado. A que não conseguir agora (moeda, recurso, fila) <b>não interrompe</b>: tenta a próxima. O nobre formado entra na fila da Academia, então só aparece no plano do ciclo seguinte.</div>' +
            '<div class="twmgr-fld" style="margin-top:9px"><span title="Por padrão, se a leva sai incompleta E há nobre em produção, ele segura pra mandar tudo junto — porque a lealdade regenera entre uma chegada e outra. Ligado, manda o que estiver pronto agora e completa nos ciclos seguintes. NÃO há risco de excesso: o que falta é recalculado todo ciclo pela lealdade prevista, que já desconta os nobres voando.">Enviar parcial sempre <span style="color:#8a7d6d">(não esperar fechar a leva)</span></span>' +
              '<label class="twmgr-sw"><input id="twmgr-nb-parcial" type="checkbox"><i></i></label></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Some o "segurando: +N em produção". Em troca, se demorar muito entre um nobre e outro, a lealdade regenera no meio e o primeiro rende menos.</div>' +
            '<div class="twmgr-fld" style="margin-top:9px"><span title="Por padrão a fila é serial: o alvo da vez trava os de trás até a lealdade prevista dele chegar a zero, pra reservar o nobre que ainda vai sair da Academia. Ligado, todo alvo é planejado no mesmo ciclo e pega o que sobrou — a ordem da fila segue dando a primeira escolha. Útil quando os alvos estão em regiões diferentes e não disputam os mesmos nobres.">Planejar todos os alvos <span style="color:#8a7d6d">(não travar a fila)</span></span>' +
              '<label class="twmgr-sw"><input id="twmgr-nb-paralelo" type="checkbox"><i></i></label></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Desligado, alvo de outra região fica em <b>Aguardando</b> mesmo tendo nobre perto dele. Ligado, ele é planejado — e se não achar nobre, diz <b>sem nobres</b> em vez de esconder o motivo.</div>' +
          '</div>' +
        '</div>' +
        '</div>' +
        '<div id="twmgr-sub-cunhar" style="display:none">' +
          sec('Cunhar moeda de ouro',
            '<div class="twmgr-fld"><span title="Converte recurso em moeda — sem volta">Cunhar quando faltar nobre</span>' +
              '<label class="twmgr-sw"><input id="twmgr-nb-cunhar" type="checkbox"><i></i></label></div>' +
            '<div class="twmgr-fld"><span title="Teto máximo. O teto real é o menor entre este número e o que a aldeia da vez ainda precisa">Cunhar até fechar NT de</span><input id="twmgr-nb-cunhar-ate" class="twmgr-inp" type="number" min="1" max="8" value="4"></div>' +
            '<div class="twmgr-fld"><span title="Trava de gasto: quantas aldeias podem cunhar num mesmo ciclo">Cunhar em até (aldeias/ciclo)</span><input id="twmgr-nb-cunhar-n" class="twmgr-inp" type="number" min="1" max="12" value="3"></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:7px"><b>Desligado por padrão</b>, e de propósito: cunhar converte recurso em moeda <b>sem volta</b>, num alvo que pode nem sair.</div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Ligado, ele cunha nas aldeias mais perto do alvo e <b>para</b> no menor entre o NT acima e <b>o que a aldeia da vez ainda precisa</b> — contando o que a origem tem <b>mais o que está na fila</b> da Academia. Se falta 1 nobre, cunha pra 1: moeda não tem volta.</div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">O modo <b>Cunhar</b> do Mercado continua existindo e é independente deste — aquele cunha sempre, este só quando falta nobre pro alvo.</div>') +
        '</div>' +
        '<div id="twmgr-sub-pos" style="display:none">' +
          sec('Quando a aldeia cair',
            '<div class="twmgr-fld"><span>Pôr num grupo automaticamente</span>' +
              '<label class="twmgr-sw"><input id="twmgr-nb-posgrupo" type="checkbox"><i></i></label></div>' +
            '<div class="twmgr-fld"><span>Grupo padrão</span><select id="twmgr-nb-posgid" class="twmgr-inp" style="flex:0 0 140px;width:140px"></select></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:7px">Só grupo <b>estático</b>. Grupo dinâmico é montado por regra e não aceita aldeia na mão — mandar pra lá falharia calado.</div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">A conquista é detectada pela <b>lealdade ≤ 0</b> no relatório, então depende de <b>Ler relatórios</b> estar ligado. Cada aldeia entra <b>uma vez</b> só.</div>' +
            '<div class="twmgr-fld" style="margin-top:11px"><span>Equipar bandeira</span>' +
              '<label class="twmgr-sw"><input id="twmgr-nb-posband" type="checkbox"><i></i></label></div>' +
            '<div class="twmgr-fld"><span>Bandeira padrão</span><span id="twmgr-nb-bandpad"></span></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:7px">A chamada é a mesma que o botão do jogo usa (<code>assign_flag</code>), só sem o diálogo. Se o jogo recusar (bandeira em uso, nível inexistente), o log diz o motivo e a aldeia continua na fila pro próximo ciclo.</div>') +
          sec('Por alvo',
            '<div id="twmgr-nb-poslista" class="twmgr-bld-vils"></div>' +
            '<div id="twmgr-nb-flagpick" style="display:none;margin-top:6px;background:#fdfaf4;border:1px solid #e8dfcc;border-radius:8px;padding:7px"></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:5px">Cada alvo pode ter o seu. Linha marcada como <b>padrão</b> herda o que está ali em cima — mexer nela desliga a herança <b>só daquele alvo</b>, sem afetar os outros.</div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Clique na bandeira da linha pra escolher — a grade mostra <b>só as que a conta tem</b>, com o efeito de cada uma.</div>') +
        '</div>' +
        '<div class="twmgr-actions"><button id="twmgr-nb-start" class="twmgr-btn twmgr-go">▶ Planejar</button><button id="twmgr-nb-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-nb-status" class="twmgr-cstatus"></div>' +
        modLog('noble') +
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
      '<div id="twmgr-tab-apoios" style="display:none">' +
        hint('🛡️ O jogo só mostra tropa fora agrupada por <b>origem</b> — "a aldeia 001 tem 1999 lanças fora". Nunca por <b>destino</b>. Esta tela inverte: uma linha por aldeia que você está apoiando, com o total somado; clique pra ver quais aldeias suas mandaram.') +
        sec('Apoios enviados',
          '<div class="twmgr-row">' +
            '<button id="twmgr-apoios-ler" class="twmgr-btn twmgr-ghost" style="padding:5px 12px">↻ Ler apoios</button>' +
            '<span id="twmgr-apoios-status" style="flex:1;font-size:10px;color:#8a7d6d;margin-left:8px"></span>' +
          '</div>' +
          '<div id="twmgr-apoios-corpo" style="margin-top:7px"></div>' +
          '<div style="font-size:9px;color:#8a7d6d;margin-top:7px">A leitura custa <b>uma requisição por aldeia com tropa fora</b> — por isso é sob demanda, e o resultado fica em cache por 5 minutos. As unidades saem do cabeçalho da tabela do jogo, então vale em qualquer mundo (o 143 tem 10, o 141 tem 12).</div>') +
        modLog('apoios') +
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
    wallRenderRelatorio();   // mostra o relatório do último ciclo já salvo, sem esperar um novo

    document.getElementById('twmgr-r-hours').value = config.recruit.targetHours != null ? config.recruit.targetHours : 2;
    document.getElementById('twmgr-r-refill').value = config.recruit.refillBelowMin != null ? config.recruit.refillBelowMin : 30;
    // ---- Modelos ----
    rcFillTplSelects();
    rcRenderEditor();
    document.getElementById('twmgr-rc-tpl').addEventListener('change', (e) => rcSwitchTpl(e.target.value));
    document.getElementById('twmgr-rc-tpl-new').addEventListener('click', rcNovoModelo);
    document.getElementById('twmgr-rc-tpl-ren').addEventListener('click', rcRenomearModelo);
    document.getElementById('twmgr-rc-tpl-del').addEventListener('click', rcApagarModelo);
    // O editor é redesenhado a cada troca de modelo, então o listener fica no pai.
    document.getElementById('twmgr-rc-editor').addEventListener('change', (e) => {
      rcLerEditor(); save();
      // Trocar fixo⇄receita muda os CAMPOS (alvo vira peso, e aparece o "encher até %"), então
      // o editor tem que ser redesenhado. rcLerEditor já rodou acima e guardou o que estava na
      // tela no bucket do modo ANTIGO, então nada se perde ao alternar.
      if (e.target && e.target.id === 'twmgr-rc-modo') rcRenderEditor();
    });
    // População do modelo atualiza a cada tecla — não espera o blur/change pra recalcular.
    document.getElementById('twmgr-rc-editor').addEventListener('input', rcAtualizarPop);
    // ---- Status ----
    document.getElementById('twmgr-rc-stgroup').addEventListener('change', (e) => rcStatusFiltrar(e.target.value));
    document.getElementById('twmgr-rc-status-reload').addEventListener('click', rcAtualizarStatus);
    rcRenderStatus();
    fillGroupSelects();
    document.getElementById('twmgr-r-start').addEventListener('click', recruitStart);
    document.getElementById('twmgr-r-stop').addEventListener('click', recruitStop);
    document.getElementById('twmgr-r-diag').addEventListener('click', runRecruitDiag);
    ['twmgr-r-hours', 'twmgr-r-refill'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readRecruitCfg); });
    setRecruitStatus(config.recruit.running);

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
    document.getElementById('twmgr-mk-pwood').value = config.market.cunhagemPesoWood != null ? config.market.cunhagemPesoWood : 28000;
    document.getElementById('twmgr-mk-pstone').value = config.market.cunhagemPesoStone != null ? config.market.cunhagemPesoStone : 30000;
    document.getElementById('twmgr-mk-piron').value = config.market.cunhagemPesoIron != null ? config.market.cunhagemPesoIron : 25000;
    document.getElementById('twmgr-mk-automint').checked = !!config.market.autoMint;
    document.getElementById('twmgr-mk-stopon').checked = !!config.market.cunhagemStopEnabled;
    document.getElementById('twmgr-mk-stophours').value = config.market.cunhagemStopHours != null ? config.market.cunhagemStopHours : 2;
    document.getElementById('twmgr-mk-cunhagem-coins').textContent = '🪙 Total cunhado: ' + fmtN(config.market.modes.cunhagem.totalCoins || 0) + ' moeda(s)';
    document.getElementById('twmgr-mk-int').value = Math.round((config.market.interval || 600) / 60);
    document.getElementById('twmgr-mk-thr').value = config.market.thresholdPct != null ? config.market.thresholdPct : 50;
    document.getElementById('twmgr-mk-alvoauto').checked = !!config.market.alvoAuto;
    // O campo de limiar fixo fica inerte no automático — deixar ele editável sugeriria que o
    // número ainda manda em alguma coisa.
    const aplicarAlvoAuto = () => {
      const on = document.getElementById('twmgr-mk-alvoauto').checked;
      const thr = document.getElementById('twmgr-mk-thr');
      if (thr) { thr.disabled = on; thr.style.opacity = on ? '.4' : '1'; }
    };
    document.getElementById('twmgr-mk-alvoauto').addEventListener('change', aplicarAlvoAuto);
    aplicarAlvoAuto();
    document.getElementById('twmgr-mk-dist').value = config.market.maxDist != null ? config.market.maxDist : 15;
    document.getElementById('twmgr-mk-sthr').value = config.market.solidarioThresholdPct != null ? config.market.solidarioThresholdPct : 50;
    document.getElementById('twmgr-mk-sdonormin').value = config.market.solidarioDonorMinPct != null ? config.market.solidarioDonorMinPct : 50;
    document.getElementById('twmgr-mk-sdonor').value = config.market.solidarioDonorPct != null ? config.market.solidarioDonorPct : 50;
    document.getElementById('twmgr-mk-sgargalo').value = config.market.solidarioGargaloKeepPct != null ? config.market.solidarioGargaloKeepPct : 90;
    document.getElementById('twmgr-mk-sdist').value = config.market.solidarioMaxDist != null ? config.market.solidarioMaxDist : 20;
    renderMarketCunhagemGroups();
    fillMarketSolidarioGroupSelect();
    ['twmgr-mk-destcoords', 'twmgr-mk-rwood', 'twmgr-mk-rstone', 'twmgr-mk-riron', 'twmgr-mk-pwood', 'twmgr-mk-pstone', 'twmgr-mk-piron', 'twmgr-mk-automint', 'twmgr-mk-stopon', 'twmgr-mk-stophours', 'twmgr-mk-int', 'twmgr-mk-alvoauto', 'twmgr-mk-thr', 'twmgr-mk-dist', 'twmgr-mk-sthr', 'twmgr-mk-sdonormin', 'twmgr-mk-sdonor', 'twmgr-mk-sgargalo', 'twmgr-mk-sdist', 'twmgr-mk-g-solid'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readMarketCfg); });
    // Cada modo tem seu próprio par Iniciar/Parar — rodam independentes, pode ligar vários ao mesmo tempo.
    MARKET_MODES.forEach((mkKey) => {
      document.getElementById('twmgr-mk-' + mkKey + '-start').addEventListener('click', () => marketStart(mkKey));
      document.getElementById('twmgr-mk-' + mkKey + '-stop').addEventListener('click', () => marketStop(mkKey));
      setMarketStatus(mkKey, config.market.modes[mkKey].running);
    });
    document.getElementById('twmgr-mk-eq-diag').addEventListener('click', equilibrioDiagnostico);
    equilibrioRenderSaude();   // mostra o diagnóstico salvo da última vez, sem esperar um novo

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
    // O modelo é amarrado ao GRUPO: mudar aqui muda quem o ciclo atende no próximo tick.
    document.getElementById('twmgr-bld-tplsel').addEventListener('change', (e) => bldSwitchProf(e.target.value));
    document.getElementById('twmgr-bld-tplgrp').addEventListener('change', (e) => {
      const t = config.build.templates[_bldActiveProf];
      if (!t) {
        // Sem modelo escolhido nao ha onde gravar o grupo. Antes isso falhava CALADO e parecia
        // que o painel tinha ignorado o clique.
        alert('Escolha um modelo primeiro — o grupo é gravado no modelo.');
        e.target.value = '';
        return;
      }
      t.grupo = e.target.value || '';
      save();
      pushLog('Construções: modelo "' + (t.name || _bldActiveProf) + '" '
        + (t.grupo ? 'aplicado ao grupo selecionado.' : 'desamarrado do grupo.'), 'ok', 'build');
    });
    document.getElementById('twmgr-bld-stgroup').addEventListener('change', (e) => bldStatusFiltrar(e.target.value));
    document.getElementById('twmgr-bld-st-reload').addEventListener('click', bldAtualizarStatus);
    document.getElementById('twmgr-bld-demolir').checked = !!config.build.demolir;
    document.getElementById('twmgr-bld-demolir').addEventListener('change', (e) => {
      config.build.demolir = e.target.checked; save();
      if (e.target.checked) pushLog('Construções: demolição de excedente LIGADA — só age em aldeia já completa, 1 nível por ciclo.', '', 'build');
    });
    bindBuildPlanHandlers();
    bldRenderTplSelect();
    bldSwitchProf(_bldActiveProf);
    fillBldTplGrupo();
    bldRenderStatus();
    // ---- Pesquisa ----
    document.getElementById('twmgr-pq-tpl').addEventListener('change', (e) => pesqSwitchTpl(e.target.value));
    document.getElementById('twmgr-pq-tpl-new').addEventListener('click', pesqNovoModelo);
    document.getElementById('twmgr-pq-tpl-ren').addEventListener('click', pesqRenomearModelo);
    document.getElementById('twmgr-pq-tpl-del').addEventListener('click', pesqApagarModelo);
    document.getElementById('twmgr-pq-add-btn').addEventListener('click', pesqAddUnidade);
    document.getElementById('twmgr-pq-reset').addEventListener('click', pesqResetOrdem);
    document.getElementById('twmgr-pq-group').addEventListener('change', (e) => { config.research.filterGroup = e.target.value; save(); pesqCarregarAldeias(); fillPesqGrupoTpl(); });
    document.getElementById('twmgr-pq-seguir').checked = !!config.research.seguirGrupo;
    document.getElementById('twmgr-pq-seguir').addEventListener('change', (e) => { config.research.seguirGrupo = e.target.checked; save(); });
    document.getElementById('twmgr-pq-grptpl').addEventListener('change', (e) => { config.research.grupoTpl = e.target.value; save(); });
    fillPesqGrupoTpl();
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
    // ---- Noblar ----
    document.getElementById('twmgr-nb-add').addEventListener('click', nobleAddCoords);
    document.getElementById('twmgr-nb-coords').addEventListener('input', nobleContarCoords);
    // Chips: um listener no pai, porque eles sao redesenhados a cada mudanca de modelo.
    document.getElementById('twmgr-nb-chips').addEventListener('click', (e) => {
      const el = e.target.closest ? e.target.closest('.twmgr-chip') : null;
      if (!el) return;
      if (el.classList.contains('twmgr-chip-add')) nobleNovoModelo();
      else nobleSwitchTpl(el.getAttribute('data-id'));
    });
    document.getElementById('twmgr-nb-tpl-ren').addEventListener('click', nobleRenomearModelo);
    document.getElementById('twmgr-nb-tpl-up').addEventListener('click', () => nobleMoverModelo(-1));
    document.getElementById('twmgr-nb-tpl-dn').addEventListener('click', () => nobleMoverModelo(1));
    document.getElementById('twmgr-nb-tpl-del').addEventListener('click', nobleApagarModelo);
    nobleFillTplSel(); nobleRenderTplEditor();
    // A grade de escolta e redesenhada a cada troca de modelo, entao o listener fica no PAI:
    // amarrar em cada input morreria no proximo render.
    document.getElementById('twmgr-nb-esc').addEventListener('change', () => { nobleLerTplEditor(); save(); });
    document.getElementById('twmgr-nb-int').value = Math.round((config.noble.interval || 900) / 60);
    document.getElementById('twmgr-nb-rel').checked = config.noble.lerRelatorios !== false;
    document.getElementById('twmgr-nb-auto').checked = config.noble.autoEnviar !== false;
    document.getElementById('twmgr-nb-automax').value = config.noble.autoMax != null ? config.noble.autoMax : 8;
    document.getElementById('twmgr-nb-lpa').value = config.noble.lealdadePorAtk != null ? config.noble.lealdadePorAtk : 25;
    document.getElementById('twmgr-nb-regen').value = config.noble.lealdadeRegen != null ? config.noble.lealdadeRegen : 1;
    document.getElementById('twmgr-nb-cunhar').checked = !!config.noble.cunhar;
    document.getElementById('twmgr-nb-cunhar-ate').value = config.noble.cunharAte != null ? config.noble.cunharAte : 4;
    document.getElementById('twmgr-nb-cunhar-n').value = config.noble.cunharMaxAldeias != null ? config.noble.cunharMaxAldeias : 3;
    document.getElementById('twmgr-nb-posgrupo').checked = !!config.noble.posGrupo;
    document.getElementById('twmgr-nb-posband').checked = !!config.noble.posBandeira;


    fillNobleGrupos();
    bindNoblePosHandlers();
    bindApoiosHandlers();
    renderNoblePos();


    document.getElementById('twmgr-nb-prod').checked = config.noble.produzir !== false;
    document.getElementById('twmgr-nb-paralelo').checked = !!config.noble.paralelo;
    document.getElementById('twmgr-nb-parcial').checked = !!config.noble.parcialSempre;
    ['twmgr-nb-nob', 'twmgr-nb-horas', 'twmgr-nb-nt', 'twmgr-nb-int', 'twmgr-nb-prod', 'twmgr-nb-rel',
     'twmgr-nb-auto', 'twmgr-nb-automax', 'twmgr-nb-lpa', 'twmgr-nb-regen', 'twmgr-nb-paralelo', 'twmgr-nb-parcial',
     'twmgr-nb-cunhar', 'twmgr-nb-cunhar-ate', 'twmgr-nb-cunhar-n', 'twmgr-nb-posgrupo', 'twmgr-nb-posgid',
     'twmgr-nb-posband'].forEach((id) => {
      const el = document.getElementById(id); if (el) el.addEventListener('change', readNobleCfg);
    });
    bindNobleHandlers();
    renderNoblePlano();
    document.getElementById('twmgr-nb-start').addEventListener('click', nobleStart);
    document.getElementById('twmgr-nb-stop').addEventListener('click', nobleStop);
    setNobleStatus(config.noble.running);

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
    document.getElementById('twmgr-bld-fechar-tpl').addEventListener('click', () => { fechaTela('twmgr-tela-tpl-build'); bldRenderTplSelect(); fillBldTplGrupo(); bldRenderStatus(); });
    document.getElementById('twmgr-pq-abrir-tpl').addEventListener('click', () => abreTela('twmgr-tela-tpl-pq'));
    document.getElementById('twmgr-pq-fechar-tpl').addEventListener('click', () => { fechaTela('twmgr-tela-tpl-pq'); renderResearchVillages(); });
    document.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => {
      const p = (b.getAttribute('data-sub') || '').split(':');
      showSub(p[0], p[1]);
    }));
    showSub('noble', (function () {
      try { return localStorage.getItem(FARM_SUB_KEY + '_noble') || 'alvos'; } catch (e) { return 'alvos'; }
    })());
    showSub('market', (function () {
      try { return localStorage.getItem(FARM_SUB_KEY + '_market') || 'cunhagem'; } catch (e) { return 'cunhagem'; }
    })());

    // Toggle expandir/recolher o log por módulo
    document.querySelectorAll('.twmgr-modlog-head').forEach((h) => h.addEventListener('click', () => {
      const mod = h.getAttribute('data-modlog'); const body = document.getElementById('twmgr-modlog-body-' + mod); if (!body) return;
      const open = body.style.display !== 'none'; body.style.display = open ? 'none' : 'block';
      h.textContent = ''; h.insertAdjacentHTML('beforeend', (open ? '▸' : '▾') + ' Log do módulo (<span id="twmgr-modlog-count-' + mod + '">0</span>)');
      renderModLog(mod);
    }));
    // Cards + logs por módulo no estado inicial (dados salvos do último ciclo)
    ['scav', 'farm', 'wall', 'recruit', 'market', 'build', 'research', 'noble', 'lock', 'paladin', 'etiqueta', 'obra'].forEach((m) => { refreshCards(m); renderModLog(m); });
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
    if (config.noble && config.noble.running) { rlog('Noblar retomado.', 'noble'); retomar(scheduleNoble); }
    if (config.map && config.map.running) { rlog('Mapa retomado.', 'map'); retomar(scheduleMap); }
    if (config.etiqueta && config.etiqueta.running) { rlog('🏷️ Etiqueta retomada.', 'etiqueta'); retomar(etiquetaTick); }
    if (config.lock && config.lock.running) { rlog('🔒 Cadeado retomado.', 'lock'); retomar(scheduleLock); }
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

