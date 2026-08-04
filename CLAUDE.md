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
- **Exceção — ilha isolada:** `175-cc-rico.js` (Central de Comando rica) é
  **embrulhado numa IIFE aninhada própria**. Os ~465 nomes internos dele (`cc*`/`cmd*`)
  ficam presos no escopo dele e NÃO colidem com o resto; ele herda os helpers do escopo
  externo por closure. Se for mexer nele, lembre que é um mundo à parte.

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
| `160-desviar` `170-mapa` | desviar, filtros do mapa |
| `175-cc-rico` | **Central de Comando rica (ilha IIFE isolada)** |
| `180-centro-comando` | motor de precisão `cc*` + bootstrap + fecha a IIFE |
