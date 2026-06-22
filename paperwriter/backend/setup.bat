@echo off
echo ============================================================
echo PAPERWRITER DATABASE AND GOOGLE AUTHENTICATION SETUP
echo ============================================================
echo.
echo [STEP 1/4] Running Neon Database Setup...
.\venv\Scripts\python.exe create_neon_db.py
echo.
echo [STEP 2/4] Configuring Vercel Environment variables...
.\venv\Scripts\python.exe configure_vercel.py
echo.
echo [STEP 3/4] Configuring Google Client ID...
.\venv\Scripts\python.exe configure_google.py
echo.
echo [STEP 4/4] Configuring Razorpay Credentials...
.\venv\Scripts\python.exe configure_razorpay.py
echo.
echo ============================================================
echo Setup completed successfully!
echo.
echo Copy the DATABASE_URL, GOOGLE_CLIENT_ID and RAZORPAY keys printed above 
echo to verify against your Vercel Dashboard settings.
echo ============================================================
pause
