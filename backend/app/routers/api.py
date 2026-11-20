from fastapi import APIRouter, Depends, Query
from ..engine.hospital_graph import model_dict
from ..schemas.api import SimulationRequest, PlanRequest, CompareRequest, SettingsIn
from ..services.simulation_service import PulseGridService

router = APIRouter(prefix="/api")
_service = None

def get_service() -> PulseGridService:
    global _service
    if _service is None:
        _service = PulseGridService()
    return _service

def set_service(s):  # used by tests
    global _service
    _service = s

@router.get("/health")
def health():
    return {"status": "ok", "app": "PulseGrid", "environment": "demo", "synthetic_data": True}

@router.get("/hospital/model")
def hospital_model():
    return model_dict()
@router.get("/hospital/nodes")
def hospital_nodes():
    return model_dict()["nodes"]
@router.get("/hospital/edges")
def hospital_edges():
    return model_dict()["edges"]

@router.get("/dashboard/summary")
def dashboard(s: PulseGridService = Depends(get_service)):
    return s.dashboard()

@router.get("/scenarios")
def scenarios(s: PulseGridService = Depends(get_service)):
    return s.scenarios()
@router.get("/scenarios/{scenario_id}")
def scenario(scenario_id: str, s: PulseGridService = Depends(get_service)):
    return s.scenario(scenario_id)
@router.get("/incident-types")
def incident_types(s: PulseGridService = Depends(get_service)):
    return s.incident_types()
@router.get("/interventions")
def interventions(s: PulseGridService = Depends(get_service)):
    return s.interventions()

@router.post("/simulations", status_code=201)
def create_simulation(req: SimulationRequest, s: PulseGridService = Depends(get_service)):
    raw = req.model_dump(exclude_none=True, exclude={"parent_id", "branch_label"})
    return s.run(raw, parent_id=req.parent_id, branch_label=req.branch_label)
@router.post("/simulations/validate")
def validate_simulation(req: SimulationRequest, s: PulseGridService = Depends(get_service)):
    return {"valid": True, "config": s.validate(req.model_dump(exclude_none=True, exclude={"parent_id", "branch_label"}))}
@router.get("/simulations")
def list_simulations(q: str | None = None, severity: str | None = None, sort: str = "created_at",
                     order: str = Query("desc", pattern="^(asc|desc)$"), s: PulseGridService = Depends(get_service)):
    return s.list(q, severity, sort, order)
@router.delete("/simulations", status_code=204)
def clear_history(confirm: bool = False, s: PulseGridService = Depends(get_service)):
    if confirm:
        s.clear_history()
    else:
        from ..engine.scenario_builder import ScenarioValidationError
        raise ScenarioValidationError([{"field": "confirm", "message": "pass confirm=true to clear history"}])
@router.get("/simulations/{simulation_id}")
def get_simulation(simulation_id: str, s: PulseGridService = Depends(get_service)):
    return s.get(simulation_id)

@router.post("/response-plans", status_code=201)
def create_plan(req: PlanRequest, s: PulseGridService = Depends(get_service)):
    return s.create_plan(req.simulation_id)
@router.get("/response-plans/{plan_id}")
def get_plan(plan_id: str, s: PulseGridService = Depends(get_service)):
    return s.get_plan(plan_id)

@router.post("/comparisons")
def comparisons(req: CompareRequest, s: PulseGridService = Depends(get_service)):
    return s.compare(req.simulation_ids)

@router.get("/settings")
def get_settings(s: PulseGridService = Depends(get_service)):
    return s.settings.get()
@router.put("/settings")
def put_settings(req: SettingsIn, s: PulseGridService = Depends(get_service)):
    return s.settings.update(req.model_dump(exclude_none=True))

@router.post("/demo/reset")
def demo_reset(s: PulseGridService = Depends(get_service)):
    s.reset_demo(); return {"status": "reset"}
@router.post("/demo/clear-incident")
def clear_incident(s: PulseGridService = Depends(get_service)):
    s.clear_incident(); return {"status": "cleared"}
