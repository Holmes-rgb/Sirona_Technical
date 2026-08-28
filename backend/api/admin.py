"""
Admin registrations.

The admin is kept purely as a development tool for inspecting rows while working on
the completion invariant. It is not part of the API.
"""

from django.contrib import admin

from .models import Todo


@admin.register(Todo)
class TodoAdmin(admin.ModelAdmin):
    list_display = ["id", "title", "completed", "parent"]
    list_filter = ["completed"]
    search_fields = ["title"]
