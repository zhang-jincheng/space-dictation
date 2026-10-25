// Build editable SVG layouts around actual, unchanged screenshots and app icon.
// Usage: node scripts/build-showcase.mjs <output-folder>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('An output folder is required');
await mkdir(output, { recursive: true });
const uri = async name => { const bytes = await readFile(`docs/images/${name}`); const type = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpeg' : 'png'; return `data:image/${type};base64,` + bytes.toString('base64'); };
const icon = await uri('app-icon.png');
const home = await uri('app-home.png');
const words = await uri('app-wordbook.png');
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const text = (x,y,value,size=32,color='#172038',weight=600) => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${escape(value)}</text>`;
const wrap = (body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#ffda53"/><path d="M0 965L1920 850V1080H0Z" fill="#2857ea"/><g font-family="PingFang SC, Arial Unicode MS, sans-serif">${body}</g></svg>`;
const brand = label => `<image x="62" y="42" width="92" height="92" xlink:href="${icon}"/>` + text(176,96,'空格听写',48) + text(1790,93,label,25,'#172038',700);
// Crop only the macOS title bar; all app controls and content remain real pixels.
const screen = (source,x,y,w,h) => `<rect x="${x+10}" y="${y+12}" width="${w}" height="${h}" rx="18" fill="#172038"/><rect x="${x-3}" y="${y-3}" width="${w+6}" height="${h+6}" rx="18" fill="#172038"/><clipPath id="crop-${x}-${y}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16"/></clipPath><image x="${x}" y="${y-64*w/2240}" width="${w}" height="${1560*w/2240}" preserveAspectRatio="none" clip-path="url(#crop-${x}-${y})" xlink:href="${source}"/>`;
const card = (x,y,w,h) => `<rect x="${x+7}" y="${y+8}" width="${w}" height="${h}" rx="24" fill="#172038"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="white" stroke="#172038" stroke-width="3"/>`;
const footer = caption => text(65,1035,caption,25,'white',600);
const hero = brand('真实界面') + text(65,235,'你的节奏，',80) + text(65,335,'你来掌握。',80) + text(67,419,'按一次空格，只听一个新词。',33) + text(67,476,'写完，再按下一次。',33) + card(65,550,560,272) + text(98,612,'Space  下一词',37,'#2857ea',800) + text(98,676,'R          重读当前词',37,'#2857ea',800) + text(98,741,'听写时隐藏英文与释义',29) + screen(home,690,180,1160,775) + footer('macOS 实际应用截图 · 使用安装包真实图标 · 界面未重绘');
const features = brand('实际功能') + text(65,210,'词表、录音、听写，都在本机。',65) + screen(words,65,265,1080,721) + card(1240,285,610,635) + text(1276,360,'01 个人词表 / 四级 / 六级 / 雅思',30) + text(1276,445,'02 豆包与 ChatGPT 两套提示词',30) + text(1276,530,'03 标准发音提前下载',30) + text(1276,615,'04 缺少发音，可录自己的声音',30) + text(1276,700,'05 核对答案，错词单独重练',30) + text(1276,785,'06 亮色 / 暗色 / 跟随系统',30) + footer('画面为真实词表界面 · 个人录音从缺音列表或核对页进入');
const platforms = brand('跨平台') + text(65,215,'同一个听写节奏，两种安装包。',65) + screen(home,65,270,1050,701) + card(1175,300,670,560) + text(1215,385,'macOS · Apple 芯片',43,'#2857ea',800) + text(1215,449,'下载 .dmg，拖入“应用程序”',30) + text(1215,570,'Windows · x64',43,'#2857ea',800) + text(1215,634,'下载 -setup.exe，运行安装',30) + text(1215,746,'已安装 v1.3.0+ 可在应用内更新',27) + footer('图中为 macOS 真实界面 · 平台安装提示以实际系统为准');
const install = brand('安装指南') + text(65,214,'遇到打开拦截？先看完下方指南。',64) + card(65,268,860,430) + card(980,268,870,430) + text(103,337,'方法一 · 先在系统设置中打开',39,'#2857ea',800) + text(103,413,'1  打开“系统设置”',32) + text(103,478,'2  点击“隐私与安全性”',32) + text(103,543,'3  下滚到“安全性”',32) + text(103,608,'4  点击“仍要打开”，按提示确认',32) + text(1020,337,'方法二 · 再按条件使用终端命令',37,'#2857ea',800) + text(1020,413,'确认官方原包完整、仍受隔离拦截时',29) + text(1020,478,'打开下载页的安装帮助，点击复制按钮',29) + text(1020,543,'终端粘贴 → 回车 → 按提示输入密码',29) + text(1020,608,'图片不能点击复制，请用文字指南',29) + card(65,750,1785,151) + text(100,802,'仅针对已安装到“应用程序”的空格听写：',25) + text(100,860,'sudo xattr -rd com.apple.quarantine "/Applications/空格听写.app"',34,'#172038',600) + footer('正常打开无需命令 · 任一种成功后就停 · 不修复损坏或扫描病毒');
for (const [name,body] of Object.entries({'poster-hero':hero,'poster-features':features,'poster-platforms':platforms,'poster-mac-install-actual':install})) await writeFile(join(output,`${name}.svg`),wrap(body));
console.log('Created four SVG layouts using original screenshot and icon assets.');
