  // ==================== CENTRO DE COMANDO — ABA APOIO EM MASSA (ccMassa*) — apoio imediato das origens marcadas ====================
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
    // ---- Apoio em massa ----
    // Grade de unidades: um campo por unidade do mundo. Aceita número, "50%" ou "tudo".
    function ccMassaUnidades() {
      const cont = document.getElementById('cc-massa-unidades'); if (!cont) return;
      const listaU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]).filter((u) => u !== 'snob');
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      const antes = {};
      cont.querySelectorAll('.cc-massa-u').forEach((el) => { antes[el.getAttribute('data-u')] = el.value; });
      cont.innerHTML = listaU.map((u) =>
        '<label style="display:flex;align-items:center;gap:3px;font-size:10px" title="' + esc(rot[u] || u) + '">' +
          unitIcon(u, rot[u] || u) +
          '<input class="cc-massa-u twmgr-inp" data-u="' + u + '" value="' + esc(antes[u] || '') + '" style="width:50px;font-size:10px;padding:1px" placeholder="0">' +
        '</label>').join('');
    }
    // Lê a especificação digitada: {unidade: {mode:'all'|'pct'|'qty', val}}
    function ccMassaSpec() {
      const spec = {};
      document.querySelectorAll('.cc-massa-u').forEach((el) => {
        const u = el.getAttribute('data-u');
        const raw = (el.value || '').trim().toLowerCase();
        if (!raw) return;
        if (/^(tudo|todas|todos|all|max|\*)$/.test(raw)) spec[u] = { mode: 'all' };
        else if (/%$/.test(raw)) { const p = parseFloat(raw.replace(',', '.')); if (p > 0) spec[u] = { mode: 'pct', val: p }; }
        else { const q = parseInt(raw.replace(/\D/g, ''), 10); if (q > 0) spec[u] = { mode: 'qty', val: q }; }
      });
      return spec;
    }
    // Resolve a spec contra o disponível de UMA aldeia -> {unidade: contagem}
    function ccMassaResolver(spec, avail) {
      const a = {};
      Object.keys(spec).forEach((u) => {
        const have = (avail && avail[u]) || 0;
        if (!have) return;
        const s = spec[u];
        let n = s.mode === 'all' ? have : s.mode === 'pct' ? Math.floor(have * s.val / 100) : Math.min(s.val, have);
        if (n > 0) a[u] = n;
      });
      return a;
    }
    // Divide um conjunto de tropas em N partes (resto vai pras primeiras).
    function ccMassaDividir(amounts, n) {
      const partes = Array.from({ length: n }, () => ({}));
      Object.keys(amounts).forEach((u) => {
        const base = Math.floor(amounts[u] / n);
        let resto = amounts[u] - base * n;
        for (let i = 0; i < n; i++) {
          const q = base + (resto > 0 ? 1 : 0); if (resto > 0) resto--;
          if (q > 0) partes[i][u] = q;
        }
      });
      return partes;
    }
    async function ccMassaEnviar() {
      const msg = document.getElementById('cc-massa-msg');
      const rel = document.getElementById('cc-massa-rel');
      const diz = (t, cor) => { if (msg) { msg.textContent = t; msg.style.color = cor || '#c0483a'; } };
      if (!config.cmd.suporteOkAt) return diz('O apoio ainda não foi verificado neste mundo — deixe a praça aberta alguns segundos e tente de novo.');
      const alvos = ((document.getElementById('cc-massa-alvos') || {}).value || '').split(/\n/)
        .map((s) => { const m = s.match(/(\d{1,3})\s*\|\s*(\d{1,3})/); return m ? { x: m[1], y: m[2] } : null; })
        .filter(Boolean);
      if (!alvos.length) return diz('Informe ao menos um alvo (ex: 500|600).');
      alvos.forEach((a) => ccHistAdd(a.x + '|' + a.y)); ccHistRender();
      const spec = ccMassaSpec();
      if (!Object.keys(spec).length) return diz('Escolha as tropas (número, "50%" ou "tudo").');
      const marcadas = CCVILAS.filter((v) => config.cmd.origens[v.vid]);
      if (!marcadas.length) return diz('Marque as origens na lista acima.');
      const dividir = (document.getElementById('cc-massa-dividir') || {}).checked && alvos.length > 1;

      const rotU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]).filter((u) => u !== 'snob');
      const rotNome = {}; UNITS.forEach(([u, n]) => { rotNome[u] = n; });

      // CONFIRMACAO. Este botao dispara AGORA e o numero de envios e `origens x alvos` -- sem teto.
      // Marcar 40 origens e colar 20 alvos e um clique que solta 800 comandos, e no modo "tudo" e o
      // exercito inteiro saindo de casa. Apoio volta, mas volta VIAGEM INTEIRA depois; enquanto isso
      // a aldeia fica sem nada.
      //
      // Os dois vizinhos deste mesmo arquivo ja perguntam antes ("Agendar N comando(s)?" e "Agrupar
      // N comando(s) em M trem(ns)?"); este era o unico do tipo que nao perguntava.
      //
      // A frase diz o que vai sair, nao "tem certeza?": quantidade de envios, e a tropa por extenso
      // no modo em que ela foi pedida. "tudo" aparece em CAIXA ALTA porque e o modo em que o usuario
      // nao tem numero nenhum na tela pra conferir.
      const tropaTxt = Object.keys(spec).map((u) => {
        const s = spec[u], nome = rotNome[u] || u;
        return s.mode === 'all' ? (nome + ': TUDO') : s.mode === 'pct' ? (nome + ': ' + s.val + '%') : (nome + ': ' + s.val);
      }).join(', ');
      const nEnvios = marcadas.length * alvos.length;
      if (!confirm('Enviar apoio AGORA — isto não agenda, sai na hora.\n\n'
        + nEnvios + ' envio(s): ' + marcadas.length + ' origem(ns) × ' + alvos.length + ' alvo(s)\n'
        + 'Tropa por envio: ' + tropaTxt + '\n'
        + (dividir ? 'Dividindo a tropa entre os alvos.\n' : (alvos.length > 1 ? 'Cada alvo recebe a quantidade CHEIA (sem dividir).\n' : ''))
        + '\nConfirma?')) { diz('Cancelado — nada foi enviado.', '#6f6153'); return; }

      diz('Enviando… (não feche a praça)', '#6f6153'); if (rel) rel.textContent = '';
      const linhas = []; const totais = {}; let enviados = 0, falhas = 0;
      for (const v of marcadas) {
        const resolvido = ccMassaResolver(spec, v.avail);
        if (!Object.keys(resolvido).length) { linhas.push((v.coord || v.vid) + ' — sem tropa disponível'); continue; }
        const partes = dividir ? ccMassaDividir(resolvido, alvos.length) : alvos.map(() => Object.assign({}, resolvido));
        for (let i = 0; i < alvos.length; i++) {
          const amounts = partes[i];
          if (!amounts || !Object.keys(amounts).length) continue;
          const slots = rotU.map((u) => amounts[u] || 0).join('/');
          try {
            const prep = await cmdPrepare(v.vid, alvos[i].x, alvos[i].y, amounts, 'support');
            await cmdFire(prep);
            enviados++;
            Object.keys(amounts).forEach((u) => { totais[u] = (totais[u] || 0) + amounts[u]; });
            linhas.push((v.coord || v.vid) + (v.nome ? ' ' + v.nome : '') + ' → ' + alvos[i].x + '|' + alvos[i].y + ': ' + slots);
          } catch (e) {
            falhas++;
            linhas.push((v.coord || v.vid) + ' → ' + alvos[i].x + '|' + alvos[i].y + ': ✕ ' + (e.message || e).toString().slice(0, 40));
          }
          await sleep(150);   // pequeno gap entre envios pra não atropelar o servidor
        }
      }
      const header = 'ordem: ' + rotU.map((u) => rotNome[u] || u).join('/');
      const total = 'TOTAL: ' + rotU.map((u) => totais[u] || 0).join('/');
      if (rel) rel.textContent = header + '\n' + linhas.join('\n') + '\n────────\n' + total;
      diz(enviados + ' apoio(s) enviado(s)' + (falhas ? ' · ' + falhas + ' falha(s)' : '') + '.', falhas ? '#a2643a' : '#2e7d3a');
      pushLog('🚚 Apoio em massa: ' + enviados + ' envio(s)' + (falhas ? ', ' + falhas + ' falha(s)' : '') + '.', falhas ? 'err' : 'ok', 'cmd');
    }
