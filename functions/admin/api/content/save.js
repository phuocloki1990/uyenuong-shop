import { resolveContentBranch } from '../../../../scripts/content-branch.mjs';

// functions/admin/api/content/save.js
//
// A1.4 — API lưu nội dung về GitHub.
//
// GET  /admin/api/content/save
//      Kiểm tra API đã sẵn sàng.
//
// POST /admin/api/content/save
//      Xem trước hoặc lưu các trường văn bản được cho phép.
//
// Không sử dụng D1.
// Không sửa file HTML do builder tạo.
// Không nhận đường dẫn file tùy ý từ trình duyệt.

const OWNER = 'phuocloki1990';
const REPO = 'uyenuong-shop';

const FOLDERS = {
  products: 'content/products',
  articles: 'content/articles',
  categories: 'content/categories'
};

// Giai đoạn đầu chỉ mở các trường văn bản ít rủi ro.
// Giá, số lượng, slug, category, body HTML và trạng thái
// sẽ được bổ sung khi có bộ kiểm tra tương ứng.

const EDITABLE_FIELDS = {
  products: [
    'name',
    'short_description',
    'lead',
    'image_alt',
    'seo.title',
    'seo.description'
  ],

  articles: [
    'title',
    'excerpt',
    'image_alt',
    'seo.title',
    'seo.description'
  ],

  categories: [
    'title',
    'description',
    'image_alt',
    'seo.title',
    'seo.description'
  ]
};

const REQUIRED_FIELDS = new Set([
  'name',
  'title',
  'short_description',
  'lead',
  'excerpt'
]);

const SLUG_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SHA_PATTERN =
  /^[a-f0-9]{40}$/i;

const MAX_REQUEST_BYTES = 40_000;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'uyenuong-shop-admin',
    'X-GitHub-Api-Version': '2022-11-28'
  };
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

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);

  let binary = '';

  // Chia nhỏ để tránh lỗi khi chuỗi dài.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + 8192)
    );
  }

  return btoa(binary);
}

function fieldLimit(field) {
  if (field === 'seo.title') {
    return 70;
  }

  if (field === 'seo.description') {
    return 180;
  }

  if (field === 'excerpt') {
    return 300;
  }

  if (
    field === 'name' ||
    field === 'title' ||
    field === 'image_alt'
  ) {
    return 200;
  }

  return 5000;
}

function getField(data, field) {
  if (field.startsWith('seo.')) {
    return data.seo?.[
      field.slice(4)
    ];
  }

  return data[field];
}

function setField(data, field, value) {
  if (field.startsWith('seo.')) {
    if (!isObject(data.seo)) {
      data.seo = {};
    }

    data.seo[field.slice(4)] = value;
    return;
  }

  data[field] = value;
}

function validateChanges(kind, changes) {
  if (!isObject(changes)) {
    return 'changes phải là object.';
  }

  const entries = Object.entries(changes);

  if (
    entries.length === 0 ||
    entries.length > 6
  ) {
    return 'Cần thay đổi từ 1 đến 6 trường.';
  }

  for (const [field, value] of entries) {
    if (
      !EDITABLE_FIELDS[kind].includes(field)
    ) {
      return `Chưa cho phép sửa trường: ${field}`;
    }

    if (
      typeof value !== 'string' ||
      value.includes('\u0000')
    ) {
      return `${field} phải là văn bản hợp lệ.`;
    }

    if (
      REQUIRED_FIELDS.has(field) &&
      !value.trim()
    ) {
      return `${field} không được để trống.`;
    }

    if (
      value.length > fieldLimit(field)
    ) {
      return (
        `${field} vượt quá ` +
        `${fieldLimit(field)} ký tự.`
      );
    }
  }

  return null;
}

// Kiểm tra API sẵn sàng.
// Không trả token hoặc giá trị Secret.

