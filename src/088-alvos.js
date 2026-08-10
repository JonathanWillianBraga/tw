  // ==================== FICHAS DE ALVO (aldeia de ATAQUE ou de DEFESA) ====================
  // Regra do usuário, e ela é o coração do módulo: no TW, uma aldeia OFENSIVA recruta bárbaro e
  // uma DEFENSIVA recruta espadachim. Ninguém mistura. Então basta VER a unidade — a quantidade
  // não importa. Um espadachim visto já diz "aqui é defesa".
  //
  // Isso muda o custo do problema: não é preciso explorar nem saber o total de tropa. Quando um
  // ataque mata pelo menos 1/3 dos defensores, o jogo REVELA a composição da defesa, e um fake
  // que morre já entrega o tipo da aldeia.
  //
  // DE ONDE VEM A LISTA. A tela de relatórios tem um filtro DO SERVIDOR:
  //
  //   POST screen=report&mode=attack&action=set_filter_icon
  //   corpo: filter_attack_type[8]=8 · [16]=16 · [32]=32 · filter_icon_operator=AND · h=<csrf>
  //
  // O tipo 1 é "ataque de saque". Excluindo ele sobram só os ataques de verdade. Sem isso não
  // dá: nos 200 relatórios mais recentes desta conta, ZERO eram de jogador — os de bárbara
  // afogam a lista.
  //
  // O valor de cada campo é o PRÓPRIO NÚMERO (`[8]=8`, não `on`) e o operador é `AND` maiúsculo.
  // Descobri isso capturando o formulário; a versão que eu deduzi não pegava e o filtro
  // continuava vazio sem reclamar.
  //
  // O filtro é PREFERÊNCIA DE CONTA: mexe na tela de relatórios do usuário. Guardamos o estado
  // anterior e devolvemos no fim.

  const ALVOS_KEY = KEY + '_alvos';
  const ALVOS_TIPOS = [8, 16, 32];           // pequeno, médio, grande — tudo menos saque (1)
  let _alvCache = null, _alvLendo = false;

  function alvosSalvar() {
    try { localStorage.setItem(ALVOS_KEY, JSON.stringify(_alvCache)); }
    catch (e) { pushLog('Fichas: não consegui guardar as fichas (' + (e.message || e) + ').', 'err', 'fichas'); }
  }
  function alvosCarregar() {
    try {
      const s = localStorage.getItem(ALVOS_KEY);
      if (!s) return;
      const c = JSON.parse(s);
      if (c && c.lista) _alvCache = c;
    } catch (e) { /* leitura velha ilegível: começa vazio */ }
  }

  // ── O filtro do servidor ────────────────────────────────────────────────────
  async function alvosFiltro(tipos) {
    const p = new URLSearchParams();
    tipos.forEach((t) => p.append('filter_attack_type[' + t + ']', String(t)));
    p.append('filter_icon_operator', 'AND');
    p.append('h', CSRF);
    const r = await fetch('/game.php?village=' + CUR_VID + '&screen=report&mode=attack&action=set_filter_icon',
      { method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ao ajustar o filtro de relatórios');
    return new DOMParser().parseFromString(await r.text(), 'text/html');
  }

  // Quais tipos estão marcados AGORA, pra devolver depois. Se eu não devolver, a tela de
  // relatórios do usuário fica filtrada por algo que ele não escolheu.
  function alvosFiltroAtual(doc) {
    const out = [];
    doc.querySelectorAll('input[name^="filter_attack_type"]').forEach((c) => {
      if (c.hasAttribute('checked')) {
        const m = (c.getAttribute('name') || '').match(/\[(\d+)\]/);
        if (m) out.push(parseInt(m[1], 10));
      }
    });
    return out;
  }

  // ── Leitura da defesa revelada ──────────────────────────────────────────────
  // A tabela `#attack_info_def_units` usa TD no cabeçalho, não TH — parecia não ter ícone
  // nenhum quando procurei por `th img`. As unidades saem dos ícones da primeira linha, e os
  // números da segunda, pulando a célula do rótulo ("Quantidade:").
  //
  // Nunca por posição fixa: o conjunto de unidades muda por mundo (aqui vêm 11, com milícia).
  function alvosLerDefesa(doc) {
    const t = doc.querySelector('#attack_info_def_units');
    if (!t) return null;                     // "Nenhuma informação sobre as tropas inimigas"
    const rs = t.querySelectorAll('tr');
    if (rs.length < 2) return null;
    const uni = [];
    rs[0].querySelectorAll('img').forEach((i) => {
      const m = (i.getAttribute('src') || '').match(/unit_([a-z]+)/);
      if (m) uni.push(m[1]);
    });
    if (!uni.length) return null;
    const tds = Array.prototype.slice.call(rs[1].querySelectorAll('td')).slice(1);
    if (tds.length < uni.length) return null;
    const tropa = {};
    for (let i = 0; i < uni.length; i++) {
      const n = parseInt((tds[i].textContent || '').replace(/\D/g, ''), 10) || 0;
      if (n > 0) tropa[uni[i]] = n;
    }
    return tropa;
  }

  // A REGRA. Bárbaro = aldeia de ataque, espadachim = aldeia de defesa. As duas juntas quase
  // sempre significam apoio de fora parado ali, então vira "misto" em vez de escolher uma.
  // Lanceiro/pesada e leve são pistas FRACAS: entram só quando não há espada nem bárbaro, e o
  // rótulo leva "?" pra não passar por certeza.
  function alvosClassificar(v) {
    const axe = v.axe || 0, sword = v.sword || 0;
    if (axe > 0 && sword > 0) return { tipo: 'misto', certo: true };
    if (axe > 0) return { tipo: 'ataque', certo: true };
    if (sword > 0) return { tipo: 'defesa', certo: true };
    if ((v.spear || 0) > 0 || (v.heavy || 0) > 0) return { tipo: 'defesa', certo: false };
    if ((v.light || 0) > 0 || (v.ram || 0) > 0 || (v.catapult || 0) > 0) return { tipo: 'ataque', certo: false };
    return { tipo: '?', certo: false };
  }

  // ── A varredura ─────────────────────────────────────────────────────────────
  async function alvosVarrer(paginas, aoAndar) {
    if (_alvLendo) throw new Error('já estou lendo os relatórios — espere terminar');
    _alvLendo = true;
    let anterior = null;
    try {
      const doc0 = await alvosFiltro(ALVOS_TIPOS);
      anterior = alvosFiltroAtual(doc0);
      // Se o usuário já usava exatamente este filtro, não há o que devolver depois.
      const alvos = {};
      let lidos = 0, revelados = 0;
      for (let pg = 0; pg < Math.max(1, paginas); pg++) {
        const r = await fetch('/game.php?village=' + CUR_VID + '&screen=report&mode=attack&page=' + pg,
          { credentials: 'include', cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ao listar os relatórios');
        const d = new DOMParser().parseFromString(await r.text(), 'text/html');
        const tab = d.querySelector('#report_list');
        if (!tab) throw new Error('não achei a lista de relatórios — a tela do jogo mudou?');
        const linhas = Array.prototype.slice.call(tab.querySelectorAll('tr'))
          .filter((tr) => tr.querySelector('a[href*="view="]'))
          .filter((tr) => !/Aldeia de b/i.test(tr.innerText));   // bárbara não tem dono pra fichar
        if (!linhas.length) break;                                // acabaram as páginas
        for (const tr of linhas) {
          // Leitura sob demanda, nao laco de fundo: so o bot-check interrompe. `devoParar`
          // abortaria por "outra aba assumiu", o que aqui nao faz sentido.
          if (captchaBlocked()) throw new Error('bot-check na tela — varredura interrompida');
          const a = tr.querySelector('a[href*="view="]');
          const id = new URLSearchParams((a.getAttribute('href') || '').split('?')[1] || '').get('view');
          const txt = (tr.innerText || '').replace(/\s+/g, ' ').trim();
          const m = txt.match(/atacou\s+(.*?)\s*\((\d{2,3})\|(\d{2,3})\)/);
          if (!id || !m) continue;
          const coord = m[2] + '|' + m[3];
          const e = alvos[coord] || (alvos[coord] = { coord: coord, nome: m[1].trim(), visto: {}, quando: 0, n: 0 });
          lidos++;
          if (aoAndar) aoAndar(lidos, coord);
          const dd = new DOMParser().parseFromString(
            await (await fetch('/game.php?village=' + CUR_VID + '&screen=report&view=' + id,
              { credentials: 'include', cache: 'no-store' })).text(), 'text/html');
          const tropa = alvosLerDefesa(dd);
          e.n++;
          if (tropa) {
            revelados++;
            // Guarda o MÁXIMO já visto de cada unidade: relatórios diferentes pegam a aldeia em
            // momentos diferentes, e o que interessa é o que ela chegou a ter.
            Object.keys(tropa).forEach((u) => { e.visto[u] = Math.max(e.visto[u] || 0, tropa[u]); });
            e.quando = Date.now();
          }
          await sleep(180);                  // o 429 desta conta é GLOBAL
        }
      }
      const lista = Object.keys(alvos).map((k) => alvos[k]);
      lista.forEach((v) => { const c = alvosClassificar(v.visto); v.tipo = c.tipo; v.certo = c.certo; });
      const ordem = { ataque: 0, misto: 1, defesa: 2, '?': 3 };
      lista.sort((a, b) => (ordem[a.tipo] - ordem[b.tipo]) || (b.certo - a.certo) || a.coord.localeCompare(b.coord));
      _alvCache = { lista: lista, lidos: lidos, revelados: revelados, at: Date.now() };
      alvosSalvar();
      return _alvCache;
    } finally {
      _alvLendo = false;
      // devolve o filtro do usuário — é a tela DELE
      try { if (anterior) await alvosFiltro(anterior); }
      catch (e) { pushLog('Fichas: não consegui devolver o filtro da tela de relatórios ('
        + (e.message || e) + '). Confira em Relatórios → Filtros.', 'err', 'fichas'); }
    }
  }

  // ── Tela ────────────────────────────────────────────────────────────────────
  function alvosRender() {
    const box = document.getElementById('twmgr-fichas-corpo');
    if (!box) return;
    if (!_alvCache || !_alvCache.lista.length) {
      box.innerHTML = '<div style="padding:14px;text-align:center;color:#8a7340">'
        + (_alvCache ? 'Nenhum ataque seu a aldeia de jogador nos relatórios lidos.'
                     : 'Clique em <b>↻ Ler relatórios</b> pra montar as fichas.') + '</div>';
      return;
    }
    const L = _alvCache.lista;
    const cont = { ataque: 0, defesa: 0, misto: 0, '?': 0 };
    L.forEach((v) => { cont[v.tipo] = (cont[v.tipo] || 0) + 1; });
    const topo = '<div class="twmgr-ap-topo">'
      + '<div><div class="twmgr-ap-big" style="color:#b03030">' + (cont.ataque || 0) + '</div>'
        + '<div class="twmgr-ap-lbl">ataque</div></div>'
      + '<div><div class="twmgr-ap-big" style="color:#2e6b8a">' + (cont.defesa || 0) + '</div>'
        + '<div class="twmgr-ap-lbl">defesa</div></div>'
      + '<div><div class="twmgr-ap-big">' + (cont.misto || 0) + '</div>'
        + '<div class="twmgr-ap-lbl">misto</div></div>'
      + '<div><div class="twmgr-ap-big" style="color:#8a7d6d">' + (cont['?'] || 0) + '</div>'
        + '<div class="twmgr-ap-lbl">sem pista</div></div>'
      + '<div style="flex:1"></div>'
      + '<div style="text-align:right"><div class="twmgr-ap-lbl">' + _alvCache.revelados + ' de '
        + _alvCache.lidos + ' revelaram</div>'
        + '<div style="font-size:10px;color:#6f6153">' + new Date(_alvCache.at).toLocaleString('pt-BR',
            { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</div></div>'
      + '</div>';

    const cor = { ataque: '#b03030', defesa: '#2e6b8a', misto: '#8b5426', '?': '#8a7d6d' };
    box.innerHTML = topo + L.map((v) => {
      const us = Object.keys(v.visto);
      return '<div class="twmgr-ap-cartao"><div class="twmgr-alv-linha">'
        + '<span class="twmgr-alv-tag" style="background:' + cor[v.tipo] + '">'
          + esc(v.tipo.toUpperCase()) + (v.certo ? '' : '?') + '</span>'
        + '<span class="twmgr-ap-nome"><b>' + esc(v.nome || v.coord) + '</b>'
          + '<span class="twmgr-ap-coord">' + esc(v.coord) + '</span>'
          + '<div class="twmgr-ap-dono">' + (us.length
              ? esc(us.map((u) => fmtN(v.visto[u]) + ' ' + unitPt(u)).join(' · '))
              : '<i>nada revelado em ' + v.n + ' relatório(s)</i>') + '</div></span>'
        + '<a class="twmgr-alv-ir" href="/game.php?village=' + CUR_VID + '&screen=map&x='
          + v.coord.split('|')[0] + '&y=' + v.coord.split('|')[1]
          + '" target="_blank" title="abrir no mapa">↗</a>'
        + '</div></div>';
    }).join('');
  }

  async function alvosLer(paginas) {
    const st = document.getElementById('twmgr-fichas-status');
    const diz = (t) => { if (st) st.textContent = t; };
    try {
      diz('ligando o filtro de relatórios…');
      await alvosVarrer(paginas, (n, coord) => diz('lendo relatório ' + n + ' — ' + coord));
      diz('');
      alvosRender();
      pushLog('Fichas: ' + _alvCache.lista.length + ' aldeia(s) fichada(s), '
        + _alvCache.revelados + ' de ' + _alvCache.lidos + ' relatório(s) revelaram a defesa.', 'ok', 'fichas');
    } catch (e) {
      diz('');
      pushLog('Fichas: ' + (e.message || e), 'err', 'fichas');
      const box = document.getElementById('twmgr-fichas-corpo');
      if (box) box.innerHTML = '<div style="padding:14px;color:#b03030">' + esc(e.message || String(e)) + '</div>';
    }
  }

  function bindAlvosHandlers() {
    alvosCarregar();
    alvosRender();
    const b = document.getElementById('twmgr-fichas-ler');
    if (b) b.addEventListener('click', () => {
      const n = parseInt((document.getElementById('twmgr-fichas-pags') || {}).value, 10) || 2;
      alvosLer(Math.max(1, Math.min(10, n)));
    });
  }
