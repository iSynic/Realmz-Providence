use super::verify_owned_bytes;

#[test]
fn owned_span_reports_ordered_offsets_and_preserves_error_context() {
    let source = [1, 2, 3, 4];
    let compiled = [1, 8, 9, 4];
    assert_eq!(
        verify_owned_bytes(&source, &compiled, 1..3, "field range").unwrap(),
        vec![1, 2],
    );
    assert_eq!(
        verify_owned_bytes(&source, &compiled, 1..2, "field range").unwrap_err(),
        "field range 1..2",
    );
    assert_eq!(
        verify_owned_bytes(&source, &source, 1..3, "field range").unwrap(),
        Vec::<usize>::new(),
    );
}
