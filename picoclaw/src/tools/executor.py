"""Tool executor for the agent loop.

Defines available tools and executes them when called by the LLM.
"""

import json
import logging
import asyncio
import subprocess
from ..llm.provider import ToolDefinition, ToolCall, Message
from ..tools.web_search import web_search

logger = logging.getLogger(__name__)


def get_tool_definitions(config) -> list[ToolDefinition]:
    """Return the list of tools available to the agent."""
    tools = [
        ToolDefinition(
            name="web_search",
            description="Search the web for current information. Use this when you need up-to-date data or don't know something.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query",
                    }
                },
                "required": ["query"],
            },
        ),
        ToolDefinition(
            name="remember",
            description="Save important information to long-term memory so you can recall it in future conversations.",
            parameters={
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "A short label for this memory (e.g. 'user_name', 'project_details')",
                    },
                    "value": {
                        "type": "string",
                        "description": "The information to remember",
                    },
                },
                "required": ["key", "value"],
            },
        ),
        ToolDefinition(
            name="recall_memory",
            description="Read your long-term memory to recall previously stored information.",
            parameters={
                "type": "object",
                "properties": {},
            },
        ),
    ]

    # Add shell tool if enabled
    if config.tools.shell_enabled:
        tools.append(
            ToolDefinition(
                name="run_command",
                description=(
                    "Run a shell command. Only allowed commands are permitted. "
                    "Use for system tasks the user has explicitly authorized."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "The shell command to execute",
                        }
                    },
                    "required": ["command"],
                },
            )
        )

    return tools


async def execute_tool(tool_call: ToolCall, config, memory_store) -> str:
    """Execute a tool call and return the result as a string."""
    try:
        args = json.loads(tool_call.arguments) if tool_call.arguments else {}
    except json.JSONDecodeError:
        return f"Error: invalid tool arguments: {tool_call.arguments}"

    name = tool_call.name

    if name == "web_search":
        query = args.get("query", "")
        if not query:
            return "Error: search query is required"
        return await web_search(
            query,
            engine=config.tools.web_search_engine,
            api_key=config.tools.web_search_api_key,
        )

    elif name == "remember":
        key = args.get("key", "")
        value = args.get("value", "")
        if not key or not value:
            return "Error: both key and value are required"
        memory_store.save_memory(key, value)
        return f"Remembered: {key}"

    elif name == "recall_memory":
        return memory_store.get_memory() or "No memories stored yet."

    elif name == "run_command":
        if not config.tools.shell_enabled:
            return "Error: shell commands are not enabled"
        command = args.get("command", "")
        if not command:
            return "Error: command is required"

        # Validate against allowlist
        allowed = config.tools.shell_allowed_commands
        if allowed:
            cmd_base = command.split()[0] if command.split() else ""
            if cmd_base not in allowed:
                return f"Error: command '{cmd_base}' is not in the allowed list: {allowed}"

        try:
            result = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: subprocess.run(
                        command,
                        shell=True,
                        capture_output=True,
                        text=True,
                        timeout=30,
                    ),
                ),
                timeout=35,
            )
            output = result.stdout
            if result.stderr:
                output += f"\nSTDERR: {result.stderr}"
            if result.returncode != 0:
                output += f"\n(exit code: {result.returncode})"
            return output[:4000] if output else "(no output)"
        except (subprocess.TimeoutExpired, asyncio.TimeoutError):
            return "Error: command timed out (30s limit)"
        except Exception as e:
            return f"Error executing command: {e}"

    else:
        return f"Error: unknown tool '{name}'"
