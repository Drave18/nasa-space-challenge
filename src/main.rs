use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Duration;

use clap::Parser;
use nssdca_scraper::ScrapeConfig;
use nssdca_scraper::model::ExtractionStatus;
use nssdca_scraper::scrape::run;

/// Scrape Moon/Mars surface-mission metadata from the NASA NSSDCA archive.
#[derive(Parser)]
#[command(version)]
struct Args {
    /// Destination JSON file (replaced atomically).
    #[arg(long, default_value = "missions.json")]
    output: PathBuf,
    /// Maximum in-flight requests.
    #[arg(long, default_value_t = 4, value_parser = clap::value_parser!(u32).range(1..))]
    concurrency: u32,
    /// Minimum milliseconds between request starts to the archive host.
    #[arg(long, default_value_t = 1000, value_parser = clap::value_parser!(u64).range(1000..))]
    request_interval_ms: u64,
}

#[tokio::main]
async fn main() -> ExitCode {
    let args = Args::parse();
    let config = ScrapeConfig::production(args.concurrency as usize, Duration::from_millis(args.request_interval_ms));
    let result = run(config, &args.output).await;
    match result {
        Ok(records) => {
            let partial = records.iter().filter(|r| r.extraction_status == ExtractionStatus::Partial).count();
            eprintln!("wrote {} records ({partial} partial) to {}", records.len(), args.output.display());
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("error: {e:#}");
            ExitCode::FAILURE
        }
    }
}
