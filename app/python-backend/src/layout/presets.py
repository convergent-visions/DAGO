from dataclasses import replace

from .params import LayoutTuningParams

LAYOUT_PRESETS: dict[str, dict[str, float]] = {
    "biological_process": {
        "box_width_coeff": 1.15,
        "min_required_distance_between_adjacent_levels": 1.10,
        "nested_colour_child_padding": 1.10,
    },
    "molecular_function": {
        "nested_colour_child_padding": 0.90,
    },
    "cellular_component": {
        "box_width_coeff": 1.05,
        "nested_colour_child_padding": 1.25,
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
