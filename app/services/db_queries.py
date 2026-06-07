from datetime import datetime, timedelta

def get_dashboard_metrics(db):
    """Calculates inventory alerts and metrics directly in MongoDB."""
    
    # 1. Total unique products in stock
    total_products = db.inventory.count_documents({})
    
    # 2. Low Stock Alerts (Example: items with less than 10 units)
    low_stock_count = db.inventory.count_documents({"quantity": {"$lt": 10}})
    
    # 3. Expiring Soon (Example: items expiring within the next 30 days)
    today = datetime.now()
    thirty_days_from_now = (today + timedelta(days=30)).strftime('%Y-%m-%d')
    today_str = today.strftime('%Y-%m-%d')
    
    expiring_soon_count = db.inventory.count_documents({
        "expiry_date": {
            "$gte": today_str,
            "$lte": thirty_days_from_now
        },
        "expiry_date": {"$ne": "Unknown"} # Ignore items where Gemini couldn't find a date
    })
    
    return {
        "total_products": total_products,
        "low_stock_alerts": low_stock_count,
        "expiring_soon": expiring_soon_count
    }