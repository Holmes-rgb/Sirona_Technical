"""Liveness probe."""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request: Request) -> Response:
    """
    Confirms the full request path works: browser -> Vite proxy -> Django -> JSON.

    When the frontend cannot reach the API this is the first endpoint to try, because
    it separates a transport problem from an application one.
    """
    return Response({"status": "ok"})
