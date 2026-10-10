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

export function normalizePastedHtml(markup) {
  if(typeof markup!=='string' || markup.length>250000) throw Error('Nội dung dán không hợp lệ hoặc quá dài.');
  const body=new DOMParser().parseFromString(markup,'text/html').body;
  const allowed=new Set('p h2 h3 h4 strong em u s ul ol li blockquote pre code br hr a img figure figcaption table thead tbody tr th td div span aside'.split(' '));
  const blockTags=new Set('p h1 h2 h3 h4 h5 h6 ul ol li blockquote pre table thead tbody tr td th figure div section article aside'.split(' '));
  const discarded=new Set(['script','style','iframe','object','embed','form','svg','canvas','video','audio','meta','link','template']);
  const attrs={a:new Set(['href','target','rel']),img:new Set(['src','alt','width','height','loading']),th:new Set(['colspan','rowspan','scope']),td:new Set(['colspan','rowspan']),ol:new Set(['start'])};
  const changes=[];
  const report=message=>changes.push(message);
  const safeClass=value=>/^(?:[a-zA-Z][\w-]{0,63})(?:\s+[a-zA-Z][\w-]{0,63}){0,9}$/.test(value);
  function styleInfo(node,tag) {
    const style=node.getAttribute('style');
    if(!style)return {marks:[],align:''};
    const marks=new Set(),unsupported=[];
    let align='';
    for(const declaration of style.split(';').map(value=>value.trim()).filter(Boolean)){
      const colon=declaration.indexOf(':');
      if(colon<1){unsupported.push(declaration);continue;}
      const property=declaration.slice(0,colon).trim().toLowerCase();
      const value=declaration.slice(colon+1).trim().toLowerCase();
      if(property==='font-weight' && /^(bold|bolder|[6-9]00)$/.test(value))marks.add('strong');
      else if(property==='font-style' && /^(italic|oblique)$/.test(value))marks.add('em');
      else if(['text-decoration','text-decoration-line'].includes(property)){
        if(/\bunderline\b/.test(value))marks.add('u');
        if(/\bline-through\b/.test(value))marks.add('s');
        if(!/^(none|underline|line-through|overline|underline\s+line-through|line-through\s+underline)$/.test(value))unsupported.push(declaration);
      } else if(property==='text-align' && ['left','center','right'].includes(value) && !['span','a','strong','em','u','s'].includes(tag))align=`align-${value}`;
      else if(!((property==='font-weight'&&/^(normal|400|500)$/.test(value))||(property==='font-style'&&value==='normal')||(property.startsWith('text-decoration')&&value==='none')))unsupported.push(declaration);
    }
    const mapped=[...marks].map(mark=>({strong:'bold',em:'italic',u:'underline',s:'strikethrough'}[mark]));
    if(mapped.length)report(`Mapped inline style to semantic formatting: ${mapped.join(', ')}.`);
    if(align)report(`Mapped text alignment to ${align} class.`);
    if(unsupported.length)report(`Removed unsupported inline CSS: ${[...new Set(unsupported.map(value=>value.split(':',1)[0].trim()))].join(', ')}.`);
    if(style&&!mapped.length&&!align&&!unsupported.length)report('Removed redundant inline style.');
    return {marks:[...marks],align};
  }
  function wrap(node,marks) {
    for(const mark of marks){
      const wrapper=document.createElement(mark);
      wrapper.append(node);
      node=wrapper;
    }
    return node;
  }
  function convert(node) {
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
    if(node.nodeType===Node.COMMENT_NODE){report('Removed an HTML comment.');return document.createDocumentFragment();}
    if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
    const original=node.localName.toLowerCase();
    if(discarded.has(original)){report(`Removed unsupported <${original}> content.`);return document.createDocumentFragment();}
    let tag=original;
    if(tag==='b')tag='strong';
    if(tag==='i')tag='em';
    if(/^h[1-6]$/.test(tag)&&tag!=='h2'&&tag!=='h3'&&tag!=='h4'){tag='p';report(`Converted <${original}> to a paragraph.`);}
    if(tag==='font'){report('Removed unsupported font formatting while preserving text.');const fragment=document.createDocumentFragment();[...node.childNodes].forEach(child=>fragment.append(convert(child)));return fragment;}
    const style=styleInfo(node,tag);
    if(tag==='div'||tag==='section'||tag==='article'){
      const children=[...node.childNodes],hasBlock=children.some(child=>child.nodeType===Node.ELEMENT_NODE&&blockTags.has(child.localName));
      if(tag==='div'&&!hasBlock){
        const paragraph=document.createElement('p');children.forEach(child=>paragraph.append(convert(child)));
        if(style.align)paragraph.setAttribute('class',style.align);
        report('Converted a plain-text wrapper to a paragraph.');
        return paragraph;
      }
      const fragment=document.createDocumentFragment();children.forEach(child=>fragment.append(convert(child)));
      if(node.attributes.length)report(`Removed unsupported attributes from <${tag}>.`);
      if(style.align){const wrapper=document.createElement('div');wrapper.setAttribute('class',style.align);wrapper.append(fragment);report(`Preserved text alignment on a block wrapper.`);return wrapper;}
      return fragment;
    }
    if(!allowed.has(tag)){
      report(`Unwrapped unsupported <${tag}> while preserving its contents.`);
      const fragment=document.createDocumentFragment();[...node.childNodes].forEach(child=>fragment.append(convert(child)));return fragment;
    }
    const element=document.createElement(tag);
    const classNames=[];
    let invalidLink=false,invalidImage=false;
    for(const attribute of node.attributes){
      const name=attribute.name.toLowerCase(),value=attribute.value;
      if(name==='style')continue;
      if(name.startsWith('on')){report(`Removed event attribute ${name}.`);continue;}
      if(name==='class'){
        if(safeClass(value))classNames.push(value);
        else report(`Removed invalid class from <${tag}>.`);
        continue;
      }
      if(name==='title'){element.setAttribute(name,value);continue;}
      if(!attrs[tag]?.has(name)){report(`Removed unsupported attribute ${name} from <${tag}>.`);continue;}
      if(name==='href'||name==='src'){
        try{safeUrl(value,name==='src');element.setAttribute(name,value);}
        catch{
          report(`Removed unsafe ${name} from <${tag}>.`);
          if(tag==='a')invalidLink=true;
          if(tag==='img')invalidImage=true;
        }
        continue;
      }
      if(['width','height','rowspan','colspan','start'].includes(name)&&(!/^\d{1,4}$/.test(value)||Number(value)>2500)){
        report(`Removed invalid ${name} from <${tag}>.`);continue;
      }
      if(name==='target'&&!['_blank','_self'].includes(value)){report('Removed invalid link target.');continue;}
      if(name==='rel'&&!/^[a-z\s-]{1,60}$/i.test(value)){report('Removed invalid link relation.');continue;}
      if(name==='loading'&&!['lazy','eager'].includes(value)){report('Removed invalid image loading mode.');continue;}
      if(name==='scope'&&!['row','col'].includes(value)){report('Removed invalid table-header scope.');continue;}
      element.setAttribute(name,value);
    }
    if(style.align)classNames.push(style.align);
    if(classNames.length)element.setAttribute('class',[...new Set(classNames.flatMap(value=>value.split(/\s+/)))].join(' '));
    if(tag==='img'&&!element.hasAttribute('alt')){element.setAttribute('alt','');report('Added an empty alt attribute to an image; review its description.');}
    if(tag==='a'&&element.getAttribute('target')==='_blank'&&!element.hasAttribute('rel'))element.setAttribute('rel','noopener noreferrer');
    [...node.childNodes].forEach(child=>element.append(convert(child)));
    if(invalidLink){const fragment=document.createDocumentFragment();while(element.firstChild)fragment.append(element.firstChild);return wrap(fragment,style.marks);}
    if(invalidImage){const fallback=document.createTextNode(element.getAttribute('alt')||'');return wrap(fallback,style.marks);}
    return wrap(element,style.marks);
  }
  const output=document.createElement('div');
  [...body.childNodes].forEach(node=>output.append(convert(node)));
  if(output.innerHTML!==markup&&!changes.length)report('Normalized the HTML structure and attribute serialization.');
  return {html:output.innerHTML,changes:[...new Set(changes)]};
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
