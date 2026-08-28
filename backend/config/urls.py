"""
Root URL configuration.

Everything the frontend talks to lives under the /api/ prefix. That prefix is what the
Vite dev proxy matches on, so keeping all API routes beneath it means new endpoints
work through the proxy with no extra configuration.
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
]
