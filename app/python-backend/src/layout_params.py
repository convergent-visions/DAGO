from dataclasses import dataclass


@dataclass(frozen=True)
class GraphColourerParams:
    d_edges_threshold_coeff: int
    min_cum_count_of_vertices: int
    merge_common_vertices_threshold: int
    min_number_of_vertices_at_starting_level: int


@dataclass(frozen=True)
class LayoutDrawerParams:
    x_interspring_weight: float
    x_interspring_power: float
    interspring_upwards_transfer_coeff: float

    box_width_coeff: float
    noise_interval_width_percentage: float

    nested_colour_child_padding: float
    min_required_distance_between_adjacent_levels: float


@dataclass(frozen=True)
class LayoutTuningParams:
    graph_colourer: GraphColourerParams
    layout_drawer: LayoutDrawerParams
