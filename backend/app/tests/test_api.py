"""API tests. Skipped automatically when FastAPI is not installed."""
import os, tempfile, unittest
try:
    from fastapi.testclient import TestClient
    HAS = True
except Exception:  # pragma: no cover
    HAS = False

@unittest.skipUnless(HAS, "fastapi not installed")
class ApiTests(unittest.TestCase):
    def setUp(self):
        from app.main import app
        from app.routers.api import set_service
        from app.database import Repository
        from app.services.simulation_service import PulseGridService
        set_service(PulseGridService(Repository(os.path.join(tempfile.mkdtemp(), "api.db"))))
        self.c = TestClient(app)
    def test_health_and_model(self):
        self.assertEqual(self.c.get("/api/health").json()["status"], "ok")
        m = self.c.get("/api/hospital/model").json(); self.assertEqual(len(m["nodes"]), 14); self.assertTrue(m["edges"])
    def test_demo_flow(self):
        body = {"disruptions": [{"type": "main_power_failure", "severity": "high"}]}
        r = self.c.post("/api/simulations", json=body); self.assertEqual(r.status_code, 201)
        sid = r.json()["id"]
        self.assertEqual(self.c.get(f"/api/simulations/{sid}").json()["summary"]["initial_failure"]["node_id"], "main_power")
        self.assertEqual(len(self.c.get("/api/simulations").json()), 1)
        p = self.c.post("/api/response-plans", json={"simulation_id": sid}); self.assertEqual(p.status_code, 201)
        self.assertEqual(self.c.get(f"/api/response-plans/{p.json()['id']}").status_code, 200)
        self.assertLess(self.c.get("/api/dashboard/summary").json()["kpis"]["operational_systems"], 14)
        self.assertEqual(self.c.delete("/api/simulations").status_code, 422)
        self.assertEqual(self.c.delete("/api/simulations?confirm=true").status_code, 204)
        self.assertEqual(self.c.get("/api/simulations").json(), [])
    def test_errors_are_consistent(self):
        r = self.c.post("/api/simulations", json={"disruptions": [{"type": "meteor"}]})
        self.assertEqual(r.status_code, 422); self.assertEqual(r.json()["error"]["code"], "validation_error")
        self.assertEqual(self.c.get("/api/simulations/nope").status_code, 404)
        self.assertEqual(self.c.post("/api/simulations", json={}).status_code, 422)
    def test_settings_and_reset(self):
        self.assertEqual(self.c.put("/api/settings", json={"default_duration_minutes": 30}).json()["default_duration_minutes"], 30)
        self.assertEqual(self.c.put("/api/settings", json={"default_duration_minutes": 7}).status_code, 422)
        self.assertEqual(self.c.post("/api/demo/reset").status_code, 200)
        self.assertEqual(self.c.get("/api/settings").json()["default_duration_minutes"], 60)
if __name__ == "__main__": unittest.main()
