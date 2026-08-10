  // ==================== NOBLAR (planeja e arma a conquista de alvos) ====================
  // Voce cola as coordenadas, define o limite de horas de viagem, e o modulo monta o PLANO: de quais
  // aldeias sairiam os nobres e em quanto tempo cada comando chega. Ele NAO dispara sozinho --
  // decisao do usuario: nobre e caro e o envio e irreversivel, entao o disparo passa pelo seu OK.
  //
  // A duracao vem do PROPRIO JOGO. Em vez de calcular distancia x velocidade da unidade x velocidade
  // do mundo (tres constantes pra errar), o plano prepara o comando de verdade (`try=confirm`) e le
  // o `data-duration` que o servidor devolve. Vale em qualquer mundo, com ou sem bonus de velocidade.
  //
  // REGRAS DE ENVIO (definidas pelo usuario, ago/2026):
  //   - envio PARCIAL vale: se so ha 2 nobres no alcance, manda 2. Esperar fechar os 4 deixava
  //     nobre parado enquanto o alvo seguia intacto.
  //   - NUNCA cunhar automaticamente. Cunhar gasta recurso sem volta num alvo que pode nem
  //     sair; quem cunha e o usuario, a mao, pelo Mercado. Aqui so se FORMA nobre -- o
  //     recurso ja virou moeda, formar so materializa o que ja foi pago.
  //   - pool GLOBAL: os alvos sao servidos na ordem da LISTA e cada um consome do pool. Com
  //     6 nobres e 2 alvos: 4 no primeiro, 2 no segundo. Com 4: os 4 no primeiro e o segundo
  //     espera. Sem isso o mesmo nobre era prometido pros dois e o 2o disparo falhava.
  //
  // O quanto se manda em cada alvo vem de um MODELO (config.noble.templates): quantos comandos,
  // que escolta, viagem maxima e se e so NT. Cada alvo aponta pro seu (`a.tpl`).
  //
  // UM NOBRE POR COMANDO. A lealdade cai uma vez por ATAQUE, nao por nobre: mandar 4 nobres
  // num comando so queima 3 a toa. E por isso que "NT" existe como conceito no jogo -- sao 4
  // comandos SEGUIDOS, nao um comando com 4. Entao `nobres por alvo` = quantos COMANDOS sair,
  // e cada um leva snob:1 + a escolta do modelo.
  //
  // A escolta viaja NO MESMO comando do nobre, nao num ataque separado: em comando proprio ela
  // chegaria antes e morreria sozinha. Como cada comando tem a sua, uma aldeia que manda 3
  // nobres precisa de 3x a escolta.
  //
  // A escolta e so tropa de campo (sem explorador, ariete e catapulta) -- pedido do usuario.
  // Efeito colateral bom: o nobre (35) e a unidade mais LENTA do jogo, entao a escolta nunca
  // muda a hora de chegada. A duracao segue vindo do proprio jogo mesmo assim.

  const NOBLE_POR_CONQUISTA = 4;   // padrao: 4 comandos derrubam 100 de lealdade no caso tipico
  // Quem pode ir de escolta. Explorador nao briga; ariete e catapulta servem pra muralha e
  // predio, nao pra proteger nobre. Fica so tropa de campo.
  const NOBLE_ESCOLTA = ['spear', 'sword', 'axe', 'light', 'heavy'];
  // Total de nobres da conta, lido de passagem na Academia ("Na Aldeia/Total"). Vive fora do
  // config porque é estado do jogo, não escolha do usuário — mas vai pro stats pro card mostrar.
  let _nbTotalConta = null;

  // A coordenada e de uma aldeia MINHA? Alvo assim nao da erro claro no jogo: o `try=confirm`
  // simplesmente nao devolve duracao pra um ataque da aldeia contra ela mesma, e isso chegava
  // aqui como "origem descartada" — mensagem que nao ajuda e que se repetiria pra sempre.
  // ===== Quantos nobres o alvo ainda precisa =====
  // A lealdade LIDA envelhece: regenera ~1/h, entao a leitura de 2 dias atras nao vale mais.
  // Projeta pra AGORA, com teto 100. Devolve null quando nunca houve relatorio com lealdade
  // (so ataque com nobre traz esse campo).
  // Quando a lealdade foi MEDIDA. Relatorio antigo (anterior ao campo) cai no `at`, que era o
  // comportamento de antes.
  function nobleLealdadeAt(r) { return (r && (r.lealdadeAt || r.at)) || 0; }
  function nobleLealdadeAgora(coord) {
    const r = (config.noble.relatorios || {})[coord];
    const t = nobleLealdadeAt(r);
    if (!r || r.lealdade == null || !t) return null;
    const h = Math.max(0, (Date.now() - t) / 3600000);
    return Math.min(100, r.lealdade + h * (config.noble.lealdadeRegen || 0));
  }

  // Comandos que EU mandei e que ainda nao aparecem no numero da lealdade.
  //
  // NAO poda quando o comando pousa: entre pousar e o relatorio ser lido existe uma janela em
  // que a lealdade ainda e a antiga E o comando ja sumiu -- podar ali contaria o mesmo nobre
  // duas vezes e mandaria um a mais.
  //
  // A poda compara o relatorio com a CHEGADA do comando, nao com a partida. Comparar com a
  // partida apagava comando que ainda estava no ar, por dois caminhos:
  //
  //   1. mandei 4 comandos as 10h, chegam as 13h. O primeiro pousa e gera relatorio das 13h.
  //      "relatorio mais novo que o envio (10h)" valia pros QUATRO -- os outros tres sumiam do
  //      registro sem nunca terem sido contados.
  //   2. quando `parseReportDate` nao entende a data da lista, o relatorio e carimbado com
  //      Date.now(). Agora e sempre maior que qualquer envio passado, entao TODO comando no ar
  //      era apagado no ciclo seguinte -- que e o sintoma relatado: "tem 4 a caminho e ele acha
  //      que nao tem nada enviado".
  //
  // Pela chegada os dois somem: comando que ainda nao pousou tem `chega` no futuro, e nenhum
  // relatorio ja escrito pode ser mais novo que isso. Registro antigo sem `chega` cai no `at`,
  // que era o comportamento de antes.
  //
  // Expiracao dura de 48h pra um registro perdido (envio que falhou calado, relatorio
  // apagado) nao travar o alvo pra sempre.
  function nobleVoos(coord) {
    const lista = (config.noble.emVoo || {})[coord] || [];
    const rel = (config.noble.relatorios || {})[coord];
    const agora = Date.now();
    const vivos = lista.filter((e) => {
      if (agora - e.at > 48 * 3600000) return false;
      // Compara com a MEDIÇÃO de lealdade, não com o último relatório qualquer: só relatório de
      // nobre prova que o comando pousou. Um saque no alvo não diz nada sobre o nobre.
      const medido = nobleLealdadeAt(rel);
      if (rel && rel.lealdade != null && medido && medido >= (e.chega || e.at)) return false;
      return true;
    });
    if (vivos.length !== lista.length) {
      if (vivos.length) config.noble.emVoo[coord] = vivos; else delete config.noble.emVoo[coord];
    }
    return vivos;
  }
  function nobleEmVoo(coord) {
    return nobleVoos(coord).reduce((a, e) => a + (e.n || 1), 0);
  }
  // O total do nobleEmVoo junta duas coisas bem diferentes, e chamar as duas de "a caminho"
  // confunde: o que o JOGO lista está mesmo voando; o que sobra do caderno local já POUSOU e só
  // não teve relatório de nobre ainda (é contado de propósito, pra não mandar um a mais na
  // janela em que a lealdade lida ainda é a antiga). Aqui elas saem separadas, pra tela poder
  // dizer a verdade sobre cada uma.
  // Nobres de TODAS as aldeias numa requisição só. `type=own_home` devolve UMA linha por aldeia
  // (só o que está em casa), que é exatamente quem pode sair agora — a versão `complete` traz 5
  // linhas por aldeia e obrigaria a casar rótulo. Por aldeia seria 1 fetch cada, inviável pra
  // uma tabela que abre no clique.
  let _nbSnobCache = null, _nbSnobAt = 0;
  async function nobleSnobPorAldeia(forcar) {
    if (!forcar && _nbSnobCache && (Date.now() - _nbSnobAt) < 60000) return _nbSnobCache;
    const res = await fetch('/game.php?village=' + CUR_VID
      + '&screen=overview_villages&mode=units&type=own_home&page=-1', { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const tabela = doc.querySelector('#units_table') || doc.querySelector('table.overview_table');
    if (!tabela) throw new Error('não achei a tabela de tropas');
    // A ordem das colunas sai do cabeçalho DESTA tabela: varia por mundo (arqueiro, milícia...).
    const ordem = [];
    (tabela.querySelector('thead tr') || tabela.querySelector('tr')).querySelectorAll('th').forEach((th) => {
      const img = th.querySelector('img[src*="unit_"]');
      if (!img) return;
      const m = (img.getAttribute('src') || '').match(/unit_(\w+)\./);
      if (m) ordem.push(m[1]);
    });
    // Guarda TODAS as unidades, não só o nobre: o diagnóstico precisa saber se a origem consegue
    // montar a escolta do modelo — foi o caso real de uma aldeia com nobre e só 26 bárbaros
    // contra os 50 que o modelo pede.
    const out = {};
    tabela.querySelectorAll('tr').forEach((tr) => {
      const q = tr.querySelector('.quickedit-vn[data-id]'); if (!q) return;
      const vid = q.getAttribute('data-id'); if (!vid) return;
      const cels = tr.querySelectorAll('td.unit-item');
      if (cels.length !== ordem.length) return;
      const n = {};
      cels.forEach((td, i) => { n[ordem[i]] = parseInt((td.textContent || '').replace(/\D/g, ''), 10) || 0; });
      out[String(vid)] = n;
    });
    _nbSnobCache = out; _nbSnobAt = Date.now();
    return out;
  }
  // Velocidade do nobre, do próprio mundo (min por campo). O limite do modelo é em HORAS, então
  // mostrar distância em campos não responde "cabe no limite?" — medido na conta: 26,9 campos
  // são 15,7 h, contra um limite de 10 h. Parecia perto e estava fora.
  // Conferido contra o servidor: nobre = 35,00 min/campo cravado, batendo com get_unit_info.
  let _nbVelCache = null;
  async function nobleVelNobre() {
    if (_nbVelCache != null) return _nbVelCache;
    try {
      const [u, c] = await Promise.all([
        fetch('/interface.php?func=get_unit_info', { credentials: 'include' }).then((r) => r.text()),
        fetch('/interface.php?func=get_config', { credentials: 'include' }).then((r) => r.text()),
      ]);
      const du = new DOMParser().parseFromString(u, 'text/xml');
      const dc = new DOMParser().parseFromString(c, 'text/xml');
      const g = (d, sel) => { const e = d.querySelector(sel); return e ? parseFloat(e.textContent.trim()) : NaN; };
      const vel = g(du, 'snob speed');
      const ws = g(dc, 'speed') || 1, us = g(dc, 'unit_speed') || 1;
      if (!isNaN(vel) && vel > 0) _nbVelCache = vel / (ws * us);
    } catch (e) { /* fica no padrão abaixo */ }
    if (_nbVelCache == null) _nbVelCache = 35;   // padrão do TW; só vale se /interface.php falhar
    return _nbVelCache;
  }
  // Nível da Academia de todas as aldeias, numa requisição só (mode=buildings traz o prédio
  // inteiro de cada aldeia). Serve pra mostrar quem PODE formar nobre mesmo sem ter um agora —
  // aldeia com Academia perto do alvo é candidata a produzir; aldeia longe só gasta moeda à toa.
  let _nbAcadCache = null, _nbAcadAt = 0;
  async function nobleAcademias(forcar) {
    if (!forcar && _nbAcadCache && (Date.now() - _nbAcadAt) < 300000) return _nbAcadCache;
    const res = await fetch('/game.php?village=' + CUR_VID
      + '&screen=overview_villages&mode=buildings&page=-1', { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const tb = doc.querySelector('#buildings_table') || doc.querySelector('table.overview_table');
    if (!tb) throw new Error('não achei a tabela de edifícios');
    // O índice da coluna sai do cabeçalho: a ordem dos prédios varia por mundo.
    let iSnob = -1;
    [].forEach.call(tb.querySelectorAll('th'), (th, i) => {
      const im = th.querySelector('img');
      if (im && /\/snob\.webp/.test(im.getAttribute('src') || '')) iSnob = i;
    });
    const out = {};
    if (iSnob >= 0) {
      tb.querySelectorAll('tr').forEach((tr) => {
        const q = tr.querySelector('.quickedit-vn[data-id]'); if (!q) return;
        const tds = tr.querySelectorAll('td'); if (tds.length < iSnob + 1) return;
        const lvl = parseInt((tds[iSnob].textContent || '').replace(/\D/g, ''), 10) || 0;
        if (lvl > 0) out[String(q.getAttribute('data-id'))] = lvl;
      });
    }
    _nbAcadCache = out; _nbAcadAt = Date.now();
    return out;
  }
  // Quem PODERIA noblar o alvo: toda aldeia sua com nobre em casa, ordenada por distância.
  // É a resposta pra "por que esse alvo não anda" — a caixa antes só mostrava quem já ia,
  // e num alvo em "Aguardando" (que nem chega a ser planejado) isso era sempre vazio.
  async function nobleCandidatos(alvo) {
    const [todas, snob, vel, acad] = await Promise.all([
      getAllVillagesCached(), nobleSnobPorAldeia(), nobleVelNobre(),
      nobleAcademias().catch(() => ({})),   // sem Academias: a tabela segue, só sem a coluna
    ]);
    const tpl0 = nobleTplsDe(alvo)[0];
    const limite = (tpl0 && tpl0.t && tpl0.t.maxHoras != null) ? tpl0.t.maxHoras : null;
    const out = [];
    (todas || []).forEach((v) => {
      const m = (v.coord || '').match(/(\d+)\|(\d+)/); if (!m) return;
      if (+m[1] === alvo.x && +m[2] === alvo.y) return;      // a própria aldeia do alvo não é origem
      const tropa = snob[String(v.vid)] || {};
      const n = tropa.snob || 0;
      const ac = acad[String(v.vid)] || 0;
      // Entra quem tem nobre AGORA ou quem tem Academia (pode formar). Sem os dois, não serve.
      if (!n && !ac) return;
      const d = fieldDist(+m[1], +m[2], alvo.x, alvo.y);
      const horas = (d * vel) / 60;
      // Escolta: o que falta pra fechar a composição do modelo nesta origem.
      const esc = (tpl0 && tpl0.t && tpl0.t.escolta) || {};
      const faltaEsc = [];
      Object.keys(esc).forEach((u) => {
        const pedido = +esc[u] || 0; if (pedido <= 0) return;
        const tem = tropa[u] || 0;
        if (tem < pedido) faltaEsc.push({ u: u, pede: pedido, tem: tem });
      });
      out.push({ vid: v.vid, nome: v.name || v.coord, coord: v.coord, nobres: n, acad: ac,
                 d: d, horas: horas, dentro: (limite == null) || (horas <= limite),
                 faltaEsc: faltaEsc });
    });
    out.sort((a, b) => a.horas - b.horas);
    return out;
  }
  // ---- Por que este alvo não está sendo atacado? ----
  // As causas moram em lugares diferentes (fila, alcance, estoque de nobre, escolta), e antes o
  // usuário tinha que juntar as peças na mão. Aqui elas são checadas NA ORDEM em que o motor
  // esbarra nelas, e a primeira que bater é a resposta — as seguintes nem são alcançadas.
  function nobleDiagnostico(alvo, p, cand) {
    const idx = (config.noble.alvos || []).findIndex((z) => z.coord === alvo.coord);
    const det = nobleEmVooDetalhe(alvo.coord);
    if (alvo.noblada) return { cor: '#3f8f52', t: 'Conquistada.', d: 'Continua na lista só pelo tempo de exibição.' };
    if (alvo.perdida) return { cor: '#a8564a', t: 'Perdida pra outro jogador.', d: '' };
    if (p && p.propria) return { cor: '#8a7340', t: 'É sua aldeia.', d: 'Nada a noblar — tire da fila.' };
    if (det.voando) {
      return { cor: '#3f8f52', t: det.voando + ' nobre(s) a caminho.',
               d: 'Enquanto a lealdade prevista não zerar, ele segue recebendo. Nada travado aqui.' };
    }
    // Fila serial: o alvo nem chega a ser planejado, então nenhuma outra causa foi avaliada.
    if (p && p.estado === 'aguardando') {
      const frente = (config.noble.alvos || []).slice(0, Math.max(0, idx)).find((z) => !z.noblada && !z.perdida);
      return { cor: '#a07a42', t: 'Esperando a vez na fila.',
               d: 'O alvo ' + (frente ? esc(frente.coord) : 'da frente') + ' ainda não garantiu a queda, e a fila é serial: '
                  + 'os de trás não são nem planejados. Se este alvo usa nobres de OUTRA região, ligue '
                  + '"Planejar todos os alvos" em Produção — aí ele passa a ser avaliado.' };
    }
    if (!cand) return { cor: '#8a7340', t: 'Carregando o diagnóstico…', d: '' };
    // `cand` traz duas coisas diferentes: quem TEM nobre agora e quem só tem ACADEMIA (podia
    // formar). O veredito de envio só olha a primeira — academia não ataca. A segunda entra como
    // a saída sugerida, que é a pergunta seguinte: "e daí, o que eu faço?".
    const comNobre = cand.filter((c) => c.nobres > 0);
    const acadDentro = cand.filter((c) => c.acad > 0 && c.dentro && !c.nobres);
    const dicaAcad = acadDentro.length
      ? ' Dentro do limite há ' + acadDentro.length + ' aldeia(s) com Academia (mais perto: '
        + esc(acadDentro[0].nome) + ', ' + fmtDur(Math.round(acadDentro[0].horas * 3600))
        + ') — formar nobre lá resolve.'
      : ' Nenhuma aldeia com Academia dentro do limite: construa uma mais perto, ou aumente o limite de horas.';
    if (!comNobre.length) {
      return { cor: '#a8564a', t: 'Nenhuma aldeia sua tem nobre disponível.',
               d: 'Sem nobre parado não há o que mandar. Ligue "Formar nobre quando faltar" (ou cunhe) pra o módulo produzir.' + dicaAcad };
    }
    const dentro = comNobre.filter((c) => c.dentro);
    if (!dentro.length) {
      const maisPerto = comNobre[0];
      return { cor: '#a8564a', t: 'Os nobres existem, mas estão longe demais.',
               d: 'A aldeia mais próxima com nobre disponível é ' + esc(maisPerto.nome) + ', a '
                  + fmtDur(Math.round(maisPerto.horas * 3600)) + ' de viagem — acima do limite do modelo. '
                  + 'Aumente o limite de horas ou forme nobre numa aldeia mais perto.' + dicaAcad };
    }
    const comEscolta = dentro.filter((c) => !c.faltaEsc.length);
    if (!comEscolta.length) {
      const c = dentro[0];
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      return { cor: '#a8564a', t: 'Tem nobre no alcance, mas falta escolta.',
               d: esc(c.nome) + ' alcança em ' + fmtDur(Math.round(c.horas * 3600)) + ', mas não fecha a composição do modelo: '
                  + c.faltaEsc.map((f) => (rot[f.u] || f.u) + ' ' + f.pede + ' pedidos / ' + f.tem + ' tem').join(', ')
                  + '. Reduza a escolta do modelo ou recrute nessa aldeia.' };
    }
    if (p && p.pronto) return { cor: '#3f8f52', t: 'Pronto pra enviar.', d: 'Use "Enviar agora" ou espere o próximo ciclo.' };
    return { cor: '#a07a42', t: p && p.motivo ? esc(p.motivo) : 'Sem impedimento óbvio.',
             d: comEscolta.reduce((s, c) => s + c.nobres, 0) + ' nobre(s) em ' + comEscolta.length
                + ' aldeia(s) alcançam e fecham a escolta. Se ainda assim não sai, veja o log do módulo.' };
  }
  // ===== Nobres parados: quais aldeias têm nobre que não vai sair =====
  // O card já dizia "N nobres parados", mas número sem endereço não dá pra agir: o que se quer
  // saber é QUAL aldeia e POR QUE aquele nobre não decola. É o mesmo conjunto de causas do
  // diagnóstico por alvo, só que olhado do outro lado — da ORIGEM, não do destino. Aqui a
  // pergunta não é "por que este alvo não anda", e sim "por que este nobre está encostado".
  //
  // Nobre comprometido no plano do ciclo NÃO conta como parado: ele tem destino, só não decolou
  // ainda. Sem esse desconto a tela acusaria de ocioso justamente o nobre que vai sair agora.
  async function nobleOciosos() {
    const [todas, snob, vel] = await Promise.all([
      getAllVillagesCached(), nobleSnobPorAldeia(true), nobleVelNobre(),
    ]);
    const alvos = (config.noble.alvos || []).filter((a) => !a.noblada && !a.perdida);
    const plano = config.noble.plano || [];
    const estadoDe = {};
    plano.forEach((p) => { estadoDe[p.coord] = p.estado; });
    const comprometidos = {};
    plano.forEach((p) => (p.envios || []).forEach((e) => {
      const k = String(e.vid);
      comprometidos[k] = (comprometidos[k] || 0) + (e.qtd || 1);
    }));
    // Cada alvo carrega o SEU modelo (limite de horas e escolta podem diferir por alvo), então o
    // alcance é avaliado par a par, não contra um limite global.
    const alvosPrep = alvos.map((a) => {
      const tp = nobleTplsDe(a)[0];
      const t = (tp && tp.t) || {};
      return { a: a, esc: t.escolta || {}, lim: (t.maxHoras != null) ? t.maxHoras : null };
    });
    const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
    const out = [];
    (todas || []).forEach((v) => {
      const m = (v.coord || '').match(/(\d+)\|(\d+)/); if (!m) return;
      const tropa = snob[String(v.vid)] || {};
      const livres = Math.max(0, (tropa.snob || 0) - (comprometidos[String(v.vid)] || 0));
      if (!livres) return;                                    // sem nobre sobrando: nada a relatar
      const dist = alvosPrep.map((p) => {
        const h = (fieldDist(+m[1], +m[2], p.a.x, p.a.y) * vel) / 60;
        return { p: p, horas: h, dentro: (p.lim == null) || (h <= p.lim) };
      }).sort((a, b) => a.horas - b.horas);
      const item = { vid: v.vid, nome: v.name || v.coord, coord: v.coord, nobres: livres };
      if (!dist.length) {
        item.cor = '#8a7340'; item.motivo = 'sem alvo na fila';
        item.det = 'A fila de alvos está vazia — não há pra onde mandar.';
        out.push(item); return;
      }
      const dentro = dist.filter((d) => d.dentro);
      if (!dentro.length) {
        const p0 = dist[0];
        item.cor = '#a8564a'; item.motivo = 'nenhum alvo no alcance';
        item.det = 'O alvo mais perto é ' + esc(p0.p.a.coord) + ', a ' + fmtDur(Math.round(p0.horas * 3600))
          + (p0.p.lim != null ? ' — o modelo dele para em ' + p0.p.lim + ' h' : '') + '.';
        out.push(item); return;
      }
      // Alcança alguém. Então ou falta escolta, ou o alvo já está resolvido, ou é a fila segurando.
      const comEsc = dentro.filter((d) => Object.keys(d.p.esc).every((u) => (tropa[u] || 0) >= (+d.p.esc[u] || 0)));
      if (!comEsc.length) {
        const d0 = dentro[0];
        const falta = Object.keys(d0.p.esc).filter((u) => (tropa[u] || 0) < (+d0.p.esc[u] || 0))
          .map((u) => (rot[u] || u) + ' ' + (tropa[u] || 0) + '/' + d0.p.esc[u]);
        item.cor = '#a8564a'; item.motivo = 'falta escolta';
        item.det = 'Alcança ' + esc(d0.p.a.coord) + ' em ' + fmtDur(Math.round(d0.horas * 3600))
          + ', mas não fecha a composição: ' + falta.join(', ') + '.';
        out.push(item); return;
      }
      // Alvo com nobre já a caminho o bastante não precisa deste — é reserva, não desperdício.
      const abertos = comEsc.filter((d) => {
        const e = estadoDe[d.p.a.coord];
        return e !== 'enviados' && e !== 'garantida' && e !== 'noblada';
      });
      if (!abertos.length) {
        const d0 = comEsc[0];
        item.cor = '#3f8f52'; item.motivo = 'reserva';
        item.det = 'Os alvos no alcance (o mais perto é ' + esc(d0.p.a.coord)
          + ') já têm nobre suficiente a caminho. Este fica de reserva.';
        out.push(item); return;
      }
      const d0 = abertos[0];
      const est = estadoDe[d0.p.a.coord];
      if (est === 'aguardando') {
        item.cor = '#a07a42'; item.motivo = 'preso pela fila serial';
        item.det = 'Alcança ' + esc(d0.p.a.coord) + ' em ' + fmtDur(Math.round(d0.horas * 3600))
          + ' e tem a escolta, mas esse alvo espera a vez. Ligue "Planejar todos os alvos" pra este nobre sair.';
      } else {
        item.cor = '#a07a42'; item.motivo = 'deve sair no próximo ciclo';
        item.det = 'Alcança ' + esc(d0.p.a.coord) + ' em ' + fmtDur(Math.round(d0.horas * 3600))
          + ' e fecha a escolta. Se não sair, o teto de comandos por ciclo pode estar cheio.';
      }
      out.push(item);
    });
    out.sort((a, b) => b.nobres - a.nobres);
    return out;
  }
  // Estado de tela da lista de ociosos (não vai pro config: é uma leitura, não uma configuração).
  let _nbOcio = null, _nbOcioAt = 0, _nbOcioErr = null, _nbOcioCarregando = false;
  function renderNobleOciosos() {
    const box = document.getElementById('twmgr-nb-ocio'); if (!box) return;
    if (_nbOcioCarregando) { box.innerHTML = '<span class="twmgr-lbl">lendo as aldeias…</span>'; return; }
    if (_nbOcioErr) { box.innerHTML = '<span style="color:#b03030;font-size:10px">' + esc(_nbOcioErr) + '</span>'; return; }
    if (!_nbOcio) {
      box.innerHTML = '<span class="twmgr-lbl">Ainda não conferido nesta sessão — abre sozinho ao entrar na aba.</span>';
      return;
    }
    if (!_nbOcio.length) {
      box.innerHTML = '<span style="color:#3f8f52;font-size:10px">Nenhum nobre parado — todos estão a caminho ou já comprometidos no plano.</span>';
      return;
    }
    const total = _nbOcio.reduce((s, o) => s + o.nobres, 0);
    box.innerHTML = '<table style="width:100%;font-size:10px;border-collapse:collapse">' +
      '<tr style="color:#8a7340"><td>aldeia</td><td style="width:42px">nobres</td><td style="width:130px">motivo</td><td>detalhe</td></tr>' +
      _nbOcio.map((o) => '<tr style="border-top:1px solid #efe7d8">' +
        '<td style="padding:2px 0"><a href="/game.php?village=' + esc(String(o.vid)) + '&screen=snob" target="_blank" style="color:#5c4423">' +
          esc(o.nome) + '</a> <span style="color:#8a7340">' + esc(o.coord) + '</span></td>' +
        '<td><b style="color:#8b5426">' + o.nobres + '</b></td>' +
        '<td style="color:' + o.cor + '">' + esc(o.motivo) + '</td>' +
        '<td style="color:#6f6153">' + o.det + '</td></tr>').join('') +
      '</table>' +
      '<div style="color:#8a7340;font-size:9px;margin-top:3px"><b>' + total + ' nobre(s)</b> parados em '
        + _nbOcio.length + ' aldeia(s). Lido às ' + new Date(_nbOcioAt).toLocaleTimeString('pt-BR')
        + '. O nome da aldeia leva direto à Academia dela.</div>';
  }
  async function nobleConferirOciosos() {
    if (_nbOcioCarregando) return;                  // dois cliques seguidos não viram dois fetches
    _nbOcioCarregando = true; _nbOcioErr = null; renderNobleOciosos();
    try {
      _nbOcio = await nobleOciosos();
      _nbOcioAt = Date.now();
    } catch (e) {
      _nbOcioErr = 'não deu pra ler: ' + (e.message || e);
    }
    _nbOcioCarregando = false;
    renderNobleOciosos();
  }
  // Conferência automática. O prazo é generoso de propósito: o que muda essa tabela é nobre
  // ficando pronto (2h37 na Academia), nobre decolando ou escolta sendo recrutada — nada disso
  // acontece de minuto em minuto, e cada leitura é uma requisição. Dispara em dois momentos, os
  // dois "de graça": no fim do ciclo do módulo e ao abrir a aba. Botão manual atropela o prazo.
  const NB_OCIO_TTL = 30 * 60 * 1000;
  function nobleOciososAuto() {
    if (_nbOcioCarregando) return;
    if (_nbOcio && (Date.now() - _nbOcioAt) < NB_OCIO_TTL) { renderNobleOciosos(); return; }
    nobleConferirOciosos();
  }
  // Qual alvo está com a caixa "quem vai noblar" aberta (um por vez — abrir vários empurraria a
  // fila pra fora da tela). Só de tela, não vai pro config.
  let _nbQuemAberto = null, _nbCand = null, _nbCandCoord = null;
  // A caixa em si. Junta as duas metades da resposta, que vêm de fontes diferentes:
  //   - JÁ INDO  -> do jogo (nobleComandosNoJogo), com a origem lida da 2ª coluna
  //   - VAI SAIR -> do plano do ciclo (p.envios), que é o que o módulo escolheu mandar
  // Alvo esperando a vez não tem plano calculado ainda, e a caixa diz isso em vez de mentir
  // "ninguém" — o planejamento dele só roda quando ele destrava.
  function nobleLinhaQuem(a, p) {
    const voos = nobleVoos(a.coord).filter((e) => e.doJogo);
    const envios = (p && p.envios) || [];
    const linha = (ico, txt, extra) => '<div style="display:flex;gap:6px;padding:1px 0">' +
      '<span style="flex:0 0 14px">' + ico + '</span><span style="flex:1">' + txt + '</span>' +
      '<span style="color:#8a7340">' + (extra || '') + '</span></div>';
    let html = '';
    if (voos.length) {
      html += '<div style="color:#3f8f52;font-weight:700;margin-bottom:2px">Já a caminho</div>' +
        voos.map((e) => linha('⚔', esc(e.origemNome || e.origem || 'origem desconhecida') +
          (e.origem && e.origemNome ? ' <span style="color:#8a7340">' + esc(e.origem) + '</span>' : ''),
          e.chega ? 'chega ' + new Date(e.chega).toLocaleTimeString('pt-BR') : '')).join('');
    }
    if (envios.length) {
      html += '<div style="color:#8b5426;font-weight:700;margin:4px 0 2px">Vai sair neste ciclo</div>' +
        envios.map((e) => linha('👑', esc(e.nome || e.coord || e.vid) +
          (e.coord ? ' <span style="color:#8a7340">' + esc(e.coord) + '</span>' : ''),
          (e.d != null ? e.d.toFixed(1) + ' campos · ' : '') + (e.durSec ? fmtDur(e.durSec) : ''))).join('');
    }
    if (!html) {
      const estado = (p && p.estado) || 'aguardando';
      html = '<span style="color:#8a7340">' + (estado === 'aguardando'
        ? '— esperando a vez na fila; as origens só são escolhidas quando ele destrava —'
        : '— nenhum nobre indo nem planejado —') + '</span>';
    }
    const d = nobleEmVooDetalhe(a.coord);
    if (d.pousados) {
      // Antes isto era só uma contagem — "1 nobre pousou" sem dizer quando nem de onde, o que
      // não dá pra conferir contra nada. Agora lista cada um com a hora de chegada.
      const jaPousou = nobleVoos(a.coord).filter((e) => !e.doJogo);
      html += '<div style="color:#a07a42;margin-top:5px">' +
        '<div style="font-weight:700">Já pousou, sem relatório ainda (' + d.pousados + ')</div>' +
        jaPousou.map((e) => {
          const q = e.chega || e.at;
          const hMs = Date.now() - q;
          return '<div style="padding:1px 0">• ' + (e.origemNome ? esc(e.origemNome) + ' — ' : '') +
            'chegou ' + new Date(q).toLocaleString('pt-BR') +
            (hMs > 0 ? ' <span style="color:#8a7340">(há ' + fmtDur(Math.round(hMs / 1000)) + ')</span>' : '') + '</div>';
        }).join('') +
        '<div style="color:#8a7340;margin-top:2px">Foi este módulo que enviou, e o comando já sumiu da ficha do alvo — ' +
        'então bateu. Conta como cobertura até um relatório de nobre confirmar a lealdade que sobrou. ' +
        'Se o relatório não chegar, ligue "Ler relatórios" em Alvos.</div></div>';
    }
    // Quem PODERIA ir. Sem isto, alvo em "Aguardando" mostrava caixa vazia e não explicava nada.
    html += '<div style="color:#8b5426;font-weight:700;margin:6px 0 2px">Aldeias suas que podem noblar este alvo' +
      ' <span style="color:#8a7340;font-weight:400">(nobre pronto ou Academia pra formar)</span></div>';
    if (_nbCandCoord !== a.coord) html += '<span style="color:#8a7340">— carregando… —</span>';
    else if (!_nbCand || !_nbCand.length) html += '<span style="color:#a8564a">— nenhuma aldeia sua tem nobre nem Academia —</span>';
    else {
      const usados = {};
      envios.forEach((e) => { usados[String(e.vid)] = 1; });
      const tpl0 = nobleTplsDe(a)[0];
      const tplH = (tpl0 && tpl0.t && tpl0.t.maxHoras != null) ? tpl0.t.maxHoras : null;
      // Ordenado por TEMPO, não por distância — é o tempo que decide se cabe no limite.
      const dentro = _nbCand.filter((c) => c.dentro), fora = _nbCand.filter((c) => !c.dentro);
      const acadLivre = _nbCand.filter((c) => c.dentro && c.acad > 0 && !c.nobres);
      html += '<table style="width:100%;font-size:10px;border-collapse:collapse">' +
        '<tr style="color:#8a7340"><td>aldeia</td><td style="width:74px">viagem</td><td style="width:52px">dist.</td><td style="width:44px" title="nobre pronto agora">nobres</td><td style="width:52px" title="nível da Academia: pode formar nobre">acad.</td><td style="width:82px"></td></tr>' +
        _nbCand.slice(0, 12).map((c) => '<tr' + (c.dentro ? '' : ' style="opacity:.5"') + '>' +
          '<td>' + esc(c.nome) + ' <span style="color:#8a7340">' + esc(c.coord) + '</span></td>' +
          '<td><b style="color:' + (c.dentro ? '#3f8f52' : '#a8564a') + '">' + fmtDur(Math.round(c.horas * 3600)) + '</b></td>' +
          '<td style="color:#8a7340">' + c.d.toFixed(1) + '</td>' +
          '<td>' + (c.nobres ? '<b style="color:#3f8f52">' + c.nobres + '</b>' : '<span style="color:#8a7340">—</span>') + '</td>' +
          '<td>' + (c.acad ? '<span style="color:#8b5426">nv ' + c.acad + '</span>' : '<span style="color:#8a7340">—</span>') + '</td>' +
          '<td style="color:#8b5426">' + (usados[String(c.vid)] ? 'vai mandar'
            : !c.dentro ? '<span style="color:#a8564a">fora do limite</span>'
            // Sem nobre em casa, "sem escolta" seria conversa fiada: o que falta é o nobre.
            : !c.nobres ? '<span style="color:#8b5426" title="tem Academia no alcance — pode formar nobre pra este alvo">pode formar</span>'
            : c.faltaEsc.length ? '<span style="color:#a8564a" title="' + esc(c.faltaEsc.map((f) => f.u + ' ' + f.pede + '/' + f.tem).join(', ')) + '">sem escolta</span>'
            : '') + '</td></tr>').join('') +
        '</table>' +
        (_nbCand.length > 12 ? '<div style="color:#8a7340">…e mais ' + (_nbCand.length - 12) + ' aldeia(s)</div>' : '') +
        '<div style="color:#8a7340;margin-top:3px">' +
          '<b style="color:' + (dentro.length ? '#3f8f52' : '#a8564a') + '">' + dentro.reduce((s, c) => s + c.nobres, 0) +
          ' nobre(s) dentro do limite</b>' + (tplH != null ? ' de ' + tplH + ' h' : '') +
          (fora.length ? ' · ' + fora.reduce((s, c) => s + c.nobres, 0) + ' fora (aldeia longe demais)' : '') +
          (acadLivre.length ? ' · <b style="color:#8b5426">' + acadLivre.length
            + ' com Academia no alcance</b> (podem formar nobre pra este alvo)' : '') +
          '. Viagem calculada pela velocidade do nobre neste mundo.</div>';
    }
    // Veredito no TOPO: é a pergunta que se faz ao abrir a caixa. O resto vira a evidência dele.
    const dg = nobleDiagnostico(a, p, (_nbCandCoord === a.coord) ? _nbCand : null);
    const cab = '<div style="border-left:3px solid ' + dg.cor + ';padding:3px 0 3px 7px;margin-bottom:6px">' +
      '<div style="color:' + dg.cor + ';font-weight:700">' + dg.t + '</div>' +
      (dg.d ? '<div style="color:#6f6153;line-height:1.45">' + dg.d + '</div>' : '') + '</div>';
    return '<tr><td colspan="8" style="background:#fbf7ee;border-top:none;font-size:10px;padding:6px 10px">' +
      '<div style="color:#6f6153;margin-bottom:3px">Situação de <b>' + esc(a.coord) + '</b></div>' + cab + html + '</td></tr>';
  }
  // Texto honesto pro estado da fila: separa o que voa do que já pousou.
  function nobleTxtVoo(coord) {
    const d = nobleEmVooDetalhe(coord);
    const p = [];
    if (d.voando) p.push(d.voando + ' a caminho');
    if (d.pousados) p.push(d.pousados + ' pousado(s), sem relatório');
    return p.join(' + ') || '0 a caminho';
  }
  // "Pousado" era definido só por `doJogo`: entrada que a ficha do alvo não lista, pousou. Só que
  // o nobre que ACABOU DE SAIR também não está lá — ele é uma entrada local (`doJogo` falso) e a
  // ficha do alvo só é relida no ciclo seguinte. Resultado: os 2 nobres que a Pandora despachou
  // agora apareciam como "2 pousados" antes mesmo de decolar.
  //
  // A hora de chegada decide primeiro, e ela existe nos dois casos (nobleRegistraEnvio grava
  // `chega` no envio). Só depois de a chegada passar é que a ausência na ficha vira prova de que
  // pousou — antes disso é só o jogo ainda não ter sido consultado.
  function nobleEmVooDetalhe(coord) {
    const lista = nobleVoos(coord);
    const agora = Date.now();
    let voando = 0, pousados = 0;
    lista.forEach((e) => {
      const n = e.n || 1;
      if ((e.chega || 0) > agora) voando += n;   // ainda não chegou: está no ar, venha de onde vier
      else if (e.doJogo) voando += n;            // já devia ter chegado, mas o jogo ainda lista
      else pousados += n;
    });
    return { voando: voando, pousados: pousados, total: voando + pousados };
  }
  // ===== O que o JOGO diz que está a caminho =====
  // O `emVoo` é um caderno PARTICULAR: só sabe do que este navegador, com esta config, mandou.
  // Comando disparado na mão, de outra sessão, ou antes do módulo existir era invisível — e aí o
  // alvo aparecia com menos ataque do que realmente tem, a exigência ficava inflada e a fila dava
  // por "coberto" cedo demais. Caso real (br141, ago/2026): 4 nobres a caminho de 853|450 no
  // jogo, 1 no registro.
  //
  // Uma requisição por ciclo, pra conta inteira. Conta só comando COM NOBRE — o jogo marca a
  // linha de dois jeitos (ícone snob.webp e `data-icon-hint="Com nobre"`); qualquer um serve, e
  // aceitar os dois sobrevive a uma troca de tema.
  //
  // A PRIMEIRA coordenada da linha é o DESTINO ("Ataque a Aldeia de bárbaros (853|450) K48"); a
  // segunda coluna é a origem. Por isso lê a primeira célula, não a linha inteira.
  // ---- Fonte melhor: a FICHA DO ALVO (info_village) ----
  // A tela global de comandos tem três defeitos que só somem trocando de fonte:
  //   1. é a conta inteira (medido: 680 linhas) pra extrair 1 informação por alvo;
  //   2. mistura retorno com ida, e o filtro por hint casava "Com nobre (retornando)";
  //   3. — o pior — ela não sabe dizer o que JÁ POUSOU. O jogo simplesmente para de listar.
  //      Por isso existia o caderno local, que guardava o pousado por até 48h esperando um
  //      relatório de nobre pra podar. Sem relatório, a entrada envelhecia contando como
  //      cobertura: alvo sem NENHUM nobre indo aparecia com "2 a caminho" (caso real medido).
  //
  // A ficha do alvo resolve os três de uma vez: 85 KB / ~350 ms, lista só o que vai PRA ELE,
  // separa ida de volta por data-command-type, e traz a ORIGEM na 1ª coluna. Como ela é a
  // verdade do instante, o que não está lá não está voando — não há o que envelhecer.
  // O village.txt já traz vid, nome e pontos — a mesma leitura serve pro link e pra ficha.
  let _nbVidPorCoord = null;
  async function nobleMapaCarregar() {
    if (_nbVidPorCoord) return _nbVidPorCoord;
    const arr = await getMapVillages(false);
    _nbVidPorCoord = {};
    (arr || []).forEach((v) => { _nbVidPorCoord[v.x + '|' + v.y] = v; });
    return _nbVidPorCoord;
  }
  async function nobleVidDoAlvo(coord) {
    const m = await nobleMapaCarregar();
    return (m[coord] || {}).vid || null;
  }
  // Versão SÍNCRONA pro render (o mapa já foi carregado pelo ciclo; se ainda não, devolve null
  // e a célula cai no texto simples em vez de segurar o desenho da tabela).
  function nobleInfoAlvo(coord) { return _nbVidPorCoord ? (_nbVidPorCoord[coord] || null) : null; }
  async function nobleComandosDoAlvo(coord) {
    const vid = await nobleVidDoAlvo(coord);
    if (!vid) return null;
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=info_village&id=' + vid, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const cont = doc.querySelector('#commands_outgoings[data-type="towards_village"]');
    if (!cont) return [];
    const agora = Date.now();
    const out = [];
    cont.querySelectorAll('tr').forEach((tr) => {
      const tds = tr.querySelectorAll('td'); if (!tds.length) return;
      const tipos = tr.querySelectorAll('[data-command-type]');
      let ehRetorno = false;
      for (let i = 0; i < tipos.length; i++) if ((tipos[i].getAttribute('data-command-type') || '') === 'return') ehRetorno = true;
      const temNobre = tr.querySelector('img[src*="/snob"]') ||
        Array.prototype.some.call(tr.querySelectorAll('[data-icon-hint]'), (e) => {
          const h = e.getAttribute('data-icon-hint') || '';
          return /obre/i.test(h) && !/retorn/i.test(h);
        });
      if (ehRetorno || !temNobre) return;
      let chega = 0;
      for (const td of tds) {
        if (/\d{1,2}:\d{2}:\d{2}/.test(td.textContent || '')) { chega = desviarParseArriveAt(td.textContent); break; }
      }
      // Na ficha do alvo a 1ª coluna é a ORIGEM (o destino é a própria aldeia da ficha).
      const oTxt = ((tds[0] && tds[0].textContent) || '').replace(/\s+/g, ' ').trim();
      const om = oTxt.match(/\((\d{1,3})\|(\d{1,3})\)/);
      out.push({ at: agora, chega: chega || (agora + 3600000), n: 1, doJogo: 1,
                 origem: om ? (om[1] + '|' + om[2]) : null, origemNome: oTxt.split('(')[0].trim() || oTxt || null });
    });
    return out;
  }
  async function nobleComandosNoJogo() {
    const res = await fetch('/game.php?village=' + CUR_VID
      + '&screen=overview_villages&mode=commands&type=outgoing&page=-1', { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const out = {};
    const agora = Date.now();
    doc.querySelectorAll('#commands_table tr, tr.command-row').forEach((tr) => {
      // RETORNO não está a caminho do alvo — já bateu e está voltando pra casa. O jogo lista os
      // dois na mesma tela, e o filtro por hint casava "Com nobre (retornando)" (medido na conta
      // real: 3 das 4 linhas que casavam eram retorno). Daí alvo sem nenhum nobre indo aparecer
      // como "coberto: N a caminho" — e a linha ainda dizer "Nobres retornando" ao lado.
      // O img[src*="/snob"] já escapava sozinho, porque o arquivo do retorno é "return_snob.webp"
      // e não tem a barra antes de "snob"; quem deixava passar era só o hint.
      const tipos = tr.querySelectorAll('[data-command-type]');
      for (let i = 0; i < tipos.length; i++) {
        if ((tipos[i].getAttribute('data-command-type') || '') === 'return') return;
      }
      const temNobre = tr.querySelector('img[src*="/snob"]') ||
        Array.prototype.some.call(tr.querySelectorAll('[data-icon-hint]'), (e) => {
          const h = e.getAttribute('data-icon-hint') || '';
          return /obre/i.test(h) && !/retorn/i.test(h);
        });
      if (!temNobre) return;
      const tds = tr.querySelectorAll('td');
      if (!tds.length) return;
      const m = (tds[0].textContent || '').match(/\((\d{1,3})\|(\d{1,3})\)/);
      if (!m) return;
      let chega = 0;
      for (const td of tds) {
        if (/\d{1,2}:\d{2}:\d{2}/.test(td.textContent || '')) { chega = desviarParseArriveAt(td.textContent); break; }
      }
      const coord = m[1] + '|' + m[2];
      // 2ª coluna é a ORIGEM ("Zidane (476|563) K54"). Sem ela dá pra saber que há nobre indo,
      // mas não DE ONDE — que é o que se quer saber ao olhar a fila.
      const oTxt = ((tds[1] && tds[1].textContent) || '').replace(/\s+/g, ' ').trim();
      const om = oTxt.match(/\((\d{1,3})\|(\d{1,3})\)/);
      (out[coord] = out[coord] || []).push({ at: agora, chega: chega || (agora + 3600000), n: 1, doJogo: 1,
        origem: om ? (om[1] + '|' + om[2]) : null, origemNome: oTxt.split('(')[0].trim() || null });
    });
    return out;
  }

  // Reconcilia o caderno com a realidade. NÃO é substituição pura: são dois conjuntos disjuntos.
  //
  //   - ainda VOANDO  -> vem do jogo. É autoritativo e enxerga envio manual.
  //   - já POUSOU     -> vem do caderno local. O jogo tira o comando da lista assim que ele
  //                      chega, e entre pousar e o relatório ser lido existe uma janela em que a
  //                      lealdade ainda é a antiga. Se eu apagasse aqui, o nobre que acabou de
  //                      bater seria contado duas vezes e sairia um a mais.
  //
  // Quem tira os pousados é a poda do `nobleVoos`, quando aparecer relatório de nobre mais novo
  // que a chegada deles.
  function nobleSincronizaEmVoo(doJogo) {
    const agora = Date.now();
    config.noble.emVoo = config.noble.emVoo || {};
    (config.noble.alvos || []).forEach((a) => {
      const voando = doJogo[a.coord] || [];
      const pousados = (config.noble.emVoo[a.coord] || []).filter((e) => (e.chega || e.at) <= agora);
      const junto = voando.concat(pousados);
      if (junto.length) config.noble.emVoo[a.coord] = junto; else delete config.noble.emVoo[a.coord];
    });
  }

  // Guarda tambem a ORIGEM: sem ela o aviso de "ja pousou" vira uma contagem seca,
  // impossivel de conferir contra a tela do jogo.
  function nobleRegistraEnvio(coord, n, durSec, origemNome) {
    if (!config.noble.emVoo[coord]) config.noble.emVoo[coord] = [];
    config.noble.emVoo[coord].push({ at: Date.now(), chega: Date.now() + (durSec || 0) * 1000, n: n, origemNome: origemNome || null });
  }

  // ===== Lealdade prevista =====
  // A lealdade REGENERA ENTRE as chegadas. Somar todos os ataques de uma vez e so depois somar a
  // regeneracao daria um numero errado pro lado otimista: tres nobres que chegam em levas
  // separadas derrubam MENOS, no liquido, do que tres que chegam juntos. Entao aqui a linha do
  // tempo e simulada de verdade -- ordena as chegadas, regenera ate cada uma, desconta, segue.
  //
  // `ateMs` e o instante que interessa: agora, ou a chegada do nobre que eu mandaria neste ciclo.
  // Devolve null quando nunca houve relatorio com lealdade (so ataque com nobre traz o campo).
  // SEM RELATÓRIO, ASSUME 100. É a premissa que o módulo já declara na tela — os alvos estão
  // vazios, e aldeia que nunca foi noblada está em 100. Antes isto devolvia `null`, e o motor
  // caía num caminho paralelo que usava o `nobres` do modelo. Dois caminhos de decisão pro mesmo
  // número, e o segundo não passava pela projeção: com o modelo em 1, um único nobre no ar já
  // fazia o alvo virar "coberto" e travava ali até um relatório chegar — que era o caso real do
  // 434|577 e do 434|592.
  //
  // Assumir 100 AQUI, e não lá, é o que importa: entrando como leitura inicial, o valor passa
  // pela mesma projeção de sempre (ordena as chegadas, desconta 25 de cada, regenera entre elas),
  // então o desconto do que já está voando continua valendo. Alvo virgem com 1 nobre no ar pede
  // 3, não 4.
  function nobleLealdadeEm(coord, ateMs) {
    const r = (config.noble.relatorios || {})[coord];
    const lido = !!(r && r.lealdade != null && nobleLealdadeAt(r));
    const t0 = lido ? nobleLealdadeAt(r) : Date.now();
    const regen = config.noble.lealdadeRegen || 0;
    const queda = config.noble.lealdadePorAtk || 25;
    const fim = ateMs || Date.now();
    const chegadas = nobleVoos(coord)
      .map((e) => ({ at: e.chega || e.at, n: e.n || 1 }))
      .filter((e) => e.at <= fim)
      .sort((a, b) => a.at - b.at);
    let t = t0, v = lido ? r.lealdade : 100;
    for (const e of chegadas) {
      v = Math.min(100, v + Math.max(0, (e.at - t) / 3600000) * regen);
      v -= e.n * queda;
      t = e.at;
      if (v <= 0) return v;      // caiu aqui: dali pra frente a aldeia e minha, nao ha mais regen
    }
    return Math.min(100, v + Math.max(0, (fim - t) / 3600000) * regen);
  }

  // O numero que o motor usa pra decidir: a lealdade no instante em que o nobre que eu mandaria
  // AGORA chegaria la. E por isso que a distancia importa -- nobre de 4h devolve 4 de lealdade
  // ao alvo antes de bater.
  //
  // `durSec` vem do proprio jogo, medido no ciclo anterior e guardado em `alvo.ultDur`. Sem ele
  // (primeiro ciclo do alvo), projeta so ate a ultima chegada ja marcada: e o mais longe que da
  // pra afirmar sem chutar distancia. A partir do 2o ciclo a conta fica completa.
  function nobleLealdadePrevista(coord, durSec) {
    if (durSec != null) return nobleLealdadeEm(coord, Date.now() + durSec * 1000);
    const chegadas = nobleVoos(coord).map((e) => e.chega || e.at);
    return nobleLealdadeEm(coord, chegadas.length ? Math.max.apply(null, chegadas) : Date.now());
  }

  // Quantos comandos ainda faltam. Sai SEMPRE da lealdade PREVISTA -- nao de "atual menos o que
  // voa", porque subtrair os voos no fim ignorava a regeneracao ENTRE as chegadas e mandava de
  // menos. Como `nobleLealdadeEm` agora assume 100 quando nao ha relatorio, o caminho e um so:
  // alvo virgem da ceil(100/25) = 4 pela mesma formula, em vez de sair de um numero avulso.
  //
  // O `nobres` do modelo virou TETO, nao meta. Serve pra voce limitar o gasto num alvo especifico
  // ("nao quero mais que 2 nobres nessa"); nunca faz mandar MAIS do que a lealdade pede.
  function noblePrecisaDe(alvo, tpl, durSec) {
    const prev = nobleLealdadePrevista(alvo.coord, durSec != null ? durSec : alvo.ultDur);
    const voando = nobleEmVoo(alvo.coord);
    const calc = (prev == null) ? 0 : Math.max(0, Math.ceil(prev / (config.noble.lealdadePorAtk || 25)));
    const teto = Math.max(1, tpl.nobres || NOBLE_POR_CONQUISTA);
    const base = Math.min(calc, Math.max(0, teto - voando));
    return { precisa: base, lealdade: nobleLealdadeAgora(alvo.coord), prevista: prev,
             voando: voando, bruto: calc };
  }

  // ===== Estado do alvo =====
  // O estado e SEMPRE de quem ja entrou no processo de noblagem. Quem espera a vez na fila fica
  // em "aguardando" e ponto -- dizer "sem nobres" pra um alvo que nem foi tentado e ruido, e
  // pior: parece defeito quando e so a fila funcionando.
  const NB_ESTADOS = {
    aguardando:  { t: 'Aguardando',        c: '#8a7340' },
    'sem-nobres': { t: 'Sem nobres',       c: '#b03030' },
    recrutando:  { t: 'Recrutando nobres', c: '#b5651d' },
    enviados:    { t: 'Nobres enviados',   c: '#3f8f52' },
    retornando:  { t: 'Nobres retornando', c: '#a07a42' },
    garantida:   { t: 'Queda garantida',   c: '#3f8f52' },
    noblada:     { t: 'Noblada',           c: '#3f8f52' },
    perdida:     { t: 'Perdida',           c: '#b03030' },
    propria:     { t: 'É sua aldeia',      c: '#b03030' },
  };
  // "Enviados" enquanto ha comando no ar; "retornando" quando todos ja pousaram e a aldeia nao
  // caiu -- os nobres que sobreviveram estao voltando pra casa.
  //
  // "Queda garantida" e a janela curta entre a lealdade chegar a zero e a aldeia aparecer na
  // minha lista. Sem esse estado ela cairia em "sem nobres", que seria mentira: nao falta nobre,
  // falta o jogo registrar a conquista.
  function nobleEstadoDe(coord, vindo, garantida) {
    const agora = Date.now();
    const voos = nobleVoos(coord);
    const noAr = voos.filter((e) => (e.chega || e.at) > agora).length;
    if (noAr > 0) return 'enviados';
    if (voos.length > 0) return 'retornando';
    if (garantida) return 'garantida';
    if (vindo > 0) return 'recrutando';
    return 'sem-nobres';
  }

  // ===== Pós-conquista =====
  // Endpoint CONFIRMADO pelo dump do usuário (br143, ago/2026). Note o `type=static`: grupo
  // dinâmico é montado por regra e não aceita aldeia na mão — mandar pra lá falharia calado.
  // Preenche o select de grupos. Reusa o getGroups() do Recrutar (que já sabe que o
  // `ajax=load_group_menu` devolve false e parseia o overview). "todos" (id 0) fica de fora:
  // não é grupo de verdade, e mandar aldeia pra lá não faz nada.
  async function fillNobleGrupos() {
    const sel = document.getElementById('twmgr-nb-posgid'); if (!sel) return;
    let gs = [];
    try { gs = await getGroups(); } catch (e) { return; }
    const uteis = (gs || []).filter((g) => String(g.id) !== '0');
    _nbGrupos = uteis;
    sel.innerHTML = '<option value="">— escolha —</option>'
      + uteis.map((g) => '<option value="' + esc(String(g.id)) + '">' + esc(g.name || g.id) + '</option>').join('');
    if (config.noble.posGrupoId) sel.value = String(config.noble.posGrupoId);
    renderNoblePos();   // a tabela depende desta lista
    nobleRenderBandPadrao();
  }

  // Le o inventário de bandeiras da conta. Estrutura confirmada por dump:
  //   <div class="flag_box" style="background-image: url('.../flags/medium/<TIPO>_<NIVEL>.webp')"
  //        data-title="+12% na velocidade de recrutamento :: Realizações - hoje às ...">
  // O nome do arquivo É o par tipo_nível, que é exatamente o que o assign_flag pede.
  //
  // Não confundir com /flags/small/<N>.webp: aquele é só a estrelinha de NÍVEL ao lado, não o
  // ícone da bandeira — um dump anterior só trouxe esses e por isso o seletor não saiu antes.
  let _nbBandeiras = null;
  async function nobleLerBandeiras(forcar) {
    if (_nbBandeiras && !forcar) return _nbBandeiras;
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=flags', { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const out = [], visto = {};
    doc.querySelectorAll('.flag_box').forEach((el) => {
      const st = el.getAttribute('style') || '';
      const mi = st.match(/flags\/medium\/(\d+)_(\d+)\.\w+/);
      if (!mi) return;
      const chave = mi[1] + '_' + mi[2];
      if (visto[chave]) return;
      visto[chave] = 1;
      const mu = st.match(/url\((['\"]?)(.*?)\1\)/);
      // O data-title traz a origem depois de "::" ("... :: Realizações - hoje às 14:43").
      // Só o efeito interessa aqui.
      const dt = (el.getAttribute('data-title') || '').split('::')[0].trim();
      out.push({ tipo: mi[1], nivel: parseInt(mi[2], 10), img: mu ? mu[2] : '', desc: dt });
    });
    out.sort((a, b) => (a.tipo - b.tipo) || (a.nivel - b.nivel));
    _nbBandeiras = out;
    return out;
  }

  // O que aplicar quando ESTE alvo cair. A escolha do alvo manda; sem ela, herda o padrão
  // global. String vazia no alvo significa "nenhum" de propósito — diferente de indefinido,
  // que é "usa o padrão". Sem essa distinção não dá pra desligar um alvo isolado.
  function noblePosDoAlvo(coord) {
    const a = (config.noble.alvos || []).find((x) => x.coord === coord) || {};
    const gid = (a.posGrupoId != null) ? a.posGrupoId : (config.noble.posGrupoId || '');
    const bt = (a.posBandTipo != null) ? a.posBandTipo : (config.noble.posBandeiraTipo || '');
    const bn = (a.posBandNivel != null) ? a.posBandNivel : (config.noble.posBandeiraNivel || 1);
    return { gid: gid, bandTipo: bt, bandNivel: bn };
  }

  // Equipa bandeira. Chamada CONFIRMADA pelo dump do FlagsScreen.assignFlag:

  //   TribalWars.post("flags", {ajaxaction:"assign_flag"}, {flag_type, level, village_id}, cb)
  // O assignFlag do jogo e so um wrapper com dialogo de confirmacao em volta disso.
  //
  // Chama a funcao DO JOGO em vez de remontar a requisicao: ela ja resolve CSRF, formato do
  // corpo e o que o servidor espera de brinde. Remontar na mao seria adivinhar exatamente o
  // que evitei a sessao inteira -- e aqui nem precisa, porque a funcao esta na pagina.
  function nobleEquiparBandeira(vid, tipo, nivel) {
    return new Promise((resolve, reject) => {
      const TW = window.TribalWars;
      if (!TW || typeof TW.post !== 'function') {
        reject(new Error('TribalWars.post nao esta disponivel nesta pagina'));
        return;
      }
      let respondeu = false;
      try {
        TW.post('flags', { ajaxaction: 'assign_flag' },
          { flag_type: tipo, level: nivel, village_id: vid },
          (r) => { respondeu = true; resolve(r); },
          (e) => { respondeu = true; reject(new Error(String((e && e.error) || e || 'recusado'))); });
      } catch (e) { respondeu = true; reject(e); return; }
      // O post do jogo e por callback: sem isso, um erro que nao chame nenhum dos dois
      // deixaria a Promise pendurada e o ciclo travado.
      setTimeout(() => { if (!respondeu) reject(new Error('sem resposta em 15s')); }, 15000);
    });
  }

  async function nobleAddGrupo(vid, gid) {


    const body = new URLSearchParams();
    body.append('village_ids[]', String(vid));
    body.append('selected_group', String(gid));
    body.append('add_to_group', 'Adicionar');
    body.append('h', CSRF);
    const url = '/game.php?village=' + CUR_VID
      + '&screen=overview_villages&action=bulk_edit_villages&mode=groups&type=static&partial';
    const res = await fetch(url, { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return true;
  }

  // Grava a conquista num histórico próprio. Chamado no INSTANTE em que a aldeia aparece na
  // minha lista — que é o único momento em que ainda dá pra saber o que ela custou (os voos são
  // apagados logo em seguida) e qual bandeira/grupo aquele alvo tinha configurado (o alvo sai da
  // fila 30 min depois, e aí `noblePosDoAlvo` já cairia no padrão global).
  function nobleRegistrarConquista(a, todas) {
    const lista = config.noble.conquistadas || (config.noble.conquistadas = []);
    if (lista.some((c) => c.coord === a.coord)) return;
    const v = (todas || []).find((x) => (x.coord || '') === a.coord) || {};
    const cfg = noblePosDoAlvo(a.coord);
    const origens = [];
    (nobleVoos(a.coord) || []).forEach((e) => {
      const n = e.origemNome || e.origem || '?';
      const j = origens.find((o) => o.nome === n);
      if (j) j.n++; else origens.push({ nome: n, n: 1 });
    });
    lista.unshift({ coord: a.coord, nome: v.name || a.coord, vid: v.vid || null,
                    at: Date.now(), nobres: (nobleVoos(a.coord) || []).length, origens: origens,
                    gid: cfg.gid, bandTipo: cfg.bandTipo, bandNivel: cfg.bandNivel });
    config.noble.conquistadas = lista.slice(0, 100);
  }
  // Aplica grupo e bandeira numa aldeia já conquistada. Usada pelo automático E pelo botão
  // manual — um caminho só, pra os dois não divergirem.
  //
  // `forcar` = veio do clique. Aí ignora os interruptores globais: se o usuário apertou o botão,
  // a intenção é essa, não a de um checkbox de configuração.
  async function nobleAplicarPos(c, v, forcar) {
    const feito = [];
    if ((forcar || config.noble.posGrupo) && c.gid) {
      try { await nobleAddGrupo(v.vid, c.gid); feito.push('grupo'); }
      catch (e) { pushLog('Noblar: não consegui pôr ' + c.coord + ' no grupo (' + (e.message || e) + ').', 'err', 'noble'); }
      await sleep(400);
    }
    if ((forcar || config.noble.posBandeira) && c.bandTipo) {
      try { await nobleEquiparBandeira(v.vid, c.bandTipo, c.bandNivel || 1); feito.push('bandeira'); }
      catch (e) { pushLog('Noblar: não consegui equipar bandeira em ' + c.coord + ' (' + (e.message || e) + ').', 'err', 'noble'); }
      await sleep(400);
    }
    // Só marca como feito se ALGO deu certo — senão uma falha de rede aposentaria a aldeia
    // pra sempre e ela nunca entraria no grupo.
    if (feito.length) {
      config.noble.posFeitos[c.coord] = Date.now();
      pushLog('Noblar: ' + c.coord + ' — ' + feito.join(' + ') + ' aplicado(s).', 'ok', 'noble');
    }
    return feito;
  }
  // Passada automática. Antes ela varria `relatorios` atrás de lealdade <= 0, o que criava um
  // buraco: quem detecta a conquista de verdade é a lista de aldeias (nobleMinhaAldeia), e esse
  // caminho não passava por aqui. Alvo sem relatório lido — ou com "Ler relatórios" desligado,
  // que desligava o bloco inteiro — nunca recebia bandeira nem grupo. Agora a fonte é o
  // histórico, que é escrito pelo mesmo detector que marca `noblada`.
  async function noblePosConquista(todas) {
    if (!config.noble.posGrupo && !config.noble.posBandeira) return;
    for (const c of (config.noble.conquistadas || [])) {
      if (config.noble.posFeitos[c.coord]) continue;
      const v = (todas || []).find((x) => (x.coord || '') === c.coord);
      if (!v) continue;                 // ainda não entrou na lista de aldeias; tenta no próximo ciclo
      await nobleAplicarPos(c, v, false);
    }
    save();
  }

  function nobleMinhaAldeia(coord, todas) {


    return (todas || []).some((v) => (v.coord || '') === coord);
  }



  function nobleTpl(id) {
    const t = (config.noble.templates || {})[id];
    if (t) return t;
    const ids = Object.keys(config.noble.templates || {});
    return ids.length ? config.noble.templates[ids[0]] : defNobleTpl('Padrão');
  }
  function nobleTplDe(alvo) { return nobleTpl(alvo && alvo.tpl); }
  // Os modelos que este alvo pode usar, JA na ordem de tentativa. Alvo fixado num modelo
  // tenta so aquele; alvo em modo prioridade (tpl vazio) tenta todos, na ordem do usuario.
  function nobleTplsDe(alvo) {
    if (alvo && alvo.tpl && (config.noble.templates || {})[alvo.tpl]) {
      return [{ id: alvo.tpl, t: config.noble.templates[alvo.tpl] }];
    }
    const ids = (config.noble.ordem || []).filter((id) => (config.noble.templates || {})[id]);
    if (ids.length) return ids.map((id) => ({ id: id, t: config.noble.templates[id] }));
    const k = Object.keys(config.noble.templates || {});
    return k.length ? [{ id: k[0], t: config.noble.templates[k[0]] }] : [];
  }
  // Quantos comandos COMPLETOS (1 nobre + escolta inteira) esta aldeia consegue armar.
  // Sem requisicao nenhuma: o `avail` ja veio no cache das origens.
  function nobleCmdsDaAldeia(tpl, o) {
    let cap = o.nobres;
    Object.keys(tpl.escolta || {}).forEach((u) => {
      cap = Math.min(cap, Math.floor(((o.avail || {})[u] || 0) / tpl.escolta[u]));
    });
    return Math.max(0, cap);
  }
  // Quantos comandos completos o modelo renderia no alvo inteiro. E o criterio da ordem de
  // prioridade: vale mais o modelo que arma 4 comandos do que o que arma 1. Antes bastava
  // caber UMA escolta, o que fazia o 1o modelo ganhar mesmo rendendo um nobre so.
  function nobleCapacidade(tpl, origens, precisa) {
    const comNobre = origens.filter((o) => o.nobres > 0);
    const cands = tpl.soNT ? comNobre.filter((o) => nobleCmdsDaAldeia(tpl, o) >= precisa).slice(0, 1) : comNobre;
    let n = 0;
    for (const o of cands) { n += nobleCmdsDaAldeia(tpl, o); if (n >= precisa) return precisa; }
    return n;
  }

  function unitPt(u) { const r = UNITS.filter((p) => p[0] === u)[0]; return r ? r[1] : u; }
  function nobleEscoltaTxt(t) {
    const ks = Object.keys((t && t.escolta) || {});
    if (!ks.length) return 'sem escolta';
    return ks.map((u) => (t.escolta[u] + ' ' + (unitPt(u)))).join(', ');
  }

  function nobleParseCoords(txt) {
    // Aceita "555|444", "555444", "555 444" e texto misto no meio -- igual ao campo do jogo.
    const out = [], visto = {};
    (txt || '').split(/[\s,;\n]+/).forEach((tk) => {
      const m = tk.match(/^(\d{3})\|?(\d{3})$/) || tk.match(/^(\d{2,3})\|(\d{2,3})$/);
      if (!m) return;
      const c = m[1] + '|' + m[2];
      if (visto[c]) return;
      visto[c] = 1;
      out.push({ coord: c, x: +m[1], y: +m[2] });
    });
    return out;
  }

  // Aldeias proprias ordenadas pela distancia ate o alvo, com os nobres que cada uma tem agora.
  // `reservado` respeita as reservas do resto do script, pra nao prometer nobre que outro modulo ja
  // contou (o Coordenado guarda tropa desse jeito).
  async function nobleOrigensPerto(alvo, todas, cacheTropa, usados) {
    const perto = [];
    todas.forEach((v) => {
      const m = (v.coord || '').match(/(\d+)\|(\d+)/);
      if (!m) return;
      if (+m[1] === alvo.x && +m[2] === alvo.y) return;   // a propria aldeia do alvo nao e origem
      perto.push({ vid: v.vid, nome: v.name || v.coord, coord: v.coord,
                   d: fieldDist(+m[1], +m[2], alvo.x, alvo.y) });
    });
    perto.sort((a, b) => a.d - b.d);
    for (const o of perto) {
      // Cacheia o `avail` INTEIRO, nao so o snob: a escolta precisa saber o que a origem tem.
      if (cacheTropa[o.vid] === undefined) {
        try { cacheTropa[o.vid] = (await getVillageStateReserved(o.vid)).avail || {}; }
        catch (e) { cacheTropa[o.vid] = {}; }
        await sleep(200);
      }
      o.avail = cacheTropa[o.vid] || {};
      // Desconta o que alvos ANTERIORES desta rodada ja levaram desta aldeia.
      o.nobres = Math.max(0, (o.avail.snob || 0) - ((usados || {})[o.vid] || 0));
    }
    return perto;
  }

  // Escolhe o modelo e monta o plano de UM alvo.
  //
  // Ordem de prioridade: fica com o modelo que armar MAIS COMANDOS COMPLETOS, e em caso de empate
  // com o que vem antes na ordem do usuario. O criterio nao e "cabe uma escolta" -- com 1 nobre por
  // comando, um modelo que rende 4 comandos vale mais que um que rende 1, mesmo o segundo estando
  // antes na lista.
  //
  // A conta e de graca (usa o `avail` que ja esta em cache nas origens), entao so o modelo
  // ESCOLHIDO paga fakePrepare. Se nenhum modelo fecha um comando completo, o melhor deles ainda
  // manda com a escolta que houver -- "envio parcial vale" continua de pe.
  async function noblePlanejarAlvo(alvo, todas, cacheTropa, usados) {
    const opcoes = nobleTplsDe(alvo);
    if (!opcoes.length) return { pronto: false, envios: [], falta: 0, dentroDoLimite: [], motivo: 'nenhum modelo' };
    // Aldeia propria: para aqui. Antes do fakePrepare, antes do recrutamento — nao ha o que
    // planejar e cada ciclo gastaria requisicao e uma linha de log enganosa.
    if (nobleMinhaAldeia(alvo.coord, todas)) {
      return { pronto: false, envios: [], falta: 0, dentroDoLimite: [], propria: true,
               motivo: 'é sua aldeia' };
    }
    const origens = await nobleOrigensPerto(alvo, todas, cacheTropa, usados);
    // Melhor = mais comandos completos. Empate fica com quem vem antes na ordem do usuario.
    let melhor = null, melhorCap = -1;
    for (const op of opcoes) {
      const cap = nobleCapacidade(op.t, origens, op.t.nobres || NOBLE_POR_CONQUISTA);
      if (cap > melhorCap) { melhorCap = cap; melhor = op; }
      if (cap >= (op.t.nobres || NOBLE_POR_CONQUISTA)) { melhor = op; break; }   // completo: para aqui
    }
    const r = await noblePlanejarComTpl(alvo, melhor || opcoes[0], origens);
    if (opcoes.length > 1 && melhorCap <= 0 && r.envios.length) {
      r.motivo = (r.motivo ? r.motivo + ' · ' : '') + 'nenhum modelo com escolta completa';
    }
    return r;
  }

  // Plano com UM modelo ja escolhido. Devolve { pronto, envios[], falta, motivo }.
  //   pronto  = ha ao menos 1 nobre pra mandar (parcial vale)
  //   envios  = [{vid, nome, coord, qtd, unidades, durSec}]
  //   falta   = quantos nobres ainda faltam do que o modelo pede
  async function noblePlanejarComTpl(alvo, op, origens) {
    const tpl = op.t;
    // `dentroDoLimite` alimenta a PRODUCAO de nobre (nobleRecrutar). Ate aqui ele recebia
    // `origens` inteiro, sem filtro nenhum -- o limite de horas so era aplicado la no laco de
    // ENVIO. Resultado: o modulo formava (e ate cunhava) nobre em aldeia longe demais pra
    // alcancar o alvo, gastando moeda num nobre que nunca ia servir. Era o "fazendo nobre em
    // aldeia que nao tem nada a ver com o planner" relatado nos testes.
    // A viagem sai da velocidade do nobre do mundo, medida contra o servidor (35 min/campo
    // cravado neste). O envio segue tendo a duracao REAL do jogo como palavra final.
    const velN = await nobleVelNobre();
    const limH = Math.max(1, tpl.maxHoras || 6);
    const noAlcance = (origens || []).filter((o) => ((o.d * velN) / 60) <= limH);
    // Quantos AINDA faltam, nao quantos o modelo pede: lealdade baixa precisa de menos, e
    // comando ja a caminho conta como se tivesse pousado.
    const need = noblePrecisaDe(alvo, tpl);
    const precisa = need.precisa;
    if (precisa <= 0) {
      return { pronto: false, envios: [], falta: 0, dentroDoLimite: noAlcance, tpl: tpl,
               tplId: op.id, tplNome: tpl.name, coberto: true,
               lealdade: need.lealdade, prevista: need.prevista, voando: need.voando,
               motivo: need.voando ? ('coberto: ' + nobleTxtVoo(alvo.coord)) : 'lealdade zerada' };
    }

    const limite = Math.max(1, tpl.maxHoras || 6) * 3600;
    const comNobre = origens.filter((o) => o.nobres > 0);
    if (!comNobre.length) {
      return { pronto: false, envios: [], falta: precisa, dentroDoLimite: noAlcance, tpl: tpl, tplId: op.id, tplNome: tpl.name, motivo: 'nenhum nobre disponível' };
    }

    // "So NT" exige os nobres todos saindo da MESMA aldeia; senao pode somar de varias, da mais
    // perto pra mais longe.
    const candidatos = tpl.soNT
      ? comNobre.filter((o) => o.nobres >= precisa).slice(0, 1)
      : comNobre;
    if (!candidatos.length) {
      return { pronto: false, envios: [], falta: precisa, dentroDoLimite: noAlcance, tpl: tpl, tplId: op.id, tplNome: tpl.name,
               motivo: 'nenhuma aldeia com ' + precisa + ' nobres (modo só NT)' };
    }

    const envios = [];
    let faltam = precisa;
    for (const o of candidatos) {
      if (faltam <= 0) break;

      // Quantos COMANDOS esta aldeia arma. Se nem um sai com escolta completa, ainda mandamos o
      // nobre com o que houver -- a regra "envio parcial vale" vale pra escolta tambem.
      const capCheia = nobleCmdsDaAldeia(tpl, o);
      const cmds = Math.min(o.nobres, faltam, capCheia > 0 ? capCheia : o.nobres);
      if (cmds <= 0) continue;

      const unidades = { snob: 1 };
      const curta = [];
      Object.keys(tpl.escolta || {}).forEach((u) => {
        const querem = tpl.escolta[u] || 0;
        // Com escolta completa cada comando leva a cota cheia; sem ela, divide o que existe
        // entre os comandos, pro primeiro nao levar tudo e os outros irem pelados.
        const vai = capCheia > 0 ? querem : Math.floor(((o.avail || {})[u] || 0) / cmds);
        if (vai > 0) unidades[u] = vai;
        if (vai < querem) curta.push(unitPt(u) + ' ' + vai + '/' + querem);
      });

      // Duracao medida UMA vez por (aldeia, escolta): os comandos sao identicos, entao repetir o
      // fakePrepare seria requisicao jogada fora.
      let dur = null;
      try {
        const p = await fakePrepare(o.vid, alvo.x, alvo.y, unidades);
        dur = p.dur || null;
      } catch (e) {
        pushLog('Noblar: ' + o.nome + ' → ' + alvo.coord + ' não deu pra conferir a duração (' + (e.message || e) + ').', '', 'noble');
        continue;
      }
      await sleep(250);
      if (dur == null) { pushLog('Noblar: ' + o.nome + ' → ' + alvo.coord + ': o jogo não informou a duração — origem descartada.', '', 'noble'); continue; }
      if (dur > limite) continue;                     // fora do limite de horas: proxima origem
      // Guarda a viagem MEDIDA pelo jogo. E ela que a lealdade prevista usa no ciclo seguinte pra
      // saber quanto o alvo regenera antes do nobre chegar. Fica na origem mais perto (a primeira
      // que passa por aqui), que e de onde o proximo comando sairia.
      if (alvo.ultDur == null || dur < alvo.ultDur) alvo.ultDur = dur;
      if (curta.length) {
        pushLog('Noblar: ' + o.nome + ' → ' + alvo.coord + ' — escolta incompleta (' + curta.join(', ') + ').', '', 'noble');
      }
      // UM ENVIO = UM COMANDO. E o que garante 1 nobre por ataque.
      for (let k = 0; k < cmds; k++) {
        envios.push({ vid: o.vid, nome: o.nome, coord: o.coord, qtd: 1,
                      unidades: unidades, durSec: dur, d: o.d });
      }
      faltam -= cmds;
    }

    // Parcial VALE: com 1 nobre no alcance, manda 1. O alvo so fica sem disparo quando nao ha
    // nenhum. `falta` continua sendo informacao pro usuario, nao mais uma trava.
    const levando = precisa - faltam;
    return {
      pronto: envios.length > 0,
      envios: envios, falta: Math.max(0, faltam), levando: levando, precisa: precisa,
      lealdade: need.lealdade, prevista: need.prevista, voando: need.voando,
      dentroDoLimite: noAlcance, tpl: tpl, tplId: op.id, tplNome: tpl.name,
      motivo: faltam > 0
        ? ('parcial: ' + levando + ' de ' + precisa + ' nobre(s)')
        : null,
    };
  }

  // ===== Lealdade =====
  // A lealdade SÃ“ existe em relatÃ³rio de ATAQUE COM NOBRE. Conferido em dois dumps do usuÃ¡rio:
  // relatÃ³rio de exploraÃ§Ã£o nÃ£o traz o campo em lugar nenhum (varredura do #content_value inteiro
  // voltou vazia); o de nobre traz, dentro do #attack_results, como "Lealdade: Descida X para Y".
  // Ou seja: isto Ã© ACOMPANHAMENTO do que jÃ¡ bateu, nÃ£o conferÃªncia prÃ©via. Antes do primeiro nobre
  // nÃ£o dÃ¡ pra saber a lealdade de um alvo, e a tela mostra â€” em vez de fingir 100.
  function nobleNorm(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
  }
  async function nobleLerRelatorio(reportId) {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=report&view=' + reportId, { credentials: 'include' });
    if (!res.ok) throw new Error('relatÃ³rio ' + reportId + ': HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const out = { reportId: reportId, lealdade: null, de: null, dono: null, tropa: null, coord: null };

    const rBox = doc.querySelector('#attack_results');
    if (rBox) {
      // "Lealdade: Descida 3 para -29". Regex sem acento porque o texto jÃ¡ passou pelo nobleNorm;
      // o [^0-9-]* atravessa a palavra do meio (Descida/Subida) sem depender de qual Ã©.
      const m = nobleNorm(rBox.textContent).match(/lealdade:[^0-9-]*(-?\d+) para (-?\d+)/);
      if (m) { out.de = parseInt(m[1], 10); out.lealdade = parseInt(m[2], 10); }
    }
    const dBox = doc.querySelector('#attack_info_def');
    if (dBox) {
      const txt = (dBox.textContent || '').replace(/\s+/g, ' ').trim();
      const md = txt.match(/Defensor:\s*(.+?)\s+Destino:/i);
      if (md) out.dono = md[1].trim().slice(0, 30);
      const mc = txt.match(/Destino:[^]*?(\d{2,3}\|\d{2,3})/);
      if (mc) out.coord = mc[1];
    }
    // Mesma leitura do getReportDefenseTotal, mas sem um segundo fetch: o doc jÃ¡ estÃ¡ na mÃ£o.
    const uBox = doc.querySelector('#attack_info_def_units');
    if (uBox) {
      let t = 0;
      uBox.querySelectorAll('td.unit-item, .unit-item').forEach((c) => { t += parseInt((c.textContent || '').replace(/\D/g, ''), 10) || 0; });
      out.tropa = t;
    }
    return out;
  }

  // Varre a primeira pÃ¡gina da lista de relatÃ³rios atrÃ¡s dos alvos da lista.
  //
  // Parser de propÃ³sito genÃ©rico: pega TODO a[href*="view="] em vez de amarrar num #id de tabela.
  // A linha do relatÃ³rio tem o assunto ("X (o|o) conquista Y (a|a)") â€” a ÃšLTIMA coordenada do texto
  // Ã© o DESTINO, que Ã© o que interessa; a primeira Ã© a origem. Se o assunto nÃ£o citar nenhum alvo
  // da lista, nem abre o relatÃ³rio.
  async function nobleVarrerRelatorios(alvos) {
    const querido = {}; alvos.forEach((a) => { querido[a.coord] = 1; });
    let doc;
    try {
      const res = await fetch('/game.php?village=' + CUR_VID + '&screen=report&mode=all', { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    } catch (e) {
      pushLog('Noblar: nÃ£o consegui abrir a lista de relatÃ³rios (' + (e.message || e) + ').', '', 'noble');
      return 0;
    }
    const fila = [], jaNaFila = {};
    doc.querySelectorAll('a[href*="view="]').forEach((a) => {
      const mi = (a.getAttribute('href') || '').match(/view=(\d+)/);
      if (!mi) return;
      const id = mi[1];
      if (config.noble.vistos[id] || jaNaFila[id]) return;
      const txt = (a.textContent || '').replace(/\s+/g, ' ');
      const coords = txt.match(/\d{2,3}\|\d{2,3}/g);
      if (!coords || !coords.length) return;
      const destino = coords[coords.length - 1];      // assunto Ã© "origem ... destino"
      if (!querido[destino]) return;
      const tr = a.closest ? a.closest('tr') : null;
      const tds = tr ? tr.querySelectorAll('td') : [];
      const quando = tds.length ? parseReportDate(tds[tds.length - 1].textContent) : null;
      jaNaFila[id] = 1;
      fila.push({ id: id, coord: destino, at: quando });
    });
    if (!fila.length) return 0;

    let lidos = 0;
    for (const r of fila.slice(0, 12)) {            // teto por ciclo: nÃ£o vira varredura infinita
      let info;
      try { info = await nobleLerRelatorio(r.id); }
      catch (e) { continue; }                        // relatÃ³rio ilegivel: tenta de novo no prÃ³ximo ciclo
      config.noble.vistos[r.id] = 1;
      lidos++;
      await sleep(300);
      const ant = config.noble.relatorios[r.coord];
      // SÃ³ sobrescreve com relatÃ³rio MAIS NOVO â€” a lista vem ordenada, mas nÃ£o custa garantir.
      // `>=`, nao `>`. A lista de relatorios so tem precisao de MINUTO, entao um NT inteiro (4
      // comandos que pousam juntos) vira quatro relatorios com a MESMA hora. Com `>`, o empate
      // nao barrava a sobrescrita: a fila e percorrida do mais novo pro mais velho, entao o
      // ultimo a escrever era o PRIMEIRO ataque do lote -- e a lealdade gravada era a de antes
      // dos outros tres. O modulo achava o alvo bem mais inteiro do que estava e mandava nobre
      // a mais. No empate quem vale e o primeiro lido, que e o mais novo.
      if (ant && ant.at && r.at && ant.at >= r.at) continue;
      // Dono diferente do que estava = alguem CONQUISTOU o alvo. Se nao fui eu (o tick confere
      // na lista de aldeias antes de olhar isto aqui), a premissa "aldeia vazia" morreu junto:
      // agora ela tem dono ativo e tropa. O alvo sai da fila com alerta em vez de seguir sendo
      // atacado no escuro.
      const trocouDono = !!(ant && ant.dono && info.dono && ant.dono !== info.dono);
      // A lealdade SÓ existe em relatório de ATAQUE COM NOBRE. Mas a varredura casa por
      // coordenada no assunto, então relatório de SAQUE ou de EXPLORAÇÃO no mesmo alvo também
      // entra aqui — e vinha gravando `lealdade: null` por cima, apagando a única leitura que
      // existia. Era por isso que o painel mostrava lealdade "?" e previsão vazia num alvo que
      // já tinha levado nobre: um saque no meio do caminho zerava a memória.
      //
      // Agora relatório sem lealdade só atualiza dono e tropa. A leitura sobrevive.
      const temLeald = info.lealdade != null;
      const antR = ant || {};
      config.noble.relatorios[r.coord] = {
        reportId: r.id, at: r.at || Date.now(),
        lealdade: temLeald ? info.lealdade : antR.lealdade,
        de: temLeald ? info.de : antR.de,
        // QUANDO a lealdade foi medida — separado do `at` do relatório. A regeneração conta a
        // partir da medição, não da última vez que qualquer relatório apareceu; e só relatório
        // de nobre prova que o comando pousou, então é este carimbo que poda o "em voo".
        lealdadeAt: temLeald ? (r.at || Date.now()) : antR.lealdadeAt,
        dono: info.dono || antR.dono,
        tropa: info.tropa != null ? info.tropa : antR.tropa,
        trocouDono: trocouDono || !!(ant && ant.trocouDono),
        donoAnterior: trocouDono ? ant.dono : (ant || {}).donoAnterior,
      };
      if (info.lealdade != null) {
        pushLog('Noblar: ' + r.coord + ' â€” lealdade ' + info.de + ' â†’ ' + info.lealdade
          + (info.lealdade <= 0 ? ' (CONQUISTADA)' : '') + '.', 'ok', 'noble');
      }
    }
    // `vistos` guarda id de relatÃ³rio pra sempre; poda os mais antigos pra nÃ£o inchar o storage.
    const ids = Object.keys(config.noble.vistos);
    if (ids.length > 400) ids.sort().slice(0, ids.length - 400).forEach((k) => { delete config.noble.vistos[k]; });
    return lidos;
  }

  // Recrutamento: FORMA nobre nas aldeias mais proximas do alvo que ainda cabem no limite de horas.
  //
  // NAO cunha. Cunhar converte recurso em moeda sem volta, num alvo que pode nem sair -- decisao
  // do usuario: quem cunha e ele, a mao, pelo modo Cunhar do Mercado. Aqui so se materializa nobre
  // de moeda JA guardada, que e um passo sem custo de oportunidade.
  // "Formar unidade" da Academia. Confirmado no dump: e um LINK simples, nao um form --
  //   /game.php?village=<vid>&screen=snob&action=train&h=<csrf>
  // Mesmo padrao do enqueueBuild do Construcoes. Consome recurso e 100 de populacao.
  async function nobleFormar(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=snob&action=train&h=' + CSRF,
      { credentials: 'include' });
    const t = await res.text();
    // O jogo devolve a propria tela; erro vem numa caixa. Sem isso, falha passaria por sucesso.
    const doc = new DOMParser().parseFromString(t, 'text/html');
    const err = doc.querySelector('.error_box, .error');
    if (err && (err.textContent || '').trim()) throw new Error((err.textContent || '').trim().slice(0, 90));
    return true;
  }

  // Tenta formar ate `faltam` nobres, da aldeia mais PERTO do alvo pra mais longe.
  // Aldeia que nao consegue agora (sem recurso, sem populacao, moeda insuficiente) nao interrompe:
  // segue pra proxima mais proxima -- foi o pedido explicito do usuario.
  //
  // CONTA A FILA DA ACADEMIA antes de formar. Nobre encomendado nao entra na tropa disponivel,
  // entao sem ler a fila ele e INVISIVEL: o modulo acha que nada vem, forma outro, e no ciclo
  // seguinte outro. O dump do usuario mostrou 5 nobres na fila de uma aldeia por causa disso.
  //
  // Devolve { formados, naFila, prontoEm }. `naFila + formados` responde "vem mais nobre?", que
  // e o que decide se um envio parcial espera ou sai.
  async function nobleRecrutar(alvo, origensOrdenadas, faltam) {
    const feitas = [];
    let formados = 0, naFila = 0, prontoEm = null, cunhadas = 0;
    for (const o of origensOrdenadas) {
      // O que ja esta na fila conta como feito: nao precisa encomendar de novo.
      if (formados + naFila >= faltam) break;
      let st;
      try { st = await getSnobState(o.vid); }
      catch (e) { continue; }                       // sem Academia: proxima aldeia
      if (!st.hasForm) continue;
      // O total é da CONTA, então qualquer aldeia que a gente abrir serve pra saber.
      if (st.totalConta != null) _nbTotalConta = st.totalConta;
      const fl = st.fila || { nobres: 0 };
      if (fl.nobres > 0) {
        naFila += fl.nobres;
        if (fl.prontoEm && (prontoEm == null || fl.prontoEm < prontoEm)) prontoEm = fl.prontoEm;
        feitas.push({ nome: o.nome, ok: false, motivo: fl.nobres + ' já na fila'
          + (fl.prontoEm ? ' (1º às ' + new Date(fl.prontoEm).toLocaleTimeString('pt-BR') + ')' : '') });
        await sleep(200);
        continue;                                   // ja tem nobre vindo daqui; nao empilha mais
      }
      const m = st.moedas || {};
      if (!(m.podemFormar > 0)) {
        // Sem moeda guardada o bastante. Cunhar e OPT-IN (gasta recurso sem volta) e tem alvo:
        // so ate esta aldeia conseguir fechar um NT de `cunharAte` nobres, contando o que ela ja
        // tem MAIS o que esta na fila. Sem esse teto ela cunharia pra sempre.
        if (config.noble.cunhar && cunhadas < (config.noble.cunharMaxAldeias || 3)) {
          const jaTem = ((o.avail || {}).snob || 0) + (fl.nobres || 0);
          // O teto e o MENOR entre "fechar o NT" e o que a aldeia da vez realmente precisa.
          // Sem o segundo, um alvo a que falta 1 nobre mandaria cunhar ate 4 -- e moeda nao tem
          // volta. Com a fila, `faltam` e um numero exato, entao da pra ser exato.
          const teto = Math.min(config.noble.cunharAte || 4, Math.max(1, faltam));
          if (jaTem >= teto) {
            feitas.push({ nome: o.nome, ok: false, motivo: 'já tem o que falta (' + jaTem + '/' + teto + ')' });
          } else if (st.maxMint < 1) {
            feitas.push({ nome: o.nome, ok: false, motivo: 'sem recurso pra cunhar' });
          } else {
            try {
              const rc = await mintCoins(o.vid);
              cunhadas++;
              feitas.push({ nome: o.nome, ok: false,
                            motivo: '+' + (rc.minted || 0) + ' moeda(s), faltam ' + m.faltam });
            } catch (e2) {
              feitas.push({ nome: o.nome, ok: false, motivo: 'cunhar falhou: ' + (e2.message || e2) });
            }
            await sleep(400); continue;
          }
        } else if (m.faltam != null) {
          feitas.push({ nome: o.nome, ok: false, motivo: 'faltam ' + m.faltam + ' moeda(s)' });
        }
        await sleep(200); continue;
      }
      try {
        await nobleFormar(o.vid);
        formados++;
        feitas.push({ nome: o.nome, ok: true });
      } catch (e) {
        feitas.push({ nome: o.nome, ok: false, motivo: (e.message || e) });
      }
      await sleep(400);
    }
    if (feitas.length) {
      const resumo = feitas.map((f) => f.nome + ': ' + (f.ok ? 'NOBRE em produção' : f.motivo)).join(' \u00b7 ');
      pushLog('Noblar (recruta) → ' + alvo.coord + ' — ' + resumo, formados ? 'ok' : '', 'noble');
    }
    return { formados: formados, naFila: naFila, prontoEm: prontoEm };
  }

  async function nobleTick() {
    clearTimeout(nobleTimer);
    if (!config.noble.running) return;
    if (lockOther()) { nobleTimer = setTimeout(nobleTick, 5000); return; }
    if (captchaBlocked()) { nobleTimer = setTimeout(nobleTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.noble.nextAt || 0) > now) { scheduleNoble(); return; }

    const alvos = config.noble.alvos || [];
    if (!alvos.length) {
      pushLog('Noblar: nenhum alvo na lista.', '', 'noble');
      config.noble.nextAt = now + 300000; save(); scheduleNoble(); return;
    }

    let todas = [];
    try { todas = await getAllVillagesCached(); }
    catch (e) {
      pushLog('Noblar: erro ao listar as aldeias (' + (e.message || e) + ').', 'err', 'noble');
      config.noble.nextAt = now + 120000; save(); scheduleNoble(); return;
    }

    // Lealdade primeiro: o plano da tela mostra o último relatório, então ele tem que estar fresco.
    if (config.noble.lerRelatorios !== false) {
      try { await nobleVarrerRelatorios(alvos); }
      catch (e) { pushLog('Noblar (relatórios): ' + (e.message || e), '', 'noble'); }
    }

    // O JOGO é a fonte da verdade sobre o que está a caminho. Vem antes de tudo: a fila inteira
    // (exigência, previsão, estado) sai daqui. Se a leitura falhar, segue com o caderno interno
    // e avisa — melhor um plano baseado em dado velho do que nenhum plano.
    // Uma ficha por alvo ATIVO (resolvido não precisa). É a verdade do instante: o que não está
    // lá não está voando. Por isso o resultado SUBSTITUI a lista do alvo em vez de somar com o
    // caderno — era a soma que deixava pousado velho contando como cobertura.
    try {
      const ativos = (config.noble.alvos || []).filter((a) => !a.noblada && !a.perdida);
      config.noble.emVoo = config.noble.emVoo || {};
      for (const a of ativos) {
        const lista = await nobleComandosDoAlvo(a.coord);
        if (lista == null) continue;                       // alvo fora do village.txt: mantém o que tinha
        if (lista.length) config.noble.emVoo[a.coord] = lista;
        else delete config.noble.emVoo[a.coord];
        await sleep(200);
      }
    } catch (e) {
      pushLog('Noblar: não consegui ler as fichas dos alvos (' + (e.message || e)
        + ') — este ciclo usa só o registro interno, que não enxerga envio manual.', '', 'noble');
    }

    // ===== Entra e sai da fila =====
    // Sai por conquista MINHA (a coordenada aparece na lista de aldeias) ou porque outro jogador
    // tomou o alvo antes. Nos dois casos nao ha mais o que noblar ali. O alvo resolvido nao some
    // na hora: fica visivel um tempo com o estado final, senao o usuario nunca ve o resultado do
    // proprio ciclo -- some sozinho depois.
    const RESOLVIDO_TTL = 30 * 60000;
    (config.noble.alvos || []).forEach((a) => {
      if (!a.noblada && nobleMinhaAldeia(a.coord, todas)) {
        a.noblada = Date.now();
        // ANTES do delete: o registro puxa os voos pra saber quantos nobres a conquista custou.
        nobleRegistrarConquista(a, todas);
        delete config.noble.emVoo[a.coord];
        pushLog('Noblar: ' + a.coord + ' CONQUISTADA — sai da fila.', 'ok', 'noble');
      }
      const rel = (config.noble.relatorios || {})[a.coord];
      if (!a.noblada && !a.perdida && rel && rel.trocouDono) {
        a.perdida = Date.now();
        pushLog('Noblar: ' + a.coord + ' MUDOU DE DONO (' + (rel.donoAnterior || '?') + ' → '
          + (rel.dono || '?') + ') — outro jogador noblou antes. Sai da fila: ela não está mais'
          + ' vazia, então a premissa do módulo não vale pra esse alvo.', 'err', 'noble');
      }
    });
    config.noble.alvos = (config.noble.alvos || []).filter((a) => {
      const fim = a.noblada || a.perdida;
      return !fim || (Date.now() - fim) < RESOLVIDO_TTL;
    });

    // Só AQUI, depois da detecção: o registro da conquista acabou de ser escrito logo acima, e é
    // dele que o pós-conquista se alimenta. Rodando antes, a bandeira só sairia no ciclo seguinte.
    // Fora do "Ler relatórios" de propósito — quem desligava aquilo ficava sem bandeira e sem
    // grupo, sem nenhum aviso, porque o pós-conquista morava dentro daquele bloco.
    try { await noblePosConquista(todas); }
    catch (e) { pushLog('Noblar (pós-conquista): ' + (e.message || e), 'err', 'noble'); }

    const cacheTropa = {};
    // Pool global: quanto de cada aldeia os alvos ANTERIORES desta rodada ja levaram. E o que
    // impede o mesmo nobre de aparecer no plano de dois alvos.
    const usados = {};
    const plano = [];
    let enviadosNoCiclo = 0;
    let prontos = 0, completos = 0, recrutando = 0, naFila = 0;
    // A FILA. Uma aldeia por vez: o alvo da vez tem prioridade absoluta sobre nobre parado,
    // recrutamento e cunhagem. O proximo so entra quando a lealdade PREVISTA do da vez ja esta
    // em zero -- ou seja, quando o que ja esta no ar garante a queda, mesmo sem ter pousado.
    // Ele nao SAI da fila ai: sai so na conquista efetiva (bloco acima).
    //
    // Quando destrava, o proximo descobre sozinho se ha nobre pra ele: o pool `usados` ja
    // garantiu que o da vez pegou primeiro, e o que sobrar (parado, formavel ou cunhavel) e
    // exatamente o que o planejamento dele encontra. Se nao sobrou nada, ele diz "sem nobres".
    let travado = false;
    for (const alvo of config.noble.alvos) {
      { const pare = devoParar('noble'); if (pare) { pushLog('Noblar: ciclo interrompido — ' + pare + '.', '', 'noble'); break; } }

      // Ja resolvido: continua na tela pelo TTL, mas nao consome ciclo nem trava a fila.
      if (alvo.noblada || alvo.perdida) {
        plano.push({ coord: alvo.coord, x: alvo.x, y: alvo.y, pronto: false, envios: [],
                     estado: alvo.noblada ? 'noblada' : 'perdida' });
        continue;
      }
      naFila++;
      // Esperando a vez. Nem planeja: planejar gastaria fakePrepare e leitura de Academia num
      // alvo que, por decisao da fila, nao vai receber nada neste ciclo.
      if (travado) {
        plano.push({ coord: alvo.coord, x: alvo.x, y: alvo.y, pronto: false, envios: [],
                     estado: 'aguardando',
                     lealdade: nobleLealdadeAgora(alvo.coord),
                     prevista: nobleLealdadePrevista(alvo.coord, alvo.ultDur),
                     voando: nobleEmVoo(alvo.coord) });
        continue;
      }

      const r = await noblePlanejarAlvo(alvo, todas, cacheTropa, usados);
      r.envios.forEach((e) => { usados[e.vid] = (usados[e.vid] || 0) + e.qtd; });
      plano.push({ coord: alvo.coord, x: alvo.x, y: alvo.y, pronto: r.pronto,
                   envios: r.envios, falta: r.falta, levando: r.levando, precisa: r.precisa,
                   tplId: r.tplId, tplNome: r.tplNome, propria: r.propria, coberto: r.coberto,
                   lealdade: r.lealdade, prevista: r.prevista, voando: r.voando, motivo: r.motivo });
      const item = plano[plano.length - 1];
      if (r.pronto) prontos++;

      // `vindo` = nobre que ainda vai existir: o que formei agora MAIS o que ja estava na fila.
      // Os dois contam igual pra decisao do parcial -- o que importa e se vale esperar, nao quem
      // encomendou.
      let vindo = 0, prontoEm = null;
      if (r.propria) { /* aldeia minha: nada a produzir nem a enviar */ }
      else if (r.coberto) { completos++; /* lealdade ja coberta pelo que esta a caminho */ }
      else if (r.falta <= 0) { completos++; }
      else if (config.noble.produzir !== false) {
        // Faltou nobre: tenta FORMAR nas mais proximas (nunca cunhar). O nobre formado entra na
        // fila da Academia, entao ele so aparece no plano do proximo ciclo -- de proposito.
        try {
          const rec = await nobleRecrutar(alvo, r.dentroDoLimite || [], r.falta);
          vindo = (rec.formados || 0) + (rec.naFila || 0);
          recrutando += vindo;
          prontoEm = rec.prontoEm || null;
        }
        catch (e) { pushLog('Noblar (recruta) em ' + alvo.coord + ': ' + (e.message || e), 'err', 'noble'); }
      }

      // ---- decide o disparo automatico ----
      if (config.noble.autoEnviar !== false && r.pronto && !devoParar('noble')) {
        const qtd = r.envios.length;
        if (enviadosNoCiclo + qtd > (config.noble.autoMax || 8)) {
          item.motivo = (item.motivo ? item.motivo + ' · ' : '') + 'teto do ciclo';
          pushLog('Noblar (auto): ' + alvo.coord + ' segurado — teto de ' + (config.noble.autoMax || 8)
            + ' comando(s) por ciclo já batido.', '', 'noble');
        } else if (r.falta > 0 && vindo > 0 && !config.noble.parcialSempre) {
          // Parcial COM nobre a caminho: segura. Mandar agora gasta o unico que existe e a
          // lealdade (regen ~1/h) volta antes do proximo chegar. Foi a regra do usuario:
          // parcial e pra quando nao da pra recrutar mais.
          const quando = prontoEm ? ' 1º às ' + new Date(prontoEm).toLocaleTimeString('pt-BR') : '';
          item.motivo = (item.motivo ? item.motivo + ' · ' : '') + 'segurando: +' + vindo + ' em produção';
          item.prontoEm = prontoEm;
          pushLog('Noblar (auto): ' + alvo.coord + ' segurado — leva ' + r.levando + ' de ' + r.precisa
            + ' e tem ' + vindo + ' nobre(s) em produção.' + quando
            + ' Manda quando fechar (ou clique em Enviar).', '', 'noble');
        } else {
          const n = await nobleEnviarItem(item, ' (auto)');
          enviadosNoCiclo += n;
          if (r.falta > 0) {
            pushLog('Noblar (auto): ' + alvo.coord + ' foi PARCIAL (' + r.levando + ' de ' + r.precisa + ') — '
              + (config.noble.parcialSempre && vindo > 0
                 ? 'manda o que está pronto (opção ligada); o resto sai nos próximos ciclos, e o teto encolhe sozinho.'
                 : 'não havia nobre pra recrutar.'), '', 'noble');
          }
        }
      }

      // ---- estado e trava da fila ----
      // Recalcula DEPOIS do envio: os comandos que acabaram de sair ja entraram no emVoo, entao
      // esta previsao e a situacao real da fila agora, nao a de antes do ciclo.
      const prevFinal = nobleLealdadePrevista(alvo.coord, alvo.ultDur);
      item.prevista = prevFinal;
      item.estado = r.propria ? 'propria'
        : nobleEstadoDe(alvo.coord, vindo, prevFinal != null && prevFinal <= 0);
      item.prontoEm = prontoEm;
      // Aldeia propria nao trava nada -- nao ha o que noblar e o alvo so espera ser removido.
      // Sem relatorio nunca lido nao ha previsao: cai no que ainda falta do modelo.
      // A trava serial existe pra RESERVAR a produção futura de nobres pro alvo da vez — sem
      // ela, um alvo de trás pegaria o nobre que acabou de sair da Academia e o da frente nunca
      // fecharia. Mas ela também segura alvo em OUTRA REGIÃO, que não disputa nobre nenhum com
      // o da frente: o pool `usados` já garante que o mesmo nobre não vai pra dois alvos, e a
      // ordem da fila já dá a primeira escolha pra quem está na frente.
      // No modo paralelo todo alvo é planejado e pega o que sobrou — quem não achar nobre diz
      // "sem nobres", que é informação, em vez de um "Aguardando" que esconde o motivo.
      if (!r.propria && !config.noble.paralelo) {
        travado = (prevFinal != null) ? (prevFinal > 0) : (r.falta == null || r.falta > 0);
      }
    }

    // Nobres parados na conta: soma o snob de todas as aldeias que o ciclo ja leu. Zero
    // requisicao extra -- o cacheTropa foi preenchido pelo planejamento. Fica null quando o
    // ciclo nao chegou a ler nenhuma (fila toda em espera), pra o card mostrar "—" em vez de 0.
    // DESCONTA o `usados`: o cacheTropa foi lido ANTES dos envios deste ciclo, então sem isso o
    // card contaria como parado o nobre que acabou de decolar.
    const vidsLidos = Object.keys(cacheTropa);
    let nobresParados = 0;
    vidsLidos.forEach((vid) => {
      nobresParados += Math.max(0, ((cacheTropa[vid] || {}).snob || 0) - (usados[vid] || 0));
    });

    config.noble.plano = plano;
    config.noble.planoAt = now;
    config.noble.stats = { alvos: naFila, prontos: prontos, completos: completos,
                           naFila: naFila, recrutando: recrutando,
                           recrutados: vidsLidos.length ? nobresParados : null,
                           faltando: naFila - prontos,
                           nobresConta: _nbTotalConta != null ? _nbTotalConta : (config.noble.stats || {}).nobresConta };
    config.noble.nextAt = now + Math.max(60, config.noble.interval || 900) * 1000;
    save();
    renderNoblePlano();
    refreshCards('noble');
    // Depois do plano, não antes: o `usados` deste ciclo já está aplicado, então o nobre que
    // acabou de decolar não aparece como parado. Respeita o prazo — não é uma leitura por ciclo.
    nobleOciososAuto();
    const daVez = (config.noble.alvos || []).filter((a) => !a.noblada && !a.perdida)[0];
    pushLog('Noblar: fila de ' + naFila + ' aldeia(s)'
      + (daVez ? ' — a vez é de ' + daVez.coord : '')
      + (travado && naFila > 1 ? ' (as outras aguardam)' : '')
      + '. ' + (config.noble.autoEnviar === false ? 'Nada foi enviado (disparo manual).'
        : enviadosNoCiclo + ' comando(s) enviado(s).'), 'ok', 'noble');
    scheduleNoble();
  }
  function scheduleNoble() {
    clearTimeout(nobleTimer);
    if (!config.noble.running) return;
    nobleTimer = setTimeout(nobleTick, Math.min(Math.max((config.noble.nextAt || 0) - Date.now(), 1000), 60000));
  }

  // Resumo legivel de um plano, agrupado por aldeia. O disparo continua um comando por nobre;
  // o agrupamento e so pra nao imprimir oito linhas iguais.
  function nobleResumo(item) {
    const detalha = (un) => Object.keys(un || {}).filter((u) => u !== 'snob')
      .map((u) => un[u] + ' ' + unitPt(u)).join(', ');
    const g = [];
    item.envios.forEach((e) => {
      const j = g.find((x) => x.nome === e.nome && x.det === detalha(e.unidades));
      if (j) j.n++; else g.push({ nome: e.nome, det: detalha(e.unidades), dur: e.durSec, n: 1 });
    });
    return g.map((x) => x.n + ' comando(s) de ' + x.nome
      + ' — 1 nobre' + (x.det ? ' + ' + x.det : '') + ' cada (' + fmtDur(x.dur) + ')').join('\n');
  }

  // O envio de fato. Usado pelo clique E pelo automatico -- um caminho so, pra os dois nao
  // divergirem com o tempo.
  async function nobleEnviarItem(item, marca) {
    let ok = 0;
    const total = item.envios.reduce((a, e) => a + e.qtd, 0);
    for (const e of item.envios) {
      try {
        // Sempre snob:1 — um envio É um comando. O fallback também, pra não reabrir a porta.
        await sendAttack(e.vid, item.x, item.y, e.unidades || { snob: 1 });
        ok += e.qtd;
        // Registra comando a comando: se o laco morrer no meio, o que ja saiu continua contado.
        nobleRegistraEnvio(item.coord, e.qtd, e.durSec, e.nome || e.coord || null);
        pushLog('Noblar' + marca + ': ' + e.nome + ' → ' + item.coord + ' — 1 nobre enviado, chega em ' + fmtDur(e.durSec) + '.', 'ok', 'noble');
      } catch (err) {
        pushLog('Noblar' + marca + ': ' + e.nome + ' → ' + item.coord + ' FALHOU: ' + (err.message || err), 'err', 'noble');
      }
      await sleep(400);
    }
    pushLog('Noblar' + marca + ': ' + item.coord + ' — ' + ok + ' de ' + total + ' comando(s) saíram.',
      ok >= total ? 'ok' : 'err', 'noble');
    item.pronto = false; item.motivo = 'enviado';   // nao oferece disparar de novo sem replanejar
    return ok;
  }

  // Disparo manual: pelo clique, com confirmacao. Continua existindo mesmo com o automatico
  // ligado -- serve pra mandar um parcial que o automatico decidiu segurar.
  async function nobleDispararAlvo(coord) {
    const item = (config.noble.plano || []).find((p) => p.coord === coord);
    if (!item || !item.pronto) { alert('Esse alvo não está pronto no plano.'); return; }
    const total = item.envios.reduce((a, e) => a + e.qtd, 0);
    if (!confirm('Enviar ' + total + ' nobre(s) para ' + coord + '?\n\n' + nobleResumo(item)
      + '\n\nCada comando leva 1 nobre — a lealdade cai uma vez por ataque.'
      + '\n\nIsso NÃO tem volta.')) return;
    await nobleEnviarItem(item, '');
    save(); renderNoblePlano(); refreshCards('noble');
  }

  function fmtDur(s) {
    if (s == null) return '—';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h + 'h' + String(m).padStart(2, '0');
  }

  // ===== UI =====
  function nobleAddCoords() {
    const ta = document.getElementById('twmgr-nb-coords'); if (!ta) return;
    const novos = nobleParseCoords(ta.value);
    if (!novos.length) { alert('Nenhuma coordenada válida no texto.'); return; }
    const jaTem = {}; (config.noble.alvos || []).forEach((a) => { jaTem[a.coord] = 1; });
    let n = 0;
    // Nasce em modo PRIORIDADE (tpl vazio), nao fixado no modelo que esta aberto no painel: o
    // select ali em cima e o que voce esta EDITANDO, nao o que voce escolheu pro alvo.
    novos.forEach((a) => { if (!jaTem[a.coord]) { a.tpl = ''; config.noble.alvos.push(a); n++; } });
    ta.value = '';
    save(); renderNoblePlano(); renderNoblePos();
    pushLog('Noblar: ' + n + ' alvo(s) adicionado(s)' + (novos.length - n ? ' (' + (novos.length - n) + ' já estavam na lista)' : '') + '.', 'ok', 'noble');
    // Avisa AGORA, que e quando voce ainda lembra por que colou aquela coordenada. O cache de
    // aldeias pode nao estar quente, entao isto e best-effort: quem garante e o plano.
    getAllVillagesCached().then((todas) => {
      const minhas = novos.filter((a) => nobleMinhaAldeia(a.coord, todas)).map((a) => a.coord);
      if (minhas.length) {
        pushLog('Noblar: ' + minhas.join(', ') + ' — ' + (minhas.length === 1 ? 'essa é uma aldeia SUA' : 'essas são aldeias SUAS')
          + '. Não dá pra noblar aldeia própria; remova da lista.', 'err', 'noble');
      }
    }).catch(() => {});
  }
  function nobleContarCoords() {
    const ta = document.getElementById('twmgr-nb-coords');
    const el = document.getElementById('twmgr-nb-count');
    if (!ta || !el) return;
    const n = nobleParseCoords(ta.value).length;
    el.textContent = n + ' coordenada' + (n === 1 ? '' : 's');
  }
  // Celula de lealdade (atual ou prevista). `?` quando nunca houve relatorio de nobre -- e o
  // unico jeito de saber lealdade no jogo, entao fingir 100 seria mentira.
  function nobleLealdadeCel(v, dica) {
    if (v == null) {
      return '<span style="color:#8a7340" title="lealdade só aparece em relatório de ataque com nobre">?</span>';
    }
    const n = Math.round(v);
    const cor = n <= 0 ? '#3f8f52' : n <= 35 ? '#b5651d' : '#8a7340';
    return '<b style="color:' + cor + '" title="' + esc(dica || '') + '">' + n + '</b>';
  }
  // Idade do relatório em texto curto, pra dica de ferramenta (sem HTML, que o title não aceita).
  function nobleQuandoTxt(ts) {
    if (!ts) return 'data desconhecida';
    const h = Math.floor((Date.now() - ts) / 3600000);
    if (h < 1) return 'agora há pouco';
    if (h < 24) return h + 'h atrás';
    return Math.floor(h / 24) + 'd atrás';
  }
  let _nbMapaPedido = false;
  function renderNoblePlano() {
    const box = document.getElementById('twmgr-nb-lista'); if (!box) return;
    // O mapa dá nome/pontos/id do alvo pro link. É assíncrono, então a 1ª pintura sai sem ele e
    // um único redesenho preenche — segurar a tabela esperando o village.txt seria pior.
    if (!_nbVidPorCoord && !_nbMapaPedido) {
      _nbMapaPedido = true;
      nobleMapaCarregar().then(() => renderNoblePlano()).catch(() => {});
    }
    const alvos = config.noble.alvos || [], plano = config.noble.plano || [];
    if (!alvos.length) {
      box.innerHTML = '<div style="color:#8a7340;text-align:center;padding:10px;font-size:10px">— nenhum alvo na lista —</div>';
      return;
    }
    const tpls = nobleOrdemIds();
    const porCoord = {}; plano.forEach((p) => { porCoord[p.coord] = p; });
    // A ORDEM DO ARRAY É A FILA — FIFO. Coordenada colada depois entra atrás; as setas movem o
    // alvo no próprio array. Não existe campo "posição" separado justamente pra ele não poder
    // dessincronizar da ordem que o motor percorre.
    //
    // A coluna Def. saiu: a premissa do módulo (decisão do usuário) é que o alvo está vazio, e
    // uma coluna de defesa sempre zerada só roubava largura das que decidem.
    let pos = 0;
    box.innerHTML = '<table class="twmgr-bld-tab twmgr-nb-tab"><thead><tr>' +
      '<th style="width:34px" title="Ordem na fila — uma aldeia é noblada por vez">Fila</th>' +
      '<th>Alvo</th><th>Modelo</th>' +
      '<th style="width:36px" title="Lealdade de hoje: a do último relatório, projetada pra agora com a regeneração">Leald.</th>' +
      '<th style="width:30px" title="Comandos meus com nobre a caminho">Atks</th>' +
      '<th style="width:36px" title="Lealdade na hora em que o próximo nobre chegaria — já descontando os ataques no ar e somando a regeneração até lá">Prev.</th>' +
      '<th>Estado</th><th style="width:20px"></th></tr></thead><tbody>' +
      alvos.map((a, i) => {
        const p = porCoord[a.coord] || {};
        const rel = (config.noble.relatorios || {})[a.coord] || {};
        const fim = a.noblada || a.perdida;
        // Em modo prioridade mostra QUAL modelo o plano acabou escolhendo -- sem isso o usuario
        // ve "seguir ordem" e nao tem como saber o que vai sair.
        const escolhido = (!a.tpl && p.tplNome)
          ? '<div class="sub" style="color:#a07a42">→ ' + esc(p.tplNome) + '</div>' : '';
        const sel = '<select class="twmgr-nb-tpl twmgr-inp" data-coord="' + esc(a.coord) + '">'
          + '<option value=""' + (!a.tpl ? ' selected' : '') + '>⇅ ordem</option>'
          + tpls.map((id) => '<option value="' + esc(id) + '"' + (id === a.tpl ? ' selected' : '') + '>'
            + esc(config.noble.templates[id].name || id) + '</option>').join('') + '</select>' + escolhido;
        // Alvo resolvido não ocupa número: a numeração é da fila de verdade.
        const filaCel = fim
          ? '<span style="color:#8a7340">—</span>'
          : '<b>' + String(++pos).padStart(2, '0') + '</b><div class="sub">'
            + (i > 0 ? '<a class="twmgr-nb-up" data-coord="' + esc(a.coord) + '" title="subir na fila">▲</a>' : '')
            + (i < alvos.length - 1 ? '<a class="twmgr-nb-dn" data-coord="' + esc(a.coord) + '" title="descer na fila">▼</a>' : '')
            + '</div>';
        // Coordenada vira link pra ficha da aldeia (mesma tela que o módulo já lê pros comandos),
        // com nome e pontuação embaixo — dá pra conferir o alvo sem sair do painel.
        const mv = nobleInfoAlvo(a.coord);
        const alvoCel = (mv
            ? '<a href="/game.php?village=' + CUR_VID + '&screen=info_village&id=' + esc(String(mv.vid)) + '"'
              + ' title="abrir a ficha da aldeia">' + esc(a.coord) + '</a>'
            : '<b>' + esc(a.coord) + '</b>')
          + '<div class="sub">'
          + (mv && mv.name ? esc(mv.name) + (mv.points ? ' · ' + fmtN(mv.points) + ' pts' : '') + (rel.dono ? ' · ' : '') : '')
          + (rel.dono ? esc(rel.dono) : (mv && mv.name ? '' : '—')) + '</div>';
        const atual = nobleLealdadeAgora(a.coord);
        const prev = (p.prevista !== undefined) ? p.prevista : nobleLealdadePrevista(a.coord, a.ultDur);
        const dicaAtual = rel.lealdade != null
          ? 'medida ' + nobleQuandoTxt(nobleLealdadeAt(rel)) + ': caiu de ' + rel.de + ' para ' + rel.lealdade : '';
        const dicaPrev = a.ultDur != null
          ? 'projetada pra daqui a ' + fmtDur(a.ultDur) + ', que é a viagem do próximo nobre'
          : 'sem viagem medida ainda — projetada só até a última chegada marcada';
        const voando = nobleEmVoo(a.coord);
        const detVoo = nobleEmVooDetalhe(a.coord);
        // Número clicável: abre a caixa com QUEM está mandando / vai mandar. O tooltip já
        // separa voando de pousado, porque o total sozinho mentia ("3" com 1 nobre indo).
        const atksCel = voando
          ? '<a class="twmgr-nb-quem" data-coord="' + esc(a.coord) + '" style="cursor:pointer;color:#3f8f52;font-weight:700" ' +
            'title="' + esc(nobleTxtVoo(a.coord)) + ' — clique pra ver de quais aldeias">' + voando +
            (detVoo.pousados ? '<span style="color:#a07a42">*</span>' : '') + '</a>'
          : '<a class="twmgr-nb-quem" data-coord="' + esc(a.coord) + '" style="cursor:pointer;color:#8a7340" title="ver de quais aldeias sai o nobre">—</a>';
        // O estado é SÓ de quem entrou no processo. Quem espera a vez fica em "Aguardando".
        const chave = fim ? (a.noblada ? 'noblada' : 'perdida') : (p.estado || 'aguardando');
        const E = NB_ESTADOS[chave] || NB_ESTADOS.aguardando;
        let sub = '';
        if (chave === 'enviados' && p.envios && p.envios.length) {
          sub = 'chega em ' + p.envios.map((e) => fmtDur(e.durSec)).join(' / ');
        } else if (chave === 'recrutando' && p.prontoEm) {
          sub = '1º às ' + new Date(p.prontoEm).toLocaleTimeString('pt-BR');
        } else if (chave === 'perdida') {
          sub = (rel.donoAnterior || '?') + ' → ' + (rel.dono || '?');
        } else if (!fim && chave !== 'aguardando' && p.motivo) sub = p.motivo;
        const estado = '<b style="color:' + E.c + '">' + esc(E.t) + '</b>'
          + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '')
          + (p.pronto ? '<div class="sub"><a class="twmgr-nb-fire" data-coord="' + esc(a.coord) + '">Enviar agora</a></div>' : '');
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '"' + (fim ? ' style="opacity:.6"' : '') + '>' +
          '<td>' + filaCel + '</td><td>' + alvoCel + '</td><td>' + sel + '</td>' +
          '<td>' + nobleLealdadeCel(atual, dicaAtual) + '</td>' +
          '<td>' + atksCel + '</td>' +
          '<td>' + nobleLealdadeCel(prev, dicaPrev) + '</td>' +
          '<td>' + estado + '</td>' +
          '<td><a class="twmgr-nb-rm" data-coord="' + esc(a.coord) + '" title="tirar da fila">✕</a></td></tr>' +
          (_nbQuemAberto === a.coord ? nobleLinhaQuem(a, p) : '');
      }).join('') + '</tbody></table>';
    const info = document.getElementById('twmgr-nb-info');
    if (info) {
      const p = config.noble.planoAt
        ? 'plano de ' + new Date(config.noble.planoAt).toLocaleTimeString('pt-BR') : 'sem plano ainda';
      info.textContent = pos + ' na fila · ' + p;
    }
  }

  // Tabela da sub-aba Pós-conquista: um alvo por linha, com o que aplicar quando ele cair.
  // Reusa os grupos já carregados em _nbGrupos pra não refazer o fetch por linha.
  let _nbGrupos = [];
  function renderNoblePos() {
    const box = document.getElementById('twmgr-nb-poslista'); if (!box) return;
    // Sem o inventário em mão os ícones sairiam como "2/4"; carrega uma vez e redesenha.
    if (_nbBandeiras === null) {
      _nbBandeiras = [];
      nobleLerBandeiras(true).then(() => { renderNoblePos(); nobleRenderBandPadrao(); }).catch(() => {});
    }
    // Antes do early-return abaixo: o histórico existe mesmo com a fila vazia — aliás, é
    // justamente aí que ele importa.
    renderNobleConquistadas();
    const alvos = config.noble.alvos || [];
    if (!alvos.length) {
      box.innerHTML = '<div style="color:#8a7340;text-align:center;padding:10px;font-size:10px">— nenhum alvo na lista —</div>';
      return;
    }
    const opts = (sel) => '<option value=""' + (!sel ? ' selected' : '') + '>— nenhum —</option>'
      + _nbGrupos.map((g) => '<option value="' + esc(String(g.id)) + '"'
        + (String(g.id) === String(sel) ? ' selected' : '') + '>' + esc(g.name || g.id) + '</option>').join('');
    box.innerHTML = '<table class="twmgr-bld-tab twmgr-nb-tab"><thead><tr>' +
      '<th>Alvo</th><th>Grupo</th><th>Bandeira</th><th>Estado</th></tr></thead><tbody>' +
      alvos.map((a, i) => {
        const cfg = noblePosDoAlvo(a.coord);
        const herdaG = (a.posGrupoId == null), herdaB = (a.posBandTipo == null);
        const feito = config.noble.posFeitos[a.coord];
        const l = nobleLealdadeAgora(a.coord);
        const estado = feito ? '<b style="color:#3f8f52">aplicado</b>'
          : (l != null && l <= 0) ? '<span style="color:#b5651d">conquistada, aguardando</span>'
          : '<span style="color:#8a7340">—</span>';
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">' +
          '<td><b>' + esc(a.coord) + '</b></td>' +
          '<td><select class="twmgr-nb-pgrp twmgr-inp" data-coord="' + esc(a.coord) + '">' + opts(cfg.gid) + '</select>'
            + (herdaG ? '<div class="sub">padrão</div>' : '') + '</td>' +
          '<td>' + nobleBandBtn(a.coord, cfg.bandTipo, cfg.bandNivel)
            + (herdaB ? '<div class="sub">padrão</div>' : '') + '</td>' +
          '<td>' + estado + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  // Tabela do HISTÓRICO. Separada da de cima de propósito: aquela é sobre alvos que ainda vão
  // cair (pré-configuração), esta é sobre aldeias que já são suas. Antes esta não existia, e a
  // aldeia conquistada sumia da tela 30 min depois levando junto a única forma de pôr bandeira.
  function renderNobleConquistadas() {
    const box = document.getElementById('twmgr-nb-conqlista'); if (!box) return;
    const lista = config.noble.conquistadas || [];
    if (!lista.length) {
      box.innerHTML = '<div style="color:#8a7340;text-align:center;padding:8px;font-size:10px">'
        + '— nenhuma conquista registrada ainda. A partir de agora cada aldeia tomada entra aqui. —</div>';
      return;
    }
    box.innerHTML = '<table class="twmgr-bld-tab twmgr-nb-tab"><thead><tr>' +
      '<th>Aldeia</th><th style="width:78px">quando</th><th style="width:52px" title="nobres que este módulo mandou pra ela">custo</th>' +
      '<th style="width:88px">Grupo</th><th style="width:74px">Bandeira</th><th style="width:92px"></th></tr></thead><tbody>' +
      lista.map((c, i) => {
        const feito = config.noble.posFeitos[c.coord];
        const g = _nbGrupos.find((x) => String(x.id) === String(c.gid));
        const dias = Math.floor((Date.now() - c.at) / 86400000);
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">' +
          '<td>' + (c.vid ? '<a href="/game.php?village=' + esc(String(c.vid)) + '&screen=overview" target="_blank" style="color:#5c4423"><b>'
              + esc(c.nome) + '</b></a>' : '<b>' + esc(c.nome) + '</b>') +
            ' <span style="color:#8a7340">' + esc(c.coord) + '</span></td>' +
          '<td style="color:#8a7340">' + new Date(c.at).toLocaleDateString('pt-BR')
            + (dias > 0 ? ' <span title="' + dias + ' dia(s) atrás">(' + dias + 'd)</span>' : '') + '</td>' +
          '<td title="' + esc((c.origens || []).map((o) => o.n + '× ' + o.nome).join(', ') || 'origem não registrada') + '">'
            + (c.nobres ? '<b>' + c.nobres + '</b>👑' : '<span style="color:#8a7340">—</span>') + '</td>' +
          '<td style="color:#6f6153">' + esc(g ? (g.name || g.id) : (c.gid ? String(c.gid) : '—')) + '</td>' +
          '<td>' + (c.bandTipo ? esc(String(c.bandTipo)) + ' nv' + (c.bandNivel || 1) : '<span style="color:#8a7340">—</span>') + '</td>' +
          '<td>' + (feito
            ? '<span style="color:#3f8f52" title="aplicado em ' + new Date(feito).toLocaleString('pt-BR') + '">✔ aplicado</span>'
            : '<button class="twmgr-btn twmgr-ghost twmgr-nb-posgo" data-coord="' + esc(c.coord) + '" style="padding:2px 7px;font-size:10px">aplicar agora</button>')
          + '</td></tr>';
      }).join('') + '</tbody></table>';
    box.querySelectorAll('.twmgr-nb-posgo').forEach((b) => b.addEventListener('click', async () => {
      const coord = b.getAttribute('data-coord');
      const c = (config.noble.conquistadas || []).find((x) => x.coord === coord); if (!c) return;
      if (!c.gid && !c.bandTipo) { alert('Essa aldeia não tem grupo nem bandeira definidos — o alvo caiu antes de você configurar.'); return; }
      b.disabled = true; b.textContent = 'aplicando…';
      try {
        const todas = await getAllVillagesCached(true);
        const v = (todas || []).find((x) => (x.coord || '') === coord);
        if (!v) throw new Error('não achei essa aldeia na sua lista');
        const feito = await nobleAplicarPos(c, v, true);   // forçado: o clique é a intenção
        if (!feito.length) throw new Error('nada foi aplicado — veja o log');
        save();
      } catch (e) {
        alert('Não deu: ' + (e.message || e));
      }
      renderNobleConquistadas();
    }));
  }
  // Botão da célula. Um traço cinza não parecia clicável — o usuário achou que estava quebrado.
  // Agora tem cara de botão: borda tracejada e a palavra "escolher" quando está vazio, borda
  // sólida com o ícone quando tem bandeira.
  function nobleBandBtn(coord, tipo, nivel) {
    const b = (_nbBandeiras || []).find((x) => x.tipo === String(tipo) && x.nivel === (nivel || 1));
    const dentro = b
      ? '<span class="twmgr-flag" style="background-image:url(\'' + esc(b.img) + '\')"></span>'
        + '<em>nível ' + b.nivel + '</em>'
      : (tipo ? '<em>' + esc(tipo) + '/' + (nivel || 1) + '</em>' : '<em>escolher</em>');
    return '<a class="twmgr-nb-pband' + (b ? ' tem' : '') + '" data-coord="' + esc(coord) + '"'
      + ' title="' + (b ? esc(b.desc || '') : 'escolher bandeira') + '">' + dentro + '</a>';
  }

  // Grade de escolha. Abre embaixo da tabela em vez de num popup: o painel já é flutuante, e
  // popup dentro de popup fica preso na borda quando a tabela está no fim da rolagem.
  async function nobleAbrirPicker(coord) {
    const box = document.getElementById('twmgr-nb-flagpick'); if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '<div style="font-size:10px;color:#8a7340;padding:6px">lendo as bandeiras…</div>';
    let lista = [];
    try { lista = await nobleLerBandeiras(); }
    catch (e) {
      box.innerHTML = '<div style="font-size:10px;color:#b03030;padding:6px">não consegui ler a tela de bandeiras (' + esc(String(e.message || e)) + ')</div>';
      return;
    }
    if (!lista.length) {
      box.innerHTML = '<div style="font-size:10px;color:#8a7340;padding:6px">nenhuma bandeira na conta.</div>';
      return;
    }
    // AGRUPA POR TIPO. A conta do usuário tem 6 tipos × 9 níveis = 54 ícones; soltos numa grade
    // única não dá pra achar nada. O título do grupo é a descrição do efeito sem o percentual
    // ("+8% na produção de recursos" → "na produção de recursos"), que é a única parte que não
    // muda entre os níveis do mesmo tipo.
    const porTipo = {};
    lista.forEach((b) => { (porTipo[b.tipo] = porTipo[b.tipo] || []).push(b); });
    const rotulo = (bs) => {
      const d = (bs.find((x) => x.desc) || {}).desc || '';
      const semPct = d.replace(/^\s*[+\-]?\s*[\d.,]+\s*%\s*/, '').trim();
      return semPct || ('tipo ' + bs[0].tipo);
    };
    const alvo = coord === '*' ? 'padrão' : coord;
    box.innerHTML = '<div style="font-size:10px;color:#6f6153;margin-bottom:6px">Bandeira para <b>' + esc(alvo) + '</b>'
      + ' · <a class="twmgr-nb-flagnone" data-coord="' + esc(coord) + '">nenhuma</a>'
      + ' · <a class="twmgr-nb-flagfech">fechar</a></div>'
      + Object.keys(porTipo).map((t) => {
        const bs = porTipo[t];
        return '<div class="twmgr-flaggrp">' + esc(rotulo(bs)) + '</div>'
          + '<div class="twmgr-flaggrid">' + bs.map((b) =>
            '<a class="twmgr-nb-flagsel" data-coord="' + esc(coord) + '" data-tipo="' + esc(b.tipo) + '"'
            + ' data-nivel="' + b.nivel + '" title="' + esc(b.desc || (b.tipo + '/' + b.nivel)) + '">'
            + '<span class="twmgr-flag" style="background-image:url(\'' + esc(b.img) + '\')"></span>'
            + '<em>nível ' + b.nivel + '</em></a>').join('') + '</div>';
      }).join('');
  }

  function bindNoblePosHandlers() {

    const box = document.getElementById('twmgr-nb-poslista'); if (!box) return;
    box.addEventListener('change', (e) => {
      const el = e.target, coord = el.getAttribute && el.getAttribute('data-coord');
      if (!coord) return;
      const a = (config.noble.alvos || []).find((x) => x.coord === coord); if (!a) return;
      if (el.classList.contains('twmgr-nb-pgrp')) a.posGrupoId = el.value;
      save(); renderNoblePos();
    });
    // Cliques do seletor de bandeira, delegados porque a grade é redesenhada a cada abertura.
    //
    // Prende na SUB-ABA inteira, não no pai da tabela: o botão da bandeira padrão vive na seção
    // "Quando a aldeia cair", fora da tabela, e com o listener no pai dela o clique no padrão
    // simplesmente não chegava — o botão parecia morto.
    const pai = document.getElementById('twmgr-sub-pos') || box.parentNode || box;
    pai.addEventListener('click', (e) => {
      const el = e.target.closest ? e.target.closest('a') : null;
      if (!el) return;
      const coord = el.getAttribute('data-coord');
      if (el.classList.contains('twmgr-nb-pband')) { nobleAbrirPicker(coord); return; }
      if (el.classList.contains('twmgr-nb-flagfech')) {
        const g = document.getElementById('twmgr-nb-flagpick'); if (g) g.style.display = 'none';
        return;
      }
      const escolheu = el.classList.contains('twmgr-nb-flagsel');
      const limpou = el.classList.contains('twmgr-nb-flagnone');
      if (!escolheu && !limpou) return;
      const tipo = escolheu ? el.getAttribute('data-tipo') : '';
      const nivel = escolheu ? parseInt(el.getAttribute('data-nivel'), 10) : 1;
      if (coord === '*') {
        config.noble.posBandeiraTipo = tipo; config.noble.posBandeiraNivel = nivel;
      } else {
        const a = (config.noble.alvos || []).find((x) => x.coord === coord); if (!a) return;
        a.posBandTipo = tipo; a.posBandNivel = nivel;
      }
      const g = document.getElementById('twmgr-nb-flagpick'); if (g) g.style.display = 'none';
      save(); renderNoblePos(); nobleRenderBandPadrao();
    });
  }

  // O padrão global usa o mesmo seletor, com coord '*'.
  function nobleRenderBandPadrao() {
    const el = document.getElementById('twmgr-nb-bandpad'); if (!el) return;
    el.innerHTML = nobleBandBtn('*', config.noble.posBandeiraTipo, config.noble.posBandeiraNivel);
  }
  function bindNobleHandlers() {

    const box = document.getElementById('twmgr-nb-lista'); if (!box) return;
    box.addEventListener('change', (e) => {
      const el = e.target;
      if (!el.classList || !el.classList.contains('twmgr-nb-tpl')) return;
      const coord = el.getAttribute('data-coord');
      const a = (config.noble.alvos || []).find((x) => x.coord === coord);
      if (!a) return;
      a.tpl = el.value;                  // '' = seguir a ordem de prioridade
      // Modelo trocado invalida o plano daquele alvo: as regras mudaram, o plano velho mentiria.
      config.noble.plano = (config.noble.plano || []).filter((p) => p.coord !== coord);
      save(); renderNoblePlano();
    });
    box.addEventListener('click', (e) => {
      const el = e.target, coord = el.getAttribute && el.getAttribute('data-coord');
      if (!coord) return;
      if (el.classList.contains('twmgr-nb-quem')) {
        _nbQuemAberto = (_nbQuemAberto === coord) ? null : coord;   // clicar de novo fecha
        _nbCand = null; _nbCandCoord = null;
        renderNoblePlano();                                          // desenha já, com "carregando…"
        if (_nbQuemAberto) {
          const alvo = (config.noble.alvos || []).find((z) => z.coord === coord);
          if (alvo) {
            nobleCandidatos(alvo).then((lista) => {
              if (_nbQuemAberto !== coord) return;                   // fechou/trocou no meio: descarta
              _nbCand = lista; _nbCandCoord = coord; renderNoblePlano();
            }).catch((e) => {
              if (_nbQuemAberto !== coord) return;
              _nbCand = []; _nbCandCoord = coord; renderNoblePlano();
              pushLog('Noblar: não consegui listar as aldeias com nobre (' + (e.message || e) + ').', 'err', 'noble');
            });
          }
        }
        return;
      }
      // Reordenar a fila = mover no PRÓPRIO array de alvos, que é o que o motor percorre.
      // Guardar um número de posição à parte abriria a porta pra tela e motor discordarem.
      if (el.classList.contains('twmgr-nb-up') || el.classList.contains('twmgr-nb-dn')) {
        const arr = config.noble.alvos || [];
        const i = arr.findIndex((a) => a.coord === coord);
        const j = i + (el.classList.contains('twmgr-nb-up') ? -1 : 1);
        if (i < 0 || j < 0 || j >= arr.length) return;
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        // O plano velho foi montado com a fila antiga: quem era o da vez pode não ser mais.
        config.noble.plano = [];
        save(); renderNoblePlano(); renderNoblePos();
        return;
      }
      if (el.classList.contains('twmgr-nb-fire')) nobleDispararAlvo(coord);
      else if (el.classList.contains('twmgr-nb-rm')) {
        config.noble.alvos = (config.noble.alvos || []).filter((a) => a.coord !== coord);
        config.noble.plano = (config.noble.plano || []).filter((p) => p.coord !== coord);
        save(); renderNoblePlano(); renderNoblePos(); refreshCards('noble');
      }
    });
  }
  // ===== Modelos de envio =====
  // Mesmo desenho dos modelos de Construções/Pesquisa: um select com CRUD, e o alvo aponta pro id.
  let _nbTplAtivo = '';
  function nobleTplIds() { return Object.keys(config.noble.templates || {}); }
  function nobleTplAtivo() {
    const ids = nobleTplIds();
    if (ids.indexOf(_nbTplAtivo) < 0) _nbTplAtivo = ids[0] || '';
    return config.noble.templates[_nbTplAtivo] || null;
  }
  // Lista os modelos NA ORDEM de prioridade, numerados. O numero e o unico jeito de o usuario
  // ver que a ordem mudou depois de clicar nas setas -- o nome do modelo nao muda.
  function nobleOrdemIds() {
    const ord = (config.noble.ordem || []).filter((id) => (config.noble.templates || {})[id]);
    nobleTplIds().forEach((id) => { if (ord.indexOf(id) < 0) ord.push(id); });
    return ord;
  }
  // Resumo da escolta pro chip: "50 Bárb. · 4👑". E o que deixa a lista de modelos legivel sem
  // abrir cada um -- que era o problema do <select>, onde so cabia o nome.
  // O chip descreve UM comando (escolta + 1 nobre) e quantos comandos saem. Antes dizia
  // "4 nobres", o que dava a entender que iam todos juntos.
  function nobleChipTxt(t) {
    const ks = Object.keys((t && t.escolta) || {});
    const esc2 = ks.length ? ks.map((u) => t.escolta[u] + ' ' + unitPt(u)).join(' + ') : 'sem escolta';
    return esc2 + ' + 1👑 × ' + (t.nobres || 4);
  }
  function nobleFillTplSel() {
    const box = document.getElementById('twmgr-nb-chips'); if (!box) return;
    const ids = nobleOrdemIds();
    if (ids.indexOf(_nbTplAtivo) < 0) _nbTplAtivo = ids[0] || '';
    box.innerHTML = ids.map((id, i) => {
      const t = config.noble.templates[id];
      return '<span class="twmgr-chip' + (id === _nbTplAtivo ? ' on' : '') + '" data-id="' + esc(id) + '"'
        + ' title="' + esc(t.name || id) + ' — ' + esc(nobleChipTxt(t)) + '">'
        + '<b>' + (i + 1) + '</b>' + esc(nobleChipTxt(t)) + '</span>';
    }).join('') + '<span class="twmgr-chip twmgr-chip-add" title="criar modelo">✚</span>';
    const nm = document.getElementById('twmgr-nb-tpl-nome');
    if (nm) {
      const t = config.noble.templates[_nbTplAtivo];
      const pos = ids.indexOf(_nbTplAtivo) + 1;
      nm.textContent = t ? (pos + '. ' + (t.name || _nbTplAtivo)) : '—';
    }
  }
  // Sobe/desce o modelo ativo na ordem de prioridade.
  function nobleMoverModelo(passo) {
    const ord = nobleOrdemIds();
    const i = ord.indexOf(_nbTplAtivo);
    const j = i + passo;
    if (i < 0 || j < 0 || j >= ord.length) return;
    ord.splice(j, 0, ord.splice(i, 1)[0]);
    config.noble.ordem = ord;
    // A ordem mudou: o plano de quem segue a prioridade pode ter outro modelo agora.
    config.noble.plano = (config.noble.plano || []).filter((p) => {
      const a = (config.noble.alvos || []).find((x) => x.coord === p.coord);
      return a && a.tpl;                 // alvo fixado num modelo nao e afetado
    });
    save(); nobleFillTplSel(); renderNoblePlano();
  }
  // Editor: grade no formato do jogo (icone em cima, campo embaixo). Nobre aparece como coluna
  // TRAVADA -- mostra que ele vai junto, sem deixar edita-lo aqui e contar nobre duas vezes.
  function nobleRenderTplEditor() {
    const t = nobleTplAtivo();
    const g = (id) => document.getElementById(id);
    if (g('twmgr-nb-nob')) g('twmgr-nb-nob').value = t ? t.nobres : 4;
    if (g('twmgr-nb-horas')) g('twmgr-nb-horas').value = t ? t.maxHoras : 6;
    if (g('twmgr-nb-nt')) g('twmgr-nb-nt').checked = !!(t && t.soNT);
    const box = g('twmgr-nb-esc'); if (!box) return;
    box.innerHTML = unitsDoMundo().filter((u) => NOBLE_ESCOLTA.indexOf(u[0]) >= 0 || u[0] === 'snob').map((u) => {
      const nobre = (u[0] === 'snob');
      // Nobre trava em 1 e nao em `t.nobres`: cada COMANDO leva um so. O campo "Nobres por alvo"
      // diz quantos comandos sair, nao quantos nobres cabem num.
      const val = nobre ? 1 : (((t && t.escolta) || {})[u[0]] || '');
      return '<div' + (nobre ? ' class="lock"' : '') + '>'
        + '<div class="h" title="' + esc(u[1]) + '">'
        + '<span class="unit_sprite unit_sprite_smaller ' + u[0] + '"></span>'
        + '<em>' + esc(u[1]) + '</em></div>'
        + '<input class="twmgr-nb-escq twmgr-inp" data-unit="' + u[0] + '" type="number" min="0" step="1"'
        + (nobre ? ' disabled title="cada comando leva exatamente 1 nobre"' : '')
        + ' value="' + val + '"></div>';
    }).join('');
  }
  function nobleLerTplEditor() {
    const t = nobleTplAtivo(); if (!t) return;
    const g = (id) => document.getElementById(id);
    if (g('twmgr-nb-nob')) t.nobres = Math.max(1, Math.min(8, parseInt(g('twmgr-nb-nob').value, 10) || 4));
    if (g('twmgr-nb-horas')) t.maxHoras = Math.max(1, parseInt(g('twmgr-nb-horas').value, 10) || 6);
    if (g('twmgr-nb-nt')) t.soNT = g('twmgr-nb-nt').checked;
    const esc2 = {};
    document.querySelectorAll('.twmgr-nb-escq').forEach((i) => {
      const u = i.getAttribute('data-unit');
      if (u === 'snob') return;          // coluna travada: quem manda e o campo Nobres por alvo
      const q = Math.max(0, parseInt(i.value, 10) || 0);
      if (q > 0) esc2[u] = q;
    });
    t.escolta = esc2;
  }
  function nobleSwitchTpl(id) {
    if (!config.noble.templates[id]) return;
    // Salva o que estava na tela ANTES de trocar, senao a edicao do modelo anterior se perde
    // ao clicar no chip do lado.
    nobleLerTplEditor(); save();
    _nbTplAtivo = id;
    nobleFillTplSel(); nobleRenderTplEditor();
  }
  function nobleNovoModelo() {
    const nome = prompt('Nome do modelo de envio:', 'Nobre + nuke');
    if (!nome || !nome.trim()) return;
    const at = nobleTplAtivo();
    const copiar = at && confirm('Copiar as regras de "' + at.name + '"?\n\nOK = copiar   -   Cancelar = do zero');
    const id = 't' + Date.now().toString(36);
    config.noble.templates[id] = copiar
      ? { name: nome.trim().slice(0, 40), nobres: at.nobres, maxHoras: at.maxHoras, soNT: at.soNT,
          escolta: JSON.parse(JSON.stringify(at.escolta || {})) }
      : defNobleTpl(nome.trim().slice(0, 40));
    _nbTplAtivo = id;
    config.noble.ordem = nobleOrdemIds();      // entra no fim da prioridade
    save(); nobleFillTplSel(); nobleRenderTplEditor(); renderNoblePlano();
  }
  function nobleRenomearModelo() {
    const t = nobleTplAtivo(); if (!t) return;
    const nome = prompt('Novo nome:', t.name);
    if (!nome || !nome.trim()) return;
    t.name = nome.trim().slice(0, 40);
    save(); nobleFillTplSel(); renderNoblePlano();
  }
  function nobleApagarModelo() {
    const t = nobleTplAtivo(); if (!t) return;
    if (nobleTplIds().length < 2) { alert('Precisa sobrar pelo menos um modelo.'); return; }
    const usando = (config.noble.alvos || []).filter((a) => a.tpl === _nbTplAtivo);
    if (!confirm('Apagar o modelo "' + t.name + '"?'
      + (usando.length ? '\n\n' + usando.length + ' alvo(s) usam ele e vão cair no primeiro modelo da lista.' : ''))) return;
    delete config.noble.templates[_nbTplAtivo];
    config.noble.ordem = (config.noble.ordem || []).filter((x) => x !== _nbTplAtivo);
    _nbTplAtivo = nobleOrdemIds()[0];
    usando.forEach((a) => { a.tpl = ''; });   // volta pra ordem de prioridade
    config.noble.plano = [];   // as regras mudaram pra esses alvos; plano velho mentiria
    save(); nobleFillTplSel(); nobleRenderTplEditor(); renderNoblePlano();
  }

  function readNobleCfg() {
    const c = config.noble, g = (id) => document.getElementById(id);
    nobleLerTplEditor();
    if (g('twmgr-nb-int')) c.interval = Math.max(1, parseInt(g('twmgr-nb-int').value, 10) || 15) * 60;
    if (g('twmgr-nb-prod')) c.produzir = g('twmgr-nb-prod').checked;
    if (g('twmgr-nb-paralelo')) c.paralelo = g('twmgr-nb-paralelo').checked;
    if (g('twmgr-nb-parcial')) c.parcialSempre = g('twmgr-nb-parcial').checked;
    if (g('twmgr-nb-rel')) c.lerRelatorios = g('twmgr-nb-rel').checked;
    if (g('twmgr-nb-lpa')) c.lealdadePorAtk = Math.max(1, Math.min(100, parseInt(g('twmgr-nb-lpa').value, 10) || 25));
    if (g('twmgr-nb-regen')) c.lealdadeRegen = Math.max(0, Math.min(10, parseFloat(g('twmgr-nb-regen').value) || 0));
    if (g('twmgr-nb-cunhar')) c.cunhar = g('twmgr-nb-cunhar').checked;
    if (g('twmgr-nb-cunhar-ate')) c.cunharAte = Math.max(1, Math.min(8, parseInt(g('twmgr-nb-cunhar-ate').value, 10) || 4));
    if (g('twmgr-nb-cunhar-n')) c.cunharMaxAldeias = Math.max(1, Math.min(12, parseInt(g('twmgr-nb-cunhar-n').value, 10) || 3));
    if (g('twmgr-nb-posgrupo')) c.posGrupo = g('twmgr-nb-posgrupo').checked;
    if (g('twmgr-nb-posgid')) c.posGrupoId = g('twmgr-nb-posgid').value;
    if (g('twmgr-nb-posband')) c.posBandeira = g('twmgr-nb-posband').checked;
    // Tipo/nível da bandeira não são mais campos de texto: quem grava é o seletor de ícones.


    save();
  }
  function setNobleStatus(on) { setBtnState('twmgr-nb-start', 'twmgr-nb-stop', on, '● Planejando', '▶ Planejar'); }
  function nobleStart() {
    readNobleCfg();
    if (!(config.noble.alvos || []).length) { pushLog('Noblar: adicione pelo menos um alvo.', 'err', 'noble'); return; }
    config.noble.running = true; config.noble.nextAt = 0; save();
    setNobleStatus(true);
    pushLog('Noblar iniciado — ' + config.noble.alvos.length + ' alvo(s). O disparo continua manual.', 'ok', 'noble');
    nobleTick();
  }
  function nobleStop() {
    readNobleCfg(); config.noble.running = false; save();
    clearTimeout(nobleTimer); setNobleStatus(false);
    pushLog('Noblar parado.', '', 'noble');
  }
