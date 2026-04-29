import { intro, outro, text, select, confirm, password, log, isCancel, cancel } from '@clack/prompts';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import pc from 'picocolors';
import type { DbMode, Environment, RunConfig } from './config.js';
import { parseContainerSasUrl } from './util/sasUrl.js';

function bail(message: string): never {
  cancel(message);
  process.exit(1);
}

function ensure<T>(value: T | symbol, label: string): T {
  if (isCancel(value)) bail(`Aborted at: ${label}`);
  return value as T;
}

export async function runWizard(): Promise<RunConfig> {
  intro(pc.bgCyan(pc.black(' umbraco-cloud-archiver ')));
  log.message('This wizard will guide you through archiving an Umbraco Cloud project.');

  // 1. Base directory
  const baseDirRaw = ensure(
    await text({
      message: 'Output base folder (an environment subfolder will be created per environment):',
      placeholder: process.cwd(),
      validate: (v) => (v && v.trim() ? undefined : 'Required'),
    }),
    'output folder',
  );
  const baseDir = resolve(String(baseDirRaw).trim());
  await mkdir(baseDir, { recursive: true });
  if (baseDir.length > 100) {
    log.warn(
      `Output path is ${baseDir.length} characters - on Windows you may hit MAX_PATH issues during git clone or blob copy.`,
    );
  }

  // 2. DB mode
  const dbMode = ensure(
    await select<DbMode>({
      message: 'Database backup strategy:',
      options: [
        {
          value: 'sqlpackage',
          label: 'Export with sqlpackage (.bacpac) - prompts for SQL credentials per environment',
        },
        {
          value: 'skip',
          label: 'Skip - I will fetch the database backup manually from the Cloud portal',
        },
      ],
      initialValue: 'sqlpackage',
    }),
    'database mode',
  );

  // 3. Environment loop
  const environments: Environment[] = [];
  let addMore = true;
  while (addMore) {
    const env = await collectEnvironment(dbMode, environments.map((e) => e.name));
    environments.push(env);
    log.success(`Added environment "${env.name}".`);

    const more = ensure(
      await confirm({
        message: 'Add another environment?',
        initialValue: false,
      }),
      'add-another prompt',
    );
    addMore = Boolean(more);
  }

  if (environments.length === 0) bail('At least one environment is required.');

  // 4. Confirm
  log.info(buildSummary({ baseDir, dbMode, environments }));
  const go = ensure(
    await confirm({
      message: 'Proceed with archive?',
      initialValue: true,
    }),
    'final confirmation',
  );
  if (!go) bail('User cancelled.');

  return { baseDir, dbMode, environments };
}

async function collectEnvironment(dbMode: DbMode, taken: string[]): Promise<Environment> {
  const name = ensure(
    await text({
      message: 'Environment name (e.g. live, stage, dev):',
      validate: (v) => {
        if (!v || !v.trim()) return 'Required';
        const trimmed = v.trim();
        if (!/^[a-z0-9._-]+$/i.test(trimmed)) return 'Only letters, numbers, ., _, - allowed';
        if (taken.includes(trimmed)) return `Already added: ${trimmed}`;
        return undefined;
      },
    }),
    'environment name',
  );
  const envName = String(name).trim();

  const envRoot = resolve(process.cwd(), envName);
  void envRoot; // (dest dir collision is checked just-in-time when we run)

  const gitCloneUrl = ensure(
    await text({
      message: `Git clone URL for "${envName}":`,
      placeholder: 'https://...@git.umbraco.io/...',
      validate: (v) => {
        if (!v || !v.trim()) return 'Required';
        const t = v.trim();
        if (!/^https:\/\//i.test(t)) return 'Must be an https:// URL';
        return undefined;
      },
    }),
    'git URL',
  );

  let db: Environment['db'];
  if (dbMode === 'sqlpackage') {
    const server = ensure(
      await text({
        message: `SQL server name for "${envName}":`,
        placeholder: '<server>.database.windows.net',
        validate: (v) => (v && v.trim() ? undefined : 'Required'),
      }),
      'sql server name',
    );
    const login = ensure(
      await text({
        message: `SQL login for "${envName}":`,
        validate: (v) => (v && v.trim() ? undefined : 'Required'),
      }),
      'sql login',
    );
    const passwd = ensure(
      await password({
        message: `SQL password for "${envName}":`,
        validate: (v) => (v ? undefined : 'Required'),
      }),
      'sql password',
    );
    const database = ensure(
      await text({
        message: `Database for "${envName}":`,
        validate: (v) => (v && v.trim() ? undefined : 'Required'),
      }),
      'database',
    );
    db = {
      server: String(server).trim(),
      login: String(login).trim(),
      password: String(passwd),
      database: String(database).trim(),
    };
  }

  const blobSasUrl = ensure(
    await text({
      message: `Shared Access Signature URL (SAS) for "${envName}" blob container:`,
      placeholder: 'https://<account>.blob.core.windows.net/<container>?sv=...',
      validate: (v) => {
        if (!v || !v.trim()) return 'Required';
        try {
          parseContainerSasUrl(v.trim());
          return undefined;
        } catch (err) {
          return (err as Error).message;
        }
      },
    }),
    'blob SAS URL',
  );

  const includeCache = ensure(
    await confirm({
      message: `Download the "cache" folder from the blob container for "${envName}"? (Umbraco's cache folder is usually not needed for archiving.)`,
      initialValue: false,
    }),
    'include-cache prompt',
  );

  return {
    name: envName,
    gitCloneUrl: String(gitCloneUrl).trim(),
    blobSasUrl: String(blobSasUrl).trim(),
    includeCacheFolder: Boolean(includeCache),
    db,
  };
}

function buildSummary(cfg: RunConfig): string {
  const lines: string[] = [];
  lines.push(pc.bold('Archive plan:'));
  lines.push(`  Base folder: ${cfg.baseDir}`);
  lines.push(`  DB mode:     ${cfg.dbMode}`);
  lines.push(`  Environments (${cfg.environments.length}):`);
  for (const env of cfg.environments) {
    lines.push(`    - ${pc.cyan(env.name)}`);
    lines.push(`        git:  ${env.gitCloneUrl}`);
    lines.push(`        sas:  ${redactSas(env.blobSasUrl)}`);
    lines.push(`        cache folder: ${env.includeCacheFolder ? 'included' : 'skipped'}`);
    if (env.db) {
      lines.push(`        db:   ${env.db.login}@${env.db.server}/${env.db.database}`);
    }
  }
  return lines.join('\n');
}

function redactSas(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : `${url.slice(0, q)}?<sas-token-redacted>`;
}

export function done(message: string): void {
  outro(pc.green(message));
}

export { existsSync };
