@echo off
echo ============================================================
echo PAPERWRITER DATABASE AND GOOGLE AUTHENTICATION SETUP
echo ============================================================
echo.
echo [STEP 1/3] Running Neon Database Setup...
.\venv\Scripts\python.exe create_neon_db.py
echo.
echo [STEP 2/3] Configuring Vercel Environment variables...
.\venv\Scripts\python.exe configure_vercel.py
echo.
echo [STEP 3/3] Configuring Google Client ID...
.\venv\Scripts\python.exe configure_google.py
echo.
echo ============================================================
echo Setup completed successfully!
echo.
echo Copy the DATABASE_URL and GOOGLE_CLIENT_ID printed above 
echo to verify against your Vercel Dashboard settings.
echo ============================================================
pause
