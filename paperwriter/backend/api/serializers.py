from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Document, Section, Author, PaperImage, Reference, PaperTable, Comment, UserProfile

class ReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reference
        fields = ['id', 'document', 'citation_key', 'description', 'bibtex', 'order', 'created_at']
        read_only_fields = ['created_at']

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ['dpdp_consent_processing', 'dpdp_consent_communication', 'dpdp_consent_date']

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

class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ['id', 'document', 'section', 'author_name', 'text', 'quote', 'resolved', 'created_at']
        read_only_fields = ['created_at']

class SectionSerializer(serializers.ModelSerializer):
    subsections = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = ['id', 'title', 'content', 'order', 'section_type', 'parent', 'subsections']

    def get_subsections(self, obj):
        # Recursively serialize subsections
        serializer = SectionSerializer(obj.subsections.all(), many=True, context=self.context)
        return serializer.data

class AuthorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Author
        fields = ['id', 'document', 'name', 'department', 'organization', 'city', 'country', 'email', 'order']

class PaperImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = PaperImage
        fields = ['id', 'document', 'section', 'image', 'image_url', 'caption', 'label', 'width', 'order', 'uploaded_at']
        read_only_fields = ['uploaded_at', 'image_url']

    def get_image_url(self, obj):
        request = self.context.get('request')
        if obj.image and request:
            return request.build_absolute_uri(obj.image.url)
        return None

class DocumentSerializer(serializers.ModelSerializer):
    sections = serializers.SerializerMethodField()
    authors = AuthorSerializer(many=True, read_only=True)
    images = PaperImageSerializer(many=True, read_only=True)
    references = ReferenceSerializer(many=True, read_only=True)
    tables = PaperTableSerializer(many=True, read_only=True)
    comments = CommentSerializer(many=True, read_only=True)

    class Meta:
        model = Document
        fields = ['id', 'title', 'index_terms', 'created_at', 'updated_at', 'sections', 'authors', 'images', 'references', 'tables', 'comments']

    def get_sections(self, obj):
        # Return only top-level sections for the recursive tree
        top_sections = obj.sections.filter(parent=None).order_by('order')
        return SectionSerializer(top_sections, many=True, context=self.context).data
