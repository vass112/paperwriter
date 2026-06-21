from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

class Document(models.Model):
    user = models.ForeignKey(User, related_name='documents', on_delete=models.CASCADE, null=True, blank=True)
    title = models.CharField(max_length=200, default="Untitled Paper")
    index_terms = models.CharField(max_length=500, default="component, formatting, style, styling, insert", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

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
    image = models.ImageField(upload_to='paper_images/')
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

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    instance.profile.save()

