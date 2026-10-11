//! Optional bounded timings distinguish decoding from staging and final commit.

use serde_json::{Value, json};
use std::sync::Arc;
use std::time::Instant;

pub(super) type Progress = Arc<dyn Fn(&str, bool) -> Result<(), String> + Send + Sync>;

pub(super) struct ImportTiming {
    enabled: bool,
    phases: Vec<Value>,
    progress: Option<Progress>,
}

impl ImportTiming {
    pub(super) fn new(params: &Value, progress: Option<Progress>) -> Self {
        Self {
            enabled: params["measurePerformance"].as_bool() == Some(true),
            phases: Vec::new(),
            progress,
        }
    }

    pub(super) fn run<T>(
        &mut self,
        name: &str,
        action: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        if let Some(progress) = &self.progress {
            progress(name, false)?;
        }
        let started = Instant::now();
        let result = action();
        if result.is_ok()
            && let Some(progress) = &self.progress
        {
            progress(name, true)?;
        }
        if self.enabled {
            self.phases.push(
                json!({"phase": name, "elapsedMs": started.elapsed().as_secs_f64() * 1000.0}),
            );
        }
        result
    }

    pub(super) fn attach(self, result: &mut Value) {
        if self.enabled {
            result["importPerformance"] = json!(self.phases);
        }
    }
}
