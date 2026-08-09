# Tela "Apoios enviados" — especificação

Pedido do usuário (ago/2026): uma tela que mostre **cada aldeia que estou apoiando**, com as
tropas somadas por unidade; ao expandir, quais aldeias minhas mandaram apoio pra ela; e a opção
de mandar voltar.

Entra em **Visualizações**, depois de **Tropas**.

---

## Fonte dos dados — confirmado no jogo

O TW não expõe isso agrupado por destino. Só agrupado por ORIGEM. A inversão é nossa.

### Passo 1 — quem tem tropa fora

    /game.php?village=<vid>&screen=overview_villages&mode=units&type=away&page=-1

Medido no br143: **50 linhas, 44 com tropa**. Uma linha por aldeia MINHA:

    [ "001 (470|587) K54", "fora", 1999, 1418, 0, 0, 0, 712, 0, 0, 0, 0, "Tropas" ]

E dois links por linha:

    /game.php?village=53930&screen=overview
    /game.php?village=53930&screen=place&mode=units     ← o detalhe

Isso dá o TOTAL fora por aldeia, mas **não diz onde**.

### Passo 2 — onde cada tropa está

    /game.php?village=<vid>&screen=place&mode=units      → tabela `#units_away`

Confirmado: a tabela existe (`temUnitsAway: true`) e a página traz as coordenadas de destino.

### Passo 3 — inverter

Agrupar por destino em vez de origem. É o que o jogo não faz.

---

## O NÚMERO DE UNIDADES VARIA POR MUNDO

No br143 são **10 colunas** (sem arqueiro e arqueiro a cavalo). No br141 o cabeçalho trouxe
**12**. Ler o conjunto do `<th><img src="...unit_XXX...">` do cabeçalho, nunca fixar a lista —
senão a soma sai deslocada de uma coluna e os números ficam errados sem parecer errados.

---

## Custo

**44 requisições** pra montar a visão completa (uma por aldeia com tropa fora).

Não é pouco: esta conta bate HTTP 429 GLOBAL, e passamos uma sessão inteira caçando isso.
Mitigações:

- é tela que o USUÁRIO abre, não laço de fundo
- espaçar as leituras (o resto do script já usa ~200ms entre requisições)
- cachear por alguns minutos, com botão de recarregar
- ler só as aldeias que o passo 1 disse ter tropa fora

---

## Desenho da tela

    🛡 Apoios enviados                          [ ↻ ]

    ▸ Felipão (474|578)          1.271 🗡  577 ⚔  17 🐴
    ▸ Guto Ferreira (479|583)    2.825 🗡    0 ⚔   9 🐴
    ▾ Tite (480|576)               453 🗡 1.188 ⚔  15 🐴
          de 015 (470|578)          200 🗡   500 ⚔        [ voltar ]
          de 027 (471|591)          253 🗡   688 ⚔  15 🐴 [ voltar ]
                                                  [ voltar tudo ]

---

## Ordem de construção — deliberada

**1. Só leitura.** Risco zero. O usuário confere os números contra o jogo antes de existir
qualquer botão que mova tropa.

**2. Depois o "voltar".**

O voltar é a mesma família de operação do Desviar. E na sessão de ago/2026 descobrimos que a
confirmação de cancelamento de lá estava quebrada de um jeito que reportava **sucesso sempre**:

- `overview_villages&mode=commands` é STATEFUL e redireciona pra `mode=combined`, devolvendo
  zero comando
- e a busca era por regex em links de `info_command`, que são montados por JavaScript e não
  estão no HTML servido

Resultado: "sumiu da lista" era sempre verdadeiro, todo cancelamento virava sucesso, e o log
dizia "tropa voltando" com o exército parado na vizinha.

**A confirmação por efeito tem que estar no botão desde o primeiro dia**, lendo a praça da
origem via `.quickedit-out[data-id]`, e LANÇANDO quando a leitura falha em vez de devolver
"não achei" — que foi exatamente o defeito.

---

## Estrutura de `#units_away` — confirmado

Cabeçalho:

    [ "Aldeia", "<dist>", spear, sword, axe, archer, spy, light, marcher, heavy,
      ram, catapult, knight, snob, "Selecionar tudo", ... ]

Linha:

    td[0]      "050 MALUQUINHO (-=MeNiNo MaLuQuInHo=-) (731|590) K57"   ← destino: nome, dono, coord
    td[1]      "162.4"                                                  ← distância em campos
    td[2..13]  as unidades, na ordem do cabeçalho
    último     checkbox

O `td[0]` traz **nome, dono e coordenada juntos**. A coord sai por regex; o dono vem entre
parênteses ANTES da coord — e pode conter parênteses no próprio nome, então casar do fim pra
frente.

## O "voltar" é um formulário nativo, não cancelamento comando a comando

Boa notícia: a página já tem seleção em massa.

    <input type="checkbox" class="troop-request-selector" data-away-id="1409007878">

    form: method=post
    campos: id_415454344=on · id_371304885=on · ...      (id_<away_id>)
    botão: "Cancelar"

Mesmo padrão do etiquetador automático (`command_ids[<id>]` + `id_<id>=on`) — e ali a lição foi
cara: eu havia removido o campo `id_<id>=on` achando que não existia no formulário, porque minha
captura só olhava um dos dois campos. O módulo parou de etiquetar e o log dizia que funcionava.

**Mandar os dois: o que o formulário tiver, como ele tiver.** Copiar o form inteiro e só marcar
o que interessa, em vez de remontar o corpo à mão.

## Verificação do "voltar" — obrigatória desde o primeiro dia

Confirmar POR EFEITO: reler a `#units_away` da origem e conferir que aquele `away-id` sumiu.

E **LANÇAR** quando a leitura falhar, em vez de devolver "não achei". Foi exatamente esse o
defeito do Desviar: `comandoAindaExiste` devolvia "sumiu" sempre — a tela consultada era
stateful e a regex procurava links montados por JavaScript. Todo cancelamento virava sucesso.

## O parcial: por TIPO, não por quantidade — conferido ao vivo

Inspecionei a `#units_away` no br143 em vez de deduzir. O formulário é:

    POST /game.php?village=<origem>&screen=place&action=withdraw_selected_unit_counts
         &mode=units&h=<csrf>
    corpo: from-table=other
           checkbox_<unidade>=on     ← quais TIPOS voltam (checkbox no <th> da coluna)
           id_<awayId>=on            ← quais APOIOS (checkbox .troop-request-selector da linha)

Duas coisas importantes:

1. **Não existe campo de quantidade.** Apesar do nome da ação (`..._unit_counts`), não há
   `input[type=text|number]` em lugar nenhum da tabela, e a célula da unidade — que tem um
   `data-unit-count="130"` promissor — **não vira input** ao clicar nem ao dar duplo clique
   (testado). A `info_village` do destino também não oferece retirada.
   Marcar "lança" devolve TODAS as lanças daquele apoio.
2. **O checkbox da linha não tem `name`.** Só `class="troop-request-selector"` e
   `data-away-id`. Quem monta `id_<awayId>=on` é o JS do jogo — por isso montamos o corpo à
   mão em vez de serializar o formulário.

A granularidade fina sai de escolher **quais apoios**, já que cada um tem composição própria.

## Aberto

- se dá pra reduzir as 44 requisições
- o `td[1]` é distância ou tempo? o valor "162.4" parece campos, mas confirmar antes de exibir
- o servidor aceitaria um `unit_count_<u>=N`? o nome da ação sugere que sim, mas chutar campo
  em requisição que MOVE TROPA não se faz — só com captura de um envio real do jogo
