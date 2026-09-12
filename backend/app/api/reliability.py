"""GET /api/reliability/predict — fail-closed reliability estimates (AC 7.1.4)."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.schemas.domain import TransitMode
from app.schemas.reliability import ReliabilityPredictionUnsupported
from app.services.capability_service import CapabilityNotFoundError
from app.services.prediction_service import get_prediction_service

router = APIRouter(prefix="/api/reliability", tags=["reliability-predict"])


@router.get(
    "/predict",
    response_model=ReliabilityPredictionUnsupported,
    responses={
        200: {
            "description": (
                "Unsupported prediction (current fail-closed behaviour). "
                "Later commits may return a supported payload with the same path."
            )
        },
        404: {"description": "Mode/line/stop not found in the static catalog"},
        422: {"description": "Invalid query parameters"},
    },
)
def predict_reliability(
    mode: TransitMode = Query(...),
    line_id: str = Query(..., min_length=1),
    stop_id: str = Query(..., min_length=1),
    travel_datetime: datetime = Query(
        ...,
        alias="datetime",
        description="Travel datetime; interpret in Asia/Kuala_Lumpur unless offset given.",
    ),
) -> ReliabilityPredictionUnsupported:
    """Return a reliability estimate or an explicit unavailable response.

    Predictions represent expected operational reliability and are not guaranteed
    arrival times. With insufficient historical operational data the API never
    invents a delay or risk category.
    """
    try:
        return get_prediction_service().predict(
            mode=mode,
            line_id=line_id,
            stop_id=stop_id,
            travel_datetime=travel_datetime,
        )
    except CapabilityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
