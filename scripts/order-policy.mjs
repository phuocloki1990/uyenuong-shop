// Trusted order normalization. No client name/price is used for order records.
import { products } from './generated/product-catalog.mjs';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string' ? value.trim() : '';
const money = value => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;

// Old carts contain an option label instead of structured choices.
// Accept only an exact listed value; unknown choices must never become a priced order.
function legacyOptions(item, product) {
  let label = string(item.option);
  const quantity = Number(item.quantity);
  if (product.id === 'phuclinh') label = label.replace(new RegExp(` · ${quantity} cái$`), '');
  const groups = product.option_groups;
  if (groups.length === 1) {
    const group = groups[0];
    if (group.key === 'package' && ['4 mâm', '6 mâm', '8 mâm'].includes(label)) {
      label = `Gói ${label}`;
    }
    return { [group.key]: label };
  }
  if (groups.length === 0) return {};
  return {};
}

export function normalizeTrustedItems(items, catalog = products) {
  if (!Array.isArray(items) || !items.length || items.length > 30) {
    throw new Error('Số dòng sản phẩm không hợp lệ (tối đa 30).');
  }
  return items.map(item => {
    if (!plain(item)) throw new Error('Thông tin sản phẩm không hợp lệ.');
    let id = string(item.id);
    // Compatibility for an older checkout that sent one ID for both cake types.
    if (id === 'phuthe') {
      const label = string(item.option);
      if (label.startsWith('Huế · ')) id = 'phuthehue';
      else if (label.startsWith('Miền Bắc · ')) id = 'phuthebac';
    }
    const product = Object.hasOwn(catalog, id) ? catalog[id] : null;
    if (!product || product.status !== 'published') {
      throw new Error('Sản phẩm không còn khả dụng. Vui lòng tải lại trang.');
    }
    const quantity = item.quantity;
    const q = product.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < q.min || quantity > 100000 ||
        (quantity - q.min) % q.step !== 0) {
      throw new Error(`Số lượng ${product.name} không hợp lệ (tối thiểu ${q.min}).`);
    }
    let options = plain(item.options) ? item.options : legacyOptions(item, product);
    if (string(item.id) === 'phuthe' && !plain(item.options)) {
      const label = string(item.option);
      options = { wrap: label.replace(/^(Huế|Miền Bắc) · /, '') };
    }
    const normalized = {};
    for (const group of product.option_groups) {
      const value = string(options[group.key]);
      if (!group.values.includes(value)) {
        throw new Error(`Quy cách ${product.name} không hợp lệ. Vui lòng chọn lại.`);
      }
      normalized[group.key] = value;
    }
    let total = null;
    if (product.price_mode === 'fixed') total = product.base_price * quantity;
    else if (product.price_mode === 'hybrid') {
      const matches = product.price_rules.filter(rule =>
        Object.entries(rule.when).every(([key, value]) =>
          key === 'qty' ? quantity === value : normalized[key] === value
        )
      );
      if (matches.length === 1) total = matches[0].price;
    }
    // price_text and display name supplied by the browser are deliberately ignored.
    return {
      id: product.id,
      name: product.name,
      option: Object.values(normalized).join(' · '),
      options: normalized,
      quantity,
      line_total: total,
      price_text: total === null ? 'Giá liên hệ' : money(total)
    };
  });
}

export function vnDate(now = new Date()) {
  // Vietnam remains UTC+7 and does not observe daylight saving time.
  return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}

export function minReceiveDate(items, now = new Date()) {
  const base = new Date(`${vnDate(now)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + (items.some(item => item.id === 'mamqua') ? 3 : 1));
  return base.toISOString().slice(0, 10);
}
