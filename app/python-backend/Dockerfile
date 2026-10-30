FROM tiagopeixoto/graph-tool:latest

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
COPY python-backend /app
COPY proto /proto

ENV VIRTUAL_ENV=/opt/.venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN uv venv $VIRTUAL_ENV --system-site-packages && \
    uv pip install -r requirements.txt

RUN mkdir -p /opt/generated-proto && \
    python -m grpc_tools.protoc \
        -I /proto \
        --python_out=/opt/generated-proto \
        --grpc_python_out=/opt/generated-proto \
        /proto/py_to_cpp_backend.proto

ENV PYTHONPATH="/opt/generated-proto:/app/src"
ENV PYTHONUNBUFFERED=1

WORKDIR /app/src

EXPOSE 30301 30302 30303 30304 30305

CMD ["sh", "-c", "exec gunicorn --workers ${GUNICORN_WORKERS:-1} --timeout ${GUNICORN_TIMEOUT:-1200} --bind ${SERVICE_IP_ADDRESS:-0.0.0.0}:${SERVICE_PORT:-30301} flask_layout_service:app"]
