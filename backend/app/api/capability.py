"""Capability lookup endpoints for Epic 7 (AC 7.1.4)."""

from fastapi import APIRouter, HTTPException, Query

from app.schemas.domain import Capability, TransitMode
from app.services.capability_service import (
    CapabilityNotFoundError,
    get_capability_service,
)

router = APIRouter(prefix="/api/reliability", tags=["reliability-capability"])


@router.get("/capabilities", response_model=list[Capability])
def list_capabilities(
    mode: TransitMode | None = Query(default=None),
) -> list[Capability]:
    return get_capability_service().list_line_capabilities(mode=mode)


@router.get("/capabilities/{mode}/{line_id}", response_model=Capability)
def get_line_capability(
    mode: TransitMode,
    line_id: str,
    stop_id: str | None = Query(default=None),
) -> Capability:
    try:
        return get_capability_service().get_capability(
            mode, line_id, stop_id=stop_id
        )
    except CapabilityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
