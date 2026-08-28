"""
The Todo domain.

A todo may have sub-todos, one level deep only. The rule that gives the feature its
character:

    a parent is complete exactly when every one of its sub-todos is complete

That rule is enforced *here*, on the model, rather than in a view, a serializer, or
the frontend. The reasoning matters more than the placement:

  * Not the serializer -- that is presentation. The rule is true of the data whether
    or not anyone is looking at it through JSON.
  * Not the frontend -- a client that computes the invariant can get it wrong, or
    simply lie, and then the stored data is wrong for every other client. The server
    has to be the one that decides.
  * Not the view -- views should translate HTTP to domain calls and back. Putting the
    rule here means it holds no matter who triggers it: a REST request, the admin, a
    management command, or a test.
"""

from typing import NamedTuple

from django.core.exceptions import ValidationError
from django.db import models, transaction


class ToggleResult(NamedTuple):
    """
    Every row a toggle changed *other than* the toggled todo itself.

    Toggling propagates in both directions, and the caller cannot know which happened
    without being told:

      * a sub-todo may complete or re-open its `parent`
      * a top-level todo cascades down to its `children`

    Naming both means the endpoint can report exactly what moved, and the client never
    has to work it out.
    """

    parent: "Todo | None"
    children: "list[Todo]"


class Todo(models.Model):
    """A todo item, optionally a sub-todo of another top-level todo."""

    title = models.CharField(max_length=255)

    # Whether this todo is done. For a todo with sub-todos this is derived from them
    # (see recalculate_completed); for one without, it is owned outright.
    completed = models.BooleanField(default=False)

    # Self-referential FK: a sub-todo points at its parent, a top-level todo has None.
    #
    # CASCADE is what makes deleting a parent delete its sub-todos. That is a database
    # constraint rather than application code, so it holds even for deletes that never
    # go through the API -- the admin, a shell session, a bulk queryset delete.
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="sub_todos",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # A stable order, so the list never reshuffles between requests and the UI
        # doesn't jump. `id` breaks ties for rows created in the same instant.
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return self.title

    # -- Queries ----------------------------------------------------------------

    @property
    def is_sub_todo(self) -> bool:
        """True if this is a sub-todo. Uses parent_id, so it never hits the database."""
        return self.parent_id is not None

    # -- Validation -------------------------------------------------------------

    def clean(self) -> None:
        """
        Enforce the one-level nesting rule.

        The serializer performs the same check and is what actually returns a 400 to
        an API caller. This exists so the rule also holds for the admin, the shell,
        and anything else that calls full_clean().
        """
        if self.parent_id is None:
            return

        if self.parent_id == self.pk:
            raise ValidationError({"parent": "A todo cannot be its own parent."})

        if self.parent.is_sub_todo:
            raise ValidationError(
                {"parent": "Cannot nest below one level: that todo is already a sub-todo."}
            )

    # -- The invariant ----------------------------------------------------------

    def recalculate_completed(self) -> bool:
        """
        Re-derive this todo's completed state from its sub-todos.

        A todo with no sub-todos owns its own state, so this is a no-op for one --
        importantly, it does *not* mark a childless todo complete. ("All zero of its
        children are done" is vacuously true, which would be the wrong answer.)

        Returns whether the value actually changed, so callers can tell whether the
        parent needs sending back to the client.
        """
        # One indexed EXISTS query rather than loading every child into memory: we
        # only need to know whether an incomplete one exists, not which.
        has_sub_todos = self.sub_todos.exists()
        if not has_sub_todos:
            return False

        should_be_completed = not self.sub_todos.filter(completed=False).exists()

        if self.completed == should_be_completed:
            return False

        self.completed = should_be_completed
        # update_fields limits the UPDATE to the one column that changed, so a
        # concurrent title edit isn't clobbered by writing back a stale copy.
        self.save(update_fields=["completed"])
        return True

    @transaction.atomic
    def toggle(self) -> ToggleResult:
        """
        Flip this todo's completed state and restore the invariant around it.

        Returns a ToggleResult naming every *other* row this changed, which is what the
        endpoint hands back to the client. Reporting is part of the job: a change the
        caller is not told about is one the UI cannot show without refetching.

        Two cases:

          * A sub-todo: flip it, then re-derive the parent. This is the case the brief
            specifies -- completing the last outstanding sub-todo completes the
            parent, and un-completing any sub-todo re-opens it.

          * A top-level todo with sub-todos: flip it, then push the same state down to
            all of them. The brief doesn't say what should happen here; cascading is
            the choice that keeps the invariant true (see README assumptions). Setting
            the parent alone would leave it claiming to be complete while its children
            were not.

        Wrapped in a transaction so the todo and whatever it implies move together --
        a crash between the two writes would otherwise leave the invariant broken.

        Note there is no select_for_update() here: SQLite doesn't support row locking
        (has_select_for_update is False) and the query compiler raises
        NotSupportedError. On Postgres this method would lock the parent row to make
        concurrent toggles of sibling sub-todos safe.
        """
        self.completed = not self.completed
        self.save(update_fields=["completed"])

        if self.is_sub_todo:
            parent = self.parent
            parent.recalculate_completed()
            return ToggleResult(parent=parent, children=[])

        # A single UPDATE for all children rather than a save() each -- no N+1.
        self.sub_todos.update(completed=self.completed)

        # Re-read them. `.update()` is a bulk SQL UPDATE: it returns a row count, not
        # objects, and leaves any Python copies holding their old values. Serialising
        # without this would report the children's *previous* state -- which is exactly
        # the bug this method's return type exists to prevent.
        return ToggleResult(parent=None, children=list(self.sub_todos.all()))
