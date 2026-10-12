from pydantic import BaseModel


class LimitsOut(BaseModel):
    min_age_years: int
    max_age_years: int
    min_height_cm: float
    max_height_cm: float
    min_weight_kg: float
    max_weight_kg: float
    # Height and weight that can't both be right.
    min_plausible_bmi: float
    max_plausible_bmi: float
    # Goal weights: the lowest allowed when losing weight, and the highest allowed when gaining.
    min_goal_bmi_when_losing: float
    max_goal_bmi: float
    max_gain_kg_per_week: float
    max_lose_kg_per_week: float
