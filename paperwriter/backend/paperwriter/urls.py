import os
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve as static_serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('', TemplateView.as_view(template_name='index.html', extra_context={'google_client_id': settings.GOOGLE_CLIENT_ID, 'debug': settings.DEBUG})),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if 'VERCEL' in os.environ:
    urlpatterns += [
        re_path(r'^static/(?P<path>.*)$', static_serve, {'document_root': settings.STATIC_ROOT}),
    ]
