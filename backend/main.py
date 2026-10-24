from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4
from fastapi import FastAPI

app = FastAPI()

# Add this root endpoint
@app.get("/")
def read_root():
    return {"status": "online", "message": "FormCraft API is up and running!"}
from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB_PATH = Path(os.getenv("FORMBUILDER_DB", Path(__file__).with_name("formbuilder.db")))
TOKEN_SECRET = os.getenv("FORMBUILDER_SECRET_KEY", "local-development-key-change-before-deployment").encode()
PASSWORD_ROUNDS = 310_000


@contextmanager
def connection():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
        db.commit()
    finally:
        db.close()


def initialize() -> None:
    with connection() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS forms (
          id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
          questions TEXT NOT NULL DEFAULT '[]', theme TEXT NOT NULL DEFAULT 'violet', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS responses (
          id TEXT PRIMARY KEY, form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
          answers TEXT NOT NULL, submitted_at TEXT NOT NULL
        );
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(forms)")}
        if "owner_id" not in columns:
            db.execute("ALTER TABLE forms ADD COLUMN owner_id TEXT REFERENCES users(id)")
        if "theme" not in columns:
            db.execute("ALTER TABLE forms ADD COLUMN theme TEXT NOT NULL DEFAULT 'violet'")


app = FastAPI(title="FormBuilder API", version="1.1.0")
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
#     allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://formcraft-three.vercel.app", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|\S+\.vercel\.app)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RegisterPayload(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=200)


class LoginPayload(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class Question(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str = Field(min_length=1, max_length=300)
    type: str = "short_text"
    required: bool = False
    options: list[str] = Field(default_factory=list)
    media_url: str = Field(default="", max_length=2000)


class FormCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    questions: list[Question] = Field(default_factory=list)
    theme: Literal["violet", "ocean", "forest", "sunset", "slate"] = "violet"


class ResponseCreate(BaseModel):
    answers: dict[str, Any]


class AIGenerateRequest(BaseModel):
    prompt: str = Field(min_length=8, max_length=2000)
    question_count: int = Field(default=6, ge=2, le=15)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def form_data(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "title": row["title"], "description": row["description"],
            "questions": json.loads(row["questions"]), "theme": row["theme"], "created_at": row["created_at"]}


def encode_part(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def create_token(user_id: str) -> str:
    payload = json.dumps({"sub": user_id, "exp": int((datetime.now(timezone.utc) + timedelta(days=7)).timestamp())},
                         separators=(",", ":")).encode()
    body = encode_part(payload)
    signature = encode_part(hmac.new(TOKEN_SECRET, body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}"


def user_payload(row: sqlite3.Row) -> dict[str, str]:
    return {"id": row["id"], "name": row["name"], "email": row["email"]}


def auth_result(row: sqlite3.Row) -> dict[str, Any]:
    return {"access_token": create_token(row["id"]), "token_type": "bearer", "user": user_payload(row)}


def current_user(authorization: str | None = Header(default=None)) -> dict[str, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please sign in to continue", headers={"WWW-Authenticate": "Bearer"})
    try:
        body, received_signature = authorization[7:].split(".", 1)
        expected = encode_part(hmac.new(TOKEN_SECRET, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(received_signature, expected):
            raise ValueError("invalid signature")
        padding = "=" * (-len(body) % 4)
        token = json.loads(base64.urlsafe_b64decode(body + padding))
        if int(token["exp"]) <= int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired token")
        user_id = str(token["sub"])
    except (ValueError, KeyError, TypeError, binascii.Error, json.JSONDecodeError):
        raise HTTPException(401, "Session expired. Please sign in again", headers={"WWW-Authenticate": "Bearer"})
    with connection() as db:
        row = db.execute("SELECT id,name,email FROM users WHERE id=?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(401, "Account not found. Please sign in again", headers={"WWW-Authenticate": "Bearer"})
    return user_payload(row)


def owned_form(db: sqlite3.Connection, form_id: str, user_id: str) -> sqlite3.Row:
    row = db.execute("SELECT * FROM forms WHERE id=? AND owner_id=?", (form_id, user_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Form not found")
    return row


def store_response(form_id: str, payload: ResponseCreate) -> dict[str, str]:
    with connection() as db:
        row = db.execute("SELECT questions FROM forms WHERE id=?", (form_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Form not found")
        questions = json.loads(row["questions"])
        missing = [q["title"] for q in questions if q.get("required") and not payload.answers.get(q["id"])]
        if missing:
            raise HTTPException(422, f"Required answers missing: {', '.join(missing)}")
        response_id = str(uuid4())
        submitted = now()
        db.execute("INSERT INTO responses(id,form_id,answers,submitted_at) VALUES(?,?,?,?)",
                   (response_id, form_id, json.dumps(payload.answers), submitted))
    return {"id": response_id, "submitted_at": submitted}


def generate_form_draft(prompt: str, question_count: int) -> dict[str, Any]:
    model = os.getenv("OLLAMA_MODEL", "llama3:latest")
    base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1").rstrip("/")
    schema_instructions = """Return only a valid JSON object with this shape:
{"title":"Form title","description":"Short form description","questions":[{"title":"Question text","type":"short_text|long_text|multiple_choice|checkboxes|dropdown","required":true,"options":[]}]}
Use options with 2-6 strings for multiple_choice, checkboxes, and dropdown. Use an empty options array for short_text and long_text. Include no markdown or extra prose."""
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": "You design clear, concise online forms. Follow the requested JSON format exactly."},
            {"role": "user", "content": f"Create a form with about {question_count} questions. User's brief: {prompt}\n\n{schema_instructions}"},
        ],
        "temperature": 0.5,
        "max_tokens": 1800,
    }).encode()
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=body,
        headers={"Authorization": "Bearer ollama", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            completion = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        if error.code == 404:
            raise HTTPException(502, f"Ollama could not find model '{model}'. Run `ollama pull {model}` and retry.")
        raise HTTPException(502, f"Ollama request failed ({error.code}): {detail}")
    except (urllib.error.URLError, TimeoutError) as error:
        raise HTTPException(502, f"Could not reach Ollama at {base_url}. Make sure Ollama is running: {error}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(502, "Ollama returned an invalid response")

    try:
        content = completion["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        text = str(content).strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end < start:
            raise ValueError("JSON object not found")
        draft = json.loads(text[start:end + 1])
        if not isinstance(draft, dict) or not isinstance(draft.get("questions"), list):
            raise ValueError("Invalid form structure")
        valid_types = {"short_text", "long_text", "multiple_choice", "checkboxes", "dropdown"}
        cleaned = []
        for raw_question in draft["questions"][:15]:
            if not isinstance(raw_question, dict):
                continue
            question_type = raw_question.get("type")
            if question_type not in valid_types:
                question_type = "short_text"
            raw_options = raw_question.get("options", [])
            if not isinstance(raw_options, list):
                raw_options = []
            options = [str(option)[:200] for option in raw_options[:8]]
            if question_type in {"multiple_choice", "checkboxes", "dropdown"} and len(options) < 2:
                question_type = "short_text"
            question = Question(
                title=(str(raw_question.get("title") or "Question")[:300]),
                type=question_type,
                required=bool(raw_question.get("required", False)),
                options=options if question_type in {"multiple_choice", "checkboxes", "dropdown"} else [],
            )
            cleaned.append(question.model_dump())
        if not cleaned:
            raise ValueError("No questions returned")
        return {
            "title": (str(draft.get("title") or "AI generated form")[:200]),
            "description": str(draft.get("description", ""))[:2000],
            "questions": cleaned,
        }
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise HTTPException(502, f"Could not read a form draft from the model response: {error}")


@app.on_event("startup")
def startup() -> None:
    initialize()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/ai/generate-form")
def ai_generate_form(payload: AIGenerateRequest, _user: dict[str, str] = Depends(current_user)) -> dict[str, Any]:
    return generate_form_draft(payload.prompt, payload.question_count)


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterPayload) -> dict[str, Any]:
    email = payload.email.strip().lower()
    name = payload.name.strip()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(422, "Enter a valid email address")
    if not name:
        raise HTTPException(422, "Name is required")
    salt = secrets.token_bytes(16)
    password_hash = salt.hex() + "$" + hashlib.pbkdf2_hmac("sha256", payload.password.encode(), salt, PASSWORD_ROUNDS).hex()
    user_id = str(uuid4())
    with connection() as db:
        first_user = db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
        try:
            db.execute("INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)",
                       (user_id, name, email, password_hash, now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "An account with this email already exists")
        # Existing development forms have no owner; let the first local account keep them.
        if first_user:
            db.execute("UPDATE forms SET owner_id=? WHERE owner_id IS NULL", (user_id,))
        row = db.execute("SELECT id,name,email FROM users WHERE id=?", (user_id,)).fetchone()
    return auth_result(row)


@app.post("/api/auth/login")
def login(payload: LoginPayload) -> dict[str, Any]:
    email = payload.email.strip().lower()
    with connection() as db:
        row = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if row is None:
        raise HTTPException(401, "Email or password is incorrect")
    salt_hex, expected_hash = row["password_hash"].split("$", 1)
    actual_hash = hashlib.pbkdf2_hmac("sha256", payload.password.encode(), bytes.fromhex(salt_hex), PASSWORD_ROUNDS).hex()
    if not hmac.compare_digest(actual_hash, expected_hash):
        raise HTTPException(401, "Email or password is incorrect")
    return auth_result(row)


@app.get("/api/auth/me")
def who_am_i(user: dict[str, str] = Depends(current_user)) -> dict[str, str]:
    return user


@app.get("/api/forms")
def list_forms(user: dict[str, str] = Depends(current_user)) -> list[dict[str, Any]]:
    with connection() as db:
        rows = db.execute("""SELECT f.*, (SELECT COUNT(*) FROM responses r WHERE r.form_id=f.id) AS response_count
                             FROM forms f WHERE f.owner_id=? ORDER BY created_at DESC""", (user["id"],)).fetchall()
        return [{**form_data(row), "response_count": row["response_count"]} for row in rows]


@app.post("/api/forms", status_code=201)
def create_form(payload: FormCreate, user: dict[str, str] = Depends(current_user)) -> dict[str, Any]:
    form_id = str(uuid4())
    with connection() as db:
        db.execute("INSERT INTO forms(id,owner_id,title,description,questions,theme,created_at) VALUES(?,?,?,?,?,?,?)",
                   (form_id, user["id"], payload.title, payload.description,
                    json.dumps([q.model_dump() for q in payload.questions]), payload.theme, now()))
        row = db.execute("SELECT * FROM forms WHERE id=?", (form_id,)).fetchone()
    return form_data(row)


@app.get("/api/forms/{form_id}")
def get_form(form_id: str, user: dict[str, str] = Depends(current_user)) -> dict[str, Any]:
    with connection() as db:
        row = owned_form(db, form_id, user["id"])
    return form_data(row)


@app.put("/api/forms/{form_id}")
def update_form(form_id: str, payload: FormCreate, user: dict[str, str] = Depends(current_user)) -> dict[str, Any]:
    with connection() as db:
        owned_form(db, form_id, user["id"])
        db.execute("UPDATE forms SET title=?, description=?, questions=?, theme=? WHERE id=? AND owner_id=?",
                   (payload.title, payload.description,
                    json.dumps([q.model_dump() for q in payload.questions]), payload.theme, form_id, user["id"]))
        row = owned_form(db, form_id, user["id"])
    return form_data(row)


@app.delete("/api/forms/{form_id}", status_code=204, response_class=Response)
def delete_form(form_id: str, user: dict[str, str] = Depends(current_user)) -> Response:
    with connection() as db:
        result = db.execute("DELETE FROM forms WHERE id=? AND owner_id=?", (form_id, user["id"]))
        if result.rowcount == 0:
            raise HTTPException(404, "Form not found")
    return Response(status_code=204)


@app.get("/api/forms/{form_id}/responses")
def list_responses(form_id: str, user: dict[str, str] = Depends(current_user)) -> list[dict[str, Any]]:
    with connection() as db:
        owned_form(db, form_id, user["id"])
        rows = db.execute("SELECT id,answers,submitted_at FROM responses WHERE form_id=? ORDER BY submitted_at DESC",
                          (form_id,)).fetchall()
    return [{"id": row["id"], "answers": json.loads(row["answers"]),
             "submitted_at": row["submitted_at"]} for row in rows]


@app.get("/api/public/forms/{form_id}")
def get_public_form(form_id: str) -> dict[str, Any]:
    with connection() as db:
        row = db.execute("SELECT * FROM forms WHERE id=?", (form_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Form not found")
    return form_data(row)


@app.post("/api/public/forms/{form_id}/responses", status_code=201)
def submit_response(form_id: str, payload: ResponseCreate) -> dict[str, str]:
    return store_response(form_id, payload)
