# String 2 Sound 143

Fixture id: `strings-sound-field-string2-143`

Status: `observed`

## Divinity Action

In Divinity full registered version, change String 2 sound to 143 from the prior String 3 sound 145 baseline.

## Manual Workflow

1. Open the `before/` scenario in Divinity.
2. Perform only the action described above.
3. Save/export the edited scenario outside this repository.
4. Run `npm run archaeology:capture-divinity-fixture -- strings-sound-field-string2-143 --after <edited-scenario-dir>`.
5. Run `npm run archaeology:diff-divinity-fixture -- strings-sound-field-string2-143`.

Do not commit proprietary scenario folders unless the fixture was intentionally made from synthetic data.
