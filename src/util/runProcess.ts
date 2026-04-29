import { spawn, type SpawnOptions } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions extends SpawnOptions {
  /** If true, stdout/stderr are streamed to the parent terminal. */
  inherit?: boolean;
  /** If true, captured output is also returned (works with inherit=false). */
  capture?: boolean;
}

export function run(command: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const { inherit = true, capture = false, ...spawnOpts } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      ...spawnOpts,
    });
    let stdout = '';
    let stderr = '';
    if (!inherit && capture) {
      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));
    }
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

export async function runOrThrow(
  command: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  const result = await run(command, args, opts);
  if (result.code !== 0) {
    const detail = result.stderr || result.stdout || '';
    throw new Error(
      `Command failed (${result.code}): ${command} ${args.join(' ')}${detail ? `\n${detail}` : ''}`,
    );
  }
  return result;
}
