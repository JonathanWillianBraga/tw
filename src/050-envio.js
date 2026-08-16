  // ==================== ENVIO (primitivas de ataque/apoio compartilhadas) ====================
  // Sobrou do módulo Fakes, aposentado na v11.16.0. Nada aqui é específico de fake: é o preparo de
  // comando em 2 etapas do jogo (`try=confirm` -> `action=command`) mais helpers de aldeia/pontos.
  // Quem consome: a Central de Comando (fakePrepare, getFakeVillage), o Coordenado (attackPrepare/
  // attackFire) e o Saque (FAKE_POP, carryOf, getVillagePoints). Os nomes com "fake" ficaram por
  // histórico — renomear obrigaria a mexer em 175/180/060 sem ganho real.
  async function fakePrepare(vid, x, y, amounts, kind) {
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
    if (!form) { const errEl = doc.querySelector('.error, .autoHideBox, #command_confirmation_error'); throw new Error(errEl ? errEl.textContent.trim().slice(0, 80) : 'confirmação falhou (tropa/alvo)'); }
    let dur = null;
    const dd = doc.querySelector('[data-duration]');
    if (dd) dur = parseInt(dd.getAttribute('data-duration'), 10);
    if (!dur) { const txt = doc.body ? doc.body.textContent : t1; const m = txt.match(/dura[çc][aã]o[^0-9]{0,12}(\d{1,2}):([0-5]\d):([0-5]\d)/i); if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); }
    const params = {};
    form.querySelectorAll('input, select').forEach((el) => { if (el.name) params[el.name] = el.value; });
    if (!params.h) params.h = CSRF;
    const action = form.getAttribute('action') || ('/game.php?village=' + vid + '&screen=place&action=command&h=' + CSRF);
    return { action: absUrl(action), params: params, dur: dur };
  }
  // Recusa do servidor num POST de comando, lida de forma ESTRUTURAL.
  //
  // Por que não basta procurar uma frase: o código antigo testava "não tem tropas suficientes",
  // mas o servidor responde "Não existem unidades suficientes" — não casava, a função devolvia
  // sucesso e o comando era dado como enviado sem NADA ter saído. Medido na conta real: 3
  // comandos marcados "enviado" com desvio +0ms, e só 1 existia de fato no jogo.
  // O .error_box é a caixa que o próprio jogo usa pra recusa (o mesmo elemento que o preparo já
  // lê), então vale pra qualquer motivo — tropa, população, NAP, proteção — sem adivinhar texto.
  function erroDeComando(t2) {
    try {
      const doc = new DOMParser().parseFromString(t2, 'text/html');
      const el = doc.querySelector('.error_box, .error, #command_confirmation_error');
      if (el) { const m = (el.textContent || '').replace(/\s+/g, ' ').trim(); if (m) return m.slice(0, 150); }
    } catch (e) { /* sem DOM utilizável: cai no texto abaixo */ }
    if (/n[aã]o (tem|existem|h[áa]) (tropas|unidades) suficientes|enough (units|troops)/i.test(t2)) return 'recusado: tropas insuficientes';
    return null;
  }
  async function fakeFire(prep) {
    const r2 = await fetch(prep.action, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(prep.params).toString() });
    const t2 = await r2.text();
    const err = erroDeComando(t2);
    if (err) throw new Error(err);
    return true;
  }
  const attackPrepare = fakePrepare, attackFire = fakeFire;
  const FAKE_POP = { spear: 1, sword: 1, axe: 1, archer: 1, spy: 2, light: 4, marcher: 5, heavy: 6, ram: 5, catapult: 8, knight: 10, snob: 100 };
  // Capacidade de carga de um conjunto de unidades (usa o CARRY declarado lá no topo).
  const carryOf = (units) => Object.keys(units || {}).reduce((s, u) => s + (parseInt(units[u], 10) || 0) * (CARRY[u] || 0), 0);
  function parseCoords(raw) {
    const out = [], seen = {};
    (raw || '').split(/[\s,;]+/).forEach((tok) => { const m = tok.match(/^(\d{1,3})\|(\d{1,3})$/); if (m) { const c = m[1] + '|' + m[2]; if (!seen[c]) { seen[c] = 1; out.push({ x: m[1], y: m[2] }); } } });
    return out;
  }
  async function getFakeVillage(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=place', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const avail = {};
    UNITS.forEach(([u]) => { let n = 0; const alt = doc.querySelector('a.units-entry-all[data-unit="' + u + '"]'); if (alt) { const dc = alt.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (alt.textContent || '').replace(/\D/g, ''), 10); } avail[u] = isNaN(n) ? 0 : n; });
    const pm = doc.querySelector('#pop_max_label');
    const popMax = pm ? (parseInt((pm.textContent || '').replace(/\D/g, ''), 10) || 0) : 0;
    return { avail: applyReservationsToAvail(vid, avail), popMax: popMax };
  }
  let _pointsCache = null;
  const PONTOS_TTL_MS = 6 * 3600 * 1000;
  async function getVillagePoints() {
    if (_pointsCache) return _pointsCache;
    // Ate a v11.199.0 isto nao tinha TTL nem disco: com auto-F5 de 2 min, o village.txt do mundo
    // INTEIRO era rebaixado praticamente a cada reload. Pontuacao muda devagar; 6h basta.
    const doDisco = cacheLer('pontos', PONTOS_TTL_MS);
    if (doDisco && Object.keys(doDisco).length) { _pointsCache = doDisco; return doDisco; }
    const res = await fetch('/map/village.txt', { credentials: 'include' });
    const txt = await res.text();
    const map = {};
    txt.split('\n').forEach((line) => { const f = line.split(','); if (f.length >= 6) { const id = f[0], pts = parseInt(f[5], 10); if (id && !isNaN(pts)) map[id] = pts; } });
    _pointsCache = map;
    cacheGravar('pontos', map);
    return map;
  }
