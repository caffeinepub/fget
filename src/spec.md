# Specification

## Summary
**Goal:** Release v0.3.91 to fix folder upload failures, correct search-result path navigation, restore text preview navigation, and make small UI/metadata adjustments.

**Planned changes:**
- Fix backend hashing logic causing folder uploads to fail with “YHash must be exactly 32 bytes, got 64”, ensuring recursive uploads (picker + drag-and-drop) create the correct folder tree and persist after refresh.
- Correct navigation when clicking breadcrumb/path segments in search results so it routes to a valid, reachable folder (not an incorrect root/drive context) and exits/clears search context appropriately.
- Reorder FileList header actions to: (1) Upload Files, (2) New Folder, (3) Upload Folder, limited to the specified button group.
- Display file type next to file size in file row metadata (e.g., “PDF • 145.19 KB”), derived from extension with a reasonable fallback; do not show a type label for folders.
- Restore Previous/Next navigation for text-based file preview, including clickable controls and left/right arrow key navigation.
- Bump app version to 0.3.91 in both frontend display and backend-reported version, adding/updating migration only if required by existing upgrade policy.

**User-visible outcome:** Users can upload folders reliably (including nested paths), click search-result paths to navigate correctly, see upload controls in the requested order, view file type alongside size, navigate between text previews with buttons/arrow keys, and see the app reported as version 0.3.91.
