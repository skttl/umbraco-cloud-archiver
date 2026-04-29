import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { log } from '@clack/prompts';
import { ContainerClient } from '@azure/storage-blob';
import { runOrThrow } from '../util/runProcess.js';
import { parseContainerSasUrl } from '../util/sasUrl.js';

export interface BlobOptions {
  azcopyPath: string | null;
  /** If false, blobs under the top-level `cache/` folder are skipped. */
  includeCacheFolder: boolean;
}

const CACHE_PREFIX = 'cache/';

export async function downloadBlobs(
  sasUrl: string,
  destDir: string,
  opts: BlobOptions,
): Promise<void> {
  await mkdir(destDir, { recursive: true });

  if (opts.azcopyPath) {
    log.step(
      `Copying blobs with azcopy → ${destDir}${opts.includeCacheFolder ? '' : ' (skipping cache/)'}`,
    );
    const source = appendStarToContainer(sasUrl);
    const args = ['copy', source, destDir, '--recursive=true'];
    if (!opts.includeCacheFolder) {
      args.push('--exclude-path=cache');
    }
    await runOrThrow(opts.azcopyPath, args);
    return;
  }

  log.step(
    `Copying blobs with @azure/storage-blob SDK → ${destDir}${
      opts.includeCacheFolder ? '' : ' (skipping cache/)'
    }`,
  );
  await downloadWithSdk(sasUrl, destDir, opts.includeCacheFolder);
}

function appendStarToContainer(sasUrl: string): string {
  // Insert "/*" before the query string so azcopy treats it as "all blobs in container".
  const qIdx = sasUrl.indexOf('?');
  if (qIdx === -1) return `${sasUrl}/*`;
  return `${sasUrl.slice(0, qIdx)}/*${sasUrl.slice(qIdx)}`;
}

async function downloadWithSdk(
  sasUrl: string,
  destDir: string,
  includeCacheFolder: boolean,
): Promise<void> {
  const parsed = parseContainerSasUrl(sasUrl);
  const containerClient = new ContainerClient(parsed.containerUrlWithSas);

  let count = 0;
  let skipped = 0;
  let bytes = 0;
  for await (const blob of containerClient.listBlobsFlat()) {
    if (!includeCacheFolder && blob.name.toLowerCase().startsWith(CACHE_PREFIX)) {
      skipped++;
      continue;
    }
    const blobClient = containerClient.getBlobClient(blob.name);
    const target = join(destDir, ...blob.name.split('/'));
    await mkdir(dirname(target), { recursive: true });

    const dl = await blobClient.download();
    if (!dl.readableStreamBody) {
      // Empty / placeholder blob - just create empty file.
      await writeFile(target, '');
    } else {
      // In Node, readableStreamBody is already a NodeJS.ReadableStream.
      await pipeline(dl.readableStreamBody as NodeJS.ReadableStream, createWriteStream(target));
    }
    count++;
    bytes += blob.properties.contentLength ?? 0;
    if (count % 50 === 0) {
      log.info(`  ${count} blobs (${formatBytes(bytes)}) downloaded so far...`);
    }
  }
  const skippedMsg = skipped > 0 ? ` (${skipped} skipped from cache/)` : '';
  log.success(`  ${count} blobs (${formatBytes(bytes)}) downloaded${skippedMsg}.`);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
