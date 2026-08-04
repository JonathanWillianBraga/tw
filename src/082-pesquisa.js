  // ==================== PESQUISA (modelos de prioridade aplicados por aldeia) ====================
  // Espelha o "Gerente de conta -> Pesquisa" do jogo (screen=am_research) e funciona SEM Premium:
  // N modelos nomeados, cada um com uma ORDEM de tropas, atribuidos por aldeia. A cada ciclo, para
  // cada aldeia gerenciada, anda a ordem do modelo e pesquisa a primeira tropa que ainda falta.
  //
  // Reusa o que ja estava provado, em vez de reimplementar:
  //   getSmithTechs/smithResearch  (085-obra) -- endpoint do Ferreiro confirmado ao vivo via DevTools
  //   getMarketState/sendMarketResources (075-mercado) -- transferencia em 2 etapas
  //   fieldDist (100-barbaros-mapa), getVillagesInGroup/getAllVillagesCached (030/040)
  // Sao funcoes hoisted no mesmo escopo (ver CLAUDE.md), entao a ordem dos arquivos nao importa.

  // PESQ_ORDEM_PADRAO vive no 010-core: o normalizador do config (`let config = load()`) roda na
  // avaliação do 010, antes deste arquivo — const declarada aqui cairia em TDZ e derrubaria tudo.

  // CONFIRMADO no console (br141): BuildingSmith.techs.available[unidade] tem SO estes campos --
  //   id, name, level, level_after, level_highest, downgrades, error_level, image_state, image
  // Ou seja: NAO existe can_research, NAO existe error_buildings, e NAO existe custo nem
  // error_resources. Entao nao da pra saber de antemao se a pesquisa vai passar: a unica fonte de
  // verdade e TENTAR e ler a resposta do servidor. Este classificador traduz a resposta em algo
  // acionavel; o texto cru vai pro log quando nao reconheco, pra dar pra ajustar sem chutar.
  // Predio que cada pesquisa exige (canonico do Tribal Wars). Serve pra transformar
  // "falta predio" num recado acionavel: o usuario precisa saber QUAL predio subir.
  const PESQ_PREDIO = {
    spear: 'Quartel', sword: 'Quartel', axe: 'Quartel', archer: 'Quartel',
    spy: 'Estabulo', light: 'Estabulo', marcher: 'Estabulo', heavy: 'Estabulo',
    ram: 'Oficina', catapult: 'Oficina',
  };

  function pesqClassificarErro(msg) {
    // Regex de proposito SEM ACENTO: comparo contra a mensagem em minusculas com os acentos
    // removidos. Classe de caractere com acento dentro de fonte gerada por script e um convite a
    // escape mal escrito -- ja aconteceu aqui (saiu [u00edi] em vez de [ii]) e o classificador
    // silenciosamente parou de reconhecer as mensagens acentuadas do jogo.
    const m = String(msg || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Texto real do br141: "Requerimentos necessarios nao atingidos" (Ariete sem Oficina).
    if (/requerimento|requisito|edificio|ferreiro|estabulo|oficina|building/.test(m)) return 'predio';
    if (/recurso|materia|insufficient|suficiente/.test(m)) return 'recurso';
    if (/andamento|em curso|already|ja esta/.test(m)) return 'andando';
    return 'desconhecido';
  }

  // Candidatas a pesquisar, NA ORDEM do modelo. Dois campos bastam e ambos existem de verdade:
  // `level` (nivel atual) e `level_highest` (teto). `error_level` e o jeito do jogo dizer "nao ha
  // nivel a subir aqui".
  //
  // Devolve LISTA, nao a primeira: um item travado por requisito (Ariete sem Oficina, p.ex.) nao
  // pode parar a ordem inteira -- prioridade significa "se essa nao da, tenta a proxima". Sem isso
  // a aldeia ficava presa no Ariete pra sempre e nunca pesquisava Lanc./Espad./C.pes.
  function pesqCandidatos(techs, ordem, bloqueios, agora) {
    const ttl = Math.max(1, config.research.blockTtlH || 6) * 3600 * 1000;
    const out = [];
    for (const tech of ordem) {
      const t = techs[tech];
      if (!t) continue;                                   // tropa que nao existe neste mundo
      const nivel = parseInt(t.level, 10) || 0;
      const teto = parseInt(t.level_highest, 10) || parseInt(t.max_level, 10) || 1;
      if (nivel >= teto) continue;                        // ja no maximo
      if (t.error_level) continue;                        // o jogo diz que nao ha nivel a subir
      // Recusada por requisito faz pouco tempo? Nao insiste -- predio nao nasce em 15 min. O TTL
      // existe pra ela voltar a ser tentada depois que o Construcoes tiver subido a Oficina.
      if (bloqueios[tech] && (agora - bloqueios[tech]) < ttl) continue;
      out.push(tech);
    }
    return out;
  }

  // Puxa recurso da aldeia mais PROXIMA que tem excedente. "Excedente" = acima de
  // config.research.feedReserve% do armazem dela -- a mesma ideia do Solidario do Mercado, mas aqui
  // o gatilho e uma pesquisa que o servidor recusou por falta de recurso, nao um limiar periodico.
  async function pesqAbastecer(alvo, fontes, cacheFonte) {
    const cm = (alvo.coord || '').match(/(\d+)\|(\d+)/);
    if (!cm) return { enviou: false, motivo: 'aldeia sem coordenada' };
    const ax = +cm[1], ay = +cm[2];

    let ms; try { ms = await getMarketState(alvo.vid); } catch (e) { return { enviou: false, motivo: 'nao li o mercado do destino' }; }
    if (!ms.storage) return { enviou: false, motivo: 'armazem do destino ilegivel' };

    // A tela do Ferreiro nao informa o custo da pesquisa (conferido ao vivo), entao nao da pra
    // pedir o valor exato: enche os tres recursos ate feedFillPct% do armazem e deixa o proximo
    // ciclo tentar de novo. Pedir demais nao machuca -- o teto abaixo impede transbordo.
    const teto = ms.storage * ((config.research.feedFillPct != null ? config.research.feedFillPct : 60) / 100);
    const falta = {
      wood: Math.max(0, teto - ms.wood),
      stone: Math.max(0, teto - ms.stone),
      iron: Math.max(0, teto - ms.iron),
    };
    // Nunca pede mais do que cabe no armazem (senao transborda e o recurso vira lixo).
    ['wood', 'stone', 'iron'].forEach((r) => { falta[r] = Math.floor(Math.min(falta[r], Math.max(0, ms.storage - ms[r]))); });
    if (falta.wood + falta.stone + falta.iron <= 0) return { enviou: false, motivo: 'nada faltando' };

    const maxDist = config.research.feedMaxDist != null ? config.research.feedMaxDist : 20;
    const perto = fontes
      .map((f) => { const c = (f.coord || '').match(/(\d+)\|(\d+)/); return c ? { f: f, d: fieldDist(+c[1], +c[2], ax, ay) } : null; })
      .filter((o) => o && o.f.vid !== alvo.vid && o.d <= maxDist)
      .sort((a, b) => a.d - b.d);
    if (!perto.length) return { enviou: false, motivo: 'nenhuma aldeia dentro de ' + maxDist + ' campos' };

    const reservaPct = (config.research.feedReserve != null ? config.research.feedReserve : 40) / 100;
    let enviou = false, mandado = 0;
    for (const o of perto) {
      if (falta.wood + falta.stone + falta.iron <= 0) break;
      const fv = o.f;
      let fs = cacheFonte[fv.vid];
      if (!fs) {
        try { fs = cacheFonte[fv.vid] = await getMarketState(fv.vid); }
        catch (e) { cacheFonte[fv.vid] = { capacity: 0, storage: 0 }; continue; }
      }
      if (!fs.capacity || !fs.storage) continue;
      const piso = fs.storage * reservaPct;   // o excedente e o que passa da reserva
      const pode = {
        wood: Math.max(0, fs.wood - piso), stone: Math.max(0, fs.stone - piso), iron: Math.max(0, fs.iron - piso),
      };
      let amt = {
        wood: Math.floor(Math.min(falta.wood, pode.wood)),
        stone: Math.floor(Math.min(falta.stone, pode.stone)),
        iron: Math.floor(Math.min(falta.iron, pode.iron)),
      };
      let tot = amt.wood + amt.stone + amt.iron;
      if (tot <= 0) continue;
      // Cabe nos mercadores? Se nao, manda proporcional -- o resto sai da proxima fonte/ciclo.
      if (tot > fs.capacity) {
        const f = fs.capacity / tot;
        amt = { wood: Math.floor(amt.wood * f), stone: Math.floor(amt.stone * f), iron: Math.floor(amt.iron * f) };
        tot = amt.wood + amt.stone + amt.iron;
      }
      if (tot <= 0) continue;
      try {
        await sendMarketResources(fv.vid, alvo.coord, amt);
        enviou = true; mandado += tot;
        pushLog('Pesquisa (abastece): ' + (fv.name || fv.coord) + ' -> ' + (alvo.name || alvo.coord) +
                ' (' + amt.wood + '/' + amt.stone + '/' + amt.iron + ', ' + (Math.round(o.d * 10) / 10) + ' campos)', 'ok', 'research');
        // Desconta na memoria pra nao prometer o mesmo recurso duas vezes no mesmo ciclo.
        fs.wood -= amt.wood; fs.stone -= amt.stone; fs.iron -= amt.iron;
        fs.capacity -= tot;
        falta.wood -= amt.wood; falta.stone -= amt.stone; falta.iron -= amt.iron;
      } catch (e) { /* alvo/erro -> tenta a proxima fonte */ }
      await sleep(250);
    }
    return { enviou: enviou, total: mandado, motivo: enviou ? null : 'nenhuma fonte com excedente no alcance' };
  }

  // Trava de reentrancia: `researchStart` chama o tick direto, e o agendamento tambem. Clicar
  // Iniciar com um ciclo em voo fazia DOIS lacos concorrentes na mesma conta -- no log real deu
  // linha duplicada pra mesma aldeia no mesmo segundo, e o mesmo POST tentado duas vezes.
  let _pesqEmVoo = false;
  async function researchTick() {
    clearTimeout(researchTimer);
    if (!config.research.running) return;
    if (_pesqEmVoo) { researchTimer = setTimeout(researchTick, 5000); return; }
    if (lockOther()) { researchTimer = setTimeout(researchTick, 5000); return; }
    if (captchaBlocked()) { researchTimer = setTimeout(researchTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.research.nextAt || 0) > now) { scheduleResearch(); return; }

    const assign = config.research.villages || {};
    const ativas = Object.keys(assign).filter((v) => !assign[v].paused && config.research.templates[assign[v].tpl]);
    if (!ativas.length) {
      pushLog('Pesquisa: nenhuma aldeia ativa - carregue a lista, marque as aldeias e aplique um modelo.', '', 'research');
      config.research.nextAt = now + 300000; save(); scheduleResearch(); return;
    }

    // Fontes de recurso pro abastecimento = todas as aldeias da conta. Uma aldeia gerenciada tambem
    // pode doar (se estiver acima da reserva), porque pesquisa de uma nao concorre com a da outra.
    let todas = [];
    if (config.research.feedOn) { try { todas = await getAllVillagesCached(); } catch (e) {} }
    const cacheFonte = {};

    _pesqEmVoo = true;
    // Agregado do ciclo: tropa travada -> quantas aldeias. Vira UMA linha no fim, em vez de uma
    // por aldeia (44 aldeias davam ~60 linhas de log por ciclo).
    const travadasPorTropa = {};
    let pesquisadas = 0, abastecidas = 0, completas = 0, semPredio = 0, andando = 0;
    for (const vid of ativas) {
      { const pare = devoParar('research'); if (pare) { pushLog('Pesquisa: ciclo interrompido - ' + pare + '.', '', 'research'); break; } }
      const alvo = assign[vid];
      const modelo = config.research.templates[alvo.tpl] || {};
      const ordem = (modelo.order || []).filter((u) => u);
      const rotulo = alvo.name || alvo.coord || vid;
      if (!ordem.length) { pushLog('Pesquisa: o modelo "' + (modelo.name || alvo.tpl) + '" esta vazio.', '', 'research'); continue; }

      let techs;
      try { techs = await getSmithTechs(vid); }
      catch (e) {
        // Ferreiro nivel 0 nao tem BuildingSmith.techs -- e situacao normal, nao erro do script.
        pushLog('Pesquisa em ' + rotulo + ': ' + (e.message || e), '', 'research');
        continue;
      }

      const nomeTropa = (t) => { const u = UNITS.find((x) => x[0] === t); return u ? u[1] : t; };
      config.research.blocked = config.research.blocked || {};
      const bloqueios = config.research.blocked[vid] = config.research.blocked[vid] || {};
      const candidatas = pesqCandidatos(techs, ordem, bloqueios, now);
      if (!candidatas.length) { completas++; continue; }   // tudo pesquisado, ou o resto esta travado

      // Nao existe campo dizendo se da pra pesquisar agora: tenta e le a resposta do servidor.
      // Anda a lista ate uma passar; requisito nao atendido apenas pula pra proxima da ordem.
      let feito = false, faltouRecurso = null, travadas = 0;
      for (const tech of candidatas) {
        let erro = null;
        try {
          await smithResearch(vid, tech);
          pesquisadas++; feito = true;
          delete bloqueios[tech];
          pushLog('Pesquisa: ' + rotulo + ' -> ' + nomeTropa(tech) + ' iniciada.', 'ok', 'research');
          break;
        } catch (e) { erro = e.message || String(e); }

        const tipo = pesqClassificarErro(erro);
        if (tipo === 'predio') {
          // Lembra o bloqueio: sem isso sao N POSTs recusados por ciclo, pra sempre.
          bloqueios[tech] = now; travadas++;
          travadasPorTropa[tech] = (travadasPorTropa[tech] || 0) + 1;
          await sleep(250);
          continue;
        }
        if (tipo === 'andando') { andando++; feito = true; break; }   // ja tem pesquisa em curso nesta aldeia
        if (tipo === 'recurso') { faltouRecurso = tech; break; }      // recurso e por aldeia, nao por tropa
        // Nao invento significado: mostro a resposta crua pra dar pra ajustar o classificador.
        pushLog('Pesquisa em ' + rotulo + ' (' + nomeTropa(tech) + '): resposta nao reconhecida - ' + erro, 'err', 'research');
        break;
      }
      if (travadas) semPredio++;
      if (feito || !faltouRecurso) { await sleep(300); continue; }

      if (!config.research.feedOn) {
        pushLog(rotulo + ': sem recurso p/ ' + nomeTropa(faltouRecurso) + ' (abastecimento desligado).', '', 'research');
        await sleep(300); continue;
      }
      const r = await pesqAbastecer({ vid: vid, coord: alvo.coord, name: alvo.name }, todas, cacheFonte);
      if (r.enviou) abastecidas++;
      else pushLog(rotulo + ': sem recurso p/ ' + nomeTropa(faltouRecurso) + ' e nao consegui abastecer (' + r.motivo + ').', '', 'research');
      await sleep(300);
    }

    config.research.stats = {
      villages: ativas.length, pesquisadas: pesquisadas, abastecidas: abastecidas,
      completas: completas, andando: andando, semPredio: semPredio,
    };
    config.research.nextAt = now + Math.max(60, config.research.interval || 900) * 1000;
    _pesqEmVoo = false;
    save();
    renderResearchVillages();
    refreshCards('research');
    // Uma linha por tropa travada, com o predio que resolve. Ex.: "Ariete travada em 14 aldeia(s)
    // - falta Oficina". Nao repete nos ciclos seguintes: o bloqueio segura por blockTtlH horas.
    Object.keys(travadasPorTropa).forEach((tech) => {
      const nome = (UNITS.find((x) => x[0] === tech) || [])[1] || tech;
      const predio = PESQ_PREDIO[tech];
      pushLog('Pesquisa: ' + nome + ' travada em ' + travadasPorTropa[tech] + ' aldeia(s)' +
              (predio ? ' - falta ' + predio + ' (suba em Construcoes)' : ' - falta predio') +
              '. Nao insisto nas proximas ' + (config.research.blockTtlH || 6) + 'h.', '', 'research');
    });
    pushLog('Pesquisa: ciclo concluido - ' + pesquisadas + ' iniciada(s), ' + abastecidas + ' abastecida(s), ' +
            completas + ' sem nada a fazer' + (semPredio ? ', ' + semPredio + ' com item travado por requisito' : '') +
            '. Proximo em ' + Math.round((config.research.interval || 900) / 60) + ' min.', 'ok', 'research');
    scheduleResearch();
  }
  function scheduleResearch() {
    clearTimeout(researchTimer);
    if (!config.research.running) return;
    researchTimer = setTimeout(researchTick, Math.min(Math.max((config.research.nextAt || 0) - Date.now(), 1000), 60000));
  }

  // ===== Modelos =====
  let _pesqTplAtivo = 'padrao';
  function pesqTplIds() { return Object.keys(config.research.templates || {}); }
  function pesqTpl(id) { return (config.research.templates || {})[id || _pesqTplAtivo] || null; }
  function pesqOrdemAtual() {
    const t = pesqTpl(); if (t) return (t.order = t.order || []);
    const ids = pesqTplIds(); if (!ids.length) return [];
    _pesqTplAtivo = ids[0]; return (config.research.templates[ids[0]].order = config.research.templates[ids[0]].order || []);
  }
  function pesqRenderTplSelect() {
    const sel = document.getElementById('twmgr-pq-tpl'); if (!sel) return;
    const ids = pesqTplIds();
    sel.innerHTML = ids.map((id) => '<option value="' + esc(id) + '">' + esc(config.research.templates[id].name) + ' (' + (config.research.templates[id].order || []).length + ')</option>').join('');
    if (ids.indexOf(_pesqTplAtivo) < 0 && ids.length) _pesqTplAtivo = ids[0];
    sel.value = _pesqTplAtivo;
    const mass = document.getElementById('twmgr-pq-mass-tpl');
    if (mass) { const antes = mass.value; mass.innerHTML = sel.innerHTML; if (ids.indexOf(antes) >= 0) mass.value = antes; }
  }
  function renderResearchOrder() {
    const box = document.getElementById('twmgr-pq-order'); if (!box) return;
    const ordem = pesqOrdemAtual();
    if (!ordem.length) { box.innerHTML = '<div style="color:#6e5a2a;text-align:center;padding:10px;font-size:10px">- ordem vazia (use o + abaixo) -</div>'; return; }
    box.innerHTML = ordem.map((u, i) => {
      const par = UNITS.find((x) => x[0] === u);
      const nome = par ? par[1] : u;
      return '<div class="twmgr-pq-item" data-i="' + i + '">' +
        '<span class="twmgr-pq-ord">' + (i + 1) + '.</span>' +
        '<span class="twmgr-pq-ico">' + unitIcon(u, nome) + '</span>' +
        '<span class="twmgr-pq-name">' + esc(nome) + '</span>' +
        '<span class="twmgr-pq-up" data-i="' + i + '" title="subir prioridade">&#9650;</span>' +
        '<span class="twmgr-pq-down" data-i="' + i + '" title="descer prioridade">&#9660;</span>' +
        '<span class="twmgr-pq-rm" data-i="' + i + '" title="remover">&#10005;</span>' +
        '</div>';
    }).join('');
  }
  function bindResearchOrderHandlers() {
    const box = document.getElementById('twmgr-pq-order'); if (!box) return;
    box.addEventListener('click', (e) => {
      const el = e.target; const i = parseInt(el.getAttribute('data-i'), 10);
      const ordem = pesqOrdemAtual(); if (isNaN(i) || !ordem.length) return;
      if (el.classList.contains('twmgr-pq-up') && i > 0) { const t = ordem[i - 1]; ordem[i - 1] = ordem[i]; ordem[i] = t; }
      else if (el.classList.contains('twmgr-pq-down') && i < ordem.length - 1) { const t = ordem[i + 1]; ordem[i + 1] = ordem[i]; ordem[i] = t; }
      else if (el.classList.contains('twmgr-pq-rm')) { ordem.splice(i, 1); }
      else return;
      save(); renderResearchOrder(); pesqRenderTplSelect();
    });
  }
  function pesqAddUnidade() {
    const sel = document.getElementById('twmgr-pq-add'); if (!sel) return;
    const u = sel.value; const ordem = pesqOrdemAtual();
    if (ordem.indexOf(u) >= 0) { alert('Essa tropa ja esta na ordem.'); return; }
    ordem.push(u); save(); renderResearchOrder(); pesqRenderTplSelect();
  }
  function pesqNovoModelo() {
    const nome = (prompt('Nome do novo modelo de pesquisa:', '') || '').trim();
    if (!nome) return;
    const copiar = confirm('Copiar a ordem do modelo "' + (pesqTpl() ? pesqTpl().name : '') + '"?\n\nOK = copiar   -   Cancelar = vazio');
    const id = 'pq' + Date.now().toString(36);
    config.research.templates[id] = { name: nome.slice(0, 40), order: copiar && pesqTpl() ? pesqOrdemAtual().slice() : [] };
    _pesqTplAtivo = id;
    save(); pesqRenderTplSelect(); renderResearchOrder(); renderResearchVillages();
    pushLog('Modelo de pesquisa "' + nome + '" criado.', 'ok', 'research');
  }
  function pesqRenomearModelo() {
    const t = pesqTpl(); if (!t) return;
    const nome = (prompt('Novo nome:', t.name) || '').trim(); if (!nome) return;
    t.name = nome.slice(0, 40); save(); pesqRenderTplSelect(); renderResearchVillages();
  }
  function pesqApagarModelo() {
    const t = pesqTpl(); if (!t) return;
    if (pesqTplIds().length < 2) { alert('Precisa sobrar pelo menos um modelo.'); return; }
    const usando = Object.keys(config.research.villages).filter((v) => config.research.villages[v].tpl === _pesqTplAtivo);
    if (!confirm('Apagar o modelo "' + t.name + '"?' + (usando.length ? '\n\n' + usando.length + ' aldeia(s) usam ele e vao sair da tabela.' : ''))) return;
    usando.forEach((v) => { delete config.research.villages[v]; });
    delete config.research.templates[_pesqTplAtivo];
    _pesqTplAtivo = pesqTplIds()[0];
    save(); pesqRenderTplSelect(); renderResearchOrder(); renderResearchVillages();
  }
  function pesqSwitchTpl(id) {
    if (!pesqTpl(id)) return;
    _pesqTplAtivo = id;
    const sel = document.getElementById('twmgr-pq-tpl'); if (sel) sel.value = id;
    renderResearchOrder();
  }
  function pesqResetOrdem() {
    const t = pesqTpl(); if (!t) return;
    if (!confirm('Resetar a ordem do modelo "' + t.name + '" pro padrao do script?')) return;
    t.order = PESQ_ORDEM_PADRAO.filter((u) => UNITS.some((x) => x[0] === u));
    save(); renderResearchOrder(); pesqRenderTplSelect();
  }

  // ===== Tabela de aldeias =====
  let _pesqPool = [];
  async function pesqCarregarAldeias() {
    const btn = document.getElementById('twmgr-pq-vil-reload');
    if (btn) btn.textContent = '...';
    try {
      const gid = config.research.filterGroup || '';
      const vs = gid ? await getVillagesInGroup(gid) : await getAllVillagesCached();
      _pesqPool = (vs || []).map((v) => ({ vid: String(v.vid), coord: v.coord || null, name: v.name || v.coord || String(v.vid) }));
      pushLog('Pesquisa: ' + _pesqPool.length + ' aldeia(s) carregadas' + (gid ? ' do grupo selecionado' : '') + '.', '', 'research');
    } catch (e) {
      pushLog('Pesquisa: erro ao carregar as aldeias (' + (e.message || e) + ').', 'err', 'research');
    }
    if (btn) btn.textContent = '↻';
    renderResearchVillages();
  }
  function renderResearchVillages() {
    const box = document.getElementById('twmgr-pq-vils'); if (!box) return;
    const assign = config.research.villages || {}, tpls = config.research.templates || {};
    const mapa = {};
    Object.keys(assign).forEach((vid) => { mapa[vid] = { vid: vid, coord: assign[vid].coord, name: assign[vid].name || assign[vid].coord || vid }; });
    _pesqPool.forEach((v) => { if (!mapa[v.vid]) mapa[v.vid] = v; });
    const linhas = Object.keys(mapa).sort((a, b) => String(mapa[a].name).localeCompare(String(mapa[b].name), 'pt-BR', { numeric: true }));
    if (!linhas.length) { box.innerHTML = '<div style="color:#6e5a2a;text-align:center;padding:10px;font-size:10px">- clique em &#8635; pra carregar suas aldeias -</div>'; return; }
    box.innerHTML = '<table class="twmgr-bld-tab"><thead><tr>' +
      '<th style="width:16px"><input type="checkbox" id="twmgr-pq-all"></th><th>Aldeia</th><th>Modelo</th><th>Estado</th><th></th>' +
      '</tr></thead><tbody>' +
      linhas.map((vid, i) => {
        const v = mapa[vid], a = assign[vid];
        const tplNome = a && tpls[a.tpl] ? esc(tpls[a.tpl].name) : '<span style="color:#8a7340">-</span>';
        const estado = !a ? '<span style="color:#8a7340">sem gerencia</span>'
          : a.paused ? 'Pausado ( <a class="twmgr-pq-tog" data-vid="' + vid + '">Retomar</a> )'
          : 'Ativo ( <a class="twmgr-pq-tog" data-vid="' + vid + '">Pausar</a> )';
        const rm = a ? '<a class="twmgr-pq-vrm" data-vid="' + vid + '" title="tirar da gestao">Remover</a>' : '';
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + (a ? '' : ' twmgr-bld-off') + '">' +
          '<td><input type="checkbox" class="twmgr-pq-vsel" data-vid="' + vid + '"></td>' +
          '<td title="' + esc(v.name) + '">' + esc(v.name) + '</td>' +
          '<td>' + tplNome + '</td><td>' + estado + '</td><td>' + rm + '</td></tr>';
      }).join('') + '</tbody></table>';
    const cnt = Object.keys(assign).length, pausadas = Object.keys(assign).filter((v) => assign[v].paused).length;
    const rod = document.getElementById('twmgr-pq-vils-info');
    if (rod) rod.textContent = cnt + ' gerenciada(s)' + (pausadas ? ' - ' + pausadas + ' pausada(s)' : '') + ' - ' + linhas.length + ' na lista';
  }
  function pesqAcaoEmMassa() {
    const acao = document.getElementById('twmgr-pq-mass-acao').value;
    const tplId = document.getElementById('twmgr-pq-mass-tpl').value;
    const vids = Array.prototype.slice.call(document.querySelectorAll('.twmgr-pq-vsel:checked')).map((el) => el.getAttribute('data-vid'));
    if (!vids.length) { alert('Marque pelo menos uma aldeia.'); return; }
    const assign = config.research.villages;
    const pool = {}; _pesqPool.forEach((v) => { pool[v.vid] = v; });
    let n = 0;
    vids.forEach((vid) => {
      if (acao === 'apply') {
        if (!config.research.templates[tplId]) return;
        const base = assign[vid] || pool[vid] || {};
        assign[vid] = { tpl: tplId, paused: false, coord: base.coord || null, name: base.name || base.coord || vid };
        n++;
      } else if (!assign[vid]) { return; }
      else if (acao === 'pause') { assign[vid].paused = true; n++; }
      else if (acao === 'resume') { assign[vid].paused = false; n++; }
      else if (acao === 'remove') { delete assign[vid]; n++; }
    });
    config.research.stats = config.research.stats || {};
    config.research.stats.villages = Object.keys(assign).filter((v) => !assign[v].paused).length;
    save(); renderResearchVillages(); refreshCards('research');
    const rot = { apply: 'modelo aplicado em', pause: 'pausada(s):', resume: 'retomada(s):', remove: 'removida(s) da gestao:' }[acao];
    pushLog('Pesquisa: ' + rot + ' ' + n + ' aldeia(s).', 'ok', 'research');
  }
  function bindResearchVillageHandlers() {
    const box = document.getElementById('twmgr-pq-vils'); if (!box) return;
    box.addEventListener('click', (e) => {
      const el = e.target, vid = el.getAttribute && el.getAttribute('data-vid');
      if (el.id === 'twmgr-pq-all' || !vid) return;
      if (el.classList.contains('twmgr-pq-tog')) {
        const a = config.research.villages[vid]; if (!a) return;
        a.paused = !a.paused; save(); renderResearchVillages(); refreshCards('research');
      } else if (el.classList.contains('twmgr-pq-vrm')) {
        delete config.research.villages[vid]; save(); renderResearchVillages(); refreshCards('research');
      }
    });
    box.addEventListener('change', (e) => {
      if (e.target.id !== 'twmgr-pq-all') return;
      const on = e.target.checked;
      document.querySelectorAll('.twmgr-pq-vsel').forEach((el) => { el.checked = on; });
    });
  }

  function readResearchCfg() {
    const c = config.research, g = (id) => document.getElementById(id);
    if (g('twmgr-pq-int')) c.interval = Math.max(1, parseInt(g('twmgr-pq-int').value, 10) || 15) * 60;
    if (g('twmgr-pq-feed')) c.feedOn = g('twmgr-pq-feed').checked;
    if (g('twmgr-pq-reserve')) c.feedReserve = Math.max(0, Math.min(90, parseInt(g('twmgr-pq-reserve').value, 10) || 40));
    if (g('twmgr-pq-dist')) c.feedMaxDist = Math.max(1, parseInt(g('twmgr-pq-dist').value, 10) || 20);
    if (g('twmgr-pq-fill')) c.feedFillPct = Math.max(10, Math.min(100, parseInt(g('twmgr-pq-fill').value, 10) || 60));
    save();
  }
  function setResearchStatus(on) { setBtnState('twmgr-pq-start', 'twmgr-pq-stop', on, '● Pesquisando', '▶ Pesquisar'); }
  function researchStart() {
    readResearchCfg();
    const assign = config.research.villages || {};
    const ativas = Object.keys(assign).filter((v) => !assign[v].paused && config.research.templates[assign[v].tpl]);
    if (!ativas.length) { pushLog('Pesquisa: nenhuma aldeia ativa - carregue a lista, marque e aplique um modelo.', 'err', 'research'); return; }
    config.research.running = true; config.research.nextAt = 0; save();
    setResearchStatus(true);
    pushLog('Pesquisa iniciada - ' + ativas.length + ' aldeia(s) em ' + pesqTplIds().length + ' modelo(s).', 'ok', 'research');
    researchTick();
  }
  function researchStop() {
    readResearchCfg(); config.research.running = false; save();
    clearTimeout(researchTimer); setResearchStatus(false);
    pushLog('Pesquisa parada.', '', 'research');
  }
