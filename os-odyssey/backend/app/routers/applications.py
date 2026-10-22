"""
Instructor Applications Router
───────────────────────────────
Endpoints for the instructor application workflow:
 • POST   /api/applications/instructor     — Student submits an application
 • GET    /api/applications/instructor/me   — Student checks their application status
 • GET    /api/applications/instructor      — Admin lists all applications (filterable)
 • PATCH  /api/applications/instructor/{id} — Admin approves or denies an application
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator

from app.middleware.rate_limiter import limiter
from app.middleware.sanitize import clean
from app.services.role_guard import get_user_role, require_admin
from app.services.audit_logger import log_audit_event
from app.services.supabase_client import get_admin_client

logger = logging.getLogger("odyssey.applications")

router = APIRouter()


# ─── Schemas ────────────────────────────────────────────

class InstructorApplication(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120, description="Applicant's full legal name")
    country: Optional[str] = Field("", max_length=100, description="Country of institution")
    region: Optional[str] = Field("", max_length=150, description="Region")
    province: Optional[str] = Field("", max_length=150, description="Province / State")
    city: Optional[str] = Field("", max_length=150, description="City / Municipality")
    institution: str = Field(..., min_length=2, max_length=200, description="Educational institution / school")
    department: str = Field(..., min_length=2, max_length=150, description="Department / Academic faculty")
    position_title: str = Field(..., min_length=2, max_length=100, description="Job / faculty title")
    years_experience: str = Field(..., min_length=1, max_length=50, description="Teaching experience")
    work_email: Optional[str] = Field(None, max_length=254, description="Institutional email")
    phone_number: Optional[str] = Field(None, max_length=30, description="Contact phone number")
    subjects_taught: str = Field(..., min_length=2, max_length=300, description="Subjects / topics planned to teach")
    id_document_url: str = Field(..., min_length=5, description="Faculty ID document image or PDF URL")
    id_document_name: Optional[str] = Field(None, max_length=200)
    teaching_proof_url: str = Field(..., min_length=5, description="Teaching proof photo / certificate URL")
    teaching_proof_name: Optional[str] = Field(None, max_length=200)
    reason: str = Field(..., min_length=10, max_length=2000, description="Why do you want to be an instructor?")

    @field_validator(
        "full_name",
        "country",
        "region",
        "province",
        "city",
        "institution",
        "department",
        "position_title",
        "years_experience",
        "subjects_taught",
        "reason",
    )
    @classmethod
    def sanitize_strings(cls, v):
        if v is None:
            return ""
        return clean(v).strip()


class ReviewApplication(BaseModel):
    status: str = Field(..., description="'approved' or 'denied'")
    review_note: Optional[str] = Field(None, max_length=500, description="Optional note to the applicant")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v not in ("approved", "denied"):
            raise ValueError("Status must be 'approved' or 'denied'.")
        return v


# ─── Student Endpoints ──────────────────────────────────

@router.post("/instructor", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
async def apply_for_instructor(
    request: Request,
    body: InstructorApplication,
    user=Depends(get_user_role),
):
    """Submit an application to become an instructor."""
    # Already a professor or admin?
    if user.get("role") in ("professor", "admin"):
        raise HTTPException(status_code=400, detail="You already have instructor or admin access.")

    try:
        admin_client = get_admin_client()

        # Check for existing pending application
        existing = (
            admin_client.table("instructor_applications")
            .select("id, status")
            .eq("user_id", user["id"])
            .eq("status", "pending")
            .execute()
        )

        if existing.data:
            raise HTTPException(
                status_code=409,
                detail="You already have a pending application. Please wait for admin review."
            )

        insert_data = {
            "user_id": user["id"],
            "full_name": body.full_name,
            "country": body.country or "",
            "region": body.region or "",
            "province": body.province or "",
            "city": body.city or "",
            "institution": body.institution,
            "department": body.department,
            "position_title": body.position_title,
            "years_experience": body.years_experience,
            "work_email": body.work_email,
            "phone_number": body.phone_number,
            "subjects_taught": body.subjects_taught,
            "id_document_url": body.id_document_url,
            "id_document_name": body.id_document_name,
            "teaching_proof_url": body.teaching_proof_url,
            "teaching_proof_name": body.teaching_proof_name,
            "reason": body.reason,
            "status": "pending",
        }

        result = admin_client.table("instructor_applications").insert(insert_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to submit application.")

        log_audit_event(
            user_id=user["id"],
            action="instructor_application_submitted",
            detail={
                "full_name": body.full_name,
                "institution": body.institution,
                "position_title": body.position_title,
            },
            request=request,
        )

        return {"message": "Application submitted! An admin will review it soon.", "application": result.data[0]}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Submit instructor application error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to submit application.")


@router.get("/instructor/me")
@limiter.limit("30/minute")
async def get_my_application(
    request: Request,
    user=Depends(get_user_role),
):
    """Check the current user's instructor application status."""
    try:
        admin_client = get_admin_client()

        result = (
            admin_client.table("instructor_applications")
            .select("*")
            .eq("user_id", user["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {"application": None}

        return {"application": result.data[0]}

    except Exception as exc:
        logger.error("Get my application error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch application status.")


# ─── Admin Endpoints ────────────────────────────────────

@router.get("/instructor")
@limiter.limit("30/minute")
async def list_applications(
    request: Request,
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    user=Depends(require_admin),
):
    """List all instructor applications (admin only)."""
    try:
        admin_client = get_admin_client()

        query = (
            admin_client.table("instructor_applications")
            .select("*", count="exact")
        )

        if status_filter and status_filter in ("pending", "approved", "denied"):
            query = query.eq("status", status_filter)

        offset = (page - 1) * per_page
        query = query.order("created_at", desc=True).range(offset, offset + per_page - 1)

        result = query.execute()
        total = result.count if result.count is not None else 0
        applications = result.data or []

        # Enrich with usernames
        user_ids = list({a["user_id"] for a in applications if a.get("user_id")})
        username_map = {}
        if user_ids:
            profiles = (
                admin_client.table("profiles")
                .select("id, username, email, xp, level, rank")
                .in_("id", user_ids)
                .execute()
            )
            username_map = {p["id"]: p for p in (profiles.data or [])}

        for app in applications:
            profile = username_map.get(app.get("user_id"), {})
            app["username"] = profile.get("username", "Unknown")
            app["email"] = profile.get("email", "")
            app["xp"] = profile.get("xp", 0)
            app["level"] = profile.get("level", 1)

        import math
        return {
            "applications": applications,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": math.ceil(total / per_page) if per_page else 1,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("List applications error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list applications.")


@router.patch("/instructor/{application_id}")
@limiter.limit("30/minute")
async def review_application(
    request: Request,
    application_id: str,
    body: ReviewApplication,
    user=Depends(require_admin),
):
    """Approve or deny an instructor application (admin only)."""
    try:
        admin_client = get_admin_client()

        # Fetch the application
        app_result = (
            admin_client.table("instructor_applications")
            .select("*")
            .eq("id", application_id)
            .single()
            .execute()
        )

        if not app_result.data:
            raise HTTPException(status_code=404, detail="Application not found.")

        application = app_result.data

        if application["status"] != "pending":
            raise HTTPException(status_code=400, detail="This application has already been reviewed.")

        # Update application
        admin_client.table("instructor_applications").update({
            "status": body.status,
            "reviewed_by": user["id"],
            "review_note": body.review_note,
            "reviewed_at": "now()",
        }).eq("id", application_id).execute()

        # If approved, promote the user to professor
        if body.status == "approved":
            admin_client.table("profiles").update({
                "role": "professor",
            }).eq("id", application["user_id"]).execute()

            logger.info(
                "Instructor application approved: user %s promoted to professor by admin %s",
                application["user_id"], user["id"],
            )

        log_audit_event(
            user_id=user["id"],
            action=f"instructor_application_{body.status}",
            detail={
                "application_id": application_id,
                "target_user_id": application["user_id"],
                "review_note": body.review_note,
            },
            request=request,
        )

        return {
            "message": f"Application {body.status}.",
            "status": body.status,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Review application error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to review application.")
