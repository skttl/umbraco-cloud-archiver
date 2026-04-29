export type DbMode = 'skip' | 'sqlpackage';

export interface DbCredentials {
  server: string;
  database: string;
  user: string;
  password: string;
}

export interface Environment {
  name: string;
  gitCloneUrl: string;
  blobSasUrl: string;
  db?: DbCredentials;
}

export interface RunConfig {
  baseDir: string;
  dbMode: DbMode;
  environments: Environment[];
}
