from fastapi import FastAPI

from app.api import health

app = FastAPI(title="NutrientLog API", version="0.1.0")

app.include_router(health.router)

# Product endpoints will be mounted under /api/v1 as they are built:
#   app.include_router(v1_router, prefix="/api/v1")
