"""Public Memory identity from a semantic category anchor and visible row order."""

import re


def memory_identity(category_anchor, ordinal):
    if not re.fullmatch(r"[a-z0-9-]+", category_anchor):
        raise ValueError(f"Invalid public Memory category anchor: {category_anchor!r}")
    if not re.fullmatch(r"[1-9][0-9]*", ordinal):
        raise ValueError(f"Invalid visible Memory order: {ordinal!r}")
    return f"memory:{category_anchor}:{ordinal}", f"memory-{category_anchor}-{ordinal}"
