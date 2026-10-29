import math
from dataclasses import replace

from .params import LayoutTuningParams

LAYOUT_OVERRIDE_FIELDS = {
    "box_width_coeff",
    "min_required_distance_between_adjacent_levels",
    "nested_colour_child_padding",
}


def validate_layout_overrides(value: object) -> dict[str, float]:
    if not isinstance(value, dict):
        raise ValueError("layout_overrides must be an object")
    if value.keys() - LAYOUT_OVERRIDE_FIELDS:
        raise ValueError("Unsupported layout setting")
    result = {}
    for name, multiplier in value.items():
        if (
            isinstance(multiplier, bool)
            or not isinstance(multiplier, (int, float))
            or not 0.5 <= multiplier <= 2.0
            or not math.isfinite(multiplier)
        ):
            raise ValueError(f"{name} must be a finite number between 0.5 and 2.0")
        result[name] = float(multiplier)
    return result


def apply_layout_overrides(
    params: LayoutTuningParams, overrides: dict[str, float]
) -> LayoutTuningParams:
    overrides = validate_layout_overrides(overrides)
    return replace(
        params,
        layout_drawer=replace(
            params.layout_drawer,
            **{
                name: getattr(params.layout_drawer, name) * multiplier
                for name, multiplier in overrides.items()
            },
        ),
    )
