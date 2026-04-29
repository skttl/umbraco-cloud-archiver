import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunConfig } from '../config.js';

export interface ReadmeInfo {
  startedAt: string;
  finishedAt: string;
  toolVersion: string;
}

/**
 * Write a human-readable README.md at the root of the archive describing
 * what was archived, from where, and how to use each part.
 */
export async function writeArchiveReadme(cfg: RunConfig, info: ReadmeInfo): Promise<void> {
  const md = buildMarkdown(cfg, info);
  await writeFile(join(cfg.baseDir, 'README.md'), md, 'utf8');
}

function buildMarkdown(cfg: RunConfig, info: ReadmeInfo): string {
  const envSections = cfg.environments.map((env) => renderEnv(env, cfg)).join('\n\n');

  return `# Umbraco Cloud project archive

This folder is an offline archive of an Umbraco Cloud project, created with
[\`umbraco-cloud-archiver\`](https://www.npmjs.com/package/umbraco-cloud-archiver).

- **Archived:** ${info.startedAt} → ${info.finishedAt}
- **Archiver version:** ${info.toolVersion}
- **Database backup mode:** ${cfg.dbMode === 'sqlpackage' ? '`sqlpackage` (.bacpac export)' : 'manual (not included in this archive)'}
- **Environments:** ${cfg.environments.map((e) => `\`${e.name}\``).join(', ')}

## Folder layout

Each environment has its own top-level folder:

\`\`\`
${cfg.environments.map((e) => `${e.name}/
  git-mirror/    # bare git clone (full history, all branches and tags)
  repo/          # normal working copy, browseable
  blobs/         # contents of the blob storage container${e.includeCacheFolder ? '' : " (cache/ folder excluded)"}
  database/      # ${e.db ? `${e.db.database}.bacpac` : 'MANUAL_BACKUP_REQUIRED.txt (fetch manually from the Cloud portal)'}`).join('\n')}
\`\`\`

A machine-readable \`archive-info.json\` sits next to this README.

${envSections}

## How to use each part

### \`git-mirror/\` (full history, bare repo)

This is a complete mirror of the Umbraco Cloud git repository. It contains
every branch and tag but has no working tree. Use it when you need the full
history or to re-hydrate a working copy:

\`\`\`sh
git clone <env>/git-mirror my-working-copy
cd my-working-copy
git log --all --oneline
\`\`\`

### \`repo/\` (working copy)

A regular git clone you can open directly in your editor or Explorer. Run
\`npm install\` / \`dotnet restore\` as you would for the original project.

### \`blobs/\` (media files)

The contents of the Umbraco Cloud blob storage container for this
environment - typically the site's media files.${cfg.environments.some((e) => !e.includeCacheFolder) ? "\n\nSome environments were archived without the \`cache/\` subfolder to save space." : ''}

To serve these from a restored Umbraco instance, upload them to your new
storage account (or place them in \`~/media\` for the file-system provider)
preserving relative paths.

### \`database/\` (.bacpac) *if exported*

A SQL Server DACPAC/BACPAC export. Restore with \`sqlpackage\`:

\`\`\`sh
sqlpackage /Action:Import \\
  /SourceFile:<env>/database/<dbname>.bacpac \\
  /TargetServerName:<your-server> \\
  /TargetDatabaseName:<new-db-name> \\
  /TargetUser:<user> /TargetPassword:<pwd>
\`\`\`

…or import it through Azure Data Studio / SSMS (\`Import Data-tier Application\`).

### \`MANUAL_BACKUP_REQUIRED.txt\` *if DB export was skipped*

Follow the instructions inside the file to download the database backup from
the Umbraco Cloud portal and place it in the same \`database/\` folder.

## Restoring the site somewhere else

Rough outline:

1. Create a fresh Umbraco project (or clone the \`repo/\` working copy).
2. Configure its connection string to point at a freshly imported database
   from one of the \`.bacpac\` files in this archive.
3. Point the media/blob storage at the contents of the corresponding
   \`blobs/\` folder.
4. Run the site - it should come up identical to the archived environment.
`;
}

function renderEnv(env: RunConfig['environments'][number], cfg: RunConfig): string {
  const lines: string[] = [];
  lines.push(`## Environment: \`${env.name}\``);
  lines.push('');
  lines.push(`- **Git clone URL:** \`${env.gitCloneUrl}\``);
  const blobBase = env.blobSasUrl.split('?')[0];
  lines.push(`- **Blob container:** \`${blobBase}\` *(SAS token redacted)*`);
  lines.push(`- **Cache folder included:** ${env.includeCacheFolder ? 'yes' : 'no'}`);
  if (cfg.dbMode === 'sqlpackage' && env.db) {
    lines.push(
      `- **Database:** \`${env.db.database}\` on \`${env.db.server}\` (login: \`${env.db.login}\`) → exported to \`${env.name}/database/${env.db.database}.bacpac\``,
    );
  } else {
    lines.push(
      `- **Database:** not exported automatically - see \`${env.name}/database/MANUAL_BACKUP_REQUIRED.txt\``,
    );
  }
  return lines.join('\n');
}
