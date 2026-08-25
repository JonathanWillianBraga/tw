# Melhorias — backlog priorizado

Revisão anterior em **2026-08-13**. Repassada em **2026-08-25** (v11.221.0 e v11.222.0), item a item,
contra o código de hoje — quase 60 versões depois. Boa parte do arquivo antigo estava
desatualizada; ver as duas seções de resolvidos.

## Como ler isto

A ordem é por **quanto dói**, não por módulo:

| | Critério |
|---|---|
| **P0** | Gasta recurso ou tropa **sem volta** |
| **P1** | Para de funcionar (ou age errado) **em silêncio** |
| **P2** | Degrada com o tempo — cresce sem limite, decide com dado velho |
| **P3** | Armadilha pra quem for mexer depois; hoje não quebra nada |

Cada item diz **como foi verificado**. Item resolvido: apague. Isto é memória de trabalho, não
contrato — as linhas andam, confira antes de mexer.

---

## Aberto

### 1. Apoio em massa manda a quantidade CHEIA pra cada alvo — P2

`175-cc-rico.js` · `ccMassaEnviar` / `ccMassaResolver`

Com "dividir" desmarcado, `resolvido` é calculado **uma vez** contra `v.avail` e cada alvo recebe
uma cópia inteira. `v.avail` é um snapshot: não desconta o que já saiu. Então:

- `50%` com 2 alvos → 50% + 50% = manda tudo. **É o que o usuário pediu**, funciona.
- `tudo` com 2 alvos → tenta mandar 100% duas vezes. O primeiro leva, o segundo falha.
- `60%` com 2 alvos → o segundo envio pede mais do que sobrou.

Não é silencioso (as falhas aparecem no relatório com ✕) e não perde tropa — por isso P2 e não
P0. Mas o relatório fica cheio de erro que parece bug do jogo, quando é a conta do próprio módulo.

**Verificação:** lido `ccMassaResolver` (resolve contra `avail`), `ccMassaEnviar` (cópia por alvo,
`avail` nunca decrementado entre envios). Confirmado no código.

**Direção:** descontar do `avail` local a cada envio bem-sucedido, ou barrar na confirmação quando
`pct × alvos > 100`. A confirmação já avisa *"Cada alvo recebe a quantidade CHEIA"* — o aviso é
paliativo, não o conserto.

### 2. `cmdTick()` não consulta `captchaBlocked()` na entrada — P1

O `tools/check.py` cospe esse aviso **a cada build**, e ele está sendo convivido, não resolvido.
Todo outro `*Tick` do repo testa captcha antes de agir; a Central não. Com captcha na tela, ela
continua disparando — e disparo da Central é comando com hora marcada, o tipo de envio que mais
dói perder.

**Verificação:** o próprio `check.py` (é uma regra que alguém escreveu de propósito e depois
passou a ignorar).

**Direção:** ou seguir o padrão dos outros módulos, ou — se houver motivo real pra Central ser
exceção — registrar o motivo no código e tirar a regra do `check.py`. Aviso permanente que
ninguém lê é pior que nenhum aviso: ele treina a gente a ignorar a saída do validador.

### 3. Os `catch (e) {}` vazios, sem critério visível — P3

Distribuídos pelo repo, com concentração em `175-cc-rico`, `020-engine` e `180-centro-comando`.

Amostrei os de `020-engine`: a maioria embrulha `JSON.parse` ou gravação de estatística — onde
engolir o erro é defensável. Mas o padrão é indistinguível a olho do caso onde importa, como o
que engole falha de `getAllVillagesCached()` e segue com o mapa de coordenadas vazio.

**Não auditei todos.** Fica registrado como dívida de leitura, não como uma lista de bugs.

**Direção:** quando o `catch` for proposital, dizer no código (`catch (e) { /* opcional */ }`).
O vazio silencioso vira sinal de que ninguém pensou.

---

## Resolvido nesta passada (v11.222.0)

### Apoio em massa disparava sem confirmação — P0

`ccMassaEnviar` mandava direto no clique: `origens marcadas × alvos colados`, **sem teto e sem
perguntar**. 40 origens e 20 alvos = 800 comandos num clique; no modo `tudo` é o exército inteiro
saindo de casa. Apoio volta, mas volta viagem inteira depois — e até lá a aldeia está vazia.

O agravante é que o padrão já existia **no mesmo arquivo**: `Agendar N comando(s)?` e `Agrupar N
comando(s) em M trem(ns)?` perguntam antes. Esse era o único do tipo que não perguntava.

A confirmação diz **o que vai sair** (nº de envios, origens × alvos, tropa por extenso no modo em
que foi pedida) em vez de "tem certeza?". `TUDO` aparece em caixa alta porque é justamente o modo
em que não há número nenhum na tela pra conferir. `ccBlzEnviar` (Blindagem) ganhou o mesmo — lá é
menos grave, porque o plano está escrito número a número na tela e `b.enviados` impede reenvio.

---

## Resolvido na passada anterior (v11.221.0)

### Teto de cunhagem era por ALVO, não por ciclo — P0

