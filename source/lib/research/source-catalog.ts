// Fixed public sources; these are not arbitrary URL fetch destinations.
export const FEED_SOURCES = {
  sspai: {name:'少数派',url:'https://sspai.com/feed',origin:'https://sspai.com',path:/^\/post\/\d{1,12}$/},
  cnblogs: {name:'博客园',url:'https://feed.cnblogs.com/blog/sitehome/rss',origin:'https://www.cnblogs.com',path:/^\/[A-Za-z0-9_-]+\/(?:p\/\d{1,12}|archive\/\d{4}\/\d{2}\/\d{2}\/\d{1,12})(?:\.html)?$/},
  oschina: {name:'OSCHINA',url:'https://www.oschina.net/news/rss',origin:'https://www.oschina.net',path:/^\/news\/\d{1,12}(?:\/[A-Za-z0-9_-]+)?$/},
} as const;
export type FeedSource=keyof typeof FEED_SOURCES;
export const EXPANDED_SOURCE_NAMES='中国新闻网、国家统计局、少数派、博客园、OSCHINA、GitHub Issues 与人工评论、官方项目文档和版本记录、Hacker News 和中文维基百科（网页搜索需另行启用）';
export const EXPANDED_SOURCE_SCOPE='中国新闻网按关键词搜索公开报道，搜索摘要不是全文；国家统计局筛选最新发布的相关统计报告；中文订阅只筛选近期条目，不是全站历史搜索。逐条标记正文或摘要，新闻、企业宣传和行业报道只作背景线索。公开讨论与文章不代表独立客户、实际付款或全部国内用户。';
