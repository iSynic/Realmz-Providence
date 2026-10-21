//! New identities never silently reuse retained inactive records or descriptions.
use super::monster_records::{monster_identity, monster_native_path, validate_monster_set_id};
use super::{EditorSession, MonsterOperation, MonsterRecordOperation, SessionError};
use crate::model::{NativeRecordId, StableId};
use serde::Serialize;
use std::collections::BTreeSet;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterAllocation {
    pub set_id: i16,
    pub native_id: NativeRecordId,
    pub identity: StableId,
    pub operation: MonsterOperation,
    pub review_hash: String,
}

impl EditorSession {
    pub fn allocate_monster(&self, set_id: i16) -> Result<MonsterAllocation, SessionError> {
        validate_monster_set_id(set_id, &self.snapshot.project_id)?;
        let mut used: BTreeSet<_> = self
            .snapshot
            .monster_sets
            .iter()
            .flat_map(|set| &set.monsters)
            .map(|row| row.native_id.0)
            .chain(
                self.snapshot
                    .monster_descriptions
                    .iter()
                    .map(|row| row.native_id.0),
            )
            .collect();
        // Source extents also reserve rows absent from a decoded projection.
        for source in &self.snapshot.classic_sources {
            if [-1, 0, 1]
                .iter()
                .any(|set| monster_native_path(*set) == Some(source.native_path.as_str()))
            {
                let count = source.byte_length / crate::codecs::MONSTER_RECORD_BYTES as u64;
                used.extend(0..count.min(i16::MAX as u64 + 1) as u32);
            }
        }
        let id = (1..=i16::MAX as u32).find(|id| !used.contains(id)).ok_or_else(|| SessionError::InvalidMonster {
            identity: self.snapshot.project_id.clone(), reason: "No unused positive signed-short Monster ID remains; retained rows are not replaced.".into()
        })?;
        let native_id = NativeRecordId(id);
        let operation = MonsterOperation {
            action: MonsterRecordOperation::Create { set_id, native_id },
            retarget_uses: Vec::new(),
        };
        let review = self.review_monster_operation(&operation)?;
        Ok(MonsterAllocation {
            set_id,
            native_id,
            identity: monster_identity(set_id, native_id),
            operation,
            review_hash: review.review_hash,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{BlobId, ClassicSourceBlob, ProjectSnapshot};
    use crate::session::{EditorCommand, ExpectedRevisionCommand};

    #[test]
    fn allocation_reserves_inactive_rows_across_sets_and_is_only_a_read() {
        let mut session =
            EditorSession::new(ProjectSnapshot::new_authored(StableId("allocation".into())));
        assert_eq!(session.allocate_monster(0).unwrap().native_id.0, 1);
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::CreateMonster {
                    set_id: 1,
                    native_id: NativeRecordId(1),
                },
            })
            .unwrap();
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::ClearMonster {
                    set_id: 1,
                    native_id: NativeRecordId(1),
                },
            })
            .unwrap();
        let before = session.snapshot.clone();
        let revision = session.revision();
        let allocation = session.allocate_monster(0).unwrap();
        assert_eq!(allocation.native_id.0, 2);
        assert_eq!(session.snapshot, before);
        assert_eq!(session.revision(), revision);
        assert!(session.allocate_monster(2).is_err());
    }

    #[test]
    fn certified_source_suffix_is_not_an_automatic_allocation_destination() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("retained".into()));
        snapshot.classic_sources.push(ClassicSourceBlob {
            native_path: "Data MD".into(),
            blob: BlobId("6a1496e62e7c0b96c4d5b6e532c2a8c8d99fdbbd54048b73ba386dbb2e43df6d".into()),
            byte_length: 52_710,
        });
        let session = EditorSession::new(snapshot);
        assert!(
            session
                .allocate_monster(0)
                .unwrap_err()
                .to_string()
                .contains("preserved compatibility payload")
        );
        assert_eq!(session.revision().0, 0);
    }
}
