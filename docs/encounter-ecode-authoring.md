# Encounter ECODE Authoring

Simple and Complex Encounter result actions now use the same contextual settings editor as Action Points for every selectable Data EDCD-backed opcode. The result row shows the action's behavior and an **Edit Settings** control; authors no longer need to select or interpret a raw Data EDCD row number.

Action Points already had this ECODE authoring path in the selected-step pane, so they do not open a second modal over that dedicated editor. Both surfaces now use the same documented choice domains and runtime-context rules. Ordinary Action Point and Encounter choosers omit actions that only make sense in a different runtime context, while imported out-of-context CODE/ID values remain visible, explained, and unchanged until the author deliberately replaces them.

Applying a modal writes its five ECODE values and retargets the selected result row as one undoable project command. New and missing settings receive a deterministic nonzero row only on Apply. Shared or conflicting settings default to a caller-owned duplicate, while deliberate shared editing remains explicit. Cancel writes nothing.

Direct-ID encounter actions retain their existing numeric field, search, browse, and preview behavior. Negative result opcodes remain separate from signed values inside ECODE settings.

The complete reviewed boundary is generated in [encounter-ecode-authoring.md](generated/encounter-ecode-authoring.md). It currently covers all 69 positive ECODE-backed opcodes exposed by Encounter result authoring, with zero unreviewed contracts and zero unresolved field controls. Combat-context-only ECODE opcodes 120–126 remain preserved and editable through the contextual modal when imported, but are marked as context-gated advanced/raw fallbacks rather than routine Encounter behavior.

Raw CODE, caller ID, row provenance, and all five signed values remain available under **Technical Details** for imported-scenario diagnosis and evidence-gated fields.
