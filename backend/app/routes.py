import io, csv, os, re, json
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file
from .utils import (
    get_db_connection, estimate_missing_data,
    validate_data_with_groq, call_groq_api,
    risk_to_confidence, get_recommendation, build_audit_trail,
    EF_ELECTRICITY, EF_DIESEL, EF_TRANSPORT
)
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

main_bp = Blueprint('main', __name__)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

EF_SUPPLIER_TRANSPORT = 0.21
EF_SUPPLIER_MATERIAL  = 0.05
EF_SUPPLIER_ENERGY    = 0.82

# ── /data ─────────────────────────────────────────────────────────────────────

@main_bp.route('/data', methods=['POST'])
def submit_data():
    data = request.json

    est_electricity = not bool(data.get('electricity_kwh'))
    est_diesel      = not bool(data.get('diesel_liters'))
    est_transport   = not bool(data.get('transport_km'))

    electricity = float(data.get('electricity_kwh')) if data.get('electricity_kwh') else estimate_missing_data("electricity consumption in kWh")
    diesel      = float(data.get('diesel_liters'))   if data.get('diesel_liters')   else estimate_missing_data("diesel consumption in liters")
    transport   = float(data.get('transport_km'))    if data.get('transport_km')    else estimate_missing_data("transport distance in km")

    scope1 = diesel      * EF_DIESEL
    scope2 = electricity * EF_ELECTRICITY
    scope3 = transport   * EF_TRANSPORT
    total  = scope1 + scope2 + scope3

    risk, explanation = validate_data_with_groq(electricity, diesel, transport)
    recommendation    = get_recommendation(scope1, scope2, scope3, total)

    conn = get_db_connection()
    cur  = conn.cursor()
    cur.execute(
        "INSERT INTO activity_data (electricity_kwh, diesel_liters, transport_km) VALUES (%s,%s,%s) RETURNING id",
        (electricity, diesel, transport)
    )
    activity_id = cur.fetchone()[0]
    cur.execute(
        "INSERT INTO ghg_records (activity_id,scope1,scope2,scope3,total_emissions,fraud_risk,explanation) VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (activity_id, scope1, scope2, scope3, total, risk, explanation)
    )
    conn.commit(); cur.close(); conn.close()

    return jsonify({
        "status":         "success",
        "calculated":     {"scope1": scope1, "scope2": scope2, "scope3": scope3, "total": total},
        "validation":     {"risk": risk, "explanation": explanation},
        "estimation":     {"electricity": est_electricity, "diesel": est_diesel, "transport": est_transport},
        "confidence":     risk_to_confidence(risk),
        "recommendation": recommendation,
        "audit":          build_audit_trail("manual", "Verified" if risk != "High" else "Flagged"),
    })

# ── /dashboard ────────────────────────────────────────────────────────────────

@main_bp.route('/dashboard', methods=['GET'])
def get_dashboard():
    from psycopg2.extras import RealDictCursor
    conn = get_db_connection()
    cur  = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM ghg_records ORDER BY created_at ASC")
    records = cur.fetchall()
    cur.close(); conn.close()
    return jsonify(records)

# ── /ai ───────────────────────────────────────────────────────────────────────

@main_bp.route('/ai', methods=['POST'])
def ai_insights():
    from psycopg2.extras import RealDictCursor
    data     = request.json
    question = data.get('question')

    conn = get_db_connection()
    cur  = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT total_emissions, scope1, scope2, scope3 FROM ghg_records ORDER BY created_at DESC LIMIT 5")
    recent_data = cur.fetchall()
    cur.close(); conn.close()

    prompt = (
        f"Context: You are an ESG advisor for DemoSteel Pvt Ltd (Steel sector). "
        f"The last 5 emission records are {recent_data}. "
        f"User asks: {question}. Provide a short, actionable response regarding ESG and Carbon reduction."
    )
    headers = {
        "Authorization": "Bearer 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",
        "Content-Type":  "application/json"
    }
    payload = {"model": "llama-3.1-8b-instant", "messages": [{"role": "user", "content": prompt}]}
    import requests as req
    try:
        res    = req.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers=headers)
        answer = res.json()['choices'][0]['message']['content']
    except Exception:
        answer = "Sorry, the AI service is currently unavailable."

    return jsonify({"answer": answer})

