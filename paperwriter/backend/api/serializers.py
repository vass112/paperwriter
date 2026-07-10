from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Document, Section, Author, PaperImage, Reference, PaperTable, Comment, UserProfile
import base64
import re


class ReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reference
        fields = ['id', 'document', 'citation_key', 'description', 'bibtex', 'order', 'created_at']
        read_only_fields = ['created_at']
        extra_kwargs = {
            'citation_key': {'max_length': 100},
            'description': {'max_length': 200},
            'bibtex': {'max_length': 50000},
        }

    def validate_bibtex(self, value):
        if len(value) > 50000:
            raise serializers.ValidationError("BibTeX content too long")
        return value

    def validate_citation_key(self, value):
        if not re.match(r'^[a-zA-Z0-9_:\-]+$', value):
            raise serializers.ValidationError("Citation key must contain only letters, numbers, underscores, colons, and hyphens")
        return value


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ['dpdp_consent_processing', 'dpdp_consent_communication', 'dpdp_consent_date']
        read_only_fields = ['dpdp_consent_date']


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'profile']


class PaperTableSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaperTable
        fields = ['id', 'document', 'section', 'caption', 'label', 'style', 'content', 'order', 'created_at']
        read_only_fields = ['created_at']
        extra_kwargs = {
            'caption': {'max_length': 500},
            'label': {'max_length': 100},
            'content': {'max_length': 50000},
        }


class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ['id', 'document', 'section', 'author_name', 'text', 'quote', 'resolved', 'created_at']
        read_only_fields = ['created_at', 'author_name']
        extra_kwargs = {
            'text': {'max_length': 5000},
            'quote': {'max_length': 500},
        }


class SectionSerializer(serializers.ModelSerializer):
    subsections = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = ['id', 'title', 'content', 'order', 'section_type', 'parent', 'subsections', 'updated_at']
        read_only_fields = []
        extra_kwargs = {
            'title': {'max_length': 200},
            'content': {'max_length': 100000},
        }

    def get_subsections(self, obj):
        serializer = SectionSerializer(obj.subsections.all(), many=True, context=self.context)
        return serializer.data

    def validate_content(self, value):
        if value and len(value) > 100000:
            raise serializers.ValidationError("Content too long")
        if value:
            cleaned = re.sub(r'<script[^>]*>.*?</script>', '', value, flags=re.IGNORECASE | re.DOTALL)
            cleaned = re.sub(r'\bon\w+\s*=\s*["\'][^"\']*["\']', '', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'javascript\s*:', '', cleaned, flags=re.IGNORECASE)
            return cleaned
        return value


class AuthorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Author
        fields = ['id', 'document', 'name', 'department', 'organization', 'city', 'country', 'email', 'order']
        read_only_fields = []
        extra_kwargs = {
            'name': {'max_length': 200},
            'department': {'max_length': 200},
            'organization': {'max_length': 200},
            'city': {'max_length': 100},
            'country': {'max_length': 100},
        }

    def validate_email(self, value):
        if value and not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', value):
            raise serializers.ValidationError("Invalid email format")
        return value


ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'}
MAX_IMAGE_SIZE = 10 * 1024 * 1024


class PaperImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    image = serializers.FileField(write_only=True, required=False)

    class Meta:
        model = PaperImage
        fields = ['id', 'document', 'section', 'image', 'image_url', 'caption', 'label', 'width', 'order', 'uploaded_at']
        read_only_fields = ['uploaded_at', 'image_url']
        extra_kwargs = {
            'caption': {'max_length': 500},
            'label': {'max_length': 100},
            'filename': {'max_length': 255},
        }

    def validate_image(self, value):
        if value.size > MAX_IMAGE_SIZE:
            raise serializers.ValidationError(f"Image too large. Maximum size is {MAX_IMAGE_SIZE // (1024*1024)}MB")
        if value.content_type not in ALLOWED_IMAGE_TYPES:
            raise serializers.ValidationError(f"Invalid image type: {value.content_type}")
        return value

    def validate_label(self, value):
        if value and not re.match(r'^[a-zA-Z_][a-zA-Z0-9_:]*$', value):
            raise serializers.ValidationError("Label must start with a letter and contain only letters, numbers, underscores, and colons")
        return value

    def validate_width(self, value):
        if value < 0.1 or value > 1.0:
            raise serializers.ValidationError("Width must be between 0.1 and 1.0")
        return value

    def create(self, validated_data):
        image_file = validated_data.pop('image', None)
        instance = super().create(validated_data)
        if image_file:
            name = image_file.name
            name = re.sub(r'[^a-zA-Z0-9_.-]', '_', name)
            name = re.sub(r'_+', '_', name)
            instance.filename = name
            instance.image_base64 = base64.b64encode(image_file.read()).decode('utf-8')
            instance.save()
        return instance

    def get_image_url(self, obj):
        if obj.image_base64:
            ext = obj.filename.split('.')[-1].lower() if obj.filename else 'png'
            if ext == 'jpg': ext = 'jpeg'
            if ext in ('png', 'jpeg', 'gif', 'webp', 'svg+xml', 'svg'):
                return f"data:image/{ext};base64,{obj.image_base64}"
            return f"data:image/png;base64,{obj.image_base64}"
        return None


class DocumentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    collaborators = UserSerializer(many=True, read_only=True)
    commenters = UserSerializer(many=True, read_only=True)
    viewers = UserSerializer(many=True, read_only=True)
    sections = serializers.SerializerMethodField()
    authors = AuthorSerializer(many=True, read_only=True)
    images = PaperImageSerializer(many=True, read_only=True)
    references = ReferenceSerializer(many=True, read_only=True)
    tables = PaperTableSerializer(many=True, read_only=True)
    comments = CommentSerializer(many=True, read_only=True)

    class Meta:
        model = Document
        fields = ['id', 'user', 'collaborators', 'commenters', 'viewers', 'title', 'index_terms', 'template', 'template_style', 'allow_collaborators_to_export', 'created_at', 'updated_at', 'sections', 'authors', 'images', 'references', 'tables', 'comments']
        read_only_fields = ['created_at', 'updated_at']
        extra_kwargs = {
            'title': {'max_length': 200},
            'index_terms': {'max_length': 500},
        }

    def validate(self, data):
        from .models import TEMPLATE_STYLES
        template = data.get('template')
        style = data.get('template_style')

        if template and style:
            valid_styles = dict(TEMPLATE_STYLES.get(template, []))
            if style not in valid_styles:
                raise serializers.ValidationError({
                    'template_style': f"'{style}' is not a valid style for template '{template}'. Valid styles: {', '.join(valid_styles.keys())}"
                })

        return data

    def get_sections(self, obj):
        top_sections = obj.sections.filter(parent=None).order_by('order')
        return SectionSerializer(top_sections, many=True, context=self.context).data
