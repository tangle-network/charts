# Chart ownership

This repository is the sole source and release owner of `@tangle-network/charts`.
The package name and static, React and CSS export paths remain unchanged.
The static root still has no runtime dependencies; React remains an optional peer.

## Source history

The initial history is a subtree extraction of `packages/charts` from
`tangle-network/brand` at `1dd43f03a4c89f87276a881841ea92a8a1dafcad`. The extraction keeps 63 package commits
and their historical chart assets. The original extracted base is
`d47c04e4183b2874c2180a6f437f5a9cd6017f76`; the publishable base is
`83c5ee0149c71101f6c0b45ee6abf0a09b58f349`. Its tree and the original package tree
are both `a534f745625694ae597c89dce37a1d2b0cc2e12d`. Existing evidence outside the
package stays in the original brand history and is linked there.

Five historical messages contained prohibited attribution or coauthor trailer
lines. Only those lines were removed from this unpublished extraction. Every
source tree, author and committer identity, date and parent sequence is retained;
the original brand history remains untouched. The [complete commit mapping](history-commit-map.txt)
and [63-commit verification](history-sanitization.json) record that correction.

The token generator reads the exact published `@tangle-network/brand@1.24.2`
stylesheet through its public export. This is a build-only dependency; token
ownership remains with brand. No token source or chart engine is duplicated.

## Release

Use the maintained Release workflow on main after the frozen Beelink type,
affected-test, packed-consumer and reviewed browser evidence gates pass. It
builds the npm-format package, creates an official GitHub release and retains
its SHA-256 digest. A matching existing release must have identical bytes; the
workflow refuses an attempt to overwrite a version with different bytes.
Consumers can pin the public GitHub tarball and its lockfile integrity.

Npm publishing remains off until the actual trusted publisher names this repo
and `release.yml`; only then enable `NPM_TRUSTED_PUBLISHER_ENABLED`. The workflow
publishes the same tested release tarball through OIDC. Existing published npm
versions and old source history remain available to their current consumers.

## Former source retirement

Remove the chart package and its browser producers from brand only after this
exact extracted source and its tested official release are available. That
removal PR must be draft until both facts are proved in its body. Brand's package
build and release loop then cease including charts. Retain historical evidence,
links and immutable published versions. Do not keep two active chart sources or
publishers after the migration.
