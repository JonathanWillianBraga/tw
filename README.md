# Tribal Wars Manager

Suíte de automações para **Tribal Wars** (userscript / Tampermonkey), num painel único, arrastável e minimizável. Roda em qualquer página do jogo e opera por `fetch` em segundo plano, com **trava de aba única** (só uma aba age por vez).

> ⚠️ **Aviso:** automação pode violar as regras do jogo (InnoGames). Use por sua conta e risco. Projeto pessoal/educacional.

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

| Aba | O que faz |
|-----|-----------|
| ⚔️ **Alvos** | Auto-ATK em vários alvos, cada um da sua aldeia de origem; reenvia lendo o **retorno real** das tropas. |
| ⛏️ **Coletas** | Coleta (scavenging) em **todas as aldeias**, distribuindo as tropas entre as opções livres e reenviando no retorno. |
| 🐎 **Saque** | Assistente de Saque (template **C**) em todas as aldeias, com filtros de recurso mínimo, distância e muralha. |
| 🏹 **Recrutar** | Recrutamento por **grupo ATK/DEF**: mantém uma janela de fila por edifício e recruta até o alvo de tropas (lê a fila real da tela). |
| 🎭 **Fakes** | Fakes multi-alvo/origem com **chegada em horário marcado** (relógio do servidor), fake eficiente pelo limite de população (pontos). |
| 🏪 **Mercado** | **Cunhagem** (recurso balanceado das aldeias → uma aldeia destino) e **Equilíbrio** (redistribui recurso por tipo, das que sobram pras que faltam, da mais perto). |
| 🏗️ **Edifícios** | Fila de construção planejada por **template ATK/DEF** (ordem estrita); alimenta a demanda de obra do Equilíbrio. |

Recrutar, Edifícios e Equilíbrio se conversam: **tropa e obra têm prioridade**, e o Equilíbrio move a sobra de recurso pra manter tudo funcionando.

## Estrutura

- `tw-manager.user.js` — o userscript completo (fonte da verdade).
