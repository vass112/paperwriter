from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

TEMPLATE_CHOICES = [
    ('ieee',          'IEEE'),
    ('acm',           'ACM'),
    ('elsevier',      'Elsevier'),
    ('springer-lncs', 'Springer LNCS'),
    ('apa',           'APA 7th Edition'),
    ('mla',           'MLA 9th Edition'),
]

TEMPLATE_STYLES = {
    'ieee': [
        ('conference',      'Conference'),
        ('journal',         'Journal'),
        ('compsoc-conf',    'Computer Society Conference'),
        ('compsoc-journal', 'Computer Society Journal'),
        ('comsoc-conf',     'Communications Society Conference'),
        ('comsoc-journal',  'Communications Society Journal'),
        ('technote',        'Technote / Correspondence'),
    ],
    'acm': [
        ('sigconf',   'Conference (SIGCONF)'),
        ('acmsmall',  'Journal (ACM Small)'),
        ('acmlarge',  'Journal (ACM Large)'),
        ('acmtog',    'Journal (ACM TOG)'),
        ('sigplan',   'Conference (SIGPLAN)'),
    ],
    'elsevier': [
        ('preprint', 'Preprint (Submission)'),
        ('review',   'Review (Double-spaced)'),
        ('1p',       'Final — Single Column (Model 1+)'),
        ('3p',       'Final — Two Column (Model 3+)'),
        ('5p',       'Final — Two Column (Model 5+)'),
    ],
    'springer-lncs': [
        ('runningheads', 'Standard'),
    ],
    'apa': [
        ('stu', 'Student Paper'),
        ('man', 'Professional Manuscript'),
        ('jou', 'Journal Format'),
        ('doc', 'APA 6th Compatibility'),
    ],
    'mla': [
        ('student',     'Student Paper'),
        ('professional', 'Professional Submission'),
    ],
}

class Document(models.Model):
    user = models.ForeignKey(User, related_name='documents', on_delete=models.CASCADE, null=True, blank=True)
    collaborators = models.ManyToManyField(User, related_name='shared_documents', blank=True) # Full Editors
    commenters = models.ManyToManyField(User, related_name='commentable_documents', blank=True)
    viewers = models.ManyToManyField(User, related_name='viewable_documents', blank=True)
    title = models.CharField(max_length=200, default="Untitled Paper")
    index_terms = models.CharField(max_length=500, default="component, formatting, style, styling, insert", blank=True)
    template = models.CharField(max_length=30, choices=TEMPLATE_CHOICES, default='ieee')
    template_style = models.CharField(max_length=30, default='conference')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class DocumentInvite(models.Model):
    document = models.ForeignKey(Document, related_name='invites', on_delete=models.CASCADE)
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=[('viewer', 'Viewer'), ('commenter', 'Commenter'), ('editor', 'Editor')], default='editor')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('document', 'email')

    def __str__(self):
        return f"Invite for {self.email} to {self.document.title}"


class Author(models.Model):
    document = models.ForeignKey(Document, related_name='authors', on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    department = models.CharField(max_length=200, blank=True)
    organization = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.name} - {self.document.title}"

class Section(models.Model):
    SECTION_TYPES = [
        ('abstract', 'Abstract'),
        ('intro', 'Introduction'),
        ('related_work', 'Related Work'),
        ('methodology', 'Methodology'),
        ('results', 'Results'),
        ('discussion', 'Discussion'),
        ('conclusion', 'Conclusion'),
        ('references', 'References'),
    ]
    document = models.ForeignKey(Document, related_name='sections', on_delete=models.CASCADE)
    parent = models.ForeignKey('self', related_name='subsections', on_delete=models.CASCADE, null=True, blank=True, help_text="If set, this is a subsection of the parent section.")
    title = models.CharField(max_length=200)
    content = models.TextField(default="")
    order = models.IntegerField()
    section_type = models.CharField(max_length=50, choices=SECTION_TYPES, default='custom')

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.document.title} - {self.title}"

