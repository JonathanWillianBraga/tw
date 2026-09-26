  // ==================== ENTREGA DE ALDEIA (ent*) ====================
  // Mantem a lealdade das SUAS PROPRIAS aldeias baixa, pra outra conta conquistar com 1 nobre so.
  //
  // A MECANICA, com o que o proprio projeto ja tinha descoberto
  //
  // Atacar aldeia sua e permitido. O 087-nobre-descarte depende disso, e o comentario de la diz o
  // que acontece nos dois casos: contra aldeia DEFENDIDA o nobre morre (e o que o descarte quer),
  // contra aldeia INDEFESA "o ataque VENCE: o nobre volta e a lealdade dela cai". Foi o proprio
  // usuario que apontou o risco — "inclusive e possivel se noblar". Aqui esse efeito colateral e
  // justamente o objetivo.
  //
  // DUAS CONSEQUENCIAS QUE MUDAM A CONTA, e que eu tinha errado ao estimar pro usuario:
  //
  //   1. O NOBRE VOLTA. Ele so e consumido quando a aldeia e conquistada de fato. Como aqui a
  //      lealdade nunca chega a zero, o mesmo nobre serve varias aldeias em rodizio. O custo de
  //      manter nao e 40k/50k/50k por batida — e tempo de viagem. Eu tinha estimado centenas de
  //      milhares de recursos por dia; e ordem de grandeza a menos.
  //
  //   2. A LEALDADE CAI UMA VEZ POR COMANDO, nao por nobre (084-noblar). Mandar 2 nobres juntos
  //      queima um a toa. Cada batida e um comando com snob:1.
  //
  // A ARITMETICA DA JANELA SEGURA
  //
  // Um nobre tira 20 a 35. Entao, pra deixar a aldeia num estado em que UM nobre da outra conta
  // conquiste com certeza, o teto e 20 — nao 25. De 25 um resultado 20 deixa 5, e a aldeia
  // sobrevive; a chance de 25 dar certo e 11/16 (69%).
  //
  // E tem um piso: se a batida levar a lealdade a zero, VOCE conquista a propria aldeia. Nao sei o
  // que o jogo faz nesse caso e nao da pra descobrir sem arriscar uma aldeia, entao o modulo nunca
  // chega perto. A regra por faixa:
  //
  //     lealdade <= teto ............ pronto, nao faz nada
  //     teto+1 a 35 ................. ZONA MORTA: bater pode zerar (35-35=0). Espera regenerar.
  //     36 a 40 ..................... TIRO FINAL: cai em 1..20, garantido
  //     41 ou mais .................. bate pra aproximar (pode cair na zona morta; ai espera)
  //
  // A zona morta resolve sozinha: lealdade regenera ~1/h, entao de 35 chega em 36 em uma hora.
  //
  // A ALDEIA PRECISA ESTAR VAZIA
  //
  // Nobre que morre na batalha nao mexe na lealdade. Com defensor em casa voce perde tropa DOS
  // DOIS LADOS e a lealdade nao anda. Por isso o modulo esvazia o alvo antes.
  //
  // COMO ESVAZIAR: APOIO, nao ataque longe. O usuario sugeriu mandar a tropa atacar "uma aldeia no
  // fim do mundo" pra ela ficar fora. Funciona, mas apoio pra uma aldeia vizinha sua e melhor em
  // tudo: nao arrisca combate nenhum, a tropa fica parada e disponivel (da pra recolher quando
  // quiser) em vez de passar dias no ar, e nao gasta a viagem de volta. O unico caso em que o
  // ataque longe ganharia e se voce quisesse a tropa INDISPONIVEL de proposito — nao e o caso.
  //
  // O LIMITE DE FAKE PEGA AQUI
  //
  // O ataque precisa de populacao >= 1% dos pontos da ORIGEM. Nobre tem 100 de pop, entao numa
  // origem acima de 10.000 pontos o nobre SOZINHO e recusado: "A forca de ataque precisa do minimo
  // de 103 habitantes". Testado no jogo. O modulo completa com tropa de campo ate passar do piso.

  const ENT_POP_NOBRE = 100;
  const ENT_TETO_PADRAO = 20;
  // Faixas da janela segura. Acima do teto e ate ENT_ZONA_MORTA_ATE a batida pode zerar a aldeia.
  const ENT_ZONA_MORTA_ATE = 35;
  const ENT_MIN_PRA_BATER = 36;
  // TETO DO MUNDO, lido do config do jogo (`snob.max_dist`): nobre nao voa alem disso, ponto.
  // O alcance que o usuario escolhe e outra coisa — e quanto tempo de viagem ele acha que vale —
  // e so pode ser MENOR que este. Nobre anda 35 min/campo, entao 10 campos ja sao 5h50 de ida.
  const ENT_MAX_CAMPOS = 70;
  const ENT_CAMPOS_PADRAO = 10;
  // Quantas vizinhas tentar quando for formar nobre perto. Cada tentativa custa requisicao, e a
  // primeira ja responde a pergunta cara (tem slot no limite da conta?) — o resto e so achar uma
  // aldeia com academia, recurso e populacao.
  const ENT_TENTA_FORMAR = 6;
  const ENT_INTERVALO_MS = 10 * 60 * 1000;
  // Quem pode ir completando o piso de populacao. So tropa de campo: explorador nao briga e
  // ariete/catapulta servem pra muralha, nao pra escoltar.
  const ENT_ESCOLTA = ['spear', 'sword', 'axe', 'light', 'heavy'];

  function entCfg() {
    const c = (config.entrega = config.entrega || {});
    if (c.ligado == null) c.ligado = false;
    // Alvos guardados por COORDENADA, nao por id de aldeia. Coordenada e o que o usuario digita,
    // o que ele ve no jogo, e o que continua valendo se ele exportar a config — id de aldeia nao
    // sobrevive a nada disso.
    if (!Array.isArray(c.alvos)) c.alvos = [];
    if (c.teto == null) c.teto = ENT_TETO_PADRAO;
    // O teto e a unica coisa aqui que o usuario pode estragar sem perceber: acima de 20 a conquista
    // com 1 nobre deixa de ser garantida. Deixo passar (a escolha e dele) mas a tela avisa.
    c.teto = Math.max(1, Math.min(99, parseInt(c.teto, 10) || ENT_TETO_PADRAO));
    if (c.maxCampos == null) c.maxCampos = ENT_CAMPOS_PADRAO;
    c.maxCampos = Math.max(1, Math.min(ENT_MAX_CAMPOS, parseInt(c.maxCampos, 10) || ENT_CAMPOS_PADRAO));
    // RECICLAR DESTROI NOBRE. Opt-in separado, pela mesma razao que o `permitirDispensar` do
    // 087-nobre-descarte e separado: dispensar nao devolve o recurso da unidade. A diferenca e
    // que la a perda e o fim da historia, e aqui ela compra uma coisa concreta — um slot do
    // limite da conta pra formar nobre PERTO do alvo, onde ele serve. Mesmo assim nao pode
    // ligar sozinho.
    if (c.reciclar == null) c.reciclar = false;
    if (c.nextAt == null) c.nextAt = 0;
    return c;
  }

  function entXY(coord) {
    const m = String(coord || '').match(/(\d{1,3})\|(\d{1,3})/);
    return m ? { x: +m[1], y: +m[2] } : null;
  }
  function entDist(a, b) {
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
  }

  // Lealdade projetada pra agora, reusando o motor do Noblar (que ja envelhece a leitura pela
  // regeneracao e trava a extrapolacao quando ha pouso sem relatorio). Sem relatorio nenhum, a
  // premissa do Noblar vale igual aqui: aldeia nunca batida esta em 100.
  function entLealdade(coord) {
    try { return nobleLealdadeAgora(coord); } catch (e) { return 100; }
  }

  // O que fazer com esta aldeia agora. Uma funcao so, pra decisao e tela nunca discordarem.
  function entDecidir(lealdade, teto) {
    if (lealdade <= teto) return { acao: 'ok', txt: 'na faixa' };
    if (lealdade <= ENT_ZONA_MORTA_ATE) {
      return { acao: 'espera', txt: 'zona morta — bater agora pode zerar; espera chegar a ' + ENT_MIN_PRA_BATER };
    }
    if (lealdade <= 40) return { acao: 'bate', txt: 'tiro final — cai entre 1 e ' + teto };
    return { acao: 'bate', txt: 'aproxima' };
  }

  // Piso de populacao do ataque, pelos pontos da origem.
  function entPisoPop(pontos) {
    return pontos > 0 ? Math.ceil((FAKE_LIMIT_PCT / 100) * pontos) : 0;
  }

  // Completa o comando ate passar do piso de fake. Devolve null quando a origem nao tem tropa de
  // campo suficiente — melhor nao mandar do que mandar e o jogo recusar.
  function entMontarComando(avail, piso) {
    const cmd = { snob: 1 };
    let pop = ENT_POP_NOBRE;
    for (let i = 0; i < ENT_ESCOLTA.length && pop < piso; i++) {
      const u = ENT_ESCOLTA[i];
      const p = POP[u] || 1;
      const temUnidade = Math.max(0, (avail[u] || 0));
      if (!temUnidade) continue;
      const querUnidade = Math.ceil((piso - pop) / p);
      const usa = Math.min(temUnidade, querUnidade);
      if (usa > 0) { cmd[u] = usa; pop += usa * p; }
    }
    return pop >= piso ? cmd : null;
  }

  // ===== O ciclo =====
  let entTimer = null;
  let _entEmVoo = false;

  async function entTick() {
    clearTimeout(entTimer);
    const c = entCfg();
    if (!c.ligado) return;
    // As duas guardas de entrada que todo tick tem. A do captcha importa mais aqui que em outros
    // modulos: com bot-check pendente o envio falha, e falha em serie faria o ciclo desistir de
    // uma aldeia que so precisava esperar.
    if (lockOther()) { entTimer = setTimeout(entTick, 5000); return; }
    if (captchaBlocked()) { entTimer = setTimeout(entTick, 30000); return; }
    claimLock();
    if (_entEmVoo) { pushLog('Entrega: ciclo anterior ainda rodando — ignorei o disparo.', '', 'entrega'); return; }
    _entEmVoo = true;
    try { await entTickInterno(); }
    catch (e) { pushLog('Entrega: ciclo falhou (' + ((e && e.message) || e) + ').', 'err', 'entrega'); }
    finally {
      _entEmVoo = false;
      config.entrega.nextAt = Date.now() + ENT_INTERVALO_MS;
      save(); refreshCards('entrega'); entAgendar();
    }
  }

  async function entTickInterno() {
    const c = entCfg();
    const alvos = (c.alvos || []).slice();
    if (!alvos.length) { pushLog('Entrega: nenhuma aldeia marcada.', '', 'entrega'); return; }

    const vilas = await getAllVillages();
    const porCoord = {}; vilas.forEach((v) => { if (v.coord) porCoord[v.coord] = v; });
    const tropas = await getTropaTodasAldeias();
    const pontos = await getVillagePoints();

    // Aldeia que e alvo nao serve de origem nem de destino de apoio: mandar tropa pra dentro de
    // outra aldeia que tambem vai ser entregue so empurra o problema, e a tropa vai junto no pacote.
    const ehAlvo = {}; alvos.forEach((cd) => { const v = porCoord[cd]; if (v) ehAlvo[v.vid] = 1; });

    let bateu = 0, esperando = 0, prontas = 0, evacuou = 0, semOrigem = 0;

    for (const coord of alvos) {
      const v = porCoord[coord];
      // Coordenada que nao e mais sua: ou a entrega ja aconteceu, ou o usuario digitou errado. Nos
      // dois casos o certo e avisar e seguir, nunca apagar sozinho a lista que ele montou.
      if (!v) { pushLog('Entrega: ' + coord + ' não está entre as suas aldeias — ignorei (entregue? erro de digitação?).', 'err', 'entrega'); continue; }
      const vid = v.vid;
      const alvoXY = entXY(v.coord);
      const leal = entLealdade(v.coord);
      const d = entDecidir(leal, c.teto);

      if (d.acao === 'ok') { prontas++; continue; }
      if (d.acao === 'espera') {
        esperando++;
        pushLog('Entrega: ' + v.name + ' está em ' + leal + ' — ' + d.txt + '.', '', 'entrega');
        continue;
      }

      // --- 1. o alvo precisa estar VAZIO, senão o nobre morre e a lealdade não anda ---
      const emCasa = tropas[String(vid)] || {};
      const defensores = UNITS.reduce((s, u) => s + (u[0] === 'snob' ? 0 : (emCasa[u[0]] || 0)), 0);
      if (defensores > 0) {
        const destino = vilas
          .filter((o) => o.vid !== vid && !ehAlvo[o.vid] && o.coord)
          .map((o) => ({ o: o, d: entDist(alvoXY, entXY(o.coord)) }))
          .sort((a, b) => a.d - b.d)[0];
        if (!destino) { pushLog('Entrega: ' + v.name + ' tem tropa em casa e não achei vizinha pra onde apoiar.', 'err', 'entrega'); continue; }
        const manda = {};
        UNITS.forEach((u) => { if (u[0] !== 'snob' && (emCasa[u[0]] || 0) > 0) manda[u[0]] = emCasa[u[0]]; });
        const dx = entXY(destino.o.coord);
        // sendAttack sinaliza falha LANCANDO; sucesso devolve a duracao (ou null). Testar o
        // retorno como se fosse flag daria "nao consegui" em todo envio que deu certo.
        try {
          await sendAttack(vid, dx.x, dx.y, manda, 'support');
          evacuou++;
          pushLog('Entrega: esvaziei ' + v.name + ' — ' + defensores + ' tropa(s) apoiando ' + destino.o.name + '. O nobre vai no próximo ciclo.', 'ok', 'entrega');
        } catch (e) {
          pushLog('Entrega: não consegui esvaziar ' + v.name + ' (' + ((e && e.message) || e) + ').', 'err', 'entrega');
        }
        continue;   // só bate depois de confirmar vazio, no ciclo seguinte
      }

      // --- 2. origem: a aldeia MINHA mais perto que tenha nobre em casa ---
      const cand = vilas
        .filter((o) => o.vid !== vid && !ehAlvo[o.vid] && o.coord)
        .filter((o) => ((tropas[String(o.vid)] || {}).snob || 0) > 0)
        .map((o) => ({ o: o, d: entDist(alvoXY, entXY(o.coord)) }))
        .filter((x) => x.d <= c.maxCampos)
        .sort((a, b) => a.d - b.d);

      let mandou = false;
      for (const x of cand) {
        const avail = tropas[String(x.o.vid)] || {};
        const piso = entPisoPop(pontos[String(x.o.vid)] || 0);
        const cmd = entMontarComando(avail, piso);
        if (!cmd) continue;   // essa origem não tem escolta pro piso de fake; tenta a próxima
        const descontar = () => {
          avail.snob = Math.max(0, (avail.snob || 0) - 1);
          Object.keys(cmd).forEach((u) => { if (u !== 'snob') avail[u] = Math.max(0, (avail[u] || 0) - cmd[u]); });
        };
        try {
          await sendAttack(x.o.vid, alvoXY.x, alvoXY.y, cmd, 'attack');
          bateu++; mandou = true;
          descontar();   // o mapa de tropa é um retrato; o mesmo nobre não pode ir duas vezes
          const min = Math.round(x.d * 35);
          pushLog('Entrega: nobre de ' + x.o.name + ' → ' + v.name + ' (lealdade ' + leal + ', ' + d.txt
            + ') · ' + x.d.toFixed(1) + ' campos, ' + Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0') + '.', 'ok', 'entrega');
          break;
        } catch (e) {
          const msg = (e && e.message) || String(e);
          // AMBIGUO NAO PODE VIRAR REENVIO. `sendAttack` marca assim a resposta que tanto pode ser
          // recusa quanto sucesso; tentar a proxima origem aqui e como o comando saiu dobra o
          // ataque na propria aldeia — e duas batidas seguidas sao exatamente o que pode zerar a
          // lealdade. Na duvida, para e deixa o proximo ciclo reler a lealdade.
          if (/^ambiguo:/.test(msg)) {
            mandou = true; descontar();
            pushLog('Entrega: ' + x.o.name + ' → ' + v.name + ' — resposta ambígua, não sei se saiu.'
              + ' NÃO vou tentar outra origem: o próximo ciclo relê a lealdade e decide.', 'err', 'entrega');
            break;
          }
          pushLog('Entrega: ' + x.o.name + ' recusou (' + msg + ') — tento a próxima origem.', '', 'entrega');
        }
      }
      if (!mandou) {
        semOrigem++;
        pushLog('Entrega: ' + v.name + ' está em ' + leal + ' e precisa de batida, mas nenhuma origem com nobre'
          + ' (e escolta pro piso de fake) dentro de ' + c.maxCampos + ' campos.', 'err', 'entrega');
        if (c.reciclar) await entReciclar(v, alvoXY, vilas, ehAlvo, tropas, alvos, porCoord);
      }
    }

    pushLog('Entrega: ' + prontas + ' na faixa · ' + bateu + ' batida(s) · ' + esperando + ' esperando regenerar'
      + (evacuou ? ' · ' + evacuou + ' esvaziada(s)' : '')
      + (semOrigem ? ' · ' + semOrigem + ' SEM nobre disponível' : '') + '.', 'ok', 'entrega');
    save();
  }

  // ===== Arranjar nobre PERTO: formar, e se o limite estiver cheio, reciclar um distante =====
  //
  // O problema e especifico: nao falta nobre na conta, falta nobre PERTO. O limite de nobres e da
  // CONTA inteira, entao um nobre encalhado do outro lado do mapa impede formar outro aqui — ele
  // ocupa a vaga sem alcançar nada. Reciclar troca o inutil pelo util.
  //
  // A ORDEM IMPORTA: tenta formar PRIMEIRO. Se ha vaga no limite, dispensar seria destruir um
  // nobre a toa — a vaga ja existia. So quando `podemFormar` e zero e que o descarte compra
  // alguma coisa.
  //
  // NUNCA dispensa nobre que esta no alcance de ALGUM alvo, mesmo que esteja longe DESTE. Ele
  // serve pro outro alvo no proximo ciclo, e destrui-lo aqui so faria o ciclo seguinte formar de
  // novo — o mesmo moinho de moeda que o comentario do 084-noblar descreve.
  async function entReciclar(alvo, alvoXY, vilas, ehAlvo, tropas, alvosCoords, porCoord) {
    const c = entCfg();
    const perto = vilas
      .filter((o) => !ehAlvo[o.vid] && o.coord)
      .map((o) => ({ o: o, d: entDist(alvoXY, entXY(o.coord)) }))
      .filter((x) => x.d <= c.maxCampos)
      .sort((a, b) => a.d - b.d);
    if (!perto.length) {
      pushLog('Entrega: ' + alvo.name + ' — não há aldeia sua dentro de ' + c.maxCampos + ' campos pra formar nobre.'
        + ' Aumente o alcance ou a entrega dessa aldeia não sai.', 'err', 'entrega');
      return;
    }

    let est;
    try { est = await getSnobState(perto[0].o.vid); }
    catch (e) { pushLog('Entrega: não consegui ler a academia de ' + perto[0].o.name + ' (' + ((e && e.message) || e) + ').', 'err', 'entrega'); return; }
    const vagas = est && est.podemFormar != null ? est.podemFormar : null;

    if (vagas === 0) {
      // Limite cheio. Procura o nobre mais INUTIL: o que esta mais longe de TODOS os alvos.
      const alvosXY = alvosCoords.map((cd) => porCoord[cd]).filter(Boolean).map((v) => entXY(v.coord));
      const inuteis = vilas
        .filter((o) => !ehAlvo[o.vid] && o.coord && ((tropas[String(o.vid)] || {}).snob || 0) > 0)
        .map((o) => ({ o: o, perto: Math.min.apply(null, alvosXY.map((a) => entDist(a, entXY(o.coord)))) }))
        .filter((x) => x.perto > c.maxCampos)   // no alcance de algum alvo = util, nao se toca
        .sort((a, b) => b.perto - a.perto);
      if (!inuteis.length) {
        pushLog('Entrega: limite de nobres cheio e nenhum nobre fora do alcance pra reciclar —'
          + ' todos os que você tem servem a algum alvo. Nada a fazer por ' + alvo.name + ' neste ciclo.', '', 'entrega');
        return;
      }
      const vitima = inuteis[0];
      try {
        await nbDescDispensar(vitima.o.vid, 1);
        (tropas[String(vitima.o.vid)] || {}).snob = Math.max(0, ((tropas[String(vitima.o.vid)] || {}).snob || 1) - 1);
        pushLog('Entrega: dispensei 1 nobre de ' + vitima.o.name + ' (a ' + vitima.perto.toFixed(1)
          + ' campos do alvo mais próximo — não alcançava nenhum) pra abrir vaga no limite.', 'ok', 'entrega');
      } catch (e) {
        pushLog('Entrega: não consegui dispensar o nobre de ' + vitima.o.name + ' (' + ((e && e.message) || e) + ').', 'err', 'entrega');
        return;
      }
    } else if (vagas === null) {
      pushLog('Entrega: não consegui ler quantos nobres ainda cabem no limite — vou tentar formar assim mesmo.', '', 'entrega');
    }

    // Forma na mais perto que aceitar. Falta de academia, recurso ou populacao nao interrompe:
    // segue pra proxima — mesmo criterio do nobleRecrutar.
    for (let i = 0; i < Math.min(ENT_TENTA_FORMAR, perto.length); i++) {
      const cand = perto[i];
      try {
        await nobleFormar(cand.o.vid);
        pushLog('Entrega: formando nobre em ' + cand.o.name + ' (' + cand.d.toFixed(1) + ' campos de '
          + alvo.name + '). Ele bate quando ficar pronto.', 'ok', 'entrega');
        return;
      } catch (e) {
        pushLog('Entrega: ' + cand.o.name + ' não formou (' + ((e && e.message) || e) + ') — tento a próxima.', '', 'entrega');
      }
    }
    pushLog('Entrega: nenhuma das ' + Math.min(ENT_TENTA_FORMAR, perto.length) + ' aldeias mais perto de '
      + alvo.name + ' conseguiu formar nobre agora.', 'err', 'entrega');
  }

  function entAgendar() {
    clearTimeout(entTimer);
    if (!config.entrega || !config.entrega.ligado) return;
    const falta = Math.min(Math.max((config.entrega.nextAt || 0) - Date.now(), 1000), 60000);
    entTimer = setTimeout(entTick, falta);
  }
  function entStart() {
    entCfg().ligado = true; config.entrega.nextAt = Date.now() + 2000; save();
    pushLog('Entrega: ligado — teto de lealdade ' + config.entrega.teto + '.', 'ok', 'entrega');
    refreshCards('entrega'); entAgendar();
  }
  function entStop() {
    entCfg().ligado = false; save();
    pushLog('Entrega: desligado.', '', 'entrega');
    refreshCards('entrega'); clearTimeout(entTimer);
  }
