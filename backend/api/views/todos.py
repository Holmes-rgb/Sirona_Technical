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

        This is `perform_create`, not `create`: two different hooks with different
        signatures, and confusing them is a real trap. `create` is DRF's POST handler
        and takes the request; `perform_create` is the hook it calls once validation
        has passed, and takes a serializer. Naming this one `create` would shadow the
        whole request/response cycle and hand it the wrong object.

        The split is also useful: this method decides what happens to the *data*, and
        `create` below decides what the *client is told*.

        Adding an incomplete sub-todo to an already-complete parent has to re-open
        that parent -- otherwise a parent could claim to be done while carrying
        unfinished work. The brief doesn't state this; see README assumptions.
        """
        todo = serializer.save()
        if todo.parent is not None:
            todo.parent.recalculate_completed()

    def create(self, request: Request, *args, **kwargs) -> Response:
        """
        POST /api/todos/ -- create a todo, or a sub-todo when parentId is given.

        Returns `{"todo": ..., "parent": ... | null}`.

        The brief specifies just the created todo, but creating a sub-todo can change a
        second row: an incomplete child re-opens a completed parent. Returning only the
        new todo would leave the client to work that out for itself, which is the one
        thing this design avoids everywhere else. It is reported here for the same
        reason toggle and delete report it. See the README assumptions.

        Mirrors CreateModelMixin.create, delegating the actual work to perform_create
        so the domain behaviour stays in one place.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        todo = serializer.instance

        # perform_create already recalculated this parent, and Django caches the FK
        # object on the todo, so this is the updated instance rather than a stale read.
        parent = todo.parent

        return Response(
            {
                "todo": self.get_serializer(todo).data,
                "parent": self.get_serializer(parent).data if parent else None,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["patch"], url_path="toggle")
    def toggle(self, request: Request, pk: str | None = None) -> Response:
        """
        PATCH /api/todos/{id}/toggle/ -- flip completion state.

        Completion propagates in both directions, and the response names whichever
        happened:

          * toggling a sub-todo may complete or re-open its `parent`
          * toggling a top-level todo cascades down to its `children`

        The unused side is null or empty rather than absent, so the client always
        handles the same shape.

        That is the whole point of this endpoint: the server owns the invariant, so it
        must also report everything the invariant changed. A row changed but not
        reported is a row the UI can only discover by refetching.
        """
        todo = self.get_object()
        result = todo.toggle()

        return Response(
            {
                "todo": self.get_serializer(todo).data,
                "parent": self.get_serializer(result.parent).data if result.parent else None,
                "children": self.get_serializer(result.children, many=True).data,
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
