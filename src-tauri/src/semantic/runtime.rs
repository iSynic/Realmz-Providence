use super::opcodes::{action_semantics, normalize_opcode, ReferenceCounts};
use crate::project::*;
use crate::realmz::ParsedScenario;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

#[derive(Debug, Clone, Default)]
pub(crate) struct RuntimeReachability {
    pub battles: BTreeSet<usize>,
    pub simple_encounters: BTreeSet<usize>,
    pub complex_encounters: BTreeSet<usize>,
    pub macros: BTreeSet<usize>,
    pub monsters: BTreeSet<usize>,
    evidence: BTreeMap<String, Vec<String>>,
}

impl RuntimeReachability {
    pub(crate) fn evidence_for(&self, kind: &str, id: usize) -> Vec<String> {
        self.evidence
            .get(&format!("{kind}:{id}"))
            .cloned()
            .unwrap_or_default()
    }

    pub(crate) fn evidence(&self) -> &BTreeMap<String, Vec<String>> {
        &self.evidence
    }
}

struct RuntimeContent<'a> {
    scenario: &'a ScenarioMeta,
    maps: &'a [MapEntity],
    triggers: &'a [TriggerRecord],
    random_levels: &'a [RandomLevel],
    extracodes: &'a [ExtraCodeRow],
    battles: &'a [BattleRecord],
    monsters: &'a [MonsterRecord],
    scenario_items: &'a [ScenarioItemRecord],
    simple_encounters: &'a [SimpleEncounterRecord],
    complex_encounters: &'a [ComplexEncounterRecord],
    timed_encounters: &'a [TimedEncounterRecord],
}

impl<'a> RuntimeContent<'a> {
    fn from_parsed(scenario: &'a ScenarioMeta, parsed: &'a ParsedScenario) -> Self {
        Self {
            scenario,
            maps: &parsed.maps,
            triggers: &parsed.triggers,
            random_levels: &parsed.random_levels,
            extracodes: &parsed.extracodes,
            battles: &parsed.battles,
            monsters: &parsed.monsters,
            scenario_items: &parsed.scenario_items,
            simple_encounters: &parsed.simple_encounters,
            complex_encounters: &parsed.complex_encounters,
            timed_encounters: &parsed.timed_encounters,
        }
    }

