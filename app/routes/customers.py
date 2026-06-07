import os
import re
from flask import Blueprint, request, jsonify, current_app, session
from datetime import datetime

customers_bp = Blueprint('customers', __name__)

@customers_bp.route('/', methods=['GET'])
def get_customers():
    """Fetch all customers and their history."""
    db = current_app.config['DB']
    user_email = session.get('user_email')
    
    if not user_email: return jsonify({'error': 'Unauthorized'}), 401
    
    customers = list(db.customers.find({"user_email": user_email}, {'_id': 0}).sort("name", 1))
    return jsonify(customers), 200

@customers_bp.route('/search', methods=['GET'])
def search_customer():
    """Search by exact phone number OR partial name."""
    query = request.args.get('q', '').strip()
    db = current_app.config['DB']
    user_email = session.get('user_email')
    
    if not query: return jsonify({'error': 'Empty query'}), 400

    customer = db.customers.find_one({
        "user_email": user_email,
        "$or": [
            {"phone": query},
            {"name": {"$regex": f"^{query}", "$options": "i"}}
        ]
    }, {'_id': 0})

    if customer:
        return jsonify({"found": True, "customer": customer}), 200
    return jsonify({"found": False}), 404

@customers_bp.route('/add', methods=['POST'])
def add_customer():
    """Add a new customer to the database."""
    data = request.json
    db = current_app.config['DB']
    user_email = session.get('user_email')
    
    phone = data.get('phone', '').strip()
    name = data.get('name', '').strip().title()
    area = data.get('area', '').strip().upper()

    if not name or not phone:
        return jsonify({'error': 'Name and Phone are required'}), 400

    if db.customers.find_one({"phone": phone, "user_email": user_email}):
        return jsonify({'error': 'Customer with this phone already exists'}), 400

    new_customer = {
        "user_email": user_email,
        "name": name,
        "phone": phone,
        "area": area,
        "total_purchased": 0.0,
        "history": [],
        "created_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    
    db.customers.insert_one(new_customer)
    new_customer.pop('_id', None) 
    
    
    return jsonify({"message": "Customer saved successfully!", "customer": new_customer}), 201

@customers_bp.route('/delete', methods=['POST'])
def delete_customer():
    """Permanently delete a customer from the CRM."""
    data = request.json
    db = current_app.config['DB']
    user_email = session.get('user_email')
    
    phone = data.get('phone', '').strip()
    if not phone:
        return jsonify({'error': 'Phone number is required'}), 400
        
    result = db.customers.delete_one({"phone": phone, "user_email": user_email})
    
    if result.deleted_count > 0:
        return jsonify({"message": "Customer deleted successfully"}), 200
    else:
        return jsonify({"error": "Customer not found"}), 404

@customers_bp.route('/edit', methods=['POST'])
def edit_customer():
    """Update an existing customer's details."""
    data = request.json
    db = current_app.config['DB']
    user_email = session.get('user_email')
    
    original_phone = data.get('original_phone', '').strip()
    new_phone = data.get('new_phone', '').strip()
    name = data.get('name', '').strip().title()
    area = data.get('area', '').strip().upper()
    
    if not original_phone or not new_phone or not name:
        return jsonify({'error': 'Missing required fields'}), 400
        
    # If the user changed the phone number, ensure the new one isn't already taken
    if original_phone != new_phone:
        existing = db.customers.find_one({"phone": new_phone, "user_email": user_email})
        if existing:
            return jsonify({'error': 'A customer with the new phone number already exists'}), 400
            
    result = db.customers.update_one(
        {"phone": original_phone, "user_email": user_email},
        {"$set": {
            "phone": new_phone,
            "name": name,
            "area": area
        }}
    )
    
    if result.matched_count > 0:
        return jsonify({"message": "Customer updated successfully"}), 200
    else:
        return jsonify({"error": "Customer not found"}), 404