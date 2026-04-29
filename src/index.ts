#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, spinner } from '@clack/prompts';
import pc from 'picocolors';

import { runWizard, done } from './wizard.js';
import { envPaths, ensureDir } from './paths.js';
import { findAzcopy, offerAzcopyDownload } from './tools/azcopy.js';
import { findSqlpackage, offerSqlpackageDownload } from './tools/sqlpackage.js';
import { cloneGitRepo } from './steps/cloneGit.js';
import { downloadBlobs } from './steps/downloadBlobs.js';
import { exportDatabase, writeManualBackupNote } from './steps/exportDatabase.js';
import { writeArchiveReadme } from './steps/writeReadme.js';
import { run } from './util/runProcess.js';

function getToolVersion(): string {
  try {
    // dist/index.js → ../package.json
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return String(pkg.version ?? 'unknown');
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<void> {
  // Pre-flight: git is required.
  const gitProbe = await run('git', ['--version'], { inherit: false, capture: true }).catch(
    () => null,
  );
  if (!gitProbe || gitProbe.code !== 0) {
    console.error(pc.red('git is required but was not found in PATH. Install git and try again.'));
    process.exit(1);
  }

  const cfg = await runWizard();

  // Resolve sqlpackage if requested.
  let sqlpackagePath: string | null = null;
  if (cfg.dbMode === 'sqlpackage') {
    sqlpackagePath = await findSqlpackage();
    if (!sqlpackagePath) {
      sqlpackagePath = await offerSqlpackageDownload();
      if (!sqlpackagePath) {
        throw new Error('sqlpackage is required for the chosen DB mode but was not provided.');
      }
    } else {
      log.info(`Using sqlpackage at: ${sqlpackagePath}`);
    }
  }

  // Resolve azcopy (or fall back to SDK).
  let azcopyPath: string | null = await findAzcopy();
  if (!azcopyPath) {
    azcopyPath = await offerAzcopyDownload();
  }
  if (azcopyPath) {
    log.info(`Using azcopy at: ${azcopyPath}`);
  } else {
    log.info('No azcopy available - falling back to @azure/storage-blob SDK.');
  }

  // Run per environment, fail-fast.
  const startedAt = new Date().toISOString();
  for (const env of cfg.environments) {
    const paths = envPaths(cfg.baseDir, env.name);

    if (existsSync(paths.root)) {
      throw new Error(
        `Output folder for environment "${env.name}" already exists: ${paths.root}\nRemove or rename it and try again.`,
      );
    }
    ensureDir(paths.root);

    log.message(pc.bgBlue(pc.white(` ${env.name} `)));

    const s = spinner();
    s.start(`Cloning git for ${env.name}`);
    try {
      await cloneGitRepo(env.gitCloneUrl, paths);
      s.stop(`Git cloned for ${env.name}`);
    } catch (err) {
      s.stop(pc.red(`Git clone failed for ${env.name}`));
      throw err;
    }

    s.start(`Downloading blobs for ${env.name}`);
    try {
      await downloadBlobs(env.blobSasUrl, paths.blobs, {
        azcopyPath,
        includeCacheFolder: env.includeCacheFolder,
      });
      s.stop(`Blobs downloaded for ${env.name}`);
    } catch (err) {
      s.stop(pc.red(`Blob download failed for ${env.name}`));
      throw err;
    }

    if (cfg.dbMode === 'sqlpackage' && env.db && sqlpackagePath) {
      s.start(`Exporting database for ${env.name}`);
      try {
        await exportDatabase(sqlpackagePath, env.db, paths.database);
        s.stop(`Database exported for ${env.name}`);
      } catch (err) {
        s.stop(pc.red(`Database export failed for ${env.name}`));
        throw err;
      }
    } else {
      await writeManualBackupNote(paths.database, env.name);
      log.info(`Wrote manual-backup note in ${paths.database}`);
    }
  }

  // Write archive metadata + README.
  const finishedAt = new Date().toISOString();
  const toolVersion = getToolVersion();
  const meta = {
    tool: 'umbraco-cloud-archiver',
    toolVersion,
    startedAt,
    finishedAt,
    baseDir: cfg.baseDir,
    dbMode: cfg.dbMode,
    environments: cfg.environments.map((e) => ({
      name: e.name,
      gitCloneUrl: e.gitCloneUrl,
      // Strip SAS token from metadata file.
      blobAccountAndContainer: e.blobSasUrl.split('?')[0],
      cacheFolderIncluded: e.includeCacheFolder,
      databaseExported: Boolean(e.db && cfg.dbMode === 'sqlpackage'),
    })),
  };
  await writeFile(join(cfg.baseDir, 'archive-info.json'), JSON.stringify(meta, null, 2), 'utf8');
  await writeArchiveReadme(cfg, { startedAt, finishedAt, toolVersion });

  done(`Archive complete → ${cfg.baseDir}`);
}

main().catch((err) => {
  console.error('\n' + pc.red('Archive failed:'));
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
