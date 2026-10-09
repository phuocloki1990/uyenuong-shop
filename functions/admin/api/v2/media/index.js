import { getConfig, listMedia, uploadMedia, saveMediaMetadata, sameOrigin, json } from '../../../../_shared/v2-admin-github.js';

export async function onRequestGet({ request, env }) {
  try {
    const config = getConfig(request, env);
    const items = await listMedia(config);
    const url = new URL(request.url);
    const target = String(url.searchParams.get('path') || '').trim();
    if (target) {
      const item = items.find(entry => entry.url === target);
      if (!item) return json({ success:false, message:'Không tìm thấy ảnh trong thư viện.' },404);
      return json({ success:true, item });
    }
    return json({ success:true, count:items.length, items });
  } catch (error) {
    console.error('Admin V2 media GET:', error);
    return json({ success:false, message:error.message || 'Không thể tải thư viện ảnh.' }, error.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!sameOrigin(request)) return json({ success:false, message:'Nguồn yêu cầu không hợp lệ.' },403);
    const type = request.headers.get('Content-Type') || '';
    if (!type.toLowerCase().startsWith('multipart/form-data')) return json({ success:false, message:'Yêu cầu tải ảnh không hợp lệ.' },415);
    const form = await request.formData();
    const file = form.get('file');
    const group = String(form.get('group') || '').trim();
    const config = getConfig(request, env);
    const result = await uploadMedia(config, { group, file });
    const { commit_sha:publish_version, ...uploaded } = result;
    const alt=String(form.get('alt')||'').trim();
    let metadata_version=null;
    if(alt) {
      try { const result=await saveMediaMetadata(config,{url:uploaded.url,alt}); metadata_version=result.commit_sha; }
      catch(error) { return json({success:false,uploaded:true,url:uploaded.url,message:`Ảnh đã tải lên tại ${uploaded.url} nhưng chưa lưu được Alt: ${error.message}. Không tải ảnh lần nữa; hãy sửa Alt trực tiếp trong thư viện.`},409); }
    }
    return json({ success:true, uploaded:true, ...uploaded, publish_version:metadata_version||publish_version, message:'Đã tải ảnh lên thư viện.' });
  } catch (error) {
    console.error('Admin V2 media POST:', error);
    const extra = error.existing_url ? { existing_url:error.existing_url, existing_sha:error.existing_sha || null } : {};
    return json({ success:false, message:error.message || 'Không thể tải ảnh lên.', ...extra }, error.status || 500);
  }
}

export async function onRequestPatch({request,env}) {
  try {
    if(!sameOrigin(request))return json({success:false,message:'Nguồn yêu cầu không hợp lệ.'},403);
    const data=await request.json();const config=getConfig(request,env);
    const items=await listMedia(config);
    if(!items.some(item=>item.url===data.url))return json({success:false,message:'Ảnh không tồn tại trong thư viện.'},404);
    const result=await saveMediaMetadata(config,{url:data.url,alt:data.alt||'',caption:data.caption||''});
    return json({success:true,publish_version:result.commit_sha, message:'Đã lưu thông tin ảnh.'});
  } catch(error) { return json({success:false,message:error.message||'Không lưu được ảnh.'},error.status||500); }
}
