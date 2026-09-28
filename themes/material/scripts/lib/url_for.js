'use strict';

function urlFor(path) {
  if (typeof path !== 'string') return path;
  if (/^(#|\/\/|https?:)/.test(path)) return path;

  var root = (this.config && this.config.root) || '/';
  if (root.slice(-1) !== '/') root += '/';
  return root + path.replace(/^\//, '');
}

module.exports = urlFor;
