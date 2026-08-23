  // ==================== RELÍQUIAS (onde equipar, e o que fundir) ====================
  // O jogo entrega TUDO pronto na tela `screen=relic_system`: o inventário vem embutido como JSON
  // no HTML, com `range`, `main_stat`, `sub_stats`, onde cada uma está equipada e o cooldown de
  // remoção. Nada aqui raspa DOM da grade paginada nem chuta tabela de qualidade.
  //
  // NADA É HARDCODED DA CONTA DE NINGUÉM. O script é compartilhado entre jogadores diferentes:
  // inventário, aldeias, número de espaços e os limiares que destravam espaço novo são todos
  // lidos ao vivo. O único número fixo é o `expoente` da ponderação, que é escolha de estratégia.
  //
  // MÉTRICA: distância EUCLIDIANA, validada contra o próprio jogo. A aba "Visualização geral"
  // publica "Outras aldeias afetadas: N" para cada relíquia equipada; euclidiana bateu 6/6 num
  // teste real, Chebyshev errou 1. Por isso `relCobertura` usa sqrt e não max().
  //
  // SEM TETO DE EMPILHAMENTO (decisão do usuário, ago/2026): dois bônus do mesmo tipo somam sem
  // saturar. Isso torna cada relíquia INDEPENDENTE — não há trade-off de sobreposição, então a
  // melhor alocação é "cada relíquia na aldeia onde ela rende mais", limitada só pelos espaços e
  // por uma relíquia por aldeia. Se um dia aparecer teto, aqui vira problema de cobertura máxima
  // e a alocação precisa virar gulosa por ganho marginal.

  const REL_URL = '/game.php?screen=relic_system';

  // Extrai o array de relíquias de dentro do HTML. O JSON não está numa variável nomeada, então a
  // âncora é o campo `"range"` (que só existe em relíquia) e daí se anda pros colchetes que
  // delimitam o array, contando profundidade — regex não dá conta de aninhamento.
  function relExtrairJSON(html) {
    const i = html.indexOf('"range"');
    if (i < 0) return null;
    let ini = i, prof = 0;
    for (let k = i; k > 0; k--) {
      if (html[k] === ']') prof++;
      if (html[k] === '[') { if (prof === 0) { ini = k; break; } prof--; }
    }
    let fim = ini, d = 0;
    for (let k = ini; k < html.length; k++) {
      if (html[k] === '[') d++;
      else if (html[k] === ']') { d--; if (d === 0) { fim = k + 1; break; } }
    }
    try {
      const arr = JSON.parse(html.slice(ini, fim));
      return Array.isArray(arr) ? arr : null;
    } catch (e) { return null; }
  }

  async function relLerInventario() {
    const res = await fetch(REL_URL + '&village=' + CUR_VID, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const arr = relExtrairJSON(await res.text());
    if (!arr) throw new Error('não achei o inventário no HTML (a tela mudou?)');
    return arr;
  }

  // Espaços de relíquia. O jogo NÃO publica isso em JSON — está no texto da aba "Visualização
  // geral": um bloco por espaço, uns dizendo "Espaço livre", outros "Obtenha N aldeias para
  // desbloquear". Os limiares variam por mundo, então são LIDOS, nunca fixados.
  async function relLerEspacos() {
    const res = await fetch(REL_URL + '&mode=overview&village=' + CUR_VID, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const t = ((doc.querySelector('#content_value') || doc.body).textContent || '').replace(/\s+/g, ' ');
    const livres = (t.match(/Espa[çc]o livre/gi) || []).length;
    const travados = (t.match(/Obtenha\s+(\d+)\s+aldeias/gi) || [])
      .map((s) => parseInt((s.match(/\d+/) || [])[0], 10)).filter((n) => n).sort((a, b) => a - b);
    // TOTAL DE ESPACOS PELA ESTRUTURA, nao por aritmetica.
    //
    // Antes o total era `livres + reliquias com village_id`, e isso dava 12 numa conta de 10.
    // O erro: nem toda reliquia equipada ocupa espaco — as que estao em cooldown ficam em
    // "Reliquias Inativas" e continuam com village_id. Medido: 10 elementos .relic-slot, 1
    // travado (90 aldeias), 4 livres => 9 desbloqueados e 5 ativas, enquanto o inventario
    // reportava 8 equipadas. As 3 de diferenca eram inativas.
    //
    // Contar o elemento resolve na origem: o jogo desenha um .relic-slot por espaco, travado ou
    // nao. Se a tela mudar e o seletor sumir, cai na conta antiga em vez de devolver zero.
    const nSlots = doc.querySelectorAll('.relic-slot').length;
    const desbloqueados = nSlots ? Math.max(0, nSlots - travados.length) : 0;
    return { livres: livres, proximosLimiares: travados, total: nSlots, desbloqueados: desbloqueados };
  }

  // Unidade e percentual de um stat. A unidade vem do ÍCONE (`.../unit_spear.webp`), não do texto:
  // o nome é traduzido e mudaria de idioma pra idioma. O percentual vem do texto porque só existe
  // lá ("Lanceiro: +6% poder de ataque e defesa").
  function relStat(st) {
    if (!st) return null;
    const img = (st.benefit && st.benefit.img) || st.img || '';
    const mu = String(img).match(/unit_(\w+)\.\w+$/);
    const txt = st.name || (st.benefit && st.benefit.description) || '';
    const mp = String(txt).match(/([+-]?\d+(?:[.,]\d+)?)\s*%/);
    return {
      unidade: mu ? mu[1] : null,
      pct: mp ? Math.abs(parseFloat(String(mp[1]).replace(',', '.'))) : 0,
      texto: String(txt).slice(0, 80),
    };
  }
  function relStats(r) {
    const out = [];
    const m = relStat(r.main_stat); if (m) out.push(Object.assign({ principal: true }, m));
    (r.sub_stats || []).forEach((s) => { const x = relStat(s); if (x) out.push(Object.assign({ principal: false }, x)); });
    return out.filter((s) => s.pct > 0);
  }

  // ===== Preferencias do usuario =====
  //   usar    : quais reliquias entram no plano (vazio = todas as disponiveis)
  //   grupo   : grupo de aldeias a priorizar (id do jogo) — pesa mais na conta
  //   pesoGrupo: quanto a aldeia do grupo vale a mais
  //   objetivo: 'valor' (pondera pela tropa que existe na aldeia) ou 'aldeias' (conta cabeca)
  function relCfg() {
    const c = (config.rel = config.rel || {});
    if (!c.usar) c.usar = {};
    if (c.grupo == null) c.grupo = '';
    if (c.pesoGrupo == null) c.pesoGrupo = 3;
    if (!c.objetivo) c.objetivo = 'valor';
    return c;
  }
  let _relGrupoSet = null;   // vids do grupo priorizado, carregado sob demanda
  function relPeso(v) {
    const c = relCfg();
    if (!c.grupo || !_relGrupoSet) return 1;
    return _relGrupoSet.has(String(v.vid)) ? Math.max(1, c.pesoGrupo) : 1;
  }

  function relDist(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
  // Aldeias MINHAS dentro do raio, sem contar a própria — é a mesma definição do "Outras aldeias
  // afetadas" que o jogo mostra, e foi contra ela que a métrica foi validada.
  function relCobertura(vila, raio, vilas) {
    return vilas.filter((o) => o !== vila && relDist(vila, o) <= raio);
  }

  // Valor de colocar a relíquia R na aldeia V.
  //
  // A própria aldeia CONTA (ela recebe o bônus também) — só não entra em "outras afetadas". Cada
  // stat vale `pct × quantidade da tropa beneficiada` na aldeia coberta: uma relíquia de Cavalaria
  // Pesada num raio de aldeias sem cavalaria pesada vale zero, e é isso que separa "cobrir muita
  // aldeia" de "cobrir aldeia certa".
  //
  // Stat que não é de tropa (produção, velocidade de recrutamento) não tem como ser ponderado por
  // tropa: entra com peso fixo `REL_PESO_GENERICO` por aldeia coberta, pra não sumir da conta.
  const REL_PESO_GENERICO = 50;
  function relValor(r, vila, vilas, tropas) {
    const alvos = [vila].concat(relCobertura(vila, r.range || 0, vilas));
    const stats = relStats(r);
    const objetivo = relCfg().objetivo;
    let total = 0;
    alvos.forEach((a) => {
      const peso = relPeso(a);
      if (objetivo === 'aldeias') {
        // Objetivo 'maximo de aldeias': cada aldeia coberta vale 1 (x prioridade do grupo),
        // independente da tropa que ela tem. E o que responde 'onde alcanco mais aldeias',
        // pergunta diferente de 'onde rendo mais' — uma reliquia de cavalaria pesada cobrindo 12
        // aldeias sem cavalaria pesada ganha aqui e perde no outro criterio, e as duas leituras
        // estao certas pra objetivos diferentes.
        total += peso;
        return;
      }
      const t = tropas[String(a.vid)] || {};
      stats.forEach((s) => {
        total += peso * s.pct * (s.unidade ? (t[s.unidade] || 0) : REL_PESO_GENERICO);
      });
    });
    return { valor: Math.round(total), cobre: alvos.length - 1, alvos: alvos };
  }

  // Relíquia utilizável? Bloqueada, inativa ou anunciada em troca não entra no plano.
  function relDisponivel(r) {
    return !r.locked_state && !r.inactive_until && !r.trade_offer_id;
  }
  // POR QUE uma reliquia ficou de fora. Some da lista era o comportamento antigo, e isso faz o
  // usuario procurar no inventario uma reliquia que o modulo escondeu sem dizer nada. O caso
  // comum e o cooldown: mover uma reliquia trava ela por 24h, e nesse periodo o jogo recusa
  // qualquer movimento — propor posicao pra ela seria propor algo impossivel.
  function relMotivoBloqueio(r) {
    if (r.trade_offer_id) return 'anunciada em troca';
    if (r.inactive_until) return 'em cooldown, faltam ' + String(r.inactive_until);
    if (r.locked_state) return 'bloqueada pelo jogo';
    return null;
  }

  // ===== Sugestão de alocação =====
  // Sem teto de empilhamento cada relíquia é independente, então NÃO é cobertura máxima: é
  // atribuição. Com N espaços, escolhe os N melhores pares (relíquia, aldeia) com aldeias
  // distintas — uma relíquia por aldeia, que é o que os dados do jogo mostram.
  function relSugerir(inv, vilas, tropas, espacos) {
    // Sem nada marcado, entram todas as disponiveis — assim o modulo continua util sem
    // configuracao, e marcar vira um filtro, nao um pre-requisito.
    const sel = relCfg().usar || {};
    const algumaMarcada = Object.keys(sel).some((k) => sel[k]);
    const usaveis = inv.filter(relDisponivel).filter((r) => !algumaMarcada || sel[r.id]);
    // TODOS os pares (reliquia, aldeia), nao so o melhor de cada reliquia.
    //
    // Guardar so o melhor parecia economia e era um defeito: como cada aldeia recebe UMA
    // reliquia, quando varias apontam pro mesmo lugar todas menos uma sao descartadas — em vez
    // de caírem pra segunda opcao delas.
    //
    // No criterio de rendimento isso ficava escondido, porque cada tipo de tropa puxa pra uma
    // aldeia diferente. No criterio de alcance a densidade e a mesma pra todas, entao quase
    // todas queriam a aldeia mais central. Medido na conta: 12 espacos e o plano saia com DUAS
    // reliquias, cobertura somada 37. Com todos os pares: 12 reliquias, cobertura 143.
    //
    // Custo: 16 reliquias x 80 aldeias = 1.280 pares. E nada.
    const pares = [];
    usaveis.forEach((r) => {
      vilas.forEach((v) => {
        const c = relValor(r, v, vilas, tropas);
        if (c.valor > 0) pares.push({ r: r, v: v, valor: c.valor, cobre: c.cobre });
      });
    });
    pares.sort((a, b) => b.valor - a.valor);
    const plano = [], vilaUsada = {}, relUsada = {};
    for (const p of pares) {
      if (plano.length >= espacos) break;
      if (vilaUsada[p.v.coord] || relUsada[p.r.id]) continue;
      vilaUsada[p.v.coord] = 1; relUsada[p.r.id] = 1;
      plano.push(p);
    }
    return plano;
  }

  // ===== O que está equipado hoje, e quanto perde =====
  // Compara cada equipada com o MELHOR lugar dela. `ganho` é o que se ganharia movendo — e o
  // cooldown de remoção entra no relatório porque mover custa tempo real (24h no mundo medido).
  function relAvaliarEquipadas(inv, vilas, tropas) {
    return inv.filter((r) => r.village_id).map((r) => {
      const atual = vilas.filter((v) => String(v.vid) === String(r.village_id))[0] || null;
      const hoje = atual ? relValor(r, atual, vilas, tropas) : { valor: 0, cobre: 0 };
      let melhor = null;
      vilas.forEach((v) => {
        const c = relValor(r, v, vilas, tropas);
        if (!melhor || c.valor > melhor.valor) melhor = { v: v, valor: c.valor, cobre: c.cobre };
      });
      return {
        // `inactive_until` é COOLDOWN, não excesso de espaço — eu tinha diagnosticado errado.
        // Mover uma relíquia trava ela por 24h: ela continua com village_id, some dos espaços
        // ativos e cai na seção "Relíquias Inativas" com um relógio regressivo. Medido logo
        // depois de uma troca: 9 espaços desbloqueados, 6 ocupados, 9 com village_id — as 3 de
        // diferença tinham 17:36:54, 10:50:15 e 9:35:22 pra voltar.
        //
        // Consequência prática: nesse período o jogo RECUSA mover a peça. Propor posição pra ela
        // seria propor algo impossível, então ela fica fora do plano até o relógio zerar.
        inativa: !!r.inactive_until,
        faltaCooldown: r.inactive_until ? String(r.inactive_until) : '',
        r: r, atual: atual, valorHoje: hoje.valor, cobreHoje: hoje.cobre,
        melhorVila: melhor ? melhor.v : null, melhorValor: melhor ? melhor.valor : 0,
        melhorCobre: melhor ? melhor.cobre : 0,
        ganho: melhor ? (melhor.valor - hoje.valor) : 0,
        cooldownH: Math.round((r.remaining_removal_cooldown || 0) / 3600),
      };
    }).sort((a, b) => b.ganho - a.ganho);
  }

  // ===== Fusões =====
  // A tela diz: três do MESMO tipo e qualidade -> uma de qualidade superior; três de tipos
  // diferentes e mesma qualidade -> uma aleatória de qualidade superior. Com poucos espaços, a
  // maioria do inventário nunca vai ser equipada — fundir é o que transforma volume em alcance.
  function relFusoes(inv) {
    const porTipoQual = {}, porQual = {};
    inv.filter(relDisponivel).filter((r) => !r.village_id).forEach((r) => {
      const k = r.type + '|' + r.quality;
      (porTipoQual[k] = porTipoQual[k] || []).push(r);
      (porQual[r.quality] = porQual[r.quality] || []).push(r);
    });
    const mesmas = Object.keys(porTipoQual).filter((k) => porTipoQual[k].length >= 3)
      .map((k) => ({ tipo: k.split('|')[0], qual: k.split('|')[1], n: porTipoQual[k].length,
                     fusoes: Math.floor(porTipoQual[k].length / 3) }))
      .sort((a, b) => b.fusoes - a.fusoes);
    const mistas = Object.keys(porQual).map((q) => ({ qual: q, n: porQual[q].length,
                     fusoes: Math.floor(porQual[q].length / 3) }))
      .filter((x) => x.fusoes > 0).sort((a, b) => b.fusoes - a.fusoes);
    return { mesmoTipo: mesmas, mesmaQualidade: mistas };
  }

  // ===== Ciclo =====
  // O plano so e montado quando o usuario clica em Propor localizacao. Analisar apenas LE (o que
  // e barato e sem consequencia); propor e a etapa em que ele ja escolheu as reliquias e quer a
  // resposta. Separar as duas evita a leitura devolver um plano feito com selecao antiga.
  let _relPropos = false;
  let _relDados = null;
  async function relAnalisar() {
    const btn = document.getElementById('twmgr-rel-ler');
    if (btn) { btn.disabled = true; btn.textContent = 'lendo…'; }
    try {
      const inv = await relLerInventario();
      const esp = await relLerEspacos().catch(() => ({ livres: 0, proximosLimiares: [] }));
      const todas = await getAllVillagesCached();
      const vilas = [];
      todas.forEach((v) => {
        const m = (v.coord || '').match(/(\d+)\|(\d+)/);
        if (m) vilas.push({ vid: v.vid, nome: v.name || v.coord, coord: v.coord, x: +m[1], y: +m[2] });
      });
      let tropas = {};
      try { tropas = await getHomeUnitsAll(); } catch (e) { tropas = {}; }
      // Grupo priorizado: resolvido AGORA, antes de qualquer conta de valor. Se ficasse pra
      // depois, a primeira analise sairia sem prioridade e a segunda com ela — mesmo botao,
      // resultado diferente.
      _relGrupoSet = null;
      const cfgR = relCfg();
      if (cfgR.grupo) {
        try { _relGrupoSet = new Set((await getVillagesInGroup(cfgR.grupo)).map((v) => String(v.vid))); }
        catch (e) { pushLog('Reliquias: nao li o grupo priorizado (' + (e.message || e) + ') - seguindo sem prioridade.', 'err', 'rel'); }
      }
      const equipadas = inv.filter((r) => r.village_id).length;
      // Espacos que valem = os DESBLOQUEADOS lidos da tela. Só cai na soma antiga se o seletor
      // de slot nao existir mais — e ai o numero pode inflar por reliquia inativa, entao o
      // relatorio avisa.
      const espacos = esp.desbloqueados || (esp.livres + equipadas);
      const ativas = esp.desbloqueados ? Math.max(0, esp.desbloqueados - esp.livres) : equipadas;
      const inativas = Math.max(0, equipadas - ativas);
      _relDados = {
        at: Date.now(), inv: inv, vilas: vilas, tropas: tropas,
        espacos: espacos, livres: esp.livres, proximosLimiares: esp.proximosLimiares,
        totalSlots: esp.total || 0, ativas: ativas, inativas: inativas,
        equipadasAval: relAvaliarEquipadas(inv, vilas, tropas),
        plano: _relPropos ? relSugerir(inv, vilas, tropas, espacos) : [],
        fusoes: relFusoes(inv),
        semTropa: !Object.keys(tropas).length,
      };
      renderReliquias();
      pushLog('Relíquias: ' + inv.length + ' no inventário · ' + espacos + ' espaço(s) desbloqueado(s)'
        + ' (' + ativas + ' em uso, ' + esp.livres + ' livre(s))'
        + (inativas ? (' · ' + inativas + ' equipada(s) em COOLDOWN de 24h') : '') + '.', 'ok', 'rel');
    } catch (e) {
      pushLog('Relíquias: ' + (e.message || e), 'err', 'rel');
      const box = document.getElementById('twmgr-rel-corpo');
      if (box) box.innerHTML = '<div class="twmgr-hint" style="color:#b03030">Não consegui ler: ' + esc(String(e.message || e)) + '</div>';
    } finally { if (btn) { btn.disabled = false; btn.textContent = '↻ Analisar'; } }
  }

  function relNomeQual(q) {
    return ({ shoddy: 'De má qualidade', polished: 'Resistente', refined: 'Aprimorado',
              superior: 'Superior', renowned: 'Reconhecido' })[q] || q;
  }

  function renderReliquias() {
    const box = document.getElementById('twmgr-rel-corpo'); if (!box) return;
    const D = _relDados;
    if (!D) { box.innerHTML = '<div class="twmgr-hint">Clique em <b>↻ Analisar</b> pra ler o inventário e as suas aldeias.</div>'; return; }
    const n = (v) => fmtN(v);
    const cab = '<div class="twmgr-bld-sum">'
      + '<span class="twmgr-chip"><b>' + D.inv.length + '</b> relíquias</span>'
      + '<span class="twmgr-chip"><b>' + D.espacos + '</b> espaços</span>'
      + (D.inativas ? '<span class="twmgr-chip" style="color:#b03030"><b>' + D.inativas + '</b> em cooldown</span>' : '')
      + '<span class="twmgr-chip"><b>' + D.livres + '</b> livre(s)</span>'
      + '<span class="twmgr-chip"><b>' + D.vilas.length + '</b> aldeias</span>'
      + (D.proximosLimiares.length ? '<span class="twmgr-chip">próximo espaço com <b>' + D.proximosLimiares[0] + '</b> aldeias</span>' : '')
      + '</div>';
    const aviso = D.semTropa
      ? '<div class="twmgr-hint" style="color:#b5651d">Não consegui ler a tropa das aldeias — o valor está contando só os efeitos que não dependem de tropa. Os números de <b>cobre</b> continuam certos.</div>'
      : '';
    // --- equipadas ---
    const eq = D.equipadasAval;
    const tEq = !eq.length ? '<div class="twmgr-hint">Nenhuma relíquia equipada.</div>'
      : '<table class="twmgr-bld-tab"><thead><tr><th>Relíquia</th><th>Onde está</th>'
        + '<th style="width:44px" title="Outras aldeias suas dentro do alcance">cobre</th>'
        + '<th>Melhor lugar</th><th style="width:44px">cobre</th>'
        + '<th style="width:56px" title="Quanto o valor sobe se mover">ganho</th></tr></thead><tbody>'
        + eq.map((x, i) => {
          const vale = x.ganho > 0 && x.melhorVila && x.melhorVila.coord !== (x.atual && x.atual.coord);
          return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">'
            + '<td><b>' + esc(x.r.name || '') + '</b><div class="sub">' + esc(relNomeQual(x.r.quality)) + ' · alcance ' + (x.r.range || '?')
              + (x.inativa ? ' · <span style="color:#b03030">EM COOLDOWN'
                  + (x.faltaCooldown ? (' — faltam ' + esc(x.faltaCooldown)) : '') + '</span>' : '') + '</div></td>'
            + '<td>' + esc(x.atual ? x.atual.nome : '?') + '<div class="sub">' + esc(x.atual ? x.atual.coord : '') + '</div></td>'
            + '<td' + (x.cobreHoje === 0 ? ' style="color:#b03030;font-weight:700"' : '') + '>' + x.cobreHoje + '</td>'
            + '<td>' + (vale ? '<b style="color:#3f8f52">' + esc(x.melhorVila.nome) + '</b><div class="sub">' + esc(x.melhorVila.coord) + '</div>'
                             : '<span style="color:#8a7340">já está no melhor</span>') + '</td>'
            + '<td>' + x.melhorCobre + '</td>'
            + '<td>' + (vale ? '<b style="color:#3f8f52">+' + n(x.ganho) + '</b>'
                + (x.cooldownH ? '<div class="sub" style="color:#b5651d">trava ' + x.cooldownH + 'h</div>' : '')
                : '—') + '</td></tr>';
        }).join('') + '</tbody></table>';
    // --- plano ---
    const tPl = !_relPropos
      ? '<div class="twmgr-hint">Marque as relíquias que quer usar e clique em <b>🎯 Propor localização</b>.</div>'
      : !D.plano.length ? '<div class="twmgr-hint">Sem sugestão — nenhuma relíquia selecionada está disponível.</div>'
      : '<table class="twmgr-bld-tab"><thead><tr><th style="width:22px">#</th><th>Relíquia</th><th>Aldeia</th>'
        + '<th style="width:44px">cobre</th><th style="width:56px">valor</th></tr></thead><tbody>'
        + D.plano.map((p, i) => '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">'
          + '<td>' + (i + 1) + '</td>'
          + '<td><b>' + esc(p.r.name || '') + '</b><div class="sub">' + esc(relNomeQual(p.r.quality)) + ' · alcance ' + (p.r.range || '?')
            + (p.r.village_id ? ' · <span style="color:#b5651d">já equipada</span>' : '') + '</div></td>'
          + '<td>' + esc(p.v.nome) + '<div class="sub">' + esc(p.v.coord) + '</div></td>'
          + '<td>' + p.cobre + '</td><td><b>' + n(p.valor) + '</b></td></tr>').join('') + '</tbody></table>';
    // --- fusões ---
    const f = D.fusoes;
    const tFu = (!f.mesmoTipo.length && !f.mesmaQualidade.length)
      ? '<div class="twmgr-hint">Nada a fundir — não há 3 do mesmo grupo sobrando.</div>'
      : (f.mesmoTipo.length ? '<div style="font-size:9px;color:#6f6153;margin:2px 0 3px">Mesmo tipo <b>e</b> qualidade → sobe de qualidade <b>mantendo o tipo</b>:</div>'
          + '<div class="twmgr-bld-sum">' + f.mesmoTipo.slice(0, 8).map((x) =>
            '<span class="twmgr-chip">' + esc(x.tipo) + ' ' + esc(relNomeQual(x.qual)) + ': <b>' + x.fusoes + '</b>× (tem ' + x.n + ')</span>').join('') + '</div>' : '')
        + (f.mesmaQualidade.length ? '<div style="font-size:9px;color:#6f6153;margin:6px 0 3px">Só mesma qualidade → sobe de qualidade com <b>tipo aleatório</b>:</div>'
          + '<div class="twmgr-bld-sum">' + f.mesmaQualidade.map((x) =>
            '<span class="twmgr-chip">' + esc(relNomeQual(x.qual)) + ': até <b>' + x.fusoes + '</b>× (tem ' + x.n + ')</span>').join('') + '</div>' : '');
    // --- controles: o que usar, o que priorizar, e o que otimizar ---
    const cR = relCfg();
    const usaveisR = D.inv.filter(relDisponivel);
    const nMarc = Object.keys(cR.usar || {}).filter((k) => cR.usar[k]).length;
    const ctl = '<div style="border:1px solid #ece4d8;border-radius:6px;padding:6px;margin:8px 0;background:#fbf7ee">'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:10px">'
        + '<span style="color:#6f6153">Otimizar</span>'
        + '<select id="twmgr-rel-obj" class="twmgr-inp" style="width:200px;font-size:10px;padding:1px">'
          + '<option value="valor"' + (cR.objetivo === 'valor' ? ' selected' : '') + '>rendimento (pondera pela tropa)</option>'
          + '<option value="aldeias"' + (cR.objetivo === 'aldeias' ? ' selected' : '') + '>alcance (numero de aldeias)</option>'
        + '</select>'
        + '<span style="color:#6f6153;margin-left:4px">Priorizar grupo</span>'
        + '<select id="twmgr-rel-grupo" class="twmgr-inp" style="width:120px;font-size:10px;padding:1px"><option value="">nenhum</option></select>'
        + '<span style="color:#6f6153">peso</span>'
        + '<input id="twmgr-rel-peso" class="twmgr-inp" type="number" min="1" max="20" value="' + cR.pesoGrupo + '" style="width:44px;font-size:10px;padding:1px">'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0 2px">'
        + '<span style="font-size:10px;color:#6f6153">Reliquias no plano <span style="color:#8a7d6d">('
          + (nMarc ? (nMarc + ' marcada(s)') : 'nenhuma marcada = usa todas') + ')</span></span>'
        + '<span style="font-size:9px"><a id="twmgr-rel-todas" style="cursor:pointer;color:#2e7d3a">marcar todas</a> - '
          + '<a id="twmgr-rel-nenhuma" style="cursor:pointer;color:#c0483a">limpar</a></span>'
      + '</div>'
      + '<div style="max-height:170px;overflow-y:auto;background:#fff;border:1px solid #ece4d8;border-radius:5px;padding:3px">'
        + (usaveisR.length ? usaveisR.map((r) =>
            '<label style="display:flex;gap:5px;align-items:center;font-size:10px;padding:1px 3px;cursor:pointer">'
            + '<input type="checkbox" class="twmgr-rel-cb" data-id="' + esc(String(r.id)) + '"' + (cR.usar[r.id] ? ' checked' : '') + '>'
            + '<b>' + esc(r.name || '') + '</b>'
            + '<span style="color:#8a7d6d">' + esc(relNomeQual(r.quality)) + ' - alcance ' + (r.range || '?')
            + (r.village_id ? ' - equipada' : '') + '</span></label>').join('')
          : '<div style="color:#8a7d6d;font-size:10px;padding:4px">nenhuma reliquia disponivel</div>')
        // Bloqueadas aparecem DESABILITADAS com o motivo, em vez de sumir. Some da lista faz o
        // usuario procurar no inventario uma reliquia que o modulo escondeu calado.
        + D.inv.filter((r) => !relDisponivel(r)).map((r) =>
            '<label style="display:flex;gap:5px;align-items:center;font-size:10px;padding:1px 3px;opacity:.55" '
            + 'title="nao entra no plano enquanto estiver assim">'
            + '<input type="checkbox" disabled>'
            + '<b>' + esc(r.name || '') + '</b>'
            + '<span style="color:#b5651d">' + esc(relMotivoBloqueio(r) || 'indisponivel') + '</span></label>').join('')
      + '</div>'
      + '<button id="twmgr-rel-propor" class="twmgr-btn twmgr-go" style="width:100%;margin-top:6px;padding:3px">'
        + '🎯 Propor localizacao</button>'
      + '</div>';
    box.innerHTML = cab + aviso + ctl
      + '<div style="font-size:10px;color:#8b5426;font-weight:600;margin:9px 0 3px">Equipadas — vale mover?</div>' + tEq
      + '<div style="font-size:10px;color:#8b5426;font-weight:600;margin:11px 0 3px">Melhor alocação pros ' + D.espacos + ' espaços</div>' + tPl
      + '<div style="font-size:10px;color:#8b5426;font-weight:600;margin:11px 0 3px">Fusões possíveis</div>' + tFu
      + '<div style="font-size:9px;color:#8a7d6d;margin-top:8px"><b>valor</b> = soma, nas aldeias cobertas, de (percentual do efeito × quantidade da tropa que ele beneficia). '
      + 'Efeito que não é de tropa (produção, recrutamento) entra com peso fixo. Serve pra comparar opções entre si, não é "% de ganho".</div>'
      + '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Distância <b>euclidiana</b>, conferida contra o "Outras aldeias afetadas" que o próprio jogo publica. '
      + 'O módulo <b>não equipa nada</b>: mover tem cooldown de remoção, então a decisão é sua.</div>';
    relLigarControles();
  }

  // Refaz o plano com os dados JA LIDOS. Mudar peso ou selecao nao precisa reler o jogo — e o que
  // deixa mexer nos controles e ver o efeito na hora, em vez de esperar uma releitura inteira.
  // Trocar o GRUPO e a excecao: os membros vem do servidor, entao ali relê.
  function relRecalcular() {
    if (!_relDados) return;
    const D = _relDados;
    D.equipadasAval = relAvaliarEquipadas(D.inv, D.vilas, D.tropas);
    D.plano = relSugerir(D.inv, D.vilas, D.tropas, D.espacos);
    renderReliquias();
  }
  function relLigarControles() {
    const c = relCfg();
    const obj = document.getElementById('twmgr-rel-obj');
    if (obj) obj.onchange = () => { relCfg().objetivo = obj.value; save(); relRecalcular(); };
    const peso = document.getElementById('twmgr-rel-peso');
    if (peso) peso.onchange = () => {
      relCfg().pesoGrupo = Math.max(1, Math.min(20, parseInt(peso.value, 10) || 3));
      save(); relRecalcular();
    };
    document.querySelectorAll('.twmgr-rel-cb').forEach((el) => {
      el.onchange = () => {
        const cc = relCfg();
        if (el.checked) cc.usar[el.getAttribute('data-id')] = 1;
        else delete cc.usar[el.getAttribute('data-id')];
        save(); relRecalcular();
      };
    });
    const todas = document.getElementById('twmgr-rel-todas');
    if (todas) todas.onclick = () => {
      const cc = relCfg();
      (_relDados ? _relDados.inv.filter(relDisponivel) : []).forEach((r) => { cc.usar[r.id] = 1; });
      save(); relRecalcular();
    };
    const propor = document.getElementById('twmgr-rel-propor');
    if (propor) propor.onclick = () => { _relPropos = true; relRecalcular(); };
    const nenhuma = document.getElementById('twmgr-rel-nenhuma');
    if (nenhuma) nenhuma.onclick = () => { relCfg().usar = {}; save(); relRecalcular(); };
    const g = document.getElementById('twmgr-rel-grupo');
    if (g && !g.dataset.pronto) {
      g.dataset.pronto = '1';
      getGroups().then((gs) => {
        g.innerHTML = '<option value="">nenhum</option>' + gs.map((x) =>
          '<option value="' + x.id + '"' + (String(c.grupo) === String(x.id) ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');
      }).catch(() => {});
      g.onchange = () => { relCfg().grupo = g.value; save(); relAnalisar(); };
    }
  }
