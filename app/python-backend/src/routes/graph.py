import io
import json
from typing import Any, Dict, Optional

import graph_tool as gt
from flask import Blueprint, Response, jsonify, redirect, request, stream_with_context
from graph_utils import (
    build_gt_graph_from_graph_dict,
    convert_to_json_parsable_representation,
    filter_graph_by_root,
    load_graph_from_uploaded_file,
)
from layout.service import compute_layout
from routes.graph_data import (
    build_graph_from_graph_data,
    build_vertex_metadata_for_graph,
    extract_graph_config,
    linearized_layout_to_pairs,
    normalize_canvas_positions,
)
from routes.helpers import (
    EMPTY_PROPERTY_FIELD,
    build_response_json_string_for_make_graph_structure_req,
    extract_vertex_names,
    get_db_manager,
    get_graph_storage,
    get_layout_service_config,
    get_logger,
)
from werkzeug.datastructures import FileStorage

graph_bp = Blueprint("graph", __name__)


def _progress_event(
    stage: str,
    message: str,
    data: Optional[Dict[str, Any]] = None,
) -> str:
    event = {
        "stage": stage,
        "message": message,
    }

    if data is not None:
        event["data"] = data

    return json.dumps(event) + "\n"


@graph_bp.route("/session_keepalive", methods=["POST"])
def session_keepalive():
    logger = get_logger()
    storage = get_graph_storage()

    logger.debug(request)
    data = request.get_json() or {}
    timestamp = data.get("date", "")
    graph_uuid = data.get("uuid")
    event_type = data.get("type", "nothing")
    if graph_uuid is not None:
        logger.info(f"Keepalive received for {graph_uuid}")
    storage.keepalive_message_queue.put((graph_uuid, timestamp, event_type))
    return jsonify({"status": "ok"}), 200


@graph_bp.route("/node/<string:graph_uuid>/<int:node_id>", methods=["GET"])
def get_node_information(graph_uuid: str, node_id: int):
    logger = get_logger()
    storage = get_graph_storage()

    logger.info(
        f"Received call on endpoint /node/<graph_uuid={graph_uuid}>/<node_id={node_id}>."
    )
    try:
        graph_info = storage.get_graph_data_for_id(graph_uuid)
    except RuntimeError as e:
        logger.error(f"Node data acquisition error: {e}")
        return jsonify({}), 404

    G_gt = graph_info["graph"]
    all_vertex_properties = G_gt.vertex_properties.keys()
    v = G_gt.vertex(node_id)

    m: Dict[str, Any] = {}
    for p in all_vertex_properties:
        val = G_gt.vertex_properties[p][v]
        if val == EMPTY_PROPERTY_FIELD:
            continue
        try:
            parsed_val = json.loads(val)
            m[p] = parsed_val
        except (json.JSONDecodeError, TypeError):
            m[p] = convert_to_json_parsable_representation(val)

    logger.info(
        f"Data returned on endpoint call /node/<graph_uuid={graph_uuid}>/<node_id={node_id}>: "
        + str(m)
    )

    return jsonify(m), 200


@graph_bp.route("/node_index/<string:graph_uuid>/<string:node_name>", methods=["GET"])
def get_node_index(graph_uuid: str, node_name: str):
    """
    Returns the index of the node with the given name in the specified graph.
    """
    logger = get_logger()
    storage = get_graph_storage()

    logger.info(
        f"Received call on endpoint /node_index/<graph_uuid={graph_uuid}>/<node_name={node_name}>"
    )

    try:
        graph_info = storage.get_graph_data_for_id(graph_uuid)
    except RuntimeError as e:
        logger.error(f"Node data acquisition error: {e}")
        return jsonify({}), 404

    G_gt: gt.Graph = graph_info["graph"]
    name_prop = G_gt.vertex_properties.get("name")

    if name_prop is None:
        return jsonify({"error": "Graph has no 'name' vertex property"}), 400

    for v in G_gt.vertices():
        if str(name_prop[v]).lower() == node_name.lower():
            return jsonify({"index": int(v)}), 200

    return jsonify({}), 404


