  // ==================== MAPA — filtros e badges na tela do jogo ====================
  // Enriquece screen=map com painel de controle (só bárbaros / só minhas / só tribo / filtro por
  // pontos), atenua aldeias fora do filtro (opacity, sem quebrar clique) e badge de pontos.

  let _mapVilCache = null;        // Map: vid -> { x, y, playerId, points }
  let _mapPlayerCache = null;     // Map: playerId -> { name, tribeId }
  const MY_PLAYER_ID = (window.game_data && window.game_data.player && String(window.game_data.player.id)) || '';
  const MY_TRIBE_ID = (window.game_data && window.game_data.player && String(window.game_data.player.ally)) || '0';

  // Falha do player.txt some da tela se ninguém contar: sem ele não dá pra distinguir tribo de
  // inimigo e mapCategoryOf devolve 'enemy' pra todo mundo — com o filtro de inimigo desligado, a
  // tribo inteira desaparece do mapa sem explicação. Fica registrado pra o painel avisar.
  let _mapPlayerFalhou = false;
  let _mapProxTentativa = 0;   // recuo apos 429 nos arquivos de mapa

  async function loadMapData(force) {
    // O guard antigo era `_mapVilCache && age < 6h`, e _mapVilCache é variável de módulo: sempre
    // null depois de um F5. Ou seja, o TTL de 6h persistido em dataCachedAt nunca teve efeito e
    // TODA visita ao mapa rebaixava village.txt + player.txt inteiros — com cache:'no-store', que
    // proíbe até revalidação. Guardar megabytes no localStorage não cabe (limite de ~5MB), então
    // quem faz o cache é o navegador: sem no-store ele revalida e responde 304 na maioria das vezes.
    if (!force && _mapVilCache) return;
    // Cada fetch independente — village.txt é essencial, player.txt é opcional (só distingue tribo/inimigo).
    // TW às vezes rate-limita player.txt (429) — não pode bloquear a feature.
    // RECUO APOS 429. village.txt e player.txt sao os maiores downloads do script — podem
    // ter megabytes. Sem recuo, TODA pagina aberta tentava de novo os dois e falhava de
    // novo, alimentando o proprio rate limit que causava a falha.
    if (!force && Date.now() < _mapProxTentativa) return;
    let bateu429 = false;
    const fetchTxt = async (url) => {
      try {
        const r = await fetch(url, { credentials: 'include', cache: force ? 'reload' : 'default' });
        if (r.status === 429) { bateu429 = true; return null; }
        if (!r.ok) return null;
        return await r.text();
      } catch (e) { return null; }
    };
    const [rV, rP] = await Promise.all([fetchTxt('/map/village.txt'), fetchTxt('/map/player.txt')]);
    if (rV) {
      const vils = new Map();
      rV.split('\n').forEach((line) => {
        if (!line.trim()) return;
        // Formato: id,name,x,y,player_id,points,rank
        const p = line.split(',');
        if (p.length < 6) return;
        vils.set(p[0], { x: +p[2], y: +p[3], playerId: p[4], points: parseInt(p[5], 10) || 0 });
      });
      _mapVilCache = vils;
      config.mapUi.dataCachedAt = Date.now();
      save();
    }
    if (rP) {
      const players = new Map();
      rP.split('\n').forEach((line) => {
        if (!line.trim()) return;
        // Formato: id,name,tribe_id,villages,points,rank
        const p = line.split(',');
        if (p.length < 4) return;
        players.set(p[0], { name: decodeURIComponent(p[1] || '').replace(/\+/g, ' '), tribeId: p[2] });
      });
      _mapPlayerCache = players;
    }
    // Avisar no console não serve: ninguém abre o console. Isto tem consequência VISÍVEL no mapa,
    // então vai pro log do módulo, que é onde o usuário olha.
    if (bateu429) {
      _mapProxTentativa = Date.now() + 30 * 60000;
      pushLog('🗺️ Mapa: o servidor recusou os arquivos de mapa (429, requisições demais). Tento de novo em 30 min — os filtros e a cobertura ficam sem dado até lá.', 'err', 'map');
      return;
    }
    if (!rV) {
      console.warn('[TWMgr Mapa] village.txt falhou');
      pushLog('🗺️ Mapa: não consegui baixar village.txt — os filtros não vão funcionar até recarregar a página.', 'err', 'map');
    }
    _mapPlayerFalhou = !rP;
    if (!rP) {
      console.warn('[TWMgr Mapa] player.txt falhou (rate limit?)');
      pushLog('🗺️ Mapa: player.txt não veio (o TW costuma limitar) — sem ele não dá pra separar tribo de inimigo, e TODA aldeia de jogador aparece como 🔴 Inimigo, inclusive a da sua tribo. Se o filtro de inimigo estiver desligado, sua tribo some do mapa. Use 🔄 recarregar pra tentar de novo.', 'err', 'map');
    }
  }

  // Sync manual do planner interno da tribo (screen=ally&mode=reservations).
  // Retorna { count, ok } — count = quantas reservas parseadas, ok = fetch teve sucesso.
  // Parse é defensivo: procura por (X|Y) em cada linha da tabela + timer HH:MM:SS ou data DD/MM/YYYY.
  async function loadReservations() {
    try {
      const url = '/game.php?village=' + CUR_VID + '&screen=ally&mode=reservations&page=-1&_=' + Date.now();
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const reservations = {};
      const now = Date.now();
      doc.querySelectorAll('table tr').forEach((tr) => {
        const text = (tr.textContent || '').replace(/\s+/g, ' ');
        const coordM = text.match(/(\d{1,3})\|(\d{1,3})/);
        if (!coordM) return;
        const coord = coordM[1] + '|' + coordM[2];
        let expiresAt = 0;
        // Timer relativo tipo "1d 3:45:12" ou "3:45:12"
        const dTimer = text.match(/(\d+)\s*d\s*(\d{1,2}):(\d{1,2}):(\d{2})/i);
        if (dTimer) {
          expiresAt = now + ((+dTimer[1] * 86400) + (+dTimer[2] * 3600) + (+dTimer[3] * 60) + (+dTimer[4])) * 1000;
        } else {
          const hTimer = text.match(/(\d{1,3}):(\d{1,2}):(\d{2})(?!\d)/);
          if (hTimer) expiresAt = now + ((+hTimer[1] * 3600) + (+hTimer[2] * 60) + (+hTimer[3])) * 1000;
        }
        // Data absoluta tipo "20/07/2026 15:30"
        if (!expiresAt) {
          const dateM = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[^\d]+(\d{1,2}):(\d{2})/);
          if (dateM) {
            const d = new Date(+dateM[3], +dateM[2] - 1, +dateM[1], +dateM[4], +dateM[5]);
            expiresAt = d.getTime();
          }
        }
        const playerLink = tr.querySelector('a[href*="screen=info_player"]');
        const playerName = playerLink ? (playerLink.textContent || '').trim().slice(0, 30) : '';
        reservations[coord] = { at: now, expiresAt: expiresAt, playerName: playerName };
      });
      config.mapUi.reservations = reservations;
      config.mapUi.reservationsAt = now;
      save();
      return { count: Object.keys(reservations).length, ok: true };
    } catch (e) {
      console.warn('[TWMgr Mapa] loadReservations falhou:', e && e.message);
      return { count: 0, ok: false, error: e && e.message };
    }
  }

  // Categoria da aldeia baseado no dono
  function mapCategoryOf(vil) {
    if (!vil) return 'unknown';
    if (vil.playerId === '0' || !vil.playerId) return 'barb';
    if (vil.playerId === MY_PLAYER_ID) return 'mine';
    const player = _mapPlayerCache && _mapPlayerCache.get(vil.playerId);
    if (player && player.tribeId && player.tribeId !== '0' && player.tribeId === MY_TRIBE_ID) return 'tribe';
    return 'enemy';
  }

  const MAP_CAT_LABELS = { mine: '🟢 Minha', tribe: '🔵 Tribo', enemy: '🔴 Inimigo', barb: '⚪ Bárbaro' };

  // ---- Overlay canvas sobre o mapa do TW (mundo br143 usa canvas puro) ----
  // Cria um <canvas> transparente por cima do mapa e desenha:
  // - Retângulo escuro sobre aldeias filtradas (efeito atenuar)
  // - Badge de pontos sobre aldeias visíveis
  // Usa TWMap.map.pixelByCoord(x,y) pra converter coord de aldeia em pixel na tela.
  let _mapOverlay = null;
  let _mapRedrawTimer = null;
  let _mapLoggedOnce = false;

  function mapEnsureOverlay() {
    try {
      if (_mapOverlay && document.body.contains(_mapOverlay)) return _mapOverlay;
      const T = window.TWMap;
      // Prefere #map (wrapper visível, ancora estável) — #map_container é o "mundo" gigante que translada.
      // Fallback pra TWMap.map.el se #map não existir por algum motivo.
      let parent = document.getElementById('map');
      if (!(parent instanceof Element)) parent = document.getElementById('map_container');
      if (!(parent instanceof Element)) parent = T && T.map && T.map.el instanceof Element ? T.map.el : null;
      if (!(parent instanceof Element)) { console.warn('[TWMgr Mapa] nenhum container Element encontrado pro overlay'); return null; }
      const c = document.createElement('canvas');
      c.id = 'twmgr-map-overlay';
      // Fica ancorado no canto do #map (posição visível do mapa). Sem left/top variável no redraw.
      c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:9998';
      try { if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; } catch (e) {}
      const size = (T && T.map && T.map.size) || [parent.clientWidth || 800, parent.clientHeight || 600];
      c.width = size[0]; c.height = size[1];
      c.style.width = size[0] + 'px'; c.style.height = size[1] + 'px';
      parent.appendChild(c);
      _mapOverlay = c;
      console.log('[TWMgr Mapa] overlay criado dentro de #' + parent.id + ' (' + parent.tagName + '), rect:', c.getBoundingClientRect());
      return c;
    } catch (e) { console.warn('[TWMgr Mapa] mapEnsureOverlay falhou:', e && e.message); return null; }
  }

  // Descobre tileSize (tamanho de cada aldeia em pixels). TW usa 53x47 tradicionalmente.
  function mapTileSize() {
    const T = window.TWMap;
    if (T && T.tileSize && T.tileSize.length >= 2) return T.tileSize;
    if (T && T.tileDimensions && T.tileDimensions.length >= 2) return T.tileDimensions;
    return [53, 47];   // default histórico
  }

  // Legenda da cobertura, com a contagem de cada estado e o percentual explorado.
  // O percentual é o que responde a pergunta direta: "quanto do meu raio eu já enxerguei?"
  function mapRenderLegendaCobertura() {
    const el = document.getElementById('twmgr-map-cob-leg'); if (!el) return;
    if (!config.mapUi.showCobertura) { el.innerHTML = ''; return; }
    const intel = (config.map && config.map.intel) || {};
    const chaves = Object.keys(intel);
    if (!chaves.length) {
      el.innerHTML = '<span style="color:#8a7d6d">Sem dados ainda — rode um ciclo do módulo Mapa (ou a Prévia) pra preencher.</span>';
      return;
    }
    const cont = {};
    chaves.forEach((k) => { cont[intel[k]] = (cont[intel[k]] || 0) + 1; });
    const conhecidas = (cont[MAP_INTEL.OK] || 0) + (cont[MAP_INTEL.BL_DEFESA] || 0);
    const pct = Math.round(conhecidas * 100 / chaves.length);
    el.innerHTML =
      '<div style="color:#a2643a;font-weight:700;margin-bottom:2px">' + pct + '% do seu raio explorado <span style="color:#8a7d6d;font-weight:400">(' + conhecidas + ' de ' + chaves.length + ')</span></div>' +
      [1, 2, 3, 4, 5, 6].filter((c) => cont[c]).map((c) =>
        '<div><span style="display:inline-block;width:9px;height:9px;border:2px solid ' + MAP_INTEL_COR[c] + ';margin-right:5px;vertical-align:middle"></span>' +
        '<span style="color:#6f6153">' + MAP_INTEL_NOME[c] + '</span> <b style="color:#8b5426">' + cont[c] + '</b></div>').join('');
  }

  function mapCanvasRedraw() {
    if (!_mapVilCache) return;
    const T = window.TWMap;
    if (!T || !T.map || typeof T.map.pixelByCoord !== 'function') return;
    const overlay = mapEnsureOverlay();
    if (!overlay) return;

    // Sincroniza tamanho se o mapa foi redimensionado
    const size = T.map.size || [overlay.width, overlay.height];
    if (overlay.width !== size[0] || overlay.height !== size[1]) {
      overlay.width = size[0]; overlay.height = size[1];
      overlay.style.width = size[0] + 'px'; overlay.style.height = size[1] + 'px';
    }
    // Overlay é filho de #map (wrapper visível), então left/top: 0 já ancora corretamente.

    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const cfg = config.mapUi;
    const dim = cfg.dimOpacity != null ? cfg.dimOpacity : 0.15;
    const pMin = cfg.pointsMin || 0;
    const pMax = cfg.pointsMax || 0;
    const [tw, th] = mapTileSize();

    // pixelByCoord retorna pixels no espaço MUNDO. TWMap.map.pos é o offset do canvas nesse espaço.
    // pixel_canvas = pixelByCoord(x,y) - TWMap.map.pos
    const mapOffset = T.map.pos || [0, 0];

    // Usa getViewport pra saber quais tiles estão visíveis (mais confiável que range manual)
    let xMin, xMax, yMin, yMax;
    try {
      const vp = T.map.getViewport();
      xMin = vp.top_left_tile.coord_x - 2;
      xMax = vp.bottom_right_tile.coord_x + 2;
      yMin = vp.top_left_tile.coord_y - 2;
      yMax = vp.bottom_right_tile.coord_y + 2;
    } catch (e) {
      // Fallback: usa TWMap.pos + range aproximado
      const pos = T.pos || [500, 500];
      const rangeX = Math.ceil((overlay.width / tw) / 2) + 3;
      const rangeY = Math.ceil((overlay.height / th) / 2) + 3;
      xMin = pos[0] - rangeX; xMax = pos[0] + rangeX;
      yMin = pos[1] - rangeY; yMax = pos[1] + rangeY;
    }

    const counts = { mine: 0, tribe: 0, enemy: 0, barb: 0, visible: 0 };
    let drawn = 0;

    // Intel: coord "x|y" -> { defTotal, wall, at } vindo do config.farm.defended (v9.55.1).
    // Só monta uma vez por redraw pra não iterar 30+ chaves 500x.
    const intelByCoord = {};
    if (cfg.showIntel && config.farm && config.farm.defended) {
      Object.values(config.farm.defended).forEach((d) => {
        if (d && typeof d === 'object' && d.coord) intelByCoord[d.coord] = d;
      });
    }
    // Reservas da tribo (sync manual): coord -> { expiresAt, playerName }
    const reservations = (cfg.showReservations && cfg.reservations) || {};
    // Cobertura de exploração, gravada pelo módulo Mapa a cada ciclo.
    const coberturaIntel = (cfg.showCobertura && config.map && config.map.intel) || null;
    const dimEnabled = cfg.dimMode === 'dim';

    // ALCANCE DO MÓDULO MAPA: a área que o raio configurado cobre, em volta de cada aldeia
    // sua. Desenhado ANTES das aldeias pra ficar por baixo, e como UM caminho só com um
    // fill: 43 elipses preenchidas separadamente empilhariam transparência e virariam uma
    // mancha sólida; num caminho único o preenchimento sai uniforme e o que se vê é a
    // UNIÃO — que é justamente a pergunta "até onde eu alcanço".
    // Elipse e não círculo porque o tile do TW não é quadrado (53x47).
    if (cfg.showRange) {
      const raio = (config.map && config.map.maxDist) || 20;
      const r2 = raio * raio;
      const minhas = [];
      _mapVilCache.forEach((v) => {
        if (v.playerId !== MY_PLAYER_ID) return;
        if (v.x < xMin - raio || v.x > xMax + raio || v.y < yMin - raio || v.y > yMax + raio) return;
        minhas.push(v);
      });
      if (minhas.length) {
        // PREENCHE TILE A TILE, não desenha círculos.
        //
        // A versão anterior desenhava uma elipse por aldeia. Mesmo unindo o preenchimento
        // num caminho só, os CONTORNOS de cada círculo continuavam aparecendo e com 43
        // aldeias viravam um emaranhado — o usuário descreveu como "muito poluído".
        // Pintando os tiles que estão no alcance de ALGUMA aldeia, as bordas internas
        // simplesmente não existem: o que sobra é uma mancha única, como a da relíquia.
        //
        // Uma chamada de pixelByCoord só, e o resto por aritmética: a grade é regular, e
        // 600 chamadas por redraw a 4 quadros por segundo seriam desperdício.
        let p0; try { p0 = T.map.pixelByCoord(xMin, yMin); } catch (e) { p0 = null; }
        if (p0) {
          const bx = (Array.isArray(p0) ? p0[0] : p0.x) - mapOffset[0];
          const by = (Array.isArray(p0) ? p0[1] : p0.y) - mapOffset[1];
          ctx.fillStyle = 'rgba(90,169,230,.20)';
          for (let ty = yMin; ty <= yMax; ty++) {
            // Pinta em FAIXAS horizontais contínuas em vez de um retângulo por tile:
            // menos chamadas e, principalmente, sem costura visível entre tiles vizinhos.
            let inicio = -1;
            for (let tx = xMin; tx <= xMax + 1; tx++) {
              let dentro = false;
              if (tx <= xMax) {
                for (let k = 0; k < minhas.length; k++) {
                  const dx = minhas[k].x - tx, dy = minhas[k].y - ty;
                  if (dx * dx + dy * dy <= r2) { dentro = true; break; }
                }
              }
              if (dentro && inicio < 0) inicio = tx;
              else if (!dentro && inicio >= 0) {
                ctx.fillRect(bx + (inicio - xMin) * tw, by + (ty - yMin) * th, (tx - inicio) * tw, th);
                inicio = -1;
              }
            }
          }
        }
      }
    }

    _mapVilCache.forEach((vil, vid) => {
      if (vil.x < xMin || vil.x > xMax || vil.y < yMin || vil.y > yMax) return;
      let wx, wy;
      try {
        const p = T.map.pixelByCoord(vil.x, vil.y);
        if (Array.isArray(p)) { wx = p[0]; wy = p[1]; }
        else if (p && typeof p === 'object') { wx = p.x; wy = p.y; }
        else return;
      } catch (e) { return; }
      const px = wx - mapOffset[0];
      const py = wy - mapOffset[1];
      if (px < -tw || px > overlay.width + tw || py < -th || py > overlay.height + th) return;

      const cat = mapCategoryOf(vil);
      const showCat = cfg.show[cat] !== false;
      const points = vil.points || 0;
      const passesPoints = (!pMin || points >= pMin) && (!pMax || points <= pMax);
      const visible = showCat && passesPoints;
      drawn++;
      if (visible) { counts.visible++; counts[cat] = (counts[cat] || 0) + 1; }

      if (!visible) {
        // Filtrada: só escurece se o usuário optou por 'dim'. Padrão 'off' não desenha nada.
        if (dimEnabled) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - dim) + ')'; ctx.fillRect(px, py, tw, th); }
        return;
      }

      // COBERTURA DE EXPLORAÇÃO: moldura colorida pelo que eu sei daquela aldeia.
      // Desenhada como borda em vez de preenchimento pra não esconder o gráfico do jogo —
      // o padrão das cores no conjunto é que responde "até onde eu já enxerguei".
      if (cfg.showCobertura && coberturaIntel) {
        const cod = coberturaIntel[vil.x + '|' + vil.y];
        if (cod) {
          ctx.strokeStyle = MAP_INTEL_COR[cod] || '#888';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, tw - 2, th - 2);
        }
      }

      // Badge de pontos (canto inferior direito)
      if (cfg.showBadge) {
        const label = points >= 1000 ? (Math.round(points / 100) / 10).toFixed(1) + 'k' : String(points);
        ctx.font = 'bold 9px Verdana';
        const lw = ctx.measureText(label).width;
        const bx = px + tw - lw - 4, by = py + th - 12;
        ctx.fillStyle = 'rgba(0,0,0,.75)';
        ctx.fillRect(bx, by, lw + 4, 11);
        ctx.fillStyle = '#a2643a';
        ctx.textBaseline = 'top';
        ctx.fillText(label, bx + 2, by + 1);
      }

      // Intel (canto superior esquerdo): ⚠ tropa defensora + ⛰N muralha
      const coordKey = vil.x + '|' + vil.y;
      const intel = intelByCoord[coordKey];
      if (intel) {
        const parts = [];
        if (intel.defTotal > 0) parts.push('⚠' + intel.defTotal);
        if (intel.wall != null) parts.push('⛰' + intel.wall);
        if (parts.length) {
          const txt = parts.join(' ');
          ctx.font = 'bold 9px Verdana';
          const w2 = ctx.measureText(txt).width;
          ctx.fillStyle = 'rgba(120,0,0,.85)';
          ctx.fillRect(px, py, w2 + 4, 11);
          ctx.fillStyle = '#fff';
          ctx.textBaseline = 'top';
          ctx.fillText(txt, px + 2, py + 1);
        }
      }

      // Reserva da tribo (canto inferior esquerdo): ⌛Xh (horas até expirar)
      const rsv = reservations[coordKey];
      if (rsv) {
        let label = '⌛?';
        if (rsv.expiresAt) {
          const restMs = rsv.expiresAt - Date.now();
          if (restMs > 0) {
            const h = Math.floor(restMs / 3600000);
            const m = Math.floor((restMs % 3600000) / 60000);
            label = '⌛' + (h > 0 ? h + 'h' : m + 'm');
          } else {
            label = '⌛venceu';
          }
        }
        // Cor: azul se muito tempo (>24h), amarelo (<24h), vermelho (<6h)
        const restH = rsv.expiresAt ? (rsv.expiresAt - Date.now()) / 3600000 : 999;
        const bg = restH < 6 ? 'rgba(180,20,20,.85)' : restH < 24 ? 'rgba(180,140,20,.85)' : 'rgba(40,80,180,.85)';
        ctx.font = 'bold 9px Verdana';
        const lw2 = ctx.measureText(label).width;
        ctx.fillStyle = bg;
        ctx.fillRect(px, py + th - 22, lw2 + 4, 11);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'top';
        ctx.fillText(label, px + 2, py + th - 21);
      }
    });

    if (!_mapLoggedOnce) {
      _mapLoggedOnce = true;
      // eslint-disable-next-line no-console
      console.log('[TWMgr Mapa] overlay canvas ativo · mapOffset:', mapOffset, '· viewport:', [xMin, yMin, xMax, yMax], '· tileSize:', [tw, th], '· desenhadas:', drawn, '· cache:', _mapVilCache.size);
    }

    const cnt = document.getElementById('twmgr-map-counts');
    if (cnt) {
      if (drawn === 0) cnt.innerHTML = '<span style="color:#a52020">⚠ 0 aldeias no viewport (ver console)</span>';
      else cnt.textContent = counts.visible + '/' + drawn + ' visíveis · 🟢' + (counts.mine||0) + ' 🔵' + (counts.tribe||0) + ' 🔴' + (counts.enemy||0) + ' ⚪' + (counts.barb||0);
    }
  }

  function mapApplyFilters() { try { mapCanvasRedraw(); } catch (e) { console.warn('[TWMgr Mapa] redraw falhou:', e.message || e); } }

  function mapBuildPanel() {
    if (document.getElementById('twmgr-map-panel')) return;
    const cfg = config.mapUi;
    // Ancora inline abaixo da tabela "Alterar o tamanho do mapa" (contém #map_chooser_select).
    // Se não achar (mundo diferente / layout mudou), cai pro fixed antigo no canto.
    const sizeSel = document.getElementById('map_chooser_select');
    const sizeTable = sizeSel ? sizeSel.closest('table') : null;
    const inline = !!sizeTable;
    const panel = document.createElement(inline ? 'table' : 'div');
    panel.id = 'twmgr-map-panel';
    if (inline) {
      panel.className = 'vis';
      panel.setAttribute('width', '100%');
      panel.style.cssText = 'margin-top:6px;font-size:11px;color:#3b2914;font-family:Verdana,sans-serif';
    } else {
      panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:10000;background:linear-gradient(180deg,#f4e4bc,#8b5426);border:1px solid #a2643a;border-radius:8px;padding:8px 10px;font-size:11px;color:#3b2914;box-shadow:0 2px 6px rgba(0,0,0,.35);min-width:220px;font-family:Verdana,sans-serif';
    }
    const check = (id, label, checked) => '<label style="display:flex;align-items:center;gap:6px;margin:2px 0;cursor:pointer"><input id="' + id + '" type="checkbox"' + (checked ? ' checked' : '') + '> ' + label + '</label>';
    const bodyHTML =
      '<div id="twmgr-map-body" style="' + (cfg.collapsed ? 'display:none' : '') + '">' +
        check('twmgr-map-show-mine', '🟢 Minhas aldeias', cfg.show.mine) +
        check('twmgr-map-show-tribe', '🔵 Tribo', cfg.show.tribe) +
        check('twmgr-map-show-enemy', '🔴 Inimigos', cfg.show.enemy) +
        check('twmgr-map-show-barb', '⚪ Bárbaros', cfg.show.barb) +
        '<div style="margin:6px 0;border-top:1px dashed #b89a5a;padding-top:6px">Pontos entre:</div>' +
        '<div style="display:flex;gap:4px;align-items:center">' +
          '<input id="twmgr-map-pmin" type="number" min="0" placeholder="mín" value="' + (cfg.pointsMin || '') + '" style="width:60px;padding:2px 4px;font-size:11px">' +
          '<span>–</span>' +
          '<input id="twmgr-map-pmax" type="number" min="0" placeholder="máx" value="' + (cfg.pointsMax || '') + '" style="width:60px;padding:2px 4px;font-size:11px">' +
        '</div>' +
        check('twmgr-map-badge', 'Mostrar pontos na aldeia', cfg.showBadge) +
        check('twmgr-map-intel', 'Mostrar intel (⚠ tropas · ⛰ muralha)', cfg.showIntel) +
        check('twmgr-map-rsv', 'Mostrar reservas da tribo (⌛)', cfg.showReservations) +
        check('twmgr-map-cob', 'Mostrar cobertura de exploração', cfg.showCobertura) +
        check('twmgr-map-range', 'Mostrar meu alcance (raio do módulo Mapa)', cfg.showRange) +
        '<div id="twmgr-map-cob-leg" style="font-size:9px;line-height:1.7;margin:2px 0 6px 4px"></div>' +
        check('twmgr-map-dim', 'Escurecer aldeias filtradas (bloco preto)', cfg.dimMode === 'dim') +
        '<div style="margin-top:6px;border-top:1px dashed #b89a5a;padding-top:6px;font-size:10px;color:#ddd2c0">' +
          '<div id="twmgr-map-counts">—</div>' +
          '<div style="margin-top:4px;display:flex;justify-content:space-between;align-items:center;gap:4px;flex-wrap:wrap">' +
            '<button id="twmgr-map-reset" style="padding:2px 6px;font-size:10px;border:1px solid #a2643a;border-radius:3px;background:#8b5426;cursor:pointer;color:#3b2914" title="Mostra tudo, sem overlay: liga todos os toggles, zera pontos, desliga escurecer">🚫 Desativar tudo</button>' +
            '<button id="twmgr-map-reload" style="padding:2px 6px;font-size:10px;border:1px solid #a2643a;border-radius:3px;background:#8b5426;cursor:pointer;color:#3b2914">🔄 mapa</button>' +
            '<button id="twmgr-map-rsv-sync" style="padding:2px 6px;font-size:10px;border:1px solid #a2643a;border-radius:3px;background:#8b5426;cursor:pointer;color:#3b2914" title="Baixa o planner interno da tribo (screen=ally&mode=reservations) e mostra ⌛Xh nas aldeias reservadas">⌛ sync reservas</button>' +
          '</div>' +
          '<div style="margin-top:2px;color:#ddd2c0;font-size:9px">cache mapa: ' + (cfg.dataCachedAt ? new Date(cfg.dataCachedAt).toLocaleTimeString() : '—') + ' · reservas: ' + (cfg.reservationsAt ? (new Date(cfg.reservationsAt).toLocaleTimeString() + ' (' + Object.keys(cfg.reservations || {}).length + ')') : '—') + '</div>' +
        '</div>' +
      '</div>';
    if (inline) {
      // Estrutura tipo tabela vis nativa: <th> header + <td> corpo (padrão do TW pra sidebar do mapa)
      panel.innerHTML =
        '<tr><th colspan="2" style="cursor:pointer" id="twmgr-map-header">🗺️ TW Manager · Mapa <span id="twmgr-map-collapse">' + (cfg.collapsed ? '▲' : '▼') + '</span></th></tr>' +
        '<tr><td colspan="2" style="padding:6px 8px">' + bodyHTML + '</td></tr>';
      sizeTable.parentNode.insertBefore(panel, sizeTable.nextSibling);
    } else {
      panel.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<b style="color:#ddd2c0">🗺️ TW Manager · Mapa</b>' +
          '<span id="twmgr-map-collapse" style="cursor:pointer;padding:0 6px;color:#ddd2c0">' + (cfg.collapsed ? '▲' : '▼') + '</span>' +
        '</div>' + bodyHTML;
      document.body.appendChild(panel);
    }

    // Wire eventos
    const save_ = () => { save(); mapApplyFilters(); };
    // Colapsar: no modo inline o click é no header todo; no modo fixed, só no span
    const toggler = document.getElementById('twmgr-map-header') || document.getElementById('twmgr-map-collapse');
    if (toggler) toggler.addEventListener('click', () => {
      cfg.collapsed = !cfg.collapsed;
      const body = document.getElementById('twmgr-map-body'); if (body) body.style.display = cfg.collapsed ? 'none' : '';
      const chevron = document.getElementById('twmgr-map-collapse'); if (chevron) chevron.textContent = cfg.collapsed ? '▲' : '▼';
      save();
    });
    ['mine','tribe','enemy','barb'].forEach((k) => {
      document.getElementById('twmgr-map-show-' + k).addEventListener('change', (e) => {
        cfg.show[k] = e.target.checked; save_();
      });
    });
    document.getElementById('twmgr-map-pmin').addEventListener('change', (e) => { cfg.pointsMin = parseInt(e.target.value, 10) || 0; save_(); });
    document.getElementById('twmgr-map-pmax').addEventListener('change', (e) => { cfg.pointsMax = parseInt(e.target.value, 10) || 0; save_(); });
    document.getElementById('twmgr-map-badge').addEventListener('change', (e) => { cfg.showBadge = e.target.checked; save_(); });
    document.getElementById('twmgr-map-intel').addEventListener('change', (e) => { cfg.showIntel = e.target.checked; save_(); });
    document.getElementById('twmgr-map-rsv').addEventListener('change', (e) => { cfg.showReservations = e.target.checked; save_(); });
    document.getElementById('twmgr-map-cob').addEventListener('change', (e) => { cfg.showCobertura = e.target.checked; save_(); mapRenderLegendaCobertura(); });
    document.getElementById('twmgr-map-range').addEventListener('change', (e) => { cfg.showRange = e.target.checked; save_(); });
    mapRenderLegendaCobertura();
    document.getElementById('twmgr-map-dim').addEventListener('change', (e) => { cfg.dimMode = e.target.checked ? 'dim' : 'off'; save_(); });
    document.getElementById('twmgr-map-rsv-sync').addEventListener('click', async () => {
      const btn = document.getElementById('twmgr-map-rsv-sync');
      btn.disabled = true; btn.textContent = '⏳ sincronizando…';
      const r = await loadReservations();
      btn.disabled = false; btn.textContent = '⌛ sync reservas';
      if (r.ok) pushLog('Mapa: ' + r.count + ' reserva(s) sincronizada(s).', 'ok');
      else pushLog('Mapa: falha ao sincronizar reservas — ' + (r.error || 'erro desconhecido'), 'err');
      // Re-monta o painel pra atualizar o timestamp na barra de status
      const p = document.getElementById('twmgr-map-panel'); if (p) p.remove();
      mapBuildPanel();
      mapApplyFilters();
    });
    document.getElementById('twmgr-map-reset').addEventListener('click', () => {
      cfg.show = { mine: true, tribe: true, enemy: true, barb: true };
      cfg.pointsMin = 0; cfg.pointsMax = 0;
      cfg.dimMode = 'off';
      save_();
      // Re-render dos checkboxes/inputs pra refletir o reset visualmente
      ['mine','tribe','enemy','barb'].forEach((k) => { const el = document.getElementById('twmgr-map-show-' + k); if (el) el.checked = true; });
      const pmin = document.getElementById('twmgr-map-pmin'); if (pmin) pmin.value = '';
      const pmax = document.getElementById('twmgr-map-pmax'); if (pmax) pmax.value = '';
      const dim = document.getElementById('twmgr-map-dim'); if (dim) dim.checked = false;
    });
    document.getElementById('twmgr-map-reload').addEventListener('click', async () => {
      const btn = document.getElementById('twmgr-map-reload');
      btn.disabled = true; btn.textContent = '⏳ carregando…';
      await loadMapData(true);
      btn.disabled = false; btn.textContent = '🔄 recarregar';
      mapApplyFilters();
    });
  }

  async function enhanceMapPage() {
    const gd = window.game_data;
    if (!gd || gd.screen !== 'map') return;
    await loadMapData(false);
    mapBuildPanel();
    // Espera o TWMap estar pronto (as vezes carrega assincrono)
    const waitTWMap = () => new Promise((resolve) => {
      const t0 = Date.now();
      const check = () => {
        if (window.TWMap && window.TWMap.map && typeof window.TWMap.map.pixelByCoord === 'function') return resolve(true);
        if (Date.now() - t0 > 8000) return resolve(false);
        setTimeout(check, 100);
      };
      check();
    });
    const ok = await waitTWMap();
    if (!ok) { console.warn('[TWMgr Mapa] TWMap.map.pixelByCoord não disponível — filtros não funcionarão'); return; }
    mapApplyFilters();
    // Redraw periódico (250ms) — cobre scroll/zoom. O comentário aqui dizia "só itera aldeias no
    // viewport", o que é falso: mapCanvasRedraw percorre o cache inteiro e descarta por dentro.
    // Medido antes de "consertar": 0,62ms por passada com 60 mil aldeias, ou 2,5ms de CPU por
    // segundo. Não é gargalo, e indexar por coluna seria complexidade sem ganho. Fica como está —
    // o comentário é que estava mentindo.
    clearInterval(_mapRedrawTimer);
    _mapRedrawTimer = setInterval(mapApplyFilters, 250);
    // Hook opcional: se o TWMap dispara evento de setPos, redesenha imediato
    try {
      const origSetPos = window.TWMap.map.setPos;
      if (typeof origSetPos === 'function' && !window.TWMap.map.__twmgr_hooked) {
        window.TWMap.map.__twmgr_hooked = true;
        window.TWMap.map.setPos = function () { const r = origSetPos.apply(this, arguments); try { mapCanvasRedraw(); } catch (e) {} return r; };
      }
    } catch (e) {}
  }