export function onRequestGet({ env }) {
  return json({
    success: true,
    service: 'Admin content save API',
    ready: Boolean(
      env.GITHUB_CONTENT_TOKEN
    ),
    mode: 'Existing files only',
    editable_fields: EDITABLE_FIELDS
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // API này nằm dưới /admin/* và phải được
    // Cloudflare Access bảo vệ.
    //
    // Kiểm tra Origin bổ sung để hạn chế
    // yêu cầu ghi từ website khác.

    const expectedOrigin =
      new URL(request.url).origin;

    const requestOrigin =
      request.headers.get('Origin');

    if (
      requestOrigin !== expectedOrigin
    ) {
      return json(
        {
          success: false,
          message: 'Nguồn yêu cầu không hợp lệ.'
        },
        403
      );
    }

    const contentType =
      request.headers.get(
        'Content-Type'
      ) || '';

    if (
      !/^application\/json(?:\s*;|$)/i.test(
        contentType
      )
    ) {
      return json(
        {
          success: false,
          message:
            'Yêu cầu phải gửi JSON.'
        },
        415
      );
    }

    const raw = await request.text();

    if (
      new TextEncoder()
        .encode(raw)
        .length > MAX_REQUEST_BYTES
    ) {
      return json(
        {
          success: false,
          message: 'Dữ liệu gửi lên quá lớn.'
        },
        413
      );
    }

    let input;

    try {
      input = JSON.parse(raw);
    } catch {
      return json(
        {
          success: false,
          message: 'JSON không hợp lệ.'
        },
        400
      );
    }

    if (!isObject(input)) {
      return json(
        {
          success: false,
          message:
            'Dữ liệu yêu cầu không hợp lệ.'
        },
        400
      );
    }

    const {
      kind,
      filename,
      sha,
      changes,
      dry_run,
      confirm_write
    } = input;

    if (
      typeof kind !== 'string' ||
      !Object.hasOwn(FOLDERS, kind)
    ) {
      return json(
        {
          success: false,
          message: 'Loại nội dung không hợp lệ.'
        },
        400
      );
    }

    if (
      typeof filename !== 'string' ||
      !filename.endsWith('.json') ||
      !SLUG_PATTERN.test(
        filename.slice(0, -5)
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

    if (
      typeof sha !== 'string' ||
      !SHA_PATTERN.test(sha)
    ) {
      return json(
        {
          success: false,
          message:
            'Thiếu hoặc sai mã phiên bản sha.'
        },
        400
      );
    }

    const validationError =
      validateChanges(
        kind,
        changes
      );

    if (validationError) {
      return json(
        {
          success: false,
          message: validationError
        },
        400
      );
    }

    // Muốn ghi thực sự phải xác nhận rõ.
    // dry_run = true chỉ xem trước, không ghi.

    if (
      dry_run !== true &&
      confirm_write !== true
    ) {
      return json(
        {
          success: false,
          message:
            'Chưa xác nhận thao tác lưu.'
        },
        400
      );
    }

    const token =
      env.GITHUB_CONTENT_TOKEN;

    if (!token) {
      return json(
        {
          success: false,
          message:
            'Chưa cấu hình GitHub token.'
        },
        503
      );
    }

    const branch = resolveContentBranch(request, env);

    const filePath =
      `${FOLDERS[kind]}/${filename}`;

    const githubUrl =
      `https://api.github.com/repos/` +
      `${OWNER}/${REPO}/contents/` +
      filePath;

    // Luôn đọc phiên bản mới nhất từ GitHub
    // trước khi xử lý thay đổi.

    const currentResponse =
      await fetch(
        `${githubUrl}?ref=${encodeURIComponent(branch)}`,
        {
          method: 'GET',
          headers: githubHeaders(token),
          cache: 'no-store'
        }
      );

    if (currentResponse.status === 404) {
      return json(
        {
          success: false,
          message:
            'File không còn tồn tại trên GitHub.'
        },
        404
      );
    }

    if (!currentResponse.ok) {
      console.error(
        'Read before save failed:',
        currentResponse.status,
        filePath
      );

      return json(
        {
          success: false,
          message:
            'Không đọc được phiên bản mới nhất từ GitHub.',
          github_status:
            currentResponse.status
        },
        502
      );
    }

    const current =
      await currentResponse.json();

    if (
      current.type !== 'file' ||
      current.encoding !== 'base64' ||
      typeof current.content !== 'string' ||
      typeof current.sha !== 'string'
    ) {
      return json(
        {
          success: false,
          message:
            'Phản hồi file GitHub không hợp lệ.'
        },
        502
      );
    }

    // Không âm thầm ghi đè khi file đã đổi.

    if (current.sha !== sha) {
      return json(
        {
          success: false,
          message:
            'Nội dung đã có phiên bản mới. ' +
            'Vui lòng tải lại trước khi sửa.',
          current_sha: current.sha
        },
        409
      );
    }

    const currentText =
      decodeBase64Utf8(
        current.content
      );

    const data =
      JSON.parse(currentText);

    if (!isObject(data)) {
      return json(
        {
          success: false,
          message:
            'File nguồn không phải JSON object.'
        },
        502
      );
    }

    const updated =
      structuredClone(data);

    const changedFields = [];

    for (
      const [field, value] of
      Object.entries(changes)
    ) {
      if (
        getField(updated, field) !== value
      ) {
        setField(
          updated,
          field,
          value
        );

        changedFields.push(field);
      }
    }

    // Không có thay đổi thì không tạo commit.

    if (!changedFields.length) {
      return json({
        success: true,
        changed: false,
        saved: false,
        message:
          'Không có nội dung mới cần lưu.',
        sha: current.sha
      });
    }

    // Xem trước thay đổi, không gọi API ghi.

    if (dry_run === true) {
      return json({
        success: true,
        dry_run: true,
        saved: false,
        kind,
        filename,
        changed_fields: changedFields,
        data: updated
      });
    }

    const newText =
      JSON.stringify(
        updated,
        null,
        2
      ) + '\n';

    const encoded =
      encodeBase64Utf8(newText);

    // sha được gửi kèm PUT để GitHub
    // kiểm tra xung đột khi cập nhật.

    const saveResponse =
      await fetch(
        githubUrl,
        {
          method: 'PUT',
          headers: {
            ...githubHeaders(token),
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            message:
              `Admin: update ${kind}/${filename}`,

            content: encoded,
            sha: current.sha,
            branch
          })
        }
      );

    if (
      saveResponse.status === 409 ||
      saveResponse.status === 422
    ) {
      return json(
        {
          success: false,
          message:
            'GitHub từ chối lưu do xung đột ' +
            'hoặc dữ liệu không hợp lệ. ' +
            'Vui lòng tải lại trước khi thử tiếp.',
          github_status:
            saveResponse.status
        },
        409
      );
    }

    if (!saveResponse.ok) {
      console.error(
        'GitHub save failed:',
        saveResponse.status,
        filePath
      );

      return json(
        {
          success: false,
          message:
            'Không thể lưu nội dung lên GitHub.',
          github_status:
            saveResponse.status
        },
        502
      );
    }

    const saved =
      await saveResponse.json();

    return json({
      success: true,
      changed: true,
      saved: true,
      kind,
      filename,
      changed_fields: changedFields,
      sha:
        saved.content?.sha || null,
      commit_sha:
        saved.commit?.sha || null,
      message:
        'Đã lưu lên GitHub. Website sẽ cập nhật sau khi build thành công.'
    });

  } catch (error) {
    console.error(
      'Admin save content error:',
      error
    );

    return json(
      {
        success: false,
        message:
          'Không thể xử lý yêu cầu lưu nội dung.'
      },
      error.status || 500
    );
  }
}
