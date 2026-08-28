"""
API views.

Currently holds only the health check. Domain ViewSets get added here; when this file
grows past a few hundred lines, split it into a `views/` package rather than letting
it sprawl.
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request: Request) -> Response:
    """
    Liveness probe.

    Exists to prove the full request path works end to end -- browser through the Vite
    proxy, into Django, back out as JSON. When the frontend cannot reach the API, this
    is the first endpoint to hit, because it isolates transport problems from
    application ones.
    """
    return Response({"status": "ok"})
