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

logger = logging.getLogger("odyssey.ai_quiz")

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

    prompt = f"""You are an expert educational quiz generator. Adapt to the subject, terminology, and level found in the lesson title and content. The lesson content is the source of truth; do not assume a particular subject or introduce unrelated topics.

Based on the following lesson content, generate exactly {num_questions} multiple-choice quiz questions about its topics.

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


async def generate_quiz_from_file_bytes(
    file_bytes: bytes,
    file_name: str = "",
    num_questions: int = 10,
    module_title: str = "",
) -> list[dict]:
    """
    Send raw document bytes (PDF, DOCX, etc.) directly to Gemini's multimodal API.
    This handles scanned/image-only PDFs where text extraction fails.
    Gemini Flash models support native PDF understanding.
    """
    import base64

    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured.")

    if not file_bytes or len(file_bytes) < 100:
        raise ValueError("Document file is too small or empty.")

    # Determine MIME type
    clean_name = (file_name or "").lower().split("?")[0]
    if clean_name.endswith(".pdf") or b"%PDF" in file_bytes[:1024]:
        mime_type = "application/pdf"
    elif clean_name.endswith(".docx") or file_bytes.startswith(b"PK\x03\x04"):
        mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif clean_name.endswith(".doc"):
        mime_type = "application/msword"
    else:
        mime_type = "application/octet-stream"

    # Limit file size to 10MB for Gemini inline data
    max_size = 10 * 1024 * 1024
    if len(file_bytes) > max_size:
        raise ValueError("Document is too large for direct AI processing (max 10MB).")

    b64_data = base64.standard_b64encode(file_bytes).decode("utf-8")

    prompt = f"""You are an expert educational quiz generator. Read the attached document carefully and generate exactly {num_questions} multiple-choice quiz questions based on its content.

LESSON TITLE: {module_title}

REQUIREMENTS:
1. Each question must have exactly 4 options (A, B, C, D)
2. Questions should test comprehension, not just memorization
3. Include a mix of difficulty levels (easy, medium, hard)
4. Each question must have a clear correct answer
5. Provide a brief explanation for why the correct answer is right
6. Questions should be relevant to the document content

Respond ONLY with a valid JSON array. Each element must have these exact keys:
- "question_text": the question string
- "question_type": always "multiple_choice"
- "options": array of exactly 4 option strings
- "correct_answer": the exact text of the correct option
- "explanation": brief explanation string
- "points": always 1

