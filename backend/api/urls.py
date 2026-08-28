"""
Routes for the `api` app. Mounted under /api/ by config/urls.py.

CRUD resources go on the router: register a ViewSet once and it generates
list/detail/create/update/delete, so there is no per-operation URL to write and
nothing to drift out of sync.

Non-CRUD operations (auth, actions spanning several models, reports) are explicit
paths to `@api_view` functions.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
# Register CRUD ViewSets here, e.g.:
#     router.register(r"tasks", views.TaskViewSet, basename="task")

urlpatterns = [
    path("health/", views.health, name="health"),
    # --- Router-generated CRUD ---
    path("", include(router.urls)),
]
