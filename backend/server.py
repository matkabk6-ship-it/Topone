"""TOP ONE — production-ready FastAPI backend.

Handles anonymous user sessions, admin auth (email+password+6-digit PIN),
games, results, subscriptions, manual UPI payments, notifications, audit logs.

Storage: Supabase Postgres (accessed directly via asyncpg — no ORM).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import string
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Optional

import asyncpg
import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import (APIRouter, Depends, FastAPI, Header, HTTPException,
                     Request, status)
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel, EmailStr, Field, field_validator
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# -- Config --------------------------------------------------------------------
DATABASE_URL = os.environ["DATABASE_URL"]  # Supabase Postgres connection string
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ISSUER = os.environ.get("JWT_ISSUER", "topone-api")
JWT_ALGORITHM = "HS256"
# Admin JWT lifetime. Session persists silently across app restarts as long as
# the token is not expired or revoked by the backend.
ADMIN_JWT_MINUTES = 60 * 24 * 30  # 30 days
UPI_ID = os.environ.get("UPI_ID", "")
UPI_PAYEE_NAME = os.environ.get("UPI_PAYEE_NAME", "TOP ONE")

# -- Logging -------------------------------------------------------------------
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("topone")

# -- Postgres pool (asyncpg) -----------------------------------------------------
pool: asyncpg.Pool  # set in lifespan()


async def _init_connection(conn: asyncpg.Connection) -> None:
    # Make jsonb columns behave like plain Python dicts, in/out.
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog",
    )


async def fetchrow(query: str, *args: Any) -> Optional[dict[str, Any]]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, *args)
        return dict(row) if row else None


async def fetchall(query: str, *args: Any) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *args)
        return [dict(r) for r in rows]


async def execute(query: str, *args: Any) -> str:
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)


async def _update_row(table: str, pk_col: str, pk_val: str,
                       fields: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Build and run `UPDATE {table} SET ... WHERE {pk_col}=$n RETURNING *`."""
    if not fields:
        return await fetchrow(f"SELECT * FROM {table} WHERE {pk_col} = $1", pk_val)
    set_parts = []
    values: list[Any] = []
    idx = 1
    for k, v in fields.items():
        set_parts.append(f"{k} = ${idx}")
        values.append(v)
        idx += 1
    values.append(pk_val)
    query = f"UPDATE {table} SET {', '.join(set_parts)} WHERE {pk_col} = ${idx} RETURNING *"
    return await fetchrow(query, *values)


# -- Schema (idempotent — safe to run on every startup) -------------------------
SCHEMA_SQL = """
create table if not exists users (
  user_id text primary key,
  device_id_hash text unique not null,
  top_one_id text unique not null,
  display_name text,
  theme text not null default 'dark',
  notifications_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists user_sessions (
  token_hash text primary key,
  user_id text not null references users(user_id) on delete cascade,
  device_id_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_user_sessions_expires on user_sessions(expires_at);
create table if not exists admins (
  admin_id text primary key,
  email text unique not null,
  password_hash text not null,
  pin_hash text not null,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);
create table if not exists games (
  id text primary key,
  name text not null,
  description text not null default '',
  open_time text,
  close_time text,
  schedule_note text not null default '',
  status text not null default 'active',
  sort_order int not null default 99,
  created_at timestamptz not null default now(),
  created_by text
);
create table if not exists results (
  id text primary key,
  game_id text not null references games(id),
  date text not null,
  session text,
  open_pana text,
  open_digit text,
  jodi text,
  close_pana text,
  close_digit text,
  status text not null default 'published',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text
);
create index if not exists idx_results_game_date on results(game_id, date desc);
create table if not exists plans (
  id text primary key,
  name text not null,
  price int not null default 0,
  currency text not null default 'INR',
  benefits jsonb not null default '{}'::jsonb,
  duration_days int not null default 30,
  tagline text not null default '',
  active boolean not null default true,
  sort_order int not null default 99,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create table if not exists payments (
  id text primary key,
  user_id text not null references users(user_id),
  top_one_id text,
  plan_id text not null,
  plan_name text,
  amount int not null default 0,
  currency text not null default 'INR',
  payment_reference text not null,
  payer_name text,
  note text,
  status text not null default 'pending',
  reject_reason text,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by text,
  subscription_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_user on payments(user_id);
create unique index if not exists idx_payments_user_ref on payments(user_id, payment_reference);
create table if not exists subscriptions (
  id text primary key,
  user_id text not null references users(user_id),
  plan_id text not null,
  plan_name text,
  status text not null default 'active',
  activated_at timestamptz,
  expires_at timestamptz,
  benefits_total jsonb not null default '{}'::jsonb,
  benefits_remaining jsonb not null default '{}'::jsonb,
  linked_payment_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_subs_user on subscriptions(user_id);
create table if not exists notifications (
  id text primary key,
  user_id text not null,
  type text not null default 'system',
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user_created on notifications(user_id, created_at desc);
create table if not exists announcements (
  id text primary key,
  title text not null,
  message text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists tips (
  id text primary key,
  game_id text not null,
  tip_type text not null,
  value text not null,
  session text,
  note text,
  audience text not null,
  for_date text,
  created_at timestamptz not null default now(),
  created_by text
);
create index if not exists idx_tips_created on tips(created_at desc);
create index if not exists idx_tips_audience_created on tips(audience, created_at desc);
create table if not exists settings (
  key text primary key,
  upi_id text,
  payee_name text,
  instructions text,
  updated_at timestamptz not null default now()
);
create table if not exists audit_logs (
  id text primary key,
  actor text,
  action text,
  target text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on audit_logs(created_at desc);
create table if not exists support_tickets (
  id text primary key,
  user_id text not null,
  top_one_id text,
  subject text not null,
  message text not null,
  category text not null default 'general',
  status text not null default 'open',
  created_at timestamptz not null default now()
);
"""

# -- Rate limiter (in-memory) --------------------------------------------------
_login_attempts: dict[str, list[float]] = {}
LOGIN_WINDOW_SEC = 60
LOGIN_MAX_ATTEMPTS = 8


def _check_login_rate_limit(ip: str) -> None:
    now = time.time()
    recent = [t for t in _login_attempts.get(ip, []) if now - t < LOGIN_WINDOW_SEC]
    if len(recent) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts")
    recent.append(now)
    _login_attempts[ip] = recent


# -- Helpers -------------------------------------------------------------------
def _unauth() -> HTTPException:
    return HTTPException(status_code=401, detail="Unauthorized")


def _hash_bcrypt(value: str) -> str:
    return bcrypt.hashpw(value.encode(), bcrypt.gensalt(rounds=12)).decode()


def _matches_bcrypt(value: str, stored: str) -> bool:
    try:
        return bcrypt.checkpw(value.encode(), stored.encode())
    except (ValueError, TypeError):
        return False


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.astimezone(timezone.utc).isoformat() if dt else None


