import os
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app, session
from bson.objectid import ObjectId
import re

credits_bp = Blueprint('credits', __name__)

@credits_bp.route('/pending', methods=['GET'])
def get_pending():
    db = current_app.config['DB']
    user_email = session.get('user_email')
    if not user_email: return jsonify({'error': 'Unauthorized'}), 401
    
    pending_cursor = db.pending_credits.find({"user_email": user_email})
    pending_list = []
    for p in pending_cursor:
        pending_list.append({
            "_id": str(p['_id']),
            "date": p.get('date', ''),
            "agency": p.get('agency', 'Unknown'),
            "total": p.get('total', 0)
        })
    return jsonify(pending_list), 200

@credits_bp.route('/pending/<req_id>', methods=['DELETE'])
def delete_pending(req_id):
    db = current_app.config['DB']
    try:
        db.pending_credits.delete_one({"_id": ObjectId(req_id)})
        return jsonify({"message": "Deleted"}), 200
    except:
        return jsonify({"error": "Failed to delete"}), 500

@credits_bp.route('/approve', methods=['POST'])
def approve_credit():
    db = current_app.config['DB']
    user_email = session.get('user_email')
    if not user_email: return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    paid = float(data.get('amount_paid', 0))
    
    payment_history = []
    if paid > 0:
        payment_history.append({
            "amount": paid,
            "date": datetime.now().strftime('%Y-%m-%d'),
            "time": datetime.now().strftime('%H:%M')
        })
        
    ledger_entry = {
        "user_email": user_email,
        "type": "supplier",
        "agency": data.get('agency', 'Unknown').strip().upper(),
        "invoice_no": data.get('invoice_no', ''),
        "date": datetime.now().strftime('%Y-%m-%d'),
        "total": float(data.get('total_amount', 0)),
        "paid": paid,
        "due": float(data.get('balance_due', 0)),
        "due_date": data.get('due_date', 'Not Set'),
        "payment_history": payment_history
    }
    
    db.ledger.insert_one(ledger_entry) 
    
    pending_id = data.get('pending_id')
    if pending_id:
        try: db.pending_credits.delete_one({"_id": ObjectId(pending_id)})
        except: pass
            
    return jsonify({"message": "Added to ledger successfully"}), 200

@credits_bp.route('/manual', methods=['POST'], strict_slashes=False)
def manual_credit():
    db = current_app.config['DB']
    user_email = session.get('user_email')
    if not user_email: return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    paid = float(data.get('amount_paid', 0))
    
    payment_history = []
    if paid > 0:
        payment_history.append({
            "amount": paid,
            "date": datetime.now().strftime('%Y-%m-%d'),
            "time": datetime.now().strftime('%H:%M')
        })
        
    ledger_entry = {
        "user_email": user_email,
        "type": "supplier",
        "agency": data.get('agency', 'Unknown').strip().upper(),
        "invoice_no": data.get('invoice_no', ''),
        "date": data.get('date', datetime.now().strftime('%Y-%m-%d')),
        "total": float(data.get('total_amount', 0)),
        "paid": paid,
        "due": float(data.get('balance_due', 0)),
        "due_date": data.get('due_date', 'Not Set'),
        "payment_history": payment_history
    }
    
    db.ledger.insert_one(ledger_entry) 
    return jsonify({"message": "Manual entry saved"}), 200

@credits_bp.route('/', methods=['GET'])
def get_ledger():
    db = current_app.config['DB']
    user_email = session.get('user_email')
    if not user_email: return jsonify({'error': 'Unauthorized'}), 401
    
    ledger_type = request.args.get('type', 'supplier') 
    search_term = request.args.get('search', '').strip()
    
    query = {"user_email": user_email, "type": ledger_type}
    if search_term:
        query["agency"] = {"$regex": re.compile(search_term, re.IGNORECASE)}
    
    records = list(db.ledger.find(query))
    
    grouped = {}
    for r in records:
        agency = r.get('agency', 'Unknown').strip().upper() 
        if agency not in grouped:
            grouped[agency] = {"name": agency, "agency": agency, "total_outstanding": 0, "invoices": []}
            
        grouped[agency]['total_outstanding'] += r.get('due', 0)
        grouped[agency]['invoices'].append({
            "_id": str(r['_id']),
            "id": r.get('invoice_no', '-'),
            "date": r.get('date', '-'),
            "total": r.get('total', 0),
            "paid": r.get('paid', 0),
            "due": r.get('due', 0),
            "due_date": r.get('due_date', '-'),
            "payment_history": r.get('payment_history', [])
        })
        
    return jsonify(list(grouped.values())), 200

