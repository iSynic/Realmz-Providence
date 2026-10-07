pub(crate) fn signed_range_values(low: i16, high: i16) -> Vec<i16> {
    let width = high.wrapping_sub(low).wrapping_add(1);
    let low = i32::from(low);
    let [start, end] = match width.cmp(&0) {
        std::cmp::Ordering::Greater => [low, low + i32::from(width) - 1],
        std::cmp::Ordering::Equal => [low, low],
        std::cmp::Ordering::Less => [low + i32::from(width) + 1, low],
    };
    (start..=end).map(|value| value as i16).collect()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;

    #[test]
    fn range_values_match_every_random_sample_at_signed_boundaries() {
        let bounds = [
            i16::MIN,
            i16::MIN + 1,
            -3,
            -1,
            0,
            1,
            3,
            i16::MAX - 1,
            i16::MAX,
        ];
        for low in bounds {
            for high in bounds {
                let width = i32::from(high.wrapping_sub(low).wrapping_add(1));
                // Castle Random excludes -32768; Rand takes the magnitude of its result.
                let expected: BTreeSet<_> = (0..32768)
                    .map(|raw| (i32::from(low) + raw * width / 32768) as i16)
                    .collect();
                let values = signed_range_values(low, high);
                assert_eq!(values.len(), expected.len(), "range {low}..{high}");
                assert_eq!(values.into_iter().collect::<BTreeSet<_>>(), expected);
            }
        }
    }
}
