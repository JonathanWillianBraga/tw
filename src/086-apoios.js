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
      lista.sort((a, b) => apoiosSoma(b.total) - apoiosSoma(a.total));
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
    // Delega pro unitIcon() do core: ele conhece o formato real do IMG_BASE (que já vem
    // com o /asset/<hash>/ e ainda espera um "graphic/" na frente) e cai pro texto quando
    // não achou a base. Montar a URL aqui de novo foi como o ícone quebrou da primeira vez.
    return unitIcon(u, esc(unitPt(u)));
  }
  // Só as unidades que existem NAQUELE apoio. Mostrar dez zeros por linha afoga o que importa —
  // e o conjunto de unidades muda por mundo, então uma grade fixa desperdiçaria coluna.
  function apoiosLinhaTropas(tropas, unidades) {
    const ks = unidades.filter((u) => (tropas[u] || 0) > 0);
    if (!ks.length) return '<span style="color:#8a7340">—</span>';
    return '<span class="twmgr-ap-tropas">'
      + ks.map((u) => '<span class="twmgr-ap-t">' + apoiosIcone(u) + '<b>' + fmtN(tropas[u]) + '</b></span>').join('')
      + '</span>';
  }
  function apoiosSoma(t) { return Object.keys(t).reduce((a, u) => a + t[u], 0); }

  // ── Retirar apoio ───────────────────────────────────────────────────────────
  // O QUE O JOGO OFERECE, conferido na tela ao vivo (não deduzido):
  //
  //   POST /game.php?village=<origem>&screen=place&action=withdraw_selected_unit_counts
  //        &mode=units&h=<csrf>
  //   corpo: from-table=other · checkbox_<unidade>=on (quais TIPOS voltam)
  //                            · id_<awayId>=on       (quais APOIOS)
  //
  // A seleção é por TIPO DE UNIDADE, não por quantidade: marcar "lança" devolve TODAS as
  // lanças daquele apoio. Procurei campo de quantidade na `#units_away` e na info_village do
  // destino e não existe — o `data-unit-count` da célula não vira input. A granularidade fina
  // sai de escolher QUAIS apoios, já que cada um tem composição própria.
  //
  // Um POST por aldeia de ORIGEM: os awayId pertencem à praça dela.
  const _apSelLinha = {};                      // awayId -> marcado?
  const _apSelUnid = {};                       // coord destino -> {unidade: marcada?}

  function apoiosUnidSel(coord, unidades) {
    // Sem escolha explícita, volta tudo — é o que "mandar voltar" quer dizer.
    const m = _apSelUnid[coord];
    if (!m) return unidades.slice();
    const ks = unidades.filter((u) => m[u]);
    return ks.length ? ks : [];
  }

  async function apoiosRetirarDe(vid, awayIds, unids) {
    const p = new URLSearchParams();
    p.set('from-table', 'other');
    unids.forEach((u) => p.set('checkbox_' + u, 'on'));
    awayIds.forEach((id) => p.set('id_' + id, 'on'));
    const r = await fetch('/game.php?village=' + vid
      + '&screen=place&action=withdraw_selected_unit_counts&mode=units&h=' + CSRF,
      { method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ao pedir a retirada em ' + vid);

    // CONFIRMAÇÃO POR EFEITO. O TW responde 200 com página de erro, então `r.ok` não prova
    // nada — foi exatamente assim que o Desviar reportou sucesso com o exército parado.
    // Relê a praça e exige que cada unidade pedida esteja zerada naquele apoio.
    await sleep(700);
    const depois = await apoiosDetalhe(vid);
    const porId = {};
    depois.forEach((it) => { if (it.awayId) porId[it.awayId] = it.tropas; });
    const teimosos = [];
    awayIds.forEach((id) => {
      const t = porId[id];
      if (!t) return;                          // apoio sumiu da lista: voltou inteiro
      unids.forEach((u) => { if ((t[u] || 0) > 0) teimosos.push(id + '/' + u); });
    });
    if (teimosos.length) {
      throw new Error('a praça de ' + vid + ' ainda mostra ' + teimosos.length
        + ' item(ns) parado(s) depois do pedido — a retirada NÃO foi aceita');
    }
    return awayIds.length;
  }

  async function apoiosRetirarSelecao(coord) {
    const d = _apCache && _apCache.lista.filter((x) => x.coord === coord)[0];
    if (!d) throw new Error('destino ' + coord + ' não está na leitura atual');
    const unids = apoiosUnidSel(coord, Object.keys(d.total));
    if (!unids.length) throw new Error('nenhuma unidade marcada — nada a retirar');
    // Agrupa por aldeia de origem: um POST por praça.
    const porOrigem = {};
    d.origens.forEach((o) => {
      if (!_apSelLinha[o.awayId]) return;
      if (!o.awayId) throw new Error('não li o id do apoio vindo de ' + (o.nome || o.coord)
        + ' — sem ele eu não sei o que estou mandando voltar');
      (porOrigem[o.vid] || (porOrigem[o.vid] = [])).push(o.awayId);
    });
    const vids = Object.keys(porOrigem);
    if (!vids.length) throw new Error('nenhum apoio marcado');
    let ok = 0;
    for (const vid of vids) {
      await apoiosRetirarDe(vid, porOrigem[vid], unids);
      ok += porOrigem[vid].length;
      porOrigem[vid].forEach((id) => { delete _apSelLinha[id]; });
      await sleep(200);
    }
    pushLog('Apoios: mandei voltar ' + ok + ' apoio(s) de ' + coord
      + ' (' + unids.map(unitPt).join(', ') + ') — confirmado relendo a praça.', 'ok', 'apoios');
    return ok;
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
    // A barra lateral tem a largura proporcional ao volume. É o único jeito de bater o olho
    // numa lista de 20 destinos e ver onde está a tropa — a leitura dos números vem depois.
    const maior = lista.reduce((m, d) => Math.max(m, apoiosSoma(d.total)), 0) || 1;
    const totalGeral = lista.reduce((a, d) => a + apoiosSoma(d.total), 0);
    const nOrigens = {};
    lista.forEach((d) => d.origens.forEach((o) => { nOrigens[o.vid] = 1; }));

    const topo = '<div class="twmgr-ap-topo">'
      + '<div><div class="twmgr-ap-big">' + lista.length + '</div>'
        + '<div class="twmgr-ap-lbl">aldeias apoiadas</div></div>'
      + '<div><div class="twmgr-ap-big">' + fmtN(totalGeral) + '</div>'
        + '<div class="twmgr-ap-lbl">tropas fora</div></div>'
      + '<div><div class="twmgr-ap-big">' + Object.keys(nOrigens).length + '</div>'
        + '<div class="twmgr-ap-lbl">origens</div></div>'
      + '<div style="flex:1"></div>'
      + '<div style="text-align:right"><div class="twmgr-ap-lbl">lido às</div>'
        + '<div style="font-size:10px;color:#6f6153">' + new Date(_apCache.at).toLocaleTimeString('pt-BR') + '</div></div>'
      + '</div>';

    box.innerHTML = topo + lista.map((d) => {
      const aberto = !!_apAberto[d.coord];
      const pct = Math.max(8, Math.round(apoiosSoma(d.total) / maior * 100));
      const cab = '<div class="twmgr-ap-dest" data-coord="' + esc(d.coord) + '">'
        + '<span class="twmgr-ap-barra" style="height:' + pct + '%;top:auto;bottom:0"></span>'
        + '<span class="twmgr-ap-seta">' + (aberto ? '▼' : '▶') + '</span>'
        + '<span class="twmgr-ap-nome"><b>' + esc(d.nome || d.coord) + '</b>'
        + '<span class="twmgr-ap-coord">' + esc(d.coord) + '</span>'
        + '<div class="twmgr-ap-dono">' + (d.dono ? esc(d.dono) : '<i>bárbara</i>')
        + ' · ' + d.origens.length + (d.origens.length > 1 ? ' origens' : ' origem') + '</div>'
        + '</span>'
        + apoiosLinhaTropas(d.total, unidades)
        + '</div>';
      if (!aberto) return '<div class="twmgr-ap-cartao">' + cab + '</div>';
      const filhos = d.origens.map((o) =>
        '<div class="twmgr-ap-orig">'
        + '<span><input type="checkbox" class="twmgr-ap-cb" data-away="' + esc(o.awayId || '')
        + '" data-coord="' + esc(d.coord) + '"' + (_apSelLinha[o.awayId] ? ' checked' : '')
        + (o.awayId ? '' : ' disabled title="não li o id deste apoio"') + '> '
        + esc(o.nome || o.coord)
        + '<span class="twmgr-ap-coord">' + esc(o.coord) + '</span>'
        + (o.dist ? '<span class="twmgr-ap-dist">' + esc(o.dist) + '</span>' : '') + '</span>'
        + apoiosLinhaTropas(o.tropas, unidades)
        + '</div>').join('');
      // A barra de ação: quais TIPOS voltam (padrão: todos) e o botão. Só aparece expandido,
      // pra não haver botão de mover tropa a um clique de distância numa lista fechada.
      const uDest = Object.keys(d.total);
      const sel = apoiosUnidSel(d.coord, uDest);
      const marcadas = d.origens.filter((o) => _apSelLinha[o.awayId]).length;
      const acoes = '<div class="twmgr-ap-acoes" data-coord="' + esc(d.coord) + '">'
        + '<span class="twmgr-ap-lbl">voltar</span>'
        + uDest.map((u) => '<span class="twmgr-ap-u' + (sel.indexOf(u) >= 0 ? ' on' : '')
            + '" data-coord="' + esc(d.coord) + '" data-unid="' + esc(u) + '" title="'
            + esc(unitPt(u)) + '">' + apoiosIcone(u) + '</span>').join('')
        + '<span style="flex:1"></span>'
        + '<button class="twmgr-ap-todos" data-coord="' + esc(d.coord) + '">'
        + (marcadas === d.origens.length ? 'desmarcar' : 'marcar todas') + '</button>'
        + '<button class="twmgr-ap-go" data-coord="' + esc(d.coord) + '"'
        + (marcadas ? '' : ' disabled') + '>↩ retirar (' + marcadas + ')</button>'
        + '</div>';
      return '<div class="twmgr-ap-cartao on">' + cab + filhos + acoes + '</div>';
    }).join('')
      + (falhas ? '<div style="font-size:9px;color:#b03030;text-align:right;margin-top:5px">'
        + falhas + ' aldeia(s) não puderam ser lidas — os totais estão incompletos</div>' : '');
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
      box.addEventListener('click', async (e) => {
        const t = e.target;
        if (!t.closest) return;

        // 1. marcar/desmarcar um apoio
        const cb = t.closest('.twmgr-ap-cb');
        if (cb) {
          const id = cb.getAttribute('data-away');
          if (id) { if (cb.checked) _apSelLinha[id] = 1; else delete _apSelLinha[id]; }
          apoiosRender();
          return;
        }
        // 2. ligar/desligar um tipo de unidade
        const un = t.closest('.twmgr-ap-u');
        if (un) {
          const c = un.getAttribute('data-coord'), u = un.getAttribute('data-unid');
          const d = _apCache.lista.filter((x) => x.coord === c)[0];
          const m = _apSelUnid[c] || (_apSelUnid[c] = (() => {
            const o = {}; Object.keys(d.total).forEach((k) => { o[k] = 1; }); return o;
          })());
          if (m[u]) delete m[u]; else m[u] = 1;
          apoiosRender();
          return;
        }
        // 3. marcar/desmarcar todas as origens do destino
        const todos = t.closest('.twmgr-ap-todos');
        if (todos) {
          const c = todos.getAttribute('data-coord');
          const d = _apCache.lista.filter((x) => x.coord === c)[0];
          const cheio = d.origens.every((o) => _apSelLinha[o.awayId]);
          d.origens.forEach((o) => {
            if (!o.awayId) return;
            if (cheio) delete _apSelLinha[o.awayId]; else _apSelLinha[o.awayId] = 1;
          });
          apoiosRender();
          return;
        }
        // 4. retirar
        const go = t.closest('.twmgr-ap-go');
        if (go) {
          const c = go.getAttribute('data-coord');
          const d = _apCache.lista.filter((x) => x.coord === c)[0];
          const unids = apoiosUnidSel(c, Object.keys(d.total));
          const n = d.origens.filter((o) => _apSelLinha[o.awayId]).length;
          if (!window.confirm('Mandar voltar ' + n + ' apoio(s) de ' + (d.nome || c) + ' (' + c + ')?\n\n'
              + 'Unidades: ' + (unids.length ? unids.map(unitPt).join(', ') : 'NENHUMA')
              + '\n\nO jogo devolve TODAS as unidades desses tipos nos apoios marcados.')) return;
          go.disabled = true; go.textContent = 'retirando…';
          try {
            await apoiosRetirarSelecao(c);
            await apoiosLer(true);             // relê: os números têm que refletir a retirada
          } catch (err) {
            pushLog('Apoios: ' + (err.message || err), 'err', 'apoios');
            window.alert('Não consegui retirar:\n\n' + (err.message || err));
            apoiosRender();
          }
          return;
        }
        // 5. abrir/fechar o destino
        const alvo = t.closest('.twmgr-ap-dest');
        if (!alvo) return;
        const c = alvo.getAttribute('data-coord');
        _apAberto[c] = !_apAberto[c];
        apoiosRender();
      });
    }
    const b = document.getElementById('twmgr-apoios-ler');
    if (b) b.addEventListener('click', () => apoiosLer(true));
  }
