from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.clock import utc_now
from app.core.db import get_session
from app.schemas.profile import ProfileIn, ProfileOut, ProfileSaved
from app.schemas.user import UserCreated
from app.services import goals as goals_service
from app.services import profiles as profiles_service
from app.services import users as users_service

router = APIRouter(prefix="/users", tags=["users"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.post("", response_model=UserCreated, status_code=201)
def create_user(session: SessionDep) -> UserCreated:
    """Create an anonymous user. Keep the returned token: it is shown only once."""
    user, token = users_service.create_anonymous_user(session)
    return UserCreated(user_id=user.id, token=token)


@router.get("/me/profile", response_model=ProfileOut)
def get_profile(user: CurrentUser) -> ProfileOut:
    """The saved profile. A 404 means onboarding isn't finished yet."""
    profile = profiles_service.get_profile(user)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not set")
    return profile


@router.put("/me/profile", response_model=ProfileSaved)
def save_profile(
    data: ProfileIn,
    user: CurrentUser,
    session: SessionDep,
    now: Annotated[datetime, Depends(utc_now)],
) -> ProfileSaved:
    """Save the survey answers and calculate a new goal from them."""
    goal = profiles_service.save_profile(session, user, data, now)
    profile = profiles_service.get_profile(user)
    assert profile is not None  # save_profile always sets it
    return ProfileSaved(profile=profile, goal=goals_service.goal_out(goal, user))
