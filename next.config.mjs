import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  serverExternalPackages: ['pg', 'bcryptjs', 'exceljs'],
  outputFileTracingIncludes: { '/painel/campanhas/modelo': ['./node_modules/*/require.mjs'], '/painel/campanhas/nova': ['./node_modules/*/require.mjs'] },
  webpack(config) { config.resolve.alias['@'] = path.join(root, 'src'); return config; },
};
