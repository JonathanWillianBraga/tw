  // ==================== BACKUP (exportar / importar a configuração inteira) ====================
  // Pra levar a conta de um PC pro outro sem perder nada. E "nada" aqui é literal: a config NÃO
  // mora numa chave só do localStorage. São ~22 chaves — a principal (`twMgr_<mundo>`) mais as
  // satélites que módulos diferentes criaram ao longo do tempo:
  //
  //   twMgr_<mundo>              config principal (inclui config.cmd = ATAQUES PROGRAMADOS)
  //   twMgr_<mundo>_alvos        fichas de alvo (vocação de cada aldeia)
  //   twMgr_<mundo>_apoios       visão de apoios por destino
  //   twMgr_<mundo>_scoutHist    histórico de exploração
  //   twMgr_<mundo>_scoutTpl     modelos de exploração
  //   twMgr_<mundo>_daily        bônus diário
  //   twMgr_<mundo>_log          log geral
  //   twMgr_<mundo>_nobleTrail   trilha de decisão do Noblar
  //   twMgr_farmSub_*, twMgr_panelW   estado da interface (aba aberta, largura do painel)
  //
  // Exportar só a principal perderia fichas, apoios, exploração e trilha — por isso a coleta é
  // por PREFIXO, e não uma lista escrita à mão que envelhece quando alguém criar a próxima chave.
  const BKP_FORMATO = 'TWMGR-BACKUP-1';
  // A ÚNICA coisa que não viaja: o lock de aba única. Ele diz "tem uma aba agindo agora, com este
  // carimbo de tempo". Levar o lock do PC velho faz o PC novo achar que outra aba está trabalhando
  // e ficar parado esperando uma aba que não existe.
  function bkpExcluida(k) { return k === KEY + '_lock'; }

  function bkpColetar() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf('twMgr') !== 0 || bkpExcluida(k)) continue;
      out[k] = localStorage.getItem(k);
    }
    return out;
  }

  // Contagem do que importa, pra tela poder dizer o que está entrando ANTES de sobrescrever.
  // Backup é operação sem desfazer: o usuário tem que ver "142 ataques programados" e reconhecer
  // a própria conta antes de confirmar.
  function bkpResumo(chaves) {
    let c = null;
    try { c = JSON.parse(chaves[KEY] || 'null'); } catch (e) { c = null; }
    const n = (v) => (Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0));
    const linhas = [];
    if (!c) { linhas.push('⚠ a config principal não veio no arquivo'); return linhas; }
    if (c.cmd && c.cmd.fila) linhas.push(n(c.cmd.fila) + ' ataque(s) programado(s) na Central');
    if (c.targets) linhas.push(n(c.targets) + ' alvo(s) de Auto-ATK');
    if (c.noble && c.noble.alvos) linhas.push(n(c.noble.alvos) + ' alvo(s) no Noblar');
    if (c.build) linhas.push(n(c.build.templates) + ' modelo(s) de construção, ' + n(c.build.villages) + ' aldeia(s) avulsa(s)');
    if (c.recruit) linhas.push(n(c.recruit.templates) + ' modelo(s) de recrutamento');
    if (c.research) linhas.push(n(c.research.templates) + ' modelo(s) de pesquisa');
    if (c.cmd && c.cmd.modelos) linhas.push(n(c.cmd.modelos) + ' modelo(s) da Central');
    const fichas = (function () { try { return n(JSON.parse(chaves[KEY + '_alvos'] || '{}').aldeias); } catch (e) { return 0; } })();
    if (fichas) linhas.push(fichas + ' ficha(s) de alvo');
    linhas.push(Object.keys(chaves).length + ' chave(s) no total');
    return linhas;
  }

  function bkpNomeArquivo() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return 'twmgr-' + WORLD + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
  }

  function bkpExportar() {
    try {
      const chaves = bkpColetar();
      const env = {
        formato: BKP_FORMATO,
        versao: VERSION,
        mundo: WORLD,
        jogador: (window.game_data && game_data.player && game_data.player.name) || null,
        em: new Date().toISOString(),
        chaves: chaves,
      };
      const txt = JSON.stringify(env);
      // Arquivo, não área de transferência: a config passa de 1 MB numa conta rodada (só os caches
      // de mapa e de tropas dão ~1,1 MB), e colar isso à mão não é viável.
      const url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = bkpNomeArquivo();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      pushLog('Backup: exportado — ' + Object.keys(chaves).length + ' chave(s), '
        + Math.round(txt.length / 1024) + ' KB. ' + bkpResumo(chaves).slice(0, 3).join(' · '), 'ok', '');
    } catch (e) {
      pushLog('Backup: falhou ao exportar (' + (e.message || e) + ').', 'err', '');
      alert('Não consegui exportar: ' + (e.message || e));
    }
  }

  function bkpAplicar(env) {
    // Mundo diferente = config inútil e perigosa: ids de aldeia, coordenadas e alvos são todos
    // daquele mundo. Não bloqueia (o usuário pode ter migrado de propósito), mas o aviso é forte.
    if (env.mundo && env.mundo !== WORLD) {
      if (!confirm('⚠ ATENÇÃO: este backup é do mundo "' + env.mundo + '" e você está no "' + WORLD + '".\n\n'
        + 'Ids de aldeia, coordenadas e alvos são específicos do mundo — importar aqui provavelmente\n'
        + 'gera alvos inválidos e envios pra lugar nenhum.\n\nImportar mesmo assim?')) return false;
    }
    const chaves = env.chaves || {};
    const resumo = bkpResumo(chaves);
    if (!confirm('Importar este backup?\n\n'
      + 'Mundo: ' + (env.mundo || '?') + (env.jogador ? '  ·  Jogador: ' + env.jogador : '') + '\n'
      + 'Gerado em: ' + (env.em ? new Date(env.em).toLocaleString('pt-BR') : '?')
      + '  ·  versão ' + (env.versao || '?') + '\n\n'
      + resumo.join('\n') + '\n\n'
      + 'ISSO SUBSTITUI TODA a configuração deste navegador. Não tem desfazer —\n'
      + 'exporte a atual antes se quiser poder voltar.')) return false;
    // Apaga as chaves atuais ANTES de escrever: sem isso, config que existe aqui e não existe no
    // backup sobreviveria e se misturaria com a importada — o resultado não seria nem um nem outro.
    const apagar = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('twMgr') === 0 && !bkpExcluida(k)) apagar.push(k);
    }
    apagar.forEach((k) => localStorage.removeItem(k));
    let n = 0;
    try {
      Object.keys(chaves).forEach((k) => {
        if (bkpExcluida(k)) return;
        localStorage.setItem(k, chaves[k]);
        n++;
      });
    } catch (e) {
      alert('Falhou no meio da importação (' + (e.message || e) + ').\n\n'
        + 'O localStorage pode ter estourado a cota. A configuração ficou INCOMPLETA — '
        + 'importe de novo ou reinstale o script.');
      return false;
    }
    alert('Importado: ' + n + ' chave(s).\n\nA página vai recarregar pra tudo subir do zero.\n\n'
      + 'IMPORTANTE: não deixe os dois PCs rodando o script na mesma conta ao mesmo tempo — '
      + 'a trava de aba única é por navegador e não enxerga a outra máquina, então os dois '
      + 'agiriam em paralelo e dobrariam os envios.');
    location.reload();
    return true;
  }

  function bkpImportar() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        let env;
        try { env = JSON.parse(String(fr.result)); }
        catch (e) { alert('Esse arquivo não é um JSON válido.'); return; }
        if (!env || env.formato !== BKP_FORMATO || !env.chaves) {
          alert('Esse arquivo não é um backup do TW Manager (falta a marca "' + BKP_FORMATO + '").');
          return;
        }
        bkpAplicar(env);
      };
      fr.onerror = () => alert('Não consegui ler o arquivo.');
      fr.readAsText(f);
    });
    inp.click();
  }