# ── /upload_csv ───────────────────────────────────────────────────────────────

@main_bp.route('/upload_csv', methods=['POST'])
def upload_csv():
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file uploaded"}), 400

    file = request.files['file']
    if file.filename == '' or not file.filename.endswith('.csv'):
        return jsonify({"status": "error", "message": "Please upload a valid .csv file"}), 400

    stream   = io.StringIO(file.stream.read().decode("UTF-8"))
    reader   = csv.DictReader(stream)
    inserted = 0; errors = []
    total_electricity = total_diesel = total_transport = total_emissions = 0.0
    est_counts  = {"electricity": 0, "diesel": 0, "transport": 0}
    risk_counts = {"Low": 0, "Medium": 0, "High": 0}

    conn = get_db_connection(); cur = conn.cursor()

    for i, row in enumerate(reader):
        try:
            raw_elec      = row.get('electricity_kwh') or ''
            raw_diesel    = row.get('diesel_liters')   or ''
            raw_transport = row.get('transport_km')    or ''

            row_est_elec  = not bool(raw_elec.strip())
            row_est_diese = not bool(raw_diesel.strip())
            row_est_trans = not bool(raw_transport.strip())

            electricity = float(raw_elec)      if raw_elec.strip()      else estimate_missing_data("electricity consumption in kWh")
            diesel      = float(raw_diesel)    if raw_diesel.strip()    else estimate_missing_data("diesel consumption in liters")
            transport   = float(raw_transport) if raw_transport.strip() else estimate_missing_data("transport distance in km")

            if electricity == 0: electricity = estimate_missing_data("electricity consumption in kWh"); row_est_elec  = True
            if diesel == 0:      diesel      = estimate_missing_data("diesel consumption in liters");  row_est_diese = True
            if transport == 0:   transport   = estimate_missing_data("transport distance in km");      row_est_trans = True

            if row_est_elec:  est_counts["electricity"] += 1
            if row_est_diese: est_counts["diesel"]      += 1
            if row_est_trans: est_counts["transport"]   += 1

            scope1 = diesel * EF_DIESEL; scope2 = electricity * EF_ELECTRICITY; scope3 = transport * EF_TRANSPORT
            total  = scope1 + scope2 + scope3
            risk, explanation = validate_data_with_groq(electricity, diesel, transport)
            if risk in risk_counts: risk_counts[risk] += 1

            cur.execute("INSERT INTO activity_data (electricity_kwh, diesel_liters, transport_km) VALUES (%s,%s,%s) RETURNING id",
                        (electricity, diesel, transport))
            activity_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO ghg_records (activity_id,scope1,scope2,scope3,total_emissions,fraud_risk,explanation) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (activity_id, scope1, scope2, scope3, total, risk, explanation)
            )

            total_electricity += electricity; total_diesel += diesel; total_transport += transport
            total_emissions   += total;       inserted += 1
        except Exception as e:
            errors.append(f"Row {i+2}: {str(e)}")

    conn.commit(); cur.close(); conn.close()

    insight_text = ""; recommendation = ""
    if inserted > 0:
        avg_elec      = total_electricity / inserted
        avg_diesel    = total_diesel      / inserted
        avg_transport = total_transport   / inserted
        insight_prompt = f"""Analyze this ESG dataset summary for DemoSteel Pvt Ltd (Steel sector):
Total records: {inserted}
Avg electricity: {avg_elec:.1f} kWh | Avg diesel: {avg_diesel:.1f} liters | Avg transport: {avg_transport:.1f} km
Total emissions: {total_emissions:.2f} kg CO2

Answer in exactly 4 numbered points:
1. Overall risk level (Low / Medium / High) and a one-line reason
2. Which factor (electricity, diesel, or transport) contributes most to emissions
3. Any anomaly or unusual pattern observed
4. One concrete recommendation to reduce emissions"""

        insight_text  = call_groq_api(insight_prompt) or "1. Medium Risk\n2. Diesel\n3. None\n4. Reduce fuel consumption"
        avg_scope1    = avg_diesel * EF_DIESEL
        avg_scope2    = avg_elec   * EF_ELECTRICITY
        avg_scope3    = avg_transport * EF_TRANSPORT
        recommendation = get_recommendation(avg_scope1, avg_scope2, avg_scope3, avg_scope1 + avg_scope2 + avg_scope3)

    est_summary = {
        "electricity":   est_counts["electricity"],
        "diesel":        est_counts["diesel"],
        "transport":     est_counts["transport"],
        "any_estimated": any(v > 0 for v in est_counts.values()),
        "total_rows":    inserted,
    }
    final_risk = "High" if risk_counts["High"] > 0 else ("Medium" if risk_counts["Medium"] > 0 else "Low")

    return jsonify({
        "status":         "success",
        "inserted":       inserted,
        "errors":         errors,
        "message":        f"✅ {inserted} record(s) processed successfully.",
        "insight_text":   insight_text,
        "estimation":     est_summary,
        "confidence":     risk_to_confidence(final_risk),
        "recommendation": recommendation,
        "audit":          build_audit_trail("csv", "Verified" if final_risk != "High" else "Flagged"),
    })

