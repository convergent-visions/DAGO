from copy import copy, deepcopy
from enum import Enum
from typing import Callable, Dict, Iterable, List, Tuple, Union

import numpy as np
from graph import Graph, Vertex
from preprocess_graph import build_cum_d_edges_per_level, find_d_edges_per_level


class DynamicThreshold(Enum):
    DYNAMIC = 1


class EdgeConsideringPolicy(Enum):
    ONLY_N = 1
    ONLY_N_REVERSED = 2
    BOTH = 3


def build_Vs_per_level_collection(G: Graph) -> List[List[int]]:
    max_level = -1
    for v in G.V:
        max_level = max(max_level, v.level + 1)

    Vs_per_level = [[] for _ in range(max_level)]
    for v in G.V:
        Vs_per_level[v.level].append(v.index)

    return Vs_per_level


def determine_the_starting_level(
    cum_d_edges_per_level: List[List[int]],
    threshold: Union[int, DynamicThreshold],
    dynamic_threshold_calculator: Union[None, Callable[[int], int]] = None,
) -> int:
    for i in range(len(cum_d_edges_per_level)):
        cum_d_edges = cum_d_edges_per_level[i]
        if isinstance(threshold, int) and len(cum_d_edges) >= threshold:
            return i
        elif isinstance(threshold, DynamicThreshold):
            calculated_threshold = dynamic_threshold_calculator(i)
            if len(cum_d_edges) >= calculated_threshold:
                return i
        else:
            raise Exception("Invalid type passed as threshold argument")

    return len(cum_d_edges_per_level)


def extract_subgraph_cut_off_at_level(
    G: Graph, Vs_per_level: List[List[int]], level: int
) -> Graph:
    extracted_G = deepcopy(G)
    for i in range(0, min(len(Vs_per_level), level)):
        Vs_at_i = Vs_per_level[i]
        for u in Vs_at_i:
            # print(u)
            extracted_G.deactivated_V.add(u)
            for v in extracted_G.N(u):
                extracted_G.N_reversed(v).remove(u)

            for v in extracted_G.N_reversed(u):
                extracted_G.N(v).remove(v)

            extracted_G.N(u).clear()

    extracted_G.find_roots()
    for v in extracted_G.V:
        v.level -= level
    return extracted_G


def make_received_offers_summary(received_offers: List[int]) -> Dict[int, int]:
    received_offers_summary_dict: Dict[int, int] = {}
    for u in received_offers:
        if u not in received_offers_summary_dict:
            received_offers_summary_dict[u] = 0
        received_offers_summary_dict[u] += 1

    received_offers_summary = [
        (index, count) for index, count in received_offers_summary_dict.items()
    ]
    received_offers_summary.sort(key=lambda x: -x[1])
    return received_offers_summary_dict, received_offers_summary_dict


def calculate_score(G: Graph, V_subset: None) -> int:
    inter_color_edges = 0
    if V_subset is None:
        V_subset = [v.index for v in G.V if v not in G.deactivated_V]

    for u in V_subset:
        for v in G.N(u):
            if v in G.deactivated_V or not hasattr(G.V[v], "L_set_index"):
                continue
            if G.V[u].L_set_index != G.V[v].L_set_index:
                inter_color_edges += 1
        for v in G.N_reversed(u):
            if v in G.deactivated_V or not hasattr(G.V[v], "L_set_index"):
                continue
            if G.V[u].L_set_index != G.V[v].L_set_index:
                inter_color_edges += 1

    return inter_color_edges


def apply_best_coloring(
    G: Graph,
    C: Iterable[int],
    V_subset: None,
    edge_considering_policy: EdgeConsideringPolicy = EdgeConsideringPolicy.BOTH,
    additional_ignore_Vs: Iterable[int] = [],
):
    for u in V_subset:
        C_map = {c: 0 for c in C}
        if G.V[u].L_set_index not in C_map:
            C_map[G.V[u].L_set_index] = 0

        if edge_considering_policy != EdgeConsideringPolicy.ONLY_N:
            for v in G.N_reversed(u):
                if (
                    v not in additional_ignore_Vs
                    and hasattr(G.V[v], "L_set_index")
                    and G.V[v].L_set_index in C_map
                ):
                    C_map[G.V[v].L_set_index] += 1

        if edge_considering_policy != EdgeConsideringPolicy.ONLY_N_REVERSED:
            for v in G.N(u):
                if (
                    v not in additional_ignore_Vs
                    and hasattr(G.V[v], "L_set_index")
                    and G.V[v].L_set_index in C_map
                ):
                    C_map[G.V[v].L_set_index] += 1

        chosen_c = None
        for color, val in C_map.items():
            if chosen_c is None:
                chosen_c = color
            elif C_map[chosen_c] < val:
                chosen_c = color

        G.V[u].L_set_index = chosen_c


