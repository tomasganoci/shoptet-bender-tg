#!/usr/bin/env node
/** @format */

import command from './cli.js';
import { config } from './config.js';
import fs from 'fs';
import path from 'path';
import BrowserSyncPlugin from 'browser-sync-webpack-plugin';
import webpack from 'webpack';
import getWebpackConfig from './webpack.config.js';

command.parse(process.argv);

const options = command.opts();

const rootDir = process.cwd();

const sourceFolder = path.join(rootDir, config.sourceFolder ?? 'src');
const outputFolder = path.join(rootDir, options.folder ?? config.outputFolder);

const includesRegex = /<!-- (?:service\s\d+\(\d+\)|api\s\d+\(\d+\)|project)\shtml\s+code\s+(?:header|footer) -->/gi;
const includesCodeRegex = new RegExp(includesRegex.source + '[\\s\\S]*?(?=' + includesRegex.source + '|$)', 'g');

const blankModeStyle = {
  match: /<link\s+href="https:\/\/cdn\.myshoptet\.com\/prj\/[^"]+"[^>]*>/gi,
  fn: function () {
    return '';
  },
};

const blankModeScript = {
  match: /<script\s+src="https:\/\/cdn\.myshoptet\.com\/prj\/[^"]+"[^>]*>/gi,
  fn: function () {
    return '';
  },
};

// Odstranění konkrétních <script>/<link> tagů podle části jejich URL.
// Na rozdíl od removeHeaderIncludes/removeFooterIncludes nemaže celý include blok
// (v tom bývají i doplňky třetích stran), ale jen vyjmenované soubory — typicky
// produkční bundle projektu, aby v Benderu neběžel souběžně s lokálním buildem
// a nezdvojoval DOM úpravy.
const removeAssetsPatterns = options.removeAssets || config.removeAssets || [];

const removeAssets = {
  match: /<script\b[^>]*\bsrc="[^"]*"[^>]*>\s*<\/script>|<link\b[^>]*\bhref="[^"]*"[^>]*>/gi,
  fn: function (req, res, match) {
    return removeAssetsPatterns.some(pattern => match.includes(pattern)) ? '' : match;
  },
};

const headerIncludes = {
  match: /(?<=<head[\s\S]*?<!--\sUser include\s-->)[\s\S]*?(?=<!--\s\/User include\s-->)/i,
  fn: function (req, res, match) {
    // Remove includes from the header
    const includes = options.removeHeaderIncludes || config.removeHeaderIncludes || [];
    const matchedServices = match.match(includesCodeRegex);
    if (matchedServices) {
      match = matchedServices
        .filter(service => {
          return !includes.some(removedService => service.includes(removedService));
        })
        .join('');
    }

    // Add custom includes to the footer
    const headerMarkup =
      (fs.existsSync(outputFolder + '/scripts.header.js') ? '<script src="/scripts.header.js"></script>' : '') +
      (fs.existsSync(outputFolder + '/styles.header.css') ? '<link rel="stylesheet" href="/styles.header.css">' : '');
    return match + headerMarkup;
  },
};

const footerIncludes = {
  match:
    /(?<=<body[\s\S]*?<!--\sUser include\s-->\s*<div class="container">)[\s\S]*?(?=<\/div>\s*<!--\s\/User include\s-->)/i,
  fn: function (req, res, match) {
    // Remove includes from the footer
    const includes = options.removeFooterIncludes || config.removeFooterIncludes || [];
    const matchedServices = match.match(includesCodeRegex);
    if (matchedServices) {
      match = matchedServices
        .filter(service => {
          return !includes.some(removedService => service.includes(removedService));
        })
        .join('');
    }

    // Add custom includes to the footer
    const footerMarkup =
      (fs.existsSync(outputFolder + '/scripts.footer.js') ? '<script src="/scripts.footer.js"></script>' : '') +
      (fs.existsSync(outputFolder + '/styles.footer.css') ? '<link rel="stylesheet" href="/styles.footer.css">' : '');
    return footerMarkup + match;
  },
};

// Bender se běžně vystavuje ven přes tunel (u nás Cloudflare tunel na
// projekt.tomasganoci.cz), takže se k náhledu dostanou i roboti vyhledávačů.
// Náhled je kopie klientova e-shopu, do indexu se dostat nesmí: duplikuje obsah
// produkce a odhaluje rozpracované úpravy. Každá odpověď proto nese noindex,
// robots.txt zakazuje celý náhled a do <head> jde meta robots jako pojistka
// pro případ, že by se hlavička cestou ztratila.
const ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

// Hlavička na všechno, co projde proxy (HTML e-shopu).
const proxyNoindex = proxyRes => {
  proxyRes.headers['x-robots-tag'] = ROBOTS_TAG;
};

// Hlavička na všechno ostatní, co bender servíruje sám (soubory z outputFolder),
// a vlastní robots.txt místo toho ze Shoptetu, který crawl povoluje.
const noindexMiddleware = (req, res, next) => {
  res.setHeader('X-Robots-Tag', ROBOTS_TAG);
  if ((req.url || '').split('?')[0] === '/robots.txt') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(ROBOTS_TXT);
    return;
  }
  next();
};

// Shoptet posílá vlastní <meta name="robots" content="index,follow">. Google sice
// při konfliktu bere přísnější direktivu, ale je čistší originál zahodit
// a vložit jediný vlastní hned za <head>.
const metaRobotsSmazat = {
  match: /<meta\s+name="robots"[^>]*>/gi,
  fn: function () {
    return '';
  },
};

const metaRobotsVlozit = {
  match: /<head\b[^>]*>/i,
  fn: function (req, res, match) {
    return match + '<meta name="robots" content="' + ROBOTS_TAG + '">';
  },
};

const rewriteRules = [
  { ...metaRobotsSmazat },
  { ...metaRobotsVlozit },
  { ...headerIncludes },
  { ...footerIncludes },
  { ...(options.blankMode && blankModeStyle) },
  { ...(options.blankMode && blankModeScript) },
  { ...(removeAssetsPatterns.length && removeAssets) },
];

const bsPlugin = [
  new BrowserSyncPlugin({
    proxy: { target: options.remote ?? config.defaultUrl, proxyRes: [proxyNoindex] },
    middleware: [noindexMiddleware],
    serveStatic: [outputFolder],
    serveStaticOptions: {
      setHeaders: res => res.setHeader('X-Robots-Tag', ROBOTS_TAG),
    },
    rewriteRules: rewriteRules.filter(value => Object.keys(value).length !== 0),
    port: 3010,
    notify: options.notify,
    open: false,
  }),
];

const baseWebpackConfig = getWebpackConfig('development');

const webpackConfig = {
  watch: options.watch,
  ...baseWebpackConfig,
  plugins: [...bsPlugin, ...baseWebpackConfig.plugins],
};

webpack(webpackConfig, (err, stats) => {
  if (err || stats.hasErrors()) {
    console.log('Webpack errors', err);
  }
  console.log(stats.toString({ colors: true }));
});
