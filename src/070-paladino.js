  // ==================== PALADINO (treino por XP) ====================
  // O regime de treino escolhido é sempre o de 4h — melhor taxa de XP/hora entre os disponíveis.
  // IMPORTANTE: o id do regime NÃO é fixo — varia por paladino/conta (confirmado: um paladino tinha
  // 4h=id 41, outro tinha 4h=id 36). Por isso nunca hardcodar o id: cada knight traz `usable_regimens`
  // (lista de {id, duration, xp_payout, res_cost}) e escolhemos ali o item com duration === 14400s (4h).
  const PALADIN_REGIMEN_DURATION_S = 14400;
  function paladinPick4hRegimen(k) {
    const opts = (k && k.usable_regimens) || [];
    return opts.find((r) => r.duration === PALADIN_REGIMEN_DURATION_S) || null;
  }

  // Extrai um bloco JSON balanceado (objeto ou array) começando em text[startIdx]. Necessário porque
  // o payload de BuildingStatue.receiveKnightsData tem chaves aninhadas (skills, home_village, etc.) —
  // uma regex com profundidade fixa quebraria com paladinos de árvore de habilidade mais cheia.
  function extractBalancedJSON(text, startIdx) {
    const open = text[startIdx]; if (open !== '{' && open !== '[') return null;
    const close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, strChar = '', esc = false;
    for (let i = startIdx; i < text.length; i++) {
      const c = text[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === strChar) inStr = false; continue; }
      if (c === '"' || c === "'") { inStr = true; strChar = c; continue; }
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) return text.slice(startIdx, i + 1); }
    }
    return null;
  }

  // Uma única página screen=statue (de QUALQUER aldeia) já embute, via
  // BuildingStatue.receiveKnightsData(pendentes, porId, ativoId), o status de TODOS os paladinos da
  // conta — id, aldeia dona, nível/XP, e activity{type,finish_time}. 1 fetch cobre a conta inteira.
  async function getKnightsData(vid) {
    const res = await fetch('/game.php?village=' + (vid || CUR_VID) + '&screen=statue', { credentials: 'include' });
    const html = await res.text();
    const marker = 'BuildingStatue.receiveKnightsData(';
    const idx = html.indexOf(marker);
    if (idx < 0) throw new Error('receiveKnightsData não encontrado (Estátua ainda não construída?)');
    let i = idx + marker.length;
    while (/\s/.test(html[i])) i++;
    const arg1 = extractBalancedJSON(html, i);
    if (!arg1) throw new Error('parse do 1º argumento falhou');
    i += arg1.length;
    while (html[i] === ',' || /\s/.test(html[i])) i++;
    const arg2 = extractBalancedJSON(html, i);
    if (!arg2) throw new Error('parse do 2º argumento falhou');
    let knights;
    try { knights = JSON.parse(arg2); } catch (e) { throw new Error('JSON inválido: ' + (e.message || e)); }
    return knights;   // { "<knightId>": { id, name, level, xp, home_village:{id,...}, activity:{type,finish_time}, ... } }
  }

  // getKnightsData depende da aldeia consultada ter Estátua construída — mas CUR_VID é "onde o
  // usuário está navegando agora" no jogo, não necessariamente uma aldeia com paladino. Tenta
  // CUR_VID primeiro e, se falhar, cai pras aldeias marcadas no ciclo (que por definição têm
  // paladino, logo têm Estátua), evitando que o ciclo pare só porque o usuário trocou de aldeia.
  async function getKnightsDataResilient() {
    const tried = {};
    const candidates = [CUR_VID].concat(Object.keys(config.paladin.villages || {})).filter((v) => v && !tried[v] && (tried[v] = 1));
    let lastErr;
    for (const vid of candidates) {
      try { return await getKnightsData(vid); } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('nenhuma aldeia disponível para leitura');
  }

  // Manda o paladino `knightId` (da aldeia vid) pro regime de treino. Retorna o knight ATUALIZADO
  // (já com o novo activity.finish_time), direto da resposta — sem precisar reconsultar depois.
  async function paladinSendRegimen(vid, knightId, regimenId) {
    const b = new URLSearchParams();
    b.set('knight', String(knightId));
    b.set('regimen', String(regimenId));
    b.set('cheap', '0');
    b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + vid + '&screen=statue&ajaxaction=regimen', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'TribalWars-Ajax': '1', 'X-Requested-With': 'XMLHttpRequest' },
      body: b.toString(),
    });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!j || !j.response || !j.response.knight) throw new Error('resposta inesperada (' + (txt || '').slice(0, 100).replace(/\s+/g, ' ') + ')');
    return j.response.knight;
  }

  // Timer de PRECISÃO: agenda um recheck exatamente duração+30s depois do fim do treino atual dessa
  // aldeia — independente de onde o check periódico (2ª entrada) está no próprio ciclo. É o 2º dos
  // "2 checks" pedidos: garante reenvio quase imediato ao terminar, sem depender só do polling genérico.
  const PALADIN_PISO_MS = 15000;      // piso do recheck; o antigo era 1s e criava laço
  const PALADIN_MIN_ENTRE_MS = 30000; // intervalo mínimo entre dois rechecks da mesma aldeia
  const paladinUltimoPreciso = {};    // vid -> quando o recheck de precisão rodou pela última vez

  function paladinSchedulePrecise(vid, finishAtMs) {
    if (!finishAtMs) return;
    const agora = Date.now();
    const fireAt = finishAtMs + 30000;   // +30s de buffer (cobre o delay entre envios da 3ª entrada)

    // LAÇO DE 1 SEGUNDO — foi isto que derrubou a conta em HTTP 429.
    //
    // Quando o jogo devolvia um finish_time JÁ VENCIDO (paladino que terminou, ou estado
    // preso), o `Math.max(1000, ...)` fazia o recheck cair no piso de 1s. O temporizador
    // APAGAVA A SI MESMO antes de chamar o recheck, então a guarda de duplicidade logo
    // abaixo não encontrava nada e deixava reagendar — 1s de novo, para sempre, com um
    // screen=statue por volta.
    // Medido na conta do usuário: 7 requisições por minuto com só este módulo ligado,
    // 420/h, e o servidor passou a recusar TUDO com 429, inclusive dos outros módulos.
    //
    // Duas travas, porque uma só já falhou: não agenda pra hora vencida (o check periódico
    // cobre), e não deixa a mesma aldeia repetir antes do intervalo mínimo.
    if (fireAt <= agora) return;
    const ultimo = paladinUltimoPreciso[vid] || 0;
    if (agora - ultimo < PALADIN_MIN_ENTRE_MS) return;

    const cur = paladinPreciseTimers[vid];
    if (cur && cur.finishAt === finishAtMs) return;   // já agendado pra esse horário exato
    if (cur) clearTimeout(cur.id);
    const delay = Math.max(PALADIN_PISO_MS, fireAt - agora);
    const id = setTimeout(() => {
      delete paladinPreciseTimers[vid];
      paladinUltimoPreciso[vid] = Date.now();
      paladinCheckAndSend(vid);
    }, delay);
    paladinPreciseTimers[vid] = { id: id, finishAt: finishAtMs };
  }

  // Rotina central: lê o status de todos os paladinos (1 fetch) e, pra cada aldeia SELECIONADA, ou
  // manda treinar (se livre) ou agenda o timer de precisão (se já treinando). Aceita `onlyVid` pra
  // rodar só numa aldeia específica (chamado pelo próprio timer de precisão).
  async function paladinCheckAndSend(onlyVid) {
    if (!config.paladin.running) return 0;
    if (lockOther() || captchaBlocked()) return 0;
    const villages = onlyVid ? [String(onlyVid)] : Object.keys(config.paladin.villages || {}).filter((v) => config.paladin.villages[v]);
    if (!villages.length) return 0;
    let knights;
    try { knights = await getKnightsDataResilient(); }
    catch (e) { pushLog('Paladino: erro ao ler status (' + (e.message || e) + ').', 'err', 'paladin'); return 0; }
    const byVid = {};
    Object.values(knights).forEach((k) => { if (k && k.home_village) byVid[String(k.home_village.id)] = k; });
    config.paladin.state = config.paladin.state || {};
    let sent = 0;
    for (let idx = 0; idx < villages.length; idx++) {
      const vid = villages[idx];
      const k = byVid[vid];
      const st = config.paladin.state[vid] = config.paladin.state[vid] || {};
      if (!k) { st.status = 'sem-paladino'; st.finishAt = null; continue; }
      st.knightId = k.id; st.name = k.name; st.level = k.level;
      const activity = k.activity || {};
      st.status = activity.type || 'home';
      if (activity.type === 'training') {
        st.finishAt = activity.finish_time ? (+activity.finish_time) * 1000 : null;
        if (st.finishAt) paladinSchedulePrecise(vid, st.finishAt);
        continue;
      }
      if (activity.type && activity.type !== 'home') {
        // ocupado (atacando/apoiando/viajando/recrutando etc.) -> pula pro próximo, mas se o jogo
        // informar finish_time, mostra a contagem regressiva e agenda o recheck de precisão pra
        // retomar o treino assim que o paladino ficar livre de novo (ida+volta do ataque, etc.).
        st.finishAt = activity.finish_time ? (+activity.finish_time) * 1000 : null;
        if (st.finishAt) paladinSchedulePrecise(vid, st.finishAt);
        continue;
      }
      // livre em casa -> manda pro regime de 4h (id varia por paladino, resolvido via usable_regimens)
      const regimen4h = paladinPick4hRegimen(k);
      if (!regimen4h) { st.status = 'sem-regime-4h'; pushLog('Paladino: ' + (k.name || vid) + ' (' + vid + ') não tem regime de 4h disponível agora.', 'err', 'paladin'); continue; }
      try {
        const upd = await paladinSendRegimen(vid, k.id, regimen4h.id);
        st.status = (upd.activity && upd.activity.type) || 'training';
        st.finishAt = (upd.activity && upd.activity.finish_time) ? (+upd.activity.finish_time) * 1000 : null;
        pushLog('Paladino: ' + (k.name || vid) + ' (' + vid + ') → treino 4h' + (st.finishAt ? (', chega ' + new Date(st.finishAt).toLocaleTimeString()) : '') + '.', 'ok', 'paladin');
        if (st.finishAt) paladinSchedulePrecise(vid, st.finishAt);
        sent++;
      } catch (e) { pushLog('Paladino em ' + (k.name || vid) + ': ' + (e.message || e), 'err', 'paladin'); }
      if (idx < villages.length - 1) await sleep(Math.max(0, config.paladin.sendDelayMs || 500));
    }
    save();
    refreshCards('paladin'); renderPaladinStatus();
    return sent;
  }

  // Check periódico genérico (2ª entrada) — rede de segurança ampla, independente do timer de precisão.
  async function paladinTick() {
    clearTimeout(paladinTimer);
    if (!config.paladin.running) return;
    if (lockOther()) { paladinTimer = setTimeout(paladinTick, 5000); return; }
    if (captchaBlocked()) { paladinTimer = setTimeout(paladinTick, 30000); return; }
    claimLock();
    let sent = 0;
    try { sent = await paladinCheckAndSend(); } catch (e) { pushLog('Paladino: erro no ciclo (' + (e.message || e) + ').', 'err', 'paladin'); }
    const intervalMs = Math.max(1, config.paladin.checkIntervalMin || 240) * 60000;
    pushLog('Paladino: ciclo concluído — ' + sent + ' envio(s). Próximo check em ' + Math.round(intervalMs / 60000) + ' min.', 'ok', 'paladin');
    paladinTimer = setTimeout(paladinTick, intervalMs);
  }
  function readPaladinCfg() {
    const c = config.paladin, g = (id) => document.getElementById(id);
    if (g('twmgr-pd-interval')) c.checkIntervalMin = Math.max(1, parseInt(g('twmgr-pd-interval').value, 10) || 240);
    if (g('twmgr-pd-delay')) { const v = parseInt(g('twmgr-pd-delay').value, 10); c.sendDelayMs = (isNaN(v) || v < 0) ? 500 : v; }
    const vs = {}; document.querySelectorAll('.twmgr-pd-vil').forEach((cb) => { if (cb.checked) vs[cb.getAttribute('data-vid')] = true; });
    c.villages = vs;
    save();
  }
  function setPaladinStatus(on) { setBtnState('twmgr-pd-start', 'twmgr-pd-stop', on, '● Ativo', '▶ Iniciar ciclo'); }
  function paladinStart() {
    readPaladinCfg();
    if (!Object.keys(config.paladin.villages).length) { pushLog('Paladino: marque ao menos 1 aldeia.', 'err', 'paladin'); return; }
    config.paladin.running = true; save();
    setPaladinStatus(true);
    pushLog('Paladino: ciclo iniciado — ' + Object.keys(config.paladin.villages).length + ' aldeia(s), check a cada ' + config.paladin.checkIntervalMin + ' min, delay ' + config.paladin.sendDelayMs + 'ms.', 'ok', 'paladin');
    paladinTick();
  }
  function paladinStop() {
    readPaladinCfg();
    config.paladin.running = false; save();
    clearTimeout(paladinTimer);
    Object.keys(paladinPreciseTimers).forEach((vid) => { clearTimeout(paladinPreciseTimers[vid].id); delete paladinPreciseTimers[vid]; });
    setPaladinStatus(false);
    pushLog('Paladino: ciclo parado.', '', 'paladin');
  }
  async function renderPaladinVillages() {
    const cont = document.getElementById('twmgr-pd-villages'); if (!cont) return;
    cont.innerHTML = '<div style="font-size:10px;color:#8f7d57;padding:6px;text-align:center">carregando…</div>';
    let vils = []; try { vils = await getAllVillagesCached(); } catch (e) { vils = [{ vid: CUR_VID, name: CUR_NAME }]; }
    let knights = null, lastErr = null;
    const order = [CUR_VID].concat(vils.map((v) => v.vid)).filter((v, i, arr) => v && arr.indexOf(v) === i);
    for (const vid of order) { try { knights = await getKnightsData(vid); break; } catch (e) { lastErr = e; } }
    if (!knights) { cont.innerHTML = '<div style="font-size:10px;color:#ff7568;padding:6px;text-align:center">Erro ao ler paladinos (' + esc((lastErr && lastErr.message) || String(lastErr)) + ')</div>'; return; }
    const withKnight = {};
    Object.values(knights).forEach((k) => { if (k && k.home_village) withKnight[String(k.home_village.id)] = true; });
    vils = vils.filter((v) => withKnight[v.vid]);   // só aldeias com paladino entram na lista de seleção
    if (!vils.length) { cont.innerHTML = '<div style="font-size:10px;color:#8f7d57;padding:6px;text-align:center">— nenhuma aldeia com paladino —</div>'; return; }
    const sel = config.paladin.villages || {};
    cont.innerHTML = vils.map((v) => '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#d3c299;margin:1px 0"><input type="checkbox" class="twmgr-pd-vil" data-vid="' + v.vid + '"' + (sel[v.vid] ? ' checked' : '') + '>' + esc(v.name) + '</label>').join('');
    cont.querySelectorAll('.twmgr-pd-vil').forEach((cb) => cb.addEventListener('change', readPaladinCfg));
  }
  const PALADIN_STATUS_LABEL = { home: '🟢 livre', training: '⏳ treinando', travel: '🚶 viajando', recruiting: '🐣 recrutando', attack: '⚔️ atacando', attacking: '⚔️ atacando', support: '🛡️ apoiando', 'sem-paladino': '— sem paladino', 'sem-regime-4h': '⚠️ sem regime 4h' };
  function renderPaladinStatus() {
    const cont = document.getElementById('twmgr-pd-status-list'); if (!cont) return;
    const villages = Object.keys(config.paladin.villages || {}).filter((v) => config.paladin.villages[v]);
    if (!villages.length) { cont.innerHTML = '<div style="font-size:10px;color:#8f7d57;padding:6px;text-align:center">— marque aldeias acima —</div>'; return; }
    const now = Date.now();
    cont.innerHTML = villages.map((vid) => {
      const st = (config.paladin.state && config.paladin.state[vid]) || {};
      // status desconhecido (tipo de activity que ainda não vimos) -> mostra genérico "ocupado" em
      // vez de esconder, já que o código já garante que ele será pulado até ficar livre de novo.
      const label = PALADIN_STATUS_LABEL[st.status] || (st.status ? ('⚔️ ocupado (' + st.status + ')') : '—');
      const rest = st.finishAt && st.finishAt > now ? fmt(st.finishAt - now) : '';
      return '<div style="display:flex;justify-content:space-between;gap:6px;font-size:10px;color:#d3c299;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
        '<span>' + esc(st.name || ('ID ' + vid)) + (st.level != null ? (' (nv.' + st.level + ')') : '') + '</span>' +
        '<span>' + label + (rest ? ' · ' + rest : '') + '</span>' +
      '</div>';
    }).join('');
  }

