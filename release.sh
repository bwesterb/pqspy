#!/bin/sh
#
# Submits the current version to addons.mozilla.org for review.
#
# Credentials come from the macOS Keychain. Create an API key on
#
#     https://addons.mozilla.org/en-US/developers/addon/api/key/
#
# and store it (the secret is shown only once; add -U to replace it later):
#
#     security add-generic-password -s pqspy-amo -a api-key -w 'user:12345:67'
#     security add-generic-password -s pqspy-amo -a api-secret -w 'THE SECRET'
#
# They're passed on through the environment, so they don't show up in the
# process list.

set -eu

version=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' manifest.json)

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
	echo "Working tree is dirty; commit before releasing." >&2
	exit 1
fi

if ! git rev-parse -q --verify "refs/tags/$version" >/dev/null; then
	echo "No tag $version; tag the release commit before releasing." >&2
	exit 1
fi

if [ "$(git rev-parse "$version^{commit}")" != "$(git rev-parse HEAD)" ]; then
	echo "Tag $version doesn't point at HEAD." >&2
	exit 1
fi

keychain() {
	if ! security find-generic-password -s pqspy-amo -a "$1" -w 2>/dev/null; then
		echo "No AMO $1 in the Keychain; see the top of this script." >&2
		exit 1
	fi
}

WEB_EXT_API_KEY=$(keychain api-key)
WEB_EXT_API_SECRET=$(keychain api-secret)
export WEB_EXT_API_KEY WEB_EXT_API_SECRET

echo "Submitting PQSpy $version to AMO ..."

# Listed versions go to human review, so there is nothing to wait around for.
exec npx web-ext sign --channel=listed --approval-timeout=0