# ── /supplier ─────────────────────────────────────────────────────────────────

@main_bp.route('/supplier', methods=['POST'])
def add_supplier():
    data = request.json
    supplier_name = data.get('supplier_name', '').strip()
    if not supplier_name:
        return jsonify({"status": "error", "message": "supplier_name is required"}), 400
    try:
        transport_km = float(data.get('transport_km') or 0)
        material_kg  = float(data.get('material_kg')  or 0)
        energy_kwh   = float(data.get('energy_kwh')   or 0)
    except ValueError:
        return jsonify({"status": "error", "message": "Numeric fields must be valid numbers"}), 400

    total_emissions = (
        transport_km * EF_SUPPLIER_TRANSPORT +
        material_kg  * EF_SUPPLIER_MATERIAL  +
        energy_kwh   * EF_SUPPLIER_ENERGY
    )

    conn = get_db_connection(); cur = conn.cursor()
    cur.execute(
        "INSERT INTO supplier_data (supplier_name,transport_km,material_kg,energy_kwh,total_emissions) VALUES (%s,%s,%s,%s,%s) RETURNING id",
        (supplier_name, transport_km, material_kg, energy_kwh, round(total_emissions, 2))
    )
    new_id = cur.fetchone()[0]; conn.commit(); cur.close(); conn.close()

    return jsonify({"status": "success", "id": new_id, "supplier_name": supplier_name,
                    "total_emissions": round(total_emissions, 2)})

# ── /supplier_summary ─────────────────────────────────────────────────────────

