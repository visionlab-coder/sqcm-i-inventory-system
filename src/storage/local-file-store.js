const fs = require('node:fs/promises');
const path = require('node:path');

class LocalFileStore {
  constructor(root) {
    this.root = path.resolve(root);
  }

  resolve(storageKey) {
    if (!/^[a-zA-Z0-9/_-]+\.[a-z0-9]+$/.test(storageKey)) throw new Error('Invalid storage key');
    const target = path.resolve(this.root, storageKey);
    if (target === this.root || !target.startsWith(`${this.root}${path.sep}`)) throw new Error('Storage path escaped its root');
    return target;
  }

  async write(storageKey, content) {
    const target = this.resolve(storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, { flag: 'wx', mode: 0o600 });
    return target;
  }

  async readPath(storageKey) {
    const target = this.resolve(storageKey);
    await fs.access(target);
    return target;
  }

  async removeNew(storageKey) {
    await fs.unlink(this.resolve(storageKey));
  }
}

module.exports = { LocalFileStore };
