use crate::{
    codecs::{EXTRA_CODE_CODEC, SCENARIO_MESSAGE_CODEC, SCENARIO_SPELL_CODEC},
    model::{ProjectOrigin, ProjectSnapshot, StableId},
    validation::{Diagnostic, Severity},
};

pub(super) fn diagnostics(snapshot: &ProjectSnapshot) -> Vec<Diagnostic> {
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        return Vec::new();
    }
    let mut findings = partial_records(snapshot);
    quarantined_race(snapshot, &mut findings);
    quarantined_shops(snapshot, &mut findings);
    findings
}

fn partial_records(snapshot: &ProjectSnapshot) -> Vec<Diagnostic> {
    [SCENARIO_MESSAGE_CODEC, EXTRA_CODE_CODEC, SCENARIO_SPELL_CODEC]
        .iter()
        .flat_map(|codec| {
            snapshot.classic_sources.iter().filter_map(move |source| {
                if source.native_path != codec.native_path {
                    return None;
                }
                let remainder = source.byte_length % codec.record_bytes as u64;
                (remainder > 0).then(|| Diagnostic {
                    code: "source.partial-record.preserved".into(),
                    severity: Severity::Warning,
                    message: format!(
                        "{} retains {remainder} trailing bytes after {} complete records. The fragment is preserved, not edited or executed as a complete record.",
                        source.native_path, source.byte_length / codec.record_bytes as u64
                    ),
                    entity: Some(StableId(format!("classic-source:{}", source.native_path))),
                    field: None,
                })
            })
        })
        .collect::<Vec<_>>()
}

fn quarantined_race(snapshot: &ProjectSnapshot, findings: &mut Vec<Diagnostic>) {
    if let Some(source) = snapshot.classic_sources.iter().find(|source| {
        source.native_path == "Data Race"
            && source.byte_length < 30 * crate::codecs::RACE_RECORD_BYTES as u64
    }) {
        findings.push(Diagnostic {
            code: "source.race-table.quarantined".into(),
            severity: Severity::Warning,
            message: format!("Data Race has {} bytes; Castle requires 30 complete 408-byte records. The exact file is retained. Application rules are available; this scenario table cannot be selected.", source.byte_length),
            entity: Some(StableId("classic-source:Data Race".into())),
            field: None,
        });
    }
}

fn quarantined_shops(snapshot: &ProjectSnapshot, findings: &mut Vec<Diagnostic>) {
    if let Some(source) = snapshot
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Data SD")
    {
        let physical = source.byte_length / crate::codecs::SHOP_RECORD_BYTES as u64;
        let projected = snapshot
            .shops
            .iter()
            .map(|shop| u64::from(shop.native_id.0))
            .filter(|id| *id < physical)
            .collect::<std::collections::BTreeSet<_>>();
        let excluded = physical - projected.len() as u64;
        if excluded > 0 {
            let examples = (0..physical)
                .filter(|id| !projected.contains(id))
                .take(8)
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(", ");
            findings.push(Diagnostic {
                code: "source.shop-records.quarantined".into(), severity: Severity::Warning,
                message: format!("Data SD retains {excluded} unprojected record-sized blocks (slots {examples}{}). Their bytes are preserved; they are not treated as Shop inventories. Any caller of an unavailable Shop is diagnosed separately.", if excluded > 8 { ", …" } else { "" }),
                entity: Some(StableId("classic-source:Data SD".into())), field: None,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{BlobId, ClassicSourceBlob};

    #[test]
    fn imported_fragments_have_exact_sources_without_invented_records() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("fragments".into()));
        snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: BlobId("annex".into()),
        };
        for (path, length) in [("Data EDCD", 27), ("Data SD2", 512), ("Unknown", 7)] {
            snapshot.classic_sources.push(ClassicSourceBlob {
                native_path: path.into(),
                byte_length: length,
                blob: BlobId(path.into()),
            });
        }
        let before = snapshot.clone();
        let findings = diagnostics(&snapshot);
        assert_eq!(findings.len(), 1);
        assert_eq!(
            findings[0].entity,
            Some(StableId("classic-source:Data EDCD".into()))
        );
        assert_eq!(findings[0].field, None);
        assert_eq!(snapshot, before);
        snapshot.origin = ProjectOrigin::Authored;
        assert!(diagnostics(&snapshot).is_empty());
    }
}
