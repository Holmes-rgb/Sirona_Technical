"""
Session authentication: CSRF bootstrap, login, logout, and a session check.

Django's built-in session auth is used rather than JWT. The session cookie is set by
Django, marked HttpOnly, and sent automatically by the browser -- so there is no token
for frontend code to store, and therefore no token for a XSS bug to steal. The
tradeoff is that writes need a CSRF token, which is what `csrf_token` below is for.

Because the frontend is served through the Vite proxy, cookies are same-origin and
work with no `SameSite` configuration. See NOTES.md.
"""

from django.contrib.auth import authenticate
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response


def _user_payload(user) -> dict:
    """The user fields the frontend is allowed to see. Never serialise the whole model."""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_token(request: Request) -> Response:
    """
    Sets the `csrftoken` cookie and returns the token in the body.

    Django rejects unsafe requests whose `X-CSRFToken` header doesn't match this
    cookie. The frontend calls this once on startup rather than before every write --
    the token is valid for the whole session, so re-fetching it per request is a
    wasted round trip.
    """
    return Response({"csrfToken": get_token(request)})


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request: Request) -> Response:
    """Authenticate and start a session."""
    username = request.data.get("username")
    password = request.data.get("password")

    if not username or not password:
        return Response(
            {"detail": "Username and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, username=username, password=password)
    if user is None:
        # Deliberately vague: saying which of the two was wrong tells an attacker
        # whether a username exists.
        return Response(
            {"detail": "Invalid credentials."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    django_login(request, user)
    return Response(_user_payload(user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request: Request) -> Response:
    """End the session and clear the cookie."""
    django_logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([AllowAny])
def check_session(request: Request) -> Response:
    """
    Report whether the caller is signed in.

    Returns 200 either way, with an `authenticated` flag, so the frontend can ask
    "who am I?" on load without treating a normal signed-out state as an error.
    """
    if request.user.is_authenticated:
        return Response({"authenticated": True, "user": _user_payload(request.user)})
    return Response({"authenticated": False, "user": None})
