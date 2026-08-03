  // ==================== FAKES (multi-alvo, multi-origem, fake eficiente) ====================
  async function fakePrepare(vid, x, y, amounts, kind) {
    const p1 = new URLSearchParams();
    Object.entries(amounts).forEach(([u, a]) => p1.set(u, String(a)));
    p1.set('x', String(x)); p1.set('y', String(y)); p1.set('input', x + '|' + y);
    if (kind === 'support') p1.set('support', 'l'); else p1.set('attack', 'l');
    p1.set('h', CSRF);
    const r1 = await fetch('/game.php?village=' + vid + '&screen=place&try=confirm', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p1.toString() });
    let t1 = await r1.text();
    try { const j = JSON.parse(t1); t1 = (j.response && j.response.dialog) || j.dialog || t1; } catch (e) {}
    const doc = new DOMParser().parseFromString(t1, 'text/html');
    const form = doc.querySelector('#command-data-form') || doc.querySelector('form[action*="action=command"]');
    if (!form) { const errEl = doc.querySelector('.error, .autoHideBox, #command_confirmation_error'); throw new Error(errEl ? errEl.textContent.trim().slice(0, 80) : 'confirmação falhou (tropa/alvo)'); }
    let dur = null;
    const dd = doc.querySelector('[data-duration]');
    if (dd) dur = parseInt(dd.getAttribute('data-duration'), 10);
    if (!dur) { const txt = doc.body ? doc.body.textContent : t1; const m = txt.match(/dura[çc][aã]o[^0-9]{0,12}(\d{1,2}):([0-5]\d):([0-5]\d)/i); if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); }
    const params = {};
    form.querySelectorAll('input, select').forEach((el) => { if (el.name) params[el.name] = el.value; });
    if (!params.h) params.h = CSRF;
    const action = form.getAttribute('action') || ('/game.php?village=' + vid + '&screen=place&action=command&h=' + CSRF);
    return { action: absUrl(action), params: params, dur: dur };
  }
  async function fakeFire(prep) {
    const r2 = await fetch(prep.action, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(prep.params).toString() });
    const t2 = await r2.text();
    if (/n[aã]o tem tropas suficientes|not enough/i.test(t2)) throw new Error('recusado: tropas insuficientes');
    return true;
  }
  const attackPrepare = fakePrepare, attackFire = fakeFire;
  const FAKE_POP = { spear: 1, sword: 1, axe: 1, archer: 1, spy: 2, light: 4, marcher: 5, heavy: 6, ram: 5, catapult: 8, knight: 10, snob: 100 };
  // Capacidade de carga de um conjunto de unidades (usa o CARRY declarado lá no topo).
  const carryOf = (units) => Object.keys(units || {}).reduce((s, u) => s + (parseInt(units[u], 10) || 0) * (CARRY[u] || 0), 0);
  function parseCoords(raw) {
    const out = [], seen = {};
    (raw || '').split(/[\s,;]+/).forEach((tok) => { const m = tok.match(/^(\d{1,3})\|(\d{1,3})$/); if (m) { const c = m[1] + '|' + m[2]; if (!seen[c]) { seen[c] = 1; out.push({ x: m[1], y: m[2] }); } } });
    return out;
  }
  async function getFakeVillage(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=place', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const avail = {};
    UNITS.forEach(([u]) => { let n = 0; const alt = doc.querySelector('a.units-entry-all[data-unit="' + u + '"]'); if (alt) { const dc = alt.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (alt.textContent || '').replace(/\D/g, ''), 10); } avail[u] = isNaN(n) ? 0 : n; });
    const pm = doc.querySelector('#pop_max_label');
    const popMax = pm ? (parseInt((pm.textContent || '').replace(/\D/g, ''), 10) || 0) : 0;
    return { avail: applyReservationsToAvail(vid, avail), popMax: popMax };
  }
  function computeFakeComp(T, avail, siege, filler) {
    const amounts = {}; let pop = 0;
    if (siege && siege !== 'none' && (avail[siege] || 0) >= 1) { amounts[siege] = 1; pop += FAKE_POP[siege] || 1; }
    const fp = FAKE_POP[filler] || 1;
    const need = Math.max(0, T - pop);
    let q = Math.ceil(need / fp);
    let ok = true;
    if (q > 0) { if ((avail[filler] || 0) >= q) { amounts[filler] = (amounts[filler] || 0) + q; pop += q * fp; } else { ok = false; const have = avail[filler] || 0; if (have > 0) { amounts[filler] = (amounts[filler] || 0) + have; pop += have * fp; } } }
    return { amounts: amounts, pop: pop, ok: ok && pop >= T && Object.keys(amounts).length > 0 };
  }
  let _pointsCache = null;
  async function getVillagePoints() {
    if (_pointsCache) return _pointsCache;
    const res = await fetch('/map/village.txt', { credentials: 'include' });
    const txt = await res.text();
    const map = {};
    txt.split('\n').forEach((line) => { const f = line.split(','); if (f.length >= 6) { const id = f[0], pts = parseInt(f[5], 10); if (id && !isNaN(pts)) map[id] = pts; } });
    _pointsCache = map;
    return map;
  }
  function fakeCapacity(T, availIn, siege, filler) {
    const avail = Object.assign({}, availIn);
    let total = 0, withSiege = 0;
    while (total < 5000) {
      const c = computeFakeComp(T, avail, siege, filler);
      if (!c.ok) break;
      if (c.amounts[siege]) withSiege++;
      Object.entries(c.amounts).forEach(([u, n]) => { avail[u] = Math.max(0, (avail[u] || 0) - n); });
      total++;
    }
    return { total: total, withSiege: withSiege };
  }
  async function fakeGenerate(preview) {
    readFakesCfg();
    const cfg = config.fakes;
    const targets = parseCoords(cfg.targetsRaw);
    const origins = Object.keys(cfg.origins).filter((v) => cfg.origins[v]);
    if (!targets.length) { pushLog('Fakes: nenhum alvo válido colado.', 'err', 'fakes'); return null; }
    if (!origins.length) { pushLog('Fakes: selecione ao menos 1 origem.', 'err', 'fakes'); return null; }
    if (!cfg.arrLocal) { pushLog('Fakes: defina o horário de chegada.', 'err', 'fakes'); return null; }
    const arriveAt = arrivalToServerMs(cfg.arrLocal);
    let points = {}; try { points = await getVillagePoints(); } catch (e) { pushLog('Fakes: não li os pontos (village.txt), usando a fazenda como base.', 'err', 'fakes'); }
    const pairs = [];
    if (cfg.mode === 'all') { origins.forEach((o) => targets.forEach((t) => pairs.push({ origin: o, x: t.x, y: t.y }))); }
    else { targets.forEach((t, i) => { pairs.push({ origin: origins[i % origins.length], x: t.x, y: t.y }); }); }
    const byO = {}; pairs.forEach((p) => { (byO[p.origin] = byO[p.origin] || []).push(p); });
    const gen = [];
    for (const o of Object.keys(byO)) {
      let st; try { st = await getFakeVillage(o); } catch (e) { pushLog('Fakes: erro ao ler a aldeia ' + o + ' (' + (e.message || e) + ').', 'err', 'fakes'); continue; }
      const base = points[o] || st.popMax;
      const T = cfg.minPop > 0 ? cfg.minPop : Math.max(1, Math.ceil((cfg.pct / 100) * base));
      const cap = fakeCapacity(T, st.avail, cfg.siege, cfg.filler);
      const avail = Object.assign({}, st.avail);
      let made = 0, failed = 0, comp0 = null;
      for (const p of byO[o]) {
        const c = computeFakeComp(T, avail, cfg.siege, cfg.filler);
        if (!c.ok) { failed++; continue; }
        Object.entries(c.amounts).forEach(([u, n]) => { avail[u] = Math.max(0, (avail[u] || 0) - n); });
        if (!comp0) comp0 = c;
        made++;
        gen.push({ id: genId(), origin: o, x: p.x, y: p.y, amounts: c.amounts, arriveAt: arriveAt, durSec: null, sendAt: 0, state: 'armed', error: null });
      }
      const cdesc = comp0 ? Object.entries(comp0.amounts).map(([u, n]) => u + '=' + n).join('+') + ' (pop ' + comp0.pop + ')' : '—';
      pushLog(o + ': ' + made + ' fake(s)' + (failed ? ', ' + failed + ' sem tropa' : '') + ' · teto ' + cap.total + ' (' + cap.withSiege + ' c/ isca) · ' + cdesc + ' · pop mín ' + T + (points[o] ? ' (1% de ' + points[o] + ' pts)' : ''), '', 'fakes');
    }
    pushLog('Fakes ' + (preview ? '(prévia)' : 'gerados') + ': ' + gen.length + ' no total, chega ' + (cfg.arrLocal || '').replace('T', ' ') + '.', 'ok', 'fakes');
    return gen;
  }
  function scheduleFakeFire(f) {
    const lead = 12000;
    const delayPrep = Math.max(0, (f.sendAt - lead) - serverNow());
    setTimeout(async () => {
      if (!config.fakes.running || f.state !== 'scheduled' || lockOther()) return;
      let prep;
      try { prep = await fakePrepare(f.origin, f.x, f.y, f.amounts); }
      catch (e) { f.state = 'error'; f.error = (e.message || e); save(); pushLog('Fake ' + f.x + '|' + f.y + ': preparo falhou (' + f.error + ').', 'err', 'fakes'); return; }
      const fireDelay = Math.max(0, (f.sendAt - config.fakes.offsetMs) - serverNow());
      setTimeout(async () => {
        if (!config.fakes.running || f.state !== 'scheduled' || lockOther()) return;
        try { await fakeFire(prep); f.state = 'sent'; f.sentAt = serverNow(); pushLog('🎭 Fake enviado → ' + f.x + '|' + f.y + ' (de ' + f.origin + ')', 'ok', 'fakes'); }
        catch (e) { f.state = 'error'; f.error = (e.message || e); pushLog('Fake ' + f.x + '|' + f.y + ': envio falhou (' + f.error + ').', 'err', 'fakes'); }
        save();
      }, fireDelay);
    }, delayPrep);
  }
  async function fakeTick() {
    clearTimeout(fakeTimer);
    if (!config.fakes.running) return;
    if (lockOther()) { fakeTimer = setTimeout(fakeTick, 5000); return; }
    if (captchaBlocked()) { fakeTimer = setTimeout(fakeTick, 30000); return; }
    claimLock();
    const nowS = serverNow();
    for (const f of config.fakes.gen) {
      if (f.state === 'sent' || f.state === 'error' || f.state === 'scheduled') continue;
      if (!f.arriveAt) { f.state = 'error'; f.error = 'sem horário'; continue; }
      if (f.durSec == null) {
        try { const p = await fakePrepare(f.origin, f.x, f.y, f.amounts); f.durSec = p.dur; }
        catch (e) { f.state = 'error'; f.error = (e.message || e); pushLog('Fake ' + f.x + '|' + f.y + ': ' + f.error, 'err', 'fakes'); continue; }
        if (!f.durSec) { f.state = 'error'; f.error = 'sem duração'; continue; }
      }
      f.sendAt = f.arriveAt - f.durSec * 1000;
      if (f.sendAt - nowS < -2000) { f.state = 'error'; f.error = 'envio no passado'; continue; }
      f.state = 'scheduled'; scheduleFakeFire(f);
    }
    save();
    fakeTimer = setTimeout(fakeTick, 30000);
  }
  async function fillFakeGroups() {
    const selEl = document.getElementById('twmgr-fk-group'); if (!selEl) return;
    let groups = []; try { groups = await getGroups(); } catch (e) { /* sem grupos: fica só "Todas" */ }
    const cur = config.fakes.group || '';
    selEl.innerHTML = '<option value="">Todas as aldeias</option>' +
      groups.map((g) => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('');
    selEl.value = cur;
  }
  async function renderFakeOrigins() {
    const cont = document.getElementById('twmgr-fk-origins'); if (!cont) return;
    let vils = []; try { vils = await getAllVillagesCached(); } catch (e) { vils = [{ vid: CUR_VID, name: CUR_NAME }]; }
    const gid = config.fakes.group || '';
    if (gid) {
      try { const inGrp = await getVillagesInGroup(gid); const ok = {}; inGrp.forEach((v) => { ok[v.vid] = 1; }); vils = vils.filter((v) => ok[v.vid]); }
      catch (e) { pushLog('Fakes: não consegui filtrar pelo grupo (' + (e.message || e) + '); mostrando todas.', 'err', 'fakes'); }
    }
    const sel = config.fakes.origins || {};
    cont.innerHTML = vils.length
      ? vils.map((v) => '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#5c4527;margin:1px 0"><input type="checkbox" class="twmgr-fk-origin" data-vid="' + v.vid + '"' + (sel[v.vid] ? ' checked' : '') + '>' + esc(v.name) + '</label>').join('')
      : '<div style="font-size:10px;color:#6e5a2f;padding:4px">nenhuma aldeia neste grupo</div>';
    cont.querySelectorAll('.twmgr-fk-origin').forEach((cb) => cb.addEventListener('change', readFakesCfg));
    const cnt = document.getElementById('twmgr-fk-count'); if (cnt) cnt.textContent = vils.length ? ('(' + vils.length + ')') : '';
  }
  function readFakesCfg() {
    const c = config.fakes, g = (id) => document.getElementById(id);
    if (g('twmgr-fk-targets')) c.targetsRaw = g('twmgr-fk-targets').value;
    if (g('twmgr-fk-arr')) c.arrLocal = g('twmgr-fk-arr').value;
    if (g('twmgr-fk-offset')) c.offsetMs = Math.max(0, parseInt(g('twmgr-fk-offset').value, 10) || 150);
    if (g('twmgr-fk-pct')) c.pct = Math.max(0, parseFloat((g('twmgr-fk-pct').value || '').replace(',', '.')) || 1);
    if (g('twmgr-fk-minpop')) c.minPop = Math.max(0, parseInt(g('twmgr-fk-minpop').value, 10) || 0);
    if (g('twmgr-fk-siege')) c.siege = g('twmgr-fk-siege').value;
    if (g('twmgr-fk-filler')) c.filler = g('twmgr-fk-filler').value;
    const mode = document.querySelector('input[name="twmgr-fk-mode"]:checked'); if (mode) c.mode = mode.value;
    // MERGE (não substitui): o filtro por grupo esconde checkboxes de outros grupos —
    // reconstruir do zero apagaria as origens já marcadas fora do grupo visível agora.
    const origins = Object.assign({}, c.origins || {});
    document.querySelectorAll('.twmgr-fk-origin').forEach((cb) => { const vid = cb.getAttribute('data-vid'); if (cb.checked) origins[vid] = true; else delete origins[vid]; });
    c.origins = origins;
    save();
  }
  async function fakePreview() { await fakeGenerate(true); }
  function setFakeStatus(on) { setBtnState('twmgr-fk-start', 'twmgr-fk-stop', on, '● Armado', '▶ Armar'); }
  async function fakeStart() {
    const gen = await fakeGenerate(false);
    if (!gen || !gen.length) return;
    config.fakes.gen = gen; config.fakes.running = true; save();
    setFakeStatus(true); pushLog('Fakes armados — ' + gen.length + ' no total.', 'ok', 'fakes'); fakeTick();
  }
  function fakeStop() { readFakesCfg(); config.fakes.running = false; save(); clearTimeout(fakeTimer); setFakeStatus(false); pushLog('Fakes desarmados.', '', 'fakes'); }

