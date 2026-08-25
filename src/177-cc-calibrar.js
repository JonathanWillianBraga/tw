  // ==================== CENTRO DE COMANDO — CALIBRACAO (ccCalib*) ====================
  // Parte da ILHA do Centro de Comando. A ilha e UMA IIFE aninhada que ABRE em
  // 171-cc-nucleo.js e FECHA em 179-cc-painel.js: nenhum arquivo do meio abre ou fecha chave
  // de IIFE. Todos partilham o mesmo escopo lexico.
  //
  // ---------------------------------------------------------------------------------------
  // O PROBLEMA QUE ISTO RESOLVE
  //
  // O agendador precisa saber UMA coisa pra ser preciso: quantos ms antes da hora pedida o
  // POST tem que sair, pra o servidor PROCESSAR ele na hora certa. Esse numero (`calib.biasMs`)
  // nao da pra calcular — ele soma latencia de ida, tempo de processamento do servidor e
  // desvio do relogio de referencia do jogo, que nao sao observaveis separadamente.
  //
  // So da pra MEDIR. E ate agora a unica forma de medir era esperar voce mandar um ataque de
  // verdade: `ccMedir` le a chegada que o jogo carimbou e compara com a pedida. Isso tem dois
  // defeitos graves:
  //
  //   1. A calibracao so aprende quando voce ja esta jogando pra valer. O primeiro ataque
  //      importante — justamente o que precisa de precisao — sai com `biasMs` de um numero que
  //      ninguem mediu. Com `calib.n = 0` o lead e ZERO.
  //   2. Se a medicao falha em silencio (chegada sem milesimos, casamento recusado, aba
  //      trocada), `calib.n` fica em zero PRA SEMPRE e nada avisa. Ja aconteceu nesta conta:
  //      uma regex de data que nunca casou deixou o motor rodando sem correcao nenhuma, e o
  //      unico sintoma era comando chegando torto.
  //
  // A CALIBRACAO SOB DEMANDA fecha esse buraco: manda comandos de VERDADE, mede, e CANCELA os
  // comandos em seguida — entao voce descobre o numero quando quiser, sem gastar tropa e sem
  // depender de estar no meio de uma operacao real.
  //
  // ---------------------------------------------------------------------------------------
  // POR QUE PRECISA SER COMANDO DE VERDADE
  //
  // Porque o numero que interessa e o do CAMINHO REAL. Um "teste" que simula o disparo mede o
  // relogio local, nao o servidor. O erro que a gente persegue nasce entre o `fetch` sair
  // daqui e o servidor carimbar o comando — nenhuma simulacao atravessa esse trecho.
  //
  // Entao a calibracao usa o pipeline inteiro, sem atalho: `cmdAdicionar` -> `cmdPreparar` ->
  // `cmdDisparar` -> `ccMedir`. E o mesmo codigo que um ataque real percorre. Se ele tiver um
  // defeito, a calibracao sente o defeito — que e exatamente o que se quer de uma aferi(c)ao.
  //
  // ---------------------------------------------------------------------------------------
  // POR QUE E SEGURO
  //
  // - Manda EXPLORADOR (1 por comando). E a unidade mais barata; se tudo falhar, ele espiona
  //   uma barbara e volta sozinho. Nao ha cenario em que isto perca tropa de combate.
  // - Mira uma BARBARA. Nao acorda jogador nenhum, nao entra em guerra, nao gera relatorio que
  //   interesse a alguem.
  // - CANCELA assim que mede. `cancelCommand` (160-desviar) e o mesmo cancelamento provado na
  //   v11.213.0, que confirma lendo a lista de saidas — nao confia no HTTP 200.
  // - A janela de cancelamento do mundo (`command_cancel_time`, 600s aqui) e o teto de tudo:
  //   os comandos saem espacados de forma que TODOS caibam nela com folga.
  // - Se a medicao nao acontecer, o cancelamento acontece do mesmo jeito (a varredura nao
  //   depende de ter medido). Tropa fora de casa e o unico risco real, e ele tem duas redes.
  //
  // ---------------------------------------------------------------------------------------
  // POR QUE MAIS DE UMA AMOSTRA
  //
  // Porque uma amostra nao tem incerteza. O erro medido nesta conta ja variou +100, +71, -64ms
  // — com UMA medida voce nao sabe se pegou o centro ou a ponta. A calibracao manda N (padrao
  // 3) espacados, e a tela mostra a FAIXA, nao so a media: e a faixa que responde "da pra
  // confiar num snipe de 200ms?".

  // Estado da rodada de calibracao. Em memoria de proposito: se a aba morrer no meio, a
  // varredura de cancelamento ainda acha os comandos pelo marcador `_calib` gravado na fila
  // (que ESSE sim vai pro disco). Perder o painel nao pode deixar tropa na estrada.
  let _ccCalib = null;

  const CC_CALIB_N_PADRAO = 3;
  const CC_CALIB_GAP_MS = 45000;    // entre comandos: folga pra medir e cancelar um antes do proximo
  // MARGEM ATE O PRIMEIRO DISPARO, e ela e generosa de proposito.
  //
  // A fila raciocina por CHEGADA: eu agendo `arriveAt` e o motor deduz a saida subtraindo a
  // duracao. Mas a duracao que eu uso aqui e a ESTIMATIVA LOCAL — a exata so aparece quando
  // `cmdPreparar` pergunta ao servidor. Se a estimativa ficar ABAIXO da real por X ms, a saida
  // calculada anda X pra tras; se X passar da margem, o disparo cai no passado e o comando
  // morre em "horario ja passou" sem medir nada.
  //
  // 90s cobre folgadamente o erro de estimativa de um explorador numa barbara perto. Custa
  // um minuto e meio a mais numa operacao que roda uma vez por sessao — barato pelo que evita.
  const CC_CALIB_EM_MS = 90000;
  // Teto duro. `command_cancel_time` neste mundo e 600s; abaixo disso o jogo nao deixa mais
  // cancelar. Ficamos MUITO longe do limite de proposito — a conta so precisa dar certo uma vez
  // pra tropa nao voltar a pe.
  const CC_CALIB_PRAZO_MS = 420000;

  function ccCalibCfg() {
    const c = config.cmd;
    if (!c.calib) c.calib = { biasMs: 0, n: 0 };
    if (!Array.isArray(c.calib.amostras)) c.calib.amostras = [];
    return c.calib;
  }

  // Resumo estatistico do que foi medido. Media E dispersao — ver o cabecalho: media sozinha
  // e confianca falsa.
  function ccCalibResumo() {
    const k = ccCalibCfg();
    const a = (k.amostras || []).slice();
    if (!a.length) return { n: k.n || 0, bias: k.biasMs || 0, amostras: 0 };
    const soma = a.reduce((s, x) => s + x, 0);
    const media = soma / a.length;
    const dp = Math.sqrt(a.reduce((s, x) => s + (x - media) * (x - media), 0) / a.length);
    return {
      n: k.n || 0, bias: k.biasMs || 0, amostras: a.length,
      media: Math.round(media), dp: Math.round(dp),
      min: Math.min.apply(null, a), max: Math.max.apply(null, a), lista: a,
    };
  }

  // Escolhe origem e alvo sozinho. O usuario nao deveria ter que achar uma aldeia com
  // explorador e uma barbara perto — se ele tivesse que montar isso na mao, a calibracao
  // viraria "aquela coisa que eu nunca rodo".
  async function ccCalibMontar(n) {
    const minhas = (await getAllVillagesCached()).filter((v) => v.coord);
    if (!minhas.length) throw new Error('não consegui ler suas aldeias');
    let origem = null;
    for (const v of minhas) {
      let st;
      try { st = await getFakeVillage(v.vid); } catch (e) { continue; }
      if ((st.avail.spy || 0) >= n) {
        const cm = (v.coord || '').match(/(\d+)\|(\d+)/);
        if (cm) { origem = { vid: v.vid, nome: v.name || v.coord, x: +cm[1], y: +cm[2] }; break; }
      }
    }
    if (!origem) throw new Error('nenhuma aldeia sua tem ' + n + ' explorador(es) livre(s)');
    const barbs = (await getMapVillages()).filter((v) => v.player === '0');
    if (!barbs.length) throw new Error('nenhuma bárbara no village.txt pra mirar');
    let alvo = null, melhor = Infinity;
    barbs.forEach((b) => {
      const d = fieldDist(origem.x, origem.y, +b.x, +b.y);
      if (d < melhor) { melhor = d; alvo = b; }
    });
    return { origem: origem, alvo: { x: +alvo.x, y: +alvo.y }, dist: Math.round(melhor * 10) / 10 };
  }

  async function ccCalibIniciar(n) {
    n = Math.max(1, Math.min(6, n || CC_CALIB_N_PADRAO));
    if (_ccCalib && _ccCalib.ativa) { ccCalibDiz('Já tem uma calibração rodando.', '#a2643a'); return; }
    // Comando pendente na fila e disparo concorrente: a calibracao mediria contra o transito
    // do usuario e o usuario perderia o horario dele. Nenhum dos dois vale a pena.
    if (cmdPendentes().length) {
      ccCalibDiz('Tem comando na fila. A calibração dispara de verdade e mexe no modo silêncio — '
        + 'esvazie a fila antes pra não atrapalhar seus horários.', '#c0483a');
      return;
    }
    let plano;
    ccCalibDiz('Procurando origem com explorador e uma bárbara perto…', '#6f6153');
    try { plano = await ccCalibMontar(n); }
    catch (e) { ccCalibDiz('Não deu: ' + (e.message || e), '#c0483a'); return; }

    if (!confirm('Calibrar o agendador com ' + n + ' comando(s) REAIS?\n\n'
      + 'Origem: ' + plano.origem.nome + '\n'
      + 'Alvo: bárbara ' + plano.alvo.x + '|' + plano.alvo.y + ' (dist ' + plano.dist + ')\n'
      + 'Tropa: 1 explorador por comando\n\n'
      + 'Eles saem de verdade, eu meço a chegada que o servidor carimbou e CANCELO cada um\n'
      + 'em seguida. Se algum cancelamento falhar, o explorador espiona e volta sozinho —\n'
      + 'nenhuma tropa de combate entra nisso.\n\n'
      + 'Leva cerca de ' + Math.ceil((CC_CALIB_EM_MS + n * CC_CALIB_GAP_MS) / 60000) + ' min. Confirma?')) {
      ccCalibDiz('Cancelado.', '#6f6153');
      return;
    }

    const t0 = srvNowP() + CC_CALIB_EM_MS;
    const criados = [];
    for (let i = 0; i < n; i++) {
      // Agenda pela CHEGADA, que e como todo o resto do motor raciocina — `cmdPreparar` troca a
      // estimativa local pela duracao exata que o servidor devolve. Usar o mesmo caminho e o
      // ponto: se houver erro na conta de viagem, a calibracao tem que sentir esse erro tambem.
      const est = ccTempoViagemMs(plano.origem.x, plano.origem.y, plano.alvo.x, plano.alvo.y, { spy: 1 });
      const viagem = (est != null && est > 0) ? est : 600000;
      const c = cmdAdicionar('attack', plano.alvo.x, plano.alvo.y, { spy: 1 },
                             t0 + i * CC_CALIB_GAP_MS + viagem, plano.origem.vid, null);
      if (!c) continue;
      c._calib = true;
      c._calibEm = Date.now();
      criados.push(c.id);
    }
    if (!criados.length) { ccCalibDiz('Não consegui armar nenhum comando.', '#c0483a'); return; }
    _ccCalib = { ativa: true, ids: criados, n: criados.length, em: Date.now(), plano: plano };
    save();
    pushLog('🎯 Calibração: ' + criados.length + ' comando(s) de aferição armado(s) — '
      + plano.origem.nome + ' → bárbara ' + plano.alvo.x + '|' + plano.alvo.y
      + ' (1 explorador cada). Meço a chegada e cancelo cada um em seguida.', 'ok', 'cmd');
    ccCalibDiz('Armados. Acompanhe na fila — o primeiro sai em cerca de ' + Math.round(CC_CALIB_EM_MS / 1000) + 's.', '#2e7d3a');
    ccCalibRender();
    cmdTick();
  }

  // VARREDURA DE CANCELAMENTO. Roda do cmdTick, igual a de medicao, e pelo mesmo motivo: um
  // setTimeout em closure morre no F5, na troca de aba e quando outra aba assume a trava — e
  // aqui morrer significa TROPA NA ESTRADA. Este caminho sobrevive a tudo isso porque o unico
  // estado de que ele depende (`_calib`, `cmdId`) esta no disco, dentro do proprio comando.
  let _ccCalibCancelando = false;
  function ccCalibVarrer() {
    if (_ccCalibCancelando) return;
    const agora = Date.now();
    const alvo = cmdFila().find((c) => c._calib && !c._calibCancelado && c.state === 'enviado'
      && c.cmdId && (c._calibTent || 0) < 4);
    if (!alvo) { ccCalibExpirar(agora); return; }
    alvo._calibTent = (alvo._calibTent || 0) + 1;
    save();
    _ccCalibCancelando = true;
    cancelCommand(alvo.origin, alvo.cmdId)
      .then(() => {
        alvo._calibCancelado = true; save();
        pushLog('🎯 Calibração: comando de aferição cancelado (nenhuma tropa ficou na estrada).', 'ok', 'cmd');
        ccCalibRender();
      })
      .catch((e) => {
        pushLog('🎯 Calibração: não consegui cancelar um comando de aferição ('
          + (e.message || e) + '). Tento de novo; se não der, o explorador espiona e volta.', 'err', 'cmd');
      })
      .then(() => { _ccCalibCancelando = false; ccCalibFechar(); });
  }

  // Rede de seguranca 2: comando de calibracao que passou do prazo sem NUNCA ter conseguido
  // cmdId (medicao falhou) nao pode simplesmente ser esquecido. Avisa uma vez, com a verdade —
  // o explorador vai espionar e voltar, o que e chato mas nao custa nada.
  function ccCalibExpirar(agora) {
    const velhos = cmdFila().filter((c) => c._calib && !c._calibCancelado && !c._calibAvisado
      && c.state === 'enviado' && (agora - (c._calibEm || agora)) > CC_CALIB_PRAZO_MS);
    if (!velhos.length) return;
    velhos.forEach((c) => { c._calibAvisado = true; });
    save();
    pushLog('🎯 Calibração: ' + velhos.length + ' comando(s) de aferição passaram da janela de '
      + 'cancelamento sem eu conseguir identificá-los na praça (a medição não casou). '
      + 'O explorador vai espionar a bárbara e voltar sozinho — não se perde tropa, mas essa '
      + 'amostra não calibrou nada.', 'err', 'cmd');
    ccCalibFechar();
  }

  function ccCalibFechar() {
    if (!_ccCalib || !_ccCalib.ativa) return;
    const meus = cmdFila().filter((c) => _ccCalib.ids.indexOf(c.id) >= 0);
    const abertos = meus.filter((c) => c.state !== 'enviado' || (!c._calibCancelado && !c._calibAvisado));
    if (abertos.length) return;
    _ccCalib.ativa = false;
    const r = ccCalibResumo();
    const mediram = meus.filter((c) => c.medido && !c.medido.descartada).length;
    pushLog('🎯 Calibração concluída — ' + mediram + '/' + meus.length + ' comando(s) mediram. '
      + (r.amostras
        ? 'Viés agora: ' + (r.bias >= 0 ? '+' : '') + r.bias + 'ms · últimas amostras entre '
          + r.min + ' e ' + r.max + 'ms (desvio ' + r.dp + 'ms).'
        : 'Nenhuma amostra válida — veja os avisos acima.'), mediram ? 'ok' : 'err', 'cmd');
    ccCalibRender();
  }

  function ccCalibDiz(t, cor) {
    const el = document.getElementById('cc-calib-msg');
    if (el) { el.textContent = t; el.style.color = cor || '#6f6153'; }
  }

  // A TELA. O que ela precisa responder e uma pergunta so: "da pra confiar no horario?".
  // Entao ela mostra a FAIXA medida, nao so o vies — e diz em portugues o que a faixa
  // significa pra um snipe, que e a decisao real por tras do numero.
  function ccCalibRender() {
    const box = document.getElementById('cc-calib-estado');
    if (!box) return;
    const r = ccCalibResumo();
    if (!r.amostras) {
      box.innerHTML = '<span style="color:#c0483a">Nunca calibrou.</span> '
        + '<span style="color:#8a7d6d">O agendador está usando lead '
        + (r.bias >= 0 ? '+' : '') + r.bias + 'ms sem nenhuma medição por trás.</span>';
      return;
    }
    const faixa = r.max - r.min;
    const cor = faixa <= 80 ? '#2e7d3a' : faixa <= 250 ? '#a2643a' : '#c0483a';
    const veredito = faixa <= 80 ? 'firme — dá pra mirar janelas curtas'
      : faixa <= 250 ? 'aceitável — evite janelas abaixo de ' + Math.ceil(faixa / 100) * 100 + 'ms'
      : 'instável — a rede está variando mais que a precisão que o motor consegue entregar';
    box.innerHTML =
      '<b style="color:#a2643a">viés ' + (r.bias >= 0 ? '+' : '') + r.bias + 'ms</b>'
      + ' <span style="color:#8a7d6d">· ' + r.n + ' medição(ões) na vida</span><br>'
      + '<span style="color:#6f6153">últimas ' + r.amostras + ': entre <b>' + r.min + '</b> e <b>'
      + r.max + '</b>ms (desvio ' + r.dp + 'ms)</span><br>'
      + '<span style="color:' + cor + '">' + esc(veredito) + '</span>';
  }
