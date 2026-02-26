# Specification

## Summary
**Goal:** Apply toolbar button background color styling to three specific buttons in FileList.tsx and bump the app version to 0.4.147.

**Planned changes:**
- Update the version string in `frontend/src/lib/appVersion.ts` from `'0.4.143'` to `'0.4.147'`
- In the toolbar of `FileList.tsx`, for button[2] (File upload): remove border color styling and set background color to `#eff6ff` (very light blue)
- In the toolbar of `FileList.tsx`, for button[3] and button[4] (Folder buttons): remove border color styling and set background color to `#fefce8` (very light yellow)

**User-visible outcome:** The toolbar's File upload button has a light blue background, the two Folder-related buttons have a light yellow background, all border color styling is removed from those three buttons, and the footer shows version 0.4.147.
