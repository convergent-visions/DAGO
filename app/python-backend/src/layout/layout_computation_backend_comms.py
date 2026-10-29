import logging
import socket
from copy import copy
from random import uniform
from typing import List, Optional, Tuple

import graph_tool as gt
import grpc
import py_to_cpp_backend_pb2
import py_to_cpp_backend_pb2_grpc
from layout_params import LayoutTuningParams

LayoutPositionsT = List[Tuple[float, float]]
MAX_CHUNK_LENGTH = 900  # For now
# TODO: Should probably try switching to:
# MAX_UINT16_T_IN_CPP = np.iinfo(np.uint16).max
MAX_UINT16_T_IN_CPP = 65_530


class ThinBoolWrapper:
    def __init__(self, initial_val: bool):
        self.boolean_flag = initial_val


def generate_random_graph_id_between(low: int = 0, high: int = MAX_UINT16_T_IN_CPP):
    random_graph_id = uniform(low, high)
    return random_graph_id


def request_graph_layout_computation(
    G_gt: gt.Graph,
    server_ip_addr: str,
    server_port: int,
    logger: Optional[logging.Logger] = None,
) -> LayoutPositionsT:
    n = G_gt.num_vertices()

    middle_part_length = len(" is_final=false ")
    graph_id = generate_random_graph_id_between(low=0, high=MAX_UINT16_T_IN_CPP)

    initial_message_head = f"graph_id={graph_id}"
    initial_message_tail = f"n={n}" + " E={"

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_socket:
        server_socket.connect((server_ip_addr, server_port))
        current_message_head = copy(initial_message_head)
        current_message_tail = copy(initial_message_tail)
        for u in range(n):
            Nu = G_gt.get_out_neighbors(G_gt.vertex(u))
            if initial_message_tail != "{":
                current_message_tail += " "
            current_message_tail += f"{u}:["
            for j in range(len(Nu)):
                v = int(Nu[j])
                if (
                    len(current_message_head)
                    + len(current_message_tail)
                    + middle_part_length
                    + len(f",{v}" + "}")
                    > MAX_CHUNK_LENGTH - 1
                ):
                    message_to_be_sent = f"|{current_message_head} is_final=false {current_message_tail}}}|"
                    server_socket.sendall(message_to_be_sent)
                    current_message_head = copy(initial_message_head)
                    current_message_tail = copy(initial_message_tail)

                current_message_tail += f",{v}"
            current_message_tail += "]"

        current_message_tail += "}"
        message_to_be_sent = (
            f"|{current_message_head}| is_final=true {current_message_tail}|"
        )
        server_socket.sendall(message_to_be_sent)


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
        edges=edges, layout_params=layout_params_to_proto(layout_params)
    )
    with grpc.insecure_channel(f"{server_ip_addr}:{server_port}") as channel:
        stub = py_to_cpp_backend_pb2_grpc.GraphLayoutServiceStub(channel)
        response = stub.computeGraphLayout(edge_list)

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
