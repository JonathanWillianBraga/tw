# Melhorias — backlog

Lista de coisas que dá pra trabalhar no futuro, levantada num scan completo de todos os
módulos em `src/*.js` (22 arquivos, ~15.400 linhas). Não é uma lista de bugs bloqueantes —
é um raio-x pra escolher o que vale a pena atacar quando sobrar tempo.

**Como usar:** risque/apague o item quando resolver (ou mova pra baixo de um "✅ feito" se
quiser manter histórico). Pode também apagar item que na prática não importa — isto aqui é
memória de trabalho, não um contrato. Cada item tem o arquivo:linha de onde foi observado;
como o código muda, a linha pode ter andado — confira antes de mexer.

A maioria dos itens veio de uma varredura automatizada (agentes de IA lendo cada módulo
inteiro); os dois marcados **(confirmado)** foram checados manualmente contra o código atual
e são bugs ativos reais. Os demais são leitura cuidadosa mas não 100% verificada linha a
linha — vale um confere rápido antes de sair mexendo.

---

## src/010-core.js

- **`FAKE_LIMIT_PCT` hardcoded pro mundo atual** (`010-core.js:200`) — o comentário já admite
  "1% é o valor deste mundo", mas a constante não deriva de `game_data` nem é migrada por
  mundo (a `KEY` já é por `WORLD`, essa constante não acompanha). Rodar noutro mundo com
  limite de fake diferente faz o Saque validar contra um percentual errado, sem aviso.

- **`marketTimers` carrega uma chave morta (`cunhar`)** (`010-core.js:821`) — `cunhar` foi
  absorvido pela Cunhagem faz tempo (`MARKET_MODES` só tem os três atuais). Não quebra nada,
  mas confunde quem for mexer no ciclo de mercado achando que existe um quarto modo.

## src/020-engine.js

- **Cooldown de quebra de muralha (`sentDemo`) ainda chaveado por `reportId`** (`020-engine.js:1330,1375`
  vs `1068-1091`) — o cache `defended` do Saque já foi corrigido pra chavear por coordenada
  em vez de `reportId` (porque o id muda a cada relatório novo), mas a Muralha não recebeu a
  mesma correção. Se o Saque gerar um relatório novo daquele alvo, o cooldown de 6h da
  Muralha se perde e o mesmo alvo pode levar aríete de novo antes do previsto.

- **Muralha não loga aldeias sem coordenada, ao contrário do Saque** (`020-engine.js:1310` vs
  `947-957`) — `farmTick` tem diagnóstico dedicado (`semCoord`) pra aldeia recém-conquistada
  sem coord ainda carregada; `wallTick` filtra em silêncio e ninguém percebe a aldeia de fora
  do cálculo de origem.

- **Modo "tempo máximo" da Coleta trava TODAS as opções se qualquer nível estiver travado, com
  log enganoso** (`020-engine.js:661-672,698-704`) — `getScavDurations` devolve `{}` sempre que
  a aldeia não tem as 4 opções de coleta desbloqueadas (comum em aldeia nova), e a mensagem de
  log diz "nenhum nível dentro do tempo máximo" quando o problema real é nível travado.

- **`parseReportDate` não trata virada de ano no ramo de data curta (`dm2`)** (`020-engine.js:188-201`)
  — o ramo de mês por nome tem proteção explícita pra quando a data cai no futuro por falta de
  ano; o ramo `dd/mm` sem ano não tem a mesma checagem. Relatório de 31/12 lido em 01/01 do ano
  seguinte calcula uma data um ano adiantada.

- **`processDue()` nunca chama `devoParar()`, e faz `reload()` sem checar a Central** (`020-engine.js:357-402`)
  — Saque/Muralha/Coleta cedem espaço pra Central de Comando durante a janela crítica dela;
  o motor genérico de auto-ATK não, e ainda dispara `location.reload()` 900ms depois de um
  envio, podendo derrubar a aba no meio de um disparo de precisão.

