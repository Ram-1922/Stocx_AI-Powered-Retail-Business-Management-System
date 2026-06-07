# 🚀 Stocx – AI-Powered Retail & Business Management Platform

<div align="center">

---

# 🌐 Live Application

<div align="center">

### Try Stocx Live

[![Launch Stocx](https://img.shields.io/badge/🚀%20Launch%20Stocx-Live%20Application-success?style=for-the-badge)](https://stocx-ai-powered-retail-business-t5p2.onrender.com/)

</div>

---

### Intelligent Inventory, POS Billing, Financial Tracking & AI Invoice Processing

A modern full-stack retail ERP platform built to help businesses manage inventory, sales, customers, expenses, and financial operations through a unified dashboard powered by AI.

![Python](https://img.shields.io/badge/Python-3.10+-blue)
![Flask](https://img.shields.io/badge/Flask-Backend-green)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-brightgreen)
![Firebase](https://img.shields.io/badge/Firebase-Authentication-orange)
![Gemini](https://img.shields.io/badge/Gemini-AI-blueviolet)

</div>

---

# 📖 Overview

**Stocx** is an enterprise-grade retail and business management system designed to simplify daily operations for retail stores, wholesalers, and small-to-medium businesses.

The platform combines:

* Smart POS Billing
* AI Invoice Processing
* FIFO Inventory Management
* Customer & Supplier Ledger Tracking
* Financial Analytics
* Business Performance Monitoring

into a single centralized system.

Unlike traditional inventory software, Stocx uses AI-assisted document extraction and automated stock lifecycle management to reduce manual data entry and improve operational accuracy.

---

# ✨ Key Features

## 🧾 AI Invoice Processing

Upload invoice images and automatically extract:

* Product Names
* Quantities
* Unit Prices
* Batch Information
* Net Amounts

Powered by **Google Gemini 2.5 Flash**, using a structured extraction workflow specifically designed for retail invoices.

### Highlights

✅ Rule-Based Extraction Logic

✅ Column-Aware Layout Mapping

✅ Zero Auto-Calculation Policy


---

## 🛒 Smart POS Billing System

Fast and efficient checkout experience with:

* Multi-tab billing sessions
* Product search with ranking
* Customer-linked transactions
* Automatic receipt generation
* Transaction history tracking

### Receipt Capture

Every completed bill is automatically archived as a visual receipt image using:

* html2canvas
* Base64 storage workflow

---

## 📦 Advanced Inventory Management

### FIFO Stock Engine

Stocx automatically follows:

**First In → First Out (FIFO)**

ensuring older inventory is sold before newer stock.

Features include:

* Multi-batch inventory tracking
* Expiry date management
* Batch-level quantity monitoring
* Automatic stock depletion
* Dynamic batch switching

### Benefits

* Reduced inventory waste
* Better stock visibility
* Accurate cost calculations

---

## 📊 Business Analytics Dashboard

Monitor business performance in real time.

### Metrics

* Revenue Tracking
* Cost of Goods Sold (COGS)
* Net Profit
* Inventory Valuation
* Expiry Risk Monitoring
* Sales Trends

### Visual Reports

* Daily Sales Analysis
* Monthly Performance Charts
* Hourly Revenue Trends
* Inventory Health Monitoring

---

## 👥 Customer CRM & Ledger Management

Manage customer relationships and financial records efficiently.

### CRM Features

* Customer Profiles
* Purchase History
* Lifetime Value Tracking
* Customer Analytics

### Ledger Features

* Receivables Tracking
* Supplier Payables
* Due Date Monitoring
* Payment History
* Outstanding Balance Management

---

# 🏗️ System Architecture

```text
                    ┌───────────────────────────┐
                    │      Web Frontend UI      │
                    └─────────────┬─────────────┘
                                  │
                          HTTPS Requests
                                  │
                    ┌─────────────▼─────────────┐
                    │      Flask Backend        │
                    └─────────────┬─────────────┘
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       │                          │                          │
┌──────▼──────┐          ┌────────▼────────┐        ┌────────▼────────┐
│ AI Parser   │          │ Inventory FIFO │        │ Analytics Engine│
│ (Gemini)    │          │ Processing     │        │ & Reporting     │
└──────┬──────┘          └────────┬────────┘        └────────┬────────┘
       │                          │                          │
       └──────────────────────────┼──────────────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │        MongoDB Atlas      │
                    └───────────────────────────┘
```

---

# 🛠️ Technology Stack

| Layer           | Technologies                                       |
| --------------- | -------------------------------------------------- |
| Frontend        | HTML5, Tailwind CSS, JavaScript (ES6), html2canvas |
| Backend         | Python, Flask, Werkzeug                            |
| Database        | MongoDB Atlas, PyMongo                             |
| Authentication  | Firebase Authentication                            |
| AI Engine       | Google Gemini 2.5 Flash                            |
| Version Control | Git & GitHub                                       |

---

# 🔐 Authentication & Security

Stocx follows a multi-tenant architecture where:

* Every user operates within an isolated workspace
* User data is segregated through authenticated sessions
* Secure login is handled via Firebase Authentication
* Flask session management controls backend access

This ensures that business data remains isolated and protected.

---

# ⚙️ Installation

## 1. Clone Repository

```bash
git clone https://github.com/yourusername/stocx.git
cd stocx
```

## 2. Create Virtual Environment

```bash
python -m venv venv
```

### Windows

```bash
venv\Scripts\activate
```

### Linux / macOS

```bash
source venv/bin/activate
```

## 3. Install Dependencies

```bash
pip install -r requirements.txt
```

---

# 🔧 Environment Variables

Create a `.env` file:

```env
FLASK_APP=run.py
FLASK_ENV=development

SECRET_KEY=your_secret_key

MONGO_URI=your_mongodb_connection_string

GEMINI_API_KEY=your_gemini_api_key
```

---

# ▶️ Running the Application

Start MongoDB (or connect Atlas), then run:

```bash
python run.py
```

Visit:

```text
http://127.0.0.1:5000
```

---

# 📁 Project Structure

```text
stocx/
│
├── app/
│   ├── auth/
│   ├── inventory/
│   ├── billing/
│   ├── customers/
│   ├── expenses/
│   └── analytics/
│
├── static/
├── templates/
├── gemini_parser.py
├── run.py
├── requirements.txt
└── .env
```

---

# 🔮 Roadmap

### Planned Features

* [ ] Low Stock Prediction Engine
* [ ] Automated Reorder Suggestions
* [ ] Offline Billing Support
* [ ] IndexedDB Synchronization
* [ ] Mobile Companion App
* [ ] WhatsApp Invoice Sharing
* [ ] Multi-Store Management
* [ ] Barcode Scanner Integration
* [ ] Advanced Business Forecasting

---

# 🤝 Contributing

Contributions, feature suggestions, and issue reports are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Submit a pull request

---

# 👨‍💻 Authors

- **[Pranav S](https://github.com/pranav-1906)**
- **[Sri Ram M](https://github.com/Ram-1922)**

Computer Science Engineering Students  
Full Stack Developers • Retail-Tech Builders

Built with a focus on speed, scalability, automation, and real-world business usability.

---

## ⭐ Support

If you found this project useful, consider giving the repository a star.

It helps others discover the project and supports future development.
