from contextlib import contextmanager
from enum import Enum
from logging import Logger
from queue import Queue
from threading import Lock, Thread
from time import monotonic, sleep
from typing import Any, Dict, List, Optional
from uuid import uuid4


class KeepaliveMessageType(Enum):
    INTERVAL = (1,)
    VISIBLE = (2,)
    HIDDEN = (3,)
    CLOSED = 4

    @staticmethod
    def from_string(graph_display_state_str: str):
        if graph_display_state_str == "interval":
            return KeepaliveMessageType.INTERVAL
        elif graph_display_state_str == "visible":
            return KeepaliveMessageType.VISIBLE
        elif graph_display_state_str == "hidden":
            return KeepaliveMessageType.HIDDEN
        elif graph_display_state_str == "closed":
            return KeepaliveMessageType.CLOSED
        else:
            raise Exception("Unknown graph display state")


# Setting `max_capacity` to a negative value will result in no limit in storing on RAM
class GraphDataStorage:
    DEFAULT_KEEPALIVE_MESSAGE_PROCESSOR_SLEEP_TIME_S = 5
    DEFAULT_MAX_NUM_OF_CYCLES_WITHOUT_KEEPALIVE = 5

    def __init__(
        self,
        max_capacity: int = -1,
        keepalive_message_processor_sleep_time_s: int = DEFAULT_KEEPALIVE_MESSAGE_PROCESSOR_SLEEP_TIME_S,
        max_num_of_cycles_without_keepalive: int = DEFAULT_MAX_NUM_OF_CYCLES_WITHOUT_KEEPALIVE,
        logger: Optional[Logger] = None,
        hidden_session_timeout_s: float = 86400,
    ):
        self.data_storage_running = True
        self.max_capacity = max_capacity
        self.graph_hashmap: Dict[str, Dict[str, Any]] = {}

        self.graph_cycles_without_keepalive_hashmap: Dict[str, int] = {}
        self.graph_visible: Dict[str, bool] = {}
        self.hidden_session_timeout_s = hidden_session_timeout_s

        self.keepalive_message_queue: Queue = Queue()
        self.graph_hashmap_mutex: Lock = Lock()
        self.active_requests = 0
        self.keepalive_message_processor_sleep_time_s: int = (
            keepalive_message_processor_sleep_time_s
        )

        self.max_num_of_cycles_without_keepalive = max_num_of_cycles_without_keepalive
        self.logger: Optional[Logger] = logger
        self.keepalive_message_reader_thread: Thread = Thread(
            target=self._keepalive_message_processor_function
        )
        self.keepalive_message_reader_thread.start()

    def _keepalive_message_processor_function(self):
        try:
            while self.data_storage_running:
                graphs_to_prune_uuids: List[str] = []
                while not self.keepalive_message_queue.empty():
                    (
                        graph_uuid,
                        datetime,
                        event_type_str,
                    ) = self.keepalive_message_queue.get()
                    print(f"From queue: {graph_uuid}")
                    event_type = None
                    try:
                        event_type = KeepaliveMessageType.from_string(event_type_str)
                    except Exception:
                        print(
                            f"Could not convert from: {event_type_str}, which is of type: {type(event_type_str)}"
                        )

                    with self.graph_hashmap_mutex:
                        if graph_uuid in self.graph_cycles_without_keepalive_hashmap:
                            self.graph_cycles_without_keepalive_hashmap[graph_uuid] = -1

                            if event_type == KeepaliveMessageType.CLOSED:
                                graphs_to_prune_uuids.append(graph_uuid)
                            elif event_type == KeepaliveMessageType.HIDDEN:
                                self.graph_visible[graph_uuid] = False
                            elif event_type == KeepaliveMessageType.VISIBLE:
                                self.graph_visible[graph_uuid] = True

                            print(
                                f"Graph visible for {graph_uuid}: {self.graph_visible[graph_uuid]}"
                            )

                with self.graph_hashmap_mutex:
                    if not self.active_requests:
                        for graph_uuid in self.graph_cycles_without_keepalive_hashmap:
                            self.graph_cycles_without_keepalive_hashmap[graph_uuid] += 1
                for graph_uuid in graphs_to_prune_uuids:
                    self.delete_graph_data_for_id(graph_uuid)

                with self.graph_hashmap_mutex:
                    if not self.active_requests:
                        current_graph_uuids = list(
                            self.graph_cycles_without_keepalive_hashmap.keys()
                        )
                        for graph_uuid in current_graph_uuids:
                            max_cycles = (
                                self.max_num_of_cycles_without_keepalive
                                if self.graph_visible[graph_uuid]
                                else self.hidden_session_timeout_s
                                / self.keepalive_message_processor_sleep_time_s
                            )
                            if (
                                self.graph_cycles_without_keepalive_hashmap[graph_uuid]
                                > max_cycles
                            ):
                                self.graph_hashmap.pop(graph_uuid)
                                self.graph_cycles_without_keepalive_hashmap.pop(
                                    graph_uuid
                                )
                                self.graph_visible.pop(graph_uuid)
                with self.graph_hashmap_mutex:
                    active_graph_uuids = list(
                        self.graph_cycles_without_keepalive_hashmap
                    )

                if self.logger:
                    self.logger.debug("Active graph UUIDs: %s", active_graph_uuids)

                sleep(self.keepalive_message_processor_sleep_time_s)
            else:
                print(f"Graph data storage running: {self.data_storage_running}")

        except Exception as e:
            print(f"Exception in keepalive message processor: {e}")

    def register_new_graph_data(self, graph_data: Dict[str, Any]):
        new_uuid = str(uuid4())
        with self.graph_hashmap_mutex:
            self.graph_hashmap[new_uuid] = graph_data
            self.graph_cycles_without_keepalive_hashmap[new_uuid] = 0
            self.graph_visible[new_uuid] = True

        return new_uuid

    def get_graph_data_for_id(self, uuid: str) -> Dict[str, Any]:
        with self.graph_hashmap_mutex:
            if uuid not in self.graph_hashmap:
                raise RuntimeError(f"No graph data under uuid {uuid}")
            return self.graph_hashmap[uuid]

    def delete_graph_data_for_id(self, uuid: str):
        with self.graph_hashmap_mutex:
            if uuid not in self.graph_hashmap:
                return

            self.graph_hashmap.pop(uuid)
            self.graph_cycles_without_keepalive_hashmap.pop(uuid, None)
            self.graph_visible.pop(uuid, None)

    @contextmanager
    def protect_sessions(self):
        """A synchronous worker cannot receive heartbeats while handling a request."""
        started_at = monotonic()
        with self.graph_hashmap_mutex:
            self.active_requests += 1
        try:
            yield
        finally:
            with self.graph_hashmap_mutex:
                self.active_requests -= 1
                if (
                    not self.active_requests
                    and monotonic() - started_at
                    >= self.keepalive_message_processor_sleep_time_s
                ):
                    for uuid in self.graph_cycles_without_keepalive_hashmap:
                        self.graph_cycles_without_keepalive_hashmap[uuid] = 0


class SessionProtectionMiddleware:
    """Keep protection active until a response stream finishes or is closed."""

    def __init__(self, app, storage):
        self.app = app
        self.storage = storage

    def __call__(self, environ, start_response):
        with self.storage.protect_sessions():
            response = self.app(environ, start_response)
            try:
                yield from response
            finally:
                if hasattr(response, "close"):
                    response.close()
