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
