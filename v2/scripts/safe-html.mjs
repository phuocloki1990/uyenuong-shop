// Shared by content validation, Cloudflare Admin API, and the static-page renderer.
// Fail closed: reject unsupported markup, rather than silently stripping custom HTML.
const TAGS = new Set('p h2 h3 h4 strong b em i u s ul ol li blockquote pre code br hr a img figure figcaption table thead tbody tr th td div span aside'.split(' '));
const VOID = new Set(['br','hr','img']);
const GLOBAL = new Set(['class','title']);
const ATTRS = {
  a:new Set(['href','target','rel']),
  img:new Set(['src','alt','width','height','loading']),
  th:new Set(['colspan','rowspan','scope']),
  td:new Set(['colspan','rowspan']),
  ol:new Set(['start'])
};
const escAttr = s => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const decodeRefs = value => value.replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,v)=>String.fromCodePoint(v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v))).replace(/&(colon|tab|newline|amp);/gi,(_,v)=>({colon:':',tab:'\t',newline:'\n',amp:'&'}[v.toLowerCase()]));
function safeUrl(value, image=false) {
  const url = decodeRefs(value).trim();
  if (/[\x00-\x1f\x7f\\]/.test(url)) throw Error('URL chứa ký tự không an toàn');
  if (image) {
    if (/^\/assets\/images\/[a-z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(url) && !url.includes('..')) return url;
    if (/^https:\/\/[^\s<>"']+$/i.test(url)) return url;
  } else if (/^\/(?!\/)[a-z0-9_/?#%=&.+~-]*$/i.test(url) && !url.includes('..')) return url;
  else if (/^(https:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:\+?[\d\s-]+)$/i.test(url)) return url;
  throw Error('URL không được hỗ trợ; dùng đường dẫn nội bộ hoặc HTTPS');
}
function attrsToString(input, tag) {
  let rest = input;
  const results=[]; const seen=new Set();
  while(rest.trim()) {
    rest=rest.trimStart();
    const m=/^([a-z][a-z0-9-]*)\s*=\s*("[^"]*"|'[^']*')/i.exec(rest);
    if(!m) throw Error('Thuộc tính HTML không hợp lệ hoặc chưa đặt trong dấu nháy');
    const name=m[1].toLowerCase(), val=m[2].slice(1,-1);
    if(seen.has(name)) throw Error(`Thuộc tính ${name} bị lặp`);
    if(!GLOBAL.has(name) && !ATTRS[tag]?.has(name)) throw Error(`Thuộc tính ${name} không được hỗ trợ ở <${tag}>`);
    seen.add(name);
    let normalized=val;
    if(name==='href'||name==='src') normalized=safeUrl(val,name==='src');
    if(name==='class' && !/^(?:[a-zA-Z][\w-]{0,63})(?:\s+[a-zA-Z][\w-]{0,63}){0,9}$/.test(val)) throw Error('CSS class không hợp lệ');
    if(['width','height','rowspan','colspan','start'].includes(name) && (!/^\d{1,4}$/.test(val)||Number(val)>2500)) throw Error(`Thuộc tính ${name} không hợp lệ`);
    if(name==='target' && !['_blank','_self'].includes(val)) throw Error('target không hợp lệ');
    if(name==='rel' && !/^[a-z\s-]{1,60}$/i.test(val)) throw Error('rel không hợp lệ');
    if(name==='loading' && !['lazy','eager'].includes(val)) throw Error('loading không hợp lệ');
    if(name==='scope' && !['row','col'].includes(val)) throw Error('scope không hợp lệ');
    results.push(`${name}="${escAttr(normalized)}"`);
    rest=rest.slice(m[0].length);
  }
  if(tag==='a' && seen.has('target') && !seen.has('rel')) results.push('rel="noopener noreferrer"');
  if(tag==='img' && !seen.has('alt')) throw Error('Ảnh trong nội dung phải có Alt');
  return results.length?' '+results.join(' '):'';
}
export function validateContentHtml(value, field='content_html', {allowEmpty=false}={}) {
  if(typeof value!=='string' || value.length>250000) throw Error(`${field}: nội dung không hợp lệ hoặc quá dài`);
  if(!value.trim()) {if(allowEmpty) return ''; throw Error(`${field}: bắt buộc có nội dung`);}
  const stack=[];let out='',at=0;
  while(at<value.length){
    if(value[at]!=='<') {
      const end=value.indexOf('<',at); const text=value.slice(at,end<0?value.length:end);
      // '&lt;' is safe text; browser decodes it as text, not as markup.
      if(/\x00/.test(text)) throw Error(`${field}: chứa ký tự NUL`);
      out+=text; at+=text.length;continue;
    }
    let end=at+1,quote='';
    for(;end<value.length;end++) {const ch=value[end];if(quote){if(ch===quote)quote='';} else if(ch==='"'||ch==="'")quote=ch;else if(ch==='>')break;else if(ch==='<')throw Error(`${field}: thẻ HTML lồng không hợp lệ`);}
    if(end>=value.length||quote) throw Error(`${field}: thẻ HTML chưa đóng`);
    const source=value.slice(at+1,end),close=/^\s*\//.test(source);
    const match=/^\s*(\/)?([a-z][\w-]*)([\s\S]*?)\s*(\/)?\s*$/i.exec(source);
    if(!match) throw Error(`${field}: thẻ HTML không được hỗ trợ`);
    const tag=match[2].toLowerCase();if(!TAGS.has(tag)||tag==='h1') throw Error(`${field}: thẻ <${tag}> không được hỗ trợ (H1 lấy từ tiêu đề)`);
    if(close){if(match[3].trim()||match[4]||stack.pop()!==tag) throw Error(`${field}: đóng thẻ </${tag}> sai thứ tự`);out+=`</${tag}>`;}
    else {out+=`<${tag}${attrsToString(match[3],tag)}>`;if(!VOID.has(tag)){if(match[4])throw Error(`${field}: thẻ tự đóng không hợp lệ`);stack.push(tag);}}
    at=end+1;
  }
  if(stack.length) throw Error(`${field}: còn thẻ chưa đóng: ${stack.join(', ')}`);
  return out;
}
export function imagePathsFromHtml(value) {
  const matches=[...String(value||'').matchAll(/<img\s[^>]*src="(\/assets\/images\/[^"]+)"/gi)];
  return matches.map(m=>m[1]);
}
