  // ==================== CENTRO DE COMANDO — ENSAIO (ccEnsaio*) ====================
  // Parte da ILHA do Centro de Comando. A ilha ABRE em 171-cc-nucleo.js e FECHA em
  // 179-cc-painel.js: nenhum arquivo do meio abre ou fecha chave de IIFE.
  //
  // ---------------------------------------------------------------------------------------
  // O QUE ISTO E
  //
  // Um ensaio de operacao: escolhe um alvo, pega N das suas aldeias, e programa ATAQUE e APOIO
  // de cada uma pra chegarem TODOS no mesmo horario. Serve pra responder, em 5 segundos e sem
  // gastar nada, a pergunta que hoje so se responde arriscando uma operacao de verdade:
  //
  //     "a conta de viagem, saida e ordem esta certa?"
  //
  // ---------------------------------------------------------------------------------------
  // POR QUE ELE E SECO POR PADRAO
  //
  // Um "teste" que arma comando na fila NAO e teste: o motor prepara 60s antes da saida e
  // DISPARA. Voce ia olhar a tabela, se distrair, e a tropa saia. Entao o padrao aqui e o
  // ensaio SECO — nada entra na fila, nada sai.
  //
  // E ele nao e uma simulacao escrita a parte, que e o defeito classico de tela de previa
  // ("mostra uma coisa e o botao faz outra"). Ele usa `ccTempoViagemMs`, o MESMO calculo de
  // viagem que o armar de verdade usa. Se a conta estiver errada, a tabela mostra errado — que
  // e exatamente o que se quer de um ensaio.
  //
  // Armar de verdade e um segundo botao, separado e explicito, com marcador `_ensaio` pra dar
  // pra limpar tudo num clique.
  //
  // ---------------------------------------------------------------------------------------
  // POR QUE ATAQUE **E** APOIO NA MESMA TABELA
  //
  // Porque e onde o erro aparece. Os dois miram a MESMA chegada, mas a tropa e diferente
  // (cavalaria leve x lanceiro), entao a viagem e diferente, entao a SAIDA tem que ser
  // diferente. Ver as duas colunas lado a lado, com origens de distancias variadas, e o jeito
  // mais rapido de perceber que a conta escorregou: se duas linhas com viagens diferentes
  // mostram a mesma saida, tem defeito.

  // Composicao do ensaio. Uma unidade de cada, de proposito: o que se afere e o TEMPO, e o
  // tempo sai da unidade mais lenta do comando. Cavalaria leve (ataque) e lanceiro (apoio) tem
  // velocidades diferentes — e essa diferenca e justamente o que a tabela precisa exibir.
  const CC_ENSAIO_ATQ = { light: 1 };
  const CC_ENSAIO_APO = { spear: 1 };
  const CC_ENSAIO_N_PADRAO = 5;

  // Alvo do ensaio: o que estiver digitado no campo Alvo; senao, a barbara mais proxima da sua
  // aldeia atual. Nunca uma aldeia de jogador escolhida por mim — mirar alguem sem querer, mesmo
  // em ensaio seco, e o tipo de acidente que nao se desfaz depois de armar de verdade.
  async function ccEnsaioAlvo() {
    const digitado = (typeof ccAlvo === 'function') ? ccAlvo() : null;
    if (digitado) return { x: +digitado.x, y: +digitado.y, fonte: 'campo Alvo' };
    const eu = CCVILAS.find((v) => String(v.vid) === String(CUR_VID)) || CCVILAS[0];
    if (!eu || eu.x == null) throw new Error('não sei onde você está — abra a praça de reunião');
    const barbs = (await getMapVillages()).filter((v) => v.player === '0');
    if (!barbs.length) throw new Error('nenhuma bárbara no village.txt pra usar de alvo');
    let alvo = null, melhor = Infinity;
    barbs.forEach((b) => { const d = fieldDist(eu.x, eu.y, +b.x, +b.y); if (d < melhor) { melhor = d; alvo = b; } });
    return { x: +alvo.x, y: +alvo.y, fonte: 'bárbara mais próxima' };
  }

  // Monta o plano. NAO toca na fila, NAO faz requisicao de envio — so calcula.
  async function ccEnsaioMontar(n) {
    n = Math.max(1, Math.min(12, n || CC_ENSAIO_N_PADRAO));
    if (!CCVILAS.length) throw new Error('a lista de aldeias ainda não carregou — espere a praça abrir');
    const alvo = await ccEnsaioAlvo();
    // Origens: as N mais PROXIMAS do alvo que tenham coordenada. Mais proximas primeiro porque e
    // assim que o armar de verdade escolhe — o ensaio tem que ensaiar a mesma escolha.
    const origens = CCVILAS
      .filter((v) => v.x != null && !(v.x === alvo.x && v.y === alvo.y))
      .map((v) => ({ v: v, d: fieldDist(v.x, v.y, alvo.x, alvo.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, n);
    if (!origens.length) throw new Error('nenhuma aldeia sua com coordenada conhecida');

    // A chegada: a mais lenta de todas MAIS uma folga. Precisa caber a viagem mais longa, senao
    // a saida daria no passado e o ensaio mostraria numero negativo em vez de plano.
    let maisLenta = 0;
    origens.forEach((o) => {
      [CC_ENSAIO_ATQ, CC_ENSAIO_APO].forEach((amt) => {
        const t = ccTempoViagemMs(o.v.x, o.v.y, alvo.x, alvo.y, amt) || 0;
        if (t > maisLenta) maisLenta = t;
      });
    });
    const chegada = srvNowP() + maisLenta + 10 * 60000;   // 10 min de folga sobre a mais lenta

    const linhas = [];
    origens.forEach((o) => {
      [['attack', CC_ENSAIO_ATQ, '⚔ ataque'], ['support', CC_ENSAIO_APO, '🛡 apoio']].forEach(([tipo, amt, rot]) => {
        const viagem = ccTempoViagemMs(o.v.x, o.v.y, alvo.x, alvo.y, amt);
        linhas.push({
          tipo: tipo, rot: rot, vid: o.v.vid,
          nome: (o.v.nome || '') + ' ' + (o.v.coord || ''),
          dist: Math.round(o.d * 10) / 10,
          viagem: viagem, saida: (viagem != null) ? (chegada - viagem) : null,
          amounts: amt,
        });
      });
    });
    // Ordena pela SAIDA: e a ordem em que as coisas realmente acontecem, e a unica em que da
    // pra conferir a olho se o escalonamento faz sentido.
    linhas.sort((a, b) => (a.saida || 0) - (b.saida || 0));
    return { alvo: alvo, chegada: chegada, linhas: linhas, n: origens.length };
  }

  let _ccEnsaio = null;

  async function ccEnsaioRodar() {
    const box = document.getElementById('cc-ensaio-out');
    const nEl = document.getElementById('cc-ensaio-n');
    if (box) box.innerHTML = '<span class="twmgr-lbl">calculando…</span>';
    let p;
    try { p = await ccEnsaioMontar(parseInt(nEl && nEl.value, 10) || CC_ENSAIO_N_PADRAO); }
    catch (e) { if (box) box.innerHTML = '<span style="color:#c0483a;font-size:10px">' + esc(e.message || e) + '</span>'; return; }
    _ccEnsaio = p;
    ccEnsaioRender();
  }

  function ccEnsaioRender() {
    const box = document.getElementById('cc-ensaio-out'); if (!box) return;
    if (!_ccEnsaio) { box.innerHTML = ''; return; }
    const p = _ccEnsaio;
    const hhmm = (ms) => (ms == null ? '—' : srvClockMs(ms));
    const dur = (ms) => {
      if (ms == null) return '—';
      const s = Math.round(ms / 1000);
      return Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
        + ':' + String(s % 60).padStart(2, '0');
    };
    // Conferencia automatica: viagens diferentes TEM que dar saidas diferentes. Se nao derem, a
    // conta escorregou — e melhor a tela dizer isso do que esperar o usuario reparar.
    const porViagem = {};
    p.linhas.forEach((l) => { if (l.viagem != null) porViagem[l.viagem] = (porViagem[l.viagem] || 0) + 1; });
    const saidasDistintas = Object.keys(p.linhas.reduce((m, l) => { m[l.saida] = 1; return m; }, {})).length;
    const viagensDistintas = Object.keys(porViagem).length;
    const coerente = saidasDistintas === viagensDistintas;
    const semViagem = p.linhas.filter((l) => l.viagem == null).length;

    box.innerHTML =
      '<div style="font-size:10px;color:#6f6153;margin-bottom:4px">' +
        '<b>' + p.linhas.length + '</b> comando(s) de ' + p.n + ' aldeia(s) → <b>' + p.alvo.x + '|' + p.alvo.y + '</b> ' +
        '<span style="color:#8a7d6d">(' + esc(p.alvo.fonte) + ')</span> · todos chegando <b>' + hhmm(p.chegada) + '</b>' +
      '</div>' +
      (semViagem
        ? '<div style="font-size:10px;color:#c0483a;margin-bottom:4px">⚠ ' + semViagem
          + ' linha(s) sem tempo de viagem — o cálculo local não resolveu essa origem.</div>'
        : '<div style="font-size:10px;color:' + (coerente ? '#2e7d3a' : '#c0483a') + ';margin-bottom:4px">' +
          (coerente
            ? '✔ coerente: ' + viagensDistintas + ' viagem(ns) distinta(s) → ' + saidasDistintas + ' saída(s) distinta(s)'
            : '✕ INCOERENTE: ' + viagensDistintas + ' viagem(ns) distinta(s) mas ' + saidasDistintas
              + ' saída(s) — comandos com viagens diferentes deveriam sair em horas diferentes') +
          '</div>') +
      '<table class="twmgr-bld-tab" style="width:100%">' +
      '<thead><tr><th style="width:52px">tipo</th><th>origem</th><th style="width:44px">dist</th>' +
      '<th style="width:64px">viagem</th><th style="width:92px">sai</th><th style="width:92px">chega</th></tr></thead><tbody>' +
      p.linhas.map((l, i) =>
        '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">' +
        '<td style="white-space:nowrap">' + l.rot + '</td>' +
        '<td>' + esc(l.nome) + '</td>' +
        '<td>' + l.dist + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + dur(l.viagem) + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + hhmm(l.saida) + '</td>' +
        '<td style="font-variant-numeric:tabular-nums;color:#8a7d6d">' + hhmm(p.chegada) + '</td>' +
        '</tr>').join('') +
      '</tbody></table>' +
      '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Ensaio SECO: nada foi armado e nada vai sair. ' +
      'Ataque leva cavalaria leve, apoio leva lanceiro — velocidades diferentes de propósito, pra a coluna "sai" ter o que provar.</div>';
    const bt = document.getElementById('cc-ensaio-armar');
    if (bt) bt.style.display = 'inline-block';
  }

  // ARMAR DE VERDADE — botao separado, e so aparece depois do ensaio seco. Marca cada comando
  // com `_ensaio` pra o "limpar" saber o que e dele e nao encostar no que voce armou a mao.
  function ccEnsaioArmar() {
    if (!_ccEnsaio) return;
    const p = _ccEnsaio;
    if (!confirm('Armar de VERDADE os ' + p.linhas.length + ' comando(s) do ensaio?\n\n'
      + 'Alvo: ' + p.alvo.x + '|' + p.alvo.y + '\n'
      + 'Chegada: ' + srvClockMs(p.chegada) + '\n\n'
      + 'Eles entram na fila e o motor VAI DISPARAR na hora calculada — a primeira saída é\n'
      + srvClockMs(p.linhas[0].saida) + '. Pra desistir, use "🧹 limpar ensaio" antes disso.')) return;
    let n = 0;
    p.linhas.forEach((l) => {
      const c = cmdAdicionar(l.tipo, String(p.alvo.x), String(p.alvo.y), l.amounts, p.chegada, l.vid, null);
      if (c) { c._ensaio = true; n++; }
    });
    save();
    pushLog('🧪 Ensaio: ' + n + ' comando(s) armado(s) de verdade → ' + p.alvo.x + '|' + p.alvo.y
      + ', chegando ' + srvClockMs(p.chegada) + '. Use "limpar ensaio" pra cancelar antes da saída.', 'ok', 'cmd');
    const bt = document.getElementById('cc-ensaio-limpar');
    if (bt) bt.style.display = 'inline-block';
    ccRender();
  }

  // Tira da fila SO o que o ensaio armou, e so o que ainda nao saiu. Comando ja enviado nao se
  // desarma tirando da lista — pra aquele o caminho e o cancelamento do jogo.
  function ccEnsaioLimpar() {
    const antes = cmdFila().length;
    const presos = cmdFila().filter((c) => c._ensaio && c.state === 'enviado').length;
    config.cmd.fila = cmdFila().filter((c) => !(c._ensaio && c.state !== 'enviado'));
    save();
    const tirados = antes - cmdFila().length;
    pushLog('🧪 Ensaio: ' + tirados + ' comando(s) do ensaio tirados da fila.'
      + (presos ? ' ' + presos + ' já tinham SAÍDO — esses só o cancelamento do jogo desfaz.' : ''),
      presos ? 'err' : 'ok', 'cmd');
    ccRender();
  }
