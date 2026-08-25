# CLAUDE.md — guia do repositório

Instruções para assistentes de IA (e humanos) que forem mexer neste projeto.

## ⚠️ A regra de ouro

**NÃO edite `tw-manager.user.js` na raiz — ele é GERADO.**

A fonte da verdade são os módulos em **`src/*.js`**. Você edita o módulo certo e
**roda o build**, que reescreve o `tw-manager.user.js`. Editar o gerado direto: seu
trabalho some no próximo build, e o `check.py` não vai te salvar.

## Fluxo de desenvolvimento

```bash
# 1. edite o módulo certo em src/ (ex: src/065-mercado.js)
# 2. monte o userscript a partir dos módulos:
python tools/build.py
# 3. valide antes de publicar (roda no pre-commit também):
python tools/check.py
# 4. commite src/ E o tw-manager.user.js gerado, juntos.
```

O Tampermonkey baixa o `tw-manager.user.js` gerado pelo `@updateURL` (aponta pra
`main`). Por isso o arquivo gerado **fica commitado** no repo — se você editar `src/`
e esquecer de buildar, todo mundo continua recebendo a versão velha.

### Validação

- `python tools/check.py` — olha o TEXTO: pega `const` declarado 2x no mesmo escopo
  (o erro que já derrubou o painel inteiro), `@version` dessincronizado do
  `const VERSION`, delimitadores desbalanceados, BOM. Saída ≠ 0 = não publique.
- Sintaxe de VERDADE (motor JS): `node -e "new Function(require('fs').readFileSync('tw-manager.user.js','utf8'))"`
  ou suba `python tools/servir.py` e rode `new Function(document.body.innerText)` no console.

## Como o build funciona

`tools/build.py` é uma **concatenação pura, byte a byte** de `src/*.js` em ordem
**alfabética** (por isso os prefixos numéricos). Nada de reindentar, reordenar ou
"consertar" nada no build — o que está em `src/` é o que vai pro ar.

- **`010-core.js` ABRE a IIFE** (`(function () { 'use strict'; ...`) e declara as
  constantes/helpers compartilhados.
- **`180-centro-comando.js` FECHA a IIFE** (`})();`) e roda o bootstrap.
- Todos os módulos compartilham **o mesmo escopo léxico** — **não há import/export**.
  Um módulo enxerga as constantes e funções dos outros naturalmente (funções são
  içadas/hoisted; `const`/`let` precisam já ter executado, e a ordem é a numérica).
- **Prefixos de 3 dígitos com folga** (`010`, `020`, … `180`) pra caber inserção
  futura sem quebrar a ordem.
- **Exceção — ilha isolada:** o Centro de Comando rico é **embrulhado numa IIFE aninhada
  própria**, que **abre em `171-cc-nucleo.js` e fecha em `178-cc-painel.js`**. Nenhum arquivo
  do meio abre ou fecha chave de IIFE — os sete formam UM escopo léxico só. Os ~465 nomes
  internos (`cc*`/`cmd*`) ficam presos ali e NÃO colidem com o resto; os helpers do escopo
  externo entram por closure.
  - Os `const`/`let` de topo da ilha vivem **no núcleo**, que vem primeiro de propósito:
    inicializador que executa (`const _mchan = ... new MessageChannel()`) depende da ordem
    do arquivo. Função pode morar em qualquer um dos sete (são içadas); `const`, não.
  - Foi cortado de `175-cc-rico.js` (5297 linhas) na v11.224.0, **por nome de função e não
    por comentário de seção** — era comum uma função de uma aba morar fisicamente dentro do
    bloco de outra (`ccMassaEnviar` vivia dentro da seção da Blindagem). Era isso que fazia
    "mexer numa aba quebrar a outra".

### Abas do painel

A barra principal tem **9 abas**. `Muralha` e `Mapa` NÃO são abas: viraram **sub-abas dentro do
Saque** (v11.16.0) — `subBtn()` monta a barra, `showFarmSub()` troca, e os painéis são
`#twmgr-sub-farm|wall|map`. O Cadeado vive dentro do Mapa, então foi junto. O indicador de
atividade fica no botão da sub-aba, e a aba Saque acende se qualquer um dos três estiver rodando.
Chaves de módulo (`wall`, `map`) seguem valendo em `config`, `refreshCards` e `pushLog`.

