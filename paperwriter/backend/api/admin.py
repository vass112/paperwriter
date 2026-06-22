from django.contrib import admin
from .models import Document, Section, Author, PaperImage, DownloadCredit, PaymentTransaction, RedeemCode, RedeemCodeUsage, ContactInquiry

admin.site.register(Document)
admin.site.register(Section)
admin.site.register(Author)
admin.site.register(PaperImage)

@admin.register(DownloadCredit)
class DownloadCreditAdmin(admin.ModelAdmin):
    list_display = ('user', 'remaining', 'total_purchased', 'updated_at')
    search_fields = ('user__username', 'user__email')

@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = ('user_email', 'amount_inr', 'credits_granted', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('user_email', 'razorpay_payment_id', 'razorpay_order_id')

@admin.register(RedeemCode)
class RedeemCodeAdmin(admin.ModelAdmin):
    list_display = ('code', 'credits', 'use_count', 'max_uses', 'is_active', 'expires_at')
    list_filter = ('is_active',)
    search_fields = ('code', 'notes')

@admin.register(RedeemCodeUsage)
class RedeemCodeUsageAdmin(admin.ModelAdmin):
    list_display = ('redeem_code', 'user', 'redeemed_at')
    search_fields = ('user__username', 'redeem_code__code')

@admin.register(ContactInquiry)
class ContactInquiryAdmin(admin.ModelAdmin):
    list_display = ('name', 'email', 'institution', 'is_read', 'created_at')
    list_filter = ('is_read',)
    search_fields = ('name', 'email', 'institution')
