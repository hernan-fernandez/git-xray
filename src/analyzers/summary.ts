// Template-based repo summary generator
// Produces a natural language paragraph from report data

import type { ContributionData } from './contributions.js';
import type { BusFactorData } from './bus-factor.js';
import type { PRVelocityData } from './pr-velocity.js';
import type { HotspotData } from './hotspots.js';
import type { RepoPersonality } from './personality.js';

export interface SummaryInput {
  repoName: string;
  contributions: ContributionData;
  busFactor: BusFactorData;
  prVelocity: PRVelocityData;
  hotspots: HotspotData;
  personality: RepoPersonality;
}

/**
 * Generate a natural language summary paragraph from repo data.
 */
export function generateSummary(input: SummaryInput): string {
  const { repoName, contributions, busFactor, prVelocity, hotspots, personality } = input;
  const parts: string[] = [];

  const authorCount = contributions.authors.length;
  const totalCommits = contributions.totalCommits;
  const bf = busFactor.overall.busFactor;
  const silos = busFactor.singlePointRisks;
  const topAuthor = contributions.authors[0];

  // Opening: repo overview
  parts.push(`${repoName} has ${totalCommits.toLocaleString()} commits by ${authorCount} contributor${authorCount !== 1 ? 's' : ''}.`);

  // Personality
  parts.push(`${personality.icon} ${personality.description}`);

  // Top contributor insight
  if (topAuthor) {
    const pct = totalCommits > 0 ? Math.round((topAuthor.commits / totalCommits) * 100) : 0;
    const isBot = topAuthor.name.toLowerCase().includes('bot');
    if (isBot) {
      parts.push(`The top contributor is ${topAuthor.name} (${pct}% of commits) — automation is doing heavy lifting here.`);
    } else if (pct >= 50) {
      parts.push(`${topAuthor.name} dominates with ${pct}% of all commits.`);
    } else if (pct >= 30) {
      parts.push(`${topAuthor.name} leads with ${pct}% of commits.`);
    }
  }

  // Bus factor assessment
  if (bf <= 1) {
    parts.push(`The bus factor is critically low at ${bf} — if one key person leaves, significant knowledge could be lost.`);
  } else if (bf <= 2) {
    parts.push(`The bus factor is ${bf}, which is concerning. Knowledge is concentrated in very few people.`);
  } else if (bf >= 5) {
    parts.push(`The bus factor is a healthy ${bf}, showing good knowledge distribution across the team.`);
  }

  // Knowledge silos
  if (silos.length > 0) {
    const topSilo = silos[0];
    if (silos.length >= 20) {
      parts.push(`There are ${silos.length} knowledge silos — files where only one person has recent expertise. The highest risk is ${topSilo.filePath}, where ${topSilo.soleAuthor} owns ${topSilo.authorPercentage}% of changes.`);
    } else if (silos.length >= 5) {
      parts.push(`${silos.length} files have a single maintainer. The biggest risk is ${topSilo.filePath} (${topSilo.authorPercentage}% by ${topSilo.soleAuthor}).`);
    } else if (silos.length > 0) {
      parts.push(`${silos.length} file${silos.length !== 1 ? 's have' : ' has'} a single maintainer.`);
    }
  }

  // Hotspots
  if (hotspots.hotspots.length > 0) {
    const topHotspot = hotspots.hotspots[0];
    parts.push(`The most frequently changed file is ${topHotspot.filePath} with ${topHotspot.changeCount} changes.`);
  }

  // PR velocity
  if (prVelocity.available && prVelocity.averageMergeTime !== null) {
    const days = (prVelocity.averageMergeTime / 86400000).toFixed(1);
    if (parseFloat(days) <= 1) {
      parts.push(`PRs merge fast — average ${days} days. The team has a quick review cycle.`);
    } else if (parseFloat(days) >= 7) {
      parts.push(`PRs take an average of ${days} days to merge, which may indicate review bottlenecks.`);
    } else {
      parts.push(`Average PR merge time is ${days} days across ${prVelocity.totalMerges} merges.`);
    }
  } else if (!prVelocity.available) {
    parts.push(`No merge commits found — this repo likely uses rebase or squash merges.`);
  }

  // Recommendation
  const recommendations = generateRecommendations(bf, silos.length, contributions, prVelocity);
  if (recommendations.length > 0) {
    parts.push('Recommendations: ' + recommendations.join(' '));
  }

  return parts.join(' ');
}

function generateRecommendations(
  busFactor: number,
  siloCount: number,
  contributions: ContributionData,
  prVelocity: PRVelocityData,
): string[] {
  const recs: string[] = [];

  if (busFactor <= 2) {
    recs.push('Cross-train team members on critical modules to improve the bus factor.');
  }

  if (siloCount >= 10) {
    recs.push('Schedule knowledge-sharing sessions for files with single maintainers.');
  }

  if (prVelocity.available && prVelocity.averageMergeTime !== null) {
    const days = prVelocity.averageMergeTime / 86400000;
    if (days >= 7) {
      recs.push('Consider streamlining the review process to reduce merge times.');
    }
  }

  const topAuthor = contributions.authors[0];
  if (topAuthor) {
    const pct = contributions.totalCommits > 0
      ? Math.round((topAuthor.commits / contributions.totalCommits) * 100)
      : 0;
    if (pct >= 50 && !topAuthor.name.toLowerCase().includes('bot')) {
      recs.push(`Distribute work more evenly — ${topAuthor.name} carries a disproportionate load.`);
    }
  }

  return recs;
}
