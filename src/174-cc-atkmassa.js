  // ==================== CENTRO DE COMANDO — ABA ATAQUE EM MASSA (ccAtkm*) — varios alvos, distribuicao por menor viagem ====================
  // Parte da ILHA do Centro de Comando. A ilha e UMA IIFE aninhada que ABRE em
  // 171-cc-nucleo.js e FECHA em 178-cc-painel.js: nenhum arquivo do meio abre ou fecha chave
  // de IIFE. Todos partilham o mesmo escopo lexico, entao uma funcao daqui enxerga as dos
  // outros naturalmente — funcoes sao icadas, e os const/let de topo vivem no nucleo, que vem
  // primeiro justamente por isso.
  //
  // Cortado de 175-cc-rico.js (5297 linhas numa ilha so) na v11.224.0. O corte foi por NOME de
  // funcao, nao por comentario de secao: era comum uma funcao de uma aba morar fisicamente
  // dentro do bloco de outra (ccMassaEnviar vivia dentro da secao da Blindagem), que e
  // exatamente como "mexer numa aba quebrava a outra".
    function ccAtkmCfg() {
      const c = (config.cmd.atkm = config.cmd.atkm || {});
      if (c.tropas == null) c.tropas = {};
      if (!Array.isArray(c.pares)) c.pares = [];
      return c;
    }
    function ccAtkmTropasRender() {
      const box = document.getElementById('cc-atkm-tropas'); if (!box) return;
      const c = ccAtkmCfg();
      const lista = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      const rotU = {}; UNITS.forEach(([u, n]) => { rotU[u] = n; });
      box.innerHTML = lista.filter((u) => u !== 'militia').map((u) =>
        '<label class="twmgr-ucell" title="' + esc(rotU[u] || u) + ' — numero ou a palavra tudo">' + unitIcon(u, rotU[u] || u) +
        '<input class="cc-atkm-u twmgr-uinp" data-u="' + u + '" style="width:48px" placeholder="0" value="' +
        esc(String(c.tropas[u] == null ? '' : c.tropas[u])) + '"></label>').join('');
      box.querySelectorAll('.cc-atkm-u').forEach((el) => {
        el.addEventListener('change', () => {
          const cc = ccAtkmCfg();
          const v = (el.value || '').trim();
          if (!v) delete cc.tropas[el.getAttribute('data-u')]; else cc.tropas[el.getAttribute('data-u')] = v;
          save(); ccAtkmTabela();
        });
      });
    }
    // Tropa de UMA origem a partir da receita. "tudo" e resolvido com o disponivel DELA — nao
    // existe numero unico que sirva pra dezenas de aldeias diferentes.
    function ccAtkmAmounts(vid) {
      const receita = ccAtkmCfg().tropas || {};
      const disp = ccOpDisponivel(vid);
      const am = {};
      Object.keys(receita).forEach((u) => {
        const bruto = String(receita[u]).trim().toLowerCase();
        if (!bruto) return;
        const n = (bruto === 'tudo' || bruto === 'max') ? (disp[u] || 0)
          : Math.min(parseInt(bruto, 10) || 0, disp[u] || 0);
        if (n > 0) am[u] = n;
      });
      return am;
    }
    function ccAtkmPool() {
      const gid = (document.getElementById('cc-atkm-grupo') || {}).value || '';
      let pool = CCVILAS.filter((v) => v.x != null);
      if (gid && _ccAtkmGrupoSet) pool = pool.filter((v) => _ccAtkmGrupoSet.has(String(v.vid)));
      return pool;
    }
    function ccAtkmCoords() {
      const txt = (document.getElementById('cc-atkm-alvos') || {}).value || '';
      const out = [];
      (txt.match(/\d{1,3}\s*\|\s*\d{1,3}/g) || []).forEach((c) => {
        const k = c.replace(/\s+/g, '');
        if (out.indexOf(k) < 0) out.push(k);
      });
      return out;
    }
    function ccAtkmChegadaMs() {
      const v = (document.getElementById('cc-atkm-chegada') || {}).value || '';
      if (!v) return null;
      const t = new Date(v).getTime();
      return isNaN(t) ? null : t;
    }
    function ccAtkmCalcular() {
      const coords = ccAtkmCoords();
      if (!coords.length) { alert('Cole pelo menos uma coordenada de alvo.'); return; }
      const pool = ccAtkmPool();
      if (!pool.length) { alert('Nenhuma aldeia de origem nesse grupo.'); return; }
      const alvos = coords.map((c) => { const p = ccCoordParse(c); return { coord: c, x: +p.x, y: +p.y }; });
      const origens = pool.map((v) => ({ vid: String(v.vid), x: v.x, y: v.y,
        d: alvos.map((t) => fieldDist(v.x, v.y, t.x, t.y)) }));
      // N = uma saida por origem. E a regra que dispensa o campo "quantos ataques".
      const sol = ccPlanoResolver(origens, alvos, origens.length);
      if (!sol) { alert('Nao consegui montar a distribuicao. Confira as coordenadas.'); return; }
      const c = ccAtkmCfg();
      c.pares = sol.pares.map((p) => ({ vid: origens[p.oi].vid, coord: alvos[p.tj].coord }));
      save(); ccAtkmTabela();
    }
    // A tabela e o ponto de conferencia: origem, alvo, distancia e HORA DE SAIDA calculada com a
    // tropa real daquela origem. Trocar o alvo de uma linha recalcula na hora.
    function ccAtkmTabela() {
      const box = document.getElementById('cc-atkm-tabela'); if (!box) return;
      const c = ccAtkmCfg();
      const bt = document.getElementById('cc-atkm-validar');
      const av = document.getElementById('cc-atkm-aviso');
      if (!c.pares.length) {
        box.innerHTML = '<div style="color:#8a7d6d;padding:6px;font-size:10px">— calcule a distribuicao pra ver a lista —</div>';
        if (bt) bt.style.display = 'none';
        if (av) av.innerHTML = '';
        return;
      }
      const coords = ccAtkmCoords();
      const chegaMs = ccAtkmChegadaMs();
      const porAlvo = {}; c.pares.forEach((p) => { porAlvo[p.coord] = (porAlvo[p.coord] || 0) + 1; });
      const sais = [];
      box.innerHTML = c.pares.map((p, i) => {
        const v = CCVILAS.find((z) => String(z.vid) === String(p.vid));
        const t = ccCoordParse(p.coord);
        const am = ccAtkmAmounts(p.vid);
        const dist = (v && t) ? fieldDist(v.x, v.y, +t.x, +t.y) : null;
        const viagem = (v && t && Object.keys(am).length) ? ccTempoViagemMs(v.x, v.y, +t.x, +t.y, am) : null;
        const sai = (chegaMs && viagem != null) ? (chegaMs - viagem) : null;
        if (sai != null) sais.push(sai);
        const tarde = sai != null && sai <= srvNowP();
        return '<div style="display:grid;grid-template-columns:20px 1fr 12px 96px 44px 60px;gap:4px;align-items:center;'
          + 'font-size:10px;padding:2px 4px;border-bottom:1px solid rgba(0,0,0,.06)">'
          + '<span style="color:#8a7d6d">' + (i + 1) + '</span>'
          + '<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#584526">'
            + esc((v && (v.nome || v.coord)) || p.vid) + '</span>'
          + '<span style="color:#c9bda8">&rsaquo;</span>'
          + '<select class="cc-atkm-troca twmgr-inp" data-i="' + i + '" style="font-size:9px;padding:1px">'
          + coords.map((k) => '<option value="' + esc(k) + '"' + (k === p.coord ? ' selected' : '') + '>' + esc(k)
              + ' (' + (porAlvo[k] || 0) + ')</option>').join('')
          + '</select>'
          + '<span style="color:#8a7d6d;text-align:right">' + (dist == null ? '—' : dist.toFixed(1) + 'c') + '</span>'
          + '<span style="text-align:right;color:' + (tarde ? '#c0483a' : '#2e7d3a') + '">'
            + (sai == null ? '—' : srvClockMs(sai)) + '</span>'
          + '</div>';
      }).join('');
      const semTropa = c.pares.filter((p) => !Object.keys(ccAtkmAmounts(p.vid)).length).length;
      if (av) {
        av.innerHTML = c.pares.length + ' comando(s) em ' + Object.keys(porAlvo).length + ' alvo(s)'
          + (sais.length ? (' · saidas de <b>' + srvClockMs(Math.min.apply(null, sais)) + '</b> a <b>'
              + srvClockMs(Math.max.apply(null, sais)) + '</b>') : '')
          + (semTropa ? (' · <b style="color:#c0483a">' + semTropa + ' sem tropa</b>') : '');
      }
      box.querySelectorAll('.cc-atkm-troca').forEach((el) => {
        el.addEventListener('change', () => {
          ccAtkmCfg().pares[parseInt(el.getAttribute('data-i'), 10)].coord = el.value;
          save(); ccAtkmTabela();
        });
      });
      if (bt) { bt.style.display = ''; bt.textContent = '✔ Validar e agendar ' + c.pares.length + ' comando(s)'; }
    }
    function ccAtkmValidar() {
      const c = ccAtkmCfg();
      if (!c.pares.length) { alert('Calcule a distribuicao primeiro.'); return; }
      const chegaMs = ccAtkmChegadaMs();
      if (!chegaMs) { alert('Defina a hora de chegada.'); return; }
      if (chegaMs <= srvNowP()) { alert('Esse horario ja passou.'); return; }
      const prontos = [], pulados = [];
      c.pares.forEach((p) => {
        const v = CCVILAS.find((z) => String(z.vid) === String(p.vid));
        const t = ccCoordParse(p.coord);
        if (!v || !t) { pulados.push(p.coord + ' (aldeia ou alvo invalido)'); return; }
        const am = ccAtkmAmounts(p.vid);
        if (!Object.keys(am).length) { pulados.push((v.nome || v.coord) + ' (sem tropa)'); return; }
        const vi = ccTempoViagemMs(v.x, v.y, +t.x, +t.y, am);
        if (vi == null) { pulados.push((v.nome || v.coord) + ' (nao calculei a viagem)'); return; }
        // Saida no passado nao vira comando: seria agendar algo que o motor nunca consegue mandar.
        if (chegaMs - vi <= srvNowP()) { pulados.push((v.nome || v.coord) + ' -> ' + p.coord + ' (saida ja passou)'); return; }
        prontos.push({ v: v, t: t, am: am });
      });
      if (!prontos.length) { alert('Nada a agendar.\n\n' + pulados.join('\n')); return; }
      if (!confirm('Agendar ' + prontos.length + ' comando(s), todos chegando ' + srvClockMs(chegaMs) + '?'
        + (pulados.length ? ('\n\n' + pulados.length + ' pulado(s):\n' + pulados.slice(0, 8).join('\n')) : ''))) return;
      prontos.forEach((p) => { cmdAdicionar('attack', p.t.x, p.t.y, p.am, chegaMs, p.v.vid); });
      save();
      pushLog('Ataque em massa: ' + prontos.length + ' comando(s) agendado(s) pra ' + srvClockMs(chegaMs)
        + (pulados.length ? (' · ' + pulados.length + ' pulado(s)') : '') + '.', 'ok', 'cmd');
      const av = document.getElementById('cc-atkm-aviso');
      if (av) av.innerHTML = '✔ <b>' + prontos.length + '</b> comando(s) na fila'
        + (pulados.length ? (' · ' + pulados.length + ' pulado(s)') : '');
    }
