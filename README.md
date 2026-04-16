# The Daily — Personal Routine Planner

A self-hosted daily planner with a timeline UI, repeating routines, per-day overrides, and completion tracking. Built with Node + Express + SQLite + React.

---

## Deploy on Coolify (recommended)

### 1. Push to a Git repo

```bash
git init && git add . && git commit -m "init"
# push to GitHub / GitLab / Gitea
```

### 2. Create a new Resource in Coolify

- **Source**: your Git repo
- **Build pack**: Dockerfile  *(Coolify auto-detects the `Dockerfile` in the root)*
- **Port**: `8080`

### 3. Set Environment Variables

In Coolify → your service → **Environment Variables**, add:

| Variable | Value |
|---|---|
| `JWT_SECRET` | output of `openssl rand -hex 32` |
| `PASSWORD` | your chosen login password |
| `NODE_ENV` | `production` |
| `DB_PATH` | `/data/daily.db` |

> **After first successful deploy you can delete `PASSWORD`.**  
> The bcrypt hash is stored in the SQLite database. To rotate: add a new `PASSWORD` value and redeploy.

### 4. Persistent Volume

In Coolify → your service → **Storages**, add a volume:

| Container path | 
|---|
| `/data` |

This is where SQLite lives. Without it, your data resets on every redeploy.

### 5. Deploy

Hit **Deploy**. Coolify builds the image (≈ 2–3 min on first build) and starts the container.  
Your planner will be live at the domain Coolify assigns (or your custom domain if configured).

---

## Local development

### Prerequisites
- Node 20+

### Run the backend

```bash
cd server
cp .env.example .env        # fill in JWT_SECRET and PASSWORD
npm install
npm run dev                 # http://localhost:8080
```

### Run the frontend (hot-reload)

```bash
cd web
npm install
npm run dev                 # http://localhost:5173 (proxies /api → :8080)
```

### Run with Docker Compose

```bash
cp server/.env.example .env   # fill in JWT_SECRET and PASSWORD
docker compose up --build
# open http://localhost:8080
```

---

## Backup

Your entire database is one file:

```bash
# On the VPS — path depends on your Coolify volume mount
docker exec <container_name> cp /data/daily.db /data/daily.db.bak

# Or pull it locally
docker cp <container_name>:/data/daily.db ./backup-$(date +%Y%m%d).db
```

Set up a cron on your VPS to copy it to S3 / Backblaze / wherever.

---

## Project layout

```
daily/
├── Dockerfile            # multi-stage: builds web, then slim runtime
├── docker-compose.yml    # for local testing
├── .dockerignore
├── .gitignore
├── server/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js      # Express app, all routes
│       ├── db.js         # SQLite schema + seed data
│       └── auth.js       # bcrypt + JWT cookie auth
└── web/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx       # full UI: timeline, list view, modals
        ├── api.js        # fetch wrapper
        └── index.css
```

---

## Rotating the password

Set `PASSWORD=new-password` in your Coolify env vars and redeploy. The new bcrypt hash replaces the old one in the database on startup. Then delete the `PASSWORD` env var again.
