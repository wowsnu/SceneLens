"""Shared concurrency budget for requests that carry or return image data.

The free Render instance has one small memory pool for every API route. A panel
generation, reference generation, and viewer reading must therefore not all
hold large image payloads in flight at once. Two slots retain useful parallel
work while preventing a third image-heavy OpenAI request from starting until a
slot is released.
"""

import asyncio
import os
from typing import Awaitable, Callable, TypeVar


T = TypeVar("T")
IMAGE_AI_CONCURRENCY = max(1, int(os.getenv("IMAGE_AI_CONCURRENCY", "2")))
_image_ai_slots = asyncio.Semaphore(IMAGE_AI_CONCURRENCY)


async def run_image_ai(request_factory: Callable[[], Awaitable[T]]) -> T:
    """Run an image-bearing OpenAI request within the shared concurrency budget."""
    async with _image_ai_slots:
        return await request_factory()
