"""Web search tool using DuckDuckGo (free) or Brave Search API."""

import logging
import json
import httpx

logger = logging.getLogger(__name__)

DUCKDUCKGO_URL = "https://api.duckduckgo.com/"
BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"


async def search_duckduckgo(query: str, max_results: int = 5) -> list[dict]:
    """Search using DuckDuckGo Instant Answer API (free, no key needed)."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            DUCKDUCKGO_URL,
            params={"q": query, "format": "json", "no_html": 1, "skip_disambig": 1},
        )
        resp.raise_for_status()
        data = resp.json()

    results = []

    # Abstract (main answer)
    if data.get("Abstract"):
        results.append(
            {
                "title": data.get("Heading", ""),
                "snippet": data["Abstract"],
                "url": data.get("AbstractURL", ""),
            }
        )

    # Related topics
    for topic in data.get("RelatedTopics", [])[:max_results]:
        if "Text" in topic:
            results.append(
                {
                    "title": topic.get("Text", "")[:100],
                    "snippet": topic.get("Text", ""),
                    "url": topic.get("FirstURL", ""),
                }
            )

    return results[:max_results]


async def search_brave(query: str, api_key: str, max_results: int = 5) -> list[dict]:
    """Search using Brave Search API (requires API key, free tier available)."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            BRAVE_SEARCH_URL,
            params={"q": query, "count": max_results},
            headers={
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": api_key,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    for item in data.get("web", {}).get("results", [])[:max_results]:
        results.append(
            {
                "title": item.get("title", ""),
                "snippet": item.get("description", ""),
                "url": item.get("url", ""),
            }
        )

    return results


async def web_search(query: str, engine: str = "duckduckgo", api_key: str = "") -> str:
    """Perform a web search and return formatted results."""
    try:
        if engine == "brave" and api_key:
            results = await search_brave(query, api_key)
        else:
            results = await search_duckduckgo(query)

        if not results:
            return f"No results found for: {query}"

        formatted = []
        for i, r in enumerate(results, 1):
            formatted.append(f"{i}. **{r['title']}**\n   {r['snippet']}\n   {r['url']}")

        return "\n\n".join(formatted)
    except Exception as e:
        logger.error("Web search error: %s", e)
        return f"Search failed: {e}"
