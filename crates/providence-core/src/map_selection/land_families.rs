pub(super) use crate::land_tile_catalog::LandTileCategory as LandFamily;

pub(super) fn family(landlook: i8, tile: i16) -> Option<LandFamily> {
    crate::land_tile_catalog::semantics(landlook, tile)
        .map(|semantics| semantics.category)
        .filter(|category| *category != LandFamily::Uncertain)
}
