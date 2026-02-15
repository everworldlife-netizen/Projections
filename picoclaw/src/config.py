"""Configuration loader for the assistant.

Reads config.json and merges environment variable overrides.
"""

import json
import os
import logging
from pathlib import Path
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = os.path.expanduser("~/.picoclaw/config.json")
FALLBACK_CONFIG_PATH = "/app/config/config.json"


@dataclass
class AgentDefaults:
    workspace: str = "~/.picoclaw/workspace"
    model: str = "gpt-4o-mini"
    provider: str = "openai"
    max_tokens: int = 8192
    temperature: float = 0.7
    max_tool_iterations: int = 20
    system_prompt: str = ""


@dataclass
class ProviderConfig:
    api_key: str = ""
    api_base: str = ""
    model_override: str = ""


@dataclass
class TelegramConfig:
    enabled: bool = False
    token: str = ""
    allow_from: list = field(default_factory=list)


@dataclass
class DiscordConfig:
    enabled: bool = False
    token: str = ""
    allow_from: list = field(default_factory=list)


@dataclass
class ChannelsConfig:
    telegram: TelegramConfig = field(default_factory=TelegramConfig)
    discord: DiscordConfig = field(default_factory=DiscordConfig)


@dataclass
class ToolsConfig:
    web_search_api_key: str = ""
    web_search_engine: str = "duckduckgo"
    shell_enabled: bool = False
    shell_allowed_commands: list = field(default_factory=list)


@dataclass
class GatewayConfig:
    host: str = "0.0.0.0"
    port: int = 18791


@dataclass
class SchedulerConfig:
    heartbeat_interval_minutes: int = 30
    enabled: bool = True


@dataclass
class Config:
    agents: AgentDefaults = field(default_factory=AgentDefaults)
    providers: dict = field(default_factory=dict)
    channels: ChannelsConfig = field(default_factory=ChannelsConfig)
    tools: ToolsConfig = field(default_factory=ToolsConfig)
    gateway: GatewayConfig = field(default_factory=GatewayConfig)
    scheduler: SchedulerConfig = field(default_factory=SchedulerConfig)


def _merge_env_overrides(config: Config) -> Config:
    """Override config values with environment variables."""
    env_map = {
        "OPENAI_API_KEY": ("providers", "openai", "api_key"),
        "ANTHROPIC_API_KEY": ("providers", "anthropic", "api_key"),
        "OPENROUTER_API_KEY": ("providers", "openrouter", "api_key"),
        "GROQ_API_KEY": ("providers", "groq", "api_key"),
        "DEEPSEEK_API_KEY": ("providers", "deepseek", "api_key"),
        "TELEGRAM_BOT_TOKEN": ("channels", "telegram", "token"),
        "DISCORD_BOT_TOKEN": ("channels", "discord", "token"),
        "WEB_SEARCH_API_KEY": ("tools", "web_search_api_key"),
        "LLM_MODEL": ("agents", "model"),
        "LLM_PROVIDER": ("agents", "provider"),
    }

    for env_var, path in env_map.items():
        value = os.environ.get(env_var)
        if value is None:
            continue

        if path[0] == "providers":
            provider_name = path[1]
            attr = path[2]
            if provider_name not in config.providers:
                config.providers[provider_name] = ProviderConfig()
            setattr(config.providers[provider_name], attr, value)
        elif path[0] == "channels":
            channel = getattr(config.channels, path[1])
            setattr(channel, path[2], value)
            if path[2] == "token" and value:
                channel.enabled = True
        elif path[0] == "tools":
            setattr(config.tools, path[1], value)
        elif path[0] == "agents":
            setattr(config.agents, path[1], value)

    return config


def _parse_provider(name: str, data: dict) -> ProviderConfig:
    return ProviderConfig(
        api_key=data.get("api_key", ""),
        api_base=data.get("api_base", ""),
        model_override=data.get("model", ""),
    )


def _parse_channel_list(data) -> list:
    if isinstance(data, list):
        return [str(x) for x in data]
    return []


def load_config(path: str = None) -> Config:
    """Load configuration from JSON file with env overrides."""
    if path is None:
        if os.path.exists(DEFAULT_CONFIG_PATH):
            path = DEFAULT_CONFIG_PATH
        elif os.path.exists(FALLBACK_CONFIG_PATH):
            path = FALLBACK_CONFIG_PATH
        else:
            logger.warning("No config.json found, using defaults + env vars")
            config = Config()
            return _merge_env_overrides(config)

    if not os.path.exists(path):
        logger.warning("Config file %s not found, using defaults + env vars", path)
        config = Config()
        return _merge_env_overrides(config)

    logger.info("Loading config from %s", path)
    with open(path) as f:
        raw = json.load(f)

    config = Config()

    # Parse agents
    agents_raw = raw.get("agents", {}).get("defaults", {})
    for key in ("workspace", "model", "provider", "system_prompt"):
        if key in agents_raw:
            setattr(config.agents, key, agents_raw[key])
    for key in ("max_tokens", "max_tool_iterations"):
        if key in agents_raw:
            setattr(config.agents, key, int(agents_raw[key]))
    if "temperature" in agents_raw:
        config.agents.temperature = float(agents_raw["temperature"])

    # Parse providers
    for name, pdata in raw.get("providers", {}).items():
        config.providers[name] = _parse_provider(name, pdata)

    # Parse channels
    channels_raw = raw.get("channels", {})
    if "telegram" in channels_raw:
        tg = channels_raw["telegram"]
        config.channels.telegram = TelegramConfig(
            enabled=tg.get("enabled", False),
            token=tg.get("token", ""),
            allow_from=_parse_channel_list(tg.get("allowFrom", [])),
        )
    if "discord" in channels_raw:
        dc = channels_raw["discord"]
        config.channels.discord = DiscordConfig(
            enabled=dc.get("enabled", False),
            token=dc.get("token", ""),
            allow_from=_parse_channel_list(dc.get("allowFrom", [])),
        )

    # Parse tools
    tools_raw = raw.get("tools", {})
    if "web_search" in tools_raw:
        ws = tools_raw["web_search"]
        config.tools.web_search_api_key = ws.get("api_key", "")
        config.tools.web_search_engine = ws.get("engine", "duckduckgo")
    if "shell" in tools_raw:
        sh = tools_raw["shell"]
        config.tools.shell_enabled = sh.get("enabled", False)
        config.tools.shell_allowed_commands = sh.get("allowed_commands", [])

    # Parse gateway
    gw_raw = raw.get("gateway", {})
    if "host" in gw_raw:
        config.gateway.host = gw_raw["host"]
    if "port" in gw_raw:
        config.gateway.port = int(gw_raw["port"])

    # Parse scheduler
    sched_raw = raw.get("scheduler", {})
    if "heartbeat_interval_minutes" in sched_raw:
        config.scheduler.heartbeat_interval_minutes = int(
            sched_raw["heartbeat_interval_minutes"]
        )
    if "enabled" in sched_raw:
        config.scheduler.enabled = sched_raw["enabled"]

    return _merge_env_overrides(config)
