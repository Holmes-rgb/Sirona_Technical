"""
Routes for the `api` app. Mounted under /api/ by config/urls.py.

Domain resources should be registered on the DefaultRouter below rather than added as
individual paths -- the router derives the list/detail/create/update/delete URLs from
a single ViewSet, which keeps routing consistent as the API grows.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
# Register ViewSets here, e.g.:
#     router.register(r"studies", views.StudyViewSet, basename="study")

urlpatterns = [
    path("health/", views.health, name="health"),
    path("", include(router.urls)),
]
