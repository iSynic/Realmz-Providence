//! Disconnected clients settle their workers without blocking the surviving editor.
use crate::transport::ConnectionJobs;
use std::thread::JoinHandle;

#[derive(Default)]
pub(super) struct RetiredJobs(Vec<JoinHandle<()>>);
impl RetiredJobs {
    pub fn retire(&mut self, jobs: Option<ConnectionJobs>) {
        self.0.retain(|worker| !worker.is_finished());
        if let Some(jobs) = jobs {
            self.0.push(std::thread::spawn(move || drop(jobs)));
        }
    }
}
impl Drop for RetiredJobs {
    fn drop(&mut self) {
        for worker in self.0.drain(..) {
            let _ = worker.join();
        }
    }
}
