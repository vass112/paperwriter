from django.urls import path, include
from rest_framework import routers
from .views import DocumentViewSet, AuthorViewSet, PaperImageViewSet, process_ai_command, export_latex, get_latex_source, export_pdf

router = routers.DefaultRouter()
router.register(r'documents', DocumentViewSet)
router.register(r'authors', AuthorViewSet)
router.register(r'images', PaperImageViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('ai/command', process_ai_command, name='process_ai_command'),
    path('document/<int:doc_id>/latex', get_latex_source, name='get_latex_source'),
    path('document/<int:doc_id>/export/pdf', export_pdf, name='export_pdf'),
    path('document/<int:doc_id>/export/latex', export_latex, name='export_latex'),
]
