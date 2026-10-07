use super::super::{EditorCommand, EditorSession, SessionError};
use crate::model::StableId;

impl EditorSession {
    pub(super) fn dispatch_monster_records(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::ImportClassicMonsterSlice {
                annex_blob,
                sources,
                monster_sets,
                monster_descriptions,
            } => self.import_classic_monster_slice(
                annex_blob,
                sources,
                monster_sets,
                monster_descriptions,
            )?,
            EditorCommand::UpdateMonster { set_id, monster } => {
                self.update_monster(set_id, monster)?
            }
            EditorCommand::ApplyMonsterDraft { draft } => self.apply_monster_draft(draft)?,
            EditorCommand::CommitMonsterOperation {
                operation,
                review_hash,
            } => self.commit_monster_operation(operation, review_hash)?,
            EditorCommand::CreateMonster { set_id, native_id } => {
                self.create_monster(set_id, native_id)?
            }
            EditorCommand::DuplicateMonster {
                set_id,
                source_id,
                target_id,
            } => self.duplicate_monster(set_id, source_id, target_id)?,
            EditorCommand::ClearMonster { set_id, native_id } => {
                self.clear_monster(set_id, native_id)?
            }
            EditorCommand::SwitchMonsterRecords {
                set_id,
                first_id,
                second_id,
            } => self.switch_monster_records(set_id, first_id, second_id)?,
            EditorCommand::UpdateMonsterDescription { description } => {
                self.update_monster_description(description)?
            }
            EditorCommand::RetargetMonsterReference {
                source,
                field,
                target_id,
            } => self.retarget_monster_reference(source, field, target_id)?,
            command => return self.dispatch_monster_templates(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_monster_templates(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::CopyMonsterToAllSets {
                source_set_id,
                native_id,
            } => self.copy_monster_to_all_sets(source_set_id, native_id)?,
            EditorCommand::GenerateMonsterVariants { native_id } => {
                self.generate_monster_variants(native_id)?
            }
            EditorCommand::ApplyMonsterLibraryTemplate {
                target_id,
                template,
                description,
                mode,
                replace,
            } => self.apply_monster_library_template(
                target_id,
                template,
                description,
                mode,
                replace,
            )?,
            EditorCommand::PopulateMonsterLibraryTemplates { copies } => {
                self.populate_monster_library_templates(copies)?
            }
            EditorCommand::CommitMonsterLibraryTransfer {
                copies,
                review_hash,
            } => self.commit_monster_library_transfer(copies, review_hash)?,
            command => return self.dispatch_battles(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_battles(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::ImportClassicBattleSlice {
                annex_blob,
                sources,
                battles,
            } => self.import_classic_battle_slice(annex_blob, sources, battles)?,
            EditorCommand::UpdateBattle { battle } => self.update_battle(battle)?,
            EditorCommand::CreateBattle {
                battle,
                copy_source,
            } => self.create_battle(battle, copy_source)?,
            EditorCommand::RewriteBattleMonsterReferences { rewrite } => {
                self.rewrite_battle_monster_references(rewrite)?
            }
            EditorCommand::RetargetBattleReference {
                source,
                field,
                target_id,
            } => self.retarget_battle_reference(source, field, target_id)?,
            command => return self.dispatch_economy(command),
        };
        Ok(changed)
    }

    pub(super) fn dispatch_economy(
        &mut self,
        command: EditorCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        let changed = match command {
            EditorCommand::ImportClassicTreasureSlice {
                annex_blob,
                sources,
                treasures,
            } => self.import_classic_treasure_slice(annex_blob, sources, treasures)?,
            EditorCommand::UpdateTreasure { treasure } => self.update_treasure(treasure)?,
            EditorCommand::CreateTreasure { native_id } => self.create_treasure(native_id)?,
            EditorCommand::ClearTreasure { native_id } => self.clear_treasure(native_id)?,
            EditorCommand::RetargetTreasureItem {
                source,
                slot,
                target_id,
            } => self.retarget_treasure_item(source, slot, target_id)?,
            EditorCommand::ImportClassicShopSlice {
                annex_blob,
                sources,
                shops,
            } => self.import_classic_shop_slice(annex_blob, sources, shops)?,
            EditorCommand::UpdateShop { shop } => self.update_shop(shop)?,
            EditorCommand::CreateShop { native_id } => self.create_shop(native_id)?,
            EditorCommand::ClearShop { native_id } => self.clear_shop(native_id)?,
            EditorCommand::RetargetShopItem {
                source,
                slot,
                target_id,
            } => self.retarget_shop_item(source, slot, target_id)?,
            EditorCommand::Undo | EditorCommand::Redo => unreachable!("handled before apply"),
            _ => unreachable!("each editing command belongs to a domain dispatcher"),
        };
        Ok(changed)
    }
}
