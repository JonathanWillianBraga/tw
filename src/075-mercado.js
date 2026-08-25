  // ==================== MERCADO (Cunhagem) ====================
  const NOME_RES = { wood: 'madeira', stone: 'argila', iron: 'ferro' };
  async function getMarketState(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=market&mode=send', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const numOf = (id) => { const el = doc.getElementById(id); return el ? (parseInt((el.textContent || '').replace(/\D/g, ''), 10) || 0) : 0; };
    return { wood: numOf('wood'), stone: numOf('stone'), iron: numOf('iron'), storage: numOf('storage'),
             capacity: numOf('market_merchant_max_transport'), inc: parseEntrada(doc) };
  }
  // O QUE JÁ ESTÁ CHEGANDO, pela boca do próprio jogo. Esta MESMA página traz a linha
  // "Entrada: 🪵 1.766 🧱 94.642" — é de graça, o fetch já aconteceu.
  //
  // Por que isso existe: o módulo mantinha um caderninho local (`config.market.inflight`) com o
  // que ele mesmo mandou, e expirava cada registro pela duração do transporte. Só que a duração
  // quase nunca é lida (o `[data-duration]` não vem nessa tela e o regex de "duração hh:mm:ss"
  // não casa), então caía no fallback de 1 HORA. Transporte que demora mais que isso sumia do
  // caderno enquanto ainda estava na estrada: o ciclo seguinte via a aldeia "vazia" e mandava
  // tudo de novo, várias vezes.
  //
  // Caso real (br143, Mt Eden): armazém 115.798, argila em 42.138, e o jogo dizia 94.642 de
  // argila chegando — 136.780 no total, quase 21 mil condenados a transbordar. O caderno local
  // só sabia de 42.974; tinha esquecido 51.668 que ainda estavam voando.
  //
  // A lição é a mesma do Noblar: quando o jogo sabe a resposta, perguntar pra ele em vez de
  // manter escrituração paralela que precisa dar certo pra sempre.
  function parseEntrada(doc) {
    const out = { wood: 0, stone: 0, iron: 0 };
    const ths = doc.querySelectorAll('th');
    for (let i = 0; i < ths.length; i++) {
      const th = ths[i];
      if (!/^\s*Entrada\s*:/i.test(th.textContent || '')) continue;
      th.querySelectorAll('span.nowrap').forEach((sp) => {
        const ico = sp.querySelector('span.icon.header');
        if (!ico) return;
        const r = ['wood', 'stone', 'iron'].filter((k) => ico.classList.contains(k))[0];
        if (!r) return;
        // O número vem com separador de milhar em <span class="grey">.</span>, então só sobra
        // dígito depois de tirar tudo que não é dígito do texto do container.
        out[r] = parseInt((sp.textContent || '').replace(/\D/g, ''), 10) || 0;
      });
      break;                                   // só a primeira: "Saída" é outro <th>
    }
    return out;
  }
  // weights ausente/zerado = split IGUAL entre os 3 (comportamento de sempre, usado por
  // Equilíbrio/Solidário). Com weights, cada iteração reparte a capacidade RESTANTE na
  // proporção do peso entre quem ainda tem espaço — não é "pega o peso e pronto": se um
  // recurso já bateu no teto de estoque disponível, a sobra da capacidade do mercador
  // vai pros outros dois, na proporção entre eles, em vez de ficar sem uso.
  function balancedSplit(totalCapacity, avail, reserve, weights) {
    const keys = ['wood', 'stone', 'iron'];
    const cap = {}; keys.forEach((k) => { cap[k] = Math.max(0, (avail[k] || 0) - (reserve[k] || 0)); });
    const w = {}; let wSum = 0;
    keys.forEach((k) => { w[k] = Math.max(0, (weights && weights[k]) || 0); wSum += w[k]; });
    const pesado = wSum > 0;
    const alloc = { wood: 0, stone: 0, iron: 0 };
    let remaining = totalCapacity;
    let active = keys.filter((k) => cap[k] > 0);
    // share >= 1 sempre (Math.max) e cap[k]-alloc[k] >= 1 pra quem está em "active" — então
    // give >= 1 em todo membro ativo, remaining cai pelo menos len(active) a cada volta.
    // Termina sozinho: ou remaining zera, ou os ativos vão saindo por falta de espaço.
    while (remaining > 0 && active.length) {
      const pesoAtivo = pesado ? active.reduce((s, k) => s + w[k], 0) : 0;
      // A fatia da RODADA usa o remaining FIXO no início dela — se recalculasse a cada membro
      // (remaining já reduzido pelo anterior na mesma rodada), o primeiro da vez levaria mais
      // que o combinado e o resto cascateava pra menos. É a mesma pegadinha do split antigo,
      // que por isso computava "share" uma vez só, fora do filter.
      const totalRodada = remaining;
      // Sem peso configurado (ou peso zerado nos que sobraram), cai pro igual entre os ativos —
      // é exatamente a conta antiga.
      active = active.filter((k) => {
        const fatia = (pesado && pesoAtivo > 0) ? (w[k] / pesoAtivo) : (1 / active.length);
        const give = Math.min(Math.max(1, Math.floor(totalRodada * fatia)), cap[k] - alloc[k], remaining);
        alloc[k] += give; remaining -= give;
        return cap[k] - alloc[k] > 0 && remaining > 0;
      });
    }
    return alloc;
  }
  async function sendMarketResources(vid, coord, amounts) {
    const [x, y] = coord.split('|').map((s) => s.trim());
    const p1 = new URLSearchParams();
    p1.set('wood', String(amounts.wood || 0)); p1.set('stone', String(amounts.stone || 0)); p1.set('iron', String(amounts.iron || 0));
    p1.set('x', x); p1.set('y', y); p1.set('input', x + '|' + y);
    p1.set('target_type', 'coord'); p1.set('h', CSRF);
    const r1 = await fetch('/game.php?village=' + vid + '&screen=market&mode=send&try=confirm_send', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p1.toString() });
    const t1 = await r1.text();
    const doc = new DOMParser().parseFromString(t1, 'text/html');
    const errBox = doc.querySelector('.error_box .content');
    if (errBox) throw new Error(errBox.textContent.trim().replace(/\s+/g, ' '));
    const form = doc.querySelector('form');
    if (!form) throw new Error('confirmação não encontrada');
    let dur = null;
    const dd = doc.querySelector('[data-duration]'); if (dd) dur = parseInt(dd.getAttribute('data-duration'), 10);
    if (!dur) { const m = t1.match(/dura[çc][aã]o[^0-9]{0,12}(\d{1,2}):([0-5]\d):([0-5]\d)/i); if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); }
    const p2 = new URLSearchParams();
    form.querySelectorAll('input, select').forEach((el) => { if (el.name) p2.set(el.name, el.value); });
    if (!p2.has('h')) p2.set('h', CSRF);
    const action = form.getAttribute('action') || ('/game.php?village=' + vid + '&screen=market&mode=send&h=' + CSRF);
    const r2 = await fetch(absUrl(action), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p2.toString() });
    const t2 = await r2.text();
    if (/alvo v[aá]lido/i.test(t2)) throw new Error('alvo inválido (confira a coordenada)');
    return dur && dur > 0 ? dur : null;
  }
  const MARKET_PASS = { cunhagem: () => cunhagemPass(), equilibrio: () => equilibrioPass(), solidario: () => solidarioPass() };
  async function marketTick(modeKey) {
    clearTimeout(marketTimers[modeKey]);
    const st = config.market.modes[modeKey];
    if (!st.running) return;
    if (lockOther()) { marketTimers[modeKey] = setTimeout(() => marketTick(modeKey), 5000); return; }
    if (captchaBlocked()) { marketTimers[modeKey] = setTimeout(() => marketTick(modeKey), 30000); return; }
    claimLock();
    const now = Date.now();
    if (st.stopAt && now >= st.stopAt) {
      st.running = false; st.stopAt = 0; save();
      clearTimeout(marketTimers[modeKey]);
      setMarketStatus(modeKey, false);
      pushLog('Mercado (' + MARKET_MODE_LABEL[modeKey] + '): parada programada atingida — desligado automaticamente.', 'ok', 'market');
      return;
    }
    if ((st.nextAt || 0) > now) { scheduleMarket(modeKey); return; }
    try { await MARKET_PASS[modeKey](); }
    catch (e) { pushLog('Mercado (' + MARKET_MODE_LABEL[modeKey] + '): erro no ciclo (' + (e.message || e) + ').', 'err', 'market'); }
    st.nextAt = now + Math.max(60, config.market.interval || 600) * 1000;
    save();
    refreshCards('market');
    pushLog('Mercado (' + MARKET_MODE_LABEL[modeKey] + '): próximo ciclo em ' + Math.round((config.market.interval || 600) / 60) + ' min.', '', 'market');
    scheduleMarket(modeKey);
  }
  function scheduleMarket(modeKey) { clearTimeout(marketTimers[modeKey]); const st = config.market.modes[modeKey]; if (!st.running) return; marketTimers[modeKey] = setTimeout(() => marketTick(modeKey), Math.min(Math.max((st.nextAt || 0) - Date.now(), 1000), 60000)); }

  async function cunhagemPass() {
    const destCoords = (config.market.destCoords || []).filter(Boolean);
    if (!destCoords.length) { pushLog('Cunhagem: nenhum destino configurado.', 'err', 'market'); return; }
    const reserve = {
      wood: Math.max(0, config.market.reserveWood || 0),
      stone: Math.max(0, config.market.reserveStone || 0),
      iron: Math.max(0, config.market.reserveIron || 0),
    };
    // Peso entre os recursos ao enviar — pensado pro custo de formar o nobre (a proporção
    // não muda entre mundos com bandeira de desconto, que corta os 3 igual). Default 28k/30k/
    // 25k; zerar os 3 campos volta pro split igual de antes.
    const weights = {
      wood: Math.max(0, config.market.cunhagemPesoWood != null ? config.market.cunhagemPesoWood : 28000),
      stone: Math.max(0, config.market.cunhagemPesoStone != null ? config.market.cunhagemPesoStone : 30000),
      iron: Math.max(0, config.market.cunhagemPesoIron != null ? config.market.cunhagemPesoIron : 25000),
    };
    let vils = [];
    try { vils = await getAllVillagesCached(); } catch (e) { pushLog('Cunhagem: erro ao listar aldeias (' + (e.message || e) + ').', 'err', 'market'); return; }

    // doadoras elegíveis = união dos grupos de origem (vazio = todas as aldeias, menos as de destino)
    const srcGroups = config.market.cunhagemSourceGroups || [];
    const srcSet = {};
    if (srcGroups.length) {
      for (const gid of srcGroups) {
        try { (await getVillagesInGroup(gid)).forEach((v) => { srcSet[v.vid] = true; }); }
        catch (e) { pushLog('Cunhagem: erro ao listar grupo ' + gid + ' (' + (e.message || e) + ').', 'err', 'market'); }
      }
    } else {
      vils.forEach((v) => { srcSet[v.vid] = true; });   // "nenhum" grupo de origem selecionado = todas as aldeias
    }
    const destSet = {}; vils.forEach((v) => { if (v.coord && destCoords.includes(v.coord)) destSet[v.vid] = true; });

    let count = 0; const tot = { wood: 0, stone: 0, iron: 0 };
    for (const v of vils) {
      { const pare = devoParar('market'); if (pare) { pushLog('Cunhagem: interrompida — ' + pare + '.', '', 'market'); break; } }
      if (!srcSet[v.vid]) continue;
      if (destSet[v.vid]) continue;   // nunca doa pra si mesma se também for destino
      if (!v.coord) continue;
      const coord = destCoords.map((c) => ({ c: c, d: coordDist(v.coord, c) })).sort((a, b) => a.d - b.d)[0].c;   // destino mais perto
      let state;
      try { state = await getMarketState(v.vid); } catch (e) { pushLog('Cunhagem em ' + v.name + ': erro ao ler o mercado (' + (e.message || e) + ').', 'err', 'market'); continue; }
      if (!state.capacity) continue;
      const amounts = balancedSplit(state.capacity, state, reserve, weights);
      if ((amounts.wood + amounts.stone + amounts.iron) <= 0) continue;
      try {
        await sendMarketResources(v.vid, coord, amounts);
        count++; tot.wood += amounts.wood; tot.stone += amounts.stone; tot.iron += amounts.iron;
        pushLog('Cunhagem: ' + v.name + ' → ' + coord + ' (' + amounts.wood + ' mad, ' + amounts.stone + ' arg, ' + amounts.iron + ' fer)', 'ok', 'market');
        await sleep(400 + Math.floor(Math.random() * 400));
      } catch (e) { pushLog('Cunhagem em ' + v.name + ': ' + (e.message || e), 'err', 'market'); }
    }

    let coins = 0, mintCount = 0;
    if (config.market.autoMint) {
      const destVils = vils.filter((v) => destSet[v.vid]);
      for (const v of destVils) {
        { const pare = devoParar('market'); if (pare) { pushLog('Cunhagem: cunhagem automática interrompida — ' + pare + '.', '', 'market'); break; } }
        try {
          const r = await mintCoins(v.vid);
          if (r.minted > 0) { mintCount++; coins += r.minted; pushLog('Cunhagem: ' + v.name + ' cunhou ' + r.minted + ' moeda(s).', 'ok', 'market'); }
        } catch (e) { pushLog('Cunhagem automática em ' + v.name + ': ' + (e.message || e), 'err', 'market'); }
        await sleep(400 + Math.floor(Math.random() * 400));
      }
      config.market.modes.cunhagem.totalCoins = (config.market.modes.cunhagem.totalCoins || 0) + coins;
    }

    config.market.modes.cunhagem.stats = { sending: count, receiving: destCoords.length, wood: tot.wood, stone: tot.stone, iron: tot.iron, coins: coins };
    pushLog('Cunhagem: ciclo concluído — ' + count + ' aldeia(s) enviaram recurso' + (config.market.autoMint ? ', ' + coins + ' moeda(s) cunhada(s) em ' + mintCount + ' aldeia(s)' : '') + '.', 'ok', 'market');
  }

  // ---- Cunhar moedas de ouro (Academia / screen=snob) ----
  // Lê a tela da Academia e parseia o PRÓPRIO formulário de cunhagem (sem hardcode de endpoint),
  // igual o Mercado faz no confirm de envio. Retorna o form (action+campos), o nome do campo de
  // quantidade e o máximo cunhável agora (o "(N)" que o jogo já calcula, com custo escalado).
  async function getSnobState(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=snob', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const numOf = (id) => { const el = doc.getElementById(id); return el ? (parseInt((el.textContent || '').replace(/\D/g, ''), 10) || 0) : 0; };
    const resNow = { wood: numOf('wood'), stone: numOf('stone'), iron: numOf('iron') };
    // form de cunhagem: o único cujo action contém action=coin (o de nobre é action diferente)
    const form = doc.querySelector('form[action*="action=coin"]');
    let action = null, fields = {}, countName = 'count', maxMint = 0;
    if (form) {
      action = form.getAttribute('action');
      form.querySelectorAll('input, select').forEach((el) => { if (el.name && el.type !== 'submit' && el.type !== 'button') fields[el.name] = el.value; });
      const ci = form.querySelector('input[type="text"], input[type="number"], input:not([type])');
      if (ci && ci.name) countName = ci.name;
      // "(N)" = máximo cunhável agora (o jogo já considera o custo por moeda, que escala com nobres)
      const mm = (form.textContent || '').match(/\((\d+)\)/);
      if (mm) maxMint = parseInt(mm[1], 10) || 0;
    }
    // Progresso do proximo nobre. Confirmado no dump da tela (br143):
    //   "Falta ainda para o limite de nobres 46: 16 moedas de ouro"
    //   "Ja guardadas para o limite de nobres 46: 30 moedas de ouro"
    // O numero do limite escala com quantos nobres a conta ja tem; as moedas sao POR ALDEIA.
    // Sem acento no regex de proposito: comparo contra o texto normalizado (ver 082-pesquisa,
    // onde classe de caractere com acento em fonte gerada por script ja quebrou calado).
    const txt = (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const mFalta = txt.match(/falta ainda para o limite de nobres (\d+)[^0-9]{0,12}(\d+)/i);
    const mTem = txt.match(/ja guardadas para o limite de nobres \d+[^0-9]{0,12}(\d+)/i);
    // "Ainda podem ser produzidos: N" = quantos nobres a aldeia pode FORMAR agora (o limite da
    // conta menos existentes, em producao e aldeias conquistadas). Se for > 0, cunhar mais moeda
    // nao adianta nada: o que falta e apertar Formar unidade.
    const mPodem = txt.match(/ainda podem ser produzidos[^0-9]{0,12}(\d+)/i);
    const moedas = {
      podemFormar: mPodem ? parseInt(mPodem[1], 10) : null,
      limite: mFalta ? parseInt(mFalta[1], 10) : null,   // qual nobre a aldeia esta juntando
      faltam: mFalta ? parseInt(mFalta[2], 10) : null,
      tem: mTem ? parseInt(mTem[1], 10) : null,
    };
    // Fila de nobres da Academia. Confirmado no dump (br143, ago/2026): cada leva e uma linha
    //   "1 Nobre 3:08:41 hoje às 07:51:18 cancelar"
    // e a linha do FORMULÁRIO tem texto parecido ("Nobre 40.000 50.000 50.000 100 3:08:41 ...")
    // mas NÃO tem o "cancelar" — é ele que separa fila de formulário. Sem esse filtro o form
    // entraria como se fosse uma leva em produção.
    //
    // Isto não é enfeite: sem ler a fila, um nobre já encomendado é invisível. O Noblar acha que
    // nada vem, forma outro, e no ciclo seguinte outro — o dump do usuário mostrou 5 na fila de
    // uma aldeia por causa disso.
    const fila = { nobres: 0, prontoEm: null, cada: [] };
    doc.querySelectorAll('tr').forEach((tr) => {
      const t = (tr.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/cancelar/i.test(t)) return;
      const m = t.match(/^(\d+)\s+\S+\s+(\d+:\d{2}:\d{2})/);
      if (!m) return;
      const quando = parseReportDate(t.replace(/^.*?\d+:\d{2}:\d{2}/, ''));
      const n = parseInt(m[1], 10) || 0;
      fila.nobres += n;
      fila.cada.push({ n: n, at: quando });
      if (quando && (fila.prontoEm == null || quando < fila.prontoEm)) fila.prontoEm = quando;
    });
    // "Na Aldeia/Total" da linha do formulário: "1/14" = 1 nobre NESTA aldeia / 14 na CONTA toda
    // (confirmado pelo usuário). O total é da conta, então ler de qualquer aldeia serve — e não
    // custa requisição nenhuma, porque esta tela já está aberta.
    //
    // Não substitui o `avail.snob` pro "nesta aldeia" (aquele já respeita as reservas dos outros
    // módulos); o que só se descobre aqui é o TOTAL.
    let naAldeia = null, totalConta = null;
    doc.querySelectorAll('tr').forEach((tr) => {
      const t = (tr.textContent || '').replace(/\s+/g, ' ').trim();
      if (/cancelar/i.test(t) || totalConta != null) return;   // linha de fila não tem esse par
      const m = t.match(/(\d+)\s*\/\s*(\d+)/);
      if (!m) return;
      naAldeia = parseInt(m[1], 10);
      totalConta = parseInt(m[2], 10);
    });
    return { resNow: resNow, hasForm: !!form, action: action, fields: fields,
             countName: countName, maxMint: maxMint, moedas: moedas, fila: fila,
             naAldeia: naAldeia, totalConta: totalConta };

  }
  async function mintCoins(vid) {
    const st = await getSnobState(vid);
    if (!st.hasForm) throw new Error('sem formulário de cunhagem (a aldeia tem Academia?)');
    const n = st.maxMint;
    if (n < 1) return { minted: 0, res: st.resNow };
    const body = new URLSearchParams();
    Object.entries(st.fields).forEach(([k, v]) => body.set(k, v));
    body.set(st.countName, String(n));
    if (!body.has('h')) body.set('h', CSRF);
    const r = await fetch(absUrl(st.action), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    const t = await r.text();
    try { const d = new DOMParser().parseFromString(t, 'text/html'); const eb = d.querySelector('.error_box'); if (eb && (eb.textContent || '').trim()) throw new Error('recusado: ' + eb.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)); } catch (e) { if (/^recusado:/.test(e.message)) throw e; }
    return { minted: n, res: st.resNow };
  }
  function coordDist(a, b) { const pa = a.split('|').map(Number), pb = b.split('|').map(Number); return Math.sqrt((pa[0] - pb[0]) * (pa[0] - pb[0]) + (pa[1] - pb[1]) * (pa[1] - pb[1])); }
  // Lê o mercado de todas as aldeias — usado tanto pelo ciclo real (equilibrioPass) quanto
  // pelo diagnóstico sob demanda (equilibrioDiagnostico), sem mandar nada em nenhum dos dois.
  // "storage" guardado À PARTE de "thr": thr já vem escalado pelo limiar (storage*pct), mas
  // pra saber se uma aldeia está perto de ESTOURAR o armazém preciso do valor bruto.
  const EQ_ALVO_TETO = 0.92;   // no automático, nunca mira o topo: produção entre ciclos precisa caber
  async function getEquilibrioSnapshot() {
    let vils = await getAllVillagesCached();
    vils = vils.filter((v) => v.coord);
    const RES = ['wood', 'stone', 'iron'];
    const base = [];
    for (const v of vils) {
      let m; try { m = await getMarketState(v.vid); } catch (e) { continue; }
      if (!m.storage) continue;                 // sem armazém lido -> pula
      base.push({ vid: v.vid, coord: v.coord, name: v.name, cur: { wood: m.wood, stone: m.stone, iron: m.iron },
        cap: m.capacity, storage: m.storage, inc: m.inc || { wood: 0, stone: 0, iron: 0 } });
      await sleep(120);
    }
    // Alvo POR RECURSO. No automático ele sai do que você REALMENTE tem: a fatia que aquele
    // recurso ocupa da sua capacidade total de armazenamento.
    //
    // Por que isso importa: com limiar fixo de 50%, uma aldeia só doa pra quem está ABAIXO de
    // 50%. Quando um recurso passa de 50% em TODAS as aldeias (o caso da madeira), não sobra
    // receptora nenhuma — nada se move e a mais cheia estoura, mesmo com o Equilíbrio ligado.
    // Com o alvo proporcional sempre há alguém acima e alguém abaixo da média, então o excesso
    // é espalhado em vez de concentrar. O limiar deixa de ser um número que você adivinha e
    // passa a ser o que a sua conta tem de fato.
    const auto = !!config.market.alvoAuto;
    const fixo = (config.market.thresholdPct != null ? config.market.thresholdPct : 50) / 100;
    const capTotal = base.reduce((s, x) => s + (x.storage || 0), 0);
    const pctRes = {};
    RES.forEach((r) => {
      if (!auto || !capTotal) { pctRes[r] = fixo; return; }
      const tot = base.reduce((s, x) => s + (x.cur[r] || 0), 0);
      pctRes[r] = Math.min(EQ_ALVO_TETO, tot / capTotal);
    });
    const st = base.map((x) => Object.assign({}, x, {
      thr: { wood: x.storage * pctRes.wood, stone: x.storage * pctRes.stone, iron: x.storage * pctRes.iron },
    }));
    return { st: st, pct: fixo, pctRes: pctRes, auto: auto };
  }
  async function equilibrioPass() {
    let snap;
    try { snap = await getEquilibrioSnapshot(); } catch (e) { pushLog('Equilíbrio: erro ao listar aldeias (' + (e.message || e) + ').', 'err', 'market'); return; }
    const st = snap.st;
    const donorSet = {}, recvSet = {}, totRes = { wood: 0, stone: 0, iron: 0 };
    const maxDist = config.market.maxDist != null ? config.market.maxDist : 15;
    const now = Date.now();
    // Saúde ANTES de mexer em qualquer coisa — é o estado real, e a vazão do ciclo ANTERIOR
    // (config.market.modes.equilibrio.stats ainda não foi sobrescrita) alimenta o ETA.
    equilibrioAtualizarSaudeCom(snap);
    // recursos em trânsito (que eu já mandei e ainda não chegaram)
    config.market.inflight = config.market.inflight || {};
    Object.keys(config.market.inflight).forEach((vid) => {
      config.market.inflight[vid] = (config.market.inflight[vid] || []).filter((e) => e.arriveAt > now);
      if (!config.market.inflight[vid].length) delete config.market.inflight[vid];
    });
    const inSum = (vid, r) => (config.market.inflight[vid] || []).reduce((s, e) => s + (e.r === r ? e.amt : 0), 0);
    // O QUE ESTÁ CHEGANDO: o maior entre o que o JOGO diz (autoritativo, enxerga envio manual e
    // não expira sozinho) e o caderno local (cobre a janela entre eu mandar e o snapshot deste
    // ciclo, que foi lido ANTES do envio). Nunca a soma — seria contar o mesmo transporte duas
    // vezes. Ver parseEntrada.
    const chegando = (s, r) => Math.max(inSum(s.vid, r), (s.inc && s.inc[r]) || 0);
    let sent = 0;
    for (const r of ['wood', 'stone', 'iron']) {
      // carente = (atual + o que já vem chegando) abaixo do limiar
      //
      // A FILA É POR NECESSIDADE RELATIVA (`falta`), não pelo buraco em unidades.
      //
      // Antes era `b.def - a.def`: quem tinha o maior déficit BRUTO passava na frente. Isso
      // favorecia sistematicamente aldeia grande e matava de fome as novas/pequenas — o buraco
      // delas é pequeno em unidades mesmo quando estão em 2% do alvo, então elas ficavam sempre
      // no fim da fila, e quando chegava a vez a capacidade de mercador das doadoras já tinha
      // acabado. Caso real (br143): Mt Eden parada em 26 de ferro enquanto o Equilíbrio
      // "equilibrava" aldeias que já estavam confortáveis.
      //
      // `falta` = fração do alvo que ainda não tem (1 = vazia, 0 = no alvo). Quem está mais perto
      // de zerado vai primeiro, do tamanho que for. O quanto ela recebe continua saindo do
      // déficit real — o que muda é só a ORDEM de atendimento.
      // FILA EM TRES NIVEIS. Ate aqui havia UM criterio: carencia relativa ao limiar (% do
      // armazem). E essa era a raiz do "tenho aldeia parada sem construir":
      //
      //   o alvo do Equilibrio e RELATIVO (uma % do armazem) e o custo de um edificio e
      //   ABSOLUTO (54.574 de argila). Os dois numeros nunca se comparavam. Uma aldeia podia
      //   estar "no alvo" — e portanto atendida, e portanto ignorada — sem conseguir pagar a
      //   Fazenda que a travava havia dias.
      //
      // Pior: a informacao ja existia. `080-edificios` grava `config.build.demand[vid]` com o
      // edificio e o CUSTO EXATO a cada ciclo, e `040-tropas` grava a dele com o comentario
      // "demanda de recrutar p/ Equilibrio". Nenhuma das duas era lida por ninguem — cano
      // construido e nunca ligado, o mesmo defeito da chave de silencio da Central.
      //
      // Os niveis sao escalonados de proposito, e nao um criterio unico ponderado: na conta do
      // usuario ha 70 demandas de recrutamento contra 15 travas de construcao. No mesmo nivel,
      // as 70 afogariam as 15 — que sao justamente as que doem.
      // Mesma guarda do Recrutar: demanda de modulo DESLIGADO e dado velho. As duas estruturas
      // so sao zeradas no inicio do ciclo do dono, entao com o dono parado elas congelam no
      // ultimo estado e o Equilibrio priorizaria pra sempre uma trava que ja nao existe.
      const demB = (config.build && config.build.running && config.build.demand) || {};
      const demR = (config.recruit && config.recruit.running && config.recruit.demand) || {};
      const receivers = [];
      st.forEach((s) => {
        const eff = s.cur[r] + chegando(s, r);
        const dB = demB[s.vid], dR = demR[s.vid];
        // Nivel 0 — CONSTRUCAO URGENTE. Fazenda/Armazem que dispararam o gatilho de lotacao do
        // modelo ("sobrou menos de X%"). Sao os dois casos em que esperar CUSTA A CADA HORA:
        // fazenda cheia trava o recrutamento da aldeia inteira, armazem cheio joga producao fora.
        // Nenhum outro edificio tem esse custo de espera, entao nenhum outro merece este nivel.
        //
        // O criterio nao e "e Fazenda?" — e o gatilho, que ja mediu a lotacao real. Fazenda
        // urgente e Fazenda que calhou de ser o proximo item do modelo sao coisas diferentes.
        if (dB && dB.cost && dB.urgente && (dB.cost[r] || 0) > eff) {
          receivers.push({ s: s, prio: 0, def: (dB.cost[r] || 0) - eff, falta: 1, urgente: true,
                           motivo: (BUILD_META[dB.b] && BUILD_META[dB.b].name) || dB.b });
          return;
        }
        // Nivel 1 — CONSTRUCAO TRAVADA. Alvo = o que falta pra DESBLOQUEAR, nao uma %.
        if (dB && dB.cost && (dB.cost[r] || 0) > eff) {
          receivers.push({ s: s, prio: 1, def: (dB.cost[r] || 0) - eff, falta: 1,
                           motivo: (BUILD_META[dB.b] && BUILD_META[dB.b].name) || dB.b });
          return;
        }
        // Nivel 2 — RECRUTAMENTO sem recurso. Mesma ideia, um degrau abaixo.
        if (dR && (dR[r] || 0) > eff) {
          receivers.push({ s: s, prio: 2, def: (dR[r] || 0) - eff, falta: 1, motivo: 'recrutar' });
          return;
        }
        // Nivel 3 — o equilibrio de sempre, por carencia relativa ao limiar.
        if (eff < s.thr[r]) {
          receivers.push({ s: s, prio: 3, def: s.thr[r] - eff, falta: s.thr[r] > 0 ? (s.thr[r] - eff) / s.thr[r] : 0 });
        }
      });
      // Dentro dos niveis 1 e 2, MENOR FALTA PRIMEIRO: desbloqueia mais aldeias por recurso
      // movido (quem precisa de 500 sai da fila antes de quem precisa de 50.000). No nivel 3
      // segue valendo a carencia relativa, que e o criterio antigo e continua certo la.
      receivers.sort((a, b) => (a.prio - b.prio)
        || (a.prio < 3 ? (a.def - b.def) : (b.falta - a.falta)));
      // Quem foi pro começo da fila e por quê. Sem isto a mudança de critério é invisível: os
      // envios saem igual, só em outra ordem, e não dá pra conferir se está fazendo efeito.
      if (receivers.length) {
        const travadas = receivers.filter((x) => x.prio === 1).length;
        pushLog('Equilíbrio (' + NOME_RES[r] + '): fila — '
          + (travadas ? travadas + ' aldeia(s) TRAVADAS em construção primeiro · ' : '')
          + receivers.slice(0, 4).map((x) => x.s.name + ' '
              + (x.prio === 1 ? '🔨 ' + x.motivo + ', faltam ' + fmtN(Math.round(x.def))
               : x.prio === 2 ? '⚔ recrutar, faltam ' + fmtN(Math.round(x.def))
               : Math.round((1 - x.falta) * 100) + '% do alvo')).join(' · ')
          + (receivers.length > 4 ? ' · +' + (receivers.length - 4) + ' atrás' : ''), '', 'market');
      }
      for (const rec of receivers) {
        { const pare = devoParar('market'); if (pare) { pushLog('Equilíbrio: interrompido — ' + pare + '.', '', 'market'); return; } }
        if (rec.def <= 0) continue;
        // TRAVA DE TRANSBORDO, independente do limiar. O que já está no armazém mais o que está
        // na estrada não pode passar da capacidade — recurso que chega em armazém cheio é
        // simplesmente perdido. `thr` é uma fração do armazém e deveria bastar, mas ele parte de
        // um snapshot: se a leitura estiver velha ou o alvo automático subir, esta é a rede que
        // impede a perda. Sobra um respiro de 2% pra produção entre ciclos.
        const espaco = Math.max(0, (rec.s.storage * 0.98) - (rec.s.cur[r] + chegando(rec.s, r)));
        if (espaco <= 0) {
          pushLog('Equilíbrio: ' + rec.s.name + ' não recebe ' + NOME_RES[r] + ' — armazém já comprometido ('
            + fmtN(Math.round(rec.s.cur[r])) + ' + ' + fmtN(Math.round(chegando(rec.s, r))) + ' chegando, cabe '
            + fmtN(rec.s.storage) + ').', '', 'market');
          continue;
        }
        if (rec.def > espaco) rec.def = espaco;
        const donors = st.filter((s) => s.vid !== rec.s.vid && s.cap > 0 && s.cur[r] > s.thr[r])
          .map((s) => ({ s: s, exc: s.cur[r] - s.thr[r], d: coordDist(s.coord, rec.s.coord) }))
          .filter((x) => x.d <= maxDist)
          .sort((a, b) => a.d - b.d);
        for (const don of donors) {
          if (rec.def <= 0) break;
          const amount = Math.floor(Math.min(don.exc, rec.def, don.s.cap));
          if (amount < 500) continue;            // ignora transferência trivial
          try {
            const pkg = { wood: 0, stone: 0, iron: 0 }; pkg[r] = amount;
            const dur = await sendMarketResources(don.s.vid, rec.s.coord, pkg);
            sent++; donorSet[don.s.vid] = 1; recvSet[rec.s.vid] = 1; totRes[r] += amount;
            don.s.cur[r] -= amount; don.s.cap -= amount; rec.def -= amount; don.exc -= amount;
            config.market.inflight[rec.s.vid] = config.market.inflight[rec.s.vid] || [];
            config.market.inflight[rec.s.vid].push({ r: r, amt: amount, arriveAt: now + ((dur && dur > 0 ? dur : 3600) * 1000) });
            pushLog('Equilíbrio: ' + don.s.name + ' → ' + rec.s.coord + ' (' + amount + ' ' + ({ wood: 'madeira', stone: 'argila', iron: 'ferro' }[r]) + ')'
              // O MOTIVO no log de envio. Sem ele, a mudança de prioridade fica invisível: as
              // linhas saem iguais e não dá pra conferir se a trava de construção foi atendida.
              + (rec.prio === 0 ? ' — 🚨 ' + rec.motivo + ' URGENTE em ' + rec.s.name
               : rec.prio === 1 ? ' — 🔨 destrava ' + rec.motivo + ' em ' + rec.s.name
               : rec.prio === 2 ? ' — ⚔ recrutar' : ''), 'ok', 'market');
            await sleep(400 + Math.floor(Math.random() * 300));
          } catch (e) { pushLog('Equilíbrio em ' + don.s.name + ': ' + (e.message || e), 'err', 'market'); }
        }
      }
    }
    config.market.modes.equilibrio.stats = { sending: Object.keys(donorSet).length, receiving: Object.keys(recvSet).length, wood: totRes.wood, stone: totRes.stone, iron: totRes.iron };
    save();
    const alvoTxt = snap.auto
      ? 'alvo automático (mad ' + Math.round(snap.pctRes.wood * 100) + '% · arg ' + Math.round(snap.pctRes.stone * 100) + '% · fer ' + Math.round(snap.pctRes.iron * 100) + '%)'
      : 'limiar ' + Math.round(snap.pct * 100) + '%';
    pushLog('Equilíbrio: ciclo concluído — ' + sent + ' transferência(s), ' + alvoTxt + '.', 'ok', 'market');
  }

  // Saúde: quão perto do limiar cada aldeia está (déficit) e quão perto do TETO do armazém
  // (excedente/risco de estourar — o "problema contínuo" que motivou isto). ETA usa a vazão do
  // ciclo REAL anterior (config.market.modes.equilibrio.stats, ainda intacta quando isto roda no
  // início do ciclo) — é uma estimativa honesta baseada no que de fato saiu da última vez, não
  // um modelo teórico; se nada saiu daquele recurso no último ciclo, o ETA fica "sem dado".
  const EQ_RISCO_PCT = 0.9;      // 90% do armazém = "quase estourando"
  const EQ_MARGEM_PCT = 15;      // pontos percentuais de folga na sugestão (baixa ANTES de chegar no risco)
  const EQ_LIMIAR_MIN = 20;      // nunca sugere abaixo disto (limiar baixo demais vira spam de transferência trivial)
  function equilibrioAtualizarSaudeCom(snap) {
    const st = snap.st, pct = snap.pct;
    const RES = ['wood', 'stone', 'iron'];
    const anterior = (config.market.modes.equilibrio.stats) || {};
    const intervalSec = Math.max(60, config.market.interval || 600);
    let aldeiasOk = 0;
    const deficitTotal = { wood: 0, stone: 0, iron: 0 };
    const excedenteTotal = { wood: 0, stone: 0, iron: 0 };
    const problemas = [];
    // Sugestão REATIVA (sem dado de produção/hora — só olha o snapshot de agora): a aldeia que
    // já bateu a zona de risco mostra o quanto ela enche ANTES do limiar atual conseguir reagir.
    // A menor % entre as aldeias em risco, menos uma margem de segurança, vira o limiar sugerido
    // — assim ELAS virariam doadoras mais cedo, antes de chegar perto do teto.
    let menorFillRisco = null, aldeiasRisco = 0;
    st.forEach((s) => {
      let ok = true;
      const def = {}, risco = {};
      RES.forEach((r) => {
        const d = Math.max(0, Math.round(s.thr[r] - s.cur[r]));
        def[r] = d;
        deficitTotal[r] += d;
        excedenteTotal[r] += Math.max(0, Math.round(s.cur[r] - s.thr[r]));
        if (d > 0) ok = false;
        if (s.storage > 0) {
          const fill = s.cur[r] / s.storage;
          if (fill >= EQ_RISCO_PCT) {
            risco[r] = true; ok = false;
            if (menorFillRisco == null || fill < menorFillRisco) menorFillRisco = fill;
          }
        }
      });
      if (ok) aldeiasOk++;
      else { problemas.push({ coord: s.coord, name: s.name, def: def, risco: risco }); if (Object.keys(risco).length) aldeiasRisco++; }
    });
    problemas.sort((a, b) => (b.def.wood + b.def.stone + b.def.iron) - (a.def.wood + a.def.stone + a.def.iron));
    const eta = {};
    RES.forEach((r) => {
      if (deficitTotal[r] <= 0) { eta[r] = 0; return; }
      const taxa = anterior[r] || 0;
      eta[r] = taxa > 0 ? Math.ceil(deficitTotal[r] / taxa) * intervalSec : null;   // null = sem dado de vazão
    });
    // Só sugere quando há sinal de risco E a sugestão de fato baixaria o limiar atual — sem
    // aldeia em risco, ficar quieto é mais honesto que inventar ajuste sem necessidade.
    // No modo automático o limiar não é um número que você escolhe — sugerir baixá-lo não faz
    // sentido, o alvo já se ajusta sozinho ao estoque real a cada ciclo.
    let sugestao = null;
    const limiarAtualPct = Math.round(pct * 100);
    if (!snap.auto && menorFillRisco != null) {
      const proposto = Math.max(EQ_LIMIAR_MIN, Math.round(menorFillRisco * 100) - EQ_MARGEM_PCT);
      if (proposto < limiarAtualPct) {
        sugestao = {
          limiarPct: proposto,
          motivo: aldeiasRisco + ' aldeia(s) já bateram ' + Math.round(menorFillRisco * 100) + '%+ do armazém antes de virar doadora — com ' +
            proposto + '%, elas cedem o excedente mais cedo.',
        };
      }
    }
    config.market.modes.equilibrio.saude = {
      at: Date.now(), total: st.length, ok: aldeiasOk,
      pct: st.length ? Math.round(100 * aldeiasOk / st.length) : 100,
      limiarPct: limiarAtualPct, deficitTotal: deficitTotal, excedenteTotal: excedenteTotal,
      eta: eta, problemas: problemas, sugestao: sugestao,
      auto: !!snap.auto, alvoRes: snap.pctRes || null,
    };
    save();
    if (typeof equilibrioRenderSaude === 'function') equilibrioRenderSaude();
  }
  // Botão "🔄 diagnóstico": lê tudo de novo, na hora, SEM mandar nada — útil mesmo com o
  // Equilíbrio desligado, pra só olhar o estado sem ligar a automação.
  async function equilibrioDiagnostico() {
    pushLog('Equilíbrio: lendo o mercado de todas as aldeias pro diagnóstico…', '', 'market');
    let snap;
    try { snap = await getEquilibrioSnapshot(); }
    catch (e) { pushLog('Equilíbrio: erro ao ler o diagnóstico (' + (e.message || e) + ').', 'err', 'market'); return; }
    equilibrioAtualizarSaudeCom(snap);
    pushLog('Equilíbrio: diagnóstico atualizado — ' + snap.st.length + ' aldeia(s) lida(s).', 'ok', 'market');
  }

  // ---- Solidário: as aldeias do grupo escolhido SÓ RECEBEM (nunca doam). Doadoras são TODAS as outras
  // aldeias (qualquer uma fora do grupo), testadas da mais próxima pra mais longe — se a mais próxima não
  // tiver mercador livre/recurso suficiente, tenta a próxima mais próxima, e assim por diante. Proteções:
  // 1) piso normal = % (editável) do recurso mais baixo que a doadora TEM agora, com piso mínimo absoluto de segurança.
  // 2) gargalo (ninguém passa no piso normal): a mais próxima cede só a fatia acima de X% (editável, padrão 90%)
  //    do que ela já tem — ou seja, fica sempre com pelo menos X% do que possui, nunca esvazia.
  const SOLID_MIN_SEND = 100;
  const SOLID_ABS_MIN = { wood: 500, stone: 500, iron: 200 };   // piso mínimo absoluto do doador, só de segurança (não editável)
  async function solidarioPass() {
    const gid = config.market.groupSolidario;
    if (!gid) { pushLog('Solidário: nenhum grupo selecionado.', 'err', 'market'); return; }
    let recvMembers = [];
    try { recvMembers = (await getVillagesInGroup(gid)).map((x) => ({ vid: x.vid, coord: x.coord, name: x.coord })); }
    catch (e) { pushLog('Solidário: erro ao listar grupo (' + (e.message || e) + ').', 'err', 'market'); return; }
    recvMembers = recvMembers.filter((v) => v.coord);
    if (!recvMembers.length) { pushLog('Solidário: grupo sem aldeias, nada a fazer.', '', 'market'); return; }
    const recvSetIds = {}; recvMembers.forEach((v) => { recvSetIds[v.vid] = true; });
    let allV = [];
    try { allV = await getAllVillagesCached(); } catch (e) { pushLog('Solidário: erro ao listar todas as aldeias (' + (e.message || e) + ').', 'err', 'market'); return; }
    const donorPool = allV.filter((v) => v.coord && !recvSetIds[v.vid]);
    if (!donorPool.length) { pushLog('Solidário: nenhuma aldeia fora do grupo pra doar.', 'err', 'market'); return; }
    const donorSet = {}, recvSet = {}, totRes = { wood: 0, stone: 0, iron: 0 };
    const pct = (config.market.solidarioThresholdPct != null ? config.market.solidarioThresholdPct : 50) / 100;
    const donorPct = (config.market.solidarioDonorPct != null ? config.market.solidarioDonorPct : 50) / 100;
    const donorMinPct = (config.market.solidarioDonorMinPct != null ? config.market.solidarioDonorMinPct : 50) / 100;
    const keepPct = (config.market.solidarioGargaloKeepPct != null ? config.market.solidarioGargaloKeepPct : 90) / 100;
    const maxDist = config.market.solidarioMaxDist != null ? config.market.solidarioMaxDist : 20;
    const now = Date.now();
    config.market.inflight = config.market.inflight || {};
    Object.keys(config.market.inflight).forEach((vid) => {
      config.market.inflight[vid] = (config.market.inflight[vid] || []).filter((e) => e.arriveAt > now);
      if (!config.market.inflight[vid].length) delete config.market.inflight[vid];
    });
    const inSum = (vid, r) => (config.market.inflight[vid] || []).reduce((s, e) => s + (e.r === r ? e.amt : 0), 0);
    // piso normal do doador pro recurso r: % do recurso mais baixo que ELE tem agora (protege mais quem já tá capenga
    // em algum recurso, mesmo doando um recurso abundante), com piso mínimo absoluto por baixo.
    const donorFloor = (s, r) => Math.max((Math.min(s.cur.wood, s.cur.stone, s.cur.iron)) * donorPct, SOLID_ABS_MIN[r] || 0);
    // piso INDEPENDENTE do limiar de carência (thr): "quão cheia preciso estar desse recurso pra não ser
    // considerada carente demais pra doar ele". Separado de thr de propósito — se o limiar de carência for
    // configurado agressivo (ex.: 85%, "deixa todo mundo quase cheio"), isso NÃO pode travar todo mundo de
    // doar, senão nenhuma aldeia nunca fica "cheia o bastante" e o Solidário para de mandar qualquer coisa.
    const donorMinFor = (s) => s.storage * donorMinPct;
    const st = [];
    for (const v of recvMembers.concat(donorPool)) {
      let m; try { m = await getMarketState(v.vid); } catch (e) { continue; }
      if (!m.storage) continue;
      st.push({ vid: v.vid, coord: v.coord, name: v.name, isRecv: !!recvSetIds[v.vid], cur: { wood: m.wood, stone: m.stone, iron: m.iron }, cap: m.capacity, storage: m.storage, thr: m.storage * pct,
                inc: m.inc || { wood: 0, stone: 0, iron: 0 } });
      await sleep(120);
    }
    // Mesma correção do Equilíbrio: o que está chegando vem do JOGO, não só do caderno local que
    // expira pelo fallback de 1h. Aqui pesa ainda mais — o destino é aldeia de OUTRO membro, e o
    // caderno nunca enxerga o que os outros mandaram pra ele.
    const chegando = (s, r) => Math.max(inSum(s.vid, r), (s.inc && s.inc[r]) || 0);
    let sent = 0;
    for (const r of ['wood', 'stone', 'iron']) {
      const receivers = st.filter((s) => s.isRecv).map((s) => ({ s: s, eff: s.cur[r] + chegando(s, r) }))
        .filter((x) => x.eff < x.s.thr).map((x) => ({ s: x.s, def: x.s.thr - x.eff })).sort((a, b) => b.def - a.def);
      for (const rec of receivers) {
        if (rec.def <= 0) continue;
        const espaco = Math.max(0, (rec.s.storage * 0.98) - (rec.s.cur[r] + chegando(rec.s, r)));
        if (espaco <= 0) {
          pushLog('Solidário: ' + rec.s.name + ' não recebe ' + NOME_RES[r] + ' — armazém já comprometido ('
            + fmtN(Math.round(rec.s.cur[r])) + ' + ' + fmtN(Math.round(chegando(rec.s, r))) + ' chegando).', '', 'market');
          continue;
        }
        if (rec.def > espaco) rec.def = espaco;
        let covered = false;
        // passo normal: só doa quem tem excedente acima do próprio piso (recurso mais baixo × %), mais perto primeiro.
        // "s.cur[r] >= donorMinFor(s)" é essencial: sem isso, uma aldeia carente NESSE MESMO recurso podia ainda
        // passar no piso do doador (que usa o recurso mais baixo dela como base, uma conta separada) e acabar
        // doando o próprio recurso que está faltando nela. Usa donorMinPct (independente do limiar de carência).
        // "!s.isRecv" garante que só aldeias FORA do grupo Solidário entram como doadoras.
        const donors = st.filter((s) => !s.isRecv && s.vid !== rec.s.vid && s.cap > 0 && s.cur[r] >= donorMinFor(s) && s.cur[r] > donorFloor(s, r))
          .map((s) => ({ s: s, exc: s.cur[r] - donorFloor(s, r), d: coordDist(s.coord, rec.s.coord) }))
          .filter((x) => x.d <= maxDist)
          .sort((a, b) => a.d - b.d);
        for (const don of donors) {
          if (rec.def <= 0) { covered = true; break; }
          const amount = Math.floor(Math.min(don.exc, rec.def, don.s.cap));
          if (amount < SOLID_MIN_SEND) continue;   // essa doadora não ajuda o bastante -> tenta a próxima mais perto
          try {
            const pkg = { wood: 0, stone: 0, iron: 0 }; pkg[r] = amount;
            const dur = await sendMarketResources(don.s.vid, rec.s.coord, pkg);
            sent++; donorSet[don.s.vid] = 1; recvSet[rec.s.vid] = 1; totRes[r] += amount; covered = true;
            don.s.cur[r] -= amount; don.s.cap -= amount; rec.def -= amount; don.exc -= amount;
            config.market.inflight[rec.s.vid] = config.market.inflight[rec.s.vid] || [];
            config.market.inflight[rec.s.vid].push({ r: r, amt: amount, arriveAt: now + ((dur && dur > 0 ? dur : 3600) * 1000) });
            pushLog('Solidário: ' + don.s.name + ' → ' + rec.s.coord + ' (' + amount + ' ' + ({ wood: 'madeira', stone: 'argila', iron: 'ferro' }[r]) + ')', 'ok', 'market');
            await sleep(400 + Math.floor(Math.random() * 300));
          } catch (e) { pushLog('Solidário em ' + don.s.name + ': ' + (e.message || e), 'err', 'market'); }
        }
        // gargalo geral: ninguém passou no piso normal desse recurso -> a mais próxima cede só a fatia
        // acima de keepPct (padrão 90%) do que ela TEM agora, ficando sempre com pelo menos keepPct do que possui.
        if (!covered && rec.def > 0) {
          // mesma proteção do passo normal: mesmo no gargalo, nunca puxa de quem já está carente NESSE recurso,
          // e nunca de quem é do próprio grupo Solidário (só recebe, nunca doa).
          const fallback = st.filter((s) => !s.isRecv && s.vid !== rec.s.vid && s.cap > 0 && s.cur[r] >= donorMinFor(s) && s.cur[r] > 0)
            .map((s) => ({ s: s, d: coordDist(s.coord, rec.s.coord) }))
            .filter((x) => x.d <= maxDist)
            .sort((a, b) => a.d - b.d);
          for (const don of fallback) {
            if (rec.def <= 0) break;
            const amount = Math.floor(Math.min(don.s.cur[r] * (1 - keepPct), rec.def, don.s.cap));
            if (amount < SOLID_MIN_SEND) continue;
            try {
              const pkg = { wood: 0, stone: 0, iron: 0 }; pkg[r] = amount;
              const dur = await sendMarketResources(don.s.vid, rec.s.coord, pkg);
              sent++; donorSet[don.s.vid] = 1; recvSet[rec.s.vid] = 1; totRes[r] += amount;
              don.s.cur[r] -= amount; don.s.cap -= amount; rec.def -= amount;
              config.market.inflight[rec.s.vid] = config.market.inflight[rec.s.vid] || [];
              config.market.inflight[rec.s.vid].push({ r: r, amt: amount, arriveAt: now + ((dur && dur > 0 ? dur : 3600) * 1000) });
              pushLog('Solidário (gargalo, mantendo ' + Math.round(keepPct * 100) + '% da doadora): ' + don.s.name + ' → ' + rec.s.coord + ' (' + amount + ' ' + ({ wood: 'madeira', stone: 'argila', iron: 'ferro' }[r]) + ')', 'ok', 'market');
              await sleep(400 + Math.floor(Math.random() * 300));
            } catch (e) { pushLog('Solidário em ' + don.s.name + ': ' + (e.message || e), 'err', 'market'); }
            break;   // só a mais próxima, uma vez, dose reduzida -> não drena várias aldeias já apertadas
          }
        }
      }
    }
    config.market.modes.solidario.stats = { sending: Object.keys(donorSet).length, receiving: Object.keys(recvSet).length, wood: totRes.wood, stone: totRes.stone, iron: totRes.iron };
    save();
    pushLog('Solidário: ciclo concluído — ' + sent + ' transferência(s), limiar ' + Math.round(pct * 100) + '%.', 'ok', 'market');
  }
  async function fillMarketSolidarioGroupSelect() {
    const sel = document.getElementById('twmgr-mk-g-solid'); if (!sel) return;
    let groups = [];
    try { groups = await getGroups(); } catch (e) { pushLog('Solidário: erro ao listar grupos: ' + (e.message || e), 'err', 'market'); return; }
    const cur = config.market.groupSolidario;
    sel.innerHTML = '<option value="">— nenhum —</option>' + groups.map((gr) => '<option value="' + gr.id + '"' + (String(cur) === String(gr.id) ? ' selected' : '') + '>' + esc(gr.name) + '</option>').join('');
  }
  async function renderMarketCunhagemGroups() {
    const cont = document.getElementById('twmgr-mk-srcgroups'); if (!cont) return;
    let groups = [];
    try { groups = await getGroups(); } catch (e) { pushLog('Cunhagem: erro ao listar grupos: ' + (e.message || e), 'err', 'market'); return; }
    const cur = config.market.cunhagemSourceGroups || [];
    const rowHtml = (gid, name, checked) => '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#6f6153;margin:1px 0"><input type="checkbox" class="twmgr-mk-srcgrp" data-gid="' + gid + '"' + (checked ? ' checked' : '') + '>' + esc(name) + '</label>';
    cont.innerHTML = rowHtml('', 'nenhum (= todas as aldeias, menos as de destino)', !cur.length) +
      groups.map((gr) => rowHtml(gr.id, gr.name, cur.includes(gr.id))).join('');
    // "nenhum" e os grupos específicos são mutuamente exclusivos: marcar "nenhum" desmarca o resto
    // (= todas as aldeias), e marcar qualquer grupo específico desmarca "nenhum".
    cont.querySelectorAll('.twmgr-mk-srcgrp').forEach((cb) => cb.addEventListener('change', () => {
      if (cb.getAttribute('data-gid') === '') { if (cb.checked) cont.querySelectorAll('.twmgr-mk-srcgrp').forEach((o) => { if (o !== cb) o.checked = false; }); }
      else if (cb.checked) { const none = cont.querySelector('.twmgr-mk-srcgrp[data-gid=""]'); if (none) none.checked = false; }
      readMarketCfg();
    }));
  }
  function readMarketCfg() {
    const c = config.market, g = (id) => document.getElementById(id);
    if (g('twmgr-mk-destcoords')) c.destCoords = g('twmgr-mk-destcoords').value.split(/\s+/).map((s) => s.trim()).filter((s) => /^\d+\|\d+$/.test(s));
    if (g('twmgr-mk-rwood')) c.reserveWood = Math.max(0, parseInt(g('twmgr-mk-rwood').value, 10) || 0);
    if (g('twmgr-mk-rstone')) c.reserveStone = Math.max(0, parseInt(g('twmgr-mk-rstone').value, 10) || 0);
    if (g('twmgr-mk-riron')) c.reserveIron = Math.max(0, parseInt(g('twmgr-mk-riron').value, 10) || 0);
    if (g('twmgr-mk-pwood')) c.cunhagemPesoWood = Math.max(0, parseInt(g('twmgr-mk-pwood').value, 10) || 0);
    if (g('twmgr-mk-pstone')) c.cunhagemPesoStone = Math.max(0, parseInt(g('twmgr-mk-pstone').value, 10) || 0);
    if (g('twmgr-mk-piron')) c.cunhagemPesoIron = Math.max(0, parseInt(g('twmgr-mk-piron').value, 10) || 0);
    if (g('twmgr-mk-stopon')) c.cunhagemStopEnabled = g('twmgr-mk-stopon').checked;
    if (g('twmgr-mk-stophours')) c.cunhagemStopHours = Math.max(0.1, parseFloat((g('twmgr-mk-stophours').value || '').replace(',', '.')) || 2);
    if (g('twmgr-mk-automint')) c.autoMint = g('twmgr-mk-automint').checked;
    if (g('twmgr-mk-srcgroups')) c.cunhagemSourceGroups = Array.from(document.querySelectorAll('.twmgr-mk-srcgrp:checked')).map((cb) => cb.getAttribute('data-gid')).filter(Boolean);
    if (g('twmgr-mk-int')) c.interval = Math.max(1, parseInt(g('twmgr-mk-int').value, 10) || 10) * 60;
    if (g('twmgr-mk-alvoauto')) c.alvoAuto = g('twmgr-mk-alvoauto').checked;
    if (g('twmgr-mk-thr')) c.thresholdPct = Math.max(1, Math.min(99, parseInt(g('twmgr-mk-thr').value, 10) || 50));
    if (g('twmgr-mk-dist')) c.maxDist = Math.max(1, parseFloat((g('twmgr-mk-dist').value || '').replace(',', '.')) || 15);
    if (g('twmgr-mk-sthr')) c.solidarioThresholdPct = Math.max(1, Math.min(99, parseInt(g('twmgr-mk-sthr').value, 10) || 50));
    if (g('twmgr-mk-sdonormin')) c.solidarioDonorMinPct = Math.max(1, Math.min(99, parseInt(g('twmgr-mk-sdonormin').value, 10) || 50));
    if (g('twmgr-mk-sdonor')) c.solidarioDonorPct = Math.max(1, Math.min(99, parseInt(g('twmgr-mk-sdonor').value, 10) || 50));
    if (g('twmgr-mk-sgargalo')) c.solidarioGargaloKeepPct = Math.max(1, Math.min(99, parseInt(g('twmgr-mk-sgargalo').value, 10) || 90));
    if (g('twmgr-mk-sdist')) c.solidarioMaxDist = Math.max(1, parseFloat((g('twmgr-mk-sdist').value || '').replace(',', '.')) || 20);
    if (g('twmgr-mk-g-solid')) c.groupSolidario = g('twmgr-mk-g-solid').value;
    save();
  }
  function setMarketStatus(modeKey, on) { setBtnState('twmgr-mk-' + modeKey + '-start', 'twmgr-mk-' + modeKey + '-stop', on, '● Enviando', '▶ Enviar'); }
  const MARKET_START_MSG = {
    equilibrio: () => 'Equilíbrio iniciado — limiar ' + config.market.thresholdPct + '% do armazém, distância ≤ ' + config.market.maxDist + '.',
    solidario: () => 'Solidário iniciado — grupo ' + config.market.groupSolidario + ', limiar ' + config.market.solidarioThresholdPct + '% do armazém, distância ≤ ' + config.market.solidarioMaxDist + '.',
    cunhagem: () => 'Cunhagem iniciada — ' + config.market.destCoords.length + ' destino(s), reserva ' + config.market.reserveWood + '/' + config.market.reserveStone + '/' + config.market.reserveIron + ' (mad/arg/fer)' + (config.market.autoMint ? ', cunhagem automática ligada' : '') + (config.market.cunhagemStopEnabled ? ', parada em ' + config.market.cunhagemStopHours + 'h' : '') + '.',
  };
  function marketStart(modeKey) {
    readMarketCfg();
    if (modeKey === 'cunhagem') {
      if (!config.market.destCoords.length) { pushLog('Cunhagem: configure ao menos 1 destino válido (ex.: 464|604).', 'err', 'market'); return; }
    }
    if (modeKey === 'solidario' && !config.market.groupSolidario) { pushLog('Solidário: selecione um grupo.', 'err', 'market'); return; }
    config.market.modes[modeKey].running = true; config.market.modes[modeKey].nextAt = 0;
    config.market.modes[modeKey].stopAt = (modeKey === 'cunhagem' && config.market.cunhagemStopEnabled) ? Date.now() + config.market.cunhagemStopHours * 3600000 : 0;
    if (modeKey === 'cunhagem') config.market.modes.cunhagem.totalCoins = 0;   // cada "ligar" começa uma contagem nova (o total antigo fica visível até religar)
    save();
    setMarketStatus(modeKey, true);
    pushLog(MARKET_START_MSG[modeKey](), 'ok', 'market');
    marketTick(modeKey);
  }
  function marketStop(modeKey) { readMarketCfg(); config.market.modes[modeKey].running = false; save(); clearTimeout(marketTimers[modeKey]); setMarketStatus(modeKey, false); pushLog('Mercado (' + MARKET_MODE_LABEL[modeKey] + ') parado.', '', 'market'); }


  // ==================== PACOTES DE RECURSO ====================
  // O pacote do jogo enche TODAS as aldeias com uma porcentagem do armazém DE CADA UMA. Como o
  // armazém varia por aldeia, o mesmo pacote pode ser perfeito numa e puro desperdício em outra —
  // e não dá pra saber isso de cabeça com 30 aldeias. Aqui a conta é feita pras oito opções de
  // uma vez, pra decidir na hora da cunhagem se vale usar agora ou esvaziar antes.
  //
  // Uma requisição só: a tela de Produção traz recursos E armazém de todas as aldeias. O caminho
  // por aldeia (getMarketState) custaria uma requisição cada — 30+ numa conta média.
  const PACOTES_PCT = [1, 2, 5, 10, 15, 20, 25, 30];
  async function lerRecursosTodasAldeias() {
    const res = await fetch('/game.php?village=' + CUR_VID
      + '&screen=overview_villages&mode=prod&group=0&page=-1', { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const tb = doc.querySelector('#production_table') || doc.querySelector('table.overview_table');
    if (!tb) throw new Error('não achei a tabela de produção');
    const num = (s) => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
    const out = [];
    tb.querySelectorAll('tr').forEach((tr) => {
      if (!tr.querySelector('.quickedit-vn[data-id]')) return;
      // `span.wood` e não `.res.wood`: quando o recurso passa de 90% do armazém o jogo TROCA a
      // classe `res` por `warn_90` (e por `warn` no topo). Filtrar por `.res` pulava justamente
      // as aldeias quase cheias — as únicas que interessam aqui. Deu o pior tipo de erro: a tela
      // dizia "5% não estoura nada" com uma aldeia a 98,9% de madeira fora da conta.
      const w = tr.querySelector('span.wood'), s = tr.querySelector('span.stone'), i = tr.querySelector('span.iron');
      if (!w || !s || !i) return;
      // O armazém é a célula seguinte à dos recursos. Pegar por posição fixa quebraria em mundo
      // com colunas a mais; ancorar no próprio bloco de recursos aguenta a variação.
      const tdRes = w.closest('td');
      const cap = tdRes && tdRes.nextElementSibling ? num(tdRes.nextElementSibling.textContent) : 0;
      if (!cap) return;
      const lbl = tr.querySelector('.quickedit-label');
      const nome = ((lbl && lbl.textContent) || '').replace(/\s+/g, ' ').trim();
      out.push({ nome: nome.replace(/\s*\(\d{1,3}\|\d{1,3}\).*$/, '').trim() || nome,
                 coord: (nome.match(/\d{1,3}\|\d{1,3}/) || [''])[0],
                 cap: cap, wood: num(w.textContent), stone: num(s.textContent), iron: num(i.textContent) });
    });
    if (!out.length) throw new Error('nenhuma aldeia lida');
    return out;
  }
  // Conta, por pacote: quantas aldeias estouram, quanto se perde e qual é o maior pacote que
  // ainda não desperdiça nada. "Estoura" = algum dos três recursos passa do armazém.
  function calcularPacotes(vilas) {
    return PACOTES_PCT.map((p) => {
      let lotam = 0, perda = 0, cheias = [];
      vilas.forEach((v) => {
        const add = Math.floor(v.cap * p / 100);
        let estourou = false, perdaV = 0;
        ['wood', 'stone', 'iron'].forEach((k) => {
          const novo = (v[k] || 0) + add;
          if (novo > v.cap) { estourou = true; perdaV += novo - v.cap; }
        });
        if (estourou) { lotam++; perda += perdaV; cheias.push({ nome: v.nome, coord: v.coord, perda: perdaV }); }
      });
      cheias.sort((a, b) => b.perda - a.perda);
      return { pct: p, lotam: lotam, perda: perda, cheias: cheias };
    });
  }
  let _pacCache = null, _pacAt = 0, _pacCarregando = false, _pacErr = null;
  async function calcularPacotesUI() {
    if (_pacCarregando) return;
    _pacCarregando = true; _pacErr = null; renderPacotes();
    try {
      const vilas = await lerRecursosTodasAldeias();
      _pacCache = { linhas: calcularPacotes(vilas), n: vilas.length };
      _pacAt = Date.now();
    } catch (e) { _pacErr = 'não deu pra ler: ' + (e.message || e); }
    _pacCarregando = false; renderPacotes();
  }
  function renderPacotes() {
    const box = document.getElementById('twmgr-mk-pacotes'); if (!box) return;
    const q = document.getElementById('twmgr-mk-pac-quando');
    if (q) q.textContent = _pacAt ? ('lido às ' + new Date(_pacAt).toLocaleTimeString('pt-BR')) : '';
    if (_pacCarregando) { box.innerHTML = '<span class="twmgr-lbl">lendo as aldeias…</span>'; return; }
    if (_pacErr) { box.innerHTML = '<span style="color:#b03030;font-size:10px">' + esc(_pacErr) + '</span>'; return; }
    if (!_pacCache) { box.innerHTML = '<span class="twmgr-lbl">Clique em <b>Calcular</b>.</span>'; return; }
    const L = _pacCache.linhas;
    // O maior pacote que ainda não desperdiça nada — é a resposta que se procura na prática.
    const seguro = L.filter((x) => !x.lotam).map((x) => x.pct).pop();
    box.innerHTML =
      '<div style="font-size:10px;margin-bottom:5px;color:' + (seguro ? '#2e7d3a' : '#a2643a') + '">' +
        (seguro ? 'Maior pacote sem desperdício: <b>' + seguro + '%</b>'
                : 'Até o menor pacote (1%) já estoura alguma aldeia.') +
        ' <span style="color:#8a7d6d">· ' + _pacCache.n + ' aldeias</span></div>' +
      '<table class="twmgr-bld-tab" style="width:100%"><thead><tr>' +
        '<th style="width:52px">pacote</th><th style="width:78px">estouram</th>' +
        '<th style="width:96px">desperdício</th><th>onde sobra mais</th></tr></thead><tbody>' +
      L.map((x, i) => '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">' +
        '<td><b>' + x.pct + '%</b></td>' +
        '<td style="color:' + (x.lotam ? '#a2643a' : '#2e7d3a') + '">' +
          (x.lotam ? x.lotam + ' aldeia(s)' : '<b>nenhuma</b>') + '</td>' +
        '<td style="color:' + (x.perda ? '#b03030' : '#8a7d6d') + '">' + (x.perda ? fmtN(x.perda) : '—') + '</td>' +
        '<td style="color:#6f6153">' + (x.cheias.length
          ? esc(x.cheias.slice(0, 3).map((c) => c.nome + ' (' + fmtN(c.perda) + ')').join(', '))
            + (x.cheias.length > 3 ? ' <span style="color:#8a7d6d">+' + (x.cheias.length - 3) + '</span>' : '')
          : '—') + '</td></tr>').join('') +
      '</tbody></table>' +
      '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">"Estoura" = algum dos três recursos passa do armazém daquela aldeia. O desperdício é a soma do que passaria, somando os três recursos.</div>';
  }
