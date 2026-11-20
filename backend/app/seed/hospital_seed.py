"""Synthetic hospital dataset. All values are invented for demonstration only.

Capacity values are percentages of nominal service. `demand` is a synthetic
service-load figure (arbitrary units). `buffer_minutes` models local reserves
(UPS batteries, oxygen cylinders, thermal inertia) that bridge a short supply loss.
"""
# id, name, category, criticality(1-5), min_operating, at_risk, buffer_min, demand, (x, y), description
_NODES = [
 ("main_power", "Main Power Grid", "infrastructure", 5, 50, 80, 0, 100, (0, 60), "Utility electrical supply feeding the hospital."),
 ("backup_gen", "Backup Generator", "infrastructure", 4, 50, 80, 0, 100, (0, 300), "Standby diesel generator. Sized to carry roughly half of total electrical load."),
 ("power_dist", "Power Distribution", "infrastructure", 5, 60, 85, 5, 100, (320, 180), "Switchgear and transfer systems distributing power (5 min UPS/transfer ride-through)."),
 ("oxygen_plant", "Oxygen Plant", "infrastructure", 5, 60, 85, 0, 100, (650, -40), "On-site medical oxygen generation and manifold."),
 ("it_network", "Hospital IT Network", "infrastructure", 3, 50, 80, 15, 100, (650, 120), "Clinical and administrative network (15 min UPS)."),
 ("hvac", "HVAC System", "infrastructure", 3, 50, 80, 10, 100, (650, 280), "Heating, ventilation and cooling (10 min thermal inertia)."),
 ("water", "Water Supply", "infrastructure", 3, 50, 80, 0, 100, (650, 440), "Potable water and pumping."),
 ("staffing", "Clinical Staffing", "infrastructure", 4, 50, 80, 0, 100, (650, 600), "Available clinical and technical staff."),
 ("icu", "Intensive Care Unit", "department", 5, 70, 90, 10, 24, (1000, -40), "Critical care beds and life-support equipment (10 min local reserve)."),
 ("ed", "Emergency Department", "department", 5, 65, 85, 5, 40, (1000, 100), "Emergency intake and resuscitation."),
 ("ot", "Operation Theatre", "department", 4, 70, 90, 10, 8, (1000, 240), "Surgical suites."),
 ("imaging", "Diagnostic Imaging", "department", 3, 50, 80, 0, 30, (1000, 380), "CT, MRI and X-ray."),
 ("lab", "Laboratory", "department", 3, 50, 80, 0, 60, (1000, 520), "Clinical laboratory."),
 ("ward", "General Ward", "department", 2, 50, 75, 0, 120, (1000, 660), "Inpatient general wards."),
]
NODES = [dict(id=i, name=n, category=c, criticality=cr, minimum_operating_capacity=mo, at_risk_threshold=ar,
              buffer_minutes=b, demand=d, capacity=100.0, current_status="healthy", layout=xy, description=desc)
         for (i, n, c, cr, mo, ar, b, d, xy, desc) in _NODES]
NODES[1].update(standby_for="main_power", activation_delay_minutes=5)

