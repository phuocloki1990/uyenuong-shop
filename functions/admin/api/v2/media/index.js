import { getConfig, listMedia, uploadMedia, sameOrigin, json } from '../../../../_shared/v2-admin-github.js';

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
    return json({ success:true, uploaded:true, ...uploaded, publish_version, message:'Đã tải ảnh lên thư viện.' });
  } catch (error) {
    console.error('Admin V2 media POST:', error);
    const extra = error.existing_url ? { existing_url:error.existing_url, existing_sha:error.existing_sha || null } : {};
    return json({ success:false, message:error.message || 'Không thể tải ảnh lên.', ...extra }, error.status || 500);
  }
}
