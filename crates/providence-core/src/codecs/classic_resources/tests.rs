use super::*;
use super::{
    byte_io::{read_u16, read_u32},
    container::{APPLE_DOUBLE_MAGIC, RESOURCE_FORK_ENTRY_ID},
};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
mod fixtures;
use fixtures::*;
mod boundaries;
mod edits;
mod evidence;
mod ownership;
