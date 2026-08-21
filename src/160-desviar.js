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
  //
  // Lê a PRAÇA da origem, não `overview_villages&mode=commands`.
  //
  // Aquela tela é STATEFUL — o jogo lembra o último `mode` e redireciona. Medido na conta do
  // usuário: o mesmo endereço devolveu `mode=combined`, sem link de comando nenhum, e a
  // contagem de ids deu ZERO. Funciona ou não dependendo do que a aba visitou antes, que é o
  // pior tipo de dependência possível — o envio parecia funcionar e a confirmação não.
  //
  // A praça é por aldeia e não guarda estado. Os ids vêm em `.quickedit-out[data-id]`, que está
  // no HTML servido; os links de `info_command` são montados por JavaScript e NÃO estão lá.
  async function findLatestSupportCommand(originVid, targetCoord) {
    try {
      const res = await fetch('/game.php?village=' + originVid + '&screen=place&_=' + Date.now(),
        { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return null;
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      let bestId = null, bestNum = -Infinity;
      doc.querySelectorAll('tr.command-row').forEach((row) => {
        const txt = (row.textContent || '').replace(/\s+/g, ' ');
        if (targetCoord && txt.indexOf(targetCoord) < 0) return;
        // Só o apoio SAINDO. "Retorno" e "interrompido" são tropa voltando, não o que queremos.
        if (/Retorno|interrompid/i.test(txt)) return;
        const el = row.querySelector('.quickedit-out[data-id]');
        if (!el) return;
        const id = el.getAttribute('data-id');
        const n = parseInt(id, 10);
        if (n > bestNum) { bestNum = n; bestId = id; }   // id cresce com o tempo
      });
      return bestId;
    } catch (e) { return null; }
  }

  // O comando ainda existe na lista de saídas da aldeia? É a ÚNICA prova de cancelamento que vale.
  //
  // Duas coisas estavam erradas aqui, e juntas faziam esta função responder "sumiu" SEMPRE — ou
  // seja, todo cancelamento era reportado como sucesso, independentemente do que aconteceu.
  // Medido na conta do usuário (ago/2026):
  //
  //   1. usava `overview_villages&mode=commands`, que o jogo REDIRECIONA pra `mode=combined`.
  //      A tela devolvida não tem link de comando nenhum: a contagem de ids deu ZERO.
  //   2. procurava por regex em `[?&]id=N`, mas os links de `info_command` são montados por
  //      JavaScript — não estão no HTML servido. Mesmo na tela certa, a regex acharia zero.
  //
  // Agora lê a PRAÇA da aldeia de origem e pega `.quickedit-out[data-id]`, que vem no HTML.
  // Conferido: 38 linhas, 38 ids, comando vivo encontrado, comando cancelado não encontrado.
  //
  // E a trava que faltava: lista VAZIA agora LANÇA em vez de devolver "sumiu". Confundir
  // "não achei nada" com "não existe" foi exatamente o defeito — e é um erro que só aparece
  // quando custa caro, porque o caso normal (tropa fora, cancelamento urgente) é justamente
  // quando ninguém confere na mão.
  async function comandoAindaExiste(vid, cmdId) {
    const r = await fetch('/game.php?village=' + vid + '&screen=place&_=' + Date.now(),
      { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ao reler a praça');
    const html = await r.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const linhas = doc.querySelectorAll('tr.command-row');
    if (!linhas.length) {
      // Pode ser aldeia sem comando nenhum — mas nós ACABAMOS de mandar um apoio daqui, então
      // lista vazia significa que a leitura falhou, não que o comando sumiu.
      throw new Error('a praça de ' + vid + ' voltou sem nenhum comando — não dá pra confirmar');
    }
    const ids = [];
    doc.querySelectorAll('.quickedit-out[data-id]').forEach((e) => ids.push(e.getAttribute('data-id')));
    if (!ids.length) throw new Error('não consegui ler os ids dos comandos da praça de ' + vid);
    return ids.indexOf(String(cmdId)) >= 0;
  }

  // Cancela e CONFIRMA. Antes isto era `if (r.ok) return true` — mas o TW responde HTTP 200 com
  // página de erro quando o id/token não serve ou o comando já pousou. O log dizia "Desvio OK" e
  // o exército continuava fora de casa. Agora só devolve sucesso se o comando sumiu da lista.
  async function cancelCommand(vid, cmdId) {
    // ANTES de tentar: se o comando ja sumiu, ele NAO foi cancelado — ele POUSOU. Some da lista
    // nos dois casos, e a verificacao por efeito la embaixo ('sumiu = cancelado') dava sucesso
    // pra tropa que na verdade ficou estacionada na vizinha. Era o defeito que fazia o modulo
    // dizer 'Desvio OK' com o exercito fora de casa.
    try {
      if (!(await comandoAindaExiste(vid, cmdId))) {
        throw new Error('o apoio ja pousou na vizinha — nao da mais pra cancelar; retire a tropa pela tela de Apoios');
      }
    } catch (e) {
      // Falha de LEITURA nao pode virar 'pousou': segue e tenta cancelar do mesmo jeito.
      if (/ja pousou/.test(e.message || '')) throw e;
    }
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

  // Espera entre tentativas de cancelamento. Cresce, mas começa curta: com tropa fora de casa,
  // esperar minutos pra tentar de novo é pior que insistir. Teto de 6 tentativas (~5 min no
  // total) — depois disso é problema que só a mão resolve, e aí a notificação é o caminho.
  const DESV_RETRY_MS = [5000, 15000, 30000, 60000, 120000];
  const DESV_CANCEL_MAX = 6;

  // Dispara a tentativa AGORA, sem esperar o `cancelAt` de novo (ele já passou).
  function scheduleDesviarCancelAgora(id) {
    const cur = (config.desviar.pending || []).find((x) => x.id === id);
    if (!cur || cur.state !== 'scheduled') return;
    scheduleDesviarCancel(Object.assign({}, cur, { cancelAt: serverNow() }));
  }

  function scheduleDesviarCancel(item) {
    const delay = Math.max(0, item.cancelAt - serverNow());
    desvAgendar(item.id + ':cancel', delay, async () => {
      const cur = (config.desviar.pending || []).find((x) => x.id === item.id);
      if (!cur || cur.state !== 'scheduled') return;
      try {
        await cancelCommand(cur.vid, cur.cmdId);   // lança se não conseguir CONFIRMAR
        cur.state = 'canceled'; cur.err = ''; cur.cancelTent = 0;
      } catch (e) { cur.state = 'failed'; cur.err = e.message || String(e); }
      if (cur.state === 'canceled') {
        // A leva acabou: tira as marcas dela e arma a proxima, se houver. Sem isto, marcar tres
        // levas so desviaria a primeira — as marcas seguintes ficariam sem plano.
        const de = cur.primeiroAtaque, ate = cur.ultimoAtaque;
        if (de != null && ate != null) {
          config.desviar.marks = (config.desviar.marks || []).filter((m) =>
            !(m.coord === cur.coordOrigem && m.arriveAt >= de && m.arriveAt <= ate));
        }
        save();
        pushLog('🚨 Desvio OK — tropa voltando (aldeia ' + cur.vid + ', comando ' + cur.cmdId + ').', 'ok', 'desv');
        const resto = desviarMarcas(cur.coordOrigem).length;
        if (resto) {
          pushLog('🚨 Desvio ' + cur.coordOrigem + ': ainda ha ' + resto + ' ataque(s) marcado(s) — armando a proxima leva.', '', 'desv');
          desviarReplanejar(cur.coordOrigem);
        }
        desviarRefreshRowStates();
        return;
      }
      // FALHOU. Isto significa tropa FORA DE CASA, que é o pior estado do módulo — e até agora
      // era o único SEM saída: `failed` não era retentado por ninguém, nem por um F5 (o
      // desviarResumeAll só ressuscitava `scheduled`). Uma queda de rede de dois segundos
      // deixava o exército fora até você notar o log.
      //
      // Agora retenta com espera crescente. O cancelamento é idempotente do jeito que importa:
      // `cancelCommand` confirma pelo EFEITO (o comando sumiu da lista), então retentar um
      // cancelamento que já funcionou devolve sucesso em vez de estragar algo.
      cur.cancelTent = (cur.cancelTent || 0) + 1;
      save();
      const espera = DESV_RETRY_MS[Math.min(cur.cancelTent - 1, DESV_RETRY_MS.length - 1)];
      if (cur.cancelTent < DESV_CANCEL_MAX) {
        cur.state = 'scheduled';   // volta pra fila: é o estado que o resume e o timer entendem
        save();
        pushLog('🚨 Desvio: o cancelamento da aldeia ' + cur.vid + ' falhou (' + cur.err
          + '). Tentativa ' + cur.cancelTent + ' de ' + DESV_CANCEL_MAX + ' — repito em '
          + Math.round(espera / 1000) + 's. A tropa segue FORA.', 'err', 'desv');
        desvAgendar(cur.id + ':cancel', espera, () => scheduleDesviarCancelAgora(cur.id));
      } else {
        pushLog('🚨 DESVIO FALHOU — a tropa da aldeia ' + cur.vid + ' NÃO voltou depois de '
          + cur.cancelTent + ' tentativas: ' + cur.err + '. Cancele o comando ' + cur.cmdId
          + ' na mão, agora.', 'err', 'desv');
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
  // ---- Agrupamento por LEVA -------------------------------------------------------------
  // Um desvio atende uma LEVA de ataques, nao todos os marcados. Ataques a menos de `janelaMs`
  // um do outro entram na mesma leva; um intervalo maior comeca leva nova, com saida e volta
  // proprias.
  //
  // Antes o plano ia do PRIMEIRO ao ULTIMO ataque marcado, por mais distantes que fossem. Com
  // ataques as 10:00 e as 10:40 isso mandava a tropa sair 09:59:30 e so voltar 10:40:05 — 40
  // minutos fora, e o apoio POUSAVA na vizinha muito antes disso. Comando que pousou nao se
  // cancela, entao a tropa ficava estacionada fora e o modulo achava que tinha dado certo.
  //
  // Com a leva, a janela entre sair e voltar fica em ~95s no pior caso, e qualquer vizinha esta
  // a minutos de distancia — o apoio ainda esta voando na hora de cancelar, que e a unica
  // situacao em que cancelar devolve a tropa.
  function desviarLevas(coord) {
    const ms = desviarMarcas(coord);
    if (!ms.length) return [];
    const jan = config.desviar.janelaMs || 60000;
    const levas = [[ms[0]]];
    for (let i = 1; i < ms.length; i++) {
      const ant = levas[levas.length - 1];
      if (ms[i].arriveAt - ant[ant.length - 1].arriveAt <= jan) ant.push(ms[i]);
      else levas.push([ms[i]]);
    }
    return levas;
  }
  function desviarPlanoDe(coord) {
    const levas = desviarLevas(coord);
    if (!levas.length) return null;
    const agora = serverNow();
    const antes = config.desviar.sendBeforeMs || 30000;
    // A leva atendida e a proxima cuja saida ainda da tempo. Leva cuja hora de sair ja passou
    // ha mais de um minuto e caso perdido: insistir nela seguraria as seguintes.
    const leva = levas.find((l) => (l[0].arriveAt - antes) > (agora - 60000));
    if (!leva) return null;
    return {
      coord: coord,
      vid: leva[0].vid,
      primeiro: leva[0].arriveAt,
      ultimo: leva[leva.length - 1].arriveAt,
      qtd: leva.length,
      levas: levas.length,
      sendAt: leva[0].arriveAt - antes,
      cancelAt: leva[leva.length - 1].arriveAt + (config.desviar.cancelOffsetMs || 5000),
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
               primeiroAtaque: plano.primeiro, ultimoAtaque: plano.ultimo, state: 'waiting', err: '' };
      config.desviar.pending.push(pend);
    } else {
      pend.sendAt = plano.sendAt; pend.cancelAt = plano.cancelAt;
      pend.primeiroAtaque = plano.primeiro; pend.ultimoAtaque = plano.ultimo;
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
    pushLog('🚨 Desvio ' + coord + ' armado: leva de ' + plano.qtd + ' ataque(s)'
      + (plano.levas > 1 ? (' (1ª de ' + plano.levas + ' levas)') : '') + ' · sai às '
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
      // `failed` com tentativas sobrando volta pra fila. Antes ficava aqui pra sempre: o pior
      // estado do módulo — tropa fora — era o único que um F5 não recuperava. Se o navegador
      // fechou no meio das retentativas, é exatamente quando mais se precisa que elas voltem.
      else if (item.state === 'failed' && item.cmdId && (item.cancelTent || 0) < DESV_CANCEL_MAX) {
        item.state = 'scheduled';
        pushLog('🚨 Desvio: retomando o cancelamento da aldeia ' + item.vid + ' (tentativa '
          + ((item.cancelTent || 0) + 1) + ' de ' + DESV_CANCEL_MAX + '). A tropa está FORA.', 'err', 'desv');
        scheduleDesviarCancel(Object.assign({}, item, { cancelAt: agora }));
      }
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