class PaperImage(models.Model):
    document = models.ForeignKey(Document, related_name='images', on_delete=models.CASCADE)
    section  = models.ForeignKey(Section, related_name='images', null=True, blank=True, on_delete=models.SET_NULL)
    image_base64 = models.TextField(blank=True, default='')
    filename = models.CharField(max_length=255, default='image.png')
    caption = models.CharField(max_length=500, blank=True, default='')
    label = models.CharField(max_length=100, blank=True, default='',
                             help_text='LaTeX label for \\ref{}, e.g. fig:architecture')
    width = models.FloatField(default=0.9,
                              help_text='Width as fraction of column width (0.1 – 1.0)')
    order = models.IntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'uploaded_at']

    def __str__(self):
        return f"{self.document.title} – {self.caption or self.label or str(self.id)}"

class Reference(models.Model):
    document = models.ForeignKey(Document, related_name='references', on_delete=models.CASCADE)
    citation_key = models.CharField(max_length=100, help_text="e.g., smith2023")
    description = models.CharField(max_length=200, blank=True, help_text="Short title for UI display")
    bibtex = models.TextField(help_text="Raw BibTeX entry")
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return f"{self.citation_key} - {self.document.title}"

class PaperTable(models.Model):
    STYLE_CHOICES = [
        ('standard', 'Standard (Grid)'),
        ('booktabs', 'Three-line (Booktabs)'),
        ('no_vertical', 'No Vertical Lines'),
        ('minimal', 'Minimal'),
    ]
    document = models.ForeignKey(Document, related_name='tables', on_delete=models.CASCADE)
    section = models.ForeignKey(Section, related_name='tables', null=True, blank=True, on_delete=models.SET_NULL)
    caption = models.CharField(max_length=500, blank=True, default='')
    label = models.CharField(max_length=100, blank=True, default='', help_text='LaTeX label for \\ref{}, e.g. tab:comparison')
    style = models.CharField(max_length=20, choices=STYLE_CHOICES, default='standard')
    content = models.TextField(default='[["Header 1", "Header 2"], ["Val 1", "Val 2"]]')
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return f"{self.document.title} - {self.caption or self.label or str(self.id)}"

class Comment(models.Model):
    document = models.ForeignKey(Document, related_name='comments', on_delete=models.CASCADE)
    section = models.ForeignKey(Section, related_name='comments', on_delete=models.CASCADE)
    author_name = models.CharField(max_length=100, default="Reviewer")
    text = models.TextField()
    quote = models.CharField(max_length=500, blank=True, default='')
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Comment by {self.author_name} on {self.section.title}"
class DownloadCredit(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='download_credits')
    remaining = models.PositiveIntegerField(default=1, help_text="Free download given on signup")
    total_purchased = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class PaymentTransaction(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='payments')
    razorpay_payment_id = models.CharField(max_length=100, unique=True)
    razorpay_order_id = models.CharField(max_length=100, blank=True)
    razorpay_signature = models.CharField(max_length=500, blank=True)
    amount_inr = models.PositiveIntegerField(help_text="Amount in paise (14900 = ₹149)")
    credits_granted = models.PositiveIntegerField(default=3)
    status = models.CharField(max_length=20, choices=[
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
    ], default='pending')
    user_email = models.EmailField(blank=True, help_text="Email at time of purchase")
    created_at = models.DateTimeField(auto_now_add=True)

class RedeemCode(models.Model):
    code = models.CharField(max_length=50, unique=True, help_text="e.g., CONF2026-ABC123")
    credits = models.PositiveIntegerField(default=3, help_text="Number of download credits this code grants")
    max_uses = models.PositiveIntegerField(default=1, help_text="How many times this code can be used total")
    use_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    notes = models.CharField(max_length=200, blank=True, help_text="Internal note (conference name, promo batch)")
    created_at = models.DateTimeField(auto_now_add=True)

    def is_valid(self):
        return (self.is_active and
                self.use_count < self.max_uses and
                (self.expires_at is None or timezone.now() < self.expires_at))

    def __str__(self):
        return self.code

class RedeemCodeUsage(models.Model):
    redeem_code = models.ForeignKey(RedeemCode, on_delete=models.CASCADE, related_name='usages')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='redeem_usages')
    redeemed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('redeem_code', 'user')

class ContactInquiry(models.Model):
    name = models.CharField(max_length=200)
    email = models.EmailField()
    institution = models.CharField(max_length=300)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.institution}"


class DocumentPresence(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='presences')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    last_active = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('document', 'user')

    def __str__(self):
        return f"{self.user.username} - {self.document.title}"


