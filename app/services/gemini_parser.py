import os
import json
import re
import time
import google.generativeai as genai
# PngImagePlugin import kept on purpose: avoids a Pillow crash on some PNGs
from PIL import Image, ImageOps, ImageEnhance, PngImagePlugin  # noqa: F401

# ----------------------------------------------------------------------------
# SETTINGS
# ----------------------------------------------------------------------------
MODEL_NAME = "gemini-2.5-flash"
MAX_IMAGE_SIDE = 3000          # long side cap in pixels (old code used 2000)
API_TIMEOUT_SECONDS = 180      # hard cap, one-shot, no retries (same as before)
COST_DECIMALS = 2              # decimals kept for the unit cost
COUNT_FREE_QTY_IN_STOCK = True # free/scheme pieces enter stock; cost = net / (billed + free)
INCLUDE_REVIEW_FIELDS = True   # adds gst_percent, needs_review, review_note to each item


# ----------------------------------------------------------------------------
# PROMPT  (AI only READS. Python does all arithmetic.)
# ----------------------------------------------------------------------------
EXTRACTION_PROMPT = """
You are a meticulous invoice-READING engine for a retail inventory system.
Your only job is to copy printed values exactly as they appear, row by row.
You do NOT calculate, estimate, round, correct, or "fix" anything. Software does all arithmetic after you.

The image may be a phone photo (tilted, skewed, shadows, fingers in frame). Suppliers use very different layouts and column names, so NEVER assume a fixed layout or column order.

==================== STEP 1: INVOICE HEADER (outside the table) ====================
- "seller": the company that ISSUED the invoice (logo / "Registered Name" / "Sold By" / "From" / "Distributor"). It is NOT the customer: ignore "Customer Name", "Bill To", "Ship To", "Buyer", "Party", "Retailer".
- "invoice_date": the invoice / bill date exactly as printed. NOT the PO date, due date, DL expiry, FSSAI expiry or licence dates.
- "invoice_number": as printed, else null.
- "invoice_total": the final payable amount of the WHOLE invoice ("Net Payable", "Grand Total", "Invoice Total", "Amount Payable", "Total Amount"). null if not printed.
- "declared_total_qty": total pieces/units if a summary table prints it (e.g. a "Total" row with a Pcs/Qty figure). null if not printed.

==================== STEP 2: MAP THE COLUMNS FIRST ====================
Before reading any data row, read the whole table header (it may be wrapped over two lines or abbreviated) from left to right.
In "column_map" list every header exactly as printed, in order, and give each one a role by its MEANING (not by position or spelling):

serial          : SI, S.No, Sl, No
product_name    : Item, Item Description, Particulars, Description, Product
mrp             : MRP, M.R.P, Maximum Retail Price (List Price only if clearly MRP)
cases           : Cs, Cases, Cartons, Box, Case Qty
pieces          : Pcs, Pieces, Qty, Quantity, Units, Nos, Billed Qty
units_per_case  : UPC, Units/Case, Pack, Pack Size, Conv, Case Size  (a PACK-SIZE number, NOT a quantity bought)
free_qty        : Free, Free Qty, Scheme Qty, Bonus
rate            : Pc Price, Rate, Unit Price, Unit Rate, Sale Rate, Basic Rate, PTR, PTS, Price (printed per-unit price, before discount and tax)
gross_amount    : Gross, Gross Amt (rate x qty before discounts); "Amount" when it clearly is that
taxable_amount  : Taxable, Taxable Amt, Taxable Value
gst_percent     : GST %, Tax %, IGST %  (the combined slab as printed; if only separate CGST% / SGST% are printed, return null)
cgst_amt        : CGST Amt (if the invoice has a separate SGST column, "IGST/CGST Amt" is CGST)
sgst_amt        : SGST / UTGST Amt
igst_amt        : IGST Amt (only when there is no separate SGST column)
cess_amt        : Cess Amt
net_amount      : Net Amt, Net Amount, Line Total, Item Total, Final Amount, Total (the final per-row total incl. tax, usually the right-most amount)
expiry          : Exp, Expiry, Exp Date (PRODUCT expiry, per row only)
ignore          : discounts (SCH, Disc), HSN, product code / PCode, SKU, batch, barcode, serial/IMEI, TCS, margin, anything else

If two columns look alike, decide using the numbers on several rows (Gross = Pc Price x qty, Taxable = Gross - discounts, Net = Taxable + taxes). You may use arithmetic ONLY to confirm which column is which, never to change a value you read.

==================== STEP 3: READ EVERY ROW ====================
- Go through the table strictly top to bottom, ONE row at a time. One JSON object per physical product row. Never skip a row, never merge rows, never invent rows.
- A product name wrapped onto two lines belongs to ONE row; join it into one name.
- ROW ALIGNMENT: every number in an object must sit on the same horizontal line as that row's product name. Before moving to the next row, confirm the values did not come from the row above or below. Use the printed serial number (SI) to stay in sync, and make sure serials are continuous.
- Include a product row even if its amounts are 0 (free goods). Exclude: header rows, repeated page headers, sub-totals, page totals, GST summary tables, freight / round-off / other charges, bank details, terms and conditions.
- If the table continues over several images/pages, they are consecutive parts of ONE invoice: keep reading in order.

==================== NUMBER RULES ====================
- Copy digits exactly as printed. Remove currency symbols (₹ $ Rs), % and thousands commas. "1,50,000.50" -> 150000.50. Never add or drop decimals.
- A cell that is empty, or a column that does not exist -> null. Use 0 only if a 0 is actually printed.
- If a digit is not legible, use null. NEVER guess.
- Quantity columns: output cases, pieces and units_per_case SEPARATELY, exactly as printed, for whichever of these columns exist. Do not multiply or add them. A plain "Qty" column goes in "pieces". HSN, UPC, SPC, SKU, batch and barcode numbers are never quantities or amounts.
- Expiry: only a per-row product expiry, written MM/YY. If the invoice has no per-row expiry, use "Unknown". Licence / DL / FSSAI expiry dates in the header are NOT product expiry.

==================== OUTPUT ====================
Return ONLY one valid JSON object, no markdown, no commentary:
{
  "invoice": {"seller": "", "invoice_date": "", "invoice_number": null, "invoice_total": null, "declared_total_qty": null},
  "column_map": [{"header": "", "role": ""}],
  "rows": [
    {
      "serial": 1,
      "product_name": "",
      "mrp": null,
      "cases": null,
      "pieces": null,
      "units_per_case": null,
      "free_qty": null,
      "rate": null,
      "gross_amount": null,
      "taxable_amount": null,
      "gst_percent": null,
      "cgst_amt": null,
      "sgst_amt": null,
      "igst_amt": null,
      "cess_amt": null,
      "net_amount": null,
      "expiry_date": "Unknown"
    }
  ]
}
"""


