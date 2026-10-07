export class OrderValidationError extends Error {
  constructor(message, code = 'invalid_order') {
    super(message);
    this.name = 'OrderValidationError';
    this.code = code;
  }
}

const text = value => String(value ?? '').trim();

function fail(message, code) {
  throw new OrderValidationError(message, code);
}

function validDate(value) {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function normalizePhone(value) {
  const raw = text(value);
  const compact = raw.replace(/[\s.()-]/g, '');
  if (!/^\+?\d{8,15}$/.test(compact)) fail('Số điện thoại không hợp lệ.', 'invalid_phone');
  return compact;
}

function findOption(group, optionId) {
  const option = group.options.find(item => item.id === optionId);
  if (!option) fail(`Lựa chọn ${group.name} không hợp lệ.`, 'invalid_option');
  return option;
}

function validateQuantity(product, rawQuantity) {
  if (!product.quantity?.enabled) return 1;
  const quantity = Number(rawQuantity);
  const min = Number(product.quantity.min_value || 1);
  const step = Number(product.quantity.step || 1);
  if (!Number.isInteger(quantity) || quantity < min || quantity > 100000) fail('Số lượng không hợp lệ.', 'invalid_quantity');
  if ((quantity - min) % step !== 0) fail('Số lượng không đúng bước tăng đã cấu hình.', 'invalid_quantity');
  return quantity;
}

function normalizeNote(product, configuration) {
  if (!product.note?.enabled) return '';
  const note = text(configuration?.note);
  if (note.length > 1000) fail('Ghi chú sản phẩm quá dài.', 'invalid_note');
  return note;
}

function normalizeVariantOrSimple(product, rawItem) {
  const configuration = rawItem.configuration && typeof rawItem.configuration === 'object' && !Array.isArray(rawItem.configuration) ? rawItem.configuration : {};
  const selected = {};
  const optionParts = [];

  for (const group of product.option_groups || []) {
    const rawSelected = configuration.options?.[group.id];
    const optionId = text(typeof rawSelected === 'object' ? rawSelected.id : rawSelected);
    if (!optionId) {
      if (group.required !== false) fail(`Vui lòng chọn ${group.name}.`, 'missing_option');
      continue;
    }
    const option = findOption(group, optionId);
    const customText = option.allow_custom_text ? text(typeof rawSelected === 'object' ? rawSelected.custom_text : configuration.custom_options?.[group.id]) : '';
    if (option.allow_custom_text && !customText) fail(`Vui lòng ghi rõ ${group.name.toLowerCase()}.`, 'missing_custom_option');
    if (customText.length > 180) fail(`${group.name} quá dài.`, 'invalid_option');
    selected[group.id] = { id: option.id, ...(customText ? { custom_text: customText } : {}) };
    optionParts.push(`${group.name}: ${option.label}${customText ? ` – ${customText}` : ''}`);
  }

  const quantity = validateQuantity(product, rawItem.quantity);
  const note = normalizeNote(product, configuration);
  return {
    quantity,
    option: optionParts.join(' · ') || 'Theo yêu cầu',
    configuration: {
      options: selected,
      ...(note ? { note } : {})
    }
  };
}

function normalizeComposite(product, rawItem) {
  const configuration = rawItem.configuration && typeof rawItem.configuration === 'object' && !Array.isArray(rawItem.configuration) ? rawItem.configuration : {};
  if (!Array.isArray(configuration.components) || configuration.components.length < 1) fail('Vui lòng chọn ít nhất một lễ vật.', 'missing_components');
  if (configuration.components.length > product.components.length) fail('Danh sách lễ vật không hợp lệ.', 'invalid_components');

  const catalogById = new Map(product.components.map(item => [item.id, item]));
  const seen = new Set();
  const normalized = [];
  const labels = [];

  for (const rawComponent of configuration.components) {
    if (!rawComponent || typeof rawComponent !== 'object') fail('Lễ vật không hợp lệ.', 'invalid_components');
    const id = text(rawComponent.id);
    const component = catalogById.get(id);
    if (!component || seen.has(id)) fail('Lễ vật không hợp lệ hoặc bị trùng.', 'invalid_components');
    seen.add(id);

    const clean = { id };
    let label = component.label;

    if (component.sub_option) {
      const rawSub = rawComponent.sub_options?.[component.sub_option.id];
      const subId = text(typeof rawSub === 'object' ? rawSub.id : rawSub);
      if (!subId) fail(`Vui lòng chọn ${component.sub_option.name} cho ${component.label}.`, 'missing_option');
      const option = findOption(component.sub_option, subId);
      clean.sub_options = { [component.sub_option.id]: { id: option.id } };
      label += ` (${option.label})`;
    }

    if (component.allow_custom_text) {
      const customText = text(rawComponent.custom_text);
      if (!customText) fail(`Vui lòng ghi rõ ${component.label.toLowerCase()}.`, 'missing_custom_option');
      if (customText.length > 180) fail(`${component.label} quá dài.`, 'invalid_option');
      clean.custom_text = customText;
      label += `: ${customText}`;
    }

    normalized.push(clean);
    labels.push(label);
  }

  const receiveDate = product.receive_date?.enabled ? text(configuration.receive_date) : '';
  if (receiveDate && !validDate(receiveDate)) fail('Ngày nhận mâm quả không hợp lệ.', 'invalid_receive_date');
  const note = normalizeNote(product, configuration);
  const quantity = normalized.length;

  return {
    quantity,
    option: `${quantity} mâm · ${labels.join(' · ')}`,
    configuration: {
      components: normalized,
      ...(receiveDate ? { receive_date: receiveDate } : {}),
      ...(note ? { note } : {})
    }
  };
}

function resolvePrice(product, normalized) {
  if (product.price.mode === 'fixed') {
    const lineTotal = Number(product.price.amount || 0) * normalized.quantity;
    return { line_total: lineTotal, price_text: product.price.display_text };
  }
  if (product.price.mode === 'hybrid') {
    const rules = Array.isArray(product.price.rules) ? product.price.rules : [];
    const rule = rules.find(item => {
      const selected = normalized.configuration?.options?.[item.option_group];
      const optionId = typeof selected === 'object' ? selected?.id : selected;
      return optionId === item.option_id && Number(normalized.quantity) === Number(item.quantity);
    });
    if (rule) {
      const amount = Number(rule.amount || 0);
      return { line_total: amount, price_text: `${new Intl.NumberFormat('vi-VN').format(amount)}đ` };
    }
  }
  return { line_total: null, price_text: product.price.display_text };
}

function normalizeLine(product, rawItem) {
  const normalized = product.type === 'composite'
    ? normalizeComposite(product, rawItem)
    : normalizeVariantOrSimple(product, rawItem);
  const price = resolvePrice(product, normalized);
  return {
    id: product.id,
    name: product.name,
    option: normalized.option,
    quantity: normalized.quantity,
    unit: product.type === 'composite' ? (product.quantity?.unit || 'mâm') : (product.quantity?.unit || 'sản phẩm'),
    price_text: price.price_text,
    line_total: price.line_total,
    configuration: normalized.configuration
  };
}

export function normalizeOrderPayload(body, catalog) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Dữ liệu đơn hàng không hợp lệ.');
  const requestId = text(body.request_id);
  if (!/^[A-Za-z0-9-]{8,128}$/.test(requestId)) fail('Mã yêu cầu không hợp lệ.', 'invalid_request_id');
  const customerName = text(body.customer_name);
  if (!customerName || customerName.length > 150) fail('Họ và tên không hợp lệ.', 'invalid_customer');
  const phone = normalizePhone(body.phone);
  const receiveDate = text(body.receive_date);
  if (!validDate(receiveDate)) fail('Ngày nhận không hợp lệ.', 'invalid_receive_date');
  const address = text(body.address);
  if (!address || address.length > 600) fail('Địa chỉ nhận hàng không hợp lệ.', 'invalid_address');
  const note = text(body.note);
  if (note.length > 1000) fail('Ghi chú quá dài (tối đa 1.000 ký tự).', 'invalid_note');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) fail('Số dòng sản phẩm không hợp lệ (tối đa 30).', 'invalid_items');

  const items = body.items.map(rawItem => {
    if (!rawItem || typeof rawItem !== 'object') fail('Sản phẩm không hợp lệ.', 'invalid_item');
    const productId = text(rawItem.product_id);
    const product = catalog[productId];
    if (!product) fail('Sản phẩm không tồn tại hoặc đang ẩn.', 'unknown_product');
    const line = normalizeLine(product, rawItem);
    if (product.receive_date?.checkout_is_final === true) line.configuration.receive_date = receiveDate;
    return line;
  });

  return {
    request_id: requestId,
    customer_name: customerName,
    phone,
    receive_date: receiveDate,
    address,
    note,
    items
  };
}

export function formatDateVN(value) {
  const parts = text(value).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : text(value);
}

export function notificationText(order) {
  const lines = [
    `Mã đơn: ${order.order_code}`,
    '',
    '🛒 ĐƠN HÀNG MỚI - SHOP UYÊN ƯƠNG',
    '',
    '📦 SẢN PHẨM',
    ''
  ];
  for (const item of order.items || []) {
    lines.push(
      `• ${text(item.name)}`,
      `  Lựa chọn: ${text(item.option) || 'Theo yêu cầu'}`,
      `  Số lượng: ${Number(item.quantity)} ${text(item.unit) || 'sản phẩm'}`,
      `  Giá: ${text(item.price_text) || 'Liên hệ'}`
    );
    const productNote = text(item.configuration?.note);
    if (productNote) lines.push(`  Ghi chú SP: ${productNote}`);
    lines.push('');
  }
  lines.push(
    `👤 Tên: ${text(order.customer_name)}`,
    `📞 SĐT: ${text(order.phone)}`,
    `📅 Ngày nhận: ${formatDateVN(order.receive_date)}`,
    `📍 Địa chỉ: ${text(order.address)}`,
    `📝 Ghi chú: ${text(order.note) || 'Không có'}`
  );
  return lines.join('\n');
}
