import { existsSync } from 'node:fs';
import { readdir, chmod, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { confirm, isCancel, log } from '@clack/prompts';
import { toolCacheDir } from '../util/cacheDir.js';
import { run } from '../util/runProcess.js';
import { downloadFile, extractArchive, cleanup } from './downloader.js';

const EXE = process.platform === 'win32' ? 'azcopy.exe' : 'azcopy';

function downloadUrl(): { url: string; archive: string } {
  switch (process.platform) {
    case 'win32':
      return { url: 'https://aka.ms/downloadazcopy-v10-windows', archive: 'azcopy.zip' };
    case 'darwin':
      return {
        url:
          process.arch === 'arm64'
            ? 'https://aka.ms/downloadazcopy-v10-mac-arm64'
            : 'https://aka.ms/downloadazcopy-v10-mac',
        archive: 'azcopy.zip',
      };
    case 'linux':
      return { url: 'https://aka.ms/downloadazcopy-v10-linux', archive: 'azcopy.tar.gz' };
    default:
      throw new Error(`Unsupported platform for azcopy: ${process.platform}`);
  }
}

/** Resolve azcopy executable: PATH first, then cache. Returns null if missing. */
export async function findAzcopy(): Promise<string | null> {
  // Try PATH
  const probe = await run(EXE, ['--version'], { inherit: false, capture: true }).catch(
    () => null,
  );
  if (probe && probe.code === 0) return EXE;

  // Try cache
  const cached = await locateInCache();
  if (cached) return cached;

  return null;
}

async function locateInCache(): Promise<string | null> {
  const dir = toolCacheDir('azcopy');
  const direct = join(dir, EXE);
  if (existsSync(direct)) return direct;
  // Microsoft's archive contains a versioned subfolder, e.g. azcopy_windows_amd64_10.x.x/azcopy.exe
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const candidate = join(dir, e.name, EXE);
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** Prompt user, then download azcopy into the cache. Returns the executable path. */
export async function offerAzcopyDownload(): Promise<string | null> {
  const want = await confirm({
    message: 'azcopy is not installed. Download it into the per-user cache now?',
    initialValue: true,
  });
  if (isCancel(want) || !want) return null;

  const dir = toolCacheDir('azcopy');
  const { url, archive } = downloadUrl();
  const archivePath = join(dir, archive);

  log.step(`Downloading azcopy from ${url}`);
  await downloadFile(url, archivePath);
  log.step('Extracting azcopy...');
  await extractArchive(archivePath, dir);
  await cleanup(archivePath);

  // Flatten: if executable lives in a versioned subfolder, leave it there - locateInCache handles both.
  const located = await locateInCache();
  if (!located) {
    throw new Error(`azcopy executable not found after extraction in ${dir}`);
  }
  if (process.platform !== 'win32') {
    await chmod(located, 0o755);
  }
  log.success(`azcopy installed at ${located}`);
  return located;
}

export { rename };
