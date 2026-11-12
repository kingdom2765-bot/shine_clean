(() => {
  const source = document.querySelector('#info-data');
  if (!source) return;
  const { posts, page: initialPage, pageSize } = JSON.parse(source.textContent);
  const siteRoot = new URL('./', document.querySelector('script[src*="info.js"]').src);
  const localPath = path => new URL(path.replace(/^\//,''), siteRoot).pathname;
  const form = document.querySelector('#info-filters');
  const list = document.querySelector('#info-list');
  const pagination = document.querySelector('#info-pagination');
  let page = initialPage;
  const query = new URLSearchParams(location.search);
  for (const field of ['q','topic','region','specialty']) form.elements[field].value = query.get(field) || '';
  const node = (tag,text,className) => { const element=document.createElement(tag); element.textContent=text; if(className)element.className=className; return element; };
  function render(sync=false) {
    const selection=Object.fromEntries(new FormData(form));
    const needle=selection.q.trim().toLocaleLowerCase();
    const filtered=posts.filter(post=>(!needle || `${post.title} ${post.summary}`.toLocaleLowerCase().includes(needle)) && ['topic','region','specialty'].every(key=>!selection[key] || post[key]===selection[key]));
    const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
    page=Math.max(1,Math.min(page,pageCount));
    list.replaceChildren(...filtered.slice((page-1)*pageSize,page*pageSize).map(post=>{
      const article=node('article','','info-card'); const tags=node('div','','info-tags');
      tags.append(...post.tags.map(tag=>node('span',tag)));
      const heading=node('h2'); const link=node('a',post.title+' ↗'); link.href=localPath(post.path); heading.append(link);
      const stamp=node(post.date?'time':'span',post.date?post.date.replaceAll('-','.'):'검수 중',post.date?'':'info-draft-label');
      if(post.date)stamp.dateTime=post.date;
      article.append(tags,heading,node('p',post.summary)); if(post.date || post.draft)article.append(stamp); return article;
    }));
    document.querySelector('#info-result').textContent=`전체 ${posts.length}건 · 검색 결과 ${filtered.length}건`;
    document.querySelector('#info-empty').hidden=filtered.length!==0;
    pagination.replaceChildren();
    const params=new URLSearchParams();
    for(const [key,value] of Object.entries(selection))if(value.trim())params.set(key,value.trim());
    for(let index=1;index<=pageCount && pageCount>1;index++){
      const link=node('a',String(index)); link.href=`${localPath('/info/'+(index>1?'page/'+index+'/':''))}${params.size?'?'+params:''}`;
      if(index===page)link.setAttribute('aria-current','page');
      link.addEventListener('click',event=>{event.preventDefault();page=index;render(true);list.scrollIntoView({block:'start'});});pagination.append(link);
    }
    if(sync)history.replaceState(null,'',`${localPath('/info/'+(page>1?'page/'+page+'/':''))}${params.size?'?'+params:''}`);
  }
  form.addEventListener('submit',event=>{event.preventDefault();page=1;render(true);});
  form.addEventListener('input',()=>{page=1;render(true);});
  form.addEventListener('change',()=>{page=1;render(true);});
  function reset(){form.reset();page=1;render(true);}
  form.addEventListener('reset',()=>queueMicrotask(()=>{page=1;render(true);}));
  document.querySelector('#info-reset').addEventListener('click',reset);
  // Keep every filter usable without hiding an already selected query on mobile.
  if(matchMedia('(max-width:767px)').matches && !query.size)document.querySelector('.info-filter-panel').open=false;
  render();
})();
