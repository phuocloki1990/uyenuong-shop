// functions/admin/api/content/save.js
//
// API lưu nội dung Shop Uyên Ương.
//
// - Sửa sản phẩm đầy đủ.
// - Tạo sản phẩm mới.
// - Giữ tương thích với cách lưu văn bản cũ.
// - Kiểm tra dữ liệu sản phẩm trước khi ghi.
// - Kiểm tra SHA để chống ghi đè.
// - Chỉ ghi vào nhánh được cấu hình trên server.
// - Không sửa HTML generated hoặc D1.

import {
  validateProduct
} from '../../../../scripts/product-validation.mjs';

const OWNER = 'phuocloki1990';
const REPO = 'uyenuong-shop';

const SHA = /^[a-f0-9]{40}$/i;

const SLUG =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const FOLDERS = {
  products: 'content/products',
  articles: 'content/articles',
  categories: 'content/categories'
};

const LEGACY_FIELDS = {
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

const REQUIRED = new Set([
  'name',
  'title',
  'short_description',
  'lead',
  'excerpt'
]);

const MAX_BYTES = 100_000;

const isObj = value =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value);

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store'
    }
  });

const headers = token => ({
  Accept: 'application/vnd.github+json',

  Authorization: `Bearer ${token}`,

  'User-Agent': 'uyenuong-shop-admin',

  'X-GitHub-Api-Version': '2022-11-28'
});

const api = path =>
  `https://api.github.com/repos/${OWNER}/${REPO}/${path}`;

function textToBase64(text) {
  const bytes =
    new TextEncoder().encode(text);

  let result = '';

  for (
    let i = 0;
    i < bytes.length;
    i += 8192
  ) {
    result += String.fromCharCode(
      ...bytes.subarray(i, i + 8192)
    );
  }

  return btoa(result);
}

