import time, sys, http.server, socketserver

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 18081

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok","service":"DeepSeek Local Python Service"}')
    def log_message(self, fmt, *args):
        print(f"[HTTP] {self.address_string()} - {fmt % args}", flush=True)

print(f"[PythonWorker] Initializing DeepSeek Local Adapter on 127.0.0.1:{PORT}...", flush=True)
with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"[PythonWorker] Ready and listening on http://127.0.0.1:{PORT}", flush=True)
    httpd.serve_forever()