@credits_bp.route('/customer/pay', methods=['POST'])
def customer_pay():
    db = current_app.config['DB']
    user_email = session.get('user_email')
    data = request.get_json()
    
    amount_to_apply = float(data.get('amount', 0))
    customer_name = data.get('customer_name')
    
    if amount_to_apply <= 0 or not customer_name:
        return jsonify({"error": "Invalid payment details"}), 400
        
    payment_record = {
        "amount": amount_to_apply,
        "date": data.get('date'),
        "time": data.get('time')
    }
    
    ledger_entry = {
        "user_email": user_email,
        "type": "customer",
        "agency": customer_name.strip().upper(),
        "invoice_no": f"PAY-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "date": data.get('date'),
        "total": 0,
        "paid": amount_to_apply,
        "due": -amount_to_apply, 
        "due_date": "-",
        "payment_history": [payment_record]
    }
    
    db.ledger.insert_one(ledger_entry)
    return jsonify({"message": "Payment recorded"}), 200

@credits_bp.route('/ledger/payment', methods=['DELETE'])
def delete_payment():
    db = current_app.config['DB']
    data = request.get_json()
    invoice_id = data.get('invoice_id')
    
    invoice = db.ledger.find_one({"_id": ObjectId(invoice_id)})
    if invoice and invoice.get('total') == 0 and invoice.get('due') < 0:
        db.ledger.delete_one({"_id": ObjectId(invoice_id)})
    else:
        amount = float(data.get('amount', 0))
        db.ledger.update_one(
            {"_id": ObjectId(invoice_id)},
            {
                "$inc": {"paid": -amount, "due": amount},
                "$pull": {"payment_history": {"amount": amount, "date": data.get('date'), "time": data.get('time')}}
            }
        )
    return jsonify({"message": "Payment deleted"}), 200

@credits_bp.route('/agency/<agency_name>', methods=['PUT'])
def rename_agency(agency_name):
    db = current_app.config['DB']
    user_email = session.get('user_email')
    data = request.get_json()
    new_name = data.get('new_name', '').strip().upper() 
    
    if new_name:
        db.ledger.update_many(
            {
                "user_email": user_email, 
                "agency": {"$regex": f"^{re.escape(agency_name)}$", "$options": "i"}, 
                "type": "supplier"
            },
            {"$set": {"agency": new_name}}
        )
    return jsonify({"message": "Folder renamed"}), 200

@credits_bp.route('/agency/<agency_name>', methods=['DELETE'])
def delete_agency_folder(agency_name):
    db = current_app.config['DB']
    user_email = session.get('user_email')
    ledger_type = request.args.get('type', 'supplier') # Support deleting customer folders too
    
    db.ledger.delete_many({
        "user_email": user_email, 
        "agency": {"$regex": f"^{re.escape(agency_name)}$", "$options": "i"}, 
        "type": ledger_type
    })
    return jsonify({"message": "Folder deleted"}), 200

@credits_bp.route('/ledger/<invoice_id>', methods=['PUT'])
def edit_ledger_invoice(invoice_id):
    db = current_app.config['DB']
    data = request.get_json()
    
    invoice = db.ledger.find_one({"_id": ObjectId(invoice_id)})
    if not invoice: return jsonify({"error": "Invoice not found"}), 404
    
    paid = float(invoice.get('paid', 0))
    new_total = float(data.get('total', 0))
    new_due = max(0, new_total - paid)
    
    db.ledger.update_one(
        {"_id": ObjectId(invoice_id)},
        {"$set": {
            "total": new_total,
            "due": new_due,
            "agency": data.get('agency', 'Unknown').strip().upper(), 
            "date": data.get('date'),
            "due_date": data.get('due_date') or 'Not Set'
        }}
    )
    return jsonify({"message": "Invoice updated"}), 200

@credits_bp.route('/ledger/<invoice_id>/pay', methods=['POST'])
def pay_ledger_invoice(invoice_id):
    db = current_app.config['DB']
    data = request.get_json()
    amount = float(data.get('amount', 0))
    
    payment_record = {
        "amount": amount,
        "date": data.get('date'),
        "time": data.get('time')
    }
    
    db.ledger.update_one(
        {"_id": ObjectId(invoice_id)},
        {
            "$inc": {"paid": amount, "due": -amount},
            "$push": {"payment_history": payment_record}
        }
    )
    return jsonify({"message": "Payment recorded"}), 200

@credits_bp.route('/ledger/<invoice_id>', methods=['DELETE'])
def delete_ledger_invoice(invoice_id):
    db = current_app.config['DB']
    db.ledger.delete_one({"_id": ObjectId(invoice_id)})
    return jsonify({"message": "Invoice deleted"}), 200