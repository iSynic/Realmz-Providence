//! A panic poisons the whole host, not only the requesting client's view.
//!
//! Every client shares one project session, one store, the open Monster Library and the
//! host's change feed, holds and export jobs, and each request borrows all of them mutably.
//! An unwind skips the session's rollback, so any of them may be half-applied and no later
//! request, read or write, can be shown safe. The host withdraws its endpoint, releases the
//! project writer without saving, and answers remaining clients until they leave so a
//! reopen starts a fresh host from the last acknowledged checkpoint.
use super::{Event, mpsc, state::failure};
use std::{collections::BTreeSet, time::Duration};

pub(super) fn drain<Poisoned: Send + 'static>(
    events: &mpsc::Receiver<Event>,
    mut open: BTreeSet<u64>,
    poisoned: Poisoned,
) -> Result<(), String> {
    // Dropping may wait for in-flight workers; their store clones hold the writer until then.
    let release = std::thread::spawn(move || drop(poisoned));
    while !open.is_empty() {
        match events.recv_timeout(Duration::from_secs(10)) {
            Ok(Event::Request(_, request, reply)) => {
                let _ = reply.send(failure(
                    request.id,
                    "session-poisoned: an earlier request panicked and this host stopped serving the project; reopen the project".into(),
                ));
            }
            Ok(Event::Disconnected(client)) => {
                open.remove(&client);
            }
            Err(_) => break,
        }
    }
    release
        .join()
        .map_err(|_| "poisoned host state panicked while it was released".to_string())
}
