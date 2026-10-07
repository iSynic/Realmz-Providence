use super::{MAX_STYLE_RUNS, StylePatch, StyleRun, StyleTable, font_name};
use std::collections::BTreeMap;

impl StyleTable {
    pub(super) fn format(
        &mut self,
        start: usize,
        end: usize,
        patch: &StylePatch,
        length: usize,
    ) -> Result<(), String> {
        if start >= end || end > length {
            return Err(
                "Select a nonempty range within this text before applying formatting.".into(),
            );
        }
        if patch.size.is_some_and(|size| !(1..=255).contains(&size)) {
            return Err("Choose a font size from 1 to 255.".into());
        }
        self.ensure_base();
        let mut active = self.active_at(start);
        active.start = start as u32;
        let mut end_active = self.active_at(end);
        end_active.start = end as u32;
        if !self.runs.iter().any(|run| run.start as usize == start) {
            self.runs.push(active);
        }
        if end < length && !self.runs.iter().any(|run| run.start as usize == end) {
            self.runs.push(end_active);
        }
        self.runs.sort_by_key(|run| run.start);
        if self.runs.len() > MAX_STYLE_RUNS {
            return Err("Formatting exceeds the editable range bound. Nothing was applied.".into());
        }
        for run in self
            .runs
            .iter_mut()
            .filter(|run| (start..end).contains(&(run.start as usize)))
        {
            apply_patch(run, patch);
        }
        Ok(())
    }

    pub(super) fn add_range(&mut self, start: usize, length: usize) -> Result<(), String> {
        if start >= length || self.runs.len() >= MAX_STYLE_RUNS {
            return Err("Choose a character inside the text for the new range.".into());
        }
        if self.runs.iter().any(|run| run.start as usize == start) {
            return Ok(());
        }
        self.ensure_base();
        let mut run = self.active_at(start);
        run.start = start as u32;
        self.runs.push(run);
        self.runs.sort_by_key(|run| run.start);
        Ok(())
    }

    pub(super) fn remove_range(&mut self, start: usize) -> Result<(), String> {
        let index = self
            .runs
            .iter()
            .position(|run| run.start as usize == start)
            .ok_or("This formatting range no longer exists.")?;
        let run = &self.runs[index];
        if run.padding != 0 || run.face & !7 != 0 || font_name(run.font).is_none() || run.size <= 0
        {
            return Err("This imported range carries unsupported attributes. Keep its boundary and change only the supported formatting fields.".into());
        }
        if index == 0 {
            apply_patch(
                &mut self.runs[0],
                &StylePatch {
                    font: Some(0),
                    size: Some(12),
                    bold: Some(false),
                    italic: Some(false),
                    underline: Some(false),
                    color: Some([0; 3]),
                },
            );
        } else {
            self.runs.remove(index);
        }
        Ok(())
    }

    pub(super) fn replace_text(
        &mut self,
        start: usize,
        removed: usize,
        inserted: usize,
        length: usize,
    ) -> Result<(), String> {
        if removed == 0 && inserted == 0 {
            return Ok(());
        }
        self.ensure_base();
        let end = start + removed;
        let new_length = length - removed + inserted;
        if removed == 0
            && start == length
            && !self.runs.iter().any(|run| run.start as usize == length)
        {
            return self.validate(new_length);
        }
        let mut at_start = self.active_at(start);
        at_start.start = start as u32;
        let mut at_end = self.active_at(end);
        at_end.start = (start + inserted) as u32;
        let mut runs = BTreeMap::new();
        for run in &self.runs {
            let offset = run.start as usize;
            if offset < start {
                runs.insert(run.start, run.clone());
            } else if offset >= end {
                let mut shifted = run.clone();
                shifted.start = (offset - removed + inserted) as u32;
                runs.insert(shifted.start, shifted);
            }
        }
        if inserted > 0 {
            runs.insert(start as u32, at_start.clone());
        }
        if start + inserted < new_length {
            runs.entry(at_end.start).or_insert(at_end);
        }
        runs.entry(0).or_insert_with(|| {
            at_start.start = 0;
            at_start
        });
        self.runs = runs.into_values().collect();
        self.validate(new_length)
    }

    fn ensure_base(&mut self) {
        if self.runs.is_empty() {
            self.runs.push(StyleRun::default());
        }
    }
}

fn apply_patch(run: &mut StyleRun, patch: &StylePatch) {
    if let Some(font) = patch.font {
        run.font = font;
    }
    if let Some(size) = patch.size {
        run.size = size;
    }
    if let Some(color) = patch.color {
        run.color = color;
    }
    for (bit, value) in [(1, patch.bold), (2, patch.italic), (4, patch.underline)] {
        if let Some(value) = value {
            run.face = if value {
                run.face | bit
            } else {
                run.face & !bit
            };
        }
    }
}

pub(super) fn replace_draft_text(
    text: &mut String,
    table: Option<&mut StyleTable>,
    start: usize,
    removed: usize,
    inserted: &str,
) -> Result<(), String> {
    let characters = text.chars().collect::<Vec<_>>();
    if start > characters.len() || removed > characters.len() - start {
        return Err("The text edit no longer matches its source. Your draft is retained.".into());
    }
    // Local edits may temporarily contain unsupported characters. The completed
    // draft owns encoding validation, including its absolute character index.
    if let Some(table) = table {
        table.replace_text(start, removed, inserted.chars().count(), characters.len())?;
    }
    *text = characters[..start]
        .iter()
        .copied()
        .chain(inserted.chars())
        .chain(characters[start + removed..].iter().copied())
        .collect();
    Ok(())
}
