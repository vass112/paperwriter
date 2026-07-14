import os
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve as static_serve

# SPA catch-all: serve index.html for any path not matched above
spa_view = TemplateView.as_view(template_name='index.html', extra_context={'google_client_id': settings.GOOGLE_CLIENT_ID, 'debug': settings.DEBUG})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('', spa_view),
    # SPA catch-all: any path that doesn't start with api/, admin/, or static/
    re_path(r'^(?!api/|admin/|static/).*$', spa_view),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if 'VERCEL' in os.environ:
    urlpatterns += [
        re_path(r'^static/(?P<path>.*)$', static_serve, {'document_root': settings.STATIC_ROOT}),
    ]
