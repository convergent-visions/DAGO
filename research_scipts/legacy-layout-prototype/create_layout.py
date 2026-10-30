from abc import ABC, abstractmethod
from copy import copy
from typing import List, Optional, Set, Tuple

from graph import Graph, Vertex

SIGNUM_EPS = 1e-6

PADDING = 6

W_1_X_INTERSPRING = 1
W_2_X_INTERSPRING = 1
W_1_Y_INTERSPRING = 1
W_2_Y_INTERSPRING = 1
W_3_Y_INTERSPRING = 1
W_4_Y_INTERSPRING = 1

ROOTS_INITIAL_POSITIONS_MAX_ITER = 20
MAX_REQ_MOVEMENT = 1e-1

W_1_X_ACS = 1
W_2_X_ACS = 1

L_INTERSPRING_TRANSFER = 0.8

BOX_WIDTH_COEFF = 3

ALPHA_P = 0.5
BETA_P = 1.5
S_COEFF = 1.15

VERTICE_WEIGHT = 1
ADD_CHILDREN_WEIGHT_COEFF = 0.2
G_ACC = 10
K_INIT_LAYOUT_COEFF = 2
PULL_UP_COEFF = 0.2
MARGIN_PADDING_COEFF = 0.05


class ArrayWithPersistentIterator:
    def __init__(self, array: List):
        self.array = array
        self.it = 0

    @property
    def current_element(self):
        if self.it >= len(self.array):
            return None
        return self.array[self.it]


class F(ABC):
    def __init__(self, v: Vertex):
        self.v = v

    @property
    def x_p(self) -> float:
        return self.v.position[0]

    @abstractmethod
    def __call__(self, x: float, k: int) -> float:
        ...


class Fp(F):
    def __init__(self, v: Vertex, alpha_p: float, beta_p: float, g_p: float):
        super().__init__(v)
        self.alpha_p = alpha_p
        self.beta_p = beta_p
        self.g_p = g_p

    # k remains unsed but we need it to keep the interface consistent
    def __call__(self, x: float, k: int) -> float:
        x_p = self.x_p
        g_p = self.g_p
        if x - (x_p + g_p) >= 0:
            return self.alpha_p * (x - x_p - g_p)
        # elif x_p <= x <= x_p + g_p:
        # elif x - x_p >= 0 and x_p + g_p - x >= 0:
        elif x_p + g_p >= x >= x_p:
            return self.beta_p * (-x + x_p + g_p)
        else:
            return self(2 * x_p - x, k)


class Fcs(F):
    def __init__(self, v: Vertex, alpha_p: float):
        super().__init__(v)
        self.alpha_p = alpha_p

    def __call__(self, x: float, k: int) -> float:
        x_p = self.x_p
        if k != self.v.level:
            raise Exception(f"Invalid call for FCS, k == {self.v.level}")

        if x - x_p >= 0:
            return self.alpha_p * (x - x_p)
        else:
            return self(2 * x_p - x, k)


def build_F(G: Graph, v: int, k: int, s: float, alpha_p: float, beta_p: float) -> Fp:
    if G.V[v].level == k:
        return Fcs(v=G.V[v], alpha_p=alpha_p)

    N_v = G.N(v)
    children_deeper_than_k = 0
    for u in N_v:
        if G.V[u].level > k:
            children_deeper_than_k += 1

    return Fp(
        v=G.V[v], alpha_p=alpha_p, beta_p=beta_p, g_p=children_deeper_than_k * s * 0.5
    )


def find_minimum_for_F_collection(F_collection: List[F], k: int) -> float:
    points_to_check = (
        [f.x_p for f in F_collection]
        + [f.x_p + f.g_p for f in F_collection if (isinstance(f, Fp) and f.g_p > 0)]
        + [f.x_p - f.g_p for f in F_collection if (isinstance(f, Fp) and f.g_p > 0)]
    )
    # print(F_collection)
    # print(points_to_check)
    # for f in F_collection:
    #     print(f.v.index, f.v.position)
    points_to_check.sort()
    min_val = float("inf")
    x_argmin = None
    for point in points_to_check:
        val_for_point = 0
        for f in F_collection:
            val_for_point += f(point, k)

        if val_for_point < min_val:
            min_val = val_for_point
            x_argmin = point

    # if x_argmin is None:
    #     print(f"Points to check: {points_to_check}")
    return x_argmin


