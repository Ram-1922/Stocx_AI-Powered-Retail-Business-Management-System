from flask import Blueprint, jsonify, current_app, session
from bson.objectid import ObjectId

history_bp = Blueprint('history', __name__)

@history_bp.route('/agency', methods=['GET'])
def get_agency_history():
    db = current_app.config['DB']
    user_email = session.get('user_email')
    if not user_email: return jsonify({'error': 'Unauthorized'}), 401
    
    records = list(db.agency_history.find({"user_email": user_email}).sort("date", -1))
    for r in records: r['_id'] = str(r['_id'])
    return jsonify(records), 200

@history_bp.route('/pos', methods=['GET'])
def get_pos_history():
    db = current_app.config['DB']
    user_email = session.get('user_email')
    if not user_email: return jsonify({'error': 'Unauthorized'}), 401
    
    records = list(db.pos_history.find({"user_email": user_email}).sort("date", -1))
    for r in records: r['_id'] = str(r['_id'])
    return jsonify(records), 200

@history_bp.route('/<record_type>/<record_id>', methods=['DELETE'])
def delete_record(record_type, record_id):
    db = current_app.config['DB']
    user_email = session.get('user_email')
    if not user_email: return jsonify({'error': 'Unauthorized'}), 401
    
    collection = db.agency_history if record_type == 'agency' else db.pos_history
    result = collection.delete_one({"_id": ObjectId(record_id), "user_email": user_email})
    
    if result.deleted_count > 0:
        return jsonify({"message": "Record deleted safely."}), 200
    return jsonify({"error": "Record not found."}), 404