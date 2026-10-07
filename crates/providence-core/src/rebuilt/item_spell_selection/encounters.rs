use super::{
    RebuiltV3ComplexEncounter, RebuiltV3ReachableItemSpellError as Error, RebuiltV3RogueEncounter,
    RebuiltV3RuntimeDefinitionRelation as Relation, selection::Selection,
};
use crate::model::StableId;

pub(super) fn collect(
    complex: &[RebuiltV3ComplexEncounter],
    rogue: &[RebuiltV3RogueEncounter],
    selection: &mut Selection,
) -> Result<(), Error> {
    for encounter in complex {
        let source = StableId(format!("complex-encounter:{}", encounter.id));
        for (slot, classic_id) in encounter.item_ids.iter().copied().enumerate() {
            if classic_id != 0 {
                selection.item_gate(source.clone(), format!("itemIds[{slot}]"), classic_id)?;
            }
        }
        for (slot, classic_id) in encounter.spell_ids.iter().copied().enumerate() {
            if classic_id != 0 && !(1..7).contains(&classic_id) {
                selection.spell_gate(source.clone(), format!("spellIds[{slot}]"), classic_id)?;
            }
        }
    }
    for encounter in rogue {
        if encounter.spell_id != 0 {
            selection.spell(
                StableId(format!("rogue-encounter:{}", encounter.id)),
                "spellId".into(),
                encounter.spell_id,
                Relation::EncounterGate,
            )?;
        }
    }
    Ok(())
}
