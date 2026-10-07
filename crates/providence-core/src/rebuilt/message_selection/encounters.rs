use super::{
    RebuiltV3ComplexEncounter, RebuiltV3ReachableCombatSelection, RebuiltV3RogueEncounter,
    RebuiltV3RuntimeMessageReference, RebuiltV3SimpleEncounter, references::add_reference,
};
use crate::model::StableId;
use std::collections::BTreeSet;

pub(super) fn collect_prompts(
    simple_encounters: &[RebuiltV3SimpleEncounter],
    complex_encounters: &[RebuiltV3ComplexEncounter],
    references: &mut BTreeSet<RebuiltV3RuntimeMessageReference>,
) {
    for encounter in simple_encounters {
        add_reference(
            references,
            &StableId(format!("simple-encounter:{}", encounter.id)),
            None,
            "promptMessageNativeId".into(),
            encounter.prompt_message_id,
            false,
        );
    }
    for encounter in complex_encounters {
        add_reference(
            references,
            &StableId(format!("complex-encounter:{}", encounter.id)),
            None,
            "promptMessageNativeId".into(),
            encounter.prompt_message_id,
            false,
        );
    }
}

pub(super) fn collect_rogues(
    rogue_encounters: &[RebuiltV3RogueEncounter],
    references: &mut BTreeSet<RebuiltV3RuntimeMessageReference>,
) {
    for encounter in rogue_encounters {
        let source = StableId(format!("rogue-encounter:{}", encounter.id));
        for (field, values) in [
            ("successText", &encounter.success_text),
            ("failureText", &encounter.failure_text),
        ] {
            for (index, raw_id) in values.iter().copied().enumerate() {
                add_reference(
                    references,
                    &source,
                    None,
                    format!("{field}[{index}]"),
                    raw_id,
                    true,
                );
            }
        }
        add_reference(
            references,
            &source,
            None,
            "prompts[0]".into(),
            encounter.prompts[0],
            true,
        );
    }
}

pub(super) fn collect_battles(
    combat: &RebuiltV3ReachableCombatSelection,
    references: &mut BTreeSet<RebuiltV3RuntimeMessageReference>,
) {
    for battle in &combat.battles {
        let source = StableId(format!("battle:{}", battle.classic_id));
        add_reference(
            references,
            &source,
            None,
            "messageBefore".into(),
            battle.message_before_id,
            true,
        );
        add_reference(
            references,
            &source,
            None,
            "messageAfter".into(),
            battle.message_after_id,
            true,
        );
    }
}
