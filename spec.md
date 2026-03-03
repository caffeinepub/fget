# Specification

## Summary
**Goal:** Fix button background colors for Upload Files, New Folder, and Upload Folder buttons, and bump the app version to 0.4.151.

**Planned changes:**
- Set the Upload Files button background to solid `#eff6ff` (light blue) with no colored border, in both light and dark modes
- Set the New Folder and Upload Folder buttons background to solid `#fefce8` (light yellow) with no colored border, in both light and dark modes
- Update `APP_VERSION` in `frontend/src/lib/appVersion.ts` to `'0.4.151'`

**User-visible outcome:** The three action buttons display their correct background fill colors regardless of theme, and the footer shows v0.4.151.
