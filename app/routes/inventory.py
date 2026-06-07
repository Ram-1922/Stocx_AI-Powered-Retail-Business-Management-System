import os
import json
import re
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app, session
from werkzeug.utils import secure_filename
from app.services.gemini_parser import process_invoice

inventory_bp = Blueprint('inventory', __name__)
UPLOAD_FOLDER = os.path.join('static', 'receipts')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- HELPER FUNCTION: Sort DD/MM/YY dates so nearest expiry is always first ---
def sort_expiry_batches(batches):
    def parse_exp(b):
        exp = b.get('expiry_date', 'Unknown')
        if not exp or exp.lower() == 'unknown': return "99/99/99"
        try:
            # Support both DD/MM/YY and MM/YY
            parts = exp.split('/')
            if len(parts) == 3:
                d, m, y = parts
                return f"{y.zfill(2)}{m.zfill(2)}{d.zfill(2)}"
            elif len(parts) == 2:
                m, y = parts
                return f"{y.zfill(2)}{m.zfill(2)}31" # Default to end of month if no day
            else:
                return "99/99/99"
        except: return "99/99/99"
    return sorted(batches, key=parse_exp)

@inventory_bp.route('/', methods=['GET'])
def get_inventory():
    """Fetch all inventory items for the CURRENT USER from MongoDB, sorted alphabetically."""
    db = current_app.config['DB']
    user_email = session.get('user_email')
    
    if not user_email:
        return jsonify({'error': 'Unauthorized'}), 401
        
    items = list(db.inventory.find({"user_email": user_email}, {'_id': 0}).sort("product_name", 1))
    return jsonify(items), 200

@inventory_bp.route('/upload-invoice', methods=['POST'])
def upload_invoice():
    """Step 1: Scan image and return data for frontend Excel-style review."""
    if 'invoice' not in request.files: return jsonify({'error': 'No file part'}), 400
        
    file = request.files['invoice']
    if file.filename == '': return jsonify({'error': 'No selected file'}), 400

    filepath = os.path.join(UPLOAD_FOLDER, secure_filename(file.filename))
    file.save(filepath)
    
    try:
        extracted_products = process_invoice(filepath)
        
        # Safe Deletion after parsing
        try:
            if os.path.exists(filepath): 
                os.remove(filepath)
        except Exception:
            pass 
            
        # --- FIX: Handle both List and Dictionary returns dynamically ---
        products_list = []
        if isinstance(extracted_products, dict) and 'products' in extracted_products:
            products_list = extracted_products['products']
        elif isinstance(extracted_products, list):
            products_list = extracted_products
            
        if not products_list:
            return jsonify({'error': 'AI failed to read the document clearly or no products found.'}), 400
            
        return jsonify({
            'message': 'Scan complete. Please review and edit the data below.', 
            'products': products_list,
            'filename': secure_filename(file.filename) 
        }), 200
        
    except Exception as e:
        try:
            if os.path.exists(filepath): os.remove(filepath)
        except Exception: pass
        return jsonify({'error': str(e)}), 500


