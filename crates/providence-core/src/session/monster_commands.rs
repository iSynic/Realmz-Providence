use crate::codecs::certified_monster_source;
use crate::codecs::validate_monster_record_shape;
use crate::model::BlobId;
use crate::model::ClassicSourceBlob;
use crate::model::MonsterDescription;
use crate::model::MonsterRecord;
use crate::model::MonsterSet;
use crate::model::NativeRecordId;
use crate::model::ProjectOrigin;
use crate::model::ProjectSnapshot;
use crate::model::StableId;
use crate::monster_library::MonsterLibraryCopyMode;
use crate::monster_library::MonsterLibraryScenarioCopy;
use crate::session::EditorSession;
use crate::session::commands::EditorCommand;
use crate::session::errors::SessionError;
use crate::session::field_paths::parse_indexed_field;
use crate::session::monster_records::authored_monster;
use crate::session::monster_records::authored_monster_description;
use crate::session::monster_records::cleared_monster;
use crate::session::monster_records::generated_monster_variant;
use crate::session::monster_records::monster_for_set;
use crate::session::monster_records::monster_for_target;
use crate::session::monster_records::monster_identity;
use crate::session::monster_records::monster_native_path;
use crate::session::monster_records::monster_record_is_active;
use crate::session::monster_records::upsert_monster_description;
use crate::session::monster_records::upsert_monster_record;
use crate::session::monster_records::validate_classic_monster_import;
use crate::session::monster_records::validate_monster_native_id;
use crate::session::monster_records::validate_monster_set_id;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn import_classic_monster_slice(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        monster_sets: Vec<MonsterSet>,
        monster_descriptions: Vec<MonsterDescription>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_monster_import(&sources, &monster_sets, &monster_descriptions)?;
        let identities = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .monster_sets
                    .iter()
                    .chain(monster_sets.iter())
                    .flat_map(|set| set.monsters.iter())
                    .map(|monster| monster.identity.clone()),
            )
            .chain(
                self.snapshot
                    .monster_descriptions
                    .iter()
                    .chain(monster_descriptions.iter())
                    .map(|description| description.identity.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.snapshot.monster_sets = monster_sets;
        self.snapshot.monster_descriptions = monster_descriptions;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_monster(
        &mut self,
        set_id: i16,
        mut monster: Box<MonsterRecord>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_monster_set_id(set_id, &monster.identity)?;
        validate_monster_native_id(monster.native_id, &monster.identity)?;
        if monster.identity != monster_identity(set_id, monster.native_id) {
            return Err(SessionError::InvalidMonster {
                identity: monster.identity.clone(),
                reason: "identity does not match its Classic set and record ID".into(),
            });
        }
        validate_monster_record_shape(&monster).map_err(|error| SessionError::InvalidMonster {
            identity: monster.identity.clone(),
            reason: error.to_string(),
        })?;
        if monster.display_name.chars().count() > 40 {
            return Err(SessionError::InvalidMonster {
                identity: monster.identity.clone(),
                reason: "display name exceeds the 40-byte Classic field".into(),
            });
        }
        let set = self
            .snapshot
            .monster_sets
            .iter_mut()
            .find(|set| set.set_id == set_id)
            .ok_or_else(|| SessionError::MonsterNotFound(monster.identity.clone()))?;
        let existing = set
            .monsters
            .iter_mut()
            .find(|candidate| candidate.identity == monster.identity)
            .ok_or_else(|| SessionError::MonsterNotFound(monster.identity.clone()))?;
        if existing.native_id != monster.native_id {
            return Err(SessionError::InvalidMonster {
                identity: monster.identity.clone(),
                reason: "native record identity cannot be changed".into(),
            });
        }
        monster.authored = true;
        let identity = monster.identity.clone();
        *existing = *monster;
        Ok(vec![identity])
    }

    pub(super) fn create_monster(
        &mut self,
        set_id: i16,
        native_id: NativeRecordId,
    ) -> Result<Vec<StableId>, SessionError> {
        let identity = monster_identity(set_id, native_id);
        validate_monster_set_id(set_id, &identity)?;
        validate_monster_native_id(native_id, &identity)?;
        reject_certified_monster_tail(&self.snapshot, set_id, native_id, &identity)?;
        if monster_for_set(&self.snapshot, set_id, native_id).is_some_and(monster_record_is_active)
        {
            return Err(SessionError::InvalidMonster {
                identity,
                reason: "the target slot already contains an active monster".into(),
            });
        }
        upsert_monster_record(
            &mut self.snapshot,
            set_id,
            authored_monster(native_id, set_id),
        );
        let mut changed = vec![monster_identity(set_id, native_id)];
        if set_id == 0
            && !self
                .snapshot
                .monster_descriptions
                .iter()
                .any(|description| description.native_id == native_id)
        {
            let description = authored_monster_description(native_id, String::new());
            changed.push(description.identity.clone());
            self.snapshot.monster_descriptions.push(description);
        }
        self.snapshot.normalize();
        Ok(changed)
    }

    pub(super) fn duplicate_monster(
        &mut self,
        set_id: i16,
        source_id: NativeRecordId,
        target_id: NativeRecordId,
    ) -> Result<Vec<StableId>, SessionError> {
        let target_identity = monster_identity(set_id, target_id);
        validate_monster_set_id(set_id, &target_identity)?;
        validate_monster_native_id(source_id, &monster_identity(set_id, source_id))?;
        validate_monster_native_id(target_id, &target_identity)?;
        reject_certified_monster_tail(&self.snapshot, set_id, target_id, &target_identity)?;
        if source_id == target_id {
            return Err(SessionError::InvalidMonster {
                identity: target_identity,
                reason: "source and target slots must be different".into(),
            });
        }
        let source = monster_for_set(&self.snapshot, set_id, source_id)
            .cloned()
            .ok_or_else(|| SessionError::MonsterNotFound(monster_identity(set_id, source_id)))?;
        if monster_for_set(&self.snapshot, set_id, target_id).is_some_and(monster_record_is_active)
        {
            return Err(SessionError::InvalidMonster {
                identity: target_identity,
                reason: "the target slot already contains an active monster".into(),
            });
        }
        let duplicate = monster_for_target(source, set_id, target_id);
        upsert_monster_record(&mut self.snapshot, set_id, duplicate);
        let mut changed = vec![monster_identity(set_id, target_id)];
        if set_id == 0 {
            let text = self
                .snapshot
                .monster_descriptions
                .iter()
                .find(|description| description.native_id == source_id)
                .map(|description| description.text.clone())
                .unwrap_or_default();
            let description = authored_monster_description(target_id, text);
            changed.push(description.identity.clone());
            upsert_monster_description(&mut self.snapshot, description);
        }
        self.snapshot.normalize();
        Ok(changed)
    }

    pub(super) fn clear_monster(
        &mut self,
        set_id: i16,
        native_id: NativeRecordId,
    ) -> Result<Vec<StableId>, SessionError> {
        let identity = monster_identity(set_id, native_id);
        validate_monster_set_id(set_id, &identity)?;
        validate_monster_native_id(native_id, &identity)?;
        if monster_for_set(&self.snapshot, set_id, native_id).is_none() {
            return Err(SessionError::MonsterNotFound(identity));
        }
        upsert_monster_record(
            &mut self.snapshot,
            set_id,
            cleared_monster(native_id, set_id),
        );
        let mut changed = vec![monster_identity(set_id, native_id)];
        if !self.snapshot.monster_sets.iter().any(|set| {
            set.monsters
                .iter()
                .any(|monster| monster.native_id == native_id && monster_record_is_active(monster))
        }) {
            let description = authored_monster_description(native_id, String::new());
            changed.push(description.identity.clone());
            upsert_monster_description(&mut self.snapshot, description);
        }
        self.snapshot.normalize();
        Ok(changed)
    }

    pub(super) fn switch_monster_records(
        &mut self,
        set_id: i16,
        first_id: NativeRecordId,
        second_id: NativeRecordId,
    ) -> Result<Vec<StableId>, SessionError> {
        let first_identity = monster_identity(set_id, first_id);
        validate_monster_set_id(set_id, &first_identity)?;
        validate_monster_native_id(first_id, &first_identity)?;
        validate_monster_native_id(second_id, &monster_identity(set_id, second_id))?;
        if first_id == second_id {
            return Err(SessionError::InvalidMonster {
                identity: first_identity,
                reason: "the two slots must be different".into(),
            });
        }
        let first = monster_for_set(&self.snapshot, set_id, first_id)
            .cloned()
            .ok_or_else(|| SessionError::MonsterNotFound(monster_identity(set_id, first_id)))?;
        let second = monster_for_set(&self.snapshot, set_id, second_id)
            .cloned()
            .ok_or_else(|| SessionError::MonsterNotFound(monster_identity(set_id, second_id)))?;
        upsert_monster_record(
            &mut self.snapshot,
            set_id,
            monster_for_target(second, set_id, first_id),
        );
        upsert_monster_record(
            &mut self.snapshot,
            set_id,
            monster_for_target(first, set_id, second_id),
        );
        let first_description_text = self
            .snapshot
            .monster_descriptions
            .iter()
            .find(|description| description.native_id == first_id)
            .map(|description| description.text.clone())
            .unwrap_or_default();
        let second_description_text = self
            .snapshot
            .monster_descriptions
            .iter()
            .find(|description| description.native_id == second_id)
            .map(|description| description.text.clone())
            .unwrap_or_default();
        let first_description = authored_monster_description(first_id, second_description_text);
        let second_description = authored_monster_description(second_id, first_description_text);
        upsert_monster_description(&mut self.snapshot, first_description.clone());
        upsert_monster_description(&mut self.snapshot, second_description.clone());
        self.snapshot.normalize();
        Ok(vec![
            monster_identity(set_id, first_id),
            monster_identity(set_id, second_id),
            first_description.identity,
            second_description.identity,
        ])
    }

    pub(super) fn copy_monster_to_all_sets(
        &mut self,
        source_set_id: i16,
        native_id: NativeRecordId,
    ) -> Result<Vec<StableId>, SessionError> {
        let source_identity = monster_identity(source_set_id, native_id);
        validate_monster_set_id(source_set_id, &source_identity)?;
        validate_monster_native_id(native_id, &source_identity)?;
        let source = monster_for_set(&self.snapshot, source_set_id, native_id)
            .cloned()
            .ok_or(SessionError::MonsterNotFound(source_identity))?;
        let mut changed = Vec::new();
        for set_id in [-1, 0, 1] {
            upsert_monster_record(
                &mut self.snapshot,
                set_id,
                monster_for_target(source.clone(), set_id, native_id),
            );
            changed.push(monster_identity(set_id, native_id));
        }
        self.snapshot.normalize();
        Ok(changed)
    }

    pub(super) fn generate_monster_variants(
        &mut self,
        native_id: NativeRecordId,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_monster_native_id(native_id, &monster_identity(0, native_id))?;
        let source = monster_for_set(&self.snapshot, 0, native_id)
            .filter(|monster| monster_record_is_active(monster))
            .cloned()
            .ok_or_else(|| SessionError::MonsterNotFound(monster_identity(0, native_id)))?;
        for set_id in [-1, 1] {
            upsert_monster_record(
                &mut self.snapshot,
                set_id,
                generated_monster_variant(&source, set_id),
            );
        }
        self.snapshot.normalize();
        Ok(vec![
            monster_identity(-1, native_id),
            monster_identity(1, native_id),
        ])
    }

    pub(super) fn apply_monster_library_template(
        &mut self,
        target_id: NativeRecordId,
        template: Box<MonsterRecord>,
        description: String,
        mode: MonsterLibraryCopyMode,
        replace: bool,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_library_template(target_id, &template, &description)?;
        self.validate_monster_library_destination(target_id, mode, replace)?;
        let normal = monster_for_target(*template, 0, target_id);
        let mut changed = Vec::new();
        match mode {
            MonsterLibraryCopyMode::Normal => {
                upsert_monster_record(&mut self.snapshot, 0, normal);
                changed.push(monster_identity(0, target_id));
            }
            MonsterLibraryCopyMode::ExactAllSets => {
                for set_id in [-1, 0, 1] {
                    upsert_monster_record(
                        &mut self.snapshot,
                        set_id,
                        monster_for_target(normal.clone(), set_id, target_id),
                    );
                    changed.push(monster_identity(set_id, target_id));
                }
            }
            MonsterLibraryCopyMode::GenerateVariants => {
                upsert_monster_record(&mut self.snapshot, 0, normal.clone());
                changed.push(monster_identity(0, target_id));
                for set_id in [-1, 1] {
                    upsert_monster_record(
                        &mut self.snapshot,
                        set_id,
                        generated_monster_variant(&normal, set_id),
                    );
                    changed.push(monster_identity(set_id, target_id));
                }
            }
        }
        let description = authored_monster_description(target_id, description);
        changed.push(description.identity.clone());
        upsert_monster_description(&mut self.snapshot, description);
        self.snapshot.normalize();
        Ok(changed)
    }

    fn validate_monster_library_destination(
        &self,
        target_id: NativeRecordId,
        mode: MonsterLibraryCopyMode,
        replace: bool,
    ) -> Result<(), SessionError> {
        let set_ids: &[i16] = match mode {
            MonsterLibraryCopyMode::Normal => &[0],
            MonsterLibraryCopyMode::ExactAllSets | MonsterLibraryCopyMode::GenerateVariants => {
                &[-1, 0, 1]
            }
        };
        if !replace
            && let Some(set_id) = set_ids.iter().find(|set_id| {
                monster_for_set(&self.snapshot, **set_id, target_id)
                    .is_some_and(monster_record_is_active)
            })
        {
            return Err(SessionError::InvalidMonster {
                identity: monster_identity(*set_id, target_id),
                reason: "the target slot already contains an active monster; explicit replacement is required".into(),
            });
        }
        Ok(())
    }

    pub(super) fn populate_monster_library_templates(
        &mut self,
        copies: Vec<MonsterLibraryScenarioCopy>,
    ) -> Result<Vec<StableId>, SessionError> {
        if copies.is_empty() {
            return Err(SessionError::InvalidMonster {
                identity: self.snapshot.project_id.clone(),
                reason: "Monster Library population requires at least one entry".into(),
            });
        }
        let mut target_ids = BTreeSet::new();
        for copy in &copies {
            if !target_ids.insert(copy.target_id) {
                return Err(SessionError::InvalidMonster {
                    identity: monster_identity(0, copy.target_id),
                    reason: "Monster Library population contains a duplicate target ID".into(),
                });
            }
        }
        let mut candidate = EditorSession::new(self.snapshot.clone());
        let mut changed = Vec::new();
        for copy in copies {
            // The outer command owns revision checks, validation and one history entry.
            // Staging each member must not build a private history of full snapshots.
            changed.extend(candidate.apply_domain_command(
                EditorCommand::ApplyMonsterLibraryTemplate {
                    target_id: copy.target_id,
                    template: copy.template,
                    description: copy.description,
                    mode: copy.mode,
                    replace: copy.replace,
                },
            )?);
        }
        self.snapshot = candidate.snapshot;
        Ok(changed)
    }

    pub(super) fn update_monster_description(
        &mut self,
        mut description: MonsterDescription,
    ) -> Result<Vec<StableId>, SessionError> {
        if description.text.chars().count() > 255 {
            return Err(SessionError::InvalidMonster {
                identity: description.identity.clone(),
                reason: "description exceeds the 255-byte Classic Str255 field".into(),
            });
        }
        let existing = self
            .snapshot
            .monster_descriptions
            .iter_mut()
            .find(|candidate| candidate.native_id == description.native_id)
            .ok_or(SessionError::MonsterDescriptionNotFound(
                description.native_id,
            ))?;
        if existing.identity != description.identity {
            return Err(SessionError::InvalidMonster {
                identity: description.identity,
                reason: "description identity cannot be changed".into(),
            });
        }
        description.authored = true;
        let identity = description.identity.clone();
        *existing = description;
        Ok(vec![identity])
    }

    pub(super) fn retarget_monster_reference(
        &mut self,
        source: StableId,
        field: String,
        target_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        let monster = self
            .snapshot
            .monster_sets
            .iter_mut()
            .flat_map(|set| set.monsters.iter_mut())
            .find(|monster| monster.identity == source)
            .ok_or_else(|| SessionError::MonsterNotFound(source.clone()))?;
        if field == "weapon" {
            monster.weapon = target_id;
        } else if field == "requiredWeapon" {
            monster.required_weapon =
                i8::try_from(target_id).map_err(|_| SessionError::InvalidMonsterReference {
                    source: source.clone(),
                    field: field.clone(),
                })?;
        } else if field == "icon" {
            monster.icon_id = target_id;
        } else if field == "deathMacro" {
            monster.death_macro = target_id;
        } else if let Some(index) = parse_indexed_field(&field, "items", monster.items.len()) {
            monster.items[index] = target_id;
        } else if let Some(index) = parse_indexed_field(&field, "spells", monster.spells.len()) {
            monster.spells[index] = target_id;
        } else {
            return Err(SessionError::InvalidMonsterReference { source, field });
        }
        monster.authored = true;
        Ok(vec![source])
    }
}

fn reject_certified_monster_tail(
    snapshot: &ProjectSnapshot,
    set_id: i16,
    native_id: NativeRecordId,
    identity: &StableId,
) -> Result<(), SessionError> {
    let Some(native_path) = monster_native_path(set_id) else {
        return Ok(());
    };
    let overlaps_tail = snapshot
        .classic_sources
        .iter()
        .find(|source| source.native_path == native_path)
        .and_then(|source| {
            certified_monster_source(&source.blob.0, source.byte_length as usize, native_path)
        })
        .is_some_and(|extent| native_id.0 as usize >= extent.authored_records);
    if overlaps_tail {
        return Err(SessionError::InvalidMonster {
            identity: identity.clone(),
            reason: "the target slot overlaps preserved compatibility payload".into(),
        });
    }
    Ok(())
}

fn validate_library_template(
    target_id: NativeRecordId,
    template: &MonsterRecord,
    description: &str,
) -> Result<(), SessionError> {
    let target_identity = monster_identity(0, target_id);
    validate_monster_native_id(target_id, &target_identity)?;
    validate_monster_record_shape(template).map_err(|error| SessionError::InvalidMonster {
        identity: target_identity.clone(),
        reason: format!("library template is invalid: {error}"),
    })?;
    if template.display_name.chars().count() > 40 {
        return Err(SessionError::InvalidMonster {
            identity: target_identity,
            reason: "library template name exceeds the 40-byte Classic field".into(),
        });
    }
    if description.chars().count() > 255 {
        return Err(SessionError::InvalidMonster {
            identity: monster_identity(0, target_id),
            reason: "library description exceeds the 255-byte Classic Str255 field".into(),
        });
    }
    Ok(())
}
