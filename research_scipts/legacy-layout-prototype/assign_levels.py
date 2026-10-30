from collections import deque as queue
from copy import deepcopy

from graph import Graph, Vertex


def assign_levels(G: Graph):
    if G.vertex_levels_computed:
        raise Exception("Vertex levels already computed")

    roots = G.roots
    if len(roots) == 0:
        raise Exception("The graph must have at least one root")

    Q = queue()
    Q_prim = queue()
    for u in roots:
        Q.append((u, 0))

    should_ignore = [False for _ in range(G.vertex_count)]
    live_I_v_collection = [deepcopy(G.N_reversed(u)) for u in range(G.vertex_count)]

    while not (len(Q) == 0 and len(Q_prim) == 0):
        if len(Q) > 0:
            u, level = Q.popleft()
        else:
            u, level = Q_prim.popleft()

        if not should_ignore[u]:
            should_ignore[u] = True
            G.set_level_for_v(vertex_index=u, level=level)
            for v in G.N(u):
                live_I_v_collection[v].remove(u)
                I_v = live_I_v_collection[v]
                if len(I_v) > 0:
                    Q_prim.append((v, level + 1))
                else:
                    Q.append((v, level + 1))
