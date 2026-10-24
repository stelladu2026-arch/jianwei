const messages = {
  DATABASE_URL_MISSING: '数据库连接地址尚未配置。请在 Vercel 的 Production 环境设置 TURSO_DATABASE_URL 并重新部署。',
  DATABASE_TOKEN_MISSING: '数据库访问令牌尚未配置。请在 Vercel 的 Production 环境设置 TURSO_AUTH_TOKEN 并重新部署。',
  DATABASE_URL_INVALID: '数据库连接地址格式不正确。请核对 Production 环境的 TURSO_DATABASE_URL；应填写数据库连接地址，再重新部署。',
  DATABASE_TOKEN_INVALID: '数据库访问令牌格式不正确。请核对 Production 环境的 TURSO_AUTH_TOKEN；只填写令牌本身，不包含 Bearer 前缀、引号或中间空格，再重新部署。',
};
export class DatabaseConfigurationError extends Error {
  /** @param {keyof typeof messages} code */
  constructor(code) { super(messages[code]); this.name = 'DatabaseConfigurationError'; this.code = code; }
}
/** @param {string | undefined} rawUrl @param {string | undefined} rawToken */
export function databaseConfiguration(rawUrl, rawToken) {
  const url = rawUrl?.trim() || '', token = rawToken?.trim() || '';
  if (!url) throw new DatabaseConfigurationError('DATABASE_URL_MISSING');
  if (!token) throw new DatabaseConfigurationError('DATABASE_TOKEN_MISSING');
  let endpoint;
  try {
    endpoint = new URL(url.replace(/^(libsql|turso):\/\//, 'https://'));
    if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.turso.io') || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !['', '/'].includes(endpoint.pathname)) throw Error();
  } catch { throw new DatabaseConfigurationError('DATABASE_URL_INVALID'); }
  if (/[^\x21-\x7e]/.test(token) || /^Bearer\b/i.test(token) || /^['"]|['"]$/.test(token)) throw new DatabaseConfigurationError('DATABASE_TOKEN_INVALID');
  endpoint.pathname = '/v2/pipeline';
  return {url, token, endpoint: endpoint.toString(), normalized: url !== rawUrl || token !== rawToken};
}
