// Full product CMS write endpoint. Does not change legacy text-only content/save.
// Requires Cloudflare Access on /admin/* and same-origin POST.
import { resolveContentBranch } from '../../../../scripts/content-branch.mjs';
import { checkProductPayload, checkProductReferences, FILE_SLUG } from '../../../../scripts/product-admin.mjs';

const OWNER='phuocloki1990', REPO='uyenuong-shop';
const ROOT=`https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const headers=token=>({Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'User-Agent':'uyenuong-shop-admin','X-GitHub-Api-Version':'2022-11-28'});
const ghUrl=(path,branch)=>ROOT+path+(branch?'?ref='+encodeURIComponent(branch):'');
function decoded(content){const bytes=Uint8Array.from(atob(content.replace(/\s/g,'')),c=>c.charCodeAt(0));return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
function encoded(content){const bytes=new TextEncoder().encode(content);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
function responseError(message,status,extra={}){return json({success:false,message,...extra},status);}
async function ghGet(path,branch,token,allowMissing=false){
  const response=await fetch(ghUrl(path,branch),{headers:headers(token),cache:'no-store'});
  if(response.status===404&&allowMissing)return null;
  if(!response.ok)throw Object.assign(new Error(response.status===404?'Nội dung không tồn tại trên nhánh này.':'Không đọc được dữ liệu GitHub.'),{status:response.status===404?404:502});
  return response.json();
}
async function ghDir(kind,branch,token){
  const result=await ghGet(`content/${kind}`,branch,token);
  if(!Array.isArray(result))throw Object.assign(new Error('Danh sách nội dung GitHub không hợp lệ.'),{status:502});
  return result.filter(x=>x.type==='file'&&/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(x.name));
}
async function ghData(path,branch,token){
  const item=await ghGet(path,branch,token);
  if(item.type!=='file'||item.encoding!=='base64'||typeof item.content!=='string'||typeof item.sha!=='string')throw Object.assign(new Error('File nguồn không đúng cấu trúc.'),{status:502});
  const data=JSON.parse(decoded(item.content));
  if(!isObject(data))throw Object.assign(new Error('File JSON phải là object.'),{status:502});
  return {data,sha:item.sha};
}
export async function onRequestPost({request,env}){
  try {
    if(request.headers.get('Origin')!==new URL(request.url).origin)return responseError('Nguồn yêu cầu không hợp lệ.',403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return responseError('Hãy gửi JSON.',415);
    const raw=await request.text();
    if(new TextEncoder().encode(raw).length>180_000)return responseError('Dữ liệu vượt giới hạn.',413);
    let input;try{input=JSON.parse(raw);}catch{return responseError('Dữ liệu JSON không hợp lệ.',400);}
    if(!isObject(input)||!['create','update'].includes(input.mode)||!isObject(input.product))return responseError('Chưa xác định thao tác hoặc sản phẩm.',400);
    if(input.confirm_write!==true&&input.dry_run!==true)return responseError('Cần xác nhận trước khi ghi GitHub.',400);
    const creating=input.mode==='create';
    if(!creating&&(!FILE_SLUG.test(input.filename?.replace(/\.json$/,'')||'')||!/^[a-f0-9]{40}$/i.test(input.sha||'')))return responseError('Thiếu tên file hoặc phiên bản khi sửa.',400);
    if(!creating&&!input.filename.endsWith('.json'))return responseError('Tên file không hợp lệ.',400);
    if(!env.GITHUB_CONTENT_TOKEN)return responseError('Chưa cấu hình token GitHub.',503);
    const token=env.GITHUB_CONTENT_TOKEN;
    const branch=resolveContentBranch(request,env);
    const currentPath=creating?null:`content/products/${input.filename}`;
    const current=creating?null:await ghData(currentPath,branch,token);
    if(current&&current.sha!==input.sha)return responseError('Sản phẩm đã được thay đổi ở phiên khác. Hãy tải lại trước khi lưu.',409,{current_sha:current.sha});
    const checked=checkProductPayload(input.product,current?.data||null);
    if(!checked.valid)return responseError('Dữ liệu chưa hợp lệ. Hãy kiểm tra trường được báo lỗi.',400,{errors:checked.errors});
    const product=checked.product;
    const destFile=creating?`${product.slug}.json`:input.filename;
    if(!FILE_SLUG.test(destFile.slice(0,-5))||destFile.length>110)return responseError('Tên file sản phẩm quá dài hoặc không hợp lệ.',400);
    const [productFiles,categoryFiles,articleFiles]=await Promise.all(['products','categories','articles'].map(k=>ghDir(k,branch,token)));
    if(creating&&productFiles.some(x=>x.name===destFile))return responseError('File sản phẩm đã tồn tại, không ghi đè.',409);
    const [products,categories,articles]=await Promise.all([
      Promise.all(productFiles.map(async x=>({filename:x.name,...await ghData(x.path,branch,token)}))),
      Promise.all(categoryFiles.map(async x=>(await ghData(x.path,branch,token)).data)),
      Promise.all(articleFiles.map(async x=>(await ghData(x.path,branch,token)).data))
    ]);
    const existing=creating?null:{filename:input.filename,data:current.data};
    const refErrors=checkProductReferences(product,existing,products,categories,articles);
    if(refErrors.length)return responseError('Thay đổi ảnh hưởng dữ liệu liên quan.',400,{errors:refErrors});
    // A slug must not overwrite a manually managed HTML file outside the CMS manifest.
    const pagePath=`san-pham/${product.slug}.html`;
    if(product.status==='published' && (creating || current.data.slug!==product.slug)){
      const page=await ghGet(pagePath,branch,token,true);
      if(page){
        const manifest=await ghGet('.cms-build-manifest.json',branch,token,true);
        const managed=manifest?.encoding==='base64'&&JSON.parse(decoded(manifest.content)).pages?.[pagePath];
        if(!managed)return responseError('Đường dẫn đang có trang HTML thủ công. Hãy chọn URL khác để không ghi đè.',400,{errors:[{field:'slug',message:'URL trùng một trang ngoài phạm vi CMS.'}]});
      }
    }
    // Uploaded image must exist in the same GitHub branch, not only a browser preview.
    if(product.image){
      const imageFile=await ghGet(product.image.slice(1),branch,token,true);
      if(!imageFile||imageFile.type!=='file')return responseError('Ảnh chưa tồn tại trên GitHub của nhánh đang lưu.',400,{errors:[{field:'image',message:'Hãy tải ảnh lên thư viện hoặc chọn ảnh đã có.'}]});
    }
    const original=current?.data||null;
    // Shared normalisation can fill optional arrays. No re-commit if source is otherwise identical.
    if(!creating&&JSON.stringify(original)===JSON.stringify(product))return json({success:true,saved:false,changed:false,sha:current.sha,message:'Không có nội dung mới cần lưu.'});
    if(input.dry_run===true)return json({success:true,dry_run:true,saved:false,product,filename:destFile,branch});
    const path=`content/products/${destFile}`;
    const write=await fetch(ghUrl(path),{method:'PUT',headers:{...headers(token),'Content-Type':'application/json'},body:JSON.stringify({message:`Admin: ${creating?'create':'update'} products/${destFile}`,content:encoded(JSON.stringify(product,null,2)+'\n'),...(creating?{}:{sha:current.sha}),branch})});
    if(write.status===409||write.status===422)return responseError('GitHub từ chối lưu do xung đột hoặc file đã tồn tại. Hãy tải lại.',409);
    if(!write.ok)return responseError('GitHub chưa xác nhận đã lưu dữ liệu.',502,{github_status:write.status});
    const saved=await write.json();
    return json({success:true,saved:true,changed:true,created:creating,filename:destFile,product,sha:saved.content?.sha||null,commit_sha:saved.commit?.sha||null,message:'Đã ghi GitHub. Chờ GitHub Actions và Cloudflare triển khai trước khi coi là website đã cập nhật.'});
  }catch(error){console.error('Product CMS save failed:',error);return responseError(error.message||'Không thể lưu sản phẩm. Hãy tải lại kiểm tra trước khi thử lại.',error.status||500);}
}
