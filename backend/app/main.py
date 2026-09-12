"""FastAPI entrypoint for TransitReach Epic 7 reliability services."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "AI transit reliability API for TransitReach KL (Epic 7). "
            "Predictions are estimates of operational reliability, not guaranteed arrival times."
        ),
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(health_router)
    # Reliability routes are added in later Epic 7 commits.
    return application


app = create_app()
