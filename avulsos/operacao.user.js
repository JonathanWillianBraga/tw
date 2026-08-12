// ==UserScript==
// @name         TW Operação — envio coordenado avulso
// @namespace    twmgr-avulso
// @version      1.0.0
// @description  Dispara N comandos de aldeias diferentes para alvos diferentes, todos POUSANDO no mesmo instante. Independente do TW Manager.
// @match        https://*.tribalwars.com.br/game.php*
// @match        https://*.tribalwars.net/game.php*
// @grant        none
// ==/UserScript==

// ════════════════════════════════════════════════════════════════════════════
// PARA QUE SERVE
//
// Uma operação = muitos comandos, de origens diferentes, para alvos diferentes,
// todos chegando JUNTOS. O TW não tem isso: ele agenda um comando por vez e a
// conta do horário é sua.
//
// Este script é AVULSO de propósito. A Central de Comando do TW Manager faz
// coisa parecida, mas é mantida por outra pessoa — mexer lá geraria conflito.
//
// ── A DECISÃO DE PROJETO QUE MAIS IMPORTA ──────────────────────────────────
//
// O tempo de viagem NÃO é calculado. Ele é PERGUNTADO ao jogo.
//
// Dava pra fazer distância × velocidade da unidade mais lenta. Mas aí você
// depende de conhecer velocidade do mundo, da unidade, arredondamento do
// servidor e qualquer bônus ativo — quatro chances de errar por alguns
// segundos, e alguns segundos destroem a simultaneidade.
//
// A tela de confirmação (`try=confirm`) devolve a duração EXATA daquele envio,
// daquela origem, para aquele alvo, com aquela composição. E ela não envia
// nada: é só a primeira metade do envio em duas etapas. Então medimos primeiro
// e agendamos com o número do próprio servidor.
//
// ── SEGURANÇA ──────────────────────────────────────────────────────────────
//
// 1. Começa em MEDIR. Nada é enviado até você clicar em ARMAR e confirmar.
// 2. Cada comando é marcado como enviado ANTES da confirmação voltar, e o
//    estado vive no localStorage. Um F5 no meio não reenvia nada. Errar pra
//    menos (deixar de mandar) é barato; errar pra mais (mandar dobrado) não.
// 3. O envio só conta como sucesso se o jogo não devolveu caixa de erro. A
//    frase "selecione uma aldeia alvo" é AMBÍGUA — é também o estado normal da
//    praça depois de um envio dar certo — então ela vira "incerto" e o comando
//    NÃO é repetido.
// ════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';
  if (!window.game_data || !game_data.csrf) return;

  const CSRF = game_data.csrf;
  const CHAVE = 'twOperacao_' + (game_data.world || 'x');
  const $ = (s, r) => (r || document).querySelector(s);

  // ── Estado, gravado a cada passo ──────────────────────────────────────────
  // Sem isso, um F5 (ou o bot-check aparecendo) perde a operação inteira no meio.
  let S = { plano: '', pouso: '', itens: [], armado: false };
  try { const s = localStorage.getItem(CHAVE); if (s) S = Object.assign(S, JSON.parse(s)); } catch (e) {}
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (e) {} };

  const log = (msg, cor) => {
    const box = $('#op-log'); if (!box) return;
    const d = document.createElement('div');
    d.style.cssText = 'border-bottom:1px solid rgba(0,0,0,.07);padding:2px 0'
      + (cor ? ';color:' + cor : '');
    d.textContent = '[' + new Date().toLocaleTimeString('pt-BR') + '] ' + msg;
    box.insertBefore(d, box.firstChild);
  };

  // ── Leitura do plano ──────────────────────────────────────────────────────
  // Uma linha por comando:  <origem>  <alvo>  <unidade>=<n>,<unidade>=<n>
  // Ex.:  476|582  440|628  heavy=771,spy=1
  // Linhas em branco e as que começam com # são ignoradas, pra o plano poder
  // levar comentário e cabeçalho.
  function lerPlano(txt) {
    const out = [];
    (txt || '').split('\n').forEach((linha, i) => {
      const l = linha.trim();
      if (!l || l[0] === '#') return;
      const m = l.match(/^(\d{2,4})\|(\d{2,4})\s+(\d{2,4})\|(\d{2,4})\s+(.+)$/);
      if (!m) throw new Error('linha ' + (i + 1) + ' não entendi: "' + l.slice(0, 40) + '"');
      const tropas = {};
      m[5].split(',').forEach((par) => {
        const p = par.trim().match(/^([a-z]+)\s*=\s*(\d+)$/i);
        if (!p) throw new Error('linha ' + (i + 1) + ': tropa inválida "' + par.trim() + '"');
        if (+p[2] > 0) tropas[p[1].toLowerCase()] = +p[2];
      });
      if (!Object.keys(tropas).length) throw new Error('linha ' + (i + 1) + ': sem tropa nenhuma');
      out.push({ ox: +m[1], oy: +m[2], tx: +m[3], ty: +m[4], tropas: tropas,
                 origem: m[1] + '|' + m[2], alvo: m[3] + '|' + m[4],
                 dur: null, enviado: false, erro: '' });
    });
    return out;
  }

  // ── Mapa coordenada → id da aldeia ────────────────────────────────────────
  // O envio precisa do id da aldeia de origem, e o plano fala em coordenada.
  // O village.txt resolve isso e é o mesmo arquivo que o jogo já usa no mapa.
  let _mapa = null;
  async function idPorCoord() {
    if (_mapa) return _mapa;
    const r = await fetch('/map/village.txt', { credentials: 'omit' });
    if (!r.ok) throw new Error('não consegui baixar village.txt (HTTP ' + r.status + ')');
    const m = {};
    (await r.text()).split('\n').forEach((l) => {
      const f = l.split(',');
      if (f.length > 4) m[f[2] + '|' + f[3]] = f[0];
    });
    _mapa = m; return m;
  }

  // ── Etapa 1: confirmar (NÃO envia) e ler a duração ────────────────────────
  async function medirUm(it, vid) {
    const p = new URLSearchParams();
    Object.keys(it.tropas).forEach((u) => p.set(u, String(it.tropas[u])));
    p.set('x', String(it.tx)); p.set('y', String(it.ty));
    p.set('input', it.alvo); p.set('attack', 'l'); p.set('h', CSRF);
    const r = await fetch('/game.php?village=' + vid + '&screen=place&try=confirm',
      { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let t = await r.text();
    // Alguns mundos devolvem a confirmação embrulhada em JSON.
    try { const j = JSON.parse(t); t = (j.response && j.response.dialog) || j.dialog || t; } catch (e) {}
    const doc = new DOMParser().parseFromString(t, 'text/html');
    const form = doc.querySelector('#command-data-form') || doc.querySelector('form[action*="action=command"]');
    if (!form) {
      const err = doc.querySelector('.error, .autoHideBox, #command_confirmation_error');
      throw new Error(err ? err.textContent.trim().replace(/\s+/g, ' ').slice(0, 90)
                          : 'o jogo não devolveu o formulário (tropa insuficiente? alvo inválido?)');
    }
    let dur = null;
    const dd = doc.querySelector('[data-duration]');
    if (dd) dur = parseInt(dd.getAttribute('data-duration'), 10);
    if (!dur) {
      const m = (doc.body ? doc.body.textContent : t)
        .match(/dura[çc][aã]o[^0-9]{0,12}(\d{1,3}):([0-5]\d):([0-5]\d)/i);
      if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    }
    if (!dur || dur <= 0) throw new Error('não achei a duração na confirmação');
    return { dur: dur, form: form };
  }

  // ── Etapa 2: disparar ─────────────────────────────────────────────────────
  // Reenvia o formulário que o jogo devolveu, campo por campo. Não montamos o
  // corpo à mão: o formulário tem campos ocultos de nome aleatório, e um deles
  // faltando faz o servidor recusar sem dizer por quê.
  async function dispararUm(it, vid) {
    const { form } = await medirUm(it, vid);   // reconfirma agora, com o estado atual da tropa
    const p2 = new URLSearchParams();
    form.querySelectorAll('input, select').forEach((el) => {
      if (!el.name) return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      const v = el.value == null ? '' : String(el.value);
      // O alvo costuma aparecer duas vezes: um oculto preenchido e a caixa de
      // texto vazia. Sem esta guarda, a vazia chega por último e apaga o alvo.
      if (v === '' && p2.has(el.name) && p2.get(el.name) !== '') return;
      p2.set(el.name, v);
    });
    if (!p2.has('h')) p2.set('h', CSRF);
    if (!p2.get('input')) p2.set('input', it.alvo);
    if (!p2.get('x')) p2.set('x', String(it.tx));
    if (!p2.get('y')) p2.set('y', String(it.ty));
    const acao = form.getAttribute('action')
      || ('/game.php?village=' + vid + '&screen=place&action=command&h=' + CSRF);
    const url = acao.startsWith('http') ? acao : (location.origin + (acao[0] === '/' ? '' : '/') + acao);
    const r = await fetch(url, { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p2.toString() });
    const t = await r.text();
    const eb = new DOMParser().parseFromString(t, 'text/html').querySelector('.error_box');
    const et = eb ? (eb.textContent || '').trim().replace(/\s+/g, ' ') : '';
    if (et) {
      // "Selecione uma aldeia alvo" é o texto padrão da praça SEM alvo escolhido
      // — ou seja, o estado da tela logo DEPOIS de um envio dar certo. Ambíguo:
      // tratamos como incerto e nunca repetimos.
      if (/selecione uma aldeia alvo/i.test(et)) return 'incerto';
      throw new Error(et.slice(0, 90));
    }
    return 'ok';
  }

  // ── Medição de todos ──────────────────────────────────────────────────────
  async function medir() {
    let itens;
    try { itens = lerPlano($('#op-plano').value); }
    catch (e) { log('plano inválido — ' + e.message, '#b03030'); return; }
    if (!itens.length) { log('plano vazio', '#b03030'); return; }
    const mapa = await idPorCoord();
    const faltam = itens.filter((i) => !mapa[i.origem]);
    if (faltam.length) {
      log('não achei no mapa a origem de ' + faltam.length + ' linha(s): '
        + faltam.slice(0, 3).map((i) => i.origem).join(', '), '#b03030');
      return;
    }
    log('medindo ' + itens.length + ' comando(s)… (nada é enviado nesta etapa)');
    let ok = 0, err = 0;
    for (const it of itens) {
      try { it.dur = (await medirUm(it, mapa[it.origem])).dur; ok++; }
      catch (e) { it.erro = e.message || String(e); err++; log(it.origem + ' → ' + it.alvo + ': ' + it.erro, '#b03030'); }
      await new Promise((r) => setTimeout(r, 250));   // o 429 desta conta é global
    }
    S.itens = itens; S.plano = $('#op-plano').value; salvar();
    const durs = itens.filter((i) => i.dur).map((i) => i.dur);
    log('medido: ' + ok + ' ok, ' + err + ' com erro. Voo do mais lento: '
      + hms(Math.max.apply(null, durs)) + ' · do mais rápido: ' + hms(Math.min.apply(null, durs)),
      err ? '#b06a00' : '#2e7d3a');
    render();
  }

  const hms = (s) => {
    s = Math.round(s);
    return Math.floor(s / 3600) + 'h' + String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      + 'm' + String(s % 60).padStart(2, '0') + 's';
  };
  // Relógio do SERVIDOR. Agendar pelo relógio do PC erra pelo desvio da máquina,
  // que nesta conta já foi medido em segundos.
  const agoraServidor = () => {
    try { if (window.Timing && Timing.getCurrentServerTime) return Timing.getCurrentServerTime(); } catch (e) {}
    return Date.now();
  };

  // ── Disparo ───────────────────────────────────────────────────────────────
  let _timer = null;
  function armar() {
    if (!S.itens.length || S.itens.every((i) => !i.dur)) { log('meça antes de armar', '#b03030'); return; }
    const H = new Date($('#op-pouso').value).getTime();
    if (!H || isNaN(H)) { log('hora de pouso inválida', '#b03030'); return; }
    const pend = S.itens.filter((i) => i.dur && !i.enviado);
    const maisCedo = Math.min.apply(null, pend.map((i) => H - i.dur * 1000));
    if (maisCedo < agoraServidor()) {
      log('pouso cedo demais: o comando mais lento teria que ter saído '
        + hms((agoraServidor() - maisCedo) / 1000) + ' atrás', '#b03030');
      return;
    }
    if (!window.confirm('ARMAR ' + pend.length + ' comando(s) DE VERDADE?\n\n'
      + 'Pouso: ' + new Date(H).toLocaleString('pt-BR') + '\n'
      + 'O primeiro sai em ' + hms((maisCedo - agoraServidor()) / 1000) + '.')) return;
    S.pouso = $('#op-pouso').value; S.armado = true; salvar();
    log('ARMADO. ' + pend.length + ' comando(s) na fila.', '#2e7d3a');
    laco();
  }
  function parar() { S.armado = false; salvar(); clearTimeout(_timer); log('parado pelo usuário.', '#b06a00'); render(); }

  async function laco() {
    clearTimeout(_timer);
    if (!S.armado) return;
    const H = new Date(S.pouso).getTime();
    const mapa = await idPorCoord();
    const agora = agoraServidor();
    const devidos = S.itens.filter((i) => i.dur && !i.enviado && (H - i.dur * 1000) <= agora);
    for (const it of devidos) {
      // Marca ANTES de saber o resultado. Se a página cair no meio do POST, o
      // comando pode ter ido — repetir seria ataque dobrado, que é o erro caro.
      it.enviado = true; salvar();
      try {
        const r = await dispararUm(it, mapa[it.origem]);
        it.erro = (r === 'incerto') ? 'incerto (resposta ambígua — confira na praça)' : '';
        log((r === 'ok' ? '✔ ' : '? ') + it.origem + ' → ' + it.alvo
          + (r === 'ok' ? ' enviado' : ' INCERTO, confira'), r === 'ok' ? '#2e7d3a' : '#b06a00');
      } catch (e) {
        it.erro = 'FALHOU: ' + (e.message || e);
        log('✘ ' + it.origem + ' → ' + it.alvo + ': ' + it.erro, '#b03030');
      }
      salvar(); render();
    }
    const restam = S.itens.filter((i) => i.dur && !i.enviado);
    if (!restam.length) { S.armado = false; salvar(); log('operação concluída.', '#2e7d3a'); render(); return; }
    const prox = Math.min.apply(null, restam.map((i) => H - i.dur * 1000));
    // Passo curto perto da hora, longo quando falta muito: o setTimeout longo
    // escorrega em aba de fundo, então nunca dormimos mais que 20s.
    const espera = Math.max(120, Math.min(20000, prox - agoraServidor() - 60));
    _timer = setTimeout(laco, espera);
    render();
  }

  // ── Interface ─────────────────────────────────────────────────────────────
  function render() {
    const t = $('#op-tabela'); if (!t) return;
    const H = S.pouso ? new Date(S.pouso).getTime() : 0;
    const linhas = S.itens.map((i) => {
      const quando = (H && i.dur) ? new Date(H - i.dur * 1000) : null;
      const cor = i.erro ? (i.erro.indexOf('FALHOU') === 0 ? '#b03030' : '#b06a00')
                : i.enviado ? '#2e7d3a' : '#463b30';
      return '<tr style="color:' + cor + '"><td>' + i.origem + '</td><td>' + i.alvo + '</td>'
        + '<td>' + Object.keys(i.tropas).map((u) => i.tropas[u] + ' ' + u).join(' + ') + '</td>'
        + '<td>' + (i.dur ? hms(i.dur) : '—') + '</td>'
        + '<td>' + (quando ? quando.toLocaleTimeString('pt-BR') : '—') + '</td>'
        + '<td>' + (i.enviado ? (i.erro || 'enviado') : (i.erro || '')) + '</td></tr>';
    }).join('');
    const pend = S.itens.filter((i) => i.dur && !i.enviado).length;
    t.innerHTML = '<tr><th>origem</th><th>alvo</th><th>tropas</th><th>voo</th><th>sai às</th><th>estado</th></tr>' + linhas;
    $('#op-resumo').textContent = S.itens.length + ' comando(s) · ' + pend + ' pendente(s)'
      + (S.armado ? ' · ARMADO' : '');
  }

  function montar() {
    if ($('#op-painel')) return;
    const d = document.createElement('div');
    d.id = 'op-painel';
    d.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;width:640px;max-height:82vh;'
      + 'display:flex;flex-direction:column;background:#fdfaf4;border:1px solid #c4a35f;border-radius:9px;'
      + 'box-shadow:0 6px 24px rgba(0,0,0,.4);font:11px Verdana,sans-serif;color:#463b30';
    d.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#f4e4bc;border-bottom:1px solid #d8c9ae;border-radius:8px 8px 0 0">'
      + '<b style="flex:1">🎯 Operação — envio coordenado</b>'
      + '<span id="op-resumo" style="font-size:10px;color:#6f6153"></span>'
      + '<span id="op-min" style="cursor:pointer;padding:0 4px">–</span></div>'
      + '<div id="op-corpo" style="padding:9px 10px;overflow:auto">'
      + '<div style="font-size:10px;color:#6f6153;margin-bottom:5px">Uma linha por comando: <b>origem alvo tropas</b>'
      + ' — ex.: <code>476|582 440|628 heavy=771,spy=1</code></div>'
      + '<textarea id="op-plano" style="width:100%;height:110px;font:10px Consolas,monospace"></textarea>'
      + '<div style="display:flex;align-items:center;gap:6px;margin:7px 0">'
      + '<span>Pouso:</span><input id="op-pouso" type="datetime-local" step="1" style="font-size:11px">'
      + '<button id="op-medir" style="padding:3px 10px;cursor:pointer">1. Medir</button>'
      + '<button id="op-armar" style="padding:3px 10px;cursor:pointer;font-weight:700">2. Armar</button>'
      + '<button id="op-parar" style="padding:3px 10px;cursor:pointer">Parar</button>'
      + '<button id="op-limpar" style="padding:3px 8px;cursor:pointer;margin-left:auto">limpar</button></div>'
      + '<div style="max-height:200px;overflow:auto;border:1px solid #e8dfcc;border-radius:5px">'
      + '<table id="op-tabela" style="width:100%;border-collapse:collapse;font-size:10px"></table></div>'
      + '<div id="op-log" style="max-height:150px;overflow:auto;margin-top:7px;font-size:10px"></div>'
      + '</div>';
    document.body.appendChild(d);
    $('#op-plano').value = S.plano || '';
    if (S.pouso) $('#op-pouso').value = S.pouso;
    $('#op-medir').addEventListener('click', medir);
    $('#op-armar').addEventListener('click', armar);
    $('#op-parar').addEventListener('click', parar);
    $('#op-limpar').addEventListener('click', () => {
      if (!window.confirm('Limpar a operação inteira? O que já foi enviado NÃO volta.')) return;
      S = { plano: '', pouso: '', itens: [], armado: false }; salvar();
      $('#op-plano').value = ''; render(); log('limpo.');
    });
    $('#op-min').addEventListener('click', () => {
      const c = $('#op-corpo'); c.style.display = c.style.display === 'none' ? 'block' : 'none';
    });
    render();
    // Retoma sozinho depois de um F5 no meio da operação.
    if (S.armado) { log('operação armada encontrada — retomando.', '#b06a00'); laco(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
