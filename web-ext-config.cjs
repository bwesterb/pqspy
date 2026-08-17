// Build tooling shouldn't end up inside the add-on itself. node_modules and
// *.zip are ignored by web-ext already.
const ignoreFiles = ['package.json', 'package-lock.json', 'release.sh', 'web-ext-config.cjs'];

// Neither should anything git doesn't track: scratch files, local repros and
// the like would otherwise be packaged up and shipped along.
try {
	const { execFileSync } = require('node:child_process');
	const untracked = execFileSync(
		'git', ['ls-files', '--others', '--directory'],
		{ encoding: 'utf8' },
	);
	for (const path of untracked.split('\n').filter(Boolean)) {
		ignoreFiles.push(path.endsWith('/') ? `${path}**` : path);
	}
} catch (e) {
	// Not a git checkout (or no git); fall back to the list above.
}

module.exports = { ignoreFiles };
