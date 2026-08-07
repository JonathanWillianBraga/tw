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
      filaTipoFiltro: '',     // filtro de exibição da fila: '' (todos) | 'ataque' | 'apoio' | 'fake' | 'nobre'
      enviarParcial: false,   // padrão geral: manda o que tiver disponível em vez de falhar por tropa insuficiente
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
        if (c.cmd.filaTipoFiltro == null) c.cmd.filaTipoFiltro = '';
        if (c.cmd.enviarParcial == null) c.cmd.enviarParcial = false;
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
        // Envio parcial: manda o que tiver na origem em vez de falhar quando a quantidade
        // digitada não cabe mais. c.parcial null = segue o padrão geral; true/false força só
        // este comando. Precisa clampar ANTES do cmdPrepare — é o confirmar que fixa os números
        // que vão de fato pro disparo (c.prep), então ajustar depois seria tarde demais.
        const parcial = ccParcialEfetivo(c);
        let amounts = c.amounts;
        if (parcial) {
          let avail = {};
          try { avail = (await getVillageState(c.origin)).avail || {}; } catch (e) { /* sem leitura, segue com o pedido original */ }
          const clamped = {}; let temAlgo = false, reduziu = false;
          Object.keys(amounts || {}).forEach((u) => {
            const pedido = amounts[u] || 0;
            const v = Math.min(pedido, avail[u] || 0);
            if (v > 0) { clamped[u] = v; temAlgo = true; }
            if (v < pedido) reduziu = true;
          });
          if (!temAlgo) { cmdFalha(c, 'pulado: sem tropa disponível na origem (modo parcial)'); return false; }
          if (reduziu) {
            pushLog('Central: ' + c.x + '|' + c.y + ' — tropa reduzida por modo parcial (' + ccTropaTxt(amounts) + ' → ' + ccTropaTxt(clamped) + ').', '', 'cmd');
            amounts = clamped; c.amounts = clamped; save();
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
            const soExplorador = Object.keys(amounts).every((u) => u === 'spy');
            if (!soExplorador) {
              const pontos = await getVillagePoints();
              const pts = parseInt(pontos[String(c.origin)], 10) || 0;
              const minPop = pts > 0 ? Math.ceil((FAKE_LIMIT_PCT / 100) * pts) : 0;
              const falta = minPop - ccFakePopOf(amounts);
              if (falta > 0) {
                const precisa = (amounts.spy || 0) + Math.ceil(falta / (FAKE_POP.spy || 2));
                let temSpy = 0;
                try { temSpy = ((await getVillageState(c.origin)).avail || {}).spy || 0; } catch (e) { temSpy = precisa; }
                if (temSpy >= precisa) {
                  amounts = Object.assign({}, amounts, { spy: precisa });
                  c.amounts = amounts; save();
                  pushLog('Central: ' + c.x + '|' + c.y + ' — completado com ' + precisa + ' explorador(es) pro piso de população (' + minPop + ' hab.).', '', 'cmd');
                } else {
                  pushLog('⚠ ' + c.x + '|' + c.y + ': piso de população é ' + minPop + ' hab. e faltam exploradores pra completar — o servidor provavelmente vai recusar.', 'err', 'cmd');
                }
              }
            }
          } catch (e) { /* sem pontos (village.txt falhou): segue e deixa o servidor decidir */ }
        }
        const p = await cmdPrepare(c.origin, c.x, c.y, amounts, ehApoio ? 'support' : 'attack');
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
                  prep: null, state: 'novo', erro: null, sentAt: null, desvioMs: null,
                  parcial: null };   // null = segue config.cmd.enviarParcial · true/false = força só este
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
    // "Tudo" (mesma ideia do apoio em massa do jogo): preenche com o MÁXIMO disponível.
    // filtroU presente = só aquela unidade (checkbox de coluna); ausente = todas.
    // Processa as ondas NA ORDEM da lista — a 1ª onda de uma aldeia pega o disponível
    // primeiro, a 2ª (se houver) fica com o que sobrar, igual aconteceria mandando na mão.
    function ccOpAplicarTudo(a, filtroU) {
      const listaU = filtroU ? [filtroU] : (CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]));
      (a.ondas || []).forEach((o) => {
        const dispBase = ccOpDisponivel(o.vid);
        o.amounts = o.amounts || {};
        listaU.forEach((u) => {
          const meu = o.amounts[u] || 0;
          const teto = (dispBase[u] || 0) + meu;
          if (teto > 0) o.amounts[u] = teto; else delete o.amounts[u];
        });
      });
      save(); ccOpRender();
    }
    // "Tudo" só de UMA onda (uma aldeia só) — todas as unidades dela.
    function ccOpOndaTudo(id) {
      const a = ccOpAtivo(); if (!a) return;
      const o = a.ondas.find((z) => z.id === id); if (!o) return;
      const dispBase = ccOpDisponivel(o.vid);
      const listaU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      o.amounts = o.amounts || {};
      listaU.forEach((u) => {
        const meu = o.amounts[u] || 0;
        const teto = (dispBase[u] || 0) + meu;
        if (teto > 0) o.amounts[u] = teto; else delete o.amounts[u];
      });
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
      // Uma "coluna" por unidade, igual ao apoio em massa do jogo: marcar preenche aquela
      // tropa com o máximo em TODAS as ondas de uma vez. Some se não há onda pra preencher.
      const colsBox = document.getElementById('cc-op-tudo-cols');
      if (colsBox) {
        colsBox.style.display = (a.ondas || []).length ? 'flex' : 'none';
        colsBox.innerHTML = '<span style="color:#8a7d6d">tudo por tropa:</span> ' + listaU.map(([u, rot]) =>
          '<label style="display:flex;align-items:center;gap:2px;cursor:pointer" title="preenche ' + esc(rot) + ' com o máximo em todas as ondas">' +
            unitIcon(u, rot) + '<input type="checkbox" class="cc-op-tudo-col" data-u="' + u + '"></label>').join('');
        colsBox.querySelectorAll('.cc-op-tudo-col').forEach((el) => el.onclick = () => ccOpAplicarTudo(a, el.getAttribute('data-u')));
      }
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
            ' <a class="cc-op-onda-tudo" data-id="' + o.id + '" href="#" style="margin-left:8px;color:#2e7d3a" title="preenche todas as tropas desta aldeia com o máximo disponível">🧺 tudo desta aldeia</a>' +
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
      boxO.querySelectorAll('.cc-op-onda-tudo').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault(); ccOpOndaTudo(el.getAttribute('data-id'));
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
    // População de uma composição, pelos pesos de FAKE_POP (mesma tabela que o Saque usa
    // pro piso de fake do mundo — 050-envio.js).
    function ccFakePopOf(amounts) {
      return Object.keys(amounts || {}).reduce((s, u) => s + (parseInt(amounts[u], 10) || 0) * (FAKE_POP[u] || 1), 0);
    }
    async function ccArmarFakes(dizer, arriveAt) {
      if (!arriveAt) return dizer('Defina o horário de chegada.');
      if (arriveAt <= srvNowP()) return dizer('Esse horário já passou.');
      const comp = ccComposicao();
      if (!Object.keys(comp.amounts).length && !Object.keys(comp.max).length) return dizer('Escolha as tropas do fake.');
      const P = ccParesFake();
      if (!P.alvos.length) return dizer('Cole ao menos um alvo na lista de fakes.');
      if (!P.origens.length) return dizer('Marque ao menos uma origem.');

      // Piso de população do mundo (regra real do jogo — 1% dos pontos da PRÓPRIA origem).
      // Mesma constante/fórmula que o Saque já usa em produção (020-engine.js). Sem os pontos
      // (village.txt falhou), o piso fica desligado — degrada pro comportamento de antes, não
      // trava o armar.
      let pontos = null;
      try { pontos = await getVillagePoints(); } catch (e) { pontos = null; }

      let armados = 0, completados = 0; const pulados = [];
      P.pares.forEach((p) => {
        const v = p.o, nome = (v.coord || v.vid) + '→' + p.t.x + '|' + p.t.y;
        const amounts = ccResolverPara(comp, v.avail);
        if (!Object.keys(amounts).length) { pulados.push(nome); return; }
        // Isenção real do jogo: ataque só de explorador não tem piso de população.
        const soExplorador = Object.keys(amounts).every((u) => u === 'spy');
        if (!soExplorador && pontos) {
          const pts = parseInt(pontos[String(v.vid)], 10) || 0;
          const minPop = pts > 0 ? Math.ceil((FAKE_LIMIT_PCT / 100) * pts) : 0;
          const falta = minPop - ccFakePopOf(amounts);
          if (falta > 0) {
            // Completa com exploradores extra — nunca substitui o que foi digitado.
            const jaUsa = amounts.spy || 0;
            const precisa = jaUsa + Math.ceil(falta / (FAKE_POP.spy || 2));
            const sobra = (v.avail && v.avail.spy) || 0;
            if (sobra < precisa) { pulados.push(nome + ' (falta população: piso ' + minPop + ', sem explorador sobrando pra completar)'); return; }
            amounts.spy = precisa;
            completados++;
          }
        }
        const t = ccTempoViagemMs(v.x, v.y, p.t.x, p.t.y, amounts);
        if (t != null && (arriveAt - t) <= srvNowP()) { pulados.push(nome + ' (longe)'); return; }
        cmdAdicionar('fake', p.t.x, p.t.y, amounts, arriveAt, v.vid);
        armados++;
      });
      if (!armados) return dizer('Nenhum fake armado.' + (pulados.length ? ' Pulados: ' + pulados.length : ''));
      dizer(armados + ' fake(s) armado(s) em ' + P.alvos.length + ' alvo(s), chegando ' + srvClockMs(arriveAt) +
            (completados ? ' · ' + completados + ' completado(s) com explorador pro piso de ' + FAKE_LIMIT_PCT + '%' : '') +
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
    // Categoria de exibição do comando — usada tanto na linha da fila quanto no filtro de tipo,
    // pra um nunca discordar do outro.
    function ccRotTipo(c) { return { support: 'apoio', fake: 'fake', nobre: 'nobre' }[c.tipo] || 'ataque'; }
    // c.parcial null = segue o padrão geral (config.cmd.enviarParcial); true/false força só este.
    function ccParcialEfetivo(c) { return (c.parcial != null) ? c.parcial : !!config.cmd.enviarParcial; }
    function cmdCicloParcial(id) {
      const c = cmdFila().find((z) => z.id === id); if (!c || c.state !== 'novo') return;
      c.parcial = (c.parcial == null) ? true : (c.parcial === true ? false : null);
      save(); ccRender();
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
        const rot = ccRotTipo(c);
        // Horário de saída: já confirmado pelo servidor (c.sendAt) ou, antes do preparo,
        // a estimativa local. A estimativa aparece com "~" pra não passar por certeza.
        let saiTxt = '—', saiCor = '#8a7d6d', saiMs = null;
        if (c.sendAt) { saiMs = c.sendAt; saiTxt = srvClockMs(c.sendAt); saiCor = '#2e7d3a'; }
        else {
          const est = ccEstimaDeComando(c);
          if (est != null && c.arriveAt) { saiMs = c.arriveAt - est; saiTxt = '~' + srvClockMs(saiMs); saiCor = '#6f6153'; }
        }
        // Dia em segunda linha (só quando não é hoje) — mesma solução das colunas de/para, que já
        // quebram em duas linhas quando têm nome além da coordenada.
        const diaSai = ccDiaRel(saiMs), diaCheg = ccDiaRel(c.arriveAt);
        const selo = (t) => '<br><span style="color:#a8564a;font-size:9px">' + t + '</span>';
        return '<div style="display:grid;grid-template-columns:42px 108px 108px 1fr 78px 78px 56px 18px;gap:4px;align-items:center;padding:3px 5px;border-bottom:1px solid rgba(0,0,0,.07);font-size:10px">' +
          '<span style="color:' + (c.tipo === 'support' ? '#1f6fb2' : '#b5602f') + '">' + rot + (c.ondas ? ' ' + c.onda + '/' + c.ondas : '') + '</span>' +
          '<span style="color:#8a7d6d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(orgNome || String(org)) + '">' +
            esc(String(org)) + (orgNome ? '<br><span style="color:#584526">' + esc(orgNome) + '</span>' : '') + '</span>' +
          '<span style="color:#a2643a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(alvoNome || (c.x + '|' + c.y)) + '">' +
            esc(c.x + '|' + c.y) + (alvoNome ? '<br><span style="color:#8a7d6d">' + esc(alvoNome) + '</span>' : '') + '</span>' +
          '<span style="color:' + (corDe[c.state] || '#6f6153') + '">' + esc(c.state) + (c.erro ? ' · ' + esc(c.erro.slice(0, 40)) : '') + '</span>' +
          '<span style="color:' + saiCor + '" title="horário de saída">' + saiTxt + (diaSai ? selo(diaSai) : '') + '</span>' +
          '<span style="color:#6f6153">' + (c.arriveAt ? srvClockMs(c.arriveAt) + (diaCheg ? selo(diaCheg) : '') : '—') + '</span>' +
          '<span style="text-align:right;color:' + (dev ? erroCor(Math.abs(c.desvioMs)) : '#8a7d6d') + '">' + (dev || (falta > 0 ? fmt(falta) : '—')) + '</span>' +
          (c.state === 'novo' || c.state === 'preparado' || c.state === 'armado'
            ? '<span data-cc-ab="' + c.id + '" style="cursor:pointer;color:#c0483a" title="abortar">✕</span>' : '<span></span>') +
          // Tropas que saem neste comando — largura total, pra não espremer a grade.
          '<span style="grid-column:1/-1;font-size:9px;color:#8a7d6d;margin:1px 0 0 46px;line-height:1.6">' +
            (ccTropaResumo(c.amounts) || '<span style="color:#584526">— sem tropa —</span>') +
            // Só antes do preparo: depois que confirmou no servidor (c.prep já montado), mudar
            // isto aqui não re-executa o confirmar, então não teria efeito nenhum no que sai.
            (c.state === 'novo' ? ' &nbsp;<a data-parcial="' + c.id + '" style="cursor:pointer;color:' +
              (c.parcial == null ? '#8a7d6d' : (c.parcial ? '#2e7d3a' : '#c0483a')) +
              '" title="clique pra alternar: geral → forçado parcial → forçado exato → geral">envio: ' +
              esc(c.parcial == null ? ('geral (' + (ccParcialEfetivo(c) ? 'parcial' : 'exato') + ')') : (c.parcial ? 'forçado parcial' : 'forçado exato')) +
              '</a>' : '') +
          '</span>' +
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
      const filtroTipo = config.cmd.filaTipoFiltro || '';
      const passaFiltro = (c) => !filtroTipo || ccRotTipo(c) === filtroTipo;
      const ordenada = ccFilaOrdenada().filter(passaFiltro);
      const envio = ordenada.filter(ehEnvio);
      const feitos = ordenada.filter((c) => !ehEnvio(c));
      const vazio = (t) => '<div style="color:#8a7d6d;padding:6px;font-size:10px">' + t + '</div>';
      const sufFiltro = filtroTipo ? ' desse tipo' : '';
      bEnvio.innerHTML = envio.length ? envio.map(linha).join('') : vazio('— nada a enviar' + sufFiltro + ' —');
      bEnv.innerHTML = feitos.length ? feitos.map(linha).join('') : vazio('— nada enviado' + sufFiltro + ' ainda —');
      const ne = document.getElementById('cc-ftab-n-envio'); if (ne) ne.textContent = '(' + envio.length + ')';
      const nd = document.getElementById('cc-ftab-n-enviados'); if (nd) nd.textContent = '(' + feitos.length + ')';
      [bEnvio, bEnv].forEach((box) => {
        box.querySelectorAll('[data-aj]').forEach((e) => e.onclick = () =>
          ccAjustar(e.getAttribute('data-aj'), parseInt(e.getAttribute('data-d'), 10)));
        box.querySelectorAll('[data-sw]').forEach((e) => e.onclick = () =>
          ccTrocar(e.getAttribute('data-sw'), parseInt(e.getAttribute('data-dir'), 10)));
        box.querySelectorAll('[data-cc-ab]').forEach((el) => el.onclick = () => cmdAbortar(el.getAttribute('data-cc-ab')));
        box.querySelectorAll('[data-parcial]').forEach((el) => el.onclick = () => cmdCicloParcial(el.getAttribute('data-parcial')));
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

    // "hoje às HH:MM:SS:mmm" / "amanhã às ..." — mesmo formato da coluna "Chegada" do jogo,
    // pra nossa linha ficar visualmente igual às de verdade (a real usa exatamente essa forma,
    // conferido no HTML da própria tabela).
    function ccDataRel(ms) {
      const d = new Date(ms - wallToServerOffset());
      const agora = new Date(serverNow() - wallToServerOffset());
      const diffDias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
        new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())) / 86400000);
      const p = (n, w) => String(n).padStart(w || 2, '0');
      const prefixo = diffDias === 0 ? 'hoje' : diffDias === 1 ? 'amanhã'
        : p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
      return prefixo + ' às ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
        ':<span class="grey small">' + p(d.getMilliseconds(), 3) + '</span>';
    }
    // Só o DIA de um horário, e vazio quando é hoje. As colunas "sai"/"chegada" da Fila mostram
    // apenas o relógio (o milésimo importa, então o horário tem que caber) — num comando marcado
    // pra daqui dois dias isso vira "08:05:00.500" sem dizer de QUE dia, que é justamente quando
    // saber o dia mais importa. Vazio no caso comum (hoje) pra não poluir a coluna estreita.
    function ccDiaRel(ms) {
      if (!ms) return '';
      const d = new Date(ms - wallToServerOffset());
      const hoje = new Date(serverNow() - wallToServerOffset());
      const dias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
        new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86400000);
      if (dias === 0) return '';
      if (dias === 1) return 'amanhã';
      const p = (n) => String(n).padStart(2, '0');
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + (dias > 1 ? ' +' + dias + 'd' : '');
    }
    // Janelinha flutuante própria (troca o title/tooltip padrão do navegador, que só mostra
    // texto puro sem formatação) — mostra tropa com ícone+quantidade (mesmo bloco usado na
    // Fila) e o horário de saída, seguindo o mouse.
    function ccOvTipEl() {
      let el = document.getElementById('cc-ov-tip');
      if (!el) {
        el = document.createElement('div');
        el.id = 'cc-ov-tip';
        el.style.cssText = 'position:fixed;z-index:99999;display:none;background:#fdf6e8;' +
          'border:1px solid #c9a35a;border-radius:6px;padding:6px 8px;font-size:10px;color:#4a3d28;' +
          'box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none;max-width:260px;line-height:1.5';
        document.body.appendChild(el);
      }
      return el;
    }
    function ccOvTipMostrar(html, ev) {
      const el = ccOvTipEl();
      el.innerHTML = html;
      el.style.display = 'block';
      const pad = 14;
      el.style.left = (ev.clientX + pad) + 'px';
      el.style.top = (ev.clientY + pad) + 'px';
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth) el.style.left = Math.max(4, ev.clientX - r.width - pad) + 'px';
      if (r.bottom > window.innerHeight) el.style.top = Math.max(4, ev.clientY - r.height - pad) + 'px';
    }
    function ccOvTipEsconder() { const el = document.getElementById('cc-ov-tip'); if (el) el.style.display = 'none'; }
    let _ccOvTimer = null;
    function ccOverviewTabela() {
      // O jogo reusa o MESMO id #commands_outgoings pra duas tabelas diferentes:
      //   data-type="outgoing"       -> "Próprios comandos" da PRAÇA (nossos, saindo) — é esta.
      //   data-type="towards_village" -> no painel de QUALQUER aldeia (info_village), lista
      //                                  comandos de QUALQUER JOGADOR indo pra ELA.
      // Bug real: sem o filtro por data-type, fakes agendados apareciam na ficha de uma
      // bárbara sem relação nenhuma com o alvo, só porque o id batia. Por isso o data-type
      // é obrigatório, e o fallback só roda na tela da praça — nunca repete o erro por outro caminho.
      const cont = document.querySelector('#commands_outgoings[data-type="outgoing"]');
      if (cont) { const t = cont.querySelector('table'); if (t) return t; }
      let tb = document.querySelector('#commands_table');
      if (tb) return tb;
      if (telaAtual() !== 'place') return null;
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
      // 3 é a estrutura real confirmada da tabela (Próprios comandos/Chegada/Chega em). Só
      // sobrescreve se achar uma linha REAL de comando pra amostrar — a linha de cabeçalho (só
      // <th>, sem <td>) não conta, senão dava nc=2 sempre que não houvesse comando manual ativo.
      const nc = reais.length ? Math.max(2, reais[0].querySelectorAll('td').length) : 3;
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
        const tipHtml = '<div style="font-weight:600;margin-bottom:3px;color:#8b5426">' + esc(rot) + ' agendado</div>' +
          '<div>' + (ccTropaResumo(c.amounts) || '<span style="color:#a8564a">sem tropa</span>') + '</div>' +
          '<div style="color:#6f6153;margin-top:3px">saída: <b>' + (saiEm ? srvClockMs(saiEm) : '—') +
            (saiEm && ccDiaRel(saiEm) ? ' <span style="color:#a8564a">(' + ccDiaRel(saiEm) + ')</span>' : '') + '</b></div>';
        // Mesma estrutura de classes da linha REAL (quickedit-content/icon-container/quickedit-
        // label) — herda o visual do jogo automaticamente. Só o ícone (🕒 no lugar do ícone de
        // unidade) e o fundo levemente destacado diferenciam "isto ainda não foi enviado".
        if (nc === 3) {
          tr.innerHTML =
            '<td style="white-space:nowrap">' +
              '<span class="quickedit-content">' +
                '<span class="icon-container"><span class="cc-ov-hover" style="cursor:default;font-size:12px">🕒</span></span>' +
                // O negrito+marrom (#603000) do jogo só é aplicado quando o .quickedit-label está
                // dentro de .quickedit-out + <a> (confirmado ao vivo, comparando com/sem o
                // wrapper) — como não existe link de verdade pra apontar, replica a cor/peso
                // direto aqui em vez de montar um <a> morto só pra herdar o estilo.
                '<span class="quickedit-label" style="color:#603000;font-weight:700">' + esc(rot) + ' agendado → ' + esc(c.x + '|' + c.y) + (nome ? ' ' + esc(nome) : '') + '</span>' +
              '</span>' +
            '</td>' +
            '<td>' + ccDataRel(c.arriveAt) + '</td>' +
            '<td><span class="cc-ov-falta" data-arr="' + c.arriveAt + '"></span>' +
              ' <a href="#" class="cc-ov-x" data-id="' + c.id + '" title="cancelar comando agendado" style="color:#c0483a;font-weight:bold;text-decoration:none">✕</a></td>';
        } else {
          // Fallback pra tabela com número de colunas diferente do esperado (ex.: #commands_table).
          let html = '';
          for (let i = 0; i < nc; i++) html += '<td style="padding:4px 6px;white-space:nowrap;color:#a2643a">' +
            (i === 0
              ? '🕒 <b>' + esc(rot) + ' agendado</b> → ' + esc(c.x + '|' + c.y) + (nome ? ' ' + esc(nome) : '')
              : i === nc - 2 ? srvClockMs(c.arriveAt)
              : i === nc - 1 ? '<span class="cc-ov-falta" data-arr="' + c.arriveAt + '"></span>' +
                  '<a href="#" class="cc-ov-x" data-id="' + c.id + '" title="cancelar comando agendado" style="color:#c0483a;font-weight:bold;margin-left:8px;text-decoration:none">✕</a>'
              : '') + '</td>';
          tr.innerHTML = html;
        }
        tr.addEventListener('mouseenter', (ev) => ccOvTipMostrar(tipHtml, ev));
        tr.addEventListener('mousemove', (ev) => ccOvTipMostrar(tipHtml, ev));
        tr.addEventListener('mouseleave', ccOvTipEsconder);
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
        ccOvTipEsconder();
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

    // ---- Agendados na ficha da aldeia (info_village) ----
    // A ficha de uma aldeia INIMIGA nunca mostra ataque a caminho de verdade (essa informação
    // só é visível pro dono) — então quem monta uma Operação com várias ondas pro mesmo alvo
    // não tinha como conferir a fila que já agendou, só a Fila lá na Central. Isto injeta os
    // NOSSOS comandos pendentes (config.cmd.fila) que apontam pra essa coordenada, direto na
    // ficha, ordenados por chegada — igual ao mountCmdOverview faz na praça, só que por DESTINO
    // em vez de por ORIGEM.
    async function mountCmdDestino() {
      if (!config.cmd || !config.cmd.enabled) return;
      if (telaAtual() !== 'info_village') return;
      const old = document.getElementById('cc-destino-box'); if (old) old.remove();
      const coordEl = Array.prototype.slice.call(document.querySelectorAll('#content_value td'))
        .find((td) => /^\d{1,3}\|\d{1,3}$/.test((td.textContent || '').trim()));
      const coord = coordEl ? coordEl.textContent.trim() : null;
      if (!coord) return;
      const pend = cmdFila().filter((c) => (c.x + '|' + c.y) === coord &&
        (c.state === 'novo' || c.state === 'preparado' || c.state === 'armado'));
      if (!pend.length) return;
      pend.sort((a, b) => a.arriveAt - b.arriveAt);
      let vilas = [];
      try { vilas = await getAllVillagesCached(); } catch (e) { /* segue sem nome de origem */ }
      const h2 = document.querySelector('#content_value h2');
      if (!h2) return;
      const box = document.createElement('table');
      box.id = 'cc-destino-box'; box.className = 'vis'; box.style.marginBottom = '10px';
      box.innerHTML = '<tr><th colspan="4">🕒 Agendados na Central (' + pend.length + ')</th></tr>' +
        '<tr style="font-size:11px;color:#7d7259"><td>tipo</td><td>origem</td><td>chega</td><td>sai / cancelar</td></tr>' +
        pend.map((c) => {
          const vo = vilas.find((z) => String(z.vid) === String(c.origin));
          const origemTxt = vo ? (vo.name || vo.coord || vo.vid) : c.origin;
          const rot = { support: 'Apoio', fake: 'Fake', nobre: 'Nobre' }[c.tipo] || 'Ataque';
          const est = ccEstimaDeComando(c);
          const saiEm = c.sendAt ? c.sendAt : (est != null ? c.arriveAt - est : null);
          return '<tr>' +
            '<td>' + esc(rot) + '</td>' +
            '<td>' + esc(origemTxt) + '</td>' +
            '<td>' + srvClockMs(c.arriveAt) + (ccDiaRel(c.arriveAt) ? ' <span style="color:#a8564a;font-size:10px">' + ccDiaRel(c.arriveAt) + '</span>' : '') + '</td>' +
            '<td>' + (saiEm ? 'sai ' + srvClockMs(saiEm) + (ccDiaRel(saiEm) ? ' <span style="color:#a8564a;font-size:10px">' + ccDiaRel(saiEm) + '</span>' : '') : '—') +
              ' <a href="#" class="cc-dest-x" data-id="' + c.id + '" title="cancelar comando agendado" style="color:#c0483a;font-weight:bold;margin-left:8px;text-decoration:none">✕</a></td>' +
          '</tr>';
        }).join('');
      h2.insertAdjacentElement('afterend', box);
      box.querySelectorAll('.cc-dest-x').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault();
        const id = el.getAttribute('data-id');
        const c = cmdFila().find((z) => z.id === id);
        cmdAbortar(id);
        if (c) pushLog('🕒 Central: agendado → ' + c.x + '|' + c.y + ' cancelado (via ficha da aldeia).', '', 'cmd');
        mountCmdDestino().catch(() => {});
      });
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
        // O cabeçalho fica SEMPRE visível, mesmo minimizado — é o que permite reabrir. O
        // resto (tudo dentro de #cc-corpo) esconde/mostra junto do estado persistido.
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<span style="display:flex;align-items:center;gap:6px">' +
            '<span id="cc-min-tog" title="minimizar/restaurar — o estado fica salvo" style="cursor:pointer;color:#a2643a;font-size:12px;user-select:none">▾</span>' +
            '<b style="color:#a2643a;font-size:13px">🚀 Centro de Comando <span style="color:#8a7d6d;font-size:10px;font-weight:400">v' + VERSION + '</span></b>' +
          '</span>' +
          '<b id="cc-clock" style="color:#a2643a;font-size:16px;font-variant-numeric:tabular-nums">--:--:--.---</b>' +
        '</div>' +
        '<div id="cc-corpo">' +
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
            '<span style="font-size:9px"><a id="cc-op-tudo-geral" style="cursor:pointer;color:#2e7d3a">🧺 tudo (todas as ondas)</a> · ' +
              '<a id="cc-op-limpar" style="cursor:pointer;color:#c0483a">limpar ondas</a></span>' +
          '</div>' +
          // Por coluna de unidade — igual ao "apoio em massa" do próprio jogo: marcar preenche
          // aquela tropa com o máximo disponível em TODAS as ondas de uma vez.
          '<div id="cc-op-tudo-cols" style="display:flex;flex-wrap:wrap;gap:8px;font-size:9px;color:#6f6153;padding:3px 5px;background:#fbf7ee;border:1px solid #ece4d8;border-radius:6px 6px 0 0"></div>' +
          '<div id="cc-op-ondas" style="height:380px;min-height:100px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:0 0 6px 6px"></div>' +
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
        '<div style="font-size:10px;color:#6f6153;margin-bottom:5px">' +
          '<label style="cursor:pointer" title="Na hora de preparar, se a origem tiver menos tropa do que foi pedido, manda o que tiver em vez de falhar. Cada comando na Fila pode sobrescrever isto individualmente.">' +
            '<input id="cc-parcial" type="checkbox"> enviar mesmo com tropa insuficiente (usa o que tiver disponível)</label>' +
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
            '<span style="font-size:10px;color:#8a7d6d">' +
              '<select id="cc-fila-tipo" class="twmgr-inp" style="width:auto;font-size:10px;padding:1px" title="mostra só um tipo na fila">' +
                '<option value="">todos os tipos</option><option value="ataque">⚔ ataque</option>' +
                '<option value="apoio">🛡 apoio</option><option value="fake">🎭 fake</option><option value="nobre">👑 nobre</option></select>' +
              ' · ordenar por ' +
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
        '</div>' +
        '</div>';   // fecha #cc-corpo
      host.insertBefore(d, host.firstChild);
      // Minimizado fica salvo em config.cmd (localStorage) — sobrevive a navegar dentro da
      // praça (Tropas, Coletando...) e a F5, exatamente como o resto do estado da Central.
      const ccAplicarMin = () => {
        const corpo = document.getElementById('cc-corpo'), tog = document.getElementById('cc-min-tog');
        const min = !!config.cmd.painelMin;
        if (corpo) corpo.style.display = min ? 'none' : '';
        if (tog) tog.textContent = min ? '▸' : '▾';
        d.style.marginBottom = min ? '6px' : '12px';
      };
      document.getElementById('cc-min-tog').addEventListener('click', () => {
        config.cmd.painelMin = !config.cmd.painelMin; save(); ccAplicarMin();
      });
      ccAplicarMin();
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
      document.getElementById('cc-op-tudo-geral').onclick = (ev) => {
        ev.preventDefault();
        const a = ccOpAtivo(); if (a) ccOpAplicarTudo(a);
      };
      const ordEl = document.getElementById('cc-fila-ordem');
      ordEl.value = config.cmd.filaOrdem || 'chegada';
      ordEl.addEventListener('change', () => { config.cmd.filaOrdem = ordEl.value; save(); ccRender(); });
      const tipoEl = document.getElementById('cc-fila-tipo');
      tipoEl.value = config.cmd.filaTipoFiltro || '';
      tipoEl.addEventListener('change', () => { config.cmd.filaTipoFiltro = tipoEl.value; save(); ccRender(); });
      const parcialEl = document.getElementById('cc-parcial');
      parcialEl.checked = !!config.cmd.enviarParcial;
      parcialEl.addEventListener('change', () => { config.cmd.enviarParcial = parcialEl.checked; save(); ccRender(); });
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
    mountCmdDestino().catch(() => { /* silencioso: injeção na ficha da aldeia é opcional */ });
    try { cmdBoot(); } catch (e) { pushLog('cmdBoot falhou: ' + (e.message || e), 'err', 'cmd'); }
  })();