@inventory_bp.route('/save-inventory', methods=['POST'])
def save_inventory():
    """Step 2: Save the perfectly reviewed data from the frontend UI."""
    db = current_app.config['DB']
    user_email = session.get('user_email')
    if not user_email: return jsonify({'error': 'Unauthorized'}), 401

    invoice_image = None
    photo_url = None
    
    # --- FIX: Handle both JSON (Manual Add) and FormData (AI Upload) seamlessly ---
    if request.is_json:
        data = request.get_json()
        products = data.get('products', [])
        is_credit = str(data.get('add_to_credit', 'false')).lower() == 'true'
    else:
        data = request.form
        products_json = data.get('products')
        if not products_json: return jsonify({"error": "No product data received"}), 400
        products = json.loads(products_json)
        is_credit = str(data.get('add_to_credit', 'false')).lower() == 'true'
        invoice_image = request.files.get('invoice_image')

    current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if invoice_image and invoice_image.filename != '':
        filename = secure_filename(invoice_image.filename)
        unique_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{filename}"
        upload_dir = os.path.join(current_app.root_path, 'static', 'uploads', 'invoices')
        os.makedirs(upload_dir, exist_ok=True)
        invoice_image.save(os.path.join(upload_dir, unique_filename))
        photo_url = f"/static/uploads/invoices/{unique_filename}"

    if products and photo_url:
        agency_name = str(products[0].get('agency', 'Unknown Agency')).strip().upper()
        agency_record = {
            "user_email": user_email, "agency_name": agency_name,
            "date": current_date, "photo_url": photo_url  
        }
        db.agency_history.insert_one(agency_record)

    saved_count = 0

    for product in products:
        raw_name = str(product.get('product_name', 'UNKNOWN')).strip()
        alphanumeric_name = re.sub(r'[^\w\s]', ' ', raw_name)
        clean_name = re.sub(r'\s+', ' ', alphanumeric_name).strip().upper()
        
        qty = int(float(product.get('quantity', 0))) 
        printed_unit_price = round(float(product.get('cost', 0.0)), 2)
        net_amt = float(product.get('net_amount', 0.0))
        mrp = round(float(product.get('mrp', 0.0)), 2)
        agency = str(product.get('agency', 'Unknown')).strip().upper()
        exp = str(product.get('expiry_date', 'Unknown')).strip()
        invoice_date = str(product.get('date_of_purchase', current_date)).strip()

        if qty <= 0 and printed_unit_price <= 0.0: continue
        true_cost = round(net_amt / qty, 2) if qty > 0 else printed_unit_price

        history_record = {
            "date": invoice_date, "quantity_added": qty,
            "board_price": printed_unit_price, "net_amount_paid": net_amt,
            "mrp": mrp, "expiry": exp, "agency": agency
        }
        
        existing_product = db.inventory.find_one({"product_name": clean_name, "user_email": user_email})
        
        if existing_product:
            new_net_amt = float(existing_product.get('net_amount', 0.0)) + net_amt
            
            # --- BATCH LOGIC ---
            batches = existing_product.get('batches', [])
            if not batches: batches = [{"quantity": existing_product.get('quantity', 0), "expiry_date": existing_product.get('expiry_date', 'Unknown')}]
                
            found = False
            for b in batches:
                if b.get('expiry_date') == exp:
                    b['quantity'] += qty
                    found = True
                    break
            if not found: batches.append({"quantity": qty, "expiry_date": exp})
                
            batches = sort_expiry_batches(batches)
            valid_batches = [b for b in batches if b['quantity'] > 0]
            
            next_exp = valid_batches[0]['expiry_date'] if valid_batches else 'Unknown'
            new_qty = sum(b['quantity'] for b in valid_batches)

            db.inventory.update_one(
                {"_id": existing_product['_id']},
                {
                    "$set": {
                        "quantity": new_qty, "board_price": printed_unit_price, 
                        "true_cost": true_cost, "net_amount": new_net_amt,     
                        "mrp": mrp, "expiry_date": next_exp, 
                        "batches": valid_batches, "last_updated": current_date, 
                        "date_of_purchase": invoice_date
                    },
                    "$push": {"purchase_history": history_record} 
                }
            )
        else:
            new_prod = {
                "product_name": clean_name, "quantity": qty, "board_price": printed_unit_price, 
                "true_cost": true_cost, "net_amount": net_amt, "mrp": mrp, "agency": agency, 
                "expiry_date": exp, "batches": [{"quantity": qty, "expiry_date": exp}],
                "date_of_purchase": invoice_date, "purchase_history": [history_record], 
                "last_updated": current_date, "user_email": user_email
            }
            db.inventory.insert_one(new_prod)
            
        saved_count += 1
        
    if is_credit and products:
        db.pending_credits.insert_one({
            "user_email": user_email, "date": datetime.now().strftime('%Y-%m-%d'),
            "agency": str(products[0].get('agency', 'Unknown')),
            "total": sum(float(p.get('net_amount', 0)) for p in products)
        })
            
    return jsonify({'message': f'Successfully synced {saved_count} items to inventory!'}), 201


