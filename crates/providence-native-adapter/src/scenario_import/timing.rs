//! Optional bounded timings distinguish decoding from staging and final commit.

use serde_json::{Value, json};
use std::time::Instant;

pub(super) struct ImportTiming {
    enabled: bool,
    phases: Vec<Value>,
}

impl ImportTiming {
    pub(super) fn new(params: &Value) -> Self {
        Self {
            enabled: params["measurePerformance"].as_bool() == Some(true),
            phases: Vec::new(),
        }
    }

    pub(super) fn run<T>(
        &mut self,
        name: &str,
        action: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let started = Instant::now();
        let result = action();
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
