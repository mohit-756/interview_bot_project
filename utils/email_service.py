"""Professional SMTP helper for Quadrant Technologies Recruitment correspondence."""

import os
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587

QUADRANT_SIGNATURE = """
Best Regards,
Recruitment Team | Quadrant Technologies

M : +91 9154077551
Email: recruit@quadranttechnologies.com
www.quadranttechnologies.com

Building No. 21, 4th floor, Raheja Mindspace IT Park, 
Hitech City, Madhapur, Hyderabad, Telangana 500081

An E-Verified Company
"""

def _send_generic_email(to_email, subject, body):
    """Internal helper to send a standardized email using Quadrant branding."""
    load_dotenv()
    email_address = os.getenv("EMAIL_ADDRESS")
    email_password = os.getenv("EMAIL_PASSWORD")
    if not email_address or not email_password:
        raise ValueError("EMAIL_ADDRESS / EMAIL_PASSWORD is missing in environment.")

    # Combine body with the professional signature
    full_body = f"{body}\n\n{QUADRANT_SIGNATURE}"
    
    msg = MIMEText(full_body)
    msg["Subject"] = subject
    msg["From"] = f"Quadrant Technologies Recruitment <{email_address}>"
    msg["To"] = to_email

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(email_address, email_password)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")
        return False

def send_interview_email(to_email, candidate_name, interview_date, interview_link):
    """Send formal interview invitation."""
    subject = f"Interview Invitation - {candidate_name} | Quadrant Technologies"
    body = f"""Hello {candidate_name},

Congratulations! Your application has been shortlisted for the next stage.

Your Interview Details:
Date & Time: {interview_date}
Interview Link: {interview_link}

Please ensure you join the link 5 minutes prior to your scheduled time with a stable internet connection.

We look forward to speaking with you!"""
    return _send_generic_email(to_email, subject, body)

def send_selection_email(to_email, candidate_name, role_title):
    """Send formal selection/offer notice."""
    subject = f"Congratulations! Selection Notice - {role_title} | Quadrant Technologies"
    body = f"""Hello {candidate_name},

It gives us great pleasure to inform you that you have been selected for the position of {role_title} at Quadrant Technologies.

Our team was highly impressed with your interview performance and technical capabilities. We will be reaching out shortly with further details regarding the next steps in the onboarding process.

Welcome to the team!"""
    return _send_generic_email(to_email, subject, body)

def send_rejection_email(to_email, candidate_name, role_title):
    """Send polite rejection notice."""
    subject = f"Application Update - {role_title} | Quadrant Technologies"
    body = f"""Hello {candidate_name},

Thank you for the time and effort you invested in interviewing with Quadrant Technologies for the {role_title} position.

While we were impressed with your background, we have decided to move forward with other candidates whose profiles more closely align with our current requirements at this time.

We appreciate your interest in our organization and wish you the very best in your future endeavors."""
    return _send_generic_email(to_email, subject, body)

def send_performance_feedback_email(to_email, candidate_name, role_title, strengths: list, areas_for_improvement: list, overall_score: float):
    """Send performance feedback summary to candidate after interview review."""
    subject = f"Your Interview Feedback - {role_title} | Quadrant Technologies"

    strengths_text = "\n".join(f"  ✓ {s}" for s in strengths) if strengths else "  ✓ Strong overall communication"
    improvements_text = "\n".join(f"  • {a}" for a in areas_for_improvement) if areas_for_improvement else "  • Continue building domain depth"

    body = f"""Hello {candidate_name},

Thank you for completing your interview for the {role_title} position at Quadrant Technologies.

We have reviewed your interview responses and wanted to share some constructive feedback to help you grow professionally.

— OVERALL INTERVIEW SCORE: {overall_score:.0f}/100 —

STRENGTHS OBSERVED:
{strengths_text}

AREAS FOR IMPROVEMENT:
{improvements_text}

We appreciate the time and effort you put into the interview process. Regardless of the outcome, we hope this feedback helps you in your ongoing career journey.

Thank you once again for your interest in Quadrant Technologies."""

    return _send_generic_email(to_email, subject, body)
