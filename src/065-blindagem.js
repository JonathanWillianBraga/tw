  // ==================== BLINDAGEM (pedidos da tribo do fórum) ====================
  // Puxa a tabela de pedidos do tópico do fórum e monta lista editável de apoios.
  // Regras da tribo: N°/LANC/ESP/SPY/CP separado por barra, mínimo 250/250, zero pra tropas não enviadas.

  async function blindagemFetch(threadUrl) {
    if (!threadUrl) throw new Error('URL do tópico vazia');
    const res = await fetch(threadUrl, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    // Procura em TODAS as tabelas — pega as linhas cujo texto tem coord (x|y) e N inicial.
    const rows = [];
    doc.querySelectorAll('table tr').forEach((tr) => {
      const tds = Array.from(tr.querySelectorAll('td'));
      if (tds.length < 3) return;
      const numText = (tds[0].textContent || '').trim();
      if (!/^\d+$/.test(numText)) return;
      const num = parseInt(numText, 10);
      // Aldeia + coord: procura em qualquer td, tipicamente o 2º
      let name = '', coord = null, x = 0, y = 0, ci = -1;
      for (let i = 1; i < tds.length; i++) {
        const t = (tds[i].textContent || '').replace(/\s+/g, ' ').trim();
        const m = t.match(/^(.*?)\((\d{1,3})\|(\d{1,3})\)/);
        if (m) { name = m[1].trim(); coord = m[2] + '|' + m[3]; x = +m[2]; y = +m[3]; ci = i; break; }
      }
      if (!coord) return;
      // Quantidades: as colunas LOGO DEPOIS da aldeia, na ordem LANC/ESP/SPY/CP.
      // Antes varria todos os tds, removia os zeros e destruturava por posição — dois defeitos
      // somados: (a) o zero sumia, então "250/0/0/100" virava LANC=250 e ESP=100; (b) a célula
      // da aldeia "Nome (500|600)" virava o número 500600 e entrava na lista, deslocando tudo.
      // Resultado: o painel mostrava um pedido que a tribo não fez, e era ele que ia pro envio.
      const val = (i) => {
        const td = tds[i]; if (!td) return 0;
        const t = (td.textContent || '').replace(/\D/g, '');
        return t ? parseInt(t, 10) : 0;
      };
      const ped = { LANC: val(ci + 1), ESP: val(ci + 2), SPY: val(ci + 3), CP: val(ci + 4) };
      rows.push({
        id: 'blz' + num + '-' + coord,
        num: num, name: name, coord: coord, x: x, y: y,
        ped: ped,
        originVid: '',
        send: { LANC: ped.LANC, ESP: ped.ESP, SPY: 0, CP: 0 },
        checked: false,
      });
    });
    // PRESERVA o que era seu. Antes isto sobrescrevia tudo, apagando sem aviso a origem escolhida,
    // as quantidades ajustadas à mão e a marca de já-enviado — e o que já tinha saído voltava a
    // aparecer como pendente. Agora o fórum manda no pedido; o resto é seu e sobrevive.
    const antigas = {};
    (config.planner.blindagem.rows || []).forEach((r) => { antigas[r.id] = r; });
    rows.forEach((r) => {
      const a = antigas[r.id];
      if (!a) return;
      r.originVid = a.originVid || '';
      r.enviadoEm = a.enviadoEm || 0;
      r.checked = r.enviadoEm ? false : !!a.checked;
      // só reaproveita o envio ajustado se o pedido do fórum não mudou
      const mesmoPedido = a.ped && a.ped.LANC === r.ped.LANC && a.ped.ESP === r.ped.ESP
        && a.ped.SPY === r.ped.SPY && a.ped.CP === r.ped.CP;
      if (mesmoPedido && a.send) r.send = a.send;
    });
    config.planner.blindagem.rows = rows;
    config.planner.blindagem.lastFetch = Date.now();
    save();
    return rows;
  }

  async function blindagemSend() { return ocupado(_blindagemSend); }
  async function _blindagemSend() {
    const list = (config.planner.blindagem.rows || []).filter((r) => r.checked && r.originVid);
    if (!list.length) { pushLog('Blindagem: nenhuma linha marcada com origem definida.', 'err'); return; }
    const results = [];
    for (const r of list) {
      const s = r.send || {};
      const amounts = {};
      if (s.LANC > 0) amounts.spear = s.LANC;
      if (s.ESP > 0) amounts.sword = s.ESP;
      if (s.SPY > 0) amounts.spy = s.SPY;
      if (s.CP > 0) amounts.heavy = s.CP;
      const total = (s.LANC || 0) + (s.ESP || 0) + (s.SPY || 0) + (s.CP || 0);
      if (total === 0) { pushLog('Blindagem #' + r.num + ' (' + r.coord + '): sem tropa a enviar — pulado.', '', 'planner'); continue; }
      if ((s.LANC || 0) + (s.ESP || 0) < 250) {
        pushLog('Blindagem #' + r.num + ' (' + r.coord + '): LANC+ESP < 250 (mínimo da tribo) — pulado.', 'err', 'planner');
        continue;
      }
      try {
        await sendAttack(r.originVid, r.x, r.y, amounts, 'support');
        // DESMARCA E GRAVA JÁ. Sem isto, um segundo clique em "Enviar" reenviava tudo que já
        // tinha saído — as aldeias de defesa esvaziavam duas vezes. Grava a cada linha porque
        // a página recarrega, e o que já saiu não pode voltar a aparecer como pendente.
        r.checked = false; r.enviadoEm = Date.now(); save();
        results.push(r);
        pushLog('🛡️ Blindagem #' + r.num + ' → ' + r.coord + ' enviada (' + (s.LANC || 0) + '/' + (s.ESP || 0) + '/' + (s.SPY || 0) + '/' + (s.CP || 0) + ')', 'ok', 'planner');
        await sleep(400);
      } catch (e) {
        const em = String(e.message || e);
        // Ambíguo = pode ter saído. Desmarca também: reenviar apoio dobra a defesa fora de casa.
        if (/^ambiguo:/.test(em)) {
          r.checked = false; r.enviadoEm = Date.now(); save();
          pushLog('🛡️ Blindagem #' + r.num + ' (' + r.coord + '): resposta ambígua, pode ter saído. Desmarquei — confira na tela de comandos antes de reenviar.', '', 'planner');
        } else {
          pushLog('🛡️ Blindagem #' + r.num + ' FALHOU: ' + em, 'err', 'planner');
        }
      }
    }
    // Gera texto do fórum a partir das enviadas
    const text = results.map((r) => {
      const s = r.send;
      return r.num + '/' + (s.LANC || 0) + '/' + (s.ESP || 0) + '/' + (s.SPY || 0) + '/' + (s.CP || 0);
    }).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      pushLog('🛡️ Blindagem: ' + results.length + '/' + list.length + ' apoios enviados. Texto copiado pro clipboard.', 'ok', 'planner');
    } catch (e) {
      pushLog('🛡️ Blindagem: ' + results.length + '/' + list.length + ' apoios enviados. Texto abaixo (copie manualmente):\n' + text, '', 'planner');
    }
    return { sent: results.length, total: list.length, text: text };
  }

  async function renderBlindagemList() {
    const box = document.getElementById('twmgr-blz-list'); if (!box) return;
    const rows = config.planner.blindagem.rows || [];
    if (!rows.length) { box.innerHTML = '<div style="font-size:10px;color:#6e5a2a;padding:6px;text-align:center">— sem pedidos. Cole a URL e clique Buscar. —</div>'; return; }
    let vils = []; try { vils = await getAllVillagesCached(); } catch (e) {}
    const opts = '<option value="">— origem —</option>' + vils.map((v) => '<option value="' + v.vid + '">' + esc(v.name) + '</option>').join('');
    box.innerHTML = rows.map((r) => {
      const s = r.send || { LANC: 0, ESP: 0, SPY: 0, CP: 0 };
      const p = r.ped;
      const originSel = opts.replace('value="' + r.originVid + '"', 'value="' + r.originVid + '" selected');
      return '<div data-blz-id="' + r.id + '" style="border-bottom:1px dashed #dcc78f;padding:4px 2px;font-size:10px;color:#5c4527">' +
        '<div style="display:flex;align-items:center;gap:4px">' +
          '<input type="checkbox" class="blz-chk"' + (r.checked ? ' checked' : '') + '>' +
          '<b>#' + r.num + '</b> · ' + esc(r.name) + ' <span style="color:#7a5710">(' + r.coord + ')</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:4px;margin-top:2px">' +
          '<span style="color:#6e5a2a">origem:</span>' +
          '<select class="blz-origin" style="flex:1;font-size:10px">' + originSel + '</select>' +
        '</div>' +
        '<div style="color:#6e5a2a;margin-top:2px">ped: ' + p.LANC + ' LANC / ' + p.ESP + ' ESP / ' + p.SPY + ' SPY / ' + p.CP + ' CP</div>' +
        '<div style="display:flex;gap:3px;margin-top:2px;flex-wrap:wrap">' +
          '<label style="display:flex;align-items:center;gap:2px">L <input type="number" min="0" class="blz-send" data-u="LANC" value="' + (s.LANC || 0) + '" style="width:52px;font-size:10px"></label>' +
          '<label style="display:flex;align-items:center;gap:2px">E <input type="number" min="0" class="blz-send" data-u="ESP" value="' + (s.ESP || 0) + '" style="width:52px;font-size:10px"></label>' +
          '<label style="display:flex;align-items:center;gap:2px">S <input type="number" min="0" class="blz-send" data-u="SPY" value="' + (s.SPY || 0) + '" style="width:40px;font-size:10px"></label>' +
          '<label style="display:flex;align-items:center;gap:2px">CP <input type="number" min="0" class="blz-send" data-u="CP" value="' + (s.CP || 0) + '" style="width:52px;font-size:10px"></label>' +
        '</div>' +
      '</div>';
    }).join('');
    // Wire eventos
    box.querySelectorAll('[data-blz-id]').forEach((el) => {
      const id = el.getAttribute('data-blz-id');
      const row = rows.find((r) => r.id === id); if (!row) return;
      el.querySelector('.blz-chk').addEventListener('change', (e) => { row.checked = e.target.checked; save(); });
      el.querySelector('.blz-origin').addEventListener('change', (e) => { row.originVid = e.target.value; save(); });
      el.querySelectorAll('.blz-send').forEach((inp) => inp.addEventListener('change', (e) => {
        const u = inp.getAttribute('data-u');
        row.send = row.send || { LANC: 0, ESP: 0, SPY: 0, CP: 0 };
        row.send[u] = Math.max(0, parseInt(inp.value, 10) || 0);
        save();
      }));
    });
  }

