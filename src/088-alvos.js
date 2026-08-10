  // ==================== FICHAS DE ALVO (aldeia de ATAQUE ou de DEFESA) ====================
  // Regra do usuário, e ela é o coração do módulo: no TW cada aldeia tem vocação. Bárbaro só
  // sai de aldeia OFENSIVA; lanceiro, espadachim e cavalaria pesada só saem de DEFENSIVA.
  // Ninguém mistura. Então basta VER a unidade — a quantidade não importa.
  //
  // Isso muda o custo do problema: não é preciso explorar nem saber o total de tropa. Quando um
  // ataque mata pelo menos 1/3 dos defensores, o jogo REVELA a composição da defesa, e um fake
  // que morreu já entrega o tipo da aldeia.
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
  //
  // ⚠ O ARQUIVO É O PRODUTO, NÃO A VARREDURA. O jogo APAGA relatório com o tempo. Uma ficha
  // nunca é substituída por uma leitura nova: a varredura só ACRESCENTA. Aldeia que sumiu dos
  // relatórios continua fichada com o que já se sabia, e só muda quando um relatório NOVO
  // contar algo diferente.

  const ALVOS_KEY = KEY + '_alvos';
  const ALVOS_TIPOS = [8, 16, 32];           // pequeno, médio, grande — tudo menos saque (1)
  // Vocação por unidade. Explorador, milícia, paladino e nobre NÃO classificam: explorador toda
  // aldeia tem, milícia é convocação temporária de qualquer uma, e paladino/nobre não dizem
  // nada sobre o que ela recruta. Sem esse corte, 526 exploradores decidiriam a ficha.
  const ALVOS_DEF = ['spear', 'sword', 'heavy', 'archer'];
  const ALVOS_ATK = ['axe', 'light', 'marcher', 'ram', 'catapult'];

  let _alvCache = null, _alvLendo = false;

  function alvosSalvar() {
    try { localStorage.setItem(ALVOS_KEY, JSON.stringify(_alvCache)); }
    catch (e) { pushLog('Fichas: não consegui guardar o arquivo (' + (e.message || e) + ').', 'err', 'fichas'); }
  }
  function alvosCarregar() {
    try {
      const s = localStorage.getItem(ALVOS_KEY);
      if (!s) return;
      const c = JSON.parse(s);
      if (!c) return;
      // Formato antigo (v11.144): guardava uma lista e era substituída a cada leitura.
      if (c.lista && !c.aldeias) {
        const m = {};
        c.lista.forEach((v) => { m[v.coord] = v; });
        _alvCache = { aldeias: m, at: c.at || Date.now(), lidos: c.lidos || 0, revelados: c.revelados || 0 };
        return;
      }
      if (c.aldeias) _alvCache = c;
    } catch (e) { /* arquivo ilegível: começa vazio em vez de derrubar a aba */ }
  }
  function alvosBase() {
    if (!_alvCache) _alvCache = { aldeias: {}, at: 0, lidos: 0, revelados: 0 };
    if (!_alvCache.aldeias) _alvCache.aldeias = {};
    return _alvCache;
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

  // ── Leitura do relatório ────────────────────────────────────────────────────
  // A tabela `#attack_info_def_units` usa TD no cabeçalho, não TH — procurar `th img` devolvia
  // zero unidade. As unidades saem dos ícones da primeira linha, e os números da segunda,
  // pulando a célula do rótulo ("Quantidade:"). Nunca por posição fixa: o conjunto muda por
  // mundo (aqui vêm 11, com milícia).
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

  // Dono e id da aldeia saem do mesmo relatório, de graça: "Defensor: X  Destino: Y (a|b)".
  // O id é o que faz o link da lista abrir a FICHA da aldeia em vez do mapa.
  function alvosLerDono(doc) {
    const d = doc.querySelector('#attack_info_def');
    const out = { dono: '', vid: null };
    if (!d) return out;
    // O nome sai do LINK do jogador, nao do texto: `textContent` junta tudo numa linha so
    // (inclusive a tabela de tropas logo abaixo) e um nome com espaco ou acento vira loteria
    // de regex. A frase "Defensor: X Destino:" fica como reserva, pro caso de o link faltar.
    const pl = Array.prototype.slice.call(d.querySelectorAll('a'))
      .filter((x) => /screen=info_player/.test(x.getAttribute('href') || ''))[0];
    if (pl) out.dono = (pl.textContent || '').trim();
    if (!out.dono) {
      const m = (d.textContent || '').replace(/\s+/g, ' ').match(/Defensor:\s*(.+?)\s+Destino:/);
      if (m) out.dono = m[1].trim();
    }
    const a = Array.prototype.slice.call(d.querySelectorAll('a'))
      .map((x) => x.getAttribute('href') || '').filter((h) => /screen=info_village/.test(h))[0];
    const mv = a && a.match(/[?&]id=(\d+)/);
    if (mv) out.vid = mv[1];
    return out;
  }

  // A REGRA. Bárbaro (e o resto da tropa de campo ofensiva) = aldeia de ataque; lanceiro,
  // espadachim e cavalaria pesada = aldeia de defesa. As duas famílias juntas quase sempre
  // significam apoio de fora parado ali, então vira "misto" em vez de escolher uma.
  function alvosClassificar(v) {
    let atk = 0, def = 0;
    ALVOS_ATK.forEach((u) => { atk += v[u] || 0; });
    ALVOS_DEF.forEach((u) => { def += v[u] || 0; });
    if (atk > 0 && def > 0) return 'misto';
    if (atk > 0) return 'ataque';
    if (def > 0) return 'defesa';
    return '?';
  }

  // ── A varredura ─────────────────────────────────────────────────────────────
  async function alvosVarrer(paginas, aoAndar) {
    if (_alvLendo) throw new Error('já estou lendo os relatórios — espere terminar');
    _alvLendo = true;
    let anterior = null;
    const base = alvosBase();
    try {
      const doc0 = await alvosFiltro(ALVOS_TIPOS);
      anterior = alvosFiltroAtual(doc0);
      let lidos = 0, revelados = 0, novas = 0, mudaram = 0;
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
          // Leitura sob demanda, não laço de fundo: só o bot-check interrompe.
          if (captchaBlocked()) throw new Error('bot-check na tela — varredura interrompida');
          const a = tr.querySelector('a[href*="view="]');
          const id = new URLSearchParams((a.getAttribute('href') || '').split('?')[1] || '').get('view');
          const txt = (tr.innerText || '').replace(/\s+/g, ' ').trim();
          const m = txt.match(/atacou\s+(.*?)\s*\((\d{2,3})\|(\d{2,3})\)/);
          if (!id || !m) continue;
          const coord = m[2] + '|' + m[3];
          lidos++;
          if (aoAndar) aoAndar(lidos, coord);
          const dd = new DOMParser().parseFromString(
            await (await fetch('/game.php?village=' + CUR_VID + '&screen=report&view=' + id,
              { credentials: 'include', cache: 'no-store' })).text(), 'text/html');
          const quem = alvosLerDono(dd);
          const tropa = alvosLerDefesa(dd);

          // ACRESCENTA na ficha que já existe — nunca substitui.
          let e = base.aldeias[coord];
          if (!e) { novas++; e = base.aldeias[coord] = { coord: coord, nome: m[1].trim(), dono: '',
                                                        vid: null, visto: {}, quando: 0, n: 0 }; }
          if (m[1].trim()) e.nome = m[1].trim();
          if (quem.dono) e.dono = quem.dono;
          if (quem.vid) e.vid = quem.vid;
          e.n = (e.n || 0) + 1;
          if (tropa) {
            revelados++;
            const antes = e.tipo;
            // Máximo já visto de cada unidade: relatórios diferentes pegam a aldeia em momentos
            // diferentes, e o que interessa é o que ela chegou a ter.
            Object.keys(tropa).forEach((u) => { e.visto[u] = Math.max(e.visto[u] || 0, tropa[u]); });
            e.quando = Date.now();
            e.tipo = alvosClassificar(e.visto);
            if (antes && antes !== '?' && antes !== e.tipo) mudaram++;
          }
          if (!e.tipo) e.tipo = alvosClassificar(e.visto);
          await sleep(180);                  // o 429 desta conta é GLOBAL
        }
      }
      base.at = Date.now(); base.lidos = lidos; base.revelados = revelados;
      alvosSalvar();
      return { lidos: lidos, revelados: revelados, novas: novas, mudaram: mudaram };
    } finally {
      _alvLendo = false;
      // devolve o filtro do usuário — é a tela DELE
      try { if (anterior) await alvosFiltro(anterior); }
      catch (e) { pushLog('Fichas: não consegui devolver o filtro da tela de relatórios ('
        + (e.message || e) + '). Confira em Relatórios → Filtros.', 'err', 'fichas'); }
    }
  }

  // ── Tela: agrupada por JOGADOR ──────────────────────────────────────────────
  const _alvAberto = {};                     // dono -> expandido?
  let _alvFiltro = '';                       // '' = tudo | ataque | defesa | misto | ?
  const ALV_COR = { ataque: '#b03030', defesa: '#2e6b8a', misto: '#8b5426', '?': '#8a7d6d' };

  function alvosPorJogador() {
    const base = alvosBase();
    const p = {};
    Object.keys(base.aldeias).forEach((c) => {
      const v = base.aldeias[c];
      // O filtro esconde a ALDEIA; jogador que ficou sem nenhuma some junto, senao a lista
      // enche de cabecalho vazio.
      if (_alvFiltro && (v.tipo || '?') !== _alvFiltro) return;
      const k = v.dono || '(dono desconhecido)';
      const g = p[k] || (p[k] = { dono: k, aldeias: [], cont: { ataque: 0, defesa: 0, misto: 0, '?': 0 } });
      g.aldeias.push(v);
      g.cont[v.tipo || '?']++;
    });
    const lista = Object.keys(p).map((k) => p[k]);
    // Quem tem mais aldeia de ataque primeiro: é de quem você precisa se defender, e é onde
    // estão os alvos que valem nuke.
    lista.sort((a, b) => (b.cont.ataque - a.cont.ataque) || (b.aldeias.length - a.aldeias.length));
    lista.forEach((g) => g.aldeias.sort((x, y) => x.coord.localeCompare(y.coord)));
    return lista;
  }

  // O link abre a FICHA da aldeia (pedido do usuário: melhor que o mapa). Só dá pra montar com
  // o id que veio do relatório; sem ele, cai no mapa pela coordenada em vez de dar link morto.
  function alvosLink(v) {
    const xy = v.coord.split('|');
    // A ancora `#x;y` e o que faz o jogo centralizar o mapa embutido na aldeia certa.
    if (v.vid) return '/game.php?village=' + CUR_VID + '&screen=info_village&id=' + v.vid
      + '#' + xy[0] + ';' + xy[1];
    return '/game.php?village=' + CUR_VID + '&screen=map&x=' + xy[0] + '&y=' + xy[1];
  }

  function alvosRender() {
    const box = document.getElementById('twmgr-fichas-corpo');
    if (!box) return;
    const base = alvosBase();
    const total = Object.keys(base.aldeias).length;
    if (!total) {
      box.innerHTML = '<div style="padding:14px;text-align:center;color:#8a7340">'
        + 'Clique em <b>↻ Ler relatórios</b> pra montar as fichas.</div>';
      return;
    }
    const geral = { ataque: 0, defesa: 0, misto: 0, '?': 0 };
    Object.keys(base.aldeias).forEach((c) => { geral[base.aldeias[c].tipo || '?']++; });
    const grupos = alvosPorJogador();

    const topo = '<div class="twmgr-ap-topo">'
      + '<div><div class="twmgr-ap-big" style="color:#b03030">' + geral.ataque + '</div>'
        + '<div class="twmgr-ap-lbl">ataque</div></div>'
      + '<div><div class="twmgr-ap-big" style="color:#2e6b8a">' + geral.defesa + '</div>'
        + '<div class="twmgr-ap-lbl">defesa</div></div>'
      + '<div><div class="twmgr-ap-big">' + geral.misto + '</div>'
        + '<div class="twmgr-ap-lbl">misto</div></div>'
      + '<div><div class="twmgr-ap-big" style="color:#8a7d6d">' + geral['?'] + '</div>'
        + '<div class="twmgr-ap-lbl">sem pista</div></div>'
      + '<div style="flex:1"></div>'
      + '<div style="text-align:right"><div class="twmgr-ap-lbl">' + grupos.length + ' jogador(es) · '
        + total + ' aldeia(s)</div>'
        + '<div style="font-size:10px;color:#6f6153">' + (base.at
            ? new Date(base.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit',
                                                          hour: '2-digit', minute: '2-digit' })
            : '—') + '</div></div>'
      + '</div>';

    const bt = (id, rot, cor) => '<span class="twmgr-alv-f" data-f="' + id + '"'
      + (_alvFiltro === id ? ' style="background:' + (cor || '#a2643a') + ';color:#fff;border-color:transparent"' : '')
      + '>' + rot + '</span>';
    const filtros = '<div class="twmgr-alv-filtros">' + bt('', 'todos') + bt('ataque', 'ataque', ALV_COR.ataque)
      + bt('defesa', 'defesa', ALV_COR.defesa) + bt('misto', 'misto', ALV_COR.misto)
      + bt('?', 'sem pista', ALV_COR['?']) + '</div>';

    if (!grupos.length) {
      box.innerHTML = topo + filtros + '<div style="padding:12px;text-align:center;color:#8a7340">'
        + 'Nenhuma aldeia nesse filtro.</div>';
      return;
    }
    box.innerHTML = topo + filtros + grupos.map((g) => {
      const aberto = !!_alvAberto[g.dono];
      const barras = ['ataque', 'defesa', 'misto', '?'].filter((t) => g.cont[t] > 0)
        .map((t) => '<span class="twmgr-alv-tag" style="background:' + ALV_COR[t] + '">'
          + g.cont[t] + ' ' + esc(t === '?' ? '—' : t) + '</span>').join(' ');
      const cab = '<div class="twmgr-alv-jog" data-dono="' + esc(g.dono) + '">'
        + '<span class="twmgr-ap-seta">' + (aberto ? '▼' : '▶') + '</span>'
        + '<span class="twmgr-ap-nome"><b>' + esc(g.dono) + '</b>'
        + '<div class="twmgr-ap-dono">' + g.aldeias.length + ' aldeia'
          + (g.aldeias.length > 1 ? 's' : '') + ' fichada' + (g.aldeias.length > 1 ? 's' : '') + '</div></span>'
        + '<span style="display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end">' + barras + '</span>'
        + '</div>';
      if (!aberto) return '<div class="twmgr-ap-cartao">' + cab + '</div>';
      const filhos = g.aldeias.map((v) => {
        const us = Object.keys(v.visto);
        return '<div class="twmgr-alv-linha">'
          + '<span class="twmgr-alv-tag" style="background:' + ALV_COR[v.tipo || '?'] + '">'
            + esc((v.tipo === '?' || !v.tipo) ? '—' : v.tipo.toUpperCase()) + '</span>'
          + '<span class="twmgr-ap-nome">' + esc(v.nome || v.coord)
            + '<span class="twmgr-ap-coord">' + esc(v.coord) + '</span>'
            + '<div class="twmgr-ap-dono">' + (us.length
                ? esc(us.map((u) => fmtN(v.visto[u]) + ' ' + unitPt(u)).join(' · '))
                : '<i>nada revelado em ' + v.n + ' relatório(s)</i>') + '</div></span>'
          + '<a class="twmgr-alv-ir" href="' + alvosLink(v)
            + '" target="_blank" title="abrir a ficha da aldeia">↗</a>'
          + '</div>';
      }).join('');
      return '<div class="twmgr-ap-cartao on">' + cab + filhos + '</div>';
    }).join('');
  }

  async function alvosLer(paginas) {
    const st = document.getElementById('twmgr-fichas-status');
    const diz = (t) => { if (st) st.textContent = t; };
    try {
      diz('ligando o filtro de relatórios…');
      const r = await alvosVarrer(paginas, (n, coord) => diz('lendo relatório ' + n + ' — ' + coord));
      diz('');
      alvosRender();
      pushLog('Fichas: ' + r.lidos + ' relatório(s) lidos, ' + r.revelados + ' revelaram a defesa · '
        + r.novas + ' aldeia(s) nova(s), ' + r.mudaram + ' mudaram de classificação. '
        + 'O arquivo tem ' + Object.keys(alvosBase().aldeias).length + ' aldeia(s).', 'ok', 'fichas');
    } catch (e) {
      diz('');
      pushLog('Fichas: ' + (e.message || e), 'err', 'fichas');
      alvosRender();                          // o que já entrou no arquivo continua na tela
    }
  }

  function bindAlvosHandlers() {
    alvosCarregar();
    alvosRender();
    const box = document.getElementById('twmgr-fichas-corpo');
    if (box) {
      box.addEventListener('click', (e) => {
        const f = e.target.closest && e.target.closest('.twmgr-alv-f');
        if (f) { _alvFiltro = f.getAttribute('data-f') || ''; alvosRender(); return; }
        const j = e.target.closest && e.target.closest('.twmgr-alv-jog');
        if (!j) return;
        const d = j.getAttribute('data-dono');
        _alvAberto[d] = !_alvAberto[d];
        alvosRender();
      });
    }
    const b = document.getElementById('twmgr-fichas-ler');
    if (b) b.addEventListener('click', () => {
      const n = parseInt((document.getElementById('twmgr-fichas-pags') || {}).value, 10) || 2;
      alvosLer(Math.max(1, Math.min(10, n)));
    });
  }
