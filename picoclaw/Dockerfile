FROM python:3.12-slim

LABEL maintainer="self-hosted"
LABEL description="Midasbot - Personal AI Assistant"

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code and static assets
COPY src/ src/
COPY public/ public/

# Create workspace directories and copy seed files
RUN mkdir -p /app/workspace/memory /app/workspace/sessions \
    /app/workspace/skills /app/workspace/state /app/workspace/cron
COPY workspace/IDENTITY.md workspace/SOUL.md workspace/HEARTBEAT.md /app/workspace/

# Web UI port
EXPOSE 18791

ENTRYPOINT ["python", "-m", "src.main"]
CMD ["web"]