- **`sendAttack`/`ccDispararAgora` sem timeout nem `AbortController` no fetch** (`020-engine.js:296-344`
  e `180-centro-comando.js:242-290`) — se a rede travar sem devolver erro, o `await` prende o
  ciclo indefinidamente (ou o comando fica em `'disparando'` pra sempre na Central), em vez de
  cair no estado `'incerto'` que já existe pra outros tipos de falha.

## src/040-tropas.js

- **Recrutar ignora `config.recruit.villages` por completo** (`040-tropas.js:132`) —
  `resolveTargets()` só olha `templates`/`overrides`, nunca a estrutura por-aldeia com
  `paused` que o `load()` sanitiza e poda a cada carregamento. Atribuição individual por
  aldeia e pausa por aldeia não existem no motor de Recrutar, mesmo com o código de
  manutenção rodando à toa.

- **Recrutamento "contínuo" (`alvo = null`) é inacessível pela UI** (`040-tropas.js:198`) — o
  motor entende meta `null` como "recrutar pra sempre sem teto", mas o editor só produz campo
  vazio ("não recruta") ou número (meta com teto). Só dá pra usar contínuo editando o
  `localStorage` na mão.

## src/050-envio.js

- **`fakeFire` só reconhece uma frase de recusa como erro** (`050-envio.js:29-34`) — a checagem
  é um regex estreito (`não tem tropas suficientes|not enough`); NAP, proteção, sessão
  expirada ou uma tela de bot-check não batem, e a função devolve `true` como se tivesse
  enviado. Esse helper é compartilhado por Central, Coordenado e Noblar.

- **`getFakeVillage` zera `avail`/`popMax` em silêncio se o parse falhar** (`050-envio.js:44-52`)
  — diferente de `getAllVillages`, que avisa com `pushLog` quando o parse degrada, aqui um
  HTML inesperado devolve tropa/população zeradas sem aviso, e quem consome interpreta como
  "aldeia sem tropa" e pula o envio sem desconfiar.

- **`getVillagePoints` — cache nunca expira** (`050-envio.js:53-62`) — sem TTL, ao contrário do
  `getAllVillagesCached` vizinho (5 min). Pontuação muda com o jogo; Coordenado e Central ficam
  presos ao snapshot da primeira leitura da sessão inteira.

- **`parseCoords` vs `nobleParseCoords` — regras diferentes pro mesmo tipo de dado**
  (`050-envio.js:39-43` vs `084-noblar.js:295-307`) — um aceita 1-3 dígitos por eixo, o outro
  exige 2-3. O mesmo typo de coordenada se comporta diferente dependendo da tela.

- **`attackPrepare`/`attackFire` são aliases mortos** (`050-envio.js:35`) — o comentário do
  arquivo diz que o Coordenado consome esses nomes, mas ninguém no repo chama; todo mundo usa
  `sendAttack` direto. Vale apagar ou corrigir o comentário.

## src/070-paladino.js

- **Paladino nunca chama `claimLock()`/`devoParar()`, só lê `lockOther()`** (`070-paladino.js:127-190`)
  — Saque/Muralha/Coleta reivindicam o lock antes de rodar, participando do rodízio que evita
  módulos baterem na conta ao mesmo tempo. O Paladino só confere se outro está rodando, nunca
  cede espaço nem avisa a Central durante o próprio ciclo.

- **`paladinSchedulePrecise` bloqueia o próprio reagendamento** (`070-paladino.js:91-121`) —
  o timestamp do timer de precisão é gravado ANTES do envio, e como o reagendamento seguinte
  fica bem abaixo do intervalo mínimo entre agendamentos, a guarda recusa toda vez. Na prática
  o timer de precisão só funciona na primeira vez.

