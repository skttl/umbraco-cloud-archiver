import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

/** Download a URL (following redirects) to a local file. */
export async function downloadFile(url: string, destFile: string): Promise<void> {
  await mkdir(dirname(destFile), { recursive: true });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  // Node's WHATWG Readable from fetch is convertible via Readable.fromWeb
  const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  await pipeline(nodeStream, createWriteStream(destFile));
}

/**
 * Extract a zip or tar.gz archive to destDir using OS-native tools.
 * - Windows: PowerShell Expand-Archive (zip) / tar (tgz, available on modern Windows)
 * - Unix: unzip / tar
 */
export async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const lower = archivePath.toLowerCase();
  if (lower.endsWith('.zip')) {
    if (process.platform === 'win32') {
      await runChild('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force`,
      ]);
    } else {
      await runChild('unzip', ['-o', '-q', archivePath, '-d', destDir]);
    }
    return;
  }
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    await runChild('tar', ['-xzf', archivePath, '-C', destDir]);
    return;
  }
  throw new Error(`Unsupported archive format: ${archivePath}`);
}

function runChild(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

export async function cleanup(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export { join };
