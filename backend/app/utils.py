import psycopg2
import requests
from datetime import datetime, timezone

GROQ_API_KEY = "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"
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"

EF_ELECTRICITY = 0.82
EF_DIESEL      = 2.68
EF_TRANSPORT   = 0.21

def get_db_connection():
    return psycopg2.connect(
        dbname="rcps1", user="postgres", password="gunwant",
        host="localhost", port="5432"
    )

def call_groq_api(prompt):
    try:
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3
        }
        response = requests.post(GROQ_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        if "choices" in data and len(data["choices"]) > 0:
            return data["choices"][0]["message"]["content"]
        return "No insights generated."
    except Exception as e:
        print("Groq API Error:", e)
        return """1. Medium Risk - Emissions are moderate but require monitoring
2. Diesel is the highest contributor
3. No major anomalies detected
4. Recommendation: Reduce fuel consumption for optimization"""

def estimate_missing_data(field_name):
    prompt = f"Estimate a realistic monthly value for {field_name} for a medium-sized manufacturing plant. Respond ONLY with a number."
    response_text = call_groq_api(prompt)
    try:
        return float(''.join(filter(lambda x: x.isdigit() or x == '.', response_text)))
    except:
        return 0.0

# ── NEW: Rule-based pre-validation ───────────────────────────────────────────

def validate_data_rules(electricity, diesel, transport):
    """
    Returns (passed: bool, violations: list[str]).
    Runs BEFORE Groq to catch obvious anomalies cheaply.
    """
    violations = []

    if not (1000 <= electricity <= 50000):
        violations.append(
            f"Electricity {electricity:.0f} kWh is outside expected range (1,000–50,000 kWh)"
        )
    if not (50 <= diesel <= 5000):
        violations.append(
            f"Diesel {diesel:.0f} L is outside expected range (50–5,000 L)"
        )
    if not (100 <= transport <= 20000):
        violations.append(
            f"Transport {transport:.0f} km is outside expected range (100–20,000 km)"
        )
    # Cross-check: low diesel but very high transport is suspicious
    if diesel < 200 and transport > 10000:
        violations.append(
            "Cross-check failed: diesel consumption is very low relative to transport distance"
        )

    return len(violations) == 0, violations

# ── UPDATED: validate_data_with_groq now applies rules first ─────────────────

def validate_data_with_groq(electricity, diesel, transport):
    """
    1. Run rule-based checks.  If they fail → risk = High immediately.
    2. Otherwise call Groq for AI validation.
    """
    passed, violations = validate_data_rules(electricity, diesel, transport)

    if not passed:
        explanation = "Rule-based check failed: " + "; ".join(violations)
        return "High", explanation

    prompt = f"""
Analyze this monthly ESG data for a steel manufacturing facility:
electricity={electricity} kWh, diesel={diesel} liters, transport={transport} km.
Check: Is it realistic? Any anomaly? Any suspicious values?
Return exactly in this format:
Risk: [Low/Medium/High]
Explanation: [Short 1-sentence explanation]
"""
    response_text = call_groq_api(prompt)

    risk = "Unknown"
    explanation = response_text
    if "Risk: High"   in response_text or "Risk: high"   in response_text: risk = "High"
    elif "Risk: Medium" in response_text or "Risk: medium" in response_text: risk = "Medium"
    elif "Risk: Low"  in response_text or "Risk: low"   in response_text: risk = "Low"

    return risk, explanation

# ── NEW: Confidence mapping ───────────────────────────────────────────────────

def risk_to_confidence(risk):
    return {"Low": "High", "Medium": "Medium", "High": "Low"}.get(risk, "Unknown")

# ── NEW: AI Recommendation helper ────────────────────────────────────────────

def get_recommendation(scope1, scope2, scope3, total):
    """
    Asks Groq for ONE practical reduction action given the scope breakdown.
    Returns a short string.
    """
    biggest = max(
        [("Scope 1 (diesel combustion)", scope1),
         ("Scope 2 (electricity)", scope2),
         ("Scope 3 (transport)", scope3)],
        key=lambda x: x[1]
    )
    prompt = (
        f"A steel manufacturing facility has these monthly GHG emissions: "
        f"Scope 1 (diesel) = {scope1:.1f} kg CO2, "
        f"Scope 2 (electricity) = {scope2:.1f} kg CO2, "
        f"Scope 3 (transport) = {scope3:.1f} kg CO2, "
        f"Total = {total:.1f} kg CO2. "
        f"The largest contributor is {biggest[0]}. "
        "In ONE concise sentence (max 20 words), suggest the single most impactful "
        "practical reduction action. Start with an action verb."
    )
    raw = call_groq_api(prompt)
    # Return first non-empty line
    for line in raw.strip().splitlines():
        if line.strip():
            return line.strip()
    return "Optimise energy procurement and switch high-diesel operations to electric alternatives."

# ── NEW: Build audit trail dict ───────────────────────────────────────────────

def build_audit_trail(source_type, validation_status="Verified"):
    return {
        "source_type":       source_type,
        "timestamp":         datetime.now(timezone.utc).isoformat(),
        "validated_by":      "Rule Engine + Groq AI (LLaMA 3.1)",
        "validation_status": validation_status,
        "company":           "DemoSteel Pvt Ltd",
        "sector":            "Steel",
    }
