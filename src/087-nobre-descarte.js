  // ==================== DESCARTE DE NOBRE INÚTIL (nbDesc*) ====================
  // Tira de circulação nobre que não serve pra nada — o que "não tem acesso a lugar nenhum".
  //
  // POR QUE ISTO EXISTE
  //
  // Nobre parado custa DUAS coisas, toda hora, sem dar nada em troca: um slot do limite de
  // nobres DA CONTA (que impede formar nobre numa aldeia que alcança alvo) e a população da
  // aldeia. A v11.223.0 estancou a sangria — o Noblar parou de formar nobre em cima de nobre
  // parado — mas não resolve o que JÁ está encalhado.
  //
  // TRÊS DESTINOS, nesta ordem de preferência
  //
  //   1. SUA PRÓPRIA ALDEIA (defendida) — o jogo deixa atacar aldeia sua, e o nobre morre lá.
  //      É a melhor: suas aldeias estão sempre por perto (não dependem de sorte no mapa), a
  //      morte é CERTA, e não mexe com bárbara nenhuma que você talvez queira conquistar.
  //      Só entra aldeia com defesa — ver a trava logo abaixo.
  //
  //   2. BÁRBARA PERTO — nobre + escolta de exploradores. Se a bárbara tiver defesa, o nobre
  //      morre (o pedido). Se estiver indefesa, o ataque VENCE: o nobre volta e a lealdade dela
  //      cai, o que é progresso pra conquistar de graça. Nos dois casos é melhor que o lixo.
  //
  //   3. DISPENSAR — o `screen=train&mode=decommission` do proprio jogo (tela "Dispensar").
  //      Ultimo recurso: nao devolve NADA, nem recurso nem moeda. So se justifica porque o slot
  //      preso vale mais que o nobre encalhado.
  //
  // POR QUE O ALCANCE PRECISA SER CONFIGURAVEL — e por que 1h nao basta
  //
  // Nobre anda 35 min/campo neste mundo, entao 1 HORA = 1,71 CAMPOS. Medido no mapa real da
  // conta (70 aldeias, 26.602 barbaras):
  //
  //     ate 1,71 campos (1h) ....... 18 aldeias de 70   (26%)
  //     ate 3,43        (2h) ....... +19  -> 37         (53%)
  //     ate 5,14        (3h) ....... +22  -> 59         (84%)
  //     ate 8,57        (5h) ....... +11  -> 70        (100%)
  //
  // Com o limite em 1h, 52 das 70 aldeias nao teriam bárbara ao alcance e cairiam no Dispensar.
  // Por isso o limite e um campo, e nao uma constante: e o usuario que decide quanto tempo de
  // viagem vale a pena pra nao queimar a moeda.
  //
  // NADA AQUI E AUTOMATICO. As duas acoes sao irreversiveis e nenhuma roda em ciclo: e botao,
  // com previa do que vai acontecer com CADA nobre, e confirmacao que nomeia as aldeias.

  const NBDESC_MOTIVO_ALVO = 'nenhum alvo no alcance';   // o motivo exato que nobleOciosos() carimba
  const NBDESC_SPY_PADRAO = 5;
  const NBDESC_HORAS_PADRAO = 1;

  // ---------------------------------------------------------------------------------------
  // ALVO PREFERIDO: A SUA PROPRIA ALDEIA — e a trava que impede o tiro pela culatra
  //
  // O jogo DEIXA atacar aldeia sua, e o nobre morre la. Isso e melhor que a barbara por tres
  // motivos: as suas aldeias estao sempre perto (nao dependem de sorte no mapa), a morte e
  // certa, e nao mexe com barbara nenhuma que voce talvez queira conquistar depois.
  //
  // MAS tem um jeito de sair pela culatra, e foi o proprio usuario que apontou: "inclusive e
  // possivel se noblar". Se a aldeia escolhida estiver SEM DEFESA, o ataque VENCE — o nobre
  // sobrevive e a lealdade DA SUA ALDEIA cai. Repetido, voce conquista a si mesmo.
  //
  // A regra que fecha isso: so serve aldeia com defesa suficiente pra o ataque PERDER. Um nobre
  // mais alguns exploradores e um ataque ridiculo (nobre ataca 30, explorador ataca 0), entao
  // meia duzia de lanceiros ja bastaria. O piso aqui e MUITO mais alto que o necessario de
  // proposito: a leitura de tropa e um retrato, pode estar velha, e o custo de errar e a
  // lealdade da propria aldeia. Margem larga sai de graca — sobra aldeia defendida.
  const NBDESC_DEF_MIN = 200;
  const NBDESC_DEF_UNITS = ['spear', 'sword', 'archer', 'heavy'];

  function nbDescCfg() {
    const c = config.noble;
    if (!c.descarte) c.descarte = {};
    const d = c.descarte;
    if (d.horas == null) d.horas = NBDESC_HORAS_PADRAO;
    if (d.spies == null) d.spies = NBDESC_SPY_PADRAO;
    // Dispensar e OPT-IN separado do resto: mandar numa barbara e reversivel na intencao (voce
    // ainda ganha alguma coisa); dispensar e perda pura. Nao podem estar atras do mesmo sim.
    if (d.permitirDispensar == null) d.permitirDispensar = false;
    return d;
  }

  // Monta o plano SEM AGIR. Devolve uma linha por aldeia com nobre inútil, dizendo o destino.
  async function nbDescPlano() {
    const d = nbDescCfg();
    const ocio = await nobleOciosos();
    // SO o motivo mais estrito. `falta escolta` e `sem alvo na fila` sao temporarios — a escolta
    // volta do saque, e a fila enche quando voce poe alvo. Descartar por causa deles seria
    // destruir nobre por causa de um estado que passa sozinho.
    const inuteis = (ocio || []).filter((o) => o.motivo === NBDESC_MOTIVO_ALVO);
    if (!inuteis.length) return { linhas: [], nenhum: true };
    const [vel, mapa, todas] = await Promise.all([nobleVelNobre(), getMapVillages(), getAllVillagesCached()]);
    const barbs = (mapa || []).filter((v) => v.player === '0');
    const tropaPor = await nobleSnobPorAldeia(true);
    const limMin = Math.max(0.1, parseFloat(d.horas) || NBDESC_HORAS_PADRAO) * 60;
    const linhas = [];
    inuteis.forEach((o) => {
      const m = (o.coord || '').match(/(\d+)\|(\d+)/); if (!m) return;
      const x = +m[1], y = +m[2];
      // Bárbara mais perto. A viagem e a do NOBRE (35 min/campo): explorador e mais rapido, mas
      // quem manda no tempo do comando e a unidade mais LENTA.
      const tropa = tropaPor[String(o.vid)] || {};
      const spies = Math.min(Math.max(0, parseInt(d.spies, 10) || 0), tropa.spy || 0);

      // 1) MINHA ALDEIA DEFENDIDA, a mais perto. Preferida: morte certa e sempre por perto.
      //    A propria aldeia de origem esta fora (nao da pra atacar a si mesma de si mesma).
      let mine = null, dMine = Infinity;
      (todas || []).forEach((v) => {
        if (String(v.vid) === String(o.vid)) return;
        const mm = (v.coord || '').match(/(\d+)\|(\d+)/); if (!mm) return;
        const t = tropaPor[String(v.vid)] || {};
        const def = NBDESC_DEF_UNITS.reduce((s, u) => s + (t[u] || 0), 0);
        if (def < NBDESC_DEF_MIN) return;                 // sem defesa = risco de auto-noblar
        const dd = fieldDist(x, y, +mm[1], +mm[2]);
        if (dd < dMine) { dMine = dd; mine = { coord: v.coord, nome: v.name || v.coord, def: def }; }
      });
      // 2) BARBARA mais perto (fallback: mata se ela tiver defesa, senao derruba lealdade dela).
      let alvo = null, melhor = Infinity;
      barbs.forEach((b) => { const dd = fieldDist(x, y, +b.x, +b.y); if (dd < melhor) { melhor = dd; alvo = b; } });

      const minMine = mine ? dMine * vel : Infinity;
      const minBarb = alvo ? melhor * vel : Infinity;
      const cabeMine = mine && minMine <= limMin;
      const cabeBarb = alvo && minBarb <= limMin;
      const usa = cabeMine ? 'minha' : cabeBarb ? 'barbara' : (d.permitirDispensar ? 'dispensar' : 'nada');
      const alvoCoord = usa === 'minha' ? mine.coord : usa === 'barbara' ? (alvo.x + '|' + alvo.y) : null;
      const min = usa === 'minha' ? minMine : usa === 'barbara' ? minBarb : null;
      const campos = usa === 'minha' ? dMine : usa === 'barbara' ? melhor : null;
      linhas.push({
        vid: o.vid, nome: o.nome, coord: o.coord, nobres: o.nobres,
        alvo: alvoCoord, alvoNome: usa === 'minha' ? mine.nome : null,
        def: usa === 'minha' ? mine.def : null,
        campos: campos != null ? Math.round(campos * 100) / 100 : null,
        minutos: min != null ? Math.round(min) : null,
        spies: spies, spiesPedidos: parseInt(d.spies, 10) || 0,
        destino: usa,
        porque: (usa === 'minha' || usa === 'barbara') ? null
              : (!mine && !alvo) ? 'não achei aldeia defendida nem bárbara'
              : 'mais perto: ' + (mine ? 'sua ' + mine.coord + ' a ' + fmtDur(Math.round(minMine * 60)) : '—')
                + (alvo ? ' · bárbara a ' + fmtDur(Math.round(minBarb * 60)) : '')
                + ' — fora do limite' + (d.permitirDispensar ? '' : ', e dispensar está desligado'),
      });
    });
    return { linhas: linhas, nenhum: false };
  }

  // O POST da tela "Dispensar" do jogo. Assinatura CAPTURADA do formulario real (nao deduzida):
  //   POST /game.php?village=<vid>&screen=train&mode=decommission
  //   campos: spear sword axe spy light heavy ram catapult snob + h
  // Um campo por unidade, com a QUANTIDADE a dispensar. Mando so `snob` — os outros vao vazios
  // de proposito: um numero errado em `axe` aqui apagaria o exercito da aldeia.
  async function nbDescDispensar(vid, quantos) {
    const b = new URLSearchParams();
    b.set('snob', String(quantos));
    b.set('h', CSRF);
    const r = await fetch('/game.php?village=' + vid + '&screen=train&mode=decommission',
      { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b.toString() });
    const t = await r.text();
    const doc = new DOMParser().parseFromString(t, 'text/html');
    const err = doc.querySelector('.error_box, .error');
    if (err && (err.textContent || '').trim()) throw new Error(err.textContent.trim().replace(/\s+/g, ' ').slice(0, 90));
    return true;
  }

  async function nbDescExecutar() {
    const d = nbDescCfg();
    let p;
    try { p = await nbDescPlano(); }
    catch (e) { pushLog('Descarte: não consegui montar o plano (' + (e.message || e) + ').', 'err', 'noble'); return; }
    if (p.nenhum || !p.linhas.length) {
      pushLog('Descarte: nenhum nobre com "' + NBDESC_MOTIVO_ALVO + '" — nada a fazer.', 'ok', 'noble');
      return;
    }
    const vaiMinha = p.linhas.filter((l) => l.destino === 'minha');
    const vaiBarb = p.linhas.filter((l) => l.destino === 'barbara');
    const vaiDisp = p.linhas.filter((l) => l.destino === 'dispensar');
    const parados = p.linhas.filter((l) => l.destino === 'nada');
    if (!vaiMinha.length && !vaiBarb.length && !vaiDisp.length) {
      pushLog('Descarte: ' + parados.length + ' aldeia(s) com nobre inútil, mas nenhuma tem bárbara dentro de '
        + d.horas + 'h e o Dispensar está desligado. Aumente o limite ou ligue o Dispensar.', 'err', 'noble');
      return;
    }
    // A confirmacao NOMEIA cada aldeia e cada destino. "Tem certeza?" nao serve aqui: as duas
    // acoes sao irreversiveis e diferentes entre si, e o usuario precisa ver QUEM leva qual.
    const linhaTxt = (l) => '  · ' + l.nome + ' (' + l.coord + '): ' + l.nobres + ' nobre(s) → '
      + (l.destino === 'minha'
        ? 'ataca SUA ' + l.alvoNome + ' (' + l.alvo + ', ' + fmtN(l.def) + ' de defesa) a '
          + l.campos + ' campos (' + fmtDur(l.minutos * 60) + '), com ' + l.spies + ' explorador(es)'
        : l.destino === 'barbara'
        ? 'ataca bárbara ' + l.alvo + ' a ' + l.campos + ' campos (' + fmtDur(l.minutos * 60) + ')'
          + ', com ' + l.spies + ' explorador(es)' + (l.spies < l.spiesPedidos ? ' (só tinha isso)' : '')
        : 'DISPENSAR — não volta nada');
    if (!confirm('DESCARTAR ' + (vaiMinha.length + vaiBarb.length + vaiDisp.length) + ' aldeia(s) com nobre inútil?\n\n'
      + (vaiMinha.length ? 'ATAQUE A ALDEIA SUA (' + vaiMinha.length + ') — o nobre morre na sua própria defesa:\n'
          + vaiMinha.map(linhaTxt).join('\n') + '\n\n' : '')
      + (vaiBarb.length ? 'ATAQUE A BÁRBARA (' + vaiBarb.length + '):\n' + vaiBarb.map(linhaTxt).join('\n') + '\n\n' : '')
      + (vaiDisp.length ? 'DISPENSAR (' + vaiDisp.length + ') — irreversível, não devolve moeda nem recurso:\n'
          + vaiDisp.map(linhaTxt).join('\n') + '\n\n' : '')
      + (parados.length ? parados.length + ' aldeia(s) ficam de fora (bárbara longe demais).\n\n' : '')
      + 'Nada disso tem desfazer. Confirma?')) {
      pushLog('Descarte: cancelado — nada foi feito.', '', 'noble');
      return;
    }
    let nAtk = 0, nDisp = 0, nErro = 0;
    for (const l of p.linhas) {
      if (l.destino === 'nada') continue;
      { const pare = devoParar('noble'); if (pare) { pushLog('Descarte: interrompido — ' + pare + '.', '', 'noble'); break; } }
      try {
        if (l.destino === 'minha' || l.destino === 'barbara') {
          const [ax, ay] = l.alvo.split('|');
          const unidades = { snob: l.nobres };
          if (l.spies > 0) unidades.spy = l.spies;
          const prep = await fakePrepare(l.vid, ax, ay, unidades);
          await fakeFire(prep);
          nAtk++;
          pushLog('Descarte: ' + l.nome + ' → ' + (l.destino === 'minha' ? 'SUA ' + l.alvoNome : 'bárbara')
            + ' ' + l.alvo + ' com ' + l.nobres + ' nobre(s) + ' + l.spies + ' explorador(es). '
            + (l.destino === 'minha'
              ? 'Ela tem ' + fmtN(l.def) + ' de defesa em casa — o ataque PERDE e o nobre morre.'
              : 'Se a bárbara tiver defesa o nobre morre; se não tiver, ele volta e a lealdade dela cai.'),
            'ok', 'noble');
        } else {
          await nbDescDispensar(l.vid, l.nobres);
          nDisp++;
          pushLog('Descarte: ' + l.nome + ' — ' + l.nobres + ' nobre(s) DISPENSADO(S). Slot liberado; '
            + 'a moeda não volta.', 'ok', 'noble');
        }
      } catch (e) {
        nErro++;
        pushLog('Descarte em ' + l.nome + ': ' + (e.message || e), 'err', 'noble');
      }
      await sleep(500 + Math.floor(Math.random() * 300));
    }
    pushLog('Descarte: concluído — ' + nAtk + ' ataque(s) a bárbara, ' + nDisp + ' dispensado(s)'
      + (nErro ? ', ' + nErro + ' erro(s)' : '') + '.', nErro ? 'err' : 'ok', 'noble');
    _nbOcio = null;                 // a lista de ociosos envelheceu: força releitura
    nobleConferirOciosos();
  }

  // Prévia sob demanda: mesma conta do executar, sem agir. É o botão que se aperta primeiro.
  async function nbDescPrever() {
    const box = document.getElementById('twmgr-nb-desc-out'); if (!box) return;
    box.innerHTML = '<span class="twmgr-lbl">lendo aldeias, mapa e tropas…</span>';
    let p;
    try { p = await nbDescPlano(); }
    catch (e) { box.innerHTML = '<span style="color:#b03030;font-size:10px">' + esc(e.message || e) + '</span>'; return; }
    if (!p.linhas.length) {
      box.innerHTML = '<span style="color:#3f8f52;font-size:10px">Nenhum nobre com "'
        + NBDESC_MOTIVO_ALVO + '" — nada a descartar.</span>';
      return;
    }
    const cor = { minha: '#3f8f52', barbara: '#8b5426', dispensar: '#b03030', nada: '#8a7340' };
    const rot = { minha: '🏠 minha aldeia', barbara: '⚔ bárbara', dispensar: '🗑 dispensar', nada: '— fica' };
    box.innerHTML = '<table style="width:100%;font-size:10px;border-collapse:collapse">' +
      '<tr style="color:#8a7340"><td>aldeia</td><td style="width:38px">nobres</td>'
      + '<td style="width:76px">destino</td><td>o que acontece</td></tr>' +
      p.linhas.map((l) => '<tr style="border-top:1px solid #efe7d8">' +
        '<td style="padding:2px 0">' + esc(l.nome) + ' <span style="color:#8a7340">' + esc(l.coord) + '</span></td>' +
        '<td><b style="color:#8b5426">' + l.nobres + '</b></td>' +
        '<td style="color:' + cor[l.destino] + '">' + rot[l.destino] + '</td>' +
        '<td style="color:#6f6153">' + (l.destino === 'minha' || l.destino === 'barbara'
          ? 'ataca ' + esc(l.destino === 'minha' ? (l.alvoNome + ' ' + l.alvo) : ('bárbara ' + l.alvo))
            + (l.destino === 'minha' ? ' <span style="color:#3f8f52">(' + fmtN(l.def) + ' def)</span>' : '')
            + ' · ' + l.campos + ' campos · ' + esc(fmtDur(l.minutos * 60)) + ' · ' + l.spies + ' explorador(es)'
          : esc(l.porque || '')) + '</td></tr>').join('') +
      '</table>' +
      '<div style="color:#8a7340;font-size:9px;margin-top:3px">Prévia — nada foi feito. '
      + 'Nobre anda ' + Math.round(_nbVelCache || 35) + ' min/campo neste mundo, então o limite de '
      + nbDescCfg().horas + 'h alcança ' + (Math.round((nbDescCfg().horas * 60) / (_nbVelCache || 35) * 100) / 100)
      + ' campos.</div>';
  }
