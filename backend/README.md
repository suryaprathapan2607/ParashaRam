# Parasaram backend

Plain-Python (standard library only) backend for the website's forms. It replaces the n8n workflows.

| Endpoint | What it does |
|---|---|
| `POST /api/doubt` | "Describe the doubt you have" form. Validates the fields and emails one notification per submission to `NOTIFY_TO`, with Reply-To set to the viewer. |
| `GET /health` | Returns `{"status": "ok"}`. |

## Run locally

```
cd backend
copy .env.example .env      # then fill in SMTP_APP_PASSWORD
python parasaram_api.py              # http://127.0.0.1:8000
```

## Deploy on PythonAnywhere (free)

1. Create a free account at https://www.pythonanywhere.com. Your username becomes the URL: `https://<username>.pythonanywhere.com`.
2. **Consoles → Bash**:
   ```
   git clone https://github.com/suryaprathapan2607/ParashaRam.git
   cp ParashaRam/backend/.env.example ParashaRam/backend/.env
   nano ParashaRam/backend/.env     # paste the Gmail App Password, save with Ctrl+O, Enter, Ctrl+X
   ```
3. **Web → Add a new web app → Manual configuration → Python 3.12** (any version from 3.8 up works).
4. On the Web tab, open the **WSGI configuration file** link, delete everything in it, and paste:
   ```python
   import sys
   sys.path.insert(0, "/home/<username>/ParashaRam/backend")
   from parasaram_api import application
   ```
5. Press the green **Reload** button. Check `https://<username>.pythonanywhere.com/health`; it should show `{"status": "ok"}`.
6. In `script.js`, set the doubt URL to `https://<username>.pythonanywhere.com/api/doubt`.

**Live instance:** https://suryaparasaram2607.pythonanywhere.com (PythonAnywhere user `SuryaParasaram2607`).

**Updating later:** in a Bash console run `cd ParashaRam && git pull`, then press Reload on the Web tab.
**Free-tier upkeep:** log in at least once a month and press "Run until 1 month from today" on the Web tab, or the app is disabled. PythonAnywhere emails a reminder a week before.
**Logs:** Web tab → error log / server log. Each submission prints a `[doubt] ...` line.
