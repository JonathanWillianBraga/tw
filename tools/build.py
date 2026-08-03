"""Monta o tw-manager.user.js a partir dos modulos em src/.

    python tools/build.py

Concatena TODOS os src/*.js em ordem alfabetica (por isso os prefixos numericos:
00-core, 10-engine, 20-recrutar...) e grava o resultado em tw-manager.user.js na
raiz — o mesmo arquivo que o Tampermonkey baixa pelo @updateURL. O RAW nao muda.

Regra de ouro: o build e uma concatenacao pura, byte a byte. Nada de reindentar,
reordenar ou "consertar" nada aqui. O que esta em src/ e o que vai pro ar.

O src/00-core.js abre a IIFE ( (function () { 'use strict'; ... ) e o ULTIMO
modulo a fecha ( })(); ). Todos compartilham o mesmo escopo lexico — nao ha
import/export; um modulo enxerga as constantes e helpers do core naturalmente.

Depois do build, rode tools/check.py (o pre-commit ja faz isso).

Saida != 0 = build falhou, nao publique.
"""
import glob
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RAIZ, "src")
ALVO = os.path.join(RAIZ, "tw-manager.user.js")


def main():
    if not os.path.isdir(SRC):
        print("ERRO: pasta src/ nao encontrada em %s" % SRC)
        return 1

    modulos = sorted(glob.glob(os.path.join(SRC, "*.js")))
    if not modulos:
        print("ERRO: nenhum modulo *.js em src/")
        return 1

    # Concatenacao binaria: preserva CRLF e qualquer byte exatamente como esta.
    partes = []
    for caminho in modulos:
        with open(caminho, "rb") as f:
            partes.append(f.read())

    saida = b"".join(partes)
    with open(ALVO, "wb") as f:
        f.write(saida)

    print("build OK: %d modulos -> %s (%d bytes)" % (
        len(modulos), os.path.basename(ALVO), len(saida)))
    for m in modulos:
        print("  + %s" % os.path.basename(m))
    return 0


if __name__ == "__main__":
    sys.exit(main())
