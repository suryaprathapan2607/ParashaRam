"""Parasaram form backend - stdlib-only WSGI app (no Flask, no n8n).

Endpoints
  POST /api/doubt   "Describe the doubt you have" form -> one notification email per submission
  GET  /health      liveness check

Settings come from backend/.env (never committed - see .env.example):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_APP_PASSWORD, NOTIFY_TO, ALLOWED_ORIGINS

Local test:   python parasaram_api.py            (serves http://127.0.0.1:8000)
PythonAnywhere: point the web app's WSGI file at `application` in this module.
"""
import json
import os
import re
import smtplib
import time
import traceback
from collections import defaultdict, deque
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_env(path=os.path.join(BASE_DIR, ".env")):
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())


load_env()
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_APP_PASSWORD = os.environ.get("SMTP_APP_PASSWORD", "").replace(" ", "")  # Google shows it as "xxxx xxxx xxxx xxxx"
NOTIFY_TO = os.environ.get("NOTIFY_TO", SMTP_USER)
ALLOWED_ORIGINS = {o.strip() for o in os.environ.get(
    "ALLOWED_ORIGINS", "https://suryaprathapan2607.github.io").split(",") if o.strip()}

WORD_LIMIT = 500
MAX_BODY_BYTES = 20_000
RATE_LIMIT = 5            # submissions per IP ...
RATE_WINDOW_SECONDS = 600  # ... per 10 minutes
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# field name in the JSON payload -> (label in the email, max length, required)
DOUBT_FIELDS = [
    ("name", "Name", 120, True),
    ("contact", "Email", 200, True),
    ("phone", "Phone", 30, True),
    ("dateOfBirth", "Date of Birth", 20, True),
    ("timeOfBirth", "Time of Birth", 20, True),
    ("placeOfBirth", "Place of Birth", 200, True),
    ("message", "Doubt", 4000, True),
]

_recent = defaultdict(deque)


def rate_limited(ip):
    now = time.time()
    hits = _recent[ip]
    while hits and now - hits[0] > RATE_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= RATE_LIMIT:
        return True
    hits.append(now)
    return False


def clean(value, max_len):
    return str(value or "").strip()[:max_len]


def validate_doubt(payload):
    data, errors = {}, []
    for key, label, max_len, required in DOUBT_FIELDS:
        data[key] = clean(payload.get(key), max_len)
        if required and not data[key]:
            errors.append(f"{label} is required.")
    if data["contact"] and not EMAIL_RE.match(data["contact"]):
        errors.append("Please enter a valid email address.")
    words = data["message"].split()
    if len(words) > WORD_LIMIT:
        data["message"] = " ".join(words[:WORD_LIMIT])
    data["wordCount"] = min(len(words), WORD_LIMIT)
    data["submittedAt"] = clean(payload.get("submittedAt"), 40)
    data["source"] = clean(payload.get("source"), 300)
    return data, errors


def build_doubt_email(d):
    msg = EmailMessage()
    msg["Subject"] = f"New Doubt - {d['name']}"
    msg["From"] = formataddr(("Parasaram Website", SMTP_USER))
    msg["To"] = NOTIFY_TO
    msg["Reply-To"] = formataddr((d["name"], d["contact"]))  # hit Reply to answer the viewer directly
    msg["Message-ID"] = make_msgid(domain="parasaram.local")
    lines = [
        "A new question was submitted on the Parasaram website.",
        "",
        f"Name:            {d['name']}",
        f"Email:           {d['contact']}",
        f"Phone:           {d['phone']}",
        f"Date of Birth:   {d['dateOfBirth']}",
        f"Time of Birth:   {d['timeOfBirth']}",
        f"Place of Birth:  {d['placeOfBirth']}",
        f"Word count:      {d['wordCount']}",
        "",
        "Doubt:",
        d["message"],
        "",
        f"Submitted at:    {d['submittedAt'] or 'n/a'}",
        f"Page:            {d['source'] or 'n/a'}",
    ]
    msg.set_content("\n".join(lines))
    return msg


def send_email(msg):
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_APP_PASSWORD)
        s.send_message(msg)


def cors_headers(origin):
    if origin in ALLOWED_ORIGINS:
        return [("Access-Control-Allow-Origin", origin),
                ("Access-Control-Allow-Methods", "POST, OPTIONS"),
                ("Access-Control-Allow-Headers", "Content-Type"),
                ("Vary", "Origin")]
    return []


def respond(start_response, status, body, origin):
    raw = json.dumps(body).encode("utf-8")
    headers = [("Content-Type", "application/json"), ("Content-Length", str(len(raw)))]
    start_response(status, headers + cors_headers(origin))
    return [raw]


def handle_doubt(environ, start_response, origin):
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
    except ValueError:
        length = 0
    if length <= 0 or length > MAX_BODY_BYTES:
        return respond(start_response, "400 Bad Request", {"message": "Invalid submission."}, origin)
    try:
        payload = json.loads(environ["wsgi.input"].read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError
    except (ValueError, UnicodeDecodeError):
        return respond(start_response, "400 Bad Request", {"message": "Invalid submission."}, origin)

    ip = (environ.get("HTTP_X_FORWARDED_FOR") or environ.get("REMOTE_ADDR") or "").split(",")[0].strip()
    if rate_limited(ip):
        return respond(start_response, "429 Too Many Requests",
                       {"message": "Too many submissions - please try again in a few minutes."}, origin)

    data, errors = validate_doubt(payload)
    if errors:
        return respond(start_response, "400 Bad Request", {"message": " ".join(errors)}, origin)

    try:
        send_email(build_doubt_email(data))
    except Exception as exc:  # SMTP/network failure - the site shows its own retry message
        print(f"[doubt] email send failed: {exc!r}", flush=True)
        traceback.print_exc()  # goes to the PythonAnywhere error log
        return respond(start_response, "502 Bad Gateway", {"message": "Could not send right now."}, origin)

    print(f"[doubt] notified {NOTIFY_TO} about submission from {data['contact']}", flush=True)
    return respond(start_response, "200 OK", {
        "status": "received",
        "message": "Thank you. Your question has been received and will be reviewed personally.",
        "showBookingLink": True,
    }, origin)


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO", "")
    origin = environ.get("HTTP_ORIGIN", "")

    if method == "OPTIONS":
        start_response("204 No Content", cors_headers(origin))
        return [b""]
    if path == "/health" and method == "GET":
        return respond(start_response, "200 OK", {"status": "ok"}, origin)
    if path == "/api/doubt" and method == "POST":
        return handle_doubt(environ, start_response, origin)
    return respond(start_response, "404 Not Found", {"message": "Not found."}, origin)


if __name__ == "__main__":
    from wsgiref.simple_server import make_server
    print("Serving on http://127.0.0.1:8000")
    make_server("127.0.0.1", 8000, application).serve_forever()
