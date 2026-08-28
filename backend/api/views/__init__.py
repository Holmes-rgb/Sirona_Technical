"""
Views package.

One module per domain area, re-exported here so URLs and tests import from
`api.views` regardless of which module a view lives in.

Two view styles are in play, deliberately:

  * ViewSets (see `api/urls.py`) for plain CRUD over a model. A single class plus one
    router line yields list/detail/create/update/delete, so there is no hand-written
    URL per operation and no chance of them drifting apart.

  * `@api_view` functions for anything that isn't CRUD -- a health probe, an action
    that spans several models, a report. Forcing those into a ViewSet costs more than
    it saves.
"""

from .health import health
from .todos import TodoViewSet

__all__ = [
    "health",
    "TodoViewSet",
]