Example format:
[{{"question_text":"What is a key concept?","question_type":"multiple_choice","options":["Option A","Option B","Option C","Option D"],"correct_answer":"Option A","explanation":"Option A is correct because...","points":1}}]
"""

    last_error = None

    async with httpx.AsyncClient(timeout=90.0) as client:
        models_to_try = await get_available_models(client, settings.GEMINI_API_KEY)
        logger.info("Attempting multimodal quiz generation with models: %s", models_to_try[:5])

        for model in models_to_try:
            api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={settings.GEMINI_API_KEY}"
            max_attempts = 2

            for attempt in range(max_attempts):
                try:
                    logger.info("Calling Gemini model '%s' with document (attempt %d/%d, %d bytes)...",
                                model, attempt + 1, max_attempts, len(file_bytes))

                    payload = {
                        "contents": [{
                            "parts": [
                                {
                                    "inline_data": {
                                        "mime_type": mime_type,
                                        "data": b64_data,
                                    }
                                },
                                {"text": prompt},
                            ]
                        }],
                        "generationConfig": {
                            "temperature": 0.7,
                            "maxOutputTokens": 8192,
                            "responseMimeType": "application/json",
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
                            raise ValueError("No candidates returned from Gemini API.")

                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        if not text:
                            raise ValueError("Empty response text from Gemini API.")

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
                            raise ValueError("No valid questions were generated from the document.")

                        logger.info("Multimodal quiz: generated %d questions using model '%s'",
                                    len(valid_questions), model)
                        return valid_questions

                    if response.status_code in (503, 429):
                        last_error = f"Gemini {model} is busy (status {response.status_code})"
                        if attempt < max_attempts - 1:
                            await asyncio.sleep(3.0 + random.uniform(0.5, 1.5))
                            continue
                        break

                    logger.warning("Gemini model '%s' returned status %d: %s",
                                   model, response.status_code, response.text[:300])
                    last_error = f"Gemini model {model} returned status {response.status_code}"
                    break

                except (json.JSONDecodeError, ValueError) as exc:
                    logger.warning("Model '%s' multimodal output error: %s", model, exc)
                    last_error = str(exc)
                    break
                except httpx.TimeoutException:
                    logger.warning("Model '%s' multimodal request timed out", model)
                    last_error = f"Request to model {model} timed out"
                    break
                except Exception as exc:
                    logger.error("Unexpected multimodal error with model '%s': %s", model, exc)
                    last_error = str(exc)
                    break

    raise ValueError(
        f"Unable to generate quiz from document: {last_error or 'AI service unavailable'}. "
        "Please try again in a moment."
    )


def extract_text_from_docx_bytes(data: bytes) -> str:
    """Extract text from Word (.docx) OpenXML package using standard zipfile and ElementTree."""
    import io
    import zipfile
    import xml.etree.ElementTree as ET

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            ns = {
                "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
            }
            paragraphs = []

            # 1. Main document body
            if "word/document.xml" in z.namelist():
                xml_data = z.read("word/document.xml")
                root = ET.fromstring(xml_data)

                # Iterate through all paragraphs (includes body paragraphs and table cells)
                for p in root.iter(f"{{{ns['w']}}}p"):
                    texts = [node.text for node in p.iter(f"{{{ns['w']}}}t") if node.text]
                    if texts:
                        para_text = "".join(texts).strip()
                        if para_text:
                            paragraphs.append(para_text)

            # 2. Check headers and footers if body is small
            if len("\n\n".join(paragraphs)) < 100:
                for name in z.namelist():
                    if name.startswith("word/header") or name.startswith("word/footer"):
                        try:
                            h_xml = z.read(name)
                            h_root = ET.fromstring(h_xml)
                            for p in h_root.iter(f"{{{ns['w']}}}p"):
                                texts = [node.text for node in p.iter(f"{{{ns['w']}}}t") if node.text]
                                if texts:
                                    pt = "".join(texts).strip()
                                    if pt:
                                        paragraphs.append(pt)
                        except Exception:
                            pass

            full_text = "\n\n".join(paragraphs)
            if not full_text or len(full_text.strip()) < 50:
                raise ValueError("Could not extract enough text from the Word document.")

            return full_text
    except ValueError:
        raise
    except Exception as exc:
        logger.error("DOCX extraction failed: %s", exc)
        raise ValueError(f"Failed to read Word document: {str(exc)}")


def extract_text_from_doc_bytes(data: bytes) -> str:
    """Extract printable text strings from legacy binary Word (.doc) files."""
    import re
    try:
        decoded = data.decode("utf-16le", errors="ignore")
        clean_lines = [line.strip() for line in re.findall(r"[\w\s.,!?:;'\-\"()]{5,}", decoded) if len(line.strip()) > 10]
        if len("\n".join(clean_lines)) >= 50:
            return "\n\n".join(clean_lines)
    except Exception:
        pass

    ascii_lines = [line.strip() for line in re.findall(r"[a-zA-Z0-9\s.,!?:;'\-\"()]{5,}", data.decode("latin-1", errors="ignore")) if len(line.strip()) > 10]
    return "\n\n".join(ascii_lines)


def _extract_text_from_pdf_stream_fallback(pdf_bytes: bytes) -> str:
    """Fallback text extractor for truncated or damaged PDF streams using zlib and regex."""
    import re
    import zlib

    text_chunks = []
    stream_pattern = re.compile(b"stream[\r\n]+(.*?)[\r\n]+endstream", re.DOTALL)
    for match in stream_pattern.finditer(pdf_bytes):
        raw_stream = match.group(1)
        decompressed = None
        for wbits in (0, 32 + zlib.MAX_WBITS, -zlib.MAX_WBITS, zlib.MAX_WBITS):
            try:
                decompressed = zlib.decompress(raw_stream, wbits)
                break
            except Exception:
                pass
        if not decompressed:
            decompressed = raw_stream

        # Look for PDF text show operations: (text) Tj, ' , "
        for m in re.finditer(rb"\(([^\)\\]*(?:\\.[^\)\\]*)*)\)\s*(?:Tj|\'|\")", decompressed):
            t = m.group(1).decode("latin-1", errors="ignore").strip()
            if len(t) > 1 and not t.startswith("/") and not t.startswith("%"):
                text_chunks.append(t)

        # Look for PDF array text show operations: [(text) 10 (text)] TJ
        for m in re.finditer(rb"\[(.*?)\]\s*TJ", decompressed):
            sub = m.group(1)
            for sm in re.finditer(rb"\(([^\)\\]*(?:\\.[^\)\\]*)*)\)", sub):
                t = sm.group(1).decode("latin-1", errors="ignore").strip()
                if len(t) > 1 and not t.startswith("/") and not t.startswith("%"):
                    text_chunks.append(t)

    full_fallback = " ".join(text_chunks).strip()
    return full_fallback


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes with fault tolerance for stream errors and truncated streams."""
    import io
    from pypdf import PdfReader
    from pypdf.errors import PdfStreamError

    reader = None
    init_error = None
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    except (PdfStreamError, Exception) as exc:
        init_error = str(exc)
        logger.warning("pypdf initialization failed (%s). Attempting stream fallback extraction...", exc)

    text_parts = []
    if reader is not None:
        try:
            num_pages = len(reader.pages)
            for page_idx in range(num_pages):
                try:
                    page = reader.pages[page_idx]
                    page_text = page.extract_text()
                    if page_text and page_text.strip():
                        text_parts.append(page_text.strip())
                except Exception as pe:
                    logger.warning("Error reading PDF page %d: %s. Continuing...", page_idx + 1, pe)
                    continue
        except Exception as exc:
            logger.warning("Error enumerating PDF pages (%s). Using partial text or fallback...", exc)

    pypdf_text = "\n\n".join(text_parts).strip()

    # Always attempt fallback to supplement pypdf results
    fallback_text = ""
    try:
        fallback_text = _extract_text_from_pdf_stream_fallback(pdf_bytes)
    except Exception as fb_exc:
        logger.warning("Raw PDF stream fallback error: %s", fb_exc)

    # Use whichever extraction got more text, or combine if both have content
    if len(pypdf_text) >= 50:
        logger.info("pypdf extracted %d characters from PDF", len(pypdf_text))
        return pypdf_text

    if len(fallback_text) >= 50:
        logger.info("Raw PDF stream fallback recovered %d characters", len(fallback_text))
        return fallback_text

    # If we got some text from either source but not enough, combine them
    combined = (pypdf_text + "\n\n" + fallback_text).strip()
    if len(combined) >= 50:
        logger.info("Combined pypdf + fallback recovered %d characters", len(combined))
        return combined

    raise ValueError(
        "Could not extract enough readable text from the PDF. "
        "The file may be scanned, image-only, or corrupted. "
        f"({'pypdf error: ' + init_error if init_error else 'No text found in PDF streams'})"
    )


