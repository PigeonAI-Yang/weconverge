#!/usr/bin/env node
// WEConverge paired benchmark controller — boring Node ESM, stdlib only
// Commands: preflight, stage --run <opaque-id>, finalize --run <opaque-id> --result <path>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_PATH = path.join(ROOT, 'benchmark', 'corpus.json');
const SCHEDULE_PATH = path.join(ROOT, 'benchmark', 'schedule.json');
const RUNS_ROOT = path.join(ROOT, 'benchmark', 'runs');

function usage(exitCode=1){
  console.error(`Usage:
  node scripts/benchmark-weconverge.mjs preflight
  node scripts/benchmark-weconverge.mjs stage --run <opaque-id>
  node scripts/benchmark-weconverge.mjs finalize --run <opaque-id> --result <path>
`);
  process.exit(exitCode);
}

function loadJson(p){
  if(!fs.existsSync(p)) throw new Error(`missing ${p}`);
  return JSON.parse(fs.readFileSync(p,'utf-8'));
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

function cmdPreflight(){
  const tools = {};
  tools.git = checkTool('git', ['--version']);
  tools.node = { available:true, version: process.version };
  tools.omp = checkTool('omp', ['--version']);
  tools.docker = checkTool('docker', ['--version']);
  tools.wsl = checkTool('wsl', ['--status']);
  // check corpus/schedule existence
  tools.corpus = fs.existsSync(CORPUS_PATH) ? { available:true } : { available:false };
  tools.schedule = fs.existsSync(SCHEDULE_PATH) ? { available:true } : { available:false };
  const out = {
    timestamp: new Date().toISOString(),
    tools,
    note: 'preflight records availability but does not install anything'
  };
  console.log(JSON.stringify(out,null,2));
  // also write to benchmark/preflight.json if runs root exists
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
  // non-destructive: refuse dirty/reused
  if(fs.existsSync(runDir)){
    const entries = fs.readdirSync(runDir);
    if(entries.length>0){
      console.error(`refusing dirty/reused run directory: ${runDir} contains ${entries.length} entries`);
      process.exit(2);
    }
  }
  fs.mkdirSync(runDir, { recursive:true });
  // verify empty after mkdir
  // write instance.json without patch/test_patch exposure
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
  // emit agent prompt file with exact problem statement and no condition label
  const prompt = instance.problem_statement;
  // Ensure no arm leakage: do not include run.arm anywhere
  const promptContent = `# Task: ${instance.instance_id}\n\n${prompt}\n`;
  fs.writeFileSync(path.join(runDir,'PROMPT.md'), promptContent, 'utf-8');
  // also write raw problem_statement for hash verification
  fs.writeFileSync(path.join(runDir,'problem_statement.txt'), prompt, 'utf-8');
  // meta without arm
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
  fs.writeFileSync(path.join(runDir,'meta.json'), JSON.stringify(meta,null,2));

  // Attempt isolated checkout (best-effort); truthfully record status
  const cloneStatus = { attempted:true, repo: instance.repo, base_commit: instance.base_commit, success:false, reason:'' };
  const gitCheck = checkTool('git',['--version']);
  if(!gitCheck.available){
    cloneStatus.reason = 'git not available';
  } else {
    const repoUrl = `https://github.com/${instance.repo}.git`;
    const repoDir = path.join(runDir,'repo');
    // ensure repoDir not exist
    if(fs.existsSync(repoDir)){
      cloneStatus.reason = 'repo dir already exists';
    } else {
      // try shallow clone with timeout 30s
      const cloneRes = spawnSync('git',['clone','--depth','1', repoUrl, repoDir], { encoding:'utf-8', timeout: 30000, windowsHide:true });
      if(cloneRes.status!==0){
        cloneStatus.reason = `clone failed: ${(cloneRes.stderr||cloneRes.stdout||'').trim().slice(0,500)}`;
        // clean partial dir if exists
        try{ if(fs.existsSync(repoDir)) fs.rmSync(repoDir,{recursive:true, force:true}); }catch{}
      } else {
        // try fetch base_commit
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
          // if base_commit already equals depth 1 HEAD, we may be ok
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
    // Do not exit non-zero for smoke; still staged prompt. Truthful blocked is recorded in clone-status.json
    // For strict interpretation, we still succeed staging of prompt area.
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
  // Validate result is not empty and does not contain arm label injection? Just store.
  // Create anonymous grading input without arm disclosure
  let parsed;
  try{ parsed = JSON.parse(resultContent); }catch{ parsed = resultContent; }
  // Ensure no arm leakage: grading file must NOT contain run.arm
  const grading = {
    run_id: run.run_id,
    instance_id: run.instance_id,
    repeat: run.repeat,
    index: run.index,
    submitted_at: new Date().toISOString(),
    result: parsed
  };
  // Double-check no OFF/ON leakage via arm field
  if('arm' in grading) delete grading.arm;
  const gradingPath = path.join(runDir,'grading.json');
  // refuse overwrite if exists? Allow finalize to be idempotent? Spec says runtime outputs under ignored runs; we allow overwrite but warn
  if(fs.existsSync(gradingPath)){
    console.error(`grading already exists for ${runId} — overwriting`);
  }
  fs.writeFileSync(gradingPath, JSON.stringify(grading,null,2));
  // Also create anonymized result copy at benchmark/runs/<run_id>/result-anon.json without arm
  console.log(JSON.stringify({ run_id: runId, finalized:true, grading: gradingPath },null,2));
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
} else {
  usage();
}
