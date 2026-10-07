use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::codecs::{
    NativeFileFamily, encode_scenario_item_rules, encode_scenario_item_text_resources,
};
use crate::model::ProjectSnapshot;

pub(super) fn compile(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    if !snapshot.scenario_item_rules.is_empty() {
        manifest.insert_generated(
            "Data NI",
            NativeFileFamily::ScenarioItemDefinitions,
            encode_scenario_item_rules(
                &snapshot.scenario_item_rules,
                sources.data_ni.unwrap_or_default(),
            )?,
        );
        if sources.data_ni_text.is_some()
            || snapshot.scenario_item_rules.iter().any(|rule| {
                !rule.definition.unidentified_name.is_empty()
                    || !rule.definition.name.is_empty()
                    || !rule.definition.description.is_empty()
            })
        {
            let text_source = sources.data_ni_text;
            if !text_source.is_some_and(|source| source.native_path == "Scenario.rsrc") {
                manifest.insert_generated(
                    text_source
                        .map(|source| source.native_path)
                        .unwrap_or("Data NI.rsrc"),
                    NativeFileFamily::ScenarioItemNames,
                    encode_scenario_item_text_resources(
                        &snapshot.scenario_item_rules,
                        text_source.map(|source| source.bytes),
                    )?,
                );
            }
        }
    }
    Ok(())
}
