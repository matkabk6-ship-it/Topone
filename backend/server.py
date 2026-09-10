"""TOP ONE — production-ready FastAPI backend.

Handles anonymous user sessions, admin auth (email+password+6-digit PIN),
games, results, subscriptions, manual UPI payments, notifications, audit logs.
"""
from __future__ import annotations

import hashlib
import logging
import os
import random
import secrets
import string
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import (APIRouter, Depends, FastAPI, Header, HTTPException,
                     Request, status)
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, field_validator
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# -- Config --------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
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

# -- Mongo client (motor) ------------------------------------------------------
mongo_client = AsyncIOMotorClient(MONGO_URL, tz_aware=True, tzinfo=timezone.utc)
db = mongo_client[DB_NAME]

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
# Default plan config — seeded once into the `plans` collection so the admin
# can edit price / duration / benefits from the UI. The keys "base" and "pro"
# are stable identifiers; the admin edits everything else.
DEFAULT_PLANS: list[dict[str, Any]] = [
    {
        "id": "base",
        "name": "Base Plan",
        "price": 299,
        "currency": "INR",
        "benefits": {"open": 3, "jodi": 6, "pane": 0},
        "duration_days": 30,
        "tagline": "3 Open, 6 Jodi",
        "active": True,
        "sort_order": 1,
    },
    {
        "id": "pro",
        "name": "Pro Plan",
        "price": 599,
        "currency": "INR",
        "benefits": {"open": 1, "jodi": 2, "pane": 2},
        "duration_days": 30,
        "tagline": "1 Open, 2 Jodi, 2 Pane",
        "active": True,
        "sort_order": 2,
    },
]


async def _get_plan(plan_id: str) -> Optional[dict[str, Any]]:
    return await db.plans.find_one({"id": plan_id}, {"_id": 0})


def sanitize_plan(p: dict[str, Any]) -> dict[str, Any]:
    benefits = dict(p.get("benefits", {}))
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
    # Indexes
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("device_id_hash", unique=True)
    await db.users.create_index("top_one_id", unique=True)
    await db.user_sessions.create_index("token_hash", unique=True)
    await db.user_sessions.create_index("expires_at")
    await db.admins.create_index("email", unique=True)
    await db.games.create_index("id", unique=True)
    await db.results.create_index("id", unique=True)
    await db.results.create_index([("game_id", 1), ("date", -1)])
    await db.payments.create_index("id", unique=True)
    await db.payments.create_index("user_id")
    await db.subscriptions.create_index("id", unique=True)
    await db.subscriptions.create_index("user_id")
    await db.notifications.create_index("id", unique=True)
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.announcements.create_index("id", unique=True)
    await db.audit_logs.create_index("id", unique=True)
    await db.audit_logs.create_index("created_at")
    await db.tips.create_index("id", unique=True)
    await db.tips.create_index([("created_at", -1)])
    await db.tips.create_index([("audience", 1), ("created_at", -1)])
    await db.settings.create_index("key", unique=True)
    await db.support_tickets.create_index("id", unique=True)

    # Seed admin (idempotent)
    admin_email = os.environ["ADMIN_EMAIL"].strip().lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    admin_pin = os.environ["ADMIN_PIN"]
    if len(admin_pin) != 6 or not admin_pin.isdigit():
        raise RuntimeError("ADMIN_PIN must be 6 digits")
    existing = await db.admins.find_one({"email": admin_email})
    if not existing:
        await db.admins.insert_one({
            "admin_id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": _hash_bcrypt(admin_password),
            "pin_hash": _hash_bcrypt(admin_pin),
            "role": "admin",
            "created_at": _now(),
        })
        logger.info("Seeded admin %s", admin_email)

    # Seed games (idempotent)
    for g in DEFAULT_GAMES:
        await db.games.update_one(
            {"id": g["id"]},
            {"$setOnInsert": {**g, "created_at": _now()}},
            upsert=True,
        )

    # Seed plans (idempotent — existing edits stay)
    for p in DEFAULT_PLANS:
        await db.plans.update_one(
            {"id": p["id"]},
            {"$setOnInsert": {**p, "created_at": _now()}},
            upsert=True,
        )
    await db.plans.create_index("id", unique=True)

    # Seed payment settings
    await db.settings.update_one(
        {"key": "payment_config"},
        {"$setOnInsert": {
            "key": "payment_config",
            "upi_id": UPI_ID,
            "payee_name": UPI_PAYEE_NAME,
            "instructions": (
                "1. Open any UPI app (GPay, PhonePe, Paytm, BHIM).\n"
                "2. Send the exact plan amount to the UPI ID above or scan the QR.\n"
                "3. Copy the UTR / Transaction ID after payment.\n"
                "4. Return here and submit that reference in the form below.\n"
                "5. Your subscription activates once our team verifies the payment."
            ),
            "updated_at": _now(),
        }},
        upsert=True,
    )

    # Seed a default welcome announcement (idempotent)
    if not await db.announcements.find_one({"title": "Welcome to TOP ONE"}):
        await db.announcements.insert_one({
            "id": str(uuid.uuid4()),
            "title": "Welcome to TOP ONE",
            "message": ("Your premium membership dashboard is ready. "
                        "Explore the games, subscribe to unlock benefits, and enjoy the club."),
            "active": True,
            "created_at": _now(),
        })


