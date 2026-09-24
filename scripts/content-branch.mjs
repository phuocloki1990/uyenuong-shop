// Select the same GitHub content branch for listing, editing and saving.
// Current production hostname is fixed; every other Pages hostname must opt into a preview branch.
const BRANCH_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const PRODUCTION_HOST = 'uyenuong-shop.pages.dev';

export class ContentBranchConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.status = 503;
  }
}

export function resolveContentBranch(request, env = {}) {
  const hostname = new URL(request.url).hostname;
  const isProduction = hostname === PRODUCTION_HOST;
  const branch = isProduction ? 'main' : String(env.GITHUB_CONTENT_BRANCH || '').trim();
  if (!BRANCH_PATTERN.test(branch) || (!isProduction && branch === 'main')) {
    throw new ContentBranchConfigurationError('Chưa cấu hình nhánh GitHub hợp lệ cho môi trường này.');
  }
  return branch;
}
