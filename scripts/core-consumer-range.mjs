import { satisfies, validRange } from 'semver';

/** The World selects this candidate; an unchanged server pack may support a compatible older minimum. */
export function assertCandidateCoreRange(pkg, coreVersion) {
  const server = pkg.name === 'agent-mc-qiandengji';
  const range = server ? pkg.peerDependencies?.['agent-mc-world'] : pkg.dependencies?.['agent-mc-world'];
  const supported = typeof range === 'string' && validRange(range) && satisfies(coreVersion, range);
  if (pkg.private || !supported || (!server && range !== '^' + coreVersion)
    || (server && pkg.dependencies?.['agent-mc-world']))
    throw new Error('Consumer core dependency differs: ' + pkg.name);
}
