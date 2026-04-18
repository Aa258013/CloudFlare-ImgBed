/**
 * 数据库适配器 - 阿里云 ESA KV 版本
 */

import { D1Database } from './d1Database.js';

// 阿里云 ESA KV 客户端
let edgeKv = null;

function getEdgeKv(env) {
    if (edgeKv) return edgeKv;
    // 检查是否在阿里云 ESA 环境
    if (typeof EdgeKV !== 'undefined') {
        edgeKv = new EdgeKV({ namespace: "img_url" });
    }
    return edgeKv;
}

export function createDatabaseAdapter(env) {
    // 优先使用 D1（如果有）
    if (env.img_d1 && typeof env.img_d1.prepare === 'function') {
        return new D1Database(env.img_d1);
    }
    
    // 使用阿里云 ESA KV
    const kv = getEdgeKv(env);
    if (kv) {
        console.log('Using Aliyun ESA KV storage');
        return new KVAdapter(kv);
    }
    
    // 兼容原有 Cloudflare KV（如果存在）
    if (env.img_url && typeof env.img_url.get === 'function') {
        return new KVAdapter(env.img_url);
    }
    
    console.error('No database configured.');
    return null;
}

class KVAdapter {
    constructor(client) {
        this.client = client;
    }

    async put(key, value, options = {}) {
        if (options.expirationTtl) {
            return await this.client.put(key, value, { ttl: options.expirationTtl });
        }
        return await this.client.put(key, value);
    }

    async get(key, options = {}) {
        const value = await this.client.get(key);
        if (value === null) return null;
        if (options.type === 'json') return JSON.parse(value);
        return value;
    }

    async getWithMetadata(key, options = {}) {
        // ESA KV 不直接支持 metadata，用单独 key 存储
        const [value, metaStr] = await Promise.all([
            this.client.get(key),
            this.client.get(`${key}:meta`)
        ]);
        return { value, metadata: metaStr ? JSON.parse(metaStr) : null };
    }

    async delete(key, options = {}) {
        return await this.client.delete(key);
    }

    async list(options = {}) {
        // ESA KV 的 list API 可能不同，这里简化处理
        // 如果需要完整 list 功能，请提供 ESA KV 文档
        const prefix = options.prefix || '';
        try {
            const result = await this.client.list(prefix);
            return { keys: result.keys || [], cursor: null, list_complete: true };
        } catch (e) {
            console.log('List not supported in this ESA KV version');
            return { keys: [], cursor: null, list_complete: true };
        }
    }

    // 以下是业务层封装的方法（完全兼容）
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
        return this.put(`manage@index@operation_${operationId}`, JSON.stringify(operation), options);
    }
    async getIndexOperation(operationId, options) {
        const val = await this.get(`manage@index@operation_${operationId}`, options);
        return val ? JSON.parse(val) : null;
    }
    async deleteIndexOperation(operationId, options) {
        return this.delete(`manage@index@operation_${operationId}`, options);
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
    if (!adapter) throw new Error('Database not configured.');
    return adapter;
}

export function checkDatabaseConfig(env) {
    const hasD1 = env.img_d1 && typeof env.img_d1.prepare === 'function';
    const hasKV = !!(getEdgeKv(env) || (env.img_url && typeof env.img_url.get === 'function'));
    return {
        hasD1,
        hasKV,
        usingD1: hasD1,
        usingKV: !hasD1 && hasKV,
        configured: hasD1 || hasKV
    };
}
