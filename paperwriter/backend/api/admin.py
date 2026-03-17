from django.contrib import admin
from .models import Document, Section, Author, PaperImage

admin.site.register(Document)
admin.site.register(Section)
admin.site.register(Author)
admin.site.register(PaperImage)
