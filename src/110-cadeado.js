  // ==================== CADEADO (reserva automática de aldeia bárbara p/ tribo) ====================
  // Endpoint confirmado via DevTools (não chutado): GET /game.php?village=X&screen=info_village&id=Y
  // &ajaxaction=toggle_reserve_village&json=1&h=CSRF — é um TOGGLE (chamar de novo tira o cadeado).
  // Por isso o script guarda em config.lock.reserved quem ELE JÁ travou e nunca chama de novo em cima
  // — sem essa memória, rodar 2x seguidas destravaria tudo que já tinha travado.
  async function toggleReserveVillage(targetVid) {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=info_village&id=' + targetVid + '&ajaxaction=toggle_reserve_village&json=1&h=' + CSRF, { credentials: 'include' });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!j || !j.response || !j.response.code) throw new Error('resposta inesperada (' + (txt || '').slice(0, 100).replace(/\s+/g, ' ') + ')');
    return j.response;   // { code, village, type: 'add'|'remove', id }
  }
  // Cor do ÚLTIMO relatório contra essa aldeia (green/yellow/blue/red), lida do popup real de info da
  // aldeia — endpoint confirmado via DevTools (não chutado): GET .../screen=map&ajax=map_info&source=
  // <minha>&target=<alvo>. Preferido ao assistente de farm (getFarmTargets) porque o assistente NÃO
  // lista aldeias abandonadas/de baixo recurso — um caso real escapou o filtro por causa disso.
  async function getLastAttackColor(targetVid) {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=map&ajax=map_info&source=' + CUR_VID + '&target=' + targetVid, { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const cell = doc.getElementById('info_last_attack');
    if (!cell) return null;   // nunca atacamos essa aldeia -> sem relatório
    const img = cell.querySelector('img[src*="/dots/"]');
    const m = img ? (img.getAttribute('src') || '').match(/dots\/(\w+)\./) : null;
    return m ? m[1] : null;
  }
  async function lockTick() {
    clearTimeout(lockTimer);
    if (!config.lock.running) return;
    if (lockOther()) { lockTimer = setTimeout(lockTick, 5000); return; }
    if (captchaBlocked()) { lockTimer = setTimeout(lockTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.lock.nextAt || 0) > now) { scheduleLock(); return; }
    let allV, mine;
    try { allV = await getMapVillages(); }
    catch (e) { pushLog('Cadeado: erro ao ler village.txt (' + (e.message || e) + ').', 'err', 'lock'); config.lock.nextAt = now + 60000; save(); scheduleLock(); return; }
    try { mine = await getAllVillagesCached(); }
    catch (e) { pushLog('Cadeado: erro ao listar minhas aldeias (' + (e.message || e) + ').', 'err', 'lock'); config.lock.nextAt = now + 60000; save(); scheduleLock(); return; }
    const myV = [];
    mine.forEach((v) => { const cm = (v.coord || '').match(/(\d+)\|(\d+)/); if (cm) myV.push({ x: +cm[1], y: +cm[2] }); });
    if (!myV.length) { pushLog('Cadeado: nenhuma aldeia própria encontrada.', 'err', 'lock'); config.lock.nextAt = now + 300000; save(); scheduleLock(); return; }
    const maxDist = config.lock.maxDist || 10, minPts = config.lock.minPoints || 0;
    // "no raio de TODAS as suas aldeias" = distância até a MAIS PERTO das suas aldeias, não de uma só.
    const inRange = allV.filter((b) => b.player === '0' && b.points >= minPts && myV.some((s) => fieldDist(s.x, s.y, b.x, b.y) <= maxDist))
      .sort((a, b) => b.points - a.points);   // mais pontos primeiro
    config.lock.reserved = config.lock.reserved || {};
    let lockedNow = 0, restored = 0, redSkipped = 0;
    for (const b of inRange) {
      const pare = devoParar('lock');
      if (pare) { pushLog('Cadeado: interrompido — ' + pare + '. ' + lockedNow + ' travada(s) nesse ciclo até agora.', 'err', 'lock'); config.lock.nextAt = now + 30000; save(); scheduleLock(); return; }
      if (config.lock.reserved[b.vid]) continue;   // já travamos essa antes, não mexe (evita destravar)
      // Só checa relatório de quem AINDA não travamos — mantém o custo de rede proporcional só às
      // candidatas novas do ciclo, não ao raio inteiro de novo toda vez.
      let color = null;
      try { color = await getLastAttackColor(b.vid); }
      catch (e) { pushLog('Cadeado: erro ao checar relatório de ' + b.name + ' (' + (e.message || e) + ') — pulando por segurança.', 'err', 'lock'); continue; }
      if (color === 'red') { redSkipped++; await sleep(150); continue; }
      try {
        const r = await toggleReserveVillage(b.vid);
        if (r.type !== 'add') {
          // já estava travada por fora do nosso controle (manual, ou outra sessão) — desfizemos sem
          // querer; desfaz o desfazer e só então passa a rastrear.
          await sleep(300);
          await toggleReserveVillage(b.vid);
          restored++;
          pushLog('Cadeado: ' + b.name + ' (' + b.x + '|' + b.y + ') já estava travada — restaurada.', '', 'lock');
        } else {
          lockedNow++;
          pushLog('Cadeado: 🔒 ' + b.name + ' (' + b.x + '|' + b.y + ', ' + fmtN(b.points) + ' pts).', 'ok', 'lock');
        }
        config.lock.reserved[b.vid] = now;
        await sleep(400 + Math.floor(Math.random() * 300));
      } catch (e) { pushLog('Cadeado em ' + b.name + ' (' + b.x + '|' + b.y + '): ' + (e.message || e), 'err', 'lock'); }
    }
    // PODA — e aqui ela tem que ser mais covarde que nas outras estruturas, porque o endpoint e
    // um TOGGLE: apagar a memoria de uma aldeia que AINDA e candidata faz o proximo ciclo chamar
    // o toggle em cima dela e DESTRAVAR o que ja estava travado. (Existe o conserto do
    // `type !== 'add'`, mas ele custa 2 requisicoes e deixa a aldeia solta no meio.)
    //
    // Por isso o criterio nao e idade: so sai vid que deixou de ser BÁRBARO (foi conquistada) ou
    // sumiu do mundo. O laço acima so visita `inRange`, que exige `player === '0'` -- entao uma
    // entrada assim nunca mais seria consultada, e apagar nao pode disparar toggle nenhum.
    const barbAgora = {};
    allV.forEach((v) => { if (v.player === '0') barbAgora[v.vid] = 1; });
    let podados = 0;
    Object.keys(config.lock.reserved).forEach((vid) => { if (!barbAgora[vid]) { delete config.lock.reserved[vid]; podados++; } });
    if (podados) pushLog('Cadeado: poda — ' + podados + ' aldeia(s) saíram do registro (não são mais bárbaras).', '', 'lock');
    config.lock.stats = { inRange: inRange.length, total: Object.keys(config.lock.reserved).length, lockedNow: lockedNow, redSkipped: redSkipped };
    config.lock.nextAt = now + Math.max(60, config.lock.interval || 1800) * 1000;
    save();
    refreshCards('lock');
    pushLog('Cadeado: ciclo concluído — ' + lockedNow + ' nova(s) travada(s)' + (restored ? ', ' + restored + ' restaurada(s)' : '') + ' (' + inRange.length + ' no raio, ' + Object.keys(config.lock.reserved).length + ' travadas ao todo, ' + redSkipped + ' pulada(s) por relatório vermelho). Próximo em ' + Math.round((config.lock.interval || 1800) / 60) + ' min.', 'ok', 'lock');
    scheduleLock();
  }
  function scheduleLock() { clearTimeout(lockTimer); if (!config.lock.running) return; lockTimer = setTimeout(lockTick, Math.min(Math.max((config.lock.nextAt || 0) - Date.now(), 1000), 60000)); }
  function readLockCfg() {
    const c = config.lock, g = (id) => document.getElementById(id);
    if (g('twmgr-lk-dist')) c.maxDist = Math.max(1, parseFloat((g('twmgr-lk-dist').value || '').replace(',', '.')) || 10);
    if (g('twmgr-lk-pts')) c.minPoints = Math.max(0, parseInt(g('twmgr-lk-pts').value, 10) || 0);
    if (g('twmgr-lk-int')) c.interval = Math.max(1, parseInt(g('twmgr-lk-int').value, 10) || 30) * 60;
    save();
  }
  function setLockStatus(on) { setBtnState('twmgr-lk-start', 'twmgr-lk-stop', on, '● Rastreando', '▶ Iniciar'); }
  function lockStart() {
    readLockCfg();
    config.lock.running = true; config.lock.nextAt = 0; save();
    setLockStatus(true);
    pushLog('Cadeado iniciado — raio ≤ ' + config.lock.maxDist + ' campos, ' + config.lock.minPoints + '+ pts, reciclo a cada ' + Math.round((config.lock.interval || 1800) / 60) + ' min.', 'ok', 'lock');
    lockTick();
  }
  function lockStop() { readLockCfg(); config.lock.running = false; save(); clearTimeout(lockTimer); setLockStatus(false); pushLog('Cadeado parado.', '', 'lock'); }