@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_data()
    yield
    mongo_client.close()


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
    session = await db.user_sessions.find_one({
        "token_hash": _sha256(raw),
        "device_id_hash": _sha256(x_device_id),
        "expires_at": {"$gt": _now()},
    })
    if not session:
        raise _unauth()
    user = await db.users.find_one({"user_id": session["user_id"]})
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
    admin = await db.admins.find_one({"admin_id": admin_id})
    if not admin:
        raise _unauth()
    return admin


# -- Audit log helper ----------------------------------------------------------
async def _audit(actor: str, action: str, target: str = "", metadata: Optional[dict] = None) -> None:
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "actor": actor,
        "action": action,
        "target": target,
        "metadata": metadata or {},
        "created_at": _now(),
    })


# -- Subscription helpers ------------------------------------------------------
async def _expire_subscription_if_needed(sub: dict[str, Any]) -> dict[str, Any]:
    if sub.get("status") == "active" and sub.get("expires_at") and sub["expires_at"] < _now():
        await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"status": "expired"}})
        sub["status"] = "expired"
        # Notify
        await _notify_user(sub["user_id"], "subscription_expired",
                           "Subscription expired",
                           f"Your {sub.get('plan_name')} subscription has expired. Purchase again to keep enjoying benefits.")
    return sub


async def _get_active_sub(user_id: str) -> Optional[dict[str, Any]]:
    sub = await db.subscriptions.find_one(
        {"user_id": user_id, "status": "active"},
        sort=[("activated_at", -1)],
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
    benefits = dict(plan.get("benefits", {}))
    for k in ("open", "jodi", "pane"):
        benefits.setdefault(k, 0)
    # Deactivate any previous active sub (rare but safe)
    await db.subscriptions.update_many(
        {"user_id": user_id, "status": "active"},
        {"$set": {"status": "expired"}},
    )
    sub = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "plan_id": plan_id,
        "plan_name": plan.get("name", plan_id.title()),
        "status": "active",
        "activated_at": _now(),
        "expires_at": _now() + timedelta(days=int(plan.get("duration_days", 30))),
        "benefits_total": dict(benefits),
        "benefits_remaining": dict(benefits),
        "linked_payment_id": payment_id,
        "created_at": _now(),
    }
    await db.subscriptions.insert_one(dict(sub))
    return sub


# -- Notification helper -------------------------------------------------------
async def _notify_user(user_id: str, type_: str, title: str, message: str) -> None:
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": type_,
        "title": title,
        "message": message,
        "read": False,
        "created_at": _now(),
    })


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
    user = await db.users.find_one({"device_id_hash": device_hash})
    is_new = False
    if not user:
        is_new = True
        # Ensure unique top_one_id
        for _ in range(6):
            candidate = _generate_top_one_id()
            if not await db.users.find_one({"top_one_id": candidate}):
                break
        else:
            raise HTTPException(500, "Could not allocate ID")
        user_id = str(uuid.uuid4())
        doc = {
            "user_id": user_id,
            "device_id_hash": device_hash,
            "top_one_id": candidate,
            "display_name": body.display_name,
            "theme": "dark",
            "notifications_enabled": True,
            "sound_enabled": True,
            "created_at": _now(),
        }
        await db.users.insert_one(doc)
        user = await db.users.find_one({"user_id": user_id})
        # Welcome notification
        await _notify_user(user_id, "system", "Welcome to TOP ONE",
                           f"Your TOP ONE ID is {user['top_one_id']}. Copy it from your dashboard any time.")

    # Create session
    raw = secrets.token_urlsafe(32)
    await db.user_sessions.insert_one({
        "token_hash": _sha256(raw),
        "user_id": user["user_id"],
        "device_id_hash": device_hash,
        "expires_at": _now() + timedelta(days=90),
        "created_at": _now(),
    })
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
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    updated = await db.users.find_one({"user_id": user["user_id"]})
    return sanitize_user(updated)


