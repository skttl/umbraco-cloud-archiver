import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { log } from '@clack/prompts';
import { runOrThrow } from '../util/runProcess.js';
import type { DbCredentials } from '../config.js';

export async function exportDatabase(
  sqlpackagePath: string,
  creds: DbCredentials,
  destDir: string,
): Promise<string> {
  await mkdir(destDir, { recursive: true });
  const target = join(destDir, `${creds.database}.bacpac`);
  log.step(`Exporting database '${creds.database}' from '${creds.server}' → ${target}`);

  await runOrThrow(sqlpackagePath, [
    '/Action:Export',
    `/SourceServerName:${creds.server}`,
    `/SourceDatabaseName:${creds.database}`,
    `/SourceUser:${creds.login}`,
    `/SourcePassword:${creds.password}`,
    `/TargetFile:${target}`,
    '/SourceTrustServerCertificate:true',
  ]);

  return target;
}

export async function writeManualBackupNote(destDir: string, envName: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const note = `Manual database backup required for environment "${envName}"
==========================================================

This archive was created without an automated database export.

To complete the archive, retrieve a database backup from the Umbraco Cloud portal:

  1. Sign in at https://www.umbraco.io/projects
  2. Open this project, then the "${envName}" environment.
  3. Go to the "Database" tab.
  4. Request / download the latest .bacpac (or SQL backup).
  5. Place the downloaded file next to this note in:
       ${destDir}

Created: ${new Date().toISOString()}
`;
  await writeFile(join(destDir, 'MANUAL_BACKUP_REQUIRED.txt'), note, 'utf8');
}
