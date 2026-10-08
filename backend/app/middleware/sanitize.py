"""
Input Sanitization Utilities
─────────────────────────────
Strips dangerous HTML, script injection, and NoSQL injection patterns
from user-supplied strings.  Used in Pydantic validators and route handlers.
"""

import re
import bleach

# Allowed tags/attrs for rich-text fields (none by default — plain text only)
ALLOWED_TAGS: list[str] = []
ALLOWED_ATTRS: dict[str, list[str]] = {}


def clean(value: str) -> str:
    """
    Sanitize a single string value:
      1. Strip HTML tags via bleach
      2. Remove javascript: URIs
      3. Remove inline event handlers  (onerror=, onclick=, etc.)
      4. Remove $ prefix (NoSQL injection vector)
      5. Trim whitespace
    """
    if not isinstance(value, str):
        return value

    # Bleach strips tags we don't allow
    value = bleach.clean(value, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)

    # Additional patterns
    value = re.sub(r"javascript\s*:", "", value, flags=re.IGNORECASE)
    value = re.sub(r"on\w+\s*=", "", value, flags=re.IGNORECASE)
    value = value.replace("$", "")

    return value.strip()


def sanitize_dict(data: dict) -> dict:
    """Recursively sanitize all string values in a dictionary."""
    cleaned = {}
    for key, value in data.items():
        if isinstance(value, str):
            cleaned[key] = clean(value)
        elif isinstance(value, dict):
            cleaned[key] = sanitize_dict(value)
        elif isinstance(value, list):
            cleaned[key] = [
                clean(v) if isinstance(v, str) else v for v in value
            ]
        else:
            cleaned[key] = value
    return cleaned
