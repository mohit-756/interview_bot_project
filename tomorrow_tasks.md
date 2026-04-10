Project Summary - Interview Bot Full Stack App
Completed Setup:
AWS Resources:
- EC2 Instance: i-009b8bfb3ab8c7d0b (t2.micro, Ubuntu)
- Elastic IP: 13.206.93.246 (permanent, no changes on restart)
- S3 Bucket: interview-bot-bucket (static website hosting enabled)
- CloudFront Distribution: E1PMZCDM7UJD58 / dfuwgnqei5yls.cloudfront.net
- PostgreSQL DB: interview_db (user: mohit, password: 1234)
Frontend:
- Deployed on S3 + CloudFront
- URL: https://dfuwgnqei5yls.cloudfront.net/
- Tech: React + Vite (HashRouter for SPA routing)
- Folder: interview-frontend/
Backend:
- Tech: FastAPI + PostgreSQL
- Location: EC2 at /home/ubuntu/interview_bot_project_1
- User: mohit, Password: 1234, DB: interview_db
- Running on port 8000
Current Issue:
- Frontend works ✅
- Backend needs to be started manually after EC2 restart
- Mixed Content Error (HTTP vs HTTPS) - need to fix API URL
What We Achieved:
1. ✅ EC2 + PostgreSQL setup complete
2. ✅ S3 + CloudFront deployment complete
3. ✅ Frontend loads on CloudFront
4. ✅ Elastic IP assigned (no more IP changes)
Tomorrow's Tasks:
1. Start EC2
2. Start backend on EC2
3. Fix API URL for HTTPS (either add HTTPS to backend OR use CloudFront proxy)
4. Test full app end-to-end
SSH Command (copy):
ssh -i interview-bot.pem ubuntu@13.206.93.246
Start Backend Commands:
cd interview_bot_project_1
source venv/bin/activate
set -a
source .env
set +a
uvicorn main:app --host 0.0.0.0 --port 8000
Backend .env contents:
DATABASE_URL=postgresql://mohit:1234@localhost:5432/interview_db
FRONTEND_URL=https://dfuwgnqei5yls.cloudfront.net
Frontend .env contents (local):
VITE_API_BASE_URL=http://13.206.93.246:8000
---
End of summary