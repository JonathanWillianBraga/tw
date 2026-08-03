  // ===== Cards de status por módulo =====
  function fmtN(n) { return (n == null) ? '—' : Number(n).toLocaleString('pt-BR'); }
  function renderCards(mod, arr) {
    const box = document.getElementById('twmgr-cards-' + mod); if (!box) return;
    box.innerHTML = arr.map((c) =>
      (c.br ? '<div class="twmgr-card-break"></div>' : '') +
      '<div class="twmgr-card-mini' + (c.wide ? ' twmgr-card-wide' : '') + '"><div class="twmgr-card-v"' + (c.hl ? ' style="color:#1f8fa0"' : '') + '>' + (c.v == null ? '—' : c.v) + '</div><div class="twmgr-card-l">' + c.l + '</div></div>'
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
        { v: fmtN(s.a), l: 'A' }, { v: fmtN(s.b), l: 'B' }, { v: fmtN(s.c), l: 'C' },
        { v: fmtN(lt.today), l: 'saqueado hoje', br: true },
        { v: fmtN(lt.estimate), l: 'estimativa fim do dia' },
        { v: fmtN((s.dailyCap || {}).cap), l: 'capacidade enviada hoje' },
        // Só vale comparar com o "saqueado hoje" se a contagem cobrir o dia inteiro. Se o script foi
        // instalado/aberto no meio do dia, a capacidade está incompleta e a conta estoura 100%.
        (function () {
          const dc = s.dailyCap || {}, cap = dc.cap || 0;
          const parcial = (dc.startSec || 0) > 900;
          if (!cap || lt.today == null) return { v: '—', l: 'eficiência (saque ÷ capacidade)', hl: true, wide: true };
          const pct = Math.round(lt.today / cap * 100) + '%';
          return parcial
            ? { v: pct, l: 'eficiência — parcial, vale só a partir de amanhã', wide: true }
            : { v: pct, l: 'eficiência (saque ÷ capacidade)', hl: true, wide: true };
        }()),
      ];
    } else if (mod === 'wall') {
      const s = (config.wall.stats || {});
      arr = [
        { v: fmtN(s.pending), l: 'muros p/ derrubar', hl: true },
        { v: fmtN(s.total), l: 'quebras (total)' },
        { v: fmtN(s.last), l: 'último ciclo' },
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
      arr = [{ v: fmtN(s.villages), l: 'aldeias recrutando', wide: true, hl: true }];
    } else if (mod === 'fakes') {
      const g = config.fakes.gen || [];
      const armed = g.filter((f) => f.state === 'armed' || f.state === 'scheduled').length;
      const pend = g.filter((f) => f.state === 'armed').length;
      const sent = g.filter((f) => f.state === 'sent').length;
      const err = g.filter((f) => f.state === 'error').length;
      arr = [
        { v: fmtN(armed), l: 'armados', hl: true }, { v: fmtN(pend), l: 'pendentes' },
        { v: fmtN(sent), l: 'enviados' }, { v: fmtN(err), l: 'erros' },
      ];
    } else if (mod === 'market') {
      const s = (config.market.stats || {});
      arr = [
        { v: fmtN(s.sending), l: 'enviando', hl: true },
        { v: fmtN(s.receiving), l: 'recebendo' },
        { v: fmtN(s.wood), l: 'madeira' }, { v: fmtN(s.stone), l: 'argila' }, { v: fmtN(s.iron), l: 'ferro' },
      ];
    } else if (mod === 'build') {
      const s = (config.build.stats || {});
      arr = [{ v: fmtN(s.villages), l: 'aldeias construindo', wide: true, hl: true }];
    } else if (mod === 'bb') {
      const s = (config.bb.stats || {});
      arr = [
        { v: fmtN(s.total), l: 'no grupo', hl: true },
        { v: fmtN(s.f1), l: 'fase 1' },
        { v: fmtN(s.f2), l: 'fase 2' },
        { v: fmtN(s.f3), l: 'fase 3' },
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
        { v: fmtN(s.blPerda), l: 'bl: perdi tropa' },
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
        { v: fmtN(Object.keys(e.jaEnviados || {}).length), l: 'ja etiquetados' },
        { v: (e.intervalMin || 2) + ' min', l: 'intervalo' },
      ];
    } else if (mod === 'planner') {
      const attacks = (config.planner && config.planner.attacks) || [];
      const rows = attacks.reduce((acc, a) => acc.concat(a.rows || []), []);
      const armed = rows.filter((r) => r.state === 'armed' || r.state === 'scheduled').length;
      const sent = rows.filter((r) => r.state === 'sent').length;
      const err = rows.filter((r) => r.state === 'error').length;
      const running = attacks.filter((a) => a.running).length;
      arr = [
        { v: fmtN(running), l: 'ataques armados', hl: true },
        { v: fmtN(armed), l: 'ondas pendentes' },
        { v: fmtN(sent), l: 'enviadas' },
        { v: fmtN(err), l: 'erros' },
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

  // Converte a data do relatório do assistente ("hoje às 12:03:39", "ontem às ...", "13/07/26 às ...") em timestamp (ms). null se não der.
  function parseReportDate(txt) {
    txt = (txt || '').trim().toLowerCase();
    if (!txt) return null;
    const tm = txt.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const hh = tm ? +tm[1] : 0, mm = tm ? +tm[2] : 0, ss = (tm && tm[3]) ? +tm[3] : 0;
    const d = new Date();
    if (txt.indexOf('hoje') >= 0) { d.setHours(hh, mm, ss, 0); return d.getTime(); }
    if (txt.indexOf('ontem') >= 0) { d.setDate(d.getDate() - 1); d.setHours(hh, mm, ss, 0); return d.getTime(); }
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
        await sendMarketResources(c.v.vid, dCoord, envio);
        RES3.forEach((k) => { restante[k] = Math.max(0, restante[k] - envio[k]); c.v.res[k] -= envio[k]; });
        usadas++;
        pushLog('🚚 ' + c.v.name + ' → ' + destino.name + ': ' + RES3.filter((k) => envio[k]).map((k) => envio[k] + ' ' + k).join(', ') +
          ' (' + Math.round(c.dist * 10) / 10 + ' campos)', 'ok', 'scav');
      } catch (e) { pushLog('🚚 ' + c.v.name + ' → ' + destino.name + ': envio falhou (' + (e.message || e) + ').', 'err', 'scav'); }
      await sleep(400);
    }
    const aindaFalta = RES3.reduce((s, k) => s + restante[k], 0);
    return { usadas: usadas, aindaFalta: aindaFalta, restante: restante };
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
      try {
        const r = await scavPuxarRecursos(v, falta, estados, coords);
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
      const weights = freeOpts.map((o) => 1 / (LOOT_FACTOR[o.id] || 0.1));
      const alloc = freeOpts.map(() => ({}));
      Object.entries(avail).forEach(([u, n]) => { distribute(n, weights).forEach((c, i) => { if (c > 0) alloc[i][u] = c; }); });
      for (let i = 0; i < freeOpts.length; i++) {
        const a = alloc[i];
        const pop = Object.entries(a).reduce((s, [u, c]) => s + c * (POP[u] || 1), 0);
        const carry = Math.floor(Object.entries(a).reduce((s, [u, c]) => s + c * (CARRY[u] || 0), 0) * (v.carryFactor || 1));
        if (pop < MIN_POP || carry <= 0) continue;
        reqs.push({ vid: v.vid, name: v.name, optionId: freeOpts[i].id, units: a, carry: carry });
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

  // Lê a tela de comandos (só ataques): coords com ataque nosso em rota (p/ não empilhar) + nº de ATAQUES DE SAQUE em rota (ícone de farm) p/ o card.
  async function getPendingAttack() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=commands&type=attack&page=-1', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const coords = new Set(); let saques = 0; const farmCoords = new Set();
    doc.querySelectorAll('#commands_table tr').forEach((tr) => {
      const label = tr.querySelector('.quickedit-label'); if (!label) return;
      const m = (label.textContent || '').match(/\((\d+)\|(\d+)\)/); const coord = m ? m[1] + '|' + m[2] : null;
      if (coord) coords.add(coord);
      if (tr.querySelector('img[src*="command/farm"]')) { saques++; if (coord) farmCoords.add(coord); }   // ícone farm.webp = ataque de saque
    });
    return { coords: coords, saques: saques, farmCoords: farmCoords };
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
      if (cfg.group) { mine = (await getVillagesInGroup(cfg.group)).map((x) => ({ vid: x.vid, coord: x.coord, name: x.coord })); try { await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0', { credentials: 'include' }); } catch (e) {} }
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
    try { const pa = await getPendingAttack(); pendingCoords = pa.coords; saquesAtivos = pa.saques; farmCoords = pa.farmCoords || new Set(); } catch (e) {}
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
    const fakePct = (config.fakes && config.fakes.pct) || 1;
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
      for (const c of cands) {
        // Origem reprovada no limite de fake: em vez de pular, manda quantidade CALCULADA que cumpre
        // o mínimo do mundo (fallback). Só pula de vez se não der pra calcular (sem pontos da aldeia).
        let useCalc = false;
        const ptsC = vPoints ? (parseInt(vPoints[String(c.s.vid)], 10) || 0) : 0;
        const minPopC = ptsC > 0 ? Math.ceil((fakePct / 100) * ptsC) : 0;
        if (mode !== 'c' && !tplOnlySpy[mode] && (fakeBlock[c.s.vid + '|' + mode] || (!dyn && tplPop[mode] > 0 && minPopC > 0 && tplPop[mode] < minPopC))) {
          if (!minPopC) continue;   // sem os pontos da origem não dá pra calcular o piso -> pula
          useCalc = true;
        }
        const avail = await getAvail(c.s.vid);
        if (minCL > 0 && (avail.light || 0) < minCL) continue;   // origem drenada -> tenta a próxima mais próxima
        // Modo dinâmico A/B manda {light: estCL, spy: 1}. Se a origem não tem isso (ex.: aldeia recém-noblada
        // sem CL), o servidor recusa e o log mentia "enviado". Pula pra próxima origem em vez de falso-positivo.
        if (dyn && mode !== 'c') { if ((avail.light || 0) < estCL) continue; if ((avail.spy || 0) < 1) continue; }
        // Sem template dinâmico o A/B manda a composição fixa do assistente. Antes a gente disparava
        // e deixava o servidor recusar — 1 requisição jogada fora por origem sem tropa. Agora confere
        // antes, usando as unidades lidas do próprio template. Se não deu pra ler (mapa vazio), passa
        // direto e o comportamento fica igual ao de antes.
        if (!dyn && !useCalc && mode !== 'c') {
          const need = (mode === 'a' ? (tpl && tpl.unitsA) : (tpl && tpl.unitsB)) || {};
          let falta = false;
          for (const u in need) { if ((avail[u] || 0) < need[u]) { falta = true; break; } }
          if (falta) continue;
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
          for (const u in calcAmounts) { if ((avail[u] || 0) < calcAmounts[u]) { semTropa = true; break; } }
          if (semTropa) continue;   // origem não tem o template + o complemento -> tenta a próxima
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
          if (useCalc) { calcCount++; usedCalcInfo = Object.keys(calcAmounts).map((u) => calcAmounts[u] + ' ' + u).join(' + '); }
          // Capacidade de carga despachada. No C quem monta a tropa é o jogo (dimensiona pelo saque
          // do relatório), então usa o próprio saque estimado como capacidade — é aproximação.
          capCycle += useCalc ? carryOf(calcAmounts)
            : mode === 'c' ? sum
            : dyn ? estCL * (CARRY.light || 80)
            : carryOf(mode === 'a' ? (tpl && tpl.unitsA) : (tpl && tpl.unitsB));
          cfg.activeSends.push({ coord: t.coord, mode: mode, vid: c.s.vid, at: now }); await sleep(delayBase + Math.floor(Math.random() * 250)); break;
        }
      }
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
        (lastCalcTxt ? ('<br><span style="opacity:.7">completado: ' + lastCalcTxt + '</span>') : '')));
    } else setFarmProg('Nenhum alvo elegível neste ciclo.');
    // LOG enxuto: o resumo sai mais abaixo ("ciclo concluído"). Aqui, só problema DE VERDADE —
    // recusa do servidor ou envio incerto. Falta de tropa não entra: é teto, não defeito.
    if (errs || incertos || topErr.length) {
      pushLog('Saque: ' + (errs ? errs + ' recusa(s)' : '') + (incertos ? ((errs ? ' · ' : '') + incertos + ' incerto(s)') : '') +
        (topErr.length ? (' — ' + topErr.map((p) => p[1] + '× "' + p[0] + '"').join(' · ')) : ''), 'err', 'farm');
    }
    // Tropa esgotada é informação útil (dá pra decidir intervalo/ordem), mas em tom neutro.
    if (skip.semorig) pushLog('Saque: ' + skip.semorig + ' alvo(s) sem origem com tropa — acabou a cavalaria antes dos alvos.', '', 'farm');
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
    let count = 0, semTropa = 0, foraAlcance = 0, incertos = 0;
    for (const t of eligible) {
      const pare = devoParar('wall');
      if (pare) { pushLog('Muralha: ciclo interrompido — ' + pare + '.', '', 'wall'); break; }
      const cm = (t.coord || '').match(/(\d+)\|(\d+)/); if (!cm) continue;
      const tx = +cm[1], ty = +cm[2];
      const rams = config.wall.ramMode === 'fixo' ? Math.max(1, config.wall.ramFixed || 20) : ramsForWall(t.wall, config.wall.ramWall6 || 24);
      // aldeias candidatas, da MAIS PRÓXIMA pra mais longe; usa a 1ª que tiver bárbaro + aríete.
      // FILTRO DE DISTÂNCIA: sem ele, quando nenhuma aldeia perto tinha tropa, saíam 80 bárbaros +
      // ~24 aríetes de dezenas de campos de distância — dias de viagem e tropa fácil de interceptar.
      // Usa o alcance do Saque como padrão (mesma frota, mesma lógica de vizinhança).
      const wallMaxDist = config.wall.maxDist != null ? config.wall.maxDist : (config.farm.maxDist != null ? config.farm.maxDist : 13);
      const cands = myV.map((s) => ({ s: s, d: fieldDist(s.x, s.y, tx, ty) })).filter((o) => o.d <= wallMaxDist).sort((a, b) => a.d - b.d);
      if (!cands.length) { foraAlcance++; continue; }
      let done = false;
      for (const c of cands) {
        const avail = await getAvail(c.s.vid);
        if ((avail.axe || 0) < axeN || (avail.ram || 0) < rams) continue;   // sem tropa nessa origem -> próxima mais próxima
        const spies = Math.min(config.wall.spyCount || 1, avail.spy || 0);
        const amounts = { axe: axeN, ram: rams }; if (spies > 0) amounts.spy = spies;
        try {
          await sendAttack(c.s.vid, tx, ty, amounts);
          avail.axe -= axeN; avail.ram -= rams; avail.spy = (avail.spy || 0) - spies;
          demo[t.reportId] = now; count++; done = true;
          pushLog('Muralha: ' + c.s.name + ' → ' + t.coord + ' (muro ' + t.wall + ', ' + (Math.round(c.d * 10) / 10) + ' campos) com ' + axeN + ' bárbaro + ' + rams + ' aríete' + (spies ? ' + ' + spies + ' explorador' : ''), 'ok', 'wall');
          await sleep(delay + Math.floor(Math.random() * 250));
          break;
        } catch (e) {
          const em = String(e.message || e);
          // Resposta ambígua = PODE ter saído. Tentar outra origem aqui manda 160 bárbaros e 48
          // aríetes num muro que precisava de metade. Assume enviado e para neste alvo.
          if (/^ambiguo:/.test(em)) {
            demo[t.reportId] = now; incertos++; done = true;
            pushLog('Muralha: ' + t.coord + ' — resposta ambígua, pode ter saído. Não repito por outra origem.', '', 'wall');
            break;
          }
          pushLog('Muralha em ' + c.s.name + ' → ' + t.coord + ': ' + em, 'err', 'wall');
        }   // falhou nessa origem -> tenta a próxima
      }
      if (!done) semTropa++;
    }
    if (semTropa) pushLog('Muralha: ' + semTropa + ' alvo(s) sem nenhuma aldeia no alcance com bárbaro+aríete.', '', 'wall');
    if (foraAlcance) pushLog('Muralha: ' + foraAlcance + ' alvo(s) fora do alcance de ' + (config.wall.maxDist != null ? config.wall.maxDist : (config.farm.maxDist != null ? config.farm.maxDist : 13)) + ' campos.', '', 'wall');
    Object.keys(demo).forEach((r) => { if (now - demo[r] > 12 * 3600 * 1000) delete demo[r]; });
    config.wall.sentDemo = demo;
    config.wall.stats = config.wall.stats || {};
    config.wall.stats.pending = pendingWalls;
    config.wall.stats.total = (config.wall.stats.total || 0) + count;
    config.wall.stats.last = count;
    config.wall.nextAt = now + Math.max(60, config.wall.interval || 600) * 1000;
    save();
    refreshCards('wall');
    pushLog('Muralha: ciclo concluído — ' + count + ' ataque(s) de quebra' + (incertos ? (' · ' + incertos + ' incerto(s)') : '') + '. Próximo em ' + Math.round((config.wall.interval || 600) / 60) + ' min.', 'ok', 'wall');
    scheduleWall();
  }
  function scheduleWall() { clearTimeout(wallTimer); if (!config.wall.running) return; wallTimer = setTimeout(wallTick, Math.min(Math.max((config.wall.nextAt || 0) - Date.now(), 1000), 60000)); }

