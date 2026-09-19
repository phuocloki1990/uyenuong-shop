// functions/admin/api/content/index.js
//
// API quản trị nội dung Shop Uyên Ương.
//
// Giai đoạn A1.1:
// - Chỉ đọc danh sách file JSON từ GitHub.
// - Chưa có chức năng ghi hoặc xóa.
// - Không sử dụng D1.
// - Không thay đổi API Đơn hàng.
//
// Đường dẫn:
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

    // Không cho người dùng tự truyền đường dẫn GitHub.
    // API chỉ được đọc ba thư mục đã khai báo.

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

    // Chưa bắt buộc tạo token ở A1.1.
    // Repository công khai có thể đọc bằng GitHub API.
    // Nếu repository riêng tư, token sẽ được cấu hình
    // ở bước sau, trong Cloudflare Secrets.

    if (env.GITHUB_CONTENT_TOKEN) {
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

    if (!response.ok) {
      console.error(
        'GitHub content list error:',
        response.status,
        kind
      );

      return json(
        {
          success: false,
          message:
            'Chưa đọc được danh sách nội dung từ GitHub.',
          github_status: response.status
        },
        502
      );
    }

    const result = await response.json();

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
        a.filename.localeCompare(b.filename, 'vi')
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
