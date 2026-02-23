# Specification

## Summary
**Goal:** Improve file manager UI with individual upload stats, simplified button styling, filename truncation with tooltips, and merged view toggle button.

**Planned changes:**
- Add individual file upload progress statistics for each file during multi-file uploads
- Allow Upload Files, New Folder, and Upload Folder buttons to remain usable during active uploads
- Merge the two view toggle buttons into a single button that switches between list and grid views
- Add tooltip to the view toggle button on hover
- Truncate long filenames in the Name column to maintain consistent cell dimensions
- Add tooltips to filenames showing the full name on hover
- Simplify Upload Files, New Folder, and Upload Folder button styling to black/white with subtle colored borders (blue for Upload Files, yellow for New Folder and Upload Folder)
- Add tooltips to action buttons (download, share/copy link, move, delete) on hover
- Do not add tooltips to Upload Files, New Folder, or Upload Folder buttons
- Update application version to 0.4.143

**User-visible outcome:** Users will see individual upload progress for each file, cleaner button styling matching the design in image-167.png, truncated filenames with full-name tooltips, a single view toggle button with tooltip, and tooltips on action buttons for better usability.
