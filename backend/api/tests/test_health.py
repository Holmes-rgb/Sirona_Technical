"""Health endpoint."""

import pytest
from rest_framework import status
from rest_framework.test import APIClient


@pytest.fixture
def client() -> APIClient:
    """A fresh, unauthenticated API client for each test."""
    return APIClient()


def test_health_returns_ok(client: APIClient) -> None:
    """Answers 200 with a JSON body the frontend can parse, without authentication."""
    response = client.get("/api/health/")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "ok"}
