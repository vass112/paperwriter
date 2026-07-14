@echo off
set DJANGO_DEBUG=True
set ALLOWED_HOSTS=127.0.0.1,localhost
cd /d C:\Users\DELL\Desktop\paperwriter\paperwriter\backend
venv\Scripts\daphne.exe -b 0.0.0.0 -p 8000 paperwriter.asgi:application
