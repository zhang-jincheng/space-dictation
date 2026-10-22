//! Exercises the actual frontend-model payload against the native offline services.
use super::*;

#[derive(Deserialize)]
struct Scenario {
    deck: WordDeck,
    stages: Vec<AppState>,
}

#[tokio::test]
#[ignore = "Run via npm run test:offline, which denies external network and supplies real frontend state"]
async fn frontend_native_workflow() {
    assert_eq!(std::env::var("SPACE_OFFLINE_CHILD").unwrap(), "1");
    let path = std::env::var("SPACE_OFFLINE_SCENARIO").expect("frontend scenario is required");
    let scenario: Scenario = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(scenario.stages.len(), 5);
    let dir = tempfile::tempdir().unwrap();
    let fixture =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/recordings");
    std::fs::create_dir_all(dir.path().join("recordings-v1")).unwrap();
    for f in std::fs::read_dir(fixture).unwrap() {
        let f = f.unwrap();
        std::fs::copy(
            f.path(),
            dir.path().join("recordings-v1").join(f.file_name()),
        )
        .unwrap();
    }
    let db = Database::new(dir.path().into()).unwrap();
    {
        let conn = db.conn.lock().unwrap();
        write_deck(&conn, &scenario.deck).unwrap();
        assert_eq!(read_words(&conn, &scenario.deck.id).unwrap().len(), 3);
    }
    let initial = &scenario.stages[0];
    validate_state(initial).unwrap();
    let session = &initial.sessions[0];
    assert_eq!(session.index, -1);
    assert_eq!(session.phase, "listen");
    let mut speech = SpeechInner::default();
    assert!(speech.player.is_none()); // Selection and state restore cannot start sound.
    let options = &session.options;
    assert!(
        crate::recordings::prepare(dir.path(), &session.words, &options.accent, |_| {})
            .await
            .unwrap()
            .missing
            .is_empty()
    );
    let paths: Vec<_> = session
        .words
        .iter()
        .map(|w| crate::recordings::audio_path(dir.path(), &w.front, &options.accent))
        .collect();
    assert!(session.words.iter().all(|w| crate::recordings::cached(
        dir.path(),
        &w.front,
        &options.accent
    )
    .is_some()));
    let mtimes: Vec<_> = paths
        .iter()
        .map(|p| std::fs::metadata(p).unwrap().modified().unwrap())
        .collect();
    assert!(speech.accept(1));
    play_cached(
        &mut speech,
        dir.path(),
        &session.words[0].front,
        &options.accent,
        options.rate,
    )
    .unwrap();
    assert!(speech.accept(2)); // Repeating/cutting the word stops the previous player.
    play_cached(
        &mut speech,
        dir.path(),
        &session.words[0].front,
        &options.accent,
        options.rate,
    )
    .unwrap();
    assert!(!speech.accept(1)); // A late old request cannot resume audio.
    speech.stop();
    {
        let conn = db.conn.lock().unwrap();
        write_state(&conn, &scenario.stages[1]).unwrap();
    }
    drop(db);
    let reopened = Database::new(dir.path().into()).unwrap();
    let mut conn = reopened.conn.lock().unwrap();
    let json: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key=?1",
            [STATE_KEY],
            |r| r.get(0),
        )
        .unwrap();
    let resumed: AppState = serde_json::from_str(&json).unwrap();
    assert_eq!(resumed.sessions[0].index, 0);
    assert_eq!(
        resumed.sessions[0]
            .words
            .iter()
            .map(|w| &w.id)
            .collect::<Vec<_>>(),
        session.words.iter().map(|w| &w.id).collect::<Vec<_>>()
    );
    assert!(speech.player.is_none());
    assert!(
        crate::recordings::prepare(dir.path(), &session.words, &options.accent, |_| {})
            .await
            .unwrap()
            .missing
            .is_empty()
    );
    assert_eq!(
        mtimes,
        paths
            .iter()
            .map(|p| std::fs::metadata(p).unwrap().modified().unwrap())
            .collect::<Vec<_>>()
    );
    for stage in &scenario.stages[2..] {
        validate_state(stage).unwrap();
        write_state(&conn, stage).unwrap();
    }
    assert_eq!(scenario.stages[2].sessions[0].phase, "review");
    assert!(scenario.stages[2].sessions[0]
        .marks
        .iter()
        .all(Option::is_none));
    let completed = &scenario.stages[3].sessions[0];
    assert_eq!(completed.phase, "done");
    assert_eq!(
        completed
            .marks
            .iter()
            .filter(|m| **m == Some(false))
            .count(),
        1
    );
    let final_state = scenario.stages.last().unwrap();
    let retry = &final_state.sessions[1];
    assert_eq!(retry.words.len(), 1);
    assert_eq!(retry.marks, vec![Some(true)]);
    assert!(
        crate::recordings::prepare(dir.path(), &retry.words, &options.accent, |_| {})
            .await
            .unwrap()
            .missing
            .is_empty()
    );
    assert!(speech.accept(3));
    play_cached(
        &mut speech,
        dir.path(),
        &retry.words[0].front,
        &options.accent,
        options.rate,
    )
    .unwrap();
    let start = std::time::Instant::now();
    loop {
        if speech.player.as_ref().unwrap().sink.empty() {
            break;
        }
        if start.elapsed().as_secs() > 10 {
            speech.stop();
            panic!("local playback timed out");
        }
        std::thread::sleep(std::time::Duration::from_millis(30));
    }
    speech.stop();
    let backup = make_backup(&conn, final_state.clone()).unwrap();
    let encoded = serde_json::to_vec(&backup).unwrap();
    let decoded: Backup = serde_json::from_slice(&encoded).unwrap();
    conn.execute("DELETE FROM decks WHERE id=?1", [&scenario.deck.id])
        .unwrap();
    restore(&mut conn, &decoded).unwrap();
    assert_eq!(read_words(&conn, &scenario.deck.id).unwrap().len(), 3);
    let mut corrupt = decoded;
    corrupt.version = 999;
    assert!(restore(&mut conn, &corrupt).is_err());
    assert_eq!(read_words(&conn, &scenario.deck.id).unwrap().len(), 3);
    let unavailable = vec![
        Word {
            id: "missing".into(),
            front: "no-such-recording-acceptance-xyz".into(),
            back: String::new(),
        },
        session.words[0].clone(),
    ];
    let report = crate::recordings::prepare(dir.path(), &unavailable, &options.accent, |_| {})
        .await
        .unwrap();
    assert_eq!(report.missing.len(), 1);
    assert_eq!(report.ready, vec![session.words[0].id.clone()]);
    assert!(
        !crate::recordings::audio_path(dir.path(), &unavailable[0].front, &options.accent).exists()
    );
    println!("OFFLINE_NATIVE_OK: import, pre-cache, local playback, cancel, SQLite reopen, fixed order, review, retry, backup, restore rollback");
}
