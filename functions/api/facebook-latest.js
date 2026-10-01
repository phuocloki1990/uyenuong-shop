const jsonResponse = (body, status = 200, cacheControl = 'no-store') => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff'
  }
});

function publicPost(post) {
  if (!post || typeof post !== 'object') return null;
  const permalink = typeof post.permalink_url === 'string' ? post.permalink_url : '';
  if (!permalink) return null;
  return {
    id: String(post.id || ''),
    message: typeof post.message === 'string' ? post.message : '',
    created_time: typeof post.created_time === 'string' ? post.created_time : '',
    permalink_url: permalink,
    image: typeof post.full_picture === 'string' ? post.full_picture : ''
  };
}

export async function onRequestGet({ env }) {
  const pageId = String(env?.FACEBOOK_PAGE_ID || '').trim();
  const token = String(env?.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
  if (!/^\d+$/.test(pageId) || !token) {
    return jsonResponse({ success:false, posts:[] }, 503);
  }

  const url = new URL(`https://graph.facebook.com/${pageId}/posts`);
  url.searchParams.set('fields', 'id,message,created_time,permalink_url,full_picture');
  url.searchParams.set('limit', '2');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });
    if (!upstream.ok) return jsonResponse({ success:false, posts:[] }, 502);
    const payload = await upstream.json().catch(() => null);
    const posts = Array.isArray(payload?.data) ? payload.data.map(publicPost).filter(Boolean).slice(0, 2) : [];
    return jsonResponse({
      success:true,
      page_url:`https://www.facebook.com/${pageId}`,
      posts
    }, 200, 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400');
  } catch {
    return jsonResponse({ success:false, posts:[] }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
