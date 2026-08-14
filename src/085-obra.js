  // ==================== OBRA (construção por perfil, via grupos nativos do TW) ====================
  // Diferente do Construções (que é por aldeia, cadastrada à mão), aqui cada aldeia entra no fluxo
  // automaticamente ao ser colocada num dos 5 grupos do jogo — nenhum cadastro manual extra.
  // Fazenda e Armazém são condicionais (não seguem a ordem estática do template) na maioria dos
  // perfis: só entram quando o gatilho ao vivo dispara. Fast Nobre quebra essa regra do Armazém
  // (fica embutido no próprio template, proativo). Pesquisa do Ferreiro (escolher a unidade) NÃO é
  // automatizada aqui — o endpoint de pesquisa nunca foi investigado/confirmado nesta sessão, só o
  // NÍVEL do prédio Ferreiro é controlado; escolher a tropa a pesquisar ainda é manual no jogo.
  async function getGroupProfileMapObra() {
    const g = config.obra.groups || {}, map = {};
    for (const p of OBRA_PROFILES) {
      if (!g[p]) continue;
      let vs = [];
      try { vs = await getVillagesInGroup(g[p]); } catch (e) {}
      vs.forEach((v) => { if (!map[v.vid]) map[v.vid] = { profile: p, coord: v.coord }; });
    }
    if (OBRA_PROFILES.some((p) => g[p])) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
    return map;
  }
  // Gatilhos condicionais de Fazenda (pop. livre baixa) e Armazém (recurso acima de X% da capacidade)
  // — usam res.pop/popMax/wood/stone/iron/storageMax, que getBuildState já extrai de graça da mesma
  // página (sem fetch extra). Retorna o nome do prédio a priorizar, ou null se nada disparou.
  function obraSpecialPriority(state, profile) {
    const cfg = config.obra, res = state.res || {};
    const freePop = (res.popMax || 0) - (res.pop || 0);
    if ((state.level.farm || 0) < 30 && state.hasBtn.farm && freePop < (cfg.farmFreePopMin || 800)) return 'farm';
    if (!OBRA_PROFILE_META[profile].storageProativo) {
      const cap = res.storageMax || 1;
      const fillPct = Math.max(res.wood || 0, res.stone || 0, res.iron || 0) / cap * 100;
      if ((state.level.storage || 0) < 30 && state.hasBtn.storage && fillPct >= (cfg.storageFillPct || 60)) return 'storage';
    }
    return null;
  }
  const OBRA_MINE_GATE_LEVEL = 10;   // uma mina só é upada além disso se o prédio prioritário também já estiver aqui
  function computeObra(state, plan, profile) {
    const cfg = config.obra, reserve = cfg.reserveMin || 0, res = state.res || {};
    const meta = OBRA_PROFILE_META[profile] || {};
    const prioLevel = meta.priorityBuilding ? (state.level[meta.priorityBuilding] || 0) : Infinity;
    const canAfford = (b) => {
      if (!state.buildable[b]) return false;
      if (!reserve) return true;
      const c = state.cost[b] || { wood: 0, stone: 0, iron: 0 };   // reserva mín. de recurso — prioriza o Recrutar quando configurado
      return (res.wood - c.wood >= reserve) && (res.stone - c.stone >= reserve) && (res.iron - c.iron >= reserve);
    };
    const special = obraSpecialPriority(state, profile);
    if (special && state.hasBtn[special]) {
      if (canAfford(special)) return { build: { b: special, cost: state.cost[special] }, demand: null };
      return { build: null, demand: { b: special, cost: state.cost[special] } };
    }
    for (const it of plan) {
      if (it.en === false) continue;
      if ((state.level[it.b] || 0) >= it.lvl) continue;
      if (!state.hasBtn[it.b]) {
        // travado por pré-requisito (ex.: Ferreiro exige Ed.Principal 5) -> prioriza o requisito que falta
        // em vez de cair no próximo item do template por eliminação (senão o motor nunca "volta" pro travado)
        const reqs = (state.locked && state.locked[it.b]) || [];
        for (const req of reqs) {
          if ((state.level[req.b] || 0) >= req.lvl) continue;
          if (!state.hasBtn[req.b]) continue;   // o próprio requisito também travado -> não dá pra resolver agora
          if (canAfford(req.b)) return { build: { b: req.b, cost: state.cost[req.b] }, demand: null };
          return { build: null, demand: { b: req.b, cost: state.cost[req.b] } };
        }
        continue;
      }
      // Aldeias "de segunda mão" (conquistadas/compradas) podem já ter mina bem upada com o prédio
      // prioritário travado (falta Ed.Principal p/ liberar Quartel/Estábulo) — sem isso, o motor cai
      // pra mina por eliminação. Regra: uma mina que JÁ está em nível 10+ só continua subindo se o
      // prédio prioritário também já estiver em 10+; minas ainda baixas (bootstrap de aldeia nova)
      // seguem normal, pois a economia inicial ainda depende delas.
      if ((it.b === 'wood' || it.b === 'stone' || it.b === 'iron') && (state.level[it.b] || 0) >= OBRA_MINE_GATE_LEVEL && prioLevel < OBRA_MINE_GATE_LEVEL) continue;
      if (canAfford(it.b)) return { build: { b: it.b, cost: state.cost[it.b] }, demand: null };
      return { build: null, demand: { b: it.b, cost: state.cost[it.b] } };
    }
    return { build: null, demand: null };
  }
  // ==================== OBRA — pesquisa automática do Ferreiro ====================
  // Confirmado via DevTools (capturado ao vivo, não chutado): POST /game.php?village=X&screen=smith
  // &ajaxaction=research, body "tech_id=<unit>&source=<vid>&h=<csrf>". A tela GET screen=smith embute
  // BuildingSmith.techs = {...} com o estado de cada tropa pesquisável — mesmo truque de parse
  // (extractBalancedJSON) usado no módulo Paladino pro receiveKnightsData.
  const OBRA_RESEARCH_ORDER = {
    fullAtk:   ['axe', 'spy', 'light', 'ram'],
    fullDef:   ['spear', 'sword', 'spy'],
    farmAtk:   ['axe', 'spy', 'light', 'ram'],
    fastDef:   ['spear', 'sword', 'spy', 'light', 'heavy'],
    fastNobre: ['axe', 'spy', 'light', 'ram'],
  };
  async function getSmithTechs(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=smith', { credentials: 'include' });
    const html = await res.text();
    const marker = 'BuildingSmith.techs = ';
    const idx = html.indexOf(marker);
    if (idx < 0) throw new Error('BuildingSmith.techs não encontrado (Ferreiro nv.0?)');
    const json = extractBalancedJSON(html, idx + marker.length);
    if (!json) throw new Error('parse de BuildingSmith.techs falhou');
    const data = JSON.parse(json);
    // O jogo separa `available` de `unavailable` — e devolver só o primeiro apagava a diferença
    // entre "esta tropa não existe neste mundo" e "existe, mas o requisito ainda não foi
    // cumprido". Quem lê ficava sem como distinguir as duas, e a Pesquisa chamava a segunda de
    // "modelo completo".
    //
    // Agora vem tudo, com `_indisp` marcando quem está travado. Chamador antigo que só olha o
    // nível continua funcionando: os campos originais estão intactos.
    const av = (data && data.available) || {};
    const un = (data && data.unavailable) || {};
    const out = {};
    Object.keys(av).forEach((k) => { out[k] = av[k]; });
    Object.keys(un).forEach((k) => { out[k] = Object.assign({}, un[k], { _indisp: true }); });
    return out;
  }
  async function smithResearch(vid, techId) {
    const b = new URLSearchParams();
    b.set('tech_id', techId);
    b.set('source', String(vid));
    b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + vid + '&screen=smith&ajaxaction=research', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: b.toString(),
    });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!j || !j.response) throw new Error('resposta inesperada (' + (txt || '').slice(0, 100).replace(/\s+/g, ' ') + ')');
    return j.response;
  }
  // Anda pela ordem de pesquisa do perfil; devolve o techId pesquisado agora, ou null se não fez nada
  // (já tudo pesquisado / falta prédio / já tem pesquisa em andamento nessa aldeia).
  async function obraResearchStep(vid, profile) {
    const order = OBRA_RESEARCH_ORDER[profile] || [];
    if (!order.length) return null;
    const techs = await getSmithTechs(vid);
    for (const techId of order) {
      const t = techs[techId];
      if (!t) continue;
      if ((+t.level || 0) >= 1) continue;        // já pesquisado -> próximo da ordem
      if (t.error_buildings) return null;        // falta prédio (Estábulo/Oficina/Ferreiro) -> Obra resolve subindo o prédio, espera
      if (t.can_research) { await smithResearch(vid, techId); return techId; }
      return null;                                // nem pronto nem livre -> já em andamento, espera
    }
    return null;
  }
  async function obraTick() {
    clearTimeout(obraTimer);
    if (!config.obra.running) return;
    if (lockOther()) { obraTimer = setTimeout(obraTick, 5000); return; }
    if (captchaBlocked()) { obraTimer = setTimeout(obraTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.obra.nextAt || 0) > now) { scheduleObra(); return; }
    let pmap;
    try { pmap = await getGroupProfileMapObra(); }
    catch (e) { pushLog('Obra: erro ao ler os grupos (' + (e.message || e) + ').', 'err', 'obra'); config.obra.nextAt = now + 120000; save(); scheduleObra(); return; }
    const vids = Object.keys(pmap);
    if (!vids.length) { pushLog('Obra: mapeie ao menos 1 grupo de perfil na aba Obra.', '', 'obra'); config.obra.nextAt = now + 300000; save(); scheduleObra(); return; }
    config.obra.demand = {};
    let built = 0, researched = 0;
    for (const vid of vids) {
      const profile = pmap[vid].profile;
      const plan = (config.obra.plans && config.obra.plans[profile]) || [];
      let st;
      try { st = await getBuildState(vid); }
      catch (e) { pushLog('Obra em ' + (pmap[vid].coord || vid) + ': erro ao ler o estado (' + (e.message || e) + ').', 'err', 'obra'); continue; }
      const r = computeObra(st, plan, profile);
      if (r.demand) config.obra.demand[vid] = { b: r.demand.b, cost: r.demand.cost, coord: pmap[vid].coord, profile: profile };
      if (r.build && st.queueLen < (config.obra.maxQueue || 5)) {
        try {
          await enqueueBuild(vid, r.build.b);
          built++;
          const bn = (BUILD_META[r.build.b] && BUILD_META[r.build.b].name) || r.build.b;
          pushLog('Obra: ' + (pmap[vid].coord || vid) + ' [' + OBRA_PROFILE_META[profile].name + '] → ' + bn + ' na fila (custo ' + r.build.cost.wood + '/' + r.build.cost.stone + '/' + r.build.cost.iron + ')', 'ok', 'obra');
        } catch (e) { pushLog('Obra em ' + (pmap[vid].coord || vid) + ': ' + (e.message || e), 'err', 'obra'); }
      } else if (r.demand) {
        const bn = (BUILD_META[r.demand.b] && BUILD_META[r.demand.b].name) || r.demand.b;
        pushLog((pmap[vid].coord || vid) + ' [' + OBRA_PROFILE_META[profile].name + ']: aguardando recurso p/ ' + bn + ' (' + r.demand.cost.wood + '/' + r.demand.cost.stone + '/' + r.demand.cost.iron + ')', '', 'obra');
      }
      if (config.obra.autoResearch) {
        try {
          const techId = await obraResearchStep(vid, profile);
          if (techId) { researched++; pushLog('Obra: ' + (pmap[vid].coord || vid) + ' [' + OBRA_PROFILE_META[profile].name + '] → pesquisando ' + techId, 'ok', 'obra'); }
        } catch (e) { pushLog('Obra (pesquisa) em ' + (pmap[vid].coord || vid) + ': ' + (e.message || e), 'err', 'obra'); }
      }
      await sleep(300);
    }
    config.obra.stats = config.obra.stats || {};
    config.obra.stats.villages = vids.length;
    config.obra.stats.built = built;
    config.obra.stats.researched = researched;
    config.obra.nextAt = now + Math.max(60, config.obra.interval || 600) * 1000;
    save();
    refreshCards('obra'); renderObraDemand();
    pushLog('Obra: ciclo concluído — ' + built + ' obra(s) enfileirada(s). Próximo em ' + Math.round((config.obra.interval || 600) / 60) + ' min.', 'ok', 'obra');
    scheduleObra();
  }
  function scheduleObra() { clearTimeout(obraTimer); if (!config.obra.running) return; obraTimer = setTimeout(obraTick, Math.min(Math.max((config.obra.nextAt || 0) - Date.now(), 1000), 60000)); }
  function readObraCfg() {
    const c = config.obra, g = (id) => document.getElementById(id);
    if (g('twmgr-ob-max')) c.maxQueue = Math.max(1, parseInt(g('twmgr-ob-max').value, 10) || 5);
    if (g('twmgr-ob-int')) c.interval = Math.max(1, parseInt(g('twmgr-ob-int').value, 10) || 10) * 60;
    if (g('twmgr-ob-reserve')) c.reserveMin = Math.max(0, parseInt(g('twmgr-ob-reserve').value, 10) || 0);
    if (g('twmgr-ob-farmpop')) c.farmFreePopMin = Math.max(0, parseInt(g('twmgr-ob-farmpop').value, 10) || 800);
    if (g('twmgr-ob-storagepct')) c.storageFillPct = Math.max(1, Math.min(100, parseInt(g('twmgr-ob-storagepct').value, 10) || 60));
    if (g('twmgr-ob-research')) c.autoResearch = !!g('twmgr-ob-research').checked;
    OBRA_PROFILES.forEach((p) => { const el = g('twmgr-ob-g-' + p); if (el) c.groups[p] = el.value || null; });
    save();
  }
  function setObraStatus(on) { setBtnState('twmgr-ob-start', 'twmgr-ob-stop', on, '● Construindo', '▶ Iniciar'); }
  function obraStart() {
    readObraCfg();
    if (!OBRA_PROFILES.some((p) => config.obra.groups[p])) { pushLog('Obra: mapeie ao menos 1 grupo de perfil.', 'err', 'obra'); return; }
    config.obra.running = true; config.obra.nextAt = 0; save();
    setObraStatus(true);
    pushLog('Obra iniciada.', 'ok', 'obra');
    obraTick();
  }
  function obraStop() { readObraCfg(); config.obra.running = false; save(); clearTimeout(obraTimer); setObraStatus(false); pushLog('Obra parada.', '', 'obra'); }
  async function fillObraGroupSelects() {
    let groups = [];
    try { groups = await getGroups(); } catch (e) { pushLog('Obra: erro ao listar grupos: ' + (e.message || e), 'err', 'obra'); return; }
    OBRA_PROFILES.forEach((p) => {
      const sel = document.getElementById('twmgr-ob-g-' + p); if (!sel) return;
      const cur = config.obra.groups[p];
      sel.innerHTML = '<option value="">— nenhum —</option>' + groups.map((gr) => '<option value="' + gr.id + '"' + (String(cur) === String(gr.id) ? ' selected' : '') + '>' + esc(gr.name) + '</option>').join('');
    });
  }
  function renderObraDemand() {
    const cont = document.getElementById('twmgr-ob-demand'); if (!cont) return;
    const demand = config.obra.demand || {};
    const keys = Object.keys(demand);
    if (!keys.length) { cont.innerHTML = '<div style="font-size:10px;color:#8a7d6d;padding:6px;text-align:center">— nada aguardando recurso —</div>'; return; }
    cont.innerHTML = keys.map((vid) => {
      const d = demand[vid];
      const bn = (BUILD_META[d.b] && BUILD_META[d.b].name) || d.b;
      return '<div style="font-size:10px;color:#6f6153;padding:2px 0;border-bottom:1px solid rgba(0,0,0,.07)">' +
        esc(d.coord || vid) + ' [' + esc((OBRA_PROFILE_META[d.profile] || {}).name || d.profile) + '] → ' + esc(bn) + ' (' + d.cost.wood + '/' + d.cost.stone + '/' + d.cost.iron + ')</div>';
    }).join('');
  }

