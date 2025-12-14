from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, ForeignKey, Text, Index, LargeBinary
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index('idx_user_plan_active', 'plan', 'is_active'),
    )

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Profile/Subscription fields
    plan = Column(String(50), default="free")  # free, pro, enterprise
    plan_started_at = Column(DateTime(timezone=True), nullable=True)
    plan_expires_at = Column(DateTime(timezone=True), nullable=True)
    scans_this_month = Column(Integer, default=0)
    total_scans = Column(Integer, default=0)
    storage_used_bytes = Column(Float, default=0)  # in bytes
    scans_reset_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    activities = relationship("UserActivity", back_populates="user", cascade="all, delete-orphan")
    rooms = relationship("Room", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.username}>"

    @property
    def storage_used_display(self) -> str:
        """Return human-readable storage size."""
        bytes_val = self.storage_used_bytes or 0
        if bytes_val < 1024:
            return f"{bytes_val:.0f} B"
        elif bytes_val < 1024 * 1024:
            return f"{bytes_val / 1024:.1f} KB"
        elif bytes_val < 1024 * 1024 * 1024:
            return f"{bytes_val / (1024 * 1024):.1f} MB"
        else:
            return f"{bytes_val / (1024 * 1024 * 1024):.2f} GB"

    @property
    def plan_limits(self) -> dict:
        """Return plan limits based on user's current plan."""
        limits = {
            "free": {"scans_per_month": 3, "max_storage_gb": 1, "max_saved_rooms": 5},
            "pro": {"scans_per_month": -1, "max_storage_gb": 50, "max_saved_rooms": 100},  # -1 = unlimited
            "enterprise": {"scans_per_month": -1, "max_storage_gb": 500, "max_saved_rooms": -1},  # -1 = unlimited
        }
        return limits.get(self.plan, limits["free"])


class UserActivity(Base):
    __tablename__ = "user_activities"
    __table_args__ = (
        Index('idx_user_activity_user_created', 'user_id', 'created_at'),
        Index('idx_user_activity_action', 'action'),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(100), nullable=False)  # scan_completed, export_model, plan_upgraded, etc.
    description = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)  # JSON string for additional data
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="activities")

    def __repr__(self):
        return f"<UserActivity {self.action} by user {self.user_id}>"


class Room(Base):
    """Stored rendered room with 3D point cloud data."""
    __tablename__ = "rooms"
    __table_args__ = (
        Index('idx_room_user_created', 'user_id', 'created_at'),
        Index('idx_room_user_name', 'user_id', 'name'),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Room metadata
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Processing metadata
    job_id = Column(String(100), nullable=True, index=True)  # Original job ID
    frame_count = Column(Integer, nullable=True)  # Number of frames processed
    point_count = Column(Integer, nullable=True)  # Total points in point cloud
    model_used = Column(String(100), nullable=True)  # DA3 model variant used
    original_width = Column(Integer, nullable=True)
    original_height = Column(Integer, nullable=True)

    # File storage
    glb_file_path = Column(String(500), nullable=True)  # Path to main GLB file
    preview_glb_path = Column(String(500), nullable=True)  # Path to preview LOD GLB
    medium_glb_path = Column(String(500), nullable=True)  # Path to medium LOD GLB
    thumbnail_path = Column(String(500), nullable=True)  # Path to thumbnail image

    # Storage tracking
    file_size_bytes = Column(Float, default=0)  # Total storage used by this room

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="rooms")

    def __repr__(self):
        return f"<Room {self.name} by user {self.user_id}>"

    @property
    def file_size_display(self) -> str:
        """Return human-readable file size."""
        bytes_val = self.file_size_bytes or 0
        if bytes_val < 1024:
            return f"{bytes_val:.0f} B"
        elif bytes_val < 1024 * 1024:
            return f"{bytes_val / 1024:.1f} KB"
        elif bytes_val < 1024 * 1024 * 1024:
            return f"{bytes_val / (1024 * 1024):.1f} MB"
        else:
            return f"{bytes_val / (1024 * 1024 * 1024):.2f} GB"
