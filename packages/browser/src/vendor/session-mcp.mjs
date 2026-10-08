// Adapted from DeepSeek Harness 0.2.1-alpha.1 (MIT). See ../../NOTICE.md.
// Extensions: acquireConnection, acceptAgent, run, ready and reconnect.
// Official SessionResources, MCP client and scope ownership are retained.
/** Session-owned MCP browser processes and provider catalog activation. @module */
import Schema from '@deepseek-ai/schemastery';
import { BrowserUseProviderName } from '@deepseek-ai/dsh-browser-use/brand';
import * as McpClient from '@deepseek-ai/dsh-mcp-client';
import { createScope } from '@deepseek-ai/dsh-scope';
import { SessionResources } from "@deepseek-ai/dsh-experimental-browser-use-runtime";
/** Validate the browser mode before the provider reserves browser use. */
export const BrowserMcpConfig = Schema.union([
    Schema.object({
        mode: Schema.const('launch').required(),
        headless: Schema.boolean().default(true),
        executablePath: Schema.string().pattern(/\S/u),
        toolCallTimeoutMs: Schema.number().min(1),
    }),
    Schema.object({
        mode: Schema.const('attach').required(),
        endpoint: Schema.string().pattern(/^https?:\/\/[^\s/]+|^wss?:\/\/[^\s/]+/u).required(),
        toolCallTimeoutMs: Schema.number().min(1),
    }),
]);
/**
 * Reject an invalid debugging endpoint before acquiring provider or browser resources.
 * @param config - schema-validated browser selection.
 */
export function validateBrowserMcpConfig(config) {
    if (config.mode !== 'attach')
        return;
    let endpoint;
    try {
        endpoint = new URL(config.endpoint);
    }
    catch (error) {
        throw new Error('browser endpoint must be a valid HTTP(S) or WS(S) URL', { cause: error });
    }
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(endpoint.protocol) || /\s/u.test(config.endpoint)) {
        throw new Error('browser endpoint must be a valid HTTP(S) or WS(S) URL without whitespace');
    }
}
/**
 * Await one MCP client during each future Agent's creation.
 * A busy attachment leaves that activation without browser tools; its other turns continue.
 * Calls are serialized per Session; unload closes every server before releasing registration.
 * @param ctx - provider context supplying browser use, Agents, tools, and prompt assembly.
 * @param options - provider identity, attachment exclusivity, and executable configuration.
 */
export function mountSessionMcp(ctx, options) {
    let resources;
    const clients = new Map();
    const toolPrefix = `mcp__${options.name}__`;
    const resourceTools = new Set(['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']);
    let stopping = false;
    let refreshingMasks = false;
    const refreshBlockedMasks = () => {
        if (stopping || refreshingMasks)
            return;
        refreshingMasks = true;
        try {
            for (const [agent, state] of clients) {
                if (state.status !== 'blocked')
                    continue;
                const inherited = ctx.tools.schemas(agent).filter(tool => tool.name.startsWith(toolPrefix));
                if (inherited.length === 0)
                    continue;
                state.mask ??= createScope(ctx, agent);
                state.mask.ctx.tools.restrict({ deny: inherited.map(tool => tool.name) });
            }
        }
        finally {
            refreshingMasks = false;
        }
    };
    ctx.effect(function* () {
        yield ctx.browserUse.register(BrowserUseProviderName(options.name));
        resources = new SessionResources(ctx, {
            label: options.name,
            exclusive: options.exclusive,
            async open(agent, signal) {
                let scope, connection;
                const cleanup = async () => {
                    try { await scope?.dispose(); } finally { await connection?.release?.(); }
                };
                const connect = async (activeSignal = signal) => {
                    scope = createScope(ctx, agent);
                    const cancel = () => { void scope.dispose(); };
                    activeSignal.addEventListener('abort', cancel, { once: true });
                    try {
                        activeSignal.throwIfAborted();
                        connection = await options.acquireConnection?.(agent, activeSignal);
                        scope.ctx.on('tools/execute', async (exec, next) => {
                            if (!exec.name.startsWith(toolPrefix)) return next();
                            if (exec.agent !== agent) {
                                if (ctx.tools.get(exec.name, exec.agent) !== ctx.tools.get(exec.name, agent)) return next();
                                throw new Error(options.name + ': browser tool belongs to another Session');
                            }
                            return next();
                        });
                        await scope.ctx.plugin(McpClient, McpClient.Config({
                            transport: 'stdio', serverName: options.name,
                            command: connection?.command ?? options.command,
                            args: connection?.args ?? options.args,
                            ...options.env === undefined ? {} : { env: options.env },
                            ...agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd },
                            ...options.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: options.toolCallTimeoutMs },
                            failOnStartupError: true, reconnect: { enabled: false },
                        }));
                        activeSignal.throwIfAborted();
                    } catch (error) { await cleanup(); throw error; }
                    finally { activeSignal.removeEventListener('abort', cancel); }
                };
                await connect();
                const value = {
                    get scope() { return scope; },
                    get connection() { return connection; },
                    async reconnect(activeSignal) { await cleanup(); await connect(activeSignal); },
                };
                return { value, async close() { clients.delete(agent); await cleanup(); } };
            },
        });
        yield async () => {
            stopping = true;
            await resources.dispose();
            clients.clear();
        };
    }, `${options.name}.sessions`);
    ctx.on('agent/created', async ({ agent, signal }) => {
        const state = { status: resources.available(agent) && (!options.acceptAgent || options.acceptAgent(agent)) ? 'ready' : 'blocked' };
        agent.ctx.effect(() => async () => {
            clients.delete(agent);
            await state.mask?.dispose();
        }, `${options.name}.activation`);
        if (state.status === 'blocked') {
            clients.set(agent, state);
            refreshBlockedMasks();
            return;
        }
        const value = await resources.get(agent, signal);
        clients.set(agent, state);
        const reconnect = async () => {
            await resources.run(agent, AbortSignal.timeout(30000), async (current, activeSignal) => current.reconnect(activeSignal));
            const current = await resources.get(agent);
            options.ready?.(agent, current, reconnect);
            return current.connection.entry;
        };
        options.ready?.(agent, value, reconnect);
    }, { prepend: true });
    ctx.on('tools/change', refreshBlockedMasks);
    ctx.on('tools/execute', async (exec, next) => {
        const ownResource = resourceTools.has(exec.name)
            && typeof exec.arguments === 'object' && exec.arguments !== null
            && exec.arguments.server === options.name;
        if (!exec.name.startsWith(toolPrefix) && !ownResource)
            return next();
        const agent = exec.agent;
        if (agent === undefined || clients.get(agent)?.status !== 'ready') {
            throw new Error(`${options.name}: browser tool belongs to another Session`);
        }
        return resources.run(agent, exec.signal, async (_scope, combined) => {
            const original = exec.signal;
            exec.signal = combined;
            try {
                return await (options.run ? options.run(agent, _scope, exec, next) : next());
            }
            finally {
                exec.signal = original;
            }
        });
    });
    ctx.on('system-prompt/assemble', async (_assembly, { agent }, next) => {
        const assembly = await next();
        if (agent === undefined || clients.get(agent)?.status === 'ready')
            return assembly;
        return { ...assembly, sections: assembly.sections.filter(section => section.name !== `mcp:${options.name}`) };
    });
}
//# sourceMappingURL=mcp.js.map
