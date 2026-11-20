Lets agents label workspaces. Ask an agent to "label this workspace Needs review" and it adds the label chip you see in the sidebar, the same as doing it by hand.

Every agent gets two tools:

- `set_workspace_label` adds or removes a label on the agent's own workspace, or on another workspace when given its ID. A label that does not exist yet is created, with a color chosen from its name unless the agent picks one.
- `list_workspace_labels` lists the existing labels so agents reuse names instead of creating near-duplicates.

Paseo 0.15 has no plugin call for workspace labels, so the plugin opens its own local daemon session with the daemon's local credential, the way the Paseo CLI does. That connection is not a stable plugin contract and may break on a Paseo upgrade; Paseo 0.16 adds an official label call the plugin can move to. Local daemons only.
