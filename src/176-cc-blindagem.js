  // ==================== CENTRO DE COMANDO — ABA BLINDAGEM (ccBlz*) — le o topico da tribo e divide os pedidos ====================
  // Parte da ILHA do Centro de Comando. A ilha e UMA IIFE aninhada que ABRE em
  // 171-cc-nucleo.js e FECHA em 177-cc-painel.js: nenhum arquivo do meio abre ou fecha chave
  // de IIFE. Todos partilham o mesmo escopo lexico, entao uma funcao daqui enxerga as dos
  // outros naturalmente — funcoes sao icadas, e os const/let de topo vivem no nucleo, que vem
  // primeiro justamente por isso.
  //
  // Cortado de 175-cc-rico.js (5297 linhas numa ilha so) na v11.224.0. O corte foi por NOME de
  // funcao, nao por comentario de secao: era comum uma funcao de uma aba morar fisicamente
  // dentro do bloco de outra (ccMassaEnviar vivia dentro da secao da Blindagem), que e
  // exatamente como "mexer numa aba quebrava a outra".
    // Datas do fórum: "hoje às 14:04", "ontem às 23:03", "em 07.08.2026 às 15:16" e a variante
    // sem ano "em 07.08. às 15:16". Devolve ms, ou 0 quando não reconhece — 0 nunca é tratado
    // como "recente", então a dúvida sempre cai pro lado seguro.
    function ccBlzData(txt) {
      const t = (txt || '').replace(/\s+/g, ' ').trim();
      const hm = t.match(/(\d{1,2}):(\d{2})/);
      if (!hm) return 0;
      const h = +hm[1], mi = +hm[2];
      const dm = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?/);
      const d = new Date();
      if (dm) {
        d.setFullYear(dm[3] ? +dm[3] : d.getFullYear(), (+dm[2]) - 1, +dm[1]);
      } else if (/\bontem\b/i.test(t)) {
        d.setDate(d.getDate() - 1);
      } else if (!/\bhoje\b/i.test(t)) {
        return 0;                                        // formato desconhecido: não arrisca
      }
      d.setHours(h, mi, 0, 0);
      return d.getTime();
    }
    // Número de uma célula da tabela. Vazio, `✅` ou qualquer coisa sem dígito = 0.
    function ccBlzNum(td) {
      if (!td) return 0;
      const s = (td.textContent || '').replace(/\D/g, '');
      return s ? parseInt(s, 10) : 0;
    }
    // Linha de entrega: `num/lanc/esp/0/cp/0`. Tolera linha curta — no tópico real apareceu
    // `14/1000/0/0/0` com 5 campos em vez de 6. Posição manda: nunca "compacta" os zeros, senão
    // um 0 a menos faria a cavalaria virar espadachim.
    function ccBlzLinha(txt) {
      const m = (txt || '').trim().match(/^(\d{1,3})((?:\s*\/\s*\d+){2,6})\s*$/);
      if (!m) return null;
      // m[2] começa com a barra, então o split deixa um vazio na frente — o slice(1) tira. Sem
      // ele TUDO anda uma casa e o lanceiro viraria zero.
      const n = m[2].split('/').slice(1).map((s) => parseInt(s.trim(), 10) || 0);
      return { num: +m[1], spear: n[0] || 0, sword: n[1] || 0, heavy: n[3] || 0 };
    }
    function ccBlzParse(doc) {
      const posts = [].slice.call(doc.querySelectorAll('div.post'));
      if (!posts.length) throw new Error('não achei nenhum post — a URL aponta pro tópico certo?');
      // A tabela mora no PRIMEIRO post que tenha uma com ícone de unidade no cabeçalho. Procurar
      // por ícone (e não pela posição) aguenta a tribo fixar outro post no topo.
      let tabela = null, postTabela = null;
      for (const p of posts) {
        const t = [].slice.call(p.querySelectorAll('table'))
          .find((x) => x.querySelector('tr img[src*="unit_"]') && !x.querySelector('table'));
        if (t) { tabela = t; postTabela = p; break; }
      }
      if (!tabela) throw new Error('não achei a tabela de pedidos (nenhuma com ícone de unidade)');
      const linhas = [].slice.call(tabela.querySelectorAll('tr'));
      const cab = [].slice.call(linhas[0].children);
      const col = {};
      cab.forEach((c, i) => {
        const im = c.querySelector('img');
        const u = im && ((im.getAttribute('src') || '').match(/unit_([a-z]+)\./) || [])[1];
        if (u && BLZ_UNITS.indexOf(u) >= 0 && col[u] == null) col[u] = i;
      });
      if (col.spear == null) throw new Error('a tabela não tem coluna de lanceiro');
      const pedidos = [];
      linhas.slice(1).forEach((tr) => {
        const tds = [].slice.call(tr.children);
        if (tds.length < 2) return;
        const num = parseInt((tds[0].textContent || '').replace(/\D/g, ''), 10);
        if (!num) return;
        const m = (tds[1].textContent || '').replace(/\s+/g, ' ').match(/^(.*?)\((\d{1,3})\|(\d{1,3})\)/);
        if (!m) return;
        const pede = {};
        BLZ_UNITS.forEach((u) => { pede[u] = col[u] != null ? ccBlzNum(tds[col[u]]) : 0; });
        pedidos.push({ num: num, nome: m[1].trim(), coord: m[2] + '|' + m[3],
                       x: +m[2], y: +m[3], pede: pede });
      });
      // Quando a tabela foi editada pela última vez. Sem rodapé de edição vale a data do post.
      const rodape = (postTabela.innerText || '').split('\n').filter((l) => /Editado/i.test(l))[0];
      const cabTab = (postTabela.querySelector('.postheader_left') || {}).innerText || '';
      const editadoEm = ccBlzData(rodape) || ccBlzData(cabTab);
      // Entregas: todo post que NÃO é o da tabela, uma linha por pedido atendido.
      const entregas = [];
      posts.forEach((p) => {
        if (p === postTabela) return;
        const hdr = (p.querySelector('.postheader_left') || {}).innerText || '';
        const at = ccBlzData(hdr);
        const autor = (hdr.replace(/\s+/g, ' ').match(/^(.*?)\s+(?:em|hoje|ontem)\b/) || [])[1] || '?';
        (p.innerText || '').split('\n').forEach((l) => {
          const e = ccBlzLinha(l);
          if (!e) return;
          e.autor = autor.trim(); e.at = at;
          // A regra combinada: só conta quem postou DEPOIS da última edição da tabela.
          e.posEdicao = !!(at && editadoEm && at >= editadoEm);
          entregas.push(e);
        });
      });
      return { pedidos: pedidos, entregas: entregas, editadoEm: editadoEm };
    }
    async function ccBlzBuscar() {
      const b = config.cmd.blz;
      const url = ((document.getElementById('cc-blz-url') || {}).value || '').trim();
      if (!url) throw new Error('cole a URL do tópico da tribo');
      b.url = url;
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const r = ccBlzParse(doc);
      b.pedidos = r.pedidos; b.entregas = r.entregas; b.editadoEm = r.editadoEm;
      b.lidoEm = Date.now();
      // Pedido que sumiu da tabela leva junto o plano e a trava dele: manter viraria envio pra
      // um número que hoje é outra aldeia — exatamente o problema da renumeração.
      const vivos = {}; r.pedidos.forEach((p) => { vivos[p.num] = 1; });
      Object.keys(b.plano).forEach((k) => { if (!vivos[k]) delete b.plano[k]; });
      Object.keys(b.enviados).forEach((k) => { if (!vivos[k]) delete b.enviados[k]; });
      // Pedido que sumiu sai da seleção; pedido NOVO entra marcado, pra a tabela recém-buscada
      // já vir pronta pra dividir em vez de exigir 8 cliques antes de qualquer coisa acontecer.
      b.alvosSel = b.alvosSel || {};
      Object.keys(b.alvosSel).forEach((k) => { if (!vivos[k]) delete b.alvosSel[k]; });
      r.pedidos.forEach((p) => { if (b.alvosSel[p.num] === undefined) b.alvosSel[p.num] = true; });
      save();
      return r;
    }
    // Quanto ainda falta em cada pedido: o pedido menos o que a tribo já entregou (só as entregas
    // válidas) menos o que ESTE módulo já mandou nesta rodada.
    function ccBlzEntregue(num) {
      const b = config.cmd.blz;
      const t = { spear: 0, sword: 0, heavy: 0 };
      b.entregas.forEach((e) => {
        if (e.num !== num || !e.posEdicao) return;
        BLZ_UNITS.forEach((u) => { t[u] += e[u] || 0; });
      });
      return t;
    }
    function ccBlzFalta(p) {
      const ent = ccBlzEntregue(p.num);
      const meu = ccBlzMeuTotal(p.num);
      const f = {};
      BLZ_UNITS.forEach((u) => { f[u] = Math.max(0, (p.pede[u] || 0) - (ent[u] || 0) - (meu[u] || 0)); });
      return f;
    }
    // O que EU já aloquei pra este pedido (soma do plano em todas as minhas aldeias).
    function ccBlzMeuTotal(num) {
      const linha = (config.cmd.blz.plano || {})[num] || {};
      const t = { spear: 0, sword: 0, heavy: 0 };
      Object.keys(linha).forEach((vid) => {
        BLZ_UNITS.forEach((u) => { t[u] += (linha[vid] || {})[u] || 0; });
      });
      return t;
    }
    // Quanto sobra numa aldeia depois da reserva de casa e do que o plano já comprometeu nela.
    //
    // O estoque vem de `v.avail`, que SEGUE o seletor de fonte da lista de Origens: com "na
    // aldeia agora" é só o que está parado aqui; com "suas próprias" entra também o que está
    // fora apoiando e o que está voltando. Quem manda é a escolha do usuário.
    //
    // Vale saber o que cada uma significa na hora de enviar: em "suas próprias" a divisão conta
    // tropa que ainda não chegou, então o envio daquela linha vai sair menor (ou falhar) até ela
    // pousar em casa. É útil pra montar o plano agora e disparar quando a tropa voltar; não é
    // útil pra mandar tudo de uma vez.
    function ccBlzLivre(v) {
      const b = config.cmd.blz;
      const usado = { spear: 0, sword: 0, heavy: 0 };
      Object.keys(b.plano).forEach((num) => {
        const q = (b.plano[num] || {})[v.vid]; if (!q) return;
        BLZ_UNITS.forEach((u) => { usado[u] += q[u] || 0; });
      });
      const estoque = v.avail || {};
      const livre = {};
      BLZ_UNITS.forEach((u) => {
        livre[u] = Math.max(0, (estoque[u] || 0) - (b.reserva[u] || 0) - usado[u]);
      });
      return livre;
    }
    // Orçamento de UMA aldeia pra rodada inteira: o teto que o usuário definiu em "por aldeia",
    // limitado ao que ela realmente tem livre. Campo vazio = sem teto, entra o disponível todo
    // (que é como era antes desta opção existir).
    //
    // SÓ NÚMERO ABSOLUTO. A porcentagem existiu na v11.138.0 e saiu: com a fonte de tropa e a
    // reserva no meio, "50%" tinha três bases plausíveis (estoque, livre, ou o que falta) e o
    // resultado não batia com o que o usuário esperava. Número resolve o mesmo caso sem ambiguidade.
    function ccBlzOrcamento(v) {
      const b = config.cmd.blz, spec = b.porAldeia || {}, livre = ccBlzLivre(v);
      // O que o plano JÁ tirou desta aldeia. O teto é da rodada inteira, então precisa descontar
      // isso — senão ele se renovaria a cada passada e "50 lanceiros" viraria 50 por passada.
      const usado = { spear: 0, sword: 0, heavy: 0 };
      Object.keys(b.plano || {}).forEach((num) => {
        const q = (b.plano[num] || {})[v.vid]; if (!q) return;
        BLZ_UNITS.forEach((u) => { usado[u] += q[u] || 0; });
      });
      const out = {};
      BLZ_UNITS.forEach((u) => {
        const q = parseInt(String(spec[u] == null ? '' : spec[u]).replace(/\D/g, ''), 10);
        const teto = (q > 0) ? q : Infinity;   // vazio, zero ou lixo = sem teto
        const resta = (teto === Infinity) ? Infinity : Math.max(0, teto - usado[u]);
        out[u] = Math.max(0, Math.min(resta, livre[u] || 0));
      });
      return out;
    }
    // Pedidos que entram na divisão. Nenhum marcado = todos (senão o primeiro uso da tela, com a
    // seleção vazia, não distribuiria nada e pareceria quebrado).
    function ccBlzPedidosAtivos() {
      const b = config.cmd.blz, sel = b.alvosSel || {};
      return (b.pedidos || []).filter((p) => sel[p.num]);
    }
    // ---- A sugestão ----
    // Guloso por DISTÂNCIA: percorre todos os pares (aldeia, pedido) do mais perto pro mais longe
    // e vai preenchendo. Defesa que chega tarde não defende, então proximidade é o critério que
    // importa — e o guloso por distância dá, pra cada aldeia, o pedido mais perto que ainda
    // precisa dela. Não mexe no que você já editou à mão: só soma em cima do que falta.
    function ccBlzSugerir() {
      const b = config.cmd.blz;
      const marcadas = CCVILAS.filter((v) => config.cmd.origens[v.vid] && v.x != null);
      if (!marcadas.length) return { erro: 'marque as origens na lista de Origens, abaixo' };
      if (!b.pedidos.length) return { erro: 'busque a tabela do tópico primeiro' };
      const dist = (v, p) => Math.sqrt(Math.pow(v.x - p.x, 2) + Math.pow(v.y - p.y, 2));
      const por = (par) => {
        b.plano[par.p.num] = b.plano[par.p.num] || {};
        const atual = b.plano[par.p.num][par.v.vid] || {};
        BLZ_UNITS.forEach((u) => { if (par.q[u]) atual[u] = (atual[u] || 0) + par.q[u]; });
        b.plano[par.p.num][par.v.vid] = atual;
      };
      let alocado = 0;
      // ---- Passada 1: PROPORCIONAL ----
      // O guloso puro (só distância) despejava a aldeia inteira no pedido mais perto e deixava os
      // outros zerados — a tribo recebia tudo num lugar só. Aqui cada aldeia reparte o que tem
      // entre TODOS os pedidos, na proporção do que cada um ainda precisa: pedido que falta o
      // dobro recebe o dobro. As proporções são calculadas UMA vez, sobre a foto inicial, senão
      // cada alocação mexeria no denominador e a divisão deixaria de ser proporcional.
      const ativos = ccBlzPedidosAtivos();
      if (!ativos.length) return { erro: 'nenhum pedido selecionado' };
      const falta0 = {}; const totalFalta = { spear: 0, sword: 0, heavy: 0 };
      ativos.forEach((p) => {
        falta0[p.num] = ccBlzFalta(p);
        BLZ_UNITS.forEach((u) => { totalFalta[u] += falta0[p.num][u] || 0; });
      });
      marcadas.forEach((v) => {
        // `orc0` é o teto DA RODADA pra esta aldeia (o "por aldeia"); `usadoV` é o que ela já
        // cedeu nesta passada. Sem esse par, o teto valeria por pedido em vez de por aldeia — uma
        // aldeia com "50 lanceiros" mandaria 50 pra cada um dos 8 pedidos.
        const orc0 = ccBlzOrcamento(v);
        const usadoV = { spear: 0, sword: 0, heavy: 0 };
        ativos.forEach((p) => {
          const q = {}; let soma = 0;
          const livreAgora = ccBlzLivre(v);        // desce a cada alocação desta mesma aldeia
          BLZ_UNITS.forEach((u) => {
            if (!totalFalta[u]) return;
            const cota = Math.floor((orc0[u] || 0) * (falta0[p.num][u] || 0) / totalFalta[u]);
            // O `ccBlzFalta` aqui é o TETO DO PEDIDO: nunca sai mais do que ainda falta nele.
            const n = Math.min(cota, ccBlzFalta(p)[u] || 0, livreAgora[u] || 0,
                               Math.max(0, (orc0[u] || 0) - usadoV[u]));
            if (n > 0) { q[u] = n; soma += n; usadoV[u] += n; }
          });
          if (!soma) return;
          por({ v: v, p: p, q: q }); alocado += soma;
        });
      });
      // ---- Passada 2: SOBRA ----
      // O piso da divisão e os pedidos que ficaram menores que a cota deixam resto. Ele vai pelo
      // guloso de distância — aqui concentrar não é problema, é o que sobrou.
      const pares = [];
      marcadas.forEach((v) => ativos.forEach((p) => pares.push({ v: v, p: p, d: dist(v, p) })));
      pares.sort((a, c) => a.d - c.d);
      pares.forEach((par) => {
        const falta = ccBlzFalta(par.p), livre = ccBlzLivre(par.v);
        // O teto "por aldeia" vale aqui também: ccBlzOrcamento já desconta o que o plano
        // comprometeu (via ccBlzLivre), então o que sobra dele é o resto do orçamento.
        const orc = ccBlzOrcamento(par.v);
        const q = {}; let soma = 0;
        BLZ_UNITS.forEach((u) => {
          const n = Math.min(falta[u] || 0, livre[u] || 0, orc[u] || 0);
          if (n > 0) { q[u] = n; soma += n; }
        });
        if (!soma) return;
        par.q = q; por(par); alocado += soma;
      });
      save();
      // Espalhar tem um preço: cada par (aldeia, pedido) vira UM comando de apoio. Com muitas
      // origens marcadas isso vira dezenas de envios, e é melhor você saber disso antes de clicar
      // em Enviar do que descobrir no meio.
      let envios = 0;
      Object.keys(b.plano).forEach((n) => { envios += Object.keys(b.plano[n] || {}).length; });
      return { alocado: alocado, envios: envios };
    }
    // O texto do fórum. Uma linha por pedido, agregando todas as MINHAS aldeias — a tribo quer
    // saber quanto chegou, não de onde saiu. Os dois zeros fixos são as colunas ❌ da tabela.
    function ccBlzTexto(soEnviados) {
      const b = config.cmd.blz;
      const linhas = [];
      b.pedidos.forEach((p) => {
        const linha = (b.plano || {})[p.num] || {};
        const t = { spear: 0, sword: 0, heavy: 0 };
        Object.keys(linha).forEach((vid) => {
          if (soEnviados && !((b.enviados[p.num] || {})[vid])) return;
          BLZ_UNITS.forEach((u) => { t[u] += (linha[vid] || {})[u] || 0; });
        });
        if (!(t.spear + t.sword + t.heavy)) return;
        linhas.push(p.num + '/' + t.spear + '/' + t.sword + '/0/' + t.heavy + '/0');
      });
      return linhas.join('\n');
    }
    // ---- Envio ----
    // Grava a trava ANTES de passar pro próximo e resposta ambígua conta como enviada. Apoio que
    // sai duas vezes esvazia a aldeia de defesa em dobro, e não tem desfazer — na dúvida, o
    // barato é você conferir na tela de comandos, não o script reenviar.
    async function ccBlzEnviar() {
      const b = config.cmd.blz;
      const msg = document.getElementById('cc-blz-msg');
      const diz = (t, cor) => { if (msg) { msg.textContent = t; msg.style.color = cor || '#c0483a'; } };
      if (!config.cmd.suporteOkAt) return diz('O apoio ainda não foi verificado neste mundo — deixe a praça aberta alguns segundos e tente de novo.');
      const tarefas = [];
      b.pedidos.forEach((p) => {
        const linha = b.plano[p.num] || {};
        Object.keys(linha).forEach((vid) => {
          if ((b.enviados[p.num] || {})[vid]) return;             // já saiu
          const q = linha[vid] || {};
          const amounts = {};
          BLZ_UNITS.forEach((u) => { if (q[u] > 0) amounts[u] = q[u]; });
          if (!Object.keys(amounts).length) return;
          const v = CCVILAS.find((z) => String(z.vid) === String(vid));
          if (!v) return;
          tarefas.push({ p: p, v: v, amounts: amounts });
        });
      });
      if (!tarefas.length) return diz('Nada pendente pra enviar — sugira a divisão ou preencha à mão.');
      // Menos perigoso que o Apoio em massa (aqui a tropa esta escrita numero a numero no plano, na
      // tela, e `b.enviados` impede reenvio), mas ainda e tropa saindo AGORA em lote. Pergunta antes,
      // pelo mesmo padrao do resto do arquivo.
      const nPed = Object.keys(tarefas.reduce((m, t) => { m[t.p.num] = 1; return m; }, {})).length;
      if (!confirm('Enviar ' + tarefas.length + ' apoio(s) AGORA, cobrindo ' + nPed + ' pedido(s) da blindagem?\n\n'
        + 'Sai na hora, não agenda.')) { diz('Cancelado — nada foi enviado.', '#6f6153'); return; }
      diz('Enviando ' + tarefas.length + ' apoio(s)… (não feche a praça)', '#6f6153');
      let ok = 0, falhas = 0;
      for (const t of tarefas) {
        const slots = BLZ_UNITS.map((u) => t.amounts[u] || 0).join('/');
        try {
          const prep = await cmdPrepare(t.v.vid, t.p.x, t.p.y, t.amounts, 'support');
          await cmdFire(prep);
          b.enviados[t.p.num] = b.enviados[t.p.num] || {};
          b.enviados[t.p.num][t.v.vid] = Date.now(); save();
          ok++;
          pushLog('🛡 Blindagem #' + t.p.num + ': ' + (t.v.coord || t.v.vid) + ' → ' + t.p.coord + ' (' + slots + ')', 'ok', 'cmd');
        } catch (e) {
          const em = String(e.message || e);
          if (/^ambiguo:/i.test(em)) {
            b.enviados[t.p.num] = b.enviados[t.p.num] || {};
            b.enviados[t.p.num][t.v.vid] = Date.now(); save();
            pushLog('🛡 Blindagem #' + t.p.num + ' (' + (t.v.coord || t.v.vid) + '): resposta ambígua, pode ter saído. Marquei como enviada — confira nos comandos antes de repetir.', '', 'cmd');
          } else {
            falhas++;
            pushLog('🛡 Blindagem #' + t.p.num + ' (' + (t.v.coord || t.v.vid) + ') FALHOU: ' + em, 'err', 'cmd');
          }
        }
        await sleep(200);
      }
      diz(ok + ' apoio(s) enviado(s)' + (falhas ? ' · ' + falhas + ' falha(s)' : '') + '. O texto do fórum está abaixo.',
          falhas ? '#a2643a' : '#2e7d3a');
      ccBlzRender();
    }
    function ccBlzRender() {
      const box = document.getElementById('cc-blz-lista'); if (!box) return;
      const b = config.cmd.blz;
      const inp = document.getElementById('cc-blz-url');
      if (inp && !inp.value) inp.value = b.url || '';
      BLZ_UNITS.forEach((u) => {
        const el = document.getElementById('cc-blz-res-' + u);
        if (el && el.value === '') el.value = b.reserva[u] || 0;
        const pa = document.getElementById('cc-blz-pa-' + u);
        if (pa && pa.value === '') pa.value = (b.porAldeia || {})[u] || '';
      });
      if (!b.pedidos.length) {
        box.innerHTML = '<div style="color:#8a7d6d;font-size:10px;padding:6px;text-align:center">— sem pedidos. Cole a URL do tópico e clique Buscar. —</div>';
        const t0 = document.getElementById('cc-blz-texto'); if (t0) t0.value = '';
        return;
      }
      const marcadas = CCVILAS.filter((v) => config.cmd.origens[v.vid] && v.x != null);
      const velhas = b.entregas.filter((e) => !e.posEdicao).length;
      let h = '<div style="font-size:9px;color:#8a7d6d;margin-bottom:4px">' +
        b.pedidos.length + ' pedido(s) · tabela editada ' +
        (b.editadoEm ? new Date(b.editadoEm).toLocaleString('pt-BR') : '(data não lida)') +
        (velhas ? ' · <b style="color:#a2643a">' + velhas + ' entrega(s) anteriores à edição ignoradas</b> — a tribo renumera os pedidos' : '') +
        '</div>';
      // Duas colunas de números e só. "pede" e "já veio" viraram tooltip da linha: eles explicam
      // de onde o "falta" saiu, mas não são o que se olha pra decidir — o que decide é quanto
      // ainda falta e quanto eu estou mandando. A marca escolhe quem entra na divisão.
      // A seleção é EXPLÍCITA. Antes valia "nenhum marcado = todos", e o resultado era que
      // desmarcar a última voltava a marcar todas — clicar não mudava nada na tela. Agora a
      // lista nasce com tudo marcado (semeada na busca e aqui, pra quem já tinha tabela) e o
      // que está gravado é a verdade.
      const sel = b.alvosSel || (b.alvosSel = {});
      if (!Object.keys(sel).length && b.pedidos.length) {
        b.pedidos.forEach((p) => { sel[p.num] = true; });
        save();
      }
      const nSel = b.pedidos.filter((p) => sel[p.num]).length;
      const trio = (o) => BLZ_UNITS.map((u) => (o[u] || 0) > 0
        ? unitIcon(u, BLZ_ROT[u]) + fmtN(o[u]) : '').filter(Boolean).join(' ') || '—';
      h += '<table style="width:100%;font-size:10px;border-collapse:collapse">' +
        '<tr style="color:#8a7d6d;text-align:left">' +
        '<th style="width:16px"><input type="checkbox" id="cc-blz-todos" title="marcar/desmarcar todos"' + (nSel === b.pedidos.length ? ' checked' : '') + '></th>' +
        '<th style="width:16px">#</th><th>aldeia</th>' +
        '<th style="width:34%">falta</th><th style="width:34%">eu mando</th></tr>';
      b.pedidos.forEach((p) => {
        const ent = ccBlzEntregue(p.num), falta = ccBlzFalta(p), meu = ccBlzMeuTotal(p.num);
        const zerado = !(falta.spear + falta.sword + falta.heavy);
        const nMinhas = Object.keys((b.plano[p.num] || {})).length;
        const nEnv = Object.keys((b.enviados[p.num] || {})).length;
        const marcado = !!sel[p.num];
        const tip = 'pedido: ' + BLZ_UNITS.map((u) => (p.pede[u] || 0) + ' ' + BLZ_ROT[u]).join(', ')
          + '\njá entregue pela tribo: ' + BLZ_UNITS.map((u) => (ent[u] || 0)).join('/');
        h += '<tr style="border-top:1px solid #efe7d8' + (zerado ? ';opacity:.5' : '') + '" title="' + esc(tip) + '">' +
          '<td><input type="checkbox" class="cc-blz-sel" data-num="' + p.num + '"' + (marcado ? ' checked' : '') + '></td>' +
          '<td><b>' + p.num + '</b></td>' +
          '<td style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(p.nome) +
            ' <span style="color:#8a7d6d">' + esc(p.coord) + '</span></td>' +
          '<td style="color:' + (zerado ? '#2e7d3a' : '#a2643a') + '">' + (zerado ? 'completo' : trio(falta)) + '</td>' +
          '<td><b style="color:#2e7d3a">' + trio(meu) + '</b>' +
            (nMinhas ? '<div style="color:#8a7d6d">' + nMinhas + ' aldeia(s)' + (nEnv ? ' · ' + nEnv + ' enviada(s)' : '') + '</div>' : '') +
          '</td></tr>';
      });
      // A ordem não precisa mais ser explicada: cada número vem com o ícone da unidade colado.
      h += '</table>' +
        '<div style="font-size:9px;color:#8a7d6d;margin-top:3px">origens marcadas: <b>' + marcadas.length + '</b>' +
        (marcadas.length ? '' : ' — marque as aldeias na lista de Origens, abaixo') +
        ' · pedidos na divisão: <b style="color:' + (nSel ? '#2e7d3a' : '#a2643a') + '">' + nSel + '</b>' +
        (nSel ? '' : ' — marque ao menos um') + '</div>';
      box.innerHTML = h;
      // Grava `false` em vez de apagar a chave. Com `delete`, desmarcar o ÚLTIMO pedido esvaziava
      // o objeto e a semeadura logo acima remarcava todos de novo — o mesmo defeito de antes,
      // só que na borda. Chave presente com `false` é "desmarcado de propósito".
      box.querySelectorAll('.cc-blz-sel').forEach((el) => el.addEventListener('change', () => {
        b.alvosSel[el.getAttribute('data-num')] = !!el.checked;
        save(); ccBlzRender();
      }));
      const todos = document.getElementById('cc-blz-todos');
      if (todos) todos.addEventListener('change', () => {
        b.pedidos.forEach((p) => { b.alvosSel[p.num] = !!todos.checked; });
        save(); ccBlzRender();
      });
      const t = document.getElementById('cc-blz-texto');
      if (t) t.value = ccBlzTexto(false);
    }
