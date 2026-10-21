mod contracts;
pub(crate) use contracts::MAX_TYPED_SCENARIO_SPELL_RECORDS;
#[cfg(test)]
use contracts::MAX_TYPED_STANDARD_SPELL_RECORDS;
pub(crate) use identity::scenario_spell_physical_classic_id;
mod identity;
mod name_overlay;
mod names;
mod numeric;
mod string_list;

pub use contracts::{
    DecodedSpellFile, SCENARIO_SPELL_BYTES, SCENARIO_SPELL_CODEC, SCENARIO_SPELL_RECORDS,
    SPELL_NAME_RESOURCE_MAX_ID, SPELL_NAME_RESOURCE_MIN_ID, SPELL_NAMES_PER_RESOURCE,
    SPELL_RECORD_BYTES, SPELLS_PER_CLASS, STANDARD_SPELL_BYTES, STANDARD_SPELL_CLASSES,
    STANDARD_SPELL_CODEC, STANDARD_SPELL_RECORDS, SpellCodecError,
};
pub use identity::{
    default_scenario_spell_name, default_standard_spell_name, scenario_spell_classic_id,
    scenario_spell_is_runtime_addressable, standard_spell_classic_id,
};
pub use names::{
    encode_scenario_spell_name_resources, hydrate_scenario_spell_names,
    hydrate_standard_spell_names, validate_scenario_spell_name,
};
pub use numeric::{
    decode_scenario_spells, decode_standard_spells, encode_scenario_spells, encode_standard_spells,
    spell_has_empty_native_values,
};

#[cfg(test)]
mod authoring_tests;
#[cfg(test)]
mod tests;

#[cfg(test)]
mod physical_boundary_tests;
