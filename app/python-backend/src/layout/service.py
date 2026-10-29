import logging

import graph_tool as gt
import grpc
from generate_graph_structure import make_graph_structure

from .layout_computation_backend_comms import (
    send_layout_computation_request_to_grpc_server,
)
from .layout_params_builder import build_layout_params
from .overrides import apply_layout_overrides


def compute_layout(
    graph: gt.Graph,
    layout_type: str,
    host: str,
    port: int,
    logger: logging.Logger,
    *,
    category: str | None = None,
    layout_overrides: dict[str, float] | None = None,
) -> tuple[list[tuple], bool]:
    """Select the layout algorithm, resolve its parameters and handle fallback."""
    if layout_type == "radial":
        logger.debug("Using radial layout computation")
        return make_graph_structure(graph), False

    logger.debug("Using GRPC layout computation")

    try:
        params = build_layout_params(graph.num_vertices(), category=category)
        params = apply_layout_overrides(params, layout_overrides or {})
        positions = send_layout_computation_request_to_grpc_server(
            graph, host, port, logger, layout_params=params
        )
        return positions, False

    except grpc.RpcError as e:
        logger.warning(
            f"GRPC server failed to conclude layout computation: {e}. "
            "Falling back to radial layout."
        )
        return make_graph_structure(graph), True
