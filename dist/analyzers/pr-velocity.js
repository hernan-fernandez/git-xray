// PR velocity metrics
// Pure function: (mergeRecords, allCommits, mainLineHashes) => PRVelocityData
/**
 * Walk back from a commit hash to find the oldest ancestor that is NOT on main-line.
 * This approximates the branch creation point.
 *
 * Handles nested merges: if the second parent itself has multiple parents,
 * recursively walk until a single-parent commit or main-line commit is found.
 *
 * Returns the date of the oldest non-main-line commit found in the walk,
 * or null if the commit is already on main-line.
 */
function findBranchCreationDate(startHash, commitMap, mainLineHashes) {
    if (mainLineHashes.has(startHash)) {
        return null;
    }
    let oldestDate = null;
    const visited = new Set();
    const stack = [startHash];
    while (stack.length > 0) {
        const hash = stack.pop();
        if (visited.has(hash))
            continue;
        visited.add(hash);
        const commit = commitMap.get(hash);
        if (!commit)
            continue;
        // If this commit is on main-line, stop walking this path
        if (mainLineHashes.has(hash))
            continue;
        // Track the oldest non-main-line commit date
        if (oldestDate === null || commit.date.getTime() < oldestDate.getTime()) {
            oldestDate = commit.date;
        }
        // Walk to parents
        for (const parentHash of commit.parentHashes) {
            if (!visited.has(parentHash)) {
                stack.push(parentHash);
            }
        }
    }
    return oldestDate;
}
/**
 * Format a Date as YYYY-MM string.
 */
function toYearMonth(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}
/**
 * Analyze PR velocity from merge commit patterns.
 *
 * Avoids per-merge `git merge-base` calls by:
 * 1. Using a pre-built main-line commit set (from `git log --first-parent`)
 * 2. For each merge commit's second parent, walking back to find divergence
 *    from main-line (approximates branch creation time)
 *
 * @param mergeRecords - Parsed merge commit records
 * @param allCommits - Full commit history for walking back
 * @param mainLineHashes - Set of commit hashes on the main line (from first-parent log)
 */
export function analyzePRVelocity(mergeRecords, allCommits, mainLineHashes) {
    if (mergeRecords.length === 0) {
        return {
            available: false,
            averageMergeTime: null,
            mergesPerMonth: [],
            totalMerges: 0,
            warningMessage: 'No merge commits found. This repository likely uses a rebase or squash merge workflow. PR velocity metrics are unavailable.',
        };
    }
    // Build a commit lookup map for walking
    const commitMap = new Map();
    for (const commit of allCommits) {
        commitMap.set(commit.hash, commit);
    }
    // Compute merge times
    const mergeTimes = [];
    for (const merge of mergeRecords) {
        // Second parent is the branch that was merged in
        if (merge.parentHashes.length < 2)
            continue;
        const secondParent = merge.parentHashes[1];
        const branchCreationDate = findBranchCreationDate(secondParent, commitMap, mainLineHashes);
        if (branchCreationDate !== null) {
            const mergeTime = merge.date.getTime() - branchCreationDate.getTime();
            if (mergeTime >= 0) {
                mergeTimes.push(mergeTime);
            }
        }
    }
    // Average merge time
    const averageMergeTime = mergeTimes.length > 0
        ? mergeTimes.reduce((sum, t) => sum + t, 0) / mergeTimes.length
        : null;
    // Merges per month
    const monthCounts = new Map();
    for (const merge of mergeRecords) {
        const month = toYearMonth(merge.date);
        monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    }
    const mergesPerMonth = Array.from(monthCounts.entries())
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month));
    return {
        available: true,
        averageMergeTime,
        mergesPerMonth,
        totalMerges: mergeRecords.length,
    };
}
//# sourceMappingURL=pr-velocity.js.map