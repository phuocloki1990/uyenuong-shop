import { getConfig, getPublishStatus, json } from '../../../../_shared/v2-admin-github.js';

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const commitSha = String(url.searchParams.get('version') || '').trim();
    const config = getConfig(request, env);
    const status = await getPublishStatus(config, { commitSha });
    return json({ success:true, ...status });
  } catch (error) {
    console.error('Admin V2 publish status GET:', error);
    return json({ success:false, message:error.message || 'Không thể kiểm tra trạng thái cập nhật website.' }, error.status || 500);
  }
}
