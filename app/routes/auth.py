import os
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from flask import Blueprint, request, jsonify, session, current_app
from werkzeug.security import generate_password_hash, check_password_hash

auth_bp = Blueprint('auth', __name__)

def send_otp_email(receiver_email, otp):
    """Sends the OTP via email using Python's built-in smtplib."""
    sender_email = os.getenv("SMTP_EMAIL")
    sender_password = os.getenv("SMTP_PASSWORD")
    
    if not sender_email or not sender_password:
        return False, "SMTP_EMAIL or SMTP_PASSWORD is missing in .env file."

    try:
        message = MIMEMultipart("alternative")
        message["Subject"] = "Verify your Stocx account"
        message["From"] = f"Stocx Security <{sender_email}>"
        message["To"] = receiver_email

        # Premium HTML Email Template
        html = f"""\
        <!DOCTYPE html>
        <html>
        <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
                <tr>
                    <td style="padding: 40px; text-align: center; border-bottom: 1px solid #f1f5f9;">
                        <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #0f172a; tracking: -1px;">
                            Stocx<span style="color: #10b981;">.</span>
                        </h1>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 40px; text-align: left;">
                        <h2 style="margin-top: 0; color: #1e293b; font-size: 20px; font-weight: 600;">Account Verification</h2>
                        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                            Hello,<br><br>
                            Thank you for creating an account with Stocx. To verify your email address and continue setting up your workspace, please use the following 6-digit secure passcode:
                        </p>
                        <div style="text-align: center; margin: 40px 0;">
                            <span style="display: inline-block; font-size: 36px; letter-spacing: 8px; font-weight: bold; color: #047857; background-color: #ecfdf5; padding: 20px 30px; border-radius: 12px; border: 1px solid #a7f3d0; font-family: monospace;">
                                {otp}
                            </span>
                        </div>
                        <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 30px;">
                            This passcode will expire in <strong>10 minutes</strong>. If you did not request this verification, please ignore this email to keep your account secure.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                            &copy; {datetime.now().year} Stocx Inventory Management.<br>All rights reserved.
                        </p>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """

        part = MIMEText(html, "html")
        message.attach(part)

        server = smtplib.SMTP_SSL("smtp.gmail.com", 465) 
        server.login(sender_email, sender_password)
        server.sendmail(sender_email, receiver_email, message.as_string())
        server.quit()
        return True, "Success"
        
    except smtplib.SMTPAuthenticationError:
        return False, "Authentication Failed. If using Gmail, you MUST use an 'App Password', not your standard password."
    except Exception as e:
        return False, str(e)

