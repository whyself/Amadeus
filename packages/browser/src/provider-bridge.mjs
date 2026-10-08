import { randomUUID } from 'node:crypto';
import { mountSessionMcp } from './vendor/session-mcp.mjs';
import { mcpCli } from './runtime.mjs';

const prefix = 'mcp__playwright-mcp__';
function resultValue(result) {
  const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
  const match = text.match(/### Result\s*\n([\s\S]*?)(?=\n### |$)/);
  if (!match) throw new Error('The pinned MCP runtime did not return page identity.');
  return JSON.parse(match[1].trim());
}
export function installProviderBridge(ctx, manager, config) {
  const env = Object.fromEntries(Object.keys(process.env).filter(key => key.toUpperCase().startsWith('PLAYWRIGHT_MCP_')).map(key => [key, '']));
  mountSessionMcp(ctx, {
    name: 'playwright-mcp', exclusive: false, command: process.execPath, args: [], env,
    toolCallTimeoutMs: config.toolCallTimeoutMs,
    acceptAgent: agent => agent.session.header.origin !== 'subagent' && !agent.parent,
    ready(_agent, resource, reconnect) {
      const previous = resource.connection.entry;
      const retry = async () => {
        const current = manager.entries.get(_agent.id);
        if (current && current !== previous && !current.failed) return current;
        try {
          const entry = await reconnect(); manager.publish(entry); return entry;
        } catch (error) {
          if (!manager.stopping) {
            const failed = manager.entries.get(_agent.id) || previous;
            failed.failed = true; failed.reconnect = retry;
            manager.entries.set(_agent.id, failed); manager.publish(failed);
          }
          throw error;
        }
      };
      previous.reconnect = retry;
    },
    async acquireConnection(agent, signal) {
      const connection = await manager.acquire(agent);
      if (signal.aborted) { connection.release(); signal.throwIfAborted(); }
      return { ...connection, command: process.execPath, args: [mcpCli, '--browser', 'chromium', '--cdp-endpoint', connection.endpoint] };
    },
    async run(agent, resource, exec, next) {
      const entry = resource.connection.entry;
      const direct = async (raw, args, signal = exec.signal) => {
        const definition = resource.scope.ctx.tools.get(prefix + raw, agent);
        if (!definition) throw new Error(`Official browser tool unavailable: ${raw}`);
        return definition.execute(args, { ...exec, agent, signal, callId: randomUUID(), deferContext() {} });
      };
      // Read the actual MCP-selected Page via public Playwright APIs. URL/index guesses
      // cannot distinguish two identical URLs, page closures or popup pages.
      const selected = async signal => resultValue(await direct('browser_run_code_unsafe', { code: 'async (page) => { const cdp = await page.context().newCDPSession(page); try { return (await cdp.send("Target.getTargetInfo")).targetInfo.targetId; } finally { await cdp.detach(); } }' }, signal));
      return manager.runAI(entry, exec, async () => {
        const result = await next();
        if (!result.isError && !exec.name.endsWith('__browser_close')) {
          try { entry.selected = await selected(exec.signal); } catch (error) { if (exec.signal.aborted) throw error; ctx.logger.warn(`Browser page identity unavailable: ${error.message}`); }
        }
        return result;
      });
    },
  });
  ctx.inject(['systemPrompt'], scope => scope.systemPrompt.section({ name: 'amadeus:ai-browser-viewer', order: 3120, text: 'The user can watch this conversation\'s Playwright browser in the read-only AI Browser sidebar. Browser operations continue when the viewer is closed. The native iframe browser is a separate user-controlled surface. Each conversation owns its AI browser; do not infer the selected page from its URL alone.' }));
}
