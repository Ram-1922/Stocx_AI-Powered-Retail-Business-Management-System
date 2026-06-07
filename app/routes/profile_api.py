import os
from flask import Blueprint, request, jsonify, current_app, session
from werkzeug.utils import secure_filename

profile_bp = Blueprint('profile', __name__)

LOGO_FOLDER = os.path.join('static', 'logos')
os.makedirs(LOGO_FOLDER, exist_ok=True)

@profile_bp.route('/', methods=['GET'])
def get_profile():
    """Fetch the user's profile data safely."""
    user_email = session.get('user_email')
    if not user_email:
        return jsonify({'error': 'Unauthorized'}), 401

    db = current_app.config['DB']
    user = db.users.find_one({"email": user_email}, {'_id': 0, 'password': 0})
    
    if not user:
        return jsonify({'error': 'User not found'}), 404

    profile_data = user.get('profile', {})
        
    response_data = {
        "email": user.get('email'),
        "shop_name": profile_data.get('shop_name', 'My Shop'),
        "owner_name": profile_data.get('owner_name', ''),
        "phone": profile_data.get('contact_no', ''), 
        "address": profile_data.get('address', ''),
        "gstin": profile_data.get('gstin', ''),
        "logo_url": profile_data.get('logo_url', ''),
        "shop_type": profile_data.get('shop_type', 'Retail'),
        "category": profile_data.get('category', 'Other'),
        "bio": profile_data.get('bio', ''),
        
        # --- FIX: SEND TWILIO DATA BACK TO THE UI ---
        "twilio_enabled": profile_data.get('twilio_enabled', False),
        "twilio_number": profile_data.get('twilio_number', ''),
        "twilio_sid": profile_data.get('twilio_sid', ''),
        "twilio_token": profile_data.get('twilio_token', '')
    }
        
    return jsonify(response_data), 200

@profile_bp.route('/update', methods=['POST'])
def update_profile():
    """Update profile details and handle logo upload using nested MongoDB paths."""
    user_email = session.get('user_email')
    if not user_email:
        return jsonify({'error': 'Unauthorized'}), 401

    db = current_app.config['DB']
    
    # Catch the Twilio inputs from JavaScript
    twilio_enabled = request.form.get('twilio_enabled') == 'true'
    
    update_data = {
        "profile.shop_name": request.form.get('shop_name', '').strip(),
        "profile.owner_name": request.form.get('owner_name', '').strip(),
        "profile.contact_no": request.form.get('phone', '').strip(),
        "profile.address": request.form.get('address', '').strip(),
        "profile.gstin": request.form.get('gstin', '').strip().upper(),
        "profile.category": request.form.get('category', 'Other').strip(),
        "profile.shop_type": request.form.get('shop_type', 'Retail').strip(),
        "profile.bio": request.form.get('bio', '').strip(),
        
        # --- FIX: SAVE TWILIO DATA ---
        "profile.twilio_enabled": twilio_enabled,
        "profile.twilio_number": request.form.get('twilio_number', '').strip(),
        "profile.twilio_sid": request.form.get('twilio_sid', '').strip(),
        "profile.twilio_token": request.form.get('twilio_token', '').strip()
    }
    
    shop_name = request.form.get('shop_name', '').strip()
    if shop_name:
        session['shop_name'] = shop_name

    if 'logo' in request.files:
        file = request.files['logo']
        if file.filename != '':
            filename = secure_filename(f"logo_{user_email.replace('@','_')}_{file.filename}")
            filepath = os.path.join(LOGO_FOLDER, filename)
            file.save(filepath)
            update_data["profile.logo_url"] = f"/{filepath}".replace("\\", "/")

    db.users.update_one(
        {"email": user_email},
        {"$set": update_data}
    )

    return get_profile()