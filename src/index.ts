import { parentPort } from "worker_threads"
import uuid from 'uuid/v4'

interface IRPCFnContext {
  //
}
type RPCCallback = (result: any, error?: Error) => void
type RPCFunction = (args: any, context: IRPCFnContext) => any

const cbs: Map<string, RPCCallback> = new Map()
const fns: Map<string, RPCFunction> = new Map()

export function register(name: string, fn: RPCFunction) {
  if (fns.has(name)) {
    throw new Error('Mutiple registeration')
  }
  fns.set(name, fn)
  console.log('RPC', `+Function ${name}`)
}

export function invoke(method: string, args: any, cfg: any) {
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

function handle(msg: any) {
  switch (msg.type) {
    case 'RPCRequest': return handleRequest(msg.asyncID, msg.method, msg.args, msg.cfg)
    case 'RPCResponse': return handleResponse(msg.asyncID, msg.result, msg.error)
  }
}

parentPort!.on('message', handle)

function handleRequest(asyncID: string, method: string, args: any, _cfg: any) {
  const p = new Promise((resolve, reject) => {
    const fn = fns.get(method)
    if (!fn) return reject(new Error('No such method'))
    return resolve(fn(args, {}))
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

function handleResponse(asyncID: string, result: any, errstr: any) {
  const cb = cbs.get(asyncID)
  if (!cb) {
    console.log(`Missed response: ${asyncID}`)
    return
  }
  if (typeof errstr === 'string') cb(result, new Error(errstr))
  return cb(result)
}