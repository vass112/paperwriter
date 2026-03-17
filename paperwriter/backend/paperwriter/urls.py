from django.contrib import admin
from django.urls import path, include
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static
from api.views import process_ai_command, export_latex, SectionUpdateView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('api/section/<int:pk>', SectionUpdateView.as_view(), name='section-update'),
    path('', TemplateView.as_view(template_name='index.html')),
    path('api/ai/command', process_ai_command),
    path('api/document/<int:doc_id>/export/latex', export_latex),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
