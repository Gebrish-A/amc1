@echo off
REM Pull latest changes first
git pull origin master

REM Ask for a commit message
set /p commitmsg=Enter commit message: 

REM Stage all changes
git add .

REM Commit with your message
git commit -m "%commitmsg%"

REM Push to GitHub master branch
git push origin master

pause
