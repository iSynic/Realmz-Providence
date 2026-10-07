use std::process::ExitCode;

pub(crate) struct Inspection {
    pub(crate) report: serde_json::Value,
    pub(crate) accepted: bool,
}

pub(crate) fn finish_inspection(result: Result<Inspection, String>) -> ExitCode {
    match result {
        Ok(inspection) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&inspection.report)
                    .expect("inspection report serializes")
            );
            if inspection.accepted {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(error) => report_error(error),
    }
}

pub(crate) fn read_source(label: &str, path: &str) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|error| format!("could not read {label}: {error}"))
}

pub(crate) fn report_error(error: String) -> ExitCode {
    eprintln!("{error}");
    ExitCode::FAILURE
}

pub(crate) fn usage_error(message: &str) -> ExitCode {
    eprintln!("{message}");
    print_help();
    ExitCode::from(2)
}

pub(crate) fn parse_probe_row(row: &str) -> Result<u32, String> {
    row.parse::<u32>()
        .map_err(|_| "row must fit an unsigned 32-bit integer".to_string())
}
pub(crate) fn print_help() {
    print!("{}", include_str!("help.txt"));
}
