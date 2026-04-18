// index.js - 阿里云 ESA 入口文件，手动映射 Cloudflare Pages 函数路由
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const pathname = url.pathname;

        // 辅助函数：动态导入模块并执行 onRequest
        async function handleModule(modulePath, params = {}) {
            try {
                const mod = await import(modulePath);
                if (mod.onRequest) {
                    return mod.onRequest({ request, env, params, next: () => {} });
                }
                return new Response('Function has no onRequest handler', { status: 500 });
            } catch (e) {
                console.error(`Failed to load ${modulePath}:`, e.message);
                return null;
            }
        }

        // 1. 精确匹配的路由（按文件列表整理）
        // upload 相关（入口为 ./functions/upload/index.js）
        if (pathname === '/upload' || pathname.startsWith('/upload/')) {
            // 注意：upload/index.js 内部可能处理子路径，这里统一交给它
            const res = await handleModule('./functions/upload/index.js');
            if (res) return res;
        }

        // random 相关
        if (pathname === '/random' || pathname.startsWith('/random/')) {
            const res = await handleModule('./functions/random/index.js');
            if (res) return res;
        }

        // 2. API 路由映射（根据 functions/api/ 下的文件）
        // 注意：部分文件使用了 [[path]] 通配符，这里做精确匹配和通配符匹配
        const apiMap = {
            '/api/channels': './functions/api/channels.js',
            '/api/directoryTree': './functions/api/directoryTree.js',
            '/api/fetchRes': './functions/api/fetchRes.js',
            '/api/userConfig': './functions/api/userConfig.js',
            '/api/auth/login': './functions/api/auth/login.js',
            '/api/auth/logout': './functions/api/auth/logout.js',
            '/api/auth/resetAuth': './functions/api/auth/resetAuth.js',
            '/api/auth/sessionCheck': './functions/api/auth/sessionCheck.js',
            '/api/manage/apiTokens': './functions/api/manage/apiTokens.js',
            '/api/manage/check': './functions/api/manage/check.js',
            '/api/manage/list': './functions/api/manage/list.js',
            '/api/manage/login': './functions/api/manage/login.js',
            '/api/manage/logout': './functions/api/manage/logout.js',
            '/api/manage/quota': './functions/api/manage/quota.js',
            '/api/manage/batch/list': './functions/api/manage/batch/list.js',
            '/api/manage/batch/settings': './functions/api/manage/batch/settings.js',
            '/api/manage/batch/index/chunk': './functions/api/manage/batch/index/chunk.js',
            '/api/manage/batch/index/config': './functions/api/manage/batch/index/config.js',
            '/api/manage/batch/index/finalize': './functions/api/manage/batch/index/finalize.js',
            '/api/manage/batch/restore/chunk': './functions/api/manage/batch/restore/chunk.js',
            '/api/manage/cusConfig/blockip': './functions/api/manage/cusConfig/blockip.js',
            '/api/manage/cusConfig/blockipList': './functions/api/manage/cusConfig/blockipList.js',
            '/api/manage/cusConfig/list': './functions/api/manage/cusConfig/list.js',
            '/api/manage/cusConfig/whiteip': './functions/api/manage/cusConfig/whiteip.js',
            '/api/manage/sysConfig/others': './functions/api/manage/sysConfig/others.js',
            '/api/manage/sysConfig/page': './functions/api/manage/sysConfig/page.js',
            '/api/manage/sysConfig/security': './functions/api/manage/sysConfig/security.js',
            '/api/manage/sysConfig/upload': './functions/api/manage/sysConfig/upload.js',
            '/api/manage/tags/autocomplete': './functions/api/manage/tags/autocomplete.js',
            '/api/manage/tags/batch': './functions/api/manage/tags/batch.js',
            '/api/public/list': './functions/api/public/list.js',
        };
        if (apiMap[pathname]) {
            const res = await handleModule(apiMap[pathname]);
            if (res) return res;
        }

        // 3. 通配符 API 路由（带参数的路径，如 /api/manage/block/xxx, /api/manage/delete/xxx 等）
        if (pathname.startsWith('/api/manage/block/')) {
            const res = await handleModule('./functions/api/manage/block/[[path]].js', { path: pathname.slice('/api/manage/block/'.length) });
            if (res) return res;
        }
        if (pathname.startsWith('/api/manage/delete/')) {
            const res = await handleModule('./functions/api/manage/delete/[[path]].js', { path: pathname.slice('/api/manage/delete/'.length) });
            if (res) return res;
        }
        if (pathname.startsWith('/api/manage/metadata/')) {
            const res = await handleModule('./functions/api/manage/metadata/[[path]].js', { path: pathname.slice('/api/manage/metadata/'.length) });
            if (res) return res;
        }
        if (pathname.startsWith('/api/manage/move/')) {
            const res = await handleModule('./functions/api/manage/move/[[path]].js', { path: pathname.slice('/api/manage/move/'.length) });
            if (res) return res;
        }
        if (pathname.startsWith('/api/manage/rename/')) {
            const res = await handleModule('./functions/api/manage/rename/[[path]].js', { path: pathname.slice('/api/manage/rename/'.length) });
            if (res) return res;
        }
        if (pathname.startsWith('/api/manage/tags/')) {
            // 处理 tags/[[path]].js
            const tagPath = pathname.slice('/api/manage/tags/'.length);
            if (tagPath) {
                const res = await handleModule('./functions/api/manage/tags/[[path]].js', { path: tagPath });
                if (res) return res;
            }
        }
        if (pathname.startsWith('/api/manage/white/')) {
            const res = await handleModule('./functions/api/manage/white/[[path]].js', { path: pathname.slice('/api/manage/white/'.length) });
            if (res) return res;
        }

        // 4. 文件路由 /file/*
        if (pathname.startsWith('/file/')) {
            const filePath = pathname.slice('/file/'.length);
            const res = await handleModule('./functions/file/[[path]].js', { path: filePath });
            if (res) return res;
        }

        // 5. DAV 路由
        if (pathname.startsWith('/dav/')) {
            const davPath = pathname.slice('/dav/'.length);
            const res = await handleModule('./functions/dav/[[path]].js', { path: davPath });
            if (res) return res;
        }

        // 6. 静态资源（必须放在最后）
        return env.ASSETS.fetch(request);
    }
};