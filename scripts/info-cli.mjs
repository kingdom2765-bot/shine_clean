import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importManuscript, encodePost, loadPosts, validatePosts, articleHref } from './info-content.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [command, ...args] = process.argv.slice(2);
const option = key => { const index = args.indexOf(key); return index < 0 ? null : args[index + 1]; };
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
if (command === 'import') {
  const sourcePath = args.find(value => !value.startsWith('--'));
  if (!sourcePath) throw new Error('원고 파일 경로가 필요합니다.');
  const source = await readFile(resolve(sourcePath), 'utf8');
  const posts = importManuscript(source, { expected: Number(option('--count') || 10), provisionalTitles: args.includes('--provisional-titles') });
  const prefix = option('--id-prefix');
  if (prefix) {
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(prefix)) throw new Error('--id-prefix는 영문 소문자·숫자·하이픈 2~31자로 지정하세요.');
    posts.forEach(post=>{post.id=post.id.replace(/^wn/,prefix);});
  }
  const current = await loadPosts(root);
  await validatePosts([...current, ...posts], root);
  const directory = resolve(root, 'content/info');
  await mkdir(directory, { recursive: true });
  for (const post of posts) {
    try { await access(resolve(directory, `${post.id}.md`)); throw new Error(`기존 ID 파일과 충돌: ${post.id}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const post of posts) await writeFile(resolve(directory, `${post.id}.md`), encodePost(post), { flag: 'wx' });
  const log = { imported_at: new Date().toISOString(), count: posts.length, source_format: /^####\s+\d+\./m.test(source) ? 'numbered-headings' : 'metadata-boundaries', posts: posts.map(({ body_markdown, ...metadata }) => ({ ...metadata, canonical_path: articleHref(metadata), body_length: body_markdown.length })) };
  await mkdir(resolve(root,'content/imports'), { recursive:true });
  const batch = new Date().toISOString().replace(/[:.]/g,'-');
  await writeFile(resolve(root, `content/imports/${batch}.md`), source);
  await writeFile(resolve(root, `content/imports/${batch}.json`), JSON.stringify(log,null,2)+'\n');
  console.log(`초안 ${posts.length}건을 가져왔습니다. 원문·변환 로그: content/imports/${batch}.*`);
} else if (command === 'validate') {
  const posts = await loadPosts(root);
  const warnings = await validatePosts(posts, root);
  console.log(JSON.stringify({ total: posts.length, published: posts.filter(post=>post.status==='published').length, warnings }, null, 2));
} else if (command === 'approve' || command === 'publish') {
  if (!args.includes('--reviewed')) throw new Error('원고·실제 운영방식·임시 제목·누락 자료 검수를 마친 후 --reviewed를 명시하세요.');
  const ids = (option('--ids') || '').split(',').filter(Boolean);
  if (!ids.length) throw new Error('--ids wn-001,wn-002 형태로 승인 대상을 명시하세요.');
  const posts = await loadPosts(root);
  if (ids.some(id=>!posts.some(post=>post.id===id))) throw new Error('없는 게시글 ID가 있습니다.');
  const date = option('--date') || today();
  if (date !== today()) throw new Error('첫 발행일에는 한국 시간의 실제 오늘 날짜를 사용하세요.');
  const updated = posts.map(post=>ids.includes(post.id) ? { ...post, status: command==='publish' ? 'published' : 'approved', reviewed_at:today(), review_warnings:[], published_at: command==='publish' ? post.published_at || date : post.published_at, updated_at:post.published_at ? today() : null } : post);
  if (command === 'publish' && ids.some(id=>posts.find(post=>post.id===id).status!=='approved')) throw new Error('먼저 approve 명령으로 검수 승인한 글만 발행할 수 있습니다.');
  await validatePosts(updated,root);
  for (const post of updated.filter(post=>ids.includes(post.id))) await writeFile(resolve(root,`content/info/${post.id}.md`),encodePost(post));
  console.log(`${ids.length}건 ${command==='publish'?'발행 상태':'승인 상태'}로 변경했습니다. 웹 배포는 수행하지 않았습니다.`);
} else throw new Error('사용법: info-cli.mjs import <원고> [--count 10] [--provisional-titles] | validate | approve/publish --ids wn-001 --reviewed');
