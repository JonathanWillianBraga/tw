  // ==================== ETIQUETA (auto-rotular ataques recebidos) ====================
  // Modulo do johan. O TW ja tem o recurso: na tela de ataques recebidos, selecionar os
  // comandos e clicar "Etiqueta" faz o SERVIDOR adivinhar a unidade mais lenta pelo tempo
  // de viagem restante, assumindo que o comando acabou de sair. Quanto mais cedo depois do
  // envio, mais precisa a adivinhacao — dai o ciclo curto (padrao 2 min).
  //
  // Duas mudancas minhas sobre a versao dele, e as duas por medicao do formulario real
  // (capturado na tela, nao deduzido):
  //   subtype=attacks em vez de all — 'all' traz apoio junto, e etiquetar apoio recebido
  //   nao faz sentido. E o campo id_<id>=on que ele mandava nao existe no formulario.
  const ETIQUETA_MAX_IDS = 400;   // teto de seguranca pro corpo do POST

  // Le a lista e devolve, por id de comando, o ROTULO — o texto de .quickedit-label, que e
  // exatamente o que a etiqueta muda ("Ataque" vira "Explorador", "Nobre", "Ariete"...).
  //
  // A versao anterior comparava o texto da LINHA INTEIRA, e a linha tem a coluna "Chega
  // em" com uma contagem regressiva que muda a cada segundo. Antes !== depois era SEMPRE
  // verdadeiro, entao a validacao "por efeito" que eu escrevi pra nao me deixar errar
  // aprovava qualquer coisa — inclusive um POST que nao etiquetou nada.
  function etiquetaLerLista(doc) {
    const out = {};
    const table = doc.getElementById('incomings_table');
    if (!table) return null;
    table.querySelectorAll('input[type="hidden"][name^="command_ids["]').forEach((inp) => {
      const m = (inp.getAttribute('name') || '').match(/command_ids\[(\d+)\]/);
      if (!m) return;
      const td = inp.closest('td');
      const lbl = td ? td.querySelector('.quickedit-label') : null;
      out[m[1]] = lbl ? (lbl.textContent || '').replace(/\s+/g, ' ').trim() : '';
    });
    return out;
  }

  async function etiquetaCheckAndLabel() {
    const vid = CUR_VID;
    const base = '/game.php?village=' + vid + '&screen=overview_villages&mode=incomings&type=unignored&subtype=attacks';
    const res = await fetch(base + '&page=-1', { credentials: 'include', cache: 'no-store' });
    if (res.status === 429) throw new Error('429');
    if (!res.ok) throw new Error('lista de recebidos: HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const antes = etiquetaLerLista(doc);
    if (!antes) return { total: 0, novos: 0 };
    const ids = Object.keys(antes);
    config.etiqueta.lastCount = ids.length;
    // SO OS QUE AINDA NAO FORAM. A versao original reenviava a lista inteira a cada ciclo:
    // com 50 ataques a caminho, eram 30 POSTs grandes por hora sem efeito nenhum, e
    // justamente quando voce esta sob ataque — a pior hora pra gastar requisicao.
    const ja = config.etiqueta.jaEnviados || (config.etiqueta.jaEnviados = {});
    const novos = ids.filter((id) => !ja[id]).slice(0, ETIQUETA_MAX_IDS);
    // Faxina: comando que saiu da lista (chegou ou foi cancelado) nao precisa ser lembrado.
    const vivos = {}; ids.forEach((id) => { vivos[id] = 1; });
    Object.keys(ja).forEach((id) => { if (!vivos[id]) delete ja[id]; });
    if (!novos.length) { save(); return { total: ids.length, novos: 0 }; }
    // DOIS CAMPOS POR COMANDO, com papeis diferentes — confirmado varrendo o formulario
    // real sem filtro de nome:
    //     <input name="command_ids[421095069]" type="hidden"   value="true">
    //     <input name="id_421095069"           type="checkbox" value="on">
    // O oculto DECLARA que o comando esta na lista; a caixinha e o que o marca como
    // SELECIONADO. Eu tinha removido a caixinha achando que ela nao existia — minha
    // consulta so procurava por command_ids — e o servidor passou a receber "estes
    // comandos existem" com nenhum escolhido. Aceitava sem reclamar e nao etiquetava nada.
    const body = new URLSearchParams();
    body.set('h', CSRF);
    novos.forEach((id) => {
      body.append('command_ids[' + id + ']', 'true');
      body.append('id_' + id, 'on');
    });
    body.set('label', 'Etiqueta');
    const r2 = await fetch(base.replace('&type=', '&action=process&type='), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString(),
    });
    // CONFERE A RESPOSTA. Na versao original o resultado era descartado: se o formulario
    // do jogo mudasse, ele rodaria pra sempre sem etiquetar e o log diria que deu certo.
    if (r2.status === 429) throw new Error('429');
    if (!r2.ok) throw new Error('etiquetar: HTTP ' + r2.status);
    const t2 = await r2.text();
    const d2 = new DOMParser().parseFromString(t2, 'text/html');
    const eb = d2.querySelector('.error_box');
    if (eb) throw new Error('o jogo recusou: ' + (eb.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80));

    // VALIDACAO POR EFEITO, nao por aparencia.
    //
    // A versao anterior conferia se a resposta ainda tinha a tabela de recebidos. Isso
    // passa mesmo quando o servidor recebe o POST e NAO FAZ NADA — foi exatamente o que
    // aconteceu: o log dizia "1 comando etiquetado" e nada tinha sido etiquetado.
    // Agora compara o TEXTO das linhas antes e depois. Etiqueta aplicada muda o nome do
    // comando; se nenhum dos que eu mandei mudou, eu nao etiquetei — e digo isso.
    const depois = etiquetaLerLista(d2) || {};
    const mudaram = novos.filter((id) => depois[id] !== undefined && depois[id] !== antes[id]);
    const sumiram = novos.filter((id) => depois[id] === undefined);
    if (!mudaram.length && !sumiram.length) {
      throw new Error('o servidor aceitou mas nada mudou — nenhum dos ' + novos.length +
                      ' comando(s) foi etiquetado. O formulario do jogo pode ter mudado.');
    }
    novos.forEach((id) => { ja[id] = 1; });
    save();
    return { total: ids.length, novos: mudaram.length + sumiram.length };
  }

  async function etiquetaTick() {
    clearTimeout(etiquetaTimer);
    if (!config.etiqueta.running) return;
    if (lockOther() || captchaBlocked()) { etiquetaTimer = setTimeout(etiquetaTick, 15000); return; }
    claimLock();
    const cfg = config.etiqueta;
    // 429 = o servidor pediu pra desacelerar. Insistir no mesmo intervalo e o pior que se
    // pode fazer: piora o limite e nao etiqueta nada. Espera o recuo passar.
    if (cfg.recuoAte && Date.now() < cfg.recuoAte) {
      etiquetaTimer = setTimeout(etiquetaTick, Math.min(cfg.recuoAte - Date.now() + 500, 60000));
      return;
    }
    let espera = Math.max(2, cfg.intervalMin || 2) * 60000;
    try {
      const r = await etiquetaCheckAndLabel();
      if (cfg.recuoMs) { cfg.recuoMs = 0; cfg.recuoAte = 0; save(); }   // voltou a passar
      refreshCards('etiqueta');
      if (r.novos) pushLog('🏷️ Etiqueta: ' + r.novos + ' comando(s) novo(s) etiquetado(s) (' + r.total + ' na lista).', 'ok', 'etiqueta');
    } catch (e) {
      if (String(e.message || e) === '429') {
        // Dobra o recuo a cada recusa, ate 30 min. Volta ao normal no primeiro sucesso.
        cfg.recuoMs = Math.min(Math.max(cfg.recuoMs * 2, 5 * 60000), 30 * 60000);
        cfg.recuoAte = Date.now() + cfg.recuoMs;
        espera = cfg.recuoMs;
        save();
        pushLog('🏷️ Etiqueta: o servidor pediu pra desacelerar (429). Recuando ' + Math.round(cfg.recuoMs / 60000) +
                ' min. Se isso repetir, o gargalo pode nao ser este modulo — Mapa e Saque tambem leem overview_villages com page=-1.', '', 'etiqueta');
      } else {
        pushLog('🏷️ Etiqueta: ' + (e.message || e), 'err', 'etiqueta');
      }
    }
    etiquetaTimer = setTimeout(etiquetaTick, espera);
  }

  function readEtiquetaCfg() {
    const el = document.getElementById('twmgr-et-interval');
    if (el) config.etiqueta.intervalMin = Math.max(2, parseInt(el.value, 10) || 3);
    save();
  }
  function setEtiquetaStatus(on) { setBtnState('twmgr-et-start', 'twmgr-et-stop', on, '● Ativo', '▶ Iniciar ciclo'); }
  function etiquetaStart() {
    readEtiquetaCfg();
    config.etiqueta.running = true; save();
    setEtiquetaStatus(true);
    pushLog('🏷️ Etiqueta: ciclo iniciado — check a cada ' + config.etiqueta.intervalMin + ' min.', 'ok', 'etiqueta');
    etiquetaTick();
  }
  function etiquetaStop() {
    readEtiquetaCfg();
    config.etiqueta.running = false; save();
    clearTimeout(etiquetaTimer);
    setEtiquetaStatus(false);
    pushLog('🏷️ Etiqueta: ciclo parado.', '', 'etiqueta');
  }

