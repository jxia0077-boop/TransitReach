"""Static transit catalog HTTP endpoints (AC 7.1.1 selection data)."""

from fastapi import APIRouter, Query

from app.schemas.catalog import CatalogLine, CatalogStop, StaticTransitCatalog
from app.schemas.domain import TransitMode
from app.services.static_catalog_service import get_static_catalog_service

router = APIRouter(prefix="/api/reliability", tags=["reliability-catalog"])


@router.get("/catalog", response_model=StaticTransitCatalog)
def get_catalog() -> StaticTransitCatalog:
    return get_static_catalog_service().load_catalog()


@router.get("/catalog/modes", response_model=list[TransitMode])
def get_selectable_modes() -> list[TransitMode]:
    return get_static_catalog_service().selectable_modes()


@router.get("/catalog/lines", response_model=list[CatalogLine])
def get_lines(
    mode: TransitMode | None = Query(default=None),
) -> list[CatalogLine]:
    return get_static_catalog_service().lines(mode=mode)


@router.get("/catalog/stops", response_model=list[CatalogStop])
def get_stops(
    line_id: str | None = Query(default=None),
) -> list[CatalogStop]:
    return get_static_catalog_service().stops(line_id=line_id)
