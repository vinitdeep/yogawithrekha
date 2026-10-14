// GitHub Pages has no server rewrites: serving index.html as 404.html lets deep links
// such as /yogawithrekha/courses load the app, which then routes on the client.
import { copyFileSync } from 'node:fs';
copyFileSync('dist/index.html', 'dist/404.html');
console.log('SPA fallback: dist/404.html written');
