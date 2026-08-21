#!/usr/bin/env node
// WEConverge paired benchmark controller — boring Node ESM, stdlib only
// Commands: preflight, stage --run <opaque-id>, finalize --run <opaque-id> --result <path>, capture, execute, execute-all
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_PATH = path.join(ROOT, 'benchmark', 'corpus.json');
const SCHEDULE_PATH = path.join(ROOT, 'benchmark', 'schedule.json');
const EXECUTION_PATH = path.join(ROOT, 'benchmark', 'execution.json');
const RUNS_ROOT = path.join(ROOT, 'benchmark', 'runs');

function usage(exitCode=1){
  console.error(`Usage:
  node scripts/benchmark-weconverge.mjs preflight
  node scripts/benchmark-weconverge.mjs stage --run <opaque-id>
  node scripts/benchmark-weconverge.mjs finalize --run <opaque-id> --result <path>
  node scripts/benchmark-weconverge.mjs capture --run <opaque-id> --exit-code <n> --duration-ms <n> --final-answer <path>
  node scripts/benchmark-weconverge.mjs execute --run <opaque-id> [--dry-run]
  node scripts/benchmark-weconverge.mjs execute-all [--dry-run]
  node scripts/benchmark-weconverge.mjs probe-usage [--correlation <id>] [--prompt <text>] [--out-dir <dir>]
`);
  process.exit(exitCode);
}

function loadJson(p){
  if(!fs.existsSync(p)) throw new Error(`missing ${p}`);
  return JSON.parse(fs.readFileSync(p,'utf-8'));
}

function sha256(s){
  return crypto.createHash('sha256').update(s,'utf-8').digest('hex');
}

