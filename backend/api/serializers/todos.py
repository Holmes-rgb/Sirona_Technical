"""Todo serializers: the boundary between the Todo model and JSON."""

from rest_framework import serializers

from api.models import Todo


class TodoSerializer(serializers.ModelSerializer):
    """
    The single representation of a Todo, used by every endpoint.

    One shape everywhere -- the list, the create response, and both halves of the
    toggle response -- so a client only ever has to understand one object.
    """

    # The brief's contract uses `parentId`, so that is what the API speaks.
    # `source="parent"` maps it onto the model's FK.
    #
    # PrimaryKeyRelatedField also gives us, for free, the 400 the brief asks for when
    # parentId names a todo that doesn't exist.
    parentId = serializers.PrimaryKeyRelatedField(
        source="parent",
        queryset=Todo.objects.all(),
        allow_null=True,
        required=False,
        default=None,
    )

    class Meta:
        model = Todo
        fields = ["id", "title", "completed", "parentId"]

        # `completed` is deliberately read-only, and this is the load-bearing line in
        # the file. It means neither create nor update can set completion state, so
        # Todo.toggle() is the *only* path that changes it. Without this, a plain
        # PATCH could mark a parent complete while its sub-todos were unfinished and
        # silently break the invariant the whole feature rests on.
        #
        # It also makes exposing PATCH for the bonus (inline title editing) safe.
        read_only_fields = ["completed"]

    def validate_parentId(self, parent: Todo | None) -> Todo | None:
        """
        Enforce one level of nesting.

        The model's clean() carries the same rule for non-API callers; this is the
        copy that turns it into a 400 for the API.
        """
        if parent is not None and parent.is_sub_todo:
            raise serializers.ValidationError(
                "Cannot nest below one level: that todo is already a sub-todo."
            )
        return parent
