  // ==================== CONSTRUÇÕES (modelos nomeados aplicados por aldeia) ===============
  async function getBuildState(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=main', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const level = {}, cost = {}, buildable = {}, hasBtn = {};
    doc.querySelectorAll('[id^="main_buildrow_"]').forEach((tr) => {
      const b = tr.id.replace('main_buildrow_', '');
      const lm = (tr.textContent || '').match(/N[ií]vel\s*(\d+)/i); level[b] = lm ? +lm[1] : 0;
      const gc = (sel) => { const e = tr.querySelector(sel); return e ? (parseInt(e.getAttribute('data-cost'), 10) || 0) : 0; };
      cost[b] = { wood: gc('.cost_wood'), stone: gc('.cost_stone'), iron: gc('.cost_iron') };
      const btn = tr.querySelector('a[href*="action=upgrade_building"], a.btn-bcr');
      hasBtn[b] = !!(btn && btn.getAttribute('href'));
      buildable[b] = !!(btn && btn.getAttribute('href') && !/disabled/.test(btn.className || ''));
    });
    const filaTrs = doc.querySelectorAll('#buildqueue tr.sortable_row, #buildqueue tr.lit');
    const queueLen = filaTrs.length;
    // O "Nível N" do buildrow é o nível JÁ CONSTRUÍDO — obra na fila não aparece nele. Sem ler a
    // fila, o motor reenfileira o mesmo prédio todo ciclo achando que ainda não subiu (main 20 com
    // alvo 21 virava 21, 22, 23... e o resto do modelo nunca era avaliado). `queued[b]` = maior
    // nível daquele prédio já pago na fila; `levelEff` = o que o modelo deve considerar atingido.
    const queued = {};
    const NOMES_FILA = Object.keys(LOCKED_REQ_NAME_TO_KEY).sort((a, b) => b.length - a.length);
    filaTrs.forEach((tr) => {
      const txt = (tr.textContent || '').replace(/\s+/g, ' ');
      const lm = txt.match(/N[ií]vel\s*(\d+)/i); if (!lm) return;
      let key = null;
      const img = tr.querySelector('img[src*="/buildings/"]');
      if (img) {
        const m = (img.getAttribute('src') || '').match(/\/buildings\/(?:mid\/|big_buildings\/)?([a-z_]+?)\d*\.(?:png|webp|gif|jpg)/i);
        if (m && BUILD_META[m[1].toLowerCase()]) key = m[1].toLowerCase();
      }
      if (!key) { for (const nome of NOMES_FILA) { if (txt.indexOf(nome) >= 0) { key = LOCKED_REQ_NAME_TO_KEY[nome]; break; } } }
      if (!key) return;
      queued[key] = Math.max(queued[key] || 0, +lm[1]);
    });
    const levelEff = {};
    Object.keys(level).forEach((b) => { levelEff[b] = Math.max(level[b] || 0, queued[b] || 0); });
    Object.keys(queued).forEach((b) => { if (levelEff[b] == null) levelEff[b] = queued[b]; });
    // Recurso/população — já vêm de graça na mesma página (header do jogo), sem fetch extra. Usado pelo Obra
    // pros gatilhos condicionais de Fazenda (pop livre) e Armazém (% de recurso cheio).
    const num = (id) => { const el = doc.getElementById(id); return el ? (parseInt((el.textContent || '').replace(/\D/g, ''), 10) || 0) : 0; };
    const resInfo = { wood: num('wood'), stone: num('stone'), iron: num('iron'), storageMax: num('storage'), pop: num('pop_current_label'), popMax: num('pop_max_label') };
    // Tabela "Ainda não disponível" (mesma página): pra cada prédio travado, lista os pré-requisitos AINDA
    // não cumpridos (span.inactive). Usado pelo Obra pra priorizar o requisito que falta (ex.: Ed.Principal
    // pra liberar Ferreiro) em vez de cair no próximo item do template por eliminação.
    const locked = {};
    doc.querySelectorAll('tr').forEach((tr) => {
      const reqDiv = tr.querySelector('td div.unmet_req'); if (!reqDiv) return;
      const link = tr.querySelector('td a[href*="screen="]'); if (!link) return;
      const sm = (link.getAttribute('href') || '').match(/screen=([a-z_]+)/i);
      let key = sm ? sm[1].toLowerCase() : null;
      if (!key || !BUILD_META[key]) {
        const nmEl = tr.querySelector('img[data-title]');
        const nm = (link.textContent || (nmEl && nmEl.getAttribute('data-title')) || '').trim();
        key = LOCKED_REQ_NAME_TO_KEY[nm] || null;
      }
      if (!key) return;
      const reqs = [];
      reqDiv.querySelectorAll('span.inactive').forEach((sp) => {
        const m = (sp.textContent || '').trim().match(/^(.+?)\s*\((\d+)\)$/);
        if (!m) return;
        const reqKey = LOCKED_REQ_NAME_TO_KEY[m[1].trim()];
        if (reqKey) reqs.push({ b: reqKey, lvl: +m[2] });
      });
      if (reqs.length) locked[key] = reqs;
    });
    return { level: level, levelEff: levelEff, queued: queued, cost: cost, buildable: buildable, hasBtn: hasBtn, queueLen: queueLen, res: resInfo, locked: locked };
  }
  function computeBuild(state, plan) {
    // ordem estrita: para no 1º item ativo/não atingido que dá pra upar; se não tem recurso, ESPERA (vira demanda)
    for (const it of plan) {
      if (it.en === false) continue;                                     // desabilitado pelo usuário
      if ((state.level[it.b] || 0) >= it.lvl) continue;
      if (!state.hasBtn[it.b]) continue;                                  // maxado / sem pré-requisito -> pula
      if (state.buildable[it.b]) return { build: { b: it.b, cost: state.cost[it.b] }, demand: null };
      return { build: null, demand: { b: it.b, cost: state.cost[it.b] } }; // prioritário sem recurso -> espera + demanda
    }
    return { build: null, demand: null };
  }
  async function enqueueBuild(vid, b) {
    const res = await fetch('/game.php?village=' + vid + '&screen=main&action=upgrade_building&id=' + b + '&type=main&h=' + CSRF, { credentials: 'include' });
    await res.text();
    return true;
  }
  // Select de grupo do MODELO ativo: todas as aldeias do grupo passam a seguir esse modelo.
  function fillBldTplGrupo() {
    const sel = document.getElementById('twmgr-bld-tplgrp'); if (!sel) return;
    const t = config.build.templates[_bldActiveProf];
    sel.innerHTML = '<option value="">— nenhum —</option>' + (_twGroupsCache || []).map((g) =>
      '<option value="' + g.id + '"' + (t && String(t.grupo || '') === String(g.id) ? ' selected' : '') + '>'
      + esc(g.name) + '</option>').join('');
  }
  // ===== Aba Status =====
  // Gemea do Status do Recrutar, com edificios no lugar das unidades. Reusa o mesmo CSS.
  //
  // Cabecalho por EMOJI do BUILD_META (que ja tem `ico` e `name`), nao por imagem do jogo:
  // nao preciso adivinhar caminho de sprite e vale em qualquer mundo.
  let _bldOrd = { col: 'name', dir: 1 };
  function bldOrdenar(col) {
    if (_bldOrd.col === col) _bldOrd.dir = -_bldOrd.dir;
    else _bldOrd = { col: col, dir: col === 'name' ? 1 : -1 };
    bldRenderStatus();
  }
  // % ponderado pelo alvo, igual ao Recrutar: soma(min(tem,alvo))/soma(alvo). Ponderado e nao
  // media dos predios porque subir o principal ate 20 e MUITO mais obra que a fazenda ate 5.
  function bldPct(r) {
    let tem = 0, alvo = 0, pior = null;
    Object.keys(r.preds || {}).forEach((b) => {
      const c = r.preds[b];
      if (!c.alvo) return;
      alvo += c.alvo; tem += Math.min(c.tem, c.alvo);
      const p = c.tem / c.alvo;
      if (!pior || p < pior.p) pior = { b: b, p: p };
    });
    return { pct: alvo > 0 ? tem / alvo : null, tem: tem, alvo: alvo, pior: pior };
  }
  // So os predios que ALGUM modelo pede -- uma coluna por predio do jogo seria metade vazia.
  function bldStatusPredios() {
    const usados = {};
    Object.keys(config.build.templates || {}).forEach((id) => {
      (config.build.templates[id].plan || []).forEach((it) => { if (it.en !== false) usados[it.b] = 1; });
    });
    return Object.keys(BUILD_META).filter((b) => usados[b]);
  }
  let _bldStatusGrupo = '', _bldStatusPool = {};
  async function bldStatusFiltrar(gid) {
    _bldStatusGrupo = gid || '';
    _bldStatusPool = {};
    if (_bldStatusGrupo) {
      try {
        const vs = await getVillagesInGroup(_bldStatusGrupo);
        (vs || []).forEach((v) => { _bldStatusPool[String(v.vid)] = 1; });
      } catch (e) { pushLog('Construções: não consegui ler o grupo do filtro (' + (e.message || e) + ').', 'err', 'build'); }
    }
    bldRenderStatus();
  }
  function bldRenderStatus() {
    const box = document.getElementById('twmgr-bld-sttab'); if (!box) return;
    const st = config.build.status || {};
    let vids = Object.keys(st);
    if (_bldStatusGrupo) vids = vids.filter((v) => _bldStatusPool[v]);
    if (!vids.length) {
      box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:10px;font-size:10px">'
        + (Object.keys(st).length ? '— nenhuma aldeia deste grupo na gestão —'
                                  : '— rode um ciclo pra ver o status —') + '</div>';
      return;
    }
    const preds = bldStatusPredios();
    const faixa = (tem, alvo) => {
      if (!alvo) return 'inf';
      if (tem >= alvo) return 'ok';
      const p = tem / alvo;
      return p < 0.5 ? 'ruim' : (p < 0.8 ? 'meio' : 'bom');
    };
    const pcts = {}; vids.forEach((v) => { pcts[v] = bldPct(st[v]); });
    const valor = (vid) => {
      if (_bldOrd.col === 'name') return null;
      if (_bldOrd.col === 'pct') return pcts[vid].pct;
      const c = (st[vid].preds || {})[_bldOrd.col];
      return c ? c.tem : null;
    };
    vids.sort((a, b) => {
      if (_bldOrd.col === 'name') return _bldOrd.dir * String(st[a].name).localeCompare(String(st[b].name), 'pt-BR', { numeric: true });
      const va = valor(a), vb = valor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return _bldOrd.dir * (va - vb);
    });
    const seta = (col) => _bldOrd.col === col ? '<span class="ord">' + (_bldOrd.dir > 0 ? '▲' : '▼') + '</span>' : '';
    const wp = Math.max(7, Math.floor(56 / Math.max(1, preds.length)));
    box.innerHTML = '<table class="twmgr-bld-tab twmgr-rc-st"><colgroup>'
      + '<col style="width:' + (100 - wp * preds.length - 11) + '%">'
      + preds.map(() => '<col style="width:' + wp + '%">').join('')
      + '<col style="width:11%"></colgroup>'
      + '<thead><tr><th class="ordena" data-col="name">Aldeia' + seta('name') + '</th>'
      + preds.map((b) => '<th class="ordena" data-col="' + b + '" title="' + esc(BUILD_META[b].name) + ' — clique pra ordenar">'
        + '<span class="bico">' + BUILD_META[b].ico + '</span>' + seta(b) + '</th>').join('')
      + '<th class="ordena" data-col="pct" title="% do modelo já construído">%' + seta('pct') + '</th>'
      + '</tr></thead><tbody>' + vids.map((vid, i) => {
        const r = st[vid], P = pcts[vid];
        const avulso = !!(config.build.villages || {})[vid];
        const sub2 = (r.coord ? esc(r.coord) + ' · ' : '')
          + esc((config.build.templates[r.tpl] || {}).name || '—')
          + (avulso ? ' <span title="atribuição avulsa: vence o grupo">✱</span>' : '');
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + (r.ok ? ' twmgr-rc-full' : '') + '">' +
          '<td><b>' + esc(r.name || vid) + '</b>' + (r.ok ? ' <span class="twmgr-rc-chk">✓</span>' : '')
          + '<div class="sub">' + sub2 + '</div></td>' +
          preds.map((b) => {
            const c = (r.preds || {})[b];
            if (!c) return '<td class="vazio">—</td>';
            const f = faixa(c.tem, c.alvo);
            // Obra na fila aparece como ▸: o número é o que ESTÁ de pé, mas saber que já está
            // pago evita achar que o módulo parou.
            const naFila = (c.fila && c.fila > c.tem) ? '<span class="nafila" title="nível ' + c.fila + ' já na fila">▸</span>' : '';
            return '<td class="f-' + f + '" title="' + esc(BUILD_META[b].name + ': ' + c.tem + ' de ' + c.alvo) + '">'
              + '<b>' + c.tem + '</b><span class="alvo">(' + c.alvo + ')</span>' + naFila + '</td>';
          }).join('')
          + '<td class="f-' + faixa(P.tem, P.alvo) + ' pctcel" title="'
          + esc(P.pior ? ('mais atrasado: ' + BUILD_META[P.pior.b].name + ' ' + Math.round(P.pior.p * 100) + '%') : '')
          + '"><b>' + (P.pct == null ? '—' : Math.round(P.pct * 100) + '%') + '</b></td></tr>';
      }).join('') + '</tbody></table>';
    if (!box._bldOrdOn) {
      box._bldOrdOn = true;
      box.addEventListener('click', (e) => {
        const th = e.target.closest ? e.target.closest('th.ordena') : null;
        if (th) bldOrdenar(th.getAttribute('data-col'));
      });
    }
    const info = document.getElementById('twmgr-bld-sttab-info');
    if (info) {
      let tTem = 0, tAlvo = 0;
      vids.forEach((v) => { const P = pcts[v]; tTem += P.tem; tAlvo += P.alvo; });
      const ok = vids.filter((v) => st[v].ok).length;
      const quando = new Date(Math.max.apply(null, vids.map((v) => st[v].at || 0))).toLocaleTimeString('pt-BR');
      info.innerHTML = vids.length + ' aldeia(s) · ' + ok + ' com o modelo completo · <b>total '
        + (tAlvo > 0 ? Math.round((tTem / tAlvo) * 100) + '%' : '—') + '</b> · lido às ' + quando;
    }
  }

  async function bldResolverAldeias() {

    const out = {}, tpls = config.build.templates || {};
    let usouGrupo = false;
    for (const id of Object.keys(tpls)) {
      const t = tpls[id];
      if (!t.grupo) continue;
      let vs = [];
      try { vs = await getVillagesInGroup(t.grupo); }
      catch (e) { pushLog('Construções: erro no grupo do modelo "' + (t.name || id) + '": ' + (e.message || e), 'err', 'build'); continue; }
      usouGrupo = true;
      (vs || []).forEach((v) => {
        out[String(v.vid)] = { tpl: id, name: v.name || v.coord || String(v.vid), coord: v.coord || null };
      });
    }
    // Ler grupo deixa o jogo com ele selecionado; volta pra "todos" pra nao afetar as outras telas.
    if (usouGrupo) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
    Object.keys(config.build.villages || {}).forEach((vid) => {
      const a = config.build.villages[vid];
      if (a.paused) { delete out[vid]; return; }        // pausada sai, mesmo vindo do grupo
      if (!config.build.templates[a.tpl]) return;
      out[vid] = { tpl: a.tpl, name: a.name || a.coord || vid, coord: a.coord || null };
    });
    return out;
  }

  async function buildTick() {

    clearTimeout(buildTimer);
    if (!config.build.running) return;
    if (lockOther()) { buildTimer = setTimeout(buildTick, 5000); return; }
    if (captchaBlocked()) { buildTimer = setTimeout(buildTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.build.nextAt || 0) > now) { scheduleBuild(); return; }
    let assign = {};
    try { assign = await bldResolverAldeias(); }
    catch (e) {
      pushLog('Construções: erro ao resolver as aldeias (' + (e.message || e) + ').', 'err', 'build');
      config.build.nextAt = now + 120000; save(); scheduleBuild(); return;
    }
    const ativas = Object.keys(assign);
    if (!ativas.length) { pushLog('Construções: nenhuma aldeia na gestão — amarre um modelo a um grupo.', '', 'build'); config.build.nextAt = now + 300000; save(); scheduleBuild(); return; }
    // Guarda anticolisão: o Obra (módulo do Johann) também enfileira obra. Se os dois pegarem a
    // mesma aldeia, brigam pela fila e gastam recurso fora de ordem. O Construções cede, porque é
    // o genérico e o Obra trabalha por grupo nativo do jogo.
    const donoOutro = {};
    if (config.obra && config.obra.running) {
      try { Object.keys(await getGroupProfileMapObra()).forEach((v) => { donoOutro[v] = 'Obra'; }); }
      catch (e) { pushLog('Construções: não consegui checar as aldeias do Obra (' + (e.message || e) + ') — sigo sem a guarda.', '', 'build'); }
    }
    const vids = ativas.filter((v) => !donoOutro[v]);
    if (ativas.length !== vids.length) {
      const porDono = {};
      ativas.filter((v) => donoOutro[v]).forEach((v) => { porDono[donoOutro[v]] = (porDono[donoOutro[v]] || 0) + 1; });
      pushLog('Construções: pulei ' + Object.keys(porDono).map((d) => porDono[d] + ' aldeia(s) do ' + d).join(' e ') + ' — já estão construindo por lá.', '', 'build');
    }
    config.build.demand = {};
    let built = 0;
    for (const vid of vids) {
      { const pare = devoParar('build'); if (pare) { pushLog('Construções: ciclo interrompido — ' + pare + '.', '', 'build'); break; } }
      const alvo = assign[vid];
      const tplObj = config.build.templates[alvo.tpl] || {};
      const plan = tplObj.plan || [];
      const rotulo = alvo.name || alvo.coord || vid;
      let st;
      try { st = await getBuildState(vid); }
      catch (e) { pushLog('Construções em ' + rotulo + ': erro ao ler o estado (' + (e.message || e) + ').', 'err', 'build'); continue; }
      // "Ordens" da tabela = quantos itens ATIVOS do modelo já foram atingidos / total (espelha o X/50 do jogo).
      // Usa o nível REAL (não o da fila) — o número tem que dizer o que está de pé na aldeia.
      const ativos = plan.filter((it) => it.en !== false);
      alvo.total = ativos.length;
      alvo.done = ativos.filter((it) => (st.level[it.b] || 0) >= it.lvl).length;
      // ENCHE A FILA no mesmo ciclo, até o "Máx na fila" escolhido pelo usuário. Reler o estado a
      // cada obra é necessário e não é desperdício: enfileirar já debita o recurso, então só o
      // servidor sabe se ainda dá pra pagar a próxima. Na prática o recurso acaba antes dos slots
      // e o laço morre em 1-2 voltas.
      const postos = [];
      let slots = Math.max(0, (config.build.maxQueue || 5) - st.queueLen);
      while (slots > 0) {
        // O que já está NA FILA conta como atingido — senão o motor reenfileira o mesmo prédio
        // todo ciclo e nunca avança pro próximo item do modelo.
        const stEff = Object.assign({}, st, { level: st.levelEff || st.level });
        // Fazenda/armazém condicionais furam a ordem do modelo quando o gatilho dispara
        const urgente = bldPrioridadeCondicional(stEff, tplObj);
        let r;
        if (urgente) r = stEff.buildable[urgente] ? { build: { b: urgente, cost: stEff.cost[urgente] }, demand: null } : { build: null, demand: { b: urgente, cost: stEff.cost[urgente] } };
        else r = computeBuild(stEff, plan);
        if (!r.build) {
          if (r.demand) {
            config.build.demand[vid] = { b: r.demand.b, cost: r.demand.cost, coord: alvo.coord };
            // Só reclama de falta de recurso se não conseguiu enfileirar NADA — depois de encher
            // uns slots, parar por falta de recurso é o comportamento esperado, não um aviso.
            if (!postos.length) {
              const bn = (BUILD_META[r.demand.b] && BUILD_META[r.demand.b].name) || r.demand.b;
              pushLog(rotulo + ': aguardando recurso p/ ' + bn + ' (' + r.demand.cost.wood + '/' + r.demand.cost.stone + '/' + r.demand.cost.iron + ')', '', 'build');
            }
          }
          break;
        }
        try { await enqueueBuild(vid, r.build.b); }
        catch (e) { pushLog('Construções em ' + rotulo + ': ' + (e.message || e), 'err', 'build'); break; }
        postos.push((BUILD_META[r.build.b] && BUILD_META[r.build.b].name) || r.build.b);
        built++; slots--;
        if (slots <= 0) break;
        await sleep(300);
        let novo;
        try { novo = await getBuildState(vid); }
        catch (e) { break; }
        // Trava de segurança: se a fila não cresceu, o enfileiramento não pegou (recurso, pré-req,
        // limite do jogo). Insistir aqui viraria laço infinito batendo no servidor.
        if (novo.queueLen <= st.queueLen) { st = novo; break; }
        st = novo;
      }
      if (postos.length) pushLog('Construções: ' + rotulo + ' → ' + postos.join(', ') + ' na fila (' + postos.length + ' obra' + (postos.length > 1 ? 's' : '') + ').', 'ok', 'build');
      await sleep(300);
    }
    // Aldeia que saiu da gestão some do Status — senão a aba mostraria dado velho pra sempre.
    Object.keys(config.build.status || {}).forEach((v) => { if (!assign[v]) delete config.build.status[v]; });
    bldRenderStatus();
    config.build.stats = config.build.stats || {};
    config.build.stats.villages = vids.length;
    config.build.stats.completas = Object.keys(config.build.status || {}).filter((v) => config.build.status[v].ok).length;
    config.build.nextAt = now + Math.max(60, config.build.interval || 600) * 1000;
    save();
    refreshCards('build');
    pushLog('Construções: ciclo concluído — ' + built + ' obra(s) enfileirada(s). Próximo em ' + Math.round((config.build.interval || 600) / 60) + ' min.', 'ok', 'build');
    scheduleBuild();
  }
  function scheduleBuild() { clearTimeout(buildTimer); if (!config.build.running) return; buildTimer = setTimeout(buildTick, Math.min(Math.max((config.build.nextAt || 0) - Date.now(), 1000), 60000)); }
  function readBuildCfg() {
    const c = config.build, g = (id) => document.getElementById(id);
    if (g('twmgr-bld-max')) c.maxQueue = Math.max(1, parseInt(g('twmgr-bld-max').value, 10) || 5);
    if (g('twmgr-bld-int')) c.interval = Math.max(1, parseInt(g('twmgr-bld-int').value, 10) || 10) * 60;
    save();
  }
  let _bldActiveProf = 'atk';   // agora guarda o ID do MODELO ativo no editor (não mais o perfil atk/def)
  function bldTplIds() { return Object.keys(config.build.templates || {}); }
  function bldTpl(id) { return (config.build.templates || {})[id || _bldActiveProf] || null; }
  function bldPlanAtual() {
    const t = bldTpl(); if (t) return (t.plan = t.plan || []);
    const ids = bldTplIds(); if (!ids.length) return [];
    _bldActiveProf = ids[0]; return (config.build.templates[ids[0]].plan = config.build.templates[ids[0]].plan || []);
  }
  function renderBuildPlan() {
    const box = document.getElementById('twmgr-bld-plan'); if (!box) return;
    const plan = bldPlanAtual();
    if (!plan.length) { box.innerHTML = '<div style="color:#8a7d6d;text-align:center;padding:10px;font-size:10px">— lista vazia (use o + abaixo pra adicionar) —</div>'; renderBuildSummary(); return; }
    box.innerHTML = plan.map((it, i) => {
      const meta = BUILD_META[it.b] || { name: it.b, ico: '?', max: 30 };
      const disabled = it.en === false ? ' twmgr-bld-off' : '';
      return '<div class="twmgr-bld-item' + disabled + '" data-i="' + i + '">' +
        '<span class="twmgr-bld-ord">' + (i + 1) + '.</span>' +
        '<input type="checkbox" class="twmgr-bld-en" data-i="' + i + '"' + (it.en === false ? '' : ' checked') + ' title="ativar/desativar este item">' +
        '<span class="twmgr-bld-ico">' + buildingIcon(it.b, meta.ico) + '</span>' +
        '<span class="twmgr-bld-name" title="' + esc(meta.name) + ' (máx ' + meta.max + ')">' + esc(meta.name) + '</span>' +
        '<input type="number" class="twmgr-bld-lvl twmgr-inp" data-i="' + i + '" min="1" max="' + meta.max + '" value="' + it.lvl + '" title="nível alvo">' +
        '<span class="twmgr-bld-up" data-i="' + i + '" title="subir prioridade">▲</span>' +
        '<span class="twmgr-bld-down" data-i="' + i + '" title="descer prioridade">▼</span>' +
        '<span class="twmgr-bld-rm" data-i="' + i + '" title="remover">✕</span>' +
        '</div>';
    }).join('');
    renderBuildSummary();
  }
  function bindBuildPlanHandlers() {
    const box = document.getElementById('twmgr-bld-plan'); if (!box) return;
    box.addEventListener('change', (e) => {
      const el = e.target; const i = parseInt(el.getAttribute('data-i'), 10);
      const plan = bldPlanAtual(); if (!plan || isNaN(i) || !plan[i]) return;
      if (el.classList.contains('twmgr-bld-en')) plan[i].en = !!el.checked;
      else if (el.classList.contains('twmgr-bld-lvl')) {
        const meta = BUILD_META[plan[i].b]; const max = meta ? meta.max : 30;
        plan[i].lvl = Math.max(1, Math.min(max, parseInt(el.value, 10) || 1));
        el.value = plan[i].lvl;
      }
      save(); renderBuildPlan();
    });
    box.addEventListener('click', (e) => {
      const el = e.target; const i = parseInt(el.getAttribute('data-i'), 10);
      const plan = bldPlanAtual(); if (!plan || isNaN(i) || !plan[i]) return;
      if (el.classList.contains('twmgr-bld-up') && i > 0) { const tmp = plan[i - 1]; plan[i - 1] = plan[i]; plan[i] = tmp; save(); renderBuildPlan(); }
      else if (el.classList.contains('twmgr-bld-down') && i < plan.length - 1) { const tmp = plan[i + 1]; plan[i + 1] = plan[i]; plan[i] = tmp; save(); renderBuildPlan(); }
      else if (el.classList.contains('twmgr-bld-rm')) { plan.splice(i, 1); save(); renderBuildPlan(); }
    });
  }
  // Sumário do modelo — a gradezinha do topo do "Editar modelo" do jogo: prédio -> nível final que
  // o modelo alcança. Só mostra o que o modelo toca (senão viram 17 colunas de uma vez).
  function renderBuildSummary() {
    const box = document.getElementById('twmgr-bld-sum'); if (!box) return;
    const plan = bldPlanAtual().filter((it) => it.en !== false);
    if (!plan.length) { box.innerHTML = '<span style="color:#8a7d6d;font-size:10px">— modelo vazio —</span>'; return; }
    const fim = {};
    plan.forEach((it) => { fim[it.b] = Math.max(fim[it.b] || 0, it.lvl); });
    box.innerHTML = BUILD_KEYS.filter((b) => fim[b]).map((b) => {
      const meta = BUILD_META[b];
      return '<span class="twmgr-bld-sumcell" title="' + esc(meta.name) + '">' + buildingIcon(b, meta.ico) + '<b>' + fim[b] + '</b></span>';
    }).join('');
  }
  // Gatilhos condicionais do modelo — espelham o "Priorize a construção da fazenda em: menos de X%
  // da população disponível" do Gerente de conta, mais o mesmo para o armazém. Ambos furam a ordem
  // do modelo quando disparam, porque fazenda cheia trava recrutamento e armazém cheio joga recurso
  // fora — nenhum dos dois pode esperar a fila chegar neles. 0 = desligado.
  // Atenção à leitura: é % DISPONÍVEL (livre), não % usada. 10 = "sobrou menos de 10% de espaço".
  function bldPrioridadeCondicional(st, tpl) {
    const res = st.res || {};
    const fPct = parseInt(tpl.farmPct, 10) || 0;
    if (fPct > 0 && (st.level.farm || 0) < BUILD_META.farm.max && st.hasBtn.farm) {
      const popMax = res.popMax || 0;
      if (popMax && ((popMax - (res.pop || 0)) / popMax) * 100 < fPct) return 'farm';
    }
    const sPct = parseInt(tpl.storagePct, 10) || 0;
    if (sPct > 0 && (st.level.storage || 0) < BUILD_META.storage.max && st.hasBtn.storage) {
      const cap = res.storageMax || 0;
      const cheio = Math.max(res.wood || 0, res.stone || 0, res.iron || 0);   // o recurso mais perto de estourar manda
      if (cap && ((cap - cheio) / cap) * 100 < sPct) return 'storage';
    }
    return null;
  }
  function bldAddItem() {
    const b = document.getElementById('twmgr-bld-add-b').value;
    const lvlInp = document.getElementById('twmgr-bld-add-lvl');
    const meta = BUILD_META[b]; if (!meta) return;
    const lvl = Math.max(1, Math.min(meta.max, parseInt(lvlInp.value, 10) || meta.max));
    const plan = bldPlanAtual();
    plan.push({ b: b, lvl: lvl, en: true });
    lvlInp.value = '';
    save(); renderBuildPlan();
  }
  function bldSwitchProf(id) {
    if (!bldTpl(id)) return;
    _bldActiveProf = id;
    const sel = document.getElementById('twmgr-bld-tpl'); if (sel) sel.value = id;
    const fp = document.getElementById('twmgr-bld-farmpct');
    if (fp) fp.value = bldTpl().farmPct != null ? bldTpl().farmPct : 0;
    renderBuildPlan();
    fillBldTplGrupo();   // o grupo e por MODELO, entao acompanha a troca
  }
  function bldResetDefault() {
    const t = bldTpl(); if (!t) return;
    if (!confirm('Reset do modelo "' + t.name + '" pro padrão ' + (_bldActiveProf === 'def' ? 'Defensiva' : 'Ofensiva') + '?')) return;
    t.plan = tplToPlan(_bldActiveProf === 'def' ? DEF_TPL : ATK_TPL);
    save(); renderBuildPlan();
  }
  function bldClearAll() {
    const t = bldTpl(); if (!t) return;
    if (!confirm('Limpar TODOS os itens do modelo "' + t.name + '"?')) return;
    t.plan = [];
    save(); renderBuildPlan();
  }

  // ===== Gerenciar modelos (equivalente ao "Gerenciar modelos" do Gerente de conta) =====
  function bldRenderTplSelect() {
    const sel = document.getElementById('twmgr-bld-tpl'); if (!sel) return;
    const ids = bldTplIds();
    sel.innerHTML = ids.map((id) => '<option value="' + esc(id) + '">' + esc(config.build.templates[id].name) + ' (' + (config.build.templates[id].plan || []).length + ')</option>').join('');
    if (ids.indexOf(_bldActiveProf) < 0 && ids.length) _bldActiveProf = ids[0];
    sel.value = _bldActiveProf;
    // O seletor de modelo da barra de ação em massa espelha a mesma lista
    // Sem seletor de massa: o modelo se aplica por GRUPO.
  }
  function bldNovoModelo() {
    const nome = (prompt('Nome do novo modelo:', '') || '').trim();
    if (!nome) return;
    const base = confirm('Copiar os itens do modelo "' + (bldTpl() ? bldTpl().name : '') + '"?\n\nOK = copiar   ·   Cancelar = modelo vazio');
    const id = 'tpl' + Date.now().toString(36);
    config.build.templates[id] = { name: nome.slice(0, 40), plan: base && bldTpl() ? bldPlanAtual().map((it) => ({ b: it.b, lvl: it.lvl, en: it.en })) : [] };
    _bldActiveProf = id;
    save(); bldRenderTplSelect(); renderBuildPlan(); bldRenderStatus();
    pushLog('Modelo "' + nome + '" criado.', 'ok', 'build');
  }
  function bldRenomearModelo() {
    const t = bldTpl(); if (!t) return;
    const nome = (prompt('Novo nome do modelo:', t.name) || '').trim();
    if (!nome) return;
    t.name = nome.slice(0, 40);
    save(); bldRenderTplSelect(); bldRenderStatus();
  }
  function bldApagarModelo() {
    const t = bldTpl(); if (!t) return;
    if (bldTplIds().length < 2) { alert('Precisa sobrar pelo menos um modelo.'); return; }
    const usando = Object.keys(config.build.villages).filter((v) => config.build.villages[v].tpl === _bldActiveProf);
    const aviso = usando.length ? '\n\n' + usando.length + ' aldeia(s) usam esse modelo e vão SAIR da tabela.' : '';
    if (!confirm('Apagar o modelo "' + t.name + '"?' + aviso)) return;
    usando.forEach((v) => { delete config.build.villages[v]; });
    delete config.build.templates[_bldActiveProf];
    _bldActiveProf = bldTplIds()[0];
    save(); bldRenderTplSelect(); renderBuildPlan(); bldRenderStatus();
  }

  // ===== Exportar / importar modelo (equivalente ao "Importar Modelo" do Gerente de conta) =====
  // Formato antes do base64: TWM1|<nome>|<farmPct>|<storagePct>|main15,farm20,-wall10
  // O "-" na frente marca item desativado. Versionado no prefixo (TWM1) pra um formato futuro poder
  // ser recusado com mensagem clara em vez de importar lixo silenciosamente.
  function bldCodificar(txt) {
    const bytes = new TextEncoder().encode(txt);
    let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function bldDecodificar(b64) {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  }
  function bldExportarModelo() {
    const t = bldTpl(); if (!t) return;
    const itens = (t.plan || []).map((it) => (it.en === false ? '-' : '') + it.b + it.lvl).join(',');
    const cru = ['TWM1', String(t.name).replace(/\|/g, '/'), parseInt(t.farmPct, 10) || 0, parseInt(t.storagePct, 10) || 0, itens].join('|');
    const codigo = bldCodificar(cru);
    const avisar = (comoFoi) => {
      pushLog('Modelo "' + t.name + '" exportado (' + (t.plan || []).length + ' itens) — ' + comoFoi + '.', 'ok', 'build');
    };
    // Clipboard é o caminho bom, mas só funciona em contexto seguro e com a aba em foco; o prompt
    // é a rede de segurança — o código fica selecionável do mesmo jeito.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codigo).then(
        () => { avisar('copiado pra área de transferência'); alert('Código copiado!\n\nManda pro seu amigo colar no 📥 da aba Construções.'); },
        () => { prompt('Copie o código do modelo (Ctrl+C):', codigo); avisar('mostrado pra copiar'); }
      );
    } else { prompt('Copie o código do modelo (Ctrl+C):', codigo); avisar('mostrado pra copiar'); }
  }
  function bldImportarModelo() {
    const codigo = (prompt('Cole o código do modelo:', '') || '').trim();
    if (!codigo) return;
    let cru;
    try { cru = bldDecodificar(codigo); }
    catch (e) { alert('Código inválido — não consegui decodificar.'); return; }
    const partes = cru.split('|');
    if (partes[0] !== 'TWM1') { alert('Código não reconhecido.\n\nSe veio de uma versão mais nova do script, atualize o seu antes de importar.'); return; }
    const nome = (partes[1] || 'Importado').slice(0, 40);
    const plan = [], ignorados = [];
    (partes[4] || '').split(',').filter(Boolean).forEach((tk) => {
      const m = tk.trim().match(/^(-?)([a-z_]+)(\d+)$/i);
      if (!m || !BUILD_META[m[2].toLowerCase()]) { ignorados.push(tk); return; }
      const b = m[2].toLowerCase();
      plan.push({ b: b, lvl: Math.max(1, Math.min(BUILD_META[b].max, parseInt(m[3], 10) || 1)), en: m[1] !== '-' });
    });
    if (!plan.length) { alert('O código não tem nenhum item válido.'); return; }
    const clamp = (v) => Math.max(0, Math.min(99, parseInt(v, 10) || 0));
    const id = 'tpl' + Date.now().toString(36);
    config.build.templates[id] = { name: nome, plan: plan, farmPct: clamp(partes[2]), storagePct: clamp(partes[3]) };
    _bldActiveProf = id;
    save(); bldRenderTplSelect(); bldSwitchProf(id); bldRenderStatus();
    pushLog('Modelo "' + nome + '" importado com ' + plan.length + ' item(ns)' + (ignorados.length ? ' — ' + ignorados.length + ' ignorado(s): ' + ignorados.join(', ') : '') + '.', 'ok', 'build');
    alert('Modelo "' + nome + '" importado com ' + plan.length + ' item(ns).' + (ignorados.length ? '\n\n' + ignorados.length + ' item(ns) foram ignorados por não existirem neste mundo:\n' + ignorados.join(', ') : ''));
  }

  function setBuildStatus(on) { setBtnState('twmgr-bld-start', 'twmgr-bld-stop', on, '● Construindo', '▶ Construir'); }
  function buildStart() {
    readBuildCfg();
    const comGrupo = bldTplIds().filter((id) => config.build.templates[id].grupo);
    const avulsas = Object.keys(config.build.villages || {}).filter((v) => !config.build.villages[v].paused).length;
    if (!comGrupo.length && !avulsas) {
      pushLog('Construções: nenhum modelo amarrado a um grupo — escolha o grupo no modelo.', 'err', 'build');
      return;
    }
    config.build.running = true; config.build.nextAt = 0; save();
    setBuildStatus(true);
    pushLog('Construções iniciado — ' + comGrupo.length + ' modelo(s) com grupo'
      + (avulsas ? ' e ' + avulsas + ' aldeia(s) avulsa(s)' : '') + '.', 'ok', 'build');
    buildTick();
  }
  function buildStop() { readBuildCfg(); config.build.running = false; save(); clearTimeout(buildTimer); setBuildStatus(false); pushLog('Construções parado.', '', 'build'); }