def _generate_top_one_id() -> str:
    """TOP-XXXXXXXX (8 alphanumeric uppercase, easy to read)."""
    alphabet = string.ascii_uppercase + string.digits
    alphabet = alphabet.replace("O", "").replace("0", "").replace("I", "").replace("1", "")
    return "TOP-" + "".join(secrets.choice(alphabet) for _ in range(8))


def _create_admin_token(admin_id: str, email: str) -> str:
    now = _now()
    claims = {
        "sub": f"admin:{admin_id}",
        "email": email,
        "role": "admin",
        "iss": JWT_ISSUER,
        "iat": now,
        "exp": now + timedelta(minutes=ADMIN_JWT_MINUTES),
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(claims, JWT_SECRET, algorithm=JWT_ALGORITHM)


# -- Domain constants ----------------------------------------------------------
DEFAULT_PLANS: list[dict[str, Any]] = [
    {
        "id": "base", "name": "Base Plan", "price": 299, "currency": "INR",
        "benefits": {"open": 3, "jodi": 6, "pane": 0}, "duration_days": 30,
        "tagline": "3 Open, 6 Jodi", "active": True, "sort_order": 1,
    },
    {
        "id": "pro", "name": "Pro Plan", "price": 599, "currency": "INR",
        "benefits": {"open": 1, "jodi": 2, "pane": 2}, "duration_days": 30,
        "tagline": "1 Open, 2 Jodi, 2 Pane", "active": True, "sort_order": 2,
    },
]


async def _get_plan(plan_id: str) -> Optional[dict[str, Any]]:
    return await fetchrow("SELECT * FROM plans WHERE id = $1", plan_id)


def sanitize_plan(p: dict[str, Any]) -> dict[str, Any]:
    benefits = dict(p.get("benefits") or {})
    for k in ("open", "jodi", "pane"):
        benefits.setdefault(k, 0)
    return {
        "id": p["id"],
        "name": p.get("name", p["id"].title() + " Plan"),
        "price": p.get("price", 0),
        "currency": p.get("currency", "INR"),
        "benefits": benefits,
        "duration_days": p.get("duration_days", 30),
        "tagline": p.get("tagline", ""),
        "active": p.get("active", True),
        "sort_order": p.get("sort_order", 99),
    }


DEFAULT_GAMES: list[dict[str, Any]] = [
    {"id": "sridevi", "name": "SRIDEVI",
     "description": "Sridevi is one of the most-watched morning games. Results twice daily.",
     "open_time": "11:35", "close_time": "12:35",
     "schedule_note": "Mon – Sat", "status": "active", "sort_order": 1},
    {"id": "kalyan", "name": "KALYAN",
     "description": "Kalyan is the flagship afternoon game with a long-running history.",
     "open_time": "15:45", "close_time": "17:45",
     "schedule_note": "Mon – Sat", "status": "active", "sort_order": 2},
    {"id": "main_bazar", "name": "MAIN BAZAR",
     "description": "Main Bazar is the premier late-night game — the night's headliner.",
     "open_time": "21:35", "close_time": "23:59",
     "schedule_note": "Mon – Sun", "status": "active", "sort_order": 3},
]

# -- Pydantic models -----------------------------------------------------------
class InitUserIn(BaseModel):
    device_id: str = Field(min_length=8, max_length=256)
    display_name: Optional[str] = Field(default=None, max_length=64)


class InitUserOut(BaseModel):
    user_id: str
    session_token: str
    top_one_id: str
    display_name: Optional[str] = None
    theme: str = "dark"
    is_new: bool


class UpdateProfileIn(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=64)
    theme: Optional[str] = Field(default=None, pattern="^(light|dark|system)$")
    notifications_enabled: Optional[bool] = None
    sound_enabled: Optional[bool] = None


class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    pin: str

    @field_validator("pin")
    @classmethod
    def _pin(cls, v: str) -> str:
        if len(v) != 6 or not v.isdigit():
            raise ValueError("PIN must be 6 digits")
        return v


class AdminTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: dict[str, Any]


class SubmitPaymentIn(BaseModel):
    plan_id: str = Field(pattern="^(base|pro)$")
    payment_reference: str = Field(min_length=4, max_length=64)
    payer_name: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=256)


class VerifyPaymentIn(BaseModel):
    action: str = Field(pattern="^(verify|reject)$")
    reason: Optional[str] = Field(default=None, max_length=256)


class CreateResultIn(BaseModel):
    game_id: str
    date: str  # YYYY-MM-DD
    session: str = Field(pattern="^(open|close)$")
    open_pana: Optional[str] = Field(default=None, max_length=8)
    open_digit: Optional[str] = Field(default=None, max_length=2)
    jodi: Optional[str] = Field(default=None, max_length=4)
    close_pana: Optional[str] = Field(default=None, max_length=8)
    close_digit: Optional[str] = Field(default=None, max_length=2)


class CreateAnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=1000)
    active: bool = True


class CreateNotificationIn(BaseModel):
    audience: str = Field(default="all", pattern="^(all|user)$")
    user_id: Optional[str] = None
    type: str = Field(default="system", max_length=32)
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=1000)


class UpdateGameIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=64)
    description: Optional[str] = Field(default=None, max_length=500)
    open_time: Optional[str] = Field(default=None, max_length=8)
    close_time: Optional[str] = Field(default=None, max_length=8)
    schedule_note: Optional[str] = Field(default=None, max_length=64)
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")
    sort_order: Optional[int] = Field(default=None, ge=0, le=999)


class CreateGameIn(BaseModel):
    id: str = Field(min_length=2, max_length=32, pattern="^[a-z0-9_]+$")
    name: str = Field(min_length=2, max_length=64)
    description: str = Field(default="", max_length=500)
    open_time: Optional[str] = Field(default=None, max_length=8)
    close_time: Optional[str] = Field(default=None, max_length=8)
    schedule_note: str = Field(default="", max_length=64)
    status: str = Field(default="active", pattern="^(active|inactive)$")
    sort_order: int = Field(default=50, ge=0, le=999)


class BenefitsIn(BaseModel):
    open: int = Field(default=0, ge=0, le=999)
    jodi: int = Field(default=0, ge=0, le=999)
    pane: int = Field(default=0, ge=0, le=999)


class UpdatePlanIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=64)
    price: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    duration_days: Optional[int] = Field(default=None, ge=1, le=3650)
    benefits: Optional[BenefitsIn] = None
    tagline: Optional[str] = Field(default=None, max_length=140)
    active: Optional[bool] = None
    sort_order: Optional[int] = Field(default=None, ge=0, le=999)


class PaymentConfigIn(BaseModel):
    upi_id: Optional[str] = None
    payee_name: Optional[str] = None
    instructions: Optional[str] = None


