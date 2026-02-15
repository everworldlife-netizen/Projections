"""Anthropic Claude provider.

Uses the official Anthropic Python SDK for Claude models.
"""

import json
import logging
from anthropic import AsyncAnthropic
from .provider import BaseLLMProvider, Message, LLMResponse, ToolCall, ToolDefinition

logger = logging.getLogger(__name__)


class AnthropicProvider(BaseLLMProvider):
    """Provider for Anthropic's Claude API."""

    def __init__(self, api_key: str, api_base: str = "", model: str = ""):
        if not model:
            model = "claude-sonnet-4-20250514"
        super().__init__(api_key, api_base, model)
        kwargs = {"api_key": api_key}
        if api_base:
            kwargs["base_url"] = api_base
        self.client = AsyncAnthropic(**kwargs)

    async def chat(
        self,
        messages: list[Message],
        tools: list[ToolDefinition] = None,
        max_tokens: int = 8192,
        temperature: float = 0.7,
    ) -> LLMResponse:
        # Separate system message from conversation
        system_text = ""
        conversation = []
        for msg in messages:
            if msg.role == "system":
                system_text += msg.content + "\n"
            elif msg.role == "tool":
                conversation.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": msg.tool_call_id,
                                "content": msg.content,
                            }
                        ],
                    }
                )
            else:
                conversation.append({"role": msg.role, "content": msg.content})

        if not conversation:
            conversation = [{"role": "user", "content": "Hello"}]

        kwargs = {
            "model": self.model,
            "messages": conversation,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system_text.strip():
            kwargs["system"] = system_text.strip()

        # Add tools
        if tools:
            ant_tools = []
            for t in tools:
                ant_tools.append(
                    {
                        "name": t.name,
                        "description": t.description,
                        "input_schema": t.parameters,
                    }
                )
            kwargs["tools"] = ant_tools

        try:
            response = await self.client.messages.create(**kwargs)
        except Exception as e:
            logger.error("Anthropic API error: %s", e)
            return LLMResponse(content=f"Error calling LLM: {e}", finish_reason="error")

        content_text = ""
        tool_calls = []

        for block in response.content:
            if block.type == "text":
                content_text += block.text
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCall(
                        id=block.id,
                        name=block.name,
                        arguments=json.dumps(block.input),
                    )
                )

        return LLMResponse(
            content=content_text,
            tool_calls=tool_calls,
            finish_reason=response.stop_reason or "",
            usage={
                "prompt_tokens": response.usage.input_tokens,
                "completion_tokens": response.usage.output_tokens,
            },
        )

    async def close(self):
        await self.client.close()
