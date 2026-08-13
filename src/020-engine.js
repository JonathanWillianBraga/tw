  // ===== Cards de status por módulo =====
  function fmtN(n) { return (n == null) ? '—' : Number(n).toLocaleString('pt-BR'); }
  function renderCards(mod, arr) {
    const box = document.getElementById('twmgr-cards-' + mod); if (!box) return;
    box.innerHTML = arr.map((c) =>
      (c.br ? '<div class="twmgr-card-break"></div>' : '') +
      '<div class="twmgr-card-mini' + (c.wide ? ' twmgr-card-wide' : '') + (c.hl ? ' twmgr-card-hl' : '') + '"><div class="twmgr-card-v">' + (c.v == null ? '—' : c.v) + '</div><div class="twmgr-card-l">' + c.l + '</div></div>'
    ).join('');
  }
  // Monta e desenha os cards de um módulo a partir de config[...].stats (populado nos ticks).
  function refreshCards(mod) {
    const box = document.getElementById('twmgr-cards-' + mod); if (!box) return;
    let arr = [];
    if (mod === 'farm') {
      const s = (config.farm.stats || {}), lt = s.loot || {};
      arr = [
        { v: fmtN(s.active), l: 'aldeias' },
        { v: fmtN(s.activeTotal), l: 'saques ativos', hl: true },
        // A/B/C num card só: são três números pequenos e secundários: em cards separados ocupavam uma
        // linha inteira de 3 cards grandes e roubavam o destaque do "saques ativos".
        { v: fmtN(s.a) + ' / ' + fmtN(s.b) + ' / ' + fmtN(s.c), l: 'A / B / C' },
        { v: fmtN(lt.today), l: 'saqueado hoje', br: true },
        { v: fmtN(lt.estimate), l: 'estimativa fim do dia' },
      ];
    } else if (mod === 'wall') {
      const s = (config.wall.stats || {});
      arr = [
        { v: fmtN(s.pending), l: 'aldeias p/ quebrar muralha', hl: true },
        { v: fmtN(s.active), l: 'quebras a caminho' },
      ];
    } else if (mod === 'scav') {
      const s = (config.scav.stats || {}), ct = s.coleta || {};
      arr = [
        { v: fmtN(s.active), l: 'aldeias' },
        { v: fmtN(ct.today), l: 'coletado hoje', hl: true },
        { v: fmtN(ct.estimate), l: 'estimativa fim do dia', wide: true },
      ];
    } else if (mod === 'recruit') {
      const s = (config.recruit.stats || {});
      // "meta" = TODAS as unidades do modelo com quantidade >= alvo. Antes contava toda aldeia
      // em que o ciclo nao recrutou nada, o que inclui fila cheia e requisito faltando.
      arr = [{ v: fmtN(s.villages), l: 'aldeias recrutando', hl: true }, { v: fmtN(s.metas), l: 'com a meta cheia' }];
    } else if (mod === 'build') {
      const s = (config.build.stats || {}), as = config.build.villages || {};
      const pausadas = Object.keys(as).filter((v) => as[v].paused).length;
      arr = [{ v: fmtN(s.villages), l: 'aldeias construindo', hl: true }, { v: fmtN(pausadas), l: 'pausadas' }];
    } else if (mod === 'research') {
      const s = (config.research && config.research.stats) || {};
      arr = [
        { v: fmtN(s.villages), l: 'aldeias pesquisando', hl: true },
        { v: fmtN(s.completas), l: 'modelo completo' },
        { v: fmtN(s.andando), l: 'pesquisa em curso' },
        { v: fmtN(s.abastecidas), l: 'abastecidas (últ. ciclo)' },
      ];
    } else if (mod === 'noble') {
      const s = (config.noble && config.noble.stats) || {};
      // Três cards, não cinco: a fila serve uma aldeia por vez, então "prontos/completos/sem
      // nobre" (que descreviam vários alvos ativos ao mesmo tempo) não dizem mais nada. O que
      // importa agora é o tamanho da fila e o estoque de nobre que a alimenta.
      arr = [
        { v: fmtN(s.naFila), l: 'aldeias na fila', hl: true },
        // Nobre PARADO nas aldeias, somado do que o ciclo já leu — sem requisição extra.
        { v: fmtN(s.recrutados), l: 'nobres recrutados' },
        // Na fila da Academia. Só conta o que o ciclo abriu: se a aldeia da vez já está coberta,
        // nenhuma Academia é lida e isto fica em zero — de propósito, é o custo de não sondar.
        { v: fmtN(s.recrutando), l: 'nobres recrutando' },
      ];
    } else if (mod === 'map') {
      const s = (config.map.stats || {});
      // O card "no alcance" mostrava s.mapped, que é barbCount: os bárbaros do MUNDO INTEIRO que
      // passam no filtro de PONTOS, sem filtro de distância nenhum. Dava 118.254 num print — e um
      // círculo de 20 campos tem ~1.257 posições, então nem 43 aldeias sem sobreposição chegariam
      // a 54 mil. O número estava certo, o rótulo é que mentia. Agora "no alcance" é o que sobra
      // depois de distância + já explorado + já com ataque a caminho, e o total do mundo aparece
      // separado, que é uma informação diferente e também útil.
      arr = [
        { v: fmtN(s.reach), l: 'no alcance', hl: true },
        { v: fmtN(s.novos), l: 'bárbaros novos' },
        { v: fmtN(s.sent), l: 'explorados' },
        { v: fmtN(s.left), l: 'de fora' },
        { v: fmtN(s.blPerda), l: 'bl: perdi tropa', br: true },
        { v: fmtN(s.blDefesa), l: 'bl: tem defesa' },
        { v: fmtN(s.mapped), l: 'bárbaros no mundo' },
      ];
    } else if (mod === 'lock') {
      const s = (config.lock.stats || {});
      arr = [
        { v: fmtN(s.inRange), l: 'no raio', hl: true },
        { v: fmtN(s.lockedNow), l: 'travadas agora' },
        { v: fmtN(s.total), l: 'travadas ao todo' },
        { v: fmtN(s.redSkipped), l: 'puladas (relatório vermelho)', wide: true },
      ];
    } else if (mod === 'etiqueta') {
      const e = config.etiqueta || {};
      arr = [
        { v: fmtN(e.lastCount || 0), l: 'na lista', hl: true },
        { v: fmtN(Object.keys(e.jaEnviados || {}).length), l: 'já etiquetados' },
      ];
    } else if (mod === 'paladin') {
      const st = (config.paladin && config.paladin.state) || {};
      const villages = Object.keys((config.paladin && config.paladin.villages) || {}).filter((v) => config.paladin.villages[v]);
      const vals = villages.map((v) => st[v] || {});
      const training = vals.filter((s) => s.status === 'training').length;
      const home = vals.filter((s) => s.status === 'home').length;
      const other = vals.length - training - home;
      arr = [
        { v: fmtN(villages.length), l: 'aldeias no ciclo', hl: true },
        { v: fmtN(training), l: 'treinando' },
        { v: fmtN(home), l: 'livres (aguard.)' },
        { v: fmtN(other), l: 'outros/sem palad.' },
      ];
    } else if (mod === 'obra') {
      const s = (config.obra && config.obra.stats) || {};
      arr = [
        { v: fmtN(s.villages), l: 'aldeias mapeadas', hl: true },
        { v: fmtN(s.built), l: 'obras na fila (últ. ciclo)' },
        { v: fmtN(s.researched), l: 'pesquisas (últ. ciclo)' },
        { v: fmtN(Object.keys(config.obra.demand || {}).length), l: 'aguard. recurso' },
      ];
    }
    renderCards(mod, arr);
  }
  // Atualiza o card de recurso diário (async) e re-desenha.
  async function refreshDaily(mod, cfg, key, type) {
    try { const d = await getDailyLootStats(type); cfg.stats = cfg.stats || {}; cfg.stats[key] = d; save(); refreshCards(mod); } catch (e) {}
  }

  function renderUpdateBadge() {
    const b = document.getElementById('twmgr-upd-badge');
    const btn = document.getElementById('twmgr-upd-btn');
    if (b) b.style.display = updateInfo.hasUpdate ? 'inline-block' : 'none';
    if (btn) btn.title = updateInfo.hasUpdate ? ('Nova versão v' + updateInfo.remoteVersion + ' disponível — clique para atualizar') : 'Verificar / instalar atualização';
  }

  async function checkForUpdate(manual) {
    try {
      const res = await fetch(UPDATE_URL + (UPDATE_URL.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const m = text.match(/@version\s+([\w.\-]+)/);
      const remote = m ? m[1] : null;
      updateInfo.checked = true;
      updateInfo.remoteVersion = remote || '?';
      updateInfo.hasUpdate = !!remote && remote !== VERSION;
      localStorage.setItem(KEY + '_lastUpdCheck', String(Date.now()));
      if (manual) {
        pushLog(updateInfo.hasUpdate ? ('Nova versão disponível: v' + remote + ' (atual v' + VERSION + '). Clique em 🔄 para instalar.') : ('Você já está na versão mais recente (v' + VERSION + ').'), updateInfo.hasUpdate ? 'ok' : '');
      } else if (updateInfo.hasUpdate) {
        pushLog('Nova versão disponível: v' + remote + '. Clique no botão 🔄 no topo do painel para instalar.', 'ok');
      }
      renderUpdateBadge();
    } catch (e) {
      if (manual) pushLog('Falha ao verificar atualização: ' + (e.message || e), 'err');
    }
  }

  function doUpdate() {
    pushLog('Abrindo instalador do Tampermonkey em nova aba (confirme a atualização por lá)...', 'ok');
    window.open(UPDATE_URL + (UPDATE_URL.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now(), '_blank');
  }

  function fmt(ms) {
    if (ms < 0) ms = 0; let s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (h ? h + ':' : '') + p(m) + ':' + p(s);
  }
  function absUrl(raw) { try { return new URL(raw, location.href).href; } catch (e) { return raw; } }

  // Meses abreviados do pt-BR, do jeito que a LISTA de relatórios escreve ("ago. 05, 01:13").
  const MES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // Converte a data do relatório ("hoje às 12:03:39", "ontem às ...", "13/07/26 às ...",
  // "ago. 05, 01:13", "ago. 04, 2026 19:55:01") em timestamp (ms). null se não der.
  function parseReportDate(txt) {
    txt = (txt || '').trim().toLowerCase();
    if (!txt) return null;
    const tm = txt.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const hh = tm ? +tm[1] : 0, mm = tm ? +tm[2] : 0, ss = (tm && tm[3]) ? +tm[3] : 0;
    const d = new Date();
    if (txt.indexOf('hoje') >= 0) { d.setHours(hh, mm, ss, 0); return d.getTime(); }
    if (txt.indexOf('ontem') >= 0) { d.setDate(d.getDate() - 1); d.setHours(hh, mm, ss, 0); return d.getTime(); }
    // Mês por NOME vem antes das numéricas: é o formato da lista de relatórios e não tem ambiguidade.
    // O ano é opcional ali ("ago. 05, 01:13") — sem ele assume o ano corrente, e se isso jogar a data
    // pro futuro é porque virou o ano (um relatório de dez. lido em jan.), então volta um.
    // [^\s\d]* engole tanto o ponto de "ago." quanto o resto de um mês por extenso ("março") — \w
    // não serviria, porque sem a flag /u ele não cobre letra acentuada.
    const mn = txt.match(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[^\s\d]*\s+(\d{1,2})(?:\s*,\s*(\d{4}))?/);
    if (mn) {
      const mesIdx = MES_PT.indexOf(mn[1]);
      if (mesIdx >= 0) {
        const ano = mn[3] ? +mn[3] : (new Date()).getFullYear();
        let t = new Date(ano, mesIdx, +mn[2], hh, mm, ss).getTime();
        if (!mn[3] && t > Date.now() + 2 * 86400000) t = new Date(ano - 1, mesIdx, +mn[2], hh, mm, ss).getTime();
        return t;
      }
    }
    const dm = txt.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
    if (dm) { let y = +dm[3]; if (y < 100) y += 2000; return new Date(y, (+dm[2]) - 1, +dm[1], hh, mm, ss).getTime(); }
    const dm2 = txt.match(/(\d{1,2})[\/.](\d{1,2})/);
    if (dm2) { return new Date((new Date()).getFullYear(), (+dm2[2]) - 1, +dm2[1], hh, mm, ss).getTime(); }
    return null;
  }

  function serverNow() { try { return window.Timing.getCurrentServerTime(); } catch (e) { return Date.now(); } }
  // Diferença entre o relógio de parede do NAVEGADOR e o do MUNDO (fuso), em ms.
  //
  // A versão anterior calculava isto a cada chamada, e o resultado era uma dente-de-serra
  // de 1000ms: serverNow() corre em milissegundo, enquanto o wallLocal vem do TEXTO de
  // #serverTime, que só muda uma vez por segundo. Cada chamada pegava um ponto diferente
  // da serra.
  //
  // Isso destruía qualquer agendamento em ms. Medido num teste real de 8 comandos: o
  // usuário pediu espaçamentos de 0/100/200/300/350/400/425ms e o plano guardou
  // 0/318/333/382/604/677/700/727 — cada comando pegou um deslocamento aleatório, e três
  // deles caíram do outro lado da virada de segundo, indo parar 1s adiante. A precisão
  // morria no AGENDAMENTO, antes de qualquer questão de disparo.
  //
  // Correção: fuso é sempre um número inteiro de MINUTOS, e o ruído da medição é de no
  // máximo 1s. Arredondar pro minuto mais próximo elimina a serra inteira e devolve o
  // valor exato — funcione ele zero, meia hora ou três horas. Calculado uma vez só.
  let _fusoMs = null;
  function wallToServerOffset() {
    if (_fusoMs != null) return _fusoMs;
    const ed = document.querySelector('#serverDate'), et = document.querySelector('#serverTime');
    let bruto;
    if (!ed || !et) bruto = serverNow() - Date.now();
    else {
      const dm = (ed.textContent || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
      const tm = (et.textContent || '').match(/(\d{2}):(\d{2}):(\d{2})/);
      if (!dm || !tm) bruto = serverNow() - Date.now();
      else bruto = serverNow() - new Date(+dm[3], +dm[2] - 1, +dm[1], +tm[1], +tm[2], +tm[3]).getTime();
    }
    _fusoMs = Math.round(bruto / 60000) * 60000;
    return _fusoMs;
  }
  function arrivalToServerMs(dtLocal) {
    if (!dtLocal) return 0;
    const localMs = new Date(dtLocal).getTime();
    if (isNaN(localMs)) return 0;
    return localMs + wallToServerOffset();
  }

  function parseCommands(doc) {
    const cmds = [];
    doc.querySelectorAll('tr.command-row').forEach((tr) => {
      const typeEl = tr.querySelector('.command_hover_details[data-command-type]');
      const kind = typeEl ? (typeEl.getAttribute('data-command-type') || 'other') : 'other';
      const label = tr.querySelector('.quickedit-label');
      const mc = label ? (label.textContent || '').match(/(\d{1,3})\|(\d{1,3})/) : null;
      const coord = mc ? (mc[1] + '|' + mc[2]) : null;
      const timer = tr.querySelector('td span[data-endtime]');
      let endMs = 0;
      if (timer) {
        const mt = (timer.textContent || '').match(/(\d+):([0-5]?\d):([0-5]\d)/);
        if (mt) endMs = Date.now() + ((+mt[1]) * 3600 + (+mt[2]) * 60 + (+mt[3])) * 1000;
        else { const et = parseInt(timer.getAttribute('data-endtime'), 10); if (et) endMs = et * 1000; }
      }
      const idEl = tr.querySelector('.quickedit-out[data-id]');
      cmds.push({ kind: kind, coord: coord, endMs: endMs, id: idEl ? idEl.getAttribute('data-id') : null });
    });
    return cmds;
  }

  async function getVillageState(vid) {
    vid = vid || CUR_VID;
    const res = await fetch('/game.php?village=' + vid + '&screen=place', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const avail = {};
    UNITS.forEach(([u]) => {
      let n = 0;
      const inp = doc.querySelector('#unit_input_' + u + ', input[name="' + u + '"]');
      if (inp) {
        const scope = inp.closest('td') || inp.closest('tr') || inp.parentElement;
        const link = scope ? scope.querySelector('.units-entry-all') : null;
        if (link) { const dc = link.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (link.textContent || '').replace(/\D/g, ''), 10); }
      }
      if (!n) { const alt = doc.querySelector('a.units-entry-all[data-unit="' + u + '"]'); if (alt) { const dc = alt.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (alt.textContent || '').replace(/\D/g, ''), 10); } }
      avail[u] = isNaN(n) ? 0 : n;
    });
    return { avail: avail, commands: parseCommands(doc) };
  }

  // Retorna o avail com as reservas do Planner descontadas (não negativo).
  function applyReservationsToAvail(vid, avail) {
    const r = (config.reservations || {})[vid] || {};
    const out = {};
    UNITS.forEach(([u]) => { out[u] = Math.max(0, (avail[u] || 0) - (r[u] || 0)); });
    return out;
  }
  async function getVillageStateReserved(vid) {
    const st = await getVillageState(vid);
    return { avail: applyReservationsToAvail(vid, st.avail), availRaw: st.avail, reserved: (config.reservations || {})[vid] || {}, commands: st.commands };
  }

  async function sendAttack(vid, x, y, amounts, kind) {
    const p1 = new URLSearchParams();
    Object.entries(amounts).forEach(([u, a]) => p1.set(u, String(a)));
    p1.set('x', String(x)); p1.set('y', String(y)); p1.set('input', x + '|' + y);
    if (kind === 'support') p1.set('support', 'l'); else p1.set('attack', 'l');
    p1.set('h', CSRF);
    const r1 = await fetch('/game.php?village=' + vid + '&screen=place&try=confirm', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p1.toString() });
    let t1 = await r1.text();
    try { const j = JSON.parse(t1); t1 = (j.response && j.response.dialog) || j.dialog || t1; } catch (e) {}
    const doc = new DOMParser().parseFromString(t1, 'text/html');
    const form = doc.querySelector('#command-data-form') || doc.querySelector('form[action*="action=command"]');
    if (!form) { const errEl = doc.querySelector('.error, .autoHideBox, #command_confirmation_error'); throw new Error('Confirmação falhou: ' + (errEl ? errEl.textContent.trim().slice(0, 100) : 'tropas insuficientes/alvo inválido')); }
    let dur = null;
    const dd = doc.querySelector('[data-duration]');
    if (dd) dur = parseInt(dd.getAttribute('data-duration'), 10);
    if (!dur) { const txt = doc.body ? doc.body.textContent : t1; const m = txt.match(/dura[çc][aã]o[^0-9]{0,12}(\d{1,2}):([0-5]\d):([0-5]\d)/i); if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); }
    const p2 = new URLSearchParams();
    form.querySelectorAll('input, select').forEach((el) => {
      if (!el.name) return;
      // Checkbox/radio não marcados o navegador não envia — copiá-los distorcia o formulário.
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      const v = el.value == null ? '' : String(el.value);
      // Campo VAZIO não pode apagar um valor já lido com o mesmo name: o alvo costuma aparecer duas
      // vezes (um hidden preenchido e a caixinha de texto vazia) e a vazia vinha por último.
      if (v === '' && p2.has(el.name) && p2.get(el.name) !== '') return;
      p2.set(el.name, v);
    });
    if (!p2.has('h')) p2.set('h', CSRF);
    // Reafirma o alvo: se ele se perde no repasse, o servidor responde "Por favor, selecione uma
    // aldeia alvo" e o envio é recusado.
    if (!p2.get('input')) p2.set('input', x + '|' + y);
    if (!p2.get('x')) p2.set('x', String(x));
    if (!p2.get('y')) p2.set('y', String(y));
    const action = form.getAttribute('action') || ('/game.php?village=' + vid + '&screen=place&action=command&h=' + CSRF);
    const r2 = await fetch(absUrl(action), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p2.toString() });
    const t2 = await r2.text();
    // Só considera enviado se NÃO veio caixa de erro nem mensagem de recusa (senão o log logava falso "enviado").
    // "Selecione uma aldeia alvo" também é o texto PADRÃO da praça sem alvo escolhido — que é o estado
    // da tela logo após um envio dar certo. Então essa mensagem é AMBÍGUA: pode ser recusa ou sucesso.
    // Marcada à parte pra quem chama não reenviar por outra origem e acabar mandando ataque dobrado.
    try {
      const d2 = new DOMParser().parseFromString(t2, 'text/html');
      const eb = d2.querySelector('.error_box');
      const et = eb ? (eb.textContent || '').trim().replace(/\s+/g, ' ') : '';
      if (et) throw new Error((/selecione uma aldeia alvo/i.test(et) ? 'ambiguo: ' : 'recusado: ') + et.slice(0, 80));
    } catch (e) { if (/^(recusado|ambiguo):/.test(e.message)) throw e; }
    if (/n[aã]o (tem|h[aá]) (tropas|unidades)|insuficient|not enough/i.test(t2)) throw new Error('Servidor recusou: tropas insuficientes.');
    return dur && dur > 0 ? dur : null;
  }

  function computeAmounts(units, avail) {
    const amounts = {}; let ready = true, total = 0;
    UNITS.forEach(([u]) => {
      const c = units[u]; if (!c) return;
      if (c.max) { if (avail[u] > 0) { amounts[u] = avail[u]; total += avail[u]; } }
      else if (c.qty > 0) { if (avail[u] >= c.qty) { amounts[u] = c.qty; total += c.qty; } else ready = false; }
    });
    return { amounts, ready, total };
  }
  function hasUnits(t) { return UNITS.some(([u]) => t.units[u] && (t.units[u].max || t.units[u].qty > 0)); }

  async function processDue() {
    clearTimeout(sendTimer);
    if (!config.running) return;
    if (lockOther()) { sendTimer = setTimeout(processDue, 5000); return; }
    if (captchaBlocked()) { sendTimer = setTimeout(processDue, 30000); return; }   // era o único tick sem esta guarda
    claimLock();
    const now = Date.now();
    const due = config.targets.filter((t) => t.enabled && hasUnits(t) && (t.nextSendAt || 0) <= now && t.x && t.y);
    if (due.length === 0) { scheduleWake(); return; }
    const byOrigin = {};
    due.forEach((t) => { const o = t.origin || CUR_VID; (byOrigin[o] = byOrigin[o] || []).push(t); });
    let sentAny = false;
    for (const origin of Object.keys(byOrigin)) {
      let state;
      try { state = await getVillageStateReserved(origin); }
      catch (e) { pushLog('Erro ao ler estado (' + origin + '): ' + (e.message || e), 'err'); byOrigin[origin].forEach((t) => { t.nextSendAt = now + 30000; }); continue; }
      const avail = state.avail;
      for (const t of byOrigin[origin]) {
        const coord = t.x + '|' + t.y;
        const blk = state.commands.filter((c) => c.coord === coord && (c.kind === 'attack' || c.kind === 'return'));
        if (blk.length) { t.nextSendAt = Math.min.apply(null, blk.map((c) => c.endMs || (now + 30000))) + 8000; t.phase = 'inflight'; continue; }
        const { amounts, ready, total } = computeAmounts(t.units, avail);
        if (!ready || total === 0) { t.nextSendAt = now + 30000; continue; }
        try {
          const desc = Object.entries(amounts).map(([u, a]) => u + '=' + a).join(', ');
          await sendAttack(origin, t.x, t.y, amounts);
          Object.entries(amounts).forEach(([u, a]) => { avail[u] = Math.max(0, (avail[u] || 0) - a); });
          t.lastSentAt = now; t.phase = 'sent'; t.nextSendAt = now + 12000; sentAny = true;
          pushLog('Enviado → ' + coord + ' [' + desc + '] · de ' + (t.originName || origin), 'ok');
        } catch (e) {
          const em = String(e.message || e);
          // Ambíguo = pode ter enviado. Reagendar em 30s manda de novo no mesmo alvo. Trata como
          // enviado e deixa o intervalo normal correr; se não saiu, o próximo ciclo cobre.
          if (/^ambiguo:/.test(em)) {
            t.lastSentAt = now; t.phase = 'sent'; t.nextSendAt = now + 12000; sentAny = true;
            pushLog('Resposta ambígua em ' + coord + ' — pode ter enviado, não vou repetir agora.', '');
          } else {
            t.nextSendAt = now + 30000;
            pushLog('Falha em ' + coord + ' (de ' + (t.originName || origin) + '): ' + em, 'err');
          }
        }
      }
    }
    save();
    if (config.reloadAfterSend && sentAny) { setTimeout(() => location.reload(), 900); } else { scheduleWake(); }
  }

  function scheduleWake() {
    clearTimeout(sendTimer);
    if (!config.running) return;
    const now = Date.now();
    const times = config.targets.filter((t) => t.enabled && hasUnits(t) && t.x && t.y).map((t) => t.nextSendAt || 0);
    const next = times.length ? Math.min.apply(null, times) : now + 60000;
    sendTimer = setTimeout(processDue, Math.min(Math.max(Math.max(0, next - now), 1000), 60000));
  }

  // Extrai o objeto de definições das coletas (custo, duração, pré-requisito) do HTML.
  //
  // A primeira versão usava expressão regular e falhou contra a página real: um `.*?` até
  // `}}` para no PRIMEIRO fechamento duplo, e o objeto tem chaves aninhadas (cada opção
  // carrega um premium_boost dentro). O sintoma foi "não achei os custos de desbloqueio".
  // Agora varre balanceando chaves e ignorando o que está dentro de string — não depende
  // de o JSON estar formatado de um jeito específico.
  function scavExtrairDefs(html) {
    let i = -1;
    const anc = html.indexOf('ScavengeMassScreen(');
    if (anc >= 0) i = html.indexOf('{', anc);
    if (i < 0) {
      // Plano B: acha qualquer custo de desbloqueio e volta até o começo do objeto raiz.
      const u = html.indexOf('"unlock_cost"');
      if (u < 0) return null;
      i = html.lastIndexOf('{"1":', u);
      if (i < 0) return null;
    }
    let nivel = 0, emStr = false, escapado = false;
    for (let j = i; j < html.length; j++) {
      const c = html[j];
      if (emStr) {
        if (escapado) escapado = false;
        else if (c === '\\') escapado = true;
        else if (c === '"') emStr = false;
        continue;
      }
      if (c === '"') { emStr = true; continue; }
      if (c === '{') nivel++;
      else if (c === '}') {
        nivel--;
        if (nivel === 0) {
          try {
            const o = JSON.parse(html.slice(i, j + 1));
            return (o && o['1'] && o['1'].unlock_cost) ? o : null;
          } catch (e) { return null; }
        }
      }
    }
    return null;
  }

  async function getAllScavengeState() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=place&mode=scavenge_mass', { credentials: 'include' });
    const html = await res.text();
    const m = html.match(/\[\{"village_id":[\s\S]*?\}\]/);
    if (!m) throw new Error('dados de coleta em massa não encontrados');
    let arr; try { arr = JSON.parse(m[0]); } catch (e) { throw new Error('falha ao ler dados de coleta'); }
    const out = arr.map((v) => {
      const carryFactor = parseFloat(v.unit_carry_factor) || 1;
      const home = v.unit_counts_home || {};
      const availRaw = {}; SCAV_UNITS.forEach(([u]) => { availRaw[u] = parseInt(home[u], 10) || 0; });
      const reserved = (config.reservations || {})[String(v.village_id)] || {};
      const avail = {}; SCAV_UNITS.forEach(([u]) => { avail[u] = Math.max(0, availRaw[u] - (reserved[u] || 0)); });
      const options = [];
      for (let id = 1; id <= 4; id++) {
        const o = v.options && v.options[id];
        let state = 'locked', endMs = 0;
        let desbloqueando = 0;
        if (o) {
          if (o.is_locked) { state = 'locked'; desbloqueando = (o.unlock_time || 0) * 1000; }
          else if (o.scavenging_squad) { state = 'running'; endMs = (o.scavenging_squad.return_time || 0) * 1000; }
          else state = 'free';
        }
        options.push({ id: id, state: state, endMs: endMs, desbloqueandoAte: desbloqueando });
      }
      // res e storage_max vêm na MESMA resposta e eram descartados. O desbloqueio
      // automático precisa deles pra saber se a aldeia banca o custo — de graça.
      const res = v.res || {};
      return {
        vid: String(v.village_id), name: v.village_name || ('ID ' + v.village_id),
        carryFactor: carryFactor, avail: avail, options: options,
        res: { wood: parseInt(res.wood, 10) || 0, stone: parseInt(res.stone, 10) || 0, iron: parseInt(res.iron, 10) || 0 },
        storageMax: parseInt(v.storage_max, 10) || 0,
      };
    });
    // Custo e pré-requisito de cada opção vêm num JSON separado, no construtor da tela.
    // Pendurado no próprio array: quem já usava esta função continua funcionando igual.
    out.defs = scavExtrairDefs(html);
    return out;
  }

  // ── DESBLOQUEIO AUTOMÁTICO DAS COLETAS ──────────────────────────────────────────
  // Endpoint capturado da requisição real (interceptada e bloqueada, pra não desbloquear
  // nada durante a descoberta):
  //     POST screen=scavenge_api&ajaxaction=start_unlock
  //     body: village_id=<vid>&option_id=<1..4>&h=<csrf>
  async function scavStartUnlock(vid, optionId) {
    const r = await fetch('/game.php?village=' + vid + '&screen=scavenge_api&ajaxaction=start_unlock', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: 'village_id=' + encodeURIComponent(vid) + '&option_id=' + encodeURIComponent(optionId) + '&h=' + CSRF,
    });
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status);
    try { const j = JSON.parse(t); if (j && j.error) throw new Error(String(j.error).slice(0, 90)); } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
    return true;
  }

  const RES3 = ['wood', 'stone', 'iron'];

  // Qual a PRÓXIMA opção que esta aldeia pode desbloquear. Respeita o pré-requisito (a 3
  // exige a 2, e assim por diante) e o teto que o usuário definiu. Devolve null se não há
  // nada a fazer — inclusive quando já existe um desbloqueio em andamento, porque o jogo
  // só permite um por aldeia de cada vez.
  function scavProximaOpcao(v, defs, ate) {
    if (v.options.some((o) => o.desbloqueandoAte)) return null;
    for (let id = 1; id <= Math.min(4, ate || 4); id++) {
      const o = v.options.find((x) => x.id === id);
      if (!o || o.state !== 'locked') continue;
      const d = defs && defs[String(id)];
      if (!d) return null;
      const prereq = d.prerequisite_option_ids || [];
      const faltaPre = prereq.some((p) => { const po = v.options.find((x) => x.id === p); return !po || po.state === 'locked'; });
      if (faltaPre) continue;   // ainda não dá; talvez a próxima do laço sirva
      return { id: id, nome: d.name || ('Coleta ' + id), custo: d.unlock_cost || {} };
    }
    return null;
  }

  // Puxa o que falta de UMA OU MAIS aldeias, imediatamente.
  // Escolhe as doadoras mais PERTO primeiro (transporte leva tempo) entre as que têm sobra
  // acima da reserva. Cada doadora precisa de mercador livre, e isso só dá pra saber
  // lendo a aldeia — por isso a leitura de mercado acontece só nas candidatas, não em todas.
  async function scavPuxarRecursos(destino, falta, estados, coords) {
    const cfg = config.scav;
    const reserva = Math.max(0, cfg.unlockReserva || 0);
    const dCoord = coords[destino.vid];
    if (!dCoord) throw new Error('sem coordenada da aldeia de destino');
    const restante = {}; RES3.forEach((k) => { restante[k] = Math.max(0, falta[k] || 0); });
    const candidatas = estados
      .filter((v) => v.vid !== destino.vid && coords[v.vid] && RES3.some((k) => restante[k] && (v.res[k] - reserva) > 0))
      .map((v) => {
        const a = coords[v.vid].split('|'), b = dCoord.split('|');
        return { v: v, dist: fieldDist(+a[0], +a[1], +b[0], +b[1]) };
      })
      .sort((x, y) => x.dist - y.dist)
      .slice(0, Math.max(1, cfg.unlockMaxOrigens || 5));
    let usadas = 0;
    for (const c of candidatas) {
      if (!RES3.some((k) => restante[k] > 0)) break;
      if (devoParar('scav')) break;
      let mercado;
      try { mercado = await getMarketState(c.v.vid); } catch (e) { continue; }
      let cap = Math.max(0, mercado.capacity || 0);   // capacidade dos mercadores livres
      if (cap <= 0) continue;
      const envio = { wood: 0, stone: 0, iron: 0 };
      RES3.forEach((k) => {
        if (cap <= 0 || restante[k] <= 0) return;
        const sobra = Math.max(0, (c.v.res[k] || 0) - reserva);
        const n = Math.min(restante[k], sobra, cap);
        if (n > 0) { envio[k] = n; cap -= n; }
      });
      const total = RES3.reduce((s, k) => s + envio[k], 0);
      if (total <= 0) continue;
      try {
        const dur = await sendMarketResources(c.v.vid, dCoord, envio);
        RES3.forEach((k) => { restante[k] = Math.max(0, restante[k] - envio[k]); c.v.res[k] -= envio[k]; });
        // REGISTRA o que está voando. Sem isto o ciclo seguinte recalcula a mesma falta (o
        // transporte ainda não pousou) e manda tudo de novo — era o que enchia a aldeia de
        // caminhão. Some sozinho na hora da chegada.
        config.scav.emVoo = config.scav.emVoo || {};
        const fila = config.scav.emVoo[destino.vid] = config.scav.emVoo[destino.vid] || [];
        const chega = Date.now() + ((dur && dur > 0 ? dur : 3600) * 1000);
        RES3.forEach((k) => { if (envio[k] > 0) fila.push({ r: k, amt: envio[k], chega: chega }); });
        usadas++;
        pushLog('🚚 ' + c.v.name + ' → ' + destino.name + ': ' + RES3.filter((k) => envio[k]).map((k) => envio[k] + ' ' + k).join(', ') +
          ' (' + Math.round(c.dist * 10) / 10 + ' campos)', 'ok', 'scav');
      } catch (e) { pushLog('🚚 ' + c.v.name + ' → ' + destino.name + ': envio falhou (' + (e.message || e) + ').', 'err', 'scav'); }
      await sleep(400);
    }
    const aindaFalta = RES3.reduce((s, k) => s + restante[k], 0);
    return { usadas: usadas, aindaFalta: aindaFalta, restante: restante };
  }

  // O que já está a caminho desta aldeia por conta do desbloqueio, por recurso. Poda o que já
  // pousou na mesma passada, então não precisa de limpeza em outro lugar.
  function scavPuxadoEmVoo(vid) {
    const agora = Date.now();
    config.scav.emVoo = config.scav.emVoo || {};
    const lista = (config.scav.emVoo[vid] || []).filter((e) => e.chega > agora);
    if (lista.length) config.scav.emVoo[vid] = lista; else delete config.scav.emVoo[vid];
    const out = { wood: 0, stone: 0, iron: 0 };
    lista.forEach((e) => { out[e.r] = (out[e.r] || 0) + e.amt; });
    return out;
  }

  async function scavAutoUnlock(estados) {
    const cfg = config.scav;
    if (!cfg.autoUnlock) return;
    const defs = estados.defs;
    if (!defs) { pushLog('⛏️ Não achei os custos de desbloqueio nesta tela — desbloqueio automático pulado neste ciclo.', '', 'scav'); return; }
    let coords = {};
    try { (await getAllVillagesCached()).forEach((v) => { if (v.coord) coords[v.vid] = v.coord; }); } catch (e) {}
    cfg.faltouRecurso = {};
    let abertos = 0, puxadas = 0, semRecurso = 0;
    for (const v of estados) {
      if (devoParar('scav')) break;
      const alvo = scavProximaOpcao(v, defs, cfg.unlockAte);
      if (!alvo) continue;
      const falta = {}; let precisa = 0;
      RES3.forEach((k) => { const f = Math.max(0, (alvo.custo[k] || 0) - (v.res[k] || 0)); falta[k] = f; precisa += f; });
      if (!precisa) {
        try {
          await scavStartUnlock(v.vid, alvo.id);
          abertos++;
          pushLog('⛏️ ' + v.name + ': desbloqueando ' + alvo.nome + '.', 'ok', 'scav');
        } catch (e) { pushLog('⛏️ ' + v.name + ': não consegui desbloquear ' + alvo.nome + ' (' + (e.message || e) + ').', 'err', 'scav'); }
        await sleep(400);
        continue;
      }
      // Falta recurso. Puxa de uma ou mais aldeias AGORA — o transporte leva tempo, então
      // quanto antes sair, antes chega. O desbloqueio em si fica pro próximo ciclo, quando
      // o recurso tiver pousado; tentar agora só daria erro do servidor.
      cfg.faltouRecurso[v.vid] = { nome: v.name, opcao: alvo.nome, falta: falta, at: Date.now() };
      semRecurso++;
      if (!cfg.unlockPuxar) continue;

      // ---- TRAVA 1: o alvo cabe no armazém? ----
      // Se o custo de um recurso passa da capacidade do armazém, esta aldeia NUNCA vai juntar
      // aquilo — o que chega acima do teto simplesmente some. Sem esta conferência o ciclo
      // recalculava a mesma falta pra sempre e mandava caminhão atrás de caminhão, destruindo
      // recurso a cada chegada. Foi o que estourou uma aldeia recém-conquistada, de armazém
      // pequeno, mirando a Extrema Coleta.
      const teto = v.storageMax || 0;
      const naoCabe = teto ? RES3.filter((k) => (alvo.custo[k] || 0) > teto) : [];
      if (naoCabe.length) {
        pushLog('⛏️ ' + v.name + ': ' + alvo.nome + ' custa mais ' + naoCabe.join('/') + ' do que o armazém'
          + ' guarda (' + fmtN(teto) + ') — é impossível juntar, o que passa do teto some. Não vou puxar'
          + ' recurso pra cá. Suba o Armazém ou baixe o "desbloquear até".', 'err', 'scav');
        continue;
      }

      // ---- TRAVA 2: desconta o que já está voando e o que cabe ----
      // `falta` sai do recurso de AGORA e ignorava o transporte a caminho, então cada ciclo
      // repetia o pedido inteiro. E nunca pede mais do que ainda cabe no armazém.
      const voando = scavPuxadoEmVoo(v.vid);
      const pedir = {}; let aindaPrecisa = 0;
      RES3.forEach((k) => {
        const livre = teto ? Math.max(0, teto - (v.res[k] || 0) - (voando[k] || 0)) : Infinity;
        pedir[k] = Math.max(0, Math.min((falta[k] || 0) - (voando[k] || 0), livre));
        aindaPrecisa += pedir[k];
      });
      if (!aindaPrecisa) continue;   // o que já está a caminho resolve

      try {
        const r = await scavPuxarRecursos(v, pedir, estados, coords);
        if (r.usadas) {
          puxadas++;
          pushLog('⛏️ ' + v.name + ': faltava recurso pra ' + alvo.nome + ' — puxei de ' + r.usadas + ' aldeia(s)' +
            (r.aindaFalta ? ', ainda faltam ' + RES3.filter((k) => r.restante[k]).map((k) => r.restante[k] + ' ' + k).join(', ') : ', completo') +
            '. Desbloqueio no próximo ciclo, quando chegar.', '', 'scav');
        }
      } catch (e) { pushLog('⛏️ ' + v.name + ': não consegui puxar recurso (' + (e.message || e) + ').', 'err', 'scav'); }
    }
    save();
    renderScavFalta();
    if (abertos || puxadas || semRecurso) {
      pushLog('⛏️ Desbloqueio: ' + abertos + ' aberto(s)' + (semRecurso ? ' · ' + semRecurso + ' sem recurso' : '') + (puxadas ? ' · ' + puxadas + ' com transporte a caminho' : '') + '.', 'ok', 'scav');
    }
  }

  function distribute(count, weights) {
    const W = weights.reduce((a, b) => a + b, 0) || 1;
    const raw = weights.map((w) => count * w / W);
    const base = raw.map(Math.floor);
    let rem = count - base.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => [i, r - Math.floor(r)]).sort((a, b) => b[1] - a[1]);
    for (let k = 0; k < rem; k++) base[order[k % order.length][0]]++;
    return base;
  }

  async function sendMassScavenge(reqs) {
    const b = new URLSearchParams();
    reqs.forEach((r, k) => {
      const p = 'squad_requests[' + k + ']';
      b.set(p + '[village_id]', r.vid);
      Object.entries(r.units).forEach(([u, n]) => { if (n > 0) b.set(p + '[candidate_squad][unit_counts][' + u + ']', String(n)); });
      b.set(p + '[candidate_squad][carry_max]', String(r.carry));
      b.set(p + '[option_id]', String(r.optionId));
      b.set(p + '[use_premium]', 'false');
    });
    b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=scavenge_api&ajaxaction=send_squads', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'TribalWars-Ajax': '1', 'X-Requested-With': 'XMLHttpRequest' }, body: b.toString() });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (j && j.error) throw new Error(Array.isArray(j.error) ? j.error.join('; ') : String(j.error));
    return true;
  }

  // Duração REAL de cada nível de coleta antes de enviar, lida direto da tela de coleta da aldeia
  // (screen=place&mode=scavenge) — só chamada quando o "tempo máximo" está ativo, já que é 1 fetch
  // extra por aldeia. O jogo não entrega essa duração pronta pelo endpoint em massa (scavenge_mass),
  // só depois que o esquadrão já está a caminho — então tem que ler o valor que o próprio jogo mostra
  // antes do envio (span.duration), em vez de tentar reproduzir a fórmula.
  async function getScavDurations(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=place&mode=scavenge', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const spans = doc.querySelectorAll('span.duration');
    if (spans.length !== 4) return {};   // não deu pra mapear nível->duração com segurança (ex.: nível travado sem card)
    const out = {};
    spans.forEach((sp, i) => {
      const m = (sp.textContent || '').trim().match(/^(\d+):([0-5]\d):([0-5]\d)$/);
      if (m) out[i + 1] = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    });
    return out;
  }
  async function scavTick() {
    clearTimeout(scavTimer);
    if (!config.scav.running) return;
    if (lockOther()) { scavTimer = setTimeout(scavTick, 5000); return; }
    if (captchaBlocked()) { scavTimer = setTimeout(scavTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.scav.nextAt || 0) > now) { scheduleScav(); return; }
    let villages;
    try { villages = await getAllScavengeState(); }
    catch (e) { pushLog('Coleta: erro ao ler o estado das aldeias (' + (e.message || e) + ').', 'err', 'scav'); config.scav.nextAt = now + 60000; save(); scheduleScav(); return; }
    // Desbloqueio antes de despachar: a mesma leitura já traz opções, recursos e custos,
    // então descobrir o que dá pra abrir não custa requisição nenhuma a mais.
    try { await scavAutoUnlock(villages); } catch (e) { pushLog('⛏️ Desbloqueio automático falhou (' + (e.message || e) + ') — a coleta segue normal.', 'err', 'scav'); }
    const selUnits = SCAV_UNITS.map(([u]) => u).filter((u) => config.scav.units[u]);
    const maxSec = Math.max(0, config.scav.maxHours || 0) * 3600;
    const reqs = [], runningEnds = [], activeSet = {};
    for (const v of villages) {
      if (v.options.some((o) => o.state === 'running')) activeSet[v.vid] = 1;
      v.options.filter((o) => o.state === 'running' && o.endMs).forEach((o) => runningEnds.push(o.endMs));
      let freeOpts = v.options.filter((o) => o.state === 'free');
      if (!freeOpts.length) continue;
      // SÓ DESPACHA COM A ALDEIA INTEIRA EM CASA. A premissa do módulo é que as coletas
      // TERMINEM JUNTAS: como a duração cresce com (carga × loot_factor), carga proporcional a
      // 1/loot_factor dá o mesmo tempo em todas. Mas isso só vale se elas saírem JUNTAS.
      //
      // Antes o repartia entre as opções LIVRES. Quando uma vagava sozinha, ela levava a tropa
      // inteira. Medido na conta do usuário: aldeia com as opções 1, 2 e 3 voltando em 0,4h e a
      // 4 sozinha com 36.500 de carga, voltando em 20,9h — e o desequilíbrio se realimentava,
      // porque a próxima a vagar sozinha levava tudo de novo.
      if (v.options.some((o) => o.state === 'running')) continue;
      // Tempo máximo (modo guerra): só manda pros níveis cuja duração REAL (lida da tela) cabe no teto.
      // Se não der pra confirmar a duração de um nível (erro de rede ou HTML inesperado), NÃO manda pra
      // ele — por segurança, prefere não coletar a arriscar tropa fora de casa por tempo desconhecido.
      if (maxSec > 0) {
        let durs = {};
        try { durs = await getScavDurations(v.vid); }
        catch (e) { pushLog('Coleta em ' + v.name + ': erro ao checar duração (' + (e.message || e) + ') — pulando por segurança.', 'err', 'scav'); }
        const before = freeOpts.length;
        freeOpts = freeOpts.filter((o) => durs[o.id] != null && durs[o.id] <= maxSec);
        if (!freeOpts.length && before) { pushLog('Coleta em ' + v.name + ': nenhum nível dentro do tempo máximo (' + config.scav.maxHours + 'h) — pulando.', '', 'scav'); continue; }
      }
      const avail = {}; let totalUnits = 0;
      selUnits.forEach((u) => { const n = v.avail[u] || 0; if (n > 0) { avail[u] = n; totalUnits += n; } });
      if (!freeOpts.length || totalUnits === 0) continue;
      // Uma opção que fica abaixo do mínimo de população não pode ser enviada. Em vez de
      // simplesmente pular (o que deixava aquela fatia da tropa em casa E desbalanceava o
      // resto), tira a opção da conta e reparte TUDO de novo entre as que sobraram: os tempos
      // continuam iguais entre elas. Quem cai primeiro é sempre a de maior loot_factor, que é a
      // que recebe a menor fatia, então o laço converge.
      let usar = freeOpts.slice(), alloc = [];
      const popDe = (a) => Object.entries(a).reduce((s, [u, c]) => s + c * (POP[u] || 1), 0);
      while (usar.length) {
        const weights = usar.map((o) => 1 / (LOOT_FACTOR[o.id] || 0.1));
        alloc = usar.map(() => ({}));
        Object.entries(avail).forEach(([u, n]) => { distribute(n, weights).forEach((c, i) => { if (c > 0) alloc[i][u] = c; }); });
        const ruim = alloc.findIndex((a) => popDe(a) < MIN_POP);
        if (ruim < 0) break;
        usar.splice(ruim, 1);
      }
      if (!usar.length) continue;
      if (usar.length < freeOpts.length) {
        pushLog('Coleta em ' + v.name + ': tropa insuficiente pra abastecer as ' + freeOpts.length
          + ' coletas — repartida entre ' + usar.length + ' (níveis ' + usar.map((o) => o.id).join(', ') + ').', '', 'scav');
      }
      for (let i = 0; i < usar.length; i++) {
        const a = alloc[i];
        const carry = Math.floor(Object.entries(a).reduce((s, [u, c]) => s + c * (CARRY[u] || 0), 0) * (v.carryFactor || 1));
        if (carry <= 0) continue;
        reqs.push({ vid: v.vid, name: v.name, optionId: usar[i].id, units: a, carry: carry });
      }
    }
    let sent = false;
    if (reqs.length) {
      try {
        await sendMassScavenge(reqs);
        reqs.forEach((r) => { activeSet[r.vid] = 1; pushLog('Coleta: ' + r.name + ' → nível ' + r.optionId + ' (' + Object.entries(r.units).map(([u, c]) => c + ' ' + u).join(', ') + ')', 'ok', 'scav'); });
        pushLog('Coleta: ' + reqs.length + ' esquadrão(ões) enviado(s).', 'ok', 'scav'); sent = true;
      } catch (e) { pushLog('Coleta: envio em massa falhou (' + (e.message || e) + ').', 'err', 'scav'); }
    }
    config.scav.stats = config.scav.stats || {};
    config.scav.stats.active = Object.keys(activeSet).length;
    let next;
    if (sent) next = now + 15000; else if (runningEnds.length) next = Math.min.apply(null, runningEnds) + 8000; else next = now + 300000;
    config.scav.nextAt = next; save();
    refreshCards('scav'); refreshDaily('scav', config.scav, 'coleta', 'scavenge');
    scheduleScav();
  }
  function scheduleScav() { clearTimeout(scavTimer); if (!config.scav.running) return; scavTimer = setTimeout(scavTick, Math.min(Math.max((config.scav.nextAt || 0) - Date.now(), 1000), 60000)); }

  let _farmPagesInfo = null;   // diagnóstico: quantas páginas do assistente foram lidas no último ciclo
  // Memoria curta do assistente, COMPARTILHADA entre os modulos.
  //
  // Saque, Muralha e Mapa liam a lista inteira cada um por conta — e ela e paginada, entao
  // cada leitura sao varias requisicoes. Medido na conta do usuario: 22 leituras de am_farm
  // por MINUTO, ~1.320/h. Como os tres rodam em ciclos que se cruzam, quase sempre estao
  // olhando o mesmo estado com segundos de diferenca.
  // 90s e curto o bastante pra nao perder relatorio recem-chegado e longo o bastante pra
  // fundir as leituras dos tres num ciclo. Quem precisa do dado fresco passa forcar=true.
  const FARM_ALVOS_TTL_MS = 90000;
  let _farmAlvosCache = null, _farmAlvosAt = 0, _farmAlvosVoo = null;

  async function getFarmTargetsCached(vid, forcar) {
    const agora = Date.now();
    if (!forcar && _farmAlvosCache && (agora - _farmAlvosAt) < FARM_ALVOS_TTL_MS) return _farmAlvosCache;
    // Se ja ha uma leitura em voo, espera ELA em vez de abrir outra: sem isto, dois modulos
    // que acordam juntos disparam duas leituras completas antes de qualquer cache existir.
    if (_farmAlvosVoo) return _farmAlvosVoo;
    _farmAlvosVoo = getFarmTargets(vid).then((r) => {
      _farmAlvosCache = r; _farmAlvosAt = Date.now(); _farmAlvosVoo = null; return r;
    }, (e) => { _farmAlvosVoo = null; throw e; });
    return _farmAlvosVoo;
  }

  async function getFarmTargets(vid) {
    const rows = [], seen = {};
    // Ordenação fixa por distância em todas as páginas — é o que os próprios links de paginação
    // do jogo usam. Não corrige um bug medido: testado ao vivo, ler página 0 e 1 com 600ms de
    // intervalo dá zero sobreposição com ou sem o parâmetro. É garantia de que a lista não
    // reordene entre as requisições se uma delas demorar (relatório chegando, ataque pousando),
    // caso em que um alvo escorregaria pra página já lida e sumiria em silêncio.
    // Efeito colateral bem-vindo: os alvos vêm do mais perto pro mais longe.
    const fetchPage = async (n) => {
      const url = '/game.php?village=' + vid + '&screen=am_farm&order=distance&dir=asc'
        + (n > 0 ? ('&Farm_page=' + n) : '');
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('assistente página ' + n + ': HTTP ' + res.status);
      return new DOMParser().parseFromString(await res.text(), 'text/html');
    };
    const parseDoc = (doc) => {
    doc.querySelectorAll('#plunder_list tr[id^="village_"]').forEach((tr) => {
      const targetId = tr.id.replace('village_', '');
      if (seen[targetId]) return;   // mesma aldeia repetida entre páginas
      const rl = tr.querySelector('a[href*="view="]');
      let reportId = null, coord = '';
      if (rl) { const m = rl.getAttribute('href').match(/view=(\d+)/); if (m) reportId = m[1]; const cmm = (rl.textContent || '').match(/(\d+)\|(\d+)/); if (cmm) coord = cmm[1] + '|' + cmm[2]; }   // normaliza p/ "x|y" (o texto vem "(x|y) Kxx")
      const vals = tr.querySelectorAll('span.res, span.warn');
      const nums = Array.prototype.slice.call(vals, 0, 3).map((s) => parseInt((s.textContent || '').replace(/\D/g, ''), 10) || 0);
      const resTd = tr.querySelector('td[colspan="3"]');
      const dateTd = resTd ? resTd.previousElementSibling : null;   // coluna "Tempo" (último relatório)
      const reportAt = dateTd ? parseReportDate(dateTd.textContent) : null;
      const wallTd = resTd ? resTd.nextElementSibling : null;
      const distTd = wallTd ? wallTd.nextElementSibling : null;
      const wall = wallTd ? (parseInt((wallTd.textContent || '').replace(/\D/g, ''), 10) || 0) : null;
      let dist = null;
      if (distTd) { const dm = (distTd.textContent || '').replace(',', '.').match(/[\d.]+/); if (dm) dist = parseFloat(dm[0]); }
      const cA = tr.querySelector('.farm_icon_c');
      const cEnabled = !!(cA && !cA.classList.contains('farm_icon_disabled') && !cA.classList.contains('start_locked') && cA.getAttribute('data-units-forecast'));
      const iconOk = (el) => !!(el && !el.classList.contains('farm_icon_disabled') && !el.classList.contains('start_locked'));
      const aEnabled = iconOk(tr.querySelector('.farm_icon_a'));
      const bEnabled = iconOk(tr.querySelector('.farm_icon_b'));
      const dotImg = tr.querySelector('img[src*="/dots/"]');
      const dm2 = dotImg ? (dotImg.getAttribute('src') || '').match(/dots\/(\w+)\./) : null;
      const color = dm2 ? dm2[1] : '';                                  // green | yellow | red | blue
      const mlImg = tr.querySelector('img[src*="/max_loot/"]');
      const mm = mlImg ? (mlImg.getAttribute('src') || '').match(/max_loot\/(\d)/) : null;
      const full = mm ? (mm[1] === '1') : false;                        // true = cheio, false = vazio
      seen[targetId] = 1;
      rows.push({ targetId: targetId, reportId: reportId, reportAt: reportAt, wood: nums[0] || 0, stone: nums[1] || 0, iron: nums[2] || 0, wall: wall, dist: dist, cEnabled: cEnabled, aEnabled: aEnabled, bEnabled: bEnabled, color: color, full: full, coord: coord });
    });
    };
    // O assistente PAGINA (teto de 100 linhas por página). Lendo só a primeira, os alvos das páginas
    // seguintes ficavam invisíveis e a tropa sobrava parada. Segue a paginação até o fim.
    const doc0 = await fetchPage(0);
    parseDoc(doc0);
    const pages = new Set();
    doc0.querySelectorAll('a[href*="Farm_page="]').forEach((a) => {
      const m = (a.getAttribute('href') || '').match(/Farm_page=(\d+)/);
      if (m) { const p = parseInt(m[1], 10); if (p > 0) pages.add(p); }
    });
    const extras = Array.from(pages).sort((a, b) => a - b).slice(0, 14);   // teto de segurança
    let lidas = 1;
    for (const p of extras) {
      try { parseDoc(await fetchPage(p)); lidas++; await sleep(200); } catch (e) { break; }
    }
    _farmPagesInfo = { pages: lidas, achadas: extras.length + 1, alvos: rows.length };
    return rows;
  }

  // Tabela de estatísticas do Saque. Ordenada por cavalaria parada (decrescente): a primeira linha
  // é sempre a aldeia que mais tem tropa ociosa, que é a pergunta que se faz olhando isto.
  // Estatisticas do Saque. Duas tabelas, porque sao duas perguntas diferentes:
  //   ALVOS   — quem pegou cada alvo (ou por que ninguem pegou). Um alvo vai pra UMA aldeia.
  //   ALDEIAS — quanta tropa esta parada em cada uma e por que ela nao trabalhou.
  function renderFarmEstat() {
    const box = document.getElementById('twmgr-farm-estat'); if (!box) return;
    const e = (config.farm && config.farm.estat) || null;
    if (!e) { box.innerHTML = '<div class="twmgr-hint">Rode um ciclo do Saque pra montar as estatisticas.</div>'; return; }
    const n = (v) => (v == null ? '\u2014' : fmtN(v));
    const idade = Math.round((Date.now() - e.at) / 1000);
    const cab = '<div class="twmgr-bld-sum">'
      + '<span class="twmgr-chip"><b>' + n(e.enviados) + '</b> enviados neste ciclo</span>'
      + '<span class="twmgr-chip"><b>' + n(e.emRota) + '</b> saques em rota</span>'
      + '<span class="twmgr-chip"><b>' + n(e.voltando) + '</b> voltando</span>'
      + '<span class="twmgr-chip"' + (e.alvosSemOrigem ? ' style="color:#b03030"' : '') + '><b>' + n(e.alvosSemOrigem) + '</b> alvos sem ninguem</span>'
      + '<span class="twmgr-chip"><b>' + n(e.clParada) + '</b> CL parada</span>'
      + '</div>';
    // ---- Tabela 1: os alvos deste ciclo ----
    const alvos = e.alvos || [];
    const tAlvos = !alvos.length
      ? '<div class="twmgr-hint">Nenhum alvo elegivel neste ciclo.</div>'
      : '<table class="twmgr-bld-tab"><thead><tr>'
        + '<th style="width:66px">Alvo</th>'
        + '<th style="width:34px" title="Modo do template usado">modo</th>'
        + '<th>Quem atacou</th>'
        + '<th style="width:42px" title="Distancia da aldeia que atacou ate o alvo, em campos">dist</th>'
        + '</tr></thead><tbody>'
        + alvos.map((a, i) =>
          '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">'
          + '<td><b>' + esc(a.coord) + '</b></td>'
          + '<td style="text-transform:uppercase">' + esc(a.modo || '') + '</td>'
          + '<td>' + (a.quem
              ? '<span style="color:#3f8f52">' + esc(a.quem) + '</span>'
              : a.incerto
                ? '<span style="color:#b5651d">resposta ambigua \u2014 tratado como enviado</span>'
                : '<span style="color:#b03030">ninguem</span>'
                  + '<div class="sub">' + (a.tentadas && a.tentadas.length
                      ? 'tentei ' + esc(a.tentadas.map((x) => x.nome + ' (' + x.motivo + ')').join(', '))
                        + (a.maisTentadas ? ' +' + a.maisTentadas : '')
                      : 'nenhuma das ' + a.candidatos + ' aldeias no alcance serviu') + '</div>')
            + '</td>'
          + '<td>' + (a.dist != null ? a.dist : '\u2014') + '</td></tr>').join('')
        + '</tbody></table>';
    // ---- Tabela 2: as aldeias ----
    const linhas = (e.origens || []);
    const tAld = '<table class="twmgr-bld-tab"><thead><tr>'
      + '<th>Aldeia</th>'
      + '<th style="width:52px" title="Cavalaria leve parada em casa">CL parada</th>'
      + '<th style="width:38px" title="Saques desta aldeia a caminho do alvo, agora">indo</th>'
      + '<th style="width:38px" title="Saques voltando pra esta aldeia, agora — e a carga chegando">voltando</th>'
      + '<th style="width:58px" title="Capacidade de carga que ESTA aldeia despachou hoje. Nao e saque medido: o jogo so publica saque da conta inteira, nunca por aldeia.">carga hoje</th>'
      + '<th style="width:58px" title="Projecao do fim do dia pela mesma regra de tres da previsao da conta: carga de hoje dividida pela fracao do dia ja decorrida.">previsao</th>'
      + '<th style="width:34px" title="Ataques que sairam daqui neste ciclo">saiu</th>'
      + '<th style="width:46px" title="Distancia ate o alvo elegivel mais proximo, em campos">alvo +perto</th>'
      + '<th title="Por que nao enviou">situacao</th></tr></thead><tbody>'
      + linhas.map((l, i) => {
        const ocioso = (l.cl || 0) >= 300 && !l.enviou;
        let sit;
        if (l.enviou) sit = '<span style="color:#3f8f52">trabalhou</span>';
        else if (!l.alcance) sit = 'sem alvo no alcance (' + e.maxDist + ' campos)';
        else if (l.motivo) sit = '<span style="color:#b03030">' + esc(l.motivo) + '</span>'
          + (l.rejeicoes > 1 ? ' <span class="sub">(' + l.rejeicoes + '\u00d7)</span>' : '');
        else if (!l.consultada) sit = 'nem foi consultada \u2014 outra aldeia pegou o alvo antes';
        else sit = 'consultada, mas o alvo ja tinha dono';
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">'
          + '<td><b>' + esc(l.nome) + '</b>' + (l.nome !== l.coord ? '<div class="sub">' + esc(l.coord || '') + '</div>' : '') + '</td>'
          + '<td' + (ocioso ? ' style="color:#b03030;font-weight:700"' : '') + '>' + n(l.cl) + '</td>'
          + '<td>' + (l.saindo || '<span style="color:#8a7340">\u2014</span>') + '</td>'
          + '<td>' + (l.voltando || '<span style="color:#8a7340">\u2014</span>') + '</td>'
          + '<td>' + (l.capHoje ? n(l.capHoje) : '<span style="color:#8a7340">\u2014</span>') + '</td>'
          + '<td' + (l.capPrev ? ' style="color:#2e7d3a;font-weight:600"' : '') + '>' + (l.capPrev ? n(l.capPrev) : '<span style="color:#8a7340">\u2014</span>') + '</td>'
          + '<td>' + (l.enviou ? '<b style="color:#3f8f52">' + l.enviou + '</b>' : '<span style="color:#8a7340">\u2014</span>') + '</td>'
          + '<td>' + (l.distMin != null ? l.distMin : '\u2014') + '</td>'
          + '<td style="font-size:9px;color:#6f6153">' + sit + '</td></tr>';
      }).join('') + '</tbody></table>';
    box.innerHTML = cab
      + '<div style="font-size:9px;color:#8a7d6d;margin:0 0 7px">Foto do ultimo ciclo, ha ' + idade + 's. '
      + 'Cada alvo vai pra <b>UMA</b> aldeia \u2014 a mais proxima que tiver tropa. As outras nem sao consultadas.<br>'
      + '<b>carga hoje</b> e <b>previsao</b> sao capacidade de transporte despachada, nao saque medido: '
      + 'o jogo so publica saque da conta inteira, nunca por aldeia. Servem pra comparar aldeias entre si.</div>'
      + '<div style="font-size:10px;color:#8b5426;font-weight:600;margin:8px 0 3px">Alvos deste ciclo</div>' + tAlvos
      + '<div style="font-size:10px;color:#8b5426;font-weight:600;margin:11px 0 3px">Aldeias</div>' + tAld;
  }

  // Lê a tela de comandos (só ataques): coords com ataque nosso em rota (p/ não empilhar) + nº de ATAQUES DE SAQUE em rota (ícone de farm) p/ o card.
  async function getPendingAttack() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=commands&type=attack&page=-1', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const coords = new Set(); let saques = 0; const farmCoords = new Set();
    // POR ORIGEM: a 2ª coluna é a aldeia de onde o comando saiu ("Josh (453|596) K54"). Sem isso
    // só dava pra dizer "672 ataques em rota" — número da conta inteira, que não ajuda a decidir
    // nada sobre uma aldeia específica.
    const porOrigem = {};
    doc.querySelectorAll('#commands_table tr').forEach((tr) => {
      const label = tr.querySelector('.quickedit-label'); if (!label) return;
      const m = (label.textContent || '').match(/\((\d+)\|(\d+)\)/); const coord = m ? m[1] + '|' + m[2] : null;
      if (coord) coords.add(coord);
      const ehFarm = !!tr.querySelector('img[src*="command/farm"]');   // ícone farm.webp = ataque de saque
      if (ehFarm) { saques++; if (coord) farmCoords.add(coord); }
      const tds = tr.querySelectorAll('td');
      const om = tds[1] ? (tds[1].textContent || '').match(/\((\d+)\|(\d+)\)/) : null;
      if (om) {
        const oc = om[1] + '|' + om[2];
        const o = porOrigem[oc] || (porOrigem[oc] = { total: 0, farm: 0 });
        o.total++; if (ehFarm) o.farm++;
      }
    });
    return { coords: coords, saques: saques, farmCoords: farmCoords, porOrigem: porOrigem };
  }

  // Ataques VOLTANDO. Mesma tela dos comandos, outro `type` — uma requisição, e é o número que
  // responde "quanta tropa está no caminho de casa" sem abrir aldeia por aldeia.
  async function getReturningAttack() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=commands&type=return&page=-1', { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    let total = 0, saques = 0;
    // Na volta a 2ª coluna é a aldeia PRA ONDE a tropa está voltando — mesma estrutura da ida.
    const porOrigem = {};
    doc.querySelectorAll('#commands_table tr').forEach((tr) => {
      if (!tr.querySelector('.quickedit-label')) return;
      total++;
      const ehFarm = !!tr.querySelector('img[src*="command/farm"], img[src*="return_attack"]');
      if (ehFarm) saques++;
      const tds = tr.querySelectorAll('td');
      const om = tds[1] ? (tds[1].textContent || '').match(/\((\d+)\|(\d+)\)/) : null;
      if (om) {
        const oc = om[1] + '|' + om[2];
        const o = porOrigem[oc] || (porOrigem[oc] = { total: 0, farm: 0 });
        o.total++; if (ehFarm) o.farm++;
      }
    });
    return { total: total, saques: saques, porOrigem: porOrigem };
  }
  // Tropa EM CASA de TODAS as aldeias, numa requisição só. A coluna de cada unidade é descoberta
  // pelo ícone do cabeçalho, não por posição fixa: mundo com 10 unidades e mundo com 12 têm
  // colunas diferentes, e contar na mão quebraria num deles.
  async function getHomeUnitsAll() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=units&type=home&page=-1', { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const idx = {};
    doc.querySelectorAll('#units_table thead th, table.vis thead th').forEach((th, i) => {
      const img = th.querySelector('img'); if (!img) return;
      const m = (img.getAttribute('src') || '').match(/unit_(\w+)\./);
      if (m) idx[m[1]] = i;
    });
    const out = {};
    doc.querySelectorAll('#units_table tbody tr, table.vis tbody tr').forEach((tr) => {
      const tds = tr.querySelectorAll('td'); if (tds.length < 4) return;
      const lbl = tds[0].querySelector('.quickedit-vn[data-id], .quickedit[data-id]');
      const vid = lbl ? lbl.getAttribute('data-id') : null; if (!vid) return;
      const u = {};
      Object.keys(idx).forEach((k) => { u[k] = parseInt((tds[idx[k]] || {}).textContent, 10) || 0; });
      out[String(vid)] = u;
    });
    return out;
  }

  // "Minha pontuação hoje" do ranking Em um dia (type: loot_res = saqueado, scavenge = coletado). Cache por type.
  // Cache das estatísticas diárias PERSISTIDO no localStorage: o TTL de 5 min precisa sobreviver a
  // reloads de página (senão o init refazia 2 fetches de ranking por carregamento -> acende o botschutz).
  const _dailyCache = {};
  const DAILYKEY = KEY + '_daily';
  function _dailyRead(type) {
    if (_dailyCache[type]) return _dailyCache[type];
    try { const all = JSON.parse(localStorage.getItem(DAILYKEY) || '{}'); if (all[type]) { _dailyCache[type] = all[type]; return all[type]; } } catch (e) {}
    return null;
  }
  function _dailyWrite(type, entry) {
    _dailyCache[type] = entry;
    try { const all = JSON.parse(localStorage.getItem(DAILYKEY) || '{}'); all[type] = entry; localStorage.setItem(DAILYKEY, JSON.stringify(all)); } catch (e) {}
  }
  // Segundos desde a meia-noite DO SERVIDOR. Usado pra zerar o acumulador diário exatamente quando o
  // jogo zera o "saqueado hoje" — quando o relógio anda pra trás, virou o dia.
  function serverSecOfDay() {
    const et = document.querySelector('#serverTime');
    const tm = et ? (et.textContent || '').match(/(\d{2}):(\d{2}):(\d{2})/) : null;
    return tm ? ((+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3])) : null;
  }
  // Soma a capacidade de carga enviada hoje, pra comparar com o saque obtido (eficiência real).
  function addDailyCap(cfg, cap, atks) {
    const sec = serverSecOfDay();
    const d = cfg.dailyCap || { sec: sec, startSec: sec, cap: 0, atks: 0 };
    // virou o dia no servidor -> zera e marca que agora a contagem cobre o dia desde o começo
    if (sec != null && d.sec != null && sec < d.sec) { d.cap = 0; d.atks = 0; d.startSec = sec; }
    d.sec = (sec != null ? sec : d.sec);
    if (d.startSec == null) d.startSec = sec;
    d.cap = (d.cap || 0) + (cap || 0);
    d.atks = (d.atks || 0) + (atks || 0);
    cfg.dailyCap = d;
  }
  // Mesma contabilidade, POR ALDEIA. O saque real por aldeia não existe no jogo (a pontuação
  // "hoje" do ranking é da conta inteira), então a base honesta é a CAPACIDADE DE CARGA que cada
  // aldeia despachou no dia: é o que ela mandou buscar. A previsão extrapola por regra de três
  // no tempo decorrido, exatamente como a previsão da conta faz.
  function addDailyCapVila(cfg, porVila) {
    const sec = serverSecOfDay();
    const d = cfg.dailyCapVila || { sec: sec, vilas: {} };
    if (sec != null && d.sec != null && sec < d.sec) d.vilas = {};   // virou o dia no servidor
    d.sec = (sec != null ? sec : d.sec);
    d.vilas = d.vilas || {};
    Object.keys(porVila || {}).forEach((vid) => {
      const v = d.vilas[vid] || (d.vilas[vid] = { cap: 0, atks: 0 });
      v.cap += porVila[vid].cap || 0;
      v.atks += porVila[vid].atks || 0;
    });
    cfg.dailyCapVila = d;
  }
  // Fração do dia já decorrida no servidor. < 10 min não extrapola: com denominador minúsculo a
  // projeção vira número absurdo (é a mesma trava da previsão da conta).
  function fracaoDoDia() {
    const et = document.querySelector('#serverTime');
    const tm = et ? (et.textContent || '').match(/(\d{2}):(\d{2}):(\d{2})/) : null;
    const seg = tm ? ((+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3])) : 0;
    return seg >= 600 ? (seg / 86400) : null;
  }
  async function getDailyLootStats(type) {
    const c = _dailyRead(type);
    if (c && (Date.now() - c.at) < 300000) return c.data;
    let today = null;
    try {
      const res = await fetch('/game.php?village=' + CUR_VID + '&screen=ranking&mode=in_a_day&type=' + type, { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const txt = ((doc.querySelector('#content_value') || doc.body).textContent || '').replace(/\s+/g, ' ');   // texto puro (sem tags/atributos com dígitos)
      const m = txt.match(/pontua[çc][ãa]o\s+hoje[^0-9]*?([\d.]+)/i);
      if (m) today = parseInt(m[1].replace(/\./g, ''), 10) || 0;
    } catch (e) {}
    // estimativa fim do dia: extrapola linear pelo tempo decorrido desde a meia-noite do servidor
    let estimate = null;
    if (today != null) {
      const et = document.querySelector('#serverTime');
      const tm = et ? (et.textContent || '').match(/(\d{2}):(\d{2}):(\d{2})/) : null;
      const segDia = tm ? ((+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3])) : 0;
      if (segDia >= 600) estimate = Math.round(today / (segDia / 86400));
    }
    const data = { today: today, estimate: estimate };
    _dailyWrite(type, { at: Date.now(), data: data });
    return data;
  }

  async function sendFarmC(vid, reportId) {
    const b = new URLSearchParams(); b.set('report_id', String(reportId)); b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + vid + '&screen=am_farm&mode=farm&ajaxaction=farm_from_report&json=1', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'TribalWars-Ajax': '1', 'X-Requested-With': 'XMLHttpRequest' }, body: b.toString() });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (j && j.error) throw new Error(Array.isArray(j.error) ? j.error.join('; ') : String(j.error));
    return true;
  }

  function ramsForWall(w, ramWall6) {
    if (w <= 0) return 0;
    const base = (x) => Math.pow(1.09, x) * (4 * x - 2) + 0.5;   // fórmula oficial (nº de níveis)
    return Math.ceil(base(w) * ((ramWall6 || 24) / base(6)));    // calibrado no dado do usuário (muro 6)
  }
  // Relatório: soma o total de tropas do defensor. 0 = aldeia comprovadamente vazia.
  // LANÇA se não conseguir ler — antes devolvia 0 em QUALQUER exceção (rede oscilando, seletor
  // mudado, sessão caída), e "não consegui ler" virava "aldeia vazia": o saque ia contra um azul
  // defendido e perdia tropa. Quem chama tem que pular o alvo quando não dá pra saber.
  async function getReportDefenseTotal(reportId) {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=report&view=' + reportId, { credentials: 'include' });
    if (!res.ok) throw new Error('relatório ' + reportId + ': HTTP ' + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tbl = doc.querySelector('#attack_info_def_units') || doc.querySelector('#attack_spy_away') || doc.querySelector('#attack_info_def');
    if (!tbl) {
      // Sem NENHUMA das três tabelas: ou a página não é um relatório (sessão/bloqueio), ou o
      // formato mudou. Nos dois casos, não dá pra afirmar que a aldeia está vazia.
      if (!/id="attack_info|class="report/.test(html)) throw new Error('relatório ' + reportId + ': resposta não parece um relatório');
      throw new Error('relatório ' + reportId + ': não achei a tabela de defesa');
    }
    const cells = tbl.querySelectorAll('td.unit-item, .unit-item');
    let total = 0; cells.forEach((c) => { total += parseInt((c.textContent || '').replace(/\D/g, ''), 10) || 0; });
    return total;
  }
  async function farmTick() {
    clearTimeout(farmTimer);
    if (!config.farm.running) return;
    if (lockOther()) { farmTimer = setTimeout(farmTick, 5000); return; }
    if (captchaBlocked()) { farmTimer = setTimeout(farmTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.farm.nextAt || 0) > now) { scheduleFarm(); return; }
    const cfg = config.farm;
    // Origens = minhas aldeias com coordenada (pra escolher a mais próxima por alvo).
    let mine;
    try {
      // `name: x.name || x.coord` — antes era `name: x.coord` cravado, e o nome REAL da aldeia
      // (que getVillagesInGroup já devolve) era jogado fora. Todo lugar que mostra origem com
      // filtro de grupo ligado exibia coordenada crua, inclusive as estatísticas e os logs.
      if (cfg.group) { mine = (await getVillagesInGroup(cfg.group)).map((x) => ({ vid: x.vid, coord: x.coord, name: x.name || x.coord })); try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
      else mine = await getAllVillagesCached();
    } catch (e) { pushLog('Saque: erro ao listar aldeias: ' + (e.message || e), 'err', 'farm'); cfg.nextAt = now + 120000; save(); scheduleFarm(); return; }
    const myV = [], semCoord = [];
    mine.forEach((v) => {
      const m = (v.coord || '').match(/(\d+)\|(\d+)/);
      if (m) myV.push({ vid: v.vid, name: v.name || v.coord, coord: v.coord, x: +m[1], y: +m[2] });
      else semCoord.push(v.vid);
    });
    // Diagnóstico: se a contagem mudou vs o último ciclo, avisa (ajuda a pegar cache stale do overview_villages).
    const grpTxt = cfg.group ? (' (grupo ' + cfg.group + ')') : ' (todas)';
    const lastCount = (cfg.stats && cfg.stats.mineCountRaw) || 0;
    if (lastCount && lastCount !== mine.length) pushLog('Saque: ⚠ nº de aldeias' + grpTxt + ' mudou de ' + lastCount + ' → ' + mine.length + '.', '', 'farm');
    if (semCoord.length) pushLog('Saque: ' + semCoord.length + ' aldeia(s) sem coord ignoradas — vids: ' + semCoord.slice(0, 5).join(','), 'err', 'farm');
    cfg.stats = cfg.stats || {}; cfg.stats.mineCount = myV.length; cfg.stats.mineCountRaw = mine.length;
    let pendingCoords = new Set(), saquesAtivos = null, farmCoords = new Set();
    let saidaPorOrigem = {};
    try { const pa = await getPendingAttack(); pendingCoords = pa.coords; saquesAtivos = pa.saques; farmCoords = pa.farmCoords || new Set(); saidaPorOrigem = pa.porOrigem || {}; } catch (e) {}
    // DIAGNÓSTICO: mais comandos de saque em rota do que alvos distintos = tem ataque duplicado no
    // mesmo alvo. Com "Repetir farm" desligado isso NÃO deveria acontecer, e indica que um envio deu
    // certo mas foi lido como recusa (aí o ciclo tenta outra origem e manda de novo no mesmo lugar).
    if (!cfg.repeat && saquesAtivos != null && farmCoords.size && saquesAtivos > farmCoords.size) {
      pushLog('Saque: ⚠ ' + saquesAtivos + ' comando(s) de saque em rota para apenas ' + farmCoords.size + ' alvo(s) distinto(s) — há ' + (saquesAtivos - farmCoords.size) + ' ataque(s) DUPLICADO(S).', 'err', 'farm');
    }
    const minW = cfg.minWood || 0, minS = cfg.minStone || 0, minI = cfg.minIron || 0;
    const maxDist = cfg.maxDist != null ? cfg.maxDist : 13;
    const maxWall = cfg.maxWall != null ? cfg.maxWall : 20;
    const blueMaxWall = cfg.blueMaxWall != null ? cfg.blueMaxWall : 0;
    const delayBase = cfg.mode === 'agressivo' ? 200 : 500;
    const repeatOn = !!cfg.repeat;
    const repeatMs = Math.max(0, cfg.repeatMin || 0) * 60000;
    const minCL = cfg.minCL || 0, dyn = !!cfg.dynTemplate, M = cfg.matrix || {};
    // RESERVA: quanto tem que SOBRAR na aldeia. Diferente do "mín. cav. leve", que só decide se a
    // origem entra: com mínimo 50 e envio de 5, uma aldeia com 52 passava no mínimo e ia pra 47.
    // A reserva desconta ANTES de comparar, então o piso é de verdade.
    const resCL = Math.max(0, cfg.clReserve || 0), resSpy = Math.max(0, cfg.spyReserve || 0);
    const livre = (a, u) => Math.max(0, (a[u] || 0) - (u === 'light' ? resCL : u === 'spy' ? resSpy : 0));
    const sent = cfg.sentReports || {}, defended = cfg.defended || {};
    // "Saques ativos agora": poda os que já pousaram (destino sumiu da lista de comandos) + os muito antigos.
    cfg.activeSends = (cfg.activeSends || []).filter((s) => pendingCoords.has(s.coord) && (now - (s.at || 0) < 12 * 3600 * 1000));
    const cellFor = (t) => {
      if (t.color === 'red') return null;
      if (t.color === 'blue') return M.blue;
      if (t.color === 'green') return t.full ? M.greenFull : M.greenEmpty;
      if (t.color === 'yellow') return t.full ? M.yellowFull : M.yellowEmpty;
      return null;
    };
    const colorTxt = (t) => ({ green: 'verde', yellow: 'amarelo', blue: 'azul', red: 'vermelho' }[t.color] || t.color) + (t.full ? ' cheio' : ' vazio');
    // Lê os alvos (assistente = conta inteira) e os templates uma vez só.
    let targets;
    try { targets = await getFarmTargetsCached(CUR_VID, true); }
    catch (e) { pushLog('Saque: erro ao ler os alvos do assistente (' + (e.message || e) + ').', 'err', 'farm'); cfg.nextAt = now + 120000; save(); scheduleFarm(); return; }
    if (_farmPagesInfo && _farmPagesInfo.pages > 1) pushLog('Saque: assistente tem ' + _farmPagesInfo.pages + ' página(s) — ' + _farmPagesInfo.alvos + ' alvo(s) no total.', '', 'farm');
    let tpl = null;
    if (!dyn) { try { tpl = await getFarmTemplates(CUR_VID); } catch (e) { tpl = null; } }
    // Sem as unidades dos templates não dá pra saber se a origem tem tropa, e o ciclo cai no
    // "tenta e deixa o servidor recusar" — o que enche o log de recusa e gasta requisição à toa.
    if (!dyn) {
      const nA = (tpl && tpl.unitsA) ? Object.keys(tpl.unitsA).length : 0;
      const nB = (tpl && tpl.unitsB) ? Object.keys(tpl.unitsB).length : 0;
      if (!nA && !nB) pushLog('Saque: ⚠ não li as unidades dos templates A/B do assistente — sem pré-checagem de tropa. Espere muitas recusas de "unidades insuficientes". [ids: A=' + ((tpl && tpl.a) || '?') + ' B=' + ((tpl && tpl.b) || '?') + ' · como achei: ' + (((tpl && tpl.debug) || []).join(', ') || 'nada') + ']', 'err', 'farm');
      else if (!nA || !nB) pushLog('Saque: ⚠ li as unidades de só um template (A=' + nA + ' unid., B=' + nB + ' unid.) — o outro fica sem pré-checagem.', 'err', 'farm');
    }
    // População de cada template + pontos das aldeias = dá pra saber ANTES quais origens são grandes
    // demais pro template (limite de fake do mundo). 0 = desconhecido -> checagem proativa desligada,
    // e sobra só o freio reativo (que aprende com o primeiro erro).
    const tplPop = { a: 0, b: 0 };
    // Ataque SÓ de explorador é isento do limite de fake (regra do jogo: olheiro sozinho sempre pode
    // sair, não importa o tamanho da origem). Sem isso o script "consertava" um template de
    // reconhecimento somando cavalaria que o jogo nem exigia.
    const tplOnlySpy = { a: false, b: false };
    let vPoints = null;
    const fakePct = FAKE_LIMIT_PCT;
    if (!dyn && tpl) {
      const popOf = (u) => Object.keys(u || {}).reduce((s, k) => s + (parseInt(u[k], 10) || 0) * (FAKE_POP[k] || 1), 0);
      const soSpy = (u) => { const ks = Object.keys(u || {}).filter((k) => (parseInt(u[k], 10) || 0) > 0); return ks.length > 0 && ks.every((k) => k === 'spy'); };
      tplPop.a = popOf(tpl.unitsA); tplPop.b = popOf(tpl.unitsB);
      tplOnlySpy.a = soSpy(tpl.unitsA); tplOnlySpy.b = soSpy(tpl.unitsB);
      if (tplPop.a || tplPop.b) {
        try { vPoints = await getVillagePoints(); } catch (e) { vPoints = null; }
        pushLog('Saque: limite de fake ativo — template A=' + tplPop.a + ' pop' + (tplOnlySpy.a ? ' (só explorador: isento)' : '') + ', B=' + tplPop.b + ' pop' + (tplOnlySpy.b ? ' (só explorador: isento)' : '') + '; origem precisa de ' + fakePct + '% dos pontos dela.', '', 'farm');
      }
    }
    const availCache = {};
    const getAvail = async (vid) => { if (!availCache[vid]) { try { availCache[vid] = (await getVillageStateReserved(vid)).avail || {}; } catch (e) { availCache[vid] = {}; } } return availCache[vid]; };
    const skip = { norep: 0, off: 0, red: 0, azul: 0, def: 0, mur: 0, pend: 0, semorig: 0, dist: 0 };
    // ===== Diagnóstico POR ORIGEM =====
    // O módulo é alvo-cêntrico: pra cada alvo ele varre as origens mais próximas e usa a primeira
    // que passa. Quando nenhuma passa, o contador `semorig` subia e o log dizia "acabou a
    // cavalaria" — mas esse é só UM dos motivos possíveis, e as outras razões (piso de população
    // do mundo, reserva da aldeia, mínimo de CL, falta de explorador) desapareciam sem registro.
    // Daí a pergunta que não tinha resposta: "por que essa aldeia não mandou nada?".
    //
    // Aqui cada REJEIÇÃO de origem é contada com o motivo, e cada envio é creditado à origem.
    const oDiag = {};   // vid -> { nome, enviou, semCL, reserva, semSpy, semTpl, fakeSemPontos, fakeSemTropa, recusa }
    // Um alvo é entregue a UMA aldeia — a mais próxima que passar em tudo, e o laço para nela.
    // Aqui fica QUEM pegou cada alvo e, quando ninguém pegou, quais origens foram tentadas e por
    // que cada uma foi recusada. Responde "esse alvo é tentado por todo mundo?" (não é) e
    // "por que esse alvo ficou sem ninguém?".
    const alvoDiag = [];
    const MOT_CURTO = { semCL: 'sem CL', reserva: 'reserva', semSpy: 'sem explorador',
      semTpl: 'sem tropa do template', fakeSemTropa: 'sem tropa p/ o piso', fakeSemPontos: 'sem pontos', recusa: 'recusado' };
    const oReg = (vid, nome, campo) => {
      const o = oDiag[vid] || (oDiag[vid] = { nome: nome || vid, enviou: 0, semCL: 0, reserva: 0,
        semSpy: 0, semTpl: 0, fakeSemPontos: 0, fakeSemTropa: 0, recusa: 0 });
      o[campo]++;
      // Também entra na trilha DO ALVO da vez, pra tabela poder mostrar "tentei estas 3, recusadas
      // por isto" em vez de só um total agregado que não explica alvo nenhum.
      if (campo !== 'enviou') _tent.push({ nome: nome || vid, motivo: MOT_CURTO[campo] || campo });
    };
    let _tent = [];
    const eligible = [];
    targets.forEach((t) => {
      if (!t.reportId) { skip.norep++; return; }
      if (t.color === 'red') { skip.red++; return; }
      if (t.wall != null && t.wall > maxWall) { skip.mur++; return; }
      const cell = cellFor(t);
      if (!cell || !cell.mode || cell.mode === 'none') { skip.off++; return; }
      if (t.color === 'blue' && (t.wall == null || t.wall > blueMaxWall)) { skip.azul++; return; }
      t._cell = cell; eligible.push(t);
    });
    if ((cfg.order || 'dist') === 'recurso') eligible.sort((a, b) => (b.wood + b.stone + b.iron) - (a.wood + a.stone + a.iron));
    else eligible.sort((a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist));
    let count = 0, errs = 0;   // errs = envios recusados APÓS a origem passar na pré-checagem de tropa
    let _farmSaveAt = 0;       // throttle da gravação imediata do carimbo de envio
    let incertos = 0, calcCount = 0;   // envios de resultado ambíguo · envios subidos ao mínimo do mundo
    let lastCalcTxt = '';              // último envio no mínimo (mostrado no painel como amostra)
    let capCycle = 0;                  // capacidade de carga total despachada neste ciclo
    const capVila = {};                // vid -> { cap, atks } despachado neste ciclo
    // Limite de fake do mundo: o ataque precisa ter no mínimo (pontos da ORIGEM × pct)% de população.
    // Quem estoura isso é a origem grande, não o alvo — então o bloqueio é por origem+modo e vale pro
    // ciclo todo. Assim uma aldeia grande demais pro template B é descartada após UM erro, não a cada alvo.
    const fakeBlock = {};
    const errReasons = {};     // motivo -> quantas vezes (pra saber POR QUE recusou, não só quantas)
    // Barra de progresso do ciclo: UMA linha de log que se atualiza conforme percorre os alvos e, no
    // fim, vira o extrato. Throttle de 400ms pra não redesenhar o log a cada aldeia.
    let _barAt = 0;
    if (eligible.length) setFarmProg(farmProgHTML(0, eligible.length, 'mapeados ' + eligible.length + ' alvo(s)'));
    const tickBar = (done, force) => {
      if (!eligible.length) return;
      const ts = Date.now();
      if (!force && ts - _barAt < 400) return;
      _barAt = ts;
      setFarmProg(farmProgHTML(done, eligible.length, '✔ ' + count + ' enviado(s)' + (errs ? (' · ✖ ' + errs + ' recusa(s)') : '')));
    };
    for (const [idx, t] of eligible.entries()) {
      const pare = devoParar('farm');
      if (pare) { pushLog('Saque: ciclo interrompido — ' + pare + ' (' + idx + '/' + eligible.length + ' alvos percorridos).', '', 'farm'); break; }
      tickBar(idx);   // idx = quantos JÁ terminaram
      const cm = (t.coord || '').match(/(\d+)\|(\d+)/); if (!cm) continue;
      const tx = +cm[1], ty = +cm[2];
      // Blacklist do módulo Mapa. É o que dá efeito prático à lista: sem isto, marcar uma
      // aldeia como "tem defesa" só impediria o explorador de ir, e o Saque continuaria
      // mandando tropa pro mesmo lugar onde ela morre.
      if ((config.map.blacklistDefesa || {})[t.coord] || (config.map.blacklistPerda || {})[t.coord]) { skip.def++; continue; }
      if (t.color === 'blue') {
        // CACHE POR COORDENADA, e o ZERO tambem entra.
        //
        // Antes a chave era o reportId e so gravava quando havia defesa. Duas falhas que se
        // multiplicavam: aldeia vazia (a maioria) era relida TODO ciclo pra sempre, e o
        // reportId muda a cada saque — o proprio ato de farmar invalidava o cache que existe
        // pra evitar reler. Medido na conta do usuario: 92 leituras de relatorio por MINUTO,
        // ~5.520/h, e foi o que derrubou tudo em 429.
        // A pergunta certa e "esta ALDEIA tem defesa", nao "este RELATORIO tem defesa".
        // Defesa encontrada nao expira (tropa nao some porque o tempo passou); o zero vale
        // por algumas horas, tempo em que uma aldeia vazia dificilmente virou fortaleza.
        const dc = defended[t.coord];
        if (dc && (dc.defTotal > 0 || (now - (dc.at || 0)) < FARM_DEF_ZERO_TTL_MS)) {
          if (dc.defTotal > 0) { skip.def++; continue; }
        } else {
        // Não deu pra ler o relatório? PULA. Azul é o único que pode ter defesa; mandar sem saber
        // é o erro mais caro do módulo. Errar pra menos custa um saque; errar pra mais custa tropa.
        let defTotal = 0;
        try { defTotal = await getReportDefenseTotal(t.reportId); }
        catch (e) {
          skip.def++;
          errReasons['azul sem leitura de defesa: ' + String(e.message || e).slice(0, 60)] = (errReasons['azul sem leitura de defesa: ' + String(e.message || e).slice(0, 60)] || 0) + 1;
          continue;
        }
        defended[t.coord] = { at: now, coord: t.coord, x: tx, y: ty, defTotal: defTotal, wall: t.wall };
        if (defTotal > 0) {
          pushLog('⚠ ALERTA: ' + t.coord + ' tem ' + defTotal + ' tropa(s) de defesa (relatório azul) — registrado no intel', 'err', 'farm');
          skip.def++; continue;
        }
        }
      }
      const cell = t._cell, mode = cell.mode, qty = Math.max(1, cell.qty || 1);
      const sum = (t.wood || 0) + (t.stone || 0) + (t.iron || 0);
      // "Repetir farm" ligado: reataca por tempo (empilha ondas). Desligado: só se não tiver ataque a caminho.
      const inFlight = pendingCoords.has(t.coord);
      if (repeatOn) { if (sent[t.coord] && now - sent[t.coord] < repeatMs) { skip.pend++; continue; } }
      else { if (inFlight) { skip.pend++; continue; } if (sent[t.coord] && now - sent[t.coord] < 120000) { skip.pend++; continue; } }
      // C NÃO depende mais do ícone do assistente: ele reflete a aldeia ATUAL (CUR_VID), e com envio
      // pela origem mais próxima isso zerava o farm quando você abria numa aldeia DEF (sem CL). O envio
      // é feito por farm_from_report da origem escolhida; se ela não tiver tropa, o try/catch pula.
      if (mode === 'c' && !(t.wood >= minW && t.stone >= minS && t.iron >= minI)) { skip.off++; continue; }   // C: só exige relatório (já garantido) + recurso ≥ mínimo
      // Escolhe a aldeia MAIS PRÓXIMA (dentro do alcance) com CL suficiente.
      const cands = myV.map((s) => ({ s: s, d: fieldDist(s.x, s.y, tx, ty) })).filter((o) => o.d <= maxDist).sort((a, b) => a.d - b.d);
      if (!cands.length) { skip.dist++; continue; }
      const estCL = Math.max(1, Math.ceil((mode === 'b' ? sum * 1.2 : sum) / 80));   // CL estimada do envio (p/ descontar da origem)
      let did = false, usedName = '', usedDist = 0, incerto = false, usedCalc = false, usedCalcInfo = '';
      _tent = [];                       // trilha deste alvo (preenchida pelo oReg a cada recusa)
      for (const c of cands) {
        // Origem reprovada no limite de fake: em vez de pular, manda quantidade CALCULADA que cumpre
        // o mínimo do mundo (fallback). Só pula de vez se não der pra calcular (sem pontos da aldeia).
        let useCalc = false;
        const ptsC = vPoints ? (parseInt(vPoints[String(c.s.vid)], 10) || 0) : 0;
        const minPopC = ptsC > 0 ? Math.ceil((fakePct / 100) * ptsC) : 0;
        if (mode !== 'c' && !tplOnlySpy[mode] && (fakeBlock[c.s.vid + '|' + mode] || (!dyn && tplPop[mode] > 0 && minPopC > 0 && tplPop[mode] < minPopC))) {
          if (!minPopC) { oReg(c.s.vid, c.s.name, 'fakeSemPontos'); continue; }   // sem os pontos da origem não dá pra calcular o piso -> pula
          useCalc = true;
        }
        const avail = await getAvail(c.s.vid);
        if (minCL > 0 && (avail.light || 0) < minCL) { oReg(c.s.vid, c.s.name, 'semCL'); continue; }   // origem drenada -> tenta a próxima mais próxima
        // No C quem monta a tropa é o jogo, então o piso usa a MESMA estimativa que o desconto
        // logo abaixo (estCL). É aproximação, e é a única honesta: não dá pra saber a composição
        // do template C antes de mandar.
        if (mode === 'c' && (resCL > 0 || resSpy > 0) && livre(avail, 'light') < estCL) { oReg(c.s.vid, c.s.name, 'reserva'); continue; }
        // Modo dinâmico A/B manda {light: estCL, spy: 1}. Se a origem não tem isso (ex.: aldeia recém-noblada
        // sem CL), o servidor recusa e o log mentia "enviado". Pula pra próxima origem em vez de falso-positivo.
        if (dyn && mode !== 'c') {
          if (livre(avail, 'light') < estCL) { oReg(c.s.vid, c.s.name, 'reserva'); continue; }
          if (livre(avail, 'spy') < 1) { oReg(c.s.vid, c.s.name, 'semSpy'); continue; }
        }
        // Sem template dinâmico o A/B manda a composição fixa do assistente. Antes a gente disparava
        // e deixava o servidor recusar — 1 requisição jogada fora por origem sem tropa. Agora confere
        // antes, usando as unidades lidas do próprio template. Se não deu pra ler (mapa vazio), passa
        // direto e o comportamento fica igual ao de antes.
        if (!dyn && !useCalc && mode !== 'c') {
          const need = (mode === 'a' ? (tpl && tpl.unitsA) : (tpl && tpl.unitsB)) || {};
          let falta = false;
          for (const u in need) { if (livre(avail, u) < need[u]) { falta = true; break; } }
          if (falta) { oReg(c.s.vid, c.s.name, 'semTpl'); continue; }
        }
        // Envio calculado = O TEMPLATE DO USUÁRIO subido até o mínimo do mundo. Mantém as unidades que
        // ele escolheu no assistente e só multiplica a quantidade o suficiente pra passar. O saque do
        // alvo NÃO entra aqui: quem decide a composição é o template, não o script.
        let calcAmounts = null;
        if (useCalc) {
          // COMPLETA o template, não substitui: manda tudo que o usuário configurou e soma só a
          // cavalaria que falta pra bater o mínimo do mundo. O script não presume pra que serve cada
          // template (o A daqui é 5 exploradores; noutra conta pode ser 25 cavalarias) — quem decide
          // a composição é o usuário, e o piso de fake é uma exigência do mundo, não uma opinião.
          const base = (mode === 'a' ? (tpl && tpl.unitsA) : (tpl && tpl.unitsB)) || {};
          calcAmounts = {};
          for (const u in base) { const n = parseInt(base[u], 10) || 0; if (n > 0) calcAmounts[u] = n; }
          const falta = Math.max(0, minPopC - (tplPop[mode] || 0));
          if (falta > 0) calcAmounts.light = (calcAmounts.light || 0) + Math.ceil(falta / (FAKE_POP.light || 4));
          if (!Object.keys(calcAmounts).length) continue;
          let semTropa = false;
          for (const u in calcAmounts) { if (livre(avail, u) < calcAmounts[u]) { semTropa = true; break; } }
          if (semTropa) { oReg(c.s.vid, c.s.name, 'fakeSemTropa'); continue; }   // origem não tem o template + o complemento -> tenta a próxima
        }
        try {
          if (mode === 'c') { await sendFarmC(c.s.vid, t.reportId); did = true; }
          else if (useCalc) { await sendAttack(c.s.vid, tx, ty, calcAmounts); did = true; }
          else if (mode === 'a') { for (let k = 0; k < qty; k++) { if (dyn) { await sendAttack(c.s.vid, tx, ty, { light: Math.max(1, Math.ceil(sum / 80)), spy: 1 }); } else { if (!tpl || !tpl.a) break; await sendFarmB(c.s.vid, t.targetId, tpl.a); } did = true; if (k < qty - 1) await sleep(delayBase + Math.floor(Math.random() * 250)); } }
          else if (mode === 'b') { for (let k = 0; k < qty; k++) { if (dyn) { await sendAttack(c.s.vid, tx, ty, { light: Math.max(1, Math.ceil(sum * 1.2 / 80)), spy: 1 }); } else { if (!tpl || !tpl.b) break; await sendFarmB(c.s.vid, t.targetId, tpl.b); } did = true; if (k < qty - 1) await sleep(delayBase + Math.floor(Math.random() * 250)); } }
        } catch (e) {   // envio recusado -> guarda o MOTIVO (antes era engolido e a gente ficava no escuro)
          did = false;
          const em = String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 90);
          // Resposta ambígua: pode ter enviado. Assume que SIM e para de tentar este alvo — errar pra
          // menos (deixar de mandar) é muito mais barato que errar pra mais (ataque dobrado).
          if (/^ambiguo:/.test(em)) { incerto = true; break; }
          errs++;
          errReasons[em] = (errReasons[em] || 0) + 1;
          oReg(c.s.vid, c.s.name, 'recusa');
          // Limite de fake: o template é pequeno demais PRA ESSA ORIGEM (vale pra qualquer alvo).
          // Marca e não tenta de novo no ciclo — antes gastava uma requisição por alvo.
          const fl = em.match(/m[ií]nimo de (\d+) habitantes/i);
          if (fl) {
            fakeBlock[c.s.vid + '|' + mode] = true;
            pushLog('Saque: ' + c.s.name + ' não pode mandar ' + mode.toUpperCase() + ' — o mundo exige ' + fl[1] + ' de população (1% dos pontos dela) e o template é menor. Origem pulada neste ciclo.', 'err', 'farm');
          }
          continue;
        }
        if (did) {
          // Desconta o que saiu, senão a pré-checagem do próximo alvo usa saldo velho e volta a
          // tentar origem já drenada. Dinâmico/C = estimativa de CL; A/B fixo = unidades do template.
          // Dinâmico manda {light: estCL, spy: 1} — o explorador TAMBÉM tem que ser abatido, senão a
          // origem parece ter spy pra sempre, passa na pré-checagem e o servidor recusa. Era a causa
          // das recusas que sobravam: aldeia reusada 3x no ciclo com 2 exploradores.
          if (useCalc) { for (const u in calcAmounts) avail[u] = Math.max(0, (avail[u] || 0) - calcAmounts[u]); }
          else if (dyn && mode !== 'c') { avail.light = Math.max(0, (avail.light || 0) - estCL); avail.spy = Math.max(0, (avail.spy || 0) - 1); }
          else if (mode === 'c') { avail.light = Math.max(0, (avail.light || 0) - estCL); }
          else { const used = (mode === 'a' ? (tpl && tpl.unitsA) : (tpl && tpl.unitsB)) || {}; for (const u in used) avail[u] = Math.max(0, (avail[u] || 0) - used[u]); }
          usedName = c.s.name; usedDist = c.d; usedCalc = useCalc; count++;
          oReg(c.s.vid, c.s.name, 'enviou');
          if (useCalc) { calcCount++; usedCalcInfo = Object.keys(calcAmounts).map((u) => calcAmounts[u] + ' ' + u).join(' + '); }
          // Capacidade de carga despachada. No C quem monta a tropa é o jogo (dimensiona pelo saque
          // do relatório), então usa o próprio saque estimado como capacidade — é aproximação.
          const capEnvio = useCalc ? carryOf(calcAmounts)
            : mode === 'c' ? sum
            : dyn ? estCL * (CARRY.light || 80)
            : carryOf(mode === 'a' ? (tpl && tpl.unitsA) : (tpl && tpl.unitsB));
          capCycle += capEnvio;
          // Mesma capacidade, creditada À ALDEIA que despachou — base da previsão por aldeia.
          const cv = capVila[c.s.vid] || (capVila[c.s.vid] = { cap: 0, atks: 0 });
          cv.cap += capEnvio; cv.atks++;
          cfg.activeSends.push({ coord: t.coord, mode: mode, vid: c.s.vid, at: now }); await sleep(delayBase + Math.floor(Math.random() * 250)); break;
        }
      }
      alvoDiag.push({ coord: t.coord, modo: mode, saque: sum,
        quem: did ? usedName : null, dist: did ? Math.round(usedDist * 10) / 10 : null,
        incerto: !!incerto, candidatos: cands.length,
        // só as 4 primeiras recusas: a lista inteira numa conta de 40 aldeias vira parede de texto
        tentadas: did ? [] : _tent.slice(0, 4), maisTentadas: did ? 0 : Math.max(0, _tent.length - 4) });
      if (did) {
        sent[t.coord] = Date.now(); cfg.sentReports = sent; pendingCoords.add(t.coord);
        // GRAVA JÁ. O save() do fim do ciclo não basta: a página recarrega no meio (visto no log) e
        // todos os carimbos "mandei nesse alvo" iam junto — aí o alvo era reatacado muito antes do
        // "Repetir a cada". Throttle de 2s pra não escrever no disco a cada envio.
        const _ts = Date.now();
        if (_ts - _farmSaveAt > 2000) { _farmSaveAt = _ts; save(); }
        // Envio individual NÃO vai mais pro log (enchia 50 linhas por ciclo). O andamento fica na
        // barra da aba e o resultado no resumo do fim do ciclo.
        if (usedCalc) lastCalcTxt = usedName + ' → ' + t.coord + ' (' + usedCalcInfo + ')';
      }
      else if (incerto) {
        // Não sabemos se saiu. Carimba como enviado pra NÃO reenviar; o próximo ciclo lê a lista de
        // comandos do jogo e corrige sozinho se não tiver saído.
        sent[t.coord] = Date.now(); cfg.sentReports = sent; pendingCoords.add(t.coord); incertos++;
      }
      else skip.semorig++;
    }
    // "Sem origem c/ tropa" NÃO é falha: é teto de tropa, situação normal quando há mais alvo do que
    // cavalaria. Falha de verdade é envio recusado pelo servidor (errs) ou de resultado incerto.
    const naoEnviados = Math.max(0, eligible.length - count - incertos);
    const topErr = Object.keys(errReasons).map((m) => [m, errReasons[m]]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    // Contabilidade por ORIGEM, calculada aqui porque o painel (logo abaixo) e o log (mais adiante)
    // usam os mesmos números.
    const oVals = Object.keys(oDiag).map((v) => oDiag[v]);
    const somaOrig = (campo) => oVals.reduce((s, o) => s + o[campo], 0);
    const MOT = [
      ['semCL', 'abaixo do mínimo de CL'],
      ['reserva', 'CL/exploradores presos na reserva'],
      ['semSpy', 'sem explorador livre'],
      ['semTpl', 'sem a tropa que o template pede'],
      ['fakeSemTropa', 'sem tropa pro complemento do piso de população'],
      ['fakeSemPontos', 'pontos da origem desconhecidos (piso não calculável)'],
      ['recusa', 'recusadas pelo servidor'],
    ];
    const motivos = MOT.map(([k, txt]) => [somaOrig(k), txt]).filter((p) => p[0] > 0)
      .sort((a, b) => b[0] - a[0]).map((p) => p[0] + '× ' + p[1]);
    const usadas = oVals.filter((o) => o.enviou > 0).sort((a, b) => b.enviou - a.enviou);
    const paradas = oVals.filter((o) => o.enviou === 0);
    const _farmOrigTxt = oVals.length
      ? (usadas.length + ' enviaram' + (paradas.length ? ' · ' + paradas.length + ' recusadas' : '')
         + (motivos.length ? ' (' + motivos.slice(0, 3).join(' · ') + ')' : ''))
      : '';
    // PAINEL fica com o detalhe (tem espaço e é status, não histórico).
    const parts = [];
    if (skip.pend) parts.push(skip.pend + ' já em rota');
    if (skip.semorig) parts.push(skip.semorig + ' sem origem c/ tropa');
    if (skip.off) parts.push(skip.off + ' cor sem modo / C indisp.');
    if (skip.azul) parts.push(skip.azul + ' azul c/ muralha');
    if (skip.def) parts.push(skip.def + ' azul c/ defesa');
    if (skip.dist) parts.push(skip.dist + ' fora do alcance');
    if (skip.mur) parts.push(skip.mur + ' muralha alta');
    if (skip.norep) parts.push(skip.norep + ' sem relatório');
    if (eligible.length) {
      setFarmProg(farmProgHTML(eligible.length, eligible.length,
        '✔ <b>' + count + '</b> enviado(s)' + (calcCount ? (' · ' + calcCount + ' completado(s) ao mínimo') : '') +
        (incertos ? (' · ? ' + incertos + ' incerto(s)') : '') +
        (naoEnviados ? (' · ⏭ ' + naoEnviados + ' não enviado(s)') : '') +
        (parts.length ? ('<br><span style="opacity:.7">' + parts.join(' · ') + '</span>') : '') +
        (lastCalcTxt ? ('<br><span style="opacity:.7">completado: ' + lastCalcTxt + '</span>') : '') +
        (_farmOrigTxt ? ('<br><span style="opacity:.7">origens: ' + _farmOrigTxt + '</span>') : '')));
    } else setFarmProg('Nenhum alvo elegível neste ciclo.');
    // LOG enxuto: o resumo sai mais abaixo ("ciclo concluído"). Aqui, só problema DE VERDADE —
    // recusa do servidor ou envio incerto. Falta de tropa não entra: é teto, não defeito.
    if (errs || incertos || topErr.length) {
      pushLog('Saque: ' + (errs ? errs + ' recusa(s)' : '') + (incertos ? ((errs ? ' · ' : '') + incertos + ' incerto(s)') : '') +
        (topErr.length ? (' — ' + topErr.map((p) => p[1] + '× "' + p[0] + '"').join(' · ')) : ''), 'err', 'farm');
    }
    // ===== POR QUE as origens não serviram =====
    // Antes esta linha dizia sempre "acabou a cavalaria", que era um CHUTE: o alvo cai em
    // `semorig` quando NENHUMA origem passou, e a cavalaria é só um dos motivos possíveis. Agora
    // o motivo sai contado, e some a pergunta "por que essa aldeia não mandou nada?".
    if (skip.semorig) {
      pushLog('Saque: ' + skip.semorig + ' alvo(s) ficaram sem origem'
        + (motivos.length ? ' — origens recusadas: ' + motivos.join(' · ') : ' — nenhuma origem no alcance passou nos filtros')
        + '.', '', 'farm');
    }
    // ===== ESTATÍSTICAS (aba Saque > Estatísticas) =====
    // Fotografia do ciclo, por aldeia. Responde as perguntas que o log não consegue responder sem
    // virar parede de texto: quantos alvos cada aldeia alcança, em quantos ela é a mais próxima,
    // quanta cavalaria está parada nela e por quê ela não foi usada.
    //
    // Fica no config (e portanto no backup) porque é diagnóstico, não estado de operação: dá pra
    // olhar depois, comparar com o ciclo anterior e mandar print.
    try {
      const uHome = await getHomeUnitsAll().catch(() => ({}));
      let ret = null;
      try { ret = await getReturningAttack(); } catch (e) { ret = null; }
      const saindoPor = saidaPorOrigem;
      const voltandoPor = (ret && ret.porOrigem) ? ret.porOrigem : {};
      const capDia = (config.farm.dailyCapVila && config.farm.dailyCapVila.vilas) || {};
      const frac = fracaoDoDia();
      // alvos no alcance / em quantos é a mais próxima — por origem
      const noAlcance = {}, maisProx = {};
      eligible.forEach((t) => {
        const tm = String(t.coord || '').match(/(\d+)\|(\d+)/); if (!tm) return;
        const tx2 = +tm[1], ty2 = +tm[2];
        let melhor = null, melhorD = 1e9;
        myV.forEach((s) => {
          const dd = fieldDist(s.x, s.y, tx2, ty2);
          if (dd > maxDist) return;
          noAlcance[s.vid] = (noAlcance[s.vid] || 0) + 1;
          if (dd < melhorD) { melhorD = dd; melhor = s.vid; }
        });
        if (melhor) maisProx[melhor] = (maisProx[melhor] || 0) + 1;
      });
      const MOTC = { semCL: 'abaixo do mínimo de CL', reserva: 'presa na reserva', semSpy: 'sem explorador',
        semTpl: 'sem a tropa do template', fakeSemTropa: 'sem tropa pro piso de população',
        fakeSemPontos: 'pontos desconhecidos', recusa: 'recusada pelo servidor' };
      // distância até o alvo elegível MAIS PRÓXIMO — diferencia as aldeias de verdade, ao contrário
      // de "alvos no alcance", que com alcance de 30 dá o mesmo número pra todo mundo.
      const distMin = {};
      myV.forEach((s) => {
        let melhor = null;
        eligible.forEach((t) => {
          const tm = String(t.coord || '').match(/(\d+)\|(\d+)/); if (!tm) return;
          const dd = fieldDist(s.x, s.y, +tm[1], +tm[2]);
          if (melhor == null || dd < melhor) melhor = dd;
        });
        distMin[s.vid] = melhor;
      });
      const linhas = myV.map((s) => {
        const o = oDiag[s.vid] || {};
        const u = uHome[String(s.vid)] || {};
        // pior motivo = o que mais apareceu; é o que explica a aldeia neste ciclo
        let motivo = '', pico = 0;
        Object.keys(MOTC).forEach((k) => { if ((o[k] || 0) > pico) { pico = o[k]; motivo = MOTC[k]; } });
        const cd = capDia[String(s.vid)] || { cap: 0, atks: 0 };
        return { vid: s.vid, nome: s.name || s.coord, coord: s.coord,
          alcance: noAlcance[s.vid] || 0, prox: maisProx[s.vid] || 0,
          distMin: distMin[s.vid] == null ? null : Math.round(distMin[s.vid] * 10) / 10,
          // ida e volta desta aldeia, contadas na tela de comandos do jogo
          saindo: (saindoPor[s.coord] || {}).farm || 0,
          voltando: (voltandoPor[s.coord] || {}).farm || 0,
          // capacidade despachada HOJE por ela + projeção do fim do dia pela mesma regra de três
          // que a previsão da conta usa. É capacidade, não saque medido — o jogo não dá saque por aldeia.
          capHoje: cd.cap || 0, atksHoje: cd.atks || 0,
          capPrev: frac ? Math.round((cd.cap || 0) / frac) : null,
          enviou: o.enviou || 0, cl: u.light != null ? u.light : null, spy: u.spy != null ? u.spy : null,
          motivo: (o.enviou ? '' : motivo), rejeicoes: pico,
          // "nem foi consultada": nenhuma linha no oDiag e não enviou = o alvo já tinha dono antes
          // de chegar nela. É diferente de "foi tentada e recusada", e a diferença é a que importa.
          consultada: !!oDiag[s.vid] };
      }).sort((a, b) => (b.cl || 0) - (a.cl || 0));
      config.farm.estat = {
        at: Date.now(),
        emRota: saquesAtivos != null ? saquesAtivos : null,
        voltando: ret ? ret.saques : null, voltandoTotal: ret ? ret.total : null,
        alvosElegiveis: eligible.length, alvosSemOrigem: skip.semorig, enviados: count,
        clParada: linhas.reduce((s2, l) => s2 + (l.cl || 0), 0),
        maxDist: maxDist, minCL: minCL,
        origens: linhas, alvos: alvoDiag,
      };
      renderFarmEstat();
    } catch (e) { pushLog('Saque: não consegui montar as estatísticas (' + (e.message || e) + ').', '', 'farm'); }
    // Quem trabalhou e quem ficou parada. É a resposta direta pra "essa aldeia mandou alguma
    // coisa?" — o resumo por alvo nunca conseguiu dar isso, porque conta o lado errado da conta.
    if (oVals.length) {
      const topo = usadas.slice(0, 6).map((o) => o.nome + ' ' + o.enviou + '×').join(' · ');
      pushLog('Saque: ' + usadas.length + ' aldeia(s) enviaram'
        + (topo ? ' (' + topo + (usadas.length > 6 ? ' · +' + (usadas.length - 6) : '') + ')' : '')
        + (paradas.length ? ' · ' + paradas.length + ' cogitada(s) e não usada(s): '
            + paradas.slice(0, 4).map((o) => o.nome).join(', ') + (paradas.length > 4 ? '…' : '') : '')
        + '.', '', 'farm');
    }
    // Detecção de BLOQUEIO por efeito (pega bot-check enquanto você está AFK). Só conta como suspeito o
    // que é sintoma REAL de bloqueio: servidor RECUSOU envios (errs) OU o assistente voltou VAZIO
    // (0 alvos, degradado). "0 enviados por falta de CL / fora de alcance / cooldown" é NORMAL e ZERA o
    // contador (não é bloqueio). Se vinha enviando e fica 3 ciclos suspeitos, alerta pra você voltar ao PC.
    const bloqueioSuspeito = (errs > 0) || (targets.length === 0);
    if (count > 0) { _farmZeroStreak = 0; _farmEverSent = true; }
    else if (_farmEverSent && bloqueioSuspeito) {
      _farmZeroStreak++;
      if (_farmZeroStreak >= 3) {
        pushLog('Saque: 3 ciclos sem enviar' + (errs ? (' (' + errs + ' recusados)') : ' (assistente vazio)') + ' — possível verificação/bloqueio. Volte ao PC.', 'err', 'farm');
        if (config.captcha && config.captcha.enabled) fireCaptchaNotification('saque-parado' + (errs ? ('/' + errs + 'rec') : ''), false);
        _farmZeroStreak = 0;   // zera p/ re-alertar se continuar parado
      }
    } else { _farmZeroStreak = 0; }   // 0 por falta de CL/alcance/cooldown = normal, não é bloqueio
    Object.keys(sent).forEach((r) => { if (now - sent[r] > 12 * 3600 * 1000) delete sent[r]; });
    // Retenção 30 dias — dados de defesa são intel útil pra guerra (relatório azul não muda tão rápido).
    // Tolera formato antigo (number) e novo (object com .at).
    Object.keys(defended).forEach((r) => {
      const d = defended[r];
      const at = (typeof d === 'number') ? d : (d && d.at) || 0;
      if (now - at > 30 * 24 * 3600 * 1000) delete defended[r];
    });
    cfg.sentReports = sent; cfg.defended = defended;
    // stats dos cards
    const as = cfg.activeSends, vids = {}; as.forEach((s) => { if (s.vid) vids[s.vid] = 1; });
    cfg.stats = cfg.stats || {};
    cfg.stats.active = Object.keys(vids).length;
    // total = nº real de ataques de saque em rota (lido da tela de comandos); A/B/C = quebra estimada pelos nossos envios
    cfg.stats.activeTotal = (saquesAtivos != null) ? saquesAtivos : as.length;
    cfg.stats.a = as.filter((s) => s.mode === 'a').length;
    cfg.stats.b = as.filter((s) => s.mode === 'b').length;
    cfg.stats.c = as.filter((s) => s.mode === 'c').length;
    // eficiência (cobertura) = barbs com ataque de saque em rota ÷ farmáveis (assistente + em ataque; o filtro esconde os em ataque, por isso somamos)
    const assistCount = targets.filter((t) => t.reportId).length;
    const farmavel = assistCount + farmCoords.size;
    cfg.stats.farmavel = farmavel;
    cfg.stats.coverage = farmavel > 0 ? Math.min(100, Math.round(farmCoords.size / farmavel * 100)) : null;
    // Eficiência REAL: saque obtido hoje ÷ capacidade de carga despachada hoje. Diz se a tropa está
    // voltando cheia (intervalo bem calibrado) ou meio vazia (batendo cedo demais no mesmo alvo).
    addDailyCap(cfg, capCycle, count);
    addDailyCapVila(cfg, capVila);
    cfg.stats.dailyCap = cfg.dailyCap;
    // Intel de aldeias defendidas (com tropas conhecidas) — usado pelo mapa
    cfg.stats.defendedCount = Object.values(defended).filter((d) => typeof d === 'object' && d.coord).length;
    cfg.nextAt = now + Math.max(60, cfg.interval || 600) * 1000;
    save();
    refreshCards('farm'); refreshDaily('farm', cfg, 'loot', 'loot_res');
    pushLog('Saque: ciclo concluído — ' + count + ' saque(s) enviado(s)' + (calcCount ? (', ' + calcCount + ' completado(s) ao mínimo') : '') + '. Próximo em ' + Math.round((cfg.interval || 600) / 60) + ' min.', 'ok', 'farm');
    scheduleFarm();
  }
  function scheduleFarm() { clearTimeout(farmTimer); if (!config.farm.running) return; farmTimer = setTimeout(farmTick, Math.min(Math.max((config.farm.nextAt || 0) - Date.now(), 1000), 60000)); }
  async function wallTick() {
    clearTimeout(wallTimer);
    if (!config.wall.running) return;
    if (lockOther()) { wallTimer = setTimeout(wallTick, 5000); return; }
    if (captchaBlocked()) { wallTimer = setTimeout(wallTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.wall.nextAt || 0) > now) { scheduleWall(); return; }
    let mine;
    try { mine = await getAllVillagesCached(); }
    catch (e) { pushLog('Muralha: erro ao listar as aldeias (' + (e.message || e) + ').', 'err', 'wall'); config.wall.nextAt = now + 120000; save(); scheduleWall(); return; }
    const myV = [];
    mine.forEach((v) => { const m = (v.coord || '').match(/(\d+)\|(\d+)/); if (m) myV.push({ vid: v.vid, name: v.name || v.coord, coord: v.coord, x: +m[1], y: +m[2] }); });
    const wMin = config.wall.wallMin != null ? config.wall.wallMin : 1;
    const wMax = config.wall.wallMax != null ? config.wall.wallMax : 6;
    const axeN = Math.max(1, config.wall.axeCount || 80);
    const delay = Math.max(0, config.farm.delay != null ? config.farm.delay : 500);
    const demo = config.wall.sentDemo || {};
    // Quebras A CAMINHO: as coords pra onde eu mandei e que ainda aparecem nos meus comandos de
    // ataque. Filtro o ícone de saque fora, senão um saque pra mesma aldeia contaria como quebra.
    // Sem isso o card mediria "quebras que eu disparei algum dia", que não diz nada do agora.
    config.wall.ativos = config.wall.ativos || {};
    let quebrasNoAr = 0;
    try {
      const pa = await getPendingAttack();
      Object.keys(config.wall.ativos).forEach((c) => {
        if (pa.coords.has(c) && !pa.farmCoords.has(c)) quebrasNoAr++; else delete config.wall.ativos[c];
      });
    } catch (e) { quebrasNoAr = Object.keys(config.wall.ativos).length; }
    const COOLDOWN = 6 * 3600 * 1000;   // não re-manda no mesmo report por 6h
    // Alvos com muralha na faixa (assistente = conta inteira), MAIORES primeiro.
    let eligible = [];
    try { eligible = (await getFarmTargetsCached(CUR_VID)).filter((t) => t.reportId && t.coord && t.wall != null && t.wall >= wMin && t.wall <= wMax && !(demo[t.reportId] && (now - demo[t.reportId] < COOLDOWN))); }
    catch (e) { pushLog('Muralha: erro ao ler os alvos do assistente (' + (e.message || e) + ').', 'err', 'wall'); config.wall.nextAt = now + 120000; save(); scheduleWall(); return; }
    eligible.sort((a, b) => (b.wall || 0) - (a.wall || 0));
    const pendingWalls = eligible.length;
    // Tropa por aldeia (sob demanda, com cache) — descontada conforme vai assinando alvos.
    const availCache = {};
    const getAvail = async (vid) => { if (!availCache[vid]) { try { availCache[vid] = (await getVillageStateReserved(vid)).avail || {}; } catch (e) { availCache[vid] = {}; } } return availCache[vid]; };
    // Usa o alcance do Saque como padrão (mesma frota, mesma lógica de vizinhança). Fixo pro
    // ciclo inteiro — não depende do alvo, então sai do loop (antes era recalculado à toa a
    // cada alvo).
    const wallMaxDist = config.wall.maxDist != null ? config.wall.maxDist : (config.farm.maxDist != null ? config.farm.maxDist : 13);
    let count = 0, semTropa = 0, foraAlcance = 0, incertos = 0;
    // Exemplos pros logs de resumo — sem isso "87 alvos sem tropa" não diz QUAIS nem POR QUÊ.
    // Teto de 6 porque o log é texto corrido, não uma tela; o "e mais N" cobre o resto.
    const EX_MAX = 6;
    const semTropaEx = [], foraAlcanceEx = [];
    // Relatório COMPLETO (todo alvo elegível, não só os 6 de exemplo do log) — vira a tabela
    // do painel. sendAttack já devolve a duração exata lida da confirmação do jogo, então
    // "chega em" não precisa de nenhum cálculo de velocidade novo, só somar ao agora.
    const relatorio = [];
    for (const t of eligible) {
      const pare = devoParar('wall');
      if (pare) { pushLog('Muralha: ciclo interrompido — ' + pare + '.', '', 'wall'); break; }
      const cm = (t.coord || '').match(/(\d+)\|(\d+)/); if (!cm) continue;
      const tx = +cm[1], ty = +cm[2];
      const rams = config.wall.ramMode === 'fixo' ? Math.max(1, config.wall.ramFixed || 20) : ramsForWall(t.wall, config.wall.ramWall6 || 24);
      // aldeias candidatas, da MAIS PRÓXIMA pra mais longe; usa a 1ª que tiver bárbaro + aríete.
      // FILTRO DE DISTÂNCIA: sem ele, quando nenhuma aldeia perto tinha tropa, saíam 80 bárbaros +
      // ~24 aríetes de dezenas de campos de distância — dias de viagem e tropa fácil de interceptar.
      const cands = myV.map((s) => ({ s: s, d: fieldDist(s.x, s.y, tx, ty) })).filter((o) => o.d <= wallMaxDist).sort((a, b) => a.d - b.d);
      if (!cands.length) {
        foraAlcance++;
        if (foraAlcanceEx.length < EX_MAX) foraAlcanceEx.push(t.coord);
        relatorio.push({ coord: t.coord, wall: t.wall, status: 'fora', motivo: 'fora do alcance de ' + wallMaxDist + ' campos' });
        continue;
      }
      let done = false;
      for (const c of cands) {
        const avail = await getAvail(c.s.vid);
        if ((avail.axe || 0) < axeN || (avail.ram || 0) < rams) continue;   // sem tropa nessa origem -> próxima mais próxima
        const spies = Math.min(config.wall.spyCount || 1, avail.spy || 0);
        const amounts = { axe: axeN, ram: rams }; if (spies > 0) amounts.spy = spies;
        try {
          const dur = await sendAttack(c.s.vid, tx, ty, amounts);
          avail.axe -= axeN; avail.ram -= rams; avail.spy = (avail.spy || 0) - spies;
          demo[t.reportId] = now; count++; done = true;
          config.wall.ativos[t.coord] = now;   // p/ o card contar quantas quebras estão no ar
          pushLog('Muralha: ' + c.s.name + ' → ' + t.coord + ' (muro ' + t.wall + ', ' + (Math.round(c.d * 10) / 10) + ' campos) com ' + axeN + ' bárbaro + ' + rams + ' aríete' + (spies ? ' + ' + spies + ' explorador' : ''), 'ok', 'wall');
          relatorio.push({ coord: t.coord, wall: t.wall, status: 'quebrando', origem: c.s.name, origemCoord: c.s.coord,
            chegaEm: dur ? now + dur * 1000 : null });
          await sleep(delay + Math.floor(Math.random() * 250));
          break;
        } catch (e) {
          const em = String(e.message || e);
          // Resposta ambígua = PODE ter saído. Tentar outra origem aqui manda 160 bárbaros e 48
          // aríetes num muro que precisava de metade. Assume enviado e para neste alvo.
          if (/^ambiguo:/.test(em)) {
            demo[t.reportId] = now; incertos++; done = true;
            pushLog('Muralha: ' + t.coord + ' — resposta ambígua, pode ter saído. Não repito por outra origem.', '', 'wall');
            relatorio.push({ coord: t.coord, wall: t.wall, status: 'incerto', motivo: 'resposta ambígua — confira nos comandos' });
            break;
          }
          pushLog('Muralha em ' + c.s.name + ' → ' + t.coord + ': ' + em, 'err', 'wall');
        }   // falhou nessa origem -> tenta a próxima
      }
      if (!done) {
        semTropa++;
        // A candidata mais próxima já foi consultada (é a 1ª tentada no for acima) — o cache
        // já tem o que ela tinha, então dá pra dizer exatamente o que faltou nela, sem request extra.
        const perto = cands[0];
        const av = availCache[perto.s.vid] || {};
        const faltaAxe = Math.max(0, axeN - (av.axe || 0));
        const faltaRam = Math.max(0, rams - (av.ram || 0));
        const falta = [faltaAxe > 0 ? 'faltam ' + faltaAxe + ' bárbaro' : null, faltaRam > 0 ? 'faltam ' + faltaRam + ' aríete' : null]
          .filter(Boolean).join(', ') || 'sem tropa suficiente';
        const distPerto = Math.round(perto.d * 10) / 10;
        relatorio.push({ coord: t.coord, wall: t.wall, status: 'bloqueado', origem: perto.s.name, origemCoord: perto.s.coord,
          dist: distPerto, motivo: falta });
        if (semTropaEx.length < EX_MAX) semTropaEx.push(t.coord + ' (mais perto: ' + perto.s.name + ' a ' + distPerto + 'c, ' + falta + ')');
      }
    }
    if (semTropa) pushLog('Muralha: ' + semTropa + ' alvo(s) sem nenhuma aldeia no alcance (' + wallMaxDist + ' campos) com bárbaro+aríete suficiente' +
      (semTropaEx.length ? ' — ex.: ' + semTropaEx.join('; ') + (semTropa > semTropaEx.length ? '; e mais ' + (semTropa - semTropaEx.length) : '') : '') + '.', '', 'wall');
    if (foraAlcance) pushLog('Muralha: ' + foraAlcance + ' alvo(s) fora do alcance de ' + wallMaxDist + ' campos' +
      (foraAlcanceEx.length ? ' — ex.: ' + foraAlcanceEx.join(', ') + (foraAlcance > foraAlcanceEx.length ? ', e mais ' + (foraAlcance - foraAlcanceEx.length) : '') : '') + '.', '', 'wall');
    Object.keys(demo).forEach((r) => { if (now - demo[r] > 12 * 3600 * 1000) delete demo[r]; });
    config.wall.sentDemo = demo;
    config.wall.stats = config.wall.stats || {};
    config.wall.stats.pending = pendingWalls;
    config.wall.stats.total = (config.wall.stats.total || 0) + count;
    config.wall.stats.last = count;
    config.wall.stats.active = quebrasNoAr + count;   // as deste ciclo também estão no ar
    // Relatório do ciclo, pra tabela do painel: TODO alvo elegível, com status/origem/motivo.
    // Ordena os bloqueados/fora primeiro (é o que dá pra agir), os já quebrando por último.
    const ordem = { bloqueado: 0, fora: 1, incerto: 2, quebrando: 3 };
    relatorio.sort((a, b) => (ordem[a.status] - ordem[b.status]) || (b.wall - a.wall));
    config.wall.stats.relatorio = relatorio;
    config.wall.stats.relatorioAt = now;
    config.wall.nextAt = now + Math.max(60, config.wall.interval || 600) * 1000;
    save();
    refreshCards('wall');
    if (typeof wallRenderRelatorio === 'function') wallRenderRelatorio();
    pushLog('Muralha: ciclo concluído — ' + count + ' ataque(s) de quebra' + (incertos ? (' · ' + incertos + ' incerto(s)') : '') + '. Próximo em ' + Math.round((config.wall.interval || 600) / 60) + ' min.', 'ok', 'wall');
    scheduleWall();
  }
  function scheduleWall() { clearTimeout(wallTimer); if (!config.wall.running) return; wallTimer = setTimeout(wallTick, Math.min(Math.max((config.wall.nextAt || 0) - Date.now(), 1000), 60000)); }

