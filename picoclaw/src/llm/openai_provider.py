"""OpenAI-compatible provider.

Works with OpenAI, OpenRouter, Groq, DeepSeek, and any other
API that follows the OpenAI chat completions format.
"""

import json
import logging
from openai import AsyncOpenAI
from .provider import BaseLLMProvider, Message, LLMResponse, ToolCall, ToolDefinition

logger = logging.getLogger(__name__)

# Default API bases for known providers
KNOWN_BASES = {
    "openai": "https://api.openai.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "groq": "https://api.groq.com/openai/v1",
    "deepseek": "https://api.deepseek.com/v1",
}

# Default models for known providers
DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "openrouter": "openai/gpt-4o-mini",
    "groq": "llama-3.3-70b-versatile",
    "deepseek": "deepseek-chat",
}


class OpenAIProvider(BaseLLMProvider):
    """Provider for OpenAI-compatible APIs."""

    def __init__(
        self, api_key: str, api_base: str = "", model: str = "", provider_name: str = "openai"
    ):
        self.provider_name = provider_name
        if not api_base:
            api_base = KNOWN_BASES.get(provider_name, KNOWN_BASES["openai"])
        if not model:
            model = DEFAULT_MODELS.get(provider_name, "gpt-4o-mini")

        super().__init__(api_key, api_base, model)
        self.client = AsyncOpenAI(api_key=api_key, base_url=api_base)

    async def chat(
        self,
        messages: list[Message],
        tools: list[ToolDefinition] = None,
        max_tokens: int = 8192,
        temperature: float = 0.7,
    ) -> LLMResponse:
        # Convert messages to OpenAI format
        oai_messages = []
        for msg in messages:
            m = {"role": msg.role, "content": msg.content}
            if msg.name:
                m["name"] = msg.name
            if msg.tool_call_id:
                m["tool_call_id"] = msg.tool_call_id
            oai_messages.append(m)

        kwargs = {
            "model": self.model,
            "messages": oai_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        # Add tools if provided
        if tools:
            oai_tools = []
            for t in tools:
                oai_tools.append(
                    {
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.parameters,
                        },
                    }
                )
            kwargs["tools"] = oai_tools

        try:
            response = await self.client.chat.completions.create(**kwargs)
        except Exception as e:
            logger.error("LLM API error (%s): %s", self.provider_name, e)
            return LLMResponse(content=f"Error calling LLM: {e}", finish_reason="error")

        choice = response.choices[0]
        result = LLMResponse(
            content=choice.message.content or "",
            finish_reason=choice.finish_reason or "",
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
            },
        )

        # Parse tool calls
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                result.tool_calls.append(
                    ToolCall(
                        id=tc.id,
                        name=tc.function.name,
                        arguments=tc.function.arguments,
                    )
                )

        return result

    async def close(self):
        await self.client.close()
