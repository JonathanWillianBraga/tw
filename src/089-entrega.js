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
  // Intervalo em MINUTOS, escolhido pelo usuario. 10 e o padrao de operacao; 1 serve pra testar,
  // pra nao esperar dez minutos so pra ver se o ciclo girou. Nao e so conveniencia: cada ciclo
  // faz leituras (aldeias, tropa propria, tropa presente), entao 1 minuto o dia inteiro e
  // requisicao a toa num modulo cujo trabalho leva horas de voo.
  const ENT_INTERVALO_PADRAO_MIN = 10;
  // Quem escolta, em ordem de preferencia. So tropa de campo: explorador nao briga e
  // ariete/catapulta servem pra muralha, nao pra escoltar.
  //
  // A ordem e por ATAQUE, nao por o que sobra: barbaro (40) e cavalaria leve (130) resolvem uma
  // milicia; lanceiro e espadachim sao tropa de defesa e atacam com 10 e 25 — mandar 100
  // lanceiros de escolta e quase mandar o nobre sozinho.
  const ENT_ESCOLTA = ['axe', 'light', 'heavy', 'sword', 'spear'];
  const ENT_ESCOLTA_PADRAO = 100;

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
    // ESCOLTA. O piso de fake NAO e escolta: ele so garante que o jogo aceite o ataque, e numa
    // origem abaixo de 10.000 pontos os 100 de populacao do nobre ja bastam — era por isso que o
    // nobre saia pelado. Isto aqui e a protecao de verdade.
    //
    // Ela e necessaria porque a aldeia foi conferida VAZIA ate 10 minutos antes, mas o voo leva
    // horas. Nesse meio tempo pode nascer milicia, pode voltar tropa de um ataque, pode chegar
    // apoio. Nobre sozinho morre pra qualquer uma dessas e a lealdade nao anda.
    if (c.escolta == null) c.escolta = ENT_ESCOLTA_PADRAO;
    c.escolta = Math.max(0, Math.min(5000, parseInt(c.escolta, 10) || 0));
    if (c.intervaloMin == null) c.intervaloMin = ENT_INTERVALO_PADRAO_MIN;
    c.intervaloMin = Math.max(1, Math.min(60, parseInt(c.intervaloMin, 10) || ENT_INTERVALO_PADRAO_MIN));
    if (c.maxCampos == null) c.maxCampos = ENT_CAMPOS_PADRAO;
    c.maxCampos = Math.max(1, Math.min(ENT_MAX_CAMPOS, parseInt(c.maxCampos, 10) || ENT_CAMPOS_PADRAO));
    // RECICLAR DESTROI NOBRE. Opt-in separado, pela mesma razao que o `permitirDispensar` do
    // 087-nobre-descarte e separado: dispensar nao devolve o recurso da unidade. A diferenca e
    // que la a perda e o fim da historia, e aqui ela compra uma coisa concreta — um slot do
    // limite da conta pra formar nobre PERTO do alvo, onde ele serve. Mesmo assim nao pode
    // ligar sozinho.
    if (c.reciclar == null) c.reciclar = false;
    // PLANEJAR: quando faltar nobre pronto, mandar FORMAR na origem que entrega mais cedo (fila +
    // viagem), e recrutar escolta onde falta. Gasta recurso, entao e opt-out explicito.
    if (c.planejar == null) c.planejar = true;
    // Quantas origens abrir por alvo quando for planejar. Cada uma custa uma requisicao da
    // Academia; seis cobre bem a vizinhanca sem virar varredura.
    if (c.olhar == null) c.olhar = 6;
    c.olhar = Math.max(2, Math.min(20, parseInt(c.olhar, 10) || 6));
    if (c.nextAt == null) c.nextAt = 0;
    return c;
  }

  // TROPA PRESENTE NA ALDEIA, propria MAIS apoio de fora.
  //
  // `type=own_home` (que o resto do script usa) conta so a tropa DA aldeia. Apoio de outra aldeia
  // — sua ou de aliado — nao aparece ali e defende exatamente igual. Medido na conta: 15 aldeias
  // com apoio de fora, uma delas com 44.935 tropas em cima de 262 proprias. Mandar nobre numa
  // dessas e perder o nobre sem mover a lealdade.
  //
  // A aba que soma tudo e `type=there` ("Na Aldeia"). Uma requisicao, todas as aldeias.
  async function entTropaPresente() {
    const r = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=units&type=there&group=0&page=-1',
      { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    // QUAL COLUNA E QUAL, PELO ICONE DO CABECALHO — nao por indice fixo.
    //
    // Eu tinha somado as colunas 2..12 de uma vez, e duas delas nao sao tropa de campo: NOBRE e
    // MILICIA. A tropa "propria" com que eu comparava (getTropaTodasAldeias) nao conta nenhuma
    // das duas, entao a subtracao dava a diferenca como se fosse apoio de terceiro. Sintoma
    // exato na conta: aldeia com 1 nobre proprio acusada de ter "1 tropa de apoio que NAO e
    // minha" — e o usuario, certo, disse que so havia tropa da propria aldeia.
    //
    // As colunas mudam por mundo (o br143 nao tem arqueiro nem arqueiro a cavalo), entao indice
    // fixo e uma armadilha esperando a proxima conta. O icone diz a unidade.
    const col = [];
    [].forEach.call(doc.querySelectorAll('table th'), (th, i) => {
      const im = th.querySelector('img');
      const mm = im && String(im.getAttribute('src') || '').match(/unit_(\w+)\./);
      if (mm) col.push({ i: i, u: mm[1] });
    });
    const out = {};
    [].forEach.call(doc.querySelectorAll('tr'), (tr) => {
      if (!tr.querySelector('span.quickedit-vn')) return;
      const lbl = ((tr.querySelector('span.quickedit-label') || {}).textContent || '').replace(/\s+/g, ' ').trim();
      const m = lbl.match(/\((\d{1,3}\|\d{1,3})\)/); if (!m) return;
      const tds = tr.querySelectorAll('td');
      const r = { campo: 0, nobre: 0, milicia: 0 };
      col.forEach((c) => {
        const n = parseInt((tds[c.i] || {}).textContent || '0', 10) || 0;
        if (c.u === 'snob') r.nobre += n;
        else if (c.u === 'militia') r.milicia += n;
        else r.campo += n;
      });
      out[m[1]] = r;
    });
    return out;
  }

  function entXY(coord) {
    const m = String(coord || '').match(/(\d{1,3})\|(\d{1,3})/);
    return m ? { x: +m[1], y: +m[2] } : null;
  }
  function entDist(a, b) {
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
  }

  // LEALDADE LIDA DIRETO DA TELA DA ALDEIA.
  //
  // A tela da aldeia (screen=overview) tem um widget com o titulo "Lealdade". O numero so aparece
  // quando ela esta ABAIXO de 100 — widget sem numero significa 100. Confirmado pelo usuario e
  // medido na conta: 476|567 = 21, 463|562 = 73, 473|565 = 100, 422|581 = 100.
  //
  // Isto substitui a leitura por RELATORIO, que era o desenho anterior e tinha tres problemas:
  //   - so existia depois de uma batida bem-sucedida (nobre sem escolta nao gera linha nenhuma);
  //   - dependia do relatorio nao ter sido apagado nem empurrado pra segunda pagina;
  //   - envelhecia por estimativa de regeneracao em vez de ler o valor de agora.
  //
  // Custa uma requisicao por aldeia da lista, por ciclo. Com o ciclo em 10 min e uma lista de
  // punhado de aldeias, isso e barato — e e o dado que TODA decisao do modulo usa.
  //
  // NAO usar `#loyalty` nem regex colado na palavra: nao existe id proprio, e entre o rotulo e o
  // numero ha markup. Foi assim que eu conclui, errado, que a lealdade nao era legivel.
  async function entLerLealdade(vid) {
    const r = await fetch('/game.php?village=' + vid + '&screen=overview', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const rot = Array.prototype.slice.call(doc.querySelectorAll('h4'))
      .filter((e) => /^\s*Lealdade\s*$/i.test(e.textContent || ''))[0];
    if (!rot) return 100;   // tela sem o widget: nada indica queda
    const bloco = rot.closest('div') || rot.parentElement;
    const m = ((bloco && bloco.textContent) || '').replace(/\s+/g, ' ').match(/Lealdade\s*(-?\d+)/i);
    return m ? parseInt(m[1], 10) : 100;
  }

  // Valor lido neste ciclo. Cai pra 100 se a leitura falhou — a premissa mais conservadora, porque
  // 100 manda bater e bater e o que a trava de seguranca ja limita.
  let _entLeal = {};
  function entLealdade(coord) {
    return _entLeal[coord] == null ? 100 : _entLeal[coord];
  }

  // O que fazer com esta aldeia agora. Uma funcao so, pra decisao e tela nunca discordarem.
  // UM NOBRE POR VEZ, POR ALVO — e a trava que faltava, e a falta dela era grave.
  //
  // O ciclo roda a cada 10 min e o voo leva horas. A lealdade so muda quando o nobre POUSA e o
  // relatorio e lido, entao, sem esta trava, todo ciclo releria a mesma lealdade alta e mandaria
  // outro nobre: com 10 campos (5h50 de ida) seriam ~35 nobres no ar contra a mesma aldeia. Os
  // primeiros pousos derrubariam a lealdade a zero e eu conquistaria a propria aldeia — que e
  // exatamente o que a janela 36..40 existe pra impedir. A janela protege contra UM tiro; nada
  // protegia contra trinta.
  //
  // Serializar custa pouco: a lealdade regenera ~1/h, entao esperar um pouso nao perde a janela.
  // Quantos nobres MEUS ainda estao no ar pra este alvo.
  //
  // A poda passou a ser por TEMPO em vez de por relatorio. Antes dependia de `nobleVoos`, que so
  // considera um comando pousado quando aparece relatorio com lealdade — e nobre sem escolta
  // morre sem gerar essa linha, entao o voo ficava "no ar" pra sempre e o modulo travava.
  //
  // Com a lealdade lida direto, o relatorio virou desnecessario: assim que o comando pousa, a
  // proxima leitura ja mostra o efeito. A folga de 2 min cobre o intervalo entre o pouso e a tela
  // refletir — e errar pra mais aqui so adia uma batida, enquanto errar pra menos manda nobre
  // demais.
  const ENT_POUSO_FOLGA_MS = 120000;
  function entVoando(coord) {
    const lista = ((config.noble && config.noble.emVoo) || {})[coord] || [];
    const agora = Date.now();
    return lista.reduce((s, e) => s + (((e.chega || e.at || 0) + ENT_POUSO_FOLGA_MS > agora) ? (e.n || 1) : 0), 0);
  }

  // QUANTOS NOBRES CABEM AGORA, sem chance de zerar a aldeia.
  //
  // O "um por vez" da v11.265.0 era seguro e lento: cada batida gastava um voo inteiro de ida
  // (horas) pra tirar em media 25 de lealdade. De 100 ate 20 sao 4 batidas, ou seja 4 viagens em
  // serie. Mas 1 nao era o numero certo — era so o numero obviamente seguro.
  //
  // O numero certo sai de duas contas:
  //
  //   TETO DE SEGURANCA  floor((lealdade - 1) / 35)
  //     No pior caso cada nobre tira 35. Mandar N nunca pode levar a lealdade a zero, entao
  //     35N <= lealdade - 1. De 100 da 2; de 71 da 2; de 36 da 1; de 35 da 0 (a zona morta sai
  //     daqui sozinha, sem regra separada).
  //
  //   QUANTOS FALTAM     ceil((lealdade - teto) / 20)
  //     No pior caso cada nobre tira 20. Mais que isso e nobre gasto a toa.
  //
  // Manda o MENOR dos dois, descontando o que ja esta no ar (a lealdade lida ainda nao conta
  // esses pousos, entao eles gastam do mesmo orcamento).
  const ENT_QUEDA_MAX = 35;
  const ENT_QUEDA_MIN = 20;
  function entQuantos(lealdade, teto, voando) {
    if (lealdade <= teto) return 0;
    const seguro = Math.floor((lealdade - 1) / ENT_QUEDA_MAX);
    const faltam = Math.ceil((lealdade - teto) / ENT_QUEDA_MIN);
    return Math.max(0, Math.min(seguro, faltam) - voando);
  }

  function entDecidir(lealdade, teto, voando, apoio, milicia) {
    if (lealdade <= teto) return { acao: 'ok', txt: 'na faixa' };
    if (apoio > 0) return { acao: 'apoio', txt: 'tem ' + apoio + ' tropa(s) de APOIO de fora — o nobre morreria' };
    // Milicia nao se manda embora: e defesa local, criada na propria aldeia, e some sozinha
    // quando o prazo dela acaba. Nao da pra esvaziar por apoio nem por ataque — so esperar.
    if (milicia > 0) return { acao: 'milicia', txt: 'tem ' + milicia + ' de MILÍCIA — ela some sozinha; espero' };
    const n = entQuantos(lealdade, teto, voando);
    if (n <= 0) {
      if (voando > 0) return { acao: 'voando', txt: voando + ' no ar já é o limite seguro — espero pousar' };
      return { acao: 'espera', txt: 'zona morta — qualquer batida pode zerar; espera chegar a ' + ENT_MIN_PRA_BATER };
    }
    const sobra = lealdade - n * ENT_QUEDA_MAX;
    return { acao: 'bate', n: n, txt: n + ' nobre(s) — pior caso deixa ' + sobra
      + (lealdade - n * ENT_QUEDA_MIN <= teto ? ', melhor caso fecha' : '') };
  }

  // Piso de populacao do ataque, pelos pontos da origem.
  function entPisoPop(pontos) {
    return pontos > 0 ? Math.ceil((FAKE_LIMIT_PCT / 100) * pontos) : 0;
  }

  // Monta o comando: 1 nobre + escolta. Duas exigencias, e elas sao DIFERENTES:
  //
  //   ESCOLTA (quantas tropas) — pra vencer o que possa aparecer na aldeia durante o voo.
  //   PISO DE FAKE (quanta populacao) — pra o jogo aceitar o ataque.
  //
  // Eu tinha juntado as duas e so enchia ate o piso. Numa origem abaixo de 10.000 pontos o piso
  // ja e coberto pelos 100 do nobre, entao o laco nao rodava nenhuma vez e o nobre ia sozinho.
  //
  // Devolve null quando a origem nao da conta — melhor tentar a proxima do que mandar nobre
  // desprotegido ou tomar recusa do jogo.
  function entMontarComando(avail, piso, querEscolta) {
    const cmd = { snob: 1 };
    let pop = ENT_POP_NOBRE;
    let escolta = 0;
    for (let i = 0; i < ENT_ESCOLTA.length; i++) {
      if (escolta >= querEscolta && pop >= piso) break;
      const u = ENT_ESCOLTA[i];
      const p = POP[u] || 1;
      const tem = Math.max(0, (avail[u] || 0));
      if (!tem) continue;
      const faltaEscolta = Math.max(0, querEscolta - escolta);
      const faltaPop = Math.max(0, piso - pop);
      const usa = Math.min(tem, Math.max(faltaEscolta, Math.ceil(faltaPop / p)));
      if (usa > 0) { cmd[u] = (cmd[u] || 0) + usa; pop += usa * p; escolta += usa; }
    }
    if (pop < piso) return null;          // o jogo recusaria
    if (escolta < querEscolta) return null;   // sai desprotegido: tenta outra origem
    return cmd;
  }

  // Custo do nobre, lido da tela da Academia deste mundo (o construtor da tela publica
  // `next_snob wood:40000, stone:50000, iron:50000`). Serve so pra NAO escolher uma origem que
  // nao banca — quem da a palavra final continua sendo o jogo, no erro do `nobleFormar`.
  const ENT_CUSTO_NOBRE = { wood: 40000, stone: 50000, iron: 50000 };

  // Recurso e fazenda livre por coordenada, numa requisicao. Ancorado no bloco de recursos e
  // andando pelas celulas seguintes (armazem, comerciantes, fazenda) — indice fixo quebraria em
  // mundo com coluna a mais, que e a armadilha que ja me pegou na leitura da tropa presente.
  async function entLerRecursos() {
    const r = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=prod&group=0&page=-1',
      { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const num = (s) => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
    const out = {};
    [].forEach.call(doc.querySelectorAll('tr'), (tr) => {
      if (!tr.querySelector('.quickedit-vn[data-id]')) return;
      const w = tr.querySelector('span.wood'), s = tr.querySelector('span.stone'), i = tr.querySelector('span.iron');
      if (!w || !s || !i) return;
      const lbl = tr.querySelector('.quickedit-label');
      const m = ((lbl && lbl.textContent) || '').match(/(\d{1,3}\|\d{1,3})/);
      if (!m) return;
      const tdRes = w.closest('td');
      const arm = tdRes && tdRes.nextElementSibling;
      const com = arm && arm.nextElementSibling;
      const faz = com && com.nextElementSibling;
      const mf = faz ? (faz.textContent || '').replace(/\s+/g, '').match(/^(\d+)\/(\d+)$/) : null;
      out[m[1]] = { wood: num(w.textContent), stone: num(s.textContent), iron: num(i.textContent),
                    fazLivre: mf ? (parseInt(mf[2], 10) - parseInt(mf[1], 10)) : null };
    });
    return out;
  }

  // ===== O que cada origem consegue entregar, e QUANDO =====
  //
  // A escolha de origem era "a mais perto que ja tem nobre". Isso ignora a fila: tres nobres numa
  // aldeia so saem em serie (2h43 cada), enquanto um nobre em cada uma de tres aldeias sai junto.
  // Mas o inverso tambem existe: uma aldeia perto com fila de 2 pode entregar antes de uma vazia
  // que esta 8 campos mais longe. Quem decide e a CHEGADA, nao a distancia nem a fila sozinhas:
  //
  //     chegada(origem, k) = max(agora, fim da fila) + k x duracao + distancia x 35min
  //
  // k=0 e o nobre que ja esta em casa (sai agora). k>=1 sao os que ainda seriam formados.
  async function entLerAcademia(vid) {
    // A DURACAO quase nao muda (depende do Edificio principal), entao vale cache longo. A FILA
    // muda toda hora e por isso e lida sempre.
    const cache = cacheLer('ent_dur', 6 * 3600000) || {};
    let st;
    try { st = await getSnobState(vid); }
    catch (e) { return null; }
    if (!st || !st.hasForm) return null;   // sem Academia
    let durMs = cache[String(vid)] || 0;
    if (!durMs) {
      // A tela mostra a duracao na linha do formulario, no formato h:mm:ss. Medido: 2:43:09 numa
      // aldeia e 2:51:32 noutra — por isso e lido por aldeia, nao fixado.
      try {
        const r = await fetch('/game.php?village=' + vid + '&screen=snob', { credentials: 'include' });
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        const t = ((doc.querySelector('#content_value') || doc.body).textContent || '').replace(/\s+/g, ' ');
        const m = t.match(/(\d+):(\d{2}):(\d{2})/);
        if (m) {
          durMs = ((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) * 1000;
          cache[String(vid)] = durMs;
          cacheGravar('ent_dur', cache);
        }
      } catch (e) {}
    }
    const fila = st.fila || { nobres: 0 };
    // Fim da fila: o ultimo nobre encomendado fica pronto em `prontoEm` + (n-1) duracoes. O jogo
    // so publica a hora do PRIMEIRO, entao o resto e a duracao somada.
    const fim = fila.nobres > 0 && fila.prontoEm
      ? fila.prontoEm + Math.max(0, fila.nobres - 1) * durMs
      : Date.now();
    return {
      vid: String(vid),
      durMs: durMs || 0,
      filaN: fila.nobres || 0,
      fimFila: fim,
      podemFormar: (st.moedas && st.moedas.podemFormar != null) ? st.moedas.podemFormar : null,
    };
  }

  // ===== Tirar o apoio que esta em cima do alvo =====
  //
  // Reusa a retirada em bloco do 086-apoios, que resolve o destino inteiro num POST (em vez de um
  // por origem) e CONFIRMA POR EFEITO — rele a tela e exige que cada item pedido sumiu. Nao vou
  // reescrever isso aqui: aquela funcao custou quatro versoes pra ficar de pe, entre o gate das
  // colunas (`set_village_info_checkboxes`, sem o qual a retirada e ignorada em silencio) e a
  // chave certa do apoio.
  //
  // A DIVISAO QUE IMPORTA SAI DE GRACA: a tela do destino so lista apoio MEU. Apoio de aliado nao
  // aparece la, entao `linhas` vazio com apoio presente significa exatamente uma coisa — o apoio
  // e de outra pessoa e eu nao posso tirar. Quem tira e o dono; o modulo avisa e para.
  async function entRetirarApoio(vid, nome) {
    // Aqui sempre se quer TUDO de volta, entao usa o formulario "Enviar de volta" da propria
    // tela: um campo por aldeia que apoia, em vez de dois por linha de apoio. Numa aldeia com
    // 143 origens isso e 155 variaveis contra ~3.158 — e a versao cara era truncada pelo
    // servidor, deixando apoio pra tras.
    const r = await apoiosDevolverTudoDestino(vid);
    if (!r.origens) return { meu: false, origens: 0 };
    return { meu: true, origens: r.origens };
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
    if (_entEmVoo) { pushLog('Entrega: ciclo anterior ainda rodando — ignorei o disparo.', '', 'entrega'); entAgendar(); return; }
    // O agendador acorda no maximo de 60 em 60s (pra reagir a mudanca de config), entao quem
    // guarda o intervalo de verdade e ESTA linha. Sem ela o ciclo rodaria a cada minuto em vez de
    // a cada dez — mesmo padrao do scavTick.
    if ((c.nextAt || 0) > Date.now()) { entAgendar(); return; }
    _entEmVoo = true;
    try { await entTickInterno(); }
    catch (e) { pushLog('Entrega: ciclo falhou (' + ((e && e.message) || e) + ').', 'err', 'entrega'); }
    finally {
      _entEmVoo = false;
      config.entrega.nextAt = Date.now() + entCfg().intervaloMin * 60000;
      save(); refreshCards('entrega'); entRender(); entAgendar();
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
    let recursos = null;
    try { recursos = await entLerRecursos(); }
    catch (e) { pushLog('Entrega: não li recurso/fazenda das aldeias (' + ((e && e.message) || e) + ')'
      + ' — vou escolher origem sem conferir se ela banca o nobre.', '', 'entrega'); }
    let presente = {};
    try { presente = await entTropaPresente(); }
    catch (e) { pushLog('Entrega: não consegui ler a tropa presente nas aldeias (' + ((e && e.message) || e) + ')'
      + ' — sem isso eu não sei se há apoio de fora, então não bato em ninguém neste ciclo.', 'err', 'entrega'); return; }

    // Aldeia que e alvo nao serve de origem nem de destino de apoio: mandar tropa pra dentro de
    // outra aldeia que tambem vai ser entregue so empurra o problema, e a tropa vai junto no pacote.
    const ehAlvo = {}; alvos.forEach((cd) => { const v = porCoord[cd]; if (v) ehAlvo[v.vid] = 1; });

    // LEALDADE DE TODOS OS ALVOS, DIRETO DA TELA DE CADA ALDEIA.
    _entLeal = {};
    for (const cd of alvos) {
      const vv = porCoord[cd];
      if (!vv) continue;
      try { _entLeal[cd] = await entLerLealdade(vv.vid); }
      catch (e) {
        pushLog('Entrega: não consegui ler a lealdade de ' + vv.name + ' (' + ((e && e.message) || e) + ')'
          + ' — trato como 100 neste ciclo.', 'err', 'entrega');
      }
    }

    // LER OS RELATORIOS DOS MEUS ALVOS.
    //
    // A lealdade so muda quando o relatorio do ataque e lido — e quem lia era o ciclo do NOBLAR,
    // filtrando pelos alvos DELE (`querido[destino]`). As coordenadas da Entrega sao aldeias
    // suas, nunca alvos do Noblar, entao os relatorios nunca eram abertos: a lealdade ficava
    // congelada no ultimo valor e os voos nunca eram dados como pousados. O modulo entao dizia
    // "ja tem nobre a caminho" pra sempre e parava de agir. Era o relatado: "os atks ja bateram,
    // mas ele n ta lendo".
    //
    // Reusa a varredura do Noblar passando os MEUS alvos. Nao atrapalha o dele: a funcao descarta
    // o relatorio que nao e de um alvo pedido ANTES de marcar `vistos`, entao relatorio dele
    // continua intacto pra quando o ciclo dele rodar.
    //
    // So varre quando ha voo registrado: sem nobre no ar nada pousou, e a varredura custa uma
    // requisicao de lista mais uma por relatorio aberto.
    // A varredura de relatorio saiu daqui de proposito: ela existia so pra descobrir a lealdade, e
    // agora a lealdade vem da tela da aldeia. Menos requisicao, e some a dependencia de o
    // relatorio existir — que nao existe quando o nobre morre sem escolta, justamente o caso em
    // que o modulo mais precisava saber o que aconteceu.

    // QUEM AINDA PRECISA DE BATIDA — calculado ANTES do laco, nao lido do estado do ciclo
    // anterior. E o que decide se vale segurar o nobre de uma aldeia pra usar em outra, e ler do
    // estado velho errava em dois casos: no primeiro ciclo (estado vazio, nenhuma "precisa") e
    // depois de mudar a lista. Aqui e de graca — lealdade e conta local, sem requisicao.
    const precisaBatida = {};
    alvos.forEach((cd) => {
      const vv = porCoord[cd];
      if (!vv) return;
      precisaBatida[cd] = entLealdade(vv.coord) > c.teto && entVoando(vv.coord) === 0;
    });

    let bateu = 0, esperando = 0, prontas = 0, evacuou = 0, semOrigem = 0, retirou = 0;

    for (const coord of alvos) {
      const v = porCoord[coord];
      // Coordenada que nao e mais sua: ou a entrega ja aconteceu, ou o usuario digitou errado. Nos
      // dois casos o certo e avisar e seguir, nunca apagar sozinho a lista que ele montou.
      if (!v) { pushLog('Entrega: ' + coord + ' não está entre as suas aldeias — ignorei (entregue? erro de digitação?).', 'err', 'entrega'); continue; }
      const vid = v.vid;
      const alvoXY = entXY(v.coord);
      const leal = entLealdade(v.coord);
      const emCasaTot = UNITS.reduce((s, u) => s + (u[0] === 'snob' ? 0 : ((tropas[String(vid)] || {})[u[0]] || 0)), 0);
      const nobreProprio = (tropas[String(vid)] || {}).snob || 0;
      const pres = presente[v.coord] || { campo: 0, nobre: 0, milicia: 0 };
      // Apoio = tropa de CAMPO presente menos a de campo que e DELA. Compara igual com igual:
      // nobre e milicia ficam de fora dos dois lados. Nunca negativo — sao dois retratos de
      // momentos diferentes e podem discordar por pouco.
      const apoio = Math.max(0, pres.campo - emCasaTot);
      const voando = entVoando(v.coord);
      const d = entDecidir(leal, c.teto, voando, apoio, pres.milicia);
      // O painel le isto; sem gravar, a tabela teria que refazer as requisicoes do ciclo.
      c.estado = c.estado || {};
      c.estado[v.coord] = { nome: v.name, leal: leal, voando: voando, apoio: apoio, emCasa: emCasaTot,
                            nobre: nobreProprio, milicia: pres.milicia, acao: d.acao, txt: d.txt, at: Date.now() };

      if (d.acao === 'ok') {
        prontas++;
        // CHEGOU NO TETO: recolhe a tropa que eu mesmo tirei daqui. Pedido do usuario — a tropa
        // saiu pra o nobre poder vencer, e a partir de agora ficar fora so a deixa ociosa.
        //
        // So volta o que ESTA aldeia mandou: `apoiosRetirarDestino` filtra por origem, entao apoio
        // de outra aldeia parado na mesma vizinha nao e tocado.
        const ev = (c.estado[v.coord] || {}).evacPara;
        if (ev) {
          try {
            const uu = UNITS.map((u) => u[0]);
            const volta = await apoiosRetirarDestino(ev, [{ vid: String(vid) }], uu);
            pushLog('Entrega: ' + v.name + ' chegou em ' + Math.round(leal) + ' (teto ' + c.teto + ') —'
              + (volta.length ? ' recolhi a tropa que estava em ' + ((c.estado[v.coord] || {}).evacParaNome || ev) + '.'
                              : ' não achei tropa minha pra recolher lá.'), 'ok', 'entrega');
            delete c.estado[v.coord].evacPara; delete c.estado[v.coord].evacParaNome;
            save();
          } catch (e) {
            pushLog('Entrega: ' + v.name + ' está no teto, mas não consegui recolher a tropa de '
              + ((c.estado[v.coord] || {}).evacParaNome || ev) + ' (' + ((e && e.message) || e) + ').', 'err', 'entrega');
          }
        }
        continue;
      }
      if (d.acao === 'voando') { esperando++; continue; }
      if (d.acao === 'milicia') { esperando++; pushLog('Entrega: ' + v.name + ' — ' + d.txt + '.', '', 'entrega'); continue; }
      if (d.acao === 'apoio') {
        try {
          const r = await entRetirarApoio(vid, v.name);
          if (!r.meu) {
            // Apoio que nao e meu. Nao da pra tirar: quem manda voltar e o dono.
            pushLog('Entrega: ' + v.name + ' tem ' + fmtN(apoio) + ' tropa(s) de apoio que NÃO é minha —'
              + ' só o dono pode retirar. Peça pra ele, ou tire essa aldeia da lista.', 'err', 'entrega');
            c.estado[v.coord].txt = 'apoio de terceiro — só o dono retira';
          } else {
            retirou++;
            pushLog('Entrega: mandei de volta o apoio de ' + v.name + ' — ' + r.origens
              + ' aldeia(s) recolhendo tropa. Bato quando a aldeia estiver vazia.', 'ok', 'entrega');
            c.estado[v.coord].txt = 'apoio retirado, voltando';
          }
        } catch (e) {
          pushLog('Entrega: não consegui retirar o apoio de ' + v.name + ' (' + ((e && e.message) || e) + ').', 'err', 'entrega');
        }
        continue;
      }
      if (d.acao === 'espera') {
        esperando++;
        pushLog('Entrega: ' + v.name + ' está em ' + leal + ' — ' + d.txt + '.', '', 'entrega');
        continue;
      }

      // --- 1. o alvo precisa estar VAZIO, senão o nobre morre e a lealdade não anda ---
      const emCasa = tropas[String(vid)] || {};
      // O nobre da propria aldeia conta como defensor: com ele em casa o ataque perde.
      const defensores = emCasaTot + nobreProprio;
      if (defensores > 0) {
        const destino = vilas
          .filter((o) => o.vid !== vid && !ehAlvo[o.vid] && o.coord)
          .map((o) => ({ o: o, d: entDist(alvoXY, entXY(o.coord)) }))
          .sort((a, b) => a.d - b.d)[0];
        if (!destino) { pushLog('Entrega: ' + v.name + ' tem tropa em casa e não achei vizinha pra onde apoiar.', 'err', 'entrega'); continue; }
        // O NOBRE DAQUI FICA, SE OUTRO ALVO AINDA PRECISA DE BATIDA.
        //
        // Ele vai embora como ataque num outro alvo (a lista de origens acima ja o enxerga), e
        // isso e melhor que manda-lo apoiar: o voo faz dois trabalhos em vez de um. So quando
        // nao ha mais alvo precisando e que ele sai como apoio — ai o objetivo e so esvaziar.
        //
        // Nobre PODE ir como apoio: conferido no jogo pelo passo de confirmacao, sem erro. Eu
        // ia assumir que nao podia.
        // A PROPRIA ALDEIA NUNCA ENTRA NESTA CONTA, e o motivo e uma regra do jogo, nao uma
        // escolha: aldeia nao ataca a si mesma. Entao o nobre que esta dentro de um alvo NUNCA
        // vai poder baixar a lealdade DESSE alvo — ele so serve pra outro. Com UM alvo so na
        // lista, `outroPrecisa` e sempre falso e o nobre sai como apoio, ficando parado na
        // vizinha. Isso esta certo: quem bate no alvo e o nobre de outra aldeia.
        const outroPrecisa = alvos.some((cd) => cd !== coord && precisaBatida[cd]);
        const seguraNobre = nobreProprio > 0 && outroPrecisa;
        const manda = {};
        UNITS.forEach((u) => {
          if (u[0] === 'snob') { if (!seguraNobre && (emCasa.snob || 0) > 0) manda.snob = emCasa.snob; return; }
          if ((emCasa[u[0]] || 0) > 0) manda[u[0]] = emCasa[u[0]];
        });
        if (!Object.keys(manda).length) {
          pushLog('Entrega: ' + v.name + ' só tem o nobre dela em casa — guardei pra bater em outro alvo da lista.', '', 'entrega');
          continue;
        }
        // Aviso so quando o nobre esta saindo por falta do que fazer. Uma vez por ciclo, e e
        // informacao que muda decisao: o usuario pode preferir mandar esse nobre num alvo novo
        // em vez de estaciona-lo.
        if (nobreProprio > 0 && !seguraNobre) {
          pushLog('Entrega: o nobre de ' + v.name + ' vai sair como apoio e ficar parado — ele não pode'
            + ' bater na própria aldeia, e não há outro alvo na lista precisando dele.', '', 'entrega');
        }
        const dx = entXY(destino.o.coord);
        // sendAttack sinaliza falha LANCANDO; sucesso devolve a duracao (ou null). Testar o
        // retorno como se fosse flag daria "nao consegui" em todo envio que deu certo.
        try {
          await sendAttack(vid, dx.x, dx.y, manda, 'support');
          evacuou++;
          const qtd = Object.keys(manda).reduce((s, u) => s + manda[u], 0);
          // Guarda o destino: e o endereco pra buscar a tropa de volta quando a aldeia chegar no
          // teto. Sem anotar, so daria pra descobrir relendo a tela de apoios de todas as vizinhas.
          c.estado[v.coord].evacPara = destino.o.vid;
          c.estado[v.coord].evacParaNome = destino.o.name;
          pushLog('Entrega: esvaziei ' + v.name + ' — ' + qtd + ' tropa(s) apoiando ' + destino.o.name
            + (seguraNobre ? ' (o nobre dela ficou, vai bater em outro alvo)' : '')
            + '. Bato aqui quando estiver vazia.', 'ok', 'entrega');
        } catch (e) {
          pushLog('Entrega: não consegui esvaziar ' + v.name + ' (' + ((e && e.message) || e) + ').', 'err', 'entrega');
        }
        continue;   // só bate depois de confirmar vazio, no ciclo seguinte
      }

      // --- 2. origem: a aldeia MINHA mais perto que tenha nobre em casa ---
      // ALDEIA DA LISTA TAMBEM SERVE DE ORIGEM — pedido do usuario, e e a jogada certa.
      //
      // O nobre que esta dentro de uma aldeia a entregar precisa sair de la de qualquer jeito
      // (nobre defende, e com defensor o ataque perde e a lealdade nao anda). Manda-lo apoiar
      // uma vizinha resolve a saida e nao faz mais nada. Manda-lo bater em OUTRO alvo da lista
      // resolve a saida E baixa a lealdade do outro: o mesmo voo faz dois trabalhos.
      //
      // A unica exclusao que sobra e a propria aldeia: o jogo nao deixa uma aldeia atacar a si
      // mesma (o `try=confirm` nem devolve duracao, ver 084-noblar).
      const vizinhas = vilas
        .filter((o) => o.vid !== vid && o.coord)
        .map((o) => ({ o: o, d: entDist(alvoXY, entXY(o.coord)) }))
        .filter((x) => x.d <= c.maxCampos)
        .sort((a, b) => a.d - b.d);
      // Quem ja tem nobre EM CASA sai neste ciclo. O resto da vizinhanca entra no planejador,
      // que decide onde FORMAR o que falta.
      const cand = vizinhas.filter((x) => ((tropas[String(x.o.vid)] || {}).snob || 0) > 0);

      const querMandar = d.n || 1;
      let enviados = 0;
      let mandou = false;
      for (const x of cand) {
        if (enviados >= querMandar) break;
        const avail = tropas[String(x.o.vid)] || {};
        const piso = entPisoPop(pontos[String(x.o.vid)] || 0);
        const cmd = entMontarComando(avail, piso, c.escolta);
        if (!cmd) {
          // Tem nobre mas nao tem com quem mandar. Recrutar aqui resolve pro proximo ciclo, em
          // vez de a origem ficar sendo pulada pra sempre.
          if (c.planejar) await entGarantirEscolta(x.o, tropas);
          continue;
        }
        const descontar = () => {
          avail.snob = Math.max(0, (avail.snob || 0) - 1);
          Object.keys(cmd).forEach((u) => { if (u !== 'snob') avail[u] = Math.max(0, (avail[u] || 0) - cmd[u]); });
        };
        try {
          const dur = await sendAttack(x.o.vid, alvoXY.x, alvoXY.y, cmd, 'attack');
          bateu++; mandou = true; enviados++;
          descontar();   // o mapa de tropa é um retrato; o mesmo nobre não pode ir duas vezes
          // REGISTRA O VOO. Sem isto o proximo ciclo nao sabe que ja tem nobre indo e manda outro.
          // `sendAttack` devolve a duracao em segundos justamente pra isso.
          nobleRegistraEnvio(v.coord, 1, dur || Math.round(x.d * 35 * 60), x.o.name);
          if (c.estado && c.estado[v.coord]) { c.estado[v.coord].voando = voando + enviados; c.estado[v.coord].acao = 'voando'; }
          const min = Math.round(x.d * 35);
          pushLog('Entrega: nobre ' + enviados + '/' + querMandar + ' de ' + x.o.name + ' → ' + v.name
            + ' (lealdade ' + Math.round(leal) + ', ' + d.txt + ') · ' + x.d.toFixed(1) + ' campos, '
            + Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0') + '.', 'ok', 'entrega');
          continue;   // pode caber mais de um nesta rodada: quem limita e `querMandar`
        } catch (e) {
          const msg = (e && e.message) || String(e);
          // AMBIGUO NAO PODE VIRAR REENVIO. `sendAttack` marca assim a resposta que tanto pode ser
          // recusa quanto sucesso; tentar a proxima origem aqui e como o comando saiu dobra o
          // ataque na propria aldeia — e duas batidas seguidas sao exatamente o que pode zerar a
          // lealdade. Na duvida, para e deixa o proximo ciclo reler a lealdade.
          if (/^ambiguo:/.test(msg)) {
            mandou = true; enviados++; descontar();
            // Registra como se tivesse saido. Se nao saiu, o pior e um ciclo de espera; se saiu e
            // eu nao registrasse, o proximo ciclo mandaria outro — e e esse o erro caro.
            nobleRegistraEnvio(v.coord, 1, Math.round(x.d * 35 * 60), x.o.name);
            pushLog('Entrega: ' + x.o.name + ' → ' + v.name + ' — resposta ambígua, não sei se saiu.'
              + ' NÃO vou tentar outra origem: o próximo ciclo relê a lealdade e decide.', 'err', 'entrega');
            break;
          }
          pushLog('Entrega: ' + x.o.name + ' recusou (' + msg + ') — tento a próxima origem.', '', 'entrega');
        }
      }
      const faltam = querMandar - enviados;
      if (faltam > 0) {
        if (!enviados) semOrigem++;
        pushLog('Entrega: ' + v.name + ' está em ' + Math.round(leal) + ' e precisa de ' + querMandar
          + ' batida(s) — ' + enviados + ' saiu(ram) agora, faltam ' + faltam + '.', '', 'entrega');
        // PLANEJA o que faltou: escolhe onde formar pela CHEGADA (fila + viagem), nao pela
        // distancia. Tambem recruta escolta onde falta, o que roda em paralelo com a Academia.
        if (c.planejar) {
          try { await entPlanejarFormacao(v, alvoXY, vizinhas, faltam, tropas, recursos); }
          catch (e) { pushLog('Entrega: falhou ao planejar a formação pra ' + v.name + ' (' + ((e && e.message) || e) + ').', 'err', 'entrega'); }
        }
        if (c.reciclar && !enviados) await entReciclar(v, alvoXY, vilas, ehAlvo, tropas, alvos, porCoord);
      }
    }

    pushLog('Entrega: ' + prontas + ' na faixa · ' + bateu + ' batida(s) · ' + esperando + ' esperando regenerar'
      + (evacuou ? ' · ' + evacuou + ' esvaziada(s)' : '')
      + (retirou ? ' · ' + retirou + ' com apoio retirado' : '')
      + (semOrigem ? ' · ' + semOrigem + ' SEM nobre disponível' : '') + '.', 'ok', 'entrega');
    save();
  }

  // ===== PLANEJADOR: onde formar o que falta, pela CHEGADA =====
  //
  // Chamado quando o alvo precisa de N batidas e nao ha N nobres prontos no alcance. Em vez de
  // formar "na mais perto", compara a chegada real de cada vaga possivel:
  //
  //     chegada(origem, k) = max(agora, fim da fila da origem) + k x duracao + distancia x 35min
  //
  // Isso resolve os dois casos que o usuario descreveu, com a mesma conta:
  //   - tres aldeias perto, uma vaga cada, saem em paralelo e ganham de tres na mesma aldeia;
  //   - mas se as "perto" estiverem todas com fila, a longe vazia pode chegar antes.
  //
  // NAO forma alem do que o limite da conta permite (`podemFormar`), e nao forma pra alem do que
  // o alvo precisa AGORA — o teto de seguranca ja limita quantos podem voar juntos, e nobre
  // formado a mais fica ocupando vaga do limite sem ter no que ser usado.
  const ENT_ESC_SPEAR_PCT = 0.7;   // a escolta recrutada sai 70% lanceiro / 30% cavalaria leve:
  const ENT_ESC_LIGHT_PCT = 0.3;   // sao as duas mais rapidas de recrutar, que era o pedido.

  async function entPlanejarFormacao(alvo, alvoXY, cand, faltam, tropas, recursos) {
    const c = entCfg();
    const vagas = [];
    let limite = null;
    let naFila = 0;
    const olhar = cand.slice(0, c.olhar);
    for (const x of olhar) {
      const ac = await entLerAcademia(x.o.vid);
      if (!ac || !ac.durMs) continue;                 // sem Academia (ou nao li a duracao)
      if (ac.podemFormar != null) limite = ac.podemFormar;
      naFila += ac.filaN || 0;
      // ORIGEM QUE NAO BANCA NAO ENTRA. Sem esta checagem o planejador escolhia pela chegada e so
      // descobria no erro do jogo ("Nao ha recursos suficientes ou o limite da populacao foi
      // atingido"), gastando a vaga da rodada com uma aldeia que nunca ia formar.
      const rc = recursos && recursos[x.o.coord];
      if (rc) {
        const semRec = rc.wood < ENT_CUSTO_NOBRE.wood || rc.stone < ENT_CUSTO_NOBRE.stone || rc.iron < ENT_CUSTO_NOBRE.iron;
        const semPop = rc.fazLivre != null && rc.fazLivre < ENT_POP_NOBRE;
        if (semRec || semPop) continue;
      }
      const viagem = x.d * 35 * 60000;
      // k comeca em 1: k=0 (nobre ja pronto) foi tratado antes, no laco de envio.
      for (let k = 1; k <= faltam; k++) {
        vagas.push({ o: x.o, d: x.d, k: k, ac: ac,
                     chega: Math.max(Date.now(), ac.fimFila) + k * ac.durMs + viagem });
      }
    }

    // NOBRE QUE JA ESTA NA FILA CONTA. Sem isto o planejador formava de novo a CADA ciclo: a
    // lealdade so muda quando o nobre pousa, entao `faltam` continuava o mesmo por horas e o
    // ciclo seguinte encomendava outro. Com o ciclo em 1 min e 6h de voo, isso torra o limite da
    // conta inteiro em nobres que ninguem pediu.
    //
    // A conta e por VIZINHANCA, nao por alvo: um nobre na fila a 3 campos daqui serve este alvo
    // quando ficar pronto. Se ele tiver sido encomendado pra outro alvo, os dois vao ve-lo e
    // nenhum dos dois forma — erra pra MENOS, que custa um ciclo de espera em vez de nobre
    // jogado fora.
    if (naFila >= faltam) {
      pushLog('Entrega: ' + alvo.name + ' — já tem ' + naFila + ' nobre(s) na fila por perto'
        + ' pra ' + faltam + ' que falta(m). Não encomendei mais.', '', 'entrega');
      return 0;
    }
    faltam = faltam - naFila;
    if (!vagas.length) {
      pushLog('Entrega: ' + alvo.name + ' — nenhuma origem com Academia dentro de ' + c.maxCampos + ' campos.', 'err', 'entrega');
      return 0;
    }
    vagas.sort((a, b) => a.chega - b.chega);

    // O limite de nobres e da CONTA: nao adianta escolher bem se nao ha vaga pra formar.
    if (limite === 0) {
      pushLog('Entrega: ' + alvo.name + ' precisa de ' + faltam + ' nobre(s), mas o limite da conta'
        + ' está cheio. Ligue "reciclar nobre distante" ou dispense algum pela aba Noblar.', 'err', 'entrega');
      return 0;
    }
    const teto = limite == null ? faltam : Math.min(faltam, limite);
    const porOrigem = {};
    let formados = 0;
    for (const vg of vagas) {
      if (formados >= teto) break;
      const jaNesta = porOrigem[vg.o.vid] || 0;
      if (vg.k !== jaNesta + 1) continue;             // respeita a ordem da fila daquela origem
      try {
        await nobleFormar(vg.o.vid);
        porOrigem[vg.o.vid] = jaNesta + 1;
        formados++;
        const min = Math.round((vg.chega - Date.now()) / 60000);
        pushLog('Entrega: formando nobre em ' + vg.o.name + ' pra ' + alvo.name
          + ' — ' + vg.d.toFixed(1) + ' campos, fila ' + vg.ac.filaN + ', chega em '
          + Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0') + '.', 'ok', 'entrega');
        await entGarantirEscolta(vg.o, tropas);
      } catch (e) {
        pushLog('Entrega: ' + vg.o.name + ' não formou (' + ((e && e.message) || e) + ').', '', 'entrega');
      }
    }
    if (!formados) pushLog('Entrega: ' + alvo.name + ' — não consegui formar nobre em nenhuma origem.', 'err', 'entrega');
    return formados;
  }

  // A escolta e recrutada no QUARTEL e no ESTABULO, que sao filas SEPARADAS da Academia — entao
  // isso roda em paralelo com o nobre e nao atrasa nada. Lanceiro e cavalaria leve sao as duas
  // mais rapidas, que era o pedido do usuario; o lanceiro soma pouco ataque (10 contra 130 da CL),
  // mas o papel aqui e volume barato contra uma aldeia que deve estar vazia.
  async function entGarantirEscolta(origem, tropas) {
    const c = entCfg();
    const avail = tropas[String(origem.vid)] || {};
    const tem = ENT_ESCOLTA.reduce((s, u) => s + (avail[u] || 0), 0);
    const falta = c.escolta - tem;
    if (falta <= 0) return;
    const pedido = {
      spear: Math.ceil(falta * ENT_ESC_SPEAR_PCT),
      light: Math.ceil(falta * ENT_ESC_LIGHT_PCT),
    };
    try {
      await sendRecruit(origem.vid, pedido);
      pushLog('Entrega: ' + origem.name + ' está sem escolta (' + tem + ' de ' + c.escolta + ') —'
        + ' mandei recrutar ' + pedido.spear + ' lanceiro e ' + pedido.light + ' cavalaria leve.', 'ok', 'entrega');
    } catch (e) {
      pushLog('Entrega: ' + origem.name + ' não recrutou escolta (' + ((e && e.message) || e) + ').', '', 'entrega');
    }
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
      // DISPENSAR, e nao mandar o nobre morrer num ataque. Os dois perdem o recurso da unidade
      // por igual — o comentario do 087 que chama dispensar de "perda pura" nao separa os dois,
      // porque nobre que morre tambem nao devolve nada. O que separa e a PRESSA, e pressa e o
      // proposito inteiro do reciclar:
      //
      //   dispensar ............ vaga abre AGORA        -> nobre novo pronto em 2h43
      //   morrer a 3 campos .... vaga abre em 1h45      -> pronto em 4h28
      //   morrer a 10 campos ... vaga abre em 5h50      -> pronto em 8h33
      //
      // E o ataque ainda custa os exploradores que completam o piso de fake (10 numa origem de
      // 12.000 pontos) e corre o risco de a aldeia-sacrificio estar sem defesa na hora do pouso —
      // ai o ataque vence e a lealdade DELA cai. Decisao do usuario, com esses numeros na mesa.
      try {
        await nbDescDispensar(vitima.o.vid, 1);
        (tropas[String(vitima.o.vid)] || {}).snob = Math.max(0, ((tropas[String(vitima.o.vid)] || {}).snob || 1) - 1);
        pushLog('Entrega: dispensei 1 nobre de ' + vitima.o.name + ' (a ' + vitima.perto.toFixed(1)
          + ' campos do alvo mais próximo — não alcançava nenhum). A vaga abriu na hora.', 'ok', 'entrega');
      } catch (e) {
        pushLog('Entrega: não consegui dispensar o nobre de ' + vitima.o.name + ' ('
          + ((e && e.message) || e) + ').', 'err', 'entrega');
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

  // ===== A tabela =====
  //
  // Desenha do `c.estado`, gravado pelo ciclo — nao refaz requisicao nenhuma. Enquanto o ciclo
  // nao rodar uma vez, mostra o que da pra saber sem rede (a lealdade guardada) e diz que o
  // resto ainda nao foi medido, em vez de inventar zero.
  const ENT_CORES = { ok: '#2f7a2f', voando: '#5c7aa8', espera: '#b5651d', apoio: '#b03030', bate: '#7a5320' };
  function entRender() {
    const box = document.getElementById('twmgr-ent-tab');
    if (!box) return;
    const c = entCfg();
    const alvos = c.alvos || [];
    if (!alvos.length) { box.innerHTML = '<div class="twmgr-hint">Nenhuma aldeia na lista.</div>'; return; }
    const est = c.estado || {};
    const linhas = alvos.map((coord) => {
      const e = est[coord];
      if (!e) {
        return '<tr><td style="padding:3px 4px"><b>' + esc(coord) + '</b></td>'
          + '<td colspan="4" style="padding:3px 4px;color:#8a7d6d">ainda não medida — roda no próximo ciclo</td></tr>';
      }
      const cor = ENT_CORES[e.acao] || '#6f6153';
      const leal = Math.round(e.leal);
      // Barra: cheia em 100, e a marca do teto fica visivel pra dar escala ao numero.
      const pct = Math.max(0, Math.min(100, leal));
      const corBarra = leal <= c.teto ? '#2f7a2f' : (leal <= 35 ? '#b5651d' : '#b03030');
      return '<tr>'
        + '<td style="padding:3px 4px"><b>' + esc(e.nome || coord) + '</b>'
          + '<div style="font-size:9px;color:#8a7d6d">' + esc(coord) + '</div></td>'
        + '<td style="padding:3px 4px;width:110px">'
          + '<div style="display:flex;align-items:center;gap:4px">'
            + '<b style="color:' + corBarra + ';min-width:22px;text-align:right">' + leal + '</b>'
            + '<div style="position:relative;flex:1;height:7px;background:#ece4d8;border-radius:3px">'
              + '<div style="width:' + pct + '%;height:100%;background:' + corBarra + ';border-radius:3px"></div>'
              + '<div style="position:absolute;left:' + Math.min(100, c.teto) + '%;top:-2px;width:1px;height:11px;background:#5c4423" title="teto ' + c.teto + '"></div>'
            + '</div>'
          + '</div></td>'
        + '<td style="padding:3px 4px;text-align:center">' + (e.voando ? ('<b>' + e.voando + '</b>') : '—') + '</td>'
        + '<td style="padding:3px 4px;text-align:center">'
          + (e.apoio ? ('<b style="color:#b03030">' + fmtN(e.apoio) + '</b>') : (e.emCasa ? ('<span style="color:#b5651d">' + fmtN(e.emCasa) + ' própria</span>') : '<span style="color:#2f7a2f">vazia</span>'))
          + '</td>'
        + '<td style="padding:3px 4px;color:' + cor + '">' + esc(e.txt || '') + '</td>'
        + '</tr>';
    }).join('');
    box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:10px">'
      + '<tr style="color:#8a7d6d;font-size:9px;text-align:left">'
        + '<th style="padding:2px 4px">aldeia</th><th style="padding:2px 4px">lealdade</th>'
        + '<th style="padding:2px 4px;text-align:center" title="nobres meus já a caminho desta aldeia">indo</th>'
        + '<th style="padding:2px 4px;text-align:center" title="tropa dentro da aldeia: apoio de fora impede a batida">tropa</th>'
        + '<th style="padding:2px 4px">situação</th></tr>'
      + linhas + '</table>';
  }

  function entAgendar() {
    clearTimeout(entTimer);
    if (!config.entrega || !config.entrega.ligado) return;
    const falta = Math.min(Math.max((config.entrega.nextAt || 0) - Date.now(), 1000), 60000);
    entTimer = setTimeout(entTick, falta);
  }
  function entStart() {
    entCfg().ligado = true; config.entrega.nextAt = Date.now() + 2000; save();
    pushLog('Entrega: ligado — teto de lealdade ' + config.entrega.teto
      + ', ciclo a cada ' + config.entrega.intervaloMin + ' min.', 'ok', 'entrega');
    refreshCards('entrega'); entAgendar();
  }
  function entStop() {
    entCfg().ligado = false; save();
    pushLog('Entrega: desligado.', '', 'entrega');
    refreshCards('entrega'); clearTimeout(entTimer);
  }
