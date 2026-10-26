"""Synthetic CI fixture and logical snapshots; never run against personal data."""
import hashlib
import json
import os
import sqlite3
import sys
import wave
from pathlib import Path

if os.environ.get("GITHUB_ACTIONS") != "true" or sys.platform != "win32":
    raise SystemExit("This fixture is restricted to a disposable Windows Actions runner")

directory = Path(os.environ["APPDATA"]) / "local.space-dictation"
db = sqlite3.connect(directory / "space-dictation.db")
if sys.argv[1] == "seed":
    now = "2026-10-26T00:00:00Z"
    words = [{"id": "update-word", "front": "apple", "back": "苹果"}]
    options = {"accent": "en_US", "voice": "recordings-v1", "rate": 175, "shuffle": False, "count": 1}
    state = {"settings": options, "active": "update-session", "sessions": [{
        "id": "update-session", "name": "Windows 更新验收", "created": now,
        "words": words, "index": 0, "phase": "review", "marks": [None], "options": options,
    }]}
    db.execute("INSERT INTO decks(id,name,card_count,created_at,updated_at) VALUES(?,?,?,?,?)",
               ("update-deck", "Windows 更新验收", 1, now, now))
    db.execute("INSERT INTO cards(id,deck_id,front,back,next_review_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
               ("update-word", "update-deck", "apple", "苹果", now, now, now))
    db.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)",
               ("space.state.v1", json.dumps(state, ensure_ascii=False, separators=(",", ":"))))
    db.commit()
    audio_dir = directory / "personal-recordings-v1"
    audio_dir.mkdir(exist_ok=True)
    with wave.open(str(audio_dir / (hashlib.sha256(b"apple").hexdigest() + ".wav")), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(b"\0\0" * 1600)

tables = {}
for table in ["decks", "cards", "settings", "review_log", "study_time_log"]:
    rows = db.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()
    tables[table] = hashlib.sha256(json.dumps(rows, ensure_ascii=False).encode()).hexdigest()
recordings = {str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted((directory / "personal-recordings-v1").glob("*"))}
snapshot = {"tables": tables, "recordings": recordings}
evidence = Path("update-evidence")
if sys.argv[1] == "seed":
    (evidence / "data-before.json").write_text(json.dumps(snapshot, indent=2))
else:
    (evidence / "data-after.json").write_text(json.dumps(snapshot, indent=2))
    assert snapshot == json.loads((evidence / "data-before.json").read_text()), "Data changed during update"
    print("DATA_PRESERVED: personal deck, word, practice session, all five tables and recording")
