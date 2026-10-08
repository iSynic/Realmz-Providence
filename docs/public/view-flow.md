# View Flow

Select a record and choose **Navigate → View Flow…**. You can also use the
**View Flow…** button beside caller controls, the button in Search, or search
for **View Flow** in the command palette.

The graph shows the applied project. Opening it never applies or discards an
unfinished edit. Apply a newly created record before opening its flow.

- Select a record to inspect its **Steps**, **Connections**, or **Details**.
  Selecting a step brings its meaning forward; **Show all 8 slots** reveals
  the surrounding original positions. Conditions and branch targets can be
  selected separately. **Open step** or **Open condition** opens its owning field.
- Select a line to inspect its exact occurrences in Connections. Shared lines
  show a count; choose an occurrence before opening its owning field.
  **Open record** opens the selected record. Missing or ambiguous destinations
  keep the source available for repair.
- **Expand upstream/downstream** adds one level around the selection. Collapse
  removes that expansion while retaining records needed by other branches.
- **Focus here** starts from the selected record. **Back** restores the previous
  graph, positions and viewport. **Lock nodes** starts checked. Uncheck it to
  drag cards, then check it to protect the arrangement. Refresh and Back retain
  the lock setting. Fit, Recenter and zoom remain available while locked.
- The visible legend and **Symbols & key** explain calls, checks, changes,
  uses, eligibility, warnings, selection and keyboard focus. The five filters
  work independently. State connections do not imply execution order.
- Groups disclose their loaded members. **Find in loaded records** can reveal
  a member inside a group; it does not search records outside the current view.
  Click outside the list or press Escape to dismiss it without closing View Flow.
- Hover or press F1 for help. Tab reaches controls; arrows move card focus and
  Enter selects. Escape dismisses help before closing the window. Opening an
  editor uses the usual draft confirmation.

After visiting an editor, choose View Flow again to return to your exploration.
If the project changed, Refresh rebuilds the view before further navigation.
Each view is limited to 200 records and 600 connections; focus a smaller branch
when the limit is reached. These are possible authored relationships, not a
recording of a playthrough.