def check_if_levels_and_L_sets_computed(G: Graph):
    for v in G.V:
        if not hasattr(v, "L_set_index"):
            # raise Exception(
            #     f"At least one vertice ({v.index}) has not been assigned colour"
            # )
            v.L_set_index = float("-inf")
        if not v.level_computed:
            raise Exception(
                f"At least one vertice ({v.index}) has not been assigned level"
            )


def signum(x):
    if abs(x) < SIGNUM_EPS:
        return 0
    elif x > 0:
        return 1
    else:
        return 0


# calculates F interspring that affects u
def F_interspring(u: Vertex, v: Vertex) -> Tuple[float, float]:
    i = u.L_set_index
    j = v.L_set_index
    l_i = u.level
    l_j = v.level
    return (
        W_1_X_INTERSPRING * ((abs(i - j)) ** W_2_X_INTERSPRING) * signum(j - i),
        -(W_1_Y_INTERSPRING * (abs(i - j)) ** W_2_Y_INTERSPRING)
        * (W_3_Y_INTERSPRING * (abs(l_i - l_j) ** W_4_Y_INTERSPRING)),
    )


def find_cum_F_interspring(G: Graph, v: int) -> Tuple[float, float]:
    cum_F_interspring = (0, 0)
    colour_v = G.V[v].L_set_index
    for u in G.N(v):
        if G.V[u].L_set_index != colour_v:
            F_interspring_u = F_interspring(G.V[v], G.V[u])
            cum_F_interspring = (
                cum_F_interspring[0] + F_interspring_u[0],
                cum_F_interspring[1] + F_interspring_u[1],
            )

    # Changed: was N(v), pretty sure it should have been NR(v)
    for u in G.N_reversed(
        v
    ):  # employ checking if the vertice is not doubly calculated in graphs with some undirected edges
        if G.V[u].L_set_index != colour_v:
            F_interspring_u = F_interspring(G.V[v], G.V[u])
            cum_F_interspring = (
                cum_F_interspring[0] + F_interspring_u[0],
                cum_F_interspring[1] + F_interspring_u[1],
            )

    return cum_F_interspring


def find_max_colour_index(G: Graph) -> int:
    max_colour_index = -1
    for v in G.V:
        max_colour_index = max(max_colour_index, v.L_set_index)

    return max_colour_index


def produce_E_v_entry_for_subgraph(
    v: int, E_v: Set[int], deactivated_Vs_WPI: ArrayWithPersistentIterator
) -> Set[int]:
    # print(v, deactivated_Vs_WPI.current_element, deactivated_Vs_WPI.array)
    if (
        deactivated_Vs_WPI.current_element is None
        or deactivated_Vs_WPI.current_element != v
    ):
        # return set()
        return copy(E_v)
    else:
        deactivated_Vs_WPI.it += 1
        # return copy(E_v)
        return set()


def build_colour_subgraphs(G: Graph) -> List[Graph]:
    max_colour_index = find_max_colour_index(G)
    Gs_by_colour: List[Graph] = [None for _ in range(max_colour_index + 1)]
    for colour in range(0, max_colour_index + 1):
        # print(colour)
        deactivated_Vs_for_colour_list = [
            v.index
            for v in G.V
            if not hasattr(v, "L_set_index") or v.L_set_index != colour
        ]
        deactivated_Vs_for_colour_set = set(deactivated_Vs_for_colour_list)
        deactivated_Vs_WPI = ArrayWithPersistentIterator(
            array=deactivated_Vs_for_colour_list
        )
        Gs_by_colour[colour] = Graph(
            num_of_vertex=len(G.V),
            is_directed=G.is_directed,
            E=[
                produce_E_v_entry_for_subgraph(v, G.E_adj_list[v], deactivated_Vs_WPI)
                for v in range(0, len(G.V))
            ],
        )
        Gs_by_colour[colour].deactivated_V = deactivated_Vs_for_colour_set
        Gs_by_colour[colour].V = G.V
        Gs_by_colour[colour].find_roots()
        # if colour == 2:
        #     print(Gs_by_colour)

    # print(Gs_by_colour)
    return Gs_by_colour


def get_roots_initial_x_positions(
    W: float, roots: List[int], F_interspring_collection: List[Tuple[float, float]]
) -> List[Tuple[int, float]]:
    if len(roots) == 1:
        return [(*roots, 0)]
    roots_sorted_by_interspring = sorted(
        [(r, F_interspring_collection[r][0]) for r in roots], key=lambda x: x[1]
    )

    # print(W)
    step = (len(roots) + 1) / W
    for i in range(0, len(roots_sorted_by_interspring)):
        # roots_sorted_by_interspring[i][1] = - 0.5*W + step*i
        roots_sorted_by_interspring[i] = (
            roots_sorted_by_interspring[i][0],
            -0.5 * W + step * i,
        )

    return roots_sorted_by_interspring