@auth_bp.route('/send-otp', methods=['POST'])
def send_otp():
    """Generates and sends an OTP to the requested email."""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        
        if not email:
            return jsonify({"error": "Email is required"}), 400
            
        db = current_app.config['DB']
        if db.users.find_one({"email": email}):
            return jsonify({"error": "This email is already registered. Please log in."}), 400
            
        # Generate 6 digit OTP
        otp = str(random.randint(100000, 999999))
        
        # Securely store in session temporarily
        session['reg_otp'] = otp
        session['reg_email'] = email
        
        # Trigger Email
        success, err_msg = send_otp_email(email, otp)
        
        if success:
            return jsonify({"message": "Passcode sent successfully! Check your inbox."}), 200
        else:
            print(f"SMTP Error: {err_msg}")
            return jsonify({"error": f"Failed to send email: {err_msg}"}), 500
            
    except Exception as e:
        print(f"OTP Error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
    
@auth_bp.route('/verify-otp', methods=['POST'])
def verify_otp():
    """Validates the OTP mid-way through registration before allowing phase 2."""
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    otp_entered = data.get('otp', '').strip()

    if not email or not otp_entered:
        return jsonify({"error": "Email and passcode are required."}), 400

    session_email = session.get('reg_email')
    session_otp = session.get('reg_otp')

    if session_email != email or session_otp != otp_entered:
        return jsonify({"error": "Invalid or expired passcode."}), 400

    return jsonify({"message": "Passcode verified!"}), 200


@auth_bp.route('/register', methods=['POST'])
def register():
    """Handles the complete multi-phase registration payload."""
    try:
        data = request.get_json()
        db = current_app.config['DB']
        
        email = data.get('email', '').strip().lower()
        password = data.get('password')
        otp_entered = data.get('otp', '').strip()
        
        if not otp_entered:
            return jsonify({"error": "Passcode is required."}), 400
            
        if session.get('reg_email') != email or session.get('reg_otp') != otp_entered:
            return jsonify({"error": "Invalid or expired passcode."}), 400
        
        shop_name = data.get('shop_name', '').strip()
        address = data.get('address', '').strip()
        contact_no = data.get('contact_no', '').strip()
        owner_name = data.get('owner_name', '').strip()
        shop_type = data.get('shop_type', '').strip()
        category = data.get('category', '').strip()
        
        if not email or not password or not shop_name:
            return jsonify({"error": "Missing essential mandatory fields."}), 400
            
        if db.users.find_one({"email": email}):
            return jsonify({"error": "Email already registered."}), 400
            
        hashed_password = generate_password_hash(password)
        
        user_doc = {
            "email": email,
            "password": hashed_password,
            "created_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "profile": {
                "shop_name": shop_name,
                "owner_name": owner_name,
                "contact_no": contact_no,
                "shop_type": shop_type,
                "category": category,
                "address": address,
            }
        }
        
        db.users.insert_one(user_doc)
        
        session.pop('reg_otp', None)
        session.pop('reg_email', None)
        
        session['user_email'] = email
        session['shop_name'] = shop_name
        
        return jsonify({"message": "Registration successful!", "redirect": "/"}), 201

    except Exception as e:
        print(f"Register Error: {str(e)}")
        return jsonify({'error': 'An internal server error occurred.'}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        shop_name = data.get('shop_name', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password')

        if not shop_name or not email or not password:
            return jsonify({"error": "Please provide Shop Name, Email, and Password."}), 400

        db = current_app.config['DB']
        user = db.users.find_one({"email": email})
        
        stored_password = user.get('password', '') if user else ''
        
        if user and stored_password and check_password_hash(stored_password, password):
            stored_shop_name = user.get('profile', {}).get('shop_name', '')
            
            if stored_shop_name.lower() != shop_name.lower():
                return jsonify({"error": "Shop Name does not match our records for this email."}), 401
                
            session['user_email'] = user['email']
            session['shop_name'] = stored_shop_name
            return jsonify({"message": "Login successful!", "redirect": "/"}), 200
        else:
            return jsonify({"error": "Invalid email or password."}), 401
    except Exception as e:
        return jsonify({'error': 'An internal server error occurred.'}), 500
    
@auth_bp.route('/google-login', methods=['POST'])
def google_login():
    """Handles Google OAuth login and seamless auto-registration."""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        name = data.get('name', '').strip()
        uid = data.get('uid', '')

        if not email or not uid:
            return jsonify({"error": "Missing Google Auth data."}), 400

        db = current_app.config['DB']
        user = db.users.find_one({"email": email})

        if not user:
            # AUTO-REGISTER: Create a default profile if they are a new user
            first_name = name.split(' ')[0] if name else "My"
            shop_name = f"{first_name}'s Shop"
            
            user_doc = {
                "email": email,
                "password": "",  # Google OAuth users don't need a local password
                "created_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                "profile": {
                    "shop_name": shop_name,
                    "owner_name": name,
                    "contact_no": "",
                    "shop_type": "Retail",
                    "category": "Other",
                    "address": "",
                }
            }
            db.users.insert_one(user_doc)
            
            # Start session
            session['user_email'] = email
            session['shop_name'] = shop_name
            
        else:
            # USER EXISTS: Just log them in normally
            session['user_email'] = email
            session['shop_name'] = user.get('profile', {}).get('shop_name', "My Shop")

        return jsonify({"message": "Google Login successful!", "redirect": "/"}), 200

    except Exception as e:
        print(f"Google Login Error: {str(e)}")
        return jsonify({'error': 'An internal server error occurred.'}), 500

@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully", "redirect": "/"}), 200