  // ==================== APOIOS ENVIADOS (visão por DESTINO) ====================
  // O jogo só mostra tropa fora agrupada por ORIGEM: "a aldeia 001 tem 1999 lanças fora".
  // Nunca "a aldeia X está recebendo 1999 lanças, vindas de 001, 015 e 027". A inversão é
  // nossa, e é o valor da tela.
  //
  // TRÊS PASSOS
  //   1. overview_villages&mode=units&type=away  → minhas aldeias com tropa fora
  //   2. por aldeia: place&mode=units → #units_away → destino, distância e unidades
  //   3. inverter: agrupar por destino
  //
  // O passo 2 custa uma requisição POR ALDEIA (44 na conta do usuário). Por isso: só lê quem o
  // passo 1 disse ter tropa fora, espaça as leituras, e cacheia. É tela que o usuário ABRE —
  // não roda em laço de fundo.
  //
  // GENÉRICO ENTRE MUNDOS, e isso não é detalhe: o br143 tem 10 unidades (sem arqueiros) e o
  // br141 tem 12. Com a lista fixa a soma sai deslocada de uma coluna — números plausíveis e
  // errados, que é o pior tipo de defeito. As unidades saem do CABEÇALHO, e a contagem é
  // conferida contra a linha; se divergir, lança em vez de somar.

  const APOIOS_TTL_MS = 5 * 60000;      // cache curto: tropa se move, mas não a cada segundo
  let _apCache = null, _apCacheAt = 0, _apLendo = false;

  // As unidades desta tabela, na ordem das colunas. Vem do `<th><img src="...unit_XXX...">`.
  function apoiosUnidadesDe(tabela) {
    const us = [];
    tabela.querySelectorAll('th img').forEach((img) => {
      const m = (img.getAttribute('src') || '').match(/unit_([a-z]+)/);
      if (m && us.indexOf(m[1]) < 0) us.push(m[1]);
    });
    return us;
  }

  // Passo 1: quem tem tropa fora. Devolve [{vid, nome, coord}].
  //
  // Só quem TEM: ler as 44 que têm em vez das 221 que existem é o que torna a tela viável.
  async function apoiosOrigens() {
    const r = await fetch('/game.php?village=' + CUR_VID
      + '&screen=overview_villages&mode=units&type=away&page=-1', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ao listar as aldeias com tropa fora');
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const tab = doc.querySelector('#units_table');
    if (!tab) throw new Error('não achei a tabela de tropas — a tela do jogo mudou?');
    const out = [];
    tab.querySelectorAll('tr').forEach((tr) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 5) return;
      // A última célula é o link "Tropas"; as do meio são os números.
      let algum = false;
      for (let i = 2; i < tds.length - 1; i++) {
        if ((parseInt((tds[i].textContent || '').replace(/\D/g, ''), 10) || 0) > 0) { algum = true; break; }
      }
      if (!algum) return;
      const link = Array.prototype.slice.call(tr.querySelectorAll('a'))
        .map((a) => a.getAttribute('href') || '')
        .filter((h) => /place&mode=units/.test(h))[0];
      const mv = link && link.match(/village=(\d+)/);
      if (!mv) return;
      const txt = (tds[0].textContent || '').replace(/\s+/g, ' ').trim();
      const mc = txt.match(/(\d{2,3})\|(\d{2,3})/);
      out.push({ vid: mv[1], nome: txt.replace(/\s*\(\d{2,3}\|\d{2,3}\).*$/, '').trim(),
                 coord: mc ? (mc[1] + '|' + mc[2]) : '' });
    });
    return out;
  }

  // O destino vem como "050 MALUQUINHO (-=MeNiNo MaLuQuInHo=-) (731|590) K57" — nome, dono e
  // coordenada juntos.
  //
  // Casa DO FIM PRA FRENTE: o nome do dono pode conter parênteses (o exemplo acima tem), então
  // procurar o primeiro `(` pegaria pedaço do nome. A coordenada é o último par entre
  // parênteses, e o dono é o parêntese imediatamente anterior a ela.
  function apoiosParseDestino(txt) {
    const t = (txt || '').replace(/\s+/g, ' ').trim();
    const mc = t.match(/\((\d{2,3})\|(\d{2,3})\)(?!.*\(\d{2,3}\|\d{2,3}\))/);
    if (!mc) return null;
    const coord = mc[1] + '|' + mc[2];
    const antes = t.slice(0, mc.index).trim();
    const md = antes.match(/\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/);
    const dono = md ? md[1].trim() : '';
    const nome = (md ? antes.slice(0, md.index) : antes).trim();
    return { coord: coord, dono: dono, nome: nome };
  }

  // Passo 2: onde está a tropa desta aldeia. Devolve [{coord, dono, nome, dist, awayId, tropas}].
  async function apoiosDetalhe(vid) {
    const r = await fetch('/game.php?village=' + vid + '&screen=place&mode=units',
      { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' na praça de ' + vid);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const tab = doc.querySelector('#units_away');
    if (!tab) return [];                       // aldeia sem tropa fora: não é erro
    const unidades = apoiosUnidadesDe(tab);
    if (!unidades.length) throw new Error('não consegui ler as unidades do cabeçalho em ' + vid);
    const out = [];
    tab.querySelectorAll('tr').forEach((tr) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < unidades.length + 2) return;
      const alvo = apoiosParseDestino(tds[0].textContent);
      if (!alvo) return;
      // As unidades ocupam as colunas 2..(2+n). Se a contagem não fechar, algo mudou na tela e
      // somar mesmo assim daria número deslocado — errado sem parecer errado.
      const tropas = {};
      let total = 0;
      for (let i = 0; i < unidades.length; i++) {
        const cel = tds[2 + i];
        if (!cel) throw new Error('a tabela de ' + vid + ' tem menos colunas que o cabeçalho');
        const n = parseInt((cel.textContent || '').replace(/\D/g, ''), 10) || 0;
        if (n > 0) { tropas[unidades[i]] = n; total += n; }
      }
      if (!total) return;
      const cb = tr.querySelector('input.troop-request-selector[data-away-id], input[data-away-id]');
      out.push({ coord: alvo.coord, dono: alvo.dono, nome: alvo.nome,
                 dist: (tds[1].textContent || '').trim(),
                 awayId: cb ? cb.getAttribute('data-away-id') : null,
                 tropas: tropas });
    });
    return out;
  }

  // Passo 3: inverter. De "origem → destinos" para "destino → origens".
  async function apoiosMontar(forcar, aoAndar) {
    if (!forcar && _apCache && (Date.now() - _apCacheAt) < APOIOS_TTL_MS) return _apCache;
    if (_apLendo) throw new Error('já estou lendo os apoios — espere terminar');
    _apLendo = true;
    try {
      const origens = await apoiosOrigens();
      const porDestino = {};
      const unidades = {};
      let lidas = 0, falhas = 0;
      for (const o of origens) {
        if (aoAndar) aoAndar(++lidas, origens.length, o.nome);
        let itens = [];
        try { itens = await apoiosDetalhe(o.vid); }
        catch (e) { falhas++; pushLog('Apoios: não li ' + (o.nome || o.vid) + ' (' + (e.message || e) + ').', 'err', 'apoios'); }
        itens.forEach((it) => {
          const d = porDestino[it.coord] || (porDestino[it.coord] = {
            coord: it.coord, dono: it.dono, nome: it.nome, total: {}, origens: [] });
          d.origens.push({ vid: o.vid, nome: o.nome, coord: o.coord,
                           dist: it.dist, awayId: it.awayId, tropas: it.tropas });
          Object.keys(it.tropas).forEach((u) => {
            d.total[u] = (d.total[u] || 0) + it.tropas[u];
            unidades[u] = 1;
          });
        });
        await sleep(200);                      // o 429 desta conta é GLOBAL; não vale correr
      }
      const lista = Object.keys(porDestino).map((k) => porDestino[k]);
      // Ordena pelo volume: a aldeia com mais tropa é a que interessa primeiro.
      const soma = (t) => Object.keys(t).reduce((a, u) => a + t[u], 0);
      lista.sort((a, b) => soma(b.total) - soma(a.total));
      _apCache = { lista: lista, unidades: Object.keys(unidades), origens: origens.length,
                   falhas: falhas, at: Date.now() };
      _apCacheAt = Date.now();
      return _apCache;
    } finally { _apLendo = false; }
  }

  // ── Tela ────────────────────────────────────────────────────────────────────
  const _apAberto = {};                        // coord -> expandido?

  function apoiosIcone(u) {
    // Reusa o ícone do jogo. Sem depender de mapa de emoji por unidade, que quebraria em
    // mundo com unidade diferente — exatamente o que esta tela evita.
    return '<img src="' + (IMG_BASE || '/graphic/') + 'unit/unit_' + u + '.png" alt="' + esc(u)
      + '" title="' + esc(unitPt(u)) + '" style="width:15px;height:15px;vertical-align:-3px">';
  }
  function apoiosLinhaTropas(tropas, unidades) {
    const ks = unidades.filter((u) => (tropas[u] || 0) > 0);
    if (!ks.length) return '<span style="color:#8a7340">—</span>';
    return ks.map((u) => apoiosIcone(u) + ' <b>' + fmtN(tropas[u]) + '</b>').join('&nbsp; ');
  }

  function apoiosRender() {
    const box = document.getElementById('twmgr-apoios-corpo');
    if (!box) return;
    if (!_apCache) {
      box.innerHTML = '<div style="padding:14px;text-align:center;color:#8a7340">'
        + 'Clique em <b>↻ Ler apoios</b> pra montar a lista.</div>';
      return;
    }
    const { lista, unidades, origens, falhas } = _apCache;
    if (!lista.length) {
      box.innerHTML = '<div style="padding:14px;text-align:center;color:#8a7340">'
        + 'Nenhum apoio seu parado fora de casa.</div>';
      return;
    }
    box.innerHTML = lista.map((d) => {
      const aberto = !!_apAberto[d.coord];
      const cab = '<div class="twmgr-ap-dest" data-coord="' + esc(d.coord) + '">'
        + '<span class="twmgr-ap-seta">' + (aberto ? '▾' : '▸') + '</span>'
        + '<span class="twmgr-ap-nome"><b>' + esc(d.nome || d.coord) + '</b> '
        + '<span style="color:#6f6153">' + esc(d.coord) + '</span>'
        + (d.dono ? '<div class="sub">' + esc(d.dono) + '</div>' : '')
        + '</span>'
        + '<span class="twmgr-ap-tropas">' + apoiosLinhaTropas(d.total, unidades) + '</span>'
        + '<span class="twmgr-ap-qtd">' + d.origens.length + ' aldeia' + (d.origens.length > 1 ? 's' : '') + '</span>'
        + '</div>';
      if (!aberto) return cab;
      const filhos = d.origens.map((o) =>
        '<div class="twmgr-ap-orig">'
        + '<span class="twmgr-ap-nome">de <b>' + esc(o.nome || o.coord) + '</b> '
        + '<span style="color:#6f6153">' + esc(o.coord) + '</span></span>'
        + '<span class="twmgr-ap-tropas">' + apoiosLinhaTropas(o.tropas, unidades) + '</span>'
        + '<span class="twmgr-ap-qtd">' + esc(o.dist || '') + '</span>'
        + '</div>').join('');
      return cab + filhos;
    }).join('')
      + '<div style="font-size:9px;color:#8a7d6d;text-align:right;margin-top:6px">'
      + lista.length + ' aldeia(s) apoiada(s) · ' + origens + ' origem(ns) lida(s)'
      + (falhas ? ' · <b style="color:#b03030">' + falhas + ' falha(s) de leitura</b>' : '')
      + ' · ' + new Date(_apCache.at).toLocaleTimeString('pt-BR') + '</div>';
  }

  async function apoiosLer(forcar) {
    const st = document.getElementById('twmgr-apoios-status');
    const diz = (t) => { if (st) st.textContent = t; };
    try {
      diz('lendo as aldeias com tropa fora…');
      await apoiosMontar(forcar, (i, n, nome) => diz('lendo ' + i + '/' + n + ' — ' + nome));
      diz('');
      apoiosRender();
    } catch (e) {
      diz('');
      pushLog('Apoios: ' + (e.message || e), 'err', 'apoios');
      const box = document.getElementById('twmgr-apoios-corpo');
      if (box) box.innerHTML = '<div style="padding:14px;color:#b03030">' + esc(e.message || String(e)) + '</div>';
    }
  }

  function bindApoiosHandlers() {
    const box = document.getElementById('twmgr-apoios-corpo');
    if (box) {
      box.addEventListener('click', (e) => {
        const alvo = e.target.closest ? e.target.closest('.twmgr-ap-dest') : null;
        if (!alvo) return;
        const c = alvo.getAttribute('data-coord');
        _apAberto[c] = !_apAberto[c];
        apoiosRender();
      });
    }
    const b = document.getElementById('twmgr-apoios-ler');
    if (b) b.addEventListener('click', () => apoiosLer(true));
  }
