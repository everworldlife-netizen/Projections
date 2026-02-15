"""Scheduler for periodic tasks and heartbeat.

Reads HEARTBEAT.md at configurable intervals and executes any tasks found.
Also supports one-time and recurring scheduled tasks.
"""

import json
import logging
import asyncio
from pathlib import Path
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


class TaskScheduler:
    """Manages periodic heartbeat checks and user-defined cron jobs."""

    def __init__(self, agent, config):
        self.agent = agent
        self.config = config
        self.scheduler = AsyncIOScheduler()
        self.cron_file = (
            Path(config.agents.workspace).expanduser() / "cron" / "jobs.json"
        )

    async def _heartbeat_tick(self):
        """Execute heartbeat tasks."""
        try:
            result = await self.agent.process_heartbeat()
            if result:
                logger.info("Heartbeat result: %s", result[:200])
        except Exception as e:
            logger.error("Heartbeat error: %s", e)

    async def _run_cron_job(self, job_id: str, prompt: str):
        """Execute a scheduled cron job."""
        try:
            logger.info("Running cron job: %s", job_id)
            session_id = f"cron-{job_id}"
            result = await self.agent.chat(session_id, prompt)
            if result:
                logger.info("Cron job '%s' result: %s", job_id, result[:200])
        except Exception as e:
            logger.error("Cron job '%s' error: %s", job_id, e)

    def _load_cron_jobs(self):
        """Load user-defined cron jobs from workspace."""
        if not self.cron_file.exists():
            return []
        try:
            return json.loads(self.cron_file.read_text())
        except Exception as e:
            logger.error("Error loading cron jobs: %s", e)
            return []

    def start(self):
        """Start the scheduler."""
        if not self.config.scheduler.enabled:
            logger.info("Scheduler disabled in config")
            return

        # Add heartbeat job
        interval = self.config.scheduler.heartbeat_interval_minutes
        self.scheduler.add_job(
            self._heartbeat_tick,
            IntervalTrigger(minutes=interval),
            id="heartbeat",
            name="Heartbeat check",
            replace_existing=True,
        )
        logger.info("Heartbeat scheduled every %d minutes", interval)

        # Load user cron jobs
        jobs = self._load_cron_jobs()
        for job in jobs:
            job_id = job.get("id", "")
            cron_expr = job.get("cron", "")
            prompt = job.get("prompt", "")
            if not all([job_id, cron_expr, prompt]):
                continue
            try:
                trigger = CronTrigger.from_crontab(cron_expr)
                self.scheduler.add_job(
                    self._run_cron_job,
                    trigger,
                    args=[job_id, prompt],
                    id=f"cron-{job_id}",
                    name=f"Cron: {job_id}",
                    replace_existing=True,
                )
                logger.info("Cron job loaded: %s (%s)", job_id, cron_expr)
            except Exception as e:
                logger.error("Invalid cron job '%s': %s", job_id, e)

        self.scheduler.start()
        logger.info("Scheduler started")

    def stop(self):
        """Stop the scheduler."""
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            logger.info("Scheduler stopped")
