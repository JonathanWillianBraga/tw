  // ==================== RECRUTAR ====================
  async function getGroups() {
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&page=-1', { credentials: 'include' });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const seen = {}, groups = [];
    doc.querySelectorAll('a[href*="group_id="], [data-group-id]').forEach((el) => {
      let id = el.getAttribute('data-group-id');
      if (!id) { const m = (el.getAttribute('href') || '').match(/group_id=(\d+)/); id = m ? m[1] : null; }
      if (!id || id === '0' || seen[id]) return;
      seen[id] = 1; groups.push({ id: String(id), name: (el.textContent || '').trim() || ('grupo ' + id) });
    });
    return groups;
  }
  async function getVillagesInGroup(gid) {
    // Cache-bust (&_=timestamp) + Cache-Control: no-cache — o TW cacheia overview_villages por sessão às vezes.
    // Sem isso, mexer no grupo (add/remove aldeia) pode não refletir aqui até fechar/abrir a aba.
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=' + gid + '&page=-1&_=' + Date.now(), { credentials: 'include', cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const seen = {}, vils = [];
    doc.querySelectorAll('span.quickedit-vn[data-id], span.quickedit[data-id], .quickedit-out[data-id]').forEach((el) => {
      const vid = el.getAttribute('data-id'); if (!vid || seen[vid]) return;
      const cont = el.closest('td, tr, span.quickedit') || el;
      const lbl = cont.querySelector('.quickedit-label');
      const cm = lbl ? (lbl.textContent || '').match(/(\d{1,3})\|(\d{1,3})/) : null;
      seen[vid] = 1; vils.push({ vid: String(vid), coord: cm ? (cm[1] + '|' + cm[2]) : null });
    });
    return vils;
  }
  // Memoria curta de getAllVillages, COMPARTILHADA. Ela e chamada por varios modulos e
  // leva quebra-cache no fim da URL (_=timestamp), entao NUNCA reaproveitava nada — nem o
  // cache do navegador. Ficou como a ultima fonte de 429 no console do usuario.
  // A lista de aldeias de uma conta muda em escala de dias; 5 min e conservador.
  const VILAS_TTL_MS = 5 * 60000;
  let _vilasCache = null, _vilasAt = 0, _vilasVoo = null;

  async function getAllVillagesCached(forcar) {
    const agora = Date.now();
    if (!forcar && _vilasCache && (agora - _vilasAt) < VILAS_TTL_MS) return _vilasCache;
    if (_vilasVoo) return _vilasVoo;   // ja ha uma leitura em voo: espera ELA
    _vilasVoo = getAllVillages().then((r) => {
      if (!r.incompleto) { _vilasCache = r; _vilasAt = Date.now(); }   // nao guarda resultado degradado
      _vilasVoo = null; return r;
    }, (e) => { _vilasVoo = null; throw e; });
    return _vilasVoo;
  }

  async function getAllVillages() {
    // group=0 força "todas as aldeias": a tela overview_villages é stateful por grupo no servidor,
    // e sem isso o fetch volta só as aldeias do último grupo selecionado (contagem oscilava 13→8→3).
    const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=combined&group=0&page=-1&_=' + Date.now(), { credentials: 'include', cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const seen = {}, vils = [];
    doc.querySelectorAll('span.quickedit-vn[data-id], span.quickedit[data-id], .quickedit-out[data-id]').forEach((el) => {
      const vid = el.getAttribute('data-id'); if (!vid || seen[vid]) return;
      const cont = el.closest('td, tr, span.quickedit') || el;
      const lbl = cont.querySelector('.quickedit-label');
      const name = lbl ? (lbl.textContent || '').replace(/\s+/g, ' ').trim() : vid;
      const cm2 = name.match(/(\d{1,3})\|(\d{1,3})/);
      seen[vid] = 1; vils.push({ vid: String(vid), name: name, coord: cm2 ? (cm2[1] + '|' + cm2[2]) : null });
    });
    if (!vils.length) {
      // Rede de segurança pra não quebrar quem chama — mas SILENCIOSA ela é pior que o erro.
      // getAllVillages alimenta quase todo módulo; se o parse do overview falhar, todos passam a
      // operar numa aldeia só e o painel segue mostrando números plausíveis. Ninguém desconfia:
      // parece que o módulo "achou pouca coisa", não que ele ficou cego pras outras 42 aldeias.
      vils.push({ vid: CUR_VID, name: CUR_NAME });
      vils.incompleto = true;
      pushLog('⚠️ Não consegui ler a lista de aldeias (overview_villages) — vou trabalhar SÓ com a aldeia atual. Se algum módulo parecer que ignorou suas outras aldeias, é isto. Recarregue a página.', 'err');
    }
    return vils;
  }