def extract_text_from_file_bytes(file_bytes: bytes, file_name: str = "") -> str:
    """Determine document type and extract text accordingly."""
    if not file_bytes:
        raise ValueError("The uploaded document is empty (0 bytes).")

    clean_name = file_name.lower().split("?")[0]
    is_zip_magic = file_bytes.startswith(b"PK\x03\x04")
    is_pdf_magic = b"%PDF" in file_bytes[:1024]
    is_ole_doc = file_bytes.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")

    # 1. DOCX
    if is_zip_magic or clean_name.endswith(".docx"):
        return extract_text_from_docx_bytes(file_bytes)

    # 2. PDF
    if is_pdf_magic or clean_name.endswith(".pdf"):
        return extract_text_from_pdf_bytes(file_bytes)

    # 3. Legacy Word .doc
    if is_ole_doc or clean_name.endswith(".doc"):
        return extract_text_from_doc_bytes(file_bytes)

    # 4. Plain text / Markdown
    try:
        return file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return file_bytes.decode("latin-1", errors="ignore")


async def extract_text_from_file_url(file_url: str, file_name: str = "") -> str:
    """Download a document (PDF, Word DOCX, DOC, or text) from URL with retries and extract text content."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "identity",
        }
        file_bytes = b""
        last_error = None

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True, headers=headers) as client:
            for attempt in range(3):
                try:
                    # First try: streaming download
                    if attempt < 2:
                        async with client.stream("GET", file_url) as response:
                            if response.status_code != 200:
                                raise ValueError(f"Failed to download document (HTTP {response.status_code})")

                            expected_len = response.headers.get("content-length")
                            chunks = []
                            async for chunk in response.aiter_bytes():
                                chunks.append(chunk)
                            file_bytes = b"".join(chunks)

                            if expected_len and expected_len.isdigit():
                                exp = int(expected_len)
                                if len(file_bytes) != exp:
                                    logger.warning(
                                        "Download size mismatch on attempt %d: got %d bytes, expected %d. Retrying...",
                                        attempt + 1, len(file_bytes), exp
                                    )
                                    last_error = ValueError(
                                        f"Incomplete document download ({len(file_bytes)} of {exp} bytes)"
                                    )
                                    file_bytes = b""
                                    await asyncio.sleep(1.5)
                                    continue

                            if file_bytes:
                                break
                    else:
                        # Final attempt: non-streaming download (more reliable for some CDNs)
                        logger.info("Attempt %d: trying non-streaming download...", attempt + 1)
                        response = await client.get(file_url)
                        if response.status_code != 200:
                            raise ValueError(f"Failed to download document (HTTP {response.status_code})")
                        file_bytes = response.content
                        if file_bytes:
                            break

                except ValueError:
                    raise
                except Exception as dl_err:
                    last_error = dl_err
                    logger.warning("Download error on attempt %d: %s", attempt + 1, dl_err)
                    await asyncio.sleep(1.5)

        if not file_bytes:
            raise ValueError(f"Failed to download document after 3 attempts: {last_error or 'Empty response'}")

        logger.info("Downloaded document: %d bytes", len(file_bytes))

        name = file_name or file_url.split("?")[0].split("/")[-1]
        full_text = extract_text_from_file_bytes(file_bytes, name)

        if not full_text or len(full_text.strip()) < 50:
            raise ValueError("Could not extract enough readable text from the document. The file may be scanned, image-only, or in an unsupported format.")

        return full_text.strip()

    except ValueError:
        raise
    except Exception as exc:
        logger.error("Document text extraction failed: %s", exc)
        raise ValueError(f"Failed to read document: {str(exc)}")


async def extract_text_from_pdf_url(pdf_url: str) -> str:
    """Backward compatibility alias for extract_text_from_file_url."""
    return await extract_text_from_file_url(pdf_url)

