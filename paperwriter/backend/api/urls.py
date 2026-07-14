from django.urls import path, include
from rest_framework import routers
from .views import (
    DocumentViewSet, AuthorViewSet, PaperImageViewSet, ReferenceViewSet, SectionViewSet,
    PaperTableViewSet, CommentViewSet, process_ai_command, process_ai_equation, fetch_doi,
    export_latex, get_latex_source, export_pdf, preview_pdf, google_auth, dev_login, dev_login_as,
    logout_user, user_profile, delete_account, ws_token,
    get_credits, buy_credits, payment_callback, redeem_code, contact_inquiry
)

router = routers.DefaultRouter()
router.register(r'documents', DocumentViewSet)
router.register(r'authors', AuthorViewSet)
router.register(r'images', PaperImageViewSet)
router.register(r'references', ReferenceViewSet)
router.register(r'sections', SectionViewSet)
router.register(r'tables', PaperTableViewSet)
router.register(r'comments', CommentViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('auth/google/', google_auth, name='google_auth'),
    path('auth/dev-login/', dev_login, name='dev_login'),
    path('auth/dev-login-as/', dev_login_as, name='dev_login_as'),
    path('auth/logout/', logout_user, name='logout_user'),
    path('auth/ws-token/', ws_token, name='ws_token'),
    path('auth/profile/', user_profile, name='user_profile'),
    path('auth/delete_account/', delete_account, name='delete_account'),
    path('ai/command', process_ai_command, name='process_ai_command'),
    path('ai/equation', process_ai_equation, name='process_ai_equation'),
    path('references/fetch_doi', fetch_doi, name='fetch_doi'),
    path('document/<int:doc_id>/latex', get_latex_source, name='get_latex_source'),
    path('document/<int:doc_id>/export/pdf', export_pdf, name='export_pdf'),
    path('document/<int:doc_id>/preview/pdf', preview_pdf, name='preview_pdf'),
    path('document/<int:doc_id>/export/latex', export_latex, name='export_latex'),
    path('payments/buy/', buy_credits, name='buy_credits'),
    path('payments/callback/', payment_callback, name='payment_callback'),
    path('payments/redeem/', redeem_code, name='redeem_code'),
    path('payments/contact/', contact_inquiry, name='contact_inquiry'),
    path('payments/credits/', get_credits, name='get_credits'),
]
