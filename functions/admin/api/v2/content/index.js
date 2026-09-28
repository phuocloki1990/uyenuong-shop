import { getConfig, getDocument, listDocuments, saveDocument, sameOrigin, json } from '../../../../_shared/v2-admin-github.js';

const MAX_BYTES = 260_000;
const ALLOWED = new Set(['products','articles','categories','settings']);

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const kind = String(url.searchParams.get('kind') || '').trim();
    const slug = String(url.searchParams.get('slug') || '').trim();
    if (!ALLOWED.has(kind)) return json({ success:false, message:'Loại nội dung không hợp lệ.' },400);
    const config = getConfig(request, env);
    if (slug) {
      const item = await getDocument(config, kind, slug);
      return json({ success:true, kind, slug, sha:item.sha, data:item.data });
    }
    const items = await listDocuments(config, kind);
    return json({ success:true, kind, count:items.length, items });
  } catch (error) {
    console.error('Admin V2 content GET:', error);
    return json({ success:false, message:error.message || 'Không thể tải nội dung.' }, error.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!sameOrigin(request)) return json({ success:false, message:'Nguồn yêu cầu không hợp lệ.' },403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return json({ success:false, message:'Yêu cầu phải gửi JSON.' },415);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BYTES) return json({ success:false, message:'Dữ liệu gửi lên quá lớn.' },413);
    let body; try { body = JSON.parse(raw); } catch { return json({ success:false, message:'JSON không hợp lệ.' },400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ success:false, message:'Dữ liệu không hợp lệ.' },400);
    const kind = String(body.kind || '').trim();
    const slug = String(body.slug || '').trim();
    if (!ALLOWED.has(kind)) return json({ success:false, message:'Loại nội dung không hợp lệ.' },400);
    if (body.confirm_write !== true) return json({ success:false, message:'Chưa xác nhận thao tác lưu.' },400);
    const config = getConfig(request, env);
    const result = await saveDocument(config, { kind, slug, sha:body.sha || null, data:body.data });
    const { commit_sha:publish_version, ...saved } = result;
    return json({ success:true, saved:true, kind, slug, ...saved, publish_version, message:'Đã lưu. Website sẽ cập nhật sau khi build thành công.' });
  } catch (error) {
    console.error('Admin V2 content POST:', error);
    const extra = error.current_sha ? { current_sha:error.current_sha } : {};
    return json({ success:false, message:error.message || 'Không thể lưu nội dung.', ...extra }, error.status || 500);
  }
}
