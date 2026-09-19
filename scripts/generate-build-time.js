import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const now = new Date();

// Formatter with Asia/Tehran timezone to ensure live Iran local time
const formatter = new Intl.DateTimeFormat('fa-IR', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Tehran',
});

const parts = formatter.formatToParts(now);
const p = {};
for (const part of parts) {
  p[part.type] = part.value;
}

// Exact RTL Persian order: [weekday] [day] [month] [year] ساعت [hour]:[minute]
// Example: پنجشنبه ۲۶ شهریور ۱۴۰۵ ساعت ۱۶:۰۰
const formatted = `${p.weekday} ${p.day} ${p.month} ${p.year} ساعت ${p.hour}:${p.minute}`;

const envContent = `VITE_BUILD_TIME="${formatted}"\n`;
fs.writeFileSync(path.resolve(__dirname, '../.env.local'), envContent, 'utf8');

console.log(`✅ زمان ساخت با موفقیت ذخیره شد: ${formatted}`);
