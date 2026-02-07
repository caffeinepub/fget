# Specification

## Summary
**Goal:** Fix the File Manager search so it returns matching files/folders using case-insensitive substring matching.

**Planned changes:**
- Update frontend search logic to call the existing search query hook when the search term is non-empty.
- Ensure matching is performed as a case-insensitive substring check (e.g., `cs` matches `cs.json`) and results render in the UI.
- Ensure clearing the search term restores the normal current-folder contents view.
- Ensure search operates from the currently open folder (works within subfolders) and produces no console errors.

**User-visible outcome:** Typing into the File Manager search bar shows matching files/folders (case-insensitive substring), and clearing the search returns to the normal folder contents list.
