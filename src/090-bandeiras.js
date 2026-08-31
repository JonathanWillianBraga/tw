  // ==================== BANDEIRAS (bnd*) ====================
  // Uma aldeia so pode usar UMA bandeira. Com 80 aldeias e 400+ bandeiras na gaveta, a pergunta
  // nao e "qual bandeira e boa" - e QUAL VAI EM QUAL ALDEIA. Este modulo responde isso com preco,
  // nao com regra.
  //
  // POR QUE NAO TEM LIMIAR AQUI
  //
  //   A primeira ideia foi "aldeia com 90% do modelo de tropas nao precisa de recrutamento".
  //   Medido na conta: a melhor aldeia estava em 64% e 47 das 80 abaixo de 10% - a regra nunca
  //   dispararia. O numero que DISCRIMINA e o espaco livre da fazenda (21 aldeias com menos de 500
  //   livres, 59 com espaco). Entao em vez de regra, cada bandeira ganha um PRECO em recurso/hora:
  //
  //     Recurso ....... % x producao dos tres predios           (vale pra sempre)
  //     Recrutamento .. % x quanto de tropa a aldeia produz/h   (vale ate a fazenda encher)
  //
  //   As regras que o usuario queria caem sozinhas como CONSEQUENCIA, sem nenhum if:
  //     . fazenda cheia    -> a janela do recrutamento e zero -> a aldeia recebe Recurso
  //     . mina alta        -> Recurso rende mais ali -> a maior bandeira vai pra maior mina
  //     . estabulo alto e  -> consumo alto e janela longa -> Recrutamento ganha
  //       fazenda com espaco
  //   E a fazenda nivel abaixo de 30 se resolve de graca: a conta usa o espaco livre REAL
  //   (17432/24000), nunca um teto fixo.
  //
  // E COMO O PRECO E `% x base`, O OTIMO E SO ORDENAR E CASAR: maior bandeira na maior base. Nao
  // precisa de algoritmo de atribuicao.
  //
  // O QUE MEDIR ENSINOU (e que raciocinio nao daria)
  //
  //   . O ESTABULO e que manda no consumo, nao o quartel. Numa q25/e20/o15 o estabulo sozinho faz
  //     4.560 rec/h contra 2.272 do quartel. Duas aldeias com quartel 25 e 20 diferem 6% no total.
  //   . TROCAR BANDEIRA E GRATIS e a antiga volta pro estoque na hora (medido: Ataque nv1 10->11 e
  //     Recrut nv1 3->2 no mesmo segundo). O unico custo e o COOLDOWN DE 24H POR ALDEIA.
  //   . Na coluna Bandeira da visao geral, o `img src` e o NIVEL, nao o tipo. Quem classifica pelo
  //     icone conta 27 aldeias com Recurso onde ha 56 - foi o meu primeiro erro aqui.
  //   . `overview_villages` e STATEFUL por grupo no servidor (ver 040-tropas.js): sempre `group=0`.
  //
  // ESCOPO DO MVP: so Recurso x Recrutamento.
  //   . Capacidade de saque ficou de fora a pedido do usuario - com muita gente farmando e poucas
  //     barbaras, mais carga nao paga.
  //   . Ataque/Defesa ficam so no contador: trocar pra Ataque quando sai ataque grande e outra
  //     ideia boa, mas e outro ciclo de vida (temporario, por operacao) e entra depois.

  const BND_TIPO = { 1: 'Recurso', 2: 'Recrutamento', 3: 'Ataque', 4: 'Defesa',
                     5: 'Sorte', 6: 'Populacao', 7: 'Moeda', 8: 'Saque' };
  // Fator de tempo de recrutamento por nivel de predio. Medido em 10 aldeias SEM bandeira de
  // recrutamento, com lanceiro e barbaro dando o mesmo numero: cada nivel corta 5,6% do tempo.
  // A razao 0,944 e do jogo; a ESCALA e calibrada em runtime (bndCalibrar), porque o `build_time`
  // do get_unit_info pode ja vir ajustado pela velocidade do mundo.
  const BND_POR_NIVEL = 0.9440;
  const BND_ESCALA_PADRAO = 0.6627;          // f(nivel) / 0.944^nivel, medido no br143
  const BND_HORIZONTE_PADRAO = 168;          // horas de janela pra comparar Recurso x Recrutamento
  const BND_AMOSTRA_CALIB = 4;               // aldeias lidas pra calibrar o tempo de recrutamento
  const BND_PREDIO = { spear: 'bar', sword: 'bar', axe: 'bar', archer: 'bar',
                       spy: 'sta', light: 'sta', marcher: 'sta', heavy: 'sta',
                       ram: 'gar', catapult: 'gar' };
  const BND_UNIDADE_PT = { 'Lanceiro': 'spear', 'Espadachim': 'sword', 'B\u00e1rbaro': 'axe',
                           'Arqueiro': 'archer', 'Explorador': 'spy', 'Cavalaria leve': 'light',
                           'Arqueiro a cavalo': 'marcher', 'Cavalaria pesada': 'heavy',
                           'Ar\u00edete': 'ram', 'Catapulta': 'catapult' };

  let _bndDados = null, _bndAt = 0, _bndCarregando = false, _bndErr = null;
  let _bndEscada = null;         // nivel -> %, deduzida do censo (ver bndEscada)
  let _bndLivre = null;          // {tipo: {nivel: quantas SOBRANDO}} - ver bndPronta

  function bndCfg() {
    if (!config.flags) config.flags = {};
    const c = config.flags;
    if (c.horizonte == null) c.horizonte = BND_HORIZONTE_PADRAO;
    return c;
  }

  // ---------- leitura ----------

  // Custo e tempo-base por unidade, e a ESCALA do tempo de recrutamento. Tudo de uma tela de
  // recrutamento de verdade, nunca de constante: mundo com outra velocidade tem outro numero, e a
  // constante errada mente calada.
  //
  // A escala sai do MAIOR valor entre as aldeias amostradas, de proposito. Algumas aldeias tem
  // bonus permanente de "-X% no tempo de recrutamento" (medi uma de -33% no estabulo); bonus so
  // DIMINUI o tempo, entao o maior valor e o da aldeia sem bonus, que e a verdade da tabela.
  async function bndCalibrar(vidsAmostra, flagsPct, cen) {
    const cache = cacheLer('bnd_calib', 24 * 3600 * 1000);
    if (cache && cache.escala && cache.custo && Object.keys(cache.custo).length) return cache;
    const out = { escala: BND_ESCALA_PADRAO, custo: {}, pop: {}, base: {} };
    try {
      const xml = await fetch('/interface.php?func=get_unit_info', { credentials: 'include' }).then((r) => r.text());
      Object.keys(BND_PREDIO).forEach((u) => {
        const b = (xml.match(new RegExp('<' + u + '>([\\s\\S]*?)</' + u + '>')) || [])[1];
        if (!b) return;
        const g = (t) => parseFloat((b.match(new RegExp('<' + t + '>([\\d.]+)</' + t + '>')) || [])[1]);
        out.base[u] = g('build_time') || 0;
        out.pop[u] = g('pop') || 0;
      });
    } catch (e) { /* sem base: bndConsumo devolve 0 e a aldeia so concorre por Recurso */ }
    let melhor = 0;
    for (let i = 0; i < vidsAmostra.length; i++) {
      const vid = vidsAmostra[i];
      try {
        const r = await fetch('/game.php?village=' + vid + '&screen=train', { credentials: 'include' });
        const d = new DOMParser().parseFromString(await r.text(), 'text/html');
        d.querySelectorAll('#train_form tr').forEach((tr) => {
          const cel = tr.querySelectorAll('td'); if (cel.length < 2) return;
          const u = BND_UNIDADE_PT[(cel[0].textContent || '').replace(/\s+/g, ' ').trim()];
          if (!u) return;
          const txt = (cel[1].textContent || '').replace(/\s+/g, ' ');
          // "50 30 10 1 0:02:39" -> madeira, argila, ferro, populacao, duracao.
          const c = txt.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+:\d\d:\d\d/);
          if (c && !out.custo[u]) out.custo[u] = { w: +c[1], s: +c[2], i: +c[3] };
          if (u !== 'spear') return;
          const t = txt.match(/(\d+):(\d\d):(\d\d)/); if (!t) return;
          const seg = (+t[1]) * 3600 + (+t[2]) * 60 + (+t[3]);
          const nvBar = (cen[vid] || {}).bar || 0;
          const base = out.base.spear || 0;
          if (!seg || !nvBar || !base) return;
          // Desfaz a bandeira: `tempo = tempo_do_nivel / (1 + pct/100)`. Confirmado em 6 aldeias,
          // erro abaixo de 0,5%.
          const semFlag = seg * (1 + (flagsPct[vid] || 0) / 100);
          const esc = semFlag / (base * Math.pow(BND_POR_NIVEL, nvBar));
          if (esc > melhor) melhor = esc;
        });
      } catch (e) { /* aldeia que nao leu nao entra na calibragem */ }
      await sleep(220);
    }
    if (melhor > 0.05 && melhor < 20) out.escala = melhor;
    cacheGravar('bnd_calib', out);
    return out;
  }

  // Censo: uma requisicao, todas as aldeias, com a bandeira de cada uma e o cooldown.
  async function bndLerCenso() {
    const r = await fetch('/game.php?village=' + CUR_VID
      + '&screen=overview_villages&mode=tech&group=0&page=-1', { credentials: 'include' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const out = {};
    d.querySelectorAll('td.flag_info').forEach((td) => {
      const tr = td.closest('tr'); if (!tr) return;
      const q = tr.querySelector('.quickedit-vn[data-id]'); if (!q) return;
      const vid = q.getAttribute('data-id');
      const lbl = tr.querySelector('.quickedit-label');
      const nome = ((lbl && lbl.textContent) || '').replace(/\s+/g, ' ').trim();
      const t = (td.textContent || '').replace(/\s+/g, ' ').replace('\u00bb Selecionar', '').trim();
      // Pelo TEXTO. O icone daquela coluna e o NIVEL da bandeira, nao o tipo.
      let tipo = 0;
      if (/recursos/i.test(t)) tipo = 1; else if (/recrutamento/i.test(t)) tipo = 2;
      else if (/ataque/i.test(t)) tipo = 3; else if (/defesa/i.test(t)) tipo = 4;
      else if (/sorte/i.test(t)) tipo = 5; else if (/popula/i.test(t)) tipo = 6;
      else if (/moeda/i.test(t)) tipo = 7; else if (/saque/i.test(t)) tipo = 8;
      const img = td.querySelector('img');
      const nivel = img ? (parseInt(((img.getAttribute('src') || '').split('/').pop() || '').split('.')[0], 10) || 0) : 0;
      out[vid] = {
        vid: vid,
        nome: nome.replace(/\s*\(\d{1,3}\|\d{1,3}\).*$/, '').trim() || vid,
        coord: (nome.match(/\d{1,3}\|\d{1,3}/) || [''])[0],
        tipo: tipo, nivel: nivel,
        pct: parseInt((t.match(/(\d+)\s*%/) || [0, 0])[1], 10) || 0,
        cooldown: /flag_cooldown/.test(tr.getAttribute('class') || '')
      };
    });
    if (!Object.keys(out).length) throw new Error('a visao geral de Pesquisa veio sem aldeias');
    return out;
  }

  // Niveis de predio (producao e recrutamento) e lotacao da fazenda. Duas requisicoes.
  async function bndLerAldeias(cen) {
    const rb = await fetch('/game.php?village=' + CUR_VID
      + '&screen=overview_villages&mode=buildings&group=0&page=-1', { credentials: 'include' });
    const db = new DOMParser().parseFromString(await rb.text(), 'text/html');
    const bt = db.querySelector('#buildings_table') || db.querySelector('table.overview_table');
    if (!bt) throw new Error('nao achei a tabela de edificios');
    // Coluna pelo ICONE do cabecalho, nunca por posicao fixa: um predio a mais no mundo deslocaria
    // tudo e a conta sairia calada e errada.
    const col = {};
    bt.querySelectorAll('th').forEach((th, i) => {
      const im = th.querySelector('img'); if (!im) return;
      const m = (im.getAttribute('src') || '').match(/([a-z_]{3,})\.(png|webp)/i);
      if (m) col[m[1]] = i;
    });
    bt.querySelectorAll('tr').forEach((tr) => {
      const q = tr.querySelector('.quickedit-vn[data-id]'); if (!q) return;
      const v = cen[q.getAttribute('data-id')]; if (!v) return;
      const td = tr.querySelectorAll('td');
      const nv = (k) => (col[k] == null ? 0 : Math.min(30, parseInt(((td[col[k]] || {}).textContent || '0').trim(), 10) || 0));
      v.bar = nv('barracks'); v.sta = nv('stable'); v.gar = nv('garage');
      v.mw = nv('wood'); v.ms = nv('stone'); v.mi = nv('iron'); v.sto = nv('storage');
    });
    const rp = await fetch('/game.php?village=' + CUR_VID
      + '&screen=overview_villages&mode=prod&group=0&page=-1', { credentials: 'include' });
    const dp = new DOMParser().parseFromString(await rp.text(), 'text/html');
    const pt = dp.querySelector('#production_table') || dp.querySelector('table.overview_table');
    if (pt) {
      const heads = Array.prototype.map.call(pt.querySelectorAll('th'), (t) => (t.textContent || '').trim());
      const iFaz = heads.findIndex((h) => /Fazenda/i.test(h));
      pt.querySelectorAll('tr').forEach((tr) => {
        const q = tr.querySelector('.quickedit-vn[data-id]'); if (!q) return;
        const v = cen[q.getAttribute('data-id')]; if (!v) return;
        const td = tr.querySelectorAll('td');
        const m = iFaz >= 0 ? ((td[iFaz] || {}).textContent || '').match(/([\d.]+)\s*\/\s*([\d.]+)/) : null;
        if (m) { v.pop = +m[1].replace(/\D/g, ''); v.popMax = +m[2].replace(/\D/g, ''); }
        const w = tr.querySelector('span.wood');
        const tdRes = w && w.closest('td');
        v.cap = (tdRes && tdRes.nextElementSibling)
          ? (parseInt((tdRes.nextElementSibling.textContent || '').replace(/\D/g, ''), 10) || 0) : 0;
      });
    }
    return cen;
  }

  // Modelo de tropas de cada aldeia. O Recrutar guarda o modelo por GRUPO do jogo, nao por aldeia -
  // entao quem responde "qual modelo esta aldeia segue" e a lista de membros do grupo. Sem modelo
  // a aldeia nao concorre por Recrutamento (consumo 0), e nao um chute que inventaria demanda.
  async function bndLerModelos(cen) {
    const tpls = (config.recruit && config.recruit.templates) || {};
    const ids = Object.keys(tpls);
    for (let i = 0; i < ids.length; i++) {
      const t = tpls[ids[i]];
      if (!t || !t.grupo) continue;
      try {
        const membros = await getVillagesInGroup(t.grupo);
        membros.forEach((m) => {
          const v = cen[String(m.vid)];
          if (v && !v.alvos) { v.alvos = t.targets || {}; v.tpl = t.name || ids[i]; }
        });
      } catch (e) {
        pushLog('Bandeiras: nao li o grupo do modelo "' + (t.name || ids[i]) + '" ('
          + (e.message || e) + ') - essas aldeias ficam sem conta de recrutamento.', 'err', 'flags');
      }
      await sleep(150);
    }
    // `overview_villages` guarda o ULTIMO grupo lido pra conta inteira: sair daqui com o filtro
    // de um modelo ligado faria o proximo modulo que lesse sem `group=` enxergar so aquele
    // pedaco - sem erro e sem log. Devolve pro 0.
    try {
      await fetch('/game.php?village=' + CUR_VID
        + '&screen=overview_villages&mode=combined&group=0&page=-1', { credentials: 'include' });
    } catch (e) { pushLog('Bandeiras: nao consegui devolver o filtro de grupo pro 0.', 'err', 'flags'); }
    return cen;
  }

  // ---------- conta ----------

  // Producao dos TRES predios, ja no ritmo real do mundo e SEM a bandeira. Sem a bandeira de
  // proposito: e a base sobre a qual a bandeira vai render. Somar a bandeira atual aqui faria a
  // aldeia que ja tem 14% parecer mais valiosa so por ja estar bem servida.
  function bndProducaoBase(v, fator) {
    return ((CPL_PROD[v.mw] || 0) + (CPL_PROD[v.ms] || 0) + (CPL_PROD[v.mi] || 0)) * fator;
  }

  // Quanto recurso por hora a aldeia consegue TRANSFORMAR em tropa, com quartel, estabulo e
  // oficina trabalhando em paralelo (sao tres filas independentes). Sem bandeira, pelo mesmo
  // motivo de cima.
  //
  // Cada fila rende `custo_do_lote / tempo_do_lote` com o lote na proporcao do modelo de tropas -
  // e nao a media simples por unidade, que daria o mesmo peso a um lanceiro e a uma cavalaria.
  function bndConsumo(v, cal) {
    const alvos = v.alvos; if (!alvos) return 0;
    const fila = { bar: { c: 0, t: 0 }, sta: { c: 0, t: 0 }, gar: { c: 0, t: 0 } };
    Object.keys(alvos).forEach((u) => {
      const n = alvos[u] || 0; if (n <= 0) return;
      const pr = BND_PREDIO[u]; if (!pr) return;
      const nivel = v[pr] || 0; if (nivel <= 0) return;      // predio que nao existe nao produz
      const custo = cal.custo[u], base = cal.base[u];
      if (!custo || !base) return;
      fila[pr].c += n * (custo.w + custo.s + custo.i);
      fila[pr].t += n * base * cal.escala * Math.pow(BND_POR_NIVEL, nivel);
    });
    let total = 0;
    ['bar', 'sta', 'gar'].forEach((k) => { if (fila[k].t > 0) total += (fila[k].c / fila[k].t) * 3600; });
    return total;
  }

  function bndCustoPorPop(alvos, cal) {
    let c = 0, p = 0;
    Object.keys(alvos || {}).forEach((u) => {
      const n = alvos[u] || 0; if (n <= 0 || !cal.custo[u] || !cal.pop[u]) return;
      c += n * (cal.custo[u].w + cal.custo[u].s + cal.custo[u].i);
      p += n * cal.pop[u];
    });
    return p > 0 ? c / p : 120;
  }

  // Ganho, em recurso/hora, de por uma bandeira de `pct` desse tipo nesta aldeia.
  //
  // Recurso e direto: multiplica a producao dos predios, e vale pra sempre.
  //
  // Recrutamento tem DOIS tetos, e e por causa deles que nao precisa de limiar nenhum:
  //   1. o recurso que entra. Acelerar uma fila que ja fica esperando recurso nao produz nada - por
  //      isso `min(consumo, entrada)`, e nao `pct x consumo`.
  //   2. o espaco na fazenda. Quando enche, a fila para e a bandeira passa a valer zero. A janela
  //      `horas_ate_encher / horizonte` faz o valor decair sozinho conforme a aldeia se aproxima do
  //      teto - que e a regra "aldeia pronta nao precisa de recrutamento", so que continua em vez
  //      de degrau.
  function bndGanho(v, tipo, pct) {
    if (!pct) return 0;
    if (tipo === 1) return v.prod * pct / 100;
    if (tipo !== 2) return 0;
    if (!v.consumo || v.livre <= 0) return 0;
    const antes = Math.min(v.consumo, v.entrada);
    const depois = Math.min(v.consumo * (1 + pct / 100), v.entrada);
    return Math.max(0, depois - antes) * v.janela;
  }

  function bndMotivo(v, tipo) {
    if (tipo === 1) {
      if (v.livre <= 0) return 'fazenda no teto - recrutar nao anda, o valor esta todo na producao';
      if (!v.consumo) return (v.alvos ? 'sem quartel/estabulo/oficina' : 'sem modelo de tropas') + ' - so a producao rende aqui';
      if (v.janela < 0.35) return 'fazenda quase cheia (' + Math.round(v.horasEncher) + 'h pra encher) - a de recrutamento renderia pouco tempo';
      return 'produz ' + fmtN(Math.round(v.prod)) + '/h, mais do que a de recrutamento renderia';
    }
    if (tipo === 2) {
      if (v.consumo > v.entrada) return 'os predios consomem mais do que entra, mas ainda e o melhor uso aqui';
      return 'estabulo ' + v.sta + ', quartel ' + v.bar + ', ' + fmtN(v.livre) + ' de fazenda livre ('
        + (v.horasEncher > 48 ? Math.round(v.horasEncher / 24) + ' dias' : Math.round(v.horasEncher) + 'h') + ' pra encher)';
    }
    return '';
  }

  // ---------- plano ----------

  // Guloso, e guloso basta. Como todo ganho tem a forma `base x pct`, a atribuicao otima de um
  // tipo so e ordenar os dois lados e casar (desigualdade do rearranjo). Com dois tipos disputando
  // a mesma aldeia, pegar sempre o par de maior ganho chega no mesmo lugar nos dados reais e cabe
  // numa tela que o usuario consegue conferir linha a linha - que era o pedido.
  function bndPlanejar(cen, estoque) {
    // Pool = o que esta LIVRE mais o que ja esta atribuido: trocar devolve a antiga na hora, entao
    // toda bandeira em uso tambem esta em jogo. Ignorar isso travaria o plano nas sobras.
    const pool = { 1: [], 2: [] };
    [1, 2].forEach((t) => {
      const niveis = estoque[t] || {};
      Object.keys(niveis).forEach((n) => {
        for (let k = 0; k < niveis[n]; k++) pool[t].push(bndPctDoNivel(t, +n));
      });
    });
    const vilas = Object.keys(cen).map((k) => cen[k]);
    vilas.forEach((v) => { if (v.tipo === 1 || v.tipo === 2) pool[v.tipo].push(v.pct); });
    pool[1].sort((a, b) => b - a); pool[2].sort((a, b) => b - a);

    const ordem = vilas.slice().sort((a, b) => {
      const ma = Math.max(bndGanho(a, 1, 1), bndGanho(a, 2, 1));
      const mb = Math.max(bndGanho(b, 1, 1), bndGanho(b, 2, 1));
      return mb - ma;
    });
    let i1 = 0, i2 = 0;
    ordem.forEach((v) => {
      const g1 = i1 < pool[1].length ? bndGanho(v, 1, pool[1][i1]) : -1;
      const g2 = i2 < pool[2].length ? bndGanho(v, 2, pool[2][i2]) : -1;
      // Bandeira acabou pra esta aldeia. Zerar os campos aqui e nao deixar undefined: a tela soma
      // `ganhoHoje` de todas, e um undefined no meio vira NaN e apaga o resumo inteiro.
      if (g1 < 0 && g2 < 0) {
        v.novoTipo = 0; v.novoPct = 0; v.ganho = 0;
        v.ganhoHoje = bndGanho(v, v.tipo, v.pct); v.delta = 0; v.muda = false; v.motivo = 'acabou bandeira pra esta aldeia';
        return;
      }
      if (g1 >= g2) { v.novoTipo = 1; v.novoPct = pool[1][i1++]; }
      else { v.novoTipo = 2; v.novoPct = pool[2][i2++]; }
      v.ganho = bndGanho(v, v.novoTipo, v.novoPct);
      v.ganhoHoje = bndGanho(v, v.tipo, v.pct);
      v.delta = v.ganho - v.ganhoHoje;
      v.muda = (v.novoTipo !== v.tipo || v.novoPct !== v.pct);
      v.motivo = bndMotivo(v, v.novoTipo);
    });
    return vilas;
  }

  // Nivel -> porcentagem. Recurso e Recrutamento tem escadas diferentes, entao a tabela e por tipo.
  // Lida da tela de bandeiras uma vez e guardada; o padrao abaixo e o do br143 e serve de rede.
  const BND_ESCADA = { 1: [0, 4, 6, 8, 10, 12, 14, 16, 17, 18], 2: [0, 6, 8, 10, 12, 14, 16, 18, 19, 20] };
  function bndPctDoNivel(tipo, nivel) {
    const e = (_bndEscada && _bndEscada[tipo]) || BND_ESCADA[tipo] || [];
    return e[nivel] || 0;
  }
  function bndNivelDoPct(tipo, pct) {
    const e = (_bndEscada && _bndEscada[tipo]) || BND_ESCADA[tipo] || [];
    for (let i = 1; i < e.length; i++) if (e[i] === pct) return i;
    return 0;
  }

  // A escada de porcentagens (nivel -> %) sai do PROPRIO CENSO: cada aldeia com bandeira entrega
  // um par (nivel, %) que veio do servidor. Tentei ler da grade de `screen=flags` e ela vem VAZIA
  // no HTML - o `data-title` de cada quadradinho so existe depois que o JS do jogo roda. Aquilo
  // devolvia a escada inteira ZERADA, e zero em `pct` faz TODO ganho virar 0: o plano sairia
  // dizendo "manter" pras 80 aldeias, sem erro nenhum na tela. O que o censo nao cobrir (nivel
  // que ninguem esta usando hoje) cai na tabela padrao.
  function bndEscada(cen) {
    const out = { 1: BND_ESCADA[1].slice(), 2: BND_ESCADA[2].slice() };
    Object.keys(cen).forEach((k) => {
      const v = cen[k];
      if ((v.tipo !== 1 && v.tipo !== 2) || !v.nivel || !v.pct) return;
      out[v.tipo][v.nivel] = v.pct;
    });
    return out;
  }

  // ---------- execucao ----------

  // A ARMADILHA QUE QUASE PASSOU: o plano escolhe bandeiras do POOL (as livres MAIS as que ja
  // estao em uso), porque trocar devolve a antiga na hora e portanto tudo esta em jogo. So que o
  // jogo so deixa atribuir o que esta LIVRE agora. Nesta conta ha 0 bandeira de Recurso livre -
  // as 56 estao todas em aldeias - entao a melhor sugestao da tela ("001 vai de 4% pra 14%")
  // falharia sozinha: aquele 14% so existe preso em outra aldeia.
  //
  // O plano inteiro CONTINUA valido: ele e uma redistribuicao, e so precisa ser executado em
  // CADEIA. Alguem que sai de Recurso pra Recrutamento (que tem sobra) libera um Recurso, que
  // libera o proximo, e assim por diante. Por isso a execucao e um laco que repassa a lista ate
  // parar de progredir, em vez de uma varredura unica.
  // Roda a cadeia A SECO e marca quem ela realmente alcanca. Sem isso a tela prometeria 60 trocas
  // e entregaria 38: as que dependem de uma bandeira presa numa aldeia em cooldown de 24h ficam
  // pra proxima rodada, e o usuario so descobriria clicando e vendo linhas que nao mexem.
  function bndSimularCadeia(vilas, livre) {
    const est = JSON.parse(JSON.stringify(livre || {}));
    const feito = {};
    const tem = (t, p) => { const n = bndNivelDoPct(t, p); return n > 0 && ((est[t] || {})[n] || 0) > 0; };
    for (;;) {
      const fila = vilas.filter((v) => v.muda && !v.cooldown && !feito[v.vid] && v.novoTipo && tem(v.novoTipo, v.novoPct))
        .sort((a2, b2) => (b2.delta || 0) - (a2.delta || 0));
      if (!fila.length) break;
      const v = fila[0];
      const nN = bndNivelDoPct(v.novoTipo, v.novoPct);
      est[v.novoTipo][nN]--;
      const nA = v.tipo ? bndNivelDoPct(v.tipo, v.pct) : 0;
      if (nA) { est[v.tipo] = est[v.tipo] || {}; est[v.tipo][nA] = (est[v.tipo][nA] || 0) + 1; }
      feito[v.vid] = 1;
    }
    vilas.forEach((v) => { v.alcancavel = !!feito[v.vid]; });
    return Object.keys(feito).length;
  }

  function bndPronta(v) {
    if (!v.muda || v.cooldown || !v.novoTipo) return false;
    const n = bndNivelDoPct(v.novoTipo, v.novoPct);
    return n > 0 && (((_bndLivre || {})[v.novoTipo] || {})[n] || 0) > 0;
  }

  // Move a contabilidade do estoque depois de uma troca: a nova sai de circulacao e a antiga
  // volta. Sem isso o laco da cadeia nao enxerga que acabou de destravar a proxima aldeia.
  function bndContabilizar(tipoAntigo, pctAntigo, tipoNovo, pctNovo) {
    if (!_bndLivre) return;
    const nN = bndNivelDoPct(tipoNovo, pctNovo);
    if (nN) { _bndLivre[tipoNovo] = _bndLivre[tipoNovo] || {}; _bndLivre[tipoNovo][nN] = Math.max(0, (_bndLivre[tipoNovo][nN] || 0) - 1); }
    const nA = tipoAntigo ? bndNivelDoPct(tipoAntigo, pctAntigo) : 0;
    if (nA) { _bndLivre[tipoAntigo] = _bndLivre[tipoAntigo] || {}; _bndLivre[tipoAntigo][nA] = (_bndLivre[tipoAntigo][nA] || 0) + 1; }
  }


  // Atribuir e um POST so: `screen=flags&ajaxaction=assign_flag` com flag_type, level e village_id.
  // Nao existe "remover antes" - atribuir por cima ja devolve a antiga pro estoque.
  async function bndAplicar(vid, tipo, nivel) {
    const body = 'flag_type=' + tipo + '&level=' + nivel + '&village_id=' + vid + '&h=' + CSRF;
    const r = await fetch('/game.php?village=' + vid + '&screen=flags&ajaxaction=assign_flag&h=' + CSRF, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: body
    });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) { /* resposta nao-JSON cai no erro abaixo */ }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    // O jogo responde 200 com {error:"..."} quando a aldeia esta em cooldown. Tratar como sucesso
    // seria pintar de verde uma troca que nao aconteceu.
    if (j && j.error) throw new Error(String(j.error).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
    if (!j) throw new Error('o jogo respondeu algo que nao e JSON (' + txt.length + ' bytes)');
    return j;
  }

  // ---------- orquestracao ----------

  async function bndAnalisar() {
    if (_bndCarregando) return;
    _bndCarregando = true; _bndErr = null;
    const btn = document.getElementById('twmgr-bnd-ler');
    if (btn) { btn.disabled = true; btn.textContent = 'lendo…'; }
    try {
      const cen = await bndLerCenso();
      await bndLerAldeias(cen);
      await bndLerModelos(cen);
      _bndEscada = bndEscada(cen);

      // Estoque LIVRE por tipo e nivel. O HTML de screen=flags vem com a grade VAZIA - quem
      // preenche e o JS do jogo. Entao o numero sai do literal `setFlagCounts({...})`, nao do DOM.
      const htmlFlags = await fetch('/game.php?village=' + CUR_VID + '&screen=flags', { credentials: 'include' }).then((r) => r.text());
      const mFlags = htmlFlags.match(/setFlagCounts\s*\(\s*(\{[\s\S]*?\})\s*\)/);
      if (!mFlags) throw new Error('nao achei o inventario de bandeiras na tela');
      const estoque = {};
      const cru = JSON.parse(mFlags[1]);
      Object.keys(cru).forEach((t) => {
        estoque[t] = {};
        Object.keys(cru[t]).forEach((n) => { estoque[t][n] = parseInt(cru[t][n], 10) || 0; });
      });

      // Calibragem em aldeias com QUARTEL ALTO: nivel baixo tem tempo grande e arredondamento do
      // relogio da tela pesa mais (1s em 159 e 0,6%; 1s em 900 tambem, mas o nivel alto e o que
      // domina o consumo da conta).
      const flagsPct = {};
      Object.keys(cen).forEach((k) => { if (cen[k].tipo === 2) flagsPct[k] = cen[k].pct; });
      const amostra = Object.keys(cen)
        .filter((k) => (cen[k].bar || 0) >= 15)
        .sort((a, b) => (cen[b].bar || 0) - (cen[a].bar || 0))
        .slice(0, BND_AMOSTRA_CALIB);
      const cal = await bndCalibrar(amostra, flagsPct, cen);

      // Fator de producao do mundo: emprestado da Cunhagem, medido e nao chutado (ver cplFatorMundo).
      const fator = cplFatorMundo();
      const extra = cplEntradaExtra();
      let capTot = 0;
      Object.keys(cen).forEach((k) => { capTot += cen[k].cap || 0; });
      const H = Math.max(1, parseFloat(bndCfg().horizonte) || BND_HORIZONTE_PADRAO);

      Object.keys(cen).forEach((k) => {
        const v = cen[k];
        v.prod = bndProducaoBase(v, fator);
        v.consumo = bndConsumo(v, cal);
        v.livre = Math.max(0, (v.popMax || 0) - (v.pop || 0));
        // Saque e coleta repartidos pela CAPACIDADE de armazem, o mesmo proxy que a Cunhagem usa -
        // aldeia grande farma mais, e nao ha numero por aldeia em lugar nenhum do jogo.
        const fatia = (capTot > 0 && extra.porHora > 0) ? extra.porHora * ((v.cap || 0) / capTot) : 0;
        v.entrada = v.prod + fatia;
        const thr = Math.min(v.consumo, v.entrada);
        v.horasEncher = thr > 0 ? (v.livre * bndCustoPorPop(v.alvos, cal)) / thr : 0;
        v.janela = v.livre <= 0 ? 0 : Math.min(1, v.horasEncher / H);
      });

      _bndLivre = JSON.parse(JSON.stringify(estoque));
      const vilas = bndPlanejar(cen, estoque);
      const alcanca = bndSimularCadeia(vilas, _bndLivre);
      _bndDados = { vilas: vilas, estoque: estoque, cal: cal, fator: fator, horizonte: H };
      _bndAt = Date.now();
      const mudam = vilas.filter((v) => v.muda).length;
      const ganho = vilas.reduce((a, v) => a + Math.max(0, v.delta || 0), 0);
      pushLog('Bandeiras: ' + vilas.length + ' aldeias lidas, ' + mudam + ' com bandeira melhor ('
        + fmtN(Math.round(ganho * 24)) + ' recursos/dia) - ' + alcanca + ' dao pra trocar nesta rodada.',
        'ok', 'flags');
    } catch (e) {
      _bndErr = e.message || String(e);
      pushLog('Bandeiras: a leitura falhou - ' + _bndErr, 'err', 'flags');
    } finally {
      _bndCarregando = false;
      if (btn) { btn.disabled = false; btn.textContent = '↻ Analisar'; }
      bndRender();
    }
  }

  // ---------- tela ----------

  function bndRender() {
    const box = document.getElementById('twmgr-bnd-corpo'); if (!box) return;
    if (_bndCarregando) { box.innerHTML = '<div style="font-size:11px;color:#8a7d6d;padding:8px">Lendo as aldeias…</div>'; return; }
    if (_bndErr) { box.innerHTML = '<div style="font-size:11px;color:#b03030;padding:8px">' + _bndErr + '</div>'; return; }
    if (!_bndDados) {
      box.innerHTML = '<div style="font-size:11px;color:#8a7d6d;padding:8px">Clique em <b>Analisar</b> - custa 6 requisicoes e nao muda nada sozinho.</div>';
      return;
    }
    const D = _bndDados;
    const mudam = D.vilas.filter((v) => v.muda);
    const ganhoDia = D.vilas.reduce((a, v) => a + Math.max(0, v.delta || 0), 0) * 24;
    const travadas = mudam.filter((v) => v.cooldown).length;
    const hojeH = D.vilas.reduce((a, v) => a + (v.ganhoHoje || 0), 0);
    const agora = mudam.filter((v) => v.alcancavel).length;
    const esperam = mudam.length - agora;
    const novoH = D.vilas.reduce((a, v) => a + (v.ganho || 0), 0);

    // Contador dos tipos que o MVP nao mexe - o usuario pediu pra ver Ataque/Defesa sem que o
    // modulo decida por ele.
    const outras = {};
    D.vilas.forEach((v) => { if (v.tipo && v.tipo !== 1 && v.tipo !== 2) outras[v.tipo] = (outras[v.tipo] || 0) + 1; });
    const estOutras = Object.keys(D.estoque).filter((t) => +t !== 1 && +t !== 2).map((t) => {
      let n = 0; Object.keys(D.estoque[t]).forEach((k) => { n += D.estoque[t][k]; });
      return { t: +t, n: n };
    }).filter((x) => x.n > 0);

    const linhas = D.vilas.slice().sort((a, b) => (b.delta || 0) - (a.delta || 0)).map((v, i) => {
      const de = v.tipo ? (BND_TIPO[v.tipo] + ' ' + v.pct + '%') : '<i style="color:#b03030">sem bandeira</i>';
      const para = v.novoTipo ? (BND_TIPO[v.novoTipo] + ' ' + v.novoPct + '%') : '—';
      const igual = !v.muda;
      const nivel = v.novoTipo ? bndNivelDoPct(v.novoTipo, v.novoPct) : 0;
      return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '"' + (igual ? ' style="opacity:.5"' : '') + '>' +
        '<td style="white-space:nowrap">' + v.nome + ' <span style="color:#8a7d6d">' + v.coord + '</span></td>' +
        '<td style="white-space:nowrap">' + de + '</td>' +
        '<td style="white-space:nowrap"><b>' + (igual ? '<span style="color:#6f6153">manter</span>' : para) + '</b></td>' +
        '<td style="font-variant-numeric:tabular-nums;white-space:nowrap;color:' + (v.delta > 0 ? '#2e7d3a' : '#8a7d6d') + '">' +
          (v.delta > 0 ? '+' + fmtN(Math.round(v.delta * 24)) + '/dia' : '—') + '</td>' +
        '<td style="font-size:9px;color:#6f6153">' + (v.motivo || '') + '</td>' +
        '<td style="width:64px">' + (igual ? '' : (v.cooldown
            ? '<span title="essa aldeia trocou de bandeira nas ultimas 24h" style="font-size:9px;color:#a2643a">⏳ 24h</span>'
            : (bndPronta(v)
              ? '<button class="twmgr-btn twmgr-ghost twmgr-bnd-go" data-vid="' + v.vid + '" data-tipo="' + v.novoTipo
                + '" data-nivel="' + nivel + '" style="padding:2px 8px;font-size:10px">aplicar</button>'
              : (v.alcancavel
                ? '<span title="a bandeira que ela quer esta em outra aldeia que troca antes. O botao de cima resolve na ordem certa." style="font-size:9px;color:#6f6153">na fila</span>'
                : '<span title="a bandeira que ela quer esta presa numa aldeia em cooldown de 24h. Rode de novo amanha." style="font-size:9px;color:#a2643a">⏳ proxima rodada</span>')))) + '</td>' +
      '</tr>';
    }).join('');

    box.innerHTML =
      '<div style="border:1px solid #e6dcc9;background:#fffdf8;border-radius:6px;padding:7px;margin-bottom:6px">' +
        '<b style="font-size:14px;color:' + (ganhoDia > 0 ? '#2e7d3a' : '#6f6153') + '">' +
        (ganhoDia > 0 ? '+' + fmtN(Math.round(ganhoDia)) : '0') + '</b>' +
        '<span style="font-size:10px;color:#6f6153"> recursos/dia se arrumar tudo · ' +
        mudam.length + ' de ' + D.vilas.length + ' aldeias na bandeira errada</span><br>' +
        '<span style="font-size:10px;color:#8a7d6d">hoje as bandeiras rendem ' + fmtN(Math.round(hojeH)) +
        '/h; o plano rende ' + fmtN(Math.round(novoH)) + '/h.' +
        (travadas ? ' <b style="color:#a2643a">' + travadas + '</b> esperando o cooldown de 24h.' : '') + '</span>' +
        (esperam ? '<br><span style="font-size:10px;color:#a2643a">' + agora + ' dao pra trocar agora; <b>' + esperam
          + '</b> esperam uma aldeia liberar a bandeira que elas querem — rode de novo quando o cooldown vencer.</span>' : '') +
      '</div>' +
      (mudam.length ? '<div class="twmgr-row" style="margin-bottom:6px">' +
        '<button id="twmgr-bnd-todas" class="twmgr-btn twmgr-ghost" style="flex:1"'
        + (agora ? '' : ' disabled') + '>✓ Aplicar o plano (' + agora + ' aldeias, em cadeia)</button></div>' : '') +
      '<table class="twmgr-bld-tab" style="width:100%"><thead><tr>' +
        '<th>aldeia</th><th>hoje</th><th>sugerida</th><th style="width:82px">ganho</th><th>por que</th><th></th>' +
      '</tr></thead><tbody>' + linhas + '</tbody></table>' +
      '<div style="font-size:9px;color:#8a7d6d;margin-top:7px">' +
        'Producao da mina a <b>' + D.fator.toFixed(2).replace('.', ',') + '×</b> a tabela e tempo de recrutamento ' +
        'calibrado na sua conta — os dois medidos, nenhum chutado. Janela de comparacao: <b>' +
        D.horizonte + 'h</b> (Recurso vale pra sempre; recrutamento so ate a fazenda encher).' +
        (estOutras.length ? '<br>Parado na gaveta, fora do MVP: ' +
          estOutras.map((x) => '<b>' + x.n + '</b> de ' + (BND_TIPO[x.t] || x.t)).join(', ') +
          (Object.keys(outras).length ? ' · em uso hoje: ' +
            Object.keys(outras).map((t) => outras[t] + ' de ' + (BND_TIPO[t] || t)).join(', ') : '') : '') +
        '<br>Lido as ' + new Date(_bndAt).toLocaleTimeString('pt-BR') + '.' +
      '</div>';

    box.querySelectorAll('.twmgr-bnd-go').forEach((b) => {
      b.addEventListener('click', () => bndTrocar(b.getAttribute('data-vid'), +b.getAttribute('data-tipo'), +b.getAttribute('data-nivel'), b));
    });
    const todas = document.getElementById('twmgr-bnd-todas');
    if (todas) todas.addEventListener('click', bndAplicarTodas);
  }

  async function bndTrocar(vid, tipo, nivel, btn) {
    if (!tipo || !nivel) return;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    const v = (_bndDados ? _bndDados.vilas : []).filter((x) => String(x.vid) === String(vid))[0];
    try {
      await bndAplicar(vid, tipo, nivel);
      if (v) {
        bndContabilizar(v.tipo, v.pct, tipo, bndPctDoNivel(tipo, nivel));
        v.tipo = tipo; v.pct = bndPctDoNivel(tipo, nivel); v.muda = false; v.delta = 0; v.cooldown = true;
      }
      pushLog('Bandeiras: ' + ((v && v.nome) || vid) + ' recebeu ' + BND_TIPO[tipo] + ' '
        + bndPctDoNivel(tipo, nivel) + '%.', 'ok', 'flags');
      bndRender();
    } catch (e) {
      pushLog('Bandeiras: nao troquei a de ' + ((v && v.nome) || vid) + ' - ' + (e.message || e), 'err', 'flags');
      if (btn) { btn.disabled = false; btn.textContent = 'aplicar'; }
    }
  }

  // Aplica em CADEIA, sempre pegando primeiro o maior ganho que esteja destravado. Cada troca
  // devolve a bandeira antiga pro estoque e pode destravar outra aldeia, entao a lista e
  // repassada ate nao sair mais nada - nao da pra resolver numa varredura unica.
  //
  // Comecar pelo maior ganho tambem e o que torna a interrupcao segura: se o usuario fechar a aba
  // no meio, o que ja foi feito e a parte que mais valia, e nao um pedaco aleatorio.
  async function bndAplicarTodas() {
    if (!_bndDados) return;
    const alvo = _bndDados.vilas.filter((v) => v.muda && !v.cooldown && v.alcancavel);
    if (!alvo.length) return;
    const btn = document.getElementById('twmgr-bnd-todas');
    if (!window.confirm('Trocar a bandeira de ate ' + alvo.length + ' aldeias?'
      + String.fromCharCode(10, 10) + 'Cada uma fica 24h sem poder trocar de novo.')) return;
    let ok = 0, erro = 0, rodada = 0;
    for (;;) {
      const fila = _bndDados.vilas.filter(bndPronta).sort((a, b) => (b.delta || 0) - (a.delta || 0));
      if (!fila.length) break;
      rodada++;
      // So a PRIMEIRA de cada passada: aplicar a fila inteira usaria um estoque ja vencido, porque
      // cada troca muda o que esta livre pras seguintes.
      const v = fila[0];
      if (btn) btn.textContent = 'aplicando ' + (ok + 1) + '/' + alvo.length + '…';
      try {
        await bndAplicar(v.vid, v.novoTipo, bndNivelDoPct(v.novoTipo, v.novoPct));
        bndContabilizar(v.tipo, v.pct, v.novoTipo, v.novoPct);
        v.tipo = v.novoTipo; v.pct = v.novoPct; v.muda = false; v.delta = 0; v.cooldown = true;
        ok++;
      } catch (e) {
        erro++;
        // Marca como resolvida pra nao repetir a mesma falha pra sempre no laco.
        v.muda = false;
        pushLog('Bandeiras: ' + v.nome + ' nao trocou - ' + (e.message || e), 'err', 'flags');
      }
      await sleep(420);
    }
    const presas = _bndDados.vilas.filter((v) => v.muda && !v.cooldown).length;
    pushLog('Bandeiras: ' + ok + ' trocada(s)' + (erro ? ', ' + erro + ' com erro' : '')
      + (presas ? ', ' + presas + ' sem bandeira livre pra receber (a cadeia parou)' : '') + '.',
      ok ? 'ok' : 'err', 'flags');
    if (btn) btn.textContent = '✓ Aplicar o plano';
    bndRender();
  }

  function bndLigarControles() {
    const b = document.getElementById('twmgr-bnd-ler');
    if (b) b.addEventListener('click', bndAnalisar);
    const h = document.getElementById('twmgr-bnd-horizonte');
    if (h) {
      h.value = bndCfg().horizonte;
      h.addEventListener('change', () => {
        const n = Math.max(1, parseFloat(h.value) || BND_HORIZONTE_PADRAO);
        bndCfg().horizonte = n; save(); h.value = n;
        if (_bndDados) bndAnalisar();
      });
    }
  }
