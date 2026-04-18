// worker.js - ESA Pages 入口文件
import { createDatabaseAdapter } from './functions/utils/databaseAdapter.js';

// 初始化 KV（直接绑定，不需要额外配置）
const edgeKv = new EdgeKV({ namespace: "img_url" });

// 创建适配器并挂载到 env
const adapter = createDatabaseAdapter({ img_url: edgeKv });

// 处理请求
async function handleRequest(request, env) {
  const url = new URL(request.url);
  
  // 将 adapter 作为 img_url 传递给业务代码
  env.img_url = adapter;
  
  // 这里调用你原有的请求处理逻辑
  // 如果你的项目有现成的请求分发器，直接调用即可
  // 示例：转发到原有的 functions 路由逻辑
  return await routeRequest(request, env);
}

// 路由函数：根据路径分发到 functions/ 目录下的处理文件
async function routeRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // API 路由映射（根据你项目的实际 functions 结构调整）
  if (pathname === '/upload' || pathname.startsWith('/upload')) {
    const { onRequest } = await import('./functions/upload.js');
    return onRequest({ request, env, next: () => {} });
  }
  
  if (pathname.startsWith('/api/')) {
    // 动态导入对应的 API 处理文件
    const apiPath = pathname.replace('/api/', '');
    const module = await import(`./functions/api/${apiPath}.js`);
    if (module.onRequest) {
      return module.onRequest({ request, env, next: () => {} });
    }
  }
  
  // 默认返回静态文件
  return env.ASSETS.fetch(request);
}

// ESA 标准导出格式
export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};