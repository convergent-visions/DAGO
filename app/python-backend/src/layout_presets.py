from dataclasses import replace

from layout_params import LayoutTuningParams

LAYOUT_PRESETS: dict[str, dict[str, float]] = {
    "biological_process": {
        "x_interspring_weight": 1.10,
        "box_width_coeff": 1.15,
        "min_required_distance_between_adjacent_levels": 1.10,
    },
    "molecular_function": {
        "x_interspring_weight": 0.90,
        "box_width_coeff": 0.90,
        "min_required_distance_between_adjacent_levels": 0.95,
    },
    "cellular_component": {
        "x_interspring_weight": 1.00,
        "box_width_coeff": 1.05,
        "min_required_distance_between_adjacent_levels": 1.00,
    },
}


def apply_layout_preset(
    params: LayoutTuningParams,
    category: str | None,
) -> LayoutTuningParams:
    if not category:
        return params

    preset = LAYOUT_PRESETS.get(category.strip().lower())
    if preset is None:
        return params

    drawer = params.layout_drawer

    overrides = {
        name: getattr(drawer, name) * multiplier for name, multiplier in preset.items()
    }

    return replace(
        params,
        layout_drawer=replace(drawer, **overrides),
    )
