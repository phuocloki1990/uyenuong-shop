// functions/admin/api/content/index.js
//
// Danh sách nội dung cho Admin.
//
// Production: đọc nhánh main.
// Preview: đọc nhánh GITHUB_CONTENT_BRANCH.
//
// Chỉ đọc GitHub, không ghi dữ liệu.

const OWNER = 'phuocloki1990';
const REPO = 'uyenuong-shop';

const FOLDERS = {
  products: 'content/products',
  articles: 'content/articles',
  categories: 'content/categories'
};

const BRANCH_PATTERN =
  /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

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

    if (!Object.hasOwn(FOLDERS, kind)) {
      return json(
        {
          success: false,
          message: 'Loại nội dung không hợp lệ.'
        },
        400
      );
    }

    if (!env.GITHUB_CONTENT_TOKEN) {
      return json(
        {
          success: false,
          message: 'Chưa cấu hình GitHub token.'
        },
        503
      );
    }

    // Không để Preview âm thầm đọc main
    // nếu quên cấu hình nhánh thử nghiệm.

    const isProduction =
      url.hostname === 'uyenuong-shop.pages.dev';

    const branch = isProduction
      ? 'main'
      : String(
          env.GITHUB_CONTENT_BRANCH || ''
        ).trim();

    if (!BRANCH_PATTERN.test(branch)) {
      return json(
        {
          success: false,
          message:
            'Preview chưa được cấu hình nhánh GitHub.'
        },
        503
      );
    }

    if (!isProduction && branch === 'main') {
      return json(
        {
          success: false,
          message:
            'Preview không được đọc nhánh main trong đợt kiểm thử này.'
        },
        503
      );
    }

    const folder = FOLDERS[kind];

    const githubUrl =
      `https://api.github.com/repos/` +
      `${OWNER}/${REPO}/contents/${folder}` +
      `?ref=${encodeURIComponent(branch)}`;

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

    if (!response.ok) {
      console.error(
        'GitHub content list error:',
        response.status,
        kind,
        branch
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
            'GitHub không trả về danh sách file hợp lệ.'
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
      branch,
      kind,
      count: items.length,
      items
    });

  } catch (error) {
    console.error(
      'Admin content list error:',
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
