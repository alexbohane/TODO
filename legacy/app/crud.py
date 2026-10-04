from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Todo, TodoCreate, TodoUpdate, Status, Priority,
    WishlistCategory, WishlistItem, WishlistCategoryCreate,
    WishlistItemCreate, WishlistItemUpdate,
)


def create_todo(db: Session, data: TodoCreate) -> Todo:
    todo = Todo(
        title=data.title,
        description=data.description,
        priority=data.priority,
        status=data.status,
        due_date=data.due_date,
        due_time=data.due_time,
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


def get_todo(db: Session, todo_id: int) -> Todo | None:
    return db.get(Todo, todo_id)


def list_todos(
    db: Session,
    *,
    status: Status | None = None,
    priority: Priority | None = None,
    skip: int = 0,
    limit: int = 50,
) -> list[Todo]:
    stmt = select(Todo)
    if status is not None:
        stmt = stmt.where(Todo.status == status)
    if priority is not None:
        stmt = stmt.where(Todo.priority == priority)
    stmt = stmt.order_by(Todo.created_at.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


def update_todo(db: Session, todo: Todo, data: TodoUpdate) -> Todo:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(todo, field, value)
    db.commit()
    db.refresh(todo)
    return todo


def delete_todo(db: Session, todo: Todo) -> None:
    db.delete(todo)
    db.commit()


# ── Wishlist CRUD ─────────────────────────────────────────────────────────────

def create_wishlist_category(db: Session, data: WishlistCategoryCreate) -> WishlistCategory:
    cat = WishlistCategory(name=data.name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def list_wishlist_categories(db: Session) -> list[WishlistCategory]:
    stmt = select(WishlistCategory).order_by(WishlistCategory.created_at.asc())
    return list(db.scalars(stmt).all())


def get_wishlist_category(db: Session, cat_id: int) -> WishlistCategory | None:
    return db.get(WishlistCategory, cat_id)


def delete_wishlist_category(db: Session, cat: WishlistCategory) -> None:
    items = list(db.scalars(select(WishlistItem).where(WishlistItem.category_id == cat.id)).all())
    for item in items:
        db.delete(item)
    db.delete(cat)
    db.commit()


def create_wishlist_item(db: Session, data: WishlistItemCreate) -> WishlistItem:
    item = WishlistItem(
        category_id=data.category_id,
        name=data.name,
        description=data.description,
        url=data.url,
        price=data.price,
        purchased=data.purchased,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_wishlist_items(db: Session, category_id: int | None = None) -> list[WishlistItem]:
    stmt = select(WishlistItem)
    if category_id is not None:
        stmt = stmt.where(WishlistItem.category_id == category_id)
    stmt = stmt.order_by(WishlistItem.created_at.asc())
    return list(db.scalars(stmt).all())


def get_wishlist_item(db: Session, item_id: int) -> WishlistItem | None:
    return db.get(WishlistItem, item_id)


def update_wishlist_item(db: Session, item: WishlistItem, data: WishlistItemUpdate) -> WishlistItem:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


def delete_wishlist_item(db: Session, item: WishlistItem) -> None:
    db.delete(item)
    db.commit()
