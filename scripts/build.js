const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const wwwDir = path.join(root, 'www');
const srcDir = path.join(root, 'src');
const ionicCss = path.join(root, 'node_modules', '@ionic', 'core', 'css');
const ionicDist = path.join(root, 'node_modules', '@ionic', 'core', 'dist');
const vendorIonic = path.join(wwwDir, 'vendor', 'ionic');

fs.rmSync(wwwDir, { recursive: true, force: true });
fs.cpSync(srcDir, wwwDir, { recursive: true });

fs.mkdirSync(vendorIonic, { recursive: true });
fs.cpSync(ionicCss, path.join(vendorIonic, 'css'), { recursive: true });
fs.cpSync(ionicDist, path.join(vendorIonic, 'dist'), { recursive: true });

console.log('Build complete: www/ (including local Ionic assets)');
