import math

from .params import GraphColourerParams, LayoutDrawerParams, LayoutTuningParams
from .presets import apply_layout_preset


def clamp(
    value: float,
    minimum: float,
    maximum: float,
) -> float:
    return max(minimum, min(value, maximum))


def lerp(
    minimum: float,
    maximum: float,
    t: float,
) -> float:
    return minimum + (maximum - minimum) * t


def calculate_graph_size_score(
    num_vertices: int,
) -> float:
    """
    Calculate normalized graph size in range [0, 1].

    Around 100 000 vertices the score reaches 1.0.
    Logarithmic scaling prevents large graphs from dominating the metric.
    """
    return clamp(
        math.log1p(num_vertices) / math.log1p(100_000),
        0.0,
        1.0,
    )


def calculate_layout_params(  # should be developed
    size_score: float,
) -> LayoutTuningParams:
    box_width_coeff = lerp(
        2.0,
        4.0,
        size_score,
    )

    min_level_distance = lerp(
        6.0,
        14.0,
        size_score,
    )

    nested_colour_child_padding = lerp(
        0.3,
        0.5,
        size_score,
    )

    noise_interval_width_percentage = lerp(
        0.02,
        0.05,
        size_score,
    )

    return LayoutTuningParams(
        graph_colourer=GraphColourerParams(
            d_edges_threshold_coeff=3,
            min_cum_count_of_vertices=3,
            merge_common_vertices_threshold=3,
            min_number_of_vertices_at_starting_level=3,
        ),
        layout_drawer=LayoutDrawerParams(
            x_interspring_weight=3.0,
            x_interspring_power=1.0,
            interspring_upwards_transfer_coeff=0.75,
            box_width_coeff=box_width_coeff,
            noise_interval_width_percentage=(noise_interval_width_percentage),
            nested_colour_child_padding=(nested_colour_child_padding),
            min_required_distance_between_adjacent_levels=(min_level_distance),
        ),
    )


def build_layout_params(
    num_vertices: int,
    category: str | None = None,
) -> LayoutTuningParams:
    size_score = calculate_graph_size_score(num_vertices)

    params = calculate_layout_params(size_score)

    return apply_layout_preset(params, category)