def build_Vs_per_levels_collection(G: Graph) -> List[List[int]]:
    max_level = float("-inf")
    min_level = float("inf")
    for v in G.V:
        if v.index in G.deactivated_V:
            continue
        max_level = max(max_level, v.level)
        min_level = min(min_level, v.level)

    Vs_per_levels = [[] for _ in range(max_level + 1)]
    for v in G.V:
        if v.index in G.deactivated_V:
            continue
        Vs_per_levels[v.level - min_level].append(v.index)

    return Vs_per_levels


def build_F_interspring_collection(G: Graph, Vs_per_levels: List[List[int]]):
    F_interspring_collection = [(0, 0) for _ in range(len(G.V))]
    for v in range(len(F_interspring_collection)):
        F_interspring_collection[v] = find_cum_F_interspring(G, v)

    for k in range(len(Vs_per_levels) - 1, -1, -1):
        for v in Vs_per_levels[k]:
            for u in G.N_reversed(v):
                if G.V[u].L_set_index != G.V[v].L_set_index:
                    continue
                # the way F interspring should be pushed upwards is subject to change
                F_interspring_collection[u] = (
                    F_interspring_collection[u][0]
                    + L_INTERSPRING_TRANSFER * F_interspring_collection[v][0],
                    F_interspring_collection[u][1],
                )
                # F_interspring_collection[u][0] += L_INTERSPRING_TRANSFER * F_interspring_collection[v][0]

    return F_interspring_collection


def move_from_left_to_right_and_create_gaps(
    V: List[Tuple[int, float]], W: float, eps: float
):
    n = len(V) - 1
    a, b = -W * 0.5, W * 0.5
    gamma: Optional[float] = None
    for i in range(n):
        (_, p_u), (_, p_v) = V[i], V[i + 1]
        eps_uv = p_v - p_u
        if gamma is None and eps_uv < eps:
            m_u = p_u - (a if i == 0 else (V[i - 1][1] + eps))
            m_v = -p_v + (b if i == n - 1 else (V[i + 2][1] - eps))
            m_u = max(m_u, 0)
            m_v = max(m_v, 0)
            p_u -= m_u
            p_v += m_v
            if (eps_uv := p_v - p_u) < eps:
                gamma = eps - eps_uv
        elif gamma is not None:
            if eps_uv >= eps + gamma:
                p_u += gamma
                gamma = None
                continue
            # print(gamma)
            m_v = -p_v + (b if i == n - 1 else (V[i + 2][1] - eps))
            m_v = max(m_v, 0)
            p_v += m_v
            eps_uv = p_v - p_u
            delta = eps + gamma - eps_uv
            if delta <= 0:
                p_u += gamma
                gamma = None
            else:
                p_u += min(gamma, eps_uv)
                if eps_uv >= gamma:
                    gamma = 0
                else:
                    gamma -= eps_uv
                gamma += p_v - p_u
                if abs(gamma) < SIGNUM_EPS:
                    gamma = None

        V[i] = (V[i][0], p_u)
        V[i + 1] = (V[i + 1][0], p_v)


def move_from_right_to_left_and_create_gaps(
    V: List[Tuple[int, float]], W: float, eps: float
):
    n = len(V) - 1
    a, b = -W * 0.5, W * 0.5
    gamma = None
    for i in range(n - 1, -1, -1):
        # i = j-1
        (_, p_u), (_, p_v) = V[i], V[i + 1]
        eps_uv = p_v - p_u
        if gamma is None and eps_uv < eps:
            m_u = p_u - (a if i == 0 else (V[i - 1][1] + eps))
            m_v = -p_v + (b if i == n - 1 else (V[i + 2][1] - eps))
            m_u = max(m_u, 0)
            m_v = max(m_v, 0)
            p_u -= m_u
            p_v += m_v
            if (eps_uv := p_v - p_u) < eps:
                gamma = eps - eps_uv
        elif gamma is not None:
            if eps_uv >= eps + gamma:
                p_u += gamma
                gamma = None
                continue
            m_v = -p_v + (b if i == n - 1 else (V[i + 2][1] - eps))
            m_v = max(m_v, 0)
            p_v += m_v
            eps_uv = p_v - p_u
            delta = eps + gamma - eps_uv
            if delta <= 0:
                p_u += gamma
                gamma = None
            else:
                p_u += min(gamma, eps_uv)
                if eps_uv >= gamma:
                    gamma = 0
                else:
                    gamma -= eps_uv
                gamma += p_v - p_u
                if abs(gamma) < SIGNUM_EPS:
                    gamma = None

        V[i] = (V[i][0], p_u)
        V[i + 1] = (V[i + 1][0], p_v)


