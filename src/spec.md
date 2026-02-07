# Specification

## Summary
**Goal:** Upgrade the in-app file preview modal into a professional, mobile-friendly, resizable/fullscreen viewer while keeping support for all currently previewable file types, and bump the Manage version label to 0.1.61 using a single source of truth.

**Planned changes:**
- Redesign the file preview UI (opened by clicking a filename) into a larger, player-style viewer that adapts responsively to desktop and small mobile screens while preserving existing preview behavior for images, text, JSON, audio, video, and documents.
- Add an obvious fullscreen toggle in the viewer header that works on both desktop and mobile and restores the prior size/state when exited.
- Implement user-friendly resizing behavior (e.g., resizable/maximize on desktop and near-full-viewport behavior on mobile) ensuring content reflows correctly for every supported preview type.
- Remove duplicate close (X) controls so only one consistently placed close action remains; keep Escape-to-close on desktop.
- Update Manage section version display from 0.1.60 to 0.1.61 and source it from a central constant/module rather than a hardcoded JSX string.

**User-visible outcome:** File previews open in a noticeably larger, more professional viewer with a single close button, support fullscreen, and behave well on mobile; the Manage section shows version 0.1.61.
