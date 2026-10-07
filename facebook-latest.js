const jsonResponse = (body, status = 200, cacheControl = 'no-store') => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff'
  }
});

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function attachmentText(post) {
  const attachments = Array.isArray(post?.attachments?.data) ? post.attachments.data : [];
  for (const attachment of attachments) {
    const description = cleanText(attachment?.description);
    if (description) return description;
  }
  return '';
}

function usefulStory(value) {
  const story = cleanText(value);
  if (!story) return '';
  const genericAction = /\b(shared|updated|added|posted|published)\b|(?:^|\s)đã\s+(?:chia sẻ|cập nhật|thêm|đăng)(?:\s|$)|chia sẻ một bài viết/i;
  return genericAction.test(story) ? '' : story;
}

function localPostText(post) {
  return cleanText(post?.message) || attachmentText(post) || usefulStory(post?.story);
}

function publicPost(post, message = '') {
  if (!post || typeof post !== 'object') return null;
  const permalink = typeof post.permalink_url === 'string' ? post.permalink_url : '';
  if (!permalink) return null;
  return {
    id: String(post.id || ''),
    message: cleanText(message),
    created_time: typeof post.created_time === 'string' ? post.created_time : '',
    permalink_url: permalink,
    image: typeof post.full_picture === 'string' ? post.full_picture : ''
  };
}

async function graphJson(url, token, signal) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    },
    signal
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function originalPostText(post, token, signal) {
  const parentId = cleanText(post?.parent_id);
  if (!parentId) return '';
  try {
    const url = new URL(`https://graph.facebook.com/${encodeURIComponent(parentId)}`);
    url.searchParams.set('fields', 'message,story,attachments{description}');
    const parent = await graphJson(url, token, signal);
    return localPostText(parent);
  } catch {
    return '';
  }
}

async function resolvedPostText(post, token, signal) {
  const direct = cleanText(post?.message);
  if (direct) return direct;

  const original = await originalPostText(post, token, signal);
  if (original) return original;

  return attachmentText(post) || usefulStory(post?.story);
}

export async function onRequestGet({ env }) {
  const pageId = String(env?.FACEBOOK_PAGE_ID || '').trim();
  const token = String(env?.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
  if (!/^\d+$/.test(pageId) || !token) {
    return jsonResponse({ success:false, posts:[] }, 503);
  }

  const url = new URL(`https://graph.facebook.com/${pageId}/posts`);
  url.searchParams.set('fields', 'id,message,story,parent_id,created_time,permalink_url,full_picture,attachments{description}');
  url.searchParams.set('limit', '2');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const payload = await graphJson(url, token, controller.signal);
    if (!payload) return jsonResponse({ success:false, posts:[] }, 502);
    const source = Array.isArray(payload?.data) ? payload.data.slice(0, 2) : [];
    const posts = (await Promise.all(source.map(async post => publicPost(
      post,
      await resolvedPostText(post, token, controller.signal)
    )))).filter(Boolean);
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
