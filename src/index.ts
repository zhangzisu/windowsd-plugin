import { parentPort, isMainThread } from 'worker_threads'
import uuid from 'uuid/v4'

export interface IRPCConfig {
  s?: string
  t?: string
  o?: number
  l?: boolean
}

export type RPCCallback = (error: Error | undefined, result: any) => void
type RPCFunction = (args: any, cfg: IRPCConfig) => Promise<any>
type RPCFunctionEx = (cfg: IRPCConfig, ...args: any) => Promise<any>

const cbs: Map<string, RPCCallback> = new Map()
const fns: Map<string, RPCFunction> = new Map()

export function register (name: string, fn: RPCFunction) {
  if (fns.has(name)) {
    throw new Error('Mutiple registeration')
  }
  fns.set(name, fn)
  log('RPC', 'fn:', name)
}

export function registerEx (name: string, fn: RPCFunctionEx) {
  register(name, async (args, ctx) => {
    if (args instanceof Array) {
      return fn(ctx, ...args)
    } else if (args === undefined || args === null) {
      return fn(ctx)
    } else throw new Error('Bad args')
  })
}

export function invoke (method: string, args: any, cfg: IRPCConfig) {
  return new Promise((resolve, reject) => {
    const asyncID = uuid()
    cbs.set(asyncID, (result, error) => {
      cbs.delete(asyncID)
      if (error) return reject(error)
      return resolve(result)
    })
    parentPort!.postMessage({ type: 'RPCRequest', asyncID, method, args, cfg })
  })
}

function handle (msg: any) {
  switch (msg.type) {
    case 'RPCRequest': return handleRequest(msg.asyncID, msg.method, msg.args, msg.cfg)
    case 'RPCResponse': return handleResponse(msg.asyncID, msg.result, msg.error)
  }
}

parentPort && parentPort.on('message', handle)

function handleRequest (asyncID: string, method: string, args: any, cfg: IRPCConfig) {
  const p = new Promise((resolve, reject) => {
    const fn = fns.get(method)
    if (!fn) return reject(new Error('No such method'))
    return resolve(fn(args, cfg))
  })
  p.then(result => {
    parentPort!.postMessage({
      type: 'RPCResponse',
      asyncID,
      result
    })
  }).catch(error => {
    parentPort!.postMessage({
      type: 'RPCResponse',
      asyncID,
      error: error.toString()
    })
  })
}

function handleResponse (asyncID: string, result: any, errstr: any) {
  const cb = cbs.get(asyncID)
  if (!cb) {
    log(`Missed response: ${asyncID}`)
    return
  }
  if (typeof errstr === 'string') {
    return cb(new Error(errstr), result)
  }
  return cb(undefined, result)
}

export function log (...data: any) {
  if (isMainThread) {
    console.log(data)
  } else {
    parentPort!.postMessage({
      type: 'log',
      data
    })
  }
}
