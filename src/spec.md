# Specification

## Summary
**Goal:** Restore key File Browser UI behaviors (always-visible row actions, labeled top action buttons with correct order, and clickable breadcrumb paths in search) and bump the app version to v0.4.111.

**Planned changes:**
- Update List view rows so file/folder action buttons are always visible (not hover-only) while keeping tooltips on those row action buttons.
- Update the File Browser header top actions to use labeled buttons (no tooltips) and enforce order: Upload Files → Upload Folder → Create Folder.
- Restore clickable folder path/breadcrumb context for search results so users can navigate to the containing folder (exiting search).
- Bump displayed application version to 0.4.111 wherever the version appears in the UI.

**User-visible outcome:** In List view, action buttons are always visible with tooltips; top actions show labeled buttons in the requested order without tooltips; search results again include a clickable path to jump to the containing folder; the UI shows v0.4.111.
