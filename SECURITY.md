# 公网运行与安全

## 信任边界

服务端统一校验席位、版本、选择版本、行动合法性和回执，保存后广播个人可见视图。私人房间使用不可预测的 256 位席位凭证；凭证只保存在浏览器站点存储，服务端保存其 SHA-256。邀请链接只携带房间码，不能恢复他人的席位。

生产环境设置精确的 `ALLOWED_ORIGINS` 白名单。反向代理为唯一入口时才设置 `TRUST_PROXY=true`；不能将启用此选项的 3000 端口直接公开。默认 Compose 只发布 Caddy 的 80/443，游戏服务仅在容器网络中可达。Caddy 替换客户端的转发地址，服务按可信代理提供的最后一个有效地址限流。

## 已实施限制

| 边界 | 默认限制 |
| --- | --- |
| HTTP API | 每来源 IP 每分钟 180 次；写请求另限 60 次 |
| 新建房间 | 每 IP 每分钟 20 个，房间总数 1000 |
| WebSocket 握手 | 每 IP 每分钟 60 次；总计 128，单 IP 16 个连接，含未验证连接 |
| 消息 | 每 IP 每分钟 1200；每席位每分钟 600 次行动；验证每 IP 每分钟 120 次 |
| 输入 | HTTP 头 8 KiB、消息和请求体 16 KiB、地址 2048 字符；仅接受 JSON 对象和文本帧 |
| 时限 | HTTP 头 10 秒、请求 15 秒；席位验证 10 秒，关闭宽限 2 秒 |
| 房间队列 | 待处理指令 32 个；单连接发送缓冲 1 MiB；单房指令记录 10000 条 |
| 自动备份 | 每日创建，保留最近 7 份；手动备份不自动清理 |

连接、请求和格式超限在规则裁定前拒绝，返回可重试信息或关闭异常连接。断线后原席位仍可恢复。限流表有固定容量，安全日志按来源限频，不记录凭证与完整消息。房间到达容量时保留已有房间，管理员备份后按运营需求归档；服务不自行删除朋友存档。

页面启用 CSP、自源资源和连接限制、禁止嵌套、nosniff 与同源引用策略。容器丢弃能力、使用只读根目录和临时盘、限制进程/内存/CPU，Node 使用非 root 用户；数据库和备份只写入专用卷，日志自动轮换。

`MAX_ROOMS`、`MAX_WS_CONNECTIONS`、`MAX_WS_PER_IP`、`MAX_ROOM_COMMANDS`、`AUTO_BACKUPS_KEEP` 可通过环境变量调整，非法配置启动即失败。共享 NAT 下多人使用同一来源 IP，需要按实际人数调整连接额度。

## Ubuntu 主机

确认可用 SSH 端口后执行 `sudo env SSH_PORT=22 sh deploy/harden-ubuntu.sh`。脚本先保存配置到 `/var/backups/nomad-city-security/`，再放行管理端口与 80/443、启用 UFW，并用 fail2ban 对 SSH 10 分钟内 5 次失败登录封禁 1 小时。脚本不修改原有 SSH 认证方式。

Docker 发布端口可能绕过 UFW，因此应同时核对 `docker compose ps`、云安全组和容器端口配置。不可将数据库、Docker 管理端口或游戏 3000 端口加入公网映射。

## HTTPS 与存档

域名部署使用 Caddy 自动证书。公网 IP 可使用 `docker compose -f compose.yaml -f compose.ip-https.yaml up -d --build`，由支持 IP 证书的 Caddy 2.11 与 Let's Encrypt `shortlived` 配置管理证书和续期。

IP 配置同时保留原 HTTP 入口，不强制跳转，供已存在的 HTTP 浏览器席位继续使用。新房间优先使用 HTTPS；不同协议的浏览器存储相互独立，不能直接切换协议恢复旧席位。旧 HTTP 的数据传输仍为明文。证书数据卷必须持久保留。

容量型 DDoS 需要云厂商防护、CDN/WAF 或上游流量清洗，单台应用的限流主要限制扫描、滥建房间、异常连接和资源耗尽。部署者应在云控制台设置流量、资源与账单告警，按访问范围配置云安全组。

## 公开源码

提交前执行 `pnpm public:audit`；仓库只发布源码与来源清单，排除 `.env`、SSH 密钥、数据库、备份、席位凭证和运行素材。审计通过不替代人工核对。安全问题请通过 GitHub 的私人漏洞报告入口提交，避免在公开 issue 附加席位凭证或存档。

参考：[Caddy TLS](https://caddyserver.com/docs/caddyfile/directives/tls)、[Let's Encrypt IP 证书](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)、[Docker 与防火墙](https://docs.docker.com/engine/network/packet-filtering-firewalls/)。
