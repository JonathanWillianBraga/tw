  // ==================== CENTRO DE COMANDO — PAINEL: monta o HTML, injeta nas telas do jogo, e FECHA a ilha ====================
  // Parte da ILHA do Centro de Comando. A ilha e UMA IIFE aninhada que ABRE em
  // 171-cc-nucleo.js e FECHA em 178-cc-painel.js: nenhum arquivo do meio abre ou fecha chave
  // de IIFE. Todos partilham o mesmo escopo lexico, entao uma funcao daqui enxerga as dos
  // outros naturalmente — funcoes sao icadas, e os const/let de topo vivem no nucleo, que vem
  // primeiro justamente por isso.
  //
  // Cortado de 175-cc-rico.js (5297 linhas numa ilha so) na v11.224.0. O corte foi por NOME de
  // funcao, nao por comentario de secao: era comum uma funcao de uma aba morar fisicamente
  // dentro do bloco de outra (ccMassaEnviar vivia dentro da secao da Blindagem), que e
  // exatamente como "mexer numa aba quebrava a outra".

    function mountCmdCenter() {
      if (!config.cmd || !config.cmd.enabled) return;
      if (document.getElementById('cc-painel')) return;
      const host = document.querySelector('#content_value') || document.querySelector('#contentContainer') || document.body;
      const d = document.createElement('div');
      d.id = 'cc-painel';
      d.style.cssText = 'background:linear-gradient(180deg,#fdfaf5,#fffdfa);border:1px solid #e0d6c6;border-radius:10px;padding:10px;margin:0 0 12px;color:#8b5426;font-size:11px';
      const row = (l, inner, id) => '<div class="twmgr-row"' + (id ? ' id="' + id + '"' : '') + ' style="display:flex;align-items:center;gap:6px;margin:3px 0"><span style="min-width:120px;color:#6f6153">' + l + '</span>' + inner + '</div>';
      d.innerHTML =
        // O cabeçalho fica SEMPRE visível, mesmo minimizado — é o que permite reabrir. O
        // resto (tudo dentro de #cc-corpo) esconde/mostra junto do estado persistido.
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<span style="display:flex;align-items:center;gap:6px">' +
            '<span id="cc-min-tog" title="minimizar/restaurar — o estado fica salvo" style="cursor:pointer;color:#a2643a;font-size:12px;user-select:none">▾</span>' +
            '<b style="color:#a2643a;font-size:13px">🚀 Centro de Comando <span style="color:#8a7d6d;font-size:10px;font-weight:400">v' + VERSION + '</span></b>' +
          '</span>' +
          '<b id="cc-clock" style="color:#a2643a;font-size:16px;font-variant-numeric:tabular-nums">--:--:--.---</b>' +
        '</div>' +
        '<div id="cc-corpo">' +
        '<div id="cc-saude" style="font-size:10px;color:#6f6153;margin-bottom:4px"></div>' +
        '<div id="cc-silencio" style="font-size:10px;color:#a2643a;margin-bottom:4px;min-height:12px"></div>' +
        // Ajuste de precisão: o viés adaptativo (ccMedir) deveria corrigir sozinho, mas dá pra
        // forçar aqui. "Atrasar chegada" positivo = chega mais tarde (corrige quando sai adiantado).
        '<div style="font-size:10px;color:#8a7d6d;margin-bottom:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<span title="Se os comandos chegam ADIANTADOS, aumente. Se atrasados, use negativo. Some ao viés que o sistema mede sozinho.">Atrasar chegada <input id="cc-atraso" class="twmgr-inp" type="number" step="10" style="width:60px;font-size:10px;padding:1px">ms</span>' +
          '<span style="color:#584526">(+ = mais tarde)</span>' +
          '<span id="cc-vies" style="margin-left:auto"></span>' +
        '</div>' +
        // CALIBRACAO (177-cc-calibrar). Fica no topo, colada no ajuste de precisao, porque as
        // duas mexem no MESMO numero: o `Atrasar chegada` e a correcao manual, isto aqui e a
        // medida. Ver o vies ao lado do botao que o mede e o que impede o usuario de ficar
        // chutando o ajuste manual sem nunca ter medido nada.
        '<div style="font-size:10px;border:1px solid #e6dcc9;border-radius:6px;padding:6px;margin-bottom:8px;background:#fffdf8">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
            '<b style="color:#a2643a">🎯 Calibração do agendador</b>' +
            '<button id="cc-calib-go" class="twmgr-btn" style="font-size:10px;padding:1px 8px" ' +
              'title="Manda comandos REAIS (1 explorador numa bárbara), mede a chegada que o servidor carimbou e cancela cada um em seguida.">Calibrar agora</button>' +
            '<span style="color:#8a7d6d">amostras <input id="cc-calib-n" class="twmgr-inp" type="number" min="1" max="6" value="3" style="width:38px;font-size:10px;padding:1px"></span>' +
          '</div>' +
          '<div id="cc-calib-estado" style="margin-top:4px;line-height:1.45"></div>' +
          '<div id="cc-calib-msg" style="margin-top:3px;color:#6f6153"></div>' +
        '</div>' +
        row('Alvo',
          '<input id="cc-alvo" class="twmgr-inp" style="width:130px;font-variant-numeric:tabular-nums" placeholder="478|586">' +
          '<span id="cc-alvo-ok" style="font-size:10px;color:#8a7d6d"></span>', 'cc-row-alvo') +
        // A linha da chegada vive neste "slot" pra poder ser MOVIDA pro bloco do Fake (que não
        // tem campo próprio e usa este mesmo). Mover o elemento — em vez de duplicar — mantém
        // id, valor e listeners, então ccChegadaMs() segue funcionando de onde ele estiver.
        '<div id="cc-chegada-slot">' +
          row('Chegada (servidor)',
            '<input id="cc-chegada" class="twmgr-inp" type="datetime-local" step="0.001" style="width:230px">' +
            '<button id="cc-ch-agora" class="twmgr-btn twmgr-ghost" style="padding:2px 6px;font-size:10px" title="preenche com a hora do servidor + 10 min">+10min</button>' +
            '<button id="cc-ch-cmd" class="twmgr-btn twmgr-ghost" style="padding:2px 6px;font-size:10px" title="copiar o horário de um comando do jogo">📋 de um comando</button>', 'cc-row-chegada') +
        '</div>' +
        '<div id="cc-alvo-hist" style="font-size:10px;margin:2px 0 6px;line-height:1.8"></div>' +
        // Comandos do jogo: copiar horário pra coordenar em cima, ou escolher um pra snipar.
        '<div id="cc-cmds-box" style="display:none;border:1px solid #e0d6c6;border-radius:6px;padding:6px;margin:4px 0">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
            '<span style="font-size:10px">' +
              '<a id="cc-cmds-in" style="cursor:pointer;color:#a2643a">🛡 chegando em mim</a> · ' +
              '<a id="cc-cmds-out" style="cursor:pointer;color:#a2643a">⚔ meus em rota</a>' +
            '</span>' +
            '<span style="font-size:10px;color:#8a7d6d">deslocar ' +
              '<input id="cc-cmds-off" class="twmgr-inp" type="number" step="10" value="0" style="width:60px;font-size:10px;padding:1px">ms' +
              ' <a id="cc-cmds-fechar" style="cursor:pointer;color:#c0483a;margin-left:6px">✕</a></span>' +
          '</div>' +
          '<div id="cc-cmds-lista" style="height:220px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:6px"></div>' +
        '</div>' +
        // Abas em vez de rádios: cada tipo tem configuração própria, e a aba deixa claro
        // qual conjunto de campos está valendo.
        '<div id="cc-abas" style="display:flex;gap:2px;margin:8px 0 0">' +
          CC_TIPOS.map((t) =>
            '<div class="cc-aba" data-tipo="' + t.id + '" style="flex:1;text-align:center;padding:6px 4px;cursor:pointer;' +
            'border:1px solid #e0d6c6;border-bottom:none;border-radius:6px 6px 0 0;font-size:11px;user-select:none">' +
            t.ico + ' ' + t.rot + '</div>').join('') +
        '</div>' +
        '<div id="cc-aba-corpo" style="border:1px solid #e0d6c6;border-radius:0 6px 6px 6px;padding:8px;margin-bottom:8px">' +
          '<div id="cc-aba-hint" style="font-size:10px;color:#8a7d6d;margin-bottom:6px"></div>' +
        // Fake: dezenas de alvos de uma vez, com duas distribuições possíveis.
        '<div id="cc-fake-cfg" style="display:none">' +
          // Recebe a linha "Chegada (servidor)" movida pra cá enquanto o Fake está ativo.
          '<div id="cc-fake-chegada-slot"></div>' +
          '<div style="font-size:10px;color:#6f6153;margin:4px 0 2px">Alvos do fake (cole vários)</div>' +
          '<textarea id="cc-fake-alvos" class="twmgr-inp" style="width:100%;height:54px;font-size:10px" ' +
            'placeholder="478|586 479|587 480|588 …"></textarea>' +
          '<div style="font-size:10px;margin:3px 0">' +
            '<label style="margin-right:10px;cursor:pointer"><input type="radio" name="cc-fakedist" value="rodizio"> rodízio — 1 fake por alvo, alternando as origens</label><br>' +
            '<label style="cursor:pointer"><input type="radio" name="cc-fakedist" value="todos"> todas × todos — cada origem manda 1 fake pra cada alvo</label>' +
          '</div>' +
          '<div id="cc-fake-previa" style="font-size:10px;color:#a2643a;margin-bottom:4px"></div>' +
        '</div>' +
        // OPERAÇÃO: um alvo por vez (o alvo é o container). Dentro dele, as aldeias
        // participantes e uma LISTA ORDENADA de ondas com horário calibrável.
        '<div id="cc-op-cfg" style="display:none">' +
          '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:5px">' +
            // "Alvos" no plural de propósito: é o seletor de QUAL alvo você está montando, e
            // não pode se confundir com o passo "1. Alvo" logo abaixo, que edita os dados dele.
            '<span style="font-size:10px;color:#6f6153">Alvos</span>' +
            '<select id="cc-op-sel" class="twmgr-inp" style="width:170px;font-size:10px;padding:1px"></select>' +
            '<button id="cc-op-novo" class="twmgr-btn twmgr-ghost" style="padding:2px 8px;font-size:10px">+ novo alvo</button>' +
            '<button id="cc-op-del" class="twmgr-btn twmgr-ghost" style="padding:2px 8px;font-size:10px" title="remove este alvo e as ondas dele">✕</button>' +
          '</div>' +
          // Trilha das etapas. Clicar num passo já liberado volta/avança direto.
          '<div id="cc-op-passos" style="display:flex;align-items:center;gap:2px;font-size:10px;margin-bottom:7px"></div>' +
          // ---- Etapa 1: o alvo ----
          '<div id="cc-op-e1">' +
            '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:4px">' +
              '<span style="font-size:10px;color:#6f6153">Coordenada</span>' +
              '<input id="cc-op-coord" class="twmgr-inp" style="width:96px;font-size:10px;padding:2px">' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:4px">' +
              '<span style="font-size:10px;color:#6f6153">Chega a 1ª onda</span>' +
              '<input id="cc-op-chegada" class="twmgr-inp" type="datetime-local" step="0.001" style="width:200px;font-size:10px;padding:1px">' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:4px">' +
              '<span style="font-size:10px;color:#6f6153">Gap</span>' +
              '<input id="cc-op-gap" class="twmgr-inp" type="number" min="50" step="10" style="width:60px;font-size:10px;padding:1px">' +
              '<span style="font-size:10px;color:#8a7d6d">ms — só entre ondas da MESMA aldeia</span>' +
            '</div>' +
          '</div>' +
          // ---- Etapa 2: as origens ----
          '<div id="cc-op-e2" style="display:none">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
              '<span style="font-size:9px;color:#6f6153">Marque as aldeias que vão participar <span style="color:#8a7d6d">(mais perto primeiro)</span></span>' +
              '<span style="font-size:9px;color:#6f6153">grupo ' +
                '<select id="cc-op-grupo" class="twmgr-inp" style="width:110px;font-size:9px;padding:1px"><option value="">todas</option></select></span>' +
            '</div>' +
            '<div id="cc-op-vilas" style="height:300px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:6px;margin-bottom:4px"></div>' +
            '<div style="font-size:9px;color:#8a7d6d">Cada aldeia marcada já entra com 1 onda. Use <b>+ onda</b> pra ela mandar mais de um comando.</div>' +
          '</div>' +
          // ---- Etapa 3: as tropas ----
          '<div id="cc-op-e3" style="display:none">' +
            '<label class="twmgr-check" style="font-size:10px;margin-bottom:5px" title="Ondas de ATAQUE da mesma aldeia saem num POST só, pelo recurso nativo &quot;ataque adicional&quot; do jogo. O jogo aloca as N ondas de uma vez, então some a disputa por tropa entre elas (a causa real de onda recusada num NT) e o espaçamento vira o mínimo do servidor. Em troca, o horário individual de cada onda do trem deixa de ser controlável — elas saem juntas.">' +
              '<input id="cc-op-trem" type="checkbox"> Trem: agrupar ondas da mesma aldeia num envio só <span style="color:#8a7d6d">(NT)</span></label>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
              '<span style="font-size:9px;color:#6f6153">Ondas <span style="color:#8a7d6d">(ordem de chegada)</span></span>' +
              '<span style="font-size:9px"><a id="cc-op-tudo-geral" style="cursor:pointer;color:#2e7d3a">🧺 tudo (todas as ondas)</a> · ' +
                '<a id="cc-op-limpar" style="cursor:pointer;color:#c0483a">limpar ondas</a></span>' +
            '</div>' +
            // Por coluna de unidade — igual ao "apoio em massa" do próprio jogo: marcar preenche
            // aquela tropa com o máximo disponível em TODAS as ondas de uma vez.
            '<div id="cc-op-tudo-cols" style="display:flex;flex-wrap:wrap;gap:8px;font-size:9px;color:#6f6153;padding:3px 5px;background:#fbf7ee;border:1px solid #ece4d8;border-radius:6px 6px 0 0"></div>' +
            '<div id="cc-op-ondas" style="height:380px;min-height:100px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:0 0 6px 6px"></div>' +
            '<div id="cc-op-resumo" style="font-size:10px;color:#6f6153;margin-top:4px"></div>' +
          '</div>' +
          '<div id="cc-op-nav" style="display:flex;align-items:center;gap:6px;margin-top:8px"></div>' +
        '</div>' +
          // Apoio em massa: aparece só quando a aba 🚚 está ativa. Usa as origens marcadas abaixo.
          // ATAQUE EM MASSA: fluxo proprio de 5 campos, sem etapas.
          '<div id="cc-atkm-cfg" style="display:none">' +
            '<div style="font-size:10px;color:#6f6153;margin-bottom:2px"><b>1.</b> Aldeias do alvo</div>' +
            '<textarea id="cc-atkm-alvos" class="twmgr-inp" style="width:100%;height:48px;font-size:10px" placeholder="454|598 465|597 468|595 …"></textarea>' +
            '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:5px">' +
              '<span style="font-size:10px;color:#6f6153"><b>2.</b> Origens</span>' +
              '<select id="cc-atkm-grupo" class="twmgr-inp" style="width:130px;font-size:10px;padding:1px"><option value="">todas</option></select>' +
              '<span id="cc-atkm-pool" style="font-size:10px;color:#8a7d6d"></span>' +
              '<span style="font-size:10px;color:#6f6153;margin-left:6px"><b>3.</b> Chegada</span>' +
              '<input id="cc-atkm-chegada" class="twmgr-inp" type="datetime-local" step="0.001" style="width:190px;font-size:10px;padding:1px">' +
            '</div>' +
            '<div style="font-size:10px;color:#6f6153;margin:6px 0 2px"><b>4.</b> Tropa de cada ataque <span style="color:#8a7d6d">(numero ou a palavra <b>tudo</b>)</span></div>' +
            '<div id="cc-atkm-tropas" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"></div>' +
            '<button id="cc-atkm-calc" class="twmgr-btn twmgr-go" style="padding:3px 12px;font-size:10px;margin-top:6px">Calcular distribuicao</button>' +
            '<div id="cc-atkm-aviso" style="font-size:10px;color:#a2643a;margin-top:5px"></div>' +
            '<div id="cc-atkm-tabela" style="height:260px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:6px;margin-top:4px"></div>' +
            '<button id="cc-atkm-validar" class="twmgr-btn twmgr-go" style="width:100%;margin-top:6px;display:none"></button>' +
          '</div>' +
          '<div id="cc-massa-cfg" style="display:none">' +
            '<label style="font-size:10px;display:block">Alvo(s) <span style="color:#584526">(um por linha)</span></label>' +
            '<textarea id="cc-massa-alvos" class="twmgr-inp" style="width:100%;height:36px;font-size:10px" placeholder="500|600"></textarea>' +
            '<label style="font-size:10px;display:block;margin-top:3px;cursor:pointer"><input type="checkbox" id="cc-massa-dividir"> dividir as tropas entre os alvos (senão manda o cheio pra cada)</label>' +
            '<div style="font-size:9px;color:#8a7d6d;margin:4px 0 2px">Tropas por aldeia — número, <b>50%</b> ou <b>tudo</b>:</div>' +
            '<div id="cc-massa-unidades" style="display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 6px"></div>' +
            '<button id="cc-massa-enviar" class="twmgr-btn twmgr-go" style="width:100%">🚚 Enviar apoio agora</button>' +
            '' +
            '<div id="cc-massa-msg" style="font-size:10px;margin-top:5px;min-height:12px"></div>' +
            '<div id="cc-massa-rel" style="font-size:10px;margin-top:4px;color:#6f6153;font-family:Consolas,monospace;white-space:pre-wrap;height:200px;min-height:60px;resize:vertical;overflow-y:auto"></div>' +
          '</div>' +
          // Blindagem da tribo: aparece só na aba 🛡. Usa as origens marcadas embaixo, igual à massa.
          '<div id="cc-blz-cfg" style="display:none">' +
            '<div style="font-size:10px;color:#6f6153;margin:4px 0 2px">Tópico da tribo</div>' +
            '<div style="display:flex;gap:4px">' +
              '<input id="cc-blz-url" class="twmgr-inp" style="flex:1;font-size:10px" placeholder="cole aqui a URL do tópico de blindagens">' +
              '<button id="cc-blz-buscar" class="twmgr-btn twmgr-ghost" style="padding:4px 10px">Buscar</button>' +
            '</div>' +
            '<div style="font-size:10px;color:#6f6153;margin:7px 0 2px">Reserva de casa ' +
              '<span style="color:#8a7d6d;font-weight:400">— o que NUNCA sai, por aldeia</span></div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-bottom:3px">A divisão usa a <b>fonte de tropa</b> escolhida na lista de Origens, abaixo. Em <b>"suas próprias"</b> ela conta o que está fora e voltando — esse pedaço só sai depois que a tropa pousar em casa.</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
              BLZ_UNITS.map((u) => '<label title="' + BLZ_ROT[u] + '" style="display:flex;align-items:center;gap:3px;font-size:10px">' +
                unitIcon(u, BLZ_ROT[u]) +
                '<input id="cc-blz-res-' + u + '" class="twmgr-inp" type="number" min="0" style="width:62px;font-size:10px;padding:1px" placeholder="0"></label>').join('') +
            '</div>' +
            '<div style="font-size:10px;color:#6f6153;margin:7px 0 2px">Cada aldeia entrega no máximo ' +
              '<span style="color:#8a7d6d;font-weight:400">— deixe vazio pra não limitar</span></div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
              BLZ_UNITS.map((u) => '<label title="' + BLZ_ROT[u] + '" style="display:flex;align-items:center;gap:3px;font-size:10px">' +
                unitIcon(u, BLZ_ROT[u]) +
                '<input id="cc-blz-pa-' + u + '" class="twmgr-inp" type="number" min="0" style="width:62px;font-size:10px;padding:1px" placeholder="tudo"></label>').join('') +
            '</div>' +
            '<div style="font-size:9px;color:#8a7d6d;margin-top:2px">É o teto da RODADA por aldeia, repartido entre os pedidos marcados — não é por pedido.</div>' +
            '<div id="cc-blz-lista" style="margin-top:7px;max-height:240px;overflow-y:auto;background:#fff;border:1px solid #ece4d8;border-radius:6px;padding:5px"></div>' +
            '<div style="display:flex;gap:4px;margin-top:6px">' +
              '<button id="cc-blz-sugerir" class="twmgr-btn twmgr-ghost" style="flex:1" title="distribui a defesa das origens marcadas entre os pedidos, do mais perto pro mais longe">✨ Sugerir divisão</button>' +
              '<button id="cc-blz-limpar" class="twmgr-btn twmgr-ghost" style="padding:4px 10px" title="zera a divisão e as linhas do fórum, pra começar uma rodada nova. Não cancela o apoio que já saiu — isso só no jogo.">🧹</button>' +
            '</div>' +
            '<button id="cc-blz-enviar" class="twmgr-btn twmgr-go" style="width:100%;margin-top:4px">🛡 Enviar apoio agora</button>' +
            '<div id="cc-blz-msg" style="font-size:10px;margin-top:5px;min-height:12px"></div>' +
            '<div style="font-size:10px;color:#6f6153;margin:6px 0 2px">Linhas pro fórum ' +
              '<span style="color:#8a7d6d;font-weight:400">— pedido/lanceiro/espadachim/0/cav.pesada/0</span></div>' +
            '<textarea id="cc-blz-texto" class="twmgr-inp" readonly style="width:100%;height:70px;font-size:10px;font-family:Consolas,monospace"></textarea>' +
            '<button id="cc-blz-copiar" class="twmgr-btn twmgr-ghost" style="width:100%;margin-top:3px">📋 Copiar linhas</button>' +
          '</div>' +
        '</div>' +   // fim de #cc-aba-corpo
        // Tropas digitadas AQUI, não nas caixas do jogo. "tudo" = manda o estoque inteiro daquela origem.
        '<div id="cc-tropas-sec" style="margin:8px 0 4px;border-top:1px solid #ece4d8;padding-top:6px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
            '<span data-sec="tropas" style="font-size:10px;color:#8b5426;font-weight:600;cursor:pointer" title="recolher/expandir">▾ Tropas por origem</span>' +
            '<span style="font-size:10px">' +
              '<a id="cc-tpl-salvar" style="cursor:pointer;color:#2e7d3a">+ salvar como modelo</a> · ' +
              '<a id="cc-tpl-limpar" style="cursor:pointer;color:#a2643a">limpar</a> · ' +
              '<a id="cc-tpl-restaurar" style="cursor:pointer;color:#8a7d6d" title="repõe Tudo/Nobre/Fake">padrão</a>' +
            '</span>' +
          '</div>' +
          '<div data-secbody="tropas">' +
          '<div id="cc-modelos" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px"></div>' +
          // Montada em ccRenderTropas() a partir das unidades que ESTE mundo tem — a lista fixa
          // de 12 mostrava arqueiro e arqueiro a cavalo em mundos que não os têm.
          '<div id="cc-tropas-grade" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:6px"></div>' +
          '</div>' +
        '</div>' +
        // Origens: cada aldeia com distância e tempo já calculados pela unidade mais lenta.
        '<div id="cc-origens-sec" style="margin:8px 0 4px;border-top:1px solid #ece4d8;padding-top:6px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">' +
            '<span data-sec="origens" style="font-size:10px;color:#8b5426;font-weight:600;cursor:pointer" title="recolher/expandir">▾ Origens</span>' +
            '<span style="font-size:10px">' +
              '<a id="cc-org-todas" style="cursor:pointer;color:#a2643a">todas</a> · ' +
              '<a id="cc-org-nenhuma" style="cursor:pointer;color:#a2643a">nenhuma</a> · ' +
              '<a id="cc-org-viaveis" style="cursor:pointer;color:#2e7d3a" title="marca só as aldeias que têm a tropa pedida E ainda dão tempo de chegar">✓ só as viáveis</a> · ' +
              '<a id="cc-org-recarregar" style="cursor:pointer;color:#a2643a">↻</a>' +
            '</span>' +
          '</div>' +
          // "total" conta a tropa que está fora e volta — necessário pra agendar um full
          // pra daqui a horas com a tropa saqueando agora.
          '<div data-secbody="origens">' +
          '<div style="font-size:10px;margin-bottom:3px">' +
            '<label style="margin-right:10px;cursor:pointer" title="linha &quot;Na Aldeia&quot; do jogo"><input type="radio" name="cc-fonte" value="casa"> na aldeia agora</label>' +
            '<label style="cursor:pointer" title="linha &quot;suas próprias&quot; do jogo: inclui o que está fora e em trânsito"><input type="radio" name="cc-fonte" value="total"> suas próprias (inclui fora/trânsito)</label>' +
          '</div>' +
          '<div style="font-size:10px;margin-bottom:5px;display:flex;align-items:center;gap:6px">' +
            '<span style="color:#6f6153">Grupo</span>' +
            '<select id="cc-org-grupo" class="twmgr-inp" style="width:170px;font-size:10px;padding:1px 4px"><option value="">Todas as aldeias</option></select>' +
          '</div>' +
          '<div id="cc-vel-aviso" style="font-size:10px;color:#8a7d6d;margin-bottom:3px"></div>' +
          '<div style="display:grid;grid-template-columns:18px 128px 40px 58px 40px 1fr;gap:6px;font-size:9px;color:#8a7d6d;padding:0 5px 2px">' +
            '<span></span><span>aldeia</span><span>dist.</span><span>viagem</span><span>mais lenta</span><span>saída</span></div>' +
          '<div id="cc-origens" style="height:240px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:6px"></div>' +
          '<div id="cc-origens-soma" style="font-size:10px;color:#6f6153;margin-top:3px"></div>' +
          '<div id="cc-resumo" style="font-size:10px;color:#6f6153;margin-top:3px"></div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:10px;color:#6f6153;margin-bottom:5px">' +
          '<label style="cursor:pointer" title="Na hora de preparar, se a origem tiver menos tropa do que foi pedido, manda o que tiver em vez de falhar. Cada comando na Fila pode sobrescrever isto individualmente.">' +
            '<input id="cc-parcial" type="checkbox"> enviar mesmo com tropa insuficiente (usa o que tiver disponível)</label>' +
        '</div>' +
        '<div id="cc-armar-row" style="display:flex;gap:6px;align-items:center">' +
          '<button id="cc-prever" class="twmgr-btn twmgr-ghost" style="padding:5px 10px" title="roda o mesmo cálculo do Armar, mas sem entrar na fila — mostra origem, tropas, saída e chegada">👁 Prever</button>' +
          '<button id="cc-armar" class="twmgr-btn twmgr-go" style="flex:1">▶ Armar comando</button>' +
          '<button id="cc-diag" class="twmgr-btn twmgr-ghost" title="copia um relatório do estado interno pra área de transferência">🐛</button>' +
        '</div>' +
        // Vale pra Ataque, Apoio, Fake e Operação: ignora o campo de chegada e manda sair já.
        '<label id="cc-ja-row" style="display:flex;align-items:center;gap:5px;font-size:10px;color:#6f6153;margin-top:5px;cursor:pointer" ' +
          'title="Ignora o horário de chegada: cada origem sai agora e chega quando chegar. O motor ainda prepara o comando ' + '~' + '60s antes, então a saída real é daqui a pouco, não instantânea.">' +
          '<input type="checkbox" id="cc-ja"> sair o quanto antes <span style="color:#8a7d6d">(ignora o horário de chegada)</span></label>' +
        '<div id="cc-msg" style="font-size:10px;margin-top:5px;min-height:12px"></div>' +
        '<div id="cc-previa" style="font-size:10px;margin-top:4px;max-height:220px;overflow-y:auto"></div>' +
        '<div id="cc-teste-out" style="font-size:10px;margin-top:3px"></div>' +
        '<div style="margin-top:8px;border-top:1px solid #ece4d8;padding-top:6px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">' +
            '<span data-sec="fila" style="font-size:10px;color:#8b5426;font-weight:600;cursor:pointer" title="recolher/expandir">▾ Fila <span id="cc-fila-n" style="color:#8a7d6d;font-weight:400"></span></span>' +
            '<span style="font-size:10px;color:#8a7d6d">' +
              // Limpar mora aqui, e não na linha do Armar: aquela linha some fora da última etapa
              // da Operação, e o botão ia junto — mas limpar a fila não tem nada a ver com armar.
              '<a id="cc-trem-agrupar" style="cursor:pointer;color:#2e7d3a;display:none;text-decoration:none;margin-right:6px"></a>' +
              '<a id="cc-limpar" style="cursor:pointer;color:#a2643a;text-decoration:none" title="remove enviados/erros da lista">🧹 limpar</a>' +
            '</span>' +
          '</div>' +
          // Filtros da fila numa linha só, pra caber alvo + tipo + ordem + passo.
          '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;font-size:10px;color:#8a7d6d;margin-bottom:3px">' +
              '<input id="cc-fila-alvo" class="twmgr-inp" placeholder="filtrar alvo (coord ou nome)" ' +
                'style="flex:1;min-width:130px;font-size:10px;padding:2px 5px" title="filtra pela coordenada OU pelo nome da aldeia alvo">' +
              '<select id="cc-fila-tipo" class="twmgr-inp" style="width:auto;font-size:10px;padding:1px" title="mostra só um tipo na fila">' +
                '<option value="">todos os tipos</option><option value="ataque">⚔ ataque</option>' +
                '<option value="apoio">🛡 apoio</option><option value="fake">🎭 fake</option><option value="nobre">👑 nobre</option></select>' +
              ' ordenar por ' +
              '<select id="cc-fila-ordem" class="twmgr-inp" style="width:auto;font-size:10px;padding:1px">' +
                '<option value="chegada">chegada</option><option value="saida">saída</option></select>' +
              ' · passo <input id="cc-passo" class="twmgr-inp" type="number" min="1" step="10" style="width:52px;font-size:10px;padding:1px">ms' +
          '</div>' +
          '<div data-secbody="fila">' +
            '<div style="display:flex;gap:2px;margin-bottom:0">' +
              '<span class="cc-ftab" data-ftab="envio" style="flex:1;text-align:center;padding:4px;cursor:pointer;font-size:10px;border:1px solid #e0d6c6;border-bottom:none;border-radius:4px 4px 0 0">▸ A enviar <span id="cc-ftab-n-envio" style="color:#8a7d6d"></span></span>' +
              '<span class="cc-ftab" data-ftab="enviados" style="flex:1;text-align:center;padding:4px;cursor:pointer;font-size:10px;border:1px solid #e0d6c6;border-bottom:none;border-radius:4px 4px 0 0">✓ Enviados <span id="cc-ftab-n-enviados" style="color:#8a7d6d"></span></span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:42px 108px 108px 1fr 78px 78px 56px 18px;gap:4px;font-size:9px;color:#8a7d6d;padding:3px 5px 2px;border:1px solid #ece4d8;border-bottom:none">' +
              '<span>tipo</span><span>de</span><span>para</span><span>estado</span><span>sai</span><span>chegada</span><span>falta</span><span></span></div>' +
            '<div id="cc-fila-envio" style="height:260px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:0 0 6px 6px"></div>' +
            '<div id="cc-fila-enviados" style="display:none;height:260px;min-height:80px;resize:vertical;overflow-y:auto;background:#ffffff;border:1px solid #ece4d8;border-radius:0 0 6px 6px"></div>' +
          '</div>' +
        '</div>' +
        '</div>';   // fecha #cc-corpo
      host.insertBefore(d, host.firstChild);
      // Minimizado fica salvo em config.cmd (localStorage) — sobrevive a navegar dentro da
      // praça (Tropas, Coletando...) e a F5, exatamente como o resto do estado da Central.
      const ccAplicarMin = () => {
        const corpo = document.getElementById('cc-corpo'), tog = document.getElementById('cc-min-tog');
        const min = !!config.cmd.painelMin;
        if (corpo) corpo.style.display = min ? 'none' : '';
        if (tog) tog.textContent = min ? '▸' : '▾';
        d.style.marginBottom = min ? '6px' : '12px';
      };
      document.getElementById('cc-min-tog').addEventListener('click', () => {
        config.cmd.painelMin = !config.cmd.painelMin; save(); ccAplicarMin();
      });
      ccAplicarMin();
      // keepAwake PRECISA ser chamado sincronamente dentro do gesto, antes de qualquer await,
      // senão o AudioContext fica 'suspended' e o antichoke não vale nada.
      document.getElementById('cc-armar').addEventListener('click', () => { keepAwake(true); ccArmar(); });
      document.getElementById('cc-prever').addEventListener('click', ccPrever);
      {
        const ja = document.getElementById('cc-ja');
        if (ja) {
          ja.checked = !!config.cmd.saidaJa;
          ja.addEventListener('change', () => {
            config.cmd.saidaJa = !!ja.checked; save();
            // O campo de chegada perde a função quando o modo está ligado — apaga em vez de
            // deixar um horário lá que não vale mais nada.
            const rc = document.getElementById('cc-row-chegada');
            if (rc) rc.style.opacity = ja.checked ? '.45' : '1';
            const box = document.getElementById('cc-previa'); if (box) box.innerHTML = '';
          });
          const rc = document.getElementById('cc-row-chegada');
          if (rc) rc.style.opacity = ja.checked ? '.45' : '1';
        }
      }
      document.getElementById('cc-limpar').addEventListener('click', cmdLimpar);
      document.getElementById('cc-diag').addEventListener('click', ccDiagnostico);
      // Apoio em massa
      document.getElementById('cc-massa-enviar').addEventListener('click', () => { keepAwake(true); ccMassaEnviar(); });
      // Blindagem
      document.getElementById('cc-blz-buscar').addEventListener('click', async () => {
        const m = document.getElementById('cc-blz-msg');
        if (m) { m.style.color = '#6f6153'; m.textContent = 'lendo o tópico…'; }
        try {
          const r = await ccBlzBuscar();
          if (m) { m.style.color = '#2e7d3a';
            m.textContent = r.pedidos.length + ' pedido(s) e ' + r.entregas.length + ' entrega(s) lidos.'; }
        } catch (e) {
          if (m) { m.style.color = '#c0483a'; m.textContent = 'não deu: ' + (e.message || e); }
        }
        ccBlzRender();
      });
      document.getElementById('cc-blz-sugerir').addEventListener('click', () => {
        const m = document.getElementById('cc-blz-msg');
        const r = ccBlzSugerir();
        if (m) {
          if (r.erro) { m.style.color = '#c0483a'; m.textContent = r.erro; }
          else if (!r.alocado) { m.style.color = '#a2643a'; m.textContent = 'nada a alocar — ou os pedidos já estão cobertos, ou a reserva de casa consome tudo.'; }
          else { m.style.color = '#2e7d3a';
            m.textContent = fmtN(r.alocado) + ' unidade(s) distribuídas em ' + r.envios + ' envio(s). Confira e clique em Enviar.'; }
        }
        ccBlzRender();
      });
      document.getElementById('cc-blz-limpar').addEventListener('click', () => {
        // Antes isto preservava as linhas JÁ ENVIADAS no plano, pra não perder o registro. Só que
        // o texto do fórum é montado a partir do plano — então limpar não limpava a caixa de
        // texto, que era o que se queria limpar. Agora zera a rodada inteira: plano e marcas de
        // enviado juntos. Zerar as duas é seguro (sem plano não há o que reenviar); zerar só as
        // marcas é que reabriria a porta pro envio dobrado.
        const b = config.cmd.blz;
        let jaSaiu = 0;
        Object.keys(b.enviados).forEach((n) => { jaSaiu += Object.keys(b.enviados[n] || {}).length; });
        if (jaSaiu && !confirm('Isto apaga a divisão E as linhas do fórum de ' + jaSaiu
            + ' apoio(s) que JÁ SAÍRAM. Copie as linhas antes se ainda não postou.\n\nLimpar mesmo assim?')) return;
        b.plano = {}; b.enviados = {};
        save(); ccBlzRender();
        const m = document.getElementById('cc-blz-msg');
        if (m) { m.style.color = '#6f6153'; m.textContent = 'divisão limpa — pode sugerir de novo.'; }
      });
      document.getElementById('cc-blz-enviar').addEventListener('click', () => { keepAwake(true); ccBlzEnviar(); });
      document.getElementById('cc-blz-copiar').addEventListener('click', async () => {
        const t = document.getElementById('cc-blz-texto'), m = document.getElementById('cc-blz-msg');
        try { await navigator.clipboard.writeText(t.value || ''); if (m) { m.style.color = '#2e7d3a'; m.textContent = 'linhas copiadas.'; } }
        catch (e) { t.select(); if (m) { m.style.color = '#a2643a'; m.textContent = 'não consegui copiar — o texto está selecionado, use Ctrl+C.'; } }
      });
      BLZ_UNITS.forEach((u) => {
        const el = document.getElementById('cc-blz-res-' + u);
        if (el) el.addEventListener('change', () => {
          config.cmd.blz.reserva[u] = Math.max(0, parseInt(el.value, 10) || 0); save();
        });
        const pa = document.getElementById('cc-blz-pa-' + u);
        if (pa) pa.addEventListener('change', () => {
          config.cmd.blz.porAldeia[u] = (pa.value || '').trim(); save();
        });
      });
      ccMassaUnidades();
      // ---- Operação ----
      document.getElementById('cc-op-sel').addEventListener('change', (e) => {
        ccOpCfg().ativo = e.target.value; save(); ccOpRender();
      });
      document.getElementById('cc-op-novo').onclick = ccOpAlvoNovo;
      document.getElementById('cc-op-del').onclick = ccOpAlvoDel;
      document.getElementById('cc-op-grupo').addEventListener('change', (e) => {
        ccOpCfg().grupo = e.target.value; save(); ccOpAplicarFiltroGrupo();
      });
      ccOpCarregarGrupos();
      // ---- Ataque em massa ----
      const aC = document.getElementById('cc-atkm-calc');
      if (aC) aC.addEventListener('click', ccAtkmCalcular);
      const aV = document.getElementById('cc-atkm-validar');
      if (aV) aV.addEventListener('click', () => { keepAwake(true); ccAtkmValidar(); });
      const aCh = document.getElementById('cc-atkm-chegada');
      if (aCh) aCh.addEventListener('change', ccAtkmTabela);
      const aAl = document.getElementById('cc-atkm-alvos');
      if (aAl) aAl.addEventListener('input', () => { ccAtkmTabela(); });
      const aG = document.getElementById('cc-atkm-grupo');
      if (aG) aG.addEventListener('change', async (e) => {
        _ccAtkmGrupoSet = null;
        if (e.target.value) {
          try { _ccAtkmGrupoSet = new Set((await getVillagesInGroup(e.target.value)).map((v) => String(v.vid))); }
          catch (err) { pushLog('Ataque em massa: nao li o grupo (' + (err.message || err) + ') — usando todas.', 'err', 'cmd'); }
        }
        const el = document.getElementById('cc-atkm-pool');
        if (el) el.textContent = ccAtkmPool().length + ' aldeia(s)';
      });
      // ---- Plano em massa ----
      ccPontosCarregar();   // pontos das aldeias: alimentam o piso de população na conferência
      document.getElementById('cc-op-coord').addEventListener('change', (e) => {
        const a = ccOpAtivo(); if (!a) return;
        const p = ccCoordParse(e.target.value);
        a.coord = p ? p.coord : ''; save(); ccOpRender();
      });
      document.getElementById('cc-op-chegada').addEventListener('change', (e) => {
        const a = ccOpAtivo(); if (!a) return;
        a.chegadaLocal = e.target.value; save(); ccOpRender();
      });
      document.getElementById('cc-op-gap').addEventListener('change', (e) => {
        ccOpCfg().gapMs = Math.max(50, parseInt(e.target.value, 10) || 100); save(); ccOpRender();
      });
      document.getElementById('cc-op-limpar').onclick = () => {
        const a = ccOpAtivo(); if (!a) return;
        a.ondas = []; save(); ccOpRender();
      };
      document.getElementById('cc-op-tudo-geral').onclick = (ev) => {
        ev.preventDefault();
        const a = ccOpAtivo(); if (a) ccOpAplicarTudo(a);
      };
      document.getElementById('cc-op-trem').addEventListener('change', (e) => {
        const a = ccOpAtivo(); if (!a) return;
        a.trem = e.target.checked; save(); ccOpRender();
      });
      const ordEl = document.getElementById('cc-fila-ordem');
      ordEl.value = config.cmd.filaOrdem || 'chegada';
      ordEl.addEventListener('change', () => { config.cmd.filaOrdem = ordEl.value; save(); ccRender(); });
      const tipoEl = document.getElementById('cc-fila-tipo');
      tipoEl.value = config.cmd.filaTipoFiltro || '';
      tipoEl.addEventListener('change', () => { config.cmd.filaTipoFiltro = tipoEl.value; save(); ccRender(); });
      const alvoFEl = document.getElementById('cc-fila-alvo');
      alvoFEl.value = config.cmd.filaAlvoFiltro || '';
      // 'input' e não 'change': filtrar tem que responder enquanto se digita. O guarda de foco
      // do ccRender impede que o redesenho de 1s roube o cursor no meio.
      alvoFEl.addEventListener('input', () => { config.cmd.filaAlvoFiltro = alvoFEl.value; save(); ccRender(); });
      const parcialEl = document.getElementById('cc-parcial');
      parcialEl.checked = !!config.cmd.enviarParcial;
      parcialEl.addEventListener('change', () => { config.cmd.enviarParcial = parcialEl.checked; save(); ccRender(); });
      document.querySelectorAll('.cc-ftab').forEach((el) => el.addEventListener('click', () => ccFilaTab(el.getAttribute('data-ftab'))));
      ccFilaTab();
      const passoEl = document.getElementById('cc-passo');
      passoEl.value = config.cmd.passoMs || 50;
      passoEl.addEventListener('change', () => {
        config.cmd.passoMs = Math.max(1, parseInt(passoEl.value, 10) || 50); save(); ccRender();
      });
      // Calibração: mede o lead de verdade (ver 177-cc-calibrar). `keepAwake` porque a rodada
      // dura minutos e o navegador estrangula timer de aba escondida — sem isso a medição sai
      // contaminada por contenção de thread, que é justamente o que ela NÃO quer medir.
      const calibGo = document.getElementById('cc-calib-go');
      if (calibGo) calibGo.addEventListener('click', () => {
        const nEl = document.getElementById('cc-calib-n');
        keepAwake(true);
        ccCalibIniciar(parseInt(nEl && nEl.value, 10) || 3);
      });
      ccCalibRender();
      // Ajuste manual de saída. O campo é "atrasar chegada" (intuitivo): positivo = chega mais
      // tarde, então guardo o NEGATIVO em ajusteMs (que soma ao lead = adianta a saída).
      const atrasoEl = document.getElementById('cc-atraso');
      atrasoEl.value = -(config.cmd.ajusteMs || 0);
      atrasoEl.addEventListener('change', () => {
        config.cmd.ajusteMs = -(parseInt(atrasoEl.value, 10) || 0);
        cmdFila().forEach((c) => { if (c.durMs != null && ccEditavel(c)) cmdRecalc(c); });
        save(); ccRender();
      });
      // Mostra os campos do trem só quando o tipo é trem, e avisa quando o intervalo pedido
      // fica abaixo do jitter medido — aí a ORDEM das ondas vira sorteio.
      const attTrem = () => {
        const tipo = ccTipo();
        const def = CC_TIPOS.find((t) => t.id === tipo) || CC_TIPOS[0];
        // Aba ativa: só ela fica acesa e emendada no corpo.
        document.querySelectorAll('.cc-aba').forEach((el) => {
          const on = el.getAttribute('data-tipo') === tipo;
          el.style.background = on ? 'linear-gradient(180deg,#ece4d8,#fdfaf5)' : '#ffffff';
          el.style.color = on ? '#a2643a' : '#8a7d6d';
          el.style.borderBottom = on ? '1px solid #fdfaf5' : '1px solid #e0d6c6';
          el.style.marginBottom = on ? '-1px' : '0';
          el.style.fontWeight = on ? '600' : '400';
        });
        const hint = document.getElementById('cc-aba-hint');
        if (hint) hint.textContent = def.hint;
        const fk = document.getElementById('cc-fake-cfg');
        if (fk) fk.style.display = (tipo === 'fake') ? 'block' : 'none';
        // Operação e Apoio em massa têm UI própria: ambas escondem a grade de tropas global.
        // A Operação esconde também a lista de Origens (ela tem a sua, por alvo).
        // A Blindagem se comporta como a massa: tem UI própria, dispara na hora (nada de armar) e
        // reaproveita a lista de Origens de baixo pra saber de quais aldeias pode tirar defesa.
        const massa = (tipo === 'massa'), op = (tipo === 'op'), blz = (tipo === 'blz');
        // Ataque em massa tem UI propria e completa: esconde tropas, origens, alvo unico,
        // chegada e o botao Armar. Nada de fora dele participa.
        const atkm = (tipo === 'atkm');
        const acfg = document.getElementById('cc-atkm-cfg');
        if (acfg) acfg.style.display = atkm ? 'block' : 'none';
        if (atkm) { ccAtkmTropasRender(); ccAtkmTabela(); }
        const mcfg = document.getElementById('cc-massa-cfg'); if (mcfg) mcfg.style.display = massa ? 'block' : 'none';
        const ocfg = document.getElementById('cc-op-cfg'); if (ocfg) ocfg.style.display = op ? 'block' : 'none';
        const bcfg = document.getElementById('cc-blz-cfg'); if (bcfg) bcfg.style.display = blz ? 'block' : 'none';
        if (blz) ccBlzRender();
        const tsec = document.getElementById('cc-tropas-sec'); if (tsec) tsec.style.display = (massa || op || blz || atkm) ? 'none' : 'block';
        const osec = document.getElementById('cc-origens-sec'); if (osec) osec.style.display = (op || atkm) ? 'none' : 'block';
        const arow = document.getElementById('cc-armar-row'); if (arow) arow.style.display = (massa || blz || atkm) ? 'none' : 'flex';
        // O campo de alvo único não serve pro fake (tem lista própria) nem pra Operação (o alvo
        // é do bloco). Antes ficavam só apagados e continuavam ali em cima, confundindo — agora
        // somem de vez.
        // A Blindagem também não usa o alvo único: os alvos são as aldeias da tabela da tribo.
        const semAlvoGlobal = (tipo === 'fake' || op || blz || atkm);
        const rAlvo = document.getElementById('cc-row-alvo');
        if (rAlvo) rAlvo.style.display = semAlvoGlobal ? 'none' : 'flex';
        // Chegada: a Operação tem a dela na etapa 1, então some. Já o Fake NÃO tem campo próprio
        // — usa este mesmo. Escondê-lo deixaria o fake sem como marcar o horário; por isso a
        // linha é MOVIDA pra dentro do bloco do Fake e volta pro lugar ao sair dele.
        const rCheg = document.getElementById('cc-row-chegada');
        if (rCheg) {
          // Blindagem não marca horário: o apoio sai assim que você manda, sem agendar.
          rCheg.style.display = (op || blz || atkm) ? 'none' : 'flex';
          const destino = document.getElementById((tipo === 'fake') ? 'cc-fake-chegada-slot' : 'cc-chegada-slot');
          if (destino && rCheg.parentElement !== destino) destino.appendChild(rCheg);
        }
        const btn = document.getElementById('cc-armar');
        if (btn) btn.textContent = op ? '▶ Armar este alvo' : ('▶ Armar ' + def.rot.toLowerCase());
        if (tipo === 'fake') ccPreviaFake();
        if (op) ccOpRender();
        ccRenderOrigens();
      };
      _ccAttTipo = attTrem;   // o snipe troca a aba pra Apoio e precisa redesenhar
      document.querySelectorAll('.cc-aba').forEach((el) => {
        el.addEventListener('click', () => { config.cmd.tipo = el.getAttribute('data-tipo'); save(); attTrem(); });
        el.addEventListener('mouseenter', () => { if (el.getAttribute('data-tipo') !== ccTipo()) el.style.color = '#6f6153'; });
        el.addEventListener('mouseleave', attTrem);
      });
      attTrem();

      // Qualquer mudança em alvo/tropa/chegada recalcula os tempos das origens.
      const recalc = () => { ccRenderOrigens(); };
      const alvoEl = document.getElementById('cc-alvo');
      alvoEl.addEventListener('input', () => {
        const a = ccAlvo();
        const ok = document.getElementById('cc-alvo-ok');
        if (ok) {
          if (a) {
            const nome = ccNomeAlvo(a.coord), dono = ccDonoAlvo(a.coord);
            ok.textContent = '✓ ' + a.coord + (nome ? ' · ' + nome : '') + (dono ? ' (' + dono + ')' : '');
            ok.style.color = '#2e7d3a';
          } else { ok.textContent = alvoEl.value ? '✗ formato' : ''; ok.style.color = '#c0483a'; }
        }
        if (a) { config.cmd.ultimoAlvo = a.coord; save(); }
        recalc();
      });
      document.getElementById('cc-chegada').addEventListener('input', () => {
        config.cmd.ultimaChegada = document.getElementById('cc-chegada').value || ''; save(); recalc();
      });
      // Restaura o último alvo/data e desenha o histórico.
      if (config.cmd.ultimoAlvo && !alvoEl.value) { alvoEl.value = config.cmd.ultimoAlvo; alvoEl.dispatchEvent(new Event('input')); }
      if (config.cmd.ultimaChegada) { const ce = document.getElementById('cc-chegada'); if (ce && !ce.value) ce.value = config.cmd.ultimaChegada; }
      ccHistRender();
      // Os eventos das caixas de tropa são religados dentro de ccRenderTropas(), porque a grade
      // é reconstruída quando descobrimos as unidades reais do mundo.

      // Atalho: chegada = agora + 10 min, já no formato que o campo aceita.
      document.getElementById('cc-ch-agora').addEventListener('click', () => {
        const alvoMs = serverNow() + 600000 - wallToServerOffset();
        const d = new Date(alvoMs), p = (n, w) => String(n).padStart(w || 2, '0');
        document.getElementById('cc-chegada').value =
          d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' +
          p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
        recalc();
      });
      // Comandos do jogo: abrir/fechar, trocar entre chegando e saindo.
      const cmdsBox = document.getElementById('cc-cmds-box');
      document.getElementById('cc-ch-cmd').addEventListener('click', () => {
        const abrir = (cmdsBox.style.display === 'none');
        cmdsBox.style.display = abrir ? 'block' : 'none';
        if (abrir) ccCmdsRender(_ccCmdsQual, true);
      });
      document.getElementById('cc-cmds-fechar').onclick = () => { cmdsBox.style.display = 'none'; };
      document.getElementById('cc-cmds-in').onclick = () => ccCmdsRender('incoming', true);
      document.getElementById('cc-cmds-out').onclick = () => ccCmdsRender('outgoing', true);

      // Modelos de tropa
      const limpar = () => {
        ccUnidadesUI().forEach(([u]) => {
          const i = document.getElementById('cc-u-' + u), m = document.getElementById('cc-max-' + u);
          if (i) { i.value = ''; i.disabled = false; }
          if (m) m.checked = false;
        });
        ccPintarTropas();
      };
      document.getElementById('cc-tpl-limpar').onclick = () => { limpar(); recalc(); };
      document.getElementById('cc-tpl-salvar').onclick = ccModeloSalvar;
      document.getElementById('cc-tpl-restaurar').onclick = () => {
        config.cmd.modelos = MODELOS_PADRAO(); save(); ccModelosRender();
      };
      ccRenderTropas();
      ccModelosRender();
      document.querySelectorAll('[data-sec]').forEach((h) =>
        h.addEventListener('click', () => ccToggleSecao(h.getAttribute('data-sec'))));
      ccAplicarFechados();

      // Seleção de origens
      // Fake: prévia ao vivo de quantos comandos a combinação atual geraria.
      const fkAlvos = document.getElementById('cc-fake-alvos');
      fkAlvos.value = config.cmd.fakeAlvos || '';
      fkAlvos.addEventListener('input', () => { config.cmd.fakeAlvos = fkAlvos.value; save(); ccPreviaFake(); });
      document.querySelectorAll('input[name="cc-fakedist"]').forEach((r) => {
        r.checked = (r.value === (config.cmd.fakeDist || 'rodizio'));
        r.addEventListener('change', () => { if (r.checked) { config.cmd.fakeDist = r.value; save(); ccPreviaFake(); } });
      });

      // "todas"/"nenhuma" agem só sobre o que está VISÍVEL (respeita o filtro de grupo).
      document.getElementById('cc-org-todas').onclick = () => {
        document.querySelectorAll('#cc-origens [data-cc-org]').forEach((el) => { config.cmd.origens[el.getAttribute('data-cc-org')] = true; });
        save(); ccRenderOrigens();
      };
      document.getElementById('cc-org-nenhuma').onclick = () => {
        document.querySelectorAll('#cc-origens [data-cc-org]').forEach((el) => { delete config.cmd.origens[el.getAttribute('data-cc-org')]; });
        save(); ccRenderOrigens();
      };
      document.getElementById('cc-org-recarregar').onclick = () => ccCarregarOrigens(true);
      const grupoSel = document.getElementById('cc-org-grupo');
      if (grupoSel) {
        ccCarregarGrupos();
        grupoSel.addEventListener('change', () => { config.cmd.origGrupo = grupoSel.value; save(); ccAplicarFiltroGrupo(); });
      }
      document.querySelectorAll('input[name="cc-fonte"]').forEach((r) => {
        r.checked = (r.value === (config.cmd.fonteTropa || 'casa'));
        r.addEventListener('change', () => {
          if (!r.checked) return;
          config.cmd.fonteTropa = r.value; save();
          // Não precisa rebuscar: a leitura já traz as duas linhas, só troca qual delas usar.
          // Recarrega CCVILAS (é ele que carrega o 'avail' da fonte escolhida) e redesenha.
          ccCarregarOrigens(false).then(ccRenderOrigens);
        });
      });
      // Marca só as origens que atendem os DOIS critérios: têm a tropa pedida E ainda dá tempo.
      document.getElementById('cc-org-viaveis').onclick = () => {
        const alvo = ccAlvo(), ch = ccChegadaMs(), comp = ccComposicao();
        const msg = document.getElementById('cc-msg');
        if (!alvo || !ch) {
          if (msg) { msg.style.color = '#c0483a'; msg.textContent = 'Preencha o alvo e a chegada primeiro.'; }
          return;
        }
        let ok = 0, semTropa = 0, semTempo = 0;
        config.cmd.origens = {};
        const vilasV = _ccGrupoVidsSet ? CCVILAS.filter((v) => _ccGrupoVidsSet.has(String(v.vid))) : CCVILAS;
        vilasV.forEach((v) => {
          if (v.x == null) return;
          if (!ccTemTropa(v, comp)) { semTropa++; return; }
          const compV = ccCompParaVelocidade(comp, v.avail);   // por aldeia, não global
          const t = ccTempoViagemMs(v.x, v.y, alvo.x, alvo.y, compV);
          if (t == null || (ch - t) <= srvNowP()) { semTempo++; return; }
          config.cmd.origens[v.vid] = true; ok++;
        });
        save(); ccRenderOrigens();
        if (msg) {
          msg.style.color = ok ? '#2e7d3a' : '#c0483a';
          msg.textContent = ok + ' origem(ns) marcada(s)' +
            (semTropa ? ' · ' + semTropa + ' sem tropa' : '') +
            (semTempo ? ' · ' + semTempo + ' longe demais' : '');
        }
      };

      ccCarregarOrigens(false);
      ccConsumirSnipe();   // veio da tela de ataques com um snipe escolhido?
      // Verifica o apoio uma vez por mundo, sozinho. Só faz o "confirmar" — não envia tropa.
      // Sem isso o tipo Apoio ficaria travado sem o usuário saber como destravar.
      if (!config.cmd.suporteOkAt) setTimeout(() => ccTestarApoio(true), 2500);
      setInterval(ccTick, 100);        // relógio com milésimos precisa de tick rápido
      ccTick();
      netProbe(5);
      // Punho de diagnóstico. Mede o motor de tempo SEM rede, que é o jeito de separar
      // jitter de timer de jitter de conexão.
      window.__cc = {
        // __cc.testSpin(3000) -> quanto o spin errou o alvo, em ms (rode também com a aba escondida)
        testSpin: async (emMs) => {
          keepAwake(true); ancorar();
          const alvo = srvNowP() + (emMs || 3000);
          await spinUntil(alvo);
          const err = srvNowP() - alvo;
          console.log('[cc] erro do spin: ' + err.toFixed(2) + 'ms · aba ' +
                      (document.hidden ? 'escondida' : 'visível') + ' · antichoke ' + (awakeAtivo() ? 'on' : 'OFF'));
          return err;
        },
        probe: () => netProbe(7).then((r) => (console.log('[cc] rtt min/med/jitter:', r), r)),
        relogio: () => ({ offset: wallToServerOffset(), drift: ancorar(), agora: srvClockMs() }),
        silencio: (ms) => { silenceOn('teste'); setTimeout(silenceOff, ms || 5000); },
        testarApoio: () => ccTestarApoio(false),
        fakes: () => ccParesFake(),
        // Diagnóstico da leitura de tropas: mostra a estrutura real da tabela do jogo
        // pra comparar com o que o parser extraiu.
        dumpTropas: async (type) => {
          const t = type || 'own_home';
          const res = await fetch('/game.php?village=' + CUR_VID + '&screen=overview_villages&mode=units&type=' + t + '&page=-1', { credentials: 'include' });
          const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
          const tabelas = Array.from(doc.querySelectorAll('table')).map((tb, i) => ({
            i: i, id: tb.id || '', classe: tb.className || '',
            linhas: tb.querySelectorAll('tr').length,
            unitItems: tb.querySelectorAll('td.unit-item').length,
          })).filter((x) => x.unitItems > 0);
          const ths = Array.from(doc.querySelectorAll('th')).map((th) => {
            const img = th.querySelector('img[src*="unit_"]');
            return img ? (img.getAttribute('src').match(/unit_(\w+)\./) || [])[1] : (th.textContent || '').trim().slice(0, 14);
          });
          const linha = doc.querySelector('tr:has(span.quickedit-vn[data-id])') ||
                        Array.from(doc.querySelectorAll('tr')).find((tr) => tr.querySelector('span.quickedit-vn[data-id], .quickedit-out[data-id]'));
          const amostra = linha ? {
            html: linha.outerHTML.slice(0, 1200),
            celulas: Array.from(linha.querySelectorAll('td')).map((td) => ({
              classe: td.className || '', txt: (td.textContent || '').trim().slice(0, 20),
            })),
          } : null;
          const parsed = await ccLerAbaTropas(t);
          const chaves = Object.keys(parsed).slice(0, 3);
          console.log('=== ' + t + ' ===');
          console.log('tabelas com unit-item:', tabelas);
          console.log('cabeçalhos (th):', ths);
          console.log('amostra de linha:', amostra);
          console.log('parser extraiu (3 primeiras):', chaves.map((k) => parsed[k]));
          return { tabelas, ths, amostra, exemplo: chaves.map((k) => parsed[k]) };
        },
        estado: () => ({ fila: cmdFila(), calib: config.cmd.calib, lat: NETLAT, silencio: SILENCE.on }),
      };
    }

    function parseCommands(doc) {
      const cmds = [];
      doc.querySelectorAll('tr.command-row').forEach((tr) => {
        const typeEl = tr.querySelector('.command_hover_details[data-command-type]');
        const kind = typeEl ? (typeEl.getAttribute('data-command-type') || 'other') : 'other';
        const label = tr.querySelector('.quickedit-label');
        const mc = label ? (label.textContent || '').match(/(\d{1,3})\|(\d{1,3})/) : null;
        const coord = mc ? (mc[1] + '|' + mc[2]) : null;
        const timer = tr.querySelector('td span[data-endtime]');
        let endMs = 0;
        if (timer) {
          const mt = (timer.textContent || '').match(/(\d+):([0-5]?\d):([0-5]\d)/);
          if (mt) endMs = Date.now() + ((+mt[1]) * 3600 + (+mt[2]) * 60 + (+mt[3])) * 1000;
          else { const et = parseInt(timer.getAttribute('data-endtime'), 10); if (et) endMs = et * 1000; }
        }
        const idEl = tr.querySelector('.quickedit-out[data-id]');
        cmds.push({ kind: kind, coord: coord, endMs: endMs, id: idEl ? idEl.getAttribute('data-id') : null });
      });
      return cmds;
    }

    async function getVillageState(vid) {
      vid = vid || CUR_VID;
      const res = await fetch('/game.php?village=' + vid + '&screen=place', { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const avail = {};
      UNITS.forEach(([u]) => {
        let n = 0;
        const inp = doc.querySelector('#unit_input_' + u + ', input[name="' + u + '"]');
        if (inp) {
          const scope = inp.closest('td') || inp.closest('tr') || inp.parentElement;
          const link = scope ? scope.querySelector('.units-entry-all') : null;
          if (link) { const dc = link.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (link.textContent || '').replace(/\D/g, ''), 10); }
        }
        if (!n) { const alt = doc.querySelector('a.units-entry-all[data-unit="' + u + '"]'); if (alt) { const dc = alt.getAttribute('data-all-count'); n = parseInt(dc != null ? dc : (alt.textContent || '').replace(/\D/g, ''), 10); } }
        avail[u] = isNaN(n) ? 0 : n;
      });
      return { avail: avail, commands: parseCommands(doc) };
    }

    // `getVillageState`/`parseCommands`, logo acima, são as ÚNICAS sobreviventes de um motor
    // inteiro (Auto-ATK, Coleta, Saque, Muralha) que veio junto no port da branch antiga do
    // Centro de Comando e nunca foi plugado no boot desta ilha — `cmdBoot()` só chama
    // `cmdTick()`. O resto do motor duplicado (~490 linhas: sendAttack, processDue, scavTick,
    // farmTick, wallTick e as funções de apoio de cada um) foi removido na v11.156.0.
    //
    // Ele não era código morto de verdade — tinha UM jeito de ser alcançado, e por isso era
    // perigoso: `silenceOff()` (linha ~272) chama `scheduleScav()`, `scheduleFarm()`,
    // `scheduleWall()` e `scheduleWake()` pra religar os módulos depois de um disparo
    // coordenado. Como este arquivo é sua PRÓPRIA IIFE aninhada (ver CLAUDE.md), esses nomes
    // resolviam pras cópias duplicadas LOCAIS em vez dos motores reais em 020-engine.js — que
    // usam as MESMAS variáveis de timer compartilhadas (scavTimer/farmTimer/wallTimer/
    // sendTimer, declaradas em 010-core.js). Resultado: depois de QUALQUER uso do Modo
    // Silêncio com Coleta/Saque/Muralha/Auto-ATK rodando, o motor real era substituído pela
    // cópia velha até o próximo F5 — e a cópia tinha regredido: sem trava de captcha, e o
    // farmTick duplicado chamava `getAllScavengeState()` (o getter do SCAV) por engano.
    //
    // Estas duas funções continuam porque são usadas de verdade — pela leitura de tropa do
    // motor de precisão (COMANDOS COORDENADOS, acima) e por `ccCarregarOrigens`.

    // ---- boot da ilha (replica o que o boot antigo fazia pra CC) ----
    try { if (telaAtual() === 'place') mountCmdCenter(); } catch (e) { pushLog('Central rica nao montou: ' + (e.message || e), 'err', 'cmd'); }
    try { mountSnipeIncomings(); } catch (e) { pushLog('Snipe rico falhou: ' + (e.message || e), 'err', 'cmd'); }
    try { mountCmdOverview(); } catch (e) { /* silencioso: injeção na lista de comandos é opcional */ }
    mountCmdDestino().catch(() => { /* silencioso: injeção na ficha da aldeia é opcional */ });
    try { cmdBoot(); } catch (e) { pushLog('cmdBoot falhou: ' + (e.message || e), 'err', 'cmd'); }
  })();
