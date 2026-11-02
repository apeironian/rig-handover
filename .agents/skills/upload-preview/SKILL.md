---
name: upload-preview
description: Put one HTML preview file on this lane's public static host (Azure Storage static website) under an HTTPS link, upload over it, and take it down again, with the az CLI. Use for a plan's "Preview for review" and its clean-up (ADR 0003).
---

# upload-preview

One command up, one command down. The host is the static website of Azure storage account
`rigpreview7k2m9` (resource group `rig-preview`), signed in through `az login`. Links look like
`https://rigpreview7k2m9.z9.web.core.windows.net/<name>.html`.

Not GitHub Pages or any git repo: a page pushed to a repo stays in its history, so a marker could
never be taken off again (ADR 0003).

## Before you run it

- A human says yes before every upload: the first one, and every upload over it (e.g. the one
  without the marker). Say what, where, who can see it (anyone with the link) and how to undo it.
- Save the page with a command, outside the repo (previews never go in the repo, issues or chat):

  ```sh
  curl -sS -o <scratch>/digest-2026-10-28.html http://localhost:8787/digest/2026-10-28
  ```

- Check the file: the banner shows the marker you expect (or "no marker set" for clean-up), and
  nothing but the template's sample data is in it.

## Put (and upload over)

```sh
az storage blob upload --account-name rigpreview7k2m9 --auth-mode key --container-name '$web' \
  --name <name>.html --file <file> --content-type "text/html; charset=utf-8" \
  --content-cache-control "no-cache" --overwrite true --only-show-errors --output none
```

The link is `https://rigpreview7k2m9.z9.web.core.windows.net/<name>.html`. Upload over the same
`--name` to replace the page at the same link. `no-cache` makes the new copy show at once.

Check it from outside: `curl -sS https://rigpreview7k2m9.z9.web.core.windows.net/<name>.html`
and grep for the banner.

## Take down

```sh
az storage blob delete --account-name rigpreview7k2m9 --auth-mode key --container-name '$web' \
  --name <name>.html --delete-snapshots include --only-show-errors --output none
```

The link then returns 404. Everything at once: `az group delete --name rig-preview` (asks first).

## Flags

Read `az storage blob upload --help` / `az storage blob delete --help`; don't guess them.
