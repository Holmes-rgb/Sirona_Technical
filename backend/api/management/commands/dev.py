"""
`manage.py dev` -- bring the API up with one command.

Applies any outstanding migrations, then starts the development server. Running the
two separately is fine, but a reviewer cloning this repo should not have to know that
the database needs creating before the server will do anything useful.

Development only. In production migrations are a deploy step, run once and deliberately,
not something a web server does on boot.
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Apply migrations and start the development server."

    def add_arguments(self, parser):
        parser.add_argument(
            "addrport",
            nargs="?",
            default="8000",
            help="Optional port or address:port. Defaults to 8000.",
        )

    def handle(self, *args, **options):
        # migrate is safe to re-run: it is a no-op once everything is applied.
        call_command("migrate")

        self.stdout.write(self.style.SUCCESS("\nAPI ready. Frontend: cd frontend && npm run dev\n"))

        call_command("runserver", options["addrport"])
