# Specification

## Summary
**Goal:** Fix button background colors in FileList.tsx so they use light filled backgrounds with native borders instead of colored outlines, and bump the app version to 0.4.149.

**Planned changes:**
- Update the "Upload Files" button to have a light blue filled background (bg-blue-100 / dark: bg-blue-900/30), remove any custom blue border/ring/outline classes, and use dark text and icon
- Update the "New Folder" and "Upload Folder" buttons to have a light yellow filled background (bg-yellow-100 / dark: bg-yellow-900/30), remove any custom yellow border/ring/outline classes, and use dark text and icon
- Bump APP_VERSION in `frontend/src/lib/appVersion.ts` from `0.4.148` to `0.4.149`

**User-visible outcome:** The Upload Files, New Folder, and Upload Folder buttons display subtle light-colored filled backgrounds with standard native-looking borders (no colored outlines), and the footer shows version 0.4.149.
