# Idream

一个安静、私密、有仪式感的 AI 梦境咨询室。用户可以选择弗洛伊德、荣格、阿德勒中的一位分析者，完成梦境记录、5 个追问、最终解析、内心三问和梦境档案。本项目的目的是解析梦境，记录梦境以获得一定的心理治愈的成长效果。作者会在不久的将来发布具有类似精神的实机版本。十分适合学校或者企业的心理咨询室在保护用户隐私的条件下使用。

项目现在包含两种模式：

- 未配置 Supabase：浏览器本地体验模式，数据保存在 `localStorage`。
- 配置 Supabase：真实用户系统、云端梦境档案、管理员后台和漂流瓶审核。

## 房间与档案

- 中庭展示最近的梦、最近七日的记录和反复出现的母题，可直接重新打开咨询。
- 档案支持关键词搜索、分析者筛选、时间排序，以及包含完整问答与解读的 Markdown 导出；梦后信件可单独下载为文本。
- 背景音乐可在各页右上角或设置中开启，提供两首氛围器乐、音量调节及 15 / 30 / 60 分钟定时关闭。刷新后保持静音，保留曲目与音量偏好。
- 音频按需从本站加载，授权和处理说明见 `public/audio/credits.txt`。替换音乐时需同时核验并更新授权说明。

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- DeepSeek Chat Completions API
- Supabase Auth / Postgres / RLS
- Vercel 部署

## 本地运行

推荐 Node.js 24 LTS，与 `.nvmrc` 保持一致。首次运行：

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

已经填写过 `.env.local` 时，不要再次执行 `cp`，以免覆盖密钥。打开终端显示的本地地址即可预览。修改环境变量后重新启动开发服务。

检查代码：

```bash
npm test
npm run lint
npm run build
```

## 环境变量

密钥只填写到本地 `.env.local` 和 Vercel 环境变量中。`.env.local` 已被 Git 忽略，不应提交到公开仓库。DeepSeek、生图和 Supabase 管理密钥不能加上 `NEXT_PUBLIC_` 前缀。

基础 AI 功能：

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
DEEPSEEK_ANALYSIS_MODEL=deepseek-flash
DEEPSEEK_ANALYSIS_FALLBACK_MODEL=deepseek-flash
DEEPSEEK_ANALYSIS_TIMEOUT_MS=22000
DEEPSEEK_ANALYSIS_FALLBACK_TIMEOUT_MS=24000
```

模型名称以服务商实际返回的模型列表为准；`DEEPSEEK_ANALYSIS_MODEL` 和 `DEEPSEEK_ANALYSIS_FALLBACK_MODEL` 留空时沿用 `DEEPSEEK_MODEL`。

真实用户系统：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Supabase 新版控制台的 publishable key 可填写为 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，旧版 anon key 继续使用 `NEXT_PUBLIC_SUPABASE_ANON_KEY`，二者任选一种。`SUPABASE_SERVICE_ROLE_KEY` 只用于服务端管理功能，不能填入公开变量。

梦境意象生图（当前配置为火山方舟 Seedream）：

```bash
GEMINI_IMAGE_API_KEY=your_ark_key
GEMINI_IMAGE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
GEMINI_IMAGE_MODEL=doubao-seedream-5-0-pro-260628
GEMINI_IMAGE_AUTH_HEADER=authorization
GEMINI_IMAGE_API_STYLE=openai
GEMINI_IMAGE_SIZE=2K
GEMINI_IMAGE_RESPONSE_FORMAT=url
```

变量名沿用旧项目的 `GEMINI_IMAGE_` 前缀，同样支持 Seedream。请在火山方舟开通对应模型；此处采用文字生图，不需要示例中的参考图片。Seedream 请求启用水印，临时图片地址会尝试转换为可下载的图片内容。

Gemini 原生接口或兼容中转站也可以使用：

```bash
GEMINI_IMAGE_API_KEY=your_transit_or_gemini_key
GEMINI_IMAGE_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image-preview
GEMINI_IMAGE_AUTH_HEADER=x-goog-api-key
GEMINI_IMAGE_API_STYLE=gemini
GEMINI_IMAGE_SIZE=1024x1024
GEMINI_IMAGE_RESPONSE_FORMAT=b64_json
```

如果你的中转站用 OpenAI 风格 Bearer 鉴权和 `/v1/images/generations`，例如 LinAPI，把配置改成：

```bash
GEMINI_IMAGE_BASE_URL=https://api.linapi.net/v1
GEMINI_IMAGE_MODEL=gpt-image-2
GEMINI_IMAGE_AUTH_HEADER=authorization
GEMINI_IMAGE_API_STYLE=openai
GEMINI_IMAGE_RESPONSE_FORMAT=b64_json
```

如果中转站给你的地址已经包含完整路径，可以直接填 `GEMINI_IMAGE_ENDPOINT`。模型名必须是中转站明确支持图片生成的模型；普通聊天模型即使能分析文字，也不会返回图片。接口支持 Gemini `generateContent` 和 OpenAI `images/generations` 两种格式，换平台时需要同时确认地址、格式、模型名和鉴权方式。

## Supabase 初始化

1. 新建或进入已有的 Supabase 项目。
2. 打开 SQL Editor。
3. 执行 `supabase/schema.sql`。
4. 在 Authentication 设置里开启 Email 登录。
5. 把 URL、anon key、service role key 填入 `.env.local` 和 Vercel Environment Variables。
6. 打开 Authentication -> URL Configuration，把 Site URL 设为正式网站地址，例如 `https://www.idream.website`。在 Redirect URLs 中加入实际使用的邮件回调地址：

