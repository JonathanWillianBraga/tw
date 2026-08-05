  // ==================== NOBLAR (planeja e arma a conquista de alvos) ====================
  // Voce cola as coordenadas, define o limite de horas de viagem, e o modulo monta o PLANO: de quais
  // aldeias sairiam os nobres e em quanto tempo cada comando chega. Ele NAO dispara sozinho --
  // decisao do usuario: nobre e caro e o envio e irreversivel, entao o disparo passa pelo seu OK.
  //
  // A duracao vem do PROPRIO JOGO. Em vez de calcular distancia x velocidade da unidade x velocidade
  // do mundo (tres constantes pra errar), o plano prepara o comando de verdade (`try=confirm`) e le
  // o `data-duration` que o servidor devolve. Vale em qualquer mundo, com ou sem bonus de velocidade.
  //
  // Escolta: por enquanto manda SO nobre. Nobre sozinho morre pra qualquer defesa -- serve pra alvo
  // ja limpo. Levar nuke junto e outra decisao (e outra tela), entao ficou de fora de proposito.

  const NOBLE_POR_CONQUISTA = 4;   // 4 nobres derrubam 100 de lealdade no caso tipico

  function nobleParseCoords(txt) {
    // Aceita "555|444", "555444", "555 444" e texto misto no meio -- igual ao campo do jogo.
    const out = [], visto = {};
    (txt || '').split(/[\s,;\n]+/).forEach((tk) => {
      const m = tk.match(/^(\d{3})\|?(\d{3})$/) || tk.match(/^(\d{2,3})\|(\d{2,3})$/);
      if (!m) return;
      const c = m[1] + '|' + m[2];
      if (visto[c]) return;
      visto[c] = 1;
      out.push({ coord: c, x: +m[1], y: +m[2] });
    });
    return out;
  }

  // Aldeias proprias ordenadas pela distancia ate o alvo, com os nobres que cada uma tem agora.
  // `reservado` respeita as reservas do resto do script, pra nao prometer nobre que outro modulo ja
  // contou (o Coordenado guarda tropa desse jeito).
  async function nobleOrigensPerto(alvo, todas, cacheTropa) {
    const perto = [];
    todas.forEach((v) => {
      const m = (v.coord || '').match(/(\d+)\|(\d+)/);
      if (!m) return;
      perto.push({ vid: v.vid, nome: v.name || v.coord, coord: v.coord,
                   d: fieldDist(+m[1], +m[2], alvo.x, alvo.y) });
    });
    perto.sort((a, b) => a.d - b.d);
    for (const o of perto) {
      if (cacheTropa[o.vid] === undefined) {
        try { cacheTropa[o.vid] = ((await getVillageStateReserved(o.vid)).avail || {}).snob || 0; }
        catch (e) { cacheTropa[o.vid] = 0; }
        await sleep(200);
      }
      o.nobres = cacheTropa[o.vid] || 0;
    }
    return perto;
  }

  // Monta o plano de UM alvo. Devolve { pronto, envios[], falta, motivo }.
  //   pronto  = da pra conquistar agora com o que existe dentro do limite de horas
  //   envios  = [{vid, nome, coord, qtd, durSec}]
  //   falta   = quantos nobres ainda faltam
  async function noblePlanejarAlvo(alvo, todas, cacheTropa) {
    const limite = Math.max(1, config.noble.maxHoras || 6) * 3600;
    const origens = await nobleOrigensPerto(alvo, todas, cacheTropa);
    const comNobre = origens.filter((o) => o.nobres > 0);
    if (!comNobre.length) {
      return { pronto: false, envios: [], falta: NOBLE_POR_CONQUISTA, dentroDoLimite: origens, motivo: 'nenhuma aldeia com nobre' };
    }

    // "So NT" exige os 4 saindo da MESMA aldeia; senao pode somar de varias, da mais perto pra mais longe.
    const candidatos = config.noble.soNT
      ? comNobre.filter((o) => o.nobres >= NOBLE_POR_CONQUISTA).slice(0, 1)
      : comNobre;
    if (!candidatos.length) {
      return { pronto: false, envios: [], falta: NOBLE_POR_CONQUISTA, dentroDoLimite: origens,
               motivo: 'nenhuma aldeia com ' + NOBLE_POR_CONQUISTA + ' nobres (modo só NT)' };
    }

    const envios = [];
    let faltam = NOBLE_POR_CONQUISTA;
    for (const o of candidatos) {
      if (faltam <= 0) break;
      const qtd = Math.min(o.nobres, faltam);
      // Prepara de verdade so pra LER a duracao. O comando nao e disparado aqui.
      let dur = null;
      try {
        const p = await fakePrepare(o.vid, alvo.x, alvo.y, { snob: qtd });
        dur = p.dur || null;
      } catch (e) {
        pushLog('Noblar: ' + o.nome + ' → ' + alvo.coord + ' não deu pra conferir a duração (' + (e.message || e) + ').', '', 'noble');
        continue;
      }
      await sleep(250);
      if (dur == null) { pushLog('Noblar: ' + o.nome + ' → ' + alvo.coord + ': o jogo não informou a duração — origem descartada.', '', 'noble'); continue; }
      if (dur > limite) continue;                     // fora do limite de horas: proxima origem
      envios.push({ vid: o.vid, nome: o.nome, coord: o.coord, qtd: qtd, durSec: dur, d: o.d });
      faltam -= qtd;
    }
    return {
      pronto: faltam <= 0 && envios.length > 0,
      envios: envios, falta: Math.max(0, faltam), dentroDoLimite: origens,
      motivo: faltam > 0 ? ('faltam ' + faltam + ' nobre(s) dentro de ' + (config.noble.maxHoras || 6) + 'h') : null,
    };
  }

  async function nobleTick() {
    clearTimeout(nobleTimer);
    if (!config.noble.running) return;
    if (lockOther()) { nobleTimer = setTimeout(nobleTick, 5000); return; }
    if (captchaBlocked()) { nobleTimer = setTimeout(nobleTick, 30000); return; }
    claimLock();
    const now = Date.now();
    if ((config.noble.nextAt || 0) > now) { scheduleNoble(); return; }

    const alvos = config.noble.alvos || [];
    if (!alvos.length) {
      pushLog('Noblar: nenhum alvo na lista.', '', 'noble');
      config.noble.nextAt = now + 300000; save(); scheduleNoble(); return;
    }

    let todas = [];
    try { todas = await getAllVillagesCached(); }
    catch (e) {
      pushLog('Noblar: erro ao listar as aldeias (' + (e.message || e) + ').', 'err', 'noble');
      config.noble.nextAt = now + 120000; save(); scheduleNoble(); return;
    }

    const cacheTropa = {};
    const plano = [];
    let prontos = 0;
    for (const alvo of alvos) {
      { const pare = devoParar('noble'); if (pare) { pushLog('Noblar: ciclo interrompido — ' + pare + '.', '', 'noble'); break; } }
      const r = await noblePlanejarAlvo(alvo, todas, cacheTropa);
      plano.push({ coord: alvo.coord, x: alvo.x, y: alvo.y, pronto: r.pronto,
                   envios: r.envios, falta: r.falta, motivo: r.motivo });
      if (r.pronto) prontos++;
    }

    config.noble.plano = plano;
    config.noble.planoAt = now;
    config.noble.stats = { alvos: alvos.length, prontos: prontos, faltando: alvos.length - prontos };
    config.noble.nextAt = now + Math.max(60, config.noble.interval || 900) * 1000;
    save();
    renderNoblePlano();
    refreshCards('noble');
    pushLog('Noblar: plano refeito — ' + prontos + ' de ' + alvos.length + ' alvo(s) com nobre suficiente dentro de '
      + (config.noble.maxHoras || 6) + 'h. Nada foi enviado.', 'ok', 'noble');
    scheduleNoble();
  }
  function scheduleNoble() {
    clearTimeout(nobleTimer);
    if (!config.noble.running) return;
    nobleTimer = setTimeout(nobleTick, Math.min(Math.max((config.noble.nextAt || 0) - Date.now(), 1000), 60000));
  }

  // Disparo: so acontece por clique. Reprepara na hora em vez de reusar o payload do plano -- o CSRF
  // muda a cada carregamento de pagina, e um payload velho falharia calado.
  async function nobleDispararAlvo(coord) {
    const item = (config.noble.plano || []).find((p) => p.coord === coord);
    if (!item || !item.pronto) { alert('Esse alvo não está pronto no plano.'); return; }
    const resumo = item.envios.map((e) => e.qtd + 'x de ' + e.nome + ' (' + fmtDur(e.durSec) + ')').join('\n');
    if (!confirm('Enviar ' + NOBLE_POR_CONQUISTA + ' nobre(s) para ' + coord + '?\n\n' + resumo
      + '\n\nIsso NÃO tem volta.')) return;

    let ok = 0;
    for (const e of item.envios) {
      try {
        await sendAttack(e.vid, item.x, item.y, { snob: e.qtd });
        ok += e.qtd;
        pushLog('Noblar: ' + e.nome + ' → ' + coord + ' — ' + e.qtd + ' nobre(s) enviado(s), chega em ' + fmtDur(e.durSec) + '.', 'ok', 'noble');
      } catch (err) {
        pushLog('Noblar: ' + e.nome + ' → ' + coord + ' FALHOU: ' + (err.message || err), 'err', 'noble');
      }
      await sleep(400);
    }
    pushLog('Noblar: ' + coord + ' — ' + ok + ' de ' + NOBLE_POR_CONQUISTA + ' nobre(s) saíram.', ok >= NOBLE_POR_CONQUISTA ? 'ok' : 'err', 'noble');
    item.pronto = false; item.motivo = 'enviado';   // nao oferece disparar de novo sem replanejar
    save(); renderNoblePlano();
  }

  function fmtDur(s) {
    if (s == null) return '—';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h + 'h' + String(m).padStart(2, '0');
  }

  // ===== UI =====
  function nobleAddCoords() {
    const ta = document.getElementById('twmgr-nb-coords'); if (!ta) return;
    const novos = nobleParseCoords(ta.value);
    if (!novos.length) { alert('Nenhuma coordenada válida no texto.'); return; }
    const jaTem = {}; (config.noble.alvos || []).forEach((a) => { jaTem[a.coord] = 1; });
    let n = 0;
    novos.forEach((a) => { if (!jaTem[a.coord]) { config.noble.alvos.push(a); n++; } });
    ta.value = '';
    save(); renderNoblePlano();
    pushLog('Noblar: ' + n + ' alvo(s) adicionado(s)' + (novos.length - n ? ' (' + (novos.length - n) + ' já estavam na lista)' : '') + '.', 'ok', 'noble');
  }
  function nobleContarCoords() {
    const ta = document.getElementById('twmgr-nb-coords');
    const el = document.getElementById('twmgr-nb-count');
    if (!ta || !el) return;
    const n = nobleParseCoords(ta.value).length;
    el.textContent = n + ' coordenada' + (n === 1 ? '' : 's');
  }
  function renderNoblePlano() {
    const box = document.getElementById('twmgr-nb-lista'); if (!box) return;
    const alvos = config.noble.alvos || [], plano = config.noble.plano || [];
    if (!alvos.length) {
      box.innerHTML = '<div style="color:#8a7340;text-align:center;padding:10px;font-size:10px">— nenhum alvo na lista —</div>';
      return;
    }
    const porCoord = {}; plano.forEach((p) => { porCoord[p.coord] = p; });
    box.innerHTML = '<table class="twmgr-bld-tab"><thead><tr>' +
      '<th>Alvo</th><th>Origens</th><th>Chegada</th><th>Estado</th><th></th></tr></thead><tbody>' +
      alvos.map((a, i) => {
        const p = porCoord[a.coord];
        const origens = p && p.envios.length
          ? p.envios.map((e) => e.qtd + '× ' + esc(e.nome)).join(', ') : '<span style="color:#8a7340">—</span>';
        const chegada = p && p.envios.length
          ? p.envios.map((e) => fmtDur(e.durSec)).join(' / ') : '—';
        const estado = !p ? '<span style="color:#8a7340">sem plano</span>'
          : p.pronto ? '<b style="color:#3f8f52">pronto</b>'
          : '<span style="color:#8a7340">' + esc(p.motivo || 'incompleto') + '</span>';
        const acao = (p && p.pronto)
          ? '<a class="twmgr-nb-fire" data-coord="' + esc(a.coord) + '">Enviar</a> · <a class="twmgr-nb-rm" data-coord="' + esc(a.coord) + '">✕</a>'
          : '<a class="twmgr-nb-rm" data-coord="' + esc(a.coord) + '">✕</a>';
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">' +
          '<td><b>' + esc(a.coord) + '</b></td><td>' + origens + '</td><td>' + chegada + '</td>' +
          '<td>' + estado + '</td><td>' + acao + '</td></tr>';
      }).join('') + '</tbody></table>';
    const info = document.getElementById('twmgr-nb-info');
    if (info) {
      const p = config.noble.planoAt
        ? 'plano de ' + new Date(config.noble.planoAt).toLocaleTimeString('pt-BR') : 'sem plano ainda';
      info.textContent = alvos.length + ' alvo(s) · ' + p;
    }
  }
  function bindNobleHandlers() {
    const box = document.getElementById('twmgr-nb-lista'); if (!box) return;
    box.addEventListener('click', (e) => {
      const el = e.target, coord = el.getAttribute && el.getAttribute('data-coord');
      if (!coord) return;
      if (el.classList.contains('twmgr-nb-fire')) nobleDispararAlvo(coord);
      else if (el.classList.contains('twmgr-nb-rm')) {
        config.noble.alvos = (config.noble.alvos || []).filter((a) => a.coord !== coord);
        config.noble.plano = (config.noble.plano || []).filter((p) => p.coord !== coord);
        save(); renderNoblePlano(); refreshCards('noble');
      }
    });
  }
  function readNobleCfg() {
    const c = config.noble, g = (id) => document.getElementById(id);
    if (g('twmgr-nb-horas')) c.maxHoras = Math.max(1, parseInt(g('twmgr-nb-horas').value, 10) || 6);
    if (g('twmgr-nb-nt')) c.soNT = g('twmgr-nb-nt').checked;
    if (g('twmgr-nb-int')) c.interval = Math.max(1, parseInt(g('twmgr-nb-int').value, 10) || 15) * 60;
    save();
  }
  function setNobleStatus(on) { setBtnState('twmgr-nb-start', 'twmgr-nb-stop', on, '● Planejando', '▶ Planejar'); }
  function nobleStart() {
    readNobleCfg();
    if (!(config.noble.alvos || []).length) { pushLog('Noblar: adicione pelo menos um alvo.', 'err', 'noble'); return; }
    config.noble.running = true; config.noble.nextAt = 0; save();
    setNobleStatus(true);
    pushLog('Noblar iniciado — ' + config.noble.alvos.length + ' alvo(s). O disparo continua manual.', 'ok', 'noble');
    nobleTick();
  }
  function nobleStop() {
    readNobleCfg(); config.noble.running = false; save();
    clearTimeout(nobleTimer); setNobleStatus(false);
    pushLog('Noblar parado.', '', 'noble');
  }
