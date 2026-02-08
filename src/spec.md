# Specification

## Summary
**Goal:** Fix file browser regressions and UX issues by restoring click-to-preview, enabling recursive file search, repositioning the current-path breadcrumb, and bumping version to 0.3.87.

**Planned changes:**
- Move the current-path breadcrumb so it renders directly above the files/folders list and below the search/actions row.
- Restore file row click behavior to reliably open `FilePreviewModal` for previewable files, while keeping folder clicks as navigation.
- Fix recursive search so subtree search includes matching files in descendant folders (including from root), preserving existing case/diacritics-insensitive matching and current search UI behavior.
- Update surfaced app version values to `0.3.87` (frontend appVersion and backend version if present).

**User-visible outcome:** The file browser shows the current path immediately above the filesystem list, clicking a file opens its preview modal again (with next/previous working in the current list context), and searching finds matching files throughout subfolders (including from root), with the app reporting version 0.3.87.
