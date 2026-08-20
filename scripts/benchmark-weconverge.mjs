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
  // validate schedule immutability already done
  // build anonymous result
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
    submitted_at: new Date().toISOString()
  };
  const resultStr = JSON.stringify(resultAnon);
  assertNoArmLeakInText(resultStr, 'result-anon');
  const anonPath = path.join(runDir,'result-anon.json');
  fs.writeFileSync(anonPath, JSON.stringify(resultAnon,null,2));
  // also finalize grading.json for compatibility (anonymous)
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
    }
  };
  assertNoArmLeakInText(JSON.stringify(grading), 'grading');
  fs.writeFileSync(path.join(runDir,'grading.json'), JSON.stringify(grading,null,2));
  // controller-only metadata outside grading (may contain arm)
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
    captured_at: resultAnon.submitted_at
  };
  fs.writeFileSync(path.join(runDir,'controller.json'), JSON.stringify(controllerMeta,null,2));
  console.log(JSON.stringify({ run_id: runId, captured:true, exit_code: ec, duration_ms: dm, patch_sha256: patchInfo.patch_sha256, final_answer_sha256: finalAnswerSha, anon: anonPath, grading: path.join(runDir,'grading.json') },null,2));
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
  runControlVerb(armVerb, cfg, dryRun);
  // trial invocation
  const promptPath = path.join(runDir,'PROMPT.md');
  const repoDir = path.join(runDir,'repo');
  const cwd = fs.existsSync(repoDir) ? repoDir : runDir;
  let exitCode = 0;
  let durationMs = 0;
  if(dryRun){
    console.log(`[dry-run] trial for ${runId} skipped, simulating exit 0`);
    // simulate a patch by ensuring repo diff exists if repo present
    // create dummy final-answer if not exists
    const destFinal = path.join(runDir,'final-answer.txt');
    if(!fs.existsSync(destFinal)){
      fs.writeFileSync(destFinal, `dry-run final answer for ${runId}`, 'utf-8');
    }
    // ensure patch.diff exists via git artifacts (may be empty)
    // touch a change to produce status if needed? keep existing
    exitCode = 0;
    durationMs = 1000;
  } else {
    const trialArgs = ['-p','--no-session','--model', cfg.model,'--thinking', cfg.thinking||cfg.effort,'--max-time', cfg.max_time,'--auto-approve','--approval-mode', cfg.approval_mode,'--no-extensions','--extension', cfg.extension, `@${promptPath}`];
    console.log(`running trial ${runId} with omp...`);
    const start = Date.now();
    const trialRes = spawnSync('omp', trialArgs, { encoding:'utf-8', timeout: 35*60*1000, cwd, windowsHide: true, maxBuffer: 20*1024*1024 });
    durationMs = Date.now() - start;
    exitCode = trialRes.status === null ? 2 : trialRes.status;
    // stream logs already captured in trialRes stdout/stderr; print to supervisor
    if(trialRes.stdout) process.stdout.write(trialRes.stdout);
    if(trialRes.stderr) process.stderr.write(trialRes.stderr);
    console.log(`trial exit ${exitCode} duration ${durationMs}ms`);
    // invariant: never retry model run even if failure — record it
  }
  // capture final answer path (runDir/final-answer.txt or PROMPT fallback)
  let finalAnswerPath = path.join(runDir,'final-answer.txt');
  if(!fs.existsSync(finalAnswerPath)){
    // try to produce from trial output? In real run agent should have produced file; in dry-run we created.
    // if still missing, create empty placeholder to allow capture to proceed and record failure
    fs.writeFileSync(finalAnswerPath, `missing final answer for ${runId} exit ${exitCode}`, 'utf-8');
  }
  // apply reset control
  console.log(`resetting via control reset...`);
  runControlVerb('reset', cfg, dryRun);
  // capture (includes patch hash/status and anonymization)
  cmdCapture(runId, exitCode, durationMs, finalAnswerPath);
  // exit semantics: individual task failure is recorded and execute-all continues; controller failure exits nonzero
  // For single execute, we still exit 0 even if trial failed, but log it. The capture records exit_code.
  if(exitCode!==0){
    console.log(`trial ${runId} recorded failure exit ${exitCode} — not retrying`);
  }
}

function cmdExecuteAll(dryRun){
  const { cfg, sched } = verifyScheduleConfigOrThrow();
  // walk frozen schedule sequentially in index order
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
      cmdExecute(run.run_id, dryRun);
    }catch(e){
      // cmdExecute already exits 2 on controller failure; but if it throws, treat as controller failure
      console.error(`controller/invariant failure for ${run.run_id}: ${String(e.message||e).slice(0,500)}`);
      overallControllerFailure = true;
      break;
    }
    // after cmdExecute, check if it exited via process.exit on controller failure — we would have terminated.
    // If trial failure, continue.
  }
  if(overallControllerFailure){
    console.error('execute-all stopped on controller/invariant failure');
    process.exit(2);
  } else {
    console.log(JSON.stringify({ execute_all:true, completed:true, dry_run: !!dryRun },null,2));
  }
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
} else {
  usage();
}