@graph_bp.route("/flask_make_graph_structure", methods=["POST"])
def flask_make_graph_structure():
    file = request.files.get("file")

    if file is None or file.filename == "":
        return jsonify({"error": "No file provided"}), 400

    layout_type = request.form.get("layout_type", "cpp")
    root_namespace = request.form.get("root", None)

    logger = get_logger()
    storage = get_graph_storage()
    layout_host, layout_port = get_layout_service_config()

    logger.info(
        "Received request on endpoint /flask_make_graph_structure for file "
        f"{file.filename} with layout_type={layout_type}"
    )

    file_contents = file.read()
    filename = file.filename

    def generate():
        yield _progress_event("parsing", "Parsing graph file...")

        try:
            uploaded_file = FileStorage(
                stream=io.BytesIO(file_contents), filename=filename
            )
            G_gt, root_id, godag, full_graph, roots = load_graph_from_uploaded_file(
                uploaded_file
            )
        except ValueError as e:
            yield _progress_event("error", str(e))
            return
        except Exception as e:
            logger.error(f"Error while loading graph: {e}")
            yield _progress_event("error", "Failed to construct graph from file")
            return

        if G_gt is None:
            logger.error(f"Failed to create graph from file {file.filename}")
            yield _progress_event("error", "Failed to create graph")
            return

        logger.debug(
            f"Successfully extracted graph from {file.filename} "
            "and created a graph tool object based on it"
        )

        yield _progress_event("layout", "Computing graph layout...")
        canvas_positions, fallback_used = compute_layout(
            G_gt,
            layout_type,
            layout_host,
            layout_port,
            logger,
            category=root_namespace,
        )

        if fallback_used:
            yield _progress_event(
                "layout_fallback",
                "Radial layout computed because the C++ layout service was unavailable.",
            )

        yield _progress_event("normalizing", "Normalizing graph positions...")
        canvas_positions, space_size = normalize_canvas_positions(canvas_positions)

        yield _progress_event("preparing", "Preparing graph data...")
        (
            transformed_canvas_positions,
            links,
        ) = build_response_json_string_for_make_graph_structure_req(
            G_gt=G_gt,
            canvas_positions=canvas_positions,
        )

        names = extract_vertex_names(G_gt)

        logger.debug(
            f"Computed layout for {file.filename}, "
            "waiting for graph uuid generation..."
        )

        yield _progress_event("registering", "Registering graph session...")
        graph_uuid = storage.register_new_graph_data(
            {
                "name": file.filename,
                "graph": G_gt,
                "root_id": root_id,
                "godag": godag,
                "layout": transformed_canvas_positions,
                "space_size": int(space_size * 1.2),
                "full_graph": full_graph,
                "roots": roots,
                "current_category": root_namespace,
            }
        )
        yield _progress_event(
            "done",
            "Graph loaded successfully",
            {
                "uuid": graph_uuid,
                "canvas_positions": transformed_canvas_positions,
                "links": links,
                "names": names,
                "space_size": space_size,
                "categories": list(roots.keys()) if roots else None,
                "current_category": root_namespace,
            },
        )

    return Response(
        stream_with_context(generate()),
        mimetype="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@graph_bp.route("/save_graph/<string:graph_uuid>", methods=["POST"])
def save_graph_to_db(graph_uuid: str):
    logger = get_logger()
    storage = get_graph_storage()
    db_manager = get_db_manager()

    logger.info(f"Received call on endpoint /save_graph/<graph_uuid={graph_uuid}>")
    graph_data: Dict[str, Any] = None
    try:
        graph_data = storage.get_graph_data_for_id(graph_uuid)
    except RuntimeError:
        return jsonify({"error": "Graph not found"}), 404

    name = graph_data["name"]
    G_gt = graph_data["graph"]

    data = request.get_json(force=True)
    if not data or "canvas_positions" not in data or "links" not in data:
        return jsonify({"error": "Canvas positions and links are required"}), 400

    graph_hash = data.get("graph_hash", "")

    group_name = data.get("group_name", None)
    group_password = data.get("group_password", None)

    if group_name is not None and group_password is not None:
        group = db_manager.get_group(group_name)
        if group is None:
            db_manager.create_graph_group(group_name, group_password)
        else:
            if not db_manager.verify_group_password(group_name, group_password):
                return jsonify({"error": "Invalid group password"}), 403

    linearized_layout = data["canvas_positions"]
    layout = linearized_layout_to_pairs(linearized_layout)
    vertices_metadata = build_vertex_metadata_for_graph(G_gt)

    additional_config_keys = ["point_size", "space_size", "group_name"]
    additional_config = {
        key: data.get(key) for key in additional_config_keys if key in data
    }

    if not db_manager.check_if_contains_graph_with_hash(graph_hash):
        graph_hash = db_manager.push_new_entry(
            name=name,
            E_adj_list=[
                list(G_gt.get_out_neighbors(i)) for i in range(G_gt.num_vertices())
            ],
            layout=layout,
            vertices_metadata=vertices_metadata,
            additional_config=additional_config,
        )
    else:
        db_manager.override_existing_entry(
            graph_id=graph_hash,
            name=name,
            E_adj_list=[
                list(G_gt.get_out_neighbors(i)) for i in range(G_gt.num_vertices())
            ],
            layout=layout,
            vertices_metadata=vertices_metadata,
            additional_config=additional_config,
        )

    if group_name is not None:
        db_manager.add_graph_to_group(graph_hash, group_name)

    return jsonify({"hash": graph_hash}), 200


@graph_bp.route("/load_graph/<string:graph_hash>", methods=["GET"])
def load_graph_from_db(graph_hash: str):
    db_manager = get_db_manager()

    graph_data = db_manager.fetch_data(graph_hash)
    if graph_data is None:
        return jsonify({"error": "No graph with such hash kept in the database"}), 404

    built = build_graph_from_graph_data(graph_data)

    return jsonify({"graph_hash": graph_hash, **built}), 200


@graph_bp.route("/g/<string:graph_hash>", methods=["GET"])
def redirect_to_front(graph_hash: str):
    frontend_url = request.host_url.rstrip("/")
    return redirect(f"{frontend_url}/?g={graph_hash}", code=302)


@graph_bp.route("/load_graph_from_json", methods=["POST"])
def load_graph_from_json():
    file = request.files.get("file")
    if file is None or file.filename == "":
        return jsonify({"error": "No file provided"}), 400

    layout_type = request.form.get("layout_type", "cpp")
    logger = get_logger()
    layout_host, layout_port = get_layout_service_config()

    try:
        graph_data = json.load(file)
    except Exception as e:
        return jsonify({"error": f"Failed to parse JSON: {e}"}), 400

    vertices = graph_data.get("vertices")
    num_vertices = graph_data.get("num_of_vertices")

    if not isinstance(vertices, list) or not isinstance(num_vertices, int):
        return (
            jsonify(
                {"error": "Invalid graph JSON: missing 'vertices' or 'num_of_vertices'"}
            ),
            400,
        )

    has_layout = all(
        isinstance(v.get("pos", None), (list, tuple)) and len(v["pos"]) == 2
        for v in vertices
    )

    if has_layout:
        built = build_graph_from_graph_data(graph_data)
        return jsonify({"graph_hash": None, **built}), 200

    G_gt = build_gt_graph_from_graph_dict(graph_data)

    canvas_positions, fallback_used = compute_layout(
        G_gt, layout_type, layout_host, layout_port, logger
    )

    (
        linearized_canvas_positions,
        linearized_links,
    ) = build_response_json_string_for_make_graph_structure_req(
        G_gt=G_gt, canvas_positions=canvas_positions
    )

    storage = get_graph_storage()
    graph_uuid = storage.register_new_graph_data(
        {
            "name": graph_data.get("name", file.filename or "graph_from_file"),
            "graph": G_gt,
            "root_id": None,
            "godag": None,
            "layout": linearized_canvas_positions,
        }
    )

    config = extract_graph_config(graph_data)

    names = extract_vertex_names(G_gt)

    return (
        jsonify(
            {
                "graph_hash": None,
                "fallback_used": fallback_used,
                "uuid": graph_uuid,
                "canvas_positions": linearized_canvas_positions,
                "links": linearized_links,
                "config": config,
                "names": names,
            }
        ),
        200,
    )


@graph_bp.route("/recompute_layout/<string:graph_uuid>", methods=["POST"])
def recompute_layout(graph_uuid: str):
    logger = get_logger()
    storage = get_graph_storage()
    layout_host, layout_port = get_layout_service_config()

    try:
        graph_data = storage.get_graph_data_for_id(graph_uuid)
    except RuntimeError:
        return jsonify({"error": "Graph not found"}), 404

    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    layout_type = data.get("layout_type", "cpp")
    if layout_type not in {"cpp", "radial"}:
        return jsonify({"error": "Unsupported layout_type"}), 400

    G_gt = graph_data.get("graph")
    if G_gt is None:
        return jsonify({"error": "Graph not available in session"}), 500

    canvas_positions, fallback_used = compute_layout(
        G_gt,
        layout_type,
        layout_host,
        layout_port,
        logger,
        category=graph_data.get("current_category"),
    )
    canvas_positions, space_size = normalize_canvas_positions(canvas_positions)

    (
        transformed_canvas_positions,
        links,
    ) = build_response_json_string_for_make_graph_structure_req(
        G_gt=G_gt, canvas_positions=canvas_positions
    )

    graph_data["layout"] = transformed_canvas_positions
    graph_data["space_size"] = int(space_size * 1.2)

    names = extract_vertex_names(G_gt)

    return (
        jsonify(
            {
                "uuid": graph_uuid,
                "canvas_positions": transformed_canvas_positions,
                "links": links,
                "names": names,
                "space_size": space_size,
                "fallback_used": fallback_used,
            }
        ),
        200,
    )


@graph_bp.route("/change_category/<string:graph_uuid>", methods=["POST"])
def change_category(graph_uuid: str):
    logger = get_logger()
    storage = get_graph_storage()
    layout_host, layout_port = get_layout_service_config()

    try:
        graph_data = storage.get_graph_data_for_id(graph_uuid)
    except RuntimeError:
        return jsonify({"error": "Graph not found"}), 404

    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    category = data.get("category")
    if not category:
        return jsonify({"error": "Missing 'category'"}), 400

    layout_type = data.get("layout_type", "cpp")
    if layout_type not in {"cpp", "radial"}:
        return jsonify({"error": "Unsupported layout_type"}), 400

    full_graph = graph_data.get("full_graph")
    roots = graph_data.get("roots")
    if full_graph is None or not roots:
        return jsonify({"error": "This graph does not support changing category"}), 400

    root_id, root_vertex = roots.get(category, (None, None))
    if root_vertex is None:
        return jsonify({"error": f"Unknown category '{category}'"}), 400

    G_gt = filter_graph_by_root(full_graph, root_vertex)

    canvas_positions, fallback_used = compute_layout(
        G_gt, layout_type, layout_host, layout_port, logger, category=category
    )
    canvas_positions, space_size = normalize_canvas_positions(canvas_positions)

    (
        transformed_canvas_positions,
        links,
    ) = build_response_json_string_for_make_graph_structure_req(
        G_gt=G_gt, canvas_positions=canvas_positions
    )

    graph_data["graph"] = G_gt
    graph_data["root_id"] = root_id
    graph_data["layout"] = transformed_canvas_positions
    graph_data["space_size"] = int(space_size * 1.2)
    graph_data["current_category"] = category

    names = extract_vertex_names(G_gt)

    return (
        jsonify(
            {
                "uuid": graph_uuid,
                "canvas_positions": transformed_canvas_positions,
                "links": links,
                "names": names,
                "space_size": space_size,
                "fallback_used": fallback_used,
                "category": category,
            }
        ),
        200,
    )


@graph_bp.route("/update_graph_config/<string:graph_hash>", methods=["POST"])
def update_graph_config(graph_hash: str):
    logger = get_logger()
    db_manager = get_db_manager()

    logger.info(
        f"Received call on endpoint /update_graph_config/<graph_hash={graph_hash}>"
    )

    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    allowed_fields = {
        "favorites",
        "comments",
        "favorite_add",
        "favorite_remove",
        "comment_add",
        "comment_remove",
        "vertices",
        "name",
    }

    new_vals = {k: v for k, v in data.items() if k in allowed_fields}

    if not new_vals:
        return jsonify({"error": "No allowed fields in payload"}), 400

    try:
        db_manager.update_existing_entry(graph_hash, new_vals)
    except Exception as e:
        logger.exception("Failed to update graph config")
        return jsonify({"error": str(e)}), 500

    return jsonify({"status": "ok"}), 200
