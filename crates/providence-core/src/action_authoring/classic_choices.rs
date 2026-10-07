//! Names for fixed Classic enums consumed directly by action settings.

pub(super) fn difficulty_levels() -> &'static [(i16, &'static str)] {
    &[
        (1, "Novice"),
        (2, "Easy"),
        (3, "Normal"),
        (4, "Hard"),
        (5, "Veteran"),
    ]
}

pub(super) fn party_conditions() -> &'static [(i16, &'static str)] {
    &[
        (0, "Torch lit"),
        (1, "Waterworld"),
        (2, "Dragon hide"),
        (3, "Discover secret"),
        (4, "Wizard eye"),
        (5, "Search"),
        (6, "Free fall / levitate"),
        (7, "Sentry"),
        (8, "Charm resistance"),
    ]
}

pub(super) fn character_conditions() -> &'static [(i16, &'static str)] {
    &[
        (0, "Runs away"),
        (1, "Helpless"),
        (2, "Tangled"),
        (3, "Cursed"),
        (4, "Magic aura"),
        (5, "Stupid"),
        (6, "Slow"),
        (7, "Shield from hits"),
        (8, "Shield from projectiles"),
        (9, "Poisoned"),
        (10, "Regenerating"),
        (11, "Fire protection"),
        (12, "Cold protection"),
        (13, "Electrical protection"),
        (14, "Chemical protection"),
        (15, "Mental protection"),
        (16, "1st-level spell protection"),
        (17, "2nd-level spell protection"),
        (18, "3rd-level spell protection"),
        (19, "4th-level spell protection"),
        (20, "5th-level spell protection"),
        (21, "Strong"),
        (22, "Protection from evil"),
        (23, "Speedy"),
        (24, "Invisible"),
        (25, "Animated"),
        (26, "Turned to stone"),
        (27, "Blind"),
        (28, "Diseased"),
        (29, "Confused"),
        (30, "Reflecting spells"),
        (31, "Reflecting attacks"),
        (32, "Attack bonus"),
        (33, "Absorbing energy"),
        (34, "Energy drain"),
        (35, "Absorbing energy from attacks"),
        (36, "Hindered attacks"),
        (37, "Hindered defense"),
        (38, "Defense bonus"),
        (39, "Silenced"),
    ]
}

pub(super) fn picked_branch_conditions() -> &'static [(i16, &'static str)] {
    &[
        (0, "Any character is picked"),
        (1, "Party position 1 (top) is picked"),
        (2, "Party position 2 is picked"),
        (3, "Party position 3 is picked"),
        (4, "Party position 4 is picked"),
        (5, "Party position 5 is picked"),
        (6, "Party position 6 (bottom) is picked"),
        (-1, "At least 1 character is picked"),
        (-2, "At least 2 characters are picked"),
        (-3, "At least 3 characters are picked"),
        (-4, "At least 4 characters are picked"),
        (-5, "At least 5 characters are picked"),
        (-6, "All 6 characters are picked"),
    ]
}

pub(super) fn condition_subjects() -> &'static [(i16, &'static str)] {
    &[
        (0, "Whole party"),
        (-1, "Currently picked characters"),
        (1, "Party position 1 (top)"),
        (2, "Party position 2"),
        (3, "Party position 3"),
        (4, "Party position 4"),
        (5, "Party position 5"),
        (6, "Party position 6 (bottom)"),
    ]
}
