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

  // Monta { vid: {name, targets} } — o que o motor consome. Três camadas, da mais genérica pra
  // mais específica, cada uma sobrescrevendo a anterior:
  //   1. modelo com GRUPO   → vale pra todas as aldeias daquele grupo
  //   2. override           → quantidade avulsa daquela aldeia, vence o grupo
  //
  // Decisao do usuario: recrutamento e SEMPRE modelo->grupo. Excecao pra uma aldeia = ela vai
  // pra um grupo proprio, com o modelo dela. Por isso nao existe atribuicao individual aqui.
  async function resolveTargets() {
    const r = config.recruit, map = {};
    const tpls = r.templates || {};

    // 1. modelos amarrados a grupo
    let usouGrupo = false;
    for (const id of Object.keys(tpls)) {
      const t = tpls[id];
      if (!t.grupo) continue;
      let vs = [];
      try { vs = await getVillagesInGroup(t.grupo); }
      catch (e) { pushLog('Recrutar: erro no grupo do modelo "' + (t.name || id) + '": ' + (e.message || e), 'err', 'recruit'); continue; }
      usouGrupo = true;
      (vs || []).forEach((v) => { map[v.vid] = { name: v.name || v.coord || v.vid, coord: v.coord || null,
                                                targets: t.targets || {}, tpl: id }; });
    }
    // Ler grupo deixa o jogo com aquele grupo selecionado; volta pra "todos" pra não afetar as
    // outras telas do usuário.
    if (usouGrupo) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }

    // 2. override avulso
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
    // Nao precisa sincronizar nada: o modelo aponta pro GRUPO, entao aldeia que entra no grupo
    // ja aparece no resolveTargets do proximo ciclo, sozinha.

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

      // Snapshot do que a aldeia TEM contra o que o modelo pede. Alimenta a aba Status sem
      // custar requisicao nenhuma -- o estado ja foi lido aqui em cima pra decidir o recrutamento.
      const un = {};
      let bateuTudo = true;
      Object.keys(targets).forEach((u) => {
        const alvo = targets[u];
        const tem = ((state.units || {})[u] || {}).total || 0;
        un[u] = { tem: tem, alvo: alvo };
        // alvo null = "continuo" (recruta sempre): nunca conta como cumprido.
        if (alvo == null || tem < alvo) bateuTudo = false;
      });
      config.recruit.status = config.recruit.status || {};
      config.recruit.status[vid] = { name: nm, coord: map[vid].coord || null, at: Date.now(),
                                     tpl: map[vid].tpl || '', units: un, ok: bateuTudo };
      if (bateuTudo) metas++;
      if (Object.keys(amounts).length) {
        try {
          await sendRecruit(vid, amounts);
          pushLog('Recrutar: ' + nm + ' → ' + Object.entries(amounts).map(([u, n]) => n + ' ' + u).join(', ') + ' (' + qStr + ')', 'ok', 'recruit');
          totalSent++;
        } catch (e) { pushLog('Recrutar em ' + nm + ': ' + (e.message || e), 'err', 'recruit'); }
      } else {
        // NAO conta meta aqui. "Nada a recrutar" também acontece com fila cheia ou requisito
        // faltando — era esse o bug do card: dizia meta atingida sem a tropa ter chegado no alvo.
        // Quem conta é o `bateuTudo` lá em cima, comparando tropa com alvo, unidade por unidade.
        pushLog(nm + ': nada a recrutar — ' + reason + ' (' + qStr + ')', '', 'recruit');
      }
      await sleep(300);
    }
    config.recruit.stats = config.recruit.stats || {};
    config.recruit.stats.villages = vids.length;
    config.recruit.stats.metas = metas;
    // Aldeia que saiu da gestão some do Status — senão a aba mostraria dado velho pra sempre.
    Object.keys(config.recruit.status || {}).forEach((v) => { if (!map[v]) delete config.recruit.status[v]; });
    config.recruit.nextAt = now + Math.max(60, config.recruit.interval || 600) * 1000;
    save();
    refreshCards('recruit');
    pushLog('Recrutar: ciclo concluído — repôs em ' + totalSent + ' aldeia(s). Próximo em ' + Math.round((config.recruit.interval || 600) / 60) + ' min.', 'ok', 'recruit');
    scheduleRecruit();
  }
  function scheduleRecruit() { clearTimeout(recruitTimer); if (!config.recruit.running) return; recruitTimer = setTimeout(recruitTick, Math.min(Math.max((config.recruit.nextAt || 0) - Date.now(), 1000), 60000)); }
  // ===== Modelos de recrutamento =====
  // Mesmo desenho de Construções e Pesquisa: modelo nomeado + tabela de aldeias. A diferença
  // é que aqui o modelo pode ficar amarrado a um GRUPO, que era como este módulo funcionava
  // antes — assim quem já usava perfil-por-grupo não precisa marcar aldeia por aldeia.
  let _rcTplAtivo = '';
  let _twGroupsCache = [];

  function rcTplIds() { return Object.keys(config.recruit.templates || {}); }
  function rcTplAtivo() {
    const ids = rcTplIds();
    if (ids.indexOf(_rcTplAtivo) < 0) _rcTplAtivo = ids[0] || '';
    return config.recruit.templates[_rcTplAtivo] || null;
  }
  function rcFillTplSelects() {
    const ids = rcTplIds();
    if (ids.indexOf(_rcTplAtivo) < 0) _rcTplAtivo = ids[0] || '';
    const opts = ids.map((id) => '<option value="' + esc(id) + '">'
      + esc(config.recruit.templates[id].name || id) + '</option>').join('');
    const sel = document.getElementById('twmgr-rc-tpl');
    if (sel) { sel.innerHTML = opts; sel.value = _rcTplAtivo; }
    // O modelo se aplica por GRUPO, entao nao ha mais seletor de massa nem de "aldeia nova".
  }

  // Editor do modelo ativo: uma linha por unidade, com alvo. Campo VAZIO = contínuo (recruta
  // sempre que couber); 0 = não recruta. A distinção vem do desenho antigo e foi mantida.
  function rcRenderEditor() {
    const box = document.getElementById('twmgr-rc-editor'); if (!box) return;
    const t = rcTplAtivo();
    if (!t) { box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:10px;font-size:10px">— crie um modelo com ✚ —</div>'; return; }
    const tg = t.targets || {};
    const gopts = '<option value="">— nenhum —</option>' + _twGroupsCache.map((gr) =>
      '<option value="' + gr.id + '"' + (String(t.grupo || '') === String(gr.id) ? ' selected' : '') + '>'
      + esc(gr.name) + '</option>').join('');
    box.innerHTML =
      '<div class="twmgr-fld"><span title="Todas as aldeias deste grupo usam este modelo, sem precisar marcar uma a uma">Aplicar ao grupo</span>' +
        '<select id="twmgr-rc-tplgrp" class="twmgr-inp" style="flex:0 0 150px;width:150px">' + gopts + '</select></div>' +
      '<div class="twmgr-ug">' + unitsDoMundo().filter((u) => u[0] !== 'knight' && u[0] !== 'snob').map((u) =>
        '<div><div class="h" title="' + esc(u[1]) + '">'
        + '<span class="unit_sprite unit_sprite_smaller ' + u[0] + '"></span><em>' + esc(u[1]) + '</em></div>'
        + '<input class="twmgr-rc-t twmgr-inp" data-unit="' + u[0] + '" type="number" min="0" placeholder="—"'
        + ' value="' + (tg[u[0]] != null ? tg[u[0]] : '') + '"></div>').join('') + '</div>' +
      '<div style="font-size:9px;color:#8a7d6d;margin-top:5px">Vazio = <b>não recruta</b> essa unidade. Número = alvo a <b>manter</b> — ele repõe quando cai abaixo.</div>';
  }
  function rcLerEditor() {
    const t = rcTplAtivo(); if (!t) return;
    const tg = {};
    document.querySelectorAll('.twmgr-rc-t').forEach((i) => {
      if (String(i.value).trim() === '') return;
      const v = parseInt(i.value, 10);
      if (!Number.isNaN(v) && v >= 0) tg[i.getAttribute('data-unit')] = v;
    });
    t.targets = tg;
    const g = document.getElementById('twmgr-rc-tplgrp');
    if (g) t.grupo = g.value || '';
  }
  function rcSwitchTpl(id) {
    if (!config.recruit.templates[id]) return;
    rcLerEditor(); save();          // salva o que estava na tela antes de trocar
    _rcTplAtivo = id;
    rcFillTplSelects(); rcRenderEditor();
  }
  function rcNovoModelo() {
    const nome = prompt('Nome do modelo de recrutamento:', 'Ofensivo');
    if (!nome || !nome.trim()) return;
    const at = rcTplAtivo();
    const copiar = at && confirm('Copiar as quantidades de "' + at.name + '"?\n\nOK = copiar   -   Cancelar = do zero');
    const id = 'r' + Date.now().toString(36);
    config.recruit.templates[id] = copiar
      ? { name: nome.trim().slice(0, 40), targets: JSON.parse(JSON.stringify(at.targets || {})), grupo: '' }
      : defRecruitTpl(nome.trim().slice(0, 40));
    _rcTplAtivo = id;
    save(); rcFillTplSelects(); rcRenderEditor(); rcRenderStatus();
  }
  function rcRenomearModelo() {
    const t = rcTplAtivo(); if (!t) return;
    const nome = prompt('Novo nome:', t.name);
    if (!nome || !nome.trim()) return;
    t.name = nome.trim().slice(0, 40);
    save(); rcFillTplSelects(); rcRenderStatus();
  }
  function rcApagarModelo() {
    const t = rcTplAtivo(); if (!t) return;
    const usando = Object.keys(config.recruit.villages || {}).filter((v) => config.recruit.villages[v].tpl === _rcTplAtivo);
    if (!confirm('Apagar o modelo "' + t.name + '"?'
      + (usando.length ? '\n\n' + usando.length + ' aldeia(s) usam ele e saem da gestão.' : ''))) return;
    delete config.recruit.templates[_rcTplAtivo];
    usando.forEach((v) => { delete config.recruit.villages[v]; });
    _rcTplAtivo = rcTplIds()[0] || '';
    save(); rcFillTplSelects(); rcRenderEditor(); rcRenderStatus();
  }

  // ===== Aba Status =====
  // Mostra o que cada aldeia TEM contra o alvo do modelo. Le do snapshot que o ciclo gravou:
  // o estado ja foi buscado pra decidir o recrutamento, entao a aba nao custa requisicao.
  // O botao de atualizar refaz a leitura sem recrutar nada.
  function rcStatusUnidades() {
    // So as unidades que ALGUM modelo pede -- uma coluna por unidade do mundo deixaria a tabela
    // cheia de coluna zerada.
    const usadas = {};
    Object.keys(config.recruit.templates || {}).forEach((id) => {
      Object.keys(config.recruit.templates[id].targets || {}).forEach((u) => { usadas[u] = 1; });
    });
    return unitsDoMundo().filter((u) => usadas[u[0]]);
  }
  // % de atingimento PONDERADO pelo alvo: soma(min(tem,alvo)) / soma(alvo).
  //
  // Ponderado, nao media simples das unidades: 7.000 lanceiros e 100 exploradores nao custam o
  // mesmo, e a media simples diria 50% pra uma aldeia que so tem os exploradores. O elo mais
  // fraco (a unidade mais atrasada) vai no tooltip, que e justamente o que a media ponderada
  // esconde.
  function rcPct(r) {
    let tem = 0, alvo = 0, pior = null;
    Object.keys(r.units || {}).forEach((u) => {
      const c = r.units[u];
      if (c.alvo == null || c.alvo <= 0) return;      // continuo nao entra na conta
      alvo += c.alvo;
      tem += Math.min(c.tem, c.alvo);
      const p = c.tem / c.alvo;
      if (!pior || p < pior.p) pior = { u: u, p: p };
    });
    return { pct: alvo > 0 ? (tem / alvo) : null, tem: tem, alvo: alvo, pior: pior };
  }
  // Ordenacao: clique no cabecalho. Guarda coluna + direcao entre renders.
  let _rcOrd = { col: 'name', dir: 1 };
  function rcOrdenar(col) {
    if (_rcOrd.col === col) _rcOrd.dir = -_rcOrd.dir;
    else _rcOrd = { col: col, dir: col === 'name' ? 1 : -1 };   // número começa do maior
    rcRenderStatus();
  }

  // Iguala o tamanho VISUAL dos ícones. Os sprites do jogo têm dimensões naturais bem diferentes
  // (medido no preview: de 10 a 34px de largura); só encaixotar alinhava a coluna mas cortava os
  // grandes. Aqui cada um é medido e escalado pra caber na caixa, então todos ficam do mesmo
  // tamanho e centrados sobre o número.
  function rcAjustarIcones(box) {
    const CAIXA = 18;
    box.querySelectorAll('.twmgr-uicon .unit_sprite').forEach((el) => {
      el.style.transform = '';                 // mede o natural, sem a escala anterior
      const maior = Math.max(el.offsetWidth, el.offsetHeight);
      if (!maior) return;                      // sprite sem CSS carregado: deixa como está
      // Escala pros DOIS lados. Só encolher deixava o explorador (14px) menor que o resto, que era
      // exatamente a falta de equilíbrio reclamada. O teto de 1.6x evita borrar um sprite minúsculo.
      const k = Math.min(CAIXA / maior, 1.6);
      el.style.transform = 'scale(' + k.toFixed(3) + ')';
    });
  }

  function rcRenderStatus() {

    const box = document.getElementById('twmgr-rc-status'); if (!box) return;
    const st = config.recruit.status || {};
    const gid = _rcStatusGrupo;
    let vids = Object.keys(st);
    if (gid) vids = vids.filter((v) => _rcStatusPool[v]);
    if (!vids.length) {
      box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:10px;font-size:10px">'
        + (Object.keys(st).length ? '— nenhuma aldeia deste grupo na gestão —'
                                  : '— rode um ciclo (ou clique em ↻) pra ver o status —') + '</div>';
      return;
    }
    const uns = rcStatusUnidades();
    const faixa = (tem, alvo) => {
      if (alvo == null || alvo <= 0) return 'inf';
      if (tem >= alvo) return 'ok';
      const p = tem / alvo;
      return p < 0.5 ? 'ruim' : (p < 0.8 ? 'meio' : 'bom');
    };
    const pcts = {}; vids.forEach((v) => { pcts[v] = rcPct(st[v]); });
    // Ordena pela coluna escolhida. Aldeia sem a unidade vai pro fim, sempre — se entrasse como
    // zero, ela apareceria "pior" que uma que tem pouco, o que confunde.
    const valor = (vid) => {
      if (_rcOrd.col === 'name') return null;
      if (_rcOrd.col === 'pct') { const p = pcts[vid].pct; return p == null ? null : p; }
      const c = (st[vid].units || {})[_rcOrd.col];
      return c ? c.tem : null;
    };
    vids.sort((a, b) => {
      if (_rcOrd.col === 'name') {
        return _rcOrd.dir * String(st[a].name).localeCompare(String(st[b].name), 'pt-BR', { numeric: true });
      }
      const va = valor(a), vb = valor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return _rcOrd.dir * (va - vb);
    });
    const seta = (col) => _rcOrd.col === col ? '<span class="ord">' + (_rcOrd.dir > 0 ? '▲' : '▼') + '</span>' : '';
    const wUn = Math.max(8, Math.floor(56 / Math.max(1, uns.length)));
    box.innerHTML = '<table class="twmgr-bld-tab twmgr-rc-st"><colgroup>'
      + '<col style="width:' + (100 - wUn * uns.length - 11) + '%">'
      + uns.map(() => '<col style="width:' + wUn + '%">').join('')
      + '<col style="width:11%"></colgroup>'
      + '<thead><tr><th class="ordena" data-col="name">Aldeia' + seta('name') + '</th>'
      + uns.map((u) => '<th class="ordena" data-col="' + u[0] + '" title="' + esc(u[1]) + ' — clique pra ordenar">'
        + '<i class="twmgr-uicon"><span class="unit_sprite unit_sprite_smaller ' + u[0] + '"></span></i>'
        + seta(u[0]) + '</th>').join('')
      + '<th class="ordena" data-col="pct" title="% do alvo já cumprido — clique pra ordenar">%' + seta('pct') + '</th>'
      + '</tr></thead><tbody>' + vids.map((vid, i) => {
        const r = st[vid], P = pcts[vid];
        const nome = esc(r.name || vid);
        // Nome E coordenada: o nome diz o que a aldeia é, a coord diz onde ela está.
        const coord = r.coord && r.coord !== r.name ? '<div class="sub">' + esc(r.coord)
          + ' · ' + esc((config.recruit.templates[r.tpl] || {}).name || '—') + '</div>'
          : '<div class="sub">' + esc((config.recruit.templates[r.tpl] || {}).name || '—') + '</div>';
        const pTxt = P.pct == null ? '—' : Math.round(P.pct * 100) + '%';
        const pDica = P.pior ? ('mais atrasada: ' + unitPt(P.pior.u) + ' ' + Math.round(P.pior.p * 100) + '%') : '';
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + (r.ok ? ' twmgr-rc-full' : '') + '">' +
          '<td><b>' + nome + '</b>' + (r.ok ? ' <span class="twmgr-rc-chk">✓</span>' : '') + coord + '</td>' +
          uns.map((u) => {
            const c = (r.units || {})[u[0]];
            if (!c) return '<td class="vazio">—</td>';
            const f = faixa(c.tem, c.alvo);
            const pct = (c.alvo && c.alvo > 0) ? Math.round((c.tem / c.alvo) * 100) + '%' : '∞';
            return '<td class="f-' + f + '" title="' + esc(unitPt(u[0]) + ': ' + pct) + '">'
              + '<b>' + fmtN(c.tem) + '</b>'
              + '<span class="alvo">(' + (c.alvo == null ? '∞' : fmtN(c.alvo)) + ')</span></td>';
          }).join('')
          + '<td class="f-' + faixa(P.tem, P.alvo) + ' pctcel" title="' + esc(pDica) + '"><b>' + pTxt + '</b></td>'
          + '</tr>';
      }).join('') + '</tbody></table>';

    rcAjustarIcones(box);
    // Delegado no container, e uma vez só: a tabela é refeita a cada ordenação e a cada filtro,
    // então prender no <th> criaria um listener novo por render.
    if (!box._rcOrdOn) {
      box._rcOrdOn = true;
      box.addEventListener('click', (e) => {
        const th = e.target.closest ? e.target.closest('th.ordena') : null;
        if (th) rcOrdenar(th.getAttribute('data-col'));
      });
    }
    const info = document.getElementById('twmgr-rc-status-info');
    if (info) {
      const quando = vids.length ? new Date(Math.max.apply(null, vids.map((v) => st[v].at || 0))).toLocaleTimeString('pt-BR') : '—';
      const ok = vids.filter((v) => st[v].ok).length;
      // TOTAL pela mesma conta de cada linha: soma tudo o que falta, nao a média dos percentuais.
      // A média dos percentuais daria peso igual a uma aldeia de 100 tropas e a uma de 20.000.
      let tTem = 0, tAlvo = 0;
      vids.forEach((v) => { const P = rcPct(st[v]); tTem += P.tem; tAlvo += P.alvo; });
      const tPct = tAlvo > 0 ? Math.round((tTem / tAlvo) * 100) + '%' : '—';
      info.innerHTML = vids.length + ' aldeia(s) · ' + ok + ' com a meta cheia · <b>total ' + tPct
        + '</b> (' + fmtN(tTem) + ' de ' + fmtN(tAlvo) + ') · lido às ' + quando;
    }
  }

  // Filtro de grupo da aba Status. Guarda quais aldeias sao do grupo escolhido; vazio = todas.
  let _rcStatusGrupo = '';
  let _rcStatusPool = {};
  async function rcStatusFiltrar(gid) {
    _rcStatusGrupo = gid || '';
    _rcStatusPool = {};
    if (_rcStatusGrupo) {
      try {
        const vs = await getVillagesInGroup(_rcStatusGrupo);
        (vs || []).forEach((v) => { _rcStatusPool[String(v.vid)] = 1; });
      } catch (e) { pushLog('Recrutar: não consegui ler o grupo do filtro (' + (e.message || e) + ').', 'err', 'recruit'); }
    }
    rcRenderStatus();
  }

  // Releitura sob demanda: mesma varredura do ciclo, mas SEM recrutar. Serve pra conferir depois
  // de mexer num modelo, sem esperar o proximo ciclo nem disparar envio.
  async function rcAtualizarStatus() {
    const btn = document.getElementById('twmgr-rc-status-reload');
    if (btn) btn.textContent = '…';
    try {
      const map = await resolveTargets();
      config.recruit.status = config.recruit.status || {};
      for (const vid of Object.keys(map)) {
        const targets = map[vid].targets || {};
        if (!Object.keys(targets).length) continue;
        let state;
        try { state = await getRecruitState(vid); } catch (e) { continue; }
        const un = {};
        let ok = true;
        Object.keys(targets).forEach((u) => {
          const alvo = targets[u], tem = ((state.units || {})[u] || {}).total || 0;
          un[u] = { tem: tem, alvo: alvo };
          if (alvo == null || tem < alvo) ok = false;
        });
        config.recruit.status[vid] = { name: map[vid].name || vid, coord: map[vid].coord || null,
                                       at: Date.now(), tpl: map[vid].tpl || '', units: un, ok: ok };
        await sleep(250);
      }
      Object.keys(config.recruit.status).forEach((v) => { if (!map[v]) delete config.recruit.status[v]; });
      config.recruit.stats = config.recruit.stats || {};
      config.recruit.stats.villages = Object.keys(map).length;
      config.recruit.stats.metas = Object.keys(config.recruit.status).filter((v) => config.recruit.status[v].ok).length;
      save(); refreshCards('recruit');
    } catch (e) {
      pushLog('Recrutar: não consegui atualizar o status (' + (e.message || e) + ').', 'err', 'recruit');
    }
    if (btn) btn.textContent = '↻';
    rcRenderStatus();
  }

  async function fillGroupSelects() {
    let groups = [];
    try { groups = await getGroups(); } catch (e) { pushLog('Recrutar: erro ao listar grupos: ' + (e.message || e), 'err'); return; }
    _twGroupsCache = groups;
    [['twmgr-rc-stgroup', config.recruit.filterGroup], ['twmgr-bm-group', config.map && config.map.group],
     ['twmgr-farm-group', config.farm && config.farm.group], ['twmgr-bld-group', config.build && config.build.filterGroup],
     ['twmgr-pq-group', config.research && config.research.filterGroup]].forEach(([id, cur]) => {
      const sel = document.getElementById(id); if (!sel) return;
      sel.innerHTML = '<option value="">— nenhum —</option>' + groups.map((g) => '<option value="' + g.id + '"' + (String(cur) === String(g.id) ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('');
    });
    rcRenderEditor();   // o select de grupo do modelo depende deste cache
  }

  function readRecruitCfg() {
    const r = config.recruit;
    rcLerEditor();
    const h = document.getElementById('twmgr-r-hours'); if (h) r.targetHours = Math.max(0.5, parseFloat((h.value || '').replace(',', '.')) || 2);
    const rf = document.getElementById('twmgr-r-refill'); if (rf) r.refillBelowMin = Math.max(1, parseInt(rf.value, 10) || 30);
    save();
  }
  function setRecruitStatus(on) { setBtnState('twmgr-r-start', 'twmgr-r-stop', on, '● Recrutando', '▶ Recrutar'); }
  function recruitStart() {
    readRecruitCfg();
    const temGrupo = Object.keys(config.recruit.templates || {}).some((id) => config.recruit.templates[id].grupo);
    if (!temGrupo) {
      pushLog('Recrutar: nenhum modelo amarrado a um grupo — escolha o grupo no modelo.', 'err', 'recruit');
      return;
    }
    config.recruit.running = true; config.recruit.nextAt = 0; save(); setRecruitStatus(true); pushLog('Recrutar iniciado.', 'ok', 'recruit'); recruitTick();
  }
  function recruitStop() { readRecruitCfg(); config.recruit.running = false; save(); clearTimeout(recruitTimer); setRecruitStatus(false); pushLog('Recrutar parado.', '', 'recruit'); }
  async function runRecruitDiag() {
    pushLog('Diag Recrutar: lendo grupos e tela train…');
    try {
      const groups = await getGroups();
      pushLog('Grupos: ' + groups.map((g) => g.name + '#' + g.id).join(' · '));
      const alvos = await resolveTargets();
      pushLog('Aldeias na gestão: ' + Object.keys(alvos).length);
      const st = await getRecruitState(CUR_VID);
      RUNITS.forEach(([u, n]) => { const s = st.units[u]; if (s) pushLog(n + ': tot ' + s.total + ' · max ' + s.maxRec + ' · ' + s.wood + '/' + s.stone + '/' + s.iron + ' · ' + Math.round(s.buildTime) + 's · req ' + s.reqMet); });
      pushLog('Recursos ' + st.res.wood + '/' + st.res.stone + '/' + st.res.iron + ' · pop livre ' + st.popFree, 'ok');
      showTab('log');
    } catch (e) { pushLog('Diag Recrutar falhou: ' + (e.message || e), 'err'); }
  }

