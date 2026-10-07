use serde::{Deserialize, Serialize};

use super::StableId;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GlobalMacroHook {
    Start,
    Death,
    Quit,
    Shop,
    Temple,
}

impl GlobalMacroHook {
    pub const ALL: [Self; 5] = [
        Self::Start,
        Self::Death,
        Self::Quit,
        Self::Shop,
        Self::Temple,
    ];

    pub const fn slot(self) -> u8 {
        match self {
            Self::Start => 0,
            Self::Death => 1,
            Self::Quit => 2,
            Self::Shop => 4,
            Self::Temple => 5,
        }
    }

    pub const fn label(self) -> &'static str {
        match self {
            Self::Start => "Start",
            Self::Death => "Death",
            Self::Quit => "Quit",
            Self::Shop => "Shop",
            Self::Temple => "Temple",
        }
    }

    pub const fn runtime_consumer(self) -> &'static str {
        match self {
            Self::Start => "new-adventure start",
            Self::Death => "party-loss death/revive path",
            Self::Quit => "end current adventure",
            Self::Shop => "Shop button before entry",
            Self::Temple => "Temple button before entry",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioApplicationHooks {
    pub start_game: Option<StableId>,
    pub party_death: Option<StableId>,
    pub end_adventure: Option<StableId>,
    pub shop: Option<StableId>,
    pub temple: Option<StableId>,
}

impl ScenarioApplicationHooks {
    pub fn get(&self, hook: GlobalMacroHook) -> &Option<StableId> {
        match hook {
            GlobalMacroHook::Start => &self.start_game,
            GlobalMacroHook::Death => &self.party_death,
            GlobalMacroHook::Quit => &self.end_adventure,
            GlobalMacroHook::Shop => &self.shop,
            GlobalMacroHook::Temple => &self.temple,
        }
    }

    pub fn set(&mut self, hook: GlobalMacroHook, target: Option<StableId>) {
        match hook {
            GlobalMacroHook::Start => self.start_game = target,
            GlobalMacroHook::Death => self.party_death = target,
            GlobalMacroHook::Quit => self.end_adventure = target,
            GlobalMacroHook::Shop => self.shop = target,
            GlobalMacroHook::Temple => self.temple = target,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioApplicationContract {
    pub hooks: ScenarioApplicationHooks,
}
