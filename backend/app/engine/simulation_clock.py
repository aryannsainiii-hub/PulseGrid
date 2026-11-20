from .scenario_definitions import STEP_MINUTES

class SimulationClock:
    """Discrete clock. Every propagation delay is a whole number of steps (>=1), so
    state at step k depends only on steps < k. This makes cycles safe by construction."""
    def __init__(self, duration_minutes, step=STEP_MINUTES):
        if duration_minutes % step:
            raise ValueError("duration must be a multiple of the step")
        self.step, self.duration = step, duration_minutes
        self.minutes = list(range(0, duration_minutes + 1, step))

    def steps_for(self, minutes):
        return max(1, -(-int(minutes) // self.step))
