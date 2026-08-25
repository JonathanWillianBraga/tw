  // ==================== CENTRO DE COMANDO — PRACA: superficie COMPARTILHADA (origens, tropas, previa, fila, comandos do jogo) ====================
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

    // ==================== CENTRO DE COMANDO (praça de reunião) ====================
    const CC_TIPOS = [
      { id: 'attack',  ico: '⚔', rot: 'Ataque',  hint: 'Um ataque por origem marcada, todos chegando no mesmo instante.' },
      { id: 'support', ico: '🛡', rot: 'Apoio',   hint: 'Apoio de várias aldeias pousando junto no mesmo alvo.' },
      { id: 'op',      ico: '🎯', rot: 'Operação', hint: 'Um alvo por vez: escolha as aldeias, crie ondas (cada nova entra 100ms depois da anterior), ordene e calibre os horários. Depois passe pro próximo alvo.' },
      { id: 'fake',    ico: '🎭', rot: 'Fake',    hint: 'Vários alvos de uma vez; o alvo único acima é ignorado.' },
      { id: 'massa',   ico: '🚚', rot: 'Apoio massa', hint: 'Apoio das origens marcadas pro(s) alvo(s), disparado AGORA (não agenda). Em cada unidade: número, 50% ou tudo.' },
      { id: 'atkm',    ico: '💥', rot: 'Ataque em massa', hint: 'Cole os alvos, escolha o grupo de origens e a tropa. Eu distribuo minimizando a maior viagem, voce confere a lista e valida.' },
      { id: 'blz',     ico: '🛡', rot: 'Blindagem',  hint: 'Lê a tabela de pedidos do tópico da tribo, desconta o que já foi entregue, divide a SUA defesa entre os pedidos e dispara AGORA. No fim monta as linhas pra você colar no fórum.' },
    ];
    function ccTipo() { return (config.cmd && config.cmd.tipo) || 'attack'; }
    function telaAtual() {
      try { return new URLSearchParams(location.search).get('screen') || (window.game_data && window.game_data.screen) || ''; } catch (e) { return ''; }
    }
    // Composição digitada no PRÓPRIO centro de comando (não nas caixas do jogo).
    // { amounts: {unidade:n}, max: {unidade:true} } — "max" = mandar tudo o que a origem tiver.
    function ccComposicao() {
      const amounts = {}, max = {};
      ccUnidadesUI().forEach(([u]) => {
        const inp = document.getElementById('cc-u-' + u);
        const chk = document.getElementById('cc-max-' + u);
        if (chk && chk.checked) { max[u] = true; return; }
        const n = inp ? (parseInt(inp.value, 10) || 0) : 0;
        if (n > 0) amounts[u] = n;
      });
      return { amounts: amounts, max: max };
    }
    // Resolve a composição para UMA origem: o "max" vira o estoque real daquela aldeia.
    function ccResolverPara(comp, avail) {
      const a = {};
      Object.entries(comp.amounts).forEach(([u, n]) => { a[u] = n; });
      Object.keys(comp.max).forEach((u) => { const t = (avail && avail[u]) || 0; if (t > 0) a[u] = t; });
      return a;
    }
    // A velocidade tem que sair do que AQUELA aldeia vai realmente mandar, não da composição
    // global escolhida. Com "tudo" marcado em aríete, uma aldeia sem aríete manda só cavalaria
    // e chega muito antes — usar a composição global daria 30 min/campo em vez de 10.
    function ccCompParaVelocidade(comp, avail) {
      const a = {};
      Object.entries(comp.amounts).forEach(([u, n]) => {
        if (!avail) { a[u] = n; return; }
        if ((avail[u] || 0) >= n) a[u] = n;          // sem estoque, essa unidade não vai — não pesa
      });
      Object.keys(comp.max).forEach((u) => {
        const t = avail ? (avail[u] || 0) : 1;
        if (t > 0) a[u] = t;
      });
      return a;
    }
    // ===== Bônus noturno =====
    // Mecânica do jogo que a Central ignorava. Confirmado no `get_config` do br143:
    //
    //     <night> <active>2</active> <start_hour>23</start_hour> <end_hour>7</end_hour>
    //             <def_factor>2</def_factor> </night>
    //
    // Ataque que CHEGA entre 23h e 7h enfrenta defensor com defesa DOBRADA. Agendar um
    // horário bonito sem olhar isso é jogar tropa fora com precisão de milissegundo.
    //
    // A janela cruza a meia-noite (23 → 7), então a comparação é `h >= ini || h < fim`.
    // Quando não cruza (ex.: 1 → 7), vira `h >= ini && h < fim`. Errar isso inverteria o aviso.
    let NOITE = null;
    async function noiteConfig() {
      if (NOITE) return NOITE;
      try {
        const r = await fetch('/interface.php?func=get_config', { credentials: 'include' });
        const t = await r.text();
        const bloco = (t.match(/<night>[\s\S]*?<\/night>/) || [''])[0];
        const num = (tag) => {
          const m = bloco.match(new RegExp('<' + tag + '>\\s*([\\d.]+)\\s*</' + tag + '>'));
          return m ? parseFloat(m[1]) : null;
        };
        NOITE = { ativo: (num('active') || 0) > 0, ini: num('start_hour'), fim: num('end_hour'),
                  fator: num('def_factor') };
      } catch (e) { NOITE = { ativo: false }; }
      return NOITE;
    }
    // Recebe hora do SERVIDOR em ms. Sem config lida ainda, devolve false — nunca inventa aviso.
    function emBonusNoturno(msServidor) {
      if (!NOITE || !NOITE.ativo || NOITE.ini == null || NOITE.fim == null) return false;
      const h = new Date(msServidor - wallToServerOffset()).getHours();
      return (NOITE.ini > NOITE.fim) ? (h >= NOITE.ini || h < NOITE.fim)
                                     : (h >= NOITE.ini && h < NOITE.fim);
    }
    function avisaNoite(c) {
      if (!emBonusNoturno(c.arriveAt)) return;
      pushLog('🌙 ' + c.x + '|' + c.y + ' chega às ' + srvClockMs(c.arriveAt)
        + ', DENTRO do bônus noturno (' + NOITE.ini + 'h–' + NOITE.fim + 'h): o defensor tem '
        + NOITE.fator + '× a defesa. O comando segue armado — mas se for ataque de verdade, '
        + 'vale mover a chegada pra fora da janela.', 'err', 'cmd');
    }

    // ---- Prévia ----
    // Quando `_ccPrevia` é um array, TODO comando armado cai nele em vez de entrar na fila. É o
    // único ponto por onde os três caminhos de armar passam (ataque/apoio, fake e operação),
    // então a prévia é literalmente o código de armar rodando a seco: não tem como ela mostrar
    // uma coisa e o botão fazer outra, que é o defeito de toda prévia escrita à parte.
    let _ccPrevia = null;
    function cmdAdicionar(tipo, x, y, amounts, arriveAt, origem, trem) {
      if (_ccPrevia) {
        _ccPrevia.push({ tipo: tipo, x: x, y: y, amounts: amounts, arriveAt: arriveAt,
                         origem: origem || CUR_VID, trem: (trem && trem.length) ? trem : null });
        return null;
      }
      const c = { id: genId(), tipo: tipo, origin: origem || CUR_VID, x: String(x), y: String(y),
                  amounts: amounts, arriveAt: arriveAt, durMs: null, sendAt: 0, fireAt: 0,
                  prep: null, state: 'novo', erro: null, sentAt: null, desvioMs: null,
                  parcial: null,   // null = segue config.cmd.enviarParcial · true/false = força só este
                  trem: (trem && trem.length) ? trem : null };   // ondas extras no mesmo POST
      config.cmd.fila.push(c); save();
      // Avisa no ARMAR, que é quando ainda dá pra mudar o horário. A leitura da config é
      // assíncrona e cacheada; o aviso sai um instante depois, sem segurar o armamento.
      noiteConfig().then(() => avisaNoite(c)).catch(() => {});
      cmdTick(); ccRender();
      return c;
    }
    // cmdTrem foi removido: o editor de ondas cobre o caso (e mais), com composição,
    // origem e defasagem por onda em vez de uma composição repetida N vezes.
    function cmdAbortar(id) {
      const c = cmdFila().find((z) => z.id === id); if (!c) return;
      c.state = 'abortado'; save(); ccRender();
      pushLog('Comando ' + c.x + '|' + c.y + ' abortado.', '', 'cmd');
    }
    function cmdLimpar() {
      config.cmd.fila = cmdFila().filter((c) => c.state === 'novo' || c.state === 'preparado' || c.state === 'armado');
      save(); ccRender();
    }

    // Teste do parâmetro de apoio: faz só o "confirmar" (não envia) e mostra o que o servidor
    // entendeu. É o portão da Fase 3 — sem isso, apoio é suposição.
    // Autoteste do apoio. Só faz o "confirmar" — não envia tropa. É o portão do apoio/snipe:
    // sem ele passar, mandar apoio é suposição.
    async function ccTestarApoio(silencioso) {
      const out = document.getElementById('cc-teste-out');
      const diz = (h) => { if (out) out.innerHTML = silencioso ? '' : h; };
      const linhas = [];
      diz('verificando apoio…');
      try {
        // 1) O que a praça REALMENTE tem no DOM. Se o nome do parâmetro for outro, corrige sozinho.
        const bA = document.querySelector('#target_attack, input[name="attack"]');
        const bS = document.querySelector('#target_support, input[name="support"]');
        linhas.push('botões na praça → ataque: <b>' + (bA ? esc(bA.name || bA.id) : 'ausente') +
                    '</b> · apoio: <b>' + (bS ? esc(bS.name || bS.id) : 'ausente') + '</b>');
        if (bS && bS.name && bS.name !== config.cmd.suporteParam) {
          config.cmd.suporteParam = bS.name; save();
          linhas.push('<span style="color:#a2643a">parâmetro do apoio ajustado para "' + esc(bS.name) + '"</span>');
        }
        // 2) Confirma 1 lanceiro para OUTRA aldeia sua (não dá pra atacar aldeia própria).
        const minhas = await getAllVillages();
        const destino = minhas.filter((v) => String(v.vid) !== String(CUR_VID) && v.coord)[0];
        if (!destino) { linhas.push('<span style="color:#c0483a">preciso de ao menos 2 aldeias suas pra testar</span>'); return diz(linhas.join('<br>')); }
        const [dx, dy] = destino.coord.split('|');
        const p = await cmdPrepare(CUR_VID, dx, dy, { spear: 1 }, 'support');
        const ok = (p.tipoDetectado === 'support');
        linhas.push('confirm em ' + esc(destino.coord) + ' → tipo <b style="color:' + (ok ? '#2e7d3a' : '#c0483a') + '">' +
                    esc(p.tipoDetectado) + '</b> · duração ' + (p.dur ? fmt(p.dur * 1000) : '?'));
        linhas.push('<span style="font-size:9px;color:#8a7d6d">campos: ' + esc(Object.keys(p.params).join(', ').slice(0, 200)) + '</span>');
        if (ok) {
          config.cmd.suporteOkAt = Date.now(); save();
          linhas.push('<span style="color:#2e7d3a">✔ apoio liberado (nada foi enviado)</span>');
        } else {
          linhas.push('<span style="color:#c0483a">✖ apoio NÃO liberado — o servidor não confirmou como apoio</span>');
        }
        pushLog('Verificação de apoio: tipo "' + p.tipoDetectado + '".', ok ? 'ok' : 'err', 'cmd');
        // Falhando, o aviso aparece mesmo no modo silencioso — senão o Apoio trava sem explicação.
        if (!ok && out) out.innerHTML = linhas.join('<br>');
        return ok;
      } catch (e) {
        linhas.push('<span style="color:#c0483a">verificação de apoio falhou: ' + esc(e.message || e) + '</span>');
        if (out) out.innerHTML = linhas.join('<br>');
        return false;
      }
      diz(linhas.join('<br>'));
    }

    // Quantos fakes cada combinação origem×alvo geraria, sem armar nada.
    function ccParesFake() {
      const alvos = parseCoords((document.getElementById('cc-fake-alvos') || {}).value || '');
      const origens = CCVILAS.filter((v) => config.cmd.origens[v.vid] && v.x != null);
      const dist = (document.querySelector('input[name="cc-fakedist"]:checked') || {}).value || 'rodizio';
      const pares = [];
      if (!alvos.length || !origens.length) return { pares: pares, alvos: alvos, origens: origens, dist: dist };
      if (dist === 'todos') {
        // Cada origem manda 1 fake pra CADA alvo.
        origens.forEach((o) => alvos.forEach((t) => pares.push({ o: o, t: t })));
      } else {
        // Rodízio: 1 fake por alvo, alternando qual aldeia manda — espalha o custo.
        alvos.forEach((t, i) => pares.push({ o: origens[i % origens.length], t: t }));
      }
      return { pares: pares, alvos: alvos, origens: origens, dist: dist };
    }
    // Relatório do estado interno, copiado pra área de transferência com um clique.
    // Existe porque o console do Chrome bloqueia colar comando até o usuário digitar
    // "allow pasting", o que trava o diagnóstico justamente quando ele é necessário.
    async function ccDiagnostico() {
      const msg = document.getElementById('cc-msg');
      const L = [];
      L.push('TW Manager v' + VERSION + ' · mundo ' + WORLD + ' · ' + new Date().toISOString());
      L.push('fonteTropa=' + (config.cmd.fonteTropa || '?') + '  suporteOkAt=' + (config.cmd.suporteOkAt || 0));
      L.push('mundo: speed=' + (config.cmd.mundo.speed) + ' unitSpeed=' + (config.cmd.mundo.unitSpeed) +
             ' confiavel=' + config.cmd.mundo.confiavel + ' fatorAjuste=' + (config.cmd.mundo.fatorAjuste || 1));
      L.push('unidades do mundo: ' + (CC_UNIDADES_MUNDO ? CC_UNIDADES_MUNDO.join(',') : '(não lido)'));
      L.push('latencia rttMin=' + Math.round(NETLAT.rttMin) + ' jitter=' + Math.round(NETLAT.jitter) +
             ' erroEstimado=' + erroEstimadoMs() + 'ms  drift=' + Math.round(CLK.driftMs || 0));
      L.push('CCVILAS=' + CCVILAS.length + ' aldeias · fila=' + cmdFila().length + ' · silencio=' + SILENCE.on);
      L.push('');
      L.push('--- ORIGENS (avail = fonte em uso) ---');
      CCVILAS.slice(0, 30).forEach((v) => {
        const fmtT = (o) => Object.entries(o || {}).filter(([, n]) => n > 0).map(([u, n]) => u + '=' + n).join(' ') || '(vazio)';
        L.push((v.coord || v.vid) + ' "' + (v.nome || '') + '"');
        L.push('   avail   : ' + fmtT(v.avail));
        L.push('   casa    : ' + fmtT(v.casa));
        L.push('   minhas  : ' + fmtT(v.minhas));
        L.push('   fora    : ' + fmtT(v.fora) + '  | transito: ' + fmtT(v.transito));
      });
      L.push('');
      L.push('--- FILA ---');
      cmdFila().slice(0, 20).forEach((c) => {
        L.push([c.tipo, c.origin + '->' + c.x + '|' + c.y, c.state,
                'chega=' + (c.arriveAt ? srvClockMs(c.arriveAt) : '-'),
                'sai=' + (c.sendAt ? srvClockMs(c.sendAt) : '-'),
                'dur=' + (c.durMs != null ? Math.round(c.durMs / 1000) + 's' : '-'),
                'desvio=' + (c.desvioMs != null ? c.desvioMs + 'ms' : '-'),
                c.erro ? ('ERRO: ' + c.erro) : ''].join(' | '));
      });
      L.push('');
      L.push('--- LOG (cmd) ---');
      readLogArr().filter((x) => x.mod === 'cmd').slice(0, 25).forEach((x) => L.push('[' + x.t + '] ' + x.m));
      const txt = L.join('\n');
      let ok = false;
      try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {}
      if (!ok) {   // clipboard bloqueado: cai pro textarea + execCommand, que quase sempre passa
        try {
          const ta = document.createElement('textarea');
          ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px';
          document.body.appendChild(ta); ta.select();
          ok = document.execCommand('copy');
          document.body.removeChild(ta);
        } catch (e) {}
      }
      console.log(txt);
      if (msg) {
        msg.style.color = ok ? '#2e7d3a' : '#a2643a';
        msg.textContent = ok ? 'Diagnóstico copiado — é só colar aqui no chat.'
                             : 'Não consegui copiar; o relatório saiu no console (F12).';
      }
    }

    // ---- Comandos do jogo (chegando / saindo) ----
    // Estrutura conferida no jogo real:
    //   #incomings_table: tipo | destino | origem | jogador | dist | "hoje às HH:MM:SS:mmm" | chega em
    //   #commands_table : "Ataque a X (coord)" | "Origem (coord)" | "hoje às HH:MM:SS:mmm" | tropas…
    // Neste mundo os milésimos vêm no texto, o que é o que torna snipe e calibração viáveis.
    function ccAgoraParede() { return new Date(serverNow() - wallToServerOffset()); }
    function ccParseChegada(txt) {
      const t = (txt || '').replace(/\s+/g, ' ').trim();
      const hm = t.match(/(\d{1,2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/);
      if (!hm) return 0;
      const base = ccAgoraParede();
      let ano = base.getFullYear(), mes = base.getMonth(), dia = base.getDate();
      if (/amanh/i.test(t)) dia += 1;
      else {
        // "em 28.07. às ..." — exige o "às" logo depois pra não casar com a própria hora.
        const dm = t.match(/(\d{1,2})[.\/](\d{1,2})\.?\s*(?:às|as)\s/i);
        if (dm) { dia = +dm[1]; mes = +dm[2] - 1; }
      }
      const local = new Date(ano, mes, dia, +hm[1], +hm[2], +hm[3], +(hm[4] || 0)).getTime();
      if (isNaN(local)) return 0;
      return local + wallToServerOffset();
    }
    const CMDS = { incoming: { at: 0, lista: [] }, outgoing: { at: 0, lista: [] } };
    async function ccLerComandos(qual, forcar) {
      const c = CMDS[qual];
      if (!forcar && c.at && Date.now() - c.at < 30000) return c.lista;
      const url = (qual === 'incoming')
        ? '/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=incomings&subtype=attacks&page=-1'
        : '/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=commands&type=attack&page=-1';
      const doc = new DOMParser().parseFromString(await (await fetch(url, { credentials: 'include' })).text(), 'text/html');
      const tb = doc.querySelector(qual === 'incoming' ? '#incomings_table' : '#commands_table');
      if (!tb) throw new Error('não achei a tabela de comandos');
      const co = (s) => { const m = (s || '').match(/(\d{1,3})\|(\d{1,3})/); return m ? (m[1] + '|' + m[2]) : null; };
      const out = [];
      tb.querySelectorAll('tr').forEach((tr) => {
        if (!tr.querySelector('a[href*="screen=info_command"]')) return;
        const td = [...tr.querySelectorAll('td')].map((x) => (x.textContent || '').replace(/\s+/g, ' ').trim());
        if (td.length < 3) return;
        const chega = ccParseChegada(qual === 'incoming' ? td[5] : td[2]);
        if (!chega) return;
        out.push(qual === 'incoming'
          ? { tipo: td[0], destino: co(td[1]), origem: co(td[2]), jogador: td[3], dist: td[4], chega: chega, temMs: /:\d{3}\s*$/.test(td[5]) }
          : { tipo: td[0], destino: co(td[0]), origem: co(td[1]), jogador: '', dist: '', chega: chega, temMs: /:\d{3}\s*$/.test(td[2]) });
      });
      out.sort((a, b) => a.chega - b.chega);
      c.at = Date.now(); c.lista = out;
      return out;
    }
    // Janela de snipe: entre a chegada escolhida e a PRÓXIMA no MESMO destino.
    // Margem entre a chegada do ataque e a do apoio. Fixá-la em 50ms era perigoso: se o erro
    // de disparo for maior que a margem, o apoio pousa ANTES do ataque e morre nele.
    function ccFolgaSnipe() { return Math.max(0, (config.cmd && config.cmd.snipeFolgaMs != null) ? config.cmd.snipeFolgaMs : 150); }
    // O apoio tem que estar NA ALDEIA quando o ataque escolhido pousa — ou seja, chegar ANTES
    // dele. E depois do ataque anterior no mesmo alvo, senão morre naquele.
    // Janela útil: (chegada do anterior, chegada do escolhido). Miramos no fim dela, o mais
    // colado possível ao ataque, pra reduzir a exposição a ondas que não estamos vendo.
    function ccJanelaSnipe(lista, i, folgaMs) {
      const alvo = lista[i], folga = folgaMs == null ? ccFolgaSnipe() : folgaMs;
      // Anterior no MESMO destino (o nuke que limpa, tipicamente).
      let ant = null;
      for (let k = i - 1; k >= 0; k--) { if (lista[k].destino === alvo.destino) { ant = lista[k]; break; } }
      // Sem milésimos a chegada pode ser até 1s depois do que o texto diz; ao mirar ANTES dela,
      // o seguro é assumir o instante mais cedo possível.
      const base = alvo.chega;
      const de = ant ? (ant.chega + (ant.temMs ? 0 : 1000) + folga) : null;   // depois do anterior
      const ate = base - folga;                                              // antes do escolhido
      return { base: base, de: de, ate: ate, alvoChega: base,
               largura: de == null ? null : (ate - de), ant: ant, exato: !!alvo.temMs };
    }

    // Viável se ainda dá pra pousar antes do ataque E depois do anterior no mesmo alvo.
    function ccSnipeViavel(jan) {
      if (jan.ate <= srvNowP()) return false;                 // o ataque já passou (ou passa agora)
      if (jan.de != null && jan.ate <= jan.de) return false;   // nuke e nobre colados demais
      return true;
    }
    function ccSnipeTitulo(jan) {
      if (jan.ate <= srvNowP()) return 'tarde demais — esse ataque pousa antes de qualquer apoio chegar';
      if (jan.de == null) return 'sem ataque anterior neste alvo — janela aberta até a chegada';
      if (jan.ate <= jan.de) return 'ondas coladas demais: não cabe apoio entre elas';
      return 'janela de ' + jan.largura + 'ms entre o ataque anterior e este';
    }

    // Seções recolhíveis: com tudo aberto o painel empurrava a praça de reunião pra fora da
    // tela e deixava controles (como o snipe) longe demais.
    function ccAplicarFechados() {
      const F = config.cmd.fechados || {};
      document.querySelectorAll('[data-secbody]').forEach((b) => {
        b.style.display = F[b.getAttribute('data-secbody')] ? 'none' : '';
      });
      document.querySelectorAll('[data-sec]').forEach((h) => {
        const k = h.getAttribute('data-sec');
        h.innerHTML = (F[k] ? '▸' : '▾') + h.innerHTML.replace(/^[▾▸]\s*/, ' ');
      });
    }
    function ccToggleSecao(k) {
      const F = (config.cmd.fechados = config.cmd.fechados || {});
      F[k] = !F[k]; save(); ccAplicarFechados();
    }

    // Escreve um instante do servidor no campo de chegada (datetime-local, com milésimos).
    function ccSetChegada(srvMs) {
      const el = document.getElementById('cc-chegada'); if (!el) return;
      const d = new Date(srvMs - wallToServerOffset()), p = (n, w) => String(n).padStart(w || 2, '0');
      el.value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' +
                 p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
      ccRenderOrigens();
    }
    let _ccCmdsQual = 'incoming', _ccAttTipo = null;
    async function ccCmdsRender(qual, forcar) {
      _ccCmdsQual = qual || _ccCmdsQual;
      const box = document.getElementById('cc-cmds-lista'); if (!box) return;
      box.innerHTML = '<div style="color:#8a7d6d;padding:6px;font-size:10px">lendo…</div>';
      let L = [];
      try { L = await ccLerComandos(_ccCmdsQual, !!forcar); }
      catch (e) { box.innerHTML = '<div style="color:#c0483a;padding:6px;font-size:10px">' + esc(e.message || e) + '</div>'; return; }
      if (!L.length) { box.innerHTML = '<div style="color:#8a7d6d;padding:6px;font-size:10px">— nenhum —</div>'; return; }
      const agora = srvNowP(), ehIn = (_ccCmdsQual === 'incoming');
      box.innerHTML = L.slice(0, 60).map((c, i) => {
        const jan = ehIn ? ccJanelaSnipe(L, i) : null;
        return '<div style="display:grid;grid-template-columns:1fr 78px 62px 96px;gap:4px;align-items:center;' +
               'padding:2px 5px;border-bottom:1px solid rgba(0,0,0,.07);font-size:10px">' +
          '<span style="color:#6f6153;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(c.tipo) + '">' +
            esc((c.origem || '?') + ' → ' + (c.destino || '?')) + (c.jogador ? ' <span style="color:#8a7d6d">' + esc(c.jogador) + '</span>' : '') + '</span>' +
          '<span style="color:' + (c.temMs ? '#a2643a' : '#a2643a') + '" title="' + (c.temMs ? 'com milésimos' : 'sem milésimos — margem de 1s') + '">' +
            srvClockMs(c.chega) + '</span>' +
          '<span style="color:#8a7d6d">' + (c.chega > agora ? fmt(c.chega - agora) : '—') + '</span>' +
          '<span style="text-align:right;white-space:nowrap">' +
            '<a data-usar="' + i + '" style="cursor:pointer;color:#2e7d3a" title="usar este horário">📋 usar</a>' +
            (ehIn ? ' <a data-snipe="' + i + '" style="cursor:pointer;color:' +
                    (ccSnipeViavel(jan) ? '#1f6fb2' : '#c0483a') + '" title="' +
                    ccSnipeTitulo(jan) +
                    '">🎯 snipe</a>' : '') +
          '</span>' +
        '</div>';
      }).join('');
      const off = () => parseInt((document.getElementById('cc-cmds-off') || {}).value, 10) || 0;
      box.querySelectorAll('[data-usar]').forEach((el) => el.onclick = () => {
        const c = L[+el.getAttribute('data-usar')];
        ccSetChegada(c.chega + off());
        const m = document.getElementById('cc-msg');
        if (m) { m.style.color = '#2e7d3a'; m.textContent = 'Chegada copiada: ' + srvClockMs(c.chega + off()) + (off() ? ' (com ' + off() + 'ms de deslocamento)' : ''); }
      });
      box.querySelectorAll('[data-snipe]').forEach((el) => el.onclick = () => {
        const i = +el.getAttribute('data-snipe'), c = L[i], jan = ccJanelaSnipe(L, i);
        const m = document.getElementById('cc-msg');
        if (!ccSnipeViavel(jan)) {
          if (m) { m.style.color = '#c0483a'; m.textContent = ccSnipeTitulo(jan); }
          return;
        }
        // Mira no FIM da janela: colado ao ataque, mas antes dele.
        ccSnipeModal({ destino: c.destino, chegaEm: jan.ate + off(), base: jan.base + off(),
                       de: jan.de, largura: jan.largura, exato: jan.exato });
      });
    }

    // ---- Grade de tropas ----
    // Uma "carta" por unidade: ícone em cima (clicar = mandar tudo), número embaixo.
    // O checkbox separado dobrava a altura da grade e poluía a leitura.
    function ccUnidadesUI() {
      const doMundo = CC_UNIDADES_MUNDO && CC_UNIDADES_MUNDO.length ? CC_UNIDADES_MUNDO : UNITS.map((u) => u[0]);
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      return doMundo.filter((u) => u !== 'militia').map((u) => [u, rot[u] || u]);   // milícia não sai da aldeia
    }
    function ccRenderTropas() {
      const grade = document.getElementById('cc-tropas-grade'); if (!grade) return;
      const antes = ccComposicao();   // preserva o que já estava digitado ao reconstruir
      grade.innerHTML = ccUnidadesUI().map(([u, n]) =>
        '<div data-un="' + u + '" style="text-align:center;background:#ffffff;' +
        'border:1px solid #ece4d8;border-radius:6px;padding:3px 2px;min-width:0">' +
          '<div data-maxbtn="' + u + '" title="' + esc(n) + ' — clique para mandar TUDO" ' +
               'style="cursor:pointer;height:18px;line-height:18px;border-radius:4px">' + unitIcon(u, n) + '</div>' +
          '<input id="cc-u-' + u + '" class="twmgr-inp cc-un" type="number" min="0" ' +
                 'style="width:100%;padding:1px;text-align:center;font-size:11px" placeholder="0">' +
          '<input id="cc-max-' + u + '" class="cc-mx" type="checkbox" style="display:none">' +
        '</div>').join('');
      // Restaura os valores e religa os eventos
      ccUnidadesUI().forEach(([u]) => {
        const inp = document.getElementById('cc-u-' + u), chk = document.getElementById('cc-max-' + u);
        if (chk) chk.checked = !!antes.max[u];
        if (inp) { inp.value = antes.amounts[u] || ''; inp.disabled = !!antes.max[u]; }
      });
      grade.querySelectorAll('[data-maxbtn]').forEach((el) => el.onclick = () => {
        const u = el.getAttribute('data-maxbtn');
        const chk = document.getElementById('cc-max-' + u);
        chk.checked = !chk.checked;
        const inp = document.getElementById('cc-u-' + u);
        if (inp) { inp.disabled = chk.checked; if (chk.checked) inp.value = ''; }
        ccPintarTropas(); ccRenderOrigens();
        if (ccTipo() === 'fake') ccPreviaFake();
      });
      grade.querySelectorAll('.cc-un').forEach((el) => el.addEventListener('input', () => {
        ccPintarTropas(); ccRenderOrigens();
        if (ccTipo() === 'fake') ccPreviaFake();
      }));
      ccPintarTropas();
    }
    // Realce visual: unidade com "tudo" fica dourada; com número, acesa.
    function ccPintarTropas() {
      const grade = document.getElementById('cc-tropas-grade'); if (!grade) return;
      ccUnidadesUI().forEach(([u]) => {
        const cel = grade.querySelector('[data-un="' + u + '"]');
        const btn = grade.querySelector('[data-maxbtn="' + u + '"]');
        const chk = document.getElementById('cc-max-' + u);
        const inp = document.getElementById('cc-u-' + u);
        if (!cel || !btn) return;
        const max = chk && chk.checked, tem = inp && (parseInt(inp.value, 10) > 0);
        cel.style.borderColor = max ? '#a2643a' : (tem ? '#7a6438' : '#ece4d8');
        cel.style.background = max ? '#fdfaf5' : '#ffffff';
        btn.style.background = max ? 'rgba(162,100,58,.22)' : 'transparent';
        if (inp) inp.placeholder = max ? 'tudo' : '0';
      });
    }

    // ---- Modelos de tropa ----
    function ccModelos() { return (config.cmd.modelos = config.cmd.modelos || MODELOS_PADRAO()); }
    function ccModeloAplicar(m) {
      UNITS.forEach(([u]) => {
        const inp = document.getElementById('cc-u-' + u), chk = document.getElementById('cc-max-' + u);
        if (chk) chk.checked = !!m.max[u];
        if (inp) { inp.value = m.amounts[u] || ''; inp.disabled = !!m.max[u]; }
      });
      ccRenderOrigens();
      if (ccTipo() === 'fake') ccPreviaFake();
    }
    function ccModeloTxt(m) {
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      const p = Object.entries(m.amounts).filter(([, n]) => n > 0).map(([u, n]) => (rot[u] || u) + ' ' + fmtN(n));
      Object.keys(m.max).forEach((u) => p.push((rot[u] || u) + ' tudo'));
      return p.join(', ') || '(vazio)';
    }
    function ccModelosRender() {
      const box = document.getElementById('cc-modelos'); if (!box) return;
      const M = ccModelos();
      box.innerHTML = M.length ? M.map((m) =>
        '<span data-mod="' + m.id + '" title="' + esc(ccModeloTxt(m)) + '" ' +
        'style="display:inline-flex;align-items:center;gap:3px;background:#ffffff;border:1px solid #e0d6c6;' +
        'border-radius:10px;padding:2px 4px 2px 8px;font-size:10px;color:#a2643a;cursor:pointer">' +
          esc(m.nome) +
          '<a data-mod-rn="' + m.id + '" title="renomear" style="color:#8a7d6d;padding:0 1px">✎</a>' +
          '<a data-mod-rm="' + m.id + '" title="apagar" style="color:#c0483a;padding:0 2px">✕</a>' +
        '</span>').join('')
        : '<span style="font-size:10px;color:#8a7d6d">sem modelos — monte a composição e clique em "salvar como modelo"</span>';
      box.querySelectorAll('[data-mod]').forEach((el) => el.onclick = (ev) => {
        if (ev.target.hasAttribute('data-mod-rm') || ev.target.hasAttribute('data-mod-rn')) return;
        const m = ccModelos().find((z) => z.id === el.getAttribute('data-mod'));
        if (m) ccModeloAplicar(m);
      });
      box.querySelectorAll('[data-mod-rm]').forEach((el) => el.onclick = (ev) => {
        ev.stopPropagation();
        config.cmd.modelos = ccModelos().filter((z) => z.id !== el.getAttribute('data-mod-rm'));
        save(); ccModelosRender();
      });
      box.querySelectorAll('[data-mod-rn]').forEach((el) => el.onclick = (ev) => {
        ev.stopPropagation();
        const m = ccModelos().find((z) => z.id === el.getAttribute('data-mod-rn')); if (!m) return;
        let nome = null;
        try { nome = window.prompt('Novo nome do modelo:', m.nome); } catch (e) {}
        if (nome && nome.trim()) { m.nome = nome.trim().slice(0, 24); save(); ccModelosRender(); }
      });
    }
    function ccModeloSalvar() {
      const comp = ccComposicao();
      const msg = document.getElementById('cc-msg');
      if (!Object.keys(comp.amounts).length && !Object.keys(comp.max).length) {
        if (msg) { msg.style.color = '#c0483a'; msg.textContent = 'Preencha as tropas antes de salvar o modelo.'; }
        return;
      }
      let nome = null;
      try { nome = window.prompt('Nome do modelo:', ''); } catch (e) {}
      if (!nome || !nome.trim()) return;
      nome = nome.trim().slice(0, 24);
      const M = ccModelos();
      const existe = M.find((z) => z.nome.toLowerCase() === nome.toLowerCase());
      if (existe) { existe.amounts = comp.amounts; existe.max = comp.max; }   // mesmo nome = atualiza
      else M.push({ id: genId(), nome: nome, amounts: comp.amounts, max: comp.max });
      save(); ccModelosRender();
      if (msg) { msg.style.color = '#2e7d3a'; msg.textContent = 'Modelo "' + nome + '" ' + (existe ? 'atualizado' : 'salvo') + '.'; }
    }

    // Parser de coordenada: aceita 478|586, 478 586, 478-586...
    function ccCoordParse(raw) {
      const m = String(raw || '').match(/(\d{1,3})\s*[|\s.,;:-]\s*(\d{1,3})/);
      return m ? { x: m[1], y: m[2], coord: m[1] + '|' + m[2] } : null;
    }
    // ==================== PLANO EM MASSA (vários alvos de uma vez) ====================
    // O fluxo normal da Operação é UM alvo por vez. Para bater num jogador inteiro isso vira
    // trabalho manual repetido: N coordenadas, N vezes escolher origens.
    //
    // Aqui você cola as coordenadas, diz quantos ataques no TOTAL e a hora de chegada; o módulo
    // reparte as suas aldeias entre os alvos e materializa um alvo da Operação para cada
    // coordenada, já com as ondas criadas. As tropas continuam no passo 3, alvo a alvo.
    //
    // CRITÉRIO: minimiza a MAIOR distância do plano inteiro (atribuição de gargalo). Como a
    // viagem é distância × constante, a atribuição que minimiza a maior distância é a mesma que
    // minimiza a maior viagem — então dá pra planejar antes de escolher tropa. Na prática isso
    // faz todo mundo sair o mais TARDE possível, encurtando a janela em que o inimigo vê o
    // incoming. Guloso por proximidade não serve: a origem que uma aldeia "rouba" empurra outra
    // pra uma distância muito pior, e é justamente a pior que define a hora de saída.
    //
    // Reparte parelho: cada alvo recebe floor(N/alvos) ataques garantidos, e as sobras (N % alvos)
    // vão pra onde couber melhor — no máximo uma a mais por alvo.

    // Fluxo máximo em grafo pequeno (dezenas de nós). Ford-Fulkerson com BFS: simples de ler e
    // sobra desempenho pro tamanho aqui.
    // Fluxo maximo em grafo pequeno (dezenas de nos). Ford-Fulkerson com BFS.
    //
    // Aceita um residual de entrada e um LIMITE de fluxo novo. E isso que permite rodar em duas
    // fases sem perder a garantia da primeira: a fase A satura o minimo por alvo, e a fase B
    // CONTINUA do residual dela em vez de recomecar. Recomecando, o otimizador achava 3/3/1 onde
    // o certo era 3/2/2 — total certo, reparticao errada.
    function ccFluxo(nNos, arestas, s, t, capIn, limite) {
      const cap = capIn || {}, adj = [];
      for (let i = 0; i < nNos; i++) adj.push([]);
      const ch = (a, b) => a + ':' + b;
      const vistos = {};
      arestas.forEach(([a, b, c]) => {
        if (!vistos[ch(a, b)]) { vistos[ch(a, b)] = 1; adj[a].push(b); adj[b].push(a); }
        cap[ch(a, b)] = (cap[ch(a, b)] || 0) + c;
        if (cap[ch(b, a)] == null) cap[ch(b, a)] = 0;
      });
      // Reconstroi a adjacencia a partir do residual herdado tambem, senao a fase B nao enxerga
      // os caminhos de volta abertos pela fase A.
      Object.keys(cap).forEach((k) => {
        const [a, b] = k.split(':').map(Number);
        if (adj[a].indexOf(b) < 0) adj[a].push(b);
        if (adj[b].indexOf(a) < 0) adj[b].push(a);
      });
      let total = 0;
      const teto = (limite == null) ? Infinity : limite;
      while (total < teto) {
        const pai = new Array(nNos).fill(-1);
        pai[s] = s;
        const fila = [s];
        while (fila.length) {
          const u = fila.shift();
          for (const v of adj[u]) if (pai[v] === -1 && (cap[ch(u, v)] || 0) > 0) { pai[v] = u; fila.push(v); }
        }
        if (pai[t] === -1) break;
        let f = teto - total;
        for (let v = t; v !== s; v = pai[v]) f = Math.min(f, cap[ch(pai[v], v)]);
        for (let v = t; v !== s; v = pai[v]) { cap[ch(pai[v], v)] -= f; cap[ch(v, pai[v])] = (cap[ch(v, pai[v])] || 0) + f; }
        total += f;
      }
      return { total: total, cap: cap };
    }

    // Tenta montar o plano com teto de distancia D. Devolve os pares (origem, alvo) ou null.
    function ccPlanoTenta(origens, alvos, N, capO, D) {
      const T = alvos.length, O = origens.length;
      const base = Math.floor(N / T), extra = N - base * T;
      const S = 0, DR = O + T + 1, nNos = O + T + 2;
      const arestas = [];
      for (let i = 0; i < O; i++) arestas.push([S, 1 + i, capO]);
      for (let i = 0; i < O; i++) {
        for (let j = 0; j < T; j++) {
          // capO e nao 1: a mesma aldeia pode mandar mais de uma onda no MESMO alvo, que e o
          // caso normal de trem. Com 1, plano de 20 ataques em 3 alvos com 6 origens era
          // declarado impossivel sem ser.
          if (origens[i].d[j] <= D) arestas.push([1 + i, O + 1 + j, capO]);
        }
      }
      // Fase A: o minimo garantido por alvo.
      let cap = {}, feito = 0;
      if (base > 0) {
        const rA = ccFluxo(nNos, arestas.concat(alvos.map((_, j) => [O + 1 + j, DR, base])), S, DR, cap, base * T);
        if (rA.total < base * T) return null;
        cap = rA.cap; feito = rA.total;
      } else {
        ccFluxo(nNos, arestas, S, DR, cap, 0);
      }
      // Fase B: CONTINUA do residual, com 1 de folga por alvo, ate fechar N.
      if (extra > 0) {
        const rB = ccFluxo(nNos, alvos.map((_, j) => [O + 1 + j, DR, 1]), S, DR, cap, extra);
        if (rB.total < extra) return null;
        cap = rB.cap; feito += rB.total;
      }
      if (feito < N) return null;
      // Le a atribuicao do residual: o que voltou na aresta reversa e o fluxo que passou.
      const pares = [];
      for (let i = 0; i < O; i++) {
        for (let j = 0; j < T; j++) {
          const usado = cap[(O + 1 + j) + ':' + (1 + i)] || 0;
          for (let k = 0; k < usado; k++) pares.push({ oi: i, tj: j, d: origens[i].d[j] });
        }
      }
      return pares.length >= N ? pares.slice(0, N) : null;
    }
    // Busca binária na lista de distâncias possíveis: o menor teto que ainda fecha o plano.
    function ccPlanoResolver(origens, alvos, N) {
      const O = origens.length;
      if (!O || !alvos.length || N < 1) return null;
      const capO = Math.ceil(N / O);
      const todas = [];
      origens.forEach((o) => o.d.forEach((v) => todas.push(v)));
      const ds = Array.from(new Set(todas)).sort((a, b) => a - b);
      let lo = 0, hi = ds.length - 1, achado = null;
      // Sem solução nem com o teto máximo: não adianta buscar.
      if (!ccPlanoTenta(origens, alvos, N, capO, ds[hi])) return null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const r = ccPlanoTenta(origens, alvos, N, capO, ds[mid]);
        if (r) { achado = { pares: r, teto: ds[mid] }; hi = mid - 1; } else lo = mid + 1;
      }
      return achado;
    }



    // ==================== ATAQUE EM MASSA ====================
    // Bater num jogador inteiro: cola os alvos, escolhe o grupo de origens, a hora de chegada e a
    // tropa. O modulo calcula QUEM ataca QUEM, mostra a lista pra conferencia, aceita troca manual
    // e so agenda quando voce valida.
    //
    // O numero de ataques NAO e perguntado: e o numero de origens do grupo. Com 12 origens e 10
    // alvos saem 12 ataques — cada alvo recebe pelo menos um, e os 2 que sobram vao onde custam
    // menos viagem. Perguntar "quantos ataques" era uma decisao que o proprio dado ja responde, e
    // foi o que mais confundiu nas tentativas anteriores deste recurso.
    //
    // CRITERIO: minimiza a MAIOR distancia do plano (atribuicao de gargalo, ccPlanoResolver).
    // Todo mundo sai o mais tarde possivel, encurtando a janela em que o alvo ve os incomings.
    let _ccAtkmGrupoSet = null;

    // ---- Etapas da Operação ----
    // O formulário corrido pedia tudo de uma vez (alvo, horário, gap, aldeias, ondas, tropa),
    // e nada dizia por onde começar. Virou assistente de 3 passos: cada um mostra só o que
    // importa naquele momento. A etapa é guardada POR ALVO — montar um alvo novo começa do 1
    // sem perder onde você parou nos outros.
    const CC_OP_ETAPAS = [
      { n: 1, rot: 'Alvo', dica: 'coordenada, quando a 1ª onda chega e o gap entre ondas da mesma aldeia' },
      { n: 2, rot: 'Origens', dica: 'quais das suas aldeias participam deste alvo' },
      { n: 3, rot: 'Tropas', dica: 'o que cada onda leva, e o horário fino de cada uma' },
    ];

    // ---- Filtro de grupo na lista de aldeias da Operação (independente do filtro do Ataque/Apoio) ----
    let _ccOpGrupoVidsSet = null;

    function ccPreviaFake() {
      const el = document.getElementById('cc-fake-previa'); if (!el) return;
      const P = ccParesFake();
      if (!P.alvos.length) { el.textContent = 'cole os alvos acima'; return; }
      if (!P.origens.length) { el.textContent = 'marque as origens abaixo'; return; }
      el.textContent = P.pares.length + ' fake(s) = ' + P.origens.length + ' origem(ns) × ' +
        P.alvos.length + ' alvo(s) no modo ' + (P.dist === 'todos' ? 'todas × todos' : 'rodízio');
    }
    // População de uma composição, pelos pesos de FAKE_POP (mesma tabela que o Saque usa
    // pro piso de fake do mundo — 050-envio.js).
    function ccFakePopOf(amounts) {
      return Object.keys(amounts || {}).reduce((s, u) => s + (parseInt(amounts[u], 10) || 0) * (FAKE_POP[u] || 1), 0);
    }
    async function ccArmarFakes(dizer, arriveAt) {
      if (!ccModoJa()) {
        if (!arriveAt) return dizer('Defina o horário de chegada — ou marque "sair o quanto antes".');
        if (arriveAt <= srvNowP()) return dizer('Esse horário já passou.');
      }
      const comp = ccComposicao();
      if (!Object.keys(comp.amounts).length && !Object.keys(comp.max).length) return dizer('Escolha as tropas do fake.');
      const P = ccParesFake();
      if (!P.alvos.length) return dizer('Cole ao menos um alvo na lista de fakes.');
      if (!P.origens.length) return dizer('Marque ao menos uma origem.');

      // Piso de população do mundo (regra real do jogo — 1% dos pontos da PRÓPRIA origem).
      // Mesma constante/fórmula que o Saque já usa em produção (020-engine.js). Sem os pontos
      // (village.txt falhou), o piso fica desligado — degrada pro comportamento de antes, não
      // trava o armar.
      let pontos = null;
      try { pontos = await getVillagePoints(); } catch (e) { pontos = null; }

      let armados = 0, completados = 0; const pulados = [];
      P.pares.forEach((p) => {
        const v = p.o, nome = (v.coord || v.vid) + '→' + p.t.x + '|' + p.t.y;
        const amounts = ccResolverPara(comp, v.avail);
        if (!Object.keys(amounts).length) { pulados.push(nome); return; }
        // Isenção real do jogo: ataque só de explorador não tem piso de população.
        const soExplorador = Object.keys(amounts).every((u) => u === 'spy');
        if (!soExplorador && pontos) {
          const pts = parseInt(pontos[String(v.vid)], 10) || 0;
          const minPop = pts > 0 ? Math.ceil((FAKE_LIMIT_PCT / 100) * pts) : 0;
          const falta = minPop - ccFakePopOf(amounts);
          if (falta > 0) {
            // Completa com exploradores extra — nunca substitui o que foi digitado.
            const jaUsa = amounts.spy || 0;
            const precisa = jaUsa + Math.ceil(falta / (FAKE_POP.spy || 2));
            const sobra = (v.avail && v.avail.spy) || 0;
            if (sobra < precisa) { pulados.push(nome + ' (falta população: piso ' + minPop + ', sem explorador sobrando pra completar)'); return; }
            amounts.spy = precisa;
            completados++;
          }
        }
        const t = ccTempoViagemMs(v.x, v.y, p.t.x, p.t.y, amounts);
        const chega = ccModoJa() ? (ccSaidaJaMs() + (t || 0)) : arriveAt;
        if (!ccModoJa() && t != null && (arriveAt - t) <= srvNowP()) { pulados.push(nome + ' (longe)'); return; }
        cmdAdicionar('fake', p.t.x, p.t.y, amounts, chega, v.vid);
        armados++;
      });
      if (!armados) return dizer('Nenhum fake armado.' + (pulados.length ? ' Pulados: ' + pulados.length : ''));
      dizer(armados + ' fake(s) armado(s) em ' + P.alvos.length + ' alvo(s), ' +
            (ccModoJa() ? 'saindo agora' : 'chegando ' + srvClockMs(arriveAt)) +
            (completados ? ' · ' + completados + ' completado(s) com explorador pro piso de ' + FAKE_LIMIT_PCT + '%' : '') +
            (pulados.length ? ' · ' + pulados.length + ' pulado(s)' : ''), '#2e7d3a');
    }

    // Arma um comando POR ORIGEM marcada, todos com a MESMA chegada — é isso que faz
    // apoio/ataque de várias aldeias pousar junto.
    // "Sair o quanto antes": em vez de o usuário escolher a CHEGADA, o horário sai da conta
    // inversa — saída daqui a pouco, chegada = saída + viagem. O "daqui a pouco" não pode ser
    // zero: o motor prepara o comando `prepLeadSec` antes de disparar, então saída imediata
    // nasceria com o horário já vencido e o comando morreria em "horário já passou". A margem
    // extra cobre o relógio do servidor oscilando entre armar e preparar.
    const CC_JA_MARGEM_MS = 15000;
    function ccSaidaJaMs() {
      return srvNowP() + (config.cmd.prepLeadSec || 60) * 1000 + CC_JA_MARGEM_MS;
    }
    function ccModoJa() { return !!config.cmd.saidaJa; }
    function ccArmar() {
      const msg = document.getElementById('cc-msg');
      const dizer = (t, cor) => { if (msg) { msg.textContent = t; msg.style.color = cor || '#c0483a'; } };
      const tipo = ccTipo();

      const arriveAt0 = ccChegadaMs();
      // Fake tem caminho próprio: vários alvos de uma vez, com distribuição escolhida.
      if (tipo === 'fake') return ccArmarFakes(dizer, arriveAt0);

      // Operação tem caminho próprio: alvos e ondas com horário calibrado por leva.
      if (tipo === 'op') return ccOpArmarAtivo(dizer);

      const alvo = ccAlvo();
      if (!alvo) return dizer('Alvo inválido. Use 478|586.');
      const ja = ccModoJa();
      const arriveAt = arriveAt0;
      if (!ja) {
        if (!arriveAt) return dizer('Defina o horário de chegada — ou marque "sair o quanto antes".');
        if (arriveAt <= srvNowP()) return dizer('Esse horário já passou.');
      }
      if (!_ccPrevia) { ccHistAdd(alvo.coord); ccHistRender(); }
      if (tipo === 'support' && !config.cmd.suporteOkAt) {
        return dizer('Rode o teste de apoio antes — o parâmetro ainda não foi confirmado neste mundo.');
      }
      const comp = ccComposicao();
      if (!Object.keys(comp.amounts).length && !Object.keys(comp.max).length) {
        return dizer('Escolha as tropas aqui em cima.');
      }
      const marcadas = CCVILAS.filter((v) => config.cmd.origens[v.vid]);
      if (!marcadas.length) return dizer('Marque ao menos uma origem.');

      let armados = 0, pulados = [];
      let semTropaAgora = 0;
      marcadas.forEach((v) => {
        const nome = v.coord || v.vid;
        // Tropa manual desta aldeia (⚙ na lista de Origens) tem prioridade sobre o modelo global.
        const ov = ccOrigOverrideGet(v.vid);
        const compOrigem = ov || comp;
        const amounts = ccResolverPara(compOrigem, v.avail);
        if (!Object.keys(amounts).length) { pulados.push(nome + ' (nada a enviar)'); return; }
        // Tropa faltando NÃO impede agendar: você pode estar marcando um ataque full pra daqui
        // a horas, com a tropa saqueando agora. O preparo (60s antes) é que confere de verdade.
        if (!ccTemTropa(v, compOrigem)) semTropaAgora++;
        // Tempo pela composição REAL desta aldeia — não pela global.
        const t = (v.x != null) ? ccTempoViagemMs(v.x, v.y, alvo.x, alvo.y, amounts) : null;
        // No modo "quanto antes" cada origem tem a SUA chegada: todas saem juntas, e quem está
        // mais longe chega depois. Forçar uma chegada comum seria voltar a agendar.
        const chega = ja ? (ccSaidaJaMs() + (t || 0)) : arriveAt;
        if (!ja && t != null && (arriveAt - t) <= srvNowP()) { pulados.push(nome + ' (longe demais)'); return; }
        cmdAdicionar(tipo, alvo.x, alvo.y, amounts, chega, v.vid);
        armados++;
      });
      if (!armados) return dizer('Nenhum comando armado. ' + (pulados.length ? 'Pulados: ' + pulados.join(', ') : ''));
      dizer(armados + ' comando(s) armado(s) ' + (ja ? 'saindo agora' : 'chegando ' + srvClockMs(arriveAt)) +
            (semTropaAgora ? ' · ' + semTropaAgora + ' sem a tropa completa agora (confere no preparo)' : '') +
            (pulados.length ? ' · pulados: ' + pulados.join(', ') : ''),
            semTropaAgora ? '#a2643a' : '#2e7d3a');
    }

    // Roda o MESMO armar com a fila desligada e mostra o que teria entrado. `ccArmarFakes` é
    // assíncrona (lê os pontos das aldeias pro piso do fake), então o desenho espera a promessa —
    // sem isso o fake sempre mostraria a lista vazia.
    function ccPrever() {
      const box = document.getElementById('cc-previa'); if (!box) return;
      box.innerHTML = '<span class="twmgr-lbl">calculando…</span>';
      _ccPrevia = [];
      let p;
      // As mensagens de recusa ("marque uma origem", "longe demais"...) saem no lugar de sempre,
      // escritas pelo próprio ccArmar — não precisa duplicar aqui.
      try { p = ccArmar(); }
      catch (e) {
        _ccPrevia = null;
        box.innerHTML = '<span style="color:#c0483a;font-size:10px">erro na prévia: ' + esc(e.message || e) + '</span>';
        return;
      }
      const fim = () => { const itens = _ccPrevia || []; _ccPrevia = null; ccPreviaRender(itens); };
      if (p && typeof p.then === 'function') p.then(fim, fim); else fim();
    }
    function ccPreviaRender(itens) {
      const box = document.getElementById('cc-previa'); if (!box) return;
      const rotU = {}; UNITS.forEach(([u, n]) => { rotU[u] = n; });
      const nomeDe = (vid) => {
        const v = CCVILAS.find((z) => String(z.vid) === String(vid));
        return v ? ((v.nome ? v.nome + ' ' : '') + (v.coord || '')) : String(vid);
      };
      if (!itens.length) {
        box.innerHTML = '<div style="color:#a2643a;font-size:10px">Nada seria armado — o motivo está na mensagem acima.</div>';
        return;
      }
      const agora = srvNowP();
      itens.sort((a, b) => a.arriveAt - b.arriveAt);
      box.innerHTML = '<div style="font-size:10px;color:#6f6153;margin-bottom:3px"><b>' + itens.length
          + '</b> comando(s) seriam armados' + (ccModoJa() ? ' — <b style="color:#8b5426">saída imediata</b>' : '') + '</div>' +
        '<table style="width:100%;font-size:10px;border-collapse:collapse">' +
        '<tr style="color:#8a7d6d;text-align:left"><th>origem</th><th style="width:58px">alvo</th>' +
        '<th style="width:84px">sai</th><th style="width:84px">chega</th><th>tropas</th></tr>' +
        itens.map((c) => {
          const sai = c.arriveAt - (ccDurDe(c) || 0);
          const tropas = Object.keys(c.amounts || {}).filter((u) => c.amounts[u] > 0)
            .map((u) => fmtN(c.amounts[u]) + ' ' + (rotU[u] || u)).join(', ') || '—';
          return '<tr style="border-top:1px solid #efe7d8">' +
            '<td>' + esc(nomeDe(c.origem)) + (c.trem ? ' <b style="color:#8b5426" title="trem: ' + (c.trem.length + 1) + ' ondas num POST só">🚂</b>' : '') + '</td>' +
            '<td style="color:#8a7d6d">' + esc(c.x + '|' + c.y) + '</td>' +
            '<td style="color:' + (sai <= agora ? '#c0483a' : '#6f6153') + '">' + srvClockMs(sai) + '</td>' +
            '<td><b>' + srvClockMs(c.arriveAt) + '</b></td>' +
            '<td style="color:#6f6153">' + esc(tropas) + '</td></tr>';
        }).join('') + '</table>' +
        '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">Nada foi armado — isto é só a simulação. Saída em vermelho = o horário já passou.</div>';
    }
    // Viagem de um item da prévia, pra mostrar a SAÍDA (o que o usuário quer conferir).
    function ccDurDe(c) {
      const v = CCVILAS.find((z) => String(z.vid) === String(c.origem));
      if (!v || v.x == null) return 0;
      return ccTempoViagemMs(v.x, v.y, +c.x, +c.y, c.amounts) || 0;
    }
    // ==================== BLINDAGEM DA TRIBO ====================
    // Lê o tópico do fórum onde a tribo publica os pedidos de defesa e monta, do lado de cá, a
    // divisão da SUA defesa entre eles. Três coisas foram medidas no tópico real (br143 #90) e
    // definem o parser — nenhuma delas é chute:
    //
    // 1. AS COLUNAS SÃO ÍCONES, não texto. O cabeçalho é `PEDIDO | ALDEIA | 🛡lanceiro |
    //    🛡espadachim | ❌ | 🛡cav.pesada | ❌ | 🛡`. As duas colunas ❌ são slots que a tribo não
    //    usa e valem SEMPRE zero — é de onde saem os dois zeros fixos da linha do fórum. Achar a
    //    coluna pelo `unit_XXX` da imagem é o que sobrevive a a tribo reordenar a tabela.
    // 2. `✅` NUMA CÉLULA SIGNIFICA ZERO, não "atendido". O pedido 3 pede 7000 lanceiros e tem ✅
    //    na coluna de cavalaria: é "não quero cavalaria". Ler isso como "já resolvido" faria o
    //    módulo pular pedido aberto.
    // 3. OS COMENTÁRIOS SÃO ENTREGAS. Cada resposta no tópico é uma linha `num/lanc/esp/0/cp/0`
    //    de quem já mandou. Sem descontá-las o módulo empilha defesa em cima de pedido cheio.
    //
    // E o detalhe que obriga a olhar as datas: o post da tabela é REEDITADO e os pedidos são
    // RENUMERADOS conforme caem. Comentário anterior à última edição pode citar um número que
    // hoje é outra aldeia — no tópico real havia entrega pro "pedido 14" numa tabela que ia até 8.
    // Por isso só conta como entregue o que foi postado DEPOIS da edição; o resto fica visível,
    // marcado, mas fora da conta.
    const BLZ_UNITS = ['spear', 'sword', 'heavy'];       // as três que a tabela da tribo usa
    const BLZ_ROT = { spear: 'lanceiro', sword: 'espadachim', heavy: 'cav. pesada' };
    // Tropa que faz sentido MANDAR DE APOIO. Vale SÓ na aba Blindagem — Apoio e Apoio massa
    // seguem mostrando as unidades todas do mundo, porque são abas de uso geral e filtrar ali
    // esconderia tropa que o usuário manda de propósito.
    const CC_UNIDADES_DEF = ['spear', 'sword', 'archer', 'heavy', 'catapult', 'knight'];
    function ccUnidadesDaAba() {
      const todas = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      if (ccTipo() !== 'blz') return todas;
      return todas.filter((u) => CC_UNIDADES_DEF.indexOf(u) >= 0);
    }

    // Alvo: aceita "478|586", "478 586", "478|586:1" etc.
    function ccAlvo() {
      const raw = ((document.getElementById('cc-alvo') || {}).value || '').trim();
      const m = raw.match(/(\d{1,3})\s*[|\s.,;:-]\s*(\d{1,3})/);
      return m ? { x: m[1], y: m[2], coord: m[1] + '|' + m[2] } : null;
    }

    // Nome da aldeia alvo, do village.txt (que já é cacheado 6h por outro módulo).
    // Carrega em segundo plano: se ainda não tem, mostra só a coordenada.
    let _mapaNomes = null, _mapaNomesCarregando = false;
    function ccNomeAlvo(coord) {
      if (!_mapaNomes) {
        if (!_mapaNomesCarregando) {
          _mapaNomesCarregando = true;
          getMapVillages(false).then((arr) => {
            const m = {}, p = {};
            arr.forEach((v) => { const k = v.x + '|' + v.y; m[k] = v.name; p[k] = v.player; });
            _mapaNomes = m; _mapaPlayers = p; ccRender(); ccHistRender();
          }).catch(() => { _mapaNomes = {}; });
        }
        return '';
      }
      return _mapaNomes[coord] || '';
    }
    // Dono da aldeia alvo: village.txt dá o id do jogador; player.txt (lazy) dá o nome.
    let _mapaPlayers = null, _mapaDonos = null, _donosCarregando = false;
    function ccDonoAlvo(coord) {
      const pid = _mapaPlayers && _mapaPlayers[coord];
      if (pid == null) return '';
      if (pid === '0' || pid === 0) return 'bárbaro';
      if (!_mapaDonos) {
        if (!_donosCarregando) {
          _donosCarregando = true;
          fetch('/map/player.txt', { credentials: 'include' }).then((r) => r.text()).then((txt) => {
            const d = {};
            txt.split('\n').forEach((ln) => {
              const f = ln.split(','); if (f.length >= 2) { try { d[f[0]] = decodeURIComponent(f[1].replace(/\+/g, ' ')); } catch (e) { d[f[0]] = f[1]; } }
            });
            _mapaDonos = d; ccHistRender(); ccRender();
          }).catch(() => { _mapaDonos = {}; });
        }
        return '';
      }
      return _mapaDonos[pid] || '';
    }
    // ---- Histórico de alvos ----
    function ccHistAdd(coord) {
      if (!coord) return;
      const h = (config.cmd.histAlvos = config.cmd.histAlvos || []);
      const i = h.findIndex((x) => x.coord === coord);
      if (i >= 0) h.splice(i, 1);
      h.unshift({ coord: coord, at: Date.now() });
      config.cmd.histAlvos = h.slice(0, 12);
      save();
    }
    function ccHistRender() {
      const cont = document.getElementById('cc-alvo-hist'); if (!cont) return;
      const h = config.cmd.histAlvos || [];
      if (!h.length) { cont.innerHTML = ''; return; }
      cont.innerHTML = '<span style="color:#584526">recentes:</span> ' + h.map((x) => {
        const nome = ccNomeAlvo(x.coord), dono = ccDonoAlvo(x.coord);
        const rot = x.coord + (nome ? ' ' + nome : '') + (dono ? ' (' + dono + ')' : '');
        return '<a class="cc-hist-a" data-coord="' + x.coord + '" style="cursor:pointer;color:#a2643a;margin-right:2px" title="' + esc(rot) + '"><b>' + esc(x.coord) + '</b>' +
          (nome ? ' <span style="color:#8a7d6d">' + esc(nome) + '</span>' : '') + '</a>';
      }).join(' · ');
      cont.querySelectorAll('.cc-hist-a').forEach((el) => el.onclick = () => {
        const al = document.getElementById('cc-alvo'); if (al) { al.value = el.getAttribute('data-coord'); al.dispatchEvent(new Event('input')); }
      });
    }

    // Uma origem "tem tropa" se atende TODAS as quantidades pedidas e, para as unidades
    // marcadas como "tudo", tem pelo menos 1. Critério único, usado pela lista e pelo botão.
    function ccTemTropa(v, comp) {
      const av = v.avail || {};
      for (const u in comp.amounts) { if ((av[u] || 0) < comp.amounts[u]) return false; }
      for (const u in comp.max) { if (!(av[u] > 0)) return false; }
      return true;
    }

    // ---- Tropa manual por aldeia (sobrepõe o modelo global de "Tropas por origem") ----
    // Mesmo formato de ccComposicao() ({amounts,max}), então ccResolverPara() atende os dois.
    // Guardado em config.cmd.origOverride[vid]. _ccOrigAbertos é só estado de UI (não persiste).
    let _ccOrigAbertos = {};
    function ccOrigOverrideGet(vid) { return (config.cmd.origOverride && config.cmd.origOverride[vid]) || null; }
    function ccOrigOverrideSet(vid, amounts) {
      config.cmd.origOverride = config.cmd.origOverride || {};
      if (Object.keys(amounts).some((u) => amounts[u] > 0)) config.cmd.origOverride[vid] = { amounts: amounts, max: {} };
      else delete config.cmd.origOverride[vid];
      save();
    }
    function ccOrigOverrideHTML(v) {
      const ov = ccOrigOverrideGet(v.vid);
      const listaU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      return '<div class="cc-ov-edit" style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:5px;align-items:center;' +
        'margin:4px 0 1px 24px;padding:5px 6px;background:#fbf7ee;border:1px solid #ece4d8;border-radius:5px">' +
        '<span style="font-size:9px;color:#6f6153;width:100%">tropa manual desta aldeia (ignora o modelo acima):</span>' +
        listaU.map((u) => '<label style="display:flex;flex-direction:column;align-items:center;font-size:8px;color:#6f6153;gap:1px">' +
          unitIcon(u, rot[u] || u) +
          '<input class="cc-ov-inp" data-vid="' + v.vid + '" data-u="' + u + '" type="number" min="0" ' +
            'value="' + ((ov && ov.amounts[u]) || '') + '" placeholder="0" style="width:38px;padding:1px;text-align:center;font-size:10px">' +
        '</label>').join('') +
        (ov ? '<a class="cc-ov-clear" data-vid="' + v.vid + '" href="#" style="font-size:9px;color:#c0483a;cursor:pointer;margin-left:4px">✕ usar modelo</a>' : '') +
      '</div>';
    }

    // ---- Filtro de grupo nas Origens (mesma ideia do filtro do módulo Fakes) ----
    let _ccGrupoVidsSet = null;
    async function ccAplicarFiltroGrupo() {
      const gid = config.cmd.origGrupo || '';
      if (!gid) { _ccGrupoVidsSet = null; ccRenderOrigens(); return; }
      try {
        const vs = await getVillagesInGroup(gid);
        _ccGrupoVidsSet = new Set(vs.map((x) => String(x.vid)));
      } catch (e) {
        _ccGrupoVidsSet = null;
        pushLog('Centro de Comando: não consegui filtrar pelo grupo (' + (e.message || e) + ').', 'err', 'cmd');
      }
      ccRenderOrigens();
    }
    async function ccCarregarGrupos() {
      const sel = document.getElementById('cc-org-grupo'); if (!sel) return;
      let grupos = []; try { grupos = await getGroups(); } catch (e) { /* sem grupos: fica só "Todas" */ }
      const cur = config.cmd.origGrupo || '';
      sel.innerHTML = '<option value="">Todas as aldeias</option>' +
        grupos.map((g) => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('');
      sel.value = cur;
      if (cur) ccAplicarFiltroGrupo();   // grupo já estava salvo de uma sessão anterior: reaplica
    }

    // Lista de origens: cada aldeia sua com distância, tempo de viagem pela unidade mais lenta
    // e se tem tropa suficiente. É o que permite escolher de onde sai o quê.
    let CCVILAS = [];
    async function ccCarregarOrigens(forcar) {
      const cont = document.getElementById('cc-origens');
      if (cont && !CCVILAS.length) cont.innerHTML = '<div style="color:#8a7d6d;padding:6px;font-size:10px">carregando aldeias…</div>';
      try {
        await ccMundo(false);
        const tropas = await ccTropasTodasAldeias(forcar);
        CCVILAS = Object.values(tropas).filter((v) => v.coord);
        if (!CCVILAS.length) {   // conta de 1 aldeia ou parser não pegou: cai pro básico
          const st = await getVillageState(CUR_VID);
          CCVILAS = [{ vid: CUR_VID, coord: null, x: null, y: null, avail: st.avail }];
        }
      } catch (e) {
        pushLog('Centro de Comando: não li as tropas das aldeias (' + (e.message || e) + ').', 'err', 'cmd');
      }
      // Só aqui sabemos quais unidades este mundo tem — reconstrói a grade preservando o digitado.
      if (CC_UNIDADES_MUNDO && _ccUnidadesDesenhadas !== CC_UNIDADES_MUNDO.join(',')) {
        _ccUnidadesDesenhadas = CC_UNIDADES_MUNDO.join(',');
        ccRenderTropas();
        ccMassaUnidades();   // grade do apoio em massa também segue as unidades do mundo
      }
      ccRenderOrigens();
    }
    let _ccUnidadesDesenhadas = '';
    function ccRenderOrigens() {
      const cont = document.getElementById('cc-origens'); if (!cont) return;
      const alvo = ccAlvo();
      const comp = ccComposicao();
      const temComp = (Object.keys(comp.amounts).length + Object.keys(comp.max).length) > 0;
      const sel = config.cmd.origens || {};
      const ch = ccChegadaMs();

      // Filtro de grupo: restringe as aldeias exibidas (não mexe na leitura de tropas nem em
      // seleções já feitas fora do grupo visível — só o que aparece na lista).
      const vilas = _ccGrupoVidsSet ? CCVILAS.filter((v) => _ccGrupoVidsSet.has(String(v.vid))) : CCVILAS;
      const linhas = vilas.map((v) => {
        const d = (alvo && v.x != null) ? fieldDist(v.x, v.y, +alvo.x, +alvo.y) : null;
        // Composição REAL desta aldeia — é dela que sai a unidade mais lenta e, portanto, o tempo.
        const compV = temComp ? ccCompParaVelocidade(comp, v.avail) : {};
        const lentaV = ccUnidadeLenta(compV);
        const t = (alvo && lentaV && v.x != null) ? ccTempoViagemMs(v.x, v.y, alvo.x, alvo.y, compV) : null;
        const temTropa = temComp ? ccTemTropa(v, comp) : true;
        const daTempo = (t == null || !ch) ? null : ((ch - t) > srvNowP());
        return { v: v, d: d, t: t, temTropa: temTropa, daTempo: daTempo, lenta: lentaV };
      });
      linhas.sort((a, b) => (a.d == null ? 1e9 : a.d) - (b.d == null ? 1e9 : b.d));

      const rotUn = {}; UNITS.forEach(([u, n]) => { rotUn[u] = n; });
      const listaUnid = ccUnidadesDaAba();   // fora do laço: a soma lá embaixo usa a mesma lista
      cont.innerHTML = linhas.map((L) => {
        const v = L.v, on = !!sel[v.vid];
        const ov = ccOrigOverrideGet(v.vid);
        const aberto = !!_ccOrigAbertos[v.vid];
        let sit, cor;
        if (!L.temTropa) { sit = '⚠ sem tropa'; cor = '#c0483a'; }
        else if (L.daTempo === false) { sit = '⚠ longe demais'; cor = '#c0483a'; }
        else if (L.t != null && ch) { sit = 'sai ' + srvClockMs(ch - L.t); cor = '#2e7d3a'; }
        else { sit = ''; cor = '#8a7d6d'; }
        // Estoque por unidade. Mostra o número em uso e, entre parênteses, o que está fora/voltando —
        // assim dá pra ver a diferença sem precisar alternar a fonte.
        const tropas = listaUnid.map((u) => {
          const q = (v.avail && v.avail[u]) || 0;
          const foraT = ((v.fora && v.fora[u]) || 0) + ((v.transito && v.transito[u]) || 0);
          if (!q && !foraT) return '';
          const rot = rotUn[u] || u;
          const pedida = (comp.amounts[u] != null) || comp.max[u];
          const falta = comp.amounts[u] != null && q < comp.amounts[u];
          // "na aldeia agora" mostra SÓ o que está na aldeia agora. O "+N" azul do que estava
          // voltando fazia o número parecer maior do que é e confundia na hora de dividir —
          // quem quer contar o que volta troca a fonte pra "total". A informação não some:
          // continua no title, ao passar o mouse.
          return '<span title="' + esc(rot) + (foraT ? ' · ' + fmtN(foraT) + ' fora/voltando' : '') +
                 '" style="color:' + (falta ? '#c0483a' : pedida ? '#a2643a' : '#584526') + '">' +
                 unitIcon(u, rot) + fmtN(q) + '</span>';
        }).filter(Boolean).join(' ');
        return '<label style="display:block;padding:3px 5px;border-bottom:1px solid rgba(0,0,0,.07);cursor:pointer">' +
          '<span style="display:grid;grid-template-columns:18px 128px 40px 58px 40px 1fr;gap:6px;align-items:center;font-size:10px">' +
            '<input type="checkbox" data-cc-org="' + v.vid + '"' + (on ? ' checked' : '') + '>' +
            '<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis" title="' + esc((v.nome || '') + ' ' + (v.coord || '')) + '">' +
              (v.nome ? '<b style="color:#584526">' + esc(v.nome) + '</b> ' : '') +
              '<span style="color:#a2643a">' + esc(v.coord || v.vid) + '</span>' +
            '</span>' +
            '<span style="color:#8a7d6d">' + (L.d == null ? '—' : L.d.toFixed(1) + ' c') + '</span>' +
            '<span style="color:#6f6153">' + (L.t == null ? '—' : fmt(L.t)) + '</span>' +
            '<span style="color:#8a7d6d" title="unidade mais lenta que sai desta aldeia">' + (L.lenta ? esc(rotUn[L.lenta] || L.lenta) : '—') + '</span>' +
            '<span style="display:flex;align-items:center;justify-content:space-between;gap:4px">' +
              '<span style="color:' + cor + '">' + sit + '</span>' +
              '<a class="cc-ov-tog" data-vid="' + v.vid + '" href="#" title="' + (ov ? 'tropa manual definida pra esta aldeia — clique pra editar' : 'definir tropa manual só pra esta aldeia (ignora o modelo acima)') + '" style="cursor:pointer;text-decoration:none;color:' + (ov ? '#a2643a' : '#c4b9a8') + ';font-weight:' + (ov ? '700' : '400') + '">⚙</a>' +
            '</span>' +
          '</span>' +
          (tropas ? '<span style="display:block;font-size:9px;margin:1px 0 0 24px;line-height:1.5">' + tropas + '</span>' : '') +
          (aberto ? ccOrigOverrideHTML(v) : '') +
        '</label>';
      }).join('') || '<div style="color:#8a7d6d;padding:6px;font-size:10px">— nenhuma aldeia —</div>';

      cont.querySelectorAll('[data-cc-org]').forEach((el) => {
        el.onchange = () => {
          config.cmd.origens[el.getAttribute('data-cc-org')] = el.checked;
          if (!el.checked) delete config.cmd.origens[el.getAttribute('data-cc-org')];
          save(); ccResumo();
        };
      });
      // Tropa manual por aldeia: abre/fecha o editor, edita os números, ou volta pro modelo global.
      cont.querySelectorAll('.cc-ov-tog').forEach((el) => el.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const vid = el.getAttribute('data-vid');
        _ccOrigAbertos[vid] = !_ccOrigAbertos[vid];
        ccRenderOrigens();
      }));
      cont.querySelectorAll('.cc-ov-edit').forEach((el) => { el.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); }); });
      cont.querySelectorAll('.cc-ov-inp').forEach((el) => el.addEventListener('change', () => {
        const vid = el.getAttribute('data-vid');
        const amounts = {};
        cont.querySelectorAll('.cc-ov-inp[data-vid="' + vid + '"]').forEach((e2) => {
          const n = parseInt(e2.value, 10) || 0; if (n > 0) amounts[e2.getAttribute('data-u')] = n;
        });
        ccOrigOverrideSet(vid, amounts);
        ccResumo();
      }));
      cont.querySelectorAll('.cc-ov-clear').forEach((el) => el.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const vid = el.getAttribute('data-vid');
        if (config.cmd.origOverride) delete config.cmd.origOverride[vid];
        save(); ccRenderOrigens();
      }));
      // Aviso quando a velocidade vier da tabela de reserva em vez do servidor.
      const av = document.getElementById('cc-vel-aviso');
      if (av) {
        const m = config.cmd.mundo || {};
        // A unidade mais lenta varia por aldeia quando tem "tudo" marcado, então o cabeçalho
        // só afirma uma quando ela é a mesma em todas.
        const lentas = Array.from(new Set(linhas.map((L) => L.lenta).filter(Boolean)));
        const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
        const txtLenta = lentas.length === 1 ? ('<b>' + esc(rot[lentas[0]] || lentas[0]) + '</b>')
                       : lentas.length ? '<b>varia por aldeia</b>' : '<b>—</b>';
        av.innerHTML = !temComp ? '<span style="color:#8a7d6d">digite as tropas pra ver os tempos</span>'
          : ('unidade mais lenta: ' + txtLenta + ' · mundo ' + (m.speed || 1) + '×/' + (m.unitSpeed || 1) + '×' +
             (m.confiavel ? '' : ' · <span style="color:#a2643a">velocidades de reserva (o servidor confirma no preparo)</span>'));
      }
      // Soma das tropas das origens MARCADAS. Sem ela, saber quanto tem no total significava
      // somar linha a linha na mão — e é justamente esse número que decide se dá pra atender a
      // tabela da tribo. Segue a fonte de tropa escolhida e as unidades da aba, igual às linhas.
      const soma = document.getElementById('cc-origens-soma');
      if (soma) {
        const marcadas = linhas.filter((L) => sel[L.v.vid]);
        const tot = {};
        marcadas.forEach((L) => {
          listaUnid.forEach((u) => { tot[u] = (tot[u] || 0) + (((L.v.avail || {})[u]) || 0); });
        });
        const partes = listaUnid.filter((u) => tot[u] > 0)
          .map((u) => '<span title="' + esc(rotUn[u] || u) + '">' + unitIcon(u, rotUn[u] || u) + '<b>' + fmtN(tot[u]) + '</b></span>');
        soma.innerHTML = !marcadas.length
          ? '<span style="color:#8a7d6d">nenhuma origem marcada</span>'
          : ('<b>' + marcadas.length + '</b> origem(ns) marcada(s): ' +
             (partes.length ? partes.join(' &nbsp;') : '<span style="color:#8a7d6d">sem tropa</span>'));
      }
      ccResumo();
    }
    function ccChegadaMs() {
      const el = document.getElementById('cc-chegada');
      return arrivalToServerMs((el && el.value) || '') || 0;
    }
    function ccResumo() {
      const el = document.getElementById('cc-resumo'); if (!el) return;
      const n = Object.keys(config.cmd.origens || {}).filter((k) => config.cmd.origens[k]).length;
      const alvo = ccAlvo();
      const ch = ccChegadaMs();
      const base = n + ' de ' + CCVILAS.length + ' aldeia(s) marcada(s)' + (alvo ? ' → ' + alvo.coord : '') +
                   (ch ? ' · chegando ' + srvClockMs(ch) : '');
      // A Operação tem lista de aldeias e resumo próprios (por alvo), então este resumo
      // global — que fala das origens marcadas — não se aplica a ela.
      el.textContent = (ccTipo() === 'op') ? '' : base;
    }

    // Só dá pra mexer no tempo antes do disparo fino assumir. Depois de 'armado' o spin
    // já está rodando com o horário capturado, e mudar ali sairia pela culatra.
    function ccEditavel(c) { return c.state === 'novo' || c.state === 'preparado'; }
    // Desloca a chegada e recalcula saída/disparo a partir da duração que o servidor deu.
    function ccAjustar(id, deltaMs) {
      const c = cmdFila().find((z) => z.id === id);
      if (!c || !ccEditavel(c)) return;
      c.arriveAt += deltaMs;
      if (c.durMs != null) cmdRecalc(c);
      save(); ccRender(); cmdTick();
    }
    // Troca a chegada com o vizinho na ordem exibida — é assim que "reordenar" faz sentido:
    // a ordem de um trem é definida pela hora de chegada, não pela posição na lista.
    function ccTrocar(id, dir) {
      const lista = ccFilaOrdenada();
      const i = lista.findIndex((z) => z.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= lista.length) return;
      const a = lista[i], b = lista[j];
      if (!ccEditavel(a) || !ccEditavel(b)) return;
      const t = a.arriveAt; a.arriveAt = b.arriveAt; b.arriveAt = t;
      if (a.durMs != null) cmdRecalc(a);
      if (b.durMs != null) cmdRecalc(b);
      save(); ccRender(); cmdTick();
    }
    // Saída de um comando: a confirmada pelo servidor, ou — antes do preparo — a mesma
    // estimativa local que a coluna "sai" já mostra.
    // O bug que isto conserta: comando 'novo' tem sendAt = 0, então o "ordenar por saída" caía
    // no fallback pra chegada e a ordem não mudava NADA. Como quase todo comando na fila está
    // em 'novo', a opção parecia simplesmente não funcionar.
    function ccSaidaDe(c) {
      if (c.sendAt) return c.sendAt;
      const e = ccEstimaDeComando(c);
      return (e != null && c.arriveAt) ? (c.arriveAt - e) : (c.arriveAt || 0);
    }
    function ccFilaOrdenada() {
      const porSaida = (config.cmd.filaOrdem === 'saida');
      return cmdFila().slice().sort((a, b) => {
        const va = porSaida ? ccSaidaDe(a) : (a.arriveAt || 0);
        const vb = porSaida ? ccSaidaDe(b) : (b.arriveAt || 0);
        return va - vb;
      });
    }

    // Abas da fila: "a enviar" x "enviados". Controla só a visibilidade; ccRender preenche as duas.
    function ccFilaTab(qual) {
      if (qual) { config.cmd.filaTab = qual; save(); }
      const q = config.cmd.filaTab || 'envio';
      const be = document.getElementById('cc-fila-envio');
      const bd = document.getElementById('cc-fila-enviados');
      if (be) be.style.display = (q === 'envio') ? 'block' : 'none';
      if (bd) bd.style.display = (q === 'enviados') ? 'block' : 'none';
      document.querySelectorAll('.cc-ftab').forEach((el) => {
        const on = el.getAttribute('data-ftab') === q;
        el.style.background = on ? '#ffffff' : '#ffffff';
        el.style.color = on ? '#a2643a' : '#8a7d6d';
        el.style.fontWeight = on ? '600' : '400';
        el.style.borderBottom = on ? '1px solid #ffffff' : '1px solid #ece4d8';
      });
    }
    // Resumo das tropas em TEXTO puro (pra title/tooltip): "50 Expl., 1000 Lanc."
    function ccTropaTxt(amounts) {
      if (!amounts) return 'sem tropa';
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      const listaU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      return listaU.filter((u) => (amounts[u] || 0) > 0).map((u) => fmtN(amounts[u]) + ' ' + (rot[u] || u)).join(', ') || 'sem tropa';
    }
    // Resumo visual das tropas de um comando: ícone + número, só as unidades > 0.
    function ccTropaResumo(amounts) {
      if (!amounts) return '';
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });
      const listaU = CC_UNIDADES_MUNDO || UNITS.map((u) => u[0]);
      return listaU.filter((u) => (amounts[u] || 0) > 0)
        .map((u) => '<span style="white-space:nowrap" title="' + esc(rot[u] || u) + '">' + unitIcon(u, rot[u] || u) + fmtN(amounts[u]) + '</span>')
        .join(' ');
    }
    // Categoria de exibição do comando — usada tanto na linha da fila quanto no filtro de tipo,
    // pra um nunca discordar do outro.
    function ccRotTipo(c) { return { support: 'apoio', fake: 'fake', nobre: 'nobre' }[c.tipo] || 'ataque'; }
    // c.parcial null = segue o padrão geral (config.cmd.enviarParcial); true/false força só este.
    function ccParcialEfetivo(c) { return (c.parcial != null) ? c.parcial : !!config.cmd.enviarParcial; }
    function cmdCicloParcial(id) {
      const c = cmdFila().find((z) => z.id === id); if (!c || c.state !== 'novo') return;
      c.parcial = (c.parcial == null) ? true : (c.parcial === true ? false : null);
      save(); ccRender();
    }

    // ---- Conferência antecipada de tropa ----
    // O "confirmar" do servidor só roda 60s antes da saída; descobrir ali que falta tropa não
    // deixa tempo de trocar nada. Isto confere a qualquer momento, com os dados já lidos das
    // aldeias. Detalhe que engana quem confere comando a comando: comandos da MESMA origem
    // disputam o MESMO estoque, então a conta tem que ser pela SOMA dos pendentes daquela aldeia.
    let _ccPontos = null;
    function ccPontosCarregar() {
      if (_ccPontos) return;
      try { getVillagePoints().then((p) => { _ccPontos = p; }).catch(() => {}); } catch (e) {}
    }
    function ccFilaConferir() {
      const out = {};
      if (!CCVILAS.length) return out;   // tropas ainda não lidas: não inventa alarme falso
      const porVid = {};
      cmdPendentes().forEach((c) => { (porVid[String(c.origin)] = porVid[String(c.origin)] || []).push(c); });
      Object.keys(porVid).forEach((vid) => {
        const v = CCVILAS.find((z) => String(z.vid) === String(vid));
        if (!v) return;
        const casa = v.casa || {}, minhas = v.minhas || {};
        const rotN = {}; UNITS.forEach(([u, n]) => { rotN[u] = n; });
        // Aloca a tropa na ordem de SAÍDA — quem sai antes leva antes, que é o que acontece de
        // verdade. Antes a conta era a soma da aldeia e o aviso caía em TODO comando que usasse
        // a unidade em falta: um fake pedindo 1 aríete aparecia como "Aríete 301/300", onde o
        // 301 era o total da aldeia (um ataque pedia 300) e nem era pedido dele. Agora o aviso
        // cai em quem realmente vai ficar sem, com o número que é dele.
        // "minhas" inclui o que está fora/voltando; "casa" é o que dá pra mandar agora. Estourar
        // "minhas" não cabe nem esperando; estourar só "casa" depende de tropa voltar a tempo.
        const saiDe = (c) => {
          const e = ccEstimaDeComando(c);
          return c.sendAt || ((e != null && c.arriveAt) ? (c.arriveAt - e) : (c.arriveAt || 0));
        };
        const restaT = Object.assign({}, minhas), restaC = Object.assign({}, casa);
        porVid[vid].slice().sort((a, b) => saiDe(a) - saiDe(b)).forEach((c) => {
          // Devolve info pra TODO comando pendente, não só pros problemáticos: numa operação o
          // que se quer é confirmar que está tudo certo, não só a ausência de vermelho.
          const info = {};
          const faltaT = [], faltaC = [];
          // Um comando de trem leva TODAS as ondas dele no mesmo envio, então o que ele consome
          // é a SOMA delas. Contar só c.amounts (a 1ª onda) fazia a conferência dizer "ok" num
          // trem que pedia o triplo do que a aldeia tinha — e o erro só aparecia no disparo.
          const ondasCmd = [c.amounts].concat(c.trem || []);
          const pedido = {};
          ondasCmd.forEach((am) => Object.keys(am || {}).forEach((u) => {
            pedido[u] = (pedido[u] || 0) + (am[u] || 0);
          }));
          Object.keys(pedido).forEach((u) => {
            const q = pedido[u] || 0; if (q <= 0) return;
            const dT = restaT[u] || 0, dC = restaC[u] || 0;
            if (q > dT) faltaT.push({ u: u, pede: q, tem: Math.max(0, dT) });
            else if (q > dC) faltaC.push({ u: u, pede: q, tem: Math.max(0, dC) });
            restaT[u] = dT - q; restaC[u] = dC - q;
          });
          let piso = null;
          // Piso de população: só ataque tem, e ataque só de explorador é isento (regra do jogo).
          if (c.tipo !== 'support') {
            const pts = _ccPontos ? (parseInt(_ccPontos[String(c.origin)], 10) || 0) : 0;
            const minPop = pts > 0 ? Math.ceil((FAKE_LIMIT_PCT / 100) * pts) : 0;
            // Cada onda do trem é um ataque separado pro servidor, então o piso vale pra CADA
            // uma — o que decide é a PIOR delas, não a soma nem só a primeira.
            let pior = null;
            ondasCmd.forEach((am) => {
              if (Object.keys(am || {}).every((u) => u === 'spy')) return;   // só-explorador é isento
              const p = ccFakePopOf(am);
              if (pior == null || p < pior) pior = p;
            });
            const soSpy = (pior == null);
            const pop = soSpy ? ccFakePopOf(c.amounts) : pior;
            info.pop = { atual: pop, min: minPop, isento: soSpy, semPontos: !pts, ondas: ondasCmd.length };
            const falta = minPop - pop;
            if (!soSpy && pts && falta > 0) {
              const precisa = Math.ceil(falta / (FAKE_POP.spy || 2));
              // O que sobra DEPOIS deste comando já ter pego a parte dele.
              piso = ((restaC.spy || 0) >= precisa)
                ? { nivel: 'aviso', msg: 'abaixo do piso de população — completa sozinho com ' + precisa + ' explorador(es)' }
                : { nivel: 'erro', msg: 'abaixo do piso de população e sem explorador pra completar (faltam ' + falta + ' hab.)' };
            }
          }
          const det = (lista) => lista.map((x) => (rotN[x.u] || x.u) + ' ' + fmtN(x.pede) + '/' + fmtN(x.tem)).join(', ');
          if (faltaT.length) { info.nivel = 'erro'; info.msg = 'tropa insuficiente pra este comando (pede/sobra): ' + det(faltaT); }
          else if (piso && piso.nivel === 'erro') { info.nivel = piso.nivel; info.msg = piso.msg; }
          else if (faltaC.length) { info.nivel = 'aviso'; info.msg = 'depende de tropa voltar (pede/em casa): ' + det(faltaC); }
          else if (piso) { info.nivel = piso.nivel; info.msg = piso.msg; }
          out[c.id] = info;
        });
      });
      return out;
    }
    // ---- Agrupar comandos JÁ ARMADOS num trem ----
    // Sem isto só dava pra usar o trem remontando a operação do zero, o que ninguém vai querer
    // fazer com 13 ondas já calibradas. Junta o que já está na fila.
    // Critério (o mesmo do armar): mesma ORIGEM, mesmo ALVO e tipo ataque — o formulário do
    // trem tem um x/y só, então ondas pra alvos diferentes não podem ir juntas. Apoio fica fora.
    // 'armado' não entra: já está no spin de disparo, mexer ali atrasaria o tiro.
    function ccFilaTremGrupos() {
      const grupos = {};
      cmdFila().forEach((c) => {
        if (c.state !== 'novo' && c.state !== 'preparado') return;
        if (c.tipo === 'support' || c.tipo === 'snipe') return;
        const k = String(c.origin) + '>' + c.x + '|' + c.y;
        (grupos[k] = grupos[k] || []).push(c);
      });
      return Object.keys(grupos).map((k) => grupos[k]).filter((g) => g.length > 1);
    }
    function ccFilaAgruparTrem() {
      const grupos = ccFilaTremGrupos();
      if (!grupos.length) return;
      const nOndas = grupos.reduce((s, g) => s + g.length, 0);
      if (!confirm('Agrupar ' + nOndas + ' comando(s) em ' + grupos.length + ' trem(ns)?\n\n' +
                   'As ondas de cada grupo passam a sair JUNTAS, num POST só, com o horário da ' +
                   'primeira do grupo — o horário individual das demais deixa de valer.\n\n' +
                   'É isso que evita elas disputarem a mesma tropa no servidor.')) return;
      const absorvidos = {};
      grupos.forEach((g) => {
        g.sort((a, b) => (a.arriveAt || 0) - (b.arriveAt || 0));
        const base = g[0], extras = g.slice(1);
        base.trem = (base.trem || []).concat(extras.map((c) => c.amounts));
        // Volta pra "novo": o c.prep guardado foi confirmado SEM as ondas extras, então tem que
        // ser refeito — senão o POST sairia com o corpo antigo, de uma onda só.
        base.state = 'novo'; base.prep = null; base.durMs = null; base.sendAt = 0; base.fireAt = 0; base.erro = null;
        extras.forEach((c) => { absorvidos[c.id] = 1; });
      });
      config.cmd.fila = cmdFila().filter((c) => !absorvidos[c.id]);
      save(); ccRender();
      pushLog('Central: ' + nOndas + ' comando(s) agrupados em ' + grupos.length + ' trem(ns) — vão sair num POST só.', 'ok', 'cmd');
    }
    // ---- Editar a tropa de um comando já na fila ----
    let _ccFilaEdit = null;
    function ccFilaEditar(id) { _ccFilaEdit = (_ccFilaEdit === id) ? null : id; ccRender(); }
    // Mexer na tropa de um comando JÁ preparado invalida o formulário que o servidor devolveu
    // (c.prep guarda o corpo exato do POST, com as quantidades antigas). Por isso ele volta pra
    // "novo" e é re-confirmado — senão o envio sairia com a composição velha, sem aviso nenhum.
    function ccFilaSetTropa(id, u, n) {
      const c = cmdFila().find((z) => z.id === id); if (!c) return;
      if (c.state !== 'novo' && c.state !== 'preparado') return;
      c.amounts = c.amounts || {};
      if (n > 0) c.amounts[u] = n; else delete c.amounts[u];
      if (c.state === 'preparado') {
        c.state = 'novo'; c.prep = null; c.durMs = null; c.sendAt = 0; c.fireAt = 0;
        pushLog('Central: ' + c.x + '|' + c.y + ' — tropa alterada, vai reconfirmar no servidor.', '', 'cmd');
      }
      save();
    }
    function ccRender() {
      // Fila dividida: "a enviar" (novo/preparado/armado) e "enviados/concluídos" (o resto).
      const bEnvio = document.getElementById('cc-fila-envio');
      const bEnv = document.getElementById('cc-fila-enviados');
      if (!bEnvio || !bEnv) return;
      // ccTick redesenha a Fila 1x/s. Se o foco está numa caixa daqui, redesenhar apagaria o
      // número sendo digitado (e o foco junto) — então segura o redesenho enquanto se edita.
      const ae = document.activeElement;
      if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) && (bEnvio.contains(ae) || bEnv.contains(ae))) return;
      const f = cmdFila();
      const ord = document.getElementById('cc-fila-ordem');
      if (ord && ord.value !== config.cmd.filaOrdem) ord.value = config.cmd.filaOrdem;
      const conf = ccFilaConferir();
      // Contador no cabeçalho, pra saber que há comandos mesmo com a seção recolhida — e, agora
      // que a Fila abre recolhida, é aqui que o alerta de tropa tem que aparecer.
      const cn = document.getElementById('cc-fila-n');
      if (cn) {
        const pend = f.filter((c) => c.state === 'novo' || c.state === 'preparado' || c.state === 'armado').length;
        const nErro = Object.keys(conf).filter((k) => conf[k].nivel === 'erro').length;
        const nAviso = Object.keys(conf).filter((k) => conf[k].nivel === 'aviso').length;
        cn.innerHTML = (f.length ? ('(' + pend + ' pendente(s) de ' + f.length + ')') : '') +
          (nErro ? ' <b style="color:#c0483a">⛔ ' + nErro + ' sem tropa</b>' : '') +
          (nAviso ? ' <b style="color:#a2643a">⚠ ' + nAviso + '</b>' : '');
      }
      const agora = serverNow();
      const passo = Math.max(1, config.cmd.passoMs || 50);
      const corDe = { novo: '#6f6153', preparado: '#a2643a', armado: '#2e7d3a', enviado: '#2e7d3a', erro: '#c0483a', abortado: '#8a7d6d' };
      const linha = (c) => {
        // "falta" = quanto falta pra SAIR (não pra chegar). Preparado, sendAt é a saída exata;
        // antes disso estima pela viagem local (arriveAt − tempo de viagem).
        const estFalta = ccEstimaDeComando(c);
        const saiEm = c.sendAt ? c.sendAt : (estFalta != null ? c.arriveAt - estFalta : c.arriveAt);
        const falta = saiEm - agora;
        const dev = (c.desvioMs == null) ? '' : ((c.desvioMs >= 0 ? '+' : '') + c.desvioMs + 'ms');
        const vo = CCVILAS.find((z) => String(z.vid) === String(c.origin));
        const org = vo ? (vo.coord || vo.vid) : c.origin;
        const orgNome = vo && vo.nome ? vo.nome : '';
        const alvoNome = ccNomeAlvo(c.x + '|' + c.y);
        const rot = ccRotTipo(c);
        // 'armado' já está no spin de disparo — mexer ali sairia com a composição velha ou
        // atrasaria o tiro. Antes disso dá pra editar à vontade.
        const podeEditarTropa = (c.state === 'novo' || c.state === 'preparado');
        const _p = (conf[c.id] || {}).pop;
        let popTxt = '', popCor = '#8a7d6d', popNota = '';
        if (_p) {
          if (_p.isento) { popTxt = 'pop ' + fmtN(_p.atual) + ' · isento'; popNota = 'ataque só de explorador não tem piso'; }
          else if (_p.semPontos) { popTxt = 'pop ' + fmtN(_p.atual); popNota = 'pontos da origem ainda não lidos — piso não conferido'; }
          else {
            const ok = _p.atual >= _p.min;
            popTxt = 'pop ' + fmtN(_p.atual) + '/' + fmtN(_p.min) + (ok ? ' ✓' : ' ⛔');
            popCor = ok ? '#2e7d3a' : '#c0483a';
            popNota = 'piso de ' + FAKE_LIMIT_PCT + '% dos pontos da aldeia de origem';
          }
        }
        // Horário de saída: já confirmado pelo servidor (c.sendAt) ou, antes do preparo,
        // a estimativa local. A estimativa aparece com "~" pra não passar por certeza.
        let saiTxt = '—', saiCor = '#8a7d6d', saiMs = null;
        if (c.sendAt) { saiMs = c.sendAt; saiTxt = srvClockMs(c.sendAt); saiCor = '#2e7d3a'; }
        else {
          const est = ccEstimaDeComando(c);
          if (est != null && c.arriveAt) { saiMs = c.arriveAt - est; saiTxt = '~' + srvClockMs(saiMs); saiCor = '#6f6153'; }
        }
        // Dia em segunda linha (só quando não é hoje) — mesma solução das colunas de/para, que já
        // quebram em duas linhas quando têm nome além da coordenada.
        const diaSai = ccDiaRel(saiMs), diaCheg = ccDiaRel(c.arriveAt);
        const selo = (t) => '<br><span style="color:#a8564a;font-size:9px">' + t + '</span>';
        return '<div style="display:grid;grid-template-columns:42px 108px 108px 1fr 78px 78px 56px 18px;gap:4px;align-items:center;padding:3px 5px;border-bottom:1px solid rgba(0,0,0,.07);font-size:10px">' +
          '<span style="color:' + (c.tipo === 'support' ? '#1f6fb2' : '#b5602f') + '">' + rot + (c.ondas ? ' ' + c.onda + '/' + c.ondas : '') +
            (c.trem ? '<br><span style="color:#8b5426;font-size:9px" title="trem: ' + (c.trem.length + 1) + ' ondas num POST só, pelo recurso nativo do jogo">🚂 ' + (c.trem.length + 1) + ' ondas</span>' : '') + '</span>' +
          '<span style="color:#8a7d6d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(orgNome || String(org)) + '">' +
            esc(String(org)) + (orgNome ? '<br><span style="color:#584526">' + esc(orgNome) + '</span>' : '') + '</span>' +
          '<span style="color:#a2643a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(alvoNome || (c.x + '|' + c.y)) + '">' +
            esc(c.x + '|' + c.y) + (alvoNome ? '<br><span style="color:#8a7d6d">' + esc(alvoNome) + '</span>' : '') + '</span>' +
          '<span style="color:' + (corDe[c.state] || '#6f6153') + '">' + esc(c.state) + (c.erro ? ' · ' + esc(c.erro.slice(0, 40)) : '') + '</span>' +
          '<span style="color:' + saiCor + '" title="horário de saída">' + saiTxt + (diaSai ? selo(diaSai) : '') + '</span>' +
          '<span style="color:#6f6153">' + (c.arriveAt ? srvClockMs(c.arriveAt) + (diaCheg ? selo(diaCheg) : '') : '—') + '</span>' +
          '<span style="text-align:right;color:' + (dev ? erroCor(Math.abs(c.desvioMs)) : '#8a7d6d') + '">' + (dev || (falta > 0 ? fmt(falta) : '—')) + '</span>' +
          (c.state === 'novo' || c.state === 'preparado' || c.state === 'armado'
            ? '<span data-cc-ab="' + c.id + '" style="cursor:pointer;color:#c0483a" title="abortar">✕</span>' : '<span></span>') +
          // Aviso da conferência antecipada: aparece MUITO antes do preparo, dando tempo de
          // trocar a tropa em vez de descobrir o problema 60s antes da saída.
          ((conf[c.id] && conf[c.id].nivel) ? '<span style="grid-column:1/-1;font-size:9px;margin:2px 0 0 46px;color:' +
            (conf[c.id].nivel === 'erro' ? '#c0483a' : '#a2643a') + '">' +
            (conf[c.id].nivel === 'erro' ? '⛔ ' : '⚠ ') + esc(conf[c.id].msg) + '</span>' : '') +
          // Tropas que saem neste comando — largura total, pra não espremer a grade.
          '<span style="grid-column:1/-1;font-size:9px;color:#8a7d6d;margin:1px 0 0 46px;line-height:1.6">' +
            // Num trem a linha de cima vira o cabeçalho: as ondas aparecem uma a uma logo abaixo,
            // senão só se veria a tropa da 1ª e não daria pra conferir o que as outras levam.
            (c.trem
              ? '<b style="color:#8b5426">🚂 ' + (c.trem.length + 1) + ' ondas saem juntas</b>' +
                '<span style="color:#8a7d6d"> — mesmo envio, espaçadas pelo servidor</span>'
              : (ccTropaResumo(c.amounts) || '<span style="color:#584526">— sem tropa —</span>')) +
            // População vs o piso de 1% dos pontos da origem — mostrado SEMPRE, não só quando
            // falha: numa operação você quer confirmar que passou, não deduzir pelo silêncio.
            (popTxt ? ' &nbsp;<span style="color:' + popCor + '" title="população deste comando' +
              (popNota ? ' — ' + esc(popNota) : '') + '">' + popTxt + '</span>' : '') +
            (podeEditarTropa ? ' &nbsp;<a data-edit-tropa="' + c.id + '" style="cursor:pointer;color:#a2643a;text-decoration:none" ' +
              'title="mexer na tropa deste comando (ele reconfirma no servidor se já estava preparado)">' +
              (_ccFilaEdit === c.id ? '▾ fechar tropa' : '✎ tropa') + '</a>' : '') +
            // Só antes do preparo: depois que confirmou no servidor (c.prep já montado), mudar
            // isto aqui não re-executa o confirmar, então não teria efeito nenhum no que sai.
            (c.state === 'novo' ? ' &nbsp;<a data-parcial="' + c.id + '" style="cursor:pointer;color:' +
              (c.parcial == null ? '#8a7d6d' : (c.parcial ? '#2e7d3a' : '#c0483a')) +
              '" title="clique pra alternar: geral → forçado parcial → forçado exato → geral">envio: ' +
              esc(c.parcial == null ? ('geral (' + (ccParcialEfetivo(c) ? 'parcial' : 'exato') + ')') : (c.parcial ? 'forçado parcial' : 'forçado exato')) +
              '</a>' : '') +
          '</span>' +
          // Cada onda do trem, numerada e na ordem em que vai sair — é a conferência visual de
          // que o agrupamento pegou o que devia (e do que cada uma leva).
          (c.trem ? [c.amounts].concat(c.trem).map((am, k) =>
            '<span style="grid-column:1/-1;font-size:9px;color:#8a7d6d;margin:1px 0 0 58px;line-height:1.6">' +
              '<b style="color:#8b5426">' + (k + 1) + 'ª</b> ' +
              (ccTropaResumo(am) || '<span style="color:#584526">— sem tropa —</span>') + '</span>').join('') : '') +
          // Grade pra mexer na tropa sem desarmar o comando. O número embaixo é o que a origem
          // tem EM CASA agora — é o teto real pra quem sai já, já.
          (_ccFilaEdit === c.id ? '<span style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:3px;margin:4px 0 2px 46px">' +
            ccUnidadesUI().map(([u, rotu]) => {
              const vo2 = CCVILAS.find((z) => String(z.vid) === String(c.origin));
              const emCasa = ((vo2 && vo2.casa) || {})[u] || 0;
              const tot = ((vo2 && vo2.minhas) || {})[u] || 0;
              const meu = (c.amounts && c.amounts[u]) || 0;
              return '<label class="twmgr-ucell' + ((tot > 0 || meu > 0) ? '' : ' vazia') + '" title="' + esc(rotu) +
                ' — ' + fmtN(emCasa) + ' em casa, ' + fmtN(tot) + ' suas no total">' + unitIcon(u, rotu) +
                '<input class="cc-fila-amt twmgr-uinp" data-id="' + c.id + '" data-u="' + u + '" type="number" min="0" placeholder="0" value="' + (meu || '') + '">' +
                '<span class="twmgr-uqt">' + fmtN(emCasa) + '</span></label>';
            }).join('') + '</span>' : '') +
          // Ajuste fino: mexe na CHEGADA e o horário de saída se recalcula sozinho.
          // Some depois que o comando entra no disparo, quando mudar já não é seguro.
          (ccEditavel(c)
            ? '<span style="grid-column:1/-1;text-align:right;font-size:9px;color:#8a7d6d;padding-top:1px">' +
                '<a data-aj="' + c.id + '" data-d="' + (-passo * 10) + '" style="cursor:pointer;color:#a2643a" title="−' + (passo * 10) + 'ms">≪</a> ' +
                '<a data-aj="' + c.id + '" data-d="' + (-passo) + '" style="cursor:pointer;color:#a2643a" title="−' + passo + 'ms">‹</a> ' +
                '<span style="color:#584526">ajuste</span> ' +
                '<a data-aj="' + c.id + '" data-d="' + passo + '" style="cursor:pointer;color:#a2643a" title="+' + passo + 'ms">›</a> ' +
                '<a data-aj="' + c.id + '" data-d="' + (passo * 10) + '" style="cursor:pointer;color:#a2643a" title="+' + (passo * 10) + 'ms">≫</a>' +
                ' &nbsp;<a data-sw="' + c.id + '" data-dir="-1" style="cursor:pointer;color:#2e7d3a" title="trocar de lugar com o de cima">▲</a>' +
                ' <a data-sw="' + c.id + '" data-dir="1" style="cursor:pointer;color:#2e7d3a" title="trocar de lugar com o de baixo">▼</a>' +
              '</span>'
            : '') +
          '</div>';
      };
      const ehEnvio = (c) => c.state === 'novo' || c.state === 'preparado' || c.state === 'armado';
      const filtroTipo = config.cmd.filaTipoFiltro || '';
      // Filtro de alvo: casa contra a COORDENADA e contra o NOME da aldeia alvo, porque numa
      // operação você lembra de um ou do outro — raramente dos dois.
      const filtroAlvo = (config.cmd.filaAlvoFiltro || '').trim().toLowerCase();
      const passaFiltro = (c) => {
        if (filtroTipo && ccRotTipo(c) !== filtroTipo) return false;
        if (!filtroAlvo) return true;
        const coord = c.x + '|' + c.y;
        const nome = ccNomeAlvo(coord) || '';
        return coord.toLowerCase().indexOf(filtroAlvo) >= 0 || nome.toLowerCase().indexOf(filtroAlvo) >= 0;
      };
      const ordenada = ccFilaOrdenada().filter(passaFiltro);
      const envio = ordenada.filter(ehEnvio);
      const feitos = ordenada.filter((c) => !ehEnvio(c));
      const vazio = (t) => '<div style="color:#8a7d6d;padding:6px;font-size:10px">' + t + '</div>';
      const sufFiltro = filtroTipo ? ' desse tipo' : '';
      bEnvio.innerHTML = envio.length ? envio.map(linha).join('') : vazio('— nada a enviar' + sufFiltro + ' —');
      bEnv.innerHTML = feitos.length ? feitos.map(linha).join('') : vazio('— nada enviado' + sufFiltro + ' ainda —');
      const ne = document.getElementById('cc-ftab-n-envio'); if (ne) ne.textContent = '(' + envio.length + ')';
      const nd = document.getElementById('cc-ftab-n-enviados'); if (nd) nd.textContent = '(' + feitos.length + ')';
      [bEnvio, bEnv].forEach((box) => {
        box.querySelectorAll('[data-aj]').forEach((e) => e.onclick = () =>
          ccAjustar(e.getAttribute('data-aj'), parseInt(e.getAttribute('data-d'), 10)));
        box.querySelectorAll('[data-sw]').forEach((e) => e.onclick = () =>
          ccTrocar(e.getAttribute('data-sw'), parseInt(e.getAttribute('data-dir'), 10)));
        box.querySelectorAll('[data-cc-ab]').forEach((el) => el.onclick = () => cmdAbortar(el.getAttribute('data-cc-ab')));
        box.querySelectorAll('[data-parcial]').forEach((el) => el.onclick = () => cmdCicloParcial(el.getAttribute('data-parcial')));
        box.querySelectorAll('[data-edit-tropa]').forEach((el) => el.onclick = () => ccFilaEditar(el.getAttribute('data-edit-tropa')));
        box.querySelectorAll('.cc-fila-amt').forEach((el) => el.onchange = () => {
          ccFilaSetTropa(el.getAttribute('data-id'), el.getAttribute('data-u'), parseInt(el.value, 10) || 0);
          ccRender();   // o "sai" muda junto (a unidade mais lenta pode ter mudado)
        });
      });
      // Botão de agrupar em trem: aparece só quando há ondas da mesma origem pro mesmo alvo —
      // que é exatamente o caso em que elas disputam a mesma tropa no servidor.
      const btTrem = document.getElementById('cc-trem-agrupar');
      if (btTrem) {
        const gs = ccFilaTremGrupos();
        if (gs.length) {
          const n = gs.reduce((s, g) => s + g.length, 0);
          btTrem.style.display = '';
          btTrem.textContent = '🚂 agrupar ' + n + ' em ' + gs.length + ' trem(ns)';
          btTrem.title = 'Junta ondas da mesma aldeia pro mesmo alvo num envio só, pelo recurso nativo do jogo. Evita que elas disputem a mesma tropa.';
          btTrem.onclick = ccFilaAgruparTrem;
        } else { btTrem.style.display = 'none'; }
      }
    }

    // Relógio a 100ms; a fila só 1x por segundo. Redesenhar a lista 10x/s atrapalharia o clique
    // no botão de abortar e ainda somaria trabalho de CPU bem na hora do spin.
    let _ccLastRender = 0;
    function ccTick() {
      const clk = document.getElementById('cc-clock');
      if (clk) clk.textContent = srvClockMs();
      const sil = document.getElementById('cc-silencio');
      if (sil) sil.textContent = SILENCE.on ? '🔇 modo silêncio — outros módulos congelados' : '';
      if (SILENCE.on) return;                    // durante o silêncio, nem DOM a gente toca
      const st = document.getElementById('cc-saude');
      if (st) {
        const e = erroEstimadoMs();
        const partes = [
          'latência <b>' + Math.round(NETLAT.rttMin || 0) + 'ms</b>',
          'erro estimado <b style="color:' + erroCor(e) + '">±' + e + 'ms</b>',
          'aba <b>' + (document.hidden ? 'em 2º plano' : 'visível') + '</b>',
        ];
        // Sem o oscilador ativo, uma aba escondida perde centenas de ms. O usuário precisa ver isso.
        // Avisa sempre que houver comando pendente, não só com a aba escondida: a aba pode ser
        // mandada pra 2º plano a qualquer momento, e aí já é tarde pra descobrir que estava off.
        if (!awakeAtivo() && cmdPendentes().length) partes.push('<b style="color:#c0483a">⚠ antichoke inativo — clique em qualquer lugar da página</b>');
        if (Math.abs(CLK.driftMs || 0) > 50) partes.push('<b style="color:#a2643a">relógio oscilando ' + Math.round(CLK.driftMs) + 'ms</b>');
        if (!window.Timing) partes.push('<b style="color:#c0483a">sem relógio do jogo!</b>');
        st.innerHTML = partes.join(' · ');
      }
      // Viés medido pelo laço fechado (ccMedir). Se ficar em "—" depois de vários envios, a
      // auto-calibração não está medindo a chegada — aí o ajuste manual é o caminho.
      const vi = document.getElementById('cc-vies');
      if (vi) {
        const k = (config.cmd && config.cmd.calib) || {};
        vi.innerHTML = 'viés <b style="color:' + (k.n ? '#2e7d3a' : '#8a7d6d') + '">' +
          (k.n ? (k.biasMs > 0 ? '+' : '') + Math.round(k.biasMs || 0) + 'ms' : '—') + '</b>' +
          (k.n ? ' (' + k.n + ' amostra' + (k.n > 1 ? 's' : '') + ')' : ' <span style="color:#584526">(não calibrou)</span>');
      }
      // O mesmo número no <summary> do bloco recolhido. Recolher não pode ESCONDER informação:
      // "não calibrou" é justamente o que precisa ser visto sem abrir nada, porque é o estado em
      // que o agendador está rodando com lead zero.
      const vr = document.getElementById('cc-vies-resumo');
      if (vr) {
        const k2 = (config.cmd && config.cmd.calib) || {};
        vr.innerHTML = k2.n
          ? '· viés ' + (k2.biasMs > 0 ? '+' : '') + Math.round(k2.biasMs || 0) + 'ms'
          : '· <span style="color:#c0483a">nunca calibrou</span>';
      }
      const agora = Date.now();
      if (agora - _ccLastRender >= 1000) { _ccLastRender = agora; ccRender(); }
    }

    // Botão de snipe direto na tela de ataques a caminho. O Centro de Comando só monta na praça,
    // mas é AQUI que se vê o ataque e se decide snipar — obrigar a trocar de tela e reencontrar
    // a linha era pedir demais.
    function mountSnipeIncomings() {
      if (!config.cmd || !config.cmd.enabled) return;
      const tb = document.querySelector('#incomings_table');
      if (!tb || tb.getAttribute('data-cc-snipe')) return;
      tb.setAttribute('data-cc-snipe', '1');

      const linhas = [...tb.querySelectorAll('tr')].filter((t) => t.querySelector('a[href*="screen=info_command"]'));
      if (!linhas.length) return;
      const co = (s) => { const m = (s || '').match(/(\d{1,3})\|(\d{1,3})/); return m ? (m[1] + '|' + m[2]) : null; };
      const dados = linhas.map((tr) => {
        const td = [...tr.querySelectorAll('td')].map((x) => (x.textContent || '').replace(/\s+/g, ' ').trim());
        return { tr: tr, destino: co(td[1]), origem: co(td[2]), chega: ccParseChegada(td[5]), temMs: /:\d{3}\s*$/.test(td[5] || '') };
      }).filter((d) => d.chega);
      dados.sort((a, b) => a.chega - b.chega);

      // Cabeçalho da coluna nova
      const thRow = tb.querySelector('tr');
      if (thRow && thRow.querySelector('th')) {
        const th = document.createElement('th');
        th.textContent = 'Snipe';
        th.style.cssText = 'text-align:center';
        thRow.appendChild(th);
      }
      dados.forEach((d, i) => {
        const jan = ccJanelaSnipe(dados, i);
        const td = document.createElement('td');
        td.style.cssText = 'text-align:center;white-space:nowrap';
        const viavel = ccSnipeViavel(jan);
        const titulo = ccSnipeTitulo(jan);
        td.innerHTML = '<a href="#" style="font-weight:bold;color:' + (viavel ? '#2e6b2e' : '#a11') + '" title="' + esc(titulo) + '">🎯 snipe</a>';
        td.querySelector('a').addEventListener('click', (ev) => {
          ev.preventDefault();
          if (!viavel) { alert(ccSnipeTitulo(jan)); return; }
          // Guarda o pedido e manda pra praça, onde o Centro de Comando o consome.
          localStorage.setItem(KEY + '_snipe', JSON.stringify({
            destino: d.destino, chegaEm: jan.ate, base: jan.base, de: jan.de,
            largura: jan.largura, exato: jan.exato, at: Date.now(),
          }));
          location.href = '/game.php?screen=place&cc_snipe=1';
        });
        d.tr.appendChild(td);
      });
      pushLog('Snipe disponível em ' + dados.length + ' ataque(s) a caminho.', '', 'cmd');
    }

    // ---- Comandos agendados na lista "Próprios comandos" da aldeia ----
    // Injeta os comandos AINDA NÃO ENVIADOS desta aldeia na tabela de comandos do jogo,
    // ordenados pela chegada, pra você conferir que encaixam no timing dos comandos reais.

    // "hoje às HH:MM:SS:mmm" / "amanhã às ..." — mesmo formato da coluna "Chegada" do jogo,
    // pra nossa linha ficar visualmente igual às de verdade (a real usa exatamente essa forma,
    // conferido no HTML da própria tabela).
    function ccDataRel(ms) {
      const d = new Date(ms - wallToServerOffset());
      const agora = new Date(serverNow() - wallToServerOffset());
      const diffDias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
        new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())) / 86400000);
      const p = (n, w) => String(n).padStart(w || 2, '0');
      const prefixo = diffDias === 0 ? 'hoje' : diffDias === 1 ? 'amanhã'
        : p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
      return prefixo + ' às ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
        ':<span class="grey small">' + p(d.getMilliseconds(), 3) + '</span>';
    }
    // Só o DIA de um horário, e vazio quando é hoje. As colunas "sai"/"chegada" da Fila mostram
    // apenas o relógio (o milésimo importa, então o horário tem que caber) — num comando marcado
    // pra daqui dois dias isso vira "08:05:00.500" sem dizer de QUE dia, que é justamente quando
    // saber o dia mais importa. Vazio no caso comum (hoje) pra não poluir a coluna estreita.
    function ccDiaRel(ms) {
      if (!ms) return '';
      const d = new Date(ms - wallToServerOffset());
      const hoje = new Date(serverNow() - wallToServerOffset());
      const dias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
        new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86400000);
      if (dias === 0) return '';
      if (dias === 1) return 'amanhã';
      const p = (n) => String(n).padStart(2, '0');
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + (dias > 1 ? ' +' + dias + 'd' : '');
    }
    // Janelinha flutuante própria (troca o title/tooltip padrão do navegador, que só mostra
    // texto puro sem formatação) — mostra tropa com ícone+quantidade (mesmo bloco usado na
    // Fila) e o horário de saída, seguindo o mouse.
    function ccOvTipEl() {
      let el = document.getElementById('cc-ov-tip');
      if (!el) {
        el = document.createElement('div');
        el.id = 'cc-ov-tip';
        el.style.cssText = 'position:fixed;z-index:99999;display:none;background:#fdf6e8;' +
          'border:1px solid #c9a35a;border-radius:6px;padding:6px 8px;font-size:10px;color:#4a3d28;' +
          'box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none;max-width:260px;line-height:1.5';
        document.body.appendChild(el);
      }
      return el;
    }
    function ccOvTipMostrar(html, ev) {
      const el = ccOvTipEl();
      el.innerHTML = html;
      el.style.display = 'block';
      const pad = 14;
      el.style.left = (ev.clientX + pad) + 'px';
      el.style.top = (ev.clientY + pad) + 'px';
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth) el.style.left = Math.max(4, ev.clientX - r.width - pad) + 'px';
      if (r.bottom > window.innerHeight) el.style.top = Math.max(4, ev.clientY - r.height - pad) + 'px';
    }
    function ccOvTipEsconder() { const el = document.getElementById('cc-ov-tip'); if (el) el.style.display = 'none'; }
    let _ccOvTimer = null;
    function ccOverviewTabela() {
      // O jogo reusa o MESMO id #commands_outgoings pra duas tabelas diferentes:
      //   data-type="outgoing"       -> "Próprios comandos" da PRAÇA (nossos, saindo) — é esta.
      //   data-type="towards_village" -> no painel de QUALQUER aldeia (info_village), lista
      //                                  comandos de QUALQUER JOGADOR indo pra ELA.
      // Bug real: sem o filtro por data-type, fakes agendados apareciam na ficha de uma
      // bárbara sem relação nenhuma com o alvo, só porque o id batia. Por isso o data-type
      // é obrigatório, e o fallback só roda na tela da praça — nunca repete o erro por outro caminho.
      const cont = document.querySelector('#commands_outgoings[data-type="outgoing"]');
      if (cont) { const t = cont.querySelector('table'); if (t) return t; }
      let tb = document.querySelector('#commands_table');
      if (tb) return tb;
      if (telaAtual() !== 'place') return null;
      // Fallback: pela heading "Próprios comandos" ou por uma tabela com linhas de comando saindo.
      const heads = Array.prototype.slice.call(document.querySelectorAll('h4,th,caption,td,.vis'))
        .filter((e) => /pr[óo]prios comandos|own commands/i.test(e.textContent || ''));
      for (const h of heads) {
        const t = h.closest('table') || (h.parentElement && h.parentElement.querySelector('table'));
        if (t && t.querySelector('a[href*="screen=info_command"]')) return t;
      }
      const tabs = Array.prototype.slice.call(document.querySelectorAll('table'))
        .filter((t) => t.querySelector('a[href*="screen=info_command"]'));
      return tabs.find((t) => /ataque a|apoio a|retorno de/i.test(t.textContent || '')) || null;
    }
    function mountCmdOverview() {
      if (!config.cmd || !config.cmd.enabled) return;
      const tb = ccOverviewTabela();
      if (!tb) return;
      const body = tb.querySelector('tbody') || tb;
      body.querySelectorAll('tr[data-cc-ag]').forEach((el) => el.remove());
      const pend = (config.cmd.fila || []).filter((c) => String(c.origin) === String(CUR_VID) &&
        (c.state === 'novo' || c.state === 'preparado' || c.state === 'armado'));
      if (!pend.length) { if (_ccOvTimer) { clearInterval(_ccOvTimer); _ccOvTimer = null; } return; }
      const reais = Array.prototype.slice.call(body.querySelectorAll('tr'))
        .filter((t) => !t.hasAttribute('data-cc-ag') && t.querySelector('a[href*="screen=info_command"]'));
      // 3 é a estrutura real confirmada da tabela (Próprios comandos/Chegada/Chega em). Só
      // sobrescreve se achar uma linha REAL de comando pra amostrar — a linha de cabeçalho (só
      // <th>, sem <td>) não conta, senão dava nc=2 sempre que não houvesse comando manual ativo.
      const nc = reais.length ? Math.max(2, reais[0].querySelectorAll('td').length) : 3;
      const arrOf = (tr) => {
        // O jogo carrega a chegada em data-endtime (epoch em segundos) — mais confiável que o texto.
        const t = tr.querySelector('.widget-command-timer[data-endtime]');
        if (t) return (+t.getAttribute('data-endtime')) * 1000;
        for (const td of tr.querySelectorAll('td')) { const ms = ccParseChegada(td.textContent || ''); if (ms) return ms; }
        return null;
      };
      pend.sort((a, b) => a.arriveAt - b.arriveAt).forEach((c) => {
        const nome = ccNomeAlvo(c.x + '|' + c.y);
        const rot = { support: 'Apoio', fake: 'Fake', nobre: 'Nobre' }[c.tipo] || 'Ataque';
        const est = ccEstimaDeComando(c);
        const saiEm = c.sendAt ? c.sendAt : (est != null ? c.arriveAt - est : null);
        const tr = document.createElement('tr');
        tr.className = 'command-row';
        tr.setAttribute('data-cc-ag', '1');
        tr.style.background = 'rgba(154,111,14,.12)';
        const tipHtml = '<div style="font-weight:600;margin-bottom:3px;color:#8b5426">' + esc(rot) + ' agendado</div>' +
          '<div>' + (ccTropaResumo(c.amounts) || '<span style="color:#a8564a">sem tropa</span>') + '</div>' +
          '<div style="color:#6f6153;margin-top:3px">saída: <b>' + (saiEm ? srvClockMs(saiEm) : '—') +
            (saiEm && ccDiaRel(saiEm) ? ' <span style="color:#a8564a">(' + ccDiaRel(saiEm) + ')</span>' : '') + '</b></div>';
        // Mesma estrutura de classes da linha REAL (quickedit-content/icon-container/quickedit-
        // label) — herda o visual do jogo automaticamente. Só o ícone (🕒 no lugar do ícone de
        // unidade) e o fundo levemente destacado diferenciam "isto ainda não foi enviado".
        if (nc === 3) {
          tr.innerHTML =
            '<td style="white-space:nowrap">' +
              '<span class="quickedit-content">' +
                '<span class="icon-container"><span class="cc-ov-hover" style="cursor:default;font-size:12px">🕒</span></span>' +
                // O negrito+marrom (#603000) do jogo só é aplicado quando o .quickedit-label está
                // dentro de .quickedit-out + <a> (confirmado ao vivo, comparando com/sem o
                // wrapper) — como não existe link de verdade pra apontar, replica a cor/peso
                // direto aqui em vez de montar um <a> morto só pra herdar o estilo.
                '<span class="quickedit-label" style="color:#603000;font-weight:700">' + esc(rot) + ' agendado → ' + esc(c.x + '|' + c.y) + (nome ? ' ' + esc(nome) : '') + '</span>' +
              '</span>' +
            '</td>' +
            '<td>' + ccDataRel(c.arriveAt) + '</td>' +
            '<td><span class="cc-ov-falta" data-arr="' + c.arriveAt + '"></span>' +
              ' <a href="#" class="cc-ov-x" data-id="' + c.id + '" title="cancelar comando agendado" style="color:#c0483a;font-weight:bold;text-decoration:none">✕</a></td>';
        } else {
          // Fallback pra tabela com número de colunas diferente do esperado (ex.: #commands_table).
          let html = '';
          for (let i = 0; i < nc; i++) html += '<td style="padding:4px 6px;white-space:nowrap;color:#a2643a">' +
            (i === 0
              ? '🕒 <b>' + esc(rot) + ' agendado</b> → ' + esc(c.x + '|' + c.y) + (nome ? ' ' + esc(nome) : '')
              : i === nc - 2 ? srvClockMs(c.arriveAt)
              : i === nc - 1 ? '<span class="cc-ov-falta" data-arr="' + c.arriveAt + '"></span>' +
                  '<a href="#" class="cc-ov-x" data-id="' + c.id + '" title="cancelar comando agendado" style="color:#c0483a;font-weight:bold;margin-left:8px;text-decoration:none">✕</a>'
              : '') + '</td>';
          tr.innerHTML = html;
        }
        tr.addEventListener('mouseenter', (ev) => ccOvTipMostrar(tipHtml, ev));
        tr.addEventListener('mousemove', (ev) => ccOvTipMostrar(tipHtml, ev));
        tr.addEventListener('mouseleave', ccOvTipEsconder);
        let ref = null;
        for (const r of reais) { const a = arrOf(r); if (a && a > c.arriveAt) { ref = r; break; } }
        if (ref) body.insertBefore(tr, ref);
        else if (reais.length && reais[reais.length - 1].nextSibling) body.insertBefore(tr, reais[reais.length - 1].nextSibling);
        else body.appendChild(tr);
      });
      body.querySelectorAll('.cc-ov-x').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault();
        const c = (config.cmd.fila || []).find((z) => z.id === el.getAttribute('data-id'));
        cmdAbortar(el.getAttribute('data-id'));
        if (c) pushLog('🕒 Central: ' + (c.tipo === 'support' ? 'apoio' : 'ataque') + ' agendado → ' + c.x + '|' + c.y + ' cancelado.', '', 'cmd');
        ccOvTipEsconder();
        mountCmdOverview();
      });
      const tick = () => {
        const now = serverNow();
        document.querySelectorAll('.cc-ov-falta').forEach((el) => { const a = +el.getAttribute('data-arr'); el.textContent = a ? fmt(a - now) : ''; });
        // Se o jogo re-renderizou a tabela e apagou as nossas linhas, re-injeta.
        if (!document.querySelector('tr[data-cc-ag]')) { clearInterval(_ccOvTimer); _ccOvTimer = null; mountCmdOverview(); }
      };
      tick();
      if (_ccOvTimer) clearInterval(_ccOvTimer);
      _ccOvTimer = setInterval(tick, 1000);
    }

    // ---- Agendados na ficha da aldeia (info_village) ----
    // A ficha de uma aldeia INIMIGA nunca mostra ataque a caminho de verdade (essa informação
    // só é visível pro dono) — então quem monta uma Operação com várias ondas pro mesmo alvo
    // não tinha como conferir a fila que já agendou, só a Fila lá na Central. Isto injeta os
    // NOSSOS comandos pendentes (config.cmd.fila) que apontam pra essa coordenada, direto na
    // ficha, ordenados por chegada — igual ao mountCmdOverview faz na praça, só que por DESTINO
    // em vez de por ORIGEM.
    async function mountCmdDestino() {
      if (!config.cmd || !config.cmd.enabled) return;
      if (telaAtual() !== 'info_village') return;
      const old = document.getElementById('cc-destino-box'); if (old) old.remove();
      const coordEl = Array.prototype.slice.call(document.querySelectorAll('#content_value td'))
        .find((td) => /^\d{1,3}\|\d{1,3}$/.test((td.textContent || '').trim()));
      const coord = coordEl ? coordEl.textContent.trim() : null;
      if (!coord) return;
      const pend = cmdFila().filter((c) => (c.x + '|' + c.y) === coord &&
        (c.state === 'novo' || c.state === 'preparado' || c.state === 'armado'));
      if (!pend.length) return;
      pend.sort((a, b) => a.arriveAt - b.arriveAt);
      let vilas = [];
      try { vilas = await getAllVillagesCached(); } catch (e) { /* segue sem nome de origem */ }
      const h2 = document.querySelector('#content_value h2');
      if (!h2) return;
      const box = document.createElement('table');
      box.id = 'cc-destino-box'; box.className = 'vis'; box.style.marginBottom = '10px';
      box.innerHTML = '<tr><th colspan="4">🕒 Agendados na Central (' + pend.length + ')</th></tr>' +
        '<tr style="font-size:11px;color:#7d7259"><td>tipo</td><td>origem</td><td>chega</td><td>sai / cancelar</td></tr>' +
        pend.map((c) => {
          const vo = vilas.find((z) => String(z.vid) === String(c.origin));
          const origemTxt = vo ? (vo.name || vo.coord || vo.vid) : c.origin;
          const rot = { support: 'Apoio', fake: 'Fake', nobre: 'Nobre' }[c.tipo] || 'Ataque';
          const est = ccEstimaDeComando(c);
          const saiEm = c.sendAt ? c.sendAt : (est != null ? c.arriveAt - est : null);
          return '<tr>' +
            '<td>' + esc(rot) + '</td>' +
            '<td>' + esc(origemTxt) + '</td>' +
            '<td>' + srvClockMs(c.arriveAt) + (ccDiaRel(c.arriveAt) ? ' <span style="color:#a8564a;font-size:10px">' + ccDiaRel(c.arriveAt) + '</span>' : '') + '</td>' +
            '<td>' + (saiEm ? 'sai ' + srvClockMs(saiEm) + (ccDiaRel(saiEm) ? ' <span style="color:#a8564a;font-size:10px">' + ccDiaRel(saiEm) + '</span>' : '') : '—') +
              ' <a href="#" class="cc-dest-x" data-id="' + c.id + '" title="cancelar comando agendado" style="color:#c0483a;font-weight:bold;margin-left:8px;text-decoration:none">✕</a></td>' +
          '</tr>';
        }).join('');
      h2.insertAdjacentElement('afterend', box);
      box.querySelectorAll('.cc-dest-x').forEach((el) => el.onclick = (ev) => {
        ev.preventDefault();
        const id = el.getAttribute('data-id');
        const c = cmdFila().find((z) => z.id === id);
        cmdAbortar(id);
        if (c) pushLog('🕒 Central: agendado → ' + c.x + '|' + c.y + ' cancelado (via ficha da aldeia).', '', 'cmd');
        mountCmdDestino().catch(() => {});
      });
    }

    // Unidades que defendem. Usadas pra sugerir de onde mandar o snipe.
    const CC_DEF = ['spear', 'sword', 'heavy', 'archer'];
    // Valores de defesa do TW por unidade (geral/cavalaria/arqueiro). Serve pra ordenar os
    // candidatos por quanto realmente seguram, e não por número bruto de tropa.
    const CC_DEF_VAL = { spear: 15, sword: 25, heavy: 200, archer: 50 };
    function ccPoderDef(avail) {
      let p = 0;
      CC_DEF.forEach((u) => { p += (avail[u] || 0) * (CC_DEF_VAL[u] || 0); });
      return p;
    }
    // Quem consegue pousar DENTRO da janela, com a tropa que tem.
    function ccSnipeCandidatos(destino, chegaEm, ate) {
      const m = destino.match(/(\d+)\|(\d+)/); if (!m) return [];
      const tx = +m[1], ty = +m[2], agora = srvNowP();
      return CCVILAS.map((v) => {
        const comp = {};
        CC_DEF.forEach((u) => { if ((v.avail[u] || 0) > 0) comp[u] = v.avail[u]; });
        if (!Object.keys(comp).length) return null;
        const t = (v.x != null) ? ccTempoViagemMs(v.x, v.y, tx, ty, comp) : null;
        if (t == null) return null;
        const sai = chegaEm - t;
        // Precisa dar tempo de sair E a chegada tem que caber na janela.
        const viavel = (sai > agora + 5000) && (ate == null || chegaEm <= ate);
        return { v: v, comp: comp, t: t, sai: sai, viavel: viavel, poder: ccPoderDef(v.avail), folga: sai - agora };
      }).filter(Boolean).sort((a, b) => (b.viavel - a.viavel) || (b.poder - a.poder));
    }
    function ccSnipeModal(p) {
      const velho = document.getElementById('cc-snipe-modal'); if (velho) velho.remove();
      const cands = ccSnipeCandidatos(p.destino, p.chegaEm, p.ate);
      const viaveis = cands.filter((c) => c.viavel);
      const rot = {}; UNITS.forEach(([u, n]) => { rot[u] = n; });

      const ov = document.createElement('div');
      ov.id = 'cc-snipe-modal';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99999;display:flex;' +
                         'align-items:center;justify-content:center';
      ov.innerHTML =
        '<div style="background:linear-gradient(180deg,#fdfaf5,#fffdfa);border:1px solid #e0d6c6;border-radius:10px;' +
             'padding:12px;width:min(680px,94vw);max-height:86vh;overflow:auto;color:#8b5426;font-size:11px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<b style="color:#a2643a;font-size:13px">🎯 Snipe em ' + esc(p.destino || '?') + '</b>' +
            '<a id="cc-sn-x" style="cursor:pointer;color:#c0483a;font-size:14px">✕</a>' +
          '</div>' +
          '<div style="font-size:10px;color:#6f6153;margin-bottom:4px">' +
            'O ataque pousa às <b style="color:#c2593a">' + srvClockMs(p.base) + '</b> · ' +
            'o apoio chega às <b style="color:#2e7d3a">' + srvClockMs(p.chegaEm) + '</b>' +
            ' (<b>' + ccFolgaSnipe() + 'ms antes</b>)' +
            (p.largura != null ? ' · janela de <b>' + p.largura + 'ms</b> desde a onda anterior' : ' · sem onda anterior conhecida') +
            (p.exato ? '' : ' · <b style="color:#a2643a">chegada sem milésimos: 1s de incerteza</b>') +
          '</div>' +
          // A margem precisa ser maior que o erro de disparo: se o apoio atrasar mais que ela,
          // pousa DEPOIS do ataque e não serve pra nada.
          '<div style="font-size:10px;margin-bottom:8px">' +
            'chegar <input id="cc-sn-folga" class="twmgr-inp" type="number" min="0" step="50" ' +
              'value="' + ccFolgaSnipe() + '" style="width:66px;font-size:10px;padding:1px">ms antes do ataque ' +
            '<span id="cc-sn-folga-av"></span>' +
          '</div>' +
          (viaveis.length
            ? '<div style="display:grid;grid-template-columns:20px 96px 1fr 74px 70px;gap:6px;font-size:9px;color:#8a7d6d;padding:0 4px 3px">' +
                '<span></span><span>aldeia</span><span>tropas de defesa</span><span>sai às</span><span>folga</span></div>'
            : '') +
          '<div id="cc-sn-lista"></div>' +
          '<div id="cc-sn-msg" style="font-size:10px;margin:6px 0;min-height:12px"></div>' +
          '<div style="display:flex;gap:6px">' +
            '<button id="cc-sn-armar" class="twmgr-btn twmgr-go" style="flex:1">▶ Armar apoio das marcadas</button>' +
            '<button id="cc-sn-praca" class="twmgr-btn twmgr-ghost">só preencher no painel</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);

      const lista = ov.querySelector('#cc-sn-lista');
      lista.innerHTML = cands.length ? cands.slice(0, 25).map((c, i) =>
        '<label style="display:grid;grid-template-columns:20px 96px 1fr 74px 70px;gap:6px;align-items:center;' +
        'padding:3px 4px;border-bottom:1px solid rgba(0,0,0,.07);' + (c.viavel ? '' : 'opacity:.45;') + '">' +
          '<input type="checkbox" data-sn="' + i + '"' + (c.viavel && i === 0 ? ' checked' : '') + (c.viavel ? '' : ' disabled') + '>' +
          '<span style="color:#a2643a">' + esc(c.v.coord) + '</span>' +
          '<span style="color:#6f6153;font-size:10px">' +
            CC_DEF.filter((u) => c.comp[u]).map((u) => esc(rot[u] || u) + ' ' + fmtN(c.comp[u])).join(' · ') + '</span>' +
          '<span style="color:' + (c.viavel ? '#2e7d3a' : '#c0483a') + '">' + srvClockMs(c.sai) + '</span>' +
          '<span style="color:#8a7d6d">' + (c.folga > 0 ? fmt(c.folga) : 'tarde') + '</span>' +
        '</label>').join('')
        : '<div style="color:#c0483a;padding:8px;font-size:10px">Nenhuma aldeia sua tem tropa de defesa para este alvo.</div>';

      const msg = ov.querySelector('#cc-sn-msg');
      if (!viaveis.length && cands.length) {
        msg.style.color = '#c0483a';
        msg.textContent = 'Nenhuma aldeia chega a tempo: a mais rápida sairia ' + fmt(Math.abs(cands[0].folga)) + ' atrás.';
      }
      // Aviso vivo: margem menor que o erro de disparo é o cenário em que o snipe morre no ataque.
      const folgaEl = ov.querySelector('#cc-sn-folga'), folgaAv = ov.querySelector('#cc-sn-folga-av');
      const attFolga = () => {
        const e = erroEstimadoMs(), f = parseInt(folgaEl.value, 10) || 0;
        if (f < e) {
          folgaAv.innerHTML = '<b style="color:#c0483a">⚠ menor que o erro medido (±' + e + 'ms) — o apoio pode chegar DEPOIS do ataque e não segurar nada</b>';
        } else if (p.largura != null && f > p.largura) {
          folgaAv.innerHTML = '<b style="color:#c0483a">⚠ maior que a janela (' + p.largura + 'ms) — cairia antes da onda anterior e morreria nela</b>';
        } else {
          folgaAv.innerHTML = '<span style="color:#2e7d3a">✓ acima do erro medido (±' + e + 'ms)</span>';
        }
      };
      folgaEl.addEventListener('change', () => {
        config.cmd.snipeFolgaMs = Math.max(0, parseInt(folgaEl.value, 10) || 0); save();
        // A margem desloca a chegada — redesenha o popup inteiro pra os candidatos e os
        // horários refletirem o novo valor, em vez de mostrar número desatualizado.
        if (p.base != null) { ov.remove(); ccSnipeModal(Object.assign({}, p, { chegaEm: p.base - ccFolgaSnipe() })); }
      });
      folgaEl.addEventListener('input', attFolga);
      attFolga();
      ov.querySelector('#cc-sn-x').onclick = () => ov.remove();
      ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
      ov.querySelector('#cc-sn-praca').onclick = () => { ccPreencherSnipe(p); ov.remove(); };
      ov.querySelector('#cc-sn-armar').onclick = () => {
        const marcadas = [...lista.querySelectorAll('[data-sn]')].filter((e) => e.checked).map((e) => cands[+e.getAttribute('data-sn')]);
        if (!marcadas.length) { msg.style.color = '#c0483a'; msg.textContent = 'Marque ao menos uma aldeia.'; return; }
        if (!config.cmd.suporteOkAt) { msg.style.color = '#c0483a'; msg.textContent = 'O apoio ainda não foi verificado neste mundo — abra a praça de reunião uma vez.'; return; }
        const al = p.destino.split('|');
        let n = 0;
        marcadas.forEach((c) => { cmdAdicionar('support', al[0], al[1], c.comp, p.chegaEm, c.v.vid); n++; });
        save(); ccRender();
        msg.style.color = '#2e7d3a';
        msg.textContent = n + ' apoio(s) armado(s) chegando ' + srvClockMs(p.chegaEm) + '.';
        setTimeout(() => ov.remove(), 1800);
      };
    }
    function ccPreencherSnipe(p) {
      config.cmd.tipo = 'support'; save();
      const al = document.getElementById('cc-alvo');
      if (al && p.destino) al.value = p.destino;
      ccSetChegada(p.chegaEm);
      if (typeof _ccAttTipo === 'function') _ccAttTipo();
    }

    // Consome o pedido deixado pela tela de ataques.
    function ccConsumirSnipe() {
      let p = null;
      try { p = JSON.parse(localStorage.getItem(KEY + '_snipe') || 'null'); } catch (e) {}
      if (!p || (Date.now() - (p.at || 0)) > 120000) return;   // pedido velho: ignora
      localStorage.removeItem(KEY + '_snipe');
      ccPreencherSnipe(p);
      // O modal precisa das aldeias carregadas pra sugerir de onde mandar.
      const abrir = () => { if (CCVILAS.length) ccSnipeModal(p); else setTimeout(abrir, 500); };
      setTimeout(abrir, 300);
    }
