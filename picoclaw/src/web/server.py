"""FastAPI web server with WebSocket chat and REST API.

Serves the premium command center UI and handles real-time chat
via WebSocket, plus REST endpoints for sessions, memory, and settings.
"""

import json
import logging
import uuid
import asyncio
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from ..agent import Agent
from ..config import Config

logger = logging.getLogger(__name__)


def create_app(agent: Agent, config: Config) -> FastAPI:
    app = FastAPI(title="AI Command Center")

    public_dir = Path(__file__).parent.parent.parent / "public"

    # --- WebSocket chat ---
    @app.websocket("/ws/chat")
    async def websocket_chat(ws: WebSocket):
        await ws.accept()
        session_id = None
        try:
            while True:
                data = json.loads(await ws.receive_text())
                msg_type = data.get("type", "message")

                if msg_type == "init":
                    session_id = data.get("session_id") or f"web-{uuid.uuid4().hex[:8]}"
                    await ws.send_json({"type": "session", "session_id": session_id})
                    # Send existing history
                    history = agent._get_session(session_id)
                    msgs = [
                        {"role": m.role, "content": m.content}
                        for m in history
                        if m.role in ("user", "assistant")
                    ]
                    await ws.send_json({"type": "history", "messages": msgs})
                    continue

                if msg_type == "message":
                    text = data.get("content", "").strip()
                    if not text:
                        continue
                    if not session_id:
                        session_id = f"web-{uuid.uuid4().hex[:8]}"

                    # Acknowledge receipt
                    await ws.send_json({"type": "ack", "session_id": session_id})
                    # Stream typing indicator
                    await ws.send_json({"type": "typing", "active": True})

                    try:
                        response = await agent.chat(session_id, text)
                        await ws.send_json({"type": "typing", "active": False})
                        await ws.send_json({
                            "type": "response",
                            "content": response or "(No response)",
                            "session_id": session_id,
                        })
                    except Exception as e:
                        logger.error("Chat error: %s", e)
                        await ws.send_json({"type": "typing", "active": False})
                        await ws.send_json({
                            "type": "error",
                            "content": f"Error: {e}",
                        })

                if msg_type == "reset":
                    if session_id and session_id in agent.sessions:
                        del agent.sessions[session_id]
                    session_id = f"web-{uuid.uuid4().hex[:8]}"
                    await ws.send_json({"type": "session", "session_id": session_id})
                    await ws.send_json({"type": "history", "messages": []})

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected: %s", session_id)

    # --- REST API ---

    @app.get("/api/sessions")
    async def list_sessions():
        sessions = agent.memory.list_sessions()
        result = []
        for sid in sessions[:50]:
            history = agent.memory.load_session(sid)
            # Find first user message as title
            title = "New Chat"
            for m in history:
                if m.get("role") == "user" and m.get("content"):
                    title = m["content"][:60]
                    break
            msg_count = len([m for m in history if m.get("role") in ("user", "assistant")])
            result.append({"id": sid, "title": title, "messages": msg_count})
        return result

    @app.delete("/api/sessions/{session_id}")
    async def delete_session(session_id: str):
        if session_id in agent.sessions:
            del agent.sessions[session_id]
        session_file = agent.memory.sessions_dir / f"{session_id}.json"
        if session_file.exists():
            session_file.unlink()
        return {"ok": True}

    @app.get("/api/memory")
    async def get_memory():
        return {"content": agent.memory.get_memory()}

    @app.get("/api/config/providers")
    async def get_providers():
        providers = []
        for name, pcfg in config.providers.items():
            has_key = bool(pcfg.api_key and not pcfg.api_key.startswith("YOUR_"))
            providers.append({
                "name": name,
                "configured": has_key,
                "model": pcfg.model_override or "",
            })
        return providers

    @app.get("/api/config/current")
    async def get_current_config():
        return {
            "provider": config.agents.provider,
            "model": config.agents.model,
            "temperature": config.agents.temperature,
            "max_tokens": config.agents.max_tokens,
        }

    @app.get("/api/status")
    async def get_status():
        active_sessions = len(agent.sessions)
        return {
            "status": "online",
            "provider": config.agents.provider,
            "model": config.agents.model,
            "active_sessions": active_sessions,
            "channels": {
                "telegram": config.channels.telegram.enabled,
                "discord": config.channels.discord.enabled,
                "web": True,
            },
        }

    # --- Static files ---

    @app.get("/")
    async def root():
        return FileResponse(public_dir / "index.html")

    app.mount("/", StaticFiles(directory=str(public_dir)), name="static")

    return app
