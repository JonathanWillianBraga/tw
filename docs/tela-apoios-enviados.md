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

## O corpo do "voltar" — CAPTURADO, não deduzido

    POST /game.php?village=<origem>&screen=place&action=withdraw_selected_unit_counts
         &mode=units
    corpo: from-table=other
           withdraw_unit[<awayId>][<unidade>]=<QUANTIDADE>
           h=<csrf>                                     ← no CORPO, não na URL

**A quantidade é livre.** Dá pra devolver 300 de 1.688.

### Como isso foi obtido, e por que a dedução falhou

Primeiro eu li o HTML da tela e concluí, errado, que só dava pra escolher o TIPO: não há
`input` de número em lugar nenhum da `#units_away`, e a célula com `data-unit-count="130"` não
vira campo nem em clique nem em duplo clique. Também deduzi `checkbox_<u>=on` + `id_<awayId>=on`
a partir dos checkboxes visíveis. Publiquei assim (v11.114.0) e **o servidor ignorou o pedido**.

O que resolveu foi **capturar o formulário do próprio jogo**: marcar as caixas na página e ler
`new FormData(form)` — sem enviar. Aí apareceu o `withdraw_unit[...]`, que o JS do jogo **cria
na hora** e portanto nunca esteve no HTML servido.

Detalhes que só a captura mostrou:

- é preciso **esperar** (~400ms) depois de marcar: ler o FormData na mesma linha pega o estado
  no meio da atualização e traz campo de outra unidade, com valor errado
- o jogo emite um campo pra **cada unidade que aquele apoio tem**, valendo 0 nas que não voltam
- `checkbox_<u>=on` é só atalho de interface e o checkbox da linha **nem `name` tem** — nenhum
  dos dois vai no corpo
- o `h` vai no **corpo** (é um `input[type=hidden]` do formulário), não na URL

**A lição:** ler o HTML mostra o que a tela é; capturar o FormData mostra o que ela ENVIA.
Quando o formulário é montado por JavaScript, só o segundo vale.

### E MESMO ASSIM não bastava — o gate escondido

Com o corpo correto (v11.117.0) a retirada continuou não acontecendo. O que faltava:

    POST /game.php?village=<vid>&screen=settings&ajaxaction=patch_away_unit_checkboxes
    corpo: away_units_checkboxes={"other":["spear","sword"]}
           h=<csrf>

Marcar a coluna da unidade **não é estado de tela**: é preferência de CONTA gravada no servidor,
e a retirada **só aplica as unidades que estiverem nela**. Fora dela, o pedido é descartado —
HTTP 200, sem `.error_box`, sem nada.

A medição que fechou o diagnóstico: com a preferência em `[spear, heavy]`, um pedido de 5
espadachins não movia nada **enquanto 1 cavalaria pesada voltava na mesma requisição**. Gravando
`[sword]` antes, os 5 espadachins voltaram na hora (1688 → 1683). E quantidade parcial funciona:
180 → 170 pedindo 10.

Como foi achado: grampeando `fetch`/`XHR` na página e clicando no checkbox da coluna. Nenhuma
leitura de HTML acharia isso — o efeito colateral do clique estava em outra tela (`settings`).

O módulo salva a preferência anterior, junta com o que precisa, retira, e **devolve a
preferência do usuário no `finally`** — é a tela dele, e deixá-la mexida estragaria a próxima
retirada manual.

**Três versões erradas responderam HTTP 200** (v11.114.0 corpo deduzido, v11.117.0 sem o gate).
Quem denunciou todas foi a releitura da praça. É por isso que a confirmação por efeito não é
opcional aqui.

## Aberto

- se dá pra reduzir as 44 requisições
- o `td[1]` é distância ou tempo? o valor "162.4" parece campos, mas confirmar antes de exibir
