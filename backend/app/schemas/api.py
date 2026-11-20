from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

class DisruptionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str
    severity: str = "high"
    target: Optional[str] = None
    start_minute: int = 0
    resolution_minutes: Optional[int] = None

class InterventionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str
    at_minute: int = 0
    params: Dict[str, Any] = Field(default_factory=dict)

class RecoveryIn(BaseModel):
    points_per_step: Optional[int] = None

class SimulationRequest(BaseModel):
    """Semantic validation (ranges, targets, resource limits) lives in the engine; this checks shape."""
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    scenario_id: Optional[str] = None
    duration_minutes: Optional[int] = None
    disruptions: List[DisruptionIn]
    resources: Dict[str, float] = Field(default_factory=dict)
    interventions: List[InterventionIn] = Field(default_factory=list)
    recovery: RecoveryIn = Field(default_factory=RecoveryIn)
    parent_id: Optional[str] = None
    branch_label: Optional[str] = Field(default=None, max_length=80)

class PlanRequest(BaseModel):
    simulation_id: str

class CompareRequest(BaseModel):
    simulation_ids: List[str] = Field(min_length=2, max_length=6)

class SettingsIn(BaseModel):
    default_duration_minutes: Optional[int] = None
    max_recovery_minutes: Optional[int] = None
    response_start_minute: Optional[int] = None
    weights: Optional[Dict[str, float]] = None
    display: Optional[Dict[str, Any]] = None
