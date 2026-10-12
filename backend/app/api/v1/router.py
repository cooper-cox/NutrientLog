from fastapi import APIRouter

from app.api.v1 import goals, limits, users

router = APIRouter()
router.include_router(users.router)
router.include_router(goals.router)
router.include_router(limits.router)
