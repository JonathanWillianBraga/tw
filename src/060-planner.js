  // ==================== PLANNER (Ataque Coordenado) ====================
  // Lê o "home available" — tropas em casa (aproximação: usa o max do input do jogo se disponível,
  // senão cai no data-all-count do link geral). O Fase 3 (UI) confirma o parser no jogo real.
  async function getVillageHomeAvail(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=place', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const home = {};
    UNITS.forEach(([u]) => {
      let n = 0;
      const inp = doc.querySelector('#unit_input_' + u);
      if (inp) {
        // placeholder típico: "0/N" onde N é o total em casa
        const ph = inp.getAttribute('placeholder') || '';
        const mm = ph.match(/(\d+)\s*\/\s*(\d+)/);
        if (mm) n = parseInt(mm[2], 10) || 0;
        if (!n) { const mx = inp.getAttribute('data-max') || inp.getAttribute('max') || inp.getAttribute('data-all-count-home'); if (mx) n = parseInt(mx, 10) || 0; }
      }
      if (!n) {
        const alt = doc.querySelector('a.units-entry-all[data-unit="' + u + '"]');
        if (alt) { const dc = alt.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (alt.textContent || '').replace(/\D/g, ''), 10) || 0; }
      }
      home[u] = isNaN(n) ? 0 : n;
    });
    return home;
  }

  const OFF_UNITS = ['spear', 'sword', 'axe', 'archer', 'light', 'marcher', 'heavy', 'ram', 'catapult'];
  const DEF_UNITS = ['spear', 'sword', 'archer', 'heavy', 'knight'];
  const NOBLE_ESCORT_PCT = 0.6;
  const FAKE_MIN_POP = 5;

  // Dado um preset e o avail (home) de uma aldeia, retorna { amounts, warn: [...] }.
  function computePreset(kind, avail) {
    const amounts = {}; const warn = [];
    const av = (u) => avail[u] || 0;
    if (kind === 'zero') return { amounts: {}, warn: [] };
    if (kind === 'attack') {
      OFF_UNITS.forEach((u) => { if (av(u) > 0) amounts[u] = av(u); });
      if (Object.keys(amounts).length === 0) warn.push('sem tropas de ataque');
      return { amounts: amounts, warn: warn };
    }
    if (kind === 'noble') {
      if (av('snob') < 1) { warn.push('sem nobre'); return { amounts: amounts, warn: warn }; }
      amounts.snob = 1;
      OFF_UNITS.forEach((u) => { const q = Math.floor(av(u) * NOBLE_ESCORT_PCT); if (q > 0) amounts[u] = q; });
      return { amounts: amounts, warn: warn };
    }
    if (kind === 'fake') {
      let siege = null;
      if (av('ram') >= 1) siege = 'ram';
      else if (av('catapult') >= 1) siege = 'catapult';
      let pop = 0;
      if (siege) { amounts[siege] = 1; pop += FAKE_POP[siege] || 5; }
      else warn.push('sem ram/catapult, fake sem siege');
      const need = Math.max(0, FAKE_MIN_POP - pop);
      if (need > 0) {
        const spies = Math.min(av('spy'), Math.ceil(need / (FAKE_POP.spy || 2)));
        if (spies > 0) amounts.spy = spies;
        else warn.push('sem spy pra completar 5 pop');
      }
      return { amounts: amounts, warn: warn };
    }
    if (kind === 'support') {
      DEF_UNITS.forEach((u) => { if (av(u) > 0) amounts[u] = av(u); });
      if (Object.keys(amounts).length === 0) warn.push('sem tropas de defesa');
      return { amounts: amounts, warn: warn };
    }
    return { amounts: amounts, warn: ['kind desconhecido: ' + kind] };
  }

  // Retorna o ataque atualmente exibido na aba Coordenado (ou o primeiro, se o ativo sumiu).
  function plActive() {
    const p = config.planner;
    return p.attacks.find((a) => a.id === p.activeId) || p.attacks[0];
  }

  // Soma reservas de TODOS os ataques (armados usam rows; em edição usam perVillage) — uma aldeia
  // pode participar de vários ataques ao mesmo tempo, então as reservas se acumulam.
  function plannerRecomputeReservations() {
    const res = {};
    const attacks = (config.planner && config.planner.attacks) || [];
    attacks.forEach((atk) => {
      if (atk.running && Array.isArray(atk.rows)) {
        atk.rows.forEach((r) => {
          if (r.state !== 'armed' && r.state !== 'scheduled') return;
          const vid = String(r.origin); res[vid] = res[vid] || {};
          Object.entries(r.amounts || {}).forEach(([u, q]) => { res[vid][u] = (res[vid][u] || 0) + (parseInt(q, 10) || 0); });
        });
      } else {
        Object.keys(atk.selected || {}).forEach((vid) => {
          if (!atk.selected[vid]) return;
          const waves = (atk.perVillage || {})[vid]; if (!waves) return;
          res[vid] = res[vid] || {};
          waves.forEach((pv) => {
            Object.entries(pv.amounts || {}).forEach(([u, q]) => { const n = parseInt(q, 10) || 0; if (n > 0) res[vid][u] = (res[vid][u] || 0) + n; });
          });
        });
      }
    });
    config.reservations = res;
    save();
  }

  // Converte perVillage (agora uma LISTA de ondas por aldeia) de UM ataque em rows[] — 1 linha por onda,
  // cada onda com seu próprio horário (base + offset).
  function plannerBuildRows(atk) {
    const baseMs = arrivalToServerMs(atk.arriveLocal); if (!baseMs) throw new Error('chegada base inválida');
    const rows = [];
    Object.keys(atk.selected || {}).forEach((vid) => {
      if (!atk.selected[vid]) return;
      const waves = (atk.perVillage || {})[vid]; if (!waves || !waves.length) return;
      waves.forEach((pv) => {
        const amounts = {}; let any = false;
        Object.entries(pv.amounts || {}).forEach(([u, q]) => { const n = parseInt(q, 10) || 0; if (n > 0) { amounts[u] = n; any = true; } });
        if (!any) return;
        rows.push({
          id: genId(), origin: String(vid), x: String(atk.targetX), y: String(atk.targetY),
          kind: pv.kind || 'attack', amounts: amounts,
          arriveAt: baseMs + (pv.offsetMs || 0), offsetMs: pv.offsetMs || 0,
          durSec: null, sendAt: 0, state: 'armed', error: null, sentAt: null,
        });
      });
    });
    atk.rows = rows;
    return rows;
  }

  const PL_ICON = { attack: '🧹', noble: '👑', fake: '🎭', support: '🛡️' };

  function schedulePlannerFire(atk, r) {
    const lead = 12000;
    const delayPrep = Math.max(0, (r.sendAt - lead) - serverNow());
    setTimeout(async () => {
      if (!atk.running || r.state !== 'scheduled' || lockOther()) return;
      let prep;
      try { prep = await attackPrepare(r.origin, r.x, r.y, r.amounts, r.kind); }
      catch (e) { r.state = 'error'; r.error = (e.message || e); save(); plannerRecomputeReservations(); pushLog((PL_ICON[r.kind] || '') + ' [' + atk.name + '] ' + r.kind + ' ' + r.x + '|' + r.y + ': preparo falhou (' + r.error + ').', 'err', 'planner'); return; }
      const fireDelay = Math.max(0, (r.sendAt - (atk.offsetMs || 0)) - serverNow());
      setTimeout(async () => {
        if (!atk.running || r.state !== 'scheduled' || lockOther()) return;
        try { await attackFire(prep); r.state = 'sent'; r.sentAt = serverNow(); pushLog((PL_ICON[r.kind] || '') + ' [' + atk.name + '] ' + r.kind + ' enviado → ' + r.x + '|' + r.y + ' (de ' + r.origin + ')', 'ok', 'planner'); }
        catch (e) { r.state = 'error'; r.error = (e.message || e); pushLog((PL_ICON[r.kind] || '') + ' [' + atk.name + '] ' + r.kind + ' ' + r.x + '|' + r.y + ': envio falhou (' + r.error + ').', 'err', 'planner'); }
        save(); plannerRecomputeReservations();
      }, fireDelay);
    }, delayPrep);
  }

  // Tick único e global: percorre TODOS os ataques armados (cada um pode estar mirando alvo/horário diferentes).
  async function plannerTick() {
    clearTimeout(plannerTimer);
    const attacks = (config.planner && config.planner.attacks) || [];
    if (!attacks.some((a) => a.running)) return;
    if (lockOther()) { plannerTimer = setTimeout(plannerTick, 5000); return; }
    if (captchaBlocked()) { plannerTimer = setTimeout(plannerTick, 30000); return; }
    claimLock();
    const nowS = serverNow();
    for (const atk of attacks) {
      if (!atk.running) continue;
      for (const r of atk.rows) {
        if (r.state === 'sent' || r.state === 'error' || r.state === 'scheduled') continue;
        if (!r.arriveAt) { r.state = 'error'; r.error = 'sem horário'; continue; }
        if (r.durSec == null) {
          try { const p = await attackPrepare(r.origin, r.x, r.y, r.amounts, r.kind); r.durSec = p.dur; }
          catch (e) { r.state = 'error'; r.error = (e.message || e); pushLog((PL_ICON[r.kind] || '') + ' [' + atk.name + '] ' + r.kind + ' ' + r.x + '|' + r.y + ': ' + r.error, 'err', 'planner'); continue; }
          if (!r.durSec) { r.state = 'error'; r.error = 'sem duração'; continue; }
        }
        r.sendAt = r.arriveAt - r.durSec * 1000;
        if (r.sendAt - nowS < -2000) { r.state = 'error'; r.error = 'envio no passado'; continue; }
        r.state = 'scheduled'; schedulePlannerFire(atk, r);
      }
    }
    save();
    plannerTimer = setTimeout(plannerTick, 30000);
  }

  function plannerStart(atk) {
    if (!atk.targetX || !atk.targetY) { pushLog('[' + atk.name + ']: informe o alvo (x|y).', 'err', 'planner'); return; }
    if (!atk.arriveLocal) { pushLog('[' + atk.name + ']: informe a chegada base.', 'err', 'planner'); return; }
    let rows;
    try { rows = plannerBuildRows(atk); } catch (e) { pushLog('[' + atk.name + ']: ' + (e.message || e), 'err', 'planner'); return; }
    if (!rows.length) { pushLog('[' + atk.name + ']: nenhuma aldeia com tropas configuradas.', 'err', 'planner'); return; }
    atk.running = true;
    save();
    plannerRecomputeReservations();
    pushLog('🎯 [' + atk.name + '] armado — ' + rows.length + ' ataque(s) contra ' + atk.targetX + '|' + atk.targetY + '.', 'ok', 'planner');
    plannerTick();
  }

  function plannerStop(atk) {
    atk.running = false;
    atk.rows = [];
    save();
    plannerRecomputeReservations();
    pushLog('🎯 [' + atk.name + '] desarmado.', '', 'planner');
    if (!config.planner.attacks.some((a) => a.running)) clearTimeout(plannerTimer);
  }

  // Cache de aldeias (nome/coord) para render dos cards saber o nome.
  let _plVilCache = null;

  async function renderPlannerVillages(atk) {
    const cont = document.getElementById('twmgr-pl-villages'); if (!cont) return;
    let vils = []; try { vils = await getAllVillagesCached(); } catch (e) { vils = [{ vid: CUR_VID, name: CUR_NAME }]; }
    _plVilCache = vils;
    const tgtCoord = (atk.targetX && atk.targetY) ? (atk.targetX + '|' + atk.targetY) : '';
    vils.forEach((v) => { v.dist = (v.coord && tgtCoord) ? coordDist(v.coord, tgtCoord) : null; });
    vils.sort((a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist));
    cont.innerHTML = vils.map((v) => {
      const distTxt = v.dist != null ? (' · dist ' + v.dist.toFixed(1)) : '';
      return '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#5c4527;margin:1px 0"><input type="checkbox" class="twmgr-pl-vil" data-vid="' + v.vid + '"' + (atk.selected[v.vid] ? ' checked' : '') + '>' + esc(v.name) + '<span style="color:#6e5a2a">' + distTxt + '</span></label>';
    }).join('');
    cont.querySelectorAll('.twmgr-pl-vil').forEach((cb) => cb.addEventListener('change', () => {
      const vid = cb.getAttribute('data-vid');
      if (cb.checked) { atk.selected[vid] = true; if (!atk.perVillage[vid] || !atk.perVillage[vid].length) atk.perVillage[vid] = [{ kind: 'attack', offsetMs: 0, amounts: {} }]; }
      else { delete atk.selected[vid]; delete atk.perVillage[vid]; delete atk.homeAvail[vid]; }
      save(); plannerRecomputeReservations(); renderPlannerCards(atk);
    }));
  }

  // Retorna "HH:MM:SS.mmm" (local) para um arriveAt em ms de servidor.
  function fmtArriveLocal(arriveMsServer) {
    if (!arriveMsServer) return '';
    const d = new Date(arriveMsServer - wallToServerOffset());
    const pad = (n, w) => String(n).padStart(w, '0');
    return pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2) + '.' + pad(d.getMilliseconds(), 3);
  }

  // Cada aldeia pode ter várias ONDAS (waves) — cada onda é um ataque/nobre/fake/apoio próprio, com seu
  // próprio horário de chegada, dentro do mesmo ataque coordenado.
  function renderPlannerCards(atk) {
    const cont = document.getElementById('twmgr-pl-cards'); if (!cont) return;
    const sel = Object.keys(atk.selected || {}).filter((v) => atk.selected[v]);
    if (!sel.length) {
      cont.innerHTML = '<div style="font-size:10px;color:#6e5a2a;padding:6px;text-align:center">— marque aldeias acima e clique em <b>🔄 carregar tropas</b> —</div>';
      return;
    }
    const vilBy = {}; (_plVilCache || []).forEach((v) => { vilBy[v.vid] = v; });
    const baseMs = arrivalToServerMs(atk.arriveLocal);
    const kindOpt = [['attack', '🧹 attack'], ['noble', '👑 noble'], ['fake', '🎭 fake'], ['support', '🛡️ support']];
    cont.innerHTML = sel.map((vid) => {
      const waves = atk.perVillage[vid] || [];
      const home = atk.homeAvail[vid] || {};
      const loaded = home.loadedAt || 0;
      const v = vilBy[vid] || { name: 'ID ' + vid };
      const warnTxt = loaded ? '' : '<span style="color:#c2592c;font-size:9px">⚠ tropas não carregadas</span>';
      const wavesHTML = waves.map((pv, widx) => {
        const kindSel = kindOpt.map(([k, l]) => '<option value="' + k + '"' + (pv.kind === k ? ' selected' : '') + '>' + l + '</option>').join('');
        const arrTxt = baseMs ? fmtArriveLocal(baseMs + (pv.offsetMs || 0)) : '—';
        const grid = UNITS.map(([u, lbl]) => {
          const max = home[u] || 0, cur = (pv.amounts && pv.amounts[u]) || 0;
          return '<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#5c4527"><span style="width:56px">' + unitIcon(u, lbl) + '</span><input class="twmgr-pl-amt" data-vid="' + vid + '" data-widx="' + widx + '" data-u="' + u + '" type="number" min="0" max="' + max + '" value="' + cur + '" style="width:56px" /><span style="color:#6e5a2a">/' + max + '</span></label>';
        }).join('');
        return '<div style="border-top:1px dashed #dcc78f;padding-top:6px;margin-top:6px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px">' +
            '<div style="font-size:10px;color:#6e5a2a">Onda ' + (widx + 1) + '</div>' +
            '<div style="display:flex;gap:4px;align-items:center;font-size:10px">' +
              '<select class="twmgr-pl-kind" data-vid="' + vid + '" data-widx="' + widx + '" style="font-size:10px">' + kindSel + '</select>' +
              '<span>off</span><input class="twmgr-pl-off" data-vid="' + vid + '" data-widx="' + widx + '" type="number" value="' + (pv.offsetMs || 0) + '" step="100" style="width:64px;font-size:10px"><span>ms</span>' +
              '<span class="twmgr-pl-wave-del" data-vid="' + vid + '" data-widx="' + widx + '" title="remover onda" style="cursor:pointer;opacity:.7">✕</span>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:10px;color:#6e5a2a;margin-bottom:4px">→ chega às <b style="color:#5c4527">' + arrTxt + '</b></div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px">' + grid + '</div>' +
          '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">' +
            '<button class="twmgr-pl-preset twmgr-btn twmgr-ghost" data-vid="' + vid + '" data-widx="' + widx + '" data-preset="attack" style="padding:3px 6px;font-size:10px">🧹 all off</button>' +
            '<button class="twmgr-pl-preset twmgr-btn twmgr-ghost" data-vid="' + vid + '" data-widx="' + widx + '" data-preset="noble" style="padding:3px 6px;font-size:10px">👑 nobre</button>' +
            '<button class="twmgr-pl-preset twmgr-btn twmgr-ghost" data-vid="' + vid + '" data-widx="' + widx + '" data-preset="fake" style="padding:3px 6px;font-size:10px">🎭 fake</button>' +
            '<button class="twmgr-pl-preset twmgr-btn twmgr-ghost" data-vid="' + vid + '" data-widx="' + widx + '" data-preset="support" style="padding:3px 6px;font-size:10px">🛡️ all def</button>' +
            '<button class="twmgr-pl-preset twmgr-btn twmgr-ghost" data-vid="' + vid + '" data-widx="' + widx + '" data-preset="zero" style="padding:3px 6px;font-size:10px">Zerar</button>' +
          '</div>' +
        '</div>';
      }).join('');
      return '<div style="border:1px solid #dcc78f;border-radius:6px;padding:6px;margin:6px 0">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px">' +
          '<div style="font-size:11px;color:#7a5710"><b>' + esc(v.name) + '</b> ' + warnTxt + '</div>' +
          '<span class="twmgr-pl-wave-add" data-vid="' + vid + '" title="adicionar onda" style="cursor:pointer;font-size:10px;color:#7a5710;border:1px dashed #a9843f;border-radius:4px;padding:2px 6px">+ onda</span>' +
        '</div>' +
        wavesHTML +
      '</div>';
    }).join('');
    // Wire eventos dos cards
    cont.querySelectorAll('.twmgr-pl-kind').forEach((el) => el.addEventListener('change', readPlannerCfg));
    cont.querySelectorAll('.twmgr-pl-off').forEach((el) => el.addEventListener('change', readPlannerCfg));
    cont.querySelectorAll('.twmgr-pl-amt').forEach((el) => el.addEventListener('change', readPlannerCfg));
    cont.querySelectorAll('.twmgr-pl-wave-add').forEach((el) => el.addEventListener('click', () => {
      const vid = el.getAttribute('data-vid');
      atk.perVillage[vid] = atk.perVillage[vid] || [];
      // Nova onda herda offset = max(existentes) + 200ms, pra chegar sempre depois da anterior sem colidir.
      const maxOff = atk.perVillage[vid].reduce((m, w) => Math.max(m, w.offsetMs || 0), 0);
      const nextOff = atk.perVillage[vid].length ? maxOff + 200 : 0;
      atk.perVillage[vid].push({ kind: 'attack', offsetMs: nextOff, amounts: {} });
      save(); renderPlannerCards(atk);
    }));
    cont.querySelectorAll('.twmgr-pl-wave-del').forEach((el) => el.addEventListener('click', () => {
      const vid = el.getAttribute('data-vid'), widx = parseInt(el.getAttribute('data-widx'), 10);
      if (atk.perVillage[vid]) atk.perVillage[vid].splice(widx, 1);
      save(); plannerRecomputeReservations(); renderPlannerCards(atk);
    }));
    cont.querySelectorAll('.twmgr-pl-preset').forEach((btn) => btn.addEventListener('click', () => {
      const vid = btn.getAttribute('data-vid'), widx = parseInt(btn.getAttribute('data-widx'), 10), preset = btn.getAttribute('data-preset');
      const avail = atk.homeAvail[vid] || {};
      const r = computePreset(preset, avail);
      atk.perVillage[vid] = atk.perVillage[vid] || [];
      atk.perVillage[vid][widx] = atk.perVillage[vid][widx] || { kind: 'attack', offsetMs: 0, amounts: {} };
      atk.perVillage[vid][widx].amounts = r.amounts;
      if (r.warn.length) pushLog('Preset ' + preset + ' em ' + vid + ': ' + r.warn.join(', '), 'err', 'planner');
      save(); plannerRecomputeReservations(); renderPlannerCards(atk);
    }));
  }

  async function plannerLoadHomeAvail(atk) {
    const sel = Object.keys(atk.selected || {}).filter((v) => atk.selected[v]);
    if (!sel.length) { pushLog('Marque pelo menos 1 aldeia antes de carregar tropas.', 'err', 'planner'); return; }
    pushLog('[' + atk.name + ']: carregando tropas de ' + sel.length + ' aldeia(s)…', '', 'planner');
    const results = await Promise.allSettled(sel.map((vid) => getVillageHomeAvail(vid).then((h) => ({ vid, h }))));
    let ok = 0, fail = 0;
    results.forEach((r) => {
      if (r.status === 'fulfilled') { const h = r.value.h; h.loadedAt = Date.now(); atk.homeAvail[r.value.vid] = h; ok++; }
      else fail++;
    });
    save();
    pushLog('[' + atk.name + ']: tropas carregadas em ' + ok + '/' + sel.length + (fail ? ' (' + fail + ' falharam)' : '') + '.', ok ? 'ok' : 'err', 'planner');
    renderPlannerCards(atk);
  }

  // Lê os campos da UI (que sempre refletem o ataque ATIVO) de volta pro objeto do ataque ativo.
  function readPlannerCfg() {
    const atk = plActive(), g = (id) => document.getElementById(id);
    if (g('twmgr-pl-target-x')) atk.targetX = (g('twmgr-pl-target-x').value || '').replace(/\D/g, '');
    if (g('twmgr-pl-target-y')) atk.targetY = (g('twmgr-pl-target-y').value || '').replace(/\D/g, '');
    if (g('twmgr-pl-arr')) atk.arriveLocal = g('twmgr-pl-arr').value;
    if (g('twmgr-pl-offset')) atk.offsetMs = Math.max(0, parseInt(g('twmgr-pl-offset').value, 10) || 150);
    document.querySelectorAll('.twmgr-pl-kind').forEach((s) => { const vid = s.getAttribute('data-vid'), widx = parseInt(s.getAttribute('data-widx'), 10); const w = atk.perVillage[vid] && atk.perVillage[vid][widx]; if (w) w.kind = s.value; });
    document.querySelectorAll('.twmgr-pl-off').forEach((s) => { const vid = s.getAttribute('data-vid'), widx = parseInt(s.getAttribute('data-widx'), 10); const w = atk.perVillage[vid] && atk.perVillage[vid][widx]; if (w) w.offsetMs = parseInt(s.value, 10) || 0; });
    document.querySelectorAll('.twmgr-pl-amt').forEach((s) => {
      const vid = s.getAttribute('data-vid'), widx = parseInt(s.getAttribute('data-widx'), 10), u = s.getAttribute('data-u');
      const w = atk.perVillage[vid] && atk.perVillage[vid][widx];
      if (w) { const n = Math.max(0, parseInt(s.value, 10) || 0); if (n > 0) w.amounts[u] = n; else delete w.amounts[u]; }
    });
    save(); plannerRecomputeReservations();
  }

  function setPlannerStatus(on) { setBtnState('twmgr-pl-start', 'twmgr-pl-stop', on, '● Armado', '▶ Armar este ataque'); }

  // ---- Lista de ataques independentes (adicionar/trocar/renomear/remover) ----
  function plannerAddAttack() {
    const n = (config.planner.attacks || []).length + 1;
    const atk = defPlannerAttack('Ataque ' + n);
    config.planner.attacks.push(atk);
    config.planner.activeId = atk.id;
    save();
    renderPlannerTabs();
    renderPlannerActive();
    pushLog('Novo ataque criado: [' + atk.name + '].', '', 'planner');
  }

  function plannerRemoveAttack(id) {
    const atk = config.planner.attacks.find((a) => a.id === id); if (!atk) return;
    if (config.planner.attacks.length <= 1) { pushLog('Precisa manter pelo menos 1 ataque.', 'err', 'planner'); return; }
    if (!confirm('Remover [' + atk.name + ']?' + (atk.running ? ' Ele está armado — será desarmado.' : ''))) return;
    if (atk.running) plannerStop(atk);
    config.planner.attacks = config.planner.attacks.filter((a) => a.id !== id);
    if (config.planner.activeId === id) config.planner.activeId = config.planner.attacks[0].id;
    save(); plannerRecomputeReservations();
    renderPlannerTabs();
    renderPlannerActive();
  }

  function plannerRenameAttack(id) {
    const atk = config.planner.attacks.find((a) => a.id === id); if (!atk) return;
    const name = prompt('Nome do ataque:', atk.name);
    if (!name || !name.trim()) return;
    atk.name = name.trim();
    save(); renderPlannerTabs();
  }

  function plannerSwitchAttack(id) {
    if (!config.planner.attacks.some((a) => a.id === id)) return;
    config.planner.activeId = id;
    save();
    renderPlannerTabs();
    renderPlannerActive();
  }

  function renderPlannerTabs() {
    const cont = document.getElementById('twmgr-pl-attacks'); if (!cont) return;
    const p = config.planner;
    cont.innerHTML = p.attacks.map((atk) => {
      const active = atk.id === p.activeId;
      return '<div class="twmgr-pl-tab' + (active ? ' active' : '') + '" data-id="' + atk.id + '" style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;cursor:pointer;font-size:10px;border:1px solid ' + (active ? '#7d510a' : '#dcc78f') + ';background:' + (active ? 'rgba(212,175,55,.15)' : 'transparent') + ';color:#5c4527">' +
        '<span class="twmgr-pl-tab-dot" style="color:#2e7d3a;display:' + (atk.running ? 'inline' : 'none') + '">●</span>' +
        '<span class="twmgr-pl-tab-name">' + esc(atk.name) + '</span>' +
        '<span class="twmgr-pl-tab-ren" data-id="' + atk.id + '" title="renomear" style="opacity:.6">✎</span>' +
        '<span class="twmgr-pl-tab-del" data-id="' + atk.id + '" title="remover" style="opacity:.6">✕</span>' +
      '</div>';
    }).join('') + '<div id="twmgr-pl-tab-add" title="adicionar ataque" style="padding:3px 8px;border-radius:6px;cursor:pointer;font-size:12px;border:1px dashed #a9843f;color:#7a5710">+ ataque</div>';
    cont.querySelectorAll('.twmgr-pl-tab').forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.classList.contains('twmgr-pl-tab-ren') || e.target.classList.contains('twmgr-pl-tab-del')) return;
      plannerSwitchAttack(el.getAttribute('data-id'));
    }));
    cont.querySelectorAll('.twmgr-pl-tab-ren').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); plannerRenameAttack(el.getAttribute('data-id')); }));
    cont.querySelectorAll('.twmgr-pl-tab-del').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); plannerRemoveAttack(el.getAttribute('data-id')); }));
    const addBtn = document.getElementById('twmgr-pl-tab-add'); if (addBtn) addBtn.addEventListener('click', plannerAddAttack);
  }

  // Repopula os campos (alvo/chegada/aldeias/composição/status) com os dados do ataque ATIVO.
  function renderPlannerActive() {
    const atk = plActive(), g = (id) => document.getElementById(id);
    if (g('twmgr-pl-target-x')) g('twmgr-pl-target-x').value = atk.targetX || '';
    if (g('twmgr-pl-target-y')) g('twmgr-pl-target-y').value = atk.targetY || '';
    if (g('twmgr-pl-arr')) g('twmgr-pl-arr').value = atk.arriveLocal || '';
    if (g('twmgr-pl-offset')) g('twmgr-pl-offset').value = atk.offsetMs != null ? atk.offsetMs : 150;
    setPlannerStatus(atk.running);
    renderPlannerVillages(atk).then(() => renderPlannerCards(atk));
    renderPlannerQueue(atk);
  }

  const PL_STATE_META = {
    armed:     { label: 'armado',   color: '#6e5a2a' },
    scheduled: { label: 'agendado', color: '#7a5710' },
    sent:      { label: 'enviado',  color: '#2e7d3a' },
    error:     { label: 'erro',     color: '#c23a2c' },
  };

  // Tabela linha-a-linha da fila do ataque ATIVO. Ordenada por sendAt (fallback arriveAt).
  function renderPlannerQueue(atk) {
    const cont = document.getElementById('twmgr-pl-queue'); if (!cont) return;
    const rows = ((atk && atk.rows) || []).slice().sort((a, b) => (a.sendAt || a.arriveAt || 0) - (b.sendAt || b.arriveAt || 0));
    if (!rows.length) {
      cont.innerHTML = '<div style="font-size:10px;color:#6e5a2a;padding:6px;text-align:center">— fila vazia. Arme o ataque pra ver as linhas aqui. —</div>';
      return;
    }
    const vilBy = {}; (_plVilCache || []).forEach((v) => { vilBy[v.vid] = v; });
    const th = 'text-align:left;padding:2px 4px;font-size:9px;color:#6e5a2a;font-weight:normal;border-bottom:1px solid #dcc78f';
    const td = 'padding:2px 4px;font-size:10px;color:#5c4527;vertical-align:middle';
    cont.innerHTML =
      '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr>' +
          '<th style="' + th + '">#</th>' +
          '<th style="' + th + '">origem</th>' +
          '<th style="' + th + '">kind</th>' +
          '<th style="' + th + '">chega</th>' +
          '<th style="' + th + '">sai</th>' +
          '<th style="' + th + '">estado</th>' +
          '<th style="' + th + ';text-align:right">ação</th>' +
        '</tr></thead>' +
        '<tbody>' + rows.map((r, i) => {
          const v = vilBy[r.origin] || { name: 'ID ' + r.origin };
          const meta = PL_STATE_META[r.state] || { label: r.state, color: '#6e5a2a' };
          const errTitle = r.state === 'error' && r.error ? (' title="' + esc(String(r.error)) + '"') : '';
          const arrTxt = r.arriveAt ? fmtArriveLocal(r.arriveAt) : '—';
          const sendTxt = r.sendAt ? fmtArriveLocal(r.sendAt) : '—';
          const canCancel = r.state === 'armed' || r.state === 'scheduled';
          const canRemove = r.state === 'sent' || r.state === 'error';
          const actions = canCancel
            ? '<span class="twmgr-pl-queue-cancel" data-id="' + r.id + '" title="cancelar" style="cursor:pointer;color:#c2592c">✕</span>'
            : (canRemove ? '<span class="twmgr-pl-queue-del" data-id="' + r.id + '" title="remover do histórico" style="cursor:pointer;color:#6e5a2a">🗑</span>' : '');
          return '<tr style="border-bottom:1px solid #e2cd97">' +
            '<td style="' + td + ';color:#6e5a2a">' + (i + 1) + '</td>' +
            '<td style="' + td + '">' + esc(v.name) + '</td>' +
            '<td style="' + td + '">' + (PL_ICON[r.kind] || '') + '</td>' +
            '<td style="' + td + ';font-family:monospace;font-size:9px">' + arrTxt + '</td>' +
            '<td style="' + td + ';font-family:monospace;font-size:9px">' + sendTxt + '</td>' +
            '<td style="' + td + ';color:' + meta.color + '"' + errTitle + '>' + meta.label + '</td>' +
            '<td style="' + td + ';text-align:right">' + actions + '</td>' +
          '</tr>';
        }).join('') + '</tbody>' +
      '</table>';
    cont.querySelectorAll('.twmgr-pl-queue-cancel').forEach((el) => el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const r = atk.rows.find((x) => x.id === id); if (!r) return;
      r.state = 'error'; r.error = 'cancelado pelo usuário';
      save(); plannerRecomputeReservations(); renderPlannerQueue(atk);
      pushLog('[' + atk.name + '] linha cancelada (' + r.origin + ' → ' + r.x + '|' + r.y + ').', '', 'planner');
    }));
    cont.querySelectorAll('.twmgr-pl-queue-del').forEach((el) => el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      atk.rows = atk.rows.filter((x) => x.id !== id);
      save(); renderPlannerQueue(atk);
    }));
  }

  function plannerClearHistory() {
    const atk = plActive(); if (!atk) return;
    const before = (atk.rows || []).length;
    atk.rows = (atk.rows || []).filter((r) => r.state === 'armed' || r.state === 'scheduled');
    const removed = before - atk.rows.length;
    save(); renderPlannerQueue(atk);
    pushLog('[' + atk.name + '] histórico limpo (' + removed + ' linha' + (removed === 1 ? '' : 's') + ').', '', 'planner');
  }

  function plannerRefreshTemplatesList() {
    const sel = document.getElementById('twmgr-pl-tpl-load'); if (!sel) return;
    const tpls = config.planner.templates || [];
    sel.innerHTML = '<option value="">(nenhum)</option>' + tpls.map((pl) => '<option value="' + pl.id + '">' + esc(pl.name) + '</option>').join('');
  }

  function plannerSaveTemplate() {
    const input = document.getElementById('twmgr-pl-tpl-name'); if (!input) return;
    const name = (input.value || '').trim();
    if (!name) { pushLog('Dê um nome pro template antes de salvar.', 'err', 'planner'); return; }
    const atk = plActive();
    const tpl = {
      id: genId(), name: name,
      targetX: atk.targetX, targetY: atk.targetY, arriveLocal: atk.arriveLocal, offsetMs: atk.offsetMs,
      selected: JSON.parse(JSON.stringify(atk.selected)),
      perVillage: JSON.parse(JSON.stringify(atk.perVillage)),
    };
    config.planner.templates = config.planner.templates || []; config.planner.templates.push(tpl); save();
    plannerRefreshTemplatesList();
    input.value = '';
    pushLog('Template "' + name + '" salvo.', 'ok', 'planner');
  }

  function plannerApplyTemplate() {
    const sel = document.getElementById('twmgr-pl-tpl-load'); if (!sel) return;
    const id = sel.value; if (!id) return;
    const tpl = (config.planner.templates || []).find((t) => t.id === id); if (!tpl) return;
    const atk = plActive();
    atk.targetX = tpl.targetX || ''; atk.targetY = tpl.targetY || '';
    atk.arriveLocal = tpl.arriveLocal || ''; atk.offsetMs = tpl.offsetMs != null ? tpl.offsetMs : 150;
    atk.selected = JSON.parse(JSON.stringify(tpl.selected || {}));
    atk.perVillage = JSON.parse(JSON.stringify(tpl.perVillage || {}));
    atk.homeAvail = {}; // será recarregado
    save(); plannerRecomputeReservations();
    renderPlannerActive();
    pushLog('Template "' + tpl.name + '" aplicado em [' + atk.name + ']. Clique em 🔄 para carregar tropas.', 'ok', 'planner');
  }

  function plannerDeleteTemplate() {
    const sel = document.getElementById('twmgr-pl-tpl-load'); if (!sel) return;
    const id = sel.value; if (!id) return;
    const tpl = (config.planner.templates || []).find((t) => t.id === id); if (!tpl) return;
    if (!confirm('Apagar template "' + tpl.name + '"?')) return;
    config.planner.templates = (config.planner.templates || []).filter((t) => t.id !== id);
    save(); plannerRefreshTemplatesList();
    pushLog('Template "' + tpl.name + '" apagado.', '', 'planner');
  }

  function plannerClearAll(atk) {
    if (!confirm('Limpar seleção e composição de [' + atk.name + ']? (templates salvos ficam)')) return;
    atk.selected = {}; atk.perVillage = {}; atk.homeAvail = {}; atk.rows = [];
    save(); plannerRecomputeReservations();
    renderPlannerVillages(atk).then(() => renderPlannerCards(atk));
    pushLog('[' + atk.name + '] limpo.', '', 'planner');
  }