# source, target, dependency_type, strength(0-1], description, extra
_E = [
 ("main_power", "backup_gen", "standby_trigger", 0.0, "Generator starts when utility supply degrades.", {}),
 ("main_power", "power_dist", "power", 1.0, "Utility feed.", dict(share=100, group="power_supply")),
 ("backup_gen", "power_dist", "power", 1.0, "Generator feed (covers ~50% of load).", dict(share=50, group="power_supply")),
 ("power_dist", "oxygen_plant", "power", 0.8, "Compressors need electricity.", {}),
 ("power_dist", "it_network", "power", 0.6, "Network equipment power.", {}),
 ("power_dist", "hvac", "power", 0.7, "Air handling and chillers.", {}),
 ("power_dist", "water", "power", 0.5, "Pumps.", {}),
 ("water", "hvac", "water", 0.4, "Chiller cooling water.", {}),
 ("hvac", "it_network", "climate", 0.3, "Server-room cooling.", {}),
 ("it_network", "hvac", "network", 0.2, "Building-management control network.", {}),
 ("power_dist", "icu", "power", 1.0, "Life-support equipment power.", {}),
 ("power_dist", "ed", "power", 1.0, "Department power.", {}),
 ("power_dist", "ot", "power", 1.0, "Theatre power.", {}),
 ("power_dist", "imaging", "power", 1.0, "Scanner power.", {}),
 ("power_dist", "lab", "power", 0.9, "Analyser power.", {}),
 ("power_dist", "ward", "power", 0.8, "Ward power.", {}),
 ("oxygen_plant", "icu", "oxygen", 0.9, "Ventilation oxygen.", {}),
 ("oxygen_plant", "ed", "oxygen", 0.6, "Resuscitation oxygen.", {}),
 ("oxygen_plant", "ot", "oxygen", 0.8, "Anaesthesia gases.", {}),
 ("oxygen_plant", "ward", "oxygen", 0.5, "Ward oxygen outlets.", {}),
 ("it_network", "icu", "network", 0.3, "Monitoring and records.", {}),
 ("it_network", "ed", "network", 0.6, "Triage and records.", {}),
 ("it_network", "ot", "network", 0.3, "Scheduling and records.", {}),
 ("it_network", "imaging", "network", 0.7, "PACS and scheduling.", {}),
 ("it_network", "lab", "network", 0.7, "LIS and results.", {}),
 ("it_network", "ward", "network", 0.3, "Records.", {}),
 ("hvac", "icu", "climate", 0.4, "Air quality and temperature.", {}),
 ("hvac", "ot", "climate", 0.6, "Theatre air handling.", {}),
 ("hvac", "lab", "climate", 0.4, "Environmental control.", {}),
 ("hvac", "imaging", "climate", 0.4, "Scanner cooling.", {}),
 ("water", "icu", "water", 0.2, "Water services.", {}),
 ("water", "ed", "water", 0.3, "Water services.", {}),
 ("water", "ot", "water", 0.4, "Sterilisation.", {}),
 ("water", "lab", "water", 0.5, "Reagent water.", {}),
 ("water", "ward", "water", 0.3, "Sanitation.", {}),
 ("staffing", "icu", "staffing", 0.6, "Nursing ratios.", {}),
 ("staffing", "ed", "staffing", 0.6, "Clinical cover.", {}),
 ("staffing", "ot", "staffing", 0.7, "Surgical teams.", {}),
 ("staffing", "imaging", "staffing", 0.4, "Radiographers.", {}),
 ("staffing", "ward", "staffing", 0.5, "Nursing cover.", {}),
 ("staffing", "lab", "staffing", 0.3, "Technologists.", {}),
 ("imaging", "ed", "service", 0.2, "Diagnostic turnaround.", {}),
 ("lab", "ed", "service", 0.2, "Results turnaround.", {}),
 ("lab", "icu", "service", 0.2, "Results turnaround.", {}),
 ("imaging", "icu", "service", 0.1, "Bedside imaging support.", {}),
]
EDGES = [dict(source=s, target=t, dependency_type=ty, dependency_strength=st, description=d, **x) for (s, t, ty, st, d, x) in _E]

RESOURCES = {
 "portable_generator_units": dict(label="Portable generators", available=2, unit="units"),
 "oxygen_cylinder_sets": dict(label="Oxygen cylinder sets", available=6, unit="sets"),
 "surge_staff": dict(label="Surge staff", available=8, unit="people"),
 "it_failover_links": dict(label="IT failover links", available=1, unit="links"),
 "alt_supply_requests": dict(label="Alternative-supply escalations", available=1, unit="requests"),
 "generator_fuel_hours": dict(label="Generator fuel endurance", available=72, unit="hours"),
}
CONSUMABLE_POOLS = ["portable_generator_units", "oxygen_cylinder_sets", "surge_staff", "it_failover_links", "alt_supply_requests"]
