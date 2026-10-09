from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.db import get_session
from app.schemas.profile import GoalOut
from app.services import goals as goals_service

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("/current", response_model=GoalOut)
def get_current_goal(
    user: CurrentUser, session: Annotated[Session, Depends(get_session)]
) -> GoalOut:
    """The calorie and macro targets in effect now. A 404 means no profile has been saved yet."""
    goal = goals_service.get_current_goal(session, user)
    if goal is None:
        raise HTTPException(status_code=404, detail="no goal yet; save a profile first")
    return GoalOut.model_validate(goal)
