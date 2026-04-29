import { existsSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { confirm, isCancel, log } from '@clack/prompts';
import { toolCacheDir } from '../util/cacheDir.js';
import { run } from '../util/runProcess.js';
import { downloadFile, extractArchive, cleanup } from './downloader.js';

const EXE = process.platform === 'win32' ? 'sqlpackage.exe' : 'sqlpackage';

function downloadUrl(): string {
  switch (process.platform) {
    case 'win32':
      return 'https://aka.ms/sqlpackage-windows';
    case 'darwin':
      return 'https://aka.ms/sqlpackage-macos';
    case 'linux':
      return 'https://aka.ms/sqlpackage-linux';
    default:
      throw new Error(`Unsupported platform for sqlpackage: ${process.platform}`);
  }
}

export async function findSqlpackage(): Promise<string | null> {
  const probe = await run(EXE, ['/version:true'], { inherit: false, capture: true }).catch(
    () => null,
  );
  if (probe && probe.code === 0) return EXE;

  const cached = join(toolCacheDir('sqlpackage'), EXE);
  if (existsSync(cached)) return cached;

  return null;
}

export async function offerSqlpackageDownload(): Promise<string | null> {
  const want = await confirm({
    message: 'sqlpackage is not installed. Download it into the per-user cache now?',
    initialValue: true,
  });
  if (isCancel(want) || !want) return null;

  const dir = toolCacheDir('sqlpackage');
  const url = downloadUrl();
  const archivePath = join(dir, 'sqlpackage.zip');

  log.step(`Downloading sqlpackage from ${url}`);
  await downloadFile(url, archivePath);
  log.step('Extracting sqlpackage...');
  await extractArchive(archivePath, dir);
  await cleanup(archivePath);

  const exe = join(dir, EXE);
  if (!existsSync(exe)) {
    throw new Error(`sqlpackage executable not found after extraction in ${dir}`);
  }
  if (process.platform !== 'win32') {
    await chmod(exe, 0o755);
  }
  log.success(`sqlpackage installed at ${exe}`);
  return exe;
}
