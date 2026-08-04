  function tickUI() {
    if (anyRunning() && !lockOther()) claimLock();
    const now = Date.now();
    document.querySelectorAll('.twmgr-card').forEach((card) => {
      const t = config.targets.find((x) => x.id === card.getAttribute('data-id'));
      const c = card.querySelector('.twmgr-cnt'); if (!t || !c) return;
      if (!config.running || !t.enabled) { c.textContent = ''; }
      else if (config.running && lockOther()) { c.textContent = '⏸ outra aba'; }
      else if ((t.nextSendAt || 0) > now) c.textContent = fmt(t.nextSendAt - now);
      else c.textContent = '•••';
    });
    const g = document.getElementById('twmgr-global'); if (g) { g.textContent = !config.running ? '' : (lockOther() ? '⏸ inativa (outra aba está enviando)' : '● rodando'); g.style.color = lockOther() ? '#c0483a' : '#2e7d3a'; }
    const sc = document.getElementById('twmgr-scav-status'); if (sc) { if (!config.scav.running) { sc.textContent = ''; } else if (lockOther()) { sc.textContent = '⏸ outra aba está ativa'; sc.style.color = '#c0483a'; } else { sc.style.color = '#2e7d3a'; sc.textContent = (config.scav.nextAt || 0) > now ? '● próx. verificação: ' + fmt(config.scav.nextAt - now) : '● verificando…'; } }
    const fs = document.getElementById('twmgr-farm-status'); if (fs) { if (!config.farm.running) { fs.textContent = ''; } else if (lockOther()) { fs.textContent = '⏸ outra aba está ativa'; fs.style.color = '#c0483a'; } else { fs.style.color = '#2e7d3a'; fs.textContent = (config.farm.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.farm.nextAt - now) : '● saqueando…'; } }
    const ws = document.getElementById('twmgr-wall-status'); if (ws) { if (!config.wall.running) { ws.textContent = ''; } else if (lockOther()) { ws.textContent = '⏸ outra aba está ativa'; ws.style.color = '#c0483a'; } else { ws.style.color = '#2e7d3a'; ws.textContent = (config.wall.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.wall.nextAt - now) : '● quebrando…'; } }
    const rs = document.getElementById('twmgr-recruit-status'); if (rs) { if (!config.recruit.running) { rs.textContent = ''; } else if (lockOther()) { rs.textContent = '⏸ outra aba está ativa'; rs.style.color = '#c0483a'; } else { rs.style.color = '#2e7d3a'; rs.textContent = (config.recruit.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.recruit.nextAt - now) : '● recrutando…'; } }
    const clk = document.getElementById('twmgr-srvclock'); if (clk) { try { clk.textContent = new Date(serverNow() - wallToServerOffset()).toLocaleTimeString(); } catch (e) {} }
    MARKET_MODES.forEach((mkKey) => {
      const mk = document.getElementById('twmgr-mk-' + mkKey + '-status'); if (!mk) return;
      const st = config.market.modes[mkKey];
      if (!st.running) { mk.textContent = ''; }
      else if (lockOther()) { mk.textContent = '⏸ outra aba'; mk.style.color = '#c0483a'; }
      else { mk.style.color = '#2e7d3a'; mk.textContent = (st.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(st.nextAt - now) : '● enviando…'; }
    });
    const bl = document.getElementById('twmgr-bld-status'); if (bl) {
      if (!config.build.running) { bl.textContent = ''; }
      else if (lockOther()) { bl.textContent = '⏸ outra aba'; bl.style.color = '#c0483a'; }
      else { bl.style.color = '#2e7d3a'; bl.textContent = (config.build.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.build.nextAt - now) : '● construindo…'; }
    }
    const pq = document.getElementById('twmgr-pq-status'); if (pq) {
      if (!config.research || !config.research.running) { pq.textContent = ''; }
      else if (lockOther()) { pq.textContent = '⏸ outra aba'; pq.style.color = '#c0483a'; }
      else { pq.style.color = '#2e7d3a'; pq.textContent = (config.research.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.research.nextAt - now) : '● pesquisando…'; }
    }
    if (document.getElementById('twmgr-cards-research')) refreshCards('research');
    const bm = document.getElementById('twmgr-bm-status'); if (bm) {
      if (!config.map || !config.map.running) { bm.textContent = ''; }
      else if (lockOther()) { bm.textContent = '⏸ outra aba'; bm.style.color = '#c0483a'; }
      else { bm.style.color = '#2e7d3a'; bm.textContent = (config.map.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.map.nextAt - now) : '● rastreando…'; }
    }
    const plClk = document.getElementById('twmgr-pl-srvclock'); if (plClk) { try { plClk.textContent = new Date(serverNow() - wallToServerOffset()).toLocaleTimeString(); } catch (e) {} }
    const pls = document.getElementById('twmgr-pl-status');
    if (pls) {
      const plAtk = config.planner && plActive();
      if (!plAtk || !plAtk.running) { pls.textContent = ''; }
      else if (lockOther()) { pls.textContent = '⏸ outra aba'; pls.style.color = '#c0483a'; }
      else {
        const rr = (plAtk.rows || []);
        const pend = rr.filter((r) => r.state === 'armed' || r.state === 'scheduled').length;
        const sent = rr.filter((r) => r.state === 'sent').length;
        const err = rr.filter((r) => r.state === 'error').length;
        const nx = rr.filter((r) => r.sendAt && (r.state === 'scheduled' || r.state === 'armed')).sort((a, b) => a.sendAt - b.sendAt)[0];
        pls.style.color = '#2e7d3a';
        pls.textContent = '● ' + sent + ' env · ' + pend + ' pend' + (err ? (' · ' + err + ' erro') : '') + (nx ? (' · próx ' + fmt(nx.sendAt - serverNow())) : '');
      }
    }
    if (document.getElementById('twmgr-cards-planner')) refreshCards('planner');
    if (document.getElementById('twmgr-pl-queue')) { try { renderPlannerQueue(plActive()); } catch (e) {} }
    const pds = document.getElementById('twmgr-pd-status');
    if (pds) {
      if (!config.paladin.running) { pds.textContent = ''; }
      else if (lockOther()) { pds.textContent = '⏸ outra aba'; pds.style.color = '#c0483a'; }
      else { pds.style.color = '#2e7d3a'; pds.textContent = '● ' + Object.keys(config.paladin.villages || {}).filter((v) => config.paladin.villages[v]).length + ' aldeia(s) no ciclo'; }
    }
    if (document.getElementById('twmgr-pd-status-list')) renderPaladinStatus();
    // Atualiza só o indicador (●) de cada aba de ataque, sem reconstruir a lista (evita "roubar" cliques).
    document.querySelectorAll('.twmgr-pl-tab').forEach((el) => {
      const atk = (config.planner.attacks || []).find((a) => a.id === el.getAttribute('data-id'));
      const dot = el.querySelector('.twmgr-pl-tab-dot');
      if (dot) dot.style.display = (atk && atk.running) ? 'inline' : 'none';
    });
    const ring = (id, on) => { const b = document.getElementById(id); if (b) b.classList.toggle('twmgr-run', !!on && !lockOther()); };
    // Muralha e Mapa viraram sub-abas do Saque (v11.16.0): o indicador de atividade vai pro botão da
    // SUB-aba, e a aba Saque acende se qualquer um dos três estiver rodando — senão dá pra ter
    // Muralha ativa com a barra principal apagada e ninguém percebe.
    const mapaAtivo = !!((config.map && config.map.running) || (config.lock && config.lock.running));
    const muroAtivo = !!(config.wall && config.wall.running);
    ring('twmgr-sbtab-farm', config.farm.running);
    ring('twmgr-sbtab-wall', muroAtivo);
    ring('twmgr-sbtab-map', mapaAtivo);
    ring('twmgr-btab-scav', config.scav.running);
    ring('twmgr-btab-farm', config.farm.running || muroAtivo || mapaAtivo);
    ring('twmgr-btab-recruit', config.recruit.running);
    ring('twmgr-btab-market', anyMarketRunning());
    ring('twmgr-btab-build', config.build.running);
    ring('twmgr-btab-research', config.research && config.research.running);
    ring('twmgr-btab-planner', config.planner && config.planner.attacks && config.planner.attacks.some((a) => a.running));
    ring('twmgr-btab-paladin', config.paladin && config.paladin.running);
    ring('twmgr-btab-obra', config.obra && config.obra.running);
    ring('twmgr-btab-etiqueta', config.etiqueta && config.etiqueta.running);
    const dot = document.getElementById('twmgr-dot'); if (dot) dot.classList.toggle('on', anyRunning() && !lockOther());
  }

  function readTargets() {
    const old = {}; config.targets.forEach((t) => { old[t.id] = t; });
    const arr = [];
    document.querySelectorAll('.twmgr-card').forEach((card) => {
      const id = card.getAttribute('data-id');
      const m = card.querySelector('.twmgr-xy').value.trim().match(/(\d+)\s*[|.\-\s]\s*(\d+)/);
      const units = {};
      card.querySelectorAll('.twmgr-q').forEach((q) => { const u = q.getAttribute('data-unit'); units[u] = units[u] || {}; units[u].qty = parseInt(q.value, 10) || 0; });
      card.querySelectorAll('.twmgr-m').forEach((mx) => { const u = mx.getAttribute('data-unit'); units[u] = units[u] || {}; units[u].max = mx.checked; });
      const o = old[id] || {};
      arr.push({ id, x: m ? m[1] : '', y: m ? m[2] : '', enabled: card.querySelector('.twmgr-en').checked, units, nextSendAt: o.nextSendAt || 0, phase: o.phase, lastSentAt: o.lastSentAt, origin: o.origin || CUR_VID, originName: o.originName || CUR_NAME });
    });
    config.targets = arr; save();
  }
  function cardHTML(t) {
    let trs = '';
    for (let i = 0; i < UNITS.length; i += 2) {
      trs += '<tr>' + [UNITS[i], UNITS[i + 1]].map((pair) => {
        if (!pair) return '<td></td><td></td><td></td>';
        const [u, n] = pair; const c = t.units[u] || {};
        return '<td title="' + n + '">' + unitIcon(u, n) + '</td>' + '<td><input class="twmgr-q twmgr-inp twmgr-qi" data-unit="' + u + '" type="number" min="0" value="' + (c.qty || 0) + '"></td>' + '<td style="text-align:center"><input class="twmgr-m" data-unit="' + u + '" type="checkbox"' + (c.max ? ' checked' : '') + '></td>';
      }).join('') + '</tr>';
    }
    return '<div class="twmgr-card" data-id="' + t.id + '"><div class="twmgr-card-head"><input class="twmgr-en" type="checkbox"' + (t.enabled ? ' checked' : '') + ' title="ativar este alvo"><input class="twmgr-xy twmgr-inp" placeholder="500|500" value="' + (t.x && t.y ? t.x + '|' + t.y : '') + '"><span class="twmgr-cnt"></span><span class="twmgr-exp" title="tropas">▾</span><span class="twmgr-del" title="remover">✕</span></div><div class="twmgr-from">de: ' + (t.originName || CUR_NAME) + '</div><div class="twmgr-troops"><table>' + trs + '</table></div></div>';
  }
  function renderTargets() {
    const cont = document.getElementById('twmgr-targets'); if (!cont) return;
    if (!config.targets.length) config.targets.push({ id: genId(), x: '', y: '', enabled: true, units: {}, nextSendAt: 0, origin: CUR_VID, originName: CUR_NAME });
    cont.innerHTML = config.targets.map(cardHTML).join('');
    cont.querySelectorAll('.twmgr-card').forEach((card) => {
      card.querySelector('.twmgr-exp').addEventListener('click', () => { const tr = card.querySelector('.twmgr-troops'); tr.style.display = tr.style.display === 'none' ? 'block' : 'none'; });
      card.querySelector('.twmgr-del').addEventListener('click', () => { readTargets(); config.targets = config.targets.filter((t) => t.id !== card.getAttribute('data-id')); save(); renderTargets(); });
    });
  }

  function start() {
    readTargets();
    const valid = config.targets.filter((t) => t.enabled && hasUnits(t) && t.x && t.y);
    if (!valid.length) { pushLog('Nenhum alvo válido (defina coord + tropas e ative).', 'err'); return; }
    config.targets.forEach((t) => { t.nextSendAt = 0; });
    config.running = true; save();
    setStatus(true); pushLog('Iniciado · ' + valid.length + ' alvo(s) · origem ' + CUR_NAME, 'ok'); processDue();
  }
  function stop() { readTargets(); config.running = false; save(); clearTimeout(sendTimer); setStatus(false); pushLog('Parado.'); }
  function setBtnState(startId, stopId, on, labelOn, labelOff) {
    const st = document.getElementById(startId), sp = document.getElementById(stopId);
    if (st) { st.textContent = on ? labelOn : labelOff; st.classList.toggle('on', on); }
    if (sp) sp.classList.toggle('dim', !on);
  }
  function setStatus(on) { setBtnState('twmgr-start', 'twmgr-stop', on, '● Ativo', '▶ Iniciar'); }
  function readScavUnlockCfg() {
    const c = config.scav, g = (id) => document.getElementById(id);
    if (g('twmgr-scav-unlock')) c.autoUnlock = !!g('twmgr-scav-unlock').checked;
    if (g('twmgr-scav-unlock-ate')) c.unlockAte = Math.max(1, Math.min(4, parseInt(g('twmgr-scav-unlock-ate').value, 10) || 4));
    if (g('twmgr-scav-unlock-puxar')) c.unlockPuxar = !!g('twmgr-scav-unlock-puxar').checked;
    if (g('twmgr-scav-unlock-res')) c.unlockReserva = Math.max(0, parseInt(g('twmgr-scav-unlock-res').value, 10) || 0);
    if (g('twmgr-scav-unlock-org')) c.unlockMaxOrigens = Math.max(1, Math.min(20, parseInt(g('twmgr-scav-unlock-org').value, 10) || 5));
    save();
  }

  // Quem está travado por falta de recurso, e quanto falta. Sem isto o usuário não teria
  // como saber por que uma aldeia não abriu a coleta — ficaria parecendo que não funciona.
  function renderScavFalta() {
    const box = document.getElementById('twmgr-scav-falta'); if (!box) return;
    const f = config.scav.faltouRecurso || {};
    const ks = Object.keys(f);
    if (!ks.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="twmgr-sec-h" style="margin:0 0 4px">Travadas por falta de recurso (' + ks.length + ')</div>' +
      ks.slice(0, 12).map((vid) => {
        const r = f[vid];
        const falta = RES3.filter((k) => r.falta[k]).map((k) => fmtN(r.falta[k]) + ' ' + ({ wood: 'mad', stone: 'arg', iron: 'fer' })[k]).join(' · ');
        return '<div style="font-size:10px;color:#6f6153;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04)">' +
          '<span style="color:#a2643a">' + esc(r.nome) + '</span> <span style="color:#8a7d6d">' + esc(r.opcao) + '</span> — <span style="color:#a8564a">' + falta + '</span></div>';
      }).join('') + (ks.length > 12 ? '<div style="font-size:9px;color:#8a7d6d;padding:2px 0">…e mais ' + (ks.length - 12) + '</div>' : '');
  }

  function readScavUnits() {
    config.scav.units = config.scav.units || {};
    SCAV_UNITS.forEach(([u]) => { const el = document.getElementById('twmgr-su-' + u); if (el) config.scav.units[u] = el.checked; });
    const mh = document.getElementById('twmgr-scav-maxh');
    if (mh) config.scav.maxHours = Math.max(0, parseFloat((mh.value || '').replace(',', '.')) || 0);
    save();
  }
  function scavStart() { readScavUnits(); if (!SCAV_UNITS.some(([u]) => config.scav.units[u])) { pushLog('Coleta: marque ao menos 1 unidade.', 'err', 'scav'); return; } config.scav.running = true; config.scav.nextAt = 0; save(); setScavStatus(true); pushLog('Coleta iniciada em todas as aldeias.', 'ok', 'scav'); scavTick(); }
  function scavStop() { readScavUnits(); config.scav.running = false; save(); clearTimeout(scavTimer); setScavStatus(false); pushLog('Coleta parada.', '', 'scav'); }
  function setScavStatus(on) { setBtnState('twmgr-scav-start', 'twmgr-scav-stop', on, '● Coletando', '▶ Coletar'); }
  function readFarmCfg() {
    const pw = document.getElementById('twmgr-farm-wood'); if (pw) config.farm.minWood = parseInt(pw.value, 10) || 0;
    const ps = document.getElementById('twmgr-farm-stone'); if (ps) config.farm.minStone = parseInt(ps.value, 10) || 0;
    const pi = document.getElementById('twmgr-farm-iron'); if (pi) config.farm.minIron = parseInt(pi.value, 10) || 0;
    const it = document.getElementById('twmgr-farm-int'); if (it) config.farm.interval = Math.max(1, parseInt(it.value, 10) || 10) * 60;
    const dt = document.getElementById('twmgr-farm-dist'); if (dt) config.farm.maxDist = parseFloat((dt.value || '').replace(',', '.')) || 13;
    const wl = document.getElementById('twmgr-farm-wall'); if (wl) { config.farm.maxWall = parseInt(wl.value, 10); if (isNaN(config.farm.maxWall)) config.farm.maxWall = 20; }
    const bw = document.getElementById('twmgr-farm-bluewall'); if (bw) { config.farm.blueMaxWall = parseInt(bw.value, 10); if (isNaN(config.farm.blueMaxWall) || config.farm.blueMaxWall < 0) config.farm.blueMaxWall = 0; }
    const md = document.getElementById('twmgr-farm-mode'); if (md) config.farm.mode = md.value || 'suave';
    const gp = document.getElementById('twmgr-farm-group'); if (gp) config.farm.group = gp.value || null;
    const rp = document.getElementById('twmgr-farm-repeat'); if (rp) config.farm.repeat = rp.checked;
    const rm = document.getElementById('twmgr-farm-repeatmin'); if (rm) { config.farm.repeatMin = parseInt(rm.value, 10); if (isNaN(config.farm.repeatMin) || config.farm.repeatMin < 1) config.farm.repeatMin = 10; }
    const mc = document.getElementById('twmgr-farm-mincl'); if (mc) config.farm.minCL = Math.max(0, parseInt(mc.value, 10) || 0);
    const od = document.getElementById('twmgr-farm-order'); if (od) config.farm.order = od.value || 'dist';
    const dy = document.getElementById('twmgr-farm-dyn'); if (dy) config.farm.dynTemplate = dy.checked;
    if (!config.farm.matrix) config.farm.matrix = defFarmMatrix();
    FARM_COLORS.forEach((k) => {
      const a = (document.getElementById('twmgr-fm-' + k + '-a') || {}).checked;
      const b = (document.getElementById('twmgr-fm-' + k + '-b') || {}).checked;
      const cc = (document.getElementById('twmgr-fm-' + k + '-c') || {}).checked;
      let mode = 'none';
      if (a) mode = 'a'; else if (b) mode = 'b'; else if (cc) mode = 'c';
      config.farm.matrix[k] = { mode: mode, qty: 1 };
    });
    save();
  }
  function farmStart() { readFarmCfg(); config.farm.running = true; config.farm.nextAt = 0; save(); setFarmStatus(true); setFarmProg('Lendo o assistente…'); pushLog('Saque iniciado — modo ' + config.farm.mode + ', ordem por ' + config.farm.order + (config.farm.dynTemplate ? ', template dinâmico' : '') + '.', 'ok', 'farm'); farmTick(); }
  function farmStop() { readFarmCfg(); config.farm.running = false; save(); clearTimeout(farmTimer); setFarmStatus(false); setFarmProg('Saque parado.'); pushLog('Saque parado.', '', 'farm'); }
  function setFarmStatus(on) { setBtnState('twmgr-farm-start', 'twmgr-farm-stop', on, '● Saqueando', '▶ Saquear'); }
  // Barra de progresso do ciclo DENTRO da aba Saque (substituiu a linha viva no log, que empurrava
  // as outras mensagens e só cabia em texto). Aqui dá pra desenhar barra de verdade.
  function setFarmProg(html) { const el = document.getElementById('twmgr-farm-prog'); if (el) el.innerHTML = html; }
  function farmProgHTML(done, total, right) {
    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round(done / total * 100))) : 0;
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<div style="flex:1;height:9px;background:rgba(255,255,255,.09);border-radius:5px;overflow:hidden">' +
        '<div style="width:' + pct + '%;height:100%;background:#2e7d3a;transition:width .25s"></div></div>' +
      '<span style="white-space:nowrap;font-variant-numeric:tabular-nums">' + done + '/' + total + '</span></div>' +
      (right ? ('<div style="margin-top:3px;opacity:.85">' + right + '</div>') : '');
  }
  function readWallCfg() {
    const wn = document.getElementById('twmgr-wall-min'); if (wn) { config.wall.wallMin = parseInt(wn.value, 10); if (isNaN(config.wall.wallMin)) config.wall.wallMin = 1; }
    const wx = document.getElementById('twmgr-wall-max'); if (wx) { config.wall.wallMax = parseInt(wx.value, 10); if (isNaN(config.wall.wallMax)) config.wall.wallMax = 6; }
    const wm = document.getElementById('twmgr-wall-mode'); if (wm) config.wall.ramMode = wm.value || 'auto';
    const wa = document.getElementById('twmgr-wall-axe'); if (wa) config.wall.axeCount = Math.max(1, parseInt(wa.value, 10) || 80);
    const w6 = document.getElementById('twmgr-wall-ramw6'); if (w6) config.wall.ramWall6 = Math.max(1, parseInt(w6.value, 10) || 24);
    const wf = document.getElementById('twmgr-wall-ramfix'); if (wf) config.wall.ramFixed = Math.max(1, parseInt(wf.value, 10) || 20);
    const wi = document.getElementById('twmgr-wall-int'); if (wi) config.wall.interval = Math.max(1, parseInt(wi.value, 10) || 10) * 60;
    save();
  }
  function wallStart() { readWallCfg(); config.wall.running = true; config.wall.nextAt = 0; save(); setWallStatus(true); pushLog('Muralha iniciada — muros ' + config.wall.wallMin + ' a ' + config.wall.wallMax + ', ' + config.wall.axeCount + ' bárbaro/ataque, aríete ' + config.wall.ramMode + '.', 'ok', 'wall'); wallTick(); }
  function wallStop() { readWallCfg(); config.wall.running = false; save(); clearTimeout(wallTimer); setWallStatus(false); pushLog('Muralha parada.', '', 'wall'); }
  function setWallStatus(on) { setBtnState('twmgr-wall-start', 'twmgr-wall-stop', on, '● Quebrando', '▶ Quebrar'); }
  async function runDiagnostics() {
    pushLog('Diagnóstico: lendo estado da aldeia…');
    try {
      const st = await getVillageState();
      const av = UNITS.filter(([u]) => st.avail[u] > 0).map(([u, n]) => n + ':' + st.avail[u]).join('  ') || '(nenhuma disponível)';
      pushLog('Tropas → ' + av);
      if (!st.commands.length) pushLog('Comandos → nenhum movimento detectado.');
      else st.commands.forEach((c) => pushLog('cmd · ' + c.kind + ' · ' + (c.coord || '?') + ' · volta em ' + (c.endMs ? fmt(c.endMs - Date.now()) : '?')));
      showTab('log');
    } catch (e) { pushLog('Diagnóstico falhou: ' + (e.message || e), 'err'); }
  }