@api.post("/users/logout")
async def logout(
    authorization: Annotated[Optional[str], Header()] = None,
    x_device_id: Annotated[Optional[str], Header()] = None,
):
    if authorization and authorization.startswith("Bearer "):
        raw = authorization[7:].strip()
        await db.user_sessions.delete_one({"token_hash": _sha256(raw)})
    return {"ok": True}


# ---------------------------- GAMES & RESULTS ---------------------------------
async def _latest_result_for(game_id: str) -> Optional[dict[str, Any]]:
    r = await db.results.find_one(
        {"game_id": game_id, "status": "published"},
        sort=[("date", -1), ("published_at", -1)],
    )
    return sanitize_result(r) if r else None


@api.get("/games")
async def list_games():
    cursor = db.games.find({"status": {"$ne": "deleted"}}, {"_id": 0}).sort("sort_order", 1)
    games = []
    async for g in cursor:
        latest = await _latest_result_for(g["id"])
        games.append(sanitize_game(g, latest))
    return games


@api.get("/games/{game_id}")
async def get_game(game_id: str):
    g = await db.games.find_one({"id": game_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Game not found")
    latest = await _latest_result_for(game_id)
    return sanitize_game(g, latest)


@api.get("/games/{game_id}/results")
async def game_results(game_id: str, limit: int = 30):
    limit = max(1, min(limit, 100))
    cursor = db.results.find(
        {"game_id": game_id, "status": "published"},
        {"_id": 0},
    ).sort([("date", -1), ("published_at", -1)]).limit(limit)
    return [sanitize_result(r) async for r in cursor]


@api.get("/results")
async def all_results(limit: int = 40):
    limit = max(1, min(limit, 100))
    cursor = db.results.find({"status": "published"}, {"_id": 0}) \
        .sort([("date", -1), ("published_at", -1)]).limit(limit)
    return [sanitize_result(r) async for r in cursor]


# ---------------------------- SUBSCRIPTIONS -----------------------------------
@api.get("/plans")
async def list_plans():
    cursor = db.plans.find({"active": True}, {"_id": 0}).sort("sort_order", 1)
    return [sanitize_plan(p) async for p in cursor]


@api.get("/subscriptions/me")
async def my_subscription(user=Depends(require_user)):
    sub = await _get_active_sub(user["user_id"])
    return {"subscription": sanitize_subscription(sub)}


@api.post("/subscriptions/use-benefit")
async def use_benefit(body: UseBenefitIn, user=Depends(require_user)):
    sub = await _get_active_sub(user["user_id"])
    if not sub:
        raise HTTPException(400, "No active subscription")
    remaining = sub.get("benefits_remaining", {})
    left = remaining.get(body.benefit_type, 0)
    if left <= 0:
        raise HTTPException(400, "No benefits remaining for this type")
    remaining[body.benefit_type] = left - 1
    await db.subscriptions.update_one(
        {"id": sub["id"]},
        {"$set": {"benefits_remaining": remaining}},
    )
    sub["benefits_remaining"] = remaining
    return sanitize_subscription(sub)


# ---------------------------- PAYMENTS ----------------------------------------
@api.get("/payments/config")
async def payment_config():
    cfg = await db.settings.find_one({"key": "payment_config"}, {"_id": 0})
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
    existing = await db.payments.find_one({
        "user_id": user["user_id"],
        "payment_reference": body.payment_reference.strip(),
    })
    if existing:
        raise HTTPException(409, "This payment reference is already submitted")

    payment = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "top_one_id": user["top_one_id"],
        "plan_id": plan["id"],
        "plan_name": plan.get("name", plan["id"].title()),
        "amount": plan.get("price", 0),
        "currency": plan.get("currency", "INR"),
        "payment_reference": body.payment_reference.strip(),
        "payer_name": body.payer_name,
        "note": body.note,
        "status": "pending",
        "submitted_at": _now(),
        "created_at": _now(),
    }
    await db.payments.insert_one(dict(payment))
    await _notify_user(user["user_id"], "payment_submitted",
                       "Payment submitted",
                       f"We received your {plan.get('name')} payment reference. Our team will verify it shortly.")
    return sanitize_payment(payment)


@api.get("/payments/me")
async def my_payments(user=Depends(require_user)):
    cursor = db.payments.find({"user_id": user["user_id"]}, {"_id": 0}) \
        .sort("submitted_at", -1)
    return [sanitize_payment(p) async for p in cursor]


# ---------------------------- NOTIFICATIONS -----------------------------------
@api.get("/notifications")
async def my_notifications(user=Depends(require_user), limit: int = 50):
    limit = max(1, min(limit, 100))
    # Include both user-specific and broadcast (user_id == "*")
    cursor = db.notifications.find(
        {"$or": [{"user_id": user["user_id"]}, {"user_id": "*"}]},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit)
    return [sanitize_notification(n) async for n in cursor]


@api.post("/notifications/read-all")
async def mark_all_read(user=Depends(require_user)):
    await db.notifications.update_many(
        {"$or": [{"user_id": user["user_id"]}, {"user_id": "*"}], "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True}


@api.post("/notifications/{nid}/read")
async def mark_read(nid: str, user=Depends(require_user)):
    await db.notifications.update_one(
        {"id": nid, "$or": [{"user_id": user["user_id"]}, {"user_id": "*"}]},
        {"$set": {"read": True}},
    )
    return {"ok": True}


# ---------------------------- ANNOUNCEMENTS -----------------------------------
@api.get("/announcements")
async def announcements():
    cursor = db.announcements.find({"active": True}, {"_id": 0}).sort("created_at", -1).limit(10)
    return [sanitize_announcement(a) async for a in cursor]


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
    cursor = db.tips.find(
        {"audience": {"$in": audiences}},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit)
    return {"tips": [sanitize_tip(t) async for t in cursor], "plan": plan}


# ---------------------------- SUPPORT -----------------------------------------
@api.post("/support/ticket")
async def create_ticket(body: SupportTicketIn, user=Depends(require_user)):
    t = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "top_one_id": user["top_one_id"],
        "subject": body.subject,
        "message": body.message,
        "category": body.category,
        "status": "open",
        "created_at": _now(),
    }
    await db.support_tickets.insert_one(dict(t))
    return {"id": t["id"], "status": t["status"]}


# ============================================================================
# ADMIN ROUTES
# ============================================================================
@api.post("/admin/login", response_model=AdminTokenOut)
async def admin_login(body: AdminLoginIn, request: Request):
    ip = request.client.host if request.client else "unknown"
    _check_login_rate_limit(ip)
    email = str(body.email).strip().lower()
    admin = await db.admins.find_one({"email": email})
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
    users_count = await db.users.count_documents({})
    pending_payments = await db.payments.count_documents({"status": "pending"})
    verified_payments = await db.payments.count_documents({"status": "verified"})
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    total_results = await db.results.count_documents({"status": "published"})
    total_games = await db.games.count_documents({"status": {"$ne": "deleted"}})
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
    filter_q: dict[str, Any] = {}
    if q:
        filter_q = {"$or": [
            {"top_one_id": {"$regex": q, "$options": "i"}},
            {"display_name": {"$regex": q, "$options": "i"}},
        ]}
    cursor = db.users.find(filter_q, {"_id": 0}).sort("created_at", -1).limit(max(1, min(limit, 200)))
    users = [sanitize_user(u) async for u in cursor]
    # Attach sub summary
    for u in users:
        sub = await _get_active_sub(u["user_id"])
        u["subscription"] = sanitize_subscription(sub)
    return users


@admin_router.get("/users/{user_id}")
async def admin_get_user(user_id: str):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Not found")
    payments = [sanitize_payment(p) async for p in db.payments.find({"user_id": user_id}, {"_id": 0}).sort("submitted_at", -1)]
    subs = [sanitize_subscription(s) async for s in db.subscriptions.find({"user_id": user_id}, {"_id": 0}).sort("activated_at", -1)]
    return {"user": sanitize_user(u), "payments": payments, "subscriptions": subs}


# ---- Games
@admin_router.get("/games")
async def admin_games():
    cursor = db.games.find({"status": {"$ne": "deleted"}}, {"_id": 0}).sort("sort_order", 1)
    return [sanitize_game(g) async for g in cursor]


@admin_router.patch("/games/{game_id}")
async def admin_update_game(game_id: str, body: UpdateGameIn, admin=Depends(require_admin)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(400, "No fields")
    res = await db.games.update_one({"id": game_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Game not found")
    await _audit(f"admin:{admin['admin_id']}", "game.update", target=game_id, metadata=update)
    g = await db.games.find_one({"id": game_id}, {"_id": 0})
    return sanitize_game(g)


@admin_router.post("/games")
async def admin_create_game(body: CreateGameIn, admin=Depends(require_admin)):
    if await db.games.find_one({"id": body.id}):
        raise HTTPException(409, "A game with this id already exists")
    game = {**body.model_dump(), "created_at": _now(), "created_by": admin["admin_id"]}
    await db.games.insert_one(dict(game))
    await _audit(f"admin:{admin['admin_id']}", "game.create", target=body.id,
                 metadata={"name": body.name})
    return sanitize_game(game)


@admin_router.delete("/games/{game_id}")
async def admin_delete_game(game_id: str, admin=Depends(require_admin)):
    res = await db.games.update_one({"id": game_id}, {"$set": {"status": "deleted"}})
    if res.matched_count == 0:
        raise HTTPException(404, "Game not found")
    await _audit(f"admin:{admin['admin_id']}", "game.delete", target=game_id)
    return {"ok": True}


# ---- Plans (admin editable)
@admin_router.get("/plans")
async def admin_list_plans():
    cursor = db.plans.find({}, {"_id": 0}).sort("sort_order", 1)
    return [sanitize_plan(p) async for p in cursor]


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
    await db.plans.update_one({"id": plan_id}, {"$set": data})
    await _audit(f"admin:{admin['admin_id']}", "plan.update", target=plan_id, metadata=data)
    updated = await db.plans.find_one({"id": plan_id}, {"_id": 0})
    return sanitize_plan(updated)


# ---- Results
@admin_router.get("/results")
async def admin_results(game_id: Optional[str] = None, limit: int = 100):
    q: dict[str, Any] = {"status": {"$ne": "deleted"}}
    if game_id:
        q["game_id"] = game_id
    cursor = db.results.find(q, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).limit(max(1, min(limit, 200)))
    return [sanitize_result(r) async for r in cursor]


@admin_router.post("/results")
async def admin_create_result(body: CreateResultIn, admin=Depends(require_admin)):
    g = await db.games.find_one({"id": body.game_id})
    if not g:
        raise HTTPException(404, "Game not found")
    r = {
        "id": str(uuid.uuid4()),
        "game_id": body.game_id,
        "date": body.date,
        "session": body.session,
        "open_pana": body.open_pana,
        "open_digit": body.open_digit,
        "jodi": body.jodi,
        "close_pana": body.close_pana,
        "close_digit": body.close_digit,
        "status": "published",
        "published_at": _now(),
        "created_at": _now(),
        "created_by": admin["admin_id"],
    }
    await db.results.insert_one(dict(r))
    await _audit(f"admin:{admin['admin_id']}", "result.publish", target=r["id"],
                 metadata={"game_id": body.game_id, "date": body.date})
    # Broadcast notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": "*",
        "type": "result_new",
        "title": f"New {g['name']} result",
        "message": f"A new result for {g['name']} on {body.date} has been published.",
        "read": False,
        "created_at": _now(),
    })
    return sanitize_result(r)


@admin_router.delete("/results/{result_id}")
async def admin_delete_result(result_id: str, admin=Depends(require_admin)):
    res = await db.results.update_one({"id": result_id}, {"$set": {"status": "deleted"}})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    await _audit(f"admin:{admin['admin_id']}", "result.delete", target=result_id)
    return {"ok": True}


# ---- Payments
@admin_router.get("/payments")
async def admin_payments(status_filter: Optional[str] = None, limit: int = 100):
    q: dict[str, Any] = {}
    if status_filter:
        q["status"] = status_filter
    cursor = db.payments.find(q, {"_id": 0}).sort("submitted_at", -1).limit(max(1, min(limit, 200)))
    return [sanitize_payment(p) async for p in cursor]


@admin_router.post("/payments/{payment_id}/verify")
async def admin_verify_payment(payment_id: str, body: VerifyPaymentIn, admin=Depends(require_admin)):
    p = await db.payments.find_one({"id": payment_id})
    if not p:
        raise HTTPException(404, "Payment not found")
    if p["status"] != "pending":
        raise HTTPException(400, f"Payment already {p['status']}")

    if body.action == "verify":
        # Activate subscription
        sub = await _activate_subscription(p["user_id"], p["plan_id"], p["id"])
        await db.payments.update_one(
            {"id": payment_id},
            {"$set": {
                "status": "verified",
                "verified_at": _now(),
                "verified_by": admin["admin_id"],
                "subscription_id": sub["id"],
            }},
        )
        await _notify_user(p["user_id"], "payment_verified",
                           "Payment verified",
                           f"Your {p['plan_name']} payment was verified. Your subscription is now active.")
        await _notify_user(p["user_id"], "subscription_activated",
                           "Subscription activated",
                           f"Your {p['plan_name']} is active. Enjoy your benefits.")
        await _audit(f"admin:{admin['admin_id']}", "payment.verify", target=payment_id,
                     metadata={"user_id": p["user_id"], "plan_id": p["plan_id"]})
        updated = await db.payments.find_one({"id": payment_id}, {"_id": 0})
        return sanitize_payment(updated)

    # reject
    await db.payments.update_one(
        {"id": payment_id},
        {"$set": {
            "status": "rejected",
            "reject_reason": body.reason or "Not verified",
            "verified_at": _now(),
            "verified_by": admin["admin_id"],
        }},
    )
    await _notify_user(p["user_id"], "payment_rejected",
                       "Payment rejected",
                       f"Your {p['plan_name']} payment could not be verified. Reason: {body.reason or 'not verified'}. Please resubmit.")
    await _audit(f"admin:{admin['admin_id']}", "payment.reject", target=payment_id,
                 metadata={"user_id": p["user_id"], "reason": body.reason})
    updated = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    return sanitize_payment(updated)


# ---- Subscriptions
@admin_router.get("/subscriptions")
async def admin_subscriptions(status_filter: Optional[str] = None, limit: int = 100):
    q: dict[str, Any] = {}
    if status_filter:
        q["status"] = status_filter
    cursor = db.subscriptions.find(q, {"_id": 0}).sort("activated_at", -1).limit(max(1, min(limit, 200)))
    return [sanitize_subscription(s) async for s in cursor]


# ---- Notifications broadcast
@admin_router.post("/notifications")
async def admin_create_notification(body: CreateNotificationIn, admin=Depends(require_admin)):
    if body.audience == "user":
        if not body.user_id:
            raise HTTPException(400, "user_id required")
        target_id = body.user_id
    else:
        target_id = "*"
    n = {
        "id": str(uuid.uuid4()),
        "user_id": target_id,
        "type": body.type,
        "title": body.title,
        "message": body.message,
        "read": False,
        "created_at": _now(),
    }
    await db.notifications.insert_one(dict(n))
    await _audit(f"admin:{admin['admin_id']}", "notification.send", target=target_id,
                 metadata={"title": body.title})
    return sanitize_notification(n)


# ---- Announcements
@admin_router.get("/announcements")
async def admin_list_announcements():
    cursor = db.announcements.find({}, {"_id": 0}).sort("created_at", -1)
    return [sanitize_announcement(a) async for a in cursor]


@admin_router.post("/announcements")
async def admin_create_announcement(body: CreateAnnouncementIn, admin=Depends(require_admin)):
    a = {
        "id": str(uuid.uuid4()),
        "title": body.title,
        "message": body.message,
        "active": body.active,
        "created_at": _now(),
    }
    await db.announcements.insert_one(dict(a))
    await _audit(f"admin:{admin['admin_id']}", "announcement.create", target=a["id"])
    return sanitize_announcement(a)


@admin_router.delete("/announcements/{aid}")
async def admin_delete_announcement(aid: str, admin=Depends(require_admin)):
    await db.announcements.update_one({"id": aid}, {"$set": {"active": False}})
    await _audit(f"admin:{admin['admin_id']}", "announcement.deactivate", target=aid)
    return {"ok": True}


# ---- Tips (targeted to subscribers)
@admin_router.get("/tips")
async def admin_list_tips(audience: Optional[str] = None, limit: int = 100):
    q: dict[str, Any] = {}
    if audience in ("base", "pro", "both"):
        q["audience"] = audience
    cursor = db.tips.find(q, {"_id": 0}).sort("created_at", -1).limit(max(1, min(limit, 300)))
    return [sanitize_tip(t) async for t in cursor]


@admin_router.post("/tips")
async def admin_create_tip(body: CreateTipIn, admin=Depends(require_admin)):
    # Validate game exists
    g = await db.games.find_one({"id": body.game_id})
    if not g:
        raise HTTPException(404, "Game not found")
    # Pane tips are Pro-only content: disallow sending pane to base-only audience.
    if body.tip_type == "pane" and body.audience == "base":
        raise HTTPException(400, "Pane tips are Pro-only content. Set audience to 'pro' or 'both'.")

    tip = {
        "id": str(uuid.uuid4()),
        "game_id": body.game_id,
        "tip_type": body.tip_type,
        "value": body.value.strip(),
        "session": body.session,
        "note": body.note,
        "audience": body.audience,
        "for_date": body.for_date,
        "created_at": _now(),
        "created_by": admin["admin_id"],
    }
    await db.tips.insert_one(dict(tip))

    # Fan out an in-app notification to every subscriber whose plan matches
    # this tip's audience.
    plans_to_target: list[str] = []
    if body.audience == "both":
        plans_to_target = ["base", "pro"]
    else:
        plans_to_target = [body.audience]

    active_subs = db.subscriptions.find(
        {"status": "active", "plan_id": {"$in": plans_to_target}},
        {"user_id": 1, "plan_name": 1, "_id": 0},
    )
    now = _now()
    notif_batch = []
    async for s in active_subs:
        notif_batch.append({
            "id": str(uuid.uuid4()),
            "user_id": s["user_id"],
            "type": "tip_new",
            "title": f"New {g['name']} tip for {s.get('plan_name', 'your plan')}",
            "message": f"A fresh {body.tip_type.upper()} tip is waiting in your Tips channel.",
            "read": False,
            "created_at": now,
        })
    if notif_batch:
        await db.notifications.insert_many(notif_batch)

    await _audit(
        f"admin:{admin['admin_id']}",
        "tip.publish",
        target=tip["id"],
        metadata={"game_id": body.game_id, "type": body.tip_type, "audience": body.audience,
                  "reach": len(notif_batch)},
    )
    return sanitize_tip(tip)


@admin_router.delete("/tips/{tip_id}")
async def admin_delete_tip(tip_id: str, admin=Depends(require_admin)):
    res = await db.tips.delete_one({"id": tip_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Tip not found")
    await _audit(f"admin:{admin['admin_id']}", "tip.delete", target=tip_id)
    return {"ok": True}


# ---- Payment configuration
@admin_router.get("/settings/payment")
async def admin_get_payment():
    cfg = await db.settings.find_one({"key": "payment_config"}, {"_id": 0})
    return cfg or {}


@admin_router.patch("/settings/payment")
async def admin_update_payment(body: PaymentConfigIn, admin=Depends(require_admin)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(400, "No fields")
    update["updated_at"] = _now()
    await db.settings.update_one({"key": "payment_config"}, {"$set": update}, upsert=True)
    await _audit(f"admin:{admin['admin_id']}", "settings.payment.update", metadata=update)
    cfg = await db.settings.find_one({"key": "payment_config"}, {"_id": 0})
    return cfg


# ---- Audit logs
@admin_router.get("/audit-logs")
async def admin_audit(limit: int = 100):
    cursor = db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(max(1, min(limit, 500)))
    return [sanitize_audit(a) async for a in cursor]


# ---- Support tickets
@admin_router.get("/support/tickets")
async def admin_tickets():
    cursor = db.support_tickets.find({}, {"_id": 0}).sort("created_at", -1).limit(200)
    tickets = []
    async for t in cursor:
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
