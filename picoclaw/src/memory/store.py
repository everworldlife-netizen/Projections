"""Persistent memory and session management.

Stores long-term memory in MEMORY.md, session history in JSON files,
and agent identity/behavior in markdown files within the workspace.
"""

import json
import logging
import os
import time
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)


class MemoryStore:
    """Manages workspace persistence: memory, sessions, identity."""

    def __init__(self, workspace_path: str):
        self.workspace = Path(os.path.expanduser(workspace_path))
        self.memory_dir = self.workspace / "memory"
        self.sessions_dir = self.workspace / "sessions"
        self.state_dir = self.workspace / "state"
        self.skills_dir = self.workspace / "skills"

        # Ensure directories exist
        for d in (self.memory_dir, self.sessions_dir, self.state_dir, self.skills_dir):
            d.mkdir(parents=True, exist_ok=True)

        # Core files
        self.memory_file = self.memory_dir / "MEMORY.md"
        self.identity_file = self.workspace / "IDENTITY.md"
        self.soul_file = self.workspace / "SOUL.md"
        self.heartbeat_file = self.workspace / "HEARTBEAT.md"

        self._init_defaults()

    def _init_defaults(self):
        """Create default workspace files if they don't exist."""
        if not self.memory_file.exists():
            self.memory_file.write_text("# Memory\n\nNo memories stored yet.\n")

        if not self.identity_file.exists():
            self.identity_file.write_text(
                "# Identity\n\n"
                "You are a helpful personal AI assistant. "
                "You are concise, accurate, and friendly.\n"
            )

        if not self.soul_file.exists():
            self.soul_file.write_text(
                "# Soul\n\n"
                "Core values: helpfulness, honesty, harmlessness.\n"
                "Communication style: clear, concise, conversational.\n"
            )

    def get_system_context(self) -> str:
        """Build the system prompt from workspace files."""
        parts = []

        # Identity
        if self.identity_file.exists():
            parts.append(self.identity_file.read_text().strip())

        # Soul
        if self.soul_file.exists():
            parts.append(self.soul_file.read_text().strip())

        # Memory
        if self.memory_file.exists():
            memory_text = self.memory_file.read_text().strip()
            if memory_text and memory_text != "# Memory\n\nNo memories stored yet.":
                parts.append(f"## Long-term Memory\n\n{memory_text}")

        # Skills
        skills = self.list_skills()
        if skills:
            skill_text = "## Available Skills\n\n"
            for skill_name, skill_desc in skills:
                skill_text += f"- **{skill_name}**: {skill_desc}\n"
            parts.append(skill_text)

        return "\n\n---\n\n".join(parts)

    def save_memory(self, key: str, value: str):
        """Add or update a memory entry."""
        current = self.memory_file.read_text() if self.memory_file.exists() else "# Memory\n\n"

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        entry = f"\n## {key}\n*Saved: {timestamp}*\n\n{value}\n"

        # Replace existing entry with same key, or append
        marker = f"## {key}\n"
        if marker in current:
            # Find and replace the section
            start = current.index(marker)
            # Find next section or end of file
            rest = current[start + len(marker) :]
            next_section = rest.find("\n## ")
            if next_section >= 0:
                end = start + len(marker) + next_section
                current = current[:start] + entry.strip() + "\n" + current[end:]
            else:
                current = current[:start] + entry.strip() + "\n"
        else:
            current = current.rstrip() + "\n" + entry

        self.memory_file.write_text(current)
        logger.info("Memory saved: %s", key)

    def get_memory(self) -> str:
        """Read all memories."""
        if self.memory_file.exists():
            return self.memory_file.read_text()
        return ""

    def save_session(self, session_id: str, messages: list[dict]):
        """Persist a conversation session."""
        session_file = self.sessions_dir / f"{session_id}.json"
        session_file.write_text(json.dumps(messages, indent=2, ensure_ascii=False))

    def load_session(self, session_id: str) -> list[dict]:
        """Load a previous conversation session."""
        session_file = self.sessions_dir / f"{session_id}.json"
        if session_file.exists():
            return json.loads(session_file.read_text())
        return []

    def list_sessions(self) -> list[str]:
        """List available session IDs."""
        return sorted(
            [f.stem for f in self.sessions_dir.glob("*.json")],
            key=lambda x: os.path.getmtime(self.sessions_dir / f"{x}.json"),
            reverse=True,
        )

    def list_skills(self) -> list[tuple[str, str]]:
        """List available skills (name, first-line description)."""
        skills = []
        for f in self.skills_dir.glob("*.md"):
            text = f.read_text().strip()
            first_line = text.split("\n")[0].lstrip("# ").strip() if text else f.stem
            skills.append((f.stem, first_line))
        return skills

    def get_heartbeat_tasks(self) -> str:
        """Read the HEARTBEAT.md file for periodic tasks."""
        if self.heartbeat_file.exists():
            return self.heartbeat_file.read_text().strip()
        return ""

    def save_state(self, key: str, value: str):
        """Save a state value."""
        state_file = self.state_dir / f"{key}.txt"
        state_file.write_text(value)

    def load_state(self, key: str, default: str = "") -> str:
        """Load a state value."""
        state_file = self.state_dir / f"{key}.txt"
        if state_file.exists():
            return state_file.read_text().strip()
        return default
