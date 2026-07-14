FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System dependencies for psycopg2 and general build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

# Collect static files for WhiteNoise
RUN DJANGO_SETTINGS_MODULE=paperwriter.settings python manage.py collectstatic --noinput 2>/dev/null || true

EXPOSE 8000

# Daphne ASGI server — use $PORT if set (Railway), else 8000
CMD daphne -b 0.0.0.0 -p ${PORT:-8000} paperwriter.asgi:application
