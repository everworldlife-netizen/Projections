FROM python:3.12-slim

# Minimal metadata
LABEL maintainer="self-hosted"
LABEL description="Personal AI Assistant - clean-room implementation"

# Don't buffer Python output
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ src/

# Create default workspace directory
RUN mkdir -p /app/workspace/memory /app/workspace/sessions \
    /app/workspace/skills /app/workspace/state /app/workspace/cron

# Default config location
ENV CONFIG_PATH=/app/config/config.json

ENTRYPOINT ["python", "-m", "src.main"]
CMD ["gateway", "--config", "/app/config/config.json"]
