"""
AI Router — Odyssey AI Tutor
─────────────────────────────────────────────
Endpoints for interactive AI features:
 • POST /api/ai/tutor — AI contextual tutor / mentor (adapts per course)
 • POST /api/ai/flashcards — generate study flashcards from notes or a PDF
"""

import logging
import json
from typing import Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.middleware.rate_limiter import limiter
from app.middleware.sanitize import clean
from app.services.auth import get_current_user, get_optional_user
from app.services.ai_tutor import ask_pengu_ai
from app.services.supabase_client import get_admin_client

logger = logging.getLogger("odyssey.ai")

router = APIRouter()


class ChatHistoryItem(BaseModel):
    role: str = Field(..., description="'user' or 'model'")
    text: str = Field(..., description="Message text")


class PenguPromptRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000, description="Student's question or prompt")
    mode: Optional[str] = Field("general", description="explain | eli5 | analogy | code | hint | general | navigate | freeform")
    page_context: Optional[str] = Field("", max_length=1000, description="Title/URL of the current page/module")
    selected_text: Optional[str] = Field("", max_length=3000, description="Text highlighted by the student")
    content_snippet: Optional[str] = Field("", max_length=4000, description="Snippet of visible lesson/sim content")
    history: Optional[List[ChatHistoryItem]] = Field(default_factory=list, description="Prior conversation turns")
    classroom_id: Optional[str] = Field(None, description="Classroom UUID for course-specific AI context")
    classroom_subject: Optional[str] = Field(None, max_length=100, description="Current classroom subject hint")
    classroom_persona: Optional[str] = Field(None, max_length=100, description="Current classroom persona hint")


class PdfQuizRequest(BaseModel):
    title: str = Field("Study quiz", max_length=200)
    topic: str = Field("", max_length=200)
    content: str = Field(..., min_length=50, max_length=15000)
    num_questions: int = Field(10, ge=4, le=20)


@router.post("/quiz", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def generate_pdf_quiz(
    request: Request,
    body: PdfQuizRequest,
    user=Depends(get_current_user),
):
    """Generate an interactive multiple-choice quiz from extracted PDF text."""
    from app.services.ai_quiz import generate_quiz_from_content

    try:
        questions = await generate_quiz_from_content(
            content=body.content,
            num_questions=body.num_questions,
            module_title=(clean(body.title)[:200] or "Study quiz")
            + (f" — focus: {clean(body.topic)[:200]}" if body.topic.strip() else ""),
        )
        return {
            "status": "success",
            "title": clean(body.title)[:200] or "Study quiz",
            "questions": questions,
            "count": len(questions),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("PDF quiz generation failed for user %s", user.get("id"))
        raise HTTPException(status_code=500, detail="Could not generate a quiz. Please try again.") from exc


@router.post("/tutor", status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")
async def chat_with_tutor(
    request: Request,
    body: PenguPromptRequest,
    user=Depends(get_optional_user),
):
    """
    Chat with the Odyssey AI tutor.
    Dynamically adapts persona and expertise based on the classroom's subject and AI context.
    """
    try:
        # Build course context if classroom_id is provided
        course_context = None
        if body.classroom_id:
            try:
                admin_client = get_admin_client()
                classroom = (
                    admin_client.table("classrooms")
                    .select("name, subject, ai_persona, ai_subject_context")
                    .eq("id", body.classroom_id)
                    .single()
                    .execute()
                )
                if classroom.data:
                    course_context = {
                        "classroom_name": classroom.data.get("name", ""),
                        "subject": classroom.data.get("subject", "General"),
                        "ai_persona": classroom.data.get("ai_persona", "Odyssey Mentor"),
                        "ai_subject_context": classroom.data.get("ai_subject_context", ""),
                    }
            except Exception as ctx_err:
                logger.warning("Could not fetch classroom context for AI: %s", ctx_err)

        history_dicts = [item.model_dump() for item in body.history] if body.history else []
        result = await ask_pengu_ai(
            query=body.query,
            mode=body.mode or "general",
            page_context=body.page_context or "",
            selected_text=body.selected_text or "",
            content_snippet=body.content_snippet or "",
            history=history_dicts,
            course_context=course_context,
        )
        return {
            "status": "success",
            "reply": result["reply"],
            "mode": result["mode"],
            "model": result.get("model", ""),
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        logger.error("AI tutor service error: %s", re)
        raise HTTPException(status_code=503, detail=str(re))
    except Exception as exc:
        logger.exception("Unexpected error in AI tutor: %s", exc)
        raise HTTPException(status_code=500, detail="AI tutor encountered an unexpected error.")


@router.post("/flashcards", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def generate_flashcards(request: Request, user=Depends(get_current_user)):
    """Generate cards from JSON text or a raw PDF body, without multipart parsing."""
    from app.services.ai_flashcards import (
        MAX_CONTENT_CHARS,
        MAX_FILE_BYTES,
        generate_flashcards_from_content,
        generate_flashcards_from_file_bytes,
    )

    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    safe_title = ""
    safe_topic = ""
    safe_content = ""
    try:
        count = int(request.query_params.get("num_cards", "12"))
    except (TypeError, ValueError):
        count = 12
    count = min(max(count, 6), 20)

    try:
        if content_type == "application/pdf":
            pdf_bytes = bytearray()
            async for chunk in request.stream():
                pdf_bytes.extend(chunk)
                if len(pdf_bytes) > MAX_FILE_BYTES:
                    raise HTTPException(status_code=400, detail="PDF is too large (max 10MB).")
            safe_title = clean(request.query_params.get("title", ""))[:200]
            safe_topic = clean(request.query_params.get("topic", ""))[:200]
            file_name = f"{safe_title or 'study-notes'}.pdf"
            cards = await generate_flashcards_from_file_bytes(
                file_bytes=bytes(pdf_bytes),
                file_name=file_name,
                num_cards=count,
                title=safe_title,
                topic=safe_topic,
            )
        elif content_type == "application/json":
            raw_body = bytearray()
            async for chunk in request.stream():
                raw_body.extend(chunk)
                if len(raw_body) > 256 * 1024:
                    raise HTTPException(status_code=413, detail="Flashcard source text is too large.")
            try:
                payload = json.loads(raw_body or b"{}")
            except (json.JSONDecodeError, UnicodeDecodeError):
                raise HTTPException(status_code=400, detail="Could not read the flashcard request.")
            if not isinstance(payload, dict):
                raise HTTPException(status_code=400, detail="Could not read the flashcard request.")
            safe_title = clean(str(payload.get("title") or ""))[:200]
            safe_topic = clean(str(payload.get("topic") or ""))[:200]
            safe_content = str(payload.get("content") or "").strip()[:MAX_CONTENT_CHARS]
            try:
                count = min(max(int(payload.get("num_cards") or 12), 6), 20)
            except (TypeError, ValueError):
                count = 12
            if len(safe_content) < 50:
                raise HTTPException(status_code=400, detail="The PDF needs at least 50 characters of readable text.")
            cards = await generate_flashcards_from_content(
                content=safe_content,
                num_cards=count,
                title=safe_title,
                topic=safe_topic,
            )
        else:
            raise HTTPException(status_code=415, detail="Send readable PDF text as JSON or upload a PDF body.")

        deck_title = safe_title or safe_topic or "Study deck"
        logger.info(
            "User %s generated %d flashcards for '%s'",
            user.get("id"),
            len(cards),
            deck_title,
        )
        return {
            "status": "success",
            "title": deck_title,
            "cards": cards,
            "count": len(cards),
        }
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as exc:
        logger.exception("Flashcard generation failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not generate flashcards. Please try again.")
