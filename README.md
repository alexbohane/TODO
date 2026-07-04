# Todo App

A personal todo API built with FastAPI and SQLite.

## Setup

```bash
# Create a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload
```

The API will be available at **http://127.0.0.1:8000**.

Interactive docs (Swagger UI) at **http://127.0.0.1:8000/docs**.

## API Endpoints

| Method   | Path              | Description                          |
|----------|-------------------|--------------------------------------|
| `POST`   | `/todos`          | Create a todo                        |
| `GET`    | `/todos`          | List todos (filter by status/priority) |
| `GET`    | `/todos/{id}`     | Get a single todo                    |
| `PATCH`  | `/todos/{id}`     | Update a todo                        |
| `DELETE` | `/todos/{id}`     | Delete a todo                        |

### Filters (query params on `GET /todos`)

- `status` — `pending`, `done`
- `priority` — `low`, `medium`, `high`
- `skip` / `limit` — pagination

### Example

```bash
# Create a todo
curl -X POST http://127.0.0.1:8000/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy groceries", "priority": "high", "due_date": "2026-03-28"}'

# List all todos
curl http://127.0.0.1:8000/todos

# Mark as done
curl -X PATCH http://127.0.0.1:8000/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
```
