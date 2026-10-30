from copy import copy, deepcopy
from typing import List, Tuple

from assign_levels import assign_levels
from graph import Graph, Vertex


def unpack_one_element_set(one_element_set: set):
    if len(one_element_set) != 1:
        raise Exception(
            f"Passed a set containing more than one element: {one_element_set}"
        )
    w = tuple(one_element_set)[0]
    return w


def remove_paths(G: Graph):
    leaves: List[int] = []
    for v in range(len(G.E_reversed_adj_list)):
        Nr_v = G.N_reversed(vertex_index=v)
        N_v = G.N(vertex_index=v)
        # print(v, Nr_v, G.N(v))
        if len(Nr_v) == 1 and len(N_v) == 0:
            leaves.append(v)

    print(leaves)
    all_vertices_to_remove = []
    for v in leaves:
        Nr_v = G.N_reversed(vertex_index=v)
        w = unpack_one_element_set(Nr_v)
        if len(G.N(vertex_index=w)) > 1:
            continue
        all_vertices_to_remove.append(v)
        while True:
            Nr_w = G.N_reversed(vertex_index=w)
            N_w = G.N(vertex_index=w)
            if len(N_w) == 1 and len(Nr_w) == 1:
                x = unpack_one_element_set(Nr_w)
                if len(G.N(vertex_index=x)) == 1:
                    all_vertices_to_remove.append(w)
                    w = unpack_one_element_set(Nr_w)
                    continue

            break

    for v in all_vertices_to_remove:
        G.deactivated_V.add(v)


def find_d_edges_per_level(G: Graph) -> List[Tuple[int, int]]:
    max_level = -1
    for v in G.V:
        if v not in G.deactivated_V:
            max_level = max(max_level, v.level + 1)

    d_edges_per_levels = [[] for _ in range(max_level + 1)]
    for v in range(len(G.V)):
        if v in G.deactivated_V:
            continue
        Nr_v = G.N_reversed(vertex_index=v)
        if len(Nr_v) > 1:
            for w_index in Nr_v:
                if w_index not in G.deactivated_V:
                    w = G.V[w_index]
                    d_edges_per_levels[w.level].append((w_index, v))

    return d_edges_per_levels


def build_cum_d_edges_per_level(
    d_edges_per_level: List[Tuple[int, int]]
) -> List[Tuple[int, int]]:
    cum_d_edges_per_level = [[] for _ in range(len(d_edges_per_level))]
    for i in range(0, len(cum_d_edges_per_level)):
        cum_d_edges_per_level[i] = cum_d_edges_per_level[i - 1] + d_edges_per_level[i]

    return cum_d_edges_per_level


# preprocess graph by computing leels and removing "simple paths"
def preprocess_graph(G: Graph) -> Graph:
    G_pp = deepcopy(G)
    assign_levels(G_pp)
    remove_paths(G_pp)
    # d_edges_per_level = find_d_edges_per_level(G_pp)
    # cum_d_edges_per_level = build_cum_d_edges_per_level(d_edges_per_level)
    # print(d_edges_per_level)
    return G_pp
