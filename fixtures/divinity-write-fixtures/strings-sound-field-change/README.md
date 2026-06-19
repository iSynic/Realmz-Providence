# Strings Sound Field Change

Fixture id: `strings-sound-field-change`

Status: `planned`

## Divinity Action

Open a scenario in Divinity, edit exactly one string/message sound field, save, and capture the edited scenario as the after state.

## Manual Workflow

1. Prepare this fixture with a redistributable or local-only baseline scenario.
2. Open the baseline in Divinity.
3. Change one string/message sound field and no other field.
4. Save/export the edited scenario outside this repository.
5. Run `npm run archaeology:capture-divinity-fixture -- strings-sound-field-change --after <edited-scenario-dir>`.
6. Run `npm run archaeology:diff-divinity-fixture -- strings-sound-field-change`.

Do not commit proprietary scenario folders or snapshots generated from proprietary inputs.
