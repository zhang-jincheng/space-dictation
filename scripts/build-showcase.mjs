// Rebuild the two installation posters without changing the approved hero/feature posters.
// Usage: node scripts/build-showcase.mjs <output-folder>
// Render each SVG with Chrome: --headless=new --hide-scrollbars --window-size=1920,1080
// --force-device-scale-factor=1 --screenshot=<output.png> file://<absolute-path.svg>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const output = process.argv[2];
if (!output) throw new Error('An output folder is required');
await mkdir(output, { recursive: true });

const uri = async name => `data:image/png;base64,${(await readFile(`docs/images/${name}`)).toString('base64')}`;
const home = await uri('app-home-v1.4.0.png');
const icon = await uri('app-icon.png');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const text = (x, y, value, size = 32, color = '#1a1a1a', weight = 500, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${escape(value)}</text>`;
const blue = '#1783ff';
const sub = '#65686e';

const wrap = (body, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
<defs>
  <radialGradient id="glow"><stop stop-color="#cee5fb" stop-opacity=".48"/><stop offset="1" stop-color="#fbfaf9" stop-opacity="0"/></radialGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#566a7e" flood-opacity=".12"/></filter>
  <clipPath id="screen"><rect x="130" y="326" width="928" height="646" rx="16"/></clipPath>
</defs>
<rect width="1920" height="1080" fill="#fbfaf9"/>
<ellipse cx="1730" cy="120" rx="700" ry="520" fill="url(#glow)"/>
<ellipse cx="150" cy="1040" rx="600" ry="360" fill="url(#glow)" opacity=".35"/>
<g fill="none" stroke="#cfe2f5" stroke-width="1.2" opacity=".56"><circle cx="1780" cy="10" r="184"/><circle cx="1780" cy="10" r="215"/><circle cx="1780" cy="10" r="246"/></g>
<rect x="38" y="38" width="1844" height="1004" rx="28" fill="none" stroke="#dedfdf" stroke-width="1"/>
<g font-family="PingFang SC, -apple-system, sans-serif">
  <rect x="125" y="106" width="62" height="50" rx="15" fill="#f2f8ff" stroke="${blue}" stroke-width="2"/>
  <circle cx="156" cy="123" r="3.5" fill="${blue}"/><path d="M141 142H171" stroke="${blue}" stroke-width="2.5" stroke-linecap="round"/>
  ${text(205, 147, '空格听写', 46, '#1a1a1a', 700)}
  ${text(1792, 139, label, 23, '#69717a', 500, 'text-anchor="end" letter-spacing="2"')}
  ${body}
</g></svg>`;

const card = (x, y, w, h, fill = '#ffffff') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${fill}" fill-opacity=".94" stroke="#e3e5e7" stroke-width="1.2" filter="url(#shadow)"/>`;
const step = (number, y, value) =>
  `${text(164, y, number, 27, blue, 650)}${text(222, y, value, 32, '#252629', 500)}`;

const install = `
${text(125, 242, '遇到打开拦截？', 68, '#1a1a1a', 700)}
${text(128, 289, '先确认官方来源，再按顺序尝试。', 29, sub, 500)}
${card(124, 326, 810, 420)}${card(970, 326, 826, 420)}
${text(162, 373, '方法一', 24, blue, 700)}
${text(162, 423, '先在系统设置中打开', 38, '#1a1a1a', 650)}
<image x="854" y="351" width="48" height="48" href="${icon}"/>
${text(878, 421, '应用图标', 16, '#797d83', 500, 'text-anchor="middle"')}
${step('01', 489, '先尝试打开应用')}
${step('02', 548, '系统设置 → 隐私与安全性')}
${step('03', 607, '向下找到“安全性”区域')}
${step('04', 666, '点击“仍要打开”，按提示确认')}
${text(1010, 373, '方法二', 24, blue, 700)}
${text(1010, 423, '条件满足后再使用终端命令', 36, '#1a1a1a', 650)}
${text(1010, 483, '方法一未解决，且官方原包完整；', 30, '#252629', 500)}
${text(1010, 530, '确认仍因下载隔离标记受阻时：', 30, '#252629', 500)}
${text(1010, 591, '从安装帮助页复制完整命令，', 30, '#252629', 500)}
${text(1010, 638, '在终端粘贴并回车，按提示输入密码。', 30, '#252629', 500)}
${text(1010, 694, '图片不能点击复制，请使用文字指南。', 25, sub, 500)}
${card(124, 771, 1672, 132, '#ffffff')}
${text(162, 816, '仅针对已放入“应用程序”的空格听写：', 25, sub, 500)}
${text(162, 870, 'sudo xattr -rd com.apple.quarantine "/Applications/空格听写.app"', 34, '#1a1a1a', 600, 'font-family="Arial, PingFang SC, sans-serif"')}
${text(128, 960, '正常打开无需命令  ·  任一种成功后即停  ·  命令不修复损坏或扫描病毒', 26, '#4c5159', 500)}
${text(128, 1003, '若明确提示恶意软件或“将损坏你的电脑”，请停止打开并反馈。', 24, '#52575e', 500)}`;

const platforms = `
${text(125, 242, '同一个听写节奏，两种安装包。', 66, '#1a1a1a', 700)}
${text(128, 290, '选择对应系统，安装后即可开始。', 29, sub, 500)}
${card(116, 312, 956, 677)}
<image x="130" y="326" width="928" height="646" preserveAspectRatio="xMidYMid meet" clip-path="url(#screen)" href="${home}"/>
${text(129, 1015, 'v1.4.0 界面预览', 23, '#70767d', 500)}
${card(1100, 330, 696, 235)}
${text(1140, 390, '01  /  macOS', 23, blue, 700, 'letter-spacing="1"')}
${text(1140, 443, 'Apple 芯片', 40, '#1a1a1a', 650)}
${text(1140, 498, '下载 .dmg，打开安装包', 30, '#383a3e', 500)}
${text(1140, 540, '拖入“应用程序”', 30, '#383a3e', 500)}
${card(1100, 592, 696, 235)}
${text(1140, 652, '02  /  Windows', 23, blue, 700, 'letter-spacing="1"')}
${text(1140, 705, 'Windows x64', 40, '#1a1a1a', 650)}
${text(1140, 760, '下载 -setup.exe', 30, '#383a3e', 500)}
${text(1140, 802, '运行安装程序', 30, '#383a3e', 500)}
<rect x="1100" y="854" width="696" height="118" rx="20" fill="#eaf3ff" stroke="#d5e7fb"/>
${text(1139, 902, '已安装 v1.3.0+', 28, '#0962c9', 650)}
${text(1139, 946, '可在应用内确认更新', 28, '#374251', 500)}
${text(1794, 1015, '系统提示以实际平台为准', 23, '#70767d', 500, 'text-anchor="end"')}`;

for (const [name, body, label] of [
  ['poster-mac-install-actual', install, 'MAC / 安装帮助'],
  ['poster-platforms', platforms, 'MACOS / WINDOWS'],
]) {
  await writeFile(join(output, `${name}.svg`), wrap(body, label));
}
console.log('Created the two installation poster SVGs; hero and feature posters were not changed.');
