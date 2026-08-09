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

  // A leitura CUSTA 44 requisições numa conta que bate 429 global, então ela não expira sozinha
  // e não se perde num F5: fica gravada, e só é refeita quando o usuário pede ou depois de uma
  // retirada. Vive numa chave PRÓPRIA, fora do config — o `save()` reescreve o config o tempo
  // todo, e carregar dezenas de KB de apoio junto seria desperdício em cada ciclo de módulo.
  const APOIOS_KEY = KEY + '_apoios';
  let _apCache = null, _apLendo = false;

  function apoiosSalvar() {
    try { localStorage.setItem(APOIOS_KEY, JSON.stringify(_apCache)); }
    catch (e) { pushLog('Apoios: não consegui guardar a leitura (' + (e.message || e) + ').', 'err', 'apoios'); }
  }
  function apoiosCarregar() {
    try {
      const s = localStorage.getItem(APOIOS_KEY);
      if (!s) return;
      const c = JSON.parse(s);
      if (c && c.lista && c.unidades) _apCache = c;
    } catch (e) { /* leitura velha ilegível: só começa vazio */ }
  }

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
    // Quais colunas estão marcadas. Parece enfeite de interface e NÃO É: é preferência de conta
    // guardada no servidor, e é ela que libera a retirada (ver apoiosPatchColunas). Guardo o
    // estado atual pra devolver depois de mexer.
    const marcadas = [];
    tab.querySelectorAll('input[name^="checkbox_"]').forEach((c) => {
      if (c.hasAttribute('checked')) marcadas.push(c.getAttribute('name').slice(9));
    });
    _apPref[vid] = marcadas;
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
      // O id do DESTINO, do link da primeira célula: é a chave da retirada em bloco.
      const lk = Array.prototype.slice.call(tr.querySelectorAll('a'))
        .map((a) => a.getAttribute('href') || '').filter((h) => /screen=info_village/.test(h))[0];
      const mid = lk && lk.match(/[?&]id=(\d+)/);
      out.push({ coord: alvo.coord, dono: alvo.dono, nome: alvo.nome,
                 dist: (tds[1].textContent || '').trim(),
                 destId: mid ? mid[1] : null,
                 awayId: cb ? cb.getAttribute('data-away-id') : null,
                 tropas: tropas });
    });
    return out;
  }

  // Passo 3: inverter. De "origem → destinos" para "destino → origens".
  async function apoiosMontar(forcar, aoAndar) {
    if (!forcar && _apCache) return _apCache;   // sem expiração: quem decide reler e o usuario
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
            coord: it.coord, dono: it.dono, nome: it.nome, destId: it.destId, total: {}, origens: [] });
          if (!d.destId) d.destId = it.destId;
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
      apoiosSalvar();
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

  // Depois de uma retirada CONFIRMADA, tira do cache o que voltou, em vez de reler tudo.
  // O que sai daqui já foi conferido contra o jogo (a retirada só chega neste ponto se a
  // releitura bateu); refazer a leitura inteira pra ver o mesmo número custaria 44 requisições
  // numa conta que bate 429 global.
  function apoiosPodar(coord, vids, unids) {
    if (!_apCache) return;
    const d = _apCache.lista.filter((x) => x.coord === coord)[0];
    if (!d) return;
    const alvo = {};
    vids.forEach((v) => { alvo[v] = 1; });
    d.origens = d.origens.filter((o) => {
      if (!alvo[o.vid]) return true;
      unids.forEach((u) => { delete o.tropas[u]; });
      return apoiosSoma(o.tropas) > 0;         // origem que zerou sai da lista
    });
    d.total = {};
    d.origens.forEach((o) => Object.keys(o.tropas).forEach((u) => {
      d.total[u] = (d.total[u] || 0) + o.tropas[u];
    }));
    if (!d.origens.length) _apCache.lista = _apCache.lista.filter((x) => x.coord !== coord);
    apoiosSalvar();
  }

  // Os mesmos chips, mas apagando as unidades que NÃO vão voltar. É a prévia do que o botão vai
  // fazer naquela linha, sem inventar um segundo lugar pra olhar.
  function apoiosLinhaPrevia(o, unidades, sel) {
    const ks = unidades.filter((u) => (o.tropas[u] || 0) > 0);
    if (!ks.length) return '<span style="color:#8a7340">—</span>';
    return '<span class="twmgr-ap-tropas">'
      + ks.map((u) => '<span class="twmgr-ap-t' + (sel.indexOf(u) >= 0 ? '' : ' zero') + '">'
          + apoiosIcone(u) + '<b>' + fmtN(o.tropas[u]) + '</b></span>').join('')
      + '</span>';
  }

  // ── Retirar apoio ───────────────────────────────────────────────────────────
  // O CORPO REAL, capturado do próprio formulário do jogo (marquei as caixas na página e li o
  // FormData sem enviar). Não foi deduzido, e a primeira versão que eu deduzi estava errada:
  //
  //   POST /game.php?village=<origem>&screen=place&action=withdraw_selected_unit_counts
  //        &mode=units
  //   corpo: from-table=other
  //          withdraw_unit[<awayId>][<unidade>]=<QUANTIDADE>
  //          h=<csrf>                                   ← no CORPO, não na URL
  //
  // MAS ESSE POST SOZINHO NÃO BASTA: ele só aplica as unidades que estiverem na preferência de
  // coluna gravada no servidor (ver apoiosPatchColunas logo abaixo). Sem isso ele responde HTTP
  // 200, não reclama, e não move nada.
  //
  // O que a captura ensinou:
  //
  //   1. A QUANTIDADE É LIVRE — dá pra devolver 300 de 1.688. Olhando o HTML eu tinha concluído
  //      que não dava: os campos não existem na página servida, o JS do jogo os cria quando a
  //      linha é marcada.
  //   2. `checkbox_<unidade>=on` no corpo não faz nada e `id_<awayId>=on` não existe. Foi o que
  //      eu mandei na v11.114.0 — o servidor ignorou.
  //   3. Unidade que NÃO está no corpo fica parada. Só mandamos o que vai voltar.
  //
  // Duas versões erradas (v11.114.0 e v11.117.0) responderam HTTP 200. Quem denunciou as duas
  // foi a releitura da praça — é por isso que a confirmação por efeito não é opcional aqui.
  //
  // Um POST por aldeia de ORIGEM: os awayId pertencem à praça dela.
  const _apSelLinha = {};                      // awayId -> marcado?
  const _apSelUnid = {};                       // coord destino -> {unidade: volta?}
  const _apPref = {};                          // vid -> colunas marcadas no servidor

  // Quais unidades voltam. Sem escolha explícita, todas — "mandar voltar" quer dizer voltar.
  function apoiosUnidSel(coord, unidades) {
    const m = _apSelUnid[coord];
    if (!m) return unidades.slice();
    return unidades.filter((u) => m[u]);
  }

  // O GATE. Descoberto interceptando a página: marcar a coluna dispara
  //
  //   POST /game.php?village=<vid>&screen=settings&ajaxaction=patch_away_unit_checkboxes
  //   corpo: away_units_checkboxes={"other":["spear","sword"]} · h=<csrf>
  //
  // Isso não é estado de tela: é PREFERÊNCIA DE CONTA gravada no servidor, e a retirada só
  // aplica as unidades que estiverem nela. Medido: com a preferência em [lanceiro, pesada], um
  // pedido de 5 espadachins não movia nada, enquanto 1 pesada voltava — mesmo POST, mesma
  // requisição. Gravando [espadachim] antes, os 5 voltaram na hora.
  async function apoiosPatchColunas(vid, unids) {
    const p = new URLSearchParams();
    p.set('away_units_checkboxes', JSON.stringify({ other: unids }));
    p.set('h', CSRF);
    const r = await fetch('/game.php?village=' + vid + '&screen=settings&ajaxaction=patch_away_unit_checkboxes',
      { method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        body: p.toString() });
    const t = (await r.text()).trim();
    if (!r.ok || t.indexOf('true') < 0) {
      throw new Error('não consegui liberar as colunas ' + unids.join(', ') + ' em ' + vid
        + ' (o jogo respondeu "' + t.slice(0, 60) + '") — sem isso a retirada é ignorada em silêncio');
    }
  }

  // O que volta daquele apoio: as unidades escolhidas, INTEIRAS.
  function apoiosPedido(o, sel) {
    const ped = {};
    sel.forEach((u) => { if ((o.tropas[u] || 0) > 0) ped[u] = o.tropas[u]; });
    return ped;
  }

  // ── Retirada em bloco, pela tela do DESTINO ─────────────────────────────────
  // A `info_village` do destino lista TODAS as minhas origens que apoiam aquela aldeia, e tem
  // ação própria. Um pedido resolve o destino inteiro, em vez de um POST por praça — com 43
  // origens isso é 1 requisição no lugar de 43, o que importa numa conta que bate 429 global.
  //
  //   POST screen=place&action=withdraw_selected_units_village_info&mode=units
  //   corpo: village_id=<destino>
  //          checkbox_<unidade>=on
  //          withdraw_unit[<awayId>][units][<unidade>]=<quantidade>
  //          withdraw_unit[<awayId>][home][<origem>]=on
  //          h=<csrf>
  //
  // Gate próprio, DIFERENTE do da praça (array simples, não {other:[...]}):
  //
  //   POST screen=settings&ajaxaction=set_village_info_checkboxes
  //   corpo: info_village_checkboxes=["spear","sword"] · h=<csrf>
  //
  // Os campos de quantidade só existem depois que a coluna é marcada — o JS do jogo os cria.
  // Foi por olhar a tela com as colunas desligadas que eu concluí, errado, que ela não tinha
  // quantidade.
  async function apoiosDestinoLer(destId) {
    const r = await fetch('/game.php?village=' + CUR_VID + '&screen=info_village&id=' + destId,
      { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' na tela do destino ' + destId);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const f = Array.prototype.slice.call(doc.querySelectorAll('#content_value form'))
      .filter((x) => /withdraw_selected_units_village_info/.test(x.getAttribute('action') || ''))[0];
    if (!f) return { linhas: [], colunas: [] };   // sem apoio meu ali: não é erro
    const linhas = [];
    f.querySelectorAll('td.unit-item[data-away-id]').forEach((td) => {
      const n = parseInt(td.getAttribute('data-unit-count'), 10) || 0;
      if (n > 0) linhas.push({ away: td.getAttribute('data-away-id'),
                               org: td.getAttribute('data-village-id'), u: td.id, n: n });
    });
    const colunas = [];
    f.querySelectorAll('input[name^="checkbox_"]').forEach((c) => {
      if (c.hasAttribute('checked')) colunas.push(c.getAttribute('name').slice(9));
    });
    return { linhas: linhas, colunas: colunas };
  }

  async function apoiosPatchColunasDestino(unids) {
    const p = new URLSearchParams();
    p.set('info_village_checkboxes', JSON.stringify(unids));
    p.set('h', CSRF);
    const r = await fetch('/game.php?village=' + CUR_VID + '&screen=settings&ajaxaction=set_village_info_checkboxes',
      { method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        body: p.toString() });
    const t = (await r.text()).trim();
    if (!r.ok || t.indexOf('true') < 0) {
      throw new Error('não consegui liberar as colunas na tela do destino (o jogo respondeu "'
        + t.slice(0, 60) + '") — sem isso a retirada é ignorada em silêncio');
    }
  }

  // Devolve as aldeias de origem que ESTA tela atendeu. Quem não estiver aqui sobra pro caminho
  // da praça — a tela do destino pode não listar apoio que ainda está a caminho, e "não estava
  // na lista" nunca pode virar "não existe".
  async function apoiosRetirarDestino(destId, origens, unids) {
    const querOrg = {};
    origens.forEach((o) => { querOrg[o.vid] = 1; });
    const est = await apoiosDestinoLer(destId);
    const alvos = est.linhas.filter((l) => querOrg[l.org] && unids.indexOf(l.u) >= 0);
    if (!alvos.length) return [];

    const precisa = {};
    alvos.forEach((l) => { precisa[l.u] = 1; });
    const uniao = est.colunas.slice();
    Object.keys(precisa).forEach((u) => { if (uniao.indexOf(u) < 0) uniao.push(u); });
    await apoiosPatchColunasDestino(uniao);

    try {
      const p = new URLSearchParams();
      p.set('village_id', String(destId));
      Object.keys(precisa).forEach((u) => p.set('checkbox_' + u, 'on'));
      alvos.forEach((l) => {
        p.set('withdraw_unit[' + l.away + '][units][' + l.u + ']', String(l.n));
        p.set('withdraw_unit[' + l.away + '][home][' + l.org + ']', 'on');
      });
      p.set('h', CSRF);
      const r = await fetch('/game.php?village=' + CUR_VID
        + '&screen=place&action=withdraw_selected_units_village_info&mode=units',
        { method: 'POST', credentials: 'include', cache: 'no-store',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ao pedir a retirada no destino ' + destId);
      const eb = new DOMParser().parseFromString(await r.text(), 'text/html').querySelector('.error_box');
      if (eb) throw new Error('o jogo recusou: ' + (eb.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160));

      // CONFIRMAÇÃO POR EFEITO: relê a tela e exige que cada (apoio, unidade) pedido sumiu.
      await sleep(700);
      const depois = await apoiosDestinoLer(destId);
      const ainda = depois.linhas.filter((l) =>
        alvos.some((a) => a.away === l.away && a.u === l.u));
      if (ainda.length) {
        throw new Error('o destino ainda mostra ' + ainda.length + ' item(ns) parado(s) ('
          + ainda.slice(0, 2).map((l) => unitPt(l.u) + ' x' + l.n).join(', ')
          + ') — a retirada NÃO foi aceita');
      }
      const atendidas = {};
      alvos.forEach((l) => { atendidas[l.org] = 1; });
      return Object.keys(atendidas);
    } finally {
      if (uniao.length !== est.colunas.length) {
        try { await apoiosPatchColunasDestino(est.colunas); }
        catch (e) { pushLog('Apoios: não consegui devolver as colunas da tela do destino ('
          + (e.message || e) + ').', 'err', 'apoios'); }
      }
    }
  }

  async function apoiosRetirarDe(vid, pedidos) {
    // 1) liberar as colunas. Só o que vai voltar entra no pedido; mandar unidade com 0 é
    // inofensivo, mas unidade FORA da preferência é ignorada sem aviso nenhum.
    const precisa = {};
    pedidos.forEach((pd) => Object.keys(pd.unidades).forEach((u) => {
      if (pd.unidades[u] > 0) precisa[u] = 1;
    }));
    const querendo = Object.keys(precisa);
    if (!querendo.length) return 0;
    const antesPref = _apPref[vid];
    const uniao = (antesPref || []).slice();
    querendo.forEach((u) => { if (uniao.indexOf(u) < 0) uniao.push(u); });
    await apoiosPatchColunas(vid, uniao);

    try {
      return await apoiosPostRetirada(vid, pedidos);
    } finally {
      // devolve a preferência do usuário. É tela dele, não minha — e se eu deixar mexida, a
      // próxima retirada MANUAL dele vem com colunas que ele não escolheu.
      if (antesPref && uniao.length !== antesPref.length) {
        try { await apoiosPatchColunas(vid, antesPref); }
        catch (e) { pushLog('Apoios: não consegui devolver as colunas de ' + vid + ' ('
          + (e.message || e) + '). Confira na praça.', 'err', 'apoios'); }
      }
      // a releitura da verificação sobrescreve o _apPref com a união temporária
      if (antesPref) _apPref[vid] = antesPref;
    }
  }

  async function apoiosPostRetirada(vid, pedidos) {
    const p = new URLSearchParams();
    p.set('from-table', 'other');
    pedidos.forEach((pd) => {
      Object.keys(pd.unidades).forEach((u) => {
        p.set('withdraw_unit[' + pd.awayId + '][' + u + ']', String(pd.unidades[u]));
      });
    });
    p.set('h', CSRF);
    const r = await fetch('/game.php?village=' + vid
      + '&screen=place&action=withdraw_selected_unit_counts&mode=units',
      { method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ao pedir a retirada em ' + vid);
    const html = await r.text();
    // Se o jogo recusou, ele DIZ. Melhor mostrar a frase dele do que só "não aceitou".
    const eb = new DOMParser().parseFromString(html, 'text/html').querySelector('.error_box');
    if (eb) throw new Error('o jogo recusou: ' + (eb.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160));

    // CONFIRMAÇÃO POR EFEITO. O TW responde 200 com página de erro, então `r.ok` não prova
    // nada — foi exatamente assim que o Desviar reportou sucesso com o exército parado.
    // Relê a praça e exige que cada apoio tenha caído para o que deveria sobrar.
    await sleep(700);
    const depois = await apoiosDetalhe(vid);
    const porId = {};
    depois.forEach((it) => { if (it.awayId) porId[it.awayId] = it.tropas; });
    const teimosos = [];
    pedidos.forEach((pd) => {
      const t = porId[pd.awayId] || {};
      Object.keys(pd.unidades).forEach((u) => {
        const esperado = Math.max(0, (pd.antes[u] || 0) - pd.unidades[u]);
        const agora = t[u] || 0;
        if (agora > esperado) teimosos.push(unitPt(u) + ': esperava ' + esperado + ', achei ' + agora);
      });
    });
    if (teimosos.length) {
      throw new Error('a praça de ' + vid + ' não bateu depois do pedido — ' + teimosos.slice(0, 3).join('; ')
        + (teimosos.length > 3 ? ' (+' + (teimosos.length - 3) + ')' : '') + '. A retirada NÃO foi aceita.');
    }
    return pedidos.length;
  }

  async function apoiosRetirarSelecao(coord) {
    const d = _apCache && _apCache.lista.filter((x) => x.coord === coord)[0];
    if (!d) throw new Error('destino ' + coord + ' não está na leitura atual');
    const sel = apoiosUnidSel(coord, Object.keys(d.total));
    if (!sel.length) throw new Error('nenhuma unidade marcada — nada a retirar');
    const marcadas = d.origens.filter((o) => _apSelLinha[o.awayId]);
    if (!marcadas.length) throw new Error('nenhum apoio marcado');

    // Caminho rápido: a tela do destino resolve TODAS as origens de uma vez.
    let jaFeitas = {};
    if (d.destId) {
      const atendidas = await apoiosRetirarDestino(d.destId, marcadas, sel);
      atendidas.forEach((v) => { jaFeitas[v] = 1; });
      marcadas.forEach((o) => { if (jaFeitas[o.vid]) delete _apSelLinha[o.awayId]; });
      if (atendidas.length) apoiosPodar(coord, atendidas, sel);
    }
    const sobra = marcadas.filter((o) => !jaFeitas[o.vid]);
    if (!sobra.length) {
      const t = marcadas.reduce((a, o) => a + apoiosSoma(apoiosPedido(o, sel)), 0);
      pushLog('Apoios: mandei voltar ' + fmtN(t) + ' tropa(s) de ' + marcadas.length
        + ' aldeia(s) em ' + coord + ' numa requisição só — confirmado relendo o destino.',
        'ok', 'apoios');
      return marcadas.length;
    }
    // Sobrou quem a tela do destino não listou (apoio ainda a caminho, por exemplo): esses vão
    // pelo caminho da praça, um POST por aldeia. Ficar em silêncio aqui seria transformar
    // "voltar tudo" em "voltar quase tudo".
    pushLog('Apoios: ' + sobra.length + ' apoio(s) não estavam na tela de ' + coord
      + ' — retirando pela praça de cada um.', '', 'apoios');
    const porOrigem = {};
    let totalTropa = 0;
    sobra.forEach((o) => {
      if (!o.awayId) throw new Error('não li o id do apoio vindo de ' + (o.nome || o.coord)
        + ' — sem ele eu não sei o que estou mandando voltar');
      const ped = apoiosPedido(o, sel);
      const soma = apoiosSoma(ped);
      if (!soma) return;                       // marcado mas com tudo zerado: nada a fazer
      totalTropa += soma;
      (porOrigem[o.vid] || (porOrigem[o.vid] = [])).push(
        { awayId: o.awayId, unidades: ped, antes: o.tropas });
    });
    const vids = Object.keys(porOrigem);
    if (!vids.length) return marcadas.length - sobra.length;
    let ok = 0;
    for (const vid of vids) {
      await apoiosRetirarDe(vid, porOrigem[vid]);
      ok += porOrigem[vid].length;
      porOrigem[vid].forEach((pd) => { delete _apSelLinha[pd.awayId]; });
      apoiosPodar(coord, [vid], sel);
      await sleep(200);
    }
    pushLog('Apoios: mandei voltar ' + fmtN(totalTropa) + ' tropa(s) em ' + ok + ' apoio(s) de '
      + coord + ' — confirmado relendo a praça.', 'ok', 'apoios');
    return ok + (marcadas.length - sobra.length);
  }

  function apoiosIdade(at) {
    const min = Math.max(0, Math.round((Date.now() - at) / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return 'há ' + min + ' min';
    const h = Math.round(min / 60);
    if (h < 24) return 'há ' + h + 'h';
    const dd = Math.round(h / 24);
    return 'há ' + dd + (dd > 1 ? ' dias' : ' dia');
  }

  // Link pro mapa, centralizado naquela coordenada — mesma convenção que o próprio jogo usa
  // pra abrir o mapa num ponto específico (x/y na query string do screen=map).
  function apoiosMapUrl(coord) {
    const m = (coord || '').split('|');
    if (m.length !== 2) return null;
    return '/game.php?village=' + CUR_VID + '&screen=map&x=' + encodeURIComponent(m[0]) + '&y=' + encodeURIComponent(m[1]);
  }
  // A coordenada em si vira o link: clicável, abre numa aba nova (o painel de Apoios não
  // perde estado) pra dar uma olhada na posição e decidir se vale manter o apoio ali.
  function apoiosCoordLink(coord) {
    const url = apoiosMapUrl(coord);
    if (!url) return esc(coord || '');
    return '<a class="twmgr-ap-coord twmgr-ap-maplink" href="' + esc(url) + '" target="_blank" rel="noopener" title="ver ' + esc(coord) + ' no mapa">' + esc(coord) + '</a>';
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
      // Como a leitura não expira mais sozinha, a IDADE dela é o dado que importa: o usuário
      // precisa saber se está olhando algo de 2 minutos ou de ontem.
      + '<div style="text-align:right"><div class="twmgr-ap-lbl">lido ' + esc(apoiosIdade(_apCache.at)) + '</div>'
        + '<div style="font-size:10px;color:#6f6153">'
        + new Date(_apCache.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit',
                                                          hour: '2-digit', minute: '2-digit' })
        + '</div></div>'
      + '</div>';

    box.innerHTML = topo + lista.map((d) => {
      const aberto = !!_apAberto[d.coord];
      const pct = Math.max(8, Math.round(apoiosSoma(d.total) / maior * 100));
      const cab = '<div class="twmgr-ap-dest" data-coord="' + esc(d.coord) + '">'
        + '<span class="twmgr-ap-barra" style="height:' + pct + '%;top:auto;bottom:0"></span>'
        + '<span class="twmgr-ap-seta">' + (aberto ? '▼' : '▶') + '</span>'
        + '<span class="twmgr-ap-nome"><b>' + esc(d.nome || d.coord) + '</b>'
        + apoiosCoordLink(d.coord)
        + '<div class="twmgr-ap-dono">' + (d.dono ? esc(d.dono) : '<i>bárbara</i>')
        + ' · ' + d.origens.length + (d.origens.length > 1 ? ' origens' : ' origem') + '</div>'
        + '</span>'
        + apoiosLinhaTropas(d.total, unidades)
        + '</div>';
      if (!aberto) return '<div class="twmgr-ap-cartao">' + cab + '</div>';
      const uDest = Object.keys(d.total);
      const selU = apoiosUnidSel(d.coord, uDest);
      const filhos = d.origens.map((o) =>
        '<div class="twmgr-ap-orig">'
        + '<span><input type="checkbox" class="twmgr-ap-cb" data-away="' + esc(o.awayId || '')
        + '" data-coord="' + esc(d.coord) + '"' + (_apSelLinha[o.awayId] ? ' checked' : '')
        + (o.awayId ? '' : ' disabled title="não li o id deste apoio"') + '> '
        + esc(o.nome || o.coord)
        + apoiosCoordLink(o.coord)
        + (o.dist ? '<span class="twmgr-ap-dist">' + esc(o.dist) + '</span>' : '') + '</span>'
        // Na linha marcada, o que NÃO vai voltar aparece apagado. A prévia fica onde a decisão
        // está, em vez de obrigar a conferir a escolha de unidade num segundo lugar.
        + (_apSelLinha[o.awayId] ? apoiosLinhaPrevia(o, unidades, selU) : apoiosLinhaTropas(o.tropas, unidades))
        + '</div>').join('');
      // A barra de ação: quais unidades voltam (padrão: todas) e o botão. Só aparece expandido,
      // pra não haver botão de mover tropa a um clique de distância numa lista fechada.
      const marcadas = d.origens.filter((o) => _apSelLinha[o.awayId]).length;
      const acoes = '<div class="twmgr-ap-acoes" data-coord="' + esc(d.coord) + '">'
        + '<span class="twmgr-ap-lbl">voltam</span>'
        + uDest.map((u) => '<span class="twmgr-ap-u' + (selU.indexOf(u) >= 0 ? ' on' : '')
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
    apoiosCarregar();                          // a leitura anterior sobrevive ao F5
    apoiosRender();
    const box = document.getElementById('twmgr-apoios-corpo');
    if (box) {
      box.addEventListener('click', async (e) => {
        const t = e.target;
        if (!t.closest) return;

        // 0. clicar na coordenada abre o mapa numa aba nova — deixa a navegação padrão do link
        // acontecer e sai antes de qualquer outro caso (senão o clique também abriria/fecharia
        // o cartão do destino, já que a coordenada mora dentro de .twmgr-ap-dest).
        if (t.closest('.twmgr-ap-maplink')) return;

        // 1. marcar/desmarcar um apoio
        const cb = t.closest('.twmgr-ap-cb');
        if (cb) {
          const id = cb.getAttribute('data-away');
          if (id) { if (cb.checked) _apSelLinha[id] = 1; else delete _apSelLinha[id]; }
          apoiosRender();
          return;
        }
        // 2. ligar/desligar uma unidade neste destino
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
          const marc = d.origens.filter((o) => _apSelLinha[o.awayId]);
          // Soma o que EXATAMENTE vai voltar, por unidade. O usuário confirma o número que ele
          // vai ver mudar no jogo — não uma descrição do que pedi.
          const selUn = apoiosUnidSel(c, Object.keys(d.total));
          const porU = {};
          marc.forEach((o) => {
            const ped = apoiosPedido(o, selUn);
            Object.keys(ped).forEach((u) => { porU[u] = (porU[u] || 0) + ped[u]; });
          });
          const resumo = Object.keys(porU).map((u) => fmtN(porU[u]) + ' ' + unitPt(u));
          if (!window.confirm('Mandar voltar de ' + (d.nome || c) + ' (' + c + ')?\n\n'
              + (resumo.length ? resumo.join('\n') : 'NADA — nenhuma unidade marcada')
              + '\n\nEm ' + marc.length + ' apoio(s). Volta TUDO dessas unidades.')) return;
          go.disabled = true; go.textContent = 'retirando…';
          try {
            await apoiosRetirarSelecao(c);
            apoiosRender();                    // o cache já foi podado do que voltou
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