@main_bp.route('/supplier_summary', methods=['GET'])
def supplier_summary():
    from psycopg2.extras import RealDictCursor
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""SELECT id, supplier_name, transport_km, material_kg, energy_kwh,
                          total_emissions, proof_filename, created_at
                   FROM supplier_data ORDER BY total_emissions DESC""")
    rows = cur.fetchall(); cur.close(); conn.close()

    grand_total = sum(float(r['total_emissions']) for r in rows) or 1
    suppliers   = []
    for r in rows:
        emissions = float(r['total_emissions'])
        pct       = round((emissions / grand_total) * 100, 1)
        suppliers.append({
            "id":               r['id'],
            "supplier_name":    r['supplier_name'],
            "transport_km":     float(r['transport_km']),
            "material_kg":      float(r['material_kg']),
            "energy_kwh":       float(r['energy_kwh']),
            "total_emissions":  round(emissions, 2),
            "contribution_pct": pct,
            "proof_filename":   r['proof_filename'],
            "data_quality":     "High" if r['proof_filename'] else "Low",
        })

    top2_pct = (
        sum(s['contribution_pct'] for s in suppliers[:2])
        if len(suppliers) >= 2
        else (suppliers[0]['contribution_pct'] if suppliers else 0)
    )

    return jsonify({
        "suppliers":   suppliers,
        "grand_total": round(grand_total, 2),
        "count":       len(suppliers),
        "top2_pct":    round(top2_pct, 1),
    })

# ── /supplier_proof/<id> ──────────────────────────────────────────────────────

@main_bp.route('/supplier_proof/<int:supplier_id>', methods=['POST'])
def upload_supplier_proof(supplier_id):
    if 'proof' not in request.files:
        return jsonify({"status": "error", "message": "No file sent (field name must be 'proof')"}), 400
    file = request.files['proof']
    if file.filename == '':
        return jsonify({"status": "error", "message": "Empty filename"}), 400

    timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
    safe_name = f"{supplier_id}_{timestamp}_{file.filename.replace(' ','_')}"
    file.save(os.path.join(UPLOAD_FOLDER, safe_name))

    conn = get_db_connection(); cur = conn.cursor()
    cur.execute("UPDATE supplier_data SET proof_filename=%s WHERE id=%s", (safe_name, supplier_id))
    conn.commit(); cur.close(); conn.close()

    return jsonify({"status": "success", "supplier_id": supplier_id,
                    "proof_filename": safe_name,
                    "message": "Proof document uploaded and linked to supplier."})

# ── helpers ───────────────────────────────────────────────────────────────────

def _safe_float(val):
    """Convert val to float; return None if impossible or non-positive."""
    if val is None:
        return None
    try:
        f = float(str(val).replace(',', '').strip())
        return f if f > 0 else None
    except (ValueError, TypeError):
        return None

# ── /upload_pdf ───────────────────────────────────────────────────────────────

@main_bp.route('/upload_pdf', methods=['POST'])
def upload_pdf():
    from PyPDF2 import PdfReader

    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file sent (field name must be 'file')"}), 400
    file = request.files['file']
    if file.filename == '' or not file.filename.lower().endswith('.pdf'):
        return jsonify({"status": "error", "message": "Please upload a valid .pdf file"}), 400

    # ── Save & read PDF ───────────────────────────────────────────────────────
    timestamp  = datetime.utcnow().strftime('%Y%m%d%H%M%S')
    safe_name  = f"pdf_{timestamp}_{file.filename.replace(' ','_')}"
    save_path  = os.path.join(UPLOAD_FOLDER, safe_name)
    file.save(save_path)

    try:
        reader     = PdfReader(save_path)
        full_text  = "".join(p.extract_text() or "" for p in reader.pages)
        page_count = len(reader.pages)
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to read PDF: {str(e)}"}), 500

    # ── Stage 1: Audit-ready structured ESG extraction ────────────────────────
    extraction_prompt = f"""You are an ESG data extraction and validation engine.
Your task is to analyze a corporate ESG / BRSR / Sustainability report PDF.

IMPORTANT: Do NOT invent or estimate any numbers. Only extract values explicitly present in the document. If a value is not found, return null.

STEP 1: Extract the following if present:
* Scope 1 emissions (with unit)
* Scope 2 emissions (with unit)
* Scope 3 emissions (with unit)
* Total emissions (with unit)
* Any mention of energy consumption (optional)
* Any mention of fuel consumption (optional)

STEP 2: Identify ESG risks:
* Missing Scope 3 reporting
* Lack of supplier data
* High emissions mentioned
* Any compliance or environmental risks described

STEP 3: Output ONLY valid JSON — no markdown fences, no extra text:
{{"emissions":{{"scope1":value_or_null,"scope2":value_or_null,"scope3":value_or_null,"total":value_or_null}},"risks":["list of detected ESG risks"],"confidence":"High or Medium or Low","notes":"short explanation of findings"}}

RULES:
* Never guess numbers — if a value is not clearly stated, set null
* Confidence is LOW if data is missing or unclear
* Confidence is HIGH only if all scope values are clearly stated with units

