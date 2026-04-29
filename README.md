# umbraco-cloud-archiver

Wizard-based CLI for archiving an [Umbraco Cloud](https://umbraco.com/products/umbraco-cloud/) project to local disk before shutting it down.

For each environment (e.g. `live`, `stage`, `dev`) the tool archives:

- **Git repository** - both a `--mirror` clone (full history) and a working copy you can browse
- **Blob storage** - the contents of the environment's media blob container, via a SAS URL
- **Database** *(optional)* - a `.bacpac` export via [`sqlpackage`](https://learn.microsoft.com/en-us/sql/tools/sqlpackage/sqlpackage-download), or a manual instructions file if you prefer to grab the backup from the Umbraco Cloud portal yourself

## Usage

Requires **Node.js 20+** and **git** in your PATH.

```sh
npx umbraco-cloud-archiver@latest
```

The tool walks you through a wizard:

1. Pick an output base folder.
2. Choose database backup mode (skip / use `sqlpackage`).
3. For each environment: name, git clone URL, blob SAS URL, optionally DB credentials. Loop "add another?" until done.
4. Confirm and run.

It will offer to download `azcopy` and `sqlpackage` into a per-user cache (`~/.umbraco-cloud-archiver/bin/`) when not found in PATH.

## Output structure

```
<base>/
  live/
    git-mirror/       # bare clone, full history
    repo/             # working copy (browseable)
    blobs/            # blob storage contents
    database/
      <dbname>.bacpac           # if sqlpackage was used
      MANUAL_BACKUP_REQUIRED.txt  # otherwise
  stage/
    ...
  archive-info.json   # metadata about this run
```

## Prerequisites

- Node.js 20+
- `git` available in PATH
- For DB export: SQL Server account with permissions to export, or grab the backup manually from the Cloud portal
- A container-level SAS URL per environment (Umbraco Cloud → environment → Storage)

## Releasing (maintainers)

CI is GitHub Actions:

- `ci.yml` runs build/typecheck on push and PR.
- `release.yml` runs on push to `main`. It uses npm **Trusted Publishing** (OIDC, no `NPM_TOKEN` secret) and only publishes if the version in `package.json` is not already on npm.

To release: bump the `version` in `package.json` in a commit, merge to `main`, done.

One-time setup on npmjs.com: enable trusted publishing for this package, pointing at this repo + `release.yml`.

## License

MIT
