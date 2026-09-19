FROM python:3.13-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
WORKDIR /bootstrap

COPY mound-live-deploy/archive.correct00a /bootstrap/archive.correct00a
COPY mound-live-deploy/archive.correct00b /bootstrap/archive.correct00b
COPY mound-live-deploy/archive.part01 /bootstrap/archive.part01
COPY mound-live-deploy/archive.part02 /bootstrap/archive.part02
COPY mound-live-deploy/archive.part04 /bootstrap/archive.part04

RUN python - <<'PY'
from pathlib import Path
import base64, tarfile, zlib

parts = [
    Path('/bootstrap/archive.correct00a'),
    Path('/bootstrap/archive.correct00b'),
    Path('/bootstrap/archive.part01'),
    Path('/bootstrap/archive.part02'),
    Path('/bootstrap/archive.part04'),
]
payload = ''.join(p.read_text().strip() for p in parts).encode()
assert len(payload) == 49844, f'unexpected payload length: {len(payload)}'
assert (zlib.crc32(payload) & 0xffffffff) == 0xb5fd6148, 'Mound payload checksum mismatch'
archive = Path('/bootstrap/mound-runtime.tgz')
archive.write_bytes(base64.b64decode(payload, validate=True))
with tarfile.open(archive, 'r:gz') as tf:
    tf.extractall('/app')
PY

WORKDIR /app/mound-live
RUN pip install --no-cache-dir -r requirements.txt  && groupadd --gid 10001 mound  && useradd --uid 10001 --gid 10001 --no-create-home mound  && mkdir -p /app/data  && chown -R 10001:10001 /app/data  && rm -rf /bootstrap

USER 10001:10001
ENV DATA_DIR=/app/data POLL_SECONDS=5 COLLECT=1
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz',timeout=3).read()"
CMD ["python","-m","uvicorn","app.main:factory","--factory","--host","0.0.0.0","--port","8000","--workers","1","--no-access-log"]
