from fastapi import APIRouter

from app.calc.profile_check import limits
from app.schemas.limits import LimitsOut

router = APIRouter(prefix="/limits", tags=["limits"])


@router.get("", response_model=LimitsOut)
def get_limits() -> LimitsOut:
    """The limits the survey answers are checked against, so the app can check as people type.

    The server still checks everything again when the survey is saved. These numbers are the same
    ones it uses, so the app never has its own copy of them.
    """
    return LimitsOut.model_validate(limits())
