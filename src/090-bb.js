  // ==================== MÓDULO BB (aldeias bárbaras conquistadas) ====================
  // Constrói a ladder BB, abastece JIT das aldeias grandes próximas, e ao graduar (EP+estábulo) recruta CL sozinho.
  // Recursos que EU já mandei pra este destino e ainda não chegaram (evita reenviar e transbordar).
  function bbInflightSum(vid) {
    const now = Date.now();
    const arr = (config.bb.inflight && config.bb.inflight[vid]) || [];
    const out = { wood: 0, stone: 0, iron: 0 };
    arr.forEach((e) => { if (e.arriveAt > now && out[e.r] != null) out[e.r] += e.amt; });
    return out;
  }
  function bbInflightAdd(vid, amt, dur) {
    config.bb.inflight = config.bb.inflight || {};
    const arr = config.bb.inflight[vid] = config.bb.inflight[vid] || [];
    const at = Date.now() + ((dur && dur > 0 ? dur : 3600) * 1000);   // sem duração lida -> assume 1h
    ['wood', 'stone', 'iron'].forEach((r) => { if ((amt[r] || 0) > 0) arr.push({ r: r, amt: amt[r], arriveAt: at }); });
  }
  async function feedBB(v, needCost, sources, srcState) {
    let ms; try { ms = await getMarketState(v.vid); } catch (e) { return false; }
    if (!ms.storage) return false;
    // "efetivo" = recurso atual + o que já está a caminho. Sem isso, cada ciclo relê o atual (baixo,
    // porque o transporte ainda não chegou) e manda de novo -> quando tudo chega junto, transborda.
    const inf = bbInflightSum(v.vid);
    const eff = { wood: ms.wood + inf.wood, stone: ms.stone + inf.stone, iron: ms.iron + inf.iron };
    const free = { wood: Math.max(0, ms.storage - eff.wood), stone: Math.max(0, ms.storage - eff.stone), iron: Math.max(0, ms.storage - eff.iron) };
    // Estoque-alvo PROATIVO: manter a bárbara cheia até feedFillPct% do armazém, pra ela seguir construindo E
    // recrutando entre ciclos. O teto é RESPEITADO (não passa do %). Só fura se `feedAllowOverfill` estiver
    // ligado: aí `needCost` (custo da próxima obra) vira piso e enche até bancá-la, evitando travar obra cara.
    const fillTo = ms.storage * ((config.bb.feedFillPct != null ? config.bb.feedFillPct : 90) / 100);
    const overfill = !!config.bb.feedAllowOverfill;
    const want = {
      wood: overfill ? Math.max(fillTo, (needCost && needCost.wood) || 0) : fillTo,
      stone: overfill ? Math.max(fillTo, (needCost && needCost.stone) || 0) : fillTo,
      iron: overfill ? Math.max(fillTo, (needCost && needCost.iron) || 0) : fillTo,
    };
    const target = {
      wood: Math.max(0, Math.min(want.wood - eff.wood, free.wood)),
      stone: Math.max(0, Math.min(want.stone - eff.stone, free.stone)),
      iron: Math.max(0, Math.min(want.iron - eff.iron, free.iron)),
    };
    if (target.wood + target.stone + target.iron <= 0) return false;
    const cm = (v.coord || '').match(/(\d+)\|(\d+)/); if (!cm) return false;
    const vx = +cm[1], vy = +cm[2];
    const near = sources.map((s) => { const c = s.coord.match(/(\d+)\|(\d+)/); return c ? { s, d: Math.sqrt(Math.pow(+c[1] - vx, 2) + Math.pow(+c[2] - vy, 2)) } : null; })
      .filter((o) => o && o.d <= (config.bb.feedMaxDist || 15)).sort((a, b) => a.d - b.d);
    let sent = false;
    for (const o of near) {
      if (target.wood + target.stone + target.iron <= 0) break;
      const s = o.s;
      let ss = srcState[s.vid];
      if (!ss) { try { ss = srcState[s.vid] = await getMarketState(s.vid); } catch (e) { srcState[s.vid] = { capacity: 0 }; continue; } }
      if (!ss.capacity || !ss.storage) continue;
      const reserve = (config.bb.feedReserve || 40) / 100 * ss.storage;
      const avail = { wood: Math.max(0, ss.wood - reserve), stone: Math.max(0, ss.stone - reserve), iron: Math.max(0, ss.iron - reserve) };
      let amt = { wood: Math.min(target.wood, avail.wood), stone: Math.min(target.stone, avail.stone), iron: Math.min(target.iron, avail.iron) };
      let tot = amt.wood + amt.stone + amt.iron;
      if (tot <= 0) continue;
      if (tot > ss.capacity) { const f = ss.capacity / tot; amt = { wood: Math.floor(amt.wood * f), stone: Math.floor(amt.stone * f), iron: Math.floor(amt.iron * f) }; }
      if (amt.wood + amt.stone + amt.iron <= 0) continue;
      try {
        const dur = await sendMarketResources(s.vid, v.coord, amt);
        sent = true;
        pushLog('Cultivo (abastece): ' + s.coord + ' → ' + v.coord + ' (' + amt.wood + '/' + amt.stone + '/' + amt.iron + ')', 'ok', 'bb');
        ss.wood -= amt.wood; ss.stone -= amt.stone; ss.iron -= amt.iron; ss.capacity -= (amt.wood + amt.stone + amt.iron);
        target.wood -= amt.wood; target.stone -= amt.stone; target.iron -= amt.iron;
        bbInflightAdd(v.vid, amt, dur);   // marca o que está a caminho deste destino
      } catch (e) { /* alvo/erro -> tenta próxima fonte */ }
      await sleep(250);
    }
    return sent;
  }
  async function bbTick() {
    clearTimeout(bbTimer);
    if (!config.bb.running) return;
    if (lockOther()) { bbTimer = setTimeout(bbTick, 5000); return; }
    if (captchaBlocked()) { bbTimer = setTimeout(bbTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.bb.nextAt || 0) > now) { scheduleBB(); return; }
    // poda transportes que já chegaram
    config.bb.inflight = config.bb.inflight || {};
    Object.keys(config.bb.inflight).forEach((vid) => {
      config.bb.inflight[vid] = (config.bb.inflight[vid] || []).filter((e) => e.arriveAt > now);
      if (!config.bb.inflight[vid].length) delete config.bb.inflight[vid];
    });
    if (!config.bb.group) { pushLog('Cultivo: selecione o grupo na aba.', '', 'bb'); config.bb.nextAt = now + 300000; save(); scheduleBB(); return; }
    let vils;
    try { vils = await getVillagesInGroup(config.bb.group); }
    catch (e) { pushLog('Cultivo: erro ao ler o grupo (' + (e.message || e) + ').', 'err', 'bb'); config.bb.nextAt = now + 120000; save(); scheduleBB(); return; }
    try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {}
    if (!vils.length) { pushLog('Cultivo: grupo vazio — adicione as aldeias conquistadas ao grupo.', '', 'bb'); config.bb.nextAt = now + 300000; save(); scheduleBB(); return; }
    const tpl = parseTpl(config.bb.tpl);
    const defSet = {}; ((config.bb.defCoords || '').match(/\d{1,3}\|\d{1,3}/g) || []).forEach((c) => defSet[c] = 1);
    const bbSet = {}; vils.forEach((v) => bbSet[v.vid] = 1);
    let allV = []; try { allV = await getAllVillagesCached(); } catch (e) {}
    const sources = allV.filter((v) => !bbSet[v.vid] && v.coord);
    const srcState = {};
    // Conserta aldeia do grupo sem coord (getVillagesInGroup às vezes não parseia) — sem isso ela fica órfã
    // (feed não roda + vira sempre ATK). O getAllVillages traz a coord de todas.
    const coordByVid = {}; allV.forEach((a) => { if (a.coord) coordByVid[a.vid] = a.coord; });
    let built = 0, recruited = 0, fed = 0, f1 = 0, f2 = 0, f3 = 0;
    const gMain = config.bb.gradMain || 20, gStable = config.bb.gradStable || 15;
    for (const v of vils) {
      { const pare = devoParar('bb'); if (pare) { pushLog('Cultivo: ciclo interrompido — ' + pare + '.', '', 'bb'); break; } }
      if (!v.coord && coordByVid[v.vid]) v.coord = coordByVid[v.vid];
      let st;
      try { st = await getBuildState(v.vid); }
      catch (e) { pushLog('Cultivo em ' + (v.coord || v.vid) + ': erro ao ler o estado.', 'err', 'bb'); continue; }
      const grad = (st.level.main || 0) >= gMain && (st.level.stable || 0) >= gStable;
      if (grad) f3++; else if ((st.level.main || 0) >= gMain) f2++; else f1++;
      // Obra na fila conta como atingida (ver getBuildState/levelEff) — senão o mesmo prédio é
      // reenfileirado todo ciclo e a ladder nunca avança. Graduação/fases seguem no nível REAL,
      // porque "graduada" tem que significar estábulo de pé, não estábulo encomendado.
      const r = computeBuild(Object.assign({}, st, { level: st.levelEff || st.level }), tpl);
      if (r.build && st.queueLen < (config.bb.maxQueue || 5)) {
        const bn = (BUILD_META[r.build.b] && BUILD_META[r.build.b].name) || r.build.b;
        try { await enqueueBuild(v.vid, r.build.b); built++; pushLog('Cultivo: ' + (v.coord || v.vid) + ' → ' + bn + ' na fila (' + r.build.cost.wood + '/' + r.build.cost.stone + '/' + r.build.cost.iron + ')', 'ok', 'bb'); }
        catch (e) { pushLog('Cultivo em ' + (v.coord || v.vid) + ': ' + (e.message || e), 'err', 'bb'); }
      }
      if (grad) {
        const tag = defSet[v.coord] ? 'def' : 'atk';
        try {
          const rs = await getRecruitState(v.vid);
          const rc = computeRecruit(rs, config.recruit.profiles[tag].targets, config.recruit, rs.queuedSec);
          if (Object.keys(rc.amounts).length) {
            await sendRecruit(v.vid, rc.amounts); recruited++;
            pushLog('Cultivo: ' + (v.coord || v.vid) + ' [' + tag + '] recrutou ' + Object.entries(rc.amounts).map((e) => e[1] + ' ' + e[0]).join(', '), 'ok', 'bb');
          } else if (rs.units.light && !rs.units.light.reqMet) {
            pushLog('Cultivo em ' + (v.coord || v.vid) + ': cavalaria leve não pesquisada — pesquise no ferreiro.', 'err', 'bb');
          }
        } catch (e) { pushLog('Cultivo (recruta) em ' + (v.coord || v.vid) + ': ' + (e.message || e), 'err', 'bb'); }
      }
      // Feed PROATIVO: alimenta toda aldeia todo ciclo (mantém cheia p/ obra + recrutamento), usando o
      // custo da obra travada como piso quando existir. Antes só rodava quando a obra travava (r.demand).
      try { if (await feedBB(v, r.demand ? r.demand.cost : null, sources, srcState)) fed++; } catch (e) {}
      await sleep(300);
    }
    config.bb.stats = { total: vils.length, f1: f1, f2: f2, f3: f3 };
    config.bb.nextAt = now + Math.max(60, config.bb.interval || 600) * 1000; save();
    refreshCards('bb');
    pushLog('Cultivo: ciclo concluído — ' + built + ' obra(s), ' + recruited + ' recruta(s), ' + fed + ' abastecida(s). Próximo em ' + Math.round((config.bb.interval || 600) / 60) + ' min.', 'ok', 'bb');
    scheduleBB();
  }
  function scheduleBB() { clearTimeout(bbTimer); if (!config.bb.running) return; bbTimer = setTimeout(bbTick, Math.min(Math.max((config.bb.nextAt || 0) - Date.now(), 1000), 60000)); }
  function readBBCfg() {
    const c = config.bb, g = (id) => document.getElementById(id);
    if (g('twmgr-bb-group')) c.group = g('twmgr-bb-group').value || null;
    if (g('twmgr-bb-tpl')) c.tpl = g('twmgr-bb-tpl').value;
    if (g('twmgr-bb-def')) c.defCoords = g('twmgr-bb-def').value;
    if (g('twmgr-bb-fill')) c.feedFillPct = Math.max(10, Math.min(100, parseInt(g('twmgr-bb-fill').value, 10) || 90));
    if (g('twmgr-bb-overfill')) c.feedAllowOverfill = g('twmgr-bb-overfill').checked;
    if (g('twmgr-bb-reserve')) c.feedReserve = Math.max(0, Math.min(90, parseInt(g('twmgr-bb-reserve').value, 10) || 40));
    if (g('twmgr-bb-dist')) c.feedMaxDist = Math.max(1, parseInt(g('twmgr-bb-dist').value, 10) || 15);
    if (g('twmgr-bb-max')) c.maxQueue = Math.max(1, parseInt(g('twmgr-bb-max').value, 10) || 5);
    if (g('twmgr-bb-int')) c.interval = Math.max(1, parseInt(g('twmgr-bb-int').value, 10) || 10) * 60;
    save();
  }
  function setBBStatus(on) { setBtnState('twmgr-bb-start', 'twmgr-bb-stop', on, '● BB ativo', '▶ Iniciar BB'); }
  function bbStart() {
    readBBCfg();
    if (!config.bb.group) { pushLog('Cultivo: selecione o grupo primeiro.', 'err', 'bb'); return; }
    if (!config.recruit.profiles.atk.targets || !Object.keys(config.recruit.profiles.atk.targets).length) pushLog('Cultivo: dica — configure os alvos ATK/DEF na aba Recrutar (o Cultivo usa eles ao graduar).', '', 'bb');
    config.bb.running = true; config.bb.nextAt = 0; save();
    setBBStatus(true); pushLog('Cultivo iniciado.', 'ok', 'bb'); bbTick();
  }
  function bbStop() { readBBCfg(); config.bb.running = false; save(); clearTimeout(bbTimer); setBBStatus(false); pushLog('Cultivo parado.', '', 'bb'); }