def apply_coloring_based_on_map(G: Graph, C_map: Dict[int, int]):
    for v, c in C_map.items():
        G.V[v].L_set_index = c


def greedily_divide_into_L_sets(
    G: Graph,
    Vs_per_level: List[List[int]],
    determine_if_should_merge: Union[int, Callable[[int, int], bool]]
    # determine_if_contentious_policy: Union[Callable[[List[int]], bool], None] = None
) -> List[List[int]]:
    roots = G.roots
    for i in range(len(roots)):
        setattr(G.V[roots[i]], "L_set_index", i)

    for k in range(0, len(Vs_per_level)):
        V_Nu = set()
        for u in Vs_per_level[k]:
            setattr(G.V[u], "received_offers", [])
            setattr(G.V[u], "last_set_received_offers", k)
            # print(u, G.N(u))
            for v in G.N(u):
                if (
                    not hasattr(G.V[v], "received_offers")
                    or G.V[v].last_set_received_offers < k
                ):
                    setattr(G.V[v], "received_offers", [])
                    setattr(G.V[v], "last_set_received_offers", k)
                # print(u, v)
                G.V[v].received_offers.append(u)
                V_Nu.add(v)

        # print(k, V_Nu)
        for u in V_Nu:
            # print(u, G.V[u].received_offers)
            # print(u, hasattr(G.V[u], "L_set_index"))
            if hasattr(G.V[u], "L_set_index"):
                # print("A", u)
                # if u == 39: print("!")
                for w in G.N_reversed(u):
                    # if u == 39: print(u, w, k, G.V[w].level)
                    if G.V[w].level < k:
                        if (
                            not hasattr(G.V[w], "received_offers")
                            or G.V[w].last_set_received_offers < k
                        ):
                            setattr(G.V[w], "received_offers", [])
                            setattr(G.V[w], "last_set_received_offers", k)
                        # print(w, u)
                        G.V[u].received_offers.append(w)

            chosen_color = None
            offer_summary_map = {}
            for offer in G.V[u].received_offers:
                c = G.V[offer].L_set_index
                if c not in offer_summary_map:
                    offer_summary_map[c] = 0
                offer_summary_map[c] += 1

            for c, val in offer_summary_map.items():
                if chosen_color is None:
                    chosen_color = c
                elif val > offer_summary_map[chosen_color]:
                    chosen_color = c

            setattr(G.V[u], "L_set_index", chosen_color)
            # print("Initially:", u, G.V[u].L_set_index, G.V[u].received_offers, G.N_reversed(u), offer_summary_map)

        V_kr = set()
        for u in V_Nu:
            # print(u, G.V[u].received_offers)
            for w in G.N_reversed(u):
                if G.V[w].level <= k:
                    V_kr.add(w)
                    for offer in G.V[u].received_offers:
                        if w == offer:
                            continue
                        G.V[w].received_offers.append(offer)

        # for u in V_Nu:
        #     print(u, G.V[u].received_offers)

        for u in V_kr:
            (
                received_offers_summary_dict,
                received_offers_summary,
            ) = make_received_offers_summary(G.V[u].received_offers)
            setattr(G.V[u], "received_offers_summary", received_offers_summary)
            setattr(
                G.V[u], "received_offers_summary_dict", received_offers_summary_dict
            )
            setattr(G.V[u], "merge_set", None)

        # print(Vs_per_level)
        # print(f"k = {k}, V_Nu = {V_Nu}")
        # print(f"k = {k}, V_kr = {V_kr}")
        for u in V_kr:
            for v, count in G.V[u].received_offers_summary.items():
                if not determine_if_should_merge(k, count):
                    break
                # print(u, v, G.V[u].merge_set)
                if G.V[u].merge_set is None and G.V[v].merge_set is None:
                    G.V[u].merge_set = set([u, v])
                    G.V[v].merge_set = G.V[u].merge_set
                elif G.V[v].merge_set is None:
                    G.V[u].merge_set.add(v)
                    G.V[v].merge_set = G.V[u].merge_set
                elif G.V[u].merge_set is None:
                    G.V[v].merge_set.add(u)
                    G.V[u].merge_set = G.V[v].merge_set
                else:
                    G.V[u].merge_set.add(v)
                    for w in G.V[v].merge_set:
                        G.V[u].merge_set.add(w)
                        G.V[w].merge_set = G.V[u].merge_set

        for u in V_kr:
            if G.V[u].merge_set is None or len(G.V[u].merge_set) <= 1:
                continue

            mu = copy(G.V[u].merge_set)
            # print(mu)
            G.V[u].merge_set.clear()
            C = set([G.V[v].L_set_index for v in mu])
            if len(C) == 1:
                continue

            # V_mu_candidates = set()
            V_mu = set()
            for v in mu:
                # for w in G.N(w):
                for w in G.N(v):
                    if w not in V_Nu:
                        continue
                    V_mu.add(w)
                    # if w in V_mu:
                    #     continue
                    # elif w in V_mu_candidates:
                    #     V_mu.add(w)
                    # else:
                    #     V_mu_candidates.add(w)

            mu_and_V_mu_combined = copy(mu)
            mu_and_V_mu_combined.update(V_mu)
            base_score = calculate_score(G, mu_and_V_mu_combined)
            base_coloring = {u: G.V[u].L_set_index for u in mu_and_V_mu_combined}

            best_score = base_score
            best_color = None

            for c in C:
                for u in mu:
                    G.V[u].L_set_index = c
                # apply_best_coloring(G, [c], mu, EdgeConsideringPolicy.ONLY_N_REVERSED, mu)
                apply_best_coloring(G, [c], V_mu, EdgeConsideringPolicy.BOTH, V_mu)
                # apply_best_coloring(G, [c], mu, EdgeConsideringPolicy.BOTH, mu)
                score = calculate_score(G, mu_and_V_mu_combined)
                if score < best_score:
                    best_score = score
                    best_color = c
                apply_coloring_based_on_map(G, base_coloring)

            # print(best_color, C)
            if best_color is not None:
                for u in mu:
                    G.V[u].L_set_index = c
                # apply_best_coloring(G, [c], mu, EdgeConsideringPolicy.ONLY_N_REVERSED, mu)
                apply_best_coloring(G, [c], V_mu, EdgeConsideringPolicy.BOTH, V_mu)
                # apply_best_coloring(G, [c], mu, EdgeConsideringPolicy.BOTH, mu)

    L_sets = [[] for i in range(len(roots))]
    for u in range(len(G.V)):
        if u not in G.deactivated_V:
            L_sets[G.V[u].L_set_index].append(u)

    return L_sets


