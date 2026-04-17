import psycopg2
import requests

# HARDCODED API CONFIGURATION FOR HACKATHON
GROQ_API_KEY = "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"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Emission Factors
EF_ELECTRICITY = 0.82
EF_DIESEL = 2.68
EF_TRANSPORT = 0.21

def get_db_connection():
    """Establishes and returns a connection to the PostgreSQL database."""
    # Hardcoded to match your setup_db.py script perfectly
    return psycopg2.connect(
        dbname="rcps1",
        user="postgres",
        password="gunwant",
        host="localhost",
        port="5432"
    )

def call_groq_api(prompt):
    """Helper function to call Groq via REST API to bypass Windows DLL blocks."""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.1-8b-instant",
        "messages": [{"role": "user", "content": prompt}]
    }
    
    try:
        response = requests.post(GROQ_URL, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()['choices'][0]['message']['content']
    except Exception as e:
        print(f"Groq API Error: {e}")
        return ""

def estimate_missing_data(field_name):
    """Uses Groq to estimate missing values based on realistic factory averages."""
    prompt = f"Estimate a realistic monthly value for {field_name} for a medium-sized manufacturing plant. Respond ONLY with a number."
    response_text = call_groq_api(prompt)
    
    try:
        return float(''.join(filter(lambda x: x.isdigit() or x == '.', response_text)))
    except:
        return 0.0

def validate_data_with_groq(electricity, diesel, transport):
    """Uses Groq to detect anomalies or fraud risk in the input data."""
    prompt = f"""
    Analyze this monthly ESG data for a facility: electricity={electricity} kWh, diesel={diesel} liters, transport={transport} km.
    Check: Is it realistic? Any anomaly? Any suspicious values?
    Return exactly in this format:
    Risk: [Low/Medium/High]
    Explanation: [Short 1-sentence explanation]
    """
    response_text = call_groq_api(prompt)
    
    risk = "Unknown"
    explanation = response_text
    if "Risk: High" in response_text or "Risk: high" in response_text: risk = "High"
    elif "Risk: Medium" in response_text or "Risk: medium" in response_text: risk = "Medium"
    elif "Risk: Low" in response_text or "Risk: low" in response_text: risk = "Low"
    
    return risk, explanation