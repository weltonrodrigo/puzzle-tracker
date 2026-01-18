"""PuzzleTracker - Flask backend for tracking puzzle-solving sessions."""

import json
import os
import uuid
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from google.cloud import storage

app = Flask(__name__, static_folder='static')

# Configuration
BUCKET_NAME = os.environ.get('GCS_BUCKET', 'puzzle-tracker-data')
DATA_FILE = 'puzzle-tracker-data.json'
LOCAL_DATA_FILE = 'local-data.json'

# Use local storage for development
USE_LOCAL_STORAGE = os.environ.get('USE_LOCAL_STORAGE', 'true').lower() == 'true'


def get_storage_client():
    """Get GCS storage client."""
    return storage.Client()


def load_data():
    """Load data from GCS or local file."""
    default_data = {"puzzles": [], "sessions": []}

    if USE_LOCAL_STORAGE:
        try:
            with open(LOCAL_DATA_FILE, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return default_data

    try:
        client = get_storage_client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(DATA_FILE)

        if blob.exists():
            content = blob.download_as_text()
            return json.loads(content)
        return default_data
    except Exception as e:
        app.logger.error(f"Error loading data: {e}")
        return default_data


def save_data(data):
    """Save data to GCS or local file."""
    if USE_LOCAL_STORAGE:
        with open(LOCAL_DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        return

    try:
        client = get_storage_client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(DATA_FILE)
        blob.upload_from_string(
            json.dumps(data, indent=2),
            content_type='application/json'
        )
    except Exception as e:
        app.logger.error(f"Error saving data: {e}")
        raise


@app.route('/')
def index():
    """Serve the main app."""
    return send_from_directory('static', 'index.html')


@app.route('/static/<path:path>')
def serve_static(path):
    """Serve static files."""
    return send_from_directory('static', path)


@app.route('/api/data', methods=['GET'])
def get_data():
    """Get all data."""
    return jsonify(load_data())


@app.route('/api/puzzles', methods=['POST'])
def create_puzzle():
    """Create a new puzzle."""
    data = load_data()
    body = request.get_json()

    puzzle = {
        "id": str(uuid.uuid4()),
        "name": body.get('name', 'Unnamed Puzzle'),
        "totalPieces": body.get('totalPieces', 0),
        "createdAt": datetime.utcnow().isoformat() + 'Z'
    }

    data['puzzles'].append(puzzle)
    save_data(data)

    return jsonify(puzzle), 201


@app.route('/api/puzzles/<puzzle_id>', methods=['DELETE'])
def delete_puzzle(puzzle_id):
    """Delete a puzzle and its sessions."""
    data = load_data()

    data['puzzles'] = [p for p in data['puzzles'] if p['id'] != puzzle_id]
    data['sessions'] = [s for s in data['sessions'] if s['puzzleId'] != puzzle_id]

    save_data(data)
    return jsonify({"success": True})


@app.route('/api/sessions/start', methods=['POST'])
def start_session():
    """Start a new session for a puzzle."""
    data = load_data()
    body = request.get_json()

    session = {
        "id": str(uuid.uuid4()),
        "puzzleId": body.get('puzzleId'),
        "startedAt": datetime.utcnow().isoformat() + 'Z',
        "endedAt": None,
        "events": []
    }

    data['sessions'].append(session)
    save_data(data)

    return jsonify(session), 201


@app.route('/api/sessions/<session_id>/end', methods=['POST'])
def end_session(session_id):
    """End an active session."""
    data = load_data()

    for session in data['sessions']:
        if session['id'] == session_id:
            session['endedAt'] = datetime.utcnow().isoformat() + 'Z'
            save_data(data)
            return jsonify(session)

    return jsonify({"error": "Session not found"}), 404


@app.route('/api/puzzles/<puzzle_id>/active-session', methods=['GET'])
def get_active_session(puzzle_id):
    """Get active (unended) session for a puzzle, if any."""
    data = load_data()

    for session in data['sessions']:
        if session['puzzleId'] == puzzle_id and session['endedAt'] is None:
            return jsonify(session)

    return jsonify(None)


@app.route('/api/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete a session."""
    data = load_data()

    original_count = len(data['sessions'])
    data['sessions'] = [s for s in data['sessions'] if s['id'] != session_id]

    if len(data['sessions']) == original_count:
        return jsonify({"error": "Session not found"}), 404

    save_data(data)
    return jsonify({"success": True})


@app.route('/api/events', methods=['POST'])
def record_event():
    """Record a piece placed or failed event."""
    data = load_data()
    body = request.get_json()

    session_id = body.get('sessionId')
    event_type = body.get('type')  # 'piece_placed' or 'piece_failed'
    elapsed = body.get('elapsed', 0)  # Time since last action in seconds

    for session in data['sessions']:
        if session['id'] == session_id:
            event = {
                "type": event_type,
                "timestamp": datetime.utcnow().isoformat() + 'Z',
                "elapsed": elapsed
            }
            session['events'].append(event)
            save_data(data)
            return jsonify(event), 201

    return jsonify({"error": "Session not found"}), 404


@app.route('/api/sessions/<session_id>/undo', methods=['POST'])
def undo_last_event(session_id):
    """Remove the last event from a session."""
    data = load_data()

    for session in data['sessions']:
        if session['id'] == session_id:
            events = session.get('events', [])
            if not events:
                return jsonify({"error": "No events to undo"}), 400

            removed_event = events.pop()
            save_data(data)
            return jsonify({"removed": removed_event, "remainingEvents": len(events)})

    return jsonify({"error": "Session not found"}), 404


@app.route('/api/stats/<puzzle_id>', methods=['GET'])
def get_stats(puzzle_id):
    """Get statistics for a puzzle."""
    data = load_data()

    puzzle = next((p for p in data['puzzles'] if p['id'] == puzzle_id), None)
    if not puzzle:
        return jsonify({"error": "Puzzle not found"}), 404

    sessions = [s for s in data['sessions'] if s['puzzleId'] == puzzle_id]

    total_placed = 0
    total_failed = 0
    total_time = 0
    placement_times = []
    sessions_data = []

    for session in sessions:
        session_placed = 0
        session_failed = 0
        session_time = 0

        for event in session.get('events', []):
            elapsed = event.get('elapsed', 0)
            session_time += elapsed

            if event['type'] == 'piece_placed':
                session_placed += 1
                placement_times.append(elapsed)
            elif event['type'] == 'piece_failed':
                session_failed += 1

        total_placed += session_placed
        total_failed += session_failed
        total_time += session_time

        sessions_data.append({
            "id": session['id'],
            "startedAt": session['startedAt'],
            "endedAt": session['endedAt'],
            "piecesPlaced": session_placed,
            "piecesFailed": session_failed,
            "totalTime": session_time
        })

    avg_time_per_piece = sum(placement_times) / len(placement_times) if placement_times else 0
    success_rate = (total_placed / (total_placed + total_failed) * 100) if (total_placed + total_failed) > 0 else 0
    progress = (total_placed / puzzle['totalPieces'] * 100) if puzzle['totalPieces'] > 0 else 0

    return jsonify({
        "puzzle": puzzle,
        "totalPiecesPlaced": total_placed,
        "totalPiecesFailed": total_failed,
        "totalTime": total_time,
        "avgTimePerPiece": round(avg_time_per_piece, 2),
        "successRate": round(success_rate, 1),
        "progress": round(progress, 1),
        "sessionsCount": len(sessions),
        "sessions": sessions_data
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