# assumes the graph is pre-processed
def create_initial_L_sets(G: Graph) -> List[List[int]]:
    cum_d_edges_per_level = build_cum_d_edges_per_level(find_d_edges_per_level(G))
    Vs_per_level = build_Vs_per_level_collection(G)
    # print(Vs_per_level)
    cum_V_counts_per_level = [0 for _ in range(len(Vs_per_level))]
    # print(cum_V_counts_per_level)
    for i in range(len(Vs_per_level)):
        cum_V_counts_per_level[i] = len(Vs_per_level[i]) + cum_V_counts_per_level[i - 1]
    # print(cum_V_counts_per_level)

    # starting_level = determine_the_starting_level(
    #     cum_d_edges_per_level,
    #     threshold=DynamicThreshold.DYNAMIC,
    #     dynamic_threshold_calculator=lambda level, cum_V_counts_=cum_V_counts_per_level: int(0.15 * cum_V_counts_[level])
    # )

    starting_level = 2

    # print(cum_V_counts_per_level, starting_level)
    G_l = extract_subgraph_cut_off_at_level(G, Vs_per_level, starting_level)
    # print(starting_level)
    # return G_l
    L_sets = greedily_divide_into_L_sets(
        G_l, Vs_per_level[starting_level:], lambda k, count: count >= 3
    )
    return L_sets
