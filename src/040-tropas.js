  // ==================== TROPAS (helpers de força/pop) ====================
  // Injetados direto na tela do jogo (screen=overview_villages&mode=units).
  // Sem UI no TW Manager, sem requests — só parse do DOM local.
  function unitsForce(totals) {
    let att = 0, def = 0, defCav = 0, defArch = 0, pop = 0, nobles = 0, total = 0;
    UNITS.forEach(([u]) => {
      const n = totals[u] || 0, s = UNIT_STATS[u]; if (!s) return;
      att += n * s.att; def += n * s.def; defCav += n * s.defCav; defArch += n * s.defArch;
      pop += n * s.pop; total += n; if (u === 'snob') nobles = n;
    });
    return { total: total, att: att, def: def, defCav: defCav, defArch: defArch, pop: pop, nobles: nobles };
  }

  // Chave de bucket de 6h (00, 06, 12, 18). Ex.: 2026-07-15T12.
  function unitsBucketKey(ms) {
    const d = new Date(ms || Date.now());
    const bucketH = Math.floor(d.getHours() / 6) * 6;
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(bucketH);
  }

  // Snapshot no bucket atual (sobrescreve o mesmo bucket). Rotaciona por historyDays * 4.
  function unitsSaveSnapshot(byVillage, totals, force) {
    const key = unitsBucketKey();
    const h = config.units.history;
    h[key] = { at: Date.now(), totals: totals, byVillage: byVillage, force: force };
    const maxEntries = (config.units.historyDays || 90) * 4;
    const keys = Object.keys(h).sort();
    while (keys.length > maxEntries) delete h[keys.shift()];
    save();
  }

  // Parse compartilhado entre enhanceUnitsPage (DOM local) e unitsFetchAndSnapshot (fetch).
  // Retorna { totals, byVillage, force, ok }. Se a tabela não existir/mudou, ok=false.
  function unitsParseTable(root) {
    const table = (root || document).getElementById ? (root || document).getElementById('units_table') : root.querySelector('#units_table');
    if (!table) return { ok: false };
    const headImgs = table.querySelectorAll('thead th img[src*="/unit_"]');
    if (!headImgs.length) return { ok: false };
    const colUnits = [];
    headImgs.forEach((img) => {
      const m = (img.getAttribute('src') || '').match(/\/unit_([a-z]+)\.[a-z]+/i);
      colUnits.push(m ? m[1] : null);
    });
    const totals = {}; UNITS.forEach(([u]) => { totals[u] = 0; });
    const byVillage = {};
    const bodies = table.querySelectorAll('tbody.row_marker');
    bodies.forEach((tb) => {
      const totalRow = tb.querySelector('tr[style*="font-weight: bold"]') || tb.querySelector('tr[style*="font-weight:bold"]');
      if (!totalRow) return;
      const nameEl = tb.querySelector('.quickedit-vn[data-id]');
      const vid = nameEl ? String(nameEl.getAttribute('data-id')) : null;
      const labelEl = tb.querySelector('.quickedit-label');
      const rawName = labelEl ? (labelEl.textContent || '').replace(/\s+/g, ' ').trim() : (vid || '?');
      const coordM = rawName.match(/(\d{1,3})\|(\d{1,3})/);
      const coord = coordM ? (coordM[1] + '|' + coordM[2]) : null;
      const cells = totalRow.querySelectorAll('td.unit-item');
      const vTotals = {};
      cells.forEach((td, i) => {
        const unit = colUnits[i]; if (!unit || !UNIT_STATS[unit]) return;
        const n = parseInt((td.textContent || '').replace(/\D/g, ''), 10) || 0;
        vTotals[unit] = n;
        totals[unit] = (totals[unit] || 0) + n;
      });
      if (vid) byVillage[vid] = { name: rawName, coord: coord, totals: vTotals, force: unitsForce(vTotals) };
    });
    return { ok: true, table: table, colUnits: colUnits, totals: totals, byVillage: byVillage, force: unitsForce(totals) };
  }

  // Fetch em background da tela units — usado pelo scheduler quando entra em novo bucket.
  //
  // RECUO APOS FALHA. Antes, erro era engolido em silencio e o instantaneo nao era salvo —
  // entao `last !== now` seguia verdadeiro e a proxima checagem tentava de novo. Sob 429
  // isso virava: TODA pagina aberta dispara a requisicao, e ela sempre falha.
  // Foi a que apareceu no console do usuario como 429 em overview_villages&mode=units.
  let _unitsProxTentativa = 0;
  async function unitsFetchAndSnapshot() {
    if (Date.now() < _unitsProxTentativa) return;
    try {
      const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=units', { credentials: 'include' });
      if (res.status === 429) { _unitsProxTentativa = Date.now() + 30 * 60000; console.warn('[TWMgr] instantaneo de tropas: 429, tentando de novo em 30 min'); return; }
      if (!res.ok) { _unitsProxTentativa = Date.now() + 10 * 60000; return; }
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const p = unitsParseTable(doc);
      if (!p.ok) return;
      unitsSaveSnapshot(p.byVillage, p.totals, p.force);
    } catch (e) { /* silencioso: proximo tick tenta de novo */ }
  }

  // Checa a cada 15min se entramos em bucket novo (00/06/12/18). Se sim, dispara fetch.
  let unitsAutoTimer = null;
  function unitsScheduleAuto() {
    if (unitsAutoTimer) clearInterval(unitsAutoTimer);
    const check = () => {
      const keys = Object.keys(config.units.history || {});
      const last = keys.length ? keys.sort().pop() : null;
      const now = unitsBucketKey();
      if (last !== now) unitsFetchAndSnapshot();
    };
    // NAO no boot imediato. Esta funcao roda em toda pagina, independente de qualquer
    // modulo estar ligado, e disparava junto com o carregamento — competindo com as ~128
    // requisicoes que o proprio jogo faz pra montar a tela. Entra depois da fila de
    // retomada dos modulos, que se estende por ~60s.
    setTimeout(check, 75000);
    unitsAutoTimer = setInterval(check, 15 * 60 * 1000);
  }

  // Retorna a data (YYYY-MM-DD) mais recente com snapshot cujo daysAgo >= n.
  function unitsFindSnapshotDaysAgo(n) {
    const targetMs = Date.now() - n * 86400000;
    const keys = Object.keys(config.units.history || {}).sort().reverse();
    for (const k of keys) {
      const at = config.units.history[k].at || new Date(k).getTime();
      if (at <= targetMs) return config.units.history[k];
    }
    return null;
  }

  // Desenha um sparkline SVG simples a partir de série [{at, v}].
  function unitsSparkline(series, w, h, color) {
    if (!series.length) return '<svg width="' + w + '" height="' + h + '"></svg>';
    if (series.length === 1) return '<svg width="' + w + '" height="' + h + '"><circle cx="' + (w / 2) + '" cy="' + (h / 2) + '" r="2" fill="' + color + '"/></svg>';
    const vals = series.map((p) => p.v), min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    const range = max - min || 1;
    const pad = 2;
    const pts = series.map((p, i) => {
      const x = pad + (i * (w - pad * 2)) / (series.length - 1);
      const y = (h - pad) - ((p.v - min) / range) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg width="' + w + '" height="' + h + '" style="vertical-align:middle">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.5" points="' + pts + '"/>' +
      '</svg>';
  }

  function unitsDownloadCsv() {
    const rows = [];
    rows.push(['data', 'total_tropas', 'forca_off', 'def_geral', 'def_cav', 'def_arq', 'pop_ocupada', 'nobres']
      .concat(UNITS.map((u) => u[0])).join(','));
    const keys = Object.keys(config.units.history || {}).sort();
    keys.forEach((k) => {
      const s = config.units.history[k];
      const f = s.force || {};
      const row = [k, f.total || 0, f.att || 0, f.def || 0, f.defCav || 0, f.defArch || 0, f.pop || 0, f.nobles || 0];
      UNITS.forEach(([u]) => row.push((s.totals && s.totals[u]) || 0));
      rows.push(row.join(','));
    });
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'tw-tropas-' + WORLD + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Detecta se estamos na tela Visualizações > Tropas, parseia a tabela, salva snapshot
  // e injeta: resumo, deltas, sparklines, botão CSV e linha "TOTAL GERAL" na tabela.
  function enhanceUnitsPage() {
    const gd = window.game_data;
    if (!gd || gd.screen !== 'overview_villages' || gd.mode !== 'units') return;
    if (document.getElementById('twmgr-units-summary')) return;

    const p = unitsParseTable(document);
    if (!p.ok) return;
    const table = p.table, colUnits = p.colUnits, totals = p.totals, byVillage = p.byVillage, f = p.force;
    const fmt = (n) => Number(n).toLocaleString('pt-BR');
    const fmtSigned = (n) => (n >= 0 ? '+' : '') + fmt(n);
    const colorFor = (delta) => delta > 0 ? '#2f7a2f' : (delta < 0 ? '#a52020' : '#584526');
    const arrowFor = (delta) => delta > 0 ? '↑' : (delta < 0 ? '↓' : '·');

    // 3) Salva snapshot ANTES de calcular deltas (pra ter o de hoje já disponível).
    unitsSaveSnapshot(byVillage, totals, f);

    // 4) Deltas vs snapshots antigos.
    const snapYest = unitsFindSnapshotDaysAgo(1);
    const snap7 = unitsFindSnapshotDaysAgo(7);
    const snap30 = unitsFindSnapshotDaysAgo(30);
    const deltaBlock = (label, snap) => {
      if (!snap || !snap.force) return '<div style="min-width:110px;color:#6e5a2a;font-size:10px">' + label + ': —</div>';
      const dTotal = f.total - (snap.force.total || 0);
      const dAtt = f.att - (snap.force.att || 0);
      const dDef = f.def - (snap.force.def || 0);
      return '<div style="min-width:110px;font-size:10px;line-height:1.4">' +
        '<div style="color:#a9843f;font-weight:bold">' + label + '</div>' +
        '<div style="color:' + colorFor(dTotal) + '">' + arrowFor(dTotal) + ' tropas ' + fmtSigned(dTotal) + '</div>' +
        '<div style="color:' + colorFor(dAtt) + '">' + arrowFor(dAtt) + ' off ' + fmtSigned(dAtt) + '</div>' +
        '<div style="color:' + colorFor(dDef) + '">' + arrowFor(dDef) + ' def ' + fmtSigned(dDef) + '</div>' +
      '</div>';
    };

    // 5) Séries pra sparklines. Longo (últimos ~30 dias) e "hoje" (últimas 24h).
    const histKeys = Object.keys(config.units.history).sort();
    // Longo prazo: 1 ponto por dia (média dos buckets do dia)
    const byDay = {};
    histKeys.forEach((k) => {
      const day = k.slice(0, 10);
      if (!byDay[day]) byDay[day] = { total: 0, att: 0, def: 0, n: 0, at: 0 };
      const s = config.units.history[k].force || {};
      byDay[day].total += s.total || 0; byDay[day].att += s.att || 0; byDay[day].def += s.def || 0;
      byDay[day].n++; byDay[day].at = Math.max(byDay[day].at, config.units.history[k].at || 0);
    });
    const dayKeys = Object.keys(byDay).sort().slice(-30);
    const seriesTotal = dayKeys.map((d) => ({ at: byDay[d].at, v: Math.round(byDay[d].total / byDay[d].n) }));
    const seriesAtt = dayKeys.map((d) => ({ at: byDay[d].at, v: Math.round(byDay[d].att / byDay[d].n) }));
    const seriesDef = dayKeys.map((d) => ({ at: byDay[d].at, v: Math.round(byDay[d].def / byDay[d].n) }));
    // Curto prazo: últimos 24h de buckets (até 4 pontos)
    const cutoff24h = Date.now() - 24 * 3600 * 1000;
    const todayKeys = histKeys.filter((k) => (config.units.history[k].at || 0) >= cutoff24h);
    const seriesToday = todayKeys.map((k) => ({ at: config.units.history[k].at, v: (config.units.history[k].force || {}).total || 0 }));

    // 6) Bloco de resumo + deltas + sparklines + botão CSV.
    const summary = document.createElement('div');
    summary.id = 'twmgr-units-summary';
    summary.style.cssText = 'margin:6px 0 8px;padding:8px 10px;border:1px solid #7d510a;border-radius:6px;background:linear-gradient(180deg,#f4e4bc,#6a4e18);font-size:12px;color:#3b2914;box-shadow:0 1px 2px rgba(0,0,0,.1)';
    const item = (label, val, big) => '<div style="display:flex;flex-direction:column;align-items:center;min-width:80px"><div style="font-size:' + (big ? '16px' : '13px') + ';font-weight:bold;font-variant-numeric:tabular-nums">' + fmt(val) + '</div><div style="font-size:10px;color:#584526">' + label + '</div></div>';
    const sparkBlock = (label, series, color) => '<div style="display:flex;flex-direction:column;align-items:center;min-width:110px">' +
      '<div style="font-size:10px;color:#a9843f;font-weight:bold">' + label + ' (' + series.length + 'd)</div>' +
      unitsSparkline(series, 110, 28, color) +
      '</div>';
    summary.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px">' +
        '<div style="font-weight:bold;font-size:11px;color:#a9843f">🏰 Resumo (TW Manager) · <span style="font-weight:normal;font-size:10px">' + histKeys.length + ' snapshot' + (histKeys.length === 1 ? '' : 's') + ' no histórico</span></div>' +
        '<button id="twmgr-units-csv" style="padding:2px 8px;font-size:10px;border:1px solid #7d510a;border-radius:4px;background:#6a4e18;cursor:pointer;color:#3b2914">📥 baixar histórico CSV</button>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding-bottom:6px;border-bottom:1px dashed #b89a5a">' +
        item('total tropas', f.total, true) +
        item('força ⚔️', f.att) +
        item('def 🛡️', f.def) +
        item('def cav 🐎', f.defCav) +
        item('def arq 🏹', f.defArch) +
        item('pop 🌾', f.pop) +
        item('nobres 👑', f.nobles) +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:16px;padding:6px 0;border-bottom:1px dashed #b89a5a">' +
        deltaBlock('vs ontem', snapYest) +
        deltaBlock('vs 7 dias', snap7) +
        deltaBlock('vs 30 dias', snap30) +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;padding-top:6px;align-items:center">' +
        '<div style="display:flex;flex-direction:column;align-items:center;min-width:110px">' +
          '<div style="font-size:10px;color:#a9843f;font-weight:bold">total (hoje ' + seriesToday.length + 'pt)</div>' +
          unitsSparkline(seriesToday, 110, 28, '#7d510a') +
        '</div>' +
        sparkBlock('total (30d)', seriesTotal, '#a9843f') +
        sparkBlock('força ⚔️ (30d)', seriesAtt, '#a52020') +
        sparkBlock('def 🛡️ (30d)', seriesDef, '#2f6b2f') +
      '</div>';
    table.parentNode.insertBefore(summary, table);
    const csvBtn = document.getElementById('twmgr-units-csv');
    if (csvBtn) csvBtn.addEventListener('click', unitsDownloadCsv);

    // 7) Nova tbody "TOTAL GERAL" no final da tabela.
    const nCols = table.querySelectorAll('thead th').length;
    const totalBody = document.createElement('tbody');
    totalBody.id = 'twmgr-units-grandtotal';
    let cellsHtml = '<td style="padding:4px 6px;color:#a9843f">TOTAL GERAL</td><td></td>';
    colUnits.forEach((unit) => {
      const n = (unit && totals[unit]) || 0;
      cellsHtml += '<td class="unit-item" style="text-align:center">' + (n > 0 ? fmt(n) : '0') + '</td>';
    });
    const emittedCols = 2 + colUnits.length;
    for (let i = emittedCols; i < nCols; i++) cellsHtml += '<td></td>';
    totalBody.innerHTML = '<tr style="background:linear-gradient(180deg,#f4e4bc,#6a4e18);font-weight:bold;font-size:13px;color:#3b2914;border-top:2px solid #7d510a">' + cellsHtml + '</tr>';
    table.appendChild(totalBody);
  }

  async function resolveTargets() {
    const r = config.recruit, map = {};
    const add = (list, targets) => (list || []).forEach((v) => { if (map[v.vid]) return; map[v.vid] = { name: v.coord || v.vid, targets: targets }; });
    let atkV = [], defV = [];
    if (r.groupAtk) { try { atkV = await getVillagesInGroup(r.groupAtk); } catch (e) { pushLog('Recrutar: erro grupo ATK: ' + (e.message || e), 'err'); } }
    if (r.groupDef) { try { defV = await getVillagesInGroup(r.groupDef); } catch (e) { pushLog('Recrutar: erro grupo DEF: ' + (e.message || e), 'err'); } }
    add(atkV, r.profiles.atk.targets); add(defV, r.profiles.def.targets);
    // Grupos adicionais livres (quantos o usuário quiser, cada um ligado a 1 grupo do TW) — resolvidos DEPOIS
    // do ATK/DEF fixo, então uma aldeia que já está no ATK/DEF antigo mantém o comportamento de sempre.
    for (const g of (r.groups || [])) {
      if (!g.groupId) continue;
      let vs = [];
      try { vs = await getVillagesInGroup(g.groupId); } catch (e) { pushLog('Recrutar: erro no grupo "' + (g.name || g.id) + '": ' + (e.message || e), 'err'); continue; }
      add(vs, g.targets || {});
    }
    const anyGroup = r.groupAtk || r.groupDef || (r.groups || []).some((g) => g.groupId);
    if (anyGroup) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} } // reseta grupo p/ "todos"
    Object.entries(r.overrides || {}).forEach(([vid, o]) => { map[vid] = { name: o.name || vid, targets: o.targets }; });
    return map;
  }
  async function getRecruitState(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=train', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    // Vai DIRETO no input de cada unidade e sobe pro <tr> dela (closest) — evita casar com uma <tr>
    // ancestral que embrulha a página (bug: lia o menu inteiro e total virava lixo, excluindo a unidade).
    const units = {};
    RUNITS.forEach(([u]) => {
      let inp = doc.querySelector('input[name="' + u + '"]');
      let row = inp ? inp.closest('tr') : null;
      if (!row) { const img = doc.querySelector('img[src*="unit_' + u + '."], img[src*="unit_' + u + '_"]'); if (img) row = img.closest('tr'); }
      if (!row) return;
      const txt = (row.textContent || '').replace(/\s+/g, ' ').trim();
      const cm = txt.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+):(\d{2}):(\d{2})/);
      if (!cm) return;
      const tot = txt.match(/(\d+)\s*\/\s*(\d+)/), mx = txt.match(/\((\d+)\)/);
      units[u] = { wood: +cm[1], stone: +cm[2], iron: +cm[3], pop: +cm[4], buildTime: (+cm[5]) * 3600 + (+cm[6]) * 60 + (+cm[7]), total: tot ? +tot[2] : 0, maxRec: mx ? +mx[1] : 0, reqMet: !!inp };
    });
    const tx = (s) => { const e = doc.querySelector(s); return e ? (parseInt((e.textContent || '').replace(/\D/g, ''), 10) || 0) : 0; };
    // ---- fila real de recrutamento (soma o tempo das ordens por edifício) ----
    const UKEYS = {}; UNITS.forEach(([u]) => UKEYS[u] = true);
    const queuedSec = { barracks: 0, stable: 0, garage: 0 };
    doc.querySelectorAll('.unit_sprite').forEach((sp) => {
      const row = sp.closest('tr, li'); if (!row) return;   // NÃO incluir 'div' (o próprio sprite é div)
      const rtxt = row.textContent || '';
      if (!/Cancel/i.test(rtxt)) return;              // só linhas da fila (têm "Cancelar")
      let uu = null; (sp.className || '').split(/\s+/).forEach((cl) => { if (UKEYS[cl]) uu = cl; });
      if (!uu || !BUILDING_OF[uu]) return;
      const tmt = rtxt.match(/(\d{1,2}):(\d{2}):(\d{2})/); // 1º tempo da linha = duração/restante da leva
      if (!tmt) return;
      queuedSec[BUILDING_OF[uu]] += (+tmt[1]) * 3600 + (+tmt[2]) * 60 + (+tmt[3]);
    });
    return { units, res: { wood: tx('#wood'), stone: tx('#stone'), iron: tx('#iron') }, popFree: Math.max(0, tx('#pop_max_label') - tx('#pop_current_label')), queuedSec: queuedSec };
  }
  function computeRecruit(state, targets, cfg, queuedSec) {
    const amounts = {}, addedSec = {}, res = Object.assign({}, state.res);
    let popFree = state.popFree, reason = 'alvo atingido';
    const wantCost = { wood: 0, stone: 0, iron: 0 };
    const groups = { barracks: [], stable: [], garage: [] };
    RUNITS.forEach(([u]) => {
      const t = targets[u]; if (t === undefined) return;
      const su = state.units[u]; if (!su || !su.reqMet) return;
      const capped = (t !== null);
      if (capped && su.total >= t) return;
      groups[BUILDING_OF[u]].push({ u, t, capped, su });
    });
    Object.keys(groups).forEach((b) => {
      const list = groups[b]; if (!list.length) return;
      const qs = queuedSec[b] || 0;
      if (qs >= cfg.refillBelowMin * 60) { if (reason === 'alvo atingido') reason = 'fila cheia'; return; }
      const needSec = cfg.targetHours * 3600 - qs; if (needSec <= 0) return;
      // TEMPO IGUAL por unidade do edifício (fila 2h, 2 unid = 1h cada; 3 unid = 1/3 cada).
      // Quem atinge o ALVO (teto) sai e LIBERA o tempo dela, redistribuído entre as que ainda faltam (water-filling).
      const rem = list.map((x) => x.capped ? Math.max(0, x.t - x.su.total) : Infinity);   // teto restante por unidade (Infinity = contínua)
      const want = list.map(() => 0);
      let pool = needSec, act = list.map((x, i) => i).filter((i) => rem[i] > 0);
      while (act.length) {
        const share = pool / act.length;
        const maxed = act.filter((i) => rem[i] !== Infinity && rem[i] * list[i].su.buildTime <= share);
        if (maxed.length) { maxed.forEach((i) => { want[i] = rem[i]; pool -= rem[i] * list[i].su.buildTime; }); act = act.filter((i) => maxed.indexOf(i) < 0); }
        else { act.forEach((i) => { want[i] = Math.floor(share / list[i].su.buildTime); }); break; }
      }
      // custo total desejado (vira demanda pro Equilíbrio abastecer)
      let cw = 0, cs = 0, ci = 0, cp = 0;
      list.forEach((x, i) => { cw += want[i] * x.su.wood; cs += want[i] * x.su.stone; ci += want[i] * x.su.iron; cp += want[i] * x.su.pop; });
      wantCost.wood += cw; wantCost.stone += cs; wantCost.iron += ci;
      // 2) UM fator de escala pra tudo caber no recurso/pop disponível, mantendo a PROPORÇÃO (crescem juntas)
      let f = 1;
      if (cw > 0) f = Math.min(f, res.wood / cw);
      if (cs > 0) f = Math.min(f, res.stone / cs);
      if (ci > 0) f = Math.min(f, res.iron / ci);
      if (cp > 0) f = Math.min(f, popFree / cp);
      if (!(f > 0)) f = 0;
      let added = 0;
      list.forEach((x, i) => {
        const n = Math.floor(want[i] * f);
        if (n > 0) { amounts[x.u] = (amounts[x.u] || 0) + n; res.wood -= n * x.su.wood; res.stone -= n * x.su.stone; res.iron -= n * x.su.iron; popFree -= n * x.su.pop; added += n * x.su.buildTime; reason = 'reposto'; }
      });
      if (added > 0) addedSec[b] = added; else if (reason !== 'reposto') reason = 'sem recurso/pop';
    });
    return { amounts, addedSec, reason, wantCost };
  }
  async function sendRecruit(vid, amounts) {
    const b = new URLSearchParams();
    Object.entries(amounts).forEach(([u, n]) => { if (n > 0) b.set('units[' + u + ']', String(n)); });
    b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + vid + '&screen=train&ajaxaction=train&mode=train&h=' + CSRF, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'TribalWars-Ajax': '1', 'X-Requested-With': 'XMLHttpRequest' }, body: b.toString() });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (j && j.error) throw new Error(Array.isArray(j.error) ? j.error.join('; ') : String(j.error));
    return true;
  }
  async function recruitTick() {
    clearTimeout(recruitTimer);
    if (!config.recruit.running) return;
    if (lockOther()) { recruitTimer = setTimeout(recruitTick, 5000); return; }
    if (captchaBlocked()) { recruitTimer = setTimeout(recruitTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.recruit.nextAt || 0) > now) { scheduleRecruit(); return; }
    let map;
    try { map = await resolveTargets(); }
    catch (e) { pushLog('Recrutar: erro ao resolver os alvos (' + (e.message || e) + ').', 'err', 'recruit'); config.recruit.nextAt = now + 120000; save(); scheduleRecruit(); return; }
    const vids = Object.keys(map);
    if (!vids.length) { pushLog('Recrutar: nenhum grupo mapeado com aldeias.', '', 'recruit'); config.recruit.nextAt = now + 300000; save(); scheduleRecruit(); return; }
    let totalSent = 0, metas = 0;
    for (const vid of vids) {
      { const pare = devoParar('recruit'); if (pare) { pushLog('Recrutar: ciclo interrompido — ' + pare + '.', '', 'recruit'); break; } }
      const targets = map[vid].targets || {};
      if (!Object.keys(targets).length) continue;
      let state;
      try { state = await getRecruitState(vid); }
      catch (e) { pushLog('Recrutar em ' + (map[vid].name || vid) + ': erro ao ler o estado (' + (e.message || e) + ').', 'err', 'recruit'); continue; }
      const queuedSec = state.queuedSec || { barracks: 0, stable: 0, garage: 0 };  // FILA REAL lida da tela
      const { amounts, reason, wantCost } = computeRecruit(state, targets, config.recruit, queuedSec);
      config.recruit.demand = config.recruit.demand || {};
      config.recruit.demand[vid] = wantCost || { wood: 0, stone: 0, iron: 0 };  // demanda de recrutar p/ Equilíbrio
      const fmtm = (s) => Math.floor(s / 3600) + 'h' + String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const qStr = 'fila quartel ' + fmtm(queuedSec.barracks) + ', estábulo ' + fmtm(queuedSec.stable) + ', oficina ' + fmtm(queuedSec.garage);
      const nm = map[vid].name || vid;
      if (Object.keys(amounts).length) {
        try {
          await sendRecruit(vid, amounts);
          pushLog('Recrutar: ' + nm + ' → ' + Object.entries(amounts).map(([u, n]) => n + ' ' + u).join(', ') + ' (' + qStr + ')', 'ok', 'recruit');
          totalSent++;
        } catch (e) { pushLog('Recrutar em ' + nm + ': ' + (e.message || e), 'err', 'recruit'); }
      } else {
        // "Atingiu a meta" é diferente de "não deu pra recrutar": se faltou recurso, o computeRecruit
        // devolve wantCost > 0 (é a demanda que vai pro Equilíbrio). Sem nada querido, o alvo está cumprido.
        const querendo = wantCost && ((wantCost.wood || 0) + (wantCost.stone || 0) + (wantCost.iron || 0)) > 0;
        if (!querendo) metas++;
        pushLog(nm + ': nada a recrutar — ' + reason + ' (' + qStr + ')', '', 'recruit');
      }
      await sleep(300);
    }
    config.recruit.stats = config.recruit.stats || {};
    config.recruit.stats.villages = vids.length;
    config.recruit.stats.metas = metas;
    config.recruit.nextAt = now + Math.max(60, config.recruit.interval || 600) * 1000;
    save();
    refreshCards('recruit');
    pushLog('Recrutar: ciclo concluído — repôs em ' + totalSent + ' aldeia(s). Próximo em ' + Math.round((config.recruit.interval || 600) / 60) + ' min.', 'ok', 'recruit');
    scheduleRecruit();
  }
  function scheduleRecruit() { clearTimeout(recruitTimer); if (!config.recruit.running) return; recruitTimer = setTimeout(recruitTick, Math.min(Math.max((config.recruit.nextAt || 0) - Date.now(), 1000), 60000)); }
  function recruitProfileHTML(prof, label) {
    const t = (config.recruit.profiles[prof] || {}).targets || {};
    const rows = RUNITS.map(([u, n]) =>
      '<div style="display:flex;align-items:center;gap:5px;margin:1px 0">' +
      '<input type="checkbox" class="twmgr-ron" data-prof="' + prof + '" data-unit="' + u + '"' + (t[u] !== undefined ? ' checked' : '') + '>' +
      unitIcon(u, n) + '<span style="flex:1;font-size:10px">' + n + '</span>' +
      '<input class="twmgr-rt" data-prof="' + prof + '" data-unit="' + u + '" type="number" min="0" placeholder="∞" value="' + (t[u] != null ? t[u] : '') + '" style="width:60px" title="alvo (vazio = contínuo)">' +
      '</div>').join('');
    return '<div style="font-size:11px;color:#6a4e18;margin:6px 0 2px">' + label + '</div>' + rows;
  }
  let _twGroupsCache = [];
  async function fillGroupSelects() {
    let groups = [];
    try { groups = await getGroups(); } catch (e) { pushLog('Recrutar: erro ao listar grupos: ' + (e.message || e), 'err'); return; }
    _twGroupsCache = groups;
    [['twmgr-r-gatk', config.recruit.groupAtk], ['twmgr-r-gdef', config.recruit.groupDef], ['twmgr-bm-group', config.map && config.map.group], ['twmgr-farm-group', config.farm && config.farm.group], ['twmgr-bld-group', config.build && config.build.filterGroup], ['twmgr-pq-group', config.research && config.research.filterGroup]].forEach(([id, cur]) => {
      const sel = document.getElementById(id); if (!sel) return;
      sel.innerHTML = '<option value="">— nenhum —</option>' + groups.map((g) => '<option value="' + g.id + '"' + (String(cur) === String(g.id) ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('');
    });
    renderRecruitGroups();
  }
  // ---- Grupos adicionais livres do Recrutar (quantos o usuário quiser, cada um ligado a 1 grupo do TW) ----
  function recruitGroupCardHTML(g) {
    const opts = '<option value="">— nenhum —</option>' + _twGroupsCache.map((gr) => '<option value="' + gr.id + '"' + (String(g.groupId || '') === String(gr.id) ? ' selected' : '') + '>' + esc(gr.name) + '</option>').join('');
    const t = g.targets || {};
    const rows = RUNITS.map(([u, n]) =>
      '<div style="display:flex;align-items:center;gap:5px;margin:1px 0">' +
      '<input type="checkbox" class="twmgr-rg-on" data-gid="' + g.id + '" data-unit="' + u + '"' + (t[u] !== undefined ? ' checked' : '') + '>' +
      unitIcon(u, n) + '<span style="flex:1;font-size:10px">' + n + '</span>' +
      '<input class="twmgr-rg-t twmgr-inp" data-gid="' + g.id + '" data-unit="' + u + '" type="number" min="0" placeholder="∞" value="' + (t[u] != null ? t[u] : '') + '" style="width:60px" title="alvo (vazio = contínuo)">' +
      '</div>').join('');
    return '<div class="twmgr-rg-card" data-gid="' + g.id + '" style="border:1px solid #dcc78f;border-radius:6px;padding:6px;margin-bottom:6px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
      '<input class="twmgr-rg-name twmgr-inp" data-gid="' + g.id + '" type="text" placeholder="nome do perfil" value="' + esc(g.name || '') + '" style="flex:1;font-size:11px">' +
      '<select class="twmgr-rg-grp twmgr-inp" data-gid="' + g.id + '" style="width:130px">' + opts + '</select>' +
      '<span class="twmgr-rg-rm" data-gid="' + g.id + '" title="remover grupo" style="cursor:pointer;color:#c23a2c;padding:0 4px;font-weight:bold">✕</span>' +
      '</div>' + rows + '</div>';
  }
  function renderRecruitGroups() {
    const box = document.getElementById('twmgr-rg-list'); if (!box) return;
    const groups = config.recruit.groups || [];
    box.innerHTML = groups.length ? groups.map(recruitGroupCardHTML).join('') : '<div style="color:#6e5a2a;text-align:center;padding:8px;font-size:10px">— nenhum grupo adicional (use o botão abaixo) —</div>';
  }
  function bindRecruitGroupsHandlers() {
    const box = document.getElementById('twmgr-rg-list'); if (!box) return;
    box.addEventListener('change', (e) => {
      const el = e.target, gid = el.getAttribute('data-gid'); if (!gid) return;
      const g = (config.recruit.groups || []).find((x) => x.id === gid); if (!g) return;
      if (el.classList.contains('twmgr-rg-name')) g.name = el.value;
      else if (el.classList.contains('twmgr-rg-grp')) g.groupId = el.value || null;
      else if (el.classList.contains('twmgr-rg-on') || el.classList.contains('twmgr-rg-t')) {
        const u = el.getAttribute('data-unit');
        const cb = box.querySelector('.twmgr-rg-on[data-gid="' + gid + '"][data-unit="' + u + '"]');
        const inp = box.querySelector('.twmgr-rg-t[data-gid="' + gid + '"][data-unit="' + u + '"]');
        const hasNum = inp && inp.value.trim() !== '';
        g.targets = g.targets || {};
        if (!cb.checked && !hasNum) { delete g.targets[u]; }
        else {
          const v = hasNum ? parseInt(inp.value, 10) : null;
          g.targets[u] = (v != null && !Number.isNaN(v)) ? v : null;
          if (hasNum) cb.checked = true;
        }
      }
      save();
    });
    box.addEventListener('click', (e) => {
      const el = e.target, gid = el.getAttribute('data-gid'); if (!gid) return;
      if (el.classList.contains('twmgr-rg-rm')) {
        if (!confirm('Remover este grupo?')) return;
        config.recruit.groups = (config.recruit.groups || []).filter((x) => x.id !== gid);
        save(); renderRecruitGroups();
      }
    });
  }
  function recruitAddGroup() {
    config.recruit.groups = config.recruit.groups || [];
    const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    config.recruit.groups.push({ id: id, name: 'Grupo ' + (config.recruit.groups.length + 1), groupId: null, targets: {} });
    save(); renderRecruitGroups();
  }
  function readRecruitCfg() {
    const r = config.recruit;
    ['atk', 'def'].forEach((prof) => {
      const tg = {};
      document.querySelectorAll('.twmgr-ron[data-prof="' + prof + '"]').forEach((cb) => {
        const u = cb.getAttribute('data-unit');
        const inp = document.querySelector('.twmgr-rt[data-prof="' + prof + '"][data-unit="' + u + '"]');
        const hasNum = inp && inp.value.trim() !== '';
        if (!cb.checked && !hasNum) { return; }
        const v = hasNum ? parseInt(inp.value, 10) : null;
        tg[u] = (v != null && !Number.isNaN(v)) ? v : null;
        if (hasNum) { cb.checked = true; }
      });
      r.profiles[prof].targets = tg;
    });
    const g1 = document.getElementById('twmgr-r-gatk'); if (g1) r.groupAtk = g1.value || null;
    const g2 = document.getElementById('twmgr-r-gdef'); if (g2) r.groupDef = g2.value || null;
    const h = document.getElementById('twmgr-r-hours'); if (h) r.targetHours = Math.max(0.5, parseFloat((h.value || '').replace(',', '.')) || 2);
    const rf = document.getElementById('twmgr-r-refill'); if (rf) r.refillBelowMin = Math.max(1, parseInt(rf.value, 10) || 30);
    save();
  }
  function setRecruitStatus(on) { setBtnState('twmgr-r-start', 'twmgr-r-stop', on, '● Recrutando', '▶ Recrutar'); }
  function recruitStart() {
    readRecruitCfg();
    const hasCustom = (config.recruit.groups || []).some((g) => g.groupId);
    if (!config.recruit.groupAtk && !config.recruit.groupDef && !hasCustom) { pushLog('Recrutar: mapeie ao menos 1 grupo (ATK, DEF ou um grupo adicional).', 'err', 'recruit'); return; }
    config.recruit.running = true; config.recruit.nextAt = 0; save(); setRecruitStatus(true); pushLog('Recrutar iniciado.', 'ok', 'recruit'); recruitTick();
  }
  function recruitStop() { readRecruitCfg(); config.recruit.running = false; save(); clearTimeout(recruitTimer); setRecruitStatus(false); pushLog('Recrutar parado.', '', 'recruit'); }
  async function runRecruitDiag() {
    pushLog('Diag Recrutar: lendo grupos e tela train…');
    try {
      const groups = await getGroups();
      pushLog('Grupos: ' + groups.map((g) => g.name + '#' + g.id).join(' · '));
      if (config.recruit.groupAtk) { const v = await getVillagesInGroup(config.recruit.groupAtk); pushLog('ATK(' + config.recruit.groupAtk + '): ' + v.length + ' aldeias'); }
      if (config.recruit.groupDef) { const v = await getVillagesInGroup(config.recruit.groupDef); pushLog('DEF(' + config.recruit.groupDef + '): ' + v.length + ' aldeias'); }
      if (config.recruit.groupAtk || config.recruit.groupDef) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
      const st = await getRecruitState(CUR_VID);
      RUNITS.forEach(([u, n]) => { const s = st.units[u]; if (s) pushLog(n + ': tot ' + s.total + ' · max ' + s.maxRec + ' · ' + s.wood + '/' + s.stone + '/' + s.iron + ' · ' + Math.round(s.buildTime) + 's · req ' + s.reqMet); });
      pushLog('Recursos ' + st.res.wood + '/' + st.res.stone + '/' + st.res.iron + ' · pop livre ' + st.popFree, 'ok');
      showTab('log');
    } catch (e) { pushLog('Diag Recrutar falhou: ' + (e.message || e), 'err'); }
  }

