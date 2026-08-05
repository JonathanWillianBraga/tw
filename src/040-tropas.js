  // ==================== TROPAS (helpers de força/pop) ====================
  // Injetados direto na tela do jogo (screen=overview_villages&mode=units).
  // Sem UI no TW Manager, sem requests — só parse do DOM local.
  // ==================== TROPAS: total por unidade na tela do jogo ====================
  // Injetado em Visualizacoes > Tropas (screen=overview_villages&mode=units). Sem UI no painel e
  // sem requisicao nenhuma: so le o DOM que ja esta na tela.
  //
  // A soma segue a ABA escolhida (Todos / Proprias / Na Aldeia / Fora / Em transito / Defesas /
  // Apoios). A versao anterior somava sempre a linha em negrito "total" de cada aldeia, entao o
  // numero era o mesmo em qualquer aba.
  //
  // Como a aba muda a tabela: em "Todos" cada aldeia tem varias linhas (proprias, na aldeia, fora,
  // em transito) mais uma em NEGRITO com o total; nas outras abas sobra uma linha por aldeia e nao
  // ha negrito. Dai a regra: se a aldeia tem linha de total, use ela; senao some as linhas que
  // aparecem. Isso da o numero certo nos dois casos sem depender do nome da aba.
  function unitsSomaVisivel(table, colUnits) {
    const totais = {}, cols = colUnits.filter(Boolean);
    cols.forEach((u) => { totais[u] = 0; });
    let aldeias = 0, linhas = 0, usouTotal = 0;
    table.querySelectorAll('tbody.row_marker').forEach((tb) => {
      const negrito = tb.querySelector('tr[style*="font-weight: bold"], tr[style*="font-weight:bold"]');
      const alvo = negrito ? [negrito] : Array.prototype.filter.call(
        tb.querySelectorAll('tr'), (tr) => tr.querySelector('td.unit-item'));
      if (!alvo.length) return;
      aldeias++;
      if (negrito) usouTotal++;
      alvo.forEach((tr) => {
        linhas++;
        tr.querySelectorAll('td.unit-item').forEach((td, i) => {
          const u = colUnits[i]; if (!u || totais[u] == null) return;
          totais[u] += parseInt((td.textContent || '').replace(/\D/g, ''), 10) || 0;
        });
      });
    });
    return { totais: totais, aldeias: aldeias, linhas: linhas, usouTotal: usouTotal };
  }

  // Rotulo da aba selecionada, pra linha dizer o que ela esta somando.
  function unitsAbaAtiva() {
    const sel = document.querySelector('table.modemenu td.selected a, table.modemenu td.selected,'
      + ' .modemenu td.selected a, .modemenu td.selected');
    const t = sel ? (sel.textContent || '').replace(/\s+/g, ' ').trim() : '';
    return t || 'sele\u00e7\u00e3o atual';
  }

  function enhanceUnitsPage() {
    const gd = window.game_data;
    if (!gd || gd.screen !== 'overview_villages' || gd.mode !== 'units') return;
    ['twmgr-units-total', 'twmgr-units-topo'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    const table = document.getElementById('units_table'); if (!table) return;
    const cabecalhos = table.querySelectorAll('thead th img[src*="/unit_"]');
    if (!cabecalhos.length) return;
    const colUnits = [];
    cabecalhos.forEach((img) => {
      const m = (img.getAttribute('src') || '').match(/\/unit_([a-z]+)\.[a-z]+/i);
      colUnits.push(m ? m[1] : null);
    });

    const r = unitsSomaVisivel(table, colUnits);
    if (!r.aldeias) return;
    const fmt = (n) => Number(n).toLocaleString('pt-BR');
    // Diagnostico usado nos dois lugares: se a tabela do jogo mudar, da pra ver na hora que a
    // soma pegou pouca coisa, em vez de mostrar um numero errado calado.
    const diag = r.aldeias + ' aldeia(s), ' + r.linhas + ' linha(s) somada(s)'
      + (r.usouTotal ? ' \u2014 ' + r.usouTotal + ' pela linha de total' : '');

    // Painel do topo: mesmos numeros, visiveis sem rolar. Os icones saem do proprio cabecalho
    // da tabela do jogo -- assim valem pro mundo em que voce esta (br141 nao tem arqueiro,
    // por exemplo) e nunca apontam pra imagem que nao existe.
    const topo = document.createElement('div');
    topo.id = 'twmgr-units-topo';
    let chips = '';
    colUnits.forEach((u, i) => {
      if (!u) return;
      const n = r.totais[u] || 0;
      const img = cabecalhos[i] ? cabecalhos[i].getAttribute('src') : '';
      const nome = cabecalhos[i] ? (cabecalhos[i].getAttribute('title')
        || cabecalhos[i].getAttribute('alt') || u) : u;
      chips += '<span class="twmgr-ut-chip' + (n ? '' : ' twmgr-ut-zero') + '" title="' + esc(nome) + '">'
        + (img ? '<img src="' + esc(img) + '" alt="">' : '')
        + '<b>' + fmt(n) + '</b></span>';
    });
    topo.innerHTML = '<div class="twmgr-ut-topo-cab">\u03a3 ' + esc(unitsAbaAtiva())
      + '<span class="twmgr-ut-topo-sub">' + esc(diag) + '</span></div>'
      + '<div class="twmgr-ut-chips">' + chips + '</div>';
    table.parentNode.insertBefore(topo, table);

    const tbody = document.createElement('tbody');

    tbody.id = 'twmgr-units-total';
    const nCols = table.querySelectorAll('thead th').length;
    let cells = '<td class="twmgr-ut-cel twmgr-ut-rot" colspan="2" title="' + esc(diag) + '">'
      + '\u03a3 ' + esc(unitsAbaAtiva()) + '</td>';
    colUnits.forEach((u) => {
      const n = (u && r.totais[u]) || 0;
      cells += '<td class="twmgr-ut-cel twmgr-ut-num">' + (n ? fmt(n) : '0') + '</td>';
    });
    for (let i = 2 + colUnits.length; i < nCols; i++) cells += '<td class="twmgr-ut-cel"></td>';
    tbody.innerHTML = '<tr>' + cells + '</tr>';
    table.appendChild(tbody);

    // Estilo proprio: a tabela e do jogo, entao nao herdo nada do painel. `position:sticky` no TD
    // (nao no TR -- em tabela o sticky so pega na celula) mantem a linha visivel enquanto rola.
    if (!document.getElementById('twmgr-ut-css')) {
      const st = document.createElement('style'); st.id = 'twmgr-ut-css';
      st.textContent = '#twmgr-units-topo{margin:0 0 8px;padding:8px 10px;background:#fbf6ee;' + 'border:1px solid #e8d9bf;border-radius:8px;font-family:Verdana,Arial,sans-serif}'
        + '.twmgr-ut-topo-cab{font-size:11px;font-weight:bold;color:#8b5426;margin-bottom:6px;' + 'display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}'
        + '.twmgr-ut-topo-sub{font-weight:normal;font-size:10px;color:#8a7d6d}'
        + '.twmgr-ut-chips{display:flex;flex-wrap:wrap;gap:6px}'
        + '.twmgr-ut-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px 3px 5px;' + 'background:#fff;border:1px solid #ece4d8;border-radius:6px;font-size:12px;color:#463b30;' + 'font-variant-numeric:tabular-nums}'
        + '.twmgr-ut-chip img{width:16px;height:16px;display:block}'
        + '.twmgr-ut-chip.twmgr-ut-zero{opacity:.42}'
        + '.twmgr-ut-cel{position:sticky;bottom:0;z-index:5;background:#fbf6ee;'
        + 'border-top:2px solid #a2643a;padding:5px 6px;font-weight:bold;color:#463b30}'
        + '.twmgr-ut-rot{text-align:left;color:#8b5426;white-space:nowrap}'
        + '.twmgr-ut-num{text-align:center;font-variant-numeric:tabular-nums}';
      document.head.appendChild(st);
    }
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
    return '<div style="font-size:11px;color:#8b5426;margin:6px 0 2px">' + label + '</div>' + rows;
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
    return '<div class="twmgr-rg-card" data-gid="' + g.id + '" style="border:1px solid #ece4d8;border-radius:6px;padding:6px;margin-bottom:6px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
      '<input class="twmgr-rg-name twmgr-inp" data-gid="' + g.id + '" type="text" placeholder="nome do perfil" value="' + esc(g.name || '') + '" style="flex:1;font-size:11px">' +
      '<select class="twmgr-rg-grp twmgr-inp" data-gid="' + g.id + '" style="width:130px">' + opts + '</select>' +
      '<span class="twmgr-rg-rm" data-gid="' + g.id + '" title="remover grupo" style="cursor:pointer;color:#c0483a;padding:0 4px;font-weight:bold">✕</span>' +
      '</div>' + rows + '</div>';
  }
  function renderRecruitGroups() {
    const box = document.getElementById('twmgr-rg-list'); if (!box) return;
    const groups = config.recruit.groups || [];
    box.innerHTML = groups.length ? groups.map(recruitGroupCardHTML).join('') : '<div style="color:#8a7d6d;text-align:center;padding:8px;font-size:10px">— nenhum grupo adicional (use o botão abaixo) —</div>';
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

