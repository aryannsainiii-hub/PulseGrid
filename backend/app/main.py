import os
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .engine.scenario_builder import ScenarioValidationError
from .routers.api import router, get_service
from .services.simulation_service import NotFound

app = FastAPI(title="PulseGrid API", version="1.0.0",
              description="Synthetic-data hospital resilience simulator. Decision support only; not for clinical or operational use.")
origins = os.environ.get("PULSEGRID_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

def _err(status, code, message, details=None):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "details": details or []}})

@app.exception_handler(ScenarioValidationError)
async def _validation(_: Request, e: ScenarioValidationError):
    return _err(422, "validation_error", "Invalid configuration", e.errors)
@app.exception_handler(RequestValidationError)
async def _shape(_: Request, e: RequestValidationError):
    return _err(422, "validation_error", "Invalid request body",
                [{"field": ".".join(str(x) for x in d["loc"][1:]), "message": d["msg"]} for d in e.errors()])
@app.exception_handler(NotFound)
async def _nf(_: Request, e: NotFound):
    return _err(404, "not_found", str(e))

@app.on_event("startup")
def _init():
    get_service()  # creates tables and loads defaults

app.include_router(router)