- **`paladinPick4hRegimen` sem fallback se o mundo não tiver regime de 4h** (`070-paladino.js:7-10,162`)
  — cai em `'sem-regime-4h'` e loga erro todo ciclo, pra sempre, sem tentar a duração mais
  próxima disponível.

## src/075-mercado.js

- **ETA do Equilíbrio não compara déficit com excedente disponível** (`equilibrioAtualizarSaudeCom`)
  — o ETA é `deficitTotal[r] / taxaDoÚltimoCiclo`, mas `excedenteTotal[r]` (já calculado) nunca
  é comparado com o déficit. Se o excedente total for menor que o déficit, o Equilíbrio NUNCA
  fecha essa conta sozinho — falta produção/saque, não é questão de tempo — e o ETA mostrado
  engana o usuário. *(Levantado nesta própria conversa, ainda não implementado.)*

- **Ordem fixa madeira→argila→ferro compete pela mesma capacidade de mercador** (`equilibrioPass`)
  — a capacidade de mercador de cada doadora é um orçamento compartilhado entre os três
  recursos dentro do mesmo ciclo; madeira sempre come capacidade primeiro, mesmo estando de
  boa globalmente, sobrando menos pra argila/ferro que é o que está travado. *(Idem, levantado
  nesta conversa.)*

- **Snapshot do Equilíbrio/Solidário não respeita "Parar"** (`075-mercado.js:271,456`) —
  `getEquilibrioSnapshot()` e o loop de leitura do Solidário não checam `devoParar('market')`,
  diferente do loop de envio da Cunhagem. Numa conta com muitas aldeias, clicar em "Parar"
  durante a fase de leitura não interrompe nada até a lista inteira terminar.

- **Solidário grava `name: x.coord` pros membros receptores** (`075-mercado.js:425`) — o campo
  `name` vira a própria coordenada. Não estoura hoje porque os logs usam `.coord` direto, mas é
  dado errado guardado em `st[]`.

- **Regex de duração de envio trava em 99 horas** (`075-mercado.js:58`) — o fallback só casa até
  2 dígitos de hora; transporte de 100h+ (mercador lento, mundo grande) cai no default de 1h
  pro `inflight`, fazendo Equilíbrio/Solidário acharem que a remessa já chegou muito antes da
  hora e arriscar reforço duplicado.

## src/080-edificios.js

- **`computeBuild()` não resolve pré-requisito travado, diferente do Obra** (`080-edificios.js:74`)
  — quando um item do modelo está travado, só pula pro próximo; não olha `state.locked` (que a
  própria `getBuildState()` já calcula) pra priorizar o requisito que falta. Modelo sem o
  prédio-requisito explícito trava a aldeia pra sempre, em silêncio.

- **`bldResetDefault()` sempre reseta modelo custom pra Ofensiva** (`080-edificios.js:614`) —
  resquício do design anterior à v11.14 (só 'atk'/'def'); qualquer modelo criado pelo usuário
  cai no `else` e volta pro template Full ATK, mesmo sendo um modelo "Fazenda" ou "Fast Nobre".
  O texto do `confirm()` também mente sobre isso.

- **Exportar/importar modelo perde as flags de demolição** (`080-edificios.js:682`) — o campo
  `it.dem` não entra no formato de exportação nem é reconstruído na importação. Backup ou
  compartilhar modelo apaga silenciosamente a config de "demolir excedente".

- **Duplicar modelo também derruba `dem`** (`080-edificios.js:644`) — mesmo bug do item acima,
  caminho diferente (UI local em vez de export/import).

- **`config.build.plans.{atk,def}` regenerado à toa em todo `load()`** (`080-edificios.js:526-527`)
  — desde a v11.14 quem manda é `templates`; `plans` só serviu de semente da migração, mas
  continua sendo populado e salvo pra sempre sem uso real.

## src/082-pesquisa.js