function base64ToText(value) {
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

function exception(
  message,
  status = 400,
  extra = {}
) {
  const error = new Error(message);

  error.status = status;
  error.extra = extra;

  throw error;
}

async function gh(
  token,
  path,
  options = {}
) {
  const response = await fetch(
    api(path),
    {
      ...options,

      headers: {
        ...headers(token),
        ...(options.headers || {})
      },

      cache: 'no-store'
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      exception(
        'Không tìm thấy file trên GitHub.',
        404
      );
    }

    if (
      response.status === 409 ||
      response.status === 422
    ) {
      exception(
        'GitHub báo dữ liệu hoặc phiên bản đã thay đổi. Hãy tải lại trước khi lưu.',
        409
      );
    }

    console.error(
      'GitHub API:',
      response.status,
      path
    );

    exception(
      'GitHub chưa xử lý được yêu cầu.',
      502,
      {
        github_status:
          response.status
      }
    );
  }

  return response.json();
}

const filePath = (kind, filename) =>
  `${FOLDERS[kind]}/${filename}`;

async function readFile(
  token,
  path,
  branch
) {
  const file = await gh(
    token,

    `contents/${path}?ref=${encodeURIComponent(branch)}`
  );

  if (
    file.type !== 'file' ||
    file.encoding !== 'base64' ||
    typeof file.content !== 'string' ||
    !SHA.test(file.sha)
  ) {
    exception(
      'Nội dung GitHub không đúng định dạng.',
      502
    );
  }

  const data = JSON.parse(
    base64ToText(file.content)
  );

  if (!isObj(data)) {
    exception(
      'File JSON không đúng cấu trúc.',
      502
    );
  }

  return {
    data,
    sha: file.sha
  };
}

async function listFiles(
  token,
  kind,
  branch
) {
  const rows = await gh(
    token,

    `contents/${FOLDERS[kind]}?ref=${encodeURIComponent(branch)}`
  );

  if (!Array.isArray(rows)) {
    exception(
      'GitHub không trả về danh sách.',
      502
    );
  }

  return rows.filter(
    row =>
      row.type === 'file' &&
      row.name.endsWith('.json')
  );
}

const urlFor = (kind, slug) =>
  `/${{
    products: 'san-pham',
    articles: 'cam-nang',
    categories: 'chuyen-muc'
  }[kind]}/${slug}.html`;

async function checkReferences(
  token,
  branch,
  product,
  filename,
  oldProduct = null
) {
  const [
    products,
    articles,
    categories
  ] = await Promise.all(
    [
      'products',
      'articles',
      'categories'
    ].map(kind =>
      listFiles(
        token,
        kind,
        branch
      )
    )
  );

  const files = {
    products,
    articles,
    categories
  };

  const all = await Promise.all(
    Object.entries(files).flatMap(
      ([kind, rows]) =>
        rows.map(async row => {
          if (
            kind === 'products' &&
            row.name === filename &&
            oldProduct
          ) {
            return {
              kind,
              filename: row.name,
              data: oldProduct
            };
          }

          const { data } = await readFile(
            token,
            filePath(kind, row.name),
            branch
          );

          return {
            kind,
            filename: row.name,
            data
          };
        })
    )
  );

  const other = all.filter(
    item =>
      !(
        item.kind === 'products' &&
        item.filename === filename
      )
  );

  const categoryMap = new Map(
    all
      .filter(
        item =>
          item.kind === 'categories'
      )
      .map(
        item => [
          item.data.slug,
          item.data
        ]
      )
  );

  if (
    !categoryMap.has(
      product.category
    )
  ) {
    exception(
      'Chuyên mục sản phẩm không tồn tại.',
      400,
      { field: 'category' }
    );
  }

  let category =
    product.category;

  const visited = new Set();

  while (category) {
    if (
      visited.has(category)
    ) {
      exception(
        'Chuyên mục có vòng lặp.',
        400,
        { field: 'category' }
      );
    }

    visited.add(category);

    const current =
      categoryMap.get(category);

    if (!current) {
      exception(
        'Chuyên mục cha không tồn tại.',
        400,
        { field: 'category' }
      );
    }

    if (
      product.status === 'published' &&
      current.status !== 'published'
    ) {
      exception(
        'Chuyên mục đang ẩn, không thể xuất bản sản phẩm.',
        400,
        { field: 'category' }
      );
    }

    category =
      current.parent || '';
  }

  if (
    other.some(
      item =>
        item.kind === 'products' &&
        item.data.id === product.id
    )
  ) {
    exception(
      'Mã nội bộ đã được sản phẩm khác sử dụng.',
      409,
      { field: 'id' }
    );
  }

  if (
    other.some(
      item =>
        item.kind === 'products' &&
        item.data.slug === product.slug
    )
  ) {
    exception(
      'Slug sản phẩm đã tồn tại.',
      409,
      { field: 'slug' }
    );
  }

  for (
    const kind of [
      'products',
      'articles'
    ]
  ) {
    const related =
      product[`related_${kind}`] || [];

    for (const slug of related) {
      if (
        !other.some(
          item =>
            item.kind === kind &&
            item.data.slug === slug
        )
      ) {
        exception(
          `Liên kết ${kind}: ${slug} không tồn tại hoặc tự liên kết.`,
          400,
          {
            field:
              `related_${kind}`
          }
        );
      }

      if (
        kind === 'products' &&
        slug === product.slug
      ) {
        exception(
          'Không thể liên kết tới chính sản phẩm.',
          400,
          {
            field:
              'related_products'
          }
        );
      }
    }
  }

  const activePaths = new Set([
    ...other.map(
      item =>
        urlFor(
          item.kind,
          item.data.slug
        )
    ),

    urlFor(
      'products',
      product.slug
    )
  ]);

  const aliases = new Set(
    other.flatMap(
      item =>
        item.data.redirect_from || []
    )
  );

  const reserved =
    /^\/(?:admin(?:\/|$)|api(?:\/|$)|assets(?:\/|$)|css(?:\/|$)|content(?:\/|$)|scripts(?:\/|$)|(?:index|dat-hang|gio-hang)\.html$|(?:sitemap\.xml|robots\.txt|_redirects|_headers)$)/i;

  for (
    const from of
    product.redirect_from || []
  ) {
    if (
      !/^\/[a-z0-9/-]+\.html$/.test(from) ||
      from.includes('//') ||
      reserved.test(from)
    ) {
      exception(
        'URL chuyển hướng không hợp lệ.',
        400,
        {
          field:
            'redirect_from'
        }
      );
    }

    if (
      activePaths.has(from) ||
      aliases.has(from)
    ) {
      exception(
        `URL chuyển hướng đã được sử dụng: ${from}`,
        409,
        {
          field:
            'redirect_from'
        }
      );
    }
  }

  return true;
}

function applyLegacy(
  kind,
  original,
  changes
) {
  if (
    !isObj(changes) ||
    !Object.keys(changes).length ||
    Object.keys(changes).length > 6
  ) {
    exception(
      'Cần thay đổi từ 1 đến 6 trường văn bản.'
    );
  }

  const data =
    structuredClone(original);

  for (
    const [field, value] of
    Object.entries(changes)
  ) {
    if (
      !LEGACY_FIELDS[kind].includes(field) ||
      typeof value !== 'string' ||
      value.includes('\u0000')
    ) {
      exception(
        'Trường không được phép sửa: ' +
        field
      );
    }

    const max =
      field === 'seo.title'
        ? 70
        : field === 'seo.description'
          ? 180
          : field === 'excerpt'
            ? 300
            : [
              'name',
              'title',
              'image_alt'
            ].includes(field)
              ? 200
              : 5000;

    if (
      value.length > max ||
      (
        REQUIRED.has(field) &&
        !value.trim()
      )
    ) {
      exception(
        'Dữ liệu trường không hợp lệ: ' +
        field
      );
    }

    if (
      field.startsWith('seo.')
    ) {
      data.seo =
        isObj(data.seo)
          ? data.seo
          : {};

      data.seo[
        field.slice(4)
      ] = value;
    } else {
      data[field] = value;
    }
  }

  return data;
}

export function onRequestGet({
  env
}) {
  return reply({
    success: true,

    service:
      'Admin content save API',

    ready: Boolean(
      env.GITHUB_CONTENT_TOKEN
    ),

    branch_configured:
      Boolean(
        env.GITHUB_CONTENT_BRANCH
      ),

    mode:
      'Products full create/update; articles and categories legacy text update',

    editable_fields:
      LEGACY_FIELDS
  });
}

export async function onRequestPost({
  request,
  env
}) {
  try {
    if (
      request.headers.get('Origin') !==
      new URL(request.url).origin
    ) {
      exception(
        'Nguồn yêu cầu không hợp lệ.',
        403
      );
    }

    if (
      !/^application\/json(?:\s*;|$)/i.test(
        request.headers.get(
          'Content-Type'
        ) || ''
      )
    ) {
      exception(
        'Yêu cầu phải gửi JSON.',
        415
      );
    }

    if (
      Number(
        request.headers.get(
          'Content-Length'
        )
      ) > MAX_BYTES
    ) {
      exception(
        'Dữ liệu quá lớn.',
        413
      );
    }

    const raw =
      await request.text();

    if (
      new TextEncoder()
        .encode(raw)
        .length > MAX_BYTES
    ) {
      exception(
        'Dữ liệu quá lớn.',
        413
      );
    }

    let input;

    try {
      input =
        JSON.parse(raw);
    } catch {
      exception(
        'JSON không hợp lệ.'
      );
    }

    if (
      !isObj(input) ||
      typeof input.kind !== 'string' ||
      !Object.hasOwn(
        FOLDERS,
        input.kind
      )
    ) {
      exception(
        'Loại nội dung không hợp lệ.'
      );
    }

    const kind =
      input.kind;

    const filename =
      input.filename ||
      (
        kind === 'products' &&
        input.action === 'create' &&
        typeof input.data?.slug === 'string'
          ? `${input.data.slug}.json`
          : null
      );

    if (
      typeof filename !== 'string' ||
      !filename.endsWith('.json') ||
      !SLUG.test(
        filename.slice(0, -5)
      )
    ) {
      exception(
        'Tên file không hợp lệ.'
      );
    }

    const action =
      input.action === 'create'
        ? 'create'
        : 'update';

    if (
      action === 'create' &&
      kind !== 'products'
    ) {
      exception(
        'Chỉ hỗ trợ tạo sản phẩm trong đợt này.'
      );
    }

    if (
      action === 'update' &&
      !SHA.test(
        input.sha || ''
      )
    ) {
      exception(
        'Thiếu hoặc sai sha của file.'
      );
    }

    if (
      input.dry_run !== true &&
      input.confirm_write !== true
    ) {
      exception(
        'Chưa xác nhận thao tác lưu.'
      );
    }

    if (
      !env.GITHUB_CONTENT_TOKEN
    ) {
      exception(
        'Thiếu GitHub token.',
        503
      );
    }

    // Không cho API tự đoán nhánh main.
    // Nhánh được quyền ghi phải cấu hình
    // tại Cloudflare Pages.

    const branch = String(
      env.GITHUB_CONTENT_BRANCH || ''
    ).trim();

    if (
      !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(
        branch
      )
    ) {
      exception(
        'Chưa cấu hình GITHUB_CONTENT_BRANCH cho Pages.',
        503
      );
    }

    const token =
      env.GITHUB_CONTENT_TOKEN;

    const path =
      filePath(
        kind,
        filename
      );

    const existing =
      action === 'update'
        ? await readFile(
            token,
            path,
            branch
          )
        : null;

    if (
      action === 'create'
    ) {
      const rows =
        await listFiles(
          token,
          'products',
          branch
        );

      if (
        rows.some(
          item =>
            item.name === filename
        )
      ) {
        exception(
          'Tên file sản phẩm đã tồn tại.',
          409,
          {
            field:
              'filename'
          }
        );
      }
    } else if (
      existing.sha !== input.sha
    ) {
      exception(
        'File đã có phiên bản mới, hãy tải lại trước khi lưu.',
        409,
        {
          current_sha:
            existing.sha
        }
      );
    }

    let data;

    if (
      kind === 'products' &&
      isObj(input.data)
    ) {
      data = existing
        ? {
            ...existing.data,
            ...input.data,

            seo: {
              ...(existing.data.seo || {}),
              ...(input.data.seo || {})
            }
          }
        : structuredClone(
            input.data
          );

      if (
        existing &&
        data.id !== existing.data.id
      ) {
        exception(
          'Mã nội bộ sản phẩm không được thay đổi.',
          400,
          {
            field: 'id'
          }
        );
      }

      if (
        existing &&
        data.slug !==
          existing.data.slug
      ) {
        const oldUrl =
          urlFor(
            'products',
            existing.data.slug
          );

        data.redirect_from = [
          ...new Set([
            ...(data.redirect_from || []),
            oldUrl
          ])
        ];
      }

      const check =
        validateProduct(data);

      if (!check.valid) {
        return reply(
          {
            success: false,

            message:
              'Sản phẩm có dữ liệu chưa hợp lệ.',

            errors:
              check.errors
          },
          400
        );
      }

      data =
        check.product;

      await checkReferences(
        token,
        branch,
        data,
        filename,
        existing?.data || null
      );

    } else {
      if (
        action === 'create' ||
        !existing ||
        !isObj(input.changes)
      ) {
        exception(
          'Thiếu dữ liệu sản phẩm hoặc thay đổi văn bản.'
        );
      }

      data =
        applyLegacy(
          kind,
          existing.data,
          input.changes
        );

      if (
        kind === 'products'
      ) {
        const check =
          validateProduct(data);

        if (!check.valid) {
          return reply(
            {
              success: false,

              message:
                'Sản phẩm không hợp lệ.',

              errors:
                check.errors
            },
            400
          );
        }

        data =
          check.product;

        await checkReferences(
          token,
          branch,
          data,
          filename,
          existing.data
        );
      }
    }

    if (
      existing &&
      JSON.stringify(existing.data) ===
        JSON.stringify(data)
    ) {
      return reply({
        success: true,

        saved: false,
        changed: false,

        message:
          'Nội dung đã được lưu, không có thay đổi mới.',

        sha:
          existing.sha
      });
    }

    if (
      input.dry_run === true
    ) {
      return reply({
        success: true,

        dry_run: true,
        saved: false,

        kind,
        filename,
        data
      });
    }

    const newText =
      JSON.stringify(
        data,
        null,
        2
      ) + '\n';

    const body = {
      message:
        `Admin: ${action} ${kind}/${filename}`,

      content:
        textToBase64(newText),

      branch
    };

    if (existing) {
      body.sha =
        existing.sha;
    }

    const saved =
      await gh(
        token,

        `contents/${path}`,

        {
          method: 'PUT',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(body)
        }
      );

    return reply({
      success: true,
      saved: true,

      kind,
      filename,

      sha:
        saved.content?.sha ||
        null,

      commit_sha:
        saved.commit?.sha ||
        null,

      branch,

      message:
        'Đã lưu lên GitHub; đang chờ build và triển khai.'
    });

  } catch (error) {
    console.error(
      'Admin save:',
      error.status || 500,
      error.message
    );

    return reply(
      {
        success: false,

        message:
          error.status
            ? error.message
            : 'Không thể xử lý yêu cầu lưu nội dung.',

        ...(error.extra || {})
      },

      error.status || 500
    );
  }
}
