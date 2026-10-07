//! Classic items.c plays a nonzero stored item sound after adding 600.

pub(crate) fn resource_id(stored: i32) -> Option<i32> {
    (stored != 0).then(|| stored.saturating_add(600).saturating_abs())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classic_item_sound_values_keep_their_runtime_offset_and_zero_sentinel() {
        // Castle 491816ad items.c:675-676; negative playback IDs resolve by magnitude.
        assert_eq!(resource_id(0), None);
        assert_eq!(resource_id(36), Some(636));
        assert_eq!(resource_id(47), Some(647));
        assert_eq!(resource_id(-185), Some(415));
        assert_eq!(resource_id(-1236), Some(636));
        assert_eq!(resource_id(32767), Some(33367));
    }
}
