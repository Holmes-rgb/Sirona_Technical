"""
Todo API behaviour.

Organised around the invariant the feature rests on:

    a parent is complete exactly when every one of its sub-todos is complete

The three cases the brief names are marked. The rest cover situations the brief
doesn't mention but the invariant implies -- those are the ones most likely to be
quietly wrong.
"""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from api.models import Todo

# Every test in this module touches the database.
pytestmark = pytest.mark.django_db


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def parent() -> Todo:
    """A top-level todo."""
    return Todo.objects.create(title="Groceries")


@pytest.fixture
def two_subs(parent: Todo) -> tuple[Todo, Todo]:
    """A parent with two incomplete sub-todos -- the standard starting point."""
    return (
        Todo.objects.create(title="Milk", parent=parent),
        Todo.objects.create(title="Eggs", parent=parent),
    )


def toggle(client: APIClient, todo: Todo):
    """PATCH the toggle endpoint. Note the trailing slash -- Django requires it."""
    return client.patch(f"/api/todos/{todo.id}/toggle/")


# -- The invariant ---------------------------------------------------------------


def test_completing_last_sub_todo_completes_parent(client, parent, two_subs):
    """REQUIRED: completing the final outstanding sub-todo completes the parent."""
    milk, eggs = two_subs

    toggle(client, milk)
    parent.refresh_from_db()
    assert parent.completed is False, "parent should wait for every sub-todo"

    response = toggle(client, eggs)

    parent.refresh_from_db()
    assert parent.completed is True
    assert response.json()["parent"]["completed"] is True


def test_unchecking_a_sub_todo_reopens_the_parent(client, parent, two_subs):
    """REQUIRED: un-completing any sub-todo re-opens a completed parent."""
    milk, eggs = two_subs
    toggle(client, milk)
    toggle(client, eggs)
    parent.refresh_from_db()
    assert parent.completed is True

    response = toggle(client, milk)

    parent.refresh_from_db()
    assert parent.completed is False
    assert response.json()["parent"]["completed"] is False


def test_cannot_nest_below_one_level(client, parent, two_subs):
    """REQUIRED: a sub-todo cannot itself have sub-todos."""
    milk, _ = two_subs

    response = client.post(
        "/api/todos/",
        {"title": "Semi-skimmed", "parentId": milk.id},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "parentId" in response.json()
    assert Todo.objects.filter(title="Semi-skimmed").count() == 0


# -- Toggle response shape -------------------------------------------------------


def test_toggle_returns_todo_and_parent_together(client, parent, two_subs):
    """The client must be able to update both checkboxes from one response."""
    milk, _ = two_subs

    body = toggle(client, milk).json()

    assert body["todo"]["id"] == milk.id
    assert body["todo"]["completed"] is True
    assert body["parent"]["id"] == parent.id


def test_toggle_returns_null_parent_for_a_top_level_todo(client, parent):
    body = toggle(client, parent).json()

    assert body["todo"]["completed"] is True
    assert body["parent"] is None


def test_toggling_a_parent_cascades_to_its_sub_todos(client, parent, two_subs):
    """
    Assumption, not in the brief: toggling a parent pushes its state down.

    The alternative -- setting the parent alone -- would leave it claiming to be
    complete while its sub-todos were unfinished.
    """
    milk, eggs = two_subs

    toggle(client, parent)

    milk.refresh_from_db()
    eggs.refresh_from_db()
    assert (milk.completed, eggs.completed) == (True, True)


# -- Edge cases the invariant implies --------------------------------------------


def test_adding_an_incomplete_sub_todo_reopens_a_completed_parent(client, parent):
    """A parent carrying unfinished work must not stay marked complete."""
    only_child = Todo.objects.create(title="Milk", parent=parent)
    toggle(client, only_child)
    parent.refresh_from_db()
    assert parent.completed is True

    client.post("/api/todos/", {"title": "Eggs", "parentId": parent.id}, format="json")

    parent.refresh_from_db()
    assert parent.completed is False


def test_deleting_the_last_incomplete_sub_todo_completes_the_parent(client, parent, two_subs):
    """Removing the only outstanding item leaves nothing unfinished."""
    milk, eggs = two_subs
    toggle(client, milk)
    parent.refresh_from_db()
    assert parent.completed is False

    response = client.delete(f"/api/todos/{eggs.id}/")

    parent.refresh_from_db()
    assert parent.completed is True
    assert response.json()["parent"]["completed"] is True


def test_a_childless_todo_is_not_completed_by_recalculation(parent):
    """
    "All zero children are done" is vacuously true, which would be the wrong answer.
    A todo with no sub-todos owns its own state.
    """
    changed = parent.recalculate_completed()

    parent.refresh_from_db()
    assert changed is False
    assert parent.completed is False


# -- Deletion --------------------------------------------------------------------


def test_deleting_a_parent_deletes_its_sub_todos(client, parent, two_subs):
    """Assumption: the cascade is a database constraint, not application code."""
    response = client.delete(f"/api/todos/{parent.id}/")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["parent"] is None
    assert Todo.objects.count() == 0


def test_deleting_a_missing_todo_returns_404(client):
    response = client.delete("/api/todos/9999/")

    assert response.status_code == status.HTTP_404_NOT_FOUND


# -- Create validation -----------------------------------------------------------


def test_create_top_level_todo(client):
    response = client.post("/api/todos/", {"title": "Groceries", "parentId": None}, format="json")

    assert response.status_code == status.HTTP_201_CREATED
    body = response.json()
    assert body["title"] == "Groceries"
    assert body["parentId"] is None
    assert body["completed"] is False


def test_create_rejects_a_parent_that_does_not_exist(client):
    response = client.post("/api/todos/", {"title": "Orphan", "parentId": 9999}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "parentId" in response.json()


def test_completed_cannot_be_set_through_create_or_update(client, parent):
    """
    `completed` is read-only, so toggle is the only way to change it. Without this,
    a plain PATCH could break the parent/sub-todo invariant.
    """
    created = client.post(
        "/api/todos/",
        {"title": "Sneaky", "parentId": None, "completed": True},
        format="json",
    ).json()
    assert created["completed"] is False

    updated = client.patch(
        f"/api/todos/{parent.id}/",
        {"title": "Renamed", "completed": True},
        format="json",
    ).json()
    assert updated["title"] == "Renamed", "title should still be editable (bonus)"
    assert updated["completed"] is False


# -- List ------------------------------------------------------------------------


def test_list_returns_a_flat_array_not_a_pagination_envelope(client, parent, two_subs):
    """
    The brief asks for an array. The project paginates by default, so this guards
    against the global setting silently wrapping the response.
    """
    body = client.get("/api/todos/").json()

    assert isinstance(body, list)
    assert len(body) == 3
    assert {t["id"] for t in body} == {parent.id, two_subs[0].id, two_subs[1].id}
