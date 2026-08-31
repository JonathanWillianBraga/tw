  // ==================== PLANEJADOR DA CUNHAGEM (cpl*) ====================
  // Responde, ANTES e DURANTE a operacao, o que so se respondia em planilha: qual aldeia deve
  // ser a sede, quanto recurso chega na janela, quantas moedas e quantos NOBRES isso vira com e
  // sem a bandeira de desconto, e — a parte que mais importa — EM QUE MOMENTO usar cada pacote
  // de recurso do inventario.
  //
  // AS ARMADILHAS QUE SO APARECEM MEDINDO
  //
  //   · A SEDE nao e a aldeia central do mapa: e a que minimiza a distancia PONDERADA PELO
  //     EXCEDENTE. Perto de muita gente pobre vale menos que perto de poucos armazens cheios.
  //   · O GARGALO quase nunca e o recurso, e a FROTA. Medido nesta conta: 13,3M de producao em
  //     48h renderam +217 moedas, porque os mercadores ja saturavam. Projecao que ignora a
  //     ida-e-volta erra pra cima com folga.
  //   · O CUSTO DA MOEDA vem da Academia, nao de constante — a bandeira entra sozinha na conta.
  //   · O NOBRE encarece: o limite N custa `1+2+...+N` ACUMULADO. Dobrar moeda NAO dobra nobre.
  //   · O PACOTE de X% so rende se houver X% de espaco livre. Usado com armazem cheio, mais da
  //     metade evapora — medido: 32,9M perdidos contra 0,6M na ordem certa.

  const CPL_PROD = [0, 30, 35, 41, 47, 55, 64, 74, 86, 100, 117, 136, 158, 184, 214, 249, 289,
                    337, 391, 455, 530, 616, 717, 833, 969, 1127, 1311, 1524, 1772, 2061, 2397];
  const CPL_MIN_CAMPO = 3;       // minutos por campo do mercador
  // A TABELA ACIMA E A DO JOGO A VELOCIDADE 1, e ate a v11.246.0 o modulo somava ela CRUA. O br143
  // roda a producao a 2x, entao a projecao enxergava METADE do que as minas produzem — medido em
  // 4 aldeias, fator 2,00 cravado nas tres minas depois de descontar a bandeira.
  //
  // Nao da pra hardcodar 2: em outro mundo o fator e outro, e a constante errada mente calada. Entao
  // ele e MEDIDO na aldeia aberta, de graca: `game_data.village` ja traz `wood_prod` (recurso por
  // SEGUNDO, real) e `bonus.wood` (multiplicador FINAL da aldeia — bandeira e bonus permanente ja
  // embutidos). Dividindo o real pela tabela e pelo multiplicador sobra so o fator do mundo.
  function cplFatorMundo() {
    try {
      const v = (window.game_data || {}).village || {};
      const b = v.buildings || {}, bon = v.bonus || {};
      const fs = [];
      [['wood', 'wood_prod'], ['stone', 'stone_prod'], ['iron', 'iron_prod']].forEach((par) => {
        const base = CPL_PROD[Math.min(30, parseInt(b[par[0]], 10) || 0)] || 0;
        const real = (+v[par[1]] || 0) * 3600;
        // `bonus` traz SO o recurso que tem bonus: aldeia com +10% de madeira vem {wood:1.1} e
        // nada pra pedra. Ausente = 1, nao = zero.
        const mult = +bon[par[0]] || 1;
        if (base > 0 && real > 0) fs.push(real / (base * mult));
      });
      if (!fs.length) return 1;
      // Mediana das tres: um recurso com nivel ou bonus fora do padrao nao contamina o fator.
      fs.sort((a, b2) => a - b2);
      const f = fs[Math.floor(fs.length / 2)];
      // Fator implausivel = o game_data mudou de forma. Ai o conservador e NAO multiplicar, em vez
      // de inflar a projecao inteira com um numero que ninguem conferiu.
      return (f >= 0.5 && f <= 10) ? f : 1;
    } catch (e) { return 1; }
  }

  // MULTIPLICADOR POR ALDEIA. A bandeira de "Producao de recursos" multiplica os TRES predios
  // (bosque, poco e mina), e o jogo entrega o numero final em `game_data.village.bonus` — mas so
  // da aldeia ABERTA. Em massa, o pedaco da bandeira sai da visao geral de Pesquisa, que traz a
  // descricao ("6% Recursos") das 80 aldeias numa requisicao so.
  //
  // O QUE ISSO NAO PEGA: bonus PERMANENTE de aldeia (medi uma com +20% de ferro sozinho). Sao
  // poucas, e o erro fica pra BAIXO — o lado certo de errar numa projecao.
  async function cplLerBandeiraRecurso() {
    const out = {};
    try {
      // `group=0` FIXO: overview_villages e stateful por grupo no servidor (ver 040-tropas.js).
      const r = await fetch('/game.php?village=' + CUR_VID
        + '&screen=overview_villages&mode=tech&group=0&page=-1', { credentials: 'include' });
      const d = new DOMParser().parseFromString(await r.text(), 'text/html');
      d.querySelectorAll('td.flag_info').forEach((td) => {
        const tr = td.closest('tr'); if (!tr) return;
        const lbl = tr.querySelector('.quickedit-label');
        const coord = ((((lbl && lbl.textContent) || '')).match(/\d{1,3}\|\d{1,3}/) || [''])[0];
        if (!coord) return;
        // Classificar pelo TEXTO, nunca pelo icone: o `img src` daquela coluna e o NIVEL da
        // bandeira, nao o tipo. Quem le o icone conta 27 aldeias com Recurso onde ha 56.
        const t = (td.textContent || '').replace(/\s+/g, ' ');
        if (!/recursos/i.test(t)) return;   // so a de Recurso mexe em producao
        const p = parseInt((t.match(/(\d+)\s*%/) || [0, 0])[1], 10) || 0;
        if (p > 0) out[coord] = 1 + p / 100;
      });
    } catch (e) { /* sem bandeira: projecao sai conservadora, nunca inflada */ }
    return out;
  }

  const CPL_CARGA = 1000;        // capacidade de um mercador
  // Desperdicio aceitavel pra liberar um pacote. 3% parecia otimo numa medicao anterior, mas
  // ela foi feita com a conta em 59% de lotacao e outro destino, e nao generalizou: com 61% e
  // outra sede, 3% ENCALHAVA o +15%. Encalhar e 100% de desperdicio. Ver a rede la embaixo.
  const CPL_TOLERANCIA = 0.10;
  const CPL_PCTS = [30, 15, 10, 5, 2, 1];   // tamanhos de pacote, do maior pro menor

  let _cplDados = null, _cplAt = 0, _cplCarregando = false, _cplErr = null, _cplPlano = null;
  let _cplFator = 1;             // fator de producao do mundo, medido (ver cplFatorMundo)
  // Estado AO VIVO: alimentado pelo proprio ciclo da Cunhagem, sem requisicao extra.
  let _cplVivo = null;
  // Ultima leitura de lotacao, pro painel mostrar mesmo com tudo desligado.
  let _cplLot = null;

  function cplCfg() {
    const c = config.market;
    if (c.cplHoras == null) c.cplHoras = 48;
    if (c.cplAlvoPct == null) c.cplAlvoPct = CPL_ALVO_PADRAO;
    if (c.cplDesconto == null) c.cplDesconto = 44;      // % que a bandeira corta dos tres
    if (!c.cplInv) c.cplInv = { 1: 0, 2: 0, 5: 0, 10: 0, 15: 0, 30: 0 };
    CPL_PCTS.forEach((p) => { if (c.cplInv[p] == null) c.cplInv[p] = 0; });
    return c;
  }

  // ---------------------------------------------------------------------------------------
  // LEITURA — duas requisicoes, as duas de VISAO GERAL (uma por conta). Ler aldeia a aldeia
  // custaria 79 requisicoes e e o que torna projecao assim inviavel na pratica.
  async function cplLerAldeias() {
    const num = (s) => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=prod&page=-1', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const tb = doc.querySelector('#production_table') || doc.querySelector('table.overview_table');
    if (!tb) throw new Error('não achei a tabela de produção');
    const heads = Array.prototype.map.call(tb.querySelectorAll('th'), (t) => (t.textContent || '').trim());
    const iCom = heads.findIndex((h) => /Comerciantes/i.test(h));
    const V = {};
    tb.querySelectorAll('tr').forEach((tr) => {
      if (!tr.querySelector('.quickedit-vn[data-id]')) return;
      // `span.wood` e nao `.res.wood`: acima de 90% do armazem o jogo troca a classe por
      // `warn_90`, e filtrar por `.res` pularia justamente as aldeias cheias.
      const w = tr.querySelector('span.wood'), s = tr.querySelector('span.stone'), i = tr.querySelector('span.iron');
      if (!w || !s || !i) return;
      const tdRes = w.closest('td');
      const cap = tdRes && tdRes.nextElementSibling ? num(tdRes.nextElementSibling.textContent) : 0;
      if (!cap) return;
      const tds = tr.querySelectorAll('td');
      // "livres/total" — usa o TOTAL: mercador ocupado agora volta dentro da janela.
      const mc = (iCom >= 0 && tds[iCom]) ? (tds[iCom].textContent || '').match(/(\d+)\s*\/\s*(\d+)/) : null;
      const lbl = tr.querySelector('.quickedit-label');
      const nome = ((lbl && lbl.textContent) || '').replace(/\s+/g, ' ').trim();
      const coord = (nome.match(/\d{1,3}\|\d{1,3}/) || [''])[0];
      if (!coord) return;
      V[coord] = { coord: coord, nome: nome.replace(/\s*\(\d{1,3}\|\d{1,3}\).*$/, '').trim() || coord,
                   wood: num(w.textContent), stone: num(s.textContent), iron: num(i.textContent),
                   cap: cap, merc: mc ? (+mc[2]) * CPL_CARGA : 0, pw: 0, ps: 0, pi: 0, snob: null };
    });
    if (!Object.keys(V).length) throw new Error('nenhuma aldeia lida');
    // Niveis de mina -> producao/hora. As colunas saem do ICONE do cabecalho, nao de posicao
    // fixa: mundo com um edificio a mais deslocaria tudo e a conta sairia calada e errada.
    try {
      const r2 = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=buildings&page=-1', { credentials: 'include' });
      const d2 = new DOMParser().parseFromString(await r2.text(), 'text/html');
      const bt = d2.querySelector('#buildings_table') || d2.querySelector('table.overview_table');
      if (bt) {
        const col = {};
        Array.prototype.forEach.call(bt.querySelectorAll('th'), (t, i) => {
          const im = t.querySelector('img'); if (!im) return;
          const m = (im.getAttribute('src') || '').match(/([a-z_]{3,})\.(png|webp)/i);
          if (m) col[m[1]] = i;
        });
        // A ACADEMIA vem de brinde: esta na MESMA tabela que os niveis de mina, entao saber
        // quais aldeias podem cunhar hoje nao custa requisicao nenhuma. Sem isso a sugestao de
        // sede seria geografia pura — e a melhor aldeia do mapa as vezes nao tem Academia, o que
        // transforma "troque pra ela" num conselho que custa uma construcao inteira.
        if (col.wood != null && col.stone != null && col.iron != null) {
          bt.querySelectorAll('tr').forEach((tr) => {
            const lbl = tr.querySelector('.quickedit-label'); if (!lbl) return;
            const coord = (((lbl.textContent || '')).match(/\d{1,3}\|\d{1,3}/) || [''])[0];
            if (!coord || !V[coord]) return;
            const td = tr.querySelectorAll('td');
            const nv = (k) => Math.min(30, parseInt(((td[k] || {}).textContent || '0').trim(), 10) || 0);
            V[coord].pw = CPL_PROD[nv(col.wood)] || 0;
            V[coord].ps = CPL_PROD[nv(col.stone)] || 0;
            V[coord].pi = CPL_PROD[nv(col.iron)] || 0;
            V[coord].snob = (col.snob != null) ? nv(col.snob) : null;   // null = coluna ausente
          });
        }
      }
    } catch (e) { /* sem producao: segue conservador, e a tela DIZ que esta por baixo */ }
    // Producao REAL = tabela x fator do mundo x multiplicador da aldeia. Tem que entrar AQUI, antes
    // do saque/coleta: aquilo ja vem medido em recurso de verdade e nao pode ser multiplicado de novo.
    const _fator = cplFatorMundo();
    const _mult = await cplLerBandeiraRecurso();
    Object.keys(V).forEach((c) => {
      const m = _fator * (_mult[c] || 1);
      V[c].pw = Math.round(V[c].pw * m); V[c].ps = Math.round(V[c].ps * m); V[c].pi = Math.round(V[c].pi * m);
      V[c].mult = m;
    });
    _cplFator = _fator;
    // Saque e coleta entram como se fossem producao extra da aldeia, repartidos na proporcao da
    // CAPACIDADE de armazem (ver cplEntradaExtra pro porque desse proxy) e divididos em tres
    // partes iguais entre os recursos. Somar aqui, e nao na simulacao, faz TODAS as contas que
    // dependem de producao herdarem a correcao de uma vez: o ETA, os marcos e as moedas.
    const ex = cplEntradaExtra();
    if (ex.porHora > 0) {
      const capTot = Object.keys(V).reduce((a2, k) => a2 + V[k].cap, 0);
      if (capTot > 0) {
        Object.keys(V).forEach((k) => {
          const fatia = (V[k].cap / capTot) * ex.porHora / 3;
          V[k].pw += fatia; V[k].ps += fatia; V[k].pi += fatia;
          V[k].extraH = fatia * 3;
        });
      }
    }
    return V;
  }

  // ENTRADA QUE NAO VEM DA MINA — saque e coleta.
  //
  // A projecao so contava producao de mina, e o usuario perguntou o que mais entrava. Medido na
  // conta dele, por dia:
  //
  //     minas ....... 6,65 M   (o unico que a projecao via)
  //     saque ....... 6,82 M
  //     coleta ...... 5,09 M
  //     ------------------------
  //     real ....... 18,6  M   -> a projecao enxergava 36% do que entra
  //
  // O efeito era grande nos dois numeros da tela: o ETA de "2 dias" pro alvo de lotacao virava
  // ~19h, e a simulacao de 48h subestimava as moedas por ignorar ~500k/hora.
  //
  // Custo ZERO: os modulos ja gravam o realizado em `config.farm.stats.loot` e
  // `config.scav.stats.coleta`. Prefiro `estimate` (projecao do dia inteiro) a `today`, que e o
  // acumulado ate agora — de manha cedo `today` sai baixo e de madrugada, cheio, e a projecao
  // ficaria refem da hora em que voce clicou.
  //
  // DUAS APROXIMACOES, marcadas porque nao sao medidas:
  //   · reparto o total entre as aldeias na proporcao da CAPACIDADE DE ARMAZEM. Saque e coleta
  //     nao caem igualmente em todas, e aldeia grande costuma render mais — mas isto e proxy,
  //     nao leitura. Nao ha, no config, o rendimento POR ALDEIA.
  //   · divido em tres partes iguais entre madeira/argila/ferro. A coleta e proporcional; o
  //     saque depende do que a barbara tinha.
  function cplEntradaExtra() {
    const f = ((config.farm || {}).stats || {}).loot || {};
    const sc = ((config.scav || {}).stats || {}).coleta || {};
    const dia = (o) => Math.max(0, (o.estimate != null ? o.estimate : o.today) || 0);
    const saque = (config.farm && config.farm.running) ? dia(f) : 0;
    const coleta = (config.scav && config.scav.running) ? dia(sc) : 0;
    return { saqueDia: saque, coletaDia: coleta, porHora: (saque + coleta) / 24 };
  }

  // Custo da moeda e estado do limite, direto da Academia. Duas licoes desta tela:
  //
  //   · O CUSTO sai da linha do FORMULARIO DE CUNHAGEM (`form[action*="action=coin"]`), nao de
  //     regex sobre o texto da pagina. Meu primeiro padrao procurava "tres numeros com ponto" e
  //     casava com a linha do NOBRE (40.000/50.000/50.000) em vez da moeda — mesma forma, outro
  //     significado. Ancorar no formulario e estrutural: nao ha como pegar a linha errada.
  //
  //   · O TOTAL de moedas nao e lido, e DEDUZIDO. O regex de "Total" casava com "Na Aldeia/Total"
  //     e devolvia lixo. Mas a tela diz "falta 52 para o limite 81" e "ja guardadas 29" — e
  //     52+29=81 fecha sozinho. Deduzir de dois numeros que parseiam limpo vale mais que ler um
  //     que parseia sujo.
  async function cplLerAcademia(vid) {
    const out = { custo: null, limite: null, guardadas: null, faltam: null };
    const r = await fetch('/game.php?village=' + vid + '&screen=snob', { credentials: 'include' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const f = d.querySelector('form[action*="action=coin"]');
    if (f) {
      const tr = f.closest('tr');
      const nums = tr ? (tr.textContent || '').match(/\d{1,3}(?:\.\d{3})+/g) : null;
      if (nums && nums.length >= 3) {
        out.custo = { wood: +nums[0].replace(/\./g, ''), stone: +nums[1].replace(/\./g, ''), iron: +nums[2].replace(/\./g, '') };
      }
    }
    // Sem acento no regex de proposito: comparo contra o texto normalizado, porque classe de
    // caractere com acento em fonte gerada por script ja quebrou calado neste repo.
    const txt = (d.body ? d.body.textContent : '').replace(/\s+/g, ' ')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const mF = txt.match(/falta ainda para o limite de nobres (\d+)[^0-9]{0,12}(\d+)/i);
    const mG = txt.match(/ja guardadas para o limite de nobres \d+[^0-9]{0,12}(\d+)/i);
    if (mF) { out.limite = (+mF[1]) - 1; out.faltam = +mF[2]; }   // "limite 81" = o PROXIMO
    if (mG) out.guardadas = +mG[1];
    return out;
  }

  // ---------------------------------------------------------------------------------------
  // PACOTES — o desperdicio de usar um pacote de `pct` AGORA, dado o estado das aldeias.
  // Mesma conta do modulo de Pacotes, so que reaproveitavel pela projecao e pelo painel vivo.
  function cplDesperdicio(lista, pct) {
    let quer = 0, cabe = 0;
    lista.forEach((v) => {
      const add = Math.floor(v.cap * pct / 100);
      ['wood', 'stone', 'iron'].forEach((k) => {
        quer += add;
        cabe += Math.min(add, Math.max(0, v.cap - v[k]));
      });
    });
    return { quer: quer, cabe: cabe, perda: quer - cabe, frac: quer ? (quer - cabe) / quer : 0 };
  }

  // Aplica o pacote no estado (usado tanto na simulacao quanto na previa do painel).
  function cplAplicarPacote(lista, pct) {
    lista.forEach((v) => {
      const add = Math.floor(v.cap * pct / 100);
      ['wood', 'stone', 'iron'].forEach((k) => { v[k] = Math.min(v.cap, v[k] + add); });
    });
  }

  // Quais pacotes cabem AGORA, do maior pro menor, respeitando a tolerancia de desperdicio.
  // Devolve tambem os que nao cabem e o quanto falta esvaziar — e a informacao que transforma
  // "espere" em "espere ate tal ponto".
  function cplQuaisCabem(lista, inv, tol) {
    tol = (tol == null) ? CPL_TOLERANCIA : tol;
    const cabem = [], segura = [];
    const copia = lista.map((v) => Object.assign({}, v));
    CPL_PCTS.forEach((p) => {
      const n = Math.max(0, parseInt(inv[p], 10) || 0);
      for (let i = 0; i < n; i++) {
        const d = cplDesperdicio(copia, p);
        if (d.frac <= tol) { cabem.push(p); cplAplicarPacote(copia, p); }
        else { segura.push({ pct: p, perdaFrac: d.frac }); }
      }
    });
    return { cabem: cabem, segura: segura };
  }

  // Quantos nobres a mais um punhado de moedas compra. O limite N custa N moedas pra ser
  // atingido, e o custo SOBE a cada um — por isso dobrar moeda nao dobra nobre, e por isso a
  // resposta e um laco e nao uma divisao.
  //
  // Parte de `guardadas` (o que ja esta acumulado pro proximo) em vez do total da vida: sao os
  // dois numeros que a tela da limpos, e o total so seria usado pra chegar neles de volta.
  function cplNobres(limiteAtual, guardadas, moedasNovas) {
    if (limiteAtual == null) return null;
    let n = limiteAtual, saldo = (guardadas || 0) + (moedasNovas || 0);
    while (saldo >= n + 1) { saldo -= (n + 1); n++; }
    return n - limiteAtual;
  }


  // ---------------------------------------------------------------------------------------
  // SIMULACAO com o TEMPO CORRENDO. Passo de 15 min: o mercador sai, entrega em `ida`, e SO
  // fica livre de novo depois da IDA E VOLTA. Capacidade em transito nao conta como disponivel
  // — sem isso a projecao enxerga frota que esta na estrada.
  //
  // Os pacotes entram no MEIO da simulacao, no primeiro momento em que cabem: e assim que sai o
  // cronograma de "use o +30% por volta da hora 11".
  function cplSimular(V, destCoord, horas, comProducao, inv) {
    const [dx, dy] = destCoord.split('|').map(Number);
    const R = { wood: Math.max(0, config.market.reserveWood || 0),
                stone: Math.max(0, config.market.reserveStone || 0),
                iron: Math.max(0, config.market.reserveIron || 0) };
    const W = { wood: Math.max(1, config.market.cunhagemPesoWood != null ? config.market.cunhagemPesoWood : 28000),
                stone: Math.max(1, config.market.cunhagemPesoStone != null ? config.market.cunhagemPesoStone : 30000),
                iron: Math.max(1, config.market.cunhagemPesoIron != null ? config.market.cunhagemPesoIron : 25000) };
    const S = [];
    Object.keys(V).forEach((c) => {
      if (c === destCoord) return;
      const v = V[c]; if (!v.merc) return;
      const [a, b] = c.split('|').map(Number);
      const d = Math.sqrt((a - dx) * (a - dx) + (b - dy) * (b - dy));
      S.push({ v: v, coord: c, cap: v.cap, wood: v.wood, stone: v.stone, iron: v.iron,
               ida: (d * CPL_MIN_CAMPO) / 60, rt: (2 * d * CPL_MIN_CAMPO) / 60,
               livre: v.merc, volta: [] });
    });
    // Fila de pacotes por usar, do maior pro menor.
    const fila = [];
    // MAIOR PRIMEIRO. Eu tinha adotado menor-primeiro por uma medicao que dava 0,2% de
    // diferenca — mas ela nao capturava o caso que quebra: os pequenos consomem o espaco livre
    // e ENCALHAM o +30%, que sozinho vale 30% de todos os armazens. Medido no estado real:
    // menor-primeiro encalhava o +30%; maior-primeiro nao.
    if (inv) CPL_PCTS.forEach((p) => { const n = Math.max(0, parseInt(inv[p], 10) || 0); for (let i = 0; i < n; i++) fila.push(p); });
    const chega = { wood: 0, stone: 0, iron: 0 };
    const marcos = { m50: null, m80: null, m95: null };
    const linha = [];
    const agenda = [];
    const PASSO = 0.25;
    for (let t = 0; t < horas; t += PASSO) {
      S.forEach((s) => {
        s.volta = s.volta.filter((x) => { if (x <= t) { s.livre += s.v.merc; return false; } return true; });
        if (comProducao) {
          s.wood = Math.min(s.cap, s.wood + s.v.pw * PASSO);
          s.stone = Math.min(s.cap, s.stone + s.v.ps * PASSO);
          s.iron = Math.min(s.cap, s.iron + s.v.pi * PASSO);
        }
      });
      // QUANDO SOLTAR O PACOTE — resolvido por MEDICAO, depois de eu errar dos dois lados.
      //
      // v11.237 soltava assim que coubesse. O usuario objetou: "usar o +30% no minuto zero e
      // pessima decisao". v11.238 inverteu pra "o mais tarde possivel". Ele entao apontou o
      // furo do OUTRO lado, e o furo e real: aldeia perto esvazia em ~4h e fica com a frota
      // PARADA ate o pacote chegar. Segurar ate a hora 37 custava ~33h de frota ociosa.
      //
      // Entao medi as estrategias na conta real (79 aldeias, janela de 48h), e o resultado
      // contraria as duas intuicoes:
      //
      //     tolerancia   moedas  nobres  encalhados
      //          1%       1.497    17        1
      //          3%       1.810    20        0     <- otimo
      //          5%       1.810    20        0
      //         10%       1.808    20        0
      //         20%       1.761    19        0
      //         50%       1.634    18        0
      //     "o mais tarde possivel" (v11.238): 1.670 moedas, 18 nobres, 2 encalhados
      //
      // Duas licoes: (1) SEGURAR E O ERRO — pacote guardado demais nao chega a ser transportado
      // e encalha; (2) a ORDEM quase nao importa (menor-primeiro rende 1.810 contra 1.807 do
      // maior-primeiro), mas a TOLERANCIA importa 47%.
      //
      // Fica: solta cedo, MENOR PRIMEIRO (a ordem que o usuario sugeriu — o ganho e minusculo
      // mas e de graca), tudo que couber dentro de 3% de desperdicio.
      if (fila.length) {
        let mudou = true;
        while (mudou && fila.length) {
          mudou = false;
          // `.frac`, e nao o objeto. `cplDesperdicio` devolve {quer,cabe,perda,frac}, e
          // comparar o OBJETO com um numero da sempre false — nenhum pacote era liberado, a
          // agenda saia vazia e a linha "com pacotes" mostrava o mesmo numero de "so drenar".
          // Pior: `potencial` ja contava o volume dos pacotes, entao os marcos de 50/80/95%
          // nunca eram atingidos e o Ritmo saia todo em travessao.
          let i = fila.findIndex((x) => cplDesperdicio(S, x).frac <= CPL_TOLERANCIA);
          // REDE CONTRA ENCALHE. Pacote que nunca e solto e 100% de desperdicio — pior que
          // qualquer tolerancia. Se o volume que ainda falta soltar nao cabe mais no que a
          // frota consegue mover ate o fim da janela, solta o MAIOR agora, aceitando a perda.
          // Medido: sem a rede, 1.909 moedas e o +15% encalhado; com ela, 2.048 e nada encalha.
          if (i < 0) {
            const capFrota = S.reduce((a, x) => a + x.v.merc, 0);
            const rtMed = S.reduce((a, x) => a + x.rt * x.v.merc, 0) / Math.max(1, capFrota);
            const vazao = rtMed > 0 ? capFrota / rtMed : 0;
            const volume = fila.reduce((a, x) => a + S.reduce((b, y) => b + y.cap * 3 * x / 100, 0), 0);
            if (vazao > 0 && t >= horas - volume / vazao) i = 0;   // fila e maior-primeiro
          }
          if (i >= 0) {
            const pct = fila[i], perda = cplDesperdicio(S, pct).frac;
            fila.splice(i, 1);
            cplAplicarPacote(S, pct);
            const livre = 1 - (S.reduce((a, x) => a + x.wood + x.stone + x.iron, 0) / S.reduce((a, x) => a + x.cap * 3, 0));
            agenda.push({ h: t, pct: pct, livreDepois: livre, perda: perda, noPrazo: false });
            mudou = true;
          }
        }
      }
      S.forEach((s) => {
        if (s.livre < CPL_CARGA) return;
        const sobra = {}; let tem = 0;
        ['wood', 'stone', 'iron'].forEach((k) => { sobra[k] = Math.max(0, s[k] - R[k]); tem += sobra[k]; });
        if (tem < CPL_CARGA) return;
        // Mesma regra do envio real (racaoCarteira): sempre o recurso mais atrasado na razao,
        // contando o que JA chegou — a razao e do destino, nao de cada comando.
        const env = { wood: 0, stone: 0, iron: 0 };
        let resta = Math.min(s.livre, tem);
        while (resta >= CPL_CARGA) {
          let alvo = null, pior = Infinity;
          ['wood', 'stone', 'iron'].forEach((k) => {
            if (sobra[k] - env[k] <= 0) return;
            const razao = (chega[k] + env[k]) / W[k];
            if (razao < pior) { pior = razao; alvo = k; }
          });
          if (!alvo) break;
          const leva = Math.min(CPL_CARGA, resta, sobra[alvo] - env[alvo]);
          if (leva <= 0) break;
          env[alvo] += leva; resta -= leva;
        }
        const carga = env.wood + env.stone + env.iron;
        if (carga < CPL_CARGA) return;
        ['wood', 'stone', 'iron'].forEach((k) => { s[k] -= env[k]; });
        // Chegada FORA da janela nao conta: saiu, mas nao vira moeda a tempo.
        if (t + s.ida <= horas) ['wood', 'stone', 'iron'].forEach((k) => { chega[k] += env[k]; });
        s.livre -= carga; s.volta.push(t + s.rt);
      });
      // Guarda a linha do tempo em vez de comparar contra o POTENCIAL TEORICO. O potencial
      // incluia o volume dos pacotes; quando um encalhava, a soma nunca chegava a 80% e o
      // Ritmo saia em travessao — a tela dizia 'nao sei' quando na verdade sabia. Os marcos
      // agora sao relativos ao que DE FATO chegou, que e a pergunta util: 'quando eu tenho
      // 80% do que vou ter'.
      linha.push({ h: t, soma: chega.wood + chega.stone + chega.iron });
    }
    const totalFim = chega.wood + chega.stone + chega.iron;
    if (totalFim > 0) {
      linha.forEach((x) => {
        if (marcos.m50 == null && x.soma / totalFim >= 0.5) marcos.m50 = x.h;
        if (marcos.m80 == null && x.soma / totalFim >= 0.8) marcos.m80 = x.h;
        if (marcos.m95 == null && x.soma / totalFim >= 0.95) marcos.m95 = x.h;
      });
    }
    return { chega: chega, marcos: marcos, origens: S.length, agenda: agenda, sobraram: fila.slice() };
  }

  // Distancia PONDERADA PELO EXCEDENTE — o criterio de sede.
  function cplDistPonderada(V, destCoord) {
    const [dx, dy] = destCoord.split('|').map(Number);
    const R = { wood: config.market.reserveWood || 0, stone: config.market.reserveStone || 0, iron: config.market.reserveIron || 0 };
    let sp = 0, se = 0;
    Object.keys(V).forEach((c) => {
      if (c === destCoord) return;
      const v = V[c];
      const exc = ['wood', 'stone', 'iron'].reduce((s, k) => s + Math.max(0, v[k] - (R[k] || 0)), 0);
      if (exc <= 0) return;
      const [a, b] = c.split('|').map(Number);
      sp += exc * Math.sqrt((a - dx) * (a - dx) + (b - dy) * (b - dy)); se += exc;
    });
    return se ? sp / se : Infinity;
  }

  function cplMoedas(chega, custo) {
    return Math.min(Math.floor(chega.wood / custo.wood), Math.floor(chega.stone / custo.stone),
                    Math.floor(chega.iron / custo.iron));
  }

  async function cplPlanejar() {
    if (_cplCarregando) return;
    const c = cplCfg();
    _cplCarregando = true; _cplErr = null; _cplPlano = null; cplRender();
    try {
      const V = await cplLerAldeias();
      _cplDados = V; _cplAt = Date.now();
      try { cplChecarAlvo(Object.keys(V).map((k) => V[k])); } catch (e) { /* opcional */ }
      const destAtual = (config.market.destCoords || [])[0] || null;
      const rank = Object.keys(V).map((k) => ({ coord: k, nome: V[k].nome, d: cplDistPonderada(V, k),
                                                 snob: V[k].snob }))
        .filter((x) => isFinite(x.d)).sort((a, b) => a.d - b.d);
      // Duas listas, porque sao duas perguntas diferentes: "qual e a melhor" e "qual e a melhor
      // que eu POSSO usar hoje". Se a coluna da Academia nao veio (`snob == null`), nao da pra
      // afirmar nada — a segunda lista fica vazia e a tela diz isso em vez de chutar.
      const rankAcad = rank.filter((x) => x.snob != null && x.snob >= 1);
      const semDadoAcad = rank.every((x) => x.snob == null);
      const sede = (destAtual && V[destAtual]) ? destAtual : (rank[0] && rank[0].coord);
      if (!sede) throw new Error('não consegui escolher uma sede');
      const horas = Math.max(1, parseFloat(c.cplHoras) || 48);
      const comPac = cplSimular(V, sede, horas, true, c.cplInv);
      const semPac = cplSimular(V, sede, horas, true, null);
      // A RESERVA E UMA ALAVANCA, e ninguem enxerga quanto ela custa. Com 79 aldeias a 20k por
      // recurso sao 4,7M congelados — 13% do total. Simular com metade responde "vale mexer?"
      // sem o usuario ter que testar na mao. Nao muda nada: e so uma segunda projecao.
      const rw = config.market.reserveWood, rs = config.market.reserveStone, ri = config.market.reserveIron;
      let meiaReserva = null;
      try {
        config.market.reserveWood = Math.floor(rw / 2);
        config.market.reserveStone = Math.floor(rs / 2);
        config.market.reserveIron = Math.floor(ri / 2);
        meiaReserva = cplSimular(V, sede, horas, true, c.cplInv);
      } finally {
        config.market.reserveWood = rw; config.market.reserveStone = rs; config.market.reserveIron = ri;
      }
      let ac = null;
      try {
        const vid = (await getAllVillagesCached()).filter((x) => x.coord === sede).map((x) => x.vid)[0];
        if (vid) ac = await cplLerAcademia(vid);
      } catch (e) { /* segue sem a Academia */ }
      _cplPlano = { sede: sede, sedeNome: V[sede].nome, destAtual: destAtual, rank: rank,
                    meiaReserva: meiaReserva, totalAldeias: Object.keys(V).length,
                    rankAcad: rankAcad, semDadoAcad: semDadoAcad, sedeSnob: V[sede].snob,
                    horas: horas, comPac: comPac, semPac: semPac, ac: ac,
                    temProducao: Object.keys(V).some((k) => V[k].pw > 0) };
    } catch (e) { _cplErr = e.message || String(e); }
    _cplCarregando = false; cplRender();
  }

  // ---------------------------------------------------------------------------------------
  // QUANDO COMECAR A CUNHAR — o alerta de lotacao.
  //
  // A intuicao do usuario ("quanto mais cheio o armazem, mais rende a cunhagem") esta CERTA, e
  // eu duvidei dela duas vezes antes de medir. O que a medicao mostrou, na conta real:
  //
  //     esperar   lotacao   producao perdida   moedas   nobres
  //        0h      59,2%           0            1.718     +19
  //       24h      68,5%         7,5 k          1.804     +20
  //       52h      79,1%       147   k          1.919     +21   <- otimo
  //       96h      88,0%         5,84 M         1.954     +21
  //
  // Ate ~80% o transbordo e desprezivel (147k, 0,2% do que se ganha) e cada faixa vale nobre.
  // Depois de 80% a curva SATURA: mais 44h de espera nao rendem nobre nenhum e queimam 5,8M em
  // producao jogada fora, porque as aldeias que enchem primeiro passam a produzir pro ralo.
  //
  // Por isso o alvo padrao e 80%: e onde o ganho para e o desperdicio comeca.
  const CPL_ALVO_PADRAO = 80;

  // Lotacao geral = quanto do armazem TOTAL esta ocupado, somando os tres recursos. Ponderada
  // pela capacidade e nao media das aldeias: uma aldeia de 400k pesa mais que uma de 20k, e e a
  // primeira que decide se vale disparar a operacao.
  function cplLotacao(lista) {
    if (!lista || !lista.length) return null;
    let cap = 0, uso = 0, cheios = 0, total = 0;
    lista.forEach((v) => {
      ['wood', 'stone', 'iron'].forEach((k) => {
        cap += v.cap; uso += Math.min(v.cap, v[k] || 0); total++;
        if ((v[k] || 0) >= v.cap * 0.999) cheios++;
      });
    });
    return { pct: cap ? uso / cap : 0, cheios: cheios, total: total, cap: cap, uso: uso };
  }

  // Alerta uma vez por travessia, nao a cada ciclo: repetir a mesma linha varreria o log de 200
  // linhas, que e compartilhado com todos os modulos (ja aconteceu com a recruta do Noblar).
  function cplChecarAlvo(lista) {
    const c = cplCfg();
    const L = cplLotacao(lista); if (!L) return;
    const alvo = Math.max(1, Math.min(99, parseFloat(c.cplAlvoPct) || CPL_ALVO_PADRAO)) / 100;
    _cplLot = { at: Date.now(), pct: L.pct, cheios: L.cheios, total: L.total };
    if (L.pct >= alvo && !c._cplAvisou) {
      c._cplAvisou = 1; save();
      pushLog('🪙 Cunhagem: os armazéns bateram ' + Math.round(L.pct * 100) + '% (alvo '
        + Math.round(alvo * 100) + '%) — é a hora de rodar a cunhagem. Esperar mais satura: '
        + 'a produção das aldeias cheias passa a transbordar sem virar moeda.', 'ok', 'market');
    } else if (L.pct < alvo * 0.9 && c._cplAvisou) {
      c._cplAvisou = 0; save();   // rearma depois de drenar, pro proximo ciclo avisar de novo
    }
  }

  // ---------------------------------------------------------------------------------------
  // PAINEL AO VIVO. Alimentado pelo PROPRIO ciclo da Cunhagem (075-mercado), que ja le o mercado
  // de cada doadora — entao isto custa ZERO requisicao. Com a Cunhagem desligada, o estado fica
  // congelado na ultima leitura, e a tela diz isso.
  function cplVivoRegistrar(lista) {
    if (!lista || !lista.length) return;
    _cplVivo = { at: Date.now(), lista: lista };
    try { cplChecarAlvo(lista); } catch (e) { /* alerta e opcional */ }
    try { cplVivoRender(); } catch (e) { /* a tela pode nao estar aberta */ }
    return _cplVivo;
  }

  function cplVivoSugestao() {
    if (!_cplVivo) return null;
    const c = cplCfg();
    const r = cplQuaisCabem(_cplVivo.lista, c.cplInv);
    const capT = _cplVivo.lista.reduce((a, v) => a + v.cap * 3, 0);
    const usado = _cplVivo.lista.reduce((a, v) => a + v.wood + v.stone + v.iron, 0);
    return { cabem: r.cabem, segura: r.segura, livre: capT ? 1 - usado / capT : 0, at: _cplVivo.at };
  }

  // Usado um pacote: baixa do inventario. Nao da pra detectar sozinho — e por isso que o
  // caminho e sugerir primeiro e automatizar depois, quando a sugestao ja tiver se provado.
  function cplUsouPacote(pct) {
    const c = cplCfg();
    c.cplInv[pct] = Math.max(0, (parseInt(c.cplInv[pct], 10) || 0) - 1);
    save(); cplVivoRender(); cplRenderInv();
  }

  function cplVivoRender() {
    const box = document.getElementById('twmgr-cpl-vivo'); if (!box) return;
    const c = cplCfg();
    const temInv = CPL_PCTS.some((p) => (parseInt(c.cplInv[p], 10) || 0) > 0);
    if (!temInv) { box.innerHTML = '<span class="twmgr-lbl">Preencha o inventário acima pra eu sugerir o momento de cada pacote.</span>'; return; }
    const s = cplVivoSugestao();
    if (!s) {
      box.innerHTML = '<div style="font-size:10px;color:#a2643a">Sem leitura ainda. O painel se alimenta do ciclo da <b>Cunhagem</b> — '
        + 'ligue ela (ou use ⚖️ Equilíbrio › diagnóstico) e a sugestão aparece no fim do primeiro ciclo.</div>';
      return;
    }
    const idade = Math.round((Date.now() - s.at) / 60000);
    const chip = (p, on) => '<button class="twmgr-btn ' + (on ? 'twmgr-go' : 'twmgr-ghost') + '" data-cplusou="' + p
      + '" style="font-size:10px;padding:2px 8px;margin:2px 3px 0 0"' + (on ? '' : ' disabled') + '>+' + p + '%'
      + (on ? ' · usei' : '') + '</button>';
    box.innerHTML =
      '<div style="font-size:10px;color:#6f6153;margin-bottom:4px">espaço livre médio <b>' + Math.round(s.livre * 100)
        + '%</b> <span style="color:#8a7d6d">· lido há ' + idade + ' min</span></div>' +
      (s.cabem.length
        ? '<div style="font-size:11px;color:#2e7d3a;font-weight:600">USE AGORA</div><div>'
          + s.cabem.map((p) => chip(p, true)).join('') + '</div>'
          + '<div style="font-size:9px;color:#8a7d6d;margin-top:2px">Clique depois de usar no jogo — eu não consigo detectar sozinho.</div>'
        : '<div style="font-size:11px;color:#a2643a;font-weight:600">SEGURE TODOS</div>'
          + '<div style="font-size:10px;color:#6f6153">nenhum cabe sem desperdiçar mais de '
          + Math.round(CPL_TOLERANCIA * 100) + '%. Deixe a Cunhagem drenar mais.</div>') +
      (s.segura.length
        ? '<div style="font-size:10px;color:#6f6153;margin-top:5px">segurando: '
          + s.segura.slice(0, 6).map((x) => '+' + x.pct + '% <span style="color:#b03030">(perderia '
            + Math.round(x.perdaFrac * 100) + '%)</span>').join(' · ') + '</div>'
        : '');
    box.querySelectorAll('[data-cplusou]').forEach((b) => b.addEventListener('click',
      () => cplUsouPacote(parseInt(b.getAttribute('data-cplusou'), 10))));
  }

  function cplRenderInv() {
    const c = cplCfg();
    CPL_PCTS.forEach((p) => { const el = document.getElementById('twmgr-cpl-inv-' + p); if (el) el.value = c.cplInv[p] || 0; });
  }

  function cplRender() {
    const box = document.getElementById('twmgr-cpl-out'); if (!box) return;
    if (_cplCarregando) { box.innerHTML = '<span class="twmgr-lbl">lendo aldeias, minas e Academia…</span>'; return; }
    if (_cplErr) { box.innerHTML = '<span style="color:#b03030;font-size:10px">' + esc(_cplErr) + '</span>'; return; }
    if (!_cplPlano) { box.innerHTML = '<span class="twmgr-lbl">Clique em <b>Projetar</b>.</span>'; return; }
    const p = _cplPlano, c = cplCfg();
    const hm = (h) => (h == null ? '—' : (h < 1 ? Math.round(h * 60) + 'min' : (Math.round(h * 10) / 10) + 'h'));
    // Custo COM e SEM bandeira, sempre os dois. A Academia da o que esta valendo agora; o outro
    // e derivado pelo desconto configurado — assim a comparacao existe mesmo antes de ativar.
    const lido = (p.ac && p.ac.custo) || null;
    const desc = Math.max(0, Math.min(95, parseFloat(c.cplDesconto) || 0)) / 100;
    const base = {}, comB = {};
    const padrao = { wood: 28000, stone: 30000, iron: 25000 };
    ['wood', 'stone', 'iron'].forEach((k) => {
      const v = lido ? lido[k] : padrao[k];
      // Heuristica: se o custo lido ja e menor que o padrao do mundo, a bandeira ESTA ativa.
      const jaComDesconto = lido && v < padrao[k] * 0.95;
      base[k] = jaComDesconto ? Math.round(v / (1 - desc)) : v;
      comB[k] = jaComDesconto ? v : Math.round(v * (1 - desc));
    });
    const linha = (r, custo) => {
      const m = cplMoedas(r.chega, custo);
      const n = cplNobres(p.ac && p.ac.limite, p.ac && p.ac.guardadas, m);
      return { m: m, n: n };
    };
    const cen = [
      { rot: 'com pacotes · <b>com bandeira</b>', r: p.comPac, cu: comB, forte: true },
      { rot: 'com pacotes · sem bandeira', r: p.comPac, cu: base },
      { rot: 'só drenar · com bandeira', r: p.semPac, cu: comB },
      { rot: 'só drenar · sem bandeira', r: p.semPac, cu: base },
    ].map((x) => Object.assign(x, linha(x.r, x.cu)));
    const r = p.comPac;
    const porRec = { madeira: r.chega.wood / comB.wood, argila: r.chega.stone / comB.stone, ferro: r.chega.iron / comB.iron };
    const gargalo = Object.keys(porRec).sort((a, b) => porRec[a] - porRec[b])[0];
    const alt = p.rank.filter((x) => x.coord !== p.sede)[0];
    const distSede = cplDistPonderada(_cplDados, p.sede);
    // LOTACAO em cima de tudo: e ela que responde "comeco agora ou espero?", e a resposta muda
    // o resto da tela. Sem isso o usuario le a projecao sem saber se e a hora de agir.
    const alvoPct = Math.max(1, Math.min(99, parseFloat(c.cplAlvoPct) || 80));
    const L = _cplLot;
    const prodH = Object.keys(_cplDados || {}).reduce((a, k) => a + _cplDados[k].pw + _cplDados[k].ps + _cplDados[k].pi, 0);
    let eta = null;
    if (L && prodH > 0 && L.pct < alvoPct / 100) {
      // Estimativa GROSSA e assumidamente otimista: ignora que aldeia cheia para de acumular.
      // Serve pra ordem de grandeza ("horas ou dias"), nao pra marcar hora.
      const falta = (alvoPct / 100 - L.pct) * (_cplDados ? Object.keys(_cplDados).reduce((a, k) => a + _cplDados[k].cap * 3, 0) : 0);
      eta = falta / prodH;
    }
    box.innerHTML =
      (L ? '<div style="border:1px solid ' + (L.pct >= alvoPct / 100 ? '#bcd9bc' : '#e6dcc9')
          + ';background:' + (L.pct >= alvoPct / 100 ? '#eef7ee' : '#fffdf8')
          + ';border-radius:6px;padding:7px;margin-bottom:6px">'
          + '<b style="font-size:14px;color:' + (L.pct >= alvoPct / 100 ? '#2e7d3a' : '#a2643a') + '">'
          + Math.round(L.pct * 100) + '%</b> <span style="font-size:10px;color:#6f6153">dos armazéns ocupados'
          + ' · alvo ' + alvoPct + '%</span><br>'
          + '<span style="font-size:10px;color:' + (L.pct >= alvoPct / 100 ? '#2e7d3a' : '#6f6153') + '">'
          + (L.pct >= alvoPct / 100
              ? '<b>Hora de rodar.</b> Esperar mais satura — a produção das aldeias cheias passa a transbordar sem virar moeda.'
              : 'Ainda enchendo' + (eta != null && eta > 0 && isFinite(eta)
                  ? ' — chega ao alvo em ~' + (eta < 24 ? Math.round(eta) + 'h' : Math.round(eta / 24) + ' dia(s)')
                    + ' <span style="color:#8a7d6d">(estimativa otimista: ignora aldeia que enche e para de acumular)</span>'
                  : '') + '.')
          + '</span>'
          + (L.cheios ? '<br><span style="font-size:10px;color:#b03030">' + L.cheios + ' de ' + L.total
             + ' depósitos já no teto — esses estão jogando produção fora agora.</span>' : '')
          + '</div>' : '') +
      '<table class="twmgr-bld-tab" style="width:100%"><thead><tr>' +
        '<th>cenário em ' + p.horas + 'h</th><th style="width:74px">moedas</th><th style="width:62px">nobres</th></tr></thead><tbody>' +
      cen.map((x, i) => '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '"' + (x.forte ? ' style="background:#eef7ee"' : '') + '>' +
        '<td>' + x.rot + '</td><td style="font-variant-numeric:tabular-nums"><b>' + fmtN(x.m) + '</b></td>' +
        '<td style="color:' + (x.forte ? '#2e7d3a' : '#6f6153') + '"><b>' + (x.n == null ? '—' : '+' + x.n) + '</b></td></tr>').join('') +
      '</tbody></table>' +
      (!p.ac || p.ac.limite == null ? '<div style="font-size:9px;color:#a2643a;margin-top:2px">Não li o limite de nobres da Academia da sede — a coluna de nobres fica vazia. A sede tem Academia?</div>' : '') +
      '<table class="twmgr-bld-tab" style="width:100%;margin-top:6px"><tbody>' +
      '<tr><td style="color:#6f6153;width:96px">Sede</td><td><b>' + esc(p.sedeNome) + '</b> ' + esc(p.sede) +
        (p.destAtual === p.sede ? ' <span style="color:#2e7d3a">(destino atual)</span>' : ' <span style="color:#a2643a">(sugerida)</span>') +
        ' <span style="color:#8a7d6d">· dist. ponderada ' + (Math.round(distSede * 10) / 10) + '</span></td></tr>' +
      (function () {
        // DUAS SUGESTOES, porque sao duas perguntas diferentes:
        //   · a melhor aldeia do mapa (geografia pura)
        //   · a melhor que JA TEM ACADEMIA — a unica acionavel hoje
        // Recomendar a primeira sem checar a segunda e mandar o usuario construir Academia sem
        // dizer que esta mandando.
        const pct = (d) => (distSede > 0 ? Math.round((1 - d / distSede) * 100) : 0);
        const linhaDe = (x, rot, cor) => '<tr><td style="color:#6f6153">' + rot + '</td><td>'
          + '<b>' + esc(x.nome) + '</b> ' + esc(x.coord)
          + ' <span style="color:#8a7d6d">· ' + (Math.round(x.d * 10) / 10)
          + ' contra ' + (Math.round(distSede * 10) / 10) + ' da atual</span>'
          + (x.coord === p.sede ? ' <b style="color:#2e7d3a">— é a atual</b>'
             : '<br><span style="color:' + cor + '">' + (pct(x.d) >= 15 ? 'Vale trocar' : 'Ganho pequeno')
               + ' — ' + pct(x.d) + '% mais perto'
               + (x.snob != null && x.snob < 1 ? ' · <b style="color:#b03030">SEM Academia</b> (teria que construir)' : '')
               + '</span>')
          + '</td></tr>';
        let out = '';
        const melhor = p.rank[0];
        if (melhor) out += linhaDe(melhor, 'Melhor do mapa', pct(melhor.d) >= 15 ? '#2e7d3a' : '#a2643a');
        if (p.semDadoAcad) {
          out += '<tr><td style="color:#6f6153">Com Academia</td><td><span style="color:#a2643a">'
            + 'não consegui ler a coluna de Academia — não dá pra dizer quais podem cunhar hoje.</span></td></tr>';
        } else {
          const melhorAc = p.rankAcad[0];
          if (!melhorAc) {
            out += '<tr><td style="color:#6f6153">Com Academia</td><td><span style="color:#b03030">'
              + 'nenhuma aldeia sua tem Academia.</span></td></tr>';
          } else if (melhor && melhorAc.coord === melhor.coord) {
            out += '<tr><td style="color:#6f6153">Com Academia</td><td><b style="color:#2e7d3a">'
              + 'a melhor do mapa já tem Academia</b> — nada a construir.</td></tr>';
          } else {
            out += linhaDe(melhorAc, 'Melhor <b>com Academia</b>', pct(melhorAc.d) >= 15 ? '#2e7d3a' : '#a2643a');
          }
        }
        // A sede de hoje tem Academia? Se nao tiver, a operacao nao sai do lugar — e esse aviso
        // vale mais que qualquer sugestao de troca.
        if (p.sedeSnob != null && p.sedeSnob < 1) {
          out += '<tr><td style="color:#6f6153">⚠ Atenção</td><td><b style="color:#b03030">'
            + 'a sede atual NÃO tem Academia</b> — não há onde cunhar o que chegar.</td></tr>';
        }
        return out;
      })() +
      '<tr><td style="color:#6f6153">Chega</td><td>' +
        '<span style="color:#8a6a44">' + fmtN(Math.round(r.chega.wood)) + '</span> / ' +
        '<span style="color:#c1743c">' + fmtN(Math.round(r.chega.stone)) + '</span> / ' +
        '<span style="color:#5f7382">' + fmtN(Math.round(r.chega.iron)) + '</span></td></tr>' +
      '<tr><td style="color:#6f6153">Ritmo</td><td>50% em ' + hm(r.marcos.m50) + ' · 80% em ' + hm(r.marcos.m80)
        + ' · 95% em ' + hm(r.marcos.m95) + '</td></tr>' +
      '<tr><td style="color:#6f6153">Custo/moeda</td><td>' + fmtN(comB.wood) + '/' + fmtN(comB.stone) + '/' + fmtN(comB.iron)
        + ' com bandeira · ' + fmtN(base.wood) + '/' + fmtN(base.stone) + '/' + fmtN(base.iron) + ' sem'
        + (lido ? ' <span style="color:#2e7d3a">(lido da Academia)</span>' : ' <span style="color:#a2643a">(padrão — não li a Academia)</span>') + '</td></tr>' +
      '<tr><td style="color:#6f6153">Trava</td><td><b style="color:#b03030">' + gargalo + '</b>'
        + ' <span style="color:#8a7d6d">— é ele que limita a cunhagem</span></td></tr>' +
      // O QUE SOBRA SEM PAR. Era o medo original do usuario ("3kk de madeira e argila com 400mil
      // de ferro"). A linha "Trava" nomeia o recurso mas nao diz o TAMANHO do encalhe — e e o
      // tamanho que decide se vale mexer em mina de ferro ou aceitar.
      (function () {
        const m = cen[0].m;
        const sob = { madeira: r.chega.wood - m * comB.wood, argila: r.chega.stone - m * comB.stone,
                      ferro: r.chega.iron - m * comB.iron };
        const tot = sob.madeira + sob.argila + sob.ferro;
        const pior = Object.keys(sob).sort((a, b) => sob[b] - sob[a])[0];
        return '<tr><td style="color:#6f6153">Sobra sem par</td><td>'
          + '<span style="color:#8a6a44">' + fmtN(Math.max(0, Math.round(sob.madeira))) + '</span> / '
          + '<span style="color:#c1743c">' + fmtN(Math.max(0, Math.round(sob.argila))) + '</span> / '
          + '<span style="color:#5f7382">' + fmtN(Math.max(0, Math.round(sob.ferro))) + '</span>'
          + (tot > m * (comB.wood + comB.stone + comB.iron) * 0.05
            ? '<br><span style="color:#b03030">' + fmtN(Math.round(tot)) + ' ficam parados no destino</span>'
              + ' <span style="color:#8a7d6d">— sobretudo ' + pior + '. Para converter isso você precisa de mais '
              + gargalo + ', não de mais bandeira.</span>'
            : ' <span style="color:#2e7d3a">— pouca sobra, a mistura está bem casada</span>')
          + '</td></tr>';
      })() +
      // A RESERVA como alavanca visivel.
      (p.meiaReserva ? (function () {
        const m2 = cplMoedas(p.meiaReserva.chega, comB);
        const n2 = cplNobres(p.ac && p.ac.limite, p.ac && p.ac.guardadas, m2);
        const dm = m2 - cen[0].m, dn = (n2 != null && cen[0].n != null) ? n2 - cen[0].n : null;
        const trava = (config.market.reserveWood + config.market.reserveStone + config.market.reserveIron) * (p.totalAldeias || 0);
        return '<tr><td style="color:#6f6153">Reserva</td><td>'
          + fmtN(config.market.reserveWood) + '/' + fmtN(config.market.reserveStone) + '/' + fmtN(config.market.reserveIron)
          + ' por aldeia · <b>' + fmtN(trava) + '</b> congelados no total'
          + (dm > 0 ? '<br><span style="color:#a2643a">Pela metade renderia <b>+' + fmtN(dm) + '</b> moeda(s)'
              + (dn ? ' e <b>+' + dn + '</b> nobre(s)' : '') + '</span>'
              + ' <span style="color:#8a7d6d">— o custo é deixar as aldeias mais expostas.</span>'
            : '<br><span style="color:#2e7d3a">Baixar não renderia nada — a frota já é o gargalo.</span>')
          + '</td></tr>';
      })() : '') +
      // Quem ficou de fora, e por que. Sem isto "so 60 origens" vira investigacao.
      '<tr><td style="color:#6f6153">Origens</td><td>' + r.origens + ' de ' + ((p.totalAldeias || 1) - 1)
        + ' aldeia(s) participam'
        + (r.origens < (p.totalAldeias || 1) - 1
          ? ' <span style="color:#a2643a">— as demais não têm mercador livre para a janela</span>' : '')
        + '</td></tr>' +
      // AS TRES FONTES, separadas. Antes a tela nao dizia de onde vinha o recurso, e a projecao
      // so contava mina — o usuario perguntou e descobriu que ela via 36% do que entra.
      (function () {
        const ex = cplEntradaExtra();
        const minaH = Object.keys(_cplDados || {}).reduce((a, k) =>
          a + (_cplDados[k].pw + _cplDados[k].ps + _cplDados[k].pi) - (_cplDados[k].extraH || 0), 0);
        const totH = minaH + ex.porHora;
        if (!p.temProducao && !ex.porHora) {
          return '<tr><td style="color:#6f6153">Entrada</td><td><span style="color:#a2643a">'
            + 'não li os níveis de mina nem o rendimento de saque/coleta — a projeção está por baixo.</span></td></tr>';
        }
        return '<tr><td style="color:#6f6153">Entrada</td><td>'
          + '<b>' + fmtN(Math.round(totH)) + '</b>/h <span style="color:#8a7d6d">= '
          + fmtN(Math.round(minaH)) + ' minas'
          + (ex.saqueDia ? ' + ' + fmtN(Math.round(ex.saqueDia / 24)) + ' saque' : '')
          + (ex.coletaDia ? ' + ' + fmtN(Math.round(ex.coletaDia / 24)) + ' coleta' : '')
          + '</span>'
          + (!p.temProducao ? '<br><span style="color:#a2643a">níveis de mina não lidos</span>' : '')
          + ((ex.saqueDia || ex.coletaDia)
            ? '<br><span style="color:#8a7d6d">Saque e coleta vêm do realizado dos módulos, repartidos'
              + ' por capacidade de armazém e em três partes iguais — é aproximação, não medição por aldeia.</span>'
            : (config.farm && config.farm.running) || (config.scav && config.scav.running)
              ? '<br><span style="color:#a2643a">Saque/coleta ligados mas sem rendimento gravado ainda — rode um ciclo.</span>'
              : '<br><span style="color:#8a7d6d">Saque e coleta desligados — só a mina conta.</span>')
          + '</td></tr>';
      })() +
      '</tbody></table>' +
      (r.agenda.length
        ? '<div style="font-size:10px;color:#6f6153;margin-top:7px"><b>Cronograma dos pacotes</b> — o momento em que cada um passa a caber sem desperdiçar:</div>' +
          '<table class="twmgr-bld-tab" style="width:100%"><thead><tr><th style="width:60px">hora</th><th style="width:60px">pacote</th><th>espaço livre depois</th></tr></thead><tbody>' +
          r.agenda.map((a, i) => '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">' +
            '<td style="font-variant-numeric:tabular-nums">' + hm(a.h) + '</td>' +
            '<td><b style="color:#a2643a">+' + a.pct + '%</b></td>' +
            '<td style="color:#6f6153">' + Math.round(a.livreDepois * 100) + '%'
              + ((a.perda || 0) > 0.001
                  ? ' <span style="color:#a2643a">· perde ' + Math.round((a.perda || 0) * 100) + '%</span>'
                  : ' <span style="color:#2e7d3a">· sem desperdício</span>') + '</td></tr>').join('') +
          '</tbody></table>' +
          (r.sobraram.length ? '<div style="font-size:9px;color:#b03030;margin-top:2px">' + r.sobraram.length
            + ' pacote(s) não chegam a caber em ' + p.horas + 'h: ' + r.sobraram.map((x) => '+' + x + '%').join(', ')
            + '. Aumente a janela ou aceite o desperdício.</div>' : '')
        : '<div style="font-size:9px;color:#8a7d6d;margin-top:6px">Sem pacotes no inventário — preencha acima pra ver o cronograma.</div>') +
      '<div style="font-size:9px;color:#8a7d6d;margin-top:4px">Mercador a ' + CPL_MIN_CAMPO
      + ' min/campo, <b>ida e volta</b> simuladas por mercador. Produção da mina a <b>'
      + _cplFator.toFixed(2).replace('.', ',') + '×</b> a tabela (medido no mundo) e já com a bandeira de Recurso de cada aldeia.'
      + ' Respeita a reserva e a razão configuradas. Lido às '
      + new Date(_cplAt).toLocaleTimeString('pt-BR') + '.</div>';
  }
