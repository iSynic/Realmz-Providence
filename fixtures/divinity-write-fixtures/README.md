# Divinity Write Fixtures

This directory holds Evidence Lab fixtures that compare a scenario before and after one Divinity authoring action.

Use placeholders for planned captures and avoid committing proprietary scenario payloads. Snapshot JSON files embed raw bytes, so they should be treated like scenario source data.

Every fixture must name the exact behavior to prove, the scenario/tool used, and the Providence decision it unlocks. If those fields are not clear yet, keep the task in `docs/archaeology-priorities.md` or Linear instead of capturing bytes.

Typical workflow:

```powershell
npm run archaeology:prepare-divinity-fixture -- <id> --baseline "<scenario-dir>" --action "<one Divinity action>" --behavior "<exact behavior>" --scenario-tool "<scenario/tool>" --decision "<Providence decision>"
npm run archaeology:capture-divinity-fixture -- <id> --after "<edited-scenario-dir>"
npm run archaeology:diff-divinity-fixture -- <id>
```
