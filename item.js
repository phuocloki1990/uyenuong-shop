// functions/admin/api/content/item.js
//
// Đọc chi tiết một file JSON từ GitHub.
//
// Ví dụ:
// GET /admin/api/content/item?kind=products&slug=banh-phu-the-hue
//
// Chỉ đọc, chưa ghi hoặc xóa dữ liệu.
// Không sử dụng D1.

const GITHUB_OWNER = 'phuocloki1990';
const GITHUB_REPO = 'uyenuong-shop';
const GITHUB_BRANCH = 'main';

const CONTENT_PATHS = {
  products: 'content/products',
  articles: 'content/articles',
  categories: 'content/categories'
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}

function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\s/g, ''));

  const bytes = Uint8Array.from(
    binary,
    character => character.charCodeAt(0)
  );

  return new TextDecoder('utf-8', {
    fatal: true
  }).decode(bytes);
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);

    const kind = String(
      url.searchParams.get('kind') || ''
    ).trim();

    const slug = String(
      url.searchParams.get('slug') || ''
    ).trim();

    // Chỉ cho đọc các thư mục nội dung được khai báo.
    if (!Object.hasOwn(CONTENT_PATHS, kind)) {
      return json(
        {
          success: false,
          message: 'Loại nội dung không hợp lệ.'
        },
        400
      );
    }

    // Không cho truyền đường dẫn tùy ý.
    if (!SLUG_PATTERN.test(slug)) {
      return json(
        {
          success: false,
          message: 'Tên file không hợp lệ.'
        },
        400
      );
    }

    if (!env.GITHUB_CONTENT_TOKEN) {
      console.error(
        'Missing GITHUB_CONTENT_TOKEN'
      );

      return json(
        {
          success: false,
          message:
            'Chưa cấu hình kết nối GitHub cho Admin.'
        },
        503
      );
    }

    const filename = `${slug}.json`;

    const filePath =
      `${CONTENT_PATHS[kind]}/${filename}`;

    const githubUrl =
      `https://api.github.com/repos/` +
      `${GITHUB_OWNER}/${GITHUB_REPO}/` +
      `contents/${filePath}` +
      `?ref=${GITHUB_BRANCH}`;

    const response = await fetch(
      githubUrl,
      {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization:
            `Bearer ${env.GITHUB_CONTENT_TOKEN}`,
          'User-Agent': 'uyenuong-shop-admin',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        cache: 'no-store'
      }
    );

    if (response.status === 404) {
      return json(
        {
          success: false,
          message: 'Không tìm thấy nội dung.'
        },
        404
      );
    }

    if (!response.ok) {
      console.error(
        'GitHub content detail error:',
        response.status,
        filePath
      );

      return json(
        {
          success: false,
          message:
            'Không thể đọc nội dung từ GitHub.',
          github_status: response.status
        },
        502
      );
    }

    const result = await response.json();

    if (
      result.type !== 'file' ||
      result.encoding !== 'base64' ||
      typeof result.content !== 'string' ||
      typeof result.sha !== 'string'
    ) {
      return json(
        {
          success: false,
          message:
            'Định dạng file GitHub không hợp lệ.'
        },
        502
      );
    }

    const fileText = decodeBase64Utf8(
      result.content
    );

    const data = JSON.parse(fileText);

    if (
      data === null ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      return json(
        {
          success: false,
          message:
            'Nội dung JSON không đúng cấu trúc.'
        },
        502
      );
    }

    return json({
      success: true,
      kind,
      filename,
      path: filePath,
      sha: result.sha,
      data
    });

  } catch (error) {
    console.error(
      'Admin content detail error:',
      error
    );

    return json(
      {
        success: false,
        message:
          'Không thể tải chi tiết nội dung.'
      },
      500
    );
  }
}
