"""
Classrooms Router
─────────────────
Classroom CRUD, student enrollment, module management,
quiz management, and quiz submission.

Access control:
 • Professor+  → create/manage classrooms, modules, quizzes
 • Students    → join/leave, view published content, submit quizzes
 • Admin       → inherits all professor permissions
"""

import logging
import math
import random
import string
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, field_validator

from app.middleware.rate_limiter import limiter, API_LIMIT
from app.middleware.sanitize import clean
from app.services.auth import get_current_user
from app.services.role_guard import get_user_role, require_professor
from app.services.audit_logger import log_audit_event
from app.services.supabase_client import get_admin_client

logger = logging.getLogger("odyssey.classrooms")

router = APIRouter()


# ─── Helpers ────────────────────────────────────────────

def _generate_join_code(length=6):
    """Generate a random alphanumeric join code."""
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=length))


def _is_classroom_owner(classroom, user_id):
    return classroom.get("professor_id") == user_id


def _is_admin(user):
    return user.get("role") == "admin"


# ─── Schemas ────────────────────────────────────────────

class CreateClassroom(BaseModel):
    name: str
    description: Optional[str] = None
    subject: Optional[str] = "General"
    theme_color: Optional[str] = "#6366f1"
    theme_emoji: Optional[str] = "📚"
    ai_persona: Optional[str] = "Odyssey Mentor"
    ai_subject_context: Optional[str] = None

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v):
        v = clean(v)
        if len(v) < 1 or len(v) > 150:
            raise ValueError("Classroom name must be 1–150 characters.")
        return v

    @field_validator("description")
    @classmethod
    def sanitize_desc(cls, v):
        return clean(v) if v else v

    @field_validator("subject")
    @classmethod
    def sanitize_subject(cls, v):
        if v:
            v = clean(v)
            if len(v) > 100:
                raise ValueError("Subject must be under 100 characters.")
        return v or "General"

    @field_validator("ai_subject_context")
    @classmethod
    def sanitize_ai_context(cls, v):
        if v:
            v = clean(v)
            if len(v) > 2000:
                raise ValueError("AI context must be under 2000 characters.")
        return v


class UpdateClassroom(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    subject: Optional[str] = None
    theme_color: Optional[str] = None
    theme_emoji: Optional[str] = None
    ai_persona: Optional[str] = None
    ai_subject_context: Optional[str] = None

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v):
        if v is not None:
            v = clean(v)
            if len(v) < 1 or len(v) > 150:
                raise ValueError("Classroom name must be 1–150 characters.")
        return v


class JoinClassroom(BaseModel):
    join_code: str

    @field_validator("join_code")
    @classmethod
    def sanitize_code(cls, v):
        v = clean(v).strip().upper()
        if len(v) < 4 or len(v) > 10:
            raise ValueError("Invalid join code format.")
        return v


class CreateModule(BaseModel):
    title: str
    description: Optional[str] = None
    content: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    order_index: Optional[int] = 1
    is_published: Optional[bool] = False

    @field_validator("title")
    @classmethod
    def sanitize_title(cls, v):
        v = clean(v)
        if len(v) < 1 or len(v) > 200:
            raise ValueError("Title must be 1–200 characters.")
        return v


