/**
 * Basit build script'i — kaynak dosyaları minify eder ve dist/ altına yazar.
 *
 * Çıktılar:
 *   dist/<dosya>.min.js            → her kaynak için ayrı minified sürüm
 *   dist/simple-locate.bundle.min.js → doğru yükleme sırasıyla birleşik tek dosya
 *
 * Kullanım:
 *   npm install
 *   npm run build
 */
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// Yükleme sırası önemli: low-pass → core → extended → panel
const FILES = [
    'low-pass-filter.js',
    'leaflet-simple-locate.js',
    'simple-locate-extended.js',
    'simple-locate-panel.js'
];

const pkg = require('./package.json');
const banner = `/*! ${pkg.name} v${pkg.version} | MIT | ${new Date().toISOString().slice(0, 10)} */`;

const terserOptions = {
    compress: { passes: 2, drop_debugger: true },
    mangle: true,
    format: { comments: false, preamble: banner }
};

async function build() {
    if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

    let bundleSources = {};
    let totalRaw = 0;
    let totalMin = 0;

    for (const file of FILES) {
        const srcPath = path.join(SRC_DIR, file);
        if (!fs.existsSync(srcPath)) {
            console.warn('⚠  atlandı (bulunamadı):', file);
            continue;
        }
        const code = fs.readFileSync(srcPath, 'utf8');
        bundleSources[file] = code;

        const result = await minify({ [file]: code }, terserOptions);
        if (result.error) throw result.error;

        const outName = file.replace(/\.js$/, '.min.js');
        const outPath = path.join(DIST_DIR, outName);
        fs.writeFileSync(outPath, result.code, 'utf8');

        const raw = Buffer.byteLength(code);
        const min = Buffer.byteLength(result.code);
        totalRaw += raw;
        totalMin += min;
        console.log(`✓ ${outName.padEnd(34)} ${(raw / 1024).toFixed(1)}KB → ${(min / 1024).toFixed(1)}KB`);
    }

    // Birleşik bundle
    const bundleResult = await minify(bundleSources, terserOptions);
    if (bundleResult.error) throw bundleResult.error;
    const bundlePath = path.join(DIST_DIR, 'simple-locate.bundle.min.js');
    fs.writeFileSync(bundlePath, bundleResult.code, 'utf8');
    const bundleSize = Buffer.byteLength(bundleResult.code);
    console.log(`✓ ${'simple-locate.bundle.min.js'.padEnd(34)} → ${(bundleSize / 1024).toFixed(1)}KB`);

    console.log(`\nToplam: ${(totalRaw / 1024).toFixed(1)}KB → ${(totalMin / 1024).toFixed(1)}KB ` +
        `(%${Math.round((1 - totalMin / totalRaw) * 100)} küçülme)`);
}

build().catch((e) => {
    console.error('Build hatası:', e);
    process.exit(1);
});
