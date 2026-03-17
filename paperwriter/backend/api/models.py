from django.db import models

class Document(models.Model):
    title = models.CharField(max_length=200, default="Untitled Paper")
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
    title = models.CharField(max_length=200)
    content = models.TextField(default="")
    order = models.IntegerField()
    section_type = models.CharField(max_length=50, choices=SECTION_TYPES)

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