- **`researchTick` sem tratamento de 429/rate-limit** (`082-pesquisa.js:217-277`) — o laço passa
  de 40 aldeias por ciclo (1 GET + 1 POST cada) e não reconhece 429, caindo no balde
  "desconhecido" e insistindo no próximo ciclo sem recuar — diferente do Mapa e da Etiqueta,
  que têm recuo. É o módulo que mais bate o servidor por ciclo e o único sem proteção.

## src/084-noblar.js

- **Teto de cunhagem "por ciclo" é na verdade por alvo** (`084-noblar.js:596-655`) — o contador
  `cunhadas` é local à função e ela roda uma vez por alvo; com 5 alvos precisando de cunhagem
  no mesmo ciclo, cada um reseta o próprio contador e pode cunhar até o teto configurado —
  gasto irreversível muito acima do que a UI descreve ("quantas aldeias podem cunhar num mesmo
  ciclo").

- **Fila da Academia contada de novo em cada alvo, sem pool cross-alvo** (`084-noblar.js:606-614`)
  — se dois alvos no mesmo ciclo compartilham a mesma origem candidata com 1 nobre na fila, os
  DOIS creditam esse nobre em produção pro próprio "vindo", podendo segurar disparo parcial de
  ambos acreditando que reforço chega pros dois.

- **Escolha do "melhor modelo" usa a cota nominal, não a necessidade real do alvo** (`084-noblar.js:358-361`)
  — compara modelos pela cota declarada (`nobres || NOBLE_POR_CONQUISTA`), não pela quantidade
  ajustada por lealdade que de fato vai ser usada no envio. Pode descartar um modelo mais leve
  que já bastaria.

- **Mojibake corrompeu comentários e mensagens de log visíveis** (`084-noblar.js:464-563`,
  ex. linhas 517 e 555) — dupla codificação UTF-8 quebrando "—" e "→" direto no log do painel.

## src/085-obra.js

- **Pesquisa automática do Obra ignora `reserveMin`** (`085-obra.js:164`) — toda a lógica de
  construção do módulo respeita a reserva explicitamente; a pesquisa do Ferreiro dispara sem
  checar, podendo consumir o recurso que o resto do Obra está segurando de propósito pro
  Recrutar.

- **Obra não tem demolição, ao contrário do Construções** (`085-obra.js:35-75`) — o módulo já
  reconhece o problema de aldeia "de segunda mão" com prédio adiantado demais, mas só pausa a
  subida — nunca oferece derrubar o excedente como Construções faz (mesma função de suporte já
  existe, `demolirPredio`).

- **Aldeia em dois grupos de perfil escolhe silenciosamente o primeiro** (`085-obra.js:15`) —
  `getGroupProfileMapObra` itera os perfis em ordem fixa e não avisa quando uma aldeia está
  duplicada entre grupos.

## src/095-saque-tplB.js

- **Cache do template B não é por aldeia** (`095-saque-tplB.js:4-7,127`) — cada aldeia tem seu
  próprio template B no assistente, mas o cache é uma variável de módulo única sem chave por
  `vid`. Rodando o Saque em várias aldeias, só a primeira consultada na janela de 30 min busca
  dado de verdade; o resto recebe o template/tropas da primeira e manda errado.

## src/100-barbaros-mapa.js

- **Falha transitória de rede desliga o ciclo contínuo inteiro do Mapa** (`100-barbaros-mapa.js:340-341`)
  — qualquer erro de rede ao ler `village.txt` desarma o módulo por completo (`running=false`),
  contradizendo o próprio comentário do arquivo sobre ter virado ciclo contínuo. Outros módulos
  em erro de rede só logam e tentam de novo.

- **`barbConhecidos`/`relatoriosLidos` crescem pra sempre, sem faxina** (`100-barbaros-mapa.js:138-150,81-109`)
  — diferente de `sentAt` (limpo por idade no mesmo arquivo), essas listas nunca perdem
  entradas, nem quando o bárbaro é conquistado. Cresce sem limite no `localStorage`.

- **Limite de 20 relatórios processados por ciclo é fixo** (`100-barbaros-mapa.js:413`) — numa
  primeira leitura grande de mapa, o backlog de classificação só esvazia 20 por ciclo (30 min
  default), sem opção de ajuste como os outros parâmetros do módulo.

## src/110-cadeado.js

- **`config.lock.reserved` nunca é reconciliado nem podado** — é um toggle sem consulta de
  estado; a única fonte de verdade é a memória local, nunca revalidada contra o jogo (aldeia
  destravada manualmente, conquistada, etc.) e sem teto como `config.noble.vistos` tem.

- **Nenhuma UI lista as aldeias travadas nem permite destravar uma** (`110-cadeado.js` +
  `150-painel-ui.js:480-488`) — só contadores agregados; pra ver quais aldeias ou desfazer uma
  reserva errada, só via console. Bárbaros do Mapa já tem o padrão de lista pronto pra
  reaproveitar.

## src/120-etiqueta.js

- **Tabela de recebidos não encontrada falha em silêncio total** (`120-etiqueta.js:34-42`) — se
  a UI do jogo mudar e a tabela não for achada, devolve `{total:0, novos:0}` sem erro, e o
  módulo "funciona com sucesso" indefinidamente sem etiquetar nada.

- **Teto de 400 IDs por POST atrasa etiquetagem em ondas grandes** (`120-etiqueta.js:11`) — numa
  guerra grande com mais de 400 comandos simultâneos, o excedente fica pro próximo ciclo, bem
  na hora em que etiquetar rápido mais importa (precisão cai com o tempo).

## src/130-captcha.js

- **`maybeAutoReload` cobre só Desviar e Central** (`130-captcha.js:161-176`) — não considera
  Noblar, Cadeado, Saque, Recrutar, Mercado, Obra ou Paladino em meio a um ciclo com vários
  `await` sequenciais; um F5 automático no meio de um desses pode cortar uma requisição sem
  confirmação nem retomada.

- **Fallback de seletores reabre o falso-positivo que a detecção estrutural evita** (`130-captcha.js:48-56`)
  — o fallback baseado em `CAPTCHA_SELECTORS` só checa visibilidade de iframe, sem exigir popup
  nem título, diferente do checador estrutural principal que foi desenhado com cuidado pra
  evitar isso.

## src/140-painel-controllers.js

- **`equilibrioRenderSaude` pode quebrar a aba Mercado inteira com estado salvo de versão
  antiga** (`140-painel-controllers.js:175-219`) — só testa se `s` existe, mas acessa
  `s.eta[r]`/`s.sugestao`/`s.problemas` sem checar se existem. Usuário que tinha Equilíbrio
  rodando antes da v11.59/11.60 (que introduziram esses campos) toma `TypeError` ao abrir a
  aba depois de atualizar, sem rodar um novo diagnóstico primeiro.

## src/150-painel-ui.js

- **Cor CSS inválida quebra a coluna "alvo" do Status do Recrutar** (`150-painel-ui.js:169`) —
  `color:#a89madeira` não é hex válido; o navegador ignora a declaração e a célula fica sem a
  cor pretendida.

- **Três mecanismos de sub-aba diferentes no mesmo painel** — o sistema genérico `SUBS`/`showSub`
  cobre farm/noble/recruit/build/market, mas os Bárbaros do Mapa usam um sistema à parte
  (`twmgr-bm-sub`/`mapMostrarSub`). Quem mexer num padrão achando que é o outro quebra a troca
  de aba sem perceber.

- **Mercado tem um único intervalo compartilhado pros 3 modos independentes** (`150-painel-ui.js:587`
  vs `420,435`) — Cunhagem/Equilíbrio/Solidário rodam de forma independente e cada um tem seus
  próprios limiares/distâncias, mas só existe um "Intervalo do ciclo" pros três — diferente de
  Saque/Muralha, que têm intervalo próprio cada. Continua valendo mesmo depois da v11.61 ter
  separado a UI em sub-abas.

## src/160-desviar.js

- **Se o comando não aparece na releitura de 700ms, a tropa fica fora de casa pra sempre**
  (`160-desviar.js:219-222`) — se o servidor não tiver registrado o comando ainda (lag, 429),
  a função marca `failed` e nunca agenda o cancelamento; a tropa já saiu e fica de apoio
  indefinidamente.

- **Tolerância de 2s pra "mesmo ataque" pode apagar marcação de ataque diferente**
  (`160-desviar.js:262-264,374-382`) — num sanduíche de ataques chegando a segundos de
  diferença, marcar a segunda linha é interpretado como "já marcado" e desmarca a primeira, em
  vez de cobrir as duas.

- **Nobre nunca é protegido pelo desvio, sem aviso** (`160-desviar.js:213`) — corretamente não
  entra no apoio-fantasma (regra do jogo), mas fica em casa exposto exatamente na hora em que o
  usuário está tentando proteger a aldeia, sem nenhum log avisando disso.

- **Desvio dispara mesmo se o ataque que motivou a marca já não existe mais** (`160-desviar.js:159-192,199-250`)
  — entre marcar e a hora agendada de saída, não há releitura confirmando que o incoming ainda
  está de pé. Ataque cancelado pelo atacante ainda assim esvazia a aldeia na hora marcada.

## src/170-mapa.js

- **`_mapPlayerFalhou` é setado mas nunca lido em lugar nenhum do painel** (`170-mapa.js:10-13,74`)
  — o comentário promete aviso persistente quando `player.txt` falha, mas nada lê a variável
  pra mostrar isso; o usuário só sabe se viu o log na hora exata.

- **Timeout do TWMap avisa só no console** (`170-mapa.js:566-567`) — contraria o próprio
  critério do módulo (aviso de console "não serve porque ninguém abre o console"); os filtros
  do mapa somem sem pista visível.

- **Botão "Desativar tudo" não faz o que o tooltip promete** (`170-mapa.js:472-473,531-541`) —
  só mexe em alguns toggles (`show.*`, pontos, `dimMode`), não em `showBadge`/`showIntel`/
  `showReservations`/`showCobertura`/`showRange`.

## src/175-cc-rico.js

- **`silenceOff()` religa os módulos errados** (`175-cc-rico.js:232-238`) **(confirmado)** —
  quando o Modo Silêncio desliga, chama `scheduleScav`/`scheduleFarm`/`scheduleWall`/
  `scheduleWake`, mas essas funções estão REDECLARADAS dentro desta IIFE isolada (código morto
  de um merge antigo) e por escopo léxico a redeclaração local sempre ganha. Ligar e desligar o
  silêncio uma vez com Coleta/Saque/Muralha rodando passa a conduzir esses três módulos pelo
  motor antigo embutido aqui (sem `repeat`, sem `blueMaxWall`, sem diagnóstico de duplicado),
  silenciosamente, até o F5.

- **`FREEZEKEY` é escrito no localStorage mas nunca lido em lugar nenhum** (`175-cc-rico.js:217,230`)
  **(confirmado)** — `lockOther()` (`010-core.js:834`) lê `LOCKKEY`, uma chave diferente de
  `FREEZEKEY`; nada no repo lê `_freeze`. Com duas abas abertas, ligar o Modo Silêncio numa
  aba NÃO impede a outra de continuar rodando durante o disparo de precisão — a concorrência
  que o modo existe pra evitar.

- **Bloco morto é bem maior que o já mapeado** (`175-cc-rico.js:3090-3559`) — além de
  `wallTick`/`scheduleWall`/`ramsForWall`, o mesmo bloco carrega uma cópia inteira do motor de
  ataque avulso, de coleta e de saque, incluindo `getDailyLootStats` (órfã até dentro do
  próprio bloco morto). Vale podar tudo — é o gatilho do item acima.

- **`fatorAjuste` corrige o modelo de velocidade sem teto e sem forma de se recuperar**
  (`175-cc-rico.js:340-347`) — multiplica livremente sem clamp (diferente de `biasMs`, limitado
  a ±1500ms); uma leitura pontual ruim deixa o fator torto e nada força nova leitura pra
  corrigir (só é chamado com `forcar=false`).

- **Apoio em massa: modo "%" não tem teto, modo "quantidade" tem** (`175-cc-rico.js:1727`) —
  digitar "150%" por engano manda calcular mais tropa do que a aldeia tem, e o envio inteiro
  falha no servidor em vez de saturar em 100%.

- **Fake em massa "todos × todos" não avisa sobre o limitador de 1 preparo/segundo**
  (`175-cc-rico.js:834-841,426-449`) — com poucas dezenas de origens/alvos já passa de 60s de
  fila de preparo, e os últimos caem em "horário já passou" sem aviso prévio do risco.

- **Preparo de comandos pendentes não respeita urgência, só ordem de inserção**
  (`175-cc-rico.js:440-449`) — um comando que dispara em 5s pode ficar esperando atrás de outro
  que só dispara em 55s, simplesmente por ter entrado na fila depois.

- **Abortar/ajustar pela Fila deixa lixo na tabela "Próprios comandos" injetada**
  (`175-cc-rico.js:770-774` vs `2390-2396`) — `cmdAbortar()` não chama `mountCmdOverview()`;
  a linha fantasma "Ataque agendado" continua contando regressiva até o jogo re-renderizar
  sozinho.

- **Tropa manual por aldeia não suporta "tudo" (max), só número fixo** (`175-cc-rico.js:1883-1897`)
  — a composição global suporta "manda tudo"; o override por aldeia só aceita número fixo, que
  fica desatualizado assim que o estoque muda.

- **Falha ao ler pontos desativa o piso de população dos fakes sem avisar** (`175-cc-rico.js:1603-1605`)
  — se `getVillagePoints()` falhar, o piso de 1% é pulado pra todo o lote sem `pushLog`,
  diferente do resto do arquivo que avisa toda vez que degrada um comportamento.

- **Log de "envio ok" sai antes de confirmar sucesso** (`175-cc-rico.js:372-384`) — grava no
  histórico de desvio de disparo logo após o `fetch`, sem esperar a resposta; se falhar depois,
  a entrada de sucesso já ficou lá, sujando a amostra que mede precisão de disparo.

- **Valores de defesa fixos (`CC_DEF_VAL`) pra ranquear snipe, mas velocidade é lida do mundo**
  (`175-cc-rico.js:2412` vs `496-517`) — em mundos com config customizada de unidades, a
  ordenação de candidatos a snipe pode favorecer a aldeia errada.

## src/180-centro-comando.js

- **Código morto: `ccInjetarPraca`, `ccBotaoPainel` e helpers exclusivos** (`180-centro-comando.js:1041-1204,1296-1305`)
  — o próprio arquivo documenta que foram desativados desde que `175-cc-rico.js` assumiu a UI;
  as chamadas estão comentadas no bootstrap. ~170 linhas sem nenhum caller.

- **Offset fixo da Central sem teto de validação** (`180-centro-comando.js:938-949`) — o campo
  `offsetFixoMs` não usa o clamp `'pos'`; pode receber qualquer valor absurdo sem aviso, e no
  modo fixo isso vira exatamente o erro de disparo aplicado sem checagem.

- **`ccSondar` aborta a medição inteira na primeira sonda que falhar** (`180-centro-comando.js:157-172`)
  — `break` no primeiro `fetch` que falhar descarta todas as sondas já coletadas, em vez de
  pular só a que falhou. Uma falha transitória distorce a mediana exibida no painel.
