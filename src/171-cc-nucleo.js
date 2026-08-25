  // ==================== CENTRO DE COMANDO (rico — port da v9.39.0, ilha isolada) ====================
  // Portado da branch centro-de-comando. Embrulhado na propria IIFE pra os ~465 nomes internos
  // (cc*/cmd*, motor de precisao, silencio, tempo de viagem) NAO colidirem com o Centro de
  // Comando novo (cc*) do v11. Fecha sobre os helpers do v11 (serverNow, save, pushLog, esc,
  // getAllVillages, fakePrepare, fieldDist, getMapVillages, UNITS, config, IMG_BASE...).
  // Traz copia so do que o v11 nao tem: FREEZEKEY, NETLAT, defCmd, MODELOS_PADRAO, srvClockMs,
  // netProbe. Estado proprio em config.cmd (coexiste com config.cc do v11).
  // SPLIT v11.224.0: esta IIFE ABRE aqui e FECHA em 177-cc-painel.js.
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
      filaTipoFiltro: '',     // filtro de exibição da fila: '' (todos) | 'ataque' | 'apoio' | 'fake' | 'nobre'
      filaAlvoFiltro: '',     // filtro por alvo: casa contra a coordenada OU o nome da aldeia
      enviarParcial: false,   // padrão geral: manda o que tiver disponível em vez de falhar por tropa insuficiente
      passoMs: 50,            // passo dos botões de ajuste fino na fila
      modelos: null,          // modelos de tropa do usuário (null = ainda não semeado)
      fechados: {},           // seções recolhidas do painel (ele fica alto demais com tudo aberto)
      saidaJa: false,        // 'sair o quanto antes': ignora o campo de chegada e sai agora
      snipeFolgaMs: 150,      // quanto DEPOIS do ataque o apoio pousa (margem de segurança)
      blz: defBlz(),          // blindagem da tribo (pedidos do tópico do fórum)
    });
    // ---- Blindagem: estado ----
    // `reserva` é por ALDEIA e em número absoluto: o que NUNCA sai de casa. Sem isso a divisão
    // esvazia justamente a aldeia que está segurando a própria linha.
    const defBlz = () => ({
      url: '',                // tópico da tribo (fica salvo; a tabela muda, a URL não)
      pedidos: [],            // [{num, nome, coord, x, y, pede:{spear,sword,heavy}}]
      entregas: [],           // [{num, autor, at, posEdicao, spear, sword, heavy}] — dos comentários
      editadoEm: 0,           // quando a tabela foi editada pela última vez (corta as entregas velhas)
      lidoEm: 0,
      reserva: { spear: 0, sword: 0, heavy: 0 },
      // Quanto cada aldeia entrega no TOTAL da rodada, por unidade. Número absoluto; vazio = tudo.
      porAldeia: { spear: '', sword: '', heavy: '' },
      alvosSel: {},           // { pedidoNum: true } — seleção EXPLÍCITA, semeada com todos na busca
      plano: {},              // { pedidoNum: { vid: {spear,sword,heavy} } } — o que VOCÊ vai mandar
      enviados: {},           // { pedidoNum: { vid: at } } — trava anti-reenvio
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
        if (c.cmd.saidaJa == null) c.cmd.saidaJa = false;
        if (!c.cmd.blz || typeof c.cmd.blz !== 'object') c.cmd.blz = defBlz();
        if (typeof c.cmd.blz.url !== 'string') c.cmd.blz.url = '';
        if (!Array.isArray(c.cmd.blz.pedidos)) c.cmd.blz.pedidos = [];
        if (!Array.isArray(c.cmd.blz.entregas)) c.cmd.blz.entregas = [];
        if (!c.cmd.blz.reserva) c.cmd.blz.reserva = { spear: 0, sword: 0, heavy: 0 };
        if (!c.cmd.blz.porAldeia) c.cmd.blz.porAldeia = { spear: '', sword: '', heavy: '' };
        if (!c.cmd.blz.alvosSel || typeof c.cmd.blz.alvosSel !== 'object') c.cmd.blz.alvosSel = {};
        if (!c.cmd.blz.plano || typeof c.cmd.blz.plano !== 'object') c.cmd.blz.plano = {};
        if (!c.cmd.blz.enviados || typeof c.cmd.blz.enviados !== 'object') c.cmd.blz.enviados = {};
        if (!c.cmd.origens) c.cmd.origens = {};
        if (!c.cmd.fonteTropa) c.cmd.fonteTropa = 'casa';
        if (c.cmd.fakeAlvos == null) c.cmd.fakeAlvos = '';
        if (!c.cmd.fakeDist) c.cmd.fakeDist = 'rodizio';
        if (!c.cmd.tipo) c.cmd.tipo = 'attack';
        if (!Array.isArray(c.cmd.ondas)) c.cmd.ondas = [];
        if (!c.cmd.filaOrdem) c.cmd.filaOrdem = 'chegada';
        if (c.cmd.filaTipoFiltro == null) c.cmd.filaTipoFiltro = '';
        if (c.cmd.filaAlvoFiltro == null) c.cmd.filaAlvoFiltro = '';
        if (c.cmd.enviarParcial == null) c.cmd.enviarParcial = false;
        if (c.cmd.passoMs == null) c.cmd.passoMs = 50;
        if (!Array.isArray(c.cmd.modelos)) c.cmd.modelos = MODELOS_PADRAO();
        if (!c.cmd.fechados) c.cmd.fechados = {};
        // A Fila entra recolhida SEMPRE (não só na primeira vez): é uma lista longa, que muda
        // sozinha a cada segundo e puxa a atenção do que importa acima dela. Um clique no
        // título abre quando você quiser olhar.
        c.cmd.fechados.fila = true;
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
      // SEM `rttMin/2`. Ele era um MODELO da ida, e o modelo não corresponde ao real: a sonda
      // HEAD estimava 85ms contra ~184ms medidos num POST de verdade na praça. O motor `cc` já
      // tirou este termo da conta por isso. Pior que impreciso, ele BRIGA com o viés — os dois
      // corrigem a mesma coisa, e a soma passa do alvo.
      //
      // E existe um erro que modelo de rede nenhum enxerga: o relógio de referência é o Timing
      // do jogo, calibrado na resposta do carregamento de PÁGINA, que pode estar dezenas ou
      // centenas de ms adiantado do relógio real do servidor. Foi o que apareceu no uso real —
      // lead de 180ms e chegada 200ms ADIANTADA, aritmética que só fecha com o relógio à frente.
      // Só a chegada publicada pelo jogo revela isso, e é o que o viés aprende.
      //
      // Então o viés carrega tudo: latência de ida e desvio de relógio juntos. Com `calib.n = 0`
      // o lead é ZERO — sai na hora pedida, e a primeira medição ensina o resto.
      const bias = (config.cmd && config.cmd.calib && config.cmd.calib.biasMs) || 0;
      const lead = bias + (ajusteManualMs || 0);
      // O piso era 0, e isso PROIBIA o viés de atrasar o disparo. Comando chegando adiantado
      // precisa de correção negativa — o laço não tinha como consertar esse caso nem medindo
      // certo. Agora vale nos dois sentidos, com o mesmo teto de 3s de cada lado.
      return sendAtSrvMs - Math.max(-3000, Math.min(lead, 3000));
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
    // `trem` = ondas EXTRA que saem no mesmo POST, usando o recurso nativo "Adicionar ataque
    // adicional" do jogo (o mesmo que a UI mostra quando a composição leva nobre).
    //
    // Mapeado na tela real: as ondas extras vão como train[N][unidade], indexadas A PARTIR DE 2
    // (a onda 1 é o ataque base, nos campos normais). O jogo monta essas linhas no cliente e
    // manda tudo num POST só — então o servidor aceita campos train[] que não existiam no
    // "confirmar", que é exatamente o que fazemos aqui.
    //
    // Por que importa: com um comando por onda, cada "confirmar" enxerga o estoque CHEIO, os
    // pedidos somados passam do que a aldeia tem e o servidor recusa as ondas que chegam depois.
    // Num POST só o jogo aloca as N ondas de uma vez — some a corrida por tropa, e o espaçamento
    // entre elas passa a ser o do servidor (o mínimo, que é o que um trem de nobre quer).
    async function cmdPrepare(vid, x, y, amounts, tipo, trem) {
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
      // ATENÇÃO (medido ao vivo contra o servidor, não deduzido): quando o jogo RECUSA o comando,
      // ele responde com a tela da praça re-renderizada — que tem o MESMO #command-data-form da
      // página de confirmação. Ou seja: achar o form não prova nada, e era exatamente isso que
      // fazia o erro real passar batido e virar "servidor não devolveu a duração" lá na frente.
      // O que SÓ existe na confirmação de verdade é o botão submit_confirm (e o data-duration);
      // na tela da praça o que há são os dois submits attack/support e os inputs de digitar tropa.
      // O motivo real da recusa vem em .error_box — classe que o seletor antigo (.error) não
      // pegava, porque são classes diferentes.
      const form = doc.querySelector('#command-data-form') || doc.querySelector('form[action*="action=command"]');
      const confirmou = !!(form && (form.querySelector('[name="submit_confirm"]') || doc.querySelector('[data-duration]')));
      if (!confirmou) {
        const errEl = doc.querySelector('.error_box, .error, .autoHideBox, #command_confirmation_error');
        const motivo = errEl ? errEl.textContent.replace(/\s+/g, ' ').trim().slice(0, 150) : null;
        throw new Error(motivo || (form ? 'o servidor recusou o comando (sem motivo informado na resposta)' : 'confirmação falhou (tropa/alvo)'));
      }
      let dur = null;
      const dd = doc.querySelector('[data-duration]');
      if (dd) dur = parseInt(dd.getAttribute('data-duration'), 10);
      if (!dur) {
        const txt = (doc.body ? doc.body.textContent : t1).replace(/\s+/g, ' ');
        const m = txt.match(/dura[çc][aã]o[^0-9]{0,60}(\d{1,3}):([0-5]\d):([0-5]\d)/i);
        if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
      }
      if (!dur) {
        const cels = Array.prototype.slice.call(form.querySelectorAll('td, th, span, div'));
        for (const el of cels) {
          const mm = (el.textContent || '').trim().match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
          if (mm) { dur = (+mm[1]) * 3600 + (+mm[2]) * 60 + (+mm[3]); break; }
        }
      }
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
      // Ondas extras do trem, no formato do jogo. Índice começa em 2 porque a 1 é o ataque base.
      (trem || []).forEach((am, i) => {
        Object.keys(am || {}).forEach((u) => {
          const q = parseInt(am[u], 10) || 0;
          if (q > 0) params['train[' + (i + 2) + '][' + u + ']'] = String(q);
        });
      });
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
      // Checagem estrutural (erroDeComando, em 050-envio.js): o texto exato da recusa varia, e
      // confiar numa frase específica fazia comando sumir marcado como "enviado".
      const err = erroDeComando(t2);
      if (err) throw new Error(err);
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
        // Envio parcial: manda o que tiver na origem em vez de falhar quando a quantidade
        // digitada não cabe mais. c.parcial null = segue o padrão geral; true/false força só
        // este comando. Precisa clampar ANTES do cmdPrepare — é o confirmar que fixa os números
        // que vão de fato pro disparo (c.prep), então ajustar depois seria tarde demais.
        const parcial = ccParcialEfetivo(c);
        let amounts = c.amounts;
        if (parcial) {
          let avail = null;
          try { avail = (await getVillageState(c.origin)).avail || {}; } catch (e) { avail = null; }
          if (avail) {
            // Aloca ONDA A ONDA, na ordem em que saem: a 1ª pega o que pediu (até o que existe),
            // a 2ª fica com o que sobrou, e assim por diante — é o que aconteceria mandando na
            // mão. Vale também pro trem: cortar as ondas do fim é melhor que o servidor recusar
            // o envio inteiro, que é o que acontecia quando o trem ficava fora do modo parcial.
            const resta = Object.assign({}, avail);
            const ondas = [amounts].concat(c.trem || []);
            let reduziu = false;
            const cortadas = ondas.map((am) => {
              const out = {};
              Object.keys(am || {}).forEach((u) => {
                const pedido = am[u] || 0; if (pedido <= 0) return;
                const v = Math.min(pedido, Math.max(0, resta[u] || 0));
                if (v > 0) out[u] = v;
                if (v < pedido) reduziu = true;
                resta[u] = (resta[u] || 0) - v;
              });
              return out;
            }).filter((am) => Object.keys(am).length);   // onda que ficou sem nada sai do trem
            if (!cortadas.length) { cmdFalha(c, 'pulado: sem tropa disponível na origem (modo parcial)'); return false; }
            const perdidas = ondas.length - cortadas.length;
            if (reduziu || perdidas) {
              pushLog('Central: ' + c.x + '|' + c.y + ' — modo parcial ajustou a tropa ao que a aldeia tem' +
                (perdidas ? ' · ' + perdidas + ' onda(s) removida(s) por ficarem sem tropa' : '') +
                (ondas.length > 1 ? ' (trem: ' + ondas.length + ' → ' + cortadas.length + ' ondas)' : ''), '', 'cmd');
              amounts = cortadas[0]; c.amounts = amounts;
              c.trem = (cortadas.length > 1) ? cortadas.slice(1) : null;
              save();
            }
          }
        }
        // Rede de segurança do piso de população (1% dos pontos da origem — regra real do mundo,
        // e a recusa mais comum: "A força de ataque precisa do mínimo de N habitantes"). A aba
        // Fake já aplica isto ao ARMAR, mas ali o piso é calculado com a tropa/pontos daquele
        // instante e some silenciosamente se village.txt falhar — então ataque armado por outro
        // caminho (Operação, Ataque avulso) chegava aqui sem proteção nenhuma. Completar com
        // EXPLORADOR é seguro pro timing: spy é a unidade mais rápida, então nunca atrasa um
        // comando que já leva qualquer outra tropa. Só vale pra ataque (apoio não tem piso).
        if (!ehApoio) {
          try {
            const pontos = await getVillagePoints();
            const pts = parseInt(pontos[String(c.origin)], 10) || 0;
            const minPop = pts > 0 ? Math.ceil((FAKE_LIMIT_PCT / 100) * pts) : 0;
            if (minPop > 0) {
              // Cada onda do trem é um ATAQUE separado pro servidor, então o piso vale pra CADA
              // uma — não pra soma. Por isso a checagem roda onda a onda, e o explorador extra
              // sai do estoque que ainda não foi comprometido pelas ondas anteriores.
              let sobraSpy = null;
              try { sobraSpy = ((await getVillageState(c.origin)).avail || {}).spy || 0; } catch (e) { sobraSpy = null; }
              const ondas = [amounts].concat(c.trem || []);
              let mexeu = false, semSpy = 0;
              const ajustadas = ondas.map((am) => {
                if (Object.keys(am || {}).every((u) => u === 'spy')) return am;   // só-explorador é isento
                const falta = minPop - ccFakePopOf(am);
                if (falta <= 0) { if (sobraSpy != null) sobraSpy -= (am.spy || 0); return am; }
                const extra = Math.ceil(falta / (FAKE_POP.spy || 2));
                const precisa = (am.spy || 0) + extra;
                if (sobraSpy == null || sobraSpy >= precisa) {
                  if (sobraSpy != null) sobraSpy -= precisa;
                  mexeu = true;
                  return Object.assign({}, am, { spy: precisa });
                }
                semSpy++; if (sobraSpy != null) sobraSpy -= (am.spy || 0);
                return am;
              });
              if (mexeu) {
                amounts = ajustadas[0];
                c.amounts = amounts;
                if (c.trem) c.trem = ajustadas.slice(1);
                save();
                pushLog('Central: ' + c.x + '|' + c.y + ' — onda(s) completadas com explorador pro piso de população (' + minPop + ' hab.).', '', 'cmd');
              }
              if (semSpy) pushLog('⚠ ' + c.x + '|' + c.y + ': ' + semSpy + ' onda(s) abaixo do piso de ' + minPop + ' hab. e sem explorador pra completar — o servidor deve recusar.', 'err', 'cmd');
            }
          } catch (e) { /* sem pontos (village.txt falhou): segue e deixa o servidor decidir */ }
        }
        const p = await cmdPrepare(c.origin, c.x, c.y, amounts, ehApoio ? 'support' : 'attack', c.trem);
        ancorar();                                    // reancora o relógio junto do preparo
        const est = ccEstimaDeComando(c);
        // Se o servidor confirmou mas não deu a duração, NÃO derruba o comando: cai na estimativa
        // local (a mesma que a UI já mostra antes do preparo). Um comando saindo com timing
        // aproximado é muito melhor que um comando que simplesmente não sai — ainda mais no meio
        // de uma operação. Só falha de vez se não houver nem estimativa (origem sem coordenada).
        let estimado = false;
        if (!p.dur) {
          if (est == null) throw new Error('servidor não devolveu a duração e não há estimativa local (origem sem coordenada?)');
          p.dur = Math.round(est / 1000);
          estimado = true;
          pushLog('⚠ ' + c.x + '|' + c.y + ': servidor não devolveu a duração — usando estimativa local (' + fmt(est) + '). O horário pode variar alguns segundos.', 'err', 'cmd');
        }
        // O servidor é a verdade. Se a estimativa local divergir, corrige o fator do mundo —
        // assim a UI para de mentir mesmo que /interface.php tenha falhado. Não vale quando a
        // própria duração VEIO da estimativa: comparar ela com ela mesma só zeraria o fator.
        if (est && p.dur && !estimado) {
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
      const tPost = performance.now();
      const voo = cmdFire(c.prep);
      c.state = 'enviado'; c.sentAt = saiuEm;
      // Cronometra o PRÓPRIO POST. Custo zero: ele acontece de qualquer jeito, e o `.then` não
      // segura a onda (o disparo já é fire-and-forget).
      //
      // É um candidato a preditor MELHOR que a sonda, e a razão é simples: a sonda mede um GET
      // de imagem estática (85ms), o disparo é um POST que o servidor processa (~184ms). São
      // caminhos diferentes, e a correlação medida com a sonda ficou em 0,55 no melhor caso —
      // não significativa com 8 amostras.
      //
      // O POST não pode prever o PRÓPRIO comando (só se sabe depois que ele voltou), mas pode
      // prever o PRÓXIMO — que é exatamente o que importa numa onda ou numa fila de comandos
      // agendados. Se `rttPost[n]` correlacionar com o erro de `[n+1]`, o lead passa a sair daí.
      voo.then(() => { c.rttPostMs = Math.round(performance.now() - tPost); save(); }).catch(() => {});
      c.desvioMs = Math.round(saiuEm - c.fireAt);
      // INSTRUMENTAÇÃO — testa a hipótese "dá pra prever o atraso com uma sonda antes".
      //
      // A sonda já roda no silenceOn, uns 10s antes; o valor só não era guardado. Guardando-o
      // junto do comando, depois de ~10 disparos dá pra correlacionar sonda × erro real e
      // decidir com dado. Se correlacionar, o lead passa a sair da sonda; se não, fica provado
      // que não dá — e a gente para de tentar.
      //
      // Já se sabe que a sonda NÃO explica o nível (85ms de sonda contra ~184ms de POST real):
      // ela mede um GET de imagem estática, o disparo é um POST que o servidor processa. O que
      // esta medição responde é outra coisa: ela acompanha a VARIAÇÃO? Dois comandos a 1 minuto
      // de distância deram -67 e +249ms de erro; se a sonda tiver subido junto, serve.
      c.netPre = {
        rttMin: Math.round(NETLAT.rttMin || 0), rttMed: Math.round(NETLAT.rttMed || 0),
        jitter: Math.round(NETLAT.jitter || 0),
        idadeMs: Math.round(Date.now() - (NETLAT.at || Date.now())),
      };
      const rot = c.ondas ? (' [onda ' + c.onda + '/' + c.ondas + ']') : '';
      pushLog('⚔ ' + (c.tipo === 'support' ? 'Apoio' : c.tipo === 'nobre' ? 'Nobre' : 'Ataque') + ' → ' + c.x + '|' + c.y + rot +
              ' · saiu ' + srvClockMs(saiuEm) + ' (desvio ' + (c.desvioMs >= 0 ? '+' : '') + c.desvioMs + 'ms)', 'ok', 'cmd');
      config.cmd.hist.unshift({ t: srvClockMs(saiuEm), alvo: c.x + '|' + c.y, tipo: c.tipo, desvio: c.desvioMs });
      config.cmd.hist = config.cmd.hist.slice(0, 50);
      save();
      // A medição é AGENDADA NO DISCO, não num setTimeout em memória.
      //
      // Antes era `setTimeout(() => ccMedir(c), 20000)` dentro do `.then`. Um timer de 20s
      // preso numa closure morre em tudo que acontece o tempo todo: F5, aba estrangulada em 2º
      // plano, e — o caso observado ao vivo — "Outra aba já está ativa; esta ficará em espera",
      // quando outra aba assume a trava e esta para de trabalhar. Não havia retry nem log: a
      // amostra sumia calada, e `calib.n` ficava em zero pra sempre.
      //
      // Agora só marca a hora e salva. Quem executa é a varredura do cmdTick, que roda em
      // qualquer aba viva e sobrevive a reload.
      c.medirApos = srvNowP() + 20000;
      save();
      voo.catch((e) => { cmdFalha(c, e.message || e); });
    }

    // Mede o erro REAL: lê a chegada que o jogo registrou e compara com a que pedimos.
    // O servidor carimba o comando quando PROCESSA o POST, então erroMs é exatamente o atraso
    // entre o nosso disparo e o processamento — sinal limpo, sem modelagem.
    // A chegada na página de detalhe vem no formato do LOCALE do jogo:
    //
    //     Chegada: ago. 08, 2026 20:31:30:331
    //
    // A regex antiga exigia `dd/mm/aaaa` colado no horário (`[^\d]{0,6}` entre os dois) e por
    // isso NUNCA casou nesta conta. Efeito: `calib.n` ficou em zero desde sempre e o motor rodou
    // o tempo todo com o lead do modelo, sem correção nenhuma — e em silêncio, porque a saída
    // era um `return` mudo. Descoberto lendo a página de verdade, não o código.
    //
    // Agora ancora na palavra "Chegada" e pega o horário COM milésimos logo depois. A data sai
    // do mesmo trecho, aceitando mês por extenso OU dd/mm/aaaa; sem nenhum dos dois, cai em
    // hoje/amanhã pelo horário, que é o que o resto do script já faz.
    const MESES_PT = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
    function parseChegadaDetalhe(texto) {
      const t = String(texto || '').replace(/\s+/g, ' ');
      const i = t.search(/Chegada\s*:/i);
      const trecho = i >= 0 ? t.slice(i, i + 140) : t;
      const mh = trecho.match(/(\d{1,2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/);
      if (!mh) return null;
      const ms = (mh[4] != null) ? +mh[4] : null;
      let Y = null, M = null, D = null;
      const mExt = trecho.match(/([a-zç]{3})\.?\s+(\d{1,2}),\s*(\d{4})/i);
      if (mExt && MESES_PT[mExt[1].toLowerCase()] != null) { M = MESES_PT[mExt[1].toLowerCase()]; D = +mExt[2]; Y = +mExt[3]; }
      const mBar = trecho.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (mBar) { D = +mBar[1]; M = +mBar[2] - 1; Y = +mBar[3]; }
      const agora = new Date();
      const semData = (Y == null);
      if (semData) { Y = agora.getFullYear(); M = agora.getMonth(); D = agora.getDate(); }
      let d = new Date(Y, M, D, +mh[1], +mh[2], +mh[3], ms || 0);
      // Sem data legível, chegada que "já passou" faz muito tempo é na verdade amanhã.
      if (semData && d.getTime() < agora.getTime() - 6 * 3600000) d = new Date(d.getTime() + 86400000);
      return { ms: d.getTime(), temMs: ms != null };
    }

    // Uma medição por tick. Só entra comando enviado, com a hora de medir vencida, ainda sem
    // resultado. `medTent` é o teto: comando cancelado no jogo nunca vai aparecer na praça, e sem
    // teto ele tentaria pra sempre a cada tick.
    let _medindo = false;
    function ccVarrerMedicoes() {
      if (_medindo) return;
      const agora = srvNowP();
      const alvo = cmdFila().find((c) => c.state === 'enviado' && c.medirApos && !c.medido
        && c.medirApos <= agora && (c.medTent || 0) < 5);
      if (!alvo) return;
      alvo.medTent = (alvo.medTent || 0) + 1;
      // Espaça a retentativa: 1 min por tentativa, pra um alvo teimoso não ocupar todo tick.
      alvo.medirApos = agora + 60000;
      save();
      _medindo = true;
      ccMedir(alvo).catch(() => {}).then(() => { _medindo = false; });
    }

    async function ccMedir(c) {
      try {
        const res = await fetch('/game.php?village=' + c.origin + '&screen=place', { credentials: 'include' });
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        // Casa por ORDEM, não pelo último que aparecer. O `forEach` antigo sobrescrevia `href` a
        // cada linha do mesmo alvo, então uma onda de 6 comandos pra uma coordenada media SEMPRE
        // a mesma linha — a última. A praça lista por chegada, e o servidor processa a conta em
        // fila: o i-ésimo enviado é o i-ésimo a chegar. Então o índice deste comando entre os
        // meus pro mesmo alvo é o índice da linha.
        const hrefs = [];
        doc.querySelectorAll('tr.command-row').forEach((tr) => {
          const lbl = tr.querySelector('.quickedit-label');
          const mc = lbl ? (lbl.textContent || '').match(/(\d{1,3})\|(\d{1,3})/) : null;
          if (!mc || mc[1] !== String(c.x) || mc[2] !== String(c.y)) return;
          const a = tr.querySelector('a[href*="screen=info_command"]');
          if (!a) return;
          // `data-endtime` é a chegada em segundos, na própria linha. Serve pra identificar qual
          // linha é qual sem abrir nada; a precisão de ms vem depois, só da linha escolhida.
          const et = tr.querySelector('span[data-endtime]');
          const seg = et ? parseInt(et.getAttribute('data-endtime'), 10) : 0;
          hrefs.push({ href: a.href, chega: seg ? seg * 1000 : 0 });
        });
        // IRMÃOS = só os que ainda PODEM estar na praça. A fila guarda todo comando enviado pra
        // sempre; a praça só mostra o que está voando. Comparar os dois inteiros fazia a
        // contagem nunca mais bater depois do primeiro comando pousar ou ser cancelado — e a
        // trava de ambiguidade recusava TODA medição, pra sempre. Foi o que apareceu ao vivo:
        //   "2 comando(s) na praça contra 6 na fila — medição recusada"
        // Os 4 velhos ja tinham chegado (ou foram cancelados), mas continuavam contando.
        //
        // Chegada no futuro e sem medição ainda: é exatamente o conjunto que a praça mostra.
        const agoraMed = srvNowP();
        const irmaos = cmdFila().filter((o) => o.origin === c.origin && String(o.x) === String(c.x)
          && String(o.y) === String(c.y) && o.state === 'enviado' && o.arriveAt
          && o.arriveAt > agoraMed && !o.medido)
          .sort((a, b) => a.arriveAt - b.arriveAt);
        let href = null;
        if (!hrefs.length) {
          pushLog('📏 ' + c.x + '|' + c.y + ': não achei o comando na praça pra medir. '
            + 'Ele saiu mesmo? A calibração automática fica parada até uma medição dar certo.', 'err', 'cmd');
          return;
        }
        // CASA POR TEMPO, não por contagem. A regra de contagem igual (v11.91) recusava sempre
        // que a fila e a praça divergiam — e elas divergem por um motivo banal e permanente:
        // comando CANCELADO no jogo some da praça mas fica na fila com chegada no futuro. Foi o
        // que apareceu ao vivo, "2 na praça contra 3 na fila", com o 3º sendo um cancelado.
        //
        // O `data-endtime` da própria linha dá a chegada em segundos — grosso pra medir, exato
        // de sobra pra IDENTIFICAR, já que os comandos aqui estão a minutos um do outro. Escolhe
        // a linha mais perto da chegada pedida, e só aceita se ELE for o dono mais próximo dela:
        // sem exclusividade, dois comandos casariam com a mesma linha (erro que já aconteceu no
        // motor `cc` e gerou aferições que eram aritmética de uma chegada só).
        const JANELA_CASA_MS = 5000;
        const ESPACO_SEGURO_MS = 30000;
        const dist = (o, l) => Math.abs(l.chega - o.arriveAt);
        // Espaçamento mínimo entre os irmãos decide QUAL modo usar.
        let espaco = Infinity;
        for (let i = 1; i < irmaos.length; i++) espaco = Math.min(espaco, irmaos[i].arriveAt - irmaos[i - 1].arriveAt);

        let melhor = null;
        if (espaco >= ESPACO_SEGURO_MS) {
          // COMANDOS FOLGADOS: casa pelo tempo. Comando cancelado simplesmente não acha par, em
          // vez de estragar a contagem de todo mundo.
          hrefs.forEach((l) => {
            if (dist(c, l) > JANELA_CASA_MS) return;
            if (irmaos.some((o) => o.id !== c.id && dist(o, l) < dist(c, l))) return;   // não é meu
            if (!melhor || dist(c, l) < dist(c, melhor)) melhor = l;
          });
          if (!melhor) {
            pushLog('📏 ' + c.x + '|' + c.y + ': nenhuma chegada na praça bate com a pedida ('
              + srvClockMs(c.arriveAt) + '). Cancelado, ou outra está mais perto dela.', '', 'cmd');
            return;
          }
        } else {
          // ONDA: casar por tempo aqui é matematicamente ambíguo. Simulado com espaçamento de
          // 100ms e erro de 85ms, o vizinho mais próximo casa TODO MUNDO deslocado de um — e
          // devolveria -15ms onde o erro real é +85ms. Medida errada é pior que medida nenhuma:
          // ela vira correção permanente no viés.
          //
          // Em onda vale a ordem (o servidor processa a conta em fila, o i-ésimo enviado é o
          // i-ésimo a chegar) e só com contagem igual. Diferente, recusa.
          if (hrefs.length !== irmaos.length) {
            pushLog('📏 ' + c.x + '|' + c.y + ': onda de ' + irmaos.length + ' comando(s) contra '
              + hrefs.length + ' na praça — em onda não dá pra casar por tempo. Medição recusada.', '', 'cmd');
            return;
          }
          const ordenadas = hrefs.slice().sort((a, b) => a.chega - b.chega);
          const idx = irmaos.findIndex((o) => o.id === c.id);
          melhor = (idx >= 0) ? ordenadas[idx] : null;
          if (!melhor) return;
        }
        href = melhor.href;
        const d2 = new DOMParser().parseFromString(await (await fetch(href, { credentials: 'include' })).text(), 'text/html');
        const p = parseChegadaDetalhe(d2.body.textContent || '');
        if (!p) {
          pushLog('📏 ' + c.x + '|' + c.y + ': abri o comando mas não achei a chegada na página. '
            + 'A calibração automática segue parada.', 'err', 'cmd');
          return;
        }
        const chegouEm = p.ms + wallToServerOffset();
        const erroMs = chegouEm - c.arriveAt;              // positivo = chegou atrasado

        // TETO DE PLAUSIBILIDADE. Acima disto não é latência, é medição errada — casou com o
        // comando errado, ou a página mudou de formato. Aprender com isso não degrada o viés
        // aos poucos: destrói de uma vez.
        //
        // Aconteceu de verdade (v11.96): o casamento caía num `hrefs[0]` quando a contagem não
        // batia, mediu -547929ms (NOVE MINUTOS) contra um comando alheio, e o viés saturou no
        // piso de -1500ms. Todo comando armado passou a sair 1,5s atrasado. O casamento foi
        // corrigido na v11.97, mas o estrago só foi possível porque nada conferia se o número
        // fazia sentido — o motor `cc` já tinha esse teto, este não tinha.
        //
        // Erros reais medidos nesta conta: +100, +71, -64ms. 3s é folga de trinta vezes.
        const TETO_PLAUSIVEL_MS = 3000;

        // GUARDA DE DERIVA. Se a MINHA escada soltou atrasada, o erro medido não fala da rede —
        // fala de mim, e aprender com ele envenena o estimador. O motor `cc` já tem esta guarda
        // (GUARDA_DERIVA_MS 50); este não tinha.
        //
        // Aconteceu ao vivo: `desvio 613ms` produziu `erro +828ms`, e o viés saltou de +24 pra
        // +207 num passo só — três quartos daquele erro eram contenção de thread, não latência.
        // Corrigir contenção com lead é impossível: no disparo seguinte, sem contenção, o lead
        // inflado vira erro pro outro lado. É como o viés começou a passear em vez de convergir.
        const DERIVA_MAX_MS = 50;
        if (Math.abs(c.desvioMs || 0) > DERIVA_MAX_MS) {
          pushLog('📏 ' + c.x + '|' + c.y + ': erro de ' + Math.round(erroMs) + 'ms NÃO entrou na '
            + 'calibração — minha escada soltou ' + c.desvioMs + 'ms atrasada, então esse número '
            + 'mede contenção, não rede.', '', 'cmd');
          c.medido = { chegouEm: chegouEm, erroMs: erroMs, descartada: true, deriva: c.desvioMs };
          save();
          return;
        }
        if (Math.abs(erroMs) > TETO_PLAUSIVEL_MS) {
          pushLog('📏 ' + c.x + '|' + c.y + ': medição de ' + Math.round(erroMs / 1000) + 's ignorada — '
            + 'isso não é latência, é o comando errado. A calibração não aprendeu com ela.', 'err', 'cmd');
          c.medido = { chegouEm: chegouEm, erroMs: erroMs, descartada: true };
          save();
          return;
        }
        const temMs = p.temMs;
        c.medido = { chegouEm: chegouEm, erroMs: erroMs, temMs: temMs };
        // Só amostra com milésimos entra na correção — sem isso o sinal é quantizado em 1s.
        if (temMs) {
          const k = config.cmd.calib;
          const alpha = (k.n < 3) ? 0.6 : 0.25;           // aprende rápido no começo, estável depois
          // O viés precisa poder ficar NEGATIVO: chegada adiantada só se corrige atrasando o
          // disparo. Antes o clamp do fireAtFor jogava lead negativo fora, então metade da faixa
          // aqui era decorativa.
          // MIRA +2ms ATRASADO, não zero. O erro aqui é assimétrico: num snipe, chegar
          // adiantado PERDE o comando; chegar 2ms tarde não custa nada. Mirar exatamente zero
          // deixa metade da dispersão cair do lado ruim. Com ±219ms de ruído medido, os 2ms não
          // resolvem sozinhos, mas movem a distribuição inteira pro lado barato de graça.
          const ALVO_ATRASO_MS = 2;
          k.biasMs = Math.max(-1500, Math.min(1500,
            Math.round((k.biasMs || 0) + (erroMs - ALVO_ATRASO_MS) * alpha)));
          k.n = (k.n || 0) + 1;
        } else {
          pushLog('📏 ' + c.x + '|' + c.y + ': a chegada veio SEM milésimos, então esta amostra não '
            + 'calibra nada (o sinal seria quantizado em 1s). Ligue os milésimos nas configurações '
            + 'do jogo — sem isso nenhuma calibração automática funciona.', 'err', 'cmd');
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
      // ANTES do early return. A medição acontece DEPOIS do disparo, quando o comando já saiu
      // de `pendentes` — se ela ficar embaixo do `if (!pend.length) return`, o tick sai antes e
      // a varredura nunca roda justamente no estado em que ela é necessária: fila só de
      // enviados. Foi o que aconteceu no teste ao vivo — `medirApos` venceu e nada rodou.
      ccVarrerMedicoes();
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
      // A SONDA SAIU DA JANELA DE SILÊNCIO. Ela rodava dentro do `silenceOn`, ou seja: a gente
      // calava todos os módulos pra reservar a linha e em seguida disparava 3 requisições nela.
      // Poluíamos a janela que acabáramos de reservar, a segundos do disparo.
      //
      // Não é hipótese solta: o RTT medido é BIMODAL (~350ms ou ~650ms — 650 pra baixar uma
      // imagem estática é congestionamento), e o grupo congestionado teve erro médio +157ms
      // contra +61ms do grupo limpo. Com 4 amostras de cada isso não é conclusivo, mas a sonda
      // dentro do silêncio é indefensável de qualquer forma: ela custa 3 requisições e já se
      // provou inútil como preditor (r entre 0,21 e 0,55, nada significativo).
      //
      // Agora ela roda na janela de PREPARO, ~60s antes — longe do disparo, e o valor continua
      // sendo gravado em `netPre` pra instrumentação.
      const faltaProx = prox ? (prox.fireAt - srvNowP()) : Infinity;
      if (prox && faltaProx > silLead && faltaProx <= silLead + 20000
          && Date.now() - (NETLAT.at || 0) > 60000) {
        netProbe(3);
      }
      if (prox && faltaProx <= silLead) {
        if (!SILENCE.on) silenceOn('comando ' + prox.x + '|' + prox.y);
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
      // O antichoke (AudioContext) só liga dentro de um gesto do usuário e MORRE a cada F5 ou
      // troca de tela — mas só o clique em "Armar" o religava, o que não serve pra quem já armou
      // e continua jogando. Sem ele, aba em 2º plano tem setTimeout estrangulado pra ~1x/min: o
      // preparo perde a janela de prepLeadSec e o comando morre em "horário já passou". Agora
      // QUALQUER clique/tecla na página o religa, enquanto houver comando pendente. É de graça
      // (não faz nada se já está ligado) e cobre o caminho real: navegar pelo jogo enquanto espera.
      const religar = () => { if (cmdPendentes().length) keepAwake(true); };
      document.addEventListener('click', religar, true);
      document.addEventListener('keydown', religar, true);
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