class UpdateModule(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    order_index: Optional[int] = None
    is_published: Optional[bool] = None


class CreateQuiz(BaseModel):
    title: str
    description: Optional[str] = None
    module_id: Optional[str] = None
    time_limit_minutes: Optional[int] = None
    is_published: Optional[bool] = False
    questions: Optional[list] = []

    @field_validator("title")
    @classmethod
    def sanitize_title(cls, v):
        v = clean(v)
        if len(v) < 1 or len(v) > 200:
            raise ValueError("Title must be 1–200 characters.")
        return v


class SubmitQuiz(BaseModel):
    answers: dict  # {question_id: selected_answer}


def _authorize_quiz_editor(admin_client, classroom_id, quiz_id, user):
    quiz = (
        admin_client.table("classroom_quizzes")
        .select("id, classroom_id")
        .eq("id", quiz_id)
        .eq("classroom_id", classroom_id)
        .maybe_single()
        .execute()
    )
    if not quiz.data:
        raise HTTPException(status_code=404, detail="Quiz not found.")

    classroom = (
        admin_client.table("classrooms")
        .select("professor_id")
        .eq("id", classroom_id)
        .maybe_single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")
    if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
        raise HTTPException(status_code=403, detail="Not the owner.")
    return quiz.data


def _validated_quiz_question(body, partial=False):
    allowed = {"question_text", "question_type", "options", "correct_answer", "explanation", "points"}
    if not isinstance(body, dict) or set(body) - allowed:
        raise HTTPException(status_code=400, detail="Invalid question fields.")
    result = {}
    for field in allowed:
        if field not in body:
            continue
        value = body[field]
        if field in {"question_text", "correct_answer", "explanation", "question_type"}:
            if value is not None and not isinstance(value, str):
                raise HTTPException(status_code=400, detail=f"{field} must be text.")
            value = clean(value).strip() if value is not None else None
            if field in {"question_text", "correct_answer"} and not value:
                raise HTTPException(status_code=400, detail=f"{field} cannot be empty.")
        elif field == "options":
            if value is not None and (not isinstance(value, list) or any(not isinstance(item, str) for item in value)):
                raise HTTPException(status_code=400, detail="Options must be a list of text values.")
            value = [clean(item).strip() for item in value] if value is not None else None
        elif field == "points":
            if not isinstance(value, int) or value < 1:
                raise HTTPException(status_code=400, detail="Points must be a positive integer.")
        result[field] = value

    if not partial and (not result.get("question_text") or not result.get("correct_answer")):
        raise HTTPException(status_code=400, detail="Question text and correct answer are required.")
    if result.get("question_type") and result["question_type"] not in {"multiple_choice", "true_false"}:
        raise HTTPException(status_code=400, detail="Unsupported question type.")
    return result


# ─── Classroom CRUD ─────────────────────────────────────

@router.post("/")
@limiter.limit(API_LIMIT)
async def create_classroom(
    request: Request,
    body: CreateClassroom,
    user=Depends(require_professor),
):
    """Create a new classroom. Generates a unique join code."""
    try:
        admin_client = get_admin_client()

        # Generate unique join code (retry if collision)
        for _ in range(10):
            code = _generate_join_code()
            existing = admin_client.table("classrooms").select("id").eq("join_code", code).execute()
            if not existing.data:
                break
        else:
            raise HTTPException(status_code=500, detail="Failed to generate unique join code.")

        result = admin_client.table("classrooms").insert({
            "professor_id": user["id"],
            "name": body.name,
            "description": body.description,
            "join_code": code,
            "subject": body.subject or "General",
            "theme_color": body.theme_color or "#6366f1",
            "theme_emoji": body.theme_emoji or "📚",
            "ai_persona": body.ai_persona or "Odyssey Mentor",
            "ai_subject_context": body.ai_subject_context,
        }).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create classroom.")

        log_audit_event(
            user_id=user["id"],
            action="create_classroom",
            detail={"classroom_name": body.name, "join_code": code},
            request=request,
        )

        return {"message": "Classroom created.", "classroom": result.data[0]}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Create classroom error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create classroom.")


@router.get("/")
@limiter.limit(API_LIMIT)
async def list_classrooms(
    request: Request,
    user=Depends(get_user_role),
):
    """
    List classrooms:
     • Professor → classrooms they own
     • Student   → classrooms they're enrolled in
     • Admin     → all classrooms
    """
    try:
        admin_client = get_admin_client()
        role = user.get("role", "student")

        if role == "admin":
            result = (
                admin_client.table("classrooms")
                .select("*")
                .order("created_at", desc=True)
                .execute()
            )
            classrooms = result.data or []
        elif role == "professor":
            result = (
                admin_client.table("classrooms")
                .select("*")
                .eq("professor_id", user["id"])
                .order("created_at", desc=True)
                .execute()
            )
            classrooms = result.data or []
        else:
            # Student: get enrolled classroom IDs then fetch
            memberships = (
                admin_client.table("classroom_members")
                .select("classroom_id")
                .eq("student_id", user["id"])
                .execute()
            )
            classroom_ids = [m["classroom_id"] for m in (memberships.data or [])]

            if not classroom_ids:
                return {"classrooms": []}

            result = (
                admin_client.table("classrooms")
                .select("*")
                .in_("id", classroom_ids)
                .eq("is_active", True)
                .order("created_at", desc=True)
                .execute()
            )
            classrooms = result.data or []

        # Enrich with member count and professor name
        for c in classrooms:
            members = (
                admin_client.table("classroom_members")
                .select("id", count="exact")
                .eq("classroom_id", c["id"])
                .execute()
            )
            c["member_count"] = members.count or 0

            if role != "professor":
                prof = (
                    admin_client.table("profiles")
                    .select("username")
                    .eq("id", c["professor_id"])
                    .single()
                    .execute()
                )
                c["professor_username"] = prof.data.get("username", "Unknown") if prof.data else "Unknown"

        return {"classrooms": classrooms}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("List classrooms error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list classrooms.")


@router.get("/{classroom_id}")
@limiter.limit(API_LIMIT)
async def get_classroom(
    request: Request,
    classroom_id: str,
    user=Depends(get_user_role),
):
    """Get classroom details. Must be owner, member, or admin."""
    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("*")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        c = classroom.data

        # Access check
        if not _is_admin(user) and not _is_classroom_owner(c, user["id"]):
            # Check membership
            membership = (
                admin_client.table("classroom_members")
                .select("id")
                .eq("classroom_id", classroom_id)
                .eq("student_id", user["id"])
                .execute()
            )
            if not membership.data:
                raise HTTPException(status_code=403, detail="Not a member of this classroom.")

        # Enrich
        members = (
            admin_client.table("classroom_members")
            .select("id", count="exact")
            .eq("classroom_id", classroom_id)
            .execute()
        )
        c["member_count"] = members.count or 0

        prof = (
            admin_client.table("profiles")
            .select("username")
            .eq("id", c["professor_id"])
            .single()
            .execute()
        )
        c["professor_username"] = prof.data.get("username", "Unknown") if prof.data else "Unknown"

        return {"classroom": c}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Get classroom error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch classroom.")


@router.patch("/{classroom_id}")
@limiter.limit(API_LIMIT)
async def update_classroom(
    request: Request,
    classroom_id: str,
    body: UpdateClassroom,
    user=Depends(require_professor),
):
    """Update classroom. Must be owner or admin."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("professor_id")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
            raise HTTPException(status_code=403, detail="Not the owner of this classroom.")

        result = (
            admin_client.table("classrooms")
            .update(updates)
            .eq("id", classroom_id)
            .execute()
        )

        return {"message": "Classroom updated.", "classroom": result.data[0] if result.data else None}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Update classroom error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update classroom.")


@router.delete("/{classroom_id}")
@limiter.limit(API_LIMIT)
async def delete_classroom(
    request: Request,
    classroom_id: str,
    user=Depends(require_professor),
):
    """Delete classroom. Must be owner or admin."""
    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("professor_id, name")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
            raise HTTPException(status_code=403, detail="Not the owner of this classroom.")

        admin_client.table("classrooms").delete().eq("id", classroom_id).execute()

        log_audit_event(
            user_id=user["id"],
            action="delete_classroom",
            detail={"classroom_id": classroom_id, "name": classroom.data.get("name")},
            request=request,
        )

        return {"message": "Classroom deleted."}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Delete classroom error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete classroom.")


# ─── Student Enrollment ────────────────────────────────

@router.post("/join")
@limiter.limit(API_LIMIT)
async def join_classroom(
    request: Request,
    body: JoinClassroom,
    user=Depends(get_user_role),
):
    """Join a classroom via invite code."""
    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("id, name, is_active, max_students")
            .eq("join_code", body.join_code)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Invalid join code.")

        if not classroom.data.get("is_active", True):
            raise HTTPException(status_code=400, detail="This classroom is no longer active.")

        classroom_id = classroom.data["id"]

        # Check if already enrolled
        existing = (
            admin_client.table("classroom_members")
            .select("id")
            .eq("classroom_id", classroom_id)
            .eq("student_id", user["id"])
            .execute()
        )

        if existing.data:
            return {"message": "Already enrolled.", "already_enrolled": True, "classroom_id": classroom_id}

        # Check max students
        current_count = (
            admin_client.table("classroom_members")
            .select("id", count="exact")
            .eq("classroom_id", classroom_id)
            .execute()
        )
        max_students = classroom.data.get("max_students", 100) or 100
        if (current_count.count or 0) >= max_students:
            raise HTTPException(status_code=400, detail="Classroom is full.")

        # Enroll
        admin_client.table("classroom_members").insert({
            "classroom_id": classroom_id,
            "student_id": user["id"],
        }).execute()

        return {
            "message": f"Joined '{classroom.data['name']}'!",
            "already_enrolled": False,
            "classroom_id": classroom_id,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Join classroom error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to join classroom.")


@router.delete("/{classroom_id}/leave")
@limiter.limit(API_LIMIT)
async def leave_classroom(
    request: Request,
    classroom_id: str,
    user=Depends(get_user_role),
):
    """Leave a classroom."""
    try:
        admin_client = get_admin_client()

        admin_client.table("classroom_members").delete().eq(
            "classroom_id", classroom_id
        ).eq("student_id", user["id"]).execute()

        return {"message": "Left classroom."}

    except Exception as exc:
        logger.error("Leave classroom error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to leave classroom.")


@router.get("/{classroom_id}/members")
@limiter.limit(API_LIMIT)
async def list_members(
    request: Request,
    classroom_id: str,
    user=Depends(get_user_role),
):
    """List enrolled students. Must be owner or admin."""
    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("professor_id")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
            raise HTTPException(status_code=403, detail="Only the professor can view the member list.")

        members = (
            admin_client.table("classroom_members")
            .select("student_id, joined_at")
            .eq("classroom_id", classroom_id)
            .order("joined_at", desc=False)
            .execute()
        )

        student_ids = [m["student_id"] for m in (members.data or [])]
        if not student_ids:
            return {"members": []}

        profiles = (
            admin_client.table("profiles")
            .select("id, username, email, avatar, character, xp, level, rank")
            .in_("id", student_ids)
            .execute()
        )

        profile_map = {p["id"]: p for p in (profiles.data or [])}

        result = []
        for m in (members.data or []):
            profile = profile_map.get(m["student_id"], {})
            result.append({
                **profile,
                "joined_at": m["joined_at"],
            })

        return {"members": result}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("List members error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list members.")


@router.delete("/{classroom_id}/members/{student_id}")
@limiter.limit(API_LIMIT)
async def remove_member(
    request: Request,
    classroom_id: str,
    student_id: str,
    user=Depends(require_professor),
):
    """Remove a student from a classroom. Must be owner or admin."""
    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("professor_id")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
            raise HTTPException(status_code=403, detail="Not the owner of this classroom.")

        admin_client.table("classroom_members").delete().eq(
            "classroom_id", classroom_id
        ).eq("student_id", student_id).execute()

        return {"message": "Student removed."}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Remove member error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to remove student.")


# ─── Classroom Modules ─────────────────────────────────

@router.post("/{classroom_id}/modules")
@limiter.limit(API_LIMIT)
async def create_module(
    request: Request,
    classroom_id: str,
    body: CreateModule,
    user=Depends(require_professor),
):
    """Create a new module/lesson in a classroom."""
    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("professor_id")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
            raise HTTPException(status_code=403, detail="Not the owner of this classroom.")

        result = admin_client.table("classroom_modules").insert({
            "classroom_id": classroom_id,
            "title": body.title,
            "description": body.description,
            "content": body.content,
            "file_url": body.file_url,
            "file_name": body.file_name,
            "order_index": body.order_index,
            "is_published": body.is_published,
        }).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create module.")

        return {"message": "Module created.", "module": result.data[0]}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Create module error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create module.")


@router.get("/{classroom_id}/modules")
@limiter.limit(API_LIMIT)
async def list_modules(
    request: Request,
    classroom_id: str,
    user=Depends(get_user_role),
):
    """List modules. Students only see published ones."""
    try:
        admin_client = get_admin_client()

        query = (
            admin_client.table("classroom_modules")
            .select("*")
            .eq("classroom_id", classroom_id)
            .order("order_index")
        )

        # Students only see published
        role = user.get("role", "student")
        if role == "student":
            query = query.eq("is_published", True)

        result = query.execute()

        return {"modules": result.data or []}

    except Exception as exc:
        logger.error("List modules error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list modules.")


@router.get("/{classroom_id}/modules/{module_id}")
@limiter.limit(API_LIMIT)
async def get_module(
    request: Request,
    classroom_id: str,
    module_id: str,
    user=Depends(get_user_role),
):
    """Get a single module's content."""
    try:
        admin_client = get_admin_client()

        result = (
            admin_client.table("classroom_modules")
            .select("*")
            .eq("id", module_id)
            .eq("classroom_id", classroom_id)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Module not found.")

        # Students can't see unpublished
        if user.get("role") == "student" and not result.data.get("is_published"):
            raise HTTPException(status_code=404, detail="Module not found.")

        return {"module": result.data}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Get module error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch module.")


@router.patch("/{classroom_id}/modules/{module_id}")
@limiter.limit(API_LIMIT)
async def update_module(
    request: Request,
    classroom_id: str,
    module_id: str,
    body: UpdateModule,
    user=Depends(require_professor),
):
    """Update a module. Must be classroom owner or admin."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("professor_id")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
            raise HTTPException(status_code=403, detail="Not the owner.")

        result = (
            admin_client.table("classroom_modules")
            .update(updates)
            .eq("id", module_id)
            .eq("classroom_id", classroom_id)
            .execute()
        )

        return {"message": "Module updated.", "module": result.data[0] if result.data else None}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Update module error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update module.")


@router.delete("/{classroom_id}/modules/{module_id}")
@limiter.limit(API_LIMIT)
async def delete_module(
    request: Request,
    classroom_id: str,
    module_id: str,
    user=Depends(require_professor),
):
    """Delete a module."""
    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("professor_id")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
            raise HTTPException(status_code=403, detail="Not the owner.")

        admin_client.table("classroom_modules").delete().eq("id", module_id).eq("classroom_id", classroom_id).execute()

        return {"message": "Module deleted."}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Delete module error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete module.")


# ─── Classroom Quizzes ──────────────────────────────────

@router.post("/{classroom_id}/quizzes")
@limiter.limit(API_LIMIT)
async def create_quiz(
    request: Request,
    classroom_id: str,
    body: CreateQuiz,
    user=Depends(require_professor),
):
    """Create a quiz with questions."""
    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("professor_id")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
            raise HTTPException(status_code=403, detail="Not the owner.")

        # Create quiz
        quiz_data = {
            "classroom_id": classroom_id,
            "title": body.title,
            "description": body.description,
            "module_id": body.module_id,
            "time_limit_minutes": body.time_limit_minutes,
            "is_published": body.is_published,
            "is_ai_generated": False,
        }

        quiz_result = admin_client.table("classroom_quizzes").insert(quiz_data).execute()

        if not quiz_result.data:
            raise HTTPException(status_code=500, detail="Failed to create quiz.")

        quiz_id = quiz_result.data[0]["id"]

        # Insert questions if provided
        if body.questions:
            questions_to_insert = []
            for i, q in enumerate(body.questions):
                questions_to_insert.append({
                    "quiz_id": quiz_id,
                    "question_text": q.get("question_text", ""),
                    "question_type": q.get("question_type", "multiple_choice"),
                    "options": q.get("options"),
                    "correct_answer": q.get("correct_answer", ""),
                    "explanation": q.get("explanation"),
                    "order_index": q.get("order_index", i + 1),
                    "points": q.get("points", 1),
                })

            if questions_to_insert:
                admin_client.table("classroom_quiz_questions").insert(questions_to_insert).execute()

        return {"message": "Quiz created.", "quiz": quiz_result.data[0]}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Create quiz error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create quiz.")


@router.get("/{classroom_id}/quizzes")
@limiter.limit(API_LIMIT)
async def list_quizzes(
    request: Request,
    classroom_id: str,
    user=Depends(get_user_role),
):
    """List quizzes in a classroom. Students only see published."""
    try:
        admin_client = get_admin_client()

        query = (
            admin_client.table("classroom_quizzes")
            .select("*")
            .eq("classroom_id", classroom_id)
            .order("created_at", desc=True)
        )

        if user.get("role") == "student":
            query = query.eq("is_published", True)

        result = query.execute()

        quizzes = result.data or []

        # Add question count and attempt info for each quiz
        for q in quizzes:
            questions = (
                admin_client.table("classroom_quiz_questions")
                .select("id", count="exact")
                .eq("quiz_id", q["id"])
                .execute()
            )
            q["question_count"] = questions.count or 0

            # For students, check if they've attempted
            if user.get("role") == "student":
                attempt = (
                    admin_client.table("classroom_quiz_attempts")
                    .select("score, max_score, submitted_at")
                    .eq("quiz_id", q["id"])
                    .eq("student_id", user["id"])
                    .order("submitted_at", desc=True)
                    .limit(1)
                    .execute()
                )
                q["last_attempt"] = attempt.data[0] if attempt.data else None

        return {"quizzes": quizzes}

    except Exception as exc:
        logger.error("List quizzes error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list quizzes.")


@router.get("/{classroom_id}/quizzes/{quiz_id}")
@limiter.limit(API_LIMIT)
async def get_quiz(
    request: Request,
    classroom_id: str,
    quiz_id: str,
    user=Depends(get_user_role),
):
    """Get quiz with questions. Students don't see correct_answer until submitted."""
    try:
        admin_client = get_admin_client()

        quiz = (
            admin_client.table("classroom_quizzes")
            .select("*")
            .eq("id", quiz_id)
            .eq("classroom_id", classroom_id)
            .single()
            .execute()
        )

        if not quiz.data:
            raise HTTPException(status_code=404, detail="Quiz not found.")

        if user.get("role") == "student" and not quiz.data.get("is_published"):
            raise HTTPException(status_code=404, detail="Quiz not found.")

        questions = (
            admin_client.table("classroom_quiz_questions")
            .select("*")
            .eq("quiz_id", quiz_id)
            .order("order_index")
            .execute()
        )

        quiz_questions = questions.data or []

        # Strip answers for students who haven't submitted yet
        has_submitted = False
        last_attempt_data = None
        if user.get("role") == "student":
            attempt = (
                admin_client.table("classroom_quiz_attempts")
                .select("id, score, max_score, submitted_at, answers")
                .eq("quiz_id", quiz_id)
                .eq("student_id", user["id"])
                .not_.is_("submitted_at", "null")
                .order("submitted_at", desc=True)
                .limit(1)
                .execute()
            )
            has_submitted = bool(attempt.data)
            if has_submitted:
                last_attempt_data = attempt.data[0]

            if not has_submitted:
                for q in quiz_questions:
                    q.pop("correct_answer", None)
                    q.pop("explanation", None)

        quiz.data["questions"] = quiz_questions

        return {
            "quiz": quiz.data,
            "already_attempted": has_submitted,
            "last_attempt": last_attempt_data,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Get quiz error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch quiz.")


@router.patch("/{classroom_id}/quizzes/{quiz_id}")
@limiter.limit(API_LIMIT)
async def update_quiz(
    request: Request,
    classroom_id: str,
    quiz_id: str,
    body: dict,
    user=Depends(require_professor),
):
    """Update quiz details and/or questions."""
    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("professor_id")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
            raise HTTPException(status_code=403, detail="Not the owner.")

        # Update quiz metadata
        quiz_updates = {}
        for field in ["title", "description", "time_limit_minutes", "is_published"]:
            if field in body:
                quiz_updates[field] = body[field]

        if quiz_updates:
            admin_client.table("classroom_quizzes").update(quiz_updates).eq("id", quiz_id).execute()

        # Update questions if provided
        if "questions" in body and isinstance(body["questions"], list):
            # Delete old questions and re-insert
            admin_client.table("classroom_quiz_questions").delete().eq("quiz_id", quiz_id).execute()

            questions_to_insert = []
            for i, q in enumerate(body["questions"]):
                questions_to_insert.append({
                    "quiz_id": quiz_id,
                    "question_text": q.get("question_text", ""),
                    "question_type": q.get("question_type", "multiple_choice"),
                    "options": q.get("options"),
                    "correct_answer": q.get("correct_answer", ""),
                    "explanation": q.get("explanation"),
                    "order_index": q.get("order_index", i + 1),
                    "points": q.get("points", 1),
                })

            if questions_to_insert:
                admin_client.table("classroom_quiz_questions").insert(questions_to_insert).execute()

        return {"message": "Quiz updated."}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Update quiz error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update quiz.")


@router.patch("/{classroom_id}/quizzes/{quiz_id}/questions/reorder")
@limiter.limit(API_LIMIT)
async def reorder_quiz_questions(
    request: Request,
    classroom_id: str,
    quiz_id: str,
    body: dict,
    user=Depends(require_professor),
):
    """Persist a complete question ordering without replacing question records."""
    try:
        admin_client = get_admin_client()
        _authorize_quiz_editor(admin_client, classroom_id, quiz_id, user)
        question_ids = body.get("question_ids") if isinstance(body, dict) else None
        if not isinstance(question_ids, list) or any(not isinstance(item, str) for item in question_ids):
            raise HTTPException(status_code=400, detail="question_ids must be a list of question IDs.")
        if len(question_ids) != len(set(question_ids)):
            raise HTTPException(status_code=400, detail="Question IDs must not be repeated.")

        current = (
            admin_client.table("classroom_quiz_questions")
            .select("id")
            .eq("quiz_id", quiz_id)
            .execute()
        ).data or []
        if set(question_ids) != {item["id"] for item in current}:
            raise HTTPException(status_code=400, detail="Include every question in this quiz exactly once.")

        for index, question_id in enumerate(question_ids, start=1):
            admin_client.table("classroom_quiz_questions").update({"order_index": index}).eq("id", question_id).eq("quiz_id", quiz_id).execute()
        return {"message": "Question order saved."}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Reorder quiz questions error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to reorder quiz questions.")


@router.patch("/{classroom_id}/quizzes/{quiz_id}/questions/{question_id}")
@limiter.limit(API_LIMIT)
async def update_quiz_question(
    request: Request,
    classroom_id: str,
    quiz_id: str,
    question_id: str,
    body: dict,
    user=Depends(require_professor),
):
    """Edit a single quiz question while keeping its ID and attempt references."""
    try:
        admin_client = get_admin_client()
        _authorize_quiz_editor(admin_client, classroom_id, quiz_id, user)
        updates = _validated_quiz_question(body, partial=True)
        if not updates:
            raise HTTPException(status_code=400, detail="Provide at least one question field to update.")
        question = (
            admin_client.table("classroom_quiz_questions")
            .select("id")
            .eq("id", question_id)
            .eq("quiz_id", quiz_id)
            .maybe_single()
            .execute()
        )
        if not question.data:
            raise HTTPException(status_code=404, detail="Question not found.")
        result = (
            admin_client.table("classroom_quiz_questions")
            .update(updates)
            .eq("id", question_id)
            .eq("quiz_id", quiz_id)
            .execute()
        )
        return {"message": "Question updated.", "question": (result.data or [None])[0]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Update quiz question error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update question.")


@router.post("/{classroom_id}/quizzes/{quiz_id}/questions", status_code=status.HTTP_201_CREATED)
@limiter.limit(API_LIMIT)
async def add_quiz_question(
    request: Request,
    classroom_id: str,
    quiz_id: str,
    body: dict,
    user=Depends(require_professor),
):
    """Append a question to an existing quiz."""
    try:
        admin_client = get_admin_client()
        _authorize_quiz_editor(admin_client, classroom_id, quiz_id, user)
        question_data = _validated_quiz_question(body)
        last = (
            admin_client.table("classroom_quiz_questions")
            .select("order_index")
            .eq("quiz_id", quiz_id)
            .order("order_index", desc=True)
            .limit(1)
            .execute()
        ).data or []
        question_data.update({"quiz_id": quiz_id, "order_index": (last[0].get("order_index") or 0) + 1})
        result = admin_client.table("classroom_quiz_questions").insert(question_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to add question.")
        return {"message": "Question added.", "question": result.data[0]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Add quiz question error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to add question.")


@router.delete("/{classroom_id}/quizzes/{quiz_id}/questions/{question_id}")
@limiter.limit(API_LIMIT)
async def delete_quiz_question(
    request: Request,
    classroom_id: str,
    quiz_id: str,
    question_id: str,
    user=Depends(require_professor),
):
    """Remove one question from a quiz."""
    try:
        admin_client = get_admin_client()
        _authorize_quiz_editor(admin_client, classroom_id, quiz_id, user)
        question = (
            admin_client.table("classroom_quiz_questions")
            .select("id")
            .eq("id", question_id)
            .eq("quiz_id", quiz_id)
            .maybe_single()
            .execute()
        )
        if not question.data:
            raise HTTPException(status_code=404, detail="Question not found.")
        admin_client.table("classroom_quiz_questions").delete().eq("id", question_id).eq("quiz_id", quiz_id).execute()
        return {"message": "Question deleted."}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Delete quiz question error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete question.")


@router.delete("/{classroom_id}/quizzes/{quiz_id}")
@limiter.limit(API_LIMIT)
async def delete_quiz(
    request: Request,
    classroom_id: str,
    quiz_id: str,
    user=Depends(require_professor),
):
    """Delete a quiz and all its questions/attempts."""
    try:
        admin_client = get_admin_client()

        classroom = (
            admin_client.table("classrooms")
            .select("professor_id")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
            raise HTTPException(status_code=403, detail="Not the owner.")

        admin_client.table("classroom_quizzes").delete().eq("id", quiz_id).execute()

        return {"message": "Quiz deleted."}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Delete quiz error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete quiz.")


# ─── Quiz Submission ────────────────────────────────────

@router.post("/{classroom_id}/quizzes/{quiz_id}/submit")
@limiter.limit("10/minute")
async def submit_quiz(
    request: Request,
    classroom_id: str,
    quiz_id: str,
    body: SubmitQuiz,
    user=Depends(get_user_role),
):
    """Submit quiz answers. Grades automatically."""
    try:
        admin_client = get_admin_client()

        # Enforce 1 attempt rule for students
        if user.get("role") == "student":
            existing = (
                admin_client.table("classroom_quiz_attempts")
                .select("id")
                .eq("quiz_id", quiz_id)
                .eq("student_id", user["id"])
                .limit(1)
                .execute()
            )
            if existing.data:
                raise HTTPException(
                    status_code=400,
                    detail="You have already completed this quiz. Only 1 attempt is allowed."
                )

        # Get questions with correct answers
        questions = (
            admin_client.table("classroom_quiz_questions")
            .select("id, correct_answer, points")
            .eq("quiz_id", quiz_id)
            .execute()
        )

        if not questions.data:
            raise HTTPException(status_code=404, detail="Quiz has no questions.")

        # Grade
        score = 0
        max_score = 0
        for q in questions.data:
            points = q.get("points", 1) or 1
            max_score += points
            student_answer = body.answers.get(q["id"])
            if student_answer and str(student_answer).strip().lower() == str(q["correct_answer"]).strip().lower():
                score += points

        # Save attempt
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()

        admin_client.table("classroom_quiz_attempts").insert({
            "quiz_id": quiz_id,
            "student_id": user["id"],
            "answers": body.answers,
            "score": score,
            "max_score": max_score,
            "submitted_at": now,
        }).execute()

        return {
            "message": "Quiz submitted!",
            "score": score,
            "max_score": max_score,
            "percentage": round((score / max_score) * 100, 1) if max_score else 0,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Submit quiz error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to submit quiz.")


@router.get("/{classroom_id}/quizzes/{quiz_id}/results")
@limiter.limit(API_LIMIT)
async def get_quiz_results(
    request: Request,
    classroom_id: str,
    quiz_id: str,
    user=Depends(get_user_role),
):
    """
    Get quiz results.
     • Professor/Admin → all student results
     • Student → only their own attempts
    """
    try:
        admin_client = get_admin_client()

        role = user.get("role", "student")

        if role == "student":
            result = (
                admin_client.table("classroom_quiz_attempts")
                .select("*")
                .eq("quiz_id", quiz_id)
                .eq("student_id", user["id"])
                .order("submitted_at", desc=True)
                .execute()
            )
            return {"results": result.data or []}

        # Professor/Admin: get all attempts with student info
        attempts = (
            admin_client.table("classroom_quiz_attempts")
            .select("*")
            .eq("quiz_id", quiz_id)
            .order("submitted_at", desc=True)
            .execute()
        )

        student_ids = list({a["student_id"] for a in (attempts.data or []) if a.get("student_id")})
        profile_map = {}
        if student_ids:
            profiles = admin_client.table("profiles").select("id, username, email, avatar").in_("id", student_ids).execute()
            profile_map = {p["id"]: p for p in (profiles.data or [])}

        results = []
        for a in (attempts.data or []):
            student = profile_map.get(a.get("student_id"), {})
            results.append({
                **a,
                "student_username": student.get("username", "Unknown"),
                "student_email": student.get("email", ""),
            })

        return {"results": results}

    except Exception as exc:
        logger.error("Get quiz results error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch results.")


# ─── AI Quiz Generation ─────────────────────────────────

class GenerateQuizRequest(BaseModel):
    num_questions: Optional[int] = 10
    quiz_title: Optional[str] = None
    content: Optional[str] = None


@router.post("/{classroom_id}/modules/{module_id}/generate-quiz")
@limiter.limit("5/minute")
async def ai_generate_quiz(
    request: Request,
    classroom_id: str,
    module_id: str,
    body: GenerateQuizRequest,
    user=Depends(require_professor),
):
    """Generate quiz questions from a module's content using AI (Google Gemini)."""
    try:
        from app.services.ai_quiz import (
            generate_quiz_from_content,
            generate_quiz_from_file_bytes,
            extract_text_from_file_url,
            extract_text_from_pdf_url,
        )

        admin_client = get_admin_client()

        # Verify ownership
        classroom = (
            admin_client.table("classrooms")
            .select("professor_id")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if not classroom.data:
            raise HTTPException(status_code=404, detail="Classroom not found.")

        if not _is_admin(user) and not _is_classroom_owner(classroom.data, user["id"]):
            raise HTTPException(status_code=403, detail="Not the owner.")

        # Get module content
        module = (
            admin_client.table("classroom_modules")
            .select("title, content, file_url, file_name")
            .eq("id", module_id)
            .eq("classroom_id", classroom_id)
            .single()
            .execute()
        )

        if not module.data:
            raise HTTPException(status_code=404, detail="Module not found.")

        content = (body.content or "").strip() or module.data.get("content", "")
        file_url = module.data.get("file_url")
        file_name = module.data.get("file_name", "")
        module_title = module.data.get("title", "")

        # If module has a document and no content, try to extract text
        if file_url and (not content or len(content.strip()) < 50):
            try:
                content = await extract_text_from_file_url(file_url, file_name=file_name)
            except Exception as ext_err:
                logger.warning("Text extraction failed for module '%s': %s", module_title, ext_err)
                content = ""

        if content and len(content.strip()) >= 50 and not module.data.get("content"):
            try:
                admin_client.table("classroom_modules").update({"content": content[:30000]}).eq("id", module_id).execute()
            except Exception as ce:
                logger.warning("Could not cache extracted text in classroom_modules: %s", ce)

        num_q = min(max(body.num_questions or 10, 3), 20)
        questions = None

        # Primary path: generate from extracted text content
        if content and len(content.strip()) >= 50:
            questions = await generate_quiz_from_content(
                content=content,
                num_questions=num_q,
                module_title=module_title,
            )

        # Fallback: send raw document to Gemini multimodal API (handles scanned PDFs)
        if not questions and file_url:
            logger.info("Text extraction insufficient. Trying multimodal quiz generation for '%s'...", module_title)
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=60.0, follow_redirects=True) as dl_client:
                dl_resp = await dl_client.get(file_url)
                if dl_resp.status_code == 200 and len(dl_resp.content) >= 100:
                    questions = await generate_quiz_from_file_bytes(
                        file_bytes=dl_resp.content,
                        file_name=file_name,
                        num_questions=num_q,
                        module_title=module_title,
                    )

        if not questions:
            raise HTTPException(
                status_code=400,
                detail="Module has no readable content to generate a quiz from. Upload a document (PDF, Word DOCX) or add lesson notes first.",
            )

        # Auto-create the quiz with generated questions
        quiz_title = body.quiz_title or f"Quiz: {module_title}"

        quiz_result = admin_client.table("classroom_quizzes").insert({
            "classroom_id": classroom_id,
            "module_id": module_id,
            "title": quiz_title,
            "description": f"AI-generated quiz based on '{module_title}'",
            "is_ai_generated": True,
            "is_published": False,
        }).execute()

        if not quiz_result.data:
            raise HTTPException(status_code=500, detail="Failed to create quiz.")

        quiz_id = quiz_result.data[0]["id"]

        # Insert questions
        for q in questions:
            q["quiz_id"] = quiz_id

        admin_client.table("classroom_quiz_questions").insert(questions).execute()

        log_audit_event(
            user_id=user["id"],
            action="ai_generate_quiz",
            detail={
                "classroom_id": classroom_id,
                "module_id": module_id,
                "module_title": module_title,
                "questions_generated": len(questions),
            },
            request=request,
        )

        return {
            "message": f"Generated {len(questions)} questions!",
            "quiz": quiz_result.data[0],
            "questions": questions,
        }

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("AI quiz generation error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate quiz.")

