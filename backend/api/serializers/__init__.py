"""
Serializers package.

Serializers are the boundary between the database and JSON: they validate what comes
in and control exactly which fields go out. Everything the API accepts or returns
should pass through one rather than a hand-built dict -- a dict drifts out of sync
with the model silently, and gives no validation on the way in.

Mirrors the layout of `api.models`: one module per domain area, re-exported here so
callers import from `api.serializers`.
"""

# Example:
#     from .tasks import TaskSerializer
#     __all__ = ["TaskSerializer"]

__all__: list[str] = []
