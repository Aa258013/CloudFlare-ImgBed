/**
 * 数据库适配器 - 阿里云 ESA KV 版本
 * 完全兼容原有接口，自动识别 Cloudflare KV 或阿里云 EdgeKV
 */

import { D1Database } from './d1Database.js';

/**
 * 创建数据库适配器
 * @param {Object} env - 环境变量
 * @returns {Object} 数据库适配器实例
 */
export function createDatabaseAdapter(env) {
    // 1. 优先使用 Cloudflare KV（如果存在）
    if (env.img_url && typeof env.img_url.get === 'function') {
        return new KVAdapter(env.img_url);
    }
    // 2. 使用 D1 数据库
    if (env.img_d1 && typeof env.img_d1.prepare === 'function') {
        return new D1Database(env.img_d1);
    }
    // 3. 尝试使用阿里云 ESA KV
    if (typeof EdgeKV !== 'undefined') {
        console.log('Using Aliyun ESA KV storage');
        return new KVAdapter(); // 不传参数，内部使用 EdgeKV
    }
    console.error('No database configured. Please configure either KV (env.img_url), D1 (env.img_d1), or Aliyun ESA KV.');
    return null;
}

/**
 * KV适配器类 - 兼容 Cloudflare KV 和阿里云 EdgeKV
 */
class KVAdapter {
    constructor(client) {
        if (client) {
            // Cloudflare KV 模式
            this.isAliyun = false;
            this.kv = client;
        } else {
            // 阿里云 ESA KV 模式
            this.isAliyun = true;
            // 命名空间必须与您在控制台创建的一致
            this.edgeKv = new EdgeKV({ namespace: "img_url" });
        }
    }

    // 写入键值
    async put(key, value, options = {}) {
        if (!this.isAliyun) {
            return await this.kv.put(key, value, options);
        }
        // 阿里云：支持 expirationTtl（秒）
        if (options.expirationTtl) {
            await this.edgeKv.put(key, value, { ttl: options.expirationTtl });
        } else {
            await this.edgeKv.put(key, value);
        }
        // 处理 metadata（单独存储）
        if (options.metadata) {
            await this.edgeKv.put(`${key}:meta`, JSON.stringify(options.metadata));
        }
    }

    // 读取值
    async get(key, options = {}) {
        if (!this.isAliyun) {
            return await this.kv.get(key, options);
        }
        const value = await this.edgeKv.get(key, { type: options.type || 'text' });
        if (value === undefined) return null;
        if (options.type === 'json') return JSON.parse(value);
        return value;
    }

    // 读取值及元数据
    async getWithMetadata(key, options = {}) {
        if (!this.isAliyun) {
            return await this.kv.getWithMetadata(key, options);
        }
        const [value, metaStr] = await Promise.all([
            this.edgeKv.get(key, { type: options.type || 'text' }),
            this.edgeKv.get(`${key}:meta`, { type: 'text' })
        ]);
        let metadata = null;
        if (metaStr) {
            try { metadata = JSON.parse(metaStr); } catch(e) {}
        }
        return { value: value === undefined ? null : value, metadata };
    }

    // 删除键
    async delete(key, options = {}) {
        if (!this.isAliyun) {
            return await this.kv.delete(key, options);
        }
        await this.edgeKv.delete(key);
        await this.edgeKv.delete(`${key}:meta`);
    }

    // 列出键（前缀、限制等）
    async list(options = {}) {
        if (!this.isAliyun) {
            return await this.kv.list(options);
        }
        // 阿里云 EdgeKV 的 list 方法可能不同，这里模拟
        const prefix = options.prefix || '';
        let limit = options.limit || 1000;
        let cursor = options.cursor || 0;
        // 使用 listKeys 方法（如有）
        let result;
        if (typeof this.edgeKv.listKeys === 'function') {
            result = await this.edgeKv.listKeys({ prefix, limit, cursor });
        } else {
            // 降级：不支持 list 时返回空
            console.warn('EdgeKV.listKeys not available');
            result = { keys: [], cursor: 0, list_complete: true };
        }
        // 过滤掉 metadata 键
        const keys = result.keys.filter(k => !k.endsWith(':meta')).map(name => ({ name }));
        return { keys, cursor: result.cursor, list_complete: result.list_complete };
    }

    // 以下为兼容性别名方法，无需修改
    async putFile(fileId, value, options) { return this.put(fileId, value, options); }
    async getFile(fileId, options) { return this.getWithMetadata(fileId, options); }
    async getFileWithMetadata(fileId, options) { return this.getWithMetadata(fileId, options); }
    async deleteFile(fileId, options) { return this.delete(fileId, options); }
    async listFiles(options) { return this.list(options); }
    async putSetting(key, value, options) { return this.put(key, value, options); }
    async getSetting(key, options) { return this.get(key, options); }
    async deleteSetting(key, options) { return this.delete(key, options); }
    async listSettings(options) { return this.list(options); }

    async putIndexOperation(operationId, operation, options) {
        const key = 'manage@index@operation_' + operationId;
        return this.put(key, JSON.stringify(operation), options);
    }
    async getIndexOperation(operationId, options) {
        const key = 'manage@index@operation_' + operationId;
        const val = await this.get(key, options);
        return val ? JSON.parse(val) : null;
    }
    async deleteIndexOperation(operationId, options) {
        const key = 'manage@index@operation_' + operationId;
        return this.delete(key, options);
    }
    async listIndexOperations(options) {
        const result = await this.list({ ...options, prefix: 'manage@index@operation_' });
        const ops = [];
        for (const item of result.keys) {
            const data = await this.get(item.name);
            if (data) {
                ops.push({
                    id: item.name.replace('manage@index@operation_', ''),
                    ...JSON.parse(data),
                    processed: false
                });
            }
        }
        return ops;
    }
}

export function getDatabase(env) {
    const adapter = createDatabaseAdapter(env);
    if (!adapter) {
        throw new Error('Database not configured. Please configure D1 database (env.img_d1) or KV storage (env.img_url or Aliyun ESA KV).');
    }
    return adapter;
}

export function checkDatabaseConfig(env) {
    const hasD1 = env.img_d1 && typeof env.img_d1.prepare === 'function';
    const hasKV = !!(env.img_url && typeof env.img_url.get === 'function');
    const hasAliyunKV = typeof EdgeKV !== 'undefined';
    return {
        hasD1,
        hasKV,
        hasAliyunKV,
        usingD1: hasD1,
        usingKV: hasKV,
        usingAliyunKV: !hasD1 && !hasKV && hasAliyunKV,
        configured: hasD1 || hasKV || hasAliyunKV
    };
}
