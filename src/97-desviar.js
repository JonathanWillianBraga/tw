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

