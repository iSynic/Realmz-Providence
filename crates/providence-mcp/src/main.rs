#![forbid(unsafe_code)]
mod backend;
mod compatibility;
mod config;
mod errors;
mod images;
mod project_creation;
mod resources;
mod server;
mod tools;
use rmcp::ServiceExt;

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("Providence MCP: {error}");
        std::process::exit(1);
    }
}
async fn run() -> Result<(), String> {
    if std::env::args().skip(1).collect::<Vec<_>>() == ["capability-registry"] {
        println!(
            "{}",
            serde_json::to_string_pretty(&providence_session_client::capabilities::all())
                .map_err(|e| e.to_string())?
        );
        return Ok(());
    }
    if std::env::args().skip(1).collect::<Vec<_>>() == ["build-identity"] {
        println!(
            "{}",
            serde_json::to_string_pretty(&providence_core::build_identity::current(
                "providence-mcp"
            ))
            .map_err(|e| e.to_string())?
        );
        return Ok(());
    }
    let server = config::configure()?;
    let service = server
        .serve(rmcp::transport::stdio())
        .await
        .map_err(|e| e.to_string())?;
    service.waiting().await.map_err(|e| e.to_string())?;
    Ok(())
}
