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
      box.innerHTML = '<div style="color:#8f7d57;padding:6px;font-size:10px">lendo…</div>';
      let L = [];
      try { L = await ccLerComandos(_ccCmdsQual, !!forcar); }
      catch (e) { box.innerHTML = '<div style="color:#ff7568;padding:6px;font-size:10px">' + esc(e.message || e) + '</div>'; return; }
      if (!L.length) { box.innerHTML = '<div style="color:#8f7d57;padding:6px;font-size:10px">— nenhum —</div>'; return; }
      const agora = srvNowP(), ehIn = (_ccCmdsQual === 'incoming');
      box.innerHTML = L.slice(0, 60).map((c, i) => {
        const jan = ehIn ? ccJanelaSnipe(L, i) : null;
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
                    (ccSnipeViavel(jan) ? '#7fc8ff' : '#ff7568') + '" title="' +
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
        if (m) { m.style.color = '#8fe39a'; m.textContent = 'Chegada copiada: ' + srvClockMs(c.chega + off()) + (off() ? ' (com ' + off() + 'ms de deslocamento)' : ''); }
      });
      box.querySelectorAll('[data-snipe]').forEach((el) => el.onclick = () => {
        const i = +el.getAttribute('data-snipe'), c = L[i], jan = ccJanelaSnipe(L, i);
        const m = document.getElementById('cc-msg');
        if (!ccSnipeViavel(jan)) {
          if (m) { m.style.color = '#ff7568'; m.textContent = ccSnipeTitulo(jan); }
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
      const diz = (t, cor) => { if (msg) { msg.textContent = t; msg.style.color = cor || '#ff7568'; } };
      if (!config.cmd.suporteOkAt) return diz('O apoio ainda não foi verificado neste mundo — deixe a praça aberta alguns segundos e tente de novo.');
      const alvos = ((document.getElementById('cc-massa-alvos') || {}).value || '').split(/\n/)
        .map((s) => { const m = s.match(/(\d{1,3})\s*\|\s*(\d{1,3})/); return m ? { x: m[1], y: m[2] } : null; })
        .filter(Boolean);
      if (!alvos.length) return diz('Informe ao menos um alvo (ex: 500|600).');
      const spec = ccMassaSpec();
      if (!Object.keys(spec).length) return diz('Escolha as tropas (número, "50%" ou "tudo").');
      const marcadas = CCVILAS.filter((v) => config.cmd.origens[v.vid]);
      if (!marcadas.length) return diz('Marque as origens na lista acima.');
      const dividir = (document.getElementById('cc-massa-dividir') || {}).checked && alvos.length > 1;

      const rotU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]).filter((u) => u !== 'snob');
      const rotNome = {}; UNITS.forEach(([u, n]) => { rotNome[u] = n; });
      diz('Enviando… (não feche a praça)', '#cbb98f'); if (rel) rel.textContent = '';
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
      diz(enviados + ' apoio(s) enviado(s)' + (falhas ? ' · ' + falhas + ' falha(s)' : '') + '.', falhas ? '#ffd76a' : '#8fe39a');
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
          '<span style="display:grid;grid-template-columns:18px 116px 44px 66px 46px 1fr;gap:6px;align-items:center;font-size:10px">' +
            '<input type="checkbox" data-cc-org="' + v.vid + '"' + (on ? ' checked' : '') + '>' +
            '<span style="overflow:hidden" title="' + esc((v.nome || '') + ' ' + (v.coord || '')) + '">' +
              '<span style="color:#e6cf7d;white-space:nowrap">' + esc(v.coord || v.vid) + '</span>' +
              (v.nome ? '<span style="display:block;color:#9c8a5f;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(v.nome) + '</span>' : '') +
            '</span>' +
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
      const base = n + ' de ' + CCVILAS.length + ' aldeia(s) marcada(s)' + (alvo ? ' → ' + alvo.coord : '') +
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
          // Tropas que saem neste comando — largura total, pra não espremer a grade.
          '<span style="grid-column:1/-1;font-size:9px;color:#b7a373;margin:1px 0 0 46px;line-height:1.6">' +
            (ccTropaResumo(c.amounts) || '<span style="color:#6b5c3f">— sem tropa —</span>') + '</span>' +
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
        '<div style="background:linear-gradient(180deg,#2a2016,#201810);border:1px solid #4a3b28;border-radius:10px;' +
             'padding:12px;width:min(680px,94vw);max-height:86vh;overflow:auto;color:#e8d29a;font-size:11px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<b style="color:#d4af37;font-size:13px">🎯 Snipe em ' + esc(p.destino || '?') + '</b>' +
            '<a id="cc-sn-x" style="cursor:pointer;color:#ff7568;font-size:14px">✕</a>' +
          '</div>' +
          '<div style="font-size:10px;color:#cbb98f;margin-bottom:4px">' +
            'O ataque pousa às <b style="color:#ff9a7a">' + srvClockMs(p.base) + '</b> · ' +
            'o apoio chega às <b style="color:#8fe39a">' + srvClockMs(p.chegaEm) + '</b>' +
            ' (<b>' + ccFolgaSnipe() + 'ms antes</b>)' +
            (p.largura != null ? ' · janela de <b>' + p.largura + 'ms</b> desde a onda anterior' : ' · sem onda anterior conhecida') +
            (p.exato ? '' : ' · <b style="color:#ffd76a">chegada sem milésimos: 1s de incerteza</b>') +
          '</div>' +
          // A margem precisa ser maior que o erro de disparo: se o apoio atrasar mais que ela,
          // pousa DEPOIS do ataque e não serve pra nada.
          '<div style="font-size:10px;margin-bottom:8px">' +
            'chegar <input id="cc-sn-folga" class="twmgr-inp" type="number" min="0" step="50" ' +
              'value="' + ccFolgaSnipe() + '" style="width:66px;font-size:10px;padding:1px">ms antes do ataque ' +
            '<span id="cc-sn-folga-av"></span>' +
          '</div>' +
          (viaveis.length
            ? '<div style="display:grid;grid-template-columns:20px 96px 1fr 74px 70px;gap:6px;font-size:9px;color:#8f7d57;padding:0 4px 3px">' +
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
        'padding:3px 4px;border-bottom:1px solid rgba(255,255,255,.05);' + (c.viavel ? '' : 'opacity:.45;') + '">' +
          '<input type="checkbox" data-sn="' + i + '"' + (c.viavel && i === 0 ? ' checked' : '') + (c.viavel ? '' : ' disabled') + '>' +
          '<span style="color:#e6cf7d">' + esc(c.v.coord) + '</span>' +
          '<span style="color:#cbb98f;font-size:10px">' +
            CC_DEF.filter((u) => c.comp[u]).map((u) => esc(rot[u] || u) + ' ' + fmtN(c.comp[u])).join(' · ') + '</span>' +
          '<span style="color:' + (c.viavel ? '#8fe39a' : '#ff7568') + '">' + srvClockMs(c.sai) + '</span>' +
          '<span style="color:#8f7d57">' + (c.folga > 0 ? fmt(c.folga) : 'tarde') + '</span>' +
        '</label>').join('')
        : '<div style="color:#ff7568;padding:8px;font-size:10px">Nenhuma aldeia sua tem tropa de defesa para este alvo.</div>';

      const msg = ov.querySelector('#cc-sn-msg');
      if (!viaveis.length && cands.length) {
        msg.style.color = '#ff7568';
        msg.textContent = 'Nenhuma aldeia chega a tempo: a mais rápida sairia ' + fmt(Math.abs(cands[0].folga)) + ' atrás.';
      }
      // Aviso vivo: margem menor que o erro de disparo é o cenário em que o snipe morre no ataque.
      const folgaEl = ov.querySelector('#cc-sn-folga'), folgaAv = ov.querySelector('#cc-sn-folga-av');
      const attFolga = () => {
        const e = erroEstimadoMs(), f = parseInt(folgaEl.value, 10) || 0;
        if (f < e) {
          folgaAv.innerHTML = '<b style="color:#ff7568">⚠ menor que o erro medido (±' + e + 'ms) — o apoio pode chegar DEPOIS do ataque e não segurar nada</b>';
        } else if (p.largura != null && f > p.largura) {
          folgaAv.innerHTML = '<b style="color:#ff7568">⚠ maior que a janela (' + p.largura + 'ms) — cairia antes da onda anterior e morreria nela</b>';
        } else {
          folgaAv.innerHTML = '<span style="color:#8fe39a">✓ acima do erro medido (±' + e + 'ms)</span>';
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
        if (!marcadas.length) { msg.style.color = '#ff7568'; msg.textContent = 'Marque ao menos uma aldeia.'; return; }
        if (!config.cmd.suporteOkAt) { msg.style.color = '#ff7568'; msg.textContent = 'O apoio ainda não foi verificado neste mundo — abra a praça de reunião uma vez.'; return; }
        const al = p.destino.split('|');
        let n = 0;
        marcadas.forEach((c) => { cmdAdicionar('support', al[0], al[1], c.comp, p.chegaEm, c.v.vid); n++; });
        save(); ccRender();
        msg.style.color = '#8fe39a';
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
          '<div style="display:grid;grid-template-columns:18px 116px 44px 66px 46px 1fr;gap:6px;font-size:9px;color:#8f7d57;padding:0 5px 2px">' +
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
        '</div>' +
        // ---- Apoio em massa: dispara AGORA (sem agendar), das origens marcadas acima ----
        '<div style="margin-top:8px;border-top:1px solid #3a2e1b;padding-top:6px">' +
          '<span id="cc-massa-tog" style="font-size:10px;color:#e8d29a;font-weight:600;cursor:pointer" title="recolher/expandir">▸ 🚚 Apoio em massa</span>' +
          '<div id="cc-massa-body" style="display:none;margin-top:5px">' +
            '<div style="font-size:9px;color:#8f7d57;margin-bottom:4px">Manda apoio das <b>origens marcadas acima</b> pro(s) alvo(s), o quanto antes (não agenda). Em cada unidade: um número, <b>50%</b> ou <b>tudo</b>.</div>' +
            '<label style="font-size:10px;display:block">Alvo(s) <span style="color:#6b5c3f">(um por linha)</span></label>' +
            '<textarea id="cc-massa-alvos" class="twmgr-inp" style="width:100%;height:36px;font-size:10px" placeholder="500|600"></textarea>' +
            '<label style="font-size:10px;display:block;margin-top:3px;cursor:pointer"><input type="checkbox" id="cc-massa-dividir"> dividir as tropas entre os alvos (senão manda o cheio pra cada)</label>' +
            '<div id="cc-massa-unidades" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0"></div>' +
            '<button id="cc-massa-enviar" class="twmgr-btn twmgr-go" style="width:100%">🚚 Enviar apoio agora</button>' +
            '<div id="cc-massa-msg" style="font-size:10px;margin-top:5px;min-height:12px"></div>' +
            '<div id="cc-massa-rel" style="font-size:10px;margin-top:4px;color:#cbb98f;font-family:Consolas,monospace;white-space:pre-wrap;max-height:160px;overflow-y:auto"></div>' +
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
      document.getElementById('cc-massa-tog').addEventListener('click', () => {
        const b = document.getElementById('cc-massa-body');
        const abrir = b.style.display === 'none';
        b.style.display = abrir ? 'block' : 'none';
        document.getElementById('cc-massa-tog').textContent = (abrir ? '▾' : '▸') + ' 🚚 Apoio em massa';
      });
      ccMassaUnidades();
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
    try { cmdBoot(); } catch (e) { pushLog('cmdBoot falhou: ' + (e.message || e), 'err', 'cmd'); }
  })();
