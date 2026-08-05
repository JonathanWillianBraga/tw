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
  // O quanto se manda em cada alvo vem de um MODELO (config.noble.templates): quantos comandos,
  // que escolta, viagem maxima e se e so NT. Cada alvo aponta pro seu (`a.tpl`).
  //
  // UM NOBRE POR COMANDO. A lealdade cai uma vez por ATAQUE, nao por nobre: mandar 4 nobres
  // num comando so queima 3 a toa. E por isso que "NT" existe como conceito no jogo -- sao 4
  // comandos SEGUIDOS, nao um comando com 4. Entao `nobres por alvo` = quantos COMANDOS sair,
  // e cada um leva snob:1 + a escolta do modelo.
  //
  // A escolta viaja NO MESMO comando do nobre, nao num ataque separado: em comando proprio ela
  // chegaria antes e morreria sozinha. Como cada comando tem a sua, uma aldeia que manda 3
  // nobres precisa de 3x a escolta.
  //
  // A escolta e so tropa de campo (sem explorador, ariete e catapulta) -- pedido do usuario.
  // Efeito colateral bom: o nobre (35) e a unidade mais LENTA do jogo, entao a escolta nunca
  // muda a hora de chegada. A duracao segue vindo do proprio jogo mesmo assim.

  const NOBLE_POR_CONQUISTA = 4;   // padrao: 4 comandos derrubam 100 de lealdade no caso tipico
  // Quem pode ir de escolta. Explorador nao briga; ariete e catapulta servem pra muralha e
  // predio, nao pra proteger nobre. Fica so tropa de campo.
  const NOBLE_ESCOLTA = ['spear', 'sword', 'axe', 'light', 'heavy'];


  function nobleTpl(id) {
    const t = (config.noble.templates || {})[id];
    if (t) return t;
    const ids = Object.keys(config.noble.templates || {});
    return ids.length ? config.noble.templates[ids[0]] : defNobleTpl('Padrão');
  }
  function nobleTplDe(alvo) { return nobleTpl(alvo && alvo.tpl); }
  // Os modelos que este alvo pode usar, JA na ordem de tentativa. Alvo fixado num modelo
  // tenta so aquele; alvo em modo prioridade (tpl vazio) tenta todos, na ordem do usuario.
  function nobleTplsDe(alvo) {
    if (alvo && alvo.tpl && (config.noble.templates || {})[alvo.tpl]) {
      return [{ id: alvo.tpl, t: config.noble.templates[alvo.tpl] }];
    }
    const ids = (config.noble.ordem || []).filter((id) => (config.noble.templates || {})[id]);
    if (ids.length) return ids.map((id) => ({ id: id, t: config.noble.templates[id] }));
    const k = Object.keys(config.noble.templates || {});
    return k.length ? [{ id: k[0], t: config.noble.templates[k[0]] }] : [];
  }
  // Quantos comandos COMPLETOS (1 nobre + escolta inteira) esta aldeia consegue armar.
  // Sem requisicao nenhuma: o `avail` ja veio no cache das origens.
  function nobleCmdsDaAldeia(tpl, o) {
    let cap = o.nobres;
    Object.keys(tpl.escolta || {}).forEach((u) => {
      cap = Math.min(cap, Math.floor(((o.avail || {})[u] || 0) / tpl.escolta[u]));
    });
    return Math.max(0, cap);
  }
  // Quantos comandos completos o modelo renderia no alvo inteiro. E o criterio da ordem de
  // prioridade: vale mais o modelo que arma 4 comandos do que o que arma 1. Antes bastava
  // caber UMA escolta, o que fazia o 1o modelo ganhar mesmo rendendo um nobre so.
  function nobleCapacidade(tpl, origens, precisa) {
    const comNobre = origens.filter((o) => o.nobres > 0);
    const cands = tpl.soNT ? comNobre.filter((o) => nobleCmdsDaAldeia(tpl, o) >= precisa).slice(0, 1) : comNobre;
    let n = 0;
    for (const o of cands) { n += nobleCmdsDaAldeia(tpl, o); if (n >= precisa) return precisa; }
    return n;
  }

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

  // Escolhe o modelo e monta o plano de UM alvo.
  //
  // Ordem de prioridade: fica com o modelo que armar MAIS COMANDOS COMPLETOS, e em caso de empate
  // com o que vem antes na ordem do usuario. O criterio nao e "cabe uma escolta" -- com 1 nobre por
  // comando, um modelo que rende 4 comandos vale mais que um que rende 1, mesmo o segundo estando
  // antes na lista.
  //
  // A conta e de graca (usa o `avail` que ja esta em cache nas origens), entao so o modelo
  // ESCOLHIDO paga fakePrepare. Se nenhum modelo fecha um comando completo, o melhor deles ainda
  // manda com a escolta que houver -- "envio parcial vale" continua de pe.
  async function noblePlanejarAlvo(alvo, todas, cacheTropa, usados) {
    const opcoes = nobleTplsDe(alvo);
    if (!opcoes.length) return { pronto: false, envios: [], falta: 0, dentroDoLimite: [], motivo: 'nenhum modelo' };
    const origens = await nobleOrigensPerto(alvo, todas, cacheTropa, usados);
    // Melhor = mais comandos completos. Empate fica com quem vem antes na ordem do usuario.
    let melhor = null, melhorCap = -1;
    for (const op of opcoes) {
      const cap = nobleCapacidade(op.t, origens, op.t.nobres || NOBLE_POR_CONQUISTA);
      if (cap > melhorCap) { melhorCap = cap; melhor = op; }
      if (cap >= (op.t.nobres || NOBLE_POR_CONQUISTA)) { melhor = op; break; }   // completo: para aqui
    }
    const r = await noblePlanejarComTpl(alvo, melhor || opcoes[0], origens);
    if (opcoes.length > 1 && melhorCap <= 0 && r.envios.length) {
      r.motivo = (r.motivo ? r.motivo + ' · ' : '') + 'nenhum modelo com escolta completa';
    }
    return r;
  }

  // Plano com UM modelo ja escolhido. Devolve { pronto, envios[], falta, motivo }.
  //   pronto  = ha ao menos 1 nobre pra mandar (parcial vale)
  //   envios  = [{vid, nome, coord, qtd, unidades, durSec}]
  //   falta   = quantos nobres ainda faltam do que o modelo pede
  async function noblePlanejarComTpl(alvo, op, origens) {
    const tpl = op.t;
    const precisa = tpl.nobres || NOBLE_POR_CONQUISTA;
    const limite = Math.max(1, tpl.maxHoras || 6) * 3600;
    const comNobre = origens.filter((o) => o.nobres > 0);
    if (!comNobre.length) {
      return { pronto: false, envios: [], falta: precisa, dentroDoLimite: origens, tpl: tpl, tplId: op.id, tplNome: tpl.name, motivo: 'nenhum nobre disponível' };
    }

    // "So NT" exige os nobres todos saindo da MESMA aldeia; senao pode somar de varias, da mais
    // perto pra mais longe.
    const candidatos = tpl.soNT
      ? comNobre.filter((o) => o.nobres >= precisa).slice(0, 1)
      : comNobre;
    if (!candidatos.length) {
      return { pronto: false, envios: [], falta: precisa, dentroDoLimite: origens, tpl: tpl, tplId: op.id, tplNome: tpl.name,
               motivo: 'nenhuma aldeia com ' + precisa + ' nobres (modo só NT)' };
    }

    const envios = [];
    let faltam = precisa;
    for (const o of candidatos) {
      if (faltam <= 0) break;

      // Quantos COMANDOS esta aldeia arma. Se nem um sai com escolta completa, ainda mandamos o
      // nobre com o que houver -- a regra "envio parcial vale" vale pra escolta tambem.
      const capCheia = nobleCmdsDaAldeia(tpl, o);
      const cmds = Math.min(o.nobres, faltam, capCheia > 0 ? capCheia : o.nobres);
      if (cmds <= 0) continue;

      const unidades = { snob: 1 };
      const curta = [];
      Object.keys(tpl.escolta || {}).forEach((u) => {
        const querem = tpl.escolta[u] || 0;
        // Com escolta completa cada comando leva a cota cheia; sem ela, divide o que existe
        // entre os comandos, pro primeiro nao levar tudo e os outros irem pelados.
        const vai = capCheia > 0 ? querem : Math.floor(((o.avail || {})[u] || 0) / cmds);
        if (vai > 0) unidades[u] = vai;
        if (vai < querem) curta.push(unitPt(u) + ' ' + vai + '/' + querem);
      });

      // Duracao medida UMA vez por (aldeia, escolta): os comandos sao identicos, entao repetir o
      // fakePrepare seria requisicao jogada fora.
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
      if (curta.length) {
        pushLog('Noblar: ' + o.nome + ' → ' + alvo.coord + ' — escolta incompleta (' + curta.join(', ') + ').', '', 'noble');
      }
      // UM ENVIO = UM COMANDO. E o que garante 1 nobre por ataque.
      for (let k = 0; k < cmds; k++) {
        envios.push({ vid: o.vid, nome: o.nome, coord: o.coord, qtd: 1,
                      unidades: unidades, durSec: dur, d: o.d });
      }
      faltam -= cmds;
    }

    // Parcial VALE: com 1 nobre no alcance, manda 1. O alvo so fica sem disparo quando nao ha
    // nenhum. `falta` continua sendo informacao pro usuario, nao mais uma trava.
    const levando = precisa - faltam;
    return {
      pronto: envios.length > 0,
      envios: envios, falta: Math.max(0, faltam), levando: levando, precisa: precisa,
      dentroDoLimite: origens, tpl: tpl, tplId: op.id, tplNome: tpl.name,
      motivo: faltam > 0
        ? ('parcial: ' + levando + ' de ' + precisa + ' nobre(s)')
        : null,
    };
  }

  // ===== Lealdade =====
  // A lealdade SÃ“ existe em relatÃ³rio de ATAQUE COM NOBRE. Conferido em dois dumps do usuÃ¡rio:
  // relatÃ³rio de exploraÃ§Ã£o nÃ£o traz o campo em lugar nenhum (varredura do #content_value inteiro
  // voltou vazia); o de nobre traz, dentro do #attack_results, como "Lealdade: Descida X para Y".
  // Ou seja: isto Ã© ACOMPANHAMENTO do que jÃ¡ bateu, nÃ£o conferÃªncia prÃ©via. Antes do primeiro nobre
  // nÃ£o dÃ¡ pra saber a lealdade de um alvo, e a tela mostra â€” em vez de fingir 100.
  function nobleNorm(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
  }
  async function nobleLerRelatorio(reportId) {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=report&view=' + reportId, { credentials: 'include' });
    if (!res.ok) throw new Error('relatÃ³rio ' + reportId + ': HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const out = { reportId: reportId, lealdade: null, de: null, dono: null, tropa: null, coord: null };

    const rBox = doc.querySelector('#attack_results');
    if (rBox) {
      // "Lealdade: Descida 3 para -29". Regex sem acento porque o texto jÃ¡ passou pelo nobleNorm;
      // o [^0-9-]* atravessa a palavra do meio (Descida/Subida) sem depender de qual Ã©.
      const m = nobleNorm(rBox.textContent).match(/lealdade:[^0-9-]*(-?\d+) para (-?\d+)/);
      if (m) { out.de = parseInt(m[1], 10); out.lealdade = parseInt(m[2], 10); }
    }
    const dBox = doc.querySelector('#attack_info_def');
    if (dBox) {
      const txt = (dBox.textContent || '').replace(/\s+/g, ' ').trim();
      const md = txt.match(/Defensor:\s*(.+?)\s+Destino:/i);
      if (md) out.dono = md[1].trim().slice(0, 30);
      const mc = txt.match(/Destino:[^]*?(\d{2,3}\|\d{2,3})/);
      if (mc) out.coord = mc[1];
    }
    // Mesma leitura do getReportDefenseTotal, mas sem um segundo fetch: o doc jÃ¡ estÃ¡ na mÃ£o.
    const uBox = doc.querySelector('#attack_info_def_units');
    if (uBox) {
      let t = 0;
      uBox.querySelectorAll('td.unit-item, .unit-item').forEach((c) => { t += parseInt((c.textContent || '').replace(/\D/g, ''), 10) || 0; });
      out.tropa = t;
    }
    return out;
  }

  // Varre a primeira pÃ¡gina da lista de relatÃ³rios atrÃ¡s dos alvos da lista.
  //
  // Parser de propÃ³sito genÃ©rico: pega TODO a[href*="view="] em vez de amarrar num #id de tabela.
  // A linha do relatÃ³rio tem o assunto ("X (o|o) conquista Y (a|a)") â€” a ÃšLTIMA coordenada do texto
  // Ã© o DESTINO, que Ã© o que interessa; a primeira Ã© a origem. Se o assunto nÃ£o citar nenhum alvo
  // da lista, nem abre o relatÃ³rio.
  async function nobleVarrerRelatorios(alvos) {
    const querido = {}; alvos.forEach((a) => { querido[a.coord] = 1; });
    let doc;
    try {
      const res = await fetch('/game.php?village=' + CUR_VID + '&screen=report&mode=all', { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    } catch (e) {
      pushLog('Noblar: nÃ£o consegui abrir a lista de relatÃ³rios (' + (e.message || e) + ').', '', 'noble');
      return 0;
    }
    const fila = [], jaNaFila = {};
    doc.querySelectorAll('a[href*="view="]').forEach((a) => {
      const mi = (a.getAttribute('href') || '').match(/view=(\d+)/);
      if (!mi) return;
      const id = mi[1];
      if (config.noble.vistos[id] || jaNaFila[id]) return;
      const txt = (a.textContent || '').replace(/\s+/g, ' ');
      const coords = txt.match(/\d{2,3}\|\d{2,3}/g);
      if (!coords || !coords.length) return;
      const destino = coords[coords.length - 1];      // assunto Ã© "origem ... destino"
      if (!querido[destino]) return;
      const tr = a.closest ? a.closest('tr') : null;
      const tds = tr ? tr.querySelectorAll('td') : [];
      const quando = tds.length ? parseReportDate(tds[tds.length - 1].textContent) : null;
      jaNaFila[id] = 1;
      fila.push({ id: id, coord: destino, at: quando });
    });
    if (!fila.length) return 0;

    let lidos = 0;
    for (const r of fila.slice(0, 12)) {            // teto por ciclo: nÃ£o vira varredura infinita
      let info;
      try { info = await nobleLerRelatorio(r.id); }
      catch (e) { continue; }                        // relatÃ³rio ilegivel: tenta de novo no prÃ³ximo ciclo
      config.noble.vistos[r.id] = 1;
      lidos++;
      await sleep(300);
      const ant = config.noble.relatorios[r.coord];
      // SÃ³ sobrescreve com relatÃ³rio MAIS NOVO â€” a lista vem ordenada, mas nÃ£o custa garantir.
      if (ant && ant.at && r.at && ant.at > r.at) continue;
      config.noble.relatorios[r.coord] = {
        reportId: r.id, at: r.at || Date.now(),
        lealdade: info.lealdade, de: info.de, dono: info.dono, tropa: info.tropa,
      };
      if (info.lealdade != null) {
        pushLog('Noblar: ' + r.coord + ' â€” lealdade ' + info.de + ' â†’ ' + info.lealdade
          + (info.lealdade <= 0 ? ' (CONQUISTADA)' : '') + '.', 'ok', 'noble');
      }
    }
    // `vistos` guarda id de relatÃ³rio pra sempre; poda os mais antigos pra nÃ£o inchar o storage.
    const ids = Object.keys(config.noble.vistos);
    if (ids.length > 400) ids.sort().slice(0, ids.length - 400).forEach((k) => { delete config.noble.vistos[k]; });
    return lidos;
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
  //
  // CONTA A FILA DA ACADEMIA antes de formar. Nobre encomendado nao entra na tropa disponivel,
  // entao sem ler a fila ele e INVISIVEL: o modulo acha que nada vem, forma outro, e no ciclo
  // seguinte outro. O dump do usuario mostrou 5 nobres na fila de uma aldeia por causa disso.
  //
  // Devolve { formados, naFila, prontoEm }. `naFila + formados` responde "vem mais nobre?", que
  // e o que decide se um envio parcial espera ou sai.
  async function nobleRecrutar(alvo, origensOrdenadas, faltam) {
    const feitas = [];
    let formados = 0, naFila = 0, prontoEm = null;
    for (const o of origensOrdenadas) {
      // O que ja esta na fila conta como feito: nao precisa encomendar de novo.
      if (formados + naFila >= faltam) break;
      let st;
      try { st = await getSnobState(o.vid); }
      catch (e) { continue; }                       // sem Academia: proxima aldeia
      if (!st.hasForm) continue;
      const fl = st.fila || { nobres: 0 };
      if (fl.nobres > 0) {
        naFila += fl.nobres;
        if (fl.prontoEm && (prontoEm == null || fl.prontoEm < prontoEm)) prontoEm = fl.prontoEm;
        feitas.push({ nome: o.nome, ok: false, motivo: fl.nobres + ' já na fila'
          + (fl.prontoEm ? ' (1º às ' + new Date(fl.prontoEm).toLocaleTimeString('pt-BR') + ')' : '') });
        await sleep(200);
        continue;                                   // ja tem nobre vindo daqui; nao empilha mais
      }
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
    return { formados: formados, naFila: naFila, prontoEm: prontoEm };
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
    let enviadosNoCiclo = 0;
    let prontos = 0, completos = 0;
    for (const alvo of alvos) {
      { const pare = devoParar('noble'); if (pare) { pushLog('Noblar: ciclo interrompido — ' + pare + '.', '', 'noble'); break; } }
      const r = await noblePlanejarAlvo(alvo, todas, cacheTropa, usados);
      r.envios.forEach((e) => { usados[e.vid] = (usados[e.vid] || 0) + e.qtd; });
      plano.push({ coord: alvo.coord, x: alvo.x, y: alvo.y, pronto: r.pronto,
                   envios: r.envios, falta: r.falta, levando: r.levando, precisa: r.precisa,
                   tplId: r.tplId, tplNome: r.tplNome, motivo: r.motivo });
      const item = plano[plano.length - 1];
      if (r.pronto) prontos++;

      // `vindo` = nobre que ainda vai existir: o que formei agora MAIS o que ja estava na fila.
      // Os dois contam igual pra decisao do parcial -- o que importa e se vale esperar, nao quem
      // encomendou.
      let vindo = 0, prontoEm = null;
      if (r.falta <= 0) { completos++; }
      else if (config.noble.produzir !== false) {
        // Faltou nobre: tenta FORMAR nas mais proximas (nunca cunhar). O nobre formado entra na
        // fila da Academia, entao ele so aparece no plano do proximo ciclo -- de proposito.
        try {
          const rec = await nobleRecrutar(alvo, r.dentroDoLimite || [], r.falta);
          vindo = (rec.formados || 0) + (rec.naFila || 0);
          prontoEm = rec.prontoEm || null;
        }
        catch (e) { pushLog('Noblar (recruta) em ' + alvo.coord + ': ' + (e.message || e), 'err', 'noble'); }
      }

      // ---- decide o disparo automatico ----
      if (config.noble.autoEnviar !== false && r.pronto && !devoParar('noble')) {
        const qtd = r.envios.length;
        if (enviadosNoCiclo + qtd > (config.noble.autoMax || 8)) {
          item.motivo = (item.motivo ? item.motivo + ' · ' : '') + 'teto do ciclo';
          pushLog('Noblar (auto): ' + alvo.coord + ' segurado — teto de ' + (config.noble.autoMax || 8)
            + ' comando(s) por ciclo já batido.', '', 'noble');
        } else if (r.falta > 0 && vindo > 0) {
          // Parcial COM nobre a caminho: segura. Mandar agora gasta o unico que existe e a
          // lealdade (regen ~1/h) volta antes do proximo chegar. Foi a regra do usuario:
          // parcial e pra quando nao da pra recrutar mais.
          const quando = prontoEm ? ' 1º às ' + new Date(prontoEm).toLocaleTimeString('pt-BR') : '';
          item.motivo = (item.motivo ? item.motivo + ' · ' : '') + 'segurando: +' + vindo + ' em produção';
          item.prontoEm = prontoEm;
          pushLog('Noblar (auto): ' + alvo.coord + ' segurado — leva ' + r.levando + ' de ' + r.precisa
            + ' e tem ' + vindo + ' nobre(s) em produção.' + quando
            + ' Manda quando fechar (ou clique em Enviar).', '', 'noble');
        } else {
          const n = await nobleEnviarItem(item, ' (auto)');
          enviadosNoCiclo += n;
          if (r.falta > 0) {
            pushLog('Noblar (auto): ' + alvo.coord + ' foi PARCIAL (' + r.levando + ' de ' + r.precisa
              + ') porque não havia nobre pra recrutar.', '', 'noble');
          }
        }
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
      + completos + ' completo(s)). ' + (config.noble.autoEnviar === false ? 'Nada foi enviado (disparo manual).'
        : enviadosNoCiclo + ' comando(s) enviado(s).'), 'ok', 'noble');
    scheduleNoble();
  }
  function scheduleNoble() {
    clearTimeout(nobleTimer);
    if (!config.noble.running) return;
    nobleTimer = setTimeout(nobleTick, Math.min(Math.max((config.noble.nextAt || 0) - Date.now(), 1000), 60000));
  }

  // Resumo legivel de um plano, agrupado por aldeia. O disparo continua um comando por nobre;
  // o agrupamento e so pra nao imprimir oito linhas iguais.
  function nobleResumo(item) {
    const detalha = (un) => Object.keys(un || {}).filter((u) => u !== 'snob')
      .map((u) => un[u] + ' ' + unitPt(u)).join(', ');
    const g = [];
    item.envios.forEach((e) => {
      const j = g.find((x) => x.nome === e.nome && x.det === detalha(e.unidades));
      if (j) j.n++; else g.push({ nome: e.nome, det: detalha(e.unidades), dur: e.durSec, n: 1 });
    });
    return g.map((x) => x.n + ' comando(s) de ' + x.nome
      + ' — 1 nobre' + (x.det ? ' + ' + x.det : '') + ' cada (' + fmtDur(x.dur) + ')').join('\n');
  }

  // O envio de fato. Usado pelo clique E pelo automatico -- um caminho so, pra os dois nao
  // divergirem com o tempo.
  async function nobleEnviarItem(item, marca) {
    let ok = 0;
    const total = item.envios.reduce((a, e) => a + e.qtd, 0);
    for (const e of item.envios) {
      try {
        // Sempre snob:1 — um envio É um comando. O fallback também, pra não reabrir a porta.
        await sendAttack(e.vid, item.x, item.y, e.unidades || { snob: 1 });
        ok += e.qtd;
        pushLog('Noblar' + marca + ': ' + e.nome + ' → ' + item.coord + ' — 1 nobre enviado, chega em ' + fmtDur(e.durSec) + '.', 'ok', 'noble');
      } catch (err) {
        pushLog('Noblar' + marca + ': ' + e.nome + ' → ' + item.coord + ' FALHOU: ' + (err.message || err), 'err', 'noble');
      }
      await sleep(400);
    }
    pushLog('Noblar' + marca + ': ' + item.coord + ' — ' + ok + ' de ' + total + ' comando(s) saíram.',
      ok >= total ? 'ok' : 'err', 'noble');
    item.pronto = false; item.motivo = 'enviado';   // nao oferece disparar de novo sem replanejar
    return ok;
  }

  // Disparo manual: pelo clique, com confirmacao. Continua existindo mesmo com o automatico
  // ligado -- serve pra mandar um parcial que o automatico decidiu segurar.
  async function nobleDispararAlvo(coord) {
    const item = (config.noble.plano || []).find((p) => p.coord === coord);
    if (!item || !item.pronto) { alert('Esse alvo não está pronto no plano.'); return; }
    const total = item.envios.reduce((a, e) => a + e.qtd, 0);
    if (!confirm('Enviar ' + total + ' nobre(s) para ' + coord + '?\n\n' + nobleResumo(item)
      + '\n\nCada comando leva 1 nobre — a lealdade cai uma vez por ataque.'
      + '\n\nIsso NÃO tem volta.')) return;
    await nobleEnviarItem(item, '');
    save(); renderNoblePlano(); refreshCards('noble');
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
    // Nasce em modo PRIORIDADE (tpl vazio), nao fixado no modelo que esta aberto no painel: o
    // select ali em cima e o que voce esta EDITANDO, nao o que voce escolheu pro alvo.
    novos.forEach((a) => { if (!jaTem[a.coord]) { a.tpl = ''; config.noble.alvos.push(a); n++; } });
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
    const tpls = nobleOrdemIds();
    const porCoord = {}; plano.forEach((p) => { porCoord[p.coord] = p; });
    // 7 colunas, não 10. Numa largura de ~560px a versão de 10 colunas dava 48px por célula e o
    // conteúdo vazava do painel. Os pares que sempre são lidos juntos viraram uma célula de duas
    // linhas: coord + dono, e origem + hora de chegada.
    box.innerHTML = '<table class="twmgr-bld-tab twmgr-nb-tab"><thead><tr>' +
      '<th>Alvo</th><th>Modelo</th><th>Leald.</th><th>Def.</th>' +
      '<th>Envio</th><th>Estado</th><th></th></tr></thead><tbody>' +
      alvos.map((a, i) => {
        const p = porCoord[a.coord];
        const rel = (config.noble.relatorios || {})[a.coord] || {};
        // Em modo prioridade mostra QUAL modelo o plano acabou escolhendo -- sem isso o usuario
        // ve "seguir ordem" e nao tem como saber o que vai sair.
        const escolhido = (!a.tpl && p && p.tplNome)
          ? '<div class="sub" style="color:#a07a42">→ ' + esc(p.tplNome) + '</div>' : '';
        const sel = '<select class="twmgr-nb-tpl twmgr-inp" data-coord="' + esc(a.coord) + '">'
          + '<option value=""' + (!a.tpl ? ' selected' : '') + '>⇅ ordem</option>'
          + tpls.map((id) => '<option value="' + esc(id) + '"' + (id === a.tpl ? ' selected' : '') + '>'
            + esc(config.noble.templates[id].name || id) + '</option>').join('') + '</select>' + escolhido;
        const alvoCel = '<b>' + esc(a.coord) + '</b>'
          + '<div class="sub">' + (rel.dono ? esc(rel.dono) : '—') + '</div>';
        const tropa = rel.tropa == null ? '<span style="color:#8a7340">?</span>' : fmtN(rel.tropa);
        const defCel = tropa + '<div class="sub">' + nobleQuandoTxt(rel.at) + '</div>';
        const envio = p && p.envios.length
          ? p.envios.map((e) => e.qtd + '× ' + esc(e.nome)).join(', ')
            + '<div class="sub">chega em ' + p.envios.map((e) => fmtDur(e.durSec)).join(' / ') + '</div>'
          : '<span style="color:#8a7340">—</span>';
        // Três estados, não dois: completo (leva o que o modelo pede), parcial (leva menos, mas
        // ENVIA) e sem nobre. O parcial precisa saltar aos olhos — é envio de verdade, com nobre
        // sendo gasto, só que não conquista sozinho.
        const estado = !p ? '<span style="color:#8a7340">sem plano</span>'
          : (p.pronto && p.falta <= 0) ? '<b style="color:#3f8f52">completo</b>'
          : p.pronto ? '<b style="color:#b5651d" title="envia assim mesmo — não conquista sozinho">'
            + esc(p.motivo || 'parcial') + '</b>'
            + (p.prontoEm ? '<div class="sub">nobre pronto às ' + new Date(p.prontoEm).toLocaleTimeString('pt-BR') + '</div>' : '')
          : '<span style="color:#8a7340">' + esc(p.motivo || 'sem nobre') + '</span>';
        const acao = (p && p.pronto)
          ? '<a class="twmgr-nb-fire" data-coord="' + esc(a.coord) + '">Enviar</a><div class="sub"><a class="twmgr-nb-rm" data-coord="' + esc(a.coord) + '">remover</a></div>'
          : '<a class="twmgr-nb-rm" data-coord="' + esc(a.coord) + '">✕</a>';
        return '<tr class="' + (i % 2 ? 'row_b' : 'row_a') + '">' +
          '<td>' + alvoCel + '</td><td>' + sel + '</td>' +
          '<td>' + nobleLealdadeCel(a.coord) + '</td><td>' + defCel + '</td>' +
          '<td>' + envio + '</td><td>' + estado + '</td><td>' + acao + '</td></tr>';
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
      a.tpl = el.value;                  // '' = seguir a ordem de prioridade
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
  // Lista os modelos NA ORDEM de prioridade, numerados. O numero e o unico jeito de o usuario
  // ver que a ordem mudou depois de clicar nas setas -- o nome do modelo nao muda.
  function nobleOrdemIds() {
    const ord = (config.noble.ordem || []).filter((id) => (config.noble.templates || {})[id]);
    nobleTplIds().forEach((id) => { if (ord.indexOf(id) < 0) ord.push(id); });
    return ord;
  }
  // Resumo da escolta pro chip: "50 Bárb. · 4👑". E o que deixa a lista de modelos legivel sem
  // abrir cada um -- que era o problema do <select>, onde so cabia o nome.
  // O chip descreve UM comando (escolta + 1 nobre) e quantos comandos saem. Antes dizia
  // "4 nobres", o que dava a entender que iam todos juntos.
  function nobleChipTxt(t) {
    const ks = Object.keys((t && t.escolta) || {});
    const esc2 = ks.length ? ks.map((u) => t.escolta[u] + ' ' + unitPt(u)).join(' + ') : 'sem escolta';
    return esc2 + ' + 1👑 × ' + (t.nobres || 4);
  }
  function nobleFillTplSel() {
    const box = document.getElementById('twmgr-nb-chips'); if (!box) return;
    const ids = nobleOrdemIds();
    if (ids.indexOf(_nbTplAtivo) < 0) _nbTplAtivo = ids[0] || '';
    box.innerHTML = ids.map((id, i) => {
      const t = config.noble.templates[id];
      return '<span class="twmgr-chip' + (id === _nbTplAtivo ? ' on' : '') + '" data-id="' + esc(id) + '"'
        + ' title="' + esc(t.name || id) + ' — ' + esc(nobleChipTxt(t)) + '">'
        + '<b>' + (i + 1) + '</b>' + esc(nobleChipTxt(t)) + '</span>';
    }).join('') + '<span class="twmgr-chip twmgr-chip-add" title="criar modelo">✚</span>';
    const nm = document.getElementById('twmgr-nb-tpl-nome');
    if (nm) {
      const t = config.noble.templates[_nbTplAtivo];
      const pos = ids.indexOf(_nbTplAtivo) + 1;
      nm.textContent = t ? (pos + '. ' + (t.name || _nbTplAtivo)) : '—';
    }
  }
  // Sobe/desce o modelo ativo na ordem de prioridade.
  function nobleMoverModelo(passo) {
    const ord = nobleOrdemIds();
    const i = ord.indexOf(_nbTplAtivo);
    const j = i + passo;
    if (i < 0 || j < 0 || j >= ord.length) return;
    ord.splice(j, 0, ord.splice(i, 1)[0]);
    config.noble.ordem = ord;
    // A ordem mudou: o plano de quem segue a prioridade pode ter outro modelo agora.
    config.noble.plano = (config.noble.plano || []).filter((p) => {
      const a = (config.noble.alvos || []).find((x) => x.coord === p.coord);
      return a && a.tpl;                 // alvo fixado num modelo nao e afetado
    });
    save(); nobleFillTplSel(); renderNoblePlano();
  }
  // Editor: grade no formato do jogo (icone em cima, campo embaixo). Nobre aparece como coluna
  // TRAVADA -- mostra que ele vai junto, sem deixar edita-lo aqui e contar nobre duas vezes.
  function nobleRenderTplEditor() {
    const t = nobleTplAtivo();
    const g = (id) => document.getElementById(id);
    if (g('twmgr-nb-nob')) g('twmgr-nb-nob').value = t ? t.nobres : 4;
    if (g('twmgr-nb-horas')) g('twmgr-nb-horas').value = t ? t.maxHoras : 6;
    if (g('twmgr-nb-nt')) g('twmgr-nb-nt').checked = !!(t && t.soNT);
    const box = g('twmgr-nb-esc'); if (!box) return;
    box.innerHTML = unitsDoMundo().filter((u) => NOBLE_ESCOLTA.indexOf(u[0]) >= 0 || u[0] === 'snob').map((u) => {
      const nobre = (u[0] === 'snob');
      // Nobre trava em 1 e nao em `t.nobres`: cada COMANDO leva um so. O campo "Nobres por alvo"
      // diz quantos comandos sair, nao quantos nobres cabem num.
      const val = nobre ? 1 : (((t && t.escolta) || {})[u[0]] || '');
      return '<div' + (nobre ? ' class="lock"' : '') + '>'
        + '<div class="h" title="' + esc(u[1]) + '">'
        + '<span class="unit_sprite unit_sprite_smaller ' + u[0] + '"></span>'
        + '<em>' + esc(u[1]) + '</em></div>'
        + '<input class="twmgr-nb-escq twmgr-inp" data-unit="' + u[0] + '" type="number" min="0" step="1"'
        + (nobre ? ' disabled title="cada comando leva exatamente 1 nobre"' : '')
        + ' value="' + val + '"></div>';
    }).join('');
  }
  function nobleLerTplEditor() {
    const t = nobleTplAtivo(); if (!t) return;
    const g = (id) => document.getElementById(id);
    if (g('twmgr-nb-nob')) t.nobres = Math.max(1, Math.min(8, parseInt(g('twmgr-nb-nob').value, 10) || 4));
    if (g('twmgr-nb-horas')) t.maxHoras = Math.max(1, parseInt(g('twmgr-nb-horas').value, 10) || 6);
    if (g('twmgr-nb-nt')) t.soNT = g('twmgr-nb-nt').checked;
    const esc2 = {};
    document.querySelectorAll('.twmgr-nb-escq').forEach((i) => {
      const u = i.getAttribute('data-unit');
      if (u === 'snob') return;          // coluna travada: quem manda e o campo Nobres por alvo
      const q = Math.max(0, parseInt(i.value, 10) || 0);
      if (q > 0) esc2[u] = q;
    });
    t.escolta = esc2;
  }
  function nobleSwitchTpl(id) {
    if (!config.noble.templates[id]) return;
    // Salva o que estava na tela ANTES de trocar, senao a edicao do modelo anterior se perde
    // ao clicar no chip do lado.
    nobleLerTplEditor(); save();
    _nbTplAtivo = id;
    nobleFillTplSel(); nobleRenderTplEditor();
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
    config.noble.ordem = nobleOrdemIds();      // entra no fim da prioridade
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
    config.noble.ordem = (config.noble.ordem || []).filter((x) => x !== _nbTplAtivo);
    _nbTplAtivo = nobleOrdemIds()[0];
    usando.forEach((a) => { a.tpl = ''; });   // volta pra ordem de prioridade
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