```txt
https://www.idream.website/auth/confirm
https://www.idream.website/auth/confirm?next=/auth/reset-password
https://idream-six.vercel.app/auth/confirm
https://idream-six.vercel.app/auth/confirm?next=/auth/reset-password
```

本地开发时也加入：

```txt
http://localhost:3000/**
http://127.0.0.1:3000/**
```

若正式域名不同，请替换上面的域名。邮箱验证码登录、密码登录、验证码注册和找回密码均使用 Supabase Auth。登录和注册的验证码直接在网站验证，邮件可以在任意浏览器或邮件 App 中查看。密码重置仍使用邮件链接，找回密码会进入独立的密码重置页。

### 邮箱验证码登录

发布验证码登录前，先在 Supabase 的 Authentication -> Email（部分界面位于 Notifications 下）-> Templates -> Magic Link 更新登录邮件模板：

1. Subject 填写 `Idream 登录验证码`。
2. Body 替换为 [`supabase/templates/login-code.html`](supabase/templates/login-code.html) 的完整内容，保存。
3. 确认模板保留 `{{ .Token }}`，用于显示数字验证码。仅包含 `{{ .ConfirmationURL }}` 的旧模板只会发送链接。
4. 在 Email provider 设置中检查 OTP expiration，建议使用 600 秒，并沿用项目的验证码长度；前端支持 6 到 10 位数字。
5. 在正式网站用已注册邮箱获取验证码，将邮件中的数字输入登录页，确认可以登录。重新发送需间隔至少 60 秒；后端还会执行 Supabase 自身的频率限制。

验证码请求使用 `shouldCreateUser: false`，新用户仍通过注册入口建立账户。验证码只通过 Supabase Auth 验证，不会存入本地档案或发送到应用日志。密码登录作为备用入口保留。

### 邮箱验证码注册

在 Supabase 的 Authentication -> Email -> Templates -> Confirm signup 中更新注册邮件模板：

1. Subject 填写 `Idream 注册验证码`。
2. Body 替换为 [`supabase/templates/signup-code.html`](supabase/templates/signup-code.html) 的完整内容，保留 `{{ .Token }}` 后保存。
3. 在 Email provider 中保持 Confirm email 开启，让新用户验证邮箱后才能登录。

注册分两步：先填写邮箱、至少 8 位的密码及选填个人信息，点击「获取注册验证码」；再输入邮件中的验证码，点击「验证并完成注册」，验证成功后自动登录。首封邮件通过 `signUp` 发送，重新发送通过 `resend({ type: "signup" })`，不重复创建账号。重发需间隔至少 60 秒，倒计时期间仍可提交验证码。密码和验证码不会写入本地存储或日志；个人信息通过注册时的用户元数据保存。已注册邮箱可使用登录入口；已申请但未确认的邮箱可以重新申请注册验证码。

Supabase 默认邮件服务可能限制收件人为项目团队成员，并且发送额度较低。面向真实用户开放前，应在 Authentication 的邮件设置中配置自己的 SMTP 服务，然后用自己的邮箱验证注册、登录和找回密码的完整流程。

### Resend 发信

1. 在 Resend 的 Domains 中确认发信域名显示 `Verified`。
2. 在 Resend 的 API Keys 中创建可向该域名发送邮件的密钥。
3. 在 Supabase 打开 Authentication -> Notifications 下的 Email -> SMTP Settings，启用自定义 SMTP。
4. 填写下列参数并保存：

| 字段 | 内容 |
| --- | --- |
| Sender email | 已验证域名下的发信地址，例如 `noreply@idream.website`；必须与实际验证的域名一致 |
| Sender name | `Idream` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API Key |

Resend 密钥保存在 Supabase SMTP 设置中。发信结果可在 Resend 的 Emails 中查询；若连接成功但跳转到了错误网站，请检查上方的 URL Configuration。参考 [Resend 官方 Supabase SMTP 指南](https://resend.com/docs/send-with-supabase-smtp)。

## 设置管理员

先注册你的账号，然后在 Supabase SQL Editor 执行：

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@example.com';
```

管理员登录后会在左侧看到“管理”，可审核漂流瓶并查看基础统计。

## 上线前检查

- 本地和生产环境均推荐 Node.js 24 LTS。
- 执行最新的 `supabase/schema.sql`，确认 `profile_snapshots` 和 `dream_records` 新增字段已存在。
- AI 与生图接口需要登录，并带有内存级日限流；如有高流量，需要接入 Upstash / Redis 等持久限流。
- 设置 `NEXT_PUBLIC_SITE_URL=https://your-domain.com`，用于 OpenGraph、sitemap 和 Supabase 邮件跳转。
- 在 Supabase Auth 中关闭不需要的登录方式，并确认邮件模板指向 `/auth/confirm`。
- 生图是可选扩展，只在用户点击确认后触发；生成结果只临时展示，不写入云端梦境档案。
- `GET /api/status` 只返回 Supabase、解析和生图是否已配置，不返回密钥；配置存在不代表上游服务已经连接成功。

## 部署

推荐 Vercel：

1. 把项目推到 GitHub。
2. Vercel 导入仓库。
3. 在 Vercel 项目设置里填写环境变量。
4. 确认生产环境使用 Node.js 24 LTS。
5. 部署完成后，在 Supabase Auth 的 Site URL / Redirect URLs 中加入你的正式域名和 `/auth/confirm`。

本地 `.env.local` 不会自动同步到 Vercel。在 Vercel 中新增或修改变量后，需要重新部署才会生效；只有 `NEXT_PUBLIC_` 开头的 Supabase 公开配置会进入浏览器代码。

## 内容边界

产品内容用于自我探索，不替代心理治疗、医学诊断或危机干预。
