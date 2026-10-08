"""
AI Router — Pengu AI & OS Odyssey Intelligence
─────────────────────────────────────────────
Endpoints for interactive AI features:
 • POST /api/ai/tutor — Pengu AI contextual tutor / mentor
"""

import logging
from typing import Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.middleware.rate_limiter import limiter
from app.services.auth import get_optional_user
from app.services.ai_tutor import ask_pengu_ai

logger = logging.getLogger("os-odyssey.ai")

router = APIRouter()


class ChatHistoryItem(BaseModel):
    role: str = Field(..., description="'user' or 'model'")
    text: str = Field(..., description="Message text")


class PenguPromptRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000, description="Student's question or prompt")
    mode: Optional[str] = Field("general", description="explain | eli5 | analogy | code | hint | general")
    page_context: Optional[str] = Field("", max_length=1000, description="Title/URL of the current page/module")
    selected_text: Optional[str] = Field("", max_length=3000, description="Text highlighted by the student")
    content_snippet: Optional[str] = Field("", max_length=4000, description="Snippet of visible lesson/sim content")
    history: Optional[List[ChatHistoryItem]] = Field(default_factory=list, description="Prior conversation turns")


@router.post("/tutor", status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")
async def chat_with_pengu(
    request: Request,
    body: PenguPromptRequest,
    user=Depends(get_optional_user),
):
    """
    Chat with Pengu AI (Tux), the interactive OS Odyssey tutor.
    Provides contextual explanations, code examples, analogies, and Socratic hints.
    """
    try:
        history_dicts = [item.model_dump() for item in body.history] if body.history else []
        result = await ask_pengu_ai(
            query=body.query,
            mode=body.mode or "general",
            page_context=body.page_context or "",
            selected_text=body.selected_text or "",
            content_snippet=body.content_snippet or "",
            history=history_dicts,
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
        logger.error("Pengu AI service error: %s", re)
        raise HTTPException(status_code=503, detail=str(re))
    except Exception as exc:
        logger.exception("Unexpected error in Pengu AI tutor: %s", exc)
        raise HTTPException(status_code=500, detail="Pengu AI encountered an unexpected error.")
