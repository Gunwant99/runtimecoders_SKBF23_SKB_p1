from flask import Blueprint, request, jsonify
from .utils import (
    get_db_connection, estimate_missing_data, validate_data_with_groq,
    EF_ELECTRICITY, EF_DIESEL, EF_TRANSPORT
)

# Create a blueprint to group these routes together
main_bp = Blueprint('main', __name__)

@main_bp.route('/data', methods=['POST'])
def submit_data():
    data = request.json
    
    # 1. Missing Data Handling via Groq
    electricity = float(data.get('electricity_kwh')) if data.get('electricity_kwh') else estimate_missing_data("electricity consumption in kWh")
    diesel = float(data.get('diesel_liters')) if data.get('diesel_liters') else estimate_missing_data("diesel consumption in liters")
    transport = float(data.get('transport_km')) if data.get('transport_km') else estimate_missing_data("transport distance in km")

    # 2. GHG Calculation
    scope1 = diesel * EF_DIESEL
    scope2 = electricity * EF_ELECTRICITY
    scope3 = transport * EF_TRANSPORT
    total = scope1 + scope2 + scope3

    # 3. AI-Based Validation
    risk, explanation = validate_data_with_groq(electricity, diesel, transport)

    # 4. Save to Database
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO activity_data (electricity_kwh, diesel_liters, transport_km) VALUES (%s, %s, %s) RETURNING id",
        (electricity, diesel, transport)
    )
    activity_id = cur.fetchone()[0]
    cur.execute(
        "INSERT INTO ghg_records (activity_id, scope1, scope2, scope3, total_emissions, fraud_risk, explanation) VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (activity_id, scope1, scope2, scope3, total, risk, explanation)
    )
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "status": "success",
        "calculated": {"scope1": scope1, "scope2": scope2, "scope3": scope3, "total": total},
        "validation": {"risk": risk, "explanation": explanation}
    })

@main_bp.route('/dashboard', methods=['GET'])
def get_dashboard():
    from psycopg2.extras import RealDictCursor
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM ghg_records ORDER BY created_at ASC")
    records = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(records)

@main_bp.route('/ai', methods=['POST'])
def ai_insights():
    from psycopg2.extras import RealDictCursor
    import requests
    
    data = request.json
    question = data.get('question')
    
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT total_emissions, scope1, scope2, scope3 FROM ghg_records ORDER BY created_at DESC LIMIT 5")
    recent_data = cur.fetchall()
    cur.close()
    conn.close()

    prompt = f"Context: The last 5 emission records are {recent_data}. User asks: {question}. Provide a short, actionable response regarding ESG and Carbon reduction."
    
    # Hardcoded API key here as well to guarantee it works
    headers = {
        "Authorization": "Bearer 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",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.1-8b-instant",
        "messages": [{"role": "user", "content": prompt}]
    }
    
    try:
        res = requests.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers=headers)
        res.raise_for_status()
        answer = res.json()['choices'][0]['message']['content']
    except Exception as e:
        print(f"Chat API Error: {e}")
        answer = "Sorry, the AI service is currently unavailable."
    
    return jsonify({"answer": answer})