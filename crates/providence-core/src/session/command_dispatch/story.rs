use super::super::{EditorCommand, EditorSession, SessionError};
use crate::model::StableId;

impl EditorSession {
    pub(super) fn dispatch_messages(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::UpdateMessageText { identity, text } => {
                self.update_message_text(identity, text)?
            }
            EditorCommand::AuthorStrings(edit) => match edit {
                crate::text_authoring::StringEdit::Draft { draft } => {
                    self.apply_string_draft(draft)?
                }
                crate::text_authoring::StringEdit::Import { changes } => {
                    self.apply_message_text_changes(changes)?
                }
            },
            EditorCommand::CreateMessage { native_id, text } => {
                self.create_message(native_id, text)?
            }
            EditorCommand::ImportClassicOptionLabelSlice {
                annex_blob,
                sources,
                option_labels,
            } => self.import_classic_option_label_slice(annex_blob, sources, option_labels)?,
            EditorCommand::UpdateOptionLabel { label } => self.update_option_label(label)?,
            EditorCommand::CreateOptionLabel => self.create_option_label()?,
            EditorCommand::DuplicateOptionLabel { source } => {
                self.duplicate_option_label(source)?
            }
            EditorCommand::UpsertQuestLabel { label } => self.upsert_quest_label(label)?,
            EditorCommand::DeleteQuestLabel { id } => self.delete_quest_label(id)?,
            command => return self.dispatch_scenario(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_scenario(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::ClassicRuleSelection(command) => {
                self.apply_classic_rule_selection(command)?
            }
            EditorCommand::ImportClassicScenarioBootstrap {
                annex_blob,
                sources,
                startup_native_path,
                campaign,
                start_location,
            } => self.import_classic_scenario_bootstrap(
                annex_blob,
                sources,
                startup_native_path,
                campaign,
                start_location,
            )?,
            EditorCommand::ApplyScenario { edit } => self.apply_scenario_edit(edit)?,
            EditorCommand::SetCampaignMetadata { metadata } => {
                self.set_campaign_metadata(metadata)?
            }
            EditorCommand::SetStartLocation { location } => self.set_start_location(location)?,
            EditorCommand::SetScenarioApplication { contract } => {
                self.set_scenario_application(contract)?
            }
            EditorCommand::SetGlobalMacroHook { hook, target } => {
                self.set_global_macro_hook(hook, target)?
            }
            command => return self.dispatch_action_references(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_action_references(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::RetargetMessageReference {
                source,
                field,
                target_native_id,
            } => self.retarget_message_reference(source, field, target_native_id)?,
            EditorCommand::RetargetActionReference {
                source,
                slot,
                target_native_id,
            } => self.retarget_action_reference(source, slot, target_native_id)?,
            EditorCommand::SetActionOpcode {
                source,
                slot,
                raw_opcode,
            } => self.set_action_opcode(source, slot, raw_opcode)?,
            command => return self.dispatch_actions(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_actions(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::UpdateExtraActionPoint { extra_action_point } => {
                self.update_extra_action_point(extra_action_point)?
            }
            EditorCommand::CreateExtraActionPoint { native_id } => {
                self.create_extra_action_point(native_id)?
            }
            EditorCommand::DuplicateExtraActionPoint { source, native_id } => {
                self.duplicate_extra_action_point(source, native_id)?
            }
            EditorCommand::DeleteExtraActionPoint { source } => {
                self.delete_extra_action_point(source)?
            }
            EditorCommand::UpdateActionPoint { action_point } => {
                self.update_action_point(*action_point)?
            }
            EditorCommand::CreateActionPoint { map, coordinate } => {
                self.create_action_point(map, coordinate)?
            }
            EditorCommand::DuplicateActionPoint { source, coordinate } => {
                self.duplicate_action_point(source, coordinate)?
            }
            EditorCommand::ClearActionPoint { source } => self.clear_action_point(source)?,
            command => return self.dispatch_action_steps(command),
        };
        Ok(changed)
    }

    fn dispatch_action_steps(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::ApplyActionPointDraft { draft } => {
                self.apply_action_point_draft(draft)?
            }
            EditorCommand::ApplyExtraActionPointDraft { draft } => {
                self.apply_extra_action_point_draft(draft)?
            }
            EditorCommand::ApplyActionPointStep { edit } => self.apply_action_point_step(edit)?,
            EditorCommand::MoveActionPointStep {
                source,
                from_slot,
                to_slot,
            } => self.move_action_point_step(source, from_slot, to_slot)?,
            EditorCommand::DuplicateActionPointStep {
                source,
                from_slot,
                to_slot,
            } => self.duplicate_action_point_step(source, from_slot, to_slot)?,
            EditorCommand::ClearActionPointStep { source, slot } => {
                self.clear_action_point_step(source, slot)?
            }
            EditorCommand::ApplyExtraActionPointStep { edit } => {
                self.apply_extra_action_point_step(edit)?
            }
            EditorCommand::MoveExtraActionPointStep {
                source,
                from_slot,
                to_slot,
            } => self.move_extra_action_point_step(source, from_slot, to_slot)?,
            EditorCommand::DuplicateExtraActionPointStep {
                source,
                from_slot,
                to_slot,
            } => self.duplicate_extra_action_point_step(source, from_slot, to_slot)?,
            EditorCommand::ClearExtraActionPointStep { source, slot } => {
                self.clear_extra_action_point_step(source, slot)?
            }
            command => return self.dispatch_simple_complex(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_simple_complex(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::RetargetSimpleEncounterPrompt {
                source,
                target_native_id,
            } => self.retarget_simple_encounter_prompt(source, target_native_id)?,
            EditorCommand::UpdateSimpleEncounter { encounter } => {
                self.update_simple_encounter(encounter)?
            }
            EditorCommand::ApplySimpleEncounterDraft { draft } => {
                self.apply_simple_encounter_draft(*draft)?
            }
            EditorCommand::CreateSimpleEncounter => self.create_simple_encounter(None)?,
            EditorCommand::CopySimpleEncounter { source } => {
                self.create_simple_encounter(Some(source))?
            }
            EditorCommand::ImportClassicComplexEncounterSlice {
                annex_blob,
                sources,
                complex_encounters,
            } => self.import_classic_complex_encounter_slice(
                annex_blob,
                sources,
                complex_encounters,
            )?,
            EditorCommand::UpdateComplexEncounter { encounter } => {
                self.update_complex_encounter(encounter)?
            }
            EditorCommand::ApplyComplexEncounterDraft { draft } => {
                self.apply_complex_encounter_draft(*draft)?
            }
            EditorCommand::CreateComplexEncounter => self.create_complex_encounter(None)?,
            EditorCommand::CopyComplexEncounter { source } => {
                self.create_complex_encounter(Some(source))?
            }
            EditorCommand::RetargetComplexEncounterReference {
                source,
                field,
                target_id,
            } => self.retarget_complex_encounter_reference(source, field, target_id)?,
            command => return self.dispatch_rogue_timed(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_rogue_timed(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::ImportClassicRogueEncounterSlice {
                annex_blob,
                sources,
                rogue_encounters,
            } => {
                self.import_classic_rogue_encounter_slice(annex_blob, sources, rogue_encounters)?
            }
            EditorCommand::UpdateRogueEncounter { encounter } => {
                self.update_rogue_encounter(encounter)?
            }
            EditorCommand::ApplyRogueEncounterDraft { encounter } => {
                self.apply_rogue_draft(encounter)?
            }
            EditorCommand::CreateRogueEncounter => self.create_rogue_encounter(None)?,
            EditorCommand::CopyRogueEncounter { source } => {
                self.create_rogue_encounter(Some(source))?
            }
            EditorCommand::RetargetRogueEncounterReference {
                source,
                field,
                target_id,
            } => self.retarget_rogue_encounter_reference(source, field, target_id)?,
            EditorCommand::ImportClassicTimedEncounterSlice {
                annex_blob,
                sources,
                timed_encounters,
            } => {
                self.import_classic_timed_encounter_slice(annex_blob, sources, timed_encounters)?
            }
            EditorCommand::UpdateTimedEncounter { encounter } => {
                self.update_timed_encounter(encounter)?
            }
            EditorCommand::ApplyTimedEncounterDraft { encounter } => {
                self.apply_timed_draft(encounter)?
            }
            EditorCommand::CreateTimedEncounter => self.create_timed_encounter(None)?,
            EditorCommand::CopyTimedEncounter { source } => {
                self.create_timed_encounter(Some(source))?
            }
            EditorCommand::RetargetTimedEncounterReference {
                source,
                field,
                target_id,
            } => self.retarget_timed_encounter_reference(source, field, target_id)?,
            command => return self.dispatch_map_cells(command),
        };
        Ok(changed)
    }
}
