import uuid

from pydantic import BaseModel


class UserCreated(BaseModel):
    user_id: uuid.UUID
    # Shown only once. The app must store it and send it as "Authorization: Bearer <token>".
    token: str
