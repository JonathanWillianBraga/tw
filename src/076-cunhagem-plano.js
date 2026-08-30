  // ==================== PLANEJADOR DA CUNHAGEM (cpl*) ====================
  // Responde, ANTES de ligar a Cunhagem, as perguntas que só se respondiam abrindo planilha:
  // qual aldeia deve ser a sede, quanto recurso chega numa janela de N horas, quantas moedas isso
  // vira e quantos nobres a mais isso significa.
  //
  // POR QUE ISTO NAO E "SO UMA CONTA"
  //
  // Cada uma dessas perguntas tem uma armadilha que so aparece medindo:
  //
  //   · A SEDE nao e a aldeia central do mapa — e a que minimiza a distancia PONDERADA PELO
  //     EXCEDENTE. Aldeia perto de muita gente pobre vale menos que aldeia perto de poucos
  //     armazens cheios.
  //   · O GARGALO quase nunca e o recurso: e a FROTA. Numa conta medida, 13,3M de producao em
  //     48h renderam so +217 moedas, porque os mercadores ja estavam saturados. Projecao que
  //     ignora ida-e-volta erra pra cima com folga.
  //   · O CUSTO DA MOEDA vem da tela da Academia, nao de constante — assim a bandeira de
  //     desconto entra sozinha na conta, sem o usuario configurar nada.
  //   · O NOBRE encarece: o limite N custa `1+2+...+N` moedas acumuladas. Dobrar as moedas NAO
  //     dobra os nobres, e e o numero de nobres que interessa.
  //
  // ESCOPO: so projeta. Nao liga a Cunhagem, nao muda destino, nao envia nada.

  // Producao/hora por nivel de mina, velocidade 1. Tabela do jogo.
  const CPL_PROD = [0, 30, 35, 41, 47, 55, 64, 74, 86, 100, 117, 136, 158, 184, 214, 249, 289,
                    337, 391, 455, 530, 616, 717, 833, 969, 1127, 1311, 1524, 1772, 2061, 2397];
  const CPL_MIN_CAMPO = 3;       // minutos por campo do mercador neste mundo
  const CPL_CARGA = 1000;        // capacidade de um mercador
  const CPL_JANELA_H = 48;       // janela padrao da projecao

  let _cplDados = null, _cplAt = 0, _cplCarregando = false, _cplErr = null, _cplPlano = null;

  // Uma leitura de aldeia com TUDO que a projecao precisa. Duas requisicoes no total, e as duas
  // sao telas de visao geral (uma por conta, nao uma por aldeia) — ler aldeia a aldeia custaria
  // 79 requisicoes e e o que torna projecao assim inviavel na pratica.
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
      // "livres/total" — a projecao usa o TOTAL: mercador ocupado agora volta dentro da janela.
      const mc = (iCom >= 0 && tds[iCom]) ? (tds[iCom].textContent || '').match(/(\d+)\s*\/\s*(\d+)/) : null;
      const lbl = tr.querySelector('.quickedit-label');
      const nome = ((lbl && lbl.textContent) || '').replace(/\s+/g, ' ').trim();
      const coord = (nome.match(/\d{1,3}\|\d{1,3}/) || [''])[0];
      if (!coord) return;
      V[coord] = { coord: coord, nome: nome.replace(/\s*\(\d{1,3}\|\d{1,3}\).*$/, '').trim() || coord,
                   wood: num(w.textContent), stone: num(s.textContent), iron: num(i.textContent),
                   cap: cap, merc: mc ? (+mc[2]) * CPL_CARGA : 0, pw: 0, ps: 0, pi: 0 };
    });
    if (!Object.keys(V).length) throw new Error('nenhuma aldeia lida');
    // Niveis das minas -> producao/hora. As colunas sao achadas pelo ICONE do cabecalho, nao por
    // posicao fixa: mundo com edificio a mais deslocaria tudo e a conta sairia calada e errada.
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
          });
        }
      }
    } catch (e) { /* sem producao: a projecao segue, so sai conservadora (avisa na tela) */ }
    return V;
  }

  // Custo da moeda e estado do limite, da propria Academia. Ler daqui — em vez de constante —
  // e o que faz a bandeira de desconto entrar na conta sozinha.
  async function cplLerAcademia(vid) {
    const st = await getSnobState(vid);
    const out = { custo: null, total: null, limite: null, faltam: null, guardadas: null };
    if (st.moedas) { out.limite = st.moedas.limite; out.faltam = st.moedas.faltam; out.guardadas = st.moedas.tem; }
    // O custo aparece na linha do formulario de cunhagem: tres numeros grandes seguidos.
    try {
      const r = await fetch('/game.php?village=' + vid + '&screen=snob', { credentials: 'include' });
      const d = new DOMParser().parseFromString(await r.text(), 'text/html');
      const txt = (d.body ? d.body.textContent : '').replace(/\s+/g, ' ');
      const m = txt.match(/(\d{1,3}(?:\.\d{3})+)\s+(\d{1,3}(?:\.\d{3})+)\s+(\d{1,3}(?:\.\d{3})+)\s*(?:Cunhar|\d+\s*\()/i);
      if (m) out.custo = { wood: +m[1].replace(/\./g, ''), stone: +m[2].replace(/\./g, ''), iron: +m[3].replace(/\./g, '') };
      const mt = txt.match(/Total\s*:?\s*(\d{1,3}(?:\.\d{3})*|\d+)/i);
      if (mt) out.total = +String(mt[1]).replace(/\./g, '');
    } catch (e) { /* fica no que o getSnobState deu */ }
    return out;
  }

  // Quantos nobres a mais um punhado de moedas compra. O limite N custa `1+2+...+N` ACUMULADO —
  // por isso dobrar moeda nao dobra nobre, e por isso a resposta tem que ser calculada e nao
  // estimada por regra de tres.
  function cplNobres(totalAtual, moedasNovas, limiteAtual) {
    const alvo = (totalAtual || 0) + (moedasNovas || 0);
    let n = Math.max(1, limiteAtual || 1);
    while (((n + 1) * (n + 2)) / 2 <= alvo) n++;
    return Math.max(0, n - (limiteAtual || n));
  }

  // Simulacao com o TEMPO CORRENDO. Passo de 15 min: mercador sai, viaja, entrega e volta —
  // e so pode sair de novo quando voltou. E o que separa esta projecao de uma regra de tres:
  // sem a ida-e-volta, a conta enxerga capacidade que na verdade esta na estrada.
  function cplSimular(V, destCoord, horas, comProducao) {
    const dest = V[destCoord]; if (!dest) return null;
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
      S.push({ v: v, wood: v.wood, stone: v.stone, iron: v.iron, d: d,
               ida: (d * CPL_MIN_CAMPO) / 60, rt: (2 * d * CPL_MIN_CAMPO) / 60,
               livre: v.merc, volta: [] });
    });
    const chega = { wood: 0, stone: 0, iron: 0 };
    const marcos = { m50: null, m80: null, m95: null };
    let total = 0;
    S.forEach((s) => ['wood', 'stone', 'iron'].forEach((k) => { total += Math.max(0, s[k] - R[k]); }));
    if (comProducao) S.forEach((s) => { total += (s.v.pw + s.v.ps + s.v.pi) * horas; });
    const PASSO = 0.25;
    for (let t = 0; t < horas; t += PASSO) {
      S.forEach((s) => {
        s.volta = s.volta.filter((x) => { if (x <= t) { s.livre += s.v.merc; return false; } return true; });
        if (comProducao) {
          s.wood = Math.min(s.v.cap, s.wood + s.v.pw * PASSO);
          s.stone = Math.min(s.v.cap, s.stone + s.v.ps * PASSO);
          s.iron = Math.min(s.v.cap, s.iron + s.v.pi * PASSO);
        }
        if (s.livre < CPL_CARGA) return;
        const sobra = {}; let tem = 0;
        ['wood', 'stone', 'iron'].forEach((k) => { sobra[k] = Math.max(0, s[k] - R[k]); tem += sobra[k]; });
        if (tem < CPL_CARGA) return;
        // Mesma regra do envio real (racaoCarteira): enche o mercador pegando sempre o recurso
        // mais atrasado em relacao a razao, contando o que JA chegou.
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
        // Chegada FORA da janela nao conta: o recurso saiu mas nao vira moeda a tempo.
        if (t + s.ida <= horas) ['wood', 'stone', 'iron'].forEach((k) => { chega[k] += env[k]; });
        s.livre -= carga; s.volta.push(t + s.rt);
      });
      const soma = chega.wood + chega.stone + chega.iron;
      if (total > 0) {
        if (marcos.m50 == null && soma / total >= 0.5) marcos.m50 = t;
        if (marcos.m80 == null && soma / total >= 0.8) marcos.m80 = t;
        if (marcos.m95 == null && soma / total >= 0.95) marcos.m95 = t;
      }
    }
    return { chega: chega, marcos: marcos, potencial: total, origens: S.length };
  }

  // Distancia PONDERADA PELO EXCEDENTE — o criterio de sede. Aldeia perto de muita gente pobre
  // vale menos que aldeia perto de poucos armazens cheios, e a media simples nao ve isso.
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

  async function cplPlanejar() {
    if (_cplCarregando) return;
    _cplCarregando = true; _cplErr = null; _cplPlano = null; cplRender();
    try {
      const V = await cplLerAldeias();
      _cplDados = V; _cplAt = Date.now();
      const destAtual = (config.market.destCoords || [])[0] || null;
      // Ranking de sedes: so aldeias suas, pelo criterio ponderado.
      const rank = Object.keys(V).map((c) => ({ coord: c, nome: V[c].nome, d: cplDistPonderada(V, c) }))
        .filter((x) => isFinite(x.d)).sort((a, b) => a.d - b.d);
      const sede = destAtual && V[destAtual] ? destAtual : (rank[0] && rank[0].coord);
      if (!sede) throw new Error('não consegui escolher uma sede');
      const horas = Math.max(1, parseFloat(config.market.cplHoras) || CPL_JANELA_H);
      const semP = cplSimular(V, sede, horas, false);
      const comP = cplSimular(V, sede, horas, true);
      let ac = null;
      try { ac = await cplLerAcademia((await getAllVillagesCached()).filter((x) => x.coord === sede).map((x) => x.vid)[0]); }
      catch (e) { /* sem Academia lida: mostra so o recurso */ }
      _cplPlano = { sede: sede, sedeNome: V[sede].nome, destAtual: destAtual, rank: rank.slice(0, 4),
                    horas: horas, semP: semP, comP: comP, ac: ac,
                    temProducao: Object.values(V).some((v) => v.pw > 0) };
    } catch (e) { _cplErr = e.message || String(e); }
    _cplCarregando = false; cplRender();
  }

  function cplRender() {
    const box = document.getElementById('twmgr-cpl-out'); if (!box) return;
    if (_cplCarregando) { box.innerHTML = '<span class="twmgr-lbl">lendo aldeias, minas e Academia…</span>'; return; }
    if (_cplErr) { box.innerHTML = '<span style="color:#b03030;font-size:10px">' + esc(_cplErr) + '</span>'; return; }
    if (!_cplPlano) { box.innerHTML = '<span class="twmgr-lbl">Clique em <b>Projetar</b>.</span>'; return; }
    const p = _cplPlano, r = p.comP;
    const hm = (h) => (h == null ? '—' : (h < 1 ? Math.round(h * 60) + 'min' : (Math.round(h * 10) / 10) + 'h'));
    const custo = (p.ac && p.ac.custo) || { wood: 28000, stone: 30000, iron: 25000 };
    const moedas = Math.min(Math.floor(r.chega.wood / custo.wood), Math.floor(r.chega.stone / custo.stone),
                            Math.floor(r.chega.iron / custo.iron));
    const moedasSemP = p.semP ? Math.min(Math.floor(p.semP.chega.wood / custo.wood),
      Math.floor(p.semP.chega.stone / custo.stone), Math.floor(p.semP.chega.iron / custo.iron)) : 0;
    const totalAtual = (p.ac && p.ac.total) || null;
    const limite = (p.ac && p.ac.limite != null) ? (p.ac.limite - 1) : null;
    const nob = (totalAtual != null && limite != null) ? cplNobres(totalAtual, moedas, limite) : null;
    // Qual recurso trava — e a pergunta que decide se vale mexer em mina ou em mercado.
    const porRec = { madeira: r.chega.wood / custo.wood, argila: r.chega.stone / custo.stone, ferro: r.chega.iron / custo.iron };
    const gargalo = Object.keys(porRec).sort((a, b) => porRec[a] - porRec[b])[0];
    const trocaSede = p.rank[0] && p.rank[0].coord !== p.sede
      ? p.rank.filter((x) => x.coord !== p.sede)[0] : null;
    box.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:6px;margin-bottom:7px">' +
        ['<b style="font-size:15px;color:#a2643a">' + fmtN(moedas) + '</b><br>moeda(s)',
         (nob != null ? '<b style="font-size:15px;color:#2e7d3a">+' + nob + '</b><br>nobre(s)' : '<span style="color:#8a7d6d">—</span><br>nobres'),
         '<b style="font-size:15px">' + hm(r.marcos.m80) + '</b><br>80% chega',
         '<b style="font-size:15px">' + r.origens + '</b><br>origens'
        ].map((h) => '<div style="background:#fffdf8;border:1px solid #e6dcc9;border-radius:6px;padding:6px;text-align:center;font-size:9px;color:#6f6153">' + h + '</div>').join('') +
      '</div>' +
      '<table class="twmgr-bld-tab" style="width:100%"><tbody>' +
      '<tr><td style="color:#6f6153">Sede</td><td><b>' + esc(p.sedeNome) + '</b> ' + esc(p.sede) +
        (p.destAtual === p.sede ? ' <span style="color:#2e7d3a">(destino atual)</span>' : ' <span style="color:#a2643a">(sugerida)</span>') + '</td></tr>' +
      (trocaSede ? '<tr><td style="color:#6f6153">Alternativa</td><td>' + esc(trocaSede.nome) + ' ' + esc(trocaSede.coord)
        + ' <span style="color:#8a7d6d">— dist. ponderada ' + (Math.round(trocaSede.d * 10) / 10) + ' contra '
        + (Math.round(cplDistPonderada(_cplDados, p.sede) * 10) / 10) + ' da atual</span></td></tr>' : '') +
      '<tr><td style="color:#6f6153">Chega em ' + p.horas + 'h</td><td>' +
        '<span style="color:#8a6a44">' + fmtN(Math.round(r.chega.wood)) + '</span> / ' +
        '<span style="color:#c1743c">' + fmtN(Math.round(r.chega.stone)) + '</span> / ' +
        '<span style="color:#5f7382">' + fmtN(Math.round(r.chega.iron)) + '</span></td></tr>' +
      '<tr><td style="color:#6f6153">Ritmo</td><td>50% em ' + hm(r.marcos.m50) + ' · 80% em ' + hm(r.marcos.m80)
        + ' · 95% em ' + hm(r.marcos.m95) + '</td></tr>' +
      '<tr><td style="color:#6f6153">Custo da moeda</td><td>' + fmtN(custo.wood) + ' / ' + fmtN(custo.stone) + ' / ' + fmtN(custo.iron) +
        (p.ac && p.ac.custo ? ' <span style="color:#2e7d3a">(lido da Academia — desconto já incluso)</span>'
                            : ' <span style="color:#a2643a">(padrão; não consegui ler a Academia)</span>') + '</td></tr>' +
      '<tr><td style="color:#6f6153">Trava</td><td><b style="color:#b03030">' + gargalo + '</b>' +
        ' <span style="color:#8a7d6d">— é ele que limita a cunhagem; sobra dos outros dois fica parada</span></td></tr>' +
      (p.temProducao
        ? '<tr><td style="color:#6f6153">Produção</td><td>vale <b>+' + fmtN(moedas - moedasSemP) + '</b> moeda(s) na janela'
          + ' <span style="color:#8a7d6d">(sem contar ela: ' + fmtN(moedasSemP) + ')</span></td></tr>'
        : '<tr><td style="color:#6f6153">Produção</td><td><span style="color:#a2643a">não consegui ler os níveis de mina — a projeção está por baixo</span></td></tr>') +
      '</tbody></table>' +
      '<div style="font-size:9px;color:#8a7d6d;margin-top:4px">Projeção com mercador a ' + CPL_MIN_CAMPO
      + ' min/campo, respeitando a <b>reserva</b> configurada acima e a mesma razão dos envios reais. '
      + 'Simula ida-e-volta de cada mercador — capacidade em trânsito não conta como disponível. '
      + 'Lido às ' + new Date(_cplAt).toLocaleTimeString('pt-BR') + '.</div>';
  }
