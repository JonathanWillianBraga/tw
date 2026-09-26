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

  // Lealdade projetada pra agora, reusando o motor do Noblar (que ja envelhece a leitura pela
  // regeneracao e trava a extrapolacao quando ha pouso sem relatorio). Sem relatorio nenhum, a
  // premissa do Noblar vale igual aqui: aldeia nunca batida esta em 100.
  function entLealdade(coord) {
    try { return nobleLealdadeAgora(coord); } catch (e) { return 100; }
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
  function entVoando(coord) {
    try { return (nobleVoos(coord) || []).reduce((s, e) => s + (e.n || 1), 0); } catch (e) { return 0; }
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
    let presente = {};
    try { presente = await entTropaPresente(); }
    catch (e) { pushLog('Entrega: não consegui ler a tropa presente nas aldeias (' + ((e && e.message) || e) + ')'
      + ' — sem isso eu não sei se há apoio de fora, então não bato em ninguém neste ciclo.', 'err', 'entrega'); return; }

    // Aldeia que e alvo nao serve de origem nem de destino de apoio: mandar tropa pra dentro de
    // outra aldeia que tambem vai ser entregue so empurra o problema, e a tropa vai junto no pacote.
    const ehAlvo = {}; alvos.forEach((cd) => { const v = porCoord[cd]; if (v) ehAlvo[v.vid] = 1; });

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
      const cand = vilas
        .filter((o) => o.vid !== vid && o.coord)
        .filter((o) => ((tropas[String(o.vid)] || {}).snob || 0) > 0)
        .map((o) => ({ o: o, d: entDist(alvoXY, entXY(o.coord)) }))
        .filter((x) => x.d <= c.maxCampos)
        .sort((a, b) => a.d - b.d);

      const querMandar = d.n || 1;
      let enviados = 0;
      let mandou = false;
      for (const x of cand) {
        if (enviados >= querMandar) break;
        const avail = tropas[String(x.o.vid)] || {};
        const piso = entPisoPop(pontos[String(x.o.vid)] || 0);
        const cmd = entMontarComando(avail, piso, c.escolta);
        if (!cmd) continue;   // não dá a escolta pedida (ou o piso de fake); tenta a próxima
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
      if (mandou && enviados < querMandar) {
        pushLog('Entrega: ' + v.name + ' — mandei ' + enviados + ' de ' + querMandar
          + ' (faltou nobre ou escolta nas origens). O resto vai no próximo ciclo.', '', 'entrega');
      }
      if (!mandou) {
        semOrigem++;
        pushLog('Entrega: ' + v.name + ' está em ' + Math.round(leal) + ' e precisa de ' + querMandar
          + ' batida(s), mas nenhuma origem dentro de ' + c.maxCampos + ' campos tem nobre MAIS '
          + c.escolta + ' de escolta. Baixe a escolta ou aumente o alcance.', 'err', 'entrega');
        if (c.reciclar) await entReciclar(v, alvoXY, vilas, ehAlvo, tropas, alvos, porCoord);
      }
    }

    pushLog('Entrega: ' + prontas + ' na faixa · ' + bateu + ' batida(s) · ' + esperando + ' esperando regenerar'
      + (evacuou ? ' · ' + evacuou + ' esvaziada(s)' : '')
      + (retirou ? ' · ' + retirou + ' com apoio retirado' : '')
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
