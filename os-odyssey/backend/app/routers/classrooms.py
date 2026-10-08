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

logger = logging.getLogger("os-odyssey.classrooms")

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


class UpdateClassroom(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

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
                .select("id, score, max_score, submitted_at")
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
        from app.services.ai_quiz import generate_quiz_from_content, extract_text_from_pdf_url

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
            .select("title, content, file_url")
            .eq("id", module_id)
            .eq("classroom_id", classroom_id)
            .single()
            .execute()
        )

        if not module.data:
            raise HTTPException(status_code=404, detail="Module not found.")

        content = module.data.get("content", "")
        file_url = module.data.get("file_url")
        module_title = module.data.get("title", "")

        # If module has a PDF, extract text from it
        if file_url and (not content or len(content.strip()) < 50):
            content = await extract_text_from_pdf_url(file_url)

        if not content or len(content.strip()) < 50:
            raise HTTPException(
                status_code=400,
                detail="Module has no content to generate quiz from. Upload a PDF or add text content first.",
            )

        num_q = min(max(body.num_questions or 10, 3), 20)

        questions = await generate_quiz_from_content(
            content=content,
            num_questions=num_q,
            module_title=module_title,
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
