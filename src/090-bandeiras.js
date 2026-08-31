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
  // ESCOPO: a disputa por valor e so entre Recurso e Recrutamento. O resto tem regra fixa.
  //   . MOEDA e INTOCAVEL. Aldeia com a bandeira de menor custo de moeda e a sede de cunhagem, e o
  //     modulo nunca mexe nela — o desconto vale mais que qualquer % de producao. Ordem do dono da
  //     conta, e a unica excecao dura daqui.
  //   . SAQUE e so SOBRA: entra quando acabou Recurso e Recrutamento, pra aldeia nao ficar sem
  //     bandeira nenhuma. Nao disputa por valor porque nesta conta ela nao paga (muita gente
  //     farmando, poucas barbaras).
  //   . ATAQUE, DEFESA, SORTE e POPULACAO so aparecem no contador, com a sugestao de fusao. Trocar
  //     pra Ataque quando sai um ataque grande e uma boa ideia, mas e outro ciclo de vida
  //     (temporario, por operacao) e entra depois.

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
  const BND_INTOCAVEL = 7;                   // Menores custos de moeda: o modulo NUNCA mexe (ver bndPlanejar)
  const BND_SOBRA = 8;                       // Capacidade de saque: so como ultimo recurso, quando acaba o resto
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

  // Motivo em uma frase, sempre comparando as DUAS opcoes na MESMA unidade.
  //
  // A primeira versao dizia "produz 5.544/h, mais do que a de recrutamento renderia". Aquilo
  // comparava a producao TOTAL da aldeia com o GANHO de uma bandeira - duas grandezas que nao se
  // comparam, do tamanho de dizer "essa aldeia tem 24.000 de fazenda, mais do que a bandeira
  // renderia". Quem lia via um numero grande e nao sabia de onde ele vinha.
  //
  // A frase certa diz quanto rende a escolhida, quanto renderia a perdedora, e POR QUE a
  // perdedora rende pouco - que e a unica parte que o usuario nao consegue deduzir sozinho.
  function bndMotivo(v) {
    if (!v.novoTipo) return 'acabou bandeira pra esta aldeia';
    const dia = (x) => fmtN(Math.round((x || 0) * 24));
    const cabeca = BND_TIPO[v.novoTipo] + ' ' + v.novoPct + '% rende ' + dia(v.ganho) + '/dia aqui';
    const contra = v.altTipo
      ? ('; ' + BND_TIPO[v.altTipo] + ' ' + v.altPct + '% renderia ' + dia(v.altGanho))
      : '';
    let porque = '';
    if (v.altTipo === 2) {
      // A perdedora foi a de recrutamento: explica qual dos tetos dela pesou.
      if (v.livre <= 0) porque = 'fazenda no teto, recrutar nao anda';
      else if (!v.alvos) porque = 'esta aldeia nao esta em nenhum modelo de tropas';
      else if (!v.consumo) porque = 'sem quartel, estabulo ou oficina pra recrutar';
      else if (v.consumo >= v.entrada) porque = 'os predios ja consomem tudo que entra, acelerar nao produz mais';
      else if (v.janela < 0.5) porque = 'a fazenda enche em ' + Math.round(v.horasEncher) + 'h e a de recrutamento para de valer ali';
      else porque = 'esta aldeia planta muito';
    } else if (v.altTipo === 1) {
      porque = 'estabulo ' + v.sta + ', ' + fmtN(v.livre) + ' de fazenda livre ('
        + (v.horasEncher > 48 ? Math.round(v.horasEncher / 24) + ' dias' : Math.round(v.horasEncher) + 'h') + ' pra encher)';
    }
    return cabeca + contra + (porque ? ' - ' + porque : '');
  }

  // Fusao: 3 do mesmo tipo E nivel viram 1 do nivel seguinte.
  //
  // NAO vale pra Recurso nem pra Recrutamento, e o usuario foi explicito: nao ha bandeira
  // sobrando. Fundir troca COBERTURA por nivel (3 aldeias servidas viram 1), e com 80 aldeias
  // disputando 89 bandeiras uteis isso e prejuizo. Nos tipos que ficam parados na gaveta e o
  // contrario: eles ja nao cobrem nada, entao subir de nivel e o unico uso que resta — juntar uma
  // de Ataque forte pra usar numa operacao, por exemplo.
  //
  // Isto e SUGESTAO. O modulo nao funde nada sozinho.
  function bndFusao(niveis) {
    const n = [0];
    for (let i = 1; i <= 9; i++) n[i] = parseInt((niveis || {})[i], 10) || 0;
    for (let i = 1; i < 9; i++) {
      const sobe = Math.floor(n[i] / 3);
      if (sobe > 0) { n[i] -= sobe * 3; n[i + 1] += sobe; }
    }
    return n;
  }
  function bndMelhorNivel(n) { for (let i = 9; i >= 1; i--) if ((n[i] || 0) > 0) return i; return 0; }

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
    // Saque entra so como SOBRA, fora da disputa por valor: o usuario mediu que nao paga (muita
    // gente farmando, poucas barbaras). Serve pra aldeia nao ficar SEM bandeira quando o Recurso
    // e o Recrutamento acabarem — nesse ponto qualquer bonus e melhor que nenhum.
    const sobra = [];
    const nsq = estoque[BND_SOBRA] || {};
    Object.keys(nsq).forEach((n) => { for (let k = 0; k < nsq[n]; k++) sobra.push(+n); });
    vilas.forEach((v) => { if (v.tipo === BND_SOBRA && v.nivel) sobra.push(v.nivel); });
    sobra.sort((a, b) => b - a);
    let iS = 0;

    const ordem = vilas.slice().sort((a, b) => {
      const ma = Math.max(bndGanho(a, 1, 1), bndGanho(a, 2, 1));
      const mb = Math.max(bndGanho(b, 1, 1), bndGanho(b, 2, 1));
      return mb - ma;
    });
    let i1 = 0, i2 = 0;
    ordem.forEach((v) => {
      // A BANDEIRA DE MOEDA E INTOCAVEL. Ela e a sede de cunhagem: o desconto no custo da moeda
      // vale muito mais que qualquer % de producao, e ela nao entra em conta nenhuma aqui. Ordem
      // do usuario, e a unica excecao dura do modulo.
      if (v.tipo === BND_INTOCAVEL) {
        v.novoTipo = v.tipo; v.novoPct = v.pct; v.altTipo = 0;
        v.ganho = 0; v.ganhoHoje = 0; v.delta = 0; v.muda = false; v.intocavel = true;
        v.motivo = 'bandeira de moeda — o modulo nunca mexe nesta aldeia';
        return;
      }
      const g1 = i1 < pool[1].length ? bndGanho(v, 1, pool[1][i1]) : -1;
      const g2 = i2 < pool[2].length ? bndGanho(v, 2, pool[2][i2]) : -1;
      // Bandeira acabou pra esta aldeia. Zerar os campos aqui e nao deixar undefined: a tela soma
      // `ganhoHoje` de todas, e um undefined no meio vira NaN e apaga o resumo inteiro.
      if (g1 < 0 && g2 < 0) {
        // Acabou Recurso e Recrutamento. Cai pra Saque em vez de deixar a aldeia pelada — o valor
        // nao entra na conta (nao ha modelo pra ele), entao o ganho fica zerado de proposito, e
        // nao inventado.
        v.ganhoHoje = bndGanho(v, v.tipo, v.pct); v.ganho = 0; v.delta = 0; v.altTipo = 0;
        if (iS < sobra.length && v.tipo !== BND_SOBRA) {
          v.novoTipo = BND_SOBRA; v.novoNivel = sobra[iS++]; v.novoPct = 0; v.muda = true;
          v.motivo = 'nao sobrou Recurso nem Recrutamento — Saque so pra nao ficar sem bandeira';
        } else {
          v.novoTipo = 0; v.novoPct = 0; v.muda = false;
          v.motivo = 'acabou bandeira pra esta aldeia';
        }
        return;
      }
      // Guarda a opcao que PERDEU antes de mexer nos indices: `pool[t][i]` depois do ++ ja e a
      // proxima bandeira da fila, e nao a que foi comparada.
      const p1 = i1 < pool[1].length ? pool[1][i1] : 0;
      const p2 = i2 < pool[2].length ? pool[2][i2] : 0;
      if (g1 >= g2) {
        v.novoTipo = 1; v.novoPct = pool[1][i1++];
        v.altTipo = p2 ? 2 : 0; v.altPct = p2; v.altGanho = Math.max(0, g2);
      } else {
        v.novoTipo = 2; v.novoPct = pool[2][i2++];
        v.altTipo = p1 ? 1 : 0; v.altPct = p1; v.altGanho = Math.max(0, g1);
      }
      v.ganho = bndGanho(v, v.novoTipo, v.novoPct);
      v.ganhoHoje = bndGanho(v, v.tipo, v.pct);
      v.delta = v.ganho - v.ganhoHoje;
      v.muda = (v.novoTipo !== v.tipo || v.novoPct !== v.pct);
      v.motivo = bndMotivo(v);
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
    const tem = (v) => { const n = bndNivelAlvo(v); return n > 0 && ((est[v.novoTipo] || {})[n] || 0) > 0; };
    for (;;) {
      const fila = vilas.filter((v) => v.muda && !v.cooldown && !feito[v.vid] && v.novoTipo && tem(v))
        .sort((a2, b2) => (b2.delta || 0) - (a2.delta || 0));
      if (!fila.length) break;
      const v = fila[0];
      const nN = bndNivelAlvo(v);
      est[v.novoTipo][nN]--;
      const nA = v.tipo ? v.nivel : 0;
      if (nA) { est[v.tipo] = est[v.tipo] || {}; est[v.tipo][nA] = (est[v.tipo][nA] || 0) + 1; }
      feito[v.vid] = 1;
    }
    vilas.forEach((v) => { v.alcancavel = !!feito[v.vid]; });
    return Object.keys(feito).length;
  }

  // Nivel alvo da linha. Recurso e Recrutamento saem da escada de %; Saque nao tem % legivel na
  // tela, entao o plano ja guarda o nivel direto em `novoNivel`.
  function bndNivelAlvo(v) {
    if (v.novoNivel) return v.novoNivel;
    return bndNivelDoPct(v.novoTipo, v.novoPct);
  }

  function bndPronta(v) {
    if (!v.muda || v.cooldown || !v.novoTipo) return false;
    const n = bndNivelAlvo(v);
    return n > 0 && (((_bndLivre || {})[v.novoTipo] || {})[n] || 0) > 0;
  }

  // Move a contabilidade do estoque depois de uma troca: a nova sai de circulacao e a antiga
  // volta. Sem isso o laco da cadeia nao enxerga que acabou de destravar a proxima aldeia.
  // Fala em NIVEL e nao em %: a de Saque nao tem % legivel na tela, e o nivel da bandeira que a
  // aldeia ja usa vem direto do censo — deduzir da porcentagem sobraria um zero e o estoque
  // sairia do lugar sem ninguem perceber.
  function bndContabilizar(tipoAntigo, nivelAntigo, tipoNovo, nivelNovo) {
    if (!_bndLivre) return;
    if (nivelNovo) {
      _bndLivre[tipoNovo] = _bndLivre[tipoNovo] || {};
      _bndLivre[tipoNovo][nivelNovo] = Math.max(0, (_bndLivre[tipoNovo][nivelNovo] || 0) - 1);
    }
    if (tipoAntigo && nivelAntigo) {
      _bndLivre[tipoAntigo] = _bndLivre[tipoAntigo] || {};
      _bndLivre[tipoAntigo][nivelAntigo] = (_bndLivre[tipoAntigo][nivelAntigo] || 0) + 1;
    }
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

  // A tabela padrao do painel (.twmgr-bld-tab) e `table-layout:fixed` com `nowrap` + ellipsis em
  // toda celula — desenhada pra caber em painel estreito. Aqui ela servia mal: a coluna "por que" e
  // uma frase inteira e saia CORTADA justamente na parte que explica a decisao, que e a razao de a
  // coluna existir. E as ~54 linhas "manter" ocupavam metade da tela sem oferecer acao nenhuma.
  //
  // Trocada por cartoes agrupados por SITUACAO. Cartao quebra linha, entao a frase cabe inteira em
  // qualquer largura; e o agrupamento poe na frente o unico grupo onde ha o que fazer, com o resto
  // recolhido.
  function bndCss() {
    if (document.getElementById('twmgr-bnd-css')) return;
    const st = document.createElement('style'); st.id = 'twmgr-bnd-css';
    st.textContent = [
      '.bnd-hero{border:1px solid #e6dcc9;background:linear-gradient(180deg,#fffdf8,#fbf6ec);border-radius:8px;padding:9px 10px;margin-bottom:7px}',
      '.bnd-hero-n{font-size:19px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}',
      '.bnd-hero-l{font-size:10px;color:#6f6153;margin-top:1px}',
      '.bnd-hero-b{display:flex;gap:14px;margin-top:7px;padding-top:7px;border-top:1px solid #ece4d8;flex-wrap:wrap}',
      '.bnd-kpi{font-size:9px;color:#8a7d6d;line-height:1.3}',
      '.bnd-kpi b{display:block;font-size:12px;color:#463b30;font-variant-numeric:tabular-nums;font-weight:600}',
      '.bnd-grp{margin-top:8px}',
      '.bnd-grp-h{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;padding:3px 2px;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a7d6d}',
      '.bnd-grp-h:hover{color:#6f6153}',
      '.bnd-grp-n{background:#efe7da;color:#6f6153;border-radius:9px;padding:0 6px;font-size:9px;letter-spacing:0;font-weight:600}',
      '.bnd-ar{font-size:8px;width:8px;display:inline-block}',
      '.bnd-grp-h.on-go{color:#2e7d3a}.bnd-grp-h.on-go .bnd-grp-n{background:#dcefdc;color:#2e7d3a}',
      '.bnd-grp-h.on-wait{color:#a2643a}.bnd-grp-h.on-wait .bnd-grp-n{background:#f6e6d5;color:#a2643a}',
      '.bnd-card{background:#fff;border:1px solid #ece4d8;border-radius:7px;padding:6px 8px;margin-bottom:4px}',
      '.bnd-card.is-ok{background:#fbfaf7;border-color:#f0e9dd}',
      '.bnd-r1{display:flex;align-items:baseline;gap:6px}',
      '.bnd-nome{font-size:11px;font-weight:600;color:#463b30;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.bnd-nome em{font-style:normal;font-weight:400;color:#a89b8a;font-size:9px;margin-left:4px}',
      '.bnd-ganho{font-size:11px;font-weight:700;color:#2e7d3a;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.bnd-r2{display:flex;align-items:center;gap:5px;margin-top:4px;flex-wrap:wrap}',
      '.bnd-chip{font-size:9px;padding:1px 6px;border-radius:9px;border:1px solid transparent;white-space:nowrap}',
      '.bnd-t1{background:#eef5e6;border-color:#d6e6c4;color:#4a6b2f}',
      '.bnd-t2{background:#e8eff7;border-color:#c8dbeb;color:#2f5673}',
      '.bnd-t8{background:#f7f1e6;border-color:#e8dcc4;color:#7a6134}',
      '.bnd-t0{background:#fbeaea;border-color:#eecfcf;color:#a33}',
      '.bnd-tx{background:#f2efe9;border-color:#e4ded3;color:#6f6153}',
      '.bnd-seta{color:#b9ad9b;font-size:10px}',
      '.bnd-acao{margin-left:auto;white-space:nowrap}',
      '.bnd-tag{font-size:9px;white-space:nowrap}',
      '.bnd-pq{font-size:9px;color:#8a7d6d;line-height:1.4;margin-top:4px}',
      '.bnd-rodape{font-size:9px;color:#8a7d6d;line-height:1.45;margin-top:9px;padding-top:7px;border-top:1px solid #ece4d8}'
    ].join('');
    document.head.appendChild(st);
  }

  function bndChipCls(tipo) {
    if (tipo === 1 || tipo === 2 || tipo === 8) return 'bnd-t' + tipo;
    return tipo ? 'bnd-tx' : 'bnd-t0';
  }
  function bndRotulo(tipo, pct, nivel) {
    if (!tipo) return 'sem bandeira';
    return BND_TIPO[tipo] + ' ' + (pct ? pct + '%' : 'nv' + nivel);
  }

  function bndCartao(v) {
    const nivel = v.novoTipo ? bndNivelAlvo(v) : 0;
    let acao = '';
    if (v.intocavel) acao = '<span class="bnd-tag" style="color:#a2643a" title="ordem sua: o modulo nunca mexe na aldeia que estiver com a bandeira de moeda">&#128274; intocavel</span>';
    else if (!v.muda) acao = '';
    else if (v.cooldown) acao = '<span class="bnd-tag" style="color:#a2643a" title="essa aldeia trocou de bandeira nas ultimas 24h">&#9203; 24h</span>';
    else if (bndPronta(v)) acao = '<button class="twmgr-btn twmgr-ghost twmgr-bnd-go" data-vid="' + v.vid
      + '" data-tipo="' + v.novoTipo + '" data-nivel="' + nivel + '" style="padding:2px 9px;font-size:10px">aplicar</button>';
    else if (v.alcancavel) acao = '<span class="bnd-tag" style="color:#6f6153" title="a bandeira que ela quer esta em outra aldeia que troca antes — o botao de cima resolve na ordem certa">na fila</span>';
    else acao = '<span class="bnd-tag" style="color:#a2643a" title="a bandeira que ela quer esta presa numa aldeia em cooldown de 24h">&#9203; proxima rodada</span>';

    const chip = (t, pc, nv, forte) => '<span class="bnd-chip ' + bndChipCls(t) + '">'
      + (forte ? '<b>' : '') + bndRotulo(t, pc, nv) + (forte ? '</b>' : '') + '</span>';
    const transicao = v.muda
      ? (chip(v.tipo, v.pct, v.nivel) + '<span class="bnd-seta">&rarr;</span>' + chip(v.novoTipo, v.novoPct, nivel, 1))
      : (chip(v.tipo, v.pct, v.nivel) + '<span class="bnd-tag" style="color:#a89b8a">ja esta na melhor</span>');

    return '<div class="bnd-card' + (v.muda ? '' : ' is-ok') + '">' +
      '<div class="bnd-r1"><span class="bnd-nome">' + v.nome + '<em>' + v.coord + '</em></span>' +
        (v.delta > 0 ? '<span class="bnd-ganho">+' + fmtN(Math.round(v.delta * 24))
          + '<span style="font-weight:400;color:#8a7d6d">/dia</span></span>' : '') +
      '</div>' +
      '<div class="bnd-r2">' + transicao + '<span class="bnd-acao">' + acao + '</span></div>' +
      (v.motivo ? '<div class="bnd-pq">' + v.motivo + '</div>' : '') +
    '</div>';
  }

  // Aberto/fechado dos grupos: so na sessao. Nao merece ir pro config nem pro backup.
  const _bndAberto = { go: 1, wait: 1, ok: 0 };

  function bndGrupo(id, cls, titulo, lista) {
    if (!lista.length) return '';
    const aberto = !!_bndAberto[id];
    return '<div class="bnd-grp">' +
      '<div class="bnd-grp-h ' + cls + '" data-grp="' + id + '">' +
        '<span class="bnd-ar">' + (aberto ? '&#9662;' : '&#9656;') + '</span>' + titulo +
        '<span class="bnd-grp-n">' + lista.length + '</span>' +
      '</div>' +
      '<div id="twmgr-bnd-g-' + id + '"' + (aberto ? '' : ' style="display:none"') + '>' +
        lista.map(bndCartao).join('') +
      '</div>' +
    '</div>';
  }

  function bndRender() {
    const box = document.getElementById('twmgr-bnd-corpo'); if (!box) return;
    bndCss();
    if (_bndCarregando) { box.innerHTML = '<div style="font-size:11px;color:#8a7d6d;padding:8px">Lendo as aldeias&hellip;</div>'; return; }
    if (_bndErr) { box.innerHTML = '<div style="font-size:11px;color:#b03030;padding:8px">' + _bndErr + '</div>'; return; }
    if (!_bndDados) {
      box.innerHTML = '<div style="font-size:11px;color:#8a7d6d;padding:8px">Clique em <b>Analisar</b> &mdash; custa 6 requisi&ccedil;&otilde;es e n&atilde;o muda nada sozinho.</div>';
      return;
    }
    const D = _bndDados;
    const ord = D.vilas.slice().sort((a, b) => (b.delta || 0) - (a.delta || 0));
    const mudam = ord.filter((v) => v.muda);
    const prontas = mudam.filter((v) => !v.cooldown && v.alcancavel);
    const esperando = mudam.filter((v) => v.cooldown || !v.alcancavel);
    const certas = ord.filter((v) => !v.muda);
    const ganhoDia = ord.reduce((a, v) => a + Math.max(0, v.delta || 0), 0) * 24;
    const ganhoAgora = prontas.reduce((a, v) => a + Math.max(0, v.delta || 0), 0) * 24;
    const hojeH = ord.reduce((a, v) => a + (v.ganhoHoje || 0), 0);
    const novoH = ord.reduce((a, v) => a + (v.ganho || 0), 0);

    const outras = {};
    D.vilas.forEach((v) => { if (v.tipo && v.tipo !== 1 && v.tipo !== 2) outras[v.tipo] = (outras[v.tipo] || 0) + 1; });

    box.innerHTML =
      '<div class="bnd-hero">' +
        '<div class="bnd-hero-n" style="color:' + (ganhoDia > 0 ? '#2e7d3a' : '#6f6153') + '">' +
          (ganhoDia > 0 ? '+' + fmtN(Math.round(ganhoDia)) : '0') +
          '<span style="font-size:11px;font-weight:400;color:#8a7d6d"> recursos/dia</span></div>' +
        '<div class="bnd-hero-l">se todas as ' + mudam.length + ' aldeias fora do lugar forem arrumadas</div>' +
        '<div class="bnd-hero-b">' +
          '<div class="bnd-kpi"><b style="color:#2e7d3a">' + prontas.length + '</b>d&aacute; pra trocar agora</div>' +
          '<div class="bnd-kpi"><b style="color:#a2643a">' + esperando.length + '</b>esperando</div>' +
          '<div class="bnd-kpi"><b>' + certas.length + '</b>j&aacute; certas</div>' +
          '<div class="bnd-kpi"><b>' + fmtN(Math.round(hojeH)) + ' &rarr; ' + fmtN(Math.round(novoH)) + '</b>recursos/h hoje &rarr; no plano</div>' +
        '</div>' +
      '</div>' +
      (mudam.length ? '<div class="twmgr-row" style="margin-bottom:2px">' +
        '<button id="twmgr-bnd-todas" class="twmgr-btn twmgr-ghost" style="flex:1"' + (prontas.length ? '' : ' disabled') + '>' +
        (prontas.length
          ? '&#10003; Aplicar as ' + prontas.length + ' prontas &nbsp;<span style="color:#2e7d3a">+' + fmtN(Math.round(ganhoAgora)) + '/dia</span>'
          : 'Nenhuma pronta agora') +
        '</button></div>' : '') +
      (mudam.length && !prontas.length
        ? '<div style="font-size:9px;color:#a2643a;margin-bottom:2px">A cadeia n&atilde;o consegue come&ccedil;ar: toda bandeira que essas aldeias querem est&aacute; presa em alguma que trocou nas &uacute;ltimas 24h. Rode de novo quando o cooldown vencer.</div>'
        : '') +
      bndGrupo('go', 'on-go', 'D&aacute; pra trocar agora', prontas) +
      bndGrupo('wait', 'on-wait', 'Esperando liberar', esperando) +
      bndGrupo('ok', '', 'J&aacute; est&atilde;o na melhor', certas) +
      '<div class="bnd-rodape">' +
        'Produ&ccedil;&atilde;o da mina a <b>' + D.fator.toFixed(2).replace('.', ',') + '&times;</b> a tabela e tempo de ' +
        'recrutamento calibrado na sua conta &mdash; os dois medidos, nenhum chutado.<br>' +
        'Janela de compara&ccedil;&atilde;o <b>' + D.horizonte + 'h</b>: Recurso rende pra sempre, recrutamento s&oacute; at&eacute; a ' +
        'fazenda encher. Janela maior favorece Recurso.<br>' +
        'Lido &agrave;s ' + new Date(_bndAt).toLocaleTimeString('pt-BR') + '.' +
      '</div>';

    // Painel dos tipos que o modulo NAO decide. Contador e sugestao de fusao, nada mais — o usuario
    // quer decidir Ataque/Defesa na mao, por operacao, e Sorte/Populacao ele considera atoa. Fundir
    // aqui nao custa cobertura porque essas ja nao cobrem aldeia nenhuma.
    const gaveta = Object.keys(D.estoque).map((t) => +t)
      .filter((t) => t !== 1 && t !== 2)
      .map((t) => {
        const niveis = D.estoque[t] || {};
        let total = 0; Object.keys(niveis).forEach((k) => { total += niveis[k]; });
        const dep = bndFusao(niveis);
        // `niveis` vem com chave de texto ("1","2"...) do setFlagCounts; bndMelhorNivel indexa por
        // numero, entao a lista e remontada por posicao em vez de passar o objeto cru.
        const atual = [0].concat([1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => niveis[i] || 0));
        return { t: t, total: total, hoje: bndMelhorNivel(atual), depois: bndMelhorNivel(dep), emUso: outras[t] || 0 };
      }).filter((x) => x.total > 0 || x.emUso > 0)
      .sort((a, b) => (b.depois - b.hoje) - (a.depois - a.hoje) || b.total - a.total);
    if (gaveta.length) {
      const linhasG = gaveta.map((x, i) => '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">' +
        '<td>' + (BND_TIPO[x.t] || x.t) + (x.t === BND_INTOCAVEL
          ? ' <span title="o modulo nunca troca a bandeira de uma aldeia que esteja com esta" style="color:#a2643a">&#128274;</span>' : '') + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + x.total + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + (x.emUso || '&mdash;') + '</td>' +
        '<td>nv' + x.hoje + '</td>' +
        '<td>' + (x.depois > x.hoje
          ? '<b style="color:#2e7d3a">nv' + x.depois + '</b>'
          : '<span style="color:#a89b8a">&mdash;</span>') + '</td>' +
      '</tr>').join('');
      box.insertAdjacentHTML('beforeend',
        '<div class="bnd-grp"><div class="bnd-grp-h" data-grp="gav">'
        + '<span class="bnd-ar">' + (_bndAberto.gav ? '&#9662;' : '&#9656;') + '</span>Parado na gaveta'
        + '<span class="bnd-grp-n">' + gaveta.length + '</span></div>'
        + '<div id="twmgr-bnd-g-gav"' + (_bndAberto.gav ? '' : ' style="display:none"') + '>'
        + '<div style="font-size:9px;color:#8a7d6d;line-height:1.4;margin:2px 0 4px">O m&oacute;dulo n&atilde;o mexe nestas. '
        + 'Fundir junta <b>3 do mesmo n&iacute;vel em 1 do seguinte</b> &mdash; aqui n&atilde;o custa nada, porque elas j&aacute; n&atilde;o cobrem aldeia nenhuma. '
        + 'Em Recurso e Recrutamento custaria: trocaria cobertura por n&iacute;vel.</div>'
        + '<table class="twmgr-bld-tab" style="width:100%"><thead><tr><th>tipo</th><th style="width:46px">tenho</th>'
        + '<th style="width:52px">em uso</th><th style="width:60px">melhor</th><th style="width:76px">fundindo</th>'
        + '</tr></thead><tbody>' + linhasG + '</tbody></table></div></div>');
    }

    box.querySelectorAll('.bnd-grp-h').forEach((h) => {
      h.addEventListener('click', () => {
        const id = h.getAttribute('data-grp');
        _bndAberto[id] = _bndAberto[id] ? 0 : 1;
        const corpo = document.getElementById('twmgr-bnd-g-' + id);
        if (corpo) corpo.style.display = _bndAberto[id] ? '' : 'none';
        const ar = h.querySelector('.bnd-ar');
        if (ar) ar.innerHTML = _bndAberto[id] ? '&#9662;' : '&#9656;';
      });
    });

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
        bndContabilizar(v.tipo, v.nivel, tipo, nivel);
        v.tipo = tipo; v.nivel = nivel; v.pct = bndPctDoNivel(tipo, nivel);
        v.muda = false; v.delta = 0; v.cooldown = true;
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
        const nAlvo = bndNivelAlvo(v);
        await bndAplicar(v.vid, v.novoTipo, nAlvo);
        bndContabilizar(v.tipo, v.nivel, v.novoTipo, nAlvo);
        v.tipo = v.novoTipo; v.nivel = nAlvo; v.pct = v.novoPct;
        v.muda = false; v.delta = 0; v.cooldown = true;
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
