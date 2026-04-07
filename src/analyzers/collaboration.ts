// Collaboration graph analyzer
// Builds an adjacency graph of authors who work on the same files

import type { FileChangeRecord } from '../parsers/numstat-parser.js';

export interface CollaborationNode {
  name: string;
  commits: number;
}

export interface CollaborationEdge {
  source: string;
  target: string;
  sharedFiles: number;  // number of files both authors touched
}

export interface CollaborationData {
  nodes: CollaborationNode[];
  edges: CollaborationEdge[];
}

/**
 * Build a collaboration graph from file change records.
 * Two authors are connected if they both modified the same file.
 * Edge weight = number of shared files.
 */
export function analyzeCollaboration(
  fileChanges: FileChangeRecord[],
): CollaborationData {
  // Build: file → set of authors who touched it
  const fileAuthors = new Map<string, Set<string>>();
  const authorCommits = new Map<string, Set<string>>();

  for (const fc of fileChanges) {
    let authors = fileAuthors.get(fc.filePath);
    if (!authors) {
      authors = new Set();
      fileAuthors.set(fc.filePath, authors);
    }
    authors.add(fc.author);

    let commits = authorCommits.get(fc.author);
    if (!commits) {
      commits = new Set();
      authorCommits.set(fc.author, commits);
    }
    commits.add(fc.commitHash);
  }

  // Build edges: for each file with 2+ authors, create edges between all pairs
  const edgeMap = new Map<string, number>(); // "authorA|authorB" → shared file count

  for (const [, authors] of fileAuthors) {
    if (authors.size < 2) continue;
    const authorList = Array.from(authors).sort();
    for (let i = 0; i < authorList.length; i++) {
      for (let j = i + 1; j < authorList.length; j++) {
        const key = `${authorList[i]}|${authorList[j]}`;
        edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
      }
    }
  }

  // Build nodes (only include authors that appear in at least one edge, plus top contributors)
  const connectedAuthors = new Set<string>();
  for (const key of edgeMap.keys()) {
    const [a, b] = key.split('|');
    connectedAuthors.add(a);
    connectedAuthors.add(b);
  }

  // Also include top authors by commit count even if isolated
  const allAuthors = Array.from(authorCommits.entries())
    .map(([name, commits]) => ({ name, commits: commits.size }))
    .sort((a, b) => b.commits - a.commits);

  const includedAuthors = new Set(connectedAuthors);
  for (const author of allAuthors.slice(0, 15)) {
    includedAuthors.add(author.name);
  }

  const nodes: CollaborationNode[] = Array.from(includedAuthors).map(name => ({
    name,
    commits: authorCommits.get(name)?.size ?? 0,
  }));

  const edges: CollaborationEdge[] = Array.from(edgeMap.entries())
    .map(([key, sharedFiles]) => {
      const [source, target] = key.split('|');
      return { source, target, sharedFiles };
    })
    .sort((a, b) => b.sharedFiles - a.sharedFiles)
    .slice(0, 100); // Cap edges to keep the graph readable

  return { nodes, edges };
}
