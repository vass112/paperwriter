from pathlib import Path
import os
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / '.env')

# Quick-start development settings - unsuitable for production
SECRET_KEY = 'django-insecure-replace-this-in-production'

DEBUG = True

ALLOWED_HOSTS = ['*']

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'api',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'paperwriter.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'paperwriter.wsgi.application'

# Database
import shutil
import dj_database_url

DB_PATH = BASE_DIR / 'db.sqlite3'
if 'VERCEL' in os.environ:
    tmp_db = Path('/tmp/db.sqlite3')
    if not tmp_db.exists():
        if DB_PATH.exists():
            shutil.copy(DB_PATH, tmp_db)
    DB_PATH = tmp_db

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': DB_PATH,
    }
}

if os.getenv('DATABASE_URL'):
    DATABASES['default'] = dj_database_url.config(
        conn_max_age=600,
        ssl_require=True
    )

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
if 'VERCEL' in os.environ:
    STATIC_ROOT = Path('/tmp/staticfiles')
else:
    STATIC_ROOT = BASE_DIR / 'staticfiles'

STATICFILES_DIRS = [
    BASE_DIR / "static",
]

# Media files (uploaded images)
MEDIA_URL = '/media/'
if 'VERCEL' in os.environ:
    tmp_media = Path('/tmp/media')
    if not tmp_media.exists():
        tmp_media.mkdir(parents=True, exist_ok=True)
        src_media = BASE_DIR / 'media'
        if src_media.exists():
            for item in src_media.glob('*'):
                if item.is_file():
                    shutil.copy(item, tmp_media)
    MEDIA_ROOT = tmp_media
else:
    MEDIA_ROOT = BASE_DIR / 'media'

# API Config
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
CORS_ALLOW_ALL_ORIGINS = True

GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', 'placeholder-client-id')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
