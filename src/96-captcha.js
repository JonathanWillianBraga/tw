  // ==================== DETECTOR DE CAPTCHA ====================
  // Detecta popups de bot-check do TW e captchas hCaptcha/reCAPTCHA, dispara notificação
  // do navegador + POST em ntfy.sh/{topico}. Cooldown pra não spammar.
  const CAPTCHA_SELECTORS = [
    '#popup_box_bot_protection',
    '#bot_check',
    '#botprotection_quest',
    '#hcaptcha_container',
    '.h-captcha',
    'iframe[src*="hcaptcha.com"]',
    'iframe[src*="recaptcha"]',
    '.captcha_image',
  ];
  // Elemento realmente na tela? (tamanho > 0 e não escondido por CSS)
  function _elVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    const st = window.getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden';
  }
  // Título "Proteção contra Bots" — regex tolerante a acento/caixa/espaço (mesma ideia do scanForBotCheck).
  function _hasBotTitle(root) {
    if (!root) return false;
    for (const h of root.querySelectorAll('h2, h3')) {
      if (/prote..o contra bots?/i.test((h.textContent || '').trim())) return true;
    }
    return false;
  }
  // Detecção ESTRUTURAL do bot-check: 3 formatos que o TW usa, cada um exigindo o conjunto completo
  // (container + elemento interno + título visíveis). Bem mais difícil de dar falso-positivo do que
  // casar um seletor solto — a lib do hcaptcha vem pré-carregada em página normal.
  function isBotCheckBlock() {
    // Formato 1: #bot_protection com #botCheckFunc e #fader
    const bp = document.querySelector('#bot_protection');
    if (bp && _elVisible(bp) && _elVisible(bp.querySelector('#botCheckFunc'))
        && _elVisible(document.querySelector('#fader')) && _hasBotTitle(bp)) return 'bot_protection';
    // Formato 2: .bot-protection-row + .bot-protection-blur
    const row = document.querySelector('.bot-protection-row');
    const blur = document.querySelector('.bot-protection-blur');
    if (_elVisible(row) && _elVisible(blur) && _hasBotTitle(row)) return 'bot-protection-row';
    // Formato 3: popup com iframe do hcaptcha dentro
    for (const pop of document.querySelectorAll('.popup_box_content')) {
      if (_elVisible(pop) && _hasBotTitle(pop) && pop.querySelector('.captcha iframe[src*="hcaptcha.com"], iframe[src*="hcaptcha.com"]')) return 'bot-popup';
    }
    return null;
  }
  function isCaptchaVisible() {
    const structural = isBotCheckBlock();
    if (structural) return structural;
    for (const s of CAPTCHA_SELECTORS) {
      const el = document.querySelector(s);
      if (!el) continue;
      if (_elVisible(el)) return s;
    }
    return null;
  }
  async function ensureNotifyPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try { const p = await Notification.requestPermission(); return p === 'granted'; } catch (e) { return false; }
  }
  async function fireCaptchaNotification(reasonSel, manual) {
    const cfg = config.captcha;
    const now = Date.now();
    const cd = (cfg.cooldownSec || 300) * 1000;
    if (!manual && (now - (cfg.lastNotifiedAt || 0)) < cd) return;
    cfg.lastNotifiedAt = now; save();
    const world = window.game_data && window.game_data.world || WORLD;
    const msg = (manual ? '[TESTE] ' : '') + 'CAPTCHA detectado no TW · mundo ' + world + ' · aldeia ' + (CUR_NAME || CUR_VID) + (reasonSel ? (' [' + reasonSel + ']') : '');
    pushLog('⚠ ' + msg, 'err');
    // 1) Notificação do navegador
    if (cfg.browserNotif) {
      try {
        const ok = await ensureNotifyPermission();
        if (ok) {
          const n = new Notification('TW Manager · CAPTCHA', { body: msg, tag: 'twmgr-captcha', requireInteraction: true, icon: (IMG_BASE || '') + 'graphic/dots/red.png' });
          n.onclick = () => { try { window.focus(); n.close(); } catch (e) {} };
        } else if (Notification.permission === 'denied') {
          pushLog('Notif. do navegador está bloqueada — libere no cadeado do endereço.', 'err');
        }
      } catch (e) { pushLog('Notif. navegador falhou: ' + (e.message || e), 'err'); }
    }
    // 2) ntfy.sh
    if (cfg.ntfyTopic) {
      try {
        await fetch('https://ntfy.sh/' + encodeURIComponent(cfg.ntfyTopic.trim()), {
          method: 'POST',
          headers: {
            'Title': 'TW Manager · CAPTCHA',
            'Priority': 'urgent',
            'Tags': 'warning,robot,tribalwars',
            'Click': location.href,
          },
          body: msg,
        });
        pushLog('  ntfy.sh enviado → tópico "' + cfg.ntfyTopic.trim() + '"', 'ok');
      } catch (e) { pushLog('ntfy.sh falhou: ' + (e.message || e), 'err'); }
    }
  }
  // ---- ALARME GERAL ----
  // Quem detectar o bloqueio liga a flag; TODOS os módulos consultam captchaBlocked() antes de rodar
  // o ciclo. Assim o Manager para inteiro em vez de cada aba/módulo bater na parede e acumular erro.
  let _captchaBlocked = false;
  function captchaBlocked() { return _captchaBlocked; }
  function detectCaptcha() {
    let hit = isCaptchaVisible();
    // "Proteção contra Bots" é uma PÁGINA de texto (sem elementos hcaptcha). Escaneia o texto VISÍVEL
    // (innerText — NÃO textContent, que inclui <script> e dava falso-positivo com a lib hcaptcha).
    if (!hit) { try { const m = scanForBotCheck((document.body && document.body.innerText) || ''); if (m) hit = 'dom:' + m; } catch (e) {} }
    if (hit && !_captchaBlocked) { _captchaBlocked = true; pushLog('⛔ Bot-check na tela [' + hit + '] — módulos pausados até resolver.', 'err'); }
    else if (!hit && _captchaBlocked) { _captchaBlocked = false; pushLog('✔ Bot-check resolvido — módulos liberados.', 'ok'); }
    return hit;
  }
  let _captchaCheckLast = 0;
  function checkCaptchaOnce() {
    const now = Date.now();
    if (now - _captchaCheckLast < 1000) return;   // debounce
    _captchaCheckLast = now;
    const hit = detectCaptcha();   // sempre roda: a pausa não depende do alerta estar ligado
    if (!config.captcha || !config.captcha.enabled) return;
    if (hit) fireCaptchaNotification(hit, false);
  }
  function startCaptchaWatcher() {
    // Poll leve
    setInterval(checkCaptchaOnce, 5000);
    // Reação imediata a mudanças no DOM
    try {
      if (window.MutationObserver && document.body) {
        const obs = new MutationObserver(() => checkCaptchaOnce());
        obs.observe(document.body, { childList: true, subtree: true });
      }
    } catch (e) {}
    // Check inicial 1s após load (deixa TW montar overlays)
    setTimeout(checkCaptchaOnce, 1200);
  }
  function testCaptchaNotif() { fireCaptchaNotification('teste-manual', true); }

  // ---- Detecção do bot-check (só pelo DOM da página renderizada) ----
  function scanForBotCheck(text) {
    const hay = (text || '').toLowerCase();
    // APENAS frases VISÍVEIS da tela de verificação. NÃO usar identificadores como "hcaptcha"/"bot_check"/
    // "sitekey" — eles aparecem em scripts/HTML de páginas NORMAIS (a lib hcaptcha vem pré-carregada) e
    // davam falso-positivo. Chamar sempre com innerText (texto renderizado, sem <script>).
    if (/prote..o contra bots?|iniciar a verifica..o da prote..o|verifica..o da prote..o do bot|bot protection required/.test(hay)) return 'bot-page';
    return null;
  }
  function installBotHooks() {
    // Detecção do bot-check é 100% pelo watcher de DOM (texto visível + widget hcaptcha visível). NÃO
    // grampeamos fetch/XHR: o bot-check do br143 não é servido a requisições, e ler HTML cru dava
    // falso-positivo com a lib hcaptcha pré-carregada. Aqui fica só o helper de teste manual.
    try { window.__twSimBotCheck = function () { fireCaptchaNotification('teste-sim', true); return 'disparado'; }; } catch (e) {}
  }
  // Auto-F5 quando AFK: o bot-check do br143 só se revela num carregamento de página (F5). Então, se
  // você ficou sem mexer no mouse/teclado por X min, o script recarrega a página — aí a tela "Proteção
  // contra Bots" aparece e o watcher de DOM dispara o ntfy. NÃO recarrega se você está ativo, se outra
  // aba está no comando, ou se o bot-check já está na tela (deixa você resolver).
  let _reloadTimer = null, _lastActivity = Date.now();
  function _markActivity() { _lastActivity = Date.now(); }
  function maybeAutoReload() {
    try {
      const min = (config.captcha && config.captcha.reloadMin) || 0;
      if (!min || min < 1 || lockOther()) return;
      if (isCaptchaVisible() || scanForBotCheck((document.body && document.body.innerText) || '')) { checkCaptchaOnce(); return; }   // já tem bot-check: não recarrega
      if (Date.now() - _lastActivity < min * 60000) return;   // você está ativo -> não atrapalha
      // Não recarrega em cima de um desvio prestes a sair: o reload mata o timer e a retomada
      // levaria segundos que a tropa não tem. Adia pro próximo ciclo. (Ideia do Nexus, que usa uma
      // janela de segurança de 60s antes de qualquer auto-reload.)
      if (desviarSaidaProxima(60000)) { pushLog('Auto-F5 adiado: tem desvio saindo em menos de 1 min.', '', 'desv'); return; }
      // Mesma razão pra Central: recarregar no meio da escada de espera mata o timer, e
      // a retomada custa segundos que um trem de nobre não tem.
      if (ccJanelaCritica(60000)) { pushLog('Auto-F5 adiado: a Central tem disparo em menos de 1 min.', '', 'planner'); return; }
      location.reload();
    } catch (e) {}
  }
  function startAutoReload() {
    clearInterval(_reloadTimer);
    const min = (config.captcha && config.captcha.reloadMin) || 0;
    if (!min || min < 1) return;
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach((ev) => { try { window.addEventListener(ev, _markActivity, { passive: true }); } catch (e) {} });
    _reloadTimer = setInterval(maybeAutoReload, Math.max(60, min * 60) * 1000);
  }

  function tickUI() {
    if (anyRunning() && !lockOther()) claimLock();
    const now = Date.now();
    document.querySelectorAll('.twmgr-card').forEach((card) => {
      const t = config.targets.find((x) => x.id === card.getAttribute('data-id'));
      const c = card.querySelector('.twmgr-cnt'); if (!t || !c) return;
      if (!config.running || !t.enabled) { c.textContent = ''; }
      else if (config.running && lockOther()) { c.textContent = '⏸ outra aba'; }
      else if ((t.nextSendAt || 0) > now) c.textContent = fmt(t.nextSendAt - now);
      else c.textContent = '•••';
    });
    const g = document.getElementById('twmgr-global'); if (g) { g.textContent = !config.running ? '' : (lockOther() ? '⏸ inativa (outra aba está enviando)' : '● rodando'); g.style.color = lockOther() ? '#ff7568' : '#8fe39a'; }
    const sc = document.getElementById('twmgr-scav-status'); if (sc) { if (!config.scav.running) { sc.textContent = ''; } else if (lockOther()) { sc.textContent = '⏸ outra aba está ativa'; sc.style.color = '#ff7568'; } else { sc.style.color = '#8fe39a'; sc.textContent = (config.scav.nextAt || 0) > now ? '● próx. verificação: ' + fmt(config.scav.nextAt - now) : '● verificando…'; } }
    const fs = document.getElementById('twmgr-farm-status'); if (fs) { if (!config.farm.running) { fs.textContent = ''; } else if (lockOther()) { fs.textContent = '⏸ outra aba está ativa'; fs.style.color = '#ff7568'; } else { fs.style.color = '#8fe39a'; fs.textContent = (config.farm.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.farm.nextAt - now) : '● saqueando…'; } }
    const ws = document.getElementById('twmgr-wall-status'); if (ws) { if (!config.wall.running) { ws.textContent = ''; } else if (lockOther()) { ws.textContent = '⏸ outra aba está ativa'; ws.style.color = '#ff7568'; } else { ws.style.color = '#8fe39a'; ws.textContent = (config.wall.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.wall.nextAt - now) : '● quebrando…'; } }
    const rs = document.getElementById('twmgr-recruit-status'); if (rs) { if (!config.recruit.running) { rs.textContent = ''; } else if (lockOther()) { rs.textContent = '⏸ outra aba está ativa'; rs.style.color = '#ff7568'; } else { rs.style.color = '#8fe39a'; rs.textContent = (config.recruit.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.recruit.nextAt - now) : '● recrutando…'; } }
    const clk = document.getElementById('twmgr-srvclock'); if (clk) { try { clk.textContent = new Date(serverNow() - wallToServerOffset()).toLocaleTimeString(); } catch (e) {} }
    const fks = document.getElementById('twmgr-fk-status');
    if (fks) {
      if (!config.fakes.running) { fks.textContent = ''; }
      else if (lockOther()) { fks.textContent = '⏸ outra aba'; fks.style.color = '#ff7568'; }
      else {
        const gg = config.fakes.gen || [];
        const pend = gg.filter((f) => f.state === 'armed' || f.state === 'scheduled').length;
        const sent = gg.filter((f) => f.state === 'sent').length;
        const err = gg.filter((f) => f.state === 'error').length;
        const nx = gg.filter((f) => f.sendAt && (f.state === 'scheduled' || f.state === 'armed')).sort((a, b) => a.sendAt - b.sendAt)[0];
        fks.style.color = '#8fe39a';
        fks.textContent = '● ' + sent + ' env · ' + pend + ' pend' + (err ? (' · ' + err + ' erro') : '') + (nx ? (' · próx ' + fmt(nx.sendAt - serverNow())) : '');
      }
    }
    if (document.getElementById('twmgr-cards-fakes')) refreshCards('fakes');
    const mk = document.getElementById('twmgr-mk-status'); if (mk) {
      if (!config.market.running) { mk.textContent = ''; }
      else if (lockOther()) { mk.textContent = '⏸ outra aba'; mk.style.color = '#ff7568'; }
      else { mk.style.color = '#8fe39a'; mk.textContent = (config.market.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.market.nextAt - now) : '● enviando…'; }
    }
    const bl = document.getElementById('twmgr-bld-status'); if (bl) {
      if (!config.build.running) { bl.textContent = ''; }
      else if (lockOther()) { bl.textContent = '⏸ outra aba'; bl.style.color = '#ff7568'; }
      else { bl.style.color = '#8fe39a'; bl.textContent = (config.build.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.build.nextAt - now) : '● construindo…'; }
    }
    const bb = document.getElementById('twmgr-bb-status'); if (bb) {
      if (!config.bb.running) { bb.textContent = ''; }
      else if (lockOther()) { bb.textContent = '⏸ outra aba'; bb.style.color = '#ff7568'; }
      else { bb.style.color = '#8fe39a'; bb.textContent = (config.bb.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.bb.nextAt - now) : '● desenvolvendo…'; }
    }
    const bm = document.getElementById('twmgr-bm-status'); if (bm) {
      if (!config.map || !config.map.running) { bm.textContent = ''; }
      else if (lockOther()) { bm.textContent = '⏸ outra aba'; bm.style.color = '#ff7568'; }
      else { bm.style.color = '#8fe39a'; bm.textContent = (config.map.nextAt || 0) > now ? '● próximo ciclo: ' + fmt(config.map.nextAt - now) : '● rastreando…'; }
    }
    const plClk = document.getElementById('twmgr-pl-srvclock'); if (plClk) { try { plClk.textContent = new Date(serverNow() - wallToServerOffset()).toLocaleTimeString(); } catch (e) {} }
    const pls = document.getElementById('twmgr-pl-status');
    if (pls) {
      const plAtk = config.planner && plActive();
      if (!plAtk || !plAtk.running) { pls.textContent = ''; }
      else if (lockOther()) { pls.textContent = '⏸ outra aba'; pls.style.color = '#ff7568'; }
      else {
        const rr = (plAtk.rows || []);
        const pend = rr.filter((r) => r.state === 'armed' || r.state === 'scheduled').length;
        const sent = rr.filter((r) => r.state === 'sent').length;
        const err = rr.filter((r) => r.state === 'error').length;
        const nx = rr.filter((r) => r.sendAt && (r.state === 'scheduled' || r.state === 'armed')).sort((a, b) => a.sendAt - b.sendAt)[0];
        pls.style.color = '#8fe39a';
        pls.textContent = '● ' + sent + ' env · ' + pend + ' pend' + (err ? (' · ' + err + ' erro') : '') + (nx ? (' · próx ' + fmt(nx.sendAt - serverNow())) : '');
      }
    }
    if (document.getElementById('twmgr-cards-planner')) refreshCards('planner');
    if (document.getElementById('twmgr-pl-queue')) { try { renderPlannerQueue(plActive()); } catch (e) {} }
    const pds = document.getElementById('twmgr-pd-status');
    if (pds) {
      if (!config.paladin.running) { pds.textContent = ''; }
      else if (lockOther()) { pds.textContent = '⏸ outra aba'; pds.style.color = '#ff7568'; }
      else { pds.style.color = '#8fe39a'; pds.textContent = '● ' + Object.keys(config.paladin.villages || {}).filter((v) => config.paladin.villages[v]).length + ' aldeia(s) no ciclo'; }
    }
    if (document.getElementById('twmgr-pd-status-list')) renderPaladinStatus();
    // Atualiza só o indicador (●) de cada aba de ataque, sem reconstruir a lista (evita "roubar" cliques).
    document.querySelectorAll('.twmgr-pl-tab').forEach((el) => {
      const atk = (config.planner.attacks || []).find((a) => a.id === el.getAttribute('data-id'));
      const dot = el.querySelector('.twmgr-pl-tab-dot');
      if (dot) dot.style.display = (atk && atk.running) ? 'inline' : 'none';
    });
    const ring = (id, on) => { const b = document.getElementById(id); if (b) b.classList.toggle('twmgr-run', !!on && !lockOther()); };
    ring('twmgr-btab-bb', config.bb && config.bb.running);
    ring('twmgr-btab-map', (config.map && config.map.running) || (config.lock && config.lock.running));
    ring('twmgr-btab-scav', config.scav.running);
    ring('twmgr-btab-farm', config.farm.running);
    ring('twmgr-btab-wall', config.wall && config.wall.running);
    ring('twmgr-btab-recruit', config.recruit.running);
    ring('twmgr-btab-fakes', config.fakes.running);
    ring('twmgr-btab-market', config.market.running);
    ring('twmgr-btab-build', config.build.running);
    ring('twmgr-btab-planner', config.planner && config.planner.attacks && config.planner.attacks.some((a) => a.running));
    ring('twmgr-btab-paladin', config.paladin && config.paladin.running);
    ring('twmgr-btab-obra', config.obra && config.obra.running);
    ring('twmgr-btab-etiqueta', config.etiqueta && config.etiqueta.running);
    const dot = document.getElementById('twmgr-dot'); if (dot) dot.classList.toggle('on', anyRunning() && !lockOther());
  }

  function readTargets() {
    const old = {}; config.targets.forEach((t) => { old[t.id] = t; });
    const arr = [];
    document.querySelectorAll('.twmgr-card').forEach((card) => {
      const id = card.getAttribute('data-id');
      const m = card.querySelector('.twmgr-xy').value.trim().match(/(\d+)\s*[|.\-\s]\s*(\d+)/);
      const units = {};
      card.querySelectorAll('.twmgr-q').forEach((q) => { const u = q.getAttribute('data-unit'); units[u] = units[u] || {}; units[u].qty = parseInt(q.value, 10) || 0; });
      card.querySelectorAll('.twmgr-m').forEach((mx) => { const u = mx.getAttribute('data-unit'); units[u] = units[u] || {}; units[u].max = mx.checked; });
      const o = old[id] || {};
      arr.push({ id, x: m ? m[1] : '', y: m ? m[2] : '', enabled: card.querySelector('.twmgr-en').checked, units, nextSendAt: o.nextSendAt || 0, phase: o.phase, lastSentAt: o.lastSentAt, origin: o.origin || CUR_VID, originName: o.originName || CUR_NAME });
    });
    config.targets = arr; save();
  }
  function cardHTML(t) {
    let trs = '';
    for (let i = 0; i < UNITS.length; i += 2) {
      trs += '<tr>' + [UNITS[i], UNITS[i + 1]].map((pair) => {
        if (!pair) return '<td></td><td></td><td></td>';
        const [u, n] = pair; const c = t.units[u] || {};
        return '<td title="' + n + '">' + unitIcon(u, n) + '</td>' + '<td><input class="twmgr-q twmgr-inp twmgr-qi" data-unit="' + u + '" type="number" min="0" value="' + (c.qty || 0) + '"></td>' + '<td style="text-align:center"><input class="twmgr-m" data-unit="' + u + '" type="checkbox"' + (c.max ? ' checked' : '') + '></td>';
      }).join('') + '</tr>';
    }
    return '<div class="twmgr-card" data-id="' + t.id + '"><div class="twmgr-card-head"><input class="twmgr-en" type="checkbox"' + (t.enabled ? ' checked' : '') + ' title="ativar este alvo"><input class="twmgr-xy twmgr-inp" placeholder="500|500" value="' + (t.x && t.y ? t.x + '|' + t.y : '') + '"><span class="twmgr-cnt"></span><span class="twmgr-exp" title="tropas">▾</span><span class="twmgr-del" title="remover">✕</span></div><div class="twmgr-from">de: ' + (t.originName || CUR_NAME) + '</div><div class="twmgr-troops"><table>' + trs + '</table></div></div>';
  }
  function renderTargets() {
    const cont = document.getElementById('twmgr-targets'); if (!cont) return;
    if (!config.targets.length) config.targets.push({ id: genId(), x: '', y: '', enabled: true, units: {}, nextSendAt: 0, origin: CUR_VID, originName: CUR_NAME });
    cont.innerHTML = config.targets.map(cardHTML).join('');
    cont.querySelectorAll('.twmgr-card').forEach((card) => {
      card.querySelector('.twmgr-exp').addEventListener('click', () => { const tr = card.querySelector('.twmgr-troops'); tr.style.display = tr.style.display === 'none' ? 'block' : 'none'; });
      card.querySelector('.twmgr-del').addEventListener('click', () => { readTargets(); config.targets = config.targets.filter((t) => t.id !== card.getAttribute('data-id')); save(); renderTargets(); });
    });
  }

  function start() {
    readTargets();
    const valid = config.targets.filter((t) => t.enabled && hasUnits(t) && t.x && t.y);
    if (!valid.length) { pushLog('Nenhum alvo válido (defina coord + tropas e ative).', 'err'); return; }
    config.targets.forEach((t) => { t.nextSendAt = 0; });
    config.running = true; save();
    setStatus(true); pushLog('Iniciado · ' + valid.length + ' alvo(s) · origem ' + CUR_NAME, 'ok'); processDue();
  }
  function stop() { readTargets(); config.running = false; save(); clearTimeout(sendTimer); setStatus(false); pushLog('Parado.'); }
  function setBtnState(startId, stopId, on, labelOn, labelOff) {
    const st = document.getElementById(startId), sp = document.getElementById(stopId);
    if (st) { st.textContent = on ? labelOn : labelOff; st.classList.toggle('on', on); }
    if (sp) sp.classList.toggle('dim', !on);
  }
  function setStatus(on) { setBtnState('twmgr-start', 'twmgr-stop', on, '● Ativo', '▶ Iniciar'); }
  function readScavUnlockCfg() {
    const c = config.scav, g = (id) => document.getElementById(id);
    if (g('twmgr-scav-unlock')) c.autoUnlock = !!g('twmgr-scav-unlock').checked;
    if (g('twmgr-scav-unlock-ate')) c.unlockAte = Math.max(1, Math.min(4, parseInt(g('twmgr-scav-unlock-ate').value, 10) || 4));
    if (g('twmgr-scav-unlock-puxar')) c.unlockPuxar = !!g('twmgr-scav-unlock-puxar').checked;
    if (g('twmgr-scav-unlock-res')) c.unlockReserva = Math.max(0, parseInt(g('twmgr-scav-unlock-res').value, 10) || 0);
    if (g('twmgr-scav-unlock-org')) c.unlockMaxOrigens = Math.max(1, Math.min(20, parseInt(g('twmgr-scav-unlock-org').value, 10) || 5));
    save();
  }

  // Quem está travado por falta de recurso, e quanto falta. Sem isto o usuário não teria
  // como saber por que uma aldeia não abriu a coleta — ficaria parecendo que não funciona.
  function renderScavFalta() {
    const box = document.getElementById('twmgr-scav-falta'); if (!box) return;
    const f = config.scav.faltouRecurso || {};
    const ks = Object.keys(f);
    if (!ks.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="twmgr-sec-h" style="margin:0 0 4px">Travadas por falta de recurso (' + ks.length + ')</div>' +
      ks.slice(0, 12).map((vid) => {
        const r = f[vid];
        const falta = RES3.filter((k) => r.falta[k]).map((k) => fmtN(r.falta[k]) + ' ' + ({ wood: 'mad', stone: 'arg', iron: 'fer' })[k]).join(' · ');
        return '<div style="font-size:10px;color:#cdbb92;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04)">' +
          '<span style="color:#ffd76a">' + esc(r.nome) + '</span> <span style="color:#8f7d57">' + esc(r.opcao) + '</span> — <span style="color:#e6a89d">' + falta + '</span></div>';
      }).join('') + (ks.length > 12 ? '<div style="font-size:9px;color:#8f7d57;padding:2px 0">…e mais ' + (ks.length - 12) + '</div>' : '');
  }

  function readScavUnits() {
    config.scav.units = config.scav.units || {};
    SCAV_UNITS.forEach(([u]) => { const el = document.getElementById('twmgr-su-' + u); if (el) config.scav.units[u] = el.checked; });
    const mh = document.getElementById('twmgr-scav-maxh');
    if (mh) config.scav.maxHours = Math.max(0, parseFloat((mh.value || '').replace(',', '.')) || 0);
    save();
  }
  function scavStart() { readScavUnits(); if (!SCAV_UNITS.some(([u]) => config.scav.units[u])) { pushLog('Coleta: marque ao menos 1 unidade.', 'err', 'scav'); return; } config.scav.running = true; config.scav.nextAt = 0; save(); setScavStatus(true); pushLog('Coleta iniciada em todas as aldeias.', 'ok', 'scav'); scavTick(); }
  function scavStop() { readScavUnits(); config.scav.running = false; save(); clearTimeout(scavTimer); setScavStatus(false); pushLog('Coleta parada.', '', 'scav'); }
  function setScavStatus(on) { setBtnState('twmgr-scav-start', 'twmgr-scav-stop', on, '● Coletando', '▶ Coletar'); }
  function readFarmCfg() {
    const pw = document.getElementById('twmgr-farm-wood'); if (pw) config.farm.minWood = parseInt(pw.value, 10) || 0;
    const ps = document.getElementById('twmgr-farm-stone'); if (ps) config.farm.minStone = parseInt(ps.value, 10) || 0;
    const pi = document.getElementById('twmgr-farm-iron'); if (pi) config.farm.minIron = parseInt(pi.value, 10) || 0;
    const it = document.getElementById('twmgr-farm-int'); if (it) config.farm.interval = Math.max(1, parseInt(it.value, 10) || 10) * 60;
    const dt = document.getElementById('twmgr-farm-dist'); if (dt) config.farm.maxDist = parseFloat((dt.value || '').replace(',', '.')) || 13;
    const wl = document.getElementById('twmgr-farm-wall'); if (wl) { config.farm.maxWall = parseInt(wl.value, 10); if (isNaN(config.farm.maxWall)) config.farm.maxWall = 20; }
    const bw = document.getElementById('twmgr-farm-bluewall'); if (bw) { config.farm.blueMaxWall = parseInt(bw.value, 10); if (isNaN(config.farm.blueMaxWall) || config.farm.blueMaxWall < 0) config.farm.blueMaxWall = 0; }
    const md = document.getElementById('twmgr-farm-mode'); if (md) config.farm.mode = md.value || 'suave';
    const gp = document.getElementById('twmgr-farm-group'); if (gp) config.farm.group = gp.value || null;
    const rp = document.getElementById('twmgr-farm-repeat'); if (rp) config.farm.repeat = rp.checked;
    const rm = document.getElementById('twmgr-farm-repeatmin'); if (rm) { config.farm.repeatMin = parseInt(rm.value, 10); if (isNaN(config.farm.repeatMin) || config.farm.repeatMin < 1) config.farm.repeatMin = 10; }
    const mc = document.getElementById('twmgr-farm-mincl'); if (mc) config.farm.minCL = Math.max(0, parseInt(mc.value, 10) || 0);
    const od = document.getElementById('twmgr-farm-order'); if (od) config.farm.order = od.value || 'dist';
    const dy = document.getElementById('twmgr-farm-dyn'); if (dy) config.farm.dynTemplate = dy.checked;
    if (!config.farm.matrix) config.farm.matrix = defFarmMatrix();
    FARM_COLORS.forEach((k) => {
      const a = (document.getElementById('twmgr-fm-' + k + '-a') || {}).checked;
      const b = (document.getElementById('twmgr-fm-' + k + '-b') || {}).checked;
      const cc = (document.getElementById('twmgr-fm-' + k + '-c') || {}).checked;
      let mode = 'none';
      if (a) mode = 'a'; else if (b) mode = 'b'; else if (cc) mode = 'c';
      config.farm.matrix[k] = { mode: mode, qty: 1 };
    });
    save();
  }
  function farmStart() { readFarmCfg(); config.farm.running = true; config.farm.nextAt = 0; save(); setFarmStatus(true); setFarmProg('Lendo o assistente…'); pushLog('Saque iniciado — modo ' + config.farm.mode + ', ordem por ' + config.farm.order + (config.farm.dynTemplate ? ', template dinâmico' : '') + '.', 'ok', 'farm'); farmTick(); }
  function farmStop() { readFarmCfg(); config.farm.running = false; save(); clearTimeout(farmTimer); setFarmStatus(false); setFarmProg('Saque parado.'); pushLog('Saque parado.', '', 'farm'); }
  function setFarmStatus(on) { setBtnState('twmgr-farm-start', 'twmgr-farm-stop', on, '● Saqueando', '▶ Saquear'); }
  // Barra de progresso do ciclo DENTRO da aba Saque (substituiu a linha viva no log, que empurrava
  // as outras mensagens e só cabia em texto). Aqui dá pra desenhar barra de verdade.
  function setFarmProg(html) { const el = document.getElementById('twmgr-farm-prog'); if (el) el.innerHTML = html; }
  function farmProgHTML(done, total, right) {
    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round(done / total * 100))) : 0;
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<div style="flex:1;height:9px;background:rgba(255,255,255,.09);border-radius:5px;overflow:hidden">' +
        '<div style="width:' + pct + '%;height:100%;background:#8fe39a;transition:width .25s"></div></div>' +
      '<span style="white-space:nowrap;font-variant-numeric:tabular-nums">' + done + '/' + total + '</span></div>' +
      (right ? ('<div style="margin-top:3px;opacity:.85">' + right + '</div>') : '');
  }
  function readWallCfg() {
    const wn = document.getElementById('twmgr-wall-min'); if (wn) { config.wall.wallMin = parseInt(wn.value, 10); if (isNaN(config.wall.wallMin)) config.wall.wallMin = 1; }
    const wx = document.getElementById('twmgr-wall-max'); if (wx) { config.wall.wallMax = parseInt(wx.value, 10); if (isNaN(config.wall.wallMax)) config.wall.wallMax = 6; }
    const wm = document.getElementById('twmgr-wall-mode'); if (wm) config.wall.ramMode = wm.value || 'auto';
    const wa = document.getElementById('twmgr-wall-axe'); if (wa) config.wall.axeCount = Math.max(1, parseInt(wa.value, 10) || 80);
    const w6 = document.getElementById('twmgr-wall-ramw6'); if (w6) config.wall.ramWall6 = Math.max(1, parseInt(w6.value, 10) || 24);
    const wf = document.getElementById('twmgr-wall-ramfix'); if (wf) config.wall.ramFixed = Math.max(1, parseInt(wf.value, 10) || 20);
    const wi = document.getElementById('twmgr-wall-int'); if (wi) config.wall.interval = Math.max(1, parseInt(wi.value, 10) || 10) * 60;
    save();
  }
  function wallStart() { readWallCfg(); config.wall.running = true; config.wall.nextAt = 0; save(); setWallStatus(true); pushLog('Muralha iniciada — muros ' + config.wall.wallMin + ' a ' + config.wall.wallMax + ', ' + config.wall.axeCount + ' bárbaro/ataque, aríete ' + config.wall.ramMode + '.', 'ok', 'wall'); wallTick(); }
  function wallStop() { readWallCfg(); config.wall.running = false; save(); clearTimeout(wallTimer); setWallStatus(false); pushLog('Muralha parada.', '', 'wall'); }
  function setWallStatus(on) { setBtnState('twmgr-wall-start', 'twmgr-wall-stop', on, '● Quebrando', '▶ Quebrar'); }
  async function runDiagnostics() {
    pushLog('Diagnóstico: lendo estado da aldeia…');
    try {
      const st = await getVillageState();
      const av = UNITS.filter(([u]) => st.avail[u] > 0).map(([u, n]) => n + ':' + st.avail[u]).join('  ') || '(nenhuma disponível)';
      pushLog('Tropas → ' + av);
      if (!st.commands.length) pushLog('Comandos → nenhum movimento detectado.');
      else st.commands.forEach((c) => pushLog('cmd · ' + c.kind + ' · ' + (c.coord || '?') + ' · volta em ' + (c.endMs ? fmt(c.endMs - Date.now()) : '?')));
      showTab('log');
    } catch (e) { pushLog('Diagnóstico falhou: ' + (e.message || e), 'err'); }
  }

  function injectStyles() {
    if (document.getElementById('twmgr-css')) return;
    const s = document.createElement('style'); s.id = 'twmgr-css';
    s.textContent = [
      "#twmgr-panel{position:fixed;top:12px;right:12px;z-index:99999;width:480px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);display:flex;flex-direction:column;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#e9dcc2;background:linear-gradient(160deg,#2a2016,#201810);border:1px solid #b8912e;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.6);overflow:hidden}",
      "#twmgr-panel *{box-sizing:border-box}",
      "#twmgr-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;cursor:move;background:linear-gradient(90deg,#6e5015,#9a721c 55%,#caa031);color:#fff;border-bottom:1px solid #8a6a20}",
      "#twmgr-head .twmgr-title{font-weight:700;font-size:12px;letter-spacing:.3px;display:flex;align-items:center;gap:6px}",
      "#twmgr-head .twmgr-ver{font-weight:400;font-size:8px;opacity:.75}",
      "#twmgr-head-actions{flex:0 0 auto;display:flex;align-items:center;gap:7px}",
      "#twmgr-min{cursor:pointer;font-size:17px;line-height:1;padding:0 2px;opacity:.85}#twmgr-min:hover{opacity:1}",
      "#twmgr-logbtn,#twmgr-upd-btn{cursor:pointer;font-size:13px;line-height:1;padding:2px 3px;border-radius:5px;opacity:.85;position:relative;transition:.15s}",
      "#twmgr-logbtn:hover,#twmgr-upd-btn:hover{opacity:1;background:rgba(255,255,255,.14)}",
      "#twmgr-upd-badge{position:absolute;top:-3px;right:-2px;color:#ff5a5a;font-size:9px}",
      ".twmgr-tabs{flex:0 0 auto;display:flex;flex-wrap:nowrap;overflow-x:auto;background:#1a140d;border-bottom:1px solid #3a2e1b;scrollbar-width:thin}",
      ".twmgr-tab{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:5px 1px;cursor:pointer;color:#a2926c;border-bottom:2px solid transparent;transition:.15s}",
      ".twmgr-tab:hover{color:#e8d29a;background:rgba(212,175,55,.06)}",
      ".twmgr-tab.active{color:#ffe08a;border-bottom-color:#d4af37;background:rgba(212,175,55,.10)}",
      ".twmgr-tab-ico{font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;border:2px solid transparent;transition:.2s}",
      ".twmgr-tab-lbl{font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}",
      ".twmgr-tab.twmgr-run .twmgr-tab-ico{border-color:#3fce54;background:rgba(63,206,84,.15);box-shadow:0 0 9px rgba(63,206,84,.6)}",
      ".twmgr-ui{width:18px;height:18px;vertical-align:middle}",
      ".twmgr-fmtable{width:100%;border-collapse:collapse;font-size:11px}",
      ".twmgr-fmtable th{font-size:10px;color:#ffd76a !important;font-weight:700;padding:4px 2px;border-bottom:1px solid #6a5320;text-transform:uppercase;vertical-align:middle;background:#160f06 !important;background-image:none !important}",
      ".twmgr-fmtable td{vertical-align:middle}",
      ".twmgr-fmtable th:first-child,.twmgr-fmrow td:first-child{text-align:left}",
      ".twmgr-fmtable th:not(:first-child),.twmgr-fmrow td:not(:first-child){width:44px;text-align:center}",
      ".twmgr-fmrow{border-bottom:1px solid rgba(255,255,255,.04)}",
      ".twmgr-fmrow:hover{background:rgba(212,175,55,.06)}",
      ".twmgr-fmck{width:15px;height:15px;cursor:pointer;vertical-align:middle;margin:0}",
      ".twmgr-card-break{flex-basis:100%;height:0}",
      ".twmgr-cards{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}",
      ".twmgr-card-mini{flex:1 1 0;min-width:58px;background:linear-gradient(165deg,#241a0e,#181008);border:1px solid #45351d;border-radius:9px;padding:7px 6px 6px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}",
      ".twmgr-card-wide{flex-basis:100%}",
      ".twmgr-card-v{font-size:19px;font-weight:800;color:#ffd76a;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".twmgr-card-l{font-size:8px;color:#9a8a63;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".twmgr-section{border:1px solid #3a2e1b;border-radius:9px;padding:8px 9px;margin-bottom:9px;background:rgba(0,0,0,.14)}",
      ".twmgr-sec-h{font-size:9px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#c9a24a;margin:-2px 0 6px}",
      ".twmgr-modlog{margin-top:10px;border-top:1px solid #3a2e1b;padding-top:6px}",
      ".twmgr-modlog-head{cursor:pointer;font-size:10px;color:#c9b88f;user-select:none;display:flex;align-items:center;gap:5px}",
      ".twmgr-modlog-head:hover{color:#ffe08a}",
      ".twmgr-modlog-body{max-height:180px;overflow-y:auto;margin-top:5px;font-size:10px}",
      ".twmgr-btn.on{box-shadow:0 0 12px rgba(76,200,90,.85),inset 0 0 0 1px rgba(255,255,255,.3)}",
      ".twmgr-btn.dim{opacity:.4 !important;filter:grayscale(.5);cursor:default}",
      "#twmgr-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:11px 12px 12px}",
      "#twmgr-body::-webkit-scrollbar{width:9px}#twmgr-body::-webkit-scrollbar-thumb{background:#4a3a22;border-radius:4px}#twmgr-body::-webkit-scrollbar-track{background:#1a140d}",
      ".twmgr-hint{font-size:10px;color:#b0a079;line-height:1.4;margin-bottom:9px}.twmgr-hint b{color:#e8d29a}",
      ".twmgr-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}",
      ".twmgr-lbl{font-size:10px;color:#c9b88f}",
      ".twmgr-inp{background:#161009 !important;border:1px solid #5c4a29 !important;color:#f2e8cf !important;border-radius:7px !important;padding:5px 7px !important;font-size:11px !important;outline:none !important;transition:.15s}",
      ".twmgr-inp:focus{border-color:#d4af37 !important;box-shadow:0 0 0 2px rgba(212,175,55,.25) !important}",
      "#twmgr-panel input[type=checkbox]{accent-color:#d4af37;width:15px;height:15px;cursor:pointer;vertical-align:middle}",
      ".twmgr-btn{border:none;border-radius:8px;padding:7px 10px;font-size:11px;font-weight:600;cursor:pointer;transition:.15s;color:#fff}",
      ".twmgr-btn:hover{filter:brightness(1.12)}.twmgr-btn:active{transform:translateY(1px)}",
      ".twmgr-go{background:linear-gradient(180deg,#3bb14a,#2e7d32) !important;color:#fff !important}",
      ".twmgr-stop{background:linear-gradient(180deg,#e6584a,#b3271a) !important;color:#fff !important}",
      ".twmgr-ghost{background:rgba(212,175,55,.10) !important;border:1px solid #8a6d2a !important;color:#ecd9a3 !important}.twmgr-ghost:hover{background:rgba(212,175,55,.2) !important}",
      ".twmgr-add{width:100%;background:transparent !important;border:1px dashed #8a6d2a !important;color:#e6cf7d !important;border-radius:8px;padding:6px;font-size:11px;font-weight:600;cursor:pointer;margin-bottom:8px}.twmgr-add:hover{background:rgba(212,175,55,.10) !important}",
      ".twmgr-actions{display:flex;gap:8px;margin-bottom:7px}.twmgr-actions .twmgr-btn{flex:1}",
      ".twmgr-cstatus{text-align:center;font-size:10px;font-weight:600;min-height:13px;color:#c9b88f}",
      ".twmgr-card{background:linear-gradient(180deg,#261d13,#1d1510);border:1px solid #473721;border-radius:9px;margin-bottom:7px;overflow:hidden}",
      ".twmgr-card-head{display:flex;align-items:center;gap:7px;padding:7px 9px}",
      ".twmgr-xy{flex:0 0 76px;width:76px;text-align:center}",
      ".twmgr-cnt{flex:1;text-align:center;font-size:11px;font-weight:700;color:#ffd76a;font-variant-numeric:tabular-nums}",
      ".twmgr-exp,.twmgr-del{cursor:pointer;font-size:12px;width:20px;height:20px;line-height:20px;text-align:center;border-radius:5px;color:#c9b88f}",
      ".twmgr-exp:hover{background:rgba(212,175,55,.15);color:#ffe08a}",
      ".twmgr-del{color:#e6a89d}.twmgr-del:hover{background:rgba(231,76,60,.18);color:#ff6f5e}",
      ".twmgr-from{font-size:9px;color:#8f7d57;padding:0 9px 6px}",
      ".twmgr-troops{display:none;padding:6px 9px 8px;border-top:1px solid #3a2c1a}.twmgr-troops table{width:100%;border-collapse:collapse}",
      ".twmgr-troops td{padding:2px 3px;font-size:10px;color:#cdbb92}.twmgr-qi{width:46px;text-align:center}",
      ".twmgr-units{display:grid;grid-template-columns:1fr 1fr;gap:6px 8px;margin-bottom:9px}",
      ".twmgr-units label{display:flex;align-items:center;gap:7px;font-size:11px;color:#d3c299;cursor:pointer}",
      ".twmgr-res{display:flex;gap:6px;margin:5px 0 9px}.twmgr-res label{flex:1;display:flex;align-items:center;gap:4px;font-size:13px}.twmgr-res .twmgr-inp{width:100%;font-size:11px !important}",
      ".twmgr-check{display:flex;align-items:center;gap:8px;font-size:11px;color:#d3c299;margin-bottom:10px;cursor:pointer}",
      ".twmgr-log{height:150px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:8px;padding:7px 8px;font-family:Consolas,'Courier New',monospace;font-size:10px;line-height:1.45}",
      ".twmgr-log::-webkit-scrollbar{width:8px}.twmgr-log::-webkit-scrollbar-thumb{background:#4a3a22;border-radius:4px}",
      "#twmgr-panel.twmgr-collapsed{width:auto}",
      "#twmgr-panel.twmgr-collapsed .twmgr-tabs,#twmgr-panel.twmgr-collapsed #twmgr-body{display:none}",
      "#twmgr-panel.twmgr-collapsed #twmgr-head{border-bottom:none}",
      ".twmgr-dot{width:9px;height:9px;border-radius:50%;background:#5a4a2e;transition:.2s;flex:0 0 auto}",
      ".twmgr-dot.on{background:#3fce54;box-shadow:0 0 8px #3fce54}",
      ".twmgr-bld-plan{max-height:260px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:8px;padding:3px}",
      ".twmgr-bld-plan::-webkit-scrollbar{width:8px}.twmgr-bld-plan::-webkit-scrollbar-thumb{background:#4a3a22;border-radius:4px}",
      ".twmgr-bld-item{display:grid;grid-template-columns:22px 16px 18px 1fr 44px 18px 18px 18px;align-items:center;gap:4px;padding:3px 5px;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;color:#e9dcc2}",
      ".twmgr-bld-item:last-child{border-bottom:none}",
      ".twmgr-bld-item.twmgr-bld-off{opacity:.42;filter:grayscale(.6)}",
      ".twmgr-bld-ord{color:#8f7d57;font-size:9px;text-align:right}",
      ".twmgr-bld-ico{font-size:14px;text-align:center}",
      ".twmgr-bld-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".twmgr-bld-lvl{width:100% !important;text-align:center;padding:2px 4px !important;font-size:11px !important}",
      ".twmgr-bld-up,.twmgr-bld-down,.twmgr-bld-rm{cursor:pointer;text-align:center;font-size:11px;color:#c9b88f;border-radius:4px;user-select:none;padding:1px 0}",
      ".twmgr-bld-up:hover,.twmgr-bld-down:hover{background:rgba(212,175,55,.18);color:#ffe08a}",
      ".twmgr-bld-rm{color:#e6a89d}.twmgr-bld-rm:hover{background:rgba(231,76,60,.22);color:#ff6f5e}",
      ".twmgr-bld-sub{background:rgba(212,175,55,.08) !important;border:1px solid #5c4a29 !important;color:#c9b88f !important}",
      ".twmgr-bld-sub.on{background:linear-gradient(180deg,#7a5a20,#5a4218) !important;color:#ffe08a !important;border-color:#d4af37 !important}",
    ].join('');
    document.head.appendChild(s);
  }

  function showTab(name) {
    ['scav', 'farm', 'wall', 'recruit', 'fakes', 'market', 'build', 'bb', 'map', 'planner', 'paladin', 'etiqueta', 'obra', 'log'].forEach((n) => {
      const c = document.getElementById('twmgr-tab-' + n); if (c) c.style.display = n === name ? 'block' : 'none';
      const b = document.getElementById('twmgr-btab-' + n); if (b) b.classList.toggle('active', n === name);
    });
  }

  function buildUI() {
    injectStyles();
    // Segunda linha de defesa: mesmo com a trava lá em cima, nunca cria um painel se já
    // houver um. Dois elementos com o mesmo id fazem getElementById devolver o primeiro, e
    // aí metade da fiação vai parar no painel errado — sintoma dificílimo de diagnosticar.
    if (document.getElementById('twmgr-panel')) { console.warn('[TWMgr] painel ja existe — buildUI ignorado.'); return; }
    const p = document.createElement('div'); p.id = 'twmgr-panel';
    const tabBtn = (n, ico, label) => '<div id="twmgr-btab-' + n + '" class="twmgr-tab" data-tab="' + n + '"><span class="twmgr-tab-ico">' + ico + '</span><span class="twmgr-tab-lbl">' + label + '</span></div>';
    // Saque: matriz estilo FarmGod — A/B/C são checkboxes; regra "1 por linha" garantida no JS (marcar um desmarca os outros).
    const fmRow = (k, label) => '<tr class="twmgr-fmrow">' +
      '<td style="text-align:left;padding:3px 6px">' + label + '</td>' +
      '<td style="text-align:center"><input id="twmgr-fm-' + k + '-a" class="twmgr-fmck" type="checkbox"></td>' +
      '<td style="text-align:center"><input id="twmgr-fm-' + k + '-b" class="twmgr-fmck" type="checkbox"></td>' +
      '<td style="text-align:center"><input id="twmgr-fm-' + k + '-c" class="twmgr-fmck" type="checkbox"></td></tr>';
    // Helpers de layout: cards no topo, hint curto, seção com título, log recolhível por módulo.
    const cardsDiv = (mod) => '<div id="twmgr-cards-' + mod + '" class="twmgr-cards"></div>';
    const hint = (txt) => '<div class="twmgr-hint">' + txt + '</div>';
    const sec = (title, inner) => '<div class="twmgr-section">' + (title ? '<div class="twmgr-sec-h">' + title + '</div>' : '') + inner + '</div>';
    const modLog = (mod) => '<div class="twmgr-modlog"><div class="twmgr-modlog-head" data-modlog="' + mod + '">▸ Log do módulo (<span id="twmgr-modlog-count-' + mod + '">0</span>)</div><div id="twmgr-modlog-body-' + mod + '" class="twmgr-modlog-body" style="display:none"></div></div>';
    p.innerHTML =
      '<div id="twmgr-head"><span class="twmgr-title">🎯 TW Manager <span class="twmgr-ver">v' + VERSION + '</span></span><div id="twmgr-head-actions"><span id="twmgr-dot" class="twmgr-dot" title="algum módulo ativo"></span><span id="twmgr-logbtn" title="Log">📜</span><span id="twmgr-upd-btn" title="Verificar / instalar atualização">🔄<span id="twmgr-upd-badge" style="display:none">●</span></span><span id="twmgr-min" title="minimizar / restaurar">–</span></div></div>' +
      '<div class="twmgr-tabs">' + tabBtn('scav', '⛏️', 'Coletas') + tabBtn('farm', '🐎', 'Saque') + tabBtn('wall', '🐏', 'Muralha') + tabBtn('recruit', '🏹', 'Recrutar') + tabBtn('fakes', '🎭', 'Fakes') + tabBtn('market', '🏪', 'Mercado') + tabBtn('build', '🏗️', 'Edifícios') + tabBtn('bb', '🌱', 'Cultivo') + tabBtn('map', '🗺️', 'Mapa') + tabBtn('planner', '🎯', 'Coord.') + tabBtn('paladin', '🐴', 'Paladino') + tabBtn('etiqueta', '🏷️', 'Etiquetas') + tabBtn('obra', '🏛️', 'Obra') + '</div>' +
      '<div id="twmgr-body">' +
      '<div id="twmgr-tab-scav" style="display:none">' +
        hint('Coleta em <b>todas as aldeias</b>: reparte as tropas marcadas nas opções livres e reenvia no retorno.') +
        cardsDiv('scav') +
        sec('Tropas na coleta', '<div class="twmgr-units">' + SCAV_UNITS.map(([u, n]) => '<label><input id="twmgr-su-' + u + '" type="checkbox"> ' + unitIcon(u, n) + ' ' + n + '</label>').join('') + '</div>') +
        sec('Desbloqueio automático',
          '<label class="twmgr-check" title="A cada ciclo, abre a próxima coleta de cada aldeia que já puder ser aberta."><input id="twmgr-scav-unlock" type="checkbox"> Desbloquear coletas automaticamente</label>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Desbloquear até</span><select id="twmgr-scav-unlock-ate" class="twmgr-inp" style="width:150px">' +
            '<option value="1">1 · Pequena</option><option value="2">2 · Média</option><option value="3">3 · Grande</option><option value="4">4 · Extrema</option></select></div>' +
          '<label class="twmgr-check" title="Faltando recurso, manda o que falta de outras aldeias suas na mesma hora. O desbloqueio acontece no ciclo seguinte, quando o transporte chegar."><input id="twmgr-scav-unlock-puxar" type="checkbox"> Puxar recurso de outras aldeias quando faltar</label>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="A aldeia que doa nunca fica abaixo disto em cada recurso.">Reserva da doadora (cada recurso)</span><input id="twmgr-scav-unlock-res" class="twmgr-inp" type="number" min="0" step="500" value="5000" style="width:80px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Quantas aldeias no máximo contribuem para um mesmo desbloqueio. As mais próximas primeiro.">Máx. de aldeias doadoras</span><input id="twmgr-scav-unlock-org" class="twmgr-inp" type="number" min="1" max="20" value="5" style="width:66px"></div>' +
          '<div class="twmgr-hint" style="margin:0">Custo: <b>1</b> 25/30/25 · <b>2</b> 250/300/250 · <b>3</b> 1k/1,2k/1k · <b>4</b> 10k/12k/10k. Cada aldeia abre uma de cada vez, e a de cima exige a de baixo.</div>' +
          '<div id="twmgr-scav-falta" style="margin-top:6px"></div>') +
        sec('Segurança',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Nenhum nível de coleta com duração acima disso é enviado — mesmo com tropa livre. 0 = sem limite. Útil em guerra, pra tropa nunca ficar fora de casa por muito tempo.">Tempo máximo por coleta (h, 0=sem limite)</span><input id="twmgr-scav-maxh" class="twmgr-inp" type="number" min="0" step="0.5" value="0" style="width:70px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-scav-start" class="twmgr-btn twmgr-go">▶ Coletar</button><button id="twmgr-scav-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-scav-status" class="twmgr-cstatus"></div>' +
        modLog('scav') +
      '</div>' +
      '<div id="twmgr-tab-farm" style="display:none">' +
        '<div id="twmgr-farm-prog" class="twmgr-hint">Saque parado.</div>' +
        cardsDiv('farm') +
        sec('Ataque por cor (marque 1 por linha)',
          '<table class="twmgr-fmtable"><tr><th style="text-align:left">cor</th><th>A</th><th>B</th><th>C</th></tr>' +
          fmRow('greenEmpty', '🟢 verde vazio') + fmRow('greenFull', '🟢 verde cheio') + fmRow('yellowEmpty', '🟡 amarelo vazio') + fmRow('yellowFull', '🟡 amarelo cheio') + fmRow('blue', '🔵 azul') + '</table>' +
          '<label class="twmgr-check" style="margin-top:6px"><input id="twmgr-farm-dyn" type="checkbox"> Template dinâmico (A=mín, B=+20% da carga)</label>') +
        sec('Recurso mínimo (só p/ o C)',
          '<div class="twmgr-res"><label><span class="icon header wood"></span><input id="twmgr-farm-wood" class="twmgr-inp" type="number" min="0" value="1000"></label><label><span class="icon header stone"></span><input id="twmgr-farm-stone" class="twmgr-inp" type="number" min="0" value="1000"></label><label><span class="icon header iron"></span><input id="twmgr-farm-iron" class="twmgr-inp" type="number" min="0" value="1000"></label></div>') +
        sec('Alcance',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo de aldeias</span><select id="twmgr-farm-group" class="twmgr-inp" style="width:170px"></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-farm-dist" class="twmgr-inp" type="number" min="0" step="0.1" value="13" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Muralha máx. (nível)</span><input id="twmgr-farm-wall" class="twmgr-inp" type="number" min="0" max="20" value="20" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Muralha máx. do azul</span><input id="twmgr-farm-bluewall" class="twmgr-inp" type="number" min="0" max="20" value="0" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Mínimo CL p/ farmar</span><input id="twmgr-farm-mincl" class="twmgr-inp" type="number" min="0" value="0" style="width:66px"></div>') +
        sec('Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Modo</span><select id="twmgr-farm-mode" class="twmgr-inp" style="width:120px"><option value="agressivo">Agressivo</option><option value="suave">Suave</option></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Ordem de farm</span><select id="twmgr-farm-order" class="twmgr-inp" style="width:130px"><option value="dist">Por distância</option><option value="recurso">Por recurso</option></select></div>' +
          '<label class="twmgr-check"><input id="twmgr-farm-repeat" type="checkbox"> Repetir farm (empilha ondas no mesmo alvo)</label>' +
          '<div class="twmgr-row" id="twmgr-farm-repeatrow"><span class="twmgr-lbl">Repetir a cada (min)</span><input id="twmgr-farm-repeatmin" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-farm-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-farm-start" class="twmgr-btn twmgr-go">▶ Saquear</button><button id="twmgr-farm-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-farm-status" class="twmgr-cstatus"></div>' +
        modLog('farm') +
      '</div>' +
      '<div id="twmgr-tab-wall" style="display:none">' +
        hint('🐏 Manda bárbaro + aríete + explorador pra derrubar muralhas dos alvos do assistente. Roda em paralelo ao Saque.') +
        cardsDiv('wall') +
        sec('Faixa de muralha',
          '<div class="twmgr-row"><span class="twmgr-lbl">Derrubar muros do nível</span><span><input id="twmgr-wall-min" class="twmgr-inp" type="number" min="1" max="20" value="1" style="width:44px"> até <input id="twmgr-wall-max" class="twmgr-inp" type="number" min="1" max="20" value="6" style="width:44px"></span></div>') +
        sec('Tropa por ataque',
          '<div class="twmgr-row"><span class="twmgr-lbl">Bárbaro por ataque</span><input id="twmgr-wall-axe" class="twmgr-inp" type="number" min="1" value="80" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Aríete</span><select id="twmgr-wall-mode" class="twmgr-inp" style="width:150px"><option value="auto">auto (pela muralha)</option><option value="fixo">fixo</option></select></div>' +
          '<div id="twmgr-wall-auto"><div class="twmgr-row"><span class="twmgr-lbl">Aríetes p/ muralha 6</span><input id="twmgr-wall-ramw6" class="twmgr-inp" type="number" min="1" value="24" style="width:66px"></div><div style="font-size:9px;color:#8f7d57">calibra o resto: muro5≈18 · 4≈13 · 3≈9 · 2≈5 · 1≈3</div></div>' +
          '<div id="twmgr-wall-fixo" style="display:none"><div class="twmgr-row"><span class="twmgr-lbl">Aríetes por ataque (fixo)</span><input id="twmgr-wall-ramfix" class="twmgr-inp" type="number" min="1" value="20" style="width:66px"></div></div>') +
        sec('Ritmo', '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-wall-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-wall-start" class="twmgr-btn twmgr-go">▶ Quebrar</button><button id="twmgr-wall-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-wall-status" class="twmgr-cstatus"></div>' +
        modLog('wall') +
      '</div>' +
      '<div id="twmgr-tab-recruit" style="display:none">' +
        hint('Recruta por <b>grupo</b> do TW: mantém a fila alvo por edifício e para no alvo de tropas. Vazio = contínuo.') +
        cardsDiv('recruit') +
        sec('Grupos (fixo ATK/DEF)',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo ATK</span><select id="twmgr-r-gatk" class="twmgr-inp" style="width:170px"></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo DEF</span><select id="twmgr-r-gdef" class="twmgr-inp" style="width:170px"></select></div>' +
          '<div style="text-align:right;margin-top:2px"><button id="twmgr-r-reload" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">↻ grupos</button></div>') +
        sec('Tropas por perfil', recruitProfileHTML('atk', '⚔️ Perfil ATK') + recruitProfileHTML('def', '🛡️ Perfil DEF')) +
        sec('Grupos adicionais',
          '<div style="font-size:10px;color:#8f7d57;margin-bottom:4px">Crie quantos perfis quiser, cada um ligado a um grupo do TW — igual o ATK/DEF acima, mas sem limite de quantidade.</div>' +
          '<div id="twmgr-rg-list"></div>' +
          '<button id="twmgr-rg-add" class="twmgr-btn twmgr-ghost" style="width:100%;margin-top:2px">+ Adicionar grupo</button>') +
        sec('Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Fila alvo (h)</span><input id="twmgr-r-hours" class="twmgr-inp" type="number" min="0.5" step="0.5" value="2" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Repor quando faltar (min)</span><input id="twmgr-r-refill" class="twmgr-inp" type="number" min="1" value="30" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-r-start" class="twmgr-btn twmgr-go">▶ Recrutar</button><button id="twmgr-r-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<button id="twmgr-r-diag" class="twmgr-btn twmgr-ghost" style="width:100%;margin-bottom:6px">🔍 Diagnóstico (Recrutar)</button>' +
        '<div id="twmgr-recruit-status" class="twmgr-cstatus"></div>' +
        modLog('recruit') +
      '</div>' +
      '<div id="twmgr-tab-fakes" style="display:none">' +
        hint('Fakes com <b>chegada</b> em horário marcado. 1 isca + explorador (neutro, não revela off/def).') +
        cardsDiv('fakes') +
        sec('Alvos e chegada',
          '<div class="twmgr-row"><span class="twmgr-lbl">Relógio do servidor</span><b id="twmgr-srvclock" style="color:#ffd76a">--:--:--</b></div>' +
          '<label class="twmgr-lbl">Alvos (cole vários)</label><textarea id="twmgr-fk-targets" class="twmgr-inp" style="width:100%;height:52px;margin:2px 0 6px" placeholder="430|522 428|524 430|520 …"></textarea>' +
          '<label class="twmgr-lbl">Chegada</label><input id="twmgr-fk-arr" class="twmgr-inp" type="datetime-local" step="1" style="width:100%;margin:2px 0 0">') +
        sec('Origens',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo</span><select id="twmgr-fk-group" class="twmgr-inp" style="width:150px"><option value="">Todas as aldeias</option></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Origens que enviam <span id="twmgr-fk-count" style="color:#8a7a55"></span></span><span style="font-size:9px"><a id="twmgr-fk-all" style="cursor:pointer;color:#e6cf7d">todas</a> · <a id="twmgr-fk-none" style="cursor:pointer;color:#e6cf7d">nenhuma</a></span></div>' +
          '<div id="twmgr-fk-origins" style="max-height:180px;overflow-y:auto;border:1px solid #3a2c1a;border-radius:6px;padding:4px"></div>' +
          '<div class="twmgr-row" style="margin-top:6px"><span class="twmgr-lbl">Distribuição</span><span style="font-size:10px"><label><input type="radio" name="twmgr-fk-mode" value="split"> dividir</label> <label><input type="radio" name="twmgr-fk-mode" value="all"> todas→todos</label></span></div>') +
        sec('Estratégia do fake',
          '<div class="twmgr-row"><span class="twmgr-lbl">Isca (1x)</span><select id="twmgr-fk-siege" class="twmgr-inp" style="width:110px"><option value="ram">Aríete</option><option value="catapult">Catapulta</option><option value="none">nenhum</option></select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Preencher com</span><select id="twmgr-fk-filler" class="twmgr-inp" style="width:110px">' + UNITS.map(([u, n]) => '<option value="' + u + '">' + n + '</option>').join('') + '</select></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Pop mín (% dos pontos)</span><input id="twmgr-fk-pct" class="twmgr-inp" type="number" min="0" step="0.5" value="1" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Pop mín fixa (0=auto)</span><input id="twmgr-fk-minpop" class="twmgr-inp" type="number" min="0" value="0" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Offset envio (ms)</span><input id="twmgr-fk-offset" class="twmgr-inp" type="number" min="0" value="150" style="width:56px"></div>') +
        '<button id="twmgr-fk-preview" class="twmgr-btn twmgr-ghost" style="width:100%;margin-bottom:6px">💡 Prever fakes</button>' +
        '<div class="twmgr-actions"><button id="twmgr-fk-start" class="twmgr-btn twmgr-go">▶ Armar</button><button id="twmgr-fk-stop" class="twmgr-btn twmgr-stop">■ Desarmar</button></div>' +
        '<div id="twmgr-fk-status" class="twmgr-cstatus"></div>' +
        modLog('fakes') +
      '</div>' +
      '<div id="twmgr-tab-market" style="display:none">' +
        hint('Mercado: <b>Cunhagem</b> junta recurso num destino; <b>Equilíbrio</b> nivela as aldeias por %; <b>Solidário</b> abastece só o grupo escolhido (que só recebe) com qualquer outra aldeia sua doando; <b>Cunhar</b> cunha moedas de ouro nas aldeias marcadas.') +
        cardsDiv('market') +
        sec('Modo', '<div class="twmgr-row"><span class="twmgr-lbl">Modo</span><span style="font-size:11px"><label><input type="radio" name="twmgr-mk-mode" value="cunhagem"> 💰 Cunhagem</label> <label><input type="radio" name="twmgr-mk-mode" value="equilibrio"> ⚖️ Equilíbrio</label> <label><input type="radio" name="twmgr-mk-mode" value="solidario"> 🤝 Solidário</label> <label><input type="radio" name="twmgr-mk-mode" value="cunhar"> 🪙 Cunhar</label></span></div>') +
        '<div id="twmgr-mk-cunhagem">' +
          sec('Cunhagem',
            '<div class="twmgr-row"><span class="twmgr-lbl">Coordenada destino</span><input id="twmgr-mk-coord" class="twmgr-inp" type="text" placeholder="464|604" style="width:90px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Deixar mínimo (cada rec.)</span><input id="twmgr-mk-reserve" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:72px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Aldeias de origem</span><span style="font-size:9px"><a id="twmgr-mk-all" style="cursor:pointer;color:#e6cf7d">todas</a> · <a id="twmgr-mk-none" style="cursor:pointer;color:#e6cf7d">nenhuma</a></span></div>' +
            '<div id="twmgr-mk-sources" style="max-height:120px;overflow-y:auto;border:1px solid #3a2c1a;border-radius:6px;padding:4px"></div>') +
        '</div>' +
        '<div id="twmgr-mk-equilibrio" style="display:none">' +
          sec('Equilíbrio',
            '<div style="font-size:10px;color:#8f7d57;margin-bottom:4px">Aldeia acima do limiar doa o excedente pras abaixo, por recurso. Da mais perto primeiro.</div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Encher armazém até (%)</span><input id="twmgr-mk-thr" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-mk-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="15" style="width:56px"></div>') +
        '</div>' +
        '<div id="twmgr-mk-solidario" style="display:none">' +
          sec('Solidário',
            '<div style="font-size:10px;color:#8f7d57;margin-bottom:4px">Aldeias do grupo escolhido SÓ RECEBEM (nunca doam). Doadora é qualquer OUTRA aldeia sua — testa da mais perto pra mais longe, e pula pra próxima se a mais perto não tiver mercador/recurso suficiente. Doadora só cede acima de "% do recurso mais baixo dela" (protege quem já tá capenga). Se ninguém qualificar, a mais próxima cede só a fatia acima de "% que fica na doadora" mesmo assim (nunca esvazia), pra nunca travar construção/pesquisa numa aldeia nova ou bárbara conquistada.</div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Grupo Solidário</span><select id="twmgr-mk-g-solid" class="twmgr-inp" style="width:140px"></select></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Carente: encher armazém até (%)</span><input id="twmgr-mk-sthr" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl" title="Independente do limiar acima — se o limiar de carente for alto (ex.: 85%), esse aqui evita que ninguém nunca qualifique como doador.">Doadora: mín. % de armazém p/ poder doar</span><input id="twmgr-mk-sdonormin" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Doadora: piso = % do recurso mais baixo dela</span><input id="twmgr-mk-sdonor" class="twmgr-inp" type="number" min="1" max="99" value="50" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Gargalo: % que fica na doadora</span><input id="twmgr-mk-sgargalo" class="twmgr-inp" type="number" min="1" max="99" value="90" style="width:56px"></div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-mk-sdist" class="twmgr-inp" type="number" min="1" step="0.5" value="20" style="width:56px"></div>') +
        '</div>' +
        '<div id="twmgr-mk-cunhar" style="display:none">' +
          sec('Cunhar moedas de ouro',
            '<div style="font-size:10px;color:#8f7d57;margin-bottom:4px">Cunha o máximo de moedas na Academia das aldeias marcadas, todo ciclo. Não transfere recurso.</div>' +
            '<div class="twmgr-row"><span class="twmgr-lbl">Aldeias que cunham</span><span style="font-size:9px"><a id="twmgr-mk-mint-all" style="cursor:pointer;color:#e6cf7d">todas</a> · <a id="twmgr-mk-mint-none" style="cursor:pointer;color:#e6cf7d">nenhuma</a></span></div>' +
            '<div id="twmgr-mk-mint-sources" style="max-height:120px;overflow-y:auto;border:1px solid #3a2c1a;border-radius:6px;padding:4px"></div>') +
        '</div>' +
        sec('Ritmo', '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-mk-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-mk-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-mk-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-mk-status" class="twmgr-cstatus"></div>' +
        modLog('market') +
      '</div>' +
      '<div id="twmgr-tab-build" style="display:none">' +
        hint('🏗️ Plano de obras por perfil <b>ATK/DEF</b>. Ordem da lista = prioridade; item caro vira demanda pro Equilíbrio.') +
        cardsDiv('build') +
        sec('Plano de obras',
          '<div class="twmgr-bld-subtabs" style="display:flex;gap:4px;margin-bottom:6px">' +
            '<button class="twmgr-btn twmgr-bld-sub twmgr-bld-sub-atk on" data-prof="atk" style="flex:1;padding:4px 6px;font-size:11px">⚔️ ATK</button>' +
            '<button class="twmgr-btn twmgr-bld-sub twmgr-bld-sub-def" data-prof="def" style="flex:1;padding:4px 6px;font-size:11px">🛡️ DEF</button>' +
          '</div>' +
          '<div id="twmgr-bld-plan" class="twmgr-bld-plan"></div>' +
          '<div class="twmgr-row" style="gap:4px;margin-top:6px">' +
            '<select id="twmgr-bld-add-b" class="twmgr-inp" style="flex:1">' +
              Object.keys(BUILD_META).map((k) => '<option value="' + k + '">' + BUILD_META[k].ico + ' ' + BUILD_META[k].name + ' (máx ' + BUILD_META[k].max + ')</option>').join('') +
            '</select>' +
            '<input id="twmgr-bld-add-lvl" class="twmgr-inp" type="number" min="1" placeholder="nv" style="width:52px">' +
            '<button id="twmgr-bld-add" class="twmgr-btn twmgr-ghost" style="padding:5px 10px">+</button>' +
          '</div>' +
          '<div style="display:flex;gap:6px;margin-top:4px">' +
            '<button id="twmgr-bld-reset" class="twmgr-btn twmgr-ghost" style="flex:1;font-size:10px">↺ reset padrão</button>' +
            '<button id="twmgr-bld-clear" class="twmgr-btn twmgr-ghost" style="flex:1;font-size:10px">🗑 limpar tudo</button>' +
          '</div>') +
        sec('Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Máx na fila</span><input id="twmgr-bld-max" class="twmgr-inp" type="number" min="1" value="5" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-bld-int" class="twmgr-inp" type="number" min="1" value="10" style="width:56px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-bld-start" class="twmgr-btn twmgr-go">▶ Construir</button><button id="twmgr-bld-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-bld-status" class="twmgr-cstatus"></div>' +
        modLog('build') +
      '</div>' +
      '<div id="twmgr-tab-bb" style="display:none">' +
        hint('🌱 Desenvolve aldeias <b>bárbaras conquistadas</b>: constrói a ladder, abastece das grandes próximas e ao graduar recruta CL sozinho.') +
        cardsDiv('bb') +
        sec('Grupo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo Cultivo</span><select id="twmgr-bb-group" class="twmgr-inp" style="width:170px"></select></div>' +
          '<div style="text-align:right;margin-top:2px"><button id="twmgr-bb-reload" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">↻ grupos</button></div>') +
        sec('Ladder de obra (chave nível, em ordem)',
          '<textarea id="twmgr-bb-tpl" class="twmgr-inp" style="width:100%;height:96px;font-family:monospace;font-size:10px"></textarea>' +
          '<div style="text-align:right;margin:2px 0 6px"><button id="twmgr-bb-tpl-reset" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="volta pro padrão do script (fase 1 + fase 2)">↺ reset padrão</button></div>' +
          '<div style="font-size:10px;color:#8f7d57;margin:4px 0 2px">Aldeias DEF (coords, 1 por linha) — o resto vira ATK</div>' +
          '<textarea id="twmgr-bb-def" class="twmgr-inp" style="width:100%;height:44px;font-family:monospace;font-size:10px" placeholder="ex: 470|592"></textarea>') +
        sec('Abastecimento',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Mantém cada bárbara cheia até esse % do armazém dela, todo ciclo (obra + recrutamento). Maior = mais generoso.">Encher aldeia até (%)</span><input id="twmgr-bb-fill" class="twmgr-inp" type="number" min="10" max="100" value="90" style="width:56px"></div>' +
          '<label class="twmgr-check" style="margin:4px 0" title="Se ligado, o feed fura o teto acima quando um nível de obra custar mais que ele (não trava obra cara). Desligado = respeita o teto sempre."><input id="twmgr-bb-overfill" type="checkbox"> Furar o teto p/ bancar obra cara</label>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Reserva na fonte (%)</span><input id="twmgr-bb-reserve" class="twmgr-inp" type="number" min="0" max="90" value="40" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Dist. máx. fonte (campos)</span><input id="twmgr-bb-dist" class="twmgr-inp" type="number" min="1" value="15" style="width:56px"></div>') +
        sec('Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Máx na fila</span><input id="twmgr-bb-max" class="twmgr-inp" type="number" min="1" value="5" style="width:56px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Intervalo do ciclo (min)</span><input id="twmgr-bb-int" class="twmgr-inp" type="number" min="1" value="10" style="width:56px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-bb-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-bb-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-bb-status" class="twmgr-cstatus"></div>' +
        modLog('bb') +
      '</div>' +
      '<div id="twmgr-tab-map" style="display:none">' +
        hint('🗺️ Fica <b>ligado por ciclos</b>. A cada ciclo relê o mapa, acha bárbaro novo no seu raio e manda explorador em quem <b>você ainda não conhece</b> — quem não está no assistente de saque, ou está mas o relatório não trouxe nada. Quem já tem explorador a caminho é pulado.') +
        cardsDiv('map') +
        sec('Origem',
          '<div class="twmgr-row"><span class="twmgr-lbl">Grupo origem (vazio = todas)</span><select id="twmgr-bm-group" class="twmgr-inp" style="width:150px"></select></div>' +
          '<div style="text-align:right;margin-top:2px"><button id="twmgr-bm-reload" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">↻ grupos</button> <button id="twmgr-bm-refmap" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="recarrega /map/village.txt">↻ mapa</button></div>') +
        sec('Filtros de alvo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Distância máx. (campos)</span><input id="twmgr-bm-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="20" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="0 = nunca reexplora quem já tem relatório com dados. Acima de 0, reexplora intel mais velho que isso.">Reexplorar intel com + de (dias)</span><input id="twmgr-bm-days" class="twmgr-inp" type="number" min="0" step="0.5" value="0" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Pontos de/até</span><span><input id="twmgr-bm-minpts" class="twmgr-inp" type="number" min="0" value="26" style="width:56px"> a <input id="twmgr-bm-maxpts" class="twmgr-inp" type="number" min="1" value="5000" style="width:56px"></span></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Máx alvos por aldeia/ciclo</span><input id="twmgr-bm-maxper" class="twmgr-inp" type="number" min="1" value="20" style="width:66px"></div>') +
        sec('Exploradores',
          '<div class="twmgr-row"><span class="twmgr-lbl">Reserva de spy (guardar/aldeia)</span><input id="twmgr-bm-reserve" class="twmgr-inp" type="number" min="0" value="30" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Spy por alvo</span><input id="twmgr-bm-spy" class="twmgr-inp" type="number" min="1" value="1" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Delay entre envios (ms)</span><input id="twmgr-bm-delay" class="twmgr-inp" type="number" min="0" step="100" value="500" style="width:66px"></div>') +
        sec('Ciclo',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="De quanto em quanto tempo ele relê o mapa e procura bárbaro novo.">Intervalo do ciclo (min)</span><input id="twmgr-bm-ciclo" class="twmgr-inp" type="number" min="5" step="5" value="30" style="width:66px"></div>' +
          '<div id="twmgr-bm-next" style="font-size:10px;color:#8f7d57;text-align:right"></div>') +
        sec('Blacklist',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="A partir de quantas unidades de defesa no relatório a aldeia entra na blacklist.">Defesa mínima p/ blacklist</span><input id="twmgr-bm-defmin" class="twmgr-inp" type="number" min="1" value="1" style="width:66px"></div>' +
          '<label class="twmgr-check" title="Quando uma aldeia entrar na blacklist por DEFESA, apaga os relatórios dela no jogo — o que a tira da listagem do assistente. Não afeta a blacklist de tropa perdida. NÃO TEM DESFAZER: pra voltar, a aldeia teria que reaparecer sozinha na busca do assistente."><input id="twmgr-bm-rmassist" type="checkbox"> Apagar do assistente quem tem defesa <b style="color:#e6a89d">(irreversível)</b></label>' +
          '<div class="twmgr-hint" style="margin:0">O Saque já pula quem está em qualquer uma das duas listas, mesmo com essa opção desligada.</div>') +
        '<div class="twmgr-actions"><button id="twmgr-bm-preview" class="twmgr-btn twmgr-ghost">💡 Prévia</button><button id="twmgr-bm-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-bm-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-bm-status" class="twmgr-cstatus"></div>' +
        // Três listas na mesma área, alternadas — alvos do próximo ciclo e as duas blacklists.
        '<div id="twmgr-bm-subtabs" style="display:flex;gap:4px;margin:9px 0 0">' +
          '<button class="twmgr-btn twmgr-ghost twmgr-bm-sub" data-sub="alvos" style="flex:1;padding:4px;font-size:10px">🎯 Alvos (<span id="twmgr-bm-count">0</span>)</button>' +
          '<button class="twmgr-btn twmgr-ghost twmgr-bm-sub" data-sub="perda" style="flex:1;padding:4px;font-size:10px">💀 Perdi tropa (<span id="twmgr-bm-nperda">0</span>)</button>' +
          '<button class="twmgr-btn twmgr-ghost twmgr-bm-sub" data-sub="defesa" style="flex:1;padding:4px;font-size:10px">🛡️ Tem defesa (<span id="twmgr-bm-ndefesa">0</span>)</button>' +
        '</div>' +
        '<div id="twmgr-bm-list" style="max-height:220px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:8px;margin-top:4px"></div>' +
        '<div id="twmgr-bm-bl" style="max-height:220px;overflow-y:auto;background:#120d07;border:1px solid #3a2e1b;border-radius:8px;margin-top:4px;display:none"></div>' +
        modLog('map') +
        sec('🔒 Cadeado automático',
          '<div style="font-size:10px;color:#8f7d57;margin-bottom:4px">Rastreia bárbaras no raio de TODAS as suas aldeias (a mais perto conta) e tranca (reserva pra tribo) as com pontuação mínima, das mais fortes pras mais fracas. Pula quem tem relatório vermelho no último ataque (checado aldeia por aldeia, cobre até abandonadas). Nunca destrava o que já travou — só soma.</div>' +
          cardsDiv('lock') +
          '<div class="twmgr-row"><span class="twmgr-lbl">Raio (campos, X)</span><input id="twmgr-lk-dist" class="twmgr-inp" type="number" min="1" step="0.5" value="10" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Pontos mín. (Y)</span><input id="twmgr-lk-pts" class="twmgr-inp" type="number" min="0" value="500" style="width:80px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Repetir rastreamento (min)</span><input id="twmgr-lk-int" class="twmgr-inp" type="number" min="1" value="30" style="width:66px"></div>' +
          '<div class="twmgr-actions"><button id="twmgr-lk-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-lk-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
          '<div id="twmgr-lk-status" class="twmgr-cstatus"></div>' +
          modLog('lock')) +
      '</div>' +
      '<div id="twmgr-tab-planner" style="display:none">' +
        hint('🎯 Coordenado: monte vários ataques independentes — cada um com seu próprio alvo, aldeias e tropas — e arme cada um separadamente (o botão libera um novo ataque em branco assim que você arma). Cada aldeia pode mandar <b>várias ondas</b> (+ onda) dentro do mesmo ataque. Tropas ficam <b>reservadas</b> — Saque/Fakes/Muralha não gastam elas.') +
        cardsDiv('planner') +
        sec('Ataques', '<div id="twmgr-pl-attacks" style="display:flex;flex-wrap:wrap;gap:6px"></div>') +
        sec('1. Alvo (do ataque selecionado acima)',
          '<div class="twmgr-row"><span class="twmgr-lbl">Relógio do servidor</span><b id="twmgr-pl-srvclock" style="color:#ffd76a">--:--:--</b></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Coord alvo</span><span><input id="twmgr-pl-target-x" class="twmgr-inp" type="number" min="1" placeholder="x" style="width:56px"> | <input id="twmgr-pl-target-y" class="twmgr-inp" type="number" min="1" placeholder="y" style="width:56px"></span></div>' +
          '<label class="twmgr-lbl">Chegada base (horário do servidor)</label><input id="twmgr-pl-arr" class="twmgr-inp" type="datetime-local" step="1" style="width:100%;margin:2px 0 0">' +
          '<div class="twmgr-row" style="margin-top:6px"><span class="twmgr-lbl">Offset envio (ms)</span><input id="twmgr-pl-offset" class="twmgr-inp" type="number" min="0" value="150" style="width:56px"></div>') +
        sec('2. Aldeias participantes',
          '<div class="twmgr-row"><span class="twmgr-lbl">Selecione</span><span style="font-size:9px"><a id="twmgr-pl-all" style="cursor:pointer;color:#e6cf7d">todas</a> · <a id="twmgr-pl-none" style="cursor:pointer;color:#e6cf7d">nenhuma</a> · <a id="twmgr-pl-load" style="cursor:pointer;color:#e6cf7d">🔄 carregar tropas</a></span></div>' +
          '<div id="twmgr-pl-villages" style="max-height:110px;overflow-y:auto;border:1px solid #3a2c1a;border-radius:6px;padding:4px"></div>') +
        sec('3. Composição por aldeia (+ onda pra mandar mais de um ataque da mesma aldeia)',
          '<div id="twmgr-pl-cards"><div style="font-size:10px;color:#8f7d57;padding:6px;text-align:center">— marque aldeias acima e clique em <b>🔄 carregar tropas</b> —</div></div>') +
        sec('4. Armar este ataque',
          '<div class="twmgr-actions"><button id="twmgr-pl-start" class="twmgr-btn twmgr-go">▶ Armar este ataque</button><button id="twmgr-pl-stop" class="twmgr-btn twmgr-stop">■ Desarmar</button><button id="twmgr-pl-clear" class="twmgr-btn twmgr-ghost" style="flex:0 0 auto">🗑</button></div>' +
          '<div id="twmgr-pl-status" class="twmgr-cstatus"></div>') +
        sec('5. Fila deste ataque',
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:10px;color:#8f7d57">ordenada por horário de envio</span><button id="twmgr-pl-queue-clear" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="remover enviados e erros do histórico">🗑 limpar histórico</button></div>' +
          '<div id="twmgr-pl-queue" style="max-height:220px;overflow-y:auto"></div>') +
        sec('Templates',
          '<div class="twmgr-row"><span class="twmgr-lbl">Salvar plano atual</span><span><input id="twmgr-pl-tpl-name" class="twmgr-inp" type="text" placeholder="ex: guerra XYZ" style="width:120px"> <button id="twmgr-pl-tpl-save" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">💾</button></span></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Carregar</span><span><select id="twmgr-pl-tpl-load" class="twmgr-inp" style="width:120px"></select> <button id="twmgr-pl-tpl-apply" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px">📂</button> <button id="twmgr-pl-tpl-del" class="twmgr-btn twmgr-ghost" style="padding:3px 8px;font-size:10px" title="apagar">🗑</button></span></div>') +
        sec('🛡️ Blindagem da tribo',
          '<div style="font-size:10px;color:#8f7d57;margin-bottom:4px">Puxa a tabela do tópico, escolhe origem por linha, envia apoios e copia o texto no formato do fórum.</div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">URL do tópico</span><input id="twmgr-blz-url" class="twmgr-inp" type="text" placeholder="https://.../screen=forum&mode=view&thread_id=..." style="flex:1;min-width:180px"></div>' +
          '<div class="twmgr-actions"><button id="twmgr-blz-fetch" class="twmgr-btn twmgr-ghost">🛡️ Buscar pedidos</button><span id="twmgr-blz-status" style="flex:1;font-size:10px;color:#8f7d57;padding-top:4px">—</span></div>' +
          '<div id="twmgr-blz-list" style="max-height:280px;overflow-y:auto;border:1px solid #3a2c1a;border-radius:6px;padding:4px;margin-top:4px"></div>' +
          '<div class="twmgr-actions" style="margin-top:6px"><button id="twmgr-blz-send" class="twmgr-btn twmgr-go">✉️ Enviar marcados</button></div>') +
        modLog('planner') +
      '</div>' +
      '<div id="twmgr-tab-paladin" style="display:none">' +
        hint('🐴 Treina o(s) Paladino(s) por XP em ciclo — sempre no regime de <b>4h</b> (melhor XP/hora dos 5 disponíveis). Além do check periódico, cada envio arma um timer de precisão pra 4h+30s depois, garantindo reenvio quase imediato.') +
        cardsDiv('paladin') +
        sec('1. Aldeias no ciclo',
          '<div id="twmgr-pd-villages" style="max-height:130px;overflow-y:auto;border:1px solid #3a2c1a;border-radius:6px;padding:4px"></div>') +
        sec('2. Verificação periódica',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Rede de segurança ampla — roda independente do timer de precisão de cada envio.">Nova verificação (min)</span><input id="twmgr-pd-interval" class="twmgr-inp" type="number" min="1" value="240" style="width:66px"></div>') +
        sec('3. Ritmo de envio',
          '<div class="twmgr-row"><span class="twmgr-lbl">Delay entre envios (ms)</span><input id="twmgr-pd-delay" class="twmgr-inp" type="number" min="0" step="100" value="500" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-pd-start" class="twmgr-btn twmgr-go">▶ Iniciar ciclo</button><button id="twmgr-pd-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        '<div id="twmgr-pd-status" class="twmgr-cstatus"></div>' +
        sec('Status por aldeia', '<div id="twmgr-pd-status-list"></div>') +
        modLog('paladin') +
      '</div>' +
      '<div id="twmgr-tab-etiqueta" style="display:none">' +
        hint('🏷️ Usa o recurso <b>nativo</b> do TW (o botão "Etiqueta" da tela de ataques recebidos) pra rotular sozinho a unidade mais lenta provável de cada ataque que vem vindo. Quanto mais cedo depois do envio o check roda, mais precisa fica — o próprio jogo assume que o comando "acabou de sair". Cada comando é etiquetado <b>uma vez só</b>.') +
        cardsDiv('etiqueta') +
        sec('Verificação periódica',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="1 a 3 min pega os ataques recém-enviados com boa precisão. Mais que isso, a adivinhação do jogo piora.">Intervalo (min)</span><input id="twmgr-et-interval" class="twmgr-inp" type="number" min="2" value="3" style="width:66px"></div>') +
        '<div class="twmgr-actions"><button id="twmgr-et-start" class="twmgr-btn twmgr-go">▶ Iniciar ciclo</button><button id="twmgr-et-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        modLog('etiqueta') +
      '</div>' +
      '<div id="twmgr-tab-obra" style="display:none">' +
        hint('🏛️ Constrói cada aldeia automaticamente de acordo com o perfil do grupo do TW em que ela estiver. Basta adicionar a aldeia num dos 5 grupos no próprio jogo — o resto é sozinho. <b>Pesquisa do Ferreiro (escolher a tropa) ainda é manual</b>, só o nível do prédio é controlado por aqui.') +
        cardsDiv('obra') +
        sec('1. Grupos por perfil', OBRA_PROFILES.map((p) =>
          '<div class="twmgr-row"><span class="twmgr-lbl">' + esc(OBRA_PROFILE_META[p].name) + '</span><select id="twmgr-ob-g-' + p + '" class="twmgr-inp" style="width:170px"></select></div>'
        ).join('')) +
        sec('2. Ritmo',
          '<div class="twmgr-row"><span class="twmgr-lbl">Verificação (min)</span><input id="twmgr-ob-int" class="twmgr-inp" type="number" min="1" value="10" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl">Fila máx. por aldeia</span><input id="twmgr-ob-max" class="twmgr-inp" type="number" min="1" value="5" style="width:66px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Só constrói se sobrar essa quantidade de CADA recurso depois do gasto — deixa reserva pro Recrutar. 0 = desliga.">Reserva de recurso (0=off)</span><input id="twmgr-ob-reserve" class="twmgr-inp" type="number" min="0" step="100" value="0" style="width:80px"></div>') +
        sec('3. Gatilhos (Fazenda/Armazém condicionais)',
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Upa Fazenda quando a população livre (máx-atual) cair abaixo disso.">Fazenda: pop. livre mín.</span><input id="twmgr-ob-farmpop" class="twmgr-inp" type="number" min="0" step="50" value="800" style="width:80px"></div>' +
          '<div class="twmgr-row"><span class="twmgr-lbl" title="Upa Armazém quando algum recurso atingir esse % da capacidade. Fast Nobre ignora (sobe proativo).">Armazém: % cheio p/ upar</span><input id="twmgr-ob-storagepct" class="twmgr-inp" type="number" min="1" max="100" value="60" style="width:66px"></div>') +
        sec('4. Pesquisa do Ferreiro',
          '<label class="twmgr-check"><input id="twmgr-ob-research" type="checkbox" checked> Pesquisar automaticamente (segue a ordem de cada perfil, pula se faltar prédio ou já tiver pesquisa em andamento)</label>') +
        '<div class="twmgr-actions"><button id="twmgr-ob-start" class="twmgr-btn twmgr-go">▶ Iniciar</button><button id="twmgr-ob-stop" class="twmgr-btn twmgr-stop">■ Parar</button></div>' +
        sec('Aguardando recurso', '<div id="twmgr-ob-demand"></div>') +
        modLog('obra') +
      '</div>' +
      '<div id="twmgr-tab-log" style="display:none">' +
      '<div class="twmgr-hint">🤖 Alerta de CAPTCHA: avisa (navegador + ntfy) quando a tela de verificação aparece. O bot-check só surge num F5 — por isso o <b>Auto-F5 AFK</b>: se você ficar X min sem mexer, recarrega a página pra forçar a verificação a aparecer e te chamar.</div>' +
      '<label class="twmgr-check"><input id="twmgr-cap-en" type="checkbox"> Detectar CAPTCHA</label>' +
      '<label class="twmgr-check"><input id="twmgr-cap-brw" type="checkbox"> Notificação do navegador</label>' +
      '<div class="twmgr-row"><span class="twmgr-lbl">Tópico ntfy.sh (opcional)</span><input id="twmgr-cap-ntfy" class="twmgr-inp" type="text" placeholder="meu-topico" style="width:120px"></div>' +
      '<div class="twmgr-row"><span class="twmgr-lbl" title="Recarrega a página a cada X min quando você está AFK, pra forçar o bot-check a aparecer e te avisar. 0 = desligado.">Auto-F5 AFK (min, 0=off)</span><input id="twmgr-cap-reload" class="twmgr-inp" type="number" min="0" step="1" value="0" style="width:66px"></div>' +
      '<button id="twmgr-cap-test" class="twmgr-btn twmgr-ghost" style="width:100%;margin:4px 0 8px">🔔 Testar notificação</button>' +
      '<div id="twmgr-log" class="twmgr-log"></div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(p);

    document.getElementById('twmgr-logbtn').addEventListener('click', () => showTab('log'));

    // Notificação de CAPTCHA
    document.getElementById('twmgr-cap-en').checked = !!config.captcha.enabled;
    document.getElementById('twmgr-cap-brw').checked = !!config.captcha.browserNotif;
    document.getElementById('twmgr-cap-ntfy').value = config.captcha.ntfyTopic || '';
    document.getElementById('twmgr-cap-reload').value = config.captcha.reloadMin != null ? config.captcha.reloadMin : 0;
    const readCapCfg = () => {
      config.captcha.enabled = document.getElementById('twmgr-cap-en').checked;
      config.captcha.browserNotif = document.getElementById('twmgr-cap-brw').checked;
      config.captcha.ntfyTopic = document.getElementById('twmgr-cap-ntfy').value.trim();
      const rm = parseInt(document.getElementById('twmgr-cap-reload').value, 10);
      config.captcha.reloadMin = (isNaN(rm) || rm < 0) ? 0 : rm;
      save();
      startAutoReload();   // aplica o novo intervalo (ou desliga se 0)
    };
    ['twmgr-cap-en', 'twmgr-cap-brw', 'twmgr-cap-ntfy', 'twmgr-cap-reload'].forEach((id) => document.getElementById(id).addEventListener('change', readCapCfg));
    document.getElementById('twmgr-cap-brw').addEventListener('change', async () => { if (document.getElementById('twmgr-cap-brw').checked) await ensureNotifyPermission(); });
    document.getElementById('twmgr-cap-test').addEventListener('click', testCaptchaNotif);

    SCAV_UNITS.forEach(([u]) => { const el = document.getElementById('twmgr-su-' + u); if (el) el.checked = !!(config.scav.units && config.scav.units[u]); });
    document.getElementById('twmgr-scav-unlock').checked = !!config.scav.autoUnlock;
    document.getElementById('twmgr-scav-unlock-ate').value = String(config.scav.unlockAte || 4);
    document.getElementById('twmgr-scav-unlock-puxar').checked = config.scav.unlockPuxar !== false;
    document.getElementById('twmgr-scav-unlock-res').value = config.scav.unlockReserva != null ? config.scav.unlockReserva : 5000;
    document.getElementById('twmgr-scav-unlock-org').value = config.scav.unlockMaxOrigens || 5;
    ['twmgr-scav-unlock', 'twmgr-scav-unlock-ate', 'twmgr-scav-unlock-puxar', 'twmgr-scav-unlock-res', 'twmgr-scav-unlock-org']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readScavUnlockCfg); });
    renderScavFalta();
    document.getElementById('twmgr-scav-maxh').value = config.scav.maxHours || 0;
    document.getElementById('twmgr-scav-maxh').addEventListener('change', readScavUnits);
    document.getElementById('twmgr-scav-start').addEventListener('click', scavStart);
    document.getElementById('twmgr-scav-stop').addEventListener('click', scavStop);
    setScavStatus(config.scav.running);

    document.getElementById('twmgr-farm-wood').value = config.farm.minWood != null ? config.farm.minWood : 1000;
    document.getElementById('twmgr-farm-stone').value = config.farm.minStone != null ? config.farm.minStone : 1000;
    document.getElementById('twmgr-farm-iron').value = config.farm.minIron != null ? config.farm.minIron : 1000;
    document.getElementById('twmgr-farm-dist').value = config.farm.maxDist != null ? config.farm.maxDist : 13;
    document.getElementById('twmgr-farm-wall').value = config.farm.maxWall != null ? config.farm.maxWall : 20;
    document.getElementById('twmgr-farm-bluewall').value = config.farm.blueMaxWall != null ? config.farm.blueMaxWall : 0;
    document.getElementById('twmgr-farm-int').value = Math.round((config.farm.interval || 600) / 60);
    document.getElementById('twmgr-farm-mode').value = config.farm.mode || 'suave';
    document.getElementById('twmgr-farm-repeat').checked = !!config.farm.repeat;
    document.getElementById('twmgr-farm-repeatmin').value = config.farm.repeatMin != null ? config.farm.repeatMin : 10;
    document.getElementById('twmgr-farm-repeatrow').style.display = config.farm.repeat ? 'flex' : 'none';
    document.getElementById('twmgr-farm-mincl').value = config.farm.minCL != null ? config.farm.minCL : 0;
    document.getElementById('twmgr-farm-order').value = config.farm.order || 'dist';
    document.getElementById('twmgr-farm-dyn').checked = !!config.farm.dynTemplate;
    (function () {
      const M = config.farm.matrix || defFarmMatrix();
      FARM_COLORS.forEach((k) => {
        const c = M[k] || {}, mode = c.mode || 'none';
        const a = document.getElementById('twmgr-fm-' + k + '-a'), b = document.getElementById('twmgr-fm-' + k + '-b'), cc = document.getElementById('twmgr-fm-' + k + '-c');
        if (a) a.checked = mode === 'a'; if (b) b.checked = mode === 'b'; if (cc) cc.checked = mode === 'c';
      });
    })();
    document.getElementById('twmgr-farm-start').addEventListener('click', farmStart);
    document.getElementById('twmgr-farm-stop').addEventListener('click', farmStop);
    ['twmgr-farm-wood', 'twmgr-farm-stone', 'twmgr-farm-iron', 'twmgr-farm-dist', 'twmgr-farm-wall', 'twmgr-farm-bluewall', 'twmgr-farm-int', 'twmgr-farm-mode', 'twmgr-farm-group', 'twmgr-farm-repeatmin', 'twmgr-farm-mincl', 'twmgr-farm-order', 'twmgr-farm-dyn'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readFarmCfg); });
    document.getElementById('twmgr-farm-repeat').addEventListener('change', (e) => { document.getElementById('twmgr-farm-repeatrow').style.display = e.target.checked ? 'flex' : 'none'; readFarmCfg(); });
    FARM_COLORS.forEach((k) => {
      const boxes = ['-a', '-b', '-c'].map((s) => document.getElementById('twmgr-fm-' + k + s));
      boxes.forEach((box) => { if (box) box.addEventListener('change', () => { if (box.checked) boxes.forEach((o) => { if (o && o !== box) o.checked = false; }); readFarmCfg(); }); });
    });
    setFarmStatus(config.farm.running);

    document.getElementById('twmgr-wall-min').value = config.wall.wallMin != null ? config.wall.wallMin : 1;
    document.getElementById('twmgr-wall-max').value = config.wall.wallMax != null ? config.wall.wallMax : 6;
    document.getElementById('twmgr-wall-axe').value = config.wall.axeCount != null ? config.wall.axeCount : 80;
    document.getElementById('twmgr-wall-mode').value = config.wall.ramMode || 'auto';
    document.getElementById('twmgr-wall-ramw6').value = config.wall.ramWall6 != null ? config.wall.ramWall6 : 24;
    document.getElementById('twmgr-wall-ramfix').value = config.wall.ramFixed != null ? config.wall.ramFixed : 20;
    document.getElementById('twmgr-wall-int').value = Math.round((config.wall.interval || 600) / 60);
    const applyWallMode = () => { const m = document.getElementById('twmgr-wall-mode').value; document.getElementById('twmgr-wall-auto').style.display = m === 'auto' ? 'block' : 'none'; document.getElementById('twmgr-wall-fixo').style.display = m === 'fixo' ? 'block' : 'none'; };
    document.getElementById('twmgr-wall-mode').addEventListener('change', () => { applyWallMode(); readWallCfg(); });
    applyWallMode();
    document.getElementById('twmgr-wall-start').addEventListener('click', wallStart);
    document.getElementById('twmgr-wall-stop').addEventListener('click', wallStop);
    ['twmgr-wall-min', 'twmgr-wall-max', 'twmgr-wall-axe', 'twmgr-wall-ramw6', 'twmgr-wall-ramfix', 'twmgr-wall-int'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readWallCfg); });
    setWallStatus(config.wall.running);

    document.getElementById('twmgr-r-hours').value = config.recruit.targetHours != null ? config.recruit.targetHours : 2;
    document.getElementById('twmgr-r-refill').value = config.recruit.refillBelowMin != null ? config.recruit.refillBelowMin : 30;
    renderRecruitGroups();
    bindRecruitGroupsHandlers();
    document.getElementById('twmgr-rg-add').addEventListener('click', recruitAddGroup);
    fillGroupSelects();
    document.getElementById('twmgr-r-reload').addEventListener('click', fillGroupSelects);
    document.getElementById('twmgr-r-start').addEventListener('click', recruitStart);
    document.getElementById('twmgr-r-stop').addEventListener('click', recruitStop);
    document.getElementById('twmgr-r-diag').addEventListener('click', runRecruitDiag);
    ['twmgr-r-gatk', 'twmgr-r-gdef', 'twmgr-r-hours', 'twmgr-r-refill'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readRecruitCfg); });
    document.querySelectorAll('.twmgr-ron, .twmgr-rt').forEach((el) => el.addEventListener('change', readRecruitCfg));
    setRecruitStatus(config.recruit.running);

    document.getElementById('twmgr-fk-targets').value = config.fakes.targetsRaw || '';
    document.getElementById('twmgr-fk-arr').value = config.fakes.arrLocal || '';
    document.getElementById('twmgr-fk-offset').value = config.fakes.offsetMs != null ? config.fakes.offsetMs : 150;
    document.getElementById('twmgr-fk-pct').value = config.fakes.pct != null ? config.fakes.pct : 1;
    document.getElementById('twmgr-fk-minpop').value = config.fakes.minPop || 0;
    document.getElementById('twmgr-fk-siege').value = config.fakes.siege || 'ram';
    document.getElementById('twmgr-fk-filler').value = config.fakes.filler || 'spy';
    const fkMode = document.querySelector('input[name="twmgr-fk-mode"][value="' + (config.fakes.mode || 'split') + '"]'); if (fkMode) fkMode.checked = true;
    renderFakeOrigins();
    fillFakeGroups();
    document.getElementById('twmgr-fk-group').addEventListener('change', (e) => { config.fakes.group = e.target.value; save(); renderFakeOrigins(); });
    document.getElementById('twmgr-fk-all').addEventListener('click', () => { document.querySelectorAll('.twmgr-fk-origin').forEach((cb) => cb.checked = true); readFakesCfg(); });
    document.getElementById('twmgr-fk-none').addEventListener('click', () => { document.querySelectorAll('.twmgr-fk-origin').forEach((cb) => cb.checked = false); readFakesCfg(); });
    ['twmgr-fk-targets', 'twmgr-fk-arr', 'twmgr-fk-offset', 'twmgr-fk-pct', 'twmgr-fk-minpop', 'twmgr-fk-siege', 'twmgr-fk-filler'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readFakesCfg); });
    document.querySelectorAll('input[name="twmgr-fk-mode"]').forEach((r) => r.addEventListener('change', readFakesCfg));
    document.getElementById('twmgr-fk-preview').addEventListener('click', fakePreview);
    document.getElementById('twmgr-fk-start').addEventListener('click', fakeStart);
    document.getElementById('twmgr-fk-stop').addEventListener('click', fakeStop);
    setFakeStatus(config.fakes.running);

    // ---- Planner (Coordenado) ----
    renderPlannerTabs();
    renderPlannerActive();
    ['twmgr-pl-target-x', 'twmgr-pl-target-y', 'twmgr-pl-arr', 'twmgr-pl-offset'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => { readPlannerCfg(); const atk = plActive(); renderPlannerVillages(atk).then(() => renderPlannerCards(atk)); }); });
    document.getElementById('twmgr-pl-all').addEventListener('click', () => {
      const atk = plActive();
      document.querySelectorAll('.twmgr-pl-vil').forEach((cb) => { cb.checked = true; const vid = cb.getAttribute('data-vid'); atk.selected[vid] = true; if (!atk.perVillage[vid] || !atk.perVillage[vid].length) atk.perVillage[vid] = [{ kind: 'attack', offsetMs: 0, amounts: {} }]; });
      save(); plannerRecomputeReservations(); renderPlannerCards(atk);
    });
    document.getElementById('twmgr-pl-none').addEventListener('click', () => {
      const atk = plActive();
      document.querySelectorAll('.twmgr-pl-vil').forEach((cb) => { cb.checked = false; });
      atk.selected = {}; atk.perVillage = {}; atk.homeAvail = {};
      save(); plannerRecomputeReservations(); renderPlannerCards(atk);
    });
    document.getElementById('twmgr-pl-load').addEventListener('click', () => plannerLoadHomeAvail(plActive()));
    document.getElementById('twmgr-pl-start').addEventListener('click', () => {
      readPlannerCfg();
      const atk = plActive();
      const wasRunning = atk.running;
      plannerStart(atk);
      if (atk.running && !wasRunning) {
        // Armou agora: libera um ataque novo em branco já selecionado, pra continuar configurando e armando sem travar o botão.
        plannerAddAttack();
      } else {
        setPlannerStatus(atk.running);
        renderPlannerTabs();
      }
    });
    document.getElementById('twmgr-pl-stop').addEventListener('click', () => { const atk = plActive(); plannerStop(atk); setPlannerStatus(false); renderPlannerTabs(); });
    document.getElementById('twmgr-pl-clear').addEventListener('click', () => plannerClearAll(plActive()));
    document.getElementById('twmgr-pl-queue-clear').addEventListener('click', plannerClearHistory);
    document.getElementById('twmgr-pl-tpl-save').addEventListener('click', plannerSaveTemplate);
    document.getElementById('twmgr-pl-tpl-apply').addEventListener('click', plannerApplyTemplate);
    document.getElementById('twmgr-pl-tpl-del').addEventListener('click', plannerDeleteTemplate);
    plannerRefreshTemplatesList();

    // Blindagem
    const blzUrlEl = document.getElementById('twmgr-blz-url');
    if (blzUrlEl) blzUrlEl.value = config.planner.blindagem.threadUrl || '';
    if (blzUrlEl) blzUrlEl.addEventListener('change', () => { config.planner.blindagem.threadUrl = blzUrlEl.value.trim(); save(); });
    const blzFetchBtn = document.getElementById('twmgr-blz-fetch');
    if (blzFetchBtn) blzFetchBtn.addEventListener('click', async () => {
      const url = (document.getElementById('twmgr-blz-url').value || '').trim();
      if (!url) { pushLog('Blindagem: cole a URL do tópico primeiro.', 'err'); return; }
      config.planner.blindagem.threadUrl = url; save();
      const status = document.getElementById('twmgr-blz-status');
      blzFetchBtn.disabled = true; if (status) status.textContent = '⏳ buscando…';
      try {
        const rows = await blindagemFetch(url);
        if (status) status.textContent = rows.length + ' pedido(s) · atualizado ' + new Date().toLocaleTimeString();
        pushLog('🛡️ Blindagem: ' + rows.length + ' pedido(s) carregado(s).', rows.length ? 'ok' : 'err', 'planner');
      } catch (e) {
        if (status) status.textContent = '⚠ ' + (e.message || e);
        pushLog('🛡️ Blindagem: erro ao buscar (' + (e.message || e) + ').', 'err', 'planner');
      }
      blzFetchBtn.disabled = false;
      renderBlindagemList();
    });
    const blzSendBtn = document.getElementById('twmgr-blz-send');
    if (blzSendBtn) blzSendBtn.addEventListener('click', async () => {
      blzSendBtn.disabled = true;
      try { await blindagemSend(); } catch (e) { pushLog('🛡️ Blindagem erro: ' + (e.message || e), 'err'); }
      blzSendBtn.disabled = false;
      renderBlindagemList();
    });
    renderBlindagemList();

    // ---- Paladino (treino por XP) ----
    document.getElementById('twmgr-pd-interval').value = config.paladin.checkIntervalMin != null ? config.paladin.checkIntervalMin : 240;
    document.getElementById('twmgr-pd-delay').value = config.paladin.sendDelayMs != null ? config.paladin.sendDelayMs : 500;
    renderPaladinVillages();
    renderPaladinStatus();
    ['twmgr-pd-interval', 'twmgr-pd-delay'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readPaladinCfg); });
    document.getElementById('twmgr-pd-start').addEventListener('click', paladinStart);
    document.getElementById('twmgr-pd-stop').addEventListener('click', paladinStop);
    setPaladinStatus(config.paladin.running);

    // ---- Obra (construção por perfil via grupos) ----
    document.getElementById('twmgr-ob-int').value = Math.round((config.obra.interval || 600) / 60);
    document.getElementById('twmgr-ob-max').value = config.obra.maxQueue != null ? config.obra.maxQueue : 5;
    document.getElementById('twmgr-ob-reserve').value = config.obra.reserveMin != null ? config.obra.reserveMin : 0;
    document.getElementById('twmgr-ob-farmpop').value = config.obra.farmFreePopMin != null ? config.obra.farmFreePopMin : 800;
    document.getElementById('twmgr-ob-storagepct').value = config.obra.storageFillPct != null ? config.obra.storageFillPct : 60;
    document.getElementById('twmgr-ob-research').checked = config.obra.autoResearch !== false;
    fillObraGroupSelects();
    renderObraDemand();
    ['twmgr-ob-int', 'twmgr-ob-max', 'twmgr-ob-reserve', 'twmgr-ob-farmpop', 'twmgr-ob-storagepct', 'twmgr-ob-research'].concat(OBRA_PROFILES.map((p) => 'twmgr-ob-g-' + p))
      .forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readObraCfg); });
    document.getElementById('twmgr-ob-start').addEventListener('click', obraStart);
    document.getElementById('twmgr-ob-stop').addEventListener('click', obraStop);
    setObraStatus(config.obra.running);

    document.getElementById('twmgr-mk-coord').value = config.market.destCoord || '';
    document.getElementById('twmgr-mk-reserve').value = config.market.reserve || 0;
    document.getElementById('twmgr-mk-int').value = Math.round((config.market.interval || 600) / 60);
    document.getElementById('twmgr-mk-thr').value = config.market.thresholdPct != null ? config.market.thresholdPct : 50;
    document.getElementById('twmgr-mk-dist').value = config.market.maxDist != null ? config.market.maxDist : 15;
    document.getElementById('twmgr-mk-sthr').value = config.market.solidarioThresholdPct != null ? config.market.solidarioThresholdPct : 50;
    document.getElementById('twmgr-mk-sdonormin').value = config.market.solidarioDonorMinPct != null ? config.market.solidarioDonorMinPct : 50;
    document.getElementById('twmgr-mk-sdonor').value = config.market.solidarioDonorPct != null ? config.market.solidarioDonorPct : 50;
    document.getElementById('twmgr-mk-sgargalo').value = config.market.solidarioGargaloKeepPct != null ? config.market.solidarioGargaloKeepPct : 90;
    document.getElementById('twmgr-mk-sdist').value = config.market.solidarioMaxDist != null ? config.market.solidarioMaxDist : 20;
    const mkModeR = document.querySelector('input[name="twmgr-mk-mode"][value="' + (config.market.mode || 'cunhagem') + '"]'); if (mkModeR) mkModeR.checked = true;
    const applyMkMode = () => {
      const m = (document.querySelector('input[name="twmgr-mk-mode"]:checked') || {}).value || 'cunhagem';
      document.getElementById('twmgr-mk-cunhagem').style.display = m === 'cunhagem' ? 'block' : 'none';
      document.getElementById('twmgr-mk-equilibrio').style.display = m === 'equilibrio' ? 'block' : 'none';
      document.getElementById('twmgr-mk-solidario').style.display = m === 'solidario' ? 'block' : 'none';
      document.getElementById('twmgr-mk-cunhar').style.display = m === 'cunhar' ? 'block' : 'none';
    };
    renderMarketSources();
    renderMintSources();
    fillMarketSolidarioGroupSelect();
    document.getElementById('twmgr-mk-all').addEventListener('click', () => { document.querySelectorAll('.twmgr-mk-src').forEach((cb) => cb.checked = true); readMarketCfg(); });
    document.getElementById('twmgr-mk-none').addEventListener('click', () => { document.querySelectorAll('.twmgr-mk-src').forEach((cb) => cb.checked = false); readMarketCfg(); });
    document.getElementById('twmgr-mk-mint-all').addEventListener('click', () => { document.querySelectorAll('.twmgr-mk-mint').forEach((cb) => cb.checked = true); readMarketCfg(); });
    document.getElementById('twmgr-mk-mint-none').addEventListener('click', () => { document.querySelectorAll('.twmgr-mk-mint').forEach((cb) => cb.checked = false); readMarketCfg(); });
    ['twmgr-mk-coord', 'twmgr-mk-reserve', 'twmgr-mk-int', 'twmgr-mk-thr', 'twmgr-mk-dist', 'twmgr-mk-sthr', 'twmgr-mk-sdonormin', 'twmgr-mk-sdonor', 'twmgr-mk-sgargalo', 'twmgr-mk-sdist', 'twmgr-mk-g-solid'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readMarketCfg); });
    document.querySelectorAll('input[name="twmgr-mk-mode"]').forEach((r) => r.addEventListener('change', () => { readMarketCfg(); applyMkMode(); }));
    applyMkMode();
    document.getElementById('twmgr-mk-start').addEventListener('click', marketStart);
    document.getElementById('twmgr-mk-stop').addEventListener('click', marketStop);
    setMarketStatus(config.market.running);

    document.getElementById('twmgr-bld-max').value = config.build.maxQueue || 5;
    document.getElementById('twmgr-bld-int').value = Math.round((config.build.interval || 600) / 60);
    ['twmgr-bld-max', 'twmgr-bld-int'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readBuildCfg); });
    document.querySelectorAll('.twmgr-bld-sub').forEach((el) => el.addEventListener('click', () => bldSwitchProf(el.getAttribute('data-prof'))));
    document.getElementById('twmgr-bld-add').addEventListener('click', bldAddItem);
    document.getElementById('twmgr-bld-reset').addEventListener('click', bldResetDefault);
    document.getElementById('twmgr-bld-clear').addEventListener('click', bldClearAll);
    bindBuildPlanHandlers();
    renderBuildPlan();
    document.getElementById('twmgr-bld-start').addEventListener('click', buildStart);
    document.getElementById('twmgr-bld-stop').addEventListener('click', buildStop);
    setBuildStatus(config.build.running);

    document.getElementById('twmgr-bb-tpl').value = config.bb.tpl || BB_TPL;
    document.getElementById('twmgr-bb-def').value = config.bb.defCoords || '';
    document.getElementById('twmgr-bb-fill').value = config.bb.feedFillPct != null ? config.bb.feedFillPct : 90;
    document.getElementById('twmgr-bb-overfill').checked = !!config.bb.feedAllowOverfill;
    document.getElementById('twmgr-bb-reserve').value = config.bb.feedReserve != null ? config.bb.feedReserve : 40;
    document.getElementById('twmgr-bb-dist').value = config.bb.feedMaxDist != null ? config.bb.feedMaxDist : 15;
    document.getElementById('twmgr-bb-max').value = config.bb.maxQueue || 5;
    document.getElementById('twmgr-bb-int').value = Math.round((config.bb.interval || 600) / 60);
    ['twmgr-bb-group', 'twmgr-bb-tpl', 'twmgr-bb-def', 'twmgr-bb-fill', 'twmgr-bb-overfill', 'twmgr-bb-reserve', 'twmgr-bb-dist', 'twmgr-bb-max', 'twmgr-bb-int'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readBBCfg); });
    document.getElementById('twmgr-bb-reload').addEventListener('click', fillGroupSelects);
    document.getElementById('twmgr-bb-tpl-reset').addEventListener('click', () => {
      if (!confirm('Resetar a ladder do Cultivo pro padrão do script?')) return;
      config.bb.tpl = BB_TPL; save();
      document.getElementById('twmgr-bb-tpl').value = BB_TPL;
      pushLog('Cultivo: ladder resetada pro padrão.', 'ok', 'bb');
    });
    document.getElementById('twmgr-bb-start').addEventListener('click', bbStart);
    document.getElementById('twmgr-bb-stop').addEventListener('click', bbStop);
    setBBStatus(config.bb.running);

    // Bárbaros do Mapa (BM)
    document.getElementById('twmgr-bm-dist').value = config.map.maxDist != null ? config.map.maxDist : 20;
    document.getElementById('twmgr-bm-days').value = config.map.minDaysSinceScout != null ? config.map.minDaysSinceScout : 0;
    document.getElementById('twmgr-bm-ciclo').value = config.map.cicloMin != null ? config.map.cicloMin : 30;
    document.getElementById('twmgr-bm-defmin').value = config.map.defesaMin != null ? config.map.defesaMin : 1;
    document.getElementById('twmgr-bm-rmassist').checked = !!config.map.removerDoAssistente;
    document.getElementById('twmgr-bm-minpts').value = config.map.minPoints != null ? config.map.minPoints : 26;
    document.getElementById('twmgr-bm-maxpts').value = config.map.maxPoints != null ? config.map.maxPoints : 5000;
    document.getElementById('twmgr-bm-maxper').value = config.map.maxPerVillage != null ? config.map.maxPerVillage : 20;
    document.getElementById('twmgr-bm-reserve').value = config.map.spyReserve != null ? config.map.spyReserve : 30;
    document.getElementById('twmgr-bm-spy').value = config.map.spyCount != null ? config.map.spyCount : 1;
    document.getElementById('twmgr-bm-delay').value = config.map.delay != null ? config.map.delay : 500;
    ['twmgr-bm-group', 'twmgr-bm-dist', 'twmgr-bm-days', 'twmgr-bm-minpts', 'twmgr-bm-maxpts', 'twmgr-bm-maxper', 'twmgr-bm-reserve', 'twmgr-bm-spy', 'twmgr-bm-delay', 'twmgr-bm-ciclo', 'twmgr-bm-defmin', 'twmgr-bm-rmassist'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readMapCfg); });
    document.querySelectorAll('.twmgr-bm-sub').forEach((b) => b.addEventListener('click', () => mapMostrarSub(b.getAttribute('data-sub'))));
    document.getElementById('twmgr-bm-reload').addEventListener('click', fillGroupSelects);
    document.getElementById('twmgr-bm-refmap').addEventListener('click', mapRefreshCache);
    document.getElementById('twmgr-bm-preview').addEventListener('click', mapPreview);
    document.getElementById('twmgr-bm-start').addEventListener('click', mapStart);
    document.getElementById('twmgr-bm-stop').addEventListener('click', mapStop);
    document.getElementById('twmgr-et-interval').value = config.etiqueta.intervalMin != null ? config.etiqueta.intervalMin : 2;
    document.getElementById('twmgr-et-interval').addEventListener('change', readEtiquetaCfg);
    document.getElementById('twmgr-et-start').addEventListener('click', etiquetaStart);
    document.getElementById('twmgr-et-stop').addEventListener('click', etiquetaStop);
    setEtiquetaStatus(config.etiqueta.running);
    setMapStatus(config.map.running);
    renderMapPreview();
    renderMapCounts();
    mapMostrarSub('alvos');

    // Cadeado automático
    document.getElementById('twmgr-lk-dist').value = config.lock.maxDist != null ? config.lock.maxDist : 10;
    document.getElementById('twmgr-lk-pts').value = config.lock.minPoints != null ? config.lock.minPoints : 500;
    document.getElementById('twmgr-lk-int').value = Math.round((config.lock.interval || 1800) / 60);
    ['twmgr-lk-dist', 'twmgr-lk-pts', 'twmgr-lk-int'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', readLockCfg); });
    document.getElementById('twmgr-lk-start').addEventListener('click', lockStart);
    document.getElementById('twmgr-lk-stop').addEventListener('click', lockStop);
    setLockStatus(config.lock.running);

    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.getAttribute('data-tab'))));
    // Toggle expandir/recolher o log por módulo
    document.querySelectorAll('.twmgr-modlog-head').forEach((h) => h.addEventListener('click', () => {
      const mod = h.getAttribute('data-modlog'); const body = document.getElementById('twmgr-modlog-body-' + mod); if (!body) return;
      const open = body.style.display !== 'none'; body.style.display = open ? 'none' : 'block';
      h.textContent = ''; h.insertAdjacentHTML('beforeend', (open ? '▸' : '▾') + ' Log do módulo (<span id="twmgr-modlog-count-' + mod + '">0</span>)');
      renderModLog(mod);
    }));
    // Cards + logs por módulo no estado inicial (dados salvos do último ciclo)
    ['scav', 'farm', 'wall', 'recruit', 'fakes', 'market', 'build', 'bb', 'map', 'lock', 'planner', 'paladin', 'etiqueta', 'obra'].forEach((m) => { refreshCards(m); renderModLog(m); });
    // busca o recurso do dia (saque/coleta) ao abrir, pra não mostrar valor velho salvo até o 1º ciclo
    refreshDaily('farm', config.farm, 'loot', 'loot_res'); refreshDaily('scav', config.scav, 'coleta', 'scavenge');
    const applyCollapsed = () => { p.classList.toggle('twmgr-collapsed', !!config.uiMin); const mb = document.getElementById('twmgr-min'); if (mb) mb.textContent = config.uiMin ? '＋' : '–'; };
    document.getElementById('twmgr-min').addEventListener('click', (e) => { e.stopPropagation(); config.uiMin = !config.uiMin; save(); applyCollapsed(); });
    document.getElementById('twmgr-upd-btn').addEventListener('click', (e) => { e.stopPropagation(); if (updateInfo.hasUpdate) doUpdate(); else checkForUpdate(true); });
    const lastCheck = Number(localStorage.getItem(KEY + '_lastUpdCheck') || 0);
    if (Date.now() - lastCheck > 3600000) checkForUpdate(false);
    setInterval(() => checkForUpdate(false), 3600000);
    applyCollapsed();
    makeDraggable(p, document.getElementById('twmgr-head'));

    showTab('farm');
    renderLog();
    setStatus(config.running);
    uiTimer = setInterval(tickUI, 1000);

    // Freio anti-spam: quando a página recarrega em rajada (você navegando no jogo), não repete
    // as mensagens de "retomado". Só loga se passaram >30s desde o último log de retomada.
    const _lrl = Number(localStorage.getItem(KEY + '_lastResumeLog') || 0);
    const resumeQuiet = (Date.now() - _lrl) < 30000;
    if (!resumeQuiet) localStorage.setItem(KEY + '_lastResumeLog', String(Date.now()));
    const rlog = (m, mod) => { if (!resumeQuiet && !lockOther()) pushLog(m, 'ok', mod); };

    if (!resumeQuiet && anyRunning() && lockOther()) pushLog('Outra aba já está ativa; esta ficará em espera.', 'err');

    // RETOMADA ESCALONADA. Antes, todo módulo ligado retomava em t=0 — e cinco deles
    // chamam o próprio ciclo direto, disparando na hora. O painel de rede do usuário
    // mostrou três requisições nossas tomando 429 no carregamento da página, junto com as
    // 128 que o próprio jogo já faz pra montar a tela. A rajada era garantida.
    //
    // Agora cada módulo entra com alguns segundos de diferença. O primeiro espera um
    // pouco de propósito: a página ainda está carregando os recursos dela, e é o pior
    // momento possível pra competir por banda e por limite de requisição.
    const RETOMA_INICIAL_MS = 6000, RETOMA_ESPACO_MS = 4000;
    let _retomaN = 0;
    const retomar = (fn) => {
      const atraso = RETOMA_INICIAL_MS + (_retomaN++) * RETOMA_ESPACO_MS;
      setTimeout(() => { try { fn(); } catch (e) { console.warn('[TWMgr] retomada falhou:', e); } }, atraso);
    };

    if (config.running) { rlog('Auto-ATK retomado.'); retomar(processDue); }
    if (config.scav.running) { rlog('Coleta retomada.', 'scav'); retomar(scheduleScav); }
    if (config.farm.running) { rlog('Saque retomado.', 'farm'); retomar(scheduleFarm); }
    if (config.wall.running) { rlog('Muralha retomada.', 'wall'); retomar(scheduleWall); }
    if (config.recruit.running) { rlog('Recrutar retomado.', 'recruit'); retomar(scheduleRecruit); }
    if (config.fakes.running) { config.fakes.gen.forEach((f) => { if (f.state === 'scheduled') f.state = 'armed'; }); rlog('Fakes rearmados.', 'fakes'); retomar(fakeTick); }
    if (config.market.running) { rlog('Mercado retomado.', 'market'); retomar(scheduleMarket); }
    if (config.build.running) { rlog('Edifícios retomado.', 'build'); retomar(scheduleBuild); }
    if (config.bb && config.bb.running) { rlog('Cultivo retomado.', 'bb'); retomar(scheduleBB); }
    if (config.map && config.map.running) { rlog('Mapa retomado.', 'map'); retomar(scheduleMap); }
    if (config.etiqueta && config.etiqueta.running) { rlog('🏷️ Etiqueta retomada.', 'etiqueta'); retomar(etiquetaTick); }
    if (config.lock && config.lock.running) { rlog('🔒 Cadeado retomado.', 'lock'); retomar(scheduleLock); }
    if (config.planner && config.planner.attacks && config.planner.attacks.some((a) => a.running)) {
      config.planner.attacks.forEach((atk) => { if (!atk.running) return; (atk.rows || []).forEach((r) => { if (r.state === 'scheduled') r.state = 'armed'; }); });
      rlog('🎯 Coordenado retomado.', 'planner');
      retomar(plannerTick);
    }
    if (config.paladin && config.paladin.running) { rlog('Paladino retomado.', 'paladin'); retomar(paladinTick); }
    if (config.obra && config.obra.running) { rlog('🏛️ Obra retomada.', 'obra'); retomar(obraTick); }
    closeStaleLiveLogs();   // barra de progresso de ciclo que morreu no reload desta página
    installBotHooks();
    startCaptchaWatcher();
    startAutoReload();
  }

  function makeDraggable(panel, handle) {
    let sx, sy, ox, oy, drag = false;
    // Exceção pela ÁREA, não pela lista de ids: a lista antiga não tinha o botão da
    // Central, então clicar nele iniciava um arrasto e o `right:auto` jogava o painel pra
    // esquerda — parecia que o botão só funcionava depois de o painel se mexer. Excluir o
    // bloco de ações inteiro resolve pra qualquer botão que venha depois.
    handle.addEventListener('mousedown', (e) => { if (e.target.closest('#twmgr-head-actions')) return; drag = true; sx = e.clientX; sy = e.clientY; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; panel.style.right = 'auto'; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => { if (!drag) return; panel.style.left = (ox + e.clientX - sx) + 'px'; panel.style.top = (oy + e.clientY - sy) + 'px'; });
    document.addEventListener('mouseup', () => { drag = false; });
  }

