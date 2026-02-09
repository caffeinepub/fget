# Specification

## Summary
**Goal:** Restore regressed search results interactions (clickable containing-folder path and filename click-to-preview) and bump the app version to 0.3.101.

**Planned changes:**
- In search results, display only the containing folder path (excluding filename) as a clickable element that navigates to that folder (updates currentFolderId and breadcrumb) and exits search mode (clears searchTerm).
- In search results, restore clicking a file’s filename to open the existing preview modal for that file (no other preview/player changes).
- Update the centralized app version constant to 0.3.101 so the UI reflects version 0.3.101.

**User-visible outcome:** While viewing search results, users can click the shown folder path to jump into that folder, and click a file name to open its preview again; the app shows version 0.3.101.
