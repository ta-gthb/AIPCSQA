# AIPCSQA — AI-Powered Customer Support Quality Auditor

An end-to-end platform for automatically auditing call centre agent interactions. Supervisors get real-time transcription, AI-generated quality scores, compliance violation detection, and downloadable PDF reports. Agents can upload call recordings, run live practice simulations, generate performance reports, and message their supervisor — all from a single portal.

---

## Features

- **AI Audit Engine** — Groq LLM scores every call across 5 dimensions (Empathy, Compliance, Resolution, Professionalism, Communication) with letter grades (A+ → F)
- **Speaker Diarization** — AssemblyAI automatically splits uploaded recordings into Agent / Customer turns
- **Supervisor Portal** — Dashboard KPIs, agent management, audit review, compliance tracking, report generation, agent messages inbox
- **Agent Portal** — Live simulation practice, upload recordings, view personal performance, download PDF reports, contact supervisor
- **PDF Reports** — Performance, Compliance, Scorecard, and Custom reports with tiered commentary badges
- **Live Monitor** — WebSocket-based real-time activity feed
- **Role-based auth** — JWT-secured routes for `agent` and `supervisor` roles

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10+, FastAPI, SQLAlchemy (async), Alembic |
| Database | PostgreSQL |
| AI / LLM | Groq API (`llama-3.3-70b-versatile`) |
| Transcription | AssemblyAI (`universal-2`, speaker diarization) |
| Frontend | React 18, single-page app (`App.js`) |
| Auth | JWT (python-jose), bcrypt (passlib) |
| Real-time | WebSockets |

---

## Prerequisites

Make sure the following are installed on your machine before starting:

- **Python 3.10 or higher** — https://www.python.org/downloads/
- **Node.js 18 or higher** (includes npm) — https://nodejs.org/
- **PostgreSQL 14 or higher** — https://www.postgresql.org/download/
- **Git** — https://git-scm.com/

---

## Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/ta-gthb/AIPCSQA.git
cd AIPCSQA
```

---

### 2. PostgreSQL — Create the database

Open your PostgreSQL client (psql, pgAdmin, etc.) and run:

```sql
CREATE DATABASE auditai;
```

Remember the username and password you use — you will need them in the `.env` file.

---

### 3. Backend Setup

#### 3a. Create a virtual environment

```bash
cd backend
python -m venv venv
```

Activate it:

- **Windows:** `venv\Scripts\activate`
- **macOS / Linux:** `source venv/bin/activate`

#### 3b. Install dependencies

```bash
pip install -r requirements.txt
```

#### 3c. Create the environment file

Create a file named `.env` inside the `backend/` directory:

```env
DATABASE_URL=postgresql+asyncpg://<pg_user>:<pg_password>@localhost/auditai
SECRET_KEY=change-me-to-a-long-random-string
OPENAI_API_KEY=<your_groq_api_key>
OPENAI_BASE_URL=https://api.groq.com/openai/v1
REPORT_DIR=./reports
MAX_AUDIO_MB=50
ASSEMBLYAI_API_KEY=<your_assemblyai_api_key>
```

> **Getting API keys:**
> - **Groq** (free) — Sign up at https://console.groq.com → API Keys → Create key. Paste as `OPENAI_API_KEY`.
> - **AssemblyAI** (free — 100 hrs/month) — Sign up at https://www.assemblyai.com → Dashboard → API Key. Paste as `ASSEMBLYAI_API_KEY`.

#### 3d. Create the uploads and reports directories

```bash
mkdir uploads
mkdir reports
```

#### 3e. Start the backend server

```bash
uvicorn main:app --reload
```

The API will be available at **http://localhost:8000**  
Interactive API docs: **http://localhost:8000/docs**

---

### 4. Frontend Setup

Open a **new terminal** and navigate to the frontend directory:

```bash
cd frontend
npm install
npm start
```

The React app will open at **http://localhost:3000**

---

## First-Time Use

### Default Supervisor Account

A default supervisor account is automatically created the first time the backend starts:

| Field | Value |
|---|---|
| **Email** | `supervisor@aipcsqa.com` |
| **Password** | `supervisor@123` |

> **Important:** Change this password after your first login via **Profile → Change Password**.

### Database Tables

All database tables are created automatically when the backend starts for the first time — no migration commands needed.

### Register Agent accounts

Log in as Supervisor → go to **Agents** tab → click **Register New Agent** — fill in the agent's name, email, password, and team.

---

## Project Structure

```
AIPCSQA/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── config.py                # Pydantic settings (reads .env)
│   ├── database.py              # Async SQLAlchemy engine & session
│   ├── websocket_manager.py     # WebSocket broadcast manager
│   ├── models/                  # SQLAlchemy ORM models
│   │   ├── user.py
│   │   ├── agent.py
│   │   ├── call.py
│   │   ├── transcript.py
│   │   ├── audit.py
│   │   ├── violation.py
│   │   ├── report.py
│   │   └── message.py
│   ├── routers/                 # FastAPI route handlers
│   │   ├── auth.py              # Login / register / password change
│   │   ├── agents.py            # Agent CRUD, supervisor messages
│   │   ├── transcripts.py       # Upload, ingest, list transcripts
│   │   ├── compliance.py        # Compliance violations
│   │   ├── dashboard.py         # KPIs, leaderboard, activity feed
│   │   ├── reports.py           # Report generation & download
│   │   ├── live_monitor.py      # WebSocket live feed
│   │   └── simulation.py        # AI customer simulation
│   ├── services/
│   │   ├── ai_auditor.py        # Groq LLM audit logic
│   │   ├── scoring.py           # Agent stats aggregation
│   │   └── customer_bot.py      # AI customer simulation bot
│   ├── requirements.txt
│   └── alembic.cfg              # (auto-generated, not needed manually)
│
├── frontend/
│   ├── src/
│   │   ├── App.js               # Entire React SPA (~2200 lines)
│   │   ├── api.js               # Axios API client
│   │   └── index.js
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (asyncpg driver) |
| `SECRET_KEY` | JWT signing key — use a long random string in production |
| `OPENAI_API_KEY` | Your Groq API key (used for LLM + Whisper) |
| `OPENAI_BASE_URL` | Groq endpoint — keep as `https://api.groq.com/openai/v1` |
| `ASSEMBLYAI_API_KEY` | Your AssemblyAI key for speaker diarization |
| `REPORT_DIR` | Directory where generated report JSON files are stored |
| `MAX_AUDIO_MB` | Maximum upload file size in MB (default: 50) |

---

## Common Issues

**Tables are not created automatically**  
→ They are — just start the backend (`uvicorn main:app --reload`) and all tables will be created on first startup.

**`alembic upgrade head` fails with connection error**  
→ This project does not use Alembic. Tables are auto-created on startup via SQLAlchemy `create_all`.

**AssemblyAI transcription fails with speech_models error**  
→ Ensure `ASSEMBLYAI_API_KEY` is set correctly in `.env` and the backend was restarted after editing the file.

**Frontend shows "Network Error" on login**  
→ Make sure the backend (`uvicorn`) is running on port 8000 before starting the frontend.

**`uvicorn: command not found` (macOS/Linux)**  
→ Make sure the virtual environment is activated: `source venv/bin/activate`

---

## License

This project is for educational and demonstration purposes.
