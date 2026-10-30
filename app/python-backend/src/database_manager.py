import datetime
import hashlib
import logging
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pymongo
from bson.objectid import ObjectId
from utils import VertexMetadataT

"""
Database stores graph data in following format:
    {
        "name": <name, type=str>,
        "num_of_vertices": <|V|, type=int>,
        "last_entry_update": <datetime, type=datetime>,
        "vertices": [
            {
                "index": <index, type=int>,
                "N": <neighbourhood of vertex, type=List[int]>,
                "pos": <position in layout>
            }, ...
        ]
    }
"""


class MongoDatabaseManager:
    GRAPH_DATA_COLLECTION = "graph_data"
    GRAPH_GROUPS_COLLECTION = "graph_groups"

    def __init__(
        self, db_uri: str, db_name: str, logger: Optional[logging.Logger] = None
    ):
        self.client_handle = pymongo.MongoClient(db_uri)
        self.db = self.client_handle[db_name]
        self.logger = logger or logging.getLogger(__name__)

    def check_if_contains_graph_with_hash(self, graph_id: Union[ObjectId, str]) -> bool:
        return self.fetch_data(graph_id) is not None

    def fetch_data(self, graph_id: Union[ObjectId, str]) -> Dict[str, Any]:
        if isinstance(graph_id, str):
            graph_id = self._convert_to_object_id(graph_id)

        sought_graph_data = self.db[self.GRAPH_DATA_COLLECTION].find_one(
            {"_id": graph_id}
        )

        return sought_graph_data

    def push_new_entry(
        self,
        name: str,
        E_adj_list: List[List[int]],
        layout: List[Tuple[int, int]],
        vertices_metadata: VertexMetadataT,
        additional_config: Optional[Dict[str, Any]] = None,
    ) -> str:
        n = len(E_adj_list)
        self.logger.info(f"Inserting new graph with name: {name}, num_of_vertices: {n}")
        result = self.db[self.GRAPH_DATA_COLLECTION].insert_one(
            {
                "name": name,
                "num_of_vertices": n,
                "last_entry_update": datetime.datetime.utcnow(),
                "vertices": [
                    (
                        {
                            "index": i,
                            "N": np.array(E_adj_list[i]).astype(int).tolist(),
                            "pos": list(layout[i]),
                        }
                        | vertices_metadata[i]
                    )
                    for i in range(0, n)
                ],
            }
            | (additional_config if additional_config is not None else {})
        )

        status = "success" if result.inserted_id else "failure"
        self.logger.info(f"Database insertion resulted in {status}")
        return str(result.inserted_id)

    def override_existing_entry(
        self,
        graph_id: Union[ObjectId, str],
        name: str,
        E_adj_list: List[List[int]],
        layout: List[Tuple[int, int]],
        vertices_metadata: VertexMetadataT,
        additional_config: Optional[Dict[str, Any]] = None,
    ):
        if isinstance(graph_id, str):
            graph_id = self._convert_to_object_id(graph_id)

        self.logger.info(f"Updating graph entry for graph_id={graph_id}")
        n = len(E_adj_list)
        self.db[self.GRAPH_DATA_COLLECTION].update_one(
            {"_id": graph_id},
            {
                "$set": {
                    "name": name,
                    "num_of_vertices": n,
                    "last_entry_update": datetime.datetime.utcnow(),
                    "vertices": [
                        (
                            {
                                "index": i,
                                "N": np.array(E_adj_list[i]).astype(int).tolist(),
                                "pos": list(layout[i]),
                            }
                            | vertices_metadata[i]
                        )
                        for i in range(0, n)
                    ],
                }
                | (additional_config if additional_config is not None else {})
            },
        )

    def delete_entry(self, graph_id: Union[ObjectId, str]) -> None:
        if isinstance(graph_id, str):
            graph_id = self._convert_to_object_id(graph_id)

        self.db[self.GRAPH_DATA_COLLECTION].delete_one({"_id": graph_id})

    def update_existing_entry(
        self, graph_id: Union[ObjectId, str], new_vals: Dict[str, Any]
    ) -> None:
        if isinstance(graph_id, str):
            graph_id = self._convert_to_object_id(graph_id)

        self.db[self.GRAPH_DATA_COLLECTION].update_one(
            {"_id": graph_id}, self._build_update_dict(new_vals)
        )

    def _build_update_dict(self, new_vals: Dict[str, Any]) -> Dict[str, Any]:
        """
        Builds update dict for MongoDB update operation based on new_vals.
        """

        # Sets per operator
        ops: Dict[str, Dict[str, Any]] = {
            "$set": {},
            "$addToSet": {},
            "$pull": {},
            "$push": {},
        }

        set_part = ops["$set"]
        add_to_set = ops["$addToSet"]
        pull = ops["$pull"]
        push = ops["$push"]

        # full overwrite fields
        # simple fields
        for field in ("name",):
            if field in new_vals:
                set_part[field] = new_vals[field]

        # full arrays (full sync)
        for field in ("favorites", "comments"):
            if field in new_vals:
                set_part[field] = new_vals[field]

        # deltas
        if "favorite_add" in new_vals:
            add_to_set["favorites"] = new_vals["favorite_add"]
        if "favorite_remove" in new_vals:
            pull["favorites"] = new_vals["favorite_remove"]

        if "comment_add" in new_vals:
            push["comments"] = new_vals["comment_add"]
        if "comment_remove" in new_vals:
            pull["comments"] = {"id": new_vals["comment_remove"]}

        # Update in vertices
        # new_vals["vertices"] = List[Tuple[int, List[Tuple[str, Any]]]]
        if "vertices" in new_vals:
            vertices_updates_list: List[Tuple[int, List[Tuple[str, Any]]]] = new_vals[
                "vertices"
            ]
            for vertex_index, vertex_update_list in vertices_updates_list:
                for field, new_val in vertex_update_list:
                    if field in ("N", "index"):
                        raise RuntimeError(
                            "Attempted to change data that cannot be updated after creation"
                        )
                    set_part[f"vertices.{vertex_index}.{field}"] = new_val

        # always bump last_entry_update
        set_part["last_entry_update"] = datetime.datetime.utcnow()

        # Clean up empty operators
        update: Dict[str, Any] = {op: payload for op, payload in ops.items() if payload}

        if not update:
            raise RuntimeError("Empty update dict")

        return update

    # Groups
    def get_group(self, group_name: str) -> Optional[Dict]:
        return self.db[self.GRAPH_GROUPS_COLLECTION].find_one(
            {"group_name": group_name}
        )

    def create_graph_group(self, group_name: str, password: str) -> Dict:
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        doc = {
            "group_name": group_name,
            "password_hash": password_hash,
            "created_at": datetime.datetime.utcnow(),
        }
        self.db[self.GRAPH_GROUPS_COLLECTION].insert_one(doc)
        return doc

    def verify_group_password(self, name: str, password_plain: str) -> bool:
        group = self.get_group(name)
        if group is None:
            return False
        pwd_hash = hashlib.sha256(password_plain.encode("utf-8")).hexdigest()
        return group.get("password_hash") == pwd_hash

    def add_graph_to_group(
        self, graph_id: Union[ObjectId, str], group_name: str
    ) -> None:
        if isinstance(graph_id, str):
            graph_id = self._convert_to_object_id(graph_id)

        self.db[self.GRAPH_DATA_COLLECTION].update_one(
            {"_id": graph_id}, {"$set": {"group": group_name}}
        )

    def list_graphs_for_group(self, group_name: str) -> List[Dict[str, Any]]:
        """
        Returns list of graphs in given group with following fields:
        - id (string)
        - name
        - num_of_vertices
        - last_entry_update (ISO string or None)
        """
        cursor = (
            self.db[self.GRAPH_DATA_COLLECTION]
            .find(
                {"group": group_name},
                {
                    "_id": 1,
                    "name": 1,
                    "num_of_vertices": 1,
                    "last_entry_update": 1,
                },
            )
            .sort("last_entry_update", pymongo.DESCENDING)
        )

        result: List[Dict[str, Any]] = []
        for doc in cursor:
            result.append(
                {
                    "id": str(doc["_id"]),
                    "name": doc.get("name"),
                    "num_of_vertices": doc.get("num_of_vertices"),
                    "last_entry_update": (
                        doc.get("last_entry_update").isoformat()
                        if doc.get("last_entry_update") is not None
                        else None
                    ),
                }
            )

        return result

    def list_groups(self) -> List[Dict[str, Any]]:
        cursor = (
            self.db[self.GRAPH_GROUPS_COLLECTION]
            .find({})
            .sort("created_at", pymongo.DESCENDING)
        )
        result: List[Dict[str, Any]] = []
        for doc in cursor:
            result.append(
                {
                    "group_name": doc.get("group_name"),
                    "created_at": doc.get("created_at").isoformat()
                    if doc.get("created_at") is not None
                    else None,
                }
            )
        return result

    # Will return a mock object id if an error occurs
    @staticmethod
    def _convert_to_object_id(graph_id: str) -> ObjectId:
        try:
            converted_graph_id = ObjectId(graph_id)
            return converted_graph_id
        except Exception:
            return ObjectId("0" * 24)
