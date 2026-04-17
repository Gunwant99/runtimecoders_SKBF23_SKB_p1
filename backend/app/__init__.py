from flask import Flask
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    # Allow the React frontend (which usually runs on port 5173) to talk to this backend
    CORS(app) 

    # Import routes after app is created to avoid circular imports
    from .routes import main_bp
    app.register_blueprint(main_bp)

    return app