"""
AI Quiz Generator — Google Gemini
──────────────────────────────────
Reads module content (text or PDF) and generates
quiz questions using Google's Gemini API with dynamic model discovery,
fallback chain, and exponential backoff for transient 503/429 errors.
"""

import asyncio
import json
import logging
import random
import httpx

from app.config import settings

logger = logging.getLogger("os-odyssey.ai_quiz")

# Default preferred model candidates
DEFAULT_MODELS = [
    "gemini-flash-latest",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-2.0-flash",
    "gemini-pro",
]


async def get_available_models(client: httpx.AsyncClient, api_key: str) -> list[str]:
    """
    Query the Gemini API to discover the exact models available for this API key.
    Returns prioritized list with flash models first.
    """
    candidates = list(DEFAULT_MODELS)
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        res = await client.get(url, timeout=10.0)
        if res.status_code == 200:
            data = res.json()
            api_models = []
            for item in data.get("models", []):
                methods = item.get("supportedGenerationMethods", [])
                if "generateContent" in methods:
                    name = item.get("name", "").replace("models/", "").strip()
                    if name:
                        api_models.append(name)

            if api_models:
                logger.info("Discovered %d models from Gemini API: %s", len(api_models), api_models[:6])
                # Prioritize: gemini-flash-latest, then other flash models, then pro models
                discovered_flash = [m for m in api_models if "flash" in m]
                discovered_others = [m for m in api_models if "flash" not in m]

                combined = ["gemini-flash-latest"] + discovered_flash + discovered_others + candidates
                # Deduplicate while preserving order
                seen = set()
                return [m for m in combined if not (m in seen or seen.add(m))]
    except Exception as exc:
        logger.warning("Could not dynamically query Gemini models: %s", exc)

    return candidates


async def generate_quiz_from_content(
    content: str,
    num_questions: int = 10,
    module_title: str = "",
) -> list[dict]:
    """
    Send module content to Gemini and get back structured quiz questions.
    Implements retry with exponential backoff for 503/429 errors and falls
    back across available models.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured.")

    if not content or len(content.strip()) < 50:
        raise ValueError("Module content is too short to generate a quiz.")

    # Truncate content to 15,000 characters (~3,500 words)
    # Keeping the prompt compact prevents Google 503 capacity sheds on free-tier
    max_chars = 15000
    if len(content) > max_chars:
        content = content[:max_chars] + "\n\n[Content truncated for quiz generation...]"

    prompt = f"""You are an expert educational quiz generator for an Operating Systems course.

Based on the following lesson content, generate exactly {num_questions} multiple-choice quiz questions.

LESSON TITLE: {module_title}

LESSON CONTENT:
{content}

REQUIREMENTS:
1. Each question must have exactly 4 options (A, B, C, D)
2. Questions should test comprehension, not just memorization
3. Include a mix of difficulty levels (easy, medium, hard)
4. Each question must have a clear correct answer
5. Provide a brief explanation for why the correct answer is right
6. Questions should be relevant to the lesson content

Respond ONLY with a valid JSON array. Each element must have these exact keys:
- "question_text": the question string
- "question_type": always "multiple_choice"  
- "options": array of exactly 4 option strings
- "correct_answer": the exact text of the correct option
- "explanation": brief explanation string
- "points": always 1

