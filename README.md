# ✦ DocuSphere AI

> **Next-Generation Document Intelligence, Exam Studio & Citation Engine**  
> *Architected & Developed by **Nishad Patil***

DocuSphere AI is a production-grade document intelligence platform designed to eliminate hallucinations through mathematical, citation-backed answers. It combines **Neon Cloud PostgreSQL with pgvector (HNSW)**, **Full-Text Lexical Search (tsvector)**, and **Reciprocal Rank Fusion (RRF)** to guarantee 100% factual grounding.

---

## ⚡ Key Highlights

- 📑 **100% Grounded Citations**: Every claim quotes exact page, slide, or paragraph anchors (`[1]`, `[2]`).
- 🎓 **Exam & Viva Q&A Studio**: Generates custom examination papers (Short 2-3M, Medium 5M, Long 10M, Professor Oral Viva, and **⚡ 360° Comprehensive Coverage**).
- ☁️ **Google Drive Direct Ingestion**: Paste any shareable Google Drive link to index files straight into pgvector.
- 🌐 **Live Web Verification**: Corroborate PDF facts against real-time web sources (`[W1]`, `[W2]`).
- 🔒 **Client-Isolated Privacy (24h TTL)**: Chats are stored locally on your device and auto-deleted after 24 hours. Never visible to other users.
- 📱 **Fully Responsive & Collapsible**: One-click collapsible sidebar for distraction-free reading, optimized for laptops and mobile devices.

---

## 🚀 Quickstart (Run Locally)

### 1. Clone & Setup Backend

```bash
git clone https://github.com/your-username/docusphere-ai.git
cd docusphere-ai/backend
```

Create a virtual environment and install dependencies:

```bash
# Windows
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# Mac / Linux
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in `backend/` (keep Neon SQL connection):

```env
DATABASE_URL=postgresql+psycopg://<username>:<password>@<neon_endpoint>.neon.tech/neondb?sslmode=require&channel_binding=require
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=nex-agi/nex-n2.5-mini:free
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
CORS_ORIGINS=http://localhost:3000,https://*.vercel.app
```

Start the backend:

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

---

### 2. Run Frontend

Open a new terminal:

```bash
cd docusphere-ai/frontend
npm install
npm run dev
```

Visit **`http://localhost:3000`** in your browser!

---

## 🌐 Deploy to Vercel & GitHub

### 1. Push Code to GitHub

```bash
git add .
git commit -m "feat: complete DocuSphere AI platform"
git push origin main
```

*(Your `.gitignore` already protects all secret `.env` and local files).*

### 2. Deploy Frontend to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/new) and click **"Add New Project"**.
2. Import your GitHub repository.
3. In **Root Directory**, click **Edit** and select **`frontend`**.
4. In **Environment Variables**, add:
   - `NEXT_PUBLIC_API_URL` = `https://your-backend-service.onrender.com` *(or your local URL for testing)*.
5. Click **Deploy**. Done!

### 3. Deploy Backend (Render / Railway / Fly.io)

DocuSphere backend runs with Neon Cloud PostgreSQL:

1. **On Render / Railway**: Create a new Web Service pointing to `backend/Dockerfile` (or Python root `backend`).
2. Add your Environment Variables:
   - `DATABASE_URL`: Your Neon PostgreSQL connection string.
   - `OPENROUTER_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY`.
   - `CORS_ORIGINS`: `https://your-app.vercel.app`.
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

---

## 🏗️ Technical Architecture

| Layer | Technology | Function |
| :--- | :--- | :--- |
| **Vector Database** | Neon PostgreSQL + `pgvector` | HNSW cosine similarity search |
| **Lexical Engine** | PostgreSQL Full-Text Search | English stemming, proximity ranking |
| **Fusion Algorithm**| Reciprocal Rank Fusion ($k=60$) | Non-linear rank consolidation |
| **AI Synthesis** | OpenRouter + Gemini + OpenAI | Strict source-grounded answers |
| **Streaming** | Server-Sent Events (SSE) | Real-time token streaming |
| **UI Framework** | Next.js 16 + React 19 + TypeScript | Dark glassmorphic responsive studio |

---

## 👤 Author & Architecture

**Architected & Engineered by Nishad Patil**  
*Enterprise Document Intelligence Platform v2.0*
