from collections.abc import Generator
import hashlib
import json
import math
import urllib.error
import urllib.request
from openai import APIConnectionError, AuthenticationError, OpenAI, RateLimitError

from .config import settings


def _fallback_embedding(text: str, dim: int = 1536) -> list[float]:
    """Generates a deterministic L2-normalized 1536-dim vector projection
    when OpenAI quota is exhausted or offline.
    """
    vec = [0.0] * dim
    words = text.lower().split()
    if not words:
        vec[0] = 1.0
        return vec

    for word in words:
        h = int(hashlib.md5(word.encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        val = ((h >> 16) % 100) - 50
        vec[idx] += float(val)

    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        return [x / norm for x in vec]
    vec[0] = 1.0
    return vec


def _check_greeting(question: str) -> str | None:
    clean = question.strip().lower().rstrip("!.? ")
    exact_greetings = {
        "hi", "hello", "hey", "hola", "yo", "greetings", "howdy",
        "who are you", "who made you", "who developed you", "who created you",
        "introduce yourself", "tell me about yourself", "introduce",
        "what are you", "what is docusphere", "what is docusphere ai",
        "what can you do", "what do you do", "help", "help me",
        "good morning", "good afternoon", "good evening",
        "hi there", "hello there", "hey there",
        "tell me about docusphere", "about you", "about yourself",
    }
    # Prefix check (e.g. "hi i'm new here" → still greet)
    greeting_prefixes = ("hi ", "hello ", "hey ", "good morning", "good afternoon", "good evening")
    words = clean.split()
    is_greet = (
        clean in exact_greetings
        or any(clean.startswith(p) and len(clean) < 40 for p in greeting_prefixes)
        or (len(words) <= 2 and words[0] in {"hi", "hello", "hey", "hola", "yo", "greetings"})
    )
    if not is_greet:
        return None

    return (
        "👋 **Hello! Welcome to DocuSphere AI Studio.**\n\n"
        "I am your enterprise **Document Intelligence & Research Assistant**, architected and engineered by **Nishad Patil**.\n\n"
        "### 🧠 What I Do:\n"
        "I eliminate AI hallucinations by grounding every answer strictly in your verified documents using a mathematical multi-engine retrieval architecture:\n"
        "- ⚡ **Neon Cloud PostgreSQL + pgvector HNSW** — Ultra-fast vector similarity search across high-dimensional embeddings.\n"
        "- 🎯 **Lexical Full-Text Search (tsvector)** — Keyword matching with English morphological stemming and rank proximity scoring.\n"
        "- 🔀 **Reciprocal Rank Fusion (RRF k=60)** — Mathematically fuses vector and keyword rankings for peak retrieval recall.\n"
        "- 📑 **Interactive Verified Citations `[1]`, `[2]`** — Click any citation to view the exact paragraph, page, or slide.\n"
        "- 🌐 **Optional Live Web Search** — Cross-verify answers against the internet in real time.\n\n"
        "### 🚀 How to Get Started:\n"
        "1. **Upload a document** (PDF, DOCX, PPTX, TXT, MD) to the **Knowledge Vault** on the left.\n"
        "2. Ask any question, request a summary, generate exam Q&A, or extract specific technical details.\n\n"
        "I can also answer **general questions** even without documents — just ask away!\n\n"
        "*What would you like to explore today?* 🚀"
    )


class AIService:
    def __init__(self) -> None:
        self.openai_configured = bool(settings.openai_api_key)
        self.openai_client = (
            OpenAI(api_key=settings.openai_api_key, timeout=5.0, max_retries=0)
            if self.openai_configured
            else None
        )

        self.openrouter_configured = bool(settings.openrouter_api_key)
        self.openrouter_client = (
            OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.openrouter_api_key,
                timeout=12.0,
                max_retries=1,
                default_headers={
                    "HTTP-Referer": "https://docusphere.ai",
                    "X-Title": "DocuSphere AI Studio",
                },
            )
            if self.openrouter_configured
            else None
        )

        # High-availability models on OpenRouter
        self.openrouter_models = [
            settings.openrouter_model,
            "liquid/lfm-2.5-2.6b:free",
            "inclusionai/ling-3.0-flash-sante:free",
        ]

    def embed(self, text: str) -> list[float]:
        if self.openai_client:
            try:
                response = self.openai_client.embeddings.create(
                    model=settings.embedding_model, input=text
                )
                return response.data[0].embedding
            except (RateLimitError, AuthenticationError, APIConnectionError) as e:
                pass
        return _fallback_embedding(text, settings.embedding_dim)

    def embed_batch(
        self, texts: list[str], batch_size: int = 250
    ) -> list[list[float]]:
        if not texts:
            return []

        if self.openai_client:
            try:
                embeddings: list[list[float]] = []
                for i in range(0, len(texts), batch_size):
                    batch = texts[i : i + batch_size]
                    response = self.openai_client.embeddings.create(
                        model=settings.embedding_model, input=batch
                    )
                    embeddings.extend([item.embedding for item in response.data])
                return embeddings
            except (RateLimitError, AuthenticationError, APIConnectionError):
                pass

        return [_fallback_embedding(t, settings.embedding_dim) for t in texts]

    def _build_messages(
        self,
        question: str,
        sources: list[dict],
        history: list[dict] | None = None,
        web_sources: list[dict] | None = None,
    ) -> list[dict]:
        doc_text = "\n\n".join(
            f"[{i}] {s.get('filename', 'Unknown')} ({s.get('location', 'Doc')})\n{s.get('content', '')}"
            for i, s in enumerate(sources, start=1)
        )
        source_sections = [f"### VERIFIED DOCUMENT EVIDENCE:\n{doc_text}"]

        if web_sources:
            web_text = "\n\n".join(
                f"[{w.get('id', f'W{i}')}] {w.get('title', 'Web Evidence')} ({w.get('url', '')})\n{w.get('snippet', '')}"
                for i, w in enumerate(web_sources, start=1)
            )
            source_sections.append(f"### LIVE ONLINE WEB SOURCES:\n{web_text}")

        combined_sources = "\n\n".join(source_sections)
        system = (
            "You are DocuSphere AI, an elite document intelligence and research assistant architected and engineered by Nishad Patil.\n"
            "Developer Credit: Nishad Patil.\n"
            "If asked who built, created, or developed you, or when greeted, acknowledge Nishad Patil as your architect and developer.\n"
            "Your objective is to provide precise, rigorous, and citation-backed answers grounded STRICTLY in the provided Sources.\n\n"
            "GUIDELINES:\n"
            "1. Grounding: Rely ONLY on the information given in the Sources. Do NOT hallucinate or extrapolate.\n"
            "2. Citations:\n"
            "   - Use [1], [2], or [1, 2] for internal document facts.\n"
            "   - Use [W1], [W2] for external live web verification citations.\n"
            "3. Formatting: Use structured Markdown with clear headings, bullet points, and bold terms where helpful.\n"
            "4. Insufficient Evidence: If the provided sources do not contain enough information to address the question fully, state clearly what is missing."
        )

        messages: list[dict] = [{"role": "system", "content": system}]
        if history:
            for item in history[-6:]:
                if item.get("role") in ("user", "assistant") and item.get("content"):
                    messages.append({"role": item["role"], "content": item["content"]})

        user_content = f"Question: {question}\n\nSources:\n{combined_sources}"
        messages.append({"role": "user", "content": user_content})
        return messages

    def _call_openrouter(
        self,
        question: str,
        sources: list[dict],
        history: list[dict] | None = None,
        web_sources: list[dict] | None = None,
    ) -> str | None:
        if not self.openrouter_client:
            return None

        messages = self._build_messages(question, sources, history, web_sources=web_sources)
        for model in self.openrouter_models:
            try:
                resp = self.openrouter_client.chat.completions.create(
                    model=model,
                    temperature=0.1,
                    messages=messages,
                )
                ans = resp.choices[0].message.content
                if ans and ans.strip():
                    return ans.strip()
            except Exception as e:
                print(f"[DocuSphere AI] OpenRouter ({model}) failed: {e}")
                continue
        return None

    def _stream_openrouter(
        self,
        question: str,
        sources: list[dict],
        history: list[dict] | None = None,
        web_sources: list[dict] | None = None,
    ) -> Generator[str, None, None]:
        if not self.openrouter_client:
            return

        messages = self._build_messages(question, sources, history, web_sources=web_sources)
        for model in self.openrouter_models:
            try:
                stream = self.openrouter_client.chat.completions.create(
                    model=model,
                    temperature=0.1,
                    stream=True,
                    messages=messages,
                )
                yielded_any = False
                for chunk in stream:
                    token = chunk.choices[0].delta.content or ""
                    if token:
                        yielded_any = True
                        yield token
                if yielded_any:
                    return
            except Exception as e:
                print(f"[DocuSphere AI] OpenRouter streaming ({model}) failed: {e}")
                continue

    def _call_gemini(self, question: str, sources: list[dict]) -> str | None:
        if not settings.gemini_api_key:
            return None

        source_text = "\n\n".join(
            f"[{i}] {s.get('filename', 'Unknown')} ({s.get('location', 'Doc')})\n{s.get('content', '')}"
            for i, s in enumerate(sources, start=1)
        )
        prompt = (
            "You are DocuSphere AI, an elite document intelligence assistant.\n"
            "Answer the question grounded STRICTLY in the provided Sources below.\n"
            "Every substantive claim MUST include one or more citations like [1] or [2].\n\n"
            f"Sources:\n{source_text}\n\n"
            f"Question: {question}"
        )

        for model in ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={settings.gemini_api_key}"
                payload = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
                req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=12) as resp:
                    data = json.loads(resp.read().decode())
                    return data["candidates"][0]["content"]["parts"][0]["text"].strip()
            except Exception as e:
                print(f"[DocuSphere AI] Gemini ({model}) failed: {e}")
                continue
        return None

    def _generate_offline_grounded_answer(
        self, question: str, sources: list[dict]
    ) -> str:
        """Produces cleanly formatted synthesis when all cloud APIs are unreachable."""
        if not sources:
            return (
                "No matching evidence found in your active document index. "
                "Please verify that documents are uploaded and selected in the left panel."
            )

        top_doc = sources[0].get("filename", "Uploaded Document")
        lines = [
            f"### Document Evidence Synthesis",
            f"Based on the indexed passages from **{top_doc}**, here are the most relevant findings answering your query:",
            "",
        ]

        for i, s in enumerate(sources[:3], start=1):
            snippet = s.get("content", "").strip()[:240].replace("\n", " ")
            lines.append(
                f"- [{i}] **{s.get('location', f'Page {i}')}** ({s.get('hybrid_score', 0)}% Match): {snippet}... [{i}]"
            )

        lines.append("")
        lines.append(
            "*(Click any citation pill above or in the cards below to inspect the verbatim source in the drawer)*"
        )
        return "\n".join(lines)

    def answer(
        self,
        question: str,
        sources: list[dict],
        history: list[dict] | None = None,
        web_sources: list[dict] | None = None,
    ) -> str:
        # Check conversational greeting or self-introduction
        greeting_resp = _check_greeting(question)
        if greeting_resp:
            return greeting_resp

        # Tier 1: OpenRouter
        if self.openrouter_client:
            openrouter_ans = self._call_openrouter(
                question, sources, history, web_sources=web_sources
            )
            if openrouter_ans:
                return openrouter_ans

        # Tier 2: Google Gemini
        gemini_ans = self._call_gemini(question, sources)
        if gemini_ans:
            return gemini_ans

        # Tier 3: OpenAI (if credits available)
        if self.openai_client:
            try:
                messages = self._build_messages(
                    question, sources, history, web_sources=web_sources
                )
                response = self.openai_client.chat.completions.create(
                    model=settings.llm_model,
                    temperature=0.1,
                    messages=messages,
                )
                return response.choices[0].message.content or "No answer generated."
            except (RateLimitError, AuthenticationError) as e:
                print(f"[DocuSphere AI] OpenAI chat quota exhausted: {e}")

        # Tier 4: Clean local grounded fallback
        return self._generate_offline_grounded_answer(question, sources)

    def stream_answer(
        self,
        question: str,
        sources: list[dict],
        history: list[dict] | None = None,
        web_sources: list[dict] | None = None,
    ) -> Generator[str, None, None]:
        # Tier 1: Stream via OpenRouter
        if self.openrouter_client:
            stream_gen = self._stream_openrouter(
                question, sources, history, web_sources=web_sources
            )
            streamed = False
            for token in stream_gen:
                streamed = True
                yield token
            if streamed:
                return

        # Tier 2: Non-streaming fallbacks with simulated streaming tokens
        full_ans = self.answer(
            question, sources, history, web_sources=web_sources
        )
        for word in full_ans.split(" "):
            yield word + " "

    def stream_answer_conversational(
        self,
        question: str,
        history: list[dict] | None = None,
    ) -> Generator[str, None, None]:
        """Answer general / conversational questions without any document context.
        Used when no documents are uploaded but the user asks a general question.
        """
        system = (
            "You are DocuSphere AI, an elite document intelligence and research assistant "
            "built and architected by Nishad Patil.\n"
            "Right now the user has NOT uploaded any documents to the Knowledge Vault yet.\n"
            "You can:\n"
            "  - Answer general knowledge questions, explain concepts, help with code, "
            "maths, writing, and any topic from your training.\n"
            "  - Introduce yourself and describe your capabilities.\n"
            "However, for anything that sounds like it requires a specific document "
            "(e.g. 'summarise this paper', 'what does chapter 3 say', 'analyse the report'), "
            "gently let the user know they need to upload a file first and encourage them to do so.\n"
            "Be warm, concise, and helpful.  Use Markdown formatting where appropriate."
        )
        messages: list[dict] = [{"role": "system", "content": system}]
        if history:
            for item in history[-6:]:
                if item.get("role") in ("user", "assistant") and item.get("content"):
                    messages.append({"role": item["role"], "content": item["content"]})
        messages.append({"role": "user", "content": question})

        # Try OpenRouter first
        if self.openrouter_client:
            for model in self.openrouter_models:
                try:
                    stream = self.openrouter_client.chat.completions.create(
                        model=model,
                        temperature=0.4,
                        stream=True,
                        messages=messages,
                    )
                    yielded_any = False
                    for chunk in stream:
                        token = chunk.choices[0].delta.content or ""
                        if token:
                            yielded_any = True
                            yield token
                    if yielded_any:
                        return
                except Exception as e:
                    print(f"[DocuSphere AI] Conversational OpenRouter ({model}) failed: {e}")
                    continue

        # Fallback: raise so caller can show the upload-prompt message
        raise RuntimeError("No AI provider available for conversational response")

    def frame_exam_questions(
        self,
        exam_type: str,
        sources: list[dict],
        count: int = 5,
        topic_focus: str | None = None,
        web_sources: list[dict] | None = None,
    ) -> str:
        """Synthesizes structured, exam-grade questions with model solutions and citations."""
        type_instructions = {
            "short": (
                "Format: Short Exam-Ready Questions (2-3 Marks each).\n"
                "For each question, provide:\n"
                "### Q{num}: [Direct, Crisp Question] (2-3 Marks)\n"
                "- **Key Keywords**: [Comma-separated terms students must write]\n"
                "- **Model Answer**: [Concise 2-3 sentence answer with citation [1] or [2]]\n"
                "- **Exam Tip**: [Common pitfall to avoid in written exams]\n"
            ),
            "medium": (
                "Format: Medium Conceptual & Technical Questions (5 Marks each).\n"
                "For each question, provide:\n"
                "### Q{num}: [Analytical / Technical Question] (5 Marks)\n"
                "- **Concept Overview**: [Theoretical principle]\n"
                "- **Step-by-Step Technical Breakdown**: [Numbered steps or mathematical derivation with citations [1], [2]]\n"
                "- **Expected Outcome**: [Practical result or conclusion]\n"
            ),
            "long": (
                "Format: Long Theory & System Architecture Questions (10 Marks each).\n"
                "For each question, provide:\n"
                "### Q{num}: [In-Depth Problem Statement & Architectural Question] (10 Marks)\n"
                "- **Problem Context**: [Scenario or dataset context]\n"
                "- **Comprehensive Architecture & Flow**: [Detailed multi-paragraph answer with headings]\n"
                "- **Formulas & Algorithm Mechanics**: [Equations or pseudo-flow with citations [1], [2]]\n"
                "- **Key Advantages & Limitations**: [Analytical comparison]\n"
            ),
            "oral": (
                "Format: Professor Oral / Viva Voce Examination Questions.\n"
                "For each question, provide:\n"
                "### Viva Q{num}: [Tough Examiner Interrogation Question]\n"
                "- **Examiner's Core Objective**: [What the professor is secretly testing]\n"
                "- **Common Student Blunder**: [What unprepared candidates say]\n"
                "- **Bulletproof Student Answer**: [Crisp, authoritative verbal answer quoting [1]]\n"
                "- **Tricky Follow-up Question**: [Expected counter-question]\n"
            ),
            "mcq": (
                "Format: Multiple Choice Exam Questions (MCQs).\n"
                "For each question, provide:\n"
                "### MCQ {num}: [Clear Technical Question]\n"
                "- A) [Option A]\n"
                "- B) [Option B]\n"
                "- C) [Option C]\n"
                "- D) [Option D]\n\n"
                "**Correct Option**: [Letter]\n"
                "**Grounded Explanation**: [Clear explanation citing [1]]\n"
            ),
        }

        inst = type_instructions.get(exam_type.lower(), type_instructions["short"])
        focus_str = (
            f"Focus deeply on the topic: '{topic_focus}'."
            if topic_focus
            else "Cover foundational, procedural, architectural, and edge-case concepts evenly."
        )

        if count <= 0 or count >= 50:
            count_text = (
                "Generate an EXHAUSTIVE, 360° COMPREHENSIVE examination paper covering ALL possible questions "
                "that an examiner or professor can formulate from these documents. Cover every concept, method, formula, "
                "variable, and conclusion without leaving any section out."
            )
        else:
            count_text = f"Generate exactly {count} distinct high-yield questions and model solutions."

        prompt = (
            f"You are a Senior University Examination Board Chair and Distinguished Professor.\n"
            f"{count_text}\n"
            f"Format style: {exam_type.upper()}.\n"
            f"{focus_str}\n\n"
            f"REQUIRED TEMPLATE FOR EACH QUESTION:\n"
            f"{inst}\n"
            f"Every answer must include one or more numeric citations like [1] or [2] (and [W1] if external verification is active)."
        )

        return self.answer(prompt, sources, web_sources=web_sources)

