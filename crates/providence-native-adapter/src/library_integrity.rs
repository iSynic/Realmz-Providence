//! Background inspection is bound to the catalog captured by this connection.

use crate::catalogs::CatalogViews;
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

pub(crate) struct Inspection(Arc<Mutex<Option<Result<(), String>>>>);

impl Inspection {
    pub(crate) fn begin(catalogs: CatalogViews<'_>) -> Self {
        let shared = Arc::new(Mutex::new(None));
        if let (Some(store), Some(catalog)) =
            (catalogs.application_media_store, catalogs.application_media)
        {
            let store = store.clone();
            let catalog = catalog.clone();
            let worker = shared.clone();
            let result = std::thread::Builder::new()
                .name("stock-integrity".into())
                .spawn(move || {
                    let result = store
                        .load_catalog()
                        .map_err(|error| error.to_string())
                        .and_then(|current| {
                            if current == catalog {
                                Ok(())
                            } else {
                                Err("Stock catalog changed; reopen the project.".into())
                            }
                        });
                    *worker.lock().unwrap_or_else(|error| error.into_inner()) = Some(result);
                });
            if let Err(error) = result {
                *shared.lock().unwrap_or_else(|error| error.into_inner()) =
                    Some(Err(error.to_string()));
            }
        } else {
            *shared.lock().unwrap_or_else(|error| error.into_inner()) = Some(Ok(()));
        }
        Self(shared)
    }

    pub(crate) fn status(&self) -> Value {
        let result = self.0.lock().unwrap_or_else(|error| error.into_inner());
        match result.as_ref() {
            None => json!({"status": "running"}),
            Some(Ok(())) => json!({"status": "complete"}),
            Some(Err(error)) => json!({"status": "failed", "error": error}),
        }
    }
}
