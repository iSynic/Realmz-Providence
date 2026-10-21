//! A lost revision-rejection reply still has an exact, durable no-effect witness.
use super::*;

impl State {
    pub(super) fn reject_stale(
        &mut self,
        request: &Request,
        kind: &str,
        error: String,
        context: &mut Context<'_>,
    ) -> Result<Response, String> {
        let receipt = receipts::begin_with_provenance(context.store, request, self.provenance())?;
        let path = match receipt {
            receipts::Start::New(path) => path,
            receipts::Start::Replay(mut response) => {
                response.id = request.id;
                return Ok(response);
            }
        };
        let mut response = failure(request.id, error);
        if kind == "native"
            && let Err(error) = crate::monster_operation_receipts::record_project_rejection(
                context.store,
                request,
                &mut response,
            )
        {
            response = failure(
                request.id,
                format!("outcome-unknown: rejection receipt could not be completed: {error}"),
            );
            response.outcome_unknown = Some(true);
        }
        if let Err(error) = receipts::finish(&path, &response) {
            self.load_receipt_gate(context.store)?;
            return Err(format!(
                "outcome-unknown: rejection receipt could not be persisted: {error}"
            ));
        }
        if response.outcome_unknown == Some(true) {
            self.load_receipt_gate(context.store)?;
        }
        Ok(response)
    }
}