@inventory_bp.route('/clear', methods=['DELETE'])
def clear_inventory():
    """Danger Zone: Wipes the CURRENT USER'S inventory collection."""
    try:
        db = current_app.config['DB']
        user_email = session.get('user_email')
        if not user_email: return jsonify({'error': 'Unauthorized'}), 401
            
        deleted_count = db.inventory.delete_many({"user_email": user_email}).deleted_count
        return jsonify({'message': f'System wiped! {deleted_count} items removed from your inventory.'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

@inventory_bp.route('/add-quantity', methods=['POST'])
def add_quantity():
    """Manually add stock to an existing product with explicit expiry."""
    try:
        data = request.get_json()
        product_name = data.get('product_name')
        qty_to_add = int(data.get('quantity', 0))
        exp = data.get('expiry_date', 'Unknown').strip()
        if not exp: exp = 'Unknown'
        
        user_email = session.get('user_email')
        if not user_email: return jsonify({'error': 'Unauthorized'}), 401
        if qty_to_add <= 0: return jsonify({"error": "Invalid quantity"}), 400

        db = current_app.config['DB']
        product = db.inventory.find_one({"product_name": product_name, "user_email": user_email})
        if not product: return jsonify({"error": "Product not found"}), 404

        current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        true_cost = float(product.get('true_cost', product.get('board_price', 0)))
        added_net_value = qty_to_add * true_cost

        history_record = {
            "date": current_date, "quantity_added": qty_to_add,
            "note": "Manual Stock Addition", "board_price": product.get('board_price', 0),
            "mrp": product.get('mrp', 0), "expiry": exp
        }
        
        batches = product.get('batches', [])
        if not batches: batches = [{"quantity": product.get('quantity', 0), "expiry_date": product.get('expiry_date', 'Unknown')}]
        
        found = False
        for b in batches:
            if b.get('expiry_date') == exp:
                b['quantity'] += qty_to_add
                found = True
                break
        if not found: batches.append({"quantity": qty_to_add, "expiry_date": exp})
            
        batches = sort_expiry_batches(batches)
        valid_batches = [b for b in batches if b['quantity'] > 0]
        next_exp = valid_batches[0]['expiry_date'] if valid_batches else 'Unknown'

        db.inventory.update_one(
            {"_id": product['_id']},
            {
                "$inc": {"quantity": qty_to_add, "net_amount": added_net_value},
                "$set": {"last_updated": current_date, "batches": valid_batches, "expiry_date": next_exp},
                "$push": {"purchase_history": history_record}
            }
        )
        return jsonify({"message": f"Successfully added {qty_to_add} items!"}), 200

    except Exception as e: return jsonify({'error': str(e)}), 500


@inventory_bp.route('/edit-product', methods=['POST'])
def edit_product():
    """Update product details and explicitly modify the LAST history record."""
    try:
        data = request.get_json()
        old_name = data.get('old_name')
        user_email = session.get('user_email')

        if not user_email: return jsonify({'error': 'Unauthorized'}), 401
        if not old_name: return jsonify({"error": "Missing original product name"}), 400

        db = current_app.config['DB']
        
        raw_new_name = str(data.get('product_name', '')).strip()
        new_qty = int(float(data.get('quantity', 0)))
        new_cost = round(float(data.get('cost', 0.0)), 2)
        new_mrp = round(float(data.get('mrp', 0.0)), 2)
        new_agency = str(data.get('agency', 'Unknown')).strip()
        new_net_amount = float(data.get('net_amount', new_qty * new_cost))
        exp = data.get('expiry_date', 'Unknown')

        alphanumeric_name = re.sub(r'[^\w\s]', ' ', raw_new_name)
        clean_new_name = re.sub(r'\s+', ' ', alphanumeric_name).strip().upper()

        source_product = db.inventory.find_one({"product_name": old_name, "user_email": user_email})
        if not source_product: return jsonify({"error": "Original product not found"}), 404

        current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        batches = source_product.get('batches', [])
        history = source_product.get('purchase_history', [])
        old_total_qty = source_product.get('quantity', 0)
        current_nearest_exp = source_product.get('expiry_date', 'Unknown')

        qty_diff = new_qty - old_total_qty
        
        # --- Handle Quantity Changes via Edit ---
        if qty_diff > 0:
            found = False
            for b in batches:
                if b.get('expiry_date') == exp:
                    b['quantity'] += qty_diff
                    found = True
                    break
            if not found: batches.append({"quantity": qty_diff, "expiry_date": exp})
        elif qty_diff < 0:
            rem = abs(qty_diff)
            batches = sort_expiry_batches(batches)
            for b in batches:
                if rem <= 0: break
                if b['quantity'] <= rem:
                    rem -= b['quantity']
                    b['quantity'] = 0
                else:
                    b['quantity'] -= rem
                    rem = 0

        # --- Handle Editing the Last History Record ---
        if history:
            history[-1]['board_price'] = new_cost
            history[-1]['mrp'] = new_mrp
            
            # Only shift batch expiry if they explicitly changed the expiry box from what was displayed
            if exp != current_nearest_exp:
                old_last_exp = history[-1].get('expiry', 'Unknown')
                history[-1]['expiry'] = exp
                
                last_qty_added = history[-1].get('quantity_added', 0)
                
                # Deduct from old batch
                for b in batches:
                    if b.get('expiry_date') == old_last_exp:
                        b['quantity'] = max(0, b['quantity'] - last_qty_added)
                        break
                # Add to new batch
                found = False
                for b in batches:
                    if b.get('expiry_date') == exp:
                        b['quantity'] += last_qty_added
                        found = True
                        break
                if not found: batches.append({"quantity": last_qty_added, "expiry_date": exp})

        batches = sort_expiry_batches(batches)
        valid_batches = [b for b in batches if b['quantity'] > 0]
        next_exp = valid_batches[0]['expiry_date'] if valid_batches else 'Unknown'
        new_calculated_qty = sum(b['quantity'] for b in valid_batches)

        update_data = {
            "quantity": new_calculated_qty, "board_price": new_cost, "true_cost": new_cost,
            "mrp": new_mrp, "agency": new_agency.upper(), "net_amount": new_net_amount,
            "expiry_date": next_exp, "batches": valid_batches, "purchase_history": history,
            "last_updated": current_date
        }

        # --- MERGE LOGIC ---
        if old_name != clean_new_name:
            target_product = db.inventory.find_one({"product_name": clean_new_name, "user_email": user_email})
            if target_product:
                merged_qty = int(target_product.get('quantity', 0)) + new_calculated_qty
                merged_net = float(target_product.get('net_amount', 0.0)) + new_net_amount
                
                target_batches = target_product.get('batches', [])
                for src_b in valid_batches:
                    found = False
                    for t_b in target_batches:
                        if t_b.get('expiry_date') == src_b.get('expiry_date'):
                            t_b['quantity'] += src_b['quantity']
                            found = True
                            break
                    if not found: target_batches.append(src_b)
                
                target_batches = sort_expiry_batches(target_batches)
                valid_target_batches = [b for b in target_batches if b['quantity'] > 0]
                target_next_exp = valid_target_batches[0]['expiry_date'] if valid_target_batches else 'Unknown'
                
                history_note = {
                    "date": current_date, "quantity_added": new_calculated_qty,
                    "note": f"Merged edited stock from: {old_name}",
                    "board_price": new_cost, "mrp": new_mrp, "expiry": exp
                }

                db.inventory.update_one(
                    {"_id": target_product['_id']},
                    {
                        "$set": {"quantity": merged_qty, "net_amount": merged_net, "last_updated": current_date, "batches": valid_target_batches, "expiry_date": target_next_exp},
                        "$push": {"purchase_history": history_note}
                    }
                )
                db.inventory.delete_one({"_id": source_product['_id']})
                return jsonify({"message": f"Merged successfully into {clean_new_name}!"}), 200
            else:
                update_data["product_name"] = clean_new_name

        db.inventory.update_one({"_id": source_product['_id']}, {"$set": update_data})
        return jsonify({"message": "Product details updated successfully!"}), 200

    except Exception as e: return jsonify({'error': str(e)}), 500

@inventory_bp.route('/delete-product', methods=['POST'])
def delete_product():
    """Permanently delete a product from the inventory."""
    try:
        data = request.get_json()
        product_name = data.get('product_name')
        user_email = session.get('user_email')

        if not user_email: return jsonify({'error': 'Unauthorized'}), 401
        
        db = current_app.config['DB']
        result = db.inventory.delete_one({"product_name": product_name, "user_email": user_email})
        
        if result.deleted_count > 0:
            return jsonify({"message": "Product deleted successfully"}), 200
        else:
            return jsonify({"error": "Product not found"}), 404
            
    except Exception as e: return jsonify({'error': str(e)}), 500


@inventory_bp.route('/return-product', methods=['POST'])
def return_product():
    """Return a product to the agency, deducting from the most recent records."""
    try:
        data = request.get_json()
        product_name = data.get('product_name')
        qty_to_return = int(data.get('quantity', 0))
        user_email = session.get('user_email')

        if not user_email: return jsonify({'error': 'Unauthorized'}), 401
        if qty_to_return <= 0: return jsonify({"error": "Invalid quantity"}), 400

        db = current_app.config['DB']
        product = db.inventory.find_one({"product_name": product_name, "user_email": user_email})

        if not product: return jsonify({"error": "Product not found"}), 404
        if product.get('quantity', 0) < qty_to_return: 
            return jsonify({"error": f"Cannot return {qty_to_return}. Only {product.get('quantity')} in stock."}), 400

        current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        true_cost = float(product.get('true_cost', product.get('board_price', 0)))
        deducted_net_value = qty_to_return * true_cost

        history_record = {
            "date": current_date,
            "quantity_added": -qty_to_return,
            "note": "Returned Product",
            "board_price": product.get('board_price', 0),
            "mrp": product.get('mrp', 0),
            "expiry": product.get('expiry_date', 'Unknown')
        }

        # Deduct from latest batches (Last-In-First-Out)
        batches = product.get('batches', [])
        rem = qty_to_return
        for b in reversed(batches):
            if rem <= 0: break
            if b['quantity'] <= rem:
                rem -= b['quantity']
                b['quantity'] = 0
            else:
                b['quantity'] -= rem
                rem = 0
                
        valid_batches = [b for b in batches if b['quantity'] > 0]
        next_exp = valid_batches[0]['expiry_date'] if valid_batches else 'Unknown'

        # Set is_returned flag if stock reaches exactly 0 due to return
        is_returned = True if (product.get('quantity', 0) - qty_to_return) <= 0 else product.get('is_returned', False)

        db.inventory.update_one(
            {"_id": product['_id']},
            {
                "$inc": {"quantity": -qty_to_return, "net_amount": -deducted_net_value, "returned_qty": qty_to_return},
                "$set": {"last_updated": current_date, "batches": valid_batches, "expiry_date": next_exp, "is_returned": is_returned},
                "$push": {"purchase_history": history_record}
            }
        )
        return jsonify({"message": f"Successfully returned {qty_to_return} items!"}), 200

    except Exception as e: return jsonify({'error': str(e)}), 500