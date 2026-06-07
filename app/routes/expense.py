import os
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, current_app, session

expense_bp = Blueprint('expense', __name__)

def safe_float(val, default=0.0):
    """Bulletproof float converter. Strips symbols, commas, and handles None/empty safely."""
    if val is None: return default
    if isinstance(val, (int, float)): return float(val)
    try:
        clean_val = str(val).replace(',', '').replace('₹', '').replace('$', '').replace('€', '').strip()
        if not clean_val: return default
        return float(clean_val)
    except Exception:
        return default

def parse_db_date(date_val):
    """Bulletproof date parser that handles timezones and various formats."""
    if not date_val: return None
    if isinstance(date_val, datetime): 
        return date_val.replace(tzinfo=None)
    
    date_str = str(date_val).strip()
    formats = [
        '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M:%S.%f', 
        '%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%dT%H:%M:%S', 
        '%Y-%m-%d', '%d/%m/%Y %H:%M:%S', '%d/%m/%Y', '%m/%d/%Y'
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.replace(tzinfo=None)
        except ValueError:
            continue
    return None

def calculate_product_sales_and_stock(inventory_data, sales_data, pos_history_data, start_date, end_date):
    """
    Dedicated function to calculate exact sold count from POS Billing 
    and uploaded stock from Inventory / Audit records.
    """
    product_metrics = {}

    # 1. Register all products from inventory to track stock uploaded
    for item in inventory_data:
        name = str(item.get('product_name', '')).strip()
        if not name: continue
        
        if name not in product_metrics:
            product_metrics[name] = {'sold': 0.0, 'uploaded': 0.0}
        
        history = item.get('purchase_history', [])
        for record in history:
            rec_date = parse_db_date(record.get('date', record.get('created_at')))
            if rec_date and (start_date <= rec_date <= end_date):
                product_metrics[name]['uploaded'] += safe_float(record.get('quantity_added', record.get('qty', 0)))

    # 2. Calculate Sold Count from POS Billing (Combines sales & pos_history)
    all_billing_records = sales_data + pos_history_data
    
    for bill in all_billing_records:
        bill_date = parse_db_date(bill.get('date', bill.get('created_at')))
        if not bill_date or not (start_date <= bill_date <= end_date):
            continue
            
        items = bill.get('cart', bill.get('items', []))
        for item in items:
            name = str(item.get('product_name', '')).strip()
            qty = safe_float(item.get('quantity', item.get('qty', 0)))
            
            if name:
                if name not in product_metrics:
                    product_metrics[name] = {'sold': 0.0, 'uploaded': 0.0}
                product_metrics[name]['sold'] += qty
                
    return product_metrics

@expense_bp.route('/stats', methods=['GET'])
def get_stats():
    try:
        db = current_app.config['DB']
        user_email = session.get('user_email')
        
        if not user_email: return jsonify({'error': 'Unauthorized'}), 401
            
        date_range = request.args.get('range', 'past_month')
        custom_start = request.args.get('start')
        custom_end = request.args.get('end')
        
        now = datetime.now()
        is_hourly = False
        
        # Date Logic
        if date_range == 'today':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = start_date + timedelta(days=1) - timedelta(microseconds=1)
            is_hourly = True
        elif date_range == 'yesterday':
            start_date = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = start_date + timedelta(days=1) - timedelta(microseconds=1)
            is_hourly = True
        elif date_range == 'past_month':
            start_date = now - timedelta(days=30)
            end_date = now
        elif date_range == 'past_6_months':
            start_date = now - timedelta(days=180)
            end_date = now
        elif date_range == 'past_1_year':
            start_date = now - timedelta(days=365)
            end_date = now
        elif date_range == 'custom' and custom_start and custom_end:
            try:
                start_date = datetime.strptime(custom_start, '%Y-%m-%d')
                end_date = datetime.strptime(custom_end, '%Y-%m-%d') + timedelta(days=1) - timedelta(microseconds=1)
                if (end_date - start_date).days <= 2: is_hourly = True
            except:
                start_date = now - timedelta(days=30)
                end_date = now
        else:
            start_date = now - timedelta(days=30)
            end_date = now

        # Fetch Data Safely
        try:
            all_inventory = list(db.inventory.find({"user_email": user_email}))
            sales = list(db.sales.find({"user_email": user_email}))
            pos_history = list(db.pos_history.find({"user_email": user_email})) # Added POS History
            supplier_ledger = list(db.ledger.find({"user_email": user_email, "type": "supplier"}))
            customer_ledger = list(db.ledger.find({"user_email": user_email, "type": "customer"}))
            agency_history = list(db.agency_history.find({"user_email": user_email}))
            customers = list(db.customers.find({"user_email": user_email}))
        except Exception as e:
            print(f"DB Fetch Error: {e}")
            all_inventory, sales, pos_history, supplier_ledger, customer_ledger, agency_history, customers = [], [], [], [], [], [], []

        # --- RUN THE DEDICATED PRODUCT FUNCTION ---
        product_metrics = calculate_product_sales_and_stock(all_inventory, sales, pos_history, start_date, end_date)

        # Build Top 10 and Least 10 Lists
        sorted_by_sold = sorted(product_metrics.items(), key=lambda x: x[1]['sold'], reverse=True)
        top_10 = [{"name": k, "qty": int(v['sold'])} for k, v in sorted_by_sold[:10] if v['sold'] > 0]
        
        sorted_by_least = sorted(product_metrics.items(), key=lambda x: x[1]['sold'])
        least_10 = [{"name": k, "qty": int(v['sold'])} for k, v in sorted_by_least[:10]]

        # --- INITIALIZE FINANCIAL METRICS ---
        total_purchase_cost = 0.0
        sales_revenue = 0.0
        cogs = 0.0
        expiry_loss = 0.0
        remaining_inventory_value = 0.0
        sales_count_in_range = 0
        invoices_in_range = 0
        
        # --- CHART DATA STRUCTURES ---
        revenue_chart, cost_chart, profit_chart = {}, {}, {}
        if is_hourly:
            for i in range(24):
                key = f"{start_date.strftime('%Y-%m-%d')} {i:02d}:00"
                revenue_chart[key], cost_chart[key], profit_chart[key] = 0.0, 0.0, 0.0
        else:
            delta = end_date - start_date
            for i in range(delta.days + 1):
                key = (start_date + timedelta(days=i)).strftime('%Y-%m-%d')
                revenue_chart[key], cost_chart[key], profit_chart[key] = 0.0, 0.0, 0.0

        # 1. PROCESS FINANCIALS FROM SALES
        for sale in sales:
            try:
                sale_date = parse_db_date(sale.get('date', sale.get('created_at')))
                if not sale_date or not (start_date <= sale_date <= end_date): continue
                    
                sales_count_in_range += 1
                chart_key = sale_date.strftime('%Y-%m-%d %H:00') if is_hourly else sale_date.strftime('%Y-%m-%d')

                sale_items = sale.get('cart', sale.get('items', []))
                
                if not sale_items:
                    fallback_rev = safe_float(sale.get('net_amount_collected', sale.get('total_amount', 0)))
                    sales_revenue += fallback_rev
                    if chart_key and chart_key in revenue_chart:
                        revenue_chart[chart_key] += fallback_rev
                        profit_chart[chart_key] += fallback_rev
                    continue

                for item in sale_items:
                    sold_qty = safe_float(item.get('quantity', item.get('qty', 0)))
                    
                    if 'net_amount' in item:
                        item_revenue = safe_float(item['net_amount'])
                    else:
                        selling_price = safe_float(item.get('mrp', 0))
                        disc = safe_float(item.get('discount', 0))
                        if disc > 0: selling_price *= (1 - (disc / 100))
                        item_revenue = sold_qty * selling_price

                    inv_item = next((i for i in all_inventory if str(i.get('product_name')).strip() == str(item.get('product_name')).strip()), None)
                    cost_price = safe_float(inv_item.get('true_cost', inv_item.get('board_price', 0))) if inv_item else 0.0
                    item_cogs = sold_qty * cost_price

                    sales_revenue += item_revenue
                    cogs += item_cogs

                    if chart_key and chart_key in revenue_chart:
                        revenue_chart[chart_key] += item_revenue
                        profit_chart[chart_key] += (item_revenue - item_cogs) 
            except Exception as e:
                print(f"Error processing financial sale row: {e}")
                continue

        # 2. PROCESS FINANCIALS FROM INVENTORY
        for item in all_inventory:
            try:
                cost = safe_float(item.get('true_cost', item.get('board_price', 0)))
                current_stock = safe_float(item.get('quantity', item.get('qty', 0)))
                
                history = item.get('purchase_history', [])
                if history:
                    for record in history:
                        rec_date = parse_db_date(record.get('date', record.get('created_at')))
                        if rec_date and (start_date <= rec_date <= end_date):
                            qty_added = safe_float(record.get('quantity_added', record.get('qty', 0)))
                            rec_cost = safe_float(record.get('board_price', cost)) 
                            purchase_val = qty_added * rec_cost
                            total_purchase_cost += purchase_val
                            
                            chart_key = rec_date.strftime('%Y-%m-%d %H:00') if is_hourly else rec_date.strftime('%Y-%m-%d')
                            if chart_key in cost_chart: cost_chart[chart_key] += purchase_val
                else:
                    rec_date = parse_db_date(item.get('created_at', item.get('date')))
                    if rec_date and (start_date <= rec_date <= end_date):
                        purchase_val = current_stock * cost
                        total_purchase_cost += purchase_val
                        chart_key = rec_date.strftime('%Y-%m-%d %H:00') if is_hourly else rec_date.strftime('%Y-%m-%d')
                        if chart_key in cost_chart: cost_chart[chart_key] += purchase_val

                remaining_inventory_value += (current_stock * cost)

                exp = item.get('expiry_date', 'Unknown')
                if exp and str(exp).lower() != 'unknown':
                    try:
                        parts = str(exp).split('/')
                        if len(parts) == 3:
                            y = int(parts[2]); y = y if y > 100 else 2000 + y
                            exp_date = datetime(y, int(parts[1]), int(parts[0]))
                        elif len(parts) == 2:
                            y = int(parts[1]); y = y if y > 100 else 2000 + y
                            exp_date = datetime(y, int(parts[0])+1, 1) - timedelta(days=1)
                        else:
                            exp_date = None
                            
                        if exp_date and start_date <= exp_date <= end_date:
                            loss_val = current_stock * cost 
                            expiry_loss += loss_val
                            chart_key = exp_date.strftime('%Y-%m-%d %H:00') if is_hourly else exp_date.strftime('%Y-%m-%d')
                            if chart_key in profit_chart: profit_chart[chart_key] -= loss_val
                    except Exception:
                        pass
            except Exception as e:
                print(f"Error processing financial inventory item: {e}")
                continue

        # Extra Counters
        for inv in agency_history:
            inv_date = parse_db_date(inv.get('date', inv.get('created_at')))
            if inv_date and (start_date <= inv_date <= end_date): invoices_in_range += 1

        new_customers_count = sum(1 for c in customers if parse_db_date(c.get('created_at')) and (start_date <= parse_db_date(c.get('created_at')) <= end_date))

        # --- FINAL CALCULATIONS ---
        gross_profit = sales_revenue - cogs
        net_profit = gross_profit - expiry_loss

        agency_dues_value = sum(safe_float(l.get('due', 0)) for l in supplier_ledger)
        customer_dues_value = sum(safe_float(l.get('due', 0)) for l in customer_ledger)
        customers_with_dues = len([l for l in customer_ledger if safe_float(l.get('due', 0)) > 0])

        return jsonify({
            "metrics": {
                "total_purchase_cost": total_purchase_cost,
                "sales_revenue": sales_revenue,
                "cogs": cogs,
                "gross_profit": gross_profit,
                "expiry_loss": expiry_loss,
                "net_profit": net_profit,
                "remaining_inventory_value": remaining_inventory_value,
                "agency_dues_value": agency_dues_value,
                "customer_dues_value": customer_dues_value,
                "customers_with_dues": customers_with_dues,
                "sales_count": sales_count_in_range,
                "invoices_uploaded": invoices_in_range,
                "total_customers": len(customers),
                "new_customers": new_customers_count
            },
            "lists": {
                "top_10": top_10,
                "least_10": least_10
            },
            "charts": {
                "is_hourly": is_hourly,
                "dates": list(revenue_chart.keys()),
                "revenue": list(revenue_chart.values()),
                "cost": list(cost_chart.values()),
                "profit": list(profit_chart.values())
            }
        }), 200

    except Exception as e:
        print(f"CRITICAL ERROR IN EXPENSE ROUTE: {str(e)}")
        return jsonify({'error': 'Internal server error processing stats', 'details': str(e)}), 500