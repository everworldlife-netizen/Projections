"""LLM provider abstraction layer.

Supports OpenAI-compatible APIs (OpenAI, OpenRouter, Groq, DeepSeek),
and Anthropic's native API. All providers are accessed via their
official Python SDKs or standard HTTP.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class Message:
    role: str  # "system", "user", "assistant", "tool"
    content: str
    name: str = ""
    tool_call_id: str = ""


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str  # JSON string


@dataclass
class LLMResponse:
    content: str = ""
    tool_calls: list = None
    finish_reason: str = ""
    usage: dict = None

    def __post_init__(self):
        if self.tool_calls is None:
            self.tool_calls = []
        if self.usage is None:
            self.usage = {}


# Tool definition schema matching OpenAI function calling format
@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: dict  # JSON Schema


class BaseLLMProvider(ABC):
    """Base class for LLM providers."""

    def __init__(self, api_key: str, api_base: str = "", model: str = ""):
        self.api_key = api_key
        self.api_base = api_base
        self.model = model

    @abstractmethod
    async def chat(
        self,
        messages: list[Message],
        tools: list[ToolDefinition] = None,
        max_tokens: int = 8192,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """Send a chat completion request."""
        ...

    @abstractmethod
    async def close(self):
        """Clean up resources."""
        ...
