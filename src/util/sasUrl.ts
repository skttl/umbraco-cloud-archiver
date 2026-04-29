export interface ParsedSas {
  accountUrl: string;
  container: string;
  sasToken: string;
  containerUrlWithSas: string;
}

/**
 * Parse a container-level SAS URL such as:
 *   https://account.blob.core.windows.net/container?sv=...&sig=...
 */
export function parseContainerSasUrl(input: string): ParsedSas {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Not a valid URL: ${trimmed}`);
  }
  if (!url.hostname.endsWith('.blob.core.windows.net')) {
    throw new Error(`Expected a *.blob.core.windows.net host, got: ${url.hostname}`);
  }
  if (!url.search || !url.searchParams.has('sv')) {
    throw new Error('SAS URL is missing a SAS token (no `sv` query parameter).');
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error('SAS URL is missing the container name in the path.');
  }
  const container = segments[0]!;
  const accountUrl = `${url.protocol}//${url.host}`;
  const sasToken = url.search.startsWith('?') ? url.search.slice(1) : url.search;
  const containerUrlWithSas = `${accountUrl}/${container}${url.search}`;
  return { accountUrl, container, sasToken, containerUrlWithSas };
}
