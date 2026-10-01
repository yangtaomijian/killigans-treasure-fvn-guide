#!/usr/bin/env python3
"""Serve the assembled site on a fresh local port without browser caching."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


OUTPUT = Path(__file__).resolve().parents[1] / "_site"


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(OUTPUT), **kwargs)

    def send_head(self):
        # Always send the current file, even if a browser supplies a cached timestamp.
        for name in ("If-Modified-Since", "If-None-Match"):
            if name in self.headers:
                del self.headers[name]
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    if not (OUTPUT / "index.html").is_file():
        raise SystemExit("Build the bilingual site before starting its preview.")
    # Port zero asks the OS for an available ephemeral port on each invocation.
    with ThreadingHTTPServer(("127.0.0.1", 0), PreviewHandler) as server:
        print(f"http://127.0.0.1:{server.server_port}/index.html", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
