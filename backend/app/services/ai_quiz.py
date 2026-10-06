"""
AI Quiz Generator — Google Gemini
──────────────────────────────────
Reads module content (text or PDF) and generates
quiz questions using Google's Gemini API.
"""

import json
import logging
import httpx

from app.config import settings

logger = logging.getLogger("os-odyssey.ai_quiz")

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"


async def generate_quiz_from_content(
    content: str,
    num_questions: int = 10,
    module_title: str = "",
) -> list[dict]:
    """
    Send module content to Gemini and get back structured quiz questions.

    Returns a list of question dicts:
    [
        {
            "question_text": "...",
            "question_type": "multiple_choice",
            "options": ["A", "B", "C", "D"],
            "correct_answer": "A",
            "explanation": "...",
            "points": 1
        },
        ...
    ]
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured.")

    if not content or len(content.strip()) < 50:
        raise ValueError("Module content is too short to generate a quiz.")

    # Truncate very long content to avoid token limits
    max_chars = 30000
    if len(content) > max_chars:
        content = content[:max_chars] + "\n\n[Content truncated...]"

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

Respond ONLY with a valid JSON array (no markdown, no code fences). Each element must have these exact keys:
- "question_text": the question string
- "question_type": always "multiple_choice"  
- "options": array of exactly 4 option strings
- "correct_answer": the exact text of the correct option
- "explanation": brief explanation string
- "points": always 1

Example format:
[{{"question_text":"What is...","question_type":"multiple_choice","options":["A","B","C","D"],"correct_answer":"A","explanation":"Because...","points":1}}]
"""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{GEMINI_API_URL}?key={settings.GEMINI_API_KEY}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 8192,
                    },
                },
                headers={"Content-Type": "application/json"},
            )

            if response.status_code != 200:
                logger.error("Gemini API error %s: %s", response.status_code, response.text)
                raise ValueError(f"Gemini API returned status {response.status_code}")

            data = response.json()

            # Extract text from Gemini response
            candidates = data.get("candidates", [])
            if not candidates:
                raise ValueError("No response from Gemini API.")

            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")

            if not text:
                raise ValueError("Empty response from Gemini API.")

            # Clean up: remove markdown code fences if present
            text = text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

            # Parse JSON
            questions = json.loads(text)

            if not isinstance(questions, list):
                raise ValueError("Gemini response is not a JSON array.")

            # Validate and clean questions
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

            logger.info("Generated %d quiz questions for module '%s'", len(valid_questions), module_title)
            return valid_questions

    except json.JSONDecodeError as exc:
        logger.error("Failed to parse Gemini response as JSON: %s", exc)
        raise ValueError("AI generated an invalid response. Please try again.")
    except httpx.TimeoutException:
        logger.error("Gemini API request timed out")
        raise ValueError("AI request timed out. Please try again.")
    except ValueError:
        raise
    except Exception as exc:
        logger.error("AI quiz generation failed: %s", exc)
        raise ValueError(f"AI quiz generation failed: {str(exc)}")


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
