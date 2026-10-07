use std::collections::BTreeMap;

use providence_core::rebuilt::RebuiltV3FileIntegrity;
use serde::Serialize;

pub(crate) fn default_limit() -> usize {
    64
}

#[derive(Debug, Serialize)]
pub(crate) struct FilePage<'a> {
    items: Vec<FileRow<'a>>,
    offset: usize,
    limit: usize,
    total: usize,
    truncated: bool,
}

#[derive(Debug, Serialize)]
struct FileRow<'a> {
    path: &'a str,
    bytes: u64,
    kind: &'static str,
}

fn row<'a>((path, integrity): (&'a String, &RebuiltV3FileIntegrity)) -> FileRow<'a> {
    FileRow {
        path: path.as_str(),
        bytes: integrity.bytes,
        kind: if path.starts_with("assets/media/") {
            "media"
        } else {
            "document"
        },
    }
}

pub(crate) fn page(
    files: &BTreeMap<String, RebuiltV3FileIntegrity>,
    manifest_bytes: usize,
    offset: usize,
    limit: usize,
) -> FilePage<'_> {
    let limit = limit.clamp(1, 128);
    let total = files.len() + 1;
    // The archive adds manifest.json; the manifest does not hash itself.
    let items = files
        .iter()
        .take_while(|(path, _)| path.as_str() < "manifest.json")
        .map(row)
        .chain(std::iter::once(FileRow {
            path: "manifest.json",
            bytes: manifest_bytes as u64,
            kind: "manifest",
        }))
        .chain(
            files
                .iter()
                .skip_while(|(path, _)| path.as_str() < "manifest.json")
                .map(row),
        )
        .skip(offset)
        .take(limit)
        .collect();
    FilePage {
        items,
        offset,
        limit,
        total,
        truncated: offset.saturating_add(limit) < total,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> BTreeMap<String, RebuiltV3FileIntegrity> {
        [
            "content.json",
            "world.json",
            "scenario.json",
            "assets/index.json",
        ]
        .into_iter()
        .map(str::to_owned)
        .chain((0..501).map(|i| format!("assets/media/{i:064x}.png")))
        .enumerate()
        .map(|(i, path)| {
            (
                path,
                RebuiltV3FileIntegrity {
                    bytes: i as u64 + 1,
                    sha256: "test-only".into(),
                },
            )
        })
        .collect()
    }

    #[test]
    fn pages_cover_the_exact_archive_inventory_in_lexical_order() {
        let files = fixture();
        let mut actual = Vec::new();
        for offset in (0..506).step_by(64) {
            let result = page(&files, 1234, offset, default_limit());
            assert_eq!(result.total, 506);
            assert_eq!(result.truncated, offset + 64 < 506);
            assert!(result.items.len() <= 64);
            actual.extend(result.items);
        }
        let mut expected = files.keys().map(String::as_str).collect::<Vec<_>>();
        expected.push("manifest.json");
        expected.sort_unstable();
        assert_eq!(actual.iter().map(|r| r.path).collect::<Vec<_>>(), expected);
        for item in actual {
            if item.path == "manifest.json" {
                assert_eq!(item.bytes, 1234);
                assert_eq!(item.kind, "manifest");
            } else {
                assert_eq!(item.bytes, files[item.path].bytes);
                assert_eq!(
                    item.kind,
                    if item.path.starts_with("assets/media/") {
                        "media"
                    } else {
                        "document"
                    }
                );
            }
        }
    }

    #[test]
    fn page_limits_and_out_of_range_offsets_are_bounded() {
        let files = fixture();
        assert_eq!(page(&files, 42, 0, 0).items.len(), 1);
        assert_eq!(page(&files, 42, 0, usize::MAX).items.len(), 128);
        for offset in [506, 999, usize::MAX] {
            let result = page(&files, 42, offset, 128);
            assert!(result.items.is_empty());
            assert!(!result.truncated);
            assert_eq!(result.total, 506);
        }
    }

    #[test]
    fn serialized_rows_contain_only_display_metadata() {
        let files = fixture();
        let result = serde_json::to_value(page(&files, 42, 0, 128)).unwrap();
        for row in result["items"].as_array().unwrap() {
            assert_eq!(row.as_object().unwrap().len(), 3);
            assert!(row.get("path").is_some());
            assert!(row.get("bytes").is_some());
            assert!(row.get("kind").is_some());
        }
    }

    #[test]
    fn request_defaults_preserve_existing_callers_and_reject_negative_paging() {
        let mut request = serde_json::json!({
            "compilerCommit": "controlled-commit",
            "minimumEngineVersion": "0.1.0"
        });
        let parsed: crate::rebuilt_packages::RebuiltPackageInspection =
            serde_json::from_value(request.clone()).unwrap();
        assert_eq!(parsed.offset, 0);
        assert_eq!(parsed.limit, default_limit());
        assert!(parsed.package_finalization.is_none());
        let compilation: crate::rebuilt_packages::RebuiltPackageCompilation =
            serde_json::from_value(serde_json::json!({
                "path": "campaign.realmz2",
                "minimumEngineVersion": "0.1.0"
            }))
            .unwrap();
        assert!(compilation.package_finalization.is_none());
        request["offset"] = (-1).into();
        assert!(
            serde_json::from_value::<crate::rebuilt_packages::RebuiltPackageInspection>(request)
                .is_err()
        );
    }
}
