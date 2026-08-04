"""Validador do tw-manager.user.js — roda em 1 segundo, antes de publicar.

    python tools/check.py

Nao executa o script; so olha o texto. Pega a classe de erro que ja derrubou o
painel inteiro em producao (v10.5.0: `const CARRY` declarado duas vezes).
A checagem de sintaxe DE VERDADE e complementar: subir tools/servir.py e rodar
`new Function(src)` no navegador.

Saida != 0 = nao publique.
"""
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALVO = os.path.join(RAIZ, "tw-manager.user.js")

erros = []
avisos = []


def ler():
    return open(ALVO, encoding="utf-8", errors="surrogatepass").read()


def sem_strings_nem_comentarios(src):
    """Devolve o codigo com strings, comentarios e literais de regex trocados por
    espacos, preservando as quebras de linha (pra numerar certo)."""
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        # comentario de linha
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
            continue
        # comentario de bloco
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append("".join(ch if ch == "\n" else " " for ch in src[i:j]))
            i = j
            continue
        # string / template
        if c in "\"'`":
            q, j = c, i + 1
            while j < n:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == q:
                    j += 1
                    break
                if src[j] == "\n" and q != "`":
                    break
                j += 1
            out.append("".join(ch if ch == "\n" else " " for ch in src[i:j]))
            i = j
            continue
        # literal de regex: '/' que nao segue algo que possa terminar uma expressao
        if c == "/":
            k = len(out) - 1
            ant = ""
            for pedaco in reversed(out):
                s = pedaco.strip()
                if s:
                    ant = s[-1]
                    break
            if ant not in ")]}" and not (ant.isalnum() or ant == "_"):
                j = i + 1
                dentro_classe = False
                while j < n:
                    if src[j] == "\\":
                        j += 2
                        continue
                    if src[j] == "[":
                        dentro_classe = True
                    elif src[j] == "]":
                        dentro_classe = False
                    elif src[j] == "/" and not dentro_classe:
                        j += 1
                        break
                    elif src[j] == "\n":
                        break
                    j += 1
                out.append(" " * (j - i))
                i = j
                continue
        out.append(c)
        i += 1
    return "".join(out)


def checa_duplicados(limpo):
    """const/let declarados 2x no mesmo bloco. O script nao carrega quando isso acontece.

    A primeira versao so olhava indentacao de 2 espacos (o escopo do IIFE), porque foi
    assim que o CARRY duplicado derrubou a v10.5.0. So que o mesmo erro DENTRO de uma
    funcao quebra igual, e passou batido: em ccInjetarPraca eu declarei `const q` para os
    parametros da URL e ja existia um `const q` mais abaixo para consultar o DOM. O
    check.py deu 'ok, 0 avisos' e o script inteiro nao carregava.

    Agora vale em qualquer profundidade. O escopo e aproximado pela indentacao: quando ela
    diminui, os escopos mais internos sao descartados — e por isso dois blocos irmaos no
    mesmo nivel (dois `if` seguidos, por exemplo) podem reusar o nome sem alarme falso.
    """
    pilha = []   # lista de (indent, {nome: linha})
    for num, linha in enumerate(limpo.split("\n"), 1):
        if not linha.strip():
            continue
        ind = len(linha) - len(linha.lstrip(" "))
        while pilha and pilha[-1][0] > ind:
            pilha.pop()
        m = re.match(r"^\s*(?:const|let|var|function|async function)\s+([A-Za-z_$][\w$]*)", linha)
        if not m:
            continue
        if not pilha or pilha[-1][0] < ind:
            pilha.append((ind, {}))
        escopo = pilha[-1][1]
        nome = m.group(1)
        if nome in escopo:
            onde = "no escopo do IIFE" if ind == 2 else "no mesmo bloco (indentacao %d)" % ind
            erros.append("identificador '%s' declarado 2x %s "
                         "(linhas %d e %d) — o script nao carrega" % (nome, onde, escopo[nome], num))
        else:
            escopo[nome] = num


def checa_balanceamento(limpo):
    par = {"(": 0, "{": 0, "[": 0}
    fecha = {")": "(", "}": "{", "]": "["}
    for ch in limpo:
        if ch in par:
            par[ch] += 1
        elif ch in fecha:
            par[fecha[ch]] -= 1
    ruins = {k: v for k, v in par.items() if v != 0}
    if ruins:
        erros.append("delimitadores desbalanceados: %s "
                     "(compare com o HEAD antes de concluir que e erro)" % ruins)


def checa_guarda_captcha(src):
    """Todo *Tick() deve consultar captchaBlocked(); senao o modulo continua
    enviando durante o bot-check."""
    for m in re.finditer(r"\basync function (\w*[Tt]ick)\s*\(", src):
        nome = m.group(1)
        corpo = src[m.start():m.start() + 1200]
        if "captchaBlocked()" not in corpo:
            avisos.append("%s() nao consulta captchaBlocked() na entrada" % nome)


