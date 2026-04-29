import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export function cacheRoot(): string {
  return join(homedir(), '.umbraco-cloud-archiver');
}

export function toolCacheDir(tool: string): string {
  const dir = join(cacheRoot(), 'bin', tool, `${process.platform}-${process.arch}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
