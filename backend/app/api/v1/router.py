from fastapi import APIRouter

from app.api.v1 import goals, users

router = APIRouter()
router.include_router(users.router)
router.include_router(goals.router)
