/**
 * commands/deobfuscate.js - ULTRA++ v2.9.3 FINAL
 * ===============================================
 * + Global rename map – haitegemei Babel Scope
 * + Kila jina lisilosomeka linakusanywa na kubadilishwa moja kwa moja
 * + Maboresho yote ya awali yamehifadhiwa (sandbox, live decode, parser fallback, dead code cleanup)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import prettier from 'prettier';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import vm from 'vm';

let webcrack = null;
try { webcrack = (await import('webcrack')).webcrack; } catch(e){}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function rc4Decrypt(key, str) {
    try {
        const s = Array.from({length:256},(_,i)=>i); let j=0;
        for(let i=0;i<256;i++){ j=(j+s[i]+key.charCodeAt(i%key.length))%256; [s[i],s[j]]=[s[j],s[i]]; }
        let i=0,j2=0,res=''; for(let y=0;y<str.length;y++){ i=(i+1)%256; j2=(j2+s[i])%256; [s[i],s[j2]]=[s[j2],s[i]]; res+=String.fromCharCode(str.charCodeAt(y)^s[(s[i]+s[j2])%256]); } return res;
    } catch { return null; }
}

function xorDecrypt(str, key=0xAA){ try { return [...str].map(c=>String.fromCharCode(c.charCodeAt(0)^key)).join(''); } catch { return null; } }

function base64Decode(str){ try { return Buffer.from(str,'base64').toString('utf8'); } catch {} return null; }

function hexDecode(str){ try { return Buffer.from(str,'hex').toString('utf8'); } catch {} return null; }

function isMeaningfulString(s) {
    return typeof s === 'string' && s.length > 8 && /^[\x20-\x7E]+$/.test(s) && /[a-zA-Z]{3,}/.test(s) &&!/^[0-9]+$/.test(s);
}

const COMMON_SHORT_NAMES = new Set(['i','j','k','_','$']);

function isHardToReadName(name) {
    if (/[^\x00-\x7F]/.test(name)) return true;
    if (/^_[0-9a-zA-Z]{5,}$/.test(name)) return true;
    if (/^[a-z]{1,3}\d{3,}$/i.test(name)) return true;
    if (name.length > 20) return true;
    if (/^[a-zA-Z]$/.test(name) &&!COMMON_SHORT_NAMES.has(name)) return true;
    return false;
}

function calculateConfidence(decodedCount, originalSize, newSize, simplifications, hasWebcrackResult, obfuscationArtifacts) {
    let score = hasWebcrackResult? 60 : 40;
    let details = [`Base: ${hasWebcrackResult? '60' : '40'}`];
    const reduction = 1 - (newSize / originalSize);
    const sizeScore = reduction > 0.30? 25 : reduction > 0.15? 15 : reduction > 0.05? 10 : 0;
    score += sizeScore; if(sizeScore) details.push(`Size: +${sizeScore}`);
    const stringScore = decodedCount >= 50? 20 : decodedCount >= 20? 15 : decodedCount >= 10? 10 : 0;
    score += stringScore; details.push(`Strings: +${stringScore}`);
    const simplScore = Math.min(simplifications * 2, 15);
    score += simplScore; details.push(`AST: +${simplScore}`);
    const sizeKb = Math.max(1, Math.round(newSize / 1024));
    const artifactRate = obfuscationArtifacts / sizeKb;
    const rawPenalty = Math.round(artifactRate * 10);
    const penalty = Math.min(30, Math.max(0, rawPenalty));
    score -= penalty; if(penalty) details.push(`Penalty: -${penalty}`);
    return { confidence: Math.max(0, Math.min(100, Math.round(score))), breakdown: details.join(' | ') };
}

const STUB_MODULES = {
    'crypto': { randomBytes: (n) => Buffer.alloc(n), createHash: () => ({ update: () => {}, digest: () => '' }), createHmac: () => ({ update: () => {}, digest: () => '' }) },
    'zlib': { gzip: () => Buffer.alloc(0), gunzip: () => Buffer.alloc(0), inflate: () => Buffer.alloc(0), deflate: () => Buffer.alloc(0) },
    'http': { get: () => {}, request: () => {} },
    'https': { get: () => {}, request: () => {} },
    'net': { connect: () => {}, createServer: () => {} },
    'dns': { lookup: () => {}, resolve: () => {} },
    'stream': { Transform: class {}, Readable: class {}, Writable: class {} },
};

function inertModule() {
    const proxy = new Proxy(function(){}, { get: () => proxy, apply: () => proxy, construct: () => proxy });
    return proxy;
}

function createSandbox() {
    const sandbox = {
        console: { log: s => { if (isMeaningfulString(s)) try { sandbox.__decoded.add(s); } catch{} }, error(){}, warn(){}, info(){} },
        __decoded: new Set(),
        Buffer,
        rc4Decrypt,
        xorDecrypt,
        base64Decode,
        hexDecode,
        require: (mod) => STUB_MODULES[mod] || inertModule(),
        module: { exports: {} },
        exports: {},
        process: {
            env: {}, argv: [], platform: 'linux', version: 'v22.0.0',
            exit(){}, on(){}, nextTick(fn){ try{fn();}catch{} }
        },
        __dirname: '/',
        __filename: '/index.js',
        setTimeout: (fn, delay) => { try { fn(); } catch{} },
        setInterval: () => {},
        setImmediate: (fn) => { try { fn(); } catch{} },
        __ud_reg__: Object.create(null)
    };
    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;
    return sandbox;
}

function findDecoderFunctionNames(ast, candidateArrayNames) {
    const arrayNameSet = new Set(candidateArrayNames);
    const decoderNames = new Set();
    if (!arrayNameSet.size) return decoderNames;

    function checkForArrayRef(path) {
        let found = false;
        path.traverse({
            MemberExpression(inner) {
                if (t.isIdentifier(inner.node.object) && arrayNameSet.has(inner.node.object.name)) {
                    found = true;
                    inner.stop();
                }
            }
        });
        return found;
    }

    traverse(ast, {
        'FunctionDeclaration|FunctionExpression'(p) {
            const name = p.node.id?.name;
            if (name && !JS_GLOBALS.has(name) && checkForArrayRef(p)) decoderNames.add(name);
        },
        CallExpression(p) {
            const callee = p.node.callee;
            if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
                try {
                    callee.body && callee.body.type && p.traverse({
                        MemberExpression(inner) {
                            if (t.isIdentifier(inner.node.object) && arrayNameSet.has(inner.node.object.name)) {
                                p.traverse({
                                    FunctionDeclaration(inner) {
                                        if (inner.node.id && !JS_GLOBALS.has(inner.node.id.name)) {
                                            if (checkForArrayRef(inner)) decoderNames.add(inner.node.id.name);
                                        }
                                    }
                                });
                                inner.stop();
                            }
                        }
                    });
                } catch {}
            }
        }
    });
    return decoderNames;
}

function buildRegistryInjection(decoderNames) {
    if (!decoderNames.size) return null;
    return [...decoderNames].map(name =>
        `try { if (typeof ${name} !== 'undefined') __ud_reg__[${JSON.stringify(name)}] = ${name}; } catch(e) {}`
    ).join('\n');
}

function tryLiveCall(sandbox, fnName, argLiterals) {
    try {
        const fn = sandbox.__ud_reg__?.[fnName] ?? sandbox[fnName];
        if (typeof fn !== 'function') return undefined;
        const result = fn(...argLiterals);
        if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') return result;
    } catch {}
    return undefined;
}

const JS_GLOBALS = new Set([
    'console','require','module','exports','process','Buffer','Math','JSON','Array','Object',
    'String','Number','Boolean','RegExp','Promise','Error','TypeError','RangeError','SyntaxError',
    'Date','Map','Set','WeakMap','WeakSet','Symbol','Proxy','Reflect','setTimeout','setInterval',
    'clearTimeout','clearInterval','setImmediate','parseInt','parseFloat','isNaN','isFinite',
    'encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','escape','unescape',
    'global','globalThis','__dirname','__filename','rc4Decrypt','xorDecrypt','base64Decode','hexDecode'
]);

const DANGEROUS_FN = /\b(require|fs\.|child_process|fetch\(|http\.|https\.|net\.|dns\.|process\.exit|process\.kill|eval\(|Function\(|import\(|XMLHttpRequest|WebSocket)\b/;

function parseWithFallback(code) {
    try {
        return parser.parse(code, {
            sourceType: 'module',
            plugins: ['jsx','classProperties','classPrivateProperties','classPrivateMethods','objectRestSpread',
                      'optionalChaining','nullishCoalescingOperator','numericSeparator','bigInt','dynamicImport',
                      'topLevelAwait','logicalAssignment','flow'],
            errorRecovery: true
        });
    } catch(e) {}
    try {
        return parser.parse(code, {
            sourceType: 'script',
            errorRecovery: true,
            plugins: ['jsx','optionalChaining','nullishCoalescingOperator','dynamicImport']
        });
    } catch(e) {}
    return null;
}

function countObfuscationArtifacts(code, ast) {
    let artifacts = (code.match(/\b_0x[0-9a-fA-F]{3,}\b/g) || []).length;
    artifacts += (code.match(/(?:\\u[0-9a-fA-F]{4}){2,}/g) || []).length;
    if (ast) {
        try {
            traverse(ast, {
                'FunctionDeclaration|FunctionExpression'(p){ if(p.node.id && isHardToReadName(p.node.id.name)) artifacts++; p.node.params.forEach(pm=>{ const n=pm.name||pm.left?.name||pm.argument?.name; if(n && isHardToReadName(n)) artifacts++; }); },
                VariableDeclarator(p){ if(t.isIdentifier(p.node.id) && isHardToReadName(p.node.id.name)) artifacts++; },
                CatchClause(p){ if(p.node.param && t.isIdentifier(p.node.param) && isHardToReadName(p.node.param.name)) artifacts++; }
            });
        } catch {}
    }
    return artifacts;
}

async function ultraDeobfuscate(code) {
    let result = code, decoded = [], method = [], simplifications = 0, hasWebcrackResult = false;
    let liveResolved = 0;
    const warnings = [];

    // Stage 1: Webcrack
    if (webcrack) {
        try {
            const res = await webcrack(code);
            if(res?.code){ result = res.code; method.push('webcrack'); hasWebcrackResult = true; }
        } catch(e) { warnings.push(`webcrack-failed: ${e.message?.slice(0,60)}`); }
    }

    // Stage 2: VM run
    const sandbox = createSandbox();
    const vmCtx = vm.createContext(sandbox);
    try {
        const script = new vm.Script(code);
        script.runInContext(vmCtx, { timeout: 10000 });
        method.push('vm');
        sandbox.__decoded.forEach(s => decoded.push(s));
    } catch(e) { warnings.push(`vm-run-failed: ${e.message?.slice(0,60)}`); }

    // Stage 3: Base64 & Hex scanning
    const b64 = [...code.matchAll(/["']([A-Za-z0-9+/]{20,}={0,2})["']/g)];
    for(const m of b64){ const d=base64Decode(m[1]); if(d&&isMeaningfulString(d)) decoded.push(d); }
    const hex = [...code.matchAll(/["']([0-9A-Fa-f]{16,})["']/g)];
    for(const m of hex){ const d=hexDecode(m[1]); if(d&&isMeaningfulString(d)) decoded.push(d); }

    const ast = parseWithFallback(result);
    if (!ast) warnings.push('parse-failed');

    if (ast) {
        // Phase 1: string arrays
        let candidateArrays = [];
        try {
            traverse(ast, { VariableDeclarator(p){
                if(t.isArrayExpression(p.node.init) && p.node.init.elements.length>10 && t.isIdentifier(p.node.id)){
                    const values = p.node.init.elements.map(e=> t.isStringLiteral(e) ? e.value : (t.isNumericLiteral(e)?e.value:undefined));
                    candidateArrays.push({ name: p.node.id.name, values });
                    values.filter(isMeaningfulString).forEach(v=>decoded.push(v));
                }
            }});
            if (candidateArrays.length) method.push('string-array');
        } catch(e) { warnings.push(`array-scan-failed: ${e.message?.slice(0,60)}`); }

        // Phase 2: backfill empty arrays
        if (vmCtx && candidateArrays.length) {
            for (const ca of candidateArrays) {
                try {
                    const live = vmCtx[ca.name];
                    if ((!live || (Array.isArray(live) && live.length === 0)) && ca.values.length > 0) {
                        sandbox[ca.name] = ca.values;
                        warnings.push(`array-backfill: ${ca.name}[${ca.values.length}]`);
                    }
                } catch {}
            }
        }

        // Phase 3: registry injection & live decode
        if (vmCtx && candidateArrays.length) {
            try {
                const decoderNames = findDecoderFunctionNames(ast, candidateArrays.map(a => a.name));
                const injectionSrc = buildRegistryInjection(decoderNames);
                if (injectionSrc) {
                    const injScript = new vm.Script(injectionSrc);
                    injScript.runInContext(vmCtx, { timeout: 2000 });
                    if (Object.keys(sandbox.__ud_reg__).length) method.push('registry-inject');
                }
            } catch(e) { warnings.push(`registry-inject-failed: ${e.message?.slice(0,60)}`); }

            const fnCache = new Map();
            try {
                traverse(ast, {
                    CallExpression(p) {
                        const callee = p.node.callee;
                        let fnName = null;
                        if (t.isIdentifier(callee)) fnName = callee.name;
                        else if (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && t.isStringLiteral(callee.property)) {
                            fnName = callee.object.name + '.' + callee.property.value;
                        }
                        if (!fnName || JS_GLOBALS.has(fnName.split('.')[0])) return;
                        const args = p.node.arguments;
                        if (!args.length || args.length > 3) return;
                        if (!args.every(a => t.isNumericLiteral(a) || t.isStringLiteral(a))) return;

                        let safe = fnCache.get(fnName);
                        if (safe === undefined) {
                            let fn;
                            if (fnName.includes('.')) {
                                const [obj, prop] = fnName.split('.');
                                fn = (sandbox[obj] || sandbox.__ud_reg__?.[obj])?.[prop];
                            } else {
                                fn = sandbox.__ud_reg__?.[fnName] ?? sandbox[fnName];
                            }
                            safe = typeof fn === 'function' && !DANGEROUS_FN.test(fn.toString());
                            fnCache.set(fnName, safe);
                        }
                        if (!safe) return;

                        const argLiterals = args.map(a => a.value);
                        const val = tryLiveCall(sandbox, fnName, argLiterals);
                        if (val === undefined) return;
                        p.replaceWith(typeof val === 'string' ? t.stringLiteral(val) : t.valueToNode(val));
                        simplifications++; liveResolved++;
                        if (typeof val === 'string' && isMeaningfulString(val)) decoded.push(val);
                    }
                });
                if (liveResolved) method.push('live-decode');
            } catch(e) { warnings.push(`live-decode-failed: ${e.message?.slice(0,60)}`); }
        }

        // Phase 4: constant folding + harvest
        try {
            traverse(ast, {
                BinaryExpression(p){ if(t.isStringLiteral(p.node.left)&&t.isStringLiteral(p.node.right)&&p.node.operator==='+'){ p.replaceWith(t.stringLiteral(p.node.left.value+p.node.right.value)); simplifications++; } },
                ConditionalExpression(p){ if(t.isBooleanLiteral(p.node.test)){ p.replaceWith(p.node.test.value?p.node.consequent:p.node.alternate); simplifications++; } },
                StringLiteral(p){ const v=p.node.value; if(isMeaningfulString(v)) decoded.push(v); }
            });
        } catch(e) { warnings.push(`fold-failed: ${e.message?.slice(0,60)}`); }

        // Phase 5: Global rename map – inaondoa majina yote magumu
        try {
            const renameMap = new Map();
            let counter = 0;
            const getNewName = () => `v${++counter}`;

            traverse(ast, {
                FunctionDeclaration(p) {
                    if (p.node.id && isHardToReadName(p.node.id.name) && !renameMap.has(p.node.id.name)) {
                        renameMap.set(p.node.id.name, getNewName());
                    }
                    p.node.params.forEach(pm => {
                        const id = t.isIdentifier(pm) ? pm : (t.isAssignmentPattern(pm) && t.isIdentifier(pm.left)) ? pm.left : (t.isRestElement(pm) && t.isIdentifier(pm.argument)) ? pm.argument : null;
                        if (id && isHardToReadName(id.name) && !renameMap.has(id.name)) {
                            renameMap.set(id.name, getNewName());
                        }
                    });
                },
                FunctionExpression(p) {
                    if (p.node.id && isHardToReadName(p.node.id.name) && !renameMap.has(p.node.id.name)) {
                        renameMap.set(p.node.id.name, getNewName());
                    }
                    p.node.params.forEach(pm => {
                        const id = t.isIdentifier(pm) ? pm : (t.isAssignmentPattern(pm) && t.isIdentifier(pm.left)) ? pm.left : (t.isRestElement(pm) && t.isIdentifier(pm.argument)) ? pm.argument : null;
                        if (id && isHardToReadName(id.name) && !renameMap.has(id.name)) {
                            renameMap.set(id.name, getNewName());
                        }
                    });
                },
                ArrowFunctionExpression(p) {
                    p.node.params.forEach(pm => {
                        const id = t.isIdentifier(pm) ? pm : (t.isAssignmentPattern(pm) && t.isIdentifier(pm.left)) ? pm.left : (t.isRestElement(pm) && t.isIdentifier(pm.argument)) ? pm.argument : null;
                        if (id && isHardToReadName(id.name) && !renameMap.has(id.name)) {
                            renameMap.set(id.name, getNewName());
                        }
                    });
                },
                VariableDeclarator(p) {
                    if (t.isIdentifier(p.node.id) && isHardToReadName(p.node.id.name) && !renameMap.has(p.node.id.name)) {
                        renameMap.set(p.node.id.name, getNewName());
                    }
                },
                CatchClause(p) {
                    if (p.node.param && t.isIdentifier(p.node.param) && isHardToReadName(p.node.param.name) && !renameMap.has(p.node.param.name)) {
                        renameMap.set(p.node.param.name, getNewName());
                    }
                }
            });

            if (renameMap.size > 0) {
                traverse(ast, {
                    Identifier(p) {
                        if (renameMap.has(p.node.name)) {
                            p.node.name = renameMap.get(p.node.name);
                        }
                    }
                });
                simplifications += renameMap.size;
            }
        } catch(e) { warnings.push(`rename-failed: ${e.message?.slice(0,60)}`); }

        // Phase 6: dead code cleanup
        try {
            traverse(ast, {
                FunctionDeclaration(p){
                    if(p.node.id && /[^\x00-\x7F]/.test(p.node.id.name)){
                        const b = p.scope.getBinding(p.node.id.name);
                        if(!b || b.references === 0){ p.remove(); simplifications++; }
                    }
                },
                VariableDeclarator(p){
                    if(t.isIdentifier(p.node.id) && /[^\x00-\x7F]/.test(p.node.id.name)){
                        const b = p.scope.getBinding(p.node.id.name);
                        if(!b || b.references === 0){
                            const decl = p.parentPath;
                            if(decl.node.declarations.length === 1) decl.remove();
                            else p.remove();
                            simplifications++;
                        }
                    }
                }
            });
        } catch(e) { warnings.push(`cleanup-failed: ${e.message?.slice(0,60)}`); }

        // Generate final code
        try {
            result = generate(ast, { compact: false }).code;
            method.push('ast');
        } catch(e) { warnings.push(`generate-failed: ${e.message?.slice(0,60)}`); }
    }

    decoded = [...new Set(decoded)];
    const artifacts = countObfuscationArtifacts(result, ast);
    const { confidence, breakdown } = calculateConfidence(decoded.length, code.length, result.length, simplifications, hasWebcrackResult, artifacts);
    const report = decoded.length ? `\n\n// === DECODED STRINGS (${decoded.length}) ===\n` + decoded.slice(0, 150).join('\n') : '';
    return {
        code: result + report,
        confidence,
        breakdown,
        method: method.join(' + '),
        decodedCount: decoded.length,
        liveResolved,
        originalSize: code.length,
        newSize: result.length,
        simplifications,
        warnings
    };
}

function sanitizeFileName(n){ return path.basename(String(n||'code')).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100)||'code'; }

export const name = 'deobfuscate';
export const description = 'ULTRA++ v2.9.3 (global rename, no scope dependency)';
export const category = 'tools';
export const use = '<reply to JS file>';
export const alias = ['deobf','ultra','unpack','dd'];

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    try {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        let code = null; let sourceLabel = 'input';
        if(quoted?.documentMessage){
            const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(quoted.documentMessage,'document');
            let buffer = Buffer.from([]); for await(const chunk of stream) buffer = Buffer.concat([buffer,chunk]);
            code = buffer.toString('utf8'); sourceLabel = sanitizeFileName(quoted.documentMessage.fileName);
        } else { code = (quoted?.conversation || quoted?.extendedTextMessage?.text || args.join(' ')).trim(); }
        if(!code || code.length < 50) return sock.sendMessage(from,{text:'❓ Reply to JS file'}, {quoted:msg});
        if(code.length > MAX_FILE_SIZE) return sock.sendMessage(from,{text:'❌ File too big'}, {quoted:msg});
        const proc = await sock.sendMessage(from,{text:'⏳ Deobfuscating...'}, {quoted:msg});
        const result = await ultraDeobfuscate(code);
        const outPath = path.join(os.tmpdir(), `deobf_${Date.now()}.js`); fs.writeFileSync(outPath, result.code);
        const warnLine = result.warnings.length? `\n⚠️ ${result.warnings.slice(0,3).join('; ')}` : '';
        const caption = `🚀 ULTRA++ v2.9.3\nMethod: ${result.method}\nConfidence: ${result.confidence}%\n${result.breakdown}\nStrings: ${result.decodedCount} (live: ${result.liveResolved})${warnLine}`;
        await sock.sendMessage(from,{document:fs.readFileSync(outPath),fileName:`CLEAN_${sourceLabel}`,mimetype:'text/javascript',caption},{quoted:msg});
        try{fs.unlinkSync(outPath);}catch{} await sock.sendMessage(from,{delete:proc.key}).catch(()=>{});
    } catch(e){ await sock.sendMessage(from,{text:`❌ Error: ${e.message}`},{quoted:msg}); }
}