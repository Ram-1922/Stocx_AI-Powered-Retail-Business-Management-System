import os
import random
import base64
import re
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app, session

billing_bp = Blueprint('billing', __name__)

@billing_bp.route('/checkout', methods=['POST'])
def checkout():
    try:
        user_email = session.get('user_email')
        if not user_email:
            return jsonify({'error': 'Unauthorized'}), 401
            
        data = request.get_json()
        
        cart = data.get('cart', [])
        customer_phone = data.get('customer_phone', '').strip()
        customer_name = data.get('customer_name', 'Cash Customer').strip()
        receipt_base64 = data.get('receipt_image')

        if not cart:
            return jsonify({"error": "Cart is empty"}), 400
        
        db = current_app.config['DB']
        current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        invoice_no = f"INV-{random.randint(100000, 999999)}"
        photo_url = None

        if receipt_base64:
            try:
                if "," in receipt_base64:
                    header, encoded = receipt_base64.split(",", 1)
                else:
                    encoded = receipt_base64
                
                image_data = base64.b64decode(encoded)
                filename = f"receipt_{invoice_no}.jpg"
                upload_dir = os.path.join(current_app.root_path, 'static', 'uploads', 'receipts')
                os.makedirs(upload_dir, exist_ok=True)
                
                file_path = os.path.join(upload_dir, filename)
                with open(file_path, "wb") as fh:
                    fh.write(image_data)
                
                photo_url = f"/static/uploads/receipts/{filename}"
            except Exception as e:
                print("Base64 Decode Error:", str(e))

        total_bill_amount = 0.0

        for item in cart:
            product_name = item.get('product_name')
            qty_sold = int(item.get('quantity', 0))
            net_amt = float(item.get('net_amount', 0))

            if qty_sold <= 0: continue
            
            total_bill_amount += net_amt

            product = db.inventory.find_one({"product_name": product_name, "user_email": user_email})
            
            if product:
                batches = product.get('batches', [])
                if not batches:
                    batches = [{"quantity": product.get('quantity', 0), "expiry_date": product.get('expiry_date', 'Unknown')}]
                
                def parse_exp(b):
                    exp = b.get('expiry_date', 'Unknown')
                    if not exp or str(exp).lower() == 'unknown': return "99/99"
                    try:
                        m, y = exp.split('/')
                        return f"{y}{m}"
                    except: return "99/99"
                    
                batches = sorted(batches, key=parse_exp)
                remaining_to_deduct = qty_sold
                updated_batches = []
                
                for b in batches:
                    if remaining_to_deduct <= 0:
                        updated_batches.append(b)
                        continue
                        
                    b_qty = float(b.get('quantity', 0))
                    if b_qty <= remaining_to_deduct:
                        remaining_to_deduct -= b_qty
                        b['quantity'] = 0 
                    else:
                        b['quantity'] -= remaining_to_deduct
                        remaining_to_deduct = 0
                        updated_batches.append(b)
                
                valid_batches = [b for b in updated_batches if b['quantity'] > 0]
                new_total_qty = sum(b['quantity'] for b in valid_batches)
                next_exp = valid_batches[0]['expiry_date'] if valid_batches else 'Unknown'
                
                db.inventory.update_one(
                    {"_id": product['_id']},
                    {"$set": {
                        "quantity": new_total_qty,
                        "batches": valid_batches,
                        "expiry_date": next_exp,
                        "last_updated": current_date
                    }}
                )
                
                sale_record = {
                    "user_email": user_email, 
                    "date": current_date,
                    "invoice_no": invoice_no, 
                    "product_name": product_name,
                    "quantity_sold": qty_sold,
                    "mrp": float(item.get('mrp', 0)),
                    "discount_given": float(item.get('discount', 0)),
                    "net_amount_collected": net_amt
                }
                db.sales.insert_one(sale_record)

        pos_record = {
            "user_email": user_email,
            "invoice_no": invoice_no,
            "customer_name": customer_name or 'Cash Customer',
            "date": current_date,
            "total_amount": total_bill_amount,
            "photo_url": photo_url 
        }
        db.pos_history.insert_one(pos_record)

        if customer_phone:
            bill_record = {
                "date": current_date,
                "invoice_no": invoice_no,
                "amount": total_bill_amount
            }
            db.customers.update_one(
                {"phone": customer_phone, "user_email": user_email},
                {
                    "$inc": {"total_purchased": total_bill_amount},
                    "$push": {"history": bill_record}
                }
            )
            

        add_to_credit = data.get('add_to_credit')
        if add_to_credit and customer_name and customer_name != 'Cash Customer':
            ledger_entry = {
                "user_email": user_email,
                "type": "customer",
                "agency": customer_name.strip().title(), 
                "invoice_no": invoice_no,
                "date": current_date.split(' ')[0],
                "total": total_bill_amount,
                "paid": 0,
                "due": total_bill_amount,
                "due_date": data.get('due_date') or 'Not Set',
                "payment_history": []
            }
            db.ledger.insert_one(ledger_entry)

        return jsonify({
            "message": "Checkout complete! Inventory and CRM updated.",
            "invoice_no": invoice_no
        }), 200

    except Exception as e:
        print("CHECKOUT ERROR:", str(e))
        return jsonify({'error': str(e)}), 500