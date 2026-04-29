export type DbMode = 'skip' | 'sqlpackage';

export interface DbCredentials {
  server: string;
  login: string;
  password: string;
  database: string;
}

export interface Environment {
  name: string;
  gitCloneUrl: string;
  blobSasUrl: string;
  includeCacheFolder: boolean;
  db?: DbCredentials;
}

export interface RunConfig {
  baseDir: string;
  dbMode: DbMode;
  environments: Environment[];
}
