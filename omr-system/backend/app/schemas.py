from pydantic import BaseModel, Field


class OMRResponse(BaseModel):
    answers: dict[str, str] = Field(default_factory=dict)
    invalid_questions: list[int] = Field(default_factory=list)
    confidence_score: float = 0.0
    warnings: list[str] = Field(default_factory=list)
    processing_time_ms: int = 0
    debug_overlay_base64: str | None = None
