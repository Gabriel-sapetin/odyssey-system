"""
AI Tutor Service — Pengu AI (Google Gemini)
───────────────────────────────────────────
Interactive OS mentor & tutor for OS Odyssey.
Provides contextual explanations, real-world analogies, C code examples,
and Socratic guidance for students reading lessons or running simulations.
"""

import json
import logging
from typing import Optional
import httpx

from app.config import settings
from app.services.ai_quiz import get_available_models

logger = logging.getLogger("os-odyssey.ai_tutor")

SYSTEM_INSTRUCTION = """You are Pengu (Tux), the wise, warm, and playful penguin mentor of OS Odyssey — a gamified educational platform where Computer Science students master Operating Systems.

Your Mission:
Help students genuinely understand core Operating Systems principles (Processes, Threads, CPU Scheduling, Concurrency & Synchronization, Semaphores & Mutexes, Deadlocks, Memory Management, Paging, Virtual Memory, File Systems, Disk Scheduling, and System Calls).

Your Persona & Tone:
1. Warm, encouraging, and enthusiastic about low-level computing.
2. Sprinkles subtle, tasteful penguin/ice/arctic puns when natural (e.g., "Brrr, that race condition gave me chills!", "Let's slide through this concept!"), but never at the expense of technical rigor.
3. Accurate, precise, and educational.

Response Guidelines:
- Format your response using clean, readable Markdown (bullet points, bold key terms, short paragraphs).
- When providing code, use clear, standard C / POSIX (e.g., using <unistd.h>, <pthread.h>, fork(), pipe(), wait()) with concise comments explaining every critical line.
- When asked for an analogy, use intuitive, concrete real-world models (e.g., a bustling restaurant kitchen for CPU scheduling, library borrowing cards for virtual memory paging, traffic roundabouts for circular wait deadlocks).
- When asked for a Socratic hint or debugging help in a lab/simulation, DO NOT just hand out the final answer. Ask a guiding question that prompts the student to think about the underlying invariant or state.
- Keep responses engaging, focused, and structured. Avoid unnecessary filler or excessively long walls of text.
"""


async def ask_pengu_ai(
    query: str,
    mode: str = "general",
    page_context: str = "",
    selected_text: str = "",
    content_snippet: str = "",
    history: Optional[list[dict]] = None,
) -> dict:
    """
    Send student query and contextual metadata to Google Gemini and get Pengu's reply.
    Implements multi-model fallback across discovered Gemini models.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured.")

    if not query or not query.strip():
        raise ValueError("Query cannot be empty.")

    # Build prompt instructions based on mode
    mode_instructions = {
        "explain": "Explain this concept clearly and intuitively for a CS student.",
        "eli5": "Explain this concept in very simple, approachable terms (ELI5) with zero overly academic jargon.",
        "analogy": "Provide a vivid, memorable real-world analogy to illustrate this OS concept.",
        "code": "Provide a clean, working C / POSIX code example demonstrating this concept with explanatory comments.",
        "hint": "Act as a Socratic guide. Give a helpful diagnostic hint or guiding question to help the student solve this without revealing the full answer.",
        "general": "Answer the student's question clearly, accurately, and encouragingly.",
    }.get(mode, "Answer clearly and educationally.")

    # Assemble contextual prompt
    context_blocks = []
    if page_context:
        context_blocks.append(f"CURRENT LOCATION / TOPIC:\n{page_context.strip()}")
    if selected_text:
        context_blocks.append(f"STUDENT HIGHLIGHTED TEXT:\n\"{selected_text.strip()[:1500]}\"")
    if content_snippet:
        context_blocks.append(f"CURRENT LESSON/SIMULATION CONTENT CONTEXT:\n{content_snippet.strip()[:2500]}")

    context_str = "\n\n".join(context_blocks)
    if context_str:
        context_str = f"\n\n--- CONTEXT ---\n{context_str}\n--- END CONTEXT ---"

    prompt = f"""[Instruction Mode: {mode.upper()} - {mode_instructions}]
{context_str}

STUDENT'S QUESTION:
{query.strip()}
"""

    # Assemble Gemini contents including history turns
    gemini_contents = []
    # Add previous chat history turns if provided (max last 6 turns to keep context lightweight)
    if history and isinstance(history, list):
        recent_history = history[-6:]
        for turn in recent_history:
            role = turn.get("role")
            text = turn.get("text", "").strip()
            if not text:
                continue
            # Map roles to Gemini roles ('user' or 'model')
            gemini_role = "model" if role in ("model", "assistant", "pengu") else "user"
            gemini_contents.append({"role": gemini_role, "parts": [{"text": text}]})

    # Append current user prompt
    gemini_contents.append({"role": "user", "parts": [{"text": prompt}]})

    last_error = None

    async with httpx.AsyncClient(timeout=45.0) as client:
        models_to_try = await get_available_models(client, settings.GEMINI_API_KEY)
        logger.info("Pengu AI querying with models: %s", models_to_try[:4])

        for model in models_to_try:
            api_url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                f"?key={settings.GEMINI_API_KEY}"
            )
            max_attempts = 2

            for attempt in range(max_attempts):
                try:
                    payload = {
                        "contents": gemini_contents,
                        "systemInstruction": {
                            "parts": [{"text": SYSTEM_INSTRUCTION}]
                        },
                        "generationConfig": {
                            "temperature": 0.7,
                            "maxOutputTokens": 2048,
                        },
                    }

                    response = await client.post(
                        api_url,
                        json=payload,
                        headers={"Content-Type": "application/json"},
                    )

                    if response.status_code == 200:
                        data = response.json()
                        candidates = data.get("candidates", [])
                        if not candidates:
                            raise ValueError("No candidate reply returned by Gemini.")

                        reply_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        if not reply_text:
                            raise ValueError("Empty response text from Gemini.")

                        return {
                            "reply": reply_text.strip(),
                            "model": model,
                            "mode": mode,
                        }

                    if response.status_code in (429, 503):
                        logger.warning("Gemini model '%s' busy (%d). Retrying...", model, response.status_code)
                        last_error = f"Gemini {model} is busy (status {response.status_code})"
                        continue

                    logger.warning("Gemini model '%s' returned status %d: %s", model, response.status_code, response.text[:200])
                    last_error = f"Gemini model {model} returned status {response.status_code}"
                    break  # Try next model

                except httpx.TimeoutException:
                    logger.warning("Timeout calling Gemini model '%s'", model)
                    last_error = f"Timeout connecting to Gemini ({model})"
                    break
                except Exception as exc:
                    logger.warning("Error calling Gemini model '%s': %s", model, exc)
                    last_error = str(exc)
                    break

        raise RuntimeError(f"Pengu AI could not generate a response: {last_error or 'AI service unavailable'}")