# eps - min. required gap
# the function assumes that V_positions is already sorted at the time of passing
def create_gaps_between_vertices_in_layout(
    V: List[Tuple[int, float]], W: float, eps: float
):
    gamma = eps
    left_border, right_border = -W / 2, W / 2
    n = len(V) - 1
    move_from_left_to_right_and_create_gaps(V, W, eps)
    move_from_right_to_left_and_create_gaps(V, W, eps)
    # for i in range (n):
    #     (_, pos_u), (_, pos_v) = V[i], V[i+1]
    #     # if pos_u - pos_v > SIGNUM_EPS:
    #         # raise Exception("Something is wrong with the V passed to the create gaps function")
    #     if (eps_uv := abs(pos_v - pos_u)) < gamma:
    #         # available space to the left of u and to the right of v respeively
    #         av_u = pos_u - (left_border if i == 0 else (V[i-1][1] + eps))
    #         av_v = - pos_v + (right_border if i == n-1 else (V[i+2][1] - eps))
    #         if eps_uv + av_u + av_v >= gamma:
    #             m_u = max(0, av_u)
    #             pos_u -= m_u
    #             m_v = gamma - eps_uv - m_u
    #             # pos_v += gamma - m_v
    #             pos_v += m_v
    #             gamma = eps
    #             print("A0", i, n, V[i][0], V[i+1][0], pos_u, pos_v, gamma)
    #         else:
    #             m_u = max(0, av_u)
    #             m_v = max(0, av_v)
    #             pos_u -= m_u
    #             pos_v += m_v
    #             gamma = eps + gamma - eps_uv - m_u - m_v
    #             print("A", i, n, V[i][0], V[i+1][0], pos_u, pos_v, gamma)

    #     V[i] = (V[i][0], pos_u)
    #     V[i+1] = (V[i+1][0], pos_v)

    # repeat the same loop but from the last index to the first, i.e.
    # for i in range (len(V)-1, 0, -1)

    # for i in range (len(V)-1, 0, -1):
    #     (_, pos_u), (_, pos_v) = V[i-1], V[i]
    #     # if pos_u - pos_v > SIGNUM_EPS:
    #         # raise Exception("Something is wrong with the V passed to the create gaps function")
    #     if (eps_uv := abs(pos_v - pos_u)) < gamma:
    #         # available space to the left of u and to the right of v respeively
    #         av_u = pos_u - (left_border if i == 1 else (V[i-1][1] + eps))
    #         av_v = - pos_v + (right_border if i == n else (V[i][1] - eps))
    #         if eps_uv + av_u + av_v >= gamma:
    #             m_u = max(0, av_u)
    #             pos_u -= m_u
    #             m_v = gamma - eps_uv - m_u
    #             # pos_v += gamma - m_v
    #             pos_v += m_v
    #             gamma = eps
    #             print("B0", i, n, V[i-1][0], V[i][0], pos_u, pos_v, gamma)
    #         else:
    #             m_u = max(0, av_u)
    #             m_v = max(0, av_v)
    #             pos_u -= m_u
    #             pos_v += m_v
    #             gamma = eps + gamma - eps_uv - m_u - m_v
    #             print("B", i, n, V[i-1][0], V[i][0], pos_u, pos_v, gamma)

    #     V[i-1] = (V[i-1][0], pos_u)
    #     V[i] = (V[i][0], pos_v)

    for i in range(n):
        # print(i, V[i+1][1] - V[i][1], eps, abs(V[i+1][1] - V[i][1]) < eps)
        if abs(V[i + 1][1] - V[i][1]) < eps:
            # raise Exception("Something went wrong when trying to space the vertices")
            print(V, left_border, right_border, eps)
            print("Something went wrong when trying to space the vertices")
            break


