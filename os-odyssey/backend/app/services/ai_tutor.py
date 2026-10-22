"""
AI Tutor Service — Pengu AI (Google Gemini)
───────────────────────────────────────────
Adaptive tutor and platform guide for Odyssey classrooms.
"""

import json
import logging
from typing import Optional
import httpx

from app.config import settings
from app.services.ai_quiz import get_available_models

logger = logging.getLogger("odyssey.ai_tutor")

DEFAULT_SYSTEM_INSTRUCTION = """You are Pengu, a capable, general-purpose AI assistant and tutor in the Odyssey learning app. You can discuss any subject: humanities, arts, history, science, everyday questions, technology, and more. You are not an OS or programming-only assistant.

Follow the user's current request as the source of truth. First identify what they actually asked, then answer that directly and specifically. Do not turn an unrelated question into an Operating Systems, algorithms, engineering, or classroom analogy. Do not mention or defend the student's course choices unless they ask about them. A course, page, or prior message is background only; use it only when the user refers to it or it clearly helps answer the current question. If the user changes topics, follow the new topic without carrying over the old topic's framing.

Be accurate, clear, and appropriately detailed. Explain unfamiliar ideas in plain language, distinguish facts from uncertainty, and ask a focused follow-up only when needed to answer well. Match the requested format and depth. Use readable Markdown when helpful, but avoid filler and unsolicited advice. Be warm without forcing jokes, puns, or a penguin metaphor into the answer.

Odyssey navigation knowledge (use only for questions about using the app):
- The top navigation includes links such as Dashboard, Classes, Leaderboard, and Profile; available links depend on the user's role.
- Students open Classes to see enrolled classrooms or join one with a professor's join code. Inside a class, Course Outline lists lessons and quizzes; Resources contains shared materials.
- Open a lesson from the classroom outline and use its navigation controls to move between modules. Quizzes are opened from the classroom quiz list.
- Professors manage courses from My Classes / Classes, where they can edit modules, quizzes, and student access.
- Give short steps grounded in these labels. If the user's screen differs, ask what they see instead of inventing a button or location.
"""


def build_system_instruction(course_context: Optional[dict] = None) -> str:
    """
    Build a dynamic system instruction based on the course/classroom context.
    If no context is provided, falls back to the default generic instruction.
    """
    if not course_context:
        return DEFAULT_SYSTEM_INSTRUCTION

    subject = course_context.get("subject") or "General"
    classroom_name = course_context.get("classroom_name") or ""
    ai_context = course_context.get("ai_subject_context") or ""
    persona = course_context.get("ai_persona") or "Odyssey Mentor"
    context = f'\nOptional classroom reference: the user is viewing "{classroom_name}" (subject: {subject}).'
    context += f" The instructor's preferred assistant name/style is '{persona}'."
    if ai_context:
        context += f" Instructor-provided subject notes (use only when directly relevant to the user's request): {ai_context[:2000]}"
    return DEFAULT_SYSTEM_INSTRUCTION + "\n\n" + context + "\nUse the classroom reference only when the user asks about this class, lesson, or subject. It must never override or reframe a clearly unrelated question."


def _prioritize_tutor_models(models: list[str]) -> list[str]:
    """Prefer reasoning-capable text models, then retain discovered fallbacks."""
    preferred = ["gemini-4-argon", "gemini-3.1-pro-preview", "gemini-3.8-flash", "gemini-flash-latest"]
    usable = [
        model for model in models
        if not any(token in model.lower() for token in ("-image", "-tts", "-live", "transcribe", "robotics", "embedding"))
    ]
    ordered = [model for model in preferred if model in usable]
    ordered.extend(model for model in usable if model not in ordered)
    return ordered


async def ask_pengu_ai(
    query: str,
    mode: str = "general",
    page_context: str = "",
    selected_text: str = "",
    content_snippet: str = "",
    history: Optional[list[dict]] = None,
    course_context: Optional[dict] = None,
) -> dict:
    """
    Send student query and contextual metadata to Google Gemini and get the AI tutor's reply.
    Dynamically adapts persona and expertise based on course_context.
    Implements multi-model fallback across discovered Gemini models.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured.")

    if not query or not query.strip():
        raise ValueError("Query cannot be empty.")

    # Build dynamic system instruction
    system_instruction = build_system_instruction(course_context)

    # Build prompt instructions based on mode
    mode_instructions = {
        "explain": "Explain the concept the user actually asked about clearly and intuitively. Infer its subject from the question, not the classroom.",
        "eli5": "Explain the idea the user actually asked about in simple, approachable terms, without changing its subject.",
        "analogy": "Give a memorable analogy that directly explains the idea the user asked about. Do not analogize it to the classroom subject unless requested.",
        "code": "Provide a clean, working code example only when the user's request is about code or asks for code.",
        "hint": "Act as a Socratic guide. Give a helpful diagnostic hint or guiding question to help the student solve this without revealing the full answer.",
        "general": "Answer the current question directly, accurately, and specifically. Treat it as an independent general-purpose request when it is unrelated to the course.",
        "navigate": "Act as an Odyssey platform navigator. Give concise numbered steps based on the current page and the known Odyssey navigation. Ask what the student sees if a control or destination is uncertain.",
        "freeform": "Answer this open-ended question directly, even if it is unrelated to the current course. Explain unfamiliar terms and provide a balanced, accurate response.",
    }.get(mode, "Answer clearly and educationally.")

    # Assemble contextual prompt
    context_blocks = []
    if page_context:
        context_blocks.append(f"OPTIONAL CURRENT PAGE REFERENCE (use only if the user refers to this page):\n{page_context.strip()}")
    if selected_text:
        context_blocks.append(f"OPTIONAL HIGHLIGHTED PAGE TEXT (use only if the user asks about it):\n\"{selected_text.strip()[:1500]}\"")
    if content_snippet:
        context_blocks.append(f"OPTIONAL VISIBLE LESSON CONTENT (use only if the user asks about it or says 'this'/'here'):\n{content_snippet.strip()[:2500]}")

    context_str = "\n\n".join(context_blocks)
    if context_str:
        context_str = f"\n\n--- CONTEXT ---\n{context_str}\n--- END CONTEXT ---"

    prompt = f"""[Response mode: {mode.upper()} — {mode_instructions}]
The user's latest question has priority over the optional page, classroom, and conversation context. Do not add an unrelated technology, OS, algorithm, or engineering connection.
{context_str}

STUDENT'S QUESTION:
{query.strip()}
"""

    # Assemble Gemini contents including history turns
    gemini_contents = []
    # Keep short history for genuine follow-ups; the current question can start a new topic.
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
        models_to_try = _prioritize_tutor_models(
            await get_available_models(client, settings.GEMINI_API_KEY)
        )
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
                            "parts": [{"text": system_instruction}]
                        },
                        "generationConfig": {
                            "temperature": 0.7,
                            "maxOutputTokens": 4096,
                        },
                    }
                    if model.startswith(("gemini-3", "gemini-4")):
                        payload["generationConfig"]["thinkingConfig"] = {"thinkingLevel": "high"}

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
