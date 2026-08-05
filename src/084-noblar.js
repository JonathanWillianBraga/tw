  // ==================== NOBLAR (planeja e arma a conquista de alvos) ====================
  // Voce cola as coordenadas, define o limite de horas de viagem, e o modulo monta o PLANO: de quais
  // aldeias sairiam os nobres e em quanto tempo cada comando chega. Ele NAO dispara sozinho --
  // decisao do usuario: nobre e caro e o envio e irreversivel, entao o disparo passa pelo seu OK.
  //
  // A duracao vem do PROPRIO JOGO. Em vez de calcular distancia x velocidade da unidade x velocidade
  // do mundo (tres constantes pra errar), o plano prepara o comando de verdade (`try=confirm`) e le
  // o `data-duration` que o servidor devolve. Vale em qualquer mundo, com ou sem bonus de velocidade.
  //
  // REGRAS DE ENVIO (definidas pelo usuario, ago/2026):
  //   - envio PARCIAL vale: se so ha 2 nobres no alcance, manda 2. Esperar fechar os 4 deixava
  //     nobre parado enquanto o alvo seguia intacto.
  //   - NUNCA cunhar automaticamente. Cunhar gasta recurso sem volta num alvo que pode nem
  //     sair; quem cunha e o usuario, a mao, pelo Mercado. Aqui so se FORMA nobre -- o
  //     recurso ja virou moeda, formar so materializa o que ja foi pago.
  //   - pool GLOBAL: os alvos sao servidos na ordem da LISTA e cada um consome do pool. Com
  //     6 nobres e 2 alvos: 4 no primeiro, 2 no segundo. Com 4: os 4 no primeiro e o segundo
  //     espera. Sem isso o mesmo nobre era prometido pros dois e o 2o disparo falhava.
  //
  // O quanto se manda em cada alvo vem de um MODELO (config.noble.templates): quantos nobres,

  // que escolta, viagem maxima e se e so NT. Cada alvo aponta pro seu (`a.tpl`).
  //
  // A escolta viaja NO MESMO comando dos nobres, nao num ataque separado. Nobre anda na
  // velocidade da unidade mais lenta do comando; escolta em comando proprio chegaria antes e
  // morreria sozinha. Por isso a duracao do plano e medida COM a escolta dentro -- ariete e
  // catapulta sao mais lentos que o nobre e mudariam a hora de chegada.

  const NOBLE_POR_CONQUISTA = 4;   // padrao: 4 nobres derrubam 100 de lealdade no caso tipico

  function nobleTpl(id) {
    const t = (config.noble.templates || {})[id];
    if (t) return t;
    const ids = Object.keys(config.noble.templates || {});
    return ids.length ? config.noble.templates[ids[0]] : defNobleTpl('Padrão');
  }
  function nobleTplDe(alvo) { return nobleTpl(alvo && alvo.tpl); }
  function unitPt(u) { const r = UNITS.filter((p) => p[0] === u)[0]; return r ? r[1] : u; }
  function nobleEscoltaTxt(t) {
    const ks = Object.keys((t && t.escolta) || {});
    if (!ks.length) return 'sem escolta';
    return ks.map((u) => (t.escolta[u] + ' ' + (unitPt(u)))).join(', ');
  }

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
  async function nobleOrigensPerto(alvo, todas, cacheTropa, usados) {
    const perto = [];
    todas.forEach((v) => {
      const m = (v.coord || '').match(/(\d+)\|(\d+)/);
      if (!m) return;
      perto.push({ vid: v.vid, nome: v.name || v.coord, coord: v.coord,
                   d: fieldDist(+m[1], +m[2], alvo.x, alvo.y) });
    });
    perto.sort((a, b) => a.d - b.d);
    for (const o of perto) {
      // Cacheia o `avail` INTEIRO, nao so o snob: a escolta precisa saber o que a origem tem.
      if (cacheTropa[o.vid] === undefined) {
        try { cacheTropa[o.vid] = (await getVillageStateReserved(o.vid)).avail || {}; }
        catch (e) { cacheTropa[o.vid] = {}; }
        await sleep(200);
      }
      o.avail = cacheTropa[o.vid] || {};
      // Desconta o que alvos ANTERIORES desta rodada ja levaram desta aldeia.
      o.nobres = Math.max(0, (o.avail.snob || 0) - ((usados || {})[o.vid] || 0));
    }
    return perto;
  }

  // Monta o plano de UM alvo. Devolve { pronto, envios[], falta, motivo }.
  //   pronto  = da pra conquistar agora com o que existe dentro do limite de horas
  //   envios  = [{vid, nome, coord, qtd, durSec}]
  //   falta   = quantos nobres ainda faltam (do total que o MODELO do alvo pede)
  async function noblePlanejarAlvo(alvo, todas, cacheTropa, usados) {
    const tpl = nobleTplDe(alvo);
    const precisa = tpl.nobres || NOBLE_POR_CONQUISTA;
    const limite = Math.max(1, tpl.maxHoras || 6) * 3600;
    const origens = await nobleOrigensPerto(alvo, todas, cacheTropa, usados);
    const comNobre = origens.filter((o) => o.nobres > 0);
    if (!comNobre.length) {
      return { pronto: false, envios: [], falta: precisa, dentroDoLimite: origens, tpl: tpl, motivo: 'nenhum nobre disponível' };
    }

    // "So NT" exige os nobres todos saindo da MESMA aldeia; senao pode somar de varias, da mais
    // perto pra mais longe.
    const candidatos = tpl.soNT
      ? comNobre.filter((o) => o.nobres >= precisa).slice(0, 1)
      : comNobre;
    if (!candidatos.length) {
      return { pronto: false, envios: [], falta: precisa, dentroDoLimite: origens, tpl: tpl,
               motivo: 'nenhuma aldeia com ' + precisa + ' nobres (modo só NT)' };
    }

    const envios = [];
    let faltam = precisa;
    for (const o of candidatos) {
      if (faltam <= 0) break;
      const qtd = Math.min(o.nobres, faltam);
      // A escolta inteira vai no PRIMEIRO comando (a origem mais perto). Repetir a escolta em
      // cada comando multiplicaria a tropa enviada sem o usuario ter pedido isso.
      const unidades = { snob: qtd };
      const escoltaCurta = [];
      if (!envios.length) {
        Object.keys(tpl.escolta || {}).forEach((u) => {
          const querem = tpl.escolta[u] || 0, tem = (o.avail || {})[u] || 0;
          const vai = Math.min(querem, tem);
          if (vai > 0) unidades[u] = vai;
          if (vai < querem) escoltaCurta.push((unitPt(u)) + ' ' + vai + '/' + querem);
        });
      }
      // Prepara de verdade so pra LER a duracao, ja COM a escolta -- ariete/catapulta sao mais
      // lentos que o nobre e mudam a chegada. O comando nao e disparado aqui.
      let dur = null;
      try {
        const p = await fakePrepare(o.vid, alvo.x, alvo.y, unidades);
        dur = p.dur || null;
      } catch (e) {
        pushLog('Noblar: ' + o.nome + ' → ' + alvo.coord + ' não deu pra conferir a duração (' + (e.message || e) + ').', '', 'noble');
        continue;
      }
      await sleep(250);
      if (dur == null) { pushLog('Noblar: ' + o.nome + ' → ' + alvo.coord + ': o jogo não informou a duração — origem descartada.', '', 'noble'); continue; }
      if (dur > limite) continue;                     // fora do limite de horas: proxima origem
      if (escoltaCurta.length) {
        pushLog('Noblar: ' + o.nome + ' → ' + alvo.coord + ' — escolta incompleta (' + escoltaCurta.join(', ') + ').', '', 'noble');
      }
      envios.push({ vid: o.vid, nome: o.nome, coord: o.coord, qtd: qtd, unidades: unidades,
                    durSec: dur, d: o.d });
      faltam -= qtd;
    }
    // Parcial VALE: com 1 nobre no alcance, manda 1. O alvo so fica sem disparo quando nao ha
    // nenhum. `falta` continua sendo informacao pro usuario, nao mais uma trava.
    const levando = precisa - faltam;
    return {
      pronto: envios.length > 0,
      envios: envios, falta: Math.max(0, faltam), levando: levando, precisa: precisa,
      dentroDoLimite: origens, tpl: tpl,
      motivo: faltam > 0
        ? ('parcial: ' + levando + ' de ' + precisa + ' nobre(s)')
        : null,
    };
  }

  // Recrutamento: FORMA nobre nas aldeias mais proximas do alvo que ainda cabem no limite de horas.
  //
  // NAO cunha. Cunhar converte recurso em moeda sem volta, num alvo que pode nem sair -- decisao
  // do usuario: quem cunha e ele, a mao, pelo modo Cunhar do Mercado. Aqui so se materializa nobre
  // de moeda JA guardada, que e um passo sem custo de oportunidade.
  // "Formar unidade" da Academia. Confirmado no dump: e um LINK simples, nao um form --
  //   /game.php?village=<vid>&screen=snob&action=train&h=<csrf>
  // Mesmo padrao do enqueueBuild do Construcoes. Consome recurso e 100 de populacao.
  async function nobleFormar(vid) {
    const res = await fetch('/game.php?village=' + vid + '&screen=snob&action=train&h=' + CSRF,
      { credentials: 'include' });
    const t = await res.text();
    // O jogo devolve a propria tela; erro vem numa caixa. Sem isso, falha passaria por sucesso.
    const doc = new DOMParser().parseFromString(t, 'text/html');
    const err = doc.querySelector('.error_box, .error');
    if (err && (err.textContent || '').trim()) throw new Error((err.textContent || '').trim().slice(0, 90));
    return true;
  }

  // Tenta formar ate `faltam` nobres, da aldeia mais PERTO do alvo pra mais longe.
  // Aldeia que nao consegue agora (sem recurso, sem populacao, moeda insuficiente) nao interrompe:
  // segue pra proxima mais proxima -- foi o pedido explicito do usuario.
  async function nobleRecrutar(alvo, origensOrdenadas, faltam) {
    const feitas = [];
    let formados = 0;
    for (const o of origensOrdenadas) {
      if (formados >= faltam) break;
      let st;
      try { st = await getSnobState(o.vid); }
      catch (e) { continue; }                       // sem Academia: proxima aldeia
      if (!st.hasForm) continue;
      const m = st.moedas || {};
      if (!(m.podemFormar > 0)) {
        // Sem moeda guardada o bastante. NAO cunha -- so registra o quanto falta, pro usuario
        // decidir se vai cunhar a mao.
        if (m.faltam != null) feitas.push({ nome: o.nome, ok: false, motivo: 'faltam ' + m.faltam + ' moeda(s)' });
        await sleep(200); continue;
      }
      try {
        await nobleFormar(o.vid);
        formados++;
        feitas.push({ nome: o.nome, ok: true });
      } catch (e) {
        feitas.push({ nome: o.nome, ok: false, motivo: (e.message || e) });
      }
      await sleep(400);
    }
    if (feitas.length) {
      const resumo = feitas.map((f) => f.nome + ': ' + (f.ok ? 'NOBRE em produção' : f.motivo)).join(' \u00b7 ');
      pushLog('Noblar (recruta) → ' + alvo.coord + ' — ' + resumo, formados ? 'ok' : '', 'noble');
    }
    return formados;
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

    // Lealdade primeiro: o plano da tela mostra o último relatório, então ele tem que estar fresco.
    if (config.noble.lerRelatorios !== false) {
      try { await nobleVarrerRelatorios(alvos); }
      catch (e) { pushLog('Noblar (relatórios): ' + (e.message || e), '', 'noble'); }
    }

    const cacheTropa = {};
    // Pool global: quanto de cada aldeia os alvos ANTERIORES desta rodada ja levaram. E o que
    // impede o mesmo nobre de aparecer no plano de dois alvos.
    const usados = {};
    const plano = [];
    let prontos = 0, completos = 0;
    for (const alvo of alvos) {
      { const pare = devoParar('noble'); if (pare) { pushLog('Noblar: ciclo interrompido — ' + pare + '.', '', 'noble'); break; } }
      const r = await noblePlanejarAlvo(alvo, todas, cacheTropa, usados);
      r.envios.forEach((e) => { usados[e.vid] = (usados[e.vid] || 0) + e.qtd; });
      plano.push({ coord: alvo.coord, x: alvo.x, y: alvo.y, pronto: r.pronto,
                   envios: r.envios, falta: r.falta, levando: r.levando, precisa: r.precisa,
                   motivo: r.motivo });
      if (r.pronto) prontos++;
      if (r.falta <= 0) { completos++; continue; }
      // Faltou nobre: tenta FORMAR nas mais proximas (nunca cunhar). O nobre formado entra na
      // fila da Academia, entao ele so aparece no plano do proximo ciclo -- de proposito.
      if (config.noble.produzir !== false) {
        try { await nobleRecrutar(alvo, r.dentroDoLimite || [], r.falta); }
        catch (e) { pushLog('Noblar (recruta) em ' + alvo.coord + ': ' + (e.message || e), 'err', 'noble'); }
      }
    }

    config.noble.plano = plano;
    config.noble.planoAt = now;
    config.noble.stats = { alvos: alvos.length, prontos: prontos, completos: completos,
                           faltando: alvos.length - prontos };
    config.noble.nextAt = now + Math.max(60, config.noble.interval || 900) * 1000;
    save();
    renderNoblePlano();
    refreshCards('noble');
    pushLog('Noblar: plano refeito — ' + prontos + ' de ' + alvos.length + ' alvo(s) com nobre pra enviar ('
      + completos + ' completo(s)). Nada foi enviado.', 'ok', 'noble');
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
    const nomeUn = (u) => (unitPt(u));
    const detalha = (un) => Object.keys(un).filter((u) => u !== 'snob')
      .map((u) => un[u] + ' ' + nomeUn(u)).join(', ');
    const resumo = item.envios.map((e) => {
      const extra = detalha(e.unidades || { snob: e.qtd });
      return e.qtd + 'x nobre de ' + e.nome + (extra ? ' + ' + extra : '') + ' (' + fmtDur(e.durSec) + ')';
    }).join('\n');
    const totalNob = item.envios.reduce((a, e) => a + e.qtd, 0);
    if (!confirm('Enviar ' + totalNob + ' nobre(s) para ' + coord + '?\n\n' + resumo
      + '\n\nIsso NÃO tem volta.')) return;

    let ok = 0;
    for (const e of item.envios) {
      try {
        await sendAttack(e.vid, item.x, item.y, e.unidades || { snob: e.qtd });
        ok += e.qtd;
        pushLog('Noblar: ' + e.nome + ' → ' + coord + ' — ' + e.qtd + ' nobre(s) enviado(s), chega em ' + fmtDur(e.durSec) + '.', 'ok', 'noble');
      } catch (err) {
        pushLog('Noblar: ' + e.nome + ' → ' + coord + ' FALHOU: ' + (err.message || err), 'err', 'noble');
      }
      await sleep(400);
    }
    pushLog('Noblar: ' + coord + ' — ' + ok + ' de ' + totalNob + ' nobre(s) saíram.', ok >= totalNob ? 'ok' : 'err', 'noble');
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
    const tplAtivo = (document.getElementById('twmgr-nb-tpl-sel') || {}).value
      || Object.keys(config.noble.templates || {})[0];
    novos.forEach((a) => { if (!jaTem[a.coord]) { a.tpl = tplAtivo; config.noble.alvos.push(a); n++; } });
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
  function nobleLealdadeCel(coord) {
    const r = (config.noble.relatorios || {})[coord];
    if (!r || r.lealdade == null) return '<span style="color:#8a7340" title="lealdade só aparece em relatório de ataque com nobre">?</span>';
    const v = r.lealdade;
    const cor = v <= 0 ? '#3f8f52' : v <= 35 ? '#b5651d' : '#8a7340';
    return '<b style="color:' + cor + '" title="caiu de ' + r.de + ' para ' + v + '">'
      + (v <= 0 ? 'conquistada' : v) + '</b>';
  }
  function nobleQuandoTxt(ts) {
    if (!ts) return '<span style="color:#8a7340">—</span>';
    const h = Math.floor((Date.now() - ts) / 3600000);
    if (h < 1) return 'agora há pouco';
    if (h < 24) return h + 'h atrás';
    return Math.floor(h / 24) + 'd atrás';
  }
  function renderNoblePlano() {
    const box = document.getElementById('twmgr-nb-lista'); if (!box) return;
    const alvos = config.noble.alvos || [], plano = config.noble.plano || [];
    if (!alvos.length) {
      box.innerHTML = '<div style="color:#8a7340;text-align:center;padding:10px;font-size:10px">— nenhum alvo na lista —</div>';
      return;
    }
    const tpls = Object.keys(config.noble.templates || {});
    const porCoord = {}; plano.forEach((p) => { porCoord[p.coord] = p; });
    box.innerHTML = '<table class="twmgr-bld-tab"><thead><tr>' +
      '<th>Alvo</th><th>Modelo</th><th>Dono</th><th>Lealdade</th><th>Tropas</th>' +
      '<th>Nobres</th><th>Chegada</th><th>Último rel.</th><th>Estado</th><th></th></tr></thead><tbody>' +
      alvos.map((a, i) => {
        const p = porCoord[a.coord];
        const rel = (config.noble.relatorios || {})[a.coord] || {};
        const sel = '<select class="twmgr-nb-tpl twmgr-inp" data-coord="' + esc(a.coord) + '" style="font-size:10px;padding:1px 2px">'
          + tpls.map((id) => '<option value="' + esc(id) + '"' + (id === a.tpl ? ' selected' : '') + '>'
            + esc(config.noble.templates[id].name || id) + '</option>').join('') + '</select>';
        const dono = rel.dono ? esc(rel.dono) : '<span style="color:#8a7340">?</span>';
        const tropa = rel.tropa == null ? '<span style="color:#8a7340">?</span>' : String(rel.tropa);
        const nobres = p && p.envios.length
          ? p.envios.map((e) => e.qtd + '× ' + esc(e.nome)).join(', ') : '<span style="color:#8a7340">—</span>';
        const chegada = p && p.envios.length
          ? p.envios.map((e) => fmtDur(e.durSec)).join(' / ') : '—';
        // Três estados, não dois: completo (leva o que o modelo pede), parcial (leva menos, mas
        // ENVIA) e sem nobre. O parcial precisa saltar aos olhos — é envio de verdade, com nobre
        // sendo gasto, só que não conquista sozinho.
        const estado = !p ? '<span style="color:#8a7340">sem plano</span>'
          : (p.pronto && p.falta <= 0) ? '<b style="color:#3f8f52">completo</b>'
          : p.pronto ? '<b style="color:#b5651d" title="envia assim mesmo — não conquista sozinho">'
            + esc(p.motivo || 'parcial') + '</b>'
          : '<span style="color:#8a7340">' + esc(p.motivo || 'sem nobre') + '</span>';
        const acao = (p && p.pronto)
          ? '<a class="twmgr-nb-fire" data-coord="' + esc(a.coord) + '">Enviar</a> · <a class="twmgr-nb-rm" data-coord="' + esc(a.coord) + '">✕</a>'
          : '<a class="twmgr-nb-rm" data-coord="' + esc(a.coord) + '">✕</a>';
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">' +
          '<td><b>' + esc(a.coord) + '</b></td><td>' + sel + '</td><td>' + dono + '</td>' +
          '<td>' + nobleLealdadeCel(a.coord) + '</td><td>' + tropa + '</td>' +
          '<td>' + nobres + '</td><td>' + chegada + '</td>' +
          '<td>' + nobleQuandoTxt(rel.at) + '</td>' +
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
    box.addEventListener('change', (e) => {
      const el = e.target;
      if (!el.classList || !el.classList.contains('twmgr-nb-tpl')) return;
      const coord = el.getAttribute('data-coord');
      const a = (config.noble.alvos || []).find((x) => x.coord === coord);
      if (!a) return;
      a.tpl = el.value;
      // Modelo trocado invalida o plano daquele alvo: as regras mudaram, o plano velho mentiria.
      config.noble.plano = (config.noble.plano || []).filter((p) => p.coord !== coord);
      save(); renderNoblePlano();
    });
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
  // ===== Modelos de envio =====
  // Mesmo desenho dos modelos de Construções/Pesquisa: um select com CRUD, e o alvo aponta pro id.
  let _nbTplAtivo = '';
  function nobleTplIds() { return Object.keys(config.noble.templates || {}); }
  function nobleTplAtivo() {
    const ids = nobleTplIds();
    if (ids.indexOf(_nbTplAtivo) < 0) _nbTplAtivo = ids[0] || '';
    return config.noble.templates[_nbTplAtivo] || null;
  }
  function nobleFillTplSel() {
    const sel = document.getElementById('twmgr-nb-tpl-sel'); if (!sel) return;
    const ids = nobleTplIds();
    sel.innerHTML = ids.map((id) => '<option value="' + esc(id) + '">'
      + esc(config.noble.templates[id].name || id) + '</option>').join('');
    if (ids.indexOf(_nbTplAtivo) < 0) _nbTplAtivo = ids[0] || '';
    sel.value = _nbTplAtivo;
  }
  // Editor: grade de escolta + os campos do modelo. Nobre fica FORA da grade — quantos nobres vão
  // é campo próprio, e deixar ele na escolta abriria caminho pra contar nobre duas vezes.
  function nobleRenderTplEditor() {
    const t = nobleTplAtivo();
    const g = (id) => document.getElementById(id);
    if (g('twmgr-nb-nob')) g('twmgr-nb-nob').value = t ? t.nobres : 4;
    if (g('twmgr-nb-horas')) g('twmgr-nb-horas').value = t ? t.maxHoras : 6;
    if (g('twmgr-nb-nt')) g('twmgr-nb-nt').checked = !!(t && t.soNT);
    const box = g('twmgr-nb-esc'); if (!box) return;
    box.innerHTML = UNITS.filter((u) => u[0] !== 'snob' && u[0] !== 'knight').map((u) =>
      '<label class="twmgr-nb-escit"><span>' + esc(u[1]) + '</span>'
      + '<input class="twmgr-nb-escq twmgr-inp" data-unit="' + u[0] + '" type="number" min="0" step="1" value="'
      + (((t && t.escolta) || {})[u[0]] || 0) + '"></label>').join('');
  }
  function nobleLerTplEditor() {
    const t = nobleTplAtivo(); if (!t) return;
    const g = (id) => document.getElementById(id);
    if (g('twmgr-nb-nob')) t.nobres = Math.max(1, Math.min(8, parseInt(g('twmgr-nb-nob').value, 10) || 4));
    if (g('twmgr-nb-horas')) t.maxHoras = Math.max(1, parseInt(g('twmgr-nb-horas').value, 10) || 6);
    if (g('twmgr-nb-nt')) t.soNT = g('twmgr-nb-nt').checked;
    const esc2 = {};
    document.querySelectorAll('.twmgr-nb-escq').forEach((i) => {
      const q = Math.max(0, parseInt(i.value, 10) || 0);
      if (q > 0) esc2[i.getAttribute('data-unit')] = q;
    });
    t.escolta = esc2;
  }
  function nobleSwitchTpl(id) {
    if (!config.noble.templates[id]) return;
    _nbTplAtivo = id;
    nobleRenderTplEditor();
  }
  function nobleNovoModelo() {
    const nome = prompt('Nome do modelo de envio:', 'Nobre + nuke');
    if (!nome || !nome.trim()) return;
    const at = nobleTplAtivo();
    const copiar = at && confirm('Copiar as regras de "' + at.name + '"?\n\nOK = copiar   -   Cancelar = do zero');
    const id = 't' + Date.now().toString(36);
    config.noble.templates[id] = copiar
      ? { name: nome.trim().slice(0, 40), nobres: at.nobres, maxHoras: at.maxHoras, soNT: at.soNT,
          escolta: JSON.parse(JSON.stringify(at.escolta || {})) }
      : defNobleTpl(nome.trim().slice(0, 40));
    _nbTplAtivo = id;
    save(); nobleFillTplSel(); nobleRenderTplEditor(); renderNoblePlano();
  }
  function nobleRenomearModelo() {
    const t = nobleTplAtivo(); if (!t) return;
    const nome = prompt('Novo nome:', t.name);
    if (!nome || !nome.trim()) return;
    t.name = nome.trim().slice(0, 40);
    save(); nobleFillTplSel(); renderNoblePlano();
  }
  function nobleApagarModelo() {
    const t = nobleTplAtivo(); if (!t) return;
    if (nobleTplIds().length < 2) { alert('Precisa sobrar pelo menos um modelo.'); return; }
    const usando = (config.noble.alvos || []).filter((a) => a.tpl === _nbTplAtivo);
    if (!confirm('Apagar o modelo "' + t.name + '"?'
      + (usando.length ? '\n\n' + usando.length + ' alvo(s) usam ele e vão cair no primeiro modelo da lista.' : ''))) return;
    delete config.noble.templates[_nbTplAtivo];
    _nbTplAtivo = nobleTplIds()[0];
    usando.forEach((a) => { a.tpl = _nbTplAtivo; });
    config.noble.plano = [];   // as regras mudaram pra esses alvos; plano velho mentiria
    save(); nobleFillTplSel(); nobleRenderTplEditor(); renderNoblePlano();
  }

  function readNobleCfg() {
    const c = config.noble, g = (id) => document.getElementById(id);
    nobleLerTplEditor();
    if (g('twmgr-nb-int')) c.interval = Math.max(1, parseInt(g('twmgr-nb-int').value, 10) || 15) * 60;
    if (g('twmgr-nb-prod')) c.produzir = g('twmgr-nb-prod').checked;
    if (g('twmgr-nb-rel')) c.lerRelatorios = g('twmgr-nb-rel').checked;
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
