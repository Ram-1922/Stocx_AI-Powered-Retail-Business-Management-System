import os
import json
import re
import time
import google.generativeai as genai
# FIX 1: Add PngImagePlugin to stop the Pillow crash
from PIL import Image, PngImagePlugin 

def process_invoice(image_path):
    print("\n--- WAKING UP GEMINI 2.5 FLASH (MASTER ACCOUNTANT MODE) ---", flush=True)
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    
    try:
        with Image.open(image_path) as img:
            img.thumbnail((2000, 2000)) 
            
            prompt = """
You are an elite, hyper-accurate Data Extraction and Accounting AI. Your absolute mandate is to read wholesale/retail invoices and extract EVERY SINGLE product line item with 100% precision. 

CRITICAL MANDATE: ALL PRICES MUST BE TAX-INCLUSIVE.
Invoices often show a "Base Rate" and add GST/Tax later. You MUST calculate the true, tax-inclusive price for each item.

INSTRUCTION WORKFLOW:
1. Identify the primary Seller/Agency Name and the Invoice Date at the top.
2. Locate the main product table. Identify columns for: Product Name, Quantity, MRP, Unit Price/Rate, Tax/GST, and Final Row Amount.
3. LINE-BY-LINE EXTRACTION: Process the table row by row. DO NOT skip any rows. If there are 30 items, output 30 objects.
4. STRICT FILTERING: Ignore header rows, page numbers, subtotal lines, global tax summaries at the bottom, freight charges, and terms. Extract ONLY physical products.
5.REJECT AS QUANTITY: UPC, SPC, HSN, SKU, item codes, product codes, batch numbers, barcode numbers, and serial numbers.
6.Take as Net Amount (row total): Net Amt, Net Amount, Amount, Final Amount, Row Total, Line Total, Invoice Value, Item Total, Total Value.
7.Take as Unit Cost (printed rate only): Rate, Unit Rate, Sale Rate, Net Rate, Cost, Price, Basic Rate, Taxable Rate, PTR, PTS, Unit Price.
8.Do NOT use as Cost or Quantity: Gross, SCH, Discount Amt, Taxable Amt, GST %, IGST/CGST Amt, SGST Amt, CESS Amt, TCS Amt, UPC, SPC, HSN, SKU, batch no, barcode, serial no.
9.Take as MRP: MRP, M.R.P, Maximum Retail Price, Retail Price, List Price (only if clearly indicated as MRP).
10.ROW-BY-ROW EXTRACTION IS MANDATORY: Process every table row sequentially from top to bottom without skipping any product row. Analyze all columns in the current row and ensure every extracted field belongs to that exact row only.
11.STRICT COLUMN ALIGNMENT: Carefully match Product Name, Quantity, MRP, Cost, Tax, and Net Amount using visual row-column alignment. Never take values from adjacent rows, wrapped rows, previous rows, or next rows.
12.COMPLETENESS REQUIREMENT: Examine every row and every column in the product table before producing output. Missing rows, skipped products, or cross-row value assignments are considered extraction failures.
13.use pixel by pixel extraction

MATHEMATICAL RULES FOR TAX-INCLUSION (DO NOT IGNORE):
- "net_amount": Extract the FINAL, TAX-INCLUSIVE TOTAL AMOUNT for that specific row. This is usually the right-most column. If the invoice separates the Base Amount and the Tax Amount on the same row, you MUST add them together to get the true `net_amount`.
- "cost" (Unit Price): This MUST be the Tax-Inclusive Unit Price per item. To guarantee 100 percent accuracy, you should calculate this as: (`net_amount` / `quantity`). Do not blindly copy the "Rate" column if it excludes tax.

STRIP SYMBOLS: Remove ₹, $, Rs, %, and commas from all numbers. Output pure numbers (e.g., 1,500.50 -> 1500.50).

REQUIRED JSON KEYS FOR EVERY OBJECT:
- "product_name": (string) The exact printed item description.
- "quantity": (number) The EXACT printed quantity (e.g., if it says 10, output 10. Do not convert cases to units).
- "cost": (number) The TAX-INCLUSIVE Unit Price (Calculated as `net_amount` / `quantity`).
- "mrp": (number) The exact printed MRP. Output 0 if missing.
- "net_amount": (number) The final, tax-inclusive total amount for the row.
- "expiry_date": (string) Format MM/YY. Output "Unknown" if completely missing.
- "agency": (string) The Seller/Distributor Name identified in step 1.
- "date_of_purchase": (string) The Invoice Date identified in step 1.

OUTPUT FORMAT:
Return ONLY a valid JSON array of objects. Do not wrap it in markdown (no ```json). Do not add any conversational text.
"""
            # FIX 3: Removed the duplicate "cost" key instruction that was right above "net_amount"
            
            model = genai.GenerativeModel('gemini-2.5-flash')
            print("Sending image to Google servers... Performing semantic extraction...", flush=True)
            start_time = time.time()
            
            try:
                # ONE-SHOT EXECUTION: No loops, no retries.
                response = model.generate_content(
                    [prompt, img],
                    generation_config={
                        "temperature": 0.0
                        # Removed the response_mime_type line here!
                    }, 
                    request_options={"timeout": 180} # Hard cap at 180 seconds
                )
            except Exception as api_error:
                error_msg = str(api_error).lower()
                # Intercept the exact failure and turn it into a readable message for the user UI
                if "504" in error_msg or "timeout" in error_msg or "timed out" in error_msg:
                    raise Exception("Google's servers took too long to read the image. Please click Scan to try again.")
                elif "429" in error_msg:
                    raise Exception("AI API Quota exceeded. Please try again later.")
                else:
                    raise Exception(f"AI Server Error: {str(api_error)}")
            
            end_time = time.time()
            print(f"⚡ AI Processing completed in {end_time - start_time:.2f} seconds!", flush=True)

       # Parse the JSON
        raw_text = response.text.strip()
        
        # FIX: Strip out the markdown code blocks that Gemini adds
        raw_text = raw_text.replace("```json", "").replace("```", "").strip()
        
        try:
            structured_data = json.loads(raw_text)
            print(f"SUCCESS: Extracted {len(structured_data)} physical products seamlessly.", flush=True)
            return structured_data
        except json.JSONDecodeError:
            print("\n!!! FORMATTING ERROR !!!\nRaw Output:", raw_text, flush=True)
            # Check your terminal if this happens to see what Gemini actually returned!
            return []
    except Exception as e:
        # This catches our custom exceptions above and passes them cleanly to inventory.py
        print(f"ABORTED: {e}", flush=True)
        
        # Re-raise the exception so inventory.py can send it to the frontend via jsonify
        raise Exception(str(e))