PDF TEXT (first 4000 chars):
{full_text[:4000]}"""

    raw_json = call_groq_api(extraction_prompt)

    # ── Parse structured JSON ─────────────────────────────────────────────────
    esg_structured = None
    try:
        clean = re.sub(r'```(?:json)?', '', raw_json).strip().strip('`')
        match = re.search(r'\{.*\}', clean, re.DOTALL)
        if match:
            esg_structured = json.loads(match.group())
    except Exception as parse_err:
        print(f"JSON parse error: {parse_err} | raw: {raw_json[:200]}")

    # Pull fields from structured result
    structured_scope1 = structured_scope2 = structured_scope3 = structured_total = None
    esg_risks      = []
    esg_confidence = "Low"
    esg_notes      = ""

    if esg_structured and isinstance(esg_structured, dict):
        em = esg_structured.get("emissions") or {}
        structured_scope1 = _safe_float(em.get("scope1"))
        structured_scope2 = _safe_float(em.get("scope2"))
        structured_scope3 = _safe_float(em.get("scope3"))
        structured_total  = _safe_float(em.get("total"))
        esg_risks         = esg_structured.get("risks") or []
        esg_confidence    = esg_structured.get("confidence", "Low")
        esg_notes         = esg_structured.get("notes", "")

    # ── Stage 2: Derive activity inputs ───────────────────────────────────────
    # Back-calculate inputs from extracted scope values where available;
    # fall back to keyword search then AI estimation.
    electricity = diesel = transport = None
    est_electricity = est_diesel = est_transport = True

    if structured_scope2 is not None:
        electricity = structured_scope2 / EF_ELECTRICITY
        est_electricity = False
    if structured_scope1 is not None:
        diesel = structured_scope1 / EF_DIESEL
        est_diesel = False
    if structured_scope3 is not None:
        transport = structured_scope3 / EF_TRANSPORT
        est_transport = False

    # Keyword fallback for any still-None fields
    def _kw(pattern):
        m = re.search(pattern, full_text, re.IGNORECASE)
        if m:
            try: return float(m.group(1).replace(',', ''))
            except: pass
        return None

    if electricity is None:
        electricity = _kw(r'electricity\s*[=:]\s*([\d,]+(?:\.\d+)?)')
        if electricity: est_electricity = False

    if diesel is None:
        diesel = _kw(r'diesel\s*[=:]\s*([\d,]+(?:\.\d+)?)')
        if diesel: est_diesel = False

    if transport is None:
        transport = _kw(r'transport\s*[=:]\s*([\d,]+(?:\.\d+)?)')
        if transport: est_transport = False

    # AI estimation as final fallback
    if not electricity or electricity == 0:
        electricity = estimate_missing_data("electricity consumption in kWh"); est_electricity = True
    if not diesel or diesel == 0:
        diesel      = estimate_missing_data("diesel consumption in liters");   est_diesel      = True
    if not transport or transport == 0:
        transport   = estimate_missing_data("transport distance in km");       est_transport   = True

    electricity = float(electricity)
    diesel      = float(diesel)
    transport   = float(transport)

    # ── GHG calculation ───────────────────────────────────────────────────────
    calc_scope1 = diesel      * EF_DIESEL
    calc_scope2 = electricity * EF_ELECTRICITY
    calc_scope3 = transport   * EF_TRANSPORT
    calc_total  = calc_scope1 + calc_scope2 + calc_scope3

    # Prefer directly-extracted scope values for display
    display_scope1 = structured_scope1 if structured_scope1 is not None else round(calc_scope1, 2)
    display_scope2 = structured_scope2 if structured_scope2 is not None else round(calc_scope2, 2)
    display_scope3 = structured_scope3 if structured_scope3 is not None else round(calc_scope3, 2)
    display_total  = structured_total  if structured_total  is not None else round(calc_total,  2)

    # ── Validation & recommendation ───────────────────────────────────────────
    risk, explanation = validate_data_with_groq(electricity, diesel, transport)
    recommendation    = get_recommendation(calc_scope1, calc_scope2, calc_scope3, calc_total)

    # Extraction confidence: HIGH if all scopes found, MEDIUM if some, LOW if none
    found_count          = sum(1 for v in [structured_scope1, structured_scope2, structured_scope3] if v is not None)
    extraction_confidence = "High" if found_count == 3 else ("Medium" if found_count > 0 else "Low")

    # ── Persist to DB ─────────────────────────────────────────────────────────
    try:
        conn = get_db_connection(); cur = conn.cursor()
        cur.execute(
            "INSERT INTO activity_data (electricity_kwh,diesel_liters,transport_km) VALUES (%s,%s,%s) RETURNING id",
            (electricity, diesel, transport)
        )
        activity_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO ghg_records (activity_id,scope1,scope2,scope3,total_emissions,fraud_risk,explanation) VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (activity_id, display_scope1, display_scope2, display_scope3, display_total, risk, explanation)
        )
        conn.commit(); cur.close(); conn.close()
    except Exception as db_err:
        print(f"DB insert error (pdf): {db_err}")

    return jsonify({
        "status":     "success",
        "filename":   safe_name,
        "page_count": page_count,

        # Structured ESG extraction (audit-ready)
        "esg_extraction": {
            "scope1":     structured_scope1,
            "scope2":     structured_scope2,
            "scope3":     structured_scope3,
            "total":      structured_total,
            "risks":      esg_risks,
            "confidence": esg_confidence,
            "notes":      esg_notes,
        },

        # Activity inputs for transparency
        "extracted": {
            "electricity_kwh": round(electricity, 2),
            "diesel_liters":   round(diesel,      2),
            "transport_km":    round(transport,   2),
        },
        "extraction_flags": {
            "electricity": "Extracted" if not est_electricity else "Estimated",
            "diesel":      "Extracted" if not est_diesel      else "Estimated",
            "transport":   "Extracted" if not est_transport   else "Estimated",
        },
        "estimation": {
            "electricity":   est_electricity,
            "diesel":        est_diesel,
            "transport":     est_transport,
            "any_estimated": any([est_electricity, est_diesel, est_transport]),
        },
        "source_info": {
            "source":                "PDF (Unstructured Data)",
            "extraction_confidence": extraction_confidence,
            "page_count":            page_count,
        },
        "calculated": {
            "scope1": display_scope1,
            "scope2": display_scope2,
            "scope3": display_scope3,
            "total":  display_total,
        },
        "validation":     {"risk": risk, "explanation": explanation},
        "confidence":     risk_to_confidence(risk),
        "recommendation": recommendation,
        "audit":          build_audit_trail("pdf", "Verified" if risk != "High" else "Flagged"),
    })

# ── /audit_report PDF ─────────────────────────────────────────────────────────

C_INDIGO = colors.HexColor('#6366f1'); C_TEAL  = colors.HexColor('#22d3ee')
C_RED    = colors.HexColor('#f87171'); C_GREEN = colors.HexColor('#34d399')
C_DARK   = colors.HexColor('#0f172a'); C_MID   = colors.HexColor('#1e293b')
C_LIGHT  = colors.HexColor('#94a3b8'); C_WHITE = colors.white
C_BLACK  = colors.HexColor('#0f172a')

@main_bp.route('/audit_report', methods=['GET'])
def generate_audit_report():
    from psycopg2.extras import RealDictCursor
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""SELECT g.id,g.scope1,g.scope2,g.scope3,g.total_emissions,g.fraud_risk,g.explanation,g.created_at,
                          a.electricity_kwh,a.diesel_liters,a.transport_km
                   FROM ghg_records g JOIN activity_data a ON a.id=g.activity_id ORDER BY g.created_at ASC""")
    ghg_rows = cur.fetchall()
    cur.execute("SELECT id,supplier_name,transport_km,material_kg,energy_kwh,total_emissions,proof_filename,created_at FROM supplier_data ORDER BY total_emissions DESC")
    sup_rows = cur.fetchall(); cur.close(); conn.close()

    total_records   = len(ghg_rows)
    total_scope1    = sum(float(r['scope1'])          for r in ghg_rows)
    total_scope2    = sum(float(r['scope2'])          for r in ghg_rows)
    total_scope3    = sum(float(r['scope3'])          for r in ghg_rows)
    total_emissions = sum(float(r['total_emissions']) for r in ghg_rows)
    avg_emissions   = total_emissions / total_records if total_records else 0
    high_risk_cnt   = sum(1 for r in ghg_rows if r['fraud_risk'] == 'High')
    med_risk_cnt    = sum(1 for r in ghg_rows if r['fraud_risk'] == 'Medium')
    low_risk_cnt    = sum(1 for r in ghg_rows if r['fraud_risk'] == 'Low')
    sup_total       = sum(float(s['total_emissions']) for s in sup_rows) or 1
    report_date     = datetime.utcnow().strftime('%d %B %Y, %H:%M UTC')

    buffer = io.BytesIO()
    doc    = SimpleDocTemplate(buffer, pagesize=A4,
                               leftMargin=2*cm, rightMargin=2*cm,
                               topMargin=2*cm,  bottomMargin=2*cm)
    styles = getSampleStyleSheet()

    def S(name, **kw): return ParagraphStyle(name, **kw)
    sTitle  = S('sTitle',  fontSize=22, textColor=C_INDIGO, spaceAfter=4,  fontName='Helvetica-Bold')
    sSub    = S('sSub',    fontSize=10, textColor=C_LIGHT,  spaceAfter=16, fontName='Helvetica')
    sH1     = S('sH1',    fontSize=14, textColor=C_INDIGO, spaceBefore=18, spaceAfter=8,  fontName='Helvetica-Bold')
    sBody   = S('sBody',  fontSize=9,  textColor=C_BLACK,  spaceAfter=6,  fontName='Helvetica', leading=14)
    sFooter = S('sFooter', fontSize=8, textColor=C_LIGHT,  alignment=1,   fontName='Helvetica')

    def HR(): return HRFlowable(width='100%', thickness=0.5, color=C_MID, spaceAfter=8, spaceBefore=4)

    def tbl_style(hc=C_INDIGO, ac=colors.HexColor('#f8fafc')):
        return TableStyle([
            ('BACKGROUND', (0,0), (-1,0), hc), ('TEXTCOLOR', (0,0), (-1,0), C_WHITE),
            ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'), ('FONTSIZE', (0,0), (-1,0), 8),
            ('ALIGN',      (0,0), (-1,-1), 'CENTER'), ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('FONTSIZE',   (0,1), (-1,-1), 8), ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [C_WHITE, ac]),
            ('GRID',       (0,0), (-1,-1), 0.3, colors.HexColor('#e2e8f0')),
            ('TOPPADDING',    (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING',   (0,0), (-1,-1), 6), ('RIGHTPADDING',  (0,0), (-1,-1), 6),
        ])

    story = []
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph("Carbon Intelligence OS — DemoSteel Pvt Ltd", sTitle))
    story.append(Paragraph("GHG &amp; ESG Audit Report | Sector: Steel",
                            S('x', fontSize=14, textColor=C_TEAL, spaceAfter=6, fontName='Helvetica-Bold')))
    story.append(Paragraph(f"Generated: {report_date}", sSub))
    story.append(Paragraph(
        "This report is auto-generated from verified activity data and AI-validated records "
        "covering Scope 1, 2, and 3 emissions in accordance with the GHG Protocol Corporate Standard.",
        sBody
    ))
    story.append(HR())

    story.append(Paragraph("1. Executive Summary", sH1))
    kpi_data = [['Metric', 'Value'],
        ['Total GHG Records',         str(total_records)],
        ['Total Scope 1 (Diesel)',     f'{total_scope1:,.2f} kg CO2'],
        ['Total Scope 2 (Electricity)', f'{total_scope2:,.2f} kg CO2'],
        ['Total Scope 3 (Transport)',  f'{total_scope3:,.2f} kg CO2'],
        ['Total Emissions',            f'{total_emissions:,.2f} kg CO2'],
        ['Average per Record',         f'{avg_emissions:,.2f} kg CO2'],
        ['High Risk Records',          str(high_risk_cnt)],
        ['Medium Risk Records',        str(med_risk_cnt)],
        ['Low Risk Records',           str(low_risk_cnt)],
        ['Suppliers Tracked',          str(len(sup_rows))]]
    kpi_tbl = Table(kpi_data, colWidths=[9*cm, 8*cm])
    kpi_tbl.setStyle(tbl_style(C_INDIGO))
    story.append(kpi_tbl); story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph("2. Scope Breakdown", sH1))
    if total_emissions > 0:
        scope_data = [['Scope', 'Total kg CO2', '% of Total'],
            ['Scope 1 - Diesel',      f'{total_scope1:,.2f}', f'{total_scope1/total_emissions*100:.1f}%'],
            ['Scope 2 - Electricity', f'{total_scope2:,.2f}', f'{total_scope2/total_emissions*100:.1f}%'],
            ['Scope 3 - Transport',   f'{total_scope3:,.2f}', f'{total_scope3/total_emissions*100:.1f}%'],
            ['TOTAL',                 f'{total_emissions:,.2f}', '100%']]
        scope_tbl = Table(scope_data, colWidths=[8*cm, 5*cm, 4*cm])
        scope_tbl.setStyle(tbl_style(C_TEAL))
        story.append(scope_tbl)

    story.append(Paragraph("3. Fraud Risk Analysis", sH1))
    risk_data = [['Risk Level', 'Record Count', '% of Total', 'Action Required']]
    for level, cnt in [('High', high_risk_cnt), ('Medium', med_risk_cnt), ('Low', low_risk_cnt)]:
        pct    = f'{cnt/total_records*100:.1f}%' if total_records else '0%'
        action = {'High': 'Immediate review', 'Medium': 'Monitor closely', 'Low': 'None'}[level]
        risk_data.append([level, str(cnt), pct, action])
    risk_tbl = Table(risk_data, colWidths=[4*cm, 4*cm, 4*cm, 5*cm])
    risk_tbl.setStyle(tbl_style(colors.HexColor('#7f1d1d')))
    story.append(risk_tbl)

    story.append(Paragraph("4. Supplier Emissions", sH1))
    if sup_rows:
        sup_data = [['Rank', 'Supplier', 'Trans km', 'Mat kg', 'Energy kWh',
                     'Emissions kg CO2', 'Contribution', 'Data Quality', 'Proof']]
        for i, s in enumerate(sup_rows):
            pct   = float(s['total_emissions']) / sup_total * 100
            proof = 'Uploaded' if s['proof_filename'] else 'Missing'
            dq    = 'High' if s['proof_filename'] else 'Low'
            sup_data.append([
                str(i+1), str(s['supplier_name']),
                f"{float(s['transport_km']):.0f}", f"{float(s['material_kg']):.0f}",
                f"{float(s['energy_kwh']):.0f}", f"{float(s['total_emissions']):.2f}",
                f"{pct:.1f}%", dq, proof
            ])
        sup_tbl = Table(sup_data, colWidths=[1*cm, 3*cm, 2*cm, 1.5*cm, 2*cm, 2.5*cm, 2*cm, 1.8*cm, 1.8*cm])
        sup_tbl.setStyle(tbl_style(colors.HexColor('#064e3b')))
        story.append(sup_tbl)
    else:
        story.append(Paragraph("No supplier data recorded yet.", sBody))

    story.append(Paragraph("5. Compliance Statement", sH1))
    audit_data = [['Compliance Item', 'Status'],
        ['GHG Protocol Scope 1', 'Tracked'],
        ['GHG Protocol Scope 2', 'Tracked'],
        ['GHG Protocol Scope 3', 'Partially Tracked'],
        ['AI Anomaly Detection', 'Active (Groq LLaMA 3.1)'],
        ['Rule-Based Validation', 'Active (Range + Cross-checks)'],
        ['PDF ESG Extraction', 'Active (Structured JSON)'],
        ['Supplier Proof Uploads', f"{sum(1 for s in sup_rows if s['proof_filename'])}/{len(sup_rows)} Verified"],
        ['Audit Trail', 'Enabled (PostgreSQL timestamps)'],
        ['Company', 'DemoSteel Pvt Ltd | Steel']]
    audit_tbl = Table(audit_data, colWidths=[8*cm, 9*cm])
    audit_tbl.setStyle(tbl_style(colors.HexColor('#1e3a5f')))
    story.append(audit_tbl)

    story.append(Spacer(1, 0.8*cm)); story.append(HR())
    story.append(Paragraph(
        f"Carbon Intelligence OS  |  DemoSteel Pvt Ltd  |  {report_date}  |  Powered by Groq + LLaMA 3.1  |  CONFIDENTIAL",
        sFooter
    ))

    doc.build(story); buffer.seek(0)
    filename = f"DemoSteel_AuditReport_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.pdf"
    return send_file(buffer, mimetype='application/pdf', as_attachment=True, download_name=filename)
