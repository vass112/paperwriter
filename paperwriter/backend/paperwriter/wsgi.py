"""
WSGI config for paperwriter project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os
import django
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'paperwriter.settings')

if 'VERCEL' in os.environ:
    from django.core.management import call_command
    django.setup()
    try:
        call_command('collectstatic', '--noinput', '--clear')
    except Exception as e:
        print("Error running collectstatic:", e)
    try:
        call_command('migrate', '--noinput')
    except Exception as e:
        print("Error running migrate:", e)

application = get_wsgi_application()
