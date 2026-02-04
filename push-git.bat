@echo off
:: Change to your repo folder
cd "C:\Users\NehZewd\Documents\hanii\Amediaa coverage final\Amediaa coverage final\Amediaa coverage final"

:: Ask for commit message
set /p msg="Enter commit message: "

:: Stage all changes
git add .

:: Commit with the message
git commit -m "%msg%"

:: Pull first to avoid conflicts
git pull origin main --rebase

:: Push to main
git push origin main

echo Done! Press any key to exit.
pause >nul
