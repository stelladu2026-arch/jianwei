// Keep the actual response implementation; capture post-response work so tests
// decide when it runs instead of relying on a Next request async context.
export {NextResponse} from 'next/server.js';
export function after(callback){(globalThis.__afterTestTasks??=[]).push(callback)}
