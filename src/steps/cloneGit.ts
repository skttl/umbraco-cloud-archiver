import { password, text, isCancel, log } from '@clack/prompts';
import { run, runOrThrow } from '../util/runProcess.js';
import type { EnvPaths } from '../paths.js';

/**
 * Clone the git repo. Tries first without interactive credentials; if that fails,
 * prompts the user for username + PAT and retries with creds embedded in URL.
 *
 * Creates both a `--mirror` bare clone and a working copy.
 */
export async function cloneGitRepo(cloneUrl: string, paths: EnvPaths): Promise<void> {
  let urlToUse = cloneUrl;

  // Probe with ls-remote first using the system credential helper.
  log.step('Testing git access...');
  const probe = await run('git', ['ls-remote', cloneUrl], { inherit: false, capture: true });

  if (probe.code !== 0) {
    log.warn('Git access failed without credentials. Prompting for username and personal access token.');
    const username = await text({
      message: 'Git username (Umbraco Cloud / project email):',
      validate: (v) => (v && v.trim() ? undefined : 'Required'),
    });
    if (isCancel(username)) throw new Error('Aborted at git username prompt.');
    const pat = await password({
      message: 'Git password / personal access token:',
      validate: (v) => (v ? undefined : 'Required'),
    });
    if (isCancel(pat)) throw new Error('Aborted at git password prompt.');
    urlToUse = injectCredentials(cloneUrl, String(username), String(pat));

    // Retest
    const retry = await run('git', ['ls-remote', urlToUse], { inherit: false, capture: true });
    if (retry.code !== 0) {
      throw new Error(
        `Git access still failing with provided credentials.\n${retry.stderr || retry.stdout}`,
      );
    }
  }

  log.step(`Cloning mirror to ${paths.gitMirror}`);
  await runOrThrow('git', ['clone', '--mirror', urlToUse, paths.gitMirror]);

  log.step(`Cloning working copy to ${paths.repo}`);
  await runOrThrow('git', ['clone', urlToUse, paths.repo]);
}

function injectCredentials(cloneUrl: string, username: string, pat: string): string {
  const url = new URL(cloneUrl);
  url.username = encodeURIComponent(username);
  url.password = encodeURIComponent(pat);
  return url.toString();
}
