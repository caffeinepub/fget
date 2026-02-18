# Specification

## Summary
**Goal:** Restore key List view and navigation affordances (filename tooltip, correct file type labeling, clearer clickable breadcrumbs) and bump the app version to 0.4.119 without changing layout.

**Planned changes:**
- Restore the List view filename hover tooltip by adding an HTML `title` attribute to the filename text element (browser-native tooltip), keeping all existing layout and other tooltips unchanged.
- Fix file type detection in List view:
  - If a filename contains no `.` at all, show Type as exactly `N/A` using the existing unknown-type styling.
  - If a filename has an extension (even if not supported/previewable), derive the Type label from that extension (e.g., `.deb` → `DEB`) rather than showing `N/A` or the full filename.
  - Keep existing folder type behavior unchanged.
- Improve breadcrumb/path click affordance via styling only (e.g., distinct link color and hover/underline) for clickable segments, matching the intent shown in the provided screenshot, without moving elements.
- Bump the app version to `0.4.119` and ensure the UI version display updates accordingly.

**User-visible outcome:** In List view, long filenames can be fully seen on hover again, file Type badges display correctly for extensionless vs. unknown-extension files, breadcrumb path segments look clearly clickable for navigation, and the app shows version v0.4.119 in the UI.
