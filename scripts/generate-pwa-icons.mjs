import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('public/icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function createSvg(size, isMaskable = false) {
  const padding = isMaskable ? size * 0.15 : size * 0.08;
  const radius = isMaskable ? 0 : size * 0.22;
  const bubbleScale = (size - padding * 2) / 24;

  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#00a884" />
        <stop offset="100%" stop-color="#006d5b" />
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="${size * 0.02}" stdDeviation="${size * 0.03}" flood-color="#000000" flood-opacity="0.3" />
      </filter>
    </defs>
    
    <!-- Background -->
    <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bgGrad)" />
    
    <!-- WhatsApp Speech Bubble Icon -->
    <g transform="translate(${padding}, ${padding}) scale(${bubbleScale})" filter="url(#shadow)">
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        fill="#ffffff"
      />
      <!-- Inner Chat Dots / Lines -->
      <path
        d="M8.5 10.5h7M8.5 13.5h4.5"
        stroke="#008069"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </g>
  </svg>
  `;
}

async function generate() {
  console.log('Generating PWA and Apple Touch icons...');

  // 192x192
  await sharp(Buffer.from(createSvg(192)))
    .png()
    .toFile(path.join(outDir, 'icon-192.png'));
  console.log('✓ Generated icon-192.png');

  // 512x512
  await sharp(Buffer.from(createSvg(512)))
    .png()
    .toFile(path.join(outDir, 'icon-512.png'));
  console.log('✓ Generated icon-512.png');

  // 512x512 Maskable
  await sharp(Buffer.from(createSvg(512, true)))
    .png()
    .toFile(path.join(outDir, 'icon-maskable-512.png'));
  console.log('✓ Generated icon-maskable-512.png');

  // 180x180 Apple Touch Icon (square, iOS auto-rounds it)
  await sharp(Buffer.from(createSvg(180, true)))
    .png()
    .toFile(path.join(outDir, 'apple-touch-icon.png'));
  console.log('✓ Generated apple-touch-icon.png');
}

generate().catch(console.error);
