"""Data-driven incident types, severities and the predefined scenario library."""
STEP_MINUTES = 5
MIN_DURATION, MAX_DURATION = 15, 240
SEVERITY_LOSS = {"moderate": 40.0, "high": 85.0, "critical": 100.0}  # capacity points lost at the target
SEVERITIES = list(SEVERITY_LOSS)

INCIDENT_TYPES = {
 "main_power_failure": dict(label="Main Power Failure", default_target="main_power",
     allowed_targets=["main_power", "power_dist"], recovery_points_per_step=25,
     description="Loss of utility electrical supply. Targeting Power Distribution models a switchgear fault the generator cannot bypass."),
 "backup_generator_failure": dict(label="Backup Generator Failure", default_target="backup_gen",
     allowed_targets=["backup_gen"], recovery_points_per_step=20,
     description="Standby generator unavailable or degraded."),
 "oxygen_supply_disruption": dict(label="Oxygen Supply Disruption", default_target="oxygen_plant",
     allowed_targets=["oxygen_plant"], recovery_points_per_step=20, description="Medical oxygen plant output reduced."),
 "network_outage": dict(label="Hospital Network Outage", default_target="it_network",
     allowed_targets=["it_network"], recovery_points_per_step=30, description="Clinical IT network degraded."),
 "staff_shortage": dict(label="Critical Staff Shortage", default_target="staffing",
     allowed_targets=["staffing"], recovery_points_per_step=15, description="Reduced staff availability."),
}

SCENARIOS = [
 dict(id="main_power_failure", name="Main Power Failure", short="Grid outage scenario", default_severity="high", default_duration=60,
      description="Utility power is lost. The generator starts after a short transfer delay but covers only part of the load.",
      disruptions=[dict(type="main_power_failure", severity=None)]),
 dict(id="oxygen_supply_disruption", name="Oxygen Supply Disruption", short="Oxygen shortage", default_severity="high", default_duration=60,
      description="The on-site oxygen plant loses output, affecting ventilated and surgical areas.",
      disruptions=[dict(type="oxygen_supply_disruption", severity=None)]),
 dict(id="network_outage", name="Hospital Network Outage", short="IT systems failure", default_severity="high", default_duration=60,
      description="The hospital IT network degrades, hitting records, imaging and laboratory workflows.",
      disruptions=[dict(type="network_outage", severity=None)]),
 dict(id="staff_shortage", name="Critical Staff Shortage", short="Critical staff shortage", default_severity="moderate", default_duration=60,
      description="Staff availability drops, reducing safe operating capacity of departments.",
      disruptions=[dict(type="staff_shortage", severity=None)]),
 dict(id="blackout_compound", name="Blackout with Generator Failure", short="Compound power scenario", default_severity="high", default_duration=60,
      description="Main power fails while the backup generator is also unavailable.",
      disruptions=[dict(type="main_power_failure", severity=None), dict(type="backup_generator_failure", severity="critical")]),
 dict(id="power_oxygen_compound", name="Power Failure with Oxygen Disruption", short="Compound power + oxygen", default_severity="high", default_duration=60,
      description="Main power fails and, 10 minutes later, oxygen plant output also drops.",
      disruptions=[dict(type="main_power_failure", severity=None), dict(type="oxygen_supply_disruption", severity=None, start_minute=10)]),
]

def get_scenario(scenario_id):
    return next((s for s in SCENARIOS if s["id"] == scenario_id), None)

def scenario_to_config(scenario, severity=None, duration=None):
    sev = severity or scenario["default_severity"]
    disruptions = []
    for d in scenario["disruptions"]:
        disruptions.append({"type": d["type"], "severity": d["severity"] or sev, "start_minute": d.get("start_minute", 0)})
    return {"name": scenario["name"], "scenario_id": scenario["id"], "duration_minutes": duration or scenario["default_duration"],
            "disruptions": disruptions, "interventions": []}
