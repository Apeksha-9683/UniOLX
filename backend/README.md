# UniOLX Backend — Beginner Setup Guide (Windows)

This guide walks you through running the FastAPI backend on your Windows machine from scratch.
No prior Python experience is assumed.

---

## What You'll Need First

- **Python 3.14** — verify with: `python --version`
- **A Supabase account** — free at [supabase.com](https://supabase.com)
- **A terminal** — use **PowerShell** or **Windows Terminal** (not cmd.exe)

---

## Step 1 — Open a terminal in the backend folder

```powershell
# From the project root (UniOLX/)
cd backend
```

---

## Step 2 — Create a virtual environment

A virtual environment is an isolated box for Python packages.
It keeps the project's packages separate from everything else on your computer.

```powershell
python -m venv venv
```

This creates a `venv/` folder inside `backend/`. You only do this **once**.

---

## Step 3 — Activate the virtual environment

You must do this **every time** you open a new terminal to work on the backend.

```powershell
venv\Scripts\activate
```

Your prompt will change to show `(venv)` at the beginning — that means it's active.

> **Troubleshooting:** If you get a "cannot be loaded because running scripts is disabled" error,
> run this first (one time):
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

---

## Step 4 — Install dependencies

```powershell
pip install -r requirements.txt
```

This downloads and installs all the packages listed in `requirements.txt`.
Wait for it to finish — it may take a minute or two.

---

## Step 5 — Create your .env file

```powershell
copy .env.example .env
```

Now open the new `.env` file in VS Code (or Notepad) and fill in the values:

```
DATABASE_URL=postgresql+psycopg2://postgres.xxxx:YOUR_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
SECRET_KEY=paste_your_generated_key_here
APP_ENV=development
CORS_ORIGINS=http://localhost:5173
```

### Where to get these values

**DATABASE_URL (Supabase):**
1. Log in at [supabase.com](https://supabase.com) → open your project
2. Go to **Project Settings** (gear icon) → **Database**
3. Scroll to **Connection string** → select the **URI** tab
4. Choose **Transaction** mode (port 6543) for Supabase's connection pooler
5. Copy the string and replace `[YOUR-PASSWORD]` with your actual database password

**SECRET_KEY:**
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```
Copy the output and paste it as the value.

> ⚠️ **Important:** The `.env` file is in `.gitignore` and will never be committed to git.
> Never share it or paste it anywhere online.

---

## Step 6 — Start the development server

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

What this command means:
- `app.main:app` — run the `app` object inside `backend/app/main.py`
- `--reload` — automatically restart the server when you save a file
- `--port 8000` — listen on port 8000

You should see output like:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

---

## Step 7 — Test that it works

Open your browser and visit these URLs:

| URL | What you should see |
|-----|---------------------|
| `http://localhost:8000` | `{"message": "UniOLX API is running", "env": "development"}` |
| `http://localhost:8000/health` | `{"status": "ok", "checks": {"api": "ok", "database": {"status": "ok"}}}` |
| `http://localhost:8000/docs` | Interactive API documentation (Swagger UI) |

If `/health` shows `"database": {"status": "error"}`, your `DATABASE_URL` in `.env` is wrong.

---

## Step 8 — Run database migrations (Alembic)

Alembic tracks changes to your database tables, like a version control system for your schema.

```powershell
# Still inside backend/ with (venv) active
alembic upgrade head
```

This runs all pending migrations. The first time, it creates the `alembic_version` tracking table in your Supabase database.

### When you add a new database model (table), generate a migration:

```powershell
alembic revision --autogenerate -m "describe what changed"
alembic upgrade head
```

---

## Daily Workflow

Every time you start working on the backend:

```powershell
cd backend               # 1. Go to the backend folder
venv\Scripts\activate    # 2. Activate the virtual environment (venv)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000   # 3. Start the server
```

Press `Ctrl+C` to stop the server.

---

## Project Structure

```
backend/
├── app/
│   ├── __init__.py     # Makes 'app' a Python package
│   ├── main.py         # FastAPI app, routes, CORS middleware
│   ├── config.py       # Reads settings from environment variables
│   └── database.py     # Database engine, session, and Base model class
├── alembic/
│   ├── env.py          # Alembic configuration (reads .env automatically)
│   ├── script.py.mako  # Template for generated migration files
│   └── versions/       # Auto-generated migration files live here
├── alembic.ini         # Alembic settings file
├── requirements.txt    # Python package list
├── .env.example        # Template — copy this to .env and fill in real values
└── README.md           # This file
```

---

## Common Errors and Fixes

| Error | Likely cause | Fix |
|-------|-------------|-----|
| `ValidationError: DATABASE_URL missing` | `.env` file not created or empty | Follow Step 5 above |
| `could not connect to server` | Wrong DATABASE_URL or Supabase is paused | Check your Supabase project is active, verify URL |
| `venv\Scripts\activate: cannot be loaded` | PowerShell execution policy | Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `ModuleNotFoundError: No module named 'fastapi'` | Virtual environment not activated | Run `venv\Scripts\activate` first |
| Port 8000 already in use | Another server is running | Change port: `uvicorn app.main:app --reload --port 8001` |

---

## Python 3.14 Compatibility Note

All packages in `requirements.txt` are confirmed compatible with Python 3.14:
- FastAPI ≥ 0.115 ✅
- SQLAlchemy ≥ 2.0.41 ✅ (added explicit 3.14 support)
- Alembic ≥ 1.15 ✅
- psycopg2-binary ≥ 2.9.10 ✅
- pydantic-settings ≥ 2.7 ✅
