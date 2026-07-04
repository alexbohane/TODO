from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.database import Base, engine, get_db
from app.models import (
    TodoCreate, TodoUpdate, TodoResponse, Status, Priority,
    WishlistCategoryCreate, WishlistCategoryResponse,
    WishlistItemCreate, WishlistItemUpdate, WishlistItemResponse,
)
from app import crud

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Todo App", version="0.1.0")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/todos", response_model=TodoResponse, status_code=201)
def create_todo(data: TodoCreate, db: Session = Depends(get_db)):
    return crud.create_todo(db, data)


@app.get("/todos", response_model=list[TodoResponse])
def list_todos(
    status: Status | None = Query(None),
    priority: Priority | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return crud.list_todos(db, status=status, priority=priority, skip=skip, limit=limit)


@app.get("/todos/{todo_id}", response_model=TodoResponse)
def get_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = crud.get_todo(db, todo_id)
    if todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo


@app.patch("/todos/{todo_id}", response_model=TodoResponse)
def update_todo(todo_id: int, data: TodoUpdate, db: Session = Depends(get_db)):
    todo = crud.get_todo(db, todo_id)
    if todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    return crud.update_todo(db, todo, data)


@app.delete("/todos/{todo_id}", status_code=204)
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = crud.get_todo(db, todo_id)
    if todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    crud.delete_todo(db, todo)


# ── Wishlist routes ───────────────────────────────────────────────────────────

@app.post("/wishlist/categories", response_model=WishlistCategoryResponse, status_code=201)
def create_category(data: WishlistCategoryCreate, db: Session = Depends(get_db)):
    return crud.create_wishlist_category(db, data)


@app.get("/wishlist/categories", response_model=list[WishlistCategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    return crud.list_wishlist_categories(db)


@app.delete("/wishlist/categories/{cat_id}", status_code=204)
def delete_category(cat_id: int, db: Session = Depends(get_db)):
    cat = crud.get_wishlist_category(db, cat_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    crud.delete_wishlist_category(db, cat)


@app.post("/wishlist/items", response_model=WishlistItemResponse, status_code=201)
def create_wish_item(data: WishlistItemCreate, db: Session = Depends(get_db)):
    return crud.create_wishlist_item(db, data)


@app.get("/wishlist/items", response_model=list[WishlistItemResponse])
def list_wish_items(
    category_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    return crud.list_wishlist_items(db, category_id=category_id)


@app.patch("/wishlist/items/{item_id}", response_model=WishlistItemResponse)
def update_wish_item(item_id: int, data: WishlistItemUpdate, db: Session = Depends(get_db)):
    item = crud.get_wishlist_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return crud.update_wishlist_item(db, item, data)


@app.delete("/wishlist/items/{item_id}", status_code=204)
def delete_wish_item(item_id: int, db: Session = Depends(get_db)):
    item = crud.get_wishlist_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    crud.delete_wishlist_item(db, item)
