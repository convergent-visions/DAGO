from typing import List, Set, Tuple, Union

# Vertex = int
Edge = Tuple[int, int]
EdgeContainer = Union[List[Edge], List[Set[int]]]


class Vertex:
    def __init__(self, index: int):
        self.index = index
        self.level = -1

    @property
    def level_computed(self):
        return self.level >= 0


# the class assumes the graph has no (u, u) edges
class Graph:
    def __init__(self, num_of_vertex: int, E: EdgeContainer, is_directed: bool = True):
        self.V: List[Vertex] = [Vertex(index=i) for i in range(num_of_vertex)]
        self.deactivated_V: Set[int] = set()
        self.E_edge_list: List[Edge] = None
        self.E_adj_list: List[Set[int]] = None
        self.E_reversed_adj_list: List[Set[int]] = None
        self.is_directed: bool = is_directed
        self.roots: List[int] = None
        self.make_edge_containers(E)
        if self.is_directed:
            self.find_roots()

    @property
    def vertex_levels_computed(self):
        try:
            for v in self.V:
                if not v.level_computed:
                    raise Exception()
            return True
        except Exception as e:
            ...

        for v in self.V:
            if v.level_computed:
                raise Exception("Something is wrong - only some levels are computed")

        return False

    @property
    def vertex_count(self) -> int:
        return len(self.V) - len(self.deactivated_V)

    @property
    def vertex_count_including_deactivated(self) -> int:
        return len(self.V)

    @property
    def edge_count(self) -> int:
        return len(self.E_edge_list)

    def N(self, vertex_index: int) -> Set[int]:
        return self.E_adj_list[vertex_index]

    def N_reversed(self, vertex_index: int) -> Set[int]:
        return self.E_reversed_adj_list[vertex_index]

    def set_level_for_v(self, vertex_index: int, level: int):
        self.V[vertex_index].level = level

    def find_roots(self):
        self.roots = None
        roots: List[int] = []
        for u in range(len(self.E_reversed_adj_list)):
            if u in self.deactivated_V:
                continue
            if len(self.E_reversed_adj_list[u]) == 0:
                roots.append(u)
            else:
                for v in self.E_reversed_adj_list[u]:
                    if v not in self.deactivated_V:
                        break
                else:
                    roots.append(u)

        self.roots = roots

    def make_edge_containers(self, E: EdgeContainer):
        if isinstance(E[0], tuple):
            self.E_edge_list = E
            self.E_adj_list = [set() for _ in range(len(self.V))]
            for e in self.E_edge_list:
                u, v = e
                self.E_adj_list[u].add(v)
                if not self.is_directed:
                    self.E_adj_list[v].add(u)

        elif isinstance(E[0], set):
            self.E_adj_list = E
            self.E_edge_list = []
            for u in range(len(self.E_adj_list)):
                for v in self.E_adj_list[u]:
                    if not self.is_directed and u < v:
                        self.E_edge_list.append((u, v))
                    elif self.is_directed:
                        self.E_edge_list.append((u, v))

        self.E_reversed_adj_list = [set() for _ in range(len(self.V))]
        for u in range(len(self.E_adj_list)):
            for v in self.E_adj_list[u]:
                # print(v, u)
                self.E_reversed_adj_list[v].add(u)

        # print(self.E_reversed_adj_list)

    def __str__(self):
        str_representation = "["
        for v in range(len(self.E_adj_list)):
            str_representation += "{"
            str_representation += f"{v}: "
            str_representation += f"{self.E_adj_list[v]}\n"
        str_representation += "]"
        return str_representation

    def __repr__(self):
        return self.__str__()
