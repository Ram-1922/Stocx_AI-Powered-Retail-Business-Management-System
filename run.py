import os
from flask import Flask, render_template, session, redirect
from flask_cors import CORS
from pymongo import MongoClient
from dotenv import load_dotenv
from flask import redirect

load_dotenv()

# Tell Flask where to find the static files and templates
app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app) 
# REQUIRED for secure sessions (Login state)
app.secret_key = os.getenv('SECRET_KEY', 'super-secret-development-key-change-in-production')
# --- REGISTER YOUR BLUEPRINTS (APIs) ---
# Database Connection
client = MongoClient(os.getenv("MONGO_URI"))
db = client.stocx_db
app.config['DB'] = db

# Register blueprints
from app.routes.inventory import inventory_bp
from app.routes.billing import billing_bp
from app.routes.auth import auth_bp
# 1. Import the new blueprint at the top of app.py
from app.routes.customers import customers_bp  # Adjust the import path if it's in a subfolder like 'routes.customers'
from app.routes.history import history_bp
from app.routes.profile_api import profile_bp
from app.routes.credits import credits_bp
from app.routes.expense import expense_bp

app.register_blueprint(credits_bp, url_prefix='/api/credits')

# 2. Register it down where your other blueprints are registered
app.register_blueprint(history_bp, url_prefix='/api/history')
app.register_blueprint(customers_bp, url_prefix='/api/customers')
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(inventory_bp, url_prefix='/api/inventory')
app.register_blueprint(billing_bp, url_prefix='/api/billing')
app.register_blueprint(profile_bp, url_prefix='/api/profile')
app.register_blueprint(expense_bp, url_prefix='/api/expense')

# --- FRONTEND UI ROUTES ---

@app.route('/auth')
def auth_page():
    # Send them back to the main page where the modal is!
    return redirect('/')

@app.route('/')
def home():
    """The Public Dashboard. Accessible to everyone."""
    # Check if a session exists
    is_logged_in = 'user_email' in session
    shop_name = session.get('shop_name', 'Store Manager Pro')
    
    # Pass the login status to the HTML file so it can change the buttons dynamically
    return render_template('dashboard.html', is_logged_in=is_logged_in, shop_name=shop_name)

@app.route('/inventory')
def inventory_page():
    """PROTECTED: Renders the Inventory Management UI."""
    if 'user_email' not in session:
        return redirect('/auth') # Bounce unauthorized users to login
    return render_template('inventory.html')

@app.route('/billing')
def billing_page():
    """PROTECTED: Renders the POS Billing UI."""
    if 'user_email' not in session:
        return redirect('/auth') # Bounce unauthorized users to login
    return render_template('billing.html')

@app.route('/customers')
def customers_page():
    """Renders the Customer CRM Database page."""
    # Ensure only logged-in users can access this page
    if 'user_email' not in session:
        return redirect(url_for('login'))
        
    return render_template('customers.html')

@app.route('/history')
def history_page():
    """Renders the History & Records dashboard."""
    # Ensure only logged-in users can access this page
    if 'user_email' not in session:
        return redirect(url_for('login')) # Adjust 'login' to your actual login route name if different
        
    return render_template('history.html')

@app.route('/credits')
def credits_page():
    """PROTECTED: Renders the Credits & Ledger UI."""
    if 'user_email' not in session:
        return redirect('/auth') 
    return render_template('credits.html')

@app.route('/expense')
def expense_page():
    """PROTECTED: Renders the Analytics & Expense Dashboard."""
    if 'user_email' not in session:
        return redirect('/auth')
    return render_template('expense.html')

if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0", port=5000)