`cunhadas` era declarada **dentro** de `nobleRecrutar()`, que roda **uma vez por alvo**. Cada
alvo zerava o próprio contador: com o padrão de 3 e 4 alvos na fila, o ciclo cunhava em até
**12 aldeias**, enquanto a UI prometia *"quantas aldeias podem cunhar num mesmo ciclo"*. Moeda
não tem desfazer.

Agora o contador é um objeto criado no escopo do ciclo (`nobleTick`) e passado por parâmetro,
igual `usados` e `enviadosNoCiclo` já faziam. Objeto e não número de propósito: número seria
cópia e o teto voltaria a ser por alvo, calado. O resumo do ciclo passou a dizer
`Cunhou em N/M aldeia(s) do teto do ciclo` — antes o gasto só aparecia em linhas soltas no meio
do log.

### Falha de rede DESLIGAVA o módulo Bárbaros do Mapa — P1

`if (!plan) { cfg.running = false; ... }`, e `mapPlanTargets()` devolve `null` **só** em erro de
rede (`village.txt` ou lista de aldeias) — plano vazio volta como objeto. Um 429 desarmava o
módulo de vez, e o botão voltava pro estado "parado" sem nada explicando. Agora reagenda e loga,
como todo o resto do script faz. Usa `cicloMin` (o intervalo real do módulo), não `interval`,
que não existe nesse config.

### Cinco estruturas do `config` cresciam pra sempre — P2

Cada poda tem critério próprio, tirado de **quem lê a estrutura** — não de idade genérica:

| Estrutura | Critério da poda |
|---|---|
| `map.barbConhecidos` | sai vid que sumiu do `village.txt`. **Não** poda pela lista filtrada de bárbaros: ela passa por `minPoints/maxPoints`, e um bárbaro fora da janela voltaria como "NOVO" — falso alarme é pior que a gordura |
| `map.relatoriosLidos` | teto de 3.000, mais novos primeiro. Ordena como **número** (`.sort()` cru compara texto, e "9" > "10", o que jogaria fora justamente os recentes). Pior caso de podar demais: reler um relatório |
| `noble.posFeitos` | sai coord que não está em `conquistadas` **nem** em `alvos` — as duas listas que as três leituras percorrem |
| `lock.reserved` | sai vid que deixou de ser bárbaro. Aqui a poda é covarde de propósito: o endpoint é **toggle**, e apagar a memória de uma aldeia ainda candidata faz o ciclo seguinte **destravar** o que estava travado |
| `noble.vistos` | já tinha teto de 400 (`noblePodaVistos`) antes desta passada |

### Sanitizador de planos RECONSTRUÍA o objeto — P3

`sanPlan` era `.map((it) => ({ b, lvl, en }))` — um molde de três campos. Todo campo fora dele
morria a cada `load()`, ou seja a cada F5, e também na **importação de backup**, calado. Agora
corrige no lugar, como o CLAUDE.md manda e como `c.noble.alvos` já fazia. De quebra: o bloco
`plans.atk/def` duplicava a mesma expressão inline e agora chama `sanPlan`.

### Cache do template B do Saque ignorava a aldeia — era P1, virou P3, foi corrigido

O `vid` não entrava na chave do cache. **Mas a revisão anterior superestimou o impacto**: existe
um único chamador, e ele sempre passa `CUR_VID`. O bug estava dormente — funcionava por
acidente, não por desenho. Virou cache por aldeia mesmo assim (custa uma chave) e saiu da lista
de "não verificado": não era preciso sessão logada pra decidir, bastava contar os chamadores.

---

## O arquivo de 13/08 estava errado nestes pontos

Registrado pra não voltar como "achado" numa próxima revisão:

| O que ele afirmava | O que era verdade |
|---|---|
| `getVillagePoints` — cache sem validade nenhuma (P2) | **Já resolvido na v11.199.0**: TTL de 6h e cache em disco (`PONTOS_TTL_MS`) |
| `noble.vistos` sem poda | **Já resolvido**: `noblePodaVistos()`, teto de 400, chamado nos dois caminhos de escrita |
| Cache do template B "manda a composição errada de toda aldeia menos a primeira" | Só existe um chamador e ele passa sempre a mesma aldeia. Estava dormente, não ativo |
| Item listado como "precisa de sessão logada pra verificar" | Não precisava: a pergunta certa era quantos chamadores existem, não como o jogo se comporta |

**Lição pra próxima revisão:** antes de classificar um item por gravidade, contar os chamadores.
Dois dos itens mudaram de prioridade só com um `grep`.

---

## Resolvido em versões anteriores

| Item | Resolvido em |
|---|---|
| Modo Silêncio sequestrava Coleta/Saque/Muralha/Auto-ATK até o F5 | v11.156.0 |
| Teto de nobres zerava quando o comando pousava | v11.157.0–11.159.0 |
| Projeção de lealdade cega pro que pousa depois | v11.159.0 / v11.160.0 |
| Atribuição avulsa atropelando o grupo do modelo, calada | v11.161.0 |
| Equilíbrio esquecia recurso na estrada e reenviava até transbordar | v11.162.0 |
| Fila do Equilíbrio favorecia aldeia grande | v11.163.0 |
