import { mkdir, writeFile } from 'node:fs/promises'
import { build } from 'vite'

// Bundle one downloadable rehearsal, including the map and the chart, for offline judging.
const result = await build({
  base: './',
  publicDir: false,
  define: { 'import.meta.env.VITE_STANDALONE': JSON.stringify('true') },
  build: {
    write: false, cssCodeSplit: false, assetsInlineLimit: () => true, modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
const { output } = Array.isArray(result) ? result[0] : result
const html = output.find(item => item.type === 'asset' && item.fileName === 'index.html')
const script = output.find(item => item.type === 'chunk' && item.isEntry)
const style = output.find(item => item.type === 'asset' && item.fileName.endsWith('.css'))
if (!html || !script || !style) throw new Error('The standalone build is missing an entry asset.')
const page = String(html.source)
  .replace(/<script type="module"[^>]+src="[^"]+"[^>]*><\/script>/, () =>
    '<script type="module">' + script.code.replaceAll('</script', '<\\/script') + '</script>')
  .replace(/<link rel="stylesheet"[^>]*>/, () => '<style>' + style.source + '</style>')
await mkdir('dist-demo', { recursive:true })
await writeFile('dist-demo/CampaignTwin.html',page)
console.log('Offline rehearsal saved to dist-demo/CampaignTwin.html')
