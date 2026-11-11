"""HTTP minimo con la libreria estandar (sin dependencias nuevas)."""
import json
import urllib.error
import urllib.parse
import urllib.request


class HTTPFail(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def http_json(method: str, url: str, body: dict | None = None, headers: dict | None = None,
              form: dict | None = None, timeout: float = 20) -> dict:
    data = None
    h = dict(headers or {})
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "ignore")
        try:
            msg = json.loads(raw).get("message") or raw
        except Exception:  # noqa: BLE001
            msg = raw
        raise HTTPFail(e.code, str(msg)[:300]) from None
    except Exception as e:  # noqa: BLE001
        raise HTTPFail(0, str(e)) from None
    return json.loads(raw) if raw else {}
