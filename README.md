# Tribal Wars Manager

Suíte de automações para **Tribal Wars** (userscript / Tampermonkey): 11 abas num painel principal arrastável e minimizável, mais o Centro de Comando (painel flutuante à parte) para ataques de precisão. Roda em qualquer página do jogo e opera por `fetch` em segundo plano, com **trava de aba única** (só uma aba age por vez).

> ⚠️ **Aviso:** automação pode violar as regras do jogo (InnoGames). Use por sua conta e risco. Projeto pessoal/educacional.

## Documentação

Arquitetura e **fluxo de cada módulo** ficam em [`docs/`](docs/) — publicados em
**[GitHub Pages](https://jonathanwillianbraga.github.io/tw/)** quando o Pages estiver ligado
(*Settings › Pages › Source: main / pasta `/docs`*).

Comece por [Arquitetura](docs/arquitetura.md): como 33 arquivos viram um userscript, o ciclo
de vida dos módulos e os cinco mecanismos que todos obedecem.

## Instalação (1 clique)

1. Instale a extensão **[Tampermonkey](https://www.tampermonkey.net/)**.
2. Abra este link no navegador:

   ```
   https://raw.githubusercontent.com/JonathanWillianBraga/tw/main/tw-manager.user.js
   ```
3. O Tampermonkey abre a tela de instalação → **Instalar**.

O cabeçalho tem `@updateURL`/`@downloadURL`, então o Tampermonkey **atualiza sozinho** quando sai uma versão nova (ou force em *Tampermonkey → Utilitários → Procurar atualizações*).

As configurações ficam no `localStorage` do jogo (chave `twMgr_<mundo>`) — atualizar/reinstalar o script **não apaga** seus alvos, grupos e templates.

## Módulos

O painel principal (arrastável, minimizável) tem uma aba por área. Algumas abas têm
sub-abas próprias:

| Aba | Sub-abas | O que faz |
|-----|----------|-----------|
| ⛏️ **Coletas** | — | Coleta (scavenging) em **todas as aldeias**, distribuindo tropa entre as opções livres e reenviando no retorno. |
| 🐎 **Saque** | Saque · 🐏 Muralha · 🗺️ Mapa · 🎯 Notas | Assistente de Saque (template **C**/**B**) com filtro de recurso mínimo/distância/muralha; **Muralha** manda aríete nos alvos fichados; **Mapa** varre bárbaros do mapa e traz filtros/badges pra tela nativa (o **Cadeado** de reserva de bárbara pra tribo mora aqui dentro); **Notas** é a ficha de vocação (ataque/defesa) de cada aldeia seguindo a tropa que ela tem. |
| 🏹 **Recrutar** | Modelos · Status | Recrutamento por **grupo ATK/DEF**: mantém janela de fila por edifício e recruta até a meta, lendo a fila real da tela. |
| 🏪 **Mercado** | Cunhagem · Equilíbrio · Solidário · Pacotes | **Cunhagem** (recurso balanceado das aldeias → uma destino), **Equilíbrio** (redistribui por tipo, de quem sobra pra quem falta, priorizando a mais perto), **Solidário** (ajuda outros membros da tribo) e **Pacotes** de mercador. |
| 🏗️ **Construções** | Modelos · Status | Fila de construção planejada por **template ATK/DEF** (ordem estrita); alimenta a demanda de obra do Equilíbrio. |
| ⚗️ **Pesquisa** | — | Espelha o Gerente de conta → Pesquisa **sem Premium**: modelos de prioridade de tropa, atribuídos por aldeia, avançando a fila a cada ciclo. |
| 👑 **Noblar** | Alvos · Cunhar · Pós-conquista | Planeja a conquista: cola coordenadas, calcula de quais aldeias sairiam nobres e quando cada um chega. **Não dispara sozinho** — nobre é caro e irreversível, o envio passa pelo seu OK. |
| 🐴 **Paladino** | — | Treino do paladino pelo regime de 4h (melhor XP/hora), sem hardcodar o id do regime (varia por conta). |
| 🏷️ **Etiquetas** | — | Auto-rotula ataques recebidos usando o próprio recurso do jogo (adivinha a unidade mais lenta pelo tempo de viagem restante). |
| 🏛️ **Obra** | — | Construção por perfil via os 5 grupos nativos do jogo: a aldeia entra no fluxo automaticamente ao ser colocada num grupo, sem cadastro manual. |
| 🛡️ **Apoios** | — | Inverte a visão nativa do jogo: mostra apoio recebido **por destino** (quem está me defendendo), não só tropa fora por origem. |

Recrutar, Construções e Equilíbrio se conversam: **tropa e obra têm prioridade**, e o
Equilíbrio move a sobra de recurso pra manter tudo funcionando.

### Fora da barra de abas

- **🚀 Centro de Comando** — painel flutuante à parte (não é uma aba): coordena ataques/apoios
  de precisão com chegada calibrada no relógio do servidor, fakes multi-alvo, **Operação**
  (várias ondas por alvo, um alvo de cada vez) e **Apoio em massa**. É uma "ilha" isolada no
  código (`src/175-cc-rico.js`) por ter nascido num fork separado.
- **Desviar** — botão em cada linha de ataque recebido: esvazia a aldeia como apoio-fantasma
  pra aldeia mais próxima e cancela sozinho depois que o ataque bate.
- **Mapa** — badges e filtros (só bárbaro / só minhas / só tribo / por pontos) direto na tela
  nativa `screen=map`.

### Script avulso

`avulsos/operacao.user.js` é um **userscript independente**, fora do build do TW Manager:
dispara N comandos de origens/alvos diferentes todos pousando juntos, medindo o tempo de
viagem real (`try=confirm`) em vez de calculado. Existe separado de propósito — faz algo
parecido com o Centro de Comando, mas mexer lá geraria conflito de manutenção.

## Estrutura

O userscript é **modularizado**: a fonte da verdade são os arquivos em `src/`, e o
`tw-manager.user.js` da raiz é **gerado** a partir deles.

- `src/*.js` — os módulos (**fonte da verdade**). Prefixo numérico define a ordem;
  `010-core.js` abre a IIFE e `180-centro-comando.js` fecha. Compartilham o mesmo
  escopo (sem import/export).
- `tw-manager.user.js` — o userscript montado (**gerado — não edite à mão**). É o que
  o Tampermonkey baixa pelo `@updateURL`, por isso fica commitado.
- `tools/build.py` — concatena `src/*.js` → `tw-manager.user.js` (byte a byte).
- `tools/check.py` — validador (roda no pre-commit).

## Desenvolvimento

> **Sim, quem for mexer no código precisa buildar.** Editar o `tw-manager.user.js`
> direto não adianta — o próximo build sobrescreve.

```bash
# 1. edite o módulo certo em src/
# 2. monte o userscript:
python tools/build.py
# 3. valide:
python tools/check.py
# 4. commite src/ E o tw-manager.user.js juntos.
```

Instale o hook que barra commit quebrado (uma vez por clone):

```bash
cp tools/pre-commit .git/hooks/pre-commit
```

Detalhes da arquitetura, convenções e mapa dos módulos: veja [CLAUDE.md](CLAUDE.md).

## Apoie o projeto

Gostou, usa e quer pagar um cafezinho? Pix (chave aleatória):

```
424978b1-2602-4b2a-8489-132d3bf870f3
```

Totalmente opcional — o projeto é livre e continua livre com ou sem.

## Licença

[MIT](LICENSE) — use, copie, modifique e redistribua à vontade, inclusive em fork fechado.
