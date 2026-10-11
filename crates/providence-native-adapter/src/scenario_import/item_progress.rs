//! Optional job-local item counts; worker callbacks observe staging only.
use std::{cell::RefCell, sync::Arc};

pub(crate) type Callback = Arc<dyn Fn(&str, usize, usize) + Send + Sync>;
thread_local! { static CURRENT: RefCell<Option<Callback>> = const { RefCell::new(None) }; }

pub(crate) struct Scope(Option<Callback>);

impl Scope {
    pub(crate) fn begin(callback: Callback) -> Self {
        Self(CURRENT.with(|current| current.replace(Some(callback))))
    }
}

impl Drop for Scope {
    fn drop(&mut self) {
        CURRENT.with(|current| current.replace(self.0.take()));
    }
}

pub(crate) fn callback() -> Option<Callback> {
    CURRENT.with(|current| current.borrow().clone())
}
