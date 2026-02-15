"""Factory for creating LLM provider instances from config."""

import logging
from ..config import Config, ProviderConfig
from .provider import BaseLLMProvider
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider

logger = logging.getLogger(__name__)

# Providers that use the OpenAI-compatible API
OPENAI_COMPATIBLE = {"openai", "openrouter", "groq", "deepseek", "zhipu", "gemini"}

# Known API bases for providers that need them
EXTRA_BASES = {
    "zhipu": "https://open.bigmodel.cn/api/paas/v4",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
}


def create_provider(config: Config) -> BaseLLMProvider:
    """Create the appropriate LLM provider based on config."""
    provider_name = config.agents.provider.lower()

    if provider_name not in config.providers:
        # Try to find any configured provider
        for name, pconfig in config.providers.items():
            if pconfig.api_key:
                provider_name = name
                logger.info("No explicit provider set, using '%s'", name)
                break
        else:
            raise ValueError(
                "No LLM provider configured. Set at least one provider API key "
                "in config.json or via environment variables."
            )

    pconfig: ProviderConfig = config.providers[provider_name]

    if not pconfig.api_key:
        raise ValueError(f"No API key configured for provider '{provider_name}'")

    model = pconfig.model_override or config.agents.model
    api_base = pconfig.api_base

    if provider_name == "anthropic":
        return AnthropicProvider(
            api_key=pconfig.api_key,
            api_base=api_base,
            model=model,
        )

    # Everything else goes through OpenAI-compatible
    if not api_base and provider_name in EXTRA_BASES:
        api_base = EXTRA_BASES[provider_name]

    return OpenAIProvider(
        api_key=pconfig.api_key,
        api_base=api_base,
        model=model,
        provider_name=provider_name,
    )