def build_F_collection_v(
    G: Graph, v: int, V_k_already_drawn: Set[int], w: float
) -> List[F]:
    c = G.V[v].L_set_index
    k_v = G.V[v].level
    F_collection_v = [
        build_F(G, u, k_v, w * S_COEFF, ALPHA_P, BETA_P)
        for u in G.N_reversed(v)
        if G.V[u].L_set_index == c
    ]
    # print(F_collection_v)

    for u in G.N(v):
        for w in G.N_reversed(u):
            if w == v or G.V[w].L_set_index != c:
                continue
            elif G.V[w].level < k_v or (G.V[w].level == k_v and w in V_k_already_drawn):
                F_collection_v.append(build_F(G, w, k_v, w * S_COEFF, ALPHA_P, BETA_P))
                # print(F_collection_v)

    # print(F_collection_v)
    return F_collection_v


def find_initial_layout_for_subgraph(
    G: Graph,
    W: float,
    F_interspring_collection: List[Tuple[float, float]],
    Vs_per_levels: List[List[int]],
):
    for v in G.V:
        setattr(v, "position", (None, None))
    # transfer_interspring_forces_upwards(G)
    roots = G.roots
    # print(Vs_per_levels[0])
    # print(G)
    # print(roots)
    # if not (sorted(Vs_per_levels[0]) == sorted(roots)):
    #     print(Vs_per_levels[0], roots)
    #     raise Exception("Something went wrong when passing args to layout drawing function")

    roots_x_positions = get_roots_initial_x_positions(
        # W, roots, F_interspring_collection
        W,
        Vs_per_levels[0],
        F_interspring_collection,
    )

    for root, pos_x_root in roots_x_positions:
        G.V[root].position = (pos_x_root, 0)

    predicted_y_coords = [0 for _ in range(len(Vs_per_levels))]
    predicted_y_coords[0] = 0
    for k in range(1, len(Vs_per_levels)):
        predicted_y_coords[k] = (
            predicted_y_coords[k - 1]
            + (G_ACC * (VERTICE_WEIGHT + ADD_CHILDREN_WEIGHT_COEFF))
            / K_INIT_LAYOUT_COEFF
        )

    # print(Vs_per_levels)
    for k in range(1, len(Vs_per_levels)):
        V_k = Vs_per_levels[k]
        V_k.sort(
            key=lambda x, G_=G, c_=G.V[roots[0]].L_set_index: -len(
                [u for u in G_.N_reversed(x) if G_.V[u].L_set_index == c_]
            )
        )
        V_k_already_drawn: Set[int] = set()
        for v in V_k:
            k_v = G.V[v].level
            # F_collection_v = [
            #     build_F(G, u, k_v, W / (len(V_k)*S_COEFF), ALPHA_P, BETA_P)
            #     for u in G.N_reversed(v) if G.V[u].L_set_index == G.V[v].L_set_index
            # ]
            F_collection_v = build_F_collection_v(
                G, v, V_k_already_drawn, W / (len(V_k) * S_COEFF)
            )
            # print(v, F_interspring_collection[v])
            # print(V_k)
            # print(
            #     v, G.V[v].level, G.V[v].L_set_index,
            #     [(f.v.index, f.v.level, f.v.L_set_index) for f in F_collection_v]
            # )
            if len(F_collection_v) != 0:
                position_v_x = (
                    find_minimum_for_F_collection(F_collection_v, k_v)
                    + F_interspring_collection[v][0]
                )
                position_v_x = max(-W * 0.5, position_v_x)
                position_v_x = min(W * 0.5, position_v_x)
            else:
                position_v_x = (W * (0.5 - MARGIN_PADDING_COEFF)) * signum(
                    F_interspring_collection[v][0]
                )

            parents_v = [
                u for u in G.N_reversed(v) if G.V[u].L_set_index == G.V[v].L_set_index
            ]
            parent_y_coords = [G.V[p].position[1] for p in parents_v]
            # lowest_parent_y = min(parent_y_coords) if len(parent_y_coords) != 0 else predicted_y_coords[k-1]
            lowest_parent_y = (
                max(parent_y_coords)
                if len(parent_y_coords) != 0
                else predicted_y_coords[k - 1]
            )
            d = 1 + PULL_UP_COEFF * (len(parents_v) - 1)
            weight_v = VERTICE_WEIGHT + ADD_CHILDREN_WEIGHT_COEFF * len(
                [u for u in G.N(v) if G.V[v].L_set_index == G.V[u].L_set_index]
            )
            G.V[v].position = (
                position_v_x,
                lowest_parent_y + (weight_v * G_ACC) / (K_INIT_LAYOUT_COEFF * d),
            )
            V_k_already_drawn.add(v)

        if len(V_k) != 1:
            V_k_positions_x = [(v, G.V[v].position[0]) for v in V_k]
            V_k_positions_x.sort(key=lambda x: x[1])
            eps_k = (0.5 * W) / (len(V_k) - 1)  # to tune
            create_gaps_between_vertices_in_layout(V_k_positions_x, W, eps_k)
            for v, v_pos_x in V_k_positions_x:
                G.V[v].position = (v_pos_x, G.V[v].position[1])


