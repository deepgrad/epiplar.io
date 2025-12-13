from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import json

from ..db.database import get_db
from ..db.models import User, UserActivity
from ..services.auth_service import get_current_user

router = APIRouter(prefix="/profile", tags=["profile"])


# Pydantic models
class ProfileStats(BaseModel):
    scans_this_month: int
    total_scans: int
    storage_used: str
    plan: str
    plan_display: str
    scans_limit: int  # -1 for unlimited
    scans_reset_date: Optional[str] = None

    class Config:
        from_attributes = True


class ActivityItem(BaseModel):
    id: int
    action: str
    description: Optional[str] = None
    icon: str
    time_ago: str
    created_at: datetime

    class Config:
        from_attributes = True


class ProfileResponse(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    created_at: datetime
    plan: str
    plan_display: str
    stats: ProfileStats
    recent_activities: List[ActivityItem]

    class Config:
        from_attributes = True


class UpdatePlanRequest(BaseModel):
    plan: str  # free, pro, enterprise


class ActivityCreateRequest(BaseModel):
    action: str
    description: Optional[str] = None
    metadata: Optional[dict] = None


def get_plan_display(plan: str) -> str:
    """Get display name for plan."""
    displays = {
        "free": "Free",
        "pro": "Pro",
        "enterprise": "Enterprise"
    }
    return displays.get(plan, plan.capitalize())


def get_activity_icon(action: str) -> str:
    """Get icon for activity type."""
    icons = {
        "scan_completed": "✓",
        "export_model": "↓",
        "plan_upgraded": "★",
        "plan_downgraded": "↓",
        "account_created": "★",
        "password_changed": "🔒",
        "profile_updated": "✏️",
    }
    return icons.get(action, "•")


def get_time_ago(dt: datetime) -> str:
    """Get human-readable time ago string."""
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    diff = now - dt
    seconds = diff.total_seconds()

    if seconds < 60:
        return "Just now"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    elif seconds < 172800:
        return "Yesterday"
    elif seconds < 604800:
        days = int(seconds / 86400)
        return f"{days} day{'s' if days != 1 else ''} ago"
    elif seconds < 2592000:
        weeks = int(seconds / 604800)
        return f"{weeks} week{'s' if weeks != 1 else ''} ago"
    else:
        return dt.strftime("%B %d, %Y")


@router.get("", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current user's full profile with stats and recent activity."""
    # Get recent activities
    result = await db.execute(
        select(UserActivity)
        .where(UserActivity.user_id == current_user.id)
        .order_by(desc(UserActivity.created_at))
        .limit(10)
    )
    activities = result.scalars().all()

    # Format activities
    activity_items = [
        ActivityItem(
            id=activity.id,
            action=activity.action,
            description=activity.description,
            icon=get_activity_icon(activity.action),
            time_ago=get_time_ago(activity.created_at),
            created_at=activity.created_at
        )
        for activity in activities
    ]

    # Calculate scans reset date (first of next month)
    reset_at = current_user.scans_reset_at
    if reset_at:
        if reset_at.month == 12:
            next_reset = reset_at.replace(year=reset_at.year + 1, month=1, day=1)
        else:
            next_reset = reset_at.replace(month=reset_at.month + 1, day=1)
        reset_date_str = next_reset.strftime("%B %d, %Y")
    else:
        reset_date_str = None

    # Get plan limits
    plan_limits = current_user.plan_limits

    stats = ProfileStats(
        scans_this_month=current_user.scans_this_month or 0,
        total_scans=current_user.total_scans or 0,
        storage_used=current_user.storage_used_display,
        plan=current_user.plan or "free",
        plan_display=get_plan_display(current_user.plan or "free"),
        scans_limit=plan_limits["scans_per_month"],
        scans_reset_date=reset_date_str
    )

    return ProfileResponse(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        plan=current_user.plan or "free",
        plan_display=get_plan_display(current_user.plan or "free"),
        stats=stats,
        recent_activities=activity_items
    )


@router.get("/stats", response_model=ProfileStats)
async def get_profile_stats(current_user: User = Depends(get_current_user)):
    """Get just the profile stats."""
    plan_limits = current_user.plan_limits

    reset_at = current_user.scans_reset_at
    if reset_at:
        if reset_at.month == 12:
            next_reset = reset_at.replace(year=reset_at.year + 1, month=1, day=1)
        else:
            next_reset = reset_at.replace(month=reset_at.month + 1, day=1)
        reset_date_str = next_reset.strftime("%B %d, %Y")
    else:
        reset_date_str = None

    return ProfileStats(
        scans_this_month=current_user.scans_this_month or 0,
        total_scans=current_user.total_scans or 0,
        storage_used=current_user.storage_used_display,
        plan=current_user.plan or "free",
        plan_display=get_plan_display(current_user.plan or "free"),
        scans_limit=plan_limits["scans_per_month"],
        scans_reset_date=reset_date_str
    )


@router.get("/activities", response_model=List[ActivityItem])
async def get_activities(
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's recent activities."""
    result = await db.execute(
        select(UserActivity)
        .where(UserActivity.user_id == current_user.id)
        .order_by(desc(UserActivity.created_at))
        .limit(min(limit, 50))  # Cap at 50
    )
    activities = result.scalars().all()

    return [
        ActivityItem(
            id=activity.id,
            action=activity.action,
            description=activity.description,
            icon=get_activity_icon(activity.action),
            time_ago=get_time_ago(activity.created_at),
            created_at=activity.created_at
        )
        for activity in activities
    ]


@router.put("/plan", response_model=ProfileStats)
async def update_plan(
    request: UpdatePlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update user's subscription plan."""
    valid_plans = ["free", "pro", "enterprise"]
    if request.plan not in valid_plans:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan. Must be one of: {', '.join(valid_plans)}"
        )

    old_plan = current_user.plan or "free"
    current_user.plan = request.plan
    current_user.plan_started_at = datetime.now(timezone.utc)

    # Set expiration for paid plans (30 days from now for demo)
    if request.plan != "free":
        from datetime import timedelta
        current_user.plan_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    else:
        current_user.plan_expires_at = None

    # Log activity
    action = "plan_upgraded" if valid_plans.index(request.plan) > valid_plans.index(old_plan) else "plan_downgraded"
    if old_plan != request.plan:
        activity = UserActivity(
            user_id=current_user.id,
            action=action,
            description=f"Changed plan from {get_plan_display(old_plan)} to {get_plan_display(request.plan)}"
        )
        db.add(activity)

    await db.commit()
    await db.refresh(current_user)

    plan_limits = current_user.plan_limits
    reset_at = current_user.scans_reset_at
    if reset_at:
        if reset_at.month == 12:
            next_reset = reset_at.replace(year=reset_at.year + 1, month=1, day=1)
        else:
            next_reset = reset_at.replace(month=reset_at.month + 1, day=1)
        reset_date_str = next_reset.strftime("%B %d, %Y")
    else:
        reset_date_str = None

    return ProfileStats(
        scans_this_month=current_user.scans_this_month or 0,
        total_scans=current_user.total_scans or 0,
        storage_used=current_user.storage_used_display,
        plan=current_user.plan,
        plan_display=get_plan_display(current_user.plan),
        scans_limit=plan_limits["scans_per_month"],
        scans_reset_date=reset_date_str
    )


@router.post("/activity")
async def log_activity(
    request: ActivityCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Log a user activity."""
    metadata_str = json.dumps(request.metadata) if request.metadata else None

    activity = UserActivity(
        user_id=current_user.id,
        action=request.action,
        description=request.description,
        metadata_json=metadata_str
    )
    db.add(activity)
    await db.commit()

    return {"success": True, "activity_id": activity.id}


@router.post("/increment-scan")
async def increment_scan(
    storage_bytes: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Increment scan count and optionally add storage usage. Called after a scan completes."""
    # Check if we need to reset monthly scans
    now = datetime.now(timezone.utc)
    reset_at = current_user.scans_reset_at
    if reset_at:
        if reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
        # Check if we're in a new month
        if now.year > reset_at.year or (now.year == reset_at.year and now.month > reset_at.month):
            current_user.scans_this_month = 0
            current_user.scans_reset_at = now

    # Check plan limits
    plan_limits = current_user.plan_limits
    scans_limit = plan_limits["scans_per_month"]

    if scans_limit != -1 and (current_user.scans_this_month or 0) >= scans_limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You've reached your monthly scan limit ({scans_limit} scans). Upgrade your plan for more scans."
        )

    # Increment counters
    current_user.scans_this_month = (current_user.scans_this_month or 0) + 1
    current_user.total_scans = (current_user.total_scans or 0) + 1
    current_user.storage_used_bytes = (current_user.storage_used_bytes or 0) + storage_bytes

    # Log activity
    activity = UserActivity(
        user_id=current_user.id,
        action="scan_completed",
        description="Room scan completed"
    )
    db.add(activity)

    await db.commit()
    await db.refresh(current_user)

    return {
        "success": True,
        "scans_this_month": current_user.scans_this_month,
        "total_scans": current_user.total_scans,
        "storage_used": current_user.storage_used_display
    }


@router.post("/log-export")
async def log_export(
    format: str = "ply",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Log an export activity."""
    activity = UserActivity(
        user_id=current_user.id,
        action="export_model",
        description=f"Exported model to {format.upper()}"
    )
    db.add(activity)
    await db.commit()

    return {"success": True}
