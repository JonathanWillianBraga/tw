  // ==================== BÁRBAROS DO MAPA (BM) ====================
  // Varre /map/village.txt, detecta bárbaros no range (padrão 20 campos), envia "ataque B"
  // (composição configurável) pra alvos NUNCA atacados ou há mais de N dias.
  let _mapVillagesCache = null, _mapVillagesCacheAt = 0;
  async function getMapVillages(forceRefresh) {
    const now = Date.now();
    if (!forceRefresh && _mapVillagesCache && (now - _mapVillagesCacheAt < 6 * 3600 * 1000)) return _mapVillagesCache;
    // Sobrevive ao F5 SE couber: esta lista tem o mundo inteiro com nomes e pode passar do teto
    // do helper. Quando nao couber, ele registra e a leitura continua em memoria — o modulo
    // funciona igual, so paga o download de novo.
    if (!forceRefresh) {
      // Idade gravada, nao agora - senao o TTL de 6h recomeca a cada reload e nunca expira.
      const o = cacheLerBruto('mapa', 6 * 3600 * 1000);
      if (o && o.v && o.v.length) { _mapVillagesCache = o.v; _mapVillagesCacheAt = o.at; return o.v; }
    }
    const res = await fetch('/map/village.txt', { credentials: 'include' });
    const txt = await res.text();
    if (/^\s*<!doctype|^\s*<html/i.test(txt.slice(0, 60))) throw new Error('village.txt retornou HTML (sessão expirada ou bloqueio)');
    const arr = [];
    txt.split('\n').forEach((line) => {
      const f = line.split(',');
      if (f.length < 5) return;   // toleramos linhas curtas de mundos antigos
      const vid = (f[0] || '').trim(), x = parseInt(f[2], 10), y = parseInt(f[3], 10);
      const pts = parseInt(f[5] || '0', 10);
      if (!vid || isNaN(x) || isNaN(y)) return;
      let name = ''; try { name = decodeURIComponent((f[1] || '').replace(/\+/g, ' ')); } catch (e) { name = f[1] || ''; }
      arr.push({ vid: vid, x: x, y: y, player: (f[4] || '0').trim(), points: isNaN(pts) ? 0 : pts, name: name });
    });
    _mapVillagesCache = arr; _mapVillagesCacheAt = now;
    cacheGravar('mapa', arr);
    return arr;
  }
  function fieldDist(x1, y1, x2, y2) { return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)); }
  function mapUnitsTotal(units) { let t = 0; UNITS.forEach((p) => { t += (units[p[0]] || 0); }); return t; }
  function mapUnitsDesc(units) { return UNITS.filter((p) => (units[p[0]] || 0) > 0).map((p) => p[0] + '=' + units[p[0]]).join(', ') || '(vazio)'; }

  // Estados de conhecimento por aldeia. Guardados como número — com milhares de aldeias
  // no raio, a diferença entre gravar um código e gravar um objeto é centenas de KB no
  // localStorage, que tem limite de ~5MB.
  const MAP_INTEL = {
    OK: 1,        // tenho relatório com dados: sei o que tem lá
    VAZIO: 2,     // tenho relatório, mas veio sem informação (o explorador morreu)
    NADA: 3,      // nem aparece no assistente: não sei nada
    ROTA: 4,      // explorador a caminho agora
    BL_PERDA: 5,  // blacklist: perdi tropa
    BL_DEFESA: 6, // blacklist: tem defesa
  };
  const MAP_INTEL_COR = {
    1: '#3f8f52',   // verde   — explorado, sei o que tem
    2: '#8b5426',   // âmbar   — explorei e não vi nada
    3: '#9e8046',   // cinza   — buraco no meu conhecimento
    4: '#2f6f9e',   // azul    — explorador voando
    5: '#c9722a',   // laranja — perdi tropa
    6: '#c0483a',   // vermelho— tem defesa
  };
  const MAP_INTEL_NOME = {
    1: 'explorado', 2: 'explorei, sem info', 3: 'nunca explorado',
    4: 'explorador a caminho', 5: 'perdi tropa', 6: 'tem defesa',
  };

  // Quanto tempo esperar por um relatório antes de reexplorar o mesmo alvo. Explorador
  // voa, chega, e o relatório aparece: em 20 campos isso é questão de minutos. Sem esta
  // trava o ciclo seguinte reenviaria antes de a informação chegar, queimando tropa.
  const MAP_ESPERA_RELATORIO_MS = 45 * 60 * 1000;

  // Mantém as duas blacklists a partir do que o assistente mostra.
  //
  // PERDA: a cor do último saque. Vermelho = perdi tropa lá. Sai da lista sozinha quando
  // aparecer relatório verde, amarelo ou azul — que é o sinal de que o saque voltou bem.
  // DEFESA: entra por leitura de relatório (mapProcessarRelatorios), e NÃO sai sozinha —
  // tropa defensiva não some porque o próximo saque deu certo.
  function mapAtualizarBlacklists(sabido) {
    const cfg = config.map;
    let entrou = 0, saiu = 0;
    Object.keys(sabido).forEach((coord) => {
      const s = sabido[coord];
      if (s.color === 'red') {
        if (!cfg.blacklistPerda[coord]) { cfg.blacklistPerda[coord] = { at: Date.now(), vid: s.targetId }; entrou++; }
      } else if (s.color === 'green' || s.color === 'yellow' || s.color === 'blue') {
        if (cfg.blacklistPerda[coord]) { delete cfg.blacklistPerda[coord]; saiu++; }
      }
    });
    if (entrou) pushLog('🗺️ ' + entrou + ' aldeia(s) entraram na blacklist de tropa perdida (último saque veio vermelho).', '', 'map');
    if (saiu) pushLog('🗺️ ' + saiu + ' aldeia(s) saíram da blacklist de tropa perdida (saque voltou bem).', 'ok', 'map');
    if (entrou || saiu) save();
  }

  // Lê os relatórios de exploração novos e põe na blacklist quem tem defesa.
  // Uma requisição por relatório ainda não lido — por isso o registro do que já foi lido.
  async function mapProcessarRelatorios(sabido, limite) {
    const cfg = config.map;
    const pend = Object.keys(sabido).filter((coord) =>
      sabido[coord].reportId && !cfg.relatoriosLidos[sabido[coord].reportId] &&
      !cfg.blacklistDefesa[coord] && sabido[coord].temDados);
    if (!pend.length) return 0;
    let achou = 0, lidos = 0;
    for (const coord of pend.slice(0, limite || 20)) {
      if (devoParar('map')) break;
      const s = sabido[coord];
      let def;
      try { def = await getReportDefenseTotal(s.reportId); }
      catch (e) { continue; }   // não deu pra ler: NÃO marca como lido, tenta de novo depois
      cfg.relatoriosLidos[s.reportId] = 1; lidos++;
      if (def >= (cfg.defesaMin || 1)) {
        cfg.blacklistDefesa[coord] = { at: Date.now(), vid: s.targetId, defTotal: def, removido: false };
        achou++;
        pushLog('🛡️ ' + coord + ' tem defesa (' + def + ' unidades) — entrou na blacklist e sai da rota de exploração e de saque.', '', 'map');
        if (cfg.removerDoAssistente && s.targetId) {
          try { await mapApagarDoAssistente(s.targetId, coord); cfg.blacklistDefesa[coord].removido = true; }
          catch (e) { pushLog('🗑️ ' + coord + ': não consegui apagar do assistente (' + (e.message || e) + '). A blacklist continua valendo.', 'err', 'map'); }
          await sleep(400);
        }
      }
      await sleep(250);
    }
    if (lidos) { mapPodaRelatorios(); save(); }
    return achou;
  }
  // `relatoriosLidos` ganha uma entrada por relatório de exploração lido — e nunca perdia
  // nenhuma. Numa conta rodada isso e a estrutura que mais engorda o config (e o backup junto).
  //
  // Poda pelos MAIS NOVOS: id de relatório e crescente, entao os menores sao os mais velhos.
  // Ordena como NUMERO, nao como texto -- `.sort()` cru compara string, e "9" > "10", o que
  // jogaria fora justamente os recentes. O pior caso de podar demais e reler um relatório
  // (uma requisição), nunca uma decisao errada: quem manda na blacklist e `blacklistDefesa`,
  // que nao e tocada aqui.
  const MAP_RELS_TETO = 3000;
  function mapPodaRelatorios() {
    const cfg = config.map;
    const ids = Object.keys(cfg.relatoriosLidos || {});
    if (ids.length <= MAP_RELS_TETO) return 0;
    const fora = ids.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)).slice(0, ids.length - MAP_RELS_TETO);
    fora.forEach((k) => { delete cfg.relatoriosLidos[k]; });
    return fora.length;
  }

  // Apaga os relatórios de uma aldeia no jogo, o que a tira da listagem do assistente.
  //
  // A assinatura foi capturada da requisição real (interceptada e bloqueada, pra não
  // apagar nada durante a descoberta), porque eu não tinha como deduzi-la do fixture:
  //     POST screen=report&ajaxaction=delete_one&json=1&h=<csrf>
  //     body: id=<id da ALDEIA ALVO>   (não do relatório — o fixture confirma: o argumento
  //                                     de deleteReport(49269) casa com a linha village_49269)
  // "delete_one" é o nome deles; o efeito é apagar TODOS os relatórios daquela aldeia.
  //
  // NÃO TEM DESFAZER. Só roda com o interruptor ligado, e cada remoção vai pro log com a
  // coordenada — se um dia der errado, fica o registro do que foi tirado.
  async function mapApagarDoAssistente(targetId, coord) {
    const r = await fetch('/game.php?village=' + CUR_VID + '&screen=report&ajaxaction=delete_one&json=1&h=' + CSRF, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: 'id=' + encodeURIComponent(targetId),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    // Resposta é JSON. Se vier erro explícito, não considera apagado.
    try { const j = JSON.parse(txt); if (j && j.error) throw new Error(String(j.error).slice(0, 80)); } catch (e) { if (e instanceof SyntaxError) { /* não-JSON: segue */ } else throw e; }
    pushLog('🗑️ ' + coord + ' — relatórios apagados no jogo; saiu da listagem do assistente de saque.', '', 'map');
    return true;
  }

  // Bárbaro NOVO = vid que não estava no conjunto conhecido. Pega tanto aldeia que virou
  // bárbara quanto conta deletada. É o que faz o ciclo contínuo ter utilidade.
  function mapDetectarNovos(barbs, universo) {
    const cfg = config.map;
    const agora = Date.now();
    const primeiraVez = !Object.keys(cfg.barbConhecidos).length;
    const novos = [];
    barbs.forEach((b) => {
      if (!cfg.barbConhecidos[b.vid]) { cfg.barbConhecidos[b.vid] = agora; if (!primeiraVez) novos.push(b); }
    });
    // PODA. `barbConhecidos` so crescia: uma entrada por bárbaro ja visto na vida da conta, pra
    // sempre. Isso engorda o localStorage (e o backup, que carrega tudo) sem teto nenhum.
    //
    // O criterio e conservador de proposito: so sai vid que NAO EXISTE MAIS no village.txt, ou
    // seja, aldeia que sumiu do mundo. Podar por idade, ou pela lista JA FILTRADA de bárbaros,
    // seria errado -- `barbs` passa por minPoints/maxPoints, entao um bárbaro que so saiu da
    // janela de pontos voltaria a ser anunciado como NOVO quando reentrasse. Falso alarme e pior
    // que a gordura que a poda tira.
    if (universo && universo.length) {
      const existe = {}; universo.forEach((v) => { existe[v.vid] = 1; });
      let podados = 0;
      Object.keys(cfg.barbConhecidos).forEach((vid) => { if (!existe[vid]) { delete cfg.barbConhecidos[vid]; podados++; } });
      if (podados) pushLog('🗺️ Poda: ' + podados + ' bárbaro(s) que não existem mais saíram do registro.', '', 'map');
    }
    if (primeiraVez) pushLog('🗺️ Primeira leitura do mapa: ' + barbs.length + ' bárbaros registrados. A partir do próximo ciclo eu aviso o que for novo.', '', 'map');
    else if (novos.length) pushLog('🗺️ ' + novos.length + ' bárbaro(s) NOVO(S) desde a última leitura.', 'ok', 'map');
    save();
    return novos;
  }

  // Exploradores em casa de TODAS as aldeias, numa requisição só.
  //
  // A tela de coleta em massa devolve unit_counts_home de cada aldeia — a tropa em casa
  // inteira, não só as unidades de coleta. Ler de lá custa 1 requisição; ler aldeia por
  // aldeia custaria 43. É a leitura em massa que estava pendente da auditoria de terça.
  async function mapEspioesEmCasa() {
    // Paginado, 50 por página — ver o comentário em `scavLerPaginas`. Aqui o efeito era mais
    // silencioso ainda: as aldeias da página 2 em diante simplesmente não tinham explorador.
    const arr = (await scavLerPaginas()).arr;
    const out = {};
    arr.forEach((v) => {
      const bruto = parseInt((v.unit_counts_home || {}).spy, 10) || 0;
      const reservado = ((config.reservations || {})[String(v.village_id)] || {}).spy || 0;
      out[String(v.village_id)] = Math.max(0, bruto - reservado);
    });
    return out;
  }

  // Grava o estado de conhecimento de cada bárbaro DENTRO DO RAIO. Fora do raio não entra:
  // não é buraco no conhecimento, é lugar onde eu nem pretendo olhar — e guardar o mundo
  // inteiro estouraria o localStorage sem informar nada.
  function mapGravarIntel(barb, myV, sabido, attacking) {
    const cfg = config.map;
    const maxDist = cfg.maxDist || 20;
    const intel = {};
    let dentro = 0, conhecidas = 0;
    barb.forEach((b) => {
      const coord = b.x + '|' + b.y;
      let perto = false;
      for (const s of myV) { if (fieldDist(s.x, s.y, b.x, b.y) <= maxDist) { perto = true; break; } }
      if (!perto) return;
      dentro++;
      let cod;
      if (cfg.blacklistDefesa[coord]) cod = MAP_INTEL.BL_DEFESA;
      else if (cfg.blacklistPerda[coord]) cod = MAP_INTEL.BL_PERDA;
      else if (attacking.has(coord)) cod = MAP_INTEL.ROTA;
      else {
        const s = sabido[coord];
        cod = !s ? MAP_INTEL.NADA : (s.temDados ? MAP_INTEL.OK : MAP_INTEL.VAZIO);
      }
      if (cod === MAP_INTEL.OK || cod === MAP_INTEL.BL_DEFESA) conhecidas++;
      intel[coord] = cod;
    });
    cfg.intel = intel;
    cfg.intelAt = Date.now();
    save();
    return { dentro: dentro, conhecidas: conhecidas, pct: dentro ? Math.round(conhecidas * 100 / dentro) : 0 };
  }

  async function mapPlanTargets() {
    const cfg = config.map;
    let allV;
    try { allV = await getMapVillages(); }
    catch (e) { pushLog('BM: erro ao ler village.txt: ' + (e.message || e), 'err'); return null; }
    const barb = allV.filter((v) => (!cfg.onlyBarbarians || v.player === '0') && v.points >= (cfg.minPoints || 0) && v.points <= (cfg.maxPoints || 99999));
    const novos = mapDetectarNovos(barb, allV);
    const idNovo = {}; novos.forEach((b) => { idNovo[b.vid] = 1; });
    let mine;
    try {
      if (cfg.group) { const list = await getVillagesInGroup(cfg.group); mine = list.map((v) => ({ vid: v.vid, coord: v.coord, name: v.coord })); }
      else { const list = await getAllVillagesCached(); mine = list.map((v) => ({ vid: v.vid, coord: v.coord, name: v.name })); }
    } catch (e) { pushLog('BM: erro ao ler minhas aldeias: ' + (e.message || e), 'err'); return null; }
    if (cfg.group) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
    const myV = [];
    mine.forEach((v) => { const cm = (v.coord || '').match(/(\d+)\|(\d+)/); if (cm) myV.push({ vid: v.vid, name: v.name || v.coord, coord: v.coord, x: +cm[1], y: +cm[2] }); });
    const now = Date.now();
    const staleMs = Math.max(0, (cfg.minDaysSinceScout || 0)) * 86400000;
    const sentAt = cfg.sentAt || {};
    // O QUE EU JÁ SEI, lido do assistente uma vez (conta inteira).
    //
    // A regra deixou de ser "faz quantos dias que escaneei" e passou a ser "tenho ou não
    // tenho informação". Três estados, e só o primeiro dispensa explorador:
    //   temDados  -> tem relatório E ele trouxe a muralha: eu sei o que tem lá
    //   semDados  -> tem relatório mas a muralha veio em branco: o explorador morreu
    //   ausente   -> nem aparece no assistente: não sei nada
    // De quebra a cor do último saque entra aqui: VERMELHO é tropa perdida.
    const sabido = {};   // coord -> { temDados, reportId, wall, color, targetId }
    try {
      (await getFarmTargetsCached(CUR_VID)).forEach((t) => {
        if (!t.coord) return;
        sabido[t.coord] = { temDados: !!(t.reportId && t.wall != null), reportId: t.reportId, wall: t.wall, color: t.color, targetId: t.targetId, reportAt: t.reportAt || 0 };
      });
      mapAtualizarBlacklists(sabido);
    } catch (e) { pushLog('Mapa: não consegui ler o assistente (vou considerar tudo como não-explorado): ' + (e.message || e), 'err', 'map'); }
    // O filtro do assistente pode esconder aldeias que você já está atacando; a lista de comandos cobre esse buraco.
    let attacking = new Set();
    try { attacking = (await getPendingAttack()).coords; } catch (e) {}
    // Cada bárbaro vai pra aldeia minha mais próxima QUE AINDA TENHA COTA (maxPerVillage).
    //
    // A versão anterior prometia isso no comentário e fazia outra coisa: escolhia a aldeia mais
    // próxima na hora de montar o par e, se ela estivesse cheia na hora de distribuir, DESCARTAVA
    // o bárbaro em vez de passar pra próxima. Num bloco de aldeias juntas — que é o formato normal
    // de conta — as centrais saturavam e o resto do cerco ia pro lixo. Simulado com 43 aldeias e
    // 900 bárbaros: 45% dos alvos elegíveis descartados e 29 das 43 aldeias abaixo da cota.
    //
    // Agora: monta TODOS os pares dentro do alcance, ordena por distância e distribui — cada
    // bárbaro entra uma vez só, na origem mais próxima que ainda couber. O alcance limita o
    // tamanho da lista (maxDist é no máximo umas dezenas de campos).
    const candByOrigin = {}; myV.forEach((s) => candByOrigin[s.vid] = []);
    const elegiveis = [];
    for (const b of barb) {
      const coord = b.x + '|' + b.y;
      const last = sentAt[b.vid] || 0;
      // blacklist: perdi tropa aí, ou o relatório mostrou defesa. Não gasta explorador.
      if (cfg.blacklistPerda[coord] || cfg.blacklistDefesa[coord]) continue;
      // já tem ataque nosso em rota pra lá — inclusive explorador já a caminho: não reenvia
      if (attacking.has(coord)) continue;
      // trava curta: mandei explorador há pouco e o relatório ainda não voltou. Sem isto o
      // ciclo seguinte reenviaria pro mesmo alvo antes de a informação chegar.
      if (last && (now - last) < MAP_ESPERA_RELATORIO_MS) continue;
      // Eu já sei o que tem lá? Só isso dispensa explorador.
      const s = sabido[coord];
      if (s && s.temDados) {
        // Reexploração por idade é OPCIONAL (0 = nunca). A regra principal é ter ou não ter
        // informação; a idade só existe pra quem quiser atualizar intel velho.
        if (!staleMs || (now - (s.reportAt || 0)) < staleMs) continue;
      }
      elegiveis.push({ vid: b.vid, x: b.x, y: b.y, coord: coord, points: b.points, name: b.name, lastAt: last, novo: !!idNovo[b.vid] });
    }
    const maxDist = cfg.maxDist || 20;
    const pairs = [];
    for (const t of elegiveis) {
      for (const s of myV) {
        const d = fieldDist(s.x, s.y, t.x, t.y);
        if (d <= maxDist) pairs.push({ src: s, dist: d, target: t });
      }
    }
    // Bárbaro NOVO passa na frente: é o alvo que ninguém explorou ainda e que pode sumir
    // (outro jogador nobla) se a gente demorar. Empate resolve por distância, como antes.
    pairs.sort((a, b) => (b.target.novo ? 1 : 0) - (a.target.novo ? 1 : 0) || a.dist - b.dist);

    // COTA POR ORIGEM LIMITADA PELO EXPLORADOR QUE A ALDEIA TEM.
    //
    // Sem isto, a atribuição acontecia só por distância e cota, e a checagem de tropa só
    // vinha depois, na hora de enviar: alvo atribuído a uma aldeia sem explorador era
    // simplesmente descartado, mesmo com outra aldeia perto cheia de explorador sobrando.
    // Era o mesmo defeito da cota que corrigi na v10.14.0 — atribuir sem olhar capacidade.
    // Com a cota real, a aldeia sem tropa recebe cota 0 e o alvo escorre pra próxima.
    //
    // Custa 1 requisição pra todas as aldeias (tela de coleta em massa). Se ela falhar,
    // volta ao comportamento antigo em vez de travar o ciclo.
    const baseLimit = Math.max(1, cfg.maxPerVillage || 20);
    const spyPorAlvo = Math.max(1, cfg.spyCount || 1);
    const reservaSpy = Math.max(0, cfg.spyReserve || 0);
    let espioes = null;
    try { espioes = await mapEspioesEmCasa(); }
    catch (e) { pushLog('🗺️ Não consegui ler os exploradores de todas as aldeias (' + (e.message || e) + ') — vou planejar sem olhar capacidade, como antes.', '', 'map'); }
    const limitePorOrigem = {};
    let semNenhum = 0;
    myV.forEach((s) => {
      if (!espioes) { limitePorOrigem[s.vid] = baseLimit; return; }
      const cabe = Math.floor(Math.max(0, (espioes[s.vid] || 0) - reservaSpy) / spyPorAlvo);
      limitePorOrigem[s.vid] = Math.min(baseLimit, cabe);
      if (!cabe) semNenhum++;
    });
    if (espioes && semNenhum) pushLog('🗺️ ' + semNenhum + ' de ' + myV.length + ' aldeia(s) sem explorador suficiente neste ciclo — os alvos delas foram para as vizinhas que têm.', '', 'map');
    const jaAtribuido = {};
    for (const p of pairs) {
      if (jaAtribuido[p.target.vid]) continue;              // um bárbaro, uma origem
      const arr = candByOrigin[p.src.vid];
      // Cota da origem: o menor entre o teto que você configurou e o que a tropa dela
      // aguenta. Origem sem explorador tem cota 0 e o alvo escorre pra próxima do par.
      if (arr.length >= (limitePorOrigem[p.src.vid] != null ? limitePorOrigem[p.src.vid] : baseLimit)) continue;
      jaAtribuido[p.target.vid] = 1;
      arr.push({ vid: p.target.vid, x: p.target.x, y: p.target.y, coord: p.target.coord, points: p.target.points, name: p.target.name, lastAt: p.target.lastAt, dist: p.dist });
    }
    const alcancaveis = Object.keys(pairs.reduce((m, p) => { m[p.target.vid] = 1; return m; }, {})).length;
    const plan = myV.map((s) => ({ src: s, targets: candByOrigin[s.vid] || [] }));
    const cobertura = mapGravarIntel(barb, myV, sabido, attacking);
    return { myV: myV, plan: plan, barbCount: barb.length, totalCandidates: alcancaveis, sabido: sabido, novos: novos.length, cobertura: cobertura };
  }

  async function mapTick() {
    clearTimeout(mapTimer);
    if (!config.map.running) return;
    // Ainda não é hora do próximo ciclo. O agendamento é feito em fatias de no máximo 60s
    // (ver scheduleMap) porque um setTimeout de 30 minutos escorrega e morre se a aba
    // suspender; quem decide se chegou a hora é este teste, não o timer.
    if (config.map.nextAt && Date.now() < config.map.nextAt) { scheduleMap(); return; }
    if (lockOther()) { mapTimer = setTimeout(mapTick, 5000); return; }
    if (captchaBlocked()) { mapTimer = setTimeout(mapTick, 30000); return; }
    claimLock();
    const now = Date.now();
    const cfg = config.map;
    const spyCount = Math.max(1, cfg.spyCount || 1);
    const reserve = Math.max(0, cfg.spyReserve || 0);
    const plan = await mapPlanTargets();
    // `null` do mapPlanTargets significa UMA coisa so: nao deu pra LER agora (village.txt ou a
    // lista de aldeias caiu). Nao e "nao ha o que fazer" -- plano vazio volta como objeto.
    //
    // Isto DESLIGAVA o modulo: um 429 ou um timeout desarmava o Barbaros de vez, e o botao
    // voltava pro estado "parado" sem nada explicando. Ate alguem reparar e clicar em ▶ de novo,
    // nada saia. Todo o resto do script, no mesmo caso, so loga e tenta no ciclo seguinte -- e e
    // isso que ele faz agora.
    if (!plan) {
      // Mesma conta do fim do ciclo bem-sucedido (`cicloMin`, em minutos) — falha de leitura não
      // é motivo pra martelar o servidor mais rápido que o normal.
      cfg.nextAt = now + Math.max(5, cfg.cicloMin || 30) * 60000;
      save();
      pushLog('Mapa: não consegui ler os dados agora — tento de novo no próximo ciclo (o módulo continua ligado).', 'err', 'map');
      scheduleMap();
      return;
    }
    cfg.lastPreview = plan.plan.flatMap((p) => p.targets.map((t) => ({ src: p.src.coord, srcName: p.src.name, coord: t.coord, dist: Math.round(t.dist * 10) / 10, pts: t.points, name: t.name, lastAt: t.lastAt }))).slice(0, 500);
    save(); renderMapPreview();
    const totalPlanned = plan.plan.reduce((a, p) => a + p.targets.length, 0);
    pushLog('Mapa: ' + plan.myV.length + ' aldeia(s) de origem, ' + plan.barbCount + ' bárbaro(s) no critério, ' + totalPlanned + ' planejado(s).', 'ok', 'map');
    const delay = Math.max(0, cfg.delay != null ? cfg.delay : 500);
    let sentTotal = 0, leftTotal = 0;
    for (const p of plan.plan) {
      if (!p.targets.length) continue;
      let state;
      try { state = await getVillageStateReserved(p.src.vid); }
      catch (e) { pushLog('Mapa: erro ao ler o estado de ' + p.src.name + ' (' + (e.message || e) + ').', 'err', 'map'); continue; }
      const avail = state.avail;
      const busy = {};
      (state.commands || []).forEach((c) => { if (c.coord && (c.kind === 'attack' || c.kind === 'return')) busy[c.coord] = 1; });
      let vSent = 0, semSpy = 0, ocup = 0;
      for (const t of p.targets) {
        // O Mapa põe running=false só no fim; aqui a guarda usa lock e bot-check, que é o que
        // importa num laço de aldeias × até 20 alvos cada (chega a 7 minutos).
        {
          const pare = devoParar('map');
          if (pare) {
            // Com ciclo contínuo, ser interrompido pela trava ou pelo bot-check NÃO é o
            // mesmo que você mandar parar: naquele caso o módulo segue ligado e tenta de
            // novo. Só o botão Parar desliga (e aí running já está false).
            save(); refreshCards('map');
            if (cfg.running) {
              const espera = 5 * 60000;
              cfg.nextAt = Date.now() + espera; save();
              pushLog('🗺️ Ciclo interrompido — ' + pare + '. ' + sentTotal + ' explorador(es) enviado(s); tento de novo em 5 min.', '', 'map');
              mapTimer = setTimeout(mapTick, espera);
            } else {
              setMapStatus(false);
              pushLog('🗺️ Mapa parado. ' + sentTotal + ' explorador(es) enviado(s) neste ciclo.', '', 'map');
            }
            return;
          }
        }
        if (busy[t.coord]) { ocup++; continue; }
        if ((avail.spy || 0) - reserve < spyCount) { semSpy++; continue; }
        try {
          await sendAttack(p.src.vid, String(t.x), String(t.y), { spy: spyCount });
          avail.spy = (avail.spy || 0) - spyCount;
          cfg.sentAt[t.vid] = Date.now();
          vSent++; sentTotal++;
          pushLog('Mapa: ' + p.src.name + ' → ' + t.coord + ' (' + spyCount + ' explorador, ' + (Math.round(t.dist * 10) / 10) + ' campos' + (t.points ? ', ' + t.points + ' pts' : '') + ')', 'ok', 'map');
          if (delay) await sleep(delay + Math.floor(Math.random() * 200));
        } catch (e) {
          const em = String(e.message || e);
          // Ambíguo = o explorador pode ter saído. Carimba mesmo assim: sem isso o próximo run
          // re-explora o alvo e queima explorador de novo.
          if (/^ambiguo:/.test(em)) {
            avail.spy = (avail.spy || 0) - spyCount;
            cfg.sentAt[t.vid] = Date.now(); vSent++; sentTotal++;
            pushLog('Mapa: ' + t.coord + ' — resposta ambígua, pode ter saído. Marquei como explorado.', '', 'map');
          } else {
            pushLog('Mapa: ' + p.src.name + ' → ' + t.coord + ': ' + em, 'err', 'map');
          }
        }
      }
      leftTotal += semSpy + ocup;
      const parts = ['enviou ' + vSent];
      if (semSpy) parts.push(semSpy + ' sem explorador (reserva)');
      if (ocup) parts.push(ocup + ' já com ataque a caminho');
      pushLog(p.src.name + ' (' + p.src.coord + '): ' + parts.join(' · '), '', 'map');
    }
    Object.keys(cfg.sentAt).forEach((k) => { if (now - cfg.sentAt[k] > 30 * 86400000) delete cfg.sentAt[k]; });

    // Lê os relatórios novos e alimenta a blacklist de defesa. Depois do envio, de
    // propósito: o que interessa é o relatório que já existe, e enquanto isso os
    // exploradores que acabaram de sair estão voando.
    let comDefesa = 0;
    if (plan.sabido) { try { comDefesa = await mapProcessarRelatorios(plan.sabido, 20); } catch (e) {} }

    cfg.stats = {
      mapped: plan.barbCount, reach: plan.totalCandidates, sent: sentTotal, left: leftTotal,
      novos: plan.novos || 0,
      blPerda: Object.keys(cfg.blacklistPerda || {}).length,
      blDefesa: Object.keys(cfg.blacklistDefesa || {}).length,
    };

    // CICLO CONTÍNUO. Antes era one-shot — terminava e desligava, e você tinha que clicar
    // Iniciar de novo. Agora fica ligado: a cada ciclo relê o mapa, detecta bárbaro novo e
    // manda explorador no que ainda não tem informação.
    const intervalo = Math.max(5, cfg.cicloMin || 30) * 60000;
    cfg.nextAt = Date.now() + intervalo;
    save();
    refreshCards('map');
    pushLog('🗺️ Ciclo concluído — ' + sentTotal + ' explorador(es) enviado(s)' +
      (plan.novos ? ', ' + plan.novos + ' bárbaro(s) novo(s)' : '') +
      (comDefesa ? ', ' + comDefesa + ' com defesa detectada' : '') +
      '. Próximo em ' + Math.round(intervalo / 60000) + ' min.', 'ok', 'map');
    mapTimer = setTimeout(mapTick, intervalo);
  }
  // Fatia a espera em no máximo 60s e reagenda. Quem decide se chegou a hora é o teste no
  // topo do mapTick — assim um ciclo de 30 min sobrevive a aba estrangulada e a F5.
  function scheduleMap() { clearTimeout(mapTimer); if (!config.map.running) return; mapTimer = setTimeout(mapTick, Math.min(Math.max((config.map.nextAt || 0) - Date.now(), 1000), 60000)); }

  async function mapPreview() {
    readMapCfg();
    pushLog('Mapa: === prévia ===', 'ok', 'map');
    let all = null;
    try {
      all = await getMapVillages();
      const barbAll = all.filter((v) => v.player === '0');
      pushLog('Mundo: ' + all.length + ' aldeias, ' + barbAll.length + ' bárbaras (village.txt).', '', 'map');
      if (all.length < 200) pushLog('Atenção: village.txt trouxe pouca coisa — servidor limitou ou sessão expirou.', 'err', 'map');
    } catch (e) { pushLog('village.txt: erro ' + (e.message || e), 'err', 'map'); return; }
    const plan = await mapPlanTargets();
    if (!plan) return;
    config.map.lastPreview = plan.plan.flatMap((p) => p.targets.map((t) => ({ src: p.src.coord, srcName: p.src.name, coord: t.coord, dist: Math.round(t.dist * 10) / 10, pts: t.points, name: t.name, lastAt: t.lastAt }))).slice(0, 500);
    save(); renderMapPreview();
    const tot = plan.plan.reduce((a, p) => a + p.targets.length, 0);
    config.map.stats = { mapped: plan.barbCount, reach: plan.totalCandidates, sent: (config.map.stats && config.map.stats.sent) || 0, left: 0 };
    refreshCards('map');
    pushLog('Filtro de pontos (' + config.map.minPoints + '–' + config.map.maxPoints + '): ' + plan.barbCount + ' bárbaros.', '', 'map');
    pushLog('Minhas aldeias: ' + plan.myV.length + (config.map.group ? ' (grupo ' + config.map.group + ')' : ' (todas)') + '.', '', 'map');
    pushLog('Candidatos a ≤ ' + config.map.maxDist + ' campos e ≥ ' + config.map.minDaysSinceScout + 'd sem scout: ' + plan.totalCandidates + '.', '', 'map');
    pushLog('Planejados neste ciclo (cota ' + config.map.maxPerVillage + '/aldeia): ' + tot + '.', tot > 0 ? 'ok' : 'err', 'map');
    // Quantas origens receberam alvo, e quais bateram no teto. Sem isto, "todos os alvos vêm da
    // mesma aldeia" fica sem explicação: pode ser geografia (só ela tem bárbaro virgem por perto)
    // ou pode ser a cota cortando. A linha abaixo separa os dois casos na hora.
    const comAlvo = plan.plan.filter((p) => p.targets.length);
    const noTeto = comAlvo.filter((p) => p.targets.length >= (config.map.maxPerVillage || 20));
    pushLog('Origens com alvo: ' + comAlvo.length + '/' + plan.myV.length +
      (noTeto.length ? ' · ' + noTeto.length + ' bateu(ram) o teto de ' + config.map.maxPerVillage + ' (havia mais alvo por perto — aumente "Máx alvos por aldeia")' : '') +
      (comAlvo.length === 1 && plan.myV.length > 1 ? ' · só uma origem: as outras não têm bárbaro dentro de ' + config.map.maxDist + ' campos que ainda não tenha sido escaneado ou já esteja com ataque a caminho' : ''),
      '', 'map');
    if (tot === 0 && plan.myV.length > 0 && all) {
      const barbs = all.filter((b) => b.player === '0');
      let minD = Infinity;
      plan.myV.forEach((s) => { barbs.forEach((b) => { const d = fieldDist(s.x, s.y, b.x, b.y); if (d < minD) minD = d; }); });
      if (isFinite(minD)) pushLog('Dica: o bárbaro mais próximo está a ' + (Math.round(minD * 10) / 10) + ' campos. Aumente a distância máxima acima disso.', '', 'map');
    }
  }
  function renderMapPreview() {
    const box = document.getElementById('twmgr-bm-list'); if (!box) return;
    const list = config.map.lastPreview || [];
    const cnt = document.getElementById('twmgr-bm-count'); if (cnt) cnt.textContent = list.length;
    if (!list.length) { box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:8px;font-size:10px">— nenhum alvo detectado —</div>'; return; }
    const now = Date.now();
    box.innerHTML =
      '<div style="display:grid;grid-template-columns:60px 34px 44px 1fr 44px;gap:4px;padding:3px 4px;border-bottom:1px solid #e0d6c6;font-size:9px;color:#8b5426;font-weight:600"><span>alvo</span><span style="text-align:right">d</span><span style="text-align:right">pts</span><span>de</span><span style="text-align:right">últ.</span></div>' +
      list.slice(0, 200).map((t) => {
        const last = t.lastAt ? (Math.round((now - t.lastAt) / 86400000) + 'd') : 'novo';
        return '<div style="display:grid;grid-template-columns:60px 34px 44px 1fr 44px;gap:4px;padding:2px 4px;border-bottom:1px solid rgba(255,255,255,.04);font-size:10px;color:#6f6153"><span style="color:#a2643a">' + esc(t.coord) + '</span><span style="text-align:right">' + t.dist + '</span><span style="text-align:right">' + (t.pts || 0) + '</span><span style="color:#8a7d6d;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="de ' + esc(t.srcName || '') + '">' + esc(t.src) + '</span><span style="text-align:right;color:' + (t.lastAt ? '#8a7d6d' : '#2e7d3a') + '">' + last + '</span></div>';
      }).join('');
  }
  // Qual das três listas está visível. Fica em memória — é preferência de tela, não estado.
  let _mapSub = 'alvos';
  function mapMostrarSub(qual) {
    _mapSub = qual;
    const lista = document.getElementById('twmgr-bm-list'), bl = document.getElementById('twmgr-bm-bl');
    if (!lista || !bl) return;
    lista.style.display = qual === 'alvos' ? '' : 'none';
    bl.style.display = qual === 'alvos' ? 'none' : '';
    document.querySelectorAll('.twmgr-bm-sub').forEach((b) => b.classList.toggle('on', b.getAttribute('data-sub') === qual));
    if (qual !== 'alvos') renderMapBlacklist(qual);
  }

  function renderMapBlacklist(qual) {
    const box = document.getElementById('twmgr-bm-bl'); if (!box) return;
    const cfg = config.map;
    const mapa = qual === 'perda' ? (cfg.blacklistPerda || {}) : (cfg.blacklistDefesa || {});
    const chaves = Object.keys(mapa).sort((a, b) => (mapa[b].at || 0) - (mapa[a].at || 0));
    if (!chaves.length) {
      box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:14px;font-size:10px">— lista vazia —<br><br>' +
        (qual === 'perda'
          ? 'Entra aqui quem devolveu o saque em <b>vermelho</b> (você perdeu tropa). Sai sozinho quando um saque voltar verde, amarelo ou azul.'
          : 'Entra aqui quem o relatório de exploração mostrou com <b>tropa defensiva</b>. Não sai sozinho — tire na mão quando achar que mudou.') + '</div>';
      return;
    }
    const agora = Date.now();
    box.innerHTML =
      '<div style="display:grid;grid-template-columns:64px 1fr 52px 22px;gap:4px;padding:3px 5px;border-bottom:1px solid #e0d6c6;font-size:9px;color:#8b5426;font-weight:600">' +
        '<span>alvo</span><span>' + (qual === 'defesa' ? 'defesa vista' : 'motivo') + '</span><span style="text-align:right">há</span><span></span></div>' +
      chaves.map((coord) => {
        const r = mapa[coord];
        const dias = r.at ? Math.round((agora - r.at) / 86400000) : null;
        const quando = dias == null ? '—' : (dias === 0 ? 'hoje' : dias + 'd');
        const meio = qual === 'defesa'
          ? '<span style="color:#c0483a">' + (r.defTotal || '?') + ' unidades</span>' + (r.removido ? ' <span style="color:#8a7d6d">· apagado do assistente</span>' : '')
          : '<span style="color:#8a7d6d">saque voltou vermelho</span>';
        return '<div style="display:grid;grid-template-columns:64px 1fr 52px 22px;gap:4px;padding:3px 5px;border-bottom:1px solid rgba(255,255,255,.04);font-size:10px;color:#6f6153;align-items:center">' +
          '<span style="color:#a2643a">' + esc(coord) + '</span>' + meio +
          '<span style="text-align:right;color:#8a7d6d">' + quando + '</span>' +
          '<span class="twmgr-del twmgr-bm-unbl" data-coord="' + esc(coord) + '" data-lista="' + qual + '" title="tirar da blacklist">✕</span></div>';
      }).join('');
    box.querySelectorAll('.twmgr-bm-unbl').forEach((el) => el.addEventListener('click', () => {
      const c = el.getAttribute('data-coord'), l = el.getAttribute('data-lista');
      delete (l === 'perda' ? config.map.blacklistPerda : config.map.blacklistDefesa)[c];
      save(); renderMapBlacklist(l); renderMapCounts();
      pushLog('🗺️ ' + c + ' saiu da blacklist (' + (l === 'perda' ? 'tropa perdida' : 'defesa') + ') — volta a ser alvo de exploração e de saque.', '', 'map');
    }));
  }

  function renderMapCounts() {
    const cfg = config.map;
    const p = document.getElementById('twmgr-bm-nperda'); if (p) p.textContent = Object.keys(cfg.blacklistPerda || {}).length;
    const d = document.getElementById('twmgr-bm-ndefesa'); if (d) d.textContent = Object.keys(cfg.blacklistDefesa || {}).length;
    const n = document.getElementById('twmgr-bm-next');
    if (n) n.textContent = (cfg.running && cfg.nextAt > Date.now())
      ? 'próximo ciclo em ' + Math.max(0, Math.round((cfg.nextAt - Date.now()) / 60000)) + ' min'
      : (cfg.running ? 'rodando…' : 'parado');
  }

  function readMapCfg() {
    const c = config.map, g = (id) => document.getElementById(id);
    if (g('twmgr-bm-group')) c.group = g('twmgr-bm-group').value || null;
    if (g('twmgr-bm-dist')) c.maxDist = Math.max(1, parseFloat((g('twmgr-bm-dist').value || '').replace(',', '.')) || 20);
    if (g('twmgr-bm-days')) c.minDaysSinceScout = Math.max(0, parseFloat((g('twmgr-bm-days').value || '').replace(',', '.')) || 2);
    if (g('twmgr-bm-minpts')) c.minPoints = Math.max(0, parseInt(g('twmgr-bm-minpts').value, 10) || 0);
    if (g('twmgr-bm-maxpts')) c.maxPoints = Math.max(1, parseInt(g('twmgr-bm-maxpts').value, 10) || 5000);
    if (g('twmgr-bm-maxper')) c.maxPerVillage = Math.max(1, parseInt(g('twmgr-bm-maxper').value, 10) || 20);
    if (g('twmgr-bm-reserve')) c.spyReserve = Math.max(0, parseInt(g('twmgr-bm-reserve').value, 10) || 0);
    if (g('twmgr-bm-spy')) c.spyCount = Math.max(1, parseInt(g('twmgr-bm-spy').value, 10) || 1);
    if (g('twmgr-bm-delay')) { const v = parseInt(g('twmgr-bm-delay').value, 10); c.delay = (isNaN(v) || v < 0) ? 500 : v; }
    if (g('twmgr-bm-ciclo')) c.cicloMin = Math.max(5, parseInt(g('twmgr-bm-ciclo').value, 10) || 30);
    if (g('twmgr-bm-defmin')) c.defesaMin = Math.max(1, parseInt(g('twmgr-bm-defmin').value, 10) || 1);
    if (g('twmgr-bm-rmassist')) c.removerDoAssistente = !!g('twmgr-bm-rmassist').checked;
    save();
  }
  function setMapStatus(on) { setBtnState('twmgr-bm-start', 'twmgr-bm-stop', on, '● Mapeando', '▶ Iniciar'); }
  function mapStart() {
    readMapCfg();
    config.map.running = true; config.map.nextAt = 0; save();
    setMapStatus(true);
    pushLog('🗺️ Mapa ligado — ciclo a cada ' + config.map.cicloMin + ' min, raio ≤ ' + config.map.maxDist +
      ' campos por aldeia, ' + config.map.spyCount + ' explorador/alvo, reserva ' + config.map.spyReserve + '.', 'ok', 'map');
    mapTick();
  }
  function mapStop() { readMapCfg(); config.map.running = false; save(); clearTimeout(mapTimer); setMapStatus(false); renderMapCounts(); pushLog('🗺️ Mapa desligado.', '', 'map'); }
  async function mapRefreshCache() { _mapVillagesCache = null; try { const v = await getMapVillages(true); pushLog('Mapa recarregado — ' + v.length + ' aldeias no mundo (' + v.filter((x) => x.player === '0').length + ' bárbaras).', 'ok', 'map'); } catch (e) { pushLog('Mapa: recarregar falhou (' + (e.message || e) + ').', 'err', 'map'); } }