class UseBenefitIn(BaseModel):
    benefit_type: str = Field(pattern="^(open|jodi|pane)$")


class CreateTipIn(BaseModel):
    game_id: str
    tip_type: str = Field(pattern="^(open|jodi|pane)$")
    value: str = Field(min_length=1, max_length=12)
    session: Optional[str] = Field(default=None, pattern="^(open|close)$")
    note: Optional[str] = Field(default=None, max_length=280)
    audience: str = Field(pattern="^(base|pro|both)$")
    for_date: Optional[str] = Field(default=None, max_length=10)  # YYYY-MM-DD


class SupportTicketIn(BaseModel):
    subject: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=2000)
    category: str = Field(default="general", max_length=32)


# -- Sanitizers ----------------------------------------------------------------
def sanitize_user(u: dict[str, Any]) -> dict[str, Any]:
    return {
        "user_id": u["user_id"],
        "top_one_id": u["top_one_id"],
        "display_name": u.get("display_name"),
        "theme": u.get("theme", "dark"),
        "notifications_enabled": u.get("notifications_enabled", True),
        "sound_enabled": u.get("sound_enabled", True),
        "created_at": _iso(u.get("created_at")),
    }


def sanitize_admin(a: dict[str, Any]) -> dict[str, Any]:
    return {"id": a["admin_id"], "email": a["email"], "role": a.get("role", "admin")}


