# build context = repo ROOT (the Ai server imports api/pb via a replace directive)
FROM golang:1-alpine AS gobuild
WORKDIR /build
# go.mod/go.sum first (api/'s replace target only needs its go.mod present,
# not full source, to resolve) so `go mod download` is its own cached Docker
# layer - unchanged deps don't redownload just because app source changed.
# (This is ordinary Docker layer caching, not a BuildKit cache mount - the
# box doesn't have docker-buildx-plugin installed, confirmed live, so
# --mount=type=cache isn't usable here without installing that first.)
COPY api/go.mod api/go.sum api/
COPY ai/go.mod ai/go.sum ai/
WORKDIR /build/ai
RUN go mod download
WORKDIR /build
COPY api/ api/
COPY ai/ ai/
# ai/go.mod has: replace .../api => ../api  -> resolves to /build/api
WORKDIR /build/ai
RUN CGO_ENABLED=0 go build -o /out/ai ./cmd/ai

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=gobuild /out/ai /usr/local/bin/ai
COPY ai/python/requirements.txt python/
# torch installed separately, pinned to the CPU-only wheel index, BEFORE the
# rest of requirements.txt: a per-line `--index-url` inside requirements.txt
# does not reliably win when sentence-transformers also pulls in torch as a
# transitive dependency in the same resolve - confirmed the hard way (a
# previous fix that looked correct in local testing on macOS/arm64, which
# has no CUDA wheels to begin with regardless of index, still pulled the
# full CUDA build here on the real linux/amd64 target and overflowed disk).
# Installing torch on its own first means it's already satisfied by the time
# sentence-transformers is resolved, so nothing pulls the CUDA variant in.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch && \
    pip install --no-cache-dir -r python/requirements.txt
COPY ai/python/app.py ai/python/embeddings.py ai/python/gdelt.py ai/python/landcover.py python/

# start.sh: rag sidecar (:8003) first, then the Go gRPC server (:8002)
RUN printf '#!/bin/sh\nset -e\nuvicorn app:app --app-dir python --host 127.0.0.1 --port 8003 &\nexec ai\n' > start.sh && chmod +x start.sh

EXPOSE 8002 8081
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD curl -fsS http://localhost:8081/healthz || exit 1
CMD ["./start.sh"]
