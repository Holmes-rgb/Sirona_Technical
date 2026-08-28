"""
Models package.

Split into modules by domain area rather than one large models.py, so files stay
navigable as the schema grows. Everything is re-exported here, so the rest of the
codebase imports from `api.models` and never needs to know which module a model
happens to live in:

    from api.models import Task     # not: from api.models.tasks import Task

To add a domain: create the module, then re-export its names below.
"""

# Example, once a domain module exists:
#     from .tasks import SubTask, Task
#     __all__ = ["Task", "SubTask"]

__all__: list[str] = []
