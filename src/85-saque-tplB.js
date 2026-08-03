  // ==================== ASSISTENTE DE SAQUE: TEMPLATE B ====================
  // Descobre o template_id do B (e as unidades) direto do am_farm; envia via o endpoint
  // oficial do assistente pra manter o alvo listado com relatório fresco.
  let _farmTplCache = null, _farmTplCacheAt = 0;
  async function getFarmTemplates(vid, force) {
    const now = Date.now();
    if (!force && _farmTplCache && (now - _farmTplCacheAt < 30 * 60 * 1000)) return _farmTplCache;
    const res = await fetch('/game.php?village=' + vid + '&screen=am_farm', { credentials: 'include' });
    const html = await res.text();
    if (/^\s*<!doctype|^\s*<html/i.test(html.slice(0, 60)) && html.length < 2000) {
      throw new Error('am_farm devolveu página curta (sessão expirada?)');
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = { a: null, b: null, unitsA: {}, unitsB: {}, debug: [] };

    // Estratégia 1: IDs dos ícones farm_icon_a / farm_icon_b (data-attr ou onclick)
    const iconId = (cls) => {
      for (const el of doc.querySelectorAll('.' + cls + ', a.' + cls)) {
        const d = el.getAttribute('data-template-id') || (el.dataset && el.dataset.templateId);
        if (d && /^\d+$/.test(d)) return { id: d, src: 'icon-data' };
        const oc = el.getAttribute('onclick') || '';
        // onclick = "...sendUnits(this, <villageId>, <templateId>)" — o template_id é o ÚLTIMO número.
        const inside = oc.match(/sendUnits\s*\(([^)]*)\)/i);
        if (inside) { const nums = inside[1].match(/\d+/g); if (nums && nums.length >= 2) return { id: nums[nums.length - 1], src: 'icon-onclick' }; }
      }
      return null;
    };
    const iconA = iconId('farm_icon_a');
    const iconB = iconId('farm_icon_b');
    if (iconA) { out.a = iconA.id; out.debug.push('A via ' + iconA.src); }
    if (iconB) { out.b = iconB.id; out.debug.push('B via ' + iconB.src); }

    // Estratégia 2: forms de configuração com input[name="template_id"] (ordem A, B)
    const orderedIds = [];
    doc.querySelectorAll('input[name="template_id"]').forEach((inp) => {
      const v = (inp.value || '').trim();
      if (/^\d+$/.test(v) && orderedIds.indexOf(v) === -1) orderedIds.push(v);
    });
    if (!out.a && orderedIds[0]) { out.a = orderedIds[0]; out.debug.push('A via forms'); }
    if (!out.b && orderedIds[1]) { out.b = orderedIds[1]; out.debug.push('B via forms'); }

    // Estratégia 3: inline JS Accountmanager.farm.templates = [...]
    // Roda também quando os IDs já foram achados: é a ÚNICA fonte das UNIDADES de cada template, e
    // antes ficava de fora sempre que as estratégias 1/2 davam certo (ids ok, unidades vazias).
    if (!out.a || !out.b || !Object.keys(out.unitsA).length || !Object.keys(out.unitsB).length) {
      // Aceita templates:[…] · "templates":[…] · templates = {…}. E em vez de regex não-gulosa (que
      // parava no primeiro ] e quebrava com aninhamento), varre contando colchetes/chaves.
      const anchor = html.search(new RegExp('[\'"]?templates[\'"]?\\s*[:=]\\s*[[{]'));
      let raw = null;
      if (anchor >= 0) {
        let i = anchor; while (i < html.length && html[i] !== '[' && html[i] !== '{') i++;
        const open = html[i], close = open === '[' ? ']' : '}';
        let depth = 0, j = i, q = null;
        for (; j < html.length && j - i < 20000; j++) {
          const ch = html[j];
          if (q) { if (ch === '\\') j++; else if (ch === q) q = null; continue; }
          if (ch === '"' || ch === "'") { q = ch; continue; }
          if (ch === open) depth++;
          else if (ch === close) { depth--; if (!depth) { raw = html.slice(i, j + 1); break; } }
        }
      }
      const m = raw ? [null, raw] : null;
      if (!m) out.debug.push('inline JS: bloco templates não encontrado');
      if (m) {
        try {
          let parsed = JSON.parse(m[1].replace(new RegExp('([{,]\\s*)(\\w+)\\s*:', 'g'), '$1"$2":').replace(/'/g, '"'));
          if (parsed && !Array.isArray(parsed)) parsed = Object.keys(parsed).map((k) => Object.assign({ id: k }, parsed[k]));
          if (Array.isArray(parsed) && parsed.length) {
            // Casa pelo ID quando ele já é conhecido; só cai na ordem [0]=A,[1]=B se não achar.
            const byId = (id) => (id ? parsed.find((t) => t && String(t.id) === String(id)) : null);
            const pa = byId(out.a) || parsed[0], pb = byId(out.b) || parsed[1];
            if (!out.a && pa && pa.id) { out.a = String(pa.id); out.debug.push('A via inline JS'); }
            if (!out.b && pb && pb.id) { out.b = String(pb.id); out.debug.push('B via inline JS'); }
            if (pa && pa.units) { out.unitsA = Object.assign({}, out.unitsA, pa.units); out.debug.push('unidades A via inline JS'); }
            if (pb && pb.units) { out.unitsB = Object.assign({}, out.unitsB, pb.units); out.debug.push('unidades B via inline JS'); }
          }
        } catch (e) { out.debug.push('inline JS: JSON não parseável'); }
      }
    }
    // Estratégia 4 (a que funciona no br143): os campos são nomeados unidade[templateId] — light[965],
    // spear[2770]… O id vive DENTRO do name, e não num input template_id separado. Por isso as
    // estratégias que procuravam template_id não achavam nada.
    const readByTplId = (id, bucket, tag) => {
      if (!id) return;
      let achou = 0;
      UNITS.forEach((p) => {
        const inp = doc.querySelector('input[name="' + p[0] + '[' + id + ']"]');
        if (!inp) return;
        const n = parseInt(inp.value, 10);
        if (n > 0) { bucket[p[0]] = n; achou++; }
      });
      if (achou) out.debug.push('unidades ' + tag + ' via name[id]');
    };
    if (!Object.keys(out.unitsA).length) readByTplId(out.a, out.unitsA, 'A');
    if (!Object.keys(out.unitsB).length) readByTplId(out.b, out.unitsB, 'B');

    // Se AINDA não temos as unidades, registra a "cara" da página pra saber onde elas moram de fato,
    // em vez de tentar seletor no escuro. Sai uma vez, junto do aviso do ciclo.
    if (!Object.keys(out.unitsA).length && !Object.keys(out.unitsB).length) {
      const pat = {};
      doc.querySelectorAll('input[name]').forEach((i) => {
        const n = i.getAttribute('name') || '';
        if (UNITS.some((p) => n.indexOf(p[0]) !== -1)) pat[n.replace(/\d+/g, '#')] = 1;
      });
      out.debug.push('página: ' + doc.querySelectorAll('form').length + ' form(s), ' +
        doc.querySelectorAll('input[name="template_id"]').length + ' template_id, campos de unidade: ' +
        (Object.keys(pat).slice(0, 6).join(' ') || 'nenhum') +
        (/Accountmanager|AccountManager/.test(html) ? ' · tem Accountmanager' : ' · sem Accountmanager'));
    }

    // Extrai unidades dos forms de configuração de cada template
    doc.querySelectorAll('form').forEach((form) => {
      const tplInp = form.querySelector('input[name="template_id"]');
      if (!tplInp) return;
      const id = (tplInp.value || '').trim();
      if (!/^\d+$/.test(id)) return;
      const bucket = id === out.a ? out.unitsA : id === out.b ? out.unitsB : null;
      if (!bucket) return;
      UNITS.forEach((p) => {
        const inp = form.querySelector('input[name="' + p[0] + '"]');
        if (!inp) return;
        const n = parseInt(inp.value, 10);
        if (n > 0) bucket[p[0]] = n;
      });
    });

    _farmTplCache = out; _farmTplCacheAt = now;
    return out;
  }
  async function sendFarmB(srcVid, tgtVid, tplBId) {
    const b = new URLSearchParams();
    b.set('target', String(tgtVid));
    b.set('template_id', String(tplBId));
    b.set('source_village', String(srcVid));
    b.set('h', CSRF);
    const res = await fetch('/game.php?village=' + srcVid + '&screen=am_farm&mode=farm&ajaxaction=farm&h=' + CSRF, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'TribalWars-Ajax': '1', 'X-Requested-With': 'XMLHttpRequest' },
      body: b.toString(),
    });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    const err = j && (j.error || (j.response && j.response.error));
    if (err) throw new Error(Array.isArray(err) ? err.join('; ') : String(err));
    if (!j) {
      // Servidor não retornou JSON — provável falha (HTML de login, alvo inválido, etc.)
      throw new Error('assistente: resposta não-JSON (' + (txt || '').slice(0, 60).replace(/\s+/g, ' ') + ')');
    }
    return true;
  }

