import {satteri} from '@astrojs/markdown-satteri';
import {articleLinkTargets} from './src/lib/article-links.mjs';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { loadEnv } from 'vite';
const env=loadEnv(process.env.NODE_ENV || 'development',process.cwd(),'CMS_');
const preview=new URL(env.CMS_PUBLIC_ORIGIN || process.env.CMS_PUBLIC_ORIGIN || 'https://t9k80gqr-4321.asse.devtunnels.ms');
export default defineConfig({site:'https://bcift.co.id',output:'server',devToolbar:{enabled:false},markdown:{processor:satteri({hastPlugins:[articleLinkTargets()]})},security:{allowedDomains:[{hostname:'bcift.co.id',protocol:'https'},{hostname:'127.0.0.1',protocol:'http'},{hostname:'localhost',protocol:'http'},{hostname:preview.hostname,protocol:preview.protocol.slice(0,-1)}]},adapter:node({mode:'standalone',bodySizeLimit:8*1024*1024}),trailingSlash:'always'});