def find_layout_for_subgraph(
    G: Graph,
    c: int,
    W: float,
    F_interspring_collection: List[Tuple[float, float]],
    Vs_per_levels: List[List[int]],
) -> List[Tuple[int, Tuple[float, float]]]:
    find_initial_layout_for_subgraph(G, W, F_interspring_collection, Vs_per_levels)
    # apply force directed algorithm
    P: List[Tuple[int, Tuple[float, float]]] = []
    for v in G.V:
        if v.L_set_index == c:
            P.append((v.index, v.position))

    return P


def remove_element_in_unorganized_array(arr: List, index: int):
    arr[index], arr[-1] = arr[-1], arr[index]
    arr.pop()


# destroys eroding_Vs_per_levels_in_the_process
def extract_Vs_per_levels_for_subgraph(
    G: Graph, colour: int, eroding_global_Vs_per_levels: List[List[int]]
) -> List[List[int]]:
    # print(len(eroding_global_Vs_per_levels))
    Vs_per_levels = [[] for _ in eroding_global_Vs_per_levels]
    # print(Vs_per_levels, len(Vs_per_levels))
    for k in range(len(Vs_per_levels)):
        # print(k)
        n_k = len(eroding_global_Vs_per_levels[k])
        i = 0
        while i < n_k:
            v_k = eroding_global_Vs_per_levels[k][i]
            if G.V[v_k].L_set_index == colour:
                Vs_per_levels[k].append(v_k)
                remove_element_in_unorganized_array(
                    eroding_global_Vs_per_levels[k], index=i
                )
                n_k -= 1
            else:
                i += 1

    start_level = 0
    for i in range(len(Vs_per_levels)):
        start_level = i
        if len(Vs_per_levels[i]) > 0:
            break

    end_level = -1
    for i in range(len(Vs_per_levels) - 1, -1, -1):
        end_level = i
        if len(Vs_per_levels[i]) > 0:
            break

    if start_level > end_level:
        return []
    # print(Vs_per_levels)
    return Vs_per_levels[start_level : end_level + 1]


def determine_box_width_for_subgraph(Vs_per_levels: List[List[int]]) -> float:
    W = BOX_WIDTH_COEFF * max([len(V_k) for V_k in Vs_per_levels])
    # print("W:", W, type(W))
    return W


def create_layout(G: Graph) -> List[Tuple[float, float]]:
    check_if_levels_and_L_sets_computed(G)
    global_Vs_per_levels = build_Vs_per_levels_collection(G)
    F_interspring_collection = build_F_interspring_collection(G, global_Vs_per_levels)
    Gs_by_colour = build_colour_subgraphs(G)
    # print(F_interspring_collection)
    # for i in range(len(F_interspring_collection)):
    #     F_i_x, F_i_y = F_interspring_collection[i]
    #     if abs(F_i_x) > SIGNUM_EPS or abs(F_i_y) > SIGNUM_EPS:
    #         print(i, F_i_x, F_i_y)

    eroding_global_Vs_per_levels = copy(global_Vs_per_levels)
    P: List[Optional[Tuple[float, float]]] = [None for _ in range(len(G.V))]
    offset = 0
    padding = PADDING
    for c in range(len(Gs_by_colour)):
        G_c = Gs_by_colour[c]
        Vs_per_levels_for_G_c = extract_Vs_per_levels_for_subgraph(
            G, c, eroding_global_Vs_per_levels
        )
        if len(Vs_per_levels_for_G_c) == 0:
            continue
        W_c = determine_box_width_for_subgraph(Vs_per_levels_for_G_c)
        # print("W_c", W_c, type(W_c))
        G_c_positions = find_layout_for_subgraph(
            G_c, c, W_c, F_interspring_collection, Vs_per_levels_for_G_c
        )
        # print(G_c_positions)
        for v, (v_pos_x, v_pos_y) in G_c_positions:
            if P[v] is not None:
                print(f"Double calculated v!")
            P[v] = (v_pos_x + offset, v_pos_y)
        offset += W_c + padding

    return P