def sanitize_game(g: dict[str, Any], latest: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    return {
        "id": g["id"],
        "name": g["name"],
        "description": g.get("description", ""),
        "open_time": g.get("open_time"),
        "close_time": g.get("close_time"),
        "schedule_note": g.get("schedule_note", ""),
        "status": g.get("status", "active"),
        "sort_order": g.get("sort_order", 99),
        "latest_result": latest,
    }


def sanitize_result(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": r["id"],
        "game_id": r["game_id"],
        "date": r["date"],
        "session": r.get("session"),
        "open_pana": r.get("open_pana"),
        "open_digit": r.get("open_digit"),
        "jodi": r.get("jodi"),
        "close_pana": r.get("close_pana"),
        "close_digit": r.get("close_digit"),
        "status": r.get("status", "published"),
        "published_at": _iso(r.get("published_at")),
        "created_at": _iso(r.get("created_at")),
    }


def sanitize_payment(p: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": p["id"],
        "user_id": p["user_id"],
        "top_one_id": p.get("top_one_id"),
        "plan_id": p["plan_id"],
        "plan_name": p.get("plan_name"),
        "amount": p["amount"],
        "currency": p.get("currency", "INR"),
        "payment_reference": p["payment_reference"],
        "payer_name": p.get("payer_name"),
        "note": p.get("note"),
        "status": p["status"],  # pending | verified | rejected | cancelled
        "reject_reason": p.get("reject_reason"),
        "submitted_at": _iso(p.get("submitted_at")),
        "verified_at": _iso(p.get("verified_at")),
        "verified_by": p.get("verified_by"),
    }


def sanitize_subscription(s: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not s:
        return None
    return {
        "id": s["id"],
        "user_id": s["user_id"],
        "plan_id": s["plan_id"],
        "plan_name": s.get("plan_name"),
        "status": s["status"],  # active | expired
        "activated_at": _iso(s.get("activated_at")),
        "expires_at": _iso(s.get("expires_at")),
        "benefits_total": s.get("benefits_total", {}),
        "benefits_remaining": s.get("benefits_remaining", {}),
        "linked_payment_id": s.get("linked_payment_id"),
    }


def sanitize_notification(n: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": n["id"],
        "type": n.get("type", "system"),
        "title": n["title"],
        "message": n["message"],
        "read": n.get("read", False),
        "created_at": _iso(n.get("created_at")),
    }


def sanitize_announcement(a: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": a["id"],
        "title": a["title"],
        "message": a["message"],
        "active": a.get("active", True),
        "created_at": _iso(a.get("created_at")),
    }


def sanitize_audit(a: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": a["id"],
        "actor": a.get("actor"),
        "action": a.get("action"),
        "target": a.get("target"),
        "metadata": a.get("metadata", {}),
        "created_at": _iso(a.get("created_at")),
    }


def sanitize_tip(t: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": t["id"],
        "game_id": t["game_id"],
        "tip_type": t["tip_type"],  # open | jodi | pane
        "value": t["value"],
        "session": t.get("session"),
        "note": t.get("note"),
        "audience": t.get("audience", "both"),  # base | pro | both
        "for_date": t.get("for_date"),
        "created_at": _iso(t.get("created_at")),
    }


# -- Startup / seed ------------------------------------------------------------
async def seed_data() -> None:
    await execute(SCHEMA_SQL)

    # Seed admin (idempotent)
    admin_email = os.environ["ADMIN_EMAIL"].strip().lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    admin_pin = os.environ["ADMIN_PIN"]
    if len(admin_pin) != 6 or not admin_pin.isdigit():
        raise RuntimeError("ADMIN_PIN must be 6 digits")
    existing = await fetchrow("SELECT admin_id FROM admins WHERE email = $1", admin_email)
    if not existing:
        await execute(
            "INSERT INTO admins (admin_id, email, password_hash, pin_hash, role) "
            "VALUES ($1, $2, $3, $4, 'admin')",
            str(uuid.uuid4()), admin_email, _hash_bcrypt(admin_password), _hash_bcrypt(admin_pin),
        )
        logger.info("Seeded admin %s", admin_email)

    # Seed games (idempotent)
    for g in DEFAULT_GAMES:
        await execute(
            "INSERT INTO games (id, name, description, open_time, close_time, schedule_note, "
            "status, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING",
            g["id"], g["name"], g["description"], g["open_time"], g["close_time"],
            g["schedule_note"], g["status"], g["sort_order"],
        )

    # Seed plans (idempotent — existing edits stay)
    for p in DEFAULT_PLANS:
        await execute(
            "INSERT INTO plans (id, name, price, currency, benefits, duration_days, tagline, "
            "active, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING",
            p["id"], p["name"], p["price"], p["currency"], p["benefits"], p["duration_days"],
            p["tagline"], p["active"], p["sort_order"],
        )

    # Seed payment settings
    await execute(
        "INSERT INTO settings (key, upi_id, payee_name, instructions) VALUES ($1,$2,$3,$4) "
        "ON CONFLICT (key) DO NOTHING",
        "payment_config", UPI_ID, UPI_PAYEE_NAME,
        "1. Open any UPI app (GPay, PhonePe, Paytm, BHIM).\n"
        "2. Send the exact plan amount to the UPI ID above or scan the QR.\n"
        "3. Copy the UTR / Transaction ID after payment.\n"
        "4. Return here and submit that reference in the form below.\n"
        "5. Your subscription activates once our team verifies the payment.",
    )

    # Seed a default welcome announcement (idempotent)
    existing_ann = await fetchrow("SELECT id FROM announcements WHERE title = $1", "Welcome to TOP ONE")
    if not existing_ann:
        await execute(
            "INSERT INTO announcements (id, title, message, active) VALUES ($1,$2,$3,$4)",
            str(uuid.uuid4()), "Welcome to TOP ONE",
            "Your premium membership dashboard is ready. Explore the games, subscribe to "
            "unlock benefits, and enjoy the club.",
            True,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, init=_init_connection, min_size=1, max_size=10)
    await seed_data()
    yield
    await pool.close()


app = FastAPI(title="TOP ONE API", lifespan=lifespan)
api = APIRouter(prefix="/api")

# -- Auth dependencies ---------------------------------------------------------
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/admin/login", auto_error=False)


async def require_user(
    authorization: Annotated[Optional[str], Header()] = None,
    x_device_id: Annotated[Optional[str], Header()] = None,
) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer ") or not x_device_id:
        raise _unauth()
    raw = authorization[7:].strip()
    session = await fetchrow(
        "SELECT * FROM user_sessions WHERE token_hash = $1 AND device_id_hash = $2 "
        "AND expires_at > now()",
        _sha256(raw), _sha256(x_device_id),
    )
    if not session:
        raise _unauth()
    user = await fetchrow("SELECT * FROM users WHERE user_id = $1", session["user_id"])
    if not user:
        raise _unauth()
    return user


async def require_admin(token: Annotated[Optional[str], Depends(oauth2)]) -> dict[str, Any]:
    if not token:
        raise _unauth()
    try:
        payload = jwt.decode(
            token, JWT_SECRET, algorithms=[JWT_ALGORITHM], issuer=JWT_ISSUER,
            options={"require": ["sub", "exp", "iat", "iss", "role"]},
        )
        if payload.get("role") != "admin" or not str(payload["sub"]).startswith("admin:"):
            raise _unauth()
        admin_id = payload["sub"].split(":", 1)[1]
    except (InvalidTokenError, ValueError, TypeError, KeyError):
        raise _unauth()
    admin = await fetchrow("SELECT * FROM admins WHERE admin_id = $1", admin_id)
    if not admin:
        raise _unauth()
    return admin


# -- Audit log helper ----------------------------------------------------------
async def _audit(actor: str, action: str, target: str = "", metadata: Optional[dict] = None) -> None:
    await execute(
        "INSERT INTO audit_logs (id, actor, action, target, metadata) VALUES ($1,$2,$3,$4,$5)",
        str(uuid.uuid4()), actor, action, target, metadata or {},
    )


# -- Subscription helpers ------------------------------------------------------
async def _expire_subscription_if_needed(sub: dict[str, Any]) -> dict[str, Any]:
    if sub.get("status") == "active" and sub.get("expires_at") and sub["expires_at"] < _now():
        await execute("UPDATE subscriptions SET status = 'expired' WHERE id = $1", sub["id"])
        sub["status"] = "expired"
        await _notify_user(sub["user_id"], "subscription_expired",
                           "Subscription expired",
                           f"Your {sub.get('plan_name')} subscription has expired. Purchase again to keep enjoying benefits.")
    return sub


async def _get_active_sub(user_id: str) -> Optional[dict[str, Any]]:
    sub = await fetchrow(
        "SELECT * FROM subscriptions WHERE user_id = $1 AND status = 'active' "
        "ORDER BY activated_at DESC LIMIT 1",
        user_id,
    )
    if sub:
        sub = await _expire_subscription_if_needed(sub)
        if sub.get("status") == "active":
            return sub
    return None


async def _activate_subscription(user_id: str, plan_id: str, payment_id: str) -> dict[str, Any]:
    plan = await _get_plan(plan_id)
    if not plan:
        raise HTTPException(400, "Plan no longer available")
    benefits = dict(plan.get("benefits") or {})
    for k in ("open", "jodi", "pane"):
        benefits.setdefault(k, 0)
    # Deactivate any previous active sub (rare but safe)
    await execute(
        "UPDATE subscriptions SET status = 'expired' WHERE user_id = $1 AND status = 'active'",
        user_id,
    )
    sub_id = str(uuid.uuid4())
    activated_at = _now()
    expires_at = activated_at + timedelta(days=int(plan.get("duration_days", 30)))
    plan_name = plan.get("name", plan_id.title())
    await execute(
        "INSERT INTO subscriptions (id, user_id, plan_id, plan_name, status, activated_at, "
        "expires_at, benefits_total, benefits_remaining, linked_payment_id) "
        "VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9)",
        sub_id, user_id, plan_id, plan_name, activated_at, expires_at,
        dict(benefits), dict(benefits), payment_id,
    )
    return {
        "id": sub_id, "user_id": user_id, "plan_id": plan_id, "plan_name": plan_name,
        "status": "active", "activated_at": activated_at, "expires_at": expires_at,
        "benefits_total": dict(benefits), "benefits_remaining": dict(benefits),
        "linked_payment_id": payment_id,
    }


# -- Notification helper -------------------------------------------------------
async def _notify_user(user_id: str, type_: str, title: str, message: str) -> None:
    await execute(
        "INSERT INTO notifications (id, user_id, type, title, message, read) "
        "VALUES ($1,$2,$3,$4,$5,false)",
        str(uuid.uuid4()), user_id, type_, title, message,
    )


# ============================================================================
# PUBLIC ROUTES
# ============================================================================
@api.get("/")
async def root():
    return {"app": "TOP ONE", "status": "ok"}


@api.get("/health")
async def health():
    return {"status": "ok", "time": _iso(_now())}


# ---------------------------- USER: init/session ------------------------------
@api.post("/users/init", response_model=InitUserOut)
async def init_user(body: InitUserIn):
    device_hash = _sha256(body.device_id)
    user = await fetchrow("SELECT * FROM users WHERE device_id_hash = $1", device_hash)
    is_new = False
    if not user:
        is_new = True
        # Ensure unique top_one_id
        for _ in range(6):
            candidate = _generate_top_one_id()
            if not await fetchrow("SELECT 1 FROM users WHERE top_one_id = $1", candidate):
                break
        else:
            raise HTTPException(500, "Could not allocate ID")
        user_id = str(uuid.uuid4())
        await execute(
            "INSERT INTO users (user_id, device_id_hash, top_one_id, display_name, theme, "
            "notifications_enabled, sound_enabled) VALUES ($1,$2,$3,$4,'dark',true,true)",
            user_id, device_hash, candidate, body.display_name,
        )
        user = await fetchrow("SELECT * FROM users WHERE user_id = $1", user_id)
        # Welcome notification
        await _notify_user(user_id, "system", "Welcome to TOP ONE",
                           f"Your TOP ONE ID is {user['top_one_id']}. Copy it from your dashboard any time.")

    # Create session
    raw = secrets.token_urlsafe(32)
    await execute(
        "INSERT INTO user_sessions (token_hash, user_id, device_id_hash, expires_at) "
        "VALUES ($1,$2,$3,$4)",
        _sha256(raw), user["user_id"], device_hash, _now() + timedelta(days=90),
    )
    return InitUserOut(
        user_id=user["user_id"],
        session_token=raw,
        top_one_id=user["top_one_id"],
        display_name=user.get("display_name"),
        theme=user.get("theme", "dark"),
        is_new=is_new,
    )


@api.get("/users/me")
async def get_me(user=Depends(require_user)):
    sub = await _get_active_sub(user["user_id"])
    return {"user": sanitize_user(user), "subscription": sanitize_subscription(sub)}


@api.patch("/users/me")
async def update_me(body: UpdateProfileIn, user=Depends(require_user)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    updated = await _update_row("users", "user_id", user["user_id"], update)
    return sanitize_user(updated)


@api.post("/users/logout")
async def logout(
    authorization: Annotated[Optional[str], Header()] = None,
    x_device_id: Annotated[Optional[str], Header()] = None,
):
    if authorization and authorization.startswith("Bearer "):
        raw = authorization[7:].strip()
        await execute("DELETE FROM user_sessions WHERE token_hash = $1", _sha256(raw))
    return {"ok": True}


# ---------------------------- GAMES & RESULTS ---------------------------------
async def _latest_result_for(game_id: str) -> Optional[dict[str, Any]]:
    r = await fetchrow(
        "SELECT * FROM results WHERE game_id = $1 AND status = 'published' "
        "ORDER BY date DESC, published_at DESC LIMIT 1",
        game_id,
    )
    return sanitize_result(r) if r else None


@api.get("/games")
async def list_games():
    rows = await fetchall("SELECT * FROM games WHERE status != 'deleted' ORDER BY sort_order ASC")
    games = []
    for g in rows:
        latest = await _latest_result_for(g["id"])
        games.append(sanitize_game(g, latest))
    return games


@api.get("/games/{game_id}")
async def get_game(game_id: str):
    g = await fetchrow("SELECT * FROM games WHERE id = $1", game_id)
    if not g:
        raise HTTPException(404, "Game not found")
    latest = await _latest_result_for(game_id)
    return sanitize_game(g, latest)


@api.get("/games/{game_id}/results")
async def game_results(game_id: str, limit: int = 30):
    limit = max(1, min(limit, 100))
    rows = await fetchall(
        "SELECT * FROM results WHERE game_id = $1 AND status = 'published' "
        "ORDER BY date DESC, published_at DESC LIMIT $2",
        game_id, limit,
    )
    return [sanitize_result(r) for r in rows]


@api.get("/results")
async def all_results(limit: int = 40):
    limit = max(1, min(limit, 100))
    rows = await fetchall(
        "SELECT * FROM results WHERE status = 'published' "
        "ORDER BY date DESC, published_at DESC LIMIT $1",
        limit,
    )
    return [sanitize_result(r) for r in rows]


# ---------------------------- SUBSCRIPTIONS -----------------------------------
@api.get("/plans")
async def list_plans():
    rows = await fetchall("SELECT * FROM plans WHERE active = true ORDER BY sort_order ASC")
    return [sanitize_plan(p) for p in rows]


@api.get("/subscriptions/me")
async def my_subscription(user=Depends(require_user)):
    sub = await _get_active_sub(user["user_id"])
    return {"subscription": sanitize_subscription(sub)}


@api.post("/subscriptions/use-benefit")
async def use_benefit(body: UseBenefitIn, user=Depends(require_user)):
    sub = await _get_active_sub(user["user_id"])
    if not sub:
        raise HTTPException(400, "No active subscription")
    remaining = dict(sub.get("benefits_remaining", {}))
    left = remaining.get(body.benefit_type, 0)
    if left <= 0:
        raise HTTPException(400, "No benefits remaining for this type")
    remaining[body.benefit_type] = left - 1
    await execute(
        "UPDATE subscriptions SET benefits_remaining = $1 WHERE id = $2",
        remaining, sub["id"],
    )
    sub["benefits_remaining"] = remaining
    return sanitize_subscription(sub)


# ---------------------------- PAYMENTS ----------------------------------------
@api.get("/payments/config")
async def payment_config():
    cfg = await fetchrow("SELECT * FROM settings WHERE key = 'payment_config'")
    if not cfg:
        raise HTTPException(500, "Payment not configured")
    return {"upi_id": cfg.get("upi_id"), "payee_name": cfg.get("payee_name"),
            "instructions": cfg.get("instructions", "")}


@api.post("/payments/submit")
async def submit_payment(body: SubmitPaymentIn, user=Depends(require_user)):
    plan = await _get_plan(body.plan_id)
    if not plan or not plan.get("active", True):
        raise HTTPException(400, "Invalid plan")
    # Prevent duplicate: same reference for same user
    existing = await fetchrow(
        "SELECT 1 FROM payments WHERE user_id = $1 AND payment_reference = $2",
        user["user_id"], body.payment_reference.strip(),
    )
    if existing:
        raise HTTPException(409, "This payment reference is already submitted")

    payment_id = str(uuid.uuid4())
    submitted_at = _now()
    plan_name = plan.get("name", plan["id"].title())
    amount = plan.get("price", 0)
    currency = plan.get("currency", "INR")
    await execute(
        "INSERT INTO payments (id, user_id, top_one_id, plan_id, plan_name, amount, currency, "
        "payment_reference, payer_name, note, status, submitted_at) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)",
        payment_id, user["user_id"], user["top_one_id"], plan["id"], plan_name, amount, currency,
        body.payment_reference.strip(), body.payer_name, body.note, submitted_at,
    )
    await _notify_user(user["user_id"], "payment_submitted",
                       "Payment submitted",
                       f"We received your {plan_name} payment reference. Our team will verify it shortly.")
    return sanitize_payment({
        "id": payment_id, "user_id": user["user_id"], "top_one_id": user["top_one_id"],
        "plan_id": plan["id"], "plan_name": plan_name, "amount": amount, "currency": currency,
        "payment_reference": body.payment_reference.strip(), "payer_name": body.payer_name,
        "note": body.note, "status": "pending", "submitted_at": submitted_at,
    })


@api.get("/payments/me")
async def my_payments(user=Depends(require_user)):
    rows = await fetchall(
        "SELECT * FROM payments WHERE user_id = $1 ORDER BY submitted_at DESC",
        user["user_id"],
    )
    return [sanitize_payment(p) for p in rows]


# ---------------------------- NOTIFICATIONS -----------------------------------
@api.get("/notifications")
async def my_notifications(user=Depends(require_user), limit: int = 50):
    limit = max(1, min(limit, 100))
    rows = await fetchall(
        "SELECT * FROM notifications WHERE user_id = $1 OR user_id = '*' "
        "ORDER BY created_at DESC LIMIT $2",
        user["user_id"], limit,
    )
    return [sanitize_notification(n) for n in rows]


@api.post("/notifications/read-all")
async def mark_all_read(user=Depends(require_user)):
    await execute(
        "UPDATE notifications SET read = true WHERE (user_id = $1 OR user_id = '*') AND read = false",
        user["user_id"],
    )
    return {"ok": True}


@api.post("/notifications/{nid}/read")
async def mark_read(nid: str, user=Depends(require_user)):
    await execute(
        "UPDATE notifications SET read = true WHERE id = $1 AND (user_id = $2 OR user_id = '*')",
        nid, user["user_id"],
    )
    return {"ok": True}


# ---------------------------- ANNOUNCEMENTS -----------------------------------
@api.get("/announcements")
async def announcements():
    rows = await fetchall(
        "SELECT * FROM announcements WHERE active = true ORDER BY created_at DESC LIMIT 10"
    )
    return [sanitize_announcement(a) for a in rows]


# ---------------------------- TIPS (subscribers only) ------------------------
@api.get("/tips")
async def my_tips(user=Depends(require_user), limit: int = 50):
    """Private tips for the current subscriber. Base users see tips whose
    audience is 'base' or 'both'; Pro users see 'pro' or 'both'. Users
    without an active subscription get an empty list."""
    sub = await _get_active_sub(user["user_id"])
    if not sub:
        return {"tips": [], "plan": None}
    plan = sub["plan_id"]  # "base" | "pro"
    audiences = [plan, "both"]
    limit = max(1, min(limit, 100))
    rows = await fetchall(
        "SELECT * FROM tips WHERE audience = ANY($1) ORDER BY created_at DESC LIMIT $2",
        audiences, limit,
    )
    return {"tips": [sanitize_tip(t) for t in rows], "plan": plan}


# ---------------------------- SUPPORT -----------------------------------------
@api.post("/support/ticket")
async def create_ticket(body: SupportTicketIn, user=Depends(require_user)):
    ticket_id = str(uuid.uuid4())
    await execute(
        "INSERT INTO support_tickets (id, user_id, top_one_id, subject, message, category, status) "
        "VALUES ($1,$2,$3,$4,$5,$6,'open')",
        ticket_id, user["user_id"], user["top_one_id"], body.subject, body.message, body.category,
    )
    return {"id": ticket_id, "status": "open"}


# ============================================================================
# ADMIN ROUTES
# ============================================================================
@api.post("/admin/login", response_model=AdminTokenOut)
async def admin_login(body: AdminLoginIn, request: Request):
    ip = request.client.host if request.client else "unknown"
    _check_login_rate_limit(ip)
    email = str(body.email).strip().lower()
    admin = await fetchrow("SELECT * FROM admins WHERE email = $1", email)
    # Constant-time-ish: always run one bcrypt check
    dummy = _hash_bcrypt("dummy-password") if not admin else None
    password_ok = _matches_bcrypt(body.password, admin["password_hash"]) if admin \
        else _matches_bcrypt(body.password, dummy)
    pin_ok = _matches_bcrypt(body.pin, admin["pin_hash"]) if admin else False
    if not (admin and password_ok and pin_ok):
        raise HTTPException(401, "Invalid credentials")
    token = _create_admin_token(admin["admin_id"], admin["email"])
    await _audit(f"admin:{admin['admin_id']}", "admin.login", target=admin["email"], metadata={"ip": ip})
    return AdminTokenOut(access_token=token, admin=sanitize_admin(admin))


admin_router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


@admin_router.get("/me")
async def admin_me(admin=Depends(require_admin)):
    return sanitize_admin(admin)


@admin_router.get("/stats")
async def admin_stats():
    users_count = (await fetchrow("SELECT count(*) AS c FROM users"))["c"]
    pending_payments = (await fetchrow("SELECT count(*) AS c FROM payments WHERE status = 'pending'"))["c"]
    verified_payments = (await fetchrow("SELECT count(*) AS c FROM payments WHERE status = 'verified'"))["c"]
    active_subs = (await fetchrow("SELECT count(*) AS c FROM subscriptions WHERE status = 'active'"))["c"]
    total_results = (await fetchrow("SELECT count(*) AS c FROM results WHERE status = 'published'"))["c"]
    total_games = (await fetchrow("SELECT count(*) AS c FROM games WHERE status != 'deleted'"))["c"]
    return {
        "users": users_count,
        "pending_payments": pending_payments,
        "verified_payments": verified_payments,
        "active_subscriptions": active_subs,
        "published_results": total_results,
        "games": total_games,
    }


# ---- Users
@admin_router.get("/users")
async def admin_list_users(q: Optional[str] = None, limit: int = 50):
    limit = max(1, min(limit, 200))
    if q:
        pattern = f"%{q}%"
        rows = await fetchall(
            "SELECT * FROM users WHERE top_one_id ILIKE $1 OR display_name ILIKE $1 "
            "ORDER BY created_at DESC LIMIT $2",
            pattern, limit,
        )
    else:
        rows = await fetchall("SELECT * FROM users ORDER BY created_at DESC LIMIT $1", limit)
    users = [sanitize_user(u) for u in rows]
    # Attach sub summary
    for u in users:
        sub = await _get_active_sub(u["user_id"])
        u["subscription"] = sanitize_subscription(sub)
    return users


@admin_router.get("/users/{user_id}")
async def admin_get_user(user_id: str):
    u = await fetchrow("SELECT * FROM users WHERE user_id = $1", user_id)
    if not u:
        raise HTTPException(404, "Not found")
    payments = [sanitize_payment(p) for p in await fetchall(
        "SELECT * FROM payments WHERE user_id = $1 ORDER BY submitted_at DESC", user_id)]
    subs = [sanitize_subscription(s) for s in await fetchall(
        "SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY activated_at DESC", user_id)]
    return {"user": sanitize_user(u), "payments": payments, "subscriptions": subs}


# ---- Games
@admin_router.get("/games")
async def admin_games():
    rows = await fetchall("SELECT * FROM games WHERE status != 'deleted' ORDER BY sort_order ASC")
    return [sanitize_game(g) for g in rows]


@admin_router.patch("/games/{game_id}")
async def admin_update_game(game_id: str, body: UpdateGameIn, admin=Depends(require_admin)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(400, "No fields")
    g = await _update_row("games", "id", game_id, update)
    if not g:
        raise HTTPException(404, "Game not found")
    await _audit(f"admin:{admin['admin_id']}", "game.update", target=game_id, metadata=update)
    return sanitize_game(g)


@admin_router.post("/games")
async def admin_create_game(body: CreateGameIn, admin=Depends(require_admin)):
    if await fetchrow("SELECT 1 FROM games WHERE id = $1", body.id):
        raise HTTPException(409, "A game with this id already exists")
    await execute(
        "INSERT INTO games (id, name, description, open_time, close_time, schedule_note, "
        "status, sort_order, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        body.id, body.name, body.description, body.open_time, body.close_time,
        body.schedule_note, body.status, body.sort_order, admin["admin_id"],
    )
    await _audit(f"admin:{admin['admin_id']}", "game.create", target=body.id,
                 metadata={"name": body.name})
    g = await fetchrow("SELECT * FROM games WHERE id = $1", body.id)
    return sanitize_game(g)


@admin_router.delete("/games/{game_id}")
async def admin_delete_game(game_id: str, admin=Depends(require_admin)):
    g = await _update_row("games", "id", game_id, {"status": "deleted"})
    if not g:
        raise HTTPException(404, "Game not found")
    await _audit(f"admin:{admin['admin_id']}", "game.delete", target=game_id)
    return {"ok": True}


# ---- Plans (admin editable)
@admin_router.get("/plans")
async def admin_list_plans():
    rows = await fetchall("SELECT * FROM plans ORDER BY sort_order ASC")
    return [sanitize_plan(p) for p in rows]


@admin_router.patch("/plans/{plan_id}")
async def admin_update_plan(plan_id: str, body: UpdatePlanIn, admin=Depends(require_admin)):
    plan = await _get_plan(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    data = body.model_dump(exclude_none=True)
    if "benefits" in data:
        data["benefits"] = dict(data["benefits"])
    if not data:
        raise HTTPException(400, "No fields")
    data["updated_at"] = _now()
    updated = await _update_row("plans", "id", plan_id, data)
    await _audit(f"admin:{admin['admin_id']}", "plan.update", target=plan_id, metadata=data)
    return sanitize_plan(updated)


# ---- Results
@admin_router.get("/results")
async def admin_results(game_id: Optional[str] = None, limit: int = 100):
    limit = max(1, min(limit, 200))
    if game_id:
        rows = await fetchall(
            "SELECT * FROM results WHERE status != 'deleted' AND game_id = $1 "
            "ORDER BY date DESC, created_at DESC LIMIT $2",
            game_id, limit,
        )
    else:
        rows = await fetchall(
            "SELECT * FROM results WHERE status != 'deleted' "
            "ORDER BY date DESC, created_at DESC LIMIT $1",
            limit,
        )
    return [sanitize_result(r) for r in rows]


@admin_router.post("/results")
async def admin_create_result(body: CreateResultIn, admin=Depends(require_admin)):
    g = await fetchrow("SELECT * FROM games WHERE id = $1", body.game_id)
    if not g:
        raise HTTPException(404, "Game not found")
    result_id = str(uuid.uuid4())
    published_at = _now()
    await execute(
        "INSERT INTO results (id, game_id, date, session, open_pana, open_digit, jodi, "
        "close_pana, close_digit, status, published_at, created_by) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'published',$10,$11)",
        result_id, body.game_id, body.date, body.session, body.open_pana, body.open_digit,
        body.jodi, body.close_pana, body.close_digit, published_at, admin["admin_id"],
    )
    await _audit(f"admin:{admin['admin_id']}", "result.publish", target=result_id,
                 metadata={"game_id": body.game_id, "date": body.date})
    # Broadcast notification
    await execute(
        "INSERT INTO notifications (id, user_id, type, title, message, read) "
        "VALUES ($1,'*','result_new',$2,$3,false)",
        str(uuid.uuid4()), f"New {g['name']} result",
        f"A new result for {g['name']} on {body.date} has been published.",
    )
    r = await fetchrow("SELECT * FROM results WHERE id = $1", result_id)
    return sanitize_result(r)


@admin_router.delete("/results/{result_id}")
async def admin_delete_result(result_id: str, admin=Depends(require_admin)):
    r = await _update_row("results", "id", result_id, {"status": "deleted"})
    if not r:
        raise HTTPException(404, "Not found")
    await _audit(f"admin:{admin['admin_id']}", "result.delete", target=result_id)
    return {"ok": True}


# ---- Payments
@admin_router.get("/payments")
async def admin_payments(status_filter: Optional[str] = None, limit: int = 100):
    limit = max(1, min(limit, 200))
    if status_filter:
        rows = await fetchall(
            "SELECT * FROM payments WHERE status = $1 ORDER BY submitted_at DESC LIMIT $2",
            status_filter, limit,
        )
    else:
        rows = await fetchall(
            "SELECT * FROM payments ORDER BY submitted_at DESC LIMIT $1", limit)
    return [sanitize_payment(p) for p in rows]


@admin_router.post("/payments/{payment_id}/verify")
async def admin_verify_payment(payment_id: str, body: VerifyPaymentIn, admin=Depends(require_admin)):
    p = await fetchrow("SELECT * FROM payments WHERE id = $1", payment_id)
    if not p:
        raise HTTPException(404, "Payment not found")
    if p["status"] != "pending":
        raise HTTPException(400, f"Payment already {p['status']}")

    if body.action == "verify":
        # Activate subscription
        sub = await _activate_subscription(p["user_id"], p["plan_id"], p["id"])
        await execute(
            "UPDATE payments SET status = 'verified', verified_at = $1, verified_by = $2, "
            "subscription_id = $3 WHERE id = $4",
            _now(), admin["admin_id"], sub["id"], payment_id,
        )
        await _notify_user(p["user_id"], "payment_verified",
                           "Payment verified",
                           f"Your {p['plan_name']} payment was verified. Your subscription is now active.")
        await _notify_user(p["user_id"], "subscription_activated",
                           "Subscription activated",
                           f"Your {p['plan_name']} is active. Enjoy your benefits.")
        await _audit(f"admin:{admin['admin_id']}", "payment.verify", target=payment_id,
                     metadata={"user_id": p["user_id"], "plan_id": p["plan_id"]})
        updated = await fetchrow("SELECT * FROM payments WHERE id = $1", payment_id)
        return sanitize_payment(updated)

    # reject
    await execute(
        "UPDATE payments SET status = 'rejected', reject_reason = $1, verified_at = $2, "
        "verified_by = $3 WHERE id = $4",
        body.reason or "Not verified", _now(), admin["admin_id"], payment_id,
    )
    await _notify_user(p["user_id"], "payment_rejected",
                       "Payment rejected",
                       f"Your {p['plan_name']} payment could not be verified. Reason: {body.reason or 'not verified'}. Please resubmit.")
    await _audit(f"admin:{admin['admin_id']}", "payment.reject", target=payment_id,
                 metadata={"user_id": p["user_id"], "reason": body.reason})
    updated = await fetchrow("SELECT * FROM payments WHERE id = $1", payment_id)
    return sanitize_payment(updated)


# ---- Subscriptions
@admin_router.get("/subscriptions")
async def admin_subscriptions(status_filter: Optional[str] = None, limit: int = 100):
    limit = max(1, min(limit, 200))
    if status_filter:
        rows = await fetchall(
            "SELECT * FROM subscriptions WHERE status = $1 ORDER BY activated_at DESC LIMIT $2",
            status_filter, limit,
        )
    else:
        rows = await fetchall(
            "SELECT * FROM subscriptions ORDER BY activated_at DESC LIMIT $1", limit)
    return [sanitize_subscription(s) for s in rows]


# ---- Notifications broadcast
@admin_router.post("/notifications")
async def admin_create_notification(body: CreateNotificationIn, admin=Depends(require_admin)):
    if body.audience == "user":
        if not body.user_id:
            raise HTTPException(400, "user_id required")
        target_id = body.user_id
    else:
        target_id = "*"
    n_id = str(uuid.uuid4())
    await execute(
        "INSERT INTO notifications (id, user_id, type, title, message, read) "
        "VALUES ($1,$2,$3,$4,$5,false)",
        n_id, target_id, body.type, body.title, body.message,
    )
    await _audit(f"admin:{admin['admin_id']}", "notification.send", target=target_id,
                 metadata={"title": body.title})
    n = await fetchrow("SELECT * FROM notifications WHERE id = $1", n_id)
    return sanitize_notification(n)


# ---- Announcements
@admin_router.get("/announcements")
async def admin_list_announcements():
    rows = await fetchall("SELECT * FROM announcements ORDER BY created_at DESC")
    return [sanitize_announcement(a) for a in rows]


@admin_router.post("/announcements")
async def admin_create_announcement(body: CreateAnnouncementIn, admin=Depends(require_admin)):
    a_id = str(uuid.uuid4())
    await execute(
        "INSERT INTO announcements (id, title, message, active) VALUES ($1,$2,$3,$4)",
        a_id, body.title, body.message, body.active,
    )
    await _audit(f"admin:{admin['admin_id']}", "announcement.create", target=a_id)
    a = await fetchrow("SELECT * FROM announcements WHERE id = $1", a_id)
    return sanitize_announcement(a)


@admin_router.delete("/announcements/{aid}")
async def admin_delete_announcement(aid: str, admin=Depends(require_admin)):
    await execute("UPDATE announcements SET active = false WHERE id = $1", aid)
    await _audit(f"admin:{admin['admin_id']}", "announcement.deactivate", target=aid)
    return {"ok": True}


# ---- Tips (targeted to subscribers)
@admin_router.get("/tips")
async def admin_list_tips(audience: Optional[str] = None, limit: int = 100):
    limit = max(1, min(limit, 300))
    if audience in ("base", "pro", "both"):
        rows = await fetchall(
            "SELECT * FROM tips WHERE audience = $1 ORDER BY created_at DESC LIMIT $2",
            audience, limit,
        )
    else:
        rows = await fetchall("SELECT * FROM tips ORDER BY created_at DESC LIMIT $1", limit)
    return [sanitize_tip(t) for t in rows]


@admin_router.post("/tips")
async def admin_create_tip(body: CreateTipIn, admin=Depends(require_admin)):
    # Validate game exists
    g = await fetchrow("SELECT * FROM games WHERE id = $1", body.game_id)
    if not g:
        raise HTTPException(404, "Game not found")
    # Pane tips are Pro-only content: disallow sending pane to base-only audience.
    if body.tip_type == "pane" and body.audience == "base":
        raise HTTPException(400, "Pane tips are Pro-only content. Set audience to 'pro' or 'both'.")

    tip_id = str(uuid.uuid4())
    await execute(
        "INSERT INTO tips (id, game_id, tip_type, value, session, note, audience, for_date, "
        "created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        tip_id, body.game_id, body.tip_type, body.value.strip(), body.session, body.note,
        body.audience, body.for_date, admin["admin_id"],
    )

    # Fan out an in-app notification to every subscriber whose plan matches
    # this tip's audience.
    plans_to_target = ["base", "pro"] if body.audience == "both" else [body.audience]
    active_subs = await fetchall(
        "SELECT user_id, plan_name FROM subscriptions WHERE status = 'active' AND plan_id = ANY($1)",
        plans_to_target,
    )
    reach = 0
    if active_subs:
        now = _now()
        rows_to_insert = [
            (str(uuid.uuid4()), s["user_id"], "tip_new",
             f"New {g['name']} tip for {s.get('plan_name', 'your plan')}",
             f"A fresh {body.tip_type.upper()} tip is waiting in your Tips channel.", False, now)
            for s in active_subs
        ]
        async with pool.acquire() as conn:
            await conn.executemany(
                "INSERT INTO notifications (id, user_id, type, title, message, read, created_at) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7)",
                rows_to_insert,
            )
        reach = len(rows_to_insert)

    await _audit(
        f"admin:{admin['admin_id']}",
        "tip.publish",
        target=tip_id,
        metadata={"game_id": body.game_id, "type": body.tip_type, "audience": body.audience,
                  "reach": reach},
    )
    tip = await fetchrow("SELECT * FROM tips WHERE id = $1", tip_id)
    return sanitize_tip(tip)


@admin_router.delete("/tips/{tip_id}")
async def admin_delete_tip(tip_id: str, admin=Depends(require_admin)):
    result = await execute("DELETE FROM tips WHERE id = $1", tip_id)
    if result == "DELETE 0":
        raise HTTPException(404, "Tip not found")
    await _audit(f"admin:{admin['admin_id']}", "tip.delete", target=tip_id)
    return {"ok": True}


# ---- Payment configuration
@admin_router.get("/settings/payment")
async def admin_get_payment():
    cfg = await fetchrow("SELECT * FROM settings WHERE key = 'payment_config'")
    return cfg or {}


@admin_router.patch("/settings/payment")
async def admin_update_payment(body: PaymentConfigIn, admin=Depends(require_admin)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(400, "No fields")
    update["updated_at"] = _now()
    cfg = await _update_row("settings", "key", "payment_config", update)
    await _audit(f"admin:{admin['admin_id']}", "settings.payment.update", metadata=update)
    return cfg


# ---- Audit logs
@admin_router.get("/audit-logs")
async def admin_audit(limit: int = 100):
    limit = max(1, min(limit, 500))
    rows = await fetchall(
        "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1", limit)
    return [sanitize_audit(a) for a in rows]


# ---- Support tickets
@admin_router.get("/support/tickets")
async def admin_tickets():
    rows = await fetchall(
        "SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 200")
    tickets = []
    for t in rows:
        tickets.append({
            "id": t["id"],
            "user_id": t["user_id"],
            "top_one_id": t.get("top_one_id"),
            "subject": t["subject"],
            "message": t["message"],
            "category": t.get("category"),
            "status": t.get("status", "open"),
            "created_at": _iso(t.get("created_at")),
        })
    return tickets


api.include_router(admin_router)
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
