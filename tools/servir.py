"""Serve o userscript num HTTP local pra o navegador poder PARSEAR de verdade.

    python tools/servir.py

Depois abra http://127.0.0.1:8791/script.txt no navegador e rode no console:

    try { new Function(document.body.innerText); 'OK' } catch (e) { e.message }

Por que existe: o check.py so olha o texto. Quem sabe dizer se o JavaScript e
valido e um motor de JavaScript. `file://` e bloqueado, por isso o servidor.
"""
import http.server
import os
import socketserver

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALVO = os.path.join(RAIZ, "tw-manager.user.js")
PORTA = 8791


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        data = open(ALVO, "rb").read()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
print("servindo %s em http://127.0.0.1:%d/script.txt" % (os.path.basename(ALVO), PORTA))
print("Ctrl+C para parar")
socketserver.TCPServer(("127.0.0.1", PORTA), H).serve_forever()
