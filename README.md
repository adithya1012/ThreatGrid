# ThreatGrid — Zscaler SOC Dashboard

A full-stack **Security Operations Center (SOC)** dashboard for analysing Zscaler web proxy logs.  
Upload a CSV export, run a 12-rule anomaly detection engine, explore findings through live charts and a log table, run per-row AI / ML analysis, and chat directly with an AI analyst powered by OpenAI and Model Context Protocol (MCP).

---

## Live Demo & Resources

| Resource | Link |
|---|---|
| 🌐 **Hosted App (AWS EC2)** | http://34.229.199.226:5173/ |
| 🐳 **Docker Hub** | https://hub.docker.com/r/adithyasn7/soc_dashboard/tags |
| 🐙 **GitHub Repository** | https://github.com/adithya1012/ThreatGrid |
| 🤗 **HuggingFace Inference Model** | [EgilKarlsen/DistilRoBERTa_Thunderbird-Anomaly_Baseline](https://huggingface.co/EgilKarlsen/DistilRoBERTa_Thunderbird-Anomaly_Baseline) |
| 🎬 **Video Walkthrough** | [Watch on Microsoft Stream](https://purdue0-my.sharepoint.com/:v:/g/personal/seesa01_purdue_edu/IQDJ_00QyCEXRYxtTND6CuI7AewyYcJX7Y-75soeAnf2FHM?nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJTdHJlYW1XZWJBcHAiLCJyZWZlcnJhbFZpZXciOiJTaGFyZURpYWxvZy1MaW5rIiwicmVmZXJyYWxBcHBQbGF0Zm9ybSI6IldlYiIsInJlZmVycmFsTW9kZSI6InZpZXcifX0%3D&e=846b8B) |

**Sample credentials for the hosted app:**

| Field | Value |
|---|---|
| Username | `test` |
| Password | `test12` |

---

## Features

| Feature | Description |
|---|---|
| 📤 **CSV Upload** | Drag-and-drop Zscaler NSS log CSV; rows are parsed and stored in a session-scoped PostgreSQL table |
| 🎲 **Sample CSV Generator** | Generate a realistic 200 row synthetic Zscaler log file directly from the UI — no real data required to try the app |
| 🔍 **12-Rule Anomaly Engine** | Built-in rule engine classifies each row as anomalous or legitimate with a confidence score (0–100) and human-readable reason |
| 📊 **Live Dashboard** | KPI cards, Pie chart (Legitimate vs Anomaly split), hourly Bar chart, and 10 pre-computed security insight cards |
| 📋 **Log Table** | Sortable, searchable, paginated table with inline badge colouring; click any row for an expanded detail panel |
| ✨ **AI Analysis (per row)** | Ask GPT-4o / GPT-4o-mini to explain a single log entry; result shown inline in the expanded row |
| 🤖 **ML Analysis (per row)** | Remote text-classification inference via a Hugging Face dedicated endpoint; returns ranked threat labels with confidence scores |
| 💬 **AI Analyst Chat (MCP)** | Slide-in streaming chat panel; an OpenAI agentic loop uses MCP tools to query _your_ session data in real time (schema introspection + safe SELECT execution) |
| 🔐 **Auth** | Username / password signup and login; all API calls are scoped to the authenticated user via `x-user-id` header |
| 📖 **Swagger UI** | Interactive API docs at `http://localhost:3001/docs` or `http://34.229.199.226:3001/docs` (Fastify-native via `@fastify/swagger`) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Fastify 4 · TypeScript · `pg` (PostgreSQL client) · `fast-csv` · `bcryptjs` · OpenAI SDK |
| **Frontend** | React 18 · Vite 5 · TypeScript · Tailwind CSS v4 · Recharts · `react-markdown` + `remark-gfm` |
| **AI — Chat** | OpenAI `gpt-4o` (streaming) · Model Context Protocol (MCP) SDK · SSE transport |
| **AI — Per-row** | OpenAI `gpt-4o` / `gpt-4o-mini` (selectable in-UI) |
| **ML — Per-row** | Hugging Face Inference Endpoint (text-classification; configurable via `HF_ENDPOINT_URL`) |
| **MCP Server** | Standalone Fastify service · `@modelcontextprotocol/sdk` · SSE transport · two tools |
| **Database** | PostgreSQL 15 |
| **Infra** | Docker Compose · multi-stage Docker builds · nginx (frontend reverse-proxy) |

---

## AI / LLM Usage

> **Project requirement:** *"If you are using AI/LLMs, please document clearly how and where you are using AI to perform a particular task."*

This project uses AI in three distinct ways:

### 1. ML Anomaly Prediction — HuggingFace Inference Endpoint

**Where:** `backend/src/routes/mlAnalysis.ts` → `POST /api/ml/analyze-log`  
**Model:** [`EgilKarlsen/DistilRoBERTa_Thunderbird-Anomaly_Baseline`](https://huggingface.co/EgilKarlsen/DistilRoBERTa_Thunderbird-Anomaly_Baseline)  
**Hosted on:** HuggingFace Dedicated Inference Endpoint  

> **⚠️ Demo / Showcase Integration**  
> This feature demonstrates _how_ a machine-learning model can be wired into a SOC log-analysis pipeline. The model used here (`DistilRoBERTa_Thunderbird-Anomaly_Baseline`) is a **general-purpose text-classification model** — it was not trained on Zscaler proxy logs. For a production deployment, an organisation would need to **train or fine-tune a model in-house** on their own labelled log data (e.g. using Zscaler NSS exports tagged by SOC analysts) to achieve meaningful accuracy.

Each Zscaler log row is serialised into a natural-language sentence and sent to the DistilRoBERTa text-classification model deployed on a HuggingFace Dedicated Inference Endpoint.  
The model returns ranked labels (e.g. `ANOMALY` / `BENIGN`) with confidence scores. The backend normalises the response and returns `{ isAnomaly, confidence, label, allLabels }` to the frontend, where the result is displayed inline in the expanded SOC table row.

```
Log row  →  natural-language sentence  →  HuggingFace endpoint  →  label + confidence score
```

### 2. Per-row AI Analysis — OpenAI GPT

**Where:** `backend/src/routes/aiAnalysis.ts` → `POST /api/ai/analyze-log`  
**Model:** `gpt-4o-mini` (default) · `gpt-4o` · `gpt-3.5-turbo` · `gpt-4-turbo` (user-selectable)  

When a user clicks **✨ Analyze** on any log row, the full row data is structured into a security-analyst prompt and sent to the OpenAI Chat Completions API.  
The model is instructed to act as a senior SOC analyst and return a concise 2-sentence response: the first sentence summarises the threat/risk, the second states the recommended action.  
The response is streamed back and displayed inline in the expanded log row.

```
Log row  →  structured SOC analyst prompt  →  OpenAI  →  2-sentence threat analysis
```

### 3. AI Chat — OpenAI + Model Context Protocol (MCP)

**Where:** `backend/src/mcp/orchestrator.ts` + `backend/src/routes/chat.ts` → `POST /api/chat/:sessionId`  
**Model:** `gpt-4o` (streaming agentic loop)  
**Tools:** MCP server exposes `get_db_context` and `run_read_query`  

The slide-in AI Analyst chat panel lets users ask free-form questions about their uploaded session data (e.g. *"Which users triggered the most anomalies?"*).  
An OpenAI tool-calling loop runs server-side: the model autonomously decides whether to call `get_db_context` (schema introspection) or `run_read_query` (safe SELECT-only SQL) before composing a final markdown answer.  
Results are streamed to the browser as Server-Sent Events (`tool_call`, `text`, `done`, `error`).

```
User message  →  OpenAI agentic loop  →  MCP tool calls → PostgreSQL  →  streaming markdown answer
```

### 4. Code Written with AI Assistance

This project's codebase was developed with the assistance of **Claude Sonnet 4.6** (VSCode Copilot).  
AI assistance was used throughout: scaffolding route handlers, writing anomaly-detection rules, building the MCP orchestrator loop, authoring React components, and composing this documentation.

---

## Architecture

```mermaid
flowchart TD
    Browser(["🌐 Browser\n(React + Vite)"])

    subgraph Docker["Docker Network — threatgrid_net"]
        FE["Frontend :5173"]
        BE["Backend \n Fastify :3001"]
        MCP["MCP Server \n Fastify :3002"]
        DB[("PostgreSQL \n:5432")]
    end

    OpenAI["☁️ OpenAI API\ngpt-4o / gpt-4o-mini"]
    HF["☁️ Hugging Face\nInference Endpoint\n(text-classification)"]

    Browser -->|"HTTP / SSE"| FE
    FE -->|"proxy /api/*"| BE
    BE -->|"SQL via pg"| DB
    BE -->|"SSE transport\nMCP tool calls"| MCP
    MCP -->|"SQL via pg"| DB
    BE -->|"OpenAI SDK streaming"| OpenAI
    BE -->|"fetch + Bearer token"| HF
```

## Prerequisites

| Requirement | Notes |
|---|---|
| Docker + Docker Compose | Required for the fully containerised setup |
| Node.js 18 LTS+ | Local dev only |
| npm 9+ | Local dev only |
| OpenAI API key | Required for AI chat & per-row AI analysis |

---

## Running Locally (Docker)

### 1. Clone

```bash
git clone <repo-url>
cd ThreatGrid
```

### 2. Create `backend/.env`

```bash
# create the file
touch backend/.env
```

Add your keys:

```env
# Required — AI Analyst chat + per-row AI analysis
OPENAI_API_KEY=sk-...

```

> **Without `OPENAI_API_KEY`** the app still starts. CSV upload, dashboards, and SOC rules all work. Chat and AI analysis return a clear error message.

### 3. Build and start all containers

```bash
docker-compose up --build
```

| Service | Local URL | Hosted URL |
|---|---|---|
| Frontend | http://localhost:5173 | http://34.229.199.226:5173 |
| Backend API | http://localhost:3001 | http://34.229.199.226:3001 |
| Swagger UI | http://localhost:3001/docs | http://34.229.199.226:3001/docs |
| MCP Server health | http://localhost:3002/health | — |


### 4. Stop

```bash
docker-compose down          # stop containers, keep DB volume
docker-compose down -v       # stop and delete DB volume (full reset)
```

## Swagger / API Docs

| Environment | URL |
|---|---|
| Local | http://localhost:3001/docs |
| Hosted (AWS EC2) | http://34.229.199.226:3001/docs |

Powered by `@fastify/swagger` + `@fastify/swagger-ui`. All authenticated endpoints expose the `x-user-id` API-key scheme in the Authorize dialog — paste the `id` value returned by `/api/auth/login`.

### Full API Reference

#### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/signup` | — | Register; body `{ username, password }`; returns `{ id, username }` |
| `POST` | `/api/auth/login` | — | Login; body `{ username, password }`; returns `{ id, username }` |

#### Upload & Sessions

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/upload` | ✅ | Multipart CSV (`field: file`); runs anomaly detection; returns session summary |
| `GET` | `/api/sessions` | ✅ | All upload sessions for the authenticated user, newest first |

#### Dashboard (all require `sessionId` and auth)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dashboard/:sessionId/stats` | KPI totals, top threats, risky users, departments |
| `GET` | `/api/dashboard/:sessionId/logs` | Paginated, searchable, filterable log rows |
| `GET` | `/api/dashboard/:sessionId/piechart` | Legitimate vs Anomaly split with percentages |
| `GET` | `/api/dashboard/:sessionId/barchart` | Hourly traffic buckets |
| `GET` | `/api/dashboard/:sessionId/insights` | 10 pre-computed security insight objects |

**`/logs` query parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | Page number (1-based) |
| `limit` | number | `20` | Rows per page (max 200) |
| `filter_anomaly` | boolean | `false` | Return only anomalous rows |
| `search` | string | — | ILIKE match on `user_email` or `url` |

#### AI & ML Analysis (per row)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/ai/analyze-log` | ✅ | Single log entry → OpenAI → markdown threat explanation. Body: `{ log, model? }` |
| `POST` | `/api/ml/analyze-log` | ✅ | Single log entry → Hugging Face → ranked labels + scores. Body: `{ log }` |

#### AI Analyst Chat (SSE streaming)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/chat/:sessionId` | ✅ | Opens SSE stream. Body: `{ message }`. Emits `tool_call`, `text`, `done`, `error` events |
| `GET` | `/api/chat/:sessionId/history` | ✅ | Last 50 messages for the session (ascending) |

**SSE event format:**

```
event: tool_call
data: {"message":"📋 Reading database schema..."}

event: text
data: {"chunk":"## Threat Summary\n\n"}

event: done
data: {"message":"Analysis complete"}

event: error
data: {"message":"OPENAI_API_KEY not configured"}
```

#### Utilities

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/generate-sample-csv` | ✅ | Downloads a synthetic CSV. Query: `?rows=200` |
| `GET` | `/health` | — | Returns `{ "status": "ok" }` |

---

## Database Tables

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `username` | VARCHAR(100) UNIQUE | |
| `password_hash` | VARCHAR(255) | bcrypt |
| `created_at` | TIMESTAMP | |

### `upload_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → `users` | CASCADE delete |
| `filename` | VARCHAR(255) | |
| `uploaded_at` | TIMESTAMP | |
| `total_rows` | INTEGER | |
| `anomaly_count` | INTEGER | |
| `status` | VARCHAR(50) | `processing` / `completed` / `failed` |

### `zscaler_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `session_id` | UUID FK → `upload_sessions` | CASCADE delete |
| `datetime` | TIMESTAMP | |
| `user_email` | VARCHAR(255) | |
| `client_ip` | VARCHAR(50) | |
| `url` | TEXT | |
| `action` | VARCHAR(50) | `Allowed` / `Blocked` / … |
| `url_category` | VARCHAR(255) | |
| `threat_name` | VARCHAR(255) | |
| `threat_severity` | VARCHAR(50) | `Critical` / `High` / `Medium` / `Low` |
| `department` | VARCHAR(255) | URL-decoded on ingest |
| `transaction_size` | INTEGER | bytes |
| `request_method` | VARCHAR(20) | |
| `status_code` | VARCHAR(10) | |
| `url_class` | VARCHAR(255) | |
| `dlp_engine` | VARCHAR(255) | |
| `useragent` | TEXT | |
| `location` | VARCHAR(255) | |
| `app_name` | VARCHAR(255) | |
| `app_class` | VARCHAR(255) | |
| `is_anomaly` | BOOLEAN | set by anomaly engine |
| `anomaly_confidence` | INTEGER | 0–100 |
| `anomaly_reason` | TEXT | human-readable rule description |
| `raw_json` | JSONB | original CSV row |

Indexes on: `session_id`, `is_anomaly`, `datetime`, `threat_name`, `url_category`.

### `chat_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `session_id` | UUID FK → `upload_sessions` | CASCADE delete |
| `user_id` | UUID FK → `users` | CASCADE delete |
| `role` | VARCHAR(20) | `user` or `assistant` |
| `content` | TEXT | full message (markdown) |
| `tools_used` | JSONB | list of MCP tool names used |
| `page_context` | JSONB | reserved for future page metadata |
| `created_at` | TIMESTAMP | |

Index on `(session_id, created_at ASC)` for fast history lookup.

---

## Anomaly Detection Rules

All 12 rules are evaluated per row; the **highest-confidence match** is applied:

| # | Rule | Confidence |
|---|---|---|
| 1 | Threat name present | 95 |
| 2 | Threat severity Critical / High / Medium | 95 / 85 / 65 |
| 3 | Threat **allowed** through (critical bypass) | 97 |
| 4 | Malicious URL category (Malware, Phishing, Hacking, …) | 68–94 |
| 5 | Security Risk / Malicious Content URL class | 88–93 |
| 6 | DLP engine triggered | 85 |
| 7 | Suspicious user agent (`curl`, `wget`, `python`, `bot`, …) | 70 |
| 8 | CONNECT tunnel allowed | 60 |
| 9 | Large transaction (> 50 KB / 100 KB / 500 KB) | 65–88 |
| 10 | SSL bypass category | 55 |
| 11 | HTTP 403 response | 40 |
| 12 | Blocked Security Risk URL class | 88 |

---

## MCP Tools

The MCP Server exposes two tools to the OpenAI agentic loop.  
`session_id` is **always injected server-side** — the LLM never sees or controls it.

| Tool | Description |
|---|---|
| `get_db_context` | Introspects `information_schema` for `zscaler_logs` column metadata and fetches up to 10 distinct sample values per column scoped to the session |
| `run_read_query` | Validates SELECT-only queries, auto-injects `WHERE session_id = $N`, enforces a 200-row LIMIT and 5-second timeout, then executes |

---
## Project Structure

```
ThreatGrid/
├── docker-compose.yml
├── .gitignore
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── .env                    # ← gitignored; create manually (see above)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts           # Fastify app, Swagger registration, MCP startup probe
│       ├── db/
│       │   ├── client.ts
│       │   ├── migrate.ts
│       │   └── schema.sql
│       ├── mcp/
│       │   ├── client.ts       # MCP SDK wrapper → listTools / callTool
│       │   └── orchestrator.ts # OpenAI agentic loop (streaming)
│       ├── routes/
│       │   ├── auth.ts
│       │   ├── upload.ts
│       │   ├── dashboard.ts
│       │   ├── chat.ts         # SSE streaming AI chat
│       │   ├── aiAnalysis.ts
│       │   ├── mlAnalysis.ts   # Hugging Face inference
│       │   └── generateCsv.ts
│       └── services/
│           ├── csvParser.ts
│           ├── anomalyDetector.ts
│           └── uploadService.ts
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       ├── api/client.ts
│       ├── types/index.ts
│       ├── context/AuthContext.tsx
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── SignupPage.tsx
│       │   ├── UploadPage.tsx
│       │   └── DashboardPage.tsx
│       └── components/
│           ├── ChatPanel.tsx   # SSE streaming AI Analyst panel
│           ├── SOCTable.tsx
│           ├── AnomalyBadge.tsx
│           ├── InsightCards.tsx
│           ├── PieChart.tsx
│           ├── BarChart.tsx
│           ├── ErrorBoundary.tsx
│           └── Skeleton.tsx
└── mcp-server/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── index.ts            # Fastify + SSE MCP transport
        ├── db.ts
        └── tools/
            ├── getDbContext.ts
            └── runReadQuery.ts
```

---

## Verification Checklist

- [ ] `docker-compose up --build` — all 4 containers start; backend logs `[mcp] Connected`
- [ ] Sign up → login → redirected to Upload page
- [ ] **Generate Sample CSV** → file downloads
- [ ] Upload CSV → anomaly detection runs → redirected to Dashboard
- [ ] KPI cards, pie chart, bar chart, and insight cards render correctly
- [ ] SOC Table: sort, search, anomaly filter, and pagination all work
- [ ] Expand a row → **✨ Analyze** → AI explanation appears inline
- [ ] Expand a row → **ML** tab → ranked threat labels appear
- [ ] Click **Ask AI Analyst** (page header) → chat panel slides in
- [ ] Send a chat question → tool-call pulse animates → streaming markdown response
- [ ] Swagger UI loads at `http://localhost:3001/docs`
- [ ] `AnomalyBadge` colours: 🔴 ≥ 90 · 🟠 ≥ 70 · 🟡 ≥ 40 · ⚪ < 40
