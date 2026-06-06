"""Clean garbage content from section editors in the database."""
import os, sys, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from api.models import Section
from bs4 import BeautifulSoup
import re

bad_phrases = [
    'Skip to main content', 'Accessibility help', 'Accessibility feedback',
    'AI Mode', 'Sign in', 'YouTube', 'Google', 'Channels', 'Videos',
    'Insert citation toolbar', 'Insert fig ref toolbar',
]

sections = Section.objects.all()
cleaned = 0
for s in sections:
    if not s.content:
        continue
    content = s.content
    is_bad = any(phrase in content for phrase in bad_phrases)
    if is_bad:
        # Clear to empty paragraph
        s.content = '<p></p>'
        s.save()
        print(f'  Cleared section: {s.title}')
        cleaned += 1

print(f'Cleaned {cleaned} sections.')
