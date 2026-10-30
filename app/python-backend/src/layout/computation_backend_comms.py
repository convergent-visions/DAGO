import logging
import os
from typing import List, Optional, Tuple

import graph_tool as gt
import grpc
import py_to_cpp_backend_pb2
import py_to_cpp_backend_pb2_grpc

from .params import LayoutTuningParams

LayoutPositionsT = List[Tuple[float, float]]
MAX_CHUNK_LENGTH = 900
MAX_UINT16_T_IN_CPP = 65_530


class ThinBoolWrapper:
    def __init__(self, initial_val: bool):
        self.boolean_flag = initial_val


def layout_params_to_proto(
    params: LayoutTuningParams,
) -> py_to_cpp_backend_pb2.LayoutParams:
    colourer = params.graph_colourer
    drawer = params.layout_drawer

    return py_to_cpp_backend_pb2.LayoutParams(
        graph_colourer=py_to_cpp_backend_pb2.GraphColourerParams(
            d_edges_threshold_coeff=colourer.d_edges_threshold_coeff,
            min_cum_count_of_vertices=colourer.min_cum_count_of_vertices,
            merge_common_vertices_threshold=colourer.merge_common_vertices_threshold,
            min_number_of_vertices_at_starting_level=colourer.min_number_of_vertices_at_starting_level,
        ),
        layout_drawer=py_to_cpp_backend_pb2.LayoutDrawerParams(
            x_interspring_weight=drawer.x_interspring_weight,
            x_interspring_power=drawer.x_interspring_power,
            interspring_upwards_transfer_coeff=drawer.interspring_upwards_transfer_coeff,
            box_width_coeff=drawer.box_width_coeff,
            noise_interval_width_percentage=drawer.noise_interval_width_percentage,
            nested_colour_child_padding=drawer.nested_colour_child_padding,
            min_required_distance_between_adjacent_levels=drawer.min_required_distance_between_adjacent_levels,
        ),
    )


def send_layout_computation_request_to_grpc_server(
    G_gt: gt.Graph,
    server_ip_addr: str,
    server_port: int,
    logger: Optional[logging.Logger] = None,
    *,
    layout_params: LayoutTuningParams,
) -> LayoutPositionsT:
    if logger is not None:
        logger.debug(
            f"Preparing to call layout computation rpc on grpc server at {server_ip_addr}:{server_port}"
        )

    edges = []
    for u in range(G_gt.num_vertices()):
        Nu = G_gt.get_out_neighbors(u)
        for v in Nu:
            edges.append(
                py_to_cpp_backend_pb2.Edge(srcVertexIndex=u, destVertexIndex=v)
            )

    edge_list = py_to_cpp_backend_pb2.EdgeList(
        edges=edges,
        layout_params=layout_params_to_proto(layout_params),
        num_vertices=G_gt.num_vertices(),
    )
    with grpc.insecure_channel(f"{server_ip_addr}:{server_port}") as channel:
        stub = py_to_cpp_backend_pb2_grpc.GraphLayoutServiceStub(channel)
        worker_timeout = float(os.getenv("GUNICORN_TIMEOUT", "1200"))
        timeout = min(300.0, worker_timeout / 2) if worker_timeout > 0 else 300.0
        response = stub.computeGraphLayout(edge_list, timeout=timeout)

    if logger is not None:
        logger.debug(
            f"GRPC server at {server_ip_addr}:{server_port} computed layout for requested graph"
        )

    layout_positions: LayoutPositionsT = []
    for coord in response.layoutPositions:
        layout_positions.append((coord.x, coord.y))

    if logger is not None:
        logger.info(
            f"Layout computation request on grpc server at {server_ip_addr}:{server_port} ended in success"
        )

    return layout_positions
