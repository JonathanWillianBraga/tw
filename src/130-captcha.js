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

