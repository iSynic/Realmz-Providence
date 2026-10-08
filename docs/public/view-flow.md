# View Flow

Select a record and choose **Navigate → View Flow…**. You can also use the
**View Flow…** button beside caller controls, the button in Search, or search
for **View Flow** in the command palette.

The graph shows the applied project. Opening it never applies or discards an
unfinished edit. Apply a newly created record before opening its flow.

- Select a record to inspect it. Select a line or use the connection selector
  and Previous/Next to inspect one exact source step. Parallel connections stay
  separate in that selector.
- **Open owning step** opens the source field. **Open in editor** opens the
  exact destination when available. Missing destinations keep their callers
  visible and offer the owning step for repair.
- **Expand upstream/downstream** adds one level around the selection. Collapse
  removes that expansion while retaining records needed by other branches.
- **Focus here** starts from the selected record. **Back** restores the previous
  graph, positions and viewport. Drag cards to arrange them; Fit, Recenter and
  zoom change only the view.
- Calls use solid lines, state checks and changes use dashed lines, and other
  references use dotted lines. State connections do not imply execution order.
- Tab reaches controls and cards; arrows move between nearby cards. Escape
  closes the window. Opening an editor uses the usual draft confirmation.

After visiting an editor, choose View Flow again to return to your exploration.
If the project changed, Refresh rebuilds the view before further navigation.
Each view is limited to 200 records and 600 connections; focus a smaller branch
when the limit is reached. These are possible authored relationships, not a
recording of a playthrough.
