# Melhorias — backlog priorizado

Revisão feita em **2026-08-13** sobre `src/*.js` (25 módulos, ~21.000 linhas), com o Opus 5.

## Como ler isto

A ordem é por **quanto dói**, não por módulo:

| | Critério |
|---|---|
| **P0** | Gasta recurso ou tropa **sem volta** |
| **P1** | Para de funcionar (ou age errado) **em silêncio** |
| **P2** | Degrada com o tempo — cresce sem limite, decide com dado velho |
| **P3** | Armadilha pra quem for mexer depois; hoje não quebra nada |

**Diferença pro arquivo anterior:** aquele avisava que a maioria dos itens era "leitura
cuidadosa mas não 100% verificada". Aqui cada item diz **como foi verificado**. O que não deu
pra confirmar está numa seção própria, marcado como tal — não misturado com o resto. Vários
itens do arquivo antigo saíram porque **já foram corrigidos** (lista no fim) ou porque estavam
**errados**.

Item resolvido: apague. Isto é memória de trabalho, não contrato. As linhas andam — confira
antes de mexer.

---

## P0 — Gasta recurso sem volta

### 1. O teto de cunhagem é por ALVO, não por ciclo — e a UI promete o contrário

`084-noblar.js:1708` · `084-noblar.js:1936` · rótulo em `150-painel-ui.js:861`

`cunhadas` é declarada **dentro** de `nobleRecrutar()`:

```js
let formados = 0, naFila = 0, prontoEm = null, cunhadas = 0;   // :1708
...
if (config.noble.cunhar && cunhadas < (config.noble.cunharMaxAldeias || 3)) {   // :1732
```

E `nobleRecrutar()` é chamada **uma vez por alvo**, dentro do laço de alvos (`:1936`). Cada
alvo zera o próprio contador. Com o padrão de 3 e 4 alvos na fila, o ciclo pode cunhar em **12
aldeias**, não 3.

A UI diz literalmente *"Trava de gasto: quantas aldeias podem cunhar num mesmo ciclo"*. Moeda
não tem desfazer.

**Verificação:** lido o escopo da variável e o ponto de chamada. Confirmado no código.

**Direção:** subir o contador pro escopo do ciclo (`nobleTick`) e passar por parâmetro, como
`usados` já faz pro pool de nobres.

---

## P1 — Para de funcionar em silêncio

### 2. Falha de rede DESLIGA o módulo Bárbaros do Mapa

`100-barbaros-mapa.js:341` · com `:207` e `:215`

```js
const plan = await mapPlanTargets();
if (!plan) { cfg.running = false; save(); setMapStatus(false); return; }   // :341
```

E `mapPlanTargets()` devolve `null` **em erro de rede**:

```js
catch (e) { pushLog('BM: erro ao ler village.txt: ...'); return null; }     // :207
catch (e) { pushLog('BM: erro ao ler minhas aldeias: ...'); return null; }  // :215
```

Um 429 ou um timeout no `village.txt` desarma o módulo de vez. Ele loga, mas fica desligado
até alguém reparar e clicar em ▶ de novo — e o botão some do estado "ligado", então nem parece
que houve erro. Todos os outros módulos, no mesmo caso, só logam e tentam no próximo ciclo.

**Verificação:** os três trechos lidos; os dois `return null` são os únicos caminhos que levam
ao `!plan`.

**Direção:** separar "não deu pra ler agora" (reagenda) de "não há o que fazer" (desliga).

### 3. Cache do template B do Saque ignora a aldeia que pediu

`095-saque-tplB.js:4-7`

```js
let _farmTplCache = null, _farmTplCacheAt = 0;
async function getFarmTemplates(vid, force) {
  if (!force && _farmTplCache && (now - _farmTplCacheAt < 30 * 60 * 1000)) return _farmTplCache;
```

O parâmetro `vid` **não entra na chave do cache** — nem existe chave. A primeira aldeia
consultada na janela de 30 min responde por todas as outras.

**Verificação:** o código está confirmado. O **impacto** não: depende de o `template_id` do
assistente de saque ser por aldeia ou da conta inteira. Se for da conta, isto é inofensivo
(vira só uma economia acidental de requisição); se for por aldeia, o módulo manda a composição
errada de toda aldeia menos a primeira. **Não consegui medir — a sessão do jogo expiriou no meio
da revisão.** Ver "Não verificado" no fim.

**Direção:** independente do impacto, trocar por `_farmTplCache[vid]`. O custo é uma linha e
tira a dúvida de vez.

---

## P2 — Degrada com o tempo

### 4. Cinco estruturas do `config` crescem pra sempre

