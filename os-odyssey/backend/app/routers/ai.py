"""
AI Router — Odyssey AI Tutor
─────────────────────────────────────────────
Endpoints for interactive AI features:
 • POST /api/ai/tutor — AI contextual tutor / mentor (adapts per course)
"""

import logging
from typing import Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.middleware.rate_limiter import limiter
from app.services.auth import get_optional_user
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
