import psycopg2

print("Connecting to database...")
try:
    # Connects to your local Postgres
    conn = psycopg2.connect(
        dbname="rcps1",
        user="postgres", 
        password="gunwant",
        host="localhost",
        port="5432"
    )
    cur = conn.cursor()

    print("Creating tables...")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS activity_data (
        id SERIAL PRIMARY KEY,
        electricity_kwh FLOAT,
        diesel_liters FLOAT,
        transport_km FLOAT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS ghg_records (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER REFERENCES activity_data(id),
        scope1 FLOAT,
        scope2 FLOAT,
        scope3 FLOAT,
        total_emissions FLOAT,
        fraud_risk VARCHAR(50),
        explanation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("✅ Success! Database tables created.")

except Exception as e:
    print(f"❌ Error: {e}")