use super::*;
use crate::discovery::DiscoveryIndex;

impl FlowGraph {
    pub fn new(index: &DiscoveryIndex, catalog: &FlowCatalog) -> Self {
        let mut graph = Self::default();
        for row in index.records.iter().chain(&catalog.records) {
            graph
                .records
                .entry((row.scope.clone(), row.identity.clone()))
                .or_insert_with(|| Record::from(row));
        }
        for link in &index.links {
            if link.target_kind == "quest-flag" && quest_edges::covered(index, link) {
                continue;
            }
            let owner = super::super::execution::caller_owner(index, link);
            let source = owner
                .map(|r| (r.scope.clone(), r.identity.clone()))
                .unwrap_or_else(|| ("scenario".into(), link.source.clone()));
            if !graph.records.contains_key(&source) {
                continue;
            }
            let mut link = link.clone();
            let target = graph.target(&mut link, catalog);
            graph.connect(source, target, link, FlowDetails::default());
        }
        quest_edges::append(index, &mut graph);
        graph.index();
        graph
    }

    fn index(&mut self) {
        self.connections.sort_by(|a, b| {
            (&a.link.occurrence, &a.source, &a.target).cmp(&(
                &b.link.occurrence,
                &b.source,
                &b.target,
            ))
        });
        self.connections.dedup_by(|a, b| {
            a.link.occurrence == b.link.occurrence && a.source == b.source && a.target == b.target
        });
        for (id, connection) in self.connections.iter().enumerate() {
            self.outgoing
                .entry(connection.source.clone())
                .or_default()
                .push(id);
            self.incoming
                .entry(connection.target.clone())
                .or_default()
                .push(id);
        }
    }

    pub(super) fn connect(
        &mut self,
        source: RecordKey,
        target: RecordKey,
        link: DiscoveryLink,
        details: FlowDetails,
    ) {
        self.connections.push(Connection {
            source,
            target,
            link,
            details,
        });
    }

    fn target(&mut self, link: &mut DiscoveryLink, catalog: &FlowCatalog) -> RecordKey {
        let mut reason = String::new();
        if link.resolution == ResolutionState::StockFallback
            && let Some(target) = catalog.targets.get(&link.occurrence)
        {
            link.target_identity = target.identity.clone();
            link.target_scope = Some(target.scope.clone());
            link.resolution = target.resolution.clone();
            reason = target.reason.clone();
        }
        if !link.contextual
            && matches!(
                link.resolution,
                ResolutionState::Resolved | ResolutionState::StockFallback
            )
            && let Some(identity) = &link.target_identity
        {
            let key = (
                link.target_scope.clone().unwrap_or_else(scenario_scope),
                identity.clone(),
            );
            if self.records.contains_key(&key) {
                return key;
            }
        }
        if link.target_kind == "monster"
            && link.target_identity.is_none()
            && link.resolution == ResolutionState::Resolved
        {
            return self.monster_group(link);
        }
        self.unresolved(link, reason)
    }

    pub(super) fn unresolved(&mut self, link: &DiscoveryLink, mut reason: String) -> RecordKey {
        if reason.is_empty() {
            reason = if link.contextual { "The executing context supplies this destination." }
                else if link.resolution == ResolutionState::Ambiguous { "Resolve ambiguous ownership before opening this target." }
                else { "This exact target is unavailable. Open its owning field to inspect or repair the reference." }.into();
        }
        let identity = format!(
            "unresolved:{}",
            serde_json::to_string(&(
                &link.target_kind,
                &link.target_id,
                &link.resolution,
                link.contextual.then_some(&link.source)
            ))
            .unwrap()
        );
        let selection = FlowSelection::record(
            identity,
            link.target_scope.clone().unwrap_or_else(scenario_scope),
        );
        let key = selection.key();
        self.records.entry(key.clone()).or_insert_with(|| Record {
            selection,
            kind: link.target_kind.clone(),
            native_id: link.target_id.clone(),
            label: bounded(&link.target_label, 180),
            resolution: link.resolution.clone(),
            reason,
            contextual: link.contextual,
            navigable: false,
        });
        key
    }

    fn monster_group(&mut self, link: &DiscoveryLink) -> RecordKey {
        let selection =
            FlowSelection::record(format!("runtime-monster:{}", link.target_id), "scenario");
        let key = selection.key();
        if self.records.contains_key(&key) {
            return key;
        }
        let variants: Vec<_> = self
            .records
            .iter()
            .filter(|(_, r)| {
                r.kind == "monster"
                    && r.native_id == link.target_id
                    && r.selection.scope == "scenario"
            })
            .map(|(key, record)| (key.clone(), record.label.clone()))
            .collect();
        self.records.insert(
            key.clone(),
            Record {
                selection,
                kind: "runtime-monster".into(),
                native_id: link.target_id.clone(),
                label: format!("Monster {} · runtime difficulty", link.target_id),
                resolution: ResolutionState::Resolved,
                reason: "Choose an explicit difficulty variant.".into(),
                contextual: true,
                navigable: false,
            },
        );
        for (target, label) in variants {
            let mut variant = link.clone();
            variant.occurrence = format!("{}|difficulty|{}", key.1, target.1);
            variant.source = key.1.clone();
            variant.source_label = format!("Monster {} · runtime difficulty", link.target_id);
            variant.field = "difficultyVariant".into();
            variant.target_identity = Some(target.1.clone());
            variant.target_label = label;
            variant.meaning = "Runtime difficulty variant".into();
            self.connect(key.clone(), target, variant, FlowDetails::default());
        }
        key
    }

    pub(super) fn node(&self, selection: &FlowSelection, depth: i16) -> Option<FlowNode> {
        let record = self.records.get(&selection.key())?;
        Some(FlowNode {
            id: selection.node_id(),
            selection: selection.clone(),
            kind: record.kind.clone(),
            native_id: record.native_id.clone(),
            author_id: crate::rule_presentation::identity_author_number(&selection.identity)
                .map(u32::from),
            label: record.label.clone(),
            resolution: record.resolution.clone(),
            availability_reason: record.reason.clone(),
            contextual: record.contextual,
            navigable: record.navigable,
            depth,
        })
    }
}

impl From<&DiscoveryRecord> for Record {
    fn from(row: &DiscoveryRecord) -> Self {
        Self {
            selection: FlowSelection::record(&row.identity, &row.scope),
            kind: row.kind.clone(),
            native_id: row.native_id.clone(),
            label: bounded(&row.name, 180),
            resolution: ResolutionState::Resolved,
            reason: String::new(),
            contextual: false,
            navigable: true,
        }
    }
}

pub(super) fn bounded(value: &str, limit: usize) -> String {
    let mut result: String = value.chars().take(limit).collect();
    if value.chars().count() > limit {
        result.push('…');
    }
    result
}
