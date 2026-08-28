"""
Todo endpoints.

These views are deliberately thin. Every decision about *what completing something
means* lives on the model (see api/models/todos.py); the job here is to translate
HTTP into a domain call and shape the response.
"""

from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from api.models import Todo
from api.serializers import TodoSerializer


class TodoViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    Todo CRUD plus the toggle action.

    Built from explicit mixins rather than ModelViewSet so the API exposes only the
    operations the brief defines. UpdateModelMixin is included for inline title
    editing, and is safe because the serializer marks `completed` read-only -- a PATCH
    can rename a todo but cannot reach its completion state.
    """

    queryset = Todo.objects.all()
    serializer_class = TodoSerializer

    # The brief asks for a plain array of todos. The project sets PageNumberPagination
    # globally, which would wrap the list in {count, next, previous, results}; this
    # opts out for this resource.
    pagination_class = None

    def perform_create(self, serializer: TodoSerializer) -> None:
        """
        Save the todo, then restore the invariant if it landed under a parent.

        This is `perform_create`, not `create`. DRF's POST handler *is* `create` --
        overriding that name would shadow the mixin's whole request/response cycle and
        this method would be handed the request instead of a serializer. `perform_create`
        is the hook the mixin calls once validation has passed.

        Adding an incomplete sub-todo to an already-complete parent has to re-open
        that parent -- otherwise a parent could claim to be done while carrying
        unfinished work. The brief doesn't state this; see README assumptions.
        """
        todo = serializer.save()
        if todo.parent is not None:
            todo.parent.recalculate_completed()

    @action(detail=True, methods=["patch"], url_path="toggle")
    def toggle(self, request: Request, pk: str | None = None) -> Response:
        """
        PATCH /api/todos/{id}/toggle/ -- flip completion state.

        Returns both the toggled todo and its parent (null for a top-level todo), so
        the client can update a sub-todo's checkbox *and* its parent's from a single
        response, with no follow-up request and no refetch of the whole list. That
        shape is the whole point: the server owns the invariant, so it must also
        report everything the invariant changed.
        """
        todo = self.get_object()
        parent = todo.toggle()

        return Response(
            {
                "todo": self.get_serializer(todo).data,
                "parent": self.get_serializer(parent).data if parent else None,
            }
        )

    def destroy(self, request: Request, *args, **kwargs) -> Response:
        """
        DELETE /api/todos/{id}/ -- remove a todo, and its sub-todos if it has any.

        Cascading to sub-todos is handled by the FK's on_delete=CASCADE.

        Deleting a sub-todo can complete its parent: remove the last outstanding item
        and everything that remains is done. So the parent is captured before the
        delete, re-derived after, and returned.

        This answers with 200 and a body rather than the conventional 204, applying
        the same principle as toggle -- any endpoint that can change a parent's state
        hands that parent back, so the client never has to refetch to stay correct.
        Documented in the README as a deliberate deviation.
        """
        todo = self.get_object()
        parent = todo.parent

        with transaction.atomic():
            todo.delete()
            if parent is not None:
                parent.recalculate_completed()

        return Response(
            {"parent": self.get_serializer(parent).data if parent else None},
            status=status.HTTP_200_OK,
        )
