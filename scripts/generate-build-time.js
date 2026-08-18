import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const now = new Date();

const formatter = new Intl.DateTimeFormat('fa-IR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tehran',
});

const formatted = formatter.format(now);

const envContent = `VITE_BUILD_TIME="${formatted}"\n`;
fs.writeFileSync(path.resolve(__dirname, '../.env.local'), envContent, 'utf8');

console.log(`✅ زمان ساخت ذخیره شد: ${formatted}`);