class SectionLock(models.Model):
    section = models.OneToOneField(Section, on_delete=models.CASCADE, related_name='lock')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    locked_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Lock on {self.section.title} by {self.user.username}"


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    dpdp_consent_processing = models.BooleanField(default=False, help_text="Consent to process data as per DPDP Act")
    dpdp_consent_communication = models.BooleanField(default=False, help_text="Consent for communication")
    dpdp_consent_date = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)
        DownloadCredit.objects.create(user=instance)
        
        # Process pending invites for this email
        invites = DocumentInvite.objects.filter(email__iexact=instance.email)
        for invite in invites:
            if invite.role == 'viewer':
                invite.document.viewers.add(instance)
            elif invite.role == 'commenter':
                invite.document.commenters.add(instance)
            else:
                invite.document.collaborators.add(instance)
        invites.delete()
        
        # Create Sample Document
        doc = Document.objects.create(
            user=instance,
            title="Sample Project: Introduction to PaperWriter",
            index_terms="sample, paperwriter, formatting, latex"
        )
        
        # Create Author
        Author.objects.create(
            document=doc,
            name="Demo Researcher",
            department="Department of Research",
            organization="PaperWriter University",
            email="researcher@example.com",
            order=1
        )

        # Create Reference
        Reference.objects.create(
            document=doc,
            citation_key="paperwriter2026",
            description="PaperWriter Documentation",
            bibtex="@article{paperwriter2026,\n  title={A modern approach to academic writing},\n  author={PaperWriter Team},\n  journal={Journal of Advanced Formatting},\n  year={2026}\n}",
            order=1
        )
        
        # Create Table
        PaperTable.objects.create(
            document=doc,
            caption="Comparison of Formatting Metrics",
            label="tab:comparison",
            style="booktabs",
            content='[["Metric", "Standard Editor", "PaperWriter"], ["Formatting Time", "2 hours", "5 mins"], ["Citation Errors", "High", "None"]]',
            order=1
        )
        
        # Create Image
        PaperImage.objects.create(
            document=doc,
            image_base64="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            caption="A visual overview of the system architecture",
            label="fig:architecture",
            width=0.9,
            order=1
        )
        
        # Create Sections
        Section.objects.create(
            document=doc, title="Abstract", section_type="abstract", order=1,
            content="<p>Welcome to PaperWriter! This sample project demonstrates the core features of the editor. PaperWriter allows you to write academic papers using a rich-text editor while seamlessly exporting to professional IEEE-formatted PDF or LaTeX source code.</p>"
        )
        Section.objects.create(
            document=doc, title="Introduction", section_type="intro", order=2,
            content="<p>Writing research papers often requires strict adherence to formatting guidelines. PaperWriter abstracts away the complexity of LaTeX, allowing you to focus purely on content. You can easily use <strong>bold</strong>, <em>italics</em>, and various heading levels.</p><p>To cite a reference, use the Library section in the left sidebar, or highlight text to open the floating menu. For example, this is a citation to our documentation.</p>"
        )
        Section.objects.create(
            document=doc, title="Methodology", section_type="methodology", order=3,
            content="<p>Our methodology involves bridging the gap between WYSIWYG editors and LaTeX compilers. You can reference figures (e.g., see Figure \\ref{fig:architecture}) and tables (see Table \\ref{tab:comparison}) dynamically.</p><p>You can also insert inline equations like $E = mc^2$ and block equations:</p><p>$$ \\mathcal{L} = \\sum_{i=1}^{N} (y_i - \\hat{y}_i)^2 + \\lambda ||W||^2 $$</p>"
        )
        Section.objects.create(
            document=doc, title="Results", section_type="results", order=4,
            content="<p>The results show a significant decrease in the time required to format academic papers. See the Tables and Figures managers in the left sidebar to add and configure rich academic elements.</p>"
        )
        Section.objects.create(
            document=doc, title="Conclusion", section_type="conclusion", order=5,
            content="<p>We conclude that PaperWriter provides an efficient and user-friendly environment for scholars. Feel free to delete this sample project when you're ready to start your own!</p>"
        )
        Section.objects.create(
            document=doc, title="References", section_type="references", order=6,
            content=""
        )

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    instance.profile.save()

