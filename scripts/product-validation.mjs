// scripts/product-validation.mjs
//
// Kiểm tra dữ liệu sản phẩm trước khi lưu lên GitHub.
// Dùng chung cho API Admin và kiểm thử.
//
// Không tự ghi file.
// Không thay đổi sản phẩm đang bán.

export const PRODUCT_SLUG =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ID =
  /^[A-Za-z0-9_-]+$/;

const KEY =
  /^[a-z][a-z0-9_]*$/;

const RESERVED_KEYS = new Set([
  'qty',
  '__proto__',
  'prototype',
  'constructor'
]);

const OBJECT = value =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value);

const TEXT = value =>
  typeof value === 'string' &&
  value.trim().length > 0;

const INT = value =>
  Number.isSafeInteger(value) &&
  value > 0;

const OPTIONAL_LISTS = [
  'card_highlights',
  'option_groups',
  'price_rules',
  'details',
  'features',
  'faq',
  'related_products',
  'related_articles',
  'redirect_from'
];

const KEY_LISTS = [
  'related_products',
  'related_articles',
  'redirect_from'
];

export function validateProduct(source) {
  const errors = [];

  const err = (field, message) => {
    errors.push({
      field,
      message
    });
  };

  if (!OBJECT(source)) {
    return {
      valid: false,
      errors: [
        {
          field: 'product',
          message:
            'Dữ liệu phải là một object JSON.'
        }
      ]
    };
  }

  const p = structuredClone(source);

  // Chuẩn hóa các danh sách tùy chọn.

  for (const key of OPTIONAL_LISTS) {
    if (p[key] === undefined) {
      p[key] = [];
    }

    if (!Array.isArray(p[key])) {
      err(key, 'Phải là danh sách.');
    }
  }

  // Draft may omit marketing copy and image, but not product identity or quantity.
  const draft = p.status === 'draft';

  // Các trường bắt buộc.

  for (const key of [
    'id',
    'name',
    'slug',
    'category',
    'status',
    'image',
    'short_description',
    'lead',
    'price_mode',
    'price_text'
  ]) {
    if (draft && ['image','short_description','lead','price_text'].includes(key) && p[key] === '') continue;
    if (!TEXT(p[key])) {
      err(key, 'Không được để trống.');
    }
  }

  // Nhận diện và chuyên mục.

  if (TEXT(p.id) && !ID.test(p.id)) {
    err(
      'id',
      'Chỉ dùng chữ cái, số, dấu _ hoặc -.'
    );
  }

  if (
    TEXT(p.slug) &&
    !PRODUCT_SLUG.test(p.slug)
  ) {
    err(
      'slug',
      'Chỉ dùng chữ thường không dấu, số và dấu -.'
    );
  }

  if (
    TEXT(p.category) &&
    !PRODUCT_SLUG.test(p.category)
  ) {
    err(
      'category',
      'Mã chuyên mục không hợp lệ.'
    );
  }

  if (
    TEXT(p.status) &&
    ![
      'published',
      'draft',
      'hidden'
    ].includes(p.status)
  ) {
    err(
      'status',
      'Trạng thái không hợp lệ.'
    );
  }

  // Trang chủ.

  if (p.featured === undefined) {
    p.featured = false;
  }

  if (typeof p.featured !== 'boolean') {
    err(
      'featured',
      'Phải bật hoặc tắt.'
    );
  }

  if (p.featured_order === undefined) {
    p.featured_order = 99;
  }

  if (
    !Number.isFinite(
      p.featured_order
    )
  ) {
    err(
      'featured_order',
      'Thứ tự phải là số.'
    );
  }

  if (p.card_highlights?.length > 2) {
    err(
      'card_highlights',
      'Tối đa hai thông tin ngắn.'
    );
  }

  // Hình ảnh.

  if (p.image !== undefined && typeof p.image !== 'string') err('image', 'Phải là văn bản.');

  if (
    TEXT(p.image) &&
    !/^\/assets\/images\/[A-Za-z0-9_.\/-]+$/.test(
      p.image
    )
  ) {
    err(
      'image',
      'Chỉ dùng ảnh trong /assets/images/.'
    );
  }

  if (
    TEXT(p.image) &&
    p.image.split('/').includes('..')
  ) {
    err(
      'image',
      'Đường dẫn ảnh không hợp lệ.'
    );
  }

  if (
    p.image_alt !== undefined &&
    typeof p.image_alt !== 'string'
  ) {
    err(
      'image_alt',
      'Phải là văn bản.'
    );
  }

  if (p.image_alt?.length > 200) {
    err(
      'image_alt',
      'Tối đa 200 ký tự.'
    );
  }

  // Độ dài văn bản.

  for (const [key, max] of [
    ['name', 200],
    ['short_description', 5000],
    ['lead', 5000],
    ['price_text', 200]
  ]) {
    if (
      typeof p[key] === 'string' &&
      p[key].length > max
    ) {
      err(
        key,
        `Tối đa ${max} ký tự.`
      );
    }
  }

  // Chế độ giá.

  if (
    ![
      'contact',
      'fixed',
      'hybrid'
    ].includes(p.price_mode)
  ) {
    err(
      'price_mode',
      'Chế độ giá không hợp lệ.'
    );
  }

  if (
    p.base_price !== undefined &&
    (
      !Number.isFinite(
        p.base_price
      ) ||
      p.base_price <= 0
    )
  ) {
    err(
      'base_price',
      'Giá phải là số dương.'
    );
  }

  if (
    p.price_mode === 'fixed' &&
    p.base_price === undefined
  ) {
    err(
      'base_price',
      'Giá cố định cần đơn giá.'
    );
  }

  // Số lượng.

  if (!OBJECT(p.quantity)) {
    err(
      'quantity',
      'Cần thông tin số lượng.'
    );

  } else {
    const q = p.quantity;

    for (const key of [
      'label',
      'unit'
    ]) {
      if (!TEXT(q[key])) {
        err(
          `quantity.${key}`,
          'Không được để trống.'
        );
      }
    }

    if (
      q.hint !== undefined &&
      typeof q.hint !== 'string'
    ) {
      err(
        'quantity.hint',
        'Phải là văn bản.'
      );
    }

    for (const key of [
      'min',
      'default',
      'step'
    ]) {
      if (!INT(q[key])) {
        err(
          `quantity.${key}`,
          'Phải là số nguyên dương.'
        );
      }
    }

    if (
      INT(q.min) &&
      INT(q.default) &&
      INT(q.step) &&
      (
        q.default < q.min ||
        (q.default - q.min) %
          q.step !== 0
      )
    ) {
      err(
        'quantity.default',
        'Mặc định phải >= tối thiểu và khớp bước tăng.'
      );
    }
  }

  // Các lựa chọn: đóng gói, số vị, gói mâm...

  const optionKeys = new Set();

  if (
    Array.isArray(
      p.option_groups
    )
  ) {
    p.option_groups.forEach(
      (group, index) => {
        const base =
          `option_groups.${index}`;

        if (!OBJECT(group)) {
          err(
            base,
            'Phải là object.'
          );

          return;
        }

        if (
          !TEXT(group.key) ||
          !KEY.test(group.key) ||
          RESERVED_KEYS.has(
            group.key
          ) ||
          optionKeys.has(
            group.key
          )
        ) {
          err(
            `${base}.key`,
            'Mã lựa chọn trùng hoặc không hợp lệ.'
          );

        } else {
          optionKeys.add(
            group.key
          );
        }

        if (!TEXT(group.label)) {
          err(
            `${base}.label`,
            'Không được để trống.'
          );
        }

        if (
          !Array.isArray(
            group.values
          ) ||
          !group.values.length ||
          group.values.some(
            value => !TEXT(value)
          ) ||
          new Set(
            group.values
          ).size !==
            group.values.length
        ) {
          err(
            `${base}.values`,
            'Cần giá trị không rỗng và không trùng.'
          );
        }
      }
    );
  }

  // Giá theo quy cách.
  //
  // Mỗi dòng price_rules.price là TỔNG GIÁ
  // của đúng quy cách, không phải đơn giá.

  if (
    Array.isArray(
      p.price_rules
    )
  ) {
    p.price_rules.forEach(
      (rule, index) => {
        const base =
          `price_rules.${index}`;

        if (!OBJECT(rule)) {
          err(
            base,
            'Phải là object.'
          );

          return;
        }

        if (!TEXT(rule.label)) {
          err(
            `${base}.label`,
            'Không được để trống.'
          );
        }

        if (
          !Number.isFinite(
            rule.price
          ) ||
          rule.price <= 0
        ) {
          err(
            `${base}.price`,
            'Tổng giá phải là số dương.'
          );
        }

        if (
          !OBJECT(rule.when) ||
          !Object.keys(
            rule.when
          ).length
        ) {
          err(
            `${base}.when`,
            'Cần điều kiện giá.'
          );

          return;
        }

        const q = p.quantity;

        if (
          !INT(rule.when.qty) ||
          (
            OBJECT(q) &&
            INT(q.min) &&
            INT(q.step) &&
            (
              rule.when.qty <
                q.min ||
              (rule.when.qty -
                q.min) %
                q.step !== 0
            )
          )
        ) {
          err(
            `${base}.when.qty`,
            'Số lượng của quy cách không hợp lệ.'
          );
        }

        for (
          const [key, value] of
          Object.entries(
            rule.when
          )
        ) {
          if (key === 'qty') {
            continue;
          }

          const group =
            Array.isArray(
              p.option_groups
            )
              ? p.option_groups.find(
                  item =>
                    OBJECT(item) &&
                    item.key === key
                )
              : null;

          if (
            !group ||
            !Array.isArray(
              group.values
            ) ||
            !group.values.includes(
              value
            )
          ) {
            err(
              `${base}.when.${key}`,
              'Không khớp lựa chọn sản phẩm.'
            );
          }
        }
      }
    );

    if (
      p.price_mode !==
        'hybrid' &&
      p.price_rules.length
    ) {
      err(
        'price_rules',
        'Chỉ dùng bảng giá cho chế độ Theo quy cách.'
      );
    }

    // Không để hai dòng cùng áp dụng
    // cho một tổ hợp lựa chọn và số lượng.

    for (
      let i = 0;
      i < p.price_rules.length;
      i++
    ) {
      for (
        let j = i + 1;
        j < p.price_rules.length;
        j++
      ) {
        const a =
          p.price_rules[i]?.when;

        const b =
          p.price_rules[j]?.when;

        if (
          !OBJECT(a) ||
          !OBJECT(b)
        ) {
          continue;
        }

        const common =
          Object.keys(a).filter(
            key =>
              Object.hasOwn(
                b,
                key
              )
          );

        if (
          common.every(
            key =>
              a[key] === b[key]
          )
        ) {
          err(
            `price_rules.${j}`,
            'Quy cách trùng hoặc chồng điều kiện với dòng ' +
              (i + 1) +
              '.'
          );
        }
      }
    }
  }

  // Thông tin nhanh và FAQ.

  for (const key of [
    'details',
    'faq'
  ]) {
    if (
      !Array.isArray(
        p[key]
      )
    ) {
      continue;
    }

    p[key].forEach(
      (entry, index) => {
        if (!OBJECT(entry)) {
          err(
            `${key}.${index}`,
            'Phải là object.'
          );

          return;
        }

        const fields =
          key === 'details'
            ? [
                'label',
                'value'
              ]
            : [
                'question',
                'answer'
              ];

        for (
          const field of fields
        ) {
          if (
            !TEXT(
              entry[field]
            )
          ) {
            err(
              `${key}.${index}.${field}`,
              'Không được để trống.'
            );
          }
        }
      }
    );
  }

  // Các danh sách văn bản và liên kết.

  for (const key of [
    'features',
    'card_highlights',
    ...KEY_LISTS
  ]) {
    if (
      !Array.isArray(
        p[key]
      )
    ) {
      continue;
    }

    if (
      p[key].some(
        value => !TEXT(value)
      )
    ) {
      err(
        key,
        'Danh sách không được có giá trị rỗng.'
      );
    }

    if (
      new Set(
        p[key]
      ).size !==
        p[key].length
    ) {
      err(
        key,
        'Danh sách có giá trị trùng.'
      );
    }
  }

  for (const key of [
    'related_products',
    'related_articles'
  ]) {
    if (
      p[key]?.length > 6
    ) {
      err(
        key,
        'Tối đa 6 nội dung liên quan.'
      );
    }

    if (
      Array.isArray(
        p[key]
      ) &&
      p[key].some(
        value =>
          !PRODUCT_SLUG.test(
            value
          )
      )
    ) {
      err(
        key,
        'Slug liên quan không hợp lệ.'
      );
    }
  }

  if (
    Array.isArray(
      p.related_products
    ) &&
    p.related_products.includes(
      p.slug
    )
  ) {
    err(
      'related_products',
      'Không tự liên kết sản phẩm này.'
    );
  }

  // SEO.

  if (
    p.seo === undefined
  ) {
    p.seo = {};
  }

  if (!OBJECT(p.seo)) {
    err(
      'seo',
      'Phải là object.'
    );

  } else {
    for (const key of [
      'title',
      'description',
      'focus_keyword'
    ]) {
      if (
        p.seo[key] !== undefined &&
        typeof p.seo[key] !==
          'string'
      ) {
        err(
          `seo.${key}`,
          'Phải là văn bản.'
        );
      }
    }

    if (
      (
        p.seo.title?.length ||
        0
      ) > 70
    ) {
      err(
        'seo.title',
        'Tối đa 70 ký tự.'
      );
    }

    if (
      (
        p.seo.description?.length ||
        0
      ) > 180
    ) {
      err(
        'seo.description',
        'Tối đa 180 ký tự.'
      );
    }

    if (
      p.seo.secondary_keywords ===
      undefined
    ) {
      p.seo.secondary_keywords = [];
    }

    if (
      !Array.isArray(
        p.seo.secondary_keywords
      ) ||
      p.seo.secondary_keywords.some(
        value =>
          !TEXT(value)
      )
    ) {
      err(
        'seo.secondary_keywords',
        'Phải là danh sách từ khóa hợp lệ.'
      );
    }
  }

  // URL cũ phục vụ chuyển hướng.

  if (
    Array.isArray(
      p.redirect_from
    )
  ) {
    for (
      const [index, value] of
      p.redirect_from.entries()
    ) {
      if (
        typeof value !==
          'string' ||
        !/^\/[a-z0-9/-]+\.html$/.test(
          value
        ) ||
        value.includes('//') ||
        value
          .split('/')
          .includes('..')
      ) {
        err(
          `redirect_from.${index}`,
          'URL cũ phải là đường dẫn .html nội bộ.'
        );
      }
    }
  }

  return {
    valid:
      errors.length === 0,

    errors,

    product: p
  };
}
