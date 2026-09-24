import { resolveContentBranch } from '../../../../scripts/content-branch.mjs';

// functions/admin/api/media/index.js
//
// GET  /admin/api/media
//      Danh sách ảnh trong GitHub.
//
// POST /admin/api/media
//      Tải ảnh JPG, PNG hoặc WebP lên GitHub.
//
// Production dùng nhánh main.
// Preview dùng GITHUB_CONTENT_BRANCH.
//
// Không sử dụng D1.
// Không đưa GitHub token ra trình duyệt.
//
// API này phải được Cloudflare Access
// bảo vệ tại đường dẫn /admin/*.

const OWNER = 'phuocloki1990';
const REPO = 'uyenuong-shop';

const MAX_BYTES = 900_000;

const ROOT = 'assets/images';
const UPLOADS = 'assets/images/uploads';

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });

function config(request, env) {
  if (!env.GITHUB_CONTENT_TOKEN) {
    throw Object.assign(new Error('Chưa cấu hình GitHub token.'), { status: 503 });
  }
  return {
    branch: resolveContentBranch(request, env),
    token: env.GITHUB_CONTENT_TOKEN
  };
}

const headers = token => ({
  Accept: 'application/vnd.github+json',

  Authorization: `Bearer ${token}`,

  'User-Agent': 'uyenuong-shop-admin',

  'X-GitHub-Api-Version': '2022-11-28'
});

const github = relative =>
  `https://api.github.com/repos/` +
  `${OWNER}/${REPO}/contents/${relative}`;

function imageType(bytes) {
  // JPEG
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'jpg';
  }

  // PNG
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10]
      .every((value, index) =>
        bytes[index] === value
      )
  ) {
    return 'png';
  }

  // WebP
  if (
    bytes.length >= 12 &&
    String.fromCharCode(
      ...bytes.slice(0, 4)
    ) === 'RIFF' &&
    String.fromCharCode(
      ...bytes.slice(8, 12)
    ) === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

function toBase64(bytes) {
  let binary = '';

  for (
    let i = 0;
    i < bytes.length;
    i += 8192
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + 8192)
    );
  }

  return btoa(binary);
}

async function listDir(
  token,
  branch,
  folder,
  optional = false
) {
  const response = await fetch(
    github(
      `${folder}?ref=${encodeURIComponent(branch)}`
    ),
    {
      headers: headers(token),
      cache: 'no-store'
    }
  );

  // Thư mục uploads chưa tồn tại
  // khi chưa có ảnh tải lên lần đầu.
  if (
    optional &&
    response.status === 404
  ) {
    return [];
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(
        'GitHub chưa trả danh sách hình ảnh.'
      ),
      { status: 502 }
    );
  }

  const rows = await response.json();

  if (!Array.isArray(rows)) {
    throw Object.assign(
      new Error(
        'Danh sách ảnh không hợp lệ.'
      ),
      { status: 502 }
    );
  }

  return rows
    .filter(file =>
      file.type === 'file' &&
      /\.(?:jpe?g|png|webp)$/i.test(
        file.name
      )
    )
    .map(file => ({
      name: file.name,
      path: `/${file.path}`,
      size: file.size,
      sha: file.sha
    }));
}

// ========================================
// GET — DANH SÁCH ẢNH
// ========================================

export async function onRequestGet({
  request,
  env
}) {
  try {
    const {
      branch,
      token
    } = config(request, env);

    const [
      root,
      uploads
    ] = await Promise.all([
      listDir(
        token,
        branch,
        ROOT
      ),

      listDir(
        token,
        branch,
        UPLOADS,
        true
      )
    ]);

    const items = [
      ...root,
      ...uploads
    ];

    return json({
      success: true,
      branch,
      count: items.length,
      items
    });

  } catch (error) {
    console.error(
      'Admin media list:',
      error.message
    );

    return json(
      {
        success: false,
        message:
          error.message ||
          'Không tải được ảnh.'
      },
      error.status || 500
    );
  }
}

// ========================================
// POST — TẢI ẢNH LÊN GITHUB
// ========================================

export async function onRequestPost({
  request,
  env
}) {
  try {
    const {
      branch,
      token
    } = config(request, env);

    // Chỉ nhận thao tác từ cùng website.

    if (
      request.headers.get('Origin') !==
      new URL(request.url).origin
    ) {
      return json(
        {
          success: false,
          message:
            'Nguồn yêu cầu không hợp lệ.'
        },
        403
      );
    }

    const contentType =
      request.headers.get(
        'content-type'
      ) || '';

    if (
      !/^multipart\/form-data\s*;/i.test(
        contentType
      )
    ) {
      return json(
        {
          success: false,
          message:
            'Hãy gửi ảnh bằng biểu mẫu tải lên.'
        },
        415
      );
    }

    // Giới hạn cả yêu cầu tải lên.

    const requestSize = Number(
      request.headers.get(
        'content-length'
      ) || 0
    );

    if (
      requestSize >
      MAX_BYTES + 100_000
    ) {
      return json(
        {
          success: false,
          message:
            'Ảnh vượt quá 900 KB.'
        },
        413
      );
    }

    const form =
      await request.formData();

    const file =
      form.get('file');

    if (
      !file ||
      typeof file.arrayBuffer !==
        'function'
    ) {
      return json(
        {
          success: false,
          message:
            'Chưa chọn ảnh.'
        },
        400
      );
    }

    if (
      file.size === 0 ||
      file.size > MAX_BYTES
    ) {
      return json(
        {
          success: false,
          message:
            'Chỉ nhận ảnh từ 1 byte đến 900 KB.'
        },
        413
      );
    }

    const bytes = new Uint8Array(
      await file.arrayBuffer()
    );

    // Kiểm tra nội dung file thật,
    // không chỉ tin vào phần đuôi tên file.

    const ext =
      imageType(bytes);

    if (!ext) {
      return json(
        {
          success: false,
          message:
            'Chỉ nhận ảnh JPG, PNG hoặc WebP hợp lệ.'
        },
        400
      );
    }

    // Tạo tên riêng để tránh ghi đè ảnh cũ.

    const stamp =
      new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '');

    const filename =
      `shop-${stamp}-` +
      `${crypto.randomUUID()}.${ext}`;

    const filepath =
      `${UPLOADS}/${filename}`;

    const response = await fetch(
      github(filepath),
      {
        method: 'PUT',

        headers: {
          ...headers(token),
          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          message:
            `Admin: upload image ${filename}`,

          content:
            toBase64(bytes),

          branch
        })
      }
    );

    if (!response.ok) {
      console.error(
        'Admin media upload GitHub:',
        response.status
      );

      return json(
        {
          success: false,
          message:
            'GitHub chưa lưu được ảnh.',
          github_status:
            response.status
        },
        502
      );
    }

    const result =
      await response.json();

    return json({
      success: true,
      branch,
      name: filename,
      path: `/${filepath}`,

      sha:
        result.content?.sha ||
        null,

      commit_sha:
        result.commit?.sha ||
        null,

      message:
        'Đã lưu ảnh lên GitHub. ' +
        'Chờ Pages triển khai để ảnh ' +
        'xuất hiện trên website.'
    });

  } catch (error) {
    console.error(
      'Admin media upload:',
      error.message
    );

    return json(
      {
        success: false,
        message:
          error.message ||
          'Không tải được ảnh.'
      },
      error.status || 500
    );
  }
}
