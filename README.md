# Idream

一个安静、私密、有仪式感的 AI 梦境咨询室。用户可以选择弗洛伊德、荣格、阿德勒中的一位分析者，完成梦境记录、5 个追问、最终解析、内心三问和梦境档案。

项目现在包含两种模式：

- 未配置 Supabase：浏览器本地体验模式，数据保存在 `localStorage`。
- 配置 Supabase：真实用户系统、云端梦境档案、管理员后台和漂流瓶审核。

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- DeepSeek Chat Completions API
- Supabase Auth / Postgres / RLS
- Vercel 部署

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

## 环境变量

基础 AI 功能：

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
```

真实用户系统：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Supabase 初始化

1. 新建 Supabase 项目。
2. 打开 SQL Editor。
3. 执行 `supabase/schema.sql`。
4. 在 Authentication 设置里开启 Email 登录。
5. 把 URL、anon key、service role key 填入 `.env.local` 和 Vercel Environment Variables。

## 设置管理员

先注册你的账号，然后在 Supabase SQL Editor 执行：

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@example.com';
```

管理员登录后会在左侧看到“管理”，可审核漂流瓶并查看基础统计。

## 部署

推荐 Vercel：

1. 把项目推到 GitHub。
2. Vercel 导入仓库。
3. 在 Vercel 项目设置里填写环境变量。
4. 确认生产环境使用 Node.js 20 或更高版本。
5. 部署完成后，在 Supabase Auth 的 Site URL / Redirect URLs 中加入你的正式域名。

## 内容边界

产品内容用于自我探索，不替代心理治疗、医学诊断或危机干预。
