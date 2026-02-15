"""Telegram bot channel.

Uses python-telegram-bot with long polling (no webhook needed).
Supports text messages and optional voice transcription via Groq Whisper.
"""

import logging
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

logger = logging.getLogger(__name__)


class TelegramChannel:
    """Telegram bot integration."""

    def __init__(self, token: str, agent, allow_from: list[str] = None):
        self.token = token
        self.agent = agent
        self.allow_from = set(allow_from) if allow_from else None
        self.app = None

    def _is_allowed(self, update: Update) -> bool:
        """Check if the user is allowed to interact."""
        if not self.allow_from:
            return True

        user = update.effective_user
        if not user:
            return False

        user_id = str(user.id)
        username = user.username or ""

        return user_id in self.allow_from or username in self.allow_from

    def _session_id(self, update: Update) -> str:
        """Generate a session ID from the chat."""
        chat_id = update.effective_chat.id
        return f"telegram-{chat_id}"

    async def _handle_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command."""
        if not self._is_allowed(update):
            await update.message.reply_text("Access denied.")
            return
        await update.message.reply_text(
            "Hello! I'm your personal AI assistant. Send me a message to chat."
        )

    async def _handle_reset(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /reset command to clear session."""
        if not self._is_allowed(update):
            return
        session_id = self._session_id(update)
        if session_id in self.agent.sessions:
            del self.agent.sessions[session_id]
        await update.message.reply_text("Session cleared. Starting fresh!")

    async def _handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle incoming text messages."""
        if not self._is_allowed(update):
            await update.message.reply_text("Access denied.")
            return

        user_text = update.message.text
        if not user_text:
            return

        session_id = self._session_id(update)

        # Send typing indicator
        await update.effective_chat.send_action("typing")

        try:
            response = await self.agent.chat(session_id, user_text)
            if response:
                # Telegram has a 4096 char limit per message
                for i in range(0, len(response), 4000):
                    chunk = response[i : i + 4000]
                    await update.message.reply_text(
                        chunk, parse_mode="Markdown"
                    )
            else:
                await update.message.reply_text("(No response generated)")
        except Exception as e:
            logger.error("Error handling Telegram message: %s", e)
            await update.message.reply_text(f"Sorry, an error occurred: {e}")

    async def _handle_voice(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle voice messages (transcription requires Groq config)."""
        if not self._is_allowed(update):
            return

        # Check if Groq is configured for voice transcription
        groq_config = self.agent.config.providers.get("groq")
        if not groq_config or not groq_config.api_key:
            await update.message.reply_text(
                "Voice messages require a Groq API key for Whisper transcription. "
                "Add a 'groq' provider to your config.json."
            )
            return

        await update.effective_chat.send_action("typing")

        try:
            import httpx
            import tempfile
            import os

            # Download the voice file
            voice = update.message.voice
            file = await context.bot.get_file(voice.file_id)
            with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
                await file.download_to_drive(tmp.name)
                tmp_path = tmp.name

            # Transcribe via Groq Whisper
            async with httpx.AsyncClient(timeout=30) as client:
                with open(tmp_path, "rb") as f:
                    resp = await client.post(
                        "https://api.groq.com/openai/v1/audio/transcriptions",
                        headers={"Authorization": f"Bearer {groq_config.api_key}"},
                        files={"file": ("voice.ogg", f, "audio/ogg")},
                        data={"model": "whisper-large-v3"},
                    )
                resp.raise_for_status()
                transcript = resp.json().get("text", "")

            os.unlink(tmp_path)

            if not transcript:
                await update.message.reply_text("Could not transcribe the voice message.")
                return

            # Process transcribed text as a regular message
            await update.message.reply_text(f"_Heard: {transcript}_", parse_mode="Markdown")
            session_id = self._session_id(update)
            response = await self.agent.chat(session_id, transcript)
            if response:
                for i in range(0, len(response), 4000):
                    await update.message.reply_text(
                        response[i : i + 4000], parse_mode="Markdown"
                    )

        except Exception as e:
            logger.error("Voice handling error: %s", e)
            await update.message.reply_text(f"Error processing voice: {e}")

    async def start(self):
        """Start the Telegram bot with long polling."""
        logger.info("Starting Telegram bot...")
        self.app = Application.builder().token(self.token).build()

        self.app.add_handler(CommandHandler("start", self._handle_start))
        self.app.add_handler(CommandHandler("reset", self._handle_reset))
        self.app.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self._handle_message)
        )
        self.app.add_handler(MessageHandler(filters.VOICE, self._handle_voice))

        await self.app.initialize()
        await self.app.start()
        await self.app.updater.start_polling(drop_pending_updates=True)
        logger.info("Telegram bot is running")

    async def stop(self):
        """Stop the Telegram bot."""
        if self.app:
            await self.app.updater.stop()
            await self.app.stop()
            await self.app.shutdown()
            logger.info("Telegram bot stopped")