def checa_versao(src):
    h = re.search(r"^// @version\s+([\d.]+)", src, re.M)
    c = re.search(r"^\s*const VERSION = '([\d.]+)';", src, re.M)
    if not h or not c:
        erros.append("nao achei @version no cabecalho ou const VERSION")
        return
    if h.group(1) != c.group(1):
        erros.append("@version (%s) != const VERSION (%s) — o Tampermonkey usa o do "
                     "cabecalho; dessincronizado quebra o auto-update" % (h.group(1), c.group(1)))
        return
    try:
        antigo = subprocess.run(["git", "-C", RAIZ, "show", "HEAD:tw-manager.user.js"],
                                capture_output=True, text=True, encoding="utf-8",
                                errors="replace").stdout
        m = re.search(r"^// @version\s+([\d.]+)", antigo, re.M)
        if m and m.group(1) == h.group(1):
            def chave(v):
                return tuple(int(x) for x in v.split("."))
            avisos.append("versao %s igual a do ultimo commit — lembre de bumpar" % h.group(1))
    except Exception:
        pass


def checa_bom(caminho):
    with open(caminho, "rb") as f:
        if f.read(3) == b"\xef\xbb\xbf":
            erros.append("arquivo comeca com BOM — remova (o Tampermonkey engasga)")


def checa_painel_inteiro(src, limpo):
    """O painel montado em UMA expressao de strings somadas chegou inteiro no innerHTML?

    Se uma linha do meio perde o `+`, o JavaScript NAO reclama: o Automatic Semicolon
    Insertion fecha o comando ali e o resto vira expressao solta, avaliada e descartada.
    O painel nasce sem metade das partes e nada aparece no console.

    Aconteceu na v11.18.0: sobraram cabecalho e abas, o corpo inteiro sumiu. Nem este check
    nem `new Function(src)` pegaram, porque o arquivo estava sintaticamente VALIDO -- e o corte
    e invisivel no texto (nao ha `;` nenhum onde o ASI fecha).

    Analisa o codigo SEM strings nem comentarios. Uma linha continua a expressao se: termina em
    operador, OU fica dentro de ( [ { aberto, OU a proxima linha comeca com operador.
    """
    FIM_OK = ("+", "(", ",", "=>", "?", ":", "&&", "||", "[", "{", ".", "=", "!", "&", "|")
    INI_OK = ("+", "?", ":", ".", "&&", "||", ")", "]", "}", ",", ";")
    linhas = limpo.split(chr(10))
    cruas = src.split(chr(10))
    for i, linha in enumerate(linhas):
        if "innerHTML" not in linha or "=" not in linha:
            continue
        if "twmgr-head" not in chr(10).join(cruas[i:i + 40]):
            continue          # so o painel principal; outros innerHTML pequenos nao interessam
        prof = 0
        for j in range(i, min(i + 3000, len(linhas))):
            t = linhas[j]
            nu = t.strip()
            prof += t.count("(") - t.count(")")
            prof += t.count("[") - t.count("]")
            prof += t.count("{") - t.count("}")
            if not nu:
                continue
            if nu.endswith(";") and prof <= 0:
                break                    # fim da expressao, tudo certo
            if prof > 0 or nu.endswith(FIM_OK):
                continue                 # continua por construcao
            # A linha CRUA, nao a limpa: sem as strings, "'</div>' +" vira so "+" e o teste de
            # "comeca com operador" aceitaria exatamente o caso quebrado que eu quero pegar.
            prox = ""
            for k in range(j + 1, min(j + 6, len(linhas))):
                if linhas[k].strip():
                    prox = cruas[k].strip()
                    break
            if prox.startswith(INI_OK):
                continue                 # a proxima linha continua a conta
            bruto = cruas[j].strip()[-55:].encode("ascii", "replace").decode("ascii")
            erros.append(
                "linha %d: a concatenacao do painel nao continua aqui (falta `+`?) -- o ASI "
                "fecha a expressao e todo o resto do painel e descartado em silencio: ...%s"
                % (j + 1, bruto))
            break


def main():
    if not os.path.exists(ALVO):
        print("nao achei", ALVO)
        return 2
    src = ler()
    limpo = sem_strings_nem_comentarios(src)

    checa_bom(ALVO)
    checa_duplicados(limpo)
    checa_balanceamento(limpo)
    checa_guarda_captcha(src)
    checa_versao(src)
    checa_painel_inteiro(src, limpo)

    for a in avisos:
        print("  aviso: %s" % a)
    for e in erros:
        print("  ERRO:  %s" % e)

    if erros:
        print("\n%d erro(s). NAO publique." % len(erros))
        return 1
    print("\nok — %d linhas, %d aviso(s)." % (src.count("\n") + 1, len(avisos)))
    print("Lembre da checagem de sintaxe real: tools/servir.py + new Function(src) no navegador.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
