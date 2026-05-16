from rest_framework import serializers
from .models import Document, Section, Author, PaperImage, Reference

class ReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reference
        fields = ['id', 'document', 'citation_key', 'description', 'bibtex', 'order', 'created_at']
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

    class Meta:
        model = Document
        fields = ['id', 'title', 'index_terms', 'created_at', 'updated_at', 'sections', 'authors', 'images', 'references']

    def get_sections(self, obj):
        # Return only top-level sections for the recursive tree
        top_sections = obj.sections.filter(parent=None).order_by('order')
        return SectionSerializer(top_sections, many=True, context=self.context).data
