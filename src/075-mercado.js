  // ==================== MERCADO (Cunhagem) ====================
  async function getMarketState(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=market&mode=send', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const numOf = (id) => { const el = doc.getElementById(id); return el ? (parseInt((el.textContent || '').replace(/\D/g, ''), 10) || 0) : 0; };
    return { wood: numOf('wood'), stone: numOf('stone'), iron: numOf('iron'), storage: numOf('storage'), capacity: numOf('market_merchant_max_transport') };
  }
  function balancedSplit(totalCapacity, avail, reserve) {
    const keys = ['wood', 'stone', 'iron'];
    const cap = {}; keys.forEach((k) => { cap[k] = Math.max(0, (avail[k] || 0) - (reserve[k] || 0)); });
    const alloc = { wood: 0, stone: 0, iron: 0 };
    let remaining = totalCapacity;
    let active = keys.filter((k) => cap[k] > 0);
    while (remaining > 0 && active.length) {
      const share = Math.max(1, Math.floor(remaining / active.length));
      let progressed = false;
      active = active.filter((k) => {
        const give = Math.min(share, cap[k] - alloc[k], remaining);
        if (give > 0) { alloc[k] += give; remaining -= give; progressed = true; }
        return cap[k] - alloc[k] > 0 && remaining > 0;
      });
      if (!progressed) break;
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
      const amounts = balancedSplit(state.capacity, state, reserve);
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
    return { resNow: resNow, hasForm: !!form, action: action, fields: fields, countName: countName, maxMint: maxMint };
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
  async function equilibrioPass() {
    let vils = [];
    try { vils = await getAllVillagesCached(); } catch (e) { pushLog('Equilíbrio: erro ao listar aldeias (' + (e.message || e) + ').', 'err', 'market'); return; }
    vils = vils.filter((v) => v.coord);
    const donorSet = {}, recvSet = {}, totRes = { wood: 0, stone: 0, iron: 0 };
    const pct = (config.market.thresholdPct != null ? config.market.thresholdPct : 50) / 100;
    const maxDist = config.market.maxDist != null ? config.market.maxDist : 15;
    const now = Date.now();
    // recursos em trânsito (que eu já mandei e ainda não chegaram)
    config.market.inflight = config.market.inflight || {};
    Object.keys(config.market.inflight).forEach((vid) => {
      config.market.inflight[vid] = (config.market.inflight[vid] || []).filter((e) => e.arriveAt > now);
      if (!config.market.inflight[vid].length) delete config.market.inflight[vid];
    });
    const inSum = (vid, r) => (config.market.inflight[vid] || []).reduce((s, e) => s + (e.r === r ? e.amt : 0), 0);
    const st = [];
    for (const v of vils) {
      let m; try { m = await getMarketState(v.vid); } catch (e) { continue; }
      if (!m.storage) continue;                 // sem armazém lido -> pula
      st.push({ vid: v.vid, coord: v.coord, name: v.name, cur: { wood: m.wood, stone: m.stone, iron: m.iron }, cap: m.capacity, thr: m.storage * pct });
      await sleep(120);
    }
    let sent = 0;
    for (const r of ['wood', 'stone', 'iron']) {
      // carente = (atual + o que já vem chegando) abaixo do limiar
      const receivers = st.map((s) => ({ s: s, eff: s.cur[r] + inSum(s.vid, r) }))
        .filter((x) => x.eff < x.s.thr).map((x) => ({ s: x.s, def: x.s.thr - x.eff })).sort((a, b) => b.def - a.def);
      for (const rec of receivers) {
        { const pare = devoParar('market'); if (pare) { pushLog('Equilíbrio: interrompido — ' + pare + '.', '', 'market'); return; } }
        if (rec.def <= 0) continue;
        const donors = st.filter((s) => s.vid !== rec.s.vid && s.cap > 0 && s.cur[r] > s.thr)
          .map((s) => ({ s: s, exc: s.cur[r] - s.thr, d: coordDist(s.coord, rec.s.coord) }))
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
            pushLog('Equilíbrio: ' + don.s.name + ' → ' + rec.s.coord + ' (' + amount + ' ' + ({ wood: 'madeira', stone: 'argila', iron: 'ferro' }[r]) + ')', 'ok', 'market');
            await sleep(400 + Math.floor(Math.random() * 300));
          } catch (e) { pushLog('Equilíbrio em ' + don.s.name + ': ' + (e.message || e), 'err', 'market'); }
        }
      }
    }
    config.market.modes.equilibrio.stats = { sending: Object.keys(donorSet).length, receiving: Object.keys(recvSet).length, wood: totRes.wood, stone: totRes.stone, iron: totRes.iron };
    save();
    pushLog('Equilíbrio: ciclo concluído — ' + sent + ' transferência(s), limiar ' + Math.round(pct * 100) + '%.', 'ok', 'market');
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
      st.push({ vid: v.vid, coord: v.coord, name: v.name, isRecv: !!recvSetIds[v.vid], cur: { wood: m.wood, stone: m.stone, iron: m.iron }, cap: m.capacity, storage: m.storage, thr: m.storage * pct });
      await sleep(120);
    }
    let sent = 0;
    for (const r of ['wood', 'stone', 'iron']) {
      const receivers = st.filter((s) => s.isRecv).map((s) => ({ s: s, eff: s.cur[r] + inSum(s.vid, r) }))
        .filter((x) => x.eff < x.s.thr).map((x) => ({ s: x.s, def: x.s.thr - x.eff })).sort((a, b) => b.def - a.def);
      for (const rec of receivers) {
        if (rec.def <= 0) continue;
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
    const rowHtml = (gid, name, checked) => '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#5c4527;margin:1px 0"><input type="checkbox" class="twmgr-mk-srcgrp" data-gid="' + gid + '"' + (checked ? ' checked' : '') + '>' + esc(name) + '</label>';
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
    if (g('twmgr-mk-stopon')) c.cunhagemStopEnabled = g('twmgr-mk-stopon').checked;
    if (g('twmgr-mk-stophours')) c.cunhagemStopHours = Math.max(0.1, parseFloat((g('twmgr-mk-stophours').value || '').replace(',', '.')) || 2);
    if (g('twmgr-mk-automint')) c.autoMint = g('twmgr-mk-automint').checked;
    if (g('twmgr-mk-srcgroups')) c.cunhagemSourceGroups = Array.from(document.querySelectorAll('.twmgr-mk-srcgrp:checked')).map((cb) => cb.getAttribute('data-gid')).filter(Boolean);
    if (g('twmgr-mk-int')) c.interval = Math.max(1, parseInt(g('twmgr-mk-int').value, 10) || 10) * 60;
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
    save();
    setMarketStatus(modeKey, true);
    pushLog(MARKET_START_MSG[modeKey](), 'ok', 'market');
    marketTick(modeKey);
  }
  function marketStop(modeKey) { readMarketCfg(); config.market.modes[modeKey].running = false; save(); clearTimeout(marketTimers[modeKey]); setMarketStatus(modeKey, false); pushLog('Mercado (' + MARKET_MODE_LABEL[modeKey] + ') parado.', '', 'market'); }

