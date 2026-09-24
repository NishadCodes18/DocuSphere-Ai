# ✦ DocuSphere AI

> **Enterprise Document Intelligence, Exam Studio & Citation-Grounded Engine**  
> *Architected & Developed by **Nishad Patil***

DocuSphere AI is a production-grade document intelligence platform designed to eliminate hallucinations through mathematical, citation-backed answers. It pairs **Neon Cloud PostgreSQL with pgvector (HNSW)**, **Full-Text Lexical Search (tsvector)**, and **Reciprocal Rank Fusion (RRF)** with OpenRouter / OpenAI / Gemini models to guarantee 100% factual grounding.

Website Link : https://docu-sphere-ai-six.vercel.app/

---

## ⚡ Key Highlights

- 📑 **100% Grounded Citations**: Every claim quotes exact page, slide, or paragraph anchors (`[1]`, `[2]`).
- 🎓 **Exam & Viva Q&A Studio**: Generates custom examination papers (Short 2-3M, Medium 5M, Long 10M, Professor Oral Viva, and **⚡ 360° Comprehensive Coverage**).
- ☁️ **Google Drive Direct Ingestion**: Paste any shareable Google Drive link to index files straight into pgvector.
- 🌐 **Live Web Verification**: Corroborate document facts against real-time web sources (`[W1]`, `[W2]`).
- 🔒 **Client-Isolated Privacy (24h TTL)**: Ephemeral chats stored securely in browser storage and auto-deleted after 24 hours.
- 📱 **Fully Responsive & Collapsible**: One-click collapsible sidebar for distraction-free reading, optimized for mobile & desktop.

---

## 🌐 Deploy to Vercel (Frontend + Backend + Neon SQL)

The repository is pre-configured with a root `vercel.json` containing **Vercel Services** and entrypoint configuration for both Next.js and FastAPI.

### 1. Push to GitHub
```bash
git add .
git commit -m "feat: configure vercel deployment with neon sql"
git push origin main
```

### 2. Import into Vercel
1. Go to [Vercel Dashboard](https://vercel.com/new) and click **"Add New Project"**.
2. Select your `docusphere-ai` GitHub repository.
3. Keep **Root Directory** as `./` (the root). Vercel will automatically detect both `frontend` (Next.js) and `backend` (FastAPI) via `vercel.json`.

### 3. Add Environment Variables in Vercel
In your Vercel Project Settings > **Environment Variables**, add:

| Key | Example Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql+psycopg://user:pass@ep-xyz.neon.tech/neondb?sslmode=require` | Your Neon Cloud PostgreSQL connection URL |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | OpenRouter API Key (supports free models like `nex-agi/nex-n2.5-mini:free`) |
| `OPENROUTER_MODEL` | `nex-agi/nex-n2.5-mini:free` | Default AI model |
| `GEMINI_API_KEY` | *(Optional)* | Google Gemini API Key |
| `OPENAI_API_KEY` | *(Optional)* | OpenAI API Key |
| `CORS_ORIGINS` | `https://*.vercel.app` | Allowed origins |

4. Click **Deploy**. Your app and API will go live on a single unified URL!

---

## 🚀 Run Locally

### 1. Backend (FastAPI + Neon PostgreSQL)

```bash
cd backend

# Create & activate virtual environment
python -m venv .venv

# Windows:
.\.venv\Scripts\activate
# Mac/Linux:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Backend will run on **`http://localhost:8000`** with interactive docs at **`http://localhost:8000/docs`**.

### 2. Frontend (Next.js Studio)

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend will run on **`http://localhost:3000`**.

---

## 🏗️ Architecture

```
docusphere-ai/
├── vercel.json           # Root Vercel Services & Rewrites configuration
├── backend/
│   ├── main.py           # Vercel entrypoint (app & serverless handler)
│   ├── api/index.py      # Vercel serverless fallback entrypoint
│   ├── pyproject.toml    # Vercel tool configuration
│   ├── vercel.json       # Backend function rewrites
│   ├── requirements.txt  # FastAPI, psycopg, SQLAlchemy, OpenAI, etc.
│   └── app/
│       ├── main.py       # Dual-mounted routes (/ and /api)
│       ├── ai.py         # OpenRouter / Gemini / OpenAI engine & streaming
│       ├── db.py         # Neon PostgreSQL + pgvector HNSW pool
│       ├── retrieval.py  # Hybrid RRF (dense vector + tsvector lexical)
│       └── parsers.py    # Multi-format document parser
└── frontend/
    ├── app/              # Next.js 16 App Router UI
    ├── components/       # Studio, Sidebar, Chat, Modals, LoadingScreen
    └── lib/api.ts        # Dynamic local & Vercel API resolver
```

---

## 👤 Author & Credits

**Architected & Engineered by Nishad Patil**  
*Enterprise Document Intelligence Platform*
