/**
 * Normalize a search term for consistent case-insensitive substring matching.
 * Returns the trimmed, lowercased term, or empty string if invalid.
 */
export function normalizeSearchTerm(term: string): string {
  return term.trim().toLowerCase();
}

/**
 * Check if a name matches the search term using case-insensitive substring matching.
 */
export function matchesSearchTerm(name: string, searchTerm: string): boolean {
  if (!searchTerm) return true;
  return name.toLowerCase().includes(searchTerm.toLowerCase());
}
