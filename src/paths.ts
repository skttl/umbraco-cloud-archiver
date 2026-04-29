import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface EnvPaths {
  root: string;
  gitMirror: string;
  repo: string;
  blobs: string;
  database: string;
}

export function envPaths(baseDir: string, envName: string): EnvPaths {
  const root = join(baseDir, envName);
  return {
    root,
    gitMirror: join(root, 'git-mirror'),
    repo: join(root, 'repo'),
    blobs: join(root, 'blobs'),
    database: join(root, 'database'),
  };
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}
