# Specification

## Summary
**Goal:** Restore reliable click-to-open file previews (without breaking search), bring back gallery-style navigation in the preview modal, improve robustness across file types with download fallback, and bump version to 0.3.88.

**Planned changes:**
- Restore file-row click behavior in the file browser so clicking a file (in both normal listing and search results) opens the existing FilePreviewModal, while folder clicks continue to navigate and search behavior remains unchanged.
- Update FilePreviewModal to support previous/next navigation within the current context (current folder when not searching; current search results when searching), including UI controls and left/right keyboard arrows without clearing search or changing folders.
- Improve preview handling across file types: use in-browser viewers for supported types and show a clear “Preview not available” state with a working download action for unsupported/unsafe types (no infinite loading).
- Ensure text previews support both vertical and horizontal scrolling (including in fullscreen/maximized modal states).
- Bump surfaced app version to 0.3.88 in frontend and backend version constants.

**User-visible outcome:** Clicking a file reliably opens its preview (including from search), users can browse next/previous files like a gallery inside the preview modal, unsupported files clearly offer download instead of hanging, text previews scroll in both directions, and the app reports version 0.3.88.
