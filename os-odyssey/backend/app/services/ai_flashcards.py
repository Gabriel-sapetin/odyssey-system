"""
AI Flashcard Generator — Google Gemini
──────────────────────────────────────
Turns lesson notes or an uploaded PDF into study flashcards.
"""

import asyncio
import json
import logging
import random

import httpx

from app.config import settings
from app.services.ai_quiz import get_available_models

logger = logging.getLogger("odyssey.ai_flashcards")

MAX_CONTENT_CHARS = 15000
MAX_FILE_BYTES = 10 * 1024 * 1024


def _parse_cards(raw_text: str) -> list[dict]:
    text = (raw_text or "").strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    cards = json.loads(text)
    if not isinstance(cards, list):
        raise ValueError("Gemini response is not a JSON array.")

    valid = []
    for card in cards:
        if not isinstance(card, dict):
            continue
        front = str(card.get("front") or card.get("term") or card.get("question") or "").strip()
        back = str(card.get("back") or card.get("definition") or card.get("answer") or "").strip()
        hint = str(card.get("hint") or "").strip()
        if not front or not back:
            continue
        valid.append({
            "front": front[:400],
            "back": back[:800],
            "hint": hint[:240],
        })

    if not valid:
        raise ValueError("No valid flashcards were generated.")
    return valid


def _flashcard_prompt(num_cards: int, title: str, topic: str, content: str = "") -> str:
    source_note = ""
    if content:
        source_note = f"\n\nSOURCE MATERIAL:\n{content}"
    else:
        source_note = "\n\nRead the attached PDF carefully and use it as the only source of truth."

    topic_line = f"\nSTUDY FOCUS: {topic}" if topic else ""
    title_line = f"\nDOCUMENT TITLE: {title}" if title else ""

    return f"""You are an expert study-coach. Create exactly {num_cards} flashcards for active recall from the source material.
{title_line}{topic_line}{source_note}

REQUIREMENTS:
1. Each card has a short prompt on the front and a concise, accurate answer on the back.
2. Prefer key terms, definitions, comparisons, processes, and "why it matters" questions.
3. Do not invent facts that are not in the source.
4. Mix difficulty. Keep language clear for a student reviewing the material.
5. Optional hint should help without giving away the answer.

Respond ONLY with a valid JSON array. Each element must have these keys:
- "front": string (term or question)
- "back": string (definition or answer)
- "hint": string (short clue, or empty string)

Example:
[{{"front":"What is a process control block?","back":"A kernel data structure that stores a process's state, registers, and scheduling info.","hint":"Think process metadata"}}]
"""


async def _generate_cards(prompt: str, file_bytes: bytes | None = None, mime_type: str = "application/pdf") -> list[dict]:
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured.")

    last_error = None
    timeout = 90.0 if file_bytes else 60.0

    async with httpx.AsyncClient(timeout=timeout) as client:
        models_to_try = await get_available_models(client, settings.GEMINI_API_KEY)
        logger.info("Attempting flashcard generation with models: %s", models_to_try[:5])

        for model in models_to_try:
            api_url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                f"?key={settings.GEMINI_API_KEY}"
            )
            max_attempts = 2 if file_bytes else 3

            for attempt in range(max_attempts):
                try:
                    parts = []
                    if file_bytes:
                        import base64
                        parts.append({
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": base64.standard_b64encode(file_bytes).decode("utf-8"),
                            }
                        })
                    parts.append({"text": prompt})

                    response = await client.post(
                        api_url,
                        json={
                            "contents": [{"parts": parts}],
                            "generationConfig": {
                                "temperature": 0.6,
                                "maxOutputTokens": 8192,
                                "responseMimeType": "application/json",
                            },
                        },
                        headers={"Content-Type": "application/json"},
                    )

                    if response.status_code == 200:
                        data = response.json()
                        candidates = data.get("candidates", [])
                        if not candidates:
                            raise ValueError("No candidates returned from Gemini API.")
                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        cards = _parse_cards(text)
                        logger.info("Generated %d flashcards using model '%s'", len(cards), model)
                        return cards

                    if response.status_code in (503, 429):
                        last_error = f"Gemini {model} is busy (status {response.status_code})"
                        if attempt < max_attempts - 1:
                            await asyncio.sleep((2.0 * (attempt + 1)) + random.uniform(0.4, 1.2))
                            continue
                        break

                    logger.warning(
                        "Gemini model '%s' returned status %d: %s",
                        model, response.status_code, response.text[:250],
                    )
                    last_error = f"Gemini model {model} returned status {response.status_code}"
                    break

                except (json.JSONDecodeError, ValueError) as exc:
                    last_error = str(exc)
                    logger.warning("Model '%s' flashcard parse error: %s", model, exc)
                    break
                except httpx.TimeoutException:
                    last_error = f"Request to model {model} timed out"
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(1.5)
                        continue
                    break
                except Exception as exc:
                    last_error = str(exc)
                    logger.error("Unexpected flashcard error with model '%s': %s", model, exc)
                    break

    raise ValueError(
        f"Unable to generate flashcards: {last_error or 'Google Gemini is temporarily overloaded'}. "
        "Please try again in a moment."
    )


async def generate_flashcards_from_content(
    content: str,
    num_cards: int = 12,
    title: str = "",
    topic: str = "",
) -> list[dict]:
    if not content or len(content.strip()) < 50:
        raise ValueError("The document text is too short to generate flashcards.")

    trimmed = content.strip()
    if len(trimmed) > MAX_CONTENT_CHARS:
        trimmed = trimmed[:MAX_CONTENT_CHARS] + "\n\n[Content truncated for flashcard generation...]"

    prompt = _flashcard_prompt(num_cards, title, topic, trimmed)
    return await _generate_cards(prompt)


async def generate_flashcards_from_file_bytes(
    file_bytes: bytes,
    file_name: str = "",
    num_cards: int = 12,
    title: str = "",
    topic: str = "",
) -> list[dict]:
    if not file_bytes or len(file_bytes) < 100:
        raise ValueError("The uploaded PDF is empty or too small.")
    if len(file_bytes) > MAX_FILE_BYTES:
        raise ValueError("PDF is too large for flashcard generation (max 10MB).")
    if b"%PDF" not in file_bytes[:1024] and not (file_name or "").lower().endswith(".pdf"):
        raise ValueError("Please upload a PDF file.")

    prompt = _flashcard_prompt(num_cards, title or file_name, topic, content="")
    return await _generate_cards(prompt, file_bytes=file_bytes, mime_type="application/pdf")
