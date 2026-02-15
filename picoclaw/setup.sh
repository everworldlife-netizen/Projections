#!/bin/bash
set -e

echo "=== Midasbot Setup ==="

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo "[+] Created .env from template"
    echo "    Edit .env to add your API keys before starting:"
    echo "    nano .env"
    echo ""
    echo "    At minimum, set one of:"
    echo "      OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, etc."
    echo ""
    echo "    Then run this script again."
    exit 0
else
    echo "[+] .env file found"
fi

# Check that at least one API key is set
HAS_KEY=false
for key in OPENAI_API_KEY ANTHROPIC_API_KEY OPENROUTER_API_KEY GROQ_API_KEY DEEPSEEK_API_KEY; do
    val=$(grep "^${key}=" .env 2>/dev/null | cut -d= -f2-)
    if [ -n "$val" ]; then
        HAS_KEY=true
        break
    fi
done

if [ "$HAS_KEY" = false ]; then
    echo "[!] No API keys found in .env"
    echo "    Edit .env and set at least one provider API key."
    exit 1
fi

echo "[+] API key detected"

# Select mode
MODE="${1:-web}"
echo "[+] Starting in ${MODE} mode..."

case "$MODE" in
    gateway)
        docker compose --profile gateway up -d --build
        echo ""
        echo "=== Midasbot is running ==="
        PORT=$(grep "^GATEWAY_PORT=" .env 2>/dev/null | cut -d= -f2-)
        PORT="${PORT:-18791}"
        echo "Web UI: http://$(hostname -I | awk '{print $1}'):${PORT}"
        echo "Logs:   docker compose logs -f"
        echo "Stop:   docker compose --profile gateway down"
        ;;
    web)
        docker compose --profile web up -d --build
        echo ""
        echo "=== Midasbot Web UI is running ==="
        PORT=$(grep "^GATEWAY_PORT=" .env 2>/dev/null | cut -d= -f2-)
        PORT="${PORT:-18791}"
        echo "Web UI: http://$(hostname -I | awk '{print $1}'):${PORT}"
        echo "Logs:   docker compose logs -f"
        echo "Stop:   docker compose --profile web down"
        ;;
    agent)
        docker compose --profile agent run --rm assistant-agent
        ;;
    *)
        echo "Usage: ./setup.sh [gateway|web|agent]"
        echo "  gateway  - Full service (web UI + Telegram/Discord bots)"
        echo "  web      - Web UI only (default)"
        echo "  agent    - Interactive CLI"
        exit 1
        ;;
esac
