# 结构化研究记录 v1

审查工具：scripts/audit.py。所有偏移均为 Python 字符串的 Unicode 码点偏移，左闭右开；不是 UTF-8 字节，也不是 JavaScript UTF-16 单元。引文必须精确满足 body[start:end] == quote。

顶层固定结构：
- schema_version: "jianwei-research/1"
- scope: {audience, scenario, region, decision}: 非空字符串；confirmed: 布尔；assumptions: 字符串数组。未知项写“未知”，confirmed=false，不能编造。
- sources: 最多30项。{id, title, kind, url, retrieved_at, version, body_status, body, independence_key}。
  kind=web/user/synthetic。web 必须 https URL；user 和 synthetic 可用 null。用户来源 title 必须可定位到授权文件；不填虚构 URL。
  retrieved_at 是实际取得的含时区 ISO 时间，version 是本次原文版本。
  body_status=full/excerpt/unavailable；unavailable 的 body 必须空。excerpt 只支持所取得部分。
  independence_key 将同线程、同经历转载归为一组。不能将该字段解释为已核验独立客户。
- claims: 最多20项，每项 {id,text,scope_confirmed,clauses}；scope_confirmed 与 scope.confirmed 相同。
  clauses 最多12项，每项 {id,text,start,end,verdict,reason,anchors}。
  clauses 必须按原句顺序连续、不重叠、无遗漏覆盖 text；不可改写原句。
  verdict=supported/partial/contradicted/unknown。reason 非空，说明适用性与缺口。
  anchors 每项 {source_id,source_version,quote,start,end}，最多3项。source_version 必须等于来源version。supported/partial/contradicted 必须至少一条有效正文引文；无引文时改判 unknown。
- recommendation: {action,rationale}。action=evidence_needed/validate/stop。rationale 为非空字符串。
  validate 指建议开展小规模验证，绝不代表已证实商业价值。范围未确认或资料只有虚构样例时只能 evidence_needed。
- validation_plan: {audience,questions,success_signal,stop_condition,time_budget,cost_budget}。文本均非空；questions 为1–5条字符串。
  success_signal 的指标必须写清是预先设定的验证标准，不能称为已验证结果。
- request_log: 最多30项。{id,tool,purpose,status}；status=success/failed/timeout/unavailable。
  只记录实际尝试。工具不可用且未发出请求时 status=unavailable；不得制造成功调用。

不要把“全部支持”直接写入记录。脚本从各片段机械汇总，并保留“模型判断，语义待人工核查”说明。支持度不等于商业机会。
