// Path-scope matching used by analyzers that honor the --scope flag.
//
// The scope is matched on path-segment boundaries: a scope of "src" matches
// "src/foo.ts" but not "src2/foo.ts". A trailing slash on the scope is
// tolerated. An exact match (scope equals path) is allowed. Pure function,
// no I/O.

/**
 * True when `path` is inside the directory `scope`, by path-segment match.
 *
 * Examples:
 *   pathInScope("src/foo.ts", "src")    → true
 *   pathInScope("src/foo.ts", "src/")   → true (trailing slash tolerated)
 *   pathInScope("src", "src")           → true (exact match)
 *   pathInScope("src2/foo.ts", "src")   → false (no segment boundary)
 *   pathInScope("README.md", "")        → true (empty scope = no filter)
 */
export function pathInScope(path: string, scope: string): boolean {
  const normalized = scope.endsWith('/') ? scope.slice(0, -1) : scope;
  if (normalized.length === 0) return true;
  return path === normalized || path.startsWith(normalized + '/');
}
