"""
API tests.

Uses DRF's APIClient over Django's test client because it handles JSON request bodies
and content negotiation, which is what the real frontend sends.
"""

import pytest
from rest_framework import status
from rest_framework.test import APIClient


@pytest.fixture
def client() -> APIClient:
    """A fresh, unauthenticated API client for each test."""
    return APIClient()


def test_health_returns_ok(client: APIClient) -> None:
    """The health endpoint answers 200 with a JSON body the frontend can parse."""
    response = client.get("/api/health/")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "ok"}