function sha256File(p){
  const buf = fs.readFileSync(p);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function checkTool(cmd, args){
  try{
    const r = spawnSync(cmd, args, { encoding:'utf-8', timeout: 8000, shell: false, windowsHide:true });
    if(r.error) return { available:false, error: r.error.message };
    if(r.status!==0) return { available:false, version: (r.stdout||r.stderr||'').trim().slice(0,200), status:r.status };
    return { available:true, version: (r.stdout||'').trim().split('\n')[0].slice(0,200) };
  }catch(e){
    return { available:false, error: String(e.message).slice(0,200) };
  }
}

function loadExecution(){
  if(!fs.existsSync(EXECUTION_PATH)) throw new Error(`missing execution config ${EXECUTION_PATH}`);
  const cfg = JSON.parse(fs.readFileSync(EXECUTION_PATH,'utf-8'));
  return cfg;
}

// ---- OMP usage capture (official machine-readable surface) ----
// Official surface: `omp -p --no-session --mode json` line-delimited JSON event stream.
// Each line is JSON object; assistant messages carry `message.usage` with provider response facts
// (openai-responses: input/output/cacheRead/cacheWrite/totalTokens/cost).
// Exact evidence: message_end/turn_end/agent_end `message.usage` objects (see probe artifacts).
// Delegated probe delegated-20260821-001: parent stream shows only parent provider usage (0 due to deadline in that run; normally non-zero) and hub wait shows child job metadata (toolCallId call_HuNSOLfLrxKhLVsirhGNfhye|fc_..., job ComputeProduct, resolvedModel opencode-go-responses/muse-spark-1.2-contributor, duration 14.6s) but no child Provider token counts — parent-only aggregate, child SOURCE GAP, no double counting (dedup by responseId, uncorrelatable rejected).
// Cross-run/global usage (`omp usage`/`omp stats`) rejected — only per-run jsonl consumed.
function parseOmpJsonlUsage(jsonlPath, jsonlText){
  const raw = jsonlText !== undefined ? jsonlText : fs.readFileSync(jsonlPath, 'utf-8');
  const lines = raw.split('\n').filter(l=>l.trim().length>0);
  const byResponseId = new Map();
  let eventCount = 0;
  let provider = null;
  let model = null;
  let api = null;
  let uncorrelatable_count = 0;
  const responseIds = [];
  for(const line of lines){
    let obj;
    try{ obj = JSON.parse(line); }catch{ continue; }
    eventCount++;
    const candidates = [];
    if(obj.message && obj.message.usage) candidates.push(obj.message);
    if(Array.isArray(obj.messages)){
      for(const m of obj.messages){ if(m && m.usage) candidates.push(m); }
    }
    if(obj.message && Array.isArray(obj.message.content)){
      // already candidate
    }
    // turn_end/message_end wraps message directly; agent_end wraps messages array
    for(const msg of candidates){
      const u = msg.usage;
      if(!u || typeof u !== 'object') continue;
      const rid = msg.responseId || msg.response_id || u.responseId || null;
      if(!rid){
        uncorrelatable_count++;
        continue;
      }
      const key = rid;
      // dedup prefer non-zero
      if(!byResponseId.has(key)){
        byResponseId.set(key, { usage: u, meta: { provider: msg.provider || null, model: msg.model || null, api: msg.api || null, responseId: rid, timestamp: msg.timestamp || null } });
        responseIds.push(rid);
        if(msg.provider && !provider) provider = msg.provider;
        if(msg.model && !model) model = msg.model;
        if(msg.api && !api) api = msg.api;
      } else {
        const prev = byResponseId.get(key);
        const prevTotal = (prev.usage && (prev.usage.totalTokens ?? prev.usage.total_tokens)) || 0;
        const curTotal = (u.totalTokens ?? u.total_tokens) || 0;
        const prevInput = (prev.usage && prev.usage.input) || 0;
        const curInput = u.input || 0;
        if(curTotal > prevTotal || curInput > prevInput){
          byResponseId.set(key, { usage: u, meta: { provider: msg.provider || provider, model: msg.model || model, api: msg.api || api, responseId: rid, timestamp: msg.timestamp || null } });
        }
      }
    }
  }
  let sumInput = 0, sumOutput = 0, sumCacheRead = 0, sumCacheWrite = 0, sumTotal = 0, sumReasoning = 0;
  let hasInput = false, hasOutput = false, hasCacheRead = false, hasCacheWrite = false, hasTotal = false, hasReasoning = false;
  for(const [, v] of byResponseId){
    const u = v.usage;
    if(u.input !== undefined && u.input !== null){ sumInput += Number(u.input)||0; hasInput = true; }
    else if(u.input_tokens !== undefined){ sumInput += Number(u.input_tokens)||0; hasInput = true; }
    if(u.output !== undefined && u.output !== null){ sumOutput += Number(u.output)||0; hasOutput = true; }
    else if(u.output_tokens !== undefined){ sumOutput += Number(u.output_tokens)||0; hasOutput = true; }
    if(u.cacheRead !== undefined && u.cacheRead !== null){ sumCacheRead += Number(u.cacheRead)||0; hasCacheRead = true; }
    else if(u.cache_read !== undefined){ sumCacheRead += Number(u.cache_read)||0; hasCacheRead = true; }
    if(u.cacheWrite !== undefined && u.cacheWrite !== null){ sumCacheWrite += Number(u.cacheWrite)||0; hasCacheWrite = true; }
    if(u.totalTokens !== undefined && u.totalTokens !== null){ sumTotal += Number(u.totalTokens)||0; hasTotal = true; }
    else if(u.total_tokens !== undefined){ sumTotal += Number(u.total_tokens)||0; hasTotal = true; }
    if(u.reasoningTokens !== undefined && u.reasoningTokens !== null){ sumReasoning += Number(u.reasoningTokens)||0; hasReasoning = true; }
    else if(u.reasoning_tokens !== undefined){ sumReasoning += Number(u.reasoning_tokens)||0; hasReasoning = true; }
    else if(u.reasoning !== undefined && u.reasoning !== null){ sumReasoning += Number(u.reasoning)||0; hasReasoning = true; }
  }
  const aggregated = {
    input: hasInput ? sumInput : null,
    cached_input: hasCacheRead ? sumCacheRead : null,
    cache_write: hasCacheWrite ? sumCacheWrite : null,
    output: hasOutput ? sumOutput : null,
    reasoning: hasReasoning ? sumReasoning : null,
    total: hasTotal ? sumTotal : (hasInput && hasOutput ? sumInput + sumOutput : null),
    event_count: eventCount,
    deduped_responses: byResponseId.size,
    uncorrelatable_count: uncorrelatable_count,
    response_ids: responseIds,
    provider: provider,
    model: model,
    api: api,
    byResponseId: Array.from(byResponseId.entries()).map(([k,v])=>({ key:k, usage:v.usage, meta:v.meta }))
  };
  return aggregated;
}

function buildNormalizedUsage(agg, extra){
  const provenance = {
    provider: agg.provider || null,
    model: agg.model || null,
    api: agg.api || null,
    response_ids: agg.response_ids || [],
    event_count: agg.event_count,
    deduped_responses: agg.deduped_responses,
    uncorrelatable_count: agg.uncorrelatable_count ?? 0,
    jsonl_sha256: extra && extra.jsonl_sha256 ? extra.jsonl_sha256 : null,
    jsonl_path: extra && extra.jsonl_path ? extra.jsonl_path : null,
    captured_at: new Date().toISOString(),
    correlation: extra && extra.correlation ? extra.correlation : null
  };
  const gapEntries = [];
  if((agg.uncorrelatable_count ?? 0) > 0){
    gapEntries.push(`uncorrelatable usage records: ${agg.uncorrelatable_count} records without responseId were rejected/skipped and not aggregated — SOURCE GAP (deterministic, never estimated)`);
  }
  const normalized = {
    input: agg.input !== null && agg.input !== undefined ? agg.input : null,
    cached_input: agg.cached_input !== null && agg.cached_input !== undefined ? agg.cached_input : null,
    output: agg.output !== null && agg.output !== undefined ? agg.output : null,
    reasoning: agg.reasoning !== null && agg.reasoning !== undefined ? agg.reasoning : null,
    total: agg.total !== null && agg.total !== undefined ? agg.total : null,
    source: "omp --mode json event stream: message.usage (Provider response facts, openai-responses) — official machine-readable usage surface for `omp -p --no-session`",
    provenance: provenance,
    raw: {
      cache_write: agg.cache_write,
      by_response: agg.byResponseId
    },
    attribution: {
      note: "SOURCE GAP: delegated probe delegated-20260821-001 shows parent JSON stream contains only parent Provider usage (deduped by responseId, uncorrelatable rejected, no double counting); child task job appears via hub wait (toolCallId call_HuNSOLfLrxKhLVsirhGNfhye, job ComputeProduct, resolvedModel opencode-go-responses/muse-spark-1.2-contributor, duration 14.6s) but child token counts not present in parent stream — child coverage unproven/SOURCE GAP, parent-only aggregate.",
      main: null,
      children: null
    },
    source_gaps: [
      "reasoning tokens: exposed as usage.reasoningTokens when present (e.g. 47 in wireusage-20260821-001) — otherwise null/SOURCE GAP; not double-counted in total",
      "child attribution/coverage: delegated probe shows child job metadata (toolCallId, jobId, resolvedModel) via hub wait but no child Provider usage in parent JSON stream — child tokens SOURCE GAP, not separable authoritatively for usage; parent-only aggregate, no double counting",
      "subscription quota / API price: not exposed by per-run usage surface — SOURCE GAP unless `omp usage` (global, rejected for per-run)",
      "cost: available in raw usage.cost but not normalized as price — excluded from normalized pricing",
      ...gapEntries
    ]
  };
  return normalized;
}

function persistUsageForRun(runDir, jsonlPath, jsonlText, extra){
  let agg;
  let jsonlSha = null;
  try{
    const txt = jsonlText !== undefined ? jsonlText : (fs.existsSync(jsonlPath) ? fs.readFileSync(jsonlPath,'utf-8') : '');
    if(txt) jsonlSha = crypto.createHash('sha256').update(txt,'utf-8').digest('hex');
    agg = parseOmpJsonlUsage(jsonlPath, txt);
  }catch(e){
    agg = { input:null, cached_input:null, output:null, reasoning:null, total:null, cache_write:null, event_count:0, deduped_responses:0, uncorrelatable_count:0, response_ids:[], provider:null, model:null, api:null, byResponseId:[] };
  }
  const normalized = buildNormalizedUsage(agg, { jsonl_sha256: jsonlSha, jsonl_path: jsonlPath ? path.relative(ROOT, jsonlPath) : null, correlation: extra && extra.correlation ? extra.correlation : null });
  const usagePath = path.join(runDir,'usage.json');
  fs.writeFileSync(usagePath, JSON.stringify(normalized,null,2));
  return normalized;
}

function extractFinalAnswerFromJsonl(jsonlText){
  const lines = jsonlText.split('\n').filter(l=>l.trim().length>0);
  let lastText = null;
  for(const line of lines){
    let obj;
    try{ obj = JSON.parse(line); }catch{ continue; }
    if(obj.type==='agent_end' && Array.isArray(obj.messages)){
      for(const m of obj.messages){
        if(m.role==='assistant' && Array.isArray(m.content)){
          for(const c of m.content){ if(c.type==='text' && typeof c.text==='string'){ lastText = c.text; } }
        }
      }
    }
    if(obj.type==='message_end' && obj.message && obj.message.role==='assistant' && Array.isArray(obj.message.content)){
      for(const c of obj.message.content){ if(c.type==='text' && typeof c.text==='string'){ lastText = c.text; } }
    }
    if(obj.type==='turn_end' && obj.message && obj.message.role==='assistant' && Array.isArray(obj.message.content)){
      for(const c of obj.message.content){ if(c.type==='text' && typeof c.text==='string'){ lastText = c.text; } }
    }
  }
  return lastText;
}

function verifyScheduleConfigOrThrow(){
  // refuse schedule/config mismatch
  const cfg = loadExecution();
  const schedRaw = fs.readFileSync(SCHEDULE_PATH,'utf-8');
  const actualSha = sha256(schedRaw);
  if(cfg.schedule_sha256 && cfg.schedule_sha256 !== actualSha){
    console.error(`schedule/config mismatch: execution expects ${cfg.schedule_sha256} got ${actualSha}`);
    process.exit(2);
  }
  const sched = JSON.parse(schedRaw);
  if(cfg.schedule_total_runs && sched.runs.length !== cfg.schedule_total_runs){
    console.error(`schedule/config mismatch: total_runs ${sched.runs.length} != ${cfg.schedule_total_runs}`);
    process.exit(2);
  }
  if(sched.runs.length !== 40){
    console.error(`schedule must have exactly 40 runs`);
    process.exit(2);
  }
  return { cfg, sched };
}

function assertNoArmLeakInText(txt, context){
  if(/"arm"\s*:\s*"(ON|OFF)"/.test(txt)){
    console.error(`invariant failure: arm leaked in ${context}`);
    process.exit(2);
  }
  if(/arm\s*[:=]\s*(ON|OFF)/i.test(txt) && txt.includes('arm')){
    // strict: grading/result-anon must not contain arm field
    if(/"arm"/.test(txt)){
      console.error(`invariant failure: arm field in ${context}`);
      process.exit(2);
    }
  }
}

function cmdPreflight(){
  const tools = {};
  tools.git = checkTool('git', ['--version']);
  tools.node = { available:true, version: process.version };
  tools.omp = checkTool('omp', ['--version']);
  tools.docker = checkTool('docker', ['--version']);
  tools.wsl = checkTool('wsl', ['--status']);
  tools.corpus = fs.existsSync(CORPUS_PATH) ? { available:true } : { available:false };
  tools.schedule = fs.existsSync(SCHEDULE_PATH) ? { available:true } : { available:false };
  const out = {
    timestamp: new Date().toISOString(),
    tools,
    note: 'preflight records availability but does not install anything'
  };
  console.log(JSON.stringify(out,null,2));
  try{
    if(fs.existsSync(path.join(ROOT,'benchmark'))){
      fs.writeFileSync(path.join(ROOT,'benchmark','preflight.json'), JSON.stringify(out,null,2));
    }
  }catch{}
  const missingEssential = !tools.git.available || !tools.node.available;
  if(missingEssential) process.exit(2);
}

function cmdStage(runId){
  if(!runId) usage();
  const schedule = loadJson(SCHEDULE_PATH);
  const corpus = loadJson(CORPUS_PATH);
  const run = schedule.runs.find(r=>r.run_id===runId);
  if(!run) {
    console.error(`run_id not found in schedule: ${runId}`);
    process.exit(2);
  }
  const instance = corpus.instances.find(i=>i.instance_id===run.instance_id);
  if(!instance){
    console.error(`instance not found in corpus: ${run.instance_id}`);
    process.exit(2);
  }
  const runDir = path.join(RUNS_ROOT, runId);
  if(fs.existsSync(runDir)){
    const entries = fs.readdirSync(runDir);
    if(entries.length>0){
      console.error(`refusing dirty/reused run directory: ${runDir} contains ${entries.length} entries`);
      process.exit(2);
    }
  }
  fs.mkdirSync(runDir, { recursive:true });
  const publicInstance = {
    instance_id: instance.instance_id,
    repo: instance.repo,
    base_commit: instance.base_commit,
    version: instance.version,
    environment_setup_commit: instance.environment_setup_commit,
    difficulty: instance.difficulty,
    created_at: instance.created_at,
    FAIL_TO_PASS: instance.FAIL_TO_PASS,
    PASS_TO_PASS: instance.PASS_TO_PASS,
    problem_statement_sha256: instance.problem_statement_sha256,
    problem_statement_len: instance.problem_statement_len,
    patch_hash: instance.patch_hash,
    test_patch_hash: instance.test_patch_hash
  };
  fs.writeFileSync(path.join(runDir,'instance.json'), JSON.stringify(publicInstance,null,2));
  const prompt = instance.problem_statement;
  const promptContent = `# Task: ${instance.instance_id}\n\n${prompt}\n`;
  assertNoArmLeakInText(promptContent, 'PROMPT generation');
  fs.writeFileSync(path.join(runDir,'PROMPT.md'), promptContent, 'utf-8');
  fs.writeFileSync(path.join(runDir,'problem_statement.txt'), prompt, 'utf-8');
  const meta = {
    run_id: run.run_id,
    instance_id: run.instance_id,
    repeat: run.repeat,
    index: run.index,
    repo: instance.repo,
    base_commit: instance.base_commit,
    version: instance.version,
    staged_at: new Date().toISOString()
  };
  const metaStr = JSON.stringify(meta);
  assertNoArmLeakInText(metaStr, 'meta');
  fs.writeFileSync(path.join(runDir,'meta.json'), JSON.stringify(meta,null,2));
  const cloneStatus = { attempted:true, repo: instance.repo, base_commit: instance.base_commit, success:false, reason:'' };
  const gitCheck = checkTool('git',['--version']);
  if(!gitCheck.available){
    cloneStatus.reason = 'git not available';
  } else {
    const repoUrl = `https://github.com/${instance.repo}.git`;
    const repoDir = path.join(runDir,'repo');
    if(fs.existsSync(repoDir)){
      cloneStatus.reason = 'repo dir already exists';
    } else {
      const cloneRes = spawnSync('git',['clone','--depth','1', repoUrl, repoDir], { encoding:'utf-8', timeout: 30000, windowsHide:true });
      if(cloneRes.status!==0){
        cloneStatus.reason = `clone failed: ${(cloneRes.stderr||cloneRes.stdout||'').trim().slice(0,500)}`;
        try{ if(fs.existsSync(repoDir)) fs.rmSync(repoDir,{recursive:true, force:true}); }catch{}
      } else {
        const fetchRes = spawnSync('git',['-C', repoDir,'fetch','--depth','1','origin', instance.base_commit], { encoding:'utf-8', timeout: 30000, windowsHide:true });
        if(fetchRes.status===0){
          const checkoutRes = spawnSync('git',['-C', repoDir,'checkout', instance.base_commit], { encoding:'utf-8', timeout:15000, windowsHide:true });
          if(checkoutRes.status===0){
            cloneStatus.success = true;
            cloneStatus.reason = 'cloned and checked out base_commit';
          } else {
            cloneStatus.reason = `checkout failed: ${(checkoutRes.stderr||'').trim().slice(0,300)}`;
          }
        } else {
          const revRes = spawnSync('git',['-C', repoDir,'rev-parse','HEAD'], { encoding:'utf-8', timeout:5000, windowsHide:true });
          const head = (revRes.stdout||'').trim();
          if(head===instance.base_commit){
            cloneStatus.success=true;
            cloneStatus.reason='HEAD matches base_commit (shallow)';
          } else {
            cloneStatus.reason = `fetch base_commit failed: ${(fetchRes.stderr||'').trim().slice(0,300)}`;
          }
        }
      }
    }
  }
  fs.writeFileSync(path.join(runDir,'clone-status.json'), JSON.stringify(cloneStatus,null,2));
  if(!cloneStatus.success){
    console.log(JSON.stringify({ run_id: runId, staged:true, clone: cloneStatus, warning:'repo checkout not obtained — staged prompt still available (blocked checkout)', runDir },null,2));
  } else {
    console.log(JSON.stringify({ run_id: runId, staged:true, clone: cloneStatus, runDir },null,2));
  }
}

function cmdFinalize(runId, resultPath){
  if(!runId || !resultPath) usage();
  const schedule = loadJson(SCHEDULE_PATH);
  const run = schedule.runs.find(r=>r.run_id===runId);
  if(!run){
    console.error(`run_id not found: ${runId}`);
    process.exit(2);
  }
  const runDir = path.join(RUNS_ROOT, runId);
  if(!fs.existsSync(runDir)){
    console.error(`run directory not found — stage first: ${runDir}`);
    process.exit(2);
  }
  if(!fs.existsSync(resultPath)){
    console.error(`result file not found: ${resultPath}`);
    process.exit(2);
  }
  const resultContent = fs.readFileSync(resultPath,'utf-8');
  let parsed;
  try{ parsed = JSON.parse(resultContent); }catch{ parsed = resultContent; }
  const grading = {
    run_id: run.run_id,
    instance_id: run.instance_id,
    repeat: run.repeat,
    index: run.index,
    submitted_at: new Date().toISOString(),
    result: parsed
  };
  if('arm' in grading) delete grading.arm;
  const gradingStr = JSON.stringify(grading);
  assertNoArmLeakInText(gradingStr, 'grading');
  const gradingPath = path.join(runDir,'grading.json');
  if(fs.existsSync(gradingPath)){
    console.error(`grading already exists for ${runId} — overwriting`);
  }
  fs.writeFileSync(gradingPath, JSON.stringify(grading,null,2));
  const anonPath = path.join(runDir,'result-anon.json');
  fs.writeFileSync(anonPath, JSON.stringify(grading,null,2));
  const gtxt = fs.readFileSync(gradingPath,'utf-8');
  assertNoArmLeakInText(gtxt, 'grading file');
  console.log(JSON.stringify({ run_id: runId, finalized:true, grading: gradingPath, anon: anonPath },null,2));
}

// capture helpers
function captureGitArtifacts(runDir){
  const repoDir = path.join(runDir,'repo');
  let patch = '';
  let status = '';
  let head = '';
  let diffStat = '';
  if(fs.existsSync(repoDir) && fs.existsSync(path.join(repoDir,'.git'))){
    const diffRes = spawnSync('git',['-C', repoDir,'diff'], { encoding:'utf-8', timeout: 8000, windowsHide:true, maxBuffer: 10*1024*1024 });
    patch = diffRes.stdout || '';
    const statusRes = spawnSync('git',['-C', repoDir,'status','--porcelain'], { encoding:'utf-8', timeout: 5000, windowsHide:true });
    status = (statusRes.stdout||'').trim();
    const headRes = spawnSync('git',['-C', repoDir,'rev-parse','HEAD'], { encoding:'utf-8', timeout: 5000, windowsHide:true });
    head = (headRes.stdout||'').trim();
    const statRes = spawnSync('git',['-C', repoDir,'diff','--stat'], { encoding:'utf-8', timeout: 5000, windowsHide:true });
    diffStat = (statRes.stdout||'').trim();
  } else {
    // fallback: use existing patch.diff if repo not present (offline)
    const existingPatch = path.join(runDir,'patch.diff');
    if(fs.existsSync(existingPatch)) patch = fs.readFileSync(existingPatch,'utf-8');
    status = 'repo not available';
    head = '';
    diffStat = '';
  }
  const patchSha = patch ? sha256(patch) : '';
  // always ensure patch.diff on disk reflects git diff
  if(patch) fs.writeFileSync(path.join(runDir,'patch.diff'), patch, 'utf-8');
  const patchInfo = {
    patch_sha256: patchSha,
    patch_bytes: Buffer.byteLength(patch,'utf-8'),
    patch_lines: patch ? patch.split('\n').length : 0,
    git_status: status,
    git_head: head,
    diff_stat: diffStat
  };
  fs.writeFileSync(path.join(runDir,'patch.json'), JSON.stringify(patchInfo,null,2));
  return patchInfo;
}

function cmdCapture(runId, exitCode, durationMs, finalAnswerPath){
  if(!runId || exitCode===undefined || durationMs===undefined || !finalAnswerPath) usage();
  const ec = Number(exitCode);
  const dm = Number(durationMs);
  if(!Number.isInteger(ec) || ec<0) { console.error('exit-code must be integer >=0'); process.exit(2); }
  if(!Number.isInteger(dm) || dm<0) { console.error('duration-ms must be integer >=0'); process.exit(2); }
  const { cfg, sched } = verifyScheduleConfigOrThrow();
  const run = sched.runs.find(r=>r.run_id===runId);
  if(!run){ console.error(`run_id not found: ${runId}`); process.exit(2); }
  const runDir = path.join(RUNS_ROOT, runId);
  if(!fs.existsSync(runDir)){
    console.error(`run directory not found — stage first: ${runDir}`);
    process.exit(2);
  }
  // refuse if meta.json missing (dirty unstaged)
  if(!fs.existsSync(path.join(runDir,'meta.json')) || !fs.existsSync(path.join(runDir,'PROMPT.md'))){
    console.error(`refusing capture: run directory not properly staged (missing meta/PROMPT) ${runDir}`);
    process.exit(2);
  }
  // check PROMPT/meta do not leak arm
  const promptTxt = fs.readFileSync(path.join(runDir,'PROMPT.md'),'utf-8');
  assertNoArmLeakInText(promptTxt, 'PROMPT.md');
  const metaTxt = fs.readFileSync(path.join(runDir,'meta.json'),'utf-8');
  assertNoArmLeakInText(metaTxt, 'meta.json');
  if(!fs.existsSync(finalAnswerPath)){
    console.error(`final-answer file not found: ${finalAnswerPath}`);
    process.exit(2);
  }
  const finalAnswerContent = fs.readFileSync(finalAnswerPath,'utf-8');
  if(!finalAnswerContent || finalAnswerContent.trim().length===0){
    console.error('final-answer empty');
    process.exit(2);
  }
  const finalAnswerSha = sha256(finalAnswerContent);
  // ensure final-answer.txt in run dir (copy if different)
  const destFinal = path.join(runDir,'final-answer.txt');
  if(path.resolve(finalAnswerPath) !== path.resolve(destFinal)){
    fs.writeFileSync(destFinal, finalAnswerContent, 'utf-8');
  } else if(!fs.existsSync(destFinal)){
    fs.writeFileSync(destFinal, finalAnswerContent, 'utf-8');
  }
  // capture git artifacts
  const patchInfo = captureGitArtifacts(runDir);
  // ---- usage persistence (deterministic per-run, reject global) ----
  const ompJsonlPath = path.join(runDir,'omp.jsonl');
  let normalizedUsage = null;
  if(fs.existsSync(ompJsonlPath)){
    try{
      const txt = fs.readFileSync(ompJsonlPath,'utf-8');
      normalizedUsage = persistUsageForRun(runDir, ompJsonlPath, txt, { correlation: run.run_id });
    }catch{
      const gapAgg = { input:null, cached_input:null, output:null, reasoning:null, total:null, cache_write:null, event_count:0, deduped_responses:0, uncorrelatable_count:0, response_ids:[], provider:null, model:null, api:null, byResponseId:[] };
      normalizedUsage = buildNormalizedUsage(gapAgg, { jsonl_sha256:null, jsonl_path: path.relative(ROOT, ompJsonlPath), correlation: run.run_id });
      normalizedUsage.source_gaps.unshift("omp.jsonl read error — usage remains null/SOURCE GAP");
      fs.writeFileSync(path.join(runDir,'usage.json'), JSON.stringify(normalizedUsage,null,2));
    }
  } else {
    const gapAgg = { input:null, cached_input:null, output:null, reasoning:null, total:null, cache_write:null, event_count:0, deduped_responses:0, uncorrelatable_count:0, response_ids:[], provider:null, model:null, api:null, byResponseId:[] };
    normalizedUsage = buildNormalizedUsage(gapAgg, { jsonl_sha256:null, jsonl_path:null, correlation: run.run_id });
    normalizedUsage.source_gaps.unshift("omp.jsonl missing for this run — usage remains null/SOURCE GAP (existing finalized runs retain readability)");
    fs.writeFileSync(path.join(runDir,'usage.json'), JSON.stringify(normalizedUsage,null,2));
  }
  // validate schedule immutability already done
  // build anonymous result (include usage if available, no arm leak)
  const resultAnon = {
    run_id: run.run_id,
    instance_id: run.instance_id,
    repeat: run.repeat,
    index: run.index,
    exit_code: ec,
    duration_ms: dm,
    final_answer_sha256: finalAnswerSha,
    final_answer_bytes: Buffer.byteLength(finalAnswerContent,'utf-8'),
    patch_sha256: patchInfo.patch_sha256,
    patch_bytes: patchInfo.patch_bytes,
    git_head: patchInfo.git_head,
    git_status: patchInfo.git_status,
    submitted_at: new Date().toISOString(),
    usage: normalizedUsage
  };
  const resultStr = JSON.stringify(resultAnon);
  assertNoArmLeakInText(resultStr, 'result-anon');
  const anonPath = path.join(runDir,'result-anon.json');
  fs.writeFileSync(anonPath, JSON.stringify(resultAnon,null,2));
  // also finalize grading.json for compatibility (anonymous) — keep minimal but also include usage for audit
  const grading = {
    run_id: run.run_id,
    instance_id: run.instance_id,
    repeat: run.repeat,
    index: run.index,
    submitted_at: resultAnon.submitted_at,
    result: {
      exit_code: ec,
      duration_ms: dm,
      final_answer_sha256: finalAnswerSha,
      patch_sha256: patchInfo.patch_sha256
    },
    usage: normalizedUsage
  };
  assertNoArmLeakInText(JSON.stringify(grading), 'grading');
  fs.writeFileSync(path.join(runDir,'grading.json'), JSON.stringify(grading,null,2));
  // controller-only metadata outside grading (may contain arm) — include usage
  const controllerMeta = {
    run_id: run.run_id,
    instance_id: run.instance_id,
    arm: run.arm,
    repeat: run.repeat,
    index: run.index,
    model: cfg.model,
    effort: cfg.effort,
    thinking: cfg.thinking,
    max_time: cfg.max_time,
    extension: cfg.extension,
    exit_code: ec,
    duration_ms: dm,
    patch_sha256: patchInfo.patch_sha256,
    final_answer_sha256: finalAnswerSha,
    captured_at: resultAnon.submitted_at,
    usage: normalizedUsage
  };
  fs.writeFileSync(path.join(runDir,'controller.json'), JSON.stringify(controllerMeta,null,2));
  console.log(JSON.stringify({ run_id: runId, captured:true, exit_code: ec, duration_ms: dm, patch_sha256: patchInfo.patch_sha256, final_answer_sha256: finalAnswerSha, anon: anonPath, grading: path.join(runDir,'grading.json'), usage: path.join(runDir,'usage.json') },null,2));
}

function runControlVerb(verb, cfg, dryRun){
  if(!['off','on','reset'].includes(verb)){
    console.error(`invalid control verb ${verb}`);
    process.exit(2);
  }
  if(dryRun){
    console.log(`[dry-run] control ${verb} skipped`);
    return { status:0, dry:true };
  }
  const cmd = 'omp';
  const args = ['-p','--no-session','--model', cfg.model,'--thinking', cfg.thinking||cfg.effort,'--max-time', cfg.control_max_time||'20s','--no-skills','--no-rules','--no-extensions','--extension', cfg.extension, `/weconverge ${verb}`];
  const res = spawnSync(cmd, args, { encoding:'utf-8', timeout: 30000, windowsHide:true });
  if(res.status!==0){
    console.error(`control ${verb} failed status ${res.status}: ${(res.stderr||res.stdout||'').slice(0,500)}`);
    process.exit(2);
  }
  return res;
}

function cmdExecute(runId, dryRun){
  if(dryRun){
    const beforeRuns = fs.existsSync(RUNS_ROOT) ? fs.readdirSync(RUNS_ROOT).sort() : [];
    const { cfg, sched } = verifyScheduleConfigOrThrow();
    const run = sched.runs.find(r=>r.run_id===runId);
    if(!run){ console.error(`run_id not found: ${runId}`); process.exit(2); }
    const runDir = path.join(RUNS_ROOT, runId);
    const gradingPath = path.join(runDir,'grading.json');
    const anonPath = path.join(runDir,'result-anon.json');
    const finalized = fs.existsSync(gradingPath) && fs.existsSync(anonPath);
    const wouldStage = !fs.existsSync(runDir) || (fs.existsSync(runDir) && fs.readdirSync(runDir).length===0);
    const armVerb = run.arm === 'ON' ? 'on' : 'off';
    const controlOnOff = `omp -p --no-session --model ${cfg.model} --thinking ${cfg.thinking||cfg.effort} --max-time ${cfg.control_max_time} --no-skills --no-rules --no-extensions --extension ${cfg.extension} \"/weconverge ${armVerb}\"`;
    const controlReset = `omp -p --no-session --model ${cfg.model} --thinking ${cfg.thinking||cfg.effort} --max-time ${cfg.control_max_time} --no-skills --no-rules --no-extensions --extension ${cfg.extension} \"/weconverge reset\"`;
    const promptPath = path.join(runDir,'PROMPT.md');
    const trialCmd = `omp -p --no-session --mode json --model ${cfg.model} --thinking ${cfg.thinking||cfg.effort} --max-time ${cfg.max_time} --auto-approve --approval-mode ${cfg.approval_mode} --no-extensions --extension ${cfg.extension} @${promptPath}`;
    const plan = {
      run_id: run.run_id,
      instance_id: run.instance_id,
      arm: run.arm,
      index: run.index,
      dry_run: true,
      read_only: true,
      would_stage: wouldStage,
      would_skip_finalized: finalized,
      control_on_off: finalized ? null : controlOnOff,
      trial_command: finalized ? null : trialCmd,
      control_reset: finalized ? null : controlReset,
      note: finalized ? 'would skip (already finalized, never retry)' : 'would stage if needed, apply arm via control, run trial, capture patch/final-answer, finalize anonymously'
    };
    console.log(JSON.stringify({ dry_run_plan: plan },null,2));
    const afterRuns = fs.existsSync(RUNS_ROOT) ? fs.readdirSync(RUNS_ROOT).sort() : [];
    if(JSON.stringify(beforeRuns)!==JSON.stringify(afterRuns)){
      console.error(`dry-run invariant violation: run directories changed before ${JSON.stringify(beforeRuns)} after ${JSON.stringify(afterRuns)}`);
      process.exit(2);
    }
    console.log(JSON.stringify({ dry_run_invariant: 'pass', before: beforeRuns, after: afterRuns, no_mutation: true },null,2));
    return;
  }
  if(!runId) usage();
  const { cfg, sched } = verifyScheduleConfigOrThrow();
  const run = sched.runs.find(r=>r.run_id===runId);
  if(!run){ console.error(`run_id not found: ${runId}`); process.exit(2); }
  const runDir = path.join(RUNS_ROOT, runId);
  // if finalized, skip idempotently (never retry a model run)
  const gradingPath = path.join(runDir,'grading.json');
  const anonPath = path.join(runDir,'result-anon.json');
  if(fs.existsSync(gradingPath) && fs.existsSync(anonPath)){
    console.log(JSON.stringify({ run_id: runId, skipped:true, reason:'already finalized', grading: gradingPath },null,2));
    return;
  }
  // refuse reused dirty unstaged directories before agent execution
  let needStage = false;
  if(!fs.existsSync(runDir)){
    needStage = true;
  } else {
    const entries = fs.readdirSync(runDir);
    const hasMeta = fs.existsSync(path.join(runDir,'meta.json'));
    const hasPrompt = fs.existsSync(path.join(runDir,'PROMPT.md'));
    if(entries.length>0 && (!hasMeta || !hasPrompt)){
      console.error(`refusing dirty unstaged directory before agent execution: ${runDir}`);
      process.exit(2);
    }
    if(entries.length===0) needStage = true;
    else if(!hasMeta || !hasPrompt) needStage = true;
  }
  if(needStage){
    console.log(`staging ${runId}...`);
    cmdStage(runId);
  }
  // verify no arm leak after stage
  const promptTxt = fs.readFileSync(path.join(runDir,'PROMPT.md'),'utf-8');
  assertNoArmLeakInText(promptTxt, 'PROMPT.md');
  // apply arm via control
  const armVerb = run.arm === 'ON' ? 'on' : 'off';
  console.log(`applying arm ${run.arm} via control ${armVerb}...`);
  runControlVerb(armVerb, cfg, false);
  // trial invocation — use official --mode json for deterministic usage capture (per-run, not global)
  const promptPath = path.join(runDir,'PROMPT.md');
  const repoDir = path.join(runDir,'repo');
  const cwd = fs.existsSync(repoDir) ? repoDir : runDir;
  let exitCode = 0;
  let durationMs = 0;
  {
    const trialArgs = ['-p','--no-session','--mode','json','--model', cfg.model,'--thinking', cfg.thinking||cfg.effort,'--max-time', cfg.max_time,'--auto-approve','--approval-mode', cfg.approval_mode,'--no-extensions','--extension', cfg.extension, `@${promptPath}`];
    console.log(`running trial ${runId} with omp --mode json...`);
    const start = Date.now();
    const trialRes = spawnSync('omp', trialArgs, { encoding:'utf-8', timeout: 35*60*1000, cwd, windowsHide: true, maxBuffer: 20*1024*1024 });
    durationMs = Date.now() - start;
    exitCode = trialRes.status === null ? 2 : trialRes.status;
    // persist raw event stream per-run (deterministic, rejected cross-run/global)
    const rawJsonl = trialRes.stdout || '';
    const rawStderr = trialRes.stderr || '';
    const ompJsonlPath = path.join(runDir,'omp.jsonl');
    try{ fs.writeFileSync(ompJsonlPath, rawJsonl, 'utf-8'); }catch{}
    if(rawStderr) fs.writeFileSync(path.join(runDir,'omp.stderr.txt'), rawStderr, 'utf-8');
    // also persist stderr to console for visibility
    if(trialRes.stdout) process.stdout.write(trialRes.stdout.slice(0, 4000));
    if(trialRes.stderr) process.stderr.write(trialRes.stderr.slice(0, 4000));
    // derive final answer text from jsonl if not already materialized by extension
    let derived = null;
    try{ derived = extractFinalAnswerFromJsonl(rawJsonl); }catch{}
    if(derived && derived.trim().length>0){
      const faPath = path.join(runDir,'final-answer.txt');
      if(!fs.existsSync(faPath) || fs.readFileSync(faPath,'utf-8').trim().length===0 || fs.readFileSync(faPath,'utf-8').includes('missing final answer')){
        try{ fs.writeFileSync(faPath, derived, 'utf-8'); }catch{}
      }
    }
    console.log(`trial exit ${exitCode} duration ${durationMs}ms (json events ${rawJsonl.split('\n').filter(l=>l.trim()).length})`);
  }
  // capture final answer path (runDir/final-answer.txt or PROMPT fallback)
  let finalAnswerPath = path.join(runDir,'final-answer.txt');
  if(!fs.existsSync(finalAnswerPath)){
    fs.writeFileSync(finalAnswerPath, `missing final answer for ${runId} exit ${exitCode}`, 'utf-8');
  }
  // apply reset control
  console.log(`resetting via control reset...`);
  runControlVerb('reset', cfg, false);
  // capture (includes patch hash/status and anonymization)
  cmdCapture(runId, exitCode, durationMs, finalAnswerPath);
  if(exitCode!==0){
    console.log(`trial ${runId} recorded failure exit ${exitCode} — not retrying`);
  }
}
function cmdExecuteAll(dryRun){
  if(dryRun){
    const beforeRuns = fs.existsSync(RUNS_ROOT) ? fs.readdirSync(RUNS_ROOT).sort() : [];
    const { cfg, sched } = verifyScheduleConfigOrThrow();
    const sorted = [...sched.runs].sort((a,b)=>a.index-b.index);
    const plan = [];
    for(const run of sorted){
      const runDir = path.join(RUNS_ROOT, run.run_id);
      const finalized = fs.existsSync(path.join(runDir,'grading.json')) && fs.existsSync(path.join(runDir,'result-anon.json'));
      if(finalized){
        plan.push({ run_id: run.run_id, index: run.index, instance_id: run.instance_id, arm: run.arm, action: 'skip (already finalized)' });
        continue;
      }
      const wouldStage = !fs.existsSync(runDir) || fs.readdirSync(runDir).length===0;
      const armVerb = run.arm === 'ON' ? 'on' : 'off';
      plan.push({ run_id: run.run_id, index: run.index, instance_id: run.instance_id, arm: run.arm, action: wouldStage ? 'would stage, control '+armVerb+', trial, capture' : 'would control '+armVerb+', trial, capture' });
    }
    console.log(JSON.stringify({ dry_run_plan_all: plan, total: sorted.length, read_only: true },null,2));
    const afterRuns = fs.existsSync(RUNS_ROOT) ? fs.readdirSync(RUNS_ROOT).sort() : [];
    if(JSON.stringify(beforeRuns)!==JSON.stringify(afterRuns)){
      console.error(`dry-run invariant violation execute-all: before ${JSON.stringify(beforeRuns)} after ${JSON.stringify(afterRuns)}`);
      process.exit(2);
    }
    console.log(JSON.stringify({ dry_run_invariant: 'pass', before: beforeRuns, after: afterRuns, no_mutation: true },null,2));
    // additionally verify controller can report next run
    const next = sorted.find(r=> {
      const d=path.join(RUNS_ROOT,r.run_id);
      return !(fs.existsSync(path.join(d,'grading.json')) && fs.existsSync(path.join(d,'result-anon.json')));
    });
    if(next) console.log(JSON.stringify({ resume_next: { run_id: next.run_id, index: next.index } },null,2));
    return;
  }
  const { cfg, sched } = verifyScheduleConfigOrThrow();
  const sorted = [...sched.runs].sort((a,b)=>a.index-b.index);
  let overallControllerFailure = false;
  for(const run of sorted){
    const runDir = path.join(RUNS_ROOT, run.run_id);
    const gradingPath = path.join(runDir,'grading.json');
    const anonPath = path.join(runDir,'result-anon.json');
    if(fs.existsSync(gradingPath) && fs.existsSync(anonPath)){
      console.log(`skip finalized ${run.run_id} index ${run.index}`);
      continue;
    }
    try{
      console.log(`=== execute ${run.run_id} index ${run.index} ${run.instance_id} ===`);
      cmdExecute(run.run_id, false);
    }catch(e){
      console.error(`controller/invariant failure for ${run.run_id}: ${String(e.message||e).slice(0,500)}`);
      overallControllerFailure = true;
      break;
    }
  }
  if(overallControllerFailure){
    console.error('execute-all stopped on controller/invariant failure');
    process.exit(2);
  } else {
    console.log(JSON.stringify({ execute_all:true, completed:true, dry_run: !!dryRun },null,2));
  }
}
function cmdProbeUsage(correlation, promptText, outDir){
  const cfg = loadExecution();
  const corr = correlation || `probe-${Date.now().toString(16)}-${Math.random().toString(16).slice(2,8)}`;
  const prompt = promptText || `Probe correlation ${corr}: Say hello in one word and repeat the correlation.`;
  const targetDir = outDir ? path.resolve(outDir) : path.join(RUNS_ROOT, `probe-${corr}`);
  fs.mkdirSync(targetDir, { recursive:true });
  const promptWithCor = `${prompt}`;
  const tmpPromptPath = path.join(targetDir, 'PROMPT.md');
  fs.writeFileSync(tmpPromptPath, promptWithCor, 'utf-8');
  const probeArgs = ['-p','--no-session','--mode','json','--model', cfg.model,'--thinking','minimal','--max-time','20s','--no-skills','--no-rules','--no-extensions','--extension', cfg.extension, `@${tmpPromptPath}`];
  console.log(`probe correlation ${corr} with model ${cfg.model} --mode json`);
  const start = Date.now();
  const res = spawnSync('omp', probeArgs, { encoding:'utf-8', timeout: 30000, windowsHide:true, maxBuffer: 10*1024*1024 });
  const durationMs = Date.now() - start;
  const exitCode = res.status === null ? 2 : res.status;
  const jsonl = res.stdout || '';
  const stderr = res.stderr || '';
  const jsonlPath = path.join(targetDir,'omp.jsonl');
  fs.writeFileSync(jsonlPath, jsonl, 'utf-8');
  if(stderr) fs.writeFileSync(path.join(targetDir,'omp.stderr.txt'), stderr, 'utf-8');
  const jsonlSha = crypto.createHash('sha256').update(jsonl,'utf-8').digest('hex');
  // parse usage deterministically per-run (reject global)
  const agg = parseOmpJsonlUsage(jsonlPath, jsonl);
  const normalized = buildNormalizedUsage(agg, { jsonl_sha256: jsonlSha, jsonl_path: path.relative(ROOT, jsonlPath), correlation: corr });
  fs.writeFileSync(path.join(targetDir,'usage.json'), JSON.stringify(normalized,null,2));
  // also write a small evidence packet
  const derived = extractFinalAnswerFromJsonl(jsonl);
  const evidence = {
    correlation: corr,
    prompt: promptWithCor,
    exit_code: exitCode,
    duration_ms: durationMs,
    jsonl_path: path.relative(ROOT, jsonlPath),
    jsonl_sha256: jsonlSha,
    jsonl_bytes: Buffer.byteLength(jsonl,'utf-8'),
    jsonl_lines: jsonl.split('\n').filter(l=>l.trim()).length,
    derived_answer: derived ? derived.slice(0, 400) : null,
    usage: normalized,
    official_source: normalized.source,
    source_gaps: normalized.source_gaps
  };
  fs.writeFileSync(path.join(targetDir,'probe.json'), JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({ probe_correlation: corr, exit_code: exitCode, duration_ms: durationMs, jsonl: path.relative(ROOT, jsonlPath), usage: normalized, derived_answer: derived ? derived.slice(0,200) : null }, null, 2));
  if(exitCode!==0){
    console.error(`probe exit ${exitCode}`);
    process.exit(2);
  }
  // verify persisted numbers match official source: raw sum vs normalized
  const check = agg;
  console.log(JSON.stringify({ probe_verified:true, correlation: corr, input: check.input, cached_input: check.cached_input, output: check.output, total: check.total, provenance: normalized.provenance },null,2));
  return evidence;
}
const args = process.argv.slice(2);
const cmd = args[0];
if(cmd==='preflight'){
  cmdPreflight();
} else if(cmd==='stage'){
  const idx = args.indexOf('--run');
  if(idx===-1 || !args[idx+1]) usage();
  cmdStage(args[idx+1]);
} else if(cmd==='finalize'){
  const rIdx = args.indexOf('--run');
  const pIdx = args.indexOf('--result');
  if(rIdx===-1 || pIdx===-1 || !args[rIdx+1] || !args[pIdx+1]) usage();
  cmdFinalize(args[rIdx+1], args[pIdx+1]);
} else if(cmd==='capture'){
  const rIdx = args.indexOf('--run');
  const eIdx = args.indexOf('--exit-code');
  const dIdx = args.indexOf('--duration-ms');
  const fIdx = args.indexOf('--final-answer');
  if(rIdx===-1 || eIdx===-1 || dIdx===-1 || fIdx===-1 || !args[rIdx+1] || !args[eIdx+1] || !args[dIdx+1] || !args[fIdx+1]) usage();
  cmdCapture(args[rIdx+1], args[eIdx+1], args[dIdx+1], args[fIdx+1]);
} else if(cmd==='execute'){
  const idx = args.indexOf('--run');
  if(idx===-1 || !args[idx+1]) usage();
  const dry = args.includes('--dry-run');
  cmdExecute(args[idx+1], dry);
} else if(cmd==='execute-all'){
  const dry = args.includes('--dry-run');
  cmdExecuteAll(dry);
} else if(cmd==='probe-usage'){
  const cIdx = args.indexOf('--correlation');
  const pIdx = args.indexOf('--prompt');
  const oIdx = args.indexOf('--out-dir');
  const corr = cIdx!==-1 ? args[cIdx+1] : null;
  const prompt = pIdx!==-1 ? args[pIdx+1] : null;
  const outDir = oIdx!==-1 ? args[oIdx+1] : null;
  cmdProbeUsage(corr, prompt, outDir);
} else {
  usage();
}
