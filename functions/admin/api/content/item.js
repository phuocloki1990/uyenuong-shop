// functions/admin/api/content/item.js
//
// Đọc chi tiết một file JSON từ GitHub.
//
// Production đọc main.
// Preview đọc GITHUB_CONTENT_BRANCH.
//
// Chỉ đọc dữ liệu, không ghi GitHub hoặc D1.

const OWNER = 'phuocloki1990';
const REPO = 'uyenuong-shop';

const FOLDERS = {
  products: 'content/products',
  articles: 'content/articles',
  categories: 'content/categories'
};

const FILE_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function decodeBase64Utf8(value) {
  const binary = atob(
    value.replace(/\s/g, '')
  );

  const bytes = Uint8Array.from(
    binary,
    character => character.charCodeAt(0)
  );

  return new TextDecoder(
    'utf-8',
    { fatal: true }
  ).decode(bytes);
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);

    const kind = String(
      url.searchParams.get('kind') || ''
    ).trim();

    const filenameWithoutExtension = String(
      url.searchParams.get('slug') || ''
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

    if (
      !FILE_PATTERN.test(
        filenameWithoutExtension
      )
    ) {
      return json(
        {
          success: false,
          message: 'Tên file không hợp lệ.'
        },
        400
      );
    }

    if (!env.GITHUB_CONTENT_TOKEN) {
      return json(
        {
          success: false,
          message:
            'Chưa cấu hình GitHub token.'
        },
        503
      );
    }

    // Website chính luôn đọc main.
    // Bản Preview bắt buộc có nhánh riêng.

    const isProduction =
      url.hostname ===
      'uyenuong-shop.pages.dev';

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

    if (
      !isProduction &&
      branch === 'main'
    ) {
      return json(
        {
          success: false,
          message:
            'Preview không được đọc nhánh main trong đợt kiểm thử này.'
        },
        503
      );
    }

    const filename =
      `${filenameWithoutExtension}.json`;

    const filePath =
      `${FOLDERS[kind]}/${filename}`;

    const githubUrl =
      `https://api.github.com/repos/` +
      `${OWNER}/${REPO}/contents/` +
      `${filePath}?ref=` +
      encodeURIComponent(branch);

    const response = await fetch(
      githubUrl,
      {
        method: 'GET',
        headers: {
          Accept:
            'application/vnd.github+json',

          Authorization:
            `Bearer ${env.GITHUB_CONTENT_TOKEN}`,

          'User-Agent':
            'uyenuong-shop-admin',

          'X-GitHub-Api-Version':
            '2022-11-28'
        },
        cache: 'no-store'
      }
    );

    if (response.status === 404) {
      return json(
        {
          success: false,
          message:
            'Không tìm thấy nội dung trên nhánh đang sử dụng.'
        },
        404
      );
    }

    if (!response.ok) {
      console.error(
        'GitHub detail error:',
        response.status,
        filePath,
        branch
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
            'GitHub trả về định dạng file không hợp lệ.'
        },
        502
      );
    }

    const fileText =
      decodeBase64Utf8(result.content);

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
      branch,
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
