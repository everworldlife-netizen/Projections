"""Core agent loop.

Manages the conversation flow: receives a user message, builds context,
calls the LLM, executes any tool calls, and returns the final response.
"""

import json
import logging
import uuid
from .config import Config
from .llm.provider import BaseLLMProvider, Message
from .llm.factory import create_provider
from .memory.store import MemoryStore
from .tools.executor import get_tool_definitions, execute_tool

logger = logging.getLogger(__name__)


class Agent:
    """Conversational agent with tool use and memory."""

    def __init__(self, config: Config):
        self.config = config
        self.provider: BaseLLMProvider = create_provider(config)
        self.memory = MemoryStore(config.agents.workspace)
        self.tool_defs = get_tool_definitions(config)
        self.sessions: dict[str, list[Message]] = {}

    def _get_session(self, session_id: str) -> list[Message]:
        """Get or create a session's message history."""
        if session_id not in self.sessions:
            # Try to load from disk
            saved = self.memory.load_session(session_id)
            if saved:
                self.sessions[session_id] = [
                    Message(**m) for m in saved
                ]
            else:
                self.sessions[session_id] = []
        return self.sessions[session_id]

    def _build_messages(self, session_id: str) -> list[Message]:
        """Build the full message list with system context."""
        messages = []

        # System prompt from workspace files + config
        system_context = self.memory.get_system_context()
        if self.config.agents.system_prompt:
            system_context = self.config.agents.system_prompt + "\n\n" + system_context
        messages.append(Message(role="system", content=system_context))

        # Conversation history (keep last N messages to stay within context)
        history = self._get_session(session_id)
        max_history = 50
        messages.extend(history[-max_history:])

        return messages

    async def chat(self, session_id: str, user_message: str) -> str:
        """Process a user message and return the agent's response."""
        history = self._get_session(session_id)
        history.append(Message(role="user", content=user_message))

        messages = self._build_messages(session_id)
        iterations = 0
        max_iterations = self.config.agents.max_tool_iterations

        while iterations < max_iterations:
            iterations += 1

            response = await self.provider.chat(
                messages=messages,
                tools=self.tool_defs if self.tool_defs else None,
                max_tokens=self.config.agents.max_tokens,
                temperature=self.config.agents.temperature,
            )

            # If no tool calls, we're done
            if not response.tool_calls:
                if response.content:
                    history.append(Message(role="assistant", content=response.content))
                    self._persist_session(session_id)
                return response.content

            # Process tool calls
            # First, add the assistant's response (with tool calls) to history
            history.append(Message(role="assistant", content=response.content))
            messages.append(Message(role="assistant", content=response.content))

            for tc in response.tool_calls:
                logger.info("Tool call: %s(%s)", tc.name, tc.arguments[:200])
                result = await execute_tool(tc, self.config, self.memory)
                logger.info("Tool result: %s", result[:200])

                tool_msg = Message(
                    role="tool",
                    content=result,
                    tool_call_id=tc.id,
                    name=tc.name,
                )
                history.append(tool_msg)
                messages.append(tool_msg)

        # Ran out of iterations
        final = response.content if response.content else "(Reached maximum tool iterations)"
        history.append(Message(role="assistant", content=final))
        self._persist_session(session_id)
        return final

    def _persist_session(self, session_id: str):
        """Save session to disk."""
        history = self.sessions.get(session_id, [])
        serialized = [
            {
                "role": m.role,
                "content": m.content,
                "name": m.name,
                "tool_call_id": m.tool_call_id,
            }
            for m in history
        ]
        self.memory.save_session(session_id, serialized)

    async def process_heartbeat(self) -> str | None:
        """Process HEARTBEAT.md tasks if any exist."""
        tasks = self.memory.get_heartbeat_tasks()
        if not tasks or tasks.startswith("# Heartbeat"):
            return None

        logger.info("Processing heartbeat tasks")
        session_id = f"heartbeat-{uuid.uuid4().hex[:8]}"
        prompt = (
            f"The following tasks are from your HEARTBEAT.md file. "
            f"Execute them as instructed:\n\n{tasks}"
        )
        return await self.chat(session_id, prompt)

    async def close(self):
        """Clean up resources."""
        await self.provider.close()
