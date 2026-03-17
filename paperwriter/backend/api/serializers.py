from rest_framework import serializers
from .models import Document, Section, Author, PaperImage

class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ['id', 'title', 'content', 'order', 'section_type']

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
    sections = SectionSerializer(many=True, read_only=True)
    authors = AuthorSerializer(many=True, read_only=True)
    images = PaperImageSerializer(many=True, read_only=True)

    class Meta:
        model = Document
        fields = ['id', 'title', 'created_at', 'updated_at', 'sections', 'authors', 'images']
