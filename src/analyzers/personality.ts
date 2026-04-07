// Repo Personality Type classifier
// Maps repo metrics to a fun, shareable archetype

import type { ContributionData } from './contributions.js';
import type { BusFactorData } from './bus-factor.js';
import type { PRVelocityData } from './pr-velocity.js';
import type { HotspotData } from './hotspots.js';
import type { ComplexityTrendData } from './complexity.js';

export interface RepoPersonality {
  type: string;       // e.g. "Ticking Time Bomb"
  icon: string;       // emoji
  description: string; // one-liner explanation
  traits: string[];   // 2-3 supporting data points
}

interface PersonalityInput {
  contributions: ContributionData;
  busFactor: BusFactorData;
  prVelocity: PRVelocityData;
  hotspots: HotspotData;
  complexity: ComplexityTrendData;
}

/**
 * Classify a repo into a personality archetype based on its metrics.
 * Checks conditions in priority order — first match wins.
 */
export function classifyPersonality(input: PersonalityInput): RepoPersonality {
  const { contributions, busFactor, prVelocity, hotspots, complexity } = input;
  const authors = contributions.authors;
  const totalCommits = contributions.totalCommits;
  const bf = busFactor.overall.busFactor;
  const siloCount = busFactor.singlePointRisks.length;
  const authorCount = contributions.totalAuthors;

  // Check if top contributor is a bot
  const topAuthor = authors[0];
  const topIsBot = topAuthor && topAuthor.name.toLowerCase().includes('bot');
  const topAuthorPct = topAuthor && totalCommits > 0
    ? Math.round((topAuthor.commits / totalCommits) * 100)
    : 0;

  // Recent activity: check if complexity snapshots show growth or decline
  const snapshots = complexity.snapshots;
  const isGrowing = snapshots.length >= 2 &&
    snapshots[snapshots.length - 1].totalFiles > snapshots[0].totalFiles * 1.2;

  // Mega Project: massive repo with many contributors
  if (totalCommits >= 10000 && authorCount >= 100 && bf >= 10) {
    return {
      type: 'Cathedral',
      icon: '⛪',
      description: 'A massive, well-established project with deep contributor roots.',
      traits: [
        `${totalCommits.toLocaleString()} commits by ${authorCount.toLocaleString()} contributors`,
        `Bus factor: ${bf}`,
        siloCount > 0 ? `${siloCount.toLocaleString()} knowledge silos` : 'No knowledge silos',
      ],
    };
  }

  // No commits at all
  if (totalCommits === 0) {
    return {
      type: 'Empty Canvas',
      icon: '🎨',
      description: 'This repo has no commits yet. The story starts with you.',
      traits: ['No commits found', 'A blank slate awaits'],
    };
  }

  // Ghost Town: very few recent commits or stale repo
  if (totalCommits < 10 && authorCount <= 2) {
    return {
      type: 'Ghost Town',
      icon: '🏚️',
      description: 'Quiet around here. This repo has minimal activity.',
      traits: [
        `Only ${totalCommits} commits`,
        `${authorCount} contributor${authorCount !== 1 ? 's' : ''}`,
      ],
    };
  }

  // Bot Farm: top contributor is a bot
  if (topIsBot && topAuthorPct >= 30) {
    return {
      type: 'Bot Farm',
      icon: '🤖',
      description: 'The robots are running the show. Your top contributor is automated.',
      traits: [
        `${topAuthor!.name} leads with ${topAuthorPct}% of commits`,
        `${siloCount} knowledge silos`,
        bf <= 2 ? 'Low bus factor — humans are scarce' : `Bus factor: ${bf}`,
      ],
    };
  }

  // Ticking Time Bomb: low bus factor + many silos
  if (bf <= 1 && siloCount >= 10) {
    return {
      type: 'Ticking Time Bomb',
      icon: '💣',
      description: 'One departure could cause serious damage. Knowledge is dangerously concentrated.',
      traits: [
        `Bus factor: ${bf}`,
        `${siloCount} files with a single maintainer`,
        `${topAuthor?.name} owns ${topAuthorPct}% of commits`,
      ],
    };
  }

  // Benevolent Dictator: one person dominates
  if (topAuthorPct >= 60 && authorCount >= 2) {
    return {
      type: 'Benevolent Dictator',
      icon: '👑',
      description: `${topAuthor!.name} runs this project. Respect the throne.`,
      traits: [
        `${topAuthor!.name}: ${topAuthorPct}% of all commits`,
        `${authorCount} total contributors`,
        `Bus factor: ${bf}`,
      ],
    };
  }

  // Rocket Ship: high velocity, growing fast
  if (isGrowing && totalCommits >= 100 && prVelocity.available && prVelocity.totalMerges >= 10) {
    return {
      type: 'Rocket Ship',
      icon: '🚀',
      description: 'This repo is growing fast with active merges and expanding codebase.',
      traits: [
        `${totalCommits} commits, ${prVelocity.totalMerges} merges`,
        `Codebase grew ${Math.round(((snapshots[snapshots.length - 1]?.totalFiles ?? 0) / (snapshots[0]?.totalFiles || 1) - 1) * 100)}%`,
        `${authorCount} contributors`,
      ],
    };
  }

  // Open Source Utopia: many contributors, good bus factor
  if (bf >= 4 && authorCount >= 8 && siloCount < authorCount) {
    return {
      type: 'Open Source Utopia',
      icon: '🌍',
      description: 'Knowledge is well distributed. This is a healthy, collaborative project.',
      traits: [
        `Bus factor: ${bf}`,
        `${authorCount} contributors`,
        siloCount > 0 ? `Only ${siloCount} knowledge silos` : 'No knowledge silos',
      ],
    };
  }

  // Fortress: stable, well-maintained, moderate activity
  if (bf >= 3 && siloCount <= 5 && totalCommits >= 50) {
    return {
      type: 'Fortress',
      icon: '🏰',
      description: 'Solid and stable. Good knowledge distribution with manageable risks.',
      traits: [
        `Bus factor: ${bf}`,
        `${totalCommits} commits across ${authorCount} contributors`,
        siloCount > 0 ? `${siloCount} minor knowledge silos` : 'No knowledge silos',
      ],
    };
  }

  // Solo Mission: single contributor
  if (authorCount === 1) {
    return {
      type: 'Solo Mission',
      icon: '🧑‍🚀',
      description: `${topAuthor?.name ?? 'One person'} built this alone. Impressive, but risky.`,
      traits: [
        `${totalCommits} commits by a single author`,
        'Bus factor: 1',
        'Consider inviting collaborators',
      ],
    };
  }

  // Default: Work in Progress
  return {
    type: 'Work in Progress',
    icon: '🔧',
    description: 'A growing project finding its rhythm.',
    traits: [
      `${totalCommits} commits by ${authorCount} contributors`,
      `Bus factor: ${bf}`,
      siloCount > 0 ? `${siloCount} knowledge silos to address` : 'No major risks detected',
    ],
  };
}
