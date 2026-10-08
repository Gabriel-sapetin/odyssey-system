# OS ODYSSEY — Backend

## Stack
- **Runtime**: Python 3.10+
- **Framework**: FastAPI + Uvicorn
- **Auth**: Supabase Auth (JWT verification)
- **DB**: Supabase (PostgreSQL + RLS)
- **Rate Limiting**: slowapi (in-memory, swap to Redis for multi-instance)
- **Threading**: `concurrent.futures.ThreadPoolExecutor`

## Architecture
```
backend/
├── server.py                  # Uvicorn entry point
├── requirements.txt
├── .env / .env.example
├── app/
│   ├── main.py                # FastAPI app factory + middleware stack
│   ├── config.py              # Environment-based settings
│   ├── middleware/
│   │   ├── rate_limiter.py    # 3-tier rate limiting (global/auth/api)
│   │   ├── security_headers.py# Helmet-equivalent security headers
│   │   ├── request_id.py      # UUID request tracing
│   │   └── sanitize.py        # XSS / injection input cleaning
│   ├── routers/
│   │   ├── auth.py            # POST signup, login, logout, reset
│   │   ├── profile.py         # GET/PATCH /me
│   │   ├── progress.py        # Module completion, streaks, badges
│   │   ├── modules.py         # GET module catalog
│   │   ├── stats.py           # Platform stats + leaderboard
│   │   └── health.py          # Health check / ping
│   └── services/
│       ├── auth.py            # JWT verification dependency
│       ├── supabase_client.py # Admin + user-scoped clients
│       └── thread_pool.py     # ThreadPoolExecutor for CPU work
```

## Security Features
- **Helmet-style headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **CORS allow-list**: Only configured origins accepted
- **3-tier rate limiting**: Global (100/min), Auth (10/min), API (60/min)
- **Input sanitization**: HTML stripping, XSS prevention, NoSQL injection blocking
- **JWT verification**: Every authenticated endpoint validates Supabase tokens
- **Request ID tracing**: UUID attached to every request for log correlation
- **Gzip compression**: Responses > 500 bytes auto-compressed
- **Body size limits**: JSON payloads capped at reasonable sizes

## API Endpoints
| Method | Route                     | Auth     | Rate Limit   | Description              |
|--------|---------------------------|----------|--------------|--------------------------|
| GET    | /api/health/              | No       | 30/min       | Health check             |
| GET    | /api/health/ping          | No       | global       | Simple ping              |
| POST   | /api/auth/signup          | No       | 10/min       | Create new user          |
| POST   | /api/auth/login           | No       | 10/min       | Login, returns JWT       |
| POST   | /api/auth/logout          | Optional | 10/min       | Invalidate session       |
| POST   | /api/auth/reset-password  | No       | 5/min        | Password reset email     |
| GET    | /api/profile/me           | Yes      | 60/min       | Get user profile         |
| PATCH  | /api/profile/me           | Yes      | 60/min       | Update user profile      |
| GET    | /api/progress/            | Yes      | 60/min       | Get progress summary     |
| POST   | /api/progress/complete-module | Yes  | 60/min       | Mark module completed    |
| POST   | /api/progress/streak      | Yes      | 60/min       | Update login streak      |
| POST   | /api/progress/award-badge | Yes      | 60/min       | Award a badge            |
| GET    | /api/modules/             | No       | 60/min       | List all modules         |
| GET    | /api/modules/:id          | No       | 60/min       | Get single module        |
| GET    | /api/stats/               | No       | 30/min       | Platform statistics      |
| GET    | /api/stats/leaderboard    | No       | 20/min       | Top 10 leaderboard       |

## To Start
```bash
cd backend
pip install -r requirements.txt
python server.py
```

The API docs are available at `http://localhost:4000/api/docs` in development mode.
