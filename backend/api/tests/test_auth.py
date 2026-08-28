"""
Session authentication flow.

Worth testing early: auth is the part most likely to be wired up wrong, and the
failure mode (a 403 with no explanation) is slow to diagnose by hand.
"""

import pytest
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APIClient


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def user(db) -> User:
    """A saved user. The `db` fixture is what gives a test database access."""
    return User.objects.create_user(username="tester", password="pw-12345", email="t@example.com")


def test_csrf_endpoint_issues_a_token(client: APIClient) -> None:
    response = client.get("/api/auth/csrf/")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["csrfToken"]


def test_check_reports_signed_out_with_200(client: APIClient, db) -> None:
    """Signed out is a normal answer, not an error -- the frontend relies on this."""
    response = client.get("/api/auth/check/")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"authenticated": False, "user": None}


def test_login_succeeds_and_starts_a_session(client: APIClient, user: User) -> None:
    response = client.post(
        "/api/auth/login/",
        {"username": "tester", "password": "pw-12345"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["username"] == "tester"
    # The password must never appear in a response body.
    assert "password" not in response.json()

    # The session now carries through to subsequent requests on the same client.
    assert client.get("/api/auth/check/").json()["authenticated"] is True


def test_login_rejects_bad_credentials(client: APIClient, user: User) -> None:
    response = client.post(
        "/api/auth/login/",
        {"username": "tester", "password": "wrong"},
        format="json",
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    # The message must not reveal whether the username exists.
    assert "tester" not in response.json()["detail"]


def test_logout_ends_the_session(client: APIClient, user: User) -> None:
    client.post("/api/auth/login/", {"username": "tester", "password": "pw-12345"}, format="json")

    response = client.post("/api/auth/logout/")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert client.get("/api/auth/check/").json()["authenticated"] is False


def test_logout_requires_authentication(client: APIClient, db) -> None:
    """Confirms the IsAuthenticated default is actually in force."""
    response = client.post("/api/auth/logout/")

    assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
