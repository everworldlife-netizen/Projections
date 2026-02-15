"""Discord bot channel.

Uses discord.py to connect to Discord and handle messages.
"""

import logging
import discord

logger = logging.getLogger(__name__)


class DiscordChannel:
    """Discord bot integration."""

    def __init__(self, token: str, agent, allow_from: list[str] = None):
        self.token = token
        self.agent = agent
        self.allow_from = set(allow_from) if allow_from else None

        intents = discord.Intents.default()
        intents.message_content = True
        self.client = discord.Client(intents=intents)
        self._register_handlers()

    def _is_allowed(self, user: discord.User) -> bool:
        """Check if the user is allowed to interact."""
        if not self.allow_from:
            return True
        user_id = str(user.id)
        username = user.name or ""
        return user_id in self.allow_from or username in self.allow_from

    def _session_id(self, message: discord.Message) -> str:
        """Generate a session ID from the channel."""
        return f"discord-{message.channel.id}"

    def _register_handlers(self):
        @self.client.event
        async def on_ready():
            logger.info("Discord bot logged in as %s", self.client.user)

        @self.client.event
        async def on_message(message: discord.Message):
            # Ignore own messages
            if message.author == self.client.user:
                return

            # Ignore messages from other bots
            if message.author.bot:
                return

            if not self._is_allowed(message.author):
                return

            # Only respond to DMs or when mentioned
            is_dm = isinstance(message.channel, discord.DMChannel)
            is_mentioned = self.client.user in message.mentions

            if not is_dm and not is_mentioned:
                return

            # Strip the mention from the text
            text = message.content
            if is_mentioned:
                text = text.replace(f"<@{self.client.user.id}>", "").strip()

            if not text:
                return

            session_id = self._session_id(message)

            # Handle /reset command
            if text.lower().strip() == "/reset":
                if session_id in self.agent.sessions:
                    del self.agent.sessions[session_id]
                await message.reply("Session cleared!")
                return

            try:
                async with message.channel.typing():
                    response = await self.agent.chat(session_id, text)

                if response:
                    # Discord has a 2000 char limit
                    for i in range(0, len(response), 1900):
                        chunk = response[i : i + 1900]
                        await message.reply(chunk)
                else:
                    await message.reply("(No response generated)")
            except Exception as e:
                logger.error("Error handling Discord message: %s", e)
                await message.reply(f"Sorry, an error occurred: {e}")

    async def start(self):
        """Start the Discord bot."""
        logger.info("Starting Discord bot...")
        await self.client.start(self.token)

    async def stop(self):
        """Stop the Discord bot."""
        await self.client.close()
        logger.info("Discord bot stopped")
