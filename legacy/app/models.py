from __future__ import annotations

import enum
from datetime import datetime, date, time
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import String, Text, Enum, Date, DateTime, Time, Boolean, Float, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ── Enums ────────────────────────────────────────────────────────────────────

class Priority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Status(str, enum.Enum):
    pending = "pending"
    done = "done"


# ── SQLAlchemy model ─────────────────────────────────────────────────────────

class Todo(Base):
    __tablename__ = "todos"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    priority: Mapped[Priority] = mapped_column(Enum(Priority), default=Priority.medium)
    status: Mapped[Status] = mapped_column(Enum(Status), default=Status.pending)
    due_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    due_time: Mapped[Optional[time]] = mapped_column(Time, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


# ── Pydantic schemas ────────────────────────────────────────────────────────

class TodoCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    priority: Priority = Priority.medium
    status: Status = Status.pending
    due_date: Optional[date] = None
    due_time: Optional[time] = None


class TodoUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    priority: Optional[Priority] = None
    status: Optional[Status] = None
    due_date: Optional[date] = None
    due_time: Optional[time] = None


class TodoResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    priority: Priority
    status: Status
    due_date: Optional[date]
    due_time: Optional[time]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Wishlist SQLAlchemy models ───────────────────────────────────────────────

class WishlistCategory(Base):
    __tablename__ = "wishlist_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("wishlist_categories.id"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    url: Mapped[Optional[str]] = mapped_column(String(2048), default=None)
    price: Mapped[Optional[float]] = mapped_column(Float, default=None)
    purchased: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Wishlist Pydantic schemas ────────────────────────────────────────────────

class WishlistCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class WishlistCategoryResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class WishlistItemCreate(BaseModel):
    category_id: int
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    url: Optional[str] = None
    price: Optional[float] = Field(None, ge=0)
    purchased: bool = False


class WishlistItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    url: Optional[str] = None
    price: Optional[float] = Field(None, ge=0)
    purchased: Optional[bool] = None
    category_id: Optional[int] = None


class WishlistItemResponse(BaseModel):
    id: int
    category_id: int
    name: str
    description: Optional[str]
    url: Optional[str]
    price: Optional[float]
    purchased: bool
    created_at: datetime

    model_config = {"from_attributes": True}