Example format:
[{{"question_text":"What is a PCB?","question_type":"multiple_choice","options":["Process Control Block","Power Control Board","Program Counter Base","Protected Core Binary"],"correct_answer":"Process Control Block","explanation":"PCB stands for Process Control Block, which stores process state information.","points":1}}]
"""

    last_error = None

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Discover available models or use defaults
        models_to_try = await get_available_models(client, settings.GEMINI_API_KEY)
        logger.info("Attempting quiz generation with models: %s", models_to_try[:5])

        for model in models_to_try:
            api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={settings.GEMINI_API_KEY}"
            max_attempts = 3

            for attempt in range(max_attempts):
                try:
                    logger.info("Calling Gemini model '%s' (attempt %d/%d)...", model, attempt + 1, max_attempts)

                    response = await client.post(
                        api_url,
                        json={
                            "contents": [{"parts": [{"text": prompt}]}],
                            "generationConfig": {
                                "temperature": 0.7,
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
                        if not text:
                            raise ValueError("Empty response text from Gemini API.")

                        # Clean up: strip markdown fences if present
                        text = text.strip()
                        if text.startswith("```json"):
                            text = text[7:]
                        if text.startswith("```"):
                            text = text[3:]
                        if text.endswith("```"):
                            text = text[:-3]
                        text = text.strip()

                        questions = json.loads(text)
                        if not isinstance(questions, list):
                            raise ValueError("Gemini response is not a JSON array.")

                        valid_questions = []
                        for i, q in enumerate(questions):
                            if not isinstance(q, dict):
                                continue
                            if not q.get("question_text") or not q.get("options") or not q.get("correct_answer"):
                                continue

                            valid_questions.append({
                                "question_text": str(q["question_text"]),
                                "question_type": "multiple_choice",
                                "options": [str(o) for o in q["options"][:4]],
                                "correct_answer": str(q["correct_answer"]),
                                "explanation": str(q.get("explanation", "")),
                                "order_index": i + 1,
                                "points": 1,
                            })

                        if not valid_questions:
                            raise ValueError("No valid questions were generated.")

                        logger.info("Successfully generated %d quiz questions using model '%s'", len(valid_questions), model)
                        return valid_questions

                    # Handle 503 (Overloaded) or 429 (Rate limited) with backoff
                    if response.status_code in (503, 429):
                        logger.warning(
                            "Gemini model '%s' returned status %d on attempt %d/%d. Response: %s",
                            model, response.status_code, attempt + 1, max_attempts, response.text[:200]
                        )
                        last_error = f"Gemini {model} is busy (status {response.status_code})"
                        if attempt < max_attempts - 1:
                            backoff = (2.0 * (attempt + 1)) + random.uniform(0.5, 1.5)
                            logger.info("Waiting %.1fs before retrying '%s'...", backoff, model)
                            await asyncio.sleep(backoff)
                            continue
                        else:
                            logger.warning("Exhausted retries for model '%s'. Moving to next model...", model)
                            break

                    # 404 (Not Found) or 400 (Bad Request) - skip to next model immediately
                    logger.warning("Gemini model '%s' returned status %d. Response: %s", model, response.status_code, response.text[:200])
                    last_error = f"Gemini model {model} returned status {response.status_code}"
                    break

                except (json.JSONDecodeError, ValueError) as exc:
                    logger.warning("Model '%s' produced unparseable output: %s", model, exc)
                    last_error = str(exc)
                    break
                except httpx.TimeoutException:
                    logger.warning("Model '%s' request timed out on attempt %d", model, attempt + 1)
                    last_error = f"Request to model {model} timed out"
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(1.5)
                        continue
                    break
                except Exception as exc:
                    logger.error("Unexpected error with model '%s': %s", model, exc)
                    last_error = str(exc)
                    break

    raise ValueError(
        f"Unable to generate quiz: {last_error or 'Google Gemini is temporarily overloaded'}. "
        "Please try again in a moment."
    )


async def extract_text_from_pdf_url(pdf_url: str) -> str:
    """Download a PDF from URL and extract its text content."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(pdf_url)
            if response.status_code != 200:
                raise ValueError(f"Failed to download PDF (status {response.status_code})")

            pdf_bytes = response.content

        # Use pypdf to extract text
        import io
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(pdf_bytes))
        text_parts = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

        full_text = "\n\n".join(text_parts)

        if not full_text or len(full_text.strip()) < 50:
            raise ValueError("Could not extract enough text from the PDF.")

        return full_text

    except ValueError:
        raise
    except Exception as exc:
        logger.error("PDF text extraction failed: %s", exc)
        raise ValueError(f"Failed to read PDF: {str(exc)}")
