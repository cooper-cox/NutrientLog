"""Builds the API: error format first, then the routes."""

from fastapi import FastAPI

from app.errors import register_error_handlers
from app.routes import health_router, v1

app = FastAPI(title="NutrientLog API", version="0.1.0")

register_error_handlers(app)
app.include_router(health_router)
app.include_router(v1)
