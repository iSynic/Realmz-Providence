# Strings Sound Field Change

Fixture id: `strings-sound-field-change`

Status: `observed`

## Divinity Action

In Divinity full registered version, set String 3 sound to 147 from the New Scenario baseline.

## Manual Workflow

1. Open the `before/` scenario in Divinity.
2. Perform only the action described above.
3. Save/export the edited scenario outside this repository.
4. Run `npm run archaeology:capture-divinity-fixture -- strings-sound-field-change --after <edited-scenario-dir>`.
5. Run `npm run archaeology:diff-divinity-fixture -- strings-sound-field-change`.

Do not commit proprietary scenario folders unless the fixture was intentionally made from synthetic data.