## Convenções

- **Versão:** ao publicar, bumpe `@version` **e** `const VERSION` (em `src/010-core.js`)
  **juntos** — o `check.py` barra se divergirem.
- **CRLF:** os arquivos usam quebra de linha Windows (CRLF). O build preserva byte a byte.
- **Estado do usuário:** fica no `localStorage` do jogo (`twMgr_<mundo>`); reinstalar o
  script não apaga config.
- **Backup (`155-backup.js`) não tem lista de campos** — ele copia a string crua de **toda
  chave `twMgr*`**. Campo novo dentro de `config` entra no export sozinho; não existe lista
  pra atualizar. Duas coisas, porém, quebram isso em silêncio:
  1. **Chave nova de `localStorage` sem o prefixo `twMgr`** fica de fora do backup e o
     usuário perde aquilo ao trocar de PC. Nomeie `twMgr_<mundo>_<coisa>` (ou `twMgr_<coisa>`
     se for global, tipo o estado da UI). A única exceção deliberada é `_lock`, que é
     arbitragem de aba e não pode viajar.
  2. **Sanitizador do `load()` que RECONSTRÓI objeto** (`lista.map((x) => ({a, b}))` com
     campos escolhidos a dedo) apaga o que não está no molde — inclusive campo importado de
     outro PC e campo que outro módulo gravou ali. Sanitize **corrigindo/filtrando no lugar**
     (é o que `c.noble.alvos` faz), nunca remontando.
- **Um módulo por preocupação.** Se um módulo quebra em runtime, o bootstrap usa
  `try/catch` por módulo pra o resto continuar — mas erro de SINTAXE derruba o bundle
  inteiro (é um arquivo só). Por isso o `check.py`/parse antes de commitar.

## Estrutura dos módulos

| Prefixo | Módulo |
|---|---|
| `010-core` | header UserScript, constantes, helpers, abre a IIFE |
| `020-engine` | motor auto-ATK/coleta/saque, timing, envio |
| `030-recrutar` `040-tropas` | recrutamento, grade de tropas, `getAllVillages` |
| `050-envio` | primitivas de ataque/apoio compartilhadas (era o módulo Fakes) |
| `060-planner` `065-blindagem` `070-paladino` | coordenado (a Blindagem é uma seção DENTRO da aba dele), paladino |
| `075-mercado` `080-edificios` `082-pesquisa` `085-obra` | mercado, **Construções** (rotulado assim na UI), pesquisa do Ferreiro, obra |
| `095-saque-tplB` `100-barbaros-mapa` | saque template B, bárbaros do mapa (o `090-bb`/Cultivo foi aposentado na v11.15.0) |
| `110-cadeado` `120-etiqueta` | reserva de bárbara, auto-rótulo |
| `130-captcha` `140-painel-controllers` `150-painel-ui` | captcha, controladores, UI do painel |
| `155-backup` | exportar/importar a config inteira (todas as chaves `twMgr*`) |
| `160-desviar` `170-mapa` | desviar, filtros do mapa |
| `171-cc-nucleo` | **ABRE a ilha do Centro de Comando** — estado, motor de precisao, silencio, despachante, tempo de viagem |
| `172-cc-praca` | CC: superficie compartilhada (origens, tropas, previa, fila, comandos do jogo) |
| `173-cc-operacao` | CC: aba Operacao (`ccOp*`) |
| `174-cc-atkmassa` | CC: aba Ataque em massa (`ccAtkm*`) |
| `175-cc-apoiomassa` | CC: aba Apoio em massa (`ccMassa*`) |
| `176-cc-blindagem` | CC: aba Blindagem da tribo (`ccBlz*`) |
| `177-cc-calibrar` | CC: calibracao do agendador (`ccCalib*`) — mede o lead real com comando de verdade e cancela em seguida |
| `178-cc-painel` | CC: monta o HTML, injeta nas telas, e **FECHA a ilha** |
| `180-centro-comando` | motor de precisão `cc*` + bootstrap + fecha a IIFE |