| Estrutura | Onde | Podado? |
|---|---|---|
| `map.sentAt` | `100-barbaros-mapa.js:407` | ✅ 30 dias |
| `map.barbConhecidos` | `100-barbaros-mapa.js:144` | ❌ |
| `map.relatoriosLidos` | `100-barbaros-mapa.js:94` | ❌ |
| `noble.vistos` | `084-noblar.js:1588,1663` | ❌ |
| `noble.posFeitos` | `084-noblar.js:1210` | ❌ |
| `lock.reserved` | `110-cadeado.js:71` | ❌ |

O `sentAt` prova que o padrão existe no próprio arquivo — as outras só não foram feitas.
`relatoriosLidos` e `vistos` ganham uma entrada por relatório visto **na vida da conta**.

Isso encareceu depois do **backup** (v11.164.0): o export carrega tudo, e o arquivo hoje já sai
com 1,6 MB. Também é o caminho pro `localStorage` estourar a cota — e aí o `save()` falha,
possivelmente no meio de um ciclo.

**Verificação:** grep por atribuição vs. remoção em cada estrutura.

**Direção:** copiar o padrão do `sentAt` (poda por idade no fim do ciclo). `posFeitos` pode
seguir a lista de `conquistadas`, que já tem teto de 100.

### 5. `getVillagePoints` — cache sem validade nenhuma

`050-envio.js:71`

```js
let _pointsCache = null;
```

Sem `_pointsAt`, ao contrário de todos os vizinhos (`_vilasCache/_vilasAt`,
`_nbSnobCache/_nbSnobAt`, `_mapVillagesCache/_mapVillagesCacheAt`…). A pontuação das aldeias
fica congelada no primeiro valor lido e **não atualiza até o F5**. Quem consome é o Coordenado
e a Central — que usam pontos pra decidir fake eficiente.

**Verificação:** grep das declarações de cache do repo inteiro; é o único sem par `At`.

---

## P3 — Armadilhas pra quem mexer depois

### 6. O sanitizador de planos RECONSTRÓI o objeto

`010-core.js:602` e `010-core.js:606`

```js
const sanPlan = (p) => (p || []).filter(...).map((it) => ({ b: it.b, lvl: ..., en: it.en !== false }));
```

Campo que não esteja nesse molde é apagado a cada `load()`. **Hoje não perde nada** — o único
campo extra que existiu (`it.dem`) é deliberadamente removido logo acima (`:639`), porque a
demolição virou interruptor global. Mas é exatamente a armadilha descrita no CLAUDE.md: o
próximo campo por item do plano nasce morto, e pior, some também na **importação de backup**,
sem erro nenhum.

> Nota: o arquivo anterior listava "exportar/importar modelo perde as flags de demolição" como
> bug ativo. Não é mais: `dem` por item não existe. O item saiu.

**Direção:** sanitizar corrigindo no lugar, como `c.noble.alvos` faz.

### 7. 77 `catch (e) {}` vazios, sem critério visível

Distribuídos pelo repo; 32 só em `020-engine`, `075-mercado`, `084-noblar` e `175-cc-rico`.

Amostrei os de `020-engine`: a maioria embrulha `JSON.parse` ou gravação de estatística — onde
engolir o erro é defensável. Mas o padrão é indistinguível a olho do caso onde importa, como
`020-engine.js:606`, que engole falha de `getAllVillagesCached()` e segue com o mapa de
coordenadas vazio.

**Não auditei os 77.** Fica registrado como dívida de leitura, não como 77 bugs.

**Direção:** quando o `catch` for proposital, dizer no código (`catch (e) { /* opcional */ }`).
O vazio silencioso vira sinal de que ninguém pensou.

---

## Não verificado (precisa de sessão logada)

A sessão do TW expirou no meio desta revisão, então ficaram sem medição:

- **Item 3** — se o `template_id` do assistente de saque é por aldeia ou da conta. Decide se o
  item é P1 ou irrelevante. Medida: abrir `screen=am_farm` em 2-3 aldeias e comparar os
  `input[name="template_id"]`.
- Qualquer alegação do arquivo antigo sobre comportamento de runtime que eu não pude reproduzir
  não foi copiada pra cá. Se um deles voltar a incomodar, é melhor investigar do zero do que
  confiar no texto velho.

---

## Já resolvido desde o arquivo anterior

Não re-reportar:

| Item antigo | Resolvido em |
|---|---|
| Modo Silêncio sequestrava Coleta/Saque/Muralha/Auto-ATK até o F5 | v11.156.0 |
| `FREEZEKEY` escrito e nunca lido | agora tem leitor (`010-core.js:963`) |
| Teto de nobres zerava quando o comando pousava | v11.157.0–11.159.0 |
| Projeção de lealdade cega pro que pousa depois | v11.159.0 / v11.160.0 |
| Atribuição avulsa atropelando o grupo do modelo, calada | v11.161.0 |
| Equilíbrio esquecia recurso na estrada e reenviava até transbordar | v11.162.0 |
| Fila do Equilíbrio favorecia aldeia grande | v11.163.0 |
| Exportar/importar modelo "perdia flags de demolição" | não procede mais (ver item 6) |
