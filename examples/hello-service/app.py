#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""最小示例服务：用来验证 doctor.sh / deploy.sh / rollback.sh 能不能跑通。

零依赖，只用标准库：
    python3 examples/hello-service/app.py 8080
    curl http://127.0.0.1:8080/health
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def add(a, b):
    """业务逻辑单独抽出来，方便被测试覆盖。"""
    return a + b


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"ok": True, "service": "hello-service"})
        else:
            self._send(404, {"ok": False, "error": "not found"})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("listening on http://127.0.0.1:%d" % port)
    srv.serve_forever()


if __name__ == "__main__":
    main()
