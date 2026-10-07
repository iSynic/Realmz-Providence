use super::super::{EditorCommand, EditorSession, SessionError};
use crate::model::StableId;

use super::super::reference_targets::asset_reference_identity;
use super::super::{action_settings_commands, extra_code_commands};

impl EditorSession {
    pub(super) fn dispatch_media(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::RepairImportedContent(command) => {
                crate::import_repair::apply(&mut self.snapshot, command)
                    .map_err(SessionError::InvalidClassicImport)?
            }
            EditorCommand::ImportClassicMediaCatalog {
                annex_blob,
                source,
                assets,
            } => self.import_classic_media_catalog(annex_blob, source, assets)?,
            EditorCommand::UpsertAsset { asset } => self.apply_asset_upsert(*asset)?,
            EditorCommand::UpsertTextResourcePair { text, style } => {
                self.upsert_text_resource_pair(*text, *style)?
            }
            EditorCommand::RemoveAsset { identity } => self.apply_asset_removal(identity)?,
            EditorCommand::UpsertMonsterAppearancePair { base, facing } => {
                self.upsert_monster_appearance_pair(base, facing)?
            }
            EditorCommand::RemoveMonsterAppearancePair { icon_id } => {
                self.remove_monster_appearance_pair(icon_id)?
            }
            command => return self.dispatch_extra_codes(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_extra_codes(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::UpsertExtraCode { row } => {
                extra_code_commands::upsert(&mut self.snapshot, row)
            }
            EditorCommand::ApplyActionSettings { edit } => {
                action_settings_commands::apply(&mut self.snapshot, edit)?
            }
            EditorCommand::RetargetExtraCodeValue {
                source,
                index,
                target_id,
            } => extra_code_commands::retarget_value(&mut self.snapshot, source, index, target_id)?,
            EditorCommand::RetargetExtraCodeBattleRange {
                source,
                low_id,
                high_id,
            } => extra_code_commands::retarget_battle_range(
                &mut self.snapshot,
                source,
                low_id,
                high_id,
            )?,
            EditorCommand::RetargetExtraCodeBranch {
                source,
                layout,
                mode,
                target_id,
            } => extra_code_commands::retarget_branch(
                &mut self.snapshot,
                source,
                layout,
                mode,
                target_id,
            )?,
            command => return self.dispatch_rules_items(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_rules_items(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::UpsertRaceRule { rule } => self.upsert_race_rule(rule)?,
            EditorCommand::ApplyRuleRecordDraft(commit) => {
                self.apply_rule_record_commit(*commit)?
            }
            EditorCommand::ReplaceRaceRules { rules } => self.replace_race_rules(rules)?,
            EditorCommand::UpsertCasteRule { rule } => self.upsert_caste_rule(rule)?,
            EditorCommand::ReplaceCasteRules { rules } => self.replace_caste_rules(rules)?,
            EditorCommand::SetRuleNameCatalog { catalog } => self.set_rule_name_catalog(catalog)?,
            EditorCommand::ReplaceItemRules { rules } => self.replace_item_rules(rules)?,
            EditorCommand::ReplaceScenarioItemRules { rules } => {
                self.replace_scenario_item_rules(rules)?
            }
            EditorCommand::ApplyScenarioItemArtwork {
                record_index,
                asset,
            } => {
                let reference = asset_reference_identity(&asset);
                let mut changed =
                    crate::item_artwork::apply(&mut self.snapshot, record_index, *asset)?;
                changed.extend(reference);
                changed.sort();
                changed.dedup();
                changed
            }
            EditorCommand::UpdateScenarioItem {
                record_index,
                definition,
            } => self.update_scenario_item(record_index, definition)?,
            EditorCommand::ApplyScenarioItemDraft {
                draft,
                binary_blob,
                text_blob,
            } => self.apply_item_draft(*draft, binary_blob, text_blob)?,
            command => return self.dispatch_spells(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_spells(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::ImportStandardSpellCatalog { sources, spells } => {
                self.import_standard_spell_catalog(sources, spells)?
            }
            EditorCommand::ImportClassicSpellSlice {
                annex_blob,
                sources,
                spells,
            } => self.import_classic_spell_slice(annex_blob, sources, spells)?,
            EditorCommand::UpdateScenarioSpell {
                record_index,
                definition,
            } => self.update_scenario_spell(record_index, *definition)?,
            EditorCommand::ApplyScenarioSpellDraft { draft } => self.apply_spell_draft(*draft)?,
            command => return self.dispatch_monster_records(command),
        };
        Ok(changed)
    }
}
