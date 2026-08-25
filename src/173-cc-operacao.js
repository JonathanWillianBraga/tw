  // ==================== CENTRO DE COMANDO — ABA OPERACAO (ccOp*) — um alvo por vez, ondas com horario calibravel ====================
  // Parte da ILHA do Centro de Comando. A ilha e UMA IIFE aninhada que ABRE em
  // 171-cc-nucleo.js e FECHA em 179-cc-painel.js: nenhum arquivo do meio abre ou fecha chave
  // de IIFE. Todos partilham o mesmo escopo lexico, entao uma funcao daqui enxerga as dos
  // outros naturalmente — funcoes sao icadas, e os const/let de topo vivem no nucleo, que vem
  // primeiro justamente por isso.
  //
  // Cortado de 175-cc-rico.js (5297 linhas numa ilha so) na v11.224.0. O corte foi por NOME de
  // funcao, nao por comentario de secao: era comum uma funcao de uma aba morar fisicamente
  // dentro do bloco de outra (ccMassaEnviar vivia dentro da secao da Blindagem), que e
  // exatamente como "mexer numa aba quebrava a outra".

    // ==================== OPERAÇÃO ====================
    // O ALVO é o container: cada um tem coordenada, horário de chegada da 1ª onda e uma
    // LISTA ORDENADA de ondas. Cada onda é uma aldeia + tropas digitadas à mão.
    //
    // Defasagem: só ondas DA MESMA ALDEIA precisam de espaçamento entre si (é o mesmo
    // jogo/conta enviando mais de um comando — nuke e trem de nobre, por exemplo). Ondas de
    // aldeias diferentes têm a viagem calculada cada uma pela sua origem, então todas miram
    // o horário de chegada normal (o mesmo, ou o calibrado à mão), sem gap artificial entre
    // elas. "Dividir" quebra uma onda em N da MESMA aldeia — essas sim saem espaçadas.
    function ccOpCfg() {
      const c = (config.cmd.op = config.cmd.op || { gapMs: 100, ativo: null, grupo: '', alvos: [] });
      if (c.gapMs == null) c.gapMs = 100;
      if (!Array.isArray(c.alvos)) c.alvos = [];
      return c;
    }
    function ccOpAtivo() {
      const c = ccOpCfg();
      return c.alvos.find((a) => a.id === c.ativo) || c.alvos[0] || null;
    }

    function ccOpAlvoNovo() {
      const c = ccOpCfg();
      const a = { id: genId(), coord: '', chegadaLocal: '', vids: {}, ondas: [] };
      c.alvos.push(a); c.ativo = a.id; save(); ccOpRender();
    }
    function ccOpAlvoDel() {
      const c = ccOpCfg(), a = ccOpAtivo(); if (!a) return;
      c.alvos = c.alvos.filter((z) => z.id !== a.id);
      c.ativo = c.alvos.length ? c.alvos[0].id : null;
      save(); ccOpRender();
    }
    function ccOpChegadaBase(a) { return a ? arrivalToServerMs(a.chegadaLocal || '') || 0 : 0; }
    function ccOpEtapaAtual() {
      const a = ccOpAtivo(); if (!a) return 1;
      const n = parseInt(a.etapa, 10);
      return (n >= 1 && n <= 3) ? n : 1;
    }
    // Cada etapa depende do que a anterior produziu: sem coordenada a lista de origens não tem
    // como ordenar por distância, e sem horário de chegada a etapa 3 calcularia a saída a partir
    // do nada. Por isso avançar é validado — e é a mesma checagem que apaga o passo na trilha.
    function ccOpBloqueio(n) {
      const a = ccOpAtivo();
      if (!a) return 'Crie um alvo primeiro.';
      if (n >= 2) {
        if (!ccCoordParse(a.coord)) return 'Preencha a coordenada do alvo (ex.: 478|586).';
        if (!ccOpChegadaBase(a)) return 'Escolha quando a 1ª onda deve chegar.';
      }
      if (n >= 3 && !Object.keys(a.vids || {}).length) return 'Marque ao menos uma aldeia de origem.';
      return null;
    }
    function ccOpAviso(t) { const el = document.getElementById('cc-op-aviso'); if (el) el.textContent = t || ''; }
    function ccOpIrEtapa(n) {
      const a = ccOpAtivo(); if (!a) return;
      const alvo = Math.max(1, Math.min(CC_OP_ETAPAS.length, n));
      // Voltar nunca é bloqueado — só avançar.
      if (alvo > ccOpEtapaAtual()) {
        const b = ccOpBloqueio(alvo);
        if (b) { ccOpAviso(b); return; }
      }
      a.etapa = alvo; save(); ccOpRender();
    }
    function ccOpRenderEtapas() {
      const cab = document.getElementById('cc-op-passos');
      const nav = document.getElementById('cc-op-nav');
      if (!cab || !nav) return;
      const at = ccOpEtapaAtual();
      CC_OP_ETAPAS.forEach((e) => {
        const el = document.getElementById('cc-op-e' + e.n);
        if (el) el.style.display = (e.n === at) ? 'block' : 'none';
      });
      cab.innerHTML = CC_OP_ETAPAS.map((e) => {
        const atual = (e.n === at);
        const liberada = atual || e.n < at || !ccOpBloqueio(e.n);
        return '<a data-op-etapa="' + e.n + '" title="' + esc(e.dica) + '" style="cursor:' + (liberada ? 'pointer' : 'default') +
          ';color:' + (atual ? '#8b5426' : liberada ? '#2e7d3a' : '#b7ab99') +
          ';font-weight:' + (atual ? '700' : '400') +
          ';background:' + (atual ? '#fdf6e8' : 'transparent') +
          ';border:1px solid ' + (atual ? '#c9a35a' : 'transparent') +
          ';border-radius:10px;padding:2px 9px;text-decoration:none;white-space:nowrap">' +
          (e.n < at ? '✓' : e.n) + '. ' + esc(e.rot) + '</a>';
      }).join('<span style="color:#c9bda8">›</span>');
      cab.querySelectorAll('[data-op-etapa]').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault(); ccOpIrEtapa(parseInt(el.getAttribute('data-op-etapa'), 10));
      });
      const prox = CC_OP_ETAPAS.find((e) => e.n === at + 1);
      // Verde = pode seguir. É o sinal de "já preenchi o que precisava aqui" sem precisar ler
      // texto nenhum; cinza com o motivo no title = ainda falta algo nesta etapa.
      const trava = prox ? ccOpBloqueio(prox.n) : null;
      nav.innerHTML =
        (at > 1 ? '<button id="cc-op-voltar" class="twmgr-btn twmgr-ghost" style="padding:3px 12px;font-size:10px">← Voltar</button>' : '<span></span>') +
        '<span id="cc-op-aviso" style="font-size:9px;color:#c0483a;flex:1;text-align:center;padding:0 6px"></span>' +
        (prox ? '<button id="cc-op-avancar" class="twmgr-btn ' + (trava ? 'twmgr-ghost' : 'twmgr-go') + '" ' +
          'style="padding:3px 12px;font-size:10px"' + (trava ? ' title="' + esc(trava) + '"' : '') + '>' +
          esc(prox.rot) + ' →</button>' : '<span></span>');
      const bv = document.getElementById('cc-op-voltar'); if (bv) bv.onclick = () => ccOpIrEtapa(at - 1);
      const ba = document.getElementById('cc-op-avancar'); if (ba) ba.onclick = () => ccOpIrEtapa(at + 1);
      // Armar só na última etapa: nas outras ele mandaria um alvo pela metade (sem tropa definida).
      const arow = document.getElementById('cc-armar-row');
      if (arow && ccTipo() === 'op') arow.style.display = (at === CC_OP_ETAPAS.length) ? 'flex' : 'none';
    }
    function ccOpOndaAdd(vid) {
      const a = ccOpAtivo(); if (!a) return;
      a.ondas.push({ id: genId(), vid: String(vid), tipo: 'attack', amounts: {}, offsetMs: null });
      save(); ccOpRender();
    }
    function ccOpOndaMover(id, d) {
      const a = ccOpAtivo(); if (!a) return;
      const i = a.ondas.findIndex((z) => z.id === id), j = i + d;
      if (i < 0 || j < 0 || j >= a.ondas.length) return;
      a.ondas.splice(j, 0, a.ondas.splice(i, 1)[0]);
      // Reordenou: os horários calibrados à mão perdem o sentido — tudo volta pro automático.
      a.ondas.forEach((z) => { z.offsetMs = null; });
      save(); ccOpRender();
    }
    // Quebra uma onda em N ondas da MESMA aldeia. Por padrão divide a tropa igualmente (resto
    // pras primeiras); cada uma fica com seus próprios campos, editáveis livremente depois —
    // "dividir" é só o ponto de partida, não uma amarra.
    function ccOpOndaDividir(id, n) {
      const a = ccOpAtivo(); if (!a) return;
      const i = a.ondas.findIndex((z) => z.id === id); if (i < 0) return;
      const o = a.ondas[i];
      n = Math.max(2, Math.min(20, parseInt(n, 10) || 2));
      const partes = [];
      for (let k = 0; k < n; k++) {
        const amounts = {};
        Object.keys(o.amounts || {}).forEach((u) => {
          const tot = o.amounts[u], base = Math.floor(tot / n), resto = tot % n;
          const q = base + (k < resto ? 1 : 0);
          if (q > 0) amounts[u] = q;
        });
        partes.push({ id: genId(), vid: o.vid, tipo: o.tipo, amounts: amounts, offsetMs: null });
      }
      a.ondas.splice(i, 1, ...partes);
      save(); ccOpRender();
    }
    // "Tudo" (mesma ideia do apoio em massa do jogo): preenche com o MÁXIMO disponível.
    // filtroU presente = só aquela unidade (checkbox de coluna); ausente = todas.
    // Processa as ondas NA ORDEM da lista — a 1ª onda de uma aldeia pega o disponível
    // primeiro, a 2ª (se houver) fica com o que sobrar, igual aconteceria mandando na mão.
    function ccOpAplicarTudo(a, filtroU) {
      const listaU = filtroU ? [filtroU] : (CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]));
      (a.ondas || []).forEach((o) => {
        const dispBase = ccOpDisponivel(o.vid);
        o.amounts = o.amounts || {};
        listaU.forEach((u) => {
          const meu = o.amounts[u] || 0;
          const teto = (dispBase[u] || 0) + meu;
          if (teto > 0) o.amounts[u] = teto; else delete o.amounts[u];
        });
      });
      save(); ccOpRender();
    }
    // "Tudo" só de UMA onda (uma aldeia só) — todas as unidades dela.
    function ccOpOndaTudo(id) {
      const a = ccOpAtivo(); if (!a) return;
      const o = a.ondas.find((z) => z.id === id); if (!o) return;
      const dispBase = ccOpDisponivel(o.vid);
      const listaU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      o.amounts = o.amounts || {};
      listaU.forEach((u) => {
        const meu = o.amounts[u] || 0;
        const teto = (dispBase[u] || 0) + meu;
        if (teto > 0) o.amounts[u] = teto; else delete o.amounts[u];
      });
      save(); ccOpRender();
    }
    // Offset efetivo de CADA onda: automático = posição entre as ondas DA MESMA aldeia (gap
    // ms entre a 1ª, 2ª, 3ª... dela); calibrado à mão sobrescreve. Ondas de aldeias diferentes
    // começam todas em offset 0 (o horário de chegada normal do alvo).
    function ccOpCalcularOffsets(a) {
      const gap = ccOpCfg().gapMs, cont = {}, map = {};
      (a.ondas || []).forEach((o) => {
        const n = cont[o.vid] || 0; cont[o.vid] = n + 1;
        map[o.id] = (o.offsetMs != null) ? o.offsetMs : n * gap;
      });
      return map;
    }
    async function ccOpAplicarFiltroGrupo() {
      const gid = ccOpCfg().grupo || '';
      if (!gid) { _ccOpGrupoVidsSet = null; ccOpRender(); return; }
      try {
        const vs = await getVillagesInGroup(gid);
        _ccOpGrupoVidsSet = new Set(vs.map((x) => String(x.vid)));
      } catch (e) {
        _ccOpGrupoVidsSet = null;
        pushLog('Operação: não consegui filtrar pelo grupo (' + (e.message || e) + ').', 'err', 'cmd');
      }
      ccOpRender();
    }
    async function ccOpCarregarGrupos() {
      const sel = document.getElementById('cc-op-grupo'); if (!sel) return;
      let grupos = []; try { grupos = await getGroups(); } catch (e) { /* sem grupos: fica só "Todas" */ }
      const cur = ccOpCfg().grupo || '';
      sel.innerHTML = '<option value="">Todas as aldeias</option>' +
        grupos.map((g) => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('');
      sel.value = cur;
      if (cur) ccOpAplicarFiltroGrupo();
      // Mesmo conteudo no seletor do Ataque em massa.
      const selA = document.getElementById('cc-atkm-grupo');
      if (selA) {
        const curA = selA.value;
        selA.innerHTML = sel.innerHTML;
        selA.value = curA || '';
        const el = document.getElementById('cc-atkm-pool');
        if (el) el.textContent = ccAtkmPool().length + ' aldeia(s)';
      }
    }

    // Tropa disponível de uma aldeia PRA OPERAÇÃO: total (casa+fora+trânsito — inclui o que
    // está saqueando/farmando, que volta sozinho) MENOS o que está apoiando outra aldeia
    // agora (fora) MENOS o que o Coordenado já reservou (config.reservations, escrito só por
    // ele) MENOS o que a própria Operação já comprometeu em QUALQUER onda, de QUALQUER alvo
    // (senão dava pra "gastar" a mesma tropa duas vezes só trocando de aba/alvo).
    function ccOpComprometidoTudo(vid) {
      const acc = {};
      ccOpCfg().alvos.forEach((al) => (al.ondas || []).forEach((o) => {
        if (String(o.vid) !== String(vid)) return;
        Object.keys(o.amounts || {}).forEach((u) => { acc[u] = (acc[u] || 0) + (o.amounts[u] || 0); });
      }));
      return acc;
    }
    function ccOpDisponivel(vid) {
      const v = CCVILAS.find((z) => String(z.vid) === String(vid));
      if (!v) return {};
      const minhas = v.minhas || v.avail || {};
      const fora = v.fora || {};
      const resPlanner = (config.reservations || {})[String(vid)] || {};
      const resOp = ccOpComprometidoTudo(vid);
      const out = {};
      (CC_UNIDADES_MUNDO || UNITS.map((u) => u[0])).forEach((u) => {
        out[u] = Math.max(0, (minhas[u] || 0) - (fora[u] || 0) - (resPlanner[u] || 0) - (resOp[u] || 0));
      });
      return out;
    }
    // Resumo por aldeia: soma o que ela manda em TODAS as ondas DESTE alvo e compara com o
    // que ainda sobrava pra ela na Operação inteira (incluindo o que ESTA onda já usa, senão
    // toda aldeia com onda pareceria estourada consigo mesma).
    function ccOpResumo(a) {
      const porVid = {};
      (a.ondas || []).forEach((o) => {
        const acc = (porVid[o.vid] = porVid[o.vid] || {});
        Object.keys(o.amounts || {}).forEach((u) => { acc[u] = (acc[u] || 0) + (o.amounts[u] || 0); });
      });
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      const linhas = [];
      Object.keys(porVid).forEach((vid) => {
        const v = CCVILAS.find((z) => String(z.vid) === String(vid));
        const nome = v ? ((v.nome ? v.nome + ' ' : '') + (v.coord || vid)) : vid;
        const minhas = (v && v.minhas) || {};
        const fora = (v && v.fora) || {};
        const resPlanner = (config.reservations || {})[String(vid)] || {};
        // "sobra" = total menos apoio-fora menos Coordenado menos TODAS as ondas da Operação
        // que NÃO são de nenhum alvo (ou seja, o compromisso já soma este alvo também).
        const compTudo = ccOpComprometidoTudo(vid);
        const falta = Object.keys(porVid[vid]).filter((u) => {
          const tetoTotal = Math.max(0, (minhas[u] || 0) - (fora[u] || 0) - (resPlanner[u] || 0));
          return compTudo[u] > tetoTotal;
        });
        const tot = Object.keys(porVid[vid]).reduce((s, u) => s + porVid[vid][u], 0);
        linhas.push('<span style="color:' + (falta.length ? '#c0483a' : '#6f6153') + '" title="' +
          esc(falta.length ? 'falta: ' + falta.map((u) => rot[u] || u).join(', ') : 'cabe no estoque') + '">' +
          esc(nome) + ' ' + fmtN(tot) + (falta.length ? ' ⚠' : '') + '</span>');
      });
      return linhas.join(' · ');
    }
    function ccOpRender() {
      const cfg = ccOpCfg();
      const sel = document.getElementById('cc-op-sel'); if (!sel) return;
      const a = ccOpAtivo();
      if (a) cfg.ativo = a.id;
      sel.innerHTML = cfg.alvos.length
        ? cfg.alvos.map((z, i) => '<option value="' + z.id + '">' + esc(z.coord || ('alvo ' + (i + 1) + ' (sem coord)')) + ' · ' + (z.ondas || []).length + ' onda(s)</option>').join('')
        : '<option value="">— nenhum alvo —</option>';
      if (a) sel.value = a.id;
      const gapEl = document.getElementById('cc-op-gap'); if (gapEl) gapEl.value = cfg.gapMs;
      const coordEl = document.getElementById('cc-op-coord'); if (coordEl) coordEl.value = a ? (a.coord || '') : '';
      const chEl = document.getElementById('cc-op-chegada'); if (chEl) chEl.value = a ? (a.chegadaLocal || '') : '';
      const tremEl = document.getElementById('cc-op-trem'); if (tremEl) tremEl.checked = !!(a && a.trem);
      // Antes do return de "sem alvo": a trilha/navegação tem que aparecer mesmo sem alvo criado.
      ccOpRenderEtapas();

      const boxV = document.getElementById('cc-op-vilas');
      const boxO = document.getElementById('cc-op-ondas');
      const boxR = document.getElementById('cc-op-resumo');
      if (!a) {
        if (boxV) boxV.innerHTML = '<div style="color:#8a7d6d;padding:6px;font-size:10px">— crie um alvo pra começar —</div>';
        if (boxO) boxO.innerHTML = '';
        if (boxR) boxR.innerHTML = '';
        return;
      }
      // ---- aldeias participantes ----
      const alvoP = ccCoordParse(a.coord);
      const rotUn = {}; UNITS.forEach(([u, n]) => { rotUn[u] = n; });
      const listaU0 = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      let vilas = CCVILAS.slice();
      if (_ccOpGrupoVidsSet) vilas = vilas.filter((v) => _ccOpGrupoVidsSet.has(String(v.vid)));
      vilas.sort((x, y) => {
        const dx = (alvoP && x.x != null) ? fieldDist(x.x, x.y, +alvoP.x, +alvoP.y) : 1e9;
        const dy = (alvoP && y.x != null) ? fieldDist(y.x, y.y, +alvoP.x, +alvoP.y) : 1e9;
        return dx - dy;
      });
      boxV.innerHTML = vilas.map((v) => {
        const on = !!a.vids[v.vid];
        const d = (alvoP && v.x != null) ? fieldDist(v.x, v.y, +alvoP.x, +alvoP.y) : null;
        const n = (a.ondas || []).filter((o) => String(o.vid) === String(v.vid)).length;
        const disp = ccOpDisponivel(v.vid);
        const tropas = listaU0.filter((u) => disp[u] > 0)
          .map((u) => '<span title="' + esc(rotUn[u] || u) + ' — sobra pra novos compromissos">' + unitIcon(u, rotUn[u] || u) + fmtN(disp[u]) + '</span>').join(' ');
        return '<div style="padding:2px 5px;border-bottom:1px solid rgba(0,0,0,.05);font-size:10px">' +
          '<div style="display:grid;grid-template-columns:18px 1fr 52px 62px;gap:6px;align-items:center">' +
            '<input type="checkbox" class="cc-op-v" data-vid="' + v.vid + '"' + (on ? ' checked' : '') + '>' +
            '<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' +
              (v.nome ? '<b style="color:#584526">' + esc(v.nome) + '</b> ' : '') +
              '<span style="color:#a2643a">' + esc(v.coord || v.vid) + '</span>' +
              (n ? '<span style="color:#8a7d6d"> · ' + n + ' onda(s)</span>' : '') + '</span>' +
            '<span style="color:#8a7d6d">' + (d == null ? '—' : d.toFixed(1) + ' c') + '</span>' +
            (on ? '<a class="cc-op-add-onda" data-vid="' + v.vid + '" href="#" style="color:#2e7d3a;font-size:9px">+ onda</a>' : '<span></span>') +
          '</div>' +
          (tropas ? '<div style="margin:1px 0 0 24px;line-height:1.5">' + tropas + '</div>' : '') +
        '</div>';
      }).join('') || '<div style="color:#8a7d6d;padding:6px;font-size:10px">— nenhuma aldeia —</div>';
      boxV.querySelectorAll('.cc-op-v').forEach((el) => el.onchange = () => {
        const vid = el.getAttribute('data-vid');
        if (el.checked) { a.vids[vid] = true; if (!(a.ondas || []).some((o) => String(o.vid) === String(vid))) ccOpOndaAdd(vid); }
        else { delete a.vids[vid]; a.ondas = a.ondas.filter((o) => String(o.vid) !== String(vid)); }
        save(); ccOpRender();
      });
      boxV.querySelectorAll('.cc-op-add-onda').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault(); ccOpOndaAdd(el.getAttribute('data-vid'));
      });

      // ---- ondas (a lista ordenada) ----
      const base = ccOpChegadaBase(a);
      const offsets = ccOpCalcularOffsets(a);
      const listaU = ccUnidadesUI();
      // Uma "coluna" por unidade, igual ao apoio em massa do jogo: marcar preenche aquela
      // tropa com o máximo em TODAS as ondas de uma vez. Some se não há onda pra preencher.
      const colsBox = document.getElementById('cc-op-tudo-cols');
      if (colsBox) {
        colsBox.style.display = (a.ondas || []).length ? 'block' : 'none';
        // Mesma largura de célula (48px) e mesmo recuo (23px) das caixas de tropa abaixo, pra
        // cada checkbox cair na vertical exata da coluna que ele preenche.
        colsBox.innerHTML =
          '<div style="color:#8a7d6d;margin-bottom:2px">tudo por tropa ' +
            '<span style="color:#b3a794">— marca a coluna e preenche em todas as ondas</span></div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-left:23px">' + listaU.map(([u, rot]) =>
            '<label style="display:flex;flex-direction:column;align-items:center;gap:2px;width:48px;padding:0;cursor:pointer" ' +
              'title="preenche ' + esc(rot) + ' com o máximo em todas as ondas">' +
              unitIcon(u, rot) + '<input type="checkbox" class="cc-op-tudo-col" data-u="' + u + '"></label>').join('') +
          '</div>';
        colsBox.querySelectorAll('.cc-op-tudo-col').forEach((el) => el.onclick = () => ccOpAplicarTudo(a, el.getAttribute('data-u')));
      }
      boxO.innerHTML = (a.ondas || []).length ? a.ondas.map((o, i) => {
        const v = CCVILAS.find((z) => String(z.vid) === String(o.vid));
        const nome = v ? ((v.nome ? v.nome + ' ' : '') + (v.coord || o.vid)) : o.vid;
        const chega = base ? base + offsets[o.id] : 0;
        const manual = (o.offsetMs != null);
        // Saída: pela unidade mais lenta DESTA onda, na distância real origem→alvo.
        const tViagem = (v && v.x != null && alvoP) ? ccTempoViagemMs(v.x, v.y, alvoP.x, alvoP.y, o.amounts) : null;
        const sai = (chega && tViagem != null) ? chega - tViagem : null;
        // Disponível pra ESTA caixa = sobra geral + o que esta própria onda já usa dessa unidade
        // (senão a onda pareceria não poder nem manter o que ela mesma já tem).
        const dispBase = ccOpDisponivel(o.vid);
        const campos = listaU.map(([u, rot]) => {
          const meu = (o.amounts && o.amounts[u]) || 0;
          const disp = (dispBase[u] || 0) + meu;
          return '<label class="twmgr-ucell' + (disp > 0 ? '' : ' vazia') + '" title="' + esc(rot) + ' — sobra ' + fmtN(disp) + ' pra esta onda">' +
            unitIcon(u, rot) +
            '<input class="cc-op-amt twmgr-uinp" data-id="' + o.id + '" data-u="' + u + '" type="number" min="0" placeholder="0" ' +
              'value="' + (meu || '') + '">' +
            '<span class="twmgr-uqt">' + fmtN(disp) + '</span>' +
          '</label>';
        }).join('');
        return '<div style="border-bottom:1px solid rgba(0,0,0,.07);padding:4px 5px">' +
          '<div style="display:grid;grid-template-columns:22px 1fr 74px 92px 46px;gap:5px;align-items:center;font-size:10px">' +
            // Número da onda como medalhinha: numa lista longa é o que dá o senso de ordem.
            '<span style="display:inline-flex;align-items:center;justify-content:center;width:19px;height:19px;' +
              'border-radius:50%;background:#f2e8d5;color:#8b5426;font-weight:700;font-size:9px">' + (i + 1) + '</span>' +
            '<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#584526">' + esc(nome) + '</span>' +
            '<select class="cc-op-tipo twmgr-inp" data-id="' + o.id + '" style="font-size:9px;padding:2px 3px !important">' +
              '<option value="attack"' + (o.tipo !== 'support' ? ' selected' : '') + '>⚔ ataque</option>' +
              '<option value="support"' + (o.tipo === 'support' ? ' selected' : '') + '>🛡 apoio</option></select>' +
            '<input class="cc-op-chega" data-id="' + o.id + '" value="' + (chega ? srvClockMs(chega) : '') + '" placeholder="—" ' +
              'title="horário de chegada desta onda; edite pra calibrar" ' +
              'style="width:100%;border:1px solid ' + (manual ? '#c9a35a' : '#ddd2c0') + ';border-radius:6px;padding:3px 2px;' +
              'background:' + (manual ? '#fffaf0' : '#fff') + ';text-align:center;font-size:10px;outline:none;' +
              'color:' + (manual ? '#8b5426' : '#2e7d3a') + ';font-weight:' + (manual ? '700' : '400') + '">' +
            '<span style="text-align:right;white-space:nowrap">' +
              '<a class="cc-op-up" data-id="' + o.id + '" href="#" style="color:#a2643a;text-decoration:none" title="subir">▲</a> ' +
              '<a class="cc-op-dn" data-id="' + o.id + '" href="#" style="color:#a2643a;text-decoration:none" title="descer">▼</a> ' +
              '<a class="cc-op-rm" data-id="' + o.id + '" href="#" style="color:#c0483a;text-decoration:none" title="remover">✕</a></span>' +
          '</div>' +
          // Informação à esquerda, ações à direita — antes "sai" e os dois botões corriam juntos
          // na mesma frase, e o dado mais importante da linha se perdia no meio dos links.
          '<div style="display:flex;align-items:center;gap:5px;margin:3px 0 0 27px;font-size:9px;color:#8a7d6d">' +
            '<span>sai <b style="color:' + (sai ? '#2e7d3a' : '#8a7d6d') + '">' + (sai ? srvClockMs(sai) : '—') + '</b>' +
              (tViagem == null ? ' <span style="color:#a2643a">— digite a tropa pra calcular</span>' : '') + '</span>' +
            '<span style="flex:1"></span>' +
            '<a class="cc-op-onda-tudo" data-id="' + o.id + '" href="#" style="color:#2e7d3a;text-decoration:none" title="preenche todas as tropas desta aldeia com o máximo disponível">🧺 tudo</a>' +
            '<span style="color:#d8cdb8">|</span>' +
            '<a class="cc-op-div" data-id="' + o.id + '" href="#" style="color:#2e7d3a;text-decoration:none" title="quebra esta onda em N ondas iguais, da mesma aldeia">✂ dividir em</a>' +
            '<input class="cc-op-divn" data-id="' + o.id + '" type="number" min="2" max="20" value="2" ' +
              'style="width:34px;border:1px solid #ddd2c0;border-radius:6px;padding:2px 1px;background:#fff;color:#463b30;text-align:center;font-size:9px;outline:none">' +
          '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:3px;margin:4px 0 0 23px">' + campos + '</div>' +
        '</div>';
      }).join('') : '<div style="color:#8a7d6d;padding:6px;font-size:10px">— volte em <b>Origens</b> e marque uma aldeia pra criar a 1ª onda —</div>';

      boxO.querySelectorAll('.cc-op-amt').forEach((el) => el.onchange = () => {
        const o = a.ondas.find((z) => z.id === el.getAttribute('data-id')); if (!o) return;
        const n = parseInt(el.value, 10) || 0;
        o.amounts = o.amounts || {};
        if (n > 0) o.amounts[el.getAttribute('data-u')] = n; else delete o.amounts[el.getAttribute('data-u')];
        save(); ccOpRender();   // reflete no "sai" (unidade mais lenta pode mudar) e nos totais
      });
      boxO.querySelectorAll('.cc-op-tipo').forEach((el) => el.onchange = () => {
        const o = a.ondas.find((z) => z.id === el.getAttribute('data-id')); if (!o) return;
        o.tipo = el.value; save();
      });
      // Calibrar: digitar HH:MM:SS.mmm fixa o offset desta onda (deixa de seguir o gap).
      boxO.querySelectorAll('.cc-op-chega').forEach((el) => el.onchange = () => {
        const o = a.ondas.find((z) => z.id === el.getAttribute('data-id')); if (!o || !base) return;
        const m = (el.value || '').match(/(\d{1,2}):(\d{2}):(\d{2})(?:[.,:](\d{1,3}))?/);
        if (!m) { ccOpRender(); return; }
        const d = new Date(base - wallToServerOffset());
        d.setHours(+m[1], +m[2], +m[3], m[4] ? +(m[4] + '00').slice(0, 3) : 0);
        o.offsetMs = Math.round((d.getTime() + wallToServerOffset()) - base);
        save(); ccOpRender();
      });
      boxO.querySelectorAll('.cc-op-up').forEach((el) => el.onclick = (ev) => { ev.preventDefault(); ccOpOndaMover(el.getAttribute('data-id'), -1); });
      boxO.querySelectorAll('.cc-op-dn').forEach((el) => el.onclick = (ev) => { ev.preventDefault(); ccOpOndaMover(el.getAttribute('data-id'), 1); });
      boxO.querySelectorAll('.cc-op-rm').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault();
        a.ondas = a.ondas.filter((z) => z.id !== el.getAttribute('data-id'));
        save(); ccOpRender();
      });
      boxO.querySelectorAll('.cc-op-div').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault();
        const id = el.getAttribute('data-id');
        const nEl = boxO.querySelector('.cc-op-divn[data-id="' + id + '"]');
        ccOpOndaDividir(id, nEl ? nEl.value : 2);
      });
      boxO.querySelectorAll('.cc-op-onda-tudo').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault(); ccOpOndaTudo(el.getAttribute('data-id'));
      });
      if (boxR) boxR.innerHTML = ccOpResumo(a);
    }
    // Arma TODAS as ondas do alvo ativo, cada uma com o seu horário. O disparo em si é o
    // mesmo motor de precisão dos comandos avulsos — cmdAdicionar entrega pro cmdTick.
    function ccOpArmarAtivo(dizer) {
      const a = ccOpAtivo();
      if (!a) return dizer('Crie um alvo primeiro.');
      const alvoP = ccCoordParse(a.coord);
      if (!alvoP) return dizer('Alvo inválido. Use 478|586.');
      if (!(a.ondas || []).length) return dizer('Nenhuma onda neste alvo.');
      let base = ccOpChegadaBase(a);
      if (!ccModoJa() && !base) return dizer('Defina o horário de chegada da 1ª onda — ou marque "sair o quanto antes".');
      const apoio = a.ondas.some((o) => o.tipo === 'support');
      if (apoio && !config.cmd.suporteOkAt) {
        return dizer('Tem onda de apoio, mas o parâmetro de apoio ainda não foi confirmado neste mundo.');
      }
      const offsets = ccOpCalcularOffsets(a);
      // No modo "quanto antes" a base não vem do campo: é a mais cedo em que NENHUMA onda perde
      // a saída. Cada onda tem o seu offset e a sua viagem, então a restrição é
      // base >= saidaJa + viagem_i - offset_i; a base é o maior desses. Preserva a defasagem
      // entre as ondas, que é o ponto da Operação — só antecipa o conjunto todo.
      if (ccModoJa()) {
        const saida = ccSaidaJaMs();
        let minBase = 0;
        a.ondas.forEach((o) => {
          const v = CCVILAS.find((z) => String(z.vid) === String(o.vid));
          if (!v || v.x == null) return;
          const am = {};
          Object.keys(o.amounts || {}).forEach((u) => { if (o.amounts[u] > 0) am[u] = o.amounts[u]; });
          if (!Object.keys(am).length) return;
          const t = ccTempoViagemMs(v.x, v.y, alvoP.x, alvoP.y, am);
          if (t == null) return;
          const precisa = saida + t - (offsets[o.id] || 0);
          if (precisa > minBase) minBase = precisa;
        });
        if (!minBase) return dizer('Não consegui calcular a viagem de nenhuma onda.');
        base = minBase;
      }
      let armados = 0, tremes = 0; const pulados = [];
      // Prepara as ondas válidas mantendo a ordem da lista (é a ordem de chegada).
      const prontas = [];
      a.ondas.forEach((o, i) => {
        const rotO = 'onda ' + (i + 1);
        const v = CCVILAS.find((z) => String(z.vid) === String(o.vid));
        if (!v) { pulados.push(rotO + ' (aldeia sumiu)'); return; }
        const amounts = {};
        Object.keys(o.amounts || {}).forEach((u) => { if (o.amounts[u] > 0) amounts[u] = o.amounts[u]; });
        if (!Object.keys(amounts).length) { pulados.push(rotO + ' (sem tropa)'); return; }
        const chega = base + offsets[o.id];
        const t = (v.x != null) ? ccTempoViagemMs(v.x, v.y, alvoP.x, alvoP.y, amounts) : null;
        if (t != null && (chega - t) <= srvNowP()) { pulados.push(rotO + ' (longe demais)'); return; }
        prontas.push({ o: o, v: v, amounts: amounts, chega: chega, tipo: o.tipo === 'support' ? 'support' : 'attack' });
      });
      if (a.trem) {
        // Trem: ondas de ATAQUE da mesma origem viram UM comando, enviado num POST só pelo
        // recurso nativo do jogo. Some a corrida por tropa entre elas (o jogo aloca as N de uma
        // vez) e o espaçamento passa a ser o mínimo do servidor — que é o que um NT quer.
        // Apoio fica de fora: o formato train[] é do formulário de ataque.
        const grupos = {};
        prontas.forEach((p) => {
          if (p.tipo !== 'attack') { cmdAdicionar(p.tipo, alvoP.x, alvoP.y, p.amounts, p.chega, p.v.vid); armados++; return; }
          (grupos[String(p.v.vid)] = grupos[String(p.v.vid)] || []).push(p);
        });
        Object.keys(grupos).forEach((vid) => {
          const g = grupos[vid];
          // A chegada do trem é a da PRIMEIRA onda dele: todas saem juntas, então o horário das
          // demais deixa de ser controlável — o servidor é quem espaça.
          const extras = g.slice(1).map((p) => p.amounts);
          cmdAdicionar('attack', alvoP.x, alvoP.y, g[0].amounts, g[0].chega, vid, extras);
          armados += g.length;
          if (extras.length) tremes++;
        });
      } else {
        prontas.forEach((p) => { cmdAdicionar(p.tipo, alvoP.x, alvoP.y, p.amounts, p.chega, p.v.vid); armados++; });
      }
      if (!_ccPrevia) { ccHistAdd(alvoP.coord); ccHistRender(); save(); }
      if (!armados) return dizer('Nada armado. ' + (pulados.length ? pulados.join(', ') : ''));
      dizer(armados + ' onda(s) armada(s) → ' + alvoP.coord + ', a 1ª chegando ' + srvClockMs(base) +
            (tremes ? ' · ' + tremes + ' trem(ns) num POST só' : '') +
            (pulados.length ? ' · pulada(s): ' + pulados.join(', ') : ''),
            pulados.length ? '#a2643a' : '#2e7d3a');
    }
