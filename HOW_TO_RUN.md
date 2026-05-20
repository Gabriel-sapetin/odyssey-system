# 🚀 OS Odyssey — How to Run

A complete guide to running the **OS Odyssey** system locally (backend + frontend) and deploying to production.

---

## 📋 Table of Contents

1. [Prerequisites](#-prerequisites)
2. [Project Structure](#-project-structure)
3. [Database Setup (Supabase)](#-database-setup-supabase)
4. [Backend Setup (FastAPI)](#-backend-setup-fastapi)
5. [Frontend Setup (Static HTML/JS)](#-frontend-setup-static-htmljs)
6. [Running Everything Together](#-running-everything-together)
7. [API Documentation](#-api-documentation)
8. [Deployment](#-deployment)
9. [Troubleshooting](#-troubleshooting)

---

## 🔧 Prerequisites

Make sure you have the following installed on your machine:

| Tool             | Version   | Download Link                                      |
| ---------------- | --------- | -------------------------------------------------- |
| **Python**       | 3.11.9    | https://www.python.org/downloads/release/python-3119/ |
| **pip**          | Latest    | Comes with Python                                  |
| **Git**          | Latest    | https://git-scm.com/downloads                      |
| **VS Code**      | Latest    | https://code.visualstudio.com/ (recommended)       |
| **Live Server**  | Extension | VS Code extension by Ritwick Dey                   |

> **Note:** You also need a [Supabase](https://supabase.com/) account (free tier works) for the database and authentication.

---

## 📁 Project Structure

```
os-odyssey-frontend/
├── os-odyssey/
│   ├── assets/              # Images, icons, and media
│   ├── backend/             # FastAPI backend (Python)
│   │   ├── app/
│   │   │   ├── config.py        # Environment config loader
│   │   │   ├── main.py          # FastAPI app factory
│   │   │   ├── middleware/      # Security headers, rate limiter, request ID
│   │   │   ├── routers/         # API route handlers (auth, profile, progress, etc.)
│   │   │   └── services/        # Business logic & thread pool
│   │   ├── .env.example         # Environment variables template
│   │   ├── requirements.txt     # Python dependencies
│   │   └── server.py            # Uvicorn entry point
│   ├── database/            # SQL schema & migrations
│   │   ├── schema.sql           # Main Supabase schema
│   │   ├── migration-002-badges-streak.sql
│   │   └── migration-003-leaderboard.sql
│   └── frontend/            # Static frontend (vanilla HTML/CSS/JS)
│       ├── css/                 # Stylesheets
│       ├── html/                # HTML pages (index, login, dashboard, sims, etc.)
│       └── js/                  # JavaScript (main.js, supabase.js, simulators)
├── render.yaml              # Render deployment config (backend)
└── vercel.json              # Vercel deployment config (frontend)
```

---

## 🗄 Database Setup (Supabase)

The project uses **Supabase** (hosted PostgreSQL + Auth) as its database.

### Step 1 — Create a Supabase Project

1. Go to [https://supabase.com/](https://supabase.com/) and sign in.
2. Click **"New Project"** and fill in:
   - **Name:** `os-odyssey` (or anything you prefer)
   - **Database Password:** Choose a strong password
   - **Region:** Pick the closest to your location
3. Wait for the project to finish provisioning.

### Step 2 — Run the Schema

1. In your Supabase dashboard, go to **SQL Editor**.
2. Open and run the following files **in order**:

   ```
   os-odyssey/database/schema.sql                      ← Main tables + RLS policies
   os-odyssey/database/migration-002-badges-streak.sql  ← Badges & streak columns
   os-odyssey/database/migration-003-leaderboard.sql    ← Leaderboard support
   ```

3. Paste the contents of each file into the SQL Editor and click **"Run"**.

### Step 3 — Collect Your Keys

Go to **Project Settings → API** in Supabase and note down:

| Key                     | Where to find it                          |
| ----------------------- | ----------------------------------------- |
| `SUPABASE_URL`          | Project URL (e.g., `https://xxx.supabase.co`) |
| `SUPABASE_ANON_KEY`     | `anon` / `public` key                     |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (keep secret!)     |
| `SUPABASE_JWT_SECRET`   | **Settings → API → JWT Secret**           |

---

## ⚙ Backend Setup (FastAPI)

### Step 1 — Navigate to the Backend Directory

```bash
cd os-odyssey/backend
```

### Step 2 — Create a Virtual Environment

```bash
# Create
python -m venv .venv

# Activate (Windows — PowerShell)
.\.venv\Scripts\Activate.ps1

# Activate (Windows — CMD)
.\.venv\Scripts\activate.bat

# Activate (macOS / Linux)
source .venv/bin/activate
```

> You should see `(.venv)` in your terminal prompt when it's active.

### Step 3 — Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 4 — Configure Environment Variables

1. Copy the example file:
   ```bash
   # Windows (PowerShell)
   Copy-Item .env.example .env

   # macOS / Linux
   cp .env.example .env
   ```

2. Open `.env` and fill in your Supabase keys:

   ```env
   # ─── Supabase ───────────────────────────────────────────
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   SUPABASE_JWT_SECRET=your-jwt-secret-here

   # ─── Server ─────────────────────────────────────────────
   PORT=4000
   ENV=development

   # ─── CORS ───────────────────────────────────────────────
   CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000

   # ─── Rate Limiting ──────────────────────────────────────
   RATE_LIMIT_GLOBAL=100/minute
   RATE_LIMIT_AUTH=10/minute

   # ─── Thread Pool ────────────────────────────────────────
   WORKER_THREADS=4

   # ─── Cloudflare Turnstile (optional for dev) ────────────
   TURNSTILE_SECRET_KEY=
   ```

### Step 5 — Start the Backend Server

```bash
python server.py
```

You should see output like:

```
🚀  OS Odyssey API starting up
   Environment : development
   CORS origins: http://localhost:5500, http://127.0.0.1:5500
   Thread pool : 4 workers
INFO:     Uvicorn running on http://0.0.0.0:4000 (Press CTRL+C to quit)
```

✅ **Backend is now running at:** `http://localhost:4000`

---

## 🌐 Frontend Setup (Static HTML/JS)

The frontend is **plain HTML, CSS, and JavaScript** — no build step required. You just need a local static file server.

### Option A — VS Code Live Server (Recommended)

1. Open the **root project folder** (`os-odyssey-frontend`) in VS Code.
2. Install the **Live Server** extension (by Ritwick Dey) if you haven't.
3. Right-click on `os-odyssey/frontend/html/index.html` → **"Open with Live Server"**.
4. The browser will open at `http://127.0.0.1:5500/os-odyssey/frontend/html/index.html`.

### Option B — Python's Built-in HTTP Server

```bash
# From the project root (os-odyssey-frontend)
cd os-odyssey-frontend
python -m http.server 5500
```

Then open: `http://localhost:5500/os-odyssey/frontend/html/index.html`

### Option C — Node.js `serve` (if you have Node installed)

```bash
npx -y serve . -l 5500
```

Then open: `http://localhost:5500/os-odyssey/frontend/html/index.html`

> **Important:** The frontend connects directly to Supabase via the client library loaded from CDN, and calls the backend API at the configured backend URL. Make sure the backend's `CORS_ORIGINS` includes the frontend URL (e.g., `http://localhost:5500`).

---

## 🟢 Running Everything Together

Open **two terminals** and run both services simultaneously:

### Terminal 1 — Backend

```bash
cd os-odyssey/backend
.\.venv\Scripts\Activate.ps1      # Activate venv (Windows)
python server.py                   # Starts on http://localhost:4000
```

### Terminal 2 — Frontend

```bash
# Option A: Use VS Code Live Server (just right-click index.html)
# Option B: From project root
python -m http.server 5500         # Starts on http://localhost:5500
```

### Quick Verification

| Check                         | URL                                                                 | Expected                     |
| ----------------------------- | ------------------------------------------------------------------- | ---------------------------- |
| Backend is alive              | http://localhost:4000                                                | JSON with service info       |
| Health endpoint               | http://localhost:4000/api/health/ping                               | `200 OK`                     |
| API docs (dev mode only)      | http://localhost:4000/api/docs                                      | Swagger UI                   |
| Frontend homepage             | http://localhost:5500/os-odyssey/frontend/html/index.html           | OS Odyssey landing page      |

---

## 📖 API Documentation

When running in **development** mode (`ENV=development`), interactive API docs are available:

| Format     | URL                              |
| ---------- | -------------------------------- |
| Swagger UI | http://localhost:4000/api/docs   |
| ReDoc      | http://localhost:4000/api/redoc  |

### API Routes Overview

| Prefix            | Description                    |
| ----------------- | ------------------------------ |
| `/api/health`     | Health check & ping            |
| `/api/auth`       | Authentication (signup, login) |
| `/api/profile`    | User profile management        |
| `/api/progress`   | Module progress tracking       |
| `/api/modules`    | Course module data             |
| `/api/stats`      | Statistics & leaderboard       |

---

## 🚢 Deployment

### Backend → Render

The project includes a `render.yaml` for one-click deployment to [Render](https://render.com/):

1. Push your code to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.
3. Connect your repo and select the `render.yaml`.
4. Set the environment variables (Supabase keys, `CORS_ORIGINS`, etc.) in the Render dashboard.
5. Deploy!

**Production backend URL:** Provided by Render after deployment.

### Frontend → Vercel

The project includes a `vercel.json` for deployment to [Vercel](https://vercel.com/):

1. Push your code to GitHub.
2. Go to [Vercel Dashboard](https://vercel.com/dashboard) → **Add New Project**.
3. Import your repo.
4. Vercel will auto-detect the static site and apply the `vercel.json` config.
5. Deploy!

> **After deploying both:** Update `CORS_ORIGINS` in the Render backend environment to include your Vercel frontend URL (e.g., `https://os-odyssey.vercel.app`).

---

## ❓ Troubleshooting

### Common Issues

| Problem                                  | Solution                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ModuleNotFoundError` when running backend | Make sure your virtual environment is activated (`.venv`)                                 |
| CORS errors in browser console           | Check `CORS_ORIGINS` in `.env` matches your frontend URL exactly (including port)          |
| `Connection refused` on port 4000        | Ensure the backend is running with `python server.py`                                     |
| Supabase auth not working                | Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct in both backend `.env` and `frontend/js/supabase.js` |
| Frontend pages show blank               | Make sure you're serving from the **project root**, not the `frontend/` subfolder         |
| `pip install` fails                      | Try upgrading pip: `python -m pip install --upgrade pip`                                  |
| Rate limit errors during development     | Increase `RATE_LIMIT_GLOBAL` in `.env` (e.g., `500/minute`)                              |

### Useful Commands

```bash
# Check Python version
python --version          # Should be 3.11.x

# Check if backend venv exists
ls os-odyssey/backend/.venv

# Deactivate virtual environment
deactivate

# Reinstall all dependencies
pip install -r requirements.txt --force-reinstall
```

---

## 📝 Quick Reference (TL;DR)

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd os-odyssey-frontend

# 2. Set up the database
#    → Run schema.sql + migrations in Supabase SQL Editor

# 3. Set up backend
cd os-odyssey/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# → Edit .env with your Supabase keys
python server.py

# 4. Set up frontend (new terminal)
# → Open index.html with VS Code Live Server
# → Or: python -m http.server 5500 (from project root)

# 5. Open browser
# → http://localhost:5500/os-odyssey/frontend/html/index.html
```

---

**Happy learning with OS Odyssey! 🐧✨**
