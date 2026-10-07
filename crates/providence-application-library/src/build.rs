mod archive;
mod catalogs;
mod documents;
mod encoding;
mod options;
mod publication;
mod sources;

pub(super) use options::usage;

pub(super) fn run(args: &[String]) -> Result<(), String> {
    let options = options::BuildOptions::parse(args)?;
    let sources = sources::VerifiedSources::load(&options.source_root)?;
    let library = catalogs::Library::derive(&sources)?;
    publication::publish(&options, &sources, library)
}