# ----------------------------------------------------------------------------
# HELPERS
# ----------------------------------------------------------------------------
def _prepare_image(path):
    """Fix phone-photo orientation, normalise colour/contrast, cap the size."""
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)       # respects the phone's rotation flag
        im = im.convert("RGB")
        im.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.LANCZOS)
        im = ImageOps.autocontrast(im, cutoff=1)
        im = ImageEnhance.Sharpness(im).enhance(1.4)
        return im


def _num(v):
    """Printed value -> float, or None when missing/unreadable."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s or s.lower() in {"null", "none", "n/a", "na", "-", "--", "unknown"}:
        return None
    s = re.sub(r"(?i)rs\.?|inr|[₹$,%\s]", "", s)
    try:
        return float(s)
    except ValueError:
        m = re.search(r"-?\d+(?:\.\d+)?", s)
        return float(m.group()) if m else None


_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def _norm_expiry(v):
    """Anything date-like -> 'MM/YY', otherwise 'Unknown'."""
    if v is None:
        return "Unknown"
    s = str(v).strip()
    if s.lower() in {"", "unknown", "null", "none", "n/a", "na", "-", "--"}:
        return "Unknown"
    m = re.fullmatch(r"(\d{1,2})\s*[/\-.]\s*(\d{2}|\d{4})", s)
    if m and 1 <= int(m.group(1)) <= 12:
        return f"{int(m.group(1)):02d}/{m.group(2)[-2:]}"
    m = re.fullmatch(r"\d{1,2}\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})", s)   # dd/mm/yyyy
    if m and 1 <= int(m.group(1)) <= 12:
        return f"{int(m.group(1)):02d}/{m.group(2)[-2:]}"
    m = re.fullmatch(r"([A-Za-z]{3})[A-Za-z]*[\s/\-.,]*(\d{2}|\d{4})", s)      # Mar-27, March 2027
    if m and m.group(1).lower() in _MONTHS:
        return f"{_MONTHS[m.group(1).lower()]:02d}/{m.group(2)[-2:]}"
    return "Unknown"


def _tidy(x):
    """12.0 -> 12 (int), otherwise keep the float."""
    return int(x) if float(x).is_integer() else x


def _extract_json(text):
    """Parse the model reply even if it wrapped it in ``` fences or added chatter."""
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    for open_c, close_c in (("{", "}"), ("[", "]")):
        i, j = t.find(open_c), t.rfind(close_c)
        if i != -1 and j > i:
            try:
                return json.loads(t[i:j + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError("no valid JSON found")


def _salvage_rows(text):
    """If the reply was cut off mid-way, recover every COMPLETE row object."""
    m = re.search(r'"rows"\s*:\s*\[', text)
    if not m:
        return []
    dec, pos, rows = json.JSONDecoder(), m.end(), []
    while True:
        nxt = text.find("{", pos)
        if nxt == -1:
            break
        try:
            obj, pos = dec.raw_decode(text, nxt)
        except json.JSONDecodeError:
            break
        rows.append(obj)
    return rows


# ----------------------------------------------------------------------------
# MATH + VALIDATION  (the only place numbers are calculated)
# ----------------------------------------------------------------------------
def _resolve_quantity(r, notes):
    """Billed quantity from the printed qty columns, cross-checked with gross / rate."""
    cases, pieces, upc = _num(r.get("cases")), _num(r.get("pieces")), _num(r.get("units_per_case"))
    rate, gross = _num(r.get("rate")), _num(r.get("gross_amount"))

    printed = None
    if cases and upc:                       # case-based invoice: cases x units-per-case + loose pieces
        printed = cases * upc + (pieces or 0)
    elif cases is not None or pieces is not None:
        printed = (pieces or 0) + (cases or 0)

    implied = None                          # gross / rate must be a whole number of units
    if gross and rate and gross > 0 and rate > 0:
        q = gross / rate
        if q >= 0.5 and abs(q - round(q)) <= 0.02 + 0.001 * q:
            implied = float(round(q))

    if printed is not None and implied is not None:
        if abs(printed - implied) < 0.5:
            return printed
        notes.append(f"qty from columns ({printed:g}) != gross/rate ({implied:g}); used {implied:g}")
        return implied
    if printed:
        return printed
    if implied is not None:
        notes.append("qty columns unreadable; derived from gross/rate")
        return implied
    notes.append("quantity not found")
    return 0.0


def _build_item(r, seller, inv_date):
    """One raw row -> final inventory item (plus review flags)."""
    notes = []
    name = str(r.get("product_name") or "").strip()

    billed = _resolve_quantity(r, notes)
    free = _num(r.get("free_qty")) or 0.0
    qty = billed + free if COUNT_FREE_QTY_IN_STOCK else billed

    # ---- GST + net total ----
    taxable, gst_pct, gross = _num(r.get("taxable_amount")), _num(r.get("gst_percent")), _num(r.get("gross_amount"))
    main_taxes = [_num(r.get(k)) for k in ("cgst_amt", "sgst_amt", "igst_amt")]
    known_main = [t for t in main_taxes if t is not None]
    cess = _num(r.get("cess_amt")) or 0.0

    if known_main:
        tax_total = sum(known_main) + cess
        if taxable and gst_pct is not None and taxable > 5:
            slab_seen = sum(known_main) / taxable * 100
            if abs(slab_seen - gst_pct) > 0.5:
                notes.append(f"GST% {gst_pct:g} does not match tax amounts ({slab_seen:.1f}%)")
    elif taxable is not None and gst_pct is not None:
        tax_total = taxable * gst_pct / 100.0          # GST calculation (amounts not printed)
    else:
        tax_total = None

    computed_net = taxable + tax_total if (taxable is not None and tax_total is not None) else None
    net = _num(r.get("net_amount"))
    if net is None:
        if computed_net is not None:
            net = computed_net                          # total calculation (net not printed)
        elif taxable is not None:
            net = taxable
            notes.append("no GST info; net = taxable amount")
        elif gross is not None:
            net = gross
            notes.append("no tax/net info; net = gross amount")
        else:
            net = 0.0
            notes.append("net amount not found")
    elif computed_net is not None and abs(net - computed_net) > max(1.0, 0.005 * net):
        notes.append(f"net {net:.2f} != taxable + GST {computed_net:.2f}")

    # ---- unit price (tax-inclusive) ----
    cost = round(net / qty, COST_DECIMALS) if qty > 0 else 0.0
    mrp = _num(r.get("mrp")) or 0.0
    if mrp > 0 and cost > mrp:
        notes.append(f"unit cost {cost:g} is above MRP {mrp:g}")

    item = {
        "product_name": name,
        "quantity": _tidy(qty),
        "cost": cost,
        "mrp": mrp,
        "net_amount": round(net, 2),
        "expiry_date": _norm_expiry(r.get("expiry_date")),
        "agency": seller,
        "date_of_purchase": inv_date,
    }
    if INCLUDE_REVIEW_FIELDS:
        item["gst_percent"] = gst_pct
        item["needs_review"] = bool(notes)
        item["review_note"] = "; ".join(notes)
    return item


def _clean_rows(raw_rows, warnings):
    """Drop junk/total rows and exact duplicates; report gaps in the serial sequence."""
    rows, seen, serials = [], set(), []
    for r in raw_rows:
        if not isinstance(r, dict):
            continue
        name = str(r.get("product_name") or "").strip()
        if not name or re.fullmatch(r"(?i)\s*(sub\s*)?(grand\s*)?total\s*:?", name):
            continue
        key = (r.get("serial"), name.lower(), _num(r.get("net_amount")))
        if key in seen:
            warnings.append(f"duplicate row removed: {name}")
            continue
        seen.add(key)
        rows.append(r)
        s = _num(r.get("serial"))
        if s is not None:
            serials.append(int(s))

    if len(serials) >= max(3, 0.7 * len(rows)):
        missing = sorted(set(range(min(serials), max(serials) + 1)) - set(serials))
        if missing:
            warnings.append(f"serial numbers missing from output (rows possibly skipped): {missing}")
    return rows


def _reconcile(items, inv, warnings):
    """Compare what we extracted with the totals printed on the invoice."""
    total_net = round(sum(i["net_amount"] for i in items), 2)
    total_qty = sum(i["quantity"] for i in items)

    printed_total = _num(inv.get("invoice_total"))
    if printed_total:
        diff = round(printed_total - total_net, 2)
        if abs(diff) > max(2.0, 0.005 * printed_total):
            warnings.append(
                f"row totals add up to {total_net:.2f} but invoice total is {printed_total:.2f} "
                f"(difference {diff:+.2f}): rows/pages may be missing, or the invoice has extra "
                f"charges/discounts")

    declared_qty = _num(inv.get("declared_total_qty"))
    if declared_qty and abs(declared_qty - total_qty) > 0.5:
        warnings.append(f"extracted quantity {total_qty:g} != quantity printed on invoice {declared_qty:g}")
    return total_net


# ----------------------------------------------------------------------------
# MAIN ENTRY POINTS
# ----------------------------------------------------------------------------
def process_invoice_with_report(image_path):
    """
    image_path: one path, or a list of paths for a multi-page invoice (in page order).
    Returns {"items": [...], "warnings": [...], "invoice": {...}, "rows_total": float, "column_map": [...]}
    """
    print("\n--- WAKING UP GEMINI 2.5 FLASH (ROW-BY-ROW READER MODE) ---", flush=True)
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

    try:
        paths = [image_path] if isinstance(image_path, (str, os.PathLike)) else list(image_path)
        images = [_prepare_image(p) for p in paths]

        prompt = EXTRACTION_PROMPT
        if len(images) > 1:
            prompt += f"\nNOTE: {len(images)} images follow, in page order. They are ONE invoice.\n"

        model = genai.GenerativeModel(MODEL_NAME)
        print("Sending image to Google servers... Reading table row by row...", flush=True)
        start_time = time.time()

        try:
            # ONE-SHOT EXECUTION: no loops, no retries.
            response = model.generate_content(
                [prompt, *images],
                generation_config={
                    "temperature": 0.0,
                    "max_output_tokens": 65536,   # long invoices must not be cut off mid-table
                },
                request_options={"timeout": API_TIMEOUT_SECONDS},
            )
        except Exception as api_error:
            error_msg = str(api_error).lower()
            if "504" in error_msg or "timeout" in error_msg or "timed out" in error_msg:
                raise Exception("Google's servers took too long to read the image. Please click Scan to try again.")
            elif "429" in error_msg:
                raise Exception("AI API Quota exceeded. Please try again later.")
            else:
                raise Exception(f"AI Server Error: {str(api_error)}")

        print(f"⚡ AI Processing completed in {time.time() - start_time:.2f} seconds!", flush=True)

        try:
            raw_text = response.text
        except ValueError:
            raise Exception("The AI returned no readable content (blocked or empty). Please rescan with a clearer photo.")

        warnings = []
        try:
            data = _extract_json(raw_text)
        except ValueError:
            salvaged = _salvage_rows(raw_text)
            if not salvaged:
                print("\n!!! FORMATTING ERROR !!!\nRaw Output:", raw_text, flush=True)
                raise Exception("The AI returned an unreadable response. Please click Scan to try again.")
            warnings.append(f"AI reply was cut off; recovered {len(salvaged)} complete rows only")
            data = {"invoice": {}, "rows": salvaged}

        if isinstance(data, list):                      # model returned a bare array
            data = {"invoice": {}, "rows": data}
        inv = data.get("invoice") or {}
        seller = str(inv.get("seller") or "").strip() or "Unknown"
        inv_date = str(inv.get("invoice_date") or "").strip() or "Unknown"

        rows = _clean_rows(data.get("rows") or [], warnings)
        items = [_build_item(r, seller, inv_date) for r in rows]
        rows_total = _reconcile(items, inv, warnings)

        flagged = sum(1 for i in items if i.get("needs_review"))
        print(f"SUCCESS: Extracted {len(items)} physical products ({flagged} flagged for review).", flush=True)
        for w in warnings:
            print(f"WARNING: {w}", flush=True)
        for i in items:
            if i.get("needs_review"):
                print(f"  REVIEW: {i['product_name']} -> {i['review_note']}", flush=True)

        return {
            "items": items,
            "warnings": warnings,
            "invoice": inv,
            "rows_total": rows_total,
            "column_map": data.get("column_map") or [],
        }

    except Exception as e:
        print(f"ABORTED: {e}", flush=True)
        raise Exception(str(e))


def process_invoice(image_path):
    """Backward-compatible wrapper: returns just the list of items for inventory.py."""
    return process_invoice_with_report(image_path)["items"]