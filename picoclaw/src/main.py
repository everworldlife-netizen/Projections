"""Main entry point for the assistant.

Supports three modes:
  - gateway: Long-running service connecting to chat platforms (Telegram, Discord)
  - web:     Web command center with real-time chat UI
  - agent:   Interactive CLI for one-shot or conversational use
"""

import asyncio
import argparse
import logging
import signal
import sys
import uuid

from .config import load_config
from .agent import Agent
from .channels.telegram import TelegramChannel
from .channels.discord_bot import DiscordChannel
from .scheduler.cron import TaskScheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


async def run_gateway(config_path: str = None):
    """Run in gateway mode: connect to configured chat platforms + web UI."""
    config = load_config(config_path)
    agent = Agent(config)
    channels = []
    scheduler = TaskScheduler(agent, config)

    # Start Telegram if configured
    if config.channels.telegram.enabled and config.channels.telegram.token:
        tg = TelegramChannel(
            token=config.channels.telegram.token,
            agent=agent,
            allow_from=config.channels.telegram.allow_from,
        )
        channels.append(tg)
        await tg.start()

    # Start Discord if configured
    if config.channels.discord.enabled and config.channels.discord.token:
        dc = DiscordChannel(
            token=config.channels.discord.token,
            agent=agent,
            allow_from=config.channels.discord.allow_from,
        )
        channels.append(dc)
        asyncio.create_task(dc.start())

    # Start web UI
    import uvicorn
    from .web.server import create_app

    app = create_app(agent, config)
    web_config = uvicorn.Config(
        app,
        host=config.gateway.host,
        port=config.gateway.port,
        log_level="info",
    )
    server = uvicorn.Server(web_config)
    web_task = asyncio.create_task(server.serve())

    logger.info(
        "Gateway running: %d bot channel(s) + web UI on http://%s:%d",
        len(channels),
        config.gateway.host,
        config.gateway.port,
    )

    # Start scheduler
    scheduler.start()

    # Wait for shutdown signal
    stop_event = asyncio.Event()

    def _signal_handler():
        stop_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _signal_handler)

    await stop_event.wait()

    # Cleanup
    logger.info("Shutting down...")
    scheduler.stop()
    server.should_exit = True
    await web_task
    for ch in channels:
        await ch.stop()
    await agent.close()
    logger.info("Goodbye!")


def run_web(config_path: str = None):
    """Run web command center only (no bot channels)."""
    import uvicorn
    from .web.server import create_app

    config = load_config(config_path)
    agent = Agent(config)
    app = create_app(agent, config)

    logger.info(
        "Web Command Center starting on http://%s:%d",
        config.gateway.host,
        config.gateway.port,
    )

    uvicorn.run(
        app,
        host=config.gateway.host,
        port=config.gateway.port,
        log_level="info",
    )


async def run_agent_cli(config_path: str = None):
    """Run in interactive CLI mode."""
    config = load_config(config_path)
    agent = Agent(config)
    session_id = f"cli-{uuid.uuid4().hex[:8]}"

    print("Personal AI Assistant (type 'quit' to exit, '/reset' to clear session)")
    print(f"Provider: {config.agents.provider} | Model: {config.agents.model}")
    print("-" * 60)

    try:
        while True:
            try:
                user_input = input("\nYou: ").strip()
            except EOFError:
                break

            if not user_input:
                continue
            if user_input.lower() in ("quit", "exit", "/quit"):
                break
            if user_input.lower() == "/reset":
                if session_id in agent.sessions:
                    del agent.sessions[session_id]
                session_id = f"cli-{uuid.uuid4().hex[:8]}"
                print("Session cleared!")
                continue

            response = await agent.chat(session_id, user_input)
            print(f"\nAssistant: {response}")
    except KeyboardInterrupt:
        print("\n")
    finally:
        await agent.close()
        print("Goodbye!")


def main():
    parser = argparse.ArgumentParser(description="Personal AI Assistant")
    parser.add_argument(
        "mode",
        nargs="?",
        default="web",
        choices=["gateway", "web", "agent"],
        help="Run mode: 'gateway' for full service, 'web' for web UI only, 'agent' for CLI (default: web)",
    )
    parser.add_argument(
        "--config",
        "-c",
        default=None,
        help="Path to config.json file",
    )
    args = parser.parse_args()

    if args.mode == "gateway":
        asyncio.run(run_gateway(args.config))
    elif args.mode == "web":
        run_web(args.config)
    else:
        asyncio.run(run_agent_cli(args.config))


if __name__ == "__main__":
    main()
