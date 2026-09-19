// functions/admin/api/content/index.js
//
// A1.1 — Đọc danh sách nội dung từ GitHub.
// Bổ sung thông tin chẩn đoán lỗi GitHub 403.
//
// GET /admin/api/content?kind=products
// GET /admin/api/content?kind=articles
// GET /admin/api/content?kind=categories

const GITHUB_OWNER = 'phuocloki1990';
const GITHUB_REPO = 'uyenuong-shop';
const GITHUB_BRANCH = 'main';

const CONTENT_PATHS = {
  products: 'content/products',
  articles: 'content/articles',
  categories: 'content/categories'
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);

    const kind = String(
      url.searchParams.get('kind') || ''
    ).trim();

    if (!Object.hasOwn(CONTENT_PATHS, kind)) {
      return json(
        {
          success: false,
          message: 'Loại nội dung không hợp lệ.',
          allowed: [
            'products',
            'articles',
            'categories'
          ]
        },
        400
      );
    }

    const folder = CONTENT_PATHS[kind];

    const githubUrl =
      `https://api.github.com/repos/` +
      `${GITHUB_OWNER}/${GITHUB_REPO}/` +
      `contents/${folder}` +
      `?ref=${GITHUB_BRANCH}`;

    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'uyenuong-shop-admin',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    // Chưa yêu cầu tạo token.
    // Chỉ sử dụng token nếu đã được cấu hình
    // trong Cloudflare Secrets.

    const hasToken =
      Boolean(env.GITHUB_CONTENT_TOKEN);

    if (hasToken) {
      headers.Authorization =
        `Bearer ${env.GITHUB_CONTENT_TOKEN}`;
    }

    const response = await fetch(
      githubUrl,
      {
        method: 'GET',
        headers,
        cache: 'no-store'
      }
    );

    // Đọc phản hồi của GitHub một lần,
    // dùng được cho cả thành công và thất bại.

    const responseText = await response.text();

    let result;

    try {
      result = JSON.parse(responseText);
    } catch {
      result = null;
    }

    if (!response.ok) {
      const githubMessage =
        typeof result?.message === 'string'
          ? result.message
          : 'GitHub không trả về thông báo lỗi dạng JSON.';

      const rateRemaining =
        response.headers.get(
          'x-ratelimit-remaining'
        );

      const rateLimit =
        response.headers.get(
          'x-ratelimit-limit'
        );

      const rateResource =
        response.headers.get(
          'x-ratelimit-resource'
        );

      const rateReset =
        response.headers.get(
          'x-ratelimit-reset'
        );

      const retryAfter =
        response.headers.get(
          'retry-after'
        );

      console.error(
        'GitHub content API error:',
        {
          status: response.status,
          message: githubMessage,
          rateRemaining,
          rateLimit,
          rateResource,
          rateReset,
          retryAfter,
          hasToken
        }
      );

      return json(
        {
          success: false,
          message:
            'Chưa đọc được danh sách nội dung từ GitHub.',

          github_status:
            response.status,

          github_message:
            githubMessage,

          github_rate_limit: {
            remaining: rateRemaining,
            limit: rateLimit,
            resource: rateResource,
            reset: rateReset,
            retry_after: retryAfter
          },

          github_token_configured:
            hasToken
        },
        502
      );
    }

    if (!Array.isArray(result)) {
      return json(
        {
          success: false,
          message:
            'GitHub không trả về danh sách file như dự kiến.'
        },
        502
      );
    }

    const items = result
      .filter(file =>
        file.type === 'file' &&
        file.name.endsWith('.json')
      )
      .map(file => ({
        filename: file.name,
        slug: file.name.replace(/\.json$/, ''),
        path: file.path,
        sha: file.sha
      }))
      .sort((a, b) =>
        a.filename.localeCompare(
          b.filename,
          'vi'
        )
      );

    return json({
      success: true,
      kind,
      count: items.length,
      items
    });

  } catch (error) {
    console.error(
      'Admin content API error:',
      error
    );

    return json(
      {
        success: false,
        message:
          'Không thể tải danh sách nội dung.'
      },
      500
    );
  }
}
