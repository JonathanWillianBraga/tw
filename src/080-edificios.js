  // ==================== CONSTRUÇÕES (modelos nomeados aplicados por aldeia) ===============
  // População que cada edifício ocupa, lida do próprio mundo. Os valores variam por servidor,
  // então adivinhar é arriscado — o jogo publica em /interface.php?func=get_building_info.
  // Cacheado 7 dias em config (mesmo padrão do ccMundo pras velocidades de unidade); se a
  // leitura falhar, popAcumEdificio cai no BUILD_POP_FALLBACK e nada trava.
  async function carregarPopEdificios(forcar) {
    const b = (config.build = config.build || {});
    if (!forcar && b.popTabela && Object.keys(b.popTabela).length && (Date.now() - (b.popTabelaAt || 0) < 7 * 864e5)) return b.popTabela;
    try {
      const txt = await (await fetch('/interface.php?func=get_building_info', { credentials: 'include' })).text();
      const doc = new DOMParser().parseFromString(txt, 'text/xml');
      const raiz = doc.querySelector('config'); if (!raiz) throw new Error('sem <config>');
      const t = {};
      Array.prototype.slice.call(raiz.children).forEach((el) => {
        const g = (tag) => { const e = el.querySelector(tag); return e ? e.textContent.trim() : null; };
        const base = parseFloat(g('pop')), fator = parseFloat(g('pop_factor'));
        if (!isNaN(base) && !isNaN(fator)) t[el.tagName] = [base, fator];
      });
      if (!Object.keys(t).length) throw new Error('nenhum edifício lido');
      b.popTabela = t; b.popTabelaAt = Date.now(); save();
      return t;
    } catch (e) {
      pushLog('População dos edifícios: não consegui ler do mundo (' + (e.message || e) + ') — usando a tabela padrão.', 'err', 'build');
      return null;
    }
  }
  // Cache curto do estado da aldeia. Construções, Obra e (agora) o Recrutar por receita leem a
  // MESMA tela screen=main; sem cache a mesma aldeia era buscada 2-3x no mesmo minuto.
  const BUILD_STATE_TTL_MS = 60000;
  const _bstCache = {};
  async function getBuildStateCached(vid, forcar) {
    const k = String(vid), e = _bstCache[k];
    if (!forcar && e && (Date.now() - e.at) < BUILD_STATE_TTL_MS) return e.st;
    const st = await getBuildState(vid);
    _bstCache[k] = { st: st, at: Date.now() };
    return st;
  }
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

  // ===== Demolição =====
  // Endpoint CONFIRMADO pelo dump do usuário: é o espelho do upgrade, sem o `type=main`. O
  // `mode=destroy` é só da TELA — a ação não leva.
  async function demolirPredio(vid, b) {
    const res = await fetch('/game.php?village=' + vid + '&screen=main&action=downgrade_building&id=' + b + '&h=' + CSRF,
      { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    // O jogo devolve a própria tela; erro vem numa caixa. Sem conferir, falha passaria por sucesso
    // — e aqui isso seria pior que na obra, porque o log diria "demoli" sem ter demolido.
    const err = doc.querySelector('.error_box, .error');
    if (err && (err.textContent || '').trim()) throw new Error((err.textContent || '').trim().slice(0, 90));
    return true;
  }

  // Quantos itens há na fila de DEMOLIÇÃO da aldeia. Tela própria (mode=destroy), fila própria: as
  // linhas são tr#buildorder_N, cada uma com link de cancelar.
  //
  // Ler isto não é luxo. O nível só cai quando a demolição TERMINA, então sem a fila o módulo
  // pediria a mesma demolição a cada ciclo — o mesmo erro que o `levelEff` corrigiu do lado da
  // construção, e aqui com consequência pior.
  async function getDemolicaoFila(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=main&mode=destroy', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const linhas = doc.querySelectorAll('tr[id^="buildorder_"]').length;
    // Nem toda leva ganha id na tela; conta também os "cancelar" e fica com o maior dos dois.
    const cancels = doc.querySelectorAll('a[href*="action=cancel"][href*="mode=destroy"]').length;
    return Math.max(linhas, cancels);
  }

  // O que demolir nesta aldeia, se é que há algo. Devolve no máximo UM prédio.
  //
  // O interruptor "Demolir excedente" SOZINHO autoriza — decisão do usuário (ago/2026). Antes
  // exigia também marcar prédio por prédio no modelo, o que obrigava a declarar duas vezes a
  // mesma intenção e fazia o interruptor parecer quebrado quando nada acontecia.
  //
  // A proteção não sumiu, ela mudou de lugar: as três travas do ciclo continuam de pé — só com a
  // aldeia COMPLETA (bate o alvo em todos os prédios), um nível por aldeia por ciclo, e só com a
  // fila de demolição vazia. Um nível digitado errado derruba um nível e dá tempo de desligar.
  //
  // Usa o nível REAL, não o efetivo com fila de construção: considerar obra que nem ficou pronta
  // derrubaria o prédio errado.
  // ==================== BOTAO DE PANICO ====================
  // Cancela tudo que esta ESPERANDO na fila e deixa a obra em andamento terminar.
  //
  // A tela separa as duas coisas na CLASSE, nao na posicao:
  //
  //   tr.lit.nodrag  (+ span.timer, sem id)  -> EM CONSTRUCAO
  //   tr.sortable_row#buildorder_N           -> ESPERANDO
  //
  // Meu primeiro palpite foi "a primeira linha e a que esta construindo, cancela da segunda pra
  // frente". Errado: a linha em obra NAO e uma `buildorder_`, entao a `buildorder_1` ja e fila. Ir
  // por posicao cancelaria uma obra em andamento por aldeia — e essa devolve recurso pela metade,
  // enquanto ordem em fila devolve inteiro. As duas tem link de cancelar; so a classe distingue.
  //
  // POR QUE ISTO E DE DOIS PASSOS, E NAO UM `confirm()`
  //
  // A primeira versao lia as 80 aldeias e so entao chamava `window.confirm`. Tres defeitos, e o
  // usuario reportou como "nao funcionou":
  //   1. a leitura leva ~60s e o unico sinal era o texto do botao — parece travado;
  //   2. `confirm()` CONGELA a aba enquanto espera. Medido: a extensao nem conseguia injetar
  //      script na pagina nesse estado;
  //   3. o modulo era desligado ANTES do confirm, entao quem desistia ficava com as Construcoes
  //      paradas sem ter pedido.
  // Agora: passo 1 revisa e MOSTRA a lista no painel, sem tocar em nada; passo 2 executa. O
  // modulo so e desligado no passo 2.

  let _bldPanicoRodando = false, _bldPanicoPlano = null;

  async function bldPanicoLerFila(vid) {
    const r = await fetch('/game.php?village=' + vid + '&screen=main', { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const q = d.querySelector('#buildqueue');
    if (!q) return { obra: null, fila: [] };
    const lit = q.querySelector('tr.lit td');
    const fila = [];
    q.querySelectorAll('tr.sortable_row').forEach((tr) => {
      const a = tr.querySelector('a[href*="action=cancel"]'); if (!a) return;
      // O id sai do `onclick` (`BuildingMain.cancel(<id>, ...)`), que e quem o jogo usa de fato;
      // o `href` entra so como rede.
      const id = ((a.getAttribute('onclick') || '').match(/cancel\((\d+)/) || [])[1]
        || ((a.getAttribute('href') || '').match(/[?&]id=(\d+)/) || [])[1];
      if (!id) return;
      fila.push({ id: id, nome: ((tr.cells[0] || {}).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) });
    });
    return { obra: lit ? (lit.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) : null, fila: fila };
  }

  // CANCELAR E POST, NAO O `href` DO LINK.
  //
  // O link da fila tem `href=...action=cancel&id=...&mode=build&h=...`, e eu usei aquilo. Testado
  // na conta: devolve **HTTP 200 e nao cancela nada**. O href e so fallback; quem faz o trabalho e
  // o `onclick`, que chama `BuildingMain.cancel(id, destroy)` ->
  //
  //     POST screen=main&ajaxaction=cancel_order&type=main&h=<csrf>
  //     corpo: id=<ordem>&destroy=0        (destroy=1 e a fila de DEMOLICAO)
  //
  // E por isso a resposta e conferida pelo campo `success` do JSON, e nao pelo status HTTP: foi
  // exatamente um 200 mentiroso que fez o botao "nao funcionar" sem nenhum erro no log.
  async function bldPanicoCancelar(vid, id) {
    const r = await fetch('/game.php?village=' + vid + '&screen=main&ajaxaction=cancel_order&type=main&h=' + CSRF, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: 'id=' + encodeURIComponent(id) + '&destroy=0'
    });
    const txt = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let j = null; try { j = JSON.parse(txt); } catch (e) { /* nao-JSON cai no erro abaixo */ }
    if (!j) throw new Error('o jogo respondeu algo que não é JSON (' + txt.length + ' bytes)');
    if (j.error) throw new Error(String(j.error).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
    if (j.success === false) throw new Error('o jogo recusou o cancelamento');
  }

  // Quais aldeias vale a pena abrir. A visao geral de Producao traz a coluna "Construcao" das 80
  // numa requisicao so: coluna vazia = nada na fila, nem obra. Poupa abrir ~1/4 das aldeias e,
  // principalmente, e um superconjunto seguro — nunca esconde aldeia que TEM fila.
  async function bldPanicoCandidatas(grupo) {
    let alvo = null;
    if (grupo) {
      try { alvo = {}; (await getVillagesInGroup(grupo)).forEach((v) => { alvo[String(v.vid)] = v; }); }
      catch (e) { throw new Error('não li o grupo (' + (e.message || e) + ')'); }
    }
    const r = await fetch('/game.php?village=' + CUR_VID
      + '&screen=overview_villages&mode=prod&group=0&page=-1', { credentials: 'include' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const tb = d.querySelector('#production_table') || d.querySelector('table.overview_table');
    if (!tb) throw new Error('não achei a tabela de produção');
    const heads = Array.prototype.map.call(tb.querySelectorAll('th'), (t) => (t.textContent || '').replace(/\s+/g, ' ').trim());
    const iC = heads.findIndex((h) => /Constru/i.test(h));
    const out = [];
    tb.querySelectorAll('tr').forEach((tr) => {
      const q = tr.querySelector('.quickedit-vn[data-id]'); if (!q) return;
      const vid = q.getAttribute('data-id');
      if (alvo && !alvo[vid]) return;
      // Sem a coluna, nao da pra filtrar: abre todas em vez de esconder alguma.
      if (iC >= 0) {
        const c = ((tr.querySelectorAll('td')[iC] || {}).textContent || '').replace(/\s+/g, ' ').trim();
        if (!c) return;
      }
      const lbl = tr.querySelector('.quickedit-label');
      out.push({ vid: vid, nome: ((lbl && lbl.textContent) || vid).replace(/\s+/g, ' ').trim().slice(0, 28) });
    });
    return out;
  }

  async function bldPanicoRevisar() {
    if (_bldPanicoRodando) return;
    _bldPanicoRodando = true;
    _bldPanicoPlano = null;
    const grupo = (document.getElementById('twmgr-bld-panico-grp') || {}).value || '';
    const btn = document.getElementById('twmgr-bld-panico');
    const rot = (t) => { if (btn) btn.textContent = t; };
    if (btn) btn.disabled = true;
    try {
      bldPanicoRender('Procurando aldeias com fila…');
      let cands;
      try { cands = await bldPanicoCandidatas(grupo); }
      catch (e) { bldPanicoRender('<span style="color:#b03030">' + esc(e.message || String(e)) + '</span>'); return; }
      if (!cands.length) { bldPanicoRender('Nenhuma aldeia com obra ou fila' + (grupo ? ' nesse grupo' : '') + '.'); return; }

      const achado = [];
      for (let i = 0; i < cands.length; i++) {
        rot('lendo ' + (i + 1) + '/' + cands.length + '…');
        bldPanicoRender('Lendo a fila: <b>' + (i + 1) + '</b> de ' + cands.length + ' aldeia(s)…');
        try {
          const q = await bldPanicoLerFila(cands[i].vid);
          if (q.fila.length) achado.push({ vid: cands[i].vid, nome: cands[i].nome, obra: q.obra, fila: q.fila });
        } catch (e) {
          pushLog('Pânico: não li a fila de ' + cands[i].nome + ' — ' + (e.message || e), 'err', 'build');
        }
        // Em SERIE e com pausa. Medido: 12 leituras em paralelo devolvem página incompleta — a
        // varredura que eu fiz assim pra conferir viu 17 aldeias com fila onde havia 55.
        await sleep(140);
      }
      _bldPanicoPlano = { grupo: grupo, aldeias: achado, at: Date.now() };
      bldPanicoRender();
    } finally {
      _bldPanicoRodando = false;
      if (btn) { btn.disabled = false; rot('🛑 Revisar a fila'); }
    }
  }

  async function bldPanicoExecutar() {
    if (_bldPanicoRodando || !_bldPanicoPlano) return;
    const plano = _bldPanicoPlano;
    const total = plano.aldeias.reduce((a, x) => a + x.fila.length, 0);
    if (!total) return;
    _bldPanicoRodando = true;
    const btn = document.getElementById('twmgr-bld-panico-go');
    try {
      // So AGORA desliga o modulo. Fazer isso na revisao deixava as Construcoes paradas mesmo pra
      // quem olhava a lista e desistia.
      const estava = !!config.build.running;
      if (estava) buildStop();
      let ok = 0, erro = 0, feitas = 0;
      for (const v of plano.aldeias) {
        // De TRAS pra frente: cancelar do fim da fila nunca reordena o que ainda falta cancelar.
        for (let k = v.fila.length - 1; k >= 0; k--) {
          feitas++;
          if (btn) btn.textContent = 'cancelando ' + feitas + '/' + total + '…';
          bldPanicoRender('Cancelando <b>' + feitas + '</b> de ' + total + '…');
          try { await bldPanicoCancelar(v.vid, v.fila[k].id); ok++; v.fila[k].feito = 1; }
          catch (e) { erro++; pushLog('Pânico: ' + v.nome + ' / ' + v.fila[k].nome + ' — ' + (e.message || e), 'err', 'build'); }
          await sleep(220);
        }
      }
      pushLog('🛑 Pânico: ' + ok + ' ordem(ns) cancelada(s) em ' + plano.aldeias.length + ' aldeia(s)'
        + (erro ? ', ' + erro + ' com erro' : '') + '. As obras em andamento seguem'
        + (estava ? ' e o módulo foi desligado.' : '.'), ok ? 'ok' : 'err', 'build');
      _bldPanicoPlano = null;
      bldPanicoRender('<b style="color:#2e7d3a">Pronto.</b> ' + ok + ' ordem(ns) cancelada(s)'
        + (erro ? ', ' + erro + ' com erro (veja o log)' : '') + '. As obras em andamento seguem.');
    } finally {
      _bldPanicoRodando = false;
    }
  }

  function bldPanicoRender(msg) {
    const box = document.getElementById('twmgr-bld-panico-out'); if (!box) return;
    if (msg) { box.innerHTML = '<div style="font-size:10px;color:#6f6153;padding:4px 2px">' + msg + '</div>'; return; }
    const P = _bldPanicoPlano;
    if (!P) { box.innerHTML = ''; return; }
    const total = P.aldeias.reduce((a, x) => a + x.fila.length, 0);
    if (!total) {
      box.innerHTML = '<div style="font-size:10px;color:#6f6153;padding:4px 2px">Nenhuma ordem esperando na fila'
        + (P.grupo ? ' nesse grupo' : '') + ' — nada a cancelar.</div>';
      return;
    }
    box.innerHTML =
      '<div style="border:1px solid #eecfcf;background:#fdf2f2;border-radius:7px;padding:7px;margin-top:5px">' +
        '<div style="font-size:11px;color:#8a3232"><b>' + total + '</b> ordem(ns) esperando em <b>'
        + P.aldeias.length + '</b> aldeia(s).</div>' +
        '<div style="font-size:9px;color:#8a5d2a;margin-top:2px">A obra <b>em andamento</b> de cada aldeia não é tocada. '
        + 'O recurso das ordens em fila volta inteiro. O módulo de Construções será desligado.</div>' +
        '<button id="twmgr-bld-panico-go" class="twmgr-btn twmgr-stop" style="width:100%;margin-top:6px">'
        + '🛑 Cancelar as ' + total + ' ordens</button>' +
      '</div>' +
      '<div style="max-height:190px;overflow-y:auto;margin-top:5px">' +
      P.aldeias.map((v) => '<div style="font-size:9px;border-bottom:1px solid #f0e9dd;padding:3px 2px">' +
        '<b style="color:#463b30">' + esc(v.nome) + '</b>' +
        (v.obra ? ' <span style="color:#2e7d3a">mantém ' + esc(v.obra) + '</span>' : '') +
        '<br><span style="color:#a2643a">cancela: ' + v.fila.map((f) => esc(f.nome)).join(' · ') + '</span>' +
      '</div>').join('') +
      '</div>';
    const go = document.getElementById('twmgr-bld-panico-go');
    if (go) go.addEventListener('click', bldPanicoExecutar);
  }

  function fillBldPanicoGrupo() {
    const sel = document.getElementById('twmgr-bld-panico-grp'); if (!sel) return;
    const atual = sel.value || '';
    sel.innerHTML = '<option value="">todas as aldeias</option>' + (_twGroupsCache || []).map((g) =>
      '<option value="' + g.id + '"' + (String(atual) === String(g.id) ? ' selected' : '') + '>'
      + esc(g.name) + '</option>').join('');
  }

  function bldExcedente(st, plan) {
    for (const it of plan) {
      if (it.en === false) continue;
      const atual = st.level[it.b] || 0;
      if (atual > it.lvl) return { b: it.b, de: atual, para: it.lvl };
    }
    return null;
  }
  // Select de grupo do MODELO ativo: todas as aldeias do grupo passam a seguir esse modelo.
  // ===== Aplicar modelo a um grupo (o select PROPÕE, o botão GRAVA) =====
  // Amarrar um grupo muda o que dezenas de aldeias vão construir. Antes isso acontecia no `change`
  // do select — sem confirmação, e às vezes por rolagem do mouse sobre o campo. Agora existe um
  // passo explícito, e o aviso abaixo do campo diz o que vai acontecer ANTES de acontecer.
  function bldGrpPreview() {
    const sel = document.getElementById('twmgr-bld-tplgrp');
    const av = document.getElementById('twmgr-bld-grp-aviso');
    const bt = document.getElementById('twmgr-bld-aplicar-grp');
    if (!sel || !av) return;
    const t = config.build.templates[_bldActiveProf];
    // Reaplicar o MESMO grupo é ação válida (recarimba as aldeias, adota quem entrou), então o
    // botão nunca fica desligado por "não mudou nada".
    if (bt) bt.style.opacity = t ? '1' : '.45';
    if (!t) { av.textContent = 'Escolha um modelo primeiro.'; return; }
    const novo = sel.value || '';
    const gNome = novo ? ((_twGroupsCache || []).filter((g) => String(g.id) === String(novo))[0] || {}).name || novo : null;
    if (!novo) {
      av.textContent = '▸ Aplicar aqui DESAMARRA o modelo do grupo. As aldeias que já receberam continuam com ele.';
      return;
    }
    av.innerHTML = '▸ <b>Aplicar</b> grava o modelo <b>' + esc(t.name || '') + '</b> em cada aldeia do grupo <b>'
      + esc(String(gNome)) + '</b>, valendo sobre qualquer outro modelo. Aldeia que entrar no grupo depois também é adotada.';
  }
  // O MODELO É APLICADO EM CADA ALDEIA. O grupo é só o jeito de fazer isso em massa.
  //
  // Era aqui que eu tinha entendido errado: `t.grupo` sozinho é um VÍNCULO VIVO, resolvido a cada
  // ciclo, e quando dois modelos alcançavam a mesma aldeia um deles ganhava por critério invisível.
  // O usuário não quer um vínculo disputado: quer que escolher o grupo e clicar em Aplicar deixe
  // aquelas aldeias com aquele modelo, e que isso apareça no Status.
  //
  // Então Aplicar CARIMBA a atribuição em cada aldeia do grupo (`config.build.villages`), que é a
  // atribuição por aldeia — e ela já vence qualquer vínculo de grupo no `bldResolverAldeias`. O
  // efeito é imediato e não depende de quem ganha disputa nenhuma.
  //
  // `t.grupo` continua sendo gravado, mas com outro papel: aldeia que ENTRAR no grupo depois é
  // adotada sozinha no ciclo seguinte. Carimbo = agora; vínculo = daqui pra frente.
  let _bldAplicando = false;
  async function bldAplicarGrupo() {
    if (_bldAplicando) return;
    const sel = document.getElementById('twmgr-bld-tplgrp'); if (!sel) return;
    const t = config.build.templates[_bldActiveProf];
    if (!t) { alert('Escolha um modelo primeiro — o grupo é gravado no modelo.'); return; }
    const novo = sel.value || '';
    const gNome = novo ? ((_twGroupsCache || []).filter((g) => String(g.id) === String(novo))[0] || {}).name || novo : '';
    const bt = document.getElementById('twmgr-bld-aplicar-grp');
    if (!novo) {
      if (!confirm('Desamarrar o modelo "' + (t.name || '') + '" do grupo?\n\n'
        + 'As aldeias que JÁ receberam este modelo continuam com ele — só param de entrar aldeias novas.')) return;
      t.grupo = ''; t.grupoAt = Date.now(); config.build.nextAt = 0; save();
      pushLog('Construções: modelo "' + (t.name || '') + '" desamarrado do grupo. As aldeias já aplicadas seguem com ele.', 'ok', 'build');
      fillBldTplGrupo(); bldRenderTplSelect(); bldGrpPreview(); bldRenderAvulsas(); bldRenderStatus();
      return;
    }
    if (!confirm('Aplicar o modelo "' + (t.name || '') + '" a TODAS as aldeias do grupo "' + gNome + '"?\n\n'
      + 'Cada aldeia do grupo passa a seguir este modelo, valendo sobre qualquer outro.\n'
      + 'Aldeias que entrarem no grupo depois também serão adotadas.')) return;
    _bldAplicando = true;
    const rotulo = bt ? bt.textContent : '';
    if (bt) { bt.textContent = 'Aplicando…'; bt.style.opacity = '.6'; }
    try {
      // Lê o grupo AGORA. Sem isso o carimbo seria feito sobre uma lista adivinhada, e aldeia de
      // fora do grupo receberia modelo que ninguém pediu.
      let vs = [];
      try { vs = await getVillagesInGroup(novo); }
      catch (e) {
        pushLog('Construções: não consegui ler o grupo "' + gNome + '" (' + (e.message || e) + ') — NADA foi aplicado.', 'err', 'build');
        alert('Não consegui ler as aldeias do grupo. Nada foi alterado.');
        return;
      }
      if (!vs || !vs.length) {
        pushLog('Construções: o grupo "' + gNome + '" está vazio — nada foi aplicado.', 'err', 'build');
        alert('O grupo "' + gNome + '" não tem nenhuma aldeia. Nada foi alterado.');
        return;
      }
      config.build.villages = config.build.villages || {};
      let novos = 0, trocados = 0;
      vs.forEach((v) => {
        const k = String(v.vid);
        const ant = config.build.villages[k];
        if (!ant) novos++; else if (ant.tpl !== _bldActiveProf) trocados++;
        // Preserva o que não é atribuição: `paused` é decisão do usuário sobre a aldeia, não sobre
        // o modelo, e perdê-la aqui religaria construção que ele desligou de propósito.
        config.build.villages[k] = {
          tpl: _bldActiveProf,
          paused: !!(ant && ant.paused),
          name: v.name || (ant && ant.name) || v.coord || k,
          coord: v.coord || (ant && ant.coord) || null,
          via: 'grupo',        // marca de aplicação DELIBERADA em massa (ver o aviso de atropelo)
          at: Date.now(),
        };
      });
      t.grupo = novo;
      t.grupoAt = Date.now();
      config.build.nextAt = 0;   // não espera o intervalo: reatribui no próximo tick
      save();
      pushLog('Construções: modelo "' + (t.name || '') + '" aplicado a ' + vs.length + ' aldeia(s) do grupo "'
        + gNome + '"' + (trocados ? (' — ' + trocados + ' trocaram de modelo') : '')
        + (novos ? (', ' + novos + ' entraram na gestão agora') : '') + '.', 'ok', 'build');
    } finally {
      _bldAplicando = false;
      if (bt) { bt.textContent = rotulo || 'Aplicar'; bt.style.opacity = '1'; }
    }
    fillBldTplGrupo(); bldRenderTplSelect(); bldGrpPreview(); bldRenderAvulsas(); bldRenderStatus();
  }
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
                                  : '— clique em ↻ pra ler o status agora —') + '</div>';
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
    // Pixel, nao porcentagem: com muitos predios a conta em % dava largura NEGATIVA pra coluna
    // da aldeia e ela sumia (14 predios -> 100 - 7*14 - 11 = -9%). Com min-width + overflow-x a
    // tabela rola e toda coluna mantem tamanho legivel, pra qualquer quantidade.
    const W_VILA = 132, W_COL = 52, W_PCT = 54;
    const minW = W_VILA + preds.length * W_COL + W_PCT;
    box.innerHTML = '<table class="twmgr-bld-tab twmgr-rc-st" style="min-width:' + minW + 'px"><colgroup>'
      + '<col style="width:' + W_VILA + 'px">'
      + preds.map(() => '<col style="width:' + W_COL + 'px">').join('')
      + '<col style="width:' + W_PCT + 'px"></colgroup>'
      + '<thead><tr><th class="ordena" data-col="name">Aldeia' + seta('name') + '</th>'
      + preds.map((b) => '<th class="ordena" data-col="' + b + '" title="' + esc(BUILD_META[b].name) + ' — clique pra ordenar">'
        + '<i class="twmgr-uicon">' + buildingIcon(b, BUILD_META[b].ico) + '</i>' + seta(b) + '</th>').join('')
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
    // Mesma normalização do Recrutar: as imagens do jogo têm tamanhos diferentes entre si.
    if (typeof rcAjustarIcones === 'function') rcAjustarIcones(box);
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

  // Releitura sob demanda: mesma varredura do ciclo, mas SEM enfileirar nada. Serve pra ver o
  // estado depois de mexer num modelo, sem esperar o proximo ciclo nem disparar obra.
  //
  // Existe porque o Status vem do snapshot do ciclo: antes do primeiro tick a aba fica vazia, e
  // sem este botao nao havia como saber se a configuracao ficou certa.
  async function bldAtualizarStatus() {
    const btn = document.getElementById('twmgr-bld-st-reload');
    if (btn) btn.textContent = '…';
    try {
      const assign = await bldResolverAldeias();
      const vids = Object.keys(assign);
      if (!vids.length) {
        pushLog('Construções: nenhuma aldeia na gestão — amarre um modelo a um grupo.', '', 'build');
      }
      config.build.status = config.build.status || {};
      for (const vid of vids) {
        const alvo = assign[vid];
        const plan = (config.build.templates[alvo.tpl] || {}).plan || [];
        const ativos = plan.filter((it) => it.en !== false);
        if (!ativos.length) continue;
        let st;
        try { st = await getBuildState(vid); } catch (e) { continue; }
        const preds = {};
        let ok = true;
        ativos.forEach((it) => {
          const tem = st.level[it.b] || 0;
          preds[it.b] = { tem: tem, alvo: it.lvl, fila: (st.queued || {})[it.b] || 0 };
          if (tem < it.lvl) ok = false;
        });
        config.build.status[vid] = { name: alvo.name || vid, coord: alvo.coord || null,
                                     at: Date.now(), tpl: alvo.tpl, preds: preds, ok: ok };
        await sleep(250);
      }
      Object.keys(config.build.status).forEach((v) => { if (!assign[v]) delete config.build.status[v]; });
      config.build.stats = config.build.stats || {};
      config.build.stats.villages = vids.length;
      config.build.stats.completas = Object.keys(config.build.status).filter((v) => config.build.status[v].ok).length;
      save(); refreshCards('build');
    } catch (e) {
      pushLog('Construções: não consegui atualizar o status (' + (e.message || e) + ').', 'err', 'build');
    }
    if (btn) btn.textContent = '↻';
    bldRenderStatus();
  }

  async function bldResolverAldeias() {

    const out = {}, tpls = config.build.templates || {};
    let usouGrupo = false;
    const disputa = {};
    // ORDEM DE PRECEDÊNCIA, explícita. Este laço sobrescreve, então quem é processado por ÚLTIMO
    // vence as aldeias em comum. Antes a ordem era `Object.keys`, ou seja ordem de CRIAÇÃO dos
    // modelos — invisível, imprevisível, e a causa de "amarrei o grupo ao modelo novo e não
    // aconteceu nada".
    //
    // Agora ordena pelo carimbo de quando o grupo foi APLICADO: vence o mais recente, que é o que
    // o usuário acabou de mandar fazer. Modelo antigo sem carimbo vale 0 e fica no começo, então
    // config já existente não muda de comportamento sozinha — só perde para o que for aplicado
    // depois, que é exatamente a regra pedida.
    const ordem = Object.keys(tpls)
      .map((id, i) => ({ id: id, i: i, at: parseInt(tpls[id].grupoAt, 10) || 0 }))
      .sort((a, b) => (a.at - b.at) || (a.i - b.i));
    for (const o of ordem) {
      const id = o.id;
      const t = tpls[id];
      if (!t.grupo) continue;
      let vs = [];
      try { vs = await getVillagesInGroup(t.grupo); }
      catch (e) { pushLog('Construções: erro no grupo do modelo "' + (t.name || id) + '": ' + (e.message || e), 'err', 'build'); continue; }
      usouGrupo = true;
      (vs || []).forEach((v) => {
        const k = String(v.vid);
        // DISPUTA ENTRE MODELOS. Este laço sobrescreve: dois modelos que alcançam a mesma aldeia
        // (mesmo grupo nos dois, ou grupos que se cruzam) faziam o ÚLTIMO vencer — e a ordem aqui é
        // a ordem das chaves do objeto, que é ordem de criação dos modelos. Nada disso aparecia.
        //
        // Sintoma relatado pelo usuário: amarrar um grupo a um modelo novo "não fazia nada", e só
        // funcionava depois de tirar o grupo do modelo antigo. A gravação sempre funcionou; o que
        // faltava era o efeito, comido pelo modelo que vinha depois.
        if (out[k] && out[k].tpl !== id) {
          const perdeu = (tpls[out[k].tpl] || {}).name || out[k].tpl;
          const ganhou = t.name || id;
          const par = '"' + perdeu + '" perde pra "' + ganhou + '"';
          disputa[par] = (disputa[par] || 0) + 1;
        }
        out[k] = { tpl: id, name: v.name || v.coord || String(v.vid), coord: v.coord || null };
      });
    }
    // A disputa sai ANTES do aviso de avulsa: é a causa mais provável de "mudei o grupo e não
    // aconteceu nada", e sem ela o usuário culpa o painel.
    const nDisputa = Object.values(disputa).reduce((s, n) => s + n, 0);
    if (nDisputa) {
      pushLog('Construções: ' + nDisputa + ' aldeia(s) são alcançadas por mais de um modelo — os grupos se cruzam.'
        + ' Vale o aplicado mais recentemente: ' + Object.keys(disputa).map((d) => disputa[d] + '× ' + d).join(' · ')
        + '. Pra mudar, escolha o grupo no modelo que deve valer e clique em Aplicar.', '', 'build');
    }
    // Ler grupo deixa o jogo com ele selecionado; volta pra "todos" pra nao afetar as outras telas.
    if (usouGrupo) { try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
    // O mapa POR ALDEIA vence o grupo — proposital, pra exceção pontual. O problema era ser
    // silencioso: config velha aqui atropela o "Aplicar ao grupo" que o painel mostra, e nada
    // dizia isso. Agora quem atropela é contado e vai pro log (a aba Modelos mostra e deixa
    // limpar; ver bldRenderAvulsas/bldLimparAvulsas).
    const atropelou = {}, atropeloVids = [];
    Object.keys(config.build.villages || {}).forEach((vid) => {
      const a = config.build.villages[vid];
      if (a.paused) { delete out[vid]; return; }        // pausada sai, mesmo vindo do grupo
      if (!config.build.templates[a.tpl]) return;
      // `via: 'grupo'` = o usuário aplicou este modelo em massa, de propósito, clicando em Aplicar.
      // Ele vencer o vínculo de OUTRO modelo é o comportamento pedido, não um acidente — avisar
      // aqui encheria o log toda hora com "problema" que é a própria intenção. O aviso existe pra
      // resíduo de config antiga, que é o caso sem essa marca.
      if (out[vid] && out[vid].tpl !== a.tpl && a.via !== 'grupo') {
        const de = (config.build.templates[out[vid].tpl] || {}).name || out[vid].tpl;
        atropelou[de] = (atropelou[de] || 0) + 1;
        atropeloVids.push(vid);
      }
      out[vid] = { tpl: a.tpl, name: a.name || a.coord || vid, coord: a.coord || null };
    });
    // GUARDA A LISTA, não só a contagem. O banner e o botão "Limpar avulsas" usavam uma conta
    // PRÓPRIA e diferente desta: flagravam toda avulsa cujo modelo não tem grupo, sem verificar se
    // a aldeia está em algum grupo. Duas consequências, as duas ruins:
    //   · o botão apagava atribuição deliberada de aldeia que não atropelava NADA, e essas aldeias
    //     ficavam sem modelo nenhum — paravam de construir. O confirm prometia "passam a seguir o
    //     grupo" pra aldeia que não tem grupo pra seguir;
    //   · e NÃO apagava as que o log reclama, quando a avulsa aponta pra um modelo que TEM grupo.
    // Ou seja: o log mandava apertar um botão que não agia sobre o que ele reclamava.
    // Agora log, banner e botão leem a MESMA lista, medida aqui com os grupos resolvidos.
    config.build.atropelo = { vids: atropeloVids, porTpl: atropelou, at: Date.now() };
    const nAtropelo = Object.values(atropelou).reduce((s, n) => s + n, 0);
    if (nAtropelo) {
      pushLog('Construções: ' + nAtropelo + ' aldeia(s) do grupo estão com atribuição AVULSA e não'
        + ' seguem o modelo do grupo (' + Object.keys(atropelou).map((d) => atropelou[d] + '× que seriam "' + d + '"').join(', ')
        + '). Elas aparecem com ✱ no Status; use "Limpar avulsas" na aba Modelos pra valer o grupo.', 'err', 'build');
    }
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

      // Snapshot pra aba Status. Nada custa aqui — o estado já foi lido pra decidir a obra.
      //
      // Este bloco tinha se perdido: um patch anterior falhou no meio e a escrita nunca chegou ao
      // arquivo, então o ciclo podava e contava `config.build.status` sem NUNCA preencher. A aba
      // só enchia pelo botão de reler, e depois de um ciclo continuava vazia.
      const preds = {};
      let tudoOk = true;
      ativos.forEach((it) => {
        const tem = st.level[it.b] || 0;
        preds[it.b] = { tem: tem, alvo: it.lvl, fila: (st.queued || {})[it.b] || 0 };
        if (tem < it.lvl) tudoOk = false;
      });
      config.build.status = config.build.status || {};
      config.build.status[vid] = { name: alvo.name || vid, coord: alvo.coord || null, at: Date.now(),
                                   tpl: alvo.tpl, preds: preds, ok: tudoOk };

      // DEMOLIÇÃO. Três travas, e a mais importante é a primeira:
      //
      //   1. só depois que a aldeia atinge o alvo em TODOS os prédios do modelo (`tudoOk`).
      //      Enquanto ainda está subindo, demolir seria trabalhar contra si mesmo — e, pior, um
      //      alvo digitado errado só derruba coisa depois que a aldeia já está pronta, quando o
      //      erro é visível na tabela (é a linha com ✓).
      //   2. no máximo um nível por aldeia por ciclo.
      //   3. só com a fila de demolição vazia.
      //
      // Vem depois do snapshot pra tabela mostrar o estado ANTES do pedido — o nível só cai quando
      // a demolição termina, então mostrar o de agora é o honesto.
      const exc = (config.build.demolir && tudoOk) ? bldExcedente(st, plan) : null;
      if (exc) {
        let filaDem = 0;
        try { filaDem = await getDemolicaoFila(vid); }
        catch (e) { filaDem = 99; pushLog('Construções: não li a fila de demolição de ' + rotulo + ' — não demoli nada.', '', 'build'); }
        if (filaDem > 0) {
          pushLog('Construções: ' + rotulo + ' — ' + BUILD_META[exc.b].name + ' excedente, mas já há '
            + filaDem + ' na fila de demolição.', '', 'build');
        } else {
          try {
            await demolirPredio(vid, exc.b);
            pushLog('Construções: ' + rotulo + ' — DEMOLINDO ' + BUILD_META[exc.b].name
              + ' (nível ' + exc.de + ' → alvo ' + exc.para + '). Um nível por ciclo.', 'ok', 'build');
          } catch (e) {
            pushLog('Construções: ' + rotulo + ' — não consegui demolir ' + BUILD_META[exc.b].name
              + ' (' + (e.message || e) + ').', 'err', 'build');
          }
          await sleep(400);
        }
      }

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
            // `urgente` VIAJA JUNTO. Ele nasce de bldPrioridadeCondicional, que ja mediu a
            // lotacao real ("sobrou menos de X% de populacao/armazem") e por isso FURA a ordem
            // do modelo aqui dentro. Ate agora essa urgencia morria neste ponto: a demanda saia
            // com a mesma cara de um item comum de fila, e quem le la fora (o Equilibrio) nao
            // tinha como saber que aquela Fazenda trava o recrutamento da aldeia inteira, ou que
            // aquele Armazem esta jogando recurso fora a cada hora.
            //
            // E uma informacao que so existe aqui: e medicao de estado, nao tipo de edificio.
            // Fazenda urgente e diferente de Fazenda que calhou de ser o proximo item do modelo.
            config.build.demand[vid] = { b: r.demand.b, cost: r.demand.cost, coord: alvo.coord,
                                         urgente: !!urgente };
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
    // População que cada item vai ocupar. O "de onde até onde" importa: o item não custa a
    // acumulada do nível alvo, e sim o SALTO desde o nível que o modelo já tinha alcançado
    // naquele prédio antes desta linha — senão "main 5" e depois "main 20" contariam o 5 duas
    // vezes. Por isso o acompanhamento em `ate`, na ordem da lista.
    const ate = {};
    const popItem = plan.map((it) => {
      if (it.en === false) return 0;
      const de = ate[it.b] || 0;
      if (!(it.lvl > de)) return 0;
      ate[it.b] = it.lvl;
      return popAcumEdificio(it.b, it.lvl) - popAcumEdificio(it.b, de);
    });
    box.innerHTML = plan.map((it, i) => {
      const meta = BUILD_META[it.b] || { name: it.b, ico: '?', max: 30 };
      const disabled = it.en === false ? ' twmgr-bld-off' : '';
      return '<div class="twmgr-bld-item' + disabled + '" data-i="' + i + '">' +
        '<span class="twmgr-bld-ord">' + (i + 1) + '.</span>' +
        '<input type="checkbox" class="twmgr-bld-en" data-i="' + i + '"' + (it.en === false ? '' : ' checked') + ' title="ativar/desativar este item">' +
        '<span class="twmgr-bld-ico">' + buildingIcon(it.b, meta.ico) + '</span>' +
        '<span class="twmgr-bld-name" title="' + esc(meta.name) + ' (máx ' + meta.max + ')">' + esc(meta.name) + '</span>' +
        '<input type="number" class="twmgr-bld-lvl twmgr-inp" data-i="' + i + '" min="1" max="' + meta.max + '" value="' + it.lvl + '" title="nível alvo">' +
        '<span style="font-size:9px;color:' + (popItem[i] > 0 ? '#a2643a' : '#c4b9a6') + ';min-width:38px;text-align:right" ' +
          'title="população da fazenda que este salto ocupa">' + (popItem[i] > 0 ? '🌾' + fmtN(popItem[i]) : '') + '</span>' +
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
    // Total de população que os prédios vão ocupar com o modelo COMPLETO. É a acumulada do
    // nível final de cada prédio (não a soma dos itens — o modelo pode passar pelo mesmo
    // prédio várias vezes). Esse número sai da fazenda antes de sobrar espaço pra tropa, e é
    // exatamente o que o Recrutar por receita desconta.
    const totalPop = BUILD_KEYS.reduce((s, b) => s + (fim[b] ? popAcumEdificio(b, fim[b]) : 0), 0);
    const fz = (function () { const e = document.getElementById('pop_max_label');
      const n = e ? (parseInt((e.textContent || '').replace(/\D/g, ''), 10) || 0) : 0; return n > 0 ? n : null; })();
    box.innerHTML = BUILD_KEYS.filter((b) => fim[b]).map((b) => {
      const meta = BUILD_META[b];
      return '<span class="twmgr-bld-sumcell" title="' + esc(meta.name) + '">' + buildingIcon(b, meta.ico) + '<b>' + fim[b] + '</b></span>';
    }).join('') +
      '<div style="font-size:9px;color:#8a7d6d;margin-top:4px">Modelo completo ocupa <b style="color:#a2643a">🌾 ' + fmtN(totalPop) + '</b> de população' +
        (fz ? ' <span style="color:#a2643a">(' + Math.round(100 * totalPop / fz) + '% da fazenda desta aldeia, de ' + fmtN(fz) + ')</span>' : '') +
      '</div>';
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
    const selAba = document.getElementById('twmgr-bld-tplsel'); if (selAba) selAba.value = id;
    // Os DOIS campos, não só a Fazenda. O Armazém faltava aqui: o input nascia com o `value="0"`
    // do HTML e nunca era populado do config, então ele aparecia zerado toda vez que o painel era
    // montado. Pior que cosmético — o handler de `change` grava os dois juntos lendo do DOM, então
    // mexer na Fazenda escrevia o zero da tela por cima do Armazém salvo. Era esse o "reset".
    const fp = document.getElementById('twmgr-bld-farmpct');
    if (fp) fp.value = bldTpl().farmPct != null ? bldTpl().farmPct : 0;
    const sp = document.getElementById('twmgr-bld-storagepct');
    if (sp) sp.value = bldTpl().storagePct != null ? bldTpl().storagePct : 0;
    renderBuildPlan();
    fillBldTplGrupo();   // o grupo e por MODELO, entao acompanha a troca
    bldGrpPreview();     // e o aviso/botao tem que refletir o modelo novo, nao o anterior
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
    // O NÚMERO ENTRE PARÊNTESES é a quantidade de PRÉDIOS do modelo, e ele fica logo acima de um
    // campo chamado "Aplicar ao grupo" — então era lido como quantidade de ALDEIAS. Caso real: o
    // seletor dizia "Mercado (2)" e o Status mostrava 44 aldeias com o modelo Mercado; parecia que
    // a amarração ao grupo tinha falhado, quando estava certa (o grupo [bb+] tem 44 aldeias).
    // Agora a unidade é escrita, e o GRUPO aparece junto — que é a pergunta real de quem está
    // nesta tela: qual modelo vai pra qual grupo.
    sel.innerHTML = ids.map((id) => {
      const t = config.build.templates[id];
      const n = (t.plan || []).length;
      const g = t.grupo ? (_twGroupsCache || []).filter((x) => String(x.id) === String(t.grupo))[0] : null;
      // Grupo gravado que não está mais na lista do jogo (grupo apagado) tem que APARECER, não
      // sumir: é justamente o caso em que o modelo não pega aldeia nenhuma e ninguém entende.
      const gTxt = t.grupo ? (g ? esc(g.name) : 'grupo ' + esc(String(t.grupo)) + ' — NÃO EXISTE MAIS') : 'sem grupo';
      return '<option value="' + esc(id) + '">' + esc(t.name) + ' (' + n + ' ' + (n === 1 ? 'prédio' : 'prédios') + ') → ' + gTxt + '</option>';
    }).join('');
    if (ids.indexOf(_bldActiveProf) < 0 && ids.length) _bldActiveProf = ids[0];
    sel.value = _bldActiveProf;
    // O seletor de modelo da barra de ação em massa espelha a mesma lista
    // Sem seletor de massa: o modelo se aplica por GRUPO.
    // O MESMO seletor existe em dois lugares: na aba (escolha do dia a dia) e na tela de
    // Gerenciar modelos. Ids diferentes de proposito -- id repetido faz o getElementById
    // devolver so o primeiro, e foi assim que a select da aba nasceu vazia (v11.50.0).
    const selAba = document.getElementById('twmgr-bld-tplsel');
    if (selAba) { selAba.innerHTML = sel.innerHTML; selAba.value = _bldActiveProf; }
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

  // ===== Atribuições avulsas (por aldeia) =====
  // O mapa `config.build.villages` VENCE o grupo do modelo (ver bldResolverAldeias): quem está lá
  // ignora o "Aplicar ao grupo" e segue o modelo gravado nele. É proposital pra exceção pontual —
  // mas vira armadilha quando sobra config velha, porque nada na aba Modelos mostrava isso.
  //
  // Caso real (br143): o painel dizia "Maluquinho v6 → Todas as Aldeias" e o usuário tinha 38
  // aldeias, mas 27 delas ainda tinham entrada avulsa de uma configuração anterior (12 Ofensiva,
  // 15 Defensiva). Só 11 rodavam o modelo escolhido, e uma aldeia parada de construir levou horas
  // pra ser explicada — ela tinha COMPLETADO o modelo antigo, não o que estava na tela.
  // Quem atropela o grupo só se sabe RESOLVENDO os grupos, e isso é rede — não dá pra fazer aqui,
  // que roda a cada render de painel. Então esta função LÊ o que o último ciclo mediu, em vez de
  // recalcular por um atalho que erra. Sem ciclo, devolve vazio: melhor não mostrar nada do que
  // oferecer um botão destrutivo baseado em palpite.
  function bldAvulsasQueVencemGrupo() {
    const a = config.build.atropelo;
    if (!a || !a.vids || !a.vids.length) return [];
    // A medição é do último ciclo e o usuário pode ter mexido depois: descarta o que já não existe.
    return a.vids.filter((v) => (config.build.villages || {})[v] && !config.build.villages[v].paused);
  }
  function bldRenderAvulsas() {
    const box = document.getElementById('twmgr-bld-avulsas');
    const txt = document.getElementById('twmgr-bld-avulsas-txt');
    if (!box || !txt) return;
    const lista = bldAvulsasQueVencemGrupo();
    if (!lista.length) { box.style.display = 'none'; return; }
    // O banner dizia o nome do modelo da AVULSA; o log diz o do GRUPO. Dois números diferentes pro
    // mesmo problema tornavam impossível casar a tela com o log. Aqui vale o do log.
    const porTpl = (config.build.atropelo || {}).porTpl || {};
    box.style.display = '';
    txt.innerHTML = '⚠ <b>' + lista.length + ' aldeia(s)</b> estão num grupo mas têm atribuição avulsa e <b>ignoram o modelo do grupo</b>: '
      + esc(Object.keys(porTpl).map((n) => porTpl[n] + '× que seriam "' + n + '"').join(', '))
      + '. Limpar a avulsa faz elas voltarem pro modelo do grupo.';
  }
  function bldLimparAvulsas() {
    const lista = bldAvulsasQueVencemGrupo();
    if (!lista.length) return;
    if (!confirm('Remover a atribuição avulsa de ' + lista.length + ' aldeia(s)?\n\n'
      + 'Todas estão num grupo, então passam a seguir o modelo do grupo.\n'
      + 'Os modelos e o progresso das aldeias não são tocados — só a amarração.')) return;
    lista.forEach((v) => { delete config.build.villages[v]; });
    config.build.nextAt = 0;              // o próximo ciclo já reatribui
    save();
    pushLog('Construções: ' + lista.length + ' atribuição(ões) avulsa(s) removida(s) — essas aldeias'
      + ' passam a seguir o grupo do modelo no próximo ciclo.', 'ok', 'build');
    bldRenderAvulsas(); bldRenderStatus();
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

