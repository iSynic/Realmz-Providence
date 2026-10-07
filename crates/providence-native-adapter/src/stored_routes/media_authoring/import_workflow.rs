use super::imports::{self, Material};
use super::*;
use providence_core::personal_library::{LibraryCommand, PersonalAsset};
use providence_storage::PersonalLibraryStore;

struct Destination<'a> {
    library: Option<&'a PersonalLibraryStore>,
    source_library: Option<&'a PersonalLibraryStore>,
    revision: Option<u64>,
}

struct PreparedImport {
    original: Vec<u8>,
    kind: String,
    label: String,
    retained: Option<PersonalMedia>,
    materials: Vec<Material>,
    media: PersonalMedia,
    hash: String,
    original_only: bool,
}

pub(super) fn dispatch(
    session: &mut EditorSession,
    project: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let destination = Destination::read(catalogs, params)?;
    if destination.library.is_none() {
        super::check_project(session, params)?;
    }
    let prepared = PreparedImport::build(session, catalogs, &destination, params)?;
    if destination.library.is_none() {
        super::allocation::check(
            session,
            project.ok_or("Open a persistent scenario before importing.")?,
            catalogs,
            &prepared.media,
            params["replaceIdentity"].is_string(),
        )?;
    }
    if method.ends_with("prepare") {
        return prepared.review(session, destination.revision, params);
    }
    super::require_review(params, &prepared.hash)?;
    if let Some(library) = destination.library {
        return prepared.commit_library(library, destination.revision, params);
    }
    prepared.commit_project(
        session,
        project.ok_or("Open a persistent scenario before importing.")?,
        params,
    )
}

impl<'a> Destination<'a> {
    fn read(catalogs: CatalogViews<'a>, params: &Value) -> Result<Self, String> {
        let library = if params["destination"] == "personal" {
            Some(
                catalogs
                    .personal_library
                    .ok_or("Open My Library before importing.")?,
            )
        } else {
            None
        };
        let source_library = if params["sourceLibraryIdentity"].is_string() {
            Some(
                catalogs
                    .personal_library
                    .ok_or("Open the original My Library first.")?,
            )
        } else {
            None
        };
        let revision = library
            .or(source_library)
            .map(|store| {
                store
                    .load_manifest()
                    .map(|state| state.revision())
                    .map_err(|e| e.to_string())
            })
            .transpose()?;
        if revision
            .is_some_and(|revision| params["expectedLibraryRevision"].as_u64() != Some(revision))
        {
            return Err("My Library changed. Review this import again.".into());
        }
        if library.is_some() && params["replaceIdentity"].is_string() {
            return Err("Library originals are replaced by explicit new imports.".into());
        }
        Ok(Self {
            library,
            source_library,
            revision,
        })
    }
}

impl PreparedImport {
    fn build(
        session: &EditorSession,
        catalogs: CatalogViews<'_>,
        destination: &Destination<'_>,
        params: &Value,
    ) -> Result<Self, String> {
        let original = imports::read_original(params, destination.source_library)?;
        let kind = required_string(params, "kind")?;
        let label = required_string(params, "name")?;
        if label.trim().is_empty() || label.len() > 256 || label.chars().any(char::is_control) {
            return Err(
                "Give the media a nonempty name of at most 256 bytes without control characters."
                    .into(),
            );
        }
        let retained = retained_media(session, catalogs, params)?;
        let original_only = destination.library.is_some() && params["output"] == "original";
        if original_only
            && params["reversePath"]
                .as_str()
                .is_some_and(|path| !path.is_empty())
        {
            return Err("Keeping an original supports one source file. Choose Realmz-ready to retain both monster artwork files.".into());
        }
        let materials = imports::prepare(
            &original,
            &kind,
            &label,
            params,
            retained.as_ref(),
            original_only,
        )?;
        let media = PersonalMedia {
            primary: materials[0].asset.clone(),
            companion: materials.get(1).map(|material| material.asset.clone()),
        };
        let mut source_intent = params.clone();
        source_intent["sourceDigests"] = json!(
            materials
                .iter()
                .map(|material| &material.source)
                .collect::<Vec<_>>()
        );
        let hash = super::checked_hash(session, &source_intent, destination.revision, &media)?;
        Ok(Self {
            original,
            kind,
            label,
            retained,
            materials,
            media,
            hash,
            original_only,
        })
    }

    fn review(
        &self,
        session: &EditorSession,
        revision: Option<u64>,
        params: &Value,
    ) -> Result<Value, String> {
        let preview = super::preview(&self.media, |blob| {
            self.materials
                .iter()
                .find(|material| &material.asset.blob == blob)
                .map(|material| material.runtime.clone())
                .ok_or("Prepared preview unavailable".into())
        })?;
        let source = imports::source_preview(&self.original, &self.kind)?;
        let uses = self.retained.as_ref().map(|media|crate::document_catalogs::project_asset_open(session, &json!({"identity":media.primary.identity,"expectedRevision":session.revision()}))).transpose()?;
        Ok(
            json!({"revision":session.revision(),"libraryRevision":revision,"reviewHash":self.hash,"media":self.media,"originalOnly":self.original_only,"sourceBytes":self.original.len(),"source":source,"preview":preview,"uses":uses,"warnings":imports::warnings(&self.original,&self.kind,params)?}),
        )
    }

    fn commit_library(
        self,
        library: &PersonalLibraryStore,
        revision: Option<u64>,
        params: &Value,
    ) -> Result<Value, String> {
        let original_blob = library
            .put_original(&self.original)
            .map_err(|e| e.to_string())?;
        for material in &self.materials {
            library
                .put_original(&material.runtime)
                .map_err(|e| e.to_string())?;
            if !self.original_only {
                library
                    .put_original(&material.native)
                    .map_err(|e| e.to_string())?;
            }
        }
        let entry = PersonalAsset {
            identity: StableId(required_string(params, "libraryIdentity")?),
            name: self.label,
            collection: crate::personal_library::collection(params)?,
            original: original_blob,
            byte_length: self.original.len() as u64,
            mime_type: self.materials[0]
                .asset
                .mime_type
                .clone()
                .unwrap_or_default(),
            media: if self.original_only {
                None
            } else {
                Some(self.media)
            },
            import_kind: Some(self.kind),
        };
        let delta = library
            .apply(
                revision.ok_or("Missing library revision")?,
                LibraryCommand::Import((entry).into()),
            )
            .map_err(|e| e.to_string())?;
        Ok(json!({"delta":delta,"scenarioChanged":false}))
    }

    fn commit_project(
        self,
        session: &mut EditorSession,
        project: &ProjectStore,
        params: &Value,
    ) -> Result<Value, String> {
        for material in &self.materials {
            project
                .put_blob(&material.runtime)
                .map_err(|e| e.to_string())?;
            project
                .put_blob(&material.native)
                .map_err(|e| e.to_string())?;
        }
        let mut result = crate::execute(session, params, super::upsert(&self.media))?;
        result["identity"] = json!(self.media.primary.identity);
        Ok(result)
    }
}

fn retained_media(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Option<PersonalMedia>, String> {
    params["replaceIdentity"]
        .as_str()
        .map(|identity| {
            let asset = super::asset(session, identity)?;
            if asset.kind == "tileset" {
                Ok(PersonalMedia {
                    primary: asset,
                    companion: None,
                })
            } else {
                super::transfers::scenario_media(session, catalogs, &json!({"identity":identity}))
            }
        })
        .transpose()
}
