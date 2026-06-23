from pathlib import Path
import os
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / '.env')

# === SECURITY WARNING: keep the production secret key secret! ===
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    if os.getenv('VERCEL'):
        raise RuntimeError("DJANGO_SECRET_KEY must be set in production environment")
    SECRET_KEY = 'django-insecure-replace-this-in-production'

DEBUG = os.getenv('DJANGO_DEBUG', 'False').lower() in ('true', '1', 'yes')

# Restrict allowed hosts in production
if DEBUG:
    ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]', 'testserver']
else:
    ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '').split(',') if os.getenv('ALLOWED_HOSTS') else []
    if os.getenv('VERCEL'):
        ALLOWED_HOSTS.extend(['.vercel.app', 'paperwriter.app'])
    if os.getenv('VERCEL_URL'):
        ALLOWED_HOSTS.append(os.getenv('VERCEL_URL'))
    
    if not ALLOWED_HOSTS:
        raise RuntimeError("ALLOWED_HOSTS must be set in production")

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

# Static files
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

# CORS - restrict in production
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
else:
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if os.getenv('CORS_ALLOWED_ORIGINS') else []
    CORS_ALLOW_CREDENTIALS = True

GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# === SESSION SECURITY ===
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SESSION_COOKIE_AGE = 86400  # 24 hours
    SECURE_HSTS_SECONDS = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_SSL_REDIRECT = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_BROWSER_XSS_FILTER = True
    X_FRAME_OPTIONS = 'DENY'

# Fix Google Sign-In popup
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin-allow-popups'

# === DRF CONFIGURATION ===
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '20/hour',
        'user': '200/hour',
    },
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ] if not DEBUG else [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
}

# === LOGGING ===
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': os.getenv('DJANGO_LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
        'api': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# Payment & Contact Config
RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID', '')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', '')
RAZORPAY_PAGE_ID = os.getenv('RAZORPAY_PAGE_ID', '')
RAZORPAY_PAGE_REDIRECT_URL = os.getenv('RAZORPAY_PAGE_REDIRECT_URL', '')
CONTACT_EMAIL = os.getenv('CONTACT_EMAIL', '')

# Google Sign-In Security headers
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

# Email Configuration
if os.getenv('EMAIL_HOST'):
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = os.getenv('EMAIL_HOST')
    EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
    EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True') == 'True'
    EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER')
    EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD')
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', CONTACT_EMAIL)
FRONTEND_URL = os.getenv('FRONTEND_URL', 'https://paperwriter.app')
