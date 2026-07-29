// Build tooling shouldn't end up inside the add-on itself. node_modules and
// *.zip are ignored by web-ext already.
module.exports = {
	ignoreFiles: ['package.json', 'package-lock.json', 'release.sh', 'web-ext-config.cjs'],
};
