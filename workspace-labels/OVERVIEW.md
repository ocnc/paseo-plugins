Lets agents label workspaces. Ask an agent to "label this workspace Needs review" and it adds the label chip you see in the sidebar, the same as doing it by hand.

Every agent gets two tools:

- `set_workspace_label` adds or removes a label on the agent's own workspace, or on another workspace when given its ID. An existing label keeps its color. A label that does not exist yet is created with Paseo's default color; recolor it in the sidebar if you like.
- `list_workspace_labels` lists the label names in use on workspaces, so agents reuse names instead of creating near-duplicates. A label that no workspace currently carries is not listed.

Requires Paseo 0.16.1 or later.
