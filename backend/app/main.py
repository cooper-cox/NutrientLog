"""Builds the API: error format first, then the routes."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.errors import register_error_handlers
from app.routes import health_router, v1
from app.settings import settings

app = FastAPI(title="NutrientLog API", version="0.1.0")

register_error_handlers(app)
app.include_router(health_router)
app.include_router(v1)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if origins:  # only for a web build of the app; the phone app needs none
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
