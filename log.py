import json
from http.server import BaseHTTPRequestHandler

from telegram_log import cambodia_now, send_telegram_message


class handler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path != "/api/log":
            self._send_json(404, {"ok": False, "error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0:
                raise ValueError("invalid content length")
            if length > 4096:
                self._send_json(413, {"ok": False, "error": "request is too large"})
                return

            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("request body must be a JSON object")

            event = str(payload.get("event", "unknown"))[:80]
            product = str(payload.get("product", "unknown product"))[:200]
            price = str(payload.get("price", "Not specified"))[:80]
        except (ValueError, TypeError) as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return

        message = (
            "MengHeng Productions\n"
            f"Event: {event}\n"
            f"Product: {product}\n"
            f"Price: {price}\n"
            f"Time: {cambodia_now().strftime('%Y-%m-%d %H:%M:%S ICT')}"
        )
        sent = send_telegram_message(message)
        self._send_json(200 if sent else 502, {"ok": sent})
