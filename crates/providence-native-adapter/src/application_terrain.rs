//! Read-only behavior templates from the explicitly configured Classic support directory.
use std::{collections::BTreeMap, fs::File, io::Read, path::Path};

#[derive(Debug)]
pub(crate) struct ApplicationTerrain(BTreeMap<i8, Result<Vec<u8>, String>>);

impl ApplicationTerrain {
    pub(crate) fn open(root: &Path) -> Self {
        Self(
            [0, 3, 4, 5, 9, 10]
                .into_iter()
                .map(|look| {
                    let name = providence_core::codecs::standard_landlook_source_name(look)
                        .expect("stock look");
                    let source = (|| {
                        let mut bytes = vec![];
                        File::open(root.join(name))
                            .map_err(|_| {
                                format!("The configured Classic support is missing {name}.")
                            })?
                            .take(8105)
                            .read_to_end(&mut bytes)
                            .map_err(|error| error.to_string())?;
                        if bytes.len() != 8104 {
                            return Err(format!(
                                "{name} must retain its complete 8104-byte behavior template."
                            ));
                        }
                        Ok(bytes)
                    })();
                    (look, source)
                })
                .collect(),
        )
    }

    pub(crate) fn bytes(&self, look: i8) -> Result<&[u8], String> {
        self.0
            .get(&look)
            .ok_or("This stock behavior template is unsupported.")?
            .as_ref()
            .map(Vec::as_slice)
            .map_err(Clone::clone)
    }
}