    fn from_project(project: &'a ProvidenceProject) -> Self {
        Self {
            scenario: &project.scenario,
            maps: &project.maps,
            triggers: &project.triggers,
            random_levels: &project.random_levels,
            extracodes: &project.extracodes,
            battles: &project.battles,
            monsters: &project.monsters,
            scenario_items: &project.scenario_items,
            simple_encounters: &project.simple_encounters,
            complex_encounters: &project.complex_encounters,
            timed_encounters: &project.timed_encounters,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RuntimeNode {
    Battle(usize),
    SimpleEncounter(usize),
    ComplexEncounter(usize),
    Macro(usize),
    Monster(usize),
}

pub(super) fn classify_runtime_reachability(
    scenario: &ScenarioMeta,
    parsed: &ParsedScenario,
) -> RuntimeReachability {
    classify(RuntimeContent::from_parsed(scenario, parsed))
}

pub(crate) fn classify_project_runtime_reachability(
    project: &ProvidenceProject,
) -> RuntimeReachability {
    classify(RuntimeContent::from_project(project))
}

fn classify(content: RuntimeContent<'_>) -> RuntimeReachability {
    let mut traversal = RuntimeTraversal::new(content);
    traversal.add_roots();
    traversal.run();
    traversal.reachability
}

struct RuntimeTraversal<'a> {
    content: RuntimeContent<'a>,
    extra_rows: BTreeMap<usize, [i16; 5]>,
    macro_records: BTreeMap<usize, &'a TriggerRecord>,
    battles: BTreeMap<usize, &'a BattleRecord>,
    monsters: BTreeMap<usize, &'a MonsterRecord>,
    simple_encounters: BTreeMap<usize, &'a SimpleEncounterRecord>,
    complex_encounters: BTreeMap<usize, &'a ComplexEncounterRecord>,
    counts: ReferenceCounts,
    valid_maps: BTreeSet<(LevelType, usize)>,
    reachability: RuntimeReachability,
    queue: VecDeque<RuntimeNode>,
}

impl<'a> RuntimeTraversal<'a> {
    fn new(content: RuntimeContent<'a>) -> Self {
        let extra_rows = content
            .extracodes
            .iter()
            .map(|row| (row.id, row.values))
            .collect();
        let macro_records = content
            .triggers
            .iter()
            .filter(|trigger| trigger.source == "Data ED3" && trigger.active)
            .map(|trigger| (trigger.record_index, trigger))
            .collect();
        let battles = content
            .battles
            .iter()
            .map(|record| (record.id, record))
            .collect();
        let monsters = content
            .monsters
            .iter()
            .map(|record| (record.id, record))
            .collect();
        let simple_encounters = content
            .simple_encounters
            .iter()
            .map(|record| (record.id, record))
            .collect();
        let complex_encounters = content
            .complex_encounters
            .iter()
            .map(|record| (record.id, record))
            .collect();
        let counts = ReferenceCounts {
            simple: record_capacity(content.simple_encounters.iter().map(|record| record.id)),
            complex: record_capacity(content.complex_encounters.iter().map(|record| record.id)),
            battle: record_capacity(content.battles.iter().map(|record| record.id)),
            monster: record_capacity(content.monsters.iter().map(|record| record.id)),
            ..ReferenceCounts::default()
        };
        let valid_maps = content
            .maps
            .iter()
            .map(|map| (map.level_type, map.index))
            .collect();
        Self {
            content,
            extra_rows,
            macro_records,
            battles,
            monsters,
            simple_encounters,
            complex_encounters,
            counts,
            valid_maps,
            reachability: RuntimeReachability::default(),
            queue: VecDeque::new(),
        }
    }

    fn add_roots(&mut self) {
        for trigger in self
            .content
            .triggers
            .iter()
            .filter(|trigger| trigger.source != "Data ED3" && trigger.active)
        {
            if let (Some(level_type), Some(level_index)) = (trigger.level_type, trigger.level_index)
            {
                if !self.valid_maps.contains(&(level_type, level_index)) {
                    continue;
                }
            }
            self.follow_actions(&trigger.actions, trigger, &trigger.id);
        }

        let random_roots = self
            .content
            .random_levels
            .iter()
            .filter(|level| {
                self.valid_maps
                    .contains(&(level.level_type, level.level_index))
            })
            .flat_map(|level| {
                level.rects.iter().map(|rect| {
                    (
                        format!("{}:random-rect:{}", level.id, rect.rect_index),
                        rect.battle_range,
                        rect.random_doors,
                    )
                })
            })
            .collect::<Vec<_>>();
        for (evidence, battle_range, random_doors) in random_roots {
            self.add_battle_range(battle_range, &evidence);
            for door in random_doors {
                if door > 0 {
                    self.mark(RuntimeNode::Macro(door as usize), &evidence);
                }
            }
        }

        let mut timed = self.content.timed_encounters.iter().collect::<Vec<_>>();
        timed.sort_by_key(|record| record.id);
        for encounter in timed.into_iter().take(151) {
            if encounter.day == 0 {
                break;
            }
            if encounter.door > 0 {
                self.mark(
                    RuntimeNode::Macro(encounter.door as usize),
                    &format!("Data TD3:{}", encounter.id),
                );
            }
        }

        if let Some(global_hooks) = &self.content.scenario.global_macro_hooks {
            for hook in &global_hooks.slots {
                if hook.source_backed && hook.door > 0 {
                    self.mark(
                        RuntimeNode::Macro(hook.door as usize),
                        &format!("Global:slot:{}", hook.slot),
                    );
                }
            }
        }

        // Door items can be activated from inventory UI, so their macro targets
        // are runtime roots even when no action point explicitly names the item.
        for item in self.content.scenario_items {
            if (item.item_type.abs() == 23 || item.special1 == -23) && item.special5 >= 0 {
                self.mark(
                    RuntimeNode::Macro(item.special5 as usize),
                    &format!("Data NI:{}", item.id),
                );
            }
        }
    }

    fn run(&mut self) {
        while let Some(node) = self.queue.pop_front() {
            match node {
                RuntimeNode::Macro(id) => {
                    if let Some(trigger) = self.macro_records.get(&id).copied() {
                        self.follow_actions(&trigger.actions, trigger, &format!("Data ED3:{id}"));
                    }
                }
                RuntimeNode::SimpleEncounter(id) => {
                    if let Some(encounter) = self.simple_encounters.get(&id).copied() {
                        let trigger = encounter_trigger(
                            "Data ED",
                            encounter.id,
                            encounter.provenance.clone(),
                        );
                        let actions = encounter_actions(&encounter.actions);
                        self.follow_actions(&actions, &trigger, &format!("Data ED:{id}"));
                    }
                }
                RuntimeNode::ComplexEncounter(id) => {
                    if let Some(encounter) = self.complex_encounters.get(&id).copied() {
                        let trigger = encounter_trigger(
                            "Data ED2",
                            encounter.id,
                            encounter.provenance.clone(),
                        );
                        let actions = encounter_actions(&encounter.actions);
                        self.follow_actions(&actions, &trigger, &format!("Data ED2:{id}"));
                    }
                }
                RuntimeNode::Battle(id) => {
                    if let Some(battle) = self.battles.get(&id).copied() {
                        for monster in &battle.grid {
                            if *monster != 0 {
                                self.mark(
                                    RuntimeNode::Monster(monster.unsigned_abs() as usize),
                                    &format!("Data BD:{id}"),
                                );
                            }
                        }
                        if battle.battle_macro < 0 {
                            self.mark(
                                RuntimeNode::Macro(battle.battle_macro.unsigned_abs() as usize),
                                &format!("Data BD:{id}:battleMacro"),
                            );
                        }
                    }
                }
                RuntimeNode::Monster(id) => {
                    if let Some(monster) = self.monsters.get(&id).copied() {
                        if monster.death_macro > 0 {
                            self.mark(
                                RuntimeNode::Macro(monster.death_macro as usize),
                                &format!("Data MD:{id}:deathMacro"),
                            );
                        }
                    }
                }
            }
        }
    }

    fn follow_actions(&mut self, actions: &[Action], trigger: &TriggerRecord, source: &str) {
        for action in actions {
            let semantics = action_semantics(action, trigger, &self.extra_rows, self.counts);
            let evidence = format!("{source}:slot:{}", action.slot);
            for target in semantics.targets {
                if target.kind == "battle" && target.role == "starts_battle" {
                    if let Some(values) = target.edcd_values {
                        self.add_battle_range([values[0], values[1]], &evidence);
                    } else if let Some(id) = target_id(&target.id, "battle:") {
                        self.mark(RuntimeNode::Battle(id), &evidence);
                    }
                    continue;
                }
                if target.role == "starts_encounter" {
                    if let Some(id) = target_id(&target.id, "encounter:simple:") {
                        self.mark(RuntimeNode::SimpleEncounter(id), &evidence);
                    } else if let Some(id) = target_id(&target.id, "encounter:complex:") {
                        self.mark(RuntimeNode::ComplexEncounter(id), &evidence);
                    }
                    continue;
                }
                if let Some(id) = target_id(&target.id, "macro:") {
                    self.mark(RuntimeNode::Macro(id), &evidence);
                } else if let Some(id) = target_id(&target.id, "monster:") {
                    self.mark(RuntimeNode::Monster(id), &evidence);
                }
            }
        }
    }

    fn add_battle_range(&mut self, range: [i16; 2], evidence: &str) {
        if range[0] == 0 {
            return;
        }
        let low = range[0].unsigned_abs() as usize;
        let high = range[1].unsigned_abs() as usize;
        let first = low.min(high);
        let last = low.max(high);
        for id in first..=last.min(self.counts.battle.saturating_sub(1)) {
            self.mark(RuntimeNode::Battle(id), evidence);
        }
    }

    fn mark(&mut self, node: RuntimeNode, evidence: &str) {
        let (inserted, key) = match node {
            RuntimeNode::Battle(id) => {
                (self.reachability.battles.insert(id), format!("battle:{id}"))
            }
            RuntimeNode::SimpleEncounter(id) => (
                self.reachability.simple_encounters.insert(id),
                format!("encounter:simple:{id}"),
            ),
            RuntimeNode::ComplexEncounter(id) => (
                self.reachability.complex_encounters.insert(id),
                format!("encounter:complex:{id}"),
            ),
            RuntimeNode::Macro(id) => (self.reachability.macros.insert(id), format!("macro:{id}")),
            RuntimeNode::Monster(id) => (
                self.reachability.monsters.insert(id),
                format!("monster:{id}"),
            ),
        };
        let entries = self.reachability.evidence.entry(key).or_default();
        if !entries.iter().any(|entry| entry == evidence) {
            entries.push(evidence.to_string());
        }
        if inserted {
            self.queue.push_back(node);
        }
    }
}

fn encounter_actions(rows: &[EncounterActionRow]) -> Vec<Action> {
    rows.iter()
        .map(|row| Action {
            slot: row.slot,
            raw_code: row.raw_code,
            code: normalize_opcode(row.raw_code),
            id: row.id,
            label: String::new(),
            category: ActionCategory::Unknown,
            gosub: row.raw_code < 0,
            media_required_for_progression: row.media_required_for_progression,
        })
        .collect()
}

fn encounter_trigger(source: &str, record_index: usize, provenance: Provenance) -> TriggerRecord {
    TriggerRecord {
        id: format!("{source}:{record_index}"),
        source: source.to_string(),
        level_type: None,
        level_index: None,
        record_index,
        active: true,
        doorid: 0,
        landid: 0,
        target_x: 0,
        target_y: 0,
        percent: 100,
        coordinate: None,
        actions: Vec::new(),
        provenance,
    }
}

fn target_id(value: &str, prefix: &str) -> Option<usize> {
    value.strip_prefix(prefix)?.parse().ok()
}

fn record_capacity(ids: impl Iterator<Item = usize>) -> usize {
    ids.max().map_or(0, |id| id.saturating_add(1))